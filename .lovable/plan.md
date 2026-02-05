

# Fix Live Contract and Price Fetching

After thorough investigation, I've identified two core issues preventing the dashboard from fetching live data:

---

## Issues Identified

### Issue 1: CoinGecko Price API Intermittent Failures
The `binance-price` edge function is returning `{"price":0, "error":"Price unavailable"}` intermittently. This happens when CoinGecko's free API tier rate-limits requests or has temporary outages.

**Evidence:** Network requests show `{"price":0,"timestamp":1770255871090,"error":"Price unavailable"}`

### Issue 2: SOL 15-Minute Contracts Not Available via Dome API
The Dome API does not expose Kalshi's 15-minute SOL contracts (`KXSOL15M`). The current implementation:
- Expects ticker format `SOLUSDUP-26FEB05-T1645` which doesn't exist
- Searches through 564,905 markets without proper filtering
- Only finds long-term SOL contracts (Jan 1, 2027), not 15-minute windows

**Evidence:** API search for "SOL", "Solana", "KXSOL15M", "SOL Up or Down" returns only 8-9 long-term markets, zero 15-minute contracts.

---

## Solution

### Part 1: Robust Price Fetching with Fallback

Update the `binance-price` edge function to add a fallback price source when CoinGecko fails:
- Add retry logic with exponential backoff
- Implement a secondary price source (e.g., CoinPaprika or cached last-known-good price)
- Return cached price if API fails instead of returning 0

### Part 2: Adapt Market Discovery for Available Markets

Since 15-minute contracts aren't available through Dome API, adapt the system to work with what IS available:
- Update `fetchKalshiMarkets` to use `search` parameter to filter SOL markets
- Relax the ticker pattern regex to match actual Kalshi SOL market formats
- Update the market filter to work with daily/weekly SOL contracts (like `KXSOLD26-27JAN0100`)
- Modify time slot logic to work with longer-duration contracts

### Part 3: Alternative - Use Synthetic 15-Minute Windows

If real 15-minute contracts are unavailable, create a compelling demo experience:
- Use the available long-term SOL markets for odds/pricing
- Generate synthetic 15-minute windows based on current time
- Display live SOL price against closest strike price
- Calculate implied odds for "above/below" current price

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/binance-price/index.ts` | Add retry logic and fallback price sources |
| `src/lib/dome-client.ts` | Add `search` parameter for SOL market filtering |
| `src/lib/sol-market-filter.ts` | Relax ticker pattern to match actual Kalshi formats |
| `src/contexts/SOLMarketsContext.tsx` | Handle case when no contracts found, add synthetic mode |

---

## Implementation Details

### Edge Function Improvements

```text
binance-price/index.ts:
+-- Try CoinGecko with 3 retry attempts
|   +-- Success? Return price
|   +-- Fail? Try backup source
+-- Backup: CoinPaprika API (no geo-restrictions)
|   +-- Success? Return price
+-- Final fallback: Return last cached price with "stale" flag
```

### Market Discovery Updates

```text
dome-client.ts:
+-- Add search parameter: "SOL" or "Solana"
+-- Filter results client-side for crypto-specific markets

sol-market-filter.ts:
+-- New pattern: /^KX?SOL.*/ (matches KXSOLD26, KXSOLMAXY, etc.)
+-- Parse strike price from title: "SOL price on Jan 1, 2027?"
+-- Extract target value from ticker: T199.99 -> $199.99
```

### Graceful Degradation

If no 15-minute contracts exist:
1. Display available SOL markets with their timeframes
2. Show current SOL price prominently
3. Use the closest strike price as "price to beat"
4. Allow users to see odds without strict 15-minute windows

---

## Expected Result

After implementation:
- SOL price updates reliably every second (with fallback sources)
- Dashboard displays available SOL markets from Kalshi
- Works with actual market data instead of failing silently
- Clear messaging when 15-minute contracts aren't available

