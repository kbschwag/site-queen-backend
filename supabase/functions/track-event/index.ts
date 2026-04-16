import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') return String(input ?? '');
  return input.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').substring(0, 2000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const event = await req.json();

    if (!event.client_id || !event.event_type) {
      return new Response(
        JSON.stringify({ error: "client_id and event_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format for client_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(event.client_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid client_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify client exists and site is live
    const { data: client } = await supabase
      .from("clients")
      .select("id, site_status")
      .eq("id", event.client_id)
      .single();

    if (!client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting for contact form submissions
    if (event.event_type === "form_submission") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                 req.headers.get("cf-connecting-ip") || "unknown";
      const rateLimitKey = `rate_limit_contact_${event.client_id}_${ip}`;
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      const { data: rl } = await supabase.from("rate_limits").select("count, reset_at").eq("key", rateLimitKey).single();
      if (rl && rl.count >= 3 && new Date(rl.reset_at) > now) {
        return new Response(
          JSON.stringify({ error: "Too many submissions. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Upsert rate limit
      await supabase.from("rate_limits").upsert({
        key: rateLimitKey,
        count: rl ? rl.count + 1 : 1,
        reset_at: rl && new Date(rl.reset_at) > now ? rl.reset_at : oneHourFromNow.toISOString(),
      }, { onConflict: "key" });
    }

    // Validate event_type
    const validEvents = ["page_view", "phone_click", "email_click", "cta_click", "form_submission"];
    if (!validEvents.includes(event.event_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid event_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store event with sanitized inputs
    await supabase.from("analytics_events").insert({
      client_id: event.client_id,
      event_type: event.event_type,
      page_path: sanitizeInput(event.page_path || ""),
      page_title: sanitizeInput(event.page_title || ""),
      referrer: sanitizeInput(event.referrer || ""),
      user_agent: sanitizeInput(event.user_agent || ""),
      device_type: sanitizeInput(event.device_type || ""),
      session_id: sanitizeInput(event.session_id || ""),
      metadata: event.metadata || {},
    });

    // Update daily summary atomically
    const today = new Date().toISOString().split("T")[0];
    await supabase.rpc("increment_analytics_summary", {
      p_date: today,
      p_client_id: event.client_id,
      p_event_type: event.event_type,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("track-event error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
