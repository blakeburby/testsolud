

# Quantitative Trading Dashboard - Full Build Plan

## Overview

Transform the existing SOL/Kalshi trading dashboard into a full quantitative trading platform with Monte Carlo simulation, EWMA volatility, edge detection, Kelly sizing, and institutional-grade visuals. All computation runs client-side per the stateless architecture.

## What Already Exists

- Live SOL/USD price via multi-source WebSocket (Kraken, Coinbase, Binance)
- Kalshi market data + orderbook via authenticated edge functions
- Price chart (Recharts), countdown timer, time slot pills, trading buttons, orderbook ladder
- Basic dark theme with trading-up/trading-down colors

## What Will Be Built

### Phase 1: Quantitative Engine (Core Library)

**File: `src/lib/quant/ewma-volatility.ts`**
- Compute 1-minute log returns from price history
- EWMA variance with lambda=0.94
- Annualize: multiply by sqrt(525,600) for crypto 24/7
- Vol regime classifier (Low/Medium/High based on percentile thresholds)

**File: `src/lib/quant/momentum-drift.ts`**
- Detect if |r_last| > 0.15% threshold
- Apply beta=0.5 scaling for momentum-adjusted drift
- Return mu_adj for simulation input

**File: `src/lib/quant/microstructure-floor.ts`**
- Microstructure noise floor eta (default 0.0005-0.001)
- Compute Var_total = sigma_annual^2 * T + eta^2
- Return sigma_total = sqrt(Var_total)

**File: `src/lib/quant/monte-carlo.ts`**
- 100,000-path GBM simulation
- Time conversion: T = minutes_remaining / (60 * 24 * 365)
- For each path: S_T = S0 * exp((mu_adj - 0.5*sigma_total^2)*T + sigma_total*sqrt(T)*Z)
- Box-Muller transform for normal random variates
- Return P_up, P_down, terminal price distribution histogram
- Closed-form fallback: d2 = [ln(S0/K) + (mu_adj - 0.5*sigma_total^2)*T] / (sigma_total*sqrt(T)), P_up = N(d2)
- Toggle between Monte Carlo and closed-form

**File: `src/lib/quant/kelly-sizing.ts`**
- Edge computation: Edge_up = P_up - P_market
- Trade filter: Edge > fee_buffer AND Edge > uncertainty_buffer
- Kelly fraction: f* = (b*p - q) / b where b=payout ratio on Kalshi (typically ~1)
- Cap at 0.25 Kelly for safety
- Return full Kelly, quarter Kelly, dollar allocation

### Phase 2: React Hook

**File: `src/hooks/useQuantEngine.ts`**
- Consumes price history from SOLMarketsContext
- Maintains rolling 1-min return buffer for EWMA
- Recomputes every 1 second via setInterval
- Runs Monte Carlo async (Web Worker if >100ms, else inline)
- Exposes: ewmaVol, sigmaTotal, muAdj, pTrue, pMarket, edge, kellyFraction, terminalDistribution, volRegime, simMode (MC vs closed-form)
- Falls back to closed-form if MC exceeds 100ms

### Phase 3: Theme Overhaul

**File: `src/index.css` (modify dark theme)**
- Background: Navy (#0a0e1a / HSL ~230 60% 5%)
- Card: Slightly lighter navy (#101829)
- Accent/Gold: #C0A062 (HSL ~40 40% 57%)
- Text: Off-white (#e8e6e3)
- Keep existing trading-up (green) and trading-down (red)
- Add new CSS variables: --gold, --navy-light, --quant-positive, --quant-negative

**File: `tailwind.config.ts` (extend)**
- Add gold, navy color tokens

### Phase 4: New Dashboard Panels

**File: `src/components/sol-dashboard/MarketOverviewPanel.tsx`**
- Current SOL price, strike, countdown, Kalshi probability, true probability, edge %
- Color-coded edge badge (green positive, red negative)
- Replaces/consolidates PriceHeader + PriceSection

**File: `src/components/sol-dashboard/VolatilityPanel.tsx`**
- Current EWMA volatility (annualized %)
- Microstructure floor value
- Effective sigma_total
- Vol regime indicator pill (Low/Medium/High with color coding)

**File: `src/components/sol-dashboard/SimulationPanel.tsx`**
- Terminal price histogram (bar chart via Recharts)
- Strike overlay as ReferenceLine
- Probability density curve (AreaChart)
- Toggle button: Monte Carlo vs Closed-Form
- Path count display (100K)

**File: `src/components/sol-dashboard/PositioningPanel.tsx`**
- Kelly fraction display (full and quarter)
- Recommended dollar allocation (user can set bankroll)
- Risk flag (red if edge < threshold or vol regime is High)
- Confidence level indicator

**File: `src/components/sol-dashboard/EdgeHeatmap.tsx`**
- Grid visualization: probability vs time remaining
- Shows how edge evolves as T shrinks
- Color gradient from red (negative edge) through neutral to green (positive edge)

**File: `src/components/sol-dashboard/StrategySummary.tsx`**
- Expandable collapsible section using Radix Collapsible
- 7 subsections: Core Framework, Time Decay Physics, Volatility Clustering, Momentum Drift, Microstructure Floor, Kelly Optimization, Risk Considerations
- Rendered as formatted markdown-style content with LaTeX-like notation

### Phase 5: Dashboard Layout

**File: `src/components/sol-dashboard/SOLDashboard.tsx` (modify)**
- Restructure layout into a 2-column grid (desktop) / single column (mobile)
- Left column: MarketOverviewPanel, PriceChart, SimulationPanel
- Right column: VolatilityPanel, PositioningPanel, EdgeHeatmap
- Below: TimeSlotPills, TradingButtons, OrderbookLadder
- Bottom: StrategySummary (full width, collapsible)

**File: `src/contexts/SOLMarketsContext.tsx` (extend)**
- No structural changes needed - the quant engine hook will consume existing state
- Price history and market data already available

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/quant/ewma-volatility.ts` | Create | EWMA vol model |
| `src/lib/quant/momentum-drift.ts` | Create | Drift bias |
| `src/lib/quant/microstructure-floor.ts` | Create | Variance floor |
| `src/lib/quant/monte-carlo.ts` | Create | MC engine + closed-form |
| `src/lib/quant/kelly-sizing.ts` | Create | Edge + Kelly |
| `src/hooks/useQuantEngine.ts` | Create | Orchestration hook |
| `src/components/sol-dashboard/MarketOverviewPanel.tsx` | Create | Consolidated market info |
| `src/components/sol-dashboard/VolatilityPanel.tsx` | Create | Vol display |
| `src/components/sol-dashboard/SimulationPanel.tsx` | Create | MC visualization |
| `src/components/sol-dashboard/PositioningPanel.tsx` | Create | Kelly + allocation |
| `src/components/sol-dashboard/EdgeHeatmap.tsx` | Create | Edge vs time grid |
| `src/components/sol-dashboard/StrategySummary.tsx` | Create | Documentation section |
| `src/components/sol-dashboard/SOLDashboard.tsx` | Modify | New layout |
| `src/index.css` | Modify | Navy + gold theme |
| `tailwind.config.ts` | Modify | New color tokens |

## Technical Considerations

- Monte Carlo with 100K paths using typed arrays (Float64Array) for performance - target under 100ms
- Box-Muller transform for Gaussian random numbers (no external dependency)
- If MC exceeds 100ms on slower devices, auto-fallback to closed-form Black-Scholes
- All computation is client-side - no new backend functions needed
- EWMA needs a warm-up period (~30 data points); display "Calibrating..." until ready
- Edge heatmap precomputes a grid of (time, probability) pairs using closed-form for speed
- Recharts BarChart for histogram, AreaChart for density curve

