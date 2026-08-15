import time

from django.conf import settings
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import mailer
from .authentication import sign_token
from .models import ContactSubmission, NewsletterSubscriber, User
from .permissions import IsAdmin
from .throttles import (
    AuthRateThrottle,
    ContactRateThrottle,
    NewsletterRateThrottle,
    ResetRateThrottle,
)
from .tokens import generate_reset_token, hash_reset_token
from .validators import (
    PHONE_RE,
    clean_text,
    client_ip,
    is_email,
    normalize_email,
    validate_password,
)

_START_TIME = time.monotonic()


class HealthView(APIView):
    """GET /api/health"""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        return Response({"ok": True, "uptime": time.monotonic() - _START_TIME})


# ---------------------------------------------------------------------------
# Contact
# ---------------------------------------------------------------------------


class ContactView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ContactRateThrottle]

    def post(self, request):
        body = request.data
        # Honeypot field — bots tend to fill every input including hidden ones.
        if body.get("_hp"):
            return Response({"ok": True})

        name = clean_text(str(body.get("name") or ""))
        email = normalize_email(str(body.get("email") or ""))
        phone = str(body.get("phone") or "").strip()
        message = clean_text(str(body.get("message") or ""))

        errors = {}
        if not name or len(name) < 2:
            errors["name"] = "Please enter your full name."
        if not email or not is_email(email):
            errors["email"] = "Enter a valid email address."
        if not phone or not PHONE_RE.match(phone):
            errors["phone"] = "Enter a valid phone number."
        if not message or len(message) < 10:
            errors["message"] = "Message should be at least 10 characters."

        if errors:
            return Response({"ok": False, "errors": errors}, status=400)

        ContactSubmission.objects.create(name=name, email=email, phone=phone, message=message, ip=client_ip(request))

        try:
            mailer.send_contact_notification(name=name, email=email, phone=phone, message=message)
        except Exception:
            # Submission is already saved — email failure shouldn't fail the request.
            pass

        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Newsletter
# ---------------------------------------------------------------------------


class NewsletterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [NewsletterRateThrottle]

    def post(self, request):
        body = request.data
        if body.get("_hp"):
            return Response({"ok": True})

        email = normalize_email(str(body.get("email") or ""))
        if not email or not is_email(email):
            return Response({"ok": False, "error": "Enter a valid email address."}, status=400)

        if NewsletterSubscriber.objects.filter(email__iexact=email).exists():
            # Already subscribed — treat as success, don't leak who's on the list.
            return Response({"ok": True, "alreadySubscribed": True})

        NewsletterSubscriber.objects.create(email=email, ip=client_ip(request))

        try:
            mailer.send_newsletter_confirmation(email)
        except Exception:
            pass

        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        body = request.data
        if body.get("_hp"):
            return Response({"ok": True})

        name = clean_text(str(body.get("name") or ""))
        email = normalize_email(str(body.get("email") or ""))
        password = str(body.get("password") or "")

        errors = {}
        if not name or len(name) < 2:
            errors["name"] = "Please enter your full name."
        if not email or not is_email(email):
            errors["email"] = "Enter a valid email address."
        pw_error = validate_password(password)
        if pw_error:
            errors["password"] = pw_error

        if errors:
            return Response({"ok": False, "errors": errors}, status=400)

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"ok": False, "errors": {"email": "An account with this email already exists."}}, status=409
            )

        user = User.objects.create_user(email=email, name=name, password=password)
        token = sign_token(user)
        return Response({"ok": True, "token": token, "user": user.public_dict()}, status=201)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        body = request.data
        if body.get("_hp"):
            return Response({"ok": True})

        email = normalize_email(str(body.get("email") or ""))
        password = str(body.get("password") or "")

        # Deliberately vague error on failure — never reveal whether the
        # email exists or the password was wrong specifically.
        generic_error = {"ok": False, "error": "Invalid email or password."}

        if not email or not password:
            return Response(generic_error, status=400)

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(generic_error, status=401)

        if not user.check_password(password):
            return Response(generic_error, status=401)

        if not user.is_active:
            return Response({"ok": False, "error": "This account has been deactivated."}, status=403)

        token = sign_token(user)
        return Response({"ok": True, "token": token, "user": user.public_dict()})


class MeView(APIView):
    """Protected — returns the current user based on their token. The
    frontend calls this on page load to check 'am I still logged in?'
    Also returns `permissions`: the codenames this user holds, so the
    admin-panel sidebar can show/hide sections without a second request.
    Super admins implicitly hold everything (see permissions.py), so we
    report the full assignable set for them rather than their (possibly
    empty) explicit grants."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        data = user.public_dict()
        if user.role == "super_admin":
            data["permissions"] = [codename for codename, _ in User._meta.permissions]
        elif user.role == "admin":
            data["permissions"] = list(
                user.user_permissions.filter(content_type__app_label="api").values_list("codename", flat=True)
            )
        else:
            data["permissions"] = []
        return Response({"ok": True, "user": data})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ResetRateThrottle]

    def post(self, request):
        body = request.data
        if body.get("_hp"):
            return Response({"ok": True})

        email = normalize_email(str(body.get("email") or ""))

        # Always the same response whether or not the email exists —
        # otherwise this endpoint becomes a way to check which emails are
        # registered.
        generic_response = {"ok": True, "message": "If an account exists for that email, a reset link has been sent."}

        if not email or not is_email(email):
            return Response(generic_response)

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(generic_response)

        raw_token = generate_reset_token()
        user.reset_token_hash = hash_reset_token(raw_token)
        user.reset_token_expires_at = timezone.now() + settings.RESET_TOKEN_TTL
        user.save(update_fields=["reset_token_hash", "reset_token_expires_at"])

        reset_link = f"{settings.FRONTEND_URL}/reset-password.html?token={raw_token}"

        try:
            mailer.send_password_reset_email(email, reset_link)
        except Exception:
            # Still return the generic success response — don't leak failure details.
            pass

        return Response(generic_response)


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ResetRateThrottle]

    def post(self, request):
        body = request.data
        if body.get("_hp"):
            return Response({"ok": True})

        raw_token = str(body.get("token") or "")
        password = str(body.get("password") or "")

        if not raw_token:
            return Response({"ok": False, "error": "Missing or invalid reset link."}, status=400)

        pw_error = validate_password(password)
        if pw_error:
            return Response({"ok": False, "errors": {"password": pw_error}}, status=400)

        token_hash = hash_reset_token(raw_token)
        try:
            user = User.objects.get(reset_token_hash=token_hash)
        except User.DoesNotExist:
            return Response({"ok": False, "error": "This reset link is invalid or has expired."}, status=400)

        if not user.reset_token_expires_at or user.reset_token_expires_at < timezone.now():
            return Response({"ok": False, "error": "This reset link is invalid or has expired."}, status=400)

        user.set_password(password)
        # A used or replaced token must never work again.
        user.reset_token_hash = None
        user.reset_token_expires_at = None
        user.save(update_fields=["password", "reset_token_hash", "reset_token_expires_at"])

        return Response({"ok": True, "message": "Password updated. You can now log in."})


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class AdminBaseView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]


class AdminContactsView(AdminBaseView):
    def get(self, request):
        rows = [
            {
                "id": c.id,
                "name": c.name,
                "email": c.email,
                "phone": c.phone,
                "message": c.message,
                "ip": c.ip,
                "created_at": c.created_at.isoformat(),
            }
            for c in ContactSubmission.objects.all()
        ]
        return Response({"ok": True, "contacts": rows})


class AdminNewsletterView(AdminBaseView):
    def get(self, request):
        rows = [
            {"id": s.id, "email": s.email, "ip": s.ip, "created_at": s.created_at.isoformat()}
            for s in NewsletterSubscriber.objects.all()
        ]
        return Response({"ok": True, "subscribers": rows})


class AdminUsersView(AdminBaseView):
    def get(self, request):
        # Never expose password hashes or reset tokens, even internally by accident.
        rows = [
            {**u.public_dict(), "created_at": u.created_at.isoformat()}
            for u in User.objects.all()
        ]
        return Response({"ok": True, "users": rows})


class AdminSummaryView(AdminBaseView):
    def get(self, request):
        return Response(
            {
                "ok": True,
                "counts": {
                    "contacts": ContactSubmission.objects.count(),
                    "subscribers": NewsletterSubscriber.objects.count(),
                    "users": User.objects.count(),
                },
            }
        )
