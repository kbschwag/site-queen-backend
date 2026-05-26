// operator-chat-confirm: approve or cancel a pending tool action in an operator chat.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }
  const { message_id, action } = body || {};
  if (!message_id || !["approve", "cancel"].includes(action)) {
    return new Response(JSON.stringify({ error: "message_id and action required" }), { status: 400, headers: corsHeaders });
  }

  const patch = action === "approve"
    ? { confirmed_at: new Date().toISOString() }
    : { cancelled_at: new Date().toISOString() };

  const { error } = await supabase.from("operator_chat_messages").update(patch).eq("id", message_id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
