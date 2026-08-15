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
from .notifications import notify, notify_admins
from .permissions import HasPermission, IsSelfOrAdmin, IsSelfOrHasPermission, IsSuperAdmin
from .serializers import (
    AchievementProofSerializer,
    AuditLogSerializer,
    ContactSubmissionSerializer,
    GoalAchievementSerializer,
    GoalSerializer,
    IncomeRecordSerializer,
    MemberDetailSerializer,
    MemberSerializer,
    NotificationSerializer,
    PointsTransactionSerializer,
    ProductSerializer,
    SiteContentSerializer,
    TeamMemberSerializer,
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
        qs = User.objects.select_related("parent").all()
        status_filter = request.query_params.get("status")
        role_filter = request.query_params.get("role")
        search = request.query_params.get("search")
        ordering = request.query_params.get("ordering")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if role_filter:
            qs = qs.filter(role=role_filter)
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(email__icontains=search)
                | Q(member_id__icontains=search) | Q(mobile__icontains=search)
            )
        if request.query_params.get("root_only") == "1":
            qs = qs.filter(parent__isnull=True)  # top-level members -- used to seed the network tree's root picker

        allowed_ordering = {"name", "-name", "created_at", "-created_at", "points_balance", "-points_balance", "status", "-status"}
        if ordering in allowed_ordering:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-created_at")
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
        notify_admins("new_member", f"{member.name} registered", target=member)
        return Response({"ok": True, "member": MemberDetailSerializer(member).data}, status=201)


class MemberDetailView(APIView):
    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            codename = "edit_members"
        elif self.request.method == "DELETE":
            codename = "remove_members"
        else:
            codename = "view_members"
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

    def delete(self, request, pk):
        """Hard delete -- gated by remove_members. Refuses if the member
        still has downline (they'd need reassigning to a new sponsor
        first, same as the spec's "reassign sponsor" flow) so this can't
        silently orphan part of the hierarchy."""
        member = get_object_or_404(User, pk=pk)
        if member.children.exists():
            return Response(
                {"ok": False, "error": "This member still has downline members. Reassign their sponsor before deleting."},
                status=409,
            )
        before = member.public_dict()
        log_action(request, "member_deleted", previous_value=before)
        member.delete()
        return Response({"ok": True})


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


class MemberAncestorsView(APIView):
    """GET /api/admin/members/<id>/ancestors/ -- the chain from top-level
    root down to (but not including) this member. Used by the network
    search box: find a member, then expand every node along this chain
    so the match is reachable without the admin manually drilling down."""

    permission_classes = [IsAuthenticated, HasPermission("view_hierarchy")]

    def get(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        chain = []
        node = member.parent
        seen = {member.id}
        while node is not None and node.id not in seen and len(chain) < 50:
            chain.append({"id": node.id, "member_id": node.member_id, "name": node.name})
            seen.add(node.id)
            node = node.parent
        chain.reverse()  # root-first
        return Response({"ok": True, "ancestors": chain})


class SponsorReassignView(APIView):
    """POST /api/members/<id>/reassign-sponsor/ {"sponsor_id": <id or null>}
    Dedicated endpoint for changing a member's sponsor (distinct from the
    generic MemberDetailView PATCH) so we can enforce hierarchy-specific
    invariants: no self-sponsorship, no circular chains, and a proper
    audit trail + notification instead of a silent FK swap."""

    permission_classes = [IsAuthenticated, HasPermission("edit_hierarchy")]

    def post(self, request, pk):
        member = get_object_or_404(User, pk=pk)
        new_sponsor_id = request.data.get("sponsor_id")

        new_sponsor = None
        if new_sponsor_id not in (None, "", "null"):
            new_sponsor = get_object_or_404(User, pk=new_sponsor_id)

            if new_sponsor.id == member.id:
                return Response({"ok": False, "error": "A member cannot sponsor themselves."}, status=400)

            # Circular-reference check: walk up new_sponsor's ancestor chain --
            # if `member` appears in it, this reassignment would create a loop
            # (member would become an ancestor of its own sponsor).
            node = new_sponsor
            seen = {member.id}
            depth = 0
            while node is not None and depth < 200:
                if node.id in seen:
                    return Response(
                        {"ok": False, "error": "This change would create a circular sponsor relationship."},
                        status=400,
                    )
                seen.add(node.id)
                node = node.parent
                depth += 1

        old_sponsor = member.parent
        old_sponsor_summary = {
            "id": old_sponsor.id, "member_id": old_sponsor.member_id, "name": old_sponsor.name,
        } if old_sponsor else None
        new_sponsor_summary = {
            "id": new_sponsor.id, "member_id": new_sponsor.member_id, "name": new_sponsor.name,
        } if new_sponsor else None

        member.parent = new_sponsor
        member.save(update_fields=["parent"])

        log_action(
            request, "sponsor_reassigned", target=member,
            previous_value={"sponsor": old_sponsor_summary},
            new_value={"sponsor": new_sponsor_summary},
        )
        notify(
            member, "sponsor_reassigned", "Your sponsor has changed",
            body=f"Your sponsor is now {new_sponsor.name if new_sponsor else 'unassigned'}.",
            target=member,
        )

        return Response({"ok": True, "member": MemberDetailSerializer(member).data})


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
        notify_admins(
            "new_achievement_submission", f"{request.user.name} submitted progress on {goal.name}",
            target=achievement, permission_codename="approve_achievements",
        )
        return Response({"ok": True, "achievement": GoalAchievementSerializer(achievement).data}, status=201)


class AchievementProofUploadView(APIView):
    """POST /api/achievements/<id>/proofs/ -- multipart file upload.
    Owner of the achievement (while still pending) or an admin with
    approve_achievements may attach a proof file. Validates content-type
    and size server-side -- never trust the client extension."""

    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        achievement = get_object_or_404(GoalAchievement, pk=pk)
        is_owner = achievement.member_id == request.user.id
        is_reviewer = request.user.role in ("admin", "super_admin") and request.user.has_perm("api.approve_achievements")
        if not (is_owner or is_reviewer or request.user.role == "super_admin"):
            return Response({"ok": False, "error": "Not permitted to attach a proof here."}, status=403)

        upload = request.FILES.get("file")
        if not upload:
            return Response({"ok": False, "error": "No file provided."}, status=400)
        if upload.content_type not in AchievementProof.ALLOWED_CONTENT_TYPES:
            return Response({"ok": False, "error": f"Unsupported file type: {upload.content_type}"}, status=400)
        if upload.size > AchievementProof.MAX_SIZE_BYTES:
            return Response({"ok": False, "error": "File exceeds the 10MB limit."}, status=400)

        proof = AchievementProof.objects.create(
            achievement=achievement,
            file=upload,
            original_name=upload.name[:255],
            content_type=upload.content_type,
            size=upload.size,
            uploaded_by=request.user,
        )
        log_action(request, "achievement_proof_uploaded", target=achievement, new_value={"file": proof.original_name})
        return Response({"ok": True, "proof": AchievementProofSerializer(proof).data}, status=201)

    def delete(self, request, pk, proof_id):
        proof = get_object_or_404(AchievementProof, pk=proof_id, achievement_id=pk)
        is_owner = proof.achievement.member_id == request.user.id and proof.achievement.approval_status == "submitted"
        is_reviewer = request.user.role in ("admin", "super_admin") and request.user.has_perm("api.approve_achievements")
        if not (is_owner or is_reviewer or request.user.role == "super_admin"):
            return Response({"ok": False, "error": "Not permitted to remove this proof."}, status=403)
        proof.file.delete(save=False)
        proof.delete()
        return Response({"ok": True})


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
            notify_admins(
                "income_pending_approval", f"Income pending approval for {member.name}",
                target=achievement, permission_codename="edit_income",
            )

        log_action(request, "achievement_approved", target=achievement)
        notify(member, "achievement_approved", f"Your submission for {goal.name} was approved", target=achievement)
        if goal.points:
            notify(member, "points_received", f"You received {goal.points} points", target=achievement)
        return Response({"ok": True, "achievement": GoalAchievementSerializer(achievement).data})


class AchievementRejectView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("approve_achievements")]

    def post(self, request, pk):
        achievement = get_object_or_404(GoalAchievement, pk=pk)
        reason = str(request.data.get("notes") or "").strip()
        if not reason:
            return Response({"ok": False, "error": "A rejection reason is required."}, status=400)
        achievement.approval_status = "rejected"
        achievement.approved_by = request.user
        achievement.notes = reason
        from django.utils import timezone

        achievement.approved_at = timezone.now()
        achievement.save(update_fields=["approval_status", "approved_by", "notes", "approved_at"])
        log_action(request, "achievement_rejected", target=achievement)
        notify(
            achievement.member, "achievement_rejected", f"Your submission for {achievement.goal.name} was rejected",
            body=achievement.notes, target=achievement,
        )
        return Response({"ok": True, "achievement": GoalAchievementSerializer(achievement).data})


# ---------------------------------------------------------------------------
# Points
# ---------------------------------------------------------------------------


class PointsOverviewView(APIView):
    """GET /api/admin/points/overview/ -- dashboard for the Points section:
    total issued (sum of positive ledger entries), total currently held
    (sum of live member balances), and the most recent transactions
    across all members."""

    permission_classes = [IsAuthenticated, HasPermission("view_points")]

    def get(self, request):
        total_issued = PointsTransaction.objects.filter(points__gt=0).aggregate(s=Sum("points"))["s"] or 0
        total_held = User.objects.aggregate(s=Sum("points_balance"))["s"] or 0
        recent = PointsTransaction.objects.select_related("member", "created_by").order_by("-created_at")[:20]
        return Response({
            "ok": True,
            "total_issued": total_issued,
            "total_held": total_held,
            "recent": PointsTransactionSerializer(recent, many=True).data,
        })


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
        if points > 0:
            notify(member, "points_received", f"You received {points} points", body=reason, target=member)
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
        qs = IncomeRecord.objects.select_related("member", "goal")
        status_filter = request.query_params.get("status")
        member_id = request.query_params.get("member")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if member_id:
            qs = qs.filter(member_id=member_id)

        # Fixed KPI totals -- computed over ALL records regardless of the
        # table's own filter, so the summary cards don't shift as the
        # admin filters the table underneath them.
        totals = {}
        for key, _ in IncomeRecord.STATUS_CHOICES:
            totals[key] = str(IncomeRecord.objects.filter(status=key).aggregate(s=Sum("amount"))["s"] or 0)
        totals["total"] = str(IncomeRecord.objects.aggregate(s=Sum("amount"))["s"] or 0)

        return Response({"ok": True, "totals": totals, **paginate(request, qs, IncomeRecordSerializer)})


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
        if new_status in ("approved", "paid", "rejected"):
            notify(
                record.member, f"income_{new_status}", f"Your income record was marked {new_status}",
                body=record.notes, target=record,
            )
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


# ---------------------------------------------------------------------------
# Messages (contact submissions)
# ---------------------------------------------------------------------------


class MessageListView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("view_messages")]

    def get(self, request):
        qs = ContactSubmission.objects.all()
        search = request.query_params.get("search")
        read_filter = request.query_params.get("is_read")
        archived_filter = request.query_params.get("is_archived", "false")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(email__icontains=search) | Q(message__icontains=search))
        if read_filter in ("true", "false"):
            qs = qs.filter(is_read=(read_filter == "true"))
        if archived_filter in ("true", "false"):
            qs = qs.filter(is_archived=(archived_filter == "true"))
        return Response({"ok": True, **paginate(request, qs, ContactSubmissionSerializer)})


class MessageDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("manage_messages")]

    def patch(self, request, pk):
        """Mark read/unread, archive/unarchive, or record a reply -- whichever
        fields are present in the body."""
        message = get_object_or_404(ContactSubmission, pk=pk)
        fields = []
        if "is_read" in request.data:
            message.is_read = bool(request.data["is_read"])
            fields.append("is_read")
        if "is_archived" in request.data:
            message.is_archived = bool(request.data["is_archived"])
            fields.append("is_archived")
        if request.data.get("admin_reply"):
            from django.utils import timezone

            message.admin_reply = str(request.data["admin_reply"])
            message.replied_at = timezone.now()
            message.replied_by = request.user
            fields += ["admin_reply", "replied_at", "replied_by"]
        if fields:
            message.save(update_fields=fields)
            log_action(request, "message_updated", target=message, new_value={f: str(getattr(message, f)) for f in fields})
        return Response({"ok": True, "message": ContactSubmissionSerializer(message).data})

    def delete(self, request, pk):
        message = get_object_or_404(ContactSubmission, pk=pk)
        log_action(request, "message_deleted", target=message)
        message.delete()
        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Site content (CMS)
# ---------------------------------------------------------------------------


class SiteContentView(APIView):
    """GET is public (site.html reads it with no auth) -- PUT requires
    edit_site_content. `key` identifies the section: 'homepage',
    'achievements', etc."""

    def get_permissions(self):
        if self.request.method == "GET":
            return []
        return [IsAuthenticated(), HasPermission("edit_site_content")()]

    def get(self, request, key):
        content, _ = SiteContent.objects.get_or_create(key=key)
        return Response({"ok": True, "content": SiteContentSerializer(content).data})

    def put(self, request, key):
        content, _ = SiteContent.objects.get_or_create(key=key)
        before = content.data
        content.data = request.data.get("data", {})
        content.updated_by = request.user
        content.save(update_fields=["data", "updated_by", "updated_at"])
        log_action(request, "content_updated", target=content, previous_value={"data": before}, new_value={"data": content.data})
        return Response({"ok": True, "content": SiteContentSerializer(content).data})


class TeamMemberListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), HasPermission("edit_site_content")()]
        return []

    def get(self, request):
        qs = TeamMember.objects.all()
        if not (request.user and request.user.is_authenticated):
            qs = qs.filter(is_active=True)  # public site only sees active members
        return Response({"ok": True, "team": TeamMemberSerializer(qs, many=True).data})

    def post(self, request):
        serializer = TeamMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = serializer.save()
        log_action(request, "content_updated", target=member, new_value=TeamMemberSerializer(member).data)
        return Response({"ok": True, "team_member": TeamMemberSerializer(member).data}, status=201)


class TeamMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("edit_site_content")]

    def patch(self, request, pk):
        member = get_object_or_404(TeamMember, pk=pk)
        before = TeamMemberSerializer(member).data
        serializer = TeamMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        member = serializer.save()
        log_action(request, "content_updated", target=member, previous_value=before, new_value=TeamMemberSerializer(member).data)
        return Response({"ok": True, "team_member": TeamMemberSerializer(member).data})

    def delete(self, request, pk):
        member = get_object_or_404(TeamMember, pk=pk)
        before = TeamMemberSerializer(member).data
        member.delete()
        log_action(request, "content_updated", previous_value=before, new_value={"deleted": True})
        return Response({"ok": True})


class ProductListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), HasPermission("edit_site_content")()]
        return []

    def get(self, request):
        qs = Product.objects.all()
        if not (request.user and request.user.is_authenticated):
            qs = qs.filter(is_active=True)
        return Response({"ok": True, "products": ProductSerializer(qs, many=True).data})

    def post(self, request):
        serializer = ProductSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        log_action(request, "content_updated", target=product, new_value=ProductSerializer(product).data)
        return Response({"ok": True, "product": ProductSerializer(product).data}, status=201)


class ProductDetailView(APIView):
    permission_classes = [IsAuthenticated, HasPermission("edit_site_content")]

    def patch(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        before = ProductSerializer(product).data
        serializer = ProductSerializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        log_action(request, "content_updated", target=product, previous_value=before, new_value=ProductSerializer(product).data)
        return Response({"ok": True, "product": ProductSerializer(product).data})

    def delete(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        before = ProductSerializer(product).data
        product.delete()
        log_action(request, "content_updated", previous_value=before, new_value={"deleted": True})
        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class NotificationListView(APIView):
    """GET /api/notifications/ -- the logged-in user's own notifications
    (admin or member -- everyone reads their own feed, nothing more)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = request.user.notifications.all()
        unread_only = request.query_params.get("unread") == "1"
        if unread_only:
            qs = qs.filter(is_read=False)
        return Response({
            "ok": True,
            "unread_count": request.user.notifications.filter(is_read=False).count(),
            **paginate(request, qs, NotificationSerializer),
        })


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notif = get_object_or_404(Notification, pk=pk, recipient=request.user)
        notif.is_read = True
        notif.save(update_fields=["is_read"])
        return Response({"ok": True})

    def put(self, request):
        # mark-all-read
        request.user.notifications.filter(is_read=False).update(is_read=True)
        return Response({"ok": True})


# ---------------------------------------------------------------------------
# Reports (CSV export)
# ---------------------------------------------------------------------------


class ReportExportView(APIView):
    """GET /api/admin/reports/<kind>/export/ -- streams a CSV for the
    given report kind. Reuses view_reports as the gate for all kinds."""

    permission_classes = [IsAuthenticated, HasPermission("view_reports")]

    KIND_CONFIG = {
        "members": (
            ["Member ID", "Name", "Email", "Mobile", "Sponsor", "Status", "Points", "Joined"],
            lambda: User.objects.select_related("parent").all(),
            lambda m: [m.member_id, m.name, m.email, m.mobile, m.parent.name if m.parent else "", m.status, m.points_balance, m.created_at],
        ),
        "mlm": (
            ["Member ID", "Name", "Sponsor", "Direct Referrals", "Status", "Joined"],
            lambda: User.objects.select_related("parent").all(),
            lambda m: [m.member_id, m.name, m.parent.name if m.parent else "(root)", m.children.count(), m.status, m.created_at],
        ),
        "achievements": (
            ["Member", "Goal", "Progress", "Status", "Submitted", "Approved"],
            lambda: GoalAchievement.objects.select_related("member", "goal").all(),
            lambda a: [a.member.name, a.goal.name, a.progress, a.approval_status, a.submitted_at, a.approved_at or ""],
        ),
        "points": (
            ["Member", "Points", "Reason", "By", "Date"],
            lambda: PointsTransaction.objects.select_related("member", "created_by").all(),
            lambda t: [t.member.name, t.points, t.reason, t.created_by.name if t.created_by else "", t.created_at],
        ),
        "income": (
            ["Member", "Goal", "Amount", "Status", "Created", "Processed"],
            lambda: IncomeRecord.objects.select_related("member", "goal").all(),
            lambda i: [i.member.name, i.goal.name if i.goal else "", i.amount, i.status, i.created_at, i.processed_at or ""],
        ),
    }

    def get(self, request, kind):
        import csv

        from django.http import HttpResponse

        config = self.KIND_CONFIG.get(kind)
        if not config:
            return Response({"ok": False, "error": f"Unknown report kind: {kind}"}, status=404)
        header, queryset_fn, row_fn = config

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{kind}_report.csv"'
        writer = csv.writer(response)
        writer.writerow(header)
        for obj in queryset_fn():
            writer.writerow(row_fn(obj))
        log_action(request, "report_exported", new_value={"kind": kind})
        return response
