// Owner/partner-only: set a password for a client's auth account.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: callerId, _role: "admin" });
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", callerId).maybeSingle();
    const role = (profile as any)?.role;
    if (!hasAdmin && role !== "owner" && role !== "partner") return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.client_id || "").trim();
    const password = String(body?.password || "");
    if (!clientId) return json({ error: "client_id required" }, 400);
    if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

    const { data: client } = await supabase
      .from("clients").select("id, business_name, user_id").eq("id", clientId).is("deleted_at", null).maybeSingle();
    if (!client?.user_id) return json({ error: "Client or linked user not found" }, 404);

    const { error: updErr } = await supabase.auth.admin.updateUserById(client.user_id, { password });
    if (updErr) return json({ error: "Failed to set password", details: updErr.message }, 500);

    await supabase.from("audit_log").insert({
      user_id: callerId,
      user_email: userData.user.email,
      action: "client_password_set",
      target_table: "clients",
      target_id: clientId,
      details: { business_name: client.business_name },
    });

    return json({ success: true });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
