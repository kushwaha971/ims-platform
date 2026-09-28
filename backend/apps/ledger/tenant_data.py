"""What a business owns in `ledger` — read by PLT-10's export and deletion.

`ledger_entry` refuses DELETE by trigger (migration 0002). The deletion job is
the one caller that may remove its rows, and it does so by disabling exactly
the trigger named here, inside the transaction that deletes one tenant's rows —
which is what that migration's docstring asked for.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable(
        "ledger.LedgerEntry",
        export_name="ledger_entries.csv",
        triggers=("ledger_entry_forbid_update_delete",),
    ),
    TenantTable("ledger.Reminder", export_name="reminders.csv"),
)
