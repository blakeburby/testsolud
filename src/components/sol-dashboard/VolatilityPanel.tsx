import { useSharedQuantEngine } from '@/contexts/QuantEngineContext';
import { cn } from '@/lib/utils';

export function VolatilityPanel() {
  const quant = useSharedQuantEngine();

  const regimeColor = {
    Low: 'text-trading-up bg-trading-up/10',
    Medium: 'text-[hsl(var(--timer-warning))] bg-[hsl(var(--timer-warning)/0.1)]',
    High: 'text-trading-down bg-trading-down/10',
  };

  return (
    <div className="terminal-panel space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Volatility</span>
        {quant.ewma.isCalibrated ? (
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-sm', regimeColor[quant.ewma.volRegime])}>
            {quant.ewma.volRegime}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">Calibrating...</span>
        )}
      </div>

      {/* Hero: Annualized vol */}
      <div className="py-1.5 border-y border-border">
        <span className="text-[10px] text-muted-foreground uppercase">EWMA σ (Annualized)</span>
        <p className="text-lg font-mono font-bold tabular-nums text-foreground">
          {quant.ewma.isCalibrated ? `${(quant.ewma.annualizedVol * 100).toFixed(1)}%` : '—'}
        </p>
      </div>

      <div className="space-y-0.5">
        <StatRow label="λ" value="0.94" muted />
        <StatRow label="1-min variance" value={quant.ewma.isCalibrated ? quant.ewma.variance.toExponential(3) : '—'} />
        <StatRow label="η (floor)" value={`${(quant.microstructure.eta * 10000).toFixed(1)} bps`} />
        <StatRow label="σ_total" value={`${(quant.microstructure.sigmaTotal * 100).toFixed(4)}%`} />
        <StatRow label="Samples" value={`${quant.ewma.sampleCount}`} muted />
      </div>
    </div>
  );
}

function StatRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-xs", muted ? "text-muted-foreground/60" : "text-muted-foreground")}>{label}</span>
      <span className={cn("text-sm font-mono font-semibold tabular-nums", muted ? "text-muted-foreground" : "text-foreground")}>{value}</span>
    </div>
  );
}
