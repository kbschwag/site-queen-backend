import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

const EMAIL_TEMPLATES: Record<string, { subject: string; html: (data: Record<string, string>) => string }> = {
  application_received: {
    subject: "We received your application! — SiteQueen",
    html: (d) => `
      <h2>Thanks for applying, ${d.name}!</h2>
      <p>We've received your application for <strong>${d.business_name}</strong> and our team is reviewing it.</p>
      <p>We'll be in touch within 24-48 hours with next steps.</p>
      <p>— The SiteQueen Team</p>
    `,
  },
  application_approved: {
    subject: "You're approved! Book your discovery call — SiteQueen ♛",
    html: (d) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Great news, ${d.name}! ♛</h2>
        <p>Your application for <strong>${d.business_name}</strong> has been approved!</p>
        <p>Here's what happens next:</p>
        <ol>
          <li><strong>Book your discovery call</strong> — we'll go over your website vision</li>
          <li>We'll gather your brand assets</li>
          <li>Your site will be live within 48 hours of our call</li>
        </ol>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${d.booking_url || '#'}" style="background: #7c3aed; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Book Your Discovery Call →</a>
        </p>
        <p style="color: #666;">Can't click the button? Copy this link: ${d.booking_url || ''}</p>
        <p>— The SiteQueen Team ♛</p>
      </div>
    `,
  },
  application_declined: {
    subject: "Update on your application — SiteQueen",
    html: (d) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${d.name || "there"},</h2>
        <p>Thank you for your interest in SiteQueen. After reviewing your application, we don't think we're the right fit right now — but that can change.</p>
        <p>You're welcome to reapply in the future. We wish you and your business all the best. ♛</p>
        <p>— The SiteQueen Team</p>
      </div>
    `,
  },
  application_rejected: {
    subject: "Update on your application — SiteQueen",
    html: (d) => `
      <h2>Hi ${d.name},</h2>
      <p>Thank you for your interest in SiteQueen. After reviewing your application, we've determined that our service may not be the best fit at this time.</p>
      <p>${d.reason || "We encourage you to reapply in the future as your business grows."}</p>
      <p>— The SiteQueen Team</p>
    `,
  },
  change_request_received: {
    subject: "Change request received — SiteQueen",
    html: (d) => `
      <h2>Got it!</h2>
      <p>We've received your change request for <strong>${d.business_name}</strong>.</p>
      <p>Our team will process it shortly. Simple changes are usually done within 24 hours.</p>
      <p>— The SiteQueen Team</p>
    `,
  },
  change_request_completed: {
    subject: "Your changes are live! — SiteQueen",
    html: (d) => `
      <h2>All done!</h2>
      <p>The changes you requested for <strong>${d.business_name}</strong> are now live.</p>
      <p>${d.site_url ? `<a href="${d.site_url}">View your site</a>` : "Check your site to see the updates."}</p>
      <p>— The SiteQueen Team</p>
    `,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, template, data, applicationId, clientId } = await req.json();

    if (!to || !template) {
      return new Response(JSON.stringify({ error: "to and template required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailTemplate = EMAIL_TEMPLATES[template];
    if (!emailTemplate) {
      return new Response(JSON.stringify({ error: `Unknown template: ${template}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1") || Deno.env.get("RESEND_API_KEY");

    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      console.error("Missing API keys - LOVABLE:", !!LOVABLE_API_KEY, "RESEND:", !!RESEND_API_KEY);
      // Log the email attempt even if we can't send
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from("emails_log").insert({
        recipient_email: to,
        email_type: template,
        status: "failed",
        application_id: applicationId || null,
        client_id: clientId || null,
      });

      return new Response(JSON.stringify({ error: "Email service not configured", logged: true }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "SiteQueen <onboarding@resend.dev>",
        to: [to],
        subject: emailTemplate.subject,
        html: emailTemplate.html(data || {}),
      }),
    });

    const result = await response.json();

    // Log the email
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from("emails_log").insert({
      recipient_email: to,
      email_type: template,
      status: response.ok ? "sent" : "failed",
      application_id: applicationId || null,
      client_id: clientId || null,
    });

    if (!response.ok) {
      console.error("Resend error:", result);
      // In sandbox mode, Resend only allows sending to the account owner's email.
      // Return success with a warning so the app doesn't break.
      if (result?.statusCode === 403 && result?.message?.includes("testing emails")) {
        console.warn("Resend sandbox mode: email not delivered to", to);
        return new Response(JSON.stringify({ success: true, sandbox: true, warning: "Resend sandbox mode - email logged but not delivered. Verify a domain at resend.com/domains to send to all recipients." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Failed to send email", details: result }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-email error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
