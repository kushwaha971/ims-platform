"""factory-boy factories for the platform app (Part 26 §26.15 R15.3).

Factories, not fixture files: a fixture file drifts from the schema silently,
a factory fails to build.
"""

from __future__ import annotations

import datetime as dt

import factory
from django.utils import timezone

from apps.common.constants import RoleCode
from apps.common.db.fields import uuid7
from apps.common.permissions_registry import ROLE_PERMISSIONS
from apps.platform_app.models import (
    AuthToken,
    AuthTokenPurpose,
    Invitation,
    InvitationStatus,
    Job,
    Membership,
    MembershipStatus,
    OtpChallenge,
    OtpPurpose,
    Partner,
    Plan,
    Role,
    Session,
    Tenant,
    User,
)
from apps.platform_app.services.otp import hash_code
from apps.platform_app.services.passwords import hash_reset_token
from apps.platform_app.tokens import hash_token

# The code every OTP factory and every OTP fixture uses. Real codes come from
# `secrets.randbelow`; a test that wants the real generator asserts on it
# directly rather than guessing what it produced.
DEFAULT_OTP_CODE = "123456"

ALL_MODULES = [
    "platform",
    "parties",
    "ledger",
    "inventory",
    "sales",
    "purchases",
    "payments",
    "expenses",
    "reports",
    "notifications",
    "import_export",
]


class PlanFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Plan
        django_get_or_create = ("code",)

    code = factory.Sequence(lambda n: f"plan{n}")
    name = "Standard"
    modules = factory.LazyFunction(lambda: list(ALL_MODULES))
    limits = factory.LazyFunction(dict)
    is_active = True


class PartnerFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Partner
        django_get_or_create = ("code",)

    code = factory.Sequence(lambda n: f"partner{n}")
    name = "Metis Labs"
    allowed_modules = factory.LazyFunction(lambda: list(ALL_MODULES))
    branding = factory.LazyFunction(dict)
    settings = factory.LazyFunction(dict)


class TenantFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Tenant

    partner = factory.SubFactory(PartnerFactory)
    plan = factory.SubFactory(PlanFactory)
    name = factory.Sequence(lambda n: f"Business {n}")
    business_type = "retail"
    gst_type = "unregistered"
    state_code = "27"
    phone = factory.Sequence(lambda n: f"+9199000{n:05d}")
    enabled_modules = factory.LazyFunction(lambda: list(ALL_MODULES))


class UserFactory(factory.django.DjangoModelFactory):
    """A merchant with an email identity and, as most merchants do, a mobile.

    `mobile` is optional on the model since DEC-010 and is still populated here
    because the invitation flow matches on it and because a factory that omits
    the common case makes the common case the untested one.
    `UserFactory(mobile=None)` is the other case, and several tests use it.
    """

    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"merchant{n}@example.com")
    mobile = factory.Sequence(lambda n: f"+9198000{n:05d}")
    full_name = factory.Sequence(lambda n: f"User {n}")
    is_active = True

    @factory.post_generation
    def password(self, create: bool, extracted: str | None, **kwargs: object) -> None:
        if not create:
            return
        self.set_password(extracted or "test-password")
        self.save(update_fields=["password"])


class RoleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Role
        django_get_or_create = ("tenant", "code")

    tenant = None
    code = RoleCode.OWNER.value
    name = "Owner"
    is_system = True
    permissions = factory.LazyAttribute(lambda o: sorted(ROLE_PERMISSIONS.get(o.code, frozenset())))


class MembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Membership

    user = factory.SubFactory(UserFactory)
    tenant = factory.SubFactory(TenantFactory)
    role = factory.SubFactory(RoleFactory)
    status = MembershipStatus.ACTIVE
    is_default = True
    joined_at = factory.LazyFunction(timezone.now)
    permissions_version = 1


class JobFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Job

    tenant = None
    job_type = "platform.purge_idempotency_keys"
    payload = factory.LazyFunction(dict)
    status = "queued"
    priority = 100
    run_after = factory.LazyFunction(lambda: timezone.now() - dt.timedelta(seconds=1))
    max_attempts = 5


class OtpChallengeFactory(factory.django.DjangoModelFactory):
    """A live `login` challenge whose code is `123456` unless told otherwise."""

    class Meta:
        model = OtpChallenge

    mobile = factory.Sequence(lambda n: f"+9198000{n:05d}")
    purpose = OtpPurpose.LOGIN.value
    code_hash = factory.LazyFunction(lambda: hash_code(DEFAULT_OTP_CODE))
    attempts = 0
    expires_at = factory.LazyFunction(lambda: timezone.now() + dt.timedelta(seconds=300))


class AuthTokenFactory(factory.django.DjangoModelFactory):
    """A live password-reset token whose raw value is exposed as `raw_token`."""

    class Meta:
        model = AuthToken

    user = factory.SubFactory(UserFactory)
    purpose = AuthTokenPurpose.PASSWORD_RESET
    token_hash = factory.LazyAttribute(lambda o: hash_reset_token(o.raw_token))
    expires_at = factory.LazyFunction(lambda: timezone.now() + dt.timedelta(seconds=900))

    class Params:
        raw_token = "reset-token-0001"


class SessionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Session

    user = factory.SubFactory(UserFactory)
    tenant = None
    family_id = factory.LazyFunction(uuid7)
    token_hash = factory.Sequence(lambda n: f"{n:064d}")
    expires_at = factory.LazyFunction(lambda: timezone.now() + dt.timedelta(days=30))


class InvitationFactory(factory.django.DjangoModelFactory):
    """A pending invitation whose raw token is exposed as `raw_token`."""

    class Meta:
        model = Invitation

    tenant = factory.SubFactory(TenantFactory)
    mobile = factory.Sequence(lambda n: f"+9197000{n:05d}")
    role = factory.SubFactory(RoleFactory, code="staff", name="Staff")
    token_hash = factory.LazyAttribute(lambda o: hash_token(o.raw_token))
    status = InvitationStatus.PENDING
    expires_at = factory.LazyFunction(lambda: timezone.now() + dt.timedelta(days=7))

    class Params:
        raw_token = "invite-token-0001"
