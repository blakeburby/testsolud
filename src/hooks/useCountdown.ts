 import { useState, useEffect, useCallback } from 'react';
 
 interface CountdownState {
   minutes: number;
   seconds: number;
   totalSeconds: number;
   isExpired: boolean;
   formatted: string;
   urgency: 'normal' | 'warning' | 'urgent';
 }
 
 export function useCountdown(targetDate: Date | null): CountdownState {
   const [state, setState] = useState<CountdownState>({
     minutes: 0,
     seconds: 0,
     totalSeconds: 0,
     isExpired: true,
     formatted: '0:00',
     urgency: 'normal',
   });
 
   const calculateTimeLeft = useCallback(() => {
     if (!targetDate) {
       return {
         minutes: 0,
         seconds: 0,
         totalSeconds: 0,
         isExpired: true,
         formatted: '0:00',
         urgency: 'normal' as const,
       };
     }
 
     const now = new Date();
     const diff = targetDate.getTime() - now.getTime();
 
     if (diff <= 0) {
       return {
         minutes: 0,
         seconds: 0,
         totalSeconds: 0,
         isExpired: true,
         formatted: '0:00',
         urgency: 'urgent' as const,
       };
     }
 
     const totalSeconds = Math.floor(diff / 1000);
     const minutes = Math.floor(totalSeconds / 60);
     const seconds = totalSeconds % 60;
 
     let urgency: 'normal' | 'warning' | 'urgent' = 'normal';
     if (totalSeconds <= 30) {
       urgency = 'urgent';
     } else if (totalSeconds <= 120) {
       urgency = 'warning';
     }
 
     return {
       minutes,
       seconds,
       totalSeconds,
       isExpired: false,
       formatted: `${minutes}:${seconds.toString().padStart(2, '0')}`,
       urgency,
     };
   }, [targetDate]);
 
   useEffect(() => {
     setState(calculateTimeLeft());
 
     const interval = setInterval(() => {
       setState(calculateTimeLeft());
     }, 1000);
 
     return () => clearInterval(interval);
   }, [calculateTimeLeft]);
 
   return state;
 }