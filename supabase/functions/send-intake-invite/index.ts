// Operator action: invite a manually-approved client to fill out the intake form.
// Creates (or reuses) an auth user + profile + client + site row, then sends the
// existing welcome_set_password email with a magic link to their dashboard.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CREDIT_CONFIG: Record<string, { balance: number; monthly: number; rollover: number }> = {
  starter: { balance: 10, monthly: 10, rollover: 20 },
  growth: { balance: 30, monthly: 30, rollover: 60 },
  pro: { balance: 100, monthly: 100, rollover: 200 },
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

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: callerId, _role: "admin" });
    const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", callerId).maybeSingle();
    const isPartner = (profile as any)?.role === "partner";
    if (!hasAdmin && !isPartner) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const emailRaw = String(body?.email || "").trim().toLowerCase();
    const businessName = String(body?.business_name || "").trim();
    const plan = String(body?.plan || "starter").trim();

    if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return json({ error: "Valid email required" }, 400);
    }
    if (!businessName) return json({ error: "Business name required" }, 400);
    if (!CREDIT_CONFIG[plan]) return json({ error: "Invalid plan" }, 400);

    // 1. Find or create auth user
    let userId: string;
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u: any) => (u.email || "").toLowerCase() === emailRaw);
    if (existing) {
      userId = existing.id;
    } else {
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: emailRaw,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: businessName },
      });
      if (createErr || !newUser?.user) {
        console.error("createUser error:", createErr);
        return json({ error: "Failed to create user", details: createErr?.message }, 500);
      }
      userId = newUser.user.id;
    }

    // 2. Ensure profile exists
    const { data: existingProfile } = await supabase
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!existingProfile) {
      await supabase.from("profiles").insert({
        user_id: userId, email: emailRaw, full_name: businessName, role: "client",
      });
    }

    // 3. Reuse existing active client or create one
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id, business_name")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let clientId: string;
    if (existingClient) {
      clientId = (existingClient as any).id;
      await supabase.from("clients").update({ plan }).eq("id", clientId);
    } else {
      const credits = CREDIT_CONFIG[plan];
      clientId = crypto.randomUUID();
      const { error: cErr } = await supabase.from("clients").insert({
        id: clientId,
        user_id: userId,
        business_name: businessName,
        plan,
        site_status: "building",
        subscription_status: "active",
        lifecycle_stage: "converted",
        conversion_source: "operator_manual_intake_invite",
        converted_at: new Date().toISOString(),
        credits_balance: credits.balance,
        credits_monthly_allowance: credits.monthly,
        credits_rollover_cap: credits.rollover,
        credits_last_reset: new Date().toISOString(),
      } as any);
      if (cErr) {
        console.error("create client error:", cErr);
        return json({ error: "Failed to create client", details: cErr.message }, 500);
      }
      await supabase.from("sites").insert({ client_id: clientId } as any);
    }

    // 4. Generate magic link + send welcome email
    const siteUrl = "https://site-queen-backend.lovable.app";
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: emailRaw,
      options: { redirectTo: `${siteUrl}/set-password` },
    });
    if (linkErr) console.error("magic link error:", linkErr);
    const magicLink = linkData?.properties?.action_link || null;
    const firstName = businessName.split(" ")[0] || "there";

    let emailSent = false;
    let emailError: string | undefined;
    try {
      const { error: invokeErr } = await supabase.functions.invoke("send-email", {
        body: {
          to: emailRaw,
          template: "welcome_set_password",
          data: {
            name: businessName,
            first_name: firstName,
            business_name: businessName,
            magic_link: magicLink,
          },
          clientId,
        },
      });
      if (invokeErr) {
        emailError = invokeErr.message;
        await supabase.from("emails_log").insert({
          client_id: clientId,
          recipient_email: emailRaw,
          email_type: "welcome_set_password",
          status: "failed",
        });
      } else {
        emailSent = true;
      }
    } catch (e: any) {
      emailError = e?.message;
      await supabase.from("emails_log").insert({
        client_id: clientId,
        recipient_email: emailRaw,
        email_type: "welcome_set_password",
        status: "failed",
      });
    }

    return json({ success: true, clientId, userId, emailSent, emailError });
  } catch (e: any) {
    console.error("[send-intake-invite]", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
