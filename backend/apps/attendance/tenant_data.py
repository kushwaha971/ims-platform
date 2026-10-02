"""What a business owns in `attendance` — read by PLT-10's export and deletion.

The deletion order is derived from the RESTRICT FKs (`tenant_data.deletion_order`):
uses before marks and entitlements, marks before sessions, sessions and
members before groups, and every `attendance_*` table before `parties_party`.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("attendance.Group", export_name="attendance_groups.csv"),
    TenantTable("attendance.GroupMember", export_name="attendance_group_members.csv"),
    TenantTable("attendance.Session", export_name="attendance_sessions.csv"),
    TenantTable("attendance.Mark", export_name="attendance_marks.csv"),
    TenantTable("attendance.Entitlement", export_name="attendance_entitlements.csv"),
    TenantTable("attendance.EntitlementUse", export_name="attendance_entitlement_uses.csv"),
)
