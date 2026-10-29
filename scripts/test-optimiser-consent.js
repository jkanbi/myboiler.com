'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { stillHasPixel } = require('./strip-x-pixel');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8765;
const BASE = 'http://127.0.0.1:' + PORT;
const ARTIFACTS = '/opt/cursor/artifacts';
const CHROME = '/usr/local/bin/google-chrome';

const PAGES = [
    { name: 'homepage', path: '/', optimiser: false },
    { name: 'article', path: '/boilers/what-is-a-combi-boiler/', optimiser: false },
    { name: 'about', path: '/about/', optimiser: false },
    { name: 'boiler-optimiser', path: '/boiler-optimiser/', optimiser: true },
    { name: 'advance', path: '/boiler-optimiser-advance-power-output/', optimiser: true }
];

function contentType(file) {
    if (file.endsWith('.js')) return 'text/javascript';
    if (file.endsWith('.css')) return 'text/css';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.json')) return 'application/json';
    if (file.endsWith('.mp4')) return 'video/mp4';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.woff2')) return 'font/woff2';
    if (file.endsWith('.woff')) return 'font/woff';
    return 'text/html';
}

function startServer() {
    const server = http.createServer(function (req, res) {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const file = path.join(ROOT, urlPath.replace(/^\/+/, ''));
        if (!file.startsWith(ROOT)) {
            res.writeHead(403);
            res.end();
            return;
        }
        fs.readFile(file, function (err, data) {
            if (err) {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType(file) });
            res.end(data);
        });
    });
    return new Promise(function (resolve) {
        server.listen(PORT, '127.0.0.1', function () {
            resolve(server);
        });
    });
}

function walkHtml(dir, out) {
    const skip = new Set(['node_modules', '.git', '.wrangler']);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (skip.has(entry.name)) continue;
            walkHtml(path.join(dir, entry.name), out);
        } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

function assertNoInlinePixel() {
    const leftover = [];
    walkHtml(ROOT, []).forEach(function (filePath) {
        const html = fs.readFileSync(filePath, 'utf8');
        if (stillHasPixel(html)) leftover.push(path.relative(ROOT, filePath));
    });
    if (leftover.length) {
        throw new Error('HTML still contains the X pixel:\n  ' + leftover.join('\n  '));
    }
}

function attachTracker(page) {
    const tracker = {
        uwt: false,
        posthog: false,
        uwtUrls: [],
        posthogUrls: []
    };
    page.on('request', function (req) {
        const url = req.url();
        if (/uwt\.js|static\.ads-twitter\.com/i.test(url)) {
            tracker.uwt = true;
            tracker.uwtUrls.push(url);
        }
        if (/posthog\.com/i.test(url)) {
            tracker.posthog = true;
            tracker.posthogUrls.push(url);
        }
    });
    return tracker;
}

function resetTracker(tracker) {
    tracker.uwt = false;
    tracker.posthog = false;
    tracker.uwtUrls = [];
    tracker.posthogUrls = [];
}

async function snapshot(page, tracker) {
    const snap = await page.evaluate(function () {
        var cookies = document.cookie || '';
        var localKeys = [];
        var sessionKeys = [];
        try {
            for (var i = 0; i < localStorage.length; i++) localKeys.push(localStorage.key(i));
        } catch (err) {}
        try {
            for (var j = 0; j < sessionStorage.length; j++) sessionKeys.push(sessionStorage.key(j));
        } catch (err) {}
        var cookieNames = cookies.split(';').map(function (part) {
            return part.split('=')[0].trim();
        }).filter(Boolean);
        return {
            cookie: cookies,
            cookieNames: cookieNames,
            localKeys: localKeys.sort(),
            sessionKeys: sessionKeys.sort(),
            phCookies: cookieNames.filter(function (name) {
                return name.indexOf('ph_') === 0 || name.indexOf('phc_') === 0 || name.indexOf('__ph_') === 0;
            }),
            twCookies: cookieNames.filter(function (name) {
                return name.indexOf('_tw') === 0 || name === 'personalization_id';
            }),
            phLocal: localKeys.filter(function (key) { return key && (key.indexOf('ph_') === 0 || key.indexOf('__ph_') === 0); }),
            phSession: sessionKeys.filter(function (key) { return key && (key.indexOf('ph_') === 0 || key.indexOf('__ph_') === 0); }),
            choice: (function () {
                try { return localStorage.getItem('mb_optimiser_posthog') || ''; } catch (err) { return ''; }
            })(),
            banner: !!document.querySelector('.optimiser-consent'),
            bannerText: (function () {
                var el = document.querySelector('.optimiser-consent__text');
                return el ? el.textContent.trim() : '';
            })(),
            cookieSettings: !!document.querySelector('.optimiser-cookie-settings'),
            cookieSettingsInFooter: !!(document.querySelector('#site-footer .optimiser-cookie-settings') || document.querySelector('footer .optimiser-cookie-settings')),
            dismiss: !!document.querySelector('.optimiser-consent__dismiss'),
            ariaModal: (function () {
                var el = document.querySelector('.optimiser-consent');
                return el ? el.getAttribute('aria-modal') : null;
            })(),
            overlay: !!document.querySelector('.optimiser-consent-overlay, .optimiser-consent__backdrop'),
            bodyOverflow: document.body ? (document.body.style.overflow || window.getComputedStyle(document.body).overflow) : '',
            htmlConsentClass: document.documentElement.classList.contains('optimiser-consent-open'),
            dismissed: (function () {
                try { return sessionStorage.getItem('mb_optimiser_consent_dismissed') || ''; } catch (err) { return ''; }
            })(),
            twqType: typeof window.twq
        };
    });
    snap.uwtRequested = tracker.uwt;
    snap.posthogRequested = tracker.posthog;
    snap.uwtUrls = tracker.uwtUrls.slice();
    snap.posthogUrls = tracker.posthogUrls.slice();
    return snap;
}

function fmtList(arr) {
    if (!arr || !arr.length) return '(none)';
    return arr.join(', ');
}

function fmtCookies(cookie) {
    return cookie ? cookie : '(none)';
}

function yn(value) {
    return value ? 'yes' : 'no';
}

const rows = [];

function record(pageName, stage, snap) {
    rows.push({
        page: pageName,
        stage: stage,
        cookie: fmtCookies(snap.cookie),
        cookieNames: fmtList(snap.cookieNames),
        localKeys: fmtList(snap.localKeys),
        sessionKeys: fmtList(snap.sessionKeys),
        twCookies: fmtList(snap.twCookies),
        phCookies: fmtList(snap.phCookies),
        uwt: yn(snap.uwtRequested),
        posthog: yn(snap.posthogRequested),
        banner: yn(snap.banner),
        choice: snap.choice || '(none)',
        twq: snap.twqType
    });
}

function printTable() {
    console.log('\n| Page | Stage | document.cookie | storage keys | _tw* cookies | uwt.js | PostHog | banner | choice |');
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    rows.forEach(function (row) {
        const storage = 'local: ' + row.localKeys + '; session: ' + row.sessionKeys;
        console.log(
            '| ' +
                [
                    row.page,
                    row.stage,
                    row.cookie.replace(/\|/g, '\\|'),
                    storage.replace(/\|/g, '\\|'),
                    row.twCookies,
                    row.uwt,
                    row.posthog,
                    row.banner,
                    row.choice
                ].join(' | ') +
                ' |'
        );
    });
}

function fail(message, snap) {
    throw new Error(message + (snap ? '\n' + JSON.stringify(snap, null, 2) : ''));
}

async function newCleanPage(browser) {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    await context.clearCookies();
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.route('**/*.{mp4,webm,ogg}', function (route) { return route.abort(); });
    const tracker = attachTracker(page);
    return { context, page, tracker };
}

async function waitQuiet(page, ms) {
    await page.waitForTimeout(ms);
}

async function screenshotBanner(page, filename) {
    try {
        fs.mkdirSync(ARTIFACTS, { recursive: true });
        const banner = page.locator('.optimiser-consent.is-visible');
        await banner.waitFor({ state: 'visible' });
        await page.waitForTimeout(400);
        await page.screenshot({
            path: path.join(ARTIFACTS, filename),
            fullPage: false
        });
        console.log('Wrote ' + path.join(ARTIFACTS, filename));
    } catch (err) {
        console.warn('Screenshot failed:', filename, err.message);
    }
}

(async function () {
    assertNoInlinePixel();
    console.log('Static check: no HTML page contains uwt.js / twq config.');

    const server = await startServer();
    const browser = await chromium.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--disable-gpu', '--no-sandbox']
    });

    for (const spec of PAGES) {
        const { context, page, tracker } = await newCleanPage(browser);
        await page.goto(BASE + spec.path, { waitUntil: 'domcontentloaded' });
        if (spec.optimiser) {
            await page.waitForSelector('.optimiser-consent.is-visible');
            await page.waitForSelector('.optimiser-cookie-settings');
        } else {
            await waitQuiet(page, 2500);
        }
        const before = await snapshot(page, tracker);
        record(spec.name, 'before consent', before);

        if (before.uwtRequested) fail(spec.name + ': uwt.js requested before consent', before);
        if (before.posthogRequested) fail(spec.name + ': PostHog requested before consent', before);
        if (before.twCookies.length) fail(spec.name + ': _tw* cookies present before consent', before);
        if (before.phCookies.length || before.phLocal.length || before.phSession.length) {
            fail(spec.name + ': PostHog storage present before consent', before);
        }

        if (!spec.optimiser) {
            if (before.banner) fail(spec.name + ': optimiser banner shown on non-optimiser page', before);
            if (before.twqType !== 'undefined') fail(spec.name + ': twq defined on non-optimiser page', before);
            await context.close();
            continue;
        }

        if (!before.banner) fail(spec.name + ': banner missing before consent', before);
        if (before.twqType !== 'undefined') fail(spec.name + ': twq defined before consent', before);
        if (before.choice) fail(spec.name + ': choice already stored before consent', before);
        if (before.ariaModal) fail(spec.name + ': banner must not be a modal', before);
        if (before.overlay) fail(spec.name + ': banner must not use an overlay', before);
        if (before.bodyOverflow === 'hidden') fail(spec.name + ': body scroll is locked', before);
        if (!before.dismiss) fail(spec.name + ': dismiss control missing', before);
        if (!before.cookieSettingsInFooter) fail(spec.name + ': Cookie settings is not in the footer', before);

        if (spec.name === 'boiler-optimiser') {
            await screenshotBanner(page, 'optimiser_slim_bar_desktop.png');
            const choiceBtn = page.locator('[data-boiler], .choice-button').first();
            if (await choiceBtn.count()) {
                await choiceBtn.click({ trial: false });
            }
            await page.setViewportSize({ width: 375, height: 812 });
            await waitQuiet(page, 500);
            await screenshotBanner(page, 'optimiser_slim_bar_mobile.png');
            await page.setViewportSize({ width: 1280, height: 800 });
        }

        await page.click('.optimiser-consent__accept');
        await waitQuiet(page, 4000);
        const afterAccept = await snapshot(page, tracker);
        record(spec.name, 'after Accept', afterAccept);
        if (afterAccept.choice !== 'accepted') fail(spec.name + ': Accept did not store choice', afterAccept);
        if (afterAccept.banner) fail(spec.name + ': banner still visible after Accept', afterAccept);
        if (!afterAccept.uwtRequested) fail(spec.name + ': uwt.js was not requested after Accept', afterAccept);
        if (!afterAccept.posthogRequested) fail(spec.name + ': PostHog was not requested after Accept', afterAccept);
        if (afterAccept.twqType !== 'function') fail(spec.name + ': twq not a function after Accept', afterAccept);
        if (!afterAccept.cookieSettings) fail(spec.name + ': Cookie settings missing after Accept', afterAccept);

        resetTracker(tracker);
        await page.click('.optimiser-cookie-settings');
        await page.waitForSelector('.optimiser-consent__decline');
        await page.click('.optimiser-consent__decline');
        await waitQuiet(page, 1500);
        const afterOptOut = await snapshot(page, tracker);
        record(spec.name, 'after Opt out', afterOptOut);
        if (afterOptOut.choice !== 'declined') fail(spec.name + ': Opt out did not store choice', afterOptOut);
        if (afterOptOut.banner) fail(spec.name + ': banner still visible after Opt out', afterOptOut);
        if (afterOptOut.phCookies.length || afterOptOut.phLocal.length || afterOptOut.phSession.length) {
            fail(spec.name + ': PostHog storage still present after opt out', afterOptOut);
        }
        if (afterOptOut.twCookies.length) fail(spec.name + ': _tw* cookies still present after opt out', afterOptOut);

        await context.close();
    }

    const dismissFlow = await newCleanPage(browser);
    await dismissFlow.page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
    await dismissFlow.page.waitForSelector('.optimiser-consent.is-visible');
    await dismissFlow.page.click('.optimiser-consent__dismiss');
    await waitQuiet(dismissFlow.page, 400);
    const afterDismiss = await snapshot(dismissFlow.page, dismissFlow.tracker);
    record('boiler-optimiser', 'after dismiss', afterDismiss);
    if (afterDismiss.banner) fail('dismiss: banner still visible', afterDismiss);
    if (afterDismiss.choice) fail('dismiss: must not store a consent choice', afterDismiss);
    if (afterDismiss.dismissed !== '1') fail('dismiss: session flag missing', afterDismiss);
    if (afterDismiss.uwtRequested) fail('dismiss: uwt.js requested', afterDismiss);
    if (afterDismiss.posthogRequested) fail('dismiss: PostHog requested', afterDismiss);
    if (afterDismiss.twqType !== 'undefined') fail('dismiss: twq should not be defined', afterDismiss);

    resetTracker(dismissFlow.tracker);
    await dismissFlow.page.reload({ waitUntil: 'domcontentloaded' });
    await waitQuiet(dismissFlow.page, 1500);
    const afterReloadDismissed = await snapshot(dismissFlow.page, dismissFlow.tracker);
    record('boiler-optimiser', 'reload after dismiss', afterReloadDismissed);
    if (afterReloadDismissed.banner) fail('reload after dismiss: banner should stay hidden', afterReloadDismissed);
    if (afterReloadDismissed.uwtRequested) fail('reload after dismiss: uwt.js requested', afterReloadDismissed);
    if (afterReloadDismissed.posthogRequested) fail('reload after dismiss: PostHog requested', afterReloadDismissed);

    await dismissFlow.page.click('.optimiser-cookie-settings');
    await dismissFlow.page.waitForSelector('.optimiser-consent.is-visible');
    const afterReopen = await snapshot(dismissFlow.page, dismissFlow.tracker);
    record('boiler-optimiser', 'Cookie settings reopen', afterReopen);
    if (!afterReopen.banner) fail('Cookie settings did not reopen the banner', afterReopen);
    if (afterReopen.uwtRequested) fail('reopen: uwt.js requested before Accept', afterReopen);
    if (afterReopen.posthogRequested) fail('reopen: PostHog requested before Accept', afterReopen);
    await dismissFlow.context.close();

    const returningAccepted = await newCleanPage(browser);
    await returningAccepted.page.addInitScript(function () {
        try { localStorage.setItem('mb_optimiser_posthog', 'accepted'); } catch (err) {}
    });
    await returningAccepted.page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
    await waitQuiet(returningAccepted.page, 4000);
    const returningAcceptedSnap = await snapshot(returningAccepted.page, returningAccepted.tracker);
    record('boiler-optimiser', 'returning accepted', returningAcceptedSnap);
    if (returningAcceptedSnap.banner) fail('returning accepted: banner should stay hidden', returningAcceptedSnap);
    if (returningAcceptedSnap.choice !== 'accepted') fail('returning accepted: choice flag missing', returningAcceptedSnap);
    if (!returningAcceptedSnap.uwtRequested) fail('returning accepted: uwt.js not requested', returningAcceptedSnap);
    if (!returningAcceptedSnap.posthogRequested) fail('returning accepted: PostHog not requested', returningAcceptedSnap);
    await returningAccepted.context.close();

    const returningDeclined = await newCleanPage(browser);
    await returningDeclined.page.addInitScript(function () {
        try { localStorage.setItem('mb_optimiser_posthog', 'declined'); } catch (err) {}
    });
    await returningDeclined.page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
    await waitQuiet(returningDeclined.page, 2500);
    const returningDeclinedSnap = await snapshot(returningDeclined.page, returningDeclined.tracker);
    record('boiler-optimiser', 'returning declined', returningDeclinedSnap);
    if (returningDeclinedSnap.banner) fail('returning declined: banner should stay hidden', returningDeclinedSnap);
    if (returningDeclinedSnap.choice !== 'declined') fail('returning declined: choice flag missing', returningDeclinedSnap);
    if (returningDeclinedSnap.uwtRequested) fail('returning declined: uwt.js requested', returningDeclinedSnap);
    if (returningDeclinedSnap.posthogRequested) fail('returning declined: PostHog requested', returningDeclinedSnap);
    if (returningDeclinedSnap.twqType !== 'undefined') fail('returning declined: twq should not be defined', returningDeclinedSnap);
    await returningDeclined.context.close();

    await browser.close();
    server.close();
    printTable();
    console.log('\nConsent test passed.');
})().catch(function (err) {
    printTable();
    console.error(err);
    process.exit(1);
});
