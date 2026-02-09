import { useState, useEffect, useRef, useCallback } from 'react';
import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { generateTradePlan, generateForcedTradePlan } from '@/lib/signal-engine';
import type { TradePlan, SignalEngineInputs, LockedTradePlan, AccumulatorStatus } from '@/types/signal-engine';

const DEBOUNCE_MS = 500;
const EARLY_COMMIT_EV = 0.08;
const FORCED_COMMIT_MS = 3 * 60 * 1000; // 3 minutes before expiry

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

  const bestPlanRef = useRef<TradePlan | null>(null);
  const windowIdRef = useRef<string>('');
  const committedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  // Reset when window changes
  const currentWindowId = getWindowId(selectedSlot);
  if (currentWindowId !== windowIdRef.current) {
    windowIdRef.current = currentWindowId;
    bestPlanRef.current = null;
    committedRef.current = false;
    setLocked(null);
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

  const compute = useCallback(() => {
    if (committedRef.current) return; // already locked

    const inputs = buildInputs();
    if (!inputs) {
      setLocked(null);
      return;
    }

    setIsComputing(true);

    try {
      const timeToExpiryMs = inputs.timeToExpiryMs;

      // Check forced commit (< 3 min left)
      if (timeToExpiryMs < FORCED_COMMIT_MS) {
        // If we have a good candidate, commit it; otherwise force one
        if (bestPlanRef.current && bestPlanRef.current.decision === 'TRADE_NOW') {
          commit(bestPlanRef.current);
        } else {
          const forced = generateForcedTradePlan(inputs);
          commit(forced);
        }
        return;
      }

      // Normal computation
      const plan = generateTradePlan(inputs);

      // Track best plan (highest EV that passes gates)
      if (plan.decision === 'TRADE_NOW') {
        if (!bestPlanRef.current || plan.expectedValue > bestPlanRef.current.expectedValue) {
          bestPlanRef.current = plan;
        }

        // Early commit on strong signal
        if (plan.expectedValue > EARLY_COMMIT_EV) {
          commit(plan);
          return;
        }
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
  }, [buildInputs, commit]);

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
    recalculate: compute,
  };
}
