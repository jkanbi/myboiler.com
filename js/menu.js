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

    // Mega menu hover delay for desktop
    let megaMenuTimeout;
    const navDropdown = document.querySelector('.nav-item-has-dropdown');
    const megaMenu = navDropdown ? navDropdown.querySelector('.mega-menu') : null;
    if (navDropdown && megaMenu) {
        navDropdown.addEventListener('mouseenter', () => {
            if (window.innerWidth >= 769) {
                clearTimeout(megaMenuTimeout);
                megaMenu.style.display = 'flex';
            }
        });
        navDropdown.addEventListener('mouseleave', () => {
            if (window.innerWidth >= 769) {
                megaMenuTimeout = setTimeout(() => {
                    megaMenu.style.display = 'none';
                }, 220);
            }
        });
        megaMenu.addEventListener('mouseenter', () => {
            if (window.innerWidth >= 769) {
                clearTimeout(megaMenuTimeout);
                megaMenu.style.display = 'flex';
            }
        });
        megaMenu.addEventListener('mouseleave', () => {
            if (window.innerWidth >= 769) {
                megaMenuTimeout = setTimeout(() => {
                    megaMenu.style.display = 'none';
                }, 220);
            }
        });
    }

    // Close menu when clicking a menu item
    document.querySelectorAll('.nav-list a').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            // Update URL hash
            const href = link.getAttribute('href').replace('pages/', '').replace('.html', '');
            window.location.hash = href;
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