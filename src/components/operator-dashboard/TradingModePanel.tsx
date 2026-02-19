/**
 * TradingModePanel — switch between DRY RUN / PAPER / LIVE modes.
 *
 * LIVE requires:
 *  - Explicit confirmation modal
 *  - Bankroll entry
 *  - "I understand risk" checkbox
 *
 * Cannot accidentally deploy live.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ShieldCheck, TestTube } from 'lucide-react';
import { useTradingBotState, useTradingBotActions, type TradingMode } from '@/contexts/TradingBotContext';
import { useToast } from '@/hooks/use-toast';

interface ModeConfig {
  label: string;
  description: string;
  badge: string;
  badgeClass: string;
  icon: React.ReactNode;
  ringClass: string;
}

const MODES: Record<TradingMode, ModeConfig> = {
  dry_run: {
    label: 'DRY RUN',
    description: 'No orders sent. Signals logged only.',
    badge: 'DRY RUN',
    badgeClass: 'bg-red-500/20 text-red-400 border-red-500/40',
    icon: <TestTube className="w-4 h-4" />,
    ringClass: 'ring-red-500/60',
  },
  paper: {
    label: 'PAPER',
    description: 'Simulated fills. No real money.',
    badge: 'PAPER',
    badgeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    icon: <ShieldCheck className="w-4 h-4" />,
    ringClass: 'ring-yellow-500/60',
  },
  live: {
    label: 'LIVE',
    description: 'Real orders. Real money.',
    badge: 'LIVE',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/40',
    icon: <AlertTriangle className="w-4 h-4" />,
    ringClass: 'ring-green-500/60',
  },
};

export function TradingModePanel() {
  const { mode } = useTradingBotState();
  const { setMode } = useTradingBotActions();
  const { toast } = useToast();

  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [confirmBankroll, setConfirmBankroll] = useState('');
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const currentMode = MODES[mode] ?? MODES.dry_run;

  const handleModeClick = (target: TradingMode) => {
    if (target === mode) return;
    if (target === 'live') {
      setShowLiveConfirm(true);
      return;
    }
    switchMode(target);
  };

  const switchMode = async (target: TradingMode, bankroll?: number) => {
    setBusy(true);
    try {
      await setMode(target, bankroll);
      toast({ title: `Mode: ${MODES[target].label}`, description: MODES[target].description });
    } catch (err) {
      toast({ title: 'Mode switch failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const confirmGoLive = async () => {
    const bankroll = parseFloat(confirmBankroll);
    if (!bankroll || bankroll <= 0) {
      toast({ title: 'Invalid bankroll', description: 'Enter a positive number', variant: 'destructive' });
      return;
    }
    if (!riskAcknowledged) {
      toast({ title: 'Acknowledge risk first', variant: 'destructive' });
      return;
    }
    setShowLiveConfirm(false);
    await switchMode('live', bankroll);
    setConfirmBankroll('');
    setRiskAcknowledged(false);
  };

  return (
    <>
      <Card className="border border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Trading Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Current mode indicator */}
          <div className={`flex items-center gap-3 p-3 rounded-lg border ring-2 ${currentMode.ringClass} mb-4 bg-muted/20`}>
            <div className="flex items-center gap-2">
              {currentMode.icon}
              <span className="font-bold text-lg">{currentMode.label}</span>
            </div>
            <span className="text-sm text-muted-foreground">{currentMode.description}</span>
          </div>

          {/* Mode selector buttons */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODES) as TradingMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeClick(m)}
                disabled={busy || mode === m}
                className={`
                  relative p-3 rounded-lg border text-sm font-medium transition-all
                  ${mode === m
                    ? `${MODES[m].badgeClass} ring-2 ${MODES[m].ringClass} cursor-default`
                    : 'border-border/40 text-muted-foreground hover:border-border hover:text-foreground'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                <div className="flex flex-col items-center gap-1">
                  {MODES[m].icon}
                  <span>{MODES[m].label}</span>
                </div>
                {mode === m && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-current animate-pulse" />
                )}
              </button>
            ))}
          </div>

          {/* Warning banner in live mode */}
          {mode === 'live' && (
            <div className="mt-3 flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/30 text-xs text-green-400">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              LIVE MODE — real orders are being placed with real capital
            </div>
          )}
        </CardContent>
      </Card>

      {/* LIVE confirmation modal */}
      <Dialog open={showLiveConfirm} onOpenChange={setShowLiveConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-400">
              <AlertTriangle className="w-5 h-5" />
              Confirm LIVE Trading
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will enable real order submission to Kalshi with real capital.
              This action cannot be undone without manual mode switch.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="bankroll-confirm" className="text-sm">Confirm bankroll ($)</Label>
              <Input
                id="bankroll-confirm"
                type="number"
                min="1"
                step="100"
                placeholder="e.g. 10000"
                value={confirmBankroll}
                onChange={(e) => setConfirmBankroll(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Risk controls will be calibrated to this amount.
              </p>
            </div>

            <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/5 space-y-2 text-sm">
              <p className="font-medium text-yellow-400">Risk summary</p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                <li>• Max position size: enforced by risk manager</li>
                <li>• Daily loss cap: enforced by circuit breaker</li>
                <li>• Drawdown threshold: automatic halt</li>
                <li>• Dry-run mode: DISABLED once confirmed</li>
              </ul>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={riskAcknowledged}
                onChange={(e) => setRiskAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-yellow-400"
              />
              <span className="text-sm">
                I understand that enabling LIVE mode will place real orders on Kalshi
                with real money, and I accept full responsibility for any losses.
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLiveConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmGoLive}
              disabled={!riskAcknowledged || !confirmBankroll || busy}
              className="bg-green-600 hover:bg-green-500 text-white"
            >
              {busy ? 'Enabling...' : 'Enable LIVE Trading'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}