

# Remove All Fake/Made-up Data

This plan removes all synthetic fallback mechanisms and demo indicators from the application, ensuring only real Kalshi market data is displayed.

---

## What Will Be Removed

### 1. Synthetic Market Generator
The `generateSyntheticSlots()` function creates fake trading windows with hardcoded 50/50 odds when real contracts are unavailable. This will be completely removed.

**Affected file:** `src/contexts/SOLMarketsContext.tsx`
- Lines 9-82: Delete the entire `generateSyntheticSlots` function
- Lines 256-260: Remove fallback logic that calls synthetic generator when no markets found
- Lines 287-294: Remove fallback logic that creates synthetic slots on API error
- Lines 303-304: Remove synthetic market check in price fetching
- Lines 397-398: Remove synthetic market check in polling logic
- Lines 428-431: Remove synthetic market check in orderbook polling

### 2. Demo Badge in UI
The "Demo" label appears in the orderbook header when viewing synthetic markets.

**Affected file:** `src/components/sol-dashboard/orderbook/OrderbookHeader.tsx`
- Lines 72-76: Remove the `isSynthetic` demo badge
- Lines 9, 19: Remove `isSynthetic` prop entirely
- Line 36: Remove `!isSynthetic` condition from Live indicator
- Line 46: Remove `!isSynthetic` condition from depth summary

### 3. Synthetic Market Empty State
The orderbook shows a special message for synthetic markets.

**Affected file:** `src/components/sol-dashboard/OrderbookLadder.tsx`
- Lines 42-43: Remove `isSynthetic` variable
- Lines 121-123: Remove synthetic-specific empty state message
- Line 133: Remove `isSynthetic` prop passed to OrderbookHeader
- Line 148: Remove conditional that shows empty state for synthetic markets

---

## Behavior After Changes

When no real Kalshi markets are available:
- The UI will show an appropriate empty/loading state instead of fake data
- Users will see "No markets available" rather than synthetic contracts
- The orderbook will display "No orderbook data available" without the synthetic explanation
- Error handling will display the actual error message to users

---

## Files to Modify

| File | Change Type |
|------|-------------|
| `src/contexts/SOLMarketsContext.tsx` | Remove synthetic generator function and all related fallback logic |
| `src/components/sol-dashboard/orderbook/OrderbookHeader.tsx` | Remove `isSynthetic` prop and Demo badge |
| `src/components/sol-dashboard/OrderbookLadder.tsx` | Remove synthetic checks and related UI logic |

---

## Notes

- The fake cursor in `input-otp.tsx` is a standard UI component pattern (visual caret simulation) and not fake data
- The random width in `sidebar.tsx` is a skeleton loader animation, not fake data
- The `price: 0` fallback in the edge function is a legitimate error state, not fake data

These elements are standard UI/UX patterns and do not constitute fake market data, so they will not be removed.

