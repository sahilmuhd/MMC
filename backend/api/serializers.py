from django.db.models import Sum
from rest_framework import serializers

from .models import AuditLog, Goal, GoalAchievement, IncomeRecord, PointsTransaction, User


class MemberSerializer(serializers.ModelSerializer):
    """List/summary shape -- used in member lists and as the nested node in
    hierarchy responses."""

    class Meta:
        model = User
        fields = [
            "id", "member_id", "name", "email", "mobile", "role", "status",
            "points_balance", "profile_photo", "parent",
        ]
        read_only_fields = ["id", "member_id", "points_balance"]


class MemberDetailSerializer(MemberSerializer):
    goal_count = serializers.IntegerField(source="achievements.count", read_only=True)
    total_income_paid = serializers.SerializerMethodField()

    class Meta(MemberSerializer.Meta):
        fields = MemberSerializer.Meta.fields + [
            "created_at", "updated_at", "goal_count", "total_income_paid",
        ]

    def get_total_income_paid(self, obj):
        total = obj.income_records.filter(status="paid").aggregate(s=Sum("amount"))["s"]
        return str(total or 0)


class GoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Goal
        fields = [
            "id", "name", "description", "target", "points", "income_amount",
            "start_date", "end_date", "status", "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


class GoalAchievementSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.name", read_only=True)
    goal_name = serializers.CharField(source="goal.name", read_only=True)

    class Meta:
        model = GoalAchievement
        fields = [
            "id", "member", "member_name", "goal", "goal_name", "progress", "target_snapshot",
            "submitted_at", "approval_status", "approved_by", "approved_at", "notes",
        ]
        read_only_fields = [
            "id", "member", "target_snapshot", "submitted_at", "approval_status",
            "approved_by", "approved_at",
        ]


class PointsTransactionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)

    class Meta:
        model = PointsTransaction
        fields = ["id", "member", "points", "reason", "achievement", "created_by", "created_by_name", "created_at"]
        read_only_fields = ["id", "created_at"]


class IncomeRecordSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.name", read_only=True)

    class Meta:
        model = IncomeRecord
        fields = [
            "id", "member", "member_name", "goal", "achievement", "amount", "status",
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
