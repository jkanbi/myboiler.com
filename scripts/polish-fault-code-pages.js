#!/usr/bin/env node
/**
 * One-off / repeatable polish for fault-codes HTML pages:
 * titles, back-links, and shared search/filter assets.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FAULT_DIR = path.join(ROOT, "fault-codes");

const CSS_TAG =
    '<link rel="stylesheet" type="text/css" href="/css/fault-codes.css">';
const JS_TAG =
    '<script type="text/javascript" src="/js/fault-codes.js" data-cfasync="false"></script>';

function walkHtml(dir, out) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkHtml(full, out);
        else if (entry.isFile() && entry.name === "index.html") out.push(full);
    }
    return out;
}

function insertAfter(html, needle, insert) {
    if (html.indexOf(insert) !== -1) return html;
    const idx = html.indexOf(needle);
    if (idx === -1) return html;
    return html.slice(0, idx + needle.length) + "\n    " + insert + html.slice(idx + needle.length);
}

function insertBefore(html, needle, insert) {
    if (html.indexOf(insert) !== -1) return html;
    const idx = html.indexOf(needle);
    if (idx === -1) return html;
    return html.slice(0, idx) + insert + "\n    " + html.slice(idx);
}

function brandBackLink(filePath) {
    const rel = path.relative(FAULT_DIR, path.dirname(filePath)).split(path.sep);
    const top = rel[0];
    if (top === "baxi-fault-codes" && rel.length > 1) {
        return '<p class="article-back"><a href="/fault-codes/">Fault codes</a> / <a href="/fault-codes/baxi-fault-codes/">Baxi</a></p>';
    }
    if (/^vaillant-/i.test(top) && top !== "vaillant-fault-codes") {
        return '<p class="article-back"><a href="/fault-codes/">Fault codes</a> / <a href="/fault-codes/vaillant-fault-codes/">Vaillant</a></p>';
    }
    if (top && top !== ".") {
        return '<p class="article-back"><a href="/fault-codes/">Back to fault codes</a></p>';
    }
    return "";
}

function polish(filePath) {
    let html = fs.readFileSync(filePath, "utf8");
    const original = html;
    const rel = path.relative(FAULT_DIR, filePath);

    html = html.replace(/MyBoiler Hub/g, "MyBoiler.com");
    html = html.replace(/not on the Hub yet/g, "not listed yet");
    html = html.replace(/this hub/g, "MyBoiler.com");
    html = html.replace(/the old Hub had the same placeholder\./g, "Grey names open a request form.");

    if (rel !== "index.html") {
        html = insertAfter(
            html,
            '<link rel="stylesheet" type="text/css" href="/css/styles.css">',
            CSS_TAG
        );
        html = insertBefore(
            html,
            '<script type="text/javascript" src="/js/menu.js" data-cfasync="false"></script>',
            JS_TAG
        );
    }

    if (rel === "ariston-fault-codes/index.html") {
        html = html.replace(
            '<p class="article-back"><a href="/advice/">Back to Advice</a></p>',
            '<p class="article-back"><a href="/fault-codes/">Back to fault codes</a></p>'
        );
    }

    if (rel === "vaillant-fault-codes/index.html" && html.indexOf("Back to fault codes") === -1) {
        html = html.replace(
            '<article class="article-content">',
            '<article class="article-content">\n<p class="article-back"><a href="/fault-codes/">Back to fault codes</a></p>'
        );
    }

    if (rel.startsWith("baxi-fault-codes/") && rel !== "baxi-fault-codes/index.html") {
        html = html.replace(
            '<p class="article-back"><a href="/fault-codes/">Back to fault codes</a></p>',
            '<p class="article-back"><a href="/fault-codes/">Fault codes</a> / <a href="/fault-codes/baxi-fault-codes/">Baxi</a></p>'
        );
    }

    if (/^vaillant-/i.test(rel) && rel !== "vaillant-fault-codes/index.html") {
        const crumb = brandBackLink(filePath);
        html = html.replace(
            /<p class="article-back"><a href="\/fault-codes\/vaillant-fault-codes\/">Back to Vaillant Fault Codes<\/a><\/p>/,
            crumb
        );
        html = html.replace(
            /<p><a href="\/vaillant-fault-codes\/"><button>Back to Vaillant Fault Codes<\/button><\/a><\/p>/,
            crumb
        );
        if (html.indexOf('href="/fault-codes/"') === -1) {
            html = html.replace(
                '<article class="article-content">',
                '<article class="article-content">\n' + crumb
            );
        }
    }

    if (html !== original) {
        fs.writeFileSync(filePath, html, "utf8");
        return true;
    }
    return false;
}

function main() {
    const files = walkHtml(FAULT_DIR, []);
    let changed = 0;
    for (const filePath of files) {
        if (polish(filePath)) changed += 1;
    }
    console.log("Polished " + changed + " of " + files.length + " fault-code pages");
}

main();
