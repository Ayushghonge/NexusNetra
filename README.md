# Nexus Netra — Governance OS Website

Single-page scrolling website for **Nexus Netra**, ARC Advisory's Governance Operating System.

## Quick deploy (Vercel)

1. Push this repository to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the GitHub repo.
3. Settings:
   - **Framework Preset:** Other
   - **Build Command:** _(leave empty)_
   - **Output Directory:** _(leave empty — defaults to root)_
4. Click **Deploy**. Done.

Vercel serves `index.html` from the root and `assets/nexus-netra-film.mp4` as a static file.

## Project structure

```
nexus-netra/
├── index.html                  ← The complete website (serves directly)
├── assets/
│   └── nexus-netra-film.mp4    ← Hero background film (3 MB)
├── vercel.json                 ← Caching & security headers
├── README.md
└── source/                     ← Source code (not served; for editing)
    ├── build.py                ← Build script (assembles index.html)
    ├── src/
    │   ├── body.html           ← Page markup (with template placeholders)
    │   ├── styles.css          ← All CSS
    │   └── app.js              ← All JavaScript
    ├── inline/                 ← Images & film embedded during build
    │   ├── arc-towers.webp
    │   ├── boardroom-review.webp
    │   ├── insight-session.webp
    │   ├── film-poster.webp
    │   └── film.mp4
    ├── logo/
    │   └── final_paths.json    ← SVG path data for the Nexus Netra logo
    └── brand-assets/           ← SVG logos, favicon, OG image
        ├── favicon.svg
        ├── apple-touch-icon.png
        ├── nexus-netra-logo.svg
        ├── nexus-netra-logo-reversed.svg
        ├── nexus-netra-mark.svg
        └── og-image.jpg
```

## How it works

- **`index.html`** is a fully self-contained page: all photos are embedded as base64 data URIs, all CSS and JS are inline. The only external asset is the film MP4 file.
- **Fonts** are loaded from Google Fonts (Nunito Sans + Tiro Devanagari Hindi).
- **No npm dependencies.** No React. No build step needed for deployment.
- The film loads with multiple fallback sources and a watchdog timer for mobile compatibility.

## Rebuilding from source

If you edit the source files and want to regenerate `index.html`:

```bash
cd source
python3 build.py
```

This reads `src/body.html`, `src/styles.css`, `src/app.js`, inlines the images from `inline/`, embeds the logo SVG paths from `logo/final_paths.json`, and writes the assembled page to `out/site/index.html`. Copy that output to the project root to deploy.

## Tech stack

- HTML5, CSS3, vanilla JavaScript
- Google Fonts (Nunito Sans variable, Tiro Devanagari Hindi)
- Canvas API (animated network background)
- Intersection Observer (scroll-triggered reveals)
- No frameworks, no bundlers, no dependencies

## Copyright

© 2026 Nexus Netra Governance OS
