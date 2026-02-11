import { useQuantEngine } from '@/hooks/useQuantEngine';
import { cn } from '@/lib/utils';
import { Activity, Shield, Gauge } from 'lucide-react';

export function VolatilityPanel() {
  const quant = useQuantEngine();

  const regimeColor = {
    Low: 'text-trading-up bg-trading-up/10 border-trading-up/30',
    Medium: 'text-[hsl(var(--timer-warning))] bg-[hsl(var(--timer-warning)/0.1)] border-[hsl(var(--timer-warning)/0.3)]',
    High: 'text-trading-down bg-trading-down/10 border-trading-down/30',
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[hsl(var(--gold))]" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Volatility</h3>
        </div>
        {quant.ewma.isCalibrated ? (
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded border', regimeColor[quant.ewma.volRegime])}>
            {quant.ewma.volRegime}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground animate-pulse">Calibrating...</span>
        )}
      </div>

      <div className="space-y-3">
        <StatRow
          icon={<Gauge className="h-3.5 w-3.5" />}
          label="EWMA σ (annualized)"
          value={quant.ewma.isCalibrated ? `${(quant.ewma.annualizedVol * 100).toFixed(1)}%` : '—'}
        />
        <StatRow
          icon={<Shield className="h-3.5 w-3.5" />}
          label="Microstructure η"
          value={`${(quant.microstructure.eta * 10000).toFixed(1)} bps`}
        />
        <StatRow
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Effective σ_total"
          value={`${(quant.microstructure.sigmaTotal * 100).toFixed(4)}%`}
        />
        <StatRow
          label="Samples"
          value={`${quant.ewma.sampleCount}`}
          muted
        />
      </div>
    </div>
  );
}

function StatRow({ icon, label, value, muted }: { icon?: React.ReactNode; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className={cn("text-xs", muted ? "text-muted-foreground/60" : "text-muted-foreground")}>{label}</span>
      </div>
      <span className={cn("text-sm font-mono font-semibold tabular-nums", muted ? "text-muted-foreground" : "text-foreground")}>{value}</span>
    </div>
  );
}
