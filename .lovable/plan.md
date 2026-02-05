

# Implement Real-Time SOL Price Feed via Binance WebSocket

Replace the current polling-based price updates with a persistent WebSocket connection to Binance for true real-time, low-latency price streaming.

---

## Current Architecture

```text
+----------------+       500ms polling       +-------------------+
|   Frontend     | -----------------------> |  Edge Function    |
|   (Context)    |                          |  (binance-price)  |
+----------------+                          +-------------------+
       |                                            |
       v                                            v
  State Update                              Dome API / CoinGecko
  (dispatch)                                (REST calls)
```

**Problems with current approach:**
- 500ms polling creates artificial latency
- Each poll is a full HTTP round-trip (~100-300ms)
- Misses trades between poll intervals
- Higher server load and API rate limits

---

## New Architecture

```text
+----------------+    WebSocket (persistent)    +------------------+
|   Frontend     | <-------------------------> |  Binance Stream  |
|   (Custom Hook)|                             |  wss://stream... |
+----------------+                             +------------------+
       |
       v
  State Update (instant)
  via Context dispatch
```

**Benefits:**
- Updates on every trade (~10-50+ per second during active trading)
- Zero polling latency
- No API costs (free Binance WebSocket)
- Single persistent connection per session

---

## Implementation Plan

### File 1: Create WebSocket Hook

**New file: `src/hooks/useBinanceWebSocket.ts`**

A custom React hook that:
- Opens persistent WebSocket to `wss://stream.binance.com:9443/ws/solusdt@trade`
- Parses incoming trade messages (`p` = price, `T` = timestamp)
- Returns current price, connection status, and timestamp
- Implements exponential backoff reconnect (1s -> 2s -> 4s -> 8s -> 15s max)
- Cleans up on unmount

```typescript
interface BinanceTradeMessage {
  e: "trade";       // Event type
  s: string;        // Symbol (SOLUSDT)
  p: string;        // Price
  q: string;        // Quantity
  T: number;        // Trade timestamp
}

interface WebSocketState {
  price: number | null;
  timestamp: number | null;
  isConnected: boolean;
  error: string | null;
}
```

### File 2: Update Context to Use WebSocket

**Modify: `src/contexts/SOLMarketsContext.tsx`**

Changes:
1. Import and use the new `useBinanceWebSocket` hook
2. Remove `solPriceIntervalRef` polling interval
3. Remove `fetchSOLPriceQuickData` polling function
4. Add `useEffect` to dispatch price updates when WebSocket price changes
5. Update `isLive` state based on WebSocket connection status

```typescript
// Before (polling):
useEffect(() => {
  solPriceIntervalRef.current = window.setInterval(fetchSOLPriceQuickData, 500);
  return () => { ... };
}, [fetchSOLPriceQuickData]);

// After (WebSocket):
const { price: wsPrice, timestamp: wsTimestamp, isConnected } = useBinanceWebSocket();

useEffect(() => {
  if (wsPrice && wsTimestamp) {
    dispatch({ type: 'ADD_PRICE_POINT', payload: { price: wsPrice, timestamp: wsTimestamp } });
  }
}, [wsPrice, wsTimestamp]);

useEffect(() => {
  dispatch({ type: 'SET_LIVE', payload: isConnected });
}, [isConnected]);
```

### File 3: Keep Edge Function for Historical Data Only

**Modify: `supabase/functions/binance-price/index.ts`**

The edge function is still needed for:
- Initial historical price data (15-minute chart history)
- Fallback if WebSocket fails

No structural changes needed, just ensure it works for `?historical=true` mode.

---

## WebSocket Message Flow

```text
Binance Stream                    useBinanceWebSocket           SOLMarketsContext              UI
     |                                  |                              |                        |
     |--- trade message --------------->|                              |                        |
     |    {p: "91.25", T: 1738...}      |                              |                        |
     |                                  |--- price update ------------>|                        |
     |                                  |    {price: 91.25, ts: ...}   |                        |
     |                                  |                              |--- dispatch --------->|
     |                                  |                              |    ADD_PRICE_POINT    |
     |                                  |                              |                        |
     |--- next trade message (50ms) --->|                              |                        |
     |                                  |--- price update ------------>|                        |
     .                                  .                              .                        .
     .    (continuous stream)           .                              .                        .
```

---

## Reconnection Strategy

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1       | 1s    | 1s         |
| 2       | 2s    | 3s         |
| 3       | 4s    | 7s         |
| 4       | 8s    | 15s        |
| 5+      | 15s   | +15s each  |

On successful reconnect, reset backoff to 1s.

---

## Edge Cases Handled

| Scenario | Handling |
|----------|----------|
| Initial page load | Fetch historical data from edge function, then switch to WebSocket |
| WebSocket disconnect | Show "reconnecting" state, use exponential backoff |
| Browser tab hidden | WebSocket stays open (browser manages) |
| Component unmount | Clean close WebSocket connection |
| Network restored | Auto-reconnect via backoff logic |
| Invalid message | Skip and log warning |

---

## Validation Checklist

- [ ] Price updates multiple times per second
- [ ] "Live" indicator shows green when connected
- [ ] No memory leaks (single WebSocket instance)
- [ ] No duplicate connections
- [ ] Graceful reconnection after network loss
- [ ] Chart continues working during brief disconnects

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useBinanceWebSocket.ts` | Create | WebSocket connection hook |
| `src/contexts/SOLMarketsContext.tsx` | Modify | Replace polling with WebSocket |

---

## Technical Details

### useBinanceWebSocket Hook Implementation

```typescript
export function useBinanceWebSocket(symbol: string = 'solusdt') {
  const [state, setState] = useState<WebSocketState>({
    price: null,
    timestamp: null,
    isConnected: false,
    error: null,
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@trade`);
    
    ws.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
      reconnectAttemptRef.current = 0;
    };
    
    ws.onmessage = (event) => {
      const data: BinanceTradeMessage = JSON.parse(event.data);
      if (data.e === 'trade' && data.p) {
        setState(prev => ({
          ...prev,
          price: parseFloat(data.p),
          timestamp: data.T,
        }));
      }
    };
    
    ws.onerror = (error) => {
      setState(prev => ({ ...prev, error: 'Connection error' }));
    };
    
    ws.onclose = () => {
      setState(prev => ({ ...prev, isConnected: false }));
      scheduleReconnect();
    };
    
    wsRef.current = ws;
  }, [symbol]);

  const scheduleReconnect = () => {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 15000);
    reconnectAttemptRef.current++;
    reconnectTimeoutRef.current = window.setTimeout(connect, delay);
  };

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return state;
}
```

