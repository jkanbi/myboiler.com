// Markdown rendering using marked.js
document.addEventListener('DOMContentLoaded', () => {
    const boxPairGrid = document.getElementById('box-pair-grid');
    const contentContainer = document.getElementById('content-container');
    const pageContent = document.getElementById('page-content');

    // Load markdown content
    async function loadMarkdownContent(page) {
        try {
            const response = await fetch(`pages/${page}.md`);
            if (!response.ok) throw new Error('Page not found');
            const markdown = await response.text();
            return markdown;
        } catch (error) {
            console.error('Error loading markdown:', error);
            return `
# Page Not Found

The requested page could not be found. Please check the URL or return to the [homepage](/).
            `;
        }
    }

    // Render markdown content
    function renderMarkdown(markdown) {
        // Convert markdown to HTML using marked
        const html = marked.parse(markdown);
        pageContent.innerHTML = html;
        
        // Add error page class if it's a 404
        if (markdown.includes('Page Not Found')) {
            pageContent.classList.add('error-page');
        } else {
            pageContent.classList.remove('error-page');
        }
    }

    // Show content and hide box pair grid
    function showContent() {
        boxPairGrid.style.display = 'none';
        contentContainer.style.display = 'block';
    }

    // Show box pair grid and hide content
    function showBoxPairGrid() {
        boxPairGrid.style.display = 'grid';
        contentContainer.style.display = 'none';
    }

    // Handle navigation
    function handleNavigation() {
        const links = document.querySelectorAll('a[href^="pages/"]');
        links.forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const href = link.getAttribute('href');
                const page = href.replace('pages/', '').replace('.md', '');
                
                // Update URL hash
                window.location.hash = page;
                
                // Load and render content
                const markdown = await loadMarkdownContent(page);
                renderMarkdown(markdown);
                showContent();
                
                // Close mobile menu if open
                const navMenu = document.getElementById('nav-menu');
                if (navMenu.classList.contains('active')) {
                    navMenu.classList.remove('active');
                    document.querySelector('.menu-overlay').classList.remove('active');
                    document.querySelector('.hamburger-menu').classList.remove('open');
                }
            });
        });
        
        // Handle external links to open in new tab
        const externalLinks = document.querySelectorAll('a[href^="http://"], a[href^="https://"]');
        externalLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // Set target to _blank for external links
                link.setAttribute('target', '_blank');
                // Don't prevent default - let the link open normally
            });
        });
    }

    // Handle initial page load
    async function handleInitialLoad() {
        const hash = window.location.hash.slice(1);
        if (hash) {
            const markdown = await loadMarkdownContent(hash);
            renderMarkdown(markdown);
            showContent();
        } else {
            showBoxPairGrid();
        }
    }

    // Initialize
    handleNavigation();
    handleInitialLoad();

    // Handle browser back/forward
    window.addEventListener('hashchange', handleInitialLoad);
}); 