from django.urls import path

from . import membership_views as mv
from . import views

urlpatterns = [
    path("health", views.HealthView.as_view()),
    path("contact", views.ContactView.as_view()),
    path("newsletter", views.NewsletterView.as_view()),
    path("auth/register", views.RegisterView.as_view()),
    path("auth/login", views.LoginView.as_view()),
    path("auth/me", views.MeView.as_view()),
    path("auth/forgot-password", views.ForgotPasswordView.as_view()),
    path("auth/reset-password", views.ResetPasswordView.as_view()),

    # Original site admin endpoints (contact/newsletter/users) -- unchanged.
    path("admin/contacts", views.AdminContactsView.as_view()),
    path("admin/newsletter", views.AdminNewsletterView.as_view()),
    path("admin/users", views.AdminUsersView.as_view()),
    path("admin/summary", views.AdminSummaryView.as_view()),

    # --- Membership system ---

    # Members (admin management)
    path("admin/members/", mv.MemberListCreateView.as_view()),
    path("admin/members/<int:pk>/", mv.MemberDetailView.as_view()),
    path("admin/members/<int:pk>/deactivate/", mv.MemberDeactivateView.as_view()),
    path("admin/members/<int:pk>/reactivate/", mv.MemberReactivateView.as_view()),
    path("admin/members/<int:pk>/reassign-sponsor/", mv.SponsorReassignView.as_view()),
    path("admin/members/<int:pk>/ancestors/", mv.MemberAncestorsView.as_view()),

    # Hierarchy (self or admin)
    path("members/<int:pk>/hierarchy/", mv.MemberHierarchyView.as_view()),

    # Photos (self or admin with permission)
    path("members/<int:pk>/photo/", mv.MemberPhotoView.as_view()),

    # Goals
    path("goals/", mv.GoalListCreateView.as_view()),
    path("goals/<int:pk>/", mv.GoalDetailView.as_view()),
    path("goals/<int:pk>/achievements/", mv.AchievementSubmitView.as_view()),

    # Achievements
    path("achievements/", mv.AchievementListView.as_view()),
    path("achievements/<int:pk>/proofs/", mv.AchievementProofUploadView.as_view()),
    path("achievements/<int:pk>/proofs/<int:proof_id>/", mv.AchievementProofUploadView.as_view()),
    path("admin/achievements/<int:pk>/approve/", mv.AchievementApproveView.as_view()),
    path("admin/achievements/<int:pk>/reject/", mv.AchievementRejectView.as_view()),

    # Points
    path("admin/points/overview/", mv.PointsOverviewView.as_view()),
    path("admin/points/adjust/", mv.PointsAdjustView.as_view()),
    path("members/<int:pk>/points/history/", mv.PointsHistoryView.as_view()),

    # Income
    path("admin/income/", mv.IncomeListView.as_view()),
    path("admin/income/<int:pk>/", mv.IncomeUpdateStatusView.as_view()),
    path("members/<int:pk>/income/history/", mv.IncomeHistoryView.as_view()),

    # Admin dashboard
    path("admin/dashboard/summary/", mv.AdminDashboardView.as_view()),

    # Permissions (super admin)
    path("admin/permissions/", mv.PermissionListView.as_view()),
    path("admin/permissions/assign/", mv.PermissionAssignView.as_view()),

    # Audit log
    path("admin/audit-logs/", mv.AuditLogListView.as_view()),

    # Messages (contact submissions -- admin management)
    path("admin/messages/", mv.MessageListView.as_view()),
    path("admin/messages/<int:pk>/", mv.MessageDetailView.as_view()),

    # Site content (CMS) -- GET public, PUT/POST/PATCH/DELETE admin-gated
    path("content/<str:key>/", mv.SiteContentView.as_view()),
    path("team/", mv.TeamMemberListCreateView.as_view()),
    path("team/<int:pk>/", mv.TeamMemberDetailView.as_view()),
    path("products/", mv.ProductListCreateView.as_view()),
    path("products/<int:pk>/", mv.ProductDetailView.as_view()),
    path("products/<int:pk>/images/", mv.ProductImageUploadView.as_view()),

    # Notifications
    path("notifications/", mv.NotificationListView.as_view()),
    path("notifications/mark-all-read/", mv.NotificationMarkReadView.as_view()),
    path("notifications/<int:pk>/read/", mv.NotificationMarkReadView.as_view()),

    # Reports export
    path("admin/reports/<str:kind>/export/", mv.ReportExportView.as_view()),
]
