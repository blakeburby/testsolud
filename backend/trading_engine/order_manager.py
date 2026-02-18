"""
Order management system coordinating execution and tracking.
"""
import asyncio
from typing import Dict, List, Optional
from datetime import datetime
from uuid import uuid4

from models.trade import Trade, TradeStatus, TradeSide, OrderType
from models.strategy import StrategySignal
from trading_engine.kalshi_client import KalshiClient
from trading_engine.risk_manager import RiskManager
from utils.logger import get_logger

logger = get_logger(__name__)


class OrderManager:
    """
    Manages order execution, tracking, and lifecycle.
    """

    def __init__(
        self,
        kalshi_client: KalshiClient,
        risk_manager: RiskManager,
        dry_run: bool = True,
    ):
        """
        Initialize order manager.

        Args:
            kalshi_client: Kalshi API client
            risk_manager: Risk manager instance
            dry_run: Paper trading mode
        """
        self.kalshi_client = kalshi_client
        self.risk_manager = risk_manager
        self.dry_run = dry_run

        # Order tracking
        self.active_orders: Dict[str, Trade] = {}
        self.completed_orders: List[Trade] = []

        # Monitoring task
        self._monitor_task: Optional[asyncio.Task] = None
        self._running = False

        logger.info(f"Order manager initialized (dry_run={dry_run})")

    async def execute_signal(self, signal: StrategySignal) -> Optional[Trade]:
        """
        Execute a trading signal.

        Args:
            signal: Strategy signal to execute

        Returns:
            Trade object if executed, None if rejected
        """
        # Validate signal
        if not signal.is_valid:
            logger.warning(f"Signal expired or invalid: {signal.ticker}")
            return None

        # Check edge requirements
        edge_ok, edge_reason = self.risk_manager.validate_signal_edge(
            signal.edge,
            signal.confidence
        )
        if not edge_ok:
            logger.warning(f"Signal rejected - {edge_reason}")
            return None

        # Check risk limits
        position_value = signal.recommended_quantity * (signal.recommended_price or 0.5)
        risk_ok, risk_reason = self.risk_manager.check_trade_allowed(
            signal.ticker,
            signal.recommended_quantity,
            signal.recommended_price or 0.5,
        )
        if not risk_ok:
            logger.warning(f"Trade rejected - {risk_reason}")
            return None

        # Create trade
        trade = Trade(
            trade_id=str(uuid4()),
            ticker=signal.ticker,
            side=TradeSide.YES if signal.direction.value == "yes" else TradeSide.NO,
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

        # Execute order
        try:
            executed_trade = await self.kalshi_client.place_order(
                ticker=trade.ticker,
                side=trade.side,
                quantity=trade.quantity,
                order_type=trade.order_type,
                price=trade.price,
                dry_run=self.dry_run,
            )

            # Update trade with execution details
            if executed_trade.order_id:
                trade.order_id = executed_trade.order_id
                trade.status = executed_trade.status
                trade.submitted_at = executed_trade.submitted_at

            # Track active order
            if trade.status in [TradeStatus.SUBMITTED, TradeStatus.PENDING]:
                self.active_orders[trade.trade_id] = trade

            # Record with risk manager
            self.risk_manager.record_trade(trade)

            logger.info(
                f"✅ Executed {trade.side.value} signal on {trade.ticker}: "
                f"{trade.quantity} @ {trade.price:.3f} (edge: {signal.edge:.3f})"
            )

            return trade

        except Exception as e:
            logger.error(f"Failed to execute signal: {e}")
            trade.status = TradeStatus.FAILED
            trade.notes = str(e)
            return trade

    async def cancel_order(self, trade_id: str) -> bool:
        """
        Cancel an active order.

        Args:
            trade_id: Internal trade ID

        Returns:
            True if cancelled successfully
        """
        if trade_id not in self.active_orders:
            logger.warning(f"Trade {trade_id} not found in active orders")
            return False

        trade = self.active_orders[trade_id]

        if not trade.order_id:
            logger.warning(f"Trade {trade_id} has no Kalshi order ID")
            return False

        try:
            success = await self.kalshi_client.cancel_order(
                trade.order_id,
                dry_run=self.dry_run
            )

            if success:
                trade.status = TradeStatus.CANCELLED
                trade.cancelled_at = datetime.utcnow()
                self.completed_orders.append(trade)
                del self.active_orders[trade_id]
                logger.info(f"Order cancelled: {trade_id}")

            return success

        except Exception as e:
            logger.error(f"Failed to cancel order {trade_id}: {e}")
            return False

    async def start_monitoring(self):
        """Start background task to monitor active orders."""
        if self._running:
            logger.warning("Order monitoring already running")
            return

        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_orders())
        logger.info("Started order monitoring")

    async def stop_monitoring(self):
        """Stop order monitoring."""
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        logger.info("Stopped order monitoring")

    async def _monitor_orders(self):
        """Background task to monitor and update active orders."""
        while self._running:
            try:
                # Update status of active orders
                for trade_id, trade in list(self.active_orders.items()):
                    if trade.order_id and not self.dry_run:
                        try:
                            status_data = await self.kalshi_client.get_order_status(trade.order_id)
                            self._update_trade_from_status(trade, status_data)

                            # Move to completed if final state
                            if trade.status in [
                                TradeStatus.FILLED,
                                TradeStatus.CANCELLED,
                                TradeStatus.REJECTED,
                                TradeStatus.FAILED,
                            ]:
                                self.completed_orders.append(trade)
                                del self.active_orders[trade_id]
                                self.risk_manager.record_trade(trade)

                        except Exception as e:
                            logger.error(f"Failed to update order {trade.order_id}: {e}")

                # Sleep before next check
                await asyncio.sleep(2)  # Check every 2 seconds

            except Exception as e:
                logger.error(f"Error in order monitoring: {e}")
                await asyncio.sleep(5)

    def _update_trade_from_status(self, trade: Trade, status_data: Dict):
        """Update trade object from Kalshi order status."""
        order = status_data.get("order", {})

        # Update status
        kalshi_status = order.get("status", "").lower()
        if kalshi_status == "resting":
            trade.status = TradeStatus.SUBMITTED
        elif kalshi_status == "filled":
            trade.status = TradeStatus.FILLED
            trade.filled_at = datetime.utcnow()
        elif kalshi_status == "canceled":
            trade.status = TradeStatus.CANCELLED
            trade.cancelled_at = datetime.utcnow()

        # Update fill details
        if "fill_count" in order:
            trade.filled_quantity = order["fill_count"]

        if "fill_price" in order and order["fill_price"]:
            trade.average_fill_price = order["fill_price"] / 100  # Convert cents to dollars

        # Calculate cost and P&L
        if trade.filled_quantity > 0 and trade.average_fill_price:
            trade.cost = trade.filled_quantity * trade.average_fill_price

    def get_active_orders(self) -> List[Trade]:
        """Get list of active orders."""
        return list(self.active_orders.values())

    def get_completed_orders(self, limit: int = 100) -> List[Trade]:
        """Get recent completed orders."""
        return sorted(
            self.completed_orders,
            key=lambda t: t.created_at,
            reverse=True
        )[:limit]

    def get_order_summary(self) -> Dict:
        """Get summary of order status."""
        return {
            "active_count": len(self.active_orders),
            "completed_count": len(self.completed_orders),
            "filled_count": sum(1 for t in self.completed_orders if t.status == TradeStatus.FILLED),
            "cancelled_count": sum(1 for t in self.completed_orders if t.status == TradeStatus.CANCELLED),
            "failed_count": sum(1 for t in self.completed_orders if t.status == TradeStatus.FAILED),
        }
