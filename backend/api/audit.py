from .models import AuditLog
from .validators import client_ip


def log_action(request, action, *, target=None, previous_value=None, new_value=None):
    """Records one audit entry. `target` is any model instance (or None for
    account-level actions) -- its class name and pk are stored so the log
    reads sensibly without holding a hard FK to every possible table."""
    actor = getattr(request, "user", None)
    if actor is not None and not getattr(actor, "is_authenticated", False):
        actor = None

    AuditLog.objects.create(
        actor=actor,
        action=action,
        target_model=target.__class__.__name__ if target is not None else "",
        target_id=str(getattr(target, "pk", "")) if target is not None else "",
        previous_value=previous_value,
        new_value=new_value,
        ip_address=client_ip(request),
    )
