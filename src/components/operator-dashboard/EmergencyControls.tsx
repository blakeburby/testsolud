/**
 * EmergencyControls — prominent halt controls, always visible.
 *
 * HALT ALL:  stops bot + cancels orders + disables strategies + triggers circuit breaker
 * CANCEL ALL: only cancels resting orders, bot keeps running
 * RESET CB:  re-enables trading after operator review
 */

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OctagonX, XCircle, RotateCcw } from 'lucide-react';
import { useTradingBotState, useTradingBotActions } from '@/contexts/TradingBotContext';
import { useToast } from '@/hooks/use-toast';

type ConfirmType = 'halt' | 'cancel-all' | null;

export function EmergencyControls() {
  const { status } = useTradingBotState();
  const { emergencyHalt, cancelAllOrders, resetCircuitBreaker, startBot, stopBot } = useTradingBotActions();
  const { toast } = useToast();

  const [confirm, setConfirm] = useState<ConfirmType>(null);
  const [busy, setBusy] = useState(false);

  const cbActive = status?.risk_metrics?.circuit_breaker_triggered ?? false;
  const botRunning = status?.running ?? false;

  const execute = async () => {
    setBusy(true);
    try {
      if (confirm === 'halt') {
        await emergencyHalt();
        toast({ title: 'HALT EXECUTED — all trading stopped', variant: 'destructive' });
      } else if (confirm === 'cancel-all') {
        await cancelAllOrders();
        toast({ title: 'All orders cancelled' });
      }
      setConfirm(null);
    } catch (err) {
      toast({ title: 'Action failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleResetCB = async () => {
    setBusy(true);
    try {
      await resetCircuitBreaker();
      toast({ title: 'Circuit breaker reset', description: 'Trading can resume' });
    } catch (err) {
      toast({ title: 'Reset failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleBotToggle = async () => {
    setBusy(true);
    try {
      if (botRunning) {
        await stopBot();
        toast({ title: 'Bot stopped' });
      } else {
        await startBot();
        toast({ title: 'Bot started' });
      }
    } catch (err) {
      toast({ title: 'Toggle failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className={`border-2 ${cbActive ? 'border-red-500/80 bg-red-500/5' : 'border-border/60'}`}>
        <CardContent className="p-4 space-y-3">

          {cbActive && (
            <div className="text-center py-1">
              <p className="text-red-400 font-bold text-sm animate-pulse">TRADING HALTED — CIRCUIT BREAKER ACTIVE</p>
            </div>
          )}

          {/* Primary halt button */}
          <Button
            onClick={() => setConfirm('halt')}
            disabled={busy}
            className="w-full h-12 text-base font-bold bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30"
          >
            <OctagonX className="w-5 h-5 mr-2" />
            HALT ALL TRADING
          </Button>

          {/* Secondary controls */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirm('cancel-all')}
              disabled={busy}
              className="h-9 text-sm border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Cancel Orders
            </Button>

            {cbActive ? (
              <Button
                variant="outline"
                onClick={handleResetCB}
                disabled={busy}
                className="h-9 text-sm border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Reset Breaker
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleBotToggle}
                disabled={busy}
                className={`h-9 text-sm ${botRunning
                  ? 'border-muted-foreground/30 text-muted-foreground'
                  : 'border-green-500/40 text-green-400 hover:bg-green-500/10'
                }`}
              >
                {botRunning ? 'Stop Bot' : 'Start Bot'}
              </Button>
            )}
          </div>

          {/* Status indicators */}
          <div className="flex items-center justify-center gap-4 pt-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${botRunning ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/40'}`} />
              <span className="text-muted-foreground">Bot {botRunning ? 'running' : 'stopped'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${cbActive ? 'bg-red-400 animate-pulse' : 'bg-green-400'}`} />
              <span className="text-muted-foreground">CB {cbActive ? 'active' : 'clear'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation modal */}
      <Dialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${confirm === 'halt' ? 'text-red-400' : 'text-orange-400'}`}>
              {confirm === 'halt' ? <OctagonX className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              {confirm === 'halt' ? 'HALT ALL TRADING?' : 'Cancel All Orders?'}
            </DialogTitle>
            <DialogDescription>
              {confirm === 'halt'
                ? 'This will stop the bot, cancel all resting orders, disable all strategies, and trigger the circuit breaker. Manual restart required.'
                : 'This will cancel all resting orders. The bot will continue running.'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={execute}
              disabled={busy}
              className={confirm === 'halt' ? 'bg-red-600 hover:bg-red-500' : ''}
            >
              {busy ? 'Working...' : confirm === 'halt' ? 'HALT NOW' : 'Cancel All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}