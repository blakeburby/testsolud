

# Switch to Kraken WebSocket v2 for Real-Time SOL/USD Pricing

## Overview

Replace the current REST API polling approach with a direct WebSocket connection to Kraken's Public WebSocket v2 API. This will provide sub-second trade updates with minimum latency for the real-time trading dashboard.

---

## Architecture Decision

### Direct Browser WebSocket vs Edge Function Proxy

Since Kraken's public WebSocket API:
- Has no geo-restrictions (unlike Binance)
- Requires no API key
- Is designed for public access

We will implement a **direct browser WebSocket connection** to `wss://ws.kraken.com/v2`. This eliminates the 500ms polling latency and provides true real-time updates.

---

## Implementation Plan

### Step 1: Create New Hook - `useKrakenWebSocket.ts`

Replace `useBinanceWebSocket.ts` with a new Kraken-specific WebSocket implementation.

**File:** `src/hooks/useKrakenWebSocket.ts`

**Features:**
- Connect to `wss://ws.kraken.com/v2`
- Subscribe to `trades` channel for `SOL/USD`
- Parse trade messages and extract price/timestamp
- Exponential backoff reconnection logic
- Connection status tracking

**Subscription Payload:**
```json
{
  "method": "subscribe",
  "params": {
    "channel": "trade",
    "symbol": ["SOL/USD"]
  }
}
```

**Message Handling:**
- Ignore `heartbeat` and `status` messages
- Parse trade updates: extract `price` and `timestamp` from trade data
- Update state on every trade for maximum freshness

### Step 2: Update Context to Use New Hook

**File:** `src/contexts/SOLMarketsContext.tsx`

- Replace `useBinanceWebSocket` import with `useKrakenWebSocket`
- Update the hook call to use the new naming
- Keep the same interface: `{ price, timestamp, isConnected, error }`

### Step 3: Delete or Deprecate Edge Function

**File:** `supabase/functions/binance-ws-proxy/index.ts`

- Remove or mark as deprecated since we no longer need server-side price fetching
- The frontend connects directly to Kraken WebSocket

### Step 4: Clean Up Old Hook

**File:** `src/hooks/useBinanceWebSocket.ts`

- Delete this file as it's replaced by `useKrakenWebSocket.ts`

---

## Technical Details

### Kraken WebSocket v2 Trade Message Format

```json
{
  "channel": "trade",
  "type": "update",
  "data": [
    {
      "symbol": "SOL/USD",
      "side": "buy",
      "price": 91.06,
      "qty": 10.5,
      "ord_type": "limit",
      "trade_id": 123456,
      "timestamp": "2025-02-05T12:34:56.789Z"
    }
  ]
}
```

### Reconnection Strategy

```text
Attempt 1: Wait 1 second
Attempt 2: Wait 2 seconds
Attempt 3: Wait 4 seconds
Attempt 4: Wait 8 seconds
Max wait: 30 seconds
```

### State Interface (unchanged)

```typescript
interface WebSocketState {
  price: number | null;
  timestamp: number | null;
  isConnected: boolean;
  error: string | null;
}
```

---

## Files to Create/Modify/Delete

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useKrakenWebSocket.ts` | **Create** | New WebSocket hook for Kraken v2 API |
| `src/hooks/useBinanceWebSocket.ts` | **Delete** | Remove old polling-based hook |
| `src/contexts/SOLMarketsContext.tsx` | **Modify** | Update import to use new Kraken hook |
| `supabase/functions/binance-ws-proxy/index.ts` | **Delete** | No longer needed |

---

## Expected Outcome

| Metric | Before (Polling) | After (WebSocket) |
|--------|------------------|-------------------|
| Update Frequency | 500ms intervals | Real-time (on every trade) |
| Latency | ~500-1000ms | ~10-50ms |
| Price Source | CoinGecko (aggregated) | Kraken (direct exchange) |
| Price Accuracy | ~0.2% variance | ~0.01% variance |
| Connection Type | HTTP polling | Persistent WebSocket |

---

## Fallback Handling

If WebSocket connection fails:
1. Display "Disconnected" status in UI
2. Attempt reconnection with exponential backoff
3. Log errors for debugging
4. Keep last known price visible (greyed out)

No REST API fallback - the WebSocket is the sole source of truth for lowest latency.

