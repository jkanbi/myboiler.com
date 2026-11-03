import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {
  MAX_EVENTS_PER_DAY,
  appendFeedback,
  feedbackKey,
  londonDay,
  parseFeedbackBody,
  resetIsolateState,
  sanitizeField,
  seedIsolateFeedbackCount,
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
  const feedbackRows = [];
  return {
    statements,
    feedbackRows,
    prepare(sql) {
      return {
        bind(...args) {
          const row = { sql, args };
          return {
            async run() {
              statements.push(row);
              if (/INSERT INTO optimiser_feedback/.test(sql)) {
                feedbackRows.push({
                  t: args[2],
                  type: args[3],
                  answer: args[4],
                  path: args[5],
                  brand: args[6],
                  from_flow: args[7],
                  set_flow: args[8],
                });
              }
              return { success: true };
            },
            async all() {
              statements.push(row);
              if (/SELECT .* FROM optimiser_feedback/.test(sql)) {
                return { results: feedbackRows.slice() };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function feedbackPost(body, headers = { Origin: "https://myboiler.com" }) {
  return new Request("https://myboiler.com/api/optimiser-feedback", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("sanitizeField trims and rejects URLs or markup", () => {
  assert.equal(sanitizeField("  worcester  ", 80), "worcester");
  assert.equal(sanitizeField("https://evil.example", 80), "");
  assert.equal(sanitizeField("<script>x</script>", 80), "");
});

test("parseFeedbackBody accepts turned_down and did_it_work", () => {
  const down = parseFeedbackBody(JSON.stringify({
    t: Date.now(),
    type: "turned_down",
    path: "/boiler-optimiser/",
    brand: "worcester",
    from_flow: 75,
    set_flow: 55,
  }));
  assert.equal(down.ok, true);
  assert.equal(down.event.type, "turned_down");
  assert.equal(down.event.brand, "worcester");
  assert.equal(down.event.from_flow, 75);
  assert.equal(down.event.set_flow, 55);
  assert.equal(down.event.answer, undefined);

  const work = parseFeedbackBody(JSON.stringify({
    type: "did_it_work",
    answer: "yes",
    path: "/boiler-optimiser/",
    brand: "vaillant",
  }));
  assert.equal(work.ok, true);
  assert.equal(work.event.answer, "yes");
  assert.equal(work.event.path, "/boiler-optimiser/");

  assert.equal(parseFeedbackBody(JSON.stringify({ type: "did_it_work" })).ok, false);
  assert.equal(parseFeedbackBody(JSON.stringify({ type: "did_it_work", answer: "maybe" })).ok, false);
  assert.equal(parseFeedbackBody(JSON.stringify({ type: "other" })).ok, false);
  assert.equal(parseFeedbackBody("not-json").ok, false);
  assert.equal(parseFeedbackBody(JSON.stringify({ type: "turned_down", path: "/x?q=1" })).ok, false);

  const capped = parseFeedbackBody(JSON.stringify({
    type: "turned_down",
    path: "/boiler-optimiser/",
    from_flow: 90,
    set_flow: 80,
  }));
  assert.equal(capped.ok, true);
  assert.equal(capped.event.from_flow, 90);
  assert.equal(capped.event.set_flow, undefined);

  const atCap = parseFeedbackBody(JSON.stringify({
    type: "turned_down",
    path: "/boiler-optimiser/",
    from_flow: 90,
    set_flow: 75,
  }));
  assert.equal(atCap.ok, true);
  assert.equal(atCap.event.set_flow, 75);

  const raised = parseFeedbackBody(JSON.stringify({
    type: "turned_down",
    path: "/boiler-optimiser/",
    from_flow: 50,
    set_flow: 60,
  }));
  assert.equal(raised.ok, false);
  assert.equal(raised.status, 400);
});

test("POST /api/optimiser-feedback stores a did_it_work event in D1 with no KV write", async () => {
  const kv = mockKv();
  const db = mockDb();
  const env = { REQUESTS: kv, DB: db, LIST_SECRET: "s3cret" };
  const res = await worker.fetch(
    feedbackPost({ type: "did_it_work", answer: "cool", path: "/boiler-optimiser/" }),
    env
  );
  assert.equal(res.status, 204);
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
  const stored = db.statements.find((row) => /INSERT INTO optimiser_feedback/.test(row.sql));
  assert.ok(stored);
  assert.equal(stored.args[3], "did_it_work");
  assert.equal(stored.args[4], "cool");
  assert.equal(await kv.get(feedbackKey(londonDay())), null);
});

test("POST /api/optimiser-feedback accepts an allowed myboiler.com origin", async () => {
  const kv = mockKv();
  const db = mockDb();
  const env = { REQUESTS: kv, DB: db };
  const res = await worker.fetch(
    feedbackPost(
      { type: "turned_down", path: "/boiler-optimiser/", brand: "worcester", from_flow: 75, set_flow: 55 },
      { Origin: "https://www.myboiler.com" }
    ),
    env
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://www.myboiler.com");
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
  const stored = db.statements.find((row) => /INSERT INTO optimiser_feedback/.test(row.sql));
  assert.ok(stored);
  assert.equal(stored.args[3], "turned_down");
  assert.equal(stored.args[6], "worcester");
  assert.equal(db.statements.filter((row) => /INSERT INTO optimiser_events/.test(row.sql)).length, 0);
});

test("POST /api/optimiser-feedback rejects a foreign origin with no KV or D1 write", async () => {
  const kv = mockKv();
  const db = mockDb();
  const env = { REQUESTS: kv, DB: db };
  const res = await worker.fetch(
    feedbackPost(
      { type: "did_it_work", answer: "yes", path: "/boiler-optimiser/" },
      { Origin: "https://evil.example" }
    ),
    env
  );
  assert.equal(res.status, 403);
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
  assert.equal(db.statements.length, 0);
  assert.notEqual(res.headers.get("Access-Control-Allow-Origin"), "https://evil.example");
});

test("POST /api/optimiser-feedback accepts a missing origin when Referer is myboiler.com", async () => {
  const kv = mockKv();
  const db = mockDb();
  const env = { REQUESTS: kv, DB: db };
  const res = await worker.fetch(
    feedbackPost(
      { type: "turned_down", path: "/boiler-optimiser/", brand: "ideal", from_flow: 70, set_flow: 55 },
      { Referer: "https://myboiler.com/boiler-optimiser/" }
    ),
    env
  );
  assert.equal(res.status, 204);
  const stored = db.statements.find((row) => /INSERT INTO optimiser_feedback/.test(row.sql));
  assert.ok(stored);
  assert.equal(stored.args[6], "ideal");
  assert.equal(kv.calls.put.length, 0);
});

test("POST /api/optimiser-feedback rejects a missing origin with a foreign Referer", async () => {
  const kv = mockKv();
  const db = mockDb();
  const env = { REQUESTS: kv, DB: db };
  const res = await worker.fetch(
    feedbackPost(
      { type: "did_it_work", answer: "yes", path: "/boiler-optimiser/" },
      { Referer: "https://evil.example/page" }
    ),
    env
  );
  assert.equal(res.status, 403);
  assert.equal(kv.calls.put.length, 0);
  assert.equal(db.statements.length, 0);
});

test("OPTIONS /api/optimiser-feedback from an allowed origin still works", async () => {
  const res = await worker.fetch(
    new Request("https://myboiler.com/api/optimiser-feedback", {
      method: "OPTIONS",
      headers: { Origin: "https://myboiler.com" },
    }),
    { REQUESTS: mockKv() }
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://myboiler.com");
});

test("POST /api/optimiser-feedback skips insert when the isolate daily cap is reached", async () => {
  seedIsolateFeedbackCount(MAX_EVENTS_PER_DAY);
  const kv = mockKv();
  const db = mockDb();
  const env = { REQUESTS: kv, DB: db };
  const res = await worker.fetch(
    feedbackPost({ type: "turned_down", path: "/boiler-optimiser/", brand: "ideal", from_flow: 70, set_flow: 55 }),
    env
  );
  assert.equal(res.status, 204);
  assert.equal(db.statements.length, 0);
  assert.equal(kv.calls.get.length, 0);
  assert.equal(kv.calls.put.length, 0);
});

test("POST /api/optimiser-feedback does not run the daily purge", async () => {
  const kv = mockKv();
  const db = mockDb();
  const ctx = mockWaitUntil();
  const res = await worker.fetch(
    feedbackPost({ type: "turned_down", path: "/boiler-optimiser/", brand: "ideal", from_flow: 70, set_flow: 55 }),
    { REQUESTS: kv, DB: db },
    ctx
  );
  assert.equal(res.status, 204);
  assert.equal(ctx.pending.length, 0);
  assert.equal(db.statements.filter((row) => /DELETE/.test(row.sql)).length, 0);
});

test("GET /api/optimiser-feedbacks requires Bearer LIST_SECRET and merges legacy KV with D1", async () => {
  const day = londonDay();
  const legacy = [{ t: 1, type: "turned_down", path: "/boiler-optimiser/", brand: "ideal" }];
  const kv = mockKv(new Map([[feedbackKey(day), JSON.stringify(legacy)]]));
  const db = mockDb();
  const env = { REQUESTS: kv, DB: db, LIST_SECRET: "s3cret" };
  await appendFeedback({ t: 2, type: "did_it_work", answer: "yes", path: "/boiler-optimiser/", brand: "vaillant" }, env);

  const denied = await worker.fetch(new Request("https://myboiler.com/api/optimiser-feedbacks"), env);
  assert.equal(denied.status, 401);

  const ok = await worker.fetch(
    new Request("https://myboiler.com/api/optimiser-feedbacks", {
      headers: { Authorization: "Bearer s3cret" },
    }),
    env
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.day, day);
  assert.equal(body.count, 2);
  assert.equal(body.events[0].type, "turned_down");
  assert.equal(body.events[0].brand, "ideal");
  assert.equal(body.events[1].type, "did_it_work");
  assert.equal(body.events[1].answer, "yes");
  assert.equal(body.events[1].brand, "vaillant");
  assert.ok(body.count < MAX_EVENTS_PER_DAY);
  assert.equal(kv.calls.put.length, 0);
});
