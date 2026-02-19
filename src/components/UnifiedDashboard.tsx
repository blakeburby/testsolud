/**
 * UnifiedDashboard — combines SOL market intelligence and operator controls
 * on a single page. EmergencyControls are always pinned at the top.
 *
 * Tabs:
 *  [Market Intelligence]  — price, charts, orderbook, simulation, strategy
 *  [Operator Controls]    — mode, bankroll, risk, orders, strategies, health
 */

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart2, Settings2 } from 'lucide-react';

// SOL market providers & components
import { SOLMarketsProvider } from '@/contexts/SOLMarketsContext';
import { QuantEngineProvider } from '@/contexts/QuantEngineContext';
import { MarketOverviewPanel } from './sol-dashboard/MarketOverviewPanel';
import { PriceChart } from './sol-dashboard/PriceChart';
import { SimulationPanel } from './sol-dashboard/SimulationPanel';
import { VolatilityPanel } from './sol-dashboard/VolatilityPanel';
import { PositioningPanel } from './sol-dashboard/PositioningPanel';
import { EdgeHeatmap } from './sol-dashboard/EdgeHeatmap';
import { TimeSlotPills } from './sol-dashboard/TimeSlotPills';
import { TradingButtons } from './sol-dashboard/TradingButtons';
import { OrderbookLadder } from './sol-dashboard/OrderbookLadder';
import { StrategySummary } from './sol-dashboard/StrategySummary';

// Operator provider & components
import { TradingBotProvider } from '@/contexts/TradingBotContext';
import { useTradingBotState } from '@/contexts/TradingBotContext';
import { EmergencyControls } from './operator-dashboard/EmergencyControls';
import { TradingModePanel } from './operator-dashboard/TradingModePanel';
import { BankrollPanel } from './operator-dashboard/BankrollPanel';
import { RiskDashboard } from './operator-dashboard/RiskDashboard';
import { OrderControlPanel } from './operator-dashboard/OrderControlPanel';
import { StrategyControlPanel } from './operator-dashboard/StrategyControlPanel';
import { SystemHealthPanel } from './operator-dashboard/SystemHealthPanel';

function StatusDot() {
  const { connected, status } = useTradingBotState();
  const botRunning = status?.running ?? false;
  const cbActive = status?.risk_metrics?.circuit_breaker_triggered ?? false;

  if (cbActive) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
        HALTED
      </span>
    );
  }
  if (!connected) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-yellow-400">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        Connecting…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${botRunning ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/40'}`} />
      {botRunning ? 'Bot running' : 'Bot stopped'}
    </span>
  );
}

function DashboardInner() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto px-3 py-3 space-y-3">

        {/* Global header */}
        <div className="flex items-center justify-between pb-1 border-b border-border/40">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Kalshi SOL/USD Trading</h1>
            <p className="text-xs text-muted-foreground mt-0.5">15-minute markets · All risk limits enforced server-side</p>
          </div>
          <div className="flex items-center gap-4">
            <StatusDot />
            <span className="text-xs text-muted-foreground font-mono">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Emergency controls — always visible */}
        <EmergencyControls />

        {/* Tabbed content */}
        <Tabs defaultValue="market" className="w-full">
          <TabsList className="mb-3">
            <TabsTrigger value="market" className="flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" />
              Market Intelligence
            </TabsTrigger>
            <TabsTrigger value="operator" className="flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" />
              Operator Controls
            </TabsTrigger>
          </TabsList>

          {/* ── Market tab ── */}
          <TabsContent value="market" className="mt-0 space-y-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              <MarketOverviewPanel />
              <SimulationPanel />
              <PositioningPanel />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              <VolatilityPanel />
              <PriceChart />
              <EdgeHeatmap />
            </div>
            <TimeSlotPills />
            <TradingButtons />
            <OrderbookLadder />
            <StrategySummary />
          </TabsContent>

          {/* ── Operator tab ── */}
          <TabsContent value="operator" className="mt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TradingModePanel />
              <BankrollPanel />
              <RiskDashboard />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OrderControlPanel />
              <StrategyControlPanel />
            </div>
            <SystemHealthPanel />
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}

export function UnifiedDashboard() {
  return (
    <SOLMarketsProvider>
      <QuantEngineProvider>
        <TradingBotProvider>
          <DashboardInner />
        </TradingBotProvider>
      </QuantEngineProvider>
    </SOLMarketsProvider>
  );
}