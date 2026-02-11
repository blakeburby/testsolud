import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { useQuantEngine } from '@/hooks/useQuantEngine';
import { useCountdown } from '@/hooks/useCountdown';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useMultiSourcePrice } from '@/hooks/useMultiSourcePrice';
import { useState, useEffect } from 'react';

export function MarketOverviewPanel() {
  const { currentPrice, selectedMarket, selectedSlot, wsConnected } = useSOLMarkets();
  const quant = useQuantEngine();
  const countdown = useCountdown(selectedSlot?.windowEnd ?? null);
  const { sources, timestamp: wsTimestamp } = useMultiSourcePrice('SOL/USD');
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setLatency(wsTimestamp ? Date.now() - wsTimestamp : 0);
    }, 200);
    return () => clearInterval(id);
  }, [wsTimestamp]);

  const S0 = currentPrice ?? 0;
  const K = selectedMarket?.strikePrice ?? 0;
  const delta = S0 - K;
  const isAbove = delta >= 0;
  const edgeBps = quant.kelly.edge * 10000;

  return (
    <div className={cn("terminal-panel space-y-2", quant.kelly.hasSignal && (quant.kelly.signalDirection === 'YES' ? 'border-l-2 border-l-trading-up' : 'border-l-2 border-l-trading-down'))}>
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Market</span>
          {selectedSlot && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {format(selectedSlot.windowStart, 'h:mm')}–{format(selectedSlot.windowEnd, 'h:mm a')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
          <span>{latency}ms</span>
          <span>{quant.lastComputeMs.toFixed(0)}ms</span>
          <span className="flex items-center gap-1">
            <span className={cn("inline-block h-1.5 w-1.5 rounded-sm", sources.kraken ? "bg-trading-up" : "bg-destructive")} />K
            <span className={cn("inline-block h-1.5 w-1.5 rounded-sm", sources.coinbase ? "bg-trading-up" : "bg-destructive")} />C
            <span className={cn("inline-block h-1.5 w-1.5 rounded-sm", sources.binance ? "bg-trading-up" : "bg-destructive")} />B
          </span>
          <span className={cn("rounded-sm px-1", quant.ewma.volRegime === 'High' ? 'text-trading-down' : quant.ewma.volRegime === 'Medium' ? 'text-[hsl(var(--timer-warning))]' : 'text-trading-up')}>
            {quant.ewma.volRegime}
          </span>
          <span>{quant.simMode === 'monte-carlo' ? 'MC' : 'CF'}</span>
        </div>
      </div>

      {/* Data rows */}
      <div className="space-y-0.5">
        <Row label="S₀" value={S0 !== 0 ? `$${S0.toFixed(4)}` : '—'} highlight={isAbove ? 'up' : 'down'} />
        <Row label="K" value={`$${K.toFixed(4)}`} />
        <Row label="Δ" value={`${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`} highlight={isAbove ? 'up' : 'down'} />
        <Row label="σ_total" value={`${(quant.microstructure.sigmaTotal * 100).toFixed(4)}%`} />
        <Row label="μ_adj" value={quant.drift.hasMomentum ? `${(quant.drift.muAdj * 100).toFixed(4)}%` : '0'} />
        <Row label="T" value={`${countdown.minutes}:${countdown.seconds.toString().padStart(2, '0')}`}
          highlight={countdown.urgency === 'urgent' ? 'down' : countdown.urgency === 'warning' ? 'warn' : undefined} />
        <div className="border-t border-border my-1" />
        <Row label="P(mkt)" value={`${(quant.pMarket * 100).toFixed(2)}%`} />
        <Row label="P(true)" value={`${(quant.pTrue * 100).toFixed(2)}%`} highlight={quant.kelly.edge > 0 ? 'up' : 'down'} />
        <Row label="Edge" value={`${edgeBps >= 0 ? '+' : ''}${edgeBps.toFixed(1)} bps`} highlight={edgeBps > 0 ? 'up' : edgeBps < 0 ? 'down' : undefined} />
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: 'up' | 'down' | 'warn' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "text-sm font-mono font-semibold tabular-nums",
        highlight === 'up' ? 'text-trading-up' :
        highlight === 'down' ? 'text-trading-down' :
        highlight === 'warn' ? 'text-[hsl(var(--timer-warning))]' :
        'text-foreground'
      )}>{value}</span>
    </div>
  );
}
