import { useMemo } from 'react';
import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { closedFormProbability } from '@/lib/quant/monte-carlo';
import { applyMicrostructureFloor, minutesToYears } from '@/lib/quant/microstructure-floor';
import { cn } from '@/lib/utils';
import { Grid3x3 } from 'lucide-react';

const TIME_STEPS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0.5]; // minutes remaining

export function EdgeHeatmap() {
  const { currentPrice, selectedMarket } = useSOLMarkets();

  const heatmapData = useMemo(() => {
    if (!currentPrice || !selectedMarket) return [];

    const S0 = currentPrice;
    const K = selectedMarket.strikePrice;
    const pMarket = selectedMarket.yesPrice ?? 0.5;
    const sigma = 0.60; // Use a reasonable default for heatmap preview

    return TIME_STEPS.map(mins => {
      const T = minutesToYears(mins);
      const micro = applyMicrostructureFloor(sigma, T);
      const cf = closedFormProbability(S0, K, T, micro.sigmaTotal);
      const edge = cf.pUp - pMarket;

      return { mins, pUp: cf.pUp, edge, pMarket };
    });
  }, [currentPrice, selectedMarket]);

  if (heatmapData.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Grid3x3 className="h-4 w-4 text-[hsl(var(--gold))]" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Edge vs Time</h3>
        </div>
        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Waiting for data...</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Grid3x3 className="h-4 w-4 text-[hsl(var(--gold))]" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Edge vs Time</h3>
      </div>

      <div className="space-y-1">
        {heatmapData.map(({ mins, pUp, edge }) => (
          <div key={mins} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono w-12 text-right tabular-nums">
              {mins >= 1 ? `${mins}m` : `${mins * 60}s`}
            </span>
            <div className="flex-1 h-5 relative rounded overflow-hidden bg-muted">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded transition-all duration-300",
                  edge > 0.05 ? "bg-trading-up/60" :
                  edge > 0.02 ? "bg-trading-up/30" :
                  edge > 0 ? "bg-trading-up/15" :
                  edge > -0.02 ? "bg-trading-down/15" :
                  edge > -0.05 ? "bg-trading-down/30" :
                  "bg-trading-down/60"
                )}
                style={{ width: `${Math.min(100, Math.abs(edge) * 500 + 20)}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-semibold text-foreground">
                {edge > 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-mono w-14 tabular-nums">
              {(pUp * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 pt-1 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded bg-trading-up/40" />
          <span>+Edge</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded bg-trading-down/40" />
          <span>−Edge</span>
        </div>
      </div>
    </div>
  );
}
