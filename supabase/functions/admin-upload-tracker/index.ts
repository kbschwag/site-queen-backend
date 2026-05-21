// One-shot helper to upload the canonical tracker JS to the public `tracker`
// bucket with the correct Content-Type and Cache-Control headers.
//
// The tracker source is inlined here so this function is self-contained.
// Call: POST /admin-upload-tracker  (no body, no auth needed — the function
// is idempotent and only writes a single immutable filename).
//
// Returns: { ok, public_url, cache_control, content_type, bytes, headers_seen }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FILENAME = "tracker-v2.js";
const CACHE_SECONDS = "14400"; // 4 hours
const CONTENT_TYPE = "application/javascript; charset=utf-8";

const TRACKER_SRC = `/* SiteQueen analytics tracker v2 — hosted at:
 * https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/tracker/tracker-v2.js
 *
 * Loaded by client sites via:
 *   <script async src="...tracker-v2.js"
 *           data-client-id="<uuid>"
 *           data-endpoint="<track-event url>"></script>
 *
 * IMMUTABLE once 18+ sites point at it. Behavior changes require a new
 * filename (tracker-v3.js) + generator template update.
 */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var CLIENT_ID = s.getAttribute('data-client-id');
  var ENDPOINT  = s.getAttribute('data-endpoint');
  if (!CLIENT_ID || !ENDPOINT) return;

  function getDevice() {
    return /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  }
  function getSid() {
    var v = sessionStorage.getItem('sq_sid');
    if (!v) { v = Math.random().toString(36).substr(2, 9); sessionStorage.setItem('sq_sid', v); }
    return v;
  }
  function track(type, meta) {
    var body = {
      client_id: CLIENT_ID,
      event_type: type,
      page_path: location.pathname,
      page_title: document.title,
      referrer: document.referrer,
      device_type: getDevice(),
      session_id: getSid(),
      metadata: Object.assign({ url: location.href }, meta || {})
    };
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(body)], { type: 'application/json' }));
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) {}
  }

  track('page_view');
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a');
    if (!a || !a.href) return;
    if (a.href.indexOf('tel:')    === 0) track('phone_click');
    if (a.href.indexOf('mailto:') === 0) track('email_click');
  });
  document.addEventListener('submit', function () { track('form_submission'); });
})();
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const blob = new Blob([TRACKER_SRC], { type: CONTENT_TYPE });
    const { error: upErr } = await supabase.storage
      .from("tracker")
      .upload(FILENAME, blob, {
        upsert: true,
        contentType: CONTENT_TYPE,
        cacheControl: CACHE_SECONDS,
      });
    if (upErr) throw upErr;

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/tracker/${FILENAME}`;

    // Self-verify: HEAD the public URL and report headers we observed
    let headersSeen: Record<string, string> = {};
    try {
      const head = await fetch(publicUrl, { method: "HEAD", cache: "no-store" });
      headersSeen = {
        status: String(head.status),
        "cache-control": head.headers.get("cache-control") || "",
        "content-type": head.headers.get("content-type") || "",
        "access-control-allow-origin": head.headers.get("access-control-allow-origin") || "",
      };
    } catch (_) {}

    return new Response(JSON.stringify({
      ok: true,
      public_url: publicUrl,
      cache_control: `max-age=${CACHE_SECONDS}`,
      content_type: CONTENT_TYPE,
      bytes: TRACKER_SRC.length,
      headers_seen: headersSeen,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("admin-upload-tracker error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
