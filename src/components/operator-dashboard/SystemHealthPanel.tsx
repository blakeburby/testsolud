/**
 * SystemHealthPanel — API connectivity, auth, rate limits, last heartbeat, error log.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Wifi, WifiOff, ShieldCheck, ShieldX, Clock } from 'lucide-react';
import { useTradingBotState } from '@/contexts/TradingBotContext';

function HealthRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="font-mono text-muted-foreground/70">{detail}</span>}
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
      </div>
    </div>
  );
}

function timeSince(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function SystemHealthPanel() {
  const { health, connected, wsError, alerts } = useTradingBotState();

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4" />
          System Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Connection grid */}
        <div className="space-y-0">
          <HealthRow
            label="WebSocket"
            ok={connected}
            detail={connected ? 'connected' : (wsError ?? 'disconnected')}
          />
          <HealthRow
            label="API connectivity"
            ok={health?.api_connected ?? false}
            detail={health ? undefined : 'pending'}
          />
          <HealthRow
            label="Auth status"
            ok={health?.auth_ok ?? false}
            detail={
              health?.consecutive_errors
                ? `${health.consecutive_errors} errors`
                : 'ok'
            }
          />
          <HealthRow
            label="Bot running"
            ok={health?.bot_running ?? false}
            detail={health?.bot_running ? 'running' : 'stopped'}
          />
          <HealthRow
            label="Dry run mode"
            ok={health?.dry_run_mode ?? true}
            detail={health?.dry_run_mode ? 'dry run' : 'LIVE'}
          />
          <HealthRow
            label="Circuit breaker"
            ok={!(health?.circuit_breaker_active ?? false)}
            detail={health?.circuit_breaker_active ? 'TRIGGERED' : 'clear'}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded bg-muted/20 text-center">
            <p className="text-xs text-muted-foreground">Last heartbeat</p>
            <p className="text-sm font-medium mt-0.5">
              {timeSince(health?.last_successful_request ?? null)}
            </p>
          </div>
          <div className="p-2 rounded bg-muted/20 text-center">
            <p className="text-xs text-muted-foreground">Total requests</p>
            <p className="text-sm font-medium mt-0.5">
              {health?.total_requests?.toLocaleString() ?? '—'}
            </p>
          </div>
          <div className="p-2 rounded bg-muted/20 text-center">
            <p className="text-xs text-muted-foreground">Open orders</p>
            <p className="text-sm font-medium mt-0.5">{health?.open_orders ?? 0}</p>
          </div>
          <div className="p-2 rounded bg-muted/20 text-center">
            <p className="text-xs text-muted-foreground">Consec. errors</p>
            <p className={`text-sm font-medium mt-0.5 ${(health?.consecutive_errors ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {health?.consecutive_errors ?? 0}
            </p>
          </div>
        </div>

        {/* Circuit breaker detail */}
        {health?.circuit_breaker_active && health.circuit_breaker_reason && (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-2">
            <p className="text-xs text-red-400 font-medium">Circuit Breaker Reason</p>
            <p className="text-xs text-red-300 mt-0.5">{health.circuit_breaker_reason}</p>
          </div>
        )}

        {/* Alert log */}
        {alerts.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Recent alerts
            </p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {alerts.slice(0, 8).map((a, i) => (
                <div key={i} className={`text-xs p-1.5 rounded ${
                  a.level === 'critical' || a.level === 'error'
                    ? 'bg-red-500/10 text-red-300'
                    : a.level === 'warning'
                    ? 'bg-yellow-500/10 text-yellow-300'
                    : 'bg-muted/20 text-muted-foreground'
                }`}>
                  <span className="opacity-60">{new Date(a.timestamp).toLocaleTimeString()} </span>
                  {a.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}