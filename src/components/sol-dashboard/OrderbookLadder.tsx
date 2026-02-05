 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { useState } from 'react';
 import { cn } from '@/lib/utils';
 import { ChevronUp, RefreshCw } from 'lucide-react';
 
 interface OrderLevel {
   price: number;
   size: number;
   total: number;
   side: 'bid' | 'ask';
 }
 
 export function OrderbookLadder() {
   const { selectedMarket, selectedSlot } = useSOLMarkets();
   const [isOpen, setIsOpen] = useState(true);
   const [activeTab, setActiveTab] = useState<'up' | 'down'>('up');
 
   // Generate mock orderbook levels based on current market prices
   const generateLevels = (): { bids: OrderLevel[]; asks: OrderLevel[]; volume: number } => {
     if (!selectedMarket) {
       return { bids: [], asks: [], volume: 0 };
     }
 
     const basePrice = 0.02; // Starting from 2 cents like Kalshi
 
     const bids: OrderLevel[] = [];
     const asks: OrderLevel[] = [];
     let totalVolume = 0;
 
     // Generate ask levels (prices going up)
     for (let i = 0; i < 5; i++) {
       const size = Math.floor(Math.random() * 400) + 50;
       const price = (5 - i) * 0.01; // 5¢, 4¢, 3¢, 2.5¢, 2¢
       const total = size * price;
       totalVolume += total;
       asks.push({
         price: Math.max(0.02, price),
         size,
         total,
         side: 'ask',
       });
     }
 
     // Generate bid levels (prices going down)
     for (let i = 0; i < 3; i++) {
       const size = Math.floor(Math.random() * 3000) + 100;
       const price = (i === 0 ? 0.01 : i === 1 ? 0.003 : 0.002);
       const total = size * price;
       totalVolume += total;
       bids.push({
         price,
         size,
         total,
         side: 'bid',
       });
     }
 
     return { bids, asks, volume: totalVolume };
   };
 
   const { bids, asks, volume } = generateLevels();
   const maxSize = Math.max(...bids.map(b => b.size), ...asks.map(a => a.size), 1);
 
   const lastPrice = 0.02;
   const spread = 0.01;
 
   if (!selectedSlot || selectedSlot.isPast) {
     return null;
   }
 
   return (
     <div className="border border-border rounded-lg mt-4">
       {/* Header */}
       <button 
         onClick={() => setIsOpen(!isOpen)}
         className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
       >
         <span className="font-semibold text-foreground">Order Book</span>
         <div className="flex items-center gap-2">
           <span className="text-sm text-muted-foreground">${(volume / 1000).toFixed(1)}k Vol.</span>
           <ChevronUp className={cn(
             "h-5 w-5 text-muted-foreground transition-transform",
             !isOpen && "rotate-180"
           )} />
         </div>
       </button>
 
       {isOpen && (
         <div className="border-t border-border">
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
             <span className="flex items-center gap-1">Trade Up <span className="text-xs">⇅</span></span>
             <span className="text-center">Price</span>
             <span className="text-center">Shares</span>
             <span className="text-right">Total</span>
           </div>

           {/* Asks (red/sell side) */}
           <div className="relative">
               {asks.map((level, i) => (
               <div key={`ask-${i}`} className="relative grid grid-cols-4 px-4 py-2 text-sm">
                   <div
                   className="absolute left-0 top-0 h-full bg-trading-down/10"
                   style={{ width: `${(level.size / maxSize) * 40}%` }}
                   />
                 <span className="relative z-10" />
                 <span className="relative z-10 text-center text-trading-down tabular-nums">
                   {(level.price * 100).toFixed(1)}¢
                 </span>
                 <span className="relative z-10 text-center tabular-nums">{level.size.toFixed(2)}</span>
                 <span className="relative z-10 text-right text-muted-foreground tabular-nums">
                   ${level.total.toFixed(2)}
                 </span>
                 </div>
               ))}

             {/* Asks label */}
             <div className="absolute left-4 top-1/2 -translate-y-1/2">
               <span className="bg-trading-down text-white text-xs px-2 py-0.5 rounded">Asks</span>
             </div>
           </div>

           {/* Spread row */}
           <div className="grid grid-cols-2 px-4 py-2 border-y border-border text-sm">
             <span className="text-muted-foreground">Last: {(lastPrice * 100).toFixed(1)}¢</span>
             <span className="text-right text-muted-foreground">Spread: {(spread * 100).toFixed(1)}¢</span>
           </div>

           {/* Bids (green/buy side) */}
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
                 <span className="relative z-10 text-center tabular-nums">{level.size.toFixed(2)}</span>
                 <span className="relative z-10 text-right text-muted-foreground tabular-nums">
                   ${level.total.toFixed(2)}
                 </span>
               </div>
             ))}

             {/* Bids label */}
             <div className="absolute left-4 top-1/2 -translate-y-1/2">
               <span className="bg-trading-up text-white text-xs px-2 py-0.5 rounded">Bids</span>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 }