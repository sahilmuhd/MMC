import re

from django.core.validators import validate_email as django_validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.html import escape as escape_html

PHONE_RE = re.compile(r"^[0-9+\-()\s]{7,20}$")


def is_email(value):
    if not value:
        return False
    try:
        django_validate_email(value)
        return True
    except DjangoValidationError:
        return False


def normalize_email(value):
    """Rough equivalent of validator.js's normalizeEmail(): lowercase +
    trim. The original also strips Gmail dots/plus-addressing, but that's
    an aggressive transform apps generally regret; matching it exactly
    would silently merge some accounts. We keep the safe, useful bit."""
    return (value or "").strip().lower()


def clean_text(value):
    """Equivalent of validator.trim() + validator.escape() — trims
    whitespace and HTML-escapes so stored data can't inject markup if ever
    rendered unescaped."""
    return escape_html((value or "").strip())


def validate_password(password):
    """Equivalent of validatePassword() in the old routes/auth.js."""
    if not password or len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        return "Password must include at least one letter and one number."
    return None


def client_ip(request):
    return request.META.get("REMOTE_ADDR")
