"""
Market data models.
"""
from enum import Enum
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class MarketStatus(str, Enum):
    """Market status enumeration."""
    OPEN = "open"
    ACTIVE = "active"  # Kalshi API returns 'active' for open markets
    CLOSED = "closed"
    SETTLED = "settled"
    SUSPENDED = "suspended"


class Market(BaseModel):
    """Market model matching the Kalshi KXSOL15M contracts."""

    # Identifiers
    ticker: str = Field(..., description="Market ticker")
    event_ticker: str = Field(..., description="Event series ticker")
    title: str = Field(..., description="Market title")

    # Strike & Direction
    strike_price: float = Field(..., gt=0, description="Strike price for Solana")
    direction: str = Field(..., description="'up' or 'down'")

    # Timing
    window_start: datetime = Field(..., description="15-minute window start time")
    window_end: datetime = Field(..., description="15-minute window end time")
    close_time: datetime = Field(..., description="Market close time")
    expiration_time: datetime = Field(..., description="Market expiration/settlement time")

    # Status
    status: MarketStatus = Field(default=MarketStatus.OPEN)

    # Prices (0-1 for binary markets, or dollar format)
    yes_price: Optional[float] = Field(None, ge=0, le=1)
    no_price: Optional[float] = Field(None, ge=0, le=1)
    yes_bid: Optional[float] = Field(None, ge=0, le=1)
    yes_ask: Optional[float] = Field(None, ge=0, le=1)
    no_bid: Optional[float] = Field(None, ge=0, le=1)
    no_ask: Optional[float] = Field(None, ge=0, le=1)

    # Volume
    volume: int = Field(default=0, ge=0)
    volume_24h: int = Field(default=0, ge=0)

    # Metadata
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    @property
    def is_active(self) -> bool:
        """Check if market is currently active."""
        now = datetime.utcnow()
        return (
            self.status in (MarketStatus.OPEN, MarketStatus.ACTIVE)
            and self.window_start <= now < self.window_end
        )

    @property
    def is_tradeable(self) -> bool:
        """Check if market can be traded."""
        now = datetime.utcnow()
        return (
            self.status in (MarketStatus.OPEN, MarketStatus.ACTIVE)
            and now < self.close_time
        )

    @property
    def time_remaining(self) -> float:
        """Time remaining in seconds until window end."""
        now = datetime.utcnow()
        return max(0, (self.window_end - now).total_seconds())

    @property
    def spread(self) -> Optional[float]:
        """Calculate bid-ask spread."""
        if self.yes_bid is not None and self.yes_ask is not None:
            return self.yes_ask - self.yes_bid
        return None


class TimeSlot(BaseModel):
    """15-minute time slot containing multiple markets (up/down)."""

    window_start: datetime
    window_end: datetime
    markets: List[Market] = Field(default_factory=list)

    @property
    def is_active(self) -> bool:
        """Check if this time slot is currently active."""
        now = datetime.utcnow()
        return self.window_start <= now < self.window_end

    @property
    def is_past(self) -> bool:
        """Check if this time slot has passed."""
        return datetime.utcnow() >= self.window_end

    def get_market_by_direction(self, direction: str) -> Optional[Market]:
        """Get market by direction (up/down)."""
        for market in self.markets:
            if market.direction == direction:
                return market
        return None


class OrderbookLevel(BaseModel):
    """Single level in the orderbook."""
    price: float = Field(ge=0, le=1)
    size: int = Field(ge=0)
    side: str = Field(..., description="'yes' or 'no'")


class Orderbook(BaseModel):
    """Orderbook data for a market."""

    ticker: str
    yes_bids: List[OrderbookLevel] = Field(default_factory=list)
    yes_asks: List[OrderbookLevel] = Field(default_factory=list)
    no_bids: List[OrderbookLevel] = Field(default_factory=list)
    no_asks: List[OrderbookLevel] = Field(default_factory=list)

    last_price: Optional[float] = None
    spread: Optional[float] = None
    total_volume: float = 0

    last_updated: datetime = Field(default_factory=datetime.utcnow)

    @property
    def best_yes_bid(self) -> Optional[float]:
        """Get best YES bid price."""
        if self.yes_bids:
            return max(level.price for level in self.yes_bids)
        return None

    @property
    def best_yes_ask(self) -> Optional[float]:
        """Get best YES ask price."""
        if self.yes_asks:
            return min(level.price for level in self.yes_asks)
        return None

    @property
    def best_no_bid(self) -> Optional[float]:
        """Get best NO bid price."""
        if self.no_bids:
            return max(level.price for level in self.no_bids)
        return None

    @property
    def best_no_ask(self) -> Optional[float]:
        """Get best NO ask price."""
        if self.no_asks:
            return min(level.price for level in self.no_asks)
        return None
