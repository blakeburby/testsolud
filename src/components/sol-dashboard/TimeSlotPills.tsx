 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { Button } from '@/components/ui/button';
 import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
 import { format } from 'date-fns';
 import { cn } from '@/lib/utils';
 
 export function TimeSlotPills() {
   const { timeSlots, selectedSlot, selectSlot } = useSOLMarkets();
 
   if (timeSlots.length === 0) {
     return (
       <div className="py-4 text-center text-muted-foreground">
         No active trading windows
       </div>
     );
   }
 
   return (
     <ScrollArea className="w-full whitespace-nowrap">
       <div className="flex gap-2 py-4">
         {timeSlots.map((slot) => {
           const isSelected = selectedSlot?.windowEnd.getTime() === slot.windowEnd.getTime();
           const timeLabel = format(slot.windowEnd, 'h:mm');
 
           return (
             <Button
               key={slot.windowEnd.toISOString()}
               variant={isSelected ? 'default' : 'outline'}
               size="sm"
               onClick={() => selectSlot(slot)}
               disabled={slot.isPast}
               className={cn(
                 'min-w-[80px]',
                 slot.isPast && 'opacity-50',
                 slot.isActive && !isSelected && 'border-trading-up'
               )}
             >
               {timeLabel}
               {slot.isActive && (
                 <span className="ml-1 h-2 w-2 rounded-full bg-trading-up" />
               )}
             </Button>
           );
         })}
       </div>
       <ScrollBar orientation="horizontal" />
     </ScrollArea>
   );
 }