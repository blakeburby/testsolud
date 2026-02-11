import { SOLMarketsProvider } from '@/contexts/SOLMarketsContext';
import { MarketOverviewPanel } from './MarketOverviewPanel';
import { PriceChart } from './PriceChart';
import { SimulationPanel } from './SimulationPanel';
import { VolatilityPanel } from './VolatilityPanel';
import { PositioningPanel } from './PositioningPanel';
import { EdgeHeatmap } from './EdgeHeatmap';
import { TimeSlotPills } from './TimeSlotPills';
import { TradingButtons } from './TradingButtons';
import { OrderbookLadder } from './OrderbookLadder';
import { StrategySummary } from './StrategySummary';

function DashboardContent() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto px-3 py-3 space-y-2">
        {/* Row 1: 3-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <MarketOverviewPanel />
          <SimulationPanel />
          <PositioningPanel />
        </div>

        {/* Row 2: 3-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <VolatilityPanel />
          <PriceChart />
          <EdgeHeatmap />
        </div>

        {/* Trading controls */}
        <TimeSlotPills />
        <TradingButtons />
        <OrderbookLadder />
        <StrategySummary />
      </div>
    </div>
  );
}

export function SOLDashboard() {
  return (
    <SOLMarketsProvider>
      <DashboardContent />
    </SOLMarketsProvider>
  );
}
