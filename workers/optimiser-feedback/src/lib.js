/**
 * Shared logic for the Boiler Optimiser feedback Worker.
 * Kept out of the entry module so wrangler/workerd does not treat named
 * exports as handlers.
 *
 * Collect paths are KV-free: a get+put per event exhausted the free-plan
 * 1k/day write limit. Caps are a soft per-isolate counter. GET
 * /api/optimiser-feedbacks still reads legacy `optimiser:YYYY-MM-DD` KV
 * arrays so days stored before the D1 cutover remain listable.
 */

const MAX_BODY_BYTES = 2048;
const MAX_PATH = 256;
const MAX_BRAND = 80;
const MAX_EVENT_BRAND = 40;
const MAX_UTM = 64;
const ALLOWED_TYPES = new Set(["turned_down", "did_it_work"]);
const ALLOWED_EVENT_TYPES = new Set(["view", "step", "brand", "turned_down", "did_it_work", "guide_click"]);
const MAX_TARGET = 200;
const ALLOWED_ANSWERS = new Set(["yes", "cool", "not_yet"]);
const ALLOWED_ORIGINS = new Set([
  "https://myboiler.com",
  "https://www.myboiler.com",
]);
const ALLOWED_HOSTS = new Set(["myboiler.com", "www.myboiler.com"]);
const UTM_RE = /^[A-Za-z0-9_.-]+$/;
const SAFE_TOKEN_RE = /^[A-Za-z0-9._-]+$/;
const RETENTION_DAYS = 400;
const ARRIVAL_TOKEN = /^[a-z0-9][a-z0-9_.-]{0,40}$/;

const INSERT_SQL =
  "INSERT INTO optimiser_events (ts, day, event, path, utm_source, utm_content, step, brand, from_flow, set_flow, space_kwh, annual_kwh, unit_rate, system, boiler_type, saving_kwh, saving_gbp, answer, is_test, source, target, outbound, arrival_src, pre_brand, pre_system, preselected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

const FEEDBACK_INSERT_SQL =
  "INSERT INTO optimiser_feedback (ts, day, t, type, answer, path, brand, from_flow, set_flow) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

export const MAX_EVENTS_PER_DAY = 2000;
export const MAX_ANON_EVENTS_PER_DAY = 5000;
const KV_KEY_PREFIX = "optimiser:";

// Ofgem price cap, GB average gas unit rate, Direct Debit, 1 Oct–31 Dec 2026 (incl. 5% VAT), pence/kWh.
export const OFGEM_GAS_UNIT_RATE_P = 7.97;

const isolateFeedbackCount = { day: "", n: 0 };
const isolateEventCount = { day: "", n: 0 };
// Free plan has no spare cron slot (5/account used), so each isolate
// runs the D1 delete at most once per London day, on the first POST.
let lastPurgeDay = "";

/**
 * Reset per-isolate caps and the daily purge latch. Tests only.
 */
export function resetIsolateState() {
  isolateFeedbackCount.day = "";
  isolateFeedbackCount.n = 0;
  isolateEventCount.day = "";
  isolateEventCount.n = 0;
  lastPurgeDay = "";
}

/**
 * Pretend this isolate has already counted `n` anonymous events today.
 * Tests only.
 * @param {number} n
 * @param {string} [day]
 */
export function seedIsolateEventCount(n, day = londonDay()) {
  isolateEventCount.day = day;
  isolateEventCount.n = n;
}

/**
 * Pretend this isolate has already counted `n` feedback rows today.
 * Tests only.
 * @param {number} n
 * @param {string} [day]
 */
export function seedIsolateFeedbackCount(n, day = londonDay()) {
  isolateFeedbackCount.day = day;
  isolateFeedbackCount.n = n;
}

/**
 * @param {Request} request
 * @returns {Record<string, string>}
 */
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://myboiler.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET, HEAD",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Same-site check for collect POSTs. Prefer Origin; if it is missing, fall
 * back to the Referer host. A present but disallowed Origin is never saved
 * by a matching Referer.
 * @param {Request} request
 */
export function isAllowedOrigin(request) {
  const origin = (request.headers.get("Origin") || "").trim();
  if (origin) return ALLOWED_ORIGINS.has(origin);
  const referer = (request.headers.get("Referer") || "").trim();
  if (!referer) return false;
  try {
    const url = new URL(referer);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * @param {number} status
 * @param {object} body
 */
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * @param {string} pathname
 */
function isCollectPath(pathname) {
  return pathname === "/api/optimiser-feedback" || pathname === "/api/optimiser-feedback/";
}

/**
 * @param {string} pathname
 */
function isListPath(pathname) {
  return pathname === "/api/optimiser-feedbacks" || pathname === "/api/optimiser-feedbacks/";
}

/**
 * @param {string} pathname
 */
function isEventPath(pathname) {
  return pathname === "/api/optimiser-event" || pathname === "/api/optimiser-event/";
}

/**
 * @param {unknown} value
 * @param {number} max
 */
function cleanString(value, max) {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > max) return "";
  return trimmed;
}

/**
 * Calendar date in Europe/London as YYYY-MM-DD.
 * @param {Date} [date]
 */
export function londonDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * ISO timestamp rounded down to the minute (UTC).
 * @param {Date} [date]
 */
export function minuteIso(date = new Date()) {
  const rounded = new Date(Math.floor(date.getTime() / 60000) * 60000);
  return rounded.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * @param {string} day YYYY-MM-DD
 */
export function feedbackKey(day) {
  return KV_KEY_PREFIX + day;
}

/**
 * @param {unknown} value
 * @param {number} max
 */
export function sanitizeField(value, max) {
  const raw = cleanString(value, max);
  if (!raw) return "";
  if (/https?:\/\//i.test(raw) || /[<>]/.test(raw)) return "";
  return raw;
}

/**
 * @param {unknown} value
 */
function optionalFlow(value, max = 90) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 35 || rounded > max) return null;
  return rounded;
}

/**
 * @param {string} body
 * @returns {{ ok: true, event: object } | { ok: false, status: number }}
 */
export function parseFeedbackBody(body) {
  if (typeof body !== "string" || !body) return { ok: false, status: 400 };
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return { ok: false, status: 413 };
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return { ok: false, status: 400 };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 400 };
  }

  const type = cleanString(data.type, 40);
  if (!ALLOWED_TYPES.has(type)) return { ok: false, status: 400 };

  let answer = "";
  if (type === "did_it_work") {
    answer = cleanString(data.answer, 20);
    if (!ALLOWED_ANSWERS.has(answer)) return { ok: false, status: 400 };
  }

  let path = cleanString(data.path, MAX_PATH);
  if (!path) path = "/boiler-optimiser/";
  if (!path.startsWith("/") || path.includes("?") || path.includes("#") || path.includes("//")) {
    return { ok: false, status: 400 };
  }

  const brand = sanitizeField(data.brand, MAX_BRAND);
  const fromFlow = optionalFlow(data.from_flow);
  const setFlow = optionalFlow(data.set_flow, 75);
  if (type === "turned_down" && fromFlow !== null && setFlow !== null && setFlow > fromFlow) {
    return { ok: false, status: 400 };
  }

  const now = Date.now();
  let t = typeof data.t === "number" && Number.isFinite(data.t) ? Math.round(data.t) : now;
  if (t < now - 7 * 24 * 60 * 60 * 1000 || t > now + 10 * 60 * 1000) t = now;

  const event = { t, type, path, brand };
  if (answer) event.answer = answer;
  if (fromFlow !== null) event.from_flow = fromFlow;
  if (setFlow !== null) event.set_flow = setFlow;

  return { ok: true, event };
}

/**
 * @param {unknown} value
 * @param {boolean} required
 * @returns {{ ok: true, value: string|null } | { ok: false, status: number }}
 */
function parseEventPath(value, required) {
  if (value === undefined || value === null || value === "") {
    if (required) return { ok: false, status: 400 };
    return { ok: true, value: null };
  }
  if (typeof value !== "string") return { ok: false, status: 400 };
  const path = value.trim();
  if (!path || path.length > MAX_PATH) return { ok: false, status: 400 };
  if (!path.startsWith("/") || path.includes("?") || path.includes("#") || path.includes("//")) {
    return { ok: false, status: 400 };
  }
  if (!path.startsWith("/boiler-optimiser")) return { ok: false, status: 400 };
  return { ok: true, value: path };
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string|null } | { ok: false, status: number }}
 */
function parseUtm(value) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, status: 400 };
  const token = value.trim();
  if (!token) return { ok: true, value: null };
  if (token.length > MAX_UTM || !UTM_RE.test(token)) return { ok: false, status: 400 };
  return { ok: true, value: token };
}

/**
 * @param {unknown} value
 * @param {boolean} required
 * @returns {{ ok: true, value: string|null } | { ok: false, status: number }}
 */
function parseSafeToken(value, required, max = MAX_EVENT_BRAND) {
  if (value === undefined || value === null || value === "") {
    if (required) return { ok: false, status: 400 };
    return { ok: true, value: null };
  }
  if (typeof value !== "string") return { ok: false, status: 400 };
  const token = value.trim();
  if (!token) {
    if (required) return { ok: false, status: 400 };
    return { ok: true, value: null };
  }
  if (token.length > max || !SAFE_TOKEN_RE.test(token)) return { ok: false, status: 400 };
  return { ok: true, value: token };
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {{ integer?: boolean, required?: boolean }} [opts]
 */
function parseBoundedNumber(value, min, max, opts = {}) {
  const required = !!opts.required;
  const integer = !!opts.integer;
  if (value === undefined || value === null || value === "") {
    if (required) return { ok: false, status: 400 };
    return { ok: true, value: null };
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return { ok: false, status: 400 };
  if (integer && !Number.isInteger(n)) return { ok: false, status: 400 };
  return { ok: true, value: n };
}

/**
 * Pathname starting with / (not //) or a boilermanuals.com https URL, max 200.
 * @param {unknown} value
 */
function parseGuideTarget(value) {
  if (typeof value !== "string") return { ok: false, status: 400 };
  const target = value.trim();
  if (!target || target.length > MAX_TARGET) return { ok: false, status: 400 };
  if (target.includes("?") || target.includes("#")) return { ok: false, status: 400 };
  if (target.startsWith("/") && !target.startsWith("//")) {
    return { ok: true, value: target };
  }
  if (
    target.startsWith("https://boilermanuals.com/") ||
    target.startsWith("https://www.boilermanuals.com/")
  ) {
    return { ok: true, value: target };
  }
  return { ok: false, status: 400 };
}

/**
 * Allowlisted anonymous Optimiser events. Unknown JSON keys are dropped.
 * Out-of-range or unsafe values are rejected.
 * Blank, zero or sub-1p unit rates (e.g. 0.06 typed as pounds) default to
 * the current Ofgem cap gas rate, and saving_gbp is recomputed from kWh.
 * @param {string} body
 * @returns {{ ok: true, row: object } | { ok: false, status: number }}
 */
export function parseOptimiserEventBody(body) {
  if (typeof body !== "string" || !body) return { ok: false, status: 400 };
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return { ok: false, status: 413 };
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return { ok: false, status: 400 };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 400 };
  }

  const event = typeof data.event === "string" ? data.event.trim() : "";
  if (!ALLOWED_EVENT_TYPES.has(event)) return { ok: false, status: 400 };

  const pathNeeded = event === "view" || event === "step";
  const path = parseEventPath(data.path, pathNeeded);
  if (!path.ok) return path;

  const utmSource = parseUtm(data.utm_source);
  if (!utmSource.ok) return utmSource;
  const utmContent = parseUtm(data.utm_content);
  if (!utmContent.ok) return utmContent;

  const row = { event };
  if (path.value) row.path = path.value;
  if (utmSource.value) row.utm_source = utmSource.value;
  if (utmContent.value) row.utm_content = utmContent.value;

  if (event === "step") {
    const step = parseBoundedNumber(data.step, 1, 10, { integer: true, required: true });
    if (!step.ok) return step;
    row.step = step.value;
  }

  if (event === "brand" || event === "turned_down" || event === "guide_click") {
    const brand = parseSafeToken(data.brand, event === "brand" || event === "guide_click");
    if (!brand.ok) return brand;
    if (brand.value) row.brand = brand.value;
  }

  if (event === "guide_click") {
    const target = parseGuideTarget(data.target);
    if (!target.ok) return target;
    const outbound = parseBoundedNumber(data.outbound, 0, 1, { integer: true, required: true });
    if (!outbound.ok) return outbound;
    row.target = target.value;
    row.outbound = outbound.value;
  }

  if (event === "turned_down") {
    const fromFlow = parseBoundedNumber(data.from_flow, 30, 90);
    if (!fromFlow.ok) return fromFlow;
    const setFlow = parseBoundedNumber(data.set_flow, 30, 90);
    if (!setFlow.ok) return setFlow;
    const spaceKwh = parseBoundedNumber(data.space_kwh, 0, 100000);
    if (!spaceKwh.ok) return spaceKwh;
    const annualKwh = parseBoundedNumber(data.annual_kwh, 0, 200000);
    if (!annualKwh.ok) return annualKwh;
    const unitRate = parseBoundedNumber(data.unit_rate, 0, 200);
    if (!unitRate.ok) return unitRate;
    const savingKwh = parseBoundedNumber(data.saving_kwh, 0, 50000);
    if (!savingKwh.ok) return savingKwh;
    const savingGbp = parseBoundedNumber(data.saving_gbp, 0, 10000);
    if (!savingGbp.ok) return savingGbp;
    const system = parseSafeToken(data.system, false);
    if (!system.ok) return system;
    const boilerType = parseSafeToken(data.boiler_type, false);
    if (!boilerType.ok) return boilerType;
    const isTest = parseBoundedNumber(data.is_test, 0, 1, { integer: true });
    if (!isTest.ok) return isTest;

    if (fromFlow.value !== null) row.from_flow = fromFlow.value;
    if (setFlow.value !== null) row.set_flow = setFlow.value;
    if (spaceKwh.value !== null) row.space_kwh = spaceKwh.value;
    if (annualKwh.value !== null) row.annual_kwh = annualKwh.value;
    const rateDefaulted = unitRate.value === null || unitRate.value < 1;
    row.unit_rate = rateDefaulted ? OFGEM_GAS_UNIT_RATE_P : unitRate.value;
    if (savingKwh.value !== null) row.saving_kwh = savingKwh.value;
    if (rateDefaulted && savingKwh.value !== null) {
      row.saving_gbp = Math.round(savingKwh.value * OFGEM_GAS_UNIT_RATE_P) / 100;
    } else if (savingGbp.value !== null) {
      row.saving_gbp = savingGbp.value;
    }
    if (system.value) row.system = system.value;
    if (boilerType.value) row.boiler_type = boilerType.value;
    row.is_test = isTest.value === 1 ? 1 : 0;
  }

  if (event === "did_it_work") {
    const answer = typeof data.answer === "string" ? data.answer.trim() : "";
    if (!ALLOWED_ANSWERS.has(answer)) return { ok: false, status: 400 };
    row.answer = answer;
    const brand = parseSafeToken(data.brand, false);
    if (!brand.ok) return brand;
    if (brand.value) row.brand = brand.value;
  }

  return { ok: true, row };
}

/**
 * Constant-time-ish string compare via SHA-256 (equal-length digests).
 * Empty strings never match.
 * @param {string} a
 * @param {string} b
 */
export async function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const enc = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const aa = new Uint8Array(left);
  const bb = new Uint8Array(right);
  let mismatch = 0;
  for (let i = 0; i < aa.byteLength; i++) mismatch |= aa[i] ^ bb[i];
  return mismatch === 0;
}

/**
 * @param {Request} request
 * @param {{ LIST_SECRET?: string }} env
 */
export async function authorizeList(request, env) {
  const secret = env && typeof env.LIST_SECRET === "string" ? env.LIST_SECRET : "";
  if (!secret) return false;
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return false;
  return timingSafeEqual(match[1], secret);
}

/**
 * @param {string|null} raw
 * @returns {object[]}
 */
function parseStoredEvents(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Insert one feedback event into D1 `optimiser_feedback`.
 * Caps at MAX_EVENTS_PER_DAY per isolate (no KV rewrite of optimiser:<day>).
 * @param {object} event
 * @param {{ DB?: { prepare: Function } }} env
 * @param {Date} [now]
 */
export async function appendFeedback(event, env, now = new Date()) {
  if (!env || !env.DB || typeof env.DB.prepare !== "function") {
    return { stored: false, reason: "no-binding" };
  }
  const day = londonDay(now);
  if (isolateFeedbackCount.day !== day) {
    isolateFeedbackCount.day = day;
    isolateFeedbackCount.n = 0;
  }
  if (isolateFeedbackCount.n >= MAX_EVENTS_PER_DAY) {
    return { stored: false, reason: "cap", day };
  }
  isolateFeedbackCount.n++;
  try {
    await env.DB.prepare(FEEDBACK_INSERT_SQL)
      .bind(
        minuteIso(now),
        day,
        event.t,
        event.type,
        event.answer || null,
        event.path || null,
        event.brand || null,
        event.from_flow == null ? null : event.from_flow,
        event.set_flow == null ? null : event.set_flow
      )
      .run();
    return { stored: true, day };
  } catch (err) {
    console.log(JSON.stringify({ error: "feedback-d1", message: String((err && err.message) || err) }));
    return { stored: false, reason: "error", day };
  }
}

/**
 * Soft per-isolate daily cap. No KV get or put on optimiser-events:<day>.
 * @param {unknown} [_env]
 * @param {string} day
 */
export async function takeEventSlot(_env, day) {
  if (isolateEventCount.day !== day) {
    isolateEventCount.day = day;
    isolateEventCount.n = 0;
  }
  if (isolateEventCount.n >= MAX_ANON_EVENTS_PER_DAY) {
    return { ok: false, reason: "cap", count: isolateEventCount.n };
  }
  isolateEventCount.n++;
  return { ok: true, count: isolateEventCount.n };
}

/**
 * Insert one allowlisted row. Never reads IP, UA, cookies, country, or IDs.
 * @param {object} row
 * @param {{ DB?: { prepare: Function } }} env
 * @param {Date} [now]
 * @param {string} [source]
 */
export async function insertOptimiserEvent(row, env, now = new Date(), source = "beacon") {
  if (!env || !env.DB || typeof env.DB.prepare !== "function") {
    return { stored: false, reason: "no-binding" };
  }
  const day = londonDay(now);
  const slot = await takeEventSlot(env, day);
  if (!slot.ok) return { stored: false, reason: slot.reason, day };

  const stmt = env.DB.prepare(INSERT_SQL);
  if (!stmt || typeof stmt.bind !== "function") {
    return { stored: false, reason: "no-binding" };
  }
  const bound = stmt.bind(
    minuteIso(now),
    day,
    row.event,
    row.path || null,
    row.utm_source || null,
    row.utm_content || null,
    row.step == null ? null : row.step,
    row.brand || null,
    row.from_flow == null ? null : row.from_flow,
    row.set_flow == null ? null : row.set_flow,
    row.space_kwh == null ? null : row.space_kwh,
    row.annual_kwh == null ? null : row.annual_kwh,
    row.unit_rate == null ? null : row.unit_rate,
    row.system || null,
    row.boiler_type || null,
    row.saving_kwh == null ? null : row.saving_kwh,
    row.saving_gbp == null ? null : row.saving_gbp,
    row.answer || null,
    row.is_test === 1 ? 1 : 0,
    source === "feedback" ? "feedback" : "beacon",
    row.target || null,
    row.outbound == null ? null : row.outbound,
    row.arrival_src || null,
    row.pre_brand || null,
    row.pre_system || null,
    row.preselected === 1 ? 1 : 0
  );
  if (!bound || typeof bound.run !== "function") {
    return { stored: false, reason: "no-binding" };
  }
  await bound.run();
  return { stored: true, day };
}

/**
 * @param {object} event parsed feedback event
 */
function feedbackDidItWorkRow(event) {
  const row = { event: "did_it_work", answer: event.answer };
  if (event.path) row.path = event.path;
  if (event.brand) row.brand = event.brand;
  if (event.from_flow != null) row.from_flow = event.from_flow;
  if (event.set_flow != null) row.set_flow = event.set_flow;
  return row;
}

/**
 * Delete rows older than RETENTION_DAYS by London calendar day.
 * @param {{ DB?: { prepare: Function } }} env
 * @param {Date} [now]
 */
export async function purgeOldEvents(env, now = new Date()) {
  if (!env || !env.DB || typeof env.DB.prepare !== "function") {
    return { deleted: false, reason: "no-binding" };
  }
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const before = londonDay(cutoff);
  const stmt = env.DB.prepare("DELETE FROM optimiser_events WHERE day < ?");
  if (!stmt || typeof stmt.bind !== "function") {
    return { deleted: false, reason: "no-binding" };
  }
  const bound = stmt.bind(before);
  if (!bound || typeof bound.run !== "function") {
    return { deleted: false, reason: "no-binding" };
  }
  await bound.run();
  return { deleted: true, before };
}

/**
 * At most once per isolate per London day: DELETE rows older than 400 days.
 * No KV guard. Never throws; the request path is not delayed.
 * @param {{ DB?: { prepare: Function } }} env
 * @param {{ waitUntil?: Function }} [ctx]
 */
export function maybePurgeInIsolate(env, ctx) {
  try {
    const day = londonDay();
    if (lastPurgeDay === day || !ctx || typeof ctx.waitUntil !== "function") return false;
    lastPurgeDay = day;
    ctx.waitUntil(purgeOldEvents(env).catch(() => {}));
    return true;
  } catch {
    return false;
  }
}

/**
 * Arrival context from the page URL the beacon was sent from (same-origin
 * Referer carries the query string). BoilerManuals deep links:
 * ?utm_source=boilermanuals&system=combi|system|non-condensing&brand=<slug>.
 * Cookie-free: nothing stored client-side.
 * @param {Request} request
 * @returns {{ arrival_src?: string, pre_brand?: string, pre_system?: string }}
 */
export function arrivalContext(request) {
  const out = {};
  try {
    const ref = new URL((request.headers.get("Referer") || "").trim());
    if (!ALLOWED_HOSTS.has(ref.hostname.toLowerCase())) return out;
    const params = ref.searchParams;
    const get = (key) => String(params.get(key) || "").trim().toLowerCase();
    const src = get("utm_source") || get("ref") || get("src");
    if (/^(www\.)?boilermanuals(\.com)?$/.test(src) || src.indexOf("boilermanuals") === 0) {
      out.arrival_src = "boilermanuals";
    } else if (ARRIVAL_TOKEN.test(src)) {
      out.arrival_src = src;
    }
    let brand = get("brand");
    if (brand === "worcester-bosch") brand = "worcester";
    if (brand === "glowworm") brand = "glow-worm";
    if (ARRIVAL_TOKEN.test(brand)) out.pre_brand = brand;
    const sys = get("system");
    if (sys === "combi" || sys === "system") out.pre_system = sys;
    else if (sys === "non-condensing" || sys === "standard") out.pre_system = "standard";
  } catch {
    // Missing or unparseable Referer: no arrival fields.
  }
  return out;
}

function logFeedback(event) {
  console.log(
    JSON.stringify({
      type: event.type,
      answer: event.answer || "",
      brand: event.brand || "",
      path: event.path,
    })
  );
}

/**
 * @param {Request} request
 * @param {{ REQUESTS?: { get: Function }, DB?: { prepare: Function }, LIST_SECRET?: string }} env
 */
async function handleList(request, env) {
  if (request.method !== "GET") {
    return jsonResponse(405, { error: "method" });
  }
  if (!(await authorizeList(request, env))) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const url = new URL(request.url);
  const dayParam = url.searchParams.get("day") || londonDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
    return jsonResponse(400, { error: "day" });
  }

  let legacy = [];
  try {
    const raw =
      env && env.REQUESTS && typeof env.REQUESTS.get === "function"
        ? await env.REQUESTS.get(feedbackKey(dayParam))
        : null;
    legacy = parseStoredEvents(raw);
  } catch {
    legacy = [];
  }

  let rows = [];
  try {
    if (env && env.DB && typeof env.DB.prepare === "function") {
      const res = await env.DB.prepare(
        "SELECT t, type, answer, path, brand, from_flow, set_flow FROM optimiser_feedback WHERE day = ? ORDER BY id"
      )
        .bind(dayParam)
        .all();
      rows = ((res && res.results) || []).map((r) => {
        const event = { t: r.t, type: r.type, path: r.path, brand: r.brand || "" };
        if (r.answer) event.answer = r.answer;
        if (r.from_flow != null) event.from_flow = r.from_flow;
        if (r.set_flow != null) event.set_flow = r.set_flow;
        return event;
      });
    }
  } catch {
    rows = [];
  }

  const events = legacy.concat(rows);
  return jsonResponse(200, { day: dayParam, count: events.length, events });
}

/**
 * @param {Request} request
 * @param {{ DB?: { prepare: Function } }} env
 * @param {{ waitUntil?: Function }} [ctx]
 */
async function handleEventCollect(request, env, ctx) {
  if (request.method === "POST") maybePurgeInIsolate(env, ctx);
  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { ...headers, Allow: "POST, OPTIONS, GET, HEAD" },
    });
  }

  if (!isAllowedOrigin(request)) {
    return new Response(null, { status: 403, headers });
  }

  const body = await request.text();
  const parsed = parseOptimiserEventBody(body);
  if (!parsed.ok) {
    return new Response(null, { status: parsed.status, headers });
  }

  const row = parsed.row;
  const arrival = arrivalContext(request);
  if (arrival.arrival_src) row.arrival_src = arrival.arrival_src;
  if (arrival.pre_brand) row.pre_brand = arrival.pre_brand;
  if (arrival.pre_system) row.pre_system = arrival.pre_system;
  // Steps 1–2 are auto-completed by a ?system= deep link; a brand matching
  // ?brand= is the link's choice, not the visitor's.
  if (
    (row.event === "step" && (row.step === 1 || row.step === 2) && row.pre_system) ||
    (row.event === "brand" && row.pre_brand && row.brand === row.pre_brand)
  ) {
    row.preselected = 1;
  }

  await insertOptimiserEvent(row, env);
  return new Response(null, { status: 204, headers });
}

/**
 * @param {Request} request
 * @param {{ REQUESTS?: { get: Function, put: Function }, DB?: { prepare: Function }, LIST_SECRET?: string }} env
 * @param {{ waitUntil?: Function }} [ctx]
 */
export async function handleFetch(request, env, ctx) {
  const url = new URL(request.url);

  if (isListPath(url.pathname)) {
    return handleList(request, env);
  }

  if (isEventPath(url.pathname)) {
    return handleEventCollect(request, env, ctx);
  }

  if (!isCollectPath(url.pathname)) {
    return new Response(null, { status: 404 });
  }

  const headers = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { ...headers, Allow: "POST, OPTIONS, GET, HEAD" },
    });
  }

  if (!isAllowedOrigin(request)) {
    return new Response(null, { status: 403, headers });
  }

  const body = await request.text();
  const parsed = parseFeedbackBody(body);
  if (!parsed.ok) {
    return new Response(null, { status: parsed.status, headers });
  }

  await appendFeedback(parsed.event, env);
  if (parsed.event.type === "did_it_work") {
    await insertOptimiserEvent(feedbackDidItWorkRow(parsed.event), env, new Date(), "feedback");
  }
  logFeedback(parsed.event);
  return new Response(null, { status: 204, headers });
}
