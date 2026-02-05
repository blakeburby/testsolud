
# Implement Authenticated Kalshi Orderbook API

## Overview

Build a secure, production-ready client to fetch real orderbook data from Kalshi's authenticated REST API. The solution uses RSA-PSS with SHA256 signing, executed server-side in an edge function to protect the private key.

## Architecture

```
+------------------+     +----------------------+     +------------------+
|  OrderbookLadder | --> | kalshi-orderbook     | --> | Kalshi API       |
|  Component       |     | Edge Function        |     | /markets/{}/     |
|                  |     |                      |     | orderbook        |
|  - Polls every   |     | - Loads API key &    |     |                  |
|    2-3 seconds   |     |   RSA private key    |     | Returns:         |
|  - Displays bids |     | - Generates timestamp|     | - yes bids/asks  |
|    and asks      |     | - Signs with RSA-PSS |     | - no bids/asks   |
+------------------+     +----------------------+     +------------------+
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/kalshi-orderbook/index.ts` | Create | Edge function for authenticated API calls |
| `src/lib/kalshi-client.ts` | Modify | Add `fetchKalshiOrderbook()` function |
| `src/types/sol-markets.ts` | Modify | Add orderbook response types |
| `src/components/sol-dashboard/OrderbookLadder.tsx` | Modify | Replace mock data with real API data |
| `src/contexts/SOLMarketsContext.tsx` | Modify | Add orderbook state and polling |

## Implementation Details

### Step 1: Add Secrets for Kalshi API Credentials

Two secrets need to be configured:
- `KALSHI_API_KEY` - The API key ID from Kalshi
- `KALSHI_PRIVATE_KEY` - The RSA private key (PEM format)

### Step 2: Create Edge Function (`supabase/functions/kalshi-orderbook/index.ts`)

The edge function handles:

1. **Timestamp Generation**: Uses `Date.now()` for millisecond precision
2. **Message Construction**: `{timestamp}{method}{path}` format (path without query params)
3. **RSA-PSS Signing**: Uses Web Crypto API with:
   - Algorithm: `RSA-PSS`
   - Hash: `SHA-256`
   - Salt length: 32 bytes (SHA-256 output length)
4. **Request Headers**:
   - `KALSHI-ACCESS-KEY`: API key ID
   - `KALSHI-ACCESS-TIMESTAMP`: Generated timestamp
   - `KALSHI-ACCESS-SIGNATURE`: Base64-encoded signature

```typescript
// Pseudocode for signing
const timestamp = Date.now().toString();
const method = "GET";
const path = `/trade-api/v2/markets/${ticker}/orderbook`;
const message = `${timestamp}${method}${path}`;

const signature = await crypto.subtle.sign(
  { name: "RSA-PSS", saltLength: 32 },
  privateKey,
  new TextEncoder().encode(message)
);

const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
```

**Error Handling**:
- 200: Return parsed orderbook
- 401: Return authentication error with details
- 404: Return market not found error
- 500+: Implement exponential backoff retry (up to 3 attempts)

### Step 3: Add TypeScript Types (`src/types/sol-markets.ts`)

```typescript
export interface KalshiOrderbookResponse {
  orderbook: {
    yes: Array<[number, number]>; // [price_cents, size]
    no: Array<[number, number]>;
  };
  orderbook_fp?: {
    yes_dollars: Array<[string, number]>;
    no_dollars: Array<[string, number]>;
  };
}

export interface OrderbookData {
  yesBids: OrderbookLevel[];
  yesAsks: OrderbookLevel[];
  noBids: OrderbookLevel[];
  noAsks: OrderbookLevel[];
  lastPrice: number | null;
  spread: number | null;
  totalVolume: number;
  lastUpdated: Date;
}
```

### Step 4: Add Client Function (`src/lib/kalshi-client.ts`)

```typescript
export async function fetchKalshiOrderbook(ticker: string): Promise<OrderbookData> {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/kalshi-orderbook?ticker=${ticker}`
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch orderbook');
  }
  
  return response.json();
}
```

### Step 5: Update Context (`src/contexts/SOLMarketsContext.tsx`)

Add orderbook state and polling:

```typescript
// New state fields
orderbook: OrderbookData | null;
orderbookLoading: boolean;
orderbookError: string | null;

// New action types
| { type: 'SET_ORDERBOOK'; payload: OrderbookData }
| { type: 'SET_ORDERBOOK_LOADING'; payload: boolean }
| { type: 'SET_ORDERBOOK_ERROR'; payload: string | null }

// Poll orderbook every 2 seconds when market is selected
useEffect(() => {
  if (!state.selectedMarket || state.selectedMarket.ticker.startsWith('SYNTHETIC-')) {
    return;
  }
  
  const fetchOrderbook = async () => {
    try {
      const data = await fetchKalshiOrderbook(state.selectedMarket.ticker);
      dispatch({ type: 'SET_ORDERBOOK', payload: data });
    } catch (error) {
      dispatch({ type: 'SET_ORDERBOOK_ERROR', payload: error.message });
    }
  };
  
  fetchOrderbook();
  const interval = setInterval(fetchOrderbook, 2000);
  return () => clearInterval(interval);
}, [state.selectedMarket?.ticker]);
```

### Step 6: Update OrderbookLadder Component

Replace mock data generation with real data consumption:

```typescript
export function OrderbookLadder() {
  const { selectedMarket, selectedSlot, orderbook, orderbookLoading } = useSOLMarkets();
  
  // Show loading state
  if (orderbookLoading && !orderbook) {
    return <OrderbookSkeleton />;
  }
  
  // Use real data from context
  const { yesBids, yesAsks, noBids, noAsks, spread, totalVolume } = orderbook || {
    yesBids: [], yesAsks: [], noBids: [], noAsks: [],
    spread: null, totalVolume: 0
  };
  
  // Render based on activeTab ('up' = yes orders, 'down' = no orders)
  const bids = activeTab === 'up' ? yesBids : noBids;
  const asks = activeTab === 'up' ? yesAsks : noAsks;
  
  // ... rest of component
}
```

## Security Considerations

1. **Private Key Protection**: RSA private key stored as backend secret, never exposed to client
2. **Server-Side Signing**: All signature generation happens in edge function
3. **No Hardcoded Credentials**: Timestamp and signature regenerated for every request
4. **Rate Limiting**: 2-second polling interval respects Kalshi rate limits

## Technical Details

### RSA-PSS Signing in Deno/Edge Functions

```typescript
// Import private key from PEM format
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
```

### Kalshi Orderbook Response Format

```json
{
  "orderbook": {
    "yes": [[45, 100], [44, 250], [43, 500]],
    "no": [[55, 150], [56, 300], [57, 200]]
  },
  "orderbook_fp": {
    "yes_dollars": [["0.45", 100], ["0.44", 250]],
    "no_dollars": [["0.55", 150], ["0.56", 300]]
  }
}
```

## Fallback Behavior

- If credentials not configured: Show "API key required" message with setup instructions
- If authentication fails: Display error and retain last known orderbook state
- If market not found: Clear orderbook and show "No orderbook available"
- For synthetic markets: Continue showing mock data with "Demo" label

## Testing Steps

1. Configure KALSHI_API_KEY and KALSHI_PRIVATE_KEY secrets
2. Navigate to dashboard with an active KXSOL15M market
3. Verify orderbook displays real bid/ask data
4. Confirm orderbook updates every 2 seconds
5. Test error handling by temporarily invalidating credentials
