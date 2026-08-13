from django.contrib.auth.base_user import BaseUserManager
from django.db import transaction


class UserManager(BaseUserManager):
    """Users log in with email (there's no separate username). Every new
    account also gets a unique member_id (MMC000001, MMC000002, ...)."""

    use_in_migrations = True

    def _create_user(self, email, name, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email)
        with transaction.atomic():
            user = self.model(email=email, name=name, **extra_fields)
            user.set_password(password)
            user.save(using=self._db)
            if not user.member_id:
                user.member_id = f"MMC{user.id:06d}"
                user.save(using=self._db, update_fields=["member_id"])
        return user

    def create_user(self, email, name="", password=None, **extra_fields):
        extra_fields.setdefault("role", "member")
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, name, password, **extra_fields)

    def create_superuser(self, email, name="", password=None, **extra_fields):
        # "Superuser" here means role="super_admin" -- full system access,
        # including the ability to grant/revoke granular permissions on
        # other admins. is_staff/is_superuser are set too so Django's own
        # /django-admin/ and `manage.py createsuperuser` behave sensibly.
        extra_fields.setdefault("role", "super_admin")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self._create_user(email, name, password, **extra_fields)
