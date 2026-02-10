import { useState } from 'react';
import { Bug } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSignalEngine } from '@/hooks/useSignalEngine';
import type { DebugSnapshot } from '@/types/signal-engine';

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

function MCSection({ plan }: { plan: NonNullable<ReturnType<typeof useSignalEngine>['tradePlan']> }) {
  const debug = plan.debugData;
  if (!debug) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Monte Carlo</h4>
      <div className="grid grid-cols-3 gap-x-4 text-[10px] font-mono text-muted-foreground">
        <span>P(sim): {(debug.pSim * 100).toFixed(2)}%</span>
        <span>Time: {plan.computeTimeMs.toFixed(0)}ms</span>
        <span>Paths: 100k</span>
      </div>
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