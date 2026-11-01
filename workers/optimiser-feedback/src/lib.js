/**
 * Shared logic for the Boiler Optimiser feedback Worker.
 * Kept out of the entry module so wrangler/workerd does not treat named
 * exports as handlers.
 */

const MAX_BODY_BYTES = 2048;
const MAX_PATH = 256;
const MAX_BRAND = 80;
const ALLOWED_TYPES = new Set(["turned_down", "did_it_work"]);
const ALLOWED_ANSWERS = new Set(["yes", "cool", "not_yet"]);
const ALLOWED_ORIGINS = new Set([
  "https://myboiler.com",
  "https://www.myboiler.com",
]);

export const MAX_EVENTS_PER_DAY = 2000;
export const KV_TTL_SECONDS = 40 * 24 * 60 * 60;
const KV_KEY_PREFIX = "optimiser:";

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
function optionalFlow(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 35 || rounded > 90) return null;
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
  const setFlow = optionalFlow(data.set_flow);

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
 * @param {{ REQUESTS?: { get: Function, put: Function }, LIST_SECRET?: string }} env
 */
export async function handleFetch(request, env) {
  const url = new URL(request.url);

  if (isListPath(url.pathname)) {
    return handleList(request, env);
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

  const body = await request.text();
  const parsed = parseFeedbackBody(body);
  if (!parsed.ok) {
    return new Response(null, { status: parsed.status, headers });
  }

  await appendFeedback(parsed.event, env);
  logFeedback(parsed.event);
  return new Response(null, { status: 204, headers });
}
