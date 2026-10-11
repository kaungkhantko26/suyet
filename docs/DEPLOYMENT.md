# Deployment guide (Ubuntu VPS, Docker Compose, Nginx, HTTPS)

## 1. Server prerequisites
* Ubuntu 22.04/24.04 VPS (2 vCPU / 2 GB RAM is enough to start), a DNS **A record** for `events.letstechsolutions.com` → the VPS IP.
* Firewall: allow only 22, 80, 443 (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`). PostgreSQL and Redis are not published by the compose file.
* Install Docker Engine + the Compose plugin ([docs.docker.com/engine/install/ubuntu](https://docs.docker.com/engine/install/ubuntu/)) and certbot (`apt install certbot`).

## 2. Configure
```bash
git clone <your-repo-url> letstech-events && cd letstech-events
cp .env.example .env
# fill in: POSTGRES_ADMIN_PASSWORD, APP_DB_PASSWORD, MIGRATOR_DB_PASSWORD (three different values), APP_URL (https://…), SERVER_NAME,
#          SESSION_SECRET, MFA_ENCRYPTION_KEY, INTERNAL_API_SECRET, CRON_SECRET (each: openssl rand -base64 32),
#          SMTP_*, ADMIN_EMAIL / ADMIN_PASSWORD, BACKUP_AGE_RECIPIENT. See .env.example for every option.
chmod 600 .env
```
`CLUB_URL` stays empty until the official Let's Tech Club link is confirmed.

## 3. TLS certificate (first time)
nginx needs a certificate before it can serve HTTPS, so obtain it once with certbot's standalone mode while nothing listens on port 80:
```bash
sudo certbot certonly --standalone -d events.letstechsolutions.com --agree-tos -m you@example.org
```
Renewal (certbot installs a systemd timer). Reload nginx after renewal:
```bash
echo '#!/bin/sh
docker compose -f /path/to/letstech-events/docker-compose.yml exec -T nginx nginx -s reload' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```
(Renewals use the webroot at `/var/www/certbot`; switch with `sudo certbot renew --webroot -w <path-of-certbot-webroot-volume>` or keep `--standalone` with a pre/post hook that stops/starts nginx.)

## 4. Start
```bash
docker compose up -d --build          # db → migrate (migrations + reference seed) → web + worker + nginx
docker compose ps
curl -fsS https://events.letstechsolutions.com/api/health
```
The `migrate` service runs `prisma migrate deploy` and seeds categories, all Myanmar states/regions and (when `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set) the first admin. **Demo data is never seeded in production** unless you set `SEED_DEMO=1`.

The first account is a **SUPER_ADMIN**. At first login it is forced to enrol an authenticator app (TOTP) and shown one-time recovery codes: store them offline. Then change the password and remove `ADMIN_PASSWORD` from `.env`. Moderators/admins are created by promoting users in Admin → Users (only a super admin can create admins).

**Security hardening is documented separately:** [DEPLOYMENT_SECURITY.md](./DEPLOYMENT_SECURITY.md) (server, firewall, SSH, TLS) and [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md) (encrypted backups, restore drill). The stack in `docker-compose.yml` has never been started in this repository's development environment: validate with `docker compose config` and a staging run first.

## 5. Common commands
| Task | Command |
|---|---|
| Logs | `docker compose logs -f web worker` |
| Apply new migrations after an update | `git pull && docker compose up -d --build` (the `migrate` service runs first) |
| Seed reference data again (idempotent) | `docker compose run --rm migrate npx tsx prisma/seed.ts` |
| Open a SQL shell | `docker compose exec db psql -U postgres letstech_events` |
| Production build/start without Docker | `npm ci && npm run build && npm run db:deploy && npm start` (run `npm run worker` as a second process) |
| Local development | `npm run db:local` (embedded Postgres, no Docker) · `npm run db:deploy && npm run db:seed` · `npm run dev` · `npm run worker` |

## 6. Backups & restore
```bash
BACKUP_AGE_RECIPIENT=age1… ./scripts/backup.sh /var/backups/letstech   # age-encrypted pg_dump + uploads archive (refuses to run unencrypted)
# cron, nightly at 02:30:
30 2 * * * cd /path/to/letstech-events && ./scripts/backup.sh /var/backups/letstech >> /var/log/letstech-backup.log 2>&1
```
Copy backups **off the server** (object storage / another host). Test a restore on a scratch machine:
```bash
docker compose stop web worker
BACKUP_AGE_IDENTITY=/secure/key.txt ./scripts/restore.sh /var/backups/letstech/db-YYYYMMDD-HHMMSS.dump.age   # asks for confirmation; overwrites the database
docker compose up -d
```

## 7. Storage
Default: uploaded images live in the `uploads` Docker volume and are served by the app at `/media/<random>.jpg|png|webp` (content-sniffed, random names). For S3-compatible storage set `STORAGE_DRIVER=s3` and the `S3_*` variables (including `S3_PUBLIC_URL`).

## 8. Email
Without `SMTP_HOST` the worker refuses to send in production (jobs retry and then fail visibly in Admin → Automation). Use any SMTP provider; set SPF/DKIM for the sending domain.

## 9. n8n
See [N8N.md](./N8N.md). If n8n runs on the same VPS, put it on the same Docker network (or restrict `/api/internal/` in `nginx/events.conf.template`).

## 10. Deployment checklist
- [ ] DNS A record points to the VPS; ports 80/443 open, everything else closed
- [ ] `.env` filled in, `chmod 600`, secrets are long random values (not the examples)
- [ ] TLS certificate issued and auto-renewal + nginx reload hook tested (`certbot renew --dry-run`)
- [ ] `docker compose ps` shows db healthy, web healthy, worker running; `/api/health` returns `{"status":"ok"}`
- [ ] First admin logs in; password changed; `ADMIN_PASSWORD` removed from `.env`
- [ ] SMTP verified: register a test account and confirm the verification email arrives
- [ ] `CLUB_URL` set only after the official Club link is confirmed; legal pages (Privacy/Terms) reviewed and finalised by Let's Tech
- [ ] Nightly backup cron installed, a copy leaves the server, and a **restore was rehearsed**
- [ ] PostgreSQL is not reachable from outside (`nmap` the VPS: only 22/80/443)
- [ ] Rate limits and security headers verified (`curl -I https://…`)
- [ ] Log in as a student and an organizer to verify role gating; `/admin` shows *Access denied* for them
