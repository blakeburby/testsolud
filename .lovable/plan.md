

# Smarter One-Trade-Per-Window Logic

## Current Problem

The engine has two extremes:
- **Too picky early**: Only commits if EV > 8 cents (rarely happens), so it stays in SCANNING for most of the window.
- **Too aggressive late**: At the 3-minute mark, it forces a trade even with negative EV by bypassing all safety gates.

You want something in between: take exactly one trade per window, but **only if there's any positive expected value**.

## New Logic

### Simplified Commitment Rules

1. **Scan the full window** -- continuously track the single best trade plan (highest EV that's positive).

2. **Commit when ready** -- commit to a trade when ALL of these are true:
   - Best candidate has positive EV (any amount above zero, after transaction costs)
   - At least 2 minutes of data have been collected (avoid committing on noisy early ticks)
   - The candidate has been the "best" for at least 3 consecutive evaluations (stability filter -- avoids locking in on a single noisy spike)

3. **Final check at 3 minutes remaining** -- if still scanning, commit to the best candidate IF it has positive EV. If no positive-EV candidate was ever found, output "NO TRADE -- no edge detected this window."

4. **Never force a negative-EV trade** -- remove `generateForcedTradePlan` entirely. The forced commit path simply locks in whatever `bestPlanSoFar` is, or outputs NO TRADE if none qualifies.

### Stability Filter (New)

The current system can lock in a plan that spiked to positive EV on a single noisy tick. Add a "confirmation counter":
- Each time the best candidate's direction and decision stay the same across consecutive ticks, increment a counter.
- Require the counter to reach 3 (i.e., ~1.5 seconds of agreement at 500ms debounce) before allowing commitment.
- This prevents locking in on transient microstructure noise.

### EV Threshold Change

Replace the current two-tier system (0.08 early / 0 forced) with a single rule:
- **Minimum EV to commit: 0** (any positive EV after transaction costs + error margin, which is already handled by the `passesGate` check in `computeEV`).
- Remove `EARLY_COMMIT_EV` constant entirely.

## Changes

### `src/hooks/useSignalEngine.ts`

- Remove `EARLY_COMMIT_EV` constant
- Add `stabilityCountRef` (tracks consecutive ticks where best plan direction + decision are unchanged)
- Add `dataCollectionStartRef` (tracks when first price data arrived in this window)
- New commitment logic:
  - If best plan has `decision === 'TRADE_NOW'` AND stability count >= 3 AND at least 2 minutes of data collected: **commit**
  - If `timeToExpiryMs < FORCED_COMMIT_MS` AND best plan has `decision === 'TRADE_NOW'`: **commit best plan**
  - If `timeToExpiryMs < FORCED_COMMIT_MS` AND no qualifying plan exists: **commit a NO_TRADE plan** with reason "No positive EV detected this window"
- Remove the call to `generateForcedTradePlan` -- the forced path just locks whatever is best, or NO_TRADE

### `src/lib/signal-engine.ts`

- Remove `generateForcedTradePlan()` function entirely (it's the source of bad forced trades)
- No other changes to the signal engine -- the math stays the same

### `src/types/signal-engine.ts`

- No changes needed (LockedTradePlan already has the right shape)

### `src/components/sol-dashboard/TradePlan.tsx`

- Update SCANNING state to show stability progress (e.g., "Signal confirming... 2/3")
- Handle the case where committed plan has `decision === 'NO_TRADE'` -- show "NO TRADE -- no edge this window" with a muted locked badge instead of the green one
- Add a "time scanning" indicator showing how long the engine has been evaluating

## Revised Flow

```text
Window opens
  |
  v
[SCANNING] "Collecting data..."  (first 2 minutes: observe only)
  |
  v
[SCANNING] "Evaluating... Best EV: +1.2c  Confirming 1/3"
  |
  v  (stability confirmed: same direction for 3 ticks + positive EV)
[COMMITTED] "TRADE NOW - LONG YES"  (locked)
  |
  v  (window expires, next contract)
[SCANNING] (reset)


--- OR if no edge found ---

[SCANNING] "No actionable signal yet"  (for 12 minutes)
  |
  v  (3 min remaining, no positive EV ever found)
[COMMITTED] "NO TRADE - No edge this window"  (locked, muted style)
  |
  v  (window expires)
[SCANNING] (reset)
```

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useSignalEngine.ts` | Replace commitment logic with stability-filtered positive-EV gating |
| `src/lib/signal-engine.ts` | Remove `generateForcedTradePlan()` |
| `src/components/sol-dashboard/TradePlan.tsx` | Add stability progress, handle committed NO_TRADE state |

