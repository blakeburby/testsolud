/**
 * EWMA Volatility Model
 * Exponentially Weighted Moving Average for crypto 24/7 markets.
 * λ = 0.94 (RiskMetrics standard)
 */

export interface EWMAState {
  variance: number;
  annualizedVol: number;
  volRegime: 'Low' | 'Medium' | 'High';
  sampleCount: number;
  isCalibrated: boolean;
}

const LAMBDA = 0.94;
const MINUTES_PER_YEAR = 60 * 24 * 365; // 525,600
const SQRT_MINUTES_PER_YEAR = Math.sqrt(MINUTES_PER_YEAR);
const MIN_SAMPLES = 10;

// Vol regime thresholds (annualized)
const VOL_LOW_THRESHOLD = 0.40;   // <40% annualized
const VOL_HIGH_THRESHOLD = 0.80;  // >80% annualized

/**
 * Compute 1-minute log returns from price history.
 */
export function computeLogReturns(prices: { time: number; close: number }[]): number[] {
  if (prices.length < 2) return [];
  
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i].close > 0 && prices[i - 1].close > 0) {
      returns.push(Math.log(prices[i].close / prices[i - 1].close));
    }
  }
  return returns;
}

/**
 * Compute EWMA variance from log returns.
 * σ²_t = λσ²_{t-1} + (1 − λ)r_t²
 */
export function computeEWMAVariance(logReturns: number[]): number {
  if (logReturns.length === 0) return 0;
  
  // Initialize with first return squared
  let variance = logReturns[0] * logReturns[0];
  
  for (let i = 1; i < logReturns.length; i++) {
    variance = LAMBDA * variance + (1 - LAMBDA) * logReturns[i] * logReturns[i];
  }
  
  return variance;
}

/**
 * Full EWMA computation pipeline.
 */
export function computeEWMA(prices: { time: number; close: number }[]): EWMAState {
  const logReturns = computeLogReturns(prices);
  
  if (logReturns.length < MIN_SAMPLES) {
    return {
      variance: 0,
      annualizedVol: 0,
      volRegime: 'Low',
      sampleCount: logReturns.length,
      isCalibrated: false,
    };
  }
  
  const variance = computeEWMAVariance(logReturns);
  
  // Annualize: σ_annual = σ_1min × √(525,600)
  const annualizedVol = Math.sqrt(variance) * SQRT_MINUTES_PER_YEAR;
  
  // Classify regime
  let volRegime: 'Low' | 'Medium' | 'High' = 'Medium';
  if (annualizedVol < VOL_LOW_THRESHOLD) volRegime = 'Low';
  else if (annualizedVol > VOL_HIGH_THRESHOLD) volRegime = 'High';
  
  return {
    variance,
    annualizedVol,
    volRegime,
    sampleCount: logReturns.length,
    isCalibrated: true,
  };
}
