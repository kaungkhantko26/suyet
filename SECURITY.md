# Security Policy

## Supported versions
Only the latest release on the `main` branch receives security fixes. Deployments should track `main` (see
[docs/DEPLOYMENT_SECURITY.md](docs/DEPLOYMENT_SECURITY.md) for the update procedure).

## Reporting a vulnerability
**Please do not open a public issue for security problems.**

* Email: **security@letstechsolutions.com** *(placeholder: Let's Tech must create and monitor this mailbox before launch)*.
* Include: affected URL/route, steps to reproduce, impact, and any proof of concept. Do not include real personal data.
* Optional: PGP key / `security.txt` at `/.well-known/security.txt` (to be published by Let's Tech).

We aim to acknowledge reports within **3 business days**, give an initial assessment within **7 days**, and fix or mitigate
CRITICAL/HIGH issues within **30 days** (faster for active exploitation). We will keep you informed and credit you if you wish.

## Responsible disclosure guidelines
* Test only against your own accounts and a local/staging copy where possible; never against other people's data.
* No denial-of-service, spam, social engineering of staff or students, or physical attacks.
* Stop and report as soon as you gain access to data that is not yours; do not download, keep or share it.
* Give us reasonable time to fix before public disclosure.

Good-faith research that follows these rules will not be pursued legally by Let's Tech.

## Scope
In scope: this application, its API routes, the internal event-candidate API, and the deployment configuration in this repository.
Out of scope: third-party services (SMTP provider, Let's Encrypt, event organizers' own websites that registration links point to; report
dangerous links to us via the "Report incorrect information" button).

## Security documentation
[Threat model](docs/THREAT_MODEL.md) · [Checklist with evidence](docs/SECURITY_CHECKLIST.md) · [Incident response](docs/INCIDENT_RESPONSE.md) ·
[Backup & recovery](docs/BACKUP_RECOVERY.md) · [Deployment security](docs/DEPLOYMENT_SECURITY.md) · [Baseline assessment](docs/SECURITY_ASSESSMENT.md)
