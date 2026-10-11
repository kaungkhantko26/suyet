# n8n integration

n8n (self-hosted) sends **event candidates** to Let's Tech Events. Candidates are never published automatically: each one lands in **Admin → Automation** as `PENDING_REVIEW`, where a person edits, promotes it to a *draft* event (still unpublished) or dismisses it.

## Endpoint

`POST {APP_URL}/api/internal/event-candidates`

**Authentication: signed requests (default in production).** Send these headers:

| Header | Value |
|---|---|
| `X-Timestamp` | Unix time in seconds (requests older/newer than 5 minutes are rejected) |
| `X-Request-Id` | A **unique** id per request (8–100 chars `[A-Za-z0-9_-]`). Reusing one is rejected with `409 replayed_request` |
| `X-Signature` | `sha256=` + hex of `HMAC_SHA256(INTERNAL_API_SECRET, "<timestamp>.<request id>.<exact raw body>")` |
| `Content-Type` | `application/json` (max 100 KB) |
| `Idempotency-Key` | optional but recommended (your workflow's item id) |

`INTERNAL_AUTH_MODE` can be `hmac` (production default), `both` (dev/test default) or `bearer` (`Authorization: Bearer <secret>`, discouraged). The comparison is constant-time; failures are logged as security events and rate-limited per IP.
**Rotation:** set the new secret as `INTERNAL_API_SECRET` and keep the old one in `INTERNAL_API_SECRET_PREVIOUS` until n8n is updated, then remove it.

**What this identity can do:** create candidates (always `PENDING_REVIEW`) and read a candidate's status: `GET /api/internal/event-candidates?id=<id>` returns only `{id, status, createdAt}`. It cannot approve, publish, change roles or read any personal data. Extra fields in the body (e.g. `status`, `role`) are ignored.
**Kill switch:** Admin → Security → *Pause automation* makes the endpoint return `503` immediately.

n8n Code node example (HMAC):
```js
const crypto = require('crypto');
const body = JSON.stringify($json.payload);
const ts = Math.floor(Date.now() / 1000).toString();
const id = crypto.randomUUID();
const sig = 'sha256=' + crypto.createHmac('sha256', $env.LTE_INTERNAL_SECRET).update(`${ts}.${id}.${body}`).digest('hex');
return [{ json: { body, headers: { 'X-Timestamp': ts, 'X-Request-Id': id, 'X-Signature': sig, 'Content-Type': 'application/json' } } }];
```
Then an HTTP Request node posts `{{$json.body}}` as the raw body with those headers (send the **same string** you signed).

### Payload (illustrative; only `title` and `sourceUrl` are required)

```json
{
  "title": "Example Student Hackathon",
  "description": "Example event description",
  "category": "Hackathon",
  "organizer": "Example Organizer",
  "sourceUrl": "https://example.org/event",
  "registrationUrl": "https://example.org/register",
  "startDate": "2026-11-20T09:00:00+06:30",
  "registrationDeadline": "2026-11-15T23:59:00+06:30",
  "format": "Online",
  "location": "Myanmar"
}
```

Rules that protect data quality:
* Anything you don't send is stored as **unknown** (listed in `missingFields`). Nothing is invented.
* Dates **must carry a timezone offset**. A date without one is stored as unknown and flagged in `validationIssues` (we do not guess a timezone).
* Dates in the past, a deadline after the start, or an end before the start are flagged for the reviewer.
* `sourceUrl` / `registrationUrl` must be `http(s)`; anything else is rejected with 422.

### Responses

| Status | Meaning |
|---|---|
| `201` | Candidate created (`status: PENDING_REVIEW`) |
| `200` | Idempotent replay of an earlier request (`idempotentReplay: true`) |
| `400` / `413` / `422` | Invalid JSON / body too large / validation failed (`error.issues`) |
| `401` | Missing or wrong credentials / expired timestamp |
| `409` | Signed request id already used (replay) |
| `503` | Automation paused by an administrator |
| `429` | Rate limited (120 requests/minute); honour `Retry-After` |

The response includes `possibleDuplicate` and `duplicateReasons` (same normalized source/registration URL, similar title + same day, …). Duplicates are **flagged, never merged**.

### n8n setup

1. *HTTP Request* node → Method `POST`, URL as above, sign the body with the Code node above and send the three `X-…` headers (store the secret as an n8n credential/env var, never in the workflow JSON).
2. Body: JSON, map your scraped fields. Set `Idempotency-Key` to a stable id for the item.
3. Respect each source's terms and robots.txt, and rate limits, in your fetch step. Register the source under **Admin → Sources** so reachability is monitored.

### Quick test

```bash
# dev/test only (INTERNAL_AUTH_MODE=both):
curl -X POST "$APP_URL/api/internal/event-candidates" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" -H "Idempotency-Key: demo-1" \
  -d '{"title":"Example Student Hackathon","sourceUrl":"https://example.org/event"}'
```

## Source monitoring

The worker checks every registered **active** source every 6 hours (robots.txt honoured, SSRF-safe fetch: HTTP(S) only, private/loopback/link-local/metadata addresses blocked, redirects re-validated, timeouts, size cap, 1 request/second). After 3 consecutive failures the source is marked *unreachable* and events that rely on it are flagged **Needs review**.
