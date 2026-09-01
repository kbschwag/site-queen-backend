// Owner/partner-only: generate a one-time sign-in link for a client account
// so staff can view the client portal exactly as the client sees it.
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
    const redirectTo = String(body?.redirect_to || "").trim();
    if (!clientId) return json({ error: "client_id required" }, 400);

    const { data: client } = await supabase
      .from("clients")
      .select("id, business_name, user_id")
      .eq("id", clientId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!client?.user_id) return json({ error: "Client or linked user not found" }, 404);

    const { data: cProfile } = await supabase
      .from("profiles").select("email").eq("user_id", client.user_id).maybeSingle();
    const email = (cProfile as any)?.email;
    if (!email) return json({ error: "Client has no email on file" }, 404);

    const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: redirectTo || undefined },
    });
    if (linkErr) return json({ error: "Failed to generate link", details: linkErr.message }, 500);

    await supabase.from("audit_log").insert({
      user_id: callerId,
      user_email: userData.user.email,
      action: "client_account_access_link",
      target_table: "clients",
      target_id: clientId,
      details: { business_name: client.business_name, client_email: email },
    });

    return json({ email, business_name: client.business_name, action_link: (link as any)?.properties?.action_link });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
