# Acceptance and evidence tracker

This is a working checklist for the target release. Existing audit evidence is a baseline; none of these broad requirements is marked Done without current requirement-specific acceptance. Assign named reviewers when scheduling work.

Status values: Not started, In progress, Needs acceptance review, Pass, Fail, Blocked, or Not applicable with approved scope reason. Each requirement links to its single definition; do not maintain competing copies of the requirement text here.

| Requirement | Definition | Responsible role | Status | Evidence / tested commit | Reviewer / date |
|---|---|---|---|---|---|
| BIZ-01 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-02 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-03 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-04 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-05 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-06 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-07 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-08 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-09 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-10 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-11 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-12 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-13 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| BIZ-14 | [product-and-business-requirements](01-product-and-business-requirements.md) | Product/domain | Needs acceptance review | — | — |
| UX-01 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | — | — |
| UX-02 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | — | — |
| UX-03 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | — | — |
| UX-04 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | WP-05 (16 Oct, 9ed67e2, ff1a45b): bill editors draw the line table whenever its columns fit (1024–1440 laptops included) with totals docked below under 1536 px; measured by `e2e/counter-editor-review.mjs` at 8 widths, no overflow or cut text | Owner's acceptance review of the laptop layout |
| DASH-01 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Product/reporting | Needs acceptance review | WP-06 layout A built (16 Oct, 927e52d): To collect ₹3,296 and To pay ₹3,150 equal their lists on the live server; header says Shop and date; `e2e/dashboard-review.mjs`; Overdue decided on the day and its list opened over every overdue bill (bb6dd2a, live 3 · ₹2,160 = list) | Owner's acceptance review |
| DASH-02 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Product/reporting | Needs acceptance review | 927e52d: tiles role-scoped, advances named; Suppliers panel with bills due and top five; API test tile = list | D-03 for dual-role net position |
| DASH-03 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Product/reporting | Needs acceptance review | 09e66a3: Cash in hand, day book and cashbook are the Shop's money only; live tile ₹250 = cashbook ₹250 with an Udhaar cash line present ; 8b42662: the tile says the day it counts from, and a new Shop with one ₹150 tea expense reads "More cash paid out ₹150.00 than came in, since 17/10/2026", never "−₹150" as the till | Owner's acceptance review; recording opening cash is a later feature |
| DASH-04 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Product/reporting | Needs acceptance review | 85a4e3a: each part fails alone and is named; the panel says so with Try again; not cached; staged live at 360 and 1280 (`*-part-failed.png`) | Owner's acceptance review |
| UX-05 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | — | — |
| UX-06 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | — | — |
| UX-07 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | — | — |
| UX-08 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | WP-05 timed entry (16 Oct, 1e35b8b): `e2e/counter-entry-timing.mjs` keys 1/10/50-line walk-in invoices by keyboard alone at 1280 and 1536 and issues them; every line and total matches the server, about 9 keys a line. Fixed on the way: caret returned to Item after a pick; an Enter before the search answered billed the previous answer's top row; Enter with no highlighted row did nothing | Purchase bill not timed; a person at a real counter not timed |
| UX-09 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | — | — |
| UX-10 | [design-and-dashboard-specification](02-design-and-dashboard-specification.md) | Design/frontend | Needs acceptance review | — | — |
| DATA-01 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/security | Needs acceptance review | — | — |
| DATA-02 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/security | Needs acceptance review | — | — |
| DATA-03 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/security | Needs acceptance review | — | — |
| DATA-04 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/security | Needs acceptance review | — | — |
| FIN-01 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/backend | Needs acceptance review | — | — |
| FIN-02 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/backend | Needs acceptance review | — | — |
| FIN-03 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/backend | Needs acceptance review | — | — |
| FIN-04 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/backend | Needs acceptance review | — | — |
| FIN-05 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/backend | Needs acceptance review | — | — |
| FIN-06 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/backend | Needs acceptance review | — | — |
| FIN-07 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/backend | Needs acceptance review | — | — |
| FIN-08 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/backend | Needs acceptance review | — | — |
| STK-01 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/inventory | Needs acceptance review | — | — |
| STK-02 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/inventory | Needs acceptance review | — | — |
| STK-03 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/inventory | Needs acceptance review | — | — |
| STK-04 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/inventory | Needs acceptance review | Owner D-01 choice16 Oct2026; 180 purchase/inventory tests, including mixed/depleted/price-only/void/replay | Policy approved by owner16 Oct; broader release review pending |
| STK-05 | [business-rules-and-data-integrity](03-business-rules-and-data-integrity.md) | Domain/inventory | Needs acceptance review | — | — |
| ENG-01 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | Seven shared-owner moves (R-01..R-07), including the udhaar balance move and the purchase bill due; guarded by source-scan tests | Recorded debt D-01..D-04 remains |
| ENG-02 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | — | — |
| ENG-03 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | — | — |
| ENG-04 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | — | — |
| REUSE-01 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | First pass for money/stock/permission/phone/retry in [reuse-inventory](10-reuse-inventory.md) | UI composition (D-04) not yet inventoried |
| REUSE-02 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | R-01..R-11 consolidated test-first, each copy migrated or deleted (R-06 fixed a library waiver dialog crash on a half-typed amount; R-08 fixed a return cap that refused the last 0.2 KG; R-10 a bill item cell that billed a stale search row; R-11 a phone header sheet that closed after its row opened a dialog; R-12 reason dialogs that closed mid-request; R-13 a receipt number broken across two lines on a phone) | D-04 closed; D-03 waits for the role matrix |
| REUSE-03 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | Exception register X-01..X-06 with reason, owner and review trigger | Reviewer acceptance pending |
| REUSE-04 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | `sharedOwners.test.ts`, `test_bill_due_owner.py` and `tests/architecture/test_shared_owners.py` fail on a re-typed rule | No duplication score claimed |
| REUSE-05 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | No behaviour change: 4,130 frontend tests, purchases/payments/ledger/parties suites, build and bundle gate passed | Full backend run noted in QA.md |
| ENG-05 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | Sales durable recovery: 8 backend scenarios; lost-response/remount, overlapping-save and stale-copy frontend coverage; desktop/390px save/reload. Purchases (16 Oct): 7 backend scenarios (bill+order retry/tombstone, scoping, concurrency, recovered recorded bill, corrected validation, direct record), 7 editor scenarios (lost reply, overlap, adopt v1, conflict, no re-record, slow autosave, late reply); shared queue/decision owners Browser (live stack, 1280/390): purchase lost-reply retry and Record-after-lost-reply (one recorded bill, no draft) 30/30; sales invoice lost-reply retry 18/18 | Purchase reload after lost reply starts a new bill (no device copy); physical network-loss/storage and multi-new-tab cases remain |
| ENG-06 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | Sales and purchase save/load request identities ignore late results after reset; actor/tenant/family(kind) recovery isolation; claim tables registered for tenant export/deletion (sales omission fixed 16 Oct) | Whole-module review remains |
| ENG-07 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | — | — |
| ENG-08 | [engineering-and-code-reuse](04-engineering-and-code-reuse.md) | Engineering | Needs acceptance review | — | — |
| MSG-01 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | Inventory M-01..M-14 in [message-inventory](11-message-inventory.md); 10 of 11 in-scope paths editable (M-06 Remind all, M-10 counter slip, M-11 pay-link text added 16 Oct); M-05 is a link with no prose | M-12 supplier messages not built |
| MSG-02 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | `UbShareSheet` is the shared editable composer; invoice/estimate/order/challan share moved onto it (was a fixed-text `window.open` after a request) | Server-prepared bulk paths not yet |
| MSG-03 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | — | — |
| MSG-04 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | Composer keeps typed words across refetch, explicit 'Use the original message', resets on new opening or recipient (`UbShareSheet.test.tsx`) | — |
| MSG-05 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | Blank/whitespace message opens no channel and says why; Hindi, emoji, newline, `&` and URL round-trip to WhatsApp/SMS/copy (tests) | SMS segment disclosure not built; physical-device handoff not run |
| MSG-06 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | — | — |
| MSG-07 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | Remind all: each customer's words editable before their link (shared `UbMessageBox`); edit never carries to the next customer (`RemindersPageContent.test.tsx`, browser 360/1280) ; Library group message: each member's text editable on its own row (16 Oct) | No single shared edit applied to a Remind all batch |
| MSG-08 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | Remind all shows the exact text and recipient per step; blank opens nothing and says why; edited link goes to the customer's number (browser check) | — |
| MSG-09 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | — | — |
| MSG-10 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | Lending/Library record the edited text; since 16 Oct the khata, record and Remind all reminders send the final words to `/reminders/{id}/send {text}`, which logs them and builds the link from them (`test_reminder_final_text.py`, failed before; browser: the tap posts the edited words); Library messages send `final_text` and the log keeps it (`test_fee_messages.py`, failed before; browser) | Receipt and invoice shares (M-03/M-04) record no text |
| MSG-11 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | Edited-text-reaches-channel, reset, blank, rerender and wrong-recipient cases covered for the shared composer | M-06, M-10, M-11 covered 16 Oct (unit + browser) |
| MSG-12 | [editable-messages-and-reminders](05-editable-messages-and-reminders.md) | Product/messaging | Needs acceptance review | — | — |

## Score and release record

| Field | Entry |
|---|---|
| Release / commit | Not assigned |
| Supported business/capability scope | Not frozen; see D-02 |
| Design/UX weighted score | Not evaluated; target at least9.0 |
| Functionality/business weighted score | Not evaluated; target at least9.0 |
| Lowest dimension / unresolved defects | Not evaluated; D-01 approved16 Oct; sales and purchase SH-011 implemented with simulated lost-reply browser evidence; physical device/network and release evidence remain open |
| Mobile/desktop/device evidence | Link evidence for declared matrix |
| Message inventory completion | First pass 16 Oct: 14 paths listed in [11](11-message-inventory.md); 7 of 11 in-scope editable; 3 open, 1 not built |
| Duplication baseline / high-risk exceptions | First REUSE pass 16 Oct: 5 high-risk duplicates consolidated, 5 exceptions and 4 debts recorded in [10](10-reuse-inventory.md); no overall score measured |
| Migration / rollback evidence | Attach when applicable |
| Product/domain/design/engineering/QA sign-off | Pending |

## Evidence template

- Case ID and requirement IDs:
- Business/capabilities, actor/permissions, tenant/book and device/browser:
- Tested commit/build and fixture/version:
- Preconditions and complete user task:
- Expected outcome and independent calculation where relevant:
- Actual outcome, screenshot/log or artifact:
- Automated/browser/physical/provider-sandbox evidence type:
- Pass/Fail/Blocked/Not applicable and defect link:
- Retest commit, reviewer and date:

## Duplication exception template

- Concern and locations:
- Current single authoritative owner, or extraction proposal:
- Why repetition is necessary / why consolidation would be harmful:
- Risk, affected modules and compatibility evidence:
- Responsible reviewer and review trigger/expiry:

## Business capability review template

| Business/capability | Required for release? | Implemented / verified / gap / excluded | Evidence | Decision owner |
|---|---|---|---|---|
| Complete one row per selected capability in the product matrix | To decide | Not evaluated | — | Product/domain |
