import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const VERSION = "v1.1.0";
const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Import RSA private key from PEM format
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pkcs8Header = "-----BEGIN PRIVATE KEY-----";
  const pkcs8Footer = "-----END PRIVATE KEY-----";
  const pkcs1Header = "-----BEGIN RSA PRIVATE KEY-----";
  const ecHeader = "-----BEGIN EC PRIVATE KEY-----";

  let pemContents: string;

  if (pem.includes(pkcs8Header)) {
    pemContents = pem.replace(pkcs8Header, "").replace(pkcs8Footer, "").replace(/\s/g, "");
  } else if (pem.includes(pkcs1Header)) {
    throw new Error(
      "PKCS#1 format detected. Convert to PKCS#8: openssl pkcs8 -topk8 -inform PEM -outform PEM -in key.pem -out key_pkcs8.pem -nocrypt"
    );
  } else if (pem.includes(ecHeader)) {
    throw new Error("EC key format detected. Kalshi requires RSA keys.");
  } else {
    pemContents = pem.replace(/\s/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
    if (pemContents.length < 100) {
      throw new Error("Private key appears empty or too short.");
    }
  }

  const padded = pemContents + "=".repeat((4 - pemContents.length % 4) % 4);
  const binaryDer = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

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
  const data = new TextEncoder().encode(message);
  const signature = await crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    privateKey,
    data
  );
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
  maxRetries = 5
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 500) {
        lastError = new Error(`Server error: ${response.status}`);
        const delay = Math.pow(2, attempt) * 300 + Math.random() * 300;
        console.log(`[${VERSION}] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const delay = Math.pow(2, attempt) * 300 + Math.random() * 300;
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

    // Load credentials
    const apiKey = Deno.env.get("KALSHI_API_KEY");
    const privateKeyPem = Deno.env.get("KALSHI_PRIVATE_KEY");

    if (!apiKey || !privateKeyPem) {
      return new Response(
        JSON.stringify({ error: "Kalshi API credentials not configured", markets: [], _version: VERSION }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const privateKey = await importPrivateKey(privateKeyPem);

    let kalshiPath: string;
    let kalshiUrl: string;
    
    if (mode === "get" && ticker) {
      kalshiPath = `/trade-api/v2/markets/${ticker}`;
      kalshiUrl = `${KALSHI_API_BASE}/markets/${ticker}`;
    } else {
      const params = new URLSearchParams({
        series_ticker: "KXSOL15M",
        status: "open",
        limit: "100",
      });
      kalshiPath = `/trade-api/v2/markets?${params}`;
      kalshiUrl = `${KALSHI_API_BASE}/markets?${params}`;
    }

    const timestamp = Date.now().toString();
    const signature = await signRequest(privateKey, timestamp, "GET", kalshiPath);

    console.log(`[${VERSION}] Fetching from Kalshi: ${kalshiPath}`);

    const response = await fetchWithRetry(kalshiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "KALSHI-ACCESS-KEY": apiKey,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": signature,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${VERSION}] Kalshi API error [${response.status}]: ${errorText}`);
      throw new Error(`Kalshi API error: ${response.status}`);
    }

    const data = await response.json();

    if (mode === "get") {
      return new Response(JSON.stringify({ ...data, _version: VERSION }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ markets: data.markets || [], _version: VERSION }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error(`[${VERSION}] Kalshi markets error:`, error);
    
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "list";
    
    if (mode === "get") {
      return new Response(
        JSON.stringify({ market: null, error: "Kalshi API temporarily unavailable", _version: VERSION }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ markets: [], error: "Kalshi API temporarily unavailable", _version: VERSION }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
});
