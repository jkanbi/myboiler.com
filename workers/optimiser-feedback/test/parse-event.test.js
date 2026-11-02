import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {
  MAX_ANON_EVENTS_PER_DAY,
  eventCapKey,
  insertOptimiserEvent,
  londonDay,
  parseOptimiserEventBody,
  purgeKey,
  purgeOldEvents,
} from "../src/lib.js";

function mockWaitUntil() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    },
    async flush() {
      await Promise.all(pending.splice(0));
    },
  };
}

function mockKv(initial = new Map()) {
  const store = new Map(initial);
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

function mockDb() {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        bind(...args) {
          const row = { sql, args };
          return {
            async run() {
              statements.push(row);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function eventRequest(body, origin = "https://myboiler.com", extraHeaders = {}) {
  return new Request("https://myboiler.com/api/optimiser-event", {
    method: "POST",
    headers: {
      Origin: origin,
      "CF-Connecting-IP": "203.0.113.9",
      "User-Agent": "Mozilla/5.0 Test",
      Cookie: "ph_id=should-not-store",
      "CF-IPCountry": "GB",
      ...extraHeaders,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("parseOptimiserEventBody drops unknown fields and keeps allowlisted ones", () => {
  const parsed = parseOptimiserEventBody(JSON.stringify({
    event: "view",
    path: "/boiler-optimiser/",
    utm_source: "newsletter",
    utm_content: "winter-1",
    ip: "9.9.9.9",
    user_agent: "secret-ua",
    distinct_id: "user-1",
    extra: "drop-me",
    country: "GB",
  }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.row.event, "view");
  assert.equal(parsed.row.path, "/boiler-optimiser/");
  assert.equal(parsed.row.utm_source, "newsletter");
  assert.equal(parsed.row.utm_content, "winter-1");
  assert.equal(parsed.row.ip, undefined);
  assert.equal(parsed.row.user_agent, undefined);
  assert.equal(parsed.row.distinct_id, undefined);
  assert.equal(parsed.row.extra, undefined);
  assert.equal(parsed.row.country, undefined);
});

test("parseOptimiserEventBody rejects unknown events, bad paths, and out-of-range values", () => {
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "click", path: "/boiler-optimiser/" })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "view", path: "/advice/" })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "view", path: "/boiler-optimiser/?q=1" })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "step", path: "/boiler-optimiser/", step: 11 })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "step", path: "/boiler-optimiser/", step: 1.5 })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "turned_down", from_flow: 20 })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "turned_down", set_flow: 91 })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "turned_down", unit_rate: 201 })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "turned_down", space_kwh: -1 })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "turned_down", is_test: 2 })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "did_it_work", answer: "maybe" })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "view", path: "/boiler-optimiser/", utm_source: "bad source" })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "brand", brand: "Worcester Bosch" })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({ event: "brand", brand: "x".repeat(41) })).ok, false);

  const okStep = parseOptimiserEventBody(JSON.stringify({
    event: "step",
    step: 4,
    path: "/boiler-optimiser/",
    utm_source: "ad.x",
  }));
  assert.equal(okStep.ok, true);
  assert.equal(okStep.row.step, 4);
  assert.equal(okStep.row.utm_source, "ad.x");

  const okDown = parseOptimiserEventBody(JSON.stringify({
    event: "turned_down",
    brand: "glow-worm",
    from_flow: 75,
    set_flow: 55,
    space_kwh: 9000,
    annual_kwh: 12000,
    unit_rate: 7.97,
    system: "combi",
    boiler_type: "condensing",
    saving_kwh: 800,
    saving_gbp: 63.5,
    is_test: 0,
  }));
  assert.equal(okDown.ok, true);
  assert.equal(okDown.row.brand, "glow-worm");
  assert.equal(okDown.row.set_flow, 55);
  assert.equal(okDown.row.is_test, 0);
});

test("POST /api/optimiser-event rejects a bad origin", async () => {
  const env = { REQUESTS: mockKv(), DB: mockDb() };
  const res = await worker.fetch(
    eventRequest({ event: "view", path: "/boiler-optimiser/" }, "https://evil.example"),
    env
  );
  assert.equal(res.status, 403);
  assert.equal(env.DB.statements.length, 0);
});

test("POST /api/optimiser-event stores allowlisted fields and never stores IP or request identity", async () => {
  const env = { REQUESTS: mockKv(), DB: mockDb() };
  const res = await worker.fetch(
    eventRequest({
      event: "view",
      path: "/boiler-optimiser/",
      utm_source: "newsletter",
      ip: "9.9.9.9",
      user_agent: "secret-ua",
      distinct_id: "user-1",
      cf_connecting_ip: "203.0.113.9",
    }),
    env
  );
  assert.equal(res.status, 204);
  assert.equal(env.DB.statements.length, 1);
  const inserted = env.DB.statements[0];
  assert.match(inserted.sql, /INSERT INTO optimiser_events/);
  assert.doesNotMatch(inserted.sql, /ip|user_agent|cookie|country|cf-connecting|distinct/i);
  const dumped = JSON.stringify(inserted.args);
  assert.equal(dumped.includes("203.0.113.9"), false);
  assert.equal(dumped.includes("9.9.9.9"), false);
  assert.equal(dumped.includes("secret-ua"), false);
  assert.equal(dumped.includes("user-1"), false);
  assert.equal(dumped.includes("should-not-store"), false);
  assert.equal(dumped.includes("Mozilla/5.0"), false);
  assert.equal(inserted.args[2], "view");
  assert.equal(inserted.args[3], "/boiler-optimiser/");
  assert.equal(inserted.args[4], "newsletter");
  assert.equal(inserted.args[19], "beacon");
});

test("POST /api/optimiser-event rejects out-of-range fields with 400", async () => {
  const env = { REQUESTS: mockKv(), DB: mockDb() };
  const res = await worker.fetch(
    eventRequest({ event: "step", path: "/boiler-optimiser/", step: 0 }),
    env
  );
  assert.equal(res.status, 400);
  assert.equal(env.DB.statements.length, 0);
});

test("POST /api/optimiser-event returns 204 and skips insert when the daily cap is reached", async () => {
  const day = londonDay();
  const kv = mockKv(new Map([[eventCapKey(day), String(MAX_ANON_EVENTS_PER_DAY)]]));
  const env = { REQUESTS: kv, DB: mockDb() };
  const res = await worker.fetch(
    eventRequest({ event: "view", path: "/boiler-optimiser/" }),
    env
  );
  assert.equal(res.status, 204);
  assert.equal(env.DB.statements.length, 0);
});

test("existing feedback POST still stores did_it_work in KV and also writes D1", async () => {
  const env = { REQUESTS: mockKv(), DB: mockDb(), LIST_SECRET: "s3cret" };
  const res = await worker.fetch(
    new Request("https://myboiler.com/api/optimiser-feedback", {
      method: "POST",
      headers: { Origin: "https://myboiler.com" },
      body: JSON.stringify({ type: "did_it_work", answer: "yes", path: "/boiler-optimiser/" }),
    }),
    env
  );
  assert.equal(res.status, 204);
  const stored = JSON.parse(await env.REQUESTS.get("optimiser:" + londonDay()));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].type, "did_it_work");
  assert.equal(env.DB.statements.length, 1);
  assert.equal(env.DB.statements[0].args[2], "did_it_work");
  assert.equal(env.DB.statements[0].args[17], "yes");
  assert.equal(env.DB.statements[0].args[19], "feedback");
});

test("insertOptimiserEvent no-ops without a DB binding", async () => {
  const result = await insertOptimiserEvent({ event: "view", path: "/boiler-optimiser/" }, { REQUESTS: mockKv() });
  assert.equal(result.stored, false);
  assert.equal(result.reason, "no-binding");
});

test("purgeOldEvents deletes rows older than 400 days", async () => {
  const env = { DB: mockDb() };
  const now = new Date("2026-11-02T09:28:00Z");
  const result = await purgeOldEvents(env, now);
  assert.equal(result.deleted, true);
  assert.equal(env.DB.statements.length, 1);
  assert.match(env.DB.statements[0].sql, /DELETE FROM optimiser_events WHERE day </);
  const cutoff = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
  assert.equal(result.before, londonDay(cutoff));
});

test("POST /api/optimiser-event purges old rows at most once a day via waitUntil", async () => {
  let releasePurge;
  const purgeGate = new Promise((resolve) => {
    releasePurge = resolve;
  });
  const kv = mockKv();
  const rawGet = kv.get.bind(kv);
  kv.get = async (key) => {
    if (String(key).startsWith("optimiser:purge:")) {
      await purgeGate;
      return rawGet(key);
    }
    return rawGet(key);
  };
  const env = { REQUESTS: kv, DB: mockDb() };
  const ctx = mockWaitUntil();
  const res = await worker.fetch(
    eventRequest({ event: "view", path: "/boiler-optimiser/" }),
    env,
    ctx
  );
  assert.equal(res.status, 204);
  assert.equal(ctx.pending.length, 1);
  assert.equal(env.DB.statements.filter((row) => /INSERT/.test(row.sql)).length, 1);
  assert.equal(env.DB.statements.filter((row) => /DELETE/.test(row.sql)).length, 0);

  releasePurge();
  await ctx.flush();
  const deletes = env.DB.statements.filter((row) => /DELETE/.test(row.sql));
  assert.equal(deletes.length, 1);
  assert.match(deletes[0].sql, /DELETE FROM optimiser_events WHERE day </);
  const day = londonDay();
  assert.equal(await rawGet(purgeKey(day)), "1");

  const ctxAgain = mockWaitUntil();
  const again = await worker.fetch(
    eventRequest({ event: "step", step: 1, path: "/boiler-optimiser/" }),
    env,
    ctxAgain
  );
  assert.equal(again.status, 204);
  await ctxAgain.flush();
  const deletesAfter = env.DB.statements.filter((row) => /DELETE/.test(row.sql));
  assert.equal(deletesAfter.length, 1);
});

test("a failing background purge does not fail POST /api/optimiser-event", async () => {
  const ctx = mockWaitUntil();
  const db = mockDb();
  const rawPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (/DELETE/.test(sql)) throw new Error("d1 down");
    return rawPrepare(sql);
  };
  const env = { REQUESTS: mockKv(), DB: db };
  const res = await worker.fetch(
    eventRequest({ event: "view", path: "/boiler-optimiser/" }),
    env,
    ctx
  );
  assert.equal(res.status, 204);
  await ctx.flush();
  assert.equal(env.DB.statements.filter((row) => /INSERT/.test(row.sql)).length, 1);
  assert.equal(env.DB.statements.filter((row) => /DELETE/.test(row.sql)).length, 0);
});
