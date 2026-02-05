 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { ArrowUp, ArrowDown } from 'lucide-react';
 
 export function PriceToBeat() {
   const { selectedMarket, selectedDirection } = useSOLMarkets();
 
   const strikePrice = selectedMarket?.strikePrice ?? 0;
 
   return (
     <div className="flex items-center justify-center gap-4 py-4 px-6 bg-muted/50 rounded-lg">
       <div className="flex items-center gap-2">
         {selectedDirection === 'up' ? (
           <ArrowUp className="h-6 w-6 text-trading-up" />
         ) : (
           <ArrowDown className="h-6 w-6 text-trading-down" />
         )}
         <span className="text-2xl font-semibold tabular-nums">
           ${strikePrice.toFixed(2)}
         </span>
       </div>
       <span className="text-muted-foreground">Price to Beat</span>
     </div>
   );
 }