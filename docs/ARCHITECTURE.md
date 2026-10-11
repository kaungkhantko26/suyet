# Architecture, decisions & implementation checklist

## Layout
```
prisma/            schema, migrations (incl. full-text trigger + CHECK constraints), reference data, seed
src/app/           routes (public, auth, dashboard, organizer, admin, api), server actions in app/actions
src/lib/           business logic, no UI: services/ (auth, events workflow, notifications, candidates), events/ (filters, queries,
                   duplicates, view helpers, JSON-LD), validation/ (Zod), auth/ (session, guards), dates, event-status, url, ssrf, storage, jobs, worker/
src/components/    ui/ primitives · layout/ · events/ · forms/ · admin/ · organizer/
src/i18n/          en.ts (source of truth, typed) · my.ts (must satisfy the same type) · server/client helpers
scripts/           worker, local Postgres, backup/restore
tests/             unit · integration (real PostgreSQL) · e2e (Playwright)
```

## Key decisions
* **On-site registration.** Events choose `EXTERNAL` (link, validated and redirected) or `ON_PLATFORM`. On-platform events get a `RegistrationForm` with typed fields; answers are validated on the server against the saved form, stored with a snapshot of each question, one registration per user (advisory lock serialises capacity), login + verified email required, explicit consent naming the organizer, withdrawal, organizer-only responses and CSV (formula-injection safe, exports logged), sensitive-question denylist, erased with the account.
* **Sessions instead of Auth.js.** Auth.js's Credentials provider can't use database sessions (JWT only) and v5 is still beta. We implement the same guarantees directly: Argon2id password hashes, random 256-bit session tokens stored **hashed** in `Session`, HTTP-only `SameSite=Lax` (+`Secure` in production) cookie, email verification and reset tokens (hashed, single-use, expiring), per-IP and per-account login rate limits, sign-out-everywhere on password reset, immediate lock-out when suspended. The `Account` table exists for adding OAuth providers later.
* **Time.** All timestamps are UTC in PostgreSQL; display and form input use Myanmar Time (fixed +06:30, no DST). Calendar days are Myanmar days.
* **Status is computed, not stored** (`lib/event-status.ts`) so it can't go stale; stored state is only overrides (`cancelled`, `registrationClosedOverride`), `publishState`, and verification.
* **Search.** PostgreSQL `tsvector` (trigger-maintained, GIN index) + `ILIKE` fallback. The `simple` configuration doesn't segment Burmese, so Burmese search relies on substring matching.
* **Background work** is a PostgreSQL job table (`FOR UPDATE SKIP LOCKED`, retry with backoff, dedupe keys). Page requests never send email. Recurring jobs: reminder scan (15 min), source checks (6 h), cleanup (daily).
* **Notifications** are de-duplicated by a unique `dedupeKey` (type + event + user + window) and respect preferences, per-channel delivery rows record status.
* **Server actions** re-check role on every call; services re-check ownership (`assertCanManage`) independently of the UI.

## Security model (what is actually implemented)
Server-side authorization everywhere · Zod validation on all inputs · React output escaping (no `dangerouslySetInnerHTML` except JSON-LD with `<` escaped) · rate limits (login, register, reset, newsletter, contact, report, internal API) · CSRF: Next.js Server Actions enforce same-origin, cookies are `SameSite=Lax`, the only state-changing route handlers are token-authenticated · security headers (HSTS, nosniff, frame deny, referrer, permissions policy) · open-redirect protection (`safeRedirectPath`) · registration redirect takes its destination from the database only, re-validated as http(s) and never for closed/cancelled events · uploads: size cap, **content-sniffed** type (PNG/JPEG/WebP), random names, served with `nosniff` and a sandbox CSP · SSRF: `safeFetch` blocks non-http(s), credentials in URLs, localhost/`.internal`/`.local`, private, link-local and cloud-metadata addresses, validates every redirect hop, timeouts, size caps · n8n endpoint: constant-time secret/HMAC check with replay window, rate limit, idempotency, 100 KB cap · audit log for admin actions · secrets only via environment.

## Implementation status (honest)
| Area | Status |
|---|---|
| Design system, responsive layout, dark mode, EN/MY | ✅ |
| Homepage (11 brand-spec sections), explorer with URL filters/sort/pagination/mobile drawer, event details, hackathons, categories, locations, organizers | ✅ |
| Calendar (month/week/list, deadlines separate, category filter, ICS export, MMT) | ✅ |
| Auth (student + separate organizer sign-up, verify, reset, sessions, limits) | ✅ |
| Student dashboard, saved events, preferences, profile (hideable optional fields), notifications | ✅ |
| Organizer area (profile, events, submission/review state, overrides), event form (RHF + Zod) | ✅ |
| Admin: overview, events, submissions (approve/reject/changes), organizers + applications, users/roles, categories (add/edit/reorder/deactivate), reports, sources, automation/candidates, analytics, settings, audit log | ✅ |
| Verification workflow with evidence, re-review on material change, source-unreachable flagging | ✅ |
| n8n endpoint, duplicate detection, candidate review → draft | ✅ |
| Notification infrastructure (email + in-app, dedupe, unsubscribe) | ✅ (Telegram / Web Push: not implemented; schema has the channel enums) |
| SEO: metadata, canonical, OG/Twitter, JSON-LD, sitemap, robots, noindex on filtered URLs | ✅ |
| PWA: manifest, icons, service worker (public assets only, offline page) | ✅ |
| Docker, Compose, Nginx, backup/restore scripts, docs | ⚠️ written and syntax-checked, **not executed** (no Docker on the build machine) |
| Security hardening (RBAC, MFA, CSP, SSRF, replay-proof webhooks, URL risk, DB roles, append-only audit, alerts) | ✅ see SECURITY_CHECKLIST.md for per-control status |
| On-site registration forms | ✅ |
| Tests: 175 unit, 144 integration (real PostgreSQL), 35 Playwright (desktop + mobile) | ✅ passing at time of writing |

## Known gaps / follow-ups
1. **Docker stack untested** end to end; run `docker compose up -d --build` on the VPS and follow the checklist in DEPLOYMENT.md.
2. **Burmese review**: UI strings were written by an AI assistant and need a native-speaker review. Long-form legal copy (Privacy, Terms) and the About body are English drafts (marked “draft for review”); user-submitted event text is shown as entered (not machine translated).
3. **Brand assets**: the "LT" mark is a geometric SVG recreation of the parent logo; swap in the official SVG. Footer/legal entity details and the Let's Tech Club URL (`CLUB_URL`) must be confirmed by the brand owner. Attribution wording ("An initiative of Let's Tech") is a placeholder pending approval.
4. **Auth.js** not used (see decisions). TOTP MFA exists for staff; WebAuthn/passkeys are PENDING.
5. CSP uses `style-src-attr 'unsafe-inline'` (attribute-only exception, documented in SECURITY_CHECKLIST.md).
6. **Accessibility**: built to WCAG 2.2 AA practices (semantic HTML, focus states, labelled controls, native dialogs, reduced motion, 44 px targets verified by tests) but no automated axe audit or screen-reader pass has been run.
7. **Analytics** count raw page views (bots included) and have no retention policy yet.
8. **Admin "create event"** reuses the organizer form (an admin can pick any organizer); there's no bulk import UI beyond the n8n endpoint.
9. SMTP and S3 paths are implemented but were not exercised against real providers; in development emails are logged to the console.
10. The `x-forwarded-for` header is trusted for rate limiting: only expose the app through the provided Nginx.
11. Redis is provided as an optional compose profile but the app does not need or use it today.
