from django.db.models import Sum
from rest_framework import serializers

from .models import (
    AchievementProof,
    AuditLog,
    ContactSubmission,
    Goal,
    GoalAchievement,
    IncomeRecord,
    Notification,
    PointsTransaction,
    Product,
    SiteContent,
    TeamMember,
    User,
)


class MemberSerializer(serializers.ModelSerializer):
    """List/summary shape -- used in member lists and as the nested node in
    hierarchy responses."""

    sponsor_name = serializers.CharField(source="parent.name", read_only=True, default=None)
    team_size = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "member_id", "name", "email", "mobile", "role", "status",
            "points_balance", "rank", "profile_photo", "parent", "sponsor_name", "team_size", "created_at",
        ]
        read_only_fields = ["id", "member_id", "points_balance", "rank"]

    def get_team_size(self, obj):
        # Direct downline count only (not the whole subtree) -- cheap
        # enough for a paginated admin list; the tree view computes its
        # own totals per-node in Phase 4.
        return obj.children.count()


class MemberDetailSerializer(MemberSerializer):
    goal_count = serializers.IntegerField(source="achievements.count", read_only=True)
    total_income_paid = serializers.SerializerMethodField()

    class Meta(MemberSerializer.Meta):
        fields = MemberSerializer.Meta.fields + [
            "updated_at", "goal_count", "total_income_paid",
        ]

    def get_total_income_paid(self, obj):
        total = obj.income_records.filter(status="paid").aggregate(s=Sum("amount"))["s"]
        return str(total or 0)


class GoalSerializer(serializers.ModelSerializer):
    participants_count = serializers.SerializerMethodField()
    completed_count = serializers.SerializerMethodField()

    class Meta:
        model = Goal
        fields = [
            "id", "name", "description", "target", "points", "income_amount",
            "start_date", "end_date", "status", "created_by", "created_at", "updated_at",
            "participants_count", "completed_count",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_participants_count(self, obj):
        return obj.achievements.values("member_id").distinct().count()

    def get_completed_count(self, obj):
        return obj.achievements.filter(approval_status="approved").count()


class AchievementProofSerializer(serializers.ModelSerializer):
    class Meta:
        model = AchievementProof
        fields = ["id", "achievement", "file", "original_name", "content_type", "size", "uploaded_by", "uploaded_at"]
        read_only_fields = ["id", "achievement", "original_name", "content_type", "size", "uploaded_by", "uploaded_at"]


class GoalAchievementSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.name", read_only=True)
    goal_name = serializers.CharField(source="goal.name", read_only=True)
    proofs = AchievementProofSerializer(many=True, read_only=True)

    class Meta:
        model = GoalAchievement
        fields = [
            "id", "member", "member_name", "goal", "goal_name", "progress", "target_snapshot",
            "submitted_at", "approval_status", "approved_by", "approved_at", "notes", "proofs",
        ]
        read_only_fields = [
            "id", "member", "target_snapshot", "submitted_at", "approval_status",
            "approved_by", "approved_at",
        ]


class PointsTransactionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)
    member_name = serializers.CharField(source="member.name", read_only=True)

    class Meta:
        model = PointsTransaction
        fields = ["id", "member", "member_name", "points", "reason", "achievement", "created_by", "created_by_name", "created_at"]
        read_only_fields = ["id", "created_at"]


class IncomeRecordSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.name", read_only=True)
    goal_name = serializers.CharField(source="goal.name", read_only=True, default=None)

    class Meta:
        model = IncomeRecord
        fields = [
            "id", "member", "member_name", "goal", "goal_name", "achievement", "amount", "status",
            "created_at", "processed_at", "processed_by", "notes",
        ]
        read_only_fields = ["id", "member", "goal", "achievement", "created_at", "processed_at", "processed_by"]


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.name", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id", "actor", "actor_name", "action", "target_model", "target_id",
            "previous_value", "new_value", "ip_address", "created_at",
        ]
        read_only_fields = fields


class SiteContentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteContent
        fields = ["id", "key", "data", "updated_by", "updated_at"]
        read_only_fields = ["id", "updated_by", "updated_at"]


class TeamMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamMember
        fields = [
            "id", "name", "position", "photo", "description", "social_links",
            "is_active", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "id", "name", "description", "price", "images", "features",
            "is_active", "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "event", "title", "body", "target_model", "target_id", "is_read", "created_at"]
        read_only_fields = fields


class ContactSubmissionSerializer(serializers.ModelSerializer):
    replied_by_name = serializers.CharField(source="replied_by.name", read_only=True)

    class Meta:
        model = ContactSubmission
        fields = [
            "id", "name", "email", "phone", "message", "created_at",
            "is_read", "is_archived", "admin_reply", "replied_at", "replied_by", "replied_by_name",
        ]
        read_only_fields = ["id", "name", "email", "phone", "message", "created_at", "replied_at", "replied_by", "replied_by_name"]
