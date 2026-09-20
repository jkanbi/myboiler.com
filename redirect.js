// Client-side redirect script for GitHub Pages
(function() {
    'use strict';

    // Served as-is from the site root. Content pages (advice/, calculators/,
    // fault-codes/, vaillant/, …) also live at root paths. Apps keep their
    // existing URLs: /chat/, /quote/, /decide/, /heat-pump-checker/.
    const STATIC_FOLDERS = [
        'css', 'js', 'img', 'pages', 'assets',
        'calculators', 'chat', 'decide', 'quote', 'heat-pump-checker'
    ];
    const ROOT_FILES = ['favicon.ico', 'CNAME', 'robots.txt', '404.html', ''];

    const path = window.location.pathname;
    const pathSegments = path.split('/').filter(function(segment) { return segment; });
    const isStaticAsset = pathSegments.length > 0 && STATIC_FOLDERS.includes(pathSegments[0]);
    const isRootFile = ROOT_FILES.includes(pathSegments[0] || '') || path === '/';

    // Legacy /hub/... URLs (and /hub itself) redirect to the same path without /hub.
    // Do not prefix unknown paths with /hub.
    if (path === '/hub' || path.indexOf('/hub/') === 0) {
        const stripped = (path === '/hub' || path === '/hub/') ? '/' : path.replace(/^\/hub/, '');
        window.location.replace(window.location.origin + stripped + window.location.search);
        return;
    }

    if (isStaticAsset || isRootFile) {
        return;
    }
})();
