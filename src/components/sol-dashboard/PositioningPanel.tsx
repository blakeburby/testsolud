import { useQuantEngine } from '@/hooks/useQuantEngine';
import { cn } from '@/lib/utils';
import { DollarSign, AlertTriangle, TrendingUp, Shield } from 'lucide-react';
import { useState } from 'react';

export function PositioningPanel() {
  const quant = useQuantEngine();
  const [bankroll, setBankroll] = useState(1000);

  const kelly = quant.kelly;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-[hsl(var(--gold))]" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Positioning</h3>
        </div>
        {kelly.riskFlag && (
          <div className="flex items-center gap-1 text-trading-down">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">RISK</span>
          </div>
        )}
      </div>

      {/* Bankroll input */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Bankroll $</label>
        <input
          type="number"
          value={bankroll}
          onChange={(e) => setBankroll(Math.max(0, Number(e.target.value)))}
          className="w-24 bg-muted border border-border rounded px-2 py-1 text-sm font-mono text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-[hsl(var(--gold)/0.5)]"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Full Kelly</span>
          <span className="text-sm font-mono font-semibold tabular-nums text-foreground">
            {(kelly.fullKelly * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">¼ Kelly (Recommended)</span>
          <span className="text-sm font-mono font-bold tabular-nums text-[hsl(var(--gold))]">
            {(kelly.quarterKelly * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Allocation</span>
          <span className="text-lg font-mono font-bold tabular-nums text-foreground">
            ${(kelly.quarterKelly * bankroll).toFixed(2)}
          </span>
        </div>

        {/* Confidence */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">Confidence</span>
          <span className={cn(
            'text-xs font-bold px-2 py-0.5 rounded border',
            kelly.confidence === 'High' ? 'text-trading-up bg-trading-up/10 border-trading-up/30' :
            kelly.confidence === 'Medium' ? 'text-[hsl(var(--timer-warning))] bg-[hsl(var(--timer-warning)/0.1)] border-[hsl(var(--timer-warning)/0.3)]' :
            'text-muted-foreground bg-muted border-border'
          )}>
            {kelly.confidence}
          </span>
        </div>

        {/* Signal */}
        {kelly.hasSignal && (
          <div className={cn(
            "flex items-center justify-center gap-2 py-2 rounded-lg border",
            kelly.signalDirection === 'YES' ? 'border-trading-up/30 bg-trading-up/5' : 'border-trading-down/30 bg-trading-down/5'
          )}>
            <TrendingUp className={cn("h-4 w-4", kelly.signalDirection === 'YES' ? 'text-trading-up' : 'text-trading-down')} />
            <span className={cn("text-sm font-bold", kelly.signalDirection === 'YES' ? 'text-trading-up' : 'text-trading-down')}>
              Trade {kelly.signalDirection} — Edge {(Math.abs(kelly.edge) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
