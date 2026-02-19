/**
 * StrategyControlPanel — enable/disable strategies, tune thresholds, view signals.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TrendingUp, TrendingDown, Cpu } from 'lucide-react';
import { useTradingBotState, useTradingBotActions } from '@/contexts/TradingBotContext';
import { useToast } from '@/hooks/use-toast';

function strengthColor(s: string) {
  if (s === 'high') return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (s === 'medium') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-muted/30 text-muted-foreground border-border/30';
}

export function StrategyControlPanel() {
  const { strategies, recentSignals } = useTradingBotState();
  const { enableStrategy, disableStrategy } = useTradingBotActions();
  const { toast } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(90);
  const [volFilter, setVolFilter] = useState(true);

  const toggleStrategy = async (name: string, currentlyEnabled: boolean) => {
    setBusy(name);
    try {
      if (currentlyEnabled) {
        await disableStrategy(name);
        toast({ title: `Strategy disabled: ${name}` });
      } else {
        await enableStrategy(name);
        toast({ title: `Strategy enabled: ${name}` });
      }
    } catch (err) {
      toast({ title: 'Toggle failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const latestSignal = recentSignals[0];

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Strategy Control
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Strategy toggles */}
        {strategies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No strategies loaded</p>
        ) : (
          <div className="space-y-2">
            {strategies.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between p-2 rounded border border-border/30 bg-muted/10"
              >
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Signals: {s.signal_count}
                    {s.last_signal_time && ` · Last: ${new Date(s.last_signal_time).toLocaleTimeString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={`text-xs border ${s.enabled ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-muted/30 text-muted-foreground border-border/30'}`}
                  >
                    {s.enabled ? 'ON' : 'OFF'}
                  </Badge>
                  <Switch
                    checked={s.enabled}
                    disabled={busy === s.name}
                    onCheckedChange={() => toggleStrategy(s.name, s.enabled)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Threshold sliders */}
        <div className="space-y-3 pt-1 border-t border-border/30">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Min confidence threshold</span>
              <span className="font-mono font-medium">{confidenceThreshold}%</span>
            </div>
            <Slider
              min={60}
              max={99}
              step={1}
              value={[confidenceThreshold]}
              onValueChange={([v]) => setConfidenceThreshold(v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Volatility filter</p>
              <p className="text-xs text-muted-foreground/60">Skip signals during vol spikes</p>
            </div>
            <Switch checked={volFilter} onCheckedChange={setVolFilter} />
          </div>
        </div>

        {/* Latest signal display */}
        {latestSignal ? (
          <div className="pt-1 border-t border-border/30 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Latest Signal</p>
            <div className="p-2 rounded bg-muted/20 border border-border/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {latestSignal.direction === 'yes'
                    ? <TrendingUp className="w-4 h-4 text-green-400" />
                    : <TrendingDown className="w-4 h-4 text-red-400" />
                  }
                  <span className="text-sm font-medium">{latestSignal.ticker}</span>
                </div>
                <Badge className={`text-xs border ${strengthColor(latestSignal.strength)}`}>
                  {latestSignal.strength}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {[
                  ['Direction', latestSignal.direction.toUpperCase()],
                  ['Edge', `${(latestSignal.edge * 100).toFixed(1)}%`],
                  ['P(true)', `${(latestSignal.true_probability * 100).toFixed(1)}%`],
                  ['P(market)', `${(latestSignal.market_probability * 100).toFixed(1)}%`],
                  ['Kelly f', `${(latestSignal.kelly_fraction * 100).toFixed(1)}%`],
                  ['Qty', String(latestSignal.recommended_quantity)],
                  ['Price', `$${latestSignal.recommended_price.toFixed(2)}`],
                  ['Confidence', `${(latestSignal.confidence * 100).toFixed(0)}%`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium">{value}</span>
                  </div>
                ))}
              </div>

              {latestSignal.reasoning && (
                <p className="text-xs text-muted-foreground/70 italic border-t border-border/20 pt-1">
                  {latestSignal.reasoning}
                </p>
              )}
            </div>

            {/* Recent signal list */}
            {recentSignals.length > 1 && (
              <div className="space-y-1">
                {recentSignals.slice(1, 4).map((sig, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-1 rounded bg-muted/10">
                    <div className="flex items-center gap-1">
                      {sig.direction === 'yes'
                        ? <TrendingUp className="w-3 h-3 text-green-400" />
                        : <TrendingDown className="w-3 h-3 text-red-400" />
                      }
                      <span className="font-mono text-muted-foreground truncate max-w-[120px]">{sig.ticker}</span>
                    </div>
                    <span className="text-muted-foreground">{(sig.edge * 100).toFixed(1)}% edge</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="pt-1 border-t border-border/30">
            <p className="text-xs text-muted-foreground text-center py-2">No signals yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}