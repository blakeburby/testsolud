"""
Shared FastAPI dependency — provides the TradingBot instance to route handlers.

Usage in routes:
    from api.dependencies import get_trading_bot
    from trading_bot import TradingBot
    from fastapi import Depends

    @router.get("/something")
    async def my_route(bot: TradingBot = Depends(get_trading_bot)):
        ...
"""
from __future__ import annotations
from typing import Optional

# Set by main.py during startup via set_bot()
_bot = None


def set_bot(instance) -> None:
    global _bot
    _bot = instance


def get_trading_bot():
    if _bot is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Trading bot not initialised")
    return _bot