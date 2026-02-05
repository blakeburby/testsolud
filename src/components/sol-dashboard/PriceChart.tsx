 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import {
   ResponsiveContainer,
   AreaChart,
   Area,
   XAxis,
   YAxis,
   ReferenceLine,
   Tooltip,
 } from 'recharts';
 import { format } from 'date-fns';
 
 export function PriceChart() {
   const { priceHistory, selectedMarket, currentPrice } = useSOLMarkets();
 
   const strikePrice = selectedMarket?.strikePrice ?? 0;
 
   const chartData = priceHistory.map(k => ({
     time: k.time,
     price: k.close,
     label: format(new Date(k.time), 'HH:mm'),
   }));
 
   // Add current price as the latest point
   if (currentPrice && chartData.length > 0) {
     chartData.push({
       time: Date.now(),
       price: currentPrice,
       label: 'Now',
     });
   }
 
   const prices = chartData.map(d => d.price);
   const minPrice = Math.min(...prices, strikePrice) * 0.998;
   const maxPrice = Math.max(...prices, strikePrice) * 1.002;
 
   if (chartData.length === 0) {
     return (
       <div className="h-[200px] flex items-center justify-center bg-muted/30 rounded-lg">
         <p className="text-muted-foreground">Loading chart data...</p>
       </div>
     );
   }
 
   return (
     <div className="h-[200px] w-full">
       <ResponsiveContainer width="100%" height="100%">
         <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
           <defs>
             <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
               <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
               <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
             </linearGradient>
           </defs>
           <XAxis
             dataKey="label"
             axisLine={false}
             tickLine={false}
             tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
           />
           <YAxis
             domain={[minPrice, maxPrice]}
             axisLine={false}
             tickLine={false}
             tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
             tickFormatter={(v) => `$${v.toFixed(0)}`}
             width={50}
           />
           <Tooltip
             contentStyle={{
               background: 'hsl(var(--background))',
               border: '1px solid hsl(var(--border))',
               borderRadius: '6px',
             }}
             labelStyle={{ color: 'hsl(var(--foreground))' }}
             formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
           />
           {strikePrice > 0 && (
             <ReferenceLine
               y={strikePrice}
               stroke="hsl(var(--muted-foreground))"
               strokeDasharray="5 5"
               label={{
                 value: `Target: $${strikePrice.toFixed(2)}`,
                 position: 'right',
                 fill: 'hsl(var(--muted-foreground))',
                 fontSize: 12,
               }}
             />
           )}
           <Area
             type="monotone"
             dataKey="price"
             stroke="hsl(var(--chart-1))"
             strokeWidth={2}
             fill="url(#priceGradient)"
           />
         </AreaChart>
       </ResponsiveContainer>
     </div>
   );
 }