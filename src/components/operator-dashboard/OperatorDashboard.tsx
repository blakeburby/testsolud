/**
 * OperatorDashboard — full operator control layout.
 *
 * Layout (desktop):
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  [EmergencyControls — full width, always top]           │
 *  ├──────────────┬──────────────┬──────────────────────────┤
 *  │ TradingMode  │ BankrollPanel│ RiskDashboard             │
 *  ├──────────────┴──────────────┼──────────────────────────┤
 *  │ OrderControlPanel           │ StrategyControlPanel      │
 *  ├─────────────────────────────┴──────────────────────────┤
 *  │  SystemHealthPanel                                      │
 *  └─────────────────────────────────────────────────────────┘
 */

import React from 'react';
import { TradingModePanel } from './TradingModePanel';
import { BankrollPanel } from './BankrollPanel';
import { RiskDashboard } from './RiskDashboard';
import { OrderControlPanel } from './OrderControlPanel';
import { StrategyControlPanel } from './StrategyControlPanel';
import { SystemHealthPanel } from './SystemHealthPanel';
import { EmergencyControls } from './EmergencyControls';

export function OperatorDashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Kalshi Trading Operator</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Production control interface — read documentation before enabling live trading
          </p>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Emergency controls — always at top */}
      <EmergencyControls />

      {/* Row 1: Mode + Bankroll + Risk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TradingModePanel />
        <BankrollPanel />
        <RiskDashboard />
      </div>

      {/* Row 2: Orders + Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OrderControlPanel />
        <StrategyControlPanel />
      </div>

      {/* Row 3: System health — full width */}
      <SystemHealthPanel />

      {/* Footer */}
      <div className="text-xs text-muted-foreground/40 text-center pb-2">
        Kalshi Trading Bot · SOL/USD 15-min Markets · All risk limits enforced server-side
      </div>
    </div>
  );
}