# Security assessment: baseline and outcome

Baseline taken before the hardening work (2026-10-09) by inspecting the repository and probing the running app
(`curl -I`, source inspection, `npm audit`). Severity: CRITICAL / HIGH / MEDIUM / LOW. "Status now" is backed by the test or file named in
[SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md).

## Existing controls found (and re-verified)
Server-side session auth with hashed tokens; role checks on server actions; Zod validation; Prisma parameterised queries; DB-backed rate
limiting; basic security headers (nosniff, XFO, referrer, permissions); SSRF guard with pre-connect DNS check; upload content-sniffing;
n8n endpoint with bearer/HMAC + idempotency; audit log table; no `dangerouslySetInnerHTML` of user content; HTTP-only cookies.

## Findings
| # | Sev. | Finding (baseline) | Status now |
|---|---|---|---|
| 1 | HIGH | **No Content-Security-Policy.** Only static headers. | Fixed: per-request nonce CSP in `src/proxy.ts`; enforced in e2e with zero violations. |
| 2 | HIGH | **Client IP trusted from the first `X-Forwarded-For` entry**, and the nginx template *appended* client-supplied values, so every IP rate limit could be bypassed by spoofing a header. | Fixed: nginx *sets* `X-Real-IP`/`X-Forwarded-For`; app prefers `X-Real-IP`, else the right-most XFF entry (`lib/security/ip.ts`, unit-tested). |
| 3 | HIGH | **No MFA** for privileged accounts; only roles STUDENT/ORGANIZER/ADMIN. | Fixed (TOTP): MODERATOR/ADMIN/SUPER_ADMIN cannot hold an authenticated session without MFA. Passkeys/WebAuthn still PENDING. |
| 4 | HIGH | **SSRF DNS-rebinding window**: hostnames were resolved for checking, then re-resolved by `fetch`. | Fixed: validation happens inside the connection's DNS lookup (undici agent). Real-DNS rebinding drill still PENDING. |
| 5 | HIGH | **Replayable webhook signatures** (timestamp only) and bearer secret allowed in production. | Fixed: signed request id + nonce store, HMAC-only default in production, secret rotation. |
| 6 | HIGH | Application connected to PostgreSQL with one all-powerful role; no DDL/audit-trail separation. | Fixed: migrator/app/admin roles; app role cannot alter schema or rewrite audit tables (tested on real PostgreSQL). |
| 7 | MEDIUM | scrypt password hashes; no breached-password screening. | Fixed: Argon2id (+ transparent upgrade of legacy hashes) and HIBP k-anonymity check. |
| 8 | MEDIUM | Uploads were stored byte-for-byte after type sniffing (metadata/polyglot payloads kept). | Fixed: decode + re-encode to WebP, pixel limits. |
| 9 | MEDIUM | Admin role was a single all-powerful ADMIN; admins could change any role. | Fixed: RBAC matrix, role-assignment rules, no self-change, sessions revoked on role change. |
| 10 | MEDIUM | No security event log (failed logins, webhook failures…), no alerting. | Fixed: append-only `SecurityEvent`, threshold alerts, optional webhook. |
| 11 | MEDIUM | No URL risk assessment for registration links; HTTP links accepted. | Fixed: HTTPS-by-default policy, indicators, optional Web Risk lookup; critical findings need written justification to approve. |
| 12 | MEDIUM | Organizer "verified" badge had no evidence trail. | Fixed: method + written evidence required, recorded, revocable. |
| 13 | MEDIUM | Containers ran with default privileges; DB on a routable network; backups unencrypted. | Fixed in configuration (static tests). **Not yet run on a real VPS.** |
| 14 | MEDIUM | Sessions had no idle timeout, no rotation, no sign-out-everywhere. | Fixed and tested. |
| 15 | LOW | HSTS sent even over HTTP; no COOP/CORP. | Fixed: HSTS only when `APP_URL` is https; COOP/CORP added. |
| 16 | LOW | `npm audit`: 3 HIGH (one advisory: `deepmerge-ts` via Prisma CLI config loader). | **Accepted risk** (no fixed upstream release; build-time only, trusted input). Time-boxed in `audit-ci.jsonc`. |
| 17 | LOW | No automated pipeline checks (audit, secret scan, SAST, image scan). | Workflows written; **not executed** (no GitHub/Docker here). |

## Bugs found and fixed by the new security tests
* Registration answers survived account deletion (privacy). Now erased and included in the data export.
* My first Docker Compose file contained invalid YAML (an unquoted colon); the new static infrastructure tests parse it, so this class of error is now caught.
* Events without an end date disappeared from listings (earlier functional bug, caught by the integration suite; unrelated to security).
