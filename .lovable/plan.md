

# Kalshi SOL 15-Minute Trading Dashboard

A real-time trading dashboard for Kalshi Solana prediction markets with live price feeds, countdown timers, and an intuitive trading interface.

---

## Core Features

### 1. Live Price Display
- Large, prominent current SOL/USD price from Binance API
- Color-coded: green when above target, red when below
- "Price to Beat" target from Kalshi market data
- Direction indicator (up/down arrow based on selection)

### 2. Countdown Timer
- Real-time MM:SS countdown to market close
- Color transitions: green → yellow (< 2 min) → red (< 30 sec)
- Automatically updates every second

### 3. Price Chart
- 15-minute price history visualization using Recharts
- Dashed reference line at strike/target price
- Clean minimal styling with area fill

### 4. Time Slot Selection
- Horizontal scrollable pills showing available trading windows
- Each pill displays the window time (e.g., "4:30 PM", "4:45 PM")
- Active slot highlighted, past slots dimmed
- Click to switch between time windows

### 5. Trading Action Area
- Two prominent Yes/No buttons
- YES: "Price will be ABOVE $XXX.XX"
- NO: "Price will be BELOW $XXX.XX"
- Display current bid/ask prices on buttons
- Disabled state when market is closed

### 6. Collapsible Orderbook Ladder
- Expandable accordion section
- "Trade Up" bids (green) and "Trade Down" asks (red)
- Visual size bars for order depth
- Spread indicator

### 7. LIVE Indicator
- Pulsing green dot with "LIVE" text
- Positioned top-right of dashboard
- Hidden when data is stale or market closed

---

## Backend Architecture

### Edge Function: dome-proxy
- Secure proxy for Dome API requests
- API key stored in Lovable Cloud secrets
- Handles market discovery and price fetching
- CORS configured for browser access

### Edge Function: binance-price
- Fetches real-time SOL/USD price from Binance
- No API key required for public endpoints
- Returns formatted price data

---

## Data Flow & Polling

| Data Type | Frequency | Source |
|-----------|-----------|--------|
| Market Discovery | Every 60 seconds | Dome API |
| Selected Market Price | Every 5 seconds | Dome API |
| SOL/USD Price | Every 3 seconds | Binance API |
| Countdown Timer | Every 1 second | Client-side |

---

## Design Style

**Clean Minimal Dark Theme:**
- Dark background for trading focus
- High contrast price displays
- Subtle borders and dividers
- Clear typography hierarchy
- Green/red for price direction
- Minimal decorative elements
- Focus on data readability

---

## Technical Implementation

- **State Management**: React Context for centralized market data
- **Rate Limiting**: Token bucket implementation (50 req/10s)
- **Error Handling**: Toast notifications, retry logic, offline detection
- **Filtering**: Client-side SOL 15-min market detection via ticker pattern matching

---

## Route

- `/sol-trading` - Main trading dashboard page

