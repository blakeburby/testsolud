 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { useCountdown } from '@/hooks/useCountdown';
 import { cn } from '@/lib/utils';
 import { Clock } from 'lucide-react';
 
 export function CountdownTimer() {
   const { selectedSlot } = useSOLMarkets();
   const countdown = useCountdown(selectedSlot?.windowEnd ?? null);
 
   return (
     <div className="flex items-center justify-center gap-3 py-4">
       <Clock
         className={cn(
           'h-6 w-6',
           countdown.urgency === 'urgent' && 'text-trading-down',
           countdown.urgency === 'warning' && 'text-timer-warning',
           countdown.urgency === 'normal' && 'text-trading-up'
         )}
       />
       <div className="flex flex-col items-center">
         <span
           className={cn(
             'text-4xl font-bold tabular-nums',
             countdown.urgency === 'urgent' && 'text-trading-down',
             countdown.urgency === 'warning' && 'text-timer-warning',
             countdown.urgency === 'normal' && 'text-trading-up'
           )}
         >
           {countdown.formatted}
         </span>
         <span className="text-sm text-muted-foreground">Time Remaining</span>
       </div>
     </div>
   );
 }