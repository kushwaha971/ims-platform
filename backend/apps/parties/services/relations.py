"""Guardian and payer relations between parties (A6, FRD 00 PLT-X04, ADR-046).

A child's gym membership is paid by a parent; a company pays for an employee's
course; a borrower's guarantor is told when an instalment is late. The person
and the related party are both parties of the tenant (EC-3: a guardian who is
also a customer is ONE party with two meanings, never a duplicate contact).

**Delete or end.** A relation nobody has used is deleted outright — it was a
mistake and leaves nothing to explain. Once a reminder has gone to the related
party (PLT-X06 `recipient_party_id`), the relation is ENDED with `to_on`
instead, so "who was told, and as whose guardian" stays answerable. The
reminder app knows its own history; it registers a counter here
(`register_relation_history`), and with none registered every relation is
deletable. Core never imports the reminder code.

**BR-6.** Archiving a person does not end their relations. Archiving a
GUARDIAN is refused while they are the active guardian of an active party —
through the parties-owned archive guard below, registered from `ready()`.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.parties.constants import PartyStatus, RelationKind
from apps.parties.models import Party, PartyRelation

# ── History counters (who has USED a relation) ───────────────────────────────

RelationHistory = Callable[[PartyRelation], int]

_HISTORY: list[RelationHistory] = []
_HISTORY_BASELINE: list[RelationHistory] | None = None


def register_relation_history(counter: RelationHistory) -> None:
    """`counter(relation)` → how many records used this relation. Idempotent.

    Registered by the reminder app (A7: reminders sent to `related_party` as
    this relation's recipient). A positive count turns a DELETE into an end.
    """
    if not callable(counter):
        raise ImproperlyConfigured("register_relation_history needs a callable.")
    if not any(existing == counter for existing in _HISTORY):
        _HISTORY.append(counter)


def relation_has_history(relation: PartyRelation) -> bool:
    return any(counter(relation) > 0 for counter in _HISTORY)


def _reset_history_for_tests() -> None:  # pragma: no cover - test helper
    global _HISTORY_BASELINE
    if _HISTORY_BASELINE is None:
        _HISTORY_BASELINE = list(_HISTORY)
    _HISTORY[:] = _HISTORY_BASELINE


# ── Reading ──────────────────────────────────────────────────────────────────


def _is_active(relation: PartyRelation, today: dt.date) -> bool:
    return relation.to_on is None or relation.to_on > today


def active_relation_q(today: dt.date) -> Q:
    """A relation is active until its end date passes (`to_on` is the last day
    it was NOT in force — the day it was ended)."""
    return Q(to_on__isnull=True) | Q(to_on__gt=today)


def relations_of(tenant: Any, party: Party) -> dict[str, QuerySet[PartyRelation]]:
    """Both directions: where `party` is the person, and where they are related.

    Two queries (one per direction), each with both parties joined, so the list
    never walks a relation per row. Ended relations are included — the client
    shows them struck through, because "Rahul's father until March" is a fact a
    merchant may be asked about.
    """
    base = (
        PartyRelation.objects.for_tenant(tenant)
        .select_related("party", "related_party")
        .order_by("to_on", "-from_on", "id")
    )
    return {
        "as_person": base.filter(party=party),
        "as_related": base.filter(related_party=party),
    }


def receiving_parties(tenant: Any, party: Party) -> list[Party]:
    """The related parties who asked to receive this person's messages (BR-7).

    What a reminder source reads to fill `recipient_party_id`; never sends.
    Active relations of active, alive parties only.
    """
    today = tenant_today(tenant)
    return [
        relation.related_party
        for relation in PartyRelation.objects.for_tenant(tenant)
        .filter(active_relation_q(today), party=party, receives_messages=True)
        .filter(related_party__status=PartyStatus.ACTIVE, related_party__deleted_at__isnull=True)
        .select_related("related_party")
        .order_by("kind", "from_on", "id")
    ]


# ── Writing ──────────────────────────────────────────────────────────────────


def _snapshot(relation: PartyRelation) -> dict[str, Any]:
    return {
        "party_id": str(relation.party_id),
        "related_party_id": str(relation.related_party_id),
        "kind": relation.kind,
        "receives_messages": relation.receives_messages,
        "from_on": relation.from_on.isoformat(),
        "to_on": relation.to_on.isoformat() if relation.to_on else None,
    }


def _refuse_archived(party: Party) -> None:
    """EC-4 — a relation to or from an archived party may be READ, not created."""
    if party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "Restore this party before linking them.",
            details={"party_id": str(party.id)},
        )


@transaction.atomic
def create_relation(
    *,
    ctx: Ctx,
    party: Party,
    related_party_id: Any,
    kind: str,
    receives_messages: bool = False,
    from_on: dt.date | None = None,
) -> tuple[PartyRelation, bool]:
    """Link `related_party` to `party` as `kind`. Returns `(relation, created)`.

    `created` is False when an ENDED relation of the same kind between the same
    two parties is brought back: the unique key covers ended rows too, so
    re-adding "Rahul's father" after ending it re-opens the one row (keeping its
    first `from_on` and its history) rather than being refused as a duplicate
    of something the screen shows as over. An ACTIVE duplicate is refused
    (BR-2).
    """
    if kind not in RelationKind.values:
        raise ValidationFailed({"kind": ["Choose Guardian or Pays for."]})
    if str(related_party_id) == str(party.id):
        raise ValidationFailed({"related_party_id": ["A party cannot be linked to themselves."]})

    related = Party.objects.for_tenant(ctx.tenant).filter(pk=related_party_id).first()
    if related is None:
        raise NotFound("Party not found.")
    # Both rows locked in id order, so two opposite links made at once cannot
    # deadlock, and an archive racing this link sees one or the other.
    locked = {
        row.pk: row
        for row in Party.objects.for_tenant(ctx.tenant)
        .filter(pk__in=[party.pk, related.pk])
        .order_by("pk")
        .select_for_update()
    }
    person, related = locked[party.pk], locked[related.pk]
    _refuse_archived(person)
    _refuse_archived(related)

    today = tenant_today(ctx.tenant)
    start = from_on or today
    if start > today:
        # A link that starts next month would be "active" in no useful sense and
        # would make an end date before its start possible; record it on the day.
        raise ValidationFailed({"from_on": ["The start date cannot be in the future."]})
    existing = (
        PartyRelation.objects.for_tenant(ctx.tenant)
        .select_for_update()
        .filter(party=person, related_party=related, kind=kind)
        .first()
    )
    if existing is not None:
        if _is_active(existing, today):
            raise ValidationFailed({"related_party_id": ["They are already linked this way."]})
        before = _snapshot(existing)
        existing.to_on = None
        existing.receives_messages = receives_messages
        existing.save(update_fields=["to_on", "receives_messages", "updated_at"])
        write_audit(
            ctx=ctx,
            action=AuditAction.PARTY_RELATION_CREATED,
            entity_type="parties_relation",
            entity_id=existing.id,
            before=before,
            after=_snapshot(existing),
            metadata={"reopened": True},
        )
        return existing, False

    try:
        with transaction.atomic():
            relation = PartyRelation.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor if getattr(ctx.actor, "pk", None) else None,
                party=person,
                related_party=related,
                kind=kind,
                receives_messages=receives_messages,
                from_on=start,
            )
    except IntegrityError as exc:  # the unique key, reached by a concurrent create
        raise ValidationFailed({"related_party_id": ["They are already linked this way."]}) from exc
    write_audit(
        ctx=ctx,
        action=AuditAction.PARTY_RELATION_CREATED,
        entity_type="parties_relation",
        entity_id=relation.id,
        after=_snapshot(relation),
    )
    return relation, True


@transaction.atomic
def remove_relation(*, ctx: Ctx, relation: PartyRelation) -> PartyRelation | None:
    """Delete an unused relation (→ `None`), or end a used one (→ the ended row).

    Ending an already-ended relation is a no-op that returns it: the caller
    asked for the relation to stop and it has.
    """
    locked = PartyRelation.objects.select_for_update().get(pk=relation.pk)
    before = _snapshot(locked)
    if relation_has_history(locked):
        if locked.to_on is None or locked.to_on > tenant_today(ctx.tenant):
            locked.to_on = tenant_today(ctx.tenant)
            locked.save(update_fields=["to_on", "updated_at"])
            write_audit(
                ctx=ctx,
                action=AuditAction.PARTY_RELATION_DELETED,
                entity_type="parties_relation",
                entity_id=locked.id,
                before=before,
                after=_snapshot(locked),
                metadata={"ended": True},
            )
        return locked
    locked.delete()
    write_audit(
        ctx=ctx,
        action=AuditAction.PARTY_RELATION_DELETED,
        entity_type="parties_relation",
        entity_id=relation.pk,
        before=before,
        metadata={"ended": False},
    )
    return None


# ── BR-6: the guardian guard, owned by parties ───────────────────────────────

GUARDIAN_LABEL_ID = "parties.archive.activeGuardian"


def guardian_archive_guard(tenant: Any, party: Party) -> dict[str, Any] | None:
    """Refuse to archive someone who is the active guardian of an active party.

    Payers are not guarded: a company that stops paying for someone is a
    commercial decision the merchant records elsewhere, and FRD BR-6 names the
    guardian only.
    """
    count = (
        PartyRelation.objects.for_tenant(tenant)
        .filter(
            active_relation_q(tenant_today(tenant)),
            related_party=party,
            kind=RelationKind.GUARDIAN,
            party__status=PartyStatus.ACTIVE,
            party__deleted_at__isnull=True,
        )
        .count()
    )
    if not count:
        return None
    return {"module": "parties", "count": count, "label_id": GUARDIAN_LABEL_ID}
