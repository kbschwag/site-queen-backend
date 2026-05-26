# Operator Chat — Build Plan

## Goal
Replace the structured change-request system as the primary operator workflow with a streaming Claude chat panel on each client/prospect detail page. Claude uses low-level tools (read/write files, intake, push to staging, snapshots) to fulfill operator requests. Existing change-request code is renamed to `_deprecated_*` but kept.

## Database (1 migration)
New tables:
- `operator_chats` — one row per (target, operator). XOR constraint between `client_id` and `prospect_id`. Note: there is no `prospects` table in this project — prospects ARE rows in `clients` (with `lifecycle_stage != 'active_client'`). I will use a single `client_id` column (no prospect_id) and drop the XOR. Confirmed by inspecting the schema.
- `operator_chat_messages` — JSONB content blocks (text / tool_use / tool_result), `tool_name`, `tool_input`, `tool_result`, `requires_confirmation`, `confirmed_at`, `cancelled_at`.

RLS: operators only (admin role OR profiles.role='partner').

## Edge functions

### `operator-chat` (new, streaming SSE)
- Auth: operator only.
- Loads/creates chat for `(client_id, operator_id)`.
- Persists user message.
- Builds system prompt with auto-loaded context (business name, template, staging URL, compact intake summary, deployed filenames, recent edits).
- Streams Claude (`claude-sonnet-4-5-20250929` via Anthropic API, key already in secrets as `ANTHROPIC_API_KEY`).
- Tool loop (max 10 iterations): execute non-destructive tools immediately; for destructive tools, persist a `requires_confirmation` row, emit `tool_use_requires_confirmation`, and poll DB until `confirmed_at`/`cancelled_at` is set (timeout ~5 min).
- Emits SSE events: `chat_created`, `text_delta`, `tool_use_started`, `tool_use_requires_confirmation`, `tool_result`, `done`, `error`.

### `operator-chat-confirm` (new)
- Sets `confirmed_at` or `cancelled_at` on a pending tool-call message.

### Tools (13)
Read-only: `read_deployed_file`, `read_template_file`, `read_intake_field`, `read_full_intake`, `list_uploaded_media`, `view_image`, `list_snapshots`, `take_screenshot`.
Destructive (require confirm): `write_deployed_file`, `update_intake_field`, `push_to_staging`, `snapshot_current_state`, `restore_from_snapshot`.

Handlers reuse existing infra:
- File storage: `generated-sites` bucket at `{client_id}/deploy/{filename}` (current convention) and `{client_id}/versions/{snapshot}/` for snapshots.
- Staging push: existing `uploadFileToHostingerFtp` from `_shared/hostinger-ftp.ts` with `injectNoindex` (lifted from `push-to-staging`).
- Intake: `clients` table fields + `intake_data` jsonb if present.
- Screenshots: reuse `capture-page-screenshots` function.
- `view_image`: returns base64; Claude can view in next turn via image content block.

System prompt is intentionally short (per spec) — orient Claude, don't boss it.

## Frontend

### New component: `src/components/operator/OperatorChatPanel.tsx`
- Loads existing messages on mount via supabase.
- Streaming via `fetch` with ReadableStream reader (SSE parsing); EventSource doesn't support auth headers.
- Renders text deltas, tool status rows ("Reading index.html…" → ✓), and confirmation cards (Approve / Show details / Cancel).
- Confirmation calls `operator-chat-confirm`; the in-flight stream resumes on next poll tick.
- File attachments → upload to `client-uploads/{client_id}/chat/` → include URL in next request.
- Input: textarea + send button + paperclip.

### Wire into pages
- `src/pages/operator/ProspectDetail.tsx` — replace the "Request Changes" card body (`InlineRevisionPanel`) with `<OperatorChatPanel clientId={c.id} />`. Keep `MyTickets` history below.
- `src/pages/operator/OperatorClients.tsx` flow / client detail — add the same panel where `InlineRevisionPanel` currently lives.

## Deprecation
Rename (only directory rename / no logic changes):
- `supabase/functions/change-request-preview` → `_deprecated_change-request-preview`
- `supabase/functions/change-request-apply` → `_deprecated_change-request-apply`
- `supabase/functions/change-request-cancel` → `_deprecated_change-request-cancel`
- `_shared/change-request-shared.ts` and `_shared/extract-current-value.ts` left in place (still imported by deprecated functions).
- `InlineRevisionPanel.tsx` left in repo, no longer imported.

Update `supabase/config.toml`: remove old `change-request-*` blocks, add `[functions.operator-chat]` and `[functions.operator-chat-confirm]` (both `verify_jwt = true`).

## Verification
After deploy: smoke-test C1 (initial greeting), C2 (address update with confirmation), C8 (cancel). Other scenarios (C3–C10) documented for the operator to walk through.

## Out of scope (explicit)
- Realtime/LISTEN-NOTIFY for confirmation — using DB polling per spec ("Either works").
- Cost monitor / soft alerts (mentioned as future).
- Prompt caching headers (can add later).
- Migrating existing change_requests history.

## Files touched (summary)
**New:** migration, `operator-chat/index.ts`, `operator-chat-confirm/index.ts`, `OperatorChatPanel.tsx`.
**Edited:** `ProspectDetail.tsx`, client detail page, `config.toml`.
**Renamed:** 3 edge-function directories.
