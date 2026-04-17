// One-off bootstrap to create the primary owner account.
// Safety: only runs if there are zero admin role rows in user_roles.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Safety gate: only allow when no admins exist yet.
    const { count } = await sb
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: "An admin already exists. Bootstrap is locked." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = "hello@sitequeen.ai";
    const password = "WeRuleTheWorld33.";
    const fullName = "SiteQueen Owner";

    const { data: list } = await sb.auth.admin.listUsers();
    let user = list?.users?.find((u: any) => u.email === email);

    if (!user) {
      const { data, error } = await sb.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      user = data.user;
    } else {
      const { error } = await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true });
      if (error) throw error;
    }

    await sb.from("profiles").upsert(
      { user_id: user!.id, email, full_name: fullName, role: "admin" },
      { onConflict: "user_id" }
    );

    await sb.from("user_roles").upsert(
      { user_id: user!.id, role: "admin" },
      { onConflict: "user_id,role" }
    );

    return new Response(
      JSON.stringify({ success: true, userId: user!.id, email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("bootstrap-owner error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
