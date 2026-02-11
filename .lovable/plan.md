

# Institutional Terminal Redesign

## Summary

Strip all soft, decorative UI elements and rebuild the dashboard as a brutally efficient, data-dense trading terminal. Sharp geometry, monospace numbers, flat panels, zero animation, maximum information density.

## Changes Overview

### 1. Theme Hardening (`src/index.css`)

- Reduce `--radius` from `0.5rem` to `0.125rem` (2px max)
- Remove all gradient references
- Tighten card padding via new utility classes
- Remove `animate-pulse` from connection indicators (replace with static dot)
- Remove all `transition-*` and animation keyframes except orderbook flash (functional, not decorative)

### 2. Layout Restructure (`SOLDashboard.tsx`)

Convert from 2-column to 3-column terminal grid:

```text
+------------------+------------------+------------------+
| Market Data      | Simulation       | Positioning      |
| (S0, K, Delta,   | (Histogram,      | (Kelly, Edge bps |
|  sigma, mu, T)   |  P(up), mode)    |  EV per $1)      |
+------------------+------------------+------------------+
| Volatility       | Price Chart      | Edge Heatmap     |
| (EWMA, lambda,   |                  |                  |
|  eta, regime)    |                  |                  |
+------------------+------------------+------------------+
| Time Slots | Trading Buttons                            |
+-------------------------------------------------------|
| Orderbook (full width, collapsed header)               |
+-------------------------------------------------------|
| Strategy Summary (collapsed by default)                |
+-------------------------------------------------------+
```

- Reduce container max-width to `max-w-[1600px]` for wider data spread
- Reduce `px-4 py-6 space-y-4` to `px-3 py-3 space-y-2`
- Use `gap-2` instead of `gap-4` throughout

### 3. MarketOverviewPanel.tsx - Data Density Upgrade

- Remove decorative gradient icon box (the gold BarChart3 container)
- Remove probability comparison bar (soft rounded bar)
- Replace `rounded-xl` with `rounded-sm`
- Replace `p-5 space-y-4` with `p-3 space-y-2`
- Change from 4-column card layout to compact row-based table:
  - `S0` (current price, 4 decimal places)
  - `K` (strike, 4 decimal places)
  - `Delta` (S0 - K, signed, 4 decimals)
  - `sigma_total` from quant engine
  - `mu_adj` from quant engine
  - `T` displayed as `MM:SS`
  - `P(market)` and `P(true)` side by side
  - `Edge` in basis points (not percentage)
- All numbers: `font-mono text-sm text-right tabular-nums`
- Labels: `text-xs text-muted-foreground`
- Remove `text-2xl` sizing, max metric size is `text-base`
- Add latency indicator (ms since last tick) using wsTimestamp
- Add WebSocket status per exchange (3 dots: K/C/B)
- Remove `animate-pulse` from connection dot
- Remove all Lucide icons from labels (Target, TrendingUp, Clock) -- text-only labels

### 4. VolatilityPanel.tsx - Compact Rows

- Replace `rounded-xl` with `rounded-sm`
- Replace `p-5 space-y-4` with `p-3 space-y-2`
- Remove gold icon styling
- Add rows for:
  - EWMA lambda value (0.94)
  - 1-min variance (raw)
  - Vol regime threshold bands
- Keep regime pill but make it `rounded-sm` not rounded
- All stat rows: tighter `py-0` height
- Remove icon decorations from StatRow, use text-only labels

### 5. SimulationPanel.tsx - Clean Histogram

- Replace `rounded-xl` with `rounded-sm`
- Replace `p-5 space-y-4` with `p-3 space-y-2`
- Remove `radius={[2, 2, 0, 0]}` from bars (sharp rectangular bars)
- Increase bin count (pass higher bins param to monte-carlo)
- Add strike ReferenceLine as 1px solid (not dashed)
- Add large mono probability readout above chart: `P(Up) = XX.XX%`
- Remove `transition-all duration-500` from toggle button
- Reduce chart height from 200px to 160px
- Remove gold icon decoration
- Add simulation compute time display (already exists, keep it)

### 6. PositioningPanel.tsx - Table Format

- Replace card layout with compact table rows
- Replace `rounded-xl` with `rounded-sm`
- Replace `p-5 space-y-4` with `p-3 space-y-2`
- Display as strict key-value rows:
  - True Probability
  - Market Probability
  - Edge (in basis points: `edge * 10000`)
  - Full Kelly %
  - Quarter Kelly %
  - Quarter Kelly $ allocation
  - EV per $1 (`edge * kellyFraction` or similar)
- Remove signal box with rounded-lg border glow
- Replace signal with left-border accent: `border-l-2 border-trading-up` on the panel when signal is active
- Remove `rounded-full` from confidence badge, use `rounded-sm`
- Remove gold icon

### 7. EdgeHeatmap.tsx - Sharp Grid

- Replace `rounded-xl` with `rounded-sm`
- Replace `p-5 space-y-3` with `p-3 space-y-1`
- Remove `rounded` from bar fills, use sharp edges
- Remove `transition-all duration-300` from bars
- Remove gold icon
- Remove rounded legend dots, use `rounded-none` or `rounded-sm`

### 8. PriceChart.tsx - Clean Lines

- Remove `borderRadius: '8px'` from tooltip
- Remove `boxShadow` from tooltip
- Reduce chart height from 280px to 240px
- Remove `animate-pulse` from connection dot
- Remove active dot stroke/fill decoration (simpler activeDot)
- Remove target price badge (redundant with ReferenceLine)
- Reduce line width from 2.5 to 1.5

### 9. TradingButtons.tsx - Sharp Buttons

- Replace `rounded-full` with `rounded-sm` on Yes/No buttons
- Remove decorative padding and spacing
- Tighten layout

### 10. TimeSlotPills.tsx - Compact

- Replace `rounded-full` on slot buttons with `rounded-sm`
- Replace `rounded-lg` on view toggle with `rounded-sm`
- Remove `transition-colors`

### 11. OrderbookLadder.tsx + Sub-components

- Replace `rounded-lg` with `rounded-sm` on container
- Remove `transition-colors` from hover states
- Remove `rounded-full` from imbalance bar in header, use `rounded-none`
- Remove `rounded` from Asks/Bids labels, use `rounded-sm`
- Remove `transition-all duration-300` from depth bars
- MidPriceDisplay: remove `rounded-full` from direction indicator, reduce mid price from `text-2xl` to `text-base`

### 12. StrategySummary.tsx

- Replace `rounded-xl` with `rounded-sm`
- Remove `transition-colors` from hover states
- Remove gold icon
- Keep collapsed by default (already is)

### 13. Global CSS Changes (`src/index.css`)

- Add utility class `.terminal-panel` for consistent panel styling: `rounded-sm border border-border bg-card p-3`
- Remove soft keyframe animations (keep flash-green/flash-red for functional orderbook use)
- Remove `pulse-spread` animation

### 14. Monte Carlo Engine Update (`src/lib/quant/monte-carlo.ts`)

- Increase default histogram bin count from current to 40-50 bins for finer resolution

### 15. Performance: Remove Transitions

Across ALL dashboard components, search-and-replace:
- `transition-colors` -- remove
- `transition-all duration-300` -- remove
- `transition-all duration-500` -- remove
- `animate-pulse` -- remove (except loading skeletons)
- `hover:bg-muted/30` -- keep hover but remove transition

### 16. Status Bar Micro-Details

Add to MarketOverviewPanel header row:
- **Latency**: `{Date.now() - wsTimestamp}ms` since last tick
- **Compute**: `{lastComputeMs.toFixed(0)}ms` from quant engine
- **Sources**: 3 small status dots labeled K/C/B (Kraken/Coinbase/Binance) from `useMultiSourcePrice` sources state
- **Regime**: vol regime indicator from quant engine
- **Mode**: MC or CF from quant engine simMode

All displayed as `text-[10px] font-mono text-muted-foreground` in a compact status row.

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Reduce radius, remove decorative animations, add terminal-panel class |
| `src/components/sol-dashboard/SOLDashboard.tsx` | 3-column grid layout, tighter spacing |
| `src/components/sol-dashboard/MarketOverviewPanel.tsx` | Data-dense table, status bar, remove decorations |
| `src/components/sol-dashboard/VolatilityPanel.tsx` | Compact rows, add lambda/variance displays |
| `src/components/sol-dashboard/SimulationPanel.tsx` | Sharp bars, larger P readout, tighter chart |
| `src/components/sol-dashboard/PositioningPanel.tsx` | Table format, edge in bps, EV per $1 |
| `src/components/sol-dashboard/EdgeHeatmap.tsx` | Sharp bars, remove transitions |
| `src/components/sol-dashboard/PriceChart.tsx` | Clean tooltip, thinner line, remove badge |
| `src/components/sol-dashboard/TradingButtons.tsx` | Sharp buttons |
| `src/components/sol-dashboard/TimeSlotPills.tsx` | Sharp pills |
| `src/components/sol-dashboard/OrderbookLadder.tsx` | Sharp container, remove transitions |
| `src/components/sol-dashboard/orderbook/OrderbookRow.tsx` | Remove transition from depth bar |
| `src/components/sol-dashboard/orderbook/OrderbookHeader.tsx` | Sharp imbalance bar |
| `src/components/sol-dashboard/orderbook/MidPriceDisplay.tsx` | Smaller mid price, sharp direction indicator |
| `src/components/sol-dashboard/StrategySummary.tsx` | Sharp container, remove hover transitions |
| `src/lib/quant/monte-carlo.ts` | Increase histogram bin count |
| `src/hooks/useMultiSourcePrice.ts` | Expose sources for status bar (already exposed) |
| `src/hooks/useQuantEngine.ts` | Expose lastComputeMs for status bar (already exposed) |

## Design Principles Applied

- All corners: `rounded-sm` or `rounded-none`
- All numbers: `font-mono tabular-nums text-right`
- No gradients, no shadows, no glows
- Gold usage restricted to: edge highlight, strike reference, primary signal only
- Signal indication: left border accent, not background glow
- Maximum font size for data: `text-base` (16px)
- Section titles: `text-xs font-semibold uppercase tracking-wider`
- Status micro-text: `text-[10px] font-mono`
- Zero animation transitions on data panels
- Functional flash animations retained for orderbook only

