

# High-Frequency SOL/USD Price Updates - Multiple Times Per Second

## Problem Identified

The console logs reveal the real issue:

```
[Kraken WS] Trade: $91.2000 | 11:35:58 PM
[Kraken WS] Trade: $91.1700 | 11:36:07 PM  ← 9 seconds gap
[Kraken WS] Trade: $91.1700 | 11:36:12 PM  ← 5 seconds gap
```

**Kraken's SOL/USD pair has low trading volume** - trades only occur every 5-10 seconds. This is not a code issue; it's an exchange liquidity issue.

---

## Solution: Multi-Source WebSocket Strategy

Combine multiple data sources to achieve sub-second updates:

### Architecture

```
+------------------+     +------------------+     +------------------+
|   Kraken WS      |     |   Coinbase WS    |     |  Binance.US WS   |
|   (trade)        |     |   (ticker)       |     |  (aggTrade)      |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         v                        v                        v
    +----+------------------------+------------------------+----+
    |                    Price Aggregator                       |
    |  - Dedup by timestamp                                     |
    |  - Take most recent price                                 |
    |  - Emit on ANY source update                              |
    +---------------------------+-------------------------------+
                                |
                                v
                    +----------+----------+
                    |   Chart Component   |
                    |   (updates ~10x/sec)|
                    +---------------------+
```

---

## Implementation Plan

### Step 1: Create Multi-Source WebSocket Hook

**File:** `src/hooks/useMultiSourcePrice.ts` (new)

Connect to multiple exchanges simultaneously:

| Source | Channel | Update Frequency | Notes |
|--------|---------|------------------|-------|
| Kraken | `trade` | ~0.1-0.2/sec | Most accurate (actual trades) |
| Coinbase | `ticker` | ~1-5/sec | Best bid/ask updates |
| Binance.US | `aggTrade` | ~5-20/sec | Highest frequency, no geo-block |

**Key Features:**
- Connect to all 3 sources simultaneously
- Track last update time from each source
- Emit the most recent price on ANY source update
- Sequence counter increments on every message from any source

### Step 2: Coinbase WebSocket Integration

**Endpoint:** `wss://ws-feed.exchange.coinbase.com`

**Subscription:**
```json
{
  "type": "subscribe",
  "product_ids": ["SOL-USD"],
  "channels": ["ticker"]
}
```

**Ticker Message (updates on every order book change):**
```json
{
  "type": "ticker",
  "product_id": "SOL-USD",
  "price": "91.06",
  "time": "2025-02-05T23:37:00.000Z"
}
```

### Step 3: Binance.US WebSocket Integration

**Endpoint:** `wss://stream.binance.us:9443/ws/solusd@aggTrade`

**Message Format:**
```json
{
  "e": "aggTrade",
  "s": "SOLUSD",
  "p": "91.06",
  "T": 1738795020000
}
```

### Step 4: Update Context to Use Multi-Source Hook

**File:** `src/contexts/SOLMarketsContext.tsx`

Replace:
```typescript
const { ... } = useKrakenWebSocket('SOL/USD');
```

With:
```typescript
const { price, timestamp, isConnected, sequence } = useMultiSourcePrice('SOL/USD');
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useMultiSourcePrice.ts` | **Create** | New hook connecting to Kraken + Coinbase + Binance.US |
| `src/hooks/useKrakenWebSocket.ts` | **Keep** | Used internally by multi-source hook |
| `src/contexts/SOLMarketsContext.tsx` | **Modify** | Switch to useMultiSourcePrice |

---

## Expected Outcome

| Metric | Current (Kraken only) | After (Multi-source) |
|--------|----------------------|----------------------|
| Updates/Second | 0.1-0.2 | 5-20+ |
| Source | Single exchange | 3 exchanges |
| Latency | Depends on Kraken trades | Best of 3 sources |
| Reliability | Single point of failure | Redundant |

---

## Technical Notes

1. **Price Consistency**: All major exchanges track within ~0.01% of each other for SOL/USD
2. **No Proxy Needed**: Coinbase and Binance.US WebSockets work directly from browser
3. **Memory**: Each source maintains its own connection; combined overhead is minimal
4. **Fallback**: If one source disconnects, others continue providing data

