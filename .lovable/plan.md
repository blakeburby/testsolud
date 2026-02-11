

# Fix Kalshi Markets API - Add Authentication

## Problem

The Kalshi Markets API is returning **401 "token authentication failure"** on every request. The `kalshi-markets` edge function currently makes **unauthenticated** requests to Kalshi, but Kalshi now requires authentication even for public endpoints like `/markets`.

The `kalshi-orderbook` function already uses authentication (API key + RSA-PSS signature) and works correctly. The `kalshi-markets` function needs the same authentication logic.

## Root Cause

| Function | Authentication | Status |
|----------|---------------|--------|
| `kalshi-orderbook` | API key + RSA signature | Working |
| `kalshi-markets` | None (anonymous) | **401 errors** |

Your `KALSHI_API_KEY` and `KALSHI_PRIVATE_KEY` secrets are already configured -- they just aren't being used by the markets function.

## Fix

**File:** `supabase/functions/kalshi-markets/index.ts`

Copy the authentication logic from `kalshi-orderbook` into `kalshi-markets`:

1. Add the `importPrivateKey()` function (RSA key import from PEM)
2. Add the `signRequest()` function (RSA-PSS signature generation)
3. Load `KALSHI_API_KEY` and `KALSHI_PRIVATE_KEY` from environment
4. Generate authentication headers (`KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-TIMESTAMP`, `KALSHI-ACCESS-SIGNATURE`) for each request
5. Include these headers in the `fetchWithRetry` call

## Technical Details

The authentication flow (already working in `kalshi-orderbook`):

1. Load RSA private key from `KALSHI_PRIVATE_KEY` secret (PKCS#8 PEM format)
2. For each request, generate a signature over `{timestamp}{method}{path}` using RSA-PSS with SHA-256
3. Send three headers with every request:
   - `KALSHI-ACCESS-KEY`: The API key
   - `KALSHI-ACCESS-TIMESTAMP`: Current timestamp in milliseconds
   - `KALSHI-ACCESS-SIGNATURE`: Base64-encoded RSA-PSS signature

The path used for signing must match the API path exactly (e.g., `/trade-api/v2/markets?series_ticker=KXSOL15M&status=open&limit=100`).

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/kalshi-markets/index.ts` | Add RSA authentication (import from orderbook pattern) |

## Expected Outcome

- All Kalshi API calls will be authenticated
- 401 errors will stop
- Market data and orderbook data will both load correctly
