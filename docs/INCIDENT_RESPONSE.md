# Incident response plan

## Roles (fill in real names before launch)
| Role | Responsibility | Person |
|---|---|---|
| Incident lead | Decides severity, coordinates, owns the timeline and the post-incident review | *TBD (Let's Tech)* |
| Technical responder | Contains, preserves evidence, remediates | *TBD* |
| Communications | Notifies users/organizers/authorities, approves wording | *TBD* |
| Super administrator | Holds the emergency switches and can change privileged roles | *TBD (≥ 2 people)* |

## Severity
| Level | Meaning | Examples | Target response |
|---|---|---|---|
| **CRITICAL** | Active compromise or confirmed personal-data exposure | Admin account takeover; database credentials leaked; student data breach; phishing link live on a published event | Immediate; contain within 1 h |
| **HIGH** | Likely compromise or serious abuse, not yet confirmed | Compromised organizer account publishing events; webhook secret leaked; spike of blocked privilege escalations | Within 4 h |
| **MEDIUM** | Contained abuse or weakness with limited impact | Spam registrations; a vulnerable dependency without known exploitation | Within 2 business days |
| **LOW** | Hygiene issue | Misconfiguration with no exposure | Next release |

## Process
1. **Detect:** `/admin/security` alerts, the alert webhook, user reports (*Report incorrect information*), `docker compose logs web worker` (structured JSON, every line has `requestId` where available), external vulnerability reports (SECURITY.md).
2. **Triage:** open an incident record (time, reporter, affected assets). Assign severity. Find related rows: `SecurityEvent` (by type/actor/request id), `AdminAuditLog`.
3. **Contain** (use the least disruptive action that stops harm; all of these are audited and reversible except key rotation):

   | Situation | Action (where) |
   |---|---|
   | Dangerous/fake event is live | **Unpublish** it (Admin → Events), then suspend its organizer (Admin → Organizers → Suspend + reason) |
   | Compromised organizer/student account | **Suspend user** (Admin → Users): deletes all their sessions immediately |
   | Compromised staff account | A super administrator suspends it and revokes sessions, then reviews `AdminAuditLog` for everything it did; reset MFA by deleting its credential in the database as the *migrator/admin* role (documented, break-glass) |
   | Automation abuse / n8n compromised | **Pause automation** (Admin → Security) and **rotate** `INTERNAL_API_SECRET` (set the old value as `INTERNAL_API_SECRET_PREVIOUS` only if you need a grace period, otherwise remove it) |
   | Spam/abuse wave | **Disable event submissions** (Admin → Security); tighten nginx `limit_req`; suspend offending accounts |
   | Credential leak (DB, SMTP, S3, session/MFA key) | Rotate the secret; for `SESSION_SECRET`/`MFA_ENCRYPTION_KEY` plan the consequence (all sessions invalid / MFA users re-enrol); restart services |
   | Suspected server compromise | Isolate the VPS at the provider firewall, snapshot it for forensics, rebuild from a clean image and restore data from the last known-good backup |

4. **Preserve evidence** before cleaning up: `pg_dump` of `SecurityEvent` and `AdminAuditLog` (append-only), container logs (`docker compose logs --no-color > incident-<date>.log`), nginx access logs, a disk snapshot if the host is suspect. Store them off the server with restricted access.
5. **Investigate:** timeline from audit/security events; determine entry point, accounts touched, data accessed (registration CSV exports are logged as `registrations.exported`).
6. **Remediate:** fix the root cause, add a regression test, rotate every credential the attacker could have seen.
7. **Recover:** re-enable switches one at a time; monitor alerts; restore data if needed ([BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md)).
8. **Review:** blameless post-mortem within 5 business days: what happened, impact, what worked, actions with owners and dates; update the threat model/checklist.

## Notification
Where personal data was exposed: notify affected users and organizers without undue delay with what happened, what data, what to do, and a contact. Check legal obligations in Myanmar and for any affected non-Myanmar users with Let's Tech's counsel (*to be confirmed*). Do not put sensitive details in alert channels or email subject lines.

## Drills
Hold a tabletop exercise before launch and twice a year: (a) phishing event published, (b) admin account takeover, (c) leaked n8n secret. Record gaps in this file.
