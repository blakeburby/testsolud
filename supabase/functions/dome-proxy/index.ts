 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 const DOME_BASE = "https://api.domeapi.io/v1";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   const apiKey = Deno.env.get("DOME_API_KEY");
   if (!apiKey) {
     return new Response(JSON.stringify({ error: "API key not configured" }), {
       status: 500,
       headers: { ...corsHeaders, "Content-Type": "application/json" },
     });
   }
 
   try {
     const url = new URL(req.url);
     const endpoint = url.searchParams.get("endpoint");
 
     if (!endpoint) {
       return new Response(JSON.stringify({ error: "Missing endpoint parameter" }), {
         status: 400,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     }
 
     // Build the full Dome URL
     const domeUrl = `${DOME_BASE}${endpoint}`;
 
     // Forward query params (except endpoint)
     const searchParams = new URLSearchParams();
     url.searchParams.forEach((value, key) => {
       if (key !== "endpoint") {
         searchParams.append(key, value);
       }
     });
     const queryString = searchParams.toString();
     const fullUrl = queryString ? `${domeUrl}?${queryString}` : domeUrl;
 
     console.log(`Proxying request to: ${fullUrl}`);
 
     const response = await fetch(fullUrl, {
       method: req.method,
       headers: {
         "Authorization": `Bearer ${apiKey}`,
         "Content-Type": "application/json",
       },
     });
 
     const data = await response.json();
 
     return new Response(JSON.stringify(data), {
       status: response.status,
       headers: { ...corsHeaders, "Content-Type": "application/json" },
     });
   } catch (error) {
     console.error("Dome proxy error:", error);
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