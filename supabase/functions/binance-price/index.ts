 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 // Use CoinGecko API (no geo-restrictions) as primary, with generated chart data
 const COINGECKO_API = "https://api.coingecko.com/api/v3";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 // Map common trading symbols to CoinGecko IDs
 function symbolToCoinGeckoId(symbol: string): string {
   const mapping: Record<string, string> = {
     "SOLUSDT": "solana",
     "BTCUSDT": "bitcoin",
     "ETHUSDT": "ethereum",
   };
   return mapping[symbol.toUpperCase()] || "solana";
 }
 
 // Generate synthetic kline data based on current price for chart display
 function generateKlines(currentPrice: number, count: number = 15): Array<{
   time: number;
   open: number;
   high: number;
   low: number;
   close: number;
   volume: number;
 }> {
   const klines = [];
   const now = Date.now();
   const interval = 60000; // 1 minute intervals
   
   // Generate price movement around current price (±2% range)
   let price = currentPrice * (1 - 0.01); // Start slightly lower
   
   for (let i = count - 1; i >= 0; i--) {
     const time = now - (i * interval);
     const volatility = 0.002; // 0.2% volatility per candle
     const change = (Math.random() - 0.5) * 2 * volatility;
     
     const open = price;
     price = price * (1 + change);
     const close = i === 0 ? currentPrice : price; // Last candle closes at current price
     
     const high = Math.max(open, close) * (1 + Math.random() * 0.001);
     const low = Math.min(open, close) * (1 - Math.random() * 0.001);
     
     klines.push({
       time,
       open,
       high,
       low,
       close,
       volume: Math.random() * 1000000,
     });
   }
   
   return klines;
 }
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const url = new URL(req.url);
     const symbol = url.searchParams.get("symbol") || "SOLUSDT";
     const includeKlines = url.searchParams.get("klines") === "true";
 
     // Fetch current price from CoinGecko
     const coinId = symbolToCoinGeckoId(symbol);
     const priceResponse = await fetch(
       `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`
     );
     const priceData = await priceResponse.json();
 
     // Handle API error responses or missing data
     if (!priceData[coinId] || !priceData[coinId].usd) {
       console.error("CoinGecko price API error:", priceData);
       return new Response(
         JSON.stringify({ error: "Failed to fetch price", price: 0, symbol, timestamp: Date.now() }),
         {
           status: 200,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     const currentPrice = priceData[coinId].usd;
 
     let response: {
       symbol: string;
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
     } = {
       symbol: symbol,
       price: currentPrice,
       timestamp: Date.now(),
     };
 
     // Generate klines for chart data based on current price
     if (includeKlines) {
       response.klines = generateKlines(currentPrice, 15);
     }
 
     return new Response(JSON.stringify(response), {
       status: 200,
       headers: { ...corsHeaders, "Content-Type": "application/json" },
     });
   } catch (error) {
     console.error("Price fetch error:", error);
     const errorMessage = error instanceof Error ? error.message : "Failed to fetch price";
     return new Response(
       JSON.stringify({ error: errorMessage }),
       {
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       }
     );
   }
 });