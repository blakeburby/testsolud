import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { cn } from '@/lib/utils';
 import {
   ResponsiveContainer,
   LineChart,
   Line,
   XAxis,
   YAxis,
   ReferenceLine,
   Tooltip,
   CartesianGrid,
 } from 'recharts';
 import { format } from 'date-fns';
 import { useMemo } from 'react';
 
 export function PriceChart() {
  const { priceHistory, selectedMarket, selectedSlot, currentPrice, wsConnected } = useSOLMarkets();
 
   const strikePrice = selectedMarket?.strikePrice ?? 0;
 
   // Filter to contract window and format data
   const chartData = useMemo(() => {
     if (!selectedSlot) return [];
     
    const now = Date.now();
     const windowStart = selectedSlot.windowStart.getTime();
    // Always include current time to show live data
    const windowEnd = Math.max(selectedSlot.windowEnd.getTime(), now + 60000);
     
     // Filter prices to current contract window
     const windowPrices = priceHistory.filter(
       k => k.time >= windowStart && k.time <= windowEnd
     );
     
    console.log(`[Chart] ${windowPrices.length} points in window, ${priceHistory.length} total`);
    
     // Sort by time and format
     return windowPrices
       .sort((a, b) => a.time - b.time)
       .map(k => ({
         time: k.time,
         price: k.close,
         label: format(new Date(k.time), 'h:mm:ss'),
       }));
   }, [priceHistory, selectedSlot]);
 
   // Calculate Y-axis domain
   const { minPrice, maxPrice } = useMemo(() => {
     const prices = chartData.map(d => d.price);
     if (prices.length === 0) {
       return {
         minPrice: strikePrice * 0.995,
         maxPrice: strikePrice * 1.005,
       };
     }
     const min = Math.min(...prices, strikePrice);
     const max = Math.max(...prices, strikePrice);
     const padding = (max - min) * 0.1 || strikePrice * 0.005;
     return {
       minPrice: min - padding,
       maxPrice: max + padding,
     };
   }, [chartData, strikePrice]);
 
   // Loading state
   if (chartData.length === 0) {
     return (
       <div className="h-[280px] flex items-center justify-center bg-muted/10 rounded-lg border border-border">
         <div className="flex flex-col items-center gap-2">
           <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
           <p className="text-muted-foreground text-sm">Waiting for price data...</p>
         </div>
       </div>
     );
   }
 
   // Determine if price is above or below strike
   const latestPrice = chartData[chartData.length - 1]?.price ?? currentPrice ?? 0;
   const isAboveStrike = latestPrice >= strikePrice;
 
   return (
     <div className="h-[280px] w-full relative">
       {/* Contract window indicator */}
       {selectedSlot && (
         <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-xs text-muted-foreground">
           <span>{format(selectedSlot.windowStart, 'h:mm a')}</span>
           <span>→</span>
           <span>{format(selectedSlot.windowEnd, 'h:mm a')}</span>
         </div>
       )}
       
       {/* Target price badge */}
       {strikePrice > 0 && (
         <div 
           className="absolute right-16 z-10 bg-target-line/20 text-target-line text-xs px-2 py-1 rounded border border-target-line/30"
           style={{ 
             top: `${Math.max(15, Math.min(85, ((maxPrice - strikePrice) / (maxPrice - minPrice)) * 100))}%`,
             transform: 'translateY(-50%)',
           }}
         >
           ${strikePrice.toFixed(2)}
         </div>
       )}
       
       <ResponsiveContainer width="100%" height="100%">
         <LineChart data={chartData} margin={{ top: 30, right: 70, left: 10, bottom: 20 }}>
           <CartesianGrid 
             strokeDasharray="3 3" 
             stroke="hsl(var(--border))" 
             opacity={0.3}
             horizontal={true}
             vertical={false}
           />
           <XAxis
             dataKey="label"
             axisLine={false}
             tickLine={false}
             tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
             interval="preserveStartEnd"
             minTickGap={80}
           />
           <YAxis
             domain={[minPrice, maxPrice]}
             axisLine={false}
             tickLine={false}
             tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
             tickFormatter={(v) => `$${v.toFixed(2)}`}
             width={60}
             orientation="right"
           />
           <Tooltip
             contentStyle={{
               background: 'hsl(var(--popover))',
               border: '1px solid hsl(var(--border))',
               borderRadius: '8px',
               boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
               padding: '8px 12px',
             }}
             labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}
             formatter={(value: number) => [`$${value.toFixed(4)}`, 'SOL/USD']}
           />
           
           {/* Strike price reference line */}
           {strikePrice > 0 && (
             <ReferenceLine
               y={strikePrice}
               stroke="hsl(var(--target-line))"
               strokeDasharray="8 4"
               strokeWidth={2}
               label={{
                 value: 'TARGET',
                 position: 'left',
                 fill: 'hsl(var(--target-line))',
                 fontSize: 10,
                 fontWeight: 600,
               }}
             />
           )}
           
           {/* Price line - color based on position relative to strike */}
           <Line
             type="monotone"
             dataKey="price"
             stroke={isAboveStrike ? 'hsl(var(--trading-up))' : 'hsl(var(--trading-down))'}
             strokeWidth={2.5}
             dot={false}
             activeDot={{ 
               r: 6, 
               fill: isAboveStrike ? 'hsl(var(--trading-up))' : 'hsl(var(--trading-down))',
               stroke: 'hsl(var(--background))',
               strokeWidth: 2,
             }}
             isAnimationActive={false}
           />
         </LineChart>
       </ResponsiveContainer>
       
        {/* WebSocket connection status */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs">
          <span className={cn(
            "h-2 w-2 rounded-full",
            wsConnected ? "bg-trading-up animate-pulse" : "bg-destructive"
          )} />
          <span className={cn(
            "font-medium",
            wsConnected ? "text-trading-up" : "text-destructive"
          )}>
            {wsConnected ? "LIVE" : "Disconnected"}
          </span>
        </div>
     </div>
   );
 }