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
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Market Overview — full width */}
        <MarketOverviewPanel />

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column — 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            <PriceChart />
            <SimulationPanel />
          </div>

          {/* Right column — 1/3 */}
          <div className="space-y-4">
            <VolatilityPanel />
            <PositioningPanel />
            <EdgeHeatmap />
          </div>
        </div>

        {/* Trading controls */}
        <TimeSlotPills />
        <TradingButtons />
        <OrderbookLadder />

        {/* Strategy documentation */}
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
