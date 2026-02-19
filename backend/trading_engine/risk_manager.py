"""
Risk management system — position limits, circuit breakers, drawdown tracking.

Design principles:
- Fail closed: if in doubt, block the trade
- Circuit breaker is latching (requires manual reset or new day)
- All dollar amounts stored as floats in 0+ range (not cents)
- Drawdown is relative to peak equity since session start
"""
from typing import List, Optional, Dict, Tuple
from datetime import datetime, date
from dataclasses import dataclass, field

from models.trade import Trade, TradeStatus, Position
from models.config import RiskConfig
from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class RiskMetrics:
    """Full risk snapshot — serialized to JSON for the dashboard."""

    # Positions
    total_positions: int = 0
    open_orders_count: int = 0
    total_exposure: float = 0.0             # Dollars at risk in open positions

    # P&L
    daily_pnl: float = 0.0                  # Realized + unrealized today
    daily_loss: float = 0.0                 # Negative portion only (≤ 0)
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0

    # Risk ratios
    max_drawdown: float = 0.0               # Fraction (e.g. 0.05 = 5%)
    current_drawdown: float = 0.0           # Live drawdown fraction
    win_rate: float = 0.0                   # Fraction of profitable closed trades
    ev_per_trade: float = 0.0              # Average P&L per closed trade (dollars)

    # Circuit breaker
    circuit_breaker_triggered: bool = False
    circuit_breaker_reason: str = ""

    # Per-market exposure (ticker → dollars)
    exposure_per_market: Dict[str, float] = field(default_factory=dict)

    # Timestamp
    last_updated: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        def _r2(v: float) -> float:
            return float(f"{v:.2f}")

        def _r4(v: float) -> float:
            return float(f"{v:.4f}")

        return {
            "total_positions": self.total_positions,
            "open_orders_count": self.open_orders_count,
            "total_exposure": _r2(self.total_exposure),
            "daily_pnl": _r2(self.daily_pnl),
            "daily_loss": _r2(self.daily_loss),
            "unrealized_pnl": _r2(self.unrealized_pnl),
            "realized_pnl": _r2(self.realized_pnl),
            "max_drawdown": _r4(self.max_drawdown),
            "current_drawdown": _r4(self.current_drawdown),
            "win_rate": _r4(self.win_rate),
            "ev_per_trade": _r4(self.ev_per_trade),
            "circuit_breaker_triggered": self.circuit_breaker_triggered,
            "circuit_breaker_reason": self.circuit_breaker_reason,
            "exposure_per_market": {k: _r2(float(v)) for k, v in self.exposure_per_market.items()},
            "last_updated": self.last_updated.isoformat(),
        }


class RiskManager:
    """
    Validates new trades against configurable limits.
    Tracks positions, P&L, drawdown, and win rate.
    Triggers a latching circuit breaker on breached thresholds.
    """

    def __init__(self, config: RiskConfig, bankroll: float = 10_000.0):
        self.config = config
        self.bankroll = bankroll                    # Starting capital reference

        # Trade history
        self.all_trades: List[Trade] = []
        self.positions: Dict[str, Position] = {}   # ticker → Position

        # Daily tracking — resets at UTC midnight
        self._daily_date: date = datetime.utcnow().date()
        self._daily_realized_pnl: float = 0.0

        # Peak equity for drawdown
        self.peak_equity: float = bankroll
        self.starting_equity: float = bankroll

        # Circuit breaker — latching
        self.circuit_breaker_active: bool = False
        self.circuit_breaker_triggered_at: Optional[datetime] = None
        self.circuit_breaker_reason: str = ""

        # Metrics snapshot (updated on every check/record)
        self.metrics = RiskMetrics()

        logger.info(f"RiskManager initialized (bankroll=${bankroll:,.2f})")

    # ──────────────────────────────────────────────────────────────────
    # Trade gate
    # ──────────────────────────────────────────────────────────────────

    def check_trade_allowed(
        self,
        ticker: str,
        quantity: int,
        price: float,
    ) -> Tuple[bool, Optional[str]]:
        """
        Return (True, None) if trade is allowed, (False, reason) otherwise.
        Checks every limit in priority order.
        """
        self._maybe_reset_daily()

        # 1. Circuit breaker — always first
        if self.circuit_breaker_active:
            return False, f"Circuit breaker active: {self.circuit_breaker_reason}"

        # 2. Position size
        position_value = quantity * price
        if position_value > self.config.max_position_size:
            return False, (
                f"Position ${position_value:.2f} exceeds limit ${self.config.max_position_size:.2f}"
            )

        # 3. Concurrent positions
        if len(self.positions) >= self.config.max_concurrent_positions:
            return False, (
                f"Max concurrent positions ({self.config.max_concurrent_positions}) reached"
            )

        # 4. Daily loss cap
        if abs(self._daily_realized_pnl) >= self.config.max_daily_loss and self._daily_realized_pnl < 0:
            return False, (
                f"Daily loss ${abs(self._daily_realized_pnl):.2f} "
                f"exceeds cap ${self.config.max_daily_loss:.2f}"
            )

        # 5. Total exposure
        current_exposure = sum(
            pos.quantity * pos.average_entry_price for pos in self.positions.values()
        )
        max_exposure = self.config.max_position_size * self.config.max_concurrent_positions
        if current_exposure + position_value > max_exposure:
            return False, (
                f"Adding this trade would push total exposure ${current_exposure + position_value:.2f} "
                f"above limit ${max_exposure:.2f}"
            )

        # 6. Per-market cap: max 1 position per market ticker
        if ticker in self.positions:
            return False, f"Already have a position in {ticker}"

        return True, None

    def validate_signal_edge(
        self, edge: float, confidence: float
    ) -> Tuple[bool, Optional[str]]:
        """Require edge ≥ min_threshold + uncertainty_buffer."""
        min_edge = self.config.min_edge_threshold + self.config.uncertainty_buffer
        if abs(edge) < min_edge:
            return False, (
                f"Edge {edge:.3f} below minimum {min_edge:.3f} "
                f"(threshold {self.config.min_edge_threshold:.3f} + "
                f"buffer {self.config.uncertainty_buffer:.3f})"
            )
        if confidence < 0.5:
            return False, f"Confidence {confidence:.2f} below 0.50 minimum"
        return True, None

    # ──────────────────────────────────────────────────────────────────
    # Trade recording
    # ──────────────────────────────────────────────────────────────────

    def record_trade(self, trade: Trade):
        """Record a trade; update positions and metrics."""
        self._maybe_reset_daily()
        self.all_trades.append(trade)

        if trade.status in (TradeStatus.FILLED, TradeStatus.PARTIALLY_FILLED):
            self._update_position_from_fill(trade)
            # Accumulate realized P&L for today
            if trade.pnl is not None:
                self._daily_realized_pnl += trade.pnl

        self._recompute_metrics()
        logger.debug(f"Recorded {trade.status.value} trade {trade.trade_id}")

    def set_open_orders_count(self, count: int):
        """Called by OrderManager to keep open-order count in sync."""
        self.metrics.open_orders_count = count

    # ──────────────────────────────────────────────────────────────────
    # Position management
    # ──────────────────────────────────────────────────────────────────

    def _update_position_from_fill(self, trade: Trade):
        """Add or update position after a fill."""
        ticker = trade.ticker
        qty = trade.filled_quantity or 0
        avg_price = trade.average_fill_price or trade.price or 0.0

        if qty <= 0:
            return

        if ticker not in self.positions:
            self.positions[ticker] = Position(
                ticker=ticker,
                side=trade.side,
                quantity=qty,
                average_entry_price=avg_price,
                entry_time=trade.filled_at or datetime.utcnow(),
                max_loss=qty * avg_price,
                max_gain=qty * (1.0 - avg_price),
            )
            logger.info(f"New position: {ticker} {trade.side.value} ×{qty} @ {avg_price:.3f}")
        else:
            pos = self.positions[ticker]
            total_qty = pos.quantity + qty
            # Weighted average entry
            pos.average_entry_price = (
                (pos.average_entry_price * pos.quantity + avg_price * qty) / total_qty
            )
            pos.quantity = total_qty
            pos.last_updated = datetime.utcnow()

    def close_position(self, ticker: str, exit_pnl: float = 0.0):
        """Remove a settled/closed position and record realized P&L."""
        if ticker in self.positions:
            self.positions.pop(ticker, None)
            self._daily_realized_pnl += exit_pnl
            self._recompute_metrics()
            logger.info(f"Position closed: {ticker} (P&L ${exit_pnl:.2f})")

    def update_position_price(self, ticker: str, current_price: float):
        """Mark current market price for an open position (unrealized P&L)."""
        if ticker in self.positions:
            pos = self.positions[ticker]
            pos.current_price = current_price
            pos.unrealized_pnl = pos.calculate_pnl(current_price)
            pos.last_updated = datetime.utcnow()

    # ──────────────────────────────────────────────────────────────────
    # Metrics computation
    # ──────────────────────────────────────────────────────────────────

    def _recompute_metrics(self):
        """Rebuild RiskMetrics from current state."""
        now = datetime.utcnow()

        # Exposure and unrealized P&L
        total_exposure = sum(
            pos.quantity * pos.average_entry_price for pos in self.positions.values()
        )
        unrealized = sum(pos.unrealized_pnl or 0.0 for pos in self.positions.values())
        exposure_per_market = {
            t: float(f"{pos.quantity * pos.average_entry_price:.2f}")
            for t, pos in self.positions.items()
        }

        # Daily P&L
        daily_pnl = self._daily_realized_pnl + unrealized
        daily_loss = min(0.0, daily_pnl)

        # Drawdown
        current_equity = self.starting_equity + daily_pnl
        if current_equity > self.peak_equity:
            self.peak_equity = current_equity
        current_drawdown = (
            (self.peak_equity - current_equity) / self.peak_equity
            if self.peak_equity > 0 else 0.0
        )

        # Win rate and EV from closed filled trades
        closed_filled = [
            t for t in self.all_trades
            if t.status == TradeStatus.FILLED and t.pnl is not None
        ]
        if closed_filled:
            wins = sum(1 for t in closed_filled if (t.pnl or 0) > 0)
            win_rate = wins / len(closed_filled)
            ev_per_trade = sum(t.pnl or 0 for t in closed_filled) / len(closed_filled)
        else:
            win_rate = 0.0
            ev_per_trade = 0.0

        self.metrics = RiskMetrics(
            total_positions=len(self.positions),
            open_orders_count=self.metrics.open_orders_count,   # preserved from last set
            total_exposure=total_exposure,
            daily_pnl=daily_pnl,
            daily_loss=daily_loss,
            unrealized_pnl=unrealized,
            realized_pnl=self._daily_realized_pnl,
            max_drawdown=max(getattr(self.metrics, "max_drawdown", 0.0), current_drawdown),
            current_drawdown=current_drawdown,
            win_rate=win_rate,
            ev_per_trade=ev_per_trade,
            circuit_breaker_triggered=self.circuit_breaker_active,
            circuit_breaker_reason=self.circuit_breaker_reason,
            exposure_per_market=exposure_per_market,
            last_updated=now,
        )

        # Check circuit breakers after updating metrics
        self._check_circuit_breakers()

    def _check_circuit_breakers(self):
        """Auto-trigger circuit breaker when limits are breached."""
        if self.circuit_breaker_active:
            return

        # Daily loss threshold (% of starting equity)
        if self.starting_equity > 0:
            loss_pct = abs(self.metrics.daily_loss) / self.starting_equity
            if loss_pct >= self.config.circuit_breaker_loss_threshold:
                self.trigger_circuit_breaker(
                    f"Daily loss {loss_pct:.1%} ≥ threshold {self.config.circuit_breaker_loss_threshold:.1%}"
                )
                return

        # Drawdown threshold
        if self.metrics.current_drawdown >= self.config.circuit_breaker_drawdown_threshold:
            self.trigger_circuit_breaker(
                f"Drawdown {self.metrics.current_drawdown:.1%} ≥ threshold "
                f"{self.config.circuit_breaker_drawdown_threshold:.1%}"
            )

    # ──────────────────────────────────────────────────────────────────
    # Circuit breaker control
    # ──────────────────────────────────────────────────────────────────

    def trigger_circuit_breaker(self, reason: str):
        """Latch the circuit breaker. Requires explicit reset to clear."""
        if not self.circuit_breaker_active:
            self.circuit_breaker_active = True
            self.circuit_breaker_triggered_at = datetime.utcnow()
            self.circuit_breaker_reason = reason
            self.metrics.circuit_breaker_triggered = True
            self.metrics.circuit_breaker_reason = reason
            logger.critical(f"CIRCUIT BREAKER TRIGGERED: {reason}")

    def reset_circuit_breaker(self):
        """Manually reset. Operator must acknowledge before resuming."""
        if self.circuit_breaker_active:
            self.circuit_breaker_active = False
            self.circuit_breaker_triggered_at = None
            self.circuit_breaker_reason = ""
            self.metrics.circuit_breaker_triggered = False
            self.metrics.circuit_breaker_reason = ""
            logger.warning("Circuit breaker manually reset by operator")

    # ──────────────────────────────────────────────────────────────────
    # Daily reset
    # ──────────────────────────────────────────────────────────────────

    def _maybe_reset_daily(self):
        """Reset daily accumulators at UTC midnight."""
        today = datetime.utcnow().date()
        if today > self._daily_date:
            logger.info(
                f"Day rollover: resetting daily metrics "
                f"(previous daily P&L ${self._daily_realized_pnl:.2f})"
            )
            self._daily_date = today
            self._daily_realized_pnl = 0.0
            self.starting_equity = self.peak_equity
            # Auto-reset circuit breaker on new day
            if self.circuit_breaker_active:
                self.reset_circuit_breaker()

    # ──────────────────────────────────────────────────────────────────
    # Public accessors
    # ──────────────────────────────────────────────────────────────────

    def get_metrics(self) -> RiskMetrics:
        self._recompute_metrics()
        return self.metrics

    def get_position_summary(self) -> dict:
        def _r2(v: float) -> float:
            return float(f"{v:.2f}")

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
                    "exposure": _r2(pos.quantity * pos.average_entry_price),
                }
                for pos in self.positions.values()
            ],
            "total_exposure": _r2(self.metrics.total_exposure),
            "total_unrealized_pnl": _r2(
                sum(p.unrealized_pnl or 0.0 for p in self.positions.values())
            ),
        }