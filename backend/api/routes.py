"""
FastAPI REST routes — trading bot control, monitoring, and portfolio endpoints.

Route pattern (matches existing codebase):
  - APIRouter() with no prefix; /api prefix added at mount in main.py
  - trading_bot passed as parameter (not via Depends())
  - All dollar amounts returned in both cents (raw) and dollars (display)
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel
import httpx

from models.trade import Trade

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# External price proxy
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/price-history")
async def get_price_history(
    startTime: int,
    endTime: int,
    symbol: str = "SOLUSD",
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
        res = await client.get("https://api.binance.us/api/v3/klines", params=params)
    if not res.is_success:
        raise HTTPException(status_code=res.status_code, detail="Upstream price data unavailable")
    return res.json()


# ──────────────────────────────────────────────────────────────────────────────
# Health & status
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health_check() -> Dict:
    """Liveness probe — returns 200 even if bot is stopped."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "kalshi-trading-bot",
    }


@router.get("/status")
async def get_status(trading_bot) -> Dict:
    """Full bot status snapshot — risk metrics, orders, positions, health."""
    risk_metrics = trading_bot.risk_manager.get_metrics()
    client_health = trading_bot.kalshi_client.get_health_info()

    return {
        "running": trading_bot.running,
        "dry_run": trading_bot.dry_run,
        "enabled_strategies": [s.name for s in trading_bot.strategies if s.is_enabled()],
        "risk_metrics": risk_metrics.to_dict(),
        "order_summary": trading_bot.order_manager.get_order_summary(),
        "position_summary": trading_bot.risk_manager.get_position_summary(),
        "client_health": client_health,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/system/health")
async def get_system_health(trading_bot) -> Dict:
    """Detailed system health for operator dashboard health panel."""
    client_health = trading_bot.kalshi_client.get_health_info()
    risk = trading_bot.risk_manager.get_metrics()
    return {
        "api_connected": client_health["healthy"],
        "auth_ok": client_health["consecutive_errors"] == 0,
        "last_successful_request": client_health["last_successful_request"],
        "consecutive_errors": client_health["consecutive_errors"],
        "total_requests": client_health["total_requests"],
        "circuit_breaker_active": risk.circuit_breaker_triggered,
        "circuit_breaker_reason": risk.circuit_breaker_reason,
        "bot_running": trading_bot.running,
        "dry_run_mode": trading_bot.dry_run,
        "open_orders": risk.open_orders_count,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Bot lifecycle
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_bot(trading_bot) -> Dict:
    """Start the trading bot."""
    if trading_bot.running:
        raise HTTPException(status_code=400, detail="Bot is already running")
    await trading_bot.start()
    return {"message": "Bot started", "dry_run": trading_bot.dry_run}


@router.post("/stop")
async def stop_bot(trading_bot) -> Dict:
    """Stop the trading bot (does not cancel orders)."""
    if not trading_bot.running:
        raise HTTPException(status_code=400, detail="Bot is not running")
    await trading_bot.stop()
    return {"message": "Bot stopped"}


# ──────────────────────────────────────────────────────────────────────────────
# Emergency controls
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/emergency/halt")
async def emergency_halt(trading_bot) -> Dict:
    """
    HALT ALL TRADING — stops bot, cancels all resting orders, disables strategies.
    This is the big red button. Requires manual restart.
    """
    # 1. Stop the bot loop
    if trading_bot.running:
        await trading_bot.stop()

    # 2. Disable all strategies
    for s in trading_bot.strategies:
        s.enabled = False

    # 3. Cancel all resting orders
    cancelled = await trading_bot.order_manager.cancel_all_orders()

    # 4. Trigger circuit breaker (latching — requires manual reset)
    trading_bot.risk_manager.trigger_circuit_breaker("OPERATOR EMERGENCY HALT")

    return {
        "message": "EMERGENCY HALT EXECUTED",
        "orders_cancelled": cancelled,
        "strategies_disabled": len(trading_bot.strategies),
        "circuit_breaker": True,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/emergency/cancel-all")
async def cancel_all_orders(trading_bot) -> Dict:
    """Cancel all resting orders without stopping the bot."""
    cancelled = await trading_bot.order_manager.cancel_all_orders()
    return {"message": f"Cancelled {cancelled} orders", "count": cancelled}


# ──────────────────────────────────────────────────────────────────────────────
# Circuit breaker
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/circuit-breaker/reset")
async def reset_circuit_breaker(trading_bot) -> Dict:
    """Manually reset circuit breaker after operator review."""
    trading_bot.risk_manager.reset_circuit_breaker()
    return {"message": "Circuit breaker reset"}


# ──────────────────────────────────────────────────────────────────────────────
# Portfolio — balance, positions, fills, settlements
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/balance")
async def get_balance(trading_bot) -> Dict:
    """Live account balance from Kalshi (cents + dollars)."""
    data = await trading_bot.kalshi_client.get_balance()
    balance_cents = data.get("balance", 0)
    portfolio_cents = data.get("portfolio_value", 0)
    return {
        "balance_cents": balance_cents,
        "portfolio_value_cents": portfolio_cents,
        "balance_dollars": balance_cents / 100,
        "portfolio_value_dollars": portfolio_cents / 100,
        "total_value_dollars": (balance_cents + portfolio_cents) / 100,
    }


@router.get("/positions")
async def get_positions(trading_bot) -> Dict:
    """Current positions — Kalshi live data merged with local tracking."""
    local = trading_bot.risk_manager.get_position_summary()
    try:
        live = await trading_bot.kalshi_client.get_positions()
        market_positions = live.get("market_positions", [])
    except Exception:
        market_positions = []
    return {
        **local,
        "kalshi_positions": market_positions,
    }


@router.get("/fills")
async def get_fills(
    trading_bot,
    ticker: Optional[str] = None,
    limit: int = 100,
) -> Dict:
    """Recent fill history from Kalshi."""
    return await trading_bot.kalshi_client.get_fills(ticker=ticker, limit=limit)


@router.get("/settlements")
async def get_settlements(trading_bot, limit: int = 100) -> Dict:
    """Market settlement history."""
    return await trading_bot.kalshi_client.get_settlements(limit=limit)


# ──────────────────────────────────────────────────────────────────────────────
# Orders
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/orders")
async def list_orders(
    trading_bot,
    status: Optional[str] = None,
    ticker: Optional[str] = None,
) -> Dict:
    """List orders from Kalshi (status: resting | canceled | executed)."""
    return await trading_bot.kalshi_client.get_orders_list(status=status, ticker=ticker)


@router.get("/trades")
async def get_trades(
    trading_bot,
    limit: int = 100,
    status: Optional[str] = None,
) -> List[Trade]:
    """Local completed trade history."""
    trades = trading_bot.order_manager.get_completed_orders(limit=limit)
    if status:
        trades = [t for t in trades if t.status.value == status]
    return trades


@router.get("/trades/active")
async def get_active_trades(trading_bot) -> List[Trade]:
    """Currently active (pending/submitted) orders."""
    return trading_bot.order_manager.get_active_orders()


@router.post("/trades/{trade_id}/cancel")
async def cancel_trade(trading_bot, trade_id: str) -> Dict:
    """Cancel a specific active trade by internal trade_id."""
    success = await trading_bot.order_manager.cancel_order(trade_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Trade {trade_id} not found or not cancellable")
    return {"message": f"Trade {trade_id} cancelled"}


class DecreaseRequest(BaseModel):
    reduce_by: Optional[int] = None
    reduce_to: Optional[int] = None


@router.post("/trades/{trade_id}/decrease")
async def decrease_trade(trading_bot, trade_id: str, req: DecreaseRequest) -> Dict:
    """Decrease a resting order's remaining size."""
    if req.reduce_by is None and req.reduce_to is None:
        raise HTTPException(status_code=400, detail="Provide reduce_by or reduce_to")
    if req.reduce_by is not None and req.reduce_to is not None:
        raise HTTPException(status_code=400, detail="Provide reduce_by OR reduce_to, not both")

    success = await trading_bot.order_manager.decrease_order(
        trade_id, reduce_by=req.reduce_by, reduce_to=req.reduce_to
    )
    if not success:
        raise HTTPException(status_code=404, detail=f"Trade {trade_id} not found")
    return {"message": f"Trade {trade_id} decreased"}


class AmendRequest(BaseModel):
    new_price: Optional[float] = None
    new_quantity: Optional[int] = None


@router.post("/trades/{trade_id}/amend")
async def amend_trade(trading_bot, trade_id: str, req: AmendRequest) -> Dict:
    """Amend price/quantity of a resting order (creates new Kalshi order_id)."""
    if req.new_price is None and req.new_quantity is None:
        raise HTTPException(status_code=400, detail="Provide new_price or new_quantity")

    new_order_id = await trading_bot.order_manager.amend_order(
        trade_id, new_price=req.new_price, new_quantity=req.new_quantity
    )
    if new_order_id is None and not trading_bot.dry_run:
        raise HTTPException(status_code=404, detail=f"Trade {trade_id} not found or amend failed")
    return {"message": f"Trade {trade_id} amended", "new_order_id": new_order_id}


@router.get("/orders/queue-positions")
async def get_queue_positions(trading_bot) -> Dict:
    """Live queue positions for all resting orders."""
    return await trading_bot.kalshi_client.get_all_queue_positions()


@router.get("/orders/{order_id}/queue-position")
async def get_queue_position(trading_bot, order_id: str) -> Dict:
    """Live queue position for a specific resting order."""
    return await trading_bot.kalshi_client.get_queue_position(order_id)


# ──────────────────────────────────────────────────────────────────────────────
# Bankroll & risk settings
# ──────────────────────────────────────────────────────────────────────────────

class BankrollUpdate(BaseModel):
    bankroll: float
    kelly_fraction: Optional[float] = None
    max_position_size: Optional[float] = None
    max_daily_loss: Optional[float] = None


@router.post("/bankroll")
async def update_bankroll(trading_bot, req: BankrollUpdate) -> Dict:
    """Update bankroll and risk settings live (takes effect on next trade)."""
    if req.bankroll <= 0:
        raise HTTPException(status_code=400, detail="Bankroll must be > 0")

    trading_bot.risk_manager.bankroll = req.bankroll
    trading_bot.risk_manager.starting_equity = req.bankroll
    if trading_bot.risk_manager.peak_equity < req.bankroll:
        trading_bot.risk_manager.peak_equity = req.bankroll

    if req.max_position_size is not None:
        trading_bot.risk_manager.config.max_position_size = req.max_position_size
    if req.max_daily_loss is not None:
        trading_bot.risk_manager.config.max_daily_loss = req.max_daily_loss

    if req.kelly_fraction is not None:
        for s in trading_bot.strategies:
            if hasattr(s, "config") and hasattr(s.config, "kelly_fraction"):
                s.config.kelly_fraction = req.kelly_fraction

    return {
        "message": "Bankroll updated",
        "bankroll": req.bankroll,
        "max_position_size": trading_bot.risk_manager.config.max_position_size,
        "max_daily_loss": trading_bot.risk_manager.config.max_daily_loss,
    }


@router.get("/bankroll")
async def get_bankroll(trading_bot) -> Dict:
    """Get current bankroll and risk settings."""
    rm = trading_bot.risk_manager
    metrics = rm.get_metrics()
    return {
        "bankroll": rm.bankroll,
        "max_position_size": rm.config.max_position_size,
        "max_daily_loss": rm.config.max_daily_loss,
        "max_concurrent_positions": rm.config.max_concurrent_positions,
        "kelly_fraction": (
            getattr(getattr(trading_bot.strategies[0], "config", None), "kelly_fraction", 0.25)
            if trading_bot.strategies else 0.25
        ),
        "total_exposure": metrics.total_exposure,
        "remaining_capacity": max(0.0, rm.bankroll - metrics.total_exposure),
        "daily_pnl": metrics.daily_pnl,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Strategies
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/strategies")
async def get_strategies(trading_bot) -> List[Dict]:
    """Strategy info and metrics."""
    return [s.get_metrics() for s in trading_bot.strategies]


@router.post("/strategies/{strategy_name}/enable")
async def enable_strategy(trading_bot, strategy_name: str) -> Dict:
    strategy = next((s for s in trading_bot.strategies if s.name == strategy_name), None)
    if not strategy:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_name}' not found")
    strategy.enabled = True
    return {"message": f"Strategy '{strategy_name}' enabled"}


@router.post("/strategies/{strategy_name}/disable")
async def disable_strategy(trading_bot, strategy_name: str) -> Dict:
    strategy = next((s for s in trading_bot.strategies if s.name == strategy_name), None)
    if not strategy:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_name}' not found")
    strategy.enabled = False
    return {"message": f"Strategy '{strategy_name}' disabled"}


class StrategyParamUpdate(BaseModel):
    min_confidence: Optional[float] = None
    min_edge: Optional[float] = None
    kelly_fraction: Optional[float] = None
    auto_close_on_expiry: Optional[bool] = None


@router.post("/strategies/{strategy_name}/params")
async def update_strategy_params(
    trading_bot, strategy_name: str, req: StrategyParamUpdate
) -> Dict:
    """Update strategy runtime parameters."""
    strategy = next((s for s in trading_bot.strategies if s.name == strategy_name), None)
    if not strategy:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_name}' not found")

    if req.min_confidence is not None and hasattr(strategy.config, "min_confidence"):
        strategy.config.min_confidence = req.min_confidence
    if req.kelly_fraction is not None and hasattr(strategy.config, "kelly_fraction"):
        strategy.config.kelly_fraction = req.kelly_fraction

    return {"message": f"Strategy '{strategy_name}' updated", "params": req.model_dump(exclude_none=True)}


# ──────────────────────────────────────────────────────────────────────────────
# Trading mode
# ──────────────────────────────────────────────────────────────────────────────

class TradingModeRequest(BaseModel):
    mode: str  # "dry_run" | "paper" | "live"
    confirmed_bankroll: Optional[float] = None
    risk_acknowledged: bool = False


@router.post("/mode")
async def set_trading_mode(trading_bot, req: TradingModeRequest) -> Dict:
    """
    Switch trading mode.
    Switching to LIVE requires risk_acknowledged=true and confirmed_bankroll.
    """
    if req.mode not in ("dry_run", "paper", "live"):
        raise HTTPException(status_code=400, detail="mode must be dry_run | paper | live")

    if req.mode == "live":
        if not req.risk_acknowledged:
            raise HTTPException(
                status_code=400,
                detail="risk_acknowledged must be true to enable live trading"
            )
        bankroll_value: float = req.confirmed_bankroll or 0.0
        if bankroll_value <= 0:
            raise HTTPException(
                status_code=400,
                detail="confirmed_bankroll required for live mode"
            )
        trading_bot.dry_run = False
        trading_bot.order_manager.dry_run = False
    else:
        trading_bot.dry_run = True
        trading_bot.order_manager.dry_run = True

    return {
        "message": f"Trading mode set to {req.mode.upper()}",
        "dry_run": trading_bot.dry_run,
        "mode": req.mode,
    }


@router.get("/mode")
async def get_trading_mode(trading_bot) -> Dict:
    """Get current trading mode."""
    if trading_bot.dry_run:
        mode = "dry_run"
    else:
        mode = "live"
    return {"mode": mode, "dry_run": trading_bot.dry_run}