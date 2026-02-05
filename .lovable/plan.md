

# Direct Kalshi API Integration for 15-Minute SOL Markets

Replace the Dome API proxy with direct Kalshi API access to fetch real KXSOL15M 15-minute contracts with live prices.

---

## Why This Works

The Kalshi public API (`api.elections.kalshi.com`) provides:
- **No authentication required** for reading public market data
- **`series_ticker` filter** to specifically request KXSOL15M contracts
- **Dollar-formatted prices** (`yes_bid_dollars`, `yes_ask_dollars`) - cleaner than cent-based values
- **Real-time bid/ask/last prices** on the same endpoint

---

## Architecture

```text
Current Flow (Dome):
Frontend --> dome-proxy --> Dome API --> (no 15-min data)

New Flow (Direct Kalshi):
Frontend --> kalshi-markets (Edge) --> Kalshi API --> KXSOL15M markets
```

---

## Implementation Steps

### Step 1: Create New Edge Function

**Create: `supabase/functions/kalshi-markets/index.ts`**

A simple proxy to Kalshi's public API that:
- Fetches markets filtered by `series_ticker=KXSOL15M` and `status=open`
- Fetches individual market details with full price data
- No authentication needed for public endpoints
- Returns data in the format the frontend expects

**Endpoints to support:**
| Mode | Kalshi Endpoint | Purpose |
|------|-----------------|---------|
| `list` | `GET /markets?series_ticker=KXSOL15M&status=open` | Discover all open 15-min SOL contracts |
| `get` | `GET /markets/{ticker}` | Get full details + prices for a specific market |

### Step 2: Update Client Library

**Modify: `src/lib/dome-client.ts` → rename to `src/lib/kalshi-client.ts`**

- Update `fetchKalshiMarkets()` to call new edge function
- Update `fetchMarketPrice()` to use `Get Market` endpoint
- Keep SOL price functions (CoinGecko/CoinPaprika) unchanged

### Step 3: Update Types

**Modify: `src/types/sol-markets.ts`**

Add new fields from direct Kalshi response:
- `yes_bid_dollars`, `yes_ask_dollars` (string format like "0.5600")
- `functional_strike` (contains strike price)
- `strike_type` ("greater" or "less" for up/down)

### Step 4: Update Market Filter

**Modify: `src/lib/sol-market-filter.ts`**

- Add pattern for KXSOL15M tickers: `KXSOL15M-DDMMMYY-THHMM`
- Parse `functional_strike` for strike price instead of extracting from title
- Use `strike_type` to determine direction (greater = up, less = down)

### Step 5: Update Context

**Modify: `src/contexts/SOLMarketsContext.tsx`**

- Replace Dome API calls with new Kalshi client functions
- Remove synthetic market generation (real data available)
- Update polling to use the faster `Get Market` endpoint for prices

---

## Files to Change

| Action | File | Changes |
|--------|------|---------|
| **Create** | `supabase/functions/kalshi-markets/index.ts` | New edge function for direct Kalshi API |
| **Rename** | `src/lib/dome-client.ts` → `src/lib/kalshi-client.ts` | Update to use new edge function |
| **Modify** | `src/types/sol-markets.ts` | Add Kalshi-specific response fields |
| **Modify** | `src/lib/sol-market-filter.ts` | Add KXSOL15M pattern, parse strike from API |
| **Modify** | `src/contexts/SOLMarketsContext.tsx` | Use new client, remove synthetic fallback |
| **Delete** | `supabase/functions/dome-proxy/index.ts` | No longer needed |

---

## Technical Details

### KXSOL15M Ticker Format

```text
KXSOL15M-05FEB26-T1645
         │       │
         │       └── Time: 16:45 (4:45 PM ET)
         └── Date: Feb 5, 2026
```

### Get Market Response (Key Fields)

```json
{
  "market": {
    "ticker": "KXSOL15M-05FEB26-T1645",
    "title": "SOL above $195.50 at 4:45 PM ET?",
    "status": "open",
    "close_time": "2026-02-05T21:45:00Z",
    "yes_bid": 45,
    "yes_bid_dollars": "0.45",
    "yes_ask": 48,
    "yes_ask_dollars": "0.48",
    "last_price": 46,
    "last_price_dollars": "0.46",
    "functional_strike": "195.50",
    "strike_type": "greater"
  }
}
```

### Price Conversion

Kalshi returns prices in two formats:
- Cents: `yes_bid: 45` (need to divide by 100)
- Dollars: `yes_bid_dollars: "0.45"` (can parse directly)

We'll use the dollar format for cleaner code.

---

## Expected Result

After implementation:
- Dashboard shows real KXSOL15M 15-minute contracts from Kalshi
- Live bid/ask prices update every 1 second
- No more synthetic fallback needed
- Full orderbook data available for each contract
- Strike prices parsed from API instead of guessing from title

