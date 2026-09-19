"""The custom user — mobile-based (Part 21 §21.3.1, ADR-011)."""

from __future__ import annotations

from typing import Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel


class UserManager(BaseUserManager):
    """Mobile, not username, is the natural key (ADR-011)."""

    use_in_migrations = True

    def create_user(self, mobile: str, password: str | None = None, **extra: Any) -> "User":
        if not mobile:
            raise ValueError("A user must have a mobile number.")
        user = self.model(mobile=mobile, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, mobile: str, password: str | None = None, **extra: Any) -> "User":
        extra.setdefault("is_super_admin", True)
        extra.setdefault("is_active", True)
        extra.setdefault("full_name", mobile)
        return self.create_user(mobile, password, **extra)


class User(AbstractBaseUser, TimeStampedModel):
    """A person. A user may be a member of several tenants (canon §0.2)."""

    id = uuid7_pk()
    mobile = models.CharField(max_length=15, unique=True)  # E.164, `+91XXXXXXXXXX`
    email = models.EmailField(max_length=254, null=True, blank=True)
    full_name = models.CharField(max_length=120)
    locale = models.CharField(max_length=8, default="en")
    is_super_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    mfa_secret = models.CharField(max_length=64, null=True, blank=True)
    token_epoch = models.IntegerField(default=1)

    USERNAME_FIELD = "mobile"
    REQUIRED_FIELDS = ["full_name"]

    objects = UserManager()

    class Meta:
        db_table = "platform_user"
        verbose_name = "user"
        verbose_name_plural = "users"
        constraints = [
            models.UniqueConstraint(
                fields=["email"],
                condition=models.Q(email__isnull=False),
                name="uq_user_email_notnull",
            ),
        ]
        indexes = [
            models.Index(fields=["is_super_admin"], name="ix_user_superadmin"),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} <{self.mobile}>"

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
