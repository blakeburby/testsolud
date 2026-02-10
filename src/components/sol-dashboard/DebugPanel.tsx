import { useState } from 'react';
import { Bug } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSignalEngine } from '@/hooks/useSignalEngine';
import type { DebugSnapshot, MCDistributionResult } from '@/types/signal-engine';
import { AreaChart, Area, XAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';

function RegimeSection({ plan }: { plan: NonNullable<ReturnType<typeof useSignalEngine>['tradePlan']> }) {
  const debug = plan.debugData;
  if (!debug) return null;
  const { regimeDetection: rd } = debug;
  const weights = [
    { label: 'R1', value: rd.weights.r1, color: 'bg-emerald-500' },
    { label: 'R2', value: rd.weights.r2, color: 'bg-amber-500' },
    { label: 'R3', value: rd.weights.r3, color: 'bg-red-500' },
  ];

  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Regime</h4>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-foreground">{rd.regime}</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden flex">
          {weights.map(w => (
            <div key={w.label} className={`${w.color} h-full`} style={{ width: `${w.value * 100}%` }} />
          ))}
        </div>
        <div className="flex gap-1.5 text-[9px] font-mono text-muted-foreground">
          {weights.map(w => <span key={w.label}>{w.label}:{(w.value * 100).toFixed(0)}%</span>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 text-[10px] font-mono text-muted-foreground">
        <span>Ann. Vol: {(rd.annualizedVol * 100).toFixed(1)}%</span>
        <span>Recent/Prior: {rd.recentVolRatio.toFixed(2)}x</span>
      </div>
    </div>
  );
}

function BlendSection({ plan }: { plan: NonNullable<ReturnType<typeof useSignalEngine>['tradePlan']> }) {
  const debug = plan.debugData;
  if (!debug) return null;
  const { orderbookImbalance: ob } = debug;
  const bw = plan.blendWeights;
  const segments = [
    { label: 'Mkt', value: bw.wMarket, color: 'bg-blue-500' },
    { label: 'Sim', value: bw.wSim, color: 'bg-violet-500' },
    { label: 'OB', value: bw.wOrderbook, color: 'bg-cyan-500' },
  ];

  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Probability Blend</h4>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full overflow-hidden flex">
          {segments.map(s => (
            <div key={s.label} className={`${s.color} h-full`} style={{ width: `${s.value * 100}%` }} />
          ))}
        </div>
        <div className="flex gap-1.5 text-[9px] font-mono text-muted-foreground">
          {segments.map(s => <span key={s.label}>{s.label}:{(s.value * 100).toFixed(0)}%</span>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono text-muted-foreground">
        <span>P_market: {(debug.pMarket * 100).toFixed(1)}%</span>
        <span>P_sim: {(debug.pSim * 100).toFixed(1)}%</span>
        <span>P_ob: {(debug.pOB * 100).toFixed(1)}%</span>
        <span className="text-foreground">P_final: {(plan.finalProbability * 100).toFixed(1)}%</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono text-muted-foreground">
        <span>Imbalance: {ob.imbalance.toFixed(3)}</span>
        <span>Alpha: {ob.alpha.toFixed(3)}</span>
        <span>Depth: {Math.round(ob.totalDepth)}</span>
        <span>Spread: {(ob.spread * 100).toFixed(1)}¢</span>
      </div>
    </div>
  );
}

function MCHeatStrip({ dist }: { dist: MCDistributionResult }) {
  const { bins, stats } = dist;
  if (bins.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex h-6 rounded overflow-hidden gap-px relative">
        {bins.map((bin, i) => (
          <div
            key={i}
            className="flex-1 transition-opacity"
            style={{
              backgroundColor: bin.isAboveStrike ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)',
              opacity: Math.max(0.08, bin.frequency),
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[8px] font-mono text-muted-foreground">
        <span>${stats.min.toFixed(2)}</span>
        <span className="text-foreground font-semibold">Strike</span>
        <span>${stats.max.toFixed(2)}</span>
      </div>
    </div>
  );
}

function MCProbabilityGauge({ pAbove }: { pAbove: number }) {
  const pct = pAbove * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
        <span>P(below): {(100 - pct).toFixed(1)}%</span>
        <span className="text-foreground">P(above): {pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex bg-muted">
        <div className="bg-red-500 h-full transition-all" style={{ width: `${100 - pct}%` }} />
        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MCDistributionChart({ dist }: { dist: MCDistributionResult }) {
  const { bins, stats } = dist;
  if (bins.length === 0) return null;

  // Find the strike bin index for the reference line
  const strikeBin = bins.find(b => b.isAboveStrike);
  const strikePrice = strikeBin ? strikeBin.binCenter : stats.mean;

  // Prepare chart data with split areas
  const chartData = bins.map(bin => ({
    price: bin.binCenter,
    below: bin.isAboveStrike ? 0 : bin.count,
    above: bin.isAboveStrike ? bin.count : 0,
  }));

  return (
    <div className="space-y-1">
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="belowGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity={0.6} />
              <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="aboveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity={0.6} />
              <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <XAxis dataKey="price" hide />
          <Tooltip
            contentStyle={{ fontSize: '10px', fontFamily: 'monospace', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            formatter={(value: number, name: string) => [value, name === 'below' ? 'Below Strike' : 'Above Strike']}
            labelFormatter={(label: number) => `$${Number(label).toFixed(2)}`}
          />
          <ReferenceLine x={strikePrice} stroke="hsl(var(--foreground))" strokeDasharray="3 3" strokeWidth={1} />
          <Area type="monotone" dataKey="below" stroke="rgb(239, 68, 68)" fill="url(#belowGrad)" strokeWidth={1.5} />
          <Area type="monotone" dataKey="above" stroke="rgb(16, 185, 129)" fill="url(#aboveGrad)" strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-x-2 text-[9px] font-mono text-muted-foreground">
        <span>Mean: ${stats.mean.toFixed(2)}</span>
        <span>Median: ${stats.median.toFixed(2)}</span>
        <span>P5–P95: ${stats.p5.toFixed(2)}–${stats.p95.toFixed(2)}</span>
      </div>
    </div>
  );
}

function MCSection({ plan }: { plan: NonNullable<ReturnType<typeof useSignalEngine>['tradePlan']> }) {
  const debug = plan.debugData;
  if (!debug) return null;
  const dist = debug.mcDistribution;

  return (
    <div className="space-y-2.5">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Monte Carlo</h4>
      <div className="grid grid-cols-3 gap-x-4 text-[10px] font-mono text-muted-foreground">
        <span>P(sim): {(debug.pSim * 100).toFixed(2)}%</span>
        <span>Time: {plan.computeTimeMs.toFixed(0)}ms</span>
        <span>Paths: 100k + 10k viz</span>
      </div>
      {dist && (
        <>
          <MCProbabilityGauge pAbove={dist.pAbove} />
          <MCHeatStrip dist={dist} />
          <MCDistributionChart dist={dist} />
        </>
      )}
    </div>
  );
}

function HistorySection({ history }: { history: DebugSnapshot[] }) {
  if (history.length === 0) {
    return (
      <div className="space-y-1.5">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">History</h4>
        <span className="text-[10px] font-mono text-muted-foreground">No evaluations yet</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">History ({history.length})</h4>
      <div className="max-h-32 overflow-y-auto">
        <table className="w-full text-[9px] font-mono text-muted-foreground">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-0.5 pr-2">Time</th>
              <th className="text-left py-0.5 pr-2">Dec</th>
              <th className="text-left py-0.5 pr-2">Dir</th>
              <th className="text-right py-0.5 pr-2">EV</th>
              <th className="text-right py-0.5 pr-2">Edge</th>
              <th className="text-right py-0.5">Stab</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((s, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-0.5 pr-2">{new Date(s.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td className={`py-0.5 pr-2 ${s.decision === 'TRADE_NOW' ? 'text-emerald-400' : s.decision === 'WAIT' ? 'text-amber-400' : 'text-muted-foreground'}`}>
                  {s.decision === 'TRADE_NOW' ? 'TRADE' : s.decision === 'NO_TRADE' ? 'NO' : 'WAIT'}
                </td>
                <td className="py-0.5 pr-2">{s.direction === 'LONG_YES' ? 'YES' : 'NO'}</td>
                <td className={`py-0.5 pr-2 text-right ${s.ev > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.ev.toFixed(3)}</td>
                <td className="py-0.5 pr-2 text-right">{(s.edge * 100).toFixed(1)}%</td>
                <td className="py-0.5 text-right">{s.stabilityCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const { tradePlan, debugHistory } = useSignalEngine();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors py-1">
        <Bug className="h-3 w-3" />
        <span>Debug</span>
        <span className="text-[9px]">{open ? '▼' : '▶'}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-3 rounded-lg border border-border bg-card/50 space-y-4">
          {tradePlan ? (
            <>
              <RegimeSection plan={tradePlan} />
              <BlendSection plan={tradePlan} />
              <MCSection plan={tradePlan} />
              <HistorySection history={debugHistory} />
            </>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground">No trade plan computed yet</span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}