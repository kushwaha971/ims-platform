# Delivery roadmap and decisions

Status: planned work; no target score has been achieved merely by creating these documents. Work one complete vertical slice at a time: review → implement → run → look → reconcile → report.

## Ordered work packages

| Package | Priority / responsible role | Deliverable and exit criteria |
|---|---|---|
| WP-01 Truth and scope | P0, product owner + domain reviewer | Approved definitions for ledgers, dual roles, return valuation and supported business capabilities; reproducible fixtures |
| WP-02 Financial/recovery hardening | P0, backend + frontend lead | SH-009 valuation/replay resolution, SH-011 draft recovery, atomic/idempotent lifecycle and cross-book/tenant tests |
| WP-03 Shared ownership audit | P0/P1, engineering lead | Whole-codebase duplication inventory, reuse catalogue, high-risk single-owner fixes and exception register |
| WP-04 Universal editable communication | P1, product + frontend/backend | Complete outgoing-path inventory; shared composer/adapters; every applicable MSG requirement passes in all apps |
| WP-05 Counter editor redesign | P1, design + frontend | Reviewed dense bill/purchase designs; width/keyboard/tax behavior; real 1/10/50-line speed/accuracy evidence |
| WP-06 Shop dashboard | P1, design + reporting/backend | Defined KPI contracts, separate customer/supplier panels, attention priorities and matching drill-downs; all figures reconcile |
| WP-07 Records and onboarding | P1, frontend + domain | Consistent drawers, role-specific copy, selected phone contacts for Customers/Suppliers/Udhaar, item purchase cost/default selling price/editable margin, mobile price visibility and safe archived/duplicate handling |
| WP-08 Returns/documents | P1, document/backend/frontend | Complete credit/refund/return proof, supported print/share and conversion histories |
| WP-09 Business capability validation | P1/P2, product + QA | Product business matrix classified; optional variants/units/batches/locations/etc scoped and capability-gated |
| WP-10 Readiness evidence | P0 release gate, QA + design/domain reviewers | Device/network/security/performance tests, scorecards, staging smoke and explicit release/rollback decision |

WP-03 starts early and accompanies every package. Do not postpone duplication review until after new copies have spread. Financial decisions precede financial code changes; dashboard definitions precede decorative KPI designs. WP-04 covers Library/Lending/Udhaar as well as Shop and must preserve each app's ownership and rules.

## Concrete first backlog

- Resolve SH-009 using the audited ₹640-versus-₹610.26 example and independent stock replay; include remaining-value/zero-stock/void cases.
- Design persistent logical draft identity/recovery for response loss, changed contents and remounts; confirm no duplicate draft/post and no lost edits.
- Inventory every default outgoing-text path before migrating to the shared composer. Start with customer due reminder, supplier payment confirmation and receipt share, then bulk/scheduled and other apps.
- Review full-width desktop bill rows and compact context without regressing minimum field widths or mobile total dock.
- Define Shop dashboard figures with exact scope/date/tax/return treatment and authoritative endpoints; remove any unsupported metric.
- Surface mobile selling price/unit; finish Supplier-specific onboarding/bulk labels and hide single-page controls.
- Add supplier-return document proof with the correct original bill and settlement effect.

## Decision register

| ID | Decision required | Decision owner / evidence |
|---|---|---|
| D-01 | RESOLVED 16 Oct 2026: retain normative weighted-average stock costing; supplier credit retains original bill price/tax; correct conflicting documentation | Explicit owner response; mixed-cost, depleted, price-only and void/replay regression12/12 passed |
| D-02 | Supported businesses and capability limits for the release; phased batch/expiry/variants/serial/unit/location support | Product owner with representative merchants; publish capability matrix |
| D-03 | Explicit dual-role customer/supplier settlement/net-position behavior and dashboard cohort definitions | Product/domain owner; no silent change to existing balance rules |
| D-04 | Personal user-owned Udhaar and login landing/migration | Separate ownership project; preserve current business entries and member privacy |
| D-05 | Communication modes: manual handoff, configured providers and schedules; retention, consent, limits and truthful statuses | Product/engineering owner; editable text mandatory regardless of supported mode |
| D-06 | Physical-device/browser/printer support and production performance envelope | Engineering/QA; freeze devices, workloads and budgets before sign-off |

## Package handoff

Each package supplies: requirement IDs, current/proposed behavior, design/data contract, source owner and reuse plan, intentional exceptions, API/migration impact, acceptance scenarios, screenshots, independent reconciliation where relevant, tests/gates, known limitations and release notes. Assign named people when work is scheduled; role names here do not imply a staffed team or date commitment.

Update [QA.md](../../QA.md) with verified checkpoints and this pack with current acceptance status. Keep the historical audit intact. Ship no fictional figures, unverified competitor claims or claimed delivery status unsupported by evidence.


## Additional owner requirements — 16 October 2026

Owner explicitly requested keeping the roadmap order, without reprioritizing the new request. Add the following to WP-07 after the earlier packages:

- Item pricing: existing purchase-cost reference and default selling price plus editable profit margin. Margin is `(net selling price − reference purchase cost) / net selling price × 100`, not markup. Cost/margin edits recalculate default selling price; manual selling-price edits recalculate margin. Define zero/undefined cases, precision, tax-inclusive normalization and validation before coding.
- Preserve invoice snapshots and invoice-specific overrides/discounts. Master pricing changes never rewrite old invoices or stock movement costs. Internal purchase cost/margin remain permission-gated and excluded from customer invoices, print/PDF and share documents.
- Show internal pricing in authorized item search/selection where useful, with default vs actual transaction pricing clearly distinguished. Reuse existing controls/calculation owners; do not add parallel pricing logic in each screen.
- Reuse the existing selected-phone-contact prefill for Customer/Supplier/Udhaar onboarding and appropriate inline-add flows. Keep role/book/tenant context, explicit save and duplicate checks; preserve manual entry and unsupported/cancel behavior. Selecting a contact does not itself create a person or send a message.

These are queued requirements, not implemented features. The next implementation work remains WP-02 recovery hardening.


## WP-02 continuation — 16 October 2026

Sales SH-011 is implemented with the [durable recovery contract](09-draft-recovery-contract.md). Do not reimplement it. Next inspect purchase bills/orders: their first draft POST currently has no durable creation key; the purchase autosave completion resets current typing unconditionally. Treat these as remaining WP-02 work, with fail-before tests and reuse review before extending the protocol. Shared lifecycle mechanics should have one owner with typed sales/purchase adapters; preserve their distinct financial/stock/posting rules. WP-03 reuse inventory accompanies this work. WP-04 communications and WP-05/06 design follow; pricing/contacts stay in WP-07.


## WP-02 continuation — purchases (16 October 2026, cloud session)

Purchase bills/orders now follow the durable recovery contract (09, ADR-063 addendum), with the protocol mechanics moved to shared owners and sales migrated onto them. Simulated lost-reply browser checks now pass for purchase save, purchase Record and sales invoice save (`e2e/purchase-recovery-look.mjs`, `e2e/sales-recovery-look.mjs`). Remaining in WP-02: physical network-interruption/device evidence for both editors and SH-011's release review by the owner. Next package after that evidence: WP-03 reuse inventory (continue from the shared owners added here), then WP-04.


## WP-03 first pass — shared owners (16 October 2026, cloud session)

The reuse inventory and exception register are in [10-reuse-inventory.md](10-reuse-inventory.md). This pass covered money, stock, permission, phone and retry rules. Five duplicated rules now have one owner, and each move was test-first:

- the udhaar balance move (`move_main_balance`);
- the purchase bill due (`payment_seam.outstanding`);
- the credit-override role (`selectMayOverrideCreditLimit`);
- lending's asked-today figure;
- the WhatsApp link builder (a dead copy that guessed numbers was deleted).

Source-scan tests stop each one from being typed out again. Remaining WP-03 debt is mechanical: float money arithmetic in Library/Lending screens (D-01) and day arithmetic (D-02), then the UI-composition audit (D-04) alongside WP-05. WP-04 (editable messages) is next and must reuse `utils/share.ts`.

## WP-04 first slice — the shared composer (16 October 2026, cloud session)

The outgoing-text inventory is in [11-message-inventory.md](11-message-inventory.md). `UbShareSheet` is now the editable composer, which changed four paths at once:

- the khata reminder;
- the bill/source reminder;
- the payment receipt;
- the sales document share. This one used to open WhatsApp with fixed text in a pop-up that phones block, and now opens the composer.

The Lending dialog was already editable. (The Library dialog was thought to be, but only its custom message was; see below.)

## WP-04 continuation — every buildable path (16 October 2026, cloud session)

Done the same day, each with fail-before tests and a browser check:

- bulk "Remind all" is editable per customer (MSG-07/08);
- reminder and Library message logs keep the words that left (MSG-10), through `/reminders/{id}/send {text}` and the Library send's `final_text`, with one server rule (`whatsapp_text.final_text`);
- the library counter slip, the UPI QR words, and every Library member and group message are editable.

What remains:

- M-12 supplier messages, which do not exist yet and start on the composer when WP-08 builds them;
- M-03/M-04 (receipt and invoice share text not recorded), a WP-08 decision;
- physical-device handoff evidence.

WP-03 D-05 (quantity arithmetic) was done on 16 October as R-08. The next step is WP-05, which begins with a design review for the owner before any build, with the D-04 UI-composition audit alongside it. The review is in [12-counter-editor-design-review](12-counter-editor-design-review.md). It found that 1280 and 1440 laptops get a 290 px phone card per line. The owner chose layout A (a table by the lines' own width, with the totals docked below), and it was built the same day, with the compact context fold. The timed entry evidence followed (`e2e/counter-entry-timing.mjs`): 1, 10 and 50 lines keyed and issued exactly at 1280 and 1536, after fixing three keyboard defects it found, one of which billed the wrong item. What remains of WP-05 is the owner's acceptance review. Next is the WP-03 D-04 UI-composition consolidation (D-04a action sheets, D-04c reason dialogs, D-04d).

