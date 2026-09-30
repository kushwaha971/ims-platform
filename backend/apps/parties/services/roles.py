"""Party roles — what a module calls the people it has a profile for (A6, ADR-046).

People are always parties (vision §3). A module's role on a person — a gym
member, a borrower, a guest — is the EXISTENCE of that module's profile row
(`gym_member.party_id`, `lending_borrower.party_id`…). Core never imports a
vertical, so the vertical tells core how to find those people:

    register_party_role(
        "gym_member", module="gym", label_id="gym.role.members",
        party_ids=lambda tenant: GymMember.objects.for_tenant(tenant).values("party_id"),
    )

from its `ready()`. `party_ids(tenant)` returns a queryset of party ids — a
subquery, never a list — so `?role=` is `id IN (SELECT party_id …)` and the
badges on a page are ONE query however many roles there are.

**Only enabled modules count (BR-1, EC-2).** A module switched off (or not yet
released, R11) has no chips, no badges and no `?role=`; its profile rows stay.

The registry follows ADR-042: idempotent for an identical spec, a conflicting
one raises `ImproperlyConfigured` at start-up, and `_reset_for_tests` restores
the start-up snapshot.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ImproperlyConfigured
from django.db.models import (
    BooleanField,
    Case,
    CharField,
    Count,
    ExpressionWrapper,
    Func,
    Q,
    QuerySet,
    Value,
    When,
)

from apps.common.exceptions import ValidationFailed

#: A role code is `<module>_<noun>` by convention and travels in a URL
#: (`?role=gym_member`), so it is a short slug.
MAX_CODE_LENGTH = 40

UNKNOWN_ROLE = "Unknown role."


@dataclass(frozen=True)
class PartyRole:
    code: str
    module: str
    label_id: str
    party_ids: Callable[[Any], QuerySet]


_ROLES: dict[str, PartyRole] = {}
_BASELINE: dict[str, PartyRole] | None = None


def register_party_role(
    code: str, *, module: str, label_id: str, party_ids: Callable[[Any], QuerySet]
) -> PartyRole:
    """Declare that `module`'s profile rows make a party a `code`.

    Idempotent for an identical spec (a module imported twice is harmless); a
    second registration of `code` with a different module, label or callable
    raises, because two apps claiming one URL value would make `?role=` mean
    whichever loaded last.
    """
    if not code or len(code) > MAX_CODE_LENGTH or not code.replace("_", "").isalnum():
        raise ImproperlyConfigured(f"Party role code {code!r} must be a short slug.")
    if "," in code:  # pragma: no cover - excluded by the slug rule; kept as the reason
        raise ImproperlyConfigured("A role code may not contain a comma (`?role=` splits on it).")
    if not label_id or not module:
        raise ImproperlyConfigured(f"Party role {code!r} needs a module and a label_id.")
    spec = PartyRole(code=code, module=module, label_id=label_id, party_ids=party_ids)
    existing = _ROLES.get(code)
    if existing is not None:
        if existing == spec:
            return existing
        raise ImproperlyConfigured(
            f"Party role {code!r} is already registered by {existing.module!r} "
            f"with a different spec."
        )
    _ROLES[code] = spec
    return spec


def registered_roles() -> tuple[PartyRole, ...]:
    """Every registered role, enabled or not, in registration order."""
    return tuple(_ROLES.values())


def enabled_roles(tenant: Any) -> list[PartyRole]:
    """The roles whose module the tenant can reach now, in registration order.

    Zero queries when nothing is registered — which is every tenant until the
    first vertical ships, and the reason the party list's query budget did not
    move for this feature.
    """
    if not _ROLES or tenant is None:
        return []
    from apps.platform_app.services.entitlements import effective_modules

    effective = effective_modules(tenant)
    return [role for role in _ROLES.values() if role.module in effective]


def parse_role_codes(tenant: Any, raw: str | None) -> list[PartyRole]:
    """`?role=gym_member,library_member` → the roles, or 400 (BR-1, EC-2).

    An unknown code and a code whose module is off get the same answer: to the
    caller, a role of a switched-off module does not exist.
    """
    codes = [part.strip() for part in (raw or "").split(",") if part.strip()]
    if not codes:
        return []
    enabled = {role.code: role for role in enabled_roles(tenant)}
    if any(code not in enabled for code in codes):
        raise ValidationFailed({"role": [UNKNOWN_ROLE]})
    return [enabled[code] for code in dict.fromkeys(codes)]


def role_predicate(tenant: Any, roles: Sequence[PartyRole]) -> Q:
    """`id IN party_ids(tenant)` for each role, OR'd (EC-1).

    A subquery rather than a join for the tag filter's reason: a party with two
    profiles would come back twice from a join, and `meta.totals` sums the same
    queryset.
    """
    predicate = Q()
    for role in roles:
        predicate |= Q(pk__in=role.party_ids(tenant))
    return predicate


def _role_codes_expression(tenant: Any, roles: Sequence[PartyRole]) -> Func:
    """`ARRAY_REMOVE(ARRAY[CASE WHEN id IN (…) THEN 'code' END, …], NULL)`.

    One column holding every role code of the row, so a page of fifty with three
    roles is one query rather than fifty or three.
    """
    cases = [
        Case(When(Q(pk__in=role.party_ids(tenant)), then=Value(role.code)), default=None)
        for role in roles
    ]
    return Func(
        *cases,
        function="ARRAY",
        template="ARRAY_REMOVE(ARRAY[%(expressions)s]::varchar[], NULL)",
        output_field=ArrayField(CharField()),
    )


def with_role_codes(queryset: QuerySet, tenant: Any) -> QuerySet:
    """`queryset` annotated with `role_codes` — unchanged when no role is enabled.

    Used by the list's CSV export (FRD §11), which streams rows and must not ask
    a question per row.
    """
    roles = enabled_roles(tenant)
    if not roles:
        return queryset
    return queryset.annotate(role_codes=_role_codes_expression(tenant, roles))


def roles_for(tenant: Any, party_ids: Iterable[UUID]) -> dict[UUID, list[str]]:
    """Role codes per party, for a page of rows — ONE query, or none.

    Returns only parties that have a role; a party absent from the result has
    none. No query when no role is enabled or the page is empty.
    """
    ids = list(party_ids)
    roles = enabled_roles(tenant)
    if not roles or not ids:
        return {}
    from apps.parties.models import Party

    rows = (
        Party.objects.for_tenant(tenant)
        .filter(pk__in=ids)
        .annotate(role_codes=_role_codes_expression(tenant, roles))
        .values_list("pk", "role_codes")
    )
    return {pk: list(codes) for pk, codes in rows if codes}


def role_badges(tenant: Any, codes: Iterable[str]) -> list[dict[str, str]]:
    """`[{code, module, label_id}]` for a party's codes (the detail payload)."""
    wanted = set(codes)
    return [
        {"code": role.code, "module": role.module, "label_id": role.label_id}
        for role in enabled_roles(tenant)
        if role.code in wanted
    ]


def role_counts(tenant: Any) -> list[dict[str, Any]]:
    """`GET /parties/roles` — each enabled role with how many ACTIVE parties hold it.

    One aggregate query for every role. Archived parties are not counted, for
    the list's BR-4 reason: the chip says how many people it will show, and the
    list it filters leaves archived parties out unless asked.
    """
    roles = enabled_roles(tenant)
    if not roles:
        return []
    from apps.parties.constants import PartyStatus
    from apps.parties.models import Party

    aggregates = {
        f"r{index}": Count(
            "pk",
            filter=ExpressionWrapper(Q(pk__in=role.party_ids(tenant)), output_field=BooleanField()),
        )
        for index, role in enumerate(roles)
    }
    counts = (
        Party.objects.for_tenant(tenant).filter(status=PartyStatus.ACTIVE).aggregate(**aggregates)
    )
    return [
        {
            "code": role.code,
            "module": role.module,
            "label_id": role.label_id,
            "count": counts[f"r{index}"],
        }
        for index, role in enumerate(roles)
    ]


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Put the registry back to what start-up registered (ADR-042)."""
    global _BASELINE
    if _BASELINE is None:
        _BASELINE = dict(_ROLES)
    _ROLES.clear()
    _ROLES.update(_BASELINE)
