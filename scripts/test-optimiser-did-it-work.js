'use strict';

const { chromium, devices } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8767;
const BASE = 'http://127.0.0.1:' + PORT;
const ARTIFACTS = '/opt/cursor/artifacts';
const CHROME = '/usr/local/bin/google-chrome';

function contentType(file) {
    if (file.endsWith('.js')) return 'text/javascript';
    if (file.endsWith('.css')) return 'text/css';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.json')) return 'application/json';
    if (file.endsWith('.png')) return 'image/png';
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
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

async function attachPage(page, store) {
    await page.route('**/api/optimiser-feedback**', function (route) {
        store.feedback.push({
            method: route.request().method(),
            url: route.request().url(),
            postData: route.request().postData() || ''
        });
        if (route.request().method() === 'POST') {
            return route.fulfill({ status: 204, body: '' });
        }
        return route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/*posthog.com/**', function (route) {
        store.posthog.push({
            url: route.request().url(),
            postData: route.request().postData() || ''
        });
        return route.continue();
    });
}

async function openOptimiser(page, extras) {
    extras = extras || {};
    if (extras.accept) {
        await page.addInitScript(function () {
            try { localStorage.setItem('mb_optimiser_posthog', 'accepted'); } catch (err) {}
        });
    }
    if (extras.turnedDown) {
        await page.addInitScript(function () {
            try { localStorage.setItem('mb_optimiser_turned_down', '1'); } catch (err) {}
        });
    }
    await page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#tool-confirm');
    if (!extras.accept) {
        await page.evaluate(function () {
            var dismiss = document.querySelector('.optimiser-consent__dismiss');
            if (dismiss) dismiss.click();
        });
    }
    await page.waitForTimeout(250);
}

async function shot(page, name) {
    await page.locator('#tool-confirm').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const file = path.join(ARTIFACTS, name);
    await page.locator('#tool-confirm').screenshot({ path: file });
    console.log('screenshot ' + file);
    return file;
}

function parseBodies(store) {
    return store.feedback.map(function (item) {
        try { return JSON.parse(item.postData); } catch (err) { return null; }
    }).filter(Boolean);
}

async function runTests(browser) {
    const failures = [];
    function fail(name, detail) {
        failures.push(name + ': ' + detail);
        console.error('FAIL ' + name + ': ' + detail);
    }
    function pass(name) {
        console.log('PASS ' + name);
    }

    const noConsentStore = { posthog: [], feedback: [] };
    const noConsent = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'en-GB'
    });
    const noPage = await noConsent.newPage();
    await attachPage(noPage, noConsentStore);
    await openOptimiser(noPage);
    await noPage.locator('#tool-confirm-already').click();
    await noPage.waitForSelector('#tool-confirm-checkback:not([hidden])');
    await noPage.locator('[data-did-it-work="yes"]').click();
    await noPage.waitForTimeout(400);
    const noBodies = parseBodies(noConsentStore);
    const noDid = noBodies.find(function (body) { return body.type === 'did_it_work'; });
    const noKeys = await noPage.evaluate(function () {
        var keys = [];
        try {
            for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        } catch (err) {}
        return {
            keys: keys,
            turned: (function () { try { return localStorage.getItem('mb_optimiser_turned_down'); } catch (err) { return null; } })(),
            work: (function () { try { return localStorage.getItem('mb_optimiser_did_it_work'); } catch (err) { return null; } })(),
            cookies: document.cookie
        };
    });
    if (!noDid || noDid.answer !== 'yes') fail('no-consent-store', 'missing did_it_work=yes, got ' + JSON.stringify(noBodies));
    else pass('no-consent-store');
    if (noKeys.turned || noKeys.work) fail('no-consent-storage', JSON.stringify(noKeys));
    else pass('no-consent-storage');
    if (noConsentStore.posthog.length) fail('no-consent-posthog', noConsentStore.posthog.join(', '));
    else pass('no-consent-posthog');
    if ((noKeys.cookies || '').indexOf('ph_') !== -1) fail('no-consent-cookies', noKeys.cookies);
    else pass('no-consent-cookies');
    await noConsent.close();

    const yesStore = { posthog: [], feedback: [] };
    const yesCtx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'en-GB'
    });
    await yesCtx.addInitScript(function () {
        try { localStorage.setItem('mb_optimiser_posthog', 'accepted'); } catch (err) {}
        window.__mbPhEvents = [];
        window.setInterval(function () {
            if (!window.posthog || typeof window.posthog.capture !== 'function') return;
            if (window.posthog.capture.__mbWrapped) return;
            var orig = window.posthog.capture;
            var wrapped = function (name, props) {
                window.__mbPhEvents.push({ name: name, props: props || {} });
                return orig.apply(this, arguments);
            };
            wrapped.__mbWrapped = true;
            try { window.posthog.capture = wrapped; } catch (err) {}
        }, 30);
    });
    const yesPage = await yesCtx.newPage();
    await attachPage(yesPage, yesStore);
    await openOptimiser(yesPage, { accept: true });
    await yesPage.locator('#confirm-brand').selectOption('worcester');
    await yesPage.locator('#from-flow').fill('75');
    await yesPage.locator('#set-flow').fill('55');
    await yesPage.locator('#tool-confirm-submit').click();
    await yesPage.waitForSelector('#tool-confirm-checkback:not([hidden])');
    const afterSubmit = await yesPage.evaluate(function () {
        return {
            turned: localStorage.getItem('mb_optimiser_turned_down'),
            choice: localStorage.getItem('mb_optimiser_posthog'),
            checkback: !document.getElementById('tool-confirm-checkback').hidden
        };
    });
    if (afterSubmit.choice !== 'accepted' || afterSubmit.turned !== '1' || !afterSubmit.checkback) {
        fail('consent-submit-flag', JSON.stringify(afterSubmit));
    } else pass('consent-submit-flag');

    await yesPage.reload({ waitUntil: 'domcontentloaded' });
    await yesPage.waitForSelector('#tool-confirm');
    const afterReload = await yesPage.evaluate(function () {
        var box = document.getElementById('tool-confirm-checkback');
        var fields = document.querySelector('.tool-confirm-fields');
        return {
            checkback: box && !box.hidden,
            doneClass: document.getElementById('tool-confirm').classList.contains('is-done'),
            fieldsHidden: fields ? getComputedStyle(fields).display === 'none' : false
        };
    });
    if (!afterReload.checkback || !afterReload.doneClass || !afterReload.fieldsHidden) {
        fail('consent-reload-followup', JSON.stringify(afterReload));
    } else pass('consent-reload-followup');

    await yesPage.waitForFunction(function () {
        return window.posthog && typeof window.posthog.capture === 'function' && window.posthog.capture.__mbWrapped;
    }, null, { timeout: 10000 }).catch(function () {});
    await yesPage.locator('[data-did-it-work="cool"]').click();
    await yesPage.waitForTimeout(800);
    const yesBodies = parseBodies(yesStore);
    const yesDid = yesBodies.find(function (body) { return body.type === 'did_it_work' && body.answer === 'cool'; });
    const phHit = yesStore.posthog.some(function (item) {
        var blob = (item.url || '') + ' ' + (item.postData || '');
        try { blob += ' ' + decodeURIComponent(item.postData || ''); } catch (err) {}
        return /optimiser_did_it_work/.test(blob);
    });
    if (!yesDid) fail('consent-store', JSON.stringify(yesBodies));
    else pass('consent-store');
    const captured = await yesPage.evaluate(function () {
        var events = window.__mbPhEvents || [];
        var form = document.getElementById('tool-confirm');
        var tip = document.getElementById('tool-confirm-checkback-tip');
        return {
            has: events.some(function (ev) { return ev.name === 'optimiser_did_it_work' && ev.props && ev.props.answer === 'cool'; }),
            events: events,
            choice: (function () { try { return localStorage.getItem('mb_optimiser_posthog'); } catch (err) { return ''; } })(),
            storedAnswer: (function () { try { return localStorage.getItem('mb_optimiser_did_it_work'); } catch (err) { return ''; } })(),
            didAttr: form ? form.dataset.didItWork : '',
            tip: tip ? tip.textContent : '',
            captureType: window.posthog ? typeof window.posthog.capture : 'no-ph',
            wrapped: !!(window.posthog && window.posthog.capture && window.posthog.capture.__mbWrapped)
        };
    });
    if (!phHit && !captured.has) {
        fail('consent-posthog', 'no event. ' + JSON.stringify(captured));
    } else pass('consent-posthog');
    await yesCtx.close();

    const iphone = devices['iPhone 13'];
    const shotCtx = await browser.newContext({ ...iphone, locale: 'en-GB' });
    const shotPage = await shotCtx.newPage();
    await openOptimiser(shotPage);
    await shot(shotPage, 'did_it_work_mobile_initial.png');
    await shotPage.locator('#tool-confirm-already').click();
    await shot(shotPage, 'did_it_work_mobile_followup.png');
    await shotPage.locator('[data-did-it-work="yes"]').click();
    await shot(shotPage, 'did_it_work_mobile_yes.png');
    await shotCtx.close();

    const shot2 = await browser.newContext({ ...iphone, locale: 'en-GB' });
    const p2 = await shot2.newPage();
    await openOptimiser(p2);
    await p2.locator('#tool-confirm-already').click();
    await p2.locator('[data-did-it-work="cool"]').click();
    await shot(p2, 'did_it_work_mobile_cool.png');
    await shot2.close();

    const shot3 = await browser.newContext({ ...iphone, locale: 'en-GB' });
    const p3 = await shot3.newPage();
    await openOptimiser(p3);
    await p3.locator('#tool-confirm-already').click();
    await p3.locator('[data-did-it-work="not_yet"]').click();
    await shot(p3, 'did_it_work_mobile_not_yet.png');
    await shot3.close();

    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });
    const d1 = await desk.newPage();
    await openOptimiser(d1);
    await shot(d1, 'did_it_work_desktop_initial.png');
    await d1.locator('#tool-confirm-already').click();
    await shot(d1, 'did_it_work_desktop_followup.png');
    await d1.locator('[data-did-it-work="yes"]').click();
    await shot(d1, 'did_it_work_desktop_yes.png');
    await desk.close();

    const desk2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });
    const d2 = await desk2.newPage();
    await openOptimiser(d2);
    await d2.locator('#tool-confirm-already').click();
    await d2.locator('[data-did-it-work="cool"]').click();
    await shot(d2, 'did_it_work_desktop_cool.png');
    await desk2.close();

    const desk3 = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });
    const d3 = await desk3.newPage();
    await openOptimiser(d3);
    await d3.locator('#tool-confirm-already').click();
    await d3.locator('[data-did-it-work="not_yet"]').click();
    await shot(d3, 'did_it_work_desktop_not_yet.png');
    await desk3.close();

    if (failures.length) {
        throw new Error(failures.join('\n'));
    }
}

(async function () {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const server = await startServer();
    const browser = await chromium.launch({
        executablePath: CHROME,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    try {
        await runTests(browser);
        console.log('All did-it-work tests passed');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(function (err) {
    console.error(err);
    process.exit(1);
});
