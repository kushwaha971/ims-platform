# Product and business requirements

Status: proposed implementation requirements; read [scope and readiness rules](README.md) first. Requirement IDs are referenced by delivery and QA; evidence must identify which requirements a change satisfies.

## Business coverage

| Business model | Important daily needs | Capability-dependent work to assess |
|---|---|---|
| Grocery/general store | Fast walk-in bills, barcode/search, fractional goods, returns, cash/UPI, reorder | Batches, expiry, weighing-device integration |
| Garments/footwear | Size/color identification, exchanges, price changes | Variant inventory, size grids, serial labels |
| Hardware/building materials | Fractional quantities, units, negotiated prices, credit, transport/challans | Unit conversions, multiple locations, delivered quantities |
| Electronics/appliances | High-value bills, serial identification, returns | Serial/warranty tracking, item-specific return limits |
| Stationery/books | Item lookup, quantity pricing, school/bulk orders | Editions/variants, customer-specific prices |
| Wholesale/distribution | Large bills, customer credit, orders, partial delivery, supplier returns | Tiered prices, routes, multi-location allocation |
| Services/repair | Non-stock services, mixed goods/service bills, advances, final settlement | Job cards, labor workflows, equipment custody |
| Mixed retail/service | Stock and non-stock lines together, taxes and payment splits | Explicit item type and cost visibility |

For each supported business, record applicable capabilities as implemented/verified, gap, planned, or excluded. Pharmacy/regulated goods, manufacturing/BOM, restaurant/kitchen/table operations and other specialized workflows need additional domain specifications before marketing support. Missing capabilities must be visible during onboarding and feature configuration. Currency, jurisdiction and tax behavior follow the configured product contract; this matrix does not imply unbuilt multi-currency or worldwide tax compliance.

## People and responsibilities

- Owner: cash position, dues, profit/cost confidence, staff controls and corrections.
- Cashier/shopkeeper: create a correct bill quickly, receive money, handle walk-ins and explain a balance.
- Stock operator: identify an item, receive/count/adjust goods and trace a discrepancy.
- Purchasing operator: supplier bills, duplicate invoice checks, quantities, returns and payable settlement.
- Accountant: registers, tax splits, dates, corrections, stock valuation and exports that reconcile.
- Read-only reviewer: inspect permitted data without actionable mutation controls.
- Customer/supplier recipient: receive a clear, correctly addressed bill, receipt or reminder signed by the business.

Use capability-based permissions with reviewed role defaults. A label such as Staff must not itself grant access to costs, exports, financial corrections or bulk messages. Tenant rules and owner-only business overrides remain authoritative.

## End-to-end requirements

| ID | Required outcome | Acceptance evidence |
|---|---|---|
| BIZ-01 | Correct business/app context is always visible; Shop/Udhaar money stays separate | Same-person, same-business mixed-book scenario and cross-tenant tests |
| BIZ-02 | Customers and Suppliers have distinct lists, add/edit wording, summary priorities and transaction pickers | Customer-only, supplier-only and explicit dual-role fixtures |
| BIZ-03 | Walk-in and repeat-customer bills handle stocked/service items, tax, discounts, rounding and partial/full payment | Hand-calculated bill plus server/client comparison |
| BIZ-04 | Estimates/orders/challans have understandable statuses and conversion paths without duplicate stock or debt | Partial/complete/duplicate conversion scenarios |
| BIZ-05 | Customer returns, credits, exchanges where supported, and refunds explain stock and money effects | Paid/part-paid/unpaid bill; restock on/off; over-return refusal |
| BIZ-06 | Purchases, duplicate supplier references, partial payment and returns reconcile | Supplier bill to payment/return/void chain |
| BIZ-07 | Items, units, prices, stock counts and adjustments support the enabled business capabilities | Goods/service/fractional/low/zero stock and inactive items |
| BIZ-08 | Receipts, allocations, advances and refunds have an understandable remaining balance | Exact payment/document/party reconciliation |
| BIZ-09 | Paid/unpaid expenses and cashbook explain actual money movement | Cash/UPI/bank and backdated expense cases |
| BIZ-10 | Dashboard, registers, profit, stock, aging and exports agree with their defined scopes | Same fixture reconciled across every projection |
| BIZ-11 | Every outgoing default message is editable before send/share or schedule enablement | MSG-01 through MSG-12 in the messaging specification |
| BIZ-12 | Phone contact selection prefills editable name/number in onboarding where supported | Supported-device, unsupported/manual, cancel and duplicate scenarios |
| BIZ-13 | Recovery from mistakes, timeouts and interrupted work does not lose or double-post data | Retry, remount, stale-version and reversal evidence |
| BIZ-14 | Customers/suppliers can understand documents and payment status | Recipient review; business identity, language, units and totals checked |

## Daily task acceptance

Test complete jobs, not isolated buttons: open shop; find stock/price; make a 10-line bill; collect partly; return an item; collect remaining debt; receive a supplier purchase; return damaged goods; pay a supplier; record an expense; count stock; close/tally the day; export for the accountant.

Phone contact import requests only a user-selected name/telephone, fills a form and requires an explicit save. Deduplicate within the authorized business/book and role context. Do not import the whole address book or automatically reuse someone from a different tenant or personal Udhaar book.

## Success criteria

Proposed usability gate: at least 95% unassisted completion of critical tasks in the reviewed sample, with no unrecoverable financial mistake. Include inexperienced and experienced operators; define the sample and tasks before testing, and report numerator/denominator rather than treating a small sample as market-wide proof.

Measure current and redesigned time, steps, error rate and recovery for identical 1/10/50-line bills. The designer must demonstrate a meaningful improvement at 1280/1440 desktop without worsening mobile accuracy. Collect support-worthy confusion, abandoned tasks and inconsistent balances. Competitor comparison, if commissioned later, must use dated, sourced evidence rather than invented parity claims.
