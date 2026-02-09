import { useSignalEngine } from '@/hooks/useSignalEngine';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, AlertTriangle, Zap, Clock, ShieldAlert } from 'lucide-react';

function RegimeBadge({ regime }: { regime: string }) {
  const config = {
    R1_LOW_VOL: { label: 'Low Vol', className: 'bg-muted text-muted-foreground' },
    R2_HIGH_VOL: { label: 'High Vol', className: 'bg-destructive/10 text-destructive' },
    R3_EVENT_DRIVEN: { label: 'Event', className: 'bg-[hsl(var(--timer-warning))]/10 text-[hsl(var(--timer-warning))]' },
  }[regime] ?? { label: regime, className: 'bg-muted text-muted-foreground' };

  return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${config.className}`}>{config.label}</span>;
}

function DecisionBadge({ decision }: { decision: string }) {
  if (decision === 'TRADE_NOW') {
    return (
      <Badge className="bg-[hsl(var(--trading-up))] text-primary-foreground gap-1">
        <Zap className="h-3 w-3" /> TRADE NOW
      </Badge>
    );
  }
  if (decision === 'WAIT') {
    return (
      <Badge className="bg-[hsl(var(--timer-warning))] text-primary-foreground gap-1">
        <Clock className="h-3 w-3" /> WAIT
      </Badge>
    );
  }
  return null;
}

export function TradePlan() {
  const { tradePlan, isComputing } = useSignalEngine();

  if (!tradePlan) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground font-mono text-center">
            {isComputing ? 'Computing signals…' : 'Waiting for market data…'}
          </p>
        </CardContent>
      </Card>
    );
  }

  // NO TRADE output
  if (tradePlan.decision === 'NO_TRADE') {
    return (
      <Card className="border-border/50">
        <CardContent className="py-3 px-4 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-mono text-muted-foreground">
            NO TRADE — {tradePlan.noTradeReason ?? 'Market efficient'}
          </span>
          <RegimeBadge regime={tradePlan.regime} />
          <span className="text-[10px] text-muted-foreground ml-auto font-mono">
            {tradePlan.computeTimeMs.toFixed(0)}ms
          </span>
        </CardContent>
      </Card>
    );
  }

  // TRADE / WAIT output
  const isYes = tradePlan.direction === 'LONG_YES';
  const DirectionIcon = isYes ? TrendingUp : TrendingDown;

  return (
    <Card className="border-border/50">
      <CardContent className="py-3 px-4 space-y-3">
        {/* Row 1: Decision + Direction + Regime */}
        <div className="flex items-center gap-2 flex-wrap">
          <DecisionBadge decision={tradePlan.decision} />
          <span className={`text-sm font-bold flex items-center gap-1 ${isYes ? 'text-[hsl(var(--trading-up))]' : 'text-[hsl(var(--trading-down))]'}`}>
            <DirectionIcon className="h-3.5 w-3.5" />
            {tradePlan.direction.replace('_', ' ')}
          </span>
          <RegimeBadge regime={tradePlan.regime} />
          <span className="text-[10px] text-muted-foreground ml-auto font-mono">
            {tradePlan.computeTimeMs.toFixed(0)}ms
          </span>
        </div>

        {/* Row 2: Probability comparison bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
            <span>Model: {(tradePlan.finalProbability * 100).toFixed(1)}%</span>
            <span>Edge: {(tradePlan.edge * 100).toFixed(1)}%</span>
            <span>Market: {(tradePlan.marketProbability * 100).toFixed(1)}%</span>
          </div>
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[hsl(var(--chart-1))] rounded-full transition-all"
              style={{ width: `${tradePlan.finalProbability * 100}%` }}
            />
            <div
              className="absolute inset-y-0 w-0.5 bg-foreground/50"
              style={{ left: `${tradePlan.marketProbability * 100}%` }}
            />
          </div>
        </div>

        {/* Row 3: Key metrics grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground font-mono">EV</p>
            <p className={`text-xs font-bold font-mono ${tradePlan.expectedValue > 0 ? 'text-[hsl(var(--trading-up))]' : 'text-[hsl(var(--trading-down))]'}`}>
              {tradePlan.expectedValue > 0 ? '+' : ''}{(tradePlan.expectedValue * 100).toFixed(1)}¢
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-mono">Size</p>
            <p className="text-xs font-bold font-mono text-foreground">{tradePlan.positionSize.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-mono">Entry</p>
            <p className="text-xs font-bold font-mono text-foreground">{(tradePlan.entryPrice * 100).toFixed(0)}¢</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-mono">Disagr</p>
            <p className="text-xs font-bold font-mono text-foreground">{(tradePlan.disagreement * 100).toFixed(1)}%</p>
          </div>
        </div>

        {/* Row 4: Confidence */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">Conf</span>
          <Progress value={tradePlan.confidenceScore} className="h-1.5 flex-1" />
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">{tradePlan.confidenceScore}</span>
        </div>

        {/* Row 5: Levels + Time */}
        <div className="flex gap-3 text-[10px] font-mono text-muted-foreground flex-wrap">
          <span>SL: {(tradePlan.stopLoss * 100).toFixed(0)}¢</span>
          <span>TP: {(tradePlan.takeProfit * 100).toFixed(0)}¢</span>
          <span className="ml-auto">{tradePlan.timeHorizon}</span>
        </div>

        {/* Row 6: Invalidation + Liquidity */}
        {tradePlan.invalidationConditions.length > 0 && (
          <div className="border-t border-border/50 pt-2 space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <AlertTriangle className="h-3 w-3" /> Invalidation:
            </div>
            {tradePlan.invalidationConditions.map((cond, i) => (
              <p key={i} className="text-[10px] text-muted-foreground font-mono pl-4">• {cond}</p>
            ))}
            <p className="text-[10px] text-muted-foreground font-mono pt-1">{tradePlan.liquidityNotes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
