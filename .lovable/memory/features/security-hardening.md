---
name: Security Hardening
description: Rate limiting, input sanitization, JWT auth on edge functions, audit logging, operator protection
type: feature
---

## Rate Limiting
- `rate_limits` table tracks per-IP request counts with TTL
- Application form: 3/hr per IP (client-side + planned server-side)
- Login: 5 attempts per 15 min (client-side localStorage)
- Contact form (track-event): 3/hr per IP + client_id (server-side)
- Expired rate limit records cleaned daily by daily-checks

## Input Sanitization
- `src/lib/sanitize.ts` exports `sanitizeInput()` and `sanitizeObject()`
- Strips HTML tags, script tags, javascript: protocol, on* handlers
- Applied to all application form fields before insert
- Applied to track-event inputs server-side

## Edge Function Auth
- All edge functions except track-event require Bearer JWT
- deploy-to-hostinger: requires admin role
- generate-website, process-change-request, generate-intake-content: require valid auth
- track-event: public but validates client_id format (UUID), checks client exists, rate-limits form submissions
- score-lead and convert-to-client already had auth checks

## Operator Portal Protection
- OperatorProtectedRoute verifies role is owner/partner/team_member
- Logs all access and unauthorized attempts to audit_log
- Security settings page shows login activity, session management, API status

## Environment Variables
- Audit confirmed: no secrets in client-side code
- Only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in browser (safe)

## reCAPTCHA
- `recaptcha_score` and `bot_risk` columns added to applications table
- Implementation requires RECAPTCHA_SECRET_KEY secret (not yet configured)

## Manual Items (Cloudflare)
- Security headers must be configured in Cloudflare Transform Rules
- X-Frame-Options: DENY, X-Content-Type-Options: nosniff, etc.
