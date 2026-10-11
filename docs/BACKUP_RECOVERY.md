# Backup and disaster recovery

> **Status: documented and scripted, never executed.** A backup is not a backup until a restore has been proven (see the drill below).

## What is backed up
| Asset | How | Notes |
|---|---|---|
| PostgreSQL | `pg_dump --format=custom` piped into `age` encryption (`scripts/backup.sh`) | Taken as the `postgres` admin identity via `docker compose exec`; plaintext never touches disk |
| Uploaded images | `tar` of the `uploads` volume piped into `age` | Not needed with `STORAGE_DRIVER=s3` (use bucket versioning/replication instead) |
| Configuration | `.env`, `nginx/` and `docker-compose.yml` are kept in a **password manager / sealed secret store**, never in git | Includes `SESSION_SECRET`, **`MFA_ENCRYPTION_KEY`** (without it every TOTP secret is unreadable → all MFA users must re-enrol), `INTERNAL_API_SECRET` |
| Encryption identity | The `age` **private key** is stored offline and in a second location (e.g. two staff, sealed) | Never on the server. Losing it makes every backup unreadable |

## Procedure
1. One-time: `age-keygen -o backup-key.txt` on a trusted workstation; copy the public key (`age1…`) into the server's `.env` as `BACKUP_AGE_RECIPIENT`; store `backup-key.txt` offline.
2. Nightly cron on the VPS (see DEPLOYMENT.md): `./scripts/backup.sh /var/backups/letstech`.
3. Off-site copy: set `BACKUP_REMOTE` (rclone to object storage with versioning and restricted credentials, **write-only** for the server so a compromised host cannot delete history).
4. Monitoring: set `HEALTHCHECK_URL` to a dead-man's-switch (healthchecks.io-style). The script pings it only after a *successful, non-empty* backup; missing pings alert you.
5. **Retention:** 14 days local (script prunes); remote: daily 14, weekly 8, monthly 12 (configure on the remote). Backups contain personal data: restrict access and delete on schedule.
6. Access: only the backup key holders; the backup directory is `umask 077`.

## Recovery objectives (proposed, adjust with the business)
* **RPO** 24 hours (nightly backups). Tighten with WAL archiving if needed.
* **RTO** 4 hours on a fresh VPS following the steps below.

## Restore drill (do this before launch and every quarter)
```bash
# on a scratch machine with Docker + age; the private key is supplied only here
BACKUP_AGE_IDENTITY=/secure/backup-key.txt ./scripts/restore-drill.sh backups/db-YYYYMMDD-HHMMSS.dump.age
```
It restores into a throwaway PostgreSQL container, prints user/event/migration counts and removes the container. Record the date, backup used, counts and time taken in a drill log. Also restore the uploads archive and open a few images.

## Emergency recovery (production)
1. Provision a clean Ubuntu VPS and apply [DEPLOYMENT_SECURITY.md](./DEPLOYMENT_SECURITY.md) hardening.
2. Restore `.env` from the secret store; `git clone` the release you want; point DNS at the new IP; obtain TLS certificates.
3. `docker compose up -d db` then stop dependants: `docker compose stop web worker`.
4. `BACKUP_AGE_IDENTITY=… ./scripts/restore.sh db-….dump.age` (asks for confirmation; re-applies least-privilege grants).
5. Restore uploads into the `uploads` volume (`age -d … | tar xz -C <volume mount>`).
6. `docker compose up -d --build`; check `/api/health`, log in as a super administrator, review `/admin/security`.
7. **Credential rotation after any suspected compromise:** database passwords (`APP_DB_PASSWORD`, `MIGRATOR_DB_PASSWORD`, `POSTGRES_ADMIN_PASSWORD`; re-run `scripts/db-roles.ts roles`), `INTERNAL_API_SECRET`, SMTP/S3 keys, then `SESSION_SECRET` last (it logs everyone out).
8. Service restart order: `db` → `migrate` → `web`/`worker` → `nginx`.

## Rules
* Never commit dumps, `.env`, age identities or `backups/` (all in `.gitignore` or outside the repo).
* Test restoration regularly; an untested backup is treated as no backup.
