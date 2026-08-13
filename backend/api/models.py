from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """A member of the hierarchy. Also doubles as an admin/super-admin
    account depending on `role` -- same table as before, extended rather
    than split into a separate Member model, since every admin is also
    a member of the org chart."""

    ROLE_CHOICES = (
        ("member", "Member"),
        ("admin", "Admin"),
        ("super_admin", "Super Admin"),
    )
    STATUS_CHOICES = (
        ("active", "Active"),
        ("inactive", "Inactive"),
    )

    # --- Identity ---
    member_id = models.CharField(max_length=20, unique=True, blank=True, db_index=True)
    name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(unique=True)
    mobile = models.CharField(max_length=20, blank=True)
    profile_photo = models.ImageField(upload_to="member_photos/", null=True, blank=True)

    # --- Hierarchy ---
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children"
    )

    # --- Role / status ---
    role = models.CharField(max_length=12, choices=ROLE_CHOICES, default="member")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # --- Points cache ---
    # Kept as a running balance updated inside the same DB transaction as
    # every PointsTransaction (never overwritten directly) so it stays an
    # O(1) read instead of re-aggregating the whole history on every request.
    points_balance = models.IntegerField(default=0)

    # Password-reset flow: only the SHA-256 hash of the raw token is ever
    # stored, so a leaked DB dump can't be replayed.
    reset_token_hash = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    reset_token_expires_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["id"]
        permissions = [
            # Granular, assignable permission set (point 10 of the spec).
            # Super admins bypass these checks entirely (see permissions.py);
            # these are for admins with a limited, assigned subset.
            ("view_members", "Can view members"),
            ("add_members", "Can add members"),
            ("edit_members", "Can edit members"),
            ("remove_members", "Can remove/deactivate members"),
            ("view_hierarchy", "Can view member hierarchy"),
            ("edit_hierarchy", "Can edit hierarchy-related information"),
            ("view_goals", "Can view goals"),
            ("create_goals", "Can create goals"),
            ("edit_goals", "Can edit goals"),
            ("approve_achievements", "Can approve/reject goal achievements"),
            ("view_points", "Can view points"),
            ("edit_points", "Can edit/adjust points"),
            ("view_income", "Can view income"),
            ("edit_income", "Can edit income status"),
            ("view_reports", "Can view admin reports/dashboard"),
            ("upload_photos", "Can upload member photos"),
            ("edit_photos", "Can replace member photos"),
            ("delete_photos", "Can delete member photos"),
            ("view_audit_logs", "Can view audit logs"),
        ]

    def __str__(self):
        return f"{self.member_id or self.id} <{self.email}>"

    def public_dict(self):
        """Shape returned to clients -- never includes the password hash or
        reset-token fields."""
        return {
            "id": self.id,
            "member_id": self.member_id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "role": self.role,
            "status": self.status,
            "points_balance": self.points_balance,
            "profile_photo": self.profile_photo.url if self.profile_photo else None,
            "parent_id": self.parent_id,
        }


class ContactSubmission(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=30)
    message = models.TextField()
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} <{self.email}>"


class NewsletterSubscriber(models.Model):
    email = models.EmailField(unique=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.email


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------


class Goal(models.Model):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("archived", "Archived"),
    )

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    target = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    points = models.PositiveIntegerField(default=0)
    income_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class GoalAchievement(models.Model):
    APPROVAL_CHOICES = (
        ("pending", "Pending"),
        ("submitted", "Submitted"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("completed", "Completed"),
    )

    member = models.ForeignKey(User, on_delete=models.CASCADE, related_name="achievements")
    goal = models.ForeignKey(Goal, on_delete=models.CASCADE, related_name="achievements")
    progress = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    target_snapshot = models.DecimalField(max_digits=12, decimal_places=2)
    submitted_at = models.DateTimeField(auto_now_add=True)
    approval_status = models.CharField(max_length=10, choices=APPROVAL_CHOICES, default="submitted")
    approved_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.member} -> {self.goal} ({self.approval_status})"


# ---------------------------------------------------------------------------
# Points
# ---------------------------------------------------------------------------


class PointsTransaction(models.Model):
    """Append-only ledger. member.points_balance is a cached running total
    updated in the same DB transaction as every insert here -- the total is
    never edited directly, only ever derived from a new ledger row."""

    member = models.ForeignKey(User, on_delete=models.CASCADE, related_name="points_transactions")
    points = models.IntegerField()  # positive = credit, negative = debit
    reason = models.CharField(max_length=255)
    achievement = models.ForeignKey(
        GoalAchievement, null=True, blank=True, on_delete=models.SET_NULL, related_name="points_transactions"
    )
    created_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
        help_text="Admin who made a manual adjustment; null for system-generated entries.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.member}: {self.points:+d} ({self.reason})"


# ---------------------------------------------------------------------------
# Income / rewards
# ---------------------------------------------------------------------------


class IncomeRecord(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("paid", "Paid"),
        ("rejected", "Rejected"),
    )

    member = models.ForeignKey(User, on_delete=models.CASCADE, related_name="income_records")
    goal = models.ForeignKey(Goal, null=True, blank=True, on_delete=models.SET_NULL, related_name="income_records")
    achievement = models.ForeignKey(
        GoalAchievement, null=True, blank=True, on_delete=models.SET_NULL, related_name="income_records"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.member}: {self.amount} ({self.status})"


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


class AuditLog(models.Model):
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=100)
    target_model = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=50, blank=True)
    previous_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} by {self.actor} @ {self.created_at}"
