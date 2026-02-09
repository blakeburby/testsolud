import { useState, useEffect, useRef, useCallback } from 'react';
import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { generateTradePlan } from '@/lib/signal-engine';
import type { TradePlan, SignalEngineInputs } from '@/types/signal-engine';

const DEBOUNCE_MS = 500;

export function useSignalEngine() {
  const {
    currentPrice,
    priceHistory,
    selectedMarket,
    selectedSlot,
    selectedDirection,
    orderbook,
  } = useSOLMarkets();

  const [tradePlan, setTradePlan] = useState<TradePlan | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const compute = useCallback(() => {
    if (!currentPrice || !selectedMarket || !selectedSlot) {
      setTradePlan(null);
      return;
    }

    setIsComputing(true);

    const timeToExpiryMs = Math.max(0, selectedSlot.windowEnd.getTime() - Date.now());
    const totalWindowMs = selectedSlot.windowEnd.getTime() - selectedSlot.windowStart.getTime();

    const inputs: SignalEngineInputs = {
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

    try {
      const plan = generateTradePlan(inputs);
      setTradePlan(plan);
    } catch (err) {
      console.error('Signal engine error:', err);
      setTradePlan(null);
    } finally {
      setIsComputing(false);
    }
  }, [currentPrice, priceHistory, selectedMarket, selectedSlot, selectedDirection, orderbook]);

  // Debounced recomputation
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(compute, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [compute]);

  return { tradePlan, isComputing, recalculate: compute };
}
