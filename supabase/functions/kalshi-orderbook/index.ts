 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 // Import RSA private key from PEM format
 async function importPrivateKey(pem: string): Promise<CryptoKey> {
   // Support both PKCS#8 (PRIVATE KEY) and PKCS#1 (RSA PRIVATE KEY) formats
   const pkcs8Header = "-----BEGIN PRIVATE KEY-----";
   const pkcs8Footer = "-----END PRIVATE KEY-----";
   const pkcs1Header = "-----BEGIN RSA PRIVATE KEY-----";
   const pkcs1Footer = "-----END RSA PRIVATE KEY-----";
   const ecHeader = "-----BEGIN EC PRIVATE KEY-----";
 
   let pemContents: string;
   
   // Log key format for debugging (without exposing key content)
   console.log("Key starts with:", pem.substring(0, 50).replace(/[A-Za-z0-9+/=]/g, '*'));
 
   if (pem.includes(pkcs8Header)) {
     pemContents = pem
       .replace(pkcs8Header, "")
       .replace(pkcs8Footer, "")
       .replace(/\s/g, "");
     console.log("Detected PKCS#8 format, content length:", pemContents.length);
   } else if (pem.includes(pkcs1Header)) {
     // PKCS#1 format is not directly supported by Web Crypto
     throw new Error(
       "PKCS#1 format (BEGIN RSA PRIVATE KEY) detected. Please convert to PKCS#8 format. " +
       "Run: openssl pkcs8 -topk8 -inform PEM -outform PEM -in your_key.pem -out key_pkcs8.pem -nocrypt"
     );
   } else if (pem.includes(ecHeader)) {
     throw new Error(
       "EC key format detected. Kalshi requires RSA keys for API authentication."
     );
   } else {
     // Check if it's raw base64 or has issues
     const cleanedPem = pem.replace(/\s/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
     if (cleanedPem.length < 100) {
       throw new Error(
         "Private key appears to be empty or too short. " +
         "Please ensure you've pasted the complete key including headers " +
         "(-----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----)"
       );
     }
     pemContents = cleanedPem;
     console.log("Using raw base64 content, length:", pemContents.length);
   }
 
   let binaryDer: Uint8Array;
   try {
     // Ensure valid base64 (add padding if needed)
     const padded = pemContents + "=".repeat((4 - pemContents.length % 4) % 4);
     binaryDer = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
     console.log("Decoded key, binary length:", binaryDer.length);
   } catch {
     throw new Error("Failed to decode private key base64 content. Ensure the key is properly formatted.");
   }
 
   return crypto.subtle.importKey(
     "pkcs8",
     binaryDer.buffer as ArrayBuffer,
     { name: "RSA-PSS", hash: "SHA-256" },
     false,
     ["sign"]
   );
 }
 
 // Generate RSA-PSS signature for Kalshi API authentication
 async function signRequest(
   privateKey: CryptoKey,
   timestamp: string,
   method: string,
   path: string
 ): Promise<string> {
   const message = `${timestamp}${method}${path}`;
   const encoder = new TextEncoder();
   const data = encoder.encode(message);
 
   const signature = await crypto.subtle.sign(
     { name: "RSA-PSS", saltLength: 32 },
     privateKey,
     data
   );
 
   // Convert signature to base64
   const signatureArray = new Uint8Array(signature);
   let binary = "";
   for (let i = 0; i < signatureArray.length; i++) {
     binary += String.fromCharCode(signatureArray[i]);
   }
   return btoa(binary);
 }
 
 // Retry with exponential backoff for 5xx errors
 async function fetchWithRetry(
   url: string,
   options: RequestInit,
   maxRetries = 3
 ): Promise<Response> {
   let lastError: Error | null = null;
 
   for (let attempt = 0; attempt < maxRetries; attempt++) {
     try {
       const response = await fetch(url, options);
 
       // Only retry on 5xx errors
       if (response.status >= 500) {
         lastError = new Error(`Server error: ${response.status}`);
         const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
         console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
         await new Promise((r) => setTimeout(r, delay));
         continue;
       }
 
       return response;
     } catch (error) {
       lastError = error instanceof Error ? error : new Error(String(error));
       const delay = Math.pow(2, attempt) * 1000;
       console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms due to: ${lastError.message}`);
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
     const ticker = url.searchParams.get("ticker");
 
     if (!ticker) {
       return new Response(
         JSON.stringify({ error: "Missing ticker parameter" }),
         {
           status: 400,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     // Load credentials from secrets
     const apiKey = Deno.env.get("KALSHI_API_KEY");
     const privateKeyPem = Deno.env.get("KALSHI_PRIVATE_KEY");
 
     if (!apiKey || !privateKeyPem) {
       return new Response(
         JSON.stringify({
           error: "Kalshi API credentials not configured",
           details: "KALSHI_API_KEY and KALSHI_PRIVATE_KEY secrets are required",
         }),
         {
           status: 500,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     // Import private key
     let privateKey: CryptoKey;
     try {
       privateKey = await importPrivateKey(privateKeyPem);
     } catch (error) {
       console.error("Failed to import private key:", error);
         const errorMsg = error instanceof Error ? error.message : "Unknown error";
       return new Response(
         JSON.stringify({
           error: "Invalid private key format",
             details: errorMsg.includes("PKCS#1") || errorMsg.includes("EC key") 
               ? errorMsg 
               : "Private key must be in PKCS#8 PEM format (BEGIN PRIVATE KEY). " +
                 "If you have PKCS#1 format (BEGIN RSA PRIVATE KEY), convert it using: " +
                 "openssl pkcs8 -topk8 -inform PEM -outform PEM -in key.pem -out key_pkcs8.pem -nocrypt",
         }),
         {
           status: 500,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     // Generate authentication headers
     const timestamp = Date.now().toString();
     const method = "GET";
     const path = `/trade-api/v2/markets/${ticker}/orderbook`;
 
     const signature = await signRequest(privateKey, timestamp, method, path);
 
     const kalshiUrl = `${KALSHI_API_BASE}/markets/${ticker}/orderbook`;
     console.log(`Fetching orderbook for ${ticker}`);
 
     const response = await fetchWithRetry(kalshiUrl, {
       method: "GET",
       headers: {
         Accept: "application/json",
         "Content-Type": "application/json",
         "KALSHI-ACCESS-KEY": apiKey,
         "KALSHI-ACCESS-TIMESTAMP": timestamp,
         "KALSHI-ACCESS-SIGNATURE": signature,
       },
     });
 
     if (response.status === 401) {
       const errorText = await response.text();
       console.error("Kalshi authentication failed:", errorText);
       return new Response(
         JSON.stringify({
           error: "Authentication failed",
           details: "Invalid API key or signature",
         }),
         {
           status: 401,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     if (response.status === 404) {
       return new Response(
         JSON.stringify({
           error: "Market not found",
           details: `No orderbook available for ticker: ${ticker}`,
         }),
         {
           status: 404,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     if (!response.ok) {
       const errorText = await response.text();
       console.error(`Kalshi API error [${response.status}]: ${errorText}`);
       return new Response(
         JSON.stringify({
           error: `Kalshi API error: ${response.status}`,
           details: errorText,
         }),
         {
           status: response.status,
           headers: { ...corsHeaders, "Content-Type": "application/json" },
         }
       );
     }
 
     const data = await response.json();
 
     // Transform orderbook data into a more usable format
     const orderbook = data.orderbook || {};
     const orderbookFp = data.orderbook_fp || {};
 
     // Parse yes side - bids are lower prices, asks are higher
     const yesBids: Array<{ price: number; size: number }> = [];
     const yesAsks: Array<{ price: number; size: number }> = [];
 
     // Parse no side
     const noBids: Array<{ price: number; size: number }> = [];
     const noAsks: Array<{ price: number; size: number }> = [];
 
     // Use dollar format if available, otherwise convert from cents
     if (orderbookFp.yes_dollars && Array.isArray(orderbookFp.yes_dollars)) {
       for (const [priceStr, size] of orderbookFp.yes_dollars) {
         const price = parseFloat(priceStr);
          // In Kalshi, orderbook entries are typically asks (offers to sell)
          // Size can be a number or string, ensure it's a number
          const sizeNum = typeof size === 'string' ? parseFloat(size) : size;
          yesAsks.push({ price, size: sizeNum });
       }
     } else if (orderbook.yes && Array.isArray(orderbook.yes)) {
       for (const [priceCents, size] of orderbook.yes) {
          const sizeNum = typeof size === 'string' ? parseFloat(size) : size;
          yesAsks.push({ price: priceCents / 100, size: sizeNum });
       }
     }
 
     if (orderbookFp.no_dollars && Array.isArray(orderbookFp.no_dollars)) {
       for (const [priceStr, size] of orderbookFp.no_dollars) {
         const price = parseFloat(priceStr);
          const sizeNum = typeof size === 'string' ? parseFloat(size) : size;
          noAsks.push({ price, size: sizeNum });
       }
     } else if (orderbook.no && Array.isArray(orderbook.no)) {
       for (const [priceCents, size] of orderbook.no) {
          const sizeNum = typeof size === 'string' ? parseFloat(size) : size;
          noAsks.push({ price: priceCents / 100, size: sizeNum });
       }
     }
 
     // Calculate spread (difference between best yes ask and best no ask complement)
     const bestYesAsk = yesAsks.length > 0 ? Math.min(...yesAsks.map((a) => a.price)) : null;
     const bestNoAsk = noAsks.length > 0 ? Math.min(...noAsks.map((a) => a.price)) : null;
     const spread = bestYesAsk !== null && bestNoAsk !== null 
       ? Math.abs((1 - bestNoAsk) - bestYesAsk)
       : null;
 
     // Calculate total volume
     const totalVolume =
       yesAsks.reduce((sum, a) => sum + a.price * a.size, 0) +
       noAsks.reduce((sum, a) => sum + a.price * a.size, 0);
 
     const result = {
       ticker,
       yesBids,
       yesAsks: yesAsks.sort((a, b) => a.price - b.price), // Lowest price first
       noBids,
       noAsks: noAsks.sort((a, b) => a.price - b.price),
       lastPrice: null,
       spread,
       totalVolume,
       lastUpdated: new Date().toISOString(),
       raw: data, // Include raw response for debugging
     };
 
     return new Response(JSON.stringify(result), {
       status: 200,
       headers: { ...corsHeaders, "Content-Type": "application/json" },
     });
   } catch (error) {
     console.error("Kalshi orderbook error:", error);
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