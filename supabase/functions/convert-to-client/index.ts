import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller has admin role
    const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationId, plan, callerEmail, callerName } = await req.json();

    if (!applicationId || !plan) {
      return new Response(JSON.stringify({ error: "applicationId and plan are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch application
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (appError || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper: send the welcome email + log explicit success/failure to emails_log
    const sendWelcomeEmail = async (clientId: string) => {
      const siteUrl = "https://site-queen-backend.lovable.app";
      const { data: magicLinkData, error: magicError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: app.email,
        options: { redirectTo: `${siteUrl}/set-password` },
      });
      if (magicError) console.error("Magic link error:", magicError);
      const magicLink = magicLinkData?.properties?.action_link || null;
      const firstName = app.name ? app.name.split(" ")[0] : "there";

      try {
        const { error: invokeError } = await supabase.functions.invoke("send-email", {
          body: {
            to: app.email,
            template: "welcome_set_password",
            data: {
              name: app.name,
              first_name: firstName,
              business_name: app.business_name,
              magic_link: magicLink,
            },
            clientId,
          },
        });
        if (invokeError) {
          console.error("send-email invoke error:", invokeError);
          await supabase.from("emails_log").insert({
            client_id: clientId,
            recipient_email: app.email,
            email_type: "welcome_set_password",
            status: "failed",
          });
          return { sent: false, error: invokeError.message };
        }
        return { sent: true };
      } catch (e) {
        console.error("send-email threw:", e);
        await supabase.from("emails_log").insert({
          client_id: clientId,
          recipient_email: app.email,
          email_type: "welcome_set_password",
          status: "failed",
        });
        return { sent: false, error: (e as Error).message };
      }
    };

    // Idempotency: if a client already exists for this application, re-send the welcome email and return it.
    // (Operators sometimes re-click "Convert" because the original email never arrived.)
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id, user_id, business_name")
      .eq("application_id", app.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingClient) {
      // Make sure the application status is in sync
      if (app.status !== "converted") {
        await supabase.from("applications").update({ status: "converted" }).eq("id", app.id);
      }
      // Always re-send the welcome email when convert is invoked on an existing client
      const emailResult = await sendWelcomeEmail(existingClient.id);
      return new Response(JSON.stringify({
        success: true,
        alreadyConverted: true,
        clientId: existingClient.id,
        userId: existingClient.user_id,
        welcomeEmailSent: emailResult.sent,
        welcomeEmailError: emailResult.error,
        message: emailResult.sent
          ? `${existingClient.business_name} is already a client — welcome email re-sent to ${app.email}.`
          : `${existingClient.business_name} is already a client — but the welcome email failed to send.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Create auth account (or get existing)
    let userId: string;
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u: any) => u.email === app.email);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new user with a random password (they'll use magic link)
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: app.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: app.name },
      });

      if (createError) {
        console.error("Create user error:", createError);
        return new Response(JSON.stringify({ error: "Failed to create user account", details: createError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = newUser.user.id;
    }

    // 2. Ensure profile exists with client role
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!existingProfile) {
      await supabase.from("profiles").insert({
        user_id: userId,
        email: app.email,
        full_name: app.name,
        role: "client",
      });
    }

    // 3. Create client record with correct credit initialization per plan
    const creditConfig: Record<string, { balance: number; monthly: number; rollover: number }> = {
      starter: { balance: 10, monthly: 10, rollover: 20 },
      growth: { balance: 30, monthly: 30, rollover: 60 },
      pro: { balance: 100, monthly: 100, rollover: 200 },
    };
    const credits = creditConfig[plan] || creditConfig.starter;
    const clientId = crypto.randomUUID();

    const { error: clientError } = await supabase.from("clients").insert({
      id: clientId,
      application_id: app.id,
      user_id: userId,
      business_name: app.business_name,
      business_type: app.business_type,
      plan,
      site_status: "building",
      subscription_status: "active",
      credits_balance: credits.balance,
      credits_monthly_allowance: credits.monthly,
      credits_rollover_cap: credits.rollover,
      credits_last_reset: new Date().toISOString(),
    });

    if (clientError) {
      console.error("Create client error:", clientError);
      return new Response(JSON.stringify({ error: "Failed to create client record", details: clientError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Create site record
    await supabase.from("sites").insert({
      client_id: clientId,
      business_type: app.business_type,
      brand_vibe: app.brand_vibe,
      logo_url: app.logo_url,
    });

    // 5. Update application status
    await supabase.from("applications").update({ status: "converted" }).eq("id", app.id);

    // 6. Send welcome email with magic link to set password (uses helper defined above)
    const emailResult = await sendWelcomeEmail(clientId);
    const firstName = app.name ? app.name.split(" ")[0] : "there";

    // 8. Schedule onboarding sequence emails
    const onboardingEmails = [
      { email_type: "onboarding_day1", hours: 2 },
      { email_type: "onboarding_day2", hours: 48 },
      { email_type: "onboarding_day3", hours: 72 },
      { email_type: "onboarding_day5", hours: 120 },
    ];

    for (const oe of onboardingEmails) {
      const sendAt = new Date(Date.now() + oe.hours * 60 * 60 * 1000);
      await supabase.from("scheduled_emails").insert({
        client_id: clientId,
        recipient_email: app.email,
        email_type: oe.email_type,
        send_at: sendAt.toISOString(),
        payload: {
          name: app.name,
          first_name: firstName,
          business_name: app.business_name,
          plan: plan,
          monthly_credits: credits.monthly,
          rollover_cap: credits.rollover,
        },
      });
    }

    // 8. Audit log
    await supabase.from("audit_log").insert({
      user_id: caller.id,
      user_email: callerEmail || caller.email,
      user_name: callerName,
      action: `Converted ${app.business_name} to client (${plan} plan)`,
      target_table: "clients",
      target_id: clientId,
      details: { application_id: app.id, plan, client_email: app.email },
    });

    return new Response(JSON.stringify({
      success: true,
      clientId,
      userId,
      message: `${app.business_name} converted to client successfully`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("convert-to-client error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
