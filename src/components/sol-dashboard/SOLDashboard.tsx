import { SOLMarketsProvider } from '@/contexts/SOLMarketsContext';
import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
// Dashboard container with context provider
 import { PriceHeader } from './PriceHeader';
 import { PriceSection } from './PriceSection';
 import { PriceChart } from './PriceChart';
 import { TimeSlotPills } from './TimeSlotPills';
 import { TradingButtons } from './TradingButtons';
 import { OrderbookLadder } from './OrderbookLadder';
import { TechnicalIndicators } from './TechnicalIndicators';
import { TradeTape } from './TradeTape';
 
 function DashboardContent() {
   const { indicators, trades, currentPrice, selectedMarket } = useSOLMarkets();
   const strikePrice = selectedMarket?.strikePrice ?? null;

   return (
     <div className="min-h-screen bg-background">
       <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
         <PriceHeader />
         
         {/* Price Section + Technical Indicators */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
           <PriceSection />
           <TechnicalIndicators 
             indicators={indicators} 
             currentPrice={currentPrice} 
             strikePrice={strikePrice} 
           />
         </div>
         
         <PriceChart />
         <TimeSlotPills />
         <TradingButtons />
         
         {/* Orderbook + Trade Tape */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
           <OrderbookLadder />
           <TradeTape trades={trades} />
         </div>
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