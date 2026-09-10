function toggleMenu() {
    const navMenu = document.getElementById('nav-menu');
    const overlay = document.querySelector('.menu-overlay');
    const hamburger = document.querySelector('.hamburger-menu');
    navMenu.classList.toggle('active');
    overlay.classList.toggle('active');
    hamburger.classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', () => {
    const navMenu = document.getElementById('nav-menu');
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    let resizeTimeout;

    // Handle window resize
    window.addEventListener('resize', () => {
        // Clear any existing timeout
        clearTimeout(resizeTimeout);
        
        // Set a new timeout to handle the resize
        resizeTimeout = setTimeout(() => {
            if (window.innerWidth > 768) {
                // Close mobile menu when switching to desktop
                navMenu.classList.remove('active');
                document.querySelector('.menu-overlay').classList.remove('active');
                hamburgerMenu.classList.remove('open');
            }
        }, 100);
    });

    // Close menu when clicking a menu item
    document.querySelectorAll('.nav-list a').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            
            // External links: allow normal navigation (same tab)
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                return;
            }
            
            // Root-relative paths: allow normal navigation
            if (href && href.startsWith('/') && !href.startsWith('//')) {
                return;
            }
            
            // For pages/*.md or pages/*.html links, handle SPA navigation
            if (href && href.includes('pages/')) {
                e.preventDefault();
                navMenu.classList.remove('active');
                // Update URL hash
                const pageHash = href.replace('pages/', '').replace('.html', '');
                window.location.hash = pageHash;
            }
        });
    });

    // Close menu when clicking anywhere outside the menu or toggle button
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('active')) {
            if (!navMenu.contains(e.target) && !hamburgerMenu.contains(e.target)) {
                navMenu.classList.remove('active');
            }
        }
    });

    // Handle direct navigation via URL hash
    window.addEventListener('load', () => {
        const hash = window.location.hash.slice(1);
        if (hash) {
            const page = `pages/${hash}.html`;
            document.getElementById('page-content').src = page;
        }
    });

    document.querySelector('.menu-overlay').addEventListener('click', () => {
        document.getElementById('nav-menu').classList.remove('active');
        document.querySelector('.menu-overlay').classList.remove('active');
        document.querySelector('.hamburger-menu').classList.remove('open');
    });
});

document.addEventListener('click', function(e) {
    if (e.target.tagName === 'A') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

// Fix absolute URL navigation bug
// Prevents absolute URLs to myboiler.com from being treated as relative by hash routers
document.addEventListener('click', function(e) {
    let target = e.target;
    
    // Find the closest anchor tag
    while (target && target.tagName !== 'A') {
        target = target.parentElement;
    }
    
    if (!target || target.tagName !== 'A') return;
    
    const href = target.getAttribute('href');
    if (!href) return;
    
    // Check if it's an absolute URL to myboiler.com
    const myboilerPattern = /^https?:\/\/(www\.)?myboiler\.com/i;
    if (myboilerPattern.test(href)) {
        e.preventDefault();
        
        // Extract the path from the absolute URL
        const url = new URL(href);
        const path = url.pathname + url.search + url.hash;
        
        // Navigate to the path
        window.location.href = path;
    }
}, true); // Use capture phase to catch clicks before they reach the widget 