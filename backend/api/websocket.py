"""
WebSocket handler for real-time updates to dashboard.
"""
import asyncio
import json
from typing import Set, Optional
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

from utils.logger import get_logger


def _json_default(obj):
    """JSON serializer for objects not serializable by default."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _safe_dict(obj) -> dict:
    """Convert object's __dict__ to a JSON-safe dict."""
    result = {}
    for k, v in obj.__dict__.items():
        if isinstance(v, datetime):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result

logger = get_logger(__name__)


class WebSocketManager:
    """
    Manages WebSocket connections and broadcasts updates.
    """

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._broadcast_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal(self, message: dict, websocket: WebSocket):
        """Send a message to a specific connection."""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send message: {e}")

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return

        disconnected = set()

        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to connection: {e}")
                disconnected.add(connection)

        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast_status(self, trading_bot):
        """Broadcast bot status update."""
        status = {
            "type": "status_update",
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "running": trading_bot.running,
                "dry_run": trading_bot.dry_run,
                "enabled_strategies": [s.name for s in trading_bot.strategies if s.is_enabled()],
                "risk_metrics": _safe_dict(trading_bot.risk_manager.get_metrics()),
                "order_summary": trading_bot.order_manager.get_order_summary(),
                "positions": trading_bot.risk_manager.get_position_summary(),
            }
        }
        await self.broadcast(status)

    async def broadcast_signal(self, signal: dict):
        """Broadcast a new trading signal."""
        message = {
            "type": "trading_signal",
            "timestamp": datetime.utcnow().isoformat(),
            "data": signal,
        }
        await self.broadcast(message)

    async def broadcast_trade(self, trade: dict):
        """Broadcast a new trade execution."""
        message = {
            "type": "trade_execution",
            "timestamp": datetime.utcnow().isoformat(),
            "data": trade,
        }
        await self.broadcast(message)

    async def broadcast_alert(self, alert_type: str, message: str, level: str = "info"):
        """Broadcast an alert/notification."""
        alert = {
            "type": "alert",
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "alert_type": alert_type,
                "message": message,
                "level": level,  # info, warning, error, critical
            }
        }
        await self.broadcast(alert)

    async def handle_message(self, websocket: WebSocket, message: dict, trading_bot):
        """Handle incoming WebSocket messages from dashboard."""
        msg_type = message.get("type")

        if msg_type == "ping":
            await self.send_personal({"type": "pong"}, websocket)

        elif msg_type == "get_status":
            status = {
                "type": "status_update",
                "timestamp": datetime.utcnow().isoformat(),
                "data": {
                    "running": trading_bot.running,
                    "dry_run": trading_bot.dry_run,
                    "risk_metrics": _safe_dict(trading_bot.risk_manager.get_metrics()),
                }
            }
            await self.send_personal(status, websocket)

        elif msg_type == "start_bot":
            if not trading_bot.running:
                await trading_bot.start()
                await self.broadcast_alert("bot_control", "Trading bot started", "info")

        elif msg_type == "stop_bot":
            if trading_bot.running:
                await trading_bot.stop()
                await self.broadcast_alert("bot_control", "Trading bot stopped", "warning")

        else:
            logger.warning(f"Unknown message type: {msg_type}")


# Global WebSocket manager instance
ws_manager = WebSocketManager()
