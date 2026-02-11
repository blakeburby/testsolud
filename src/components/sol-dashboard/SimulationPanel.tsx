import { useQuantEngine } from '@/hooks/useQuantEngine';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ReferenceLine, Tooltip, AreaChart, Area } from 'recharts';
import { Cpu, Zap } from 'lucide-react';

export function SimulationPanel() {
  const quant = useQuantEngine();
  const histogram = quant.simulation?.histogram ?? [];
  const strikePrice = 0; // will overlay on chart

  const toggleMode = () => {
    if ((window as any).__quantToggleSimMode) {
      (window as any).__quantToggleSimMode();
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[hsl(var(--gold))]" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Simulation</h3>
        </div>
        <div className="flex items-center gap-2">
          {quant.simulation && (
            <span className="text-xs text-muted-foreground font-mono">
              {quant.simulation.executionMs.toFixed(0)}ms · {(quant.simulation.numPaths / 1000).toFixed(0)}K paths
            </span>
          )}
          <button
            onClick={toggleMode}
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border transition-colors",
              quant.simMode === 'monte-carlo'
                ? "border-[hsl(var(--gold)/0.3)] text-[hsl(var(--gold))] bg-[hsl(var(--gold)/0.05)]"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="h-3 w-3" />
            {quant.simMode === 'monte-carlo' ? 'MC' : 'CF'}
          </button>
        </div>
      </div>

      {/* Terminal price histogram */}
      {histogram.length > 0 ? (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
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
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '11px',
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
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                />
              )}
              <Bar
                dataKey="count"
                fill="hsl(var(--gold) / 0.4)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          {quant.isReady ? 'No simulation data' : 'Waiting for data...'}
        </div>
      )}

      {/* Probability summary */}
      <div className="grid grid-cols-3 gap-3 text-center pt-2 border-t border-border">
        <div>
          <p className="text-xs text-muted-foreground">P(Up)</p>
          <p className="text-lg font-bold text-trading-up tabular-nums">{(quant.pTrue * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">P(Down)</p>
          <p className="text-lg font-bold text-trading-down tabular-nums">{((1 - quant.pTrue) * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Mode</p>
          <p className="text-sm font-semibold text-foreground">{quant.simMode === 'monte-carlo' ? 'Monte Carlo' : 'Black-Scholes'}</p>
        </div>
      </div>
    </div>
  );
}
