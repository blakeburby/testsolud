 import { useRef, useEffect, useState } from 'react';
 import type { OrderbookLevel } from '@/types/sol-markets';
 
 type AnimationState = Record<string, 'flash-green' | 'flash-red' | null>;
 
 function getLevelKey(level: OrderbookLevel, index: number): string {
   return `${level.price}-${index}`;
 }
 
 function getNumericSize(size: unknown): number {
   if (typeof size === 'number' && !isNaN(size)) return size;
   if (typeof size === 'string') {
     const parsed = parseFloat(size);
     return isNaN(parsed) ? 0 : parsed;
   }
   return 0;
 }
 
 export function useOrderbookAnimations(
   bids: OrderbookLevel[],
   asks: OrderbookLevel[]
 ) {
   const [animations, setAnimations] = useState<AnimationState>({});
   const prevBidsRef = useRef<Map<number, number>>(new Map());
   const prevAsksRef = useRef<Map<number, number>>(new Map());
 
   useEffect(() => {
     const newAnimations: AnimationState = {};
 
     // Check bids for changes
     bids.forEach((bid, i) => {
       const key = getLevelKey(bid, i);
       const prevSize = prevBidsRef.current.get(bid.price);
       const currentSize = getNumericSize(bid.size);
 
       if (prevSize !== undefined && prevSize !== currentSize) {
         newAnimations[`bid-${key}`] = currentSize > prevSize ? 'flash-green' : 'flash-red';
       }
     });
 
     // Check asks for changes
     asks.forEach((ask, i) => {
       const key = getLevelKey(ask, i);
       const prevSize = prevAsksRef.current.get(ask.price);
       const currentSize = getNumericSize(ask.size);
 
       if (prevSize !== undefined && prevSize !== currentSize) {
         newAnimations[`ask-${key}`] = currentSize > prevSize ? 'flash-green' : 'flash-red';
       }
     });
 
     // Update refs
     prevBidsRef.current = new Map(bids.map(b => [b.price, getNumericSize(b.size)]));
     prevAsksRef.current = new Map(asks.map(a => [a.price, getNumericSize(a.size)]));
 
     if (Object.keys(newAnimations).length > 0) {
       setAnimations(newAnimations);
 
       // Clear animations after duration
       const timer = setTimeout(() => {
         setAnimations({});
       }, 300);
 
       return () => clearTimeout(timer);
     }
   }, [bids, asks]);
 
   const getAnimationClass = (side: 'bid' | 'ask', price: number, index: number): string => {
     const key = `${side}-${price}-${index}`;
     const anim = animations[key];
     if (anim === 'flash-green') return 'animate-flash-green';
     if (anim === 'flash-red') return 'animate-flash-red';
     return '';
   };
 
   return { getAnimationClass };
 }