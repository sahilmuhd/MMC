"""
Django settings for the MMC API — a straight port of the original
Express backend (see backend/README.md for the full mapping).
"""

import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _read_dotenv(path):
    """Tiny .env loader so we don't need python-dotenv as a dependency.
    Same idea as `require('dotenv').config()` at the top of the old server.js."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


_read_dotenv(BASE_DIR / ".env")

# --- Core ---

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-secret-change-in-production")

DEBUG = os.environ.get("DEBUG", "true").lower() == "true"

ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "*").split(",") if h.strip()]

# --- Applications ---

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mmc_api.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mmc_api.wsgi.application"

# --- Database ---
# SQLite by default — same reasoning db.js gave for JSON files: this is a
# low-traffic contact/newsletter/auth backend. Swap to Postgres later by
# setting DATABASE_URL and adding dj-database-url / psycopg without touching
# any views, since they only ever go through the ORM.

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_USER_MODEL = "api.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Media (member profile photos) ---
# Local disk storage for dev. In production, point this at S3/Cloudinary/etc.
# via django-storages -- nothing in membership_views.py needs to change,
# it only ever touches the ImageField API.
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# --- CORS ---
# Equivalent of the `cors()` origin-callback in server.js. Comma-separate
# multiple origins in ALLOWED_ORIGIN for staging + production frontends.
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGIN",
        "http://localhost:5173,http://localhost:8080,http://127.0.0.1:5500",
    ).split(",")
    if o.strip()
]
# Requests with no Origin header (curl, server-to-server) are allowed
# through automatically by django-cors-headers when there's no Origin at all.

# --- REST framework ---

REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "api.exceptions.exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "api.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "api.throttles.GlobalRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Floor beneath the per-route limits below — same as the
        # `rateLimit({ windowMs: 60_000, max: 60 })` applied to every
        # route in server.js.
        "global": "60/1m",
        "contact": "5/15m",
        "newsletter": "8/15m",
        "auth": "10/15m",
        "reset": "5/15m",
    },
    "DEFAULT_PAGINATION_CLASS": None,  # membership_views.py paginates manually via `paginate()`
}

# --- App-specific / auth ---

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-only-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY = timedelta(days=7)  # matches TOKEN_EXPIRY = "7d" in the old auth.js

RESET_TOKEN_TTL = timedelta(hours=1)  # matches RESET_TOKEN_TTL_MS in auth.js

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8080")

# --- SMTP (optional — mirrors mailer.js: app works fine with none of this set) ---

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
CONTACT_TO_EMAIL = os.environ.get("CONTACT_TO_EMAIL", "") or SMTP_USER

if not os.environ.get("JWT_SECRET"):
    import warnings

    warnings.warn(
        "[auth] JWT_SECRET is not set in .env — using an insecure default. "
        "This is fine for local testing but MUST be set before deploying anywhere real."
    )
