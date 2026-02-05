 import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
 import type { SOLMarket, TimeSlot, SOLDashboardState, PriceKline } from '@/types/sol-markets';
import { fetchKalshi15MinMarkets, fetchKalshiMarket, fetchSOLPriceWithHistory } from '@/lib/kalshi-client';
 import { groupMarketsIntoTimeSlots, parseKalshiFullMarket } from '@/lib/sol-market-filter';
 import type { KalshiFullMarketResponse } from '@/types/sol-markets';
 import { useToast } from '@/hooks/use-toast';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';

// Synthetic 15-minute window generator for when real contracts aren't available
function generateSyntheticSlots(currentPrice: number): TimeSlot[] {
  const now = new Date();
  const slots: TimeSlot[] = [];
  
  // Get the current 15-minute window start
  const minutes = now.getMinutes();
  const windowStart = new Date(now);
  windowStart.setMinutes(Math.floor(minutes / 15) * 15, 0, 0);
  
  // Generate current and next 4 windows
  for (let i = 0; i < 5; i++) {
    const slotStart = new Date(windowStart.getTime() + i * 15 * 60 * 1000);
    const slotEnd = new Date(slotStart.getTime() + 15 * 60 * 1000);
    
    // Calculate strike prices around current price
    const strikeBase = Math.round(currentPrice);
    const upStrike = strikeBase + (i * 0.5);
    const downStrike = strikeBase - (i * 0.5);
    
    const markets: SOLMarket[] = [
      {
        ticker: `SYNTHETIC-UP-${i}`,
        eventTicker: `SYNTHETIC-EVENT-${i}`,
        title: `SOL above $${upStrike.toFixed(2)} at ${slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET?`,
        strikePrice: upStrike,
        direction: 'up' as const,
        windowStart: slotStart,
        windowEnd: slotEnd,
        closeTime: slotEnd,
        status: 'open' as const,
        yesPrice: 0.50,
        noPrice: 0.50,
        yesBid: 0.49,
        yesAsk: 0.51,
        noBid: 0.49,
        noAsk: 0.51,
        volume: 0,
        volume24h: 0,
        lastUpdated: new Date(),
      },
      {
        ticker: `SYNTHETIC-DOWN-${i}`,
        eventTicker: `SYNTHETIC-EVENT-${i}`,
        title: `SOL below $${downStrike.toFixed(2)} at ${slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET?`,
        strikePrice: downStrike,
        direction: 'down' as const,
        windowStart: slotStart,
        windowEnd: slotEnd,
        closeTime: slotEnd,
        status: 'open' as const,
        yesPrice: 0.50,
        noPrice: 0.50,
        yesBid: 0.49,
        yesAsk: 0.51,
        noBid: 0.49,
        noAsk: 0.51,
        volume: 0,
        volume24h: 0,
        lastUpdated: new Date(),
      },
    ];
    
    slots.push({
      windowStart: slotStart,
      windowEnd: slotEnd,
      markets,
      isActive: i === 0,
      isPast: false,
    });
  }
  
  return slots;
}
 
 type Action =
   | { type: 'SET_LOADING'; payload: boolean }
   | { type: 'SET_ERROR'; payload: string | null }
   | { type: 'SET_MARKETS'; payload: SOLMarket[] }
   | { type: 'SET_TIME_SLOTS'; payload: TimeSlot[] }
   | { type: 'SELECT_SLOT'; payload: TimeSlot | null }
   | { type: 'SELECT_DIRECTION'; payload: 'up' | 'down' }
   | { type: 'SET_CURRENT_PRICE'; payload: number }
   | { type: 'SET_PRICE_HISTORY'; payload: PriceKline[] }
   | { type: 'ADD_PRICE_POINT'; payload: { price: number; timestamp: number } }
   | { type: 'UPDATE_MARKET_PRICES'; payload: { ticker: string; prices: Partial<SOLMarket> } }
   | { type: 'SET_LIVE'; payload: boolean }
   | { type: 'RESET_FOR_NEW_CONTRACT'; payload: TimeSlot };
 
 const initialState: SOLDashboardState = {
   currentPrice: null,
   priceHistory: [],
   markets: [],
   timeSlots: [],
   selectedSlot: null,
   selectedDirection: 'up',
   selectedMarket: null,
   isLoading: true,
   error: null,
   lastRefresh: null,
   isLive: false,
 };
 
 function reducer(state: SOLDashboardState, action: Action): SOLDashboardState {
   switch (action.type) {
     case 'SET_LOADING':
       return { ...state, isLoading: action.payload };
     case 'SET_ERROR':
       return { ...state, error: action.payload };
     case 'SET_MARKETS':
       return { ...state, markets: action.payload, lastRefresh: new Date() };
     case 'SET_TIME_SLOTS':
       return { ...state, timeSlots: action.payload };
     case 'SELECT_SLOT': {
       const slot = action.payload;
       const selectedMarket = slot?.markets.find(m => m.direction === state.selectedDirection) || slot?.markets[0] || null;
       return { ...state, selectedSlot: slot, selectedMarket };
     }
     case 'SELECT_DIRECTION': {
       const selectedMarket = state.selectedSlot?.markets.find(m => m.direction === action.payload) || state.selectedMarket;
       return { ...state, selectedDirection: action.payload, selectedMarket };
     }
     case 'SET_CURRENT_PRICE':
       return { ...state, currentPrice: action.payload };
     case 'SET_PRICE_HISTORY':
       return { ...state, priceHistory: action.payload };
     case 'ADD_PRICE_POINT': {
       const { price, timestamp } = action.payload;
       const FIFTEEN_MINUTES = 15 * 60 * 1000;
       const cutoffTime = timestamp - FIFTEEN_MINUTES;
       
       // Check for duplicate timestamps (within 500ms)
       const isDuplicate = state.priceHistory.some(
         p => Math.abs(p.time - timestamp) < 500
       );
       if (isDuplicate) return state;
       
       // Create new price point
       const newPoint: PriceKline = {
         time: timestamp,
         open: price,
         high: price,
         low: price,
         close: price,
         volume: 0,
       };
       
       // Filter to 15-minute window and append new point
       const filteredHistory = state.priceHistory.filter(p => p.time >= cutoffTime);
       return {
         ...state,
         priceHistory: [...filteredHistory, newPoint],
         currentPrice: price,
       };
     }
     case 'UPDATE_MARKET_PRICES': {
       const markets = state.markets.map(m =>
         m.ticker === action.payload.ticker
           ? { ...m, ...action.payload.prices, lastUpdated: new Date() }
           : m
       );
       const selectedMarket = state.selectedMarket?.ticker === action.payload.ticker
         ? { ...state.selectedMarket, ...action.payload.prices, lastUpdated: new Date() }
         : state.selectedMarket;
       return { ...state, markets, selectedMarket };
     }
     case 'SET_LIVE':
       return { ...state, isLive: action.payload };
     case 'RESET_FOR_NEW_CONTRACT': {
       const slot = action.payload;
       const selectedMarket = slot.markets.find(m => m.direction === state.selectedDirection) || slot.markets[0] || null;
       return {
         ...state,
         selectedSlot: slot,
         selectedMarket,
         priceHistory: [], // Clear history for new contract
       };
     }
     default:
       return state;
   }
 }
 
 interface SOLMarketsContextValue extends SOLDashboardState {
   selectSlot: (slot: TimeSlot) => void;
   selectDirection: (direction: 'up' | 'down') => void;
   refreshMarkets: () => Promise<void>;
 }
 
 const SOLMarketsContext = createContext<SOLMarketsContextValue | null>(null);
 
 export function SOLMarketsProvider({ children }: { children: React.ReactNode }) {
   const [state, dispatch] = useReducer(reducer, initialState);
   const { toast } = useToast();
   const priceIntervalRef = useRef<number | null>(null);
   const discoveryIntervalRef = useRef<number | null>(null);
   const lastContractEndRef = useRef<number | null>(null);
   const initialLoadDoneRef = useRef(false);

  // Use WebSocket for real-time price updates
  const { price: wsPrice, timestamp: wsTimestamp, isConnected: wsConnected } = useBinanceWebSocket('solusdt');
 
   const discoverMarkets = useCallback(async (forceNewSlot = false) => {
     try {
       dispatch({ type: 'SET_LOADING', payload: true });
        
       // Fetch real KXSOL15M 15-minute contracts from Kalshi
       const rawMarkets = await fetchKalshi15MinMarkets();
       console.log(`Fetched ${rawMarkets.length} KXSOL15M markets from Kalshi`);
       
       // Parse markets into SOLMarket format
       const solMarkets: SOLMarket[] = rawMarkets
         .map(m => parseKalshiFullMarket(m as unknown as KalshiFullMarketResponse))
         .filter((m): m is SOLMarket => m !== null);
       
       let timeSlots = groupMarketsIntoTimeSlots(solMarkets);
       
       // If no real markets, use synthetic slots as fallback
       if (timeSlots.length === 0 && state.currentPrice && state.currentPrice > 0) {
         console.log('No real KXSOL15M markets found, using synthetic 15-minute windows');
         timeSlots = generateSyntheticSlots(state.currentPrice);
       }
 
       dispatch({ type: 'SET_MARKETS', payload: solMarkets });
       dispatch({ type: 'SET_TIME_SLOTS', payload: timeSlots });
 
       // Auto-select active or next available slot (force on contract expiry)
       if (!state.selectedSlot || forceNewSlot) {
         const now = Date.now();
         const activeSlot = timeSlots.find(s => s.isActive && s.windowEnd.getTime() > now) 
           || timeSlots.find(s => !s.isPast && s.windowEnd.getTime() > now);
         if (activeSlot) {
           if (forceNewSlot) {
             dispatch({ type: 'RESET_FOR_NEW_CONTRACT', payload: activeSlot });
           } else {
             dispatch({ type: 'SELECT_SLOT', payload: activeSlot });
           }
           lastContractEndRef.current = activeSlot.windowEnd.getTime();
         }
       }
 
       dispatch({ type: 'SET_LIVE', payload: true });
       dispatch({ type: 'SET_ERROR', payload: null });
     } catch (error) {
       console.error('Failed to discover markets:', error);
       dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to load markets' });
       dispatch({ type: 'SET_LIVE', payload: false });
        
        // If discovery fails but we have a price, use synthetic slots
        if (state.currentPrice && state.currentPrice > 0) {
          const syntheticSlots = generateSyntheticSlots(state.currentPrice);
          dispatch({ type: 'SET_TIME_SLOTS', payload: syntheticSlots });
          if (!state.selectedSlot) {
            dispatch({ type: 'SELECT_SLOT', payload: syntheticSlots[0] });
          }
        }
     } finally {
       dispatch({ type: 'SET_LOADING', payload: false });
     }
    }, [state.selectedSlot, state.currentPrice]);
 
   const fetchSelectedMarketPrice = useCallback(async () => {
      if (!state.selectedMarket) return;
      
      // Skip price fetching for synthetic markets
      if (state.selectedMarket.ticker.startsWith('SYNTHETIC-')) return;
 
     try {
       const priceData = await fetchKalshiMarket(state.selectedMarket.ticker);
       
       // Parse prices - prefer dollar format
       const yesBid = priceData.yes_bid_dollars ? parseFloat(priceData.yes_bid_dollars) : (priceData.yes_bid ? priceData.yes_bid / 100 : null);
       const yesAsk = priceData.yes_ask_dollars ? parseFloat(priceData.yes_ask_dollars) : (priceData.yes_ask ? priceData.yes_ask / 100 : null);
       const noBid = priceData.no_bid_dollars ? parseFloat(priceData.no_bid_dollars) : (priceData.no_bid ? priceData.no_bid / 100 : null);
       const noAsk = priceData.no_ask_dollars ? parseFloat(priceData.no_ask_dollars) : (priceData.no_ask ? priceData.no_ask / 100 : null);
       const lastPrice = priceData.last_price_dollars ? parseFloat(priceData.last_price_dollars) : (priceData.last_price ? priceData.last_price / 100 : null);
       
       dispatch({
         type: 'UPDATE_MARKET_PRICES',
         payload: {
           ticker: state.selectedMarket.ticker,
           prices: {
             yesBid,
             yesAsk,
             noBid,
             noAsk,
             yesPrice: lastPrice,
             noPrice: lastPrice !== null ? 1 - lastPrice : null,
           },
         },
       });
     } catch (error) {
       console.error('Failed to fetch market price:', error);
     }
   }, [state.selectedMarket]);
 
   // Historical price fetch for initial load
   const fetchSOLPriceHistorical = useCallback(async () => {
     try {
       const data = await fetchSOLPriceWithHistory();
       if (data.price > 0) {
         dispatch({ type: 'SET_CURRENT_PRICE', payload: data.price });
         if (data.klines && data.klines.length > 0) {
           dispatch({ type: 'SET_PRICE_HISTORY', payload: data.klines });
         }
         dispatch({ type: 'SET_LIVE', payload: true });
       }
     } catch (error) {
       console.error('Failed to fetch historical SOL price:', error);
       dispatch({ type: 'SET_LIVE', payload: false });
     }
   }, []);
 
   // Check for contract expiry and auto-switch
   const checkContractExpiry = useCallback(() => {
     if (!lastContractEndRef.current) return;
     
     const now = Date.now();
     if (now >= lastContractEndRef.current) {
       console.log('Contract expired, discovering new markets...');
       discoverMarkets(true);
       fetchSOLPriceHistorical();
     }
   }, [discoverMarkets, fetchSOLPriceHistorical]);
 
   const selectSlot = useCallback((slot: TimeSlot) => {
     dispatch({ type: 'SELECT_SLOT', payload: slot });
   }, []);
 
   const selectDirection = useCallback((direction: 'up' | 'down') => {
     dispatch({ type: 'SELECT_DIRECTION', payload: direction });
   }, []);
 
   // Initial load
   useEffect(() => {
     discoverMarkets(false);
     fetchSOLPriceHistorical();
     initialLoadDoneRef.current = true;
   }, []);
 
   // Discovery refresh (every 60s)
   useEffect(() => {
     discoveryIntervalRef.current = window.setInterval(() => discoverMarkets(false), 60000);
     return () => {
       if (discoveryIntervalRef.current) clearInterval(discoveryIntervalRef.current);
     };
   }, [discoverMarkets]);
 
   // Market price polling (every 1s for real-time odds)
   useEffect(() => {
      // Skip polling for synthetic markets entirely
      if (state.selectedMarket && !state.selectedMarket.ticker.startsWith('SYNTHETIC-')) {
       fetchSelectedMarketPrice();
       priceIntervalRef.current = window.setInterval(fetchSelectedMarketPrice, 500);
     }
     return () => {
       if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
     };
   }, [state.selectedMarket?.ticker, fetchSelectedMarketPrice]);
 
  // WebSocket price updates (replaces polling)
   useEffect(() => {
    if (wsPrice && wsTimestamp) {
      dispatch({ type: 'ADD_PRICE_POINT', payload: { price: wsPrice, timestamp: wsTimestamp } });
    }
  }, [wsPrice, wsTimestamp]);

  // Update live status based on WebSocket connection
  useEffect(() => {
    dispatch({ type: 'SET_LIVE', payload: wsConnected });
  }, [wsConnected]);
 
   // Contract expiry check (every 1s)
   useEffect(() => {
     const expiryInterval = window.setInterval(checkContractExpiry, 1000);
     return () => clearInterval(expiryInterval);
   }, [checkContractExpiry]);
 
   const value: SOLMarketsContextValue = {
     ...state,
     selectSlot,
     selectDirection,
     refreshMarkets: discoverMarkets,
   };
 
   return (
     <SOLMarketsContext.Provider value={value}>
       {children}
     </SOLMarketsContext.Provider>
   );
 }
 
 export function useSOLMarkets() {
   const context = useContext(SOLMarketsContext);
   if (!context) {
     throw new Error('useSOLMarkets must be used within a SOLMarketsProvider');
   }
   return context;
 }