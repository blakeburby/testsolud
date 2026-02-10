

# Monte Carlo Simulation Visuals: Heat Map + Probability Distribution

## Overview

Add two new visual components to the debug panel that bring the Monte Carlo simulation to life:

1. **Price Distribution Heat Map** -- A horizontal heat strip showing the density of simulated final prices relative to the strike, colored from red (below strike) to green (above strike).

2. **Probability Gauge + Distribution Chart** -- A probability arc/gauge showing P(above strike) and a small histogram of simulated outcomes bucketed into price bins.

Currently the MC section in the debug panel only shows three text values. These visuals will make the simulation output intuitive at a glance.

## What You'll See

**Heat Map Strip** (below the MC stats):
- A horizontal bar divided into ~20 bins spanning the simulated price range
- Each bin's opacity reflects how many simulation paths landed there
- Colors: red tones for bins below strike, green tones for bins above strike
- A white marker line at the strike price position
- Labels for min, strike, and max price

**Probability Distribution Chart** (Recharts AreaChart):
- A small bell-curve-style area chart showing the distribution of final prices
- X-axis: price bins, Y-axis: frequency
- Area filled green above strike, red below strike
- Vertical reference line at the strike price
- Compact (150px tall) to fit inside the debug panel

## Technical Approach

The current `runMonteCarloSim` only returns a single number (P above strike). To power visuals, we need the distribution data. Rather than modifying the hot path (which runs 100k paths every 500ms), we'll:

1. Add a **separate lightweight sim** function that runs fewer paths (10k) but returns bucketed results -- called only when the debug panel is open.
2. Store the distribution data in a new type and pass it through the debug panel.

This keeps the main engine fast while giving the debug panel rich visual data on demand.

## Changes

### 1. `src/lib/signal-engine.ts`

Add a new exported function `runMonteCarloDistribution()`:
- Takes the same inputs as `runMonteCarloSim` 
- Runs 10,000 paths (not 100k -- this is for visualization only)
- Returns an array of `{ binCenter: number, count: number, isAboveStrike: boolean }` objects (~20 bins)
- Also returns `{ min, max, mean, median, p5, p95 }` summary stats

### 2. `src/types/signal-engine.ts`

Add new types:
- `MCDistributionBin`: `{ binCenter: number, count: number, frequency: number, isAboveStrike: boolean }`
- `MCDistributionResult`: `{ bins: MCDistributionBin[], stats: { min, max, mean, median, p5, p95 }, pAbove: number }`

### 3. `src/components/sol-dashboard/DebugPanel.tsx`

Replace the minimal `MCSection` with two new sub-components:

**`MCHeatStrip`**:
- Renders a flex row of 20 `div` cells
- Each cell's background opacity is proportional to `bin.frequency / maxFrequency`
- Color: `bg-red-500` for bins below strike, `bg-emerald-500` for above
- A thin white vertical line marks the strike position
- Labels below: min price, strike, max price
- Total width: 100% of the panel

**`MCDistributionChart`**:
- Uses Recharts `AreaChart` (already installed) with a single `Area`
- Data: the 20 bins from the distribution
- X-axis: `binCenter` formatted as price
- Y-axis: hidden (frequency)
- Two overlaid `Area` fills: one green (above strike), one red (below strike) -- achieved by splitting the data at the strike bin and rendering two areas
- `ReferenceLine` at the strike price
- Height: 120px
- Monospace stats row below: P(above), mean, median, p5-p95 range

**`MCProbabilityGauge`**:
- A simple horizontal progress bar showing P(above strike)
- Left side red, right side green, split at the probability point
- Label: "P(above strike): XX.X%"

### 4. `src/hooks/useSignalEngine.ts`

- When computing a trade plan, also call `runMonteCarloDistribution()` with the same inputs
- Attach the result to `debugData` as a new `mcDistribution` field
- Only compute this when there's an active plan (skip if no inputs)

### 5. `src/components/sol-dashboard/SOLDashboard.tsx`

No changes needed -- `DebugPanel` is already rendered.

## Performance Notes

- The 10k-path distribution sim adds ~5-10ms per evaluation (vs ~50ms for the main 100k sim)
- It reuses the same regime vols and weights already computed
- The Recharts `AreaChart` is lightweight at 20 data points
- The heat strip is pure CSS divs -- zero overhead

## Files to Modify

| File | Change |
|------|--------|
| `src/types/signal-engine.ts` | Add `MCDistributionBin` and `MCDistributionResult` types, add `mcDistribution` to `DebugData` |
| `src/lib/signal-engine.ts` | Add `runMonteCarloDistribution()` function, call it in `generateTradePlan` |
| `src/hooks/useSignalEngine.ts` | No changes needed (distribution flows through existing `debugData`) |
| `src/components/sol-dashboard/DebugPanel.tsx` | Replace `MCSection` with `MCHeatStrip`, `MCDistributionChart`, and `MCProbabilityGauge` |

