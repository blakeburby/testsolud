 import { useState, useEffect, useRef } from 'react';
 
 interface WebSocketState {
   price: number | null;
   timestamp: number | null;
   isConnected: boolean;
   error: string | null;
 }
 
 const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
 const POLL_INTERVAL = 500; // Poll every 500ms for near real-time updates
 
 export function useBinanceWebSocket(symbol: string = 'solusdt') {
   const [state, setState] = useState<WebSocketState>({
     price: null,
     timestamp: null,
     isConnected: false,
     error: null,
   });
 
   const reconnectAttemptRef = useRef(0);
   const isMountedRef = useRef(true);
 
   useEffect(() => {
     isMountedRef.current = true;
     
     const pollPrice = async () => {
       if (!isMountedRef.current) return;
       
       try {
         const response = await fetch(`${SUPABASE_URL}/functions/v1/binance-ws-proxy`);
         
         if (!response.ok) {
           throw new Error(`HTTP ${response.status}`);
         }
         
         const data = await response.json();
         
         if (!isMountedRef.current) return;
         
         if (data.price !== null) {
           setState({
             price: data.price,
             timestamp: data.timestamp,
             isConnected: data.connected ?? true,
             error: null,
           });
           reconnectAttemptRef.current = 0;
         } else {
           // No price yet, but connection is working
           setState(prev => ({
             ...prev,
             isConnected: data.connected ?? false,
             error: null,
           }));
         }
       } catch (error) {
         if (!isMountedRef.current) return;
         
         console.warn('Price poll failed:', error);
         
         // Exponential backoff for errors
         reconnectAttemptRef.current++;
         
         setState(prev => ({
           ...prev,
           isConnected: false,
           error: 'Connection error',
         }));
       }
     };
     
     // Initial fetch
     pollPrice();
     
     // Poll at regular intervals
     const interval = setInterval(pollPrice, POLL_INTERVAL);
 
     return () => {
       isMountedRef.current = false;
       clearInterval(interval);
     };
   }, [symbol]);
 
   return state;
 }