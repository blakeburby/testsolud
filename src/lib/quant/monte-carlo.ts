/**
 * Monte Carlo Simulation Engine
 * 100,000-path GBM with Box-Muller transform.
 * Includes closed-form Digital Black-Scholes fallback.
 */

const DEFAULT_NUM_PATHS = 100_000;
const HISTOGRAM_BINS = 50;

export interface MonteCarloResult {
  pUp: number;
  pDown: number;
  terminalPrices: Float64Array;
  histogram: { binCenter: number; count: number; density: number }[];
  mean: number;
  stdDev: number;
  numPaths: number;
  executionMs: number;
  mode: 'monte-carlo' | 'closed-form';
}

export interface ClosedFormResult {
  pUp: number;
  pDown: number;
  d2: number;
  mode: 'closed-form';
}

/**
 * Box-Muller transform for generating standard normal variates.
 */
function boxMuller(): number {
  let u1: number, u2: number;
  do { u1 = Math.random(); } while (u1 === 0);
  u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  
  return 0.5 * (1.0 + sign * y);
}

/**
 * Run Monte Carlo simulation.
 * S_T = S₀ × exp((μ_adj − 0.5σ²)T + σ√T × Z)
 */
export function runMonteCarlo(
  S0: number,
  K: number,
  T: number,
  sigmaTotal: number,
  muAdj: number = 0,
  numPaths: number = DEFAULT_NUM_PATHS
): MonteCarloResult {
  const start = performance.now();
  
  const terminalPrices = new Float64Array(numPaths);
  const drift = (muAdj - 0.5 * sigmaTotal * sigmaTotal) * T;
  const diffusion = sigmaTotal * Math.sqrt(T);
  
  let countAbove = 0;
  let sum = 0;
  let sumSq = 0;
  
  for (let i = 0; i < numPaths; i++) {
    const Z = boxMuller();
    const ST = S0 * Math.exp(drift + diffusion * Z);
    terminalPrices[i] = ST;
    sum += ST;
    sumSq += ST * ST;
    if (ST > K) countAbove++;
  }
  
  const pUp = countAbove / numPaths;
  const pDown = 1 - pUp;
  const mean = sum / numPaths;
  const variance = sumSq / numPaths - mean * mean;
  const stdDev = Math.sqrt(Math.max(0, variance));
  
  // Build histogram
  const histogram = buildHistogram(terminalPrices, K);
  
  const executionMs = performance.now() - start;
  
  return {
    pUp,
    pDown,
    terminalPrices,
    histogram,
    mean,
    stdDev,
    numPaths,
    executionMs,
    mode: 'monte-carlo',
  };
}

/**
 * Digital Black-Scholes closed-form approximation.
 * d2 = [ln(S₀/K) + (μ_adj − 0.5σ²)T] / (σ√T)
 * P_up ≈ N(d2)
 */
export function closedFormProbability(
  S0: number,
  K: number,
  T: number,
  sigmaTotal: number,
  muAdj: number = 0
): ClosedFormResult {
  if (T <= 0 || sigmaTotal <= 0) {
    const pUp = S0 > K ? 1 : 0;
    return { pUp, pDown: 1 - pUp, d2: S0 > K ? Infinity : -Infinity, mode: 'closed-form' };
  }
  
  const d2 = (Math.log(S0 / K) + (muAdj - 0.5 * sigmaTotal * sigmaTotal) * T) / (sigmaTotal * Math.sqrt(T));
  const pUp = normalCDF(d2);
  
  return { pUp, pDown: 1 - pUp, d2, mode: 'closed-form' };
}

/**
 * Build histogram from terminal prices.
 */
function buildHistogram(
  prices: Float64Array,
  strikePrice: number
): { binCenter: number; count: number; density: number }[] {
  if (prices.length === 0) return [];
  
  let min = prices[0], max = prices[0];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] < min) min = prices[i];
    if (prices[i] > max) max = prices[i];
  }
  
  // Expand range slightly
  const range = max - min || 1;
  min -= range * 0.05;
  max += range * 0.05;
  
  const binWidth = (max - min) / HISTOGRAM_BINS;
  const counts = new Int32Array(HISTOGRAM_BINS);
  
  for (let i = 0; i < prices.length; i++) {
    const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor((prices[i] - min) / binWidth));
    counts[bin]++;
  }
  
  return Array.from(counts).map((count, i) => ({
    binCenter: min + (i + 0.5) * binWidth,
    count,
    density: count / (prices.length * binWidth),
  }));
}
