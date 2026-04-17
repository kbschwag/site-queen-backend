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

    // Verify caller is admin/operator
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
    const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { clientId, overrideEmail } = await req.json();
    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch client
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, user_id, business_name")
      .eq("id", clientId)
      .single();
    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve recipient email: override > profile email > auth user email
    let recipientEmail = overrideEmail as string | undefined;
    let fullName: string | null = null;

    if (client.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", client.user_id)
        .maybeSingle();
      if (profile) {
        if (!recipientEmail) recipientEmail = profile.email || undefined;
        fullName = profile.full_name;
      }
      if (!recipientEmail) {
        const { data: authUser } = await supabase.auth.admin.getUserById(client.user_id);
        recipientEmail = authUser?.user?.email || undefined;
      }
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "No email found for this client" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a fresh magic link
    const siteUrl = "https://site-queen-backend.lovable.app";
    const { data: magicLinkData, error: magicError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: recipientEmail,
      options: { redirectTo: `${siteUrl}/set-password` },
    });
    if (magicError) console.error("Magic link error:", magicError);
    const magicLink = magicLinkData?.properties?.action_link || null;

    const firstName = fullName ? fullName.split(" ")[0] : "there";

    // Send the email
    const { error: invokeError } = await supabase.functions.invoke("send-email", {
      body: {
        to: recipientEmail,
        template: "welcome_set_password",
        data: {
          name: fullName || client.business_name,
          first_name: firstName,
          business_name: client.business_name,
          magic_link: magicLink,
        },
        clientId: client.id,
      },
    });

    if (invokeError) {
      console.error("send-email invoke error:", invokeError);
      await supabase.from("emails_log").insert({
        client_id: client.id,
        recipient_email: recipientEmail,
        email_type: "welcome_set_password",
        status: "failed",
      });
      return new Response(JSON.stringify({ error: "Email send failed", details: invokeError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: caller.id,
      user_email: caller.email,
      action: `Resent welcome email for ${client.business_name}`,
      target_table: "clients",
      target_id: client.id,
      details: { recipient_email: recipientEmail },
    });

    return new Response(JSON.stringify({
      success: true,
      recipientEmail,
      message: `Welcome email resent to ${recipientEmail}`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("resend-welcome-email error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
