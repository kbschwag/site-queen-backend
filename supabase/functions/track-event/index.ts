import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

// ---------- helpers ----------
function sanitizeInput(input: unknown): string {
  if (typeof input !== "string") return String(input ?? "");
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .substring(0, 2000);
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const BOT_UA_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|whatsapp|telegrambot|discordbot|slackbot|linkedinbot|twitterbot|applebot|yandex|baiduspider|duckduckbot|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|rogerbot|screaming frog|sitebulb|gptbot|chatgpt-user|ccbot|claudebot|anthropic|perplexitybot|google-extended/i;

function isBotUA(ua: string): boolean {
  return !!ua && BOT_UA_RE.test(ua);
}

function detectDevice(ua: string): string {
  if (!ua) return "unknown";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|BlackBerry|Opera Mini|IEMobile/i.test(ua)) return "mobile";
  return "desktop";
}

function detectBrowser(ua: string): string {
  if (!ua) return "unknown";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/Firefox\//i.test(ua)) return "Firefox";
  return "Other";
}

function parseSourceMedium(referrer: string, utmSource?: string, utmMedium?: string): { source: string; medium: string } {
  if (utmSource || utmMedium) {
    return { source: utmSource || "(direct)", medium: utmMedium || "(none)" };
  }
  if (!referrer) return { source: "(direct)", medium: "(none)" };
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { return { source: "(direct)", medium: "(none)" }; }
  if (/google\./.test(host)) return { source: "google", medium: "organic" };
  if (/bing\./.test(host)) return { source: "bing", medium: "organic" };
  if (/duckduckgo\./.test(host)) return { source: "duckduckgo", medium: "organic" };
  if (/yahoo\./.test(host)) return { source: "yahoo", medium: "organic" };
  if (/yandex\./.test(host)) return { source: "yandex", medium: "organic" };
  if (/baidu\./.test(host)) return { source: "baidu", medium: "organic" };
  if (/facebook\.|fb\.|instagram\.|t\.co|twitter\.|x\.com|linkedin\.|pinterest\.|tiktok\.|reddit\.|youtube\./.test(host)) {
    const social = host.replace(/^www\./, "").split(".")[0];
    return { source: social, medium: "social" };
  }
  return { source: host.replace(/^www\./, ""), medium: "referral" };
}

function parseUtm(urlStr: string): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  try {
    const u = new URL(urlStr);
    return {
      utm_source: u.searchParams.get("utm_source") || undefined,
      utm_medium: u.searchParams.get("utm_medium") || undefined,
      utm_campaign: u.searchParams.get("utm_campaign") || undefined,
    };
  } catch { return {}; }
}

function readGeo(req: Request): { country?: string; region?: string; city?: string } {
  const h = req.headers;
  const country = h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || h.get("x-country-code") || undefined;
  const region = h.get("cf-region") || h.get("x-vercel-ip-country-region") || undefined;
  const city = h.get("cf-ipcity") || h.get("x-vercel-ip-city") || undefined;
  const decode = (v?: string) => { if (!v) return undefined; try { return decodeURIComponent(v); } catch { return v; } };
  return { country: country || undefined, region: decode(region), city: decode(city) };
}

// ---------- main ----------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const event = await req.json();

    if (!event.client_id || !event.event_type) {
      return new Response(JSON.stringify({ error: "client_id and event_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(event.client_id)) {
      return new Response(JSON.stringify({ error: "Invalid client_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const validEvents = ["page_view", "phone_click", "email_click", "cta_click", "form_submission"];
    if (!validEvents.includes(event.event_type)) {
      return new Response(JSON.stringify({ error: "Invalid event_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify client exists
    const { data: client } = await supabase
      .from("clients").select("id, site_status").eq("id", event.client_id).single();
    if (!client) {
      return new Response(JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Rate-limit form submissions (unchanged behavior)
    const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "")
      .split(",")[0].trim() || "unknown";
    if (event.event_type === "form_submission") {
      const rateLimitKey = `rate_limit_contact_${event.client_id}_${ip}`;
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      const { data: rl } = await supabase.from("rate_limits").select("count, reset_at").eq("key", rateLimitKey).single();
      if (rl && rl.count >= 3 && new Date(rl.reset_at) > now) {
        return new Response(JSON.stringify({ error: "Too many submissions. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await supabase.from("rate_limits").upsert({
        key: rateLimitKey,
        count: rl ? rl.count + 1 : 1,
        reset_at: rl && new Date(rl.reset_at) > now ? rl.reset_at : oneHourFromNow.toISOString(),
      }, { onConflict: "key" });
    }

    // Sanitized fields
    const ua = sanitizeInput(event.user_agent || req.headers.get("user-agent") || "");
    const pagePath = sanitizeInput(event.page_path || "");
    const pageTitle = sanitizeInput(event.page_title || "");
    const referrer = sanitizeInput(event.referrer || "");
    const sessionIdStr = sanitizeInput(event.session_id || "");
    const deviceType = sanitizeInput(event.device_type || "") || detectDevice(ua);
    const browser = detectBrowser(ua);
    const metadata = (event.metadata && typeof event.metadata === "object") ? event.metadata : {};
    const pageUrl = typeof metadata.url === "string" ? metadata.url : "";
    const utm = parseUtm(pageUrl);
    const { source, medium } = parseSourceMedium(referrer, utm.utm_source, utm.utm_medium);

    const geo = readGeo(req);
    const isBot = isBotUA(ua);

    // ---------- visitor + session resolution (skipped for bots, never fails the request) ----------
    let visitorId: string | null = null;
    let sessionFkId: string | null = null;
    let isNewSession = false;

    if (!isBot) {
      try {
        const todayUTC = new Date().toISOString().slice(0, 10);
        const saltSecret = Deno.env.get("ANALYTICS_SALT_SECRET") || "";
        const dailySalt = await sha256(`${saltSecret}|${todayUTC}`);
        const visitorHash = await sha256(`${event.client_id}|${ip}|${ua}|${dailySalt}`);

        // Upsert visitor
        const { data: existingVisitor } = await supabase
          .from("analytics_visitors")
          .select("id, total_sessions")
          .eq("client_id", event.client_id)
          .eq("visitor_hash", visitorHash)
          .maybeSingle();

        if (existingVisitor) {
          visitorId = existingVisitor.id;
          await supabase
            .from("analytics_visitors")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", visitorId);
        } else {
          const { data: newVisitor, error: vErr } = await supabase
            .from("analytics_visitors")
            .insert({
              client_id: event.client_id,
              visitor_hash: visitorHash,
              first_source: `${source} / ${medium}`,
              country: geo.country || null,
              region: geo.region || null,
              city: geo.city || null,
              device_type: deviceType,
            })
            .select("id")
            .single();
          if (vErr) {
            // Race condition on unique constraint — re-fetch
            const { data: raceVisitor } = await supabase
              .from("analytics_visitors").select("id")
              .eq("client_id", event.client_id).eq("visitor_hash", visitorHash).maybeSingle();
            visitorId = raceVisitor?.id || null;
          } else {
            visitorId = newVisitor.id;
          }
        }

        // Find or create session (30-min inactivity window)
        if (visitorId) {
          const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
          const { data: activeSession } = await supabase
            .from("analytics_sessions")
            .select("id, started_at, page_count, converted")
            .eq("visitor_id", visitorId)
            .gt("ended_at", thirtyMinAgo)
            .order("ended_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const convertingEvent = ["form_submission", "phone_click", "cta_click"].includes(event.event_type);

          if (activeSession) {
            sessionFkId = activeSession.id;
            const newPageCount = activeSession.page_count + (event.event_type === "page_view" ? 1 : 0);
            const now = new Date();
            const durationSeconds = Math.max(0, Math.floor((now.getTime() - new Date(activeSession.started_at).getTime()) / 1000));
            await supabase.from("analytics_sessions").update({
              ended_at: now.toISOString(),
              page_count: newPageCount,
              exit_page: pagePath || undefined,
              duration_seconds: durationSeconds,
              is_bounce: newPageCount <= 1,
              converted: activeSession.converted || convertingEvent,
            }).eq("id", sessionFkId);
          } else {
            isNewSession = true;
            const { data: newSession, error: sErr } = await supabase
              .from("analytics_sessions")
              .insert({
                client_id: event.client_id,
                visitor_id: visitorId,
                page_count: event.event_type === "page_view" ? 1 : 0,
                entry_page: pagePath || null,
                exit_page: pagePath || null,
                source,
                medium,
                referrer: referrer || null,
                utm_campaign: utm.utm_campaign || null,
                utm_source: utm.utm_source || null,
                utm_medium: utm.utm_medium || null,
                device_type: deviceType,
                browser,
                is_bounce: true,
                converted: convertingEvent,
              })
              .select("id")
              .single();
            if (!sErr) {
              sessionFkId = newSession.id;
              // Bump total_sessions
              const { data: vRow } = await supabase
                .from("analytics_visitors").select("total_sessions").eq("id", visitorId).maybeSingle();
              if (vRow) {
                await supabase
                  .from("analytics_visitors")
                  .update({ total_sessions: (vRow.total_sessions || 1) + 1 })
                  .eq("id", visitorId);
              }
            }
          }
        }
      } catch (resolveErr) {
        console.error("visitor/session resolution failed:", resolveErr);
        // Fall through — event still gets written
      }
    }

    // ---------- event insert (always) ----------
    await supabase.from("analytics_events").insert({
      client_id: event.client_id,
      event_type: event.event_type,
      page_path: pagePath,
      page_title: pageTitle,
      referrer,
      user_agent: ua,
      device_type: deviceType,
      session_id: sessionIdStr,
      metadata,
      country: geo.country || null,
      visitor_id: visitorId,
      session_id_fk: sessionFkId,
      is_bot: isBot,
    });

    // Daily summary (unchanged) — skip for bots so dashboards stay clean
    if (!isBot) {
      const today = new Date().toISOString().split("T")[0];
      await supabase.rpc("increment_analytics_summary", {
        p_date: today,
        p_client_id: event.client_id,
        p_event_type: event.event_type,
      });
    }

    return new Response(
      JSON.stringify({ success: true, is_bot: isBot, new_session: isNewSession }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("track-event error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
