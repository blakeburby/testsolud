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
  limit: number = 100,
  search?: string
 ): Promise<KalshiMarketResponse[]> {
   await kalshiRateLimiter.waitAndAcquire();
 
   const params = new URLSearchParams({
     endpoint: '/kalshi/markets',
     status,
     limit: limit.toString(),
   });
  
  if (search) {
    params.set('search', search);
  }
 
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
 
 // Fast mode for 1-second polling - only fetches current price
 export async function fetchSOLPriceQuick(): Promise<{
   price: number;
   timestamp: number;
 }> {
   const params = new URLSearchParams({ symbol: 'SOLUSDT' });
   const response = await fetch(`${SUPABASE_URL}/functions/v1/binance-price?${params}`);
 
   if (!response.ok) {
     const error = await response.json();
     throw new Error(error.error || 'Failed to fetch SOL price');
   }
 
   return response.json();
 }
 
 // Historical mode for initial load - fetches price + klines
 export async function fetchSOLPriceWithHistory(): Promise<{
   price: number;
   timestamp: number;
   klines: Array<{
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
     historical: 'true',
   });
 
   const response = await fetch(`${SUPABASE_URL}/functions/v1/binance-price?${params}`);
 
   if (!response.ok) {
     const error = await response.json();
     throw new Error(error.error || 'Failed to fetch SOL price');
   }
 
   const data = await response.json();
   return {
     price: data.price,
     timestamp: data.timestamp,
     klines: data.klines || [],
   };
 }