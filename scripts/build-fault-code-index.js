#!/usr/bin/env node
/**
 * Build a static fault-code search index from MyBoiler HTML tables / pages.
 *
 * Usage (from repo root):
 *   node scripts/build-fault-code-index.js
 *
 * Reads every page under fault-codes/ (except request/ and this hub),
 * extracts table rows (and Vaillant individual-page titles as a fallback),
 * writes fault-codes/fault-codes-index.json.
 *
 * Do not pull data from boilermanuals.com — regenerate from these pages only.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FAULT_DIR = path.join(ROOT, "fault-codes");
const OUT_FILE = path.join(FAULT_DIR, "fault-codes-index.json");

const SKIP_DIRS = new Set(["request", "faults-and-fixes"]);
const SKIP_FILES = new Set([
  path.join(FAULT_DIR, "index.html"),
  path.join(FAULT_DIR, "fault-codes-index.json"),
]);

const BRAND_FROM_SLUG = {
  "alpha-fault-codes": "Alpha",
  "ambirad-fault-codes": "Ambirad",
  "amptec-fault-codes": "Amptec",
  "ariston-fault-codes": "Ariston",
  "atag-fault-codes": "Atag",
  "atmos-fault-codes": "Atmos",
  "baxi-fault-codes": "Baxi",
  "biasi-fault-codes": "Biasi",
  "glow-worm-fault-codes": "Glow-Worm",
  "intergas-fault-codes": "Intergas",
  "main-fault-codes": "Main",
  "navien-fault-codes": "Navien",
  "potterton-fault-codes": "Potterton",
  "remeha-fault-codes": "Remeha",
  "vaillant-fault-codes": "Vaillant",
  "vokera-fault-codes": "Vokèra",
  "worcester-bosch-fault-codes": "Worcester Bosch",
  "zanussi-fault-codes": "Zanussi",
};

const BRAND_ALIASES = {
  worcester: "Worcester Bosch",
  "worcester bosch": "Worcester Bosch",
  bosch: "Worcester Bosch",
  "glow worm": "Glow-Worm",
  "glow-worm": "Glow-Worm",
  glowworm: "Glow-Worm",
  vokera: "Vokèra",
  "vokèra": "Vokèra",
  vaillant: "Vaillant",
};

const CODE_HEADERS = [
  "faultcode",
  "fault code",
  "fault codes",
  "error code",
  "display code",
  "main display code",
  "code",
  "codes",
];
const TITLE_HEADERS = [
  "fault",
  "meaning",
  "description",
  "possible fault",
  "possible cause",
];
const DETAIL_HEADERS = [
  "possible cause",
  "cause",
  "remedy",
  "user action",
  "installer action",
  "check / solution",
  "check/solution",
  "possible solution",
  "solution",
];
const MODEL_HEADERS = ["model specific", "models", "model"];

const JUNK_CODES = new Set([
  "",
  "faultcode",
  "fault code",
  "fault codes",
  "error code",
  "display code",
  "main display code",
  "code",
  "codes",
  "lights are:",
  "lights are",
]);

function walkHtml(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkHtml(full, out);
    } else if (entry.isFile() && entry.name === "index.html") {
      if (!SKIP_FILES.has(full)) out.push(full);
    }
  }
  return out;
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function stripTags(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstHref(html) {
  const match = String(html || "").match(/href=["']([^"']+)["']/i);
  return match ? match[1] : "";
}

function normalizeCode(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function publicUrl(filePath) {
  const rel = path.relative(ROOT, path.dirname(filePath)).split(path.sep).join("/");
  return "/" + rel + "/";
}

function brandFromFile(filePath) {
  const rel = path.relative(FAULT_DIR, filePath).split(path.sep);
  const top = rel[0];
  if (BRAND_FROM_SLUG[top]) return BRAND_FROM_SLUG[top];
  if (/^vaillant-/i.test(top)) return "Vaillant";
  if (/^worcester-/i.test(top)) return "Worcester Bosch";
  if (/^potterton-/i.test(top)) return "Potterton";
  if (/^baxi-/i.test(top)) return "Baxi";
  return top
    .replace(/-fault-codes$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pageKind(filePath, html) {
  const rel = path.relative(FAULT_DIR, path.dirname(filePath)).split(path.sep);
  const top = rel[0];
  if (BRAND_FROM_SLUG[top] && rel.length === 1) return "brand";
  if (BRAND_FROM_SLUG[top] && rel.length > 1) return "range";
  if (/-fault-codes$/i.test(top)) return /<table/i.test(html) ? "table" : "page";
  return "article";
}

function rangeLabel(filePath, html) {
  const h1 = html.match(/<h1[^>]*class="article-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1 ? stripTags(h1[1]).replace(/\s+Fault Codes$/i, "") : "";
  const rel = path.relative(FAULT_DIR, path.dirname(filePath)).split(path.sep);
  if (rel.length > 1) return title || rel[rel.length - 1].replace(/-/g, " ");
  return "";
}

function headerKey(text) {
  return stripTags(text).toLowerCase().replace(/\s+/g, " ").trim();
}

function classifyHeaders(cells) {
  const keys = cells.map(headerKey);
  const find = (list) => keys.findIndex((k) => list.includes(k));
  let code = find(CODE_HEADERS);
  let title = keys.findIndex((k) => TITLE_HEADERS.includes(k) && k !== keys[code]);
  let detail = keys.findIndex(
    (k, i) => DETAIL_HEADERS.includes(k) && i !== title && i !== code
  );
  let model = find(MODEL_HEADERS);
  let repair = keys.findIndex((k) => k === "repair" || k === "resources");
  if (code < 0) code = 0;
  if (title < 0) title = keys.length > 1 ? 1 : -1;
  if (detail < 0) {
    for (let i = 0; i < keys.length; i++) {
      if (i !== code && i !== title && i !== model && i !== repair) {
        detail = i;
        break;
      }
    }
  }
  return { code, title, detail, model, repair };
}

function extractTables(html) {
  const tables = [];
  const tableRe = /<table\b[\s\S]*?<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html))) {
    const tableHtml = tableMatch[0];
    const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
    const rows = [];
    let rowMatch;
    while ((rowMatch = rowRe.exec(tableHtml))) {
      const rowHtml = rowMatch[0];
      const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowHtml))) {
        cells.push({
          tag: cellMatch[1].toLowerCase(),
          raw: cellMatch[3],
          text: stripTags(cellMatch[3]),
        });
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

function splitCodes(codeText) {
  const raw = String(codeText || "").trim();
  if (!raw) return [];
  if (/,/.test(raw) && /[0-9]/.test(raw) && raw.length < 80) {
    const parts = raw
      .split(/[,/]| and /i)
      .map((p) => p.replace(/^[\s.]+|[\s.]+$/g, "").trim())
      .filter(Boolean);
    if (parts.length > 1 && parts.every((p) => normalizeCode(p).length > 0 && p.length < 24)) {
      const prefix = raw.match(/^([A-Za-z]\.?)/);
      return parts.map((part) => {
        if (prefix && /^[0-9]/.test(part) && !/^[A-Za-z]/.test(part)) {
          return prefix[1] + part;
        }
        return part;
      });
    }
  }
  return [raw];
}

function looksLikeFaultCode(code) {
  const t = String(code || "").trim();
  if (!t || t.length > 70) return false;
  if (/ecotec|plus|pro \d|vu gb|vuw gb|greenstar|evoke|protec plus/i.test(t) && !/^[A-Z0-9. \-/]+$/i.test(t.replace(/ecotec|plus|pro/gi, ""))) {
    return false;
  }
  if (/^(ecotec|greenstar|worcester|vaillant|alpha|baxi)\b/i.test(t)) return false;
  if (/^#/.test(t)) return true;
  if (/^[A-Za-z]{0,3}[.\- ]?\d{1,4}([.\- ]?\d{0,3})?$/i.test(t)) return true;
  if (/^\d{1,3}[A-Za-z]\d{0,3}$/i.test(t)) return true;
  if (/^0[A-Za-z]\d+/i.test(t)) return true;
  if (/^[A-Za-z]{1,3}$/i.test(t)) return true;
  if (/^[A-Za-z]\.\d+/i.test(t)) return true;
  if (/lights|flashing|illuminated|no display|connection|no lights/i.test(t)) return true;
  if (/[/,-]/.test(t) && /[0-9]/.test(t) && t.length < 40) return true;
  return false;
}

function isJunkCode(code) {
  const key = headerKey(code);
  if (JUNK_CODES.has(key)) return true;
  if (key.length > 80) return true;
  if (/^lights are/i.test(key)) return true;
  if (!looksLikeFaultCode(code)) return true;
  return false;
}

function clip(text, max) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return value.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

function addEntry(entries, entry) {
  if (!entry.code || isJunkCode(entry.code)) return;
  const codeNorm = normalizeCode(entry.code);
  if (!codeNorm) return;
  const key = [
    entry.brand,
    codeNorm,
    (entry.title || "").toLowerCase().slice(0, 80),
    (entry.model || "").toLowerCase().slice(0, 40),
  ].join("|");
  if (entries._seen.has(key)) return;
  entries._seen.add(key);
  entries.push({
    brand: entry.brand,
    code: entry.code,
    codeNorm,
    title: clip(entry.title, 180),
    detail: clip(entry.detail, 280),
    model: clip(entry.model, 80),
    url: entry.url,
    page: entry.page,
    deep: Boolean(entry.deep),
  });
}

function collectFromTables(filePath, html, entries) {
  const brand = brandFromFile(filePath);
  const page = publicUrl(filePath);
  const range = rangeLabel(filePath, html);
  const tables = extractTables(html);
  for (const rows of tables) {
    let map = { code: 0, title: 1, detail: 2, model: -1, repair: -1 };
    let start = 0;
    if (rows[0] && rows[0].every((c) => c.tag === "th")) {
      map = classifyHeaders(rows[0].map((c) => c.raw));
      start = 1;
    }
    for (let i = start; i < rows.length; i++) {
      const cells = rows[i];
      const codeCell = cells[map.code];
      if (!codeCell) continue;
      const codeText = codeCell.text;
      if (!codeText) continue;
      const title =
        (map.title >= 0 && cells[map.title] && cells[map.title].text) || "";
      const detail =
        (map.detail >= 0 && cells[map.detail] && cells[map.detail].text) || "";
      const model =
        (map.model >= 0 && cells[map.model] && cells[map.model].text) || range;
      let deepUrl = "";
      if (map.repair >= 0 && cells[map.repair]) {
        deepUrl = firstHref(cells[map.repair].raw);
      }
      if (!deepUrl) {
        for (const cell of cells) {
          const href = firstHref(cell.raw);
          if (href && /\/fault-codes\/vaillant-/i.test(href)) {
            deepUrl = href;
            break;
          }
        }
      }
        const codes = splitCodes(codeText);
      for (const code of codes) {
        addEntry(entries, {
          brand,
          code,
          title,
          detail,
          model,
          url: deepUrl || page + "?code=" + encodeURIComponent(code),
          page,
          deep: Boolean(deepUrl),
        });
      }
    }
  }
}

function entryPageForArticle(filePath) {
  const brand = brandFromFile(filePath);
  const slug = {
    Vaillant: "/fault-codes/vaillant-fault-codes/",
    "Worcester Bosch": "/fault-codes/worcester-bosch-fault-codes/",
    Potterton: "/fault-codes/potterton-fault-codes/",
  };
  return slug[brand] || publicUrl(filePath);
}

function collectFromArticle(filePath, html, entries) {
  const brand = brandFromFile(filePath);
  const page = publicUrl(filePath);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = h1 ? stripTags(h1[1]) : "";
  const codeMatch =
    heading.match(/\bfault code\s+([A-Za-z]\.?\d{0,3})\b/i) ||
    heading.match(/\b([A-Z]\.?\d{1,3}(?:\s*and\s*[A-Z]\.?\d{1,3})?)\b/i) ||
    heading.match(/\b(Com|EA|FA|Fd)\b/i);
  if (!codeMatch) return;
  const already = entries.some(
    (e) => e.deep && e.url.replace(/\/$/, "") === page.replace(/\/$/, "")
  );
  if (already) return;
  const meaning = html.match(
    /<h3[^>]*>[\s\S]*?Meaning[\s\S]*?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i
  );
  const title = meaning ? stripTags(meaning[1]) : heading;
  const codes = heading.toLowerCase().includes("and")
    ? heading.match(/[A-Z]\.?\d{1,3}/gi) || [codeMatch[1]]
    : [codeMatch[1].replace(/\s+and.*$/i, "")];
  for (const code of codes) {
    addEntry(entries, {
      brand,
      code: code.replace(/^F(\d)/i, "F.$1").replace(/^f(\d)/, "F.$1"),
      title,
      detail: "",
      model: "",
      url: page,
      page: entryPageForArticle(filePath),
      deep: true,
    });
  }
}

function brandRecords(files, htmlByFile) {
  const brands = [];
  const seen = new Set();
  for (const filePath of files) {
    const html = htmlByFile.get(filePath);
    const kind = pageKind(filePath, html);
    if (kind !== "brand" && kind !== "range") continue;
    const brand = brandFromFile(filePath);
    const url = publicUrl(filePath);
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const name =
      kind === "range"
        ? rangeLabel(filePath, html)
        : brand;
    const key = url;
    if (seen.has(key)) continue;
    seen.add(key);
    brands.push({
      brand,
      name: name || brand,
      url,
      kind,
      hasTable: /<table/i.test(html),
    });
  }
  for (const [alias, brand] of Object.entries(BRAND_ALIASES)) {
    if (!brands.some((b) => b.brand === brand && b.kind === "brand")) continue;
    if (!brands.some((b) => b.alias === alias)) {
      /* aliases live on the JSON root, not as extra brand rows */
    }
  }
  return brands;
}

function main() {
  const files = walkHtml(FAULT_DIR, []).sort();
  const htmlByFile = new Map();
  for (const filePath of files) {
    htmlByFile.set(filePath, fs.readFileSync(filePath, "utf8"));
  }

  const entries = [];
  entries._seen = new Set();

  for (const filePath of files) {
    const html = htmlByFile.get(filePath);
    if (/<table/i.test(html) && pageKind(filePath, html) !== "article") {
      collectFromTables(filePath, html, entries);
    }
  }
  for (const filePath of files) {
    const html = htmlByFile.get(filePath);
    if (pageKind(filePath, html) === "article") {
      collectFromArticle(filePath, html, entries);
    }
  }

  delete entries._seen;

  const brands = brandRecords(files, htmlByFile);
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: "fault-codes/**/index.html (MyBoiler pages only)",
    brands,
    aliases: BRAND_ALIASES,
    codes: entries,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload) + "\n", "utf8");
  const byBrand = {};
  for (const entry of entries) {
    byBrand[entry.brand] = (byBrand[entry.brand] || 0) + 1;
  }
  const summary = Object.keys(byBrand)
    .sort()
    .map((b) => "  " + b + ": " + byBrand[b])
    .join("\n");
  console.log(
    "Wrote " +
      entries.length +
      " codes from " +
      files.length +
      " pages to " +
      path.relative(ROOT, OUT_FILE)
  );
  console.log(summary);
}

main();
