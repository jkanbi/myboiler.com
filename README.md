# MyBoiler.com
MyBoiler.com Root - GitHub Pages Implementation

## Routing Logic

This project implements routing logic for GitHub Pages where:
- Requests for `css/`, `js/`, `img/`, and `pages/` folders are served from myboiler.com
- All other requests are redirected to hub.arated.com using client-side JavaScript

## How It Works

### Static Assets
Files in the following folders are served directly from myboiler.com:
- `css/` - Stylesheets
- `js/` - JavaScript files  
- `img/` - Images
- `pages/` - Page content

### Redirects
All other requests are redirected to hub.arated.com using:
1. **`redirect.js`** - Client-side redirect script included in `index.html`
2. **`404.html`** - GitHub Pages 404 page that handles redirects for non-existent routes

## File Structure

```
├── css/           # Stylesheets (served from myboiler.com)
├── js/            # JavaScript files (served from myboiler.com)
├── img/           # Images (served from myboiler.com)
├── pages/         # Page content (served from myboiler.com)
├── index.html     # Main page with redirect script
├── 404.html       # 404 page with redirect logic
├── redirect.js    # Client-side redirect script
├── favicon.ico    # Favicon (served from myboiler.com)
└── CNAME          # Domain configuration (served from myboiler.com)
```

## Deployment

Simply push your changes to the GitHub repository and GitHub Pages will automatically deploy them.

## Example Requests

- `myboiler.com/css/styles.css` → Served from myboiler.com
- `myboiler.com/js/menu.js` → Served from myboiler.com  
- `myboiler.com/img/myboiler-logo-light.svg` → Served from myboiler.com
- `myboiler.com/pages/about-us.md` → Served from myboiler.com
- `myboiler.com/boiler-service/` → Redirected to `hub.arated.com/boiler-service/`
- `myboiler.com/heat-pumps/` → Redirected to `hub.arated.com/heat-pumps/`

## Configuration

The routing logic can be customized by modifying the `STATIC_FOLDERS` and `ROOT_FILES` arrays in both `redirect.js` and `404.html`.
