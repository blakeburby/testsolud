 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { useCountdown } from '@/hooks/useCountdown';
 import { cn } from '@/lib/utils';
 import { ArrowDown } from 'lucide-react';
 
 export function PriceSection() {
   const { currentPrice, selectedMarket, selectedSlot } = useSOLMarkets();
   const countdown = useCountdown(selectedSlot?.windowEnd ?? null);
 
   const strikePrice = selectedMarket?.strikePrice ?? 0;
   const isAbove = currentPrice !== null && currentPrice >= strikePrice;
   const priceDiff = currentPrice !== null ? currentPrice - strikePrice : 0;
 
   return (
     <div className="flex items-start justify-between py-4">
       {/* Left: Price to Beat & Current Price */}
       <div className="flex items-baseline gap-8">
         <div>
           <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Price to Beat</p>
           <p className="text-3xl font-semibold text-foreground tabular-nums">
             ${strikePrice.toFixed(2)}
           </p>
         </div>
         <div>
           <div className="flex items-center gap-2">
             <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Price</p>
             {priceDiff !== 0 && (
               <span className={cn(
                 'text-xs font-medium px-1.5 py-0.5 rounded',
                 isAbove ? 'text-trading-up' : 'text-trading-down'
               )}>
                 {isAbove ? '▲' : '▼'} ${Math.abs(priceDiff).toFixed(0)}
               </span>
             )}
           </div>
           {currentPrice !== null ? (
             <p className={cn(
               'text-3xl font-semibold tabular-nums',
               isAbove ? 'text-trading-up' : 'text-trading-down'
             )}>
               ${currentPrice.toFixed(2)}
             </p>
           ) : (
             <div className="h-9 w-24 bg-muted animate-pulse rounded" />
           )}
         </div>
       </div>
 
       {/* Right: Countdown Timer */}
       <div className="text-right">
         <div className="flex items-baseline gap-1">
           <span className={cn(
             'text-4xl font-bold tabular-nums',
             countdown.urgency === 'urgent' ? 'text-trading-down' : 'text-trading-down'
           )}>
             {countdown.minutes.toString().padStart(2, '0')}
           </span>
           <span className="text-xs font-medium text-muted-foreground uppercase">Mins</span>
           <span className={cn(
             'text-4xl font-bold tabular-nums ml-2',
             countdown.urgency === 'urgent' ? 'text-trading-down' : 'text-trading-down'
           )}>
             {countdown.seconds.toString().padStart(2, '0')}
           </span>
           <span className="text-xs font-medium text-muted-foreground uppercase">Secs</span>
         </div>
       </div>
     </div>
   );
 }