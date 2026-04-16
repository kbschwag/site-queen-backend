import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_ADDRESS = "SiteQueen <hello@sitequeen.ai>";

// Shared email styles
const BRAND_PURPLE = "#534AB7";
const DARK_TEXT = "#1a1a2e";
const LIGHT_BG = "#f8f5ff";

const emailWrapper = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr><td align="center" style="padding:30px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
<!-- Header -->
<tr><td style="background-color:${BRAND_PURPLE};padding:24px 30px;text-align:center;">
  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">SiteQueen ♛</h1>
</td></tr>
<!-- Body -->
<tr><td style="padding:30px 30px 20px;color:${DARK_TEXT};font-size:15px;line-height:1.6;">
${content}
</td></tr>
<!-- Footer -->
<tr><td style="padding:20px 30px 30px;text-align:center;border-top:1px solid #eee;">
  <p style="margin:0;font-size:12px;color:#999;">SiteQueen.ai — Built different. ♛</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const purpleButton = (text: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr><td style="border-radius:8px;background-color:${BRAND_PURPLE};"><a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:8px;">${text}</a></td></tr></table>`;

const darkButton = (text: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto;"><tr><td style="border-radius:8px;background-color:${DARK_TEXT};"><a href="${url}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;border-radius:8px;">${text}</a></td></tr></table>`;

const DASHBOARD_URL = "https://site-queen-backend.lovable.app/login";
const CAL_URL = "https://calendly.com/sitequeenai/30min";

type TemplateConfig = {
  subject: string;
  html: (d: Record<string, any>) => string;
};

const EMAIL_TEMPLATES: Record<string, TemplateConfig> = {
  // EMAIL 0 — Welcome: Set Your Password (sent on convert)
  welcome_set_password: {
    subject: "You're in — set up your SiteQueen account ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Amazing news — your SiteQueen application has been approved and your account is ready. ♛</p>
      <p>Click below to access your account and set your password:</p>
      ${d.magic_link ? purpleButton("Access My Account →", d.magic_link) : purpleButton("Log In to Dashboard →", DASHBOARD_URL)}
      <p style="font-size:13px;color:#666;">This link expires in 24 hours. If it expires just reply to this email and we'll send a new one.</p>
      <p>Once you're in you'll find your website brief waiting for you. Fill it out and we'll have your site live within 24 hours.</p>
      <p>Can't wait to build something amazing for <strong>${d.business_name || "your business"}</strong>.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 1 — Application Approved (approval notification before conversion)
  application_approved: {
    subject: "You're approved — let's build your website ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Great news — your SiteQueen application has been approved. ♛</p>
      <p>We reviewed your application and we love what you're building. We're excited to work with you.</p>
      ${d.operator_note ? `
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:20px 0;border-left:4px solid ${BRAND_PURPLE};">
        <p style="margin:0 0 4px;font-weight:bold;font-size:13px;color:#666;">A personal note from our team:</p>
        <p style="margin:0;font-style:italic;">"${d.operator_note}"</p>
      </div>` : ""}
      <p>Your next step is to book your free 15-minute discovery call so we can learn more about your business and get started:</p>
      ${purpleButton("Book Your Discovery Call →", d.booking_url || CAL_URL)}
      ${d.magic_link ? `
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
        <p style="margin:0 0 8px;font-weight:bold;color:#333;">Access Your Client Dashboard</p>
        ${darkButton("Log In to Your Dashboard →", d.magic_link)}
      </div>` : ""}
      <p>We can't wait to meet you.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 2 — Application Declined
  application_declined: {
    subject: "About your SiteQueen application",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Thank you so much for applying to SiteQueen and for your interest in working with us.</p>
      <p>After reviewing your application we don't think we're the right fit at this time.</p>
      ${d.operator_note ? `
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:20px 0;border-left:4px solid ${BRAND_PURPLE};">
        <p style="margin:0;font-style:italic;">"${d.operator_note}"</p>
      </div>` : ""}
      <p>This can change — you're welcome to reapply in 3 months and we'd love to reconsider.</p>
      <p>We wish you and your business all the best.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 3 — Website Ready for Feedback
  website_ready_for_review: {
    subject: "Your website is ready to preview ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Your SiteQueen website is ready for your review. ♛</p>
      <p>We've built something we're really proud of and we can't wait to hear what you think.</p>
      ${d.operator_note ? `
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:20px 0;border-left:4px solid ${BRAND_PURPLE};">
        <p style="margin:0 0 4px;font-weight:bold;font-size:13px;color:#666;">A note from your designer:</p>
        <p style="margin:0;font-style:italic;">"${d.operator_note}"</p>
      </div>` : ""}
      <p>Click below to preview your website:</p>
      ${purpleButton("Preview Your Website →", d.staging_url || "#")}
      <p>Take your time reviewing it. Check that:</p>
      <ul style="line-height:2;">
        <li>✓ All your business information is correct</li>
        <li>✓ Your phone number and email are right</li>
        <li>✓ Your services are accurate</li>
        <li>✓ Photos look great</li>
        <li>✓ Everything looks good on your phone</li>
      </ul>
      <p>Log into your dashboard to leave feedback or approve your site:</p>
      ${darkButton("Go to Dashboard →", DASHBOARD_URL)}
      <p>We're excited to get you live. ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
  },

  // EMAIL 4a — Pre-launch feedback received (to operator)
  prelaunch_feedback_operator: {
    subject: (d: any) => `Pre-launch feedback received — ${d.business_name}`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Pre-launch Feedback</h2>
      <p><strong>${d.business_name}</strong> has reviewed their staging site and left feedback.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;width:100px;">Client:</td><td style="padding:6px 0;font-weight:bold;">${d.client_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Business:</td><td style="padding:6px 0;">${d.business_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan}</td></tr>
      </table>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 4px;font-weight:bold;font-size:13px;color:#666;">Their feedback:</p>
        <p style="margin:0;">"${d.feedback_text}"</p>
      </div>
      ${d.attachment_count ? `<p>They attached ${d.attachment_count} file(s) — view them in the operator portal.</p>` : ""}
      ${purpleButton("View in Portal →", "https://site-queen-backend.lovable.app/operator/change-requests")}
    `),
  },

  // EMAIL 4b — Pre-launch feedback confirmation (to client)
  prelaunch_feedback_client: {
    subject: "We received your feedback ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      ${d.approved_only ? `
        <p>Your website has been approved and is queued to go live. We'll notify you the moment it's live. ♛</p>
      ` : `
        <p>Thanks for reviewing your website — we've received your feedback. ♛</p>
        <p>We'll review your notes and make any necessary adjustments. You'll hear from us within 24 hours.</p>
      `}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 5 — Website Is Live
  site_live: {
    subject: "Your website is live ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Your website is officially live. ♛</p>
      <p>Visit it here:</p>
      ${purpleButton(d.domain || "Visit Your Website →", d.site_url || "#")}
      <p><strong>Share it everywhere — you've earned it.</strong></p>
      <p>Here are some quick ways to spread the word:</p>
      <ul style="line-height:2;">
        <li>📱 Instagram/TikTok: "My new website is live! Check it out at ${d.domain || d.site_url}"</li>
        <li>📘 Facebook: "Excited to announce my new website is live at ${d.domain || d.site_url} — built by the amazing team at SiteQueen!"</li>
        <li>📧 Email your existing clients and let them know</li>
      </ul>
      <p>Your dashboard is now fully active. Log in anytime to:</p>
      <ul style="line-height:2;">
        <li>Request website changes using your monthly credits</li>
        <li>View your billing and plan details</li>
        <li>Get support from our team</li>
      </ul>
      ${darkButton("Go to Dashboard →", DASHBOARD_URL)}
      <p>Welcome to SiteQueen. We're so glad you're here. ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
  },

  // EMAIL 6 — Support Ticket Completed
  ticket_completed: {
    subject: "Your request has been completed ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Good news — your recent request has been completed. ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">What you asked for:</p>
        <p style="margin:0;">"${d.request_text}"</p>
      </div>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">What we did:</p>
        <p style="margin:0;">${d.completion_notes}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Credits used:</td><td style="padding:6px 0;font-weight:bold;">${d.credits_cost || 0}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Credits remaining:</td><td style="padding:6px 0;font-weight:bold;">${d.current_balance || 0}</td></tr>
      </table>
      ${d.site_url ? purpleButton("Visit Your Website →", d.site_url) : ""}
      <p>Need something else? Log into your dashboard to submit another request.</p>
      ${darkButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 7 — Support Ticket Declined
  ticket_declined: {
    subject: "About your recent request",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>We reviewed your recent request and unfortunately we're not able to complete it as submitted.</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">What you asked for:</p>
        <p style="margin:0;">"${d.request_text}"</p>
      </div>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">Reason:</p>
        <p style="margin:0;">${d.decline_reason}</p>
      </div>
      <p>Your <strong>${d.credits_cost || 0}</strong> credits have been fully refunded to your account.</p>
      <p>Your new balance: <strong>${d.current_balance || 0} credits</strong></p>
      <p>If you'd like to submit a revised request or have questions, log into your dashboard.</p>
      ${darkButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 8 — Needs More Information
  needs_more_info: {
    subject: "We need a little more information ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>We're working on your recent request and just need a little more information before we can complete it.</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">Your request:</p>
        <p style="margin:0;">"${d.request_text}"</p>
      </div>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid ${BRAND_PURPLE};">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">What we need from you:</p>
        <p style="margin:0;">"${d.operator_note}"</p>
      </div>
      <p>Please log into your dashboard to provide the additional details:</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p>No credits have been deducted while we wait for your response.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 9a — Payment Failed (Immediate)
  payment_failed_immediate: {
    subject: "Payment issue with your SiteQueen subscription",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>We weren't able to process your payment for your SiteQueen subscription. ♛</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;font-weight:bold;">${d.plan_name || "SiteQueen"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Amount:</td><td style="padding:6px 0;font-weight:bold;">$${d.amount || "—"}</td></tr>
        ${d.last4 ? `<tr><td style="padding:6px 0;color:#666;">Card on file:</td><td style="padding:6px 0;">ending in ${d.last4}</td></tr>` : ""}
      </table>
      <p>This happens sometimes — it could be an expired card, insufficient funds, or a temporary issue with your bank.</p>
      <p>Please update your payment method within 7 days to keep your website live:</p>
      ${purpleButton("Update Payment Method →", d.payment_url || DASHBOARD_URL)}
      <p>Your website will remain live for the next 7 days while you sort this out.</p>
      <p>If you have any questions reply to this email and we'll help you out.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 9b — Payment Failed (Day 3)
  payment_failed_day3: {
    subject: "Reminder — payment needed to keep your website live",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Just a friendly reminder that we weren't able to process your payment 3 days ago.</p>
      <p><strong>Your website will go offline in 4 days if payment is not received.</strong></p>
      <p>Update your payment method now:</p>
      ${purpleButton("Update Payment Method →", d.payment_url || DASHBOARD_URL)}
      <p>Need help? Reply to this email — we're happy to assist.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 9c — Payment Failed (Day 6)
  payment_failed_day6: {
    subject: "Final notice — your website goes offline tomorrow",
    html: (d) => emailWrapper(`
      <h2 style="color:#dc2626;margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p><strong>This is a final notice that your SiteQueen website will go offline tomorrow if payment is not received.</strong></p>
      <p>Update your payment method now to avoid any interruption:</p>
      ${purpleButton("Update Payment Method Now →", d.payment_url || DASHBOARD_URL)}
      <p>If you're experiencing financial difficulty please reply to this email — we may be able to work something out.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 9d — Account Suspended
  account_suspended: {
    subject: "Your SiteQueen website has been suspended",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Your SiteQueen website has been suspended due to non-payment.</p>
      <p>Your website and all your data are safely stored and can be restored immediately when payment is received.</p>
      <p>Restore your website now:</p>
      ${purpleButton("Update Payment Method →", d.payment_url || DASHBOARD_URL)}
      <p>Questions? Reply to this email.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // EMAIL 9e — Payment Restored
  payment_restored: {
    subject: "Your website is back live ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.first_name || d.name || "there"},</h2>
      <p>Your payment has been received and your website is back live. ♛</p>
      <p>Thank you for sorting that out — we're glad to have you back.</p>
      ${purpleButton("Visit Your Website →", d.site_url || "#")}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // Operator notification — Payment Failed Day 6
  payment_failed_operator_urgent: {
    subject: (d: any) => `URGENT — ${d.business_name} website suspending tomorrow`,
    html: (d) => emailWrapper(`
      <h2 style="color:#dc2626;margin:0 0 16px;">⚠️ Urgent: Website Suspension Tomorrow</h2>
      <p><strong>${d.business_name}</strong>'s website will be suspended tomorrow due to non-payment.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Client since:</td><td style="padding:6px 0;">${d.join_date || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan || "—"}</td></tr>
        ${d.phone_number ? `<tr><td style="padding:6px 0;color:#666;">Phone:</td><td style="padding:6px 0;font-weight:bold;">${d.phone_number}</td></tr>` : ""}
      </table>
      <p>Consider calling them to resolve this.</p>
    `),
  },

  // Legacy templates (keep backward compat)
  application_received: {
    subject: "We received your application! — SiteQueen",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Thanks for applying, ${d.name || "there"}!</h2>
      <p>We've received your application for <strong>${d.business_name}</strong> and our team is reviewing it.</p>
      <p>We'll be in touch within 24-48 hours with next steps.</p>
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
  },

  application_rejected: {
    subject: "Update on your application — SiteQueen",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${d.name || "there"},</h2>
      <p>Thank you for your interest in SiteQueen. After reviewing your application, we've determined that our service may not be the best fit at this time.</p>
      <p>${d.reason || "We encourage you to reapply in the future as your business grows."}</p>
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
  },

  change_request_received: {
    subject: "Change request received — SiteQueen",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Got it!</h2>
      <p>We've received your change request for <strong>${d.business_name}</strong>.</p>
      <p>Our team will process it shortly. Simple changes are usually done within 24 hours.</p>
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
  },

  change_request_completed: {
    subject: "Your changes are live! — SiteQueen",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">All done!</h2>
      <p>The changes you requested for <strong>${d.business_name}</strong> are now live.</p>
      ${d.site_url ? `<p><a href="${d.site_url}" style="color:${BRAND_PURPLE};">View your site</a></p>` : "<p>Check your site to see the updates.</p>"}
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
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

    const subject = typeof emailTemplate.subject === "function"
      ? (emailTemplate.subject as (d: any) => string)(data || {})
      : emailTemplate.subject;

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
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
