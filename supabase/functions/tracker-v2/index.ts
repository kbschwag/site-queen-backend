// Hosted SiteQueen analytics tracker — served as static JS with full
// cache-header control. Loaded by client sites via:
//
//   <script async
//     src="https://<project>.functions.supabase.co/tracker-v2"
//     data-client-id="<uuid>"
//     data-endpoint="<track-event url>"></script>
//
// IMMUTABILITY RULE: once any client site points at /tracker-v2, the JS
// body returned here is frozen. Behavior-changing fixes ship as a new
// function file `tracker-v3/index.ts` with the same shape. Only safe
// in-place edits are zero-behavior-change patches (comments, whitespace).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TRACKER_JS = `/* SiteQueen analytics tracker v2 */
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(TRACKER_JS, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=14400, immutable",
    },
  });
});
