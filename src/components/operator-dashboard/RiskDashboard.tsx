/**
 * RiskDashboard — color-coded live risk metrics.
 *
 * Green  = safe
 * Yellow = caution (approaching limits)
 * Red    = at/past threshold
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldAlert, TrendingDown, Activity } from 'lucide-react';
import { useTradingBotState } from '@/contexts/TradingBotContext';

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pct(n: number, dec = 1) {
  return (n * 100).toFixed(dec) + '%';
}

function pnlColor(v: number) {
  if (v > 0) return 'text-green-400';
  if (v < 0) return 'text-red-400';
  return 'text-muted-foreground';
}

interface MetricTileProps {
  label: string;
  value: string;
  subValue?: string;
  status: 'safe' | 'caution' | 'danger';
  icon?: React.ReactNode;
}

function MetricTile({ label, value, subValue, status, icon }: MetricTileProps) {
  const borderColors = { safe: 'border-green-500/30', caution: 'border-yellow-500/40', danger: 'border-red-500/50' };
  const bgColors = { safe: 'bg-green-500/5', caution: 'bg-yellow-500/5', danger: 'bg-red-500/10' };
  const dotColors = { safe: 'bg-green-400', caution: 'bg-yellow-400', danger: 'bg-red-400 animate-pulse' };

  return (
    <div className={`rounded-lg border p-3 ${borderColors[status]} ${bgColors[status]}`}>
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs text-muted-foreground leading-tight">{label}</span>
        <div className="flex items-center gap-1">
          {icon}
          <span className={`w-2 h-2 rounded-full ${dotColors[status]}`} />
        </div>
      </div>
      <p className="text-xl font-bold font-mono">{value}</p>
      {subValue && <p className="text-xs text-muted-foreground mt-0.5">{subValue}</p>}
    </div>
  );
}

export function RiskDashboard() {
  const { status, health } = useTradingBotState();
  const m = status?.risk_metrics;

  if (!m) {
    return (
      <Card className="border border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Risk Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Connecting to backend...</p>
        </CardContent>
      </Card>
    );
  }

  // Threshold helpers
  const drawdownStatus = m.current_drawdown > 0.12 ? 'danger' : m.current_drawdown > 0.07 ? 'caution' : 'safe';
  const dailyLossStatus = Math.abs(m.daily_loss) > 300 ? 'danger' : Math.abs(m.daily_loss) > 150 ? 'caution' : 'safe';
  const exposureStatus = m.total_exposure > 800 ? 'danger' : m.total_exposure > 500 ? 'caution' : 'safe';
  const winRateStatus = m.win_rate > 0 && m.win_rate < 0.4 ? 'caution' : 'safe';

  const cbActive = m.circuit_breaker_triggered;

  return (
    <Card className={`border ${cbActive ? 'border-red-500/60' : 'border-border/60'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            Risk Dashboard
          </CardTitle>
          {cbActive && (
            <Badge variant="destructive" className="text-xs animate-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              CIRCUIT BREAKER
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Circuit breaker banner */}
        {cbActive && (
          <div className="rounded border border-red-500/50 bg-red-500/10 p-3">
            <p className="text-red-400 text-sm font-semibold">Trading Halted</p>
            <p className="text-xs text-red-300 mt-0.5">{m.circuit_breaker_reason || 'Circuit breaker triggered'}</p>
          </div>
        )}

        {/* Main metric grid */}
        <div className="grid grid-cols-2 gap-2">
          <MetricTile
            label="Daily P&L"
            value={`${m.daily_pnl >= 0 ? '+' : ''}$${fmt(m.daily_pnl)}`}
            subValue={`Realized: $${fmt(m.realized_pnl)}`}
            status={m.daily_pnl < -200 ? 'danger' : m.daily_pnl < 0 ? 'caution' : 'safe'}
          />
          <MetricTile
            label="Unrealized P&L"
            value={`${m.unrealized_pnl >= 0 ? '+' : ''}$${fmt(m.unrealized_pnl)}`}
            status={m.unrealized_pnl < -100 ? 'danger' : m.unrealized_pnl < 0 ? 'caution' : 'safe'}
          />
          <MetricTile
            label="Current Drawdown"
            value={pct(m.current_drawdown)}
            subValue={`Max: ${pct(m.max_drawdown)}`}
            status={drawdownStatus}
            icon={<TrendingDown className="w-3 h-3 text-muted-foreground" />}
          />
          <MetricTile
            label="Daily Loss"
            value={`$${fmt(Math.abs(m.daily_loss))}`}
            subValue="vs $500 cap"
            status={dailyLossStatus}
          />
          <MetricTile
            label="Total Exposure"
            value={`$${fmt(m.total_exposure)}`}
            subValue={`${m.total_positions} position${m.total_positions !== 1 ? 's' : ''}`}
            status={exposureStatus}
          />
          <MetricTile
            label="Open Orders"
            value={String(m.open_orders_count)}
            status={m.open_orders_count > 8 ? 'caution' : 'safe'}
            icon={<Activity className="w-3 h-3 text-muted-foreground" />}
          />
          <MetricTile
            label="Win Rate"
            value={m.win_rate > 0 ? pct(m.win_rate) : '—'}
            status={winRateStatus}
          />
          <MetricTile
            label="EV / Trade"
            value={m.ev_per_trade !== 0 ? `${m.ev_per_trade >= 0 ? '+' : ''}$${fmt(m.ev_per_trade, 3)}` : '—'}
            status={m.ev_per_trade < 0 ? 'danger' : 'safe'}
          />
        </div>

        {/* Per-market exposure */}
        {Object.keys(m.exposure_per_market).length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Exposure per market</p>
            <div className="space-y-1">
              {Object.entries(m.exposure_per_market).map(([ticker, exp]) => (
                <div key={ticker} className="flex justify-between text-xs">
                  <span className="font-mono text-muted-foreground truncate max-w-[180px]">{ticker}</span>
                  <span className={`font-medium ${exp > 400 ? 'text-red-400' : exp > 200 ? 'text-yellow-400' : 'text-green-400'}`}>
                    ${fmt(exp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last updated */}
        {m.last_updated && (
          <p className="text-xs text-muted-foreground/50 text-right">
            Updated {new Date(m.last_updated).toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}