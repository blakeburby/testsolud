"""
Main trading bot orchestrator.
"""
import asyncio
from typing import List, Optional
from pathlib import Path
import httpx

from models.config import TradingConfig, StrategyConfig
from models.market import Market
from trading_engine.kalshi_client import KalshiClient
from trading_engine.order_manager import OrderManager
from trading_engine.risk_manager import RiskManager
from strategies.base import BaseStrategy
from strategies.high_confidence_threshold import HighConfidenceThresholdStrategy
from utils.logger import setup_logger, get_logger

logger = get_logger(__name__)


class TradingBot:
    """
    Main trading bot that coordinates strategies, execution, and risk management.
    """

    def __init__(self, config: TradingConfig):
        """
        Initialize trading bot.

        Args:
            config: Trading configuration
        """
        self.config = config
        self.dry_run = config.dry_run_mode

        # Setup logging
        log_dir = Path(__file__).parent / "logs"
        log_file = log_dir / f"trading_bot_{asyncio.get_event_loop().time()}.log"
        setup_logger(
            "trading_bot",
            level=config.log_level,
            log_file=log_file,
        )

        logger.info("="*60)
        logger.info("Trading Bot Initializing...")
        logger.info(f"Environment: {config.environment}")
        logger.info(f"Dry Run Mode: {self.dry_run}")
        logger.info("="*60)

        # Initialize components
        self.kalshi_client = KalshiClient(
            api_key=config.kalshi_api_key,
            private_key_path=config.kalshi_private_key_path,
            private_key_content=config.kalshi_private_key,
            base_url=config.kalshi_api_base_url,
            demo_mode=config.kalshi_demo_mode,
        )

        self.risk_manager = RiskManager(config.risk)
        self.order_manager = OrderManager(
            kalshi_client=self.kalshi_client,
            risk_manager=self.risk_manager,
            dry_run=self.dry_run,
        )

        # Initialize strategies
        self.strategies: List[BaseStrategy] = []
        self._load_strategies()

        # State
        self.running = False
        self._main_task: Optional[asyncio.Task] = None
        self._active_market: Optional[Market] = None
        self._price_history: List[dict] = []

        logger.info(f"Trading bot initialized with {len(self.strategies)} strategies")

    def _load_strategies(self):
        """Load and initialize trading strategies."""
        for strategy_name in self.config.enabled_strategies:
            strategy_config = StrategyConfig(
                name=strategy_name,
                enabled=True,
                bankroll=self.config.default_bankroll,
            )

            if strategy_name == "high_confidence_threshold":
                strategy = HighConfidenceThresholdStrategy(strategy_config)
            else:
                logger.warning(f"Unknown strategy: {strategy_name}")
                continue

            self.strategies.append(strategy)
            logger.info(f"Loaded strategy: {strategy_name}")

    async def start(self):
        """Start the trading bot."""
        if self.running:
            logger.warning("Bot is already running")
            return

        self.running = True

        # Start order monitoring
        await self.order_manager.start_monitoring()

        # Start main trading loop
        self._main_task = asyncio.create_task(self._trading_loop())

        logger.info("🚀 Trading bot started")

    async def stop(self):
        """Stop the trading bot."""
        if not self.running:
            logger.warning("Bot is not running")
            return

        self.running = False

        # Stop main loop
        if self._main_task:
            self._main_task.cancel()
            try:
                await self._main_task
            except asyncio.CancelledError:
                pass

        # Stop order monitoring
        await self.order_manager.stop_monitoring()

        logger.info("🛑 Trading bot stopped")

    async def _trading_loop(self):
        """Main trading loop."""
        logger.info("Starting main trading loop")

        while self.running:
            try:
                # 1. Discover active markets
                markets = await self.kalshi_client.get_markets(
                    series_ticker="KXSOL15M",
                    status="open",
                )

                if not markets:
                    logger.info("No KXSOL15M markets returned from Kalshi — waiting 10s")
                    await asyncio.sleep(10)
                    continue

                # 2. Filter for tradeable markets (active in 15-min window)
                tradeable_markets = [m for m in markets if m.is_tradeable]

                if not tradeable_markets:
                    logger.info(
                        f"Found {len(markets)} KXSOL15M markets but none tradeable — waiting 10s"
                    )
                    await asyncio.sleep(10)
                    continue

                # 3. Focus on the currently active market
                active_markets = [m for m in tradeable_markets if m.is_active]

                if not active_markets:
                    logger.info(
                        f"{len(tradeable_markets)} tradeable markets, none in current 15-min window — waiting 5s"
                    )
                    await asyncio.sleep(5)
                    continue

                # Use first active market (or prioritize based on volume/liquidity)
                market = active_markets[0]

                # 4. Get current Solana spot price from Binance/Kraken
                current_price = await self._fetch_sol_price()
                if current_price is None:
                    logger.warning("Could not fetch SOL price — skipping iteration")
                    await asyncio.sleep(5)
                    continue

                # 5. Fetch orderbook
                try:
                    orderbook = await self.kalshi_client.get_orderbook(market.ticker)
                except Exception as e:
                    logger.warning(f"Failed to fetch orderbook for {market.ticker}: {e}")
                    orderbook = None

                # 6. Run strategies
                for strategy in self.strategies:
                    if not strategy.is_enabled():
                        continue

                    try:
                        signal = await strategy.analyze(
                            market=market,
                            current_price=current_price,
                            price_history=self._price_history,
                            orderbook=orderbook,
                        )

                        if signal and signal.is_valid and signal.has_edge:
                            logger.info(
                                f"📊 Signal from {strategy.name}: "
                                f"{signal.direction.value} on {signal.ticker} "
                                f"(edge: {signal.edge:.3f})"
                            )

                            # Execute signal
                            trade = await self.order_manager.execute_signal(signal)

                            if trade:
                                logger.info(f"✅ Trade executed: {trade.trade_id}")

                    except Exception as e:
                        logger.error(f"Error in strategy {strategy.name}: {e}", exc_info=True)

                # 7. Update price history (rolling 15-minute window)
                if current_price is not None:
                    self._update_price_history(current_price)

                # 8. Sleep before next iteration
                await asyncio.sleep(1)  # Check every second for high-frequency

            except asyncio.CancelledError:
                logger.info("Trading loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in trading loop: {e}", exc_info=True)
                await asyncio.sleep(5)

        logger.info("Trading loop exited")

    async def _fetch_sol_price(self) -> Optional[float]:
        """
        Fetch current SOL/USD spot price from a public exchange.
        Tries Binance.US first, falls back to Kraken.
        No authentication required for either endpoint.
        """
        # Primary: Binance.US
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "https://api.binance.us/api/v3/ticker/price",
                    params={"symbol": "SOLUSDT"},
                )
                if resp.is_success:
                    return float(resp.json()["price"])
        except Exception as e:
            logger.warning(f"Binance SOL price fetch failed: {e}")

        # Fallback: Kraken
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "https://api.kraken.com/0/public/Ticker",
                    params={"pair": "SOLUSD"},
                )
                if resp.is_success:
                    data = resp.json()
                    sol = data.get("result", {}).get("SOLUSD", {})
                    if "c" in sol:  # 'c' = [last_trade_price, lot_volume]
                        return float(sol["c"][0])
        except Exception as e:
            logger.warning(f"Kraken SOL price fetch failed: {e}")

        return None

    def _update_price_history(self, price: float):
        """Update rolling price history."""
        timestamp = asyncio.get_event_loop().time() * 1000  # milliseconds

        self._price_history.append({
            "price": price,
            "timestamp": timestamp,
            "time": timestamp,
        })

        # Keep only last 15 minutes (900 seconds)
        cutoff = timestamp - (15 * 60 * 1000)
        self._price_history = [
            p for p in self._price_history
            if p["timestamp"] >= cutoff
        ]

    async def shutdown(self):
        """Graceful shutdown."""
        logger.info("Shutting down trading bot...")

        await self.stop()
        await self.kalshi_client.close()

        logger.info("Trading bot shutdown complete")
