import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {
  MAX_ANON_EVENTS_PER_DAY,
  OFGEM_GAS_UNIT_RATE_P,
  arrivalContext,
  insertOptimiserEvent,
  londonDay,
  parseOptimiserEventBody,
  purgeOldEvents,
  resetIsolateState,
  seedIsolateEventCount,
} from "../src/lib.js";

beforeEach(() => {
  resetIsolateState();
});

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
  const calls = { get: [], put: [] };
  return {
    store,
    calls,
    async get(key) {
      calls.get.push(key);
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, opts) {
      calls.put.push({ key, value, opts });
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
            async all() {
              statements.push(row);
              return { results: [] };
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
  assert.equal(okDown.row.unit_rate, 7.97);
  assert.equal(okDown.row.saving_gbp, 63.5);
  assert.equal(okDown.row.is_test, 0);
});

test("parseOptimiserEventBody defaults blank or sub-1p unit_rate to the Ofgem gas rate and recomputes saving_gbp", () => {
  const expectedGbp = Math.round(800 * OFGEM_GAS_UNIT_RATE_P) / 100;

  const missing = parseOptimiserEventBody(JSON.stringify({
    event: "turned_down",
    saving_kwh: 800,
    saving_gbp: 1.23,
  }));
  assert.equal(missing.ok, true);
  assert.equal(missing.row.unit_rate, OFGEM_GAS_UNIT_RATE_P);
  assert.equal(missing.row.saving_gbp, expectedGbp);

  const zero = parseOptimiserEventBody(JSON.stringify({
    event: "turned_down",
    unit_rate: 0,
    saving_kwh: 800,
    saving_gbp: 99,
  }));
  assert.equal(zero.ok, true);
  assert.equal(zero.row.unit_rate, OFGEM_GAS_UNIT_RATE_P);
  assert.equal(zero.row.saving_gbp, expectedGbp);

  const poundsTypo = parseOptimiserEventBody(JSON.stringify({
    event: "turned_down",
    unit_rate: 0.06,
    saving_kwh: 800,
    saving_gbp: 0.48,
  }));
  assert.equal(poundsTypo.ok, true);
  assert.equal(poundsTypo.row.unit_rate, OFGEM_GAS_UNIT_RATE_P);
  assert.equal(poundsTypo.row.saving_gbp, expectedGbp);

  const kept = parseOptimiserEventBody(JSON.stringify({
    event: "turned_down",
    unit_rate: 6.5,
    saving_kwh: 800,
    saving_gbp: 52,
  }));
  assert.equal(kept.ok, true);
  assert.equal(kept.row.unit_rate, 6.5);
  assert.equal(kept.row.saving_gbp, 52);

  const atOne = parseOptimiserEventBody(JSON.stringify({
    event: "turned_down",
    unit_rate: 1,
    saving_kwh: 800,
    saving_gbp: 8,
  }));
  assert.equal(atOne.ok, true);
  assert.equal(atOne.row.unit_rate, 1);
  assert.equal(atOne.row.saving_gbp, 8);
});

test("arrivalContext reads utm_source, brand and system from a same-origin Referer", () => {
  const manuals = arrivalContext(new Request("https://myboiler.com/api/optimiser-event", {
    headers: {
      Referer: "https://www.myboiler.com/boiler-optimiser/?utm_source=boilermanuals&system=combi&brand=worcester-bosch",
    },
  }));
  assert.equal(manuals.arrival_src, "boilermanuals");
  assert.equal(manuals.pre_brand, "worcester");
  assert.equal(manuals.pre_system, "combi");

  const glow = arrivalContext(new Request("https://myboiler.com/api/optimiser-event", {
    headers: {
      Referer: "https://myboiler.com/boiler-optimiser/?utm_source=www.boilermanuals.com&brand=glowworm&system=non-condensing",
    },
  }));
  assert.equal(glow.arrival_src, "boilermanuals");
  assert.equal(glow.pre_brand, "glow-worm");
  assert.equal(glow.pre_system, "standard");

  const newsletter = arrivalContext(new Request("https://myboiler.com/api/optimiser-event", {
    headers: { Referer: "https://myboiler.com/boiler-optimiser/?utm_source=newsletter" },
  }));
  assert.equal(newsletter.arrival_src, "newsletter");
  assert.equal(newsletter.pre_brand, undefined);
  assert.equal(newsletter.pre_system, undefined);

  const refFallback = arrivalContext(new Request("https://myboiler.com/api/optimiser-event", {
    headers: { Referer: "https://myboiler.com/boiler-optimiser/?ref=partner_x&system=system" },
  }));
  assert.equal(refFallback.arrival_src, "partner_x");
  assert.equal(refFallback.pre_system, "system");

  const foreign = arrivalContext(new Request("https://myboiler.com/api/optimiser-event", {
    headers: {
      Referer: "https://evil.example/boiler-optimiser/?utm_source=boilermanuals&brand=worcester&system=combi",
    },
  }));
  assert.deepEqual(foreign, {});
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
  const kv = mockKv();
  const env = { REQUESTS: kv, DB: mockDb() };
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
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
});

test("POST /api/optimiser-event stores the Ofgem gas-rate default when unit_rate is blank or under 1p", async () => {
  const env = { REQUESTS: mockKv(), DB: mockDb() };
  const expectedGbp = Math.round(800 * OFGEM_GAS_UNIT_RATE_P) / 100;
  const res = await worker.fetch(
    eventRequest({
      event: "turned_down",
      brand: "ideal",
      from_flow: 75,
      set_flow: 55,
      saving_kwh: 800,
      saving_gbp: 0.48,
      unit_rate: 0.06,
    }),
    env
  );
  assert.equal(res.status, 204);
  assert.equal(env.DB.statements.length, 1);
  assert.equal(env.DB.statements[0].args[12], OFGEM_GAS_UNIT_RATE_P);
  assert.equal(env.DB.statements[0].args[15], 800);
  assert.equal(env.DB.statements[0].args[16], expectedGbp);
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

test("POST /api/optimiser-event returns 204 and skips insert when the isolate daily cap is reached", async () => {
  seedIsolateEventCount(MAX_ANON_EVENTS_PER_DAY);
  const kv = mockKv();
  const env = { REQUESTS: kv, DB: mockDb() };
  const res = await worker.fetch(
    eventRequest({ event: "view", path: "/boiler-optimiser/" }),
    env
  );
  assert.equal(res.status, 204);
  assert.equal(env.DB.statements.length, 0);
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
});

test("POST /api/optimiser-event does not get or put KV on the hot path", async () => {
  const kv = mockKv();
  const env = { REQUESTS: kv, DB: mockDb() };
  const ctx = mockWaitUntil();
  const res = await worker.fetch(
    eventRequest({ event: "view", path: "/boiler-optimiser/" }),
    env,
    ctx
  );
  assert.equal(res.status, 204);
  await ctx.flush();
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
  assert.equal(env.DB.statements.filter((row) => /INSERT/.test(row.sql)).length, 1);
});

test("existing feedback POST still stores did_it_work in D1 and also writes optimiser_events", async () => {
  const kv = mockKv();
  const env = { REQUESTS: kv, DB: mockDb(), LIST_SECRET: "s3cret" };
  const res = await worker.fetch(
    new Request("https://myboiler.com/api/optimiser-feedback", {
      method: "POST",
      headers: { Origin: "https://myboiler.com" },
      body: JSON.stringify({ type: "did_it_work", answer: "yes", path: "/boiler-optimiser/" }),
    }),
    env
  );
  assert.equal(res.status, 204);
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
  const feedbackInsert = env.DB.statements.find((row) => /INSERT INTO optimiser_feedback/.test(row.sql));
  const eventInsert = env.DB.statements.find((row) => /INSERT INTO optimiser_events/.test(row.sql));
  assert.ok(feedbackInsert);
  assert.equal(feedbackInsert.args[3], "did_it_work");
  assert.equal(feedbackInsert.args[4], "yes");
  assert.ok(eventInsert);
  assert.equal(eventInsert.args[2], "did_it_work");
  assert.equal(eventInsert.args[17], "yes");
  assert.equal(eventInsert.args[19], "feedback");
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

test("POST /api/optimiser-event purges old rows at most once a day per isolate via waitUntil", async () => {
  let releasePurge;
  const purgeGate = new Promise((resolve) => {
    releasePurge = resolve;
  });
  const kv = mockKv();
  const db = mockDb();
  const rawPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = rawPrepare(sql);
    if (!/DELETE/.test(sql)) return stmt;
    return {
      bind(...args) {
        const bound = stmt.bind(...args);
        return {
          async run() {
            await purgeGate;
            return bound.run();
          },
          async all() {
            await purgeGate;
            return bound.all();
          },
        };
      },
    };
  };
  const env = { REQUESTS: kv, DB: db };
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
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);

  const ctxAgain = mockWaitUntil();
  const again = await worker.fetch(
    eventRequest({ event: "step", step: 1, path: "/boiler-optimiser/" }),
    env,
    ctxAgain
  );
  assert.equal(again.status, 204);
  assert.equal(ctxAgain.pending.length, 0);
  await ctxAgain.flush();
  const deletesAfter = env.DB.statements.filter((row) => /DELETE/.test(row.sql));
  assert.equal(deletesAfter.length, 1);
});

test("GET /api/optimiser-event does not run the daily purge", async () => {
  const env = { REQUESTS: mockKv(), DB: mockDb() };
  const ctx = mockWaitUntil();
  const res = await worker.fetch(
    new Request("https://myboiler.com/api/optimiser-event", {
      method: "GET",
      headers: { Origin: "https://myboiler.com" },
    }),
    env,
    ctx
  );
  assert.equal(res.status, 204);
  assert.equal(ctx.pending.length, 0);
  assert.equal(env.DB.statements.length, 0);
});

test("a failing background purge does not fail POST /api/optimiser-event", async () => {
  const ctx = mockWaitUntil();
  const db = mockDb();
  const rawPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (/DELETE/.test(sql)) throw new Error("d1 down");
    return rawPrepare(sql);
  };
  const kv = mockKv();
  const env = { REQUESTS: kv, DB: db };
  const res = await worker.fetch(
    eventRequest({ event: "view", path: "/boiler-optimiser/" }),
    env,
    ctx
  );
  assert.equal(res.status, 204);
  await ctx.flush();
  assert.equal(env.DB.statements.filter((row) => /INSERT/.test(row.sql)).length, 1);
  assert.equal(env.DB.statements.filter((row) => /DELETE/.test(row.sql)).length, 0);
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
});

test("POST /api/optimiser-event records arrival context and marks preselected steps and brands", async () => {
  const env = { REQUESTS: mockKv(), DB: mockDb() };
  const referer =
    "https://myboiler.com/boiler-optimiser/?utm_source=boilermanuals&system=combi&brand=worcester-bosch";

  const step1 = await worker.fetch(
    eventRequest(
      { event: "step", step: 1, path: "/boiler-optimiser/" },
      "https://myboiler.com",
      { Referer: referer }
    ),
    env
  );
  assert.equal(step1.status, 204);

  const step3 = await worker.fetch(
    eventRequest(
      { event: "step", step: 3, path: "/boiler-optimiser/" },
      "https://myboiler.com",
      { Referer: referer }
    ),
    env
  );
  assert.equal(step3.status, 204);

  const brandMatch = await worker.fetch(
    eventRequest(
      { event: "brand", brand: "worcester" },
      "https://myboiler.com",
      { Referer: referer }
    ),
    env
  );
  assert.equal(brandMatch.status, 204);

  const brandOther = await worker.fetch(
    eventRequest(
      { event: "brand", brand: "vaillant" },
      "https://myboiler.com",
      { Referer: referer }
    ),
    env
  );
  assert.equal(brandOther.status, 204);

  const inserts = env.DB.statements.filter((row) => /INSERT INTO optimiser_events/.test(row.sql));
  assert.equal(inserts.length, 4);

  const step1Row = inserts[0].args;
  assert.equal(step1Row[2], "step");
  assert.equal(step1Row[6], 1);
  assert.equal(step1Row[22], "boilermanuals");
  assert.equal(step1Row[23], "worcester");
  assert.equal(step1Row[24], "combi");
  assert.equal(step1Row[25], 1);

  const step3Row = inserts[1].args;
  assert.equal(step3Row[6], 3);
  assert.equal(step3Row[22], "boilermanuals");
  assert.equal(step3Row[25], 0);

  const brandMatchRow = inserts[2].args;
  assert.equal(brandMatchRow[2], "brand");
  assert.equal(brandMatchRow[7], "worcester");
  assert.equal(brandMatchRow[23], "worcester");
  assert.equal(brandMatchRow[25], 1);

  const brandOtherRow = inserts[3].args;
  assert.equal(brandOtherRow[7], "vaillant");
  assert.equal(brandOtherRow[23], "worcester");
  assert.equal(brandOtherRow[25], 0);
});

test("parseOptimiserEventBody accepts guide_click and rejects bad target or outbound", () => {
  const okPath = parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "vaillant",
    target: "/vaillant/how-to-adjust-the-flow-temperature/",
    outbound: 0,
    path: "/boiler-optimiser/",
  }));
  assert.equal(okPath.ok, true);
  assert.equal(okPath.row.event, "guide_click");
  assert.equal(okPath.row.brand, "vaillant");
  assert.equal(okPath.row.target, "/vaillant/how-to-adjust-the-flow-temperature/");
  assert.equal(okPath.row.outbound, 0);

  const okOut = parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "glow-worm",
    target: "https://boilermanuals.com/brands/glow-worm.html",
    outbound: 1,
  }));
  assert.equal(okOut.ok, true);
  assert.equal(okOut.row.outbound, 1);
  assert.equal(okOut.row.target, "https://boilermanuals.com/brands/glow-worm.html");

  const okWww = parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "ideal",
    target: "https://www.boilermanuals.com/brands/ideal.html",
    outbound: 1,
  }));
  assert.equal(okWww.ok, true);

  assert.equal(parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "vaillant",
    target: "https://evil.example/x",
    outbound: 0,
  })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "vaillant",
    target: "http://boilermanuals.com/brands/vaillant.html",
    outbound: 1,
  })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "vaillant",
    target: "//boilermanuals.com/brands/vaillant.html",
    outbound: 1,
  })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "vaillant",
    target: "/vaillant/how-to-adjust-the-flow-temperature/?q=1",
    outbound: 0,
  })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "vaillant",
    target: "/vaillant/x",
    outbound: 2,
  })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "vaillant",
    outbound: 0,
  })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    target: "/vaillant/x",
    outbound: 0,
  })).ok, false);
  assert.equal(parseOptimiserEventBody(JSON.stringify({
    event: "guide_click",
    brand: "vaillant",
    target: "x".repeat(201),
    outbound: 0,
  })).ok, false);
});

test("POST /api/optimiser-event stores a guide_click and rejects a bad target", async () => {
  const env = { REQUESTS: mockKv(), DB: mockDb() };
  const ok = await worker.fetch(
    eventRequest({
      event: "guide_click",
      brand: "worcester",
      target: "/worcester-bosch/how-to-adjust-the-flow-temperature/",
      outbound: 0,
      path: "/boiler-optimiser/",
    }),
    env
  );
  assert.equal(ok.status, 204);
  assert.equal(env.DB.statements.length, 1);
  assert.equal(env.DB.statements[0].args[2], "guide_click");
  assert.equal(env.DB.statements[0].args[7], "worcester");
  assert.equal(env.DB.statements[0].args[19], "beacon");
  assert.equal(env.DB.statements[0].args[20], "/worcester-bosch/how-to-adjust-the-flow-temperature/");
  assert.equal(env.DB.statements[0].args[21], 0);

  const bad = await worker.fetch(
    eventRequest({
      event: "guide_click",
      brand: "worcester",
      target: "https://example.com/nope",
      outbound: 0,
    }),
    env
  );
  assert.equal(bad.status, 400);
  assert.equal(env.DB.statements.length, 1);
});
