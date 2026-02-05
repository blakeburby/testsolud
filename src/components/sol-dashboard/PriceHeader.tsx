 import { useSOLMarkets } from '@/contexts/SOLMarketsContext';
 import { format } from 'date-fns';
 import { Link2, Bookmark } from 'lucide-react';
 
 export function PriceHeader() {
   const { selectedSlot, isLive } = useSOLMarkets();
 
   const timeRange = selectedSlot
     ? `${format(selectedSlot.windowStart, 'MMMM d')}, ${format(selectedSlot.windowStart, 'h:mm')}-${format(selectedSlot.windowEnd, 'h:mm a')} ET`
     : '';
 
   return (
     <div className="flex items-center justify-between py-4 border-b border-border">
       <div className="flex items-center gap-3">
         {/* Solana Logo */}
         <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 via-blue-500 to-teal-400 flex items-center justify-center">
           <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="currentColor">
             <path d="M4.5 7.5L12 3l7.5 4.5v3l-7.5 4.5-7.5-4.5v-3z" opacity="0.6"/>
             <path d="M4.5 10.5L12 6l7.5 4.5v3l-7.5 4.5-7.5-4.5v-3z" opacity="0.8"/>
             <path d="M4.5 13.5L12 9l7.5 4.5v3l-7.5 4.5-7.5-4.5v-3z"/>
           </svg>
         </div>
         <div>
           <h1 className="text-xl font-semibold text-foreground">Solana Up or Down</h1>
           <p className="text-sm text-muted-foreground">{timeRange}</p>
         </div>
       </div>
       <div className="flex items-center gap-3">
         <button className="p-2 hover:bg-muted rounded-lg transition-colors">
           <Link2 className="h-5 w-5 text-muted-foreground" />
         </button>
         <button className="p-2 hover:bg-muted rounded-lg transition-colors">
           <Bookmark className="h-5 w-5 text-muted-foreground" />
         </button>
       </div>
     </div>
   );
 }