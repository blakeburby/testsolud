export type Regime = 'R1_LOW_VOL' | 'R2_HIGH_VOL' | 'R3_EVENT_DRIVEN';

export interface RegimeWeights {
  r1: number;
  r2: number;
  r3: number;
}

export interface RegimeDetection {
  regime: Regime;
  weights: RegimeWeights;
  annualizedVol: number;
  recentVolRatio: number; // ratio of last 2min vol to prior 13min vol
}

export interface OrderbookImbalance {
  imbalance: number; // -1 to 1
  probabilityAdjustment: number; // P_OB
  alpha: number;
  totalDepth: number;
  spread: number;
}

export interface BlendWeights {
  wMarket: number;
  wSim: number;
  wOrderbook: number;
}

export interface EVResult {
  ev: number;
  passesGate: boolean;
  transactionCost: number;
  errorMargin: number;
}

export interface KellyResult {
  rawFraction: number;
  adjustedFraction: number;
  positionSizePct: number; // as percentage of bankroll
}

export type Decision = 'TRADE_NOW' | 'WAIT' | 'NO_TRADE';
export type Direction = 'LONG_YES' | 'LONG_NO';

export interface TradePlan {
  decision: Decision;
  direction: Direction;
  finalProbability: number;
  marketProbability: number;
  edge: number;
  expectedValue: number;
  positionSize: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  timeHorizon: string;
  invalidationConditions: string[];
  liquidityNotes: string;
  confidenceScore: number;
  noTradeReason?: string;
  regime: Regime;
  disagreement: number;
  regimeWeights: RegimeWeights;
  blendWeights: BlendWeights;
  computeTimeMs: number;
}

export type AccumulatorStatus = 'SCANNING' | 'COMMITTED';

export interface LockedTradePlan {
  plan: TradePlan;
  status: AccumulatorStatus;
  lockedAt: Date | null;
  windowId: string;
  bestEvSoFar: number;
}

export interface SignalEngineInputs {
  currentPrice: number;
  strikePrice: number;
  timeToExpiryMs: number;
  totalWindowMs: number;
  priceHistory: Array<{ time: number; close: number }>;
  marketYesBid: number | null;
  marketYesAsk: number | null;
  marketNoBid: number | null;
  marketNoAsk: number | null;
  marketLastPrice: number | null;
  orderbookYesBids: Array<{ price: number; size: number }>;
  orderbookYesAsks: Array<{ price: number; size: number }>;
  orderbookNoBids: Array<{ price: number; size: number }>;
  orderbookNoAsks: Array<{ price: number; size: number }>;
  direction: 'up' | 'down';
}
