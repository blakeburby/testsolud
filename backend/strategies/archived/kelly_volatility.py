"""
Kelly Volatility Arbitrage Strategy

Exploits mispriced probabilities in Kalshi markets by comparing:
- True probability (from Monte Carlo / closed-form with EWMA volatility)
- Market probability (from Kalshi prices)

This mirrors the quant engine logic in your dashboard but executes trades automatically.
"""
import numpy as np
from typing import Optional, List
from scipy.stats import norm

from strategies.base import BaseStrategy
from models.market import Market, Orderbook
from models.strategy import StrategySignal, SignalDirection, SignalStrength
from models.config import StrategyConfig


class KellyVolatilityStrategy(BaseStrategy):
    """
    Volatility arbitrage using Kelly criterion and probability mispricing.
    """

    def __init__(self, config: StrategyConfig):
        super().__init__(config)

        # Strategy parameters
        params = config.params
        self.min_edge = params.get("min_edge", 0.03)  # Minimum 3% edge
        self.min_time_remaining = params.get("min_time_remaining", 60)  # At least 1 minute
        self.max_time_remaining = params.get("max_time_remaining", 14 * 60)  # At most 14 minutes
        self.vol_lambda = params.get("vol_lambda", 0.94)  # EWMA lambda for volatility
        self.min_samples = params.get("min_samples", 5)  # Minimum price samples
        self.microstructure_floor = params.get("microstructure_floor", 0.0007)  # Vol floor

    async def analyze(
        self,
        market: Market,
        current_price: float,
        price_history: List[dict],
        orderbook: Optional[Orderbook] = None,
    ) -> Optional[StrategySignal]:
        """
        Analyze market for volatility arbitrage opportunities.

        Strategy:
        1. Calculate EWMA volatility from price history
        2. Compute true probability using Black-Scholes-like model
        3. Compare to market probability
        4. Trade if edge exceeds threshold
        """
        # Check if market is tradeable
        if not market.is_tradeable:
            return None

        # Check time remaining
        time_remaining = market.time_remaining
        if time_remaining < self.min_time_remaining or time_remaining > self.max_time_remaining:
            self.logger.debug(f"Time remaining {time_remaining}s outside range [{self.min_time_remaining}, {self.max_time_remaining}]")
            return None

        # Get market probability
        market_prob = market.yes_price
        if market_prob is None or market_prob <= 0 or market_prob >= 1:
            self.logger.warning(f"Invalid market probability: {market_prob}")
            return None

        # Calculate EWMA volatility
        if len(price_history) < self.min_samples:
            self.logger.debug(f"Insufficient price history: {len(price_history)} samples")
            return None

        volatility = self._calculate_ewma_volatility(price_history)
        if volatility <= 0:
            self.logger.warning("Invalid volatility calculation")
            return None

        # Apply microstructure floor
        T_years = time_remaining / (365.25 * 24 * 3600)  # Convert to years
        vol_total = max(volatility, self.microstructure_floor / np.sqrt(T_years) if T_years > 0 else volatility)

        # Calculate true probability
        true_prob = self._calculate_true_probability(
            S0=current_price,
            K=market.strike_price,
            T=T_years,
            sigma=vol_total,
        )

        # Determine edge
        edge = true_prob - market_prob

        # Check minimum edge
        if abs(edge) < self.min_edge:
            self.logger.debug(f"Edge {edge:.3f} below threshold {self.min_edge}")
            return None

        # Determine direction and strength
        if edge > 0:
            direction = SignalDirection.YES
            strength = self._categorize_strength(edge)
        else:
            direction = SignalDirection.NO
            strength = self._categorize_strength(abs(edge))
            true_prob = 1 - true_prob  # Flip for NO side

        # Calculate position size
        quantity = self._calculate_kelly_size(
            edge=abs(edge),
            bankroll=self.config.bankroll,
            price=market_prob if direction == SignalDirection.YES else (1 - market_prob),
        )

        # Get recommended price from orderbook
        recommended_price = self._get_optimal_price(direction, market, orderbook)

        # Create signal
        reasoning = (
            f"Vol arbitrage: true_prob={true_prob:.3f} vs market={market_prob:.3f}, "
            f"edge={edge:.3f}, vol={vol_total:.3f}, time={time_remaining/60:.1f}min"
        )

        metrics = {
            "volatility": vol_total,
            "time_remaining_seconds": time_remaining,
            "true_probability": true_prob,
            "strike_price": market.strike_price,
            "current_price": current_price,
        }

        return self._create_signal(
            market=market,
            direction=direction,
            strength=strength,
            true_probability=true_prob if direction == SignalDirection.YES else (1 - true_prob),
            market_probability=market_prob,
            recommended_quantity=quantity,
            recommended_price=recommended_price,
            reasoning=reasoning,
            metrics=metrics,
        )

    def _calculate_ewma_volatility(self, price_history: List[dict]) -> float:
        """
        Calculate EWMA volatility from price history.

        Args:
            price_history: List of price points with 'price' and 'timestamp'

        Returns:
            Annualized volatility
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

        # EWMA variance
        variance = 0
        for r in log_returns[::-1]:  # Reverse to weight recent more
            variance = self.vol_lambda * variance + (1 - self.vol_lambda) * r**2

        # Annualize (assuming 1-second intervals for high-frequency data)
        # 365.25 days * 24 hours * 3600 seconds = 31,557,600 seconds per year
        annual_variance = variance * 31557600
        annual_vol = np.sqrt(annual_variance)

        return annual_vol

    def _calculate_true_probability(
        self,
        S0: float,
        K: float,
        T: float,
        sigma: float,
        mu: float = 0.0,
    ) -> float:
        """
        Calculate probability that S_T > K using Black-Scholes framework.

        Args:
            S0: Current price
            K: Strike price
            T: Time to expiration (years)
            sigma: Volatility (annualized)
            mu: Drift (default 0 for risk-neutral)

        Returns:
            Probability that price exceeds strike
        """
        if T <= 0 or sigma <= 0 or S0 <= 0 or K <= 0:
            return 0.5

        # d2 in Black-Scholes: (log(S/K) + (mu - sigma^2/2)*T) / (sigma * sqrt(T))
        d = (np.log(S0 / K) + (mu - 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))

        # P(S_T > K) = N(d2)
        prob = norm.cdf(d)

        # Clamp to (0, 1)
        return max(0.001, min(0.999, prob))

    def _categorize_strength(self, edge: float) -> SignalStrength:
        """Categorize signal strength based on edge magnitude."""
        if edge >= 0.10:  # 10%+ edge
            return SignalStrength.HIGH
        elif edge >= 0.05:  # 5-10% edge
            return SignalStrength.MEDIUM
        else:  # 3-5% edge
            return SignalStrength.LOW

    def _get_optimal_price(
        self,
        direction: SignalDirection,
        market: Market,
        orderbook: Optional[Orderbook],
    ) -> Optional[float]:
        """
        Get optimal limit price from orderbook.

        Strategy: Try to improve on current ask by 1 tick ($0.01)
        """
        if not orderbook:
            # Use market price
            return market.yes_price if direction == SignalDirection.YES else market.no_price

        if direction == SignalDirection.YES:
            best_ask = orderbook.best_yes_ask
            if best_ask:
                # Bid 1 cent below best ask to improve execution probability
                return max(0.01, best_ask - 0.01)
            return market.yes_price
        else:
            best_ask = orderbook.best_no_ask
            if best_ask:
                return max(0.01, best_ask - 0.01)
            return market.no_price
