 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import {
   Accordion,
   AccordionContent,
   AccordionItem,
   AccordionTrigger,
 } from '@/components/ui/accordion';
 import { cn } from '@/lib/utils';
 
 interface OrderLevel {
   price: number;
   size: number;
   side: 'bid' | 'ask';
 }
 
 export function OrderbookLadder() {
   const { selectedMarket, selectedSlot } = useSOLMarkets();
 
   // Generate mock orderbook levels based on current market prices
   const generateLevels = (): { bids: OrderLevel[]; asks: OrderLevel[] } => {
     if (!selectedMarket) {
       return { bids: [], asks: [] };
     }
 
     const baseYes = selectedMarket.yesBid ?? 0.50;
     const baseNo = selectedMarket.noBid ?? 0.50;
 
     const bids: OrderLevel[] = [];
     const asks: OrderLevel[] = [];
 
     // Generate bid levels (Trade Up)
     for (let i = 0; i < 5; i++) {
       bids.push({
         price: Math.max(0.01, baseYes - i * 0.02),
         size: Math.floor(Math.random() * 100) + 10,
         side: 'bid',
       });
     }
 
     // Generate ask levels (Trade Down)
     for (let i = 0; i < 5; i++) {
       asks.push({
         price: Math.min(0.99, baseNo + i * 0.02),
         size: Math.floor(Math.random() * 100) + 10,
         side: 'ask',
       });
     }
 
     return { bids, asks };
   };
 
   const { bids, asks } = generateLevels();
   const maxSize = Math.max(...bids.map(b => b.size), ...asks.map(a => a.size), 1);
 
   const spread = selectedMarket
     ? Math.abs((selectedMarket.yesAsk ?? 0) - (selectedMarket.yesBid ?? 0))
     : 0;
 
   if (!selectedSlot || selectedSlot.isPast) {
     return null;
   }
 
   return (
     <Accordion type="single" collapsible className="w-full">
       <AccordionItem value="orderbook" className="border-border">
         <AccordionTrigger className="text-sm font-medium">
           Orderbook Depth
         </AccordionTrigger>
         <AccordionContent>
           <div className="space-y-4">
             {/* Bids (Trade Up) */}
             <div className="space-y-1">
               <p className="text-xs font-medium text-trading-up mb-2">Trade Up (Bids)</p>
               {bids.map((level, i) => (
                 <div key={`bid-${i}`} className="relative flex items-center justify-between text-sm">
                   <div
                     className="absolute left-0 top-0 h-full bg-trading-up/20 rounded"
                     style={{ width: `${(level.size / maxSize) * 100}%` }}
                   />
                   <span className="relative z-10 tabular-nums">${level.price.toFixed(2)}</span>
                   <span className="relative z-10 text-muted-foreground tabular-nums">{level.size}</span>
                 </div>
               ))}
             </div>
 
             {/* Spread */}
             <div className="text-center py-2 border-y border-border">
               <span className="text-xs text-muted-foreground">
                 Spread: ${spread.toFixed(2)}
               </span>
             </div>
 
             {/* Asks (Trade Down) */}
             <div className="space-y-1">
               <p className="text-xs font-medium text-trading-down mb-2">Trade Down (Asks)</p>
               {asks.map((level, i) => (
                 <div key={`ask-${i}`} className="relative flex items-center justify-between text-sm">
                   <div
                     className="absolute right-0 top-0 h-full bg-trading-down/20 rounded"
                     style={{ width: `${(level.size / maxSize) * 100}%` }}
                   />
                   <span className="relative z-10 tabular-nums">${level.price.toFixed(2)}</span>
                   <span className="relative z-10 text-muted-foreground tabular-nums">{level.size}</span>
                 </div>
               ))}
             </div>
           </div>
         </AccordionContent>
       </AccordionItem>
     </Accordion>
   );
 }