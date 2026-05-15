// Converts a prospect (clients row with lifecycle_stage in prospect set) into an active client.
// - Flips lifecycle_stage to 'converted'
// - Records conversion source + payment method
// - Creates a pre-launch change_request from operator notes (if provided)
// - Triggers a silent regenerate so the demo banner is removed (best-effort)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auth: caller must be admin or partner
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;
    const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: callerId, _role: "admin" });
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", callerId).maybeSingle();
    const isPartner = (profile as any)?.role === "partner";
    if (!hasAdmin && !isPartner) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const {
      client_id,
      payment_method, // 'stripe_subscription' | 'charge_now' | 'manual_paid'
      plan,           // 'growth' | 'pro' | 'beta'
      domain,
      no_domain_yet,
      conversation_notes,
      conversion_source = "operator_manual",
    } = body || {};

    if (!client_id || !payment_method || !plan) {
      return json({ error: "client_id, payment_method, plan required" }, 400);
    }

    const planMap: Record<string, string> = { beta: "starter", growth: "growth", pro: "pro" };
    const dbPlan = planMap[plan] || plan;

    const updates: any = {
      lifecycle_stage: "converted",
      conversion_source,
      payment_method_at_conversion: payment_method,
      converted_at: new Date().toISOString(),
      plan: dbPlan,
      domain_name: no_domain_yet ? null : (domain || null),
      domain_status: no_domain_yet ? "needs_domain" : "not_started",
    };

    if (payment_method === "manual_paid") {
      updates.subscription_status = "active";
      updates.payment_status = "current";
      updates.pending_payment_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      // Stripe paths — v1 placeholder; mark pending until Stripe wired
      updates.subscription_status = "pending_payment";
      updates.payment_status = "pending";
    }

    const { error: updErr } = await supabase.from("clients").update(updates).eq("id", client_id);
    if (updErr) throw updErr;

    // Pre-launch change request from notes
    if (conversation_notes && conversation_notes.trim()) {
      await supabase.from("change_requests").insert({
        client_id,
        request_text: `Operator notes from conversion call:\n\n${conversation_notes}`,
        is_pre_launch: true,
        status: "pending",
        priority: "normal",
      } as any);
    }

    // Self-serve notification
    if (conversion_source === "self_serve_banner") {
      const { data: c } = await supabase.from("clients").select("business_name").eq("id", client_id).single();
      await supabase.from("notifications").insert({
        type: "prospect_self_serve_converted",
        target_role: "operator",
        client_id,
        message: `🎉 ${(c as any)?.business_name || "A prospect"} just self-serve converted via the banner`,
      } as any);
    }

    // Silent regenerate to strip banner (banner is dynamic so this is also a no-op safety; non-blocking)
    supabase.functions.invoke("generate-website", { body: { client_id } }).catch(() => {});

    return json({ success: true });
  } catch (e: any) {
    console.error("[convert-prospect-to-client]", e);
    return json({ error: e.message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
