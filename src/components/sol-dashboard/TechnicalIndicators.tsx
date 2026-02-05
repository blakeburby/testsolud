 import { useMemo } from 'react';
 import { TrendingUp, TrendingDown, Activity, Gauge, BarChart3 } from 'lucide-react';
 import type { QuantIndicators } from '@/types/quant';
 import { cn } from '@/lib/utils';
 
 interface TechnicalIndicatorsProps {
   indicators: QuantIndicators;
   currentPrice: number | null;
   strikePrice: number | null;
 }
 
 export function TechnicalIndicators({ indicators, currentPrice, strikePrice }: TechnicalIndicatorsProps) {
   const {
     vwap,
     momentum,
     momentumPercent,
     volatility,
     rsi,
     highPrice,
     lowPrice,
   } = indicators;
 
   const priceVsVwap = useMemo(() => {
     if (!currentPrice || !vwap) return null;
     return ((currentPrice - vwap) / vwap) * 100;
   }, [currentPrice, vwap]);
 
   const rsiColor = useMemo(() => {
     if (rsi === null) return 'text-muted-foreground';
     if (rsi >= 70) return 'text-red-500';
     if (rsi <= 30) return 'text-green-500';
     return 'text-foreground';
   }, [rsi]);
 
   const momentumColor = useMemo(() => {
     if (momentumPercent === null) return 'text-muted-foreground';
     if (momentumPercent > 0.1) return 'text-green-500';
     if (momentumPercent < -0.1) return 'text-red-500';
     return 'text-foreground';
   }, [momentumPercent]);
 
   return (
     <div className="rounded-lg border border-border bg-card p-4">
       <div className="flex items-center gap-2 mb-3">
         <Activity className="h-4 w-4 text-primary" />
         <h3 className="text-sm font-medium text-foreground">Technical Indicators</h3>
       </div>
       
       <div className="grid grid-cols-2 gap-3">
         {/* VWAP */}
         <div className="space-y-1">
           <div className="flex items-center gap-1.5">
             <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
             <span className="text-xs text-muted-foreground">VWAP</span>
           </div>
           <div className="flex items-baseline gap-1">
             <span className="text-base font-mono font-semibold text-foreground">
               {vwap ? `$${vwap.toFixed(2)}` : '--'}
             </span>
             {priceVsVwap !== null && (
               <span className={cn(
                 'text-xs font-mono',
                 priceVsVwap > 0 ? 'text-green-500' : 'text-red-500'
               )}>
                 {priceVsVwap > 0 ? '+' : ''}{priceVsVwap.toFixed(2)}%
               </span>
             )}
           </div>
         </div>
 
         {/* Momentum */}
         <div className="space-y-1">
           <div className="flex items-center gap-1.5">
             {momentum !== null && momentum > 0 ? (
               <TrendingUp className="h-3.5 w-3.5 text-green-500" />
             ) : (
               <TrendingDown className="h-3.5 w-3.5 text-red-500" />
             )}
             <span className="text-xs text-muted-foreground">Momentum (30s)</span>
           </div>
           <div className={cn('text-base font-mono font-semibold', momentumColor)}>
             {momentumPercent !== null ? (
               `${momentumPercent > 0 ? '+' : ''}${momentumPercent.toFixed(3)}%`
             ) : '--'}
           </div>
         </div>
 
         {/* Volatility */}
         <div className="space-y-1">
           <div className="flex items-center gap-1.5">
             <Activity className="h-3.5 w-3.5 text-muted-foreground" />
             <span className="text-xs text-muted-foreground">Volatility (1m)</span>
           </div>
           <div className="text-base font-mono font-semibold text-foreground">
             {volatility !== null ? `${volatility.toFixed(3)}%` : '--'}
           </div>
         </div>
 
         {/* RSI */}
         <div className="space-y-1">
           <div className="flex items-center gap-1.5">
             <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
             <span className="text-xs text-muted-foreground">RSI (14)</span>
           </div>
           <div className={cn('text-base font-mono font-semibold', rsiColor)}>
             {rsi !== null ? rsi.toFixed(1) : '--'}
             {rsi !== null && (
               <span className="text-xs ml-1 text-muted-foreground">
                 {rsi >= 70 ? '(OB)' : rsi <= 30 ? '(OS)' : ''}
               </span>
             )}
           </div>
         </div>
 
         {/* High/Low */}
         <div className="col-span-2 pt-2 border-t border-border">
           <div className="flex justify-between text-xs">
             <div>
               <span className="text-muted-foreground">Low: </span>
               <span className="font-mono text-red-500">
                 {lowPrice ? `$${lowPrice.toFixed(2)}` : '--'}
               </span>
             </div>
             <div>
               <span className="text-muted-foreground">High: </span>
               <span className="font-mono text-green-500">
                 {highPrice ? `$${highPrice.toFixed(2)}` : '--'}
               </span>
             </div>
           </div>
         </div>
       </div>
     </div>
   );
 }