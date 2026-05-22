// Receives form submission CONTENT (name, email, message, etc.) from
// tracker-v3 and stores it in the form_submissions table.
//
// Separate from track-event because:
//   1. PII isolation — form content has stricter RLS than analytics events
//   2. The analytics events table stays "behavioral data only"
//   3. If we ever need to purge PII (GDPR request), we only touch this table

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}

function looksLikeSpam(fields: Record<string, any>): boolean {
  const allText = Object.values(fields).join(" ").toLowerCase();
  const urlCount = (allText.match(/https?:\/\//g) || []).length;
  if (urlCount > 3) return true;
  const spamPatterns = [
    "viagra", "cialis", "casino", "porn", "crypto investment",
    "loan offer", "make money fast", "click here now",
  ];
  return spamPatterns.some((p) => allText.includes(p));
}

function sanitizeFields(fields: Record<string, any>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string") continue;
    let v = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    if (v.length > 5000) v = v.substr(0, 5000);
    clean[key] = v;
  }
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders(), "content-type": "application/json" },
    });
  }

  const { client_id, session_id, page_path, fields } = body;

  if (!client_id || !fields || typeof fields !== "object") {
    return new Response(JSON.stringify({ error: "missing required fields" }), {
      status: 400,
      headers: { ...corsHeaders(), "content-type": "application/json" },
    });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", client_id)
    .single();

  if (!client) {
    return new Response(JSON.stringify({ error: "unknown client" }), {
      status: 404,
      headers: { ...corsHeaders(), "content-type": "application/json" },
    });
  }

  const userAgent = req.headers.get("user-agent") || "";
  const isBotUA = /bot|crawl|spider|scrape|headless/i.test(userAgent);
  if (isBotUA) {
    return new Response(JSON.stringify({ ok: true, dropped: "bot" }), {
      status: 200,
      headers: { ...corsHeaders(), "content-type": "application/json" },
    });
  }

  const cleanFields = sanitizeFields(fields);
  const isSpam = looksLikeSpam(cleanFields);

  let visitorId: string | null = null;
  let source: string | null = null;
  let referrer: string | null = null;

  if (session_id) {
    const { data: session } = await supabase
      .from("analytics_sessions")
      .select("visitor_id, source, referrer")
      .eq("client_id", client_id)
      .eq("session_id", session_id)
      .single();

    if (session) {
      visitorId = session.visitor_id;
      source = session.source;
      referrer = session.referrer;
    }
  }

  const { error } = await supabase.from("form_submissions").insert({
    client_id,
    session_id: session_id || null,
    page_path: page_path || null,
    fields: cleanFields,
    visitor_id: visitorId,
    source,
    referrer,
    is_spam: isSpam,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders(), "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders(), "content-type": "application/json" },
  });
});
