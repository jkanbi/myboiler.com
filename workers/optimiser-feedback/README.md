# Boiler Optimiser feedback collector (myboiler.com)

Cookieless record of anonymous Boiler Optimiser “turned it down” and “did it work?” answers.

The green confirm box on `/boiler-optimiser/` posts `navigator.sendBeacon` (or `fetch` + `keepalive`) to **same-origin** `POST /api/optimiser-feedback`. No cookies, no `localStorage` on this Worker, no user id, no IP / UA stored. PostHog events stay on the consent-gated client path.

## Endpoints

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/api/optimiser-feedback` | none (same-origin beacon) | validate, append to KV, `204` |
| `GET` / `HEAD` / `OPTIONS` | `/api/optimiser-feedback` | none | empty `204` (CORS / health) |
| `GET` | `/api/optimiser-feedbacks?day=YYYY-MM-DD` | `Authorization: Bearer $LIST_SECRET` | `{ day, count, events }` |

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

KV mapping:

| Item | Value |
| --- | --- |
| Key | `optimiser:YYYY-MM-DD` (Europe/London date of receive time) |
| Value | JSON array of events for that day |
| Daily cap | ~2000 events |
| TTL | ~40 days (`expirationTtl`) |

## Deploy

Same steps as [`../fault-code-request/README.md`](../fault-code-request/README.md). Reuse KV namespace `ad9fa2773ca549479e432b257fad3c48`. Attach routes:

- `myboiler.com/api/optimiser-feedback*`
- `www.myboiler.com/api/optimiser-feedback*`
- `myboiler.com/api/optimiser-feedbacks*`
- `www.myboiler.com/api/optimiser-feedbacks*`
