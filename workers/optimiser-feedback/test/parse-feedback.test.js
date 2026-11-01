import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {
  MAX_EVENTS_PER_DAY,
  appendFeedback,
  feedbackKey,
  londonDay,
  parseFeedbackBody,
  sanitizeField,
} from "../src/lib.js";

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
});

test("POST /api/optimiser-feedback stores a did_it_work event", async () => {
  const kv = mockKv();
  const env = { REQUESTS: kv, LIST_SECRET: "s3cret" };
  const res = await worker.fetch(
    new Request("https://myboiler.com/api/optimiser-feedback", {
      method: "POST",
      body: JSON.stringify({ type: "did_it_work", answer: "cool", path: "/boiler-optimiser/" }),
    }),
    env
  );
  assert.equal(res.status, 204);
  const day = londonDay();
  const stored = JSON.parse(await kv.get(feedbackKey(day)));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].type, "did_it_work");
  assert.equal(stored[0].answer, "cool");
});

test("GET /api/optimiser-feedbacks requires Bearer LIST_SECRET", async () => {
  const kv = mockKv();
  const env = { REQUESTS: kv, LIST_SECRET: "s3cret" };
  await appendFeedback({ t: Date.now(), type: "turned_down", path: "/boiler-optimiser/", brand: "ideal" }, env);
  const denied = await worker.fetch(new Request("https://myboiler.com/api/optimiser-feedbacks"), env);
  assert.equal(denied.status, 401);
  const listed = await worker.fetch(
    new Request("https://myboiler.com/api/optimiser-feedbacks"),
    { REQUESTS: kv, LIST_SECRET: "s3cret", headers: undefined }
  );
  const ok = await worker.fetch(
    new Request("https://myboiler.com/api/optimiser-feedbacks", {
      headers: { Authorization: "Bearer s3cret" },
    }),
    env
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.count, 1);
  assert.equal(body.events[0].type, "turned_down");
  assert.ok(body.count < MAX_EVENTS_PER_DAY);
});
