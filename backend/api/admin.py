from django.contrib import admin

from .models import (
    User,
    ContactSubmission,
    NewsletterSubscriber,
    Goal,
    GoalAchievement,
    PointsTransaction,
    IncomeRecord,
    AuditLog,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "email", "role", "points_balance", "is_active", "created_at")
    list_filter = ("role", "is_active")
    search_fields = ("name", "email")
    readonly_fields = ("password", "created_at")
    ordering = ("-created_at",)


@admin.register(ContactSubmission)
class ContactSubmissionAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "email", "phone", "created_at")
    search_fields = ("name", "email", "message")
    ordering = ("-created_at",)


@admin.register(NewsletterSubscriber)
class NewsletterSubscriberAdmin(admin.ModelAdmin):
    list_display = ("id", "email", "created_at")
    search_fields = ("email",)
    ordering = ("-created_at",)


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "target", "points", "income_amount", "status")
    list_filter = ("status",)
    search_fields = ("name",)


@admin.register(GoalAchievement)
class GoalAchievementAdmin(admin.ModelAdmin):
    list_display = ("id", "member", "goal", "progress", "approval_status", "submitted_at", "approved_by")
    list_filter = ("approval_status",)
    search_fields = ("member__name", "member__email", "goal__name")
    ordering = ("-submitted_at",)


@admin.register(PointsTransaction)
class PointsTransactionAdmin(admin.ModelAdmin):
    list_display = ("id", "member", "points", "reason", "created_by", "created_at")
    search_fields = ("member__name", "member__email", "reason")
    ordering = ("-created_at",)


@admin.register(IncomeRecord)
class IncomeRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "member", "amount", "status", "created_at", "processed_by")
    list_filter = ("status",)
    search_fields = ("member__name", "member__email")
    ordering = ("-created_at",)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("id", "actor", "action", "target_model", "target_id", "created_at")
    list_filter = ("action", "target_model")
    search_fields = ("actor__name", "actor__email", "action")
    ordering = ("-created_at",)
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False
