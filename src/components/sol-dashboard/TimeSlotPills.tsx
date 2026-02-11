import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export function TimeSlotPills() {
  const { timeSlots, selectedSlot, selectSlot } = useSOLMarkets();

  if (timeSlots.length === 0) {
    return (
      <div className="py-2 text-center text-muted-foreground text-xs">
        No active trading windows
      </div>
    );
  }

  const visibleSlots = timeSlots.slice(0, 4);
  const hasMore = timeSlots.length > 4;

  return (
    <div className="flex items-center justify-between py-2 border-b border-border">
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 px-2">
          Past <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
        {visibleSlots.map((slot) => {
          const isSelected = selectedSlot?.windowEnd.getTime() === slot.windowEnd.getTime();
          return (
            <Button
              key={slot.windowEnd.toISOString()}
              variant="ghost"
              size="sm"
              onClick={() => selectSlot(slot)}
              disabled={slot.isPast}
              className={cn(
                'text-xs font-mono rounded-sm px-3 h-7',
                isSelected
                  ? 'bg-foreground text-background'
                  : 'text-foreground hover:bg-muted',
                slot.isPast && 'opacity-50'
              )}
            >
              {format(slot.windowEnd, 'h:mm a')}
            </Button>
          );
        })}
        {hasMore && (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 px-2">
            More <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-0.5 bg-muted rounded-sm p-0.5">
        <button className="p-1.5 rounded-sm hover:bg-background">
          <svg className="h-3.5 w-3.5 text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </button>
        <button className="p-1.5 rounded-sm hover:bg-background">
          <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
