"""
FastAPI application entry point for the trading bot.
"""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models.config import TradingConfig
from trading_bot import TradingBot
from api.routes import router
from api.websocket import ws_manager
from api.dependencies import set_bot
from utils.logger import setup_logger, get_logger

# Load environment variables
load_dotenv()

# Setup logging
setup_logger("main", level="INFO")
logger = get_logger(__name__)

# Global trading bot instance
trading_bot: Optional[TradingBot] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global trading_bot

    # Startup
    logger.info("Starting Kalshi Trading Bot API...")

    # Load configuration
    try:
        config = TradingConfig()
        logger.info("Configuration loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load configuration: {e}")
        raise

    # Initialize trading bot
    trading_bot = TradingBot(config)
    set_bot(trading_bot)

    # Auto-start if configured
    if not config.dry_run_mode:
        logger.warning("⚠️  DRY RUN MODE IS OFF - REAL TRADING ENABLED")
        # Uncomment to auto-start:
        # await trading_bot.start()

    logger.info("✅ Trading bot API ready")

    yield

    # Shutdown
    logger.info("Shutting down Trading Bot API...")
    if trading_bot:
        await trading_bot.shutdown()
    logger.info("Shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Kalshi Trading Bot API",
    description="High-frequency automated trading for Kalshi 15-minute Solana markets",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
# Explicit origins from CORS_ORIGINS env var (comma-separated) take priority.
# Always allows localhost for local dev and all *.vercel.app preview/prod URLs.
import os as _os
_raw_origins = _os.environ.get("CORS_ORIGINS", "")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
if not _allowed_origins:
    _allowed_origins = [
        "http://localhost:8080",
        "http://localhost:3000",
        "https://testsolud-v1-production.up.railway.app",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    # Accept any *.vercel.app subdomain (covers preview and production deployments)
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# Dependency to get trading bot instance
def get_trading_bot() -> TradingBot:
    """Dependency to inject trading bot into routes."""
    if trading_bot is None:
        raise RuntimeError("Trading bot not initialized")
    return trading_bot


# Include REST routes
app.include_router(router, prefix="/api", tags=["trading"])


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time updates.

    Dashboard connects here to receive:
    - Bot status updates
    - Trading signals
    - Trade executions
    - Alerts/notifications
    """
    await ws_manager.connect(websocket)

    try:
        # Send initial status
        if trading_bot:
            await ws_manager.broadcast_status(trading_bot)

        # Listen for messages
        while True:
            data = await websocket.receive_json()
            await ws_manager.handle_message(websocket, data, trading_bot)

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Kalshi Trading Bot API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    # Run the server
    port = int(_os.environ.get("PORT", 8000))
    is_dev = _os.environ.get("ENVIRONMENT", "production") == "development"
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=is_dev,  # Only reload in development
        log_level="info",
    )
