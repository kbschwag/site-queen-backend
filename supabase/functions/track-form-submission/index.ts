// Receives form submission CONTENT (name, email, message, etc.) from
// tracker-v4 / v5 and stores it in the form_submissions table.
//
// Now also resolves the visitor's current analytics session and writes the
// FK to session_id_fk so the dashboard can join form_submissions to the
// session that produced them.

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
  if (/bot|crawl|spider|scrape|headless/i.test(userAgent)) {
    return new Response(JSON.stringify({ ok: true, dropped: "bot" }), {
      status: 200,
      headers: { ...corsHeaders(), "content-type": "application/json" },
    });
  }

  const cleanFields = sanitizeFields(fields);
  const isSpam = looksLikeSpam(cleanFields);

  // Resolve visitor's current session via the 30-min activity window.
  // We don't know visitor_id directly from the form payload; the tracker
  // uses a sessionStorage `sq_sid` as the text session_id. We find the
  // matching analytics_sessions row by joining through analytics_events.
  let visitorId: string | null = null;
  let sessionFkId: string | null = null;
  let source: string | null = null;
  let referrer: string | null = null;

  if (session_id) {
    // Find the most recent event with this text session_id to recover the
    // visitor_id and (via session_id_fk) the session UUID.
    const { data: recentEvent } = await supabase
      .from("analytics_events")
      .select("visitor_id, session_id_fk")
      .eq("client_id", client_id)
      .eq("session_id", session_id)
      .not("visitor_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentEvent?.visitor_id) {
      visitorId = recentEvent.visitor_id;

      // Confirm the session is still active within the 30-min window.
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: activeSession } = await supabase
        .from("analytics_sessions")
        .select("id, source, referrer")
        .eq("client_id", client_id)
        .eq("visitor_id", visitorId)
        .gt("ended_at", thirtyMinAgo)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSession) {
        sessionFkId = activeSession.id;
        source = activeSession.source;
        referrer = activeSession.referrer;
      } else if (recentEvent.session_id_fk) {
        // Fall back to the session referenced by the most recent event.
        sessionFkId = recentEvent.session_id_fk;
        const { data: sFallback } = await supabase
          .from("analytics_sessions")
          .select("source, referrer")
          .eq("id", sessionFkId)
          .maybeSingle();
        if (sFallback) {
          source = sFallback.source;
          referrer = sFallback.referrer;
        }
      }
    }
  }

  const { error } = await supabase.from("form_submissions").insert({
    client_id,
    session_id: session_id || null,
    session_id_fk: sessionFkId,
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

  return new Response(JSON.stringify({ ok: true, session_id_fk: sessionFkId }), {
    status: 200,
    headers: { ...corsHeaders(), "content-type": "application/json" },
  });
});
