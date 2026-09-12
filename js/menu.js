function isMobileNav() {
    return window.innerWidth <= 768;
}

function setMobileMenuOpen(open) {
    const navMenu = document.getElementById('nav-menu');
    const overlay = document.querySelector('.menu-overlay');
    const hamburger = document.querySelector('.hamburger-menu');
    if (!navMenu || !hamburger) return;

    navMenu.classList.toggle('active', open);
    if (overlay) overlay.classList.toggle('active', open);
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', open);

    if (!open) {
        document.querySelectorAll('.nav-item-has-dropdown.active').forEach((item) => {
            item.classList.remove('active');
        });
    }
}

function toggleMenu() {
    if (!isMobileNav()) return;
    const navMenu = document.getElementById('nav-menu');
    if (!navMenu) return;
    setMobileMenuOpen(!navMenu.classList.contains('active'));
}

document.addEventListener('DOMContentLoaded', () => {
    const navMenu = document.getElementById('nav-menu');
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const overlay = document.querySelector('.menu-overlay');
    let resizeTimeout;

    if (hamburgerMenu && !hamburgerMenu.hasAttribute('aria-expanded')) {
        hamburgerMenu.setAttribute('aria-expanded', 'false');
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);

        resizeTimeout = setTimeout(() => {
            if (window.innerWidth > 768) {
                setMobileMenuOpen(false);
            } else {
                closeAllDesktopMegas();
            }
        }, 100);
    });

    if (overlay) {
        overlay.addEventListener('click', () => {
            if (isMobileNav()) setMobileMenuOpen(false);
        });
    }
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
        if (e.key !== 'Escape') return;
        if (document.body.classList.contains('nav-mega-open')) {
            closeAllDesktopMegas();
        }
        if (isMobileNav() && navMenu && navMenu.classList.contains('active')) {
            setMobileMenuOpen(false);
        }
    });

    // Close menu when clicking a menu item
    document.querySelectorAll('.nav-list a').forEach(link => {
        link.addEventListener('click', (e) => {
            // On mobile, close the menu after a short delay to allow navigation to start
            if (isMobileNav()) {
                const href = link.getAttribute('href');
                
                // For pages/*.md or pages/*.html links, handle SPA navigation
                if (href && href.includes('pages/')) {
                    e.preventDefault();
                    setMobileMenuOpen(false);
                    // Update URL hash
                    const pageHash = href.replace('pages/', '').replace('.html', '');
                    window.location.hash = pageHash;
                    return;
                }
                
                // For all other links (external and root-relative), close menu after brief delay
                setTimeout(() => {
                    setMobileMenuOpen(false);
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

    // Close menu when clicking outside the drawer / toggle (fallback if overlay missed)
    document.addEventListener('click', (e) => {
        if (!navMenu || !navMenu.classList.contains('active') || !isMobileNav()) return;
        const isLink = e.target.tagName === 'A' || e.target.closest('a');
        if (!isLink &&
            !navMenu.contains(e.target) &&
            !(hamburgerMenu && hamburgerMenu.contains(e.target))) {
            setMobileMenuOpen(false);
        }
    });

    // Handle direct navigation via URL hash
    window.addEventListener('load', () => {
        const hash = window.location.hash.slice(1);
        if (hash) {
            const page = `pages/${hash}.html`;
            const pageContent = document.getElementById('page-content');
            if (pageContent) pageContent.src = page;
        }
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