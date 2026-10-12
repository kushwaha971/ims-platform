"""Editing and blocking a borrower (owner, 12 Oct 2026).

"There should be also option of edit, block … for every type of user", and
"these access should be only for admin or owner". The views pair
`HasPermission("lending.borrower.write")` with `OwnerOrAdmin`; this module is
what those three endpoints DO.

── Name and mobile belong to the party ────────────────────────────────────
A borrower is the lending role of a party (ADR-046), so the name and mobile are
the party's and change through `parties.services.crud.update_party` — the same
service the khata page's Edit uses. That brings its rules with it rather than a
second copy of them: the name's minimum length and Unicode clean-up, the
duplicate-mobile refusal that does not leak the other party's name, and the
refusal to edit an archived party. Area, route and notes are lending's own.

── What blocking means, and what it deliberately does not ─────────────────
A blocked borrower is given NO NEW LOAN: `loans.create_loan` refuses with
`borrower_blocked`. Nothing else reads the status. Money already lent is still
owed, and a lender who blocks somebody for paying late wants the late money
more, not less — so collections, visits, reminders, late fees and closing all
carry on exactly as before. Blocking is reversible and is not archiving: the
person stays in the Borrowers list, with a badge.
"""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.common.audit import write_audit
from apps.common.exceptions import NotFound, StaleVersion, ValidationFailed
from apps.lending.constants import NAME_MAX, NOTE_MAX, REASON_MAX, BorrowerStatus
from apps.lending.models import LendingBorrower, LendingRoute
from apps.parties.models import Party
from apps.parties.serializers.party import PartyUpdateSerializer
from apps.parties.services.crud import update_party

#: The party's fields a borrower edit may change. Everything else on the party
#: (GSTIN, addresses, credit limit…) is the khata's business, not lending's.
PARTY_FIELDS = ("name", "mobile")
#: Lending's own columns, and what the audit row compares.
BORROWER_FIELDS = ("area", "notes", "route_id")


def get_borrower(tenant: Any, borrower_id: Any, *, lock: bool = False) -> LendingBorrower:
    """This tenant's borrower, or a 404 — never another business's row."""
    rows = LendingBorrower.objects.filter(tenant=tenant)
    if lock:
        rows = rows.select_for_update()
    try:
        return rows.get(pk=borrower_id)
    except (LendingBorrower.DoesNotExist, ValidationError, ValueError, TypeError) as exc:
        raise NotFound("Borrower not found.") from exc


def _fresh(tenant: Any, borrower_id: Any) -> LendingBorrower:
    return (
        LendingBorrower.objects.filter(tenant=tenant)
        .select_related("party", "route")
        .get(pk=borrower_id)
    )


def _snapshot(borrower: LendingBorrower) -> dict:
    return {
        "area": borrower.area,
        "notes": borrower.notes,
        "route_id": str(borrower.route_id) if borrower.route_id else None,
    }


def _party_payload(data: dict) -> dict:
    """The name and mobile, checked by the parties app's own wire rules.

    `PartyUpdateSerializer` is the shape `PATCH /parties/{id}` accepts, so a
    mobile this endpoint lets through is one the khata would let through too. A
    blank mobile means "remove it" and is sent as None: an empty string is a
    VALUE to `uq_party_tenant_mobile`, and two people with no number would
    collide on it.
    """
    raw = {key: data[key] for key in PARTY_FIELDS if key in data}
    if not raw:
        return {}
    if "mobile" in raw and not str(raw["mobile"] or "").strip():
        raw["mobile"] = None
    serializer = PartyUpdateSerializer(data=raw, partial=True)
    if not serializer.is_valid():
        raise ValidationFailed(serializer.errors)
    return {key: serializer.validated_data[key] for key in raw if key in serializer.validated_data}


def _own_fields(tenant: Any, data: dict, errors: dict) -> dict:
    out: dict[str, Any] = {}
    for key, limit in (("area", NAME_MAX), ("notes", NOTE_MAX)):
        if key not in data:
            continue
        value = str(data.get(key) or "").strip()
        if len(value) > limit:
            errors.setdefault(key, []).append(f"At most {limit} characters.")
        out[key] = value
    if "route_id" in data:
        raw = data.get("route_id")
        if raw in (None, ""):
            out["route"] = None
        else:
            try:
                route = LendingRoute.objects.filter(tenant=tenant, pk=raw, is_active=True).first()
            except (ValidationError, ValueError, TypeError):
                route = None
            if route is None:
                errors.setdefault("route_id", []).append("Choose a route.")
            out["route"] = route
    return out


@transaction.atomic
def update_borrower(*, ctx: Any, borrower_id: Any, data: Any) -> LendingBorrower:
    """`PATCH /lending/borrowers/{id}` — name and mobile (the party's), area,
    route and notes. `version` is required: two people editing one borrower
    must not silently undo each other (the route's rule, `routes.save_route`).
    """
    data = data if isinstance(data, dict) else {}
    borrower = get_borrower(ctx.tenant, borrower_id, lock=True)
    if "version" not in data:
        raise ValidationFailed({"version": ["Send the version you edited."]})
    if data.get("version") != borrower.version:
        raise StaleVersion(borrower.version)

    errors: dict[str, list[str]] = {}
    own = _own_fields(ctx.tenant, data, errors)
    if errors:
        raise ValidationFailed(errors)
    party_changes = _party_payload(data)

    if party_changes:
        party = Party.objects.for_tenant(ctx.tenant).select_for_update().get(pk=borrower.party_id)
        # The parties service writes its own `party.updated` audit row (only
        # the fields that changed), so this module does not repeat the PII.
        update_party(ctx=ctx, party=party, payload=party_changes)

    before = _snapshot(borrower)
    for key, value in own.items():
        setattr(borrower, key, value)
    after = _snapshot(borrower)
    changed = {k for k in BORROWER_FIELDS if before[k] != after[k]}
    if changed or party_changes:
        borrower.version += 1
        borrower.save()
    if changed:
        write_audit(
            ctx=ctx,
            action="lending.borrower.updated",
            entity_type="lending_borrower",
            entity_id=borrower.id,
            before={k: before[k] for k in sorted(changed)},
            after={k: after[k] for k in sorted(changed)},
        )
    return _fresh(ctx.tenant, borrower.id)


@transaction.atomic
def block_borrower(*, ctx: Any, borrower_id: Any, reason: Any = None) -> LendingBorrower:
    """`POST /lending/borrowers/{id}/block {reason?}` — no new loans from now.

    Blocking somebody already blocked changes nothing and writes no audit row:
    a double tap is not a second decision. The reason is optional because the
    owner already knows it; when given, it is kept on the row for whoever opens
    the page next.
    """
    text = str(reason or "").strip()
    if len(text) > REASON_MAX:
        raise ValidationFailed({"reason": [f"At most {REASON_MAX} characters."]})
    borrower = get_borrower(ctx.tenant, borrower_id, lock=True)
    if borrower.status != BorrowerStatus.BLOCKED:
        borrower.status = BorrowerStatus.BLOCKED
        borrower.blocked_at = timezone.now()
        borrower.blocked_reason = text
        borrower.version += 1
        borrower.save()
        write_audit(
            ctx=ctx,
            action="lending.borrower.blocked",
            entity_type="lending_borrower",
            entity_id=borrower.id,
            before={"status": BorrowerStatus.ACTIVE},
            after={"status": BorrowerStatus.BLOCKED, "reason": text},
        )
    return _fresh(ctx.tenant, borrower.id)


@transaction.atomic
def unblock_borrower(*, ctx: Any, borrower_id: Any) -> LendingBorrower:
    """`POST /lending/borrowers/{id}/unblock` — new loans are allowed again."""
    borrower = get_borrower(ctx.tenant, borrower_id, lock=True)
    if borrower.status != BorrowerStatus.ACTIVE:
        reason = borrower.blocked_reason
        borrower.status = BorrowerStatus.ACTIVE
        borrower.blocked_at = None
        borrower.blocked_reason = ""
        borrower.version += 1
        borrower.save()
        write_audit(
            ctx=ctx,
            action="lending.borrower.unblocked",
            entity_type="lending_borrower",
            entity_id=borrower.id,
            before={"status": BorrowerStatus.BLOCKED, "reason": reason},
            after={"status": BorrowerStatus.ACTIVE},
        )
    return _fresh(ctx.tenant, borrower.id)
