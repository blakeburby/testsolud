

# Fix Kalshi API Data Mapping Issues

Three issues need to be fixed in `src/lib/sol-market-filter.ts` to correctly parse Kalshi API responses.

---

## Issue 1: Wrong `strike_type` Comparison

**Problem:** The API returns `"greater_or_equal"` but the code only checks for `"greater"`, causing direction to default to `"down"`.

**Location:** Line 102

**Current code:**
```typescript
direction = m.strike_type === 'greater' ? 'up' : 'down';
```

**Fix:**
```typescript
direction = (m.strike_type === 'greater' || m.strike_type === 'greater_or_equal') ? 'up' : 'down';
```

---

## Issue 2: `windowStart` Calculated Instead of Using API

**Problem:** The code calculates `windowStart` as `close_time - 15 minutes` instead of using the API-provided `open_time`.

**Location:** Lines 79-81

**Current code:**
```typescript
const windowEnd = closeTime;
const windowStart = new Date(windowEnd.getTime() - 15 * 60 * 1000);
```

**Fix:**
```typescript
const windowStart = new Date(m.open_time);
const windowEnd = new Date(m.close_time);
```

---

## Issue 3: Timezone Display

**Context:** The API returns UTC times but Kalshi displays in ET. This isn't a parsing bug - the dates are correct, they just need to be formatted for ET display in the UI components.

**Note:** The strike price discrepancy ($90.68 vs $91.00) appears to be Kalshi's website rounding for display. The API value is the accurate one for trading purposes.

---

## File Changes

| File | Changes |
|------|---------|
| `src/lib/sol-market-filter.ts` | Fix `strike_type` comparison to include `greater_or_equal`; Use `open_time` from API for `windowStart` |

---

## Technical Details

### Updated `parseKalshiFullMarket` Function

```typescript
export function parseKalshiFullMarket(m: KalshiFullMarketResponse): SOLMarket | null {
  // Use open_time and close_time directly from API
  const windowStart = new Date(m.open_time);
  const windowEnd = new Date(m.close_time);
  const closeTime = windowEnd;
  
  // Strike price logic (unchanged)
  let strikePrice = 0;
  if (m.functional_strike) {
    strikePrice = parseFloat(m.functional_strike);
  } else if (m.floor_strike) {
    strikePrice = m.floor_strike;
  } else if (m.cap_strike) {
    strikePrice = m.cap_strike;
  } else if (m.yes_sub_title) {
    const match = m.yes_sub_title.match(/\$(\d+\.?\d*)/);
    if (match) strikePrice = parseFloat(match[1]);
  } else {
    strikePrice = extractStrikePrice(m.title) ?? 0;
  }
  
  // Fix: Handle both 'greater' and 'greater_or_equal' as 'up'
  let direction: 'up' | 'down' = 'up';
  if (m.strike_type) {
    direction = (m.strike_type === 'greater' || m.strike_type === 'greater_or_equal') 
      ? 'up' 
      : 'down';
  } else if (m.floor_strike) {
    direction = 'up';
  } else if (m.cap_strike) {
    direction = 'down';
  } else {
    const titleLower = m.title.toLowerCase();
    if (titleLower.includes('down') || titleLower.includes('below') || titleLower.includes('less')) {
      direction = 'down';
    }
  }
  
  // ... rest unchanged
}
```

---

## Expected Results

After these fixes:
- Markets with `strike_type: "greater_or_equal"` will correctly show as "up" direction
- Window times will match the actual contract open/close times from Kalshi API
- Time slot pills will display the correct 15-minute windows

