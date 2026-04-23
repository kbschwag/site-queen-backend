import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Thin orchestrator — validates the request and immediately fires off
// generate-website-part1, which chains to generate-website-part2 when done.
// Splitting the work across two functions avoids the 150s edge timeout.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth check — require valid JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authCheck = createClient(supabaseUrl, serviceKey);
  const { data: { user: caller }, error: authErr } = await authCheck.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !caller) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let clientId: string | null = null;
  try {
    const body = await req.json();
    clientId = body.client_id;
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mark as queued immediately so the UI sees status change
  try {
    await authCheck
      .from("sites")
      .update({
        generation_status: "generating",
        generation_progress: "queued",
        last_generation_attempt_at: new Date().toISOString(),
      } as any)
      .eq("client_id", clientId);
  } catch (e) {
    console.error("[generate-website] Failed to mark queued:", e);
  }

  // Fire-and-forget part1 — do NOT await. Part1 will chain to part2 itself.
  fetch(`${supabaseUrl}/functions/v1/generate-website-part1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ client_id: clientId }),
  }).catch((e) => console.error("[generate-website] Failed to dispatch part1:", e));

  return new Response(
    JSON.stringify({ success: true, status: "generation_started", client_id: clientId }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
