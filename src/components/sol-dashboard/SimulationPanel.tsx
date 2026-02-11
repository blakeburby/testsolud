import { useSharedQuantEngine } from '@/contexts/QuantEngineContext';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ReferenceLine, Tooltip } from 'recharts';

export function SimulationPanel() {
  const quant = useSharedQuantEngine();
  const histogram = quant.simulation?.histogram ?? [];

  return (
    <div className="terminal-panel space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Simulation</span>
        <div className="flex items-center gap-2">
          {quant.simulation && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {quant.simulation.executionMs.toFixed(0)}ms · {(quant.simulation.numPaths / 1000).toFixed(0)}K
            </span>
          )}
          <button
            onClick={quant.toggleSimMode}
            className={cn(
              "text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-sm border",
              quant.simMode === 'monte-carlo'
                ? "border-[hsl(var(--gold)/0.3)] text-[hsl(var(--gold))]"
                : "border-border text-muted-foreground"
            )}
          >
            {quant.simMode === 'monte-carlo' ? 'MC' : 'CF'}
          </button>
        </div>
      </div>

      {/* Hero probability readout */}
      <div className="flex items-baseline justify-between py-1.5 border-y border-border">
        <div>
          <span className="text-[10px] text-muted-foreground uppercase">P(Up)</span>
          <p className="text-xl font-mono font-bold tabular-nums text-trading-up">
            {(quant.pTrue * 100).toFixed(2)}%
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground uppercase">P(Down)</span>
          <p className="text-xl font-mono font-bold tabular-nums text-trading-down">
            {((1 - quant.pTrue) * 100).toFixed(2)}%
          </p>
        </div>
      </div>

      {histogram.length > 0 ? (
        <div className="h-[140px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <XAxis
                dataKey="binCenter"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                tickFormatter={(v) => `$${v.toFixed(2)}`}
                interval="preserveStartEnd"
                minTickGap={60}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '2px',
                  padding: '4px 8px',
                  fontSize: '10px',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'count') return [value.toLocaleString(), 'Paths'];
                  return [value.toFixed(6), 'Density'];
                }}
                labelFormatter={(v) => `$${Number(v).toFixed(4)}`}
              />
              {quant.simulation && (
                <ReferenceLine
                  x={quant.simulation.mean}
                  stroke="hsl(var(--gold))"
                  strokeWidth={1}
                />
              )}
              <Bar
                dataKey="count"
                fill="hsl(var(--gold) / 0.4)"
                radius={0}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[140px] flex items-center justify-center text-muted-foreground text-xs">
          {quant.isReady ? 'No simulation data' : 'Waiting for data...'}
        </div>
      )}

      <div className="text-[10px] font-mono text-muted-foreground text-center">
        {quant.simMode === 'monte-carlo' ? 'Monte Carlo' : 'Black-Scholes'}
      </div>
    </div>
  );
}
