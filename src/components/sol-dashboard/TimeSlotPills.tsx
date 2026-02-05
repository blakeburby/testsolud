 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { Button } from '@/components/ui/button';
 import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
 import { format } from 'date-fns';
 import { cn } from '@/lib/utils';
 import { ChevronDown } from 'lucide-react';
 
 export function TimeSlotPills() {
   const { timeSlots, selectedSlot, selectSlot } = useSOLMarkets();
 
   if (timeSlots.length === 0) {
     return (
       <div className="py-3 text-center text-muted-foreground text-sm">
         No active trading windows
       </div>
     );
   }
 
   // Show only first 4-5 slots, rest go in "More"
   const visibleSlots = timeSlots.slice(0, 4);
   const hasMore = timeSlots.length > 4;
 
   return (
     <div className="flex items-center justify-between py-3 border-b border-border">
       <div className="flex items-center gap-2">
         {/* Past dropdown */}
         <Button
           variant="ghost"
           size="sm"
           className="text-sm font-medium text-muted-foreground hover:text-foreground"
         >
           Past
           <ChevronDown className="ml-1 h-4 w-4" />
         </Button>
 
         {visibleSlots.map((slot) => {
           const isSelected = selectedSlot?.windowEnd.getTime() === slot.windowEnd.getTime();
           const timeLabel = format(slot.windowEnd, 'h:mm a');
 
           return (
             <Button
               key={slot.windowEnd.toISOString()}
               variant="ghost"
               size="sm"
               onClick={() => selectSlot(slot)}
               disabled={slot.isPast}
               className={cn(
                 'text-sm font-medium rounded-full px-4',
                 isSelected 
                   ? 'bg-foreground text-background hover:bg-foreground/90' 
                   : 'text-foreground hover:bg-muted',
                 slot.isPast && 'opacity-50'
               )}
             >
               {slot.isActive && !isSelected && (
                 <span className="mr-1.5 h-2 w-2 rounded-full bg-trading-down" />
               )}
               {timeLabel}
             </Button>
           );
         })}
         
         {hasMore && (
           <Button
             variant="ghost"
             size="sm"
             className="text-sm font-medium text-muted-foreground hover:text-foreground"
           >
             More
             <ChevronDown className="ml-1 h-4 w-4" />
           </Button>
         )}
       </div>
 
       {/* View toggle icons */}
       <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
         <button className="p-2 rounded hover:bg-background transition-colors">
           <svg className="h-4 w-4 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
             <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
           </svg>
         </button>
         <button className="p-2 rounded hover:bg-background transition-colors">
           <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
             <line x1="3" y1="6" x2="21" y2="6" />
             <line x1="3" y1="12" x2="21" y2="12" />
             <line x1="3" y1="18" x2="21" y2="18" />
           </svg>
         </button>
       </div>
     </div>
   );
 }