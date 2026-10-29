'use strict';

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8765;
const BASE = 'http://127.0.0.1:' + PORT;

function contentType(file) {
    if (file.endsWith('.js')) return 'text/javascript';
    if (file.endsWith('.css')) return 'text/css';
    if (file.endsWith('.svg')) return 'image/svg+xml';
    if (file.endsWith('.json')) return 'application/json';
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

async function snapshot(page) {
    return page.evaluate(function () {
        var cookies = document.cookie || '';
        var localKeys = [];
        var sessionKeys = [];
        try {
            for (var i = 0; i < localStorage.length; i++) localKeys.push(localStorage.key(i));
        } catch (err) {}
        try {
            for (var j = 0; j < sessionStorage.length; j++) sessionKeys.push(sessionStorage.key(j));
        } catch (err) {}
        return {
            cookie: cookies,
            localKeys: localKeys.sort(),
            sessionKeys: sessionKeys.sort(),
            phCookies: cookies.split(';').map(function (part) { return part.split('=')[0].trim(); }).filter(function (name) {
                return name.indexOf('ph_') === 0 || name.indexOf('phc_') === 0;
            }),
            phLocal: localKeys.filter(function (key) { return key && key.indexOf('ph_') === 0; }),
            phSession: sessionKeys.filter(function (key) { return key && key.indexOf('ph_') === 0; }),
            choice: (function () {
                try { return localStorage.getItem('mb_optimiser_posthog') || ''; } catch (err) { return ''; }
            })(),
            banner: !!document.querySelector('.optimiser-consent'),
            cookieSettings: !!document.querySelector('.optimiser-cookie-settings')
        };
    });
}

function printSnap(label, snap) {
    console.log('\n=== ' + label + ' ===');
    console.log('document.cookie:', JSON.stringify(snap.cookie));
    console.log('localStorage keys:', JSON.stringify(snap.localKeys));
    console.log('sessionStorage keys:', JSON.stringify(snap.sessionKeys));
    console.log('ph_* cookies:', JSON.stringify(snap.phCookies));
    console.log('ph_* localStorage:', JSON.stringify(snap.phLocal));
    console.log('ph_* sessionStorage:', JSON.stringify(snap.phSession));
    console.log('choice flag:', JSON.stringify(snap.choice));
    console.log('banner visible:', snap.banner);
    console.log('cookie settings link:', snap.cookieSettings);
}

(async function () {
    const server = await startServer();
    const browser = await chromium.launch({
        executablePath: '/usr/local/bin/google-chrome',
        headless: true,
        args: ['--disable-gpu', '--no-sandbox']
    });
    const context = await browser.newContext();
    await context.clearCookies();
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.route('**/*.{mp4,webm,ogg}', function (route) { return route.abort(); });

    await page.goto(BASE + '/boiler-optimiser/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.optimiser-consent');
    await page.waitForSelector('.optimiser-cookie-settings');
    const before = await snapshot(page);
    printSnap('before consent', before);
    if (before.phCookies.length || before.phLocal.length || before.phSession.length) {
        throw new Error('PostHog storage present before consent');
    }

    await page.click('.optimiser-consent__accept');
    await page.waitForTimeout(4000);
    const afterAccept = await snapshot(page);
    printSnap('after Accept', afterAccept);
    if (afterAccept.choice !== 'accepted') throw new Error('Accept did not store choice');
    if (afterAccept.banner) throw new Error('Banner still visible after Accept');

    await page.click('.optimiser-cookie-settings');
    await page.waitForSelector('.optimiser-consent__decline');
    await page.click('.optimiser-consent__decline');
    await page.waitForTimeout(1500);
    const afterOptOut = await snapshot(page);
    printSnap('after Opt out', afterOptOut);
    if (afterOptOut.choice !== 'declined') throw new Error('Opt out did not store choice');
    if (afterOptOut.phCookies.length || afterOptOut.phLocal.length || afterOptOut.phSession.length) {
        throw new Error('PostHog storage still present after opt out: ' + JSON.stringify(afterOptOut));
    }

    await browser.close();
    server.close();
    console.log('\nConsent test passed.');
})().catch(function (err) {
    console.error(err);
    process.exit(1);
});
