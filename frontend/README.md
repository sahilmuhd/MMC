# MMC Frontend (static site)

Plain HTML/CSS/JS — no build step, no framework. Deploys anywhere that
serves static files.

## Run locally

Any static file server works. A couple of easy options:

```bash
# Option A: Python (built in on most systems)
python3 -m http.server 8080

# Option B: Node's `serve` package
npx serve -l 8080
```

Then open `http://localhost:8080`.

**Don't just double-click `index.html`** — opening it as a `file://` URL
will break the `fetch()` calls to the backend due to browser CORS rules on
local files. Always serve it over `http://`.

## Connecting to the backend

Edit `config.js`:

```js
window.MMC_API_BASE = "http://localhost:4000";  // local dev
// window.MMC_API_BASE = "https://api.mmc-group.com";  // production
```

This is the only place that needs to change when you point the frontend at
a deployed backend instead of your local one.

## Deploying

This is a static site — drag-and-drop or connect the repo to:
- **Netlify** / **Vercel** / **Cloudflare Pages**: no build command needed,
  publish directory is the project root (or wherever these files live).
- **GitHub Pages**: push these files to a `gh-pages` branch or `/docs` folder.

After deploying, update `config.js` to point at your live backend URL, and
update the backend's `ALLOWED_ORIGIN` to include your new frontend domain
(otherwise the API will reject requests with a CORS error).
