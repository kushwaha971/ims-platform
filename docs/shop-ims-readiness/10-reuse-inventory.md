# WP-03 reuse inventory and exception register

First pass, 16 October 2026 (cloud session). This answers REUSE-01 to REUSE-04 in [04-engineering-and-code-reuse.md](04-engineering-and-code-reuse.md) for the areas REUSE-02 says to do first: money, stock and permission rules, then phone/message and retry behaviour. It is a measured list of what was searched and found, not a duplication score. Repeated UI composition (cards, drawers, menus) has not been audited yet.

`frontend/src/tests/sharedOwners.test.ts`, `backend/apps/purchases/tests/test_bill_due_owner.py` and `backend/tests/architecture/test_shared_owners.py` fail if a consolidated rule is typed out again somewhere other than its owner (REUSE-04, "zero new avoidable duplication in changed scope").

## How it was searched

The search was text and semantic, over `backend/apps` and `frontend/src` excluding tests and migrations:

- writers of `amount_due`, `balance`/`shop_balance`, `on_hand` and `StockMovement`;
- `Number(…)`, `parseFloat` and `.toFixed(2)` near money fields;
- `role === …` checks;
- phone digit stripping and `wa.me` / `sms:` builders;
- day arithmetic with `86_400_000`;
- the draft save/recovery mechanics left by WP-02.

## Consolidated in this pass

| Id | Rule | Copies found | Owner now | Callers migrated | Risk | Evidence |
|---|---|---|---|---|---|---|
| R-01 | WhatsApp link from a party mobile | `sales/view-model/invoiceDisplay.ts` `whatsappUrl`, a second builder with no callers. It took the last ten digits of ANY number and prefixed 91, so `+44 7700 900123` became an Indian number, which is the guess `utils/share.ts` refuses to make. | `src/utils/share.ts` `buildWhatsAppUrl` (it already served the invoice page, the share sheet and the plan screen) | The dead copy was deleted | High if it had been wired up, because a balance would go to a wrong person | `sharedOwners.test.ts` "builds every wa.me link…" |
| R-02 | Who may go over a credit limit (a role, not a codename) | `ledger/hooks/useLedgerEntryForm.ts` and `sales/components/InvoiceEditorPageContent.tsx`, each typing `role === 'owner' \|\| role === 'admin'` | `selectMayOverrideCreditLimit` / `CREDIT_OVERRIDE_ROLES` in `src/redux/slice/sessionSlice.ts`, the client preview of `OVERRIDE_ROLES` in `apps/parties/services/credit.py` | Both | Medium. It only decides which button to draw, and the server re-checks inside the write. | The guard test fails if either copy returns. A contract test reads `credit.py` and fails if the two role lists differ. |
| R-03 | A lending loan's "asked today" = today's instalment + arrears | `lendingDisplay.askedToday`, `LoanPageContent`, `CollectFromBorrowerDialog`, all in float arithmetic | `lendingDisplay.askedToday`, now `addMoney` (Decimal) | Loan page, Collect from | Low. 2M random float sums of 2-dp values gave no wrong result, but canon rule 3 says money is Decimal, and three copies are three places to forget arrears. | Guard test, existing lending tests |
| R-04 | A purchase bill's due = grand total − paid − debit notes applied | `payment_seam.apply_payment` and `debit_notes._move_bill_due`, each spelling it out | `apps/purchases/services/payment_seam.outstanding` | Both writers. The payment path still refuses a negative due, and the debit-note path still clamps at zero. | High: this is the "payment arithmetic that forgets the note" defect the debit-note suite names | `test_bill_due_owner.py`, all 232 purchases + payments tests |
| R-05 | The udhaar balance move: `balance`, its receivable/payable split, `last_activity_at`, the settled-clears-collection-date rule | `parties/services/balance.apply_entry` and `ledger/services/corrections._apply_delta`, line for line | `apps/parties/services/balance.move_main_balance` | `apply_entry` (main book) and LED-03 corrections | High: the khata balance, the reports' receivable/payable totals and the collection round | `tests/architecture/test_shared_owners.py`, all ledger + parties tests, including the replay test `test_a_corrected_party_still_matches_a_full_replay` |
| R-06 (D-01) | Money added or subtracted as floats on screen | Library charge dialogs, member page, enrol cost, mark-lost total; Lending collect-dialog group total, new-loan cost, Collect-from share caption; import review problem total | `utils/money.ts` (`addMoney`, `subtractMoney`, `sumMoney`, `compareMoney`, and the new `moneyOrZero` for a half-typed amount) | All listed | Medium. It found a real crash: typing "." first in a library waiver amount made "Dues after" `NaN`, and `formatInr` threw inside render, so the dialog vanished. | `ChargeDialogs.test.tsx` failed before the change (`[DecimalError] Invalid argument: NaN`). `money.test.ts` tests `moneyOrZero`. A guard pattern on money field names was added. |
| R-07 (D-02) | Whole calendar days between, or added to, business dates (`/ 86_400_000`) | 15 sites: sales and purchase overdue days, reminder due line, library validity, expenses, four "yesterday" chips (ledger entry, correction, expense, payment), aging links, statement range, backdated badge, report day span, chart bar count, party last-activity | `utils/calendarDays.ts` (`daysBetweenIso`, `addDaysIso`, `DAY_MS`), which imports nothing. `utils/dates.ts` re-exports it. | All listed | Low to medium | `dates.test.ts`. The guard forbids the day constant anywhere else. Putting the helpers in `dates.ts` first cost about 2 KB on 20 routes (dayjs), so they live in a dependency-free module. |

## Checked and found single-owned

Each of these was searched for and has one writer:

- **Stock**: `StockMovement` rows and `ItemStock.on_hand` are written only by `apps/inventory/services/stock.py` (`post_movements`). Every other `on_hand` hit is a read.
- **Party balances**: after R-05 every cache move goes through `parties/services/balance` (`apply_entry`, `move_main_balance`). Every `F("balance")` elsewhere is a filter alias.
- **Sales invoice due and status**: `apps/sales/services/amounts.py` (`refresh_invoice_amounts`, `refresh_credit_note`). Other `amount_due =` hits set a lifecycle constant (draft 0, void 0, issue = grand total) at the moment the document enters that state.
- **Draft creation recovery**: `apps.common.draft_creation` with `utils/draftCreation.ts` and `hooks/useDraftSaveQueue.ts`, shared by sales and purchases since WP-02. See [09](09-draft-recovery-contract.md).
- **Phone normalisation for links and display**: `utils/share.ts` (`toWhatsAppDigits`, `formatPhoneForDisplay`, `toDialableNumber`).

## Exception register (REUSE-03)

| Id | Repetition kept | Why | Owner | Review trigger |
|---|---|---|---|---|
| X-01 | `sales/services/amounts.py` and `purchases/services/payment_seam.py` each compute a document's due and status | Different domain rules (ENG-03). Sales subtracts `sales_credit_application` rows and has `issued`; purchases subtracts `meta.debit_applied` and has `recorded`. Merging them would mean a generic function with module switches. | Sales / purchases services | A third document family needs the same formula, or either side changes how returns reduce a due |
| X-02 | `CREDIT_OVERRIDE_ROLES` on the client and `OVERRIDE_ROLES` on the server | Client preview versus authoritative server check. The server must never trust the client's answer. | `sessionSlice` / `parties/services/credit.py` | Kept equal by the contract test in `sharedOwners.test.ts` |
| X-03 | `UbPhoneInput`'s parser and `utils/share.ts`'s `toWhatsAppDigits` | The input parser reads PARTIAL numbers as they are typed (`+919`, pasted spacing). The share reader takes only a complete number and returns `null` rather than guess. Sharing one would weaken one of them. | Design system / `utils/share.ts` | A bug where a number accepted by the input is refused by the share links, or the reverse |
| X-04 | Sales and purchase editors have separate autosave hooks | The sales hook keeps a device copy (`localDrafts`) and the purchase editor has none yet. The shared parts (snapshot, settle, outcome, save queue) are already single-owned. | Sales / purchases editors | WP-05 counter-editor redesign, or adding a device copy to purchases |
| X-05 | `recalc_balances` recomputes the balance and its split itself; `reports/services/scale_seed.py` writes them in SQL | Independent test oracles. The nightly replay must not call the code it checks, and the scale seed builds test volumes in bulk SQL. | Ledger / reports | Either one starts being used to WRITE a live balance |
| X-06 | `ledgerEntrySlice` adds an entry to its running totals with a rounded float | It lives on the app shell, where decimal.js would cost every route. It touches only server totals plus one typed entry, re-rounds immediately, and the next fetch replaces it. | Ledger | The slice moves to lazy injection, or it starts summing more than one entry |

## Recorded debt (not yet consolidated)

Ranked by REUSE-02 order. None of these is known to give a wrong figure today; each is a second copy of a rule.

| Id | Debt | Where | Risk | Proposed owner |
|---|---|---|---|---|
| ~~D-01~~ | Done as R-06. Was: float money arithmetic (`Number(a) + Number(b)`, `.toFixed(2)`) instead of `utils/money.ts` | Library: `ChargeDialogs.after`, `MemberDetailPageContent` owed-in-all, `memberDisplay` fees, `useCounter` total. Lending: `CollectDialog` group total, `NewLoanPageContent` interest + deductions, `CollectFromBorrowerDialog.shareCaption`. Ledger: `ledgerEntrySlice` amount ± delta. Imports: `ImportReviewStep` problem totals. | Medium. Canon rule 3 says money is Decimal, and these are display figures only. | `utils/money.ts` (`addMoney`, `subtractMoney`, `sumMoney`, `compareMoney`) |
| ~~D-02~~ | Done as R-07. Was: whole-day difference between two ISO dates, written ten times with `86_400_000` | `invoiceDisplay.daysOverdue`, `purchaseBillDisplay` (the same function), `reminderDisplay`, `partyDisplay`, `memberDisplay.daysBetween`, `expenseDisplay`, `ExpenseFormDrawer`, `LedgerEntryDrawer`, `LedgerCorrectionDrawer`, `agingDisplay` | Low to medium: due and overdue captions | `utils/dates.ts` |
| D-03 | Role checks for "owner" in screens | `AccountDataPageContent`, `PendingDeletionBanner`, `TenantSwitcherMenu`, `onboardingDisplay`, `useSettingsAccess` | Low. These choose screens for the owner, the server enforces, and they are not one rule but several. | Review with WP-07/WP-10 role matrix |
| D-04 | Repeated UI composition (cards, overlays, action menus) | Not yet inventoried | Unknown | Next WP-03 pass, alongside WP-05 |
| D-05 | Quantity arithmetic in floats (`Number(qty) - Number(returned)`, stock-short lines) | `creditNoteForm`, `purchaseBillDisplay`, `inventorySchemas`, `printModel` | Low: three decimal places, shown or validated, never saved from the client | `utils/quantity.ts` |

## Next

D-01 and D-02 were cleared on 16 October (R-06, R-07). D-05 (quantities) is the remaining mechanical debt. WP-04 (editable messages) begins with its own outgoing-text inventory and should reuse `utils/share.ts`; it must not add a third link builder.
