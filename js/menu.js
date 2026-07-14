function toggleMenu() {
    const navMenu = document.getElementById('nav-menu');
    const overlay = document.querySelector('.menu-overlay');
    const hamburger = document.querySelector('.hamburger-menu');
    const willClose = navMenu.classList.contains('active');
    navMenu.classList.toggle('active');
    overlay.classList.toggle('active');
    hamburger.classList.toggle('open');
    if (willClose) {
        document.querySelectorAll('.nav-item-has-dropdown.active').forEach((item) => {
            item.classList.remove('active');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const navMenu = document.getElementById('nav-menu');
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const navMegaBackdrop = document.querySelector('.nav-mega-backdrop');
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
                document.querySelectorAll('.nav-item-has-dropdown.is-open').forEach((el) => {
                    el.classList.remove('is-open');
                });
                document.body.classList.remove('nav-mega-open');
                if (navMegaBackdrop) {
                    navMegaBackdrop.setAttribute('aria-hidden', 'true');
                }
            }
        }, 100);
    });

    // Mobile: toggle mega menu with arrow
    document.querySelectorAll('.nav-dropdown-label').forEach(label => {
        label.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
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

    // Desktop: centered mega menus + full-page blur backdrop (modal-style)
    let megaCloseTimer = null;
    const MEGA_CLOSE_MS = 420;

    function syncNavMegaBackdrop() {
        const anyOpen = document.querySelector('.nav-item-has-dropdown.is-open');
        document.body.classList.toggle('nav-mega-open', !!anyOpen);
        if (navMegaBackdrop) {
            navMegaBackdrop.setAttribute('aria-hidden', anyOpen ? 'false' : 'true');
        }
    }

    function scheduleMegaClose(item) {
        clearTimeout(megaCloseTimer);
        megaCloseTimer = setTimeout(() => {
            item.classList.remove('is-open');
            syncNavMegaBackdrop();
        }, MEGA_CLOSE_MS);
    }

    function clearMegaCloseTimer() {
        clearTimeout(megaCloseTimer);
        megaCloseTimer = null;
    }

    function closeAllDesktopMegas() {
        clearMegaCloseTimer();
        document.querySelectorAll('.nav-item-has-dropdown.is-open').forEach((el) => {
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
            clearMegaCloseTimer();
            document.querySelectorAll('.nav-item-has-dropdown.is-open').forEach((other) => {
                if (other !== item) other.classList.remove('is-open');
            });
            item.classList.add('is-open');
            syncNavMegaBackdrop();
        });

        item.addEventListener('mouseleave', () => {
            if (!isDesktopNav()) return;
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
            clearMegaCloseTimer();
            document.querySelectorAll('.nav-item-has-dropdown.is-open').forEach((other) => {
                if (other !== item) other.classList.remove('is-open');
            });
            item.classList.add('is-open');
            syncNavMegaBackdrop();
        });

        item.addEventListener('focusout', (e) => {
            if (!isDesktopNav()) return;
            if (item.contains(e.relatedTarget)) return;
            scheduleMegaClose(item);
        });
    });

    if (navMegaBackdrop) {
        navMegaBackdrop.addEventListener('click', () => {
            if (!isDesktopNav()) return;
            closeAllDesktopMegas();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('nav-mega-open')) {
            closeAllDesktopMegas();
        }
    });

    // Close menu when clicking a menu item
    document.querySelectorAll('.nav-list a').forEach(link => {
        link.addEventListener('click', (e) => {
            if (link.closest('.mega-menu') && isDesktopNav()) {
                closeAllDesktopMegas();
            }
            const href = link.getAttribute('href');
            
            // External links: allow normal navigation (same tab)
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                return;
            }
            
            // For internal links, handle SPA navigation
            e.preventDefault();
            navMenu.classList.remove('active');
            // Update URL hash
            const pageHash = href.replace('pages/', '').replace('.html', '');
            window.location.hash = pageHash;
        });
    });

    // Close menu when clicking anywhere outside the menu or toggle button
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('active')) {
            if (!navMenu.contains(e.target) && !hamburgerMenu.contains(e.target)) {
                navMenu.classList.remove('active');
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

    document.querySelector('.menu-overlay').addEventListener('click', () => {
        document.getElementById('nav-menu').classList.remove('active');
        document.querySelector('.menu-overlay').classList.remove('active');
        document.querySelector('.hamburger-menu').classList.remove('open');
        document.querySelectorAll('.nav-item-has-dropdown.active').forEach((item) => {
            item.classList.remove('active');
        });
    });
});

document.addEventListener('click', function(e) {
    if (e.target.tagName === 'A') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}); 