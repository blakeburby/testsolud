

# Quant-Focused Enhancements for SOL Trading Dashboard

## Current State Assessment

The dashboard already has solid foundations:
- Multi-source WebSocket pricing (Kraken, Coinbase, Binance)
- Interactive orderbook with depth visualization
- Real-time price chart with strike price reference
- Countdown timer and market odds display

---

## Proposed Quant Enhancements

### 1. Real-Time Technical Indicators Panel

Add a dedicated indicators section with metrics that matter for 15-minute prediction markets:

| Indicator | Purpose | Implementation |
|-----------|---------|----------------|
| **VWAP** (Volume-Weighted Avg Price) | Fair value reference | Calculate from trade data stream |
| **Momentum** | Rate of price change | `(current - price_n_seconds_ago) / n` |
| **Volatility** | Risk measure | Rolling standard deviation of returns |
| **Price Velocity** | Speed of movement | First derivative of price over time |
| **RSI (14-period)** | Overbought/oversold | Standard RSI on tick data |

**File:** `src/components/sol-dashboard/TechnicalIndicators.tsx`

### 2. Probability Engine with Historical Edge

Calculate implied probabilities using multiple methods:

```
Market Implied:     From Yes/No contract prices
Historical:         % of times price stayed above/below strike in similar conditions
Momentum-Adjusted:  Adjust historical based on current price velocity
```

Display as a "Smart Probability" gauge comparing market odds vs model prediction.

**Files:**
- `src/lib/probability-engine.ts` - Core calculation logic
- `src/components/sol-dashboard/ProbabilityGauge.tsx` - Visual display

### 3. Orderbook Analytics

Enhance the current orderbook with quant metrics:

| Metric | Description |
|--------|-------------|
| **Order Flow Imbalance** | (Bid Volume - Ask Volume) / Total Volume |
| **Weighted Mid-Price** | Size-weighted average of best bid/ask |
| **Book Pressure** | Cumulative bid depth at +/- 5 levels |
| **Sweep Detector** | Alert when large market orders hit multiple levels |

**File:** `src/components/sol-dashboard/orderbook/OrderbookAnalytics.tsx`

### 4. Price Action Signals

Real-time alerts based on quantitative triggers:

- **Breakout Alert**: Price crosses strike with momentum
- **Mean Reversion Signal**: Extended deviation from VWAP
- **Volume Spike**: Unusual trade size detected
- **Spread Widening**: Liquidity warning

**File:** `src/components/sol-dashboard/SignalAlerts.tsx`

### 5. Enhanced Chart with Multiple Timeframes

Upgrade the price chart:

- Add 1-second, 5-second, 15-second candle options
- Overlay Bollinger Bands (2 standard deviations)
- Show volume bars below price
- Add VWAP line as reference
- Highlight strike price crossing events

**File:** `src/components/sol-dashboard/AdvancedChart.tsx`

### 6. Trade Tape / Time & Sales

Real-time scrolling list of individual trades:

```
TIME        PRICE      SIZE    SIDE     SOURCE
11:45:03    $95.42     150     BUY      Coinbase
11:45:02    $95.41     75      SELL     Binance
11:45:01    $95.43     200     BUY      Kraken
```

Highlight large trades and show trade direction coloring.

**File:** `src/components/sol-dashboard/TradeTape.tsx`

### 7. Position Sizing Calculator

Help traders determine optimal position size:

- Kelly Criterion calculator based on edge estimate
- Max drawdown estimator
- Expected value calculator for Yes/No contracts
- Break-even probability display

**File:** `src/components/sol-dashboard/PositionCalculator.tsx`

### 8. Historical Backtesting Stats

Display statistics from similar past contracts:

- Win rate for "Up" vs "Down" at similar strikes
- Average price movement in final 5 minutes
- Volatility profile by time of day
- Mean time to strike crossing

**File:** `src/components/sol-dashboard/HistoricalStats.tsx`

---

## New Data Infrastructure

### Trade-Level Data Store

Create a rolling buffer to store individual trades for analytics:

```typescript
interface TradeRecord {
  price: number;
  size: number;
  timestamp: number;
  source: 'kraken' | 'coinbase' | 'binance';
  side: 'buy' | 'sell';
}

// Store last 1000 trades for analysis
const tradeBuffer: TradeRecord[] = [];
```

**File:** `src/hooks/useTradeBuffer.ts`

### Analytics Calculation Engine

Centralized hook for computing all indicators:

**File:** `src/hooks/useQuantAnalytics.ts`

---

## UI Layout Changes

### New Dashboard Structure

```
+------------------------------------------+
|              PRICE HEADER                 |
+------------------------------------------+
|  PRICE SECTION  |  TECHNICAL INDICATORS   |
|  (Current/Beat) |  (VWAP, Momentum, Vol)  |
+------------------------------------------+
|           ADVANCED CHART                  |
|  (Candles + Bollinger + VWAP + Volume)   |
+------------------------------------------+
| PROBABILITY GAUGE |  SIGNAL ALERTS        |
| (Market vs Model) |  (Breakout, etc)      |
+------------------------------------------+
|   TIME SLOTS   |   POSITION CALCULATOR    |
+------------------------------------------+
|   TRADING BUTTONS (Yes/No)               |
+------------------------------------------+
|   ORDERBOOK    |     TRADE TAPE          |
| (With Analytics)|   (Time & Sales)        |
+------------------------------------------+
|         HISTORICAL STATS                  |
+------------------------------------------+
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useTradeBuffer.ts` | Store individual trades for analysis |
| `src/hooks/useQuantAnalytics.ts` | Calculate all technical indicators |
| `src/lib/probability-engine.ts` | Probability calculation logic |
| `src/components/sol-dashboard/TechnicalIndicators.tsx` | VWAP, Momentum, Volatility display |
| `src/components/sol-dashboard/ProbabilityGauge.tsx` | Market vs Model probability |
| `src/components/sol-dashboard/orderbook/OrderbookAnalytics.tsx` | Imbalance, pressure metrics |
| `src/components/sol-dashboard/SignalAlerts.tsx` | Real-time trading signals |
| `src/components/sol-dashboard/AdvancedChart.tsx` | Enhanced chart with indicators |
| `src/components/sol-dashboard/TradeTape.tsx` | Time & Sales display |
| `src/components/sol-dashboard/PositionCalculator.tsx` | Kelly criterion, sizing |
| `src/components/sol-dashboard/HistoricalStats.tsx` | Past contract statistics |

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useMultiSourcePrice.ts` | Emit full trade objects (price, size, side) |
| `src/contexts/SOLMarketsContext.tsx` | Add trade buffer and analytics state |
| `src/components/sol-dashboard/SOLDashboard.tsx` | New layout with all components |

---

## Priority Order

1. **Phase 1 - Core Analytics** (Immediate value)
   - Trade buffer hook
   - Technical indicators (VWAP, Momentum, Volatility)
   - Trade tape display

2. **Phase 2 - Probability & Signals**
   - Probability engine
   - Smart probability gauge
   - Signal alerts

3. **Phase 3 - Advanced Visualization**
   - Candlestick chart upgrade
   - Bollinger bands
   - Volume overlay

4. **Phase 4 - Decision Support**
   - Position calculator
   - Historical backtesting stats
   - Orderbook analytics

---

## Technical Notes

### Performance Considerations

- Use `useMemo` for all calculations to prevent re-computation
- Implement ring buffer for trade storage (fixed size, O(1) insert)
- Throttle indicator updates to 100ms for smooth UI
- Use Web Workers for heavy calculations (optional)

### Data Requirements

- Trade buffer: ~1000 trades (~50KB memory)
- Indicators: Recalculate on each trade
- Probability: Update every 500ms
- Historical: Fetch once per contract

