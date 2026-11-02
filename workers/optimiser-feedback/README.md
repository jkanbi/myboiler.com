# Boiler Optimiser feedback collector (myboiler.com)

Cookieless record of anonymous Boiler Optimiser “turned it down” and “did it work?” answers, plus allowlisted usage events for the stats dashboard.

The green confirm box on `/boiler-optimiser/` posts `navigator.sendBeacon` (or `fetch` + `keepalive`) to **same-origin** `POST /api/optimiser-feedback`. The same page also posts usage events to `POST /api/optimiser-event` whether or not cookies are accepted. No cookies, no `localStorage` on this Worker, no user id, no IP / UA stored. PostHog events stay on the consent-gated client path.

## Endpoints

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/api/optimiser-feedback` | none (same-origin beacon) | validate, append to KV, `204` |
| `GET` / `HEAD` / `OPTIONS` | `/api/optimiser-feedback` | none | empty `204` (CORS / health) |
| `GET` | `/api/optimiser-feedbacks?day=YYYY-MM-DD` | `Authorization: Bearer $LIST_SECRET` | `{ day, count, events }` |
| `POST` | `/api/optimiser-event` | Origin `https://myboiler.com` or `https://www.myboiler.com` | validate, insert D1, `204` |
| `GET` / `HEAD` / `OPTIONS` | `/api/optimiser-event` | none | empty `204` (CORS / health) |

`day` is the Europe/London calendar date. If omitted, today (London) is used.

## Payload

Turned the flow down:

```json
{
  "t": 1727100000000,
  "type": "turned_down",
  "path": "/boiler-optimiser/",
  "brand": "worcester",
  "from_flow": 75,
  "set_flow": 55
}
```

Did it work:

```json
{
  "t": 1727100000000,
  "type": "did_it_work",
  "answer": "yes",
  "path": "/boiler-optimiser/",
  "brand": "worcester",
  "from_flow": 75,
  "set_flow": 55
}
```

`answer` must be `yes`, `cool`, or `not_yet` when `type` is `did_it_work`. Brand and flow figures are optional.

A `did_it_work` feedback POST is also written to D1 (`source = feedback`) so the stats dashboard can see answers that arrived on the original endpoint.

KV mapping:

| Item | Value |
| --- | --- |
| Key | `optimiser:YYYY-MM-DD` (Europe/London date of receive time) |
| Value | JSON array of events for that day |
| Daily cap | ~2000 events |
| TTL | ~40 days (`expirationTtl`) |

## Anonymous events (`POST /api/optimiser-event`)

JSON body, max 2 KB. Origin must be `https://myboiler.com` or `https://www.myboiler.com`. Unknown fields are dropped. Out-of-range values return `400`. Over the daily cap still returns `204` (event is not stored).

Allowlisted `event` values:

| Event | Fields |
| --- | --- |
| `view` | `path` (must start `/boiler-optimiser`), `utm_source`, `utm_content` |
| `step` | `step` (int 1–10), `path` |
| `brand` | `brand` |
| `turned_down` | `brand`, `from_flow`, `set_flow` (30–90), `space_kwh`, `annual_kwh`, `unit_rate`, `system`, `boiler_type`, `saving_kwh`, `saving_gbp`, `is_test` |
| `did_it_work` | `answer` in `{yes, cool, not_yet}` |

`utm_source` / `utm_content` may be sent on any event (each ≤64 chars, `[A-Za-z0-9_.-]` only). Rows go into D1 table `optimiser_events`. Timestamp is rounded to the minute. On an `/api/optimiser-event` request the Worker deletes rows older than 400 days (~13 months) at most once a day (`optimiser:purge:YYYY-MM-DD`, via `ctx.waitUntil` so the response is not delayed).

Daily cap: KV key `optimiser-events:YYYY-MM-DD`, ~5,000 events.

## Deploy

Same steps as [`../fault-code-request/README.md`](../fault-code-request/README.md). Reuse KV namespace `ad9fa2773ca549479e432b257fad3c48`. D1 database `optimiser-events` (`a0a5fbcd-422d-4327-a0bb-eb2422ffce0b`), binding `DB`. Schema is already applied — do not run migrations. Attach routes:

- `myboiler.com/api/optimiser-feedback*`
- `www.myboiler.com/api/optimiser-feedback*`
- `myboiler.com/api/optimiser-feedbacks*`
- `www.myboiler.com/api/optimiser-feedbacks*`
- `myboiler.com/api/optimiser-event*`
- `www.myboiler.com/api/optimiser-event*`
