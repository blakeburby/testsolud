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

  // Refs for rapidly-changing values (updated every render, no effect re-runs)
  const priceRef = useRef(currentPrice);
  const historyRef = useRef(priceHistory);
  const marketRef = useRef(selectedMarket);
  const slotRef = useRef(selectedSlot);
  const simModeRef = useRef(simMode);
  const bankrollRef = useRef(bankroll);

  priceRef.current = currentPrice;
  historyRef.current = priceHistory;
  marketRef.current = selectedMarket;
  slotRef.current = selectedSlot;
  simModeRef.current = simMode;
  bankrollRef.current = bankroll;

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
      const cp = priceRef.current;
      const ph = historyRef.current;
      const sm = marketRef.current;
      const ss = slotRef.current;
      const mode = simModeRef.current;
      const br = bankrollRef.current;

      if (!cp || !sm || !ss) {
        setState(prev => ({ ...prev, isReady: false }));
        return;
      }

      const S0 = cp;
      const K = sm.strikePrice;

      const now = Date.now();
      const msRemaining = Math.max(0, ss.windowEnd.getTime() - now);
      const minutesRemaining = msRemaining / 60000;
      const T = minutesToYears(minutesRemaining);

      const sortedPrices = [...ph].sort((a, b) => a.time - b.time);
      const ewma = computeEWMA(sortedPrices);
      const logReturns = computeLogReturns(sortedPrices);
      const drift = computeMomentumDrift(logReturns);
      const sigmaAnnual = ewma.isCalibrated ? ewma.annualizedVol : 0.60;
      const microstructure = applyMicrostructureFloor(sigmaAnnual, T);
      const pMarket = sm.yesPrice ?? 0.5;

      let pTrue = 0.5;
      let simulation: MonteCarloResult | null = null;
      let closedForm: ClosedFormResult | null = null;
      let activeMode = mode;

      if (T > 0) {
        if (activeMode === 'monte-carlo') {
          simulation = runMonteCarlo(S0, K, T, microstructure.sigmaTotal, drift.muAdj);
          pTrue = simulation.pUp;
          if (simulation.executionMs > 150) {
            closedForm = closedFormProbability(S0, K, T, microstructure.sigmaTotal, drift.muAdj);
            pTrue = closedForm.pUp;
          }
        }
        if (!closedForm) {
          closedForm = closedFormProbability(S0, K, T, microstructure.sigmaTotal, drift.muAdj);
        }
        if (activeMode === 'closed-form') {
          pTrue = closedForm.pUp;
        }
      } else {
        pTrue = S0 > K ? 1 : 0;
      }

      const kelly = computeKelly(pTrue, pMarket, br);
      const lastComputeMs = performance.now() - start;

      setState({
        ewma, microstructure, drift, pTrue, simulation, closedForm,
        activeMode, pMarket, kelly, T, minutesRemaining, isReady: true, lastComputeMs,
      });
    };

    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, []); // stable — reads from refs

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
