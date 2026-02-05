

# Fix WebSocket: Switch to Binance.US Endpoint

## Root Cause

The WebSocket connection fails with **HTTP 451 (Unavailable For Legal Reasons)**:
```
WebSocket connection to 'wss://stream.binance.com:9443/ws/solusdt@trade' failed: 
Error during WebSocket handshake: Unexpected response code: 451
```

This means Binance's global servers are **geo-blocking** connections from the Lovable preview server's location.

---

## Solution

Switch from `stream.binance.com` to `stream.binance.us` - the Binance.US endpoint:
- Uses the **exact same message format** (no other code changes needed)
- Accessible from US-based servers
- Still free, no API key required
- Same real-time trade stream

---

## Implementation

### File: `src/hooks/useBinanceWebSocket.ts`

**Single line change on line 55:**

| Before | After |
|--------|-------|
| `wss://stream.binance.com:9443/ws/${symbol}@trade` | `wss://stream.binance.us:9443/ws/${symbol}@trade` |

```typescript
// Line 55 - Change from:
const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@trade`);

// To:
const ws = new WebSocket(`wss://stream.binance.us:9443/ws/${symbol}@trade`);
```

That's it. The message format is identical, so no other changes are needed.

---

## Why This Works

| Endpoint | Status |
|----------|--------|
| `stream.binance.com` | Blocked (HTTP 451) from US/certain regions |
| `stream.binance.us` | Available globally, same data format |

Both endpoints send trade messages in the same format:
```json
{
  "e": "trade",
  "s": "SOLUSDT", 
  "p": "91.25",
  "T": 1738726800000
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useBinanceWebSocket.ts` | Replace `binance.com` with `binance.us` on line 55 |

---

## Expected Result

After this one-line change:
- WebSocket connects successfully
- Price updates multiple times per second
- "Live" indicator shows connected
- Chart updates in real-time

