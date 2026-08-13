from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    # Django's own built-in admin site (separate from the /api/admin/*
    # dashboard endpoints the frontend's admin.html talks to).
    path("django-admin/", admin.site.urls),
    path("api/", include("api.urls")),
]

if settings.DEBUG:
    # Serves member_photos/ locally. In production this is handled by
    # whatever storage backend/CDN MEDIA_ROOT points to instead.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


def _not_found(request, exception=None):
    # Fallback 404 for anything else -- matches server.js's catch-all JSON
    # 404 handler, since this backend serves no static assets/pages itself.
    return JsonResponse({"ok": False, "error": "Not found"}, status=404)


handler404 = _not_found
