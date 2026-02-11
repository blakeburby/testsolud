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

  const chartData = useMemo(() => {
    if (!selectedSlot) return [];
    const now = Date.now();
    const windowStart = selectedSlot.windowStart.getTime();
    const windowEnd = Math.max(selectedSlot.windowEnd.getTime(), now + 60000);
    const windowPrices = priceHistory.filter(
      k => k.time >= windowStart && k.time <= windowEnd
    );
    return windowPrices
      .sort((a, b) => a.time - b.time)
      .map(k => ({
        time: k.time,
        price: k.close,
        label: format(new Date(k.time), 'h:mm:ss'),
      }));
  }, [priceHistory, selectedSlot]);

  const { minPrice, maxPrice } = useMemo(() => {
    const prices = chartData.map(d => d.price);
    if (prices.length === 0) {
      return { minPrice: strikePrice * 0.995, maxPrice: strikePrice * 1.005 };
    }
    const min = Math.min(...prices, strikePrice);
    const max = Math.max(...prices, strikePrice);
    const padding = (max - min) * 0.1 || strikePrice * 0.005;
    return { minPrice: min - padding, maxPrice: max + padding };
  }, [chartData, strikePrice]);

  if (chartData.length === 0) {
    return (
      <div className="h-[240px] flex items-center justify-center bg-muted/10 border border-border rounded-sm">
        <p className="text-muted-foreground text-xs">Waiting for price data...</p>
      </div>
    );
  }

  const latestPrice = chartData[chartData.length - 1]?.price ?? currentPrice ?? 0;
  const isAboveStrike = latestPrice >= strikePrice;

  return (
    <div className="h-[240px] w-full relative terminal-panel p-0">
      {selectedSlot && (
        <div className="absolute top-1 left-2 z-10 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
          <span>{format(selectedSlot.windowStart, 'h:mm a')}</span>
          <span>→</span>
          <span>{format(selectedSlot.windowEnd, 'h:mm a')}</span>
        </div>
      )}

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 60, left: 10, bottom: 15 }}>
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
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
            interval="preserveStartEnd"
            minTickGap={80}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
            tickFormatter={(v) => `$${v.toFixed(2)}`}
            width={55}
            orientation="right"
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '2px',
              padding: '4px 8px',
              fontSize: '10px',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}
            formatter={(value: number) => [`$${value.toFixed(4)}`, 'SOL/USD']}
          />
          {strikePrice > 0 && (
            <ReferenceLine
              y={strikePrice}
              stroke="hsl(var(--target-line))"
              strokeDasharray="8 4"
              strokeWidth={1}
              label={{
                value: 'K',
                position: 'left',
                fill: 'hsl(var(--target-line))',
                fontSize: 9,
                fontWeight: 600,
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="price"
            stroke={isAboveStrike ? 'hsl(var(--trading-up))' : 'hsl(var(--trading-down))'}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: isAboveStrike ? 'hsl(var(--trading-up))' : 'hsl(var(--trading-down))' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="absolute bottom-1 right-2 flex items-center gap-1 text-[10px] font-mono">
        <span className={cn("h-1.5 w-1.5 rounded-sm", wsConnected ? "bg-trading-up" : "bg-destructive")} />
        <span className={cn(wsConnected ? "text-trading-up" : "text-destructive")}>
          {wsConnected ? "LIVE" : "OFF"}
        </span>
      </div>
    </div>
  );
}
