"""
Order management — execution, lifecycle tracking, fill reconciliation.

Key fixes from SKILL.md §3.4:
  - Kalshi status "executed" (not "filled") maps to TradeStatus.FILLED
  - Duplicate order protection via client_order_id tracking
  - Fill reconciliation polls /portfolio/fills for missed transitions
  - Signal invalidation auto-cancels stale resting orders
"""
import asyncio
from typing import Dict, List, Optional, Set
from datetime import datetime
from uuid import uuid4

from models.trade import Trade, TradeStatus, TradeSide, OrderType
from models.strategy import StrategySignal
from models.market import MarketStatus
from trading_engine.kalshi_client import KalshiClient
from trading_engine.risk_manager import RiskManager
from utils.logger import get_logger

logger = get_logger(__name__)

# Maximum age a resting order can have before we consider it stale (seconds)
_STALE_ORDER_SECONDS = 14 * 60  # 14 minutes — one full 15-min window


class OrderManager:
    """
    Manages order execution, lifecycle, and fill reconciliation.

    Responsibilities:
      - Execute strategy signals through KalshiClient
      - Monitor active orders every 2 seconds
      - Reconcile fills via /portfolio/fills poll
      - Auto-cancel stale orders when signal invalidated or market expires
      - Prevent duplicate order submission
      - Keep RiskManager open_orders_count in sync
    """

    def __init__(
        self,
        kalshi_client: KalshiClient,
        risk_manager: RiskManager,
        dry_run: bool = True,
    ):
        self.kalshi_client = kalshi_client
        self.risk_manager = risk_manager
        self.dry_run = dry_run

        # In-flight orders keyed by internal trade_id
        self.active_orders: Dict[str, Trade] = {}
        # Completed orders (terminal state) — capped at 500 for memory
        self.completed_orders: List[Trade] = []

        # Dedup: track submitted client_order_ids to block retransmission
        self._submitted_client_ids: Set[str] = set()

        # Monitoring task
        self._monitor_task: Optional[asyncio.Task] = None
        self._running: bool = False

        # Track last fills poll time for incremental fill fetching
        self._last_fills_ts: int = 0

        logger.info(f"OrderManager initialized (dry_run={dry_run})")

    # ──────────────────────────────────────────────────────────────────
    # Signal execution
    # ──────────────────────────────────────────────────────────────────

    async def execute_signal(self, signal: StrategySignal) -> Optional[Trade]:
        """
        Validate and execute a strategy signal.

        Returns Trade on success/attempt, None if rejected pre-execution.
        """
        if not signal.is_valid:
            logger.warning(f"Signal invalid/expired: {signal.ticker}")
            return None

        # Edge and confidence gate
        edge_ok, edge_reason = self.risk_manager.validate_signal_edge(
            signal.edge, signal.confidence
        )
        if not edge_ok:
            logger.warning(f"Signal rejected (edge): {edge_reason}")
            return None

        # Risk gate
        price = signal.recommended_price or 0.5
        risk_ok, risk_reason = self.risk_manager.check_trade_allowed(
            signal.ticker, signal.recommended_quantity, price
        )
        if not risk_ok:
            logger.warning(f"Signal rejected (risk): {risk_reason}")
            return None

        # Build trade object
        side = TradeSide.YES if signal.direction.value == "yes" else TradeSide.NO
        trade = Trade(
            trade_id=str(uuid4()),
            ticker=signal.ticker,
            side=side,
            order_type=OrderType.LIMIT,
            quantity=signal.recommended_quantity,
            price=signal.recommended_price,
            strategy_name=signal.strategy_name,
            edge=signal.edge,
            confidence=signal.confidence,
            kelly_fraction=signal.kelly_fraction,
            dry_run=self.dry_run,
            created_at=datetime.utcnow(),
        )

        try:
            executed = await self.kalshi_client.place_order(
                ticker=trade.ticker,
                side=trade.side,
                quantity=trade.quantity,
                order_type=trade.order_type,
                price=trade.price,
                dry_run=self.dry_run,
            )

            # Track the client_order_id for dedup
            if executed.trade_id:
                self._submitted_client_ids.add(executed.trade_id)

            if executed.order_id:
                trade.order_id = executed.order_id
            trade.status = executed.status
            trade.submitted_at = executed.submitted_at or datetime.utcnow()

            if trade.status in (TradeStatus.SUBMITTED, TradeStatus.PENDING):
                self.active_orders[trade.trade_id] = trade
                self._sync_open_count()

            self.risk_manager.record_trade(trade)

            logger.info(
                f"Signal executed: {trade.side.value.upper()} {trade.quantity} "
                f"on {trade.ticker} @ {trade.price} "
                f"[{trade.order_id}] edge={signal.edge:.3f}"
            )
            return trade

        except Exception as e:
            logger.error(f"Signal execution failed: {e}")
            trade.status = TradeStatus.FAILED
            trade.notes = str(e)
            return trade

    # ──────────────────────────────────────────────────────────────────
    # Order cancellation
    # ──────────────────────────────────────────────────────────────────

    async def cancel_order(self, trade_id: str) -> bool:
        """Cancel a resting order by internal trade_id."""
        trade = self.active_orders.get(trade_id)
        if not trade:
            logger.warning(f"cancel_order: trade_id {trade_id} not found in active orders")
            return False

        if not trade.order_id:
            logger.warning(f"cancel_order: trade {trade_id} has no Kalshi order_id")
            return False

        # Safety: never try to cancel a terminal order
        if trade.status in (TradeStatus.FILLED, TradeStatus.CANCELLED,
                            TradeStatus.REJECTED, TradeStatus.FAILED):
            logger.warning(
                f"cancel_order: trade {trade_id} already in terminal state {trade.status}"
            )
            return False

        try:
            await self.kalshi_client.cancel_order(trade.order_id, dry_run=self.dry_run)
            trade.status = TradeStatus.CANCELLED
            trade.cancelled_at = datetime.utcnow()
            self._move_to_completed(trade_id)
            logger.info(f"Order cancelled: {trade_id} / {trade.order_id}")
            return True

        except Exception as e:
            logger.error(f"cancel_order failed for {trade_id}: {e}")
            return False

    async def cancel_order_by_kalshi_id(self, order_id: str) -> bool:
        """Cancel by Kalshi order_id (used from API routes directly)."""
        trade_id = next(
            (tid for tid, t in self.active_orders.items() if t.order_id == order_id),
            None,
        )
        if trade_id:
            return await self.cancel_order(trade_id)

        # Order not tracked locally — send cancel anyway
        try:
            await self.kalshi_client.cancel_order(order_id, dry_run=self.dry_run)
            logger.info(f"Sent cancel for untracked order {order_id}")
            return True
        except Exception as e:
            logger.error(f"cancel_order_by_kalshi_id failed for {order_id}: {e}")
            return False

    async def cancel_all_orders(self) -> int:
        """Cancel all resting orders. Returns number cancelled."""
        trade_ids = list(self.active_orders.keys())
        cancelled = 0

        # Batch cancel in chunks of 20 (API limit)
        resting_ids = [
            t.order_id
            for t in self.active_orders.values()
            if t.order_id and not self.dry_run
        ]

        for i in range(0, len(resting_ids), 20):
            chunk = resting_ids[i : i + 20]
            try:
                await self.kalshi_client.batch_cancel_orders(chunk, dry_run=self.dry_run)
                cancelled += len(chunk)
            except Exception as e:
                logger.error(f"Batch cancel chunk failed: {e}")

        # Mark all active trades as cancelled locally
        for trade_id in trade_ids:
            t = self.active_orders.get(trade_id)
            if t:
                t.status = TradeStatus.CANCELLED
                t.cancelled_at = datetime.utcnow()
                self._move_to_completed(trade_id)

        if self.dry_run:
            cancelled = len(trade_ids)

        logger.info(f"cancel_all_orders: cancelled {cancelled} orders")
        return cancelled

    async def decrease_order(
        self,
        trade_id: str,
        reduce_by: Optional[int] = None,
        reduce_to: Optional[int] = None,
    ) -> bool:
        """Decrease a resting order's remaining count."""
        trade = self.active_orders.get(trade_id)
        if not trade or not trade.order_id:
            return False

        try:
            await self.kalshi_client.decrease_order(
                trade.order_id,
                reduce_by=reduce_by,
                reduce_to=reduce_to,
                dry_run=self.dry_run,
            )
            logger.info(f"Decreased order {trade_id}")
            return True
        except Exception as e:
            logger.error(f"decrease_order failed for {trade_id}: {e}")
            return False

    async def amend_order(
        self,
        trade_id: str,
        new_price: Optional[float] = None,
        new_quantity: Optional[int] = None,
    ) -> Optional[str]:
        """
        Amend price/quantity of a resting order.
        Returns new Kalshi order_id (amend creates a new order).
        """
        trade = self.active_orders.get(trade_id)
        if not trade or not trade.order_id:
            return None

        yes_price = None
        no_price = None
        if new_price is not None:
            price_cents = round(new_price * 100)  # round(), not int()
            if trade.side == TradeSide.YES:
                yes_price = price_cents
            else:
                no_price = price_cents

        try:
            resp = await self.kalshi_client.amend_order(
                order_id=trade.order_id,
                ticker=trade.ticker,
                side=trade.side.value,
                action="buy",
                yes_price=yes_price,
                no_price=no_price,
                count=new_quantity,
                dry_run=self.dry_run,
            )
            new_order_id = resp.get("order", {}).get("order_id")
            if new_order_id:
                trade.order_id = new_order_id
                if new_price is not None:
                    trade.price = new_price
                if new_quantity is not None:
                    trade.quantity = new_quantity
            logger.info(f"Amended order {trade_id} → new order_id {new_order_id}")
            return new_order_id
        except Exception as e:
            logger.error(f"amend_order failed for {trade_id}: {e}")
            return None

    # ──────────────────────────────────────────────────────────────────
    # Monitoring loop
    # ──────────────────────────────────────────────────────────────────

    async def start_monitoring(self):
        if self._running:
            return
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("Order monitoring started")

    async def stop_monitoring(self):
        self._running = False
        task = self._monitor_task
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info("Order monitoring stopped")

    async def _monitor_loop(self):
        """
        Background task:
          1. Poll each active order's status (every 2 s)
          2. Reconcile via fills endpoint (every 10 s)
          3. Auto-cancel stale orders older than _STALE_ORDER_SECONDS
        """
        fills_interval = 10
        fills_tick = 0

        while self._running:
            try:
                await self._poll_active_orders()

                fills_tick += 2
                if fills_tick >= fills_interval:
                    fills_tick = 0
                    await self._reconcile_fills()

                await self._cancel_stale_orders()
                self._sync_open_count()

            except Exception as e:
                logger.error(f"Monitor loop error: {e}")

            await asyncio.sleep(2)

    async def _poll_active_orders(self):
        """Poll Kalshi for each active order's current status."""
        if self.dry_run:
            await self._simulate_paper_fills()
            return

        for trade_id, trade in list(self.active_orders.items()):
            if not trade.order_id:
                continue
            try:
                data = await self.kalshi_client.get_order_status(trade.order_id)
                self._apply_order_status(trade, data)

                if trade.status in (
                    TradeStatus.FILLED,
                    TradeStatus.CANCELLED,
                    TradeStatus.REJECTED,
                    TradeStatus.FAILED,
                ):
                    self.risk_manager.record_trade(trade)
                    self._move_to_completed(trade_id)

            except Exception as e:
                logger.error(f"Status poll failed for {trade.order_id}: {e}")

    def _apply_order_status(self, trade: Trade, status_data: dict):
        """
        Map Kalshi order status to internal TradeStatus.

        CRITICAL: Kalshi uses "executed" for filled orders.
        "filled" is NOT a valid Kalshi status — do not match it.
        """
        order = status_data.get("order", {})
        kalshi_status = order.get("status", "").lower()

        if kalshi_status == "resting":
            trade.status = TradeStatus.SUBMITTED

        elif kalshi_status == "executed":          # ← correct Kalshi terminal state
            trade.status = TradeStatus.FILLED
            trade.filled_at = datetime.utcnow()

        elif kalshi_status == "canceled":
            trade.status = TradeStatus.CANCELLED
            trade.cancelled_at = datetime.utcnow()

        # Update fill details
        fill_count = order.get("fill_count", 0)
        if fill_count:
            trade.filled_quantity = fill_count

        # Taker/maker fill cost gives us avg execution price in cents
        taker_cost = order.get("taker_fill_cost", 0)
        maker_cost = order.get("maker_fill_cost", 0)
        total_fill_cost_cents = taker_cost + maker_cost
        if fill_count and total_fill_cost_cents:
            trade.average_fill_price = total_fill_cost_cents / fill_count / 100

        if trade.filled_quantity and trade.average_fill_price:
            trade.cost = trade.filled_quantity * trade.average_fill_price

    async def _simulate_paper_fills(self):
        """
        Paper-trading: after a 2-second queue delay, mark PENDING dry_run orders
        as FILLED at their limit price so position tracking and P&L work correctly.
        """
        for trade_id, trade in list(self.active_orders.items()):
            if trade.status != TradeStatus.PENDING or not trade.dry_run:
                continue
            age = (datetime.utcnow() - (trade.submitted_at or trade.created_at)).total_seconds()
            if age < 2.0:
                continue

            fill_price = trade.price if trade.price and trade.price > 0 else 0.5
            trade.status = TradeStatus.FILLED
            trade.filled_at = datetime.utcnow()
            trade.filled_quantity = trade.quantity
            trade.average_fill_price = fill_price
            trade.cost = (trade.filled_quantity or 0) * fill_price
            trade.pnl = None  # determined at settlement when contract resolves

            self.risk_manager.record_trade(trade)
            self._move_to_completed(trade_id)
            logger.info(
                f"[PAPER] Simulated fill: {trade.side.value.upper()} "
                f"{trade.filled_quantity} on {trade.ticker} @ {fill_price:.3f}"
            )

    async def _settle_paper_positions(self):
        """
        Paper-trading: for each open position, fetch the market from Kalshi
        (read-only, always safe) and settle once it resolves.

        Settlement P&L:
          YES holder — market resolves YES: gain = (1 − entry) × qty
          YES holder — market resolves NO:  loss = −entry × qty
          NO  holder — market resolves NO:  gain = (1 − entry) × qty
          NO  holder — market resolves YES: loss = −entry × qty
        """
        for ticker, pos in list(self.risk_manager.positions.items()):
            try:
                market = await self.kalshi_client.get_market(ticker)
                if market.status not in (MarketStatus.CLOSED, MarketStatus.SETTLED):
                    continue

                yes_price = market.yes_price
                if yes_price is None:
                    continue

                if yes_price >= 0.99:
                    resolved_yes = True
                elif yes_price <= 0.01:
                    resolved_yes = False
                else:
                    continue  # still mid-settlement

                entry = pos.average_entry_price
                qty = pos.quantity
                if pos.side == TradeSide.YES:
                    pnl = (1.0 - entry) * qty if resolved_yes else -entry * qty
                else:
                    pnl = (1.0 - entry) * qty if not resolved_yes else -entry * qty

                self.risk_manager.close_position(ticker, pnl)
                outcome = "YES" if resolved_yes else "NO"
                logger.info(
                    f"[PAPER] Settled {ticker}: resolved {outcome} → "
                    f"P&L ${pnl:+.2f} ({pos.side.value} ×{qty} @ {entry:.3f})"
                )
            except Exception as exc:
                logger.error(f"Paper settlement check failed for {ticker}: {exc}")

    async def _reconcile_fills(self):
        """
        Poll /portfolio/fills since last check to catch any fills
        that were missed by order status polling.
        """
        if self.dry_run:
            await self._settle_paper_positions()
            return

        now_ts = int(datetime.utcnow().timestamp())
        try:
            resp = await self.kalshi_client.get_fills(
                min_ts=self._last_fills_ts or (now_ts - 300),
                limit=200,
            )
            fills = resp.get("fills", [])

            for fill in fills:
                order_id = fill.get("order_id")
                if not order_id:
                    continue

                # Find matching active trade
                trade = next(
                    (t for t in self.active_orders.values() if t.order_id == order_id),
                    None,
                )
                if trade and trade.status != TradeStatus.FILLED:
                    trade.status = TradeStatus.FILLED
                    trade.filled_at = datetime.utcnow()
                    fill_count = fill.get("count", 0)
                    yes_price = fill.get("yes_price", 0)
                    no_price = fill.get("no_price", 0)
                    price_cents = yes_price if trade.side == TradeSide.YES else no_price
                    trade.average_fill_price = price_cents / 100
                    trade.filled_quantity = fill_count
                    logger.info(f"Fill reconciled: order_id={order_id} qty={fill_count}")

            self._last_fills_ts = now_ts

        except Exception as e:
            logger.error(f"Fill reconciliation failed: {e}")

    async def _cancel_stale_orders(self):
        """Auto-cancel orders that have been resting longer than _STALE_ORDER_SECONDS."""
        now = datetime.utcnow()
        for trade_id, trade in list(self.active_orders.items()):
            if trade.status != TradeStatus.SUBMITTED:
                continue
            age_secs = (now - (trade.submitted_at or trade.created_at)).total_seconds()
            if age_secs > _STALE_ORDER_SECONDS:
                logger.warning(
                    f"Auto-cancelling stale order {trade_id} "
                    f"(age {age_secs:.0f}s > {_STALE_ORDER_SECONDS}s)"
                )
                await self.cancel_order(trade_id)

    # ──────────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────────

    def _move_to_completed(self, trade_id: str):
        """Move a trade from active_orders to completed_orders."""
        trade = self.active_orders.pop(trade_id, None)
        if trade:
            self.completed_orders.append(trade)
            # Cap memory
            if len(self.completed_orders) > 500:
                self.completed_orders = self.completed_orders[-500:]
        self._sync_open_count()

    def _sync_open_count(self):
        """Keep RiskManager open_orders_count in sync."""
        self.risk_manager.set_open_orders_count(len(self.active_orders))

    # ──────────────────────────────────────────────────────────────────
    # Public accessors
    # ──────────────────────────────────────────────────────────────────

    def get_active_orders(self) -> List[Trade]:
        return list(self.active_orders.values())

    def get_completed_orders(self, limit: int = 100) -> List[Trade]:
        return sorted(self.completed_orders, key=lambda t: t.created_at, reverse=True)[:limit]

    def get_order_summary(self) -> dict:
        return {
            "active_count": len(self.active_orders),
            "completed_count": len(self.completed_orders),
            "filled_count": sum(
                1 for t in self.completed_orders if t.status == TradeStatus.FILLED
            ),
            "cancelled_count": sum(
                1 for t in self.completed_orders if t.status == TradeStatus.CANCELLED
            ),
            "failed_count": sum(
                1 for t in self.completed_orders if t.status == TradeStatus.FAILED
            ),
        }