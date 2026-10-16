# Shop/Retail audit — user, UX, product and engineering feedback

15 October 2026. Baseline dev `30c591c2`. Owner confirmed full Shop/Retail scope. Local synthetic business only; no production transactions or external messages. The audit was performed locally. Publication is tracked in Git and QA.md; deployment is not certified by this report.

## Verdict

The accounting capabilities are ahead of the counter experience. Compact customer, supplier, bill and payment lists are useful; desktop billing still spends too much space on one item. More seriously, book isolation and supplier-return retry protection had observable defects despite large passing suites. Those defects are fixed locally. The mixed-cost return documentation conflict was resolved by the owner on16 October2026: retain normative weighted-average stock costing and original-bill supplier credit. The new policy regression now passes. This audit is not an unconditional production sign-off.

## Boundaries the owner explicitly requires

- Udhaar is a separate app/book for manual You gave / You got and old dues. Shop invoices, purchases, their payments and returns use the Shop book. No combined balance, merged navigation or cross-book netting.
- Customers and Suppliers remain separate Shop sections, with fixed role filters. Sales chooses customers; purchases chooses suppliers. Someone deliberately marked with both roles can appear in both lists through the same identity record.
- Library/Lending provide reusable compact card, drawer, spacing and action patterns. Comparison tables, tax documents and multi-line transaction editors need layouts suited to their own tasks.
- Settings/Profile styling remains outside this pass.

## Read of QA.md

Read the full 245-line handoff, including later checkpoints that supersede its earlier Library-only/deferred-Lending instructions. Relevant decisions: brand indigo and semantic color tokens; content-driven cards with no forced empty height; compact overlays with safe areas and intact touch targets; real ml-uikit controls; normal person management in drawers; plain English/Hindi; preserve backend authority and permission rules; never invent prototype figures unsupported by the API.

The file is a chronological journal, not a current acceptance checklist. Earlier “pending”, failed bundle budgets and “not pushed” entries are historical; later release checkpoints supersede them. The current coverage and unresolved Shop findings are recorded here so a green old milestone is not mistaken for current validation.

## Confirmed defects addressed locally

| Finding | Impact | Fix and evidence |
|---|---|---|
| SH-001 — Shop dashboard aging read the Udhaar book | To collect ₹0 while chart included ₹1,750 from another book | Explicit Shop bucket. Fail-before regression returned ₹1,000 instead of Shop ₹100; passed after fix. Local API reconciled aging with Shop dues. |
| SH-002 — Shop filters/forms retained large old overlay spacing | Unnecessary scrolling, inconsistent with Library/Lending | Opt-in compact filters on Shop lists and shared compact drawer padding. Phone filter keeps 44px radio rows and equal side-by-side footer actions. |
| SH-003 — supplier return retried as a fresh issue | Lost response could remove stock and supplier debt twice | Server idempotent replay plus stable form request key. Fail-before produced two note IDs. Regression now proves one note, one stock/balance movement and changed-body conflict. Form retry regression reuses identical body/key. |
| SH-004 — credit-note link section lacked a React key | Developer warning and unstable list reconciliation | Stable section key. Actual credit-note navigation exposed the warning. |
| SH-005 — Shop Reports aging switched into Udhaar | Wrong app, totals and export; customer already settled in Shop appeared owing ₹1,500 | Dedicated `/reports/aging`, shared report UI scoped to Shop. Summary, rows, CSV and statement links carry the book. Udhaar `/ledger/aging` retains its own default. Backend regression and browser: Shop receivable ₹0 / payable ₹2,688; Shop menu retained. |
| SH-006 — sales reused unrestricted expense party search | Supplier-only records appeared when choosing a bill customer | Sales now requests `type=customer`; purchases already request suppliers. Fail-before request sent empty type. Browser excludes Agro Wholesale and retains the explicitly dual-role person. Expenses keep their valid all-party picker. |
| SH-007 — Suppliers hid its actual payable in the collapsed phone summary | Visible “To collect ₹0” while ₹2,688 to pay was under +2 | Suppliers lead with To pay; Customers retain To collect. Correct supplier count, search and accessible list labels. Regression and browser verified the first metric. |
| SH-008 — payable aging bar described what the supplier “owes” | Screen-reader wording reversed who owes whom | Direction-neutral English/Hindi aging description. |
| SH-015 — late aging responses could overwrite newer filters or reset session state | Old tag/page/order results or failures could repaint the current report | Latest-request IDs protect rows, errors and summaries, including reset. Six of seven new cases failed before; all seven pass after, with report UI regressions retained. |

## Open findings and blunt product feedback

### Resolved 16 October 2026: SH-009 — purchase-return costing documentation

Observed sequence: 29 rice bags valued at ₹300, buy 10 at ₹320, return 2 from that purchase. Supplier credit is ₹672 including GST, quantity becomes 37, but the stock movement records unit cost ₹305.1282 and value −₹610.26. Purchase-return service documentation and product comparison document specify the bill's inbound cost, which would remove ₹640 before tax. Current stock value is ₹11,289.74 rather than ₹11,260 under that documented rule.

The original audit identified conflicting descriptions, not incorrect supplier credit or stock quantity. On16 October2026 the owner explicitly chose the existing normative weighted-average stock rule. Corrected the return documentation and removed the misleading unused original-cost argument; the common costing engine remains unchanged. Mixed-cost, depleted-stock, price-only and void/replay scenarios are now covered:12 debit-note tests and180 purchase/inventory regressions passed. No valuation migration or historical rewrite is required.

### High workflow priority: SH-010 — desktop billing is space-heavy

At 1440px, one item uses a large multi-row card. Optional walk-in/contact/date details sit above it, and a side totals panel constrains line width. The table currently starts at 1536px to prevent clipped fields; blindly lowering that breakpoint would bring back a known defect.

Recommended redesign: compact bill context at the top; optional customer details collapsed; full-width comparison rows once the actual container fits every field; compact totals beside or below the rows according to available width. Keep keyboard movement, barcode entry, tax-inclusive controls, discount validation and authoritative totals. Test 1/10/50 lines at 1280/1440/1536 and the narrower phone editor. This structural redesign has not been implemented in this audit.

### Medium: SH-011 — draft-create retry recovery is incomplete

Browser console warned that the first invoice-draft POST received an automatically generated idempotency key. Draft creation currently does not have the issued-invoice replay protection. A lost create response followed by another create is a duplicate-draft risk. This is distinct from invoice issue, which already has its own stable key and server protection. Source-observed risk; a browser network interruption was not exercised. Needs a persisted logical draft identity and recovery test, including editing after a lost response and remounting.

### Medium: SH-012 — mobile item lookup prioritizes stock over selling price

The phone Items list shows name, SKU and stock status/quantity; selling price requires opening the item. A shopkeeper checking a price should not need that extra step. A compact second line can show selling price and unit, with stock status trailing; cost and margin remain permission-gated. Avoid adding every desktop column to the card.

### Medium: SH-013 — supplier-return proof is less complete than sales proof

The inspected debit-note flow shows its bill, reason, quantities, credit and void action, but lacks a direct customer-style print/share document action. A shopkeeper needs a clear artifact when sending damaged goods back. Treat formal note numbering and audit history as essential; do not delete posted notes to “fix” mistakes.

### Low: SH-014 — incidental paging and terminology remain

The aging desktop report displayed disabled paging controls and Page 1 of 1. Hide controls for a single page without removing server paging for larger books. “Receivables aging”, “debit note”, “party”, “ITC” and “place of supply” still require accounting knowledge. Use short everyday action labels and contextual explanations; retain formal tax terms on documents and accountant-facing detail. The final desktop supplier check also found a bulk checkbox still announced as “Select every customer on this page”, and supplier admission still says “Add party” / “Save party”. Defaults correctly select I buy from them; the remaining issue is role-specific wording.

### Design and color assessment

Keep neutral white/surface cards, indigo primary actions, thin dividers, modest avatar tints and aligned facts. Color should identify status or meaning consistently. Current debit/credit colors can make a supplier amount to pay look green; that is accounting-direction coloring, not evidence that the debt is healthy. Preserve clear To pay/To collect text and define overdue/status semantics separately. Do not turn every money card green or amber.

Keep compact phone record rows and desktop comparison tables for customers/suppliers, stock, bills, payments and reports. Use drawers for quick identity/edit/payment/return tasks; use a dedicated editor for multi-line bills and purchases. A full Library card conversion would reduce comparison speed and increase scrolling in these workflows.

## Real local transaction reconciliation

| Checkpoint | Expected and observed |
|---|---|
| Sale | 2 rice × ₹450 + 3 soap × ₹40; taxable ₹1,020; CGST/SGST ₹33.30 each; round-off ₹0.40; total ₹1,087 |
| Partial receipt | ₹500 cash; invoice and Shop party due ₹587; stock rice 28 / soap 47; bill gross profit ₹345 |
| Reload draft | Customer, both lines, quantities and total retained before issue |
| Customer return | Over-return 3 of 2 blocked; valid 1-rice return credited ₹473 under configured rounding, stock +1, due ₹114 |
| Remaining collection | ₹114 received; invoice and Shop customer settled; transaction history refreshed |
| Supplier purchase/return | Buy 10 rice × ₹320 plus GST = ₹3,360; return 2 credits ₹672; supplier due ₹2,688; rice quantity 37 |
| Expense | Zero amount/missing category refused; ₹120 cash Food expense saved; list refreshed |
| Cash | ₹500 + ₹114 − ₹120 = ₹494 |
| Book separation | Udhaar customer opening ₹1,500 and supplier opening −₹2,000 unchanged by Shop transactions |
| Stock valuation | Quantity reconciles; mixed-cost return value has SH-009 above |

## Coverage register — what the evidence actually proves

| Area | Browser evidence | Automated/API evidence and limits |
|---|---|---|
| Home | Before-trade dashboard and post-trade API reconciliation | Dashboard/chart/report suites; financial isolation regression |
| Customers / suppliers | Separate lists, customer search options, balance filter Apply, supplier headline, detail/phone link; supplier admission correctly defaults to I buy from them, cancelled without saving | Parties suite covers CRUD, role filters, archive, duplicate/validation/tenant behavior; local API seeded independent customer/supplier/dual roles |
| Shop party account | Invoice/receipt/credit-note history and settled balance refresh | Shop/main balance isolation and ledger/statement suites; manual Udhaar give/get is outside Shop scope |
| Billing | Two-line GST sale, draft reload, partial cash issue, detail profit/print preview | Sales suite covers tax/discount/rounding, stale versions, stock, permissions, issue replay and document lifecycle; posted edit rejected via API |
| Sales documents | Return cap and issued credit note; estimates/orders/challans list shells | Estimate/order/challan conversion and cancellation cases in sales suite. Full conversion journeys were not repeated manually in browser |
| Purchases | Recorded bill, mobile return, reason select, resulting note/due | Purchase suite incl. new return replay and changed-body conflict. Valuation inconsistency remains open |
| Inventory | Items, zero stock, detail/history, required adjustment errors, stock/low-stock screens | Inventory suite covers units, stock adjustments, costing/replay, duplicates/archive and permissions. No physical scanner/camera used |
| Payments | Partial receipt, final FIFO collection, refreshed invoice/party and receipt list | Payment suite covers allocation, advance/refund/void and validation; all money synthetic |
| Expenses / cashbook | Empty expense state, invalid/valid expense, mobile/desktop list and cashbook | Expense/report suites; cash independently reconciled |
| Dues / reports | Shop aging stays in Shop, correct payable, scoped statement and CSV links | Ledger/report/export suites and new mixed-book regression. No real reminder sent |
| Access / isolation | Owner local browser identity isolated from user's localhost session; app-route transition checked | Role/tenant/permission tests in the eight backend areas. Separate staff/accountant browser sessions were not manually exercised |
| Responsive | 360/390 phones, 768 tablet, 1280 desktop list sweep, 1440 desktop billing; measured no positive document overflow in sampled screens | Relevant UI suites; 65px bottom nav observed at 390/768, 64px main inset. Shell sweeps are not full transaction execution at every width |
| Recovery / performance | Draft reload and validation recovery; return retry simulated in regression | No measured production throughput, offline PWA/browser crash, or slow-device certification. Development compilation latency is not a production performance measurement |

## Final validation checkpoint

- Broad Shop backend: **1,542 passed**, 6 existing Django URL-converter warnings.
- Final full frontend: **4,096 passed / 363 suites**, after all functional and UI refinements. Existing Jest asynchronous-handle warning remains; the command completed successfully.
- TypeScript passed. Full ESLint found three import-order errors only; corrected those and verified every changed frontend file, plus the new race-test file. Backend Black and isort with Black profile passed on all changed Python files.
- Locales: 6,309 keys /54 catalogues /284 chunks; English and Hindi consistent. Contrast: 146 pairings passed.
- Final production build and bundle checks passed. New `/reports/aging` uses the equivalent `/ledger/aging` budget (94.7KB route /333.8KB first load), not the generic fallback. Three existing routes exceeded by at most 0.1KB; only their four exceeded scalars use measured +0.5KB under existing repository policy. Global limits unchanged.
- Earlier overlapping runs: Shop reports31; purchases/reports261; ledger/reports/purchases618; focused supplier/sales/aging121; race/report31. Do not add these to the broad totals.
- Screenshots, DOM checkpoints and viewport measurements: chat workspace `outputs/shop-product-audit/`. Final supplier proof: `suppliers-phone-final.png`.
- Local preview restored on3114; API8000 and isolated DB5546 retained. Temporary viewport override reset. Publication is tracked in Git and QA.md; this local verification does not certify a deployed release.

## Remaining release evidence

Physical Android/iPhone keyboards and contact picker, scanner/camera and thermal printer; real offline/reconnect and interrupted-request testing; large-business paging/performance; remaining draft recovery and the other open work packages. No claim that every possible device or edge case has been covered.
