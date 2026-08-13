from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q, Sum
from django.contrib.auth.models import Permission
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import log_action
from .models import AuditLog, Goal, GoalAchievement, IncomeRecord, PointsTransaction, User
from .permissions import HasPermission, IsSelfOrAdmin, IsSelfOrHasPermission, IsSuperAdmin
from .serializers import (
    AuditLogSerializer,
    GoalAchievementSerializer,
    GoalSerializer,
    IncomeRecordSerializer,
    MemberDetailSerializer,
    MemberSerializer,
    PointsTransactionSerializer,
)


def paginate(request, queryset, serializer_cls, extra_context=None):
    try:
        page = max(int(request.query_params.get("page", 1)), 1)
        page_size = min(max(int(request.query_params.get("page_size", 20)), 1), 100)
    except ValueError:
        page, page_size = 1, 20
    total = queryset.count()
    start = (page - 1) * page_size
    items = queryset[start : start + page_size]
    return {
        "results": serializer_cls(items, many=True, context=extra_context or {}).data,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size if page_size else 0,
    }


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------


class MemberListCreateView(APIView):
    """GET  /api/admin/members/   (view_members)
    POST /api/admin/members/   (add_members)"""

    def get_permissions(self):
        codename = "add_members" if self.request.method == "POST" else "view_members"
        return [IsAuthenticated(), HasPermission(codename)()]

    def get(self, request):
        qs = User.objects.all()
        status_filter = request.query_params.get("status")
        role_filter = request.query_params.get("role")
        search = request.query_params.get("search")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if role_filter:
            qs = qs.filter(role=role_filter)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(email__icontains=search) | Q(member_id__icontains=search))
        return Response({"ok": True, **paginate(request, qs, MemberSerializer)})

    def post(self, request):
        body = request.data
        email = str(body.get("email") or "").strip().lower()
        name = str(body.get("name") or "").strip()
        password = str(body.get("password") or "")
        if not email or not name or not password:
            return Response({"ok": False, "error": "name, email, and password are required."}, status=400)
        if User.objects.filter(email__iexact=email).exists():
            return Response({"ok": False, "error": "An account with this email already exists."}, status=409)

        parent_id = body.get("parent")
        parent = None
        if parent_id:
            parent = get_object_or_404(User, pk=parent_id)

        member = User.objects.create_user(
            email=email,
            name=name,
            password=password,
            mobile=str(body.get("mobile") or ""),
            parent=parent,
        )
        log_action(request, "member_created", target=member, new_value=member.public_dict())
        return Response({"ok": True, "member": MemberDetailSerializer(member).data}, status=201)


class MemberDetailView(APIView):
    def get_permissions(self):
        codename = "edit_members" if self.request.method in ("PATCH", "PUT") else "view_members"
        return [IsAuthenticated(), HasPermission(codename)()]

    def get(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        return Response({"ok": True, "member": MemberDetailSerializer(member).data})

    def patch(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        before = member.public_dict()
        body = request.data

        for field in ("name", "mobile"):
            if field in body:
                setattr(member, field, str(body[field]))
        if "parent" in body:
            member.parent_id = body["parent"] or None
        if "role" in body:
            # Only a super admin may change roles -- promoting yourself or
            # someone else to admin/super_admin is not a delegable action.
            if request.user.role != "super_admin":
                return Response({"ok": False, "error": "Only a super admin can change roles."}, status=403)
            if body["role"] not in dict(User.ROLE_CHOICES):
                return Response({"ok": False, "error": "Invalid role."}, status=400)
            member.role = body["role"]

        member.save()
        log_action(request, "member_edited", target=member, previous_value=before, new_value=member.public_dict())
        return Response({"ok": True, "member": MemberDetailSerializer(member).data})


class MemberDeactivateView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("remove_members")]

    def post(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        before = member.status
        member.status = "inactive"
        member.is_active = False  # soft-deactivation: blocks login, keeps all history intact
        member.save(update_fields=["status", "is_active"])
        log_action(request, "member_deactivated", target=member, previous_value={"status": before}, new_value={"status": "inactive"})
        return Response({"ok": True, "member": MemberDetailSerializer(member).data})


class MemberReactivateView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("remove_members")]

    def post(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        member.status = "active"
        member.is_active = True
        member.save(update_fields=["status", "is_active"])
        log_action(request, "member_reactivated", target=member, new_value={"status": "active"})
        return Response({"ok": True, "member": MemberDetailSerializer(member).data})


# ---------------------------------------------------------------------------
# Hierarchy
# ---------------------------------------------------------------------------


def _absolute_level(member):
    level = 0
    node = member
    seen = {member.id}
    while node.parent_id and level < 50:
        node = node.parent
        if node is None or node.id in seen:
            break
        seen.add(node.id)
        level += 1
    return level


def _hierarchy_node(member, depth_remaining):
    children_qs = member.children.all()
    node = {
        "id": member.id,
        "member_id": member.member_id,
        "name": member.name,
        "email": member.email,
        "role": member.role,
        "status": member.status,
        "points_balance": member.points_balance,
        "goals_count": member.achievements.count(),
        "income_paid": str(member.income_records.filter(status="paid").aggregate(s=Sum("amount"))["s"] or 0),
        "profile_photo": member.profile_photo.url if member.profile_photo else None,
        "level": _absolute_level(member),
        "has_children": children_qs.exists(),
    }
    if depth_remaining > 0:
        node["children"] = [_hierarchy_node(child, depth_remaining - 1) for child in children_qs]
    else:
        node["children"] = None  # not expanded -- frontend can re-request this node's id to expand
    return node


class MemberHierarchyView(APIView):
    """GET /api/members/<id>/hierarchy/?depth=2 -- self, or an admin with
    view_hierarchy. Returns this member plus their downline, `depth` levels
    deep (default 2, max 5). Frontend expand/collapse: call this same
    endpoint again with a child's id to lazily load further levels."""

    permission_classes = [IsSelfOrHasPermission("view_hierarchy")]

    def get(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        self.check_object_permissions(request, member)
        try:
            depth = min(max(int(request.query_params.get("depth", 2)), 0), 5)
        except ValueError:
            depth = 2
        parent_summary = None
        if member.parent:
            parent_summary = {"id": member.parent.id, "member_id": member.parent.member_id, "name": member.parent.name}
        return Response({"ok": True, "parent": parent_summary, "tree": _hierarchy_node(member, depth)})


# ---------------------------------------------------------------------------
# Photos
# ---------------------------------------------------------------------------


class MemberPhotoView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsSelfOrAdmin]

    def post(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        self.check_object_permissions(request, member)
        if member.id != request.user.id and not request.user.has_perm("api.upload_photos") and request.user.role != "super_admin":
            return Response({"ok": False, "error": "Missing permission: upload_photos."}, status=403)

        photo = request.FILES.get("photo")
        if not photo:
            return Response({"ok": False, "error": "No photo file provided."}, status=400)
        if photo.size > 5 * 1024 * 1024:
            return Response({"ok": False, "error": "Photo must be under 5MB."}, status=400)
        if photo.content_type not in ("image/jpeg", "image/png", "image/webp"):
            return Response({"ok": False, "error": "Photo must be JPEG, PNG, or WebP."}, status=400)

        member.profile_photo = photo
        member.save(update_fields=["profile_photo"])
        log_action(request, "photo_uploaded", target=member)
        return Response({"ok": True, "profile_photo": member.profile_photo.url})

    def delete(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        self.check_object_permissions(request, member)
        if member.id != request.user.id and not request.user.has_perm("api.delete_photos") and request.user.role != "super_admin":
            return Response({"ok": False, "error": "Missing permission: delete_photos."}, status=403)

        member.profile_photo.delete(save=False)
        member.profile_photo = None
        member.save(update_fields=["profile_photo"])
        log_action(request, "photo_deleted", target=member)
        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------


class GoalListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), HasPermission("create_goals")()]
        return [IsAuthenticated()]

    def get(self, request):
        qs = Goal.objects.all()
        if request.user.role not in ("admin", "super_admin"):
            qs = qs.filter(status="active")  # members only see live goals
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({"ok": True, **paginate(request, qs, GoalSerializer)})

    def post(self, request):
        serializer = GoalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        goal = serializer.save(created_by=request.user)
        log_action(request, "goal_created", target=goal, new_value=GoalSerializer(goal).data)
        return Response({"ok": True, "goal": GoalSerializer(goal).data}, status=201)


class GoalDetailView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsAuthenticated()]
        return [IsAuthenticated(), HasPermission("edit_goals")()]

    def get(self, request, pk):
        goal = get_object_or_404(Goal, pk=pk)
        return Response({"ok": True, "goal": GoalSerializer(goal).data})

    def patch(self, request, pk):
        goal = get_object_or_404(Goal, pk=pk)
        before = GoalSerializer(goal).data
        serializer = GoalSerializer(goal, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        goal = serializer.save()
        log_action(request, "goal_edited", target=goal, previous_value=before, new_value=GoalSerializer(goal).data)
        return Response({"ok": True, "goal": GoalSerializer(goal).data})

    def delete(self, request, pk):
        goal = get_object_or_404(Goal, pk=pk)
        before = GoalSerializer(goal).data
        goal.status = "archived"  # soft delete -- achievements/points/income referencing it must survive
        goal.save(update_fields=["status"])
        log_action(request, "goal_archived", target=goal, previous_value=before)
        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Achievements
# ---------------------------------------------------------------------------


class AchievementSubmitView(APIView):
    """POST /api/goals/<id>/achievements/ -- a member submits their own
    progress toward a goal. Starts in "submitted" status; only an admin
    with approve_achievements can move it to approved/rejected."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        goal = get_object_or_404(Goal, pk=pk, status="active")
        progress = request.data.get("progress", goal.target)
        achievement = GoalAchievement.objects.create(
            member=request.user,
            goal=goal,
            progress=progress,
            target_snapshot=goal.target,
            notes=str(request.data.get("notes") or ""),
        )
        log_action(request, "achievement_submitted", target=achievement)
        return Response({"ok": True, "achievement": GoalAchievementSerializer(achievement).data}, status=201)


class AchievementListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = GoalAchievement.objects.select_related("member", "goal")
        if request.user.role not in ("admin", "super_admin"):
            qs = qs.filter(member=request.user)  # members only ever see their own
        else:
            member_id = request.query_params.get("member")
            if member_id:
                qs = qs.filter(member_id=member_id)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(approval_status=status_filter)
        return Response({"ok": True, **paginate(request, qs, GoalAchievementSerializer)})


class AchievementApproveView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("approve_achievements")]

    @transaction.atomic
    def post(self, request, pk):
        achievement = get_object_or_404(GoalAchievement.objects.select_for_update(), pk=pk)
        if achievement.approval_status == "approved":
            return Response({"ok": False, "error": "Already approved."}, status=400)

        achievement.approval_status = "approved"
        achievement.approved_by = request.user
        from django.utils import timezone

        achievement.approved_at = timezone.now()
        achievement.save(update_fields=["approval_status", "approved_by", "approved_at"])

        goal = achievement.goal
        member = achievement.member

        if goal.points:
            PointsTransaction.objects.create(
                member=member, points=goal.points, reason=f"Goal approved: {goal.name}",
                achievement=achievement, created_by=request.user,
            )
            User.objects.filter(pk=member.pk).update(points_balance=F("points_balance") + goal.points)

        if goal.income_amount:
            IncomeRecord.objects.create(
                member=member, goal=goal, achievement=achievement, amount=goal.income_amount, status="pending",
            )

        log_action(request, "achievement_approved", target=achievement)
        return Response({"ok": True, "achievement": GoalAchievementSerializer(achievement).data})


class AchievementRejectView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("approve_achievements")]

    def post(self, request, pk):
        achievement = get_object_or_404(GoalAchievement, pk=pk)
        achievement.approval_status = "rejected"
        achievement.approved_by = request.user
        achievement.notes = str(request.data.get("notes") or achievement.notes)
        from django.utils import timezone

        achievement.approved_at = timezone.now()
        achievement.save(update_fields=["approval_status", "approved_by", "notes", "approved_at"])
        log_action(request, "achievement_rejected", target=achievement)
        return Response({"ok": True, "achievement": GoalAchievementSerializer(achievement).data})


# ---------------------------------------------------------------------------
# Points
# ---------------------------------------------------------------------------


class PointsAdjustView(APIView):
    """POST /api/admin/points/adjust/ -- manual admin adjustment. Always
    appends a ledger row rather than touching points_balance directly."""

    permission_classes = [IsAuthenticated, HasPermission("edit_points")]

    @transaction.atomic
    def post(self, request):
        member_id = request.data.get("member")
        points = request.data.get("points")
        reason = str(request.data.get("reason") or "")
        if not member_id or points in (None, "") or not reason:
            return Response({"ok": False, "error": "member, points, and reason are required."}, status=400)
        try:
            points = int(points)
        except (TypeError, ValueError):
            return Response({"ok": False, "error": "points must be an integer."}, status=400)

        member = get_object_or_404(User.objects.select_for_update(), pk=member_id)
        txn = PointsTransaction.objects.create(member=member, points=points, reason=reason, created_by=request.user)
        User.objects.filter(pk=member.pk).update(points_balance=F("points_balance") + points)
        log_action(request, "points_adjusted", target=member, new_value={"points": points, "reason": reason})
        return Response({"ok": True, "transaction": PointsTransactionSerializer(txn).data})


class PointsHistoryView(APIView):
    permission_classes = [IsSelfOrHasPermission("view_points")]

    def get(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        self.check_object_permissions(request, member)
        qs = member.points_transactions.all()
        return Response({"ok": True, "balance": member.points_balance, **paginate(request, qs, PointsTransactionSerializer)})


# ---------------------------------------------------------------------------
# Income
# ---------------------------------------------------------------------------


class IncomeListView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("view_income")]

    def get(self, request):
        qs = IncomeRecord.objects.select_related("member")
        status_filter = request.query_params.get("status")
        member_id = request.query_params.get("member")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if member_id:
            qs = qs.filter(member_id=member_id)
        return Response({"ok": True, **paginate(request, qs, IncomeRecordSerializer)})


class IncomeUpdateStatusView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("edit_income")]

    def patch(self, request, pk):
        record = get_object_or_404(IncomeRecord, pk=pk)
        new_status = request.data.get("status")
        if new_status not in dict(IncomeRecord.STATUS_CHOICES):
            return Response({"ok": False, "error": "Invalid status."}, status=400)
        before = {"status": record.status}
        record.status = new_status
        record.notes = str(request.data.get("notes") or record.notes)
        from django.utils import timezone

        record.processed_at = timezone.now()
        record.processed_by = request.user
        record.save(update_fields=["status", "notes", "processed_at", "processed_by"])
        log_action(request, "income_updated", target=record, previous_value=before, new_value={"status": new_status})
        return Response({"ok": True, "income": IncomeRecordSerializer(record).data})


class IncomeHistoryView(APIView):
    permission_classes = [IsSelfOrHasPermission("view_income")]

    def get(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        self.check_object_permissions(request, member)
        qs = member.income_records.all()
        return Response({"ok": True, **paginate(request, qs, IncomeRecordSerializer)})


# ---------------------------------------------------------------------------
# Admin dashboard
# ---------------------------------------------------------------------------


class AdminDashboardView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("view_reports")]

    def get(self, request):
        total_income = IncomeRecord.objects.aggregate(s=Sum("amount"))["s"] or 0
        pending_income = IncomeRecord.objects.filter(status__in=["pending", "approved"]).aggregate(s=Sum("amount"))["s"] or 0
        paid_income = IncomeRecord.objects.filter(status="paid").aggregate(s=Sum("amount"))["s"] or 0

        return Response({
            "ok": True,
            "counts": {
                "total_members": User.objects.count(),
                "active_members": User.objects.filter(status="active").count(),
                "inactive_members": User.objects.filter(status="inactive").count(),
                "total_goals": Goal.objects.count(),
                "completed_goals": GoalAchievement.objects.filter(approval_status="approved").values("goal").distinct().count(),
                "pending_achievements": GoalAchievement.objects.filter(approval_status="submitted").count(),
                "total_points": User.objects.aggregate(s=Sum("points_balance"))["s"] or 0,
                "total_income": str(total_income),
                "pending_income": str(pending_income),
                "paid_income": str(paid_income),
            },
            "recent_members": MemberSerializer(User.objects.order_by("-created_at")[:5], many=True).data,
            "recent_achievements": GoalAchievementSerializer(
                GoalAchievement.objects.select_related("member", "goal").order_by("-submitted_at")[:5], many=True
            ).data,
            "recent_activity": AuditLogSerializer(AuditLog.objects.all()[:10], many=True).data,
        })


# ---------------------------------------------------------------------------
# Permissions (super admin only)
# ---------------------------------------------------------------------------


ASSIGNABLE_PERMISSIONS = [codename for codename, _ in User._meta.permissions]


class PermissionListView(APIView):
    """GET /api/admin/permissions/?member=<id> -- lists every assignable
    codename, and (if member= given) which of them that admin currently
    holds."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        member_id = request.query_params.get("member")
        held = set()
        if member_id:
            member = get_object_or_404(User, pk=member_id)
            held = set(member.user_permissions.filter(codename__in=ASSIGNABLE_PERMISSIONS).values_list("codename", flat=True))
        return Response({
            "ok": True,
            "permissions": [{"codename": c, "granted": c in held} for c in ASSIGNABLE_PERMISSIONS],
        })


class PermissionAssignView(APIView):
    """POST /api/admin/permissions/assign/ {member, codename, action: grant|revoke}"""

    permission_classes = [IsSuperAdmin]

    def post(self, request):
        member_id = request.data.get("member")
        codename = request.data.get("codename")
        action = request.data.get("action")
        if codename not in ASSIGNABLE_PERMISSIONS or action not in ("grant", "revoke"):
            return Response({"ok": False, "error": "Invalid codename or action."}, status=400)

        member = get_object_or_404(User, pk=member_id)
        try:
            perm = Permission.objects.get(codename=codename, content_type__app_label="api")
        except Permission.DoesNotExist:
            return Response({"ok": False, "error": "Permission not found -- run migrations first."}, status=500)

        if action == "grant":
            member.user_permissions.add(perm)
        else:
            member.user_permissions.remove(perm)

        log_action(request, f"permission_{action}ed", target=member, new_value={"codename": codename})
        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


class AuditLogListView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("view_audit_logs")]

    def get(self, request):
        qs = AuditLog.objects.select_related("actor")
        action_filter = request.query_params.get("action")
        actor_id = request.query_params.get("actor")
        if action_filter:
            qs = qs.filter(action=action_filter)
        if actor_id:
            qs = qs.filter(actor_id=actor_id)
        return Response({"ok": True, **paginate(request, qs, AuditLogSerializer)})
