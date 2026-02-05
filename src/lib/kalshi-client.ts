 import type { KalshiMarketResponse, KalshiFullMarketResponse } from '@/types/sol-markets';
 import type { OrderbookData, OrderbookLevel } from '@/types/sol-markets';
 
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
 
 // Fetch orderbook for a specific market (authenticated)
 export async function fetchKalshiOrderbook(ticker: string): Promise<OrderbookData> {
   const params = new URLSearchParams({ ticker });
   const response = await fetch(`${SUPABASE_URL}/functions/v1/kalshi-orderbook?${params}`);
 
   if (!response.ok) {
     const error = await response.json();
     throw new Error(error.error || 'Failed to fetch orderbook');
   }
 
   const data = await response.json();
   
   // Transform the response to match OrderbookData interface
   return {
     ticker: data.ticker,
     yesBids: (data.yesBids || []).map((level: { price: number; size: number }) => ({
       price: level.price,
       size: level.size,
       side: 'yes' as const,
     })),
     yesAsks: (data.yesAsks || []).map((level: { price: number; size: number }) => ({
       price: level.price,
       size: level.size,
       side: 'yes' as const,
     })),
     noBids: (data.noBids || []).map((level: { price: number; size: number }) => ({
       price: level.price,
       size: level.size,
       side: 'no' as const,
     })),
     noAsks: (data.noAsks || []).map((level: { price: number; size: number }) => ({
       price: level.price,
       size: level.size,
       side: 'no' as const,
     })),
     lastPrice: data.lastPrice,
     spread: data.spread,
     totalVolume: data.totalVolume,
     lastUpdated: new Date(data.lastUpdated),
   };
 }