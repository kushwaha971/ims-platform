# Design and dashboard specification

Goal: at least 9/10 design/UX under the [scorecard](06-qa-and-release-scorecard.md), with an efficient counter workflow and understandable information. Use existing YourKhata tokens and ml-uikit/design-system controls.

## Design requirements

UX-01: content determines height; consistent compact spacing, aligned facts/amounts and thin dividers. No nested card stacks for the same record. Preserve generous touch targets while reducing empty padding.

UX-02: one clearly dominant action per task. Primary indigo means action, not “paid”. Status and accounting direction have separate meanings; labels accompany colors. Neutral surfaces are the default. Zero and unavailable data are not positive/negative outcomes.

UX-03: show what a merchant needs to decide now; disclose occasional tax/address/technical details. Long names, Hindi, large amounts and errors must wrap without colliding with badges or buttons.

UX-04: quick record management uses drawers; multi-line transactions use dedicated editors; desktop comparison tasks use tables. Apply Library/Lending density without forcing every Shop screen into a card grid.

## Shop dashboard

The dashboard answers: what happened today, what needs action, what must be collected/paid, and what stock needs attention. It contains only the active business's Shop data.

| Order | Content | Data contract and action |
|---|---|---|
| 1 | Business name, Shop context, date/range; New bill | Range is explicit; operational default Today in business timezone |
| 2 | Net sales, received money, cash in hand | Define tax/returns treatment; sales is not cash; cash excludes UPI/bank |
| 3 | Separate Customer dues and Supplier dues panels | Role-filtered server figures; Customers leads To collect, Suppliers leads To pay; correct filtered destination |
| 4 | Needs attention | Overdue bills/promises, low/out stock, pending orders/deliveries where supported; count, amount, age and next action |
| 5 | Recent activity | Document type, person, amount, date/status and link; returns/voids clearly identified |
| 6 | Optional compact trend | Sales default, purchase/profit selection; range and units visible; incomplete cost data disclosed |

Additional quick actions: Record payment, Add purchase, Add expense. On mobile use a worded action sheet if these do not fit; keep New bill directly accessible. Do not hide important supplier dues under +2. Avoid four repeated contact buttons on every dashboard row; open a record drawer with contextual actions.

DASH-01: every card identifies period/scope and opens records that reproduce its figure. If a panel uses a different scope from the current chart, label it clearly.

DASH-02: Customer/Supplier totals use explicit role-scoped definitions. An explicitly dual-role person's Shop net position must be explained according to decision D-03; do not invent separate receivable/payable balances or add overlapping panels together. An all-counterparty money total must be named accordingly and link to the matching Shop report.

DASH-03: label net/gross sales and before/after-tax profit accurately. Receipts, advances, credits, refunds, expenses and opening cash have distinct effects. Never show a collection percentage with unrelated numerator and denominator, or zero profit when cost is missing.

DASH-04: loading skeletons, genuinely empty business, filtered-empty, partial failure and Retry have distinct presentations. Retain useful unaffected sections if one report fails; identify unavailable/stale data.

## Screen patterns

| Screen | Required pattern |
|---|---|
| Customers | Compact identity/contact/Shop balance rows; To collect first; person drawer |
| Suppliers | Independent list and wording; To pay first; supplier drawer; no customer-only accessibility labels |
| Bills/purchases | Desktop comparison table, compact phone rows; relevant status/date/total/due |
| Bill editor | Compact context; optional fields disclosed; container-fit line grid; totals remain reachable |
| Items | Phone name, selling price/unit and stock status; desktop comparison columns; costs permission-gated |
| Stock/adjustment | Quantity/unit, before/after and value impact; explicit reason and confirmation |
| Payments | Direction, amount, mode/date and allocations; visible remaining due/advance |
| Returns | Original document, returnable quantity, reason, stock effect and credit/refund outcome |
| Reports | Explicit period, filters, units and source; export reflects exactly the displayed scope |

For the editor, measure actual available width before choosing table layout. Do not simply lower the existing 1536px breakpoint and reintroduce clipped Qty/Total fields. Candidate layout: full-width rows with totals below at medium desktop, side totals only when every minimum track fits. Preserve keyboard shortcuts and current authoritative calculations.

## Mobile, desktop and accessibility acceptance

UX-05: verify 360/390 phone, 768 tablet, 1280/1440/1536 desktop, portrait/landscape and browser text zoom. Document scroll stays inside the viewport; no name/badge overlap or clipped money.

UX-06: bottom navigation, transaction docks, keyboard, snackbar and drawer footer never obscure the final control or row. Respect safe areas; nested overlays unlock scrolling and restore focus correctly after close and navigation.

UX-07: paired actions have equal visual height and baseline. Interactive hit areas remain at least 44px where applicable; compact appearance is not permission to shrink touch targets. Use existing shared size tokens.

UX-08: labels, focus order, error association and keyboard operation are tested. Escape closes the top overlay only. Portalled dropdown focus must not trigger premature validation. Bulk selection and accessible names must say Supplier on Suppliers.

UX-09: hide paging controls for one page; retain real server paging for large lists. Scroll pagination must expose loading/end/error/retry and keep focus/order; use explicit pages where comparison/report navigation is better.

UX-10: use plain labels: Add customer, Add supplier, Collect payment, Pay supplier, Return goods. Explain formal accounting terms contextually; preserve accurate legal/tax document terminology. English and rural-friendly Hindi have equivalent meaning and behavior.
