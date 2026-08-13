from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """True for admin OR super_admin -- kept for the existing /api/admin/*
    contact/newsletter/users endpoints from the original site, which don't
    need granular per-permission checks."""

    message = "Admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in ("admin", "super_admin"))


class IsSuperAdmin(BasePermission):
    """Only super_admin -- for granting/revoking permissions on other
    admins, and anything else that must not be delegable."""

    message = "Super admin access required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == "super_admin")


def HasPermission(codename):
    """Factory: returns a permission class requiring either super_admin
    (who bypass all granular checks) or an admin explicitly granted
    `codename` (via Django's built-in user_permissions, app_label 'api')."""

    class _HasPermission(BasePermission):
        message = f"Missing permission: {codename}."

        def has_permission(self, request, view):
            user = request.user
            if not (user and user.is_authenticated):
                return False
            if user.role == "super_admin":
                return True
            if user.role != "admin":
                return False
            return user.has_perm(f"api.{codename}")

    return _HasPermission


class IsSelfOrAdmin(BasePermission):
    """For member-facing endpoints scoped by <id> in the URL: the member
    can always see/act on their own record; any admin/super_admin can act
    on anyone's. Used only where there's no finer-grained permission to
    check (kept for MemberPhotoView, which does its own inline permission
    check per HTTP method already)."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role in ("admin", "super_admin"):
            return True
        return obj.id == user.id


def IsSelfOrHasPermission(codename):
    """Factory: the member can always see/act on their own record. An
    admin needs `codename` explicitly granted; a super_admin always
    passes. Use this (not IsSelfOrAdmin) wherever an unprivileged admin
    should NOT get a blanket pass just for holding the 'admin' role."""

    class _IsSelfOrHasPermission(BasePermission):
        message = f"Missing permission: {codename}."

        def has_permission(self, request, view):
            return bool(request.user and request.user.is_authenticated)

        def has_object_permission(self, request, view, obj):
            user = request.user
            if obj.id == user.id:
                return True
            if user.role == "super_admin":
                return True
            if user.role == "admin":
                return user.has_perm(f"api.{codename}")
            return False

    return _IsSelfOrHasPermission
