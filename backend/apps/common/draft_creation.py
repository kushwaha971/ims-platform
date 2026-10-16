"""The one owner of durable draft creation (ADR-063, SH-011).

An editor mints `client_draft_key` before its first create and sends it with
every retry of that create. The first request claims the key and creates the
draft in ONE transaction; any later request with the same key is a lookup of
the CURRENT document — its body is never applied, so a stale retry cannot
overwrite newer edits. A discarded draft leaves the claim as a tombstone and
the retry is a 404 rather than a resurrection.

Each document app keeps its own claim table (a `DraftCreationBase` subclass
with a foreign key to its own document) and decides its own `family`: sales
shares one between invoice and bill of supply, purchases use the kind. Posting,
stock and money rules stay in the apps; this module never touches them.
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.common.context import Ctx
from apps.common.exceptions import NotFound


def client_draft_key_field() -> serializers.RegexField:
    """The optional wire field; 1–64 characters so it fits the claim column and a UUID."""
    return serializers.RegexField(r"^[A-Za-z0-9_-]{1,64}$", required=False)


def actor_key(ctx: Ctx) -> str:
    return str(ctx.actor.pk) if ctx.actor else ctx.actor_type


def claim(
    model: type[Any], *, ctx: Ctx, family: str, key: str, created_by: Any
) -> tuple[Any, bool]:
    """`(claim, claimed)`. Call inside the create's transaction.

    `get_or_create`'s unique insert waits for a competing transaction, so two
    racing first saves end with one claim; a failed create rolls its claim back
    and never burns the key.
    """
    return model.objects.get_or_create(
        tenant=ctx.tenant,
        actor_key=actor_key(ctx),
        family=family,
        key=key,
        defaults={"created_by": created_by},
    )


def recovered(creation: Any, documents: Any) -> Any:
    """The claimed document as it is NOW (posted included), or 404 for a tombstone."""
    document = documents.filter(pk=creation.document_id).first() if creation.document_id else None
    if document is None:
        raise NotFound("This draft was discarded. Start a new document.")
    return document


def attach(creation: Any, document: Any) -> None:
    creation.document = document
    creation.save(update_fields=["document", "updated_at"])
