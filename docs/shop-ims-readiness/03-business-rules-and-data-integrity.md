# Business rules and data integrity

The server owns financial and stock truth. This specification does not silently resolve an accounting-policy conflict. Refer to [decision register](07-delivery-roadmap.md) and the [existing audit](../review/06-shop-user-audit.md).

## Ownership and permission requirements

DATA-01: every business record, query, export, share and background job is scoped to the authorized tenant and correct app/book. Direct identifiers and stale client responses must not bypass ownership checks.

DATA-02: Shop and Udhaar retain separate balances and histories. Test the same identity with entries in Shop, Udhaar, Lending and Library. No cross-book netting. A future personal user-owned Udhaar book requires a deliberate migration/access model preserving current business data.

DATA-03: customer/supplier role filters are fixed by the section and transaction context. Clearing search/filters does not widen a Suppliers list to everyone. Dual-role identity and settlement behavior must be documented; prevent double-counting in combined reports.

DATA-04: capability checks govern writes, cost/margin reads, financial exports, corrections and message actions. Revoked permissions, archived records and user/business switches are rechecked server-side. Define default role capability sets and test overrides.

## Financial invariants

FIN-01: Decimal arithmetic with documented precision and rounding at each boundary; no binary floating-point ledger arithmetic. Client preview and server result conform to shared test vectors; the server recomputes at posting.

FIN-02: posted records are immutable. Corrections/voids create auditable reversals or authorized lifecycle transitions with reasons. Draft deletion is distinct from cancelling a posted financial document.

FIN-03: a logical posting is atomic across document, sequence, stock, ledger, payment allocation and audit. Same-key/same-payload retry replays one result; changed payload conflicts; concurrent submissions cannot post twice.

FIN-04: bills, received amounts, credit applications, refunds, open credits and remaining due reconcile according to the documented lifecycle. Do not label a credit/forgiven amount as received cash or income. Do not clamp away a discrepancy with max(0) without explaining the permitted settlement state.

FIN-05: allocations cannot exceed eligible document balances or available payment/credit. Explicit advances and refunds account for any remainder. Paid/unpaid/part-paid/overdue statuses follow server facts and the business timezone.

FIN-06: gross sale, taxable/net sale, tax, cost of goods, gross profit, expenses and net result have separate definitions. Returns and voids use the correct signs and periods. Show incomplete cost coverage rather than fabricated profit.

FIN-07: cash in hand equals permitted opening cash plus cash receipts/inflows less cash payments, refunds and paid cash expenses. UPI/bank/card flows remain separate. A credit sale increases sales/debt without increasing cash.

FIN-08: document snapshots preserve issued identity, tax rates and prices; current master edits cannot rewrite historical documents. Future/backdated dates and financial-year boundaries follow explicit business rules.

## Inventory and valuation

STK-01: goods and services differ; services do not create stock movements. Base unit, decimal allowance, conversion rules where enabled and price units remain explicit. Reject fractional quantities for non-decimal units.

STK-02: stock issue, receipt, return, adjustment and reversal reconcile quantity, value and movement history under concurrent writes. Archived items stay readable historically and are excluded from new working choices unless an authorized recovery flow explicitly permits them.

STK-03: apply the configured negative-stock policy consistently, including backdated availability and repeated item lines. Do not borrow stock from a later purchase when the policy forbids it.

STK-04: resolve purchase-return costing before implementation. Audit example: 29 units at ₹300, receive 10 at ₹320, return 2 from that purchase. Documented original-cost removal is ₹640; observed average-cost removal was ₹610.26. The policy must specify stock left after mixed-cost sales, no stock left, negative remaining value, note voids and historical replay. No special-case arithmetic in a screen.

STK-05: actual posting and independent chronological replay produce the same current quantity/value. Rounding residuals and zero stock have deterministic handling. Migration must preserve immutable historic records and reconcile old caches before deployment.

## Document lifecycle acceptance

Estimates and confirmed orders must not accidentally post invoice debt or duplicate stock. Challan issue/conversion/void has its own movement ownership; invoicing an already-issued challan must not ship the goods twice. Partial conversions track what remains. Supplier invoice duplicates are checked within the correct supplier/business scope. Customer/supplier returns cannot exceed remaining eligible quantities and preserve original tax/discount allocation rules.

Formal customer and supplier return artifacts identify original document, dates, quantities/units, taxable values, tax, reason and settlement effect. Print/share follows business branding and permission rules. Approval is required for irreversible migration or deployment actions under normal project policy; documentation is not authorization to reset databases.

## Independent reconciliation fixture

The audited sale: taxable ₹1,020, CGST/SGST ₹33.30 each, rounding ₹0.40, total ₹1,087. Receive ₹500 → due ₹587. Return one rice item → credit ₹473 under configured rounding → due ₹114. Receive ₹114 → settled. Purchase ₹3,360, supplier return ₹672 → payable ₹2,688. Cash expense ₹120 → cash ₹494 from zero opening cash. Udhaar openings remain unchanged. Rice quantity37/soap47; stock valuation has the unresolved STK-04 policy.

Use this as one regression fixture, then add different prices, taxes, dates, units, credits, rounding and concurrency. Reusing one happy-path fixture alone cannot establish correctness.
