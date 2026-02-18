"""
Base strategy class that all trading strategies inherit from.
"""
from abc import ABC, abstractmethod
from typing import Optional, List
from datetime import datetime

from models.market import Market, Orderbook
from models.strategy import StrategySignal, SignalDirection, SignalStrength
from models.config import StrategyConfig
from utils.logger import get_logger


class BaseStrategy(ABC):
    """
    Abstract base class for trading strategies.
    """

    def __init__(self, config: StrategyConfig):
        """
        Initialize strategy.

        Args:
            config: Strategy configuration
        """
        self.config = config
        self.name = config.name
        self.enabled = config.enabled
        self.logger = get_logger(f"strategy.{self.name}")

        self.last_signal_time: Optional[datetime] = None
        self.signal_count = 0

        self.logger.info(f"Strategy '{self.name}' initialized")

    @abstractmethod
    async def analyze(
        self,
        market: Market,
        current_price: float,
        price_history: List[dict],
        orderbook: Optional[Orderbook] = None,
    ) -> Optional[StrategySignal]:
        """
        Analyze market and generate trading signal.

        Args:
            market: Market to analyze
            current_price: Current Solana spot price
            price_history: Recent price history (list of price points)
            orderbook: Current orderbook (if available)

        Returns:
            StrategySignal if signal generated, None otherwise
        """
        pass

    def _create_signal(
        self,
        market: Market,
        direction: SignalDirection,
        strength: SignalStrength,
        true_probability: float,
        market_probability: float,
        recommended_quantity: int,
        recommended_price: Optional[float] = None,
        reasoning: Optional[str] = None,
        metrics: Optional[dict] = None,
    ) -> StrategySignal:
        """
        Helper to create a strategy signal.

        Args:
            market: Target market
            direction: Signal direction
            strength: Signal strength
            true_probability: Strategy's probability estimate
            market_probability: Current market probability
            recommended_quantity: Position size
            recommended_price: Limit price
            reasoning: Human-readable reasoning
            metrics: Additional metrics

        Returns:
            StrategySignal object
        """
        edge = true_probability - market_probability

        # Calculate max loss/gain
        if direction == SignalDirection.YES:
            max_loss = recommended_quantity * (recommended_price or market_probability)
            max_gain = recommended_quantity * (1 - (recommended_price or market_probability))
        else:
            max_loss = recommended_quantity * (1 - (recommended_price or market_probability))
            max_gain = recommended_quantity * (recommended_price or market_probability)

        # Map strength to confidence
        confidence_map = {
            SignalStrength.LOW: 0.6,
            SignalStrength.MEDIUM: 0.75,
            SignalStrength.HIGH: 0.9,
        }

        signal = StrategySignal(
            strategy_name=self.name,
            ticker=market.ticker,
            direction=direction,
            strength=strength,
            true_probability=true_probability,
            market_probability=market_probability,
            edge=edge,
            kelly_fraction=self.config.kelly_fraction,
            recommended_quantity=recommended_quantity,
            recommended_price=recommended_price,
            confidence=confidence_map[strength],
            max_loss=max_loss,
            max_gain=max_gain,
            reasoning=reasoning,
            metrics=metrics or {},
            expires_at=market.close_time,
        )

        self.last_signal_time = datetime.utcnow()
        self.signal_count += 1

        self.logger.info(
            f"Signal generated: {direction.value} on {market.ticker} "
            f"(edge: {edge:.3f}, strength: {strength.value})"
        )

        return signal

    def _calculate_kelly_size(
        self,
        edge: float,
        bankroll: float,
        price: float,
    ) -> int:
        """
        Calculate position size using Kelly Criterion.

        Args:
            edge: Estimated edge
            bankroll: Available capital
            price: Price per contract

        Returns:
            Number of contracts
        """
        if edge <= 0 or price <= 0:
            return 0

        # Kelly formula for binary markets: f = edge / price
        kelly_fraction = edge / price

        # Apply fractional Kelly (quarter Kelly by default)
        adjusted_fraction = kelly_fraction * self.config.kelly_fraction

        # Convert to number of contracts
        position_value = bankroll * adjusted_fraction
        quantity = int(position_value / price)

        return max(1, quantity)  # At least 1 contract

    def is_enabled(self) -> bool:
        """Check if strategy is enabled."""
        return self.enabled

    def get_metrics(self) -> dict:
        """Get strategy metrics."""
        return {
            "name": self.name,
            "enabled": self.enabled,
            "signal_count": self.signal_count,
            "last_signal_time": self.last_signal_time.isoformat() if self.last_signal_time else None,
        }
