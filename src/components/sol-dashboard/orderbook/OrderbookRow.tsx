import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface OrderbookRowProps {
  price: number;
  size: number;
  total: number;
  cumulativeSize: number;
  maxCumulativeSize: number;
  side: 'bid' | 'ask';
  isBest?: boolean;
  onClick?: () => void;
  animationClass?: string;
}

export function OrderbookRow({
  price, size, total, cumulativeSize, maxCumulativeSize, side, isBest = false, onClick, animationClass,
}: OrderbookRowProps) {
  const depthPercent = maxCumulativeSize > 0 ? (cumulativeSize / maxCumulativeSize) * 100 : 0;
  const isBid = side === 'bid';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          onClick={onClick}
          className={cn(
            'relative grid grid-cols-4 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/80',
            isBest && 'bg-muted/40',
            animationClass
          )}
        >
          <div
            className={cn('absolute top-0 h-full', isBid ? 'left-0 bg-trading-up/15' : 'right-0 bg-trading-down/15')}
            style={{ width: `${Math.min(depthPercent, 100)}%` }}
          />
          <span className={cn('relative z-10 font-mono font-medium tabular-nums', isBid ? 'text-trading-up' : 'text-trading-down')}>
            {(price * 100).toFixed(1)}¢
          </span>
          <span className="relative z-10 text-center font-mono tabular-nums text-foreground">{size.toFixed(0)}</span>
          <span className="relative z-10 text-center font-mono tabular-nums text-muted-foreground">{cumulativeSize.toFixed(0)}</span>
          <span className="relative z-10 text-right font-mono tabular-nums text-muted-foreground">${total.toFixed(2)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p className="text-[10px]">Click to {isBid ? 'sell' : 'buy'} at {(price * 100).toFixed(1)}¢</p>
      </TooltipContent>
    </Tooltip>
  );
}
