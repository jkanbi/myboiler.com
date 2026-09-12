function toggleMenu() {
    if (window.innerWidth >= 769) return;
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
            } else {
                closeAllDesktopMegas();
            }
        }, 100);
    });

    // Mobile: toggle mega menu with arrow
    document.querySelectorAll('.nav-dropdown-label').forEach(label => {
        label.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
                // Prevent default to stop any navigation
                e.preventDefault();
                e.stopPropagation();
                
                const parent = this.closest('.nav-item-has-dropdown');
                const wasActive = parent.classList.contains('active');
                
                // Close all other dropdowns
                document.querySelectorAll('.nav-item-has-dropdown.active').forEach(item => {
                    if (item !== parent) {
                        item.classList.remove('active');
                    }
                });
                
                // Toggle current dropdown
                parent.classList.toggle('active');
            }
        });
    });

    // Desktop: hover/focus mega menus. Backdrop dims the page only — it must
    // stay below the header stacking context so it cannot steal hover.
    const navMegaBackdrop = document.querySelector('.nav-mega-backdrop');
    let megaCloseTimer = null;
    const MEGA_CLOSE_MS = 250;

    function insetBackdropBelowHeader() {
        if (!navMegaBackdrop) return;
        const header = document.querySelector('.header');
        const top = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
        navMegaBackdrop.style.top = `${top}px`;
    }

    function syncNavMegaBackdrop() {
        const anyOpen = document.querySelector('.nav-item-has-dropdown.is-open');
        document.body.classList.toggle('nav-mega-open', !!anyOpen);
        if (navMegaBackdrop) {
            navMegaBackdrop.setAttribute('aria-hidden', anyOpen ? 'false' : 'true');
            if (anyOpen) {
                insetBackdropBelowHeader();
            } else {
                navMegaBackdrop.style.top = '';
            }
        }
    }

    function pointerStillOnDropdown(item) {
        if (item.matches(':hover')) return true;
        const mega = item.querySelector('.mega-menu');
        return !!(mega && mega.matches(':hover'));
    }

    function scheduleMegaClose(item) {
        clearTimeout(megaCloseTimer);
        megaCloseTimer = setTimeout(() => {
            if (pointerStillOnDropdown(item)) return;
            item.classList.remove('is-open');
            syncNavMegaBackdrop();
        }, MEGA_CLOSE_MS);
    }

    function clearMegaCloseTimer() {
        clearTimeout(megaCloseTimer);
        megaCloseTimer = null;
    }

    function openDesktopMega(item) {
        clearMegaCloseTimer();
        document.querySelectorAll('.nav-item-has-dropdown').forEach((other) => {
            other.classList.toggle('is-open', other === item);
            other.classList.remove('is-dismissed');
        });
        syncNavMegaBackdrop();
    }

    function closeAllDesktopMegas() {
        clearMegaCloseTimer();
        document.querySelectorAll('.nav-item-has-dropdown').forEach((el) => {
            if (el.classList.contains('is-open')) {
                el.classList.add('is-dismissed');
            }
            el.classList.remove('is-open');
        });
        syncNavMegaBackdrop();
    }

    function isDesktopNav() {
        return window.innerWidth >= 769;
    }

    document.querySelectorAll('.nav-item-has-dropdown').forEach((item) => {
        const mega = item.querySelector('.mega-menu');
        if (!mega) return;

        item.addEventListener('mouseenter', () => {
            if (!isDesktopNav()) return;
            openDesktopMega(item);
        });

        item.addEventListener('mouseleave', (e) => {
            item.classList.remove('is-dismissed');
            if (!isDesktopNav()) return;
            if (e.relatedTarget && item.contains(e.relatedTarget)) return;
            scheduleMegaClose(item);
        });

        mega.addEventListener('mouseenter', () => {
            if (!isDesktopNav()) return;
            clearMegaCloseTimer();
        });

        mega.addEventListener('mouseleave', () => {
            if (!isDesktopNav()) return;
            scheduleMegaClose(item);
        });

        item.addEventListener('focusin', () => {
            if (!isDesktopNav()) return;
            openDesktopMega(item);
        });

        item.addEventListener('focusout', (e) => {
            if (!isDesktopNav()) return;
            if (item.contains(e.relatedTarget)) return;
            item.classList.remove('is-dismissed');
            scheduleMegaClose(item);
        });
    });

    if (navMegaBackdrop) {
        navMegaBackdrop.addEventListener('click', () => {
            if (!isDesktopNav()) return;
            closeAllDesktopMegas();
        });
    }

    window.addEventListener('resize', () => {
        if (document.body.classList.contains('nav-mega-open')) {
            insetBackdropBelowHeader();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('nav-mega-open')) {
            closeAllDesktopMegas();
        }
    });

    // Close menu when clicking a menu item
    document.querySelectorAll('.nav-list a').forEach(link => {
        link.addEventListener('click', (e) => {
            // On mobile, close the menu after a short delay to allow navigation to start
            if (window.innerWidth <= 768) {
                const href = link.getAttribute('href');
                
                // For pages/*.md or pages/*.html links, handle SPA navigation
                if (href && href.includes('pages/')) {
                    e.preventDefault();
                    navMenu.classList.remove('active');
                    document.querySelector('.menu-overlay').classList.remove('active');
                    document.querySelector('.hamburger-menu').classList.remove('open');
                    // Update URL hash
                    const pageHash = href.replace('pages/', '').replace('.html', '');
                    window.location.hash = pageHash;
                    return;
                }
                
                // For all other links (external and root-relative), close menu after brief delay
                setTimeout(() => {
                    navMenu.classList.remove('active');
                    document.querySelector('.menu-overlay').classList.remove('active');
                    document.querySelector('.hamburger-menu').classList.remove('open');
                }, 100);
                
                // Allow default navigation to proceed
                return;
            }
            
            // Desktop: close mega menus
            if (link.closest('.mega-menu') && isDesktopNav()) {
                closeAllDesktopMegas();
            }
        });
    });

    // Close menu when clicking anywhere outside the menu or toggle button
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('active')) {
            const overlay = document.querySelector('.menu-overlay');
            const isLink = e.target.tagName === 'A' || e.target.closest('a');
            
            // Close menu if clicking outside the menu drawer and hamburger
            // Skip link clicks (let link handler manage menu closing)
            if (!isLink && 
                !navMenu.contains(e.target) && 
                !hamburgerMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                overlay.classList.remove('active');
                hamburgerMenu.classList.remove('open');
                document.querySelectorAll('.nav-item-has-dropdown.active').forEach((item) => {
                    item.classList.remove('active');
                });
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

    // Note: Overlay click handler removed since overlay has pointer-events: none
    // The document click handler above handles closing when clicking outside the menu
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