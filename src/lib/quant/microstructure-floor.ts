/**
 * Microstructure Noise Floor
 * Prevents variance → 0 near expiration.
 * η = 0.0005–0.001
 */

const DEFAULT_ETA = 0.0007; // midpoint of recommended range

export interface MicrostructureResult {
  sigmaTotal: number;
  varianceTotal: number;
  eta: number;
}

/**
 * Compute total variance with microstructure floor.
 * Var_total = σ_annual² × T + η²
 * σ_total = √Var_total
 */
export function applyMicrostructureFloor(
  sigmaAnnual: number,
  T: number,
  eta: number = DEFAULT_ETA
): MicrostructureResult {
  const varianceFromDiffusion = sigmaAnnual * sigmaAnnual * T;
  const varianceTotal = varianceFromDiffusion + eta * eta;
  const sigmaTotal = Math.sqrt(varianceTotal);
  
  return { sigmaTotal, varianceTotal, eta };
}

/**
 * Convert minutes remaining to fractional years (crypto 24/7).
 * T = minutes_remaining / (60 × 24 × 365)
 */
export function minutesToYears(minutesRemaining: number): number {
  return minutesRemaining / (60 * 24 * 365);
}
