"""
Mean Reversion Strategy

Trades against extreme short-term price movements in the 15-minute window.
Assumes prices tend to revert toward the mean after sharp moves.
"""
import numpy as np
from typing import Optional, List

from strategies.base import BaseStrategy
from models.market import Market, Orderbook
from models.strategy import StrategySignal, SignalDirection, SignalStrength
from models.config import StrategyConfig


class MeanReversionStrategy(BaseStrategy):
    """
    Mean reversion strategy for 15-minute Solana markets.
    """

    def __init__(self, config: StrategyConfig):
        super().__init__(config)

        # Strategy parameters
        params = config.params
        self.lookback_window = params.get("lookback_window", 300)  # 5 minutes
        self.zscore_threshold_high = params.get("zscore_threshold_high", 2.0)  # High confidence
        self.zscore_threshold_medium = params.get("zscore_threshold_medium", 1.5)  # Medium
        self.zscore_threshold_low = params.get("zscore_threshold_low", 1.0)  # Low
        self.min_edge = params.get("min_edge", 0.03)
        self.min_time_remaining = params.get("min_time_remaining", 60)

    async def analyze(
        self,
        market: Market,
        current_price: float,
        price_history: List[dict],
        orderbook: Optional[Orderbook] = None,
    ) -> Optional[StrategySignal]:
        """
        Analyze for mean reversion opportunities.

        Strategy:
        1. Calculate mean and std dev of recent prices
        2. Compute z-score of current price
        3. If z-score is extreme, trade for reversion
        4. YES if price is below mean (expecting up move)
        5. NO if price is above mean (expecting down move)
        """
        # Check if market is tradeable
        if not market.is_tradeable:
            return None

        # Check time remaining
        time_remaining = market.time_remaining
        if time_remaining < self.min_time_remaining:
            return None

        # Get market probability
        market_prob = market.yes_price
        if market_prob is None or market_prob <= 0 or market_prob >= 1:
            return None

        # Calculate mean and std dev
        if len(price_history) < 10:  # Need minimum samples
            return None

        # Filter to lookback window
        now = max(p.get('time', p.get('timestamp', 0)) for p in price_history)
        cutoff = now - self.lookback_window * 1000  # Convert to milliseconds
        recent_prices = [
            p['price'] for p in price_history
            if p.get('time', p.get('timestamp', 0)) >= cutoff
        ]

        if len(recent_prices) < 5:
            return None

        mean_price = np.mean(recent_prices)
        std_price = np.std(recent_prices)

        if std_price == 0:
            return None

        # Calculate z-score
        zscore = (current_price - mean_price) / std_price

        # Determine signal
        direction = None
        strength = None

        if zscore < -self.zscore_threshold_high:
            # Price well below mean -> expect reversion UP
            direction = SignalDirection.YES
            strength = SignalStrength.HIGH
        elif zscore < -self.zscore_threshold_medium:
            direction = SignalDirection.YES
            strength = SignalStrength.MEDIUM
        elif zscore < -self.zscore_threshold_low:
            direction = SignalDirection.YES
            strength = SignalStrength.LOW
        elif zscore > self.zscore_threshold_high:
            # Price well above mean -> expect reversion DOWN
            direction = SignalDirection.NO
            strength = SignalStrength.HIGH
        elif zscore > self.zscore_threshold_medium:
            direction = SignalDirection.NO
            strength = SignalStrength.MEDIUM
        elif zscore > self.zscore_threshold_low:
            direction = SignalDirection.NO
            strength = SignalStrength.LOW
        else:
            # No significant deviation
            return None

        # Estimate true probability based on mean reversion
        # If current price < strike < mean -> higher prob of exceeding strike
        # If current price > strike > mean -> lower prob of exceeding strike

        strike = market.strike_price

        if direction == SignalDirection.YES:
            # Expect price to move up toward mean
            if current_price < strike <= mean_price:
                # Strike between current and mean -> high prob of exceeding
                true_prob = 0.5 + min(0.45, abs(zscore) * 0.15)
            else:
                true_prob = 0.5 + abs(zscore) * 0.10
        else:
            # Expect price to move down toward mean
            if current_price > strike >= mean_price:
                # Strike between current and mean -> low prob of exceeding
                true_prob = 0.5 - min(0.45, abs(zscore) * 0.15)
            else:
                true_prob = 0.5 - abs(zscore) * 0.10

        # Clamp probability
        true_prob = max(0.01, min(0.99, true_prob))

        # Calculate edge
        edge = true_prob - market_prob

        if abs(edge) < self.min_edge:
            return None

        # Calculate position size
        quantity = self._calculate_kelly_size(
            edge=abs(edge),
            bankroll=self.config.bankroll,
            price=market_prob if direction == SignalDirection.YES else (1 - market_prob),
        )

        # Get recommended price
        recommended_price = self._get_optimal_price(direction, market, orderbook)

        # Create signal
        reasoning = (
            f"Mean reversion: zscore={zscore:.2f}, current={current_price:.2f}, "
            f"mean={mean_price:.2f}, strike={strike:.2f}, edge={edge:.3f}"
        )

        metrics = {
            "zscore": zscore,
            "mean_price": mean_price,
            "std_price": std_price,
            "current_price": current_price,
            "strike_price": strike,
            "time_remaining_seconds": time_remaining,
        }

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

    def _get_optimal_price(
        self,
        direction: SignalDirection,
        market: Market,
        orderbook: Optional[Orderbook],
    ) -> Optional[float]:
        """Get optimal limit price from orderbook."""
        if not orderbook:
            return market.yes_price if direction == SignalDirection.YES else market.no_price

        if direction == SignalDirection.YES:
            best_ask = orderbook.best_yes_ask
            if best_ask:
                return max(0.01, best_ask - 0.01)
            return market.yes_price
        else:
            best_ask = orderbook.best_no_ask
            if best_ask:
                return max(0.01, best_ask - 0.01)
            return market.no_price
