 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
const VERSION = "v1.0.2";
 const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
// Retry with exponential backoff for 5xx errors
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 5
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Only retry on 5xx errors
      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status}`);
        const baseDelay = Math.pow(2, attempt) * 300;
        const jitter = Math.random() * 300;
        const delay = baseDelay + jitter;
        console.log(`[${VERSION}] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const baseDelay = Math.pow(2, attempt) * 300;
      const jitter = Math.random() * 300;
      const delay = baseDelay + jitter;
      console.log(`[${VERSION}] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms: ${lastError.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

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
 
    console.log(`[${VERSION}] Fetching from Kalshi: ${kalshiUrl}`);
 
    const response = await fetchWithRetry(kalshiUrl, {
       method: "GET",
       headers: {
         "Accept": "application/json",
         "Content-Type": "application/json",
       },
     });
 
     if (!response.ok) {
       const errorText = await response.text();
      console.error(`[${VERSION}] Kalshi API error [${response.status}]: ${errorText}`);
       throw new Error(`Kalshi API error: ${response.status}`);
     }
 
     const data = await response.json();
 
     // Transform response based on mode
     if (mode === "get") {
       // Single market response
      return new Response(JSON.stringify({ ...data, _version: VERSION }), {
         status: 200,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     } else {
       // List response - return markets array
      return new Response(JSON.stringify({ markets: data.markets || [], _version: VERSION }), {
         status: 200,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     }
   } catch (error) {
    console.error(`[${VERSION}] Kalshi markets error:`, error);
    
    // Return empty/fallback data instead of error - allows UI to remain functional
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "list";
    
    if (mode === "get") {
      // Return empty market data
      return new Response(
        JSON.stringify({ 
          market: null, 
          error: "Kalshi API temporarily unavailable",
          _version: VERSION 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      // Return empty markets list
      return new Response(
        JSON.stringify({ 
          markets: [], 
          error: "Kalshi API temporarily unavailable",
          _version: VERSION 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
   }
 });