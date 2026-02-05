 import { useState, useEffect, useRef, useCallback } from 'react';
 
 interface PriceState {
   price: number | null;
   timestamp: number | null;
   isConnected: boolean;
   sequence: number;
   sources: {
     kraken: boolean;
     coinbase: boolean;
     binance: boolean;
   };
 }
 
 const KRAKEN_WS_URL = 'wss://ws.kraken.com/v2';
 const COINBASE_WS_URL = 'wss://ws-feed.exchange.coinbase.com';
 const BINANCE_WS_URL = 'wss://stream.binance.us:9443/ws/solusd@aggTrade';
 
 const MAX_RECONNECT_DELAY = 30000;
 const INITIAL_RECONNECT_DELAY = 1000;
 
 export function useMultiSourcePrice(symbol: string = 'SOL/USD') {
   const [state, setState] = useState<PriceState>({
     price: null,
     timestamp: null,
     isConnected: false,
     sequence: 0,
     sources: { kraken: false, coinbase: false, binance: false },
   });
 
   const krakenWsRef = useRef<WebSocket | null>(null);
   const coinbaseWsRef = useRef<WebSocket | null>(null);
   const binanceWsRef = useRef<WebSocket | null>(null);
   
   const krakenReconnectRef = useRef(0);
   const coinbaseReconnectRef = useRef(0);
   const binanceReconnectRef = useRef(0);
   
   const isMountedRef = useRef(true);
 
   const getReconnectDelay = useCallback((attempts: number) => {
     const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, attempts);
     return Math.min(delay, MAX_RECONNECT_DELAY);
   }, []);
 
   const updatePrice = useCallback((price: number, timestamp: number, source: string) => {
     if (!isMountedRef.current) return;
     
     setState(prev => ({
       ...prev,
       price,
       timestamp,
       sequence: prev.sequence + 1,
       isConnected: prev.sources.kraken || prev.sources.coinbase || prev.sources.binance,
     }));
     
     console.log(`[${source}] $${price.toFixed(4)} | ${new Date(timestamp).toLocaleTimeString()}`);
   }, []);
 
   const updateSourceStatus = useCallback((source: 'kraken' | 'coinbase' | 'binance', connected: boolean) => {
     if (!isMountedRef.current) return;
     
     setState(prev => {
       const newSources = { ...prev.sources, [source]: connected };
       return {
         ...prev,
         sources: newSources,
         isConnected: newSources.kraken || newSources.coinbase || newSources.binance,
       };
     });
   }, []);
 
   // Kraken WebSocket
   const connectKraken = useCallback(() => {
     if (!isMountedRef.current) return;
     
     if (krakenWsRef.current) {
       krakenWsRef.current.close();
     }
 
     const ws = new WebSocket(KRAKEN_WS_URL);
     krakenWsRef.current = ws;
 
     ws.onopen = () => {
       if (!isMountedRef.current) return;
       console.log('[Kraken] Connected');
       krakenReconnectRef.current = 0;
       
       ws.send(JSON.stringify({
         method: 'subscribe',
         params: { channel: 'trade', symbol: [symbol] },
       }));
       
       updateSourceStatus('kraken', true);
     };
 
     ws.onmessage = (event) => {
       if (!isMountedRef.current) return;
       
       try {
         const message = JSON.parse(event.data);
         
         if (message.channel === 'trade' && message.type === 'update' && message.data?.length > 0) {
           const trade = message.data[message.data.length - 1];
           updatePrice(trade.price, new Date(trade.timestamp).getTime(), 'Kraken');
         }
       } catch (err) {
         // Ignore parse errors
       }
     };
 
     ws.onclose = () => {
       if (!isMountedRef.current) return;
       updateSourceStatus('kraken', false);
       
       const delay = getReconnectDelay(krakenReconnectRef.current++);
       setTimeout(() => isMountedRef.current && connectKraken(), delay);
     };
 
     ws.onerror = () => updateSourceStatus('kraken', false);
   }, [symbol, getReconnectDelay, updatePrice, updateSourceStatus]);
 
   // Coinbase WebSocket
   const connectCoinbase = useCallback(() => {
     if (!isMountedRef.current) return;
     
     if (coinbaseWsRef.current) {
       coinbaseWsRef.current.close();
     }
 
     const ws = new WebSocket(COINBASE_WS_URL);
     coinbaseWsRef.current = ws;
 
     ws.onopen = () => {
       if (!isMountedRef.current) return;
       console.log('[Coinbase] Connected');
       coinbaseReconnectRef.current = 0;
       
       ws.send(JSON.stringify({
         type: 'subscribe',
         product_ids: ['SOL-USD'],
         channels: ['ticker'],
       }));
       
       updateSourceStatus('coinbase', true);
     };
 
     ws.onmessage = (event) => {
       if (!isMountedRef.current) return;
       
       try {
         const message = JSON.parse(event.data);
         
         if (message.type === 'ticker' && message.price) {
           const price = parseFloat(message.price);
           const timestamp = message.time ? new Date(message.time).getTime() : Date.now();
           updatePrice(price, timestamp, 'Coinbase');
         }
       } catch (err) {
         // Ignore parse errors
       }
     };
 
     ws.onclose = () => {
       if (!isMountedRef.current) return;
       updateSourceStatus('coinbase', false);
       
       const delay = getReconnectDelay(coinbaseReconnectRef.current++);
       setTimeout(() => isMountedRef.current && connectCoinbase(), delay);
     };
 
     ws.onerror = () => updateSourceStatus('coinbase', false);
   }, [getReconnectDelay, updatePrice, updateSourceStatus]);
 
   // Binance.US WebSocket
   const connectBinance = useCallback(() => {
     if (!isMountedRef.current) return;
     
     if (binanceWsRef.current) {
       binanceWsRef.current.close();
     }
 
     const ws = new WebSocket(BINANCE_WS_URL);
     binanceWsRef.current = ws;
 
     ws.onopen = () => {
       if (!isMountedRef.current) return;
       console.log('[Binance.US] Connected');
       binanceReconnectRef.current = 0;
       updateSourceStatus('binance', true);
     };
 
     ws.onmessage = (event) => {
       if (!isMountedRef.current) return;
       
       try {
         const message = JSON.parse(event.data);
         
         // aggTrade format: { e: "aggTrade", p: "price", T: timestamp }
         if (message.e === 'aggTrade' && message.p) {
           const price = parseFloat(message.p);
           const timestamp = message.T || Date.now();
           updatePrice(price, timestamp, 'Binance.US');
         }
       } catch (err) {
         // Ignore parse errors
       }
     };
 
     ws.onclose = () => {
       if (!isMountedRef.current) return;
       updateSourceStatus('binance', false);
       
       const delay = getReconnectDelay(binanceReconnectRef.current++);
       setTimeout(() => isMountedRef.current && connectBinance(), delay);
     };
 
     ws.onerror = () => updateSourceStatus('binance', false);
   }, [getReconnectDelay, updatePrice, updateSourceStatus]);
 
   useEffect(() => {
     isMountedRef.current = true;
     
     // Connect to all sources
     connectKraken();
     connectCoinbase();
     connectBinance();
 
     return () => {
       isMountedRef.current = false;
       
       if (krakenWsRef.current) krakenWsRef.current.close();
       if (coinbaseWsRef.current) coinbaseWsRef.current.close();
       if (binanceWsRef.current) binanceWsRef.current.close();
     };
   }, [connectKraken, connectCoinbase, connectBinance]);
 
   return state;
 }