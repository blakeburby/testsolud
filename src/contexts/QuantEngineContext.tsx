/**
 * QuantEngineContext — Shared singleton for the quantitative trading engine.
 * Ensures only ONE Monte Carlo simulation runs per tick across all panels.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { computeEWMA, computeLogReturns, type EWMAState } from '@/lib/quant/ewma-volatility';
import { computeMomentumDrift, type DriftResult } from '@/lib/quant/momentum-drift';
import { applyMicrostructureFloor, minutesToYears, type MicrostructureResult } from '@/lib/quant/microstructure-floor';
import { runMonteCarlo, closedFormProbability, type MonteCarloResult, type ClosedFormResult } from '@/lib/quant/monte-carlo';
import { computeKelly, type KellyResult } from '@/lib/quant/kelly-sizing';

export type SimMode = 'monte-carlo' | 'closed-form';

export interface QuantEngineState {
  ewma: EWMAState;
  microstructure: MicrostructureResult;
  drift: DriftResult;
  pTrue: number;
  simulation: MonteCarloResult | null;
  closedForm: ClosedFormResult | null;
  simMode: SimMode;
  pMarket: number;
  kelly: KellyResult;
  T: number;
  minutesRemaining: number;
  isReady: boolean;
  lastComputeMs: number;
  toggleSimMode: () => void;
  setBankroll: (b: number) => void;
  bankroll: number;
}

const INITIAL_KELLY: KellyResult = {
  edge: 0, fullKelly: 0, quarterKelly: 0, dollarAllocation: 0,
  hasSignal: false, signalDirection: 'NONE', confidence: 'Low', riskFlag: true,
};

const INITIAL_EWMA: EWMAState = {
  variance: 0, annualizedVol: 0, volRegime: 'Low', sampleCount: 0, isCalibrated: false,
};

const QuantEngineContext = createContext<QuantEngineState | null>(null);

export function QuantEngineProvider({ children }: { children: React.ReactNode }) {
  const { currentPrice, priceHistory, selectedMarket, selectedSlot } = useSOLMarkets();
  const [simMode, setSimMode] = useState<SimMode>('monte-carlo');
  const [bankroll, setBankroll] = useState(1000);

  // Computed state
  const [state, setState] = useState({
    ewma: INITIAL_EWMA,
    microstructure: { sigmaTotal: 0, varianceTotal: 0, eta: 0.0007 } as MicrostructureResult,
    drift: { muAdj: 0, hasMomentum: false, lastReturn: 0 } as DriftResult,
    pTrue: 0.5,
    simulation: null as MonteCarloResult | null,
    closedForm: null as ClosedFormResult | null,
    activeMode: 'monte-carlo' as SimMode,
    pMarket: 0.5,
    kelly: INITIAL_KELLY,
    T: 0,
    minutesRemaining: 15,
    isReady: false,
    lastComputeMs: 0,
  });

  const toggleSimMode = useCallback(() => {
    setSimMode(prev => prev === 'monte-carlo' ? 'closed-form' : 'monte-carlo');
  }, []);

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
      const sigmaAnnual = ewma.isCalibrated ? ewma.annualizedVol : 0.60;
      const microstructure = applyMicrostructureFloor(sigmaAnnual, T);

      // Market probability from Kalshi
      const pMarket = selectedMarket.yesPrice ?? 0.5;

      // Simulation
      let pTrue = 0.5;
      let simulation: MonteCarloResult | null = null;
      let closedForm: ClosedFormResult | null = null;
      let activeMode = simMode;

      if (T > 0) {
        if (activeMode === 'monte-carlo') {
          simulation = runMonteCarlo(S0, K, T, microstructure.sigmaTotal, drift.muAdj);
          pTrue = simulation.pUp;

          // If MC is too slow this cycle, also compute CF as supplement but don't permanently disable MC
          if (simulation.executionMs > 150) {
            // Use CF for this cycle's pTrue but keep MC data for histogram
            closedForm = closedFormProbability(S0, K, T, microstructure.sigmaTotal, drift.muAdj);
            pTrue = closedForm.pUp;
          }
        }

        // Always compute closed-form for comparison
        if (!closedForm) {
          closedForm = closedFormProbability(S0, K, T, microstructure.sigmaTotal, drift.muAdj);
        }

        if (activeMode === 'closed-form') {
          pTrue = closedForm.pUp;
        }
      } else {
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
        activeMode,
        pMarket,
        kelly,
        T,
        minutesRemaining,
        isReady: true,
        lastComputeMs,
      });
    };

    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [currentPrice, priceHistory, selectedMarket, selectedSlot, simMode, bankroll]);

  const value: QuantEngineState = {
    ...state,
    simMode: state.activeMode,
    toggleSimMode,
    setBankroll,
    bankroll,
  };

  return (
    <QuantEngineContext.Provider value={value}>
      {children}
    </QuantEngineContext.Provider>
  );
}

export function useSharedQuantEngine(): QuantEngineState {
  const ctx = useContext(QuantEngineContext);
  if (!ctx) throw new Error('useSharedQuantEngine must be used within QuantEngineProvider');
  return ctx;
}
