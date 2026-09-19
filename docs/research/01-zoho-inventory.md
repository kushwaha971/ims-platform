# Research Dossier 01 — Zoho Inventory (and Zoho Knowledge-Base capabilities)

**Purpose:** Reference for the UdhaarBook team (SMB inventory + credit-ledger, India). Everything below is sourced from Zoho's public help docs, API docs, pricing pages, release notes, community forum and third-party review sites, retrieved 2026-09-18. Anything not directly verified is tagged **(unverified)**.

**Reading guide.** Part A is a module-by-module catalogue (problem → user → inputs → outputs → rules → states → quirks). Part B is pricing and hard limits. Part C is the evolution timeline. Part D covers Zoho's knowledge-base products and what UdhaarBook should copy. Part E is the complaints digest.

**Key sources (cited inline throughout):**
- Help centre (US mirror, most reliable to fetch): `https://www.zoho.com/us/inventory/help/...`
- India edition help: `https://www.zoho.com/in/inventory/help/...`
- API v1: `https://www.zoho.com/inventory/api/v1/...`
- Pricing comparison (INR): https://www.zoho.com/in/inventory/pricing-comparison/
- What's New: https://www.zoho.com/inventory/whats-new/
- 10-year timeline: https://www.zoho.com/inventory/10-years-of-zoho-inventory/

---

## Part A — Zoho Inventory feature catalogue

### A.0 Architectural facts that shape every module

| Fact | Detail | Source |
|---|---|---|
| Two stock modes | **Accounting Stock** (bills increase, invoices decrease) vs **Physical Stock** (purchase receives increase, shipments decrease). Org picks one as "Mode of Stock Tracking" in Preferences. Every item page shows both sets of figures. | [Item details](https://www.zoho.com/us/inventory/help/items/item-details.html), [Preferences](https://www.zoho.com/us/inventory/help/settings/preferences.html) |
| Stock figures | **Stock on Hand**, **Committed Stock** (confirmed SOs not yet invoiced/shipped), **Available for Sale** = Stock on Hand − Committed Stock. Additional API fields: `location_actual_available_stock`, "To be received", "In-Transit" column on Inventory Summary (added Jul 2026). | Same + [Items API](https://www.zoho.com/inventory/api/v1/items/) |
| Negative stock | **Allowed.** Preference "Do you want an Out of Stock warning whenever your stock drops below zero?" only warns; "Enabling this option will only give you a heads up, however you can proceed". A separate "Prevent zero stock" low-stock setting exists in Preferences → Items (behaviour: blocks invoices/packages that would take stock below zero — **(unverified)** exact semantics). Community threads repeatedly ask for hard blocking on SO confirm. | [KB: Out of stock warning](https://www.zoho.com/de-de/inventory/kb/general-overview/out-of-stock-warning.html), [Community](https://help.zoho.com/portal/en/community/topic/preventing-negative-stock-in-sales-orders-%E2%80%93-best-practices) |
| Shared org with Zoho Books | One organization ID shared across Inventory and Books; "two different organizations cannot be joined". Accounts (sales/purchase/inventory asset) come from Books' chart of accounts. | [Accounting integrations](https://www.zoho.com/us/inventory/help/integrations/accounting-integrations.html) |
| Editions | US, India, UK, Global (2015); Canada, Australia (2016); Germany (2023); plus UAE/KSA, Mexico, Kenya, Singapore etc. India edition adds GST, e-invoicing, e-way bill, TDS/TCS, delivery challan, HSN/SAC, UQC. | [10 years](https://www.zoho.com/inventory/10-years-of-zoho-inventory/) |
| Valuation | FIFO or Weighted Average Cost (WAC); default set at org level, overridable per item (Apr 2026). | [Preferences](https://www.zoho.com/us/inventory/help/settings/preferences.html), [What's New 27 Apr 2026](https://www.zoho.com/inventory/whats-new/) |
| Approvals | No Approval / Simple / Multi-level (up to 10 levels) / Custom (criteria-based) across 13 modules. | [Configure approvals](https://www.zoho.com/us/inventory/help/transaction-approval-new-flow/configure-approvals.html) |

---

### A.1 Items / Products

**Problem solved:** single master record per sellable/purchasable thing, with pricing, tax, tracking and stock. **Target user:** owner / inventory clerk.

**Inputs (exact field names)** — [Create Items](https://www.zoho.com/us/inventory/help/items/items-overview.html):

| Group | Fields |
|---|---|
| Basic | Item Name (required), Item Type (`Goods` / `Service`), "Single Item" vs "Contains Variants", Brand, Manufacturer, HSN or SAC Code (searchable), Unit, Images (≤15, ≤5 MB each; Front/Rear/Other; gif/png/jpeg/jpg/bmp/webp), Dimensions, Weight |
| Identifiers | SKU, UPC, EAN, MPN, ISBN. "UPC and EAN fields are numeric. MPN and ISBN fields are alphanumeric and support letters, numbers, spaces, and hyphens." Since Jul 2026 identifier fields are customisable with role-based access. Alias names (May 2026). MRP field (Jul 2024). |
| Sales Information | Selling Price, Sales Account, Default Unit, Description |
| Purchase Information | Purchase Price (Cost Price), Purchase Account, Default Unit, Description, Preferred Vendor |
| Inventory (Goods only) | "Track Inventory for this item" toggle → Bin Location Tracking (Yes/No), Advanced Inventory Tracking (`Serial Number` / `Batch` / `None`), Inventory Account, Valuation Method (`FIFO` / `WAC`), Reorder Point, Returnable Item flag, Opening Stock (qty + rate, per warehouse) |
| Other | Reporting Tags, Custom Fields (≤44 per module), Category |

**API enumerations** ([Items API](https://www.zoho.com/inventory/api/v1/items/)): `status` = `active|inactive`; `product_type` = `goods|service`; `item_type` = `inventory|sales|purchases|sales_and_purchases`; `tax_specification` (India) = `intra|inter`; `is_taxable`, `can_be_sold`, `can_be_purchased`, `track_inventory` booleans.

**Business rules / validations**
- "Each item can be tracked either by serial numbers or by batch numbers, but not both."
- Service items: no inventory, packaging, shipment, variants, Brand/Manufacturer.
- Duplicate item names allowed only if preference "Allow duplicate item names" is on **and SKU becomes mandatory**.
- Opening stock: ≤200 serial numbers or ≤100 batches per opening stock; batch qty up to 6 decimal places. Opening stock moved off the create form to the item details page (Oct 2025); import/export of opening stock (Jun 2026).
- Delete only if zero associated transactions (opening stock and adjustments count). Otherwise **Mark as Inactive** → cannot be added to new transactions.
- Bin tracking once used in a transaction cannot be disabled.
- Inventory Start Date preference gates historical transactions.
- HSN/SAC preference: 4-digit or 6-digit; bulk "Validate HSN/SAC" and "HSN/SAC Update History"; Sept-22-2025 GST slab revision tool (5/12/18/28 → new slabs) to bulk-update item rates. ([More actions](https://www.zoho.com/us/inventory/help/items/item-managing.html))

**Actions:** Edit (also inline from transactions), Clone, Mark Inactive/Active, Add to Group, Adjust Stock, Generate Barcode, Reorder from Vendor, Attach files, Export (CSV/XLS/XLSX; password; include serial/batch), Import (CSV/TSV; overwrite by Item Name / Item ID / SKU; saved mappings; sources Zoho Books/CRM), Bulk image import via ZIP by SKU (Apr 2025), Bulk update of brand/manufacturer/reporting tags/custom fields (2025-26), Bulk delete.

**UX notes:** item details page tabs = Overview, Serial Numbers (status IN/OUT per warehouse), Batch Details, Transactions (filter by type/status), History (timestamped log), Stock Locations. List view supports column customisation (e.g., Available for Sale, MPN, Dimensions & Weight) and pinning up to 2 columns (Feb 2025). Enhanced Item Search matches any word in the name; search covers SKU/UPC/EAN/ISBN/MPN (Jun 2026).

**Lesson for UdhaarBook:** Zoho's item form is heavyweight; the SMB-relevant minimum is Name, Unit, Selling Price, Cost Price, GST rate + HSN, Opening Stock, Reorder Point, optional barcode. Zoho only recently (2024–26) added MRP, alias names and identifier search — all things Indian kirana/wholesale users ask for on day one.

---

### A.2 Item Groups & Variants ("Items containing variants")

Revamped Jan 2026 from "Item Groups" to "Item Containing Variants". ([Item variants](https://www.zoho.com/us/inventory/help/items/item-groups.html))

- Choose Item Type "Contains Variants"; add Attributes (e.g., Colour, Size) and Options; variants = cartesian combinations (T-Shirt/Blue/S).
- Auto-SKU generator: per attribute choose letters count, First/Last, Upper/Lower case, separator (`- / : . #  ×`), insert Custom Text.
- Per-variant Cost Price / Selling Price with "Copy to All"; per-variant identifiers, custom fields, reporting tags; rename or remove variants (x icon).
- Variants tracked as independent items (own opening stock). Goods only. Attributes within a group must be unique.
- API: `/itemvariants`, `/items/grouping/{group_id}`, `/items/ungroup`, "Mark as Single Item".
- No documented cap on attributes/options **(unverified)**.

---

### A.3 SKUs & Barcodes

- SKU is the primary unique key for marketplace matching and import overwrite. Scanning preference chooses which field a scanner is matched against: SKU, ISBN, UPC, EAN (Preferences → Items → Measurement Units/Barcode).
- **Generation** ([QR/Barcode](https://www.zoho.com/us/inventory/help/items/qrcode-generation.html)): two default templates (linear Code 128 barcode; QR). Encode Item Name / SKU / EAN / UPC / ISBN / Serial Number / Batch Number. Label paper A7, A4 or custom; configure margins (mm), rows × columns, fonts. Custom templates via visual or HTML/CSS editor (Jul 2026); custom **embedded barcodes** with prefix/delimiter/field lengths (Enterprise, Jun–Aug 2026); barcodes from Invoice details page; MRP/org name/logo on labels (Jul 2024); price-list-based QR (Feb 2026). "There is a maximum limit on the number of items" for bulk generation (number not published).
- **Scanning**: in SO, PO, Invoice, Bill, Purchase Receive, Transfer Order, Sales Receipt, Sales Return, Picklist, Custom Modules; repeated scans auto-increment quantity. Mobile app has camera scanning; iOS "Quick Scan" for serial/batch. "Advanced Autoscans" add-on (see Part B) covers document autoscan (Zoho's OCR) — 50 scans/month for $8.
- Barcode generation is a Premium+ feature (pricing page).

---

### A.4 Composite items: Kits and Assemblies

Apr 2025: "Bundles" replaced by a dedicated **Assemblies** module; **Kit items** introduced. ([Composite items](https://www.zoho.com/us/inventory/help/items/composite-items.html), [Assemblies](https://www.zoho.com/us/inventory/help/items/assemblies.html))

| | Assembly item | Kit item |
|---|---|---|
| Physical build | Yes — components consumed, finished good stocked | No — sold as a set; component stock tracked individually |
| Stock | Own stock (via Assemblies, adjustments, receives/bills) | Derived from components |
| Rules | ≥1 inventory item required (services alone not allowed); nested composites allowed; no service-type composite | Same component rules |
| Statuses | Draft → Confirmed (commits/reserves components, Dec 2025) → Assembled. Quick Assembly (instant, Mar 2026). Delete restores component stock | n/a |
| Limits | Bulk delete ≤25 (Jun 2026); export >25,000 records (Jul 2025) | — |
| Tracking | Serial/batch on the finished good; bin fields in import | — |

"Assemble" appears inline on an SO/Invoice when demand exceeds available stock. Composite items are a Standard-plan feature. **No disassembly documented.**

---

### A.5 Categories

Multi-level hierarchy (Stationery → Pens → Parker Pens); no documented depth cap **(unverified)**. Must be enabled via Settings → Items → Field Customization → Category. Delete rules: remove subcategories first; cannot delete while items are associated. Used in advanced search, custom views, "Sales by Category" report, category/subcategory filters on reports, bulk-add line items by category. ([Categories](https://www.zoho.com/us/inventory/help/items/item-categories.html))

---

### A.6 Stock tracking — serial, batch/lot, expiry

([Serial tracking](https://www.zoho.com/us/inventory/help/advanced-inventory-tracking/serial-number-tracking.html), item/invoice/bill pages)

| Aspect | Serial | Batch |
|---|---|---|
| Enable | Preferences → Items → Advanced Inventory Tracking (Premium+); per item choose one | Same |
| Fields | Serial Number (unique per item) | Batch Reference#, Manufacturer Batch#, Manufactured Date, Expiry Date, Quantity In; batch-level selling price (Mar 2026); custom fields on batches (Jun 2026) |
| Transaction limits | ≤1,000 serials per transaction; ≤200 in opening stock | ≤100 batches per line item, ≤5,000 per transaction; ≤100 in opening stock; qty to 6 dp |
| Where captured | Bills, purchase receives, invoices, packages, transfer orders, adjustments, sales returns, assemblies, picklists; serial generation on inward transactions (Mar 2025); bulk serial barcodes (Sep 2025) | Same; "Allow Duplicate Batch Numbers" pref; "Allow Quantity to Be Added Only to the Sold Batch When Returned" |
| Status | IN / OUT per warehouse | Initial vs current quantity per batch; Batch Details Report (inward/outward/price, schedulable) |
| Auto-pick | — | Auto batch assignment FIFO / FEFO / LIFO (early access May 2026) |
| Expiry alerts | — | Not documented as a proactive alert; expiry is a filter/column **(unverified)** |

Edge: "Bills must be Open status or higher to utilize batches in invoices"; a batch-tracked item cannot be added to SO-cycle automation (packages/shipments won't auto-create).

---

### A.7 Warehouses / Locations & multi-location

([Warehouses](https://www.zoho.com/us/inventory/help/warehouses/warehouses-overview.html), [Operations](https://www.zoho.com/us/inventory/help/warehouses/warehouse-operations.html))

- Terminology moved from "Warehouse" to **Location** (API `location_id`; pricing counts "Locations"). A default warehouse is created from the org address. Settings → Warehouses → **Enable Multiwarehouse**.
- Plan caps: Free 1, Standard 2, Premium 4, Plus 6, Enterprise 10; add-on location $10/mo (Part B).
- **Primary** warehouse: transactions default to it; cannot deactivate until another is primary. **Mark as Inactive** freezes stock (transfer it out first). Cannot delete a warehouse with transactions. Disable multiwarehouse only after deleting all but one.
- **Enable Restrictions** (admin): map users to specific warehouses; users only see permitted ones. Users can also be restricted by Reporting Tag.
- Transaction behaviour: PO/Bill — one delivery warehouse for all lines; SO/Invoice — dispatch warehouse per transaction **and per line**; Sales Return — pick receiving warehouse; Adjustments — per warehouse; bundles computed per warehouse; imports accept a Warehouse column per row.
- Location custom fields (early access Mar 2026); price lists associable with locations (May 2026); Location as lookup field in custom modules (Sep 2025).
- **Bin locations** (Jul 2024, [Bins](https://www.zoho.com/us/inventory/help/bin-locations/)): Zone → Bin (with configurable "Level", delimiter, alias). Bins per location: Standard/Premium 500, Plus/Enterprise 5,000. Once used in a transaction a bin cannot be edited/disabled/deleted. Supported in transfer orders, move orders, putaways, bundling, adjustments, picklists, packages, invoices, sales receipts, credit notes, purchase receives, bills, vendor credits. Default bin per item (Feb 2026). Move Orders (statuses draft/confirmed/in progress/completed), Putaways, Picklists = "Advanced Warehousing" add-on or Enterprise.

---

### A.8 Stock transfers (Transfer Orders)

([Transfer orders](https://www.zoho.com/us/inventory/help/warehouses/transfer-orders.html))

- Fields: Transfer Order# (mandatory; auto-gen on import since Jun 2025), Date, Reason, Source Warehouse, Destination Warehouse, per-line Quantity with Source/Destination stock shown; serial pick or batch (Source Batch Ref#, Destination Batch Ref#, Quantity out summing to total).
- **Statuses: Draft → In Transit → Transferred.** Two save actions: **Initiate Transfer** (In Transit; manual receive later, "Mark as Transferred") vs **Transfer and Receive** (immediate).
- Approvals via Preferences → Approvals → Inventory Approval (simple & multi-level, Jul 2025). AfterShip tracking for in-transit orders; timeline view.
- Requires ≥2 warehouses. Print/PDF (bin details optional), Import/Export incl. tracking, barcode scanning (Aug 2025), custom buttons/related lists (Oct 2025). Reports: Transfer Order Summary / Details; "Exclude transfer orders from aging" option on Inventory Aging (Aug 2026).

---

### A.9 Stock adjustments

([Inventory adjustments](https://www.zoho.com/us/inventory/help/items/inventory-adjustments.html))

- Types: **Quantity Adjustment** (theft, damage, data entry error, write-off, donation…) and **Value Adjustment** (only for in-stock items; can now reduce value to zero, Jul 2026).
- Fields: Date, Account, Reason (dropdown; custom reasons; a used reason can only be marked inactive), Warehouse, Reference#, Description, line items with New Quantity on Hand *or* Quantity Adjusted (the other auto-computes), Cost Price (mandatory for positive adjustments; zero allowed since Mar 2026; cost shown for negatives since Mar 2026), Changed Value / Adjusted Value.
- **Statuses: Draft, Adjusted.** Approvals (multi-level, Jul 2025); Status usable as workflow criterion (Aug 2025).
- Only inventory-tracked items. Serial: enter/scan serials. Batch: pick existing or create new batch. Bin details on export (Jul 2026). Bulk actions on ≤25 adjustments (Jun 2026). Reflected in FIFO Cost Lot Tracking report; Inventory Adjustment Summary/Details reports (Aug 2025).

---

### A.10 Inventory valuation

- Methods: **FIFO** and **Weighted Average Cost (moving average)**; org default in Preferences → Items → Default Inventory Valuation; per-item override (Apr 2026); Inventory Valuation Summary shows method per item (Mar 2026).
- Landed cost: enable "Track Landed Cost"; allocate by value or quantity, at bill time or later, across multiple bills in one action (Apr 2025); Landed Cost Summary report.
- Line-item discounts flow into the valuation journal (Jun 2025). Pending Inventory Valuations report lists movements lacking valuation.
- Reports: Inventory Valuation Summary, FIFO Cost Lot Tracking (with Age column, Aug 2026), Weighted Average Costing Summary, WAC Valuation Transactions (Jun 2026), ABC Classification, Landed Cost Summary, Inventory Turnover by Amount. ([Valuation reports](https://www.zoho.com/us/inventory/help/reports/inventory-valuation-reports.html))

---

### A.11 Purchase Orders

([PO creation](https://www.zoho.com/us/inventory/help/purchase-orders/purchase-order-creation.html), [PO API](https://www.zoho.com/inventory/api/v1/purchaseorders/))

- Fields: Vendor Name, Deliver To (Organization / Customer = dropship), Purchase Order#, Reference#, Date, Expected Delivery Date, Payment Terms, Shipment Preference, line items (Item, Quantity, Rate, Tax, Account), Discount (₹ or %, "Apply before tax"), Notes (≤2,000 chars), Terms & Conditions (≤5,000 chars; reusable), attachments, custom fields, Warehouse (one per PO).
- **Statuses:** `Draft`, `Issued` (sent), `Partially Received`, `Received`, `Cancelled`; plus derived statuses added Aug 2025: **In Transit**, **Yet to be Received**, **Billed**; API `billed_status` integer flags; `is_emailed`. Closing rule preference: close when Receive recorded / when Bill created / when both.
- Actions: Mark as Issued, Convert to Bill, Create Purchase Receive, Cancel Items (selective; reopen possible), Clone, Email/WhatsApp (Aug 2025), Print/PDF, Approvals (submit/approve/reject/final).
- Rules: Edit only Draft/Issued; an Issued PO with bills can only *increase* quantities or add items; delete only Draft/Issued without bills/receives; "Edited POs must be resent to vendors"; item cancellation requires partial billing/receiving.
- Plan caps on POs/month (Part B).

---

### A.12 Purchase Receives

([Purchase receives](https://www.zoho.com/us/inventory/help/purchase-orders/purchase-receive.html))

- Fields: Purchase Receive#, Receive Date, per-line Quantity received, Serial/Batch, Bin, custom fields (item-level since Apr 2025), attachments (Feb 2025), warehouse filter on lines (Apr 2026).
- **Statuses: In Transit, Received.** Approval status filter (Jul 2026); simple / multi-level / custom approvals (Oct–Dec 2025).
- Partial receives supported (billed vs unbilled items separately). Converting a receive to a bill is one click. Print/PDF (Jan 2025), comments & history (Jun 2025), column customisation (Jul 2025), Receive History by Item report (Mar 2026).
- Physical-stock mode: receive is the stock-increase event.

---

### A.13 Bills & vendor payments

([Bills](https://www.zoho.com/us/inventory/help/purchase-orders/bills.html))

- Fields: Vendor, Bill#, Order Number, Bill Date, Due Date/Payment Terms, line items (item or account-only expense lines; tax override in itemized expense Aug 2025), Discount, TDS/TCS (India), Notes (≤2,000), T&C (≤5,000), attachments, landed cost.
- **Statuses: Draft, Open, Overdue, Partially Paid, Paid, Void** ("Unpaid" is a filter = Open+Overdue+Partially Paid).
- Payments Made: Record Payment (Date, Payment#, Payment Mode, Amount, Paid Through account, Reference#); excess payment import applied to multiple bills (Dec 2025); delete a bill payment with "Dissociate and Add as Credit" (Apr 2026); vendor payment email templates (Aug 2025); Payment Slip template.
- Rules: partially/fully paid bills cannot be edited or deleted; serial ≤1,000/txn; batch ≤100/line, ≤5,000/txn.

---

### A.14 Vendor Credits

([Vendor credits](https://www.zoho.com/us/inventory/help/vendor-credits/), [Functions](https://www.zoho.com/us/inventory/help/vendor-credits/functions.html))

- Fields: Vendor, Vendor Credit#, Reference/PO#, Date, line items, discount/adjustment with account, Apply Date (May 2025).
- **Statuses: Draft, Open, Closed (fully applied), Void** (Void inferred from Books-shared engine; help page names only "Closed") **(partially unverified)**.
- Actions: Apply to Bills (or "Use Credits" from a bill), Refund (Refunds History tab), Import/Export (CSV/TSV/XLS). Can be auto-created from a confirmed **Purchase Return** (Apr 2026 Enterprise → all editions Jul 2026).

---

### A.15 Sales Orders

([Managing SOs](https://www.zoho.com/us/inventory/help/sales-orders/sales-order-managing.html), [Creating](https://www.zoho.com/us/inventory/help/sales-orders/sales-order-creation.html), [Other actions](https://www.zoho.com/us/inventory/help/sales-orders/other-actions.html), [SO API](https://www.zoho.com/inventory/api/v1/salesorders/))

**Fields:** Customer Name (required; inline create), Billing/Shipping Address (pencil edit; "+ Dropshipping Address"), Sales Order#, Reference#, Sales Order Date, Expected Shipment Date, Delivery Method, Salesperson, Price List (order or line level), Warehouse, line items (Item via search/dropdown/scan, Quantity, Rate, Tax, Discount, Warehouse per line, stock toggle Stock on Hand vs Available for Sale), Shipping Charges, Adjustment, Customer Notes (≤5,000), Terms & Conditions (≤10,000), attachments, custom fields, India: GST Treatment, Place of Supply.

**Statuses (exact):**

| Status | Meaning |
|---|---|
| `Draft` | Created, not sent |
| `Confirmed` | Sent to customer / manually "Mark as Confirmed" |
| `On Hold` | "there's an un-billed backordered PO raised for the Sales Order" |
| `Closed` | Auto when invoice raised and/or shipment fulfilled, per preference "Closing Rules: after shipment / after invoice / after both" |
| `Void` | Frozen/nullified |
| Custom sub-statuses | Admin-defined under a parent (e.g., Confirmed → "To be backordered"); unmapped if parent changes. Filter via "Order Sub-Status" |
| Derived indicators | Three coloured dots in list = invoice status, package status, shipment status; `invoiced_status`, `shipped_status`, `paid_status`, "Picked" status (Aug 2025) |

**Actions:** Save as Draft / Save and Send, Mark as Confirmed (bulk), Send Mail / WhatsApp, Create Invoice (full/partial; multiple SOs → one invoice if same customer, all Confirmed), Create Package, Ship, Create Picklist, Convert to Purchase Order (backorder/dropship), Merge Sales Orders (≤2, same customer & addresses, both Draft or Confirmed, no packages/invoices; irreversible; marketplace SOs excluded), Clone (marketplace SOs excluded), Reopen (legacy manually-closed), Void, Bulk Cancel Items / Bulk Re-open cancelled items, Approvals, Custom Views (≤50/100 per module by plan), Export CSV/XLS, Comments & History, Email insights (opened tracking, Mar 2025), Retail PDF template (Nov 2025).

**Sales Order Cycle automation** ([SO cycle](https://www.zoho.com/us/inventory/help/sales-orders/sales-order-cycle.html)): on confirm, auto-create Invoice (mark Sent, record payment with mode + deposit account), Package, Shipment (carrier, status Shipped/Delivered). Not for serial/batch items; custom fields left blank.

---

### A.16 Packages

([Packages](https://www.zoho.com/us/inventory/help/sales-orders/packages.html))

- Only Confirmed SOs selectable; many packages per SO; Package Slip# auto/manual; Packaging Date; qty to pack per line; Internal Notes; serial/batch; bins; Package Type + Net/Gross Weight + dimensions (2026).
- **Statuses: Not Shipped → Shipped (on shipment creation) → Delivered** (manual mark allowed).
- Import (requires existing SO/items) / Export, bulk PDF download, custom fields incl. lookup/attachment, workflows/custom buttons (Aug 2025), WhatsApp notifications (Jun 2025). Package slip is a template type.

---

### A.17 Shipments & carrier integrations

([Shipments](https://www.zoho.com/us/inventory/help/sales-orders/shipments.html), [Shipping integrations](https://www.zoho.com/us/inventory/help/integrations/shipping-integration.html), [Delhivery](https://www.zoho.com/in/inventory/help/integrations/delhivery-integration.html))

- Manual shipment: Shipment Order#, Carrier (free text), Tracking#, Ship Date, notes. Carrier shipment: rates, label, tracking, options (Saturday delivery, signature, COD), package type/weight; US address verification only.
- **Statuses: Shipped, Delivered, Undelivered** (manual only, reverts from Delivered); carrier-fed "In Transit" implicit.
- Carriers: UPS (direct, OAuth 2.0 v2, Paperless invoice), USPS/FedEx/DHL etc. via **EasyPost** aggregator; regional list includes Aramex, Australia Post, PostNL, Fastway, Hong Kong Post…; **India: Delhivery** (API key; rates, label, 12-hourly auto status, "Check Status"; pickup address must match Delhivery account), **Shiprocket** (COD since Dec 2025), **Envia** (Sep 2024), Easyship. **AfterShip** for tracking-only; customer notifications on ship/deliver; shipment templates.
- Multiple packages per shipment only from the same SO. Shipment Details report; bulk PDF download.

---

### A.18 Invoices

([Invoices](https://www.zoho.com/inventory/help/sales-orders/invoices.html), [More actions](https://www.zoho.com/us/inventory/help/invoice/more-actions.html), [Invoice API](https://www.zoho.com/inventory/api/v1/invoices/))

- Creation: direct (standalone), from one SO, or from multiple Confirmed SOs of the same customer; import (auto-number; link to SO via Order Number column). Draft SOs auto-confirm when linked.
- Fields: Customer (editable only for direct invoice), Invoice#, Order Number (show SO# or Reference#), Invoice Date, Payment Terms/Due Date, Salesperson, Price List, Subject, line items (item headers draggable), Discount, Shipping, Adjustment, Round-off, TDS/TCS, Customer Notes (≤5,000), T&C (≤10,000), Payment Options (gateways, partial payments), attachments (gif/png/jpeg/jpg/bmp/pdf/xls/xlsx/doc/docx, ≤5 MB), QR code (Invoice URL or 250-char message), India: GSTIN, Place of Supply, e-invoice fields.
- **Statuses (API):** `draft`, `sent`, `viewed`, `unpaid`, `partially_paid`, `paid`, `overdue`, `void`. Help lists Draft, Sent, Overdue, Partially Paid, Paid, Void. Write-off marks Paid. Void → can revert to Draft; numbering not reused.
- Actions: Save & Send, Mark as Sent, Schedule email (Draft/Approved/Signed), Share Invoice Link (expiry & visibility; secure public links 2026), Record Payment, Charge Customer (saved card), Write-off / cancel write-off, Void, Delete (unpaid only), Link to Sales Orders, Clone, Print/PDF, bulk PDF ZIP (50–100), bulk JSON download for e-invoice portal (Aug 2024), full refund → auto credit note (Nov 2024), Payment reminders (≤3 automated per type by default + expected-payment-date reminders + manual; WhatsApp reminders Apr 2024), digital signature (Zoho Sign), "Shipped" reconciliation for standalone invoices.
- Rules: no delete/edit after payment; "Edit sent invoices" is a preference; serial/batch limits as bills.

---

### A.19 Retainer Invoices

([Retainer invoices](https://www.zoho.com/us/inventory/help/retainer-invoices/)) — advance-payment documents; fields Customer, Retainer Invoice#, Date, item/service, amount. Record payment (date, deposit account) → apply to one or many invoices (and several retainers to one invoice) → refund via More. Statuses implied Draft / Sent / Paid / Drawn / Void (Books engine) **(unverified names)**. Reports: Retainer Invoice Details. Premium+ feature. Own number series.

---

### A.20 Credit Notes

([Sales returns](https://www.zoho.com/us/inventory/help/sales-returns/sales-returns-overview.html), [Credit notes API](https://www.zoho.com/inventory/api/v1/credit-notes/))

- Created standalone, from a sales return, from an invoice refund, or by import (auto-number). Since Jan 2026 the invoice number can be the reference. Apply Date toggle (Jun 2025).
- **Statuses (API): `draft`, `open`, `void`**; "Closed" when fully applied/refunded (Books convention) **(unverified as displayed label)**.
- Actions: Convert to Open, Apply to Invoices (same customer only), Remove application, Refund (CRUD), Email, Approvals, e-way bill for credit note (saved as Delivery Challan doc type), e-invoice for credit notes (India). Increases *accounting* stock; the physical restock happens via Sales Return receive.

---

### A.21 Customer payments & payment gateways

([Payments received](https://www.zoho.com/us/inventory/help/payments-received/payments-received.html), [Record payment](https://www.zoho.com/in/inventory/help/invoice/record-payment.html), [Reminders](https://www.zoho.com/us/inventory/help/settings/reminders.html), [Zoho Payments](https://www.zoho.com/in/books/help/online-payments/zoho-payments.html), [Paytm](https://www.zoho.com/inventory/help/online-payments/paytm.html))

- Record Offline Payment: Customer, Amount Received, Payment Date, Payment#, Payment Mode (Cash, Cheque, Bank Transfer, Credit Card, UPI, Bank Remittance… editable list), Deposit To account, Reference#, Bank Charges, TDS withheld (India, `tax_amount_withheld`), notes, attachments, "send thank-you note". Split one payment across many invoices; shows **Amount Received / Amount Used for Payments / Amount in Excess** (excess becomes customer credit).
- Edit/Delete only unmatched payments. Import/Export CSV/TSV/XLS. Custom fields; Payment Receipt template; own number series.
- Gateways: global — Stripe (incl. Alipay, PayNow SGD, Tap to Pay on iPhone), PayPal, Authorize.Net, Braintree, CSG Forte, Worldpay, Verifone/2Checkout, Mercado Pago; **India — Razorpay, Paytm (INR only; cards, netbanking, wallet, UPI; QR), PayU (marketplace app), Zoho Payments** (Aug 2024; UPI, cards, netbanking, bank transfer early access; 2-day KYC; disabling removes it from all Zoho Finance apps). Terminal/POS gateways for card/UPI (Jun 2026). Payment links in email/WhatsApp; customer-portal Pay Now with saved cards/ACH.
- Zoho Inventory does **not** offer an interest/late-fee engine or a ledger-style "khata" view; statements (Customer Statement PDF with date range) are the nearest equivalent.

---

### A.22 Customers & Vendors (Contacts)

([Contacts overview](https://www.zoho.com/us/inventory/help/contacts/contacts-overview.html), [Manage](https://www.zoho.com/us/inventory/help/contacts/manage-contacts.html), [Contacts API](https://www.zoho.com/inventory/api/v1/contacts/))

- Types: `customer` / `vendor`; Customer Type `Business` / `Individual`. Fields: Salutation, First/Last Name, Company Name, Display Name (shown on transactions), Email, Work/Mobile Phone, Website, Company ID (Sep 2024), Currency, Payment Terms, Price List, Credit Limit, Opening Balance, Portal access, Portal Language, Tax preference, **India: GST Treatment, GSTIN, PAN, Place of Supply, TDS section**; Billing/Shipping + up to 10 additional addresses (help says 25 total on one page, 10 on another — **inconsistent in docs**); Contact Persons (multiple; custom fields since Aug 2026); Reporting Tags; Custom Fields; Notes; social handles; attachments ≤5 files × 5 MB.
- GST Treatment (API): `business_gst`, `business_none`, `overseas`, `consumer` (UI labels: Registered Business – Regular / – Composition, Unregistered Business, Consumer, Overseas, Special Economic Zone, Deemed Export, Tax Deductor, SEZ Developer — UI list from Books engine **(unverified for Inventory)**).
- Statuses: Active / Inactive. Actions: Mark Inactive, Delete (only with no transactions), **Merge** (same currency; master vs child; irreversible; bulk), Clone, Link customer↔vendor (combined AR/AP view), Statements (PDF/email), Enable Portal (bulk), Export, Import (CSV/TSV ≤1 MB, Books, CRM, G Suite, Office 365; skip/overwrite duplicates), "update changes across all draft transactions" when editing address. Vendor Hierarchy parent-child (Aug 2026). Duplicate display names allowed via preference.
- Contact details page: Overview (receivables/payables, unused credits), Transactions, Mails, Statement, Comments.

---

### A.23 Price Lists

([Price list](https://www.zoho.com/us/inventory/help/items/price-list.html)) — types: **Sales** or **Purchases**; schemes: **Markup/Markdown by %** (with Rounding: never / nearest whole / .99 etc.), **Individual item rates** (per currency), **Volume pricing** (start–end qty tiers, ≤10 ranges per item). Apply at contact level, transaction level, or per line (preference). Import/Export CSV/TSV; active/inactive; location association (May 2026); QR labels from price list. Introduced 2017; volume pricing 2020.

---

### A.24 Taxes — India GST edition

([GST](https://www.zoho.com/inventory/help/gst/), [GST marketing](https://www.zoho.com/in/inventory/gst-compliant/), [e-Invoicing](https://www.zoho.com/in/inventory/help/e-invoicing/), [Set up](https://www.zoho.com/in/inventory/help/e-invoicing/set-up.html), [e-Way bill](https://www.zoho.com/in/inventory/help/e-way-bill/create-e-way-bill.html), [Delivery challan](https://www.zoho.com/in/inventory/help/delivery-challan/delivery-challan.html))

| Capability | Detail |
|---|---|
| GST settings | 15-digit GSTIN, Business Legal Name, registration date, Composition scheme toggle, Reverse Charge, Import/Export (overseas trading), Digital Services; "Default Tax Preference" separate tax groups for **Intrastate (CGST+SGST)** and **Interstate (IGST)**; pre-populated rates (0/0.1/0.25/1.5/3/5/12/18/28) + Cess |
| Place of supply logic | Shipping-address state → fallback billing → default intrastate; drives CGST/SGST vs IGST |
| Items | HSN (goods) / SAC (services); 4- or 6-digit preference; bulk validate; UQC codes on units |
| Compliance docs | "16 mandatory fields" GST invoice; Bill of Supply (composition); Delivery Challan (types: Supply on Approval, Job Work, Liquid Gas, Supply of Semi-assembled goods, Others **(list partly unverified)**; statuses **Draft, Open, Delivered, Returned**; partial returns, one return at a time); Debit/Credit notes |
| e-Invoicing | Zoho is a registered **GSP**; connect IRP with API user credentials (Create API User → Through GSP → Zoho Corporation); one-click push → IRN + signed QR; cancel within IRP window; role permission "Push and Cancel Transactions"; bulk JSON download for portal upload; e-invoice attachment preference per customer/vendor (Mar 2026). Turnover threshold text on page still says ₹500 crore (stale; current law ₹5 crore) |
| e-Way Bill | Generate from invoice/credit note/delivery challan; mandatory fields "Customer Shipping PIN code, Place of Supply, Distance, Vehicle Number/(Transporter Document Number/Document Date), Transportation Mode, Supply Type, HSN for Goods and Organisation Address"; custom threshold (Jul 2025), gold movements (Jul 2025), editable transporter details, validity auto-updated, statuses incl. Not Generated; bulk JSON export |
| TDS / TCS | Section-wise TDS on bills and payments, TCS on invoices; standalone TDS payment for invoices (Jun 2025); Income Tax Act 2025 sections (Mar 2026) |
| GST returns | **Not in Zoho Inventory.** GSTR-1/3B/2 reconciliation live in **Zoho Books** (shared org). Inventory offers tax summary/"Taxes" report category only (**unverified** exact report names in Inventory) |
| Multi-GSTIN | Branch-wise number series ("select the branch you want the series to be associated with") and per-location GSTIN come from Books "Branches"; Inventory locations map to branches **(unverified)** |

---

### A.25 Discounts

Preferences → General: **Item level**, **Transaction level** (before tax / after tax), or "I don't give discounts". Discount as % or flat; `is_discount_before_tax`, `discount_type` = `entity_level|item_level` (API). Line discounts feed valuation (Jun 2025) and Avalara (May 2025). Validation rules can cap discount (e.g., "discount ≤ 10% when invoice total ≥ $30"). Price lists handle structural discounts; loyalty points (Jul 2026) and coupons via Zoho Commerce (Plus plan).

---

### A.26 Returns / RMA

**Sales Returns** ([RMA](https://www.zoho.com/us/inventory/help/sales-returns/sales-returns-overview.html)): item must be **Returnable**; created from SO (not for dropship or manually-fulfilled SOs); fields Return Quantity vs **Credit-Only** quantity (not restocked); statuses **Draft** (Feb 2026), Approved → **Accepted** (Mar 2026), Receive statuses; steps Receive items (physical stock ↑, serial/batch capture) → Credit Note (accounting stock ↑) → Refund or apply credits (same customer). Approval workflows (Jul 2026); barcode scanning (Jun 2024); Shopify returns sync (May 2026); Sales Return History report.

**Purchase Returns** ([Create](https://www.zoho.com/us/inventory/help/purchase-returns/create-purchase-return.html)): from Received POs; fields Vendor, Location, VRA#, Date, Reason, Reference#, items; statuses **Draft, Confirmed** (reduces committed stock); creates Picklist / Package / Shipment / Vendor Credit. Enterprise Apr 2026 → all editions Jul 2026.

---

### A.27 Backorders & Dropship

- Dropship: PO "Deliver To: Customer" or SO → Convert to Purchase Order → Dropship; dropship address on SO (Mar 2025). Standard-plan feature.
- Backorder: SO → Convert to PO for short items; SO goes **On Hold** until the backordered PO is billed; community complains the SO doesn't auto-release when PO is *received* (only billed).
- Composite "Assemble" inline on shortage. Stock Allocation module (preference) for reserving stock.

---

### A.28 Reorder points, low-stock alerts & Replenishments

- Per-item Reorder Point; Preferences → Items → Low Stock Settings: "Notify me if an item's quantity reaches the reorder point", email recipient, out-of-stock warning, prevent zero stock. Vendors module filter "Vendor – Reorder Items" → Order Now → PO. Dashboard badge for low stock.
- **Replenishments** (Jul 2025, [help](https://www.zoho.com/us/inventory/help/items/replenishments.html)): per item/location — Order Type (Purchase Order / Transfer Order), Preferred Vendor / Source Location, Reorder Level, Maximum Stock Level, Min/Max Order Quantity, Unit Multiple, Frequency (days); views Pending / All / Dismissed / Completed; bulk create orders if same vendor & type; partial replenishment (May 2026); include in-transit stock option; import/export; Replenishment Task Details report. Orders are **not** auto-created — user must act.

---

### A.29 Reports (complete list found)

([Reports overview](https://www.zoho.com/us/inventory/help/reports/reports-overview.html) and category pages) — 11 categories; report names:

| Category | Reports |
|---|---|
| Sales | Sales by Customer, Sales by Item, Sales by Category, Sales by Salesperson, Sales Summary, Order Fulfillment by Item, Sales Return History, Profit by Item (charts/forecast/anomaly Dec 2025; credit notes Jul 2026), Sales Channel Integrations Sync Summary, Shipment by Item (Aug 2026) |
| Inventory | Inventory Summary, Committed Stock Details, Inventory Aging Summary, Stock Summary, Stock Counts, Assembly Details, Stock Movement (Jan 2026), Inventory Adjustment Summary, Inventory Adjustment Details, Replenishment Task Details, Packing History, Shipment Details, Inventory Turnover by Quantity |
| Advanced Inventory | Batch Details, Serial Number Details (Nov 2024) |
| Inventory Valuation | Inventory Valuation Summary, FIFO Cost Lot Tracking, ABC Classification, Landed Cost Summary, Inventory Turnover by Amount, Weighted Average Costing Summary, WAC Valuation Transactions |
| Warehouse | Warehouse Details, Bin Location Details, Transfer Order Summary, Transfer Order Details, Picklist Summary, Picklist Details, Location reports |
| Receivables | Invoice Details, Retainer Invoice Details, Sales Order Details, Delivery Challan Details, Customer Balance Summary, Receivable Summary, Receivable Details |
| Payments Received | Payments Received, Credit Note Details, Refund History, Time to Get Paid **(last one unverified)** |
| Payables | Vendor Balance, Bill Details, Payments Made, Purchase Order Details, Purchase Order by Vendor, Purchase Order by Item (Jul 2026), Vendor Credit Details **(unverified)** |
| Purchases & Expenses | Purchases by Item, Receive History, Receive History by Item |
| Activity | System Mails, Activity Logs & Audit Trail, Portal Activities, Customer Reviews, API Usage, Pending Inventory Valuations, Report Activity History |
| Automation | Workflow rules / scheduled actions execution logs |
| Taxes (India) | Tax summary reports **(names unverified)** |
| Custom | "Create New Report" → My Reports; Shared Reports; Scheduled Reports (frequency, recipients, format); limits by plan (Part B); admins see all custom reports (Mar 2026); date-range filters on custom report page; export with org details; grouped totals; chart views |

---

### A.30 Dashboard

([Dashboard](https://www.zoho.com/us/inventory/help/getting-started/dashboard.html)) — revamped Oct 2025. Widgets: **Sales Activity** (To Be Picked / Packed / Shipped / Delivered / Invoiced), **Purchases** (To Be Received, Receive in Progress), **Inventory** (Unconfirmed Items, Transfer in Progress), **Top Selling Items** (top 5 by invoiced qty, % change), **Top Stocked Items**, **Sales by Channel**, **Sales Order Summary** (qty/value graph), **Top Vendors**, **Receive History** (last 25), **Recent Activities** (last 100), date-range control. **Custom dashboards** with predefined + report panels — Enterprise (Aug 2026). Zoho Analytics add-on for deeper BI (Enterprise).

---

### A.31 Notifications, email templates, SMS/WhatsApp

- Email templates for Invoice, SO, PO, payment receipt, reminders, shipment, vendor payment; rich text; Insert Placeholders; multi-language (Oct 2025); SPF/DKIM custom domain else `message-service@sender.zoho-inventory.com`; Email Insights (open tracking). ([Emails](https://www.zoho.com/us/inventory/help/settings/emails.html))
- In-app notifications: reorder point, portal activity (viewed/paid/commented), approvals, workflow alerts.
- **WhatsApp** ([help](https://www.zoho.com/us/inventory/help/integrations/whatsapp-integration.html)): Meta Business + WABA; templates per doc type (Invoice, SO, PO, Payment Receipt, Statement, Retainer, Credit Note, Sales Receipt, Package, Shipment, custom modules); Meta approval ≤24 h; statuses Approved/Rejected/Pending; paid **IM credits**; bulk ≤100 transactions; reports IM Credits Usage, WhatsApp Notifications. SMS via Twilio/Clickatell **(unverified)**.

---

### A.32 Automation

([Automation](https://www.zoho.com/us/inventory/help/settings/automation.html), [Validation rules](https://www.zoho.com/us/inventory/help/settings/validation-rules.html), [Incoming webhooks](https://www.zoho.com/us/inventory/help/settings/incoming-webhooks.html))

| Feature | Detail |
|---|---|
| Workflow Rules | Triggers: Created / Edited / Created or Edited / Deleted; date-based (relative to Order Date, Shipment Date, Created Time; org or customer time-zone, Jun 2025); execute Just Once / Everytime; ≤10 criteria (AND/OR, editable pattern); **10 rules per module**; alerts fire ≤**500/day** |
| Actions | Email Alert (template), In-app Notification, Field Update, Webhook (POST/PUT/DELETE; ≤10 entity params + custom params; auth headers), Custom Function (Deluge) |
| Schedules | Hourly/Daily/Weekly/Monthly/Yearly; ≤10 per org; start ≤1 year out |
| Custom Functions | Deluge; unlimited on paid plans; "Map Return Type" for status tracking (Nov 2025); function library (e.g., #25 auto-create PO from SO) |
| Validation Rules | SO, PO, Invoice, Bill; ≤10 per module; field + criteria + alert message; sub-rules; inactive toggle |
| Incoming Webhooks / Custom Triggers | OAuth or ZAPI-key URLs; headers/params/body; logs; regenerate URL |
| Blueprints | Stage-gated process flows for custom modules (tour guides Jan 2026) |
| Custom buttons / links / related lists | On most modules incl. packages, shipments, receives, returns, transfer orders |
| Extensions / Widget SDK | Marketplace extensions, Zia-generated release notes, role-based access for extension components (Aug 2026) |

---

### A.33 Integrations

| Area | Integrations & rules |
|---|---|
| Sales channels | Shopify (multi-store; orders→SO, stock↔, returns sync, unlisted/archived products, tax remittance US), Amazon (tax breakdown), eBay, Etsy (multi-store Mar 2026), Walmart (May 2026), **WooCommerce** (native Feb 2026; earlier via third-party plugin), Zoho Commerce (bundled in Plus). Rules: base currency must equal channel currency; taxes enabled first; items must pre-exist in channel with matching SKU (or name); item creation one-way channel→Zoho; sync history purged after 1–2 months; retain channel transaction numbers (May 2026). ([Sales channel](https://www.zoho.com/us/inventory/help/integrations/sales-channel.html), [Shopify](https://www.zoho.com/us/inventory/help/marketplaces/shopify.html)) |
| Accounting | Zoho Books (same org), QuickBooks Online, Xero (reverse-charge journals, sales receipts, reference IDs) |
| CRM | Zoho CRM (Professional+): Accounts/Contacts/Vendors/Products, Invoices/SOs/POs; "Fetch from CRM" or "Sync both ways"; master data every 2 h, transactions instant; duplicate = Clone/Overwrite/Skip; one CRM → many Inventory orgs one-way. ([CRM](https://www.zoho.com/us/inventory/help/integrations/crm-integrations.html)) |
| Payments | See A.21 |
| Shipping | See A.17 |
| Others | Zoho Analytics (Enterprise), Zoho Sign, Zoho Cliq (contextual chat), Zoho Desk, Avalara (US tax; Customer Code Aug 2026), Slack, Office 365/G Suite contacts, Zapier/Flow, Web Tabs, Marketplace |

---

### A.34 Users, roles & permissions

([Users & Roles](https://www.zoho.com/us/inventory/help/settings/users.html)) — Predefined: **Super Admin** (org creator; one per org; sole authority to delete org; assignable in existing orgs since Aug 2026), **Admin**, **Staff**; plus custom roles with per-module access levels (View/Create/Edit/Delete/Approve, "More Permissions" e.g., e-invoice push/cancel, PII access, tasks) and per-report access. Segmented access by **Location** and **Reporting Tag**. Field-level access on custom fields (Read/Write, Read Only, Feb 2026) and identifier fields. User statuses Active / Inactive / Deleted; ≥1 active admin required. User caps by plan (Part B); add-on user $7.50/mo. Portal users (customers/vendors) are separate, MFA-enabled (Feb 2025).

---

### A.35 Organizations / multi-org

One Zoho account can own or join multiple organizations (Manage Organizations page; "Leave organization" Jan 2025). Each org = separate subscription, data, edition/country, base currency. Org ID shared with Books. Enterprise unlocks per-contact multi-currency; Premium unlocks multi-currency customers. Transaction locking (date-based; negative-qty restrictions Sep 2025) and Record Locking (multiple configs Jun 2025).

---

### A.36 Custom fields & custom modules

- Custom fields on every module; **≤44 per module**, sub-limits per data type. Types (Books/Inventory engine): Text (≤255), Multi-line (≤36,000), Email, URL, Phone, Number, Decimal, Amount, Percent, Date, Date-Time, Check Box, Auto-Generate Number (prefix/suffix), Dropdown (colour), Multi-select (≤30), Lookup, Multi-select Lookup, Dynamic Lookup (criteria), External Lookup, Attachment (≤7 MB), Image (≤5 MB), Formula, "Inherit Value From" (Oct 2025); AI fields (keyword, sentiment, image-to-text). Options: Mandatory, Show in PDF, PII classification (Encrypted / Unencrypted / Non-PII). ([Custom fields KB](https://www.zoho.com/in/inventory/kb/settings/setting-custom-fields.html), [Data types](https://www.zoho.com/us/books/help/settings/customization/custom-field-data-types.html))
- **Custom Modules** (≤10 per org on paid plans): fields, table fields, custom views, import/export (async for large files), bulk update, blueprints, validation rules, custom buttons, lookups/related lists, workflows, file uploads (≤10 × 10 MB), Scan Item, portal exposure (early access), API, Analytics sync. ([Custom modules](https://www.zoho.com/us/inventory/help/custom-modules/))

---

### A.37 Document templates / PDF

([Templates](https://www.zoho.com/us/inventory/help/settings/templates.html)) — per module (Invoice, SO, PO, Payment Receipt, Package Slip, Shipment, Purchase Receive, Vendor Credit, Transfer Order, Bill, Payment Slip, Barcode, Retail SO…); gallery of predefined designs; sections General / Header & Footer / Transaction Details / Table / Total; placeholders (shown as labelled pills since Jul 2026); A4 or Letter; fonts with language support; multiple templates, per-language, associate to customers/vendors (Jun 2025); Annexures for multi-page (May 2026); active/inactive instead of delete; bin details toggles; digital signature image.

---

### A.38 Import / Export & bulk actions

- Import: CSV/TSV/XLS(X) for every module; sample files; field mapping saved; encoding; duplicate skip/overwrite by unique field (incl. custom unique fields, Jun 2024; PUT upsert API Aug 2024); auto-number; warehouse column per row; contacts file ≤1 MB; async import for big custom-module files.
- Export: CSV/XLS/XLSX; date range; export templates (choose/rename/reorder fields); password protection (CSV/XLSX); include serial/batch/bin; >25,000 composite items; bulk PDF ZIP; org details on report exports.
- Bulk actions: confirm SOs, cancel/reopen items, mark active/inactive, delete (transaction-free), merge contacts, enable portal, update items (brand/manufacturer/tags/custom fields), returnable flag, WhatsApp ≤100, adjustments ≤25, assemblies delete ≤25, bulk barcode generation, bulk approvals. ([Export](https://www.zoho.com/us/inventory/help/import-export/export.html))

---

### A.39 Search, filter, sort

Global search bar with module dropdown; **Advanced Search** per module across default + custom fields; **Zia Search** (2021) cross-module; per-module **Custom Views** (Standard 50, Premium+ 100) with criteria + column preference, "Created By Me"/shared; system filters (Status, All, Draft, Overdue…, Adjustment Type/Reason/Date); column customisation and pin ≤2 columns; sort by column; list page size **(unverified)**; enhanced item search on identifiers/alias; customer/vendor search in transaction dropdowns (Mar 2026); keyboard shortcuts customisable; accessibility panel (Apr 2026). ([Advanced search](https://www.zoho.com/us/inventory/help/advanced-search/search.html))

---

### A.40 Audit trail / activity logs

Per-record **Comments & History** tab (timestamped who/what); item History tab; Activity Logs & Audit Trail report (DATE, ACTIVITY DETAILS, DESCRIPTION incl. old/new field values, click-through); Item Preferences audit trail (Dec 2025); Report Activity History (Dec 2025); Record Participants / Non-Participants (May 2026); Portal Activities; System Mails; API Usage (per user + IP). Retention not published. ([Activity reports](https://www.zoho.com/us/inventory/help/reports/activity-reports.html))

---

### A.41 API

([Intro](https://www.zoho.com/inventory/api/v1/introduction/), [OAuth](https://www.zoho.com/inventory/api/v1/oauth/))

- REST/JSON, v1; base `https://www.zohoapis.{com|eu|in|com.au|jp|ca|com.cn|sa}/inventory/v1/`; `organization_id` on every call; OAuth 2.0 (`Authorization: Zoho-oauthtoken`), access token 1 h, refresh token permanent (≤20 per user; oldest evicted), auth code 60 s; scopes `ZohoInventory.<module>.<CREATE|READ|UPDATE|DELETE>` across 19+ modules.
- **Rate limits:** 100 requests/min per org; daily by plan — API doc says Free 1,000 / Standard 2,000 / Professional 5,000 / Premium & Enterprise 10,000, while the current pricing-comparison says Free 1,000 / Standard 2,500 / Premium 7,500 / Plus & Enterprise 10,000 (docs out of sync; trust pricing page). Concurrency 5 (Free) / 10 (paid). HTTP 429 on breach.
- Pagination `page`/`per_page` (max 200 **(unverified)**); rich filters (`status`, `name_contains`, `sku_startswith`, `date_start`…); bulk endpoints; approvals endpoints; custom field upsert; webhooks outbound via workflows; incoming webhooks; SDKs community-maintained; Postman collection.

---

### A.42 Mobile apps

- iOS (2015) and Android (2018), plus macOS/iPad apps. Store ratings: Google Play 4.4★ (≈4.9K reviews, 1M+ installs); App Store 4.7★ (≈1K ratings). ([Play](https://play.google.com/store/apps/details?id=com.zoho.inventory&hl=en_US), [App Store](https://apps.apple.com/us/app/zoho-inventory-management-app/id1037960494))
- Features: dashboard, items (kits/assemblies), contacts, SO/PO/Invoice/Bill create-edit, packages/shipments with carrier labels, picklists, transfer orders, stock counts (counting is **mobile-only**; approval web-only), bin locations, barcode/serial/batch camera scanning + external scanner, approvals, custom fields, Tap to Pay (Stripe), iMessage invoice share, inventory valuation/comments/history, Liquid Glass + voice commands (iOS 26).
- Gaps users cite: no default sales UoM, fewer reports, limited editing vs web.

---

### A.43 Other modules worth knowing

Sales Receipts (POS-style paid invoices), Delivery Challans (India), Picklists (statuses Yet to Start / In Progress / On Hold / Completed; group By Item / By SO / None), Move Orders & Putaways, Stock Counts (statuses Yet To Start / Counting in Progress / Pending Approval / Completed / Cancelled; auto-adjustment under COGS reason "Stock taking results"; recount), Tasks (priorities very high→very low; Yet to Start / In Progress / Completed + custom sub-statuses; reminders), Documents (inbox + autoscan), Customer Portal (view/pay/comment/statement; no ordering unless Commerce), Vendor Portal, Contextual Chat (Cliq), Web Tabs, Loyalty Points (Jul 2026).

---

## Part B — Pricing & plan limits (as of Sep 2026)

Source: [INR pricing comparison](https://www.zoho.com/in/inventory/pricing-comparison/), [USD pricing](https://www.zoho.com/inventory/pricing/). Prices exclude GST.

| | Free | Standard | Premium | Plus | Enterprise |
|---|---|---|---|---|---|
| INR / org / month (billed monthly) | ₹0 | ₹1,199 | ₹2,699 | ₹5,999 | ₹8,999 |
| INR / org / month (billed yearly) | ₹0 | ₹999 | ₹2,299 | ₹4,999 | ₹7,499 |
| USD / org / month (billed yearly) | $0 | $29 | $79 | $129 | $249 |
| Sales orders / month | 50 | 500 | 3,000 | 7,500 | 15,000 |
| Invoices / month | 50 | 500 | 3,000 | 7,500 | 15,000 |
| Purchase orders / month | 20 | 300 | 1,500 | 3,000 | 7,500 |
| Bills / month | 20 | 300 | 1,500 | 3,000 | 7,500 |
| Users | 1 | 3 | 5 | 10 | 10 |
| Locations (warehouses) | 1 | 2 | 4 | 6 | 10 |
| Bins / location | — | 500 | 500 | 5,000 | 5,000 |
| API calls / day | 1,000 | 2,500 | 7,500 | 10,000 | 10,000 |
| Workflow rules / module | — | 10 | 10 | 10 | 10 |
| Custom views / module | — | 50 | 100 | 100 | 100 |
| Custom reports | — | 10 | 50 | 50 | Unlimited |
| Scheduled reports | — | 5 | 5 | 200 | 200 |
| Custom modules | — | 10 | 10 | 10 | 10 |
| Item images | 15 | 15 | 15 | 15 | 15 |

**Feature gates (headline):**
- Free: basic items, SO/Invoice/PO/Bill, 1 user, 1 location, customer portal? (pricing says Standard+ for portal; comparison table lists it for Free — inconsistent), no automation/custom views/reports.
- Standard: composite items, dropship, backorder, customer portal, categories, price lists, reorder, custom fields, workflows, custom modules, email/in-app alerts, webhooks, custom functions.
- Premium: serial & batch, barcode generation, stock counting, UoM conversion, profit margin (now all editions Mar 2026), contextual chat, vendor portal, retainer invoices, credit notes, multi-currency customers, e-invoicing, sales approvals, shipping labels, template/email customisation, bins.
- Plus: everything + Zoho Commerce Premium (store builder, WhatsApp commerce, coupons, loyalty, abandoned cart).
- Enterprise: Zoho Analytics, per-contact multi-currency, custom dashboards, purchase returns (originally), embedded barcodes, web stock counting.

**Add-ons (annual billing):** extra user $7.50/mo; +500 orders $7.50/mo; extra location $10/mo; Advanced Autoscans (50 scans) $8/mo; **Advanced Warehousing** $124.17/mo (bins, picklists, move orders, putaways, stock counts for non-Enterprise). INR add-on prices not displayed **(unverified)**.

**Observations:** (1) Order caps count SOs *and* invoices *and* POs *and* bills separately — a wholesaler doing 20 invoices/day exhausts Standard. (2) Reviewers call out "plan limitations based on line item counts" — not on the public page **(unverified)**. (3) Third-party pages (e.g., itforsme.in) still show the obsolete Free/Standard/Professional/Premium/Enterprise ladder (₹1,499/₹2,999/₹4,999/₹10,999) — do not rely on them.

---

## Part C — Product evolution / What's New

### C.1 Year-by-year timeline

Sources: [10 years page](https://www.zoho.com/inventory/10-years-of-zoho-inventory/), [What's New](https://www.zoho.com/inventory/whats-new/) (entries from Mar 2024 → Aug 2026), community announcements.

| Year | Milestones |
|---|---|
| **2015** | Launch (Oct) with US, India, UK, Global editions; iOS app; core items/SO/PO/invoice/bill; Shopify/Amazon/eBay/Etsy; Zoho Books coupling |
| **2016** | Multi-warehouse; Canada & Australia editions; composite items (bundles) ~2016–17 |
| **2017** | Workflow automation; price lists; serial & batch tracking; GST edition for India (Jul 2017) |
| **2018** | Custom functions (Deluge); dropshipping & backorders; Android app |
| **2019** | Sales returns (RMA); item categories; package geometry; web tabs; WooCommerce plugin (third-party) |
| **2020** | Volume pricing; picklists; e-invoicing readiness for India (Oct 2020) |
| **2021** | Zia Search; API usage dashboard |
| **2022** | Customer portal; contextual chat (Cliq); shipment management upgrades |
| **2023** | WhatsApp integration; Germany edition; custom function library (#25 auto PO from SO, Oct) |
| **2024** | Delivery challan export (Mar); WhatsApp payment reminders & bulk (Apr); UPS OAuth v2 (May); portal domain → zohosecure.com (May); Sales Return barcode scanning (Jun); import overwrite by custom fields; **Bin Locations (Jul)**; **Stock Counts (Jul)**; MRP field & barcode templates (Jul); e-invoice bulk JSON (Aug); custom workflow triggers; Envia; Company ID; async import/export; bulk invoice ZIP; serial/batch barcodes & Serial Number Details report (Nov); full-invoice refund → credit note (Nov); **Zoho Payments** (Aug, India/US); **Weighted Average Cost** valuation |
| **2025** | Purchase receive print/attachments (Jan–Feb); portal MFA; column pinning; serial generation on inward; dropship address on SO; stock view toggle; **Assemblies & Kit items (Apr)**; bulk image import; multi-bill landed cost; **Replenishments (Apr EA → Jul GA)**; Walmart? (2026); Filipino/Malay; Apply Date; Record Locking; Transfer Order reports; **e-Way Bill custom threshold, gold, transporter edit (Jul)**; templates per contact; Kit items on mobile; multi-level approvals for adjustments/TOs; Shipment Details report; Purchase receive comments; **PO statuses In Transit/Yet to be Received/Billed (Aug)**; PO WhatsApp; Picklist reports; Replenishment reports; Stripe PayNow; custom approvals (Oct); Inherit Value custom field; **Dashboard revamp (Oct, 10-yr)**; opening stock moved; Retail SO PDF; Stock Movement report; chart/forecast/anomaly in reports (Nov); reports re-categorised (Dec); Item Preferences audit trail; Shiprocket COD; Assemblies Confirmed status |
| **2026** | Interactive tour guides; invoice as credit-note reference; **web Stock Counting (Ent)**; **Item Groups → Items with Variants (Jan)**; Advanced Reporting Tags (5 levels, 5,000 options); Move Order statuses; field-level role access; default bins; Draft sales returns; **WooCommerce native (Feb)**; batch price management; MPN column; Etsy multi-store; profit margin all editions; e-invoice attachment prefs; WhatsApp from custom modules; Location custom fields; Widget SDK docs; Quick Assembly; Sales Return Accepted; Income Tax Act 2025 TDS/TCS; package dims/weight; **Purchase Returns (Apr, Ent → Jul all)**; accessibility panel; Android approvals & Tap to Pay; sales tax automation (US); per-item default valuation; bill payment "Dissociate and Add as Credit"; **Walmart (May)**; Shopify returns; auto batch FIFO/FEFO/LIFO (EA); alias names; partial replenishment; Annexures; batch custom fields; terminal gateways; WAC transactions report; opening stock import; bulk adjustments; embedded barcodes; Picklists/Move Orders/Putaways → Analytics; custom barcode HTML templates; In-Transit column; PO by Item report; Value adjust to zero; identifier fields RBAC; sales return approvals; purchase returns all editions; **Loyalty Points (Jul)**; placeholder pills; contact-person custom fields; **Vendor Hierarchy (Aug)**; RBAC for extensions; Avalara customer code; **Custom Dashboards (Aug, Ent)**; Super Admin assignment; picklist grouping by SO |

### C.2 Classification

| Bucket | Features |
|---|---|
| **Historical / foundational (2015–2019)** | Items, contacts, SO→package→shipment→invoice pipeline, PO→receive→bill, multi-warehouse, transfer orders, adjustments, composite bundles, price lists, serial/batch, workflow rules, custom functions, dropship/backorder, sales returns, categories, marketplace & carrier integrations, Books/CRM sync, mobile apps, GST edition |
| **Current / mature (2020–mid-2024)** | Volume pricing, picklists, Zia search, customer & vendor portals, contextual chat, WhatsApp, e-invoicing & e-way bill (India), custom modules, validation rules, approvals, templates, reminders, landed cost, UoM conversion, custom views/reports/scheduled reports |
| **Recently introduced (≈Mar 2025 → Sep 2026)** | Assemblies & Kits, Replenishments, Purchase Returns, Purchase Receive approvals/print/comments, PO transit statuses, Stock Movement/Adjustment/Transfer/Picklist/Shipment/Receive reports, WAC reports & per-item valuation, Items-with-Variants revamp, Advanced Reporting Tags, field-level RBAC, default bins, batch pricing & custom fields, auto batch FIFO/FEFO/LIFO, alias names, MRP-aware labels, embedded/custom barcode templates, Walmart & native WooCommerce, Shopify returns, Loyalty Points, Vendor Hierarchy, Custom Dashboards, chart/forecast/anomaly reports, terminal payments, Annexures, accessibility, Super Admin management, web stock counting |
| **Hinted / roadmap (early access or partner talk)** | Auto batch assignment GA; Location custom fields GA; custom modules in portals GA; Mark-as-Exported in custom modules; Shopify tax remittance GA; Zoho POS/Zakya convergence; deeper Zia/AI (Zia already writes extension release notes; AI custom fields exist in Books); manufacturing/MRP is the most-voted open idea with no commitment |

### C.3 Lessons on how a mature inventory product evolves

1. **Documents first, warehouse later.** Zoho shipped the *paper trail* (SO/PO/Invoice/Bill/Receive) in year 1 and only added physical-warehouse constructs (bins, picklists, stock counts, putaways) in years 9–10. For an SMB product the transaction ledger is the product; WMS is an add-on tier.
2. **Every module eventually gets the same "chassis".** Statuses, custom fields, custom views, approvals, comments & history, attachments, custom buttons, WhatsApp, PDF template, import/export, bulk actions — Zoho spent 2025–26 retrofitting these onto late modules (receives, returns, transfer orders, packages). Design the chassis once and apply it to every entity from day one.
3. **Status granularity grows under pressure.** SO got custom sub-statuses; PO got In Transit / Yet to be Received / Billed a decade after launch; Sales Return got Draft and Accepted; Assemblies got Confirmed. Customers want intermediate states to run their floor — plan for user-defined sub-statuses early.
4. **Stock reality vs book reality diverge.** The Accounting vs Physical stock split, Committed vs Available, In-Transit, Credit-Only returns, "Stock on Hand vs Available for Sale" toggle — all exist because SMBs argue about "how many do I actually have". Expose both numbers plainly.
5. **Reporting is never finished.** Roughly a third of 2025–26 release notes are report columns/filters/scheduling. Ship a flexible report engine (filters, grouping, export, schedule) rather than fixed reports.
6. **Compliance is regional and relentless.** India alone triggered GST (2017), e-invoicing (2020), e-way bill iterations, TDS/TCS law changes (2026), GST slab change tool (Sep 2025). Budget continuous compliance work.
7. **Replace, don't patch, when the model is wrong.** Bundles → Assemblies/Kits; Item Groups → Items with Variants; Warehouse → Location; "Bundles" couldn't express kits vs builds. Expect to re-model 1–2 core entities within 5 years.
8. **Identifier ergonomics come late but matter.** MRP, alias names, identifier search, barcode labels with price — trivial features requested for years by retail users.
9. **Negative stock is a philosophy choice.** Zoho warns but allows; community keeps asking to block. Make it a per-org switch on day one.
10. **Plan caps by document count monetise growth** but generate the loudest pricing complaints; consider caps on users/locations instead of transactions for an India ledger product.

---

## Part D — Zoho knowledge-base capabilities and recommendation

### D.1 Zoho's own help surfaces for Inventory
- **Help Centre** (`zoho.com/{region}/inventory/help/`): static docs organised by module (Getting Started, Items, Sales, Purchases, Inventory/Warehouses, Integrations, Settings, Reports, Migration), region-specific trees (`/in/` has GST, e-Invoicing, e-Way Bill, Delivery Challan). Left-nav tree, breadcrumb, in-page anchors, screenshots, "Notes/Insight" callouts, related-links footers; multi-language mirrors.
- **KB / FAQ** (`zoho.com/{region}/inventory/kb/`): short Q&A articles grouped by topic (General overview, Items, Reports, Settings…).
- **What's New** page (dated changelog, filter by year), **Community** (help.zoho.com — Q&A, ideas with votes, announcements, quarterly "What's New" posts, function library), **Webinars**, **API docs**, **Migration guides**, in-app **interactive tour guides** (2026), **Widget Pane** for announcements (Jul 2025), contextual help links inside settings.

### D.2 Zoho Desk Knowledge Base (the product Zoho sells for KBs)

Sources: [Organizing KB](https://help.zoho.com/portal/en/kb/desk/self-service/knowledge-base/setting-up-and-permission/articles/organizing-your-knowledge-base-content-in-zoho-desk), [Article versions](https://help.zoho.com/portal/en/kb/desk/self-service/knowledge-base/articles/using-article-versions-in-knowledge-base), [Article views](https://help.zoho.com/portal/en/kb/desk/for-agents/articles/knowledge-base-article-views), [KB FAQs](https://help.zoho.com/portal/en/kb/desk/faqs/knowledge-base/articles/faqs-knowledge-base), [KB marketing](https://www.zoho.com/desk/knowledge-base-software.html), [Plan comparison](https://knowledge-base.software/comparison/zoho-desk/)

| Concept | Zoho Desk implementation |
|---|---|
| Structure | Category (tied to a Department/brand) → Section → Sub-section → Sub-sub-section → Articles; max **3 hierarchy levels** under a category; ≤700 sections total (699 within a root); default category per department; secondary departments for cross-access |
| Folders/tags | Sections act as folders; **Tags** on articles; Related Articles; Quick navigation (prev/next) |
| Search | Help-centre search with keyword analytics ("commonly searched keywords"); AI answer bot (Zia) over KB |
| Lifecycle | **Draft → (Review with assigned reviewers) → Published**; also **Unpublished**, **Expired** (expiry date/time with filters "expiring today / 7 days / 30 days"); clone, delete |
| Versioning | Every draft save = minor version; publish = major version; side-by-side compare (content only); restore creates new version; notes ≤250 chars, non-deletable; needs "Knowledge Base – Update" permission |
| Permissions / visibility | Category/section visibility: None (everyone), Groups, Public (registered + all), Agents only, Custom IP; article Display Permission Regd. Users / All Users; agents of associated departments can read but not edit |
| Public vs private | Private agent KB on all plans; **public help centre from Standard**; multi-brand help centres Enterprise; employee self-service portal Enterprise |
| FAQs | Modelled as ordinary articles/sections; templates for consistency (Standard+) |
| Attachments/rich content | Rich text, images, embedded video, attachments, KB Gallery (central media) |
| SEO | Meta title/keywords/description per article (Standard+), 301 redirects & Google Analytics (Professional+), custom domain, CSS/HTML/JS customisation |
| Analytics | Views, likes/dislikes, article usage, search keywords, feedback → tickets |
| Feedback | Like/dislike + comment; feedback auto-creates ticket in primary department |
| Translations | Multilingual KB (Professional), auto-translation to 50+ languages stored as drafts (Enterprise); translations don't auto-update |
| Admin | Reviewer assignment, ordering (manual/alphabetical), move sections, article ownership, no storage or article-count limits |

### D.3 Zoho Learn (internal KB / LMS)
Spaces → Manuals → Chapters → Articles; templates; version history; approval workflow and verification reminders; mandatory reads; role-based and external sharing (branded portals); tags; search; comments/discussions; analytics/CSV; mobile app; AI SOP generator. Oriented to *internal* SOPs rather than customer help. ([Features](https://www.zoho.com/learn/features.html))

### D.4 Recommendation for UdhaarBook

**Include (high value / low cost for an India SMB ledger + inventory app):**

| Concept | Why | How (minimal) |
|---|---|---|
| In-app Help Centre with 2-level tree (Topic → Article) | Zoho's 3–4 levels are for a 100-module suite; UdhaarBook has ~15 concepts. Two levels keep mobile navigation sane | Static Markdown/JSON content bundled + remote-updatable; topics: Getting started, Parties & Udhaar, Items & Stock, Bills/Invoices, GST, Payments & Reminders, Reports, Account & Security |
| Contextual help ("?" per screen) | Zoho users' #1 complaint is "I see a lot of tools I don't know how to use" | Each screen ID maps to 1–3 articles; deep-link to help centre |
| FAQ per topic | Zoho's KB/FAQ layer answers "why can't I delete this item" questions that otherwise become tickets | Q&A pairs, ≤120 words each, searchable |
| Search with synonyms & Hinglish | Indian SMB vocabulary (udhaar/khata/bill/parchi/stock/maal) | Client-side index; log zero-result queries (Zoho tracks "commonly searched keywords") |
| Article lifecycle Draft → Published → Archived, with version history | Cheap to implement in a CMS; lets non-engineers iterate content | Git-backed or headless CMS; no reviewer workflow needed at launch |
| "Was this helpful?" thumbs + optional comment | Zoho pipes dislikes to tickets — for UdhaarBook this is the cheapest content-quality signal | Store per article/version; weekly review |
| Related articles + "next step" links | Mirrors Zoho's Quick Navigation; drives onboarding flow | Manual curation per article |
| Rich media: screenshots, short GIF/video, attachments | Inventory tasks are visual | Keep ≤1 MB per asset for low-bandwidth users |
| Multilingual (English + Hindi first, then Gujarati/Marathi/Tamil) | Zoho gates translation to Enterprise; for kirana/wholesale users language is a core need, not a premium | Same article key, per-locale body; fall back to English |
| What's New / release notes inside the app | Zoho's dated changelog + in-app Widget Pane are well liked | Simple list with date, 1-line entry, optional link |
| Interactive tour guides for 3–4 critical flows | Zoho added in 2026 for blueprints; UdhaarBook needs them for "record udhaar", "add stock", "make GST bill", "send reminder" | Step overlay library; skippable; re-launchable from help |
| Basic analytics | views, helpful ratio, search terms, article → ticket deflection | Event logging only |

**Exclude (for now), with reasons:**

| Concept | Reason to skip |
|---|---|
| Multi-brand / multi-department KBs, per-department categories | Single product, single brand |
| Reviewer/approval workflow, expiry dates, version diff UI | Team is small; Git PR review suffices; expiry rarely matters for product help |
| Visibility tiers (Groups, Custom IP, Agents-only) | No agent tier; all help is public. If a "private" layer is ever needed it's an internal SOP wiki (Notion/Zoho Learn-style), not the customer KB |
| Public SEO help portal with custom domain, 301 redirects, JS customisation | Distribution is app-store + WhatsApp, not organic search; revisit if web app + SEO become acquisition channels |
| Community forum / ideas voting | Zoho's forum shows how much moderation debt accumulates (10-year-old unanswered threads). Use WhatsApp support + in-app feedback instead |
| Auto-translation to 50 languages | Machine-translated accounting/GST content is risky; do 3–5 human-reviewed languages |
| Article templates library, KB media gallery | Overkill for <100 articles |
| Customer-generated reviews/ratings of articles beyond thumbs | Low signal; adds moderation |
| Standalone LMS features (courses, quizzes, certificates, SCORM) | Not a training product |

**Content-model minimum for UdhaarBook help:** `article{id, slug, locale, title, body(md), topic, tags[], related[], screen_ids[], status(draft|published|archived), version, updated_at}`, `faq{question, answer, topic}`, `release_note{date, title, body, version}`, `feedback{article_id, version, helpful, comment, app_version}`, `search_log{query, results_count, locale}`.

---

## Part E — Gaps & complaints

Sources: [Capterra](https://www.capterra.com/p/146241/Zoho-Inventory/reviews/) (4.5★, 421 reviews), [G2](https://www.g2.com/products/zoho-inventory/reviews) (4.4★, 91), [SoftwareSuggest](https://www.softwaresuggest.com/zoho-inventory-management/reviews) (4.7★, 111, largely Indian users), Zoho community threads, app-store reviews.

### E.1 Recurring complaints (ranked by frequency across sources)

| # | Theme | Evidence / quotes | Relevance to UdhaarBook |
|---|---|---|---|
| 1 | **Feature gating & plan caps** | "Certain integrations and features only available on higher tier plans"; "plan limitations based on line item counts in bills, sales orders, and purchase orders"; serial/batch/barcodes only Premium (₹2,299+/mo); monthly caps on SOs + invoices + POs + bills | Price by *users/outlets*, not documents; give barcode + batch/expiry in the base plan |
| 2 | **Reporting rigidity** | "Reporting features somewhat limited, requiring extra effort"; "Custom report building could be more flexible"; dashboard "not updating real time" | Ship a handful of killer reports (party ledger, outstanding ageing, stock summary, GST summary, day book) with WhatsApp/PDF share |
| 3 | **Clutter / learning curve** | "Doesn't allow removing unneeded features, leading to clutter"; "steep learning curve"; "I see a lot of tools I don't really know how to use"; "clinical interface" | Progressive disclosure; hide modules until enabled; contextual help (Part D) |
| 4 | **Mobile app thinner than web** | "mobile features limited compared to desktop"; no default sales UoM on mobile; some edits web-only; stock count approval web-only | Mobile-first parity is a differentiator |
| 5 | **Negative stock / stock control** | Threads asking to block SO confirmation when stock < 0; Zoho only warns; backordered SO releases on bill, not receive | Org-level switch: allow / warn / block |
| 6 | **Support responsiveness** | "Slow response times"; "bug reports closed without explanation"; long-lived community threads without Zoho reply ("2 years on Zoho filled with frustration…") | WhatsApp support with SLA; public status of requests |
| 7 | **Integration friction** | WooCommerce plugin slowness; marketplace mapping issues; "difficult integrating accounting software other than Zoho Books"; base currency must match channel | Keep integrations few and deep (Tally export, WhatsApp, UPI) |
| 8 | **Bulk edit & data hygiene** | "Cannot merge products or reconcile inventory mistakes easily"; "bulk uploads can have glitches"; UoM/image bulk import gaps; no export of images/UoM | Item merge, undo, bulk edit grid |
| 9 | **UX paper-cuts** | "lack of auto-save when adding items to sales orders"; "receiving goods could use a friendlier interface"; "barcode scanning is a little off"; product images only by upload not URL | Autosave drafts; scanner-first receive screen |
| 10 | **Warehouse depth (older reviews)** | "No location tracking within warehouses", "missing picking module" — largely addressed by bins/picklists in 2024–25 | Confirms Lesson 1: SMBs waited 9 years; not a launch priority |
| 11 | **Long-open feature ideas** | Manufacturing/MRP & work orders; multiple vendor SKUs per item; serials at receipt (now added); catalog sharing to customers; POS | Vendor-specific item codes and a shareable catalogue are cheap wins |

### E.2 India-specific observations

- **GST returns live in Zoho Books, not Inventory.** An Indian SMB needing GSTR-1/3B must run both apps (same org) — Inventory alone is not a compliance solution. UdhaarBook can bundle GST summary + JSON export in one app.
- **e-Invoicing setup requires GSP/API-user registration on the IRP** — non-trivial for a shop owner; help text still cites the ₹500 crore threshold. Simplify with guided IRP onboarding.
- **Pricing in INR starts at ₹999/mo per org** with 3 users; batch/expiry (essential for pharma/FMCG kirana) needs ₹2,299/mo. Indian competitors (Vyapar, myBillBook, Khatabook) sit at ₹0–₹300/mo.
- **No khata/udhaar ledger UX**: receivables are invoice-centric; no running party ledger with cash-in/cash-out entries without an invoice, no interest/late fee, no collection reminders by SMS at scale without paid IM credits.
- **Language**: UI is English-only for India (multi-language exists for PDF/email templates and some UI locales such as Filipino/Malay; Hindi/vernacular UI not documented **(unverified)**).
- **Tally**: no native Tally integration (requests exist in community); Indian CAs still expect Tally exports.
- **Payments**: Zoho Payments/Razorpay/Paytm cover UPI, but no "collect via UPI QR on the bill PDF and auto-match" flow documented for offline UPI transfers beyond gateway payments.
- **Shipping**: only Delhivery, Shiprocket, Envia natively; no Bluedart/DTDC/India Post direct.

### E.3 What Zoho does well that UdhaarBook should not under-estimate
- Clean status vocabularies and derived indicators (three-dot invoice/package/shipment status) — users understand order state at a glance.
- Every transaction has Comments & History; audit trail with old/new values.
- Import/export everywhere, with saved mappings and password-protected exports.
- Sales Order Cycle automation (one click → invoice + package + shipment + payment) — a good model for "record sale → bill → stock → ledger → WhatsApp" in one tap.
- Consistent PDF templating with per-customer template association and multilingual documents.

---

### Appendix — Verification notes
- Zoho help pages on `www.zoho.com/inventory/help/...` returned HTTP 403 to automated fetches; the `/us/` and `/in/` mirrors were used and are content-identical apart from region-specific trees.
- Where the API docs and pricing page disagree (daily API limits; plan names "Professional" vs "Plus"), the pricing page (updated 2026) was preferred.
- Items marked **(unverified)**: exact UI labels of GST treatments in Inventory, retainer/credit-note "Closed" labels, page-size limits, INR add-on prices, Free-plan customer portal, per-location GSTIN mapping, SMS providers, list of delivery-challan types, Indian-language UI availability, "line item count" plan limits, Time-to-Get-Paid & Vendor Credit Details report names.
