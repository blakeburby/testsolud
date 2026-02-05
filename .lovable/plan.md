
# Real-Time SOL Trading Dashboard Enhancement

This plan will transform the dashboard into a truly real-time trading experience with accurate data and automatic contract switching.

---

## Current Issues Identified

1. **Slow update intervals** - SOL price updates every 3s, market odds every 5s (should be 1s)
2. **No automatic contract switching** - When countdown expires, dashboard stays on expired contract
3. **Synthetic chart data** - Klines are randomly generated, not real price history
4. **No real-time price accumulation** - Chart resets on each fetch instead of building history
5. **No contract expiry detection** - Doesn't auto-fetch new contracts when 15-min windows roll over

---

## Implementation Plan

### Phase 1: Faster Polling (1-Second Updates)

**File: `src/contexts/SOLMarketsContext.tsx`**

- Reduce SOL price polling from 3s to 1s
- Reduce market odds polling from 5s to 1s  
- Add smart contract expiry detection
- Implement auto-switch to next active slot when current expires

**Changes:**
- `solPriceIntervalRef` interval: 3000ms to 1000ms
- `priceIntervalRef` interval: 5000ms to 1000ms
- Add `checkContractExpiry()` function that triggers market rediscovery
- Auto-select next available slot when `countdown.isExpired` becomes true

### Phase 2: Accumulating Price History

**File: `src/contexts/SOLMarketsContext.tsx`**

- Add new action `APPEND_PRICE` to accumulate real prices over time
- Only request klines on initial load, then append new prices
- Keep a rolling window of 15 minutes of data (matching contract duration)
- Timestamp-based deduplication to prevent duplicates

**New reducer action:**
```text
ADD_PRICE_POINT: { price: number, timestamp: number }
  - Appends to priceHistory array
  - Removes data older than 15 minutes
  - Deduplicates by timestamp
```

### Phase 3: Real Historical Price Data from CoinGecko

**File: `supabase/functions/binance-price/index.ts`**

- Use CoinGecko's market_chart endpoint for real historical data
- Fetch last 15 minutes of 1-minute granularity data
- Only fetch historical data on initial load (separate endpoint parameter)
- After that, accumulate live prices from simple/price endpoint

**API endpoint structure:**
```text
/simple/price - Fast current price (for 1s polling)
/coins/{id}/market_chart - Historical data (initial load only)
```

### Phase 4: Automatic Contract Rotation

**File: `src/contexts/SOLMarketsContext.tsx`**

- Watch the countdown timer via useEffect
- When countdown expires (totalSeconds === 0):
  1. Trigger immediate market rediscovery
  2. Auto-select the next active slot
  3. Clear and reset price history for new contract window

**Logic flow:**
```text
countdown.isExpired = true
  --> discoverMarkets()
  --> Auto-select next slot where isActive=true
  --> Reset priceHistory for new window
  --> Continue 1s polling
```

### Phase 5: Enhanced Chart with Contract Window Alignment

**File: `src/components/sol-dashboard/PriceChart.tsx`**

- Display only prices from current 15-minute window
- Show clear start/end boundaries
- Add visual indicator for contract window progress
- Smooth real-time updates without chart resets

---

## Technical Details

### Polling Strategy
```text
+-- Initial Load --+
|  Fetch markets   |  <-- Dome API
|  Fetch SOL (historical + current) | <-- CoinGecko
+------------------+
         |
         v
+-- Every 1 second --+
|  Fetch SOL price   |  <-- CoinGecko simple/price (fast)
|  Append to history |
|  Fetch market odds |  <-- Dome API market-price
+--------------------+
         |
         v
+-- On Contract Expiry --+
|  Rediscover markets    |
|  Auto-switch slot      |
|  Reset chart window    |
+-----------------------+
```

### Edge Function Optimization

Separate the price function into two modes:
1. **Quick mode** (default): Just returns current price - minimal latency
2. **Historical mode** (`?historical=true`): Returns 15min of kline data - initial load only

This reduces API calls and improves 1-second polling performance.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/SOLMarketsContext.tsx` | Faster polling, price accumulation, auto-switch |
| `supabase/functions/binance-price/index.ts` | Real historical data, optimized quick mode |
| `src/components/sol-dashboard/PriceChart.tsx` | Contract-window aligned chart |
| `src/lib/dome-client.ts` | Optimized fetch without klines for fast polling |

---

## Expected Result

After implementation:
- SOL price and odds update every second
- Chart shows real accumulated price data from contract start
- Automatic switch to new contract when 15-minute window expires
- Seamless trading experience matching Kalshi's real-time feel
