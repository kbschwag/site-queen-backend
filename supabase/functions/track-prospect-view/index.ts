// Public endpoint hit by the prospect-banner script embedded in generated demo sites.
// - Increments demo_view_count and updates demo_last_viewed_at.
// - Fires operator notifications on first view and on the 3rd cumulative view.
// - Returns the banner config to render (or { active: false } once the prospect has converted).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ACTIVE_PROSPECT_STAGES = ["prospect", "pitched", "viewed_demo", "call_booked", "replied"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    const clientId = url.searchParams.get("cid") || (await safeJson(req)).client_id;
    if (!clientId) {
      return json({ active: false, error: "missing cid" }, 400);
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id, business_name, lifecycle_stage, demo_view_count")
      .eq("id", clientId)
      .maybeSingle();

    if (!client) return json({ active: false });
    if (!ACTIVE_PROSPECT_STAGES.includes((client as any).lifecycle_stage)) {
      return json({ active: false });
    }

    const newCount = ((client as any).demo_view_count || 0) + 1;
    const updates: any = {
      demo_view_count: newCount,
      demo_last_viewed_at: new Date().toISOString(),
    };
    // Auto-advance pitched → viewed_demo on first view
    if ((client as any).lifecycle_stage === "pitched" || (client as any).lifecycle_stage === "prospect") {
      updates.lifecycle_stage = "viewed_demo";
    }
    await supabase.from("clients").update(updates).eq("id", clientId);

    // Notifications
    if (newCount === 1) {
      await supabase.from("notifications").insert({
        type: "prospect_demo_first_view",
        target_role: "operator",
        client_id: clientId,
        message: `${(client as any).business_name} just viewed their demo for the first time`,
      } as any);
    } else if (newCount === 3) {
      await supabase.from("notifications").insert({
        type: "prospect_demo_hot",
        target_role: "operator",
        client_id: clientId,
        message: `🔥 ${(client as any).business_name} viewed their demo 3 times — hot lead`,
      } as any);
    }

    const projectRef = Deno.env.get("SUPABASE_URL")!.replace("https://", "").split(".")[0];
    return json({
      active: true,
      business_name: (client as any).business_name,
      claim_url: `https://www.sitequeen.ai/claim/${clientId}`,
      call_url: `https://www.sitequeen.ai/book-call?prospect=${clientId}`,
    });
  } catch (e: any) {
    console.error("[track-prospect-view]", e);
    return json({ active: false, error: e.message }, 500);
  }
});

async function safeJson(req: Request): Promise<any> {
  try { return await req.json(); } catch { return {}; }
}
function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
