# Analytics Infrastructure Upgrade — Build Plan

Scope: add cookieless visitor + session tracking on top of the existing `analytics_events` / `analytics_daily_summary` / `track-event` stack. Prospect tracking (`track-prospect-view`, `clients.demo_view_count`) is explicitly out of scope and untouched.

---

## A. Schema changes

### A1. New table — `analytics_visitors`

```sql
CREATE TABLE public.analytics_visitors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  visitor_hash    text NOT NULL,            -- sha256(client_id|ip|ua|daily_salt)
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  total_sessions  integer NOT NULL DEFAULT 1,
  first_source    text,                     -- e.g. "google / organic", "(direct)"
  country         text,
  region          text,
  city            text,
  device_type     text,                     -- mobile | tablet | desktop
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, visitor_hash)
);

CREATE INDEX idx_visitors_client_lastseen
  ON public.analytics_visitors (client_id, last_seen_at DESC);
CREATE INDEX idx_visitors_hash_lookup
  ON public.analytics_visitors (client_id, visitor_hash);
```

RLS:
```sql
ALTER TABLE public.analytics_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read own visitors"
  ON public.analytics_visitors FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients c
                 WHERE c.id = analytics_visitors.client_id AND c.user_id = auth.uid()));

CREATE POLICY "Admins read all visitors"
  ON public.analytics_visitors FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners read all visitors"
  ON public.analytics_visitors FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p
                 WHERE p.user_id = auth.uid() AND p.role = 'partner'));
```
No INSERT/UPDATE/DELETE policies — writes happen via service-role inside `track-event`.

### A2. New table — `analytics_sessions`

```sql
CREATE TABLE public.analytics_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  visitor_id       uuid NOT NULL REFERENCES public.analytics_visitors(id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  page_count       integer NOT NULL DEFAULT 0,
  entry_page       text,
  exit_page        text,
  source           text,                  -- google, facebook, direct, ...
  medium           text,                  -- organic, cpc, referral, ...
  referrer         text,
  utm_campaign     text,
  utm_source       text,
  utm_medium       text,
  device_type      text,
  browser          text,
  is_bounce        boolean NOT NULL DEFAULT true,   -- true while page_count <= 1
  converted        boolean NOT NULL DEFAULT false,  -- form_submission / phone_click / cta_click
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_visitor_ended
  ON public.analytics_sessions (visitor_id, ended_at DESC);
CREATE INDEX idx_sessions_client_started
  ON public.analytics_sessions (client_id, started_at DESC);
```

RLS: same three policies as visitors (client-own, admin-all, partner-all). SELECT only.

### A3. Additive changes to `analytics_events`

```sql
ALTER TABLE public.analytics_events
  ADD COLUMN visitor_id    uuid REFERENCES public.analytics_visitors(id) ON DELETE SET NULL,
  ADD COLUMN session_id_fk uuid REFERENCES public.analytics_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_events_visitor    ON public.analytics_events (visitor_id);
CREATE INDEX idx_events_session_fk ON public.analytics_events (session_id_fk);
CREATE INDEX idx_events_client_created
  ON public.analytics_events (client_id, created_at DESC);
```

Existing string `session_id`, `page_path`, `country`, etc. are untouched. No drops, no renames.

---

## B. Edge Function changes (`track-event`)

Modify in place; keep existing CORS, UUID check, event_type whitelist, rate limiting, sanitization, and `increment_analytics_summary` RPC call.

### B1. Visitor hashing (cookieless, daily-rotating salt)

```ts
// daily salt rotates at UTC midnight, stable for 24h
const todayUTC = new Date().toISOString().slice(0, 10);          // "2026-05-21"
const dailySalt = await sha256(`${Deno.env.get("ANALYTICS_SALT_SECRET")}|${todayUTC}`);

const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "")
  .split(",")[0].trim();
const ua = req.headers.get("user-agent") || "";
const visitorHash = await sha256(`${event.client_id}|${ip}|${ua}|${dailySalt}`);
```

Properties:
- No cookie, no localStorage, GDPR-friendly.
- Same person across the day → same hash → same visitor row.
- Next UTC day → new hash → new visitor row (acceptable; matches Plausible/Fathom).
- Requires a new secret `ANALYTICS_SALT_SECRET` (one-time setup).

### B2. Visitor + session resolution (per event)

```
1. UPSERT analytics_visitors on (client_id, visitor_hash):
     - INSERT with first_seen_at=now, country/region/city/device_type, first_source
     - ON CONFLICT: update last_seen_at = now (do NOT overwrite first_*)

2. Find active session:
     SELECT id FROM analytics_sessions
     WHERE visitor_id = $1 AND ended_at > now() - interval '30 minutes'
     ORDER BY ended_at DESC LIMIT 1;

3a. If found → reuse: increment page_count (only on page_view),
     set exit_page = current page_path,
     update ended_at = now,
     duration_seconds = ended_at - started_at,
     is_bounce = (page_count <= 1),
     converted = converted OR event_type IN ('form_submission','phone_click','cta_click').

3b. If not found → create new session with entry_page, referrer, utm_*,
     source/medium parsed from referrer + utm, device_type, browser.
     Also bump analytics_visitors.total_sessions += 1.

4. INSERT analytics_events with visitor_id + session_id_fk populated
   (string session_id continues to be written for backward compatibility).

5. Existing RPC increment_analytics_summary unchanged.
```

All five steps share one service-role client; total added latency budget ~30–60 ms.

### B3. Country / geo population

Read from edge CDN / Supabase request headers (in priority order):
- `cf-ipcountry`, `x-vercel-ip-country` → country
- `cf-ipcity` / `x-vercel-ip-city` → city
- `cf-region` / `x-vercel-ip-country-region` → region

Fallback: if none present, leave null (no third-party IP lookup yet — keeps function dependency-free and fast). Country is written to both `analytics_events.country` and `analytics_visitors.country` on first insert.

### B4. Source / medium / UTM parsing

Helper inline in the function. Parses `referrer` host against a small known-engine map (google/bing/duckduckgo → organic; facebook/instagram/linkedin/twitter → social; else referral) and reads `utm_*` from a `metadata.url` field that the JS tracker will start sending (additive — old tracker still works, just no UTMs).

---

## C. Migration approach

- **Existing 681 events**: leave as legacy. No backfill of `visitor_id` / `session_id_fk` — we don't have raw IP/UA on historical rows, so a backfill would be guesswork. Dashboard queries that need visitor/session granularity will simply filter `visitor_id IS NOT NULL`. Aggregate counts (page_views, etc.) keep working from `analytics_daily_summary` unchanged.
- **Ingest pause**: not needed. ALTERs are additive and non-blocking on a 681-row table. Function will be redeployed atomically. Worst case: a handful of events during the deploy window land with the old code (no visitor_id) — those just become "legacy" rows too.
- **Rollback**: if the new function misbehaves we redeploy the previous version; the new columns sit empty and harm nothing.

---

## D. Order of operations (phased, each phase verifiable)

**Phase 1 — Schema only**
1. Migration creating `analytics_visitors` + `analytics_sessions` + indexes + RLS.
2. Migration ALTERing `analytics_events` (add two FK cols + indexes).
Verify: tables visible in DB, RLS on, indexes present, existing app still works (no code touched yet).

**Phase 2 — Secret + ingest rewrite**
3. Add secret `ANALYTICS_SALT_SECRET` (random 32-byte hex).
4. Rewrite `track-event` per Section B. Deploy.
Verify: hit `/track-event` from one live client site (or curl), confirm one new row in `analytics_visitors`, one in `analytics_sessions`, event row with both FKs populated, country populated, summary RPC still incremented.

**Phase 3 — Tracker UTM upgrade (optional, additive)**
5. Update the JS snippet embedded in deployed sites to send `metadata.url` (current page URL with query string) so UTMs are captured.
Verify: a test page hit with `?utm_source=test&utm_campaign=foo` shows up correctly on the session row.

**Phase 4 — Dashboard reads (separate prompt)**
Out of scope for this build; queue for next round.

**Phase 5 — `form_submissions` reconciliation (recommendation, not built)**
See Section E.

---

## E. Risks, decisions to weigh, recommendations

### Decisions I need from you

1. **Daily salt rotation window.** UTC midnight is industry standard but means a visitor browsing across midnight counts as 2 visitors. Alternative: per-client local-tz midnight (more complex, marginal benefit). **Recommend: UTC.**
2. **`ANALYTICS_SALT_SECRET`**: I'll generate and add it via the secrets tool in Phase 2 unless you want to provide one.
3. **`form_submissions` vs `analytics_events.form_submission` (Section 5 of your spec).** Recommendation: **keep `form_submissions` as the source of truth for actual lead data** (name/email/phone/message) and stop double-writing a `form_submission` event row. Instead, the `handle-contact-form` function should call `increment_analytics_summary(..., 'form_submission')` directly so the daily counter still moves, and the session's `converted=true` flag gets set via a lightweight ping to `track-event` with `event_type='form_submission'` and no PII. Net effect: one row of truth per lead, no duplication, dashboards still accurate. **Confirm before I implement in a later phase.**
4. **Geo source.** Hostinger-hosted client sites usually don't pass `cf-ipcountry` unless Cloudflare is fronted. If the headers are missing in practice we'll want to add a lightweight IP→country lookup (ipapi.co free tier, or a static MaxMind GeoLite DB). I'll measure in Phase 2 and report back before adding a dependency.

### Assumptions

- The JS tracker on deployed client sites already POSTs to `track-event` with `client_id`, `event_type`, `page_path`, `referrer`, `user_agent`, `session_id`, `metadata`. (Confirmed in `track-event/index.ts`.)
- `clients.id` is the only client identifier sent — no spoofing protection beyond the existing UUID-format check. Acceptable for analytics (worst case: noisy data on one client).
- We are OK that prospect demo traffic, which goes through `track-prospect-view` (separate function), will **not** appear in `analytics_visitors` / `analytics_sessions`. Hard rule per your spec.

### Things that could go wrong

- **Hash collisions across CG-NAT / corporate proxies**: many people behind one IP+UA become one "visitor". Mitigation: accept it (same limitation as Plausible/Fathom); UA usually differs enough.
- **Bot traffic** will inflate visitor counts. Phase 2 will add a simple UA-based bot filter (skip writing visitor/session for known bot UAs) but still log the event.
- **Race condition on visitor upsert**: two simultaneous events for the same new visitor could both try to INSERT. The unique constraint `(client_id, visitor_hash)` + `ON CONFLICT DO UPDATE` handles this safely.
- **Session row updates on every event** add write load. With 14 clients / 681 events to date, not a concern; if/when traffic grows 100x we can move session updates to a periodic flush.

---

Stopping here. Awaiting your approval before Phase 1.
