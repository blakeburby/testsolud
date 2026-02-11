import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { OrderbookLevel } from '@/types/sol-markets';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OrderbookRow } from './orderbook/OrderbookRow';
import { MidPriceDisplay } from './orderbook/MidPriceDisplay';
import { OrderbookHeader, calculateDepth } from './orderbook/OrderbookHeader';
import { useOrderbookAnimations } from '@/hooks/useOrderbookAnimations';

function getNumericSize(size: unknown): number {
  if (typeof size === 'number' && !isNaN(size)) return size;
  if (typeof size === 'string') { const p = parseFloat(size); return isNaN(p) ? 0 : p; }
  return 0;
}

export function OrderbookLadder() {
  const { selectedMarket, selectedSlot, orderbook, orderbookLoading, orderbookError, isLive, setPendingOrder } = useSOLMarkets();
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'up' | 'down'>('up');

  const bids = (activeTab === 'up' ? (orderbook?.yesBids || []) : (orderbook?.noBids || []));
  const asks = (activeTab === 'up' ? (orderbook?.yesAsks || []) : (orderbook?.noAsks || []));

  const { bidsCumulative, asksCumulative, maxCumulativeSize } = useMemo(() => {
    const sortedBids = [...bids].sort((a, b) => b.price - a.price);
    let bidCum = 0;
    const bidsCum = sortedBids.map(b => { bidCum += getNumericSize(b.size); return { ...b, cumulative: bidCum }; });
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
    let askCum = 0;
    const asksCum = sortedAsks.map(a => { askCum += getNumericSize(a.size); return { ...a, cumulative: askCum }; });
    return { bidsCumulative: bidsCum, asksCumulative: asksCum, maxCumulativeSize: Math.max(bidCum, askCum, 1) };
  }, [bids, asks]);

  const bestBid = bids.length > 0 ? Math.max(...bids.map(b => b.price)) : null;
  const bestAsk = asks.length > 0 ? Math.min(...asks.map(a => a.price)) : null;
  const totalBidDepth = useMemo(() => calculateDepth(bids), [bids]);
  const totalAskDepth = useMemo(() => calculateDepth(asks), [asks]);
  const { getAnimationClass } = useOrderbookAnimations(bids, asks);

  if (!selectedSlot || selectedSlot.isPast) return null;

  const handleRowClick = (price: number, side: 'buy' | 'sell') => { setPendingOrder({ price, side }); };

  return (
    <div className="border border-border rounded-sm mt-2">
      <OrderbookHeader isOpen={isOpen} onToggle={() => setIsOpen(!isOpen)} isLoading={orderbookLoading} totalBidDepth={totalBidDepth} totalAskDepth={totalAskDepth} />
      {isOpen && (
        <div className="border-t border-border">
          {orderbookError && (
            <div className="p-3 flex items-center gap-2 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs">{orderbookError}</span>
            </div>
          )}
          {orderbookLoading && !orderbook && !orderbookError && (
            <div className="p-3 space-y-1.5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
          )}
          {!orderbookError && orderbook && (
            <TooltipProvider>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <div className="flex gap-3">
                  <button onClick={() => setActiveTab('up')} className={cn("text-xs font-medium", activeTab === 'up' ? 'text-foreground' : 'text-muted-foreground')}>Trade Up</button>
                  <button onClick={() => setActiveTab('down')} className={cn("text-xs font-medium", activeTab === 'down' ? 'text-foreground' : 'text-muted-foreground')}>Trade Down</button>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-mono">0.1¢</span>
                </div>
              </div>
              <div className="grid grid-cols-4 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase border-b border-border">
                <span>Price</span><span className="text-center">Size</span><span className="text-center">Cum</span><span className="text-right">Total $</span>
              </div>
              {asksCumulative.length > 0 && (
                <div className="relative">
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20">
                    <span className="bg-trading-down text-white text-[9px] px-1.5 py-0.5 rounded-sm font-medium">Asks</span>
                  </div>
                  {[...asksCumulative].reverse().map((level, i) => {
                    const actualIndex = asksCumulative.length - 1 - i;
                    return <OrderbookRow key={`ask-${level.price}-${i}`} price={level.price} size={getNumericSize(level.size)} total={level.price * getNumericSize(level.size)} cumulativeSize={level.cumulative} maxCumulativeSize={maxCumulativeSize} side="ask" isBest={actualIndex === 0} onClick={() => handleRowClick(level.price, 'buy')} animationClass={getAnimationClass('ask', level.price, actualIndex)} />;
                  })}
                </div>
              )}
              <MidPriceDisplay bestBid={bestBid} bestAsk={bestAsk} spread={orderbook?.spread} />
              {bidsCumulative.length > 0 && (
                <div className="relative">
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20">
                    <span className="bg-trading-up text-white text-[9px] px-1.5 py-0.5 rounded-sm font-medium">Bids</span>
                  </div>
                  {bidsCumulative.map((level, i) => (
                    <OrderbookRow key={`bid-${level.price}-${i}`} price={level.price} size={getNumericSize(level.size)} total={level.price * getNumericSize(level.size)} cumulativeSize={level.cumulative} maxCumulativeSize={maxCumulativeSize} side="bid" isBest={i === 0} onClick={() => handleRowClick(level.price, 'sell')} animationClass={getAnimationClass('bid', level.price, i)} />
                  ))}
                </div>
              )}
              {asksCumulative.length === 0 && bidsCumulative.length === 0 && !orderbookLoading && (
                <div className="p-4 text-center text-muted-foreground text-xs">No orderbook data</div>
              )}
            </TooltipProvider>
          )}
          {!orderbookError && !orderbook && !orderbookLoading && (
            <div className="p-4 text-center text-muted-foreground text-xs">No orderbook data</div>
          )}
        </div>
      )}
    </div>
  );
}
