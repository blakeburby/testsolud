/**
 * useQuantEngine — Real-time quantitative trading engine hook.
 * Recomputes every 1 second. Falls back to closed-form if MC > 100ms.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { computeEWMA, computeLogReturns, type EWMAState } from '@/lib/quant/ewma-volatility';
import { computeMomentumDrift, type DriftResult } from '@/lib/quant/momentum-drift';
import { applyMicrostructureFloor, minutesToYears, type MicrostructureResult } from '@/lib/quant/microstructure-floor';
import { runMonteCarlo, closedFormProbability, type MonteCarloResult, type ClosedFormResult } from '@/lib/quant/monte-carlo';
import { computeKelly, type KellyResult } from '@/lib/quant/kelly-sizing';

export type SimMode = 'monte-carlo' | 'closed-form';

export interface QuantEngineState {
  // Volatility
  ewma: EWMAState;
  microstructure: MicrostructureResult;
  
  // Drift
  drift: DriftResult;
  
  // Simulation
  pTrue: number;
  simulation: MonteCarloResult | null;
  closedForm: ClosedFormResult | null;
  simMode: SimMode;
  
  // Edge & Kelly
  pMarket: number;
  kelly: KellyResult;
  
  // Meta
  T: number; // Time in years
  minutesRemaining: number;
  isReady: boolean;
  lastComputeMs: number;
}

const INITIAL_STATE: QuantEngineState = {
  ewma: { variance: 0, annualizedVol: 0, volRegime: 'Low', sampleCount: 0, isCalibrated: false },
  microstructure: { sigmaTotal: 0, varianceTotal: 0, eta: 0.0007 },
  drift: { muAdj: 0, hasMomentum: false, lastReturn: 0 },
  pTrue: 0.5,
  simulation: null,
  closedForm: null,
  simMode: 'monte-carlo',
  pMarket: 0.5,
  kelly: { edge: 0, fullKelly: 0, quarterKelly: 0, dollarAllocation: 0, hasSignal: false, signalDirection: 'NONE', confidence: 'Low', riskFlag: true },
  T: 0,
  minutesRemaining: 15,
  isReady: false,
  lastComputeMs: 0,
};

export function useQuantEngine(bankroll: number = 1000): QuantEngineState {
  const { currentPrice, priceHistory, selectedMarket, selectedSlot } = useSOLMarkets();
  const [state, setState] = useState<QuantEngineState>(INITIAL_STATE);
  const [simMode, setSimMode] = useState<SimMode>('monte-carlo');
  const autoFallbackRef = useRef(false);

  // Expose toggle for SimulationPanel
  const toggleSimMode = useCallback(() => {
    setSimMode(prev => prev === 'monte-carlo' ? 'closed-form' : 'monte-carlo');
    autoFallbackRef.current = false;
  }, []);

  // Store toggleSimMode on state for external access
  useEffect(() => {
    (window as any).__quantToggleSimMode = toggleSimMode;
    return () => { delete (window as any).__quantToggleSimMode; };
  }, [toggleSimMode]);

  useEffect(() => {
    const compute = () => {
      const start = performance.now();
      
      if (!currentPrice || !selectedMarket || !selectedSlot) {
        setState(prev => ({ ...prev, isReady: false }));
        return;
      }

      const S0 = currentPrice;
      const K = selectedMarket.strikePrice;
      
      // Time remaining
      const now = Date.now();
      const msRemaining = Math.max(0, selectedSlot.windowEnd.getTime() - now);
      const minutesRemaining = msRemaining / 60000;
      const T = minutesToYears(minutesRemaining);
      
      // EWMA volatility
      const sortedPrices = [...priceHistory].sort((a, b) => a.time - b.time);
      const ewma = computeEWMA(sortedPrices);
      
      // Log returns for drift
      const logReturns = computeLogReturns(sortedPrices);
      const drift = computeMomentumDrift(logReturns);
      
      // Microstructure floor
      const sigmaAnnual = ewma.isCalibrated ? ewma.annualizedVol : 0.60; // fallback 60%
      const microstructure = applyMicrostructureFloor(sigmaAnnual, T);
      
      // Market probability from Kalshi
      const pMarket = selectedMarket.yesPrice ?? 0.5;
      
      // Simulation
      let pTrue = 0.5;
      let simulation: MonteCarloResult | null = null;
      let closedForm: ClosedFormResult | null = null;
      let activeMode = simMode;
      
      if (T > 0) {
        if (activeMode === 'monte-carlo' && !autoFallbackRef.current) {
          simulation = runMonteCarlo(S0, K, T, microstructure.sigmaTotal, drift.muAdj);
          pTrue = simulation.pUp;
          
          // Auto-fallback if too slow
          if (simulation.executionMs > 100) {
            autoFallbackRef.current = true;
            activeMode = 'closed-form';
          }
        }
        
        // Always compute closed-form for comparison / fallback
        closedForm = closedFormProbability(S0, K, T, microstructure.sigmaTotal, drift.muAdj);
        
        if (activeMode === 'closed-form') {
          pTrue = closedForm.pUp;
        }
      } else {
        // Expired
        pTrue = S0 > K ? 1 : 0;
      }
      
      // Kelly sizing
      const kelly = computeKelly(pTrue, pMarket, bankroll);
      
      const lastComputeMs = performance.now() - start;
      
      setState({
        ewma,
        microstructure,
        drift,
        pTrue,
        simulation,
        closedForm,
        simMode: activeMode,
        pMarket,
        kelly,
        T,
        minutesRemaining,
        isReady: true,
        lastComputeMs,
      });
    };

    compute(); // Initial
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [currentPrice, priceHistory, selectedMarket, selectedSlot, simMode, bankroll]);

  return state;
}
