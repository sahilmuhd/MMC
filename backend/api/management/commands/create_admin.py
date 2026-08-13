"""
Creates a super_admin account, or promotes an existing account to
super_admin if the email is already registered. A super admin has full
system access and can grant/revoke granular permissions on other admins
via /api/admin/permissions/assign/.

Usage:
  python manage.py create_admin "Admin Name" admin@example.com SecurePass123

If you already registered normally through the site, you can just run this
with that same email — the existing account will simply be promoted to
super_admin (the password argument is ignored in that case).
"""

import re

from django.core.management.base import BaseCommand, CommandError

from api.models import User


class Command(BaseCommand):
    help = "Create or promote an admin account (equivalent of scripts/create-admin.js)"

    def add_arguments(self, parser):
        parser.add_argument("name", nargs="?", help="Full name (required only when creating a new account)")
        parser.add_argument("email", help="Email address")
        parser.add_argument(
            "password", nargs="?", help="Password (required only when creating a new account)"
        )

    def handle(self, *args, **options):
        name = options.get("name")
        email = options["email"]
        password = options.get("password")

        existing = User.objects.filter(email__iexact=email).first()

        if existing:
            existing.role = "super_admin"
            existing.is_staff = True
            existing.is_superuser = True
            existing.save(update_fields=["role", "is_staff", "is_superuser"])
            self.stdout.write(self.style.SUCCESS(f'\u2714 Promoted existing account "{existing.name}" <{email}> to super_admin.'))
            self.stdout.write("  Log in with their existing password -- nothing else changes.")
            return

        if not name or not password:
            raise CommandError(
                "No account with that email exists yet -- creating a new one requires all 3 arguments:\n"
                '  python manage.py create_admin "Admin Name" admin@example.com SecurePass123'
            )

        if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
            raise CommandError("Password must be at least 8 characters and include a letter and a number.")

        user = User.objects.create_superuser(email=email, name=name, password=password)
        self.stdout.write(self.style.SUCCESS(f"\u2714 Created new admin account: {user.name} <{user.email}>"))
        self.stdout.write("  You can now log in at /login.html with this email and password.")
