"""`platform_rate_limit` — durable throttle counters (Part 27 §27.4.1).

Part 27 §27.4.1 is explicit and normative about where throttle state lives:

> The lockout is stored as a counter row keyed on the mobile hash, not in a
> memory cache, because there is no shared cache (ADR-012) and a per-process
> counter is trivially bypassed across gunicorn workers. **This is a normative
> implementation detail:** throttle state that must be correct lives in
> PostgreSQL (`platform_rate_limit` counter rows with a `window_start`), not in
> `LocMemCache`.

Part 21 §21.3 — which canon §0.12 T-08 makes the owner of table definitions —
does not define this table, and Part 22 §22.1.4 lists the *string*
`platform_rate_limit` in its table of non-canonical **error-code** spellings.
Neither of those retires the security requirement, so the table is built here to
Part 27's description and `CR-LOG` carries the request that Part 21 §21.3.1
register it. See `NOTES-FOR-REVIEW.md`.

The key is never a raw mobile number: `services/throttle.py` stores
`sha256(identifier)` so a database dump is not a phone book (Part 27 §27.7.3).
"""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel


class RateLimit(TimeStampedModel):
    """One row per (scope, key). The row *is* the counter and the lockout."""

    id = uuid7_pk()
    scope = models.CharField(max_length=32)
    key = models.CharField(max_length=64)  # sha256 hex of the identifier
    window_start = models.DateTimeField()
    count = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_hit_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "platform_rate_limit"
        verbose_name = "rate limit counter"
        verbose_name_plural = "rate limit counters"
        constraints = [
            models.UniqueConstraint(fields=["scope", "key"], name="uq_rate_limit_scope_key"),
            models.CheckConstraint(condition=models.Q(count__gte=0), name="ck_rate_limit_count"),
        ]
        indexes = [
            models.Index(fields=["window_start"], name="ix_rate_limit_window"),
        ]

    def __str__(self) -> str:
        return f"{self.scope}:{self.key[:8]}"
