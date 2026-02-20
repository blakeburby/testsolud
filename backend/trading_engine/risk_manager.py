"""
Risk management system — position limits, circuit breakers, drawdown tracking.

Three-layer circuit breakers (all latching, require manual reset):
  Layer 1 – Daily loss:    ≥ 5% of bankroll (resets UTC midnight)
  Layer 2 – Weekly drawdown: ≥ 10% from Monday 00:00 UTC equity (resets Monday)
  Layer 3 – Session drawdown: ≥ 15% from session-start peak (never auto-resets)

Seven risk gates (checked in order — fail-closed):
  1. Circuit breaker already triggered
  2. Trade value > 2% of bankroll (ceiling)
  3. Concurrent positions already at max (5)
  4. Daily realized loss ≥ 5% of bankroll
  5. Weekly drawdown ≥ 10% of bankroll
  6. Total portfolio exposure would exceed configured limit
  7. Already have an open position in this specific market
"""
from typing import List, Optional, Dict, Tuple
from datetime import datetime, date, timedelta
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
    current_drawdown: float = 0.0           # Session drawdown fraction
    weekly_drawdown: float = 0.0            # Rolling weekly drawdown fraction
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
            "weekly_drawdown": _r4(self.weekly_drawdown),
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
    Tracks positions, P&L, and three independent drawdown windows.
    Triggers latching circuit breakers on any threshold breach.
    """

    def __init__(self, config: RiskConfig, bankroll: float = 10_000.0):
        self.config = config
        self.bankroll = bankroll                    # Starting capital reference

        # Trade history
        self.all_trades: List[Trade] = []
        self.positions: Dict[str, Position] = {}   # ticker → Position

        # ── Daily tracking (resets at UTC midnight) ─────────────────────────
        self._daily_date: date = datetime.utcnow().date()
        self._daily_realized_pnl: float = 0.0

        # ── Weekly tracking (resets every Monday 00:00 UTC) ─────────────────
        self._weekly_start_date: date = self._current_week_monday()
        self._weekly_start_equity: float = bankroll
        self._weekly_peak_equity: float = bankroll

        # ── Session tracking (never auto-resets) ────────────────────────────
        self._session_start_equity: float = bankroll
        self._session_peak_equity: float = bankroll

        # Circuit breaker — latching, requires explicit reset
        self.circuit_breaker_active: bool = False
        self.circuit_breaker_triggered_at: Optional[datetime] = None
        self.circuit_breaker_reason: str = ""

        # Metrics snapshot (updated on every check/record)
        self.metrics = RiskMetrics()

        logger.info(f"RiskManager initialized (bankroll=${bankroll:,.2f})")

    # ──────────────────────────────────────────────────────────────────
    # Seven-gate trade guard
    # ──────────────────────────────────────────────────────────────────

    def check_trade_allowed(
        self,
        ticker: str,
        quantity: int,
        price: float,
    ) -> Tuple[bool, Optional[str]]:
        """
        Return (True, None) if the trade passes all seven gates.
        Return (False, reason) at the first failed gate.
        """
        self._maybe_reset_daily()
        self._maybe_reset_weekly()

        position_value = quantity * price

        # Gate 1 — Circuit breaker (latching)
        if self.circuit_breaker_active:
            return False, f"Circuit breaker active: {self.circuit_breaker_reason}"

        # Gate 2 — Position ceiling: 2% of bankroll
        ceiling = self.bankroll * self.config.position_ceiling_pct
        if position_value > ceiling:
            return False, (
                f"Position ${position_value:.2f} exceeds 2% bankroll ceiling ${ceiling:.2f}"
            )

        # Gate 3 — Concurrent positions
        if len(self.positions) >= self.config.max_concurrent_positions:
            return False, (
                f"Max concurrent positions ({self.config.max_concurrent_positions}) reached"
            )

        # Gate 4 — Daily loss cap: 5% of bankroll
        daily_loss_cap = self.bankroll * self.config.circuit_breaker_loss_threshold
        if self._daily_realized_pnl < 0 and abs(self._daily_realized_pnl) >= daily_loss_cap:
            return False, (
                f"Daily loss ${abs(self._daily_realized_pnl):.2f} "
                f"≥ daily cap ${daily_loss_cap:.2f} "
                f"({self.config.circuit_breaker_loss_threshold:.0%} of bankroll)"
            )

        # Gate 5 — Weekly drawdown cap: 10% of bankroll
        weekly_drawdown = self._compute_weekly_drawdown()
        weekly_cap = self.config.weekly_drawdown_cap
        if weekly_drawdown >= weekly_cap:
            return False, (
                f"Weekly drawdown {weekly_drawdown:.1%} ≥ cap {weekly_cap:.0%}"
            )

        # Gate 6 — Total portfolio exposure
        current_exposure = sum(
            pos.quantity * pos.average_entry_price for pos in self.positions.values()
        )
        max_exposure = ceiling * self.config.max_concurrent_positions
        if current_exposure + position_value > max_exposure:
            return False, (
                f"Total exposure ${current_exposure + position_value:.2f} "
                f"would exceed limit ${max_exposure:.2f}"
            )

        # Gate 7 — Per-market duplicate
        if ticker in self.positions:
            return False, f"Already have an open position in {ticker}"

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
        self._maybe_reset_weekly()
        self.all_trades.append(trade)

        if trade.status in (TradeStatus.FILLED, TradeStatus.PARTIALLY_FILLED):
            self._update_position_from_fill(trade)
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

        # Session drawdown
        current_equity = self._session_start_equity + daily_pnl
        if current_equity > self._session_peak_equity:
            self._session_peak_equity = current_equity
        session_drawdown = (
            (self._session_peak_equity - current_equity) / self._session_peak_equity
            if self._session_peak_equity > 0 else 0.0
        )

        # Weekly drawdown
        weekly_drawdown = self._compute_weekly_drawdown()

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
            open_orders_count=self.metrics.open_orders_count,
            total_exposure=total_exposure,
            daily_pnl=daily_pnl,
            daily_loss=daily_loss,
            unrealized_pnl=unrealized,
            realized_pnl=self._daily_realized_pnl,
            max_drawdown=max(getattr(self.metrics, "max_drawdown", 0.0), session_drawdown),
            current_drawdown=session_drawdown,
            weekly_drawdown=weekly_drawdown,
            win_rate=win_rate,
            ev_per_trade=ev_per_trade,
            circuit_breaker_triggered=self.circuit_breaker_active,
            circuit_breaker_reason=self.circuit_breaker_reason,
            exposure_per_market=exposure_per_market,
            last_updated=now,
        )

        # Check all three circuit-breaker layers
        self._check_circuit_breakers()

    def _check_circuit_breakers(self):
        """
        Auto-trigger the latching circuit breaker when any of the three
        thresholds is breached.  Once triggered, only explicit reset clears it.
        """
        if self.circuit_breaker_active:
            return

        # Layer 1 — Daily loss ≥ 5% of bankroll
        if self.bankroll > 0:
            daily_loss_pct = abs(self.metrics.daily_loss) / self.bankroll
            threshold = self.config.circuit_breaker_loss_threshold
            if self.metrics.daily_loss < 0 and daily_loss_pct >= threshold:
                self.trigger_circuit_breaker(
                    f"Layer-1 daily loss {daily_loss_pct:.1%} ≥ {threshold:.0%} of bankroll"
                )
                return

        # Layer 2 — Weekly drawdown ≥ 10% of bankroll
        if self.metrics.weekly_drawdown >= self.config.weekly_drawdown_cap:
            self.trigger_circuit_breaker(
                f"Layer-2 weekly drawdown {self.metrics.weekly_drawdown:.1%} "
                f"≥ {self.config.weekly_drawdown_cap:.0%}"
            )
            return

        # Layer 3 — Session drawdown ≥ 15% from session peak
        if self.metrics.current_drawdown >= self.config.circuit_breaker_drawdown_threshold:
            self.trigger_circuit_breaker(
                f"Layer-3 session drawdown {self.metrics.current_drawdown:.1%} "
                f"≥ {self.config.circuit_breaker_drawdown_threshold:.0%}"
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
    # Periodic resets
    # ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _current_week_monday() -> date:
        """Return the Monday of the current ISO week (UTC)."""
        today = datetime.utcnow().date()
        return today - timedelta(days=today.weekday())

    def _compute_weekly_drawdown(self) -> float:
        """Drawdown fraction from weekly-start equity."""
        if self._weekly_peak_equity <= 0:
            return 0.0
        current_equity = self._session_start_equity + self._daily_realized_pnl
        # Update weekly peak
        if current_equity > self._weekly_peak_equity:
            self._weekly_peak_equity = current_equity
        return max(
            0.0,
            (self._weekly_peak_equity - current_equity) / self._weekly_peak_equity,
        )

    def _maybe_reset_daily(self):
        """Reset daily accumulators at UTC midnight. Layer-1 circuit breaker auto-clears."""
        today = datetime.utcnow().date()
        if today > self._daily_date:
            logger.info(
                f"Day rollover: resetting daily metrics "
                f"(previous daily P&L ${self._daily_realized_pnl:.2f})"
            )
            self._daily_date = today
            self._daily_realized_pnl = 0.0
            # Auto-reset only if the daily-loss breaker was the trigger
            if self.circuit_breaker_active and "Layer-1" in self.circuit_breaker_reason:
                self.reset_circuit_breaker()

    def _maybe_reset_weekly(self):
        """Reset weekly accumulators at Monday 00:00 UTC. Layer-2 circuit breaker auto-clears."""
        monday = self._current_week_monday()
        if monday > self._weekly_start_date:
            logger.info(
                f"Week rollover: resetting weekly drawdown tracking "
                f"(weekly start equity ${self._weekly_start_equity:,.2f})"
            )
            self._weekly_start_date = monday
            self._weekly_start_equity = self._session_start_equity + self._daily_realized_pnl
            self._weekly_peak_equity = self._weekly_start_equity
            # Auto-reset only if the weekly-drawdown breaker was the trigger
            if self.circuit_breaker_active and "Layer-2" in self.circuit_breaker_reason:
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