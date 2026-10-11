# Security checklist (with evidence)

**Status legend**
* `IMPLEMENTED`: code/config exists, but no automated test proves it.
* `TESTED`: implemented **and** covered by an automated test that was run and passed (test file named).
* `PENDING`: not done, or done but never executed in a real environment; the gap is stated.
* `NOT_APPLICABLE`: the feature does not exist in this product.

Results at the time of writing (local machine, real PostgreSQL 16 via embedded binaries): **175 unit + 144 integration = 319 Vitest tests passing**
(66 of them in `tests/integration/security/` and `tests/unit/security/`), **35 Playwright tests passing** (production build, CSP enforced), `tsc` clean,
ESLint 0 errors. **Not run anywhere:** Docker/Compose stack, Nginx, GitHub Actions, Trivy, Semgrep, gitleaks, real SMTP/S3/Web Risk/HIBP calls.

| § | Control | Status | Evidence / gap |
|---|---|---|---|
| 1 | PostgreSQL never exposed (private network, no published port) | TESTED (static) | `tests/unit/security/infra.test.ts`. **PENDING:** port scan of a real deployment |
| 1 | No unauthenticated admin/automation endpoints | TESTED | `automation-verification.test.ts` (401 without valid HMAC), e2e `permissions.spec.ts` |
| 1 | Least privilege throughout | TESTED | permission matrix + db-roles tests |
| 2 | Roles STUDENT/ORGANIZER/MODERATOR/ADMIN/SUPER_ADMIN | TESTED | `tests/unit/security/primitives.test.ts` (RBAC matrix), `authz-mfa.test.ts` |
| 2 | Server-side authorization, deny by default, role never from the client | TESTED | `actions.test.ts`, `authz-mfa.test.ts`, e2e permissions |
| 2 | Users cannot change own role; organizers cannot touch other orgs' events | TESTED | `authz-mfa.test.ts`, `events-workflow.test.ts` |
| 2 | Moderator: review submissions/reports; cannot publish, manage users/organizers, flip switches | TESTED | `authz-mfa.test.ts`, e2e moderator scope |
| 2 | ADMIN "manage verification policies"; SUPER_ADMIN "configure security settings" | PENDING | Permissions exist (`security.config`, `admins.manage`) but there is no UI to edit policies; configuration is by environment variables |
| 3 | **Auth.js** | NOT_APPLICABLE (deviation) | Custom session auth instead (Auth.js Credentials can't use DB sessions; v5 beta). Same guarantees tested below |
| 3 | Registration, email verification, login, logout, reset, suspension, revocation | TESTED | `auth.test.ts`, `actions.test.ts` |
| 3 | Argon2id with per-hash salt; legacy scrypt upgraded on login | TESTED | `primitives.test.ts`, `auth.test.ts` |
| 3 | Long passphrases, no composition rules/rotation | TESTED | `auth.test.ts` (256-char limit only bounds hashing cost) |
| 3 | Breached-password screening | TESTED (logic) | Unit tests with a fake HIBP service. **PENDING:** live HIBP call; it fails *open* (logged) if the service is down |
| 3 | MFA required for MODERATOR/ADMIN/SUPER_ADMIN | TESTED | `authz-mfa.test.ts`, e2e (login helper completes TOTP; admin blocked without it) |
| 3 | TOTP (RFC 6238 vectors), replay-proof, encrypted secrets, hashed recovery codes | TESTED | `primitives.test.ts`, `authz-mfa.test.ts` |
| 3 | **WebAuthn / passkeys** | PENDING | Not implemented (TOTP only) |
| 3 | Cookies HttpOnly/Secure/SameSite, bounded lifetimes, rotation on privilege change, sign-out-all, reset invalidates sessions | TESTED | e2e cookie test, `authz-mfa.test.ts` (idle 7 d / absolute 30 d), `auth.test.ts` |
| 3 | Rate limits: login (5 per account+IP /15 min, 20 per account, 30 per IP), register 5/h/IP, reset 3/h/account, MFA 5/5 min, no permanent lockout | TESTED | `auth.test.ts`, `authz-mfa.test.ts` |
| 3 | Email-verification resend limit (3/h) | IMPLEMENTED | `actions/auth.ts`; no dedicated test |
| 4 | Zod validation on inputs, request size limits | TESTED | `validation.test.ts`, internal API oversize tests; Server Actions body cap 6 MB (IMPLEMENTED) |
| 4 | Consistent errors with request ids; no stack traces/secrets; explicit DTOs (internal API) | TESTED | `automation-verification.test.ts`, e2e `x-request-id` header |
| 4 | Identity derived from the session, never from client ids | TESTED | `authz-mfa.test.ts` (saved events/registrations), registration action |
| 5 | Parameterised queries / SQL injection | TESTED | injection test (search + filters), no `$queryRawUnsafe` in `src/` |
| 5 | Separate runtime/migration/admin DB identities | TESTED | `db-roles.test.ts` (real PostgreSQL); compose wiring TESTED (static) |
| 5 | Encrypted DB transport | PENDING | DB is on a private docker network without TLS; add `sslmode=require` if the DB moves off-host |
| 5 | Backups encrypted, restricted, retained, restore tested | IMPLEMENTED / PENDING | `scripts/backup.sh` (age, refuses without recipient: statically tested). **PENDING:** a real backup and a restore drill have never been run |
| 6 | Schema validation, max lengths, normalisation | TESTED | unit + integration |
| 6 | No untrusted HTML rendering; rich text | TESTED / NOT_APPLICABLE | e2e XSS test; no rich-text feature exists (plain text only) |
| 7 | CSRF | IMPLEMENTED | Next.js Server Action same-origin check + `allowedOrigins` + SameSite=Lax; machine routes use signed/secret auth. **No independent cross-origin test** |
| 7 | CORS | TESTED | No CORS headers emitted anywhere (`infra.test.ts`, API test) |
| 8 | CSP (nonce, no unsafe-eval/inline for scripts, object-src none, base-uri self, frame-ancestors none…) | TESTED | `primitives.test.ts` (policy), e2e: enforced CSP, zero violations on key pages incl. Burmese switch |
| 8 | `style-src-attr 'unsafe-inline'` exception | IMPLEMENTED (documented) | Attribute-only; used for a few dynamic widths/colours. Removing it needs refactoring those styles |
| 8 | Report-only trial before enforcing | IMPLEMENTED | `CSP_MODE=report-only` + `/api/csp-report`. A staging trial has not been done |
| 8 | HSTS only on HTTPS deployments | TESTED (static) | `infra.test.ts` |
| 9 | Controlled verification workflow; automated score never grants status | TESTED | `automation-verification.test.ts` |
| 9 | State model | IMPLEMENTED (deviation) | Submission: DRAFT/PENDING_REVIEW/CHANGES_REQUESTED(≈NEEDS_INFORMATION)/APPROVED/REJECTED; publication: DRAFT/PUBLISHED/ARCHIVED; verification: UNVERIFIED/PENDING_VERIFICATION/VERIFIED/NEEDS_REVIEW(≈NEEDS_RECHECK). Approval publishes in one step; there is no separate "approved but unpublished" hold |
| 9 | Verification record (id, reviewer, source, method, notes, time, evidence, risk indicators) + audit trail | TESTED | `automation-verification.test.ts`; method is always `MANUAL_REVIEW` today |
| 10 | Organizer impersonation safeguards; evidence + method; revocable; admin-only | TESTED | `authz-mfa.test.ts` |
| 10 | Periodic organizer re-verification | PENDING | No scheduled recheck |
| 11 | HTTPS-by-default, blocked schemes/internal destinations, suspicious-domain indicators | TESTED | `primitives.test.ts`, `automation-verification.test.ts` |
| 11 | Threat intelligence (Google Web Risk) | IMPLEMENTED (provider contract TESTED) | Disabled until `GOOGLE_WEB_RISK_API_KEY` is set; "no threat detected" is never shown as "safe". **PENDING:** live API call |
| 11 | `rel="noopener noreferrer nofollow"`, no open redirects, destination from DB only | IMPLEMENTED / TESTED | e2e (redirect route), `safeRedirectPath` unit test |
| 12 | SSRF controls | TESTED | `ssrf.test.ts`, `automation-verification.test.ts` (an internal server receives **zero** requests) |
| 12 | Connection-time (anti-rebinding) validation | TESTED (unit) | Fake-resolver tests. **PENDING:** drill with a real rebinding DNS record |
| 12 | Network egress restriction; isolated fetch worker | PENDING | Worker has its own container/network; host firewall rules are documented, not applied |
| 13 | Upload size/type/content checks, re-encode, metadata stripped, random names, no SVG | TESTED | `primitives.test.ts`, `automation-verification.test.ts` |
| 13 | Separate origin for untrusted content | PENDING | Served same-origin with `nosniff` + sandbox CSP |
| 13 | Private documents, virus scanning | NOT_APPLICABLE | No document uploads exist |
| 14 | n8n: signed requests, timestamp, unique id, replay rejection, constant-time compare, rotation | TESTED | `automation-verification.test.ts` (+ mutation check: removing replay protection fails the suite) |
| 14 | n8n identity limited to creating candidates / reading status | TESTED | same file |
| 14 | mTLS between n8n and the app | PENDING | HMAC over TLS only |
| 15 | AI security | NOT_APPLICABLE | No AI features in the product. Rules for any future use: untrusted content, structured Zod-validated output, no admin tools, never publish/verify |
| 16 | Endpoint rate limits (login, register, reset, MFA, submissions 10/day/organizer, suggestions, report, search 60/min/IP, internal API) | TESTED / IMPLEMENTED | Search throttle is IMPLEMENTED without a dedicated test; others tested. Shared store = PostgreSQL |
| 16 | Bot challenge | PENDING | Add only if abuse appears |
| 17 | Structured security logs, append-only audit, no secrets logged | TESTED | `automation-verification.test.ts`, `auth.test.ts` (DB triggers block UPDATE/DELETE even for the owner) |
| 17 | Log retention/access policy | PENDING | Records are kept indefinitely today; retention job not written |
| 18 | Alerts: login spikes, webhook auth failures, admin creation, high-risk submissions; secure channel; no sensitive content | TESTED | `automation-verification.test.ts` (stubbed webhook) |
| 18 | Downtime / DB error / backup-failure alerts | PENDING | Needs an external uptime monitor and the `HEALTHCHECK_URL` dead-man's-switch |
| 19 | Ubuntu VPS hardening | PENDING | Procedure documented in DEPLOYMENT_SECURITY.md; **nothing applied** (no server access here) |
| 20 | Docker hardening (non-root, read-only, caps dropped, no-new-privileges, limits, isolated networks, pinned tags, no socket) | TESTED (static) | `infra.test.ts`; stack never started. Digest pinning and image scanning PENDING |
| 21 | Nginx/TLS config | TESTED (static) | `infra.test.ts`. **PENDING:** `nginx -t`, real certificate, SSL Labs/testssl run |
| 22 | Dependency / secret / SAST / container scanning pipeline | IMPLEMENTED | `.github/workflows/ci.yml`, Dependabot, CODEOWNERS: **never executed**. `npm audit`: 1 accepted advisory (`audit-ci.jsonc`, expires 2026-12-31) |
| 23 | Data minimisation, private-by-default profiles, no public emails | IMPLEMENTED | Profiles are never public; registration shares only chosen answers + name/email with consent |
| 23 | Data export, account deletion (registrations erased) | TESTED | `automation-verification.test.ts`, `registration.test.ts` |
| 23 | Consent for sharing registration data; sensitive-field denylist | TESTED | `registration.test.ts`, e2e registration |
| 23 | Retention policy, extra safeguards for under-18s, legal text | PENDING | Draft wording in the privacy page; Let's Tech must finalise |
| 24 | Automated security tests (auth, authz, input, event, automation, infrastructure) | TESTED | see file list below |
| 25 | Incident response plan + emergency actions (unpublish, suspend, revoke sessions, pause automation, disable submissions, rotate API key) | TESTED (actions) / PENDING (drill) | Actions tested; no tabletop exercise held |
| 26 | Backup & DR documented, encrypted | PENDING | see §5 |
| 27 | `/admin/security` dashboard | TESTED | e2e (admin renders it; moderator denied). No bulk-approve exists by design |
| 28 | CI/CD checks, gated deploy, CODEOWNERS | IMPLEMENTED | Not executed |

## Automated security test inventory
* `tests/unit/security/primitives.test.ts`: TOTP vectors, RBAC matrix, CSP builder, URL risk, Web Risk contract, HIBP k-anonymity, IP trust, SSRF lookup guard, Argon2id, image sanitising.
* `tests/unit/security/infra.test.ts`: compose/Dockerfile/nginx/CI/backup static checks.
* `tests/integration/security/authz-mfa.test.ts`: vertical/horizontal escalation, suspended users, MFA enforcement, sessions.
* `tests/integration/security/automation-verification.test.ts`: n8n (HMAC, replay, expiry, rotation, caps, pause), verification workflow, SSRF with a live local server, SQL/XSS, uploads, alerts, privacy.
* `tests/integration/security/db-roles.test.ts`: least-privilege roles against real PostgreSQL.
* `tests/e2e/permissions.spec.ts`: private routes, MFA gate, moderator scope, CSP/headers, cookie flags, stored XSS.
* Mutation spot-check (run by hand, 2026-10-09): disabling replay protection, the MFA gate, or the admin role rule each made the suite fail as expected.

## Release policy
CRITICAL/HIGH findings block a release unless listed as an accepted risk with an owner and expiry date. Changes to auth, authorization, migrations,
security configuration and deployment files require CODEOWNERS review.
