/**
 * Shared logic for the Boiler Optimiser feedback Worker.
 * Kept out of the entry module so wrangler/workerd does not treat named
 * exports as handlers.
 */

const MAX_BODY_BYTES = 2048;
const MAX_PATH = 256;
const MAX_BRAND = 80;
const MAX_EVENT_BRAND = 40;
const MAX_UTM = 64;
const ALLOWED_TYPES = new Set(["turned_down", "did_it_work"]);
const ALLOWED_EVENT_TYPES = new Set(["view", "step", "brand", "turned_down", "did_it_work"]);
const ALLOWED_ANSWERS = new Set(["yes", "cool", "not_yet"]);
const ALLOWED_ORIGINS = new Set([
  "https://myboiler.com",
  "https://www.myboiler.com",
]);
const ALLOWED_HOSTS = new Set(["myboiler.com", "www.myboiler.com"]);
const UTM_RE = /^[A-Za-z0-9_.-]+$/;
const SAFE_TOKEN_RE = /^[A-Za-z0-9._-]+$/;
const RETENTION_DAYS = 400;
const EVENT_KV_TTL_SECONDS = 3 * 24 * 60 * 60;

const INSERT_SQL =
  "INSERT INTO optimiser_events (ts, day, event, path, utm_source, utm_content, step, brand, from_flow, set_flow, space_kwh, annual_kwh, unit_rate, system, boiler_type, saving_kwh, saving_gbp, answer, is_test, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

export const MAX_EVENTS_PER_DAY = 2000;
export const MAX_ANON_EVENTS_PER_DAY = 5000;
export const KV_TTL_SECONDS = 40 * 24 * 60 * 60;
const KV_KEY_PREFIX = "optimiser:";
const EVENT_KV_PREFIX = "optimiser-events:";
const PURGE_KV_PREFIX = "optimiser:purge:";

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
 * @param {string} day YYYY-MM-DD
 */
export function eventCapKey(day) {
  return EVENT_KV_PREFIX + day;
}

/**
 * @param {string} day YYYY-MM-DD
 */
export function purgeKey(day) {
  return PURGE_KV_PREFIX + day;
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
 * Allowlisted anonymous Optimiser events. Unknown JSON keys are dropped.
 * Out-of-range or unsafe values are rejected.
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

  if (event === "brand" || event === "turned_down") {
    const brand = parseSafeToken(data.brand, event === "brand");
    if (!brand.ok) return brand;
    if (brand.value) row.brand = brand.value;
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
    if (unitRate.value !== null) row.unit_rate = unitRate.value;
    if (savingKwh.value !== null) row.saving_kwh = savingKwh.value;
    if (savingGbp.value !== null) row.saving_gbp = savingGbp.value;
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
 * Append one event to KV key optimiser:YYYY-MM-DD (Europe/London).
 * Caps at MAX_EVENTS_PER_DAY. TTL ~40 days.
 * @param {object} event
 * @param {{ REQUESTS?: { get: Function, put: Function } }} env
 * @param {Date} [now]
 */
export async function appendFeedback(event, env, now = new Date()) {
  if (!env || !env.REQUESTS || typeof env.REQUESTS.get !== "function" || typeof env.REQUESTS.put !== "function") {
    return { stored: false, reason: "no-binding" };
  }
  const day = londonDay(now);
  const key = feedbackKey(day);
  const events = parseStoredEvents(await env.REQUESTS.get(key));
  if (events.length >= MAX_EVENTS_PER_DAY) {
    return { stored: false, reason: "cap", day, key, count: events.length };
  }
  events.push(event);
  await env.REQUESTS.put(key, JSON.stringify(events), { expirationTtl: KV_TTL_SECONDS });
  return { stored: true, day, key, count: events.length };
}

/**
 * Increment the anonymous-event daily counter. Over-cap returns ok:false.
 * @param {{ REQUESTS?: { get: Function, put: Function } }} env
 * @param {string} day
 */
export async function takeEventSlot(env, day) {
  if (!env || !env.REQUESTS || typeof env.REQUESTS.get !== "function" || typeof env.REQUESTS.put !== "function") {
    return { ok: true, reason: "no-binding" };
  }
  const key = eventCapKey(day);
  const raw = await env.REQUESTS.get(key);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  const n = Number.isFinite(count) ? count : 0;
  if (n >= MAX_ANON_EVENTS_PER_DAY) {
    return { ok: false, reason: "cap", count: n, key };
  }
  await env.REQUESTS.put(key, String(n + 1), { expirationTtl: EVENT_KV_TTL_SECONDS });
  return { ok: true, count: n + 1, key };
}

/**
 * Insert one allowlisted row. Never reads IP, UA, cookies, country, or IDs.
 * @param {object} row
 * @param {{ DB?: { prepare: Function }, REQUESTS?: { get: Function, put: Function } }} env
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
    source === "feedback" ? "feedback" : "beacon"
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
 * At most once per London calendar day: DELETE rows older than 400 days.
 * KV guard optimiser:purge:YYYY-MM-DD. Never throws.
 * @param {{ REQUESTS?: { get: Function, put: Function }, DB?: { prepare: Function } }} env
 * @param {Date} [now]
 */
export async function maybePurgeOldEvents(env, now = new Date()) {
  try {
    if (!env || !env.REQUESTS || typeof env.REQUESTS.get !== "function" || typeof env.REQUESTS.put !== "function") {
      return { purged: false, reason: "no-kv" };
    }
    const day = londonDay(now);
    const key = purgeKey(day);
    const existing = await env.REQUESTS.get(key);
    if (existing) return { purged: false, reason: "already", day, key };
    await env.REQUESTS.put(key, "1", { expirationTtl: EVENT_KV_TTL_SECONDS });
    const result = await purgeOldEvents(env, now);
    return { purged: !!result.deleted, day, key, before: result.before, reason: result.reason };
  } catch {
    return { purged: false, reason: "error" };
  }
}

/**
 * Queue the daily purge on ctx.waitUntil so the request is never delayed or failed.
 * @param {{ REQUESTS?: { get: Function, put: Function }, DB?: { prepare: Function } }} env
 * @param {{ waitUntil?: Function }} [ctx]
 * @param {Date} [now]
 */
export function scheduleDailyPurge(env, ctx, now = new Date()) {
  if (!ctx || typeof ctx.waitUntil !== "function") return false;
  try {
    ctx.waitUntil(maybePurgeOldEvents(env, now));
    return true;
  } catch {
    return false;
  }
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
 * @param {{ REQUESTS?: { get: Function }, LIST_SECRET?: string }} env
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

  const raw = env && env.REQUESTS && typeof env.REQUESTS.get === "function"
    ? await env.REQUESTS.get(feedbackKey(dayParam))
    : null;
  const events = parseStoredEvents(raw);
  return jsonResponse(200, { day: dayParam, count: events.length, events });
}

/**
 * @param {Request} request
 * @param {{ REQUESTS?: { get: Function, put: Function }, DB?: { prepare: Function } }} env
 * @param {{ waitUntil?: Function }} [ctx]
 */
async function handleEventCollect(request, env, ctx) {
  scheduleDailyPurge(env, ctx);
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

  await insertOptimiserEvent(parsed.row, env);
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
