# Prospects Feature — Build Plan

## ⚠️ Constraints to confirm before I start

Three "already working" systems you reference need clarification — what's actually in the codebase doesn't fully match:

1. **Stripe** — there is **no Stripe integration in the project today**. No `stripe` edge functions, no checkout flow, no payment links. Client subscriptions today appear to be tracked manually (`stripe_customer_id` column exists but nothing writes to it). For "Convert to Client → send payment link / charge card," I'll need to either (a) enable Lovable's built-in Stripe payments now as part of this build, or (b) ship v1 with **Manual Paid only** and stub the Stripe options as "coming soon." Which do you want?
2. **Call scheduling** — there's a `BookCall` page that links to your Calendly URL (stored in app settings). The banner's "Schedule a 10-min call" will deep-link to that same Calendly. There's no native booking system, so "auto-flip status to Call Booked on booking" can't happen automatically without a Calendly webhook — I'll add a manual "Mark call booked" action and we can wire the webhook later. OK?
3. **Welcome email** — `resend-welcome-email` exists and will be reused for the converted-client email.

Everything else (site generation pipeline, change_requests, notifications, client model, intake snapshot) is in place and will be reused as you described.

## Data model changes

Extend `clients` (no new table — prospect is just a lifecycle stage):

- `lifecycle_stage` text (enum): `prospect | pitched | viewed_demo | call_booked | replied | cold | converted | active_client`. Default `active_client` for existing rows so nothing breaks; new prospect inserts get `prospect`.
- `outreach_channel` text
- `date_last_contacted` timestamptz
- `next_followup_date` date
- `demo_url` text (mirrors `sites.staging_url` for fast list queries)
- `demo_view_count` int default 0
- `demo_last_viewed_at` timestamptz
- `conversion_source` text (`self_serve_banner | operator_manual | applied`)
- `payment_method_at_conversion` text (`stripe_subscription | manual_paid | charge_now`)
- `pending_payment_expires_at` timestamptz (for 7-day manual-paid expiry)
- `prospect_category` text, `prospect_city` text, `prospect_services` text, `prospect_notes` text, `prospect_existing_url` text (intake-light fields used until full intake is done)

New table `prospect_contact_log`:
- `id`, `client_id` (fk), `created_at`, `created_by`, `channel`, `note`, `next_followup_date`

RLS: Owner + Partner full access; clients see nothing of this table.

Index on `clients(lifecycle_stage, next_followup_date)` for the list view.

## Sidebar + routes

`OperatorSidebar`: insert **Prospects** (Target icon) between Dashboard and Applications, gated to Owner + Partner. Badge = count where `next_followup_date <= today` AND stage in active prospect stages.

New routes under `/operator/prospects`:
- `/operator/prospects` — list view
- `/operator/prospects/:id` — detail page

## List view (`OperatorProspects.tsx`)

Dense table (shadcn `Table`), default sort `next_followup_date asc nulls last` with overdue highlighted red.

Columns exactly as specced (business / category / city / status pill / added / last contacted / channel / follow-up / demo URL with copy / demo views with heat color / quick actions).

Filter bar: status multi-select, category, city, follow-up bucket (Today / Week / Overdue / All).

Row selection → bulk bar with: bulk status update, bulk follow-up date, CSV export (client-side blob download).

`+ Add Prospect` button top-right opens modal.

## Add Prospect modal

Form fields per spec. On submit:
1. Insert `clients` row with `lifecycle_stage='prospect'`, the prospect-light intake fields, no `user_id`.
2. Insert minimal `sites` row + `intake_data` snapshot derived from the form (category → template, brand color, services, city).
3. Invoke `generate-website` edge function.
4. Toast + return to list with new row highlighted; demo URL column shows spinner until `sites.generation_status = ready`, then renders link (polled via React Query).

## Detail page (`ProspectDetail.tsx`)

Sections: header (name + status pill + actions), editable intake card, demo card (preview iframe thumbnail + Preview button + copy URL + view stats), contact log timeline, notes, danger-zone (Regenerate, Convert).

Buttons: Status changer (Select), Log Contact (modal), Regenerate Site (calls `generate-website`), Convert to Client (modal).

## Log Contact modal

3 fields (channel / note / next follow-up, default = today + 3d). On submit:
- Insert `prospect_contact_log` row
- Update `clients.date_last_contacted`, `next_followup_date`, `outreach_channel`
- If stage = `prospect`, auto-advance to `pitched`

## Convert to Client modal

Fields per spec. On submit (single edge function `convert-prospect-to-client`):
- Set `lifecycle_stage='converted'`, `conversion_source='operator_manual'`, `payment_method_at_conversion=<choice>`, `plan=<choice>`, `domain_name`, `subscription_status='pending_payment'` (or `active` if manual paid + confirmed).
- If `notes_from_conversation` present → insert `change_requests` row (status `pending`, `is_pre_launch=true`).
- Payment branching:
  - `stripe_subscription` → **needs Stripe decision above.** If enabled, create Stripe payment link via new edge function and return URL for operator to copy. If not enabled in v1, this radio option is hidden.
  - `charge_now` → same dependency on Stripe.
  - `manual_paid` → set `pending_payment_expires_at = now()+7d`; daily-checks function will flip back / notify on expiry.
- Banner removal is automatic (banner only renders when stage is in prospect set).
- Send welcome email via existing `resend-welcome-email`.

## Demo banner

Banner is injected by the **generation pipeline**, not added to live sites. In `generate-website/index.ts` (and any post-processing step), when the client's `lifecycle_stage` is in the prospect set at generation time, prepend a fixed-position banner template to each generated HTML page:

```html
<div id="sq-prospect-banner">
  Sample preview built for <b>{{business_name}}</b> by SiteQueen
  <a class="primary" href="{{claim_url}}">Claim this site — $39/month →</a>
  <a class="secondary" href="{{call_url}}">Have questions? Schedule a 10-minute call →</a>
</div>
<script src="{{tracker_url}}" async></script>
```

- `claim_url` → `https://sitequeen.ai/claim/{prospect_id}` (new public page that pre-fills payment with Beta plan; on success calls edge fn that flips stage to `converted`, source `self_serve_banner`).
- `call_url` → existing Calendly URL with prospect info as query params.
- Tracker script pings new public edge fn `track-prospect-view` → increments `demo_view_count`, sets `demo_last_viewed_at`, fires notifications at first view and ≥3 views.

When prospect converts, banner persists in already-deployed HTML until next regeneration. Convert flow will auto-trigger a silent regenerate to strip the banner. (Acceptable trade-off — alternative is JS-based banner that checks status live, which I can do instead if you prefer; let me know.)

## Dashboard metric card

Add "Active Prospects" card to top row of `OperatorDashboard`: count of clients in active prospect stages, subtitle `X pitched this week` (count where stage moved to `pitched` in last 7d — derived from `date_last_contacted`).

## Notifications (reuses existing `notifications` table)

New `type` values, all `target_role='operator'`:
- `prospect_demo_first_view`
- `prospect_demo_hot` (≥3 views)
- `prospect_call_booked` (manual for now; webhook later)
- `prospect_claim_abandoned` (1h after claim click w/o conversion — handled in `daily-checks`)
- `prospect_self_serve_converted`

## Edge functions (new)

- `convert-prospect-to-client` — handles operator-initiated conversion, atomic
- `track-prospect-view` — public (no JWT), increments view counter + fires notifications
- `claim-prospect-site` — handles self-serve banner claim → payment → conversion (depends on Stripe decision)

Existing `daily-checks` extended to: expire `manual_paid` after 7d, fire claim-abandoned notifications.

## Out of scope (per your spec)

Google Maps scrape, automated outreach sequences, A/B demos, funnel analytics charts, prospect-facing portal.

## Open questions before I build

1. **Stripe** — enable Lovable Payments now, or ship v1 with Manual Paid only?
2. **Banner removal on convert** — auto-regenerate (small delay, clean) or live JS check (instant, slightly hacky)?
3. **Call Booked auto-flip** — OK with manual mark for v1 (Calendly webhook later), or block on webhook setup?

Once you answer those I'll start. Roughly 1 migration + ~12 new files + edits to sidebar, dashboard, generate-website, daily-checks.
