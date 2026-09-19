"""Enable the PostgreSQL extensions the schema depends on.

`pg_trgm` backs the GIN trigram indexes on `parties_party.name`,
`inventory_item.name` and `tax_hsn.code` (Part 21 §21.4). It is installed by a
migration rather than by the compose init script so a database created any other
way — a restored dump, a managed instance, a CI service container — still gets it.

`common` owns no business tables (Part 20 §20.1.2); this is the one thing it
migrates, and it is deliberately first so every app that needs the extension can
depend on it.
"""

from __future__ import annotations

from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations


class Migration(migrations.Migration):
    initial = True

    dependencies: list = []

    operations = [
        TrigramExtension(),
    ]
