import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { useSharedQuantEngine } from '@/contexts/QuantEngineContext';
import { useCountdown } from '@/hooks/useCountdown';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useMultiSourcePrice } from '@/hooks/useMultiSourcePrice';
import { useState, useEffect } from 'react';

export function MarketOverviewPanel() {
  const { currentPrice, selectedMarket, selectedSlot, wsConnected } = useSOLMarkets();
  const quant = useSharedQuantEngine();
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

      {/* Hero metrics */}
      <div className="grid grid-cols-3 gap-2 py-1.5 border-y border-border">
        <div>
          <span className="text-[10px] text-muted-foreground uppercase">SOL Price</span>
          <p className={cn("text-lg font-mono font-bold tabular-nums", isAbove ? 'text-trading-up' : 'text-trading-down')}>
            {S0 !== 0 ? `$${S0.toFixed(2)}` : '—'}
          </p>
        </div>
        <div className="text-center">
          <span className="text-[10px] text-muted-foreground uppercase">Time Left</span>
          <p className={cn(
            "text-lg font-mono font-bold tabular-nums",
            countdown.urgency === 'urgent' ? 'text-trading-down' : countdown.urgency === 'warning' ? 'text-[hsl(var(--timer-warning))]' : 'text-foreground'
          )}>
            {countdown.minutes}:{countdown.seconds.toString().padStart(2, '0')}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground uppercase">Edge</span>
          <p className={cn(
            "text-lg font-mono font-bold tabular-nums",
            edgeBps > 0 ? 'text-trading-up' : edgeBps < 0 ? 'text-trading-down' : 'text-muted-foreground'
          )}>
            {edgeBps >= 0 ? '+' : ''}{edgeBps.toFixed(1)}<span className="text-xs font-normal text-muted-foreground ml-0.5">bps</span>
          </p>
        </div>
      </div>

      {/* Detail rows */}
      <div className="space-y-0.5">
        <Row label="Strike (K)" value={`$${K.toFixed(4)}`} />
        <Row label="Δ (S₀ − K)" value={`${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`} highlight={isAbove ? 'up' : 'down'} />
        <Row label="σ_total" value={`${(quant.microstructure.sigmaTotal * 100).toFixed(4)}%`} />
        <Row label="μ_adj" value={quant.drift.hasMomentum ? `${(quant.drift.muAdj * 100).toFixed(4)}%` : '0'} />
        <div className="border-t border-border my-1" />
        <Row label="P(market)" value={`${(quant.pMarket * 100).toFixed(2)}%`} />
        <Row label="P(true)" value={`${(quant.pTrue * 100).toFixed(2)}%`} highlight={quant.kelly.edge > 0 ? 'up' : 'down'} emphasis />
      </div>
    </div>
  );
}

function Row({ label, value, highlight, emphasis }: { label: string; value: string; highlight?: 'up' | 'down' | 'warn'; emphasis?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", emphasis && "py-0.5 bg-muted/30 px-1 -mx-1 rounded-sm")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono font-semibold tabular-nums",
        emphasis ? "text-base" : "text-sm",
        highlight === 'up' ? 'text-trading-up' :
        highlight === 'down' ? 'text-trading-down' :
        highlight === 'warn' ? 'text-[hsl(var(--timer-warning))]' :
        'text-foreground'
      )}>{value}</span>
    </div>
  );
}
