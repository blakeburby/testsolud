

# One Trade Per 15-Minute Market Window

## Problem

The signal engine currently recomputes on every price/orderbook update (every 500ms) and frequently outputs "NO TRADE" or "WAIT" because the EV gate, disagreement filter, or liquidity filter blocks. The user wants **exactly one actionable trade recommendation per 15-minute contract window** -- the engine should pick the best moment to enter and lock in that recommendation.

## Approach

Add a "best trade" accumulator that continuously evaluates the market throughout the window and commits to a single trade when conditions are optimal -- or forces a recommendation before time runs out.

### How It Works

1. **Accumulation phase** (first ~12 minutes): The engine runs continuously as it does now, but instead of displaying every tick's output, it tracks the **best trade plan seen so far** (highest EV that passes filters). The UI shows the current best candidate with a "PENDING" status.

2. **Commitment trigger**: The engine commits to a trade (locks it in) when either:
   - A plan passes all gates AND has EV above a "high confidence" threshold (commit early on strong signals)
   - Time remaining drops below 3 minutes (force-commit the best candidate seen, even if it was previously a NO_TRADE -- in that case, relax the EV gate and pick the side with the highest edge)

3. **Locked state**: Once committed, the trade plan is locked for the remainder of the window. No more recomputation. The UI shows the final recommendation with a "COMMITTED" badge.

4. **Reset on new window**: When the 15-minute window expires and the next contract loads, the accumulator resets.

## Changes

### `src/types/signal-engine.ts`
- Add `LockedTradePlan` type extending `TradePlan` with `lockedAt: Date`, `windowId: string`, `status: 'SCANNING' | 'COMMITTED'`

### `src/hooks/useSignalEngine.ts`
- Track `bestPlanSoFar` (highest EV plan) across ticks within the same window
- Add window identity tracking (using `selectedSlot.windowStart` timestamp) to detect window changes and reset
- Add commitment logic:
  - Early commit: EV > 0.08 (strong signal)
  - Forced commit: when `timeToExpiryMs < 3 * 60 * 1000`
- For forced commit with no qualifying plan: relax the EV gate to 0 (any positive EV) and pick the best direction
- Once committed, stop recomputing and return the locked plan
- Expose `status: 'SCANNING' | 'COMMITTED'` to the UI

### `src/lib/signal-engine.ts`
- Add a `generateForcedTradePlan(inputs)` function that always returns a TRADE_NOW decision by:
  - Skipping the disagreement filter
  - Skipping the liquidity minimum (but noting it in liquidityNotes)
  - Lowering the EV gate to 0 (any positive edge counts)
  - If edge is truly zero, picking the side where the model has even a slight lean and sizing at minimum Kelly

### `src/components/sol-dashboard/TradePlan.tsx`
- Add "SCANNING" status indicator (pulsing dot + "Evaluating..." text + best EV seen so far)
- Add "COMMITTED" badge (solid green with lock icon) when the trade is locked in
- Show time-of-commitment ("Locked at 12:34:15")
- Keep existing TRADE_NOW / WAIT / NO_TRADE display for the locked plan's details

## UI States

```text
Window starts
  |
  v
[SCANNING] "Evaluating market... Best EV: +2.3c"
  |
  | (strong signal detected OR 3min left)
  v
[COMMITTED] "TRADE NOW - LONG YES"
  Full trade plan details (entry, SL, TP, etc.)
  "Locked at 12:42:15"
  |
  | (window expires, next contract loads)
  v
[SCANNING] "Evaluating market..." (reset)
```

## Technical Details

- Window identity is derived from `selectedSlot.windowStart.getTime()` -- when this changes, reset the accumulator
- The "best plan" comparison uses `plan.expectedValue` as the primary ranking metric
- Early commit threshold: `EV > 0.08` (8 cents expected value -- strong enough to act immediately)
- Forced commit threshold: `timeToExpiryMs < 180_000` (3 minutes left)
- The forced plan generator reuses all existing computation but removes the hard NO_TRADE gates
- Position sizing is still Kelly-capped at 50% even in forced mode

## Files to Modify

| File | Change |
|------|--------|
| `src/types/signal-engine.ts` | Add `LockedTradePlan` type and `status` field |
| `src/lib/signal-engine.ts` | Add `generateForcedTradePlan()` function |
| `src/hooks/useSignalEngine.ts` | Add best-plan accumulator, window tracking, commitment logic |
| `src/components/sol-dashboard/TradePlan.tsx` | Add SCANNING/COMMITTED UI states |

