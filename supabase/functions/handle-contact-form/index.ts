// handle-contact-form
// Public endpoint that receives contact form submissions from generated client websites,
// looks up the client's email, and forwards the enquiry via Resend.
//
// Behavior:
// - Honeypot: if the hidden "honeypot" / "website" field is non-empty, return 200 silently.
// - Rate limit: 5 submissions per IP per hour (uses public.rate_limits table).
// - Logs submission to public.form_submissions.
// - Sends email via the Resend connector gateway with reply_to set to the submitter.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_ADDRESS = "SiteQueen <noreply@sitequeen.ai>";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getClientIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function clean(v: unknown, max = 2000): string {
  if (typeof v !== "string") return "";
  // Strip any HTML tags and trim
  return v.replace(/<[^>]*>/g, "").trim().slice(0, max);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function checkRateLimit(supabase: any, ip: string): Promise<{ allowed: boolean }> {
  if (ip === "unknown") return { allowed: true };
  const key = `contact_form:${ip}`;
  const now = new Date();

  try {
    const { data: existing } = await supabase
      .from("rate_limits")
      .select("id, count, reset_at")
      .eq("key", key)
      .maybeSingle();

    if (!existing || new Date(existing.reset_at) < now) {
      // Fresh window
      const resetAt = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS).toISOString();
      if (existing) {
        await supabase.from("rate_limits").update({ count: 1, reset_at: resetAt }).eq("id", existing.id);
      } else {
        await supabase.from("rate_limits").insert({ key, count: 1, reset_at: resetAt });
      }
      return { allowed: true };
    }

    if (existing.count >= RATE_LIMIT_MAX) {
      return { allowed: false };
    }

    await supabase.from("rate_limits").update({ count: existing.count + 1 }).eq("id", existing.id);
    return { allowed: true };
  } catch (e) {
    console.warn("[handle-contact-form] rate limit check failed (allowing):", (e as Error).message);
    return { allowed: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Honeypot: silently succeed for bots. Accept either "honeypot" or "website" field.
  const honeypotValue = (payload?.honeypot ?? payload?.website ?? "").toString().trim();
  if (honeypotValue) {
    console.log("[handle-contact-form] honeypot triggered, silently dropping");
    return jsonResponse({ success: true });
  }

  const clientId = payload?.client_id;
  if (!isUuid(clientId)) {
    return jsonResponse({ error: "Invalid client_id" }, 400);
  }

  const name = clean(payload?.name, 200);
  const phone = clean(payload?.phone, 50);
  const email = clean(payload?.email, 200);
  const service = clean(payload?.service, 200);
  const message = clean(payload?.message, 5000);

  if (!message && !name && !email && !phone) {
    return jsonResponse({ error: "Empty submission" }, 400);
  }

  const ip = getClientIP(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Rate limit
  const { allowed } = await checkRateLimit(supabase, ip);
  if (!allowed) {
    return jsonResponse({ error: "Too many submissions. Please try again later." }, 429);
  }

  // Look up client
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, business_name, user_id")
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();

  if (clientErr || !client) {
    console.warn("[handle-contact-form] unknown client_id", clientId, clientErr?.message);
    return jsonResponse({ error: "Unknown client" }, 404);
  }

  // Resolve client's email — clients table has no email column; use the auth user's profile.
  let recipientEmail: string | null = null;
  if (client.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", client.user_id)
      .maybeSingle();
    recipientEmail = profile?.email || null;
  }

  // Log submission (always, even if email later fails)
  const { error: logErr } = await supabase.from("form_submissions").insert({
    client_id: clientId,
    name: name || null,
    phone: phone || null,
    email: email || null,
    service: service || null,
    message: message || null,
    ip_address: ip,
  });
  if (logErr) console.warn("[handle-contact-form] log insert failed:", logErr.message);

  if (!recipientEmail) {
    console.warn("[handle-contact-form] no recipient email for client", clientId);
    // Still succeed — submission is logged and operators can see it
    return jsonResponse({ success: true });
  }

  // Send email via Resend connector gateway
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1") || Deno.env.get("RESEND_API_KEY");

  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    console.error("[handle-contact-form] Missing API keys");
    return jsonResponse({ success: true }); // submission still logged
  }

  const subjectName = name || "your website";
  const subject = `New enquiry from ${subjectName} via your website`;

  const textBody = [
    `You have a new enquiry from your website.`,
    ``,
    `Name: ${name || "—"}`,
    `Phone: ${phone || "—"}`,
    `Email: ${email || "—"}`,
    `Service: ${service || "—"}`,
    `Message: ${message || "—"}`,
    ``,
    `Reply directly to this email to respond to ${name || "the sender"}.`,
    ``,
    `— SiteQueen`,
  ].join("\n");

  // Lightweight HTML version so it renders cleanly in any client; mirrors the plain text exactly.
  const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;white-space:pre-wrap;">${escapeHtml(textBody)}</div>`;

  try {
    const resp = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [recipientEmail],
        ...(email ? { reply_to: email } : {}),
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[handle-contact-form] Resend failed:", resp.status, errText);
    } else {
      console.log("[handle-contact-form] ✓ email sent to", recipientEmail);
    }

    // Log to emails_log for audit trail
    await supabase.from("emails_log").insert({
      recipient_email: recipientEmail,
      email_type: "contact_form_enquiry",
      status: resp.ok ? "sent" : "failed",
      client_id: clientId,
    });
  } catch (e) {
    console.error("[handle-contact-form] email send threw:", (e as Error).message);
  }

  return jsonResponse({ success: true });
});
