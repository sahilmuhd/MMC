import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import User


def sign_token(user):
    """Equivalent of signToken() in the old auth.js."""
    payload = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "exp": _expiry(),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _expiry():
    from django.utils import timezone

    return timezone.now() + settings.JWT_EXPIRY


class JWTAuthentication(BaseAuthentication):
    """Equivalent of requireAuth in the old auth.js: reads
    `Authorization: Bearer <token>`, verifies it, and resolves it to a user.

    Unlike the Express version (which just trusted the token's embedded
    role), we always resolve to the live User row so `request.user.role`
    reflects the database — the same guarantee the old requireAdmin gave by
    re-checking the DB after requireAuth ran.
    """

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")

        if scheme != "Bearer" or not token:
            return None  # No credentials supplied — let permission classes decide.

        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        except jwt.PyJWTError:
            raise AuthenticationFailed("Invalid or expired session.")

        try:
            user = User.objects.get(id=payload.get("id"))
        except User.DoesNotExist:
            raise AuthenticationFailed("Invalid or expired session.")

        if not user.is_active:
            raise AuthenticationFailed("This account has been deactivated.")

        return (user, token)

    def authenticate_header(self, request):
        return "Bearer"
