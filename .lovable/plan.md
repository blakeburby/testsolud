

# Fix Strike Price Extraction via Market Parser

## Problem

In `SOLMarketsContext.tsx` line 170, raw markets from the Kalshi **list** endpoint are cast as `KalshiFullMarketResponse`, but the list endpoint returns a different shape (`KalshiMarketResponse`):

```text
List endpoint fields:        Full endpoint fields:
  market_ticker                 ticker
  close_time                    open_time, close_time
  (no strike fields)            functional_strike, floor_strike, cap_strike, yes_sub_title
  last_price (cents)            last_price_dollars
```

The unsafe cast means `parseKalshiFullMarket` sees `undefined` for `ticker`, `open_time`, and all strike fields, producing `strikePrice = 0` and `K = 0` in the simulation.

## Solution

### 1. Add debug logging to `parseKalshiFullMarket` (temporary)

Log the raw market object on entry so we can confirm exactly which fields the API provides. This will be removed after verification.

### 2. Fix `parseKalshiFullMarket` to handle both response shapes

Update the parser in `src/lib/sol-market-filter.ts` to:

- Accept `ticker` OR `market_ticker`
- Accept `open_time` OR fall back to computing from `close_time`
- Extract strike from `title` as a reliable fallback (since `functional_strike`/`floor_strike`/`cap_strike` are only on the single-market endpoint)
- Handle `last_price` in cents (list endpoint) vs `last_price_dollars` (single endpoint)

### 3. Remove the unsafe cast in `SOLMarketsContext.tsx`

On line 170, change:
```
.map(m => parseKalshiFullMarket(m as unknown as KalshiFullMarketResponse))
```
to pass the raw market directly, since the parser will now handle both shapes.

## Files to Change

### `src/lib/sol-market-filter.ts`
- Add temporary `console.log('[DEBUG parseKalshiFullMarket]', JSON.stringify(m))` at function entry
- Make `parseKalshiFullMarket` accept a union type or use optional chaining for both field name variants:
  - `const ticker = m.ticker || (m as any).market_ticker`
  - `const eventTicker = m.event_ticker`
  - `const openTime = m.open_time ? new Date(m.open_time) : new Date(new Date(m.close_time).getTime() - 15*60*1000)`
  - Strike extraction: try `functional_strike`, `floor_strike`, `cap_strike`, `yes_sub_title`, then always fall back to `extractStrikePrice(m.title)`
  - Price parsing: check `last_price_dollars` first, then treat `last_price` as cents

### `src/contexts/SOLMarketsContext.tsx`
- Line 170: remove `as unknown as KalshiFullMarketResponse` cast, pass raw market object directly

### `src/types/sol-markets.ts`
- Add optional fields to `KalshiFullMarketResponse` to cover list-endpoint variants (`market_ticker?`, etc.), or create a union type

## Technical Details

The core fix in `parseKalshiFullMarket`:

```typescript
export function parseKalshiFullMarket(m: KalshiFullMarketResponse | KalshiMarketResponse): SOLMarket | null {
  // Debug: log raw fields (remove after verification)
  console.log('[DEBUG parseKalshiFullMarket]', {
    ticker: (m as any).ticker,
    market_ticker: (m as any).market_ticker,
    functional_strike: (m as any).functional_strike,
    floor_strike: (m as any).floor_strike,
    cap_strike: (m as any).cap_strike,
    yes_sub_title: (m as any).yes_sub_title,
    title: m.title,
    open_time: (m as any).open_time,
    close_time: m.close_time,
  });

  const ticker = (m as any).ticker || (m as any).market_ticker;
  const eventTicker = m.event_ticker;
  // ... handle both shapes for all fields
}
```

After confirming the fix works, the debug logging will be removed.

