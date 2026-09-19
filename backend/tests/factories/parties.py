"""factory-boy factories for the parties app."""

from __future__ import annotations

import factory

from apps.parties.models import Party
from tests.factories.platform import TenantFactory


class PartyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Party

    tenant = factory.SubFactory(TenantFactory)
    name = factory.Sequence(lambda n: f"Party {n}")
    mobile = factory.Sequence(lambda n: f"+9197000{n:05d}")
    is_customer = True
