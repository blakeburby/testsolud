import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { useQuantEngine } from '@/hooks/useQuantEngine';
import { useCountdown } from '@/hooks/useCountdown';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Clock, Target, BarChart3 } from 'lucide-react';

export function MarketOverviewPanel() {
  const { currentPrice, selectedMarket, selectedSlot, wsConnected } = useSOLMarkets();
  const quant = useQuantEngine();
  const countdown = useCountdown(selectedSlot?.windowEnd ?? null);

  const strikePrice = selectedMarket?.strikePrice ?? 0;
  const isAbove = currentPrice !== null && currentPrice >= strikePrice;
  const priceDiff = currentPrice !== null ? currentPrice - strikePrice : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[hsl(var(--gold)/0.2)] to-[hsl(var(--gold)/0.05)] flex items-center justify-center border border-[hsl(var(--gold)/0.3)]">
            <BarChart3 className="h-5 w-5 text-[hsl(var(--gold))]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">SOL 15-Min Contract</h2>
            {selectedSlot && (
              <p className="text-xs text-muted-foreground">
                {format(selectedSlot.windowStart, 'h:mm')}–{format(selectedSlot.windowEnd, 'h:mm a')} ET
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", wsConnected ? "bg-trading-up animate-pulse" : "bg-destructive")} />
          <span className={cn("text-xs font-medium", wsConnected ? "text-trading-up" : "text-destructive")}>
            {wsConnected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Strike Price */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Strike</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">${strikePrice.toFixed(2)}</p>
        </div>

        {/* Current Price */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            {isAbove ? <TrendingUp className="h-3 w-3 text-trading-up" /> : <TrendingDown className="h-3 w-3 text-trading-down" />}
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current</span>
            {priceDiff !== 0 && (
              <span className={cn('text-xs font-semibold', isAbove ? 'text-trading-up' : 'text-trading-down')}>
                {isAbove ? '+' : ''}{priceDiff.toFixed(2)}
              </span>
            )}
          </div>
          {currentPrice !== null ? (
            <p className={cn('text-2xl font-bold tabular-nums', isAbove ? 'text-trading-up' : 'text-trading-down')}>
              ${currentPrice.toFixed(2)}
            </p>
          ) : (
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
          )}
        </div>

        {/* Countdown */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expires</span>
          </div>
          <p className={cn(
            'text-2xl font-bold tabular-nums',
            countdown.urgency === 'urgent' ? 'text-trading-down' : countdown.urgency === 'warning' ? 'text-[hsl(var(--timer-warning))]' : 'text-foreground'
          )}>
            {countdown.minutes}:{countdown.seconds.toString().padStart(2, '0')}
          </p>
        </div>

        {/* Edge */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Edge</span>
          <div className="flex items-baseline gap-2">
            <p className={cn(
              'text-2xl font-bold tabular-nums',
              quant.kelly.edge > 0 ? 'text-trading-up' : quant.kelly.edge < 0 ? 'text-trading-down' : 'text-muted-foreground'
            )}>
              {quant.kelly.edge > 0 ? '+' : ''}{(quant.kelly.edge * 100).toFixed(1)}%
            </p>
            {quant.kelly.hasSignal && (
              <span className={cn(
                'text-xs font-bold px-2 py-0.5 rounded',
                quant.kelly.signalDirection === 'YES' ? 'bg-trading-up/20 text-trading-up' : 'bg-trading-down/20 text-trading-down'
              )}>
                {quant.kelly.signalDirection}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Probability comparison bar */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-muted-foreground">Kalshi Market: <span className="text-foreground">{(quant.pMarket * 100).toFixed(1)}%</span></span>
          <span className="text-muted-foreground">Model True: <span className={cn('font-bold', quant.kelly.edge > 0 ? 'text-trading-up' : 'text-trading-down')}>{(quant.pTrue * 100).toFixed(1)}%</span></span>
        </div>
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="absolute inset-y-0 left-0 bg-[hsl(var(--gold)/0.5)] rounded-full transition-all duration-500"
            style={{ width: `${quant.pMarket * 100}%` }}
          />
          <div 
            className={cn("absolute top-0 h-full w-0.5 transition-all duration-500", quant.kelly.edge > 0 ? 'bg-trading-up' : 'bg-trading-down')}
            style={{ left: `${quant.pTrue * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
