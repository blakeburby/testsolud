/**
 * Kelly Criterion Position Sizing
 * Edge detection and optimal bet sizing for binary Kalshi markets.
 */

const FEE_BUFFER = 0.02;         // 2% minimum edge to overcome fees
const UNCERTAINTY_BUFFER = 0.03; // 3% model uncertainty buffer
const KELLY_CAP = 0.25;         // Quarter Kelly maximum
const DEFAULT_PAYOUT_RATIO = 1; // Binary market: win $1 or lose $1

export interface KellyResult {
  edge: number;
  fullKelly: number;
  quarterKelly: number;
  dollarAllocation: number;
  hasSignal: boolean;
  signalDirection: 'YES' | 'NO' | 'NONE';
  confidence: 'Low' | 'Medium' | 'High';
  riskFlag: boolean;
}

/**
 * Compute edge, Kelly fraction, and trade signal.
 * 
 * Edge_up = P_true - P_market
 * f* = (b*p - q) / b
 */
export function computeKelly(
  pTrue: number,
  pMarket: number,
  bankroll: number = 1000,
  payoutRatio: number = DEFAULT_PAYOUT_RATIO
): KellyResult {
  // Edge on YES side
  const edgeYes = pTrue - pMarket;
  // Edge on NO side
  const edgeNo = (1 - pTrue) - (1 - pMarket); // = pMarket - pTrue = -edgeYes
  
  // Determine which side has positive edge
  let edge: number;
  let signalDirection: 'YES' | 'NO' | 'NONE';
  let p: number;
  
  if (edgeYes > 0) {
    edge = edgeYes;
    signalDirection = 'YES';
    p = pTrue;
  } else if (edgeNo > 0) {
    edge = edgeNo;
    signalDirection = 'NO';
    p = 1 - pTrue;
  } else {
    edge = 0;
    signalDirection = 'NONE';
    p = 0.5;
  }
  
  // Trade filter
  const hasSignal = edge > FEE_BUFFER && edge > UNCERTAINTY_BUFFER;
  
  // Kelly fraction: f* = (b*p - q) / b
  const q = 1 - p;
  let fullKelly = (payoutRatio * p - q) / payoutRatio;
  fullKelly = Math.max(0, fullKelly);
  
  // Cap at quarter Kelly
  const quarterKelly = Math.min(fullKelly * 0.25, KELLY_CAP);
  
  // Dollar allocation
  const dollarAllocation = quarterKelly * bankroll;
  
  // Confidence based on edge magnitude
  let confidence: 'Low' | 'Medium' | 'High' = 'Low';
  if (edge > 0.10) confidence = 'High';
  else if (edge > 0.05) confidence = 'Medium';
  
  // Risk flag if edge is marginal or vol is uncertain
  const riskFlag = edge < 0.05 || !hasSignal;
  
  return {
    edge: edgeYes, // Always report YES-side edge for consistency
    fullKelly,
    quarterKelly,
    dollarAllocation,
    hasSignal,
    signalDirection: hasSignal ? signalDirection : 'NONE',
    confidence,
    riskFlag,
  };
}
