"""The tag palette moves from hex values to the design system's token names.

`0005_tags` shipped `color` holding `#2563EB` and seven siblings, which is what
FR-1's `color varchar(7)` reads like at first glance. It is the wrong thing to
store. A hex value is a decision about pixels taken in the database, and it
cannot answer the question the chip is asked on every render: which theme is
this. `--viz-1` resolves through `--primary-500` and `--viz-4` through
`--warning-bright`, both redefined for dark mode — a stored `#2563EB` is the
light-mode blue on a dark surface for ever, at whatever contrast that gives.

The column is untouched: the eight names fit `varchar(7)`. Only the values move,
and the map below is the identity the API's palette validator now enforces, so a
row left on a hex value would fail validation the next time anybody edited it.

Reversible, because the map is a bijection and the old values are recoverable
exactly. It is the sort of migration that is trivial to reverse and miserable to
reverse by hand a month later.
"""

from __future__ import annotations

from django.db import migrations

HEX_TO_TOKEN = {
    "#2563EB": "viz-1",
    "#0D9488": "viz-2",
    "#7C3AED": "viz-3",
    "#DB2777": "viz-4",
    "#EA580C": "viz-5",
    "#65A30D": "viz-6",
    "#0891B2": "viz-7",
    "#9333EA": "viz-8",
}


def _remap(apps, schema_editor, mapping):
    Tag = apps.get_model("parties", "Tag")
    for source, target in mapping.items():
        Tag.objects.filter(color=source).update(color=target)
    # Anything outside the palette was never valid and cannot be mapped to a
    # token. It is cleared rather than guessed: a tag with no colour renders as
    # a neutral chip, which is honest, where a guessed colour would be a
    # statement the merchant never made.
    Tag.objects.exclude(color__in=set(mapping.values())).exclude(color__isnull=True).update(
        color=None
    )


def to_tokens(apps, schema_editor):
    _remap(apps, schema_editor, HEX_TO_TOKEN)


def to_hex(apps, schema_editor):
    _remap(apps, schema_editor, {token: hex_ for hex_, token in HEX_TO_TOKEN.items()})


class Migration(migrations.Migration):
    dependencies = [("parties", "0006_party_tags")]

    operations = [migrations.RunPython(to_tokens, to_hex)]
