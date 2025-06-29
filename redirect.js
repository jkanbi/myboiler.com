// Client-side redirect script for GitHub Pages
(function() {
    'use strict';
    
    // Define static asset folders that should be served from myboiler.com
    const STATIC_FOLDERS = ['css', 'js', 'img', 'pages'];
    
    // Define root files that should be served from myboiler.com
    const ROOT_FILES = ['favicon.ico', 'CNAME', 'robots.txt', ''];
    
    // Get the current path
    const path = window.location.pathname;
    const pathSegments = path.split('/').filter(segment => segment);
    
    // Check if this is a static asset or root file
    const isStaticAsset = pathSegments.length > 0 && STATIC_FOLDERS.includes(pathSegments[0]);
    const isRootFile = ROOT_FILES.includes(pathSegments[0] || '') || path === '/';
    
    // If it's not a static asset or root file, redirect to hub.arated.com
    if (!isStaticAsset && !isRootFile) {
        const redirectUrl = `https://hub.arated.com${path}${window.location.search}`;
        console.log(`Redirecting to: ${redirectUrl}`);
        window.location.href = redirectUrl;
    }
})(); 