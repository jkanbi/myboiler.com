import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import worker, {
  MAX_EVENTS_PER_DAY,
  KV_TTL_SECONDS,
  appendRequest,
  authorizeList,
  londonDay,
  parseRequestBody,
  requestsKey,
  sanitizeField,
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

test("sanitizeField trims and rejects URLs or markup", () => {
  assert.equal(sanitizeField("  Ideal  ", 80), "Ideal");
  assert.equal(sanitizeField("https://evil.example", 80), "");
  assert.equal(sanitizeField("<script>x</script>", 80), "");
  assert.equal(sanitizeField("x".repeat(81), 80), "");
});

test("parseRequestBody accepts a valid form post and rejects junk", () => {
  const ok = parseRequestBody(
    JSON.stringify({
      t: Date.now(),
      brand: "Ideal",
      code: "L2",
      path: "/fault-codes/request/",
    })
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.event.brand, "Ideal");
  assert.equal(ok.event.code, "L2");
  assert.equal(ok.event.path, "/fault-codes/request/");

  const noPath = parseRequestBody(JSON.stringify({ brand: "Vaillant", code: "F28" }));
  assert.equal(noPath.ok, true);
  assert.equal(noPath.event.path, "/fault-codes/request/");

  assert.equal(parseRequestBody("not-json").ok, false);
  assert.equal(parseRequestBody(JSON.stringify({ brand: "Ideal" })).ok, false);
  assert.equal(parseRequestBody(JSON.stringify({ brand: "Ideal", code: "L2", path: "../etc" })).ok, false);
  assert.equal(parseRequestBody(JSON.stringify({ brand: "Ideal", code: "L2", path: "/x?q=1" })).ok, false);
  assert.equal(parseRequestBody(JSON.stringify({ brand: "https://x", code: "L2" })).ok, false);
  assert.equal(parseRequestBody("x".repeat(3000)).status, 413);
});

test("londonDay is YYYY-MM-DD in Europe/London", () => {
  assert.equal(londonDay(new Date("2026-01-15T23:00:00Z")), "2026-01-15");
  assert.equal(londonDay(new Date("2026-06-15T23:00:00Z")), "2026-06-16");
  assert.equal(requestsKey("2026-10-03"), "requests:2026-10-03");
});

test("appendRequest writes one event to the London day key with TTL", async () => {
  const kv = mockKv();
  const event = {
    t: 1700000000000,
    brand: "Ideal",
    code: "L2",
    path: "/fault-codes/request/",
  };
  const now = new Date("2026-10-03T12:00:00Z");
  const result = await appendRequest(event, { REQUESTS: kv }, now);
  assert.equal(result.stored, true);
  const key = "requests:2026-10-03";
  const stored = JSON.parse(kv.store.get(key));
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], event);
  assert.equal(kv.opts.get(key).expirationTtl, KV_TTL_SECONDS);
  assert.equal(KV_TTL_SECONDS, 40 * 24 * 60 * 60);

  const skipped = await appendRequest(event, {});
  assert.equal(skipped.stored, false);
});

test("appendRequest caps at about 2000 events per day", async () => {
  const key = "requests:2026-10-03";
  const existing = Array.from({ length: MAX_EVENTS_PER_DAY }, (_, i) => ({ t: i }));
  const kv = mockKv([[key, JSON.stringify(existing)]]);
  const result = await appendRequest(
    { t: 1, brand: "Ideal", code: "L2", path: "/fault-codes/request/" },
    { REQUESTS: kv },
    new Date("2026-10-03T12:00:00Z")
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
    new Request("https://myboiler.com/api/fault-code-requests", {
      headers: header ? { Authorization: header } : {},
    });

  assert.equal(await authorizeList(req("Bearer s3cret"), env), true);
  assert.equal(await authorizeList(req("Bearer wrong"), env), false);
  assert.equal(await authorizeList(req("Bearer"), env), false);
  assert.equal(await authorizeList(req(""), env), false);
  assert.equal(await authorizeList(req("Bearer s3cret"), {}), false);
});

test("fetch accepts POST submissions and writes KV", async () => {
  const kv = mockKv();
  const env = { REQUESTS: kv, LIST_SECRET: "s3cret" };
  const post = (path, body, method = "POST", headers = { "Content-Type": "application/json" }) =>
    worker.fetch(
      new Request("https://myboiler.com" + path, {
        method,
        body,
        headers,
      }),
      env
    );

  const ok = await post(
    "/api/fault-code-request",
    JSON.stringify({
      t: Date.now(),
      brand: "Viessmann",
      code: "F4",
      path: "/fault-codes/request/",
    })
  );
  assert.equal(ok.status, 204);
  const day = londonDay();
  const stored = JSON.parse(kv.store.get(requestsKey(day)));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].brand, "Viessmann");
  assert.equal(stored[0].code, "F4");

  const options = await post("/api/fault-code-request", null, "OPTIONS");
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS, GET, HEAD");

  const health = await post("/api/fault-code-request", null, "GET");
  assert.equal(health.status, 204);

  const bad = await post("/api/fault-code-request", JSON.stringify({ brand: "Ideal" }));
  assert.equal(bad.status, 400);
  assert.equal(JSON.parse(kv.store.get(requestsKey(day))).length, 1);

  const missing = await post("/api/other", "{}");
  assert.equal(missing.status, 404);
});

test("GET /api/fault-code-requests requires Bearer LIST_SECRET and returns JSON", async () => {
  const day = "2026-10-03";
  const requests = [
    {
      t: 1700000000000,
      brand: "Ideal",
      code: "L2",
      path: "/fault-codes/request/",
    },
    {
      t: 1700000001000,
      brand: "Ideal",
      code: "L2",
      path: "/fault-codes/request/",
    },
    {
      t: 1700000002000,
      brand: "Viessmann",
      code: "F4",
      path: "/fault-codes/request/",
    },
  ];
  const kv = mockKv([[requestsKey(day), JSON.stringify(requests)]]);
  const env = { REQUESTS: kv, LIST_SECRET: "s3cret" };
  const get = (path, headers = {}) =>
    worker.fetch(new Request("https://myboiler.com" + path, { headers }), env);

  const denied = await get("/api/fault-code-requests?day=" + day);
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: "unauthorized" });

  const wrong = await get("/api/fault-code-requests?day=" + day, { Authorization: "Bearer nope" });
  assert.equal(wrong.status, 401);

  const listed = await get("/api/fault-code-requests?day=" + day, { Authorization: "Bearer s3cret" });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("Cache-Control"), "no-store");
  const body = await listed.json();
  assert.deepEqual(body, { day, count: 3, requests });
  const ranked = body.requests.reduce((acc, item) => {
    const key = item.brand + "\t" + item.code;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  assert.equal(ranked["Ideal\tL2"], 2);
  assert.equal(ranked["Viessmann\tF4"], 1);

  const empty = await get("/api/fault-code-requests?day=2026-01-01", { Authorization: "Bearer s3cret" });
  assert.deepEqual(await empty.json(), { day: "2026-01-01", count: 0, requests: [] });

  const badDay = await get("/api/fault-code-requests?day=nope", { Authorization: "Bearer s3cret" });
  assert.equal(badDay.status, 400);

  const method = await worker.fetch(
    new Request("https://myboiler.com/api/fault-code-requests", { method: "POST", body: "{}" }),
    env
  );
  assert.equal(method.status, 405);
  assert.deepEqual(await method.json(), { error: "method" });
});

test("request page has a brand + code form posting to the collect route", () => {
  const html = readFileSync(join(repoRoot, "fault-codes/request/index.html"), "utf8");
  assert.match(html, /id="fault-code-request-form"/);
  assert.match(html, /id="req-brand-input"/);
  assert.match(html, /id="req-code-input"/);
  assert.match(html, /\/api\/fault-code-request/);
  assert.match(html, /\/quote\/\?need=repair/);
  assert.doesNotMatch(html, /HubSpot|hs-form|hubspot/i);
});
