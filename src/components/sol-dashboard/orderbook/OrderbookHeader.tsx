import { cn } from '@/lib/utils';
import { ChevronUp, Loader2 } from 'lucide-react';
import type { OrderbookLevel } from '@/types/sol-markets';

interface OrderbookHeaderProps {
  isOpen: boolean;
  onToggle: () => void;
  isLoading: boolean;
  totalBidDepth: number;
  totalAskDepth: number;
}

export function OrderbookHeader({ isOpen, onToggle, isLoading, totalBidDepth, totalAskDepth }: OrderbookHeaderProps) {
  const totalDepth = totalBidDepth + totalAskDepth;
  const bidRatio = totalDepth > 0 ? (totalBidDepth / totalDepth) * 100 : 50;

  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50">
      <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Order Book</span>
      <div className="flex items-center gap-3">
        {totalDepth > 0 && (
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[10px] text-trading-up font-mono tabular-nums">${totalBidDepth.toFixed(0)}</span>
            <div className="w-14 h-1.5 bg-muted overflow-hidden flex">
              <div className="h-full bg-trading-up" style={{ width: `${bidRatio}%` }} />
              <div className="h-full bg-trading-down" style={{ width: `${100 - bidRatio}%` }} />
            </div>
            <span className="text-[10px] text-trading-down font-mono tabular-nums">${totalAskDepth.toFixed(0)}</span>
          </div>
        )}
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <ChevronUp className={cn('h-4 w-4 text-muted-foreground', !isOpen && 'rotate-180')} />
      </div>
    </button>
  );
}

export function calculateDepth(levels: OrderbookLevel[]): number {
  return levels.reduce((sum, level) => {
    const size = typeof level.size === 'number' ? level.size : parseFloat(String(level.size)) || 0;
    return sum + level.price * size;
  }, 0);
}
