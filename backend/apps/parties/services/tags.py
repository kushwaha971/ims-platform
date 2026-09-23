"""PTY-05 — tags (Part 26 §26.7 R7.1: fat service).

A tag is a label and a filter dimension and nothing else (BR-8): it never
changes pricing, tax, reminders or permissions. That restraint is what lets a
merchant invent one at the counter without wondering what it will do to their
book.

── The one genuinely subtle rule ──────────────────────────────────────────────

Names are case-insensitively unique per tenant, and the casing the merchant
first typed is what everyone sees afterwards (BR-1). "Camp Area" and "camp
area" are the same tag; "GST" does not become "Gst" because somebody later
typed it in lower case.

Normalising here is necessary and not sufficient. Two staff members creating
the same new tag from two party forms in the same second both pass their own
lookup and both insert — so the database carries a unique index on
`lower(name)` and `get_or_create_tag` catches the collision and re-reads. Both
parties end up on one tag, which is EC-3's requirement.
"""

from __future__ import annotations

import unicodedata
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.db.models.functions import Lower

from apps.common.audit import write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.parties.constants import PartyStatus
from apps.parties.models import Party, PartyTag, Tag

#: FR-13. Two hundred is far more than a merchant can hold in their head, and
#: the limit exists so that the picker stays a picker rather than becoming a
#: search problem. It is a plain 400 rather than a plan limit: it is a product
#: constraint, not something an upgrade should lift.
MAX_TAGS_PER_TENANT = 200

#: BR-3. Ten labels on one party is already past the point where the chips stop
#: being scannable in a list row.
MAX_TAGS_PER_PARTY = 10

#: FR-12's palette — the design system's eight visualisation tokens
#: (Part 23 §23.2.4), stored by NAME rather than as a hex value.
#:
#: ── Why a token name and not `#2563EB` ─────────────────────────────────────
#: An earlier version of this constant held hex, which is what FR-1's
#: `color varchar(7)` reads like at first glance. A hex value is a decision
#: about pixels taken in the database, and it cannot answer the one question
#: the chip is asked every time it renders: which theme am I on. `--viz-1`
#: resolves to `--primary-500` and `--viz-4` to `--warning-bright`, both of
#: which are redefined for dark mode; a stored `#2563EB` is the light-mode blue
#: on a dark surface for ever, at whatever contrast that happens to give.
#:
#: The names fit `varchar(7)` with room to spare, so the column FR-1 specifies
#: is unchanged. Free entry is not offered either way: these eight are the ones
#: the design system guarantees to pass 4.5:1 on the card surface, and a
#: merchant picking `#FFFF00` would be choosing an unreadable chip.
TAG_PALETTE: tuple[str, ...] = (
    "viz-1",
    "viz-2",
    "viz-3",
    "viz-4",
    "viz-5",
    "viz-6",
    "viz-7",
    "viz-8",
)


def normalise_tag_name(raw: str) -> str:
    """Trim, collapse inner whitespace, strip control characters.

    NFKC first, for the same reason the party name is normalised: a name typed
    on one keyboard and searched from another must be the same string, and a
    full-width character that looks identical is not.
    """
    text = unicodedata.normalize("NFKC", raw or "")
    text = "".join(ch for ch in text if ch.isprintable() or ch == " ")
    return " ".join(text.split())


def validate_tag_name(raw: str) -> str:
    """The name, normalised, or a `validation_error`.

    ── Commas and semicolons are refused, and it is not fussiness ─────────────
    EC-14. The list filter serialises tags as `?tag=Camp Area,Route 2`, and the
    CSV export joins them with semicolons. A tag called "Camp, East" would
    round-trip as two tags that do not exist, and the merchant would see a
    filter that silently matches nothing. Refusing the character at the point of
    entry is the only place this can be fixed without inventing an escaping
    scheme for a URL parameter a human is expected to read.
    """
    name = normalise_tag_name(raw)
    if not name:
        raise ValidationFailed({"name": ["Enter a tag name."]})
    if len(name) > 40:
        raise ValidationFailed({"name": ["Keep the tag name under 40 characters."]})
    if "," in name or ";" in name:
        raise ValidationFailed({"name": ["Tag names cannot contain , or ;"]})
    return name


def validate_color(color: str | None) -> str | None:
    if color in (None, ""):
        return None
    if color not in TAG_PALETTE:
        raise ValidationFailed({"color": ["Choose a colour from the palette."]})
    return color


def tags_for_tenant(*, tenant: Any, include_archived: bool = False) -> Any:
    """Every tag, with how many parties carry it.

    ── The count excludes archived parties by default (BR-9) ─────────────────
    A tag on somebody who has left the book is not a party the merchant can act
    on, and "Camp Area · 34" that includes eleven archived parties sends them to
    a filtered list showing twenty-three. `include_archived` is for the
    manager's tooltip, where the question is "is this tag still holding
    anything at all" rather than "how many can I work with".

    The filter lives inside the `Count`, not in a `.filter()`: a WHERE on the
    joined table would drop tags whose parties are ALL archived, and a tag with
    zero live parties is exactly the one the merchant wants to find and delete.
    """
    condition = Q(party_tags__party__deleted_at__isnull=True)
    if not include_archived:
        condition &= Q(party_tags__party__status=PartyStatus.ACTIVE)
    return (
        Tag.objects.for_tenant(tenant)
        .annotate(party_count=Count("party_tags", filter=condition, distinct=True))
        .order_by(Lower("name"))
    )


def live_party_count(tag: Tag) -> int:
    """How many parties carrying this tag a merchant can actually act on (BR-9).

    ── Why this is a function and not `PartyTag.objects.filter(tag=tag).count()` ──
    Because that is what it used to be, in two places, while `tags_for_tenant`
    counted something else. The manager's row applied BR-9 and excluded archived
    and soft-deleted parties; the delete dialog's dry-run did not. A tag on two
    active parties and one archived one therefore read "2 parties" on the row
    and "it will be taken off 3 parties" in the confirmation two clicks later —
    the same tag, the same screen, two numbers.

    Both now ask this. The archived parties still lose the label, which is
    correct and is what `delete_tag` does; they are simply not counted in a
    sentence whose subject is "parties you can do something about".
    """
    return PartyTag.objects.filter(
        tag=tag,
        party__deleted_at__isnull=True,
        party__status=PartyStatus.ACTIVE,
    ).count()


def _find_by_name(*, tenant: Any, name: str) -> Tag | None:
    return Tag.objects.for_tenant(tenant).filter(name__iexact=name).first()


def _refuse_if_at_limit(*, tenant: Any) -> None:
    if Tag.objects.for_tenant(tenant).count() >= MAX_TAGS_PER_TENANT:
        raise BusinessRuleViolation(
            "tag_limit_reached",
            f"You can have up to {MAX_TAGS_PER_TENANT} tags.",
        )


def get_or_create_tag(*, ctx: Ctx, name: str, color: str | None = None) -> tuple[Tag, bool]:
    """The tag with this name, creating it if it is new. Returns `(tag, created)`.

    Idempotent by design (FR-3): asking for a tag that exists is not an error,
    because creating a tag is a convenience rather than a transaction. The
    endpoint answers 200 for an existing name and 201 for a new one, so a
    client can tell the difference without either outcome being a failure.
    """
    clean = validate_tag_name(name)
    existing = _find_by_name(tenant=ctx.tenant, name=clean)
    if existing is not None:
        return existing, False

    _refuse_if_at_limit(tenant=ctx.tenant)
    try:
        # A SAVEPOINT, so the IntegrityError below does not poison the outer
        # transaction — the same lesson PTY-01's duplicate-mobile recovery
        # learned the hard way.
        with transaction.atomic():
            tag = Tag.objects.create(tenant=ctx.tenant, name=clean, color=validate_color(color))
    except IntegrityError:
        # Somebody else created it between the lookup and the insert. The
        # database refused the duplicate, which is what it is for; re-reading is
        # the whole recovery (EC-3).
        raced = _find_by_name(tenant=ctx.tenant, name=clean)
        if raced is None:
            raise
        return raced, False

    write_audit(
        ctx=ctx,
        action="party.tag.created",
        entity_type="parties_tag",
        entity_id=tag.id,
        after={"name": tag.name, "color": tag.color},
    )
    return tag, True


@transaction.atomic
def update_tag(*, ctx: Ctx, tag: Tag, name: str | None = None, color: Any = ...) -> Tag:
    """Rename or recolour. A rename is global by construction (BR-7).

    The join stores the tag's id and never its name, so one `UPDATE` changes
    what every party shows. That is the whole of US-4: fixing a spelling does
    not mean editing sixty parties.
    """
    before = {"name": tag.name, "color": tag.color}
    changed: list[str] = []

    if name is not None:
        clean = validate_tag_name(name)
        clash = _find_by_name(tenant=ctx.tenant, name=clean)
        if clash is not None and clash.pk != tag.pk:
            # 409 with the other tag's id, so the client can offer to merge
            # rather than making the merchant work out that the two are the
            # same thing under different casing.
            raise BusinessRuleViolation(
                "tag_name_taken",
                f'A tag called "{clash.name}" already exists.',
                details={"existing_tag_id": str(clash.pk)},
            )
        if clean != tag.name:
            tag.name = clean
            changed.append("name")

    if color is not ...:
        validated = validate_color(color)
        if validated != tag.color:
            tag.color = validated
            changed.append("color")

    if not changed:
        return tag

    tag.save(update_fields=[*changed, "updated_at"])
    write_audit(
        ctx=ctx,
        action="party.tag.updated",
        entity_type="parties_tag",
        entity_id=tag.id,
        before={key: before[key] for key in changed},
        after={key: getattr(tag, key) for key in changed},
    )
    return tag


@transaction.atomic
def delete_tag(*, ctx: Ctx, tag: Tag) -> int:
    """Remove the label. The parties stay (BR-5). Returns how many lost it.

    The count is returned so the caller can say so afterwards, and the dialog
    that got here said it beforehand. Merchants genuinely fear that deleting a
    label deletes the people, which is why the copy states what survives rather
    than what is removed.
    """
    party_count = live_party_count(tag)
    # The audit keeps the TRUE number of rows removed, which is not the same as
    # the number the merchant was shown: archived parties lose the label too,
    # and an audit that under-reports what it deleted is an audit that cannot be
    # used to reconstruct the change.
    rows_removed = PartyTag.objects.filter(tag=tag).count()
    write_audit(
        ctx=ctx,
        action="party.tag.deleted",
        entity_type="parties_tag",
        entity_id=tag.id,
        before={"name": tag.name, "color": tag.color},
        metadata={"party_count": party_count, "rows_removed": rows_removed},
    )
    # The join rows go with it by `on_delete=CASCADE`; no party row is touched,
    # and nothing in the ledger or the documents references a tag at all.
    tag.delete()
    return party_count


@transaction.atomic
def merge_tags(*, ctx: Ctx, source: Tag, into: Tag) -> dict:
    """Move every party from `source` to `into`, then delete `source` (FR-10).

    One-directional and destructive to the source (BR-6), which is why it is
    behind a confirmation that states the numbers.

    Duplicates are skipped rather than failing the merge: a party that already
    carries the target tag needs nothing done to it, and refusing the whole
    operation because three of twelve parties were already correct would be a
    merge that can never run on the data it is most needed for.
    """
    if source.pk == into.pk:
        raise ValidationFailed({"into_tag_id": ["Choose a different tag to merge into."]})

    already = set(PartyTag.objects.filter(tag=into).values_list("party_id", flat=True))
    rows = list(PartyTag.objects.filter(tag=source).values_list("party_id", flat=True))
    movable = [party_id for party_id in rows if party_id not in already]

    # ── The reported figures count LIVE parties, and the move does not ───────
    #
    # Every row moves, archived parties included: the tag has to survive on
    # somebody who comes back. But the numbers a merchant reads are about
    # parties they can act on (BR-9), because those are the numbers the manager
    # row and the confirmation dialog already quote. Counting rows here meant
    # the dialog said "3 parties will move" and the snackbar afterwards said
    # "5 moved" — the same operation, described twice, differently.
    live = set(
        Party.objects.filter(
            pk__in=[*movable, *(pk for pk in rows if pk in already)],
            deleted_at__isnull=True,
            status=PartyStatus.ACTIVE,
        ).values_list("pk", flat=True)
    )

    PartyTag.objects.filter(tag=source, party_id__in=movable).update(tag=into)
    moved = len([pk for pk in movable if pk in live])
    skipped = len([pk for pk in rows if pk in already and pk in live])
    rows_moved = len(movable)

    write_audit(
        ctx=ctx,
        action="party.tag.merged",
        entity_type="parties_tag",
        entity_id=into.id,
        metadata={
            "source_id": str(source.pk),
            "source_name": source.name,
            "into_tag_id": str(into.pk),
            "moved": moved,
            "skipped_duplicates": skipped,
            "rows_moved": rows_moved,
        },
    )
    source.delete()
    return {"moved": moved, "skipped_duplicates": skipped}


@transaction.atomic
def set_party_tags(*, ctx: Ctx, party: Party, names: list[str]) -> list[Tag]:
    """REPLACE a party's tags with these names, creating any that are new (FR-4).

    Replace and not merge, and the distinction is the caller's to make: the
    party form sends the complete set the merchant can see on screen, so
    anything missing from it was removed on purpose. `PATCH` without the key
    leaves tags alone entirely — the serializer, not this function, decides
    which of the two happened.
    """
    tags = [get_or_create_tag(ctx=ctx, name=name)[0] for name in names]
    # De-duplicated by id, because "Camp Area" and "camp area" in one submission
    # resolve to the same tag and the join would refuse the second row.
    wanted = {tag.pk: tag for tag in tags}

    # BR-3 counts the RESULT, and the order matters. Checking `len(names)` first
    # refused a submission of eleven names that fold to ten distinct tags —
    # "Camp Area" and "camp area" among them — with "Up to 10 tags per party",
    # about a party that would have ended up carrying exactly ten.
    if len(wanted) > MAX_TAGS_PER_PARTY:
        raise ValidationFailed({"tags": [f"Up to {MAX_TAGS_PER_PARTY} tags per party."]})

    PartyTag.objects.filter(party=party).exclude(tag_id__in=wanted).delete()
    PartyTag.objects.bulk_create(
        [PartyTag(party=party, tag=tag) for tag in wanted.values()],
        ignore_conflicts=True,
    )

    # The caller is usually holding a `party` that was loaded with `tags`
    # prefetched — `party_detail_queryset` does it for the read path, and
    # `get_object()` is shared with the write path. That cache is now stale, and
    # the 200 would echo the tags the merchant just removed. `refresh_from_db()`
    # with no arguments clears `_prefetched_objects_cache`, which is the
    # documented way to say "forget what you were holding".
    party.refresh_from_db()
    return list(wanted.values())


#: FR-8's ceilings. Two hundred explicit ids is a selection; five thousand
#: through a filter is a reorganisation; past that the merchant is asking for
#: something a narrower filter would do better.
MAX_BULK_PARTIES = 200


@transaction.atomic
def bulk_tag(*, ctx: Ctx, party_ids: list[Any], tag_names: list[str], mode: str) -> dict:
    """Add, replace or remove tags across a selection (FR-8).

    ── What comes back, and why each piece exists ─────────────────────────────

    `updated_count` is how many parties CHANGED, not how many were matched. It
    used to be `len(parties)`, which meant a merchant who selected forty and
    removed a tag three of them carried was told "Removed from 40 parties".
    Nothing was wrong with the data; the sentence was simply false.

    `changed` is what makes Undo exact (BR-11), and it is the pairs that were
    actually written rather than the pairs that were asked for. An `add`
    inverted by "remove the same tags from the same parties" strips the tag from
    everybody who ALREADY had it — a party that predated the operation quietly
    loses a label, under a message that says "put back the way it was". Listing
    only the real changes makes the inverse exact for both `add` and `remove`.

    `previous` is still returned for `replace`, which throws away tag sets that
    differ per party and so cannot be inverted from `changed` alone.
    """
    if mode not in ("add", "replace", "remove"):
        raise ValidationFailed({"mode": ["Unknown mode."]})
    if not party_ids:
        raise ValidationFailed({"party_ids": ["Select at least one party."]})
    if len(party_ids) > MAX_BULK_PARTIES:
        raise ValidationFailed({"party_ids": [f"Select up to {MAX_BULK_PARTIES} parties."]})
    if not tag_names or len(tag_names) > 5:
        raise ValidationFailed({"tag_names": ["Choose between 1 and 5 tags."]})

    parties = list(Party.objects.for_tenant(ctx.tenant).filter(pk__in=party_ids))
    tags = [get_or_create_tag(ctx=ctx, name=name)[0] for name in tag_names]
    tag_ids = {tag.pk for tag in tags}

    found = {str(party.pk) for party in parties}
    skipped: list[dict] = [
        # Ids the caller asked for that are not this tenant's are simply not in
        # `parties`. Reported rather than silently dropped, for the same reason
        # bulk archive reports them: a caller who sent forty and got thirty-eight
        # back with no explanation will send them again.
        #
        # No name, because there is nothing to name: this tenant has no such
        # party, and inventing a label for a row it cannot see would be the one
        # kind of leak this endpoint must not have.
        {"id": str(party_id), "name": "", "reason": "not_found"}
        for party_id in party_ids
        if str(party_id) not in found
    ]

    if mode == "add":
        # BR-3, and this is the only path that could breach it. `set_party_tags`
        # counts the set it is about to write, so the party form was always
        # safe; this endpoint went straight to `bulk_create` with no count at
        # all. A merchant selecting a hundred parties carrying nine tags each
        # and adding two ended up with a hundred parties carrying eleven — in
        # one request, with nothing on screen to show it happening.
        #
        # The count is of the RESULT, not of the request: a tag a party already
        # carries costs nothing, so pressing Add twice on a selection sitting at
        # the ceiling must not start refusing the second press for a request
        # that changes nothing.
        held: dict[Any, set[Any]] = {party.pk: set() for party in parties}
        for party_pk, tag_pk in PartyTag.objects.filter(party__in=parties).values_list(
            "party_id", "tag_id"
        ):
            held[party_pk].add(tag_pk)
        full = {party.pk for party in parties if len(held[party.pk] | tag_ids) > MAX_TAGS_PER_PARTY}
        if full:
            # Skipped rather than refusing the whole request: one full party
            # must not cost the other ninety-nine their tag, or the feature
            # stops working on exactly the books that need it most. They are
            # reported the same way an unknown id is, so the dialog can name
            # them and the merchant can decide what to remove.
            # NAMED, and that is the whole point of reporting them.
            #
            # `{"id": …, "reason": "tag_limit_reached"}` alone produced a dialog
            # reading "3 were skipped" over three identical sentence fragments —
            # "already carries 10 tags" — with nothing saying WHICH three. A
            # party at the ceiling is a party the merchant can fix, and they
            # cannot fix one they cannot identify. The name is already in memory;
            # the client would otherwise have to hold the selected rows and join
            # on ids it may no longer have after the list refetches.
            skipped.extend(
                {"id": str(party.pk), "name": party.name, "reason": "tag_limit_reached"}
                for party in parties
                if party.pk in full
            )
            parties = [party for party in parties if party.pk not in full]

    if mode == "replace" and len(tag_ids) > MAX_TAGS_PER_PARTY:
        # Unreachable while `tag_names` caps at five, and here so that raising
        # one limit cannot silently breach the other.
        raise ValidationFailed({"tag_names": [f"Up to {MAX_TAGS_PER_PARTY} tags per party."]})

    # Everything every selected party currently holds, in ONE query.
    #
    # `replace` used to build `previous` with a query per party inside the list
    # comprehension — two hundred round trips inside the request's transaction,
    # for an endpoint whose whole promise is that it is one statement. The `add`
    # branch above was already doing it correctly a few lines up; this is the
    # same read, hoisted so both use it.
    held_now: dict[Any, set[Any]] = {party.pk: set() for party in parties}
    for party_pk, tag_pk in PartyTag.objects.filter(party__in=parties).values_list(
        "party_id", "tag_id"
    ):
        held_now[party_pk].add(tag_pk)

    previous: list[dict] = []
    if mode == "replace":
        previous = [
            {
                "party_id": str(party.pk),
                "tag_ids": sorted(str(pk) for pk in held_now[party.pk]),
            }
            for party in parties
        ]
        PartyTag.objects.filter(party__in=parties).delete()

    #: The pairs this call actually wrote or deleted, per party. Computed BEFORE
    #: the write from what each party held, because afterwards the difference is
    #: gone.
    changed: list[dict] = []
    if mode == "remove":
        for party in parties:
            hit = held_now[party.pk] & tag_ids
            if hit:
                changed.append(
                    {"party_id": str(party.pk), "tag_ids": sorted(str(pk) for pk in hit)}
                )
        PartyTag.objects.filter(party__in=parties, tag_id__in=tag_ids).delete()
    else:
        for party in parties:
            # After a `replace` the party holds nothing, so everything is new.
            already = set() if mode == "replace" else held_now[party.pk]
            gained = tag_ids - already
            if gained:
                changed.append(
                    {"party_id": str(party.pk), "tag_ids": sorted(str(pk) for pk in gained)}
                )
        PartyTag.objects.bulk_create(
            [PartyTag(party=party, tag=tag) for party in parties for tag in tags],
            ignore_conflicts=True,
        )

    # `replace` changes a party even when the new set matches the old one,
    # because it also removed everything else — so for that mode the parties it
    # touched ARE the parties it changed.
    updated = len(parties) if mode == "replace" else len(changed)
    return {
        "updated_count": updated,
        "previous": previous,
        "changed": changed,
        "skipped": skipped,
    }
