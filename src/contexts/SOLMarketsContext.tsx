 import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
 import type { SOLMarket, TimeSlot, SOLDashboardState, PriceKline } from '@/types/sol-markets';
 import { fetchKalshiMarkets, fetchMarketPrice, fetchSOLPrice } from '@/lib/dome-client';
 import { filterSOL15MinMarkets, groupMarketsIntoTimeSlots } from '@/lib/sol-market-filter';
 import { useToast } from '@/hooks/use-toast';
 
 type Action =
   | { type: 'SET_LOADING'; payload: boolean }
   | { type: 'SET_ERROR'; payload: string | null }
   | { type: 'SET_MARKETS'; payload: SOLMarket[] }
   | { type: 'SET_TIME_SLOTS'; payload: TimeSlot[] }
   | { type: 'SELECT_SLOT'; payload: TimeSlot | null }
   | { type: 'SELECT_DIRECTION'; payload: 'up' | 'down' }
   | { type: 'SET_CURRENT_PRICE'; payload: number }
   | { type: 'SET_PRICE_HISTORY'; payload: PriceKline[] }
   | { type: 'UPDATE_MARKET_PRICES'; payload: { ticker: string; prices: Partial<SOLMarket> } }
   | { type: 'SET_LIVE'; payload: boolean };
 
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
   const solPriceIntervalRef = useRef<number | null>(null);
 
   const discoverMarkets = useCallback(async () => {
     try {
       dispatch({ type: 'SET_LOADING', payload: true });
       const rawMarkets = await fetchKalshiMarkets('open', 100);
       const solMarkets = filterSOL15MinMarkets(rawMarkets);
       const timeSlots = groupMarketsIntoTimeSlots(solMarkets);
 
       dispatch({ type: 'SET_MARKETS', payload: solMarkets });
       dispatch({ type: 'SET_TIME_SLOTS', payload: timeSlots });
 
       // Auto-select active or next available slot
       if (!state.selectedSlot) {
         const activeSlot = timeSlots.find(s => s.isActive) || timeSlots.find(s => !s.isPast);
         if (activeSlot) {
           dispatch({ type: 'SELECT_SLOT', payload: activeSlot });
         }
       }
 
       dispatch({ type: 'SET_LIVE', payload: true });
       dispatch({ type: 'SET_ERROR', payload: null });
     } catch (error) {
       console.error('Failed to discover markets:', error);
       dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Failed to load markets' });
       dispatch({ type: 'SET_LIVE', payload: false });
       toast({
         title: 'Error loading markets',
         description: error instanceof Error ? error.message : 'Please try again',
         variant: 'destructive',
       });
     } finally {
       dispatch({ type: 'SET_LOADING', payload: false });
     }
   }, [state.selectedSlot, toast]);
 
   const fetchSelectedMarketPrice = useCallback(async () => {
     if (!state.selectedMarket) return;
 
     try {
       const priceData = await fetchMarketPrice(state.selectedMarket.ticker);
       dispatch({
         type: 'UPDATE_MARKET_PRICES',
         payload: {
           ticker: state.selectedMarket.ticker,
           prices: {
             yesBid: priceData.yes_bid ? priceData.yes_bid / 100 : null,
             yesAsk: priceData.yes_ask ? priceData.yes_ask / 100 : null,
             noBid: priceData.no_bid ? priceData.no_bid / 100 : null,
             noAsk: priceData.no_ask ? priceData.no_ask / 100 : null,
             yesPrice: priceData.last_price ? priceData.last_price / 100 : null,
             noPrice: priceData.last_price ? (100 - priceData.last_price) / 100 : null,
           },
         },
       });
     } catch (error) {
       console.error('Failed to fetch market price:', error);
     }
   }, [state.selectedMarket]);
 
   const fetchSOLPriceData = useCallback(async (includeKlines: boolean = false) => {
     try {
       const data = await fetchSOLPrice(includeKlines);
       dispatch({ type: 'SET_CURRENT_PRICE', payload: data.price });
       if (data.klines) {
         dispatch({ type: 'SET_PRICE_HISTORY', payload: data.klines });
       }
       dispatch({ type: 'SET_LIVE', payload: true });
     } catch (error) {
       console.error('Failed to fetch SOL price:', error);
       dispatch({ type: 'SET_LIVE', payload: false });
     }
   }, []);
 
   const selectSlot = useCallback((slot: TimeSlot) => {
     dispatch({ type: 'SELECT_SLOT', payload: slot });
   }, []);
 
   const selectDirection = useCallback((direction: 'up' | 'down') => {
     dispatch({ type: 'SELECT_DIRECTION', payload: direction });
   }, []);
 
   // Initial load
   useEffect(() => {
     discoverMarkets();
     fetchSOLPriceData(true);
   }, []);
 
   // Discovery refresh (every 60s)
   useEffect(() => {
     discoveryIntervalRef.current = window.setInterval(discoverMarkets, 60000);
     return () => {
       if (discoveryIntervalRef.current) clearInterval(discoveryIntervalRef.current);
     };
   }, [discoverMarkets]);
 
   // Market price polling (every 5s)
   useEffect(() => {
     if (state.selectedMarket) {
       fetchSelectedMarketPrice();
       priceIntervalRef.current = window.setInterval(fetchSelectedMarketPrice, 5000);
     }
     return () => {
       if (priceIntervalRef.current) clearInterval(priceIntervalRef.current);
     };
   }, [state.selectedMarket?.ticker, fetchSelectedMarketPrice]);
 
   // SOL price polling (every 3s)
   useEffect(() => {
     solPriceIntervalRef.current = window.setInterval(() => fetchSOLPriceData(true), 3000);
     return () => {
       if (solPriceIntervalRef.current) clearInterval(solPriceIntervalRef.current);
     };
   }, [fetchSOLPriceData]);
 
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