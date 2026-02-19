"""
Strongly-typed Pydantic models for all Kalshi API responses.
Field names match the Kalshi API docs exactly.
"""
from __future__ import annotations

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel


# ──────────────────────────────────────────────────────────────────────────────
# Orders
# ──────────────────────────────────────────────────────────────────────────────

class KalshiOrder(BaseModel):
    """Kalshi order object — shape returned by all order endpoints."""
    order_id: str
    user_id: str = ""
    client_order_id: str = ""
    ticker: str
    side: str                           # "yes" | "no"
    action: str                         # "buy" | "sell"
    type: str = "limit"                 # "limit" | "market"
    status: str = "resting"             # "resting" | "executed" | "canceled"

    # Prices (cents)
    yes_price: int = 0
    no_price: int = 0
    yes_price_dollars: Optional[str] = None
    no_price_dollars: Optional[str] = None

    # Fill quantities
    fill_count: int = 0
    fill_count_fp: Optional[str] = None
    remaining_count: int = 0
    remaining_count_fp: Optional[str] = None
    initial_count: int = 0
    initial_count_fp: Optional[str] = None

    # Fees (cents)
    taker_fees: int = 0
    maker_fees: int = 0
    taker_fill_cost: int = 0
    maker_fill_cost: int = 0
    taker_fill_cost_dollars: Optional[str] = None
    maker_fill_cost_dollars: Optional[str] = None
    taker_fees_dollars: Optional[str] = None
    maker_fees_dollars: Optional[str] = None

    # Deprecated — always 0; use /queue_position endpoint
    queue_position: int = 0

    # Metadata
    expiration_time: Optional[datetime] = None
    created_time: Optional[datetime] = None
    last_update_time: Optional[datetime] = None
    self_trade_prevention_type: Optional[str] = None
    order_group_id: Optional[str] = None
    cancel_order_on_pause: bool = False
    subaccount_number: int = 0

    @property
    def is_resting(self) -> bool:
        return self.status == "resting"

    @property
    def is_executed(self) -> bool:
        return self.status == "executed"

    @property
    def is_canceled(self) -> bool:
        return self.status == "canceled"

    @property
    def is_terminal(self) -> bool:
        return self.status in ("executed", "canceled")

    @property
    def effective_price_cents(self) -> int:
        """Return the relevant price (yes or no) for this order."""
        return self.yes_price if self.side == "yes" else self.no_price


class CreateOrderResponse(BaseModel):
    order: KalshiOrder


class AmendOrderResponse(BaseModel):
    old_order: KalshiOrder
    order: KalshiOrder


class CancelOrderResponse(BaseModel):
    order: KalshiOrder
    reduced_by: int = 0
    reduced_by_fp: Optional[str] = None


class DecreaseOrderResponse(BaseModel):
    order: KalshiOrder


class OrdersListResponse(BaseModel):
    orders: List[KalshiOrder] = []
    cursor: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Queue
# ──────────────────────────────────────────────────────────────────────────────

class QueuePosition(BaseModel):
    """Live queue depth for a single resting order."""
    order_id: str
    market_ticker: str
    queue_position: int
    queue_position_fp: Optional[str] = None


class QueuePositionsResponse(BaseModel):
    queue_positions: List[QueuePosition] = []


# ──────────────────────────────────────────────────────────────────────────────
# Portfolio
# ──────────────────────────────────────────────────────────────────────────────

class Balance(BaseModel):
    """Account balance snapshot — all values in cents."""
    balance: int                    # Available cash cents
    portfolio_value: int            # Open positions value cents

    @property
    def balance_dollars(self) -> float:
        return self.balance / 100

    @property
    def portfolio_value_dollars(self) -> float:
        return self.portfolio_value / 100

    @property
    def total_value_dollars(self) -> float:
        return (self.balance + self.portfolio_value) / 100


class MarketPosition(BaseModel):
    """Current holdings in a single market — signed quantity."""
    ticker: str
    position: int                   # Signed: positive = long YES, negative = short
    total_traded: int = 0           # Cents
    market_exposure: int = 0        # Cents
    realized_pnl: int = 0           # Cents
    resting_orders_count: int = 0
    fees_paid: int = 0              # Cents
    last_updated_ts: Optional[datetime] = None

    @property
    def exposure_dollars(self) -> float:
        return self.market_exposure / 100

    @property
    def realized_pnl_dollars(self) -> float:
        return self.realized_pnl / 100


class PositionsResponse(BaseModel):
    market_positions: List[MarketPosition] = []
    event_positions: List[dict] = []
    cursor: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Fills
# ──────────────────────────────────────────────────────────────────────────────

class Fill(BaseModel):
    """A single trade fill event."""
    fill_id: str
    trade_id: str
    order_id: str
    ticker: str
    side: str                       # "yes" | "no"
    action: str                     # "buy" | "sell"
    count: int
    yes_price: int = 0              # Cents
    no_price: int = 0               # Cents
    is_taker: bool = False
    client_order_id: Optional[str] = None
    created_time: Optional[datetime] = None
    fee_cost: Optional[str] = None  # Added Jan 2026 — string cents

    @property
    def effective_price_cents(self) -> int:
        return self.yes_price if self.side == "yes" else self.no_price

    @property
    def effective_price_dollars(self) -> float:
        return self.effective_price_cents / 100

    @property
    def cost_cents(self) -> int:
        return self.count * self.effective_price_cents

    @property
    def cost_dollars(self) -> float:
        return self.cost_cents / 100


class FillsResponse(BaseModel):
    fills: List[Fill] = []
    cursor: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Settlements
# ──────────────────────────────────────────────────────────────────────────────

class Settlement(BaseModel):
    """Market settlement result."""
    ticker: str
    event_ticker: str
    market_result: str              # "yes" | "no"
    yes_count: int = 0
    no_count: int = 0
    yes_total_cost: int = 0         # Cents
    no_total_cost: int = 0          # Cents
    revenue: int = 0                # Payout in cents
    settled_time: Optional[datetime] = None
    value: Optional[int] = None     # Net P&L in cents

    @property
    def revenue_dollars(self) -> float:
        return self.revenue / 100

    @property
    def pnl_dollars(self) -> float:
        return (self.value or 0) / 100


class SettlementsResponse(BaseModel):
    settlements: List[Settlement] = []
    cursor: Optional[str] = None
