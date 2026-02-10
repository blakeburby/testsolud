import type {
  Regime,
  RegimeWeights,
  RegimeDetection,
  OrderbookImbalance,
  BlendWeights,
  EVResult,
  KellyResult,
  TradePlan,
  SignalEngineInputs,
} from '@/types/signal-engine';

// ── Constants ──────────────────────────────────────────────────────────

const NUM_PATHS = 100_000;
const ANNUALIZED_SECONDS = 365.25 * 24 * 3600;
const TRANSACTION_COST = 0.01;
const ERROR_MARGIN = 0.02;
const MIN_EDGE = 0.03;
const MAX_KELLY_FRACTION = 0.5;

// ── Box-Muller Normal RNG ──────────────────────────────────────────────

function boxMullerPair(): [number, number] {
  let u1: number, u2: number;
  do { u1 = Math.random(); } while (u1 === 0);
  u2 = Math.random();
  const mag = Math.sqrt(-2.0 * Math.log(u1));
  return [mag * Math.cos(2.0 * Math.PI * u2), mag * Math.sin(2.0 * Math.PI * u2)];
}

// ── Regime Detection ───────────────────────────────────────────────────

export function detectRegime(priceHistory: Array<{ time: number; close: number }>): RegimeDetection {
  if (priceHistory.length < 5) {
    return { regime: 'R1_LOW_VOL', weights: { r1: 0.8, r2: 0.15, r3: 0.05 }, annualizedVol: 0.3, recentVolRatio: 1 };
  }

  // Compute log returns
  const returns: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const logRet = Math.log(priceHistory[i].close / priceHistory[i - 1].close);
    if (isFinite(logRet)) returns.push(logRet);
  }

  if (returns.length < 3) {
    return { regime: 'R1_LOW_VOL', weights: { r1: 0.8, r2: 0.15, r3: 0.05 }, annualizedVol: 0.3, recentVolRatio: 1 };
  }

  // Realized volatility (std of log returns, annualized)
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Estimate average dt in seconds
  const totalTimeMs = priceHistory[priceHistory.length - 1].time - priceHistory[0].time;
  const avgDtSec = totalTimeMs / 1000 / (priceHistory.length - 1);
  const annualizedVol = stdDev * Math.sqrt(ANNUALIZED_SECONDS / Math.max(avgDtSec, 0.01));

  // Recent vs prior vol ratio (last 2min vs prior 13min)
  const TWO_MIN_MS = 2 * 60 * 1000;
  const cutoff = priceHistory[priceHistory.length - 1].time - TWO_MIN_MS;
  const recentReturns: number[] = [];
  const priorReturns: number[] = [];

  for (let i = 1; i < priceHistory.length; i++) {
    const logRet = Math.log(priceHistory[i].close / priceHistory[i - 1].close);
    if (!isFinite(logRet)) continue;
    if (priceHistory[i].time >= cutoff) {
      recentReturns.push(logRet);
    } else {
      priorReturns.push(logRet);
    }
  }

  let recentVolRatio = 1;
  if (recentReturns.length >= 2 && priorReturns.length >= 2) {
    const recentVar = recentReturns.reduce((s, r) => s + r * r, 0) / recentReturns.length;
    const priorVar = priorReturns.reduce((s, r) => s + r * r, 0) / priorReturns.length;
    recentVolRatio = priorVar > 0 ? Math.sqrt(recentVar / priorVar) : 1;
  }

  // Classify
  let regime: Regime;
  let weights: RegimeWeights;

  if (recentVolRatio > 2) {
    regime = 'R3_EVENT_DRIVEN';
    weights = { r1: 0.1, r2: 0.2, r3: 0.7 };
  } else if (annualizedVol > 0.80) {
    regime = 'R2_HIGH_VOL';
    weights = { r1: 0.1, r2: 0.7, r3: 0.2 };
  } else if (annualizedVol < 0.40) {
    regime = 'R1_LOW_VOL';
    weights = { r1: 0.7, r2: 0.2, r3: 0.1 };
  } else {
    // Medium vol — blend R1/R2
    const r2Weight = (annualizedVol - 0.40) / 0.40; // 0 at 40%, 1 at 80%
    regime = r2Weight > 0.5 ? 'R2_HIGH_VOL' : 'R1_LOW_VOL';
    weights = { r1: 0.5 * (1 - r2Weight), r2: 0.5 * (1 + r2Weight), r3: 0 };
    // Normalize
    const sum = weights.r1 + weights.r2 + weights.r3;
    weights.r1 /= sum;
    weights.r2 /= sum;
    weights.r3 /= sum;
  }

  return { regime, weights, annualizedVol: Math.min(annualizedVol, 5), recentVolRatio };
}

// ── Nonlinear Volatility ───────────────────────────────────────────────

export function computeNonlinearVol(baseVol: number, timeToExpiryMs: number, totalWindowMs: number): number {
  const T = Math.max(timeToExpiryMs / totalWindowMs, 0.001); // fraction of window remaining
  // Beta: lower early (mean-reversion), higher near settlement (compression)
  const beta = T > 0.5 ? 0.4 : 0.3 + 0.4 * (1 - T);
  return baseVol * Math.pow(T, beta);
}

// ── Monte Carlo Simulation ─────────────────────────────────────────────

export function runMonteCarloSim(
  currentPrice: number,
  strike: number,
  timeToExpirySec: number,
  regimeVols: { r1: number; r2: number; r3: number },
  regimeWeights: RegimeWeights,
  totalWindowMs: number,
  numPaths: number = NUM_PATHS,
): number {
  if (timeToExpirySec <= 0) {
    return currentPrice >= strike ? 1 : 0;
  }

  const dt = timeToExpirySec; // single step to expiry
  const mu = 0; // assume zero drift for short-term crypto

  const regimeConfigs = [
    { vol: computeNonlinearVol(regimeVols.r1, timeToExpirySec * 1000, totalWindowMs), weight: regimeWeights.r1 },
    { vol: computeNonlinearVol(regimeVols.r2, timeToExpirySec * 1000, totalWindowMs), weight: regimeWeights.r2 },
    { vol: computeNonlinearVol(regimeVols.r3, timeToExpirySec * 1000, totalWindowMs), weight: regimeWeights.r3 },
  ];

  let totalAbove = 0;

  for (const { vol, weight } of regimeConfigs) {
    if (weight < 0.001) continue;

    const pathsForRegime = Math.round(numPaths * weight);
    let aboveCount = 0;

    // Annualized vol to per-second vol
    const sigma = vol / Math.sqrt(ANNUALIZED_SECONDS);
    const drift = (mu - 0.5 * sigma * sigma) * dt;
    const diffusion = sigma * Math.sqrt(dt);

    for (let i = 0; i < pathsForRegime; i += 2) {
      const [z1, z2] = boxMullerPair();

      const s1 = currentPrice * Math.exp(drift + diffusion * z1);
      if (s1 >= strike) aboveCount++;

      if (i + 1 < pathsForRegime) {
        const s2 = currentPrice * Math.exp(drift + diffusion * z2);
        if (s2 >= strike) aboveCount++;
      }
    }

    totalAbove += aboveCount;
  }

  return totalAbove / numPaths;
}

// ── Orderbook Imbalance ────────────────────────────────────────────────

export function computeOrderbookImbalance(
  bids: Array<{ price: number; size: number }>,
  asks: Array<{ price: number; size: number }>,
): OrderbookImbalance {
  const bidDepth = bids.reduce((s, b) => s + Number(b.size), 0);
  const askDepth = asks.reduce((s, a) => s + Number(a.size), 0);
  const totalDepth = bidDepth + askDepth;

  if (totalDepth === 0) {
    return { imbalance: 0, probabilityAdjustment: 0.5, alpha: 0.05, totalDepth: 0, spread: 1 };
  }

  const imbalance = (bidDepth - askDepth) / totalDepth;

  // Compute spread
  const bestBid = bids.length > 0 ? Math.max(...bids.map(b => b.price)) : 0;
  const bestAsk = asks.length > 0 ? Math.min(...asks.map(a => a.price)) : 1;
  const spread = bestAsk - bestBid;

  // Dynamic alpha: 0.05 (thin/wide) to 0.20 (deep/tight)
  const depthScore = Math.min(totalDepth / 500, 1); // normalize depth
  const spreadScore = Math.max(1 - spread * 10, 0); // tight spread = high score
  const alpha = 0.05 + 0.15 * (depthScore * 0.5 + spreadScore * 0.5);

  const probabilityAdjustment = 0.5 + alpha * imbalance;

  return { imbalance, probabilityAdjustment, alpha, totalDepth, spread };
}

// ── Probability Blending ───────────────────────────────────────────────

export function computeBlendWeights(
  totalDepth: number,
  spread: number,
  disagreement: number,
): BlendWeights {
  const isHighLiquidity = totalDepth > 200 && spread < 0.05;
  const isTightSpread = spread < 0.03;

  let wMarket: number, wSim: number, wOrderbook: number;

  if (isHighLiquidity) {
    wMarket = 0.50; wSim = 0.30; wOrderbook = 0.20;
  } else if (isTightSpread) {
    wMarket = 0.30; wSim = 0.35; wOrderbook = 0.35;
  } else {
    wMarket = 0.25; wSim = 0.55; wOrderbook = 0.20;
  }

  // If disagreement is high, shift weight toward sim
  if (disagreement > 0.10) {
    const shift = Math.min(disagreement * 0.5, 0.15);
    wSim += shift;
    wMarket -= shift;
  }

  // Normalize
  const sum = wMarket + wSim + wOrderbook;
  return { wMarket: wMarket / sum, wSim: wSim / sum, wOrderbook: wOrderbook / sum };
}

export function blendProbabilities(
  pMarket: number,
  pSim: number,
  pOB: number,
  weights: BlendWeights,
): number {
  return Math.max(0, Math.min(1, weights.wMarket * pMarket + weights.wSim * pSim + weights.wOrderbook * pOB));
}

// ── Expected Value Gate ────────────────────────────────────────────────

export function computeEV(probability: number, contractPrice: number): EVResult {
  // Payout is $1 on correct prediction
  const ev = probability * 1.0 - (1 - probability) * contractPrice / (1 - contractPrice + 0.0001);
  // Simpler: EV of buying YES at contractPrice = p * (1 - contractPrice) - (1-p) * contractPrice
  const evSimple = probability * (1 - contractPrice) - (1 - probability) * contractPrice;

  return {
    ev: evSimple,
    passesGate: evSimple > TRANSACTION_COST + ERROR_MARGIN,
    transactionCost: TRANSACTION_COST,
    errorMargin: ERROR_MARGIN,
  };
}

// ── Kelly Criterion ────────────────────────────────────────────────────

export function computeKellySize(probability: number, odds: number, estimationError: number): KellyResult {
  // odds = payout/cost = (1-price)/price for YES contracts
  const b = odds;
  const p = probability;
  const q = 1 - p;
  const rawFraction = (b * p - q) / b;

  // Uncertainty adjustment
  const adjustedFraction = Math.max(0, rawFraction * (1 - estimationError));

  // Cap at half-Kelly
  const capped = Math.min(adjustedFraction, MAX_KELLY_FRACTION);

  return {
    rawFraction,
    adjustedFraction: capped,
    positionSizePct: capped * 100,
  };
}

// ── Master Trade Plan Generator ────────────────────────────────────────

export function generateTradePlan(inputs: SignalEngineInputs): TradePlan {
  const startTime = performance.now();

  const {
    currentPrice,
    strikePrice,
    timeToExpiryMs,
    totalWindowMs,
    priceHistory,
    marketYesBid,
    marketYesAsk,
    marketLastPrice,
    orderbookYesBids,
    orderbookYesAsks,
    direction,
  } = inputs;

  // 1. Regime detection
  const regimeResult = detectRegime(priceHistory);

  // 2. Market probability (mid-market implied)
  const yesMid = (marketYesBid !== null && marketYesAsk !== null)
    ? (marketYesBid + marketYesAsk) / 2
    : marketLastPrice ?? 0.5;
  const pMarket = Math.max(0.01, Math.min(0.99, yesMid));

  // 3. Monte Carlo simulation
  const timeToExpirySec = Math.max(timeToExpiryMs / 1000, 0);
  const baseVol = regimeResult.annualizedVol;
  const regimeVols = {
    r1: Math.max(baseVol * 0.6, 0.15),
    r2: Math.max(baseVol * 1.3, 0.5),
    r3: Math.max(baseVol * 2.0, 0.8),
  };

  const pSimAbove = runMonteCarloSim(
    currentPrice, strikePrice, timeToExpirySec,
    regimeVols, regimeResult.weights, totalWindowMs,
  );
  const pSim = direction === 'up' ? pSimAbove : 1 - pSimAbove;

  // 4. Orderbook imbalance
  const obResult = computeOrderbookImbalance(orderbookYesBids, orderbookYesAsks);
  const pOB = obResult.probabilityAdjustment;

  // 5. Disagreement
  const disagreement = Math.abs(pMarket - pSim);

  // 6. Blend weights & final probability
  const blendWeights = computeBlendWeights(obResult.totalDepth, obResult.spread, disagreement);
  const pFinal = blendProbabilities(pMarket, pSim, pOB, blendWeights);

  // 7. Determine direction: do we think YES is underpriced or NO?
  const edge = pFinal - pMarket;
  const tradeDirection = edge > 0 ? 'LONG_YES' as const : 'LONG_NO' as const;

  // For LONG_NO, compute from the NO perspective
  const effectiveP = tradeDirection === 'LONG_YES' ? pFinal : 1 - pFinal;
  const contractPrice = tradeDirection === 'LONG_YES'
    ? (marketYesAsk ?? pMarket)
    : (1 - (marketYesBid ?? pMarket));

  // 8. EV gate
  const evResult = computeEV(effectiveP, Math.max(0.01, Math.min(0.99, contractPrice)));

  // 9. Disagreement filter
  const highDisagreementHighLiquidity = disagreement > 0.15 && obResult.totalDepth > 300;

  // 10. Decision
  let decision: TradePlan['decision'];
  let noTradeReason: string | undefined;

  if (highDisagreementHighLiquidity) {
    decision = 'NO_TRADE';
    noTradeReason = 'Informed order flow detected — high disagreement with deep liquidity';
  } else if (!evResult.passesGate) {
    if (Math.abs(edge) > 0.01 && Math.abs(edge) < MIN_EDGE) {
      decision = 'WAIT';
      noTradeReason = 'Edge developing but below threshold';
    } else {
      decision = 'NO_TRADE';
      noTradeReason = 'Insufficient expected value';
    }
  } else if (obResult.totalDepth < 20) {
    decision = 'NO_TRADE';
    noTradeReason = 'Liquidity risk — orderbook too thin';
  } else {
    decision = 'TRADE_NOW';
  }

  // 11. Kelly sizing
  const odds = (1 - contractPrice) / Math.max(contractPrice, 0.01);
  const estimationError = Math.min(disagreement + 0.1, 0.5);
  const kelly = computeKellySize(effectiveP, odds, estimationError);

  // 12. Entry, stop, take-profit
  const entryPrice = contractPrice;
  const stopLoss = Math.max(0.01, contractPrice + 0.10); // max loss 10 cents
  const takeProfit = Math.max(0.01, contractPrice - (contractPrice * 0.3)); // target 30% of cost

  // 13. Confidence score
  const confidenceScore = Math.round(
    Math.max(0, Math.min(100,
      (1 - disagreement) * 40 +
      (evResult.ev > 0 ? 20 : 0) +
      Math.min(obResult.totalDepth / 10, 20) +
      (1 - obResult.spread * 5) * 20
    ))
  );

  // 14. Time horizon
  const minutesLeft = Math.max(0, timeToExpiryMs / 60000);
  const timeHorizon = minutesLeft < 2
    ? 'Hold to settlement'
    : `Hold ${Math.round(minutesLeft)}min to settlement or exit at TP`;

  // 15. Invalidation conditions
  const invalidationConditions: string[] = [];
  if (direction === 'up') {
    invalidationConditions.push(`SOL drops below $${(strikePrice - 0.5).toFixed(2)}`);
  } else {
    invalidationConditions.push(`SOL rises above $${(strikePrice + 0.5).toFixed(2)}`);
  }
  invalidationConditions.push(`Spread widens above ${(obResult.spread * 100 + 5).toFixed(0)}¢`);
  if (disagreement > 0.10) {
    invalidationConditions.push('Model-market disagreement persists above 10%');
  }

  // 16. Liquidity notes
  const liquidityNotes = obResult.totalDepth > 200
    ? `Deep book (${Math.round(obResult.totalDepth)} contracts), ${(obResult.spread * 100).toFixed(1)}¢ spread`
    : obResult.totalDepth > 50
      ? `Moderate depth (${Math.round(obResult.totalDepth)} contracts), ${(obResult.spread * 100).toFixed(1)}¢ spread`
      : `Thin book (${Math.round(obResult.totalDepth)} contracts) — use limit orders only`;

  const computeTimeMs = performance.now() - startTime;

  return {
    decision,
    direction: tradeDirection,
    finalProbability: pFinal,
    marketProbability: pMarket,
    edge: Math.abs(edge),
    expectedValue: evResult.ev,
    positionSize: kelly.positionSizePct,
    entryPrice,
    stopLoss,
    takeProfit,
    timeHorizon,
    invalidationConditions,
    liquidityNotes,
    confidenceScore,
    noTradeReason,
    regime: regimeResult.regime,
    disagreement,
    regimeWeights: regimeResult.weights,
    blendWeights,
    computeTimeMs,
    debugData: {
      regimeDetection: regimeResult,
      orderbookImbalance: obResult,
      pSim,
      pMarket,
      pOB,
    },
  };
}

