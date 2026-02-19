/**
 * OrderControlPanel — active orders table with cancel/decrease/amend.
 *
 * Safety constraints enforced:
 *  - Cannot cancel an executed/canceled order
 *  - Cannot decrease below 1
 *  - Amend price validated 0.01–0.99
 *  - Confirmation for batch cancel
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { X, Minus, Pencil, ListOrdered } from 'lucide-react';
import { useTradingBotState, useTradingBotActions, type ActiveTrade } from '@/contexts/TradingBotContext';
import { useToast } from '@/hooks/use-toast';

type ActionType = 'cancel' | 'decrease' | 'amend';

function statusColor(status: string) {
  switch (status) {
    case 'submitted': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'filled': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'cancelled': return 'bg-muted/40 text-muted-foreground border-border/30';
    case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-muted/20 text-muted-foreground border-border/30';
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
  const { cancelTrade, decreaseTrade, amendTrade, cancelAllOrders } = useTradingBotActions();
  const { toast } = useToast();

  const [actionTrade, setActionTrade] = useState<ActiveTrade | null>(null);
  const [actionType, setActionType] = useState<ActionType>('cancel');
  const [decreaseBy, setDecreaseBy] = useState('1');
  const [amendPrice, setAmendPrice] = useState('');
  const [amendQty, setAmendQty] = useState('');
  const [showCancelAll, setShowCancelAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const canModify = (t: ActiveTrade) =>
    t.status !== 'filled' && t.status !== 'cancelled' && t.status !== 'failed';

  const openAction = (trade: ActiveTrade, type: ActionType) => {
    setActionTrade(trade);
    setActionType(type);
    setAmendPrice(trade.price ? (trade.price).toFixed(2) : '');
    setAmendQty(trade.quantity.toString());
    setDecreaseBy('1');
  };

  const executeAction = async () => {
    if (!actionTrade) return;
    setBusy(true);
    try {
      switch (actionType) {
        case 'cancel':
          await cancelTrade(actionTrade.trade_id);
          toast({ title: 'Order cancelled', description: actionTrade.ticker });
          break;
        case 'decrease': {
          const n = parseInt(decreaseBy);
          if (!n || n < 1) throw new Error('Invalid decrease amount');
          if (n >= actionTrade.quantity) throw new Error('Would cancel order — use Cancel instead');
          await decreaseTrade(actionTrade.trade_id, n);
          toast({ title: `Decreased by ${n}`, description: actionTrade.ticker });
          break;
        }
        case 'amend': {
          const p = parseFloat(amendPrice);
          const q = parseInt(amendQty);
          if (p && (p < 0.01 || p > 0.99)) throw new Error('Price must be 0.01–0.99');
          await amendTrade(
            actionTrade.trade_id,
            p || undefined,
            q || undefined,
          );
          toast({ title: 'Order amended', description: actionTrade.ticker });
          break;
        }
      }
      setActionTrade(null);
    } catch (err) {
      toast({ title: 'Action failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelAll = async () => {
    setBusy(true);
    try {
      await cancelAllOrders();
      toast({ title: 'All orders cancelled' });
      setShowCancelAll(false);
    } catch (err) {
      toast({ title: 'Cancel all failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="border border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ListOrdered className="w-4 h-4" />
              Active Orders ({activeTrades.length})
            </CardTitle>
            {activeTrades.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancelAll(true)}
                className="h-7 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10"
              >
                Cancel All
              </Button>
            )}
          </div>
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
                  {/* Side + ticker */}
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
                        <span className="text-xs text-yellow-500/70">[dry]</span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <Badge className={`text-xs ${statusColor(trade.status)} border`}>
                    {trade.status}
                  </Badge>

                  {/* Actions */}
                  {canModify(trade) && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Decrease"
                        onClick={() => openAction(trade, 'decrease')}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Amend"
                        onClick={() => openAction(trade, 'amend')}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Cancel"
                        onClick={() => openAction(trade, 'cancel')}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action modal */}
      <Dialog open={!!actionTrade} onOpenChange={(o) => { if (!o) setActionTrade(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'cancel' && 'Cancel Order'}
              {actionType === 'decrease' && 'Decrease Order'}
              {actionType === 'amend' && 'Amend Order'}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{actionTrade?.ticker}</DialogDescription>
          </DialogHeader>

          {actionType === 'cancel' && (
            <p className="text-sm text-muted-foreground">
              Cancel {actionTrade?.quantity} × {actionTrade?.side.toUpperCase()} @ ${actionTrade?.price?.toFixed(2)}?
            </p>
          )}

          {actionType === 'decrease' && (
            <div>
              <label className="text-xs text-muted-foreground">Reduce by (contracts)</label>
              <Input
                type="number"
                min="1"
                max={actionTrade ? actionTrade.quantity - 1 : 1}
                value={decreaseBy}
                onChange={e => setDecreaseBy(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Current: {actionTrade?.quantity} → After: {Math.max(0, (actionTrade?.quantity ?? 0) - parseInt(decreaseBy || '0'))}
              </p>
            </div>
          )}

          {actionType === 'amend' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">New price (0.01–0.99)</label>
                <Input
                  type="number"
                  min="0.01"
                  max="0.99"
                  step="0.01"
                  value={amendPrice}
                  onChange={e => setAmendPrice(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">New quantity</label>
                <Input
                  type="number"
                  min="1"
                  value={amendQty}
                  onChange={e => setAmendQty(e.target.value)}
                  className="mt-1"
                />
              </div>
              <p className="text-xs text-yellow-400">Note: Amend creates a new order ID.</p>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setActionTrade(null)}>Cancel</Button>
            <Button
              size="sm"
              variant={actionType === 'cancel' ? 'destructive' : 'default'}
              onClick={executeAction}
              disabled={busy}
            >
              {busy ? 'Working...' : actionType === 'cancel' ? 'Confirm Cancel' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel all confirm */}
      <Dialog open={showCancelAll} onOpenChange={setShowCancelAll}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel All Orders?</DialogTitle>
            <DialogDescription>
              This will cancel all {activeTrades.length} resting order{activeTrades.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCancelAll(false)}>Back</Button>
            <Button variant="destructive" onClick={handleCancelAll} disabled={busy}>
              {busy ? 'Cancelling...' : 'Cancel All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}