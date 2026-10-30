# dwarftinker.com — landing site

Plain HTML/CSS/JS landing page for **dwarftinker.com**. No framework, no build step.

## Hosting
- Cloudflare (free plan), deployed from the connected GitHub repo.
- `wrangler.jsonc` serves the repo root (`assets.directory: "./"`) as static assets on the `dwarftinker.com` custom domain.
- Clean URLs work: `/about` serves `about.html`.
- `not_found_handling: "404-page"` expects a `404.html` (not yet created).
- Because the whole root is uploaded, `.assetsignore` keeps non-site files (`.git`, `.idea`, `wrangler.jsonc`, `*.md`) out of the deploy. Add any new non-site files there.

## Site structure
- `index.html`: home page (rotating globe in the bottom-right corner).
- `about.html`: about page (animated planetary gears from `gears.js`).
- `style.css`: shared styles; grey palette as CSS variables on `:root`.
- Fonts are retro throughout: VT323 (terminal) for text and nav, Press Start 2P (8-bit) for headings, loaded from Google Fonts in each page's `<head>`.
- Pages fill the viewport (body is a flex column: nav, content, footer; no page scroll).

## Navigation
- A top horizontal nav links to this site's own info pages **and** to other projects hosted on subdomains, e.g. `https://potha.dwarftinker.com` (a Flutter app, source in `../potha`).
- The nav is plain HTML copied into each page. Don't inject it with JS (late appearance on load, nothing without JS). When adding or renaming a page, update the nav in every page and set `class="active"` on the current page's link.
- Layout: Home (pixel-art house icon) and Potha (`https://potha.dwarftinker.com`) on the left; About on the right. `li.nav-push` marks where the right-aligned group starts.
- Internal links use file names (`index.html`, `about.html`) so they also work in the local IDE preview; Cloudflare redirects them to clean URLs. External project links use full `https://` URLs.
