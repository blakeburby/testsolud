
# Remove REST Feed and CoinGecko/CoinPaprika Fallbacks

This plan removes all REST-based price polling and third-party API fallbacks, making the Binance WebSocket the **sole source** of SOL price data.

---

## Summary of Changes

### 1. Frontend Context (`src/contexts/SOLMarketsContext.tsx`)

| Remove | Reason |
|--------|--------|
| `fetchSOLPriceHistorical` function (lines 248-263) | REST-based historical fetch no longer needed |
| Import of `fetchSOLPriceWithHistory` from kalshi-client | No longer used |
| Call to `fetchSOLPriceHistorical()` on initial load (line 296) | WebSocket now handles all price updates |
| Call to `fetchSOLPriceHistorical()` in `checkContractExpiry` (lines 273-274) | Unnecessary with live WebSocket |

**After removal**: The chart will start empty and populate as WebSocket trade data arrives. This is intentional - no stale/delayed data from REST sources.

---

### 2. Frontend Client (`src/lib/kalshi-client.ts`)

| Remove | Reason |
|--------|--------|
| `fetchSOLPriceQuick` function (lines 40-53) | Not used (already replaced by WebSocket) |
| `fetchSOLPriceWithHistory` function (lines 55-86) | No longer called after context cleanup |

**Keep**: The Kalshi market functions (`fetchKalshi15MinMarkets`, `fetchKalshiMarket`, `fetchKalshiOrderbook`) remain untouched - these are for prediction market data, not SOL price.

---

### 3. Edge Function (`supabase/functions/binance-price/index.ts`)

This edge function will be **deleted entirely** since it's no longer called by the frontend.

**What it contained**:
- Dome API integration
- CoinGecko fallback (3 attempts with backoff)
- CoinPaprika fallback
- In-memory price cache
- Historical data fetching

All of this is now replaced by the direct Binance WebSocket connection in the browser.

---

## Files Modified

| File | Action |
|------|--------|
| `src/contexts/SOLMarketsContext.tsx` | Remove REST fetch logic and imports |
| `src/lib/kalshi-client.ts` | Remove unused price fetch functions |
| `supabase/functions/binance-price/index.ts` | **Delete entire file** |

---

## Behavior After Changes

- **On page load**: Chart starts empty, populates within milliseconds as WebSocket trades arrive
- **Real-time updates**: Every Binance trade updates the chart immediately
- **No fallbacks**: If WebSocket disconnects, the chart pauses until reconnection (connection status indicator already shows this)
- **Contract expiry**: Markets refresh but price history builds from live WebSocket only
- **No edge function calls**: Reduced latency, no API rate limits, no third-party dependencies

---

## Technical Notes

- The WebSocket provides ~20+ updates per second during active trading
- Historical seeding is removed by design - users see live data from the moment they load the page
- If historical context is needed in the future, Binance's REST klines API could be added directly (but per your requirement, we're removing all REST)
