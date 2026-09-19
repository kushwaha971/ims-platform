"""`ck_job_payload_size` — the 64 KB ceiling on `platform_job.payload`.

Part 21 §21.3.1 states it as `CHECK (pg_column_size(payload) < 65536)`. Django's
`CheckConstraint` cannot express a call to `pg_column_size`, so it is added with
`RunSQL` rather than dropped. The reverse is the matching `DROP CONSTRAINT`, so
the migration is reversible (Part 21 §21.8).
"""

from __future__ import annotations

from django.db import migrations

FORWARD = """
ALTER TABLE platform_job
    ADD CONSTRAINT ck_job_payload_size
    CHECK (pg_column_size(payload) < 65536);
"""

REVERSE = """
ALTER TABLE platform_job
    DROP CONSTRAINT IF EXISTS ck_job_payload_size;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("platform", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(sql=FORWARD, reverse_sql=REVERSE),
    ]
