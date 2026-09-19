"""factory-boy factories for the platform app (Part 26 §26.15 R15.3).

Factories, not fixture files: a fixture file drifts from the schema silently,
a factory fails to build.
"""

from __future__ import annotations

import datetime as dt

import factory
from django.utils import timezone

from apps.common.constants import RoleCode
from apps.common.permissions_registry import ROLE_PERMISSIONS
from apps.platform_app.models import (
    Job,
    Membership,
    MembershipStatus,
    Partner,
    Plan,
    Role,
    Tenant,
    User,
)

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
    class Meta:
        model = User
        skip_postgeneration_save = True

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
