 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { Button } from '@/components/ui/button';
 import { cn } from '@/lib/utils';
 
 export function TradingButtons() {
   const { selectedMarket, selectedSlot, selectDirection, selectedDirection } = useSOLMarkets();
 
   const strikePrice = selectedMarket?.strikePrice ?? 0;
   const isMarketClosed = selectedSlot?.isPast || !selectedSlot;
 
   // Yes = price will be at or above strike (Trade Up)
   // No = price will be below strike (Trade Down)
   const yesPrice = selectedMarket?.yesAsk ?? selectedMarket?.yesPrice ?? 0.05;
   const noPrice = selectedMarket?.noAsk ?? (1 - (selectedMarket?.yesPrice ?? 0.05));
 
   // Calculate chance percentage (market probability)
   const chancePercent = Math.round((yesPrice ?? 0.5) * 100);
 
   return (
     <div className="border-t border-border pt-4">
       {/* LIVE indicator */}
       <div className="flex justify-end mb-3">
         <span className="text-sm font-semibold text-foreground">LIVE</span>
       </div>
 
       {/* Chance row */}
       <div className="flex items-center justify-between py-3 border-t border-border">
         <div className="flex items-center gap-3">
           <span className="text-muted-foreground text-sm">Price to beat: ${strikePrice.toFixed(4)}</span>
         </div>
         
         <div className="flex items-center gap-6">
           {/* Chance */}
           <div className="flex items-center gap-2">
             <span className="text-muted-foreground text-sm">Chance</span>
             <span className="text-2xl font-bold text-foreground">{chancePercent}%</span>
             <span className="text-trading-down text-sm">▼ 7</span>
           </div>
 
           {/* Yes/No buttons - Kalshi style */}
           <div className="flex items-center gap-3">
             <Button
               variant="outline"
               onClick={() => selectDirection('up')}
               disabled={isMarketClosed}
               className={cn(
                 'rounded-full px-6 py-2 h-auto font-semibold border-2',
                 selectedDirection === 'up'
                   ? 'border-trading-up bg-trading-up/10 text-trading-up'
                   : 'border-border hover:border-trading-up/50 text-foreground'
               )}
             >
               Yes {Math.round((yesPrice ?? 0) * 100)}¢
             </Button>
 
             <Button
               onClick={() => selectDirection('down')}
               disabled={isMarketClosed}
               className={cn(
                 'rounded-full px-6 py-2 h-auto font-semibold',
                 selectedDirection === 'down'
                   ? 'bg-trading-down hover:bg-trading-down/90 text-white'
                   : 'bg-trading-down/90 hover:bg-trading-down text-white'
               )}
             >
               No {Math.round((noPrice ?? 0) * 100)}¢
             </Button>
           </div>
         </div>
       </div>
     </div>
   );
 }