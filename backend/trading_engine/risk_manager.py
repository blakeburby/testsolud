"""
Risk management system with position limits and circuit breakers.
"""
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from dataclasses import dataclass, field

from models.trade import Trade, TradeStatus, Position
from models.config import RiskConfig
from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class RiskMetrics:
    """Risk metrics for monitoring."""
    total_positions: int = 0
    total_exposure: float = 0
    daily_pnl: float = 0
    daily_loss: float = 0
    max_drawdown: float = 0
    circuit_breaker_triggered: bool = False
    last_updated: datetime = field(default_factory=datetime.utcnow)


class RiskManager:
    """
    Manages risk limits, position sizing, and circuit breakers.
    """

    def __init__(self, config: RiskConfig):
        """
        Initialize risk manager.

        Args:
            config: Risk configuration
        """
        self.config = config
        self.trades: List[Trade] = []
        self.positions: Dict[str, Position] = {}
        self.metrics = RiskMetrics()

        # Circuit breaker state
        self.circuit_breaker_active = False
        self.circuit_breaker_triggered_at: Optional[datetime] = None

        # Daily tracking
        self.daily_reset_time = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        self.peak_equity = 0
        self.starting_equity = 0

        logger.info("Risk manager initialized")

    def check_trade_allowed(
        self,
        ticker: str,
        quantity: int,
        price: float,
    ) -> tuple[bool, Optional[str]]:
        """
        Check if a trade is allowed under current risk limits.

        Args:
            ticker: Market ticker
            quantity: Number of contracts
            price: Price per contract

        Returns:
            (allowed, reason) tuple
        """
        # Circuit breaker check
        if self.circuit_breaker_active:
            return False, "Circuit breaker is active"

        # Position size check
        position_value = quantity * price
        if position_value > self.config.max_position_size:
            return False, f"Position size ${position_value:.2f} exceeds limit ${self.config.max_position_size:.2f}"

        # Concurrent positions check
        if len(self.positions) >= self.config.max_concurrent_positions:
            return False, f"Max concurrent positions ({self.config.max_concurrent_positions}) reached"

        # Daily loss check
        if abs(self.metrics.daily_loss) >= self.config.max_daily_loss:
            return False, f"Daily loss limit ${self.config.max_daily_loss:.2f} reached"

        # Total exposure check
        total_exposure = self.metrics.total_exposure + position_value
        max_total_exposure = self.config.max_position_size * self.config.max_concurrent_positions
        if total_exposure > max_total_exposure:
            return False, f"Total exposure ${total_exposure:.2f} would exceed limit ${max_total_exposure:.2f}"

        return True, None

    def validate_signal_edge(self, edge: float, confidence: float) -> tuple[bool, Optional[str]]:
        """
        Validate that a signal has sufficient edge and confidence.

        Args:
            edge: Estimated edge
            confidence: Signal confidence (0-1)

        Returns:
            (valid, reason) tuple
        """
        # Minimum edge check (including uncertainty buffer)
        min_edge = self.config.min_edge_threshold + self.config.uncertainty_buffer
        if abs(edge) < min_edge:
            return False, f"Edge {edge:.3f} below minimum {min_edge:.3f} (including buffer)"

        # Confidence check
        if confidence < 0.5:
            return False, f"Confidence {confidence:.2f} below minimum 0.5"

        return True, None

    def record_trade(self, trade: Trade):
        """Record a trade for risk tracking."""
        self.trades.append(trade)

        # Update positions
        if trade.status in [TradeStatus.FILLED, TradeStatus.PARTIALLY_FILLED]:
            self._update_position(trade)

        # Update metrics
        self._update_metrics()

        logger.debug(f"Recorded trade {trade.trade_id}: {trade.status}")

    def _update_position(self, trade: Trade):
        """Update position tracking based on filled trade."""
        ticker = trade.ticker

        if ticker not in self.positions:
            # New position
            if trade.filled_quantity > 0 and trade.average_fill_price:
                self.positions[ticker] = Position(
                    ticker=ticker,
                    side=trade.side,
                    quantity=trade.filled_quantity,
                    average_entry_price=trade.average_fill_price,
                    entry_time=trade.filled_at or datetime.utcnow(),
                    max_loss=trade.filled_quantity * trade.average_fill_price,
                    max_gain=trade.filled_quantity * (1 - trade.average_fill_price),
                )
                logger.info(f"New position: {ticker} - {trade.side.value} {trade.filled_quantity}")
        else:
            # Update existing position
            pos = self.positions[ticker]
            if trade.filled_quantity > 0:
                # Add to position (average price)
                total_quantity = pos.quantity + trade.filled_quantity
                if trade.average_fill_price:
                    pos.average_entry_price = (
                        (pos.average_entry_price * pos.quantity + trade.average_fill_price * trade.filled_quantity)
                        / total_quantity
                    )
                pos.quantity = total_quantity
                pos.last_updated = datetime.utcnow()

    def update_position_prices(self, ticker: str, current_price: float):
        """Update current price for a position and calculate unrealized P&L."""
        if ticker in self.positions:
            pos = self.positions[ticker]
            pos.current_price = current_price
            pos.unrealized_pnl = pos.calculate_pnl(current_price)
            pos.last_updated = datetime.utcnow()

    def _update_metrics(self):
        """Update risk metrics."""
        # Reset daily metrics if new day
        now = datetime.utcnow()
        if now.date() > self.daily_reset_time.date():
            self._reset_daily_metrics()

        # Calculate total exposure
        total_exposure = sum(
            pos.quantity * pos.average_entry_price
            for pos in self.positions.values()
        )

        # Calculate unrealized P&L
        unrealized_pnl = sum(
            pos.unrealized_pnl or 0
            for pos in self.positions.values()
        )

        # Calculate realized P&L for today
        daily_trades = [
            t for t in self.trades
            if t.filled_at and t.filled_at.date() == now.date()
        ]
        realized_pnl = sum(t.pnl or 0 for t in daily_trades)

        # Update metrics
        self.metrics.total_positions = len(self.positions)
        self.metrics.total_exposure = total_exposure
        self.metrics.daily_pnl = realized_pnl + unrealized_pnl
        self.metrics.daily_loss = min(0, self.metrics.daily_pnl)

        # Drawdown calculation
        current_equity = self.starting_equity + self.metrics.daily_pnl
        if current_equity > self.peak_equity:
            self.peak_equity = current_equity
        drawdown = (self.peak_equity - current_equity) / self.peak_equity if self.peak_equity > 0 else 0
        self.metrics.max_drawdown = max(self.metrics.max_drawdown, drawdown)

        # Check circuit breakers
        self._check_circuit_breakers()

        self.metrics.last_updated = now

    def _reset_daily_metrics(self):
        """Reset daily metrics at day rollover."""
        logger.info(f"Resetting daily metrics. Previous daily P&L: ${self.metrics.daily_pnl:.2f}")

        self.daily_reset_time = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        self.metrics.daily_pnl = 0
        self.metrics.daily_loss = 0
        self.starting_equity = self.peak_equity

        # Reset circuit breaker if it was triggered yesterday
        if self.circuit_breaker_active:
            self.reset_circuit_breaker()

    def _check_circuit_breakers(self):
        """Check if circuit breakers should be triggered."""
        # Loss threshold
        loss_pct = abs(self.metrics.daily_loss) / self.starting_equity if self.starting_equity > 0 else 0
        if loss_pct >= self.config.circuit_breaker_loss_threshold:
            self.trigger_circuit_breaker(f"Daily loss {loss_pct:.1%} exceeds threshold")

        # Drawdown threshold
        if self.metrics.max_drawdown >= self.config.circuit_breaker_drawdown_threshold:
            self.trigger_circuit_breaker(f"Drawdown {self.metrics.max_drawdown:.1%} exceeds threshold")

    def trigger_circuit_breaker(self, reason: str):
        """Trigger circuit breaker to halt trading."""
        if not self.circuit_breaker_active:
            self.circuit_breaker_active = True
            self.circuit_breaker_triggered_at = datetime.utcnow()
            self.metrics.circuit_breaker_triggered = True
            logger.critical(f"🚨 CIRCUIT BREAKER TRIGGERED: {reason}")

    def reset_circuit_breaker(self):
        """Manually reset circuit breaker."""
        if self.circuit_breaker_active:
            self.circuit_breaker_active = False
            self.circuit_breaker_triggered_at = None
            self.metrics.circuit_breaker_triggered = False
            logger.warning("Circuit breaker reset")

    def get_metrics(self) -> RiskMetrics:
        """Get current risk metrics."""
        self._update_metrics()
        return self.metrics

    def get_position_summary(self) -> Dict:
        """Get summary of current positions."""
        return {
            "count": len(self.positions),
            "positions": [
                {
                    "ticker": pos.ticker,
                    "side": pos.side.value,
                    "quantity": pos.quantity,
                    "entry_price": pos.average_entry_price,
                    "current_price": pos.current_price,
                    "unrealized_pnl": pos.unrealized_pnl,
                }
                for pos in self.positions.values()
            ],
            "total_exposure": self.metrics.total_exposure,
            "total_unrealized_pnl": sum(p.unrealized_pnl or 0 for p in self.positions.values()),
        }
