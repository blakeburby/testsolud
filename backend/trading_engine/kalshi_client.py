"""
Kalshi API client — production-grade with auth, retry, and full portfolio methods.

Rules enforced (from SKILL.md):
- round() not int() for float→cents
- client_order_id = UUID4
- No None values in JSON bodies (keys omitted entirely)
- side-correct price field (yes_price XOR no_price)
- "executed" is the filled terminal state, never "filled"
- buy_max_cost required for market buys
- Retry: exponential backoff on 429, once on 5xx, idempotent 409
"""
import asyncio
import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import uuid4

from models.market import Market, MarketStatus, Orderbook, OrderbookLevel
from models.trade import Trade, TradeStatus, TradeSide, OrderType
from utils.kalshi_auth import KalshiAuth
from utils.logger import get_logger

logger = get_logger(__name__)


class KalshiClient:
    """
    Async client for Kalshi API with authentication, rate limiting, and retry logic.
    All portfolio mutations default dry_run=True to prevent accidental live orders.
    """

    def __init__(
        self,
        api_key: str,
        private_key_path: Optional[str] = None,
        private_key_content: Optional[str] = None,
        base_url: str = "https://api.elections.kalshi.com/trade-api/v2",
        demo_mode: bool = False,
    ):
        self.base_url = base_url
        self.demo_mode = demo_mode
        self.auth = KalshiAuth(api_key, private_key_path, private_key_content)

        # 200 ms between requests = ~5 req/s, within Basic tier (10 writes/s, 20 reads/s)
        self.rate_limit_delay = 0.2
        self.last_request_time = 0.0

        self.client = httpx.AsyncClient(timeout=30.0)

        # Health tracking
        self.last_successful_request: Optional[datetime] = None
        self.consecutive_errors: int = 0
        self.total_requests: int = 0

        logger.info(f"KalshiClient initialized (demo_mode={demo_mode}, base_url={base_url})")

    # ──────────────────────────────────────────────────────────────────
    # Core transport
    # ──────────────────────────────────────────────────────────────────

    async def _rate_limit(self):
        """Enforce ≥200 ms between requests."""
        loop = asyncio.get_event_loop()
        elapsed = loop.time() - self.last_request_time
        if elapsed < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - elapsed)
        self.last_request_time = loop.time()

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        json_data: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Make a single authenticated request. Raises httpx.HTTPStatusError on failure.

        path must be relative: e.g. "/portfolio/orders" — base_url prepended internally.
        Use json_data= NOT json= (matches codebase convention).
        """
        await self._rate_limit()
        headers = self.auth.get_headers(method, path)
        url = f"{self.base_url}{path}"
        self.total_requests += 1

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
            self.last_successful_request = datetime.utcnow()
            self.consecutive_errors = 0
            return response.json()

        except httpx.HTTPStatusError as e:
            self.consecutive_errors += 1
            logger.error(f"Kalshi API {e.response.status_code}: {e.response.text[:500]}")
            raise
        except Exception as e:
            self.consecutive_errors += 1
            logger.error(f"Request failed: {e}")
            raise

    async def _request_with_retry(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        json_data: Optional[Dict] = None,
        max_retries: int = 3,
    ) -> Dict[str, Any]:
        """
        Retry-wrapped _request with exponential back-off.

        Policy:
          429 → exponential back-off (2^attempt seconds), up to max_retries
          5xx → retry once after 2 s
          409 POST → treat as idempotent success (return response body)
          Network errors → back-off, up to max_retries
          Everything else → raise immediately
        """
        for attempt in range(max_retries + 1):
            try:
                return await self._request(method, path, params=params, json_data=json_data)

            except httpx.HTTPStatusError as e:
                status = e.response.status_code

                # Rate limited — exponential back-off
                if status == 429 and attempt < max_retries:
                    delay = 2 ** attempt
                    logger.warning(f"429 rate-limited — retry {attempt + 1}/{max_retries} in {delay}s")
                    await asyncio.sleep(delay)
                    continue

                # Server error — retry once
                if 500 <= status < 600 and attempt == 0:
                    logger.warning(f"{status} server error — retrying once after 2s")
                    await asyncio.sleep(2)
                    continue

                # Duplicate order — idempotent success
                if status == 409 and method == "POST":
                    logger.info("409 duplicate client_order_id — treating as idempotent success")
                    try:
                        return e.response.json()
                    except Exception:
                        return {}

                raise

            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
                if attempt < max_retries:
                    delay = 2 ** attempt
                    logger.warning(f"Network error ({type(e).__name__}) — retry {attempt + 1}/{max_retries} in {delay}s")
                    await asyncio.sleep(delay)
                    continue
                raise

        # Unreachable — every path either returns or raises — but satisfies the type checker
        raise RuntimeError("_request_with_retry exhausted all attempts without result")

    # ──────────────────────────────────────────────────────────────────
    # Market data
    # ──────────────────────────────────────────────────────────────────

    async def get_markets(
        self,
        series_ticker: str = "KXSOL15M",
        status: str = "open",
        limit: int = 100,
    ) -> List[Market]:
        """GET /markets — fetch markets for a series."""
        data = await self._request_with_retry(
            "GET", "/markets",
            params={"series_ticker": series_ticker, "status": status, "limit": limit},
        )
        markets = [self._parse_market(m) for m in data.get("markets", [])]
        logger.info(f"Fetched {len(markets)} markets for {series_ticker}")
        return markets

    async def get_market(self, ticker: str) -> Market:
        """GET /markets/{ticker} — single market."""
        data = await self._request_with_retry("GET", f"/markets/{ticker}")
        return self._parse_market(data.get("market", data))

    async def get_orderbook(self, ticker: str) -> Orderbook:
        """GET /markets/{ticker}/orderbook — live orderbook."""
        data = await self._request_with_retry("GET", f"/markets/{ticker}/orderbook")
        orderbook_data = data.get("orderbook", {})
        orderbook_fp = data.get("orderbook_fp", {})

        orderbook = Orderbook(ticker=ticker)

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

        if orderbook.best_yes_ask and orderbook.best_no_ask:
            orderbook.spread = abs((1 - orderbook.best_no_ask) - orderbook.best_yes_ask)

        return orderbook

    def _parse_market(self, data: Dict) -> Market:
        """Parse raw Kalshi market dict into Market model."""
        strike_price = data.get("floor_strike") or data.get("cap_strike")
        if not strike_price and "functional_strike" in data:
            try:
                strike_price = float(data["functional_strike"])
            except (ValueError, TypeError):
                strike_price = 0

        direction = "up"
        if data.get("yes_sub_title") and "below" in data["yes_sub_title"].lower():
            direction = "down"

        def _dollars(key_dollars, key_cents):
            if data.get(key_dollars):
                return float(data[key_dollars])
            if data.get(key_cents):
                return data[key_cents] / 100
            return None

        yes_price = _dollars("last_price_dollars", "last_price")
        yes_bid = _dollars("yes_bid_dollars", "yes_bid")
        yes_ask = _dollars("yes_ask_dollars", "yes_ask")

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

    # ──────────────────────────────────────────────────────────────────
    # Portfolio reads — always hit live API (reads in dry-run is fine)
    # ──────────────────────────────────────────────────────────────────

    async def get_balance(self) -> Dict[str, Any]:
        """
        GET /portfolio/balance
        Returns {"balance": <cents>, "portfolio_value": <cents>}
        """
        return await self._request_with_retry("GET", "/portfolio/balance")

    async def get_positions(self) -> Dict[str, Any]:
        """
        GET /portfolio/positions
        Returns {"market_positions": [...], "event_positions": [...]}
        """
        return await self._request_with_retry("GET", "/portfolio/positions")

    async def get_fills(
        self,
        ticker: Optional[str] = None,
        order_id: Optional[str] = None,
        min_ts: Optional[int] = None,
        max_ts: Optional[int] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """GET /portfolio/fills — recent fill history."""
        params: Dict[str, Any] = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
        if order_id:
            params["order_id"] = order_id
        if min_ts is not None:
            params["min_ts"] = min_ts
        if max_ts is not None:
            params["max_ts"] = max_ts
        if cursor:
            params["cursor"] = cursor
        return await self._request_with_retry("GET", "/portfolio/fills", params=params)

    async def get_settlements(
        self,
        limit: int = 100,
        cursor: Optional[str] = None,
        ticker: Optional[str] = None,
        min_ts: Optional[int] = None,
        max_ts: Optional[int] = None,
    ) -> Dict[str, Any]:
        """GET /portfolio/settlements."""
        params: Dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        if ticker:
            params["ticker"] = ticker
        if min_ts is not None:
            params["min_ts"] = min_ts
        if max_ts is not None:
            params["max_ts"] = max_ts
        return await self._request_with_retry("GET", "/portfolio/settlements", params=params)

    async def get_orders_list(
        self,
        ticker: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        GET /portfolio/orders — list orders.
        status: "resting" | "canceled" | "executed"
        """
        params: Dict[str, Any] = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
        if status:
            params["status"] = status
        if cursor:
            params["cursor"] = cursor
        return await self._request_with_retry("GET", "/portfolio/orders", params=params)

    async def get_order_status(self, order_id: str) -> Dict[str, Any]:
        """GET /portfolio/orders/{order_id} — single order."""
        return await self._request_with_retry("GET", f"/portfolio/orders/{order_id}")

    async def get_queue_position(self, order_id: str) -> Dict[str, Any]:
        """GET /portfolio/orders/{order_id}/queue_position — live queue depth."""
        return await self._request_with_retry("GET", f"/portfolio/orders/{order_id}/queue_position")

    async def get_all_queue_positions(self) -> Dict[str, Any]:
        """GET /portfolio/orders/queue_positions — all resting order positions."""
        return await self._request_with_retry("GET", "/portfolio/orders/queue_positions")

    # ──────────────────────────────────────────────────────────────────
    # Order mutations — all require dry_run guard
    # ──────────────────────────────────────────────────────────────────

    async def place_order(
        self,
        ticker: str,
        side: TradeSide,
        action: str = "buy",
        quantity: int = 1,
        order_type: OrderType = OrderType.LIMIT,
        price: Optional[float] = None,          # 0–1 float; converted to cents internally
        buy_max_cost: Optional[int] = None,      # Cents; required for market buys
        time_in_force: Optional[str] = None,
        post_only: bool = False,
        reduce_only: bool = False,
        expiration_ts: Optional[int] = None,
        dry_run: bool = True,
    ) -> Trade:
        """
        Place a buy or sell order.

        Price rules (SKILL.md §4.2):
          - Limit YES buy/sell → yes_price only
          - Limit NO buy/sell → no_price only
          - Market buy → buy_max_cost only (no price field)
          - Never set both yes_price and no_price
          - Price range 1–99 cents (never 0 or 100)
          - round() for conversion, never int()
        """
        if dry_run:
            logger.info(
                f"[DRY RUN] {action.upper()} {side.value.upper()} {quantity} @ {price} on {ticker}"
            )
            return Trade(
                ticker=ticker,
                side=side,
                order_type=order_type,
                quantity=quantity,
                price=price,
                status=TradeStatus.PENDING,
                strategy_name="manual",
                dry_run=True,
                notes="Dry run — order not submitted",
            )

        # Generate idempotency key
        client_order_id = str(uuid4())

        # Build body — never include None values
        body: Dict[str, Any] = {
            "ticker": ticker,
            "client_order_id": client_order_id,
            "side": side.value,
            "action": action,
            "count": quantity,
            "type": "limit" if order_type == OrderType.LIMIT else "market",
        }

        if order_type == OrderType.LIMIT and price is not None:
            price_cents = round(price * 100)  # round() not int()
            if price_cents < 1 or price_cents > 99:
                raise ValueError(f"Price {price_cents}¢ out of range 1–99")
            if side == TradeSide.YES:
                body["yes_price"] = price_cents
            else:
                body["no_price"] = price_cents
            # Never set both — the other key is simply omitted

        if order_type == OrderType.MARKET:
            if buy_max_cost is None:
                raise ValueError("buy_max_cost is required for market orders")
            body["buy_max_cost"] = buy_max_cost

        if time_in_force:
            body["time_in_force"] = time_in_force
        if post_only:
            body["post_only"] = True
        if reduce_only:
            body["reduce_only"] = True
        if expiration_ts is not None:
            body["expiration_ts"] = expiration_ts

        logger.info(
            f"Placing order: {action.upper()} {side.value.upper()} {quantity} "
            f"@ {price} on {ticker} [{client_order_id}]"
        )

        try:
            resp = await self._request_with_retry("POST", "/portfolio/orders", json_data=body)
            order = resp.get("order", {})
            order_id = order.get("order_id")
            logger.info(
                f"Order submitted: order_id={order_id} client_id={client_order_id} "
                f"status={order.get('status')}"
            )
            return Trade(
                trade_id=client_order_id,
                order_id=order_id,
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

        except httpx.HTTPStatusError as e:
            logger.error(f"Order failed ({e.response.status_code}): {e.response.text}")
            return Trade(
                ticker=ticker,
                side=side,
                order_type=order_type,
                quantity=quantity,
                price=price,
                status=TradeStatus.FAILED,
                strategy_name="manual",
                dry_run=False,
                notes=f"HTTP {e.response.status_code}: {e.response.text[:200]}",
            )

    async def cancel_order(self, order_id: str, dry_run: bool = True) -> Dict[str, Any]:
        """
        DELETE /portfolio/orders/{order_id} — cancel a resting order.
        Returns {"order": {...}, "reduced_by": N}
        Safe to call only on "resting" orders.
        """
        if dry_run:
            logger.info(f"[DRY RUN] Would cancel order {order_id}")
            return {"order": {"status": "canceled", "remaining_count": 0}, "reduced_by": 0}

        logger.info(f"Cancelling order {order_id}")
        return await self._request_with_retry("DELETE", f"/portfolio/orders/{order_id}")

    async def amend_order(
        self,
        order_id: str,
        ticker: str,
        side: str,
        action: str,
        yes_price: Optional[int] = None,
        no_price: Optional[int] = None,
        count: Optional[int] = None,
        dry_run: bool = True,
    ) -> Dict[str, Any]:
        """
        POST /portfolio/orders/{order_id}/amend
        Creates a NEW order_id; old order cancelled.
        count = new max fillable (not an increment).
        """
        if dry_run:
            logger.info(f"[DRY RUN] Would amend {order_id}")
            return {"old_order": {}, "order": {}}

        body: Dict[str, Any] = {"ticker": ticker, "side": side, "action": action}
        if yes_price is not None:
            body["yes_price"] = yes_price
        if no_price is not None:
            body["no_price"] = no_price
        if count is not None:
            body["count"] = count

        logger.info(f"Amending order {order_id}: {body}")
        return await self._request_with_retry(
            "POST", f"/portfolio/orders/{order_id}/amend", json_data=body
        )

    async def decrease_order(
        self,
        order_id: str,
        reduce_by: Optional[int] = None,
        reduce_to: Optional[int] = None,
        dry_run: bool = True,
    ) -> Dict[str, Any]:
        """
        POST /portfolio/orders/{order_id}/decrease
        Provide exactly ONE of reduce_by or reduce_to.
        reduce_to=0 is equivalent to cancel.
        """
        if dry_run:
            logger.info(f"[DRY RUN] Would decrease {order_id}")
            return {"order": {}}

        if reduce_by is not None and reduce_to is not None:
            raise ValueError("Provide reduce_by OR reduce_to, not both")
        if reduce_by is None and reduce_to is None:
            raise ValueError("Provide either reduce_by or reduce_to")

        body: Dict[str, Any] = {}
        if reduce_by is not None:
            body["reduce_by"] = reduce_by
        if reduce_to is not None:
            body["reduce_to"] = reduce_to

        logger.info(f"Decreasing order {order_id}: {body}")
        return await self._request_with_retry(
            "POST", f"/portfolio/orders/{order_id}/decrease", json_data=body
        )

    async def batch_create_orders(
        self, orders: List[Dict[str, Any]], dry_run: bool = True
    ) -> Dict[str, Any]:
        """
        POST /portfolio/orders/batched — up to 20 orders.
        Each order counts as 1 write toward rate limit.
        """
        if len(orders) > 20:
            raise ValueError("Batch create limited to 20 orders per call")
        if dry_run:
            logger.info(f"[DRY RUN] Would batch create {len(orders)} orders")
            return {"orders": []}

        logger.info(f"Batch creating {len(orders)} orders")
        return await self._request_with_retry(
            "POST", "/portfolio/orders/batched", json_data={"orders": orders}
        )

    async def batch_cancel_orders(
        self, order_ids: List[str], dry_run: bool = True
    ) -> Dict[str, Any]:
        """
        DELETE /portfolio/orders/batched — up to 20 order IDs.
        Each cancel = 0.2 writes (5 cancels = 1 write).
        """
        if len(order_ids) > 20:
            raise ValueError("Batch cancel limited to 20 orders per call")
        if dry_run:
            logger.info(f"[DRY RUN] Would batch cancel {len(order_ids)} orders")
            return {"orders": []}

        logger.info(f"Batch cancelling {len(order_ids)} orders")
        return await self._request_with_retry(
            "DELETE", "/portfolio/orders/batched", json_data={"ids": order_ids}
        )

    # ──────────────────────────────────────────────────────────────────
    # Pagination helper
    # ──────────────────────────────────────────────────────────────────

    async def paginate_all(
        self,
        fetch_fn,
        result_key: str,
        limit: int = 100,
        max_pages: int = 10,
        **kwargs,
    ) -> list:
        """Collect all pages from a cursor-paginated Kalshi endpoint."""
        all_results: list = []
        cursor: Optional[str] = None

        for _ in range(max_pages):
            data = await fetch_fn(limit=limit, cursor=cursor, **kwargs)
            page = data.get(result_key, [])
            all_results.extend(page)
            cursor = data.get("cursor")
            if not cursor or len(page) < limit:
                break

        return all_results

    # ──────────────────────────────────────────────────────────────────
    # Health info
    # ──────────────────────────────────────────────────────────────────

    def get_health_info(self) -> Dict[str, Any]:
        """Return connectivity health snapshot."""
        lsr = self.last_successful_request
        return {
            "last_successful_request": lsr.isoformat() if lsr is not None else None,
            "consecutive_errors": self.consecutive_errors,
            "total_requests": self.total_requests,
            "healthy": self.consecutive_errors < 5,
        }

    async def close(self):
        """Close the underlying HTTP client."""
        await self.client.aclose()
        logger.info("KalshiClient closed")