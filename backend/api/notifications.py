from .models import Notification


def notify(recipient, event, title, *, body="", target=None):
    """Creates one Notification row. `recipient` is a User instance (or
    None, in which case this is a no-op -- callers may not always have a
    resolvable recipient, e.g. a deleted sponsor)."""
    if recipient is None:
        return None
    return Notification.objects.create(
        recipient=recipient,
        event=event,
        title=title,
        body=body,
        target_model=target.__class__.__name__ if target is not None else "",
        target_id=str(getattr(target, "pk", "")) if target is not None else "",
    )


def notify_admins(event, title, *, body="", target=None, permission_codename=None):
    """Notifies every admin/super_admin, optionally restricted to admins
    holding a specific permission codename (super admins always notified)."""
    from .models import User

    qs = User.objects.filter(role__in=("admin", "super_admin"), is_active=True)
    recipients = []
    for user in qs:
        if user.role == "super_admin":
            recipients.append(user)
        elif permission_codename is None or user.has_perm(f"api.{permission_codename}"):
            recipients.append(user)

    Notification.objects.bulk_create([
        Notification(
            recipient=user,
            event=event,
            title=title,
            body=body,
            target_model=target.__class__.__name__ if target is not None else "",
            target_id=str(getattr(target, "pk", "")) if target is not None else "",
        )
        for user in recipients
    ])
