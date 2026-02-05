 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
 
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
     const mode = url.searchParams.get("mode") || "list";
     const ticker = url.searchParams.get("ticker");
 
     let kalshiUrl: string;
     
     if (mode === "get" && ticker) {
       // Get single market details
       kalshiUrl = `${KALSHI_API_BASE}/markets/${ticker}`;
     } else {
       // List markets with KXSOL15M filter
       const params = new URLSearchParams({
         series_ticker: "KXSOL15M",
         status: "open",
         limit: "100",
       });
       kalshiUrl = `${KALSHI_API_BASE}/markets?${params}`;
     }
 
     console.log(`Fetching from Kalshi: ${kalshiUrl}`);
 
     const response = await fetch(kalshiUrl, {
       method: "GET",
       headers: {
         "Accept": "application/json",
         "Content-Type": "application/json",
       },
     });
 
     if (!response.ok) {
       const errorText = await response.text();
       console.error(`Kalshi API error [${response.status}]: ${errorText}`);
       throw new Error(`Kalshi API error: ${response.status}`);
     }
 
     const data = await response.json();
 
     // Transform response based on mode
     if (mode === "get") {
       // Single market response
       return new Response(JSON.stringify(data), {
         status: 200,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     } else {
       // List response - return markets array
       return new Response(JSON.stringify({ markets: data.markets || [] }), {
         status: 200,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     }
   } catch (error) {
     console.error("Kalshi markets error:", error);
     const errorMessage = error instanceof Error ? error.message : "Internal server error";
     return new Response(
       JSON.stringify({ error: errorMessage }),
       {
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       }
     );
   }
 });