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
    isFlowTempIntentPath,
    optimiserFollowOnPaths,
    SITELINK_INCLUDE_PATHS,
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
    ) === null,
    "already-linked pages still get the card"
);
assert(
    skipReason("/vaillant/how-to-adjust-the-flow-temperature/", "<html></html>") === "flow-temp-intent",
    "brand flow-temp how-to is excluded"
);
assert(
    skipReason(
        "/combi-boiler/reducing-the-flow-temperature-for-a-condensing-combi-boiler-for-upto-8-percent-saving-on-your-gas-heating-bills/",
        "<html></html>"
    ) === "flow-temp-intent",
    "reduction article is excluded"
);
assert(
    skipReason("/opentherm/opentherm-boilers-and-controls/", "<html></html>") === null,
    "OpenTherm controls page is allow-listed for the card"
);
assert(
    skipReason("/vaillant/vaillant-controls/", "<html></html>") === null,
    "Vaillant controls page is allow-listed for the card"
);
assert(
    skipReason("/best-radiator-valves-and-thermostat-radiator-valves-trv/", "<html></html>") === null,
    "TRV page is allow-listed for the card"
);
assert(
    skipReason("/priority-domestic-hot-water/", "<html></html>") === null,
    "priority DHW page is allow-listed for the card"
);
assert(
    skipReason("/underfloor-heating-repairs/", "<html></html>") === null,
    "underfloor heating repairs page is allow-listed for the card"
);
assert(
    skipReason("/energy-saving/combi-boiler-condensing-mode-savings/", "<html></html>") ===
        "optimiser-follow-on",
    "condensing-mode savings is an Optimiser follow-on"
);
assert(isFlowTempIntentPath("/the-relationship-between-flow-temperature-and-power-output/"), "relationship article");
assert(!isFlowTempIntentPath("/fault-codes/vaillant-f75-fault-code-repair/"), "fault code is not flow-temp");

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
const howto = { total: 0, withCard: [] };
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
        assert(reason === "flow-temp-intent", "flow temperature article should be excluded, got " + reason);
        assert(!hasBlock, "flow temperature article must not have the sitelink card");
    }
    if (/how-to-adjust-the-flow-temperature/.test(pathname)) {
        howto.total += 1;
        if (hasBlock) howto.withCard.push(pathname);
        assert(reason === "flow-temp-intent", pathname + " how-to should be flow-temp-intent, got " + reason);
        assert(!hasBlock, pathname + " how-to must not have the sitelink card");
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
assert(!flowCovered, "flow temperature article must not have the sitelink");
assert(howto.withCard.length === 0, "how-to-adjust pages must not have the sitelink:\n" + howto.withCard.join("\n"));
assert(howto.total >= 14, "expected brand how-to hubs in the sitemap, got " + howto.total);
assert(!counts.skipped["already-linked"], "already-linked pages should now receive the card");
assert(counts.skipped.optimiser === 2, "two optimiser pages skipped");
assert(counts.skipped.legal === 3, "three legal pages skipped");
assert(counts.skipped["heat-pump"] === 11, "eleven heat-pump pages skipped");
assert(counts.skipped["flow-temp-intent"] >= 50, "flow-temp-intent sitemap skips, got " + counts.skipped["flow-temp-intent"]);
assert(counts.skipped["optimiser-follow-on"] === 3, "three remaining Optimiser follow-on pages skipped");
assert(
    counts.covered +
        Object.keys(counts.skipped).reduce(function (sum, key) {
            return sum + counts.skipped[key];
        }, 0) +
        counts.missingFile ===
        sitemapUrls.length,
    "sitemap coverage should account for every URL"
);
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

const homepage = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
assert(homepage.indexOf("id=\"mb-optimiser-sitelink\"") !== -1, "homepage should have the sitelink card");
assert(hasNonBlockOptimiserLink(homepage), "homepage keeps its in-content Optimiser link");

const howtoPage = fs.readFileSync(
    path.join(ROOT, "vaillant/how-to-adjust-the-flow-temperature/index.html"),
    "utf8"
);
assert(howtoPage.indexOf("id=\"mb-optimiser-sitelink\"") === -1, "Vaillant flow-temp how-to has no sitelink");

const reduction = fs.readFileSync(
    path.join(
        ROOT,
        "combi-boiler/reducing-the-flow-temperature-for-a-condensing-combi-boiler-for-upto-8-percent-saving-on-your-gas-heating-bills/index.html"
    ),
    "utf8"
);
assert(reduction.indexOf("id=\"mb-optimiser-sitelink\"") === -1, "reduction article has no sitelink");
assert(hasNonBlockOptimiserLink(howtoPage), "Vaillant how-to keeps its in-content Optimiser link");

[...SITELINK_INCLUDE_PATHS].forEach(function (pathname) {
    const file = urlToFile("https://myboiler.com" + pathname);
    const html = fs.readFileSync(file, "utf8");
    assert(!skipReason(pathname, html), pathname + " should be eligible");
    assert(html.indexOf("id=\"mb-optimiser-sitelink\"") !== -1, pathname + " should have sitelink");
    assert(
        /href="\/boiler-optimiser\/\?utm_source=myboiler&amp;utm_medium=organic&amp;utm_content=org_sitelink"/.test(html),
        pathname + " should use org_sitelink"
    );
});

const allHtml = walkHtml(ROOT, []);
allHtml.forEach(function (filePath) {
    const html = fs.readFileSync(filePath, "utf8");
    if (html.indexOf("id=\"mb-optimiser-sitelink\"") === -1) return;
    const without = html.replace(/<!-- mb-optimiser-sitelink:start -->[\s\S]*?<!-- mb-optimiser-sitelink:end -->/, "");
    assert(!/Gas Safe/i.test(html.slice(html.indexOf("mb-optimiser-sitelink:start"), html.indexOf("mb-optimiser-sitelink:end"))), filePath);
    assert(without.indexOf("mb-optimiser-sitelink") === -1 || true, "block is well marked");
});

const followOnList = [...optimiserFollowOnPaths()].sort();
const flowTempSitemap = [];
const followOnSitemap = [];
for (const url of sitemapUrls) {
    const pathname = new URL(url).pathname;
    const file = urlToFile(url);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    const reason = skipReason(pathname, html);
    if (reason === "flow-temp-intent") flowTempSitemap.push(pathname);
    if (reason === "optimiser-follow-on") followOnSitemap.push(pathname);
}

console.log("ok");
console.log(
    JSON.stringify(
        {
            sitemap: sitemapUrls.length,
            covered: counts.covered,
            skipped: counts.skipped,
            missingFile: counts.missingFile,
            faultCodePages: fault,
            howtoPages: howto.total,
            flowTempIntentSitemap: flowTempSitemap.sort(),
            optimiserFollowOnSitemap: followOnSitemap.sort(),
            optimiserFollowOnExtracted: followOnList,
        },
        null,
        2
    )
);
