"""
Kalshi API client for market data and order execution.
"""
import httpx
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime

from models.market import Market, MarketStatus, Orderbook, OrderbookLevel
from models.trade import Trade, TradeStatus, TradeSide, OrderType
from utils.kalshi_auth import KalshiAuth
from utils.logger import get_logger

logger = get_logger(__name__)


class KalshiClient:
    """
    Async client for Kalshi API with authentication and rate limiting.
    """

    def __init__(
        self,
        api_key: str,
        private_key_path: Optional[str] = None,
        private_key_content: Optional[str] = None,
        base_url: str = "https://api.elections.kalshi.com/trade-api/v2",
        demo_mode: bool = False,
    ):
        """
        Initialize Kalshi API client.

        Args:
            api_key: Kalshi API key
            private_key_path: Path to private key file
            private_key_content: Private key content
            base_url: Kalshi API base URL
            demo_mode: Use demo/paper trading endpoint
        """
        self.base_url = base_url
        self.demo_mode = demo_mode
        self.auth = KalshiAuth(api_key, private_key_path, private_key_content)

        # Rate limiting (Kalshi has strict rate limits)
        self.rate_limit_delay = 0.2  # 200ms between requests
        self.last_request_time = 0

        # HTTP client
        self.client = httpx.AsyncClient(timeout=30.0)

        logger.info(f"Kalshi client initialized (demo_mode={demo_mode})")

    async def _rate_limit(self):
        """Enforce rate limiting between requests."""
        elapsed = asyncio.get_event_loop().time() - self.last_request_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        self.last_request_time = asyncio.get_event_loop().time()

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        json_data: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Make authenticated request to Kalshi API.

        Args:
            method: HTTP method (GET, POST, DELETE)
            path: API endpoint path
            params: Query parameters
            json_data: JSON body data

        Returns:
            Response JSON data

        Raises:
            httpx.HTTPError: On request failure
        """
        await self._rate_limit()

        # Get authentication headers
        headers = self.auth.get_headers(method, path)

        url = f"{self.base_url}{path}"

        logger.debug(f"{method} {path}")

        try:
            response = await self.client.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=json_data,
            )
            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            logger.error(f"Kalshi API error {e.response.status_code}: {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Request failed: {e}")
            raise

    # ==================== Market Data ====================

    async def get_markets(
        self,
        series_ticker: str = "KXSOL15M",
        status: str = "open",
        limit: int = 100,
    ) -> List[Market]:
        """
        Fetch markets for a series.

        Args:
            series_ticker: Series ticker (default: KXSOL15M for 15-min Solana)
            status: Market status filter
            limit: Maximum number of markets to return

        Returns:
            List of Market objects
        """
        path = "/markets"
        params = {
            "series_ticker": series_ticker,
            "status": status,
            "limit": limit,
        }

        data = await self._request("GET", path, params=params)
        markets = []

        for market_data in data.get("markets", []):
            markets.append(self._parse_market(market_data))

        logger.info(f"Fetched {len(markets)} markets for {series_ticker}")
        return markets

    async def get_market(self, ticker: str) -> Market:
        """
        Fetch single market with full price data.

        Args:
            ticker: Market ticker

        Returns:
            Market object
        """
        path = f"/markets/{ticker}"
        data = await self._request("GET", path)

        market = self._parse_market(data.get("market", data))
        logger.debug(f"Fetched market {ticker}")
        return market

    async def get_orderbook(self, ticker: str) -> Orderbook:
        """
        Fetch orderbook for a market.

        Args:
            ticker: Market ticker

        Returns:
            Orderbook object
        """
        path = f"/markets/{ticker}/orderbook"
        data = await self._request("GET", path)

        orderbook_data = data.get("orderbook", {})
        orderbook_fp = data.get("orderbook_fp", {})

        # Parse orderbook
        orderbook = Orderbook(ticker=ticker)

        # Parse YES side
        if "yes_dollars" in orderbook_fp:
            orderbook.yes_asks = [
                OrderbookLevel(price=float(price), size=size, side="yes")
                for price, size in orderbook_fp["yes_dollars"]
            ]
        elif "yes" in orderbook_data:
            orderbook.yes_asks = [
                OrderbookLevel(price=price / 100, size=size, side="yes")
                for price, size in orderbook_data["yes"]
            ]

        # Parse NO side
        if "no_dollars" in orderbook_fp:
            orderbook.no_asks = [
                OrderbookLevel(price=float(price), size=size, side="no")
                for price, size in orderbook_fp["no_dollars"]
            ]
        elif "no" in orderbook_data:
            orderbook.no_asks = [
                OrderbookLevel(price=price / 100, size=size, side="no")
                for price, size in orderbook_data["no"]
            ]

        # Calculate spread
        if orderbook.best_yes_ask and orderbook.best_no_ask:
            orderbook.spread = abs((1 - orderbook.best_no_ask) - orderbook.best_yes_ask)

        logger.debug(f"Fetched orderbook for {ticker}")
        return orderbook

    def _parse_market(self, data: Dict) -> Market:
        """Parse Kalshi market response into Market model."""
        # Parse strike price from title or ticker
        strike_price = data.get("floor_strike") or data.get("cap_strike")
        if not strike_price and "functional_strike" in data:
            try:
                strike_price = float(data["functional_strike"])
            except ValueError:
                strike_price = 0

        # Determine direction (up/down) from subtitle
        direction = "up"
        if data.get("yes_sub_title") and "below" in data["yes_sub_title"].lower():
            direction = "down"

        # Parse prices (prefer dollar format)
        yes_price = None
        if "last_price_dollars" in data:
            yes_price = float(data["last_price_dollars"])
        elif "last_price" in data and data["last_price"]:
            yes_price = data["last_price"] / 100

        yes_bid = None
        if "yes_bid_dollars" in data:
            yes_bid = float(data["yes_bid_dollars"])
        elif "yes_bid" in data and data["yes_bid"]:
            yes_bid = data["yes_bid"] / 100

        yes_ask = None
        if "yes_ask_dollars" in data:
            yes_ask = float(data["yes_ask_dollars"])
        elif "yes_ask" in data and data["yes_ask"]:
            yes_ask = data["yes_ask"] / 100

        # Create Market object
        return Market(
            ticker=data["ticker"],
            event_ticker=data.get("event_ticker", ""),
            title=data.get("title", ""),
            strike_price=strike_price or 0,
            direction=direction,
            window_start=datetime.fromisoformat(data["open_time"].replace("Z", "+00:00")),
            window_end=datetime.fromisoformat(data["expiration_time"].replace("Z", "+00:00")),
            close_time=datetime.fromisoformat(data["close_time"].replace("Z", "+00:00")),
            expiration_time=datetime.fromisoformat(data["expiration_time"].replace("Z", "+00:00")),
            status=MarketStatus(data.get("status", "open").lower()),
            yes_price=yes_price,
            no_price=1 - yes_price if yes_price else None,
            yes_bid=yes_bid,
            yes_ask=yes_ask,
            volume=data.get("volume", 0),
            volume_24h=data.get("volume_24h", 0),
        )

    # ==================== Order Execution ====================

    async def place_order(
        self,
        ticker: str,
        side: TradeSide,
        quantity: int,
        order_type: OrderType = OrderType.LIMIT,
        price: Optional[float] = None,
        dry_run: bool = True,
    ) -> Trade:
        """
        Place an order on Kalshi.

        Args:
            ticker: Market ticker
            side: YES or NO
            quantity: Number of contracts
            order_type: Market or limit order
            price: Limit price (0-1 for binary markets)
            dry_run: If True, don't actually submit order

        Returns:
            Trade object with order details
        """
        if dry_run:
            logger.info(f"[DRY RUN] Would place {side.value} order: {quantity} @ {price} on {ticker}")
            return Trade(
                ticker=ticker,
                side=side,
                order_type=order_type,
                quantity=quantity,
                price=price,
                status=TradeStatus.PENDING,
                strategy_name="manual",
                dry_run=True,
                notes="Dry run - order not submitted",
            )

        # Convert price to cents for Kalshi API
        price_cents = int(price * 100) if price else None

        order_data = {
            "ticker": ticker,
            "client_order_id": f"order_{int(datetime.utcnow().timestamp() * 1000)}",
            "side": side.value,
            "action": "buy",
            "count": quantity,
            "type": "limit" if order_type == OrderType.LIMIT else "market",
        }

        if order_type == OrderType.LIMIT and price_cents:
            order_data["yes_price"] = price_cents if side == TradeSide.YES else None
            order_data["no_price"] = price_cents if side == TradeSide.NO else None

        path = "/portfolio/orders"

        try:
            response = await self._request("POST", path, json_data=order_data)

            trade = Trade(
                trade_id=response.get("order", {}).get("order_id"),
                order_id=response.get("order", {}).get("order_id"),
                ticker=ticker,
                side=side,
                order_type=order_type,
                quantity=quantity,
                price=price,
                status=TradeStatus.SUBMITTED,
                strategy_name="manual",
                dry_run=False,
                submitted_at=datetime.utcnow(),
            )

            logger.info(f"Order placed: {trade.order_id} - {side.value} {quantity} @ {price}")
            return trade

        except Exception as e:
            logger.error(f"Failed to place order: {e}")
            return Trade(
                ticker=ticker,
                side=side,
                order_type=order_type,
                quantity=quantity,
                price=price,
                status=TradeStatus.FAILED,
                strategy_name="manual",
                dry_run=False,
                notes=str(e),
            )

    async def cancel_order(self, order_id: str, dry_run: bool = True) -> bool:
        """
        Cancel an order.

        Args:
            order_id: Kalshi order ID
            dry_run: If True, don't actually cancel

        Returns:
            True if successful
        """
        if dry_run:
            logger.info(f"[DRY RUN] Would cancel order {order_id}")
            return True

        path = f"/portfolio/orders/{order_id}"

        try:
            await self._request("DELETE", path)
            logger.info(f"Order cancelled: {order_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to cancel order {order_id}: {e}")
            return False

    async def get_order_status(self, order_id: str) -> Dict[str, Any]:
        """
        Get status of an order.

        Args:
            order_id: Kalshi order ID

        Returns:
            Order status data
        """
        path = f"/portfolio/orders/{order_id}"
        return await self._request("GET", path)

    async def get_positions(self) -> List[Dict[str, Any]]:
        """
        Get current positions.

        Returns:
            List of position data
        """
        path = "/portfolio/positions"
        data = await self._request("GET", path)
        return data.get("positions", [])

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
        logger.info("Kalshi client closed")
