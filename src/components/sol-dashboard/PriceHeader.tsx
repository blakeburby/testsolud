 import { LiveIndicator } from './LiveIndicator';
 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { format } from 'date-fns';
 
 export function PriceHeader() {
   const { selectedSlot, isLive } = useSOLMarkets();
 
   const timeRange = selectedSlot
     ? `${format(selectedSlot.windowStart, 'h:mm a')} - ${format(selectedSlot.windowEnd, 'h:mm a')} ET`
     : 'No active slot';
 
   return (
     <div className="flex items-center justify-between">
       <div>
         <h1 className="text-xl font-semibold text-foreground">SOL 15-Minute "Up or Down"</h1>
         <p className="text-muted-foreground">{timeRange}</p>
       </div>
       <LiveIndicator isLive={isLive} />
     </div>
   );
 }