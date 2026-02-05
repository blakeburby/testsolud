 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
// Price APIs
 const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINPAPRIKA_API = "https://api.coinpaprika.com/v1";

// In-memory cache for fallback
let lastKnownPrice: { price: number; timestamp: number } | null = null;
 
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
 
function symbolToCoinPaprikaId(symbol: string): string {
  const mapping: Record<string, string> = {
    "SOLUSDT": "sol-solana",
    "BTCUSDT": "btc-bitcoin",
    "ETHUSDT": "eth-ethereum",
  };
  return mapping[symbol.toUpperCase()] || "sol-solana";
}

async function fetchFromCoinGecko(coinId: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data[coinId]?.usd || null;
  } catch (error) {
    console.error("CoinGecko fetch error:", error);
    return null;
  }
}

async function fetchFromCoinPaprika(coinId: string): Promise<number | null> {
  try {
    const response = await fetch(`${COINPAPRIKA_API}/tickers/${coinId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.quotes?.USD?.price || null;
  } catch (error) {
    console.error("CoinPaprika fetch error:", error);
    return null;
  }
}

async function fetchPriceWithFallback(symbol: string): Promise<{ price: number; source: string }> {
  const coinGeckoId = symbolToCoinGeckoId(symbol);
  const coinPaprikaId = symbolToCoinPaprikaId(symbol);
  
  // Try CoinGecko first (3 attempts with backoff)
  for (let attempt = 0; attempt < 3; attempt++) {
    const price = await fetchFromCoinGecko(coinGeckoId);
    if (price && price > 0) {
      lastKnownPrice = { price, timestamp: Date.now() };
      return { price, source: "coingecko" };
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
  }
  
  // Fallback to CoinPaprika
  const paprikaPrice = await fetchFromCoinPaprika(coinPaprikaId);
  if (paprikaPrice && paprikaPrice > 0) {
    lastKnownPrice = { price: paprikaPrice, timestamp: Date.now() };
    return { price: paprikaPrice, source: "coinpaprika" };
  }
  
  // Final fallback: use cached price if less than 30 seconds old
  if (lastKnownPrice && Date.now() - lastKnownPrice.timestamp < 30000) {
    return { price: lastKnownPrice.price, source: "cache" };
  }
  
  return { price: 0, source: "unavailable" };
}

 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const url = new URL(req.url);
     const symbol = url.searchParams.get("symbol") || "SOLUSDT";
     const historical = url.searchParams.get("historical") === "true";
 
     // QUICK MODE (default): Fast current price only - optimized for 1s polling
     if (!historical) {
        const { price, source } = await fetchPriceWithFallback(symbol);
       return new Response(
         JSON.stringify({
           symbol,
            price,
           timestamp: Date.now(),
            source,
         }),
         { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // HISTORICAL MODE: Fetch real 15-minute history from market_chart
      const coinId = symbolToCoinGeckoId(symbol);
      const { price: currentPrice, source } = await fetchPriceWithFallback(symbol);
      
      // Try to get historical data from CoinGecko
      let klines: Array<{
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }> = [];
      
      try {
        const chartResponse = await fetch(
          `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=1&precision=2`
        );
        
        if (chartResponse.ok) {
          const chartData = await chartResponse.json();
          const now = Date.now();
          const twentyMinutesAgo = now - 20 * 60 * 1000;
          
          if (chartData.prices && Array.isArray(chartData.prices)) {
            const recentPrices = chartData.prices.filter(
              (p: [number, number]) => p[0] >= twentyMinutesAgo
            );
            
            klines = recentPrices.map((p: [number, number], i: number, arr: [number, number][]) => {
              const prevPrice = i > 0 ? arr[i - 1][1] : p[1];
              return {
                time: p[0],
                open: prevPrice,
                high: Math.max(prevPrice, p[1]) * 1.0005,
                low: Math.min(prevPrice, p[1]) * 0.9995,
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
       }
      } catch (error) {
        console.error("Historical chart fetch error:", error);
     }
 
     return new Response(
       JSON.stringify({
         symbol,
         price: currentPrice,
          timestamp: Date.now(),
         klines,
          source,
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