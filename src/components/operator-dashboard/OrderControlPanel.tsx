/**
 * OrderControlPanel — read-only live view of active orders.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ListOrdered } from 'lucide-react';
import { useTradingBotState } from '@/contexts/TradingBotContext';

function statusColor(status: string) {
  switch (status) {
    case 'submitted': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'pending':   return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'filled':    return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'cancelled': return 'bg-muted/40 text-muted-foreground border-border/30';
    case 'failed':    return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:          return 'bg-muted/20 text-muted-foreground border-border/30';
  }
}

function sideColor(side: string) {
  return side === 'yes' ? 'text-green-400' : 'text-red-400';
}

function age(ts?: string) {
  if (!ts) return '—';
  const secs = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

export function OrderControlPanel() {
  const { activeTrades } = useTradingBotState();

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <ListOrdered className="w-4 h-4" />
          Active Orders ({activeTrades.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeTrades.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No active orders</p>
        ) : (
          <div className="space-y-2">
            {activeTrades.map((trade) => (
              <div
                key={trade.trade_id}
                className="flex items-center gap-2 p-2 rounded border border-border/30 bg-muted/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase ${sideColor(trade.side)}`}>
                      {trade.side}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[140px]">
                      {trade.ticker}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs">
                      {trade.quantity} × {trade.price ? `$${(trade.price).toFixed(2)}` : 'mkt'}
                    </span>
                    <span className="text-xs text-muted-foreground">{age(trade.submitted_at)}</span>
                    {trade.dry_run && (
                      <span className="text-xs text-yellow-500/70">[paper]</span>
                    )}
                  </div>
                </div>

                <Badge className={`text-xs ${statusColor(trade.status)} border`}>
                  {trade.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}