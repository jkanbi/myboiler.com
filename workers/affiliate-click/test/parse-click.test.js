import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import worker, {
  MAX_EVENTS_PER_DAY,
  KV_TTL_SECONDS,
  appendClick,
  authorizeList,
  clicksKey,
  destIdFromHref,
  londonDay,
  parseClickBody,
  sanitizeHref,
  timingSafeEqual,
} from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function mockKv(initial = new Map()) {
  const store = new Map(initial);
  const opts = new Map();
  return {
    store,
    opts,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, options) {
      store.set(key, value);
      opts.set(key, options || {});
    },
  };
}

test("sanitizeHref keeps host + path and drops query", () => {
  assert.equal(
    sanitizeHref("https://www.amazon.co.uk/dp/B01LYU50BE?tag=myboiler-com-21"),
    "www.amazon.co.uk/dp/B01LYU50BE"
  );
  assert.equal(
    sanitizeHref("https://www.ebay.co.uk/itm/375957480818?mkcid=1&customid=vaillant-f71"),
    "www.ebay.co.uk/itm/375957480818"
  );
  assert.equal(sanitizeHref("https://evil.example/dp/B01LYU50BE"), "");
  assert.equal(sanitizeHref("javascript:alert(1)"), "");
});

test("destIdFromHref extracts ASIN and eBay item id", () => {
  assert.equal(destIdFromHref("www.amazon.co.uk/dp/B01LYU50BE", "amazon"), "B01LYU50BE");
  assert.equal(destIdFromHref("www.ebay.co.uk/itm/375957480818", "ebay"), "375957480818");
  assert.equal(destIdFromHref("www.ebay.co.uk/itm/some-title/375957480818", "ebay"), "375957480818");
});

test("parseClickBody accepts a valid beacon and rejects junk", () => {
  const ok = parseClickBody(
    JSON.stringify({
      t: Date.now(),
      net: "amazon",
      path: "/fault-codes/vaillant-f71-fault-code/",
      href: "www.amazon.co.uk/dp/B01LYU50BE",
      part: "193592",
    })
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.event.net, "amazon");
  assert.equal(ok.event.part, "193592");
  assert.equal(ok.event.dest, "B01LYU50BE");

  assert.equal(parseClickBody("not-json").ok, false);
  assert.equal(parseClickBody(JSON.stringify({ net: "google", path: "/" })).ok, false);
  assert.equal(parseClickBody(JSON.stringify({ net: "amazon", path: "../etc" })).ok, false);
  assert.equal(parseClickBody(JSON.stringify({ net: "amazon", path: "/x?q=1" })).ok, false);
  assert.equal(parseClickBody("x".repeat(3000)).status, 413);
});

test("londonDay is YYYY-MM-DD in Europe/London", () => {
  assert.equal(londonDay(new Date("2026-01-15T23:00:00Z")), "2026-01-15");
  assert.equal(londonDay(new Date("2026-06-15T23:00:00Z")), "2026-06-16");
  assert.equal(clicksKey("2026-09-23"), "clicks:2026-09-23");
});

test("appendClick writes one event to the London day key with TTL", async () => {
  const kv = mockKv();
  const event = {
    t: 1700000000000,
    net: "ebay",
    path: "/fault-codes/vaillant-f71-fault-code/",
    href: "www.ebay.co.uk/itm/375957480818",
    part: "193592",
    dest: "375957480818",
  };
  const now = new Date("2026-09-23T12:00:00Z");
  const result = await appendClick(event, { CLICKS: kv }, now);
  assert.equal(result.stored, true);
  const key = "clicks:2026-09-23";
  const stored = JSON.parse(kv.store.get(key));
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], event);
  assert.equal(kv.opts.get(key).expirationTtl, KV_TTL_SECONDS);
  assert.equal(KV_TTL_SECONDS, 40 * 24 * 60 * 60);

  const skipped = await appendClick(event, {});
  assert.equal(skipped.stored, false);
});

test("appendClick caps at about 2000 events per day", async () => {
  const key = "clicks:2026-09-23";
  const existing = Array.from({ length: MAX_EVENTS_PER_DAY }, (_, i) => ({ t: i }));
  const kv = mockKv([[key, JSON.stringify(existing)]]);
  const result = await appendClick(
    { t: 1, net: "amazon", path: "/", href: "", part: "", dest: "" },
    { CLICKS: kv },
    new Date("2026-09-23T12:00:00Z")
  );
  assert.equal(result.stored, false);
  assert.equal(result.reason, "cap");
  assert.equal(JSON.parse(kv.store.get(key)).length, MAX_EVENTS_PER_DAY);
});

test("timingSafeEqual and authorizeList require a matching Bearer secret", async () => {
  assert.equal(await timingSafeEqual("abc", "abc"), true);
  assert.equal(await timingSafeEqual("abc", "abd"), false);
  assert.equal(await timingSafeEqual("", ""), false);

  const env = { LIST_SECRET: "s3cret" };
  const req = (header) =>
    new Request("https://myboiler.com/api/aff-clicks", {
      headers: header ? { Authorization: header } : {},
    });

  assert.equal(await authorizeList(req("Bearer s3cret"), env), true);
  assert.equal(await authorizeList(req("Bearer wrong"), env), false);
  assert.equal(await authorizeList(req("Bearer"), env), false);
  assert.equal(await authorizeList(req(""), env), false);
  assert.equal(await authorizeList(req("Bearer s3cret"), {}), false);
});

test("fetch accepts POST beacons and writes KV", async () => {
  const kv = mockKv();
  const env = { CLICKS: kv, LIST_SECRET: "s3cret" };
  const post = (path, body, method = "POST", headers = { "Content-Type": "text/plain" }) =>
    worker.fetch(
      new Request("https://myboiler.com" + path, {
        method,
        body,
        headers,
      }),
      env
    );

  const ok = await post(
    "/api/aff-click",
    JSON.stringify({
      t: Date.now(),
      net: "ebay",
      path: "/fault-codes/vaillant-f71-fault-code/",
      href: "www.ebay.co.uk/itm/375957480818",
      part: "193592",
    })
  );
  assert.equal(ok.status, 204);
  const day = londonDay();
  const stored = JSON.parse(kv.store.get(clicksKey(day)));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].dest, "375957480818");

  const options = await post("/api/aff-click", null, "OPTIONS");
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS, GET, HEAD");

  const health = await post("/api/aff-click", null, "GET");
  assert.equal(health.status, 204);

  const bad = await post("/api/aff-click", JSON.stringify({ net: "amazon", path: "nope" }));
  assert.equal(bad.status, 400);
  assert.equal(JSON.parse(kv.store.get(clicksKey(day))).length, 1);

  const missing = await post("/api/other", "{}");
  assert.equal(missing.status, 404);
});

test("GET /api/aff-clicks requires Bearer LIST_SECRET and returns JSON", async () => {
  const day = "2026-09-23";
  const clicks = [
    {
      t: 1700000000000,
      net: "amazon",
      path: "/fault-codes/vaillant-f71-fault-code/",
      href: "www.amazon.co.uk/dp/B01LYU50BE",
      part: "193592",
      dest: "B01LYU50BE",
    },
  ];
  const kv = mockKv([[clicksKey(day), JSON.stringify(clicks)]]);
  const env = { CLICKS: kv, LIST_SECRET: "s3cret" };
  const get = (path, headers = {}) =>
    worker.fetch(new Request("https://myboiler.com" + path, { headers }), env);

  const denied = await get("/api/aff-clicks?day=" + day);
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: "unauthorized" });

  const wrong = await get("/api/aff-clicks?day=" + day, { Authorization: "Bearer nope" });
  assert.equal(wrong.status, 401);

  const listed = await get("/api/aff-clicks?day=" + day, { Authorization: "Bearer s3cret" });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await listed.json(), { day, count: 1, clicks });

  const empty = await get("/api/aff-clicks?day=2026-01-01", { Authorization: "Bearer s3cret" });
  assert.deepEqual(await empty.json(), { day: "2026-01-01", count: 0, clicks: [] });

  const badDay = await get("/api/aff-clicks?day=nope", { Authorization: "Bearer s3cret" });
  assert.equal(badDay.status, 400);

  const method = await worker.fetch(
    new Request("https://myboiler.com/api/aff-clicks", { method: "POST", body: "{}" }),
    env
  );
  assert.equal(method.status, 405);
  assert.deepEqual(await method.json(), { error: "method" });
});

test("F71 Buy links produce a valid beacon the Worker accepts", () => {
  const html = readFileSync(
    join(repoRoot, "fault-codes/vaillant-f71-fault-code/index.html"),
    "utf8"
  );
  const amazon = html.match(/class="amazon-buy" href="([^"]+)"/);
  const ebay = html.match(/class="ebay-buy" href="([^"]+)"/);
  const part = html.match(/<strong>(\d{5,12})<\/strong>/);
  assert.ok(amazon && ebay && part);

  const amazonBody = parseClickBody(
    JSON.stringify({
      t: Date.now(),
      net: "amazon",
      path: "/fault-codes/vaillant-f71-fault-code/",
      href: sanitizeHref(amazon[1].replace(/&amp;/g, "&")),
      part: part[1],
    })
  );
  const ebayBody = parseClickBody(
    JSON.stringify({
      t: Date.now(),
      net: "ebay",
      path: "/fault-codes/vaillant-f71-fault-code/",
      href: sanitizeHref(ebay[1].replace(/&amp;/g, "&")),
      part: part[1],
    })
  );
  assert.equal(amazonBody.ok, true);
  assert.equal(amazonBody.event.dest, "B01LYU50BE");
  assert.equal(ebayBody.ok, true);
  assert.equal(ebayBody.event.dest, "375957480818");
  assert.equal(ebayBody.event.part, "193592");
});
