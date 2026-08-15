"""
Covers: registration/auth (pre-existing), member hierarchy, goal creation,
achievement submit -> approve -> points/income, granular permissions,
member deactivation, and audit logging.

Also covers (Phase 1-6 additions): admin-created members with a sponsor
set at creation, sponsor reassignment (including the circular-reference
guard), member deletion guarded by downline, achievement proof uploads,
CSV report export, contact-message management, and notifications.

Run with: python manage.py test
"""

from django.contrib.auth.models import Permission
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    AuditLog,
    ContactSubmission,
    Goal,
    GoalAchievement,
    IncomeRecord,
    Notification,
    PointsTransaction,
    User,
)


class AuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_register_and_login(self):
        resp = self.client.post(
            "/api/auth/register",
            {"name": "Test User", "email": "test@example.com", "password": "testpass1"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["user"]["member_id"].startswith("MMC"))

        resp = self.client.post(
            "/api/auth/login", {"email": "test@example.com", "password": "testpass1"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("token", resp.data)


class MembershipTestCase(TestCase):
    """Base with a super admin, a plain admin (no perms), and a two-level
    hierarchy of members already created."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.super_admin = User.objects.create_superuser(
            email="super@example.com", name="Super", password="superpass1"
        )
        self.admin = User.objects.create_user(email="admin@example.com", name="Admin", password="adminpass1")
        self.admin.role = "admin"
        self.admin.save()

        self.alice = User.objects.create_user(email="alice@example.com", name="Alice", password="pass12345")
        self.bob = User.objects.create_user(
            email="bob@example.com", name="Bob", password="pass12345", parent=self.alice
        )

        self.goal = Goal.objects.create(name="Test goal", target=5, points=50, income_amount=250, created_by=self.super_admin)

    def auth(self, user):
        client = APIClient()
        resp = client.post("/api/auth/login", {"email": user.email, "password": self._password_for(user)}, format="json")
        token = resp.data["token"]
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return client

    def _password_for(self, user):
        return {
            self.super_admin.email: "superpass1",
            self.admin.email: "adminpass1",
            self.alice.email: "pass12345",
            self.bob.email: "pass12345",
        }[user.email]

    def grant(self, user, *codenames):
        """Directly grants permission codenames to a user via the ORM --
        used in setup for tests that aren't specifically exercising the
        grant/revoke endpoint itself."""
        perms = Permission.objects.filter(codename__in=codenames, content_type__app_label="api")
        user.user_permissions.add(*perms)


class HierarchyTests(MembershipTestCase):
    def test_self_can_view_own_hierarchy(self):
        client = self.auth(self.alice)
        resp = client.get(f"/api/members/{self.alice.id}/hierarchy/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["tree"]["children"]), 1)
        self.assertEqual(resp.data["tree"]["children"][0]["id"], self.bob.id)
        self.assertEqual(resp.data["tree"]["children"][0]["level"], 1)

    def test_member_cannot_view_someone_elses_hierarchy(self):
        client = self.auth(self.bob)
        resp = client.get(f"/api/members/{self.alice.id}/hierarchy/")
        self.assertEqual(resp.status_code, 403)

    def test_admin_without_permission_cannot_view_any_hierarchy(self):
        client = self.auth(self.admin)
        resp = client.get(f"/api/members/{self.alice.id}/hierarchy/")
        self.assertEqual(resp.status_code, 403)


class GoalAchievementFlowTests(MembershipTestCase):
    def test_member_cannot_create_goal(self):
        client = self.auth(self.bob)
        resp = client.post("/api/goals/", {"name": "hack", "target": 1}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_full_achievement_to_points_and_income_flow(self):
        member_client = self.auth(self.bob)
        resp = member_client.post(f"/api/goals/{self.goal.id}/achievements/", {"progress": 5}, format="json")
        self.assertEqual(resp.status_code, 201)
        achievement_id = resp.data["achievement"]["id"]
        self.assertEqual(resp.data["achievement"]["approval_status"], "submitted")

        # Member can't approve their own achievement.
        resp = member_client.post(f"/api/admin/achievements/{achievement_id}/approve/")
        self.assertEqual(resp.status_code, 403)

        admin_client = self.auth(self.super_admin)
        resp = admin_client.post(f"/api/admin/achievements/{achievement_id}/approve/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["achievement"]["approval_status"], "approved")

        self.bob.refresh_from_db()
        self.assertEqual(self.bob.points_balance, 50)
        self.assertEqual(PointsTransaction.objects.filter(member=self.bob).count(), 1)
        self.assertEqual(IncomeRecord.objects.filter(member=self.bob, status="pending").count(), 1)

        # Approving twice must not double-award points.
        resp = admin_client.post(f"/api/admin/achievements/{achievement_id}/approve/")
        self.assertEqual(resp.status_code, 400)
        self.bob.refresh_from_db()
        self.assertEqual(self.bob.points_balance, 50)

    def test_income_status_change_requires_permission(self):
        member_client = self.auth(self.bob)
        resp = member_client.post(f"/api/goals/{self.goal.id}/achievements/", {"progress": 5}, format="json")
        achievement_id = resp.data["achievement"]["id"]
        admin_client = self.auth(self.super_admin)
        admin_client.post(f"/api/admin/achievements/{achievement_id}/approve/")
        income_id = IncomeRecord.objects.get(member=self.bob).id

        # bob (ordinary member) can never touch income status.
        resp = member_client.patch(f"/api/admin/income/{income_id}/", {"status": "paid"}, format="json")
        self.assertEqual(resp.status_code, 403)

        resp = admin_client.patch(f"/api/admin/income/{income_id}/", {"status": "paid"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["income"]["status"], "paid")


class PermissionTests(MembershipTestCase):
    def test_granting_and_revoking_permission(self):
        super_client = self.auth(self.super_admin)
        admin_client = self.auth(self.admin)

        resp = admin_client.get("/api/admin/members/")
        self.assertEqual(resp.status_code, 403)

        resp = super_client.post(
            "/api/admin/permissions/assign/",
            {"member": self.admin.id, "codename": "view_members", "action": "grant"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        resp = admin_client.get("/api/admin/members/")
        self.assertEqual(resp.status_code, 200)

        super_client.post(
            "/api/admin/permissions/assign/",
            {"member": self.admin.id, "codename": "view_members", "action": "revoke"},
            format="json",
        )
        resp = admin_client.get("/api/admin/members/")
        self.assertEqual(resp.status_code, 403)

    def test_admin_cannot_assign_permissions(self):
        admin_client = self.auth(self.admin)
        resp = admin_client.post(
            "/api/admin/permissions/assign/",
            {"member": self.bob.id, "codename": "add_members", "action": "grant"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_only_super_admin_can_change_role(self):
        super_client = self.auth(self.super_admin)
        resp = super_client.patch(f"/api/admin/members/{self.bob.id}/", {"role": "admin"}, format="json")
        # super_admin doesn't have view_members/edit_members granted explicitly
        # but bypasses all HasPermission checks -- should succeed.
        self.assertEqual(resp.status_code, 200)
        self.bob.refresh_from_db()
        self.assertEqual(self.bob.role, "admin")


class MemberDeactivationTests(MembershipTestCase):
    def test_deactivated_member_cannot_log_in(self):
        super_client = self.auth(self.super_admin)
        resp = super_client.post(f"/api/admin/members/{self.bob.id}/deactivate/")
        self.assertEqual(resp.status_code, 200)

        self.bob.refresh_from_db()
        self.assertEqual(self.bob.status, "inactive")
        self.assertFalse(self.bob.is_active)

        resp = self.client.post("/api/auth/login", {"email": self.bob.email, "password": "pass12345"}, format="json")
        # Django's default authentication backend rejects inactive users.
        self.assertIn(resp.status_code, (401, 403))

    def test_reactivation_restores_login(self):
        super_client = self.auth(self.super_admin)
        super_client.post(f"/api/admin/members/{self.bob.id}/deactivate/")
        super_client.post(f"/api/admin/members/{self.bob.id}/reactivate/")
        self.bob.refresh_from_db()
        self.assertEqual(self.bob.status, "active")
        self.assertTrue(self.bob.is_active)


class AuditLogTests(MembershipTestCase):
    def test_actions_are_logged(self):
        super_client = self.auth(self.super_admin)
        super_client.post(f"/api/admin/members/{self.bob.id}/deactivate/")
        self.assertTrue(AuditLog.objects.filter(action="member_deactivated", target_id=str(self.bob.id)).exists())

    def test_only_permitted_admin_can_view_audit_log(self):
        admin_client = self.auth(self.admin)
        resp = admin_client.get("/api/admin/audit-logs/")
        self.assertEqual(resp.status_code, 403)


# ---------------------------------------------------------------------------
# Phase 1-6 additions
# ---------------------------------------------------------------------------


class AdminMemberCreationTests(MembershipTestCase):
    """Test 1 & Test 2 from the spec's test plan: create a member, and
    assign a sponsor (here, at creation time)."""

    def test_admin_creates_member_with_sponsor(self):
        self.grant(self.admin, "add_members", "view_members")
        client = self.auth(self.admin)
        resp = client.post(
            "/api/admin/members/",
            {"name": "Carol", "email": "carol@example.com", "password": "carolpass1", "parent": self.alice.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        carol = User.objects.get(email="carol@example.com")
        self.assertEqual(carol.parent_id, self.alice.id)

    def test_new_member_appears_in_sponsor_hierarchy(self):
        # Test 3: verify member appears in the MLM flow chart -- i.e. the
        # hierarchy endpoint reflects the new sponsor relationship.
        self.grant(self.admin, "add_members", "view_hierarchy")
        client = self.auth(self.admin)
        client.post(
            "/api/admin/members/",
            {"name": "Carol", "email": "carol@example.com", "password": "carolpass1", "parent": self.alice.id},
            format="json",
        )
        resp = client.get(f"/api/members/{self.alice.id}/hierarchy/?depth=1")
        self.assertEqual(resp.status_code, 200)
        child_ids = [c["id"] for c in resp.data["tree"]["children"]]
        self.assertIn(User.objects.get(email="carol@example.com").id, child_ids)


class AdminGoalCreationTests(MembershipTestCase):
    def test_admin_with_permission_can_create_goal(self):
        # Test 4: create goal.
        self.grant(self.admin, "create_goals")
        client = self.auth(self.admin)
        resp = client.post(
            "/api/goals/",
            {"name": "Recruit 3", "target": 3, "points": 30, "income_amount": 100},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["goal"]["status"], "active")


class SponsorReassignmentTests(MembershipTestCase):
    """Test 15: sponsor reassignment updates the network, plus the
    circular-reference guard the spec explicitly calls for (§11/§23)."""

    def setUp(self):
        super().setUp()
        self.carol = User.objects.create_user(
            email="carol@example.com", name="Carol", password="pass12345", parent=self.bob
        )
        self.grant(self.admin, "edit_hierarchy")

    def test_happy_path_reassignment(self):
        client = self.auth(self.admin)
        resp = client.post(f"/api/admin/members/{self.carol.id}/reassign-sponsor/", {"sponsor_id": self.alice.id}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.carol.refresh_from_db()
        self.assertEqual(self.carol.parent_id, self.alice.id)
        self.assertTrue(AuditLog.objects.filter(action="sponsor_reassigned", target_id=str(self.carol.id)).exists())
        # And a notification was sent to the member whose sponsor changed.
        self.assertTrue(Notification.objects.filter(recipient=self.carol, event="sponsor_reassigned").exists())

    def test_cannot_sponsor_self(self):
        client = self.auth(self.admin)
        resp = client.post(f"/api/admin/members/{self.alice.id}/reassign-sponsor/", {"sponsor_id": self.alice.id}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_cannot_create_circular_relationship(self):
        # alice -> bob -> carol currently. Trying to make alice's sponsor
        # be carol (her own descendant) must be rejected.
        client = self.auth(self.admin)
        resp = client.post(f"/api/admin/members/{self.alice.id}/reassign-sponsor/", {"sponsor_id": self.carol.id}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.alice.refresh_from_db()
        self.assertIsNone(self.alice.parent)  # unchanged

    def test_member_without_edit_hierarchy_cannot_reassign(self):
        member_client = self.auth(self.bob)
        resp = member_client.post(f"/api/admin/members/{self.carol.id}/reassign-sponsor/", {"sponsor_id": self.alice.id}, format="json")
        self.assertEqual(resp.status_code, 403)


class MemberDeletionTests(MembershipTestCase):
    def test_cannot_delete_member_with_downline(self):
        self.grant(self.admin, "remove_members")
        client = self.auth(self.admin)
        resp = client.delete(f"/api/admin/members/{self.alice.id}/")  # alice sponsors bob
        self.assertEqual(resp.status_code, 409)
        self.assertTrue(User.objects.filter(pk=self.alice.id).exists())

    def test_can_delete_leaf_member(self):
        self.grant(self.admin, "remove_members")
        client = self.auth(self.admin)
        resp = client.delete(f"/api/admin/members/{self.bob.id}/")  # bob has no downline
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(User.objects.filter(pk=self.bob.id).exists())


class AchievementProofTests(MembershipTestCase):
    def _submit(self, client):
        resp = client.post(f"/api/goals/{self.goal.id}/achievements/", {"progress": 5}, format="json")
        return resp.data["achievement"]["id"]

    def test_owner_can_upload_valid_proof(self):
        client = self.auth(self.bob)
        achievement_id = self._submit(client)
        upload = SimpleUploadedFile("proof.png", b"not-really-a-png-but-fine-for-content-type-check", content_type="image/png")
        resp = client.post(f"/api/achievements/{achievement_id}/proofs/", {"file": upload}, format="multipart")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["proof"]["original_name"], "proof.png")

    def test_unsupported_file_type_rejected(self):
        client = self.auth(self.bob)
        achievement_id = self._submit(client)
        upload = SimpleUploadedFile("virus.exe", b"MZ...", content_type="application/x-msdownload")
        resp = client.post(f"/api/achievements/{achievement_id}/proofs/", {"file": upload}, format="multipart")
        self.assertEqual(resp.status_code, 400)

    def test_stranger_cannot_upload_proof(self):
        owner_client = self.auth(self.bob)
        achievement_id = self._submit(owner_client)
        # alice isn't the achievement's owner and isn't an admin.
        stranger_client = self.auth(self.alice)
        upload = SimpleUploadedFile("proof.png", b"x", content_type="image/png")
        resp = stranger_client.post(f"/api/achievements/{achievement_id}/proofs/", {"file": upload}, format="multipart")
        self.assertEqual(resp.status_code, 403)


class ReportExportTests(MembershipTestCase):
    def test_export_requires_permission(self):
        client = self.auth(self.admin)
        resp = client.get("/api/admin/reports/members/export/")
        self.assertEqual(resp.status_code, 403)

    def test_export_returns_csv(self):
        self.grant(self.admin, "view_reports")
        client = self.auth(self.admin)
        resp = client.get("/api/admin/reports/members/export/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "text/csv")
        self.assertIn(b"Member ID", resp.content)

    def test_unknown_report_kind_404s(self):
        self.grant(self.admin, "view_reports")
        client = self.auth(self.admin)
        resp = client.get("/api/admin/reports/not-a-real-kind/export/")
        self.assertEqual(resp.status_code, 404)


class MessageManagementTests(MembershipTestCase):
    def setUp(self):
        super().setUp()
        self.message = ContactSubmission.objects.create(
            name="Prospect", email="prospect@example.com", phone="000", message="Interested in joining."
        )

    def test_requires_view_messages_permission(self):
        client = self.auth(self.admin)
        resp = client.get("/api/admin/messages/")
        self.assertEqual(resp.status_code, 403)

    def test_mark_read_and_reply(self):
        self.grant(self.admin, "view_messages", "manage_messages")
        client = self.auth(self.admin)
        resp = client.patch(f"/api/admin/messages/{self.message.id}/", {"is_read": True, "admin_reply": "Thanks, we'll be in touch."}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.message.refresh_from_db()
        self.assertTrue(self.message.is_read)
        self.assertEqual(self.message.admin_reply, "Thanks, we'll be in touch.")
        self.assertIsNotNone(self.message.replied_at)


class NotificationTests(MembershipTestCase):
    def test_member_notified_on_achievement_approval(self):
        member_client = self.auth(self.bob)
        resp = member_client.post(f"/api/goals/{self.goal.id}/achievements/", {"progress": 5}, format="json")
        achievement_id = resp.data["achievement"]["id"]

        admin_client = self.auth(self.super_admin)
        admin_client.post(f"/api/admin/achievements/{achievement_id}/approve/")

        self.assertTrue(Notification.objects.filter(recipient=self.bob, event="achievement_approved").exists())

    def test_mark_all_read(self):
        Notification.objects.create(recipient=self.bob, event="system", title="Hello")
        Notification.objects.create(recipient=self.bob, event="system", title="World")
        client = self.auth(self.bob)
        resp = client.get("/api/notifications/?unread=1")
        self.assertEqual(resp.data["total"], 2)

        resp = client.put("/api/notifications/mark-all-read/", {}, format="json")
        self.assertEqual(resp.status_code, 200)
        resp = client.get("/api/notifications/?unread=1")
        self.assertEqual(resp.data["total"], 0)
