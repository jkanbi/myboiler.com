import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import worker, { destIdFromHref, parseClickBody, sanitizeHref, writeClick } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

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

test("writeClick records one AE point when the binding exists", () => {
  const points = [];
  writeClick(
    {
      t: 1700000000000,
      net: "ebay",
      path: "/fault-codes/vaillant-f71-fault-code/",
      href: "www.ebay.co.uk/itm/375957480818",
      part: "193592",
      dest: "375957480818",
    },
    { AFFILIATE_CLICKS: { writeDataPoint: (p) => points.push(p) } }
  );
  assert.equal(points.length, 1);
  assert.deepEqual(points[0].indexes, ["ebay"]);
  assert.deepEqual(points[0].blobs, [
    "ebay",
    "/fault-codes/vaillant-f71-fault-code/",
    "193592",
    "375957480818",
    "www.ebay.co.uk/itm/375957480818",
  ]);
  writeClick({ net: "amazon" }, {});
  assert.equal(points.length, 1);
});

test("fetch accepts POST beacons and rejects junk", async () => {
  const points = [];
  const env = { AFFILIATE_CLICKS: { writeDataPoint: (p) => points.push(p) } };
  const post = (path, body, method = "POST") =>
    worker.fetch(
      new Request("https://myboiler.com" + path, {
        method,
        body,
        headers: { "Content-Type": "text/plain" },
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
  assert.equal(points.length, 1);

  const options = await post("/api/aff-click", null, "OPTIONS");
  assert.equal(options.status, 204);

  const bad = await post("/api/aff-click", JSON.stringify({ net: "amazon", path: "nope" }));
  assert.equal(bad.status, 400);
  assert.equal(points.length, 1);

  const missing = await post("/api/other", "{}");
  assert.equal(missing.status, 404);
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
