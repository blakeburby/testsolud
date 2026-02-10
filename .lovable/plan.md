

# Real-Time Monte Carlo Updates (Every Second)

## Problem

The Monte Carlo distribution visualization only updates when the full signal engine recomputes (debounced at 500ms, but gated by stability/commitment logic). Once committed, it stops updating entirely. The user wants the MC visuals to refresh every ~1 second with the latest price.

## Solution

Decouple the MC distribution computation from the main signal engine loop. Run it independently on a 1-second interval directly in the `DebugPanel` component, using the latest price and market data from context.

## Changes

### 1. `src/components/sol-dashboard/DebugPanel.tsx`

- Import `useSOLMarkets` and `runMonteCarloDistribution` + `detectRegime` directly
- Add a `useEffect` with a 1-second `setInterval` that:
  - Reads `currentPrice`, `selectedMarket`, `selectedSlot`, `priceHistory` from context
  - Calls `detectRegime()` to get regime vols/weights
  - Calls `runMonteCarloDistribution()` with the latest price
  - Stores result in local state (`liveMcDistribution`)
- Pass `liveMcDistribution` to the `MCSection` instead of the stale `debugData.mcDistribution`
- Only run the interval when the panel is open (check `open` state) to avoid wasted compute when collapsed

### 2. `src/lib/signal-engine.ts`

- Export `getRegimeVols()` (or inline the vol constants) so the debug panel can compute regime-weighted vols without duplicating logic
- The existing `runMonteCarloDistribution` is already exported -- no changes needed there

## No other files need changes.

## Technical Details

- The 10k-path sim takes ~5-10ms, so running it every 1s is negligible
- When the debug panel is collapsed, the interval is cleared (no wasted CPU)
- The main signal engine loop remains unchanged -- this is a purely additive visualization layer
- Regime vols are constants already defined in the engine; we just need to export them or the helper

