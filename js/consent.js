/* Site-wide cookie consent. Loads the X pixel only after Accept. */
(function () {
    if (window.mbConsent) return;

    var STORAGE_KEY = 'mb_cookie_choice';
    var LEGACY_KEY = 'mb_optimiser_posthog';
    var PIXEL_ID = 'nvyf0';
    var listeners = [];
    var xLoaded = false;

    function readStore(key) {
        try {
            return localStorage.getItem(key) || '';
        } catch (err) {
            return '';
        }
    }

    function writeStore(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (err) { /* private mode */ }
    }

    function migrateLegacy() {
        var current = readStore(STORAGE_KEY);
        if (current === 'accepted' || current === 'declined') return current;
        var legacy = readStore(LEGACY_KEY);
        if (legacy === 'accepted' || legacy === 'declined') {
            writeStore(STORAGE_KEY, legacy);
            return legacy;
        }
        return '';
    }

    function getChoice() {
        var value = readStore(STORAGE_KEY);
        if (value === 'accepted' || value === 'declined') return value;
        return migrateLegacy();
    }

    function notify(value) {
        listeners.forEach(function (fn) {
            try { fn(value); } catch (err) { /* listener error */ }
        });
        try {
            document.dispatchEvent(new CustomEvent('mb-consent-change', { detail: value }));
        } catch (err) { /* old browsers */ }
    }

    function onChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }

    function expireCookie(name, domain) {
        var base = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;Max-Age=0';
        var extra = domain ? ';domain=' + domain : '';
        try { document.cookie = base + extra; } catch (err) {}
        try { document.cookie = base + extra + ';Secure;SameSite=Lax'; } catch (err) {}
    }

    function cookieDomains() {
        var host = location.hostname || '';
        var list = ['', host];
        if (host && host.charAt(0) !== '.') list.push('.' + host);
        var apex = host.replace(/^www\./, '');
        if (apex && apex !== host) {
            list.push(apex);
            list.push('.' + apex);
        }
        list.push('.myboiler.com');
        var unique = [];
        list.forEach(function (item) {
            if (unique.indexOf(item) === -1) unique.push(item);
        });
        return unique;
    }

    function clearTwCookies() {
        var names = { _twsid: 1, _twpid: 1, _twclid: 1 };
        try {
            document.cookie.split(';').forEach(function (part) {
                var name = part.split('=')[0].trim();
                if (name && (names[name] || name.indexOf('_tw') === 0)) names[name] = 1;
            });
        } catch (err) { /* ignore */ }
        var domains = cookieDomains();
        Object.keys(names).forEach(function (name) {
            domains.forEach(function (domain) {
                expireCookie(name, domain);
            });
        });
    }

    function loadXPixel() {
        if (xLoaded) return;
        if (getChoice() !== 'accepted') return;
        xLoaded = true;
        !function (e, t, n, s, u, a) {
            e.twq || (s = e.twq = function () {
                s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments);
            }, s.version = '1.1', s.queue = [], u = t.createElement(n), u.async = !0,
            u.src = 'https://static.ads-twitter.com/uwt.js',
            a = t.getElementsByTagName(n)[0], a.parentNode.insertBefore(u, a));
        }(window, document, 'script');
        if (typeof window.twq === 'function') window.twq('config', PIXEL_ID);
    }

    function disableXPixel() {
        try { window.twq = function () {}; } catch (err) {}
        clearTwCookies();
    }

    function hideBanner() {
        var banner = document.querySelector('.mb-consent');
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        if (document.body) document.body.classList.remove('mb-consent-open');
    }

    function showBanner() {
        if (!document.body) return;
        if (document.querySelector('.mb-consent')) return;
        var banner = document.createElement('div');
        banner.className = 'mb-consent';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Cookie consent');
        banner.innerHTML =
            '<div class="mb-consent__inner">' +
                '<p class="mb-consent__text">We use optional cookies to measure our ads and, on the Boiler Optimiser, to see how the tool is used. Nothing is set unless you accept. <a href="/privacy-policy/">Privacy policy</a></p>' +
                '<div class="mb-consent__actions">' +
                    '<button type="button" class="mb-consent__accept">Accept</button>' +
                    '<button type="button" class="mb-consent__reject">Reject</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(banner);
        document.body.classList.add('mb-consent-open');
        banner.querySelector('.mb-consent__accept').addEventListener('click', function () {
            accept();
        });
        banner.querySelector('.mb-consent__reject').addEventListener('click', function () {
            reject();
        });
    }

    function accept() {
        writeStore(STORAGE_KEY, 'accepted');
        hideBanner();
        loadXPixel();
        notify('accepted');
    }

    function reject() {
        writeStore(STORAGE_KEY, 'declined');
        hideBanner();
        disableXPixel();
        notify('declined');
    }

    function openSettings() {
        showBanner();
    }

    window.mbConsent = {
        getChoice: getChoice,
        onChange: onChange,
        openSettings: openSettings,
        accept: accept,
        reject: reject
    };

    document.addEventListener('click', function (event) {
        var target = event.target && event.target.closest
            ? event.target.closest('[data-mb-cookie-settings], .mb-cookie-settings, .optimiser-cookie-settings')
            : null;
        if (!target) return;
        event.preventDefault();
        openSettings();
    });

    function boot() {
        var choice = getChoice();
        if (choice === 'accepted') {
            loadXPixel();
            notify(choice);
        } else if (choice === 'declined') {
            disableXPixel();
            notify(choice);
        } else {
            showBanner();
        }
        try {
            document.dispatchEvent(new Event('mb-consent-ready'));
        } catch (err) { /* ignore */ }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
