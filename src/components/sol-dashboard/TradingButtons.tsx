 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { Button } from '@/components/ui/button';
 import { ArrowUp, ArrowDown } from 'lucide-react';
 import { cn } from '@/lib/utils';
 
 export function TradingButtons() {
   const { selectedMarket, selectedSlot, selectDirection, selectedDirection } = useSOLMarkets();
 
   const upMarket = selectedSlot?.markets.find(m => m.direction === 'up');
   const downMarket = selectedSlot?.markets.find(m => m.direction === 'down');
 
   const strikePrice = selectedMarket?.strikePrice ?? 0;
   const isMarketClosed = selectedSlot?.isPast || !selectedSlot;
 
   const yesPrice = upMarket?.yesAsk ?? upMarket?.yesPrice;
   const noPrice = downMarket?.yesAsk ?? downMarket?.yesPrice;
 
   return (
     <div className="grid grid-cols-2 gap-4 py-4">
       <Button
         variant="outline"
         size="lg"
         onClick={() => selectDirection('up')}
         disabled={isMarketClosed}
         className={cn(
           'h-auto flex-col gap-2 py-4 border-2',
           selectedDirection === 'up'
             ? 'border-trading-up bg-trading-up/10'
             : 'border-border hover:border-trading-up/50'
         )}
       >
         <div className="flex items-center gap-2 text-trading-up">
           <ArrowUp className="h-5 w-5" />
           <span className="font-semibold">YES</span>
         </div>
         <span className="text-sm text-muted-foreground">
           Price will be ABOVE ${strikePrice.toFixed(2)}
         </span>
         {yesPrice !== null && yesPrice !== undefined && (
           <span className="text-lg font-bold text-trading-up">
             ${yesPrice.toFixed(2)}
           </span>
         )}
       </Button>
 
       <Button
         variant="outline"
         size="lg"
         onClick={() => selectDirection('down')}
         disabled={isMarketClosed}
         className={cn(
           'h-auto flex-col gap-2 py-4 border-2',
           selectedDirection === 'down'
             ? 'border-trading-down bg-trading-down/10'
             : 'border-border hover:border-trading-down/50'
         )}
       >
         <div className="flex items-center gap-2 text-trading-down">
           <ArrowDown className="h-5 w-5" />
           <span className="font-semibold">NO</span>
         </div>
         <span className="text-sm text-muted-foreground">
           Price will be BELOW ${strikePrice.toFixed(2)}
         </span>
         {noPrice !== null && noPrice !== undefined && (
           <span className="text-lg font-bold text-trading-down">
             ${noPrice.toFixed(2)}
           </span>
         )}
       </Button>
     </div>
   );
 }