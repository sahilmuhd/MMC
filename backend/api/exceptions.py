from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.exceptions import Throttled


def exception_handler(exc, context):
    """Reshapes DRF's default {"detail": "..."} error bodies into the
    {"ok": false, "error": "..."} shape the original Express routes used,
    so the existing frontend (auth.js / admin.js / script.js) needs no
    changes at all."""
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, Throttled):
        message = "Too many attempts. Please try again later."
    else:
        detail = response.data.get("detail") if isinstance(response.data, dict) else None
        message = str(detail) if detail is not None else "Something went wrong."

    response.data = {"ok": False, "error": message}
    return response
