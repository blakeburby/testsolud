 import { cn } from '@/lib/utils';
 import { ArrowUp, ArrowDown } from 'lucide-react';
 
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
   const spreadPercent = midPrice !== null && spread !== null && midPrice > 0
     ? (spread / midPrice) * 100
     : null;
 
   const priceDirection = previousMid !== null && midPrice !== null
     ? midPrice > previousMid ? 'up' : midPrice < previousMid ? 'down' : null
     : null;
 
   if (midPrice === null) {
     return (
       <div className="flex items-center justify-center py-4 border-y border-border bg-muted/30">
         <span className="text-muted-foreground text-sm">No market data</span>
       </div>
     );
   }
 
   return (
     <div className="flex items-center justify-between px-4 py-3 border-y border-border bg-muted/30">
       {/* Mid Price */}
       <div className="flex items-center gap-2">
         <span className="text-2xl font-bold tabular-nums text-foreground">
           {(midPrice * 100).toFixed(1)}¢
         </span>
         {priceDirection && (
           <div className={cn(
             'flex items-center justify-center w-6 h-6 rounded-full',
             priceDirection === 'up' ? 'bg-trading-up/20 text-trading-up' : 'bg-trading-down/20 text-trading-down'
           )}>
             {priceDirection === 'up' ? (
               <ArrowUp className="w-4 h-4" />
             ) : (
               <ArrowDown className="w-4 h-4" />
             )}
           </div>
         )}
       </div>
 
       {/* Spread Info */}
       <div className="flex flex-col items-end">
         <div className="flex items-center gap-2 text-sm">
           <span className="text-muted-foreground">Spread</span>
           <span className="font-medium tabular-nums text-foreground">
             {spreadCents !== null ? `${spreadCents.toFixed(1)}¢` : '—'}
           </span>
         </div>
         {spreadPercent !== null && (
           <span className="text-xs text-muted-foreground tabular-nums">
             {spreadPercent.toFixed(2)}%
           </span>
         )}
       </div>
     </div>
   );
 }