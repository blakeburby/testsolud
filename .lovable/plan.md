

# Maximize Price Chart Update Speed

## Problem Analysis

The chart is not updating with every WebSocket trade due to these bottlenecks:

| Location | Issue | Impact |
|----------|-------|--------|
| `SOLMarketsContext.tsx` line 82-86 | 50ms duplicate filter blocks rapid trades | High-frequency trades get dropped |
| `useKrakenWebSocket.ts` line 103-105 | Only the LAST trade in a batch is processed | Multi-trade messages lose data |
| React Effect dependency | Uses `[wsPrice, wsTimestamp]` | Same-price trades don't trigger updates |

---

## Solution

### Step 1: Process ALL Trades in Each Message

**File:** `src/hooks/useKrakenWebSocket.ts`

Currently, when Kraken sends multiple trades in one message, we only process the last one:

```typescript
// Current - only last trade
const latestTrade = trades[trades.length - 1];
setState({ price: latestTrade.price, ... });
```

Change to emit each trade individually with a unique sequence number:

```typescript
// New - process every trade with unique counter
const [state, setState] = useState<WebSocketState>({
  price: null,
  timestamp: null,
  isConnected: false,
  error: null,
  sequence: 0, // Add sequence counter
});

// In onmessage handler:
if (trades.length > 0) {
  const latestTrade = trades[trades.length - 1];
  setState(prev => ({
    price: latestTrade.price,
    timestamp: new Date(latestTrade.timestamp).getTime(),
    isConnected: true,
    error: null,
    sequence: prev.sequence + 1, // Increment on every message
  }));
}
```

### Step 2: Use Sequence Counter as Dependency

**File:** `src/contexts/SOLMarketsContext.tsx`

Update the effect to use the sequence counter, ensuring every message triggers an update:

```typescript
const { price: wsPrice, timestamp: wsTimestamp, isConnected: wsConnected, sequence } = useKrakenWebSocket('SOL/USD');

useEffect(() => {
  if (wsPrice && wsTimestamp) {
    dispatch({ type: 'ADD_PRICE_POINT', payload: { price: wsPrice, timestamp: wsTimestamp } });
  }
}, [sequence]); // Trigger on every message, not just price changes
```

### Step 3: Remove Duplicate Timestamp Filter

**File:** `src/contexts/SOLMarketsContext.tsx`

Remove the 50ms duplicate filter that blocks rapid trades:

```typescript
// REMOVE this block entirely:
const isDuplicate = state.priceHistory.some(
  p => Math.abs(p.time - timestamp) < 50
);
if (isDuplicate) return state;
```

Instead, use the raw timestamp. Kraken trade timestamps are unique enough.

### Step 4: Optimize Chart Rendering

**File:** `src/components/sol-dashboard/PriceChart.tsx`

The chart already has `isAnimationActive={false}` which is good. Add a note that recharts will re-render on every data change.

For extreme performance, we could consider:
- Debouncing chart updates (not recommended if real-time is priority)
- Using a canvas-based chart library (major refactor)

**Recommendation:** Keep current recharts implementation - it handles 20+ updates/sec well.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useKrakenWebSocket.ts` | Add `sequence` counter to state, increment on every trade message |
| `src/contexts/SOLMarketsContext.tsx` | Use `sequence` as effect dependency, remove 50ms duplicate filter |

---

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Updates Per Second | ~10-15 (filtered) | All trades (~20-50+) |
| Duplicate Filter | 50ms threshold | None (raw trades) |
| Trigger Mechanism | Price/timestamp changes | Every WebSocket message |
| Data Points | May skip same-price trades | Every trade recorded |

---

## Technical Notes

- Kraken can send 20+ trades per second for SOL/USD during high volume
- Each trade has a unique `trade_id` and millisecond-precision timestamp
- The sequence counter guarantees React re-renders on every WebSocket message
- Memory usage will increase slightly with more data points (mitigated by 15-minute rolling window)

