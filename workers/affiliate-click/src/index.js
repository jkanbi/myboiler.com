/**
 * Same-origin affiliate click collector.
 * POST /api/aff-click   → Workers KV (daily list, Europe/London)
 * GET  /api/aff-clicks  → JSON dump (Bearer LIST_SECRET)
 *
 * Cookieless: does not set cookies, does not read client identifiers,
 * and does not persist IP / UA / fingerprints.
 *
 * Account Analytics Engine permission is not required.
 */

const MAX_BODY_BYTES = 2048;
const MAX_PATH = 256;
const MAX_HREF = 256;
const MAX_PART = 24;
const ALLOWED_NET = new Set(["amazon", "ebay"]);
const ALLOWED_ORIGINS = new Set([
  "https://myboiler.com",
  "https://www.myboiler.com",
]);

export const MAX_EVENTS_PER_DAY = 2000;
export const KV_TTL_SECONDS = 40 * 24 * 60 * 60;
export const KV_KEY_PREFIX = "clicks:";

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
  return pathname === "/api/aff-click" || pathname === "/api/aff-click/";
}

/**
 * @param {string} pathname
 */
function isListPath(pathname) {
  return pathname === "/api/aff-clicks" || pathname === "/api/aff-clicks/";
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
export function clicksKey(day) {
  return KV_KEY_PREFIX + day;
}

/**
 * Strip query/hash and keep host + pathname only.
 * Accepts a full URL or an already-stripped host/path.
 * @param {unknown} value
 */
export function sanitizeHref(value) {
  const raw = cleanString(value, 400);
  if (!raw) return "";
  if (/^(javascript|data|vbscript):/i.test(raw)) return "";
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL("https://" + raw.replace(/^\/+/, ""));
    const host = url.hostname.toLowerCase();
    if (!/(^|\.)amazon\./.test(host) && !/(^|\.)ebay\./.test(host)) return "";
    return (host + url.pathname).replace(/\/+$/, "").slice(0, MAX_HREF);
  } catch {
    return "";
  }
}

/**
 * @param {string} href
 * @param {"amazon"|"ebay"|string} net
 */
export function destIdFromHref(href, net) {
  if (!href) return "";
  if (net === "amazon") {
    const match = href.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : "";
  }
  if (net === "ebay") {
    const match = href.match(/\/itm\/(?:[^/]+\/)?(\d{6,20})/);
    return match ? match[1] : "";
  }
  return "";
}

/**
 * @param {string} body
 * @returns {{ ok: true, event: { t: number, net: string, path: string, href: string, part: string, dest: string } } | { ok: false, status: number }}
 */
export function parseClickBody(body) {
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

  const net = cleanString(data.net, 16);
  if (!ALLOWED_NET.has(net)) return { ok: false, status: 400 };

  let path = cleanString(data.path, MAX_PATH);
  if (!path.startsWith("/") || path.includes("?") || path.includes("#") || path.includes("//")) {
    return { ok: false, status: 400 };
  }

  const href = sanitizeHref(data.href);
  const partRaw = cleanString(data.part, MAX_PART);
  const part = /^\d{5,12}$/.test(partRaw) ? partRaw : "";

  const now = Date.now();
  let t = typeof data.t === "number" && Number.isFinite(data.t) ? Math.round(data.t) : now;
  if (t < now - 7 * 24 * 60 * 60 * 1000 || t > now + 10 * 60 * 1000) t = now;

  return {
    ok: true,
    event: {
      t,
      net,
      path,
      href,
      part,
      dest: destIdFromHref(href, net),
    },
  };
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
function parseStoredClicks(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Append one event to KV key clicks:YYYY-MM-DD (Europe/London).
 * Caps at MAX_EVENTS_PER_DAY. TTL ~40 days.
 * @param {object} event
 * @param {{ CLICKS?: { get: Function, put: Function } }} env
 * @param {Date} [now]
 */
export async function appendClick(event, env, now = new Date()) {
  if (!env || !env.CLICKS || typeof env.CLICKS.get !== "function" || typeof env.CLICKS.put !== "function") {
    return { stored: false, reason: "no-binding" };
  }
  const day = londonDay(now);
  const key = clicksKey(day);
  const clicks = parseStoredClicks(await env.CLICKS.get(key));
  if (clicks.length >= MAX_EVENTS_PER_DAY) {
    return { stored: false, reason: "cap", day, key, count: clicks.length };
  }
  clicks.push({
    t: event.t,
    net: event.net,
    path: event.path,
    href: event.href,
    part: event.part,
    dest: event.dest,
  });
  await env.CLICKS.put(key, JSON.stringify(clicks), { expirationTtl: KV_TTL_SECONDS });
  return { stored: true, day, key, count: clicks.length };
}

function logClick(event) {
  // Non-PII fields only — makes `wrangler tail` a readable live click stream.
  console.log(
    JSON.stringify({
      net: event.net,
      path: event.path,
      part: event.part,
      dest: event.dest,
    })
  );
}

/**
 * @param {Request} request
 * @param {{ CLICKS?: { get: Function }, LIST_SECRET?: string }} env
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

  const raw = env && env.CLICKS && typeof env.CLICKS.get === "function"
    ? await env.CLICKS.get(clicksKey(dayParam))
    : null;
  const clicks = parseStoredClicks(raw);
  return jsonResponse(200, { day: dayParam, count: clicks.length, clicks });
}

export default {
  /**
   * @param {Request} request
   * @param {{ CLICKS?: { get: Function, put: Function }, LIST_SECRET?: string }} env
   */
  async fetch(request, env) {
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
    const parsed = parseClickBody(body);
    if (!parsed.ok) {
      return new Response(null, { status: parsed.status, headers });
    }

    await appendClick(parsed.event, env);
    logClick(parsed.event);
    return new Response(null, { status: 204, headers });
  },
};
