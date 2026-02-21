/**
 * TradingModePanel — read-only display of current trading mode from backend.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useTradingBotState, type TradingMode } from '@/contexts/TradingBotContext';

interface ModeConfig {
  label: string;
  description: string;
  badgeClass: string;
  icon: React.ReactNode;
  ringClass: string;
}

const MODES: Record<TradingMode, ModeConfig> = {
  paper: {
    label: 'PAPER',
    description: 'Simulated fills. No real money.',
    badgeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    icon: <ShieldCheck className="w-4 h-4" />,
    ringClass: 'ring-yellow-500/60',
  },
  live: {
    label: 'LIVE',
    description: 'Real orders. Real money.',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/40',
    icon: <AlertTriangle className="w-4 h-4" />,
    ringClass: 'ring-green-500/60',
  },
};

export function TradingModePanel() {
  const { mode } = useTradingBotState();
  const currentMode = MODES[mode] ?? MODES.dry_run;

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Trading Mode
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`flex items-center gap-3 p-3 rounded-lg border ring-2 ${currentMode.ringClass} bg-muted/20`}>
          <div className="flex items-center gap-2">
            {currentMode.icon}
            <span className="font-bold text-lg">{currentMode.label}</span>
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          </div>
          <span className="text-sm text-muted-foreground">{currentMode.description}</span>
        </div>

        {mode === 'live' && (
          <div className="mt-3 flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/30 text-xs text-green-400">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            LIVE MODE — real orders are being placed with real capital
          </div>
        )}
      </CardContent>
    </Card>
  );
}