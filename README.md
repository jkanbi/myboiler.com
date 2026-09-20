# MyBoiler.com
MyBoiler.com — GitHub Pages site

## URL model

Content pages live at the **site root** (for example `/calculators/gas-rate-calculator/`, `/fault-codes/`, `/advice/`). There is no `/hub/` content tree.

Apps keep their existing paths:
- `/chat/` — Ask AI / Boiler Help AI (ElevenLabs widget)
- `/quote/` — Get a quote
- `/decide/` — Replace / repair / heat-pump decision
- `/heat-pump-checker/` — Heat pump suitability

Static assets stay at `/css/`, `/js/`, `/img/`, `/assets/`, and `/pages/`.

## Legacy `/hub/` URLs

`/hub/` was migration scaffolding from hub.myboiler.com. Every former `/hub/...` path is a thin HTML stub (meta-refresh + canonical) that sends visitors to the same path without `/hub`.

`redirect.js` and `404.html` also strip a leading `/hub` from the request path. They do **not** prefix unknown paths with `/hub`. A missing root URL shows the 404 page.

Internal aliases that rename pages are unchanged except for the prefix, e.g. `/advice-and-info/` still redirects to `/advice/`.

## How routing works

1. **Existing files** are served directly (content at root, apps, assets).
2. **`hub/.../index.html` stubs** redirect `/hub/some/path/` → `/some/path/`.
3. **`404.html`** — if the path starts with `/hub`, strip it and redirect; otherwise show “Page not found”.
4. **`redirect.js`** — same `/hub` strip, included from the homepage as a fallback (e.g. local `live-server`).

`STATIC_FOLDERS` / `ROOT_FILES` in `redirect.js` and `404.html` document the asset and app folders that are served as-is. They are not used to add a `/hub` prefix.

## File structure

```
├── css/                 # Stylesheets
├── js/                  # JavaScript (including site-nav.js)
├── img/                 # Images
├── assets/              # Homepage media
├── pages/               # Markdown pages
├── calculators/         # Calculator pages (real content at root)
├── fault-codes/         # Fault-code pages + generated search index
├── scripts/             # Static generators (fault-code index)
├── advice/, toolbox/, … # Other migrated content
├── chat/, quote/, decide/, heat-pump-checker/  # Apps
├── hub/                 # Redirect stubs only (/hub/… → /…)
├── index.html           # Homepage
├── 404.html             # Not-found + /hub strip
├── redirect.js          # Homepage /hub strip fallback
├── favicon.ico
└── CNAME
```

## Fault-code search index

`/fault-codes/` is a client-side search hub. The index is generated from **this repo’s** HTML tables and Vaillant code pages — not from boilermanuals.com.

```
npm run build:fault-codes
```

That runs `scripts/build-fault-code-index.js` and writes `fault-codes/fault-codes-index.json`. Commit the JSON with any table edits so GitHub Pages stays in sync. Search and in-page table filters live in `js/fault-codes.js` and `css/fault-codes.css`.

Recovered WordPress pages from hub.myboiler.com live under `/fault-codes/`:
- Ambirad table, Potterton E133, faults-and-fixes, extra Vaillant codes from the later “new” table
- Worcester individual codes A1/A7/A8/b1/C6/E2/E9/EA/F0/F7/FA/Fd plus the siphon-fill (`-¦¦-` / XX) page
- Baxi Duo-tec / Platinum / Megaflo and Baxi EcoBlue Heat Only tables (were A–Z request placeholders)

Legacy slugs redirect to the clean paths: `/4155-2/` → A8, `/worcester-bosch-%c2%a6%c2%a6-code/` → siphon fill, and the old root Baxi URLs (`/baxi-ecoblue-heat-only/`, `/baxi-solo-heat-only/`, `/baxi-600-combi/`, `/baxi-baxi-200-400/`). The public hub HTML for Worcester Fd 404s; the page was rebuilt from the WordPress REST payload. Remaining A–Z grey brands (Ideal, Ferroli, Viessmann, and the leftover Baxi ranges) were request placeholders on WordPress too — there is no table to migrate.

## Deployment

Push to GitHub and GitHub Pages deploys automatically.

## Example requests

- `myboiler.com/css/styles.css` → served
- `myboiler.com/calculators/gas-rate-calculator/` → served (content at root)
- `myboiler.com/hub/calculators/gas-rate-calculator/` → redirect stub → `/calculators/gas-rate-calculator/`
- `myboiler.com/advice-and-info/` → alias redirect → `/advice/`
- `myboiler.com/chat/` → Ask AI app
- `myboiler.com/no-such-page/` → 404 page (not rewritten to `/hub/...`)
