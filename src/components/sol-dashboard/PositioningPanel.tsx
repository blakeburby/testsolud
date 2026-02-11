import { useQuantEngine } from '@/hooks/useQuantEngine';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function PositioningPanel() {
  const quant = useQuantEngine();
  const [bankroll, setBankroll] = useState(1000);
  const kelly = quant.kelly;
  const edgeBps = kelly.edge * 10000;
  const evPerDollar = kelly.edge * kelly.quarterKelly;

  return (
    <div className={cn("terminal-panel space-y-2", kelly.hasSignal && (kelly.signalDirection === 'YES' ? 'border-l-2 border-l-trading-up' : 'border-l-2 border-l-trading-down'))}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Positioning</span>
        {kelly.riskFlag && (
          <span className="text-[10px] font-bold text-trading-down">RISK</span>
        )}
      </div>

      {/* Hero: Allocation */}
      <div className="py-1.5 border-y border-border flex items-center justify-between">
        <div>
          <span className="text-[10px] text-muted-foreground uppercase">¼ Kelly Allocation</span>
          <p className="text-lg font-mono font-bold tabular-nums text-[hsl(var(--gold))]">
            ${(kelly.quarterKelly * bankroll).toFixed(2)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground uppercase">Signal</span>
          {kelly.hasSignal ? (
            <p className={cn("text-lg font-mono font-bold", kelly.signalDirection === 'YES' ? 'text-trading-up' : 'text-trading-down')}>
              {kelly.signalDirection}
            </p>
          ) : (
            <p className="text-lg font-mono font-bold text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {/* Bankroll */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Bankroll</span>
        <input
          type="number"
          value={bankroll}
          onChange={(e) => setBankroll(Math.max(0, Number(e.target.value)))}
          className="w-20 bg-muted border border-border rounded-sm px-1.5 py-0.5 text-xs font-mono text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-border"
        />
      </div>

      <div className="space-y-0.5">
        <Row label="P(true)" value={`${(quant.pTrue * 100).toFixed(2)}%`} />
        <Row label="P(market)" value={`${(quant.pMarket * 100).toFixed(2)}%`} />
        <Row label="Edge" value={`${edgeBps >= 0 ? '+' : ''}${edgeBps.toFixed(1)} bps`} highlight={edgeBps > 0 ? 'up' : edgeBps < 0 ? 'down' : undefined} emphasis />
        <div className="border-t border-border my-1" />
        <Row label="Full Kelly" value={`${(kelly.fullKelly * 100).toFixed(2)}%`} />
        <Row label="¼ Kelly" value={`${(kelly.quarterKelly * 100).toFixed(2)}%`} highlight={kelly.hasSignal ? 'gold' : undefined} />
        <Row label="EV per $1" value={`${evPerDollar >= 0 ? '+' : ''}${(evPerDollar * 100).toFixed(3)}¢`} />
        <div className="border-t border-border my-1" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Confidence</span>
          <span className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-sm',
            kelly.confidence === 'High' ? 'text-trading-up bg-trading-up/10' :
            kelly.confidence === 'Medium' ? 'text-[hsl(var(--timer-warning))] bg-[hsl(var(--timer-warning)/0.1)]' :
            'text-muted-foreground bg-muted'
          )}>
            {kelly.confidence}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight, emphasis }: { label: string; value: string; highlight?: 'up' | 'down' | 'gold'; emphasis?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", emphasis && "py-0.5 bg-muted/30 px-1 -mx-1 rounded-sm")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono font-semibold tabular-nums",
        emphasis ? "text-base" : "text-sm",
        highlight === 'up' ? 'text-trading-up' :
        highlight === 'down' ? 'text-trading-down' :
        highlight === 'gold' ? 'text-[hsl(var(--gold))]' :
        'text-foreground'
      )}>{value}</span>
    </div>
  );
}
