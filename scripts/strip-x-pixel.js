#!/usr/bin/env node
/**
 * Remove the inline X (Twitter) conversion pixel from every HTML page.
 * The pixel now loads from js/posthog-optimiser.js after consent, and
 * only on the two Boiler Optimiser pages.
 *
 * Usage (from repo root):
 *   node scripts/strip-x-pixel.js
 *   node scripts/strip-x-pixel.js --check
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".wrangler"]);

const BLOCK_RE =
    /(?:[ \t]*<!--\s*X conversion tracking base code\s*-->\s*\n)?[ \t]*<script data-cfasync="false">\s*!function\(e,t,n,s,u,a\)\{e\.twq[\s\S]*?<\/script>(?:\s*<!--\s*End X conversion tracking base code\s*-->)?\n?/g;

function walkHtml(dir, out) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walkHtml(path.join(dir, entry.name), out);
        } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

function stripPixel(html) {
    BLOCK_RE.lastIndex = 0;
    const next = html.replace(BLOCK_RE, "");
    return { html: next, changed: next !== html };
}

function stillHasPixel(html) {
    return /static\.ads-twitter\.com\/uwt\.js/.test(html) || /twq\(\s*['"]config['"]/.test(html);
}

function main() {
    const checkOnly = process.argv.includes("--check");
    const files = walkHtml(ROOT, []);
    let stripped = 0;
    let already = 0;
    const leftover = [];

    for (const filePath of files) {
        const original = fs.readFileSync(filePath, "utf8");
        const result = stripPixel(original);
        const html = checkOnly ? original : result.html;
        if (!checkOnly && result.changed) {
            fs.writeFileSync(filePath, html, "utf8");
            stripped += 1;
        } else if (!result.changed) {
            already += 1;
        }
        if (stillHasPixel(html)) leftover.push(path.relative(ROOT, filePath));
    }

    console.log(
        (checkOnly ? "Checked" : "Processed") +
            " " +
            files.length +
            " HTML files — stripped " +
            stripped +
            ", already clean " +
            already
    );
    if (leftover.length) {
        console.error("Pages still containing the X pixel:");
        leftover.forEach(function (line) {
            console.error("  " + line);
        });
        process.exit(1);
    }
}

module.exports = { stripPixel, stillHasPixel, main };

if (require.main === module) {
    main();
}
