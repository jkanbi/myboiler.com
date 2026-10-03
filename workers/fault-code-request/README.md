# Fault-code request collector (myboiler.com)

Cookieless record of missing brand / fault-code requests from `/fault-codes/request/`.

The browser `fetch`es **same-origin** `POST /api/fault-code-request`. This Worker validates a tiny JSON body and appends one event to [Workers KV](https://developers.cloudflare.com/kv/).

**This Worker does not send email.** A separate bot GETs the list endpoint and emails the daily digest to info@arated.com.

No cookies, no `localStorage`, no user id, no IP / UA stored.

## Endpoints

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/api/fault-code-request` | none (same-origin form) | validate, append to KV, `204` |
| `GET` / `HEAD` / `OPTIONS` | `/api/fault-code-request` | none | empty `204` (CORS / health) |
| `GET` | `/api/fault-code-requests?day=YYYY-MM-DD` | `Authorization: Bearer $LIST_SECRET` | `{ day, count, requests }` |

`day` is the Europe/London calendar date. If omitted, today (London) is used.

## Payload

```json
{
  "t": 1727100000000,
  "brand": "Ideal",
  "code": "L2",
  "path": "/fault-codes/request/"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `t` | no | Client unix ms. Out-of-range values are replaced with server time. |
| `brand` | yes | Trimmed, max 80 chars. URLs / markup rejected. |
| `code` | yes | Trimmed, max 40 chars. URLs / markup rejected. |
| `path` | no | `location.pathname` only. Defaults to `/fault-codes/request/`. |

The Worker stores `{ t, brand, code, path }`. Rank frequently requested codes by grouping `brand` + `code` (case-insensitive is fine).

KV mapping:

| Item | Value |
| --- | --- |
| Key | `requests:YYYY-MM-DD` (Europe/London date of receive time) |
| Value | JSON array of events for that day |
| Daily cap | ~2000 events (further POSTs still return `204` and log, but are not stored) |
| TTL | ~40 days (`expirationTtl`) |

## List secret

`LIST_SECRET` is a **wrangler secret** on Worker `fault-code-request`, not a file. Do not commit it.

```bash
# From this directory, after wrangler login:
npx wrangler secret put LIST_SECRET
```

Used as `Authorization: Bearer <LIST_SECRET>` on `GET /api/fault-code-requests`. This Worker has its own secret store; it does not share env vars with `affiliate-click`. You may reuse the same secret *value* if that is easier for the digest bot.

Local: put `LIST_SECRET=...` in `.dev.vars` (gitignored).

## Deploy checklist

Same steps as [`../affiliate-click/README.md`](../affiliate-click/README.md). The KV namespace id lives in `wrangler.toml`.

1. **Cloudflare account** — Workers + Workers KV.
2. **Auth** — `npx wrangler login` locally, or set `CLOUDFLARE_API_TOKEN` in CI. Do not commit tokens.
3. From this directory:

   ```bash
   npm install
   npx wrangler secret put LIST_SECRET
   npx wrangler deploy
   ```

   The `REQUESTS` binding already points at namespace `ad9fa2773ca549479e432b257fad3c48` (the same store as affiliate-click; dashboard title may still be `kv-todo`). Keys are `requests:YYYY-MM-DD`, so they do not collide with `clicks:`. Reuse this id; do not create a second namespace unless you want the two features isolated:

   ```bash
   npx wrangler kv namespace list
   ```

4. **Attach routes** so GitHub Pages is not asked for `/api/fault-code-request*` (Pages would 404). Either uncomment `routes` in `wrangler.toml` and redeploy, or in the dashboard on Worker `fault-code-request`, zone `myboiler.com`:

   - `myboiler.com/api/fault-code-request*`
   - `www.myboiler.com/api/fault-code-request*`
   - `myboiler.com/api/fault-code-requests*`
   - `www.myboiler.com/api/fault-code-requests*`

5. Confirm the Worker answers (empty 204, not a GitHub Pages 404):

   ```bash
   curl -sI https://myboiler.com/api/fault-code-request
   ```

6. Submit the form on `/fault-codes/request/` (or POST a sample body) and watch the tail (below).

Site JS on `/fault-codes/request/` posts to this Worker. A missing route shows an error on the form; it does not affect the rest of the site.

## How to see requests (for the daily digest)

The site does not email anyone. Another bot should `GET` the list and mail info@arated.com.

### 1. Worker Real-time Logs / Tail (live stream)

Dashboard: **Workers & Pages → fault-code-request → Logs → Real-time Logs** (Start tailing).

CLI:

```bash
npx wrangler tail fault-code-request
```

Each form submit is a POST that should return `204` within about a second. The Worker also `console.log`s `{ brand, code, path }` (no IP, UA, or cookies).

### 2. Query KV via `/api/fault-code-requests` (Bearer secret)

```bash
# Today (Europe/London)
curl -sS "https://myboiler.com/api/fault-code-requests" \
  -H "Authorization: Bearer $LIST_SECRET"

# A specific London calendar day
curl -sS "https://myboiler.com/api/fault-code-requests?day=2026-10-03" \
  -H "Authorization: Bearer $LIST_SECRET"
```

Response shape:

```json
{
  "day": "2026-10-03",
  "count": 3,
  "requests": [
    {
      "t": 1727942400000,
      "brand": "Ideal",
      "code": "L2",
      "path": "/fault-codes/request/"
    },
    {
      "t": 1727942460000,
      "brand": "Ideal",
      "code": "L2",
      "path": "/fault-codes/request/"
    },
    {
      "t": 1727942520000,
      "brand": "Viessmann",
      "code": "F4",
      "path": "/fault-codes/request/"
    }
  ]
}
```

`t` is unix milliseconds. Rank by grouping `brand` + `code`:

```bash
curl -sS "https://myboiler.com/api/fault-code-requests?day=2026-10-03" \
  -H "Authorization: Bearer $LIST_SECRET" \
  | jq -r '.requests[] | "\(.brand)\t\(.code)"' | sort | uniq -c | sort -nr
```

Missing / wrong `Authorization` → `401` `{"error":"unauthorized"}`. Do not commit `LIST_SECRET`.

Optional raw KV dump (same namespace, request keys only):

```bash
npx wrangler kv key get "requests:2026-10-03" --binding REQUESTS
```

## Local test

```bash
npm test
# LIST_SECRET=dev-secret in .dev.vars (gitignored)
npx wrangler dev
# in another shell:
curl -i http://127.0.0.1:8787/api/fault-code-request \
  -H 'Content-Type: application/json' \
  --data '{"t":1727942400000,"brand":"Ideal","code":"L2","path":"/fault-codes/request/"}'

curl -sS "http://127.0.0.1:8787/api/fault-code-requests?day=$(date +%F)" \
  -H "Authorization: Bearer dev-secret"
```

## Privacy

- Body is only brand, fault code, page path, and an optional client timestamp.
- `credentials: 'omit'` on `fetch`.
- Worker does not read `CF-Connecting-IP`, `User-Agent`, or write `Set-Cookie`.
- Daily KV values expire after ~40 days.
