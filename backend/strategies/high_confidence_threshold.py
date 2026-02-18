"""
High-Confidence Threshold Strategy

A short-duration, high-confidence convexity capture strategy that trades Kalshi
15-minute YES contracts when simulated probability reaches 90%+ AND there is a
meaningful edge (4-5%+) over market price.

Core Principle: This is NOT a directional bet - it's a distribution pricing bet.
The edge rests entirely on whether our volatility estimation and drift assumptions
are more accurate and faster-updating than Kalshi's market participants.

Risk Profile: Asymmetric payoff (risk 90¢ to earn 10¢). Requires high model accuracy
to overcome the 9:1 loss ratio. Break-even win rate must exceed paid price.
"""
import numpy as np
from typing import Optional, List
from scipy.stats import norm
from datetime import datetime

from strategies.base import BaseStrategy
from models.market import Market, Orderbook
from models.strategy import StrategySignal, SignalDirection, SignalStrength
from models.config import StrategyConfig


class HighConfidenceThresholdStrategy(BaseStrategy):
    """
    90%+ probability threshold strategy with strict edge requirements.

    Entry Conditions (ALL must be met):
    1. Model probability ≥ 90%
    2. Edge ≥ 4-5% (model_prob - market_price)
    3. Time remaining: 90 seconds - 14 minutes
    4. No volatility regime clustering
    5. Direction: YES contracts only
    """

    def __init__(self, config: StrategyConfig):
        super().__init__(config)

        # Strategy parameters
        params = config.params

        # Probability and edge thresholds
        self.min_probability = params.get("min_probability_threshold", 0.90)
        self.min_edge = params.get("min_edge_threshold", 0.05)  # 5% minimum edge

        # Time constraints
        self.min_time_remaining = params.get("min_time_remaining", 90)  # 90 seconds minimum
        self.max_time_remaining = params.get("max_time_remaining", 14 * 60)  # 14 minutes max

        # Volatility parameters
        self.vol_lambda = params.get("vol_lambda", 0.94)  # EWMA lambda
        self.microstructure_floor = params.get("microstructure_floor", 0.0007)  # Vol floor
        self.min_samples = params.get("min_samples", 5)  # Minimum price samples

        # Momentum parameters
        self.momentum_window = params.get("momentum_window", 60)  # 60 seconds for momentum

        # Volatility regime detection
        self.vol_regime_lookback = params.get("vol_regime_lookback", 300)  # 5 minutes
        self.vol_spike_threshold = params.get("vol_spike_threshold", 2.0)  # 2x average = spike

        # Monte Carlo simulation (optional, can use closed-form if faster)
        self.use_monte_carlo = params.get("use_monte_carlo", False)
        self.num_simulations = params.get("num_simulations", 10000)

        self.logger.info(
            f"High-confidence strategy initialized: "
            f"min_prob={self.min_probability:.1%}, min_edge={self.min_edge:.1%}, "
            f"time_window=[{self.min_time_remaining}s, {self.max_time_remaining}s]"
        )

    async def analyze(
        self,
        market: Market,
        current_price: float,
        price_history: List[dict],
        orderbook: Optional[Orderbook] = None,
    ) -> Optional[StrategySignal]:
        """
        Analyze market for high-confidence trading opportunities.

        Strategy Flow:
        1. Pre-filter: Check market tradability, time window, data availability
        2. Calculate EWMA volatility with microstructure floor
        3. Detect volatility regime (skip if clustering)
        4. Calculate momentum-adjusted drift
        5. Compute true probability (Monte Carlo or closed-form)
        6. Check if probability ≥ 90% AND edge ≥ threshold
        7. Apply asymmetric risk sizing (fractional Kelly)
        8. Generate signal if all conditions met
        """
        # ========================
        # 1. PRE-FILTERING CHECKS
        # ========================

        if not market.is_tradeable:
            return None

        time_remaining = market.time_remaining

        # Time window filter (avoid gamma explosion zone and excessive uncertainty)
        if time_remaining < self.min_time_remaining:
            self.logger.debug(
                f"Skipping {market.ticker}: too close to expiry "
                f"({time_remaining}s < {self.min_time_remaining}s) - gamma risk too high"
            )
            return None

        if time_remaining > self.max_time_remaining:
            self.logger.debug(
                f"Skipping {market.ticker}: too far from expiry "
                f"({time_remaining}s > {self.max_time_remaining}s)"
            )
            return None

        # Market probability check
        market_prob = market.yes_price
        if market_prob is None or market_prob <= 0 or market_prob >= 1:
            self.logger.warning(f"Invalid market probability: {market_prob}")
            return None

        # Data availability check
        if len(price_history) < self.min_samples:
            self.logger.debug(f"Insufficient price history: {len(price_history)} samples")
            return None

        # ========================
        # 2. VOLATILITY ESTIMATION
        # ========================

        volatility = self._calculate_ewma_volatility(price_history)
        if volatility <= 0:
            self.logger.warning("Invalid volatility calculation")
            return None

        # Apply microstructure floor to prevent false certainty near expiry
        T_years = time_remaining / (365.25 * 24 * 3600)
        vol_floor = self.microstructure_floor / np.sqrt(T_years) if T_years > 0 else self.microstructure_floor
        vol_total = max(volatility, vol_floor)

        # ===========================
        # 3. VOLATILITY REGIME FILTER
        # ===========================

        # Skip trades during volatility clustering events
        if self._detect_volatility_spike(price_history):
            self.logger.info(
                f"Skipping {market.ticker}: volatility clustering detected - model uncertainty too high"
            )
            return None

        # ==========================
        # 4. MOMENTUM-ADJUSTED DRIFT
        # ==========================

        momentum_drift = self._calculate_momentum_drift(price_history, current_price)

        # =========================
        # 5. PROBABILITY ESTIMATION
        # =========================

        if self.use_monte_carlo:
            true_prob = self._monte_carlo_probability(
                S0=current_price,
                K=market.strike_price,
                T=T_years,
                sigma=vol_total,
                mu=momentum_drift,
            )
        else:
            # Use closed-form Black-Scholes approximation (faster)
            true_prob = self._calculate_probability_closed_form(
                S0=current_price,
                K=market.strike_price,
                T=T_years,
                sigma=vol_total,
                mu=momentum_drift,
            )

        # ========================
        # 6. THRESHOLD GATING
        # ========================

        # CRITICAL: Both conditions must be met
        # 1. Probability must be ≥ 90% (high confidence)
        # 2. Edge must be ≥ minimum threshold (meaningful mispricing)

        if true_prob < self.min_probability:
            self.logger.debug(
                f"Probability {true_prob:.1%} below threshold {self.min_probability:.1%}"
            )
            return None

        edge = true_prob - market_prob

        if edge < self.min_edge:
            self.logger.debug(
                f"Edge {edge:.1%} below minimum {self.min_edge:.1%} "
                f"(model={true_prob:.1%}, market={market_prob:.1%})"
            )
            return None

        # ========================
        # 7. SIGNAL GENERATION
        # ========================

        # Only trade YES contracts (as specified in strategy requirements)
        direction = SignalDirection.YES

        # Categorize strength by edge magnitude (above minimum)
        strength = self._categorize_strength(edge)

        # Position sizing with asymmetric risk awareness
        # Risk: market_prob (e.g., 90¢), Reward: 1 - market_prob (e.g., 10¢)
        # Use fractional Kelly to protect against model error
        quantity = self._calculate_position_size(
            edge=edge,
            bankroll=self.config.bankroll,
            market_price=market_prob,
        )

        # Optimal execution price
        recommended_price = self._get_optimal_price(direction, market, orderbook)

        # Reasoning and metrics
        reasoning = (
            f"High-confidence threshold met: model_prob={true_prob:.1%}, "
            f"market_price={market_prob:.1%}, edge={edge:.1%}, "
            f"vol={vol_total:.3f}, time={time_remaining/60:.1f}min, "
            f"momentum_drift={momentum_drift:.4f}"
        )

        metrics = {
            "model_probability": true_prob,
            "market_probability": market_prob,
            "edge": edge,
            "volatility": vol_total,
            "volatility_floor_applied": vol_total == vol_floor,
            "time_remaining_seconds": time_remaining,
            "strike_price": market.strike_price,
            "current_price": current_price,
            "momentum_drift": momentum_drift,
            "risk_amount": quantity * market_prob,
            "reward_potential": quantity * (1 - market_prob),
            "risk_reward_ratio": market_prob / (1 - market_prob) if market_prob < 1 else float('inf'),
        }

        self.logger.warning(
            f"🎯 HIGH-CONFIDENCE SIGNAL: {market.ticker} - "
            f"Prob={true_prob:.1%}, Edge={edge:.1%}, "
            f"Risk=${quantity * market_prob:.2f} to gain ${quantity * (1 - market_prob):.2f}"
        )

        return self._create_signal(
            market=market,
            direction=direction,
            strength=strength,
            true_probability=true_prob,
            market_probability=market_prob,
            recommended_quantity=quantity,
            recommended_price=recommended_price,
            reasoning=reasoning,
            metrics=metrics,
        )

    def _calculate_ewma_volatility(self, price_history: List[dict]) -> float:
        """
        Calculate EWMA volatility from price history.

        Uses exponentially weighted moving average to give more weight to recent
        price movements while maintaining statistical validity.

        Returns: Annualized volatility
        """
        if len(price_history) < 2:
            return 0

        # Sort by timestamp
        sorted_prices = sorted(price_history, key=lambda p: p.get('time', p.get('timestamp', 0)))

        # Calculate log returns
        prices = np.array([p['price'] for p in sorted_prices])
        log_returns = np.diff(np.log(prices))

        if len(log_returns) == 0:
            return 0

        # EWMA variance (weight recent data more heavily)
        variance = 0
        for r in log_returns[::-1]:  # Reverse to weight recent more
            variance = self.vol_lambda * variance + (1 - self.vol_lambda) * r**2

        # Annualize (assuming 1-second intervals for high-frequency data)
        annual_variance = variance * 31557600  # seconds per year
        annual_vol = np.sqrt(annual_variance)

        return annual_vol

    def _calculate_momentum_drift(self, price_history: List[dict], current_price: float) -> float:
        """
        Calculate momentum-adjusted drift over recent window.

        Captures short-term directional flow to improve probability estimates
        during trending price action.

        Returns: Annualized drift estimate
        """
        if len(price_history) < 2:
            return 0.0

        # Get recent prices within momentum window
        now = max(p.get('time', p.get('timestamp', 0)) for p in price_history)
        cutoff = now - (self.momentum_window * 1000)  # Convert to milliseconds

        recent = [p for p in price_history if p.get('time', p.get('timestamp', 0)) >= cutoff]

        if len(recent) < 2:
            return 0.0

        # Calculate average log return
        sorted_prices = sorted(recent, key=lambda p: p.get('time', p.get('timestamp', 0)))
        prices = np.array([p['price'] for p in sorted_prices])
        log_returns = np.diff(np.log(prices))

        # Average return (annualized)
        avg_return = np.mean(log_returns)
        annual_drift = avg_return * 31557600  # Annualize

        return annual_drift

    def _detect_volatility_spike(self, price_history: List[dict]) -> bool:
        """
        Detect volatility clustering/regime shifts.

        Returns True if current volatility is significantly elevated relative
        to recent average, indicating model uncertainty is too high.
        """
        if len(price_history) < 20:  # Need sufficient data
            return False

        # Get volatility regime lookback window
        now = max(p.get('time', p.get('timestamp', 0)) for p in price_history)
        cutoff = now - (self.vol_regime_lookback * 1000)

        recent = [p for p in price_history if p.get('time', p.get('timestamp', 0)) >= cutoff]

        if len(recent) < 10:
            return False

        # Calculate rolling realized volatility
        sorted_prices = sorted(recent, key=lambda p: p.get('time', p.get('timestamp', 0)))
        prices = np.array([p['price'] for p in sorted_prices])
        log_returns = np.diff(np.log(prices))

        if len(log_returns) < 5:
            return False

        # Current volatility (last 20% of data)
        split_point = int(len(log_returns) * 0.8)
        recent_vol = np.std(log_returns[split_point:])

        # Historical average
        historical_vol = np.std(log_returns[:split_point])

        # Detect spike
        if historical_vol > 0:
            vol_ratio = recent_vol / historical_vol
            if vol_ratio > self.vol_spike_threshold:
                self.logger.debug(
                    f"Volatility spike detected: current={recent_vol:.4f}, "
                    f"historical={historical_vol:.4f}, ratio={vol_ratio:.2f}x"
                )
                return True

        return False

    def _calculate_probability_closed_form(
        self,
        S0: float,
        K: float,
        T: float,
        sigma: float,
        mu: float = 0.0,
    ) -> float:
        """
        Calculate P(S_T > K) using Black-Scholes framework (closed-form).

        Faster than Monte Carlo for real-time trading. Assumes geometric
        Brownian motion with drift.

        Returns: Probability that terminal price exceeds strike
        """
        if T <= 0 or sigma <= 0 or S0 <= 0 or K <= 0:
            return 0.5

        # Standard Black-Scholes d2 formula
        d = (np.log(S0 / K) + (mu - 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))

        # P(S_T > K) = N(d)
        prob = norm.cdf(d)

        # Clamp to valid range
        return max(0.001, min(0.999, prob))

    def _monte_carlo_probability(
        self,
        S0: float,
        K: float,
        T: float,
        sigma: float,
        mu: float = 0.0,
    ) -> float:
        """
        Calculate P(S_T > K) using Monte Carlo simulation.

        More flexible than closed-form if we want to add path-dependent features,
        but slower for real-time execution.

        Returns: Simulated probability that terminal price exceeds strike
        """
        if T <= 0 or sigma <= 0 or S0 <= 0 or K <= 0:
            return 0.5

        # Generate random paths
        dt = T
        Z = np.random.standard_normal(self.num_simulations)

        # Geometric Brownian Motion: S_T = S_0 * exp((mu - sigma^2/2)*T + sigma*sqrt(T)*Z)
        S_T = S0 * np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * Z)

        # Count paths that finish above strike
        prob = np.mean(S_T > K)

        # Clamp to valid range
        return max(0.001, min(0.999, prob))

    def _categorize_strength(self, edge: float) -> SignalStrength:
        """
        Categorize signal strength based on edge magnitude.

        Since we're already filtering for min_edge (typically 5%), these categories
        represent degrees of mispricing above that threshold.
        """
        if edge >= 0.10:  # 10%+ edge (extreme mispricing)
            return SignalStrength.HIGH
        elif edge >= 0.07:  # 7-10% edge (strong mispricing)
            return SignalStrength.MEDIUM
        else:  # 5-7% edge (moderate mispricing above threshold)
            return SignalStrength.LOW

    def _calculate_position_size(
        self,
        edge: float,
        bankroll: float,
        market_price: float,
    ) -> int:
        """
        Calculate position size using fractional Kelly with asymmetric risk adjustment.

        For high-confidence (e.g., 90%+ prob), we risk ~90¢ to gain ~10¢.
        This asymmetry requires more conservative sizing than symmetric bets.

        Kelly formula for binary markets: f = edge / price
        We apply fractional Kelly (1/4 or less) to protect against model error.
        """
        if edge <= 0 or market_price <= 0 or market_price >= 1:
            return 0

        # Full Kelly fraction
        kelly_fraction = edge / market_price

        # Apply fractional Kelly (default 0.25 = quarter Kelly)
        # For asymmetric payoffs, we may want even more conservative (e.g., 0.1 Kelly)
        adjusted_fraction = kelly_fraction * self.config.kelly_fraction

        # Asymmetric risk adjustment: if risk/reward > 5:1, reduce size further
        risk_reward_ratio = market_price / (1 - market_price)
        if risk_reward_ratio > 5.0:
            # Apply additional haircut for extreme asymmetry
            asymmetry_factor = 0.5  # Reduce by half
            adjusted_fraction *= asymmetry_factor
            self.logger.debug(
                f"Asymmetric risk adjustment applied: R/R={risk_reward_ratio:.1f}, "
                f"reducing position size by {asymmetry_factor:.1%}"
            )

        # Convert to dollar amount
        position_value = bankroll * adjusted_fraction

        # Convert to number of contracts
        quantity = int(position_value / market_price)

        return max(1, quantity)  # At least 1 contract

    def _get_optimal_price(
        self,
        direction: SignalDirection,
        market: Market,
        orderbook: Optional[Orderbook],
    ) -> Optional[float]:
        """
        Get optimal limit price from orderbook.

        For high-probability trades, we can afford to be slightly more aggressive
        on price since our edge is structural (probability distribution) not fleeting.

        Strategy: Try to improve on current ask by 1 tick, but willing to pay market.
        """
        if not orderbook:
            return market.yes_price if direction == SignalDirection.YES else market.no_price

        if direction == SignalDirection.YES:
            best_ask = orderbook.best_yes_ask
            if best_ask:
                # Try to improve by 1 cent, but don't go below 1 cent
                return max(0.01, best_ask - 0.01)
            return market.yes_price
        else:
            best_ask = orderbook.best_no_ask
            if best_ask:
                return max(0.01, best_ask - 0.01)
            return market.no_price
