 // Edge function to fetch SOL/USDT price from Binance
// Uses CoinGecko API as primary source (no geo-restrictions)
// Falls back to Binance.US if needed
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
 };
 
 interface CoinGeckoSimplePrice {
   solana: {
     usd: number;
   };
 }
 
 Deno.serve(async (req) => {
   // Handle CORS preflight
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
   
   try {
    let price: number | null = null;
    let source = 'unknown';
    
    // Try CoinGecko first (no geo-restrictions, free tier)
    try {
      const cgResponse = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );
      
      if (cgResponse.ok) {
        const data: CoinGeckoSimplePrice = await cgResponse.json();
        if (data?.solana?.usd) {
          price = data.solana.usd;
          source = 'coingecko';
        }
      }
    } catch (cgError) {
      console.warn('CoinGecko failed:', cgError);
     }
     
    // Fallback to Binance.US (works in more regions than binance.com)
    if (price === null) {
      try {
        const binanceUsResponse = await fetch(
          'https://api.binance.us/api/v3/ticker/price?symbol=SOLUSD'
        );
        
        if (binanceUsResponse.ok) {
          const data = await binanceUsResponse.json();
          if (data?.price) {
            price = parseFloat(data.price);
            source = 'binance.us';
          }
        }
      } catch (binanceError) {
        console.warn('Binance.US failed:', binanceError);
      }
    }
    
    // Final fallback to CoinPaprika
    if (price === null) {
      try {
        const cpResponse = await fetch(
          'https://api.coinpaprika.com/v1/tickers/sol-solana'
        );
        
        if (cpResponse.ok) {
          const data = await cpResponse.json();
          if (data?.quotes?.USD?.price) {
            price = data.quotes.USD.price;
            source = 'coinpaprika';
          }
        }
      } catch (cpError) {
        console.warn('CoinPaprika failed:', cpError);
      }
    }
    
    if (price === null) {
      throw new Error('All price sources failed');
    }
     
     return new Response(
       JSON.stringify({
         price,
         timestamp: Date.now(),
         connected: true,
        source,
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
    console.error('Failed to fetch SOL price:', error);
     
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