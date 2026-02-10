import { SOLMarketsProvider } from '@/contexts/SOLMarketsContext';
// Dashboard container with context provider
 import { PriceHeader } from './PriceHeader';
 import { PriceSection } from './PriceSection';
 import { PriceChart } from './PriceChart';
 import { TimeSlotPills } from './TimeSlotPills';
 import { TradingButtons } from './TradingButtons';
 import { TradePlan } from './TradePlan';
 import { OrderbookLadder } from './OrderbookLadder';
 import { DebugPanel } from './DebugPanel';
 
 function DashboardContent() {
   return (
     <div className="min-h-screen bg-background">
       <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
         <PriceHeader />
         <PriceSection />
         <PriceChart />
         <TimeSlotPills />
          <TradingButtons />
          <TradePlan />
          <DebugPanel />
          <OrderbookLadder />
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