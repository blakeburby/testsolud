
# Fix Real-Time Chart Updates

## Root Cause Analysis

Two issues are preventing the chart from updating in real-time:

### Issue 1: Duplicate Detection Threshold Too Aggressive

In `SOLMarketsContext.tsx` (lines 140-144), the reducer checks for duplicate timestamps within **500ms**:
```typescript
const isDuplicate = state.priceHistory.some(
  p => Math.abs(p.time - timestamp) < 500
);
if (isDuplicate) return state;  // Skips the update!
```

**Problem**: Binance sends trades 10-50+ times per second. A 500ms window means only ~2 updates per second can get through - the rest are silently rejected.

### Issue 2: Chart Window Filter May Exclude Live Data

In `PriceChart.tsx` (lines 28-30):
```typescript
const windowPrices = priceHistory.filter(
  k => k.time >= windowStart && k.time <= windowEnd
);
```

If the synthetic slot windows don't perfectly align with current time, or if there's any timezone/timestamp mismatch, the chart filters out all the live data.

---

## Solution

### File 1: `src/contexts/SOLMarketsContext.tsx`

**Change 1**: Reduce duplicate threshold from 500ms to 50ms (allowing ~20 updates/sec)

```typescript
// Line 140-144 - Change from:
const isDuplicate = state.priceHistory.some(
  p => Math.abs(p.time - timestamp) < 500
);

// To:
const isDuplicate = state.priceHistory.some(
  p => Math.abs(p.time - timestamp) < 50  // Allow more frequent updates
);
```

**Change 2**: Add debug logging to confirm WebSocket prices are being received

```typescript
// Line 370-374 - Add logging:
useEffect(() => {
  if (wsPrice && wsTimestamp) {
    console.log(`WebSocket price update: $${wsPrice.toFixed(4)} at ${new Date(wsTimestamp).toLocaleTimeString()}`);
    dispatch({ type: 'ADD_PRICE_POINT', payload: { price: wsPrice, timestamp: wsTimestamp } });
  }
}, [wsPrice, wsTimestamp]);
```

### File 2: `src/components/sol-dashboard/PriceChart.tsx`

**Change 3**: Extend chart window to include "now" even if outside slot bounds

The chart should always show the current live data. Modify the filter to use a more lenient time window:

```typescript
// Lines 21-40 - Update to:
const chartData = useMemo(() => {
  if (!selectedSlot) return [];
  
  const now = Date.now();
  const windowStart = selectedSlot.windowStart.getTime();
  // Use the later of windowEnd or now+1minute to always show live data
  const windowEnd = Math.max(selectedSlot.windowEnd.getTime(), now + 60000);
  
  // Filter prices - include anything from windowStart to now
  const windowPrices = priceHistory.filter(
    k => k.time >= windowStart && k.time <= windowEnd
  );
  
  // Sort and format
  return windowPrices
    .sort((a, b) => a.time - b.time)
    .map(k => ({
      time: k.time,
      price: k.close,
      label: format(new Date(k.time), 'h:mm:ss'),
    }));
}, [priceHistory, selectedSlot]);
```

**Change 4**: Add debug display showing data points count

Add a temporary debug indicator to verify data is flowing:

```typescript
// After line 69 (loading state), add:
console.log(`Chart data points: ${chartData.length}, priceHistory: ${priceHistory.length}`);
```

---

## Technical Details

### Data Flow After Fix

```
Binance WebSocket
       |
       | trade event every ~20-100ms
       v
useBinanceWebSocket (hook)
       |
       | setState({price, timestamp})
       v
SOLMarketsProvider
       |
       | useEffect detects wsPrice change
       | dispatch ADD_PRICE_POINT
       v
Reducer
       |
       | Duplicate check (now 50ms)
       | Append to priceHistory
       | Update currentPrice
       v
PriceChart
       |
       | useMemo recomputes chartData
       | (includes all data up to now)
       v
Recharts re-renders
```

### Expected Update Rate

| Before | After |
|--------|-------|
| ~2 updates/sec (500ms threshold) | ~20 updates/sec (50ms threshold) |
| Chart may show 0 points | Chart shows all live points |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/SOLMarketsContext.tsx` | Reduce duplicate threshold to 50ms, add debug logging |
| `src/components/sol-dashboard/PriceChart.tsx` | Extend window filter to always include current time |

---

## Validation Steps

After implementation:
1. Open the dashboard and watch the chart
2. Check console for "WebSocket price update" logs appearing multiple times per second
3. Check console for "Chart data points" logs showing increasing count
4. Verify the chart line grows continuously without page refresh
5. Compare displayed price with live Binance SOL price
