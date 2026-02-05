 import { useState, useCallback, useRef } from 'react';
 import type { TradeRecord } from '@/types/quant';
 
 const MAX_BUFFER_SIZE = 1000;
 
 // Ring buffer for O(1) insert performance
 export function useTradeBuffer() {
   const [trades, setTrades] = useState<TradeRecord[]>([]);
   const idCounterRef = useRef(0);
 
   const addTrade = useCallback((trade: Omit<TradeRecord, 'id'>) => {
     const newTrade: TradeRecord = {
       ...trade,
       id: `trade-${idCounterRef.current++}`,
     };
 
     setTrades(prev => {
       const updated = [...prev, newTrade];
       // Keep only last MAX_BUFFER_SIZE trades
       if (updated.length > MAX_BUFFER_SIZE) {
         return updated.slice(-MAX_BUFFER_SIZE);
       }
       return updated;
     });
 
     return newTrade;
   }, []);
 
   const clearBuffer = useCallback(() => {
     setTrades([]);
   }, []);
 
   // Get trades within a time window (in ms)
   const getTradesInWindow = useCallback((windowMs: number): TradeRecord[] => {
     const cutoff = Date.now() - windowMs;
     return trades.filter(t => t.timestamp >= cutoff);
   }, [trades]);
 
   // Get the most recent N trades
   const getRecentTrades = useCallback((count: number): TradeRecord[] => {
     return trades.slice(-count);
   }, [trades]);
 
   return {
     trades,
     addTrade,
     clearBuffer,
     getTradesInWindow,
     getRecentTrades,
     tradeCount: trades.length,
   };
 }