# Deployment security (Ubuntu VPS)

> **Nothing here has been applied.** These are the steps to take on the real server, in this order. Change one thing at a time and keep a
> second SSH session open so you cannot lock yourself out. Do not modify SSH or the firewall without verifying continued access first.

## 1. Base system
* Use a supported **Ubuntu 24.04 LTS** (or 22.04 LTS). `sudo apt update && sudo apt full-upgrade -y`, then enable automatic security updates: `sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`.
* Time sync: `timedatectl set-ntp true` (needed for TOTP and signed webhook timestamps; verify with `timedatectl status`).
* Create an unprivileged admin user: `adduser deploy && usermod -aG sudo deploy` and install your **public key** in `~deploy/.ssh/authorized_keys` (`chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys`).

## 2. SSH (only after confirming key login works in a *second* session)
`/etc/ssh/sshd_config.d/10-hardening.conf`:
```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers deploy
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
```
`sudo sshd -t && sudo systemctl reload ssh`, then open a **new** terminal to verify before closing the old one. Optionally restrict by source IP in the firewall.

## 3. Firewall (UFW) and Docker
```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow from <your-office-ip> to any port 22 proto tcp   # or: sudo ufw limit 22/tcp if the IP is not fixed
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable && sudo ufw status verbose
```
**Docker bypasses UFW** for published ports. The compose file publishes only nginx (80/443). Verify from another machine: `nmap -Pn <vps-ip>` must show only 22 (if allowed), 80, 443.

**Egress restriction (defence in depth for SSRF):** the `web` and `worker` containers need outbound HTTPS/SMTP only. Drop traffic from containers to private/metadata ranges via the `DOCKER-USER` chain:
```bash
for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
  sudo iptables -I DOCKER-USER -s 172.16.0.0/12 -d $net -j DROP     # adjust so container↔container traffic on the compose networks still works
done
```
Persist with `iptables-persistent`; test that the site still works and that `docker compose exec worker node -e "fetch('http://169.254.169.254').catch(e=>console.log('blocked'))"` is blocked.

## 4. Intrusion prevention and auditing
`sudo apt install fail2ban` with an `sshd` jail (and optionally an nginx 4xx jail on `/auth/` rate-limit hits); `sudo apt install auditd`; keep `/var/log` on the host and ship it off-box if possible.

## 5. Secrets and permissions
* `.env` is `chmod 600`, owned by `deploy`, never committed. Generate every secret with `openssl rand -base64 32`.
* Prefer Docker/Compose **secrets** or an external secret store for the database passwords and `MFA_ENCRYPTION_KEY` if you later adopt Swarm/Kubernetes; compose environment variables are visible to anyone who can run `docker inspect`, so restrict who can use Docker (`docker` group = root-equivalent).
* Do not mount the Docker socket anywhere; the CI deploy key is limited to a single forced command on the server (`command="/usr/local/bin/lte-deploy",restrict`).

## 6. TLS and nginx
* Certificates: `sudo certbot certonly --webroot -w <certbot-webroot volume path> -d events.letstechsolutions.com` (see DEPLOYMENT.md); verify renewal: `sudo certbot renew --dry-run` and that the deploy hook reloads nginx.
* Validate before enabling HSTS for real traffic: `docker compose exec nginx nginx -t`, then `testssl.sh events.letstechsolutions.com` or SSL Labs; confirm every intended hostname serves HTTPS, then keep the HSTS header (it ships in the template).
* nginx sets `X-Real-IP`/`X-Forwarded-For`/`X-Request-Id` itself and strips `X-Nonce`. **Never** expose the `web` container directly (the app trusts those headers).
* If n8n runs on a fixed IP, uncomment the `allow … ; deny all;` lines for `/api/internal/` in `nginx/events.conf.template`.

## 6b. Verify the response headers after deploy
```bash
curl -sI https://events.letstechsolutions.com | grep -iE "strict-transport|content-security|x-frame|x-content|referrer|permissions|cross-origin|server:"
```
Expect HSTS, a nonce-based CSP, no version in `Server`, and no `X-Powered-By`.

## 7. Database
* `docker compose exec db psql -U postgres -c '\du'` should list `letstech_app` and `letstech_migrator` as non-superusers.
* The `web`/`worker` containers use `letstech_app` only; `migrate` (schema owner) runs once per deploy and exits.
* Re-apply grants after any manual schema change: `docker compose run --rm migrate sh -c "npx tsx scripts/db-roles.ts grants"`.

## 8. n8n
Run n8n on a separate Docker network/host; never publish its editor port to the internet (reverse-proxy it behind SSO/VPN or an IP allow-list). Store the signing secret as an n8n credential. Rotate `INTERNAL_API_SECRET` at least every 90 days using `INTERNAL_API_SECRET_PREVIOUS` for zero downtime.

## 9. Updates and rollback
`git fetch && git checkout <tag> && docker compose up -d --build` (the `migrate` service runs first). Keep the previous image tag; rollback = checkout the previous tag and rebuild. Migrations are forward-only: take a backup immediately before any release that includes one.

## 10. Verification checklist (record the date and result)
- [ ] `nmap` from outside shows only 80/443 (and 22 from allowed sources)
- [ ] `ssh -o PreferredAuthentications=password deploy@host` is refused; root login refused
- [ ] `docker compose ps` healthy; `docker compose config` shows no published ports except nginx
- [ ] `\du` shows non-superuser app roles; app cannot `CREATE TABLE` (`docker compose exec db psql -U letstech_app …`)
- [ ] Security headers and CSP present; no CSP violations in `docker compose logs web | grep csp-violation`
- [ ] `certbot renew --dry-run` passes; `testssl.sh` grade A or better
- [ ] First super admin enrolled TOTP; recovery codes stored offline
- [ ] Backup + **restore drill** completed; dead-man's-switch configured
- [ ] Alert webhook delivers a test alert (`/admin/security` → trigger a throttled-login test or use `ALERT_WEBHOOK_URL` with curl)
- [ ] CI pipeline green on `main` (audit, gitleaks, Semgrep, Trivy)
