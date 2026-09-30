"""What a business owns in `parties` — read by PLT-10's export and deletion.

See `apps.common.tenant_data`. The join table has no tenant column of its own,
so it is reached through the party.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("parties.Party", export_name="parties.csv"),
    TenantTable("parties.Tag", export_name="tags.csv"),
    TenantTable("parties.PartyTag", export_name="party_tags.csv", tenant_path="party__tenant"),
)

# ── A6 ── PLT-X04 relations
register(TenantTable("parties.PartyRelation", export_name="party_relations.csv"))
