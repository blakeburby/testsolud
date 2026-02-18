"""
FastAPI REST routes for trading bot control and monitoring.
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, List
from datetime import datetime
import httpx

from models.trade import Trade
from models.strategy import StrategySignal

router = APIRouter()


@router.get("/price-history")
async def get_price_history(
    startTime: int,
    endTime: int,
    symbol: str = "SOLUSDT",
    interval: str = "1m",
    limit: int = 1000,
) -> list:
    """Proxy Binance kline data server-side to avoid browser CORS restrictions."""
    params = {
        "symbol": symbol,
        "interval": interval,
        "startTime": str(startTime),
        "endTime": str(endTime),
        "limit": str(limit),
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get("https://api.binance.com/api/v3/klines", params=params)
    if not res.is_success:
        raise HTTPException(status_code=res.status_code, detail="Upstream price data unavailable")
    return res.json()


@router.get("/health")
async def health_check() -> Dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "kalshi-trading-bot",
    }


@router.get("/status")
async def get_status(trading_bot) -> Dict:
    """Get current bot status."""
    return {
        "running": trading_bot.running,
        "dry_run": trading_bot.dry_run,
        "enabled_strategies": [s.name for s in trading_bot.strategies if s.is_enabled()],
        "risk_metrics": trading_bot.risk_manager.get_metrics().__dict__,
        "order_summary": trading_bot.order_manager.get_order_summary(),
        "position_summary": trading_bot.risk_manager.get_position_summary(),
    }


@router.post("/start")
async def start_bot(trading_bot) -> Dict:
    """Start the trading bot."""
    if trading_bot.running:
        raise HTTPException(status_code=400, detail="Bot is already running")

    await trading_bot.start()
    return {"message": "Bot started successfully"}


@router.post("/stop")
async def stop_bot(trading_bot) -> Dict:
    """Stop the trading bot."""
    if not trading_bot.running:
        raise HTTPException(status_code=400, detail="Bot is not running")

    await trading_bot.stop()
    return {"message": "Bot stopped successfully"}


@router.post("/circuit-breaker/reset")
async def reset_circuit_breaker(trading_bot) -> Dict:
    """Reset the circuit breaker."""
    trading_bot.risk_manager.reset_circuit_breaker()
    return {"message": "Circuit breaker reset"}


@router.get("/trades")
async def get_trades(
    trading_bot,
    limit: int = 100,
    status: str = None,
) -> List[Trade]:
    """Get trade history."""
    trades = trading_bot.order_manager.get_completed_orders(limit=limit)

    if status:
        trades = [t for t in trades if t.status.value == status]

    return trades


@router.get("/trades/active")
async def get_active_trades(trading_bot) -> List[Trade]:
    """Get active (pending) trades."""
    return trading_bot.order_manager.get_active_orders()


@router.post("/trades/{trade_id}/cancel")
async def cancel_trade(trading_bot, trade_id: str) -> Dict:
    """Cancel an active trade."""
    success = await trading_bot.order_manager.cancel_order(trade_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"Trade {trade_id} not found or cannot be cancelled")

    return {"message": f"Trade {trade_id} cancelled"}


@router.get("/positions")
async def get_positions(trading_bot) -> Dict:
    """Get current positions."""
    return trading_bot.risk_manager.get_position_summary()


@router.get("/strategies")
async def get_strategies(trading_bot) -> List[Dict]:
    """Get strategy information."""
    return [s.get_metrics() for s in trading_bot.strategies]


@router.post("/strategies/{strategy_name}/enable")
async def enable_strategy(trading_bot, strategy_name: str) -> Dict:
    """Enable a strategy."""
    strategy = next((s for s in trading_bot.strategies if s.name == strategy_name), None)

    if not strategy:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_name}' not found")

    strategy.enabled = True
    return {"message": f"Strategy '{strategy_name}' enabled"}


@router.post("/strategies/{strategy_name}/disable")
async def disable_strategy(trading_bot, strategy_name: str) -> Dict:
    """Disable a strategy."""
    strategy = next((s for s in trading_bot.strategies if s.name == strategy_name), None)

    if not strategy:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_name}' not found")

    strategy.enabled = False
    return {"message": f"Strategy '{strategy_name}' disabled"}
