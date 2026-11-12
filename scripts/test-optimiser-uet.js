'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8768;
const BASE = 'http://127.0.0.1:' + PORT;
const ARTIFACTS = '/opt/cursor/artifacts';
const CHROME = '/usr/local/bin/google-chrome';
const UET_STUB = [
    'window.UET = function (o) {',
    '  this.cfg = o || {};',
    '  this.q = (o && o.q) ? o.q.slice() : [];',
    '  this.events = [];',
    '  this.push = function () {',
    '    var args = Array.prototype.slice.call(arguments);',
    '    this.events.push(args);',
    '    window.__mbUetPushes = window.__mbUetPushes || [];',
    '    window.__mbUetPushes.push(args);',
    '  };',
    '};'
].join('\n');

function contentType(file) {
    if (file.endsWith('.js')) return 'text/javascript';
    if (file.endsWith('.css')) return 'text/css';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.json')) return 'application/json';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
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

function attachTracker(page) {
    const tracker = { bat: [], batJs: false, pageLoad: false, turnDown: false };
    page.on('request', function (req) {
        const url = req.url();
        if (!/bat\.bing\.net/i.test(url)) return;
        tracker.bat.push(url);
        if (/bat\.js/i.test(url)) tracker.batJs = true;
        if (/pageLoad/i.test(url) || /evt=pageLoad/i.test(url)) tracker.pageLoad = true;
        if (/[?&]ea=turn_down(?:&|$)/i.test(url) || /ea=turn_down/i.test(url)) tracker.turnDown = true;
    });
    return tracker;
}

async function stubBing(page, tracker) {
    await page.route('https://bat.bing.net/**', function (route) {
        const url = route.request().url();
        tracker.bat.push(url);
        if (/bat\.js/i.test(url)) {
            tracker.batJs = true;
            return route.fulfill({
                status: 200,
                contentType: 'application/javascript',
                body: UET_STUB
            });
        }
        if (/pageLoad/i.test(url) || /evt=pageLoad/i.test(url)) tracker.pageLoad = true;
        if (/ea=turn_down/i.test(url)) tracker.turnDown = true;
        return route.fulfill({ status: 204, body: '' });
    });
}

async function snapshot(page, tracker) {
    const snap = await page.evaluate(function () {
        var q = window.uetq;
        var queued = [];
        if (Array.isArray(q)) queued = q.slice();
        else if (q && Array.isArray(q.events)) queued = q.events.slice();
        else if (q && Array.isArray(q.q)) queued = q.q.slice();
        return {
            bannerText: (function () {
                var el = document.querySelector('.optimiser-consent__text');
                return el ? el.textContent.trim() : '';
            })(),
            choice: (function () {
                try { return localStorage.getItem('mb_optimiser_posthog') || ''; } catch (err) { return ''; }
            })(),
            uetqType: typeof window.uetq,
            uetqIsArray: Array.isArray(window.uetq),
            uetqPushes: window.__mbUetPushes || [],
            queued: queued,
            batScript: !!document.querySelector('script[src*="bat.bing.net/bat.js"]'),
            batSrc: (function () {
                var el = document.querySelector('script[src*="bat.bing.net/bat.js"]');
                return el ? el.getAttribute('src') : '';
            })(),
            cfasync: (function () {
                var el = document.querySelector('script[src*="bat.bing.net/bat.js"]');
                return el ? el.getAttribute('data-cfasync') : null;
            })()
        };
    });
    snap.batRequested = tracker.bat.length > 0;
    snap.batJs = tracker.batJs;
    snap.batUrls = tracker.bat.slice();
    snap.pageLoadNet = tracker.pageLoad;
    snap.turnDownNet = tracker.turnDown;
    return snap;
}

function hasPageLoad(snap) {
    if (snap.pageLoadNet) return true;
    function isPageLoad(item) {
        if (item === 'pageLoad') return true;
        if (Array.isArray(item) && item[0] === 'pageLoad') return true;
        return false;
    }
    return (snap.uetqPushes || []).some(isPageLoad) || (snap.queued || []).some(isPageLoad);
}

function hasTurnDown(snap) {
    if (snap.turnDownNet) return true;
    function isTurnDown(item) {
        if (!Array.isArray(item)) return false;
        return item[0] === 'event' && item[1] === 'turn_down';
    }
    return (snap.uetqPushes || []).some(isTurnDown) || (snap.queued || []).some(isTurnDown);
}

function fail(message, snap) {
    throw new Error(message + (snap ? '\n' + JSON.stringify(snap, null, 2) : ''));
}

async function newCleanPage(browser) {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'en-GB'
    });
    await context.clearCookies();
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.route('**/*.{mp4,webm,ogg,woff,woff2}', function (route) { return route.abort(); });
    await page.route('**/api/optimiser-**', function (route) {
        return route.fulfill({ status: 204, body: '' });
    });
    const tracker = attachTracker(page);
    await stubBing(page, tracker);
    return { context, page, tracker };
}

async function waitQuiet(page, ms) {
    await page.waitForTimeout(ms);
}

async function submitTurnDown(page) {
    await page.waitForFunction(function () {
        var card = document.getElementById('model-card');
        var form = document.getElementById('tool-confirm');
        return form && card && !card.hidden;
    });
    await page.locator('#tool-confirm').scrollIntoViewIfNeeded();
    await page.locator('#confirm-brand').selectOption('worcester', { force: true });
    await page.locator('#confirm-system').selectOption('combi', { force: true });
    await page.locator('#from-flow').fill('75', { force: true });
    await page.locator('#set-flow').fill('55', { force: true });
    await page.locator('#tool-confirm-submit').click({ force: true });
    await page.waitForFunction(function () {
        var done = document.getElementById('tool-confirm-done');
        var checkback = document.getElementById('tool-confirm-checkback');
        var form = document.getElementById('tool-confirm');
        return (done && !done.hidden) || (checkback && !checkback.hidden) || (form && form.classList.contains('is-done'));
    });
}

const results = [];

function record(name, detail) {
    results.push({ name: name, detail: detail || 'ok' });
    console.log('PASS ' + name + (detail ? ' — ' + detail : ''));
}

(async function () {
    fs.mkdirSync(ARTIFACTS, { recursive: true });

    const source = fs.readFileSync(path.join(ROOT, 'js/posthog-optimiser.js'), 'utf8');
    if (source.indexOf('343285855') === -1) fail('source-tag-id', { missing: '343285855' });
    if (source.indexOf('enableAutoSpaTracking: true') === -1) fail('source-spa-flag');
    if (source.indexOf('bat.bing.net/bat.js') === -1) fail('source-bat-js');
    if (!/n\.setAttribute\("data-cfasync", "false"\)/.test(source) && source.indexOf("n.setAttribute('data-cfasync', 'false')") === -1) {
        fail('source-cfasync');
    }
    if (source.indexOf("push('event', 'turn_down', {})") === -1) fail('source-turn-down-event');
    if (!/loadUet\(\)/.test(source) || source.indexOf('startFullMode') === -1) fail('source-consent-callback');
    record('static-source', 'UET snippet, consent callback, turn_down event');

    const html = fs.readFileSync(path.join(ROOT, 'boiler-optimiser/index.html'), 'utf8');
    if (!/data-stamp="2026-11-12 [^"]* · 46"/.test(html)) fail('version-stamp', { html: html.match(/data-stamp="[^"]+"/) });
    record('version-stamp', '12 November 2026 · Version 46');

    const privacy = fs.readFileSync(path.join(ROOT, 'privacy-policy/index.html'), 'utf8');
    if (!/Microsoft Advertising \(UET\)/.test(privacy)) fail('privacy-mentions-uet');
    if (!/only runs after you click Accept/.test(privacy)) fail('privacy-consent');
    record('privacy-policy', 'Microsoft Advertising (UET) after consent');

    const server = await startServer();
    const browser = await chromium.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--disable-gpu', '--no-sandbox']
    });

    try {
        const before = await newCleanPage(browser);
        await before.page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
        await before.page.waitForSelector('.optimiser-consent.is-visible');
        await waitQuiet(before.page, 1500);
        const beforeSnap = await snapshot(before.page, before.tracker);
        if (beforeSnap.batRequested) fail('a: bat.bing.net requested before consent', beforeSnap);
        if (beforeSnap.batScript) fail('a: bat.js script tag present before consent', beforeSnap);
        if (beforeSnap.uetqType !== 'undefined') fail('a: uetq defined before consent', beforeSnap);
        if (!/Microsoft Advertising/.test(beforeSnap.bannerText)) {
            fail('banner-text: Microsoft Advertising missing', beforeSnap);
        }
        record('a-before-consent', 'no bat.bing.net; banner lists Microsoft Advertising');
        await before.page.screenshot({
            path: path.join(ARTIFACTS, 'uet_before_consent.png'),
            fullPage: false
        });

        await before.page.click('.optimiser-consent__accept');
        await before.page.waitForFunction(function () {
            return !!document.querySelector('script[src*="bat.bing.net/bat.js"]') || typeof window.uetq !== 'undefined';
        });
        await waitQuiet(before.page, 1200);
        const afterAccept = await snapshot(before.page, before.tracker);
        if (!afterAccept.batJs && !afterAccept.batScript) fail('b: bat.js did not load after Accept', afterAccept);
        if (!/bat\.js\?ti=343285855/.test(afterAccept.batSrc + ' ' + afterAccept.batUrls.join(' '))) {
            fail('b: bat.js missing tag id 343285855', afterAccept);
        }
        if (afterAccept.cfasync !== 'false') fail('b: bat.js missing data-cfasync=false', afterAccept);
        if (!hasPageLoad(afterAccept)) fail('b: pageLoad was not sent after Accept', afterAccept);
        record('b-after-accept', 'bat.js loaded, pageLoad sent, data-cfasync=false');
        await before.page.screenshot({
            path: path.join(ARTIFACTS, 'uet_after_accept.png'),
            fullPage: false
        });

        await submitTurnDown(before.page);
        await waitQuiet(before.page, 800);
        const afterTurnDown = await snapshot(before.page, before.tracker);
        if (!hasTurnDown(afterTurnDown)) fail('d: turn_down was not pushed', afterTurnDown);
        record('d-turn-down', afterTurnDown.turnDownNet ? 'network ea=turn_down' : 'uetq push event turn_down');
        await before.page.screenshot({
            path: path.join(ARTIFACTS, 'uet_after_turndown.png'),
            fullPage: false
        });
        await before.context.close();

        const declined = await newCleanPage(browser);
        await declined.page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
        await declined.page.waitForSelector('.optimiser-consent.is-visible');
        await declined.page.click('.optimiser-consent__decline');
        await waitQuiet(declined.page, 1500);
        const declinedSnap = await snapshot(declined.page, declined.tracker);
        if (declinedSnap.batRequested) fail('c: bat.bing.net requested after Opt out', declinedSnap);
        if (declinedSnap.batScript) fail('c: bat.js present after Opt out', declinedSnap);
        await submitTurnDown(declined.page);
        await waitQuiet(declined.page, 600);
        const declinedAfterSubmit = await snapshot(declined.page, declined.tracker);
        if (declinedAfterSubmit.batRequested) fail('c: bat.bing.net after declined turn-down', declinedAfterSubmit);
        if (hasTurnDown(declinedAfterSubmit)) fail('c: turn_down pushed without consent', declinedAfterSubmit);
        record('c-declined', 'no bat.bing.net and no turn_down without consent');
        await declined.context.close();

        const withdrawn = await newCleanPage(browser);
        await withdrawn.page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
        await withdrawn.page.waitForSelector('.optimiser-consent.is-visible');
        await withdrawn.page.click('.optimiser-consent__accept');
        await withdrawn.page.waitForFunction(function () {
            return !!document.querySelector('script[src*="bat.bing.net/bat.js"]');
        });
        withdrawn.tracker.bat = [];
        withdrawn.tracker.batJs = false;
        await withdrawn.page.click('.optimiser-cookie-settings');
        await withdrawn.page.waitForSelector('.optimiser-consent__decline');
        await withdrawn.page.click('.optimiser-consent__decline');
        await waitQuiet(withdrawn.page, 800);
        const withdrawnSnap = await snapshot(withdrawn.page, withdrawn.tracker);
        if (withdrawnSnap.batScript) fail('withdrawn: bat.js still in DOM', withdrawnSnap);
        await submitTurnDown(withdrawn.page);
        const withdrawnAfter = await snapshot(withdrawn.page, withdrawn.tracker);
        if (hasTurnDown(withdrawnAfter)) fail('withdrawn: turn_down after consent withdrawn', withdrawnAfter);
        const leftover = await withdrawn.page.evaluate(function () {
            var keys = [];
            try {
                for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    if (key && key.indexOf('_uet') === 0) keys.push(key);
                }
            } catch (err) {}
            return keys;
        });
        if (leftover.length) fail('withdrawn: UET localStorage still present', leftover);
        record('consent-withdrawn', 'UET stops after Opt out');
        await withdrawn.context.close();

        for (const spec of [
            { name: 'homepage', path: '/' },
            { name: 'toolbox', path: '/toolbox/' },
            { name: 'advance', path: '/boiler-optimiser-advance-power-output/' }
        ]) {
            const other = await newCleanPage(browser);
            if (spec.name === 'advance') {
                await other.page.addInitScript(function () {
                    try { localStorage.setItem('mb_optimiser_posthog', 'accepted'); } catch (err) {}
                    try { localStorage.setItem('mb_optimiser_gads', '1'); } catch (err) {}
                });
            }
            await other.page.goto(BASE + spec.path, { waitUntil: 'domcontentloaded' });
            if (spec.name === 'advance') {
                await waitQuiet(other.page, 2500);
            } else {
                await waitQuiet(other.page, 1500);
            }
            const otherSnap = await snapshot(other.page, other.tracker);
            if (otherSnap.batRequested || otherSnap.batJs || otherSnap.batScript) {
                fail('e: ' + spec.name + ' loaded bat.js', otherSnap);
            }
            record('e-' + spec.name, 'no bat.js');
            await other.context.close();
        }
    } finally {
        await browser.close();
        server.close();
    }

    const logPath = path.join(ARTIFACTS, 'uet-test-results.log');
    const lines = results.map(function (row) {
        return 'PASS ' + row.name + (row.detail ? ' — ' + row.detail : '');
    });
    lines.push('');
    lines.push('All Microsoft UET consent and turn-down checks passed.');
    fs.writeFileSync(logPath, lines.join('\n') + '\n');
    console.log('\nAll Microsoft UET consent and turn-down checks passed.');
})().catch(function (err) {
    console.error(err);
    process.exit(1);
});
