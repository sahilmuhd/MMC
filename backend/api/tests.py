"""
Covers: registration/auth (pre-existing), member hierarchy, goal creation,
achievement submit -> approve -> points/income, granular permissions,
member deactivation, and audit logging.

Run with: python manage.py test
"""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog, Goal, GoalAchievement, IncomeRecord, PointsTransaction, User


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
