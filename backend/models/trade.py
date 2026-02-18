"""
Trade data models.
"""
from enum import Enum
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TradeStatus(str, Enum):
    """Trade status enumeration."""
    PENDING = "pending"
    SUBMITTED = "submitted"
    FILLED = "filled"
    PARTIALLY_FILLED = "partially_filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    FAILED = "failed"


class TradeSide(str, Enum):
    """Trade side enumeration."""
    YES = "yes"
    NO = "no"


class OrderType(str, Enum):
    """Order type enumeration."""
    MARKET = "market"
    LIMIT = "limit"


class Trade(BaseModel):
    """Trade model representing a single trade."""

    # Identifiers
    trade_id: Optional[str] = Field(None, description="Internal trade ID")
    order_id: Optional[str] = Field(None, description="Kalshi order ID")
    ticker: str = Field(..., description="Market ticker (e.g., KXSOL15M-24FEB15-1430-T249.50)")

    # Order Details
    side: TradeSide = Field(..., description="YES or NO")
    order_type: OrderType = Field(default=OrderType.LIMIT, description="Market or limit order")
    quantity: int = Field(..., gt=0, description="Number of contracts")
    price: Optional[float] = Field(None, ge=0, le=1, description="Limit price (0-1 for binary markets)")

    # Execution
    status: TradeStatus = Field(default=TradeStatus.PENDING)
    filled_quantity: int = Field(default=0, ge=0)
    average_fill_price: Optional[float] = Field(None, ge=0, le=1)

    # Financial
    cost: Optional[float] = Field(None, description="Total cost in dollars")
    fees: Optional[float] = Field(default=0, ge=0, description="Trading fees")
    pnl: Optional[float] = Field(None, description="Realized P&L")

    # Strategy & Risk
    strategy_name: str = Field(..., description="Name of strategy that generated this trade")
    edge: Optional[float] = Field(None, description="Estimated edge at time of trade")
    confidence: Optional[float] = Field(None, ge=0, le=1, description="Signal confidence")
    kelly_fraction: Optional[float] = Field(None, ge=0, description="Kelly fraction used for sizing")

    # Metadata
    dry_run: bool = Field(default=True, description="Whether this is a paper trade")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    submitted_at: Optional[datetime] = None
    filled_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None

    # Notes
    notes: Optional[str] = Field(None, description="Additional notes or error messages")

    class Config:
        json_schema_extra = {
            "example": {
                "ticker": "KXSOL15M-24FEB15-1430-T249.50",
                "side": "yes",
                "order_type": "limit",
                "quantity": 10,
                "price": 0.55,
                "strategy_name": "kelly_volatility",
                "edge": 0.05,
                "confidence": 0.75,
                "dry_run": True
            }
        }


class Position(BaseModel):
    """Current position in a market."""

    ticker: str
    side: TradeSide
    quantity: int = Field(ge=0)
    average_entry_price: float = Field(ge=0, le=1)
    current_price: Optional[float] = Field(None, ge=0, le=1)
    unrealized_pnl: Optional[float] = None

    entry_time: datetime
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    # Risk metrics
    max_loss: float = Field(description="Maximum potential loss")
    max_gain: float = Field(description="Maximum potential gain")

    def calculate_pnl(self, current_price: float) -> float:
        """Calculate unrealized P&L."""
        if self.side == TradeSide.YES:
            return (current_price - self.average_entry_price) * self.quantity
        else:
            return (self.average_entry_price - current_price) * self.quantity
