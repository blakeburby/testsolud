 import type { KalshiMarketResponse, KalshiFullMarketResponse } from '@/types/sol-markets';
 
 const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
 
 interface KalshiMarketsListResponse {
   markets: KalshiMarketResponse[];
   cursor?: string;
 }
 
 // Fetch all open KXSOL15M 15-minute contracts
 export async function fetchKalshi15MinMarkets(): Promise<KalshiMarketResponse[]> {
   const params = new URLSearchParams({ mode: 'list' });
   const response = await fetch(`${SUPABASE_URL}/functions/v1/kalshi-markets?${params}`);
 
   if (!response.ok) {
     const error = await response.json();
     throw new Error(error.error || 'Failed to fetch markets');
   }
 
   const data: KalshiMarketsListResponse = await response.json();
   return data.markets || [];
 }
 
 // Fetch single market with full price data
 export async function fetchKalshiMarket(ticker: string): Promise<KalshiFullMarketResponse> {
   const params = new URLSearchParams({ mode: 'get', ticker });
   const response = await fetch(`${SUPABASE_URL}/functions/v1/kalshi-markets?${params}`);
 
   if (!response.ok) {
     const error = await response.json();
     throw new Error(error.error || 'Failed to fetch market price');
   }
 
   const data = await response.json();
   return data.market;
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