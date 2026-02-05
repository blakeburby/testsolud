

# Fix Binance WebSocket Connection Failures

## Root Cause Analysis

The WebSocket is failing with **error code 1006** ("Abnormal Closure"). Based on my investigation, this is caused by **geographic IP blocking** by Binance:

### Evidence
- Console logs show repeated connection failures: `WebSocket error`, `WebSocket closed: 1006`
- Error 1006 means the connection was terminated without a proper close handshake
- The connection never reaches `onopen` - it fails during the handshake phase
- Binance (`binance.com`) blocks connections from certain regions including the **United States**

### Current Implementation Issues
1. **Direct browser connection** to `wss://stream.binance.com:9443` - this is blocked for US-based users
2. **No server-side proxy** - the deleted `binance-price` edge function could have served as a relay
3. **No fallback endpoint** - doesn't try `binance.us` for US users

---

## Solution: Server-Side WebSocket Proxy

Since direct browser connections to Binance are blocked, we need to create an edge function that:
1. Connects to Binance WebSocket from the server (not blocked)
2. Relays price updates to the frontend via Server-Sent Events (SSE) or polling

### Why Edge Function?
- Edge functions run on Supabase infrastructure (not geo-blocked)
- They can connect to Binance's WebSocket API directly
- The frontend receives data via a stable HTTP connection

---

## Implementation Plan

### Step 1: Create `binance-ws-proxy` Edge Function

Create a new edge function that:
- Maintains a persistent WebSocket connection to Binance
- Caches the latest trade price in memory
- Serves GET requests with the current price
- Handles the 24-hour WebSocket reconnection requirement

```
supabase/functions/binance-ws-proxy/index.ts
```

**Key features:**
- Connect to `wss://stream.binance.com:9443/ws/solusdt@trade`
- Parse trade messages and cache `{ price, timestamp }`
- Expose `/functions/v1/binance-ws-proxy` endpoint
- Automatic reconnection on disconnect

### Step 2: Update Frontend Hook

Modify `src/hooks/useBinanceWebSocket.ts` to:
- Poll the edge function every 500ms instead of direct WebSocket
- Maintain the same interface (`price`, `timestamp`, `isConnected`, `error`)
- Use exponential backoff for failed requests

### Step 3: Optimize for Real-Time Feel

Since polling has inherent latency:
- Poll at 500ms intervals (2 updates/sec)
- Consider Server-Sent Events (SSE) for true real-time if needed later

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/binance-ws-proxy/index.ts` | **Create** - Edge function that connects to Binance WebSocket and caches prices |
| `src/hooks/useBinanceWebSocket.ts` | **Modify** - Change from direct WebSocket to polling the edge function |

---

## Technical Details

### Edge Function (`binance-ws-proxy`)

```typescript
// Pseudocode structure
let cachedPrice = { price: null, timestamp: null };
let ws = null;

function connectBinance() {
  ws = new WebSocket('wss://stream.binance.com:9443/ws/solusdt@trade');
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    cachedPrice = { price: parseFloat(data.p), timestamp: data.T };
  };
  ws.onclose = () => setTimeout(connectBinance, 1000);
}

serve((req) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connectBinance();
  return Response.json(cachedPrice);
});
```

### Frontend Hook Changes

```typescript
// Change from WebSocket to polling
useEffect(() => {
  const pollPrice = async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/binance-ws-proxy`);
      const data = await response.json();
      if (data.price) {
        setState({ price: data.price, timestamp: data.timestamp, isConnected: true, error: null });
      }
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Connection error', isConnected: false }));
    }
  };
  
  pollPrice(); // Initial fetch
  const interval = setInterval(pollPrice, 500); // Poll every 500ms
  return () => clearInterval(interval);
}, []);
```

---

## Expected Outcome

After implementation:
- Price updates will work regardless of user location
- Chart will update ~2x per second (500ms polling)
- Connection status indicator will show "LIVE" when receiving data
- No more 1006 WebSocket errors in console
- Resilient to temporary network issues with automatic retry

---

## Alternative Approaches Considered

1. **Use binance.us endpoint** - Only works for US users, fails elsewhere
2. **CORS proxy** - Adds latency, potential single point of failure
3. **Server-Sent Events (SSE)** - More complex, could be added later for true real-time

The edge function approach is the most reliable solution that works globally.

