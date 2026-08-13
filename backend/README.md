# MMC Backend — Django / DRF

This is a straight port of the original Express backend to Django + Django
REST Framework. **The API contract is unchanged** — every route, request
shape, response shape, status code, and error format matches the original
exactly, so `frontend/` (the HTML/CSS/JS in the other half of this project)
works against this backend without any changes beyond `frontend/config.js`
pointing at wherever you deploy it.

## What changed vs. the Express version

| Concern | Old (Express) | New (Django) |
|---|---|---|
| Storage | JSON files (`db.js`) | SQLite via Django ORM (swap to Postgres by changing `DATABASES` — no view code changes needed) |
| Auth | Hand-rolled JWT (`jsonwebtoken` + `bcryptjs`) | Same idea, via `PyJWT` + Django's built-in password hashing (PBKDF2) |
| Routing | Express routers | DRF `APIView`s, one per route |
| Rate limiting | `express-rate-limit` per router | Custom DRF throttle classes (`api/throttles.py`), same limits |
| CORS | `cors` package | `django-cors-headers` |
| Email | `nodemailer` | Python's `smtplib` (same optional-SMTP behavior) |
| Admin creation script | `scripts/create-admin.js` | `python manage.py create_admin` |

Nothing about the **routes themselves** changed — see the API reference in
the top-level README, it's still accurate. All of these still work exactly
as before:

- `POST /api/contact`
- `POST /api/newsletter`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/admin/summary`
- `GET /api/admin/contacts`
- `GET /api/admin/newsletter`
- `GET /api/admin/users`
- `GET /api/health`

Same validation rules, same rate limits (5/15min contact, 8/15min
newsletter, 10/15min auth, 5/15min password reset, 60/min global floor),
same honeypot (`_hp`) handling, same generic "invalid email or password" /
"if an account exists..." responses to avoid leaking account existence.

## Quick start

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt

cp .env.example .env
# edit .env — at minimum set JWT_SECRET and DJANGO_SECRET_KEY for anything
# beyond local testing; the defaults work fine for local dev.

python manage.py migrate
python manage.py runserver 0.0.0.0:4000
# → http://localhost:4000
```

Run alongside the frontend exactly like before:

```bash
cd frontend
npx serve -l 8080
```

`frontend/config.js` already points at `http://localhost:4000` by default.

## Creating your first admin account

```bash
cd backend
python manage.py create_admin "Admin Name" admin@example.com SecurePass123
```

Same behavior as the old script:
- If that email isn't registered yet, this creates a brand-new admin account.
- If you already registered normally with that email, this just promotes
  the existing account to admin — no need to re-enter the password.

Then log in at `login.html` with that email and visit `admin.html`.

## Project layout

```
backend/
├── manage.py
├── requirements.txt
├── .env.example
├── mmc_api/            # Django project (settings, root urls)
└── api/                # the actual app
    ├── models.py        # User, ContactSubmission, NewsletterSubscriber
    ├── managers.py       # email-based user manager
    ├── views.py           # one APIView per route — read this first
    ├── urls.py
    ├── authentication.py # JWT auth (sign/verify), mirrors old auth.js
    ├── permissions.py    # IsAdmin, mirrors requireAdmin
    ├── throttles.py       # rate limiting, mirrors express-rate-limit usage
    ├── validators.py      # field validation, mirrors the `validator` npm lib usage
    ├── mailer.py           # optional SMTP sending, mirrors mailer.js
    ├── tokens.py            # password-reset token generation/hashing
    ├── exceptions.py        # reshapes DRF errors into {ok, error} format
    └── management/commands/create_admin.py
```

## Deploying

Same two-piece deployment story as before:

1. Deploy `backend/` (Render/Railway/Fly/a VPS). For Render specifically:
   - Build command: `pip install -r requirements.txt && python manage.py migrate`
   - Start command: `gunicorn mmc_api.wsgi:application --bind 0.0.0.0:$PORT`
     (add `gunicorn` to `requirements.txt` first — it's not included by
     default since `runserver` is fine for local dev)
   - Set `JWT_SECRET`, `DJANGO_SECRET_KEY`, `ALLOWED_ORIGIN`, `ALLOWED_HOSTS`,
     `DEBUG=false`, and SMTP vars as needed.
2. Set `ALLOWED_ORIGIN` to your frontend's domain.
3. Edit `frontend/config.js` to point `window.MMC_API_BASE` at the deployed
   backend URL.
4. Deploy `frontend/` (Netlify/Vercel/Pages), unchanged.

## Membership / Goals / Points / Income system

This backend has grown beyond the original contact/newsletter site into a
full member-hierarchy platform. All of the original endpoints are still
there and unchanged; everything below is additive.

### Roles

- **member** — default role for anyone who registers. Sees their own
  profile, hierarchy, points, income, and can submit goal achievements.
- **admin** — has no access to anything under `/api/admin/*` by default.
  A super admin must explicitly grant permissions (see below) before an
  admin can do anything beyond what a member can do.
- **super_admin** — created via `python manage.py create_admin`. Bypasses
  every granular permission check and can grant/revoke permissions on
  other admins.

### Granular permissions

Admins don't get a blanket "admin" pass — each capability is a separate
Django permission (`api.view_members`, `api.edit_points`, etc., full list
in `User.Meta.permissions` in `models.py`) that a super admin assigns per
admin via:

```
GET  /api/admin/permissions/?member=<id>      list all codenames + whether that admin holds each
POST /api/admin/permissions/assign/           {"member": <id>, "codename": "...", "action": "grant"|"revoke"}
```

### Member hierarchy

```
GET /api/members/<id>/hierarchy/?depth=2
```
Self, or an admin with `view_hierarchy`. Returns the member plus their
downline `depth` levels deep (default 2, max 5, capped to keep payloads
small). Each node includes `has_children` — the frontend can expand a
leaf by calling this same endpoint again with that node's `id` to lazily
fetch its own subtree, instead of pulling the whole org chart at once.

### Goals -> achievements -> points/income

1. Admin (`create_goals`) creates a `Goal` (target, points, income_amount).
2. Member calls `POST /api/goals/<id>/achievements/` to submit their
   progress — starts as `submitted`.
3. Admin (`approve_achievements`) calls
   `POST /api/admin/achievements/<id>/approve/` (or `/reject/`).
4. Approval atomically: marks the achievement approved, appends a
   `PointsTransaction` row (never overwrites the balance directly —
   `User.points_balance` is a cached running total kept in sync inside
   the same DB transaction), and creates a `pending` `IncomeRecord`.
5. Admin (`edit_income`) moves the income record through
   `pending -> approved -> paid` (or `rejected`) via
   `PATCH /api/admin/income/<id>/`. Members can never touch this endpoint.

### Photos

```
POST   /api/members/<id>/photo/   multipart, field name "photo" (jpeg/png/webp, <5MB)
DELETE /api/members/<id>/photo/
```
A member can always manage their own photo; an admin needs
`upload_photos`/`delete_photos` to manage someone else's.

### Admin dashboard

```
GET /api/admin/dashboard/summary/     (view_reports) member/goal/points/income counts + recent activity
GET /api/admin/audit-logs/            (view_audit_logs) every mutating action, who did it, before/after, IP
```

### Soft deletion

`POST /api/admin/members/<id>/deactivate/` (`remove_members`) sets
`status="inactive"` and `is_active=False` — this blocks login immediately
(checked both at `/api/auth/login` and on every subsequent request via
`JWTAuthentication`, so an existing 7-day token stops working right away
too) but keeps every goal/points/income/audit record intact.
`.../reactivate/` reverses it.

### Tests

`api/tests.py` covers hierarchy access control, the full
achievement→approve→points/income flow (including double-approval and
income-status permission checks), granular permission grant/revoke,
role changes, deactivation/reactivation, and audit logging. Run with:

```bash
python manage.py test api
```



- **Storage**: SQLite ships with Python/Django, needs no native compilation
  or extra services — the same reasoning `db.js`'s comments gave for
  choosing plain JSON files. For anything beyond low traffic, point
  `DATABASES` at Postgres; the ORM usage in `views.py` doesn't change.
- **Passwords**: hashed with Django's default PBKDF2 hasher rather than
  bcrypt — both are fine choices; this just uses what Django ships with
  out of the box. Existing bcrypt hashes from the old backend are **not**
  compatible, so this is a fresh user table, not a data migration.
- **JWTs**: same payload shape (`id`, `name`, `email`, `role`), same 7-day
  expiry, same secret-based signing — a token minted by the old backend
  won't verify here (different signing implementation/secret), but the
  format and semantics the frontend depends on are identical.
