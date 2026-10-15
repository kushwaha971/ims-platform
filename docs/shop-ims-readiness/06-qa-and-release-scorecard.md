# QA and release scorecard

Target: **at least 9.0/10 in both scorecards**, independently. Scores are proposed review instruments; they are not statistical market rankings. A release must also pass the hard gates below. Unknown or untested evidence is recorded as Not evaluated and cannot receive a passing score.

## Scoring method

For each dimension assign 0–10 with linked task/screens/test evidence and reviewer rationale. Weighted score = sum(weight × rating)/100. Use product/design review, domain/engineering review, QA and representative shopkeeper task results. Resolve disagreements explicitly; do not let the implementer award themselves release readiness.

Anchor: 9 means critical tasks are efficient, clear and correct across the declared scope, edge cases recover safely, remaining issues are minor and documented. 7 means usable with repeated friction or meaningful gaps. 5 means core tasks need workarounds or assistance. Wrong financial ownership, duplicate posting, data loss or unauthorized access blocks release regardless of average.

## Design/UX scorecard

| Dimension | Weight | Required evidence |
|---|---:|---|
| Task efficiency and discoverability | 25 | Timed counter/onboarding/return/collection tasks; 1/10/50-line comparison |
| Data hierarchy and comprehensibility | 20 | Correct primary figures, labels, scopes and drill-downs |
| Mobile/tablet/desktop usability | 20 | Viewport matrix, physical phones, keyboard/footer/overlay clearance |
| Component consistency and density | 15 | Shared patterns, button geometry, cards/tables/drawers and states |
| Accessibility | 10 | Keyboard/focus/labels, touch targets, zoom and contrast |
| English/Hindi and recipient clarity | 10 | Equivalent meaning, role-specific copy and understandable documents |

## Functionality/business scorecard

| Dimension | Weight | Required evidence |
|---|---:|---|
| Financial and stock integrity | 30 | Independent calculation/replay, mixed-cost returns, cash/ledger/report reconciliation |
| Complete business workflows | 25 | Supported business/persona end-to-end matrix |
| Recovery and concurrency | 15 | Lost response, duplicate submit, stale version, offline/remount and late responses |
| Security/privacy/ownership | 15 | Tenant/book/role isolation, revoked access, exports/shares/messages |
| Operability/performance | 10 | Defined workload, latency/query/bytes evidence, backups/restore and error recovery |
| Compatibility and documents | 5 | Devices, print/export, channel behavior and business capabilities |

Both weighted scores must reach9.0. Financial integrity and ownership dimensions must each reach9.0 with no high/critical open defect; no dimension below8.5. Average improvement must not conceal a weak critical area. Re-score after meaningful scope or business-rule changes.

## Test matrices

| Axis | Required cases |
|---|---|
| Business | Retail, wholesale, services and supported mixed/industry capabilities from product matrix |
| Actor | Owner, cashier, stock/purchase operator, accountant, read-only; permitted overrides and revoked access |
| Ownership | Two tenants, two users in one business, same identity in separate books, explicit dual customer/supplier role |
| Device | 360/390 phone, 768 tablet, 1280/1440/1536 desktop; physical Android/iPhone; supported browser matrix |
| Data | Empty/small/large business, long Hindi/English names, large amounts, zero/missing/invalid fields, goods/services, fractional units |
| Network/lifecycle | Slow/out-of-order, offline/reconnect, timeout after commit, duplicate taps, refresh/remount, back/forward, tab/user/business switch |
| Money/stock | Paid/part-paid/credit, discounts/taxes/rounding, advance/refund, returns/restock, mixed costs, voids, negative/backdated stock |
| Documents | Draft/post/convert/part-convert/cancel, original snapshots, A4/thermal/PDF/CSV where supported |
| Messages | Every inventory row in the universal messaging spec; manual vs provider vs scheduled delivery |

## Minimum critical journeys

1. Walk-in cash bill and customer credit bill; split receipt and end-of-day tally.
2. Customer partial payment → return → credit allocation/refund → final settlement.
3. Supplier purchase → part payment → mixed-cost return → void/replay and payable/stock reconciliation.
4. Estimate/order/challan partial/full conversion without duplicate debt or stock.
5. Stock count/adjustment and a backdated sale with insufficient historical stock.
6. Saved draft recovery after an uncertain create/post response and editing from another tab.
7. Late filter/page/order errors/results and session reset cannot repaint another context.
8. Staff attempts owner/cost/export/correction actions; cross-tenant IDs and expired share links refused.
9. Editable reminder/receipt/custom/bulk/scheduled text preserves final recipient/text and does not send on cancel.
10. Customer/supplier onboarding from a selected phone contact; supported, unsupported, cancel, duplicate and manual cases.

Use an independent hand-calculated or replayed oracle. A UI total compared only to the same helper that rendered it is insufficient. Keep mixed-tax/mixed-cost/date/rounding fixtures distinct; the recorded audit fixture is one example, not comprehensive coverage.

## Evidence and release gates

Each case records ID, business/actor/device, fixture/version, expected/actual, result, screenshot/log, defect and retest. Status: Not started, Pass, Fail, Blocked or Not applicable with reason. Separate automated, browser, physical-device and provider-sandbox evidence.

Release requires: all applicable critical journeys pass; no open critical/high defect in enabled scope; resolved valuation/settlement policies; every default outgoing message editable; declared permissions/isolation verified; migration/backups/rollback rehearsed where relevant; current full regressions and production gates pass; no unreviewed high-risk duplication; both scorecards at least9.0.

Run appropriate current backend/frontend regressions, types, lint, locales, contrast, build and bundle gates. Preserve warnings/known limitations honestly. Budget changes are measured/reviewed, not hidden to get a green gate. Record staging smoke after the deployed commit is verified. Live external sends, database resets and production writes require their normal authorization.

Evidence must state unsupported hardware/industry workflows and performance limits. Do not say “every edge case covered”; publish the tested combinations and remaining gaps.
