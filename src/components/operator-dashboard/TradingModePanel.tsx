/**
 * TradingModePanel — shows current trading mode and allows switching between PAPER and LIVE.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useTradingBotState, useTradingBotActions, type TradingMode } from '@/contexts/TradingBotContext';
import { useToast } from '@/hooks/use-toast';

interface ModeConfig {
  label: string;
  description: string;
  icon: React.ReactNode;
  ringClass: string;
  btnActiveClass: string;
}

const MODES: Record<TradingMode, ModeConfig> = {
  paper: {
    label: 'PAPER',
    description: 'Simulated fills. No real money.',
    icon: <ShieldCheck className="w-4 h-4" />,
    ringClass: 'ring-yellow-500/60',
    btnActiveClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40 ring-2 ring-yellow-500/60',
  },
  live: {
    label: 'LIVE',
    description: 'Real orders. Real money.',
    icon: <AlertTriangle className="w-4 h-4" />,
    ringClass: 'ring-green-500/60',
    btnActiveClass: 'bg-green-500/20 text-green-400 border-green-500/40 ring-2 ring-green-500/60',
  },
};

export function TradingModePanel() {
  const { mode } = useTradingBotState();
  const { setMode } = useTradingBotActions();
  const { toast } = useToast();

  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const currentMode = MODES[mode] ?? MODES.paper;

  const handleModeClick = (target: TradingMode) => {
    if (target === mode || busy) return;
    if (target === 'live') {
      setRiskAcknowledged(false);
      setShowLiveConfirm(true);
      return;
    }
    switchMode('paper');
  };

  const switchMode = async (target: TradingMode) => {
    setBusy(true);
    try {
      await setMode(target);
      toast({ title: `Switched to ${MODES[target].label}`, description: MODES[target].description });
    } catch (err) {
      toast({ title: 'Mode switch failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const confirmGoLive = async () => {
    if (!riskAcknowledged) {
      toast({ title: 'Acknowledge risk first', variant: 'destructive' });
      return;
    }
    setShowLiveConfirm(false);
    await switchMode('live');
  };

  return (
    <>
      <Card className="border border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Trading Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Current mode indicator */}
          <div className={`flex items-center gap-3 p-3 rounded-lg border ring-2 ${currentMode.ringClass} bg-muted/20`}>
            <div className="flex items-center gap-2">
              {currentMode.icon}
              <span className="font-bold text-lg">{currentMode.label}</span>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            </div>
            <span className="text-sm text-muted-foreground">{currentMode.description}</span>
          </div>

          {/* Mode selector buttons */}
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(MODES) as TradingMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeClick(m)}
                disabled={busy || mode === m}
                className={`
                  relative p-3 rounded-lg border text-sm font-medium transition-all
                  ${mode === m
                    ? MODES[m].btnActiveClass
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

          {mode === 'live' && (
            <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/30 text-xs text-green-400">
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
            <DialogDescription>
              This will enable real order submission to Kalshi with real capital.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/5 space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-yellow-400">Risk summary</p>
              <ul className="space-y-1">
                <li>• Max position size enforced by risk manager</li>
                <li>• Daily and weekly loss caps with circuit breakers</li>
                <li>• Drawdown threshold triggers automatic halt</li>
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
                I understand that LIVE mode places real orders on Kalshi with real money,
                and I accept full responsibility for any losses.
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLiveConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmGoLive}
              disabled={!riskAcknowledged || busy}
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