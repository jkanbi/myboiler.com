'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8765;
const BASE = 'http://127.0.0.1:' + PORT;
const RESULTS = [];

function contentType(file) {
    if (file.endsWith('.js')) return 'text/javascript';
    if (file.endsWith('.css')) return 'text/css';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.json')) return 'application/json';
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.woff2')) return 'font/woff2';
    if (file.endsWith('.mp4')) return 'video/mp4';
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

function cookieNames(cookieHeader) {
    return (cookieHeader || '')
        .split(';')
        .map(function (part) { return part.split('=')[0].trim(); })
        .filter(Boolean);
}

async function snapshot(page, uwtRequested) {
    const data = await page.evaluate(function () {
        var cookies = document.cookie || '';
        var localKeys = [];
        var sessionKeys = [];
        var localEntries = {};
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                localKeys.push(key);
                localEntries[key] = localStorage.getItem(key);
            }
        } catch (err) {}
        try {
            for (var j = 0; j < sessionStorage.length; j++) sessionKeys.push(sessionStorage.key(j));
        } catch (err) {}
        return {
            cookie: cookies,
            localKeys: localKeys.sort(),
            sessionKeys: sessionKeys.sort(),
            localEntries: localEntries,
            banner: !!document.querySelector('.mb-consent'),
            optimiserBanner: !!document.querySelector('.optimiser-consent'),
            footerSettings: !!document.querySelector('[data-mb-cookie-settings], .mb-cookie-settings'),
            optimiserSettings: !!document.querySelector('.optimiser-cookie-settings'),
            twqType: typeof window.twq
        };
    });
    data.cookieNames = cookieNames(data.cookie);
    data.twCookies = data.cookieNames.filter(function (name) {
        return name.indexOf('_tw') === 0;
    });
    data.phCookies = data.cookieNames.filter(function (name) {
        return name.indexOf('ph_') === 0 || name.indexOf('phc_') === 0 || name.indexOf('__ph_') === 0;
    });
    data.phLocal = data.localKeys.filter(function (key) {
        return key && (key.indexOf('ph_') === 0 || key.indexOf('__ph_') === 0);
    });
    data.uwtRequested = !!uwtRequested.count;
    data.uwtUrls = uwtRequested.urls.slice();
    return data;
}

function printSnap(label, snap) {
    console.log('\n=== ' + label + ' ===');
    console.log('document.cookie:', JSON.stringify(snap.cookie));
    console.log('cookie names:', JSON.stringify(snap.cookieNames));
    console.log('localStorage keys:', JSON.stringify(snap.localKeys));
    console.log('sessionStorage keys:', JSON.stringify(snap.sessionKeys));
    console.log('uwt.js requested:', snap.uwtRequested, snap.uwtUrls);
    console.log('banner:', snap.banner, 'optimiser banner:', snap.optimiserBanner);
    console.log('choice:', JSON.stringify(snap.localEntries.mb_cookie_choice || ''));
}

function assert(cond, message) {
    if (!cond) throw new Error(message);
}

function assertCleanTracking(snap, label) {
    assert(!snap.twCookies.length, label + ': _tw* cookies present: ' + JSON.stringify(snap.twCookies));
    assert(!snap.phCookies.length, label + ': ph_* cookies present: ' + JSON.stringify(snap.phCookies));
    assert(!snap.phLocal.length, label + ': ph_* localStorage present: ' + JSON.stringify(snap.phLocal));
    assert(!snap.uwtRequested, label + ': uwt.js was requested');
}

async function openPage(browser, pagePath) {
    const context = await browser.newContext();
    await context.clearCookies();
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.route('**/*.{mp4,webm,ogg}', function (route) { return route.abort(); });
    const uwtRequested = { count: 0, urls: [] };
    page.on('request', function (request) {
        var url = request.url();
        if (url.indexOf('uwt.js') !== -1) {
            uwtRequested.count += 1;
            uwtRequested.urls.push(url);
        }
    });
    await page.goto(BASE + pagePath, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(function () { return !!window.mbConsent; });
    await page.waitForSelector('[data-mb-cookie-settings], .mb-cookie-settings');
    return { context: context, page: page, uwtRequested: uwtRequested };
}

async function runPage(browser, pagePath, label) {
    const first = await openPage(browser, pagePath);
    await first.page.waitForSelector('.mb-consent');
    const before = await snapshot(first.page, first.uwtRequested);
    printSnap(label + ' before consent', before);
    assertCleanTracking(before, label + ' before consent');
    assert(before.banner, label + ': banner missing before consent');
    assert(!before.optimiserBanner, label + ': old optimiser banner still present');
    assert(before.footerSettings, label + ': footer Cookie settings missing');
    RESULTS.push({ page: pagePath, phase: 'before consent', snap: before });

    await first.page.click('.mb-consent__accept');
    await first.page.waitForTimeout(2500);
    const afterAccept = await snapshot(first.page, first.uwtRequested);
    printSnap(label + ' after Accept', afterAccept);
    assert(!afterAccept.banner, label + ': banner still visible after Accept');
    assert(afterAccept.localEntries.mb_cookie_choice === 'accepted', label + ': choice not accepted');
    assert(afterAccept.uwtRequested, label + ': uwt.js was not requested after Accept');
    RESULTS.push({ page: pagePath, phase: 'after Accept', snap: afterAccept });
    await first.context.close();

    const rejectRun = await openPage(browser, pagePath);
    await rejectRun.page.waitForSelector('.mb-consent');
    await rejectRun.page.click('.mb-consent__reject');
    await rejectRun.page.waitForTimeout(800);
    const afterReject = await snapshot(rejectRun.page, rejectRun.uwtRequested);
    printSnap(label + ' after Reject', afterReject);
    assert(!afterReject.banner, label + ': banner still visible after Reject');
    assert(afterReject.localEntries.mb_cookie_choice === 'declined', label + ': choice not declined');
    assertCleanTracking(afterReject, label + ' after Reject');
    RESULTS.push({ page: pagePath, phase: 'after Reject', snap: afterReject });
    await rejectRun.context.close();

    const withdraw = await openPage(browser, pagePath);
    await withdraw.page.waitForSelector('.mb-consent');
    await withdraw.page.click('.mb-consent__accept');
    await withdraw.page.waitForTimeout(2500);
    await withdraw.page.click('[data-mb-cookie-settings], .mb-cookie-settings');
    await withdraw.page.waitForSelector('.mb-consent__reject');
    await withdraw.page.click('.mb-consent__reject');
    await withdraw.page.waitForTimeout(800);
    const afterWithdraw = await snapshot(withdraw.page, withdraw.uwtRequested);
    printSnap(label + ' after withdraw', afterWithdraw);
    assert(afterWithdraw.localEntries.mb_cookie_choice === 'declined', label + ': withdraw did not decline');
    assert(!afterWithdraw.twCookies.length, label + ': _tw* cookies remain after withdraw: ' + JSON.stringify(afterWithdraw.twCookies));
    assert(!afterWithdraw.phCookies.length, label + ': ph_* cookies remain after withdraw');
    assert(!afterWithdraw.phLocal.length, label + ': ph_* localStorage remain after withdraw');
    RESULTS.push({ page: pagePath, phase: 'after withdraw', snap: afterWithdraw });
    await withdraw.context.close();
}

(async function () {
    const server = await startServer();
    const browser = await chromium.launch({
        executablePath: '/usr/local/bin/google-chrome',
        headless: true,
        args: ['--disable-gpu', '--no-sandbox']
    });

    await runPage(browser, '/', 'homepage');
    await runPage(browser, '/advice/', 'article');
    await runPage(browser, '/boiler-optimiser/', 'optimiser');

    const migratedContext = await browser.newContext();
    await migratedContext.addInitScript(function () {
        try { localStorage.setItem('mb_optimiser_posthog', 'accepted'); } catch (err) {}
    });
    const page = await migratedContext.newPage();
    page.setDefaultTimeout(20000);
    await page.route('**/*.{mp4,webm,ogg}', function (route) { return route.abort(); });
    const uwtRequested = { count: 0, urls: [] };
    page.on('request', function (request) {
        if (request.url().indexOf('uwt.js') !== -1) {
            uwtRequested.count += 1;
            uwtRequested.urls.push(request.url());
        }
    });
    await page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(function () { return !!window.mbConsent; });
    await page.waitForTimeout(2000);
    const migratedSnap = await snapshot(page, uwtRequested);
    printSnap('optimiser migrated legacy accept', migratedSnap);
    assert(!migratedSnap.banner, 'legacy accept still showed the banner');
    assert(migratedSnap.localEntries.mb_cookie_choice === 'accepted', 'legacy accept was not migrated');
    assert(migratedSnap.uwtRequested, 'legacy accept did not load uwt.js');
    RESULTS.push({ page: '/boiler-optimiser/', phase: 'migrated legacy accept', snap: migratedSnap });
    await migratedContext.close();

    await browser.close();
    server.close();
    console.log('\nSite consent test passed.');
})().catch(function (err) {
    console.error(err);
    process.exit(1);
});
