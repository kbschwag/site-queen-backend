import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Homepage generation now happens entirely in generate-website-part1.
// Part1 generates all copy via Claude, fills the template, uploads to Hostinger,
// and fires generate-extra-pages directly.
// This function is kept for backwards compatibility only.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("[part2] Skipping — homepage is now generated in a single pass by generate-website-part1");

  return new Response(
    JSON.stringify({ success: true, status: "skipped", message: "Homepage generation now handled by generate-website-part1" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
