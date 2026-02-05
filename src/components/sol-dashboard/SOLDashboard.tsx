 import { SOLMarketsProvider } from '@/contexts/SOLMarketsContext';
 import { PriceHeader } from './PriceHeader';
 import { CurrentPrice } from './CurrentPrice';
 import { PriceToBeat } from './PriceToBeat';
 import { CountdownTimer } from './CountdownTimer';
 import { PriceChart } from './PriceChart';
 import { TimeSlotPills } from './TimeSlotPills';
 import { TradingButtons } from './TradingButtons';
 import { OrderbookLadder } from './OrderbookLadder';
 import { Card, CardContent } from '@/components/ui/card';
 import { Separator } from '@/components/ui/separator';
 
 function DashboardContent() {
   return (
     <div className="min-h-screen bg-background p-4 md:p-6">
       <div className="max-w-2xl mx-auto space-y-6">
         <PriceHeader />
 
         <Card className="border-border bg-card">
           <CardContent className="p-6 space-y-4">
             <CurrentPrice />
             <PriceToBeat />
             <CountdownTimer />
           </CardContent>
         </Card>
 
         <Card className="border-border bg-card">
           <CardContent className="p-4">
             <PriceChart />
           </CardContent>
         </Card>
 
         <TimeSlotPills />
 
         <Separator />
 
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