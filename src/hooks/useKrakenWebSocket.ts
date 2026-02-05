 import { useState, useEffect, useRef, useCallback } from 'react';
 
 interface WebSocketState {
   price: number | null;
   timestamp: number | null;
   isConnected: boolean;
   error: string | null;
 }
 
 interface KrakenTradeMessage {
   channel: string;
   type: string;
   data: Array<{
     symbol: string;
     side: string;
     price: number;
     qty: number;
     ord_type: string;
     trade_id: number;
     timestamp: string;
   }>;
 }
 
 const KRAKEN_WS_URL = 'wss://ws.kraken.com/v2';
 const MAX_RECONNECT_DELAY = 30000;
 const INITIAL_RECONNECT_DELAY = 1000;
 
 export function useKrakenWebSocket(symbol: string = 'SOL/USD') {
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
 
   const getReconnectDelay = useCallback(() => {
     const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current);
     return Math.min(delay, MAX_RECONNECT_DELAY);
   }, []);
 
   const connect = useCallback(() => {
     if (!isMountedRef.current) return;
     
     // Clean up existing connection
     if (wsRef.current) {
       wsRef.current.close();
       wsRef.current = null;
     }
 
     console.log('[Kraken WS] Connecting to', KRAKEN_WS_URL);
     const ws = new WebSocket(KRAKEN_WS_URL);
     wsRef.current = ws;
 
     ws.onopen = () => {
       if (!isMountedRef.current) return;
       
       console.log('[Kraken WS] Connected, subscribing to trades...');
       reconnectAttemptRef.current = 0;
       
       // Subscribe to trades channel
       const subscribeMsg = {
         method: 'subscribe',
         params: {
           channel: 'trade',
           symbol: [symbol],
         },
       };
       ws.send(JSON.stringify(subscribeMsg));
       
       setState(prev => ({
         ...prev,
         isConnected: true,
         error: null,
       }));
     };
 
     ws.onmessage = (event) => {
       if (!isMountedRef.current) return;
       
       try {
         const message = JSON.parse(event.data);
         
         // Ignore heartbeat and system messages
         if (message.channel === 'heartbeat' || message.method === 'pong') {
           return;
         }
         
         // Handle subscription confirmation
         if (message.method === 'subscribe' && message.success) {
           console.log('[Kraken WS] Subscribed to', message.result?.channel);
           return;
         }
         
         // Handle trade updates
         if (message.channel === 'trade' && message.type === 'update' && message.data) {
           const trades = message.data as KrakenTradeMessage['data'];
           
           if (trades.length > 0) {
             // Get the most recent trade
             const latestTrade = trades[trades.length - 1];
             const tradeTimestamp = new Date(latestTrade.timestamp).getTime();
             
             console.log(`[Kraken WS] Trade: $${latestTrade.price.toFixed(4)} | ${new Date(tradeTimestamp).toLocaleTimeString()}`);
             
             setState({
               price: latestTrade.price,
               timestamp: tradeTimestamp,
               isConnected: true,
               error: null,
             });
           }
         }
       } catch (err) {
         console.warn('[Kraken WS] Failed to parse message:', err);
       }
     };
 
     ws.onerror = (error) => {
       console.error('[Kraken WS] Error:', error);
       if (!isMountedRef.current) return;
       
       setState(prev => ({
         ...prev,
         isConnected: false,
         error: 'WebSocket error',
       }));
     };
 
     ws.onclose = (event) => {
       console.log('[Kraken WS] Disconnected:', event.code, event.reason);
       if (!isMountedRef.current) return;
       
       setState(prev => ({
         ...prev,
         isConnected: false,
       }));
       
       // Attempt reconnection with exponential backoff
       const delay = getReconnectDelay();
       reconnectAttemptRef.current++;
       
       console.log(`[Kraken WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);
       
       reconnectTimeoutRef.current = window.setTimeout(() => {
         if (isMountedRef.current) {
           connect();
         }
       }, delay);
     };
   }, [symbol, getReconnectDelay]);
 
   useEffect(() => {
     isMountedRef.current = true;
     connect();
 
     return () => {
       isMountedRef.current = false;
       
       if (reconnectTimeoutRef.current) {
         clearTimeout(reconnectTimeoutRef.current);
       }
       
       if (wsRef.current) {
         wsRef.current.close();
         wsRef.current = null;
       }
     };
   }, [connect]);
 
   return state;
 }