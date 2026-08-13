"""Email sending is OPTIONAL, same as the old mailer.js. If SMTP env vars
aren't set, the app still works — submissions just get stored in the
database and email is skipped. Fill in .env (copy from .env.example) to
enable real delivery."""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape as escape_html

from django.conf import settings

logger = logging.getLogger("api.mailer")

HAS_SMTP_CONFIG = bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASS)


def _send(*, to, subject, text, html):
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.SMTP_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    # Short timeouts so an unreachable/misconfigured SMTP host fails fast
    # instead of hanging the contact/newsletter/forgot-password request that
    # triggered it — same reasoning as the connectionTimeout/greetingTimeout/
    # socketTimeout options in the old mailer.js.
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.SMTP_USER, [to], msg.as_string())


def send_contact_notification(*, name, email, phone, message):
    if not HAS_SMTP_CONFIG:
        logger.info("[mailer] SMTP not configured — skipping email, submission was still saved to DB.")
        return {"sent": False}

    to = settings.CONTACT_TO_EMAIL or settings.SMTP_USER
    text = f"Name: {name}\nEmail: {email}\nPhone: {phone}\n\nMessage:\n{message}"
    html = f"""
      <h2>New contact inquiry</h2>
      <p><strong>Name:</strong> {escape_html(name)}</p>
      <p><strong>Email:</strong> {escape_html(email)}</p>
      <p><strong>Phone:</strong> {escape_html(phone)}</p>
      <p><strong>Message:</strong></p>
      <p>{escape_html(message).replace(chr(10), '<br>')}</p>
    """
    _send(to=to, subject=f"New inquiry from {name}", text=text, html=html)
    return {"sent": True}


def send_newsletter_confirmation(email):
    if not HAS_SMTP_CONFIG:
        logger.info("[mailer] SMTP not configured — skipping email, subscriber was still saved to DB.")
        return {"sent": False}

    _send(
        to=email,
        subject="You're on the list",
        text="Thanks for subscribing to MMC updates. You'll hear from us about once a month.",
        html="<p>Thanks for subscribing to MMC updates. You'll hear from us about once a month.</p>",
    )
    return {"sent": True}


def send_password_reset_email(email, reset_link):
    if not HAS_SMTP_CONFIG:
        # No SMTP configured — this is the one email that MUST be visible
        # somewhere even without email set up, or password reset is
        # untestable locally. Print it plainly so it's easy to copy/paste.
        logger.info("=" * 60)
        logger.info("[mailer] Password reset requested for %s", email)
        logger.info("[mailer] SMTP not configured — copy this link manually:")
        logger.info(reset_link)
        logger.info("=" * 60)
        return {"sent": False}

    text = (
        "Someone requested a password reset for this account. "
        f"If this was you, use this link within 1 hour:\n\n{reset_link}\n\n"
        "If you didn't request this, you can safely ignore this email."
    )
    html = f"""
      <p>Someone requested a password reset for this account.</p>
      <p>If this was you, click below within the next hour:</p>
      <p><a href="{reset_link}">{reset_link}</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    """
    _send(to=email, subject="Reset your MMC password", text=text, html=html)
    return {"sent": True}
