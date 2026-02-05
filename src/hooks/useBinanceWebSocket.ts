 import { useState, useEffect, useRef, useCallback } from 'react';
 
 interface BinanceTradeMessage {
   e: "trade";
   s: string;
   p: string;
   q: string;
   T: number;
 }
 
 interface WebSocketState {
   price: number | null;
   timestamp: number | null;
   isConnected: boolean;
   error: string | null;
 }
 
 export function useBinanceWebSocket(symbol: string = 'solusdt') {
   const [state, setState] = useState<WebSocketState>({
     price: null,
     timestamp: null,
     isConnected: false,
     error: null,
   });
 
   const wsRef = useRef<WebSocket | null>(null);
   const reconnectAttemptRef = useRef(0);
   const reconnectTimeoutRef = useRef<number | null>(null);
   const isMountedRef = useRef(true);
 
   const scheduleReconnect = useCallback(() => {
     if (!isMountedRef.current) return;
     
     const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 15000);
     reconnectAttemptRef.current++;
     console.log(`WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);
     
     reconnectTimeoutRef.current = window.setTimeout(() => {
       if (isMountedRef.current) {
         connect();
       }
     }, delay);
   }, []);
 
   const connect = useCallback(() => {
     if (!isMountedRef.current) return;
     
     // Close existing connection if any
     if (wsRef.current) {
       wsRef.current.close();
       wsRef.current = null;
     }
 
     console.log(`Opening WebSocket connection to Binance for ${symbol}...`);
     const ws = new WebSocket(`wss://stream.binance.us:9443/ws/${symbol}@trade`);
 
     ws.onopen = () => {
       if (!isMountedRef.current) {
         ws.close();
         return;
       }
       console.log('Binance WebSocket connected');
       setState(prev => ({ ...prev, isConnected: true, error: null }));
       reconnectAttemptRef.current = 0;
     };
 
     ws.onmessage = (event) => {
       if (!isMountedRef.current) return;
       
       try {
         const data: BinanceTradeMessage = JSON.parse(event.data);
         if (data.e === 'trade' && data.p) {
           setState(prev => ({
             ...prev,
             price: parseFloat(data.p),
             timestamp: data.T,
           }));
         }
       } catch (error) {
         console.warn('Failed to parse WebSocket message:', error);
       }
     };
 
     ws.onerror = (error) => {
       console.error('WebSocket error:', error);
       if (isMountedRef.current) {
         setState(prev => ({ ...prev, error: 'Connection error' }));
       }
     };
 
     ws.onclose = (event) => {
       console.log('WebSocket closed:', event.code, event.reason);
       if (isMountedRef.current) {
         setState(prev => ({ ...prev, isConnected: false }));
         scheduleReconnect();
       }
     };
 
     wsRef.current = ws;
   }, [symbol, scheduleReconnect]);
 
   useEffect(() => {
     isMountedRef.current = true;
     connect();
 
     return () => {
       isMountedRef.current = false;
       if (reconnectTimeoutRef.current) {
         clearTimeout(reconnectTimeoutRef.current);
         reconnectTimeoutRef.current = null;
       }
       if (wsRef.current) {
         wsRef.current.close();
         wsRef.current = null;
       }
     };
   }, [connect]);
 
   return state;
 }