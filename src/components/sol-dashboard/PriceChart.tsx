 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import {
   ResponsiveContainer,
   LineChart,
   Line,
   XAxis,
   YAxis,
   ReferenceLine,
   Tooltip,
   CartesianGrid,
   ReferenceArea,
 } from 'recharts';
 import { format } from 'date-fns';
 
 export function PriceChart() {
   const { priceHistory, selectedMarket, currentPrice } = useSOLMarkets();
 
   const strikePrice = selectedMarket?.strikePrice ?? 0;
 
   const chartData = priceHistory.map(k => ({
     time: k.time,
     price: k.close,
     label: format(new Date(k.time), 'h:mm:ss a'),
   }));
 
   // Add current price as the latest point
   if (currentPrice && chartData.length > 0) {
     chartData.push({
       time: Date.now(),
       price: currentPrice,
       label: format(new Date(), 'h:mm:ss a'),
     });
   }
 
   const prices = chartData.map(d => d.price);
   const minPrice = prices.length > 0 ? Math.min(...prices, strikePrice) * 0.998 : strikePrice * 0.99;
   const maxPrice = prices.length > 0 ? Math.max(...prices, strikePrice) * 1.002 : strikePrice * 1.01;
 
   if (chartData.length === 0) {
     return (
       <div className="h-[280px] flex items-center justify-center bg-muted/10 rounded-lg border border-border">
         <p className="text-muted-foreground">Loading chart data...</p>
       </div>
     );
   }
 
   return (
     <div className="h-[280px] w-full relative">
       {/* Target price label */}
       {strikePrice > 0 && (
         <div 
           className="absolute right-16 z-10 bg-muted text-foreground text-xs px-2 py-1 rounded"
           style={{ 
             top: `${Math.max(10, Math.min(90, ((maxPrice - strikePrice) / (maxPrice - minPrice)) * 100 - 5))}%` 
           }}
         >
           Target ▲
         </div>
       )}
       <ResponsiveContainer width="100%" height="100%">
         <LineChart data={chartData} margin={{ top: 20, right: 60, left: 10, bottom: 20 }}>
           <CartesianGrid 
             strokeDasharray="2 2" 
             stroke="hsl(var(--border))" 
             opacity={0.5}
             horizontal={true}
             vertical={false}
           />
           <XAxis
             dataKey="label"
             axisLine={false}
             tickLine={false}
             tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
             interval="preserveStartEnd"
             minTickGap={60}
           />
           <YAxis
             domain={[minPrice, maxPrice]}
             axisLine={false}
             tickLine={false}
             tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
             tickFormatter={(v) => `$${v.toFixed(2)}`}
             width={65}
             orientation="right"
           />
           <Tooltip
             contentStyle={{
               background: 'hsl(var(--background))',
               border: '1px solid hsl(var(--border))',
               borderRadius: '6px',
               boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
             }}
             labelStyle={{ color: 'hsl(var(--foreground))' }}
             formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
           />
           {strikePrice > 0 && (
             <ReferenceLine
               y={strikePrice}
               stroke="hsl(var(--target-line))"
               strokeDasharray="6 4"
               strokeWidth={2}
             />
           )}
           <Line
             type="monotone"
             dataKey="price"
             stroke="hsl(var(--chart-line))"
             strokeWidth={2}
             dot={false}
             activeDot={{ r: 5, fill: 'hsl(var(--chart-line))' }}
           />
         </LineChart>
       </ResponsiveContainer>
     </div>
   );
 }