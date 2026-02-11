import { useMemo } from 'react';
import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { closedFormProbability } from '@/lib/quant/monte-carlo';
import { applyMicrostructureFloor, minutesToYears } from '@/lib/quant/microstructure-floor';
import { cn } from '@/lib/utils';

const TIME_STEPS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0.5];

export function EdgeHeatmap() {
  const { currentPrice, selectedMarket } = useSOLMarkets();

  const heatmapData = useMemo(() => {
    if (!currentPrice || !selectedMarket) return [];
    const S0 = currentPrice;
    const K = selectedMarket.strikePrice;
    const pMarket = selectedMarket.yesPrice ?? 0.5;
    const sigma = 0.60;

    return TIME_STEPS.map(mins => {
      const T = minutesToYears(mins);
      const micro = applyMicrostructureFloor(sigma, T);
      const cf = closedFormProbability(S0, K, T, micro.sigmaTotal);
      const edge = cf.pUp - pMarket;
      return { mins, pUp: cf.pUp, edge };
    });
  }, [currentPrice, selectedMarket]);

  if (heatmapData.length === 0) {
    return (
      <div className="terminal-panel">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Edge vs Time</span>
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">Waiting for data...</div>
      </div>
    );
  }

  return (
    <div className="terminal-panel space-y-1">
      <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Edge vs Time</span>

      <div className="space-y-0.5">
        {heatmapData.map(({ mins, pUp, edge }) => (
          <div key={mins} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono w-10 text-right tabular-nums">
              {mins >= 1 ? `${mins}m` : `${mins * 60}s`}
            </span>
            <div className="flex-1 h-4 relative bg-muted overflow-hidden">
              <div
                className={cn(
                  "absolute inset-y-0 left-0",
                  edge > 0.05 ? "bg-trading-up/60" :
                  edge > 0.02 ? "bg-trading-up/30" :
                  edge > 0 ? "bg-trading-up/15" :
                  edge > -0.02 ? "bg-trading-down/15" :
                  edge > -0.05 ? "bg-trading-down/30" :
                  "bg-trading-down/60"
                )}
                style={{ width: `${Math.min(100, Math.abs(edge) * 500 + 20)}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-semibold text-foreground">
                {edge > 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono w-12 tabular-nums">
              {(pUp * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 text-[9px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-1.5 bg-trading-up/40" />
          <span>+Edge</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-1.5 bg-trading-down/40" />
          <span>−Edge</span>
        </div>
      </div>
    </div>
  );
}
