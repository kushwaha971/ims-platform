"""L5 (NEW-2 follow-up) -- bring every stored `platform_user.mobile` to E.164.

NEW-2's "already used by another login" check (`credentials._refuse_taken_mobile`)
and the partial unique index `uq_user_mobile_notnull` both compare the E.164
spelling `+91XXXXXXXXXX`, because every serializer now normalises to it. A row
written before that normalisation can hold `9845678901` or `91 98456 78901`,
which neither the check nor the index recognises as the same number -- so the
platform could hand the number to a second login without either noticing.

This migration rewrites those rows with the SAME `normalise_mobile` the
serializers use, so there is one definition of "the same number".

It never deletes, merges or picks a winner. Where rewriting a row would give it
a number another user already holds -- or two old spellings would land on the
same E.164 -- every row involved is left exactly as it was and reported by id,
for a person to resolve. A value `normalise_mobile` cannot read is left alone
and reported too. The report carries the user id and a masked number, never the
raw one (Part 26 R9.3).

Only `platform_user.mobile` is touched: it is the only phone column any
uniqueness rule in this app depends on. `platform_invitation.mobile` and
`platform_tenant.phone` are notification channels with no uniqueness, and
the party duplicate check lives in `apps.parties` against its own column.

Reversal is a no-op: the old spellings were never meaningful, and there is no
record of which row had which one once rewritten.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from typing import Any

from django.db import migrations

from apps.platform_app.mobile import InvalidMobile, mask_mobile, normalise_mobile


def normalise_user_mobiles(user_model: Any, report: Callable[[str], None] = print) -> dict:
    """Rewrite non-E.164 `mobile` values in place; leave collisions and report them.

    Returns `{"updated": [...], "collisions": [...], "unparseable": [...]}` of
    user primary keys, so a caller (or a test) can see exactly what happened.
    """
    # "" is "no number" as much as NULL is; it is not a spelling to report.
    rows = list(
        user_model.objects.exclude(mobile__isnull=True)
        .exclude(mobile="")
        .values_list("pk", "mobile")
        .order_by("pk")
    )

    targets: dict[Any, str] = {}
    holders: dict[str, list[Any]] = defaultdict(list)
    unparseable: list[Any] = []
    for pk, mobile in rows:
        try:
            target = normalise_mobile(mobile)
        except InvalidMobile:
            unparseable.append(pk)
            continue
        targets[pk] = target
        holders[target].append(pk)

    updated: list[Any] = []
    collisions: list[Any] = []
    for pk, mobile in rows:
        target = targets.get(pk)
        if target is None or target == mobile:
            continue
        if len(holders[target]) > 1:
            collisions.append(pk)
            others = ", ".join(str(o) for o in holders[target] if o != pk)
            report(
                f"platform_user {pk}: mobile left unchanged -- normalising to "
                f"{mask_mobile(target)} would collide with user(s) {others}"
            )
            continue
        # `mobile=mobile` guards against a row changed since it was read.
        user_model.objects.filter(pk=pk, mobile=mobile).update(mobile=target)
        updated.append(pk)

    for pk in unparseable:
        report(f"platform_user {pk}: mobile left unchanged -- not a valid Indian mobile number")

    return {"updated": updated, "collisions": collisions, "unparseable": unparseable}


def forwards(apps: Any, schema_editor: Any) -> None:
    normalise_user_mobiles(apps.get_model("platform", "User"))


class Migration(migrations.Migration):
    dependencies = [
        ("platform", "0008_temp_password_tenant"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop, elidable=False),
    ]
