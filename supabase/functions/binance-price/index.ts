 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 // CoinGecko API - no geo-restrictions
 const COINGECKO_API = "https://api.coingecko.com/api/v3";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 function symbolToCoinGeckoId(symbol: string): string {
   const mapping: Record<string, string> = {
     "SOLUSDT": "solana",
     "BTCUSDT": "bitcoin",
     "ETHUSDT": "ethereum",
   };
   return mapping[symbol.toUpperCase()] || "solana";
 }
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const url = new URL(req.url);
     const symbol = url.searchParams.get("symbol") || "SOLUSDT";
     const historical = url.searchParams.get("historical") === "true";
     const coinId = symbolToCoinGeckoId(symbol);
 
     // QUICK MODE (default): Fast current price only - optimized for 1s polling
     if (!historical) {
       const priceResponse = await fetch(
         `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`
       );
       const priceData = await priceResponse.json();
 
       if (!priceData[coinId]?.usd) {
         console.error("CoinGecko price API error:", priceData);
         return new Response(
           JSON.stringify({ price: 0, timestamp: Date.now(), error: "Price unavailable" }),
           { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       return new Response(
         JSON.stringify({
           symbol,
           price: priceData[coinId].usd,
           timestamp: Date.now(),
         }),
         { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // HISTORICAL MODE: Fetch real 15-minute history from market_chart
     // CoinGecko gives 5-minute granularity for last 24h on free tier
     const [priceResponse, chartResponse] = await Promise.all([
       fetch(`${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`),
       fetch(`${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=1&precision=2`),
     ]);
 
     const priceData = await priceResponse.json();
     const chartData = await chartResponse.json();
 
     const currentPrice = priceData[coinId]?.usd || 0;
     
     // Process historical prices - filter to last 20 minutes
     const now = Date.now();
     const twentyMinutesAgo = now - 20 * 60 * 1000;
     
     let klines: Array<{
       time: number;
       open: number;
       high: number;
       low: number;
       close: number;
       volume: number;
     }> = [];
 
     if (chartData.prices && Array.isArray(chartData.prices)) {
       // CoinGecko returns [timestamp, price] pairs
       const recentPrices = chartData.prices.filter(
         (p: [number, number]) => p[0] >= twentyMinutesAgo
       );
 
       // Convert to kline format (each point becomes a "candle")
       klines = recentPrices.map((p: [number, number], i: number, arr: [number, number][]) => {
         const prevPrice = i > 0 ? arr[i - 1][1] : p[1];
         const high = Math.max(prevPrice, p[1]) * 1.0005;
         const low = Math.min(prevPrice, p[1]) * 0.9995;
         return {
           time: p[0],
           open: prevPrice,
           high,
           low,
           close: p[1],
           volume: 0,
         };
       });
 
       // Add current price as latest point
       if (klines.length > 0 && currentPrice > 0) {
         const lastKline = klines[klines.length - 1];
         klines.push({
           time: now,
           open: lastKline.close,
           high: Math.max(lastKline.close, currentPrice),
           low: Math.min(lastKline.close, currentPrice),
           close: currentPrice,
           volume: 0,
         });
       }
     }
 
     return new Response(
       JSON.stringify({
         symbol,
         price: currentPrice,
         timestamp: now,
         klines,
       }),
       { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   } catch (error) {
     console.error("Price fetch error:", error);
     return new Response(
       JSON.stringify({ error: error instanceof Error ? error.message : "Failed to fetch price" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });