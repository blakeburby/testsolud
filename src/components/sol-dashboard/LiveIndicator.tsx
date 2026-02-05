 import { cn } from '@/lib/utils';
 
 interface LiveIndicatorProps {
   isLive: boolean;
 }
 
 export function LiveIndicator({ isLive }: LiveIndicatorProps) {
   if (!isLive) return null;
 
   return (
     <div className="flex items-center gap-2">
       <span className="relative flex h-3 w-3">
         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-trading-up opacity-75" />
         <span className="relative inline-flex rounded-full h-3 w-3 bg-trading-up" />
       </span>
       <span className="text-sm font-medium text-trading-up">LIVE</span>
     </div>
   );
 }