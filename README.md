# MMC Site — Frontend + Backend (separated)

> The backend was ported from Express to Django/DRF. The API contract
> (routes, request/response shapes, status codes, rate limits) is unchanged
> — see `backend/README.md` for exactly what changed under the hood.

This project is split into two independent pieces that talk to each other
over HTTP:

```
mmc_split/
├── frontend/     static HTML/CSS/JS — deploy to Netlify/Vercel/Pages/etc.
└── backend/      Django/DRF API (contact + newsletter) — deploy to Render/Railway/a VPS
```

They're decoupled on purpose: you can develop, deploy, scale, and redeploy
each one without touching the other. The only thing that connects them is
`frontend/config.js`, which points at the backend's URL.

## Quick start (both running locally)

**Terminal 1 — backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 0.0.0.0:4000
# → http://localhost:4000
```

**Terminal 2 — frontend:**
```bash
cd frontend
npx serve -l 8080
# → http://localhost:8080
```

Open `http://localhost:8080` in your browser. `frontend/config.js` already
points at `http://localhost:4000` by default, so forms will work immediately.

## API reference

**POST `/api/contact`**
```json
{ "name": "Jane Doe", "email": "jane@example.com", "phone": "+1 555 123 4567", "message": "..." }
```
→ `{ "ok": true }` or `{ "ok": false, "errors": { field: message } }`
Rate limited: 5 requests / 15 min / IP.

**POST `/api/newsletter`**
```json
{ "email": "jane@example.com" }
```
→ `{ "ok": true }` (or `{ "ok": true, "alreadySubscribed": true }`)
Rate limited: 8 requests / 15 min / IP.

**POST `/api/auth/register`**
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "at-least-8-chars-1-number" }
```
→ `{ "ok": true, "token": "...", "user": { "id": 1, "name": "...", "email": "..." } }`
or `{ "ok": false, "errors": { field: message } }`. Rate limited: 10 requests / 15 min / IP.

**POST `/api/auth/login`**
```json
{ "email": "jane@example.com", "password": "..." }
```
→ `{ "ok": true, "token": "...", "user": {...} }` or `{ "ok": false, "error": "Invalid email or password." }`
Rate limited: 10 requests / 15 min / IP.

**GET `/api/auth/me`** — requires `Authorization: Bearer <token>` header.
→ `{ "ok": true, "user": {...} }` or `401` if the token is missing/invalid/expired.

**GET `/api/admin/summary`** — requires an admin token.
→ `{ "ok": true, "counts": { "contacts": N, "subscribers": N, "users": N } }`

**GET `/api/admin/contacts`** — requires an admin token. → `{ "ok": true, "contacts": [...] }`

**GET `/api/admin/newsletter`** — requires an admin token. → `{ "ok": true, "subscribers": [...] }`

**GET `/api/admin/users`** — requires an admin token. → `{ "ok": true, "users": [...] }` (no password hashes)

Non-admin tokens get `403`; no token gets `401`.

**GET `/api/health`** → `{ "ok": true, "uptime": <seconds> }`

## Frontend pages

- `index.html` — Achievements page
- `home.html` — Home page
- `contact.html` — Contact page (team, testimonials, FAQ, contact form)
- `login.html` — Log in
- `register.html` — Create account
- `admin.html` — Admin dashboard (view submissions, subscribers, users) — requires an admin account

Login and register pages call the auth endpoints above via `auth.js`, store
the returned token in `localStorage`, and swap the nav's "Login / Join Club"
buttons for a "Hi, {name} / Log out" pill once signed in — this check runs
on every page load.

## Creating your first admin account

Everyone who registers through `register.html` gets a regular `"user"`
role. To create (or promote) a superuser who can see `admin.html`:

```bash
cd backend
python manage.py create_admin "Admin Name" admin@example.com SecurePass123
```

- If that email isn't registered yet, this creates a brand-new admin account.
- If you already registered normally with that email, this just promotes
  the existing account to admin — no need to re-enter the password.

Then log in at `login.html` with that email and visit `admin.html` — it
shows contact submissions, newsletter subscribers, and all registered users
in one place, with counts at the top.

## Deploying both pieces

1. Deploy `backend/` first (Render/Railway/Fly/VPS) and note its public URL,
   e.g. `https://mmc-api.onrender.com`.
2. Set the backend's `ALLOWED_ORIGIN` (and `ALLOWED_HOSTS`, `DEBUG=false`)
   env vars — see `backend/README.md` for the full deploy notes and a
   Render-specific build/start command.
3. Edit `frontend/config.js` to point `window.MMC_API_BASE` at the backend
   URL from step 1.
4. Deploy `frontend/` (Netlify/Vercel/Pages).

Each README inside `frontend/` and `backend/` has more detail specific to
that half.

## Still on the "nice to have" list

- SEO meta tags (Open Graph, Twitter Card, sitemap.xml, robots.txt)
- Real social links (currently `href="#"`)
- Filled-in Privacy Policy / Terms of Service pages
- Analytics (Plausible, GA4, Fathom)
- Minified/bundled CSS & JS for production
