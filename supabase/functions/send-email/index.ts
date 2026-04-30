import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_ADDRESS = "SiteQueen <hello@sitequeen.ai>";

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
<tr><td style="background-color:${BRAND_PURPLE};padding:24px 30px;text-align:center;">
  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">♛ SiteQueen</h1>
</td></tr>
<tr><td style="padding:30px 30px 20px;color:${DARK_TEXT};font-size:15px;line-height:1.6;">
${content}
</td></tr>
<tr><td style="padding:20px 30px 30px;text-align:center;border-top:1px solid #eee;">
  <p style="margin:0 0 4px;font-size:12px;color:#999;">SiteQueen.ai — Built different. ♛</p>
  <p style="margin:0;font-size:12px;color:#999;">Questions? Reply to this email or contact hello@sitequeen.ai</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const purpleButton = (text: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr><td style="border-radius:8px;background-color:${BRAND_PURPLE};"><a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">${text}</a></td></tr></table>`;

const darkButton = (text: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto;"><tr><td style="border-radius:8px;background-color:${DARK_TEXT};"><a href="${url}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;border-radius:8px;">${text}</a></td></tr></table>`;

const divider = `<div style="border-top:1px solid #eeeeee;margin:24px 0;"></div>`;

const DASHBOARD_URL = "https://site-queen-backend.lovable.app/login";
const OPERATOR_URL = "https://site-queen-backend.lovable.app/operator";
const CAL_URL = "https://calendly.com/sitequeenai/30min";

const fn = (d: any) => d.first_name || (d.name || "").split(" ")[0] || "there";

const isSandboxRecipientError = (result: any) =>
  result?.statusCode === 403 &&
  typeof result?.message === "string" &&
  result.message.includes("testing emails");

type TemplateConfig = {
  subject: string | ((d: any) => string);
  html: (d: Record<string, any>) => string;
};

const EMAIL_TEMPLATES: Record<string, TemplateConfig> = {
  // ═══════════════════════════════════════════
  // APPLICATION EMAILS (1-5)
  // ═══════════════════════════════════════════

  // #1 — Application received
  application_received: {
    subject: "We received your application ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Thanks for applying, ${fn(d)}!</h2>
      <p>We've received your application for <strong>${d.business_name || "your business"}</strong> and our team is reviewing it now.</p>
      <p>We review every application personally and you'll hear from us within 24 hours. Keep an eye on your inbox.</p>
      <p>In the meantime, follow us on Instagram <a href="https://instagram.com/SiteQueen" style="color:${BRAND_PURPLE};font-weight:bold;">@SiteQueen</a> for behind-the-scenes and client reveals.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #2 — HOT lead auto-approval
  hot_auto_approved: {
    subject: "You're approved — let's build your website ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Amazing news, ${fn(d)}!</h2>
      <p>Your SiteQueen application has been approved. ♛</p>
      <p>We reviewed your application and we love what you're building with <strong>${d.business_name || "your business"}</strong>. We're excited to work with you.</p>
      <p>Your next step is to book your free discovery call so we can learn more about your business and get started:</p>
      ${purpleButton("Book Your Discovery Call →", d.booking_url || CAL_URL)}
      <p>We can't wait to meet you.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #3 — WARM lead acknowledgment
  warm_acknowledgment: {
    subject: "We're reviewing your application ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Thanks for applying to SiteQueen! We've received your application for <strong>${d.business_name || "your business"}</strong>.</p>
      <p>Our team is personally reviewing it right now and you'll hear back from us within <strong>2 hours</strong> during business hours.</p>
      <p>We review every single application to make sure we're the right fit for each other.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #4 — Application approved (manual)
  application_approved: {
    subject: "You're approved — let's build your website ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Great news — your SiteQueen application has been approved. ♛</p>
      <p>We reviewed your application and we love what you're building. We're excited to work with you.</p>
      ${d.operator_note ? `
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:20px 0;border-left:4px solid ${BRAND_PURPLE};">
        <p style="margin:0 0 4px;font-weight:bold;font-size:13px;color:#666;">A personal note from our team:</p>
        <p style="margin:0;font-style:italic;">"${d.operator_note}"</p>
      </div>` : ""}
      <p>Your next step is to book your free discovery call:</p>
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

  // #5 — Application declined (manual)
  application_declined: {
    subject: "About your SiteQueen application",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
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

  // ═══════════════════════════════════════════
  // ONBOARDING EMAILS (6-10)
  // ═══════════════════════════════════════════

  // #6 — Welcome & account setup
  welcome_set_password: {
    subject: "You're in — set up your SiteQueen account ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Amazing news — your SiteQueen application has been approved and your account is ready. ♛</p>
      <p>Click below to access your account and set your password:</p>
      ${d.magic_link ? purpleButton("Access My Account →", d.magic_link) : purpleButton("Log In to Dashboard →", DASHBOARD_URL)}
      <p style="font-size:13px;color:#666;">This link expires in 24 hours. If it expires just reply to this email and we'll send a new one.</p>
      <p>Once you're in you'll find your website brief waiting for you. Fill it out and we'll have your site live within 24 hours.</p>
      <p>Can't wait to build something amazing for <strong>${d.business_name || "your business"}</strong>.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #7 — Onboarding Day 1 (2 hours after welcome)
  onboarding_day1: {
    subject: "What happens next ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Welcome to SiteQueen! Here's exactly what happens next:</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 12px;"><strong>Step 1:</strong> Log in and complete your website brief — this tells us everything about your business.</p>
        <p style="margin:0 0 12px;"><strong>Step 2:</strong> Our AI builds your custom website using your answers.</p>
        <p style="margin:0 0 12px;"><strong>Step 3:</strong> You review your site and tell us what you think.</p>
        <p style="margin:0;"><strong>Step 4:</strong> We push it live and you start getting clients. ♛</p>
      </div>
      <p>The most important thing right now is to complete your website brief:</p>
      ${purpleButton("Complete My Brief →", DASHBOARD_URL)}
      <p>It takes about 10 minutes and the more detail you give us the better your site will be.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #8 — Onboarding Day 2 (48 hours)
  onboarding_day2: {
    subject: "Tips for getting the best website ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Quick tips from our team to help you get the absolute best website possible:</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 12px;">📸 <strong>Upload real photos</strong> — professional photos of you and your work make a huge difference.</p>
        <p style="margin:0 0 12px;">✍️ <strong>Be specific about services</strong> — the more detail you share the better we can showcase what you do.</p>
        <p style="margin:0 0 12px;">💬 <strong>Include testimonials</strong> — social proof is the #1 thing that converts website visitors into clients.</p>
        <p style="margin:0;">🎨 <strong>Share your brand vibe</strong> — colors, fonts, examples of sites you love.</p>
      </div>
      ${d.intake_completed ? `<p>We can see you've already completed your brief — amazing! We're on it.</p>` : `
      <p>Haven't started your brief yet? No worries — jump in now:</p>
      ${purpleButton("Complete My Brief →", DASHBOARD_URL)}
      `}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #9 — Onboarding Day 3 (72 hours)
  onboarding_day3: {
    subject: "How your credits work ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Quick explainer on how your SiteQueen credits work — it's super simple.</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 12px;">💎 <strong>Your ${d.plan || "Starter"} plan</strong> comes with <strong>${d.monthly_credits || 10} credits per month</strong>.</p>
        <p style="margin:0 0 12px;">🔄 <strong>Credits refresh</strong> on the 1st of every month.</p>
        <p style="margin:0 0 12px;">📦 <strong>Unused credits roll over</strong> up to ${d.rollover_cap || 20} credits max.</p>
        <p style="margin:0;">🛒 <strong>Need more?</strong> You can buy extra credit packs anytime from your dashboard.</p>
      </div>
      <p>Here's what credits cover:</p>
      <ul style="line-height:2;padding-left:20px;">
        <li>Phone/email updates — 5 credits</li>
        <li>Photo swaps — 10 credits</li>
        <li>Content rewrites — 15 credits</li>
        <li>New sections — 25+ credits</li>
      </ul>
      ${purpleButton("View My Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #10 — Onboarding Day 5 (120 hours)
  onboarding_day5: {
    subject: "What makes a great small business website ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>We've built hundreds of websites for small businesses. Here's what the best ones have in common:</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 12px;">📱 <strong>Mobile-first design</strong> — 70% of your visitors are on their phones.</p>
        <p style="margin:0 0 12px;">📞 <strong>Click-to-call</strong> — one tap should connect them to you.</p>
        <p style="margin:0 0 12px;">⭐ <strong>Social proof above the fold</strong> — testimonials build instant trust.</p>
        <p style="margin:0 0 12px;">🎯 <strong>Clear call to action</strong> — every page tells visitors what to do next.</p>
        <p style="margin:0;">⚡ <strong>Fast load times</strong> — we optimize every site for speed.</p>
      </div>
      <p>Your SiteQueen website is built with all of this in mind. We've got you covered. ♛</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // ═══════════════════════════════════════════
  // WEBSITE BUILD EMAILS (11-15)
  // ═══════════════════════════════════════════

  // #11 — Intake form submitted
  intake_completed: {
    subject: "We have everything we need — building your site now ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>We've received your website brief for <strong>${d.business_name || "your business"}</strong> — thank you! ♛</p>
      <p>Our AI is already building your custom website. Here's what happens next:</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 8px;">🏗️ Your site is being generated right now</p>
        <p style="margin:0 0 8px;">👀 You'll receive an email when it's ready to preview</p>
        <p style="margin:0;">🚀 After your review we push it live</p>
      </div>
      <p>This usually takes less than 24 hours. We'll email you the moment it's ready.</p>
      ${purpleButton("View Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #12 — Website ready for staging review (three-option layout)
  website_ready_for_review: {
    subject: "Your SiteQueen website is ready to preview ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your website is ready. Take a look and let us know what you think.</p>
      ${d.operator_note ? `
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:20px 0;border-left:4px solid ${BRAND_PURPLE};">
        <p style="margin:0 0 4px;font-weight:bold;font-size:13px;color:#666;">A note from your designer:</p>
        <p style="margin:0;font-style:italic;">"${d.operator_note}"</p>
      </div>` : ""}
      ${purpleButton("Preview Your Website →", d.staging_url || "#")}
      <p style="margin-top:28px;">After reviewing, choose one of these options in your dashboard:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;"><strong style="color:#15803d;">✓ &nbsp;Approve it</strong> — if everything looks perfect</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;"><strong style="color:#b45309;">✏ &nbsp;Request small changes</strong> — for quick tweaks</td></tr>
        <tr><td style="padding:10px 0;"><strong style="color:${BRAND_PURPLE};">📞 &nbsp;Book a revision call</strong> — to talk through bigger changes</td></tr>
      </table>
      ${d.using_stock_photos ? `
      <div style="background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:8px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0;color:#78350F;">One thing to note — we used professional stock photography as placeholders since we didn't receive any photos from you. Your site looks great, but it will look even more like YOU with real photos of your business.</p>
      </div>` : ""}
      ${darkButton("Go to My Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #13 — Pre-launch feedback received (to client)
  prelaunch_feedback_client: {
    subject: "We received your feedback ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      ${d.approved_only ? `
        <p>Your website has been approved and is queued to go live. We'll notify you the moment it's live. ♛</p>
      ` : `
        <p>Thanks for reviewing your website — we've received your feedback. ♛</p>
        <p>We'll review your notes and make any necessary adjustments. You'll hear from us within 24 hours.</p>
      `}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #14 — Feedback needs more information
  prelaunch_needs_info: {
    subject: "Quick question about your feedback ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Thanks for reviewing your website! We have a quick question before we can make the changes you requested.</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid ${BRAND_PURPLE};">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">From your designer:</p>
        <p style="margin:0;">"${d.operator_note || ""}"</p>
      </div>
      <p>Please log into your dashboard to respond:</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #15 — Website is live
  site_live: {
    subject: "Your website is live ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your website is officially live. ♛</p>
      <p>Visit it here:</p>
      ${purpleButton(d.domain || "Visit Your Website →", d.site_url || "#")}
      <p><strong>Share it everywhere — you've earned it.</strong></p>
      <ul style="line-height:2;">
        <li>📱 Instagram/TikTok: "My new website is live! Check it out at ${d.domain || d.site_url}"</li>
        <li>📘 Facebook: "Excited to announce my new website — built by @SiteQueen!"</li>
        <li>📧 Email your existing clients</li>
      </ul>
      <p>Your dashboard is now fully active. Log in anytime to request changes, view analytics, and manage your account.</p>
      ${darkButton("Go to Dashboard →", DASHBOARD_URL)}
      <p>Welcome to SiteQueen. We're so glad you're here. ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
  },

  // ═══════════════════════════════════════════
  // SUPPORT TICKET EMAILS (16-21)
  // ═══════════════════════════════════════════

  // #16 — Ticket submitted confirmation
  ticket_submitted: {
    subject: "We received your request ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>We've received your support request and our team is on it. ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">Your request:</p>
        <p style="margin:0;">"${(d.request_text || "").slice(0, 200)}"</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Type:</td><td style="padding:6px 0;font-weight:bold;">${d.change_type || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Credits:</td><td style="padding:6px 0;font-weight:bold;">${d.credits_cost || "Pending assessment"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Priority:</td><td style="padding:6px 0;font-weight:bold;">${d.priority === "urgent" ? "⚡ Urgent (4hr)" : "Normal (24-48hr)"}</td></tr>
      </table>
      <p>We'll get to work ${d.priority === "urgent" ? "within 4 hours" : "within 24-48 hours"}. You'll receive an email when it's done.</p>
      ${purpleButton("View My Requests →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #17 — Ticket in progress
  ticket_in_progress: {
    subject: "We're working on your request ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Just a quick update — we've started working on your request. ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0;">"${(d.request_text || "").slice(0, 200)}"</p>
      </div>
      <p>We'll notify you as soon as it's completed.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #18 — Ticket completed
  ticket_completed: {
    subject: "Your request has been completed ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
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

  // #19 — Ticket declined
  ticket_declined: {
    subject: "About your recent request",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
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
      ${darkButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #20 — Needs more information
  needs_more_info: {
    subject: "We need a little more information ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>We're working on your recent request and just need a little more information before we can complete it.</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">Your request:</p>
        <p style="margin:0;">"${d.request_text}"</p>
      </div>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid ${BRAND_PURPLE};">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">What we need from you:</p>
        <p style="margin:0;">"${d.operator_note}"</p>
      </div>
      ${purpleButton("Respond in Dashboard →", DASHBOARD_URL)}
      <p>No credits have been deducted while we wait for your response.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #21 — Client responded to information request (operator notification)
  client_responded_info: {
    subject: (d: any) => `Client responded — ${d.business_name}`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Client Response Received</h2>
      <p><strong>${d.business_name}</strong> has responded to your information request.</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">Their response:</p>
        <p style="margin:0;">"${(d.response_text || "").slice(0, 300)}"</p>
      </div>
      ${d.has_attachments ? `<p>They also attached files — view them in the portal.</p>` : ""}
      ${purpleButton("View in Portal →", `${OPERATOR_URL}/change-requests`)}
    `),
  },

  // ═══════════════════════════════════════════
  // CREDIT EMAILS (22-25)
  // ═══════════════════════════════════════════

  // #22 — Credits refreshed monthly
  credits_refreshed: {
    subject: "Your credits have been refreshed ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>It's a new month and your SiteQueen credits have been refreshed. ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0 0 4px;font-size:13px;color:#666;">Your new balance</p>
        <p style="margin:0;font-size:32px;font-weight:bold;color:${BRAND_PURPLE};">${d.new_balance || 0} credits</p>
        <p style="margin:8px 0 0;font-size:13px;color:#666;">${d.monthly_allowance || 0} added this month</p>
      </div>
      <p>Use your credits to request website updates, content changes, photo swaps, and more.</p>
      ${purpleButton("Submit a Request →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #23 — Low credits warning
  low_credits_warning: {
    subject: "You're running low on credits ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Just a heads up — you have <strong>${d.credits_balance || 0} credits</strong> remaining this month.</p>
      <p>Need more? You've got two options:</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 12px;">🛒 <strong>Buy a credit pack</strong> — instant credits added to your account.</p>
        <p style="margin:0;">⬆️ <strong>Upgrade your plan</strong> — get more credits every month.</p>
      </div>
      ${purpleButton("Buy Credits →", DASHBOARD_URL)}
      <p>Your credits refresh on the 1st of next month.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #24 — Credit purchase confirmation
  credit_purchase_confirmation: {
    subject: "Credits added to your account ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your credit purchase is confirmed! ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0 0 4px;font-size:13px;color:#666;">Credits added</p>
        <p style="margin:0;font-size:28px;font-weight:bold;color:${BRAND_PURPLE};">+${d.credits_purchased || 0}</p>
        ${divider}
        <p style="margin:0 0 4px;font-size:13px;color:#666;">New balance</p>
        <p style="margin:0;font-size:28px;font-weight:bold;color:${BRAND_PURPLE};">${d.new_balance || 0} credits</p>
      </div>
      <p>Ready to use them?</p>
      ${purpleButton("Submit a Request →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #25 — Credit assessment confirmed
  credit_assessment_confirmed: {
    subject: "Your request has been assessed ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>We've assessed your recent support request and confirmed the credit cost. ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:bold;font-size:13px;color:#666;">Your request:</p>
        <p style="margin:0;">"${(d.request_text || "").slice(0, 200)}"</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Credits assessed:</td><td style="padding:6px 0;font-weight:bold;">${d.credits_cost || 0}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Credits remaining:</td><td style="padding:6px 0;font-weight:bold;">${d.current_balance || 0}</td></tr>
      </table>
      <p>We've started working on it now and you'll be notified when it's done.</p>
      ${purpleButton("View My Requests →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // ═══════════════════════════════════════════
  // PAYMENT EMAILS (26-33)
  // ═══════════════════════════════════════════

  // #26 — Payment successful
  payment_successful: {
    subject: "Payment confirmed ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your subscription payment has been processed successfully. ♛</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;font-weight:bold;">${d.plan_name || "SiteQueen"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Amount:</td><td style="padding:6px 0;font-weight:bold;">$${d.amount || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Next billing date:</td><td style="padding:6px 0;">${d.next_billing_date || "—"}</td></tr>
      </table>
      <p>Your website is live and your credits are active. Thank you for being a SiteQueen client. ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #27 — Payment failed immediate
  payment_failed_immediate: {
    subject: "Payment issue with your SiteQueen subscription",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>We weren't able to process your payment for your SiteQueen subscription.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;font-weight:bold;">${d.plan_name || "SiteQueen"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Amount:</td><td style="padding:6px 0;font-weight:bold;">$${d.amount || "—"}</td></tr>
        ${d.last4 ? `<tr><td style="padding:6px 0;color:#666;">Card:</td><td style="padding:6px 0;">ending in ${d.last4}</td></tr>` : ""}
      </table>
      <p>Please update your payment method within 7 days to keep your website live:</p>
      ${purpleButton("Update Payment Method →", d.payment_url || DASHBOARD_URL)}
      <p>Your website will remain live for the next 7 days while you sort this out.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #28 — Payment failed Day 3
  payment_failed_day3: {
    subject: "Reminder — payment needed to keep your website live",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Just a friendly reminder that we weren't able to process your payment 3 days ago.</p>
      <p><strong>Your website will go offline in 4 days if payment is not received.</strong></p>
      ${purpleButton("Update Payment Method →", d.payment_url || DASHBOARD_URL)}
      <p>Need help? Reply to this email.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #29 — Payment failed Day 6
  payment_failed_day6: {
    subject: "Final notice — your website goes offline tomorrow",
    html: (d) => emailWrapper(`
      <h2 style="color:#dc2626;margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p><strong>This is a final notice that your SiteQueen website will go offline tomorrow if payment is not received.</strong></p>
      ${purpleButton("Update Payment Method Now →", d.payment_url || DASHBOARD_URL)}
      <p>If you're experiencing difficulty please reply to this email — we may be able to work something out.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #30 — Site suspended
  account_suspended: {
    subject: "Your SiteQueen website has been suspended",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your SiteQueen website has been suspended due to non-payment.</p>
      <p>Your website and all your data are safely stored and can be restored immediately when payment is received.</p>
      ${purpleButton("Update Payment Method →", d.payment_url || DASHBOARD_URL)}
      <p>Questions? Reply to this email.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #31 — Payment received after failure
  payment_restored: {
    subject: "Your website is back live ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your payment has been received and your website is back live. ♛</p>
      <p>Thank you for sorting that out — we're glad to have you back.</p>
      ${purpleButton("Visit Your Website →", d.site_url || "#")}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #32 — Plan upgrade confirmation
  plan_upgrade: {
    subject: "Welcome to your new plan ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>You've been upgraded to the <strong>${d.new_plan || "Growth"}</strong> plan! ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0 0 4px;font-size:13px;color:#666;">Your new monthly credits</p>
        <p style="margin:0;font-size:32px;font-weight:bold;color:${BRAND_PURPLE};">${d.new_monthly_credits || 30}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#666;">Rollover cap: ${d.new_rollover_cap || 60}</p>
      </div>
      <p>Your new credit allowance starts on the 1st of next month. Enjoy the extra power. ♛</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #33 — Plan downgrade confirmation
  plan_downgrade: {
    subject: "Plan change confirmed",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your plan change has been confirmed. You'll be switching to the <strong>${d.new_plan || "Starter"}</strong> plan at the end of your current billing cycle.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Current plan:</td><td style="padding:6px 0;font-weight:bold;">${d.current_plan || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">New plan:</td><td style="padding:6px 0;font-weight:bold;">${d.new_plan || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Effective date:</td><td style="padding:6px 0;">${d.effective_date || "Next billing cycle"}</td></tr>
      </table>
      <p>Your current plan benefits remain active until the switch date.</p>
      <p>Changed your mind? You can cancel the downgrade anytime from your dashboard.</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // ═══════════════════════════════════════════
  // CANCELLATION & RETENTION (34-37)
  // ═══════════════════════════════════════════

  // #34 — Pause confirmation
  pause_confirmation: {
    subject: "Your account has been paused ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your SiteQueen account has been paused. ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 8px;">✅ Your website stays live during the pause</p>
        <p style="margin:0 0 8px;">⏸️ No charges during the pause period</p>
        <p style="margin:0 0 8px;">📅 Pause ends: <strong>${d.pause_ends_at || "—"}</strong></p>
        <p style="margin:0;">🔄 Your subscription resumes automatically</p>
      </div>
      <p>Want to unpause early? Log in anytime.</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p>See you when you're back. ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #35 — Pause ending reminder
  pause_ending_reminder: {
    subject: "Your pause ends soon ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Just a heads up — your SiteQueen pause ends on <strong>${d.pause_ends_at || "—"}</strong>.</p>
      <p>When your pause ends:</p>
      <ul style="line-height:2;">
        <li>Your subscription will resume automatically</li>
        <li>Your credits will refresh</li>
        <li>You'll be able to submit change requests again</li>
      </ul>
      <p>We're excited to have you back. ♛</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #36 — Cancellation confirmation
  cancellation_confirmation: {
    subject: "Cancellation confirmed — we're sad to see you go",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your SiteQueen cancellation has been confirmed.</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 8px;">📅 Your site stays live until <strong>${d.end_date || "end of billing period"}</strong></p>
        <p style="margin:0 0 8px;">💾 Your data and website files are kept for 30 days</p>
        <p style="margin:0;">🔄 You can reactivate anytime within 30 days</p>
      </div>
      <p>We'd love to know what we could have done better. Reply to this email with any feedback — it means the world to us.</p>
      <p>The door is always open if you want to come back. ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #37 — Win-back email (30 days after cancellation)
  win_back: {
    subject: "We miss you ♛ — come back to SiteQueen",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>It's been a month since you left SiteQueen and we miss working with you.</p>
      <p>A lot has improved since you left and we'd love to welcome you back with a special offer:</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0 0 4px;font-size:18px;font-weight:bold;color:${BRAND_PURPLE};">🎁 20 bonus credits</p>
        <p style="margin:0;font-size:13px;color:#666;">when you reactivate your account this week</p>
      </div>
      <p>Your website files are still saved and can be restored instantly.</p>
      ${purpleButton("Reactivate My Account →", DASHBOARD_URL)}
      <p style="font-size:13px;color:#666;">This offer expires in 7 days.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // ═══════════════════════════════════════════
  // REFERRAL (38)
  // ═══════════════════════════════════════════

  // #38 — Referral reward earned
  referral_reward: {
    subject: "You earned 20 credits ♛ — your referral went live!",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Amazing news — your friend <strong>${d.referred_business || "a business you referred"}</strong> just went live with SiteQueen! ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0 0 4px;font-size:13px;color:#666;">Credits earned</p>
        <p style="margin:0;font-size:32px;font-weight:bold;color:${BRAND_PURPLE};">+20</p>
        <p style="margin:8px 0 0;font-size:13px;color:#666;">New balance: ${d.new_balance || 0} credits</p>
      </div>
      <p>Keep referring — every friend that goes live earns you 20 more credits. ♛</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // ═══════════════════════════════════════════
  // MILESTONE EMAILS (39-42)
  // ═══════════════════════════════════════════

  // #39 — Anniversary email (12 months)
  anniversary: {
    subject: "Happy anniversary ♛ — you've earned 20 bonus credits!",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Can you believe it's been a year since you joined SiteQueen? ♛</p>
      <p>Thank you for being an incredible client. Working with <strong>${d.business_name || "your business"}</strong> has been a genuine pleasure.</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0 0 4px;font-size:18px;font-weight:bold;color:${BRAND_PURPLE};">🎉 20 bonus credits</p>
        <p style="margin:0;font-size:13px;color:#666;">added to your account — on us!</p>
      </div>
      <p>Here's to another amazing year together. ♛</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #40 — NPS survey (30 days after live)
  nps_survey: {
    subject: "Quick question — how are we doing? ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your website has been live for 30 days! How's everything going?</p>
      <p>We'd love your honest feedback. On a scale of 0 to 10:</p>
      <p style="text-align:center;font-size:18px;font-weight:bold;color:${BRAND_PURPLE};">How likely are you to recommend SiteQueen to a friend?</p>
      <div style="text-align:center;margin:20px 0;">
        ${[0,1,2,3,4,5,6,7,8,9,10].map(n => `<a href="${DASHBOARD_URL}?nps=${n}" style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;margin:2px;border-radius:6px;background:${n <= 6 ? '#fecaca' : n <= 8 ? '#fef3c7' : '#bbf7d0'};color:#333;text-decoration:none;font-weight:bold;font-size:13px;">${n}</a>`).join("")}
      </div>
      <p style="text-align:center;font-size:12px;color:#666;">0 = Not at all &nbsp;&nbsp;|&nbsp;&nbsp; 10 = Absolutely!</p>
      <p>Your feedback helps us improve for everyone. Thank you! ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #41 — Testimonial request (33 days after live)
  testimonial_request: {
    subject: "Would you share your SiteQueen experience? ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your website has been live for over a month and we hope you're loving it! ♛</p>
      <p>Would you mind sharing a quick testimonial about your experience? It helps other small business owners find us.</p>
      <p>Just reply to this email with:</p>
      <ul style="line-height:2;">
        <li>A few sentences about your SiteQueen experience</li>
        <li>A star rating (1-5)</li>
        <li>Whether we can use your business name</li>
      </ul>
      <p>We'd be so grateful. ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #42 — Monthly maintenance complete
  monthly_maintenance: {
    subject: "Monthly site check complete ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Your monthly website maintenance check is complete. ♛</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 8px;">✅ Site is running perfectly</p>
        <p style="margin:0 0 8px;">✅ All pages loading correctly</p>
        <p style="margin:0 0 8px;">✅ Contact forms working</p>
        <p style="margin:0;">✅ Mobile responsive and fast</p>
      </div>
      <p>Your website for <strong>${d.business_name || "your business"}</strong> is in great shape. No action needed from you.</p>
      <p>Need any updates? Submit a request from your dashboard anytime.</p>
      ${purpleButton("Go to Dashboard →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // ═══════════════════════════════════════════
  // INTAKE REMINDERS (43-45)
  // ═══════════════════════════════════════════

  // #43 — Intake reminder 24 hours
  intake_reminder_24h: {
    subject: "Don't forget your website brief ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>Just a friendly nudge — your website brief is waiting for you! ♛</p>
      <p>The sooner you complete it the sooner we can start building your site. It only takes about 10 minutes.</p>
      ${purpleButton("Complete My Brief →", DASHBOARD_URL)}
      <p>Need help? Reply to this email and we'll walk you through it.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #44 — Intake reminder 3 days
  intake_reminder_3d: {
    subject: "Your website is waiting ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>We noticed you haven't completed your website brief yet for <strong>${d.business_name || "your business"}</strong>.</p>
      <p>We're ready to start building as soon as you give us the details. Most clients finish it in under 10 minutes.</p>
      <p>Here's a quick tip: you don't need to have everything perfect — fill in what you can and we'll work with you on the rest.</p>
      ${purpleButton("Complete My Brief →", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // #45 — Intake reminder 7 days
  intake_reminder_7d: {
    subject: "We're still here for you ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>It's been a week since you set up your SiteQueen account and your website brief is still waiting.</p>
      <p>We don't want you to miss out on your new website. Is there anything holding you back? Common concerns:</p>
      <ul style="line-height:2;">
        <li>💬 <strong>"I don't know what to write"</strong> — just give us the basics, we'll handle the rest</li>
        <li>📸 <strong>"I don't have photos"</strong> — we can use professional stock photos</li>
        <li>🎨 <strong>"I'm not sure about my brand"</strong> — we'll guide you through it</li>
      </ul>
      ${purpleButton("Complete My Brief →", DASHBOARD_URL)}
      <p>Or simply reply to this email and we'll help you get started. ♛</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // ═══════════════════════════════════════════
  // OPERATOR NOTIFICATIONS (46-55)
  // ═══════════════════════════════════════════

  // #46 — New application submitted (to operator)
  operator_new_application: {
    subject: (d: any) => `New application — ${d.business_name} (${d.temperature})`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">New Application Received</h2>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Business:</td><td style="padding:6px 0;font-weight:bold;">${d.business_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Type:</td><td style="padding:6px 0;">${d.business_type}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Score:</td><td style="padding:6px 0;font-weight:bold;">${d.score}/24</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Temperature:</td><td style="padding:6px 0;font-weight:bold;color:${d.temperature === "HOT" ? "#dc2626" : d.temperature === "WARM" ? "#ea580c" : "#666"};">${d.temperature}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Plan interest:</td><td style="padding:6px 0;">${d.plan_interest || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Name:</td><td style="padding:6px 0;">${d.applicant_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email:</td><td style="padding:6px 0;">${d.applicant_email}</td></tr>
      </table>
      ${purpleButton("Review Application →", `${OPERATOR_URL}/applications`)}
    `),
  },

  // #47 — New HOT lead alert (to operator)
  operator_hot_lead: {
    subject: (d: any) => `🔥 HOT LEAD — ${d.business_name} — Review Now!`,
    html: (d) => emailWrapper(`
      <h2 style="color:#dc2626;margin:0 0 16px;">🔥 HOT Lead Alert</h2>
      <p>A high-scoring application just came in. Review it immediately.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Business:</td><td style="padding:6px 0;font-weight:bold;">${d.business_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Score:</td><td style="padding:6px 0;font-weight:bold;color:#dc2626;">${d.score}/24</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan_interest || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Contact:</td><td style="padding:6px 0;">${d.applicant_name} — ${d.applicant_email}</td></tr>
        ${d.phone ? `<tr><td style="padding:6px 0;color:#666;">Phone:</td><td style="padding:6px 0;font-weight:bold;">${d.phone}</td></tr>` : ""}
      </table>
      ${purpleButton("Review Now →", `${OPERATOR_URL}/applications`)}
    `),
  },

  // #48 — Pre-launch feedback received (to operator)
  prelaunch_feedback_operator: {
    subject: (d: any) => `Pre-launch feedback received — ${d.business_name}`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Pre-launch Feedback</h2>
      <p><strong>${d.business_name}</strong> has reviewed their staging site and left feedback.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Client:</td><td style="padding:6px 0;font-weight:bold;">${d.client_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan}</td></tr>
      </table>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 4px;font-weight:bold;font-size:13px;color:#666;">Their feedback:</p>
        <p style="margin:0;">"${d.feedback_text}"</p>
      </div>
      ${d.attachment_count ? `<p>They attached ${d.attachment_count} file(s).</p>` : ""}
      ${purpleButton("View in Portal →", `${OPERATOR_URL}/change-requests`)}
    `),
  },

  // #49 — Payment failed operator alert
  operator_payment_failed: {
    subject: (d: any) => `Payment failed — ${d.business_name}`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Payment Failed</h2>
      <p>A client's payment has failed.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Client:</td><td style="padding:6px 0;font-weight:bold;">${d.business_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Amount:</td><td style="padding:6px 0;">$${d.amount || "—"}</td></tr>
        ${d.phone_number ? `<tr><td style="padding:6px 0;color:#666;">Phone:</td><td style="padding:6px 0;font-weight:bold;">${d.phone_number}</td></tr>` : ""}
      </table>
      <p>Grace period started. Client has 7 days to update payment.</p>
      ${purpleButton("View Client →", `${OPERATOR_URL}/clients`)}
    `),
  },

  // #50 — Day 6 payment urgent alert (to operator)
  payment_failed_operator_urgent: {
    subject: (d: any) => `URGENT — ${d.business_name} website suspending tomorrow`,
    html: (d) => emailWrapper(`
      <h2 style="color:#dc2626;margin:0 0 16px;">⚠️ Urgent: Website Suspension Tomorrow</h2>
      <p><strong>${d.business_name}</strong>'s website will be suspended tomorrow due to non-payment.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan || "—"}</td></tr>
        ${d.phone_number ? `<tr><td style="padding:6px 0;color:#666;">Phone:</td><td style="padding:6px 0;font-weight:bold;">${d.phone_number}</td></tr>` : ""}
      </table>
      <p>Consider calling them to resolve this.</p>
      ${purpleButton("View Client →", `${OPERATOR_URL}/clients`)}
    `),
  },

  // #51 — Site suspended operator alert
  operator_site_suspended: {
    subject: (d: any) => `Site suspended — ${d.business_name}`,
    html: (d) => emailWrapper(`
      <h2 style="color:#dc2626;margin:0 0 16px;">Site Suspended</h2>
      <p><strong>${d.business_name}</strong>'s website has been suspended due to non-payment.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Days overdue:</td><td style="padding:6px 0;font-weight:bold;">${d.days_overdue || "7+"}</td></tr>
        ${d.phone_number ? `<tr><td style="padding:6px 0;color:#666;">Phone:</td><td style="padding:6px 0;font-weight:bold;">${d.phone_number}</td></tr>` : ""}
      </table>
      ${purpleButton("View Client →", `${OPERATOR_URL}/clients`)}
    `),
  },

  // #52 — NPS detractor alert (to operator)
  operator_nps_detractor: {
    subject: (d: any) => `⚠️ NPS Detractor — ${d.business_name} scored ${d.nps_score}`,
    html: (d) => emailWrapper(`
      <h2 style="color:#dc2626;margin:0 0 16px;">⚠️ NPS Detractor Alert</h2>
      <p>A client scored your service poorly. Immediate attention needed.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Client:</td><td style="padding:6px 0;font-weight:bold;">${d.business_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">NPS Score:</td><td style="padding:6px 0;font-weight:bold;color:#dc2626;">${d.nps_score}/10</td></tr>
        ${d.phone_number ? `<tr><td style="padding:6px 0;color:#666;">Phone:</td><td style="padding:6px 0;font-weight:bold;">${d.phone_number}</td></tr>` : ""}
      </table>
      ${d.feedback ? `
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0 0 4px;font-weight:bold;font-size:13px;color:#666;">Their feedback:</p>
        <p style="margin:0;">"${d.feedback}"</p>
      </div>` : ""}
      <p><strong>Consider calling them immediately.</strong></p>
      ${purpleButton("View Client →", `${OPERATOR_URL}/clients`)}
    `),
  },

  // #53 — New testimonial submitted (to operator)
  operator_new_testimonial: {
    subject: (d: any) => `New testimonial — ${d.business_name} (${d.star_rating}★)`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">New Testimonial Received</h2>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Client:</td><td style="padding:6px 0;font-weight:bold;">${d.business_name}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Rating:</td><td style="padding:6px 0;font-weight:bold;">${"⭐".repeat(d.star_rating || 5)}</td></tr>
      </table>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <p style="margin:0;font-style:italic;">"${d.testimonial_text || ""}"</p>
      </div>
      ${purpleButton("Review in Portal →", `${OPERATOR_URL}/clients`)}
    `),
  },

  // #54 — Cancellation operator alert
  operator_cancellation: {
    subject: (d: any) => `Client cancelling — ${d.business_name}`,
    html: (d) => emailWrapper(`
      <h2 style="color:#dc2626;margin:0 0 16px;">Client Cancellation</h2>
      <p><strong>${d.business_name}</strong> is cancelling their subscription.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Reason:</td><td style="padding:6px 0;font-weight:bold;">${d.cancel_reason || "Not provided"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Total revenue:</td><td style="padding:6px 0;">$${d.total_revenue || "—"}</td></tr>
        ${d.phone_number ? `<tr><td style="padding:6px 0;color:#666;">Phone:</td><td style="padding:6px 0;font-weight:bold;">${d.phone_number}</td></tr>` : ""}
      </table>
      ${purpleButton("View Client →", `${OPERATOR_URL}/clients`)}
    `),
  },

  // #55 — Incomplete intake 14 days (to operator)
  operator_incomplete_intake: {
    subject: (d: any) => `Incomplete intake — ${d.business_name} (14 days)`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Incomplete Intake Alert</h2>
      <p><strong>${d.business_name}</strong> has not completed their website brief in 14 days. Consider personal outreach.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#666;">Client since:</td><td style="padding:6px 0;">${d.join_date || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Plan:</td><td style="padding:6px 0;">${d.plan || "—"}</td></tr>
        ${d.phone_number ? `<tr><td style="padding:6px 0;color:#666;">Phone:</td><td style="padding:6px 0;font-weight:bold;">${d.phone_number}</td></tr>` : ""}
      </table>
      ${purpleButton("View Client →", `${OPERATOR_URL}/clients`)}
    `),
  },

  // ═══════════════════════════════════════════
  // LEGACY (backward compat)
  // ═══════════════════════════════════════════
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
      <p>Our team will process it shortly.</p>
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
  },

  change_request_completed: {
    subject: "Your changes are live! — SiteQueen",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">All done!</h2>
      <p>The changes you requested for <strong>${d.business_name}</strong> are now live.</p>
      ${d.site_url ? `<p><a href="${d.site_url}" style="color:${BRAND_PURPLE};">View your site</a></p>` : ""}
      <p style="margin-top:24px;">— The SiteQueen Team</p>
    `),
  },

  // Request photos from client (operator-triggered)
  request_photos: {
    subject: "Your SiteQueen website will look even better with your photos ♛",
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)},</h2>
      <p>We received your website brief and we're excited to get started. ♛</p>
      <p>One thing that would make your website significantly better — real photos of your business.</p>
      <p>Even a few good iPhone photos of:</p>
      <ul style="line-height:2;padding-left:20px;">
        <li>✓ You or your team</li>
        <li>✓ Your work or services in action</li>
        <li>✓ Your location or workspace</li>
        <li>✓ Before and after results</li>
      </ul>
      <p>...make a huge difference in how professional and trustworthy your site looks and how many leads it generates.</p>
      <p>You can upload photos directly in your dashboard:</p>
      ${purpleButton("Upload Photos →", DASHBOARD_URL)}
      <p style="font-size:13px;color:#666;">If we don't hear from you within 48 hours we'll go ahead and build your site using professional stock photography as placeholders. You can always swap them later with a support ticket — it only costs 15 credits per photo swap.</p>
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // ═══════════════════════════════════════════
  // SUPPORT MESSAGES
  // ═══════════════════════════════════════════

  // Inbound — sent to hello@sitequeen.ai when a client uses the "Send us a message" form
  support_message_received: {
    subject: (d) => `New support message — ${d.business_name || d.client_name || "client"}`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">New support message ♛</h2>
      <p><strong>From:</strong> ${d.client_name || "Unknown"} &lt;${d.client_email || "no-email"}&gt;</p>
      <p><strong>Business:</strong> ${d.business_name || "—"}</p>
      ${divider}
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px;white-space:pre-wrap;">${(d.message || "").replace(/</g, "&lt;")}</div>
      ${d.client_email ? darkButton("Reply to client", `mailto:${d.client_email}?subject=Re: your SiteQueen message`) : ""}
      <p style="font-size:12px;color:#999;margin-top:24px;">Open the operator portal to mark this as replied.</p>
    `),
  },

  // Outbound — operator quick-reply to a client message
  support_message_reply: {
    subject: () => `Re: your SiteQueen message ♛`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">Hi ${fn(d)} ♛</h2>
      <p>Thanks for reaching out. Here's our reply:</p>
      <div style="background:${LIGHT_BG};border-radius:8px;padding:16px;white-space:pre-wrap;margin:16px 0;">${(d.reply_text || "").replace(/</g, "&lt;")}</div>
      <p>If you have any follow-up questions just reply to this email — it goes straight to our team.</p>
      ${purpleButton("Open my dashboard", DASHBOARD_URL)}
      <p style="margin-top:24px;">— The SiteQueen Team ♛</p>
    `),
  },

  // Internal — site generation failed (sent to operator team)
  operator_generation_failed: {
    subject: (d) => `⚠ Site generation failed — ${d.business_name || "client"}`,
    html: (d) => emailWrapper(`
      <h2 style="color:${BRAND_PURPLE};margin:0 0 16px;">⚠ Site generation failed</h2>
      <p>Site generation failed for <strong>${d.business_name || "Unknown"}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:120px;">Client:</td><td style="padding:6px 0;"><strong>${d.client_name || "Unknown"}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Business:</td><td style="padding:6px 0;"><strong>${d.business_name || "Unknown"}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Client ID:</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${d.client_id || ""}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Attempts:</td><td style="padding:6px 0;"><strong>${d.attempts || 1}</strong></td></tr>
      </table>
      <div style="background:#fff3f3;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:16px 0;">
        <p style="margin:0;color:#991b1b;font-family:monospace;font-size:12px;word-break:break-word;">${(d.error_message || "Unknown error").replace(/</g, "&lt;")}</p>
      </div>
      <p style="color:#666;font-size:14px;">All intake form data and call notes are safely saved and ready for retry.</p>
      ${purpleButton("Retry now in operator portal", "https://sitequeen.ai/operator/clients")}
      <p style="margin-top:24px;color:#666;font-size:12px;">— SiteQueen automated alert</p>
    `),
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, template, data, applicationId, clientId, replyTo } = await req.json();

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

    // For welcome_set_password template, generate magic link if not provided
    const templateData = { ...(data || {}) };
    if (template === "welcome_set_password" && !templateData.magic_link) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);
        const siteUrl = "https://site-queen-backend.lovable.app";
        const { data: linkData } = await sb.auth.admin.generateLink({
          type: "magiclink",
          email: to,
          options: { redirectTo: `${siteUrl}/set-password` },
        });
        if (linkData?.properties?.action_link) {
          templateData.magic_link = linkData.properties.action_link;
        }
      } catch (e) {
        console.error("Failed to generate magic link for resend:", e);
      }
    }

    const subject = typeof emailTemplate.subject === "function"
      ? (emailTemplate.subject as (d: any) => string)(templateData)
      : emailTemplate.subject;

    const sendEmail = (from: string) => fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from,
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html: emailTemplate.html(templateData),
      }),
    });

    const response = await sendEmail(FROM_ADDRESS);
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
      // Create operator notification for failed email
      await supabase.from("notifications").insert({
        type: "email_failed",
        message: `Email "${template}" failed to send to ${to}: ${result?.message || "Unknown error"}`,
        target_role: "operator",
      });

      if (isSandboxRecipientError(result)) {
        console.warn("Resend sandbox mode: email not delivered to", to);
        return new Response(JSON.stringify({ success: true, sandbox: true, warning: "Resend sandbox mode" }), {
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
