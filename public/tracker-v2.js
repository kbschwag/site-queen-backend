/* SiteQueen analytics tracker v2 — hosted at:
 * https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/tracker/tracker-v2.js
 *
 * Loaded by client sites via:
 *   <script async src="...tracker-v2.js"
 *           data-client-id="<uuid>"
 *           data-endpoint="<track-event url>"></script>
 *
 * This file is IMMUTABLE once 18+ sites point at it. Behavior changes
 * require a new filename (tracker-v3.js) + generator template update.
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
