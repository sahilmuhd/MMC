import re

from rest_framework.throttling import SimpleRateThrottle

_RATE_RE = re.compile(r"^(\d+)/(\d*)([smhd])$")
_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


class _WindowedIPThrottle(SimpleRateThrottle):
    """Base for all our rate limits. DRF's built-in parse_rate() only
    understands whole-unit windows ('5/m', '100/d'); express-rate-limit's
    windowMs let the original use arbitrary windows like 15 minutes, so we
    extend the format to accept an optional count before the unit, e.g.
    '5/15m' == 5 requests per 15 minutes. Throttled purely by client IP,
    same as express-rate-limit's default keyGenerator."""

    def parse_rate(self, rate):
        if rate is None:
            return (None, None)
        match = _RATE_RE.match(rate)
        if not match:
            return super().parse_rate(rate)
        num, count, unit = match.groups()
        multiplier = int(count) if count else 1
        return (int(num), multiplier * _UNIT_SECONDS[unit])

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class GlobalRateThrottle(_WindowedIPThrottle):
    """Floor beneath every route — mirrors the unscoped
    `rateLimit({ windowMs: 60_000, max: 60 })` in server.js."""

    scope = "global"


class ContactRateThrottle(_WindowedIPThrottle):
    scope = "contact"


class NewsletterRateThrottle(_WindowedIPThrottle):
    scope = "newsletter"


class AuthRateThrottle(_WindowedIPThrottle):
    scope = "auth"


class ResetRateThrottle(_WindowedIPThrottle):
    scope = "reset"
