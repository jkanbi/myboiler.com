# Affiliate click collector (myboiler.com)

Cookieless, near-realtime record of Amazon / eBay **Buy** link clicks on the static GitHub Pages site.

The browser fires `navigator.sendBeacon` (or `fetch` + `keepalive`) to **same-origin** `/api/aff-click`. This Worker validates a tiny JSON body and appends one event to [Workers KV](https://developers.cloudflare.com/kv/). Cloudflare Web Analytics is unchanged and is not used for these events (it has no custom events).

**Workers Analytics Engine is not used.** This account does not have Account Analytics Engine (AE SQL) permission, so clicks are stored in KV instead. You do not need the AE permission to deploy or query this Worker.

No cookies, no `localStorage`, no user id, no IP / UA stored.

## Endpoints

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/api/aff-click` | none (same-origin beacon) | validate, append to KV, `204` |
| `GET` / `HEAD` / `OPTIONS` | `/api/aff-click` | none | empty `204` (CORS / health) |
| `GET` | `/api/aff-clicks?day=YYYY-MM-DD` | `Authorization: Bearer $LIST_SECRET` | `{ day, count, clicks }` |

`day` is the Europe/London calendar date. If omitted, today (London) is used.

## Payload

```json
{
  "t": 1727100000000,
  "net": "amazon",
  "path": "/fault-codes/vaillant-f71-fault-code/",
  "href": "www.amazon.co.uk/dp/B01LYU50BE",
  "part": "193592"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `t` | no | Client unix ms. Out-of-range values are replaced with server time. |
| `net` | yes | `amazon` or `ebay` |
| `path` | yes | `location.pathname` only |
| `href` | no | Host + pathname; query string stripped (ASIN / eBay item id stay in the path) |
| `part` | no | Nearby part number from adjacent `<strong>` text |

The Worker stores `{ t, net, path, href, part, dest }` where `dest` is the ASIN or eBay item id derived from `href`.

KV mapping:

| Item | Value |
| --- | --- |
| Key | `clicks:YYYY-MM-DD` (Europe/London date of receive time) |
| Value | JSON array of events for that day |
| Daily cap | ~2000 events (further POSTs still return `204` and log, but are not stored) |
| TTL | ~40 days (`expirationTtl`) |

## Deploy checklist

The KV namespace id lives in `wrangler.toml`. `LIST_SECRET` is a **wrangler secret**, not a file.

1. **Cloudflare account** — Workers + Workers KV. Analytics Engine is **not** required.
2. **Auth** — `npx wrangler login` locally, or set `CLOUDFLARE_API_TOKEN` in CI. Do not commit tokens.
3. From this directory:

   ```bash
   npm install
   npx wrangler secret put LIST_SECRET
   npx wrangler deploy
   ```

   The `CLICKS` binding already points at namespace `ad9fa2773ca549479e432b257fad3c48` (dashboard title may still be `kv-todo`). Reuse it:

   ```bash
   npx wrangler kv namespace list
   ```

4. **Attach routes** so GitHub Pages is not asked for `/api/aff-click*` (Pages would 404). Either uncomment `routes` in `wrangler.toml` and redeploy, or in the dashboard on Worker `affiliate-click`, zone `myboiler.com`:

   - `myboiler.com/api/aff-click*`
   - `www.myboiler.com/api/aff-click*`
   - `myboiler.com/api/aff-clicks*`
   - `www.myboiler.com/api/aff-clicks*`

5. Confirm the Worker answers (empty 204, not a GitHub Pages 404):

   ```bash
   curl -sI https://myboiler.com/api/aff-click
   ```

6. Click a Buy link on a fault-code page (or POST a sample body) and watch the tail (below).

Site JS is already in `/js/site-nav.js` (loaded sitewide). It does not wait for this Worker: a missing route only drops the beacon. Do not change Buy-link HTML or affiliate URLs when updating this Worker.

## How to see clicks near-realtime

Amazon Associates and eBay EPN dashboards lag (often hours) and are a different pipeline. Use these for **our** click stream.

### 1. Worker Real-time Logs / Tail (live stream)

Dashboard: **Workers & Pages → affiliate-click → Logs → Real-time Logs** (Start tailing).

CLI:

```bash
npx wrangler tail affiliate-click
```

Each Buy click is a POST that should return `204` within about a second. The Worker also `console.log`s `{ net, path, part, dest }` (no IP, UA, or cookies) so the tail is a readable live stream, not just status codes. The HTTP response body stays empty.

### 2. Query KV via `/api/aff-clicks` (Bearer secret)

This replaces Analytics Engine SQL. No Account Analytics Engine permission is needed.

```bash
# Today (Europe/London)
curl -sS "https://myboiler.com/api/aff-clicks" \
  -H "Authorization: Bearer $LIST_SECRET"

# A specific London calendar day
curl -sS "https://myboiler.com/api/aff-clicks?day=2026-09-23" \
  -H "Authorization: Bearer $LIST_SECRET"
```

Response shape:

```json
{
  "day": "2026-09-23",
  "count": 1,
  "clicks": [
    {
      "t": 1727100000000,
      "net": "amazon",
      "path": "/fault-codes/vaillant-f71-fault-code/",
      "href": "www.amazon.co.uk/dp/B01LYU50BE",
      "part": "193592",
      "dest": "B01LYU50BE"
    }
  ]
}
```

Missing / wrong `Authorization` → `401` `{"error":"unauthorized"}`. Do not commit `LIST_SECRET`.

Optional raw KV dump (same namespace, same key):

```bash
npx wrangler kv key get "clicks:2026-09-23" --binding CLICKS
```

## Local test

```bash
npm test
# LIST_SECRET=dev-secret in .dev.vars (gitignored)
npx wrangler dev
# in another shell:
curl -i http://127.0.0.1:8787/api/aff-click \
  -H 'Content-Type: text/plain' \
  --data '{"t":1727100000000,"net":"amazon","path":"/fault-codes/vaillant-f71-fault-code/","href":"www.amazon.co.uk/dp/B01LYU50BE","part":"193592"}'

curl -sS "http://127.0.0.1:8787/api/aff-clicks?day=$(date +%F)" \
  -H "Authorization: Bearer dev-secret"
```

## Privacy

- Beacon body is only network, page path, optional part number, and destination host/path.
- `credentials: 'omit'` on the fallback `fetch`; `sendBeacon` does not attach cookies we set (we set none).
- Worker does not read `CF-Connecting-IP`, `User-Agent`, or write `Set-Cookie`.
- Daily KV values expire after ~40 days.
