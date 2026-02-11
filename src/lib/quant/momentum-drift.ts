/**
 * Momentum-Adjusted Drift
 * Short-term continuation bias for GBM simulation.
 * threshold = 0.15%, β = 0.5
 */

const MOMENTUM_THRESHOLD = 0.0015; // 0.15%
const BETA = 0.5;

export interface DriftResult {
  muAdj: number;
  hasMomentum: boolean;
  lastReturn: number;
}

/**
 * Compute momentum-adjusted drift from recent log returns.
 */
export function computeMomentumDrift(logReturns: number[]): DriftResult {
  if (logReturns.length === 0) {
    return { muAdj: 0, hasMomentum: false, lastReturn: 0 };
  }
  
  const lastReturn = logReturns[logReturns.length - 1];
  
  if (Math.abs(lastReturn) > MOMENTUM_THRESHOLD) {
    return {
      muAdj: BETA * lastReturn,
      hasMomentum: true,
      lastReturn,
    };
  }
  
  return { muAdj: 0, hasMomentum: false, lastReturn };
}
