#!/usr/bin/env node
/**
 * Insert the X (Twitter) conversion-tracking base pixel before </head>
 * on every HTML page. Idempotent: existing twq('config', ...) calls are
 * updated to nvyf0 instead of duplicating the snippet.
 *
 * The only snippet change is `data-cfasync="false"` on the script tag.
 * Cloudflare Rocket Loader is on for myboiler.com and would otherwise
 * rewrite this inline pixel.
 *
 * Usage (from repo root):
 *   node scripts/inject-x-pixel.js
 *   node scripts/inject-x-pixel.js --check
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PIXEL_ID = "nvyf0";
const SKIP_DIRS = new Set(["node_modules", ".git", ".wrangler"]);

const SNIPPET =
    "<!-- X conversion tracking base code -->\n" +
    "<script data-cfasync=\"false\">\n" +
    "!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);\n" +
    "},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',\n" +
    "a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');\n" +
    "twq('config','nvyf0');\n" +
    "</script>\n" +
    "<!-- End X conversion tracking base code -->";

const CONFIG_RE = /twq\(\s*['"]config['"]\s*,\s*['"][^'"]*['"]\s*\)/g;
const TARGET_CONFIG = "twq('config','nvyf0')";

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

function lineIndent(html, index) {
    const lineStart = html.lastIndexOf("\n", index) + 1;
    const match = html.slice(lineStart, index).match(/^[ \t]*/);
    return match ? match[0] : "";
}

function indentBlock(block, prefix) {
    return block
        .split("\n")
        .map(function (line) {
            return prefix + line;
        })
        .join("\n");
}

function countConfig(html) {
    const matches = html.match(CONFIG_RE);
    return matches ? matches.length : 0;
}

function injectXPixel(html) {
    const count = countConfig(html);
    if (count === 1 && html.indexOf(TARGET_CONFIG) !== -1) {
        return { html: html, status: "already" };
    }
    if (count >= 1) {
        return { html: html.replace(CONFIG_RE, TARGET_CONFIG), status: "updated" };
    }

    const headMatch = html.match(/<\/head>/i);
    if (!headMatch) {
        return { html: html, status: "no-head" };
    }
    const idx = headMatch.index;
    const prefix = lineIndent(html, idx) || "    ";
    const block = indentBlock(SNIPPET, prefix) + "\n";
    return { html: html.slice(0, idx) + block + html.slice(idx), status: "injected" };
}

function main() {
    const checkOnly = process.argv.includes("--check");
    const files = walkHtml(ROOT, []);
    const summary = {
        injected: 0,
        updated: 0,
        already: 0,
        "no-head": 0,
        bad: [],
    };

    for (const filePath of files) {
        const original = fs.readFileSync(filePath, "utf8");
        const result = injectXPixel(original);
        const rel = path.relative(ROOT, filePath);

        if (!checkOnly && result.html !== original) {
            fs.writeFileSync(filePath, result.html, "utf8");
        }

        const html = checkOnly ? original : result.html;
        const configs = countConfig(html);
        if (configs !== 1 || html.indexOf(TARGET_CONFIG) === -1) {
            summary.bad.push(rel + " (twq config count=" + configs + ")");
        }

        if (Object.prototype.hasOwnProperty.call(summary, result.status)) {
            summary[result.status] += 1;
        }
    }

    const action = checkOnly ? "Checked" : "Processed";
    console.log(
        action +
            " " +
            files.length +
            " HTML files — injected " +
            summary.injected +
            ", updated " +
            summary.updated +
            ", already " +
            summary.already +
            ", no </head> " +
            summary["no-head"]
    );
    if (summary.bad.length) {
        console.error("Pages without exactly one " + TARGET_CONFIG + ":");
        summary.bad.forEach(function (line) {
            console.error("  " + line);
        });
        process.exit(1);
    }
}

module.exports = { SNIPPET, PIXEL_ID, TARGET_CONFIG, injectXPixel, countConfig };

if (require.main === module) {
    main();
}
