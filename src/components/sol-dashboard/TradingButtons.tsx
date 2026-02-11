import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function TradingButtons() {
  const { selectedMarket, selectedSlot, selectDirection, selectedDirection } = useSOLMarkets();
  const strikePrice = selectedMarket?.strikePrice ?? 0;
  const isMarketClosed = selectedSlot?.isPast || !selectedSlot;
  const yesPrice = selectedMarket?.yesAsk ?? selectedMarket?.yesPrice ?? 0.05;
  const noPrice = selectedMarket?.noAsk ?? (1 - (selectedMarket?.yesPrice ?? 0.05));
  const chancePercent = Math.round((yesPrice ?? 0.5) * 100);

  return (
    <div className="border-t border-border pt-2">
      <div className="flex items-center justify-between py-2">
        <span className="text-xs text-muted-foreground font-mono">K = ${strikePrice.toFixed(4)}</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            Chance <span className="text-sm font-mono font-bold text-foreground">{chancePercent}%</span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => selectDirection('up')}
              disabled={isMarketClosed}
              className={cn(
                'rounded-sm px-4 py-1.5 h-auto text-xs font-semibold border',
                selectedDirection === 'up'
                  ? 'border-trading-up bg-trading-up/10 text-trading-up'
                  : 'border-border text-foreground'
              )}
            >
              Yes {Math.round((yesPrice ?? 0) * 100)}¢
            </Button>
            <Button
              onClick={() => selectDirection('down')}
              disabled={isMarketClosed}
              className={cn(
                'rounded-sm px-4 py-1.5 h-auto text-xs font-semibold',
                selectedDirection === 'down'
                  ? 'bg-trading-down text-white'
                  : 'bg-trading-down/90 text-white'
              )}
            >
              No {Math.round((noPrice ?? 0) * 100)}¢
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
