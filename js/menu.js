function isMobileNav() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function navMenuHost() {
    const hamburger = document.querySelector('.hamburger-menu');
    return (hamburger && hamburger.parentElement) || document.querySelector('.right-header-items');
}

function placeNavForViewport() {
    const navMenu = document.getElementById('nav-menu');
    const host = navMenuHost();
    if (!navMenu || !host) return;

    if (isMobileNav()) {
        if (navMenu.parentElement !== document.body) {
            document.body.appendChild(navMenu);
        }
    } else if (navMenu.parentElement !== host) {
        host.appendChild(navMenu);
    }
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
        document.querySelectorAll('.nav-item-has-dropdown').forEach((item) => {
            item.classList.remove('active', 'is-open');
            const label = item.querySelector('.nav-dropdown-label');
            if (label) label.setAttribute('aria-expanded', 'false');
        });
    }
}

// Cloudflare Rocket Loader rewrites inline onclick handlers and also binds its
// own click listener. menu.js adds another listener after removing onclick, so
// one tap would call toggleMenu twice (open then immediately close). Ignore a
// second call in the same turn, and stop other listeners on the control.
let menuToggleLock = false;

function toggleMenu() {
    if (menuToggleLock) return;
    if (!isMobileNav()) return;
    const navMenu = document.getElementById('nav-menu');
    if (!navMenu) return;
    menuToggleLock = true;
    setMobileMenuOpen(!navMenu.classList.contains('active'));
    queueMicrotask(() => {
        menuToggleLock = false;
    });
}

window.toggleMenu = toggleMenu;

function clearRocketLoaderOnClick(hamburger) {
    hamburger.onclick = null;
    hamburger.removeAttribute('onclick');
    Array.from(hamburger.attributes).forEach((attr) => {
        if (attr.name.indexOf('data-cf-modified') === 0) {
            hamburger.removeAttribute(attr.name);
        }
    });
}

function bindHamburgerToggle(hamburger) {
    if (!hamburger) return;
    clearRocketLoaderOnClick(hamburger);
    if (hamburger.dataset.navBound === '1') return;
    hamburger.dataset.navBound = '1';
    if (!hamburger.getAttribute('type')) hamburger.setAttribute('type', 'button');
    hamburger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleMenu();
    }, true);
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.installSiteNav === 'function') {
        window.installSiteNav();
    }
    if (typeof window.installSiteFooter === 'function') {
        window.installSiteFooter();
    }

    const navMenu = document.getElementById('nav-menu');
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const overlay = document.querySelector('.menu-overlay');
    let resizeTimeout;

    placeNavForViewport();

    if (hamburgerMenu && !hamburgerMenu.hasAttribute('aria-expanded')) {
        hamburgerMenu.setAttribute('aria-expanded', 'false');
    }

    bindHamburgerToggle(hamburgerMenu);
    window.addEventListener('load', () => {
        bindHamburgerToggle(document.querySelector('.hamburger-menu'));
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);

        resizeTimeout = setTimeout(() => {
            placeNavForViewport();
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
    const navMegaBackdrop = document.querySelector('.nav-mega-backdrop');

    function isDesktopNav() {
        return window.matchMedia('(min-width: 769px)').matches;
    }

    function insetBackdropBelowHeader() {
        const header = document.querySelector('.header');
        const top = header ? Math.round(header.getBoundingClientRect().bottom) : 0;
        document.documentElement.style.setProperty('--nav-mega-top', `${top}px`);
        if (navMegaBackdrop) {
            navMegaBackdrop.style.top = `${top}px`;
        }
    }

    function syncNavMegaBackdrop() {
        const desktopOpen = isDesktopNav() && !!document.querySelector('.nav-item-has-dropdown.is-open');
        document.body.classList.toggle('nav-mega-open', desktopOpen);
        if (navMegaBackdrop) {
            navMegaBackdrop.setAttribute('aria-hidden', desktopOpen ? 'false' : 'true');
            if (desktopOpen) {
                insetBackdropBelowHeader();
            } else {
                navMegaBackdrop.style.top = '';
            }
        }
    }

    function setDropdownOpen(item, open) {
        item.classList.toggle('is-open', open);
        item.classList.toggle('active', open);
        const label = item.querySelector('.nav-dropdown-label');
        if (label) {
            label.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        if (open && isDesktopNav()) {
            insetBackdropBelowHeader();
        }
        syncNavMegaBackdrop();
    }

    function closeAllDesktopMegas() {
        clearMegaCloseTimer();
        document.querySelectorAll('.nav-item-has-dropdown').forEach((el) => {
            el.classList.remove('is-open', 'active');
            const label = el.querySelector('.nav-dropdown-label');
            if (label) label.setAttribute('aria-expanded', 'false');
        });
        syncNavMegaBackdrop();
    }

    function mobileDropdownHref(el) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (text.indexOf('advice') === 0) return '/advice/';
        if (text.indexOf('toolbox') === 0) return '/toolbox/';
        if (text.indexOf('calculator') === 0) return '/calculators/';
        return '/';
    }

    document.querySelectorAll('.nav-dropdown-label').forEach((label) => {
        const parent = label.closest('.nav-item-has-dropdown');
        if (!parent) return;

        const href = mobileDropdownHref(label);
        let trigger = label;
        if (label.tagName !== 'A') {
            const link = document.createElement('a');
            link.className = label.className;
            link.href = href;
            link.innerHTML = label.innerHTML;
            label.replaceWith(link);
            trigger = link;
        } else if (!label.getAttribute('href')) {
            label.href = href;
        }

        trigger.setAttribute('aria-haspopup', 'true');
        trigger.setAttribute('aria-expanded', 'false');

        function toggleFromLabel(e) {
            if (isMobileNav()) {
                e.preventDefault();
                window.location.assign(trigger.href);
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const willOpen = !parent.classList.contains('is-open');
            document.querySelectorAll('.nav-item-has-dropdown').forEach((other) => {
                if (other !== parent) setDropdownOpen(other, false);
            });
            setDropdownOpen(parent, willOpen);
        }

        trigger.addEventListener('click', toggleFromLabel);
        trigger.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            toggleFromLabel(e);
        });
    });

    let megaCloseTimer = null;
    let pointerX = 0;
    let pointerY = 0;
    const MEGA_CLOSE_MS = 700;

    function clearMegaCloseTimer() {
        clearTimeout(megaCloseTimer);
        megaCloseTimer = null;
    }

    function pointerInMegaCorridor(x, y) {
        const open = document.querySelector('.nav-item-has-dropdown.is-open');
        if (!open) return false;
        const mega = open.querySelector('.mega-menu');
        if (!mega) return false;
        const trigger = open.getBoundingClientRect();
        const panel = mega.getBoundingClientRect();
        const left = Math.min(trigger.left, panel.left) - 12;
        const right = Math.max(trigger.right, panel.right) + 12;
        const top = Math.min(trigger.top, panel.top);
        const bottom = panel.bottom;
        return x >= left && x <= right && y >= top && y <= bottom;
    }

    function shouldKeepMegaOpen() {
        if (!isDesktopNav()) return false;
        const open = document.querySelector('.nav-item-has-dropdown.is-open');
        if (!open) return false;
        if (open.matches(':hover')) return true;
        const mega = open.querySelector('.mega-menu');
        if (mega && mega.matches(':hover')) return true;
        const header = document.querySelector('.header');
        if (header && header.matches(':hover')) return true;
        return pointerInMegaCorridor(pointerX, pointerY);
    }

    function alignMovedMega(item) {
        const mega = item && item.querySelector('.mega-menu--moved');
        if (!mega) return;
        if (!item.classList.contains('is-open') && !item.classList.contains('active')) {
            mega.style.left = '';
            mega.style.transform = '';
            return;
        }
        const trigger = item.getBoundingClientRect();
        const width = Math.min(360, window.innerWidth - 32);
        let left = trigger.right - width;
        left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
        mega.style.left = `${Math.round(left)}px`;
        mega.style.transform = 'none';
    }

    function openDesktopMega(item) {
        if (!isDesktopNav()) return;
        clearMegaCloseTimer();
        document.querySelectorAll('.nav-item-has-dropdown').forEach((other) => {
            setDropdownOpen(other, other === item);
            if (other === item) alignMovedMega(other);
        });
    }

    function scheduleMegaClose() {
        if (!isDesktopNav()) return;
        clearMegaCloseTimer();
        megaCloseTimer = setTimeout(() => {
            megaCloseTimer = null;
            if (shouldKeepMegaOpen()) return;
            closeAllDesktopMegas();
        }, MEGA_CLOSE_MS);
    }

    document.addEventListener('mousemove', (e) => {
        pointerX = e.clientX;
        pointerY = e.clientY;
        if (!isDesktopNav() || !document.querySelector('.nav-item-has-dropdown.is-open')) return;
        if (shouldKeepMegaOpen()) {
            clearMegaCloseTimer();
        } else if (!megaCloseTimer) {
            scheduleMegaClose();
        }
    });

    const headerEl = document.querySelector('.header');
    if (headerEl) {
        headerEl.addEventListener('mouseenter', () => {
            if (document.querySelector('.nav-item-has-dropdown.is-open')) {
                clearMegaCloseTimer();
            }
        });
        headerEl.addEventListener('mouseleave', scheduleMegaClose);
    }

    document.querySelectorAll('.nav-item-has-dropdown').forEach((item) => {
        const mega = item.querySelector('.mega-menu');
        if (!mega) return;

        item.addEventListener('mouseenter', () => openDesktopMega(item));
        item.addEventListener('mouseleave', scheduleMegaClose);
        mega.addEventListener('mouseenter', () => openDesktopMega(item));
        mega.addEventListener('mouseleave', scheduleMegaClose);
    });

    if (navMegaBackdrop) {
        navMegaBackdrop.addEventListener('click', () => {
            if (!isDesktopNav()) return;
            closeAllDesktopMegas();
        });
    }

    document.addEventListener('click', (e) => {
        if (!isDesktopNav()) return;
        if (e.target.closest('.nav-item-has-dropdown')) return;
        closeAllDesktopMegas();
    });

    window.addEventListener('resize', () => {
        if (document.body.classList.contains('nav-mega-open')) {
            insetBackdropBelowHeader();
            const open = document.querySelector('.nav-item-has-dropdown.is-open');
            if (open) alignMovedMega(open);
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