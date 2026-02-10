

# Collapsible Debug Panel Below Trade Plan

## Overview

Add a collapsible "Debug" panel directly below the TradePlan card. It starts collapsed (just a small "Debug" toggle) and expands to show four sections of internal engine data: regime analysis, blend weights, Monte Carlo stats, and accumulator state history.

## What You'll See

Collapsed: A subtle `[Bug icon] Debug` button at the bottom of the trade plan area.

Expanded (four sections):

**Regime Analysis**
- Current regime label + soft-weights bar (R1/R2/R3 as stacked horizontal bar)
- Annualized vol and recent vol ratio values

**Probability Blend**
- Three-column bar showing wMarket / wSim / wOrderbook percentages
- Individual probabilities: P_market, P_sim, P_orderbook, P_final
- Orderbook stats: imbalance, alpha, total depth, spread

**Monte Carlo**
- P(above strike) raw value
- Compute time in ms
- Num paths (100k)

**Accumulator History**
- Rolling log of the last ~20 evaluations: timestamp, decision, direction, EV, stability count
- Shows how the engine's opinion evolved over the window

## Changes

### 1. `src/types/signal-engine.ts`
- Add `DebugSnapshot` interface: `{ timestamp: number, decision, direction, ev, edge, regime, stabilityCount, pSim, pMarket, pFinal }`
- Add optional `debugData` field to `TradePlan`: `{ regimeDetection: RegimeDetection, orderbookImbalance: OrderbookImbalance, pSim: number, pMarket: number, pOB: number }`

### 2. `src/lib/signal-engine.ts`
- Attach intermediate values (`regimeResult`, `obResult`, `pSim`, `pMarket`, `pOB`) to the returned `TradePlan` via a new `debugData` field so the UI can display them without recomputing.

### 3. `src/hooks/useSignalEngine.ts`
- Add a `historyRef` (array of `DebugSnapshot`, capped at 20 entries) that appends a snapshot on each `compute()` call.
- Expose `debugHistory` and `debugData` (from the current plan) in the return value.
- Reset `historyRef` on window change.

### 4. `src/components/sol-dashboard/DebugPanel.tsx` (new file)
- Collapsible panel using `Collapsible` from shadcn (already installed).
- Four sub-sections, each a compact grid of monospace values:
  - **Regime**: stacked bar + numbers
  - **Blend**: three-segment bar + P values
  - **MC Stats**: raw sim probability, compute time, path count
  - **History**: scrollable mini-table of recent snapshots
- All text is `text-[10px] font-mono text-muted-foreground` to match the existing trading UI style.
- Collapsed by default; state persisted in local component state only.

### 5. `src/components/sol-dashboard/SOLDashboard.tsx`
- Import and render `DebugPanel` right after `TradePlan`.

## Files to Modify

| File | Change |
|------|--------|
| `src/types/signal-engine.ts` | Add `DebugSnapshot` and `debugData` field to `TradePlan` |
| `src/lib/signal-engine.ts` | Attach intermediate computation data to returned plan |
| `src/hooks/useSignalEngine.ts` | Track history array, expose `debugHistory` |
| `src/components/sol-dashboard/DebugPanel.tsx` | New collapsible debug UI component |
| `src/components/sol-dashboard/SOLDashboard.tsx` | Add `DebugPanel` below `TradePlan` |
