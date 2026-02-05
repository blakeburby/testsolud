 import { supabase } from '@/integrations/supabase/client';
 import { kalshiRateLimiter } from './rate-limiter';
 import type { KalshiMarketResponse } from '@/types/sol-markets';
 
 const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
 
 interface DomeMarketsResponse {
   markets: KalshiMarketResponse[];
   pagination_key?: string;
 }
 
 interface DomeMarketPriceResponse {
   market_ticker: string;
   yes_bid?: number;
   yes_ask?: number;
   no_bid?: number;
   no_ask?: number;
   last_price?: number;
 }
 
 export async function fetchKalshiMarkets(
   status: 'open' | 'closed' = 'open',
   limit: number = 100
 ): Promise<KalshiMarketResponse[]> {
   await kalshiRateLimiter.waitAndAcquire();
 
   const params = new URLSearchParams({
     endpoint: '/kalshi/markets',
     status,
     limit: limit.toString(),
   });
 
   const response = await fetch(`${SUPABASE_URL}/functions/v1/dome-proxy?${params}`);
 
   if (!response.ok) {
     const error = await response.json();
     throw new Error(error.error || 'Failed to fetch markets');
   }
 
   const data: DomeMarketsResponse = await response.json();
   return data.markets || [];
 }
 
 export async function fetchMarketPrice(ticker: string): Promise<DomeMarketPriceResponse> {
   await kalshiRateLimiter.waitAndAcquire();
 
   const params = new URLSearchParams({
     endpoint: `/kalshi/market-price/${ticker}`,
   });
 
   const response = await fetch(`${SUPABASE_URL}/functions/v1/dome-proxy?${params}`);
 
   if (!response.ok) {
     const error = await response.json();
     throw new Error(error.error || 'Failed to fetch market price');
   }
 
   return response.json();
 }
 
 export async function fetchSOLPrice(includeKlines: boolean = false): Promise<{
   price: number;
   timestamp: number;
   klines?: Array<{
     time: number;
     open: number;
     high: number;
     low: number;
     close: number;
     volume: number;
   }>;
 }> {
   const params = new URLSearchParams({
     symbol: 'SOLUSDT',
   });
 
   if (includeKlines) {
     params.set('klines', 'true');
   }
 
   const response = await fetch(`${SUPABASE_URL}/functions/v1/binance-price?${params}`);
 
   if (!response.ok) {
     const error = await response.json();
     throw new Error(error.error || 'Failed to fetch SOL price');
   }
 
   return response.json();
 }