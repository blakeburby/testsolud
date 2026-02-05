 import { useMemo } from 'react';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import type { TradeRecord } from '@/types/quant';
 import { cn } from '@/lib/utils';
 
 interface TradeTapeProps {
   trades: TradeRecord[];
   maxDisplay?: number;
 }
 
 function formatTime(timestamp: number): string {
   return new Date(timestamp).toLocaleTimeString('en-US', {
     hour12: false,
     hour: '2-digit',
     minute: '2-digit',
     second: '2-digit',
   });
 }
 
 function formatSize(size: number): string {
   if (size >= 1000) {
     return `${(size / 1000).toFixed(1)}K`;
   }
   return size.toFixed(1);
 }
 
 const SOURCE_COLORS: Record<string, string> = {
   kraken: 'text-blue-400',
   coinbase: 'text-indigo-400',
   binance: 'text-yellow-400',
   okx: 'text-purple-400',
 };
 
 export function TradeTape({ trades, maxDisplay = 50 }: TradeTapeProps) {
   const displayTrades = useMemo(() => {
     return trades.slice(-maxDisplay).reverse();
   }, [trades, maxDisplay]);
 
   if (trades.length === 0) {
     return (
       <div className="rounded-lg border border-border bg-card p-4">
         <h3 className="text-sm font-medium text-foreground mb-3">Time & Sales</h3>
         <div className="text-center text-muted-foreground text-sm py-8">
           Waiting for trades...
         </div>
       </div>
     );
   }
 
   return (
     <div className="rounded-lg border border-border bg-card">
       <div className="p-3 border-b border-border">
         <div className="flex items-center justify-between">
           <h3 className="text-sm font-medium text-foreground">Time & Sales</h3>
           <span className="text-xs text-muted-foreground">{trades.length} trades</span>
         </div>
       </div>
       
       {/* Header */}
       <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs text-muted-foreground border-b border-border bg-muted/30">
         <div>TIME</div>
         <div className="text-right">PRICE</div>
         <div className="text-right">SIZE</div>
         <div className="text-right">SRC</div>
       </div>
       
       <ScrollArea className="h-[240px]">
         <div className="divide-y divide-border/50">
           {displayTrades.map((trade, index) => {
             const prevTrade = displayTrades[index + 1];
             const priceChange = prevTrade ? trade.price - prevTrade.price : 0;
             
             return (
               <div
                 key={trade.id}
                 className={cn(
                   'grid grid-cols-4 gap-2 px-3 py-1.5 text-xs font-mono',
                   trade.side === 'buy' && 'bg-green-500/5',
                   trade.side === 'sell' && 'bg-red-500/5'
                 )}
               >
                 <div className="text-muted-foreground">
                   {formatTime(trade.timestamp)}
                 </div>
                 <div className={cn(
                   'text-right font-medium',
                   priceChange > 0 && 'text-green-500',
                   priceChange < 0 && 'text-red-500',
                   priceChange === 0 && 'text-foreground'
                 )}>
                   ${trade.price.toFixed(2)}
                 </div>
                 <div className={cn(
                   'text-right',
                   trade.size > 100 && 'font-semibold text-foreground',
                   trade.size <= 100 && 'text-muted-foreground'
                 )}>
                   {formatSize(trade.size)}
                 </div>
                 <div className={cn('text-right uppercase', SOURCE_COLORS[trade.source] || 'text-muted-foreground')}>
                   {trade.source.slice(0, 3)}
                 </div>
               </div>
             );
           })}
         </div>
       </ScrollArea>
     </div>
   );
 }