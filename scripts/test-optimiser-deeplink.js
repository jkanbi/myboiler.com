'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8774;
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

async function openOptimiser(page, search) {
    await page.goto(BASE + '/boiler-optimiser/' + (search || ''), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#setup-choices');
}

async function setupState(page) {
    return page.evaluate(function () {
        var active = document.querySelector('#setup-choices [data-choice].active');
        return {
            choice: active ? active.getAttribute('data-choice') : '',
            pressed: active ? active.getAttribute('aria-pressed') : '',
            noteHidden: document.getElementById('standard-note').hidden,
            href: location.href,
            search: location.search
        };
    });
}

async function brandState(page) {
    return page.evaluate(function () {
        var tiles = Array.prototype.map.call(document.querySelectorAll('#brand-picks [data-brand]'), function (tile) {
            return {
                brand: tile.getAttribute('data-brand'),
                active: tile.classList.contains('active'),
                pressed: tile.getAttribute('aria-pressed'),
                hidden: tile.hidden
            };
        });
        return {
            tiles: tiles,
            chosen: document.getElementById('brand-bar').classList.contains('is-chosen'),
            backHidden: document.getElementById('brand-back').hidden,
            href: location.href,
            search: location.search
        };
    });
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

    const html = fs.readFileSync(path.join(ROOT, 'boiler-optimiser/index.html'), 'utf8');
    if (html.indexOf('<!-- Deep link: ?system=combi|system|non-condensing&brand=vaillant -->') === -1) {
        fail('source-comment', 'missing deep-link HTML comment');
    } else pass('source-comment');
    if (!/data-stamp="2026-11-12 [^"]* · 46"/.test(html)) fail('source-stamp', 'expected Version 46 on 12 November 2026');
    else pass('source-stamp');

    const server = await startServer();
    const browser = await chromium.launch({
        executablePath: CHROME,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const ctx = await browser.newContext({ locale: 'en-GB' });
        const page = await ctx.newPage();

        await openOptimiser(page, '');
        let setup = await setupState(page);
        if (setup.choice !== 'combi' || setup.noteHidden !== true) fail('default-combi', JSON.stringify(setup));
        else pass('default-combi');

        await openOptimiser(page, '?system=system');
        setup = await setupState(page);
        if (setup.choice !== 'system' || setup.noteHidden !== true) fail('system-system', JSON.stringify(setup));
        else pass('system-system');
        if (setup.search.indexOf('system=system') === -1) fail('system-keeps-url', setup.search);
        else pass('system-keeps-url');

        await openOptimiser(page, '?system=non-condensing');
        setup = await setupState(page);
        if (setup.choice !== 'standard' || setup.noteHidden !== false) fail('system-non-condensing', JSON.stringify(setup));
        else pass('system-non-condensing');

        await openOptimiser(page, '?system=STANDARD');
        setup = await setupState(page);
        if (setup.choice !== 'standard' || setup.noteHidden !== false) fail('system-standard-alias', JSON.stringify(setup));
        else pass('system-standard-alias');

        await openOptimiser(page, '?system=nope');
        setup = await setupState(page);
        if (setup.choice !== 'combi' || setup.noteHidden !== true) fail('system-unknown', JSON.stringify(setup));
        else pass('system-unknown');

        await openOptimiser(page, '?brand=vaillant');
        if (!/\/boiler-optimiser\/\?brand=vaillant/.test(page.url())) {
            fail('brand-no-redirect', page.url());
        } else pass('brand-no-redirect');
        let brands = await brandState(page);
        const vaillant = brands.tiles.filter(function (t) { return t.brand === 'vaillant'; })[0];
        const othersHidden = brands.tiles.filter(function (t) { return t.brand !== 'vaillant'; }).every(function (t) { return t.hidden; });
        if (!vaillant || !vaillant.active || vaillant.pressed !== 'true') fail('brand-vaillant-active', JSON.stringify(vaillant));
        else pass('brand-vaillant-active');
        if (!brands.chosen || brands.backHidden) fail('brand-chosen-style', JSON.stringify({ chosen: brands.chosen, backHidden: brands.backHidden }));
        else pass('brand-chosen-style');
        if (!othersHidden) fail('brand-others-hidden', JSON.stringify(brands.tiles));
        else pass('brand-others-hidden');

        await openOptimiser(page, '?brand=worcester-bosch');
        brands = await brandState(page);
        const worcester = brands.tiles.filter(function (t) { return t.brand === 'worcester'; })[0];
        if (!worcester || !worcester.active || !/brand=worcester-bosch/.test(page.url())) {
            fail('brand-worcester-bosch-alias', JSON.stringify({ worcester: worcester, url: page.url() }));
        } else pass('brand-worcester-bosch-alias');

        await openOptimiser(page, '?brand=glowworm');
        brands = await brandState(page);
        const glow = brands.tiles.filter(function (t) { return t.brand === 'glow-worm'; })[0];
        if (!glow || !glow.active) fail('brand-glowworm-alias', JSON.stringify(glow));
        else pass('brand-glowworm-alias');

        await openOptimiser(page, '?brand=nope');
        brands = await brandState(page);
        if (brands.chosen || brands.tiles.some(function (t) { return t.active; })) {
            fail('brand-unknown', JSON.stringify(brands));
        } else pass('brand-unknown');

        await openOptimiser(page, '?system=system&brand=ideal');
        setup = await setupState(page);
        brands = await brandState(page);
        const ideal = brands.tiles.filter(function (t) { return t.brand === 'ideal'; })[0];
        if (setup.choice !== 'system' || !ideal || !ideal.active) {
            fail('combined', JSON.stringify({ setup: setup, ideal: ideal }));
        } else pass('combined');

        await openOptimiser(page, '?system=system#note-1');
        await page.locator('#setup-aside').click();
        await page.waitForTimeout(200);
        const afterNote = await page.evaluate(function () {
            return { search: location.search, hash: location.hash };
        });
        if (afterNote.search.indexOf('system=system') === -1) fail('hash-keeps-search', JSON.stringify(afterNote));
        else pass('hash-keeps-search', afterNote.hash);

        await ctx.close();
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
    console.log('\nAll deeplink checks passed');
})();
