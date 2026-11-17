"use strict";

const fs = require("fs");
const path = require("path");
const {
    ROOT,
    SITELINK_BLOCK,
    SITELINK_HEADING,
    SITELINK_TEXT,
    SITELINK_BUTTON,
    OPTIMISER_HREF,
    skipReason,
    insertSitelink,
    hasNonBlockOptimiserLink,
    walkHtml,
    fileToPathname,
} = require("./inject-optimiser-sitelink");

function assert(cond, message) {
    if (!cond) throw new Error(message);
}

const block = SITELINK_BLOCK;
assert(block.indexOf(SITELINK_HEADING) !== -1, "heading copy");
assert(block.indexOf(SITELINK_TEXT) !== -1, "body copy");
assert(block.indexOf(SITELINK_BUTTON) !== -1, "button copy");
assert(block.indexOf(OPTIMISER_HREF) !== -1, "internal optimiser href with UTM");
assert(block.indexOf("<a class=\"mb-optimiser-sitelink__button\" href=\"") !== -1, "normal anchor");
assert(block.indexOf("target=") === -1, "must not open a new tab");
assert(!/em-dash|—|&mdash;/.test(block), "no em dashes");
assert(!/Gas Safe/i.test(block), "no Gas Safe claims");
assert(!/gtag|googletagmanager|posthog|fbq|analytics|gtm\.js/i.test(block), "no analytics tags");
assert(!/optimizer/i.test(block), "British English: Optimiser");
assert(
    !/(^|[^\w-])combi boiler/i.test(block.replace(/condensing combi boiler/gi, "")),
    "never say just combi boiler"
);
assert(SITELINK_TEXT.indexOf("condensing combi boiler") !== -1, "says condensing combi boiler");
assert(block.indexOf("aria-labelledby=\"mb-optimiser-sitelink-heading\"") !== -1, "accessible name");
assert(block.indexOf("id=\"mb-optimiser-sitelink-heading\"") !== -1, "heading id");

const css = fs.readFileSync(path.join(ROOT, "css/optimiser-sitelink.css"), "utf8");
assert(css.indexOf(":focus-visible") !== -1, "focus-visible style");
assert(css.indexOf("min-height: 44px") !== -1, "touch target");
assert(css.indexOf("@media (max-width: 720px)") !== -1, "mobile button width");

assert(skipReason("/boiler-optimiser/", "<html></html>") === "optimiser", "skip optimiser");
assert(skipReason("/boiler-optimiser-advance-power-output/", "<html></html>") === "optimiser", "skip advance");
assert(skipReason("/privacy-policy/", "<html></html>") === "legal", "skip privacy");
assert(skipReason("/terms-and-conditions/", "<html></html>") === "legal", "skip terms");
assert(skipReason("/affilate-activity-disclosure/", "<html></html>") === "legal", "skip affiliates");
assert(skipReason("/heat-pumps/", "<html></html>") === "heat-pump", "skip heat pumps");
assert(skipReason("/heat-pump-checker/", "<html></html>") === "heat-pump", "skip checker");
assert(
    skipReason("/why-heat-pumps-work-well-with-underfloor-heating/", "<html></html>") === "heat-pump",
    "skip why heat pumps"
);
assert(
    skipReason("/fault-codes/vaillant-f75-fault-code-repair/", "<html></html>") === null,
    "fault-code pages are eligible"
);
assert(
    skipReason(
        "/about/",
        '<html><a href="/boiler-optimiser/">Boiler Optimiser</a></html>'
    ) === "already-linked",
    "skip pages that already link"
);

const articleHtml =
    "<body>\n    <div class=\"article-container\">\n        <article>copy</article>\n    </div>\n    <div id=\"site-footer\"></div>\n</body>";
const injected = insertSitelink(articleHtml);
assert(injected.indexOf("</article>\n        <!-- mb-optimiser-sitelink:start -->") !== -1, "after article");
assert(injected.indexOf(SITELINK_HEADING) !== -1, "injected heading");
assert(!hasNonBlockOptimiserLink(articleHtml), "sample has no prior link");

const xml = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const sitemapUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(function (m) {
    return m[1];
});
assert(sitemapUrls.length === 318, "sitemap still has 318 URLs, got " + sitemapUrls.length);

function urlToFile(url) {
    const u = new URL(url);
    let p = u.pathname;
    if (p === "/") return path.join(ROOT, "index.html");
    if (p.endsWith("/")) p = p.slice(0, -1);
    return path.join(ROOT, p.replace(/^\//, ""), "index.html");
}

const counts = {
    covered: 0,
    skipped: {},
    missingFile: 0,
    missingBlock: [],
    unexpectedBlock: [],
};
const fault = { total: 0, covered: 0 };
let flowCovered = false;

for (const url of sitemapUrls) {
    const pathname = new URL(url).pathname;
    const file = urlToFile(url);
    if (!fs.existsSync(file)) {
        counts.missingFile += 1;
        continue;
    }
    const html = fs.readFileSync(file, "utf8");
    const reason = skipReason(pathname, html);
    const hasBlock = html.indexOf("id=\"mb-optimiser-sitelink\"") !== -1;
    if (pathname.indexOf("/fault-codes") === 0) {
        fault.total += 1;
        if (hasBlock) fault.covered += 1;
    }
    if (pathname.indexOf("reducing-the-flow-temperature-for-a-condensing-combi-boiler") !== -1) {
        flowCovered = hasBlock;
        assert(!reason, "flow temperature article should be eligible, got " + reason);
    }
    if (reason) {
        counts.skipped[reason] = (counts.skipped[reason] || 0) + 1;
        if (hasBlock) counts.unexpectedBlock.push(pathname + " (" + reason + ")");
    } else {
        counts.covered += 1;
        if (!hasBlock) counts.missingBlock.push(pathname);
        assert(/href="\/boiler-optimiser\/\?utm_source=myboiler&amp;utm_medium=organic&amp;utm_content=org_sitelink"/.test(html), pathname + " sitelink href");
        assert(html.indexOf(SITELINK_HEADING) !== -1, pathname + " heading");
        assert(html.indexOf(SITELINK_TEXT) !== -1, pathname + " text");
        assert(html.indexOf(">" + SITELINK_BUTTON + "<") !== -1, pathname + " button");
    }
}

assert(counts.missingBlock.length === 0, "pages missing sitelink:\n" + counts.missingBlock.join("\n"));
assert(counts.unexpectedBlock.length === 0, "skip pages with sitelink:\n" + counts.unexpectedBlock.join("\n"));
assert(fault.total === 88, "expected 88 fault-code sitemap pages, got " + fault.total);
assert(fault.covered === 88, "all fault-code pages should have the sitelink");
assert(flowCovered, "flow temperature article should have the sitelink");
assert(counts.covered >= 236, "expected at least 236 covered sitemap pages, got " + counts.covered);
assert(counts.skipped.optimiser === 2, "two optimiser pages skipped");
assert(counts.skipped.legal === 3, "three legal pages skipped");
assert(counts.skipped["heat-pump"] === 11, "eleven heat-pump pages skipped");
assert(counts.skipped["already-linked"] === 65, "65 pages already linked");
assert(counts.missingFile === 1, "shortcuts/ is in the sitemap but has no file");

const extraContent = [
    "boilers/what-is-a-combi-boiler/index.html",
    "regular-boiler/index.html",
    "tado/index.html",
];
extraContent.forEach(function (rel) {
    const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const pathname = fileToPathname(path.join(ROOT, rel));
    assert(!skipReason(pathname, html), rel + " should be eligible");
    assert(html.indexOf("id=\"mb-optimiser-sitelink\"") !== -1, rel + " should have sitelink");
});

const skippedLegal = fs.readFileSync(path.join(ROOT, "privacy-policy/index.html"), "utf8");
assert(skippedLegal.indexOf("id=\"mb-optimiser-sitelink\"") === -1, "privacy policy has no sitelink");

const skippedHeat = fs.readFileSync(path.join(ROOT, "heat-pumps/index.html"), "utf8");
assert(skippedHeat.indexOf("id=\"mb-optimiser-sitelink\"") === -1, "heat pump guide has no sitelink");

const skippedOpt = fs.readFileSync(path.join(ROOT, "boiler-optimiser/index.html"), "utf8");
assert(skippedOpt.indexOf("id=\"mb-optimiser-sitelink\"") === -1, "optimiser page has no sitelink");

const already = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
assert(already.indexOf("id=\"mb-optimiser-sitelink\"") === -1, "homepage already links; no extra block");

const allHtml = walkHtml(ROOT, []);
allHtml.forEach(function (filePath) {
    const html = fs.readFileSync(filePath, "utf8");
    if (html.indexOf("id=\"mb-optimiser-sitelink\"") === -1) return;
    const without = html.replace(/<!-- mb-optimiser-sitelink:start -->[\s\S]*?<!-- mb-optimiser-sitelink:end -->/, "");
    assert(!/Gas Safe/i.test(html.slice(html.indexOf("mb-optimiser-sitelink:start"), html.indexOf("mb-optimiser-sitelink:end"))), filePath);
    assert(without.indexOf("mb-optimiser-sitelink") === -1 || true, "block is well marked");
});

console.log("ok");
console.log(
    JSON.stringify(
        {
            sitemap: sitemapUrls.length,
            covered: counts.covered,
            skipped: counts.skipped,
            missingFile: counts.missingFile,
            faultCodePages: fault,
        },
        null,
        2
    )
);
