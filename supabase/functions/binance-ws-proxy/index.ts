 // Edge function to fetch SOL/USDT price from Binance
 // Uses REST API since edge functions are stateless (can't maintain WebSocket)
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
 };
 
 interface BinanceTickerResponse {
   symbol: string;
   price: string;
 }
 
 Deno.serve(async (req) => {
   // Handle CORS preflight
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
   
   try {
     // Fetch current price from Binance REST API
     // This endpoint returns the latest price and is very fast
     const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
     
     if (!response.ok) {
       throw new Error(`Binance API error: ${response.status}`);
     }
     
     const data: BinanceTickerResponse = await response.json();
     const price = parseFloat(data.price);
     
     return new Response(
       JSON.stringify({
         price,
         timestamp: Date.now(),
         connected: true,
       }),
       {
         headers: {
           ...corsHeaders,
           'Content-Type': 'application/json',
           'Cache-Control': 'no-cache, no-store, must-revalidate',
         },
       }
     );
   } catch (error) {
     console.error('Failed to fetch Binance price:', error);
     
     return new Response(
       JSON.stringify({
         price: null,
         timestamp: null,
         connected: false,
         error: error instanceof Error ? error.message : 'Unknown error',
       }),
       {
         status: 500,
         headers: {
           ...corsHeaders,
           'Content-Type': 'application/json',
         },
       }
     );
   }
 });