# Option C — Hosted Tracker Migration

## Recommendation: proceed

No reason on this stack to prefer inline. Lovable Cloud's public Storage buckets serve static JS perfectly well, support `Cache-Control` via the `cacheControl` upload option, and are already CORS-open (`Access-Control-Allow-Origin: *`) by default. The `generated-sites` bucket is already public. One file, one URL, version-pinned — this is the right shape.

The only nuance worth knowing up front: Supabase Storage sets `Cache-Control: max-age=<n>` based on the `cacheControl` option at upload time. To change cache duration later you re-upload. That's fine — versioned filenames (`tracker-v2.js`) mean we never need to bust cache on an existing version anyway.

---

## Architecture

```text
Client site (Hostinger)              Lovable Cloud
┌────────────────────────┐           ┌────────────────────────────┐
│ <script async          │  ── GET ─▶│ Storage bucket: tracker     │
│   src=".../tracker-v2  │           │   /tracker-v2.js (public)   │
│   .js"                 │           │   Cache-Control: max-age=3600│
│   data-client-id="…"   │           └────────────────────────────┘
│   data-endpoint="…">   │
│ </script>              │  ── POST ─▶ track-event edge function
└────────────────────────┘
```

---

## 1. Loader snippet (baked into every new site)

Replaces lines 1054–1068 in `generate-website/index.ts` and lines 470–484 in `generate-website-part1/index.ts`:

```html
<script async
  src="https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/tracker/tracker-v2.js"
  data-client-id="${clientId}"
  data-endpoint="${supabaseUrl}/functions/v1/track-event"></script>
```

Four lines. No logic. Never needs to change again — version bumps happen by uploading `tracker-v3.js` and updating these two template strings (which only affects new generations; existing sites keep loading v2 forever and stay stable).

---

## 2. Hosted `tracker-v2.js`

Includes the Phase 3 UTM upgrade (`metadata.url`) from day one:

```js
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
        fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
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
```

Extras vs. current inline:
- `metadata.url = location.href` (UTM capture — server already parses this)
- `navigator.sendBeacon` fallback so events survive page unload
- `data-*` attribute config instead of template injection (no per-site regeneration)

---

## 3. Hosting

- **Bucket:** new public bucket `tracker` (separate from `generated-sites` so cache rules and retention are independent and a future tracker change can never collide with a site asset).
- **Path:** `tracker-v2.js` at bucket root.
- **Public URL:** `https://onrvqbygwzhmhgkctcrm.supabase.co/storage/v1/object/public/tracker/tracker-v2.js`
- **CORS:** Supabase Storage already returns `Access-Control-Allow-Origin: *` on public objects. No config needed.
- **Cache:** upload with `cacheControl: '3600'` → `Cache-Control: max-age=3600`. Updates within a version propagate in ≤1 hour. New versions are instant (different URL).
- **Versioning rule:** `tracker-v2.js` is **immutable** once 18 sites point at it. Bug fixes that change behavior get a new filename. Only safe in-place edits are no-behavior-change patches.

---

## 4. Migration script for the 18 existing sites

Same shape as Option B but the regex swaps the *entire inline `<script>` block* for the loader. One edge function, run once per site, serialized:

```text
For each client with site_status in ('staging','live'):
  1. List `<clientId>/*.html` in `generated-sites` bucket (source of truth for what's on Hostinger)
  2. For each HTML file:
     a. Download from generated-sites bucket
     b. Backup current copy → generated-sites/<clientId>/_pre-tracker-v2/<file>
     c. Regex-replace the inline analytics block (anchored on "var CLIENT_ID = '" + clientId + "'")
        with the new loader snippet (client_id + endpoint interpolated)
     d. If the regex matched exactly once → upload to Hostinger via existing FTP helper + re-upload to bucket
        If 0 or >1 matches → SKIP, log to `tracker_migration_log` table, continue
  3. Record per-file result (matched / skipped / failed) in `tracker_migration_log`
```

Why anchor on `CLIENT_ID = '<uuid>'`: guarantees we don't touch any other `<script>` block, and a hand-edited tracker won't match → safe skip.

Run as a one-shot edge function `migrate-to-hosted-tracker` (owner-only, no schedule). Dry-run mode first (logs matches without uploading), then live.

---

## 5. Rollback

Three independent layers:

| Failure | Rollback |
|---|---|
| `tracker-v2.js` has a bug in the wild | Upload fixed `tracker-v2.js` over itself (1-hour cache window) **or** publish `tracker-v3.js` + revert the two generator template strings to v2 (instant for future builds) |
| Migration corrupts a site's HTML | Per-file backup at `generated-sites/<clientId>/_pre-tracker-v2/<file>` → re-upload to Hostinger via existing FTP helper. Script also supports `--restore <clientId>` flag |
| Storage outage takes tracker offline | Sites still render — `<script async>` failure is silent. Only analytics stop. No customer-visible breakage. (This is an improvement over inline: bad inline JS could break a page; missing external JS cannot.) |

---

## 6. Phasing

1. Create `tracker` bucket (migration) + public-read policy
2. Upload `tracker-v2.js` with `cacheControl: 3600`
3. Verify cross-origin load from one staging site manually (curl + browser test)
4. Update both generator files to emit the loader snippet
5. Build `migrate-to-hosted-tracker` edge function; dry-run against all 18
6. Review dry-run log → run live, serialized
7. Spot-check 3 sites: network tab shows `tracker-v2.js` 200 + `track-event` POST with `metadata.url`
8. Verify Phase 2 dashboards still increment correctly

Nothing in this plan touches `track-event`, `analytics_*` tables, or the legacy 681 events.

---

## What I need from you

- Approve the plan, or flag changes
- Confirm cache duration (proposed: 1 hour) and bucket name (proposed: `tracker`)
- Confirm migration runs serialized (safer, ~2–3 min total) vs. parallelized (faster, FTP rate-limit risk on Hostinger)
