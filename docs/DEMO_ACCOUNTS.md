# Demo accounts (local development only)

Created by `npm run db:seed` when `NODE_ENV` is not `production`. They **do not exist in production** and must never be created there
(production only gets the reference data plus the first `ADMIN_EMAIL` super admin). All data and organizations are fictional.

Password for every demo account: **`demo-password-123`** (override with `SEED_DEMO_PASSWORD` before seeding).

| Role | Email | Two-factor | What to try |
|---|---|---|---|
| Student | `student@demo.letstech.test` | optional (off) | Save events, preferences, register on the on-site demo event, My registrations |
| Organizer | `organizer@demo.letstech.test` | optional (off) | Owns the three fictional organizations: create/edit events, **Registration form** builder, view responses, CSV export |
| Moderator | `moderator@demo.letstech.test` | **required** | Review submissions, verify events, reports. Cannot publish, manage users/organizers or see the Security page |
| Admin | `admin@demo.letstech.test` | **required** | Everything except granting ADMIN/SUPER_ADMIN: events, organizers (verify with evidence), users, categories, Security dashboard |
| Super admin | `superadmin@demo.letstech.test` | **required** | Everything, including granting/removing admin roles |

## Two-factor for the staff accounts
Moderator, admin and super admin must pass a 6-digit TOTP code after the password. Get the current code with:
```bash
npm run demo:totp
```
(or add the manual key it prints to any authenticator app: Google Authenticator, Authy, 1Password…). Each code works once; if you log in twice
within 30 seconds, wait for the next code. Recovery codes are not issued for the demo secret.

## Handy demo content
* `Demo On-Site Registration Workshop`: registers **on this site** (capacity 3) with a ready-made form.
* `Demo AI Sprint (online)`, `Demo Campus Hackathon 24h`, … external-link events; `Demo Mobile App Day (cancelled)`; `Demo Cloud Basics (completed)`.
* Organizer sign-up flow: register at `/auth/register/organizer`, then approve the application as admin (the applicant's email must be verified; in dev,
  emails are printed by the worker: `npm run worker`).

Run the app: `npm run db:local` → `npm run dev` → http://localhost:3000
