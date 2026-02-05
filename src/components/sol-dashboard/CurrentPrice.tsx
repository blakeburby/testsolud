 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { ArrowUp, ArrowDown } from 'lucide-react';
 import { cn } from '@/lib/utils';
 
 export function CurrentPrice() {
   const { currentPrice, selectedMarket } = useSOLMarkets();
 
   if (currentPrice === null) {
     return (
       <div className="text-center py-8">
         <div className="h-16 w-48 mx-auto bg-muted animate-pulse rounded-lg" />
         <p className="text-muted-foreground mt-2">Loading price...</p>
       </div>
     );
   }
 
   const strikePrice = selectedMarket?.strikePrice ?? 0;
   const isAbove = currentPrice >= strikePrice;
 
   return (
     <div className="text-center py-6">
       <div className="flex items-center justify-center gap-3">
         <span
           className={cn(
             'text-5xl md:text-6xl font-bold tabular-nums',
             isAbove ? 'text-trading-up' : 'text-trading-down'
           )}
         >
           ${currentPrice.toFixed(2)}
         </span>
         {isAbove ? (
           <ArrowUp className="h-10 w-10 text-trading-up" />
         ) : (
           <ArrowDown className="h-10 w-10 text-trading-down" />
         )}
       </div>
       <p className="text-muted-foreground mt-2">Current SOL/USD</p>
     </div>
   );
 }