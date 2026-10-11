# Threat model

## Assets
1. **Trustworthiness of listings** (a fake or tampered event harms students; the platform's value is trust).
2. **Student personal data**: accounts, optional profiles, saved events, registration answers (names, emails, school, free text).
3. **Privileged access**: moderator/admin/super-admin sessions and the review workflow.
4. **Secrets**: session/MFA encryption keys, internal API secret, SMTP/S3 credentials, database passwords, backup keys.
5. **Availability** of discovery and registration around event deadlines.
6. **Audit evidence**: append-only admin and security logs.

## Trust boundaries
```
Internet ── TLS ──▶ Nginx (only published port; sets client IP/request id, rate limits)
                      └─▶ Next.js app (proxy.ts: nonce CSP + request id) ── authn/authz/validation/rate-limit/logging
                              ├─▶ PostgreSQL (internal network only; app role = DML only)
                              └─▶ outbound (SMTP, HIBP, Web Risk, alert webhook): egress network
Worker (same code, own container) ── DB + outbound source checks (SSRF-guarded)
n8n (separate host/stack) ── HMAC-signed HTTPS ──▶ /api/internal/event-candidates ──▶ candidate queue ──▶ human review
Browser ◀── organizer's external site (registration links): outside our control, treated as untrusted
```

## Threat actors
Opportunistic attackers/bots (credential stuffing, scanning) · fraudsters posting fake events/phishing links · malicious or impersonating
"organizers" · curious or malicious participants (IDOR, data scraping) · compromised organizer/moderator accounts · malicious event
content (XSS) · a compromised automation source or n8n instance · insiders with excess privilege · supply-chain compromise.

## Attack scenarios, controls, residual risk
| # | Scenario | Controls (evidence in the checklist) | Residual risk |
|---|---|---|---|
| T1 | Fraudster impersonates a university and publishes a fake hackathon with a phishing registration link | Organizer accounts need approval + email verification; *Verified Organizer* is a separate, evidence-based admin action; every submission is human-reviewed; HTTPS-only links, URL indicators, optional Web Risk lookup; critical findings need a written override; reports workflow; kill switches | A convincing fake from a never-seen domain can pass a hurried review. Mitigation is process (verify out of band), not code. |
| T2 | Credential stuffing / password guessing | Argon2id, breached-password screening, per-(account,IP)/account/IP failure throttling, no permanent lockout, MFA for staff | Distributed low-and-slow guessing against weak student passwords; students' MFA is optional |
| T3 | Admin/moderator account takeover | Mandatory TOTP, recovery codes hashed, session rotation after MFA, role-change revokes sessions, alerts on admin creation, minimal permissions per role | TOTP is phishable; passkeys (WebAuthn) are PENDING. Compromised super-admin = full impact |
| T4 | Privilege escalation (vertical) | Deny-by-default permission matrix on every action, role-assignment rules, no self-change, blocked attempts logged HIGH | Logic bugs in new actions; mitigated by CODEOWNERS review and tests |
| T5 | IDOR / horizontal access (other organizers' events, forms, responses, other users' data) | Object-level ownership checks in services; identity only from the session; responses visible to the event's organizers only; CSV exports logged | Organizers legitimately hold participant data; misuse is a policy/legal risk |
| T6 | Stored XSS via event/registration content | React escaping, no user HTML rendering, strict nonce CSP, JSON-LD escaping, CSV formula neutralisation | New code using raw HTML would bypass; lint/CODEOWNERS |
| T7 | CSRF | Next.js same-origin Server Action check + `allowedOrigins`, SameSite=Lax cookies, token-auth for machine routes | Not separately fuzzed |
| T8 | SSRF via the aggregator / source checks | Syntax + connect-time address validation, redirect re-validation, size/time/type caps, worker network separation | Egress firewall (host level) is PENDING; real-DNS rebinding drill PENDING |
| T9 | Malicious upload | Content sniffing, decode + re-encode, pixel/size limits, random names, `nosniff` + sandbox CSP | Same-origin serving (separate origin PENDING); no AV scan (no documents accepted) |
| T10 | Compromised or abused n8n | HMAC + request-id replay protection, tight rate limits, can only create PENDING candidates, kill switch, secret rotation | n8n compromise can flood the queue; humans are the gate |
| T11 | SQL injection | Prisma/parameterised raw queries only, input validation, tests with injection strings | None known |
| T12 | Database exposure / over-privileged app | Internal network, no published port, separate roles, audit tables append-only | DB traffic is unencrypted on the private docker network (acceptable for single host; add TLS if the DB moves) |
| T13 | Data breach of backups | `age` public-key encryption, private key off-server, retention, restore drill | Key management is manual; drill not yet run |
| T14 | Mass registration spam / resource exhaustion | Login required to register, verified email, per-user rate limits, capacity locks, nginx limits, search throttling | Bot-created verified accounts; CAPTCHA PENDING (add only if abuse appears) |
| T15 | Supply-chain compromise | Lockfile, `--ignore-scripts`, Dependabot, audit-ci, gitleaks, Semgrep, Trivy (workflows written, **not yet executed**) | Zero-day in dependencies |
| T16 | Over-collection of student data via registration forms | Sensitive-field denylist, consent screen naming the recipient, withdrawal, export/deletion | Free-text answers can still contain sensitive data |
| T17 | Prompt injection / AI misuse | No AI features exist; any future AI use is bound by the rules in the checklist (§15) | n/a today |

## Out of scope / accepted
Physical access to the VPS, compromise of the hosting provider, nation-state adversaries, and the security of organizers' own websites.
