import { useState, useEffect, useRef, useCallback } from 'react';
import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { generateTradePlan } from '@/lib/signal-engine';
import type { TradePlan, SignalEngineInputs, LockedTradePlan, AccumulatorStatus, DebugSnapshot } from '@/types/signal-engine';

const DEBOUNCE_MS = 500;
const FORCED_COMMIT_MS = 3 * 60 * 1000; // 3 minutes before expiry
const MIN_DATA_COLLECTION_MS = 2 * 60 * 1000; // 2 minutes of data before committing
const STABILITY_THRESHOLD = 3; // consecutive ticks with same direction+decision

function getWindowId(slot: { windowStart: Date } | null): string {
  return slot ? String(slot.windowStart.getTime()) : '';
}

export function useSignalEngine() {
  const {
    currentPrice,
    priceHistory,
    selectedMarket,
    selectedSlot,
    selectedDirection,
    orderbook,
  } = useSOLMarkets();

  const [locked, setLocked] = useState<LockedTradePlan | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [stabilityCount, setStabilityCount] = useState(0);

  const bestPlanRef = useRef<TradePlan | null>(null);
  const windowIdRef = useRef<string>('');
  const committedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const stabilityCountRef = useRef(0);
  const lastDirectionRef = useRef<string>('');
  const lastDecisionRef = useRef<string>('');
  const dataCollectionStartRef = useRef<number | null>(null);
  const historyRef = useRef<DebugSnapshot[]>([]);
  const [debugHistory, setDebugHistory] = useState<DebugSnapshot[]>([]);

  // Reset when window changes
  const currentWindowId = getWindowId(selectedSlot);
  if (currentWindowId !== windowIdRef.current) {
    windowIdRef.current = currentWindowId;
    bestPlanRef.current = null;
    committedRef.current = false;
    stabilityCountRef.current = 0;
    lastDirectionRef.current = '';
    lastDecisionRef.current = '';
    dataCollectionStartRef.current = null;
    historyRef.current = [];
    setLocked(null);
    setStabilityCount(0);
    setDebugHistory([]);
  }

  const buildInputs = useCallback((): SignalEngineInputs | null => {
    if (!currentPrice || !selectedMarket || !selectedSlot) return null;

    const timeToExpiryMs = Math.max(0, selectedSlot.windowEnd.getTime() - Date.now());
    const totalWindowMs = selectedSlot.windowEnd.getTime() - selectedSlot.windowStart.getTime();

    return {
      currentPrice,
      strikePrice: selectedMarket.strikePrice,
      timeToExpiryMs,
      totalWindowMs,
      priceHistory: priceHistory.map(p => ({ time: p.time, close: p.close })),
      marketYesBid: selectedMarket.yesBid,
      marketYesAsk: selectedMarket.yesAsk,
      marketNoBid: selectedMarket.noBid,
      marketNoAsk: selectedMarket.noAsk,
      marketLastPrice: selectedMarket.yesPrice,
      orderbookYesBids: orderbook?.yesBids ?? [],
      orderbookYesAsks: orderbook?.yesAsks ?? [],
      orderbookNoBids: orderbook?.noBids ?? [],
      orderbookNoAsks: orderbook?.noAsks ?? [],
      direction: selectedDirection,
    };
  }, [currentPrice, priceHistory, selectedMarket, selectedSlot, selectedDirection, orderbook]);

  const commit = useCallback((plan: TradePlan) => {
    committedRef.current = true;
    bestPlanRef.current = plan;
    setLocked({
      plan,
      status: 'COMMITTED',
      lockedAt: new Date(),
      windowId: windowIdRef.current,
      bestEvSoFar: plan.expectedValue,
    });
  }, []);

  const commitNoTrade = useCallback(() => {
    // Create a NO_TRADE plan from the last computed plan or a minimal stub
    const stub: TradePlan = bestPlanRef.current ?? {
      decision: 'NO_TRADE',
      direction: 'LONG_YES',
      finalProbability: 0.5,
      marketProbability: 0.5,
      edge: 0,
      expectedValue: 0,
      positionSize: 0,
      entryPrice: 0.5,
      stopLoss: 0.6,
      takeProfit: 0.35,
      timeHorizon: 'N/A',
      invalidationConditions: [],
      liquidityNotes: '',
      confidenceScore: 0,
      noTradeReason: 'No positive EV detected this window',
      regime: 'R1_LOW_VOL',
      disagreement: 0,
      regimeWeights: { r1: 1, r2: 0, r3: 0 },
      blendWeights: { wMarket: 0.33, wSim: 0.34, wOrderbook: 0.33 },
      computeTimeMs: 0,
    };

    const noTradePlan: TradePlan = {
      ...stub,
      decision: 'NO_TRADE',
      noTradeReason: 'No positive EV detected this window',
      positionSize: 0,
    };

    committedRef.current = true;
    bestPlanRef.current = noTradePlan;
    setLocked({
      plan: noTradePlan,
      status: 'COMMITTED',
      lockedAt: new Date(),
      windowId: windowIdRef.current,
      bestEvSoFar: 0,
    });
  }, []);

  const compute = useCallback(() => {
    if (committedRef.current) return;

    const inputs = buildInputs();
    if (!inputs) {
      setLocked(null);
      return;
    }

    // Track when data collection started
    if (dataCollectionStartRef.current === null) {
      dataCollectionStartRef.current = Date.now();
    }

    setIsComputing(true);

    try {
      const timeToExpiryMs = inputs.timeToExpiryMs;
      const dataAge = Date.now() - dataCollectionStartRef.current;

      // Forced commit at 3 min remaining
      if (timeToExpiryMs < FORCED_COMMIT_MS) {
        if (bestPlanRef.current && bestPlanRef.current.decision === 'TRADE_NOW') {
          commit(bestPlanRef.current);
        } else {
          commitNoTrade();
        }
        return;
      }

      // Normal computation
      const plan = generateTradePlan(inputs);

      // Record debug snapshot
      const snapshot: DebugSnapshot = {
        timestamp: Date.now(),
        decision: plan.decision,
        direction: plan.direction,
        ev: plan.expectedValue,
        edge: plan.edge,
        regime: plan.regime,
        stabilityCount: stabilityCountRef.current,
        pSim: plan.debugData?.pSim ?? 0,
        pMarket: plan.debugData?.pMarket ?? 0,
        pFinal: plan.finalProbability,
      };
      historyRef.current = [...historyRef.current.slice(-19), snapshot];
      setDebugHistory([...historyRef.current]);

      // Track best positive-EV plan
      if (plan.decision === 'TRADE_NOW') {
        if (!bestPlanRef.current || plan.expectedValue > bestPlanRef.current.expectedValue) {
          bestPlanRef.current = plan;
        }

        // Stability filter: track consecutive ticks with same direction + decision
        if (plan.direction === lastDirectionRef.current && plan.decision === lastDecisionRef.current) {
          stabilityCountRef.current++;
        } else {
          stabilityCountRef.current = 1;
        }
        lastDirectionRef.current = plan.direction;
        lastDecisionRef.current = plan.decision;
        setStabilityCount(stabilityCountRef.current);

        // Commit if stable + enough data collected
        if (
          stabilityCountRef.current >= STABILITY_THRESHOLD &&
          dataAge >= MIN_DATA_COLLECTION_MS &&
          bestPlanRef.current.decision === 'TRADE_NOW'
        ) {
          commit(bestPlanRef.current);
          return;
        }
      } else {
        // Reset stability if we lost the TRADE_NOW signal
        if (lastDecisionRef.current !== plan.decision || lastDirectionRef.current !== plan.direction) {
          stabilityCountRef.current = 0;
          setStabilityCount(0);
        }
        lastDirectionRef.current = plan.direction;
        lastDecisionRef.current = plan.decision;
      }

      // Update scanning state
      setLocked({
        plan: bestPlanRef.current ?? plan,
        status: 'SCANNING',
        lockedAt: null,
        windowId: windowIdRef.current,
        bestEvSoFar: bestPlanRef.current?.expectedValue ?? plan.expectedValue,
      });
    } catch (err) {
      console.error('Signal engine error:', err);
      setLocked(null);
    } finally {
      setIsComputing(false);
    }
  }, [buildInputs, commit, commitNoTrade]);

  // Debounced recomputation
  useEffect(() => {
    if (committedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(compute, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [compute]);

  return {
    tradePlan: locked?.plan ?? null,
    status: locked?.status ?? ('SCANNING' as AccumulatorStatus),
    lockedAt: locked?.lockedAt ?? null,
    bestEvSoFar: locked?.bestEvSoFar ?? 0,
    isComputing,
    stabilityCount,
    dataCollectionStart: dataCollectionStartRef.current,
    recalculate: compute,
    debugHistory,
  };
}
