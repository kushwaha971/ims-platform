"""What a business owns in `notifications` — read by PLT-10's export and deletion.

The in-app inbox is not exported (it is the product talking to the merchant,
not the merchant's records); the message log is, because it is the record of
what was said to each customer (FR-1).
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("notifications.MessageLog", export_name="message_log.csv"),
    TenantTable("notifications.Notification"),
    TenantTable("notifications.MessageTemplate", export_name="message_templates.csv"),
)
