import { SOLMarketsProvider } from '@/contexts/SOLMarketsContext';
// Dashboard container with context provider
 import { PriceHeader } from './PriceHeader';
 import { PriceSection } from './PriceSection';
 import { PriceChart } from './PriceChart';
 import { TimeSlotPills } from './TimeSlotPills';
 import { TradingButtons } from './TradingButtons';
 import { OrderbookLadder } from './OrderbookLadder';
 
 function DashboardContent() {
   return (
     <div className="min-h-screen bg-background">
       <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
         <PriceHeader />
         <PriceSection />
         <PriceChart />
         <TimeSlotPills />
         <TradingButtons />
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