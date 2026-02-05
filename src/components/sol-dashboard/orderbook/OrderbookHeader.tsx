 import { cn } from '@/lib/utils';
 import { ChevronUp, Loader2, Activity } from 'lucide-react';
 import type { OrderbookLevel } from '@/types/sol-markets';
 
 interface OrderbookHeaderProps {
   isOpen: boolean;
   onToggle: () => void;
   isLoading: boolean;
   isSynthetic: boolean;
   totalBidDepth: number;
   totalAskDepth: number;
   isLive: boolean;
 }
 
 export function OrderbookHeader({
   isOpen,
   onToggle,
   isLoading,
   isSynthetic,
   totalBidDepth,
   totalAskDepth,
   isLive,
 }: OrderbookHeaderProps) {
   const totalDepth = totalBidDepth + totalAskDepth;
   const bidRatio = totalDepth > 0 ? (totalBidDepth / totalDepth) * 100 : 50;
 
   return (
     <button
       onClick={onToggle}
       className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
     >
       <div className="flex items-center gap-3">
         <span className="font-semibold text-foreground">Order Book</span>
         
         {/* Live indicator */}
         {isLive && !isSynthetic && (
           <div className="flex items-center gap-1 text-trading-up">
             <Activity className="h-3 w-3 animate-pulse" />
             <span className="text-xs font-medium">Live</span>
           </div>
         )}
       </div>
 
       <div className="flex items-center gap-4">
         {/* Depth summary */}
         {!isSynthetic && totalDepth > 0 && (
           <div className="hidden sm:flex items-center gap-2">
             <span className="text-xs text-trading-up tabular-nums">
               ${totalBidDepth.toFixed(0)}
             </span>
             
             {/* Imbalance bar */}
             <div className="w-16 h-2 rounded-full bg-muted overflow-hidden flex">
               <div 
                 className="h-full bg-trading-up transition-all duration-300"
                 style={{ width: `${bidRatio}%` }}
               />
               <div 
                 className="h-full bg-trading-down transition-all duration-300"
                 style={{ width: `${100 - bidRatio}%` }}
               />
             </div>
             
             <span className="text-xs text-trading-down tabular-nums">
               ${totalAskDepth.toFixed(0)}
             </span>
           </div>
         )}
 
         {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
 
         {isSynthetic && (
           <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
             Demo
           </span>
         )}
 
         <ChevronUp className={cn(
           'h-5 w-5 text-muted-foreground transition-transform',
           !isOpen && 'rotate-180'
         )} />
       </div>
     </button>
   );
 }
 
 // Helper to calculate total depth from levels
 export function calculateDepth(levels: OrderbookLevel[]): number {
   return levels.reduce((sum, level) => {
     const size = typeof level.size === 'number' ? level.size : parseFloat(String(level.size)) || 0;
     return sum + level.price * size;
   }, 0);
 }