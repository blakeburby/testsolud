 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { useState } from 'react';
 import { cn } from '@/lib/utils';
 import { ChevronUp, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
 import { Skeleton } from '@/components/ui/skeleton';
 import type { OrderbookLevel } from '@/types/sol-markets';
 
 export function OrderbookLadder() {
   const { selectedMarket, selectedSlot, orderbook, orderbookLoading, orderbookError } = useSOLMarkets();
   const [isOpen, setIsOpen] = useState(true);
   const [activeTab, setActiveTab] = useState<'up' | 'down'>('up');
 
   if (!selectedSlot || selectedSlot.isPast) {
     return null;
   }
 
   // Check if this is a synthetic market
   const isSynthetic = selectedMarket?.ticker.startsWith('SYNTHETIC-');
 
   // Get orderbook data based on active tab
   const bids = activeTab === 'up' 
     ? (orderbook?.yesBids || []) 
     : (orderbook?.noBids || []);
   const asks = activeTab === 'up' 
     ? (orderbook?.yesAsks || []) 
     : (orderbook?.noAsks || []);
 
   const maxSize = Math.max(
     ...bids.map(b => b.size), 
     ...asks.map(a => a.size), 
     1
   );
 
   const volume = orderbook?.totalVolume || 0;
   const spread = orderbook?.spread;
 
   // Calculate last price from best bid/ask
   const bestBid = bids.length > 0 ? Math.max(...bids.map(b => b.price)) : null;
   const bestAsk = asks.length > 0 ? Math.min(...asks.map(a => a.price)) : null;
   const lastPrice = bestBid !== null ? bestBid : (bestAsk !== null ? bestAsk : null);
 
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
       {/* Header */}
       <button 
         onClick={() => setIsOpen(!isOpen)}
         className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
       >
         <span className="font-semibold text-foreground">Order Book</span>
         <div className="flex items-center gap-2">
              {orderbookLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <span className="text-sm text-muted-foreground">
                {volume > 0 ? `$${(volume / 1000).toFixed(1)}k Vol.` : 'No volume'}
              </span>
              {isSynthetic && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Demo</span>
              )}
           <ChevronUp className={cn(
             "h-5 w-5 text-muted-foreground transition-transform",
             !isOpen && "rotate-180"
           )} />
         </div>
       </button>
 
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
              <>
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
              <span className="flex items-center gap-1">
                Trade {activeTab === 'up' ? 'Up' : 'Down'} <span className="text-xs">⇅</span>
              </span>
             <span className="text-center">Price</span>
             <span className="text-center">Shares</span>
             <span className="text-right">Total</span>
           </div>

            {/* Asks (red/sell side) - sorted highest to lowest */}
            {asks.length > 0 && (
              <div className="relative">
                {[...asks].reverse().map((level, i) => (
                  <div key={`ask-${i}`} className="relative grid grid-cols-4 px-4 py-2 text-sm">
                   <div
                      className="absolute left-0 top-0 h-full bg-trading-down/10"
                      style={{ width: `${(level.size / maxSize) * 40}%` }}
                   />
                    <span className="relative z-10" />
                    <span className="relative z-10 text-center text-trading-down tabular-nums">
                      {(level.price * 100).toFixed(1)}¢
                    </span>
                    <span className="relative z-10 text-center tabular-nums">{level.size.toFixed(0)}</span>
                    <span className="relative z-10 text-right text-muted-foreground tabular-nums">
                      ${(level.price * level.size).toFixed(2)}
                    </span>
                 </div>
               ))}

                {/* Asks label */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <span className="bg-trading-down text-white text-xs px-2 py-0.5 rounded">Asks</span>
                </div>
             </div>
            )}

           {/* Spread row */}
           <div className="grid grid-cols-2 px-4 py-2 border-y border-border text-sm">
              <span className="text-muted-foreground">
                Last: {lastPrice !== null ? `${(lastPrice * 100).toFixed(1)}¢` : '—'}
              </span>
              <span className="text-right text-muted-foreground">
                Spread: {spread !== null ? `${(spread * 100).toFixed(1)}¢` : '—'}
              </span>
           </div>

           {/* Bids (green/buy side) */}
            {bids.length > 0 && (
              <div className="relative">
             {bids.map((level, i) => (
               <div key={`bid-${i}`} className="relative grid grid-cols-4 px-4 py-2 text-sm">
                 <div
                   className="absolute left-0 top-0 h-full bg-trading-up/10"
                   style={{ width: `${(level.size / maxSize) * 40}%` }}
                 />
                 <span className="relative z-10" />
                 <span className="relative z-10 text-center text-trading-up tabular-nums">
                   {(level.price * 100).toFixed(1)}¢
                 </span>
                  <span className="relative z-10 text-center tabular-nums">{level.size.toFixed(0)}</span>
                 <span className="relative z-10 text-right text-muted-foreground tabular-nums">
                    ${(level.price * level.size).toFixed(2)}
                 </span>
               </div>
             ))}

             {/* Bids label */}
             <div className="absolute left-4 top-1/2 -translate-y-1/2">
               <span className="bg-trading-up text-white text-xs px-2 py-0.5 rounded">Bids</span>
             </div>
              </div>
            )}
 
            {/* Empty state when no bids or asks */}
            {asks.length === 0 && bids.length === 0 && !orderbookLoading && (
              <OrderbookEmpty />
            )}
              </>
            )}
         </div>
       )}
     </div>
   );
 }