"""What a business owns in `sales` — read by PLT-10's export and deletion.

`SalesDocumentLine` has no tenant column; it reaches the tenant through its
document. It is registered anyway, because its RESTRICT foreign key to
`inventory.Item` is what orders sales before inventory in `deletion_order()` —
registering only the header would let the job reach the items while lines still
point at them.

`SalesCreditApplication` (SAL-04) references two documents with RESTRICT, so
the computed order drains applications before documents; no trigger refuses a
DELETE on it (a void deletes its rows).
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("sales.SalesDocument", export_name="sales_documents.csv"),
    TenantTable(
        "sales.SalesDocumentLine",
        export_name="sales_document_lines.csv",
        tenant_path="document__tenant",
    ),
    TenantTable("sales.SalesCreditApplication", export_name="sales_credit_applications.csv"),
)
