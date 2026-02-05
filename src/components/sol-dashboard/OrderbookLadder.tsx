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
 
// Helper to safely format size as a number
function formatSize(size: unknown): string {
  if (typeof size === 'number' && !isNaN(size)) {
    return size.toFixed(0);
  }
  if (typeof size === 'string') {
    const parsed = parseFloat(size);
    return isNaN(parsed) ? '0' : parsed.toFixed(0);
  }
  return '0';
}

// Helper to safely get numeric size
function getNumericSize(size: unknown): number {
  if (typeof size === 'number' && !isNaN(size)) {
    return size;
  }
  if (typeof size === 'string') {
    const parsed = parseFloat(size);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

 export function OrderbookLadder() {
   const { selectedMarket, selectedSlot, orderbook, orderbookLoading, orderbookError, isLive, setPendingOrder } = useSOLMarkets();
   const [isOpen, setIsOpen] = useState(true);
   const [activeTab, setActiveTab] = useState<'up' | 'down'>('up');
 
   // Check if this is a synthetic market
   const isSynthetic = selectedMarket?.ticker.startsWith('SYNTHETIC-');
 
   // Get orderbook data based on active tab
   const bids = (activeTab === 'up' 
     ? (orderbook?.yesBids || []) 
     : (orderbook?.noBids || []));
   const asks = (activeTab === 'up' 
     ? (orderbook?.yesAsks || []) 
     : (orderbook?.noAsks || []));
 
   // Calculate cumulative sizes for depth visualization
   const { bidsCumulative, asksCumulative, maxCumulativeSize } = useMemo(() => {
     // Bids: cumulative from best (highest) to worst (lowest)
     const sortedBids = [...bids].sort((a, b) => b.price - a.price);
     let bidCum = 0;
     const bidsCum = sortedBids.map(b => {
       bidCum += getNumericSize(b.size);
       return { ...b, cumulative: bidCum };
     });
 
     // Asks: cumulative from best (lowest) to worst (highest)
     const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
     let askCum = 0;
     const asksCum = sortedAsks.map(a => {
       askCum += getNumericSize(a.size);
       return { ...a, cumulative: askCum };
     });
 
     const maxCum = Math.max(bidCum, askCum, 1);
     return { bidsCumulative: bidsCum, asksCumulative: asksCum, maxCumulativeSize: maxCum };
   }, [bids, asks]);
 
   const volume = orderbook?.totalVolume || 0;
   const spread = orderbook?.spread;
 
   // Calculate last price from best bid/ask
   const bestBid = bids.length > 0 ? Math.max(...bids.map(b => b.price)) : null;
   const bestAsk = asks.length > 0 ? Math.min(...asks.map(a => a.price)) : null;
   const lastPrice = bestBid !== null ? bestBid : (bestAsk !== null ? bestAsk : null);
 
   // Calculate total depth for header
   const totalBidDepth = useMemo(() => calculateDepth(bids), [bids]);
   const totalAskDepth = useMemo(() => calculateDepth(asks), [asks]);
 
   // Animation hook
   const { getAnimationClass } = useOrderbookAnimations(bids, asks);
 
   // Early return after all hooks
   if (!selectedSlot || selectedSlot.isPast) {
     return null;
   }
 
   // Click-to-trade handler
   const handleRowClick = (price: number, side: 'buy' | 'sell') => {
     setPendingOrder({ price, side });
   };
 
   // Loading skeleton
   const OrderbookSkeleton = () => (
     <div className="p-4 space-y-2">
       {[...Array(5)].map((_, i) => (
         <Skeleton key={i} className="h-8 w-full" />
       ))}
     </div>
   );
 
   // Error state
   const OrderbookError = ({ message }: { message: string }) => (
     <div className="p-4 flex items-center gap-2 text-destructive">
       <AlertCircle className="h-4 w-4" />
       <span className="text-sm">{message}</span>
     </div>
   );
 
   // Empty state
   const OrderbookEmpty = () => (
     <div className="p-8 text-center text-muted-foreground">
       <p className="text-sm">No orderbook data available</p>
       {isSynthetic && (
         <p className="text-xs mt-1">Synthetic markets don't have real orderbook data</p>
       )}
     </div>
   );
 
   return (
     <div className="border border-border rounded-lg mt-4">
       <OrderbookHeader
         isOpen={isOpen}
         onToggle={() => setIsOpen(!isOpen)}
         isLoading={orderbookLoading}
         isSynthetic={isSynthetic}
         totalBidDepth={totalBidDepth}
         totalAskDepth={totalAskDepth}
         isLive={isLive}
       />
 
       {isOpen && (
         <div className="border-t border-border">
            {/* Error state */}
            {orderbookError && <OrderbookError message={orderbookError} />}
 
            {/* Loading state (only show on initial load) */}
            {orderbookLoading && !orderbook && !orderbookError && <OrderbookSkeleton />}
 
            {/* Synthetic market message */}
            {isSynthetic && !orderbookError && <OrderbookEmpty />}
 
            {/* Real orderbook content */}
            {!isSynthetic && !orderbookError && (orderbookLoading ? (!orderbook && <OrderbookSkeleton />) : null)}
            {!isSynthetic && !orderbookError && (orderbook || !orderbookLoading) && (
              <TooltipProvider>
           {/* Tabs */}
           <div className="flex items-center justify-between p-4 border-b border-border">
             <div className="flex gap-4">
               <button
                 onClick={() => setActiveTab('up')}
                 className={cn(
                   "text-sm font-medium",
                   activeTab === 'up' ? 'text-foreground' : 'text-muted-foreground'
                 )}
               >
                 Trade Up
               </button>
               <button
                 onClick={() => setActiveTab('down')}
                 className={cn(
                   "text-sm font-medium",
                   activeTab === 'down' ? 'text-foreground' : 'text-muted-foreground'
                 )}
               >
                 Trade Down
               </button>
             </div>
             <div className="flex items-center gap-3">
               <span className="text-sm text-trading-up flex items-center gap-1">
                 <span className="text-xs">◎</span> Maker Rebate
               </span>
               <RefreshCw className="h-4 w-4 text-muted-foreground" />
               <span className="text-sm text-muted-foreground">0.1¢</span>
             </div>
           </div>
 
           {/* Table Header */}
           <div className="grid grid-cols-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase border-b border-border">
             <span>Price</span>
             <span className="text-center">Size</span>
             <span className="text-center">Cumulative</span>
             <span className="text-right">Total $</span>
           </div>
 
           {/* Asks (red/sell side) - display from highest to lowest, reversed for visual */}
           {asksCumulative.length > 0 && (
             <div className="relative">
               {/* Asks label */}
               <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20">
                 <span className="bg-trading-down text-white text-xs px-2 py-0.5 rounded font-medium">
                   Asks
                 </span>
               </div>
               {[...asksCumulative].reverse().map((level, i) => {
                 const actualIndex = asksCumulative.length - 1 - i;
                 const isBestAsk = actualIndex === 0;
                 return (
                   <OrderbookRow
                     key={`ask-${level.price}-${i}`}
                     price={level.price}
                     size={getNumericSize(level.size)}
                     total={level.price * getNumericSize(level.size)}
                     cumulativeSize={level.cumulative}
                     maxCumulativeSize={maxCumulativeSize}
                     side="ask"
                     isBest={isBestAsk}
                     onClick={() => handleRowClick(level.price, 'buy')}
                     animationClass={getAnimationClass('ask', level.price, actualIndex)}
                   />
                 );
               })}
             </div>
           )}
 
           {/* Mid-price display */}
           <MidPriceDisplay
             bestBid={bestBid}
             bestAsk={bestAsk}
             spread={spread}
           />
 
           {/* Bids (green/buy side) */}
           {bidsCumulative.length > 0 && (
             <div className="relative">
               {/* Bids label */}
               <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20">
                 <span className="bg-trading-up text-white text-xs px-2 py-0.5 rounded font-medium">
                   Bids
                 </span>
               </div>
               {bidsCumulative.map((level, i) => {
                 const isBestBid = i === 0;
                 return (
                   <OrderbookRow
                     key={`bid-${level.price}-${i}`}
                     price={level.price}
                     size={getNumericSize(level.size)}
                     total={level.price * getNumericSize(level.size)}
                     cumulativeSize={level.cumulative}
                     maxCumulativeSize={maxCumulativeSize}
                     side="bid"
                     isBest={isBestBid}
                     onClick={() => handleRowClick(level.price, 'sell')}
                     animationClass={getAnimationClass('bid', level.price, i)}
                   />
                 );
               })}
             </div>
           )}
 
            {/* Empty state when no bids or asks */}
            {asksCumulative.length === 0 && bidsCumulative.length === 0 && !orderbookLoading && (
              <OrderbookEmpty />
            )}
              </TooltipProvider>
            )}
         </div>
       )}
     </div>
   );
 }