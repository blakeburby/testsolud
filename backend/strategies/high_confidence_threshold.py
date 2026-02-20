"""
High-Confidence Threshold Strategy — YES and NO contracts

Trades Kalshi 15-minute SOL/USD binary markets in BOTH directions when the
Monte Carlo model reaches ≥95% conviction on one side and the market is
pricing it meaningfully wrong.

Entry Conditions (ALL must be met):
1. Model conviction ≥ 95%  (p_true ≥ 0.95 for YES, ≤ 0.05 for NO)
2. Edge ≥ 5%               (model_prob − market_price on the chosen side)
3. Time window: 30 s – 10 min remaining
4. No volatility spike     (current EWMA vol < 2× recent average)
5. All risk gates clear

Sizing: 15% Kelly with hard floor (0.5% bankroll) and hard ceiling (2% bankroll).
Additional 50% haircut when risk/reward > 5:1.
"""
import numpy as np
from typing import Optional, List, Tuple
from scipy.stats import norm
from datetime import datetime

from strategies.base import BaseStrategy
from models.market import Market, Orderbook
from models.strategy import StrategySignal, SignalDirection, SignalStrength
from models.config import StrategyConfig


class HighConfidenceThresholdStrategy(BaseStrategy):
    """95%+ conviction threshold strategy — trades both YES and NO contracts."""

    def __init__(self, config: StrategyConfig):
        super().__init__(config)

        params = config.params

        # ── Threshold parameters ──────────────────────────────────────────────
        # For YES: p_true ≥ min_probability
        # For NO:  p_true ≤ (1 − min_probability)  →  implied NO prob ≥ 95%
        self.min_probability: float = params.get("min_probability_threshold", 0.95)
        self.min_edge: float = params.get("min_edge_threshold", 0.05)

        # ── Time window ───────────────────────────────────────────────────────
        self.min_time_remaining: int = params.get("min_time_remaining", 30)    # 30 s
        self.max_time_remaining: int = params.get("max_time_remaining", 600)   # 10 min

        # ── Volatility parameters ─────────────────────────────────────────────
        self.vol_lambda: float = params.get("vol_lambda", 0.94)
        self.microstructure_floor: float = params.get("microstructure_floor", 0.0007)
        self.min_samples: int = params.get("min_samples", 5)

        # ── Momentum ──────────────────────────────────────────────────────────
        self.momentum_window: int = params.get("momentum_window", 60)

        # ── Volatility regime ─────────────────────────────────────────────────
        self.vol_regime_lookback: int = params.get("vol_regime_lookback", 300)
        self.vol_spike_threshold: float = params.get("vol_spike_threshold", 2.0)

        # ── Monte Carlo ───────────────────────────────────────────────────────
        self.use_monte_carlo: bool = params.get("use_monte_carlo", False)
        self.num_simulations: int = params.get("num_simulations", 10000)

        # ── Sizing constants ──────────────────────────────────────────────────
        # Overrides config.kelly_fraction for the 15% rule
        self.kelly_fraction: float = params.get("kelly_fraction", 0.15)
        # Hard floor/ceiling as fraction of bankroll
        self.position_floor_pct: float = params.get("position_floor_pct", 0.005)   # 0.5%
        self.position_ceiling_pct: float = params.get("position_ceiling_pct", 0.02) # 2%

        self.logger.info(
            f"Strategy initialised: min_prob={self.min_probability:.0%}, "
            f"min_edge={self.min_edge:.0%}, window=[{self.min_time_remaining}s,"
            f"{self.max_time_remaining}s], kelly={self.kelly_fraction:.0%}"
        )

    # ──────────────────────────────────────────────────────────────────────────
    # Main entry point
    # ──────────────────────────────────────────────────────────────────────────

    async def analyze(
        self,
        market: Market,
        current_price: float,
        price_history: List[dict],
        orderbook: Optional[Orderbook] = None,
    ) -> Optional[StrategySignal]:
        """
        Evaluate market for a YES or NO signal.

        Flow:
        1. Pre-filter (tradeable, time window, data)
        2. EWMA volatility + microstructure floor
        3. Volatility regime filter
        4. Momentum drift
        5. True probability (closed-form or Monte Carlo)
        6. Check YES signal (p_true ≥ 95%, edge ≥ 5%)
        7. Check NO signal  (p_true ≤ 5%, edge ≥ 5%)
        8. Size and return the better signal (or None)
        """

        # ── 1. Pre-filter ─────────────────────────────────────────────────────

        if not market.is_tradeable:
            return None

        time_remaining = market.time_remaining

        if time_remaining < self.min_time_remaining:
            self.logger.debug(
                f"{market.ticker}: too close to expiry ({time_remaining}s < "
                f"{self.min_time_remaining}s)"
            )
            return None

        if time_remaining > self.max_time_remaining:
            self.logger.debug(
                f"{market.ticker}: too far from expiry ({time_remaining}s > "
                f"{self.max_time_remaining}s)"
            )
            return None

        yes_price = market.yes_price
        no_price = market.no_price
        if yes_price is None or yes_price <= 0 or yes_price >= 1:
            return None
        if no_price is None:
            no_price = 1.0 - yes_price

        if len(price_history) < self.min_samples:
            return None

        # ── 2. Volatility ─────────────────────────────────────────────────────

        volatility = self._calculate_ewma_volatility(price_history)
        if volatility <= 0:
            return None

        T_years = time_remaining / (365.25 * 24 * 3600)
        if T_years <= 0:
            return None
        vol_floor = self.microstructure_floor / np.sqrt(T_years)
        vol_total = max(volatility, vol_floor)

        # ── 3. Vol-spike filter ───────────────────────────────────────────────

        if self._detect_volatility_spike(price_history):
            self.logger.info(f"{market.ticker}: volatility clustering — skipping")
            return None

        # ── 4. Momentum drift ─────────────────────────────────────────────────

        momentum_drift = self._calculate_momentum_drift(price_history, current_price)

        # ── 5. True probability ───────────────────────────────────────────────

        if self.use_monte_carlo:
            true_prob = self._monte_carlo_probability(
                S0=current_price, K=market.strike_price,
                T=T_years, sigma=vol_total, mu=momentum_drift,
            )
        else:
            true_prob = self._calculate_probability_closed_form(
                S0=current_price, K=market.strike_price,
                T=T_years, sigma=vol_total, mu=momentum_drift,
            )

        # ── 6 & 7. Check YES and NO signals ───────────────────────────────────

        yes_signal = self._evaluate_yes(
            true_prob, yes_price, market, time_remaining, vol_total,
            momentum_drift, current_price, orderbook,
        )
        no_signal = self._evaluate_no(
            true_prob, no_price, market, time_remaining, vol_total,
            momentum_drift, current_price, orderbook,
        )

        # Return the signal with larger edge (ties go to YES)
        if yes_signal and no_signal:
            return yes_signal if yes_signal.edge >= no_signal.edge else no_signal
        return yes_signal or no_signal

    # ──────────────────────────────────────────────────────────────────────────
    # Signal evaluation helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _evaluate_yes(
        self,
        true_prob: float,
        yes_price: float,
        market: Market,
        time_remaining: int,
        vol_total: float,
        momentum_drift: float,
        current_price: float,
        orderbook: Optional[Orderbook],
    ) -> Optional[StrategySignal]:
        """
        YES signal: model says ≥95% chance the contract finishes in-the-money.
        Edge = model_probability − YES_market_price.
        """
        if true_prob < self.min_probability:
            return None

        edge = true_prob - yes_price
        if edge < self.min_edge:
            return None

        quantity = self._calculate_position_size(
            edge=edge,
            bankroll=self.config.bankroll,
            market_price=yes_price,
        )
        if quantity <= 0:
            return None

        recommended_price = self._get_optimal_price(SignalDirection.YES, market, orderbook)
        strength = self._categorize_strength(edge)

        self.logger.warning(
            f"🎯 YES SIGNAL {market.ticker}: prob={true_prob:.1%} "
            f"edge={edge:.1%} qty={quantity} price={yes_price:.2f}"
        )

        return self._create_signal(
            market=market,
            direction=SignalDirection.YES,
            strength=strength,
            true_probability=true_prob,
            market_probability=yes_price,
            recommended_quantity=quantity,
            recommended_price=recommended_price,
            reasoning=(
                f"YES signal: model={true_prob:.1%}, market={yes_price:.1%}, "
                f"edge={edge:.1%}, vol={vol_total:.3f}, "
                f"time={time_remaining/60:.1f}min, drift={momentum_drift:.4f}"
            ),
            metrics={
                "direction": "YES",
                "model_probability": true_prob,
                "market_probability": yes_price,
                "edge": edge,
                "volatility": vol_total,
                "time_remaining_seconds": time_remaining,
                "strike_price": market.strike_price,
                "current_price": current_price,
                "momentum_drift": momentum_drift,
                "risk_amount": quantity * yes_price,
                "reward_potential": quantity * (1 - yes_price),
                "risk_reward_ratio": yes_price / (1 - yes_price) if yes_price < 1 else float("inf"),
            },
        )

    def _evaluate_no(
        self,
        true_prob: float,
        no_price: float,
        market: Market,
        time_remaining: int,
        vol_total: float,
        momentum_drift: float,
        current_price: float,
        orderbook: Optional[Orderbook],
    ) -> Optional[StrategySignal]:
        """
        NO signal: model says ≤5% chance the contract finishes YES
        (i.e., ≥95% chance it finishes NO).
        Edge = (1 − model_probability) − NO_market_price.
        """
        implied_no_prob = 1.0 - true_prob
        if implied_no_prob < self.min_probability:
            return None

        edge = implied_no_prob - no_price
        if edge < self.min_edge:
            return None

        quantity = self._calculate_position_size(
            edge=edge,
            bankroll=self.config.bankroll,
            market_price=no_price,
        )
        if quantity <= 0:
            return None

        recommended_price = self._get_optimal_price(SignalDirection.NO, market, orderbook)
        strength = self._categorize_strength(edge)

        self.logger.warning(
            f"🎯 NO SIGNAL {market.ticker}: implied_no={implied_no_prob:.1%} "
            f"edge={edge:.1%} qty={quantity} price={no_price:.2f}"
        )

        return self._create_signal(
            market=market,
            direction=SignalDirection.NO,
            strength=strength,
            true_probability=implied_no_prob,
            market_probability=no_price,
            recommended_quantity=quantity,
            recommended_price=recommended_price,
            reasoning=(
                f"NO signal: implied_no={implied_no_prob:.1%}, market={no_price:.1%}, "
                f"edge={edge:.1%}, vol={vol_total:.3f}, "
                f"time={time_remaining/60:.1f}min, drift={momentum_drift:.4f}"
            ),
            metrics={
                "direction": "NO",
                "model_probability": implied_no_prob,
                "market_probability": no_price,
                "edge": edge,
                "volatility": vol_total,
                "time_remaining_seconds": time_remaining,
                "strike_price": market.strike_price,
                "current_price": current_price,
                "momentum_drift": momentum_drift,
                "risk_amount": quantity * no_price,
                "reward_potential": quantity * (1 - no_price),
                "risk_reward_ratio": no_price / (1 - no_price) if no_price < 1 else float("inf"),
            },
        )

    # ──────────────────────────────────────────────────────────────────────────
    # Quant helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _calculate_ewma_volatility(self, price_history: List[dict]) -> float:
        if len(price_history) < 2:
            return 0.0
        sorted_prices = sorted(price_history, key=lambda p: p.get("time", p.get("timestamp", 0)))
        prices = np.array([p["price"] for p in sorted_prices])
        log_returns = np.diff(np.log(prices))
        if len(log_returns) == 0:
            return 0.0
        variance = 0.0
        for r in log_returns[::-1]:
            variance = self.vol_lambda * variance + (1 - self.vol_lambda) * r ** 2
        return float(np.sqrt(variance * 31_557_600))  # annualised

    def _calculate_momentum_drift(self, price_history: List[dict], current_price: float) -> float:
        if len(price_history) < 2:
            return 0.0
        now = max(p.get("time", p.get("timestamp", 0)) for p in price_history)
        cutoff = now - self.momentum_window * 1000
        recent = [p for p in price_history if p.get("time", p.get("timestamp", 0)) >= cutoff]
        if len(recent) < 2:
            return 0.0
        sorted_recent = sorted(recent, key=lambda p: p.get("time", p.get("timestamp", 0)))
        prices = np.array([p["price"] for p in sorted_recent])
        log_returns = np.diff(np.log(prices))
        return float(np.mean(log_returns) * 31_557_600)  # annualised

    def _detect_volatility_spike(self, price_history: List[dict]) -> bool:
        if len(price_history) < 20:
            return False
        now = max(p.get("time", p.get("timestamp", 0)) for p in price_history)
        cutoff = now - self.vol_regime_lookback * 1000
        recent = [p for p in price_history if p.get("time", p.get("timestamp", 0)) >= cutoff]
        if len(recent) < 10:
            return False
        sorted_prices = sorted(recent, key=lambda p: p.get("time", p.get("timestamp", 0)))
        prices = np.array([p["price"] for p in sorted_prices])
        log_returns = np.diff(np.log(prices))
        if len(log_returns) < 5:
            return False
        split = int(len(log_returns) * 0.8)
        recent_vol = np.std(log_returns[split:])
        hist_vol = np.std(log_returns[:split])
        if hist_vol > 0 and recent_vol / hist_vol > self.vol_spike_threshold:
            return True
        return False

    def _calculate_probability_closed_form(
        self, S0: float, K: float, T: float, sigma: float, mu: float = 0.0
    ) -> float:
        if T <= 0 or sigma <= 0 or S0 <= 0 or K <= 0:
            return 0.5
        d = (np.log(S0 / K) + (mu - 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
        return float(max(0.001, min(0.999, norm.cdf(d))))

    def _monte_carlo_probability(
        self, S0: float, K: float, T: float, sigma: float, mu: float = 0.0
    ) -> float:
        if T <= 0 or sigma <= 0 or S0 <= 0 or K <= 0:
            return 0.5
        Z = np.random.standard_normal(self.num_simulations)
        S_T = S0 * np.exp((mu - 0.5 * sigma ** 2) * T + sigma * np.sqrt(T) * Z)
        return float(max(0.001, min(0.999, np.mean(S_T > K))))

    def _categorize_strength(self, edge: float) -> SignalStrength:
        if edge >= 0.10:
            return SignalStrength.HIGH
        elif edge >= 0.07:
            return SignalStrength.MEDIUM
        return SignalStrength.LOW

    def _calculate_position_size(
        self,
        edge: float,
        bankroll: float,
        market_price: float,
    ) -> int:
        """
        15% Kelly with asymmetric haircut, hard floor, and hard ceiling.

        Full Kelly  = edge / market_price
        Applied     = full_kelly * 0.15
        If R/R > 5:1 → additional 50% haircut → effective ~7.5% Kelly
        Floor       = 0.5% of bankroll
        Ceiling     = 2.0% of bankroll
        """
        if edge <= 0 or market_price <= 0 or market_price >= 1:
            return 0

        full_kelly = edge / market_price
        adjusted = full_kelly * self.kelly_fraction  # 15%

        # Asymmetric payoff haircut (risk/reward > 5:1)
        risk_reward = market_price / (1 - market_price)
        if risk_reward > 5.0:
            adjusted *= 0.5
            self.logger.debug(f"Asymmetric haircut applied: R/R={risk_reward:.1f}x")

        # Dollar allocation
        dollar_allocation = bankroll * adjusted

        # Hard floor: 0.5% of bankroll
        floor_dollars = bankroll * self.position_floor_pct
        dollar_allocation = max(dollar_allocation, floor_dollars)

        # Hard ceiling: 2% of bankroll
        ceiling_dollars = bankroll * self.position_ceiling_pct
        dollar_allocation = min(dollar_allocation, ceiling_dollars)

        quantity = int(dollar_allocation / market_price)
        return max(1, quantity)

    def _get_optimal_price(
        self,
        direction: SignalDirection,
        market: Market,
        orderbook: Optional[Orderbook],
    ) -> Optional[float]:
        if not orderbook:
            return market.yes_price if direction == SignalDirection.YES else market.no_price
        if direction == SignalDirection.YES:
            ask = orderbook.best_yes_ask
            if ask is not None:
                return max(0.01, ask - 0.01)
            return market.yes_price
        else:
            ask = orderbook.best_no_ask
            if ask is not None:
                return max(0.01, ask - 0.01)
            return market.no_price