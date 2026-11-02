'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8773;
const BASE = 'http://127.0.0.1:' + PORT;
const CHROME = '/usr/local/bin/google-chrome';

function contentType(file) {
    if (file.endsWith('.js')) return 'text/javascript';
    if (file.endsWith('.css')) return 'text/css';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.json')) return 'application/json';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.woff2')) return 'font/woff2';
    return 'text/html';
}

function startServer() {
    const server = http.createServer(function (req, res) {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (req.method === 'POST' && urlPath.indexOf('/api/optimiser-event') === 0) {
            res.writeHead(204);
            res.end();
            return;
        }
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
        server.listen(PORT, '127.0.0.1', function () { resolve(server); });
    });
}

function parseBody(postData) {
    if (!postData) return null;
    try {
        return JSON.parse(postData);
    } catch (err) {
        return null;
    }
}

async function attachEventRoute(page, store) {
    await page.route('**/api/optimiser-event**', function (route) {
        const req = route.request();
        store.push({
            method: req.method(),
            url: req.url(),
            body: parseBody(req.postData())
        });
        return route.fulfill({ status: 204, body: '' });
    });
}

function eventNames(store, name) {
    return store.filter(function (row) {
        return row.method === 'POST' && row.body && row.body.event === name;
    });
}

async function stayOnPage(page) {
    await page.evaluate(function () {
        document.addEventListener('click', function (event) {
            var link = event.target && event.target.closest && event.target.closest('a[href]');
            if (link) event.preventDefault();
        }, true);
        try {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: window.location
            });
        } catch (err) { /* ignore */ }
    });
    page.on('dialog', function (dialog) { return dialog.dismiss(); });
}

(async function () {
    const failures = [];
    function fail(name, detail) {
        failures.push(name + ': ' + detail);
        console.error('FAIL ' + name + ': ' + detail);
    }
    function pass(name, extra) {
        console.log('PASS ' + name + (extra ? ' — ' + extra : ''));
    }

    const source = fs.readFileSync(path.join(ROOT, 'js/posthog-optimiser.js'), 'utf8');
    if (source.indexOf('window.__mbOptimiserInit') === -1) fail('source-init-flag', 'missing __mbOptimiserInit');
    else pass('source-init-flag');
    if (source.indexOf('__mbOptimiserEventDedupe') === -1) fail('source-dedupe', 'missing event dedupe bucket');
    else pass('source-dedupe');

    const server = await startServer();
    const browser = await chromium.launch({
        executablePath: CHROME,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const store = [];
        const ctx = await browser.newContext({ locale: 'en-GB' });
        const page = await ctx.newPage();
        await attachEventRoute(page, store);
        await page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#brand-picks [data-brand="vaillant"]');
        await page.waitForTimeout(400);

        const viewsAfterLoad = eventNames(store, 'view');
        if (viewsAfterLoad.length !== 1) fail('view-once-on-load', 'got ' + viewsAfterLoad.length);
        else pass('view-once-on-load');

        await page.addScriptTag({ url: '/js/posthog-optimiser.js?v=second-init' });
        await page.waitForTimeout(300);
        const viewsAfterSecond = eventNames(store, 'view');
        if (viewsAfterSecond.length !== 1) fail('view-not-doubled-on-second-init', 'got ' + viewsAfterSecond.length);
        else pass('view-not-doubled-on-second-init');

        const beforeStep = store.length;
        await page.locator('#usage-chips [data-band="low"]').click();
        await page.waitForTimeout(300);
        const steps = eventNames(store.slice(beforeStep), 'step');
        if (steps.length !== 1) fail('one-step-after-second-init', 'got ' + steps.length + ' ' + JSON.stringify(steps));
        else pass('one-step-after-second-init');

        await stayOnPage(page);
        await page.route('**/how-to-adjust-the-flow-temperature/**', function (route) {
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' });
        });
        const beforeClick = store.length;
        await page.locator('#brand-picks [data-brand="vaillant"]').click({ noWaitAfter: true });
        await page.waitForTimeout(500);
        const afterClick = store.slice(beforeClick);
        const brands = eventNames(afterClick, 'brand');
        const guides = eventNames(afterClick, 'guide_click');
        if (brands.length !== 1) fail('one-brand-per-click', 'got ' + brands.length + ' ' + JSON.stringify(brands));
        else pass('one-brand-per-click', brands[0].body && brands[0].body.brand);
        if (guides.length !== 1) fail('one-guide-click-per-click', 'got ' + guides.length + ' ' + JSON.stringify(guides));
        else pass('one-guide-click-per-click', guides[0].body && guides[0].body.brand);
        if (brands[0] && brands[0].body && brands[0].body.brand !== 'vaillant') {
            fail('brand-name', JSON.stringify(brands[0].body));
        }
        if (guides[0] && guides[0].body && guides[0].body.brand !== 'vaillant') {
            fail('guide-brand-name', JSON.stringify(guides[0].body));
        }

        await ctx.close();

        const dedupeStore = [];
        const dedupeCtx = await browser.newContext({ locale: 'en-GB' });
        const dedupePage = await dedupeCtx.newPage();
        await attachEventRoute(dedupePage, dedupeStore);
        await dedupePage.addInitScript(function () {
            window.__mbOptimiserInit = true;
        });
        await dedupePage.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
        await dedupePage.waitForTimeout(400);
        if (eventNames(dedupeStore, 'view').length !== 0) {
            fail('init-once-skips-second-runtime', 'view still sent');
        } else pass('init-once-skips-second-runtime');
        await dedupeCtx.close();
    } catch (err) {
        fail('playwright', err && err.stack ? err.stack : String(err));
    } finally {
        await browser.close();
        server.close();
    }

    if (failures.length) {
        console.error('\n' + failures.length + ' failure(s)');
        process.exit(1);
    }
    console.log('\nAll beacon-dedupe checks passed');
})();
