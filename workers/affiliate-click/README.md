# Affiliate click collector (myboiler.com)

Cookieless, near-realtime record of Amazon / eBay **Buy** link clicks on the static GitHub Pages site.

The browser fires `navigator.sendBeacon` (or `fetch` + `keepalive`) to **same-origin** `/api/aff-click`. This Worker validates a tiny JSON body and writes one [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) data point. Cloudflare Web Analytics is unchanged and is not used for these events (it has no custom events).

No cookies, no `localStorage`, no user id, no IP / UA stored.

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

Analytics Engine mapping (positional — keep this order):

| AE field | Meaning |
| --- | --- |
| `index1` | network (`amazon` / `ebay`) |
| `blob1` | network |
| `blob2` | page path |
| `blob3` | part number (empty string if unknown) |
| `blob4` | destination id (ASIN or eBay item id) |
| `blob5` | destination host + pathname |
| `double1` | client timestamp (unix ms) |
| `timestamp` | Worker receive time (added by AE) |

## Deploy checklist

Nothing in this folder is a secret. Bindings and the dataset name live in `wrangler.toml`.

1. **Cloudflare account** — Workers + Analytics Engine enabled (AE is created on first write; you do not pre-create the table in the dashboard).
2. **Auth** — `npx wrangler login` locally, or set `CLOUDFLARE_API_TOKEN` in CI. Do not commit tokens.
3. From this directory:

   ```bash
   npm install
   npx wrangler deploy
   ```

4. **Attach a route** so GitHub Pages is not asked for `/api/aff-click` (Pages would 404). Either uncomment `routes` in `wrangler.toml` and redeploy, or in the dashboard:

   - Worker `affiliate-click`
   - Route: `myboiler.com/api/aff-click*`
   - Optional: `www.myboiler.com/api/aff-click*`
   - Zone: `myboiler.com`

5. Confirm the Worker answers (empty 204, not a GitHub Pages 404):

   ```bash
   curl -sI https://myboiler.com/api/aff-click
   ```

6. Click a Buy link on a fault-code page (or POST a sample body) and watch the tail (below).

Site JS is already in `/js/site-nav.js` (loaded sitewide). It does not wait for this Worker: a missing route only drops the beacon.

## How to see clicks near-realtime

Amazon Associates and eBay EPN dashboards lag (often hours) and are a different pipeline. Use these for **our** click stream.

### 1. Worker Real-time Logs / Tail (live stream)

Dashboard: **Workers & Pages → affiliate-click → Logs → Real-time Logs** (Start tailing).

CLI:

```bash
npx wrangler tail affiliate-click
```

Each Buy click is a POST that should return `204` within about a second. The Worker also `console.log`s `{ net, path, part, dest }` (no IP, UA, or cookies) so the tail is a readable live stream, not just status codes. The HTTP response body stays empty.

### 2. Analytics Engine SQL (recent clicks by path / network / part)

Create an API token with **Account Analytics: Read**. Then:

```bash
# Recent individual clicks (last hour)
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --data "SELECT
    timestamp,
    blob1 AS net,
    blob2 AS path,
    blob3 AS part,
    blob4 AS dest,
    blob5 AS href,
    double1 AS client_ms
  FROM affiliate_clicks
  WHERE timestamp > NOW() - INTERVAL '1' HOUR
  ORDER BY timestamp DESC
  LIMIT 50"

# Counts by page + network
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --data "SELECT
    blob2 AS path,
    blob1 AS net,
    blob3 AS part,
    SUM(_sample_interval) AS clicks
  FROM affiliate_clicks
  WHERE timestamp > NOW() - INTERVAL '1' DAY
  GROUP BY path, net, part
  ORDER BY clicks DESC
  LIMIT 50"
```

AE ingest is typically seconds, not hours. Use `SUM(_sample_interval)` for counts so sampling (if it ever kicks in) is accounted for.

### 3. GraphQL (dashboard API)

Same data, aggregated. Example:

```graphql
query AffiliateClicks($accountTag: string!, $since: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersAnalyticsEngineAdaptiveGroups(
        limit: 50
        filter: { datetime_geq: $since, dataset: "affiliate_clicks" }
        orderBy: [datetime_DESC]
      ) {
        count
        dimensions {
          datetime
          blob1
          blob2
          blob3
          blob4
        }
      }
    }
  }
}
```

POST to `https://api.cloudflare.com/client/v4/graphql` with a Bearer token. Prefer the SQL API for a raw click list.

## Local test

```bash
npm test
npx wrangler dev
# in another shell:
curl -i http://127.0.0.1:8787/api/aff-click \
  -H 'Content-Type: text/plain' \
  --data '{"t":1727100000000,"net":"amazon","path":"/fault-codes/vaillant-f71-fault-code/","href":"www.amazon.co.uk/dp/B01LYU50BE","part":"193592"}'
```

## Privacy

- Beacon body is only network, page path, optional part number, and destination host/path.
- `credentials: 'omit'` on the fallback `fetch`; `sendBeacon` does not attach cookies we set (we set none).
- Worker does not read `CF-Connecting-IP`, `User-Agent`, or write `Set-Cookie`.
