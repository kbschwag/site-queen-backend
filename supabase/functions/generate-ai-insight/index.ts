// Placeholder for the Premium AI weekly-insight card.
// Real generation arrives in a follow-up. For now this returns a stable
// "not yet" payload so the UI has something to call.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      insight: null,
      ready: false,
      message: "AI insights start generating after your site has at least 7 days of data.",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
