import { cn } from '@/lib/utils';

interface MidPriceDisplayProps {
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  previousMid?: number | null;
}

export function MidPriceDisplay({ bestBid, bestAsk, spread, previousMid }: MidPriceDisplayProps) {
  const midPrice = bestBid !== null && bestAsk !== null
    ? (bestBid + bestAsk) / 2
    : (bestBid ?? bestAsk);

  const spreadCents = spread !== null ? spread * 100 : null;

  const priceDirection = previousMid !== null && midPrice !== null
    ? midPrice > previousMid ? 'up' : midPrice < previousMid ? 'down' : null
    : null;

  if (midPrice === null) {
    return (
      <div className="flex items-center justify-center py-2 border-y border-border bg-muted/30">
        <span className="text-muted-foreground text-xs">No market data</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 border-y border-border bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="text-base font-mono font-bold tabular-nums text-foreground">
          {(midPrice * 100).toFixed(1)}¢
        </span>
        {priceDirection && (
          <span className={cn('text-xs font-mono', priceDirection === 'up' ? 'text-trading-up' : 'text-trading-down')}>
            {priceDirection === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-muted-foreground">Spread</span>
        <span className="font-medium tabular-nums text-foreground">
          {spreadCents !== null ? `${spreadCents.toFixed(1)}¢` : '—'}
        </span>
      </div>
    </div>
  );
}
