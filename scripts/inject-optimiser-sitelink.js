#!/usr/bin/env node
/**
 * Insert the reusable Boiler Optimiser sitelink after main content.
 *
 * One block, used on article, fault-code, calculator, and other content pages
 * that do not already link to /boiler-optimiser/. Skip Optimiser pages, legal
 * pages, heat-pump preview pages, redirects, and noindex stubs.
 *
 *   node scripts/inject-optimiser-sitelink.js
 *   node scripts/inject-optimiser-sitelink.js --check
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BLOCK_START = "<!-- mb-optimiser-sitelink:start -->";
const BLOCK_END = "<!-- mb-optimiser-sitelink:end -->";
const BLOCK_RE = /[ \t]*<!-- mb-optimiser-sitelink:start -->[\s\S]*?<!-- mb-optimiser-sitelink:end -->\n?/;

const OPTIMISER_HREF =
    "/boiler-optimiser/?utm_source=myboiler&amp;utm_medium=organic&amp;utm_content=org_sitelink";

const SITELINK_HEADING = "Is your boiler flow temperature set right?";
const SITELINK_TEXT =
    "If you have a condensing combi boiler, our free Boiler Optimiser suggests a starting boiler flow temperature for your brand and model in about a minute. Any savings shown are calculator estimates.";
const SITELINK_BUTTON = "Try the Boiler Optimiser";

const SITELINK_BLOCK = [
    BLOCK_START,
    '<link rel="stylesheet" type="text/css" href="/css/optimiser-sitelink.css?v=1">',
    '<aside class="mb-optimiser-sitelink" id="mb-optimiser-sitelink" aria-labelledby="mb-optimiser-sitelink-heading">',
    '    <div class="mb-optimiser-sitelink__card">',
    "        <h2 id=\"mb-optimiser-sitelink-heading\">" + SITELINK_HEADING + "</h2>",
    "        <p>" + SITELINK_TEXT + "</p>",
    '        <p class="mb-optimiser-sitelink__action"><a class="mb-optimiser-sitelink__button" href="' +
        OPTIMISER_HREF +
        '">' +
        SITELINK_BUTTON +
        "</a></p>",
    "    </div>",
    "</aside>",
    BLOCK_END,
].join("\n");

const SKIP_DIRS = new Set([
    ".git",
    "node_modules",
    "workers",
    "scripts",
    "css",
    "js",
    "img",
    "assets",
    "pages",
    "includes",
]);

function fileToPathname(filePath) {
    const rel = path.relative(ROOT, path.dirname(filePath)).split(path.sep).join("/");
    if (!rel || rel === ".") return "/";
    return "/" + rel + "/";
}

function isOptimiserPath(pathname) {
    return /(^|\/)boiler-optimiser(\/|-|$)/.test(pathname) || /(^|\/)boiler-optimisation(\/|$)/.test(pathname);
}

function isLegalPath(pathname) {
    return (
        pathname === "/privacy-policy/" ||
        pathname === "/terms-and-conditions/" ||
        pathname === "/affilate-activity-disclosure/"
    );
}

function isHeatPumpPath(pathname) {
    return /heat-pump/.test(pathname);
}

function isRedirectPage(html) {
    return /http-equiv=["']refresh/i.test(html);
}

function isNoindexPage(html) {
    return /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);
}

function stripSitelink(html) {
    return html.replace(BLOCK_RE, "");
}

function hasNonBlockOptimiserLink(html) {
    return /<a\b[^>]*href=["'][^"']*boiler-optimiser/i.test(stripSitelink(html));
}

function skipReason(pathname, html) {
    if (pathname === "/pages/" || pathname.indexOf("/pages/") === 0) return "template";
    if (isOptimiserPath(pathname)) return "optimiser";
    if (isLegalPath(pathname)) return "legal";
    if (isHeatPumpPath(pathname)) return "heat-pump";
    if (isRedirectPage(html)) return "redirect";
    if (isNoindexPage(html)) return "noindex";
    if (hasNonBlockOptimiserLink(html)) return "already-linked";
    return null;
}

function lineStartIndex(html, atIndex) {
    return html.lastIndexOf("\n", atIndex - 1) + 1;
}

function indentOf(html, atIndex) {
    let lineStart = lineStartIndex(html, atIndex);
    let indent = html.slice(lineStart, atIndex).match(/^[ \t]*/)[0] || "";
    if (!indent && lineStart > 0) {
        const prevStart = lineStartIndex(html, lineStart - 1);
        indent = (html.slice(prevStart, lineStart).match(/^[ \t]*/) || [""])[0];
    }
    return indent;
}

function indentBlock(html, atIndex) {
    const indent = indentOf(html, atIndex);
    return SITELINK_BLOCK.split("\n")
        .map(function (line) {
            return indent + line;
        })
        .join("\n");
}

function insertSitelink(html) {
    const cleaned = stripSitelink(html);
    const articleClose = cleaned.lastIndexOf("</article>");
    if (articleClose !== -1) {
        const at = articleClose + "</article>".length;
        const block = indentBlock(cleaned, articleClose);
        return cleaned.slice(0, at) + "\n" + block + cleaned.slice(at);
    }

    const footerAt = cleaned.indexOf('<div id="site-footer">');
    if (footerAt !== -1) {
        const start = lineStartIndex(cleaned, footerAt);
        const block = indentBlock(cleaned, footerAt);
        return cleaned.slice(0, start) + block + "\n" + cleaned.slice(start);
    }

    const bodyClose = cleaned.lastIndexOf("</body>");
    if (bodyClose !== -1) {
        const start = lineStartIndex(cleaned, bodyClose);
        const block = indentBlock(cleaned, bodyClose);
        return cleaned.slice(0, start) + block + "\n" + cleaned.slice(start);
    }

    return cleaned + "\n" + SITELINK_BLOCK + "\n";
}

function walkHtml(dir, out) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkHtml(full, out);
        else if (entry.isFile() && entry.name === "index.html") out.push(full);
    }
    return out;
}

function processFile(filePath, write) {
    const html = fs.readFileSync(filePath, "utf8");
    const pathname = fileToPathname(filePath);
    const reason = skipReason(pathname, html);
    if (reason) {
        if (BLOCK_RE.test(html) && write) {
            fs.writeFileSync(filePath, stripSitelink(html), "utf8");
            return { status: "stripped", reason: reason, pathname: pathname };
        }
        return { status: "skipped", reason: reason, pathname: pathname };
    }

    const next = insertSitelink(html);
    const hasBlock = next.indexOf(BLOCK_START) !== -1;
    if (!hasBlock) return { status: "failed", reason: "insert-failed", pathname: pathname };
    if (next === html) return { status: "already", pathname: pathname };
    if (write) fs.writeFileSync(filePath, next, "utf8");
    return { status: "injected", pathname: pathname };
}

function main() {
    const check = process.argv.indexOf("--check") !== -1;
    const files = walkHtml(ROOT, []);
    const counts = {
        injected: 0,
        already: 0,
        skipped: 0,
        stripped: 0,
        failed: 0,
    };
    const skippedBy = {};
    const failed = [];

    for (const filePath of files) {
        const result = processFile(filePath, !check);
        counts[result.status] = (counts[result.status] || 0) + 1;
        if (result.status === "skipped" || result.status === "stripped") {
            skippedBy[result.reason] = (skippedBy[result.reason] || 0) + 1;
        }
        if (result.status === "failed") failed.push(result.pathname);
        if (check && result.status === "injected") {
            failed.push(result.pathname + " (missing sitelink)");
        }
    }

    const label = check ? "check" : "inject";
    console.log(
        label +
            ": injected=" +
            counts.injected +
            " already=" +
            counts.already +
            " skipped=" +
            counts.skipped +
            " stripped=" +
            counts.stripped +
            " failed=" +
            counts.failed
    );
    console.log("skipped by", skippedBy);
    if (failed.length) {
        console.error("failed pages:\n" + failed.join("\n"));
        process.exit(1);
    }
    if (check && counts.injected) process.exit(1);
}

module.exports = {
    ROOT,
    SITELINK_BLOCK,
    SITELINK_HEADING,
    SITELINK_TEXT,
    SITELINK_BUTTON,
    OPTIMISER_HREF,
    skipReason,
    insertSitelink,
    hasNonBlockOptimiserLink,
    fileToPathname,
    processFile,
    walkHtml,
    isOptimiserPath,
    isLegalPath,
    isHeatPumpPath,
};

if (require.main === module) {
    main();
}
