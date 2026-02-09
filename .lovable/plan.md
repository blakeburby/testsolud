

# Quantitative Trading Signal Engine for Kalshi SOL 15-Min Markets

## Overview

Build a client-side quantitative signal engine that computes true outcome probabilities using Monte Carlo simulation, orderbook microstructure analysis, and regime detection -- then displays an execution-ready trade plan (or "NO TRADE") on the dashboard.

All computation runs in the browser using the existing data streams (WebSocket prices, Kalshi market prices, orderbook data). No new backend infrastructure is needed.

## Architecture

The engine consists of three layers:

1. **Signal Engine** (pure TypeScript library) -- computes probabilities
2. **React Hook** (`useSignalEngine`) -- connects engine to live data streams
3. **Trade Plan UI** -- renders the decision output on the dashboard

```text
+---------------------------+
|  WebSocket Price Feed     |---+
|  (Kraken/Coinbase/Binance)|   |
+---------------------------+   |
                                v
+---------------------------+  +-----------------------+
|  Kalshi Market Prices     |->| useSignalEngine Hook  |
|  (yes/no bid/ask)         |  |                       |
+---------------------------+  |  - Regime Detection   |
                               |  - Monte Carlo Sim    |
+---------------------------+  |  - OB Imbalance       |
|  Orderbook Data           |->|  - Probability Blend  |
|  (bids/asks/depth)        |  |  - EV Gate            |
+---------------------------+  |  - Kelly Sizing       |
                               +-----------+-----------+
                                           |
                                           v
                               +-----------------------+
                               |  TradePlan Component  |
                               |  TRADE / NO TRADE     |
                               +-----------------------+
```

## Implementation Plan

### Step 1: Signal Engine Library

**New file: `src/lib/signal-engine.ts`**

Pure functions with zero React dependencies:

- **`detectRegime(priceHistory)`** -- Classifies R1/R2/R3 using rolling volatility and return distribution. Uses log returns over the 15-min window, comparing realized vol against thresholds.

- **`runMonteCarloSim(currentPrice, strike, timeToExpiry, volatilities, regimeWeights, numPaths)`** -- Runs 100,000 GBM paths per regime. Uses `S(t+dt) = S(t) * exp[(mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z]` with Box-Muller transform for normal random generation. Aggregates `P_sim_above` across regimes.

- **`computeNonlinearVol(baseVol, timeToExpiry, totalWindow)`** -- Applies convex decay `sigma(T) = sigma0 * T^beta` where beta varies based on time remaining (lower early, higher near settlement).

- **`computeOrderbookImbalance(bids, asks)`** -- Returns `OB_imbalance = (bidDepth - askDepth) / (bidDepth + askDepth)` and maps to `P_OB = 0.5 + alpha * imbalance`. Alpha is set dynamically based on spread tightness and total depth.

- **`blendProbabilities(pMarket, pSim, pOB, liquidity)`** -- Weighted blend with dynamic weights: higher `w_m` when liquidity is high, higher `w_s` when historical mispricing exists, higher `w_o` when spreads are tight.

- **`computeEV(probability, contractPrice)`** -- `EV = p * payout - (1-p) * cost`. Returns EV and whether it passes the gate (EV > transaction_cost + error_margin).

- **`computeKellySize(probability, odds, estimationError)`** -- Uncertainty-adjusted fractional Kelly: `f_adj = f* * (1 - sigma_error)`, capped at 0.5.

- **`generateTradePlan(inputs)`** -- Master function that orchestrates all the above and returns a `TradePlan` or `NoTrade` decision.

### Step 2: Type Definitions

**New file: `src/types/signal-engine.ts`**

```text
Regime: R1_LOW_VOL | R2_HIGH_VOL | R3_EVENT_DRIVEN
RegimeWeights: { r1: number, r2: number, r3: number }

TradePlan:
  - decision: TRADE_NOW | WAIT | NO_TRADE
  - direction: LONG_YES | LONG_NO
  - finalProbability: number (%)
  - marketProbability: number (%)
  - edge: number (%)
  - expectedValue: number
  - positionSize: number (% bankroll)
  - entryPrice: number (limit)
  - stopLoss: number
  - takeProfit: number
  - timeHorizon: string
  - invalidationConditions: string[]
  - liquidityNotes: string
  - confidenceScore: number (0-100)
  - noTradeReason?: string
  - regime: Regime
  - disagreeement: number
```

### Step 3: React Hook

**New file: `src/hooks/useSignalEngine.ts`**

Connects to existing context data:

- Reads `currentPrice`, `priceHistory`, `selectedMarket`, `orderbook` from `useSOLMarkets()`
- Recomputes the trade plan on every price update or orderbook refresh (debounced to ~500ms to avoid excessive CPU usage)
- Returns the current `TradePlan` and a `recalculate()` trigger
- Tracks computation time for performance monitoring

### Step 4: Trade Plan UI Component

**New file: `src/components/sol-dashboard/TradePlan.tsx`**

Two display modes:

**A) TRADE decision:** A compact card showing:
- Decision badge (green "TRADE NOW" or yellow "WAIT")
- Direction (LONG YES / LONG NO)
- Edge percentage with color coding
- Final vs Market probability comparison bar
- Position size recommendation
- Entry / Stop / Take-Profit levels
- Confidence meter (0-100)
- Invalidation conditions as bullet list

**B) NO TRADE decision:** A single muted line:
- "NO TRADE -- MARKET EFFICIENT"
- Reason (insufficient EV / liquidity risk / informed flow detected)

### Step 5: Dashboard Integration

**Modified file: `src/components/sol-dashboard/SOLDashboard.tsx`**

Add `<TradePlan />` component between `<TradingButtons />` and `<OrderbookLadder />`.

## Technical Details

### Monte Carlo Performance

100,000 paths in JavaScript runs in ~50-150ms on modern hardware. The Box-Muller transform generates pairs of normal random variables efficiently without external dependencies. The simulation runs in a single synchronous pass (no Web Workers needed for this scale).

### Volatility Estimation

Rolling log returns are computed from the `priceHistory` array (WebSocket ticks). For regime detection:
- R1 (Low Vol): annualized vol < 40%
- R2 (High Vol): annualized vol > 80%
- R3 (Event-Driven): detected when vol spikes >2x in the last 2 minutes vs prior 13 minutes

### Orderbook Imbalance Alpha

The `alpha` coefficient scales from 0.05 (wide spread, thin book) to 0.20 (tight spread, deep book). This prevents the orderbook signal from dominating when liquidity is poor.

### Default Probability Weights

| Condition | w_market | w_sim | w_orderbook |
|-----------|----------|-------|-------------|
| High liquidity | 0.50 | 0.30 | 0.20 |
| Low liquidity | 0.25 | 0.55 | 0.20 |
| Tight spread | 0.30 | 0.35 | 0.35 |

### EV Gate Parameters

- Transaction cost: 0.01 (1 cent per contract)
- Error margin: 0.02 (2% estimation uncertainty)
- Minimum edge to trade: 3%

### Files to Create

| File | Purpose |
|------|---------|
| `src/types/signal-engine.ts` | Type definitions for the engine |
| `src/lib/signal-engine.ts` | Pure computation functions |
| `src/hooks/useSignalEngine.ts` | React hook connecting data to engine |
| `src/components/sol-dashboard/TradePlan.tsx` | Trade plan UI component |

### Files to Modify

| File | Change |
|------|--------|
| `src/components/sol-dashboard/SOLDashboard.tsx` | Add TradePlan component |

