# Part 5 — Zoho Inventory: Decision-Oriented Analysis

*Zoho Inventory is the most complete public specification of what an SMB inventory product looks like after ten years of production use. Dossier R1 catalogues it module by module with exact field names, status enumerations, limits and quirks. This chapter condenses that catalogue into decisions. For each major area it states what Zoho does, what UdhaarBook does, and an explicit **ADOPT / ADAPT / REJECT** verdict with reasoning and a pointer to the UdhaarBook feature ID that carries it.*

*The verdicts mean: **ADOPT** — take Zoho's model substantially as-is because it is correct and battle-tested. **ADAPT** — take the idea but change the shape for an India-first, ledger-first, mobile-first product. **REJECT** — deliberately do not build this, with a reason.*

---

## 5.1 Information architecture

Zoho Inventory organises itself as a suite of sibling modules — Items, Item Groups, Composite Items, Price Lists, Contacts, Sales Orders, Packages, Shipments, Invoices, Sales Receipts, Retainer Invoices, Credit Notes, Sales Returns, Delivery Challans, Purchase Orders, Purchase Receives, Bills, Vendor Credits, Purchase Returns, Transfer Orders, Move Orders, Putaways, Picklists, Stock Counts, Adjustments, Warehouses, Bins, Documents, Tasks, plus Reports, Dashboard and Settings [R1 §A.1–A.43]. It shares one organisation ID with Zoho Books, and accounts (sales, purchase, inventory asset) come from Books' chart of accounts; "two different organizations cannot be joined" [R1 §A.0].

Underneath the module sprawl sits a **consistent chassis** that every entity eventually receives: statuses, custom fields (≤44 per module), custom views, approvals, comments and history, attachments, custom buttons, WhatsApp send, a PDF template, import/export and bulk actions. Zoho spent 2025–26 retrofitting this chassis onto its late modules — purchase receives, returns, transfer orders, packages [R1 §C.3 lesson 2].

**Verdict on the chassis: ADOPT.** This is the single most valuable architectural lesson in the dossier. UdhaarBook defines the chassis once — canonical statuses (Part 0 §0.7), an append-only `AuditLog`, attachments through `files_attachment`, list filters and CSV export, and a share/print path — and instantiates it for every entity from day one rather than retrofitting. Carried by: Part 0 §0.11 rules 1–7, PLT-08, IMP-02.

**Verdict on the module sprawl: REJECT.** Zoho's own third-ranked complaint is clutter: "doesn't allow removing unneeded features"; "I see a lot of tools I don't really know how to use"; "steep learning curve" [R1 §E.1 #3]. UdhaarBook ships eleven modules at MVP, each toggleable per tenant, seeded from the business-type choice. A services business sees no inventory at all. Carried by: Part 0 §0.3 module map, PLT-06.

**Verdict on the split between Inventory and Books: REJECT.** An Indian SMB needing GSTR-1 or 3B must run two Zoho products on a shared organisation, because GST returns are not in Inventory [R1 §E.2]. UdhaarBook puts the GST summary, HSN summary and document-series summary in the same product as the invoice that produced them. Carried by: RPT-07, later RPT-12.

---

## 5.2 Stock models: accounting versus physical

This is Zoho's deepest and least obvious design decision. The organisation picks one "Mode of Stock Tracking": **Accounting Stock** (bills increase, invoices decrease) or **Physical Stock** (purchase receives increase, shipments decrease). Every item page shows both sets of figures [R1 §A.0]. Alongside it sit **Stock on Hand**, **Committed Stock** (confirmed sales orders not yet invoiced or shipped), **Available for Sale** = on-hand minus committed, plus API fields for location-actual-available, "To be received", and an In-Transit column added July 2026 [R1 §A.0].

The reason this exists is stated in the evolution analysis: *"Stock reality vs book reality diverge… all exist because SMBs argue about 'how many do I actually have'. Expose both numbers plainly"* [R1 §C.3 lesson 4].

**Verdict: ADAPT.** UdhaarBook does not implement two stock modes, because it has no separate receive-and-ship pipeline at MVP — an invoice *is* the shipment for a counter sale. What it adopts is the *principle*: `StockMovement` is an immutable signed quantity change and on-hand is the sum of movements, with `ItemStock` as a denormalised, recomputable cache (Part 0 §0.6). Committed stock becomes meaningful only when sales orders arrive in Phase 3 (SAL-11), and In-Transit only with multi-location transfers in Phase 2 (INV-11). Until then there is exactly one number — on-hand — which is the honest answer for a single-location business. Carried by: INV-03, INV-08.

### Negative stock

Zoho **allows** negative stock. The preference "Do you want an Out of Stock warning whenever your stock drops below zero?" only warns — "Enabling this option will only give you a heads up, however you can proceed" — and community threads repeatedly ask for hard blocking on sales-order confirmation [R1 §A.0, §E.1 #5]. The dossier's lesson is explicit: *"Negative stock is a philosophy choice. Zoho warns but allows; community keeps asking to block. Make it a per-org switch on day one"* [R1 §C.3 lesson 9].

**Verdict: ADAPT — build the switch, default to block.** UdhaarBook exposes a tenant setting with three values (allow / warn / block) and defaults to **block** for stock-tracked items, because an Indian retail counter selling what it does not have produces a stock ledger nobody trusts, and because the complaint direction in the community is unambiguous. Carried by: INV-06, PLT-06.

### Valuation

Zoho offers FIFO and Weighted Average Cost, set at organisation level and overridable per item since April 2026, with an Inventory Valuation Summary showing the method per item, plus landed-cost allocation by value or quantity across multiple bills, and seven valuation reports [R1 §A.10].

**Verdict: ADAPT — weighted average only at MVP.** FIFO cost-lot tracking requires a lot ledger and doubles the complexity of every inward and outward movement. Weighted average is sufficient to answer the two questions an Indian SMB actually asks — what is my stock worth, and what did this item cost me — and is what `ItemStock.avg_cost` maintains. FIFO, landed cost and per-item override are deferred. Carried by: INV-08, RPT-10; landed cost is PUR-08 (Phase 2).

---

## 5.3 The item model

Zoho's item form spans six field groups: Basic (name, type goods/service, single-versus-variants, brand, manufacturer, HSN/SAC, unit, up to 15 images at 5 MB each, dimensions, weight), Identifiers (SKU, UPC, EAN, MPN, ISBN, alias names, MRP), Sales Information, Purchase Information, Inventory (track-inventory toggle, bin tracking, advanced tracking serial-or-batch, inventory account, valuation method, reorder point, returnable flag, opening stock per warehouse) and Other (reporting tags, up to 44 custom fields, category) [R1 §A.1].

The API enumerations are worth recording because they are a well-considered decomposition: `status` = active|inactive; `product_type` = goods|service; `item_type` = inventory|sales|purchases|sales_and_purchases; `tax_specification` (India) = intra|inter; plus `is_taxable`, `can_be_sold`, `can_be_purchased`, `track_inventory` booleans [R1 §A.1].

The business rules are equally instructive. An item can be tracked by serial numbers **or** batch numbers, never both. Service items have no inventory, packaging, shipment, variants, brand or manufacturer. Duplicate item names are allowed only if a preference is on **and SKU becomes mandatory**. Deletion requires zero associated transactions — including opening stock and adjustments — otherwise the item must be marked inactive, which blocks it from new transactions. Bin tracking, once used in a transaction, cannot be disabled [R1 §A.1].

The dossier's own verdict on the form: *"Zoho's item form is heavyweight; the SMB-relevant minimum is Name, Unit, Selling Price, Cost Price, GST rate + HSN, Opening Stock, Reorder Point, optional barcode. Zoho only recently (2024–26) added MRP, alias names and identifier search — all things Indian kirana/wholesale users ask for on day one"* [R1 §A.1].

**Verdict on the field set: ADAPT — take the minimum, add MRP from day one.** INV-01 specifies name, type (goods/service), SKU with auto-suggest, barcode, category, unit, HSN/SAC, GST rate from the tax table, purchase price, selling price, **MRP**, track-stock flag, reorder point, image and description. Zoho took nine years to add MRP (July 2024) and identifier search (June 2026); for Indian retail these are day-one requirements, not enhancements [R1 §C.3 lesson 8]. UPC, EAN, MPN, ISBN, brand, manufacturer, dimensions and weight are rejected at MVP as marketplace-seller fields.

**Verdict on the goods/service split: ADOPT.** `Item.item_type ∈ {goods, service}` with services carrying no stock is exactly right and is already canon (Part 0 §0.2). Services use SAC rather than HSN.

**Verdict on active/inactive instead of delete: ADOPT, with a rename.** Zoho's rule — delete only when there are zero transactions, otherwise mark inactive — is correct and is the only safe behaviour for a financial record. UdhaarBook calls it `archived` and additionally blocks archiving while on-hand ≠ 0 (Part 0 §0.7), which Zoho does not, because a business archiving an item with stock silently loses valuation. Carried by: INV-01, Part 0 §0.7.

**Verdict on 44 custom fields per module: REJECT at MVP.** Custom fields are a Phase 3+ consideration and an ADR when they arrive. They are the single largest source of complexity in a document engine — affecting forms, PDFs, imports, exports, reports, permissions and the API simultaneously.

**Verdict on serial-or-batch-but-not-both: ADOPT when the feature arrives.** The constraint is correct and prevents an unresolvable picking ambiguity. Carried by: INV-16, INV-18 (Phase 3).

---

## 5.4 Item groups, variants, kits and assemblies

Zoho revamped "Item Groups" into "Items Containing Variants" in January 2026: attributes and options produce a cartesian set of variants, each tracked as an independent item with its own opening stock, prices, identifiers and custom fields, plus an auto-SKU generator with configurable letter counts, case, separators and custom text [R1 §A.2].

Separately, in April 2025 Zoho replaced "Bundles" with a dedicated **Assemblies** module plus **Kit items** [R1 §A.4]:

| | Assembly item | Kit item |
|---|---|---|
| Physical build | Yes — components consumed, finished good stocked | No — sold as a set; components tracked individually |
| Stock | Own stock | Derived from components |
| Statuses | Draft → Confirmed (reserves components) → Assembled; Quick Assembly for instant | n/a |
| Rules | ≥1 inventory item required; nested composites allowed; no service-type composite | Same |

Critically, **no disassembly is documented** [R1 §A.4].

**Verdict on variants: ADAPT — Phase 2, one attribute set, no auto-SKU generator.** Garment and footwear retail genuinely need size and colour variants, so INV-12 is a Phase 2 feature. But the auto-SKU generator with configurable case and separators is a power-user affordance that a kirana will never use, and the cartesian explosion needs a hard cap. Carried by: INV-12.

**Verdict on assemblies versus kits: ADOPT the distinction, REJECT the timing.** The Bundles → Assemblies/Kits re-modelling is the clearest example of Zoho's own lesson 7 — *"Replace, don't patch, when the model is wrong… Expect to re-model 1–2 core entities within 5 years"* [R1 §C.3 lesson 7]. The distinction between a physical build (components consumed, finished good stocked) and a sold-together set (components tracked individually) is real and must be respected *if and when* composites are built. But manufacturing and MRP remains the most-voted, never-committed idea on Zoho's forum after ten years [R1 §C.2], which is evidence that the demand is loud but narrow. Carried by: INV-19 (Future), with the assembly/kit distinction recorded now so the model is right when it arrives.

---

## 5.5 Status models

Zoho's status vocabularies are the single best thing about the product and are the direct source of Part 0 §0.7. The exact enumerations are worth restating because UdhaarBook's are derived from them.

| Zoho entity | Zoho statuses | UdhaarBook equivalent | Verdict |
|---|---|---|---|
| Invoice (API) | `draft`, `sent`, `viewed`, `unpaid`, `partially_paid`, `paid`, `overdue`, `void` | `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `void` | **ADAPT** — merge sent/viewed/unpaid into `issued`; email open-tracking is not an MVP capability and "viewed" without it is a lie |
| Sales Order | `Draft`, `Confirmed`, `On Hold`, `Closed`, `Void` + custom sub-statuses + three derived dots (invoice/package/shipment) | Deferred to SAL-11 (Phase 3) | **ADAPT later** — adopt Draft/Confirmed/Closed; reject On Hold (it exists only because backorders release on *bill* rather than *receive*, a behaviour Zoho's own community complains about [R1 §A.27]) |
| Purchase Order | `Draft`, `Issued`, `Partially Received`, `Received`, `Cancelled` + derived In Transit / Yet to be Received / Billed | `draft`, `sent`, `partially_received`, `received`, `closed`, `cancelled` (PUR-05, Phase 2) | **ADOPT** — near-identical; the derived statuses took Zoho ten years to add [R1 §C.3 lesson 3] and are designed in from the start |
| Purchase Receive | `In Transit`, `Received` | PUR-06 (Phase 2) | **ADOPT** |
| Bill | `Draft`, `Open`, `Overdue`, `Partially Paid`, `Paid`, `Void` (with "Unpaid" as a filter, not a status) | `draft`, `recorded`, `partially_paid`, `paid`, `overdue`, `void` | **ADOPT**, renaming Open → `recorded`. The "Unpaid is a filter, not a status" distinction is important and is copied |
| Credit Note (API) | `draft`, `open`, `void`; "Closed" when fully applied | `draft`, `issued`, `applied`, `void` | **ADAPT** — make `applied` an explicit status rather than a derived label, because the dossier flags Zoho's display label as unverified [R1 §A.20] |
| Transfer Order | `Draft` → `In Transit` → `Transferred`, with two save actions (Initiate Transfer vs Transfer and Receive) | INV-11 (Phase 2) | **ADOPT**, including the two-action pattern — an SMB moving stock between two shops in the same town wants the one-step action |
| Stock Adjustment | `Draft`, `Adjusted` | `posted` only | **ADAPT** — no draft state; an adjustment is a deliberate act and a draft adjustment is stock limbo |
| Sales Return | `Draft` (Feb 2026), Approved → `Accepted` (Mar 2026), plus receive statuses | Folded into SAL-04 credit note | **REJECT the separate entity at MVP** — a two-document return flow (receive, then credit note) is correct for a warehouse and wrong for a counter |
| Delivery Challan | `Draft`, `Open`, `Delivered`, `Returned` | SAL-09 (Phase 2) | **ADOPT** |
| Picklist | Yet to Start / In Progress / On Hold / Completed | Not planned | **REJECT** |
| Stock Count | Yet To Start / Counting in Progress / Pending Approval / Completed / Cancelled | INV-17 (Phase 3) | **ADAPT** — drop Pending Approval; approval workflows are not an SMB pattern |

Two cross-cutting verdicts.

**Custom sub-statuses: REJECT at MVP, revisit in Phase 3.** Zoho lets administrators define sub-statuses under a parent (Confirmed → "To be backordered") and its own lesson says *"Customers want intermediate states to run their floor — plan for user-defined sub-statuses early"* [R1 §C.3 lesson 3]. That is a genuine insight, but sub-statuses touch every filter, report and permission. The design accommodation UdhaarBook makes now is that statuses are stored as short codes with a display layer, so sub-statuses can be added without a migration.

**Derived statuses computed by a nightly job: ADOPT.** `overdue` in UdhaarBook is derived (issued or partially-paid with `due_on < today`) but *stored* so it can be filtered and indexed, refreshed by a scheduled management command (Part 0 §0.7, ADR-012). This is exactly Zoho's pattern and avoids the classic mistake of computing overdue in every query.

---

## 5.6 Multi-warehouse and locations

Zoho renamed "Warehouse" to **Location** (API `location_id`), creates a default from the organisation address, and gates the count by plan: Free 1, Standard 2, Premium 4, Plus 6, Enterprise 10, with an extra location at $10/month [R1 §A.7, §Part B]. A **primary** warehouse receives transaction defaults and cannot be deactivated until another is primary; marking inactive freezes stock and requires transferring it out first; a warehouse with transactions cannot be deleted; multi-warehouse can only be disabled after deleting all but one [R1 §A.7].

Transaction behaviour is asymmetric and instructive: purchase orders and bills carry **one delivery warehouse for all lines**, while sales orders and invoices allow a dispatch warehouse **per transaction and per line**; sales returns pick a receiving warehouse; adjustments are per warehouse; imports accept a warehouse column per row [R1 §A.7]. **Enable Restrictions** maps users to specific warehouses so they see only permitted ones [R1 §A.7].

**Bin locations** (July 2024) add a Zone → Bin hierarchy with a configurable level, delimiter and alias, capped at 500 bins per location on Standard and Premium and 5,000 on Plus and Enterprise, immutable once used in a transaction, supported across sixteen document types, and — with Move Orders, Putaways and Picklists — sold as an "Advanced Warehousing" add-on at $124.17/month or bundled with Enterprise [R1 §A.7, §Part B].

**Verdict on multi-location: ADAPT — Phase 2, uncapped.** INV-11 delivers a locations master with transfers posting atomic −out/+in movements and per-location on-hand. The capping by plan is **REJECTED**: a distributor with three godowns is exactly the customer UdhaarBook wants, and charging per location is Zoho's model, not the Indian market's (myBillBook advertises "unlimited godowns" on a ₹3,990/year plan [R3 §3.1]).

**Verdict on the one-warehouse-per-purchase, per-line-on-sales asymmetry: ADOPT.** It matches reality — goods arrive at one door and can ship from several.

**Verdict on user-to-location restriction: ADAPT to Phase 3.** The need is real for a multi-outlet retailer but the permission surface is large; it belongs with custom roles (PLT-12).

**Verdict on bins, picklists, move orders and putaways: REJECT.** This is the clearest application of Zoho's own lesson 1 — *"Documents first, warehouse later… Zoho shipped the paper trail in year 1 and only added physical-warehouse constructs in years 9–10. For an SMB product the transaction ledger is the product; WMS is an add-on tier"* [R1 §C.3 lesson 1]. The corresponding complaint — "no location tracking within warehouses", "missing picking module" — appears only in *older* reviews and is explicitly annotated "SMBs waited 9 years; not a launch priority" [R1 §E.1 #10].

---

## 5.7 Numbering series

Zoho gives every document type its own auto-number series with a configurable prefix, and supports branch-associated series for multi-GSTIN organisations ("select the branch you want the series to be associated with"), with the branch concept inherited from Zoho Books [R1 §A.24]. On import, numbers auto-generate. Voided invoice numbers are **not reused** [R1 §A.18].

Indian law constrains this more tightly than Zoho's generic engine suggests: a tax invoice serial number must be **consecutive, at most 16 characters, unique per financial year, alphanumeric with only `/` and `-` permitted**, and the series must be declared and predictable [R2 §C.1]. GSTR-1 Table 13 requires a document-series summary.

**Verdict: ADAPT — per tenant × document kind × financial year, reset on 1 April.** `DocumentSequence` is a canonical entity (Part 0 §0.6) keyed exactly this way. The 16-character and character-set constraints are validated at the model layer rather than left to the user. Voided numbers are retained and never reused, which UdhaarBook **ADOPTS** from Zoho and which Indian law effectively requires since the series must be consecutive. Multi-GSTIN branch series are deferred: a tenant is one GSTIN at MVP. Carried by: PLT-06, SAL-05, RPT-07.

---

## 5.8 Contacts, price lists and discounts

Zoho keeps a single Contacts module with `contact_type` = customer|vendor and `customer_type` = Business|Individual, carrying credit limit, opening balance, payment terms, price list, portal access, and for India GST Treatment (`business_gst`, `business_none`, `overseas`, `consumer`), GSTIN, PAN, place of supply and TDS section, plus billing and shipping addresses with up to ten additional addresses, multiple contact persons, reporting tags and attachments. It supports **linking a customer to a vendor** for a combined AR/AP view, and an irreversible **merge** for duplicates [R1 §A.22].

**Verdict on the single Contacts table: ADOPT and go further.** UdhaarBook's `Party` carries `is_customer` and `is_supplier` **flags on one row** rather than a type plus a link, which handles the extremely common Indian case where the same person buys and sells (Part 0 §0.2). This is strictly better than Zoho's customer↔vendor linking. Carried by: PTY-01.

**Verdict on merge: ADOPT, Phase 2.** Duplicate parties are inevitable when adding from contacts. Zoho's merge is irreversible; UdhaarBook's re-points ledger entries with a full audit trail (PTY-08).

**Verdict on GST Treatment enumeration: ADAPT.** UdhaarBook derives treatment from the party's GSTIN presence and state rather than asking the user to pick from an eight-option dropdown whose UI labels the dossier could not even verify [R1 §A.22]. Registered/unregistered/consumer/overseas is the working set.

**Verdict on price lists: ADAPT to Phase 2.** Zoho supports markup/markdown by percentage with rounding rules, individual item rates per currency, and volume pricing with up to ten quantity tiers per item [R1 §A.23]. Wholesale versus retail pricing is a genuine Indian need (INV-13), but volume tiers and rounding schemes are not MVP.

**Verdict on discount configuration: ADAPT — support both levels, no global "I don't give discounts" mode.** Zoho forces an organisation-wide choice between item-level, transaction-level (before or after tax) and no discounts [R1 §A.25]. Forcing that choice produces a support ticket the first time a shopkeeper needs the other kind. UdhaarBook supports line discount and document discount simultaneously, with `is_discount_before_tax` semantics fixed by GST rules (taxable value is computed after discount per Rule 46 [R2 §C.1]). Carried by: SAL-02.

---

## 5.9 The India GST surface

Zoho's India edition is the most complete GST implementation described in any of the dossiers: 15-digit GSTIN with business legal name and registration date, a composition toggle, reverse charge, import/export, separate default tax groups for intrastate (CGST+SGST) and interstate (IGST), pre-populated rates (0/0.1/0.25/1.5/3/5/12/18/28) plus cess, place-of-supply logic falling back from shipping to billing to default intrastate, HSN for goods and SAC for services with a 4-or-6-digit preference and bulk validation, delivery challans, debit and credit notes, e-invoicing as a registered GSP with one-click IRN and signed QR, e-way bills with eleven mandatory fields and a custom threshold, and section-wise TDS and TCS [R1 §A.24].

Three things are wrong with it from an Indian SMB's point of view, and all three are recorded in the dossier. GST **returns are not in the product** — GSTR-1/3B reconciliation lives in Zoho Books on the shared organisation [R1 §A.24, §E.2]. The e-invoicing setup requires the merchant to register an API user on the IRP and route through a GSP, which is "non-trivial for a shop owner", and the help text still cites the obsolete ₹500 crore threshold against a current ₹5 crore law [R1 §E.2]. And the pre-populated rate list still contains 12% and 28%, which the 22 September 2025 restructure abolished [R2 §C.1] — Zoho's response was a bulk rate-migration tool [R1 §A.1], which is precisely the behaviour that proves rate history by effective date is mandatory.

**Verdict on place-of-supply logic: ADOPT.** Shipping-address state, falling back to billing, falling back to default intrastate, driving CGST+SGST versus IGST, is the correct rule and matches [R2 §C.1]. Carried by: SAL-02.

**Verdict on separate intrastate/interstate tax groups: REJECT.** UdhaarBook stores a single GST rate per item and *computes* the split at document time from place of supply. Zoho's two-tax-group model is an artefact of a generic tax engine and doubles the master data a shopkeeper maintains.

**Verdict on the pre-populated rate table: ADAPT — effective-dated, post-GST-2.0.** `TaxRate` carries slab, cess and effective dates (Part 0 §0.6), seeded with 0/0.25/3/5/18/40 and retaining 12/28 as historical rows so pre-22-September-2025 documents recompute correctly [R2 §C.1]. This is Principle 10 (Part 2 §2.4) made concrete.

**Verdict on HSN 4-or-6-digit preference: ADOPT.** The rule is turnover-driven (4-digit at or below ₹5 crore, 6-digit above) and must be a tenant setting, not a constant [R2 §C.1]. Carried by: PLT-06, INV-01.

**Verdict on Bill of Supply and composition handling: ADOPT.** `Tenant.gst_type ∈ {unregistered, composition, regular}` driving document kind and tax rendering is already canon (Part 0 §0.2) and matches both Zoho's behaviour and the statutory requirement [R2 §C.1].

**Verdict on e-invoicing and e-way bill: ADAPT — Phase 3, with guided IRP onboarding.** The capability is required above ₹5 crore turnover and is a genuine tier-up trigger [R3 #8], so SAL-12 and SAL-13 are on the roadmap. The *onboarding* is where Zoho fails, and the dossier's instruction is direct: "Simplify with guided IRP onboarding" [R1 §E.2].

**Verdict on TDS/TCS: ADAPT — one narrow case at MVP.** Full section-wise TDS and TCS is an accountant's feature. The one case that matters to the ledger is "TDS deducted by customer", which must exist as a receivable-reducing entry type so the party balance nets correctly [R2 §C.1]. Carried by: LED-01 entry types.

**Verdict on GST returns in-product: ADOPT the capability Zoho rejected.** RPT-07 delivers outward and inward summaries by slab with CGST/SGST/IGST split, an HSN summary and a document-series summary at MVP; RPT-12 delivers GSTR-1 JSON in the offline-tool schema at Phase 2. This is a deliberate inversion of Zoho's architecture and one of UdhaarBook's clearest advantages for the single-product Indian SMB [R1 §E.2].

---

## 5.10 Integrations, automation, API and reporting

**Integrations.** Zoho's surface is enormous: Shopify, Amazon, eBay, Etsy, Walmart, WooCommerce and Zoho Commerce for sales channels; Zoho Books, QuickBooks Online and Xero for accounting; Zoho CRM; nine payment gateways globally with Razorpay, Paytm, PayU and Zoho Payments for India; UPS direct plus EasyPost, with Delhivery, Shiprocket and Envia for India; plus Analytics, Sign, Cliq, Desk, Avalara, Slack and Zapier [R1 §A.33]. Its own complaint list flags integration friction: WooCommerce plugin slowness, marketplace mapping issues, "difficult integrating accounting software other than Zoho Books", and the constraint that base currency must match the channel currency [R1 §E.1 #7]. India-specific gaps: **no native Tally integration**, and only three shipping carriers [R1 §E.2].

**Verdict: REJECT the breadth, ADOPT the dossier's own prescription.** "Keep integrations few and deep (Tally export, WhatsApp, UPI)" [R1 §E.1 #7] aligns exactly with [R3 #4]. UdhaarBook's integration list at MVP is WhatsApp deep links, UPI QR and intent, and CSV; Phase 2 adds a payment aggregator; Phase 3 adds Tally XML and a GSP. Marketplace and shipping integrations are rejected until a paying segment demands them.

**Automation.** Zoho offers workflow rules (10 per module, alerts capped at 500/day, with created/edited/deleted and date-based triggers), field updates, webhooks, Deluge custom functions, validation rules (10 per module), schedules (10 per organisation), blueprints, custom buttons and an extension SDK [R1 §A.32].

**Verdict: REJECT at MVP.** A workflow engine is a product in itself. The three automations UdhaarBook actually needs — reminder scheduling at D-1/D0, a low-stock scan, and an overdue-status refresh — are idempotent scheduled commands (ADR-012), not user-configurable rules. Tenant webhooks and API keys are PLT-13 at Phase 3.

**API.** Zoho's API is REST/JSON with OAuth 2.0, `organization_id` on every call, scopes per module and operation, 100 requests per minute per organisation, daily caps by plan, pagination and rich filters [R1 §A.41]. Notably the API documentation and the pricing page **disagree** on daily limits, and the dossier instructs trusting the pricing page [R1 §A.41].

**Verdict: ADOPT the shape.** UdhaarBook's API is REST/JSON at `/api/v1/` with tenant scoping from the token claim, page and cursor pagination, a standard envelope, structured errors and idempotency keys on document POSTs (Part 0 §0.4 ADR-017, §0.8). The lesson about documentation drift is itself adopted: the API specification in Part 22 is the single source and is generated from the implementation.

**Reporting.** Zoho ships roughly seventy named reports across eleven categories, plus custom reports, scheduled reports, chart views and grouped totals [R1 §A.29]. And yet "reporting rigidity" is its second-ranked complaint: "reporting features somewhat limited, requiring extra effort"; "custom report building could be more flexible"; dashboard "not updating real time" [R1 §E.1 #2]. The evolution analysis concludes: *"Reporting is never finished. Roughly a third of 2025–26 release notes are report columns/filters/scheduling. Ship a flexible report engine (filters, grouping, export, schedule) rather than fixed reports"* [R1 §C.3 lesson 5].

**Verdict: ADAPT — few reports, one engine.** The dossier's own prescription for UdhaarBook is "ship a handful of killer reports (party ledger, outstanding ageing, stock summary, GST summary, day book) with WhatsApp/PDF share" [R1 §E.1 #2]. MVP ships nine (RPT-01 through RPT-08 plus the party statement LED-04), but they are built on a shared filter-group-export substrate so that adding the tenth is cheap. Scheduled reports are RPT-14 at Phase 3.

---

## 5.11 Pricing and plan gating

Zoho's INR ladder is ₹999 / ₹2,299 / ₹4,999 / ₹7,499 per organisation per month billed yearly, with a free tier capped at 50 sales orders, 50 invoices, 20 purchase orders and 20 bills a month, one user and one location [R1 §Part B].

What each tier gates is the most instructive part:

| Tier | What it unlocks |
|---|---|
| Standard ₹999 | Composite items, dropship, backorder, customer portal, categories, price lists, reorder points, custom fields, workflows, custom modules |
| Premium ₹2,299 | **Serial and batch tracking**, **barcode generation**, stock counting, UoM conversion, vendor portal, retainer invoices, credit notes, e-invoicing, sales approvals, shipping labels, bins |
| Plus ₹4,999 | Zoho Commerce Premium |
| Enterprise ₹7,499 | Analytics, custom dashboards, purchase returns, embedded barcodes, web stock counting |

**Verdict on the tier ladder: REJECT wholesale.** Three specific rejections, each evidenced.

*Document metering is rejected.* Counting sales orders and invoices and purchase orders and bills separately means "a wholesaler doing 20 invoices/day exhausts Standard" [R1 §Part B observations], and it is the top-ranked complaint in Zoho's own review corpus [R1 §E.1 #1]. The dossier's prescription is explicit: *"Plan caps by document count monetise growth but generate the loudest pricing complaints; consider caps on users/locations instead of transactions for an India ledger product"* [R1 §C.3 lesson 10], and *"Price by users/outlets, not documents; give barcode + batch/expiry in the base plan"* [R1 §E.1 #1].

*Gating batch and barcode behind ₹2,299/month is rejected.* That is roughly eight times the *annual* software budget of the micro segment [R3 §3.1], and batch/expiry is essential to pharma, FMCG and any kirana selling food.

*Credit notes behind Premium is rejected.* A credit note is how a return is recorded. Gating it makes the product incorrect rather than merely limited.

**Verdict on the free tier's existence: ADOPT the idea, REJECT the shape.** A permanently free tier is right for acquisition (Part 1 §1.9). UdhaarBook's free tier limits *users, businesses and modules* — never document counts, never ledger entries.

---

## 5.12 Summary of verdicts

| Area | Verdict | Feature ID |
|---|---|---|
| Consistent entity chassis (status, audit, attachments, import/export) | **ADOPT** | Part 0 §0.11, PLT-08, IMP-02 |
| Module sprawl without per-tenant toggles | **REJECT** | Part 0 §0.3, PLT-06 |
| GST returns living in a separate product | **REJECT** | RPT-07, RPT-12 |
| Immutable signed stock movements; on-hand as a sum | **ADOPT** | INV-03, INV-08 |
| Dual accounting/physical stock modes | **REJECT at MVP** | — |
| Negative-stock policy as an org switch | **ADAPT** (default block) | INV-06, PLT-06 |
| FIFO + WAC with per-item override | **ADAPT** (WAC only) | INV-08 |
| Heavyweight item form | **ADAPT** (minimum set + MRP) | INV-01 |
| Goods/service split; archive instead of delete | **ADOPT** | INV-01 |
| 44 custom fields per module | **REJECT at MVP** | — |
| Variants with auto-SKU generator | **ADAPT** (P2, no generator) | INV-12 |
| Assemblies vs Kits distinction | **ADOPT the model, defer the build** | INV-19 |
| Document status vocabularies | **ADOPT/ADAPT per table §5.5** | Part 0 §0.7 |
| Stored derived `overdue` refreshed by a job | **ADOPT** | Part 0 §0.7, ADR-012 |
| Multi-location with per-plan caps | **ADAPT** (P2, uncapped) | INV-11 |
| Bins, picklists, move orders, putaways | **REJECT** | — |
| Per-FY document sequences; numbers never reused | **ADOPT** + Rule 46 constraints | PLT-06, SAL-02 |
| Single contacts table; customer↔vendor link | **ADOPT and improve** (flags on one row) | PTY-01 |
| Party merge | **ADOPT** (P2) | PTY-08 |
| Price lists with volume tiers | **ADAPT** (P2, no tiers) | INV-13 |
| Org-wide discount mode choice | **REJECT** | SAL-02 |
| Place-of-supply → CGST/SGST vs IGST | **ADOPT** | SAL-02 |
| Separate intra/inter tax groups per item | **REJECT** (compute at document time) | SAL-02 |
| Effective-dated rate history incl. pre-GST-2.0 slabs | **ADOPT and extend** | Part 0 §0.6 `tax_rate` |
| HSN 4/6-digit turnover preference | **ADOPT** | PLT-06, INV-01 |
| e-Invoice / e-way bill via GSP | **ADAPT** (P3, guided onboarding) | SAL-12, SAL-13 |
| Full section-wise TDS/TCS | **ADAPT** (only "TDS deducted by customer" at MVP) | LED-01 |
| Broad integration surface | **REJECT** (WhatsApp, UPI, CSV, then Tally) | NTF-03, PAY-03, IMP-01/02, RPT-13 |
| Workflow/validation/blueprint engine | **REJECT at MVP** | ADR-012 |
| REST/JSON API shape with idempotency | **ADOPT** | Part 0 §0.8, ADR-017 |
| ~70 fixed reports | **ADAPT** (9 reports on one engine) | RPT-01…08 |
| Per-document-count plan metering | **REJECT** | Part 2 §2.4 Principle 6 |
| Batch/barcode/credit notes behind premium tiers | **REJECT** | INV-16, INV-10, SAL-04 |
