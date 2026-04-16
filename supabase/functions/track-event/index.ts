import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify client exists
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", event.client_id)
      .single();

    if (!client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store event
    await supabase.from("analytics_events").insert({
      client_id: event.client_id,
      event_type: event.event_type,
      page_path: event.page_path || null,
      page_title: event.page_title || null,
      referrer: event.referrer || null,
      user_agent: event.user_agent || null,
      device_type: event.device_type || null,
      session_id: event.session_id || null,
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
