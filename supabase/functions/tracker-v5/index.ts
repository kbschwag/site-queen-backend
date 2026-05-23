// SiteQueen Analytics Tracker — v5
//
// Changes from v4:
//   - page_exit fires on visibilitychange → hidden in addition to pagehide /
//     beforeunload (mobile background-tab exits were being lost). A single
//     exitSent guard prevents double-firing.
//   - page_exit payload now includes last_scroll_milestone (0/25/50/75/100,
//     the highest milestone reached this session on this page) and an
//     explicit exit_page_path captured at exit time.
//   - page_view payload now includes doc_width / doc_height for the
//     loaded document.
//
// Everything else matches v4.
//
// Loader snippet:
//   <script async
//     src="https://<PROJECT>.supabase.co/functions/v1/tracker-v5"
//     data-client-id="<UUID>"
//     data-endpoint="https://<PROJECT>.supabase.co/functions/v1/track-event"
//     data-tier="growth"|"premium">
//   </script>

const TRACKER_JS = `(function() {
  var scriptTag = document.currentScript;
  if (!scriptTag) {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf('tracker-v5') !== -1) {
        scriptTag = scripts[i];
        break;
      }
    }
  }
  if (!scriptTag) return;

  var CLIENT_ID = scriptTag.getAttribute('data-client-id');
  var ENDPOINT = scriptTag.getAttribute('data-endpoint');
  var TIER = (scriptTag.getAttribute('data-tier') || 'growth').toLowerCase();
  var FORM_ENDPOINT = scriptTag.getAttribute('data-form-endpoint') ||
    (ENDPOINT ? ENDPOINT.replace('/track-event', '/track-form-submission') : null);
  if (!CLIENT_ID || !ENDPOINT) return;

  var IS_PREMIUM = TIER === 'premium';

  function getDevice() {
    return /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  }
  function getSid() {
    var s = sessionStorage.getItem('sq_sid');
    if (!s) {
      s = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      sessionStorage.setItem('sq_sid', s);
    }
    return s;
  }
  function getPageLoadTime() {
    if (window.performance && performance.now) return Math.round(performance.now());
    return 0;
  }
  function getDocDims() {
    return {
      w: document.documentElement.scrollWidth || window.innerWidth || 0,
      h: Math.max(document.body && document.body.scrollHeight || 0,
                  document.documentElement.scrollHeight || 0)
    };
  }

  function buildPayload(type, meta) {
    var m = meta || {};
    try { m.url = window.location.href; } catch (_) {}
    return {
      client_id: CLIENT_ID,
      event_type: type,
      page_path: window.location.pathname,
      page_title: document.title,
      referrer: document.referrer,
      device_type: getDevice(),
      session_id: getSid(),
      tier: TIER,
      metadata: m
    };
  }

  function send(type, meta) {
    var payload = buildPayload(type, meta);
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function() {});
    } catch (_) {}
  }

  function sendOnExit(type, meta) {
    var payload = buildPayload(type, meta);
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
        return;
      }
    } catch (_) {}
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function() {});
    } catch (_) {}
  }

  function sendFormContent(formData) {
    if (!FORM_ENDPOINT) return;
    var payload = {
      client_id: CLIENT_ID,
      session_id: getSid(),
      page_path: window.location.pathname,
      fields: formData
    };
    try {
      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function() {});
    } catch (_) {}
  }

  function describeElement(el) {
    if (!el || !el.tagName) return null;
    var info = { tag: el.tagName.toLowerCase() };
    if (el.id) info.id = el.id;
    if (el.className && typeof el.className === 'string') {
      info.classes = el.className.trim().split(/\\s+/).slice(0, 3).join(' ');
    }
    var trackName = el.getAttribute && el.getAttribute('data-sq-track');
    if (trackName) info.track_name = trackName;
    if (el.innerText) {
      var t = el.innerText.trim().replace(/\\s+/g, ' ');
      if (t.length > 60) t = t.substr(0, 60) + '...';
      if (t) info.text = t;
    }
    if (el.tagName.toLowerCase() === 'a' && el.href) {
      info.href = el.href;
    }
    return info;
  }

  // ===== page_view =====
  var initialDims = getDocDims();
  send('page_view', {
    load_time_ms: getPageLoadTime(),
    doc_width: initialDims.w,
    doc_height: initialDims.h
  });

  // ===== link / form / custom-tagged click handler =====
  document.addEventListener('click', function(e) {
    var target = e.target;
    var trackedEl = target.closest && target.closest('[data-sq-track]');
    if (trackedEl) {
      var trackName = trackedEl.getAttribute('data-sq-track');
      send('custom_event', {
        event_name: trackName,
        element: describeElement(trackedEl)
      });
    }
    var anchor = target.closest && target.closest('a');
    if (anchor && anchor.href) {
      if (anchor.href.indexOf('tel:') === 0) {
        send('phone_click', {
          number: anchor.href.replace('tel:', ''),
          element: describeElement(anchor)
        });
      } else if (anchor.href.indexOf('mailto:') === 0) {
        send('email_click', {
          address: anchor.href.replace('mailto:', '').split('?')[0],
          element: describeElement(anchor)
        });
      }
    }
  }, true);

  // ===== form submission =====
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    if (form.hasAttribute('data-sq-no-track')) return;

    send('form_submission', {
      form_id: form.id || null,
      form_name: form.getAttribute('name') || null,
      field_count: form.elements ? form.elements.length : 0
    });

    try {
      var formData = {};
      var elements = form.elements;
      for (var i = 0; i < elements.length; i++) {
        var field = elements[i];
        if (!field.name) continue;
        if (field.type === 'password') continue;
        if (field.type === 'hidden' && field.name.indexOf('csrf') !== -1) continue;
        var val = field.value;
        if (val && val.length > 5000) val = val.substr(0, 5000) + '...[truncated]';
        formData[field.name] = val;
      }
      sendFormContent(formData);
    } catch (_) {}
  }, true);

  // ===== scroll depth (Premium) — track highest milestone for exit payload =====
  var highestMilestone = 0;
  if (IS_PREMIUM) {
    var scrollMilestonesHit = {};
    var milestones = [25, 50, 75, 100];
    function checkScrollDepth() {
      var docHeight = Math.max(
        document.body.scrollHeight || 0,
        document.documentElement.scrollHeight || 0
      );
      var viewportBottom = (window.scrollY || window.pageYOffset || 0) + window.innerHeight;
      var pct = docHeight > 0 ? Math.round((viewportBottom / docHeight) * 100) : 0;
      for (var i = 0; i < milestones.length; i++) {
        var m = milestones[i];
        if (pct >= m && !scrollMilestonesHit[m]) {
          scrollMilestonesHit[m] = true;
          if (m > highestMilestone) highestMilestone = m;
          send('scroll_depth', { milestone: m, page_path: window.location.pathname });
        }
      }
    }
    var scrollThrottle = null;
    window.addEventListener('scroll', function() {
      if (scrollThrottle) return;
      scrollThrottle = setTimeout(function() {
        checkScrollDepth();
        scrollThrottle = null;
      }, 200);
    }, { passive: true });
    setTimeout(checkScrollDepth, 500);
  }

  // ===== element visibility (Premium) =====
  if (IS_PREMIUM && 'IntersectionObserver' in window) {
    var milestonesSeen = {};
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var name = el.getAttribute('data-sq-milestone');
        if (!name || milestonesSeen[name]) return;
        milestonesSeen[name] = true;
        send('element_visible', {
          milestone_name: name,
          page_path: window.location.pathname,
          element: describeElement(el)
        });
        observer.unobserve(el);
      });
    }, { threshold: 0.25, rootMargin: '0px' });

    function attachMilestoneObservers() {
      var elements = document.querySelectorAll('[data-sq-milestone]');
      for (var i = 0; i < elements.length; i++) {
        if (!milestonesSeen[elements[i].getAttribute('data-sq-milestone')]) {
          observer.observe(elements[i]);
        }
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachMilestoneObservers);
    } else {
      attachMilestoneObservers();
    }
  }

  // ===== click heatmap (Premium) =====
  if (IS_PREMIUM) {
    document.addEventListener('click', function(e) {
      var docWidth = document.documentElement.scrollWidth || window.innerWidth || 1;
      var docHeight = Math.max(
        document.body.scrollHeight || 0,
        document.documentElement.scrollHeight || 0
      );
      var pageX = e.pageX || (e.clientX + (window.scrollX || 0));
      var pageY = e.pageY || (e.clientY + (window.scrollY || 0));
      var xPct = Math.round((pageX / docWidth) * 1000) / 10;
      var yPct = Math.round((pageY / docHeight) * 1000) / 10;
      var el = e.target;
      var interactive = el.closest && el.closest('a, button, [data-sq-track], input, textarea, select');
      send('click', {
        x_pct: xPct,
        y_pct: yPct,
        viewport_w: window.innerWidth,
        viewport_h: window.innerHeight,
        element: describeElement(interactive || el)
      });
    }, true);
  }

  // ===== engagement pings (Premium) =====
  if (IS_PREMIUM) {
    var lastActivity = Date.now();
    var activityHandler = function() { lastActivity = Date.now(); };
    ['scroll', 'click', 'keydown', 'mousemove', 'touchstart'].forEach(function(evt) {
      window.addEventListener(evt, activityHandler, { passive: true });
    });
    setInterval(function() {
      var idle = (Date.now() - lastActivity) > 15000;
      if (!idle && !document.hidden) {
        send('engagement_ping', { active: true });
      }
    }, 15000);
  }

  // ===== page exit (visibilitychange + pagehide + beforeunload, single-fire guarded) =====
  var pageLoadedAt = Date.now();
  var exitSent = false;
  function sendExit() {
    if (exitSent) return;
    exitSent = true;
    var secondsOnPage = Math.round((Date.now() - pageLoadedAt) / 1000);
    sendOnExit('page_exit', {
      seconds_on_page: secondsOnPage,
      last_scroll_milestone: highestMilestone,
      exit_page_path: window.location.pathname
    });
  }
  window.addEventListener('pagehide', sendExit);
  window.addEventListener('beforeunload', sendExit);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      sendExit();
    }
  });
})();`;

Deno.serve(function(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  return new Response(TRACKER_JS, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=14400, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
