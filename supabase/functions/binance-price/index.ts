 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 const BINANCE_API = "https://api.binance.com/api/v3";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const url = new URL(req.url);
     const symbol = url.searchParams.get("symbol") || "SOLUSDT";
     const includeKlines = url.searchParams.get("klines") === "true";
 
     // Fetch current price
     const priceResponse = await fetch(`${BINANCE_API}/ticker/price?symbol=${symbol}`);
     const priceData = await priceResponse.json();
 
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
       symbol: priceData.symbol,
       price: parseFloat(priceData.price),
       timestamp: Date.now(),
     };
 
     // Optionally fetch 15-minute klines for chart data
     if (includeKlines) {
       const klinesResponse = await fetch(
         `${BINANCE_API}/klines?symbol=${symbol}&interval=1m&limit=15`
       );
       const klinesData = await klinesResponse.json();
 
       response.klines = klinesData.map((k: number[]) => ({
         time: k[0],
         open: parseFloat(k[1] as unknown as string),
         high: parseFloat(k[2] as unknown as string),
         low: parseFloat(k[3] as unknown as string),
         close: parseFloat(k[4] as unknown as string),
         volume: parseFloat(k[5] as unknown as string),
       }));
     }
 
     return new Response(JSON.stringify(response), {
       status: 200,
       headers: { ...corsHeaders, "Content-Type": "application/json" },
     });
   } catch (error) {
     console.error("Binance price error:", error);
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