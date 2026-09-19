"""The custom user — email-based (Part 21 §21.3.1, ADR-011 as amended by DEC-010).

**What changed and why.** Sprint 1 shipped mobile as the login identifier. The
owner's decision for MVP is email plus password: this product runs locally for
one person first, with as few third-party dependencies as the feature set
allows, and a mobile identifier is an identifier nobody can prove without a
telecom provider. So `email` becomes the unique, required login identifier and
`mobile` becomes an optional profile field.

`mobile` is **kept, not dropped**. Parties, invoices, invitations and the
WhatsApp and SMS channels all want a merchant's number, and `PLT-05`'s
invitation flow still matches on it. It simply stops being how a person signs
in. It keeps its E.164 validation and it keeps a unique index *where it is not
null*, because two `platform_user` rows sharing a number would make invitation
matching ambiguous — see `NOTES-FOR-REVIEW.md`.
"""

from __future__ import annotations

from typing import Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel


class UserManager(BaseUserManager):
    """Email, not username and no longer mobile, is the natural key (DEC-010)."""

    use_in_migrations = True

    def _normalise(self, email: str | None) -> str:
        """Trim and lower-case. The one spelling that reaches the unique index.

        `BaseUserManager.normalize_email` lower-cases only the domain, which
        would let `Ramesh@x.com` and `ramesh@x.com` be two accounts. See
        `apps.platform_app.email` for why that is refused.
        """
        return (email or "").strip().lower()

    def create_user(self, email: str, password: str | None = None, **extra: Any) -> "User":
        email = self._normalise(email)
        if not email:
            raise ValueError("A user must have an email address.")
        mobile = extra.pop("mobile", None) or None
        user = self.model(email=email, mobile=mobile, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra: Any) -> "User":
        extra.setdefault("is_super_admin", True)
        extra.setdefault("is_active", True)
        extra.setdefault("full_name", email)
        return self.create_user(email, password, **extra)

    def get_by_natural_key(self, username: str | None) -> "User":
        """`manage.py` and Django's own machinery look users up through this."""
        return self.get(email=self._normalise(username))


class User(AbstractBaseUser, TimeStampedModel):
    """A person. A user may be a member of several tenants (canon §0.2)."""

    id = uuid7_pk()
    email = models.EmailField(max_length=254, unique=True)
    mobile = models.CharField(max_length=15, null=True, blank=True)  # E.164, `+91XXXXXXXXXX`
    full_name = models.CharField(max_length=120)
    locale = models.CharField(max_length=8, default="en")
    is_super_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    mfa_secret = models.CharField(max_length=64, null=True, blank=True)
    token_epoch = models.IntegerField(default=1)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    objects = UserManager()

    class Meta:
        db_table = "platform_user"
        verbose_name = "user"
        verbose_name_plural = "users"
        constraints = [
            models.UniqueConstraint(
                fields=["mobile"],
                condition=models.Q(mobile__isnull=False),
                name="uq_user_mobile_notnull",
            ),
        ]
        indexes = [
            models.Index(fields=["is_super_admin"], name="ix_user_superadmin"),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} <{self.email}>"

    @property
    def is_email_verified(self) -> bool:
        """Never a login gate at MVP — see `services/auth.py` and the notes."""
        return self.email_verified_at is not None

    @property
    def is_staff(self) -> bool:
        """Django admin gate. Zero queries (Part 26 §26.3 R3.7)."""
        return self.is_super_admin

    @property
    def is_superuser(self) -> bool:
        return self.is_super_admin

    def has_perm(self, perm: str, obj: Any = None) -> bool:
        """Django's own permission framework is unused; canon §0.9 is the authority."""
        return self.is_super_admin

    def has_module_perms(self, app_label: str) -> bool:
        return self.is_super_admin
