(function () {
    if (window.__mbWinterBannerBound) return;
    window.__mbWinterBannerBound = true;

    var STORAGE_KEY = 'mb_winter_banner_dismissed_2026';
    var OPTIMISER_HREF =
        '/boiler-optimiser/?utm_source=myboiler&utm_medium=site_banner&utm_campaign=winter_combi';
    var LEAD =
        '❄️ Got a combi boiler? Turning the flow temperature down could cut your gas bill this winter. ';
    var CTA = 'Try the free Boiler Optimiser →';

    function isOptimiserPath() {
        return /(^|\/)boiler-optimiser(\/|-|$)/.test(location.pathname || '');
    }

    function wasDismissed() {
        try {
            if (window.localStorage.getItem(STORAGE_KEY) === '1') return true;
        } catch (err) {
            try {
                if (window.sessionStorage.getItem(STORAGE_KEY) === '1') return true;
            } catch (sessionErr) {}
        }
        return false;
    }

    function rememberDismissed() {
        try {
            window.localStorage.setItem(STORAGE_KEY, '1');
            return;
        } catch (err) {
            try {
                window.sessionStorage.setItem(STORAGE_KEY, '1');
            } catch (sessionErr) {
                // Current-page hide still applies after the button click.
            }
        }
    }

    function removeReserve() {
        var html = document.documentElement;
        if (html && html.classList && html.classList.remove) {
            html.classList.remove('mb-winter-banner-on');
        }
        var reserve = document.getElementById('mb-winter-banner-reserve');
        if (reserve && reserve.parentNode) reserve.parentNode.removeChild(reserve);
    }

    function hideBanner(banner) {
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        removeReserve();
    }

    function injectStyles() {
        if (document.getElementById('mb-winter-banner-css')) return;
        var link = document.createElement('link');
        link.id = 'mb-winter-banner-css';
        link.rel = 'stylesheet';
        link.href = '/css/winter-banner.css?v=winter-3';
        (document.head || document.documentElement).appendChild(link);
    }

    function buildBanner() {
        var banner = document.createElement('div');
        banner.id = 'mb-winter-banner';
        banner.className = 'mb-winter-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Winter alert');

        var inner = document.createElement('div');
        inner.className = 'mb-winter-banner__inner';

        var text = document.createElement('p');
        text.className = 'mb-winter-banner__text';
        var lead = document.createElement('span');
        lead.textContent = LEAD;
        text.appendChild(lead);

        var link = document.createElement('a');
        link.className = 'mb-winter-banner__link';
        link.href = OPTIMISER_HREF;
        link.textContent = CTA;
        text.appendChild(link);

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'mb-winter-banner__close';
        close.setAttribute('aria-label', 'Dismiss winter alert');
        close.innerHTML = '&times;';
        close.addEventListener('click', function (event) {
            event.preventDefault();
            rememberDismissed();
            hideBanner(banner);
        });

        inner.appendChild(text);
        inner.appendChild(close);
        banner.appendChild(inner);
        return banner;
    }

    function mount() {
        if (!document.body || document.getElementById('mb-winter-banner')) return;
        if (isOptimiserPath() || wasDismissed()) {
            removeReserve();
            return;
        }

        injectStyles();
        var banner = buildBanner();
        var header = document.querySelector('header.header');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(banner, header);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }
        removeReserve();
    }

    function start() {
        if (isOptimiserPath() || wasDismissed()) {
            removeReserve();
            return;
        }

        if (document.body) {
            mount();
            return;
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', mount);
            return;
        }

        mount();
    }

    start();
})();
