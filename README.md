# Let's Tech Events

**Discover. Connect. Learn. Compete.** — Myanmar's home for tech events & opportunities. *An initiative of Let's Tech.*

A discovery platform for hackathons, competitions, workshops and conferences. Students browse for free; organizers submit events; admins review before anything is published; every listing links to its official source. Organizers choose how people register: a link to their own site, **or a form built right here** (Google-Forms-style builder; students fill it in on the event page; organizers see and export responses).

Brand: follows the parent site (letstechsolutions.com): warm paper `#f3f0e8` / ink `#111416`, Inter + a serif display face, numbered editorial sections, the orange "LT" monogram. Blue `#2563EB` is the interactive accent; dark mode and English + Burmese (Noto Sans Myanmar, Unicode) are supported.

## Stack
Next.js 16 (App Router, Server Components/Actions, Route Handlers) · React 19 · TypeScript · Tailwind CSS 4 · shadcn-style primitives · Lucide · React Hook Form + Zod · Prisma 6 + PostgreSQL 16 · database-backed job queue + worker · SMTP (nodemailer) · Docker Compose + Nginx.

## Quick start (development, no Docker)
```bash
npm install
cp .env.example .env              # dev values for DATABASE_URL etc. (see below)
npm run db:local                  # terminal 1: real PostgreSQL on 127.0.0.1:54329 (embedded binaries)
npm run db:deploy && npm run db:seed
npm run dev                       # terminal 2 → http://localhost:3000
npm run worker                    # terminal 3 → emails, reminders, source checks (optional in dev)
```
Dev `DATABASE_URL`: `postgresql://letstech:letstech@127.0.0.1:54329/letstech_events`. With your own PostgreSQL, point `DATABASE_URL` at it instead of running `db:local`.

`npm run db:seed` loads categories, all 15 states/regions + Online/Nationwide/International, and **fictional demo data** (every demo event is labelled “Demo (fictional)”). Local demo accounts (student, organizer, moderator, admin, super admin; staff need a TOTP code) are listed in [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md). They are never created in production.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run typecheck` · `npm run lint` | TypeScript · ESLint |
| `npm test` | Vitest: 175 unit + 144 integration tests against real PostgreSQL (create a dedicated test database; see below) |
| `npm run test:e2e` | Playwright: 35 browser tests (desktop + mobile) against a production build with CSP enforced, on port 3100 and a dedicated e2e DB. Run `npm run build` first. |
| `npm run demo:totp` | Prints the current 2FA code for the local demo staff accounts |
| `npm run db:deploy` / `db:migrate` / `db:seed` | Apply migrations / create a new migration in dev / seed |
| `npm run worker` | Background worker |

## Roles & access
Five roles with a deny-by-default permission matrix (`src/lib/auth/permissions.ts`):
* **Student** (default): browse, save, register, suggest events, report.
* **Organizer**: own organization(s): create events, build registration forms, read responses. Separate sign-up path (`/auth/register/organizer`) or application from a student account; the account stays a student until an admin approves it. Roles are never self-assignable.
* **Moderator**: review submissions/reports and verify events (cannot publish, manage users/organizers, or read participants' data).
* **Admin**: manage events, organizers (evidence-based verification), users up to moderators, categories, sources, security dashboard.
* **Super admin**: the only role that can grant or remove admin roles.
Moderators, admins and super admins **must** use two-factor authentication (TOTP). Every page, action and API re-checks permission on the server.

## Review workflow
Submission status (`DRAFT → PENDING_REVIEW → APPROVED/REJECTED/CHANGES_REQUESTED`) is stored separately from the public state (`DRAFT/PUBLISHED/ARCHIVED`) and from the computed status badge (Registration Open/Closed, Upcoming, Ongoing, Completed, Cancelled — derived from dates + overrides, never stored). Substantial edits to a published event (dates, links, location, fee, title…) are queued for review and the live listing is unchanged until approved. *Verified* requires an admin and an official source URL, and is reset to *Needs review* when approved changes alter a verified event.

## Documentation
* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Ubuntu VPS, Docker Compose, Nginx/HTTPS, backups, checklist
* [docs/N8N.md](docs/N8N.md) — n8n event-candidate endpoint
* [SECURITY.md](SECURITY.md) · [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) · [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md) (every control with evidence and honest status) · [docs/INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md) · [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) · [docs/DEPLOYMENT_SECURITY.md](docs/DEPLOYMENT_SECURITY.md) · [docs/SECURITY_ASSESSMENT.md](docs/SECURITY_ASSESSMENT.md)
* [docs/DEMO_ACCOUNTS.md](docs/DEMO_ACCOUNTS.md)
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design decisions, security model, implementation checklist and **known gaps**
