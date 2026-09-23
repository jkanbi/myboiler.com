/**
 * Same-origin affiliate click collector.
 * POST /api/aff-click  → Analytics Engine (affiliate_clicks)
 *
 * Cookieless: does not set cookies, does not read client identifiers,
 * and does not persist IP / UA / fingerprints.
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

/**
 * @param {Request} request
 * @returns {Record<string, string>}
 */
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://myboiler.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * @param {string} pathname
 */
function isCollectPath(pathname) {
  return pathname === "/api/aff-click" || pathname === "/api/aff-click/";
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
 * @param {object} event
 * @param {{ AFFILIATE_CLICKS?: { writeDataPoint: Function } }} env
 */
export function writeClick(event, env) {
  if (!env || !env.AFFILIATE_CLICKS || typeof env.AFFILIATE_CLICKS.writeDataPoint !== "function") {
    return;
  }
  // indexes: network (single sampling key).
  // blobs:   1 network, 2 path, 3 part, 4 dest id, 5 host+path
  // doubles: 1 client unix ms
  env.AFFILIATE_CLICKS.writeDataPoint({
    indexes: [event.net],
    blobs: [event.net, event.path, event.part, event.dest, event.href],
    doubles: [event.t],
  });
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

export default {
  /**
   * @param {Request} request
   * @param {{ AFFILIATE_CLICKS?: { writeDataPoint: Function } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
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
      return new Response(null, { status: 405, headers: { ...headers, Allow: "POST, OPTIONS, GET, HEAD" } });
    }

    const body = await request.text();
    const parsed = parseClickBody(body);
    if (!parsed.ok) {
      return new Response(null, { status: parsed.status, headers });
    }

    writeClick(parsed.event, env);
    return new Response(null, { status: 204, headers });
  },
};
