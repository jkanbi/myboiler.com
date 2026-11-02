'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8771;
const BASE = 'http://127.0.0.1:' + PORT;
const CHROME = '/usr/local/bin/google-chrome';
const PAGEVIEW_PATH = '/boiler-optimiser/?utm_source=test&utm_campaign=test';
const REFERRER = 'https://example.com/from-ad';

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

function isPosthogUrl(url) {
    return /posthog\.com/i.test(url);
}

function isPosthogAsset(url) {
    return /posthog\.com/i.test(url) && (
        /array\.js/i.test(url) ||
        /config\.js/i.test(url) ||
        /posthog-recorder/i.test(url) ||
        /static\//i.test(url)
    );
}

async function hookPosthog(page) {
    await page.addInitScript(function () {
        window.__mbPhEvents = [];
        window.__mbPhSent = [];
        var stored;
        function wrapCaptureFn(fn) {
            if (typeof fn !== 'function' || fn.__mbWrapped) return fn;
            var wrapped = function (name, props) {
                window.__mbPhEvents.push({
                    name: name,
                    href: location.href,
                    referrer: document.referrer,
                    props: props || {}
                });
                return fn.apply(this, arguments);
            };
            wrapped.__mbWrapped = true;
            return wrapped;
        }
        function wrapInitFn(fn) {
            if (typeof fn !== 'function' || fn.__mbWrapped) return fn;
            var wrapped = function (token, config, name) {
                config = config || {};
                var origBefore = config.before_send;
                config.before_send = function (event) {
                    try {
                        window.__mbPhSent.push({
                            event: event && event.event,
                            current_url: event && event.properties && event.properties.$current_url,
                            referrer: event && event.properties && event.properties.$referrer,
                            utm_source: event && event.properties && event.properties.utm_source,
                            utm_campaign: event && event.properties && event.properties.utm_campaign
                        });
                    } catch (err) {}
                    if (typeof origBefore === 'function') return origBefore(event);
                    return event;
                };
                return fn.call(this, token, config, name);
            };
            wrapped.__mbWrapped = true;
            return wrapped;
        }
        function trapMethod(obj, key, wrapFn) {
            var impl;
            try {
                Object.defineProperty(obj, key, {
                    configurable: true,
                    enumerable: true,
                    get: function () { return impl; },
                    set: function (fn) { impl = wrapFn(fn); }
                });
            } catch (err) {
                if (obj[key]) impl = wrapFn(obj[key]);
            }
        }
        function trap(ph) {
            if (!ph || ph.__mbTrapped) return ph;
            ph.__mbTrapped = true;
            trapMethod(ph, 'capture', wrapCaptureFn);
            trapMethod(ph, 'init', wrapInitFn);
            return ph;
        }
        try {
            Object.defineProperty(window, 'posthog', {
                configurable: true,
                enumerable: true,
                get: function () { return stored; },
                set: function (val) { stored = trap(val); }
            });
        } catch (err) {}
    });
}

function attachNetwork(page, store) {
    page.on('request', function (req) {
        var url = req.url();
        if (isPosthogUrl(url)) store.push({ url: url, postData: req.postData() || '' });
    });
}

function phCookiesAndStorage(snap) {
    return {
        cookies: snap.cookies,
        local: snap.local,
        session: snap.session
    };
}

async function snapshotStorage(page) {
    return page.evaluate(function () {
        function keys(store, prefix) {
            var out = [];
            try {
                for (var i = 0; i < store.length; i++) {
                    var key = store.key(i);
                    if (key && key.indexOf(prefix) === 0) out.push(key);
                }
            } catch (err) {}
            return out;
        }
        var cookies = [];
        try {
            String(document.cookie || '').split(';').forEach(function (part) {
                var name = part.split('=')[0].trim();
                if (name && (name.indexOf('ph_') === 0 || name.indexOf('phc_') === 0 || name.indexOf('__ph_') === 0)) {
                    cookies.push(name);
                }
            });
        } catch (err) {}
        return {
            choice: (function () { try { return localStorage.getItem('mb_optimiser_posthog') || ''; } catch (err) { return ''; } })(),
            cookies: cookies,
            local: keys(window.localStorage, 'ph_').concat(keys(window.localStorage, '__ph_')),
            session: keys(window.sessionStorage, 'ph_').concat(keys(window.sessionStorage, '__ph_'))
        };
    });
}

async function waitForPageviews(page, minCount, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    await page.waitForFunction(function (min) {
        var sent = (window.__mbPhSent || []).filter(function (ev) { return ev.event === '$pageview'; });
        var captured = (window.__mbPhEvents || []).filter(function (ev) { return ev.name === '$pageview'; });
        return sent.length >= min || captured.length >= min;
    }, minCount, { timeout: timeoutMs }).catch(function () {});
}

function pageviewsFrom(pageEval) {
    var sent = (pageEval.sent || []).filter(function (ev) { return ev.event === '$pageview'; });
    var captured = (pageEval.events || []).filter(function (ev) { return ev.name === '$pageview'; });
    return { sent: sent, captured: captured };
}

async function readPh(page) {
    return page.evaluate(function () {
        return {
            events: window.__mbPhEvents || [],
            sent: window.__mbPhSent || [],
            loaded: !!(window.posthog && window.posthog.__loaded)
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

    const server = await startServer();
    const browser = await chromium.launch({
        executablePath: CHROME,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const noStore = [];
        const noCtx = await browser.newContext({ locale: 'en-GB' });
        const noPage = await noCtx.newPage();
        await hookPosthog(noPage);
        attachNetwork(noPage, noStore);
        await noPage.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
        await noPage.waitForSelector('.optimiser-consent.is-visible');
        await noPage.waitForTimeout(1500);
        const noSnap = await snapshotStorage(noPage);
        const noPh = await readPh(noPage);
        if (noStore.length) fail('no-consent-network', JSON.stringify(noStore.map(function (r) { return r.url; })));
        else pass('no-consent-network', 'no PostHog requests');
        if (noSnap.cookies.length || noSnap.local.length || noSnap.session.length) {
            fail('no-consent-storage', JSON.stringify(phCookiesAndStorage(noSnap)));
        } else pass('no-consent-storage');
        if (noPh.sent.length || noPh.events.length) fail('no-consent-events', JSON.stringify(noPh));
        else pass('no-consent-events');
        await noCtx.close();

        const acceptStore = [];
        const acceptCtx = await browser.newContext({ locale: 'en-GB' });
        const acceptPage = await acceptCtx.newPage();
        await hookPosthog(acceptPage);
        attachNetwork(acceptPage, acceptStore);
        await acceptPage.goto(BASE + PAGEVIEW_PATH, {
            waitUntil: 'domcontentloaded',
            referer: REFERRER
        });
        await acceptPage.waitForSelector('.optimiser-consent__accept');
        const beforeAcceptStoreLen = acceptStore.length;
        const beforeAcceptSnap = await snapshotStorage(acceptPage);
        if (beforeAcceptStoreLen) fail('accept-before-network', JSON.stringify(acceptStore));
        if (beforeAcceptSnap.cookies.length || beforeAcceptSnap.local.length || beforeAcceptSnap.session.length) {
            fail('accept-before-storage', JSON.stringify(phCookiesAndStorage(beforeAcceptSnap)));
        }
        await acceptPage.click('.optimiser-consent__accept');
        await waitForPageviews(acceptPage, 1);
        await acceptPage.waitForTimeout(800);
        const acceptPh = await readPh(acceptPage);
        const acceptPv = pageviewsFrom(acceptPh);
        const acceptSnap = await snapshotStorage(acceptPage);
        if (acceptSnap.choice !== 'accepted') fail('accept-choice', acceptSnap.choice);
        else pass('accept-choice');
        const assetHit = acceptStore.some(function (r) { return isPosthogAsset(r.url); });
        if (!assetHit) fail('accept-posthog-loaded', JSON.stringify(acceptStore.map(function (r) { return r.url; })));
        else pass('accept-posthog-loaded');
        if (acceptPv.sent.length + acceptPv.captured.length === 0) {
            fail('accept-pageview', JSON.stringify(acceptPh));
        } else if (acceptPv.sent.length > 1 || acceptPv.captured.length > 1) {
            fail('accept-pageview-duplicate', 'sent=' + acceptPv.sent.length + ' captured=' + acceptPv.captured.length + ' ' + JSON.stringify(acceptPh));
        } else {
            const sample = acceptPv.sent[0] || {
                current_url: acceptPv.captured[0].href,
                referrer: acceptPv.captured[0].referrer
            };
            const url = sample.current_url || '';
            const ref = sample.referrer || '';
            const okUtm = /utm_source=test/.test(url) && /utm_campaign=test/.test(url);
            const okRef = ref === REFERRER;
            if (!okUtm || !okRef) fail('accept-pageview-props', JSON.stringify(sample));
            else pass('accept-pageview', url + ' referrer=' + ref);
        }
        await acceptCtx.close();

        const reloadStore = [];
        const reloadCtx = await browser.newContext({ locale: 'en-GB' });
        const reloadPage = await reloadCtx.newPage();
        await hookPosthog(reloadPage);
        attachNetwork(reloadPage, reloadStore);
        await reloadPage.addInitScript(function () {
            try { localStorage.setItem('mb_optimiser_posthog', 'accepted'); } catch (err) {}
        });
        await reloadPage.goto(BASE + PAGEVIEW_PATH, {
            waitUntil: 'domcontentloaded',
            referer: REFERRER
        });
        await waitForPageviews(reloadPage, 1);
        await reloadPage.waitForTimeout(800);
        const reloadPh = await readPh(reloadPage);
        const reloadPv = pageviewsFrom(reloadPh);
        if (reloadPv.sent.length + reloadPv.captured.length === 0) {
            fail('reload-pageview', JSON.stringify(reloadPh));
        } else if (reloadPv.sent.length > 1 || reloadPv.captured.length > 1) {
            fail('reload-pageview-duplicate', 'sent=' + reloadPv.sent.length + ' captured=' + reloadPv.captured.length);
        } else {
            const sample = reloadPv.sent[0] || {
                current_url: reloadPv.captured[0].href,
                referrer: reloadPv.captured[0].referrer
            };
            const url = sample.current_url || '';
            if (!/utm_source=test/.test(url) || !/utm_campaign=test/.test(url)) {
                fail('reload-pageview-utm', JSON.stringify(sample));
            } else pass('reload-pageview', 'one $pageview ' + url);
        }
        await reloadCtx.close();

        const rejectStore = [];
        const rejectCtx = await browser.newContext({ locale: 'en-GB' });
        const rejectPage = await rejectCtx.newPage();
        await hookPosthog(rejectPage);
        attachNetwork(rejectPage, rejectStore);
        await rejectPage.goto(BASE + PAGEVIEW_PATH, { waitUntil: 'domcontentloaded', referer: REFERRER });
        await rejectPage.waitForSelector('.optimiser-consent__decline');
        await rejectPage.click('.optimiser-consent__decline');
        await rejectPage.waitForTimeout(1500);
        const rejectSnap = await snapshotStorage(rejectPage);
        const rejectPh = await readPh(rejectPage);
        if (rejectStore.length) fail('reject-network', JSON.stringify(rejectStore.map(function (r) { return r.url; })));
        else pass('reject-network', 'no PostHog requests');
        if (rejectSnap.choice !== 'declined') fail('reject-choice', rejectSnap.choice);
        else pass('reject-choice');
        if (rejectSnap.cookies.length || rejectSnap.local.length || rejectSnap.session.length) {
            fail('reject-storage', JSON.stringify(phCookiesAndStorage(rejectSnap)));
        } else pass('reject-storage');
        if (rejectPh.sent.length || rejectPh.events.length) fail('reject-events', JSON.stringify(rejectPh));
        else pass('reject-events');
        await rejectCtx.close();

        const dismissStore = [];
        const dismissCtx = await browser.newContext({ locale: 'en-GB' });
        const dismissPage = await dismissCtx.newPage();
        await hookPosthog(dismissPage);
        attachNetwork(dismissPage, dismissStore);
        await dismissPage.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
        await dismissPage.waitForSelector('.optimiser-consent__dismiss');
        await dismissPage.click('.optimiser-consent__dismiss');
        await dismissPage.waitForTimeout(800);
        const dismissSnap = await snapshotStorage(dismissPage);
        if (dismissStore.length) fail('dismiss-network', JSON.stringify(dismissStore.map(function (r) { return r.url; })));
        else pass('dismiss-network');
        if (dismissSnap.choice) fail('dismiss-choice', dismissSnap.choice);
        if (dismissSnap.cookies.length || dismissSnap.local.length || dismissSnap.session.length) {
            fail('dismiss-storage', JSON.stringify(phCookiesAndStorage(dismissSnap)));
        } else pass('dismiss-storage');
        await dismissCtx.close();
    } finally {
        await browser.close();
        server.close();
    }

    if (failures.length) {
        console.error('\n' + failures.length + ' failure(s)');
        throw new Error(failures.join('\n'));
    }
    console.log('\nAll pageview tests passed');
})().catch(function (err) {
    console.error(err);
    process.exit(1);
});
