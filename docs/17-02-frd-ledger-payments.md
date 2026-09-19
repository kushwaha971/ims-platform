# Part 17.2–17.5 — FRD: Ledger, Payments, Expenses, Notifications

This chapter specifies the `ledger`, `payments`, `expenses` and `notifications` modules at implementation depth using the 24-section template of Part 17.0. Vocabulary, statuses, paths and permission codenames are those of Part 0 (canon); tables and columns are those of Part 21; endpoint shapes are those of Part 22. Anything this chapter needs that canon does not yet define is collected under **Canon change requests** at the end and is *not* assumed anywhere else in the text.

Cross-cutting conventions used by every feature below (stated once):

| Concern | Convention |
|---|---|
| Frontend feature folder | `src/modules/DigiKhaato/features/<feature>/{api,components,hooks,redux,types,constants,view-model,validation}`; services `api/<x>Service.ts`; slices `redux/<x>Slice.ts`; thunks `redux/<x>Thunk.ts` (`createAsyncThunk`); types `types/<x>.types.ts`; display helpers `view-model/<x>Display.ts` |
| Yup schemas | Exported from `src/hooks/useValidationSchemas.ts` and composed from shared validators `amountValidation()`, `businessDateValidation()`, `mobileValidation()`, `reasonValidation()` |
| Toasts | Only through `snackbarSlice` (`showSnackbar({ tone, message, action? })`) |
| Money | `decimal.js-light` on the client for previews; server recomputes; API strings with 2 decimals |
| Dates | Business dates `YYYY-MM-DD` in tenant timezone (`Asia/Kolkata` default); displayed `dd/mm/yyyy` via `src/utils/dates.ts` |
| Idempotency | Every create-POST sends `Idempotency-Key: crypto.randomUUID()` generated once per form mount and regenerated after a 2xx |
| Errors | `handleAxiosError` maps `error.code` to i18n key `errors.<code>`; field errors from `details` go to RHF `setError` |
| Analytics | `track(event, props)` from `src/utils/analytics.ts`; MVP sink is console/no-op; no PII (no names, mobiles, notes) in properties; every event carries `tenant_id`, `user_role`, `surface: mobile|desktop` |
| Backend services | `<app>/services/<x>.py` functions wrapped in `transaction.atomic()`, writing `platform_audit_log` through `platform.audit.record()`; selectors in `<app>/selectors.py` |
| Scheduler | `python manage.py run_scheduler` ticks every 60 s, runs due scheduled tasks and drains `platform_job` rows (`jobs.enqueue(task, payload, run_after=None)`); every task is idempotent |

## 17.2 Ledger (LED)

### LED-01 — Record "You gave" / "You got"

#### 1. Business Objective
Replace the pencil entry in the paper khata with two taps that are faster than paper and produce an immutable, attributable, SMS-able record. This is the most frequent action in the product; every other ledger feature is downstream of it. Success is measured by: median time from party page open to entry saved ≤ 8 s on a mid-range Android phone; ≥ 95 % of entries saved without a validation error; 0 balance drift between `parties_party.balance` and Σ `ledger_entry` in nightly `recalc_balances`.

#### 2. User Personas
Owner (OW) — records most entries at the counter. Staff (ST) — records entries during the owner's absence; cannot correct. Accountant (AC) — reads entries, never posts. End customer (CU) — receives the transaction SMS (LED-08) and later views the statement (LED-04).

#### 3. User Stories
1. US-LED-01-1 — As an owner I want to tap "You gave", type an amount and save so that credit given at the counter is written in under ten seconds.
2. US-LED-01-2 — As an owner I want to record "You got" with the payment mode (cash/UPI/…) so that the cashbook and the party balance both stay right.
3. US-LED-01-3 — As staff I want to backdate an entry to yesterday so that entries I forgot are placed on the correct day.
4. US-LED-01-4 — As an owner I want to attach a photo of the kachha bill to an entry so that disputes can be settled by looking at the paper.
5. US-LED-01-5 — As an owner I want to be warned or blocked when a new credit pushes a party over their credit limit so that exposure stays controlled.
6. US-LED-01-6 — As an owner I want to see the party's new balance immediately after saving so that I can tell the customer the baaki.

#### 4. Functional Requirements
1. FR-1 The party page (`PTY-03`) exposes two primary actions: **You gave ₹** (red, `direction=debit`) and **You got ₹** (green, `direction=credit`). Both open `LedgerEntryDrawer` (`UbDrawer`, bottom sheet on mobile, right drawer on desktop) preset to the chosen direction.
2. FR-2 The form fields are: `amount` (required, `UbMoneyInput`), `entry_date` (required, default today, `UbDateInput` with chips Today/Yesterday/Pick), `note` (optional, ≤ 255), `payment_mode` (required when `direction=credit`, `MLToggleGroup` of `cash | upi | bank | cheque | card | other`, default `cash`, remembered per device in `localStorage.ub.lastPaymentMode`), `reference` (optional, ≤ 64, shown when mode ∈ {upi, bank, cheque, card}), `attachment` (optional, one image via `UbFileUpload`).
3. FR-3 Saving calls `POST /ledger-entries` with `Idempotency-Key`; the response's `meta.party_balance` replaces the header balance in `UbPartyHeader` without a refetch, and the new row is prepended to the timeline (`UbTimeline`) with a "Saved" tick.
4. FR-4 The direction is switchable inside the drawer (segmented control) without losing typed values; switching to `credit` reveals `payment_mode`.
5. FR-5 The server maps `direction=debit → entry_type=manual_gave`, `credit → manual_got`, `source_type=manual`, `status=posted`, and updates `parties_party.balance`, `receivable_total|payable_total`, `last_activity_at` in the same transaction.
6. FR-6 Credit-limit enforcement per `platform_tenant_setting.ledger.credit_limit_mode ∈ {off, warn, block}` applies to `debit` entries only (BR-6).
7. FR-7 After save the drawer offers **Save & add another** (keeps party, resets amount/note; date and mode persist) and **Done**.
8. FR-8 The entry is attributed: `created_by_id` is shown in the timeline as "by <first name>" when the actor is not the viewer.
9. FR-9 If the party has `sms_opt_in=true`, the tenant setting `ledger.party_sms_on_entry=on` and a mobile, the server enqueues the LED-08 transaction SMS; the API response is not delayed by it.
10. FR-10 Photo attachments are uploaded before the entry POST (see §14, and CCR-3 for the upload endpoint); the entry references `attachment_id`; a failed upload never blocks saving the entry — the user is offered "Save without photo".
11. FR-11 Amount entry uses a numeric keypad (`inputMode="decimal"`); a leading ₹ addon is displayed; Indian grouping is applied on blur (`1,23,456.50`).
12. FR-12 Offline / poor-network: the submit shows an optimistic timeline row labelled "Saving…"; on network failure the draft is retained in the slice and a snackbar offers **Retry**; the same `Idempotency-Key` is reused on retry so a delayed first request cannot double-post.

#### 5. Non-Functional Requirements
- P95 `POST /ledger-entries` ≤ 250 ms server time (single transaction, four row writes: entry, party update, audit, optional job).
- Drawer opens ≤ 100 ms after tap (no data fetch required; party already in store).
- Works on 360 px wide screens, 2 GB RAM Android Chrome; the keyboard must not cover the Save button (button pinned in drawer footer, `env(safe-area-inset-bottom)`).
- WCAG 2.2 AA: red/green always paired with the words "You gave"/"You got"; toggle group has `role="radiogroup"`.
- Locales `en` and `hi`; Hindi labels: उधार दिया (You gave), जमा (You got), बाकी (Balance).
- Image compression client-side to ≤ 300 KB, longest edge 1600 px, before upload.

#### 6. User Flow
Primary: Party list → party page → tap **You gave ₹** → drawer opens with amount focused and keypad up → type `500` → (optional) note "Sugar 10 kg" → Save → row appears, header shows "₹2,800 · You will get" → drawer closes (or stays for "Save & add another").
Alternate A (got): tap **You got ₹** → amount → mode chip UPI → reference UTR (optional) → Save → row in green, header balance decreases.
Alternate B (backdate): tap date chip **Yesterday** or **Pick** → calendar limited to ≤ today → Save; the row is inserted at its date position in the timeline (not at the top) and the timeline scrolls to it.
Alternate C (credit limit, warn): Save → 201 with `warnings[]` → snackbar "Saved. Ramesh is now ₹3,000 over the ₹50,000 limit."
Alternate D (credit limit, block): Save → 409 `credit_limit_exceeded` → inline banner in drawer "Limit ₹50,000 · Balance after this entry ₹53,000"; owner/admin see **Save anyway** (re-submits with `override=true`); staff see only **Cancel**.
Alternate E (network fail): Save → request fails → optimistic row turns amber "Not saved" with **Retry**; drawer contents preserved.

#### 7. UI Requirements
- Component tree: `LedgerEntryDrawer` (`UbDrawer`) → `UbForm` (`ledgerEntrySchema`) → `DirectionToggle` (`MLToggleGroup`), `UbMoneyInput name="amount" autoFocus`, `UbDateInput name="entryDate" maxDate=today`, `PaymentModeToggle` (`MLToggleGroup`, six options with lucide icons `Banknote`, `Smartphone`, `Landmark`, `FileText`, `CreditCard`, `MoreHorizontal`), `UbField name="reference"` (`MLInput`, `ds-mono`), `UbField name="note"` (`MLTextarea`, 2 rows, counter 255), `UbFileUpload name="attachment" accept="image/*" capture="environment"`, footer `MLButton variant="primary"` "Save" + `MLButton variant="secondary"` "Save & add another".
- Drawer title: "You gave · Ramesh Traders" in `ds-h3`, tinted `--error` for debit and `--success` for credit (an accent bar at the drawer top, not a filled header).
- Mobile (< 640 px): bottom sheet at 92 vh, single column, keypad-friendly; desktop (≥ 1024 px): right drawer 480 px.
- Timeline row (`UbTimeline` item): left = date group header (dd MMM), row = note or "You gave"/"You got" label, right = `UbAmount` signed with tone; second line `ds-caption`: mode · reference · "by Sunita" · thumbnail if attachment.
- Keyboard: Enter in amount → focus note; Cmd/Ctrl+Enter → Save; Esc → close with confirm if dirty.

#### 8. UX Requirements
- Copy keys: `ledger.entry.gave` "You gave", `ledger.entry.got` "You got", `ledger.entry.amount` "Amount", `ledger.entry.note` "Note (optional)", `ledger.entry.mode` "Received via", `ledger.entry.reference` "UTR / cheque no.", `ledger.entry.saveAnother` "Save & add another", `ledger.entry.saved` "Saved. Balance ₹{balance} · {direction}". Hindi: `hi.ledger.entry.gave` "उधार दिया", `hi.ledger.entry.got` "जमा हुआ", `hi.ledger.entry.mode` "किस माध्यम से मिला".
- Colour: debit rows/amounts `text-error`, credit rows/amounts `text-success`; header balance positive → "You will get" in `--error`, negative → "You will give" in `--success`, zero → "Settled" in `--text-tertiary`.
- No confirmation dialog on save (speed); undo is not offered — the correction path is LED-03 and the snackbar action is **Correct**.
- Default date is today; the last used date is *not* remembered across drawers (research D-15 asks for quick chips, not sticky dates).
- The snackbar after save states what happened and the next move: "Saved ₹500 · Ramesh now owes ₹2,800" with action **Remind** (LED-06) when balance > 0.

#### 9. States
| State | What the user sees |
|---|---|
| Initial | Drawer with amount focused, mode chips (credit only), Save disabled until amount valid |
| Loading | Save button shows `MLSpinner` + "Saving…"; fields disabled; optimistic row "Saving…" |
| Empty | Not applicable (form) |
| Success | Row inserted; header balance updated; snackbar; drawer closes or resets |
| Error (validation) | Field-level `UbFieldError` under the field; Save enabled |
| Error (409 credit limit) | In-drawer `MLAlert` outlined error with limit figures; **Save anyway** for owner/admin |
| Error (network) | Amber optimistic row "Not saved" + **Retry**; drawer preserved |
| Disabled | Party archived → both buttons hidden, banner "Restore party to add entries"; user lacks `ledger.entry.write` → buttons hidden |
| Partial | Attachment upload failed → "Save without photo" secondary action |
| Processing / Completed / Failed | SMS status is not shown in this flow (see LED-08 for message status on the row) |

#### 10. Validation Rules
Yup schema `ledgerEntrySchema` (in `useValidationSchemas.ts`):

| Field | Rule | Message (en) | Code |
|---|---|---|---|
| amount | required; decimal ≤ 2 dp; `> 0`; ≤ 99,999,999.99 | "Enter an amount greater than 0" / "Amount too large" | `validation_error` (`details.amount`) |
| entryDate | required; valid date; ≤ today (tenant TZ); ≥ 2000-01-01 | "Date cannot be in the future" | `details.entry_date` |
| direction | one of `debit`,`credit` | — | `details.direction` |
| paymentMode | required when `direction=credit`; one of six modes | "Choose how you received the money" | `details.payment_mode` |
| reference | ≤ 64 chars; trimmed | "Max 64 characters" | `details.reference` |
| note | ≤ 255 chars | "Max 255 characters" | `details.note` |
| attachmentId | uuid or null | — | `details.attachment_id` |
| partyId | uuid; party `status=active` | "This party is archived" | `details.party_id` |

Cross-field: `payment_mode` must be null when `direction=debit` (server nulls it silently rather than erroring). Server re-validates every rule; client validation is a preview.

#### 11. Business Rules
1. BR-1 Entries are immutable: the API has no PATCH/DELETE for `ledger_entry`; DB trigger `forbid_update_delete` permits changes only to `status` and `reversed_by_id`.
2. BR-2 Party balance after posting: `balance' = balance + amount` for `debit`, `balance − amount` for `credit`; recompute rule (Part 21 §21.3.4) is the source of truth: `balance = Σ amount [direction=debit, status=posted] − Σ amount [direction=credit, status=posted]`.
3. BR-3 `receivable_total = max(balance, 0)`, `payable_total = max(−balance, 0)`; both stored on the party in the same transaction.
4. BR-4 `last_activity_at = now()` on the party for every posted entry (including backdated ones — activity is about when the user acted).
5. BR-5 `entry_date` is the business date used for statements, aging and day book; `created_at` orders ties within a day.
6. BR-6 Credit limit: let `L = party.credit_limit`, `B = balance`, `A = amount`. For `debit` entries when `L IS NOT NULL` and mode ≠ `off`: if `B + A > L` → mode `warn` ⇒ post and return `warnings: [{ code: "credit_limit_exceeded", limit: L, balance_after: B+A }]`; mode `block` ⇒ 409 `credit_limit_exceeded` unless `override=true` and actor has `ledger.entry.correct` (owner/admin). Credit entries never trigger the check.
7. BR-7 `payment_mode` and `reference` are stored on the ledger entry for manual "got" (no `payments_payment` row is created — a manual got is a ledger-only event); the cashbook (EXP-03) reads manual `manual_got` entries by `payment_mode` alongside payments.
8. BR-8 Idempotency: same key + same body within 24 h → replay 201 with `Idempotent-Replayed: true`; same key + different body → 409 `idempotency_conflict`.
9. BR-9 Archived parties (`status=archived`) reject new entries with 409 `party_archived` (see CCR-2 for code registration).
10. BR-10 Amounts are `Decimal`; the client never sends floats; `"500"` is accepted and normalised to `"500.00"`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Open drawer / post entry | `ledger.entry.write` | ✅ | ✅ | ✅ | ❌ |
| Override blocked credit limit | `ledger.entry.correct` | ✅ | ✅ | ❌ | ❌ |
| View entries | `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ |

Module gate: `ledger ∈ tenant.enabled_modules` else 403 `module_disabled`.

#### 13. Edge Cases
1. EC-1 Double tap on Save → second request carries the same `Idempotency-Key` → replayed response; UI de-duplicates by entry `id`.
2. EC-2 Entry dated in a previous financial year → allowed; statement and aging use `entry_date`; a `ds-caption` "Backdated" tag appears on the row when `entry_date < created_at::date − 1`.
3. EC-3 Party is both customer and supplier → the same two buttons; direction semantics are unchanged (canon §0.2); the header label flips between "You will get"/"You will give" by sign.
4. EC-4 Amount `0.005` → client rounds to 2 dp on blur (`0.01` half-up); server rejects > 2 dp with `validation_error`.
5. EC-5 Party has no mobile → entry saves; SMS step is `skipped` silently (LED-08).
6. EC-6 Attachment uploaded but entry never saved → orphan `files_attachment` with `owner_id NULL` is garbage-collected after 24 h by `files.gc_orphans` scheduled task.
7. EC-7 Two staff post to the same party concurrently → both succeed; party row update uses `SELECT … FOR UPDATE` on the party so the cached balance is serialised.
8. EC-8 Tenant timezone makes "today" differ from the device clock → the client computes "today" from the tenant timezone provided by `/auth/me`, not the device.
9. EC-9 Direction switched after typing a reference → reference is kept in form state but not sent for `debit`.
10. EC-10 Very large note pasted (> 255) → truncated with counter turning error; save blocked until trimmed.

#### 14. API Requirements
- `POST /ledger-entries` — body per Part 22 §22.5 plus optional `override: true`. Response 201 `{ data: LedgerEntry, meta: { party_balance: "2800.00", warnings: [] } }`. Errors: 400 `validation_error`; 403 `permission_denied`/`module_disabled`; 404 party (cross-tenant); 409 `credit_limit_exceeded`, `party_archived`, `idempotency_conflict`.
- `LedgerEntry` shape: `{ id, party_id, direction, amount, entry_date, entry_type, source_type, source_id, note, payment_mode, reference, status, reversed_by_id, reverses_id, supersedes_id, reason, attachment: { id, url, thumb_url } | null, created_by: { id, name }, created_at }`.
- `POST /parties/{id}/ledger-entries` — identical body without `party_id` (convenience route; same service).
- Attachment upload precedes the entry (CCR-3: `POST /attachments` multipart `{ kind: "bill_photo", file }` → 201 `{ id, url }`).
- Frontend: `ledgerService.ts` → `postLedgerEntry(payload, idempotencyKey)`, `uploadAttachment(file, kind)`; thunks `postLedgerEntry`, `uploadEntryAttachment` in `ledgerEntryThunk.ts`; slice `ledgerEntrySlice` with `{ byParty: Record<partyId, { ids, cursor, hasMore }>, entities, draft, posting: 'idle'|'pending'|'failed', lastError }`; selectors `selectEntriesForParty`, `selectPostingState`. Party balance update dispatched to `partySlice.actions.balanceUpdated({ partyId, balance })`.

#### 15. Database Impact
Writes: `ledger_entry` (insert), `parties_party` (`balance`, `receivable_total`, `payable_total`, `last_activity_at`), `platform_audit_log` (insert), `files_attachment` (`owner_type='ledger_entry'`, `owner_id` set), `platform_job` (insert when SMS applicable). Reads: `parties_party` (FOR UPDATE), `platform_tenant_setting` (`ledger.credit_limit_mode`, `ledger.party_sms_on_entry`). Indexes used: `IX(tenant_id, party_id, entry_date, created_at)`. No new indexes.

#### 16. Audit Requirements
`action='ledger.entry.created'`, `entity_type='ledger_entry'`, `after` = full row snapshot, `metadata` = `{ request_id, ip, user_agent, idempotency_key, credit_limit_warning?: true, override?: true }`. Overrides additionally write `action='ledger.credit_limit.overridden'`.

#### 17. Notifications
- SMS to party (LED-08) when enabled: template `LEDGER_ENTRY_GAVE` / `LEDGER_ENTRY_GOT` (bodies in LED-08 §17).
- No in-app notification for the actor; owners receive an in-app `NTF-01` notification of type `staff_entry_posted` only when setting `ledger.notify_owner_on_staff_entry` is on (CCR-5, setting key) — otherwise none.

#### 18. Analytics / Event Tracking
`ub.ledger.entry_posted` `{ direction, entry_type, amount_bucket: "<100|100-999|1k-9k|10k-99k|1L+", backdated: bool, has_note, has_attachment, payment_mode, credit_limit_outcome: none|warn|block|override, duration_ms_from_open }`; `ub.ledger.entry_post_failed` `{ error_code }`; `ub.ledger.entry_drawer_opened` `{ direction, source: party_page|fab|list_row }`.

#### 19. Security
Tenant scoping via `tid` claim; `party_id` outside the tenant → 404. `note`/`reference` stored as text and rendered escaped (React) — never interpreted. Attachments validated by magic bytes (`Pillow.Image.verify`), EXIF stripped, served through the storage API with tenant check. Rate limit 600 req/min/user (general). Mobile numbers never appear in analytics.

#### 20. Performance
One transaction, ≤ 6 statements. Party update by primary key with row lock. Timeline uses cursor pagination (`limit=50`) so the post response never triggers a full reload. Client compresses images before upload (~300 KB) to protect 3G users.

#### 21. Testing
- T-LED-01-1 (unit, backend) `post_entry` debit updates balance and totals exactly.
- T-LED-01-2 (unit) credit without `payment_mode` → `validation_error`.
- T-LED-01-3 (unit) future `entry_date` rejected; today in `Asia/Kolkata` accepted when UTC date differs.
- T-LED-01-4 (API) credit limit `warn` → 201 with `warnings[]`; `block` → 409; `block + override` by staff → 403; by owner → 201 + audit `ledger.credit_limit.overridden`.
- T-LED-01-5 (API) idempotent replay returns identical body and header; conflicting body → 409.
- T-LED-01-6 (API) archived party → 409 `party_archived`; cross-tenant party → 404.
- T-LED-01-7 (DB) UPDATE of `amount` on `ledger_entry` raises from trigger.
- T-LED-01-8 (component) `LedgerEntryDrawer` renders red accent for debit, green for credit; mode toggle hidden for debit; Save disabled until valid.
- T-LED-01-9 (component) network failure keeps draft and shows Retry; retry reuses idempotency key (spy on service).
- T-LED-01-10 (E2E) open party → You gave 500 → header balance increments; You got 200 UPI → decrements; timeline order by date.
- T-LED-01-11 (perf) `recalc_balances` after 10k random entries yields zero drift.
- T-LED-01-12 (permission) accountant sees no buttons; staff sees buttons but no "Save anyway".

#### 22. Acceptance Criteria
- AC-1 (US-LED-01-1) Given an active party with balance ₹2,300, when I post "You gave" ₹500 dated today, then the response balance is ₹2,800, the header shows "₹2,800 · You will get" in red, and a `ledger_entry` row exists with `entry_type=manual_gave`, `status=posted`.
- AC-2 (US-LED-01-2) Given the same party, when I post "You got" ₹300 with mode `upi` and reference `UTR123`, then balance is ₹2,500, the entry has `payment_mode=upi`, `reference=UTR123`, and no `payments_payment` row is created.
- AC-3 (US-LED-01-3) Given today is 18/09/2026, when I choose Yesterday and save, then `entry_date=2026-09-17` and the row appears under the 17 Sep group.
- AC-4 (US-LED-01-4) Given I attach a 4 MB photo, when I save, then the uploaded attachment is ≤ 300 KB, linked to the entry, and a thumbnail shows in the row.
- AC-5 (US-LED-01-5) Given `credit_limit_mode=block`, limit ₹50,000 and balance ₹49,800, when staff posts ₹500, then 409 `credit_limit_exceeded` is returned and no row is written; when the owner repeats with `override=true`, then 201 and an override audit row exist.
- AC-6 (US-LED-01-6) Given a slow network, when I save and the request fails, then the draft is preserved, an amber row shows "Not saved", and Retry succeeds with one entry only.

#### 23. Dependencies
PTY-01/PTY-03 (party page and header), PTY-06 (credit limit setting), LED-08 (SMS), NTF-02 (adapter), PLT-06 (`ledger.credit_limit_mode`, `ledger.party_sms_on_entry`), `files` app (CCR-3 upload endpoint), design-system `UbDrawer`, `UbMoneyInput`, `UbDateInput`, `UbFileUpload`, `UbTimeline`, `UbPartyHeader`.

#### 24. Future Enhancements
Offline write queue (ADR-020, Phase 2) reusing the idempotency key as client id; voice amount entry (Phase 3 exploration); "move entry to another party" as a correction preset (LED-03 extension); customer acknowledgement flag per entry via PTY-09 view link.

### LED-02 — Opening balance

#### 1. Business Objective
Let a business migrate yesterday's dues from paper on day one by recording, per party, the amount owed on a chosen date as the first ledger entry, so statements and aging start from a true position. Measured by: ≥ 80 % of parties created in the first week carry an opening balance; zero parties with more than one `opening` entry.

#### 2. User Personas
Owner (OW) during onboarding and bulk import (PTY-10). Accountant (AC) verifying opening positions against the old books.

#### 3. User Stories
1. US-LED-02-1 — As an owner I want to enter "they owe me ₹2,300 as of 1 April" while creating a party so that the khata starts correct.
2. US-LED-02-2 — As an owner I want to add an opening balance to a party I created earlier without one so that I can migrate gradually.
3. US-LED-02-3 — As an owner I want to fix a wrong opening balance so that the rest of the statement is right, without deleting history.

#### 4. Functional Requirements
1. FR-1 The party create form (PTY-01) has an "Opening balance" section: `amount`, `direction` toggle "They owe me (You will get)" / "I owe them (You will give)", `as_of` date (default first day of current FY, ≤ today).
2. FR-2 `POST /parties` with `opening_balance` posts a `ledger_entry` with `entry_type=opening`, `source_type=manual`, `direction` as chosen, `entry_date=as_of`, `note="Opening balance"` in the same transaction as the party insert.
3. FR-3 A party without an `opening` entry shows an **Add opening balance** link in the party page header menu; it opens `OpeningBalanceDrawer` and posts via `POST /ledger-entries` with `entry_type: "opening"` (CCR-1).
4. FR-4 A party may have at most one `opening` entry with `status=posted`; a second attempt returns 409 `opening_balance_exists` (CCR-2). Correcting it uses LED-03 (`/correct`), which reverses and re-posts an `opening` replacement with `supersedes_id`.
5. FR-5 Statements (LED-04) render the opening entry as the first row labelled "Opening balance" and never show it inside the date-range opening figure when `date_from ≤ as_of`.
6. FR-6 CSV import (PTY-10/IMP-01) maps columns `opening_amount`, `opening_direction`, `opening_as_of` to the same service `post_opening_balance()`.
7. FR-7 The opening entry participates in aging (LED-09) with age counted from `as_of`.

#### 5. Non-Functional Requirements
Same latency budget as LED-01. Hindi copy: "शुरुआती बाकी" (opening balance), "उन्हें देना है" / "मुझे देना है" for direction hints. The `as_of` picker allows dates back to 2000-01-01.

#### 6. User Flow
Primary: Parties → **Add party** → name, mobile → expand "Opening balance" → amount ₹2,300 → toggle "They owe me" → as_of 01/04/2026 → Save → party detail shows balance ₹2,300 and one timeline row "Opening balance".
Alternate A: existing party → header ⋯ menu → **Add opening balance** → drawer → Save.
Alternate B: wrong figure → long-press/⋯ on the opening row → **Correct** → LED-03 flow with `entry_type=opening` preserved.
Alternate C: party already has an opening entry → menu item hidden; API returns 409 if forced.

#### 7. UI Requirements
`OpeningBalanceSection` (collapsible `MLCard` inside PTY-01 form): `UbMoneyInput name="openingBalance.amount"`, `MLRadioGroup name="openingBalance.direction"` with two options labelled with colour swatch + text, `UbDateInput name="openingBalance.asOf" maxDate=today` with chips "FY start" / "Today" / "Pick". `OpeningBalanceDrawer` reuses the section inside `UbDrawer`. Timeline row uses `UbStatusBadge tone="info"` "Opening".

#### 8. UX Requirements
Keys: `ledger.opening.title` "Opening balance", `ledger.opening.theyOwe` "They owe me", `ledger.opening.iOwe` "I owe them", `ledger.opening.asOf` "As of", `ledger.opening.exists` "This party already has an opening balance. Correct it from the entry instead." Direction hint under the toggle: "You will get ₹2,300" (red) / "You will give ₹2,300" (green). Default direction: "They owe me" for customers, "I owe them" for suppliers (`is_supplier && !is_customer`).

#### 9. States
Initial (collapsed section, "Add opening balance (optional)") · Loading (Save spinner) · Success (party created with balance; row visible) · Error (field errors; 409 banner) · Disabled (section hidden for accountant; menu item hidden when opening exists) · Empty (party with no opening: menu item visible).

#### 10. Validation Rules
`openingBalanceSchema`: `amount` > 0, ≤ 2 dp; `direction ∈ {debit, credit}`; `asOf` ≤ today, ≥ 2000-01-01; when section is expanded and amount empty → "Enter an amount or remove the opening balance". Server: same plus uniqueness (BR-2).

#### 11. Business Rules
1. BR-1 `entry_type=opening`, `source_type=manual`, `source_id=NULL`, `note='Opening balance'` (i18n applied on display, stored in English).
2. BR-2 At most one posted `opening` per party: enforced in `post_opening_balance()` with `SELECT … FOR UPDATE` on the party and a check `EXISTS (ledger_entry WHERE party_id=? AND entry_type='opening' AND status='posted')` (a partial unique index is proposed in CCR-4 as defence-in-depth).
3. BR-3 `as_of` may precede other entries; statements order by `entry_date, created_at` so the opening lands first when dated earliest. If a user backdates an ordinary entry before `as_of`, the statement still orders by date — the "Opening" label remains but a `ds-caption` warning "Entries exist before the opening date" is shown on the statement header.
4. BR-4 Balance maths identical to LED-01 (debit adds, credit subtracts).
5. BR-5 Correction of an opening (LED-03) keeps `entry_type=opening` on the replacement; reversal alone leaves the party with no opening (menu item reappears).

#### 12. Permissions
Post opening on create/existing party: `ledger.entry.write` **and** `parties.party.write` (owner, admin, staff). Correct opening: `ledger.entry.correct` (owner, admin). Read: `ledger.entry.read`.

#### 13. Edge Cases
1. EC-1 Import file has opening for a mobile that already exists with an opening → row error "Opening balance already exists" in import preview; the row is skipped, not merged.
2. EC-2 `as_of` in the future → rejected ("Date cannot be in the future").
3. EC-3 Party created with `opening_balance.amount="0.00"` → 400 `validation_error` (use no opening instead).
4. EC-4 Party archived (balance zero) then restored → may still add an opening if none exists.
5. EC-5 Both-flag party (customer+supplier) → direction toggle default "They owe me"; hint text shows both interpretations.

#### 14. API Requirements
- `POST /parties` — `opening_balance: { amount, direction, as_of }` (Part 22 §22.4). Response includes `summary.balance`.
- `POST /ledger-entries` — with `entry_type: "opening"` (CCR-1) and body `{ party_id, direction, amount, entry_date }`; `note` ignored (server sets). 409 `opening_balance_exists`.
- `POST /ledger-entries/{id}/correct` — allowed for `entry_type=opening` (LED-03).
- Frontend: `ledgerService.postOpeningBalance(payload)`; thunk `postOpeningBalance` in `ledgerEntryThunk.ts`; `partyThunk.createParty` passes `openingBalance` through; selector `selectOpeningEntry(partyId)` = entry with `entry_type='opening' && status='posted'`.

#### 15. Database Impact
Insert `ledger_entry` (`entry_type='opening'`), update `parties_party` caches, `platform_audit_log`. Reads `ledger_entry` by `(tenant_id, party_id)` for uniqueness. CCR-4 proposes `U(party_id) WHERE entry_type='opening' AND status='posted'`.

#### 16. Audit Requirements
`ledger.entry.created` with `after.entry_type='opening'`; when created through party creation, `metadata.via='party_create'`; via import `metadata.via='import', import_job_id`.

#### 17. Notifications
None. Opening balances do **not** trigger the LED-08 transaction SMS (the customer did not transact today; an SMS "₹2,300 udhaar added" would be misleading). Documented in LED-08 BR-3.

#### 18. Analytics / Event Tracking
`ub.ledger.opening_posted` `{ direction, amount_bucket, via: party_create|drawer|import, as_of_is_fy_start: bool }`.

#### 19. Security
As LED-01. Import path validates every row server-side; no raw CSV values reach SQL.

#### 20. Performance
Single transaction with the party insert. Import posts openings in batches of 500 inside the import job.

#### 21. Testing
T-LED-02-1 (unit) party create with opening → one entry, balance equals amount with sign. T-LED-02-2 (API) second opening → 409 `opening_balance_exists`. T-LED-02-3 (API) correction of opening keeps `entry_type=opening` on replacement and `supersedes_id` set. T-LED-02-4 (unit) supplier-only party defaults direction credit in `openingBalanceDisplay.defaultDirection()`. T-LED-02-5 (component) collapsed section shows no validation until expanded. T-LED-02-6 (E2E) create party with opening ₹2,300 → statement first row "Opening balance", closing ₹2,300. T-LED-02-7 (import) CSV with opening columns posts entries; duplicate flagged.

#### 22. Acceptance Criteria
- AC-1 (US-LED-02-1) Given I create "Ramesh Traders" with opening ₹2,300 "They owe me" as of 01/04/2026, when saved, then the party balance is ₹2,300 and the first statement row is "Opening balance ₹2,300" dated 01/04/2026.
- AC-2 (US-LED-02-2) Given a party with no opening, when I add ₹1,000 "I owe them" from the header menu, then balance is −₹1,000 shown as "You will give ₹1,000" in green.
- AC-3 (US-LED-02-3) Given an opening of ₹2,300, when I correct it to ₹2,800 with reason "Typo", then the statement with corrections shows the struck-through ₹2,300, a reversal, and a new opening ₹2,800; without corrections it shows only ₹2,800.

#### 23. Dependencies
PTY-01, PTY-10/IMP-01, LED-03, LED-04, CCR-1 (entry_type on POST), CCR-4 (unique index, optional).

#### 24. Future Enhancements
IMP-04 migration mappers (Khatabook/Vyapar exports) feed `post_opening_balance()`; bulk "opening stock and balances as of FY start" wizard in Phase 2.

### LED-03 — Correct or reverse an entry

#### 1. Business Objective
Give owners a safe way to fix mistakes (wrong amount, wrong date, wrong direction, duplicate) without ever deleting history, so the book remains auditable and the customer-facing statement can show what was fixed. Measured by: 100 % of corrections leave `Σ posted` consistent with party balance; 0 rows deleted; median correction time ≤ 20 s.

#### 2. User Personas
Owner/Admin (OW) — the only roles that may correct. Staff (ST) — may *request* a correction by leaving a note (out of scope) but sees the entry as read-only. Accountant (AC) — reviews correction chains in statements with the corrections toggle. Customer (CU) — sees struck-through lines on a shared statement.

#### 3. User Stories
1. US-LED-03-1 — As an owner I want to reverse a duplicate entry with a reason so that the balance is right and the mistake is visible in history.
2. US-LED-03-2 — As an owner I want to correct the amount/date/note/direction of a manual entry in one step so that I do not have to reverse and re-type.
3. US-LED-03-3 — As an accountant I want to see the full chain (original → reversal → replacement) so that I can audit the book.
4. US-LED-03-4 — As an owner I want to be told to void the invoice instead when the entry came from a document so that ledger and stock stay in sync.

#### 4. Functional Requirements
1. FR-1 Every posted entry row (`UbTimeline` item) offers a ⋯ menu with **Correct** and **Reverse** for users with `ledger.entry.correct`; document-sourced entries (`source_type ≠ manual`) show **Open <document number>** instead.
2. FR-2 **Reverse** opens `UbReasonDialog` (reason ≥ 3 chars) showing consequences: "Balance ₹2,800 → ₹2,300". Confirm calls `POST /ledger-entries/{id}/reverse`.
3. FR-3 **Correct** opens `LedgerCorrectionDrawer` pre-filled with the original values; editable: `amount`, `entry_date`, `note`, `direction`, `payment_mode`, `reference`; a `reason` field is required. Confirm calls `POST /ledger-entries/{id}/correct`.
4. FR-4 The server performs, atomically: (a) mark original `status=reversed`, `reversed_by_id=<reversal.id>`; (b) insert reversal entry `entry_type=reversal`, `direction` opposite of original, `amount` equal, `entry_date` = original `entry_date`, `source_type=ledger_entry`, `source_id=original.id`, `reverses_id=original.id`, `reason`; (c) for corrections, insert replacement entry with the new values, `entry_type` = original `entry_type` (`manual_gave`/`manual_got`/`opening`/`write_off`, switched to `manual_got`/`manual_gave` if direction changed), `supersedes_id=original.id`, `reason`; (d) recompute party caches; (e) audit rows.
5. FR-5 An entry already `reversed` cannot be reversed or corrected again → 409 `entry_already_reversed` (CCR-2); the replacement entry can be corrected (chains are allowed).
6. FR-6 Document-sourced entries (`invoice`, `credit_note`, `purchase_bill`, `debit_note`, `payment_in`, `payment_out`, `expense`) return 409 `use_document_void`; the UI deep-links to the document's void action.
7. FR-7 The timeline shows reversed originals struck-through with a `UbStatusBadge tone="neutral"` "Reversed" and the reason on hover/tap; reversal and replacement rows carry "Reversal of …" / "Replaces …" captions linking to each other. A per-party toggle "Show corrections" (default off) hides reversed originals and reversal rows, leaving replacements.
8. FR-8 `GET /ledger-entries/{id}` returns `history` — the ordered chain `[original, reversal, replacement, …]` — rendered in `LedgerEntryDetailDrawer`.
9. FR-9 Corrections/reversals of an entry that produced a party SMS (LED-08) enqueue a corrective SMS only if the original SMS status was `sent` or `delivered` (LED-08 BR-6).
10. FR-10 If the correction changes the balance sign or crosses a credit limit, the same credit-limit rules as LED-01 BR-6 apply to the replacement (owner/admin are the actors, so `override` is implicit and audited).

#### 5. Non-Functional Requirements
P95 ≤ 300 ms for `/correct` (three inserts, one update, party update, audit). Reason text ≤ 160 chars (column). Hindi copy for "Reverse" = "रद्द करें", "Correct" = "सुधारें", "Reversed" = "रद्द किया गया". Screen-reader text for struck-through rows: "Reversed entry, ₹500, reason: entered twice".

#### 6. User Flow
Primary (correct): party page → row ⋯ → **Correct** → drawer shows original (read-only summary card) and editable form below → change amount 500 → 550, reason "Wrong amount" → **Save correction** → consequences line updates live "Balance ₹2,800 → ₹2,850" → confirm → timeline: original struck through (hidden if toggle off), new row ₹550 with "Replaces entry of 18 Sep".
Alternate A (reverse): row ⋯ → **Reverse** → `UbReasonDialog` → confirm → original struck through, reversal row visible only with toggle.
Alternate B (document entry): row ⋯ → only **Open INV/26-27/0042** → invoice page → **Void** (SAL-05).
Alternate C (already reversed): menu shows no actions; badge "Reversed".
Alternate D (staff): menu shows **Details** only; drawer shows a hint "Ask an owner or admin to correct this entry".

#### 7. UI Requirements
`LedgerCorrectionDrawer` (`UbDrawer`): top `MLCard` "Original" with amount (`UbAmount`), date, note, mode, created by; then `UbForm` (`ledgerCorrectionSchema`) with `DirectionToggle`, `UbMoneyInput amount`, `UbDateInput entryDate`, `PaymentModeToggle` (credit only), `MLInput reference`, `MLTextarea note`, `MLInput reason` (required, placeholder "Why are you correcting this?"); a `ConsequenceLine` (`ds-body-sm`) computed client-side: `balance_after = balance − signed(original) + signed(new)`; footer `MLButton primary` "Save correction". `UbReasonDialog` for reverse with title "Reverse this entry?", body consequences, destructive **outlined** confirm "Reverse". `LedgerEntryDetailDrawer` shows `history` as a vertical `UbTimeline` with arrows.

#### 8. UX Requirements
Copy keys: `ledger.correct.title` "Correct entry", `ledger.correct.reason` "Reason", `ledger.correct.consequence` "Balance {before} → {after}", `ledger.reverse.title` "Reverse this entry?", `ledger.reverse.body` "The entry stays in history, struck through. Balance {before} → {after}.", `ledger.entry.reversed` "Reversed", `ledger.entry.replaces` "Replaces entry of {date}", `ledger.entry.reversalOf` "Reversal of entry of {date}", `ledger.toggle.showCorrections` "Show corrections", `errors.use_document_void` "This entry came from {number}. Void that document to reverse it." Struck-through rows use `line-through text-text-muted`; the amount keeps its direction colour at 60 % opacity so the original direction remains legible. Confirmation is always required (financial change); there is no undo — a wrong correction is corrected again.

#### 9. States
Initial (drawer with original + prefilled form) · Loading ("Saving…") · Success (drawer closes; snackbar "Corrected. Balance ₹2,850" with action **Show corrections**) · Error 409 `entry_already_reversed` (banner + refresh row) · Error 409 `use_document_void` (banner with **Open document**) · Disabled (no permission: actions hidden) · Empty (history with a single node when no chain) · Completed (row badges rendered).

#### 10. Validation Rules
`ledgerCorrectionSchema` = `ledgerEntrySchema` fields + `reason: string().trim().min(3).max(160).required()` ("Give a short reason (3–160 characters)"). `reverseReasonSchema` = `{ reason }` same rule. Cross-field: at least one of `amount`, `entry_date`, `note`, `direction`, `payment_mode`, `reference` must differ from the original → else "Nothing changed — use Reverse if the entry should not exist" (`details.non_field_errors`, code `validation_error`). Server mirrors.

#### 11. Business Rules
1. BR-1 Reversal entry: `direction = opposite(original.direction)`, `amount = original.amount`, `entry_date = original.entry_date`, `entry_type='reversal'`, `source_type='ledger_entry'`, `source_id=original.id`, `reverses_id=original.id`, `status='posted'`. DB constraint: `reversal ⇒ reverses_id NOT NULL`.
2. BR-2 Original: `status='reversed'`, `reversed_by_id=reversal.id`; these are the only mutable columns (trigger).
3. BR-3 Replacement: new values; `supersedes_id=original.id`; `entry_type` preserved (`opening` stays `opening`; `write_off` stays `write_off`; `manual_*` follows the new direction); `source_type='manual'`; `status='posted'`; `reason` copied.
4. BR-4 Balance after correction: `B' = B − s(o)·o.amount + s(r)·r.amount` where `s(debit)=+1`, `s(credit)=−1`. Recompute rule of Part 21 still holds because the reversal cancels the original.
5. BR-5 Statement `include_corrections=false` excludes rows where `status='reversed'` **and** rows with `entry_type='reversal'`; replacements are shown. `include_corrections=true` shows all with visual treatment.
6. BR-6 Only `source_type ∈ {manual}` entries (which covers `manual_gave`, `manual_got`, `opening`, `write_off`) may be reversed/corrected here; everything else → `use_document_void`.
7. BR-7 Reversal and replacement `entry_date` for the reversal equals the original's date so period totals for that date net to zero; the replacement uses the (possibly new) date supplied.
8. BR-8 `running_balance_after` is not stored at MVP (computed on read); corrections therefore never require recomputation of cached rows.
9. BR-9 A correction to an `opening` entry must keep the party's single-opening invariant (LED-02 BR-2): the original is `reversed`, so exactly one `posted` opening remains.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Reverse / correct manual entry | `ledger.entry.correct` | ✅ | ✅ | ❌ | ❌ |
| View history chain | `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. EC-1 Correcting a `manual_got` to `debit` direction → replacement becomes `manual_gave`, `payment_mode` nulled.
2. EC-2 Two admins correct the same entry simultaneously → second gets 409 `entry_already_reversed` (status check under `SELECT … FOR UPDATE` on the original).
3. EC-3 Correction chain of length 5 → `history` returns all; UI collapses beyond 3 with "Show full chain".
4. EC-4 Reversing the only `opening` → party has no opening; LED-02 menu item reappears.
5. EC-5 Entry has an attachment → replacement re-links the same `attachment_id` unless the user removes it (attachment `owner_id` stays on the original; replacement stores the same id — attachments are read-only references).
6. EC-6 Reversal makes balance cross zero → header flips label/colour; aging recalculated on read.
7. EC-7 Original entry produced a `delivered` SMS → corrective SMS template `LEDGER_ENTRY_CORRECTED` (LED-08) is enqueued; if the original SMS was `skipped`/`failed`, nothing is sent.
8. EC-8 Correction that would breach a `block` credit limit → allowed for owner/admin (they hold `ledger.entry.correct`), audited as override.

#### 14. API Requirements
- `POST /ledger-entries/{id}/reverse` `{ reason }` → 201 `{ data: reversal, meta: { party_balance, original: { id, status: "reversed" } } }`. 409 `use_document_void`, `entry_already_reversed`; 403 `permission_denied`; 404.
- `POST /ledger-entries/{id}/correct` `{ reason, amount, entry_date, note, direction, payment_mode?, reference?, attachment_id? }` → 201 `{ data: { reversal, replacement }, meta: { party_balance } }`. Same errors plus 400 `validation_error` (no change).
- `GET /ledger-entries/{id}` → entry + `source` (`{ type, id, number, url }` or null) + `history[]`.
- `GET /parties/{id}/ledger-entries?include_reversed=true` returns reversed originals and reversals; default `false` applies BR-5.
- Frontend: `ledgerService.reverseEntry(id, reason)`, `correctEntry(id, payload)`, `getEntry(id)`; thunks `reverseLedgerEntry`, `correctLedgerEntry`, `fetchLedgerEntry` in `ledgerEntryThunk.ts`; slice updates `entities[original].status='reversed'` and inserts new rows; `ledgerEntrySlice.showCorrections` boolean per party persisted in `localStorage.ub.showCorrections`.

#### 15. Database Impact
`ledger_entry`: update (`status`, `reversed_by_id`) + 1–2 inserts; `parties_party` caches; `platform_audit_log` 2–3 rows; `platform_job` for corrective SMS. Reads via `IX(tenant_id, party_id, entry_date, created_at)`; chain traversal via `reverses_id`/`supersedes_id` (FK indexes).

#### 16. Audit Requirements
`ledger.entry.reversed` (`before` = original row, `after` = original with `status=reversed`, `metadata.reason`, `metadata.reversal_id`); `ledger.entry.corrected` (`before` = original, `after` = replacement, `metadata.reason`, `reversal_id`, `replacement_id`). Retention ≥ 7 years.

#### 17. Notifications
Corrective party SMS (LED-08) template `LEDGER_ENTRY_CORRECTED`: en "{shop}: entry of Rs {old_amount} on {date} was corrected to Rs {new_amount}. Balance Rs {balance}." / hi "{shop}: {date} की Rs {old_amount} की एंट्री सुधार कर Rs {new_amount} की गई। बाकी Rs {balance}।" For reversal: `LEDGER_ENTRY_REVERSED` en "{shop}: entry of Rs {amount} on {date} was cancelled. Balance Rs {balance}." No in-app notification.

#### 18. Analytics / Event Tracking
`ub.ledger.entry_reversed` `{ entry_type, amount_bucket, age_days_of_entry }`; `ub.ledger.entry_corrected` `{ changed_fields: [amount|date|note|direction|mode|reference], direction_changed: bool }`; `ub.ledger.correction_blocked` `{ error_code }`; `ub.ledger.corrections_toggle` `{ on }`.

#### 19. Security
Permission enforced server-side; the UI hiding is cosmetic. `reason` is stored as text, rendered escaped. Reversals of cross-tenant ids → 404. No rate limit beyond default.

#### 20. Performance
One transaction; row lock on original and party. `history` computed by following two FK columns with at most N hops (N = chain length), each by PK.

#### 21. Testing
T-LED-03-1 (unit) reverse debit 500 → reversal credit 500 same date; balance −500; original `reversed`. T-LED-03-2 (unit) correct amount 500→550 → reversal + replacement `supersedes_id`; balance +50. T-LED-03-3 (unit) direction flip switches `entry_type` and nulls mode. T-LED-03-4 (API) invoice-sourced entry → 409 `use_document_void`. T-LED-03-5 (API) second reverse → 409 `entry_already_reversed`. T-LED-03-6 (API) no-change correction → 400. T-LED-03-7 (API) staff → 403. T-LED-03-8 (DB) trigger blocks UPDATE of `amount`; permits `status`. T-LED-03-9 (selector) statement with/without corrections returns expected rows and identical closing balance. T-LED-03-10 (component) struck-through row has accessible text; toggle hides/shows. T-LED-03-11 (E2E) correct then correct again → chain of 3 in detail drawer. T-LED-03-12 (SMS) corrective SMS enqueued only when original message `sent|delivered`.

#### 22. Acceptance Criteria
- AC-1 (US-LED-03-1) Given a posted "You gave" ₹500 and balance ₹2,800, when I reverse it with reason "Entered twice", then balance is ₹2,300, the original is struck through with badge "Reversed", and a reversal entry exists with `reverses_id` set.
- AC-2 (US-LED-03-2) Given the same entry, when I correct amount to ₹550 with reason "Wrong amount", then balance is ₹2,850, one reversal and one replacement (`supersedes_id` = original) exist, and the timeline without corrections shows only the ₹550 row.
- AC-3 (US-LED-03-3) Given a corrected entry, when I open the replacement's details, then `history` lists original → reversal → replacement with reasons.
- AC-4 (US-LED-03-4) Given an entry sourced from INV/26-27/0042, when I try to reverse it, then I receive 409 `use_document_void` and the UI offers to open the invoice.

#### 23. Dependencies
LED-01, LED-02, LED-04 (corrections toggle), LED-08 (corrective SMS), SAL-05/PUR-04/PAY-05/EXP-01 void flows (for `use_document_void` deep links), `UbReasonDialog`, `UbDrawer`.

#### 24. Future Enhancements
"Move entry to another party" preset (reversal + replacement on a different `party_id`) in Phase 2; staff correction requests with owner approval (Phase 3, custom roles PLT-12).

### LED-04 — Party statement with running balance

#### 1. Business Objective
Produce the "hisaab" — a passbook-style statement per party for any date range with opening balance, every entry, running balance after each row, closing balance, document links and optional correction rows — printable/savable as PDF from the browser and shareable through WhatsApp. This is the trust artefact that ends disputes. Measured by: statement opened for ≥ 30 % of parties with non-zero balance per month; share action used ≥ 1×/week per active tenant; closing balance always equals `party.balance` when the range is unbounded.

#### 2. User Personas
Owner (OW) shares statements; Staff (ST) prints at the counter; Accountant (AC) exports for reconciliation; Customer (CU) receives the PDF/link.

#### 3. User Stories
1. US-LED-04-1 — As an owner I want to see all entries for a party with a running balance so that I can read the khata like a passbook.
2. US-LED-04-2 — As an owner I want to filter by date range (this month, FY, custom) so that I can send a customer only the period in question.
3. US-LED-04-3 — As an owner I want to share the statement on WhatsApp as a PDF or link so that the customer sees the same numbers I see.
4. US-LED-04-4 — As an accountant I want to toggle corrections on so that I can audit reversals.
5. US-LED-04-5 — As a customer I want the statement to carry a UPI QR so that I can pay the closing balance immediately.

#### 4. Functional Requirements
1. FR-1 Route `app/(app)/parties/[id]/statement/page.tsx` renders `<PartyStatementPageContent/>` with a filter bar (`UbDateRangePicker` presets: This month · Last month · This FY · Last FY · All time · Custom; `MLSwitch` "Show corrections"), a summary strip (`UbStatCard` ×3: Opening, Net change, Closing) and the statement table (`UbDataGrid`, card mode on mobile).
2. FR-2 Data comes from `GET /parties/{id}/statement?date_from&date_to&include_corrections&cursor`; the response carries `opening_balance`, `rows[]` each with `running_balance`, `closing_balance`, `totals { debit, credit }`, and `meta { next_cursor, has_more }`.
3. FR-3 Running balance formula (server, SQL window): rows ordered by `(entry_date ASC, created_at ASC, id ASC)`; `opening = Σ s(d)·amount` over posted rows with `entry_date < date_from` (all rows when `date_from` empty); `running_i = running_{i−1} + s(direction_i)·amount_i`, `running_0 = opening`; `closing = running_n`. With `include_corrections=false` rows are filtered per LED-03 BR-5 *before* the window so running balances remain correct (the excluded pairs net to zero).
4. FR-4 Each row shows: date, particulars (note or entry-type label; document number as a link when `source_type ∈ {sales_document, purchase_document, payment, expense}`), "You gave" column (debit amount, red), "You got" column (credit amount, green), running balance with the label "You will get"/"You will give"/"Settled" via `UbAmount`.
5. FR-5 **Print / Save PDF** renders `StatementPrintView` (React print component, `@media print` stylesheet, A4 portrait) and calls `window.print()` (ADR-014). Layout is specified in §7.
6. FR-6 **Share** opens `UbShareSheet` with: *WhatsApp* (NTF-03: `wa.me` text with closing balance and the share link), *Copy link*, *Download PDF* (print view), *SMS* (only when NTF-02 provider configured; else hidden).
7. FR-7 Share link: `POST /parties/{id}/share-links { kind: "statement", expires_in_days: 7, date_from?, date_to? }` → `{ url, expires_at }`; the public page (`/d/<token>` resolving through `GET /public/d/{token}`) renders the same `StatementPrintView` read-only with the tenant's branding and a "Pay via UPI" QR (PAY-03) when `tenant.upi_vpa` is set and closing balance > 0.
8. FR-8 Filter state (`from`, `to`, `corrections`) lives in the URL query so the page is linkable; the statement table uses cursor pagination with "Load more" (50 rows per page) and print always fetches all rows first (progress indicator when > 500 rows).
9. FR-9 Document links open the source document page (`/sales/invoices/{id}` etc.); payment rows link to the receipt (PAY-04).
10. FR-10 Export CSV (`ledger.statement.export`) downloads the current filter as CSV via `GET /parties/{id}/statement?format=csv` (format param per §22.11 convention; see CCR-6).
11. FR-11 The statement header warns "Entries exist before the opening balance date" when applicable (LED-02 BR-3).

#### 5. Non-Functional Requirements
P95 ≤ 400 ms for 50 rows including window function on a 100k-row tenant (index `(tenant_id, party_id, entry_date, created_at)`). Print of 1,000 rows ≤ 3 s. Print view fonts: Inter + Noto Sans Devanagari self-hosted so Hindi notes render; `font-variant-numeric: tabular-nums` on amount columns. Public page requires no auth, is `noindex`, and rate-limited 60 req/min/IP. Works offline for already-loaded rows (read-only).

#### 6. User Flow
Primary: party page → **Statement** (header quick action) → default range "This FY" → table with running balance → tap **Share** → WhatsApp → WhatsApp opens with text "Namaste Ramesh ji, aapka hisaab (01/04/2026–18/09/2026): Baaki ₹2,800 (You will give). Dekhein: https://…/d/abc123 — Sharma Store" → user taps Send.
Alternate A (print): **Print / Save PDF** → browser print dialog → Save as PDF.
Alternate B (custom range): Custom → `UbDateRangePicker` → Apply → URL updates → table reloads.
Alternate C (corrections): toggle on → struck-through originals and reversal rows appear; closing balance unchanged.
Alternate D (public): customer opens link → statement page with logo, rows, closing, QR → scans → pays → (MVP) the owner records the payment manually (PAY-01) or via unmatched queue (PAY-07, P2).
Alternate E (expired link): `GET /public/d/{token}` → 404 → page "This link has expired. Ask the business for a new one."

#### 7. UI Requirements
Screen (mobile): sticky `UbPageHeader` "Statement · Ramesh Traders" with back, actions ⋯ (Print, Export CSV); range chips scroll horizontally; summary strip as three compact `UbStatCard`s; rows as cards: date + particulars left, gave/got amount right, running balance beneath in `ds-caption`. Desktop: filter bar row, three `UbStatCard`s, `UbDataGrid` columns `Date | Particulars | You gave | You got | Balance` with right-aligned `ds-num` amounts; sticky footer row with totals.

`StatementPrintView` (in `features/ledger/components/print/StatementPrintView.tsx`, shared with public page):
1. Header band: tenant logo (≤ 48 px high), trade name (`ds-h2`), address line, phone, GSTIN (`ds-mono`) — from `whiteLabelSlice`/tenant; right side: "Statement / हिसाब", party name (`ds-h3`), party mobile, period "01/04/2026 – 18/09/2026", generated at timestamp.
2. Summary line: Opening balance · Total you gave · Total you got · Closing balance (each with label + `UbAmount`).
3. Table: columns Date · Particulars · You gave (₹) · You got (₹) · Balance (₹) · label; hairline rows; zebra none; struck-through rows for reversed originals (`text-decoration: line-through; color: --text-muted`) and italic caption "Reversal of …"/"Replaces …" when corrections are included; document numbers in `ds-mono`.
4. Closing block: "Closing balance ₹2,800 — You will give (आप देंगे)" in `ds-metric-md`, tone by sign.
5. Footer: UPI QR (`UbQrCode`, 128 px) built with `upi://pay?pa=…&pn=…&am=<closing>&cu=INR&tn=Statement%20<party>` when `tenant.upi_vpa` and closing > 0 (PAY-03 §11); "Pay ₹2,800 via UPI" caption; tenant `doc_footer`; "Generated by <app_name>" (white-label `app_name`).
6. Page breaks: `break-inside: avoid` on rows; repeating `<thead>` per page; page number via CSS counters where supported.

#### 8. UX Requirements
Keys: `ledger.statement.title` "Statement", `ledger.statement.opening` "Opening balance", `ledger.statement.closing` "Closing balance", `ledger.statement.youGave` "You gave", `ledger.statement.youGot` "You got", `ledger.statement.balance` "Balance", `ledger.statement.showCorrections` "Show corrections", `ledger.statement.share` "Share", `ledger.statement.print` "Print / Save PDF", `ledger.statement.linkExpired` "This link has expired. Ask the business for a new one.", `ledger.statement.beforeOpening` "Entries exist before the opening balance date." Hindi: "हिसाब", "शुरुआती बाकी", "अंतिम बाकी", "उधार दिया", "जमा". Colour: debit column red, credit column green, balance tone by sign; labels always present. Default range "This FY"; remembered per user in `localStorage.ub.statementRange`.

#### 9. States
Initial (range chips, skeleton grid rows ×8) · Loading (skeleton) · Empty first-use (no entries: `UbEmptyState` "No entries yet" + **You gave** CTA) · Empty filtered ("No entries in this period" + **Clear filters**) · Success (table + summary) · Error (`UbEmptyState variant="error"` with request id + Retry) · Processing (print fetching all rows: `MLProgress` "Preparing 1,240 rows…") · Disabled (Export hidden without `ledger.statement.export`; Share hidden for accountant? — no, accountant may share read-only links) · Public expired (404 page).

#### 10. Validation Rules
`statementFilterSchema`: `dateFrom ≤ dateTo`; both valid dates or empty; range ≤ 5 years ("Choose a range of up to 5 years"); `includeCorrections` boolean. Share link: `expires_in_days ∈ [1, 30]` (default 7). Server: 400 `validation_error` for inverted range.

#### 11. Business Rules
1. BR-1 Ordering key `(entry_date, created_at, id)`; the same ordering is used by the timeline and the day book so numbers agree across screens.
2. BR-2 Opening for the range = signed sum of posted rows dated strictly before `date_from`; when `include_corrections=false` the filter excludes reversed originals and reversal rows from that sum too (pairs net to zero, so the value is identical — implemented consistently to avoid off-by-one on same-day reversals).
3. BR-3 Closing of an unbounded range must equal `parties_party.balance`; a mismatch logs `ledger.balance_drift` at WARN with party id and triggers `recalc_balances --party` asynchronously via `jobs.enqueue`.
4. BR-4 Sign display: `running > 0` → "You will get" (party owes), `< 0` → "You will give", `= 0` → "Settled".
5. BR-5 Totals `debit_total`, `credit_total` are over rows returned in the range (post-filter).
6. BR-6 Public statement shows the party's name and mobile masked (`+91 98••• ••678`) and never shows other parties or tenant totals.
7. BR-7 Share links are single-party, expire (default 7 d), and are revocable by deleting the row (`parties_share_link`, listed as P2 in Part 21 — see CCR-7 for MVP use).
8. BR-8 CSV columns: `date, particulars, document_number, you_gave, you_got, balance, balance_label, note, entry_type, status` in en-IN date format `dd/mm/yyyy`, amounts plain 2 dp.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View statement | `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ |
| Print / share link / WhatsApp | `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ |
| Export CSV | `ledger.statement.export` | ✅ | ✅ | ❌ | ✅ |
| Public page | none (token) | — | — | — | — |

#### 13. Edge Cases
1. EC-1 Range starts mid-day of a reversal pair → both in or both out; ordering by date then created_at keeps the pair adjacent.
2. EC-2 10,000 rows → print fetches pages sequentially with cursor; UI shows progress; user may cancel.
3. EC-3 Party without mobile → WhatsApp option opens `wa.me` without a number (contact picker in WhatsApp) — text still prefilled.
4. EC-4 Tenant has no logo → header shows trade name only; no broken image.
5. EC-5 Hindi note with emoji → rendered; print fonts fall back to system emoji.
6. EC-6 Statement opened while a new entry is posted elsewhere → "Load more" continues from cursor; a **Refresh** hint appears when `party.balance` in store ≠ closing.
7. EC-7 Share link created, party later archived → link still resolves (read-only history is fine); tenant `status ≠ active` → 404.
8. EC-8 Closing balance ≤ 0 → no QR in footer; caption "Nothing due. धन्यवाद!".
9. EC-9 Browser blocks `window.print()` in an iframe/PWA context → fallback button "Open print view" in a new tab.

#### 14. API Requirements
- `GET /parties/{id}/statement?date_from&date_to&include_corrections=false&cursor&limit=50&format=json|csv` → `{ data: { party: { id, name, mobile_masked }, period: { from, to }, opening_balance, rows: [ { id, entry_date, entry_type, direction, amount, note, status, running_balance, source: { type, id, number, url } | null, reverses_id, supersedes_id, reason } ], closing_balance, totals: { debit, credit }, has_entries_before_opening: bool }, meta: { next_cursor, has_more } }`. `format=csv` → `text/csv` attachment (≤ 5k rows sync; larger → 202 export per §22.11).
- `POST /parties/{id}/share-links` `{ kind: "statement", expires_in_days, date_from?, date_to?, include_corrections? }` → 201 `{ url, expires_at }`.
- `GET /public/d/{token}` → `{ kind: "statement", tenant: { name, logo_url, address, phone, gstin, upi_vpa, app_name, doc_footer }, statement: <same as above, all rows> }`; 404 when expired/revoked.
- `GET /parties/{id}/statement.pdf` — **Phase 2** (server PDF, ADR-014); not mounted at MVP (CCR-8).
- Frontend: `ledgerService.getStatement(partyId, params)`, `createShareLink(partyId, body)`, `getPublicDocument(token)`; thunks `fetchPartyStatement`, `fetchStatementAllRows`, `createStatementShareLink` in `statementThunk.ts`; slice `statementSlice` `{ byParty: { params, opening, rows, closing, totals, cursor, hasMore, status } , shareLink }`; display helper `statementDisplay.ts` (`balanceLabel(amount)`, `formatRow`).

#### 15. Database Impact
Reads `ledger_entry` (range scan + window), `parties_party`, `platform_tenant` (branding, `upi_vpa`), `sales_document`/`purchases_document`/`payments_payment`/`expenses_expense` numbers via `source_id` batch lookup (one query per source type). Writes `parties_share_link` (token_hash, expires_at, `kind`/`params` — see CCR-7), `platform_audit_log` (share link created). No new index.

#### 16. Audit Requirements
`ledger.statement.exported` (`metadata.params`, `row_count`), `ledger.statement.share_link_created` (`entity_type='parties_share_link'`, `metadata.expires_at`, `kind`). Views are not audited (volume); public views increment `view_count`.

#### 17. Notifications
WhatsApp deep link (NTF-03) template `STATEMENT_SHARE`: en "Namaste {party_name} ji, your statement from {shop} ({from}–{to}): Balance Rs {balance} ({label}). View: {link}" / hi "नमस्ते {party_name} जी, {shop} से आपका हिसाब ({from}–{to}): बाकी Rs {balance} ({label})। देखें: {link}". SMS (when configured) template `STATEMENT_SHARE_SMS` with the same placeholders; logged in `notifications_message_log` with `related_type='parties_share_link'`.

#### 18. Analytics / Event Tracking
`ub.ledger.statement_viewed` `{ range_preset, include_corrections, row_count_bucket }`; `ub.ledger.statement_printed` `{ row_count_bucket }`; `ub.ledger.statement_shared` `{ channel: whatsapp|link|sms|pdf }`; `ub.ledger.statement_exported` `{ format }`; `ub.public.statement_viewed` `{ has_qr }` (public, no tenant user).

#### 19. Security
Public token: 32 random bytes, base64url in URL, only `sha256` stored (`token_hash`); constant-time compare; expiry checked server-side; `noindex, nofollow`; no tenant totals or other parties in the payload; mobile masked. Statement endpoint tenant-scoped; `party_id` outside tenant → 404. CSV cells starting with `=`, `+`, `-`, `@` are prefixed with `'` to prevent formula injection.

#### 20. Performance
Window function over indexed range; `LIMIT 51` for cursor; opening computed with one aggregate query on the same index. Source numbers resolved in ≤ 4 batched queries. Public page cached 60 s per token in process memory (LRU, invalidated on new entry for that party via `party.last_activity_at` comparison).

#### 21. Testing
T-LED-04-1 (unit, selector) running balance sequence matches hand-computed values for mixed debit/credit including same-day rows. T-LED-04-2 (unit) opening for range equals Σ before `date_from`. T-LED-04-3 (unit) `include_corrections=false` excludes reversed+reversal, closing identical to `true`. T-LED-04-4 (API) unbounded closing == `party.balance` for fuzzed entry sets. T-LED-04-5 (API) share link resolves; expired → 404; other tenant's token → 404. T-LED-04-6 (API) CSV export escapes formula-leading cells. T-LED-04-7 (component) `StatementPrintView` renders header, opening row, struck-through rows, closing block, QR present when closing > 0 and VPA set, absent otherwise. T-LED-04-8 (component) mobile card layout at 360 px. T-LED-04-9 (E2E) share → WhatsApp URL contains encoded text with balance and link. T-LED-04-10 (perf) 100k-row tenant, 50-row page ≤ 400 ms. T-LED-04-11 (permission) staff cannot export CSV (403), can share.

#### 22. Acceptance Criteria
- AC-1 (US-LED-04-1) Given entries: opening ₹2,300 (01/04), gave ₹500 (18/09), got ₹300 (18/09), when I open the statement for "This FY", then rows show running balances ₹2,300 → ₹2,800 → ₹2,500 and closing ₹2,500 "You will get".
- AC-2 (US-LED-04-2) Given the same, when I filter 01/09–30/09, then opening shows ₹2,300 and only the two September rows appear.
- AC-3 (US-LED-04-3) Given a party with mobile, when I choose Share → WhatsApp, then `wa.me/91…?text=` opens with the closing balance, period and a link that renders the identical statement publicly.
- AC-4 (US-LED-04-4) Given a corrected entry, when I toggle "Show corrections", then the original appears struck through and a reversal row appears, and the closing balance does not change.
- AC-5 (US-LED-04-5) Given `tenant.upi_vpa` set and closing ₹2,500, when the customer opens the public link, then a UPI QR encoding `am=2500.00` is displayed with "Pay ₹2,500 via UPI".

#### 23. Dependencies
LED-01/02/03, PAY-03 (QR + intent), NTF-03 (wa.me), WLB-01 (branding), PLT-07 (UPI VPA, GSTIN), `UbDataGrid`, `UbDateRangePicker`, `UbShareSheet`, `UbQrCode`, CCR-6/7/8.

#### 24. Future Enhancements
Server-side PDF (WeasyPrint) for automated sending (Phase 2, ADR-014); PTY-09 persistent "view your khata" link; scheduled monthly statements (RPT-14); customer acknowledgement of balance from the public page (Phase 3).

### LED-05 — Collection date & reminder buckets

#### 1. Business Objective
Turn a vague "pay me next week" into a per-party collection date that drives the dashboard buckets **Due today / Overdue / Upcoming**, the party-list filter, the automated D-1/D0 reminders (LED-07) and the manual reminder flow (LED-06). Measured by: ≥ 50 % of parties with receivable > ₹1,000 carry a collection date within 30 days of onboarding; overdue amount trend visible on the dashboard.

#### 2. User Personas
Owner (OW) sets and reviews dates; Staff (ST) sets dates when the customer promises at the counter; Accountant (AC) reads buckets in reports.

#### 3. User Stories
1. US-LED-05-1 — As an owner I want to set "collect on 25 Sep" on a party so that I am reminded and the app reminds them.
2. US-LED-05-2 — As an owner I want a Due today / Overdue / Upcoming view so that my morning collection round is a list, not memory.
3. US-LED-05-3 — As staff I want the collection date to clear automatically when the party settles so that the list stays clean.

#### 4. Functional Requirements
1. FR-1 The party header shows a **Collection date** chip: empty state "Set collection date"; set state "Collect on 25 Sep · in 7 days" (or "Overdue by 3 days" in warning tone). Tapping opens `CollectionDatePopover` with presets **Tomorrow · Next week · Next month · Pick a date · Clear**.
2. FR-2 Saving calls `PATCH /parties/{id} { collection_date, version }`; the `UbPartyHeader` updates optimistically.
3. FR-3 `GET /ledger/summary` returns `due_today`, `overdue`, `upcoming_7d` each `{ count, amount }` computed over parties with `balance > 0`; the dashboard (RPT-01) and the ledger home render them as three `UbStatCard`s (tones: due today → warning, overdue → danger, upcoming → default) linking to `GET /parties?collection=today|overdue|upcoming`.
4. FR-4 The party list supports the `collection=` filter and shows the collection date column/badge in list rows ("Due today", "Overdue 3 d", "25 Sep").
5. FR-5 When a party's balance becomes ≤ 0 after any posting (payment, manual got, credit note, write-off, correction), the server clears `collection_date` and marks scheduled auto reminders `cancelled` (LED-07 BR-4).
6. FR-6 Collection date may be set only when `balance > 0` (receivable); for payables the chip is hidden (suppliers are chased by the supplier).
7. FR-7 Setting a collection date creates no reminder rows itself; LED-07's scheduler derives reminders from `collection_date` daily.
8. FR-8 The reminder history strip on the party page ("Reminded 3 times · last 2 days ago") reads `GET /reminders?party_id=&status=sent`.

#### 5. Non-Functional Requirements
Popover opens instantly; `PATCH` P95 ≤ 150 ms. Summary endpoint ≤ 200 ms using `IX(tenant_id, collection_date)` and `IX(tenant_id, balance)`. Hindi: "वसूली की तारीख", "आज देना है", "बाकी निकल गई (Overdue)", "आने वाले". Date shown `dd MMM` relative captions localized.

#### 6. User Flow
Primary: party page (balance ₹2,800) → chip "Set collection date" → **Next week** → chip "Collect on 25 Sep · in 7 days" → snackbar "Collection date set. We'll remind you on 24 and 25 Sep." (second sentence only when `ledger.auto_sms=on`, else "…remind you on 25 Sep" for in-app).
Alternate A: dashboard → **Overdue ₹12,400 (5)** → party list filtered `collection=overdue` sorted by `collection_date ASC` → row → **Remind** (LED-06).
Alternate B: party pays in full → header shows "Settled", chip disappears; list no longer includes party.
Alternate C: change date → **Pick a date** → calendar (min tomorrow? — no: min today) → Save.

#### 7. UI Requirements
`CollectionDateChip` (`MLBadge` interactive + `MLPopover`) in `UbPartyHeader` actions row; `CollectionDatePopover` with `MLButton variant="ghost"` presets in a 2-column grid, `MLCalendar` inline under "Pick a date", destructive-outlined **Clear**. Dashboard: `UbStatCard` ×3 with `delta.baseline` "vs yesterday". Party list row: `UbStatusBadge` tone warning "Due today", danger "Overdue 3 d", neutral "25 Sep". Mobile: popover becomes bottom sheet.

#### 8. UX Requirements
Keys: `ledger.collection.set` "Set collection date", `ledger.collection.on` "Collect on {date}", `ledger.collection.inDays` "in {n} days", `ledger.collection.overdueBy` "Overdue by {n} days", `ledger.collection.dueToday` "Due today", `ledger.collection.cleared` "Collection date cleared — party settled", presets `tomorrow`, `nextWeek`, `nextMonth`, `pick`, `clear`. Tones fixed: overdue → `--error`, due today → `--warning`, upcoming → neutral. No confirmation for setting/clearing (low risk, reversible).

#### 9. States
Initial (chip empty) · Set (chip with relative caption) · Loading (chip shimmer 140 ms) · Success (updated chip + snackbar) · Error (409 `stale_version` → refetch party and reapply; network → revert chip + Retry) · Disabled (balance ≤ 0 → chip hidden; no `parties.party.write` → chip read-only) · Empty buckets (`UbStatCard` value ₹0 with caption "Nothing due") · Summary error (`UbStatCard` skeleton persists + inline retry link).

#### 10. Validation Rules
`collectionDateSchema`: `collectionDate` null or date ≥ today (tenant TZ) and ≤ today + 365 ("Choose a date within the next year"). Server: 400 `validation_error` on past date; 409 `collection_requires_receivable` when balance ≤ 0 (CCR-2).

#### 11. Business Rules
1. BR-1 Buckets (as of tenant "today" `T`): `due_today = {P : balance>0 ∧ collection_date = T}`; `overdue = {P : balance>0 ∧ collection_date < T}`; `upcoming_7d = {P : balance>0 ∧ T < collection_date ≤ T+7}`; amounts = Σ balance.
2. BR-2 Auto-clear: after any ledger posting for party `P`, if `P.balance ≤ 0 ∧ P.collection_date IS NOT NULL` → set `collection_date=NULL`, cancel `ledger_reminder` rows with `status='scheduled'` for `P`, audit `party.collection_date_cleared`.
3. BR-3 A collection date is a promise, not a document due date; invoice `due_on` (SAL-02) is separate and drives `overdue` invoice status, not these buckets.
4. BR-4 Changing the date re-targets LED-07 reminders: scheduled rows for the old date are `cancelled`; new ones are created by the next scheduler run (unique constraint per date/kind prevents duplicates).
5. BR-5 Only parties with `is_customer=true` or balance > 0 show the chip; suppliers with positive balance (they owe you, e.g. after a debit note) are allowed.

#### 12. Permissions
Set/clear: `parties.party.write` (owner, admin, staff). Read buckets: `ledger.entry.read` (all roles). Summary amounts visible to staff (they collect); accountant read-only.

#### 13. Edge Cases
1. EC-1 Collection date today, party pays half → still due today with the reduced balance; reminder text uses live balance (LED-07 BR-3).
2. EC-2 Tenant timezone vs UTC: "today" computed in `Asia/Kolkata`; scheduler runs at 09:00 IST.
3. EC-3 Party balance goes from positive to negative via a void (Part 22 §22.14 step 4) → chip cleared; when a new invoice makes it positive again, the date must be set anew.
4. EC-4 Bulk: 200 overdue parties → list paginated 25/page with totals in header; bulk select feeds LED-06 bulk reminders.
5. EC-5 Date set for a party then party archived (balance 0 required) → already cleared by BR-2.
6. EC-6 Concurrent edit of party by two users → `stale_version` → client refetches and retries once with the new version, preserving only the collection date change.

#### 14. API Requirements
- `PATCH /parties/{id}` `{ collection_date: "2026-09-25" | null, version }` → 200 party. 409 `stale_version`, `collection_requires_receivable`.
- `GET /ledger/summary` → `{ data: { receivable, payable, due_today: { count, amount }, overdue: { count, amount }, upcoming_7d: { count, amount }, as_of } }`.
- `GET /parties?collection=today|overdue|upcoming&ordering=collection_date` (existing).
- `GET /reminders?party_id=&status=sent&page_size=5` for the history strip.
- Frontend: `partyService.updateParty`, `ledgerService.getSummary`; thunks `updateCollectionDate` (in `partyThunk.ts`), `fetchLedgerSummary` (`ledgerSummaryThunk.ts`); slice `ledgerSummarySlice { summary, status, fetchedAt }` refreshed on ledger postings (thunk `postLedgerEntry.fulfilled` dispatches `ledgerSummarySlice.actions.invalidate()`).

#### 15. Database Impact
`parties_party.collection_date` (update), `ledger_reminder.status` (cancel on clear), `platform_audit_log`. Reads use `IX(tenant_id, collection_date)`, `IX(tenant_id, balance)`.

#### 16. Audit Requirements
`party.updated` with `before/after.collection_date`; `party.collection_date_cleared` by system (`actor_type='system'`) with `metadata.trigger='balance_settled'`.

#### 17. Notifications
In-app (NTF-01) type `reminder_due`: created by the 09:00 scheduler for each party in `due_today` — title "₹2,800 due today from Ramesh Traders", `data: { route: "/parties/{id}" }`; one notification per party per day (dedupe key `reminder_due:{party_id}:{date}` in `data`). SMS/WhatsApp are LED-06/07.

#### 18. Analytics / Event Tracking
`ub.ledger.collection_date_set` `{ preset: tomorrow|next_week|next_month|custom, days_ahead, balance_bucket }`; `ub.ledger.collection_date_cleared` `{ by: user|system }`; `ub.ledger.bucket_opened` `{ bucket }`.

#### 19. Security
Standard tenant scoping; no PII in events. Summary endpoint is per tenant; no cross-tenant aggregation.

#### 20. Performance
Summary = three indexed aggregate queries (or one with `FILTER` clauses); cached 60 s per tenant in process memory, invalidated on ledger posting. List filter uses the collection_date index with `balance > 0` predicate.

#### 21. Testing
T-LED-05-1 (unit) bucket classification for dates T−1, T, T+1, T+7, T+8 with balance > 0 and ≤ 0. T-LED-05-2 (unit) auto-clear on payment that zeroes balance; scheduled reminders cancelled. T-LED-05-3 (API) PATCH past date → 400; payable party → 409. T-LED-05-4 (API) summary amounts equal Σ balances by bucket. T-LED-05-5 (component) chip presets compute correct dates in `Asia/Kolkata` when device is UTC. T-LED-05-6 (E2E) set next week → dashboard Upcoming count +1 → pay in full → count −1 and chip gone. T-LED-05-7 (permission) accountant sees chip read-only.

#### 22. Acceptance Criteria
- AC-1 (US-LED-05-1) Given a party with balance ₹2,800, when I choose Next week, then `collection_date = today+7` and the chip reads "Collect on {date} · in 7 days".
- AC-2 (US-LED-05-2) Given three parties due today totalling ₹5,000 and two overdue totalling ₹12,400, when I open the dashboard, then Due today shows ₹5,000 (3) and Overdue ₹12,400 (2), and tapping Overdue lists exactly those two parties.
- AC-3 (US-LED-05-3) Given a party due tomorrow, when a payment settles the balance to ₹0, then `collection_date` is null, the scheduled reminders are `cancelled`, and the party is absent from every bucket.

#### 23. Dependencies
PTY-01/02/03, LED-06, LED-07, RPT-01, NTF-01, scheduler (ADR-012).

#### 24. Future Enhancements
LED-13 recurring "hisaab day" per party/route; LED-15 collection routes; push notification for due today (NTF-04).

### LED-06 — Manual reminder (WhatsApp / SMS / call)

#### 1. Business Objective
Make asking for money a neutral, one-tap machine action: open WhatsApp with a templated, polite message carrying the balance, the shop name and a way to pay; or send an SMS when a provider is configured; or dial. Log every nudge so the owner knows "reminded 3 times". Support bulk selection from the party list for the morning collection round. Measured by: ≥ 60 % of reminders sent within 2 taps of the party page; reminder → payment within 7 days rate tracked per tenant.

#### 2. User Personas
Owner (OW), Staff with `ledger.reminder.write` (ST). Customer (CU) receives the message.

#### 3. User Stories
1. US-LED-06-1 — As an owner I want to tap Remind → WhatsApp and have the message prefilled with the balance and my UPI link so that I only press Send.
2. US-LED-06-2 — As an owner I want to select several overdue parties and remind them all so that the collection round takes minutes.
3. US-LED-06-3 — As an owner I want to see when I last reminded a party so that I do not nag.
4. US-LED-06-4 — As staff I want to call the customer from the app and log that I called so that the owner sees the follow-up.

#### 4. Functional Requirements
1. FR-1 **Remind** is a primary quick action on the party page (beside You gave / You got / Bill / Share) and a row action in the party list; it opens `ReminderSheet` (`UbDrawer` bottom sheet) with channels: **WhatsApp** (`whatsapp_manual`), **SMS** (`sms`, shown only when `GET /auth/me.feature_flags.sms_configured=true`), **Call** (`call`), and a preview of the message text with an editable note line.
2. FR-2 WhatsApp: the client calls `POST /reminders { party_id, due_on: today, channel: "whatsapp_manual", note }` then `POST /reminders/{id}/send` → `{ wa_url, text }`, then `window.open(wa_url, '_blank', 'noopener')`. The server renders `text` from template `REMINDER_MANUAL` (tenant → partner → global resolution), builds `wa_url = https://wa.me/<E.164 digits without +>?text=<encodeURIComponent(text)>` and logs a `notifications_message_log` row (`channel='whatsapp'`, `provider='wa_me'`, `status='sent'`), setting `reminder.status='sent'`, `sent_at`, `snapshot_balance`, `message_log_id`.
3. FR-3 SMS: same create, then `/send` → 202 `{ message_log_id }`; the server enqueues `notifications.send_message` (NTF-02) and the reminder stays `scheduled` until the job result flips it to `sent`/`failed`. 409 `channel_not_configured` when the SMS backend is console/none in production mode (console backend is allowed in dev and logs `skipped`).
4. FR-4 Call: `/send` for `channel=call` returns `{ tel_url: "tel:+91…" }`, logs the reminder `sent` (no message_log), and the client opens the dialler.
5. FR-5 The sheet shows a live preview of the rendered text (client-side render of the same template with the same placeholders — the server is authoritative) and allows adding a one-line personal note appended as `{note}`.
6. FR-6 The party page shows a **Reminder history** strip: "Reminded 3 times · last 2 days ago (WhatsApp)" expanding to a list from `GET /reminders?party_id=`; each item shows channel icon, date, snapshot balance, status.
7. FR-7 Bulk: the party list toolbar (`UbDataGrid` row selection) offers **Remind selected** → `BulkReminderDialog` with channel choice and total selected due → `POST /reminders/bulk { party_ids[], channel, note? }`. For `whatsapp_manual` the response lists `{ party_id, wa_url, text }`; the client presents a **step list** ("1 of 12 · Ramesh Traders · Open WhatsApp") because browsers block multiple popups — each tap opens one chat and marks the row done. For `sms` → 202 and rows appear in history as they send.
8. FR-8 Reminders are blocked when the party balance ≤ 0 (nothing to collect) → 409 `nothing_due` (CCR-2); the UI hides Remind when balance ≤ 0.
9. FR-9 Mark outcome: from the history list an item can be marked **Done** (party paid) or **Dismissed** via `PATCH /reminders/{id} { status }`.
10. FR-10 Rate protection: the server returns `warnings: [{ code: "reminded_recently", last_sent_at }]` when a reminder was sent to the same party in the last 24 h; the sheet shows "You reminded Ramesh yesterday" and requires an explicit second tap.
11. FR-11 Message text includes a pay call-to-action: if `tenant.upi_vpa` is set, a UPI intent line (`upi://pay?…` for direct phone use) **and** the statement share link (LED-04) are appended when `documents.show_upi_qr` is on; on a phone, WhatsApp renders `upi://` links as tappable.

#### 5. Non-Functional Requirements
Sheet open ≤ 100 ms; create+send round trip P95 ≤ 300 ms before WhatsApp opens. Text length ≤ 1,000 chars (WhatsApp prefill limit is generous; SMS variant ≤ 2 segments = 306 GSM-7 chars, or 134 UCS-2 chars for Hindi — the Hindi SMS template is kept ≤ 130 chars). Hindi template selection follows the *party's* preferred locale if present in `parties_party` (not at MVP — falls back to tenant locale; see LED-08 §24). Accessibility: channel buttons ≥ 44 px, labelled.

#### 6. User Flow
Primary: party page → **Remind** → sheet shows preview "Namaste Ramesh ji, Sharma Store ka ₹2,800 baaki hai. Kripya jaldi bhugtan karein. Pay: upi://pay?… · Hisaab: https://…/d/abc — Sharma Store" → **WhatsApp** → WhatsApp opens in a new tab/app with the text → user presses Send → back in app the history strip reads "Reminded just now".
Alternate A (SMS): **SMS** → "Sending…" → history row "SMS · queued" → flips to "sent" within a minute.
Alternate B (bulk): Parties → filter Overdue → select all (25) → **Remind selected** → WhatsApp → step list; each tap opens one chat; progress "7 of 25 done"; **Finish** closes and refreshes history.
Alternate C (recently reminded): sheet shows amber note; **WhatsApp** requires a second tap "Send anyway".
Alternate D (no mobile): WhatsApp/SMS disabled with hint "Add a mobile number to remind"; Call disabled; **Edit party** link.
Alternate E (SMS not configured): SMS button hidden; tooltip in settings explains provider setup (PLT-06/NTF-02).

#### 7. UI Requirements
`ReminderSheet` (`UbDrawer`): header "Remind · Ramesh Traders · ₹2,800 due"; `MessagePreview` (`MLCard` sunken surface, `ds-body-sm`, monospace for links); `MLInput name="note"` "Add a line (optional)"; channel row of three `MLButton variant="secondary" size="lg"` with lucide icons `MessageCircle` (WhatsApp), `MessageSquare` (SMS), `Phone` (Call); footer none. `ReminderHistoryStrip` (`MLItem` list) under the party header. `BulkReminderDialog` (`UbDialog`): channel toggle, summary "25 parties · ₹1,24,300 due", `StepList` with per-row `MLButton` "Open WhatsApp" and check state. Desktop: sheet as right drawer; WhatsApp opens `web.whatsapp.com` via the same `wa.me` URL.

#### 8. UX Requirements
Keys: `ledger.remind.title` "Remind", `ledger.remind.preview` "Message preview", `ledger.remind.whatsapp` "WhatsApp", `ledger.remind.sms` "SMS", `ledger.remind.call` "Call", `ledger.remind.recently` "You reminded {name} {when}. Send anyway?", `ledger.remind.history` "Reminded {count} times · last {when} ({channel})", `ledger.remind.none` "Not reminded yet", `ledger.remind.bulk.title` "Remind {count} parties", `ledger.remind.bulk.progress` "{done} of {total} done". Tone: polite Hinglish default in `en` locale (research: Hinglish drives adoption), pure Hindi in `hi`. Never shame language; no exclamation marks. Confirmation only for the "recently reminded" case.

#### 9. States
Initial (preview + channels) · Loading (channel button spinner "Opening WhatsApp…") · Success (history updated; sheet closes) · Error 409 `nothing_due` (sheet replaced by "Nothing due from Ramesh") · Error 409 `channel_not_configured` (SMS button shows "Not set up") · Error network (snackbar Retry) · Disabled (no mobile; no permission → Remind hidden) · Processing (SMS queued; history row badge "Queued") · Completed (`sent`) · Failed (`failed` badge with error caption, action **Retry via WhatsApp**) · Bulk partial (some rows done, some skipped).

#### 10. Validation Rules
`reminderSchema`: `partyId` uuid; `channel ∈ {whatsapp_manual, sms, call}`; `note ≤ 120` chars, no line breaks (single line) → "Keep it to one line (120 characters)"; `dueOn` defaults today. Bulk: `party_ids` 1–100 → "Select up to 100 parties at a time". Server: parties must have a mobile for `whatsapp_manual`/`sms`/`call` → 400 `validation_error` `details.party_id: ["Party has no mobile"]`; balance ≤ 0 → 409 `nothing_due`.

#### 11. Business Rules
1. BR-1 Manual reminders create `ledger_reminder` rows with `kind='manual'`, `due_on=today`, `channel` as chosen, `snapshot_balance=party.balance` at send time.
2. BR-2 `wa_url` construction: `digits = E.164 without '+'` (e.g. `919812345678`); `text` UTF-8 percent-encoded with `urllib.parse.quote(text, safe='')`; final `https://wa.me/{digits}?text={encoded}`. If the party has no mobile → 400.
3. BR-3 Template `REMINDER_MANUAL` placeholders: `{party_name}`, `{shop}`, `{balance}` (en-IN grouped, no decimals when `.00`), `{label}` ("You will give"/"आप देंगे" from the customer's viewpoint = "please pay"), `{upi_link}` (optional), `{statement_link}` (optional), `{note}` (optional), `{due_date}` (collection date if set). Missing optional placeholders collapse with their line.
4. BR-4 "Reminded recently" = a reminder with `status='sent'` for the same party and `sent_at ≥ now − 24 h`.
5. BR-5 Bulk requests skip parties with balance ≤ 0 or no mobile and report them in `skipped[] { party_id, reason }`.
6. BR-6 Message logs: WhatsApp manual → `notifications_message_log` row (`channel='whatsapp'`, `provider='wa_me'`, `template_code='REMINDER_MANUAL'`, `to_address=digits`, `payload={rendered text, params}`, `status='sent'`, `cost=0`). Call → no message_log (no message), reminder `sent`.
7. BR-7 Statement link in reminders reuses an unexpired statement share link for the party if one exists (created within 7 days), else creates one with 7-day expiry.
8. BR-8 The UPI line uses PAY-03 `build_upi_intent(amount=balance, note="Payment to {shop}", ref="RM-{reminder_short}")`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Send/create reminder (single/bulk) | `ledger.reminder.write` | ✅ | ✅ | ✅ | ❌ |
| View history | `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ |
| Mark done/dismiss | `ledger.reminder.write` | ✅ | ✅ | ✅ | ❌ |

#### 13. Edge Cases
1. EC-1 Popup blocked → `window.open` returns null → fallback `MLButton` "Open WhatsApp" as an anchor with `href=wa_url target=_blank` inside the sheet.
2. EC-2 WhatsApp not installed on phone → `wa.me` shows WhatsApp's landing page; the reminder is still logged `sent` (we cannot know) — the history caption says "Opened WhatsApp" rather than "Delivered".
3. EC-3 Party mobile shared by two parties → each reminder is per party; bulk shows both; the owner decides.
4. EC-4 Balance changes between preview and send → server renders with the balance at send time (`snapshot_balance`), preview may differ by the last seconds.
5. EC-5 Hindi text + emoji in note → percent-encoded correctly (UTF-8); length check counts code points.
6. EC-6 Bulk 100 parties on SMS → 100 jobs enqueued; the runner processes at ≤ 10 msgs/s; statuses stream into history.
7. EC-7 Tenant without `upi_vpa` → UPI line omitted; statement link still included.
8. EC-8 Party opted out of SMS (`sms_opt_in=false`) → SMS channel disabled with hint "Customer opted out"; WhatsApp manual remains allowed (user-initiated personal message, not automated).

#### 14. API Requirements
- `POST /reminders` `{ party_id, due_on, channel, note? }` → 201 reminder `{ id, party_id, due_on, channel, kind, status, snapshot_balance, note, scheduled_for, sent_at, message_log_id, created_at }`; 409 `nothing_due`.
- `POST /reminders/{id}/send` → `whatsapp_manual`: 200 `{ data: { wa_url, text }, meta: { warnings[] } }`; `sms`: 202 `{ data: { message_log_id } }`; `call`: 200 `{ data: { tel_url } }`; 409 `channel_not_configured`, `reminder_not_sendable` (status not `scheduled`; CCR-2).
- `POST /reminders/bulk` `{ party_ids[], channel, note? }` → 200 `{ data: { items: [ { party_id, reminder_id, wa_url, text } ], skipped: [ { party_id, reason } ] } }` or 202 for `sms` `{ data: { queued: n, skipped[] } }`.
- `GET /reminders?party_id=&status=&due=&page` → list with `meta.totals`.
- `PATCH /reminders/{id}` `{ status: "done" | "dismissed" }`.
- Frontend: `reminderService.ts` (`createReminder`, `sendReminder`, `bulkReminders`, `listReminders`, `updateReminder`); thunks `sendManualReminder` (create + send chained), `sendBulkReminders`, `fetchReminders`, `markReminder` in `reminderThunk.ts`; slice `reminderSlice { byParty: { ids, total, lastSentAt }, entities, bulk: { items, doneIds, status } }`; hook `useOpenExternal(url)` handles popup fallback.

#### 15. Database Impact
Insert `ledger_reminder`; insert `notifications_message_log` (WhatsApp/SMS); update reminder `status`, `sent_at`, `message_log_id`; `parties_share_link` reuse/insert; `platform_job` for SMS; `platform_audit_log`. Reads `IX(party_id, created_at DESC)` for history, `IX(tenant_id, status, due_on)`.

#### 16. Audit Requirements
`reminder.sent` (`metadata.channel`, `snapshot_balance`, `bulk: bool`), `reminder.done`, `reminder.dismissed` (minimal per Part 21 §21.7).

#### 17. Notifications
Template `REMINDER_MANUAL` (channel `whatsapp`; the SMS variant `REMINDER_MANUAL_SMS` omits the statement line to fit length):
- en (Hinglish): "Namaste {party_name} ji, {shop} ka Rs {balance} baaki hai{due_line}. Kripya bhugtan karein.\n{upi_line}{statement_line}{note_line}— {shop}" where `due_line` = " (collection date {due_date})", `upi_line` = "Pay via UPI: {upi_link}\n", `statement_line` = "Hisaab dekhein: {statement_link}\n", `note_line` = "{note}\n".
- hi: "नमस्ते {party_name} जी, {shop} का Rs {balance} बाकी है{due_line}। कृपया भुगतान करें।\n{upi_line}{statement_line}{note_line}— {shop}" with `due_line` = " (वसूली तारीख {due_date})", `upi_line` = "UPI से भुगतान: {upi_link}\n", `statement_line` = "हिसाब देखें: {statement_link}\n".
- SMS (`REMINDER_MANUAL_SMS`, DLT Service-Implicit, `dlt_template_id` from `notifications_template`): en "{shop}: Rs {balance} is due{due_line}. Pay: {upi_link} -{shop}"; hi "{shop}: Rs {balance} बाकी है{due_line}। भुगतान: {upi_link} -{shop}".
No in-app notification is generated for manual reminders.

#### 18. Analytics / Event Tracking
`ub.ledger.reminder_sheet_opened` `{ source: party_page|list_row|dashboard_bucket, balance_bucket }`; `ub.ledger.reminder_sent` `{ channel, bulk: bool, has_note, has_upi, reminded_recently_override: bool, overdue_days_bucket }`; `ub.ledger.reminder_bulk_completed` `{ total, done, skipped }`; `ub.ledger.reminder_marked` `{ status }`.

#### 19. Security
`wa_url` is built server-side from the stored E.164 mobile — the client never composes numbers; `text` is percent-encoded to prevent URL injection; `window.open` uses `noopener`. Share links follow LED-04 §19. SMS sends go through the adapter with per-tenant throttle (NTF-02 BR-7: 200 SMS/hour default). Templates are stored data, rendered with a whitelist placeholder engine (`str.format_map` with a `SafeDict`), never `eval`/Jinja autoescape-off.

#### 20. Performance
Two sequential requests for single reminders (create, send) — acceptable; bulk is one request. Reminder history strip uses `page_size=5` and a `count` from `meta.totals`.

#### 21. Testing
T-LED-06-1 (unit) `build_wa_url` encodes Hindi/emoji/`&` correctly; digits strip `+`. T-LED-06-2 (unit) template render collapses optional lines; en-IN grouping "1,24,300". T-LED-06-3 (API) balance ≤ 0 → 409 `nothing_due`; no mobile → 400. T-LED-06-4 (API) send whatsapp → reminder `sent`, message_log row `provider=wa_me`. T-LED-06-5 (API) SMS with console backend in DEBUG → 202 and log `skipped`; in production without provider → 409. T-LED-06-6 (API) reminded within 24 h → `warnings[]`. T-LED-06-7 (API) bulk skips zero-balance and no-mobile parties. T-LED-06-8 (component) popup blocked fallback anchor renders. T-LED-06-9 (component) bulk step list marks rows done. T-LED-06-10 (E2E) Remind → WhatsApp URL opened (stubbed) → history strip updates. T-LED-06-11 (permission) accountant has no Remind action; `PATCH` by accountant → 403.

#### 22. Acceptance Criteria
- AC-1 (US-LED-06-1) Given Ramesh owes ₹2,800 and the tenant has a VPA, when I tap Remind → WhatsApp, then a `wa.me/919812345678?text=…` URL opens whose decoded text contains "Rs 2,800", the shop name, a `upi://pay?pa=` link with `am=2800.00`, and a statement link; a reminder row with `status=sent` and `snapshot_balance=2800.00` exists.
- AC-2 (US-LED-06-2) Given 12 overdue parties selected, when I choose Remind selected → WhatsApp, then I get a 12-step list; each step opens one chat and marks done; parties with zero balance are listed under "Skipped".
- AC-3 (US-LED-06-3) Given two reminders sent yesterday and today, when I open the party page, then the strip reads "Reminded 2 times · last just now (WhatsApp)".
- AC-4 (US-LED-06-4) Given staff with the default role, when they tap Call, then the dialler opens with the party's number and a reminder with `channel=call`, `status=sent` is logged.

#### 23. Dependencies
LED-04 (share link), LED-05 (due date in text), PAY-03 (UPI intent), NTF-02 (SMS adapter + templates), NTF-03 (deep-link helper), PTY-02 (row selection), PLT-07 (VPA), `UbDrawer`, `UbDialog`, `UbDataGrid`.

#### 24. Future Enhancements
LED-12 automated WhatsApp via Cloud API; NTF-05 delivery status; per-party preferred language; reminder templates editable in settings (`ledger.reminder_templates`, PLT-06) with preview; LED-13 recurring schedules.

### LED-07 — Automated reminders (SMS, D-1 / D0)

#### 1. Business Objective
When a collection date is set, the system — not the owner — sends a polite SMS one day before and on the day, without any Celery/Redis infrastructure, using the DLT-registered template through the configured SMS provider. Config-gated at MVP: with the console backend the pipeline runs end-to-end and logs `skipped`. Measured by: reminders created for 100 % of eligible parties on schedule; duplicate rate 0 (unique constraint); send failure rate < 2 % once a provider is configured.

#### 2. User Personas
Owner (OW) turns the feature on and sees outcomes; Customer (CU) receives SMS; Super admin / Partner admin (SA/PA) configures provider credentials and DLT ids (NTF-02).

#### 3. User Stories
1. US-LED-07-1 — As an owner I want the app to SMS my customers the day before and on the collection date so that I do not have to remember.
2. US-LED-07-2 — As an owner I want to switch automated SMS off for one customer who asked not to be messaged so that I respect them (and the law).
3. US-LED-07-3 — As an owner I want to see which automated reminders were sent, skipped or failed so that I can follow up manually.

#### 4. Functional Requirements
1. FR-1 Tenant setting `ledger.auto_sms ∈ {off, on}` (PLT-06) with default `off`; the settings screen shows the toggle, the schedule "Every day at 09:00 (IST)", and the provider status from `GET /auth/me.feature_flags.sms_configured` ("SMS provider not configured — reminders will be recorded as skipped" when false).
2. FR-2 Scheduled task `ledger.schedule_auto_reminders` registered in `run_scheduler` with schedule `daily 09:00 Asia/Kolkata` (the runner converts to UTC per tenant timezone; MVP tenants are IST). It iterates active tenants with `ledger.auto_sms=on` and for each: selects parties where `status='active' ∧ balance > 0 ∧ collection_date ∈ {T+1 (kind auto_d1), T (kind auto_d0)} ∧ sms_opt_in=true ∧ mobile IS NOT NULL`, inserts `ledger_reminder(kind, due_on=collection_date, channel='sms', status='scheduled', scheduled_for=now)` using `INSERT … ON CONFLICT (party_id, due_on, kind) DO NOTHING` (unique partial index), and for each inserted row enqueues `jobs.enqueue('notifications.send_message', { reminder_id })`.
3. FR-3 The job handler loads the reminder, re-checks eligibility (balance > 0, opt-in, mobile, tenant setting) at send time — if no longer eligible sets `status='cancelled'` with `note='balance settled'|'opted out'`; else renders `REMINDER_D1`/`REMINDER_D0` with the live balance, calls the SMS adapter (NTF-02), stores `snapshot_balance`, `message_log_id`, and sets `status='sent'` or `'failed'` (`skipped` message_log → reminder `sent` with note "provider not configured"? — **No**: reminder `status='failed'`, note "provider not configured", so owners see it clearly; see BR-6).
4. FR-4 Retries follow NTF-02's job backoff; after final failure the reminder is `failed` and an in-app notification `reminder_failed` (NTF-01) is created for owners/admins.
5. FR-5 Reminders list (`/reminders` page, tab **Automated**) shows rows with party, kind (D-1/D0), due date, status badge, snapshot balance, and message status; row action **Remind manually** (LED-06) for failed/cancelled.
6. FR-6 Per-party opt-out: `parties_party.sms_opt_in=false` (PTY-01 toggle "Send SMS to this customer") excludes the party from both LED-07 and LED-08; `consent_source`/`consent_at` recorded when toggled on (DPDP).
7. FR-7 Idempotency: re-running the task the same day creates no new rows (constraint); jobs are idempotent on `reminder_id` (skip if reminder not `scheduled`).
8. FR-8 The task runs for the previous day too (catch-up) if the scheduler was down: it processes `due_on ∈ {T, T+1}` for `auto_d0`/`auto_d1` and additionally `due_on = T` for `auto_d1` rows missed yesterday only if no `auto_d0` exists yet — simplified rule BR-5.

#### 5. Non-Functional Requirements
Task completes ≤ 60 s for 10k tenants × 100 eligible parties (batched inserts of 500). Sends throttled ≤ 10/s per process and ≤ 200/hour/tenant (NTF-02). Send window fixed 09:00–20:00 IST; jobs due outside the window are deferred (`run_after`) to next 09:00. Hindi SMS ≤ 130 chars (2 UCS-2 segments avoided).

#### 6. User Flow
Primary: Settings → Ledger → "Automated SMS reminders" **On** → (next morning 09:00) party with collection date tomorrow receives D-1 SMS; day after, D0 SMS → Reminders page shows two rows `sent` with balances.
Alternate A (provider missing): rows appear `failed` with note "provider not configured"; owner sees banner on Reminders page "Set up an SMS provider to send automated reminders" → Settings link.
Alternate B (customer pays before D0): job re-check finds balance 0 → `cancelled`; no SMS.
Alternate C (opt-out): PTY-01 toggle off → future rows not created; already-scheduled → cancelled at send time.
Alternate D (failure): provider error → retry ×4 → `failed` → in-app notification to owner → **Remind manually**.

#### 7. UI Requirements
Settings card `AutoSmsSettingsCard` (`MLCard`, `MLSwitch`, status `UbStatusBadge` for provider), copy explaining timing. Reminders page `app/(app)/reminders/page.tsx` → `<RemindersPageContent/>` with `UbTabs` (All · Automated · Manual), `UbDataGrid` columns Party · Kind · Due · Balance · Status · Sent at; mobile cards. Kind badge "D-1"/"Today". Status tones: scheduled → info, sent → success, failed → danger, cancelled/dismissed → neutral, done → success.

#### 8. UX Requirements
Keys: `ledger.autoSms.title` "Automated SMS reminders", `ledger.autoSms.desc` "Sends an SMS the day before and on the collection date, at 9:00 am.", `ledger.autoSms.providerMissing` "SMS provider not configured — reminders will be recorded but not sent.", `ledger.reminder.kind.d1` "Day before", `ledger.reminder.kind.d0` "Due day", `ledger.reminder.cancelledSettled` "Cancelled — balance settled". Hindi equivalents in `hi.json`. No confirmation on toggle; a snackbar explains the next run: "On. First reminders go out tomorrow at 9:00 am."

#### 9. States
Settings: Off · On (provider ok) · On (provider missing, warning) · Saving. Reminders list: Loading skeleton · Empty first-use ("No automated reminders yet. Set collection dates on parties to start.") · Empty filtered · Rows with statuses (scheduled/processing = "Sending…", sent, failed with caption, cancelled) · Error (retry).

#### 10. Validation Rules
Setting value ∈ {`off`, `on`} → `PUT /tenants/current/settings` JSON-schema validated. No user input otherwise. Server guards: mobile E.164 regex `^\+91[6-9]\d{9}$` before send (else `failed` with note "invalid mobile").

#### 11. Business Rules
1. BR-1 Eligibility at schedule time: `tenant.status='active' ∧ setting on ∧ party.status='active' ∧ balance>0 ∧ sms_opt_in ∧ mobile ∧ collection_date ∈ {T, T+1}`.
2. BR-2 Kind mapping: `collection_date = T+1 → auto_d1`; `= T → auto_d0`. Both may exist for the same party on consecutive days; uniqueness `(party_id, due_on, kind)`.
3. BR-3 Message balance is the live balance at send time; `snapshot_balance` stores it.
4. BR-4 Cancel on settle: LED-05 BR-2 cancels `scheduled` rows immediately when balance ≤ 0; the job re-check is the second line of defence.
5. BR-5 Catch-up: if the runner missed a day, `auto_d1` rows for `due_on=T` are **not** created (the day-before message would be late and confusing); `auto_d0` is created as normal.
6. BR-6 Console backend / not configured: message_log `status='skipped'`, reminder `status='failed'`, `note='provider not configured'`. This keeps `failed` = "customer did not get it", which is what the owner needs to know.
7. BR-7 Templates `REMINDER_D1`, `REMINDER_D0` resolve tenant → partner → global; a template without `dlt_template_id` in production makes the adapter return `failed` with error `dlt_template_missing` (NTF-02).
8. BR-8 Send window 09:00–20:00 IST; jobs created inside the window send immediately; the daily task runs at 09:00 so this only matters for retries.

#### 12. Permissions
Toggle setting: `notifications.settings.manage` (owner, admin). View reminders list: `ledger.entry.read`. Party opt-out toggle: `parties.party.write`. The scheduler runs as `actor_type='system'`.

#### 13. Edge Cases
1. EC-1 Collection date set at 09:30 for tomorrow → picked up next morning as `auto_d1`? No — next morning `collection_date = T` → `auto_d0` only. The day-before message is skipped when the date was set too late; the UI snackbar in LED-05 says which reminders will go.
2. EC-2 Party balance flips positive → negative → positive across the two days → each job re-checks; only eligible sends happen.
3. EC-3 Tenant switches timezone (Phase 2 regions) → schedule per tenant timezone; MVP fixed IST.
4. EC-4 Two scheduler processes (misconfiguration) → constraint prevents duplicate rows; jobs table row claimed with `SELECT … FOR UPDATE SKIP LOCKED`.
5. EC-5 Provider returns success but DLT scrubbing drops the message (template mismatch) → status stays `sent` unless a delivery callback (P2) says otherwise; flagged in NTF-02 §24.
6. EC-6 Party mobile changed after scheduling → send uses the current mobile.
7. EC-7 Tenant `pending_deletion` → excluded.

#### 14. API Requirements
- `PUT /tenants/current/settings` with `ledger.auto_sms`.
- `GET /reminders?kind=auto_d1,auto_d0&status=&due=&page` (filter `kind` is an addition to §22.5's listed params — CCR-6).
- `PATCH /parties/{id} { sms_opt_in, consent_source }`.
- Internal: `manage.py run_scheduler` (loop) and `manage.py schedule_auto_reminders --date=YYYY-MM-DD --tenant=<id>` (manual invocation of the same task for ops/tests).
- Frontend: `settingsService.updateSettings`; `reminderService.listReminders`; thunks `fetchReminders` (reused), `updateTenantSettings`; slice `reminderSlice.list { tab, ids, total, status }`.

#### 15. Database Impact
Insert `ledger_reminder` (bulk, ON CONFLICT DO NOTHING on `U(party_id, due_on, kind) WHERE kind IN ('auto_d1','auto_d0')`), insert `platform_job`, insert/update `notifications_message_log`, update reminder status, `notifications_notification` on final failure. Reads `parties_party` via `IX(tenant_id, collection_date)` + `balance > 0`.

#### 16. Audit Requirements
`reminder.sent` / `reminder.failed` with `actor_type='system'`, `metadata.kind`, `message_log_id`; setting change `tenant.settings.updated` (`before/after.ledger.auto_sms`); party opt-in changes `party.updated` with consent fields.

#### 17. Notifications
SMS templates (DLT Service-Implicit; `{#var#}` typed placeholders registered on DLT with the same order):
- `REMINDER_D1` en: "{shop}: Rs {balance} is due tomorrow ({due_date}). Pay via UPI: {upi_link} -{shop}"; hi: "{shop}: Rs {balance} कल ({due_date}) देना है। UPI: {upi_link} -{shop}".
- `REMINDER_D0` en: "{shop}: Rs {balance} is due today. Pay via UPI: {upi_link} -{shop}"; hi: "{shop}: Rs {balance} आज देना है। UPI: {upi_link} -{shop}".
- When no VPA: `upi_link` line replaced by "Please pay at the shop." / "कृपया दुकान पर भुगतान करें।" (separate DLT variants `_NOUPI`).
In-app (NTF-01): `reminder_failed` "SMS to Ramesh Traders failed — remind manually" (owners/admins), `data.route=/reminders?status=failed`.

#### 18. Analytics / Event Tracking
Server-side events (emitted to the same analytics sink): `ub.ledger.auto_reminder_scheduled` `{ kind, tenant_count, party_count }` (daily aggregate), `ub.ledger.auto_reminder_result` `{ kind, status: sent|failed|cancelled|skipped, error_code? }`; client: `ub.ledger.auto_sms_toggled` `{ on, provider_configured }`.

#### 19. Security
Provider credentials in environment/settings only (never in DB at MVP); mobiles never logged in plain text in application logs (masked `+9198•••••678`); message payload stored in `message_log.payload` — covered by tenant deletion (PLT-10) and party erasure (DPDP): deleting a party soft-deletes message logs after the GST retention check (they are not tax records → deletable). Opt-out honoured within one scheduler tick.

#### 20. Performance
One set-based INSERT … SELECT per tenant per kind; jobs drained by the runner at ≤ 10/s; `SKIP LOCKED` claiming; message_log indexed `(tenant_id, created_at DESC)`.

#### 21. Testing
T-LED-07-1 (unit) eligibility query returns exactly parties with T/T+1 dates, balance > 0, opt-in, mobile. T-LED-07-2 (unit) second run same day inserts 0 rows. T-LED-07-3 (unit) job re-check cancels when balance settled. T-LED-07-4 (unit) console backend → message_log `skipped`, reminder `failed` with note. T-LED-07-5 (unit) retry/backoff schedule 1m/5m/15m/60m/6h then `failed` + owner notification. T-LED-07-6 (unit) catch-up: missed day creates only `auto_d0`. T-LED-07-7 (API) `GET /reminders?kind=auto_d0` filters. T-LED-07-8 (component) settings card shows provider-missing warning. T-LED-07-9 (E2E, with fake provider) set date tomorrow → run task at T → `auto_d1` sent with correct text → run at T+1 → `auto_d0` sent; pay → third run creates nothing. T-LED-07-10 (permission) staff cannot toggle setting (403).

#### 22. Acceptance Criteria
- AC-1 (US-LED-07-1) Given `ledger.auto_sms=on`, a fake provider, and Ramesh (balance ₹2,800, mobile, opt-in) with collection date T+1, when the task runs at T 09:00, then one `ledger_reminder(kind=auto_d1, status=sent)` exists with `snapshot_balance=2800.00` and a message_log `sent` whose body contains "Rs 2,800" and "tomorrow"; when it runs at T+1, then an `auto_d0` row is `sent`; a third run creates nothing new.
- AC-2 (US-LED-07-2) Given Ramesh has `sms_opt_in=false`, when the task runs, then no reminder row is created for him and LED-08 SMS are skipped.
- AC-3 (US-LED-07-3) Given the console backend in production mode, when the task runs, then rows are `failed` with note "provider not configured", the Reminders page shows them under Automated with a warning banner, and **Remind manually** opens LED-06.

#### 23. Dependencies
LED-05, NTF-02 (adapter, templates, jobs, backoff), NTF-01 (failure notification), PLT-06 (setting), PTY-01 (opt-in), scheduler (ADR-012), `platform_job` (CCR-9 for column spec).

#### 24. Future Enhancements
LED-12 WhatsApp API channel with the same scheduler; LED-13 recurring rules; delivery receipts (DLR) updating `delivered` (NTF-02 P2); per-tenant send-time preference.

### LED-08 — Transaction SMS to party

#### 1. Business Objective
Send the customer an SMS on every manual ledger entry ("₹500 udhaar added… balance ₹2,300") so that both sides hold the same number and disputes vanish — the single most praised trust feature in the category. Config-gated: runs end-to-end with the console backend at MVP. Measured by: SMS attempted for 100 % of eligible entries within 60 s; opt-out honoured 100 %; coalescing prevents > 1 SMS per party per 60 s.

#### 2. User Personas
Customer (CU) receives; Owner (OW) enables per tenant and per party; Staff (ST) posts entries that trigger it.

#### 3. User Stories
1. US-LED-08-1 — As a customer I want an SMS whenever the shop writes something in my khata so that I can object immediately if it is wrong.
2. US-LED-08-2 — As an owner I want to turn this on for the whole business and off for specific customers so that I control cost and consent.
3. US-LED-08-3 — As an owner I want to see on the entry whether the SMS went so that I can tell the customer "check your phone".

#### 4. Functional Requirements
1. FR-1 Tenant setting `ledger.party_sms_on_entry ∈ {off, on}` (default `off`) in Settings → Ledger, next to LED-07's toggle, with provider status.
2. FR-2 On successful `post_entry()` for `entry_type ∈ {manual_gave, manual_got, write_off}` (not `opening`, not document-sourced — documents have their own messages in SAL/PAY), if setting on ∧ `party.sms_opt_in` ∧ `party.mobile` → `jobs.enqueue('notifications.send_message', { template_code, party_id, related_type: 'ledger_entry', related_id, params }, run_after = now + 60 s, coalesce_key = f"party_sms:{party_id}")`.
3. FR-3 Coalescing: the runner, when executing a job with `coalesce_key`, checks for a *newer* pending job with the same key; if one exists it marks itself `skipped` (job status) and lets the newest run, which renders the **current** balance and, when > 1 entry was coalesced, uses template `LEDGER_ENTRY_MULTI`.
4. FR-4 Templates: `LEDGER_ENTRY_GAVE`, `LEDGER_ENTRY_GOT`, `LEDGER_ENTRY_MULTI`, `LEDGER_ENTRY_CORRECTED`, `LEDGER_ENTRY_REVERSED` (LED-03), `WRITE_OFF` (LED-11); bodies in §17.
5. FR-5 The timeline row shows a small message-status glyph (`MessageSquare` icon with tone) derived from `notifications_message_log` rows with `related_type='ledger_entry'`: queued (muted), sent (info), delivered (success), failed (danger), skipped (hidden). Tap → tooltip "SMS sent 18/09 10:02".
6. FR-6 Corrections/reversals send corrective SMS only if the original entry's SMS was `sent`/`delivered` (LED-03 FR-9).
7. FR-7 The first SMS ever sent to a party appends a DPDP notice suffix: " Reply STOP to {shop} to opt out." (en) / " बंद करने के लिए {shop} को बताएं।" (hi); recorded by `party.consent_source='sms_notice'`, `consent_at` when null. Inbound STOP handling is Phase 2 (no inbound channel at MVP); the shop can toggle opt-out on request (PTY-01).

#### 5. Non-Functional Requirements
Enqueue adds ≤ 5 ms to the entry transaction. Send latency ≤ 90 s (60 s coalesce + runner tick). Message ≤ 160 GSM-7 chars (en) / ≤ 70 UCS-2 chars per segment (hi; templates designed ≤ 130 chars → 2 segments max). Cost per SMS captured from `MessageResult.cost`.

#### 6. User Flow
Primary: owner posts "You gave ₹500" → after ~60 s customer receives "Sharma Store: Rs 500 udhaar added on 18/09. Balance Rs 2,800 (you will give). -Sharma Store" → row shows sent glyph.
Alternate A (rapid entries): three entries within a minute → one SMS: "Sharma Store: 3 entries added on 18/09. Balance Rs 3,450 (you will give)."
Alternate B (opt-out): party toggle off → no job enqueued; glyph absent.
Alternate C (provider missing): job runs, adapter returns `skipped`; glyph hidden; settings shows warning.

#### 7. UI Requirements
Settings card `PartySmsSettingsCard` (`MLSwitch`, provider badge, estimated cost hint "≈ ₹0.20 per SMS via your provider" from partner settings when available). Timeline glyph in `UbTimeline` item meta slot with `MLTooltip`. PTY-01 form: `MLSwitch name="smsOptIn"` "Send SMS updates to this customer" + `consent_source` select (verbal/form/link) shown when turning on.

#### 8. UX Requirements
Keys: `ledger.partySms.title` "SMS to customer on every entry", `ledger.partySms.desc` "Customers receive an SMS with the new balance within a minute. Rapid entries are combined.", `ledger.sms.status.sent` "SMS sent {when}", `.failed` "SMS failed", `.queued` "SMS queued". Wording in messages is neutral; "you will give" from the customer's side; never "you owe".

#### 9. States
Setting Off/On/Provider-missing. Row glyph: none (skipped/not applicable) · queued · sent · delivered (P2 DLR) · failed. Settings saving state. Party opt-in toggle saving/saved.

#### 10. Validation Rules
Setting enum; party `sms_opt_in` boolean; `consent_source ∈ {verbal, form, link, sms_notice}` (CCR-10 adds `sms_notice` to the documented value set). Mobile E.164 check before send (else `failed`, note "invalid mobile").

#### 11. Business Rules
1. BR-1 Eligible entry types: `manual_gave`, `manual_got`, `write_off`; corrective templates for `reversal`/`correction` when FR-6 holds.
2. BR-2 Params: `{shop}` = tenant name (≤ 30 chars, truncated with "…"), `{amount}`, `{date}` dd/mm, `{balance}` = |balance| en-IN, `{label}` = balance > 0 ? "you will give"/"आप देंगे" : balance < 0 ? "we will give"/"हम देंगे" : "settled"/"बराबर".
3. BR-3 Opening balances never trigger SMS (LED-02).
4. BR-4 Coalesce window 60 s per party; the winning job counts coalesced entries `n` from `ledger_entry WHERE party_id AND created_at > last_sms_at` (last_sms_at = latest `message_log.sent_at` for that party with a ledger template).
5. BR-5 Per-tenant throttle 200 SMS/hour (NTF-02 BR-7); beyond it jobs are deferred to the next hour, not dropped.
6. BR-6 Corrective SMS only if the original SMS reached `sent`/`delivered`; the corrective message carries old and new amounts.
7. BR-7 Message log `related_type='ledger_entry'`, `related_id=entry.id` (for `MULTI`, the newest entry's id and `payload.entry_ids[]`).

#### 12. Permissions
Toggle tenant setting: `notifications.settings.manage`. Party opt-in: `parties.party.write`. Glyph visible to `ledger.entry.read`.

#### 13. Edge Cases
1. EC-1 Entry corrected within the coalesce window before the SMS went → original job renders current state; no corrective SMS (nothing was sent).
2. EC-2 Party has a landline-looking number → E.164 validation fails → `failed` "invalid mobile", glyph danger; PTY-01 shows hint.
3. EC-3 Tenant name in Hindi + Hindi template → UCS-2; length guard truncates `{shop}` first, never the amount.
4. EC-4 Customer changes their number → future SMS to the new one; old logs retained.
5. EC-5 Balance negative after a big payment → label "we will give".
6. EC-6 The same person as customer and supplier with payables → the label logic handles sign.

#### 14. API Requirements
No new endpoints. Uses `PUT /tenants/current/settings`, `PATCH /parties/{id}`, and `GET /ledger-entries/{id}` which includes `messages: [ { channel, status, sent_at } ]` (addition to entry detail — CCR-6). Frontend: glyph reads `entry.messages` when present in list payload (`GET /parties/{id}/ledger-entries` includes `last_message_status` per row — CCR-6).

#### 15. Database Impact
`platform_job` insert (with `coalesce_key`, `run_after`), `notifications_message_log` insert/update (`cost`), `parties_party.consent_*` update on first notice. Index `IX(provider_message_id)` for P2 DLR; `IX(tenant_id, related_type, related_id)` proposed in CCR-4 for glyph lookups.

#### 16. Audit Requirements
Setting change audited; sends are logged in `message_log` (not audit); party consent change audited (`party.updated` with consent fields).

#### 17. Notifications
Templates (Service-Implicit, DLT ids per template row):
- `LEDGER_ENTRY_GAVE` en: "{shop}: Rs {amount} udhaar added on {date}. Balance Rs {balance} ({label}). -{shop}"; hi: "{shop}: {date} को Rs {amount} उधार जोड़ा गया। बाकी Rs {balance} ({label})। -{shop}".
- `LEDGER_ENTRY_GOT` en: "{shop}: Received Rs {amount} on {date}. Thank you. Balance Rs {balance} ({label}). -{shop}"; hi: "{shop}: {date} को Rs {amount} प्राप्त हुए। धन्यवाद। बाकी Rs {balance} ({label})। -{shop}".
- `LEDGER_ENTRY_MULTI` en: "{shop}: {n} entries added on {date}. Balance Rs {balance} ({label}). -{shop}"; hi: "{shop}: {date} को {n} एंट्री जोड़ी गईं। बाकी Rs {balance} ({label})। -{shop}".
- `LEDGER_ENTRY_CORRECTED`, `LEDGER_ENTRY_REVERSED` as in LED-03 §17. First-message DPDP suffix per FR-7.

#### 18. Analytics / Event Tracking
Server: `ub.ledger.party_sms_result` `{ template_code, status, coalesced_n, cost_paise_bucket }`; client: `ub.ledger.party_sms_toggled` `{ on }`, `ub.parties.sms_opt_in_changed` `{ on, consent_source }`.

#### 19. Security
DPDP: merchant is fiduciary, DigiKhaato processor; consent fields recorded; opt-out immediate; notice on first message; erasure cascades to message logs. Mobile masked in logs. Template rendering via whitelist placeholders.

#### 20. Performance
Enqueue is one insert. Runner drains with `SKIP LOCKED`; coalescing avoids bursts. Glyph data joined in the list query via a lateral subquery limited to the newest log per entry.

#### 21. Testing
T-LED-08-1 (unit) eligible entry enqueues job with `run_after=+60s` and `coalesce_key`. T-LED-08-2 (unit) opening/document entries do not enqueue. T-LED-08-3 (unit) three entries in 30 s → one `MULTI` SMS with n=3 and final balance. T-LED-08-4 (unit) opt-out party → no job. T-LED-08-5 (unit) first SMS appends notice and sets consent fields once. T-LED-08-6 (unit) corrective SMS only when original `sent`. T-LED-08-7 (API) entry detail includes `messages[]`. T-LED-08-8 (component) glyph tones by status; hidden for skipped. T-LED-08-9 (E2E, fake provider) post entry → run runner → SMS body matches template → glyph sent.

#### 22. Acceptance Criteria
- AC-1 (US-LED-08-1) Given setting on, a fake provider and Ramesh opted in, when "You gave ₹500" is posted at 10:00:00, then by 10:01:30 a message_log `sent` exists with body "Sharma Store: Rs 500 udhaar added on 18/09. Balance Rs 2,800 (you will give). -Sharma Store" (plus the notice suffix if first ever).
- AC-2 (US-LED-08-2) Given Ramesh opted out, when an entry is posted, then no job and no message_log are created; given Suresh opted in, his SMS still goes.
- AC-3 (US-LED-08-3) Given a sent SMS, when I view the entry row, then the glyph shows sent state and the tooltip shows the time.

#### 23. Dependencies
LED-01/03/11, NTF-02, PLT-06, PTY-01 (opt-in + consent), `platform_job` coalescing (CCR-9).

#### 24. Future Enhancements
Inbound STOP via provider webhook (P2); per-party language; WhatsApp utility channel (NTF-05) as cheaper alternative (₹0.115 vs ₹0.20); delivery receipts.

### LED-09 — Ledger summary & aging

#### 1. Business Objective
Answer "how much is out there, and how old is it" at tenant and party level: totals receivable/payable and aging buckets 0–30 / 31–60 / 61–90 / 90+ computed with FIFO application of credits against debits, so the owner can prioritise collections and the accountant can provision. Measured by: aging totals reconcile to Σ party balances to the paisa; page P95 ≤ 500 ms for 5k parties.

#### 2. User Personas
Owner (OW), Accountant (AC). Staff sees only totals on dashboard (basic) — bucket detail requires financial read? Staff has `reports.basic.read`, not `reports.financial.read`; aging per party is basic (needed for collection), so staff may see aging (BR-8).

#### 3. User Stories
1. US-LED-09-1 — As an owner I want to see total "You will get" and "You will give" so that I know my position.
2. US-LED-09-2 — As an owner I want to see how much receivable is older than 90 days so that I chase the oldest first.
3. US-LED-09-3 — As an accountant I want party-wise aging as of a chosen date so that I can prepare provisions and match the books.

#### 4. Functional Requirements
1. FR-1 `GET /ledger/summary` (LED-05 FR-3 shape) feeds the ledger home header: `UbStatCard` "You will get ₹…" (danger tone) and "You will give ₹…" (success tone).
2. FR-2 `GET /ledger/aging?type=receivable|payable&as_of=YYYY-MM-DD&tag=&page` returns per-party rows `{ party: { id, name }, buckets: { "0_30", "31_60", "61_90", "90_plus" }, total }` + `meta.totals` with the same keys and `meta.as_of`.
3. FR-3 Page `app/(app)/ledger/aging/page.tsx` → `<AgingPageContent/>`: `UbTabs` Receivable · Payable; `UbDateInput as_of` (default today); tag filter; `UbDataGrid` with a stacked bucket bar column (`AgingBucketBar`, feature-specific) and totals row; CSV export.
4. FR-4 Row click opens the party statement (LED-04) with `date_to=as_of`; bucket cell click filters the statement to entries in that age window (`date_from/date_to` computed from bucket edges).
5. FR-5 FIFO aging (BR-2) computed in SQL CTE; for tenants > 5k entries the nightly job caches to `reports_snapshot` (`report_name='ledger_aging'`) and the endpoint serves the snapshot when `as_of=today` with `meta.cached_at`.
6. FR-6 Dashboard (RPT-01) shows a mini aging bar from `meta.totals`.

#### 5. Non-Functional Requirements
P95 ≤ 500 ms for 5k parties / 100k entries live; ≤ 100 ms from snapshot. Bucket bar colours: 0–30 `--info`, 31–60 `--warning`, 61–90 `--warning-bright`, 90+ `--error`; always with numeric labels. Hindi: "बाकी की उम्र" (aging), bucket labels "0–30 दिन".

#### 6. User Flow
Primary: Ledger → **Aging** → Receivable tab → rows sorted by 90+ desc → tap Ramesh 90+ ₹1,200 → statement filtered to entries older than 90 days → **Remind**.
Alternate A: as_of = 31/03/2026 → recomputed live (no snapshot) → Export CSV.
Alternate B: Payable tab → suppliers you owe, buckets by purchase bill age.

#### 7. UI Requirements
`AgingPageContent`: `UbPageHeader` "Aging" with export action; tabs; filter row; `UbStatCard` ×4 for bucket totals; `UbDataGrid` columns Party · 0–30 · 31–60 · 61–90 · 90+ · Total, all `ds-num` right aligned, header totals; mobile: cards with `AgingBucketBar` and total. `AgingBucketBar`: horizontal stacked bar with segments proportional to bucket amounts and `aria-label`.

#### 8. UX Requirements
Keys: `ledger.aging.title` "Aging", `ledger.aging.receivable` "You will get", `ledger.aging.payable` "You will give", `ledger.aging.bucket.0_30` "0–30 days", … `90_plus` "90+ days", `ledger.aging.asOf` "As of", `ledger.aging.cachedAt` "Updated {when}". Sort default `-90_plus,-total`. No confirmations.

#### 9. States
Loading skeleton grid · Empty ("Nothing outstanding — everyone is settled." with tone success) · Success · Error retry · Cached (caption "Updated 02:10 today · Refresh" → live recompute if permitted) · Export processing (202 → poll).

#### 10. Validation Rules
`as_of` ≤ today ("As-of date cannot be in the future"); `type ∈ {receivable, payable}`; `tag` existing tag id. 400 `validation_error`.

#### 11. Business Rules
1. BR-1 Summary: `receivable = Σ max(balance,0)`, `payable = Σ max(−balance,0)` over active parties (archived parties have zero balance by rule).
2. BR-2 FIFO aging per party for `receivable` (balance > 0 as of `as_of`): let `D = [debit posted entries with entry_date ≤ as_of]` ordered by `(entry_date, created_at)`, `C = Σ credit posted entries with entry_date ≤ as_of`. Walk `D` oldest first: `applied = min(remaining_C, d.amount)`; `open_d = d.amount − applied`; `remaining_C −= applied`. Each `open_d > 0` is bucketed by `age = as_of − d.entry_date` (days): `0_30: age ≤ 30`, `31_60: 31–60`, `61_90: 61–90`, `90_plus: > 90`. Σ buckets = balance as of `as_of`. Reversal pairs are included as posted rows (they net; a reversal of a debit is a credit that applies FIFO too — accepted approximation documented here; corrections re-post at the replacement date).
3. BR-3 Payable aging mirrors with roles swapped (credits are the "invoices", debits the payments) for parties with balance < 0.
4. BR-4 Opening entries participate with `age` from `as_of`.
5. BR-5 Totals row = Σ over the filtered set; `meta.totals.total` must equal `summary.receivable` when `as_of=today` and no tag filter — asserted in tests.
6. BR-6 Snapshot: `reports_snapshot` row per tenant per type computed at 02:00 IST by scheduled task `reports.refresh_snapshots`; served only for `as_of=today`; `?fresh=true` forces live recompute for `reports.financial.read` holders.
7. BR-7 SQL: implemented as a CTE with `SUM(amount) OVER (PARTITION BY party_id ORDER BY entry_date, created_at)` cumulative debit; `open_d = GREATEST(0, LEAST(d.amount, cum_debit − C))` where `cum_debit` includes `d`; bucket by age; grouped by party.
8. BR-8 Visibility: staff see aging rows (collection work) but not the tenant-level totals cards unless `reports.basic.read` (they have it); `reports.financial.read` gates `?fresh=true` and CSV export via `reports.export`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View summary & aging | `ledger.entry.read` + `reports.basic.read` | ✅ | ✅ | ✅ | ✅ |
| Force fresh recompute | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Export CSV | `reports.export` | ✅ | ✅ | ❌ | ✅ |

#### 13. Edge Cases
1. EC-1 Party with debit 1,000 (100 days old) and credit 900 (today) → FIFO leaves 100 in 90+ (oldest first), not 0–30.
2. EC-2 `as_of` before the party's opening date → party excluded (balance 0 as of then).
3. EC-3 Party balance positive as of today but negative as of `as_of` → appears in payable for that date.
4. EC-4 Corrections dated in the past → replacement takes the supplied date, so age follows the corrected date.
5. EC-5 Large tenant snapshot stale after 02:00 → caption shows time; live totals on dashboard may differ slightly until refresh.
6. EC-6 Tag filter with zero parties → filtered-empty state.

#### 14. API Requirements
- `GET /ledger/summary` (LED-05).
- `GET /ledger/aging?type&as_of&tag&ordering=-90_plus|-total|name&page&page_size&fresh` → rows + `meta: { totals, as_of, cached_at | null, page… }`. `format=csv` (CCR-6) for export (≤ 5k rows sync).
- `GET /reports/receivables-aging`, `/payables-aging` (RPT-05) reuse the same selector `ledger.selectors.aging()`.
- Frontend: `ledgerService.getAging(params)`; thunk `fetchLedgerAging` in `ledgerAgingThunk.ts`; slice `ledgerAgingSlice { params, rows, totals, cachedAt, status }`; view-model `agingDisplay.ts` (`bucketRanges(asOf)` → date windows for drill-down).

#### 15. Database Impact
Reads `ledger_entry` (`IX(tenant_id, party_id, entry_date, created_at)`), `parties_party`, `parties_party_tag`; writes `reports_snapshot` (nightly). No new indexes.

#### 16. Audit Requirements
`ledger.aging.exported` (`metadata.params`, `row_count`). Views not audited.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.ledger.aging_viewed` `{ type, as_of_is_today, cached, party_count_bucket }`; `ub.ledger.aging_drilldown` `{ bucket }`; `ub.ledger.aging_exported`.

#### 19. Security
Tenant-scoped; snapshot rows keyed by tenant; CSV formula-escaping as LED-04.

#### 20. Performance
Single CTE query using the party/date index; snapshot for > 5k entries; pagination 25/page with totals from an aggregate over the CTE (two queries). `EXPLAIN` checked in CI with the 100k fixture.

#### 21. Testing
T-LED-09-1 (unit) FIFO example EC-1 → 90+ = 100. T-LED-09-2 (unit) Σ buckets == balance for 1,000 fuzzed parties. T-LED-09-3 (unit) payable mirror. T-LED-09-4 (unit) `as_of` historical excludes later entries. T-LED-09-5 (API) totals equal summary when as_of=today. T-LED-09-6 (API) snapshot served with `cached_at`; `fresh=true` by staff → 403. T-LED-09-7 (component) bucket bar proportions and aria-label. T-LED-09-8 (E2E) drill-down opens statement with computed date window. T-LED-09-9 (perf) 100k fixture ≤ 500 ms.

#### 22. Acceptance Criteria
- AC-1 (US-LED-09-1) Given parties with balances +2,800, +1,200, −500, when I open Ledger, then "You will get ₹4,000" and "You will give ₹500" are shown.
- AC-2 (US-LED-09-2) Given Ramesh has a debit of ₹1,000 dated 100 days ago and a credit of ₹900 today, when I open Receivable aging, then his row shows 90+ = ₹100 and other buckets ₹0.
- AC-3 (US-LED-09-3) Given `as_of=31/03/2026`, when the accountant requests aging, then only entries dated ≤ 31/03/2026 are considered and the CSV export lists party rows with four bucket columns and a total that equals the sum of the rows.

#### 23. Dependencies
LED-01/02/03/10 (entries), PTY-05 (tags), RPT-01/05, `reports_snapshot`, scheduler.

#### 24. Future Enhancements
Configurable bucket edges (P2 setting); aging by invoice due date (document-level, RPT-05 P2); trend chart of 90+ over months (RPT-10).

### LED-10 — Ledger ↔ documents integration

#### 1. Business Objective
One book of truth: every invoice, credit note, purchase bill, debit note, payment and unpaid party expense posts its ledger entry automatically inside the same database transaction, and every void reverses it the same way — so the khata never disagrees with the bills. This feature defines the single posting service every other module calls. Measured by: 0 documents in a posted state without a matching ledger entry (nightly `ledger.check_integrity` job); 0 orphan entries with dangling `source_id`.

#### 2. User Personas
All roles indirectly; Owner (OW) and Accountant (AC) verify via statement links; engineers of SAL/PUR/PAY/EXP modules are the direct consumers.

#### 3. User Stories
1. US-LED-10-1 — As an owner I want a credit invoice to appear in the customer's khata the moment I issue it so that I never double-enter.
2. US-LED-10-2 — As an owner I want a payment recorded against a bill to reduce the party balance and mark the bill paid so that one action does both.
3. US-LED-10-3 — As an accountant I want to click a statement row and land on the invoice/receipt so that I can audit quickly.
4. US-LED-10-4 — As an owner I want voiding a document to undo its ledger effect visibly (as a reversal) so that history stays complete.

#### 4. Functional Requirements
1. FR-1 Service `ledger.services.postings.post_source_entry(*, tenant, party, direction, amount, entry_date, entry_type, source_type, source_id, note, payment_mode=None, reference=None, actor)` inserts a `ledger_entry` and updates party caches (LED-01 BR-2..4). It must be called inside the caller's `transaction.atomic()` block; it asserts an open transaction (`connection.in_atomic_block`).
2. FR-2 Service `ledger.services.postings.reverse_source_entries(*, tenant, source_type, source_id, reason, actor)` finds all `posted` entries for the source and posts reversals (LED-03 BR-1/2) with `entry_type='reversal'`, `reason`, `entry_date = today` (**void date**, not original date — a void is a new business event; differs from manual reversal which keeps the original date, see BR-6).
3. FR-3 Posting matrix (normative):

| Source event | source_type | entry_type | direction | amount | entry_date | Party |
|---|---|---|---|---|---|---|
| Invoice / bill of supply issued with party, `amount_due > 0` at issue (credit or part-credit sale) | `sales_document` | `invoice` | debit | `grand_total` | `document_date` | invoice party |
| Invoice issued to walk-in (no party) | — | — | — | none | — | none |
| Invoice issued with immediate full payment | `sales_document` + `payment` | `invoice` (debit) **and** `payment_in` (credit) | both | `grand_total` / paid amount | `document_date` | party — two entries so the statement shows the bill and the receipt |
| Credit note issued | `sales_document` | `credit_note` | credit | `grand_total` | `document_date` | party |
| Purchase bill recorded | `purchase_document` | `purchase_bill` | credit | `grand_total` | `document_date` | supplier |
| Debit note issued (P2) | `purchase_document` | `debit_note` | debit | `grand_total` | `document_date` | supplier |
| Payment in recorded (PAY-01) | `payment` | `payment_in` | credit | `amount` | `payment_date` | party |
| Payment out recorded (PAY-01/PUR-02) | `payment` | `payment_out` | debit | `amount` | `payment_date` | party |
| Payment for walk-in sale (no party) | — | — | — | none | — | none |
| Expense with party, unpaid (`paid=false`) | `expense` | `expense` | credit | `amount + tax_amount` | `expense_date` | party |
| Expense paid or without party | — | — | — | none | — | — |
| Any of the above voided | `<same>` | `reversal` | opposite | same | void date | same |

4. FR-4 `note` for document entries is the human number (`INV/26-27/0042`, `RCT/26-27/0017`, `PB/26-27/0003`, `EXP/26-27/0011`); statement "Particulars" shows the number as a link plus the document's first line description when available (`SalesDocument.lines[0].description`, "+2 more").
5. FR-5 `GET /ledger-entries/{id}` returns `source: { type, id, number, status, url }` resolved by `ledger.selectors.resolve_sources(entries)` (batch by type).
6. FR-6 Document detail pages show a "Ledger" chip linking to the party statement anchored at the entry (`/parties/{id}/statement?highlight=<entry_id>`).
7. FR-7 Attempting to reverse a document entry via `/ledger-entries/{id}/reverse` → 409 `use_document_void` (LED-03).
8. FR-8 Integrity job `ledger.check_integrity` (nightly 02:30 IST): (a) documents in posted states (`issued|partially_paid|paid|overdue` for sales with party and credit portion; `recorded|…` purchases; `recorded` payments with party; unpaid party expenses) without a `posted` source entry; (b) `posted` entries whose source is `void`/missing; (c) party balance drift. Findings → `notifications_notification` type `integrity_warning` to owners (dedupe per day) and structured log.
9. FR-9 Party SMS (LED-08) is **not** triggered by document postings; SAL/PAY own their messages (invoice share, payment receipt SMS in PAY-04).

#### 5. Non-Functional Requirements
Posting adds ≤ 10 ms to document transactions. Integrity job ≤ 2 min on 100k entries. All amounts `Decimal`; never recomputed from lines here — callers pass document totals.

#### 6. User Flow
Primary (worked example, Part 22 §22.14): issue invoice ₹898 to Ramesh on credit → statement row "INV/26-27/0042 · Basmati Rice 5kg +0 more" debit ₹898 → record payment ₹500 auto-allocated → row "RCT/26-27/0017" credit ₹500 → invoice `partially_paid`, balance ₹398 → void invoice → row "Reversal of INV/26-27/0042" credit ₹898 dated today → balance −₹102 "You will give" → snackbar "Invoice voided. ₹500 payment stays as advance. Refund or keep?" (SAL-05 UX).
Alternate A: purchase bill ₹5,000 from supplier → credit ₹5,000 (you will give) → supplier payment ₹5,000 → debit → settled.
Alternate B: expense "Transport ₹1,200" to party Tempo Bhai unpaid → credit ₹1,200 on that party → later payment out ₹1,200 → settled.

#### 7. UI Requirements
Statement/timeline rows for document entries: `UbStatusBadge` with document kind (Invoice / Credit note / Bill / Receipt / Payment / Expense), number in `ds-mono` as a link, description snippet; reversal rows "Reversal of INV/… (voided: reason)". Document pages: `LedgerLinkChip` (feature-specific, sales/purchases/payments/expenses) → statement. Integrity notifications in NTF-01 inbox with tone warning.

#### 8. UX Requirements
Keys: `ledger.source.invoice` "Invoice", `.credit_note` "Credit note", `.purchase_bill` "Purchase bill", `.debit_note` "Debit note", `.payment_in` "Payment received", `.payment_out` "Payment made", `.expense` "Expense", `ledger.source.reversalOf` "Reversal of {number}", `ledger.source.viewInKhata` "View in khata". Colour semantics unchanged: debit rows red, credit rows green regardless of source.

#### 9. States
Statement rows: normal · reversed (struck) · source void (badge "Void" on the link) · source missing (integrity: "Document not found" caption). Integrity notification: present/absent. Document page chip: linked / "Not in ledger" (walk-in).

#### 10. Validation Rules
Service-level assertions (raise `LedgerPostingError`, mapped to 500 with request id because they indicate a programming error, not user input): amount > 0; party belongs to tenant; `entry_type` allowed for `source_type` per matrix; `source_id` not null for non-manual; caller in atomic block; no duplicate `posted` entry for `(source_type, source_id, entry_type)` (idempotent posting guard).

#### 11. Business Rules
1. BR-1 One `posted` entry per `(source_type, source_id, entry_type)`; `post_source_entry` is idempotent — a second call returns the existing entry (guards against retried issue calls behind idempotency keys).
2. BR-2 Direction semantics per canon §0.2: customer documents — invoice/debit note = debit, credit note/payment in = credit; supplier documents — purchase bill = credit, payment out/debit note = debit.
3. BR-3 Amount = document `grand_total` (after round-off) for documents; `amount` for payments; `amount + tax_amount` for expenses.
4. BR-4 Immediate-payment invoices post both entries so the statement mirrors paper (bill line + receipt line); net effect 0 when fully paid.
5. BR-5 Reversal on void: `entry_type='reversal'`, `reverses_id` = original, `source_type`/`source_id` = the **document** (not `ledger_entry`) so `reverse_source_entries` and statements can group by document; `reason` = void reason.
6. BR-6 Reversal `entry_date` = void date (today in tenant TZ). Rationale: GST/records treat a void as an event on its date; aging of the reversed receivable stops on the void date. Manual reversals (LED-03) keep the original date because they correct data-entry errors.
7. BR-7 Voiding a document does **not** void its payments (Part 22 §22.7): allocations are deleted (payment `unallocated_amount` grows), the payment's ledger entry stays; UI prompts refund/keep.
8. BR-8 Payment allocation changes never post ledger entries (allocation is document bookkeeping; the ledger already holds the payment).
9. BR-9 Credit note `settlement=refund` posts the credit note entry **and** a `payment_out` entry via PAY-01 (two rows).
10. BR-10 Walk-in documents never touch the ledger; the cashbook (EXP-03) still sees their payments via `payments_payment` with `party_id NULL`.

#### 12. Permissions
Postings inherit the permission of the calling action (`sales.invoice.write`, `purchases.bill.write`, `payments.payment.write`, `expenses.expense.write`, `*.void`). Reading integrity notifications: owners/admins. No direct endpoint.

#### 13. Edge Cases
1. EC-1 Invoice issued with `amount_due=0` (fully paid) → both entries posted (BR-4); if the tenant setting `ledger.post_paid_invoices=off` (CCR-5) only the net is posted — **default on**.
2. EC-2 Party changed on a draft before issue → entry uses the party at issue (snapshot).
3. EC-3 Party archived after documents exist → RESTRICT prevents deletion; archive requires zero balance.
4. EC-4 Document backdated to a previous FY → entry dated accordingly; aging uses that date.
5. EC-5 Idempotent retry of `POST /sales/invoices?issue=true` → replayed response; even if the handler re-ran, BR-1 prevents a duplicate entry.
6. EC-6 Void then re-issue a corrected invoice → new document, new entry; the reversal remains.
7. EC-7 Expense converted from unpaid to paid later — there is no "pay expense" action; the supplier payment (PAY-01 out) settles the ledger; the expense row stays unpaid-flagged but the party balance is right (documented limitation; see EXP-01 §24).
8. EC-8 Integrity job finds drift → enqueues `recalc_balances --party` and notifies; never mutates ledger rows.

#### 14. API Requirements
No new public endpoints. Internal Python API:
```python
post_source_entry(tenant, party, *, direction, amount, entry_date, entry_type, source_type, source_id, note, payment_mode=None, reference=None, actor) -> LedgerEntry
reverse_source_entries(tenant, *, source_type, source_id, reason, actor, entry_date=None) -> list[LedgerEntry]
resolve_sources(entries) -> dict[entry_id, SourceSummary]
```
Consumers: `sales.services.issue_invoice`, `issue_credit_note`, `void_invoice`, `void_credit_note`; `purchases.services.record_bill`, `void_bill`; `payments.services.record_payment`, `void_payment`; `expenses.services.record_expense`, `void_expense`. Frontend: statement/timeline rows read `source` from API; `sourceDisplay.ts` maps `source.type/kind` to label, badge tone and route (`/sales/invoices/{id}`, `/sales/credit-notes/{id}`, `/purchases/bills/{id}`, `/payments/{id}`, `/expenses/{id}`).

#### 15. Database Impact
`ledger_entry` inserts with `source_type/source_id`; `parties_party` caches; `platform_audit_log`. Index `IX(tenant_id, source_type, source_id)` used for idempotency guard and reversals. `notifications_notification` for integrity warnings.

#### 16. Audit Requirements
`ledger.entry.created` with `metadata.source = { type, id, number }` and `metadata.via = 'document'`; `ledger.entry.reversed` with `metadata.void_reason`; integrity findings `ledger.integrity.warning` (`actor_type='system'`).

#### 17. Notifications
In-app `integrity_warning` (owners/admins): "Ledger check found {n} issue(s). Tap to review." route `/ledger/integrity` (a simple list page of findings; MVP minimal). No SMS.

#### 18. Analytics / Event Tracking
Server: `ub.ledger.source_posted` `{ source_type, entry_type, amount_bucket }`, `ub.ledger.source_reversed` `{ source_type }`, `ub.ledger.integrity_findings` `{ count_by_kind }`.

#### 19. Security
Service functions require `tenant` and assert `party.tenant_id == tenant.id`; no user-controlled `source_type` — callers pass constants. Integrity page tenant-scoped.

#### 20. Performance
Posting = 1 insert + 1 party update + 1 audit; idempotency guard uses the source index. Integrity job uses anti-joins on indexed columns, batched per tenant.

#### 21. Testing
T-LED-10-1 (unit) matrix: each source event posts the expected direction/type/amount/date (parametrised over 10 cases). T-LED-10-2 (unit) idempotent guard returns existing entry. T-LED-10-3 (unit) `reverse_source_entries` reverses all posted entries of a source, dated today, `source_type` = document. T-LED-10-4 (unit) posting outside atomic block raises. T-LED-10-5 (API) §22.14 worked example end-to-end: balances 898 → 398 → −102. T-LED-10-6 (API) reverse of document entry → 409 `use_document_void`. T-LED-10-7 (job) integrity detects a manually inserted orphan and drift; notification created once per day. T-LED-10-8 (component) statement rows render number link and reversal caption; `sourceDisplay` maps routes. T-LED-10-9 (E2E) issue invoice → statement row → click → invoice page → Ledger chip → back to statement highlight.

#### 22. Acceptance Criteria
- AC-1 (US-LED-10-1) Given a credit invoice INV/26-27/0042 for ₹898 to Ramesh, when issued, then exactly one `ledger_entry(entry_type=invoice, direction=debit, amount=898.00, entry_date=document_date, source_type=sales_document)` exists and Ramesh's balance rose by ₹898.
- AC-2 (US-LED-10-2) Given that invoice, when a ₹500 payment with `allocations:"auto"` is recorded, then a `payment_in` credit entry exists, the invoice is `partially_paid` with `amount_due=398.00`, and balance is ₹398.
- AC-3 (US-LED-10-3) Given the statement, when the accountant clicks "INV/26-27/0042", then the invoice page opens and shows a "View in khata" chip back to the highlighted entry.
- AC-4 (US-LED-10-4) Given the invoice is voided with reason "Wrong party", when I view the statement with corrections, then a reversal row credit ₹898 dated today with caption "Reversal of INV/26-27/0042 (voided: Wrong party)" appears and balance is −₹102; the ₹500 payment remains as unallocated advance.

#### 23. Dependencies
SAL-02/04/05, PUR-01/02/04, PAY-01/05, EXP-01, LED-03, LED-04, scheduler; CCR-5 (`ledger.post_paid_invoices` setting, optional).

#### 24. Future Enhancements
Projection of `entry_type` into GL journals (Future `accounting` module); document-level aging (RPT-05 P2); integrity page with one-click repair suggestions.

### LED-11 — Write-off / settle small balance

#### 1. Business Objective
Let an owner close a khata that will never be collected or paid (₹20 rounding, a customer who moved away) by posting an explicit, reasoned `write_off` entry that zeroes (or reduces) the balance, so parties can be archived and reports stay honest — instead of faking a payment. Measured by: 0 "fake" manual_got entries with note "write off" after launch (heuristic search); archive-blocked parties resolved via write-off.

#### 2. User Personas
Owner (OW) only (admins too). Accountant reads write-offs in reports.

#### 3. User Stories
1. US-LED-11-1 — As an owner I want to write off ₹20 left after a cash settlement so that the party shows Settled.
2. US-LED-11-2 — As an owner I want to write off a bad debt with a reason so that the loss is recorded and the party can be archived.
3. US-LED-11-3 — As an owner I want to write off a small amount I owe a supplier who waived it so that my payables are right.

#### 4. Functional Requirements
1. FR-1 Party page header menu ⋯ → **Write off balance** (visible when `balance ≠ 0` and actor has `ledger.entry.correct`) opens `WriteOffDrawer` prefilled with `amount = |balance|`, editable downwards (partial write-off), a `reason` field (required) and a `reason_category` chip row: Rounding · Bad debt · Waived · Other (stored in the note as prefix).
2. FR-2 Save calls `POST /ledger-entries` with `entry_type: "write_off"` (CCR-1), `direction` computed server-side as `credit` when balance > 0 (reduces receivable) and `debit` when balance < 0 (reduces payable), `amount`, `entry_date` (default today, ≤ today), `note = "{category}: {reason}"`, `reason`.
3. FR-3 The archive flow (PTY-04) on 409 `party_balance_nonzero` offers **Write off and archive**: it opens the same drawer, and on success continues to archive in the same UI flow (two requests).
4. FR-4 Write-offs appear in statements as "Write-off (Bad debt: moved away)" rows with `UbStatusBadge tone="warning"` and in the day book (RPT-02) under type Write-off; a report line "Write-offs this period" is added to the dashboard financial tiles (RPT-01, `reports.financial.read`).
5. FR-5 Write-offs are correctable/reversible via LED-03 (they are `source_type=manual`).
6. FR-6 The party SMS (LED-08) template `WRITE_OFF` is sent when enabled: the customer is told the balance was settled/adjusted.

#### 5. Non-Functional Requirements
Same as LED-01. Hindi: "बाकी माफ़ करें" (write off), categories "राउंड-ऑफ", "डूबत", "माफ़", "अन्य".

#### 6. User Flow
Primary: party balance ₹20 → ⋯ → **Write off balance** → drawer shows "Write off ₹20 (You will get)" → chip Rounding → reason "Cash settled" → **Write off** → `UbConfirmDialog` "Write off ₹20? The party will show Settled." → confirm → header "Settled", timeline row "Write-off ₹20 · Rounding: Cash settled".
Alternate A (partial): balance ₹5,000 → amount 2,000 → balance ₹3,000 remains.
Alternate B (archive): Archive → 409 → **Write off and archive** → drawer → confirm → archived.
Alternate C (payable): balance −₹35 → drawer "Write off ₹35 (You will give)" → direction debit.

#### 7. UI Requirements
`WriteOffDrawer` (`UbDrawer`): summary card with current balance (`UbAmount`), `UbMoneyInput amount` (max = |balance|), `MLToggleGroup reasonCategory`, `MLInput reason` (required), `UbDateInput entryDate`, consequence line "Balance ₹20 → ₹0 (Settled)", footer `MLButton variant="destructive"` (outlined) "Write off". `UbConfirmDialog` before submit.

#### 8. UX Requirements
Keys: `ledger.writeOff.title` "Write off balance", `ledger.writeOff.amount` "Amount to write off", `ledger.writeOff.category.rounding` "Rounding", `.bad_debt` "Bad debt", `.waived` "Waived", `.other` "Other", `ledger.writeOff.confirm` "Write off ₹{amount}? The party will show {label}.", `ledger.writeOff.row` "Write-off". Tone: warning badge (neither red nor green — it is neither gave nor got); the amount itself keeps direction colour.

#### 9. States
Initial (prefilled) · Loading · Success (snackbar "Written off ₹20 · Settled", action **Archive party** if balance now 0) · Error 400 (amount > |balance|) · Error 409 `party_archived` · Disabled (staff: menu item hidden; balance 0: hidden).

#### 10. Validation Rules
`writeOffSchema`: `amount` > 0, ≤ 2 dp, ≤ |balance| ("Cannot write off more than the balance"); `reasonCategory ∈ {rounding, bad_debt, waived, other}`; `reason` 3–160 chars; `entryDate ≤ today`. Server: 400 `validation_error` `details.amount` when amount > |balance| (computed under row lock); 409 `nothing_due`? — no: balance 0 → 400 `details.amount: ["Nothing to write off"]`.

#### 11. Business Rules
1. BR-1 `entry_type='write_off'`, `source_type='manual'`, `direction = credit if balance > 0 else debit`, `reason` required, `note = "{category}: {reason}"` (category stored in English key form `rounding|bad_debt|waived|other` inside `note` prefix; i18n on display).
2. BR-2 Balance maths as LED-01; a full write-off yields balance 0 and triggers LED-05 BR-2 (collection date cleared, reminders cancelled).
3. BR-3 Write-offs are not payments: they never appear in the cashbook (EXP-03) and are excluded from "collections" totals; they appear in day book and the "Write-offs" financial tile.
4. BR-4 Correctable via LED-03; replacement keeps `entry_type='write_off'`.
5. BR-5 Write-off does not alter document statuses: an invoice that remains `partially_paid` stays so (the ledger is settled, the document is not); RPT shows the invoice as unpaid. Documented; document-level write-off is Phase 2 (§24).

#### 12. Permissions
Write off: `ledger.entry.correct` (owner, admin). Read: `ledger.entry.read`. Financial tile: `reports.financial.read`.

#### 13. Edge Cases
1. EC-1 Balance changes between opening the drawer and saving → server recomputes under lock; if `amount > |balance|` → 400 with current balance in `details`, drawer updates.
2. EC-2 Write-off dated in a closed FY → allowed (no period locking at MVP).
3. EC-3 Party with both receivable invoices and an advance → balance sign decides direction; documents untouched (BR-5).
4. EC-4 Staff attempts via API → 403.
5. EC-5 Write-off then customer pays anyway → record "You got" → balance negative (advance) → owner may reverse the write-off (LED-03) instead; snackbar hint suggests it when a payment arrives within 30 days of a write-off.

#### 14. API Requirements
- `POST /ledger-entries` `{ party_id, entry_type: "write_off", amount, entry_date, reason, note }` → 201 `{ data: entry, meta: { party_balance } }`; server sets `direction`. 400 amount checks; 403; 409 `party_archived`.
- Reuses `POST /parties/{id}/archive` afterwards.
- Frontend: `ledgerService.postWriteOff(payload)`; thunk `postWriteOff` in `ledgerEntryThunk.ts`; `writeOffDisplay.ts` (`directionForBalance`, `consequenceLabel`).

#### 15. Database Impact
Insert `ledger_entry(entry_type='write_off')`; party caches; audit; reminders cancelled when settled; `platform_job` for SMS.

#### 16. Audit Requirements
`ledger.entry.created` with `after.entry_type='write_off'`, `metadata.reason`, `metadata.category`, `metadata.balance_before/after`.

#### 17. Notifications
SMS `WRITE_OFF` (LED-08 pipeline): en "{shop}: Your account was adjusted by Rs {amount} on {date}. Balance Rs {balance} ({label}). -{shop}"; hi "{shop}: {date} को आपके खाते में Rs {amount} का समायोजन किया गया। बाकी Rs {balance} ({label})। -{shop}". In-app: none.

#### 18. Analytics / Event Tracking
`ub.ledger.write_off_posted` `{ category, amount_bucket, full: bool, direction, via: menu|archive_flow }`.

#### 19. Security
Owner/admin only; reason mandatory and audited; tenant scoping.

#### 20. Performance
As LED-01.

#### 21. Testing
T-LED-11-1 (unit) receivable balance → credit write-off; payable → debit. T-LED-11-2 (unit) amount > |balance| → 400. T-LED-11-3 (unit) full write-off clears collection date and cancels reminders. T-LED-11-4 (API) staff → 403. T-LED-11-5 (API) archive flow: 409 → write-off → archive 200. T-LED-11-6 (component) drawer prefill, max amount, consequence line. T-LED-11-7 (selector) cashbook excludes write-offs; day book includes. T-LED-11-8 (E2E) write off ₹20 → Settled → archive.

#### 22. Acceptance Criteria
- AC-1 (US-LED-11-1) Given balance ₹20, when I write off ₹20 with category Rounding, then a `write_off` credit entry exists, balance is ₹0, header shows "Settled", and the cashbook is unchanged.
- AC-2 (US-LED-11-2) Given balance ₹5,000 and an archive attempt returning 409, when I choose Write off and archive with reason "Moved away", then the write-off is posted and the party is archived in the same flow.
- AC-3 (US-LED-11-3) Given balance −₹35, when I write off ₹35, then the entry direction is `debit` and balance is ₹0.

#### 23. Dependencies
LED-01, LED-03, LED-05, LED-08, PTY-04, RPT-01/02, CCR-1.

#### 24. Future Enhancements
Document-level write-off marking invoices `paid` with a write-off allocation (Phase 2); bad-debt report for the CA (RPT-10); period locking preventing backdated write-offs (Phase 3).

### LED-12 — Automated WhatsApp reminders (API) — Phase 2

#### 1. Business Objective
Send the D-1/D0 (and LED-13 recurring) reminders as WhatsApp **Utility** template messages through the WhatsApp Cloud API or a BSP, with recorded opt-in and per-message cost surfaced, because WhatsApp is where Indian customers read and it is cheaper than SMS (≈ ₹0.115 vs ₹0.20). Measured by: delivery rate ≥ 95 %; cost per reminder shown on every log row.

#### 2. User Personas
Owner (OW) enables channel and sees costs; Partner admin (PA) owns the WABA/number and templates (WLB-06); Customer (CU) receives.

#### 3. User Stories
1. US-LED-12-1 — As an owner I want reminders to go on WhatsApp automatically so that customers actually read them.
2. US-LED-12-2 — As an owner I want to know what each message costs so that I can decide channel per customer segment.
3. US-LED-12-3 — As a partner admin I want templates approved once and reused by all my tenants so that onboarding is fast.

#### 4. Functional Requirements
1. FR-1 Setting `ledger.auto_reminder_channel ∈ {sms, whatsapp_api, both}` (CCR-5) extends LED-07; when `whatsapp_api` is chosen the scheduler creates `ledger_reminder(channel='whatsapp_api')` rows and enqueues `notifications.send_message` with `channel='whatsapp'`.
2. FR-2 Provider adapter `WhatsAppCloudBackend` (NTF-05) implements `send(to, template_code, params) -> MessageResult` using `notifications_template.whatsapp_template_name`, language code (`en`/`hi`), and components body parameters in placeholder order.
3. FR-3 Opt-in: only parties with `whatsapp_opt_in=true` (CCR-11, new column) and recorded `consent_source/consent_at` are eligible; the PTY-01 form gains the toggle with a consent-source select; the public statement page (LED-04) offers a "Get updates on WhatsApp" checkbox that records `consent_source='link'`.
4. FR-4 Status webhooks from Meta (`POST /webhooks/notifications/whatsapp` — CCR-12) update `message_log.status` to `delivered`/`failed` and `delivered_at`; the reminder row mirrors `sent`/`failed`.
5. FR-5 Cost: `MessageResult.cost` is populated from the provider's pricing table configured per partner (`platform_partner.settings.whatsapp_pricing`) at send time; Reminders list shows a cost column and a monthly total tile "Messaging cost this month ₹…".
6. FR-6 Fallback: if the WhatsApp send fails with a non-retryable error (e.g. recipient not on WhatsApp, code 131026) and the setting is `both`, the runner enqueues the SMS variant once.

#### 5. Non-Functional Requirements
Send ≤ 5 s including API call; webhooks answered ≤ 200 ms (enqueue and return). Templates must be Meta-approved (Utility); the registry stores the approval status and blocks sends for unapproved templates (`failed`, `template_not_approved`).

#### 6. User Flow
Settings → Reminders → channel **WhatsApp** → (provider configured by partner) → next 09:00, customers with collection date T+1 receive the D-1 template → Reminders page rows show "WhatsApp · delivered · ₹0.12".
Alternate: template pending approval → banner "WhatsApp templates awaiting Meta approval — SMS will be used" (when `both`).

#### 7. UI Requirements
Extends LED-07 settings card with `MLRadioGroup` channel; Reminders grid gains **Channel** and **Cost** columns; `UbStatCard` "Messaging cost this month"; PTY-01 `MLSwitch whatsappOptIn` + consent select.

#### 8. UX Requirements
Keys: `ledger.autoReminder.channel` "Send automated reminders via", `.sms` "SMS", `.whatsapp` "WhatsApp", `.both` "WhatsApp, fall back to SMS", `ledger.reminder.cost` "Cost", `notifications.cost.month` "Messaging cost this month". Cost shown with 2 decimals (₹0.12).

#### 9. States
Channel settings saved/unsaved; provider missing warning; template unapproved banner; log statuses queued/sent/delivered/failed with cost; monthly cost tile loading/empty ("No messages sent this month").

#### 10. Validation Rules
Setting enum; `whatsapp_opt_in` requires `mobile`; `consent_source` required when turning on ("Record how consent was given").

#### 11. Business Rules
1. BR-1 Eligibility = LED-07 BR-1 with `whatsapp_opt_in` in place of `sms_opt_in` for the WhatsApp channel.
2. BR-2 Template category Utility; bodies must not contain offers.
3. BR-3 Cost = partner pricing `utility_inr` at send time; stored per message; monthly total = Σ `cost` over `message_log` for the tenant in the calendar month.
4. BR-4 Unique `(party_id, due_on, kind)` still applies per reminder; with `both`, the SMS fallback reuses the same reminder row (`message_log_id` updated, previous log kept with `failed`).
5. BR-5 Webhook idempotency on `provider_message_id`.

#### 12. Permissions
Setting: `notifications.settings.manage`. Opt-in: `parties.party.write`. Cost tile: `reports.financial.read`.

#### 13. Edge Cases
1. EC-1 Customer replies to the reminder → inbound message ignored at this phase (no inbox), logged for Phase 3.
2. EC-2 Meta re-categorises the template to Marketing → sends blocked until re-approved (registry flag from webhook `template_category_update`).
3. EC-3 Number not on WhatsApp → fallback to SMS (if `both`) exactly once.
4. EC-4 24-hour service window open (customer wrote first) → Utility template still charged from Oct 2026; cost table handles it as a constant.

#### 14. API Requirements
`PUT /tenants/current/settings` (`ledger.auto_reminder_channel`), `PATCH /parties/{id}` (`whatsapp_opt_in`, `consent_source`), `POST /webhooks/notifications/whatsapp` (CCR-12; HMAC `X-Hub-Signature-256` verification), `GET /reminders` gains `cost` per row (from joined message_log). Frontend: `reminderSlice` rows include `channel`, `cost`; thunk `fetchMessagingCost` in `notificationThunk.ts`.

#### 15. Database Impact
`parties_party.whatsapp_opt_in` (CCR-11); `notifications_message_log` (`provider='whatsapp_cloud'`, `cost`, `delivered_at`); `notifications_template` (`whatsapp_template_name`, approval status field — CCR-11); `platform_partner.settings.whatsapp_pricing`.

#### 16. Audit Requirements
Setting change; consent changes; webhook status updates are not audited (message_log holds them).

#### 17. Notifications
WhatsApp templates (Utility, `en`/`hi`), body with numbered parameters `{{1}}`=shop, `{{2}}`=amount, `{{3}}`=due date, `{{4}}`=UPI link: en "{{1}}: Rs {{2}} is due on {{3}}. Pay via UPI: {{4}}"; hi "{{1}}: Rs {{2}} {{3}} को देना है। UPI से भुगतान: {{4}}". Registry maps `REMINDER_D1`/`REMINDER_D0` → `ub_reminder_due_v1`.

#### 18. Analytics / Event Tracking
Server `ub.ledger.auto_reminder_result` gains `channel`, `cost_paise`; client `ub.ledger.auto_reminder_channel_changed` `{ channel }`.

#### 19. Security
Webhook signature verification (constant-time), IP allowlist optional; access token in environment; opt-in evidence retained (DPDP); erasure cascades.

#### 20. Performance
Sends via runner ≤ 10/s; webhooks enqueue only.

#### 21. Testing
T-LED-12-1 (unit) eligibility uses `whatsapp_opt_in`. T-LED-12-2 (unit) adapter builds Cloud API payload with parameters in order and language. T-LED-12-3 (unit) cost populated from partner pricing. T-LED-12-4 (API) webhook `delivered` updates log; replay ignored. T-LED-12-5 (unit) fallback to SMS once on 131026 with `both`. T-LED-12-6 (component) cost column and monthly tile.

#### 22. Acceptance Criteria
- AC-1 (US-LED-12-1) Given channel WhatsApp, an approved template and Ramesh opted in, when the 09:00 task runs at T (collection date T+1), then a `whatsapp_api` reminder is `sent`, and after the provider webhook it shows `delivered`.
- AC-2 (US-LED-12-2) Given partner pricing utility ₹0.115, when a reminder is sent, then the log row shows cost ₹0.12 (rounded display, stored 0.1150) and the monthly tile sums it.
- AC-3 (US-LED-12-3) Given a partner-level template, when a new tenant enables WhatsApp reminders, then no tenant-level template is required.

#### 23. Dependencies
LED-07, NTF-02, NTF-05, WLB-06, PTY-01, CCR-5/11/12.

#### 24. Future Enhancements
Two-way inbox (Phase 3); interactive "Pay now" button templates; per-party channel preference.

### LED-13 — Recurring reminders & schedules — Phase 2

#### 1. Business Objective
Wholesale and route businesses collect on a fixed weekly "hisaab day"; instead of setting a collection date every time, the owner defines a rule per party (or per tag/route) — e.g. "every Sunday", "1st of month" — and the scheduler creates reminders automatically while a balance is due. Measured by: rules adopted by ≥ 30 % of tenants tagged wholesale/distribution; reduction in manually set collection dates.

#### 2. User Personas
Owner (OW), Staff (ST) on routes, Customer (CU).

#### 3. User Stories
1. US-LED-13-1 — As a wholesaler I want every party on the "Camp Area" route reminded every Sunday morning so that Sunday collections are pre-announced.
2. US-LED-13-2 — As an owner I want a monthly rule for salaried customers ("remind on the 2nd") so that timing matches their pay day.
3. US-LED-13-3 — As an owner I want rules to pause automatically when nothing is due so that customers are not spammed.

#### 4. Functional Requirements
1. FR-1 New table `ledger_reminder_rule` (CCR-13): `party_id NULL`, `tag_id NULL` (exactly one set), `frequency ∈ {weekly, monthly}`, `weekday smallint NULL (0=Mon…6=Sun)`, `day_of_month smallint NULL (1–28 or −1 = last day)`, `channel` (`sms|whatsapp_api|in_app`), `lead_days smallint default 0` (0 = same day; 1 = day before), `min_balance numeric(14,2) default 0`, `is_active`, `last_run_on date`, `next_run_on date`.
2. FR-2 UI: party page ⋯ → **Reminder schedule**; tag page → **Reminder schedule for this tag**; `ReminderRuleDrawer` with frequency, weekday/day-of-month, channel, lead days, minimum balance.
3. FR-3 Scheduler task `ledger.run_reminder_rules` (daily 09:00 IST after LED-07) selects rules with `next_run_on = T`, expands tag rules to member parties, filters `balance > min_balance ∧ opt-in for channel ∧ mobile`, creates `ledger_reminder(kind='recurring', due_on=T+lead_days… — due_on = the collection day, scheduled_for=now)` and enqueues sends; then advances `next_run_on`.
4. FR-4 Dedupe: unique partial index `U(party_id, due_on, kind) WHERE kind='recurring'` (CCR-13) so a party matched by two tag rules gets one reminder.
5. FR-5 Rules do not touch `parties_party.collection_date`; LED-05 buckets gain an "On schedule" hint on parties covered by an active rule.
6. FR-6 Rule pauses implicitly: parties with balance ≤ `min_balance` are skipped (no row); explicit `is_active=false` toggle exists.
7. FR-7 `in_app` channel creates only an NTF-01 notification for staff assigned (Phase 3 routes) or owners: "Hisaab day: 14 parties on Camp Area · ₹1,24,300".

#### 5. Non-Functional Requirements
Rule expansion ≤ 30 s for 1k rules × 100 parties. Hindi copy "हिसाब का दिन" (hisaab day). Weekday names localized.

#### 6. User Flow
Tag "Camp Area" → Reminder schedule → Weekly · Sunday · WhatsApp · Remind 1 day before · min ₹100 → Save → every Saturday 09:00 the eligible parties receive "Kal Sunday hisaab hai…" → Sunday route collection → payments recorded → the following week only parties with balance get messages.

#### 7. UI Requirements
`ReminderRuleDrawer` (`UbDrawer`): `MLToggleGroup frequency`, weekday chips / day-of-month `MLSelect`, `MLRadioGroup channel`, `MLSelect leadDays` (Same day / 1 day before), `UbMoneyInput minBalance`, `MLSwitch isActive`; summary sentence preview "Every Sunday, reminded on Saturday, via WhatsApp, when balance ≥ ₹100". Rules list page under Reminders → tab **Schedules** (`UbDataGrid`).

#### 8. UX Requirements
Keys: `ledger.rule.title` "Reminder schedule", `ledger.rule.weekly` "Weekly", `ledger.rule.monthly` "Monthly", `ledger.rule.leadDays.0` "On the day", `.1` "Day before", `ledger.rule.summary` "Every {when}, via {channel}, when balance ≥ {min}", `ledger.rule.paused` "Paused — nothing due". Confirm on delete only.

#### 9. States
Rules list loading/empty ("No schedules. Set a hisaab day for a party or a route.")/rows; drawer saving; rule row badges Active / Paused (inactive) / Next run {date}.

#### 10. Validation Rules
Exactly one of `party_id`/`tag_id`; `weekly ⇒ weekday 0–6`; `monthly ⇒ day_of_month ∈ 1–28 or −1`; `lead_days ∈ {0,1}`; `min_balance ≥ 0`; channel requires provider (sms/whatsapp) else 409 `channel_not_configured`. Messages: "Choose a day", "Pick a day of month between 1 and 28 or Last day".

#### 11. Business Rules
1. BR-1 `next_run_on` computation: weekly → next date with `weekday` minus `lead_days`; monthly → next `day_of_month` (or month end) minus `lead_days`; always > `last_run_on`.
2. BR-2 Messages use template `REMINDER_RECURRING` with `{due_date}` = the collection day.
3. BR-3 `min_balance` threshold uses live balance at run time.
4. BR-4 Tag rules re-expand every run (new tag members are included automatically).
5. BR-5 A party-level rule overrides tag rules for that party (only the party rule fires).
6. BR-6 Rules never create reminders for archived parties.

#### 12. Permissions
Create/edit rules: `ledger.reminder.write` + `notifications.settings.manage` for channel choice (owner/admin); staff may view. Read: `ledger.entry.read`.

#### 13. Edge Cases
1. EC-1 Day-of-month 31 disallowed (use −1 last day) to avoid skipped months.
2. EC-2 Party in two tags with rules on the same day → one reminder (dedupe).
3. EC-3 Rule created after 09:00 for today → first run tomorrow's computation; summary shows next run.
4. EC-4 Provider deconfigured → sends `failed`; rule remains; owner notified once per day.

#### 14. API Requirements
`GET/POST /reminder-rules`, `PATCH/DELETE /reminder-rules/{id}` (CCR-13) with fields per FR-1; `GET /reminders?kind=recurring`. Frontend: `reminderRuleService.ts`; thunks `fetchReminderRules`, `saveReminderRule`, `deleteReminderRule` in `reminderRuleThunk.ts`; slice `reminderRuleSlice`.

#### 15. Database Impact
New `ledger_reminder_rule` (CCR-13) with `IX(tenant_id, next_run_on, is_active)`; `ledger_reminder` inserts (`kind='recurring'`); new partial unique index.

#### 16. Audit Requirements
`reminder_rule.created/updated/deleted` with before/after; runs logged as `reminder.sent` (system).

#### 17. Notifications
Template `REMINDER_RECURRING` en: "{shop}: Hisaab day {due_date}. Rs {balance} is due. Pay via UPI: {upi_link} -{shop}"; hi: "{shop}: {due_date} हिसाब का दिन है। Rs {balance} बाकी है। UPI: {upi_link} -{shop}". In-app for `in_app` channel per FR-7.

#### 18. Analytics / Event Tracking
`ub.ledger.reminder_rule_saved` `{ scope: party|tag, frequency, channel, lead_days }`; server `ub.ledger.recurring_run` `{ rules, parties_matched, sent, skipped }`.

#### 19. Security
Tenant-scoped rules; provider gating; consent rules as LED-07/12.

#### 20. Performance
Rules selected by `next_run_on` index; tag expansion via `parties_party_tag` join; set-based inserts with ON CONFLICT.

#### 21. Testing
T-LED-13-1 (unit) `next_run_on` for weekly/monthly/last-day/lead-days cases. T-LED-13-2 (unit) dedupe across two tag rules. T-LED-13-3 (unit) min_balance skip. T-LED-13-4 (API) validation (day 31 rejected). T-LED-13-5 (E2E) tag rule → run task on the computed day → reminders created for eligible parties only.

#### 22. Acceptance Criteria
- AC-1 (US-LED-13-1) Given a weekly Sunday rule with lead 1 day on tag Camp Area (14 parties, 12 with balance > 0), when the task runs on Saturday, then 12 `recurring` reminders are sent and 2 parties are skipped.
- AC-2 (US-LED-13-2) Given a monthly rule on the 2nd, when the task runs on the 2nd, then reminders are created and `next_run_on` is the 2nd of next month.
- AC-3 (US-LED-13-3) Given a party whose balance dropped to ₹0, when the rule's day comes, then no reminder is created and the party shows "Paused — nothing due".

#### 23. Dependencies
LED-05/06/07/12, PTY-05 (tags), NTF-02/05, CCR-13.

#### 24. Future Enhancements
LED-15 routes and collector assignment; per-rule template override; rule analytics (collection rate after reminder).

## 17.3 Payments (PAY)

### PAY-01 — Record payment in / out

#### 1. Business Objective
Record money received from a customer or paid to a supplier as one `Payment` document with a receipt number, one or more modes, an optional reference, and allocation to open invoices/bills (auto-FIFO or manual), posting the ledger entry atomically — so the khata, the document status and the cashbook all move in one action. Measured by: P95 record time ≤ 300 ms; allocations sum invariants never violated; ≥ 70 % of payments against invoices use auto-allocation.

#### 2. User Personas
Owner (OW), Staff (ST) at the counter, Accountant (AC) reading receipts, Customer (CU) receiving the receipt (PAY-04).

#### 3. User Stories
1. US-PAY-01-1 — As staff I want to record ₹500 received from Ramesh by UPI with the UTR so that the receipt and the khata are done together.
2. US-PAY-01-2 — As an owner I want a payment to settle the oldest invoices first automatically so that I do not pick invoices by hand.
3. US-PAY-01-3 — As an owner I want to allocate a payment manually to a specific invoice so that disputed bills stay open.
4. US-PAY-01-4 — As an owner I want to record a payment to a supplier against their bill so that payables and the bill status update.
5. US-PAY-01-5 — As an owner I want an advance (payment larger than dues) to sit on the party as "You will give" so that it can be used against the next bill.

#### 4. Functional Requirements
1. FR-1 Entry points: party page **You got ₹** (when the party has open documents the drawer offers "Record as payment against bills" — the plain manual got remains for ledger-only shops), invoice page **Record payment**, purchase bill page **Pay**, Payments list **+ Payment**, walk-in sale payment (SAL-07 inline).
2. FR-2 `PaymentDrawer` (`UbDrawer`) fields: `direction` (in/out, preset by context), `party` (`UbAsyncCombobox`, required unless walk-in context), `payment_date` (default today), `mode_breakup[]` (PAY-02; single mode by default), `reference` (per mode), `note`, `allocations` section listing open documents for the party (`number`, `document_date`, `due_on`, `amount_due`) with **Auto (oldest first)** toggle on by default and editable per-row amounts when off.
3. FR-3 Submit → `POST /payments` with `Idempotency-Key`; response 201 includes `party_balance`, `unallocated_amount`, `allocations[]` and updated document statuses; the UI updates party header, invoice status badges and the timeline.
4. FR-4 Server (`payments.services.record_payment`): allocate number from `platform_document_sequence` kind `payment_in` (`RCT`) / `payment_out` (`PAYOUT`); validate Σ modes = amount, Σ allocations ≤ amount; write `payments_payment`, `payments_allocation` rows; update each document `amount_paid`, `amount_due`, status (`issued→partially_paid→paid`; purchase `recorded→partially_paid→paid`); post ledger via LED-10 (`payment_in` credit / `payment_out` debit); set `unallocated_amount = amount − Σ allocations`; audit.
5. FR-5 Auto-FIFO allocation (`allocations:"auto"`): open documents = sales (`direction=in`: kinds `invoice|bill_of_supply`, status ∈ {issued, partially_paid, overdue}) or purchases (`direction=out`: `purchase_bill`, status ∈ {recorded, partially_paid, overdue}) for the party, ordered by `(document_date ASC, number ASC)`; for each: `alloc = min(remaining, amount_due)`; stop when `remaining = 0`. Remainder → advance.
6. FR-6 Manual allocation: each row `amount ≤ amount_due` and Σ ≤ payment amount; rows with 0 omitted.
7. FR-7 Advance handling: `unallocated_amount > 0` is shown on the party ("Advance ₹102") and on the receipt; a later invoice issue does **not** auto-consume advances at MVP (no ledger effect is needed — the ledger already nets); the invoice page shows "Party has advance ₹102 — allocate" → `POST /payments/{id}/allocate` is **not** in canon; MVP: allocation of an existing advance happens by voiding and re-recording (documented limitation, §24 / CCR-14).
8. FR-8 Receipt PDF/share (PAY-04) offered in the success snackbar.
9. FR-9 Walk-in (`party_id NULL`, only from SAL-07): payment must fully cover the invoice; allocations to that invoice only; no ledger entry.
10. FR-10 Payments list page `app/(app)/payments/page.tsx` → `<PaymentsPageContent/>` with `UbTabs` (All · Received · Paid out), filters party/mode/date, `UbDataGrid` columns Date · Number · Party · Mode · Amount · Allocated · Status; totals in header; row → `PaymentDetailDrawer`.

#### 5. Non-Functional Requirements
P95 ≤ 300 ms for ≤ 10 allocations. Drawer opens with party's open documents fetched in ≤ 200 ms (`GET /sales/invoices?party_id&status=issued,partially_paid,overdue&ordering=document_date&page_size=50`). Hindi: "भुगतान", "प्राप्त", "दिया", "बाकी बिल". Mobile keypad for amounts.

#### 6. User Flow
Primary: invoice INV/26-27/0042 (₹898 due) → **Record payment** → drawer preset in, party Ramesh, amount ₹500 (editable, default = amount_due), mode UPI, reference UTR → allocations auto: row INV/0042 ₹500 → Save → 201 → invoice badge "Partially paid · ₹398 due", party balance ₹398, snackbar "Received ₹500 · RCT/26-27/0017" with **Share receipt**.
Alternate A (party page, multiple invoices): You got ₹1,500 → auto: INV/0040 ₹898 → INV/0042 ₹602 → Save.
Alternate B (manual): toggle Auto off → type ₹1,500 against INV/0042 only? → row max ₹898 → error "Max ₹898" → fix → ₹602 remains unallocated → hint "₹602 will be kept as advance".
Alternate C (supplier): bill PB/0003 ₹5,000 → **Pay** → direction out, mode bank, reference → Save → bill `paid`, supplier balance 0.
Alternate D (advance): amount ₹1,000 with dues ₹898 → advance ₹102 → party header "You will give ₹102".

#### 7. UI Requirements
`PaymentDrawer`: header "Record payment · Ramesh Traders"; `MLToggleGroup direction` (hidden when preset by document); `UbAsyncCombobox party`; `UbMoneyInput amount` (derived = Σ modes when split; direct when single mode); `PaymentModeEditor` (PAY-02); `UbDateInput`; `MLTextarea note`; `AllocationsPanel` (`MLTable` desktop / cards mobile): `MLSwitch` "Auto — oldest first", rows with `UbMoneyInput` per row when manual, footer "Allocated ₹… · Unallocated ₹…"; submit `MLButton primary` "Save payment". `PaymentDetailDrawer`: number, party, date, modes, allocations list with links, status, actions Share receipt / Void (PAY-05). Desktop grid columns per FR-10.

#### 8. UX Requirements
Keys: `payments.record.title` "Record payment", `payments.direction.in` "Received", `payments.direction.out` "Paid out", `payments.alloc.auto` "Auto — oldest first", `payments.alloc.unallocated` "₹{amount} will be kept as advance", `payments.alloc.max` "Max ₹{amount}", `payments.saved` "Received ₹{amount} · {number}", `payments.advance` "Advance ₹{amount}". Colour: received amounts green, paid-out red (consistent with you got/you gave). Default amount = total due of the context document or the party's receivable (capped at receivable; user may raise it to record an advance).

#### 9. States
Initial (prefilled) · Loading open documents (skeleton rows) · No open documents ("No open bills — the full amount will be recorded on the khata") · Loading save · Success · Error validation (row-level max, sums) · Error 409 `document_not_open` (a listed invoice was paid/voided meanwhile → refresh rows) · Error 409 `idempotency_conflict` · Disabled (no `payments.payment.write`; archived party) · Partial (allocations panel hidden for walk-in) · Detail drawer states loading/error.

#### 10. Validation Rules
`paymentSchema`: `direction ∈ {in,out}`; `partyId` uuid (required unless `walkInDocumentId`); `paymentDate ≤ today`; `modeBreakup` per `paymentModeBreakupSchema` (PAY-02), Σ = `amount` ("Modes must add up to ₹{amount}"); `allocations` = `"auto"` or array of `{ documentType, documentId, amount > 0 }` with `amount ≤ amountDue` ("Max ₹{amountDue}") and Σ ≤ `amount` ("Allocations exceed the payment"); `note ≤ 255`; `reference ≤ 64`. Server codes: 400 `validation_error` (`details.mode_breakup`, `details.allocations[i].amount`); 409 `document_not_open`, `party_archived`; 404 unknown document (cross-tenant).

#### 11. Business Rules
1. BR-1 `amount = Σ mode_breakup[i].amount`; each `> 0`; `primary_mode` = mode with the largest share (ties → first listed).
2. BR-2 `Σ allocations ≤ amount`; `unallocated_amount = amount − Σ allocations`.
3. BR-3 Allocation target must belong to the same party (or walk-in doc for `party_id NULL`) and be open; sales documents only for `direction=in` (and refunds of credit notes use `direction=out` with no allocation), purchase documents only for `direction=out`.
4. BR-4 Document update after allocation: `amount_paid += alloc`; `amount_due = grand_total − amount_paid − credits_applied`; status: `amount_due = 0 → paid`; `0 < amount_due < grand_total → partially_paid`; if previously `overdue` and still due → remains `overdue` (nightly job maintains) — implementation: status `partially_paid` and the overdue flag recomputed by the same rule (`due_on < today`) immediately.
5. BR-5 FIFO order `(document_date ASC, number ASC)` — not `due_on` (matches how traders read the bill book).
6. BR-6 Ledger: exactly one entry per payment via LED-10 (`payment_in` credit / `payment_out` debit), `entry_date=payment_date`, `note=number`, `payment_mode=primary_mode`, `reference=reference or first mode reference`.
7. BR-7 Number allocation `SELECT … FOR UPDATE` on the sequence row; voided payments keep numbers.
8. BR-8 Walk-in: `party_id NULL`, allocations required to sum to the invoice `grand_total`; no ledger entry; appears in cashbook.
9. BR-9 Payments never reduce stock or tax; they only touch payments tables, documents' paid caches and the ledger.
10. BR-10 Advance is not auto-applied to future documents at MVP; the party balance already reflects it (ledger), documents show due until manually allocated (CCR-14 proposes `POST /payments/{id}/allocations` for Phase 2).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Record payment (in/out) | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| View payments | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |
| Void | `payments.payment.void` | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 Two staff record against the same invoice concurrently → document row locked `FOR UPDATE`; second sees reduced `amount_due`; if allocation exceeds → 400 with current `amount_due` in details; UI refreshes rows.
2. EC-2 Payment dated before the invoice date → allowed (advance later allocated); warning caption "Payment dated before the bill".
3. EC-3 Invoice voided after payment (Part 22 §22.14) → allocation deleted by void flow, `unallocated_amount` grows; payment untouched.
4. EC-4 Party has both open invoices and an existing advance → auto-allocation uses only the new payment; advance stays (BR-10).
5. EC-5 Mode `cheque` with future date → payment date still ≤ today (cheque date is the reference at MVP; PDC tracking is PAY-09).
6. EC-6 Amount less than the smallest due → allocated partially to the oldest.
7. EC-7 Rounding: all amounts 2 dp; no rounding needed in FIFO.
8. EC-8 Supplier payment with `direction=out` where the party balance is positive (they owe you) → allowed; results in a bigger receivable; caption warns "This party owes you ₹X — are you paying them?".

#### 14. API Requirements
- `POST /payments` (Part 22 §22.9) → 201 `{ data: Payment, meta: { party_balance, documents: [ { id, status, amount_due } ] } }`. `Payment`: `{ id, number, direction, party: { id, name } | null, payment_date, amount, mode_breakup[], primary_mode, reference, note, status, unallocated_amount, allocations: [ { document_type, document_id, number, amount } ], created_by, created_at, pdf_url }`.
- `GET /payments?direction&party_id&mode&date_from&date_to&status&q&ordering&page` → list + `meta.totals { count, amount_in, amount_out }` (`status`, `q` are additions — CCR-6).
- `GET /payments/{id}`; `POST /payments/{id}/void` (PAY-05).
- Open documents for the allocation panel: `GET /sales/invoices?party_id&status=issued,partially_paid,overdue&ordering=document_date,number&page_size=50` and `GET /purchases/bills?…`.
- Frontend: `paymentService.ts` (`recordPayment`, `listPayments`, `getPayment`, `voidPayment`); thunks `recordPayment`, `fetchPayments`, `fetchPayment` in `paymentThunk.ts`; slice `paymentSlice { list: { params, ids, totals, status }, entities, drawer: { context, openDocuments, status } }`; `paymentDisplay.ts` (`fifoPreview(amount, docs)` for client preview of auto allocation — server authoritative).

#### 15. Database Impact
Insert `payments_payment`, `payments_allocation` (U(payment_id, document_type, document_id)); update `sales_document`/`purchases_document` (`amount_paid`, `amount_due`, `status`); `platform_document_sequence` (`next_number`); `ledger_entry` + party caches (LED-10); `platform_audit_log`. Indexes used: `IX(tenant_id, party_id, payment_date DESC)`, document `IX(tenant_id, party_id, document_date DESC)`.

#### 16. Audit Requirements
`payment.recorded` with full row + allocations in `after`; document status changes audited as `invoice.status_changed` (`before/after.status`, `metadata.payment_id`).

#### 17. Notifications
Receipt SMS/WhatsApp are PAY-04. In-app `payment_received` (NTF-01) to owners when a **staff** member records a payment ≥ setting `payments.notify_owner_min_amount` (CCR-5; default off).

#### 18. Analytics / Event Tracking
`ub.payments.recorded` `{ direction, amount_bucket, modes_count, primary_mode, allocation: auto|manual|none, docs_allocated, has_advance, context: invoice|party|list|bill|walk_in, duration_ms }`; `ub.payments.record_failed` `{ error_code }`.

#### 19. Security
Tenant scoping on party and documents (cross-tenant → 404); idempotency keys per tenant; references stored as text; amounts `Decimal`. Rate limit default.

#### 20. Performance
One transaction; documents locked in a deterministic order (by id) to avoid deadlocks; ≤ 10 allocation rows typical. List paginated 25/page; totals via aggregate over filtered set.

#### 21. Testing
T-PAY-01-1 (unit) FIFO over three invoices with partial remainder and advance. T-PAY-01-2 (unit) Σ modes ≠ amount → 400. T-PAY-01-3 (unit) allocation > due → 400 with current due. T-PAY-01-4 (unit) statuses `issued→partially_paid→paid`; overdue recomputed. T-PAY-01-5 (unit) ledger entry created once with `payment_mode=primary_mode`. T-PAY-01-6 (API) walk-in payment with party → 400; without full allocation → 400. T-PAY-01-7 (API) idempotent replay. T-PAY-01-8 (API) supplier payment marks bill paid, supplier balance 0. T-PAY-01-9 (component) allocations panel auto/manual, max validation, unallocated hint. T-PAY-01-10 (E2E) §22.14 steps 1–3. T-PAY-01-11 (permission) accountant → 403 on POST; can GET.

#### 22. Acceptance Criteria
- AC-1 (US-PAY-01-1) Given INV/26-27/0042 with ₹898 due, when staff records ₹500 UPI with UTR "UTR123" and auto allocation, then a payment RCT/26-27/0017 exists with `mode_breakup=[{upi,500.00,UTR123}]`, an allocation of ₹500 to the invoice, invoice `partially_paid` with `amount_due=398.00`, and a `payment_in` ledger credit of ₹500.
- AC-2 (US-PAY-01-2) Given invoices INV/0040 (₹898, 10/09) and INV/0042 (₹898, 18/09), when ₹1,000 is recorded with auto allocation, then INV/0040 is `paid` (₹898) and INV/0042 `partially_paid` (₹102 allocated, ₹796 due).
- AC-3 (US-PAY-01-3) Given the same, when I manually allocate ₹500 to INV/0042 only, then INV/0040 remains `issued`, INV/0042 `partially_paid`, and `unallocated_amount=500.00`.
- AC-4 (US-PAY-01-4) Given purchase bill PB/0003 ₹5,000 `recorded`, when I pay ₹5,000 by bank, then the bill is `paid`, a `payment_out` debit posts, and supplier balance is ₹0.
- AC-5 (US-PAY-01-5) Given dues ₹898, when ₹1,000 is recorded, then `unallocated_amount=102.00`, the party header shows "Advance ₹102" and balance −₹102 "You will give".

#### 23. Dependencies
LED-10, SAL-02/07, PUR-01/02, PAY-02, PAY-04, PAY-05, PLT-06 (numbering), `UbAsyncCombobox`, `UbDrawer`, `UbDataGrid`.

#### 24. Future Enhancements
Apply existing advance to a document (`POST /payments/{id}/allocations`, CCR-14, Phase 2); PAY-06 aggregator payments creating payments automatically; PAY-08 bank import matching; PAY-09 PDC.

### PAY-02 — Multi-mode split payment

#### 1. Business Objective
One receipt can be paid ₹700 by UPI and ₹300 in cash; the product must record both on a single payment so the receipt, the ledger (one entry) and the cashbook (two mode lines) all agree — the exact gap users complain about in competing apps. Measured by: split payments record without a second document; cashbook mode totals reconcile to Σ `mode_breakup`.

#### 2. User Personas
Staff (ST) at the counter; Owner (OW) reading the cashbook.

#### 3. User Stories
1. US-PAY-02-1 — As staff I want to add a second mode line so that a part-UPI, part-cash payment is one receipt.
2. US-PAY-02-2 — As an owner I want the cashbook to show ₹700 in UPI and ₹300 in cash from that receipt so that the drawer count matches.
3. US-PAY-02-3 — As staff I want the amount to be computed from the mode lines so that I never mistype the total.

#### 4. Functional Requirements
1. FR-1 `PaymentModeEditor` (shared by PAY-01, SAL-02 immediate payment, SAL-07): starts with one line `{ mode: lastUsed, amount: <default>, reference }`; **+ Add mode** adds a line (max 4); each line has `MLToggleGroup mode` (six modes), `UbMoneyInput amount`, `MLInput reference` (shown for upi/bank/cheque/card).
2. FR-2 Total = Σ lines, displayed live in the drawer footer; when the context has a due amount, the last line's amount defaults to `due − Σ others` (**Fill remaining** action on each line).
3. FR-3 Payload `mode_breakup: [ { mode, amount, reference? } ]`; server derives `amount` and `primary_mode`; `reference` at payment level = the first non-empty line reference.
4. FR-4 Each mode may appear at most once per payment (two UPI lines → merge prompt "Combine into one UPI line?").
5. FR-5 Cashbook (EXP-03) and day book expand `mode_breakup` via `jsonb_to_recordset` so each mode line is a row with the receipt number.
6. FR-6 Receipt (PAY-04) prints a "Paid by" block listing each mode with reference.
7. FR-7 The payments list shows `primary_mode` with a "+1" chip when more than one mode; the detail drawer lists all.

#### 5. Non-Functional Requirements
Line add/remove without layout jump on mobile; amounts recomputed with `decimal.js-light`; keyboard: Tab through mode → amount → reference → next line. Hindi mode labels: नकद (cash), UPI, बैंक (bank), चेक (cheque), कार्ड (card), अन्य (other).

#### 6. User Flow
Primary: Record payment (due ₹1,000) → line 1 UPI ₹700 UTR → **+ Add mode** → line 2 defaults Cash ₹300 (remaining) → Save → receipt shows "UPI ₹700 (UTR…) · Cash ₹300".
Alternate A: user edits line 2 to ₹350 → total ₹1,050 → allocations panel shows ₹50 advance hint.
Alternate B: remove line 2 → total ₹700.
Alternate C: two UPI lines → prompt to combine → merges amounts, keeps both references joined by ", ".

#### 7. UI Requirements
`PaymentModeEditor` (feature `payments/components/PaymentModeEditor.tsx`, promoted to `Ub*` only if a third consumer appears): `MLCard` sunken; rows in a compact grid (mode chips wrap to 2 rows on mobile); `MLIconButton` remove (hidden when one line); footer "Total ₹1,000". Reference input `ds-mono`, placeholder by mode ("UTR", "Cheque no.", "Last 4 digits", "Bank ref").

#### 8. UX Requirements
Keys: `payments.mode.add` "Add mode", `payments.mode.fillRemaining` "Fill remaining ₹{amount}", `payments.mode.total` "Total", `payments.mode.duplicate` "Combine into one {mode} line?", `payments.mode.cash` "Cash", … Defaults: first line mode = last used per device; cash reference hidden. No confirmations.

#### 9. States
Single line (default) · Multi-line · Line error (amount ≤ 0, over max lines) · Duplicate-mode prompt · Read-only (detail/receipt view lists lines).

#### 10. Validation Rules
`paymentModeBreakupSchema`: array 1–4 items; each `mode ∈ {cash, upi, bank, cheque, card, other}`, `amount > 0` 2 dp ("Enter an amount"), `reference ≤ 64`; modes unique ("Each mode once"); Σ must equal `amount` when `amount` provided separately ("Modes must add up to ₹{amount}"). Server: 400 `validation_error` `details.mode_breakup[i].amount` / `details.mode_breakup: ["modes must be unique"]`.

#### 11. Business Rules
1. BR-1 `amount = Σ mode_breakup.amount` (server computes; a client-sent `amount` mismatch → 400).
2. BR-2 `primary_mode = argmax(amount)`, ties → first line.
3. BR-3 Cashbook classification: `cash` → Cash column; `upi|bank|card|cheque` → Bank column; `other` → Other (EXP-03 BR-2).
4. BR-4 Ledger entry `payment_mode = primary_mode` (single value column) — the full breakup lives on the payment; statements show "UPI +1".
5. BR-5 Max 4 lines (jsonb stays small and the receipt readable).

#### 12. Permissions
Same as PAY-01 (`payments.payment.write`).

#### 13. Edge Cases
1. EC-1 Cheque line → reference required? No — optional at MVP (PDC tracking later); warning caption "Add cheque number for reconciliation".
2. EC-2 Immediate payment on invoice with split lines exceeding grand total → allowed (advance) for party invoices; for walk-in → 400 (must equal grand total).
3. EC-3 Line amount `0.00` left after removing content → treated as empty; Save blocked with message on that line.
4. EC-4 Rounding of ₹0.5 coin adjustments → user adds `other` line or invoice round-off handles it (SAL-02); no auto rounding here.

#### 14. API Requirements
Uses `POST /payments` `mode_breakup[]` (Part 22 §22.9) and `POST /sales/invoices` `payment.mode_breakup[]`. Cashbook `GET /reports/cashbook` returns mode-level rows. Frontend: `paymentDisplay.ts` (`sumModes`, `primaryMode`, `modeLabel`), `useLastPaymentMode()` hook (localStorage).

#### 15. Database Impact
`payments_payment.mode_breakup jsonb`, `primary_mode`, `reference`. Query path for cashbook uses `jsonb_to_recordset(mode_breakup)`; index `IX(tenant_id, payment_date DESC)` suffices.

#### 16. Audit Requirements
Included in `payment.recorded` snapshot.

#### 17. Notifications
Receipt (PAY-04) lists modes.

#### 18. Analytics / Event Tracking
Included in `ub.payments.recorded` (`modes_count`, `primary_mode`); `ub.payments.mode_line_added` `{ index }`.

#### 19. Security
Jsonb validated against a fixed schema server-side (keys whitelist: `mode`, `amount`, `reference`); no free-form keys stored.

#### 20. Performance
Negligible; jsonb expansion in reports uses `LATERAL` over paginated payments.

#### 21. Testing
T-PAY-02-1 (unit) Σ lines → amount; primary mode argmax; tie rule. T-PAY-02-2 (unit) duplicate modes → 400. T-PAY-02-3 (unit) 5 lines → 400. T-PAY-02-4 (selector) cashbook splits ₹700 UPI / ₹300 cash into Bank/Cash columns. T-PAY-02-5 (component) add/remove lines, fill remaining, duplicate prompt merge. T-PAY-02-6 (E2E) split payment → receipt shows two modes.

#### 22. Acceptance Criteria
- AC-1 (US-PAY-02-1) Given a ₹1,000 due, when I record UPI ₹700 (UTR123) + Cash ₹300, then one payment with `amount=1000.00`, `primary_mode=upi`, two `mode_breakup` lines exists and one ledger credit ₹1,000 with `payment_mode=upi`.
- AC-2 (US-PAY-02-2) Given that payment, when I open the cashbook for the day, then Bank in shows ₹700 and Cash in shows ₹300 both referencing RCT/26-27/0017.
- AC-3 (US-PAY-02-3) Given I typed ₹700 on line 1, when I add a line, then it prefills ₹300 and the footer total reads ₹1,000.

#### 23. Dependencies
PAY-01, SAL-02/07, EXP-03, PAY-04.

#### 24. Future Enhancements
PAY-09 cheque tracking (clear/bounce per line); PAY-06 lines auto-created from aggregator captures; card MDR fee capture.

### PAY-03 — UPI static QR & intent link

#### 1. Business Objective
Let customers pay the shop instantly by scanning a QR or tapping a link — built entirely locally from the tenant's VPA (no aggregator, no fee, no external QR service): a static QR for the counter and invoice, and dynamic intent links/QRs with amount and reference for statements, reminders, invoices and receipts. Measured by: QR rendered on 100 % of invoices/statements for tenants with a VPA; QR decodes correctly on GPay/PhonePe/Paytm/BHIM in QA; zero calls to third-party QR services.

#### 2. User Personas
Owner (OW) configures VPA and prints the counter QR; Customer (CU) scans/taps; Staff (ST) shows the dynamic QR on the phone screen at the counter.

#### 3. User Stories
1. US-PAY-03-1 — As an owner I want to enter my UPI ID once and have a QR appear on every bill and statement so that customers can pay without asking for my number.
2. US-PAY-03-2 — As staff I want to show a "Collect ₹898" QR on my screen so that the customer scans the exact amount.
3. US-PAY-03-3 — As a customer I want a tappable UPI link in the WhatsApp reminder so that I can pay from the chat.
4. US-PAY-03-4 — As an owner I want a printable A5 counter QR with my logo and name so that I can stick it at the till.

#### 4. Functional Requirements
1. FR-1 Tenant profile (PLT-07) field `upi_vpa` validated (BR-1) with a live preview QR; Settings → Payments shows **Counter QR** (print) and toggle `documents.show_upi_qr` (default on).
2. FR-2 Server module `payments/upi.py`: `build_upi_intent(vpa, payee_name, amount=None, note=None, ref=None) -> str` produces `upi://pay?pa=<vpa>&pn=<name>[&am=<2dp>]&cu=INR[&tn=<note>][&tr=<ref>]` with every value URL-encoded via `urllib.parse.quote(value, safe='')` (spaces → `%20`, `&` → `%26`); parameter order fixed as listed; `pn` truncated to 50 chars, `tn` to 50 chars, `tr` to 35 alphanumerics/`-`.
3. FR-3 Server module `payments/qr/` — in-house QR encoder (`encoder.py`: QR Model 2, byte mode, error-correction level M, versions 1–10 auto-selected, mask auto-selected per ISO/IEC 18004 penalty rules; `svg.py`: renders modules as a single `<path>` in an SVG with `shape-rendering="crispEdges"`, quiet zone 4 modules, `viewBox` square, optional centre logo slot left empty). No third-party library (ADR-021); `segno` is offered as an alternative in CCR-15 if the team prefers not to maintain the encoder.
4. FR-4 `GET /payments/qr.svg?amount=&note=&ref=` → `image/svg+xml` of the intent built from the tenant VPA (auth required; cached by query string for 10 min, `Cache-Control: private`). 409 `upi_vpa_missing` (CCR-2) when no VPA.
5. FR-5 `POST /payments/upi-intent { amount, note, party_id?, document_id? }` → `{ upi_url, web_url, qr_svg_url }` where `web_url` = the public document page when `document_id` is given (`/d/<token>`, created if missing), else `null` at MVP (CCR-16 notes P2 `/p/<code>`); `tr` = `INV-<number sans slashes>` for documents, `PTY-<short id>` for party collections, `RM-<reminder short>` for reminders.
6. FR-6 Frontend `UbQrCode` renders the SVG string inline (`dangerouslySetInnerHTML` is **not** used; the SVG path data `d` and `viewBox` are returned by `GET /payments/qr.svg?format=json` (CCR-6) and drawn with React `<svg><path d=…/></svg>`), sizes 96/128/192/256 px, optional caption.
7. FR-7 Placement: invoice A4/thermal (SAL-03) footer with `am=grand_total`, `tn="INV <number>"`; statement footer (LED-04) with `am=closing`; receipt (PAY-04) shows static QR (no amount) with "Pay next time"; reminders (LED-06/07) embed `upi_url` text; party page **Collect ₹** action opens `CollectQrSheet` with editable amount and the dynamic QR full-screen with brightness hint.
8. FR-8 **Counter QR** print view `CounterQrPrintView` (A5): logo, trade name, VPA in `ds-mono`, static QR 60 mm, "Scan any UPI app to pay" in English and Hindi, tenant `doc_footer`.
9. FR-9 "I received it" shortcut on `CollectQrSheet`: **Mark received** → opens PAY-01 drawer preset mode UPI, amount, reference field focused (UTR) — the MVP reconciliation fallback (research §C.2).
10. FR-10 On phones, `upi_url` is also offered as an `<a href="upi://pay?…">` "Open UPI app" button (intent handoff); desktop shows QR only.

#### 5. Non-Functional Requirements
QR generation ≤ 5 ms per code (pure Python; payload ≤ 200 chars → version ≤ 8). SVG ≤ 6 KB. Renders crisply at 96 px on 320 dpi phones. QR must scan under GPay, PhonePe, Paytm, BHIM (QA matrix). Static QR payload contains only `pa`, `pn`, `cu` so it never expires. Accessibility: `role="img"` with `aria-label="UPI QR to pay ₹898 to Sharma Store"`.

#### 6. User Flow
Primary (counter): party page → **Collect ₹** → sheet with amount prefilled = receivable → **Show QR** → customer scans → pays → staff taps **Mark received** → PAY-01 drawer (UPI, amount, UTR) → Save.
Alternate A (invoice): invoice PDF footer QR with exact amount → customer scans → owner records payment later from the invoice page.
Alternate B (reminder): WhatsApp text contains `upi://pay?pa=…&am=2800.00…` → customer taps → UPI app opens with amount locked.
Alternate C (no VPA): footer QR absent; Settings shows "Add your UPI ID to show a QR on bills" `UbEmptyState` with CTA.
Alternate D (invalid VPA): validation error "Enter a valid UPI ID like name@bank".

#### 7. UI Requirements
`UbQrCode` (design-system): props `{ path: string; modules: number; size: 96|128|192|256; caption?: string; label: string; className? }`; renders `<svg viewBox="0 0 {modules+8} {modules+8}">` with white background rect and a black `<path>`; below it optional caption (`ds-caption`). `CollectQrSheet` (`UbDrawer` full-height on mobile): `UbMoneyInput amount`, `MLInput note`, QR 256 px centred, "Sharma Store · sharma@upi" beneath, buttons **Open UPI app** (mobile), **Share link** (copies `upi_url` + statement link), **Mark received**. Settings `UpiSettingsCard`: VPA input with `@` hint, preview QR 128 px, **Print counter QR**, `MLSwitch` show on documents.

#### 8. UX Requirements
Keys: `payments.upi.vpa` "UPI ID", `payments.upi.vpaHint` "e.g. sharmastore@okaxis", `payments.upi.collect` "Collect ₹", `payments.upi.showQr` "Show QR", `payments.upi.scanAny` "Scan with any UPI app", `payments.upi.markReceived` "Mark received", `payments.upi.openApp` "Open UPI app", `payments.upi.counterQr` "Print counter QR", `payments.upi.missing` "Add your UPI ID to show a QR on bills". Hindi: "किसी भी UPI ऐप से स्कैन करें", "भुगतान मिल गया". QR always black on white (never themed) for scanner reliability.

#### 9. States
VPA empty (empty state) · VPA valid (preview) · VPA invalid (field error) · QR loading (skeleton square) · QR ready · QR error (fallback text "Pay to sharma@upi") · Collect sheet amount invalid (Show QR disabled) · Print view.

#### 10. Validation Rules
`upiIntentSchema` (client, for Collect sheet): `amount` > 0, ≤ 1,00,000 (NPCI per-transaction cap for P2P; caption "UPI limit ₹1,00,000") 2 dp; `note ≤ 50` chars (ASCII-safe; non-ASCII allowed but encoded). VPA (`upiVpaValidation()` in `useValidationSchemas.ts`): regex `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`; message "Enter a valid UPI ID like name@bank". Server codes: 400 `validation_error`; 409 `upi_vpa_missing`.

#### 11. Business Rules
1. BR-1 VPA stored lower-case trimmed in `platform_tenant.upi_vpa`; changing it regenerates all QRs on next render (nothing cached beyond 10 min).
2. BR-2 Intent construction (normative): `params = [("pa", vpa), ("pn", name[:50])] + ([("am", f"{amount:.2f}")] if amount) + [("cu","INR")] + ([("tn", note[:50])] if note) + ([("tr", ref[:35])] if ref)`; `upi_url = "upi://pay?" + "&".join(f"{k}={quote(v, safe='')}" for k, v in params)`. Example: `upi://pay?pa=sharmastore%40okaxis&pn=Sharma%20Store&am=898.00&cu=INR&tn=INV%2026-27%2F0042&tr=INV-26-27-0042`.
3. BR-3 Static QR = intent without `am`, `tn`, `tr`. Dynamic QR = with `am` (and `tr`).
4. BR-4 `tr` charset `[A-Za-z0-9-]`, derived by replacing `/` with `-` and stripping others; used later by PAY-06/07 for matching.
5. BR-5 QR encoding: byte mode UTF-8; EC level M; smallest version fitting; mask by minimum penalty; quiet zone 4.
6. BR-6 `documents.show_upi_qr=off` hides QRs on documents but not the Collect sheet.
7. BR-7 No payment is created by showing a QR (no callback exists); recording remains manual at MVP (PAY-01) — the sheet's "Mark received" is the bridge.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Set VPA / toggle | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Show Collect QR / intent | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |
| Mark received (PAY-01) | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |

#### 13. Edge Cases
1. EC-1 Payee name with `&` or Devanagari → encoded; some UPI apps show garbled `pn` for non-ASCII → `pn` uses tenant `legal_name` if ASCII, else transliteration-free fallback: strip to ASCII letters/digits/spaces; if empty → "Shop".
2. EC-2 Amount ≥ ₹1,00,000 → allowed in intent (merchant caps vary) but caption warns; QR still generated.
3. EC-3 GPay "unverified merchant" warning for personal VPAs → documented in help; not a defect.
4. EC-4 Note > 50 chars → truncated; document number preserved by placing it first.
5. EC-5 Very long VPA (256) → version rises to ≤ 10; still within 256 px readability.
6. EC-6 Tenant changes VPA after invoices were shared → public invoice pages render the new VPA (live), printed PDFs keep the old — acceptable; help text explains.
7. EC-7 Browser without `upi://` handler (desktop) → button hidden; QR only.

#### 14. API Requirements
- `GET /payments/qr.svg?amount=&note=&ref=&format=svg|json` → SVG or `{ path, modules, upi_url }` (CCR-6 for `format`); auth required; 409 `upi_vpa_missing`.
- `POST /payments/upi-intent { amount, note?, party_id?, document_id? }` → 200 `{ data: { upi_url, web_url, qr_svg_url } }`.
- `GET /sales/invoices/{id}/upi-intent` (Part 22 §22.7) → same shape for invoices.
- Public pages embed the QR path data in their JSON (`GET /public/d/{token}` → `upi: { upi_url, qr: { path, modules } } | null`).
- Frontend: `paymentService.getQr(params)`, `createUpiIntent(body)`; thunk `createUpiIntent` in `paymentThunk.ts`; slice `upiSlice { byKey: { upiUrl, qr, status } }`; `upiDisplay.ts` (`maskVpa`, `intentPreview`). Client never builds `upi://` strings itself except for display of a server-provided URL.

#### 15. Database Impact
Reads `platform_tenant.upi_vpa`, `name/legal_name`, `platform_tenant_setting.documents.show_upi_qr`; writes `sales_document.public_token_hash` when a share link is created for `web_url`. No new tables.

#### 16. Audit Requirements
`tenant.updated` for VPA changes (`before/after.upi_vpa`). QR renders not audited.

#### 17. Notifications
None directly; `upi_url` is embedded in LED-06/07 and PAY-04 templates.

#### 18. Analytics / Event Tracking
`ub.payments.upi_vpa_set` `{ has_vpa }`; `ub.payments.collect_qr_shown` `{ amount_bucket, source: party|invoice }`; `ub.payments.collect_mark_received` `{}`; `ub.payments.counter_qr_printed` `{}`.

#### 19. Security
VPA is business data, shown publicly by design (on public pages). QR endpoint is authenticated and tenant-scoped; public pages expose only that tenant's VPA. Encoder input length-limited (≤ 500 bytes) to avoid CPU abuse; `qr.svg` rate-limited 120/min/user. SVG generated server-side from numeric path data only — no user text inside SVG, preventing XSS via SVG.

#### 20. Performance
Pure-Python encoder with precomputed Galois tables; ≤ 5 ms; 10-minute per-tenant cache keyed by query. Public page QR embedded as path data (no second request).

#### 21. Testing
T-PAY-03-1 (unit) `build_upi_intent` exact string for the BR-2 example; encoding of `&`, space, `/`, Devanagari. T-PAY-03-2 (unit) encoder: known test vectors (e.g. "HELLO WORLD" v1-M matches reference matrix; a 180-char URL selects the expected version; every mask penalty computed) and decode round-trip using a reference decoder in tests only (dev dependency `zxing`-class tool or golden images — CI uses golden module matrices). T-PAY-03-3 (unit) VPA validator accepts `a.b-c_d@okaxis`, rejects `name@`, `@bank`, spaces. T-PAY-03-4 (API) `qr.svg` without VPA → 409; with → `image/svg+xml`, `Cache-Control: private`. T-PAY-03-5 (API) `upi-intent` with `document_id` returns `web_url` and `tr=INV-…`. T-PAY-03-6 (component) `UbQrCode` renders path and aria-label; sizes. T-PAY-03-7 (component) Collect sheet disables Show QR on invalid amount; Mark received opens PAY-01 preset. T-PAY-03-8 (E2E/manual QA) scan matrix across four UPI apps with static and dynamic codes; amount locked.

#### 22. Acceptance Criteria
- AC-1 (US-PAY-03-1) Given `upi_vpa=sharmastore@okaxis` and show-on-documents on, when an invoice for ₹898 is printed, then the footer QR decodes to `upi://pay?pa=sharmastore%40okaxis&pn=Sharma%20Store&am=898.00&cu=INR&tn=INV%2026-27%2F0042&tr=INV-26-27-0042`.
- AC-2 (US-PAY-03-2) Given Ramesh owes ₹2,800, when staff opens Collect ₹ and shows the QR, then the QR encodes `am=2800.00` and `tr=PTY-<short id>`, and Mark received opens the payment drawer with UPI ₹2,800 preset.
- AC-3 (US-PAY-03-3) Given a reminder text, when the customer taps the `upi://` link on a phone, then their UPI app opens with the payee and amount prefilled (manual QA).
- AC-4 (US-PAY-03-4) Given a VPA, when I print the counter QR, then an A5 page shows logo, name, VPA, a static QR (no amount) and bilingual instructions.

#### 23. Dependencies
PLT-07 (VPA field), WLB-01 (logo), SAL-03, LED-04, LED-06/07, PAY-04, `UbQrCode`, CCR-15 (encoder ADR option), CCR-16 (`web_url` semantics).

#### 24. Future Enhancements
PAY-06 aggregator dynamic QR with callbacks (auto-post); `/p/<code>` public pay page with app buttons (P2); NPCI signed intents (`mc`, `sign`) for verified merchants; QR with embedded logo.


### PAY-04 — Payment receipt print / share

#### 1. Business Objective
Give the customer proof of payment the moment money changes hands — a branded receipt (A5 or 80 mm thermal) printed or saved as PDF from a React print component, and shared on WhatsApp as text plus a public link that renders the same receipt — so "I paid, you did not write it" disputes end at the counter. Receipt SMS is config-gated through the SMS adapter (NTF-02). Measured by: ≥ 50 % of payments recorded at the counter are printed or shared within 60 s; receipt view renders in ≤ 1 s from cached Redux state; zero server-side PDF dependencies at MVP (ADR-014).

#### 2. User Personas
Staff (ST) prints/shares at the counter; Owner (OW) shares receipts for payments received remotely; Customer (CU) receives; Accountant (AC) reprints from the payments list.

#### 3. User Stories
1. US-PAY-04-1 — As staff I want the receipt to print automatically after I save a payment so that the customer leaves with proof.
2. US-PAY-04-2 — As an owner I want to WhatsApp the receipt to the customer with the new balance so that both sides agree.
3. US-PAY-04-3 — As a customer I want to open the receipt link and see the shop's name, what I paid and my remaining balance.
4. US-PAY-04-4 — As an accountant I want to reprint any receipt from the payments list so that I can answer queries.
5. US-PAY-04-5 — As an owner I want customers to get an SMS receipt automatically when a provider is configured so that I do not have to share manually.

#### 4. Functional Requirements
1. FR-1 React print components `ReceiptPrintA5` and `ReceiptPrintThermal80` in `features/payments/components/print/`, sharing `PrintDocumentFrame` (SAL-03) for page setup, fonts and tokens; both render from the `Payment` JSON of `GET /payments/{id}` (PAY-01 §14) plus `party_balance_after` and `allocations[].number` — the response gains `party_balance_after` (balance immediately after this payment, computed from `ledger_entry.running_balance_after` or recomputed) — CCR-17.
2. FR-2 Print route `app/(print)/print/payments/[id]/page.tsx?template=a5|thermal80` opened in a hidden iframe (desktop) or new tab (mobile), calling `window.print()` after `document.fonts.ready`; template default from tenant setting `payments.receipt_template ∈ {a5, thermal80}` (CCR-18; default `a5`, seeded `thermal80` for `business_type ∈ {retail, food}`).
3. FR-3 After `POST /payments` succeeds from a counter context (`context ∈ {invoice, walk_in}`) and setting `payments.auto_print_receipt=on` (CCR-18; default off), the client opens the print route automatically; otherwise the success snackbar offers **Print** and **Share**.
4. FR-4 **Share** opens `UbShareSheet` with: **WhatsApp** (NTF-03 deep link, template `RECEIPT_SHARE`), **Copy link**, **Save PDF** (print route → browser Save as PDF), **SMS** (visible only when `feature_flags.sms_configured`). Share link: `POST /payments/{id}/share-links { expires_in_days: 30 }` → `{ url, expires_at }` (CCR-19) creating a `parties_share_link` row with `kind='receipt'`, `params={ payment_id }` (CCR-7 generalisation); public page `/d/<token>` resolves through `GET /public/d/{token}` which returns `{ kind: "payment", payment: {…}, tenant: {…}, upi: {…} | null }` and renders `ReceiptPrintA5` read-only in `PublicDocumentPage` (SAL-14 shell, MVP subset: view + print).
5. FR-5 Walk-in payments (`party_id NULL`) have no WhatsApp/SMS target: the share sheet asks for a mobile number (`UbPhoneInput`, not persisted) for WhatsApp; SMS is hidden; the link is created without a party (`parties_share_link.party_id NULL` allowed for `kind='receipt'` — CCR-19).
6. FR-6 Receipt SMS: when setting `payments.receipt_sms_on_record=on` (CCR-18; default off) and the party has `sms_opt_in ∧ mobile`, `record_payment()` enqueues `jobs.enqueue('notifications.send_message', { template_code: 'RECEIPT_SMS', party_id, related_type: 'payment', related_id, params })` (no coalescing; one SMS per receipt). Manual resend: **SMS** in the share sheet → `POST /payments/{id}/send-receipt { channel: "sms" }` → 202 `{ message_log_id }` (CCR-19).
7. FR-7 Payment detail drawer (`PaymentDetailDrawer`, PAY-01) shows a **Messages** strip from `payment.messages[]` (`GET /payments/{id}` includes `messages: [{ channel, status, sent_at }]` — CCR-17, same shape as ledger entries CCR-6) with the LED-08 glyph tones.
8. FR-8 Voided payments render the receipt with a diagonal "VOID / रद्द" watermark and the void reason; the public link keeps working so the customer sees the void (PAY-05 FR-8).
9. FR-9 Receipts for `direction=out` (supplier payments) render as a "Payment voucher" (`PAYOUT-…`) with the same components; sharing to a supplier is allowed; the wording switches to "Paid to".
10. FR-10 The receipt for an immediate-payment invoice (SAL-02 `payment` on issue) is the invoice itself (which prints "PAID" and the receipt number); the separate receipt is still available from the payment row.

#### 5. Non-Functional Requirements
Print route ready ≤ 1 s from Redux cache, ≤ 1.5 s with fetch. Thermal template: 80 mm width, 72 mm printable, `ds-mono` for numbers, no colours, ≤ 25 lines for a single-allocation receipt. A5 template ≤ 1 page for ≤ 8 allocations; overflow → second page with repeated header. Public page LCP ≤ 2.5 s on 3G, ≤ 150 kB JS, `noindex`. Bilingual labels (EN/HI) on the receipt per tenant locale; the customer-facing public page offers a language toggle.

#### 6. User Flow
Primary (counter): PAY-01 save → 201 → auto-print on → hidden iframe loads `/print/payments/{id}?template=thermal80` → print dialog → staff confirms → slip prints; snackbar "Received ₹500 · RCT/26-27/0017 · Share".
Alternate A (remote payment): owner records UPI ₹2,800 from Ramesh → snackbar **Share** → WhatsApp → wa.me opens with "Received Rs 2,800 from you on 18/09 (UPI, UTR …123). Receipt: https://…/d/xyz. Balance Rs 0 — settled. Thank you — Sharma Store".
Alternate B (reprint): Payments list → row → detail drawer → **Print** → template choice A5/Thermal → print.
Alternate C (customer): taps link → public page shows shop header, RCT number, amount, mode, allocations "Against INV/26-27/0042 ₹500", balance after, static UPI QR "Pay next time", Print button.
Alternate D (SMS configured, setting on): SMS goes automatically; Messages strip shows "SMS sent 10:02".
Alternate E (voided later): link shows VOID watermark and reason.

#### 7. UI Requirements
`ReceiptPrintA5` layout: (1) header band — tenant logo ≤ 40 px, trade name `ds-h2`, address, phone, GSTIN `ds-mono`; right: "Payment receipt / रसीद" (or "Payment voucher / भुगतान वाउचर" for out), number `ds-mono`, date; (2) "Received from" / "Paid to" block: party name, mobile (masked on the public page: `98•••••678`), or "Walk-in customer"; (3) amount block `ds-metric-md` "₹500.00" with words line "Rupees five hundred only" (`amountInWords()` in `src/utils/money.ts`, en/hi); (4) modes table: Mode · Reference · Amount (one row per `mode_breakup` line); (5) allocations table: Bill · Date · Allocated · Bill balance; "Unallocated (advance) ₹102" row when > 0; (6) balance line: "Balance after this payment: ₹398 — You will give (आप देंगे)" tone by sign, omitted for walk-in; (7) footer: static UPI QR 96 px (`UbQrCode`, PAY-03 BR-3) with "Pay next time via UPI" when `tenant.upi_vpa ∧ documents.show_upi_qr`; `doc_footer`; "Generated by {app_name}"; signature slot when `branding.signature_attachment_id`. `ReceiptPrintThermal80`: same data, single column, centred header, dashed separators, no QR unless `documents.show_upi_qr` (then 40 mm). `ReceiptShareSheet` = `UbShareSheet` with four actions and a walk-in phone prompt. Void watermark: absolutely positioned rotated text `opacity .15`.

#### 8. UX Requirements
Keys: `payments.receipt.title` "Payment receipt", `payments.voucher.title` "Payment voucher", `payments.receipt.receivedFrom` "Received from", `payments.receipt.paidTo` "Paid to", `payments.receipt.against` "Against", `payments.receipt.advance` "Kept as advance", `payments.receipt.balanceAfter` "Balance after this payment", `payments.receipt.payNext` "Pay next time via UPI", `payments.receipt.print` "Print", `payments.receipt.share` "Share receipt", `payments.receipt.void` "VOID", `payments.receipt.walkInPhone` "Customer's WhatsApp number (not saved)". Hindi: "रसीद", "से प्राप्त", "को भुगतान", "बिल के विरुद्ध", "इस भुगतान के बाद बाकी", "रद्द". No confirmation for print/share; the snackbar after share reads "WhatsApp opened".

#### 9. States
Print route: Loading (blank + skeleton, print deferred) · Ready (auto `window.print()`) · Error (404/403 → "Receipt not found" with back link) · Blocked (`window.print` unavailable → "Open print view" button, LED-04 EC-9). Share sheet: Creating link (spinner on WhatsApp/Copy) · Link ready · Error (snackbar retry) · SMS queued/sent/failed (Messages strip). Public page: loading · ready · void · expired ("This link has expired — ask {shop} for a new one", shop phone) · not found.

#### 10. Validation Rules
`receiptShareSchema`: `mobile` (walk-in only) via `mobileValidation()` "Enter a 10-digit mobile number"; `template ∈ {a5, thermal80}`. Server: `POST /payments/{id}/share-links` `expires_in_days` 1–90 (default 30) → 400 `validation_error`; 404 cross-tenant; `POST /payments/{id}/send-receipt` → 409 `channel_not_configured` (no SMS provider in production), 400 `details.party_id: ["Party has no mobile"]`, 409 `party_opted_out` (CCR-20) when `sms_opt_in=false`.

#### 11. Business Rules
1. BR-1 The receipt shows data as of the payment (amount, modes, allocations at record time) plus **live** balance-after (recomputed from the ledger at render: Σ posted entries with `(entry_date, created_at) ≤` this payment's entry); if allocations were later removed by a document void, the allocations table shows the current state with caption "Bill INV/… was voided on dd/mm".
2. BR-2 `amountInWords(amount, locale)`: Indian grouping (lakh/crore), paise rendered as "and 50 paise" when non-zero; en and hi dictionaries; pure function, unit-tested.
3. BR-3 Share link: `kind='receipt'`, expiry 30 days default (longer than statements — receipts are proof), single payment, revocable; a second share within validity reuses the link (same rule as LED-06 BR-7).
4. BR-4 WhatsApp text template `RECEIPT_SHARE` (§17) renders server-side in `POST /payments/{id}/share-links` response as `share_text` (so the client never composes amounts) and is logged as `notifications_message_log(channel='whatsapp', provider='wa_me', template_code='RECEIPT_SHARE', status='sent', related_type='payment')` only when the client confirms the WhatsApp action via `POST /payments/{id}/send-receipt { channel: "whatsapp_manual" }` → 200 `{ wa_url }` (CCR-19) — mirroring LED-06 FR-2.
5. BR-5 Receipt SMS is exactly one per payment; a void sends `RECEIPT_VOID_SMS` only if the original SMS reached `sent`/`delivered` (LED-08 BR-6 logic).
6. BR-6 Public receipt hides: notes, staff name, cost fields, other parties; shows party mobile masked.
7. BR-7 Printing/sharing never mutates the payment; only `pdf_attachment_id` may be set in Phase 2 by server PDF generation (ADR-014 P2).
8. BR-8 Thermal template hides GSTIN of the party and address lines to stay ≤ 25 lines.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Print / view receipt | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |
| Create share link / WhatsApp / SMS resend | `payments.payment.read` + `ledger.reminder.write`? **No** — `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| Change receipt settings | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Public page | token | — | — | — | — |

#### 13. Edge Cases
1. EC-1 Payment with 4 modes and 8 allocations on thermal → allocations collapse to "Against 8 bills · ₹4,200" with the first three numbers listed.
2. EC-2 Party without mobile → WhatsApp asks for a number (like walk-in); SMS hidden.
3. EC-3 Tenant logo missing → name only; signature missing → slot omitted.
4. EC-4 Public link opened after the party was archived → still renders (historical proof).
5. EC-5 Browser print in PWA standalone mode blocked → fallback new tab (LED-04 EC-9).
6. EC-6 `amount` ≥ 1 crore → words "One crore twenty lakh…" wraps to two lines; layout allows.
7. EC-7 Hindi tenant name in thermal ESC/POS-less browser printing → fonts embedded via `PrintDocumentFrame` (Noto Sans Devanagari subset).
8. EC-8 Receipt SMS enqueued, payment voided before the runner sends → job handler re-checks `status='recorded'` and marks the job `skipped`; no receipt SMS goes out.

#### 14. API Requirements
- `GET /payments/{id}` (PAY-01) + additions `party_balance_after`, `messages[]`, `share: { url, expires_at } | null` (CCR-17).
- `POST /payments/{id}/share-links { expires_in_days? }` → 201 `{ data: { url, expires_at, share_text } }` (CCR-19).
- `POST /payments/{id}/send-receipt { channel: "sms" | "whatsapp_manual", mobile? }` → `sms`: 202 `{ data: { message_log_id } }`; `whatsapp_manual`: 200 `{ data: { wa_url, text } }` (CCR-19). `mobile` accepted only when `party_id IS NULL` (walk-in) — E.164 validated, never stored.
- `GET /public/d/{token}` → `kind: "payment"` variant (CCR-19).
- `GET /payments/{id}.pdf` (Part 22 §22.9) — **Phase 2**, not mounted at MVP (CCR-19, same reasoning as CCR-8).
- Frontend: `paymentService.ts` gains `createReceiptShareLink`, `sendReceipt`; thunks `shareReceipt` (link + optional whatsapp), `sendReceiptSms` in `paymentThunk.ts`; `paymentDetailSlice { payment, status, share: { url, text, status }, messages }` (detail state split from `paymentSlice.list` so the print route and drawer share it); `receiptDisplay.ts` (`amountInWords`, `maskMobile`, `allocationSummary`).

#### 15. Database Impact
Reads `payments_payment`, `payments_allocation`, `sales_document`/`purchases_document` (numbers, status), `ledger_entry` (balance after), `platform_tenant` (branding, VPA), `platform_tenant_setting`. Writes `parties_share_link` (`kind='receipt'`, `party_id NULL` allowed — CCR-19), `notifications_message_log`, `platform_job` (receipt SMS), `platform_audit_log` (share link created).

#### 16. Audit Requirements
`payment.share_link_created` (`metadata.expires_at`), `payment.receipt_sent` (`metadata.channel`, `message_log_id`); prints are not audited.

#### 17. Notifications
- `RECEIPT_SHARE` (WhatsApp text) en: "Received Rs {amount} from you on {date} ({modes}{reference_part}). {against_line}Receipt: {link}\nBalance: Rs {balance} ({label}).\nThank you — {shop}"; hi: "{date} को आपसे Rs {amount} प्राप्त हुए ({modes}{reference_part})। {against_line}रसीद: {link}\nबाकी: Rs {balance} ({label})।\nधन्यवाद — {shop}". `modes` = "UPI" / "UPI + Cash"; `reference_part` = ", UTR …{last4}" when a reference exists; `against_line` = "Against {numbers}.\n" when allocated; `label` per LED-08 BR-2 ("settled"/"बराबर" at 0).
- `RECEIPT_SMS` (DLT Service-Implicit) en: "{shop}: Received Rs {amount} on {date} ({mode}). Receipt no {number}. Balance Rs {balance} ({label}). -{shop}"; hi: "{shop}: {date} को Rs {amount} प्राप्त ({mode})। रसीद {number}। बाकी Rs {balance} ({label})। -{shop}".
- `RECEIPT_VOID_SMS` en: "{shop}: Receipt {number} of Rs {amount} dated {date} has been cancelled. Balance Rs {balance} ({label}). -{shop}"; hi: "{shop}: {date} की रसीद {number} (Rs {amount}) रद्द की गई। बाकी Rs {balance} ({label})। -{shop}".
- Payment vouchers (`direction=out`) use `VOUCHER_SHARE` en: "Paid Rs {amount} to you on {date} ({modes}{reference_part}). {against_line}Voucher: {link}\nBalance: Rs {balance} ({label}). — {shop}" (hi analogous). No in-app notifications.

#### 18. Analytics / Event Tracking
`ub.payments.receipt_printed` `{ template, auto: bool, context }`; `ub.payments.receipt_shared` `{ channel: whatsapp|copy|pdf|sms, direction, walk_in: bool }`; `ub.payments.receipt_public_viewed` (server) `{ locale }`; `ub.payments.receipt_sms_result` (server) `{ status, template_code }`.

#### 19. Security
Public page token hashed (`token_hash`), 32-byte URL-safe, expiry enforced, 60 req/min/token; party mobile masked; no staff names; `noindex`; CSP without provider SDKs at MVP. Walk-in mobile used for one wa.me URL and discarded (not logged in payload — `to_address` stored as digits only, which is the minimum needed for the message log; documented as processed on the merchant's instruction). Print route requires auth and tenant scope; cross-tenant → 404.

#### 20. Performance
Detail payload ≤ 6 KB; print components pure/memoised; QR path from PAY-03 cache; share-link creation one insert; public GET cached 60 s in-process per token.

#### 21. Testing
T-PAY-04-1 (unit) `amountInWords` en/hi for 0.50, 500, 1,00,000, 1,23,45,678.05. T-PAY-04-2 (unit) `RECEIPT_SHARE` render with/without reference, allocations, walk-in. T-PAY-04-3 (API) share link creates `parties_share_link(kind=receipt)`; reuse within validity; walk-in with `party_id NULL`. T-PAY-04-4 (API) public GET returns `kind=payment`, masked mobile, void watermark flag after void. T-PAY-04-5 (API) `send-receipt sms` with console backend in DEBUG → 202 + `skipped`; production → 409; opted-out party → 409 `party_opted_out`. T-PAY-04-6 (unit) receipt SMS job skips when payment voided before send. T-PAY-04-7 (component) `ReceiptPrintA5` snapshot for in/out/walk-in/void; thermal collapses > 3 allocations. T-PAY-04-8 (component) share sheet hides SMS without provider; walk-in phone prompt. T-PAY-04-9 (E2E) record → auto print (spy `window.print`) → share WhatsApp (stubbed open) → message_log row. T-PAY-04-10 (permission) accountant can print, cannot share (403).

#### 22. Acceptance Criteria
- AC-1 (US-PAY-04-1) Given `payments.auto_print_receipt=on` and template thermal80, when staff saves a ₹500 UPI payment from the invoice page, then the print route opens and `window.print()` is called once with a slip showing RCT/26-27/0017, "UPI · UTR …123", "Against INV/26-27/0042 ₹500" and "Balance ₹398 — You will give".
- AC-2 (US-PAY-04-2) Given the same payment, when I tap Share → WhatsApp, then a `wa.me/91…?text=` URL opens whose decoded text contains "Rs 500", "18/09", "UPI", a `/d/` link and "Balance: Rs 398", and a message_log row `template_code=RECEIPT_SHARE` exists.
- AC-3 (US-PAY-04-3) Given that link, when the customer opens it, then the receipt renders with shop name, masked mobile, amount in words and the static UPI QR; after the payment is voided the same link shows the VOID watermark and reason.
- AC-4 (US-PAY-04-4) Given the payments list, when the accountant opens RCT/26-27/0017 and taps Print → A5, then the print route renders the A5 receipt.
- AC-5 (US-PAY-04-5) Given `payments.receipt_sms_on_record=on`, a fake provider and Ramesh opted in, when a payment is recorded, then within 90 s a message_log `sent` exists with body matching `RECEIPT_SMS` and the detail drawer shows "SMS sent".

#### 23. Dependencies
PAY-01/02/03, PAY-05 (void watermark), SAL-03 (`PrintDocumentFrame`), SAL-14 (public page shell), LED-04 (share links CCR-7), NTF-02/03, WLB-01, `UbShareSheet`, `UbQrCode`, CCR-17/18/19/20.

#### 24. Future Enhancements
Server PDF (`GET /payments/{id}.pdf`, `pdf_attachment_id`) for automated WhatsApp/email attachments (NTF-05/06); receipt email (NTF-06); customer portal listing receipts (PTY-09); ESC/POS direct printing via Capacitor (Phase 3).

### PAY-05 — Void payment

#### 1. Business Objective
Undo a wrongly recorded payment without deleting history: the payment keeps its number, becomes `void` with a reason, its allocations are removed so the bills reopen, and the ledger gets a reversing entry — all in one transaction, so the khata, the bill statuses, the cashbook and the receipt link agree. Measured by: zero orphaned allocations or ledger entries after void (integrity job); void P95 ≤ 300 ms; every void carries a reason.

#### 2. User Personas
Owner/Admin (OW) with `payments.payment.void`; Staff (ST) can only request ("Ask owner to void"); Accountant (AC) reads void history; Customer (CU) may receive a cancellation SMS/updated receipt.

#### 3. User Stories
1. US-PAY-05-1 — As an owner I want to void a payment recorded against the wrong customer so that both khatas become right, then record it again correctly.
2. US-PAY-05-2 — As an owner I want the bills that were marked paid to reopen automatically when I void the payment.
3. US-PAY-05-3 — As an accountant I want voided receipts to stay visible with their reason so that the receipt series has no gaps.
4. US-PAY-05-4 — As an owner I want a bounced cheque to be reflected as a voided payment with reason "Cheque bounced" so that the customer's balance goes back up.

#### 4. Functional Requirements
1. FR-1 **Void** action in `PaymentDetailDrawer` (⋯ menu, destructive outlined) and payments-list row menu; visible only with `payments.payment.void` and `status='recorded'`; staff see **Ask owner to void** which copies a prefilled message ("Please void RCT/26-27/0017 ₹500 — reason: …") to the clipboard (no server action at MVP).
2. FR-2 Tapping Void opens `UbReasonDialog` titled "Void RCT/26-27/0017?" with a reason (`reasonValidation()`, 3–160 chars), quick-reason chips (**Wrong party**, **Wrong amount**, **Duplicate**, **Cheque bounced**, **Refunded**) and a consequences list computed from the payment: "Ledger: Ramesh Traders +₹500 (You will get)", "INV/26-27/0042: Partially paid → Issued, due ₹898", "Cashbook: UPI −₹500 on 18/09", "Receipt link will show VOID".
3. FR-3 Confirm → `POST /payments/{id}/void { reason }` → 200 `{ data: Payment(status=void), meta: { party_balance, documents: [ { id, status, amount_due } ], reversal_entry_id } }`.
4. FR-4 Server `payments.services.void_payment(payment, reason, actor)` in one `transaction.atomic()`: lock payment `FOR UPDATE`; assert `status='recorded'` else 409 `payment_already_void` (CCR-20); lock allocated documents in id order; for each allocation: `document.amount_paid −= amount`, recompute `amount_due` and status (`paid → partially_paid | issued/recorded`; overdue flag by `due_on < today`), delete the `payments_allocation` row; set `payment.status='void'`, `voided_at=now`, `void_reason=reason`, `unallocated_amount=0`; call LED-10 `reverse_source_entries(source_type='payment', source_id, reason)` → `reversal` entry (opposite direction, `entry_date=today`, LED-10 BR-5/6); update party caches; audit; enqueue `RECEIPT_VOID_SMS` if PAY-04 BR-5 applies; if the payment was created from a `payments_request` (P2) set the request `matched_payment_id NULL` and status `unmatched` so it re-enters PAY-07 (BR-8).
5. FR-5 Walk-in payments (`party_id NULL`): void deletes allocations → the walk-in invoice becomes `issued` with `amount_due = grand_total` — the UI warns "This was a walk-in cash sale. Voiding the payment leaves the bill unpaid with no customer to collect from; consider voiding the invoice instead (SAL-05)"; allowed (owner decides).
6. FR-6 Immediate-payment invoices (SAL-02 payment on issue): void of the payment is allowed and the invoice reopens; the invoice print shows "PAID" no longer (status-driven); the ledger retains the invoice debit and shows the payment credit + reversal.
7. FR-7 Void is terminal: no un-void; the correct payment is re-recorded (PAY-01) — the dialog's success snackbar offers **Record again** which opens `PaymentDrawer` prefilled with the voided payment's party, amount, modes and allocations (allocations re-validated against current dues).
8. FR-8 Voided payments stay in the list under tab **All** and filter `status=void` (CCR-6 `status` param), rendered with strike-through number and `UbStatusBadge` "Void"; the receipt (PAY-04) renders the watermark and reason; the party timeline shows the original credit and the reversal debit "Reversal of RCT/26-27/0017 (voided: Wrong party)".
9. FR-9 Voiding is blocked when the payment's `payment_date` falls in a locked period (`platform_tenant_setting.books.locked_until` — Phase 2 accounting; **not at MVP**, noted §24).
10. FR-10 Credit-note refund payments (`direction=out` created by SAL-04 `settlement=refund`) can be voided here; the credit note then shows "Refund voided" and its `applied` status recomputes (SAL-04 owns that rule).

#### 5. Non-Functional Requirements
P95 ≤ 300 ms with ≤ 10 allocations; dialog consequences computed client-side from cached payment data (server authoritative); `UbReasonDialog` keyboard-accessible; Hindi copy for reasons and consequences.

#### 6. User Flow
Primary: Payments → RCT/26-27/0017 → ⋯ → **Void** → dialog lists consequences → chip **Wrong party** → reason "Wrong party — was Suresh" → **Void payment** → 200 → drawer shows status Void, reason, "Voided by Owner · 18/09 11:40"; snackbar "Voided RCT/26-27/0017 · Record again" → opens drawer prefilled → change party to Suresh → Save.
Alternate A (bounced cheque): payment with mode cheque → Void → chip **Cheque bounced** → balance back to ₹2,800; LED-06 Remind offered in snackbar ("Remind Ramesh").
Alternate B (already void by another admin): 409 → drawer refreshes and shows Void.
Alternate C (staff): ⋯ shows **Ask owner to void** → clipboard text + snackbar.

#### 7. UI Requirements
`VoidPaymentDialog` = `UbReasonDialog` with `ConsequencesList` (`MLItem` rows with icons `BookOpen` ledger, `FileText` documents, `Wallet` cashbook, `Link` receipt); quick-reason `MLBadge` chips (tap fills the reason); destructive outlined confirm "Void payment" (Koper: danger outlined). Detail drawer void state: header badge, grey `ds-caption` "Voided by {name} · {when} · {reason}". List: strike-through `ds-mono` number, tone `neutral`.

#### 8. UX Requirements
Keys: `payments.void.title` "Void {number}?", `payments.void.desc` "This cannot be undone. The receipt keeps its number and shows as void.", `payments.void.reason.wrongParty` "Wrong party", `.wrongAmount` "Wrong amount", `.duplicate` "Duplicate", `.chequeBounced` "Cheque bounced", `.refunded` "Refunded", `payments.void.consequence.ledger` "{party}: {delta} ({label})", `.document` "{number}: {from} → {to}, due {amount}", `.cashbook` "Cashbook: {mode} {delta} on {date}", `.receipt` "Receipt link will show VOID", `payments.void.done` "Voided {number}", `payments.void.recordAgain` "Record again", `payments.void.askOwner` "Ask owner to void", `payments.void.walkInWarning` "This was a walk-in sale…". Hindi: "रद्द करें", "गलत पार्टी", "गलत रकम", "डुप्लिकेट", "चेक बाउंस", "वापसी". Red-ish destructive tone only on the confirm button; consequences neutral.

#### 9. States
Dialog: Initial (consequences loaded from cache) · Reason invalid (button disabled, helper) · Submitting (spinner) · Success (closes; drawer void state) · Error 409 `payment_already_void` (info banner, refresh) · Error 409 `payment_request_linked`? **No** — linked requests are handled in FR-4; error network (retry) · Disabled (no permission: action hidden; staff alternative shown).

#### 10. Validation Rules
`voidReasonSchema = { reason: reasonValidation() }` ("Give a short reason (3–160 characters)"). Server: 400 `validation_error` on reason; 409 `payment_already_void`; 404 cross-tenant; 403 `permission_denied`.

#### 11. Business Rules
1. BR-1 Void never deletes: `payments_payment` row stays with `status='void'`, `voided_at`, `void_reason`; the number is never reused (PAY-01 BR-7).
2. BR-2 Allocations are **deleted** (not flagged) — `payments_allocation` has no status; the audit `before` snapshot preserves them; documents' `amount_paid/amount_due/status` recomputed as PAY-01 BR-4 in reverse.
3. BR-3 Ledger: exactly one `reversal` entry per voided payment (LED-10 BR-1 idempotency), direction opposite to the original (`payment_in` credit → reversal debit; `payment_out` debit → reversal credit), `entry_date = today` (LED-10 BR-6), `note = "Reversal of {number}"`, `reason = void_reason`; the original `payment_in/out` entry becomes `status='reversed'`, `reversed_by_id` set.
4. BR-4 Cashbook (EXP-03) excludes void payments entirely (their mode lines disappear from the day they were recorded) — a void is an erasure of the cash event, unlike the ledger where the reversal is dated today. Rationale: cash in the drawer never actually moved twice; the day book (RPT-02) shows the void as an event row for traceability.
5. BR-5 Void of a payment that had `unallocated_amount > 0` simply drops the advance; the party balance moves by the full amount.
6. BR-6 Walk-in void reopens the invoice (FR-5); no ledger effect (walk-ins have none).
7. BR-7 Corrective messages: `RECEIPT_VOID_SMS` only when the original receipt SMS was `sent`/`delivered` (PAY-04 BR-5); WhatsApp is never automated at MVP — the snackbar offers **Share updated receipt**.
8. BR-8 (P2) A payment created by a PA webhook (PAY-06) can be voided by the owner only with reason chip **Refunded** or **Wrong party**; the linked `payments_request` returns to `unmatched` so the money is not lost from reconciliation; refunds themselves are executed on the provider dashboard at Phase 2 (no refund API in scope).
9. BR-9 Staff never void; there is no approval workflow at MVP (FR-1 clipboard message).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Void payment | `payments.payment.void` | ✅ | ✅ | ❌ | ❌ |
| View void payments and reasons | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |
| Record again (after void) | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |

#### 13. Edge Cases
1. EC-1 Allocated invoice was itself voided earlier → its allocation was already deleted by SAL-05; void of the payment finds fewer allocations; consequences list says "No open allocations".
2. EC-2 Allocated invoice was paid by a second payment after this one → reopening reduces `amount_paid` by this allocation only; status may remain `partially_paid`/`paid` depending on the remaining sum — recomputed, never toggled blindly.
3. EC-3 Payment recorded in a previous FY → allowed at MVP; reversal dated today (LED-10 BR-6); accountant sees both in aging/day book.
4. EC-4 Concurrent void and new allocation attempt (PAY-01 on the same invoice) → document row locks serialise; the later transaction recomputes from the committed state.
5. EC-5 Party archived after payment → void still allowed (`party_archived` applies to new entries, not reversals); balance may become non-zero → PTY archive rule flags it; UI shows "Party is archived — restore to collect".
6. EC-6 Voiding a `direction=out` supplier payment reopens the purchase bill (`paid → recorded/partially_paid`) and the supplier balance goes back negative ("You will give").
7. EC-7 Receipt SMS still `queued` when void happens → job skips (PAY-04 EC-8); no void SMS either.
8. EC-8 Reason contains only whitespace → client trims → invalid.

#### 14. API Requirements
- `POST /payments/{id}/void { reason }` (Part 22 §22.9) → 200 `{ data: Payment, meta: { party_balance, documents[], reversal_entry_id } }`; 409 `payment_already_void` (CCR-20); 404; 403.
- `GET /payments?status=recorded,void` (CCR-6).
- Frontend: `paymentService.voidPayment(id, reason)`; thunk `voidPayment` in `paymentThunk.ts` (on fulfilled: update `paymentDetailSlice.payment`, patch `paymentSlice.entities[id]`, dispatch `partyHeaderSlice` balance refresh and `invoiceListSlice` status patches from `meta.documents`); `voidConsequences(payment, documents)` in `paymentDisplay.ts` returns the consequences rows for the dialog.

#### 15. Database Impact
Update `payments_payment` (`status`, `voided_at`, `void_reason`, `unallocated_amount`); delete `payments_allocation` rows (U index); update `sales_document`/`purchases_document` (`amount_paid`, `amount_due`, `status`); insert `ledger_entry(reversal)` + update original (`status`, `reversed_by_id`); `parties_party` caches; `platform_audit_log`; `platform_job` (void SMS); P2 `payments_request` (`status`, `matched_payment_id`). Indexes: existing `IX(tenant_id, direction, status)` for the void filter.

#### 16. Audit Requirements
`payment.voided` with `before` = full payment row + allocations, `after` = void row, `metadata.reason`, `metadata.reversal_entry_id`; `invoice.status_changed`/`bill.status_changed` per reopened document (`metadata.payment_id`).

#### 17. Notifications
Party SMS `RECEIPT_VOID_SMS` (PAY-04 §17) under BR-7. In-app (NTF-01) `payment_voided` to owners when an **admin** (not owner) voids: title "RCT/26-27/0017 ₹500 voided by {name}", body reason, `data.route=/payments/{id}`; owners voiding their own get none.

#### 18. Analytics / Event Tracking
`ub.payments.void_dialog_opened` `{ direction, allocations_count, age_days_bucket }`; `ub.payments.voided` `{ direction, reason_chip: wrong_party|wrong_amount|duplicate|cheque_bounced|refunded|other, allocations_count, amount_bucket, record_again: bool }`; `ub.payments.void_failed` `{ error_code }`; `ub.payments.void_requested_by_staff` `{}`.

#### 19. Security
Permission enforced server-side (`payments.payment.void`); reason stored as text (≤ 160), rendered escaped; cross-tenant 404; audit retains the pre-void snapshot for 7 years (financial action). Rate limit default.

#### 20. Performance
Single transaction; ≤ 10 allocation rows; documents locked in id order (deadlock-safe with PAY-01); party cache update is one `UPDATE … SET balance = balance ± amount`.

#### 21. Testing
T-PAY-05-1 (unit) void reopens `paid → issued` when it was the only payment; `paid → partially_paid` when another payment remains. T-PAY-05-2 (unit) reversal entry direction/date/note; original marked `reversed`; party balance restored. T-PAY-05-3 (unit) second void → 409 `payment_already_void`. T-PAY-05-4 (unit) walk-in void → invoice `issued`, no ledger rows. T-PAY-05-5 (unit) supplier payment void → bill reopens, supplier balance negative. T-PAY-05-6 (unit) advance payment void → balance moves by full amount, `unallocated_amount=0`. T-PAY-05-7 (API) staff → 403; accountant → 403; admin → 200 + owner notification. T-PAY-05-8 (selector) cashbook excludes void payment; day book shows void event row. T-PAY-05-9 (component) dialog consequences for 2 allocations + advance; chip fills reason; disabled until valid. T-PAY-05-10 (E2E) record → void → Record again prefilled → save to other party → both statements correct. T-PAY-05-11 (integrity) `ledger.check_integrity` finds zero issues after 100 random record/void sequences (property test).

#### 22. Acceptance Criteria
- AC-1 (US-PAY-05-1) Given RCT/26-27/0017 ₹500 recorded against Ramesh (balance ₹398), when the owner voids it with reason "Wrong party", then the payment is `void` with `void_reason`, Ramesh's balance is ₹898, his statement shows the ₹500 credit struck through and a reversal debit dated today "Reversal of RCT/26-27/0017 (voided: Wrong party)", and **Record again** opens the drawer prefilled with ₹500 UPI.
- AC-2 (US-PAY-05-2) Given INV/26-27/0042 `partially_paid` (₹500 of ₹898) by that payment, when it is voided, then the invoice is `issued` with `amount_due=898.00` and no `payments_allocation` rows reference the payment.
- AC-3 (US-PAY-05-3) Given the void, when the accountant lists payments with `status=void`, then the row appears with strike-through number, badge Void and the reason in the detail drawer; the receipt link renders VOID.
- AC-4 (US-PAY-05-4) Given a cheque payment of ₹2,800 that settled Ramesh's balance, when voided with chip Cheque bounced, then the balance returns to ₹2,800, the cashbook for that day no longer shows the ₹2,800 bank inflow, and the snackbar offers Remind.

#### 23. Dependencies
PAY-01 (record, allocations), PAY-04 (watermark, void SMS), LED-10 (`reverse_source_entries`), LED-03 (`use_document_void` deep link), SAL-02/04/05, PUR-01/02, EXP-03 (exclusion), NTF-01/02, `UbReasonDialog`, CCR-20.

#### 24. Future Enhancements
Period lock (`books.locked_until`) blocking voids in closed periods (accounting module); staff void-request workflow with owner approval (Phase 3 custom roles); PA refund API tied to void (PAY-06 P2+); PDC bounce tracking (PAY-09) auto-voiding cheque payments.

### PAY-06 — Payment aggregator integration — Phase 2

#### 1. Business Objective
Let a merchant collect money digitally without the customer having to type a UPI ID or the merchant having to check a bank SMS: the app creates a **payment request** (a Razorpay order, payment link or dynamic QR) for a party/invoice, the customer pays, the provider calls back, and DigiKhaato posts a real `payments_payment` with allocations and a ledger entry — automatically, exactly once, with the receipt (PAY-04) going straight to the customer. The static UPI QR of PAY-03 proves the intent but gives no confirmation; this feature closes the loop. Measured by: ≥ 98 % of `captured` webhooks posted as payments within 120 s; zero duplicate payments across webhook retries (idempotent on `provider_payment_id`); settlement view reconciles provider payouts to the bank within ₹0.00 for ≥ 99 % of payouts; ≥ 30 % of collections on aggregator-enabled tenants come through links/QR within 2 months of enabling.

#### 2. User Personas
Owner (OW) connects the provider account, sends links, watches settlements; Staff (ST) may send a link from an invoice if permitted but never sees keys; Accountant (AC) reads the settlement view and reconciles; Customer (CU) pays on the provider page; Partner admin (PA) may pre-provision keys for a white-label deployment (WLB-06); Super admin (SA) toggles the provider globally.

#### 3. User Stories
1. US-PAY-06-1 — As an owner I want to connect my Razorpay account once so that I can collect by link and QR from inside DigiKhaato.
2. US-PAY-06-2 — As an owner I want to send a payment link for an unpaid invoice on WhatsApp so that the customer pays without me chasing cash.
3. US-PAY-06-3 — As an owner I want a dynamic QR at the counter for the exact bill amount so that the customer scans, pays, and my screen turns green by itself.
4. US-PAY-06-4 — As an owner I want the payment to appear in the khata and the bill to be marked paid without me doing anything, so that digital collection is less work, not more.
5. US-PAY-06-5 — As an accountant I want to see which collected payments have settled to the bank, with the provider fee and GST on it, so that the bank statement matches the app.
6. US-PAY-06-6 — As an owner I want a link I sent by mistake to be cancellable, and expired links to stop working, so that nobody pays twice.
7. US-PAY-06-7 — As a customer I want the payment page to carry the shop's name and the bill number so that I trust what I am paying for.

#### 4. Functional Requirements
1. FR-1 **Provider adapter layer.** `payments/providers/base.py` defines `PaymentProvider` with `create_order(amount, currency, notes) -> ProviderOrder`, `create_payment_link(amount, description, customer, expires_at, notes) -> ProviderLink`, `create_qr(amount, description, close_by, notes) -> ProviderQr`, `fetch_payment(provider_payment_id) -> ProviderPayment`, `cancel(kind, provider_id)`, `verify_webhook(raw_body, headers) -> WebhookEvent`, `list_settlements(date_from, date_to) -> list[ProviderSettlement]`. Implementations at Phase 2: `RazorpayProvider` and `NullProvider` (default, every method raises `ProviderNotConfigured`). Registry `get_provider(tenant)` resolves by `platform_tenant_setting['payments.provider'] ∈ {none, razorpay}` (CCR-21).
2. FR-2 **No vendor SDK.** `RazorpayProvider` speaks the Razorpay REST API over stdlib `urllib.request` with HTTP Basic auth (`key_id:key_secret`), a 10 s timeout, 2 retries with 250 ms/1 s backoff on 5xx and connection errors, and `hmac.new(webhook_secret, raw_body, hashlib.sha256).hexdigest()` compared with `hmac.compare_digest` against `X-Razorpay-Signature` — no new dependency is added (ADR-021 holds; recorded as ADR-022).
3. FR-3 **Credential storage.** `POST /payments/provider/connect { provider: "razorpay", key_id, key_secret, webhook_secret }` (owner only, OTP step-up per PLT-06) stores `key_id` in `platform_tenant_setting['payments.provider_config']` and `key_secret`/`webhook_secret` encrypted at rest in `platform_tenant_secret` (new table, CCR-22) using Fernet-style AES-GCM with a key from `settings.SECRET_ENCRYPTION_KEY`; secrets are **never** returned by any GET (`key_secret_set: true` only). Connection is validated by a live `GET /v1/payments?count=1` probe before saving; failure → 400 `provider_credentials_invalid` (CCR-23).
4. FR-4 **Payment request creation.** `POST /payment-requests { kind: "link"|"qr"|"order", party_id?, document_type?, document_id?, amount, description?, expires_in_hours? }` creates a `payments_request` row (`provider='razorpay'`, `status='created'`, `short_code`, `amount`, `expires_at`) then calls the provider; on success stores `provider_order_id` (order/QR id or link id) and the hosted `provider_url`/`qr_image_svg`, sets `status='pending'`, returns `{ id, short_code, url, qr_svg_url, amount, expires_at, status }`. On provider failure the row is kept with `status='failed'` and `raw_webhook.error` so the attempt is visible (409 `provider_error` with `details.provider_message`).
5. FR-5 **Short link.** Every request also gets an DigiKhaato short URL `https://<host>/p/<short_code>` served by `GET /public/p/{short_code}` which 302-redirects to the provider's hosted page after recording a view; this keeps the WhatsApp text short, survives provider URL changes, and lets the merchant cancel a link centrally (a cancelled/expired code renders a branded "This payment link is no longer active — contact {shop}" page, not a redirect).
6. FR-6 **Invoice integration.** The invoice detail page (SAL-06) and `PaymentDrawer` (PAY-01) gain **Collect online** → `PaymentRequestDialog` with amount prefilled to `amount_due`, expiry default 72 h (setting `payments.link_expiry_hours`, CCR-21), and three outcomes: **Send on WhatsApp** (NTF-03 deep link, template `PAY_LINK_SHARE`), **Copy link**, **Show QR** (full-screen `UbQrCode` rendering the provider QR payload, PAY-03 `QrFullScreen` shell reused). The dialog polls `GET /payment-requests/{id}` every 5 s while open (max 10 min) and flips to a success state the moment `status='paid'`.
7. FR-7 **Webhook endpoint.** `POST /webhooks/payments/razorpay` is unauthenticated, resolves the tenant from the `notes.tenant_id` set at creation (never from a header), verifies the signature against that tenant's `webhook_secret`, and **stores-then-acknowledges**: it writes a `payments_webhook_event` row (new table, CCR-24: `provider`, `event_id U`, `event_type`, `raw jsonb`, `signature_ok`, `status ∈ {received, processed, failed, ignored}`, `attempts`, `last_error`, `tenant_id NULL`) and returns 200 within the provider's 5 s budget. Handled event types: `payment.captured`, `payment.failed`, `payment_link.paid`, `payment_link.cancelled`, `payment_link.expired`, `qr_code.credited`, `order.paid`, `refund.processed`, `settlement.processed`. Unknown types are stored `ignored`.
8. FR-8 **Asynchronous posting without Celery.** Storing the event calls `jobs.enqueue('payments.process_webhook_event', { event_id })` writing a `platform_job` row; `python manage.py run_scheduler` (ADR-012) drains it on the next 60 s tick. The handler is idempotent: it takes an advisory lock on `(tenant_id, provider_payment_id)`, re-reads the event, and exits early if a `payments_payment` with that `provider_payment_id` already exists. Retries: `attempts < 6` with backoff 1/5/15/60/240/720 min through `platform_job.run_after`; after 6 failures the event becomes `failed` and raises an NTF-01 notification to owners. Part 22 §22.13's "process in Celery" is corrected to this mechanism (CCR-25).
9. FR-9 **Posting rule.** On a successful capture the handler resolves the target party in this order: (a) the `payments_request.party_id` when the request was created for a party; (b) a `payments_vpa_mapping` hit on the payer VPA (PAY-07 BR-3); (c) none → the payment is posted with `party_id NULL` and the request goes to `status='unmatched'` for PAY-07. It then calls the **existing** `payments.services.record_payment()` (PAY-01 FR-6) with `direction='in'`, `payment_date = provider capture date in tenant timezone`, `mode_breakup=[{"mode":"upi"|"card"|"netbanking"|"wallet", "amount": …, "reference": utr_or_payment_id}]`, `allocations` = the request's document when present else `"auto"`, `created_by=None`, `actor_type='webhook'`, and `Idempotency-Key = provider_payment_id`. The resulting payment id is written back to `payments_request.matched_payment_id`, `provider_payment_id`, `payer_vpa`, `utr`, `paid_at`, `status='paid'`.
10. FR-10 **Fees are not netted into the payment.** The gross amount hits the ledger (the customer paid ₹898); the provider fee and its GST are recorded on the request (`fee_amount`, `fee_tax_amount`, CCR-26) and become an `expenses_expense` row in category **Fees** only when the settlement is imported (FR-11), so the cashbook (EXP-03) shows gross in and fee out on the settlement date — matching the bank.
11. FR-11 **Settlement view.** `GET /payments/settlements?date_from&date_to` lists provider settlements (`payments_settlement`, CCR-27: `provider`, `provider_settlement_id U`, `settled_on`, `gross_amount`, `fee_amount`, `tax_amount`, `net_amount`, `utr`, `status`, `payments_count`) with a child list of the payments in each. A daily `manage.py sync_settlements` scheduler task (02:30 IST) pulls the previous 7 days from the provider and upserts by `provider_settlement_id`; each newly settled batch creates one `expenses_expense` (`category='Fees'`, `amount=fee_amount`, `tax_amount`, `mode='bank'`, `reference=utr`, `note='Razorpay settlement {utr}'`) under EXP-01's service API, idempotent on `reference`.
12. FR-12 **Cancel / expire.** `POST /payment-requests/{id}/cancel { reason? }` cancels at the provider (links and QRs only) and sets `status='cancelled'`; a scheduler task `expire_payment_requests` (every tick) moves `pending` rows past `expires_at` to `status='expired'` and closes the provider object. A cancelled/expired request that is nevertheless paid (race) is still posted (FR-9) and the request goes to `paid` with `meta.paid_after_cancel=true`, raising an NTF-01 notification.
13. FR-13 **Requests list.** `/payments/requests` page: `UbDataGrid` with tabs Pending · Paid · Expired/Cancelled · Failed, columns Created, Party, For (document number), Amount, Kind, Status, Age; row → `PaymentRequestDrawer` with the provider ids, the short link, a **Resend on WhatsApp** action, **Cancel**, and the linked payment when paid.
14. FR-14 **Refunds are out of scope.** Refund events are recorded on the request (`status` stays `paid`, `meta.refunds[]`) and raise an NTF-01 notification "₹500 refunded on RCT/26-27/0017 — record it manually (PAY-01, direction out)"; no refund API is called from DigiKhaato at Phase 2 (BR-9).
15. FR-15 **Kill switch.** If `platform_tenant_setting['payments.provider'] = 'none'` or the plan lacks the `payments.aggregator` entitlement, every endpoint in this feature returns 403 `module_disabled`/`plan_limit_reached` and the **Collect online** action is hidden; already-created requests remain readable.

#### 5. Non-Functional Requirements
Webhook endpoint responds P95 ≤ 200 ms (store-and-ack only) and is available independently of the app's session layer; it never queries more than the tenant lookup and one insert. Posting latency: P95 ≤ 90 s from provider capture to ledger row (one scheduler tick plus processing). Link creation P95 ≤ 1.2 s including the provider round trip; timeouts surface as a retryable error, never a half-created request. Provider outage degrades gracefully: **Collect online** shows "Online collection is temporarily unavailable — use the UPI QR (PAY-03) or record the payment manually". All provider-facing strings are English; all merchant-facing copy is en/hi. Works on 3G: the QR dialog payload ≤ 8 kB.

#### 6. User Flow
Primary (link for an invoice): Invoice INV/26-27/0042 (due ₹898) → **Collect online** → dialog shows ₹898, expiry 72 h → **Send on WhatsApp** → request created (`pending`), wa.me opens with "Pay Rs 898 for bill INV/26-27/0042 to Sharma Store: https://…/p/7kQ2mA" → customer pays → provider webhook → next tick posts payment RCT/26-27/0021, invoice `paid`, party balance 0 → owner gets NTF-01 "₹898 received from Ramesh Traders (online)" and the requests row turns Paid.
Alternate A (counter QR): **Collect online** → **Show QR** → full-screen dynamic QR for ₹898 → customer scans → within ~10 s the polling dialog flips to a green "Received ₹898" state with **Print receipt**.
Alternate B (unattached collection): owner creates a link from the Payments page with no party → customer pays → no party resolves → payment posted with `party_id NULL`, request `unmatched` → PAY-07 queue badge increments.
Alternate C (settlement): next morning the settlement job imports T-1 payout ₹4,412.30 (gross ₹4,500, fee ₹74.32, GST ₹13.38) → settlement row + one Fees expense → cashbook shows bank in ₹4,412.30 net of the fee expense line.
Alternate D (cancel): owner cancels a link sent to the wrong customer → short code page shows "no longer active".
Alternate E (failure): provider returns 401 (keys rotated) → request `failed`, banner "Reconnect your Razorpay account" on the Payments page for owners.

#### 7. UI Requirements
**Settings → Payments → Online collection** (`ProviderConnectCard`): provider `MLRadioGroup` (None / Razorpay), `UbField` Key ID, Key Secret (`type=password`, write-only, shows `••••• set` when stored), Webhook secret, read-only **Webhook URL** with a copy button, **Test connection** button, status chip Connected / Not connected / Keys invalid, and a help hint linking the provider dashboard step ("Add this URL under Settings → Webhooks and select the 8 events listed"). `PaymentRequestDialog` (`UbDialog`): `UbMoneyInput` amount (prefilled, editable down to ₹1, not above `amount_due` + tolerance ₹0), party (`UbAsyncCombobox`, read-only when opened from an invoice), description (`MLInput`, 120 chars, defaults to the document number), expiry `MLSelect` (24 h / 72 h / 7 days / No expiry), three action buttons; a live footer "Fee ≈ ₹18.85 (2 % + GST) — the customer pays ₹898, you receive ₹879.15 on settlement" using the tenant's configured fee percent (`payments.provider_fee_percent`, display only). `QrFullScreen` reused from PAY-03 with the provider QR image and a "Waiting for payment…" `MLSpinner` strip. `/payments/requests` `UbDataGrid` with `UbTabs` counts and `UbStatusBadge` tones: Pending `info`, Paid `success`, Expired/Cancelled `neutral`, Failed `danger`, Unmatched `warning`. `SettlementsPage`: `UbStatCard` row (Settled this month, Fees this month, In transit) + `UbDataGrid` of settlements; expanding a row shows its payments. Mobile: dialog is a bottom `UbDrawer`; grids become cards; the QR is full-bleed with brightness boost (PAY-03 FR-7).

#### 8. UX Requirements
Keys: `payments.online.title` "Collect online", `payments.online.connect` "Connect Razorpay", `payments.online.webhookUrl` "Webhook URL", `payments.online.testOk` "Connected — you can collect online", `payments.online.testFail` "Could not connect — check the Key ID and secret", `payments.request.title` "Payment request", `payments.request.sendWhatsapp` "Send on WhatsApp", `payments.request.showQr` "Show QR", `payments.request.waiting` "Waiting for payment…", `payments.request.paid` "Received {amount}", `payments.request.expiry` "Link valid for", `payments.request.feeNote` "Fee ≈ {fee} — you receive {net} on settlement", `payments.request.cancel` "Cancel link", `payments.request.cancelled` "Link cancelled", `payments.settlement.title` "Settlements", `payments.settlement.inTransit` "In transit", `errors.provider_not_configured` "Connect a payment provider first", `errors.provider_error` "The payment provider could not be reached — try again". Hindi: "ऑनलाइन वसूली", "व्हाट्सएप पर भेजें", "क्यूआर दिखाएं", "भुगतान का इंतज़ार…", "{amount} प्राप्त हुए", "लिंक रद्द करें", "सेटलमेंट". The fee note is always shown before creating a request so the merchant is never surprised. Colour: money-in states use `--success`; the waiting state is `--info`, never a spinner over the whole page. No confirmation to send a link; cancelling a link uses `UbConfirmDialog` (not `UbReasonDialog` — no financial state changes).

#### 9. States
Connect card: Not connected (CTA) · Validating (button spinner) · Connected · Keys invalid (danger banner + Reconnect) · Provider disabled by plan (disabled with upgrade hint). Request dialog: Initial · Creating (buttons disabled, spinner) · Created (actions live) · Waiting (polling) · Paid (green, Print receipt / Close) · Expired · Cancelled · Error (retry, request id). Requests grid: Loading skeleton · Empty first-use ("Send your first payment link") · Filtered-empty · Error. Webhook pipeline (internal, shown in the drawer): Received · Processing · Processed · Failed (with `last_error` and **Retry now** for owners). Settlements: Loading · Empty ("No settlements yet — they arrive T+2 after your first online payment") · Ready · Sync failed (stale banner with last successful sync time).

#### 10. Validation Rules
`providerConnectSchema`: `provider ∈ {none, razorpay}`; `key_id` required when razorpay, `^rzp_(test|live)_[A-Za-z0-9]{10,}$` → "Enter a valid Razorpay Key ID"; `key_secret` required on first save, 10–64 chars; `webhook_secret` 8–64 chars. `paymentRequestSchema`: `amount` via `amountValidation()` ≥ 1.00 and ≤ 500000.00 → "Enter an amount between ₹1 and ₹5,00,000"; `kind ∈ {link, qr, order}`; `expires_in_hours ∈ {24, 72, 168, null}`; `description` ≤ 120; `document_id` must belong to `party_id` when both given → 400 `details.document_id: ["This bill belongs to another party"]`. Server: 403 `provider_not_configured` (CCR-23) when no provider; 409 `provider_error` with `details.provider_message`; 409 `request_not_pending` on cancelling a paid/expired request; 400 `amount_exceeds_due` when `amount > document.amount_due` and `payments.allow_overpay_link=false`; webhook: 400 `signature_invalid` (logged, not retried), 404 when the tenant cannot be resolved (logged with the event stored `tenant_id NULL` for super-admin inspection).

#### 11. Business Rules
1. BR-1 **Exactly one payment per `provider_payment_id`.** `payments_payment` gains `provider_payment_id varchar(64) NULL` with `U(tenant_id, provider_payment_id) WHERE provider_payment_id IS NOT NULL` (CCR-26); the handler relies on the constraint, not on a read-before-write, so concurrent webhook retries collide at the database and the loser exits cleanly.
2. BR-2 The ledger amount is the **gross** captured amount; fees never reduce the party's credit (FR-10).
3. BR-3 `payment_date` is the provider's capture timestamp converted to the tenant timezone, not the webhook arrival date; a capture at 23:58 IST that arrives at 00:03 belongs to the earlier day.
4. BR-4 A request is single-use: once `paid`, further captures on the same link (Razorpay allows partial/multiple on some link types) create additional payments, each posted independently, and the request keeps `status='paid'` with `meta.extra_payments[]`; the owner is notified.
5. BR-5 Allocation follows PAY-01 BR-3: document-scoped requests allocate to that document (capped at `amount_due`), party-scoped requests allocate FIFO, and any remainder becomes an advance.
6. BR-6 Provider credentials are tenant-scoped; a partner may seed defaults at the partner level (`platform_partner.settings['payments']`) which a tenant can override but never read back.
7. BR-7 Webhook signature verification is mandatory in every environment; `DEBUG` does not bypass it (a dev fixture ships a known secret instead).
8. BR-8 The settlement fee expense is created once per `provider_settlement_id`; re-syncing the same settlement updates amounts only if the settlement is still `pending` at the provider.
9. BR-9 Refunds are informational only at Phase 2 (FR-14); a refunded collection is corrected in the book by recording a `direction=out` payment or by voiding the original (PAY-05 BR-8).
10. BR-10 A voided payment (PAY-05) releases its request back to `unmatched` so reconciliation never loses the money (PAY-05 FR-4).
11. BR-11 Amount cap ₹5,00,000 per request at MVP-of-Phase-2 to limit blast radius; raising it is a tenant setting behind super-admin approval.
12. BR-12 `short_code` is 8 characters from a 32-symbol unambiguous alphabet (no `0/O/1/I`), generated with `secrets.choice`, unique per tenant-agnostic namespace (global `U`), and rate-limited on lookup.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Connect / disconnect provider, view webhook URL | `platform.tenant.manage` + OTP step-up | ✅ | ❌ | ❌ | ❌ |
| Create payment request (link/QR) | `payments.request.write` | ✅ | ✅ | ✅ (setting `payments.staff_can_request`, default on) | ❌ |
| Cancel payment request | `payments.request.write` | ✅ | ✅ | ❌ | ❌ |
| View requests list & drawer | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |
| View settlements & fees | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Retry a failed webhook event | `platform.tenant.manage` | ✅ | ❌ | ❌ | ❌ |
| Provider webhook | signature | — | — | — | — |

#### 13. Edge Cases
1. EC-1 Webhook arrives before the `POST /payment-requests` response is committed (fast payer, slow network) → the event handler finds no request for the order id, retries with backoff, and succeeds on the second attempt; after 6 attempts it posts the payment with `party_id NULL` into PAY-07 rather than dropping it.
2. EC-2 Duplicate webhook delivery (provider retries after a 502) → `payments_webhook_event.event_id` unique → second insert ignored, 200 returned.
3. EC-3 Signature valid but the tenant has since disconnected the provider → event stored `ignored` with reason; owner notified; no payment posted.
4. EC-4 Customer pays ₹500 on a ₹898 link (partial capture allowed by the provider) → payment posted for ₹500, invoice `partially_paid`, request stays `pending` with `meta.collected=500.00` until expiry.
5. EC-5 Customer pays twice on the same link within seconds → two `provider_payment_id`s → two payments; the second becomes an advance; owner notified "Ramesh paid twice — ₹898 is an advance".
6. EC-6 The linked invoice was voided (SAL-05) between link creation and payment → payment posts as an unallocated advance on the party with a notification "Bill INV/… was cancelled; ₹898 is now an advance".
7. EC-7 Clock skew: provider capture timestamp in the future relative to the server → clamp to `now()` and log.
8. EC-8 Scheduler down for 3 hours → jobs accumulate; on restart they drain in `run_after` order; no event is lost because acknowledgement only required the store.
9. EC-9 `key_secret` rotated at the provider → first failing call sets `payments.provider_status='invalid'`, shows the reconnect banner, and suspends new request creation (existing links keep working at the provider).
10. EC-10 Two staff members open **Collect online** for the same invoice → two requests exist; whichever is paid first allocates; the other is auto-cancelled when the invoice reaches `amount_due=0` (scheduler `expire_payment_requests` also closes fully-paid documents' pending requests).
11. EC-11 QR credited by a customer for a different amount than requested (UPI QRs are editable for some flows) → posted at the actual amount; the request is `paid` with `meta.amount_mismatch=true`.
12. EC-12 Settlement contains a payment that DigiKhaato never posted (paid on the provider dashboard directly) → it appears in the settlement child list as "Not in DigiKhaato" with an **Import** action creating an unmatched payment (PAY-07).
13. EC-13 Tenant switches provider from razorpay to none while requests are pending → pending requests are marked `cancelled` by the disconnect flow after an explicit confirmation listing them.

#### 14. API Requirements
- `POST /payments/provider/connect` (owner, step-up) `{ provider, key_id, key_secret, webhook_secret }` → 200 `{ data: { provider, key_id, key_secret_set: true, webhook_url, status } }`; 400 `provider_credentials_invalid`.
- `GET /payments/provider` → `{ provider, key_id, key_secret_set, webhook_url, status, fee_percent, connected_at }`; `DELETE /payments/provider` (confirm body `{ cancel_pending: true }`).
- `POST /payment-requests` (Part 22 §22.9 Phase 2) — body per FR-4, `Idempotency-Key` required → 201 `{ data: PaymentRequest }`.
- `GET /payment-requests?status=&kind=&party_id=&date_from=&date_to=&page` → `data[]` + `meta.totals { pending_amount, paid_amount, count }`.
- `GET /payment-requests/{id}` → request + `payment` (when matched) + `events[]` (type, at, status) for the drawer.
- `POST /payment-requests/{id}/cancel { reason? }` → 200; 409 `request_not_pending`.
- `POST /payment-requests/{id}/resend { channel: "whatsapp_manual" }` → 200 `{ wa_url, text }` (NTF-03 pattern, logged in `notifications_message_log`).
- `POST /webhooks/payments/razorpay` — unauthenticated, signature-verified, 200 `{ "ok": true }` always on a stored event; rate-limited 600/min per provider IP range.
- `GET /payments/settlements?date_from&date_to&page`; `GET /payments/settlements/{id}` → settlement + `payments[]`.
- `POST /payments/webhook-events/{id}/retry` (owner) → 202.
- `GET /public/p/{short_code}` — unauthenticated 302 or branded dead-link page; 60 req/min/code.
- Frontend: `paymentProviderService.ts` (`getProvider`, `connect`, `disconnect`, `test`), `paymentRequestService.ts` (`create`, `list`, `get`, `cancel`, `resend`), `settlementService.ts`; slices `paymentRequestSlice` (list + `activeRequest` with `pollStatus`), `paymentProviderSlice`, `settlementSlice`; thunks in `paymentRequestThunk.ts`; `requestDisplay.ts` (`feePreview`, `statusTone`, `shortUrl`).

#### 15. Database Impact
New/extended: `payments_request` gains `kind varchar(8)`, `provider_url varchar(500)`, `qr_payload text`, `fee_amount numeric(14,2)`, `fee_tax_amount numeric(14,2)`, `meta jsonb` (CCR-26); `payments_payment` gains `provider_payment_id varchar(64) NULL` + `U(tenant_id, provider_payment_id) WHERE NOT NULL` and `payment_request_id` (already reserved, §21.3.9). New tables `payments_webhook_event` (CCR-24), `payments_settlement` + `payments_settlement_payment` join (CCR-27), `platform_tenant_secret` (CCR-22). Reads `platform_tenant_setting`, `payments_vpa_mapping`, `sales_document`, `parties_party`. Writes `payments_payment`, `payments_allocation`, `ledger_entry`, `expenses_expense` (fees), `platform_job`, `notifications_notification`, `platform_audit_log`. Indexes: `IX(tenant_id, status, created_at DESC)` on `payments_request`, `U(provider, event_id)` on `payments_webhook_event`, `IX(status, run_after)` on `platform_job` (existing), `U(provider, provider_settlement_id)`.

#### 16. Audit Requirements
`payments.provider_connected` / `payments.provider_disconnected` (`metadata.key_id` masked to last 4, never the secret); `payment_request.created` (`after` = amount, kind, document, expiry), `payment_request.cancelled` (`metadata.reason`), `payment_request.paid` (`actor_type='webhook'`, `metadata.provider_payment_id`); `payment.recorded` from PAY-01 with `actor_type='webhook'` and `metadata.source='razorpay'`; `settlement.imported` (`metadata.provider_settlement_id`, amounts); `webhook_event.failed` after the final attempt. Secrets are never written to audit, logs or analytics.

#### 17. Notifications
- In-app (NTF-01) `payment_received_online`: "₹898 received from Ramesh Traders (online)" · body "Bill INV/26-27/0042 is now paid" · `data.route=/payments/{payment_id}`.
- In-app `payment_request_unmatched`: "₹898 received online — tell us who paid" · `data.route=/payments/unmatched` (PAY-07).
- In-app `payment_provider_error`: "Razorpay could not be reached — reconnect your account" (owner only, deduplicated to one per 24 h).
- In-app `payment_refunded`: "₹500 refunded on RCT/26-27/0021 — record it in the book".
- WhatsApp text `PAY_LINK_SHARE` en: "Pay Rs {amount} to {shop}{for_part}: {link}\nLink valid till {expires_on}." hi: "{shop} को Rs {amount} का भुगतान करें{for_part}: {link}\nलिंक {expires_on} तक मान्य है।"; `for_part` = " for bill {number}" / " (बिल {number})".
- SMS `PAY_LINK_SMS` (DLT Service-Explicit, only when NTF-02 has a live provider) en: "{shop}: Pay Rs {amount} using {link}. Valid till {expires_on}. -{shop}".
- The receipt flow of PAY-04 fires unchanged once the payment is posted.

#### 18. Analytics / Event Tracking
`ub.payments.provider_connect_started` `{ provider }`; `ub.payments.provider_connected` `{ provider, result: ok|invalid }`; `ub.payments.request_created` `{ kind, has_document, amount_bucket, expiry_hours }`; `ub.payments.request_shared` `{ channel: whatsapp|copy|qr }`; `ub.payments.request_paid` (server) `{ kind, seconds_to_pay_bucket, matched_by: request|vpa|none }`; `ub.payments.request_cancelled` `{ age_minutes_bucket }`; `ub.payments.webhook_received` (server) `{ event_type, signature_ok }`; `ub.payments.webhook_failed` (server) `{ event_type, attempts, error_class }`; `ub.payments.settlement_imported` (server) `{ payments_count, fee_ratio_bucket }`. No VPAs, mobiles, names or ids of natural persons in properties.

#### 19. Security
Secrets encrypted at rest and write-only over the API; decryption happens in the provider adapter only. Webhook endpoint is exempt from session auth and CSRF but enforces: HMAC-SHA256 with constant-time comparison, a 5 MiB body cap, a 5-minute timestamp window where the provider supplies one, a per-IP rate limit, and tenant resolution from signed `notes`, never from user-supplied headers (Part 22: `X-Tenant-Id` is not trusted). Raw webhook bodies are stored for 90 days then truncated to a summary (they contain payer VPAs and card last-4 — PII minimisation under DPDP). Short codes are unguessable (40 bits) and rate-limited; the redirect target is validated against an allowlist of provider hosts to prevent open redirect. Cross-tenant request ids → 404. Provider outbound calls go to a pinned host allowlist with TLS verification on; no user-controlled URL is ever fetched. Owner-only step-up (OTP) protects credential changes because they redirect money.

#### 20. Performance
Webhook path: one indexed insert + one `platform_job` insert, no serializers, P95 ≤ 200 ms. Handler: advisory lock + unique-constraint reliance avoids table scans; `select_related('party', 'document')` on the request. Requests list paginated 25, indexed on `(tenant_id, status, created_at DESC)`; `meta.totals` computed with a single aggregate query. Polling in the dialog is capped (5 s × 120) and stops on blur; the grid does not poll. Settlement sync pages the provider API at 100 rows and upserts in batches of 100 inside one transaction per settlement.

#### 21. Testing
T-PAY-06-1 (unit) `RazorpayProvider.verify_webhook` accepts a known-good signature and rejects a tampered body. T-PAY-06-2 (unit) event handler is idempotent: processing the same `payment.captured` five times yields one `payments_payment`. T-PAY-06-3 (unit) unique constraint on `(tenant_id, provider_payment_id)` makes concurrent handlers safe (two threads, one row). T-PAY-06-4 (unit) party resolution order request → VPA mapping → none. T-PAY-06-5 (unit) gross posting: ledger credit 898.00 while fee 18.85 never touches `ledger_entry`. T-PAY-06-6 (unit) capture at 23:58 IST arriving next day books on the earlier date. T-PAY-06-7 (unit) retry backoff schedule and terminal `failed` after 6 attempts + owner notification. T-PAY-06-8 (API) `POST /payment-requests` with a stubbed provider → 201 with short code; provider 500 → 409 `provider_error` and a `failed` row. T-PAY-06-9 (API) webhook without a signature → 400, with a valid one → 200 and a stored event; unknown type → `ignored`. T-PAY-06-10 (API) connect with bad keys → 400 `provider_credentials_invalid`; secrets never appear in any GET. T-PAY-06-11 (API) permissions: staff can create a request, cannot cancel; accountant sees settlements, cannot create. T-PAY-06-12 (unit) settlement import creates exactly one Fees expense per `provider_settlement_id` across repeated syncs. T-PAY-06-13 (unit) partial capture leaves the request pending with `meta.collected`. T-PAY-06-14 (unit) paid-after-cancel posts the payment and notifies. T-PAY-06-15 (component) `PaymentRequestDialog` fee preview, expiry select, paid state transition on poll. T-PAY-06-16 (E2E) create link → simulate webhook → scheduler tick → invoice paid, ledger credit, receipt available, NTF-01 present. T-PAY-06-17 (security) open-redirect attempt on `/p/{code}` blocked; cross-tenant request id → 404.

#### 22. Acceptance Criteria
- AC-1 (US-PAY-06-1) Given an owner with valid Razorpay test keys, when they connect, then the probe succeeds, `status='connected'`, the webhook URL is displayed with a copy button, and `GET /payments/provider` never returns the secret.
- AC-2 (US-PAY-06-2) Given INV/26-27/0042 with `amount_due=898.00`, when the owner taps Collect online → Send on WhatsApp, then a `payments_request` (`kind=link`, `status=pending`, `expires_at` = +72 h) exists and wa.me opens with a text containing "Rs 898", "INV/26-27/0042" and a `/p/` short link.
- AC-3 (US-PAY-06-3) Given the same dialog with Show QR, when a `qr_code.credited` webhook for ₹898 is delivered and the scheduler ticks, then the dialog flips to "Received ₹898" within 10 s of the posting and offers Print receipt.
- AC-4 (US-PAY-06-4) Given that capture, then exactly one `payments_payment` exists with `provider_payment_id=pay_XXX`, one `payments_allocation` of ₹898 to the invoice, the invoice is `paid`, a `ledger_entry(credit, payment_in, 898.00)` exists, and Ramesh's balance is ₹0 — and re-delivering the identical webhook three times changes nothing.
- AC-5 (US-PAY-06-5) Given a provider settlement of gross ₹4,500, fee ₹74.32, GST ₹13.38, net ₹4,412.30, when `sync_settlements` runs twice, then one settlement row and exactly one Fees expense of ₹74.32 (+₹13.38 tax) exist and the settlement detail lists its payments.
- AC-6 (US-PAY-06-6) Given a pending link, when the owner cancels it, then `status='cancelled'`, the provider object is cancelled, and `/p/{code}` renders the branded dead-link page instead of redirecting; a pending link past `expires_at` reaches `expired` on the next tick.
- AC-7 (US-PAY-06-7) Given a link created from an invoice, when the customer opens it, then the provider page shows the tenant's trade name as merchant and the description contains the bill number.

#### 23. Dependencies
PAY-01 (`record_payment`, allocations), PAY-03 (QR shell, `UbQrCode`), PAY-04 (receipt after posting), PAY-05 (void releases the request), PAY-07 (unmatched queue and VPA mapping), EXP-01 (fee expense), EXP-03 (cashbook), NTF-01 (notifications), NTF-03 (WhatsApp deep link), NTF-02 (optional SMS), SAL-06 (invoice detail action), PLT-06 (OTP step-up), WLB-06 (partner-level provider defaults), ADR-012 (`platform_job` + `run_scheduler`), ADR-021/ADR-022 (stdlib HTTP client), CCR-21…CCR-27.

#### 24. Future Enhancements
Additional adapters (Cashfree, PhonePe PG, Paytm) behind the same `PaymentProvider` interface; refund initiation from the app tied to PAY-05; UPI AutoPay / e-NACH mandates for recurring collection (PAY-10); provider-hosted checkout embedded in the public document page (SAL-14); bank statement import and matching (PAY-08, Phase 3) reconciling settlements to the bank line automatically; settlement-to-bank variance alerts; per-payment fee attribution on the sales register for true margin (RPT-11).

### PAY-07 — Unmatched payments queue — Phase 2

#### 1. Business Objective
Money that arrives without a name attached — an aggregator capture from an unrecognised payer, a static-QR credit imported later, a bank line with only a UTR — must land somewhere visible instead of silently disappearing or being double-counted. This feature gives the owner one queue of "money we received but do not know whose it is", a one-tap **This is …** action that turns each row into a real allocated payment, and a learning `payer_vpa → party` mapping so the same customer is matched automatically next time. Measured by: unmatched queue age P90 ≤ 24 h; ≥ 70 % of unmatched credits auto-matched by VPA mapping after the first manual match; zero credits lost (every `payments_request` in `unmatched` resolves to `paid`+matched or is explicitly written off).

#### 2. User Personas
Owner (OW) works the queue and confirms matches; Admin (AD) same; Staff (ST) may see the queue read-only (they often know who paid) and can **suggest** a party; Accountant (AC) reads the queue and its ageing for reconciliation; Customer (CU) indirectly — their payment reaches their khata.

#### 3. User Stories
1. US-PAY-07-1 — As an owner I want a badge telling me money arrived that is not attached to any customer so that nothing sits unbooked.
2. US-PAY-07-2 — As an owner I want to tap a row, pick the customer and have the payment allocated to their oldest bills in one action.
3. US-PAY-07-3 — As an owner I want DigiKhaato to remember that `ramesh@okhdfcbank` is Ramesh Traders so that his next payment books itself.
4. US-PAY-07-4 — As an owner I want to see the payer's VPA, the amount, the time and any note the payer typed so that I can recognise who it was.
5. US-PAY-07-5 — As an owner I want to split one unmatched credit across two customers when a family pays together.
6. US-PAY-07-6 — As an owner I want to mark a credit as "not a customer payment" (my own transfer, a refund) so that it stops nagging me without corrupting the khata.
7. US-PAY-07-7 — As an accountant I want unmatched money to appear in the cashbook as received-but-unallocated so that the bank still ties out.

#### 4. Functional Requirements
1. FR-1 **What enters the queue.** A row is "unmatched" when either (a) a `payments_request` reaches `status='unmatched'` (PAY-06 FR-9 case c, or PAY-05 FR-4 releasing a voided PA payment), or (b) a `payments_payment` exists with `direction='in'`, `status='recorded'`, `party_id IS NULL` and `meta.walk_in IS NOT TRUE` — i.e. money posted without a party and not deliberately a walk-in counter sale. The queue is the union, exposed by `GET /payments/unmatched` (Part 22 §22.9 Phase 2).
2. FR-2 **Queue page** `/payments/unmatched`: `UbPageShell` + `UbDataGrid` with columns Received (date + time), Amount (`UbAmount`, success tone), Payer (VPA / masked mobile / card last-4 / "Unknown"), Note (payer's remark, truncated 40), Source (Online link · QR · Imported · Released from void), Age, and a primary row action **Match**. Tabs: **Open** (default) · **Matched today** · **Ignored**. Bulk selection enables **Match to same party** and **Ignore** (with reason).
3. FR-3 **Match drawer** (`MatchPaymentDrawer`, `UbDrawer`): header restates amount/payer/time; a **Suggestions** strip of up to 3 parties ranked by (i) exact `payments_vpa_mapping` hit, (ii) mobile fragment inside the VPA (`98…678@ybl`), (iii) name similarity between the payer name and party names (trigram ≥ 0.4), (iv) an open document whose `amount_due` equals the credit exactly; each suggestion shows the reason chip ("Paid before", "Mobile matches", "Bill ₹898 due"). Below: `UbAsyncCombobox` party picker with create-inline, an allocation block identical to PAY-01 (`auto` FIFO toggle + per-document amounts), a **Remember this payer for next time** `MLSwitch` (default on when a VPA is present), and a note field.
4. FR-4 **Match action.** `POST /payments/unmatched/{id}/match { party_id, allocations, remember_payer, note? }` (id = the payment id, or the request id prefixed `req_` — the endpoint accepts both and resolves) performs, in one `transaction.atomic()`: set `payments_payment.party_id`, recompute `unallocated_amount`, insert `payments_allocation` rows through the shared `allocate()` helper (PAY-01 FR-7) with the same invariants, post the ledger entry that was **not** posted at capture time (`payment_in`, credit, `entry_date = payment.payment_date`), update `parties_party.balance`/`last_activity_at`, update document `amount_paid/amount_due/status`, set `payments_request.status='paid'` + `matched_payment_id` when a request is involved, upsert `payments_vpa_mapping` when `remember_payer`, write audit, and enqueue the PAY-04 receipt message if the party opted in. Returns `{ data: Payment, meta: { party_balance, documents[] } }`.
5. FR-5 **No ledger entry before match.** A payment with `party_id NULL` posts **nothing** to `ledger_entry` (a ledger entry requires a party, §21.2). It is money in the cashbook (EXP-03 BR-4) and in the day book, but not in any khata. Matching is therefore an *addition*, never a correction, and needs no reversal.
6. FR-6 **Learning mapping.** `payments_vpa_mapping (tenant_id, payer_vpa U, party_id, confidence numeric(4,3), last_used_at, match_count int, source varchar(12) ∈ {manual, auto, imported})` (existing table, extended — CCR-28). On a manual match: upsert with `confidence = min(1.000, old + 0.250)` starting at 0.600, `match_count += 1`, `source='manual'`. On an automatic match (PAY-06 FR-9b): `confidence` unchanged, `match_count += 1`, `last_used_at` refreshed. A mapping is used automatically only when `confidence ≥ 0.600`; below that it is offered as a suggestion only. Changing the party for a VPA replaces the mapping and resets confidence to 0.600.
7. FR-7 **Split across parties.** The drawer's ⋯ menu offers **Split between customers**: the single unmatched payment is replaced by *n* payments (2–5) created through `record_payment()` with the split amounts and the original `provider_payment_id` suffixed `#1…#n` to keep the uniqueness constraint (BR-5), while the original row is voided with reason "Split between customers" (PAY-05 service reused, no ledger effect since it had no party). Each child gets its own allocations and receipt.
8. FR-8 **Ignore.** `POST /payments/unmatched/{id}/ignore { reason }` (owner/admin) sets `meta.unmatched_ignored = { reason, by, at }` and removes the row from **Open**. Ignored money still appears in the cashbook; the reason chips are **My own transfer**, **Refund received**, **Duplicate/test**, **Not a customer payment**, **Other**. Ignoring is reversible: **Move back to open** clears the flag.
9. FR-9 **Badge and nagging.** `GET /payments/unmatched/count` feeds a badge on the Payments nav item and a dashboard `UbStatCard` "Unmatched money — ₹1,240 (3)" in `warning` tone (RPT-01). A daily scheduler task `notify_unmatched_payments` (09:15 IST) raises one NTF-01 per tenant per day when `count > 0` and the oldest row is older than 12 h; it never sends SMS.
10. FR-10 **Staff suggestion.** With `payments.payment.read` but not `write`, staff see the queue read-only and can submit `POST /payments/unmatched/{id}/suggest { party_id, note? }` which stores `meta.suggestion` and raises an NTF-01 to owners ("Priya thinks the ₹898 at 11:04 is Ramesh Traders"); the owner's match drawer then shows that suggestion pinned at the top. No ledger effect.
11. FR-11 **Auto-match sweep.** A scheduler task `automatch_unmatched_payments` (every 15 min) re-runs the mapping lookup for open rows younger than 7 days — useful when the owner creates the mapping while working a *later* row, retroactively resolving earlier ones. It matches only on an exact VPA mapping with `confidence ≥ 0.600` and allocates `auto` (FIFO); each auto-match writes audit with `actor_type='system'` and raises NTF-01 "₹898 automatically matched to Ramesh Traders — undo".
12. FR-12 **Undo window.** An auto-matched payment can be unmatched within 24 h via `POST /payments/{id}/unmatch { reason }`: it deletes the allocations, reverses the ledger entry through LED-10 `reverse_source_entries` (because a ledger entry now exists), clears `party_id`, and returns the row to the queue. Manual matches use the same endpoint but require `payments.payment.void` (it is a financial reversal).
13. FR-13 **Party creation inline.** When the payer is a new customer, **Create "Sunita Devi"** in the combobox opens the compact PTY-01 create sheet prefilled with the payer name and, when the VPA embeds a 10-digit mobile, the mobile; on save the match continues with the new party.
14. FR-14 **Imported credits (forward-looking).** The queue is the single destination for future sources — bank statement import (PAY-08, Phase 3) and manual "money received, owner unknown" entries — so `source` is an open enum on `payments_payment.meta.unmatched_source` rather than a provider-specific column.

#### 5. Non-Functional Requirements
Queue list P95 ≤ 400 ms for 500 open rows. Suggestion computation P95 ≤ 250 ms (one indexed VPA lookup + one trigram query limited to 20 candidates + one exact-amount document query). Match transaction P95 ≤ 350 ms with ≤ 10 allocations. The page is usable one-handed on a 360 px phone: suggestions are large tap targets (≥ 44 px), the primary **Match** button is thumb-reachable in a sticky footer. Copy in en/hi; VPAs and UTRs rendered in `ds-mono`. The badge count is cached 60 s. Accessibility: suggestion reason chips are text, not colour alone.

#### 6. User Flow
Primary: badge "3" on Payments → **Unmatched** tab → row "₹898 · 11:04 · ramesh.k@okhdfcbank · 'bill payment'" → **Match** → suggestion **Ramesh Traders — Paid before · Bill ₹898 due** → tap → allocation preview "INV/26-27/0042 ₹898 → paid" → **Remember this payer** on → **Match payment** → snackbar "Matched ₹898 to Ramesh Traders · View receipt" → queue count 2.
Alternate A (no suggestion): owner types "Sunita" → picks party → auto FIFO applies ₹500 to the oldest bill, ₹340 stays advance → drawer shows "₹340 will be kept as advance" before saving.
Alternate B (new customer): **Create "Sunita Devi"** → mobile prefilled from `9812345678@ybl` → save → match continues.
Alternate C (split): family paid ₹2,000 for two brothers → ⋯ **Split between customers** → two rows ₹1,200 / ₹800 → each matched → original voided "Split between customers".
Alternate D (ignore): row "₹5,000 from my own savings account" → **Ignore** → chip **My own transfer** → row leaves Open, still in cashbook.
Alternate E (auto): next month Ramesh pays ₹1,100 by the same VPA → PAY-06 posts it matched immediately; the queue never sees it; owner gets the normal "payment received" notification.
Alternate F (staff): Priya opens the queue, taps **Suggest**, picks Ramesh → owner sees the pinned suggestion.
Alternate G (undo): auto-match was wrong → **Undo** within 24 h → allocations removed, ledger reversal, row back in queue, mapping confidence reset to 0.600 and marked `needs_review`.

#### 7. UI Requirements
`UnmatchedPaymentsPage`: `UbPageHeader` "Unmatched money" with a `UbHelpHint` ("Money that reached your account without a customer name"); `UbStatCard` strip (Open amount, Open count, Oldest age) in `warning` tone; `UbTabs` Open/Matched today/Ignored with counts; `UbDataGrid` (mobile: `UnmatchedCard` showing amount `ds-metric-sm` success, payer `ds-mono`, time, note, and a full-width **Match** button). `MatchPaymentDrawer`: header `UbAmount` ₹898 + "received 11:04 today · ramesh.k@okhdfcbank · UTR …4721"; `SuggestionList` (`MLItem` rows: `MLAvatar` initials, party name `ds-body-medium`, balance `UbAmount`, reason `MLBadge` chips, radio selection); divider "or pick someone else"; `UbAsyncCombobox`; `AllocationEditor` (shared with PAY-01) with the FIFO switch; `MLSwitch` "Remember this payer for next time" + caption "We will match ramesh.k@okhdfcbank to Ramesh Traders automatically"; note `MLInput`; sticky footer **Match payment** (primary) / **Ignore** (ghost) / ⋯ (**Split between customers**). `IgnoreDialog` = `UbReasonDialog` with the five chips. Desktop ≥ 1024 px: grid with a right drawer; suggestions render two-up. Empty state (first-use): illustration + "All money is matched" + help link; filtered-empty: "No matches today"; error: retry + request id.

#### 8. UX Requirements
Keys: `payments.unmatched.title` "Unmatched money", `payments.unmatched.help` "Money that reached your account without a customer name", `payments.unmatched.match` "Match", `payments.unmatched.matchCta` "Match payment", `payments.unmatched.suggestion.paidBefore` "Paid before", `.mobileMatches` "Mobile matches", `.amountMatches` "Bill {amount} due", `.nameMatches` "Similar name", `payments.unmatched.remember` "Remember this payer for next time", `payments.unmatched.rememberHint` "We will match {vpa} to {party} automatically", `payments.unmatched.advanceNote` "{amount} will be kept as advance", `payments.unmatched.split` "Split between customers", `payments.unmatched.ignore` "Ignore", `payments.unmatched.ignore.ownTransfer` "My own transfer", `.refund` "Refund received", `.duplicate` "Duplicate or test", `.notCustomer` "Not a customer payment", `payments.unmatched.ignored` "Moved to Ignored", `payments.unmatched.undo` "Undo", `payments.unmatched.autoMatched` "Automatically matched to {party}", `payments.unmatched.suggest` "Suggest a customer", `payments.unmatched.empty` "All money is matched". Hindi: "बिना नाम का पैसा", "मिलान करें", "पहले भुगतान किया है", "अगली बार के लिए याद रखें", "ग्राहकों में बाँटें", "अनदेखा करें", "वापस लें". Colour: amounts green (money in); the queue's own tone is `warning` (attention, not error). One primary action per view. Matching shows no confirmation dialog — it is reversible (FR-12) — but the snackbar always carries **Undo** for 10 s in addition to the 24 h endpoint.

#### 9. States
Queue: Initial/Loading (skeleton rows) · Empty first-use · Filtered-empty · Ready · Error. Row: Open · Suggested (staff suggestion pinned, `info` dot) · Matching (optimistic row with "Matching…") · Matched (row animates out, success snackbar) · Ignored (greyed in the Ignored tab) · Failed (row returns with an error chip and Retry). Drawer: Initial · Suggestions loading (3 skeleton items) · No suggestions ("We could not guess — pick the customer") · Allocation preview · Submitting · Success · Error 409 `payment_already_matched` (refresh banner) · Disabled (read-only for staff: Match hidden, Suggest shown). Badge: hidden at 0, `warning` pill at ≥ 1, "9+" above 9.

#### 10. Validation Rules
`matchPaymentSchema`: `party_id` required, uuid, must be an active, non-archived party of the tenant → 400 `details.party_id: ["Choose a customer"]` / 409 `party_archived` (LED-01 rule); `allocations` array with `document_id` uuid, `amount` via `amountValidation()` > 0 and ≤ that document's `amount_due` → "Cannot allocate more than the bill's due amount"; Σ allocations ≤ payment amount → `non_field_errors: ["Allocated amount is more than the payment"]`; `remember_payer` boolean, accepted only when a `payer_vpa` exists → otherwise ignored; `note` ≤ 255. `ignoreSchema`: `reason` via `reasonValidation()` (3–160). `splitSchema`: 2–5 parts, each ≥ ₹1.00, Σ parts = payment amount exactly → "The parts must add up to ₹{amount}". Server errors: 409 `payment_already_matched` (CCR-29), 409 `payment_not_unmatched`, 409 `payment_already_void`, 403 `permission_denied`, 404 cross-tenant.

#### 11. Business Rules
1. BR-1 A payment with `party_id NULL` has **no** ledger presence; matching creates the first and only ledger entry for it, dated `payment_date` (the day the money arrived), not the match date — the khata must reflect when the customer actually paid.
2. BR-2 Matching is idempotent per payment: the service asserts `party_id IS NULL` under `SELECT … FOR UPDATE`; a second concurrent match loses with 409 `payment_already_matched`.
3. BR-3 VPA mapping is consulted at capture time by PAY-06 FR-9 and by `automatch_unmatched_payments`; a mapping is tenant-scoped and never shared across tenants (two shops may have different Rameshes behind the same VPA only if the VPA is genuinely different; identical VPA in two tenants is two independent rows).
4. BR-4 Confidence model (FR-6) is deliberately simple and auditable: manual matches raise it, an undo resets it to 0.600 and sets `meta.needs_review=true` which suppresses auto-matching until the next manual confirmation.
5. BR-5 Split children reuse the parent's `provider_payment_id` with a `#n` suffix so `U(tenant_id, provider_payment_id)` (PAY-06 BR-1) still blocks a genuine duplicate webhook while allowing the split.
6. BR-6 Ignored money is **not** removed from the cashbook or the day book; ignoring is a workflow flag, not an accounting action. Only a void (PAY-05) removes the cash event.
7. BR-7 Allocation on match obeys PAY-01 BR-3 exactly (FIFO by `document_date` then `number`, capped by `amount_due`, remainder is an advance); nothing about allocation is re-specified here.
8. BR-8 Auto-match never creates a party and never allocates to a document whose `amount_due` differs from the credit by more than the FIFO rule allows — it uses the same `auto` path, so overpayment becomes an advance rather than being refused.
9. BR-9 A row older than 90 days with no action is auto-ignored with reason "Aged out — review in Reports" and a single NTF-01 summary per month; it is never deleted.
10. BR-10 Unmatch (FR-12) is a financial reversal: it reverses the ledger entry (LED-10), deletes allocations, recomputes document statuses, and lowers the VPA mapping's confidence; it does not void the payment (the money still arrived).
11. BR-11 The queue counts only `direction='in'`; outbound money is never unmatched (the business always knows whom it paid).
12. BR-12 Walk-in counter payments (`meta.walk_in = true`, PAY-01) are excluded by definition — they are deliberately party-less.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View unmatched queue and badge | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |
| Match a payment to a party | `payments.payment.write` | ✅ | ✅ | ❌ (setting `payments.staff_can_match`, default off) | ❌ |
| Suggest a party | `payments.payment.read` | ✅ | ✅ | ✅ | ❌ |
| Ignore / move back to open | `payments.payment.write` | ✅ | ✅ | ❌ | ❌ |
| Split between customers | `payments.payment.void` (it voids the parent) | ✅ | ✅ | ❌ | ❌ |
| Unmatch (undo a match) | `payments.payment.void`; auto-matches within 24 h also allow `payments.payment.write` | ✅ | ✅ | ❌ | ❌ |
| Manage VPA mappings | `payments.payment.write` | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 Two owners match the same row simultaneously → row lock → the second gets 409 `payment_already_matched` and the drawer refreshes showing who matched it.
2. EC-2 The chosen party is archived → 409 `party_archived` with a **Restore and continue** action (PTY-04).
3. EC-3 The credit exactly equals two different parties' open bills → both appear as suggestions with the "Bill ₹898 due" chip; no auto-match (ambiguity blocks automation — the rule requires a VPA hit, not an amount hit).
4. EC-4 VPA present but belongs to a payment app handle shared by a family (`9812345678@ybl` used by father and son) → owner turns **Remember** off; the mapping is not written; suggestions still show name/amount reasons.
5. EC-5 Payer VPA already mapped to party A, owner matches to party B → confirm dialog "ramesh.k@okhdfcbank was Ramesh Traders — change to Suresh Kirana for future payments?" with **Change** / **Just this once**.
6. EC-6 Matching a credit whose linked `payments_request` was for a now-voided invoice → the document is not allocatable; the drawer shows "Bill INV/… was cancelled" and the whole amount becomes an advance.
7. EC-7 Payment amount ₹0.00 (provider test webhook) → never enters the queue (`amount > 0` constraint) and the event is stored `ignored`.
8. EC-8 The tenant disconnects the aggregator with rows still open → the queue keeps working (the rows are ordinary payments); only new arrivals stop.
9. EC-9 Undo after the customer already received the receipt SMS → the unmatch enqueues no corrective SMS at Phase 2; the snackbar warns "The customer already got a receipt — tell them if this was wrong" (BR-10, §24 lists the corrective message).
10. EC-10 Split where the parts do not sum exactly (rounding by hand) → client-side validation blocks submission; the remainder chip shows "₹0.50 left".
11. EC-11 Auto-match runs while the owner has the drawer open → the drawer's submit gets 409 and refreshes with "Already matched to Ramesh Traders by DigiKhaato — undo?".
12. EC-12 A staff suggestion names a party the owner later archives → the suggestion renders with a "(archived)" suffix and cannot be applied without restoring.
13. EC-13 Queue with 5,000 open rows (a mis-integrated tenant) → pagination holds; the badge shows "9+"; the daily notification is still one per day.
14. EC-14 Payment arrives with a payer name but no VPA (card payment) → mapping is skipped (`payer_vpa NULL`), suggestions fall back to name similarity only.

#### 14. API Requirements
- `GET /payments/unmatched?status=open|ignored|matched_today&q&date_from&date_to&page&page_size` → `data[]` of `{ id, kind: "payment"|"request", amount, received_at, payer_vpa, payer_name, payer_mobile_masked, note, source, age_hours, suggestion?: { party_id, party_name, reasons[] }, staff_suggestion?: {…} }`, `meta.totals { open_amount, open_count, oldest_age_hours }`.
- `GET /payments/unmatched/count` → `{ data: { count, amount } }` (cached 60 s; drives the badge).
- `GET /payments/unmatched/{id}/suggestions` → up to 3 ranked suggestions with `reasons[]` and each party's `balance`, `open_documents[]`.
- `POST /payments/unmatched/{id}/match { party_id, allocations: [{document_type, document_id, amount}] | "auto", remember_payer, note? }` → 200 `{ data: Payment, meta: { party_balance, documents[] } }`; 409 `payment_already_matched`.
- `POST /payments/unmatched/{id}/ignore { reason }` → 200; `POST /payments/unmatched/{id}/reopen` → 200.
- `POST /payments/unmatched/{id}/suggest { party_id, note? }` → 201 (staff).
- `POST /payments/unmatched/{id}/split { parts: [{ party_id, amount, allocations }] }` → 200 `{ data: { payments: [...] } }`; 409 `split_amount_mismatch`.
- `POST /payments/{id}/unmatch { reason }` → 200 `{ data: Payment, meta: { party_balance, documents[] } }`; 409 `payment_not_matched`.
- `GET /payments/vpa-mappings?q&page`; `PATCH /payments/vpa-mappings/{id} { party_id }`; `DELETE /payments/vpa-mappings/{id}`.
- Frontend: `unmatchedService.ts` (`list`, `count`, `suggestions`, `match`, `ignore`, `reopen`, `suggest`, `split`, `unmatch`), `vpaMappingService.ts`; `unmatchedSlice` (`rows`, `totals`, `count`, `activeRow`, `suggestions`, `submitting`) + `unmatchedThunk.ts`; `unmatchedDisplay.ts` (`reasonChips`, `payerLabel`, `ageLabel`, `maskVpa`).

#### 15. Database Impact
Reads `payments_payment` (`party_id IS NULL` partial index — new: `IX(tenant_id, direction, payment_date DESC) WHERE party_id IS NULL AND status='recorded'`, CCR-29), `payments_request`, `payments_vpa_mapping`, `parties_party` (trigram name search, balance), `sales_document`/`purchases_document` (open dues), `platform_tenant_setting`. Writes `payments_payment` (`party_id`, `unallocated_amount`, `meta`), `payments_allocation`, `ledger_entry` (the first entry for that payment), `parties_party` (balance caches), `sales_document` statuses, `payments_request` (`status`, `matched_payment_id`), `payments_vpa_mapping` (upsert; extended columns `match_count`, `source`, `meta` — CCR-28), `notifications_notification`, `platform_job` (auto-match sweep, daily nag), `platform_audit_log`.

#### 16. Audit Requirements
`payment.matched` (`before` = `{party_id: null}`, `after` = `{party_id, allocations[]}`, `metadata.matched_by ∈ {manual, auto, split}`, `metadata.payer_vpa`); `payment.unmatched` (`metadata.reason`, `reversal_entry_id`); `payment.ignored` / `payment.reopened` (`metadata.reason`); `payment.split` (`before` = parent, `after` = child ids); `vpa_mapping.created|updated|deleted` (`before/after` party, confidence). Auto actions carry `actor_type='system'`; staff suggestions are audited as `payment.suggestion_added` with the suggesting user.

#### 17. Notifications
- In-app (NTF-01) `payment_unmatched`: title "₹1,240 received without a customer name", body "3 payments are waiting to be matched", `data.route=/payments/unmatched` — at most one per tenant per day (FR-9).
- In-app `payment_auto_matched`: "₹898 automatically matched to Ramesh Traders", body "Paid by ramesh.k@okhdfcbank", `data.route=/payments/{id}`, action **Undo**.
- In-app `payment_match_suggested`: "{staff} thinks ₹898 at 11:04 is {party}" to owners/admins.
- In-app `payment_unmatched_aged`: monthly "5 old unmatched payments were moved to Ignored — review them in Reports".
- Party-facing: none of its own; once matched, the standard PAY-04 `RECEIPT_SMS`/`RECEIPT_SHARE` path fires exactly as for a manually recorded payment (never twice — the payment had no party before, so no receipt could have been sent).

#### 18. Analytics / Event Tracking
`ub.payments.unmatched_viewed` `{ open_count_bucket, oldest_age_bucket }`; `ub.payments.unmatched_suggestion_shown` `{ reasons: [paid_before|mobile|amount|name], count }`; `ub.payments.unmatched_matched` `{ matched_by: suggestion|search|created_party, remember_payer, allocations_count, age_hours_bucket, amount_bucket }`; `ub.payments.unmatched_ignored` `{ reason_chip }`; `ub.payments.unmatched_split` `{ parts }`; `ub.payments.unmatched_auto_matched` (server) `{ confidence_bucket }`; `ub.payments.unmatched_undone` `{ was_auto: bool, hours_since_match_bucket }`; `ub.payments.vpa_mapping_changed` `{ action: create|update|delete }`. No VPAs, names or mobiles in properties (only buckets and enums).

#### 19. Security
Tenant isolation on every query and on the VPA mapping table; cross-tenant ids → 404. Payer VPAs and masked mobiles are PII: they are shown to authorised members only, never in analytics, never in URLs, masked in the list (`ram•••@okhdfcbank` expands in the drawer), and purged with the webhook raw payload after 90 days while the mapping (VPA → party) is retained as operational data with a documented DPDP purpose ("matching incoming payments"), deletable by the owner. Match/ignore/split/unmatch all enforce their codenames server-side; staff suggestions cannot mutate financial state. Rate limits: default 600/min; `POST …/match` 60/min per user to bound accidental bulk mistakes. Suggestion queries are parameterised; the trigram search uses a bound `LIMIT 20`.

#### 20. Performance
Partial index (§15) keeps the queue query on a small set regardless of total payment volume. Suggestions: one `payments_vpa_mapping` PK-style lookup, one trigram query with `LIMIT 20` over `parties_party` (GIN index exists), one indexed query on open documents by `amount_due` — total ≤ 3 queries, no N+1 (`select_related('party')`, `prefetch_related` on documents). Match transaction touches ≤ 10 documents with `FOR UPDATE` in id order (deadlock-safe with PAY-01/PAY-05). Badge count cached 60 s in-process per tenant and invalidated on match/ignore. The auto-match sweep processes at most 200 rows per tick with a bounded query and yields between tenants.

#### 21. Testing
T-PAY-07-1 (unit) a party-less payment posts no `ledger_entry`; matching posts exactly one, dated `payment_date`. T-PAY-07-2 (unit) match is idempotent under concurrency: two threads → one success, one 409 `payment_already_matched`. T-PAY-07-3 (unit) suggestion ranking order (VPA mapping > mobile fragment > exact due amount > name similarity) with a fixture of 4 parties. T-PAY-07-4 (unit) confidence model: 0.600 → 0.850 → 1.000 on repeated manual matches; undo resets to 0.600 and sets `needs_review`. T-PAY-07-5 (unit) `automatch_unmatched_payments` matches only `confidence ≥ 0.600`, skips `needs_review`, allocates FIFO, writes system audit. T-PAY-07-6 (unit) split of ₹2,000 into ₹1,200/₹800 creates two payments with `#1`/`#2` provider ids and voids the parent with no ledger effect. T-PAY-07-7 (unit) ignore keeps the row in the cashbook selector; void removes it. T-PAY-07-8 (unit) unmatch reverses the ledger entry via LED-10, deletes allocations, reopens the invoice. T-PAY-07-9 (unit) aged-out rows (> 90 days) auto-ignore once, never delete. T-PAY-07-10 (API) list/count/suggestions shapes; `meta.totals` over the filtered set. T-PAY-07-11 (API) permissions matrix: staff can list and suggest, gets 403 on match/ignore/split; accountant read-only. T-PAY-07-12 (API) matching to an archived party → 409 `party_archived`. T-PAY-07-13 (component) `MatchPaymentDrawer` renders reason chips, advance note, remember switch default by VPA presence, disabled submit until a party is chosen. T-PAY-07-14 (component) queue empty/filtered/error states and the "9+" badge. T-PAY-07-15 (E2E) PAY-06 capture without a party → queue row → match with remember → second capture from the same VPA is auto-matched and never reaches the queue. T-PAY-07-16 (E2E) auto-match → Undo within 24 h → row returns, mapping downgraded. T-PAY-07-17 (perf) 100k payments with 300 unmatched: list query ≤ 400 ms under `EXPLAIN` in CI using the partial index.

#### 22. Acceptance Criteria
- AC-1 (US-PAY-07-1) Given two payments with `party_id NULL` totalling ₹1,240, when the owner opens the app, then the Payments nav shows a `warning` badge "2", the dashboard tile reads "Unmatched money — ₹1,240 (2)", and a single NTF-01 was raised that morning.
- AC-2 (US-PAY-07-2) Given a ₹898 credit and Ramesh Traders with INV/26-27/0042 due ₹898, when the owner taps Match and accepts the top suggestion, then one `payments_allocation` of ₹898 exists, the invoice is `paid`, exactly one `ledger_entry(credit, payment_in, 898.00, entry_date = the day the money arrived)` exists, Ramesh's balance is ₹0 and the row leaves the queue.
- AC-3 (US-PAY-07-3) Given that match with **Remember this payer** on, then `payments_vpa_mapping(payer_vpa='ramesh.k@okhdfcbank', party_id=Ramesh, confidence=0.600, source='manual')` exists; when a later capture from the same VPA arrives, then PAY-06 posts it already matched and no queue row is created.
- AC-4 (US-PAY-07-4) Given a row, when it is displayed, then the amount, received time, masked VPA, payer note and source are all visible without opening the drawer, and the full VPA is shown inside the drawer.
- AC-5 (US-PAY-07-5) Given a ₹2,000 credit, when the owner splits it ₹1,200 / ₹800 between two parties, then two payments exist with their own allocations and receipts, the parent is `void` with reason "Split between customers", and the ledger shows two credits totalling ₹2,000 and no reversal (the parent never had a ledger entry).
- AC-6 (US-PAY-07-6) Given a ₹5,000 self-transfer, when the owner ignores it with chip **My own transfer**, then it disappears from Open, appears under Ignored with the reason and actor, still appears in the cashbook for that day, and **Move back to open** restores it.
- AC-7 (US-PAY-07-7) Given three open unmatched credits, when the accountant opens the cashbook (EXP-03) for that day, then the money appears as bank/UPI in with the note "Unmatched — no customer yet", so the day's closing balance matches the bank.

#### 23. Dependencies
PAY-06 (capture, `payments_request`, webhook posting), PAY-01 (`record_payment`, `allocate()`, FIFO rules), PAY-04 (receipt after match), PAY-05 (void/split semantics), LED-10 (`reverse_source_entries` for unmatch), LED-01 (party archived rule), PTY-01 (inline party create), EXP-03 (cashbook inclusion), RPT-01 (dashboard tile), NTF-01, ADR-012 (`platform_job` sweeps), `UbDataGrid`, `UbDrawer`, `UbAsyncCombobox`, `UbReasonDialog`, `UbStatCard`, CCR-28/CCR-29.

#### 24. Future Enhancements
Bank statement import (PAY-08, Phase 3) feeding the same queue with UTR-based matching and a bank-line reconciliation view; corrective customer message when a match is undone after a receipt was sent; smarter matching (payer name normalisation, learning from note text such as bill numbers typed by the payer); mapping management UI with merge/party-change bulk actions; confidence decay for mappings unused for a year; "expected payment" hints from reminders (LED-06) so a customer who was reminded yesterday ranks higher; auto-match across parties of a group (PTY-07 party groups).

## 17.4 Expenses (EXP)

### EXP-01 — Record expense

#### 1. Business Objective
Give the owner one place to capture every rupee that leaves the business that is not a supplier bill — rent, salaries, electricity, tea, transport, petrol, repairs, fees — in under 10 seconds, with an optional photo of the slip, so that the cashbook (EXP-03), the day book (RPT-02) and the eventual profit view (RPT-09) are complete rather than only recording sales. Without this, "how much did I actually make today" is unanswerable. Measured by: median record time ≤ 10 s on a mid-range Android phone; ≥ 60 % of active tenants record at least one expense per week by month 2; 0 drift between Σ `expenses_expense.amount` (status `recorded`) and the cashbook's out column.

#### 2. User Personas
Owner (OW) records most expenses and reviews the month; Staff (ST) records petty cash spends at the counter (tea, auto fare, packing material) when permitted; Accountant (AC) reads and exports for the CA, never writes; Partner admin (PA) and Super admin (SA) are not involved.

#### 3. User Stories
1. US-EXP-01-1 — As an owner I want to note "₹500 tea and snacks, cash, today" in three taps so that my daily cash tallies at closing.
2. US-EXP-01-2 — As an owner I want to attach a photo of the electricity bill so that I can find it later without keeping paper.
3. US-EXP-01-3 — As an owner I want to record rent paid to my landlord as a party so that his account also shows what I paid him.
4. US-EXP-01-4 — As a GST-registered owner I want to capture the GST on an expense so that my CA can claim input credit where it is allowed.
5. US-EXP-01-5 — As staff I want to record the auto fare I paid for a delivery so that the owner does not have to remember it.
6. US-EXP-01-6 — As an owner I want to fix a wrong expense by voiding it with a reason so that the history stays honest.
7. US-EXP-01-7 — As an accountant I want to filter and export expenses by category and month so that I can hand the CA a clean sheet.

#### 4. Functional Requirements
1. FR-1 **Entry point.** Expenses live at `/expenses` (`UbSidebar` under "Money", `UbBottomNav` → More → Expenses) with a `UbFab` **+ Expense** on mobile and a primary **Add expense** button on desktop. The global **+** quick-create sheet (PLT-12) also lists "Expense". The form opens as a `UbDrawer` (bottom on mobile, right on desktop), never a full page, so the list stays visible behind it.
2. FR-2 **Fields** (`ExpenseDrawer`, in order, single column): **Amount** (`UbMoneyInput`, autofocused, numeric keypad, required), **Category** (`UbCombobox` over `expenses_category` with the tenant's list, recent-first, create-inline → EXP-02 FR-4, required), **Date** (`UbDateInput`, chips Today/Yesterday/Pick, default today, required), **Paid by** (`MLToggleGroup` Cash · UPI · Bank · Card · Cheque · Other, default from the last expense in this session else Cash, required), **Reference** (`MLInput`, ≤ 64, shown when mode ≠ cash, optional — UTR/cheque no), **Paid to** (`UbAsyncCombobox` over parties with create-inline, optional), **Note** (`MLInput`, ≤ 255, optional), **Receipt photo** (`UbFileUpload`, optional, camera-first on mobile), and a collapsed **GST details** section (see FR-5). Sticky footer: **Save** (primary), **Save & add another** (secondary, keeps category/date/mode and clears amount/note/photo).
3. FR-3 **Numbering.** Every expense gets a human number from `platform_document_sequence` with `kind='expense'` (new kind, CCR-30), prefix default `EXP`, format `EXP/26-27/0031`, allocated inside the posting transaction with `SELECT … FOR UPDATE`; numbers are never reused and voided expenses keep theirs.
4. FR-4 **Ledger behaviour (normative).** Per Part 22 §22.10: an expense with a `party_id` and `paid=false` posts a ledger **credit** (the business owes the party more — `entry_type='expense'`, direction `credit`, `source_type='expense'`, `source_id`), while an expense with `paid=true` posts **nothing** to the ledger and appears only in the cashbook. The form exposes this as a switch **Paid now** (default **on**); switching it off requires a party (FR-6) and reveals a **Due on** date. When the unpaid expense is later paid, the owner records a `direction='out'` payment (PAY-01) against the party, which allocates to the expense through `payments_allocation` with `document_type='expense'` (CCR-31) and posts the ledger debit.
5. FR-5 **GST details** (visible only when `tenant.gst_type='regular'`): **Tax code** (`MLSelect` from `tax_rate` active on `expense_date`, default `GST0`), **Amount includes tax** (`MLSwitch`, default on), **Supplier GSTIN** (`MLInput`, validated checksum, prefilled from the party), **ITC eligible** (`MLSwitch`, default on, off for blocked credits). From these the server computes `tax_amount` (BR-3) and stores `tax_code`, `tax_amount` on `expenses_expense`; the values feed the inward side of the GST summary (RPT-07) as "Expenses (other than purchases)".
6. FR-6 **Party linkage.** "Paid to" accepts any party (customer or supplier) and, when chosen, is snapshotted (`party_id` + `meta.party_name`). Rules: `paid=true` + party → no ledger entry, but the expense appears on the party's activity timeline as an informational row ("Paid ₹12,000 — Rent") clearly marked "Not in balance"; `paid=false` + party → ledger credit as FR-4; `paid=false` without a party → rejected (400 `details.party_id: ["Choose who you owe this to"]`).
7. FR-7 **Receipt photo.** `UbFileUpload` accepts one image (JPEG/PNG/WebP/HEIC) or PDF up to 10 MB, client-compressed to ≤ 1600 px on the long edge and ≤ 400 kB (canvas re-encode, no library — ADR-021), uploaded to `POST /attachments` (`kind='receipt'`, `owner_type='expenses_expense'`) and referenced by `receipt_attachment_id`. Stored on local `MEDIA_ROOT` via the Django storage API (ADR-013). `UbImagePreview` shows a thumbnail with view/replace/remove. Upload happens before save; a failed upload never blocks saving the expense (the drawer offers **Save without photo**).
8. FR-8 **Save.** `POST /expenses` with `Idempotency-Key` → `expenses.services.record_expense(data, actor)` in one `transaction.atomic()`: validate, allocate the number, insert `expenses_expense` (`status='recorded'`), post the ledger credit when `paid=false`, update `parties_party.balance`/`last_activity_at` when applicable, attach the receipt, write `platform_audit_log`, return 201 `{ data: Expense, meta: { party_balance? } }`. Success snackbar: "Saved ₹500 — Tea & snacks" with **Undo** for 8 s (client-side; Undo calls the void endpoint with reason "Undone immediately").
9. FR-9 **List.** `/expenses` renders `UbDataGrid` (desktop) / date-grouped cards (mobile) with columns Date, Number, Category, Paid to, Mode, Amount, Receipt (paper-clip glyph), Status; toolbar: `UbSearchInput` (300 ms, over number/note/party name), `UbDateRangePicker` (default **This month**, chips Today/This week/This month/Last month/FY/Custom), category multi-select, mode select, `UbTabs` **All** · **Unpaid** · **Void**. A totals header shows "Total ₹41,230 · 62 expenses" over the **filtered** set, plus a mini breakdown "Top: Salaries ₹18,000 · Rent ₹12,000 · Transport ₹3,400".
10. FR-10 **Detail.** Row → `ExpenseDetailDrawer`: amount `ds-metric-md`, category chip, date, mode + reference, party link, note, receipt (tap → full-screen `UbImagePreview` with pinch-zoom and **Download**), GST block when present, audit footer ("Recorded by Priya · 18/09 11:40"), and actions **Edit** (FR-11), **Void** (FR-12), **Duplicate** (opens the drawer prefilled with today's date), **Share** (NTF-03 text with the amount, category and receipt link — Phase 2).
11. FR-11 **Edit window.** An expense may be edited only while `status='recorded'`, within 24 h of creation, by the creator or an owner/admin, and only if it has no payment allocations: `PATCH /expenses/{id}` with `version` (Part 22 concurrency). Editable fields: category, date, mode, reference, party (when it does not change the ledger side), note, receipt, GST fields. **Amount is not editable** when a ledger entry exists — that is a void-and-re-record (409 `expense_amount_immutable`, CCR-32). Outside the window the Edit action is hidden and the drawer explains "Older than a day — void it and record again".
12. FR-12 **Void.** `POST /expenses/{id}/void { reason }` (`expenses.expense.void`) via `UbReasonDialog` with consequence lines ("Cashbook: Cash −₹500 on 18/09 will be removed", "Ledger: Landlord −₹12,000" when unpaid): sets `status='void'`, `voided_at`, `void_reason`; reverses the ledger entry through LED-10 `reverse_source_entries('expense', id, reason)` when one exists; deletes any `payments_allocation` rows against it and recomputes the paying payment's `unallocated_amount`; audits. Void is terminal (BR-8).
13. FR-13 **Offline-tolerant save.** Following the shared UX rule, a save on a poor connection shows an optimistic row "Saving…" in the list; on failure the draft is kept in `localStorage` under `ub.expense.draft` and a `UbStatusBanner` offers **Retry** / **Discard**; the same `Idempotency-Key` is reused on retry so a slow-but-successful first attempt never doubles.
14. FR-14 **Defaults that make it fast.** The category combobox orders by the tenant's last-30-day usage count then alphabetically; the mode defaults to the previous expense's mode within the session; the date defaults to today and refuses future dates (shared rule); the amount keypad opens immediately. Recording the same category twice in a row pre-selects it on **Save & add another**.

#### 5. Non-Functional Requirements
Drawer interactive ≤ 300 ms from tap (category list preloaded with the module). Save round trip P95 ≤ 350 ms excluding the photo; photo compression ≤ 800 ms for a 4 MP image on a mid-range phone, run off the main thread where `createImageBitmap` is available. List P95 ≤ 500 ms for a month of 500 expenses. Works on 3G: the list page ≤ 180 kB JS; thumbnails served at 200 px. Offline: draft retained (FR-13). Accessibility: every control ≥ 44 px on mobile, labels always present (not placeholder-only), amounts announced with their currency. Localisation: en/hi for all labels, seeded category names, and validation messages; numbers via `Intl.NumberFormat('en-IN')`; dates dd/mm/yyyy.

#### 6. User Flow
Primary (petty cash): Expenses → **+** → amount `500` → category **Food & tea** (top of the recent list) → date Today (default) → mode **Cash** (default) → **Save** → snackbar "Saved ₹500 — Food & tea · Undo" → row appears at the top of today's group.
Alternate A (with photo): amount `4,820` → category **Electricity** → mode **UPI** → reference `UTR 4471` → **Add photo** → camera → compressed preview → **Save**.
Alternate B (party, unpaid): amount `12,000` → category **Rent** → **Paid now** off → Paid to **Landlord Sharma** (created inline) → Due on 05/10 → **Save** → ledger credit ₹12,000 posted, party balance shows "You will give ₹12,000" → later PAY-01 `direction=out` settles it.
Alternate C (GST): registered tenant → amount `11,800` → category **Marketing** → GST details → `GST18`, includes tax on → server computes taxable ₹10,000, tax ₹1,800 → ITC eligible on.
Alternate D (staff): Priya records ₹60 auto fare; the owner sees it under Recent activity with "by Priya".
Alternate E (mistake): owner opens the ₹500 row within the hour → **Edit** → category corrected to **Transport** → Save (version check).
Alternate F (wrong amount): older than 24 h → **Void** with reason "Wrong amount" → **Record again** prefilled.

#### 7. UI Requirements
`ExpenseDrawer` (`UbDrawer` + `UbForm`): title "Add expense" / "Edit expense"; fields per FR-2 in a single column with `UbField` anatomy (11 px uppercase label, control, hint, error); the amount uses `ds-metric-sm` in the input with a ₹ addon; **Paid now** is an `MLSwitch` row with the caption "Turn off if you still owe this money"; **GST details** is an `MLAccordion`-style disclosure showing a live computed strip "Taxable ₹10,000.00 · GST 18 % ₹1,800.00"; the receipt area is a 96 px dashed `UbFileUpload` tile that becomes a `UbImagePreview` thumbnail; the footer is sticky with `Save` (primary, full width on mobile) and `Save & add another` (ghost). `ExpensesPage`: `UbPageHeader` "Expenses" + date-range control + **Add expense**; `UbStatCard` row (This month, Last month, Top category) on desktop only; `UbTabs`; `UbDataGrid` with right-aligned tabular amounts (`ds-num`), category as a `MLBadge` with the category's colour, receipt paper-clip icon, and a row menu (View, Edit, Duplicate, Void). Mobile list: date group headers ("Today · ₹1,560") with cards showing category, note, mode glyph and amount; swipe is **not** used for destructive actions (Koper: destructive needs a reason dialog). `ExpenseDetailDrawer` per FR-10. Category chips use the colour stored in EXP-02 with a text label always present.

#### 8. UX Requirements
Keys: `expenses.title` "Expenses", `expenses.add` "Add expense", `expenses.amount` "Amount", `expenses.category` "Category", `expenses.date` "Date", `expenses.mode` "Paid by", `expenses.reference` "Reference", `expenses.paidTo` "Paid to", `expenses.paidToHint` "Optional — the person or shop you paid", `expenses.note` "Note", `expenses.receipt` "Receipt photo", `expenses.paidNow` "Paid now", `expenses.paidNowHint` "Turn off if you still owe this money", `expenses.dueOn` "Due on", `expenses.gst` "GST details", `expenses.gst.inclusive` "Amount includes tax", `expenses.gst.itc` "Input credit eligible", `expenses.save` "Save", `expenses.saveAndAdd` "Save & add another", `expenses.saved` "Saved {amount} — {category}", `expenses.undo` "Undo", `expenses.edit.expired` "Older than a day — void it and record again", `expenses.void.title` "Void {number}?", `expenses.empty.first` "No expenses yet — add your first one", `expenses.empty.filtered` "No expenses match these filters", `expenses.total` "Total {amount} · {count} expenses". Hindi: "खर्च", "खर्च जोड़ें", "रकम", "श्रेणी", "किसे दिया", "अभी भुगतान किया", "रसीद फोटो", "सहेजें", "और जोड़ें", "रद्द करें". Colour semantics: expenses are money **out** — amounts render in `--text-primary` with a small "−" prefix in the cashbook, never green; the ledger credit created by an unpaid expense follows the standard "You will give" green-on-the-party rule because it is the party's view, and the drawer explains this once with a `UbHelpHint`. Undo is offered for 8 s; destructive actions always use `UbReasonDialog`.

#### 9. States
Drawer: Initial (amount focused) · Typing/Dirty (footer enabled) · Validating · Uploading photo (tile spinner + percent, Save disabled until done or "Save without photo") · Submitting (button spinner "Saving…") · Success (drawer closes, snackbar) · Error field-level (inline) · Error network (banner + Retry, draft kept) · Disabled (no `expenses.expense.write`: the FAB is hidden). List: Loading (skeleton rows/cards) · Empty first-use (illustration, **Add expense**, help link "What counts as an expense?") · Filtered-empty (**Clear filters**) · Error (Retry + request id) · Ready · Partial (optimistic "Saving…" row). Detail: Loading · Ready · Void (badge + reason, actions hidden) · Not found (404 card). Photo: none · uploading · ready · failed (Retry / Remove).

#### 10. Validation Rules
`expenseSchema` (in `useValidationSchemas.ts`): `amount` via `amountValidation()` — required, > 0, ≤ 99,99,999.99, max 2 decimals → "Enter an amount greater than zero"; `category_id` required uuid → "Choose a category"; `expense_date` via `businessDateValidation()` — required, not in the future, not before `tenant.created_at − 5 years` → "Date cannot be in the future"; `mode ∈ {cash, upi, bank, card, cheque, other}` required → "Choose how you paid"; `reference` ≤ 64, required when `mode ∈ {cheque}` → "Enter the cheque number"; `party_id` uuid optional, **required when `paid=false`** → "Choose who you owe this to"; `due_on` required when `paid=false`, ≥ `expense_date` → "Due date cannot be before the expense date"; `note` ≤ 255; `tax_code` must be active on `expense_date` → 400 `tax_rate_not_effective`; `supplier_gstin` via `gstinValidation()` → "Enter a valid 15-character GSTIN"; receipt file ≤ 10 MB and an accepted content type → "Use a photo or PDF under 10 MB". Server adds: 403 `permission_denied`, 403 `module_disabled` when `expenses` is not in `tenant.enabled_modules`, 409 `expense_already_void`, 409 `expense_amount_immutable` (CCR-32), 409 `stale_version`, 409 `party_archived`, 404 cross-tenant, 429 on the default limit.

#### 11. Business Rules
1. BR-1 An expense is a **money-out** event of the business that is not a purchase bill; purchases of stock go through PUR-01 so that inventory and ITC are handled properly. The **Purchases-misc** seeded category exists for non-stock buying (packing material, consumables) and is explicitly documented as "not inventory".
2. BR-2 Ledger posting is decided by `paid` alone (FR-4): `paid=true` → no `ledger_entry`; `paid=false` → exactly one `credit` entry for the party, `entry_type='expense'`, `entry_date = expense_date`.
3. BR-3 **Tax split formula.** When `tax_inclusive=true`: `taxable = round_half_up(amount × 100 / (100 + rate), 2)`, `tax_amount = amount − taxable`. When `tax_inclusive=false`: `taxable = amount`, `tax_amount = round_half_up(amount × rate / 100, 2)` and the stored `amount` becomes `taxable + tax_amount` (the field label switches to "Amount before tax" so the total is unambiguous). Intra-state splits into CGST/SGST halves for reporting (`round_half_up(tax_amount / 2, 2)` on CGST with SGST taking the remainder so the two always sum exactly); inter-state is IGST. All arithmetic is `Decimal`, half-up, 2 decimals.
4. BR-4 Expense numbers come from the FY sequence (FR-3); the FY is derived from `expense_date` and `tenant.fy_start_month`, so a backdated expense takes the previous FY's series.
5. BR-5 The cashbook (EXP-03) counts an expense on `expense_date` under `mode` when `paid=true`; an unpaid expense never touches the cashbook until its settling payment does.
6. BR-6 An expense's `amount` is immutable once a ledger entry or an allocation exists (FR-11); everything else is editable within 24 h. Rationale: money numbers are corrected by reversal, matching LED-03 and PAY-05.
7. BR-7 Receipts are retained with the expense; deleting a receipt is a soft delete of the attachment and is audited; the file is garbage-collected 30 days later (§21.5).
8. BR-8 Void is terminal and never deletes the row; the number is retained; the reason is mandatory (3–160 chars).
9. BR-9 Staff can record expenses only when `expenses.expense.write` is granted (off by default for `staff` — see §12) and only up to `expenses.staff_limit` per expense (tenant setting, default ₹2,000, CCR-30); above it the form shows "Ask the owner to record this".
10. BR-10 Expenses are never posted to inventory and never affect stock, even for the Purchases-misc category.
11. BR-11 An expense may reference a party who is a customer; this does not net against their receivable unless `paid=false` (in which case the ledger credit genuinely reduces what they owe — an intentional and correct outcome for, say, commission paid to a customer-agent). The drawer warns once: "This will reduce what {party} owes you."
12. BR-12 Duplicate detection (soft): saving an expense with the same `category_id`, `amount` and `expense_date` as one recorded in the last 10 minutes shows a confirm "You recorded an identical expense 4 minutes ago — save anyway?" (client-side only, never blocking).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View expenses list & detail | `expenses.expense.read` | ✅ | ✅ | ✅ (own + all, per setting `expenses.staff_sees_all`, default own only) | ✅ |
| Record expense | `expenses.expense.write` | ✅ | ✅ | ❌ by default; grantable via `permissions_override`, capped by `expenses.staff_limit` | ❌ |
| Edit expense (24 h window) | `expenses.expense.write` + creator or owner/admin | ✅ | ✅ | ✅ own only | ❌ |
| Void expense | `expenses.expense.void` | ✅ | ✅ | ❌ | ❌ |
| Export expenses | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Manage categories | `expenses.expense.write` (EXP-02) | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 Amount entered with a comma or Devanagari digits ("१,२००") → `UbMoneyInput` normalises to `1200.00` before validation.
2. EC-2 Photo capture fails / permission denied on the phone → the tile shows "Could not open the camera — choose a file instead"; saving continues.
3. EC-3 HEIC photo from an iPhone → client re-encode to JPEG via canvas; if the browser cannot decode HEIC, the file is uploaded as-is and the thumbnail falls back to a file glyph.
4. EC-4 Expense dated in a previous FY → allowed; number allocated from that FY's series; the list's default "This month" filter hides it, so the snackbar offers **Show 12/03/2026**.
5. EC-5 Category archived (EXP-02) after the expense was recorded → the row still shows the category name with an "(archived)" suffix; the picker excludes it for new expenses.
6. EC-6 Party archived while an unpaid expense is open → the ledger credit remains; PTY archive rules already block archiving with a non-zero balance, so this only happens for a zero-net party.
7. EC-7 Two devices save the same expense with the same `Idempotency-Key` (retry after a timeout) → the second returns the original 201 with `Idempotent-Replayed: true`; no duplicate row.
8. EC-8 `expenses` module disabled for the tenant → routes 403 `module_disabled` and the nav item is absent; existing data is preserved.
9. EC-9 Save with an uploaded photo but the expense POST fails → the orphan attachment is swept by the 30-day GC job; a retry re-uses the same `attachment_id`.
10. EC-10 GST-registered tenant switches to composition mid-year → the GST section disappears for new expenses; old expenses keep their stored `tax_code`/`tax_amount`.
11. EC-11 Amount exactly equal to the staff limit (₹2,000) → allowed (limit is inclusive); ₹2,000.01 → blocked with the "Ask the owner" message.
12. EC-12 Unpaid expense later settled by a payment that is then voided (PAY-05) → the allocation is deleted and the expense returns to unpaid; its ledger credit was never reversed, so the party balance is correct automatically.
13. EC-13 Clock on the device is wrong (tomorrow's date) → the date picker clamps to the server's business date, which the client refreshes from the `Date` response header on app load.
14. EC-14 Very long note pasted (2 kB) → trimmed to 255 with a hint "Shortened to 255 characters".

#### 14. API Requirements
- `POST /expenses` (Part 22 §22.10), `Idempotency-Key` required. Body: `{ amount, category_id, expense_date, mode, reference?, party_id?, paid (default true), due_on?, note?, receipt_attachment_id?, tax_code?, tax_inclusive?, supplier_gstin?, itc_eligible? }` → 201 `{ data: Expense, meta: { party_balance? } }`.
- `GET /expenses?date_from&date_to&category_id=<csv>&mode&party_id&status=recorded,void&paid=true|false&q&ordering=-expense_date,-created_at&page&page_size` → `data[]` + `meta.totals { amount, count, by_category: [{ category_id, name, amount }] }` over the filtered set.
- `GET /expenses/{id}` → expense + `category`, `party`, `receipt: { url, content_type, size_bytes }`, `payments[]` (settling payments), `created_by`, `version`.
- `PATCH /expenses/{id}` (draft-free; requires `version`) → 200; 409 `expense_amount_immutable`, 409 `stale_version`, 403 outside the window.
- `POST /expenses/{id}/void { reason }` → 200 `{ data: Expense, meta: { party_balance?, reversal_entry_id? } }`; 409 `expense_already_void`.
- `POST /attachments` multipart `{ file, kind: "receipt", owner_type: "expenses_expense", owner_id? }` → 201 `{ id, url, … }` (shared with PUR-01 bill photos).
- `GET /reports/expenses.csv?…` via the shared export path (`reports.export`).
- Frontend: `expenseService.ts` (`list`, `get`, `create`, `update`, `void`, `uploadReceipt`); `expenseSlice` (`entities`, `list`, `totals`, `filters`, `drawer: { open, mode, draft }`, `detail`) + `expenseThunk.ts` (`fetchExpenses`, `createExpense`, `updateExpense`, `voidExpense`); `expenseDisplay.ts` (`categoryChip`, `modeGlyph`, `groupByDate`, `taxSplitPreview`); validation in `features/expenses/validation/expenseSchema.ts` composed from the shared validators.

#### 15. Database Impact
Writes `expenses_expense` (`number`, `category_id`, `party_id`, `expense_date`, `amount`, `tax_amount`, `tax_code`, `mode`, `reference`, `note`, `receipt_attachment_id`, `status`) plus new columns `paid boolean NN default true`, `due_on date NULL`, `itc_eligible boolean NN default true`, `supplier_gstin varchar(15) NULL`, `version int NN default 1`, `voided_at`, `void_reason`, `meta jsonb` (CCR-31); `ledger_entry` (`entry_type='expense'`) when unpaid; `parties_party` (balance caches); `files_attachment`; `platform_document_sequence` (`kind='expense'`, CCR-30); `platform_audit_log`. Reads `expenses_category`, `tax_rate`, `platform_tenant_setting`, `parties_party`. Indexes: existing `IX(tenant_id, expense_date DESC)` and `IX(tenant_id, category_id)`; new `IX(tenant_id, status, expense_date DESC)` and `IX(tenant_id, party_id, expense_date DESC) WHERE party_id IS NOT NULL`; `payments_allocation.document_type` gains the value `expense` (CCR-31).

#### 16. Audit Requirements
`expense.recorded` (`after` = full row incl. amount, category, mode, party, tax; `metadata.idempotency_key`), `expense.updated` (`before`/`after` = changed fields only, `metadata.version`), `expense.voided` (`before` = full row, `metadata.reason`, `metadata.reversal_entry_id`), `expense.receipt_added` / `expense.receipt_removed` (`metadata.attachment_id`). Retention ≥ 7 years (financial). Actor is the recording member; system actions (none at MVP) would carry `actor_type='system'`.

#### 17. Notifications
- In-app (NTF-01) `expense_recorded_by_staff`: to owners/admins when a **staff** member records an expense — title "Priya recorded ₹60 — Transport", body the note, `data.route=/expenses/{id}`; coalesced to one notification per staff member per hour listing the count and total.
- In-app `expense_unpaid_due`: raised by the daily scheduler at 09:15 IST for unpaid expenses whose `due_on` is today or past — "Rent ₹12,000 to Landlord Sharma is due today" with `data.route=/expenses/{id}`; one notification per expense per day, capped at 5 per tenant per day with a "and 3 more" summary.
- SMS/WhatsApp: **Not applicable** — expenses are internal; no party-facing message is sent at MVP (the landlord's reminder, if ever wanted, would reuse LED-06 on the party's payable balance).

#### 18. Analytics / Event Tracking
`ub.expenses.drawer_opened` `{ source: fab|quick_create|duplicate|list_button }`; `ub.expenses.recorded` `{ category_code, mode, has_party, has_receipt, paid, has_gst, amount_bucket, seconds_to_save_bucket, save_and_add: bool }`; `ub.expenses.updated` `{ fields_changed: [...], minutes_since_create_bucket }`; `ub.expenses.voided` `{ reason_chip, minutes_since_create_bucket }`; `ub.expenses.receipt_uploaded` `{ original_kb_bucket, compressed_kb_bucket, duration_ms_bucket }`; `ub.expenses.list_filtered` `{ range, categories_count, mode, tab }`; `ub.expenses.duplicate_warning_shown` `{ accepted: bool }`; `ub.expenses.staff_limit_blocked` `{ amount_bucket }`. No notes, party names, GSTINs or exact amounts in properties.

#### 19. Security
Tenant scoping on every query; cross-tenant expense or attachment ids → 404. Receipt files are served through an authenticated view (`GET /attachments/{id}/file`) that checks tenant and permission and streams from `MEDIA_ROOT` with `Content-Disposition: inline` and `X-Content-Type-Options: nosniff`; direct static URLs are not exposed. Uploads are validated by magic bytes (not the client-supplied content type), re-encoded for images with Pillow (stripping EXIF, including GPS), size-capped at 10 MB, and stored under a UUID `storage_key` with no user-controlled path segment; SVG is rejected. Notes and references are escaped on render (no HTML). Staff limits are enforced server-side, never only in the form. Rate limits: default 600/min plus 60/min on `POST /expenses` and 30/min on `POST /attachments`. PII: an expense may name a person (party, note); it inherits the tenant's DPDP posture and is exported/deleted with the tenant (PLT-10).

#### 20. Performance
List query uses `(tenant_id, status, expense_date DESC)` with `select_related('category', 'party', 'receipt_attachment')` — three joins, no N+1; `meta.totals` is a single aggregate with a `GROUP BY category_id` subquery limited to the top 5 for the breakdown. Page size 25 (max 100). The category list is fetched once per session and cached in `expenseSlice` (invalidated by EXP-02 writes). Thumbnails are generated at upload (200 px, Pillow) and cached by the browser for 7 days. The write transaction touches at most 4 tables and one sequence row; P95 ≤ 350 ms. CI runs `EXPLAIN` on the list query against the 100k-row fixture.

#### 21. Testing
T-EXP-01-1 (unit) `record_expense` with `paid=true` creates no `ledger_entry`; with `paid=false` creates exactly one `credit` entry dated `expense_date` and moves the party balance. T-EXP-01-2 (unit) number allocation from the correct FY series for a backdated expense; numbers never reused after a void. T-EXP-01-3 (unit) BR-3 tax split for inclusive and exclusive at 5/12/18/28 % including the CGST/SGST remainder rule (₹1,800 → 900.00/900.00; ₹0.05 → 0.03/0.02). T-EXP-01-4 (unit) `paid=false` without a party → validation error. T-EXP-01-5 (unit) amount immutable once a ledger entry exists → 409 `expense_amount_immutable`; other fields patchable with `version`. T-EXP-01-6 (unit) void reverses the ledger entry, deletes allocations and recomputes the payment's `unallocated_amount`. T-EXP-01-7 (unit) staff limit enforced server-side at ₹2,000 inclusive. T-EXP-01-8 (API) idempotent create: same key + same body replays the 201; different body → 409 `idempotency_conflict`. T-EXP-01-9 (API) list filters and `meta.totals` over the filtered set; `by_category` top 5. T-EXP-01-10 (API) permission matrix: staff without the codename → 403; accountant → 403 on write, 200 on read/export. T-EXP-01-11 (API) attachment served only to members of the owning tenant; cross-tenant → 404; SVG rejected; EXIF stripped. T-EXP-01-12 (component) `ExpenseDrawer` renders all states, defaults (today, last mode), GST disclosure only for regular tenants, save-and-add retention. T-EXP-01-13 (component) duplicate warning appears for an identical expense within 10 minutes and is bypassable. T-EXP-01-14 (component) list empty/filtered/error states and date grouping with per-day totals. T-EXP-01-15 (E2E) record cash expense → appears in today's group → cashbook (EXP-03) out column increases by the same amount → void → both revert. T-EXP-01-16 (E2E) unpaid rent → party balance "You will give ₹12,000" → PAY-01 `direction=out` settles it → expense shows Paid with the settling payment linked. T-EXP-01-17 (offline) save with the network off keeps the draft and retries with the same idempotency key on reconnect.

#### 22. Acceptance Criteria
- AC-1 (US-EXP-01-1) Given the Expenses page, when the owner taps **+**, enters 500, picks **Food & tea** and saves with the defaults, then an `expenses_expense` row exists with `number='EXP/26-27/0031'`, `amount=500.00`, `mode='cash'`, `expense_date=today`, `paid=true`, `status='recorded'`, **no** `ledger_entry` exists for it, and the snackbar reads "Saved ₹500 — Food & tea" with an Undo that voids it.
- AC-2 (US-EXP-01-2) Given an electricity expense, when a 4 MP photo is attached, then it is compressed to ≤ 400 kB, stored as `files_attachment(kind='receipt')` under `MEDIA_ROOT`, linked by `receipt_attachment_id`, shown as a thumbnail in the row and full-screen in the detail drawer, and is downloadable only by members of that tenant.
- AC-3 (US-EXP-01-3) Given rent of ₹12,000 with **Paid now** off and party Landlord Sharma with a due date of 05/10, when saved, then one `ledger_entry(direction='credit', entry_type='expense', amount=12000.00, entry_date=expense_date, source_type='expense')` exists, the party's balance reads "You will give ₹12,000", and the expense appears in the **Unpaid** tab.
- AC-4 (US-EXP-01-4) Given a `regular` GST tenant and ₹11,800 with `GST18` and **Amount includes tax** on, when saved, then `tax_amount=1800.00` and the taxable value ₹10,000.00 are stored and shown, and the expense appears in the inward section of the GST summary with `itc_eligible=true`.
- AC-5 (US-EXP-01-5) Given staff with `expenses.expense.write` granted and a ₹2,000 limit, when Priya records ₹60 for Transport, then it saves and the owner receives one in-app notification; when she tries ₹2,500, then the form blocks it and the server returns 403 with "Ask the owner to record this".
- AC-6 (US-EXP-01-6) Given an expense older than 24 h, when the owner voids it with reason "Wrong amount", then `status='void'`, `void_reason` is stored, the number is retained, any ledger entry is reversed, the cashbook for that day no longer counts it, and the row shows a Void badge with the reason.
- AC-7 (US-EXP-01-7) Given 62 expenses this month, when the accountant filters category = Salaries, Rent and exports CSV, then the header total matches the filtered sum exactly and the file contains number, date, category, party, mode, reference, amount, tax and note columns.

#### 23. Dependencies
EXP-02 (categories, colours, seeding), EXP-03 (cashbook consumption), PTY-01 (party picker and inline create), PAY-01 (settling payments, `payments_allocation` with `document_type='expense'`), LED-10 (`reverse_source_entries` on void), PLT-04 (`platform_document_sequence`), PLT-12 (global quick create), RPT-02 (day book), RPT-07 (GST summary inward), NTF-01, `UbDrawer`, `UbMoneyInput`, `UbDateInput`, `UbCombobox`, `UbAsyncCombobox`, `UbFileUpload`, `UbImagePreview`, `UbDataGrid`, `UbReasonDialog`, ADR-013 (local media), ADR-021, CCR-30/CCR-31/CCR-32.

#### 24. Future Enhancements
Recurring expenses (EXP-04) generating these rows on a schedule; expense approval workflow for staff above a limit (Phase 3 with custom roles); receipt OCR to prefill amount/date/GSTIN (explicitly **out of scope** per canon §0.3 "attachments OCR (no)", revisited only with an ADR); mileage/per-km helper for delivery businesses; expense budgets per category with over-spend alerts (RPT-12); splitting one expense across categories; attaching multiple receipts; vendor-wise expense analysis merged with purchases for a true cost view; TDS capture on rent and professional fees for the CA.

### EXP-02 — Expense categories

#### 1. Business Objective
Make "where does my money go" answerable without asking the owner to invent an accounting chart: ship a short, seeded, India-small-business-shaped list of categories that works on day one, and let each tenant rename, recolour, reorder, add and archive entries so the list matches how they actually think ("Chai-pani", "Mandi bhada", "Dukaan kiraya"). Categories are the spine of the expense list, the cashbook breakdown and the future profit view. Measured by: ≥ 85 % of expenses use a seeded category in month 1 (the seed fits); ≤ 12 categories per tenant at the 90th percentile (the list stays usable); 0 expenses left uncategorised (the field is mandatory).

#### 2. User Personas
Owner (OW) curates the list; Admin (AD) same; Staff (ST) picks from it and may create one inline when permitted; Accountant (AC) reads it and maps it to the CA's chart at export time; Super admin (SA) maintains the seed catalogue shipped with the product.

#### 3. User Stories
1. US-EXP-02-1 — As an owner I want sensible categories already present so that I can record my first expense without setting anything up.
2. US-EXP-02-2 — As an owner I want to rename "Food" to "Chai-pani" so that the list speaks my language.
3. US-EXP-02-3 — As an owner I want to add "Mandi bhada" because my trade has costs the defaults do not cover.
4. US-EXP-02-4 — As an owner I want to hide categories I never use so that the picker stays short.
5. US-EXP-02-5 — As an owner I want to merge a duplicate category into another so that my month-end totals are not split in two.
6. US-EXP-02-6 — As an owner I want each category to have a colour so that I can read the expense list at a glance.
7. US-EXP-02-7 — As staff I want to create a category while recording an expense so that I am not blocked at the counter.

#### 4. Functional Requirements
1. FR-1 **Seeding.** On tenant creation the idempotent management command `manage.py seed_expense_categories` (called by the onboarding service, §21.8 "seed data via commands, not migrations") inserts the canonical list from canon §21.3.10 as `expenses_category` rows with `is_system=true`: **Rent**, **Salaries**, **Electricity**, **Transport**, **Purchases-misc**, **Food**, **Marketing**, **Fees**, **Other**. Each gets a `sort_order` (10, 20, … 90), a `color` from the `--viz-1…8` palette (deterministic by index), and an `icon` slug from `lucide-react` (`home`, `users`, `zap`, `truck`, `package`, `coffee`, `megaphone`, `receipt`, `ellipsis`) — new columns `color varchar(7)`, `icon varchar(24)`, `sort_order smallint`, `status varchar(16)`, `deleted_at` (CCR-33).
2. FR-2 **Business-type nudge.** Onboarding (PLT-03) may add up to three extra seeded categories per `tenant.business_type` from a static map — `food`: **Raw material**, **Gas/Fuel**, **Packing**; `distribution`/`wholesale`: **Freight**, **Loading/Unloading (hamali)**, **Godown rent**; `services`/`professional`: **Software**, **Travel**, **Subcontractor**; `manufacturer`: **Power**, **Labour**, **Job work**; `retail`: **Packing**, **Shop maintenance**. These are ordinary tenant rows (`is_system=false`) that the owner can remove.
3. FR-3 **Management screen.** `/settings/expense-categories` (also reachable from the expense list's category filter → **Manage**): a `UbDataGrid`-free, drag-reorderable `MLItem` list (desktop and mobile share one layout because the list is short) with columns Colour swatch + name, Used this month (count + amount), Status, and a row menu (**Edit**, **Archive**, **Merge into…**). Header: **Add category** (primary), search, and a **Show archived** `MLSwitch`.
4. FR-4 **Create / edit.** `CategoryDialog` (`UbDialog`) with **Name** (`MLInput`, 1–40 chars, required), **Colour** (a 12-swatch `MLRadioGroup` from the `--viz-*` + neutral palette; no free hex, to keep contrast guarantees per Part 23), **Icon** (a 16-glyph picker, optional, default `ellipsis`) and a live preview chip. Save → `POST /expense-categories` / `PATCH /expense-categories/{id}`. Inline creation from `ExpenseDrawer` (EXP-01 FR-2) posts the same endpoint with only `name`, assigning the next free colour and the default icon, and selects the new category immediately.
5. FR-5 **Reorder.** Drag handles set `sort_order` in steps of 10; `PATCH /expense-categories/reorder { ordered_ids: [...] }` rewrites the whole order in one transaction. The picker in `ExpenseDrawer` overrides this with a **usage-first** order (last 30 days count desc, then `sort_order`), so curation affects the settings list and the reports legend while the counter stays fast.
6. FR-6 **Archive, not delete.** `POST /expense-categories/{id}/archive` sets `status='archived'`; archived categories disappear from pickers but keep rendering on historical expenses with an "(archived)" suffix. `POST /expense-categories/{id}/restore` reverses it. Hard `DELETE /expense-categories/{id}` is allowed **only** when the category has zero expenses ever and is not `is_system` → otherwise 409 `category_in_use` (CCR-34).
7. FR-7 **Merge.** `POST /expense-categories/{id}/merge { into_id }` (owner/admin) reassigns every `expenses_expense.category_id` from the source to the target in one transaction (batched 1,000 rows), archives the source, writes one audit row with the moved count, and returns `{ moved, target }`. A `UbConfirmDialog` states the consequence: "312 expenses worth ₹4,12,300 will move to **Rent**. This cannot be undone." Merging into itself, into an archived category, or merging a category with > 50,000 expenses (use the export/CA route instead) → 409.
8. FR-8 **System categories.** `is_system=true` rows may be renamed, recoloured, reordered and archived, but not deleted and not merged **away** (they may be a merge target). This keeps the seed's semantic anchors — notably **Fees**, which PAY-06 FR-11 writes into automatically — resolvable by code. Code lookups use a stable `system_code varchar(24)` column (`rent`, `salaries`, `electricity`, `transport`, `purchases_misc`, `food`, `marketing`, `fees`, `other`) rather than the display name (CCR-33), so a renamed "Fees" still receives aggregator charges.
9. FR-9 **Uncategorised is impossible.** `expenses_expense.category_id` is `NOT NULL`; if every category were somehow archived, the picker falls back to the `other` system category, which the API refuses to archive when it is the last active one (409 `last_category`).
10. FR-10 **Usage stats.** `GET /expense-categories?with_usage=true&date_from&date_to` returns each category with `usage: { count, amount }` for the range (default: current month), used by the management list, the expense list's breakdown strip (EXP-01 FR-9) and the cashbook's category donut (EXP-03 FR-9). Computed with one grouped aggregate, not per-row queries.
11. FR-11 **Import/export alignment.** The CSV export of expenses (EXP-01 FR-9 / RPT) emits both `category_name` and `category_system_code` so a CA's mapping sheet survives renames. Category import is not offered; the list is short enough to type.
12. FR-12 **Limits.** Maximum 40 active categories per tenant (409 `plan_limit_reached` with the message "You already have 40 categories — archive one first"); name unique per tenant among non-deleted rows, case-insensitive (`U(tenant_id, lower(name)) WHERE deleted_at IS NULL`, CCR-33).

#### 5. Non-Functional Requirements
The category list is small (≤ 40 rows) and is fetched once per session into `expenseSlice.categories`, so pickers open with zero latency; the store is invalidated on any write here. Management page interactive ≤ 400 ms. Reorder is optimistic with rollback on error. Usage aggregates P95 ≤ 250 ms for a month of 2,000 expenses. Colours come from a fixed, contrast-checked palette so a category chip is always legible on `--surface-card` in both themes (Part 23 §23.6). en/hi labels for the UI; **category names themselves are tenant data and are never translated** — the seed inserts the tenant's `locale` variant at creation time (Hindi tenants get "किराया", "वेतन", "बिजली", "भाड़ा", "खरीद-अन्य", "चाय-पानी", "प्रचार", "फीस", "अन्य") and the `system_code` keeps them machine-identifiable.

#### 6. User Flow
Primary (first use): the owner never visits this screen — the seeded list appears in the expense picker on day one.
Alternate A (rename): Settings → Expense categories → **Food** → **Edit** → name "Chai-pani" → colour amber → Save → the chip updates everywhere, including on historical expenses (the name is a reference, not a snapshot).
Alternate B (add): **Add category** → "Mandi bhada" → colour teal → icon `truck` → Save → appears at the end of the list and at the top of the picker after its first use.
Alternate C (inline): staff in `ExpenseDrawer` types "Hamali" → **Create "Hamali"** → created and selected in one tap.
Alternate D (tidy): **Show archived** off; owner archives **Marketing** (never used) → it vanishes from pickers; an old expense still shows "Marketing (archived)".
Alternate E (merge): the owner notices "Salary" and "Salaries" → ⋯ **Merge into…** → picks **Salaries** → confirm shows "312 expenses worth ₹4,12,300 will move" → merged, source archived, snackbar "Merged into Salaries".
Alternate F (reorder): drag **Rent** to the top → order persists for the settings list and reports legend.

#### 7. UI Requirements
`ExpenseCategoriesPage`: `UbPageHeader` "Expense categories" with description "Used when recording expenses and in your reports" and action **Add category**; `UbSearchInput`; `MLSwitch` "Show archived"; a reorderable list of `CategoryRow` (`MLItem`) each showing a 12 px colour dot + `lucide` icon, name `ds-body-medium`, a `ds-caption` usage line "18 this month · ₹24,300", a `UbStatusBadge` "Archived" when applicable, a drag handle (`GripVertical`, keyboard-operable with ↑/↓ when focused) and a `MLDropdownMenu` (Edit · Archive/Restore · Merge into… · Delete when unused). `CategoryDialog`: name field, colour `MLRadioGroup` rendered as a 12-swatch grid with `aria-label` per swatch and a checkmark on the selected one, icon picker (`MLPopover` with a 4×4 glyph grid), and a live preview `MLBadge` chip. `MergeCategoryDialog` = `UbConfirmDialog` with a `UbCombobox` target picker and a computed consequence line. Empty states: the list can never be empty (seeded), so only **filtered-empty** ("No category matches 'xyz'") and **error** variants exist. Mobile: the same list at full width, drag replaced by a "Move up / Move down" menu pair (drag is unreliable with scroll on small screens), dialogs become `UbDrawer` bottom sheets.

#### 8. UX Requirements
Keys: `expenses.categories.title` "Expense categories", `expenses.categories.desc` "Used when recording expenses and in your reports", `expenses.categories.add` "Add category", `expenses.categories.name` "Name", `expenses.categories.colour` "Colour", `expenses.categories.icon` "Icon", `expenses.categories.usage` "{count} this month · {amount}", `expenses.categories.showArchived` "Show archived", `expenses.categories.archive` "Archive", `expenses.categories.restore` "Restore", `expenses.categories.merge` "Merge into…", `expenses.categories.mergeConfirm` "{count} expenses worth {amount} will move to {target}. This cannot be undone.", `expenses.categories.merged` "Merged into {target}", `expenses.categories.delete` "Delete", `expenses.categories.createInline` "Create \"{name}\"", `expenses.categories.archivedSuffix` "(archived)", `errors.category_in_use` "This category has expenses — archive it instead", `errors.last_category` "You need at least one category", `errors.duplicate_category` "A category with this name already exists". Hindi: "खर्च की श्रेणियाँ", "श्रेणी जोड़ें", "नाम", "रंग", "संग्रह करें", "वापस लाएँ", "इसमें मिलाएँ…", "मिला दिया गया", "(संग्रहित)". Copy rules: archive is framed as tidying ("It will stay on old expenses"), delete is offered only when it is genuinely safe, and merge always states the exact consequence before it happens. No confirmation for rename/recolour/reorder (cheap and reversible); archive uses `UbConfirmDialog`; merge uses `UbConfirmDialog` with the typed count; delete uses `UbConfirmDialog` with "This category has never been used".

#### 9. States
List: Loading (6 skeleton rows) · Ready · Filtered-empty · Error (retry + request id) · Reordering (optimistic, rows dimmed 45 % during the request) · Reorder failed (snackbar "Could not save the order" + revert). Row: Default · Hover · Dragging (raised, `--shadow-2`) · Archived (45 % opacity, restore action) · System (a `UbHelpHint` on the Delete item explaining why it is disabled). Dialog: Initial · Dirty · Validating · Submitting · Success · Error duplicate (inline on the name field) · Error limit (banner). Merge: Initial (target unchosen, confirm disabled) · Counting (spinner on the consequence line) · Confirming · Working (progress "Moving 312 expenses…") · Success · Error. Picker (in `ExpenseDrawer`): Loading (from cache — usually instant) · Ready · Creating inline (spinner on the create row) · Error (falls back to the cached list).

#### 10. Validation Rules
`categorySchema`: `name` required, trimmed, 1–40 chars, no leading/trailing whitespace, must not duplicate an existing non-deleted name case-insensitively → "A category with this name already exists"; `color` must be one of the 12 palette values → 400 `validation_error`; `icon` must be in the allowed slug list → "Choose an icon from the list"; `sort_order` integer ≥ 0. `mergeSchema`: `into_id` required uuid ≠ `id`, must be an active category of the tenant → "Choose a different, active category". Server: 409 `duplicate_category`, 409 `category_in_use` on delete, 409 `last_category` on archiving the final active category, 409 `system_category_immutable` on deleting or merging away an `is_system` row, 409 `plan_limit_reached` above 40 active, 409 `merge_too_large` above 50,000 expenses, 404 cross-tenant, 403 `permission_denied`.

#### 11. Business Rules
1. BR-1 A category is **referenced**, not snapshotted: renaming it changes how every past expense is labelled. This is deliberate (the owner is correcting a label, not rewriting history); the audit log preserves the old name so a statement printed last month can still be explained.
2. BR-2 `system_code` is immutable and unique per tenant; it is the only safe way for code (PAY-06 fees, future EXP-04 templates, RPT mappings) to find a category.
3. BR-3 Seeding is idempotent: re-running `seed_expense_categories` for a tenant inserts only missing `system_code`s and never overwrites a renamed or recoloured row.
4. BR-4 Archiving never touches expenses; merging moves them. Neither ever changes an expense's `amount`, `date` or ledger effect.
5. BR-5 A merge is one-way and not undoable through the UI; the audit row records the source id, target id, moved count and moved total so a support engineer can reconstruct it.
6. BR-6 Colour is chosen from a fixed palette so that (a) contrast on both themes is guaranteed and (b) charts (EXP-03, RPT-09) can use the category colour directly as a `--viz-*` token without a runtime contrast check.
7. BR-7 The picker's usage-first ordering is computed from `expenses_expense` over the last 30 days, per tenant, cached 10 minutes; ties break by `sort_order`, then name.
8. BR-8 Category counts and amounts in `usage` always exclude `status='void'` expenses.
9. BR-9 Hindi-locale tenants receive Hindi seed names (§5); switching the tenant locale later does **not** rename existing categories (they are tenant data now).
10. BR-10 The **Other** system category can never be archived or deleted; it is the guaranteed landing place (FR-9).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View categories (settings screen and pickers) | `expenses.expense.read` | ✅ | ✅ | ✅ | ✅ |
| Create category (settings or inline) | `expenses.expense.write` | ✅ | ✅ | ✅ when they hold `expenses.expense.write` (off by default, EXP-01 §12) | ❌ |
| Rename / recolour / reorder | `expenses.expense.write` | ✅ | ✅ | ❌ (settings screen requires `platform.tenant.manage` to open) | ❌ |
| Archive / restore | `expenses.expense.write` + `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Merge | `expenses.expense.write` + `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Delete (unused, non-system) | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 Two staff create "Hamali" inline at the same second → the case-insensitive unique index rejects the second with 409 `duplicate_category`; the client silently selects the existing row instead of showing an error.
2. EC-2 Name differing only by trailing space or case ("rent " vs "Rent") → normalised (trim + `lower()` comparison) and treated as a duplicate.
3. EC-3 Name in Devanagari that normalises differently (NFC vs NFD) → the server normalises to NFC before comparison and storage.
4. EC-4 Owner archives every category except **Other** → allowed; the picker shows only **Other**; archiving **Other** → 409 `last_category`.
5. EC-5 Merge source and target both have expenses in a locked period (Phase 2 accounting) → merge still allowed (it changes classification, not money) but noted in the audit; §24 flags a possible future restriction.
6. EC-6 Merge of 48,000 expenses → runs in batches of 1,000 inside one transaction; the request is handled synchronously up to 50,000 with a 30 s budget; above that → 409 `merge_too_large` with guidance to export and re-import via the CA.
7. EC-7 A category is archived while an `ExpenseDrawer` is open with it selected → save still succeeds (the FK is valid); the drawer shows "(archived)" on the chip after save.
8. EC-8 Deleting an unused, non-system category that is referenced by an EXP-04 recurring template → 409 `category_in_use` (templates count as usage).
9. EC-9 Renaming **Fees** to "Bank charges" → PAY-06 settlement expenses continue to land there because the lookup is by `system_code='fees'`.
10. EC-10 A tenant reaches 40 active categories → **Add category** is disabled with a hint; inline creation returns 409 `plan_limit_reached` and the drawer explains it without losing the expense being typed.
11. EC-11 Reorder request fails mid-flight → the optimistic order reverts and a snackbar offers Retry; no partial order is ever persisted (single transaction).
12. EC-12 A colour from the palette is retired in a future release → existing rows keep their stored hex; the picker simply stops offering it.

#### 14. API Requirements
- `GET /expense-categories?status=active|archived|all&with_usage=true&date_from&date_to&q` → `data[]` of `{ id, name, system_code, color, icon, sort_order, is_system, status, usage?: { count, amount } }`. No pagination (bounded at 40 + archived; `page_size` accepted but ignored below 100).
- `POST /expense-categories { name, color?, icon? }` → 201; 409 `duplicate_category`, 409 `plan_limit_reached`.
- `PATCH /expense-categories/{id} { name?, color?, icon? }` → 200; 409 `duplicate_category`.
- `PATCH /expense-categories/reorder { ordered_ids: [uuid, …] }` → 200 `{ data: [...] }`; 400 when the id set does not match the tenant's active categories exactly.
- `POST /expense-categories/{id}/archive` → 200; 409 `last_category`. `POST /expense-categories/{id}/restore` → 200.
- `POST /expense-categories/{id}/merge { into_id }` → 200 `{ data: { moved, amount, target } }`; 409 `system_category_immutable`, 409 `merge_too_large`, 400 same-id.
- `DELETE /expense-categories/{id}` → 204; 409 `category_in_use`, 409 `system_category_immutable`.
- Frontend: `expenseCategoryService.ts` (`list`, `create`, `update`, `reorder`, `archive`, `restore`, `merge`, `remove`); `expenseCategorySlice` (`entities`, `order`, `usageRange`, `status`) + `expenseCategoryThunk.ts`; the picker reads from this slice, so EXP-01 never fetches categories itself; `categoryDisplay.ts` (`chipProps`, `usageLabel`, `pickerOrder`).

#### 15. Database Impact
`expenses_category` extended (CCR-33): `system_code varchar(24) NULL`, `color varchar(7) NN default '#8A94A0'`, `icon varchar(24) NN default 'ellipsis'`, `sort_order smallint NN default 100`, `status varchar(16) NN default 'active'`, `deleted_at timestamptz NULL`. Constraints: `U(tenant_id, lower(name)) WHERE deleted_at IS NULL`, `U(tenant_id, system_code) WHERE system_code IS NOT NULL`, `IX(tenant_id, status, sort_order)`. Writes on merge: bulk `UPDATE expenses_expense SET category_id = …` (batched) — the only bulk write in the expenses module; also updates `expenses_recurring` templates (EXP-04) when present. Reads `expenses_expense` for usage aggregates (`GROUP BY category_id` over the range, excluding `status='void'`). Writes `platform_audit_log`. Migration adds the columns nullable, backfills `system_code`/`color`/`icon`/`sort_order` for seeded rows in a data migration, then sets NOT NULL with `CHECK … NOT VALID` + `VALIDATE` per §21.8.

#### 16. Audit Requirements
`expense_category.created` (`after` = name, colour, icon, system_code), `expense_category.updated` (`before`/`after` of changed fields — **the old name is what makes BR-1 explainable**), `expense_category.reordered` (`metadata.ordered_ids`, one row per reorder, not per category), `expense_category.archived` / `.restored`, `expense_category.merged` (`metadata` = `{ source_id, source_name, target_id, target_name, moved_count, moved_amount }`), `expense_category.deleted` (`before` = full row). Seeding writes one `expense_category.seeded` row with `actor_type='system'` and the list of codes inserted.

#### 17. Notifications
Not applicable — category curation is a settings activity with immediate on-screen feedback and no time-delayed or party-facing outcome. The one exception is surfaced elsewhere: a merge that moves > 1,000 expenses writes an NTF-01 in-app notification to other owners/admins ("Rent and Shop rent were merged — 312 expenses moved") so a second administrator is not surprised by shifted month-end totals.

#### 18. Analytics / Event Tracking
`ub.expenses.categories_opened` `{ active_count, archived_count }`; `ub.expenses.category_created` `{ source: settings|inline, has_custom_color, has_icon, active_count_after }`; `ub.expenses.category_renamed` `{ was_system: bool }`; `ub.expenses.category_recoloured` `{}`; `ub.expenses.category_reordered` `{ count }`; `ub.expenses.category_archived` / `ub.expenses.category_restored` `{ was_system: bool, usage_count_bucket }`; `ub.expenses.category_merged` `{ moved_count_bucket, source_was_system: bool }`; `ub.expenses.category_deleted` `{}`; `ub.expenses.category_limit_hit` `{}`. Category **names** are never sent (they are tenant content); only `system_code` is, and only for seeded rows.

#### 19. Security
Tenant scoping on every read and write; cross-tenant category ids → 404, including as a `merge.into_id` and as an `ExpenseDrawer` selection. Names are stored as plain text, length-capped at 40, NFC-normalised, and rendered escaped — they appear in PDFs, CSV exports and WhatsApp text, so CSV injection is prevented by prefixing a leading `=`, `+`, `-` or `@` with `'` at export time (shared export utility). Colour and icon are validated against allowlists, never free-form (this also prevents CSS/SVG injection through a hex field). Merge is permission-gated and audited because it silently changes reported totals. Rate limits: default 600/min; 30/min on merge. No PII lives in this table.

#### 20. Performance
The whole table is ≤ 40 active rows per tenant, fetched once per session and cached in Redux; pickers never hit the network. `with_usage` adds one grouped aggregate over `expenses_expense` using `IX(tenant_id, category_id)` restricted by the date range — P95 ≤ 250 ms at 2,000 expenses/month; cached 10 minutes per tenant+range and invalidated on any expense write. Reorder is a single `UPDATE … FROM (VALUES …)` statement. Merge is batched at 1,000 rows per statement inside one transaction with a 30 s statement timeout; it locks nothing the expense list needs for more than a moment (row-level locks only).

#### 21. Testing
T-EXP-02-1 (unit) `seed_expense_categories` is idempotent: running it twice yields 9 rows; running it after a rename keeps the renamed row and does not re-insert the code. T-EXP-02-2 (unit) business-type extras are added for `food` and not for `retail`'s map, and are `is_system=false`. T-EXP-02-3 (unit) Hindi-locale tenant gets Hindi seed names with the same `system_code`s. T-EXP-02-4 (unit) case-insensitive uniqueness rejects "rent" against "Rent"; NFC normalisation collapses a decomposed Devanagari name. T-EXP-02-5 (unit) archiving the last active category → 409 `last_category`; **Other** can never be archived. T-EXP-02-6 (unit) delete allowed only with zero expenses and zero recurring templates and `is_system=false`. T-EXP-02-7 (unit) merge moves all expenses, archives the source, writes one audit row with counts and totals, and is rejected for a system source. T-EXP-02-8 (unit) merge of 5,000 expenses completes in batches and leaves zero rows on the source. T-EXP-02-9 (unit) `system_code='fees'` lookup survives a rename (PAY-06 settlement expense still lands correctly). T-EXP-02-10 (API) list with `with_usage` excludes void expenses and respects the date range. T-EXP-02-11 (API) reorder rejects a partial id set; a successful reorder is atomic. T-EXP-02-12 (API) permission matrix: staff with write can create inline but gets 403 on archive/merge/delete; accountant read-only. T-EXP-02-13 (component) `CategoryDialog` palette selection, duplicate error inline on the name field, live preview chip. T-EXP-02-14 (component) list renders usage, archived styling, system-row disabled delete with a help hint; mobile shows Move up/down instead of drag. T-EXP-02-15 (component) picker order is usage-first then `sort_order`. T-EXP-02-16 (E2E) rename Food → Chai-pani and verify an old expense's chip updates; merge Salary into Salaries and verify the month total is unchanged while the breakdown has one fewer row. T-EXP-02-17 (security) CSV export escapes a category named `=cmd()`; cross-tenant merge target → 404.

#### 22. Acceptance Criteria
- AC-1 (US-EXP-02-1) Given a newly created tenant, when the owner opens the expense drawer for the first time, then the category picker already lists Rent, Salaries, Electricity, Transport, Purchases-misc, Food, Marketing, Fees and Other, each with a colour and an icon, and `system_code` values are set.
- AC-2 (US-EXP-02-2) Given the seeded **Food** category, when the owner renames it to "Chai-pani" and picks amber, then every past and future expense in that category shows the new name and colour, `system_code` stays `food`, and the audit log holds the previous name.
- AC-3 (US-EXP-02-3) Given the management screen, when the owner adds "Mandi bhada" with a teal swatch, then a non-system category exists, appears in the picker, and after its first use rises to the top of the picker's usage-first order.
- AC-4 (US-EXP-02-4) Given an unused **Marketing** category, when the owner archives it, then it disappears from every picker, historical expenses (if any) render "Marketing (archived)", and **Show archived** reveals it with a Restore action.
- AC-5 (US-EXP-02-5) Given "Salary" with 312 expenses worth ₹4,12,300 and "Salaries", when the owner merges the first into the second and confirms the stated consequence, then all 312 expenses carry the target's id, the source is archived, one audit row records `moved_count=312` and `moved_amount=412300.00`, and the month's total spend is unchanged.
- AC-6 (US-EXP-02-6) Given a category with the teal swatch, when the expense list and the cashbook donut render, then both use that exact colour for the category and pair it with the category name as text (never colour alone).
- AC-7 (US-EXP-02-7) Given staff with expense-write permission at the counter, when they type "Hamali" in the category picker and tap **Create "Hamali"**, then the category is created, selected, and the expense saves in the same flow; a simultaneous duplicate attempt selects the existing row instead of erroring.

#### 23. Dependencies
EXP-01 (the only writer of `category_id`; inline creation), EXP-03 (category breakdown and donut colours), EXP-04 (recurring templates reference categories and block deletion), PAY-06 (`system_code='fees'` target for settlement charges), PLT-03 (onboarding seeding and business-type extras), PLT-05 (settings shell and `platform.tenant.manage`), RPT-09 (profit view grouping), NTF-01 (large-merge notice), `UbDialog`, `UbConfirmDialog`, `UbCombobox`, `MLItem`, `MLRadioGroup`, `MLDropdownMenu`, Part 23 palette, CCR-33/CCR-34.

#### 24. Future Enhancements
Category groups ("Fixed costs" vs "Variable costs") for a two-level P&L view; per-category monthly budgets with over-spend alerts (RPT-12); mapping a category to the CA's chart-of-accounts code for Tally/Zoho Books export (Phase 3); default tax code and ITC eligibility per category so GST fields prefill themselves; suggesting a category from the note text on recurring wordings ("auto" → Transport); restricting which categories staff may use; merge undo within 24 h via a stored reverse-mapping; sharing a curated category set across a partner's tenant base (WLB-07).

### EXP-03 — Cashbook view

#### 1. Business Objective
Answer the question every Indian shopkeeper asks at closing time — "how much cash should be in the drawer, and how much should be in the bank?" — by rolling every money event of the day into one day-wise in/out statement with opening and closing balances per cash bucket. The cashbook is the bridge between the khata (who owes what) and reality (what is actually in hand), and it is the fastest way to catch a missed entry. Measured by: cashbook closing balance equals the recomputed sum of all money events for ≥ 99.99 % of tenant-days (integrity job); page P95 ≤ 700 ms for a 31-day range; ≥ 50 % of daily-active owners open it at least once a week.

#### 2. User Personas
Owner (OW) closes the day against it; Staff (ST) may read the current day only when permitted (drawer tallying); Accountant (AC) reads any range and exports it for the CA; Partner admin (PA) and Customer (CU) are not involved.

#### 3. User Stories
1. US-EXP-03-1 — As an owner I want to see today's cash in, cash out and closing cash so that I can count the drawer against it before I shut the shop.
2. US-EXP-03-2 — As an owner I want cash and bank kept apart so that I do not confuse UPI money with notes in the till.
3. US-EXP-03-3 — As an owner I want to tap any row and see the bill, payment or expense behind it so that I can find the mistake when the count is off.
4. US-EXP-03-4 — As an owner I want to set my opening cash once so that the closing balance is a real number, not a delta.
5. US-EXP-03-5 — As an accountant I want a month's cashbook as CSV with opening and closing per day so that I can hand it to the CA.
6. US-EXP-03-6 — As an owner I want to see at a glance which category ate my cash this month so that I can act on it.
7. US-EXP-03-7 — As an owner I want money that arrived without a customer name to still show in the cashbook so that the bank ties out.

#### 4. Functional Requirements
1. FR-1 **Definition of a cashbook row (normative).** The cashbook is a *projection*, never a stored ledger. Its sources are exactly: (a) `payments_payment` with `status='recorded'` — `direction='in'` → inflow, `direction='out'` → outflow, one row **per `mode_breakup` entry** so a split payment contributes to two buckets; (b) `expenses_expense` with `status='recorded'` **and `paid=true`** → outflow under its `mode`; (c) `ledger_entry` with `entry_type IN ('manual_got','manual_gave')` **and** a non-null `payment_mode` → inflow/outflow (LED-01 cash received/given in the khata, which is real money movement); (d) opening balances (FR-5). **Excluded:** invoices, purchase bills, credit/debit notes, opening ledger balances, write-offs, unpaid expenses, void anything, and walk-in flags — none of these move money by themselves.
2. FR-2 **Buckets.** Every row falls into one of two buckets by mode: **Cash** (`mode='cash'`) and **Bank** (`mode ∈ {upi, bank, card, cheque, other}`). The bucket split is a display concern driven by `payments.cashbook_bank_modes` (tenant setting, default the four listed; `cheque` can be moved to a third "Cheque in hand" bucket in Phase 2). Each bucket carries its own opening, in, out and closing. A **Total** column sums both.
3. FR-3 **Day-wise computation.** For a requested range, `GET /reports/cashbook?date_from&date_to&mode&bucket` returns, per business date descending: `{ date, opening: { cash, bank, total }, in: { cash, bank, total }, out: { cash, bank, total }, closing: { … }, rows: [ … ] }` where `closing = opening + in − out` per bucket and the next (earlier) day's closing is the day's opening — computed forward from the anchor (FR-5) so a range starting mid-month is still correct. All arithmetic is `Decimal`, 2 decimals, half-up; no floating point anywhere in the pipeline.
4. FR-4 **Row shape.** Each row is `{ id, at (timestamp), date, source_type: payment|expense|ledger_entry, source_id, number, direction: in|out, mode, bucket, amount, party: { id, name } | null, label, reference, note, route }` where `label` is a humanised description ("Received from Ramesh Traders", "Rent — Landlord Sharma", "Cash given to Suresh") and `route` deep-links to the source detail drawer. Rows are ordered by `at` ascending within a day so the running balance reads like a passbook; a `running_after` per bucket is included for the day view.
5. FR-5 **Opening balance anchor.** A tenant sets a one-time anchor at `/settings/cashbook`: `cashbook.opening_cash`, `cashbook.opening_bank`, `cashbook.opening_as_of` (tenant settings, CCR-35), defaulting to ₹0 on the tenant's creation date. Every cashbook query computes the day's opening as `anchor + Σ(in − out) for all dates in (anchor_date, requested_date)`. The anchor may be edited by an owner at any time (it is a statement of fact, not a transaction); doing so shifts every closing balance and is audited with before/after. A **"Set opening balance"** call-to-action appears in the cashbook header until the anchor is set explicitly.
6. FR-6 **Page layout.** `/cashbook` (nav under "Money", beside Expenses): `UbPageHeader` "Cashbook" + `UbDateRangePicker` (chips **Today** · Yesterday · This week · This month · Last month · FY · Custom; default **This month**) + bucket `MLToggleGroup` (All · Cash · Bank) + **Export**. Below: a `UbStatCard` row — **Opening**, **Money in**, **Money out**, **Closing** (tone: Closing `success` when ≥ 0, `danger` when negative) — computed over the range. Then a day-grouped list: each day is an `MLAccordion`-style card with a header line "18/09 · Mon — In ₹12,400 · Out ₹3,180 · Closing ₹41,220" and, when expanded, its rows in a `UbDataGrid` (desktop) or `UbTimeline`-style stack (mobile). Today's card is expanded by default; others collapse.
7. FR-7 **Row interaction.** Tapping a row opens the source's own detail drawer in place (`PaymentDetailDrawer`, `ExpenseDetailDrawer`, `LedgerEntryDrawer`) via the shared drawer registry, so the cashbook never re-implements detail views. Editing or voiding from that drawer refreshes the affected day only (the slice patches that day's aggregate and re-derives later days' openings client-side, then revalidates from the server).
8. FR-8 **Today mode.** When the range is exactly today, the page adds a **Close the day** panel: "Expected cash in drawer ₹41,220" with a **Count cash** input (`UbMoneyInput`) that computes a difference — "Short by ₹120" / "Extra ₹40" — purely on the client at MVP (nothing is stored; the count is a mental check). If the difference is non-zero the panel suggests the two likely fixes: **Add an expense** (what you spent and forgot) or **Record a payment** (money received and not entered).
9. FR-9 **Category breakdown.** A collapsible **Where the money went** section shows, for the selected range, the out-flow split by expense category (EXP-02 colours) as a horizontal bar list with amounts and percentages, plus a single line for "Payments to suppliers" (out payments) and "Cash given (khata)" (manual_gave) so the three kinds of outflow are never conflated. Rendered with `MLChart*` only on desktop; mobile uses bars built from `MLProgress` to stay light.
10. FR-10 **Export.** **Export → CSV** produces one file with two sheets' worth of content in one flat table: a day summary block (`date, opening_cash, in_cash, out_cash, closing_cash, opening_bank, …, closing_total`) followed by the detail rows (`date, time, type, number, party, label, mode, bucket, in, out, reference, note`). Ranges over 5,000 rows go through the async export path (202 + `export_id`, `GET /reports/exports/{id}`, Part 22 §22.11) driven by a `platform_job` drained by `run_scheduler` (ADR-012), with the file stored as `files_attachment(kind='export_file')` and expiring after 7 days.
11. FR-11 **Unmatched money.** Payments with `party_id IS NULL` (PAY-07) appear with the label "Received — no customer yet" and a `warning` chip linking to the unmatched queue, because they are real money that must tie out to the bank even before anyone knows whose it is (US-EXP-03-7).
12. FR-12 **Voids.** A voided payment or expense disappears from the cashbook entirely from the day it was recorded (PAY-05 BR-4) — the cash never actually moved. For traceability the day card shows a muted footnote "1 voided entry on this day" linking to the day book (RPT-02), which *does* show void events.
13. FR-13 **Staff scope.** With `expenses.expense.read` but not `reports.financial.read`, staff see **today only**, Cash bucket only, without the opening anchor and without the category breakdown — enough to tally the till, not enough to read the business's position. The date picker is locked to Today and the bucket toggle is hidden.
14. FR-14 **Consistency job.** A nightly `manage.py check_cashbook` recomputes each active tenant's closing balance from scratch for the last 35 days and compares it with the incremental projection; a mismatch writes a `platform_audit_log` row (`actor_type='system'`, action `cashbook.mismatch`) and raises an NTF-01 to owners with a **Recheck** action. This is the integrity guarantee behind §1's 99.99 % metric.

#### 5. Non-Functional Requirements
Range query P95 ≤ 700 ms for 31 days / ~1,500 rows on the 100k-row performance fixture; **Today** P95 ≤ 250 ms. Opening-balance computation must not scan the whole history: it uses a monthly rollup cache (§20). Page JS ≤ 200 kB; the chart section is code-split and loaded only when expanded on desktop. Amounts are tabular (`ds-num`) and right-aligned so columns compare vertically. Accessibility: the day accordion is keyboard-operable, running balances are exposed in the accessible name of each row, and the in/out distinction is carried by a text prefix ("+"/"−") as well as colour. Offline: the last fetched range is served from the Redux cache with a "Showing saved data" banner. en/hi throughout; dates dd/mm/yyyy; weekday names localised.

#### 6. User Flow
Primary (closing time): Cashbook → chip **Today** → cards show "In ₹12,400 · Out ₹3,180 · Closing cash ₹18,260 · Closing bank ₹22,960" → owner counts the drawer, types 18,140 → "Short by ₹120" → taps **Add an expense** → records ₹120 auto fare → the panel returns to "Matches".
Alternate A (find the mistake): the owner scans the rows, spots "Received from Ramesh ₹5,000 — UPI" that should have been cash → opens the payment → PAY-05 void → re-records with the right mode → the day recomputes.
Alternate B (month view): chip **This month** → stat cards show opening ₹32,000, in ₹4,12,000, out ₹3,86,000, closing ₹58,000 → **Where the money went** shows Salaries 41 %, Rent 28 %, Transport 9 %.
Alternate C (first run): the anchor is unset → a `UbStatusBanner` "Set your opening cash and bank balance so closing balances are real" → **Set opening balance** → ₹25,000 cash / ₹1,10,000 bank as of 01/04/2026 → every closing recomputes.
Alternate D (accountant export): range **Last month** → **Export** → 3,200 rows → CSV downloads immediately; a 12-month range → 202 + "We are preparing your file" → notification when ready.
Alternate E (staff): Priya opens Cashbook → sees only today's cash rows and the closing cash figure.
Alternate F (unmatched): a ₹898 online credit with no party shows as "Received — no customer yet" with a chip that opens PAY-07.

#### 7. UI Requirements
`CashbookPage`: `UbPageHeader` ("Cashbook", description "Money in and out, day by day") with `UbDateRangePicker`, bucket `MLToggleGroup`, `MLDropdownMenu` **Export** (CSV · Copy summary). `UbStatCard` row of four (mobile: 2×2 grid, values `ds-metric-sm`; desktop: 4-up, `ds-metric-md`), each with a baseline caption ("as on 18/09", "in this range"). `CloseTheDayPanel` (today only): expected cash `ds-metric-lg`, `UbMoneyInput` "Counted cash", a difference chip (`success` "Matches", `warning` "Short by ₹120", `info` "Extra ₹40") and two ghost CTAs. `DayCard` (`MLCard`): header row — date + weekday `ds-body-medium`, three `UbAmount`s (In green, Out neutral with "−", Closing bold) and a chevron; body — `UbDataGrid` on desktop with columns Time, Type (glyph + label), Number (`ds-mono`), Party, Mode, In, Out, Balance; on mobile a stacked list where each row is Label / Party · Mode on the second line / amount on the right with a leading + or −. `WhereTheMoneyWent`: category rows with a colour dot, name, `MLProgress` bar, amount and percentage; a "Show all" expander past the top 8. Empty states: first-use ("No money movements yet — record a payment or an expense"), filtered-empty ("Nothing on these dates"), error (retry + request id). `SetOpeningBalanceDialog` (`UbDialog`): two `UbMoneyInput`s and a `UbDateInput`, with a warning caption "This changes every closing balance after this date".

#### 8. UX Requirements
Keys: `cashbook.title` "Cashbook", `cashbook.desc` "Money in and out, day by day", `cashbook.opening` "Opening", `cashbook.in` "Money in", `cashbook.out` "Money out", `cashbook.closing` "Closing", `cashbook.cash` "Cash", `cashbook.bank` "Bank & UPI", `cashbook.total` "Total", `cashbook.closeDay` "Close the day", `cashbook.expectedCash` "Expected cash in drawer", `cashbook.countedCash` "Counted cash", `cashbook.matches` "Matches", `cashbook.short` "Short by {amount}", `cashbook.extra` "Extra {amount}", `cashbook.addExpense` "Add an expense", `cashbook.recordPayment` "Record a payment", `cashbook.whereMoneyWent` "Where the money went", `cashbook.setOpening` "Set opening balance", `cashbook.setOpeningHint` "This changes every closing balance after this date", `cashbook.noCustomerYet` "Received — no customer yet", `cashbook.voidedNote` "{count} voided entry on this day", `cashbook.staffScope` "You can see today's cash only", `cashbook.empty.first` "No money movements yet", `cashbook.empty.filtered` "Nothing on these dates". Hindi: "रोकड़ बही", "शुरुआती बाकी", "आया", "गया", "अंतिम बाकी", "नकद", "बैंक व यूपीआई", "दिन बंद करें", "गल्ले में होना चाहिए", "गिना हुआ नकद", "{amount} कम", "{amount} ज़्यादा", "पैसा कहाँ गया". Colour: inflows `--success`, outflows plain `--text-primary` with a "−" prefix (never red — an expense is not an error), closing `--success` when positive and `--error` when negative with the label "Negative — check your entries". The counted-cash difference is never framed as an accusation ("Short by ₹120" with the two helpful CTAs, not "Missing money").

#### 9. States
Page: Initial · Loading (4 stat skeletons + 3 day-card skeletons) · Ready · Empty first-use · Filtered-empty · Error (retry + request id) · Stale/offline (banner "Showing saved data from 11:04"). Day card: Collapsed · Expanded · Loading rows (when a day is expanded lazily for long ranges) · Empty day (rendered only when the range explicitly includes it and `show_empty_days=true`, otherwise skipped). Close-the-day panel: Idle · Counted-matches · Counted-short · Counted-extra. Anchor: Unset (banner + CTA) · Set · Editing · Saving · Error. Export: Idle · Preparing (inline spinner) · Ready (auto-download) · Queued (202 with "We'll notify you") · Failed (retry). Integrity: Normal · Mismatch detected (owner-only `UbStatusBanner` "Your cashbook needs a recheck" with a **Recheck** action).

#### 10. Validation Rules
Query params: `date_from` ≤ `date_to`, both `YYYY-MM-DD`, range ≤ 366 days → 400 `validation_error` `details.date_to: ["Choose a range of one year or less"]`; `bucket ∈ {all, cash, bank}`; `mode` optional single value from the mode enum; `format ∈ {json, csv, xlsx}`. `openingBalanceSchema`: `opening_cash`, `opening_bank` via `amountValidation()` allowing **0 and negative** (an overdraft bank balance is legitimate) with a max magnitude of 9,99,99,999.99; `opening_as_of` via `businessDateValidation()` — not in the future, not before `tenant.created_at − 5 years` → "Date cannot be in the future". `countedCash` (client-only) ≥ 0. Server: 403 `permission_denied` when a staff member requests a non-today range or the bank bucket; 403 `module_disabled` when `expenses` is off (the cashbook still renders payments only — see EC-9); 429 on the export limit (10/hour, Part 22 §22.1).

#### 11. Business Rules
1. BR-1 The cashbook is derived, never stored. There is no `cashbook` table; every number is recomputed from `payments_payment`, `expenses_expense`, `ledger_entry` and the anchor. This is why a void (PAY-05 BR-4) erases a row retroactively and why `check_cashbook` (FR-14) can always prove the number.
2. BR-2 **Closing formula** per bucket *b* and day *d*: `closing(b,d) = opening(b,d) + in(b,d) − out(b,d)`, where `opening(b,d) = closing(b, d−1)` and `opening(b, anchor_date) = anchor(b)`. Amounts are `Decimal('0.01')`-quantised half-up at every step; the Total column is `cash + bank`, not a separately rounded figure.
3. BR-3 A split payment (PAY-02) contributes one row per `mode_breakup` entry; the sum of its rows equals the payment's `amount` exactly (the breakup is validated to sum at PAY-02).
4. BR-4 Unpaid expenses (EXP-01 `paid=false`) never appear; the money leaves the business only when the settling payment is recorded, and that payment appears instead.
5. BR-5 Manual ledger entries appear **only** when they carry a `payment_mode` — a "you gave" entry recording goods sold on credit is not a cash event, while "cash given ₹2,000 (cash)" is.
6. BR-6 Invoices, bills, credit notes and opening balances never appear; they change what is owed, not what is held. This is the single most important boundary in the feature and is stated in the UI help hint.
7. BR-7 Anchor edits are retroactive by design and audited; there is no "adjustment entry" concept at MVP (that would be an accounting feature — §24).
8. BR-8 Bucket assignment is by payment mode, not by party or document; a cheque received is Bank on the day it is recorded (Phase 2 adds a "cheque in hand → cleared" state, PAY-09).
9. BR-9 Negative closing balances are permitted and displayed (they usually mean a missing inflow); the product never blocks or auto-corrects them.
10. BR-10 The day boundary is the tenant's timezone (`Asia/Kolkata` default) applied to each source's **business date** (`payment_date`, `expense_date`, `entry_date`), not to `created_at` — a payment backdated to yesterday belongs to yesterday.
11. BR-11 Rows are ordered within a day by `(business date, created_at)`; the running balance therefore follows entry order, which matches how a paper rokad is written.
12. BR-12 `reports.financial.read` gates ranges beyond today and the bank bucket (FR-13); this is enforced server-side, not merely hidden.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View today, cash bucket | `expenses.expense.read` | ✅ | ✅ | ✅ | ✅ |
| View any range, both buckets, category breakdown | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Open a source row's detail drawer | the source's own read codename | ✅ | ✅ | ✅ (payments/expenses they may read) | ✅ |
| Set / edit the opening balance anchor | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Export CSV/XLSX | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Trigger a recheck after a mismatch | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 Range starts before the anchor date → opening for those days is reported as the anchor value with a caption "Before your opening balance date" and inflows/outflows are still listed (they are real events); the closing series joins the anchor cleanly at the anchor date.
2. EC-2 No money events at all in the range → filtered-empty state, but the stat cards still show the (identical) opening and closing so the owner sees the standing balance.
3. EC-3 A day with 400 rows (a busy wholesaler) → the day card paginates internally at 100 rows with **Show more**; the day's totals are computed server-side over all rows, never from the visible page.
4. EC-4 A payment backdated 60 days inside a viewed month → all subsequent days' openings shift; the client refetches the range rather than patching (the aggregate is cheap).
5. EC-5 Void of a payment currently visible → the row disappears on refresh and the day footnote count increments; if the user had the payment drawer open, closing it triggers the day refresh.
6. EC-6 Anchor set to a date after some existing events → those earlier events still appear (EC-1), and the banner explains "Events before 01/04/2026 are shown but not counted in the opening balance".
7. EC-7 Tenant timezone changed (rare) → the projection re-buckets by the new timezone on the next query; the integrity job's next run reports no mismatch because both sides use the same rule.
8. EC-8 A cheque payment that later bounces → handled as a PAY-05 void with reason "Cheque bounced"; the cashbook row disappears from the original day, which is the correct cash reality.
9. EC-9 `expenses` module disabled for the tenant → the cashbook still renders (payments and manual cash entries only), the **Where the money went** section is hidden, and a hint explains that enabling Expenses completes the picture.
10. EC-10 Staff opens a deep link to last month's cashbook → 403 `permission_denied` handled as a friendly page "You can see today's cash only".
11. EC-11 Two owners set the anchor simultaneously → last write wins with `version` on the settings object (409 `stale_version` on a conflict); both edits are audited.
12. EC-12 Range of 366 days with 40,000 rows → the detail list is not returned inline; the API returns day summaries with `rows_truncated: true` and the UI shows "Open a day to see its entries" (per-day lazy fetch via `GET /reports/cashbook/day?date=`).
13. EC-13 An `other`-mode payment (mode "other") → bucketed as Bank by default; the setting allows moving it to Cash for tenants who use "other" to mean barter/adjustment.
14. EC-14 Negative anchor (bank overdraft of −₹40,000) → accepted; closing balances render negative in `--error` with the "Negative" label.

#### 14. API Requirements
- `GET /reports/cashbook?date_from&date_to&bucket=all|cash|bank&mode&include_rows=true|false&show_empty_days=false&format=json|csv|xlsx` (Part 22 §22.11) → `{ data: { anchor: { cash, bank, as_of }, range: { opening: {…}, in: {…}, out: {…}, closing: {…} }, days: [ { date, opening, in, out, closing, rows?: [...], rows_truncated?, voided_count } ], breakdown: { by_category: [...], supplier_payments, cash_given } }, meta: { rows_total, generated_at } }`.
- `GET /reports/cashbook/day?date=YYYY-MM-DD&page&page_size` → one day's rows, paginated (used by EC-3/EC-12 and by the lazy accordion).
- `GET /reports/cashbook.csv?…` → immediate file below 5,000 rows, otherwise 202 `{ export_id }` + `GET /reports/exports/{id}` (shared export path, ADR-012 job).
- `GET/PUT /tenants/current/settings` keys `cashbook.opening_cash`, `cashbook.opening_bank`, `cashbook.opening_as_of`, `payments.cashbook_bank_modes` (CCR-35) — PUT validated against the settings JSON schema, `version` required.
- `POST /reports/cashbook/recheck` (owner) → 202, enqueues `platform_job('reports.check_cashbook', { tenant_id })`.
- Frontend: `cashbookService.ts` (`getRange`, `getDay`, `export`, `recheck`); `cashbookSlice` (`range`, `days`, `breakdown`, `anchor`, `filters`, `expandedDays`, `countedCash`, `status`) + `cashbookThunk.ts`; `cashbookDisplay.ts` (`rowLabel`, `bucketOf`, `runningBalances`, `differenceChip`, `dayHeader`); the drawer registry in `features/shared/drawers/` resolves `source_type` → detail component (FR-7).

#### 15. Database Impact
**No new tables and no writes** on the read path. Reads: `payments_payment` (+`mode_breakup` jsonb), `payments_allocation` (only for labels), `expenses_expense`, `expenses_category`, `ledger_entry`, `parties_party` (names), `platform_tenant_setting` (anchor, bank modes). Writes: `platform_tenant_setting` (anchor edit), `platform_audit_log` (anchor edit, mismatch), `platform_job` + `files_attachment` (async export), `notifications_notification` (mismatch, export ready). New indexes (CCR-35): `IX(tenant_id, payment_date) WHERE status='recorded'` on `payments_payment`; `IX(tenant_id, expense_date) WHERE status='recorded' AND paid` on `expenses_expense`; `IX(tenant_id, entry_date) WHERE payment_mode IS NOT NULL AND status='posted'` on `ledger_entry`. Optional rollup cache `reports_snapshot` rows keyed `('cashbook_month', tenant_id, 'YYYY-MM')` holding per-bucket monthly in/out totals to make opening-balance computation O(months) instead of O(rows) (§20); the snapshot is a cache only and is invalidated on any money write in that month.

#### 16. Audit Requirements
`cashbook.opening_balance_set` (`before`/`after` = `{ cash, bank, as_of }`, `metadata.reason?`) — the only user-driven mutation this feature has; `cashbook.exported` (`metadata` = range, format, row_count) written through the shared export path; `cashbook.mismatch` (`actor_type='system'`, `metadata` = `{ date, expected, computed, delta }`) from the nightly job; `cashbook.recheck_requested`. Viewing is not audited (it is a read of data the member is already entitled to), consistent with the other report features.

#### 17. Notifications
- In-app (NTF-01) `cashbook_mismatch` (owner/admin only): "Your cashbook needs a recheck — 18/09 is off by ₹120", `data.route=/cashbook?date=2026-09-18`, action **Recheck**; raised at most once per tenant per day by the nightly job.
- In-app `export_ready` (shared): "Your cashbook for August is ready to download", `data.route=/reports/exports/{id}` — the standard async-export notification, not specific to this feature.
- No SMS, WhatsApp, email or push at MVP: the cashbook is an internal reading surface. A **daily closing summary** push/WhatsApp is listed in §24 and belongs to NTF-04/NTF-05.

#### 18. Analytics / Event Tracking
`ub.expenses.cashbook_viewed` `{ range_chip: today|yesterday|week|month|last_month|fy|custom, bucket, days_in_range, rows_bucket }`; `ub.expenses.cashbook_day_expanded` `{ rows_bucket, is_today }`; `ub.expenses.cashbook_row_opened` `{ source_type }`; `ub.expenses.cashbook_close_day_used` `{ difference: match|short|extra, difference_bucket }`; `ub.expenses.cashbook_close_day_cta` `{ cta: add_expense|record_payment }`; `ub.expenses.cashbook_breakdown_expanded` `{ categories_count }`; `ub.expenses.cashbook_exported` `{ format, days_in_range, async: bool }`; `ub.expenses.cashbook_opening_set` `{ had_previous: bool }`; `ub.expenses.cashbook_mismatch_seen` (server) `{ delta_bucket }`. No amounts beyond buckets, no party names, no category names.

#### 19. Security
Every query is tenant-scoped through the tenant manager; a cross-tenant `source_id` can never appear because rows are generated from tenant-scoped querysets, and the detail drawers re-check on open (404 cross-tenant). The staff scope of FR-13 is enforced in the view (`reports.financial.read` check on `date_from != today` or `bucket != 'cash'`), never only in the UI — this is the feature's main authorisation risk, since the cashbook reveals total business cash position. Exports inherit the shared export security: files stored under a UUID key, served through an authenticated view, expiring after 7 days, with CSV-injection escaping on every text column (labels, notes, party names, references). Notes and references are rendered escaped. The anchor endpoint is `platform.tenant.manage` because it reframes every historical closing balance. Rate limits: default 600/min, exports 10/hour. No new PII is introduced; party names already visible to the member are reused.

#### 20. Performance
The naive opening-balance computation would scan all history; instead the API sums the `reports_snapshot` monthly rollups for whole months before the range and scans raw rows only for the partial first month — O(months) + O(rows in range). Each source is queried once with an indexed range scan (§15) and merged in Python by date; `select_related('party', 'category')` prevents N+1. `include_rows=false` is used by the stat cards and by ranges over 92 days, cutting the payload to day summaries (≤ 25 kB for a year). Day rows are capped at 100 with per-day lazy fetch. The whole response is cached in-process for 60 s per (tenant, range, bucket) and invalidated by any payment/expense/ledger write in the range. Target P95: 250 ms today, 700 ms a month, 1.2 s a year with `include_rows=false`. CI asserts query counts (≤ 6) and runs `EXPLAIN` on each source query against the 100k-row fixture.

#### 21. Testing
T-EXP-03-1 (unit) projection includes exactly the four sources of FR-1 and excludes invoices, bills, credit notes, opening ledger balances, write-offs, unpaid expenses and void rows (table-driven over 14 fixture events). T-EXP-03-2 (unit) split payment of ₹1,000 (UPI 700 + cash 300) yields two rows in two buckets summing to ₹1,000. T-EXP-03-3 (unit) closing formula chains correctly across 10 days including a zero-activity day. T-EXP-03-4 (unit) anchor arithmetic: range starting before, on and after the anchor date. T-EXP-03-5 (unit) manual ledger entry with `payment_mode=null` is excluded; with `payment_mode='cash'` is included as an outflow. T-EXP-03-6 (unit) backdated payment shifts subsequent openings; timezone boundary at 23:58 IST books on the business date. T-EXP-03-7 (unit) void removes the row from its original day and increments `voided_count`. T-EXP-03-8 (unit) unmatched payment (`party_id NULL`) appears with the no-customer label. T-EXP-03-9 (unit) negative anchor and negative closing render and compute correctly. T-EXP-03-10 (unit) `check_cashbook` detects a deliberately corrupted cache and writes the audit row + notification. T-EXP-03-11 (API) range > 366 days → 400; staff requesting yesterday → 403; staff requesting the bank bucket → 403. T-EXP-03-12 (API) `include_rows=false` shape and size; `rows_truncated` on a 40k-row range; `/reports/cashbook/day` pagination. T-EXP-03-13 (API) CSV under 5,000 rows is immediate; over goes async and the job produces a downloadable file with escaped formulas. T-EXP-03-14 (API) anchor PUT requires `platform.tenant.manage`, validates the future date, audits before/after, and returns 409 `stale_version` on a concurrent edit. T-EXP-03-15 (component) day card expand/collapse, mobile stacked rows, +/− prefixes, negative closing styling. T-EXP-03-16 (component) close-the-day panel difference states and CTAs; hidden when the range is not today. T-EXP-03-17 (component) staff scope hides the bucket toggle, locks the range and hides the breakdown. T-EXP-03-18 (E2E) record payment ₹500 cash + expense ₹120 cash → today's closing changes by +380 → void the expense → closing returns to +500. T-EXP-03-19 (perf) 31-day range on the 100k fixture ≤ 700 ms with ≤ 6 queries.

#### 22. Acceptance Criteria
- AC-1 (US-EXP-03-1) Given today's events of ₹12,400 in and ₹3,180 out across cash and bank, when the owner opens the Cashbook with the **Today** chip, then the four stat cards show Opening, Money in ₹12,400, Money out ₹3,180 and Closing = Opening + 12,400 − 3,180, and today's day card is expanded with its rows in entry order.
- AC-2 (US-EXP-03-2) Given a ₹1,000 payment split UPI ₹700 / cash ₹300, when the cashbook renders that day, then two rows appear — ₹700 under Bank & UPI and ₹300 under Cash — and the two buckets' closings differ accordingly while the Total column matches the single payment amount.
- AC-3 (US-EXP-03-3) Given any cashbook row, when the owner taps it, then the source's own detail drawer opens (payment, expense or ledger entry) and voiding from there removes the row and updates that day's totals without a full page reload.
- AC-4 (US-EXP-03-4) Given an unset anchor, when the owner sets opening cash ₹25,000 and bank ₹1,10,000 as of 01/04/2026, then the banner disappears, every day's opening and closing recomputes from that anchor, and an audit row records the before/after values.
- AC-5 (US-EXP-03-5) Given last month with 3,200 rows, when the accountant exports CSV, then the file downloads immediately and contains a day-summary block with opening and closing per bucket followed by detail rows, with any leading `=`, `+`, `-` or `@` in text columns escaped.
- AC-6 (US-EXP-03-6) Given this month's outflows, when **Where the money went** is expanded, then expense categories are listed with their EXP-02 colours, amounts and percentages, plus separate lines for supplier payments and cash given through the khata, and the three groups sum to the range's Money out.
- AC-7 (US-EXP-03-7) Given a ₹898 online payment with no party (PAY-07), when the cashbook renders that day, then the row appears under Bank & UPI labelled "Received — no customer yet" with a chip linking to the unmatched queue, and the day's closing includes it.

#### 23. Dependencies
EXP-01 (expenses and their `paid` flag), EXP-02 (category names and colours for the breakdown), PAY-01/PAY-02 (payments and `mode_breakup`), PAY-05 (void semantics, BR-4), PAY-07 (unmatched rows), LED-01 (manual entries with `payment_mode`), PLT-05 (tenant settings and `version`), RPT-02 (day book for void traceability), RPT-11 (shared export path and `reports_snapshot`), NTF-01, ADR-012 (`platform_job`/`run_scheduler` for async export and the nightly check), `UbDateRangePicker`, `UbStatCard`, `UbDataGrid`, `UbMoneyInput`, `UbAmount`, `MLToggleGroup`, `MLProgress`, `MLChart*`, CCR-35.

#### 24. Future Enhancements
Multiple cash accounts and bank accounts instead of two buckets (a real chart of cash accounts), with transfers between them; "cheque in hand" as a third bucket with a clearing workflow (PAY-09); a stored daily closing with a signed-off "day closed" state and a cash-count variance record instead of the client-only check; a daily closing summary sent on WhatsApp/push at a configured time (NTF-04/NTF-05); bank statement import with automatic matching so the Bank bucket reconciles to the statement line by line (PAY-08); per-user drawer accountability for shops with shifts; petty-cash float management; cash-flow forecasting from open receivables, payables and recurring expenses (EXP-04 + RPT-13).

### EXP-04 — Recurring expenses — Phase 2

#### 1. Business Objective
Stop the owner from re-typing the same rent, salary, rent-of-godown, internet bill and subscription every month — and, more importantly, stop them from *forgetting* one, which is the usual reason a month's profit looks better than it was. A recurring expense is a **template plus a schedule** that the cron-driven scheduler turns into real `expenses_expense` rows, either automatically or after a one-tap confirmation, with a clear upcoming list so the owner can see what is about to leave the account. Measured by: ≥ 80 % of tenants with a monthly rent record it as a template by month 3; ≥ 95 % of due templates generate within 30 minutes of their scheduled time; ≤ 2 % of generated expenses are voided in the first week (the templates are right).

#### 2. User Personas
Owner (OW) creates and manages templates and confirms drafts; Admin (AD) same; Staff (ST) never touches templates and does not see the upcoming list; Accountant (AC) reads the templates and the upcoming list to forecast payables; Super admin (SA) is not involved.

#### 3. User Stories
1. US-EXP-04-1 — As an owner I want to set my shop rent of ₹12,000 to repeat on the 5th of every month so that I never re-type it.
2. US-EXP-04-2 — As an owner I want salaries for four staff to be created on the 1st so that my month starts with the real cost visible.
3. US-EXP-04-3 — As an owner I want to review a recurring expense before it is recorded, because the electricity bill changes every month.
4. US-EXP-04-4 — As an owner I want to see what is coming in the next 30 days so that I know how much cash to keep.
5. US-EXP-04-5 — As an owner I want to pause a template when the shop is shut for two months, and resume it later.
6. US-EXP-04-6 — As an owner I want to change the rent amount from April and have past entries untouched.
7. US-EXP-04-7 — As an owner I want a reminder when a recurring payment is due so that the landlord does not have to call me.

#### 4. Functional Requirements
1. FR-1 **Template model.** `expenses_recurring` (new table, CCR-36): `id`, `tenant_id`, `name varchar(80) NN`, `category_id FK NN`, `party_id FK NULL`, `amount numeric(14,2) NN CHECK > 0`, `amount_mode varchar(8) NN default 'fixed'` (`fixed` | `variable`), `mode varchar(12) NN`, `reference_template varchar(64) NULL`, `note varchar(255)`, `paid boolean NN default true`, `due_day_offset smallint NULL` (days after generation for `paid=false` templates), `tax_code`, `tax_inclusive`, `itc_eligible`, `frequency varchar(12) NN` (`daily`, `weekly`, `monthly`, `quarterly`, `yearly`), `interval smallint NN default 1`, `day_of_month smallint NULL` (1–31 or `-1` for last day), `weekday smallint NULL` (0–6), `month_of_year smallint NULL`, `starts_on date NN`, `ends_on date NULL`, `max_occurrences smallint NULL`, `auto_record boolean NN default false`, `lead_days smallint NN default 0`, `next_run_on date NN`, `last_run_on date NULL`, `occurrences_created int NN default 0`, `status varchar(12) NN default 'active'` (`active`, `paused`, `ended`), `created_by_id`, timestamps. Indexes `IX(tenant_id, status, next_run_on)`, `IX(tenant_id, category_id)`.
2. FR-2 **Create from scratch or from an existing expense.** `/expenses/recurring` → **Add recurring expense**, or from any `ExpenseDetailDrawer` → ⋯ **Make this repeat** which prefills every field from that expense. The form (`RecurringExpenseDrawer`) reuses EXP-01's field set (amount, category, mode, party, note, GST block, paid switch) and adds a **Repeats** section: frequency `MLSelect`, interval `MLInput` ("every 1 month"), day-of-month `MLSelect` (1–31 · Last day) or weekday picker, **Starts on** `UbDateInput`, **Ends** `MLRadioGroup` (Never · On a date · After N times), **Record automatically** `MLSwitch` (default **off**), and **Remind me** lead days `MLSelect` (Same day · 1 day before · 3 days before · 7 days before).
3. FR-3 **Generation runs on the scheduler, not on a queue.** The management command `manage.py generate_recurring_expenses` is registered as a scheduled task run by `python manage.py run_scheduler` (ADR-012) once per tick with an internal guard so it does real work at most once per tenant-day (a `platform_job` row of kind `expenses.generate_recurring` with a `dedupe_key = f"{tenant_id}:{date}"`). For each `active` template with `next_run_on ≤ today`, it creates the occurrence (FR-4), advances `next_run_on` (BR-2), increments `occurrences_created`, and ends the template when `ends_on`/`max_occurrences` is reached. The command is **idempotent**: a unique constraint `U(recurring_id, occurrence_date)` on the generated expense (`expenses_expense.recurring_id`, `recurring_occurrence_date` — CCR-36) makes a double run a no-op.
4. FR-4 **Two generation outcomes.** With `auto_record=true` the occurrence is created immediately as a real `expenses_expense` (`status='recorded'`, `meta.source='recurring'`) through the **same** `expenses.services.record_expense()` used by EXP-01 — same validation, same numbering, same ledger rule, same audit — with `created_by=None` and `actor_type='system'`. With `auto_record=false` (the default) it is created as a **pending occurrence** row in `expenses_recurring_occurrence` (CCR-36: `recurring_id`, `occurrence_date`, `amount_suggested`, `status ∈ {pending, recorded, skipped}`, `expense_id NULL`, `skipped_reason`) which appears in the **Upcoming** list awaiting a one-tap confirm; nothing touches the ledger or the cashbook until confirmed.
5. FR-5 **Confirm / skip / edit.** In the upcoming list each pending occurrence offers **Record** (one tap: creates the expense with the suggested values), **Edit & record** (opens `ExpenseDrawer` prefilled — used for `amount_mode='variable'` items like electricity), and **Skip this time** (`UbReasonDialog`, sets `status='skipped'` with a reason; the template still advances). `POST /expenses/recurring/occurrences/{id}/record { amount?, expense_date?, … }` and `/skip { reason }`.
6. FR-6 **Upcoming list.** `/expenses/recurring` has two tabs: **Templates** (the list of recurring definitions with name, amount, frequency summary "Every month on the 5th", next date, status, and a row menu) and **Upcoming** (the next 30/60/90 days, default 30, combining pending occurrences with projected future dates from active templates that have not yet generated, grouped by date, with a header total "₹58,400 due in the next 30 days"). The Upcoming totals feed the cashbook's future view in §24 and the dashboard tile "Coming up" (RPT-01).
7. FR-7 **Pause / resume / end.** `POST /expenses/recurring/{id}/pause` sets `status='paused'` (generation stops, `next_run_on` is preserved and rolled forward on resume so a paused template does not back-fill); `/resume` returns it to `active` recomputing `next_run_on` to the first future date; `/end` sets `status='ended'` (terminal, keeps history). Pending occurrences of a paused template are cancelled with `skipped_reason='template_paused'`.
8. FR-8 **Amount changes are effective-forward.** Editing a template's amount, category, party, mode or GST fields affects only future generations; already-generated expenses are untouched (BR-4). A `PATCH /expenses/recurring/{id}` requires `version` and shows a confirmation "This changes future entries only. Past entries stay as they are."
9. FR-9 **Reminders.** `lead_days` schedules an NTF-01 in-app notification (and, when NTF-02 has a live provider **and** the tenant opted in, no SMS — this is an internal reminder, never party-facing) at 09:15 IST on `occurrence_date − lead_days`: "Rent ₹12,000 to Landlord Sharma is due on 05/10" with actions **Record now** / **Skip**. Reminders are raised by the same scheduler tick and are idempotent on `(occurrence_id, lead_days)`.
10. FR-10 **Salaries as a group (pragmatic MVP-of-Phase-2).** Rather than a payroll module, an owner creates one template per person (name "Salary — Priya") or one aggregate template ("Salaries — 4 staff, ₹48,000"). The form offers a **Duplicate template** action so creating four salary templates takes four taps after the first.
11. FR-11 **Interaction with EXP-02.** A category used by an active or paused template cannot be deleted (EXP-02 EC-8 → 409 `category_in_use`); merging a category rewrites `expenses_recurring.category_id` in the same transaction as the expense rows (EXP-02 §15).
12. FR-12 **Limits and safety.** Maximum 50 active templates per tenant (409 `plan_limit_reached`); `daily` frequency requires an `ends_on` or `max_occurrences` (guard against runaway generation); generation never creates more than 12 occurrences per template in a single run (a template dormant for two years catches up 12 at a time, with a banner "Catching up — 12 of 24 entries created") so one bad template cannot flood a tenant's books.
13. FR-13 **Backfill policy.** A template created with `starts_on` in the past generates **nothing** retroactively by default; the create form asks explicitly "Start from 01/04/2026 — create the 3 entries that were already due?" with a default of **No**. If accepted, those occurrences are created as `pending` (never auto-recorded), regardless of `auto_record`.
14. FR-14 **Visibility of provenance.** Every expense generated from a template shows a `MLBadge` "Recurring" in the list and, in its detail drawer, a line "From: Rent — every month on the 5th" linking to the template; `expenses_expense.recurring_id` makes this queryable and lets RPT-09 separate fixed from variable costs.

#### 5. Non-Functional Requirements
Generation for a tenant with 50 templates completes in ≤ 2 s inside one scheduler tick and never holds a transaction open across templates (one transaction per occurrence, so a single bad template cannot block the rest). The scheduler tick's total budget across all tenants is bounded: at most 500 occurrences per tick, resuming on the next tick, so a 60 s cron cadence stays honest. Upcoming list P95 ≤ 400 ms for 50 templates × 90 days (projection is arithmetic, not I/O). Templates page ≤ 150 kB JS. The whole feature degrades safely: if the scheduler is down, nothing is silently lost — `next_run_on` stays in the past and the next successful tick catches up (FR-12 cap). en/hi throughout; frequency summaries are composed from ICU messages, never string-concatenated. Accessibility: the schedule builder is fully keyboard-operable and its result is restated in plain language ("Every month on the 5th, from 5 October 2026, forever") above the save button.

#### 6. User Flow
Primary (rent): Expenses → **Recurring** → **Add recurring expense** → name "Shop rent" → amount ₹12,000 → category **Rent** → party **Landlord Sharma** → Paid now **off**, due 5 days after → Repeats: Monthly, on the **5th**, starts 05/10/2026, Never ends → **Record automatically** off → Remind **3 days before** → summary line reads "Every month on the 5th, from 5 October 2026, forever" → Save → the template appears with next date 05/10.
Alternate A (reminder → confirm): on 02/10 the owner gets "Rent ₹12,000 is due on 05/10" → taps **Record now** → the expense is created, the ledger credit posts, the landlord's balance shows "You will give ₹12,000".
Alternate B (variable): electricity template with `amount_mode='variable'` → on generation the pending occurrence shows "₹4,820 last time" → **Edit & record** → amount ₹5,310 → saved.
Alternate C (auto): internet bill ₹999 with **Record automatically** on → on 01/10 the expense simply exists, badged "Recurring", and an NTF-01 says "Recorded ₹999 — Internet".
Alternate D (pause): shop shut for Diwali renovations → **Pause** the salary templates → nothing generates → **Resume** in November → next date recomputes to 01/11, no back-fill.
Alternate E (rent revision): from April the rent is ₹13,500 → Edit the template → confirmation "Future entries only" → March's ₹12,000 entry is untouched.
Alternate F (skip): the owner paid the electricity bill directly at the counter → **Skip this time** with reason "Paid at the office" → the occurrence is `skipped`, the template advances.
Alternate G (end): the godown lease ends → **End** → status `ended`, history preserved, upcoming entries disappear.

#### 7. UI Requirements
`RecurringExpensesPage`: `UbPageHeader` "Recurring expenses" with description "Rent, salaries and bills that repeat"; `UbTabs` **Templates** (count) · **Upcoming** (count + total). Templates tab: `UbDataGrid` — columns Name (+ category dot), Amount (`ds-num`), Repeats (plain-language summary), Next on, Auto, Status (`UbStatusBadge`: Active `success`, Paused `warning`, Ended `neutral`), row menu (Edit · Duplicate · Pause/Resume · End · View generated entries). Upcoming tab: date-grouped cards, each row showing the template name, party, amount, a `MLBadge` "Auto" when applicable, and — for pending occurrences — a button pair **Record** (primary, compact) / ⋯ (Edit & record · Skip). A sticky header shows "₹58,400 due in the next 30 days" with a 30/60/90 `MLToggleGroup`. `RecurringExpenseDrawer` (`UbDrawer`): the EXP-01 field set, then a **Repeats** `MLCard` containing frequency/interval/day controls that swap by frequency, `UbDateInput` start, ends `MLRadioGroup`, auto `MLSwitch` with the caption "We will record it for you on the day — you can still void it", lead-days `MLSelect`, and a persistent **plain-language summary strip** in `--accent-quiet` restating the schedule. `SkipOccurrenceDialog` = `UbReasonDialog`. `CatchUpBanner` (`UbStatusBanner`) for FR-12. Mobile: everything single column; the Upcoming tab is the default landing tab on phones because it is the actionable one.

#### 8. UX Requirements
Keys: `expenses.recurring.title` "Recurring expenses", `expenses.recurring.desc` "Rent, salaries and bills that repeat", `expenses.recurring.add` "Add recurring expense", `expenses.recurring.makeRepeat` "Make this repeat", `expenses.recurring.name` "Name", `expenses.recurring.repeats` "Repeats", `expenses.recurring.every` "Every {interval} {unit}", `expenses.recurring.onDay` "On the {day}", `expenses.recurring.lastDay` "Last day of the month", `expenses.recurring.startsOn` "Starts on", `expenses.recurring.ends` "Ends", `expenses.recurring.endsNever` "Never", `expenses.recurring.endsOn` "On a date", `expenses.recurring.endsAfter` "After {n} times", `expenses.recurring.auto` "Record automatically", `expenses.recurring.autoHint` "We will record it for you on the day — you can still void it", `expenses.recurring.remind` "Remind me", `expenses.recurring.summary` "Every month on the {day}, from {date}, {ending}", `expenses.recurring.next` "Next on {date}", `expenses.recurring.upcomingTotal` "{amount} due in the next {days} days", `expenses.recurring.record` "Record", `expenses.recurring.editRecord` "Edit & record", `expenses.recurring.skip` "Skip this time", `expenses.recurring.skipped` "Skipped", `expenses.recurring.pause` "Pause", `expenses.recurring.resume` "Resume", `expenses.recurring.end` "End", `expenses.recurring.futureOnly` "This changes future entries only. Past entries stay as they are.", `expenses.recurring.backfillAsk` "Start from {date} — create the {n} entries that were already due?", `expenses.recurring.catchUp` "Catching up — {done} of {total} entries created", `expenses.recurring.fromTemplate` "From: {name}", `expenses.recurring.empty` "Nothing repeats yet — add rent or salaries". Hindi: "हर महीने का खर्च", "किराया, वेतन और बिल जो हर बार आते हैं", "दोहराएँ", "हर {interval} {unit}", "{day} तारीख को", "महीने का आखिरी दिन", "अपने आप दर्ज करें", "याद दिलाएँ", "अभी दर्ज करें", "इस बार छोड़ें", "रोकें", "फिर शुरू करें", "खत्म करें". Copy rules: the schedule is always restated in one plain sentence before saving; **Record automatically** is opt-in and explicitly reassuring ("you can still void it"); skipping asks for a reason because a skipped bill is a decision worth remembering; ending is framed as finishing, not deleting.

#### 9. States
Templates list: Loading (skeleton rows) · Empty first-use (illustration + "Add rent or salaries" + help link) · Ready · Error. Template row: Active · Paused (45 % opacity, Resume in the menu) · Ended (neutral badge, read-only) · Catching up (progress caption). Upcoming list: Loading · Empty ("Nothing due in the next 30 days") · Ready · Recording (row spinner, optimistic) · Recorded (row collapses into a success line with **View entry**) · Skipped (muted with the reason) · Error (row-level retry). Drawer: Initial · Dirty · Schedule invalid (summary strip turns to an error message, Save disabled) · Backfill question (inline radio, only when `starts_on` is in the past) · Submitting · Success · Error 409 `plan_limit_reached` (banner) · Error 409 `stale_version`. Generation (system): Idle · Running · Partially complete (FR-12 cap) · Failed (audit + owner notification "Some recurring entries could not be created — open Recurring expenses").

#### 10. Validation Rules
`recurringExpenseSchema`: `name` required 1–80; all EXP-01 expense fields validated by the same shared validators (`amountValidation()`, category required, `mode` enum, party required when `paid=false`); `frequency ∈ {daily, weekly, monthly, quarterly, yearly}`; `interval` integer 1–12 → "Repeat every 1 to 12"; `day_of_month` 1–31 or −1, required for monthly/quarterly/yearly → "Choose a day of the month"; `weekday` 0–6 required for weekly; `month_of_year` 1–12 required for yearly; `starts_on` via `businessDateValidation()` but **future dates are allowed here** (this is a schedule, not a transaction) with a floor of `today − 5 years`; `ends_on` > `starts_on` → "The end date must be after the start"; `max_occurrences` 1–999; `daily` frequency requires `ends_on` or `max_occurrences` → "Daily entries need an end date or a number of times"; `lead_days ∈ {0,1,3,7}`; `due_day_offset` 0–60 when `paid=false`. Occurrence actions: `amount` via `amountValidation()`; `skip.reason` via `reasonValidation()` (3–160). Server: 409 `plan_limit_reached` above 50 active; 409 `recurring_already_ended`; 409 `occurrence_already_recorded`; 409 `stale_version`; 403 `permission_denied`; 404 cross-tenant; 400 `category_inactive` when the chosen category is archived.

#### 11. Business Rules
1. BR-1 A template is a **definition**, not money: creating, editing, pausing or ending one never writes a `ledger_entry` and never appears in the cashbook. Only the generated `expenses_expense` rows do, through the ordinary EXP-01 rules.
2. BR-2 **Next-date arithmetic** (normative): monthly/quarterly/yearly advance by `interval` months/quarters/years from `occurrence_date` and then clamp `day_of_month` to the month's length (31 → 30 in November, 28/29 in February); `day_of_month = −1` always means the month's last day. Weekly advances by `interval × 7` days landing on `weekday`. Daily advances by `interval` days. All arithmetic is done on `date` objects in the tenant timezone; no DST concerns apply to `Asia/Kolkata`.
3. BR-3 Generation is idempotent on `U(recurring_id, occurrence_date)`; a scheduler restart, a duplicated cron entry or a manual re-run cannot double-create.
4. BR-4 Template edits are **effective forward only** — generated expenses are independent rows and are never rewritten (this mirrors the immutability principle of canon §0.11 applied one level up).
5. BR-5 `auto_record=true` still produces an ordinary, voidable expense; automation never creates something the owner cannot undo. Auto-recorded rows carry `actor_type='system'` in the audit and `created_by_id NULL`.
6. BR-6 A pending occurrence holds **no** money: it is not in the cashbook, not in the ledger and not in any total except the Upcoming forecast, which is labelled "due" rather than "spent".
7. BR-7 Skipping advances the schedule but records the decision; skipping never deletes the occurrence row (auditability).
8. BR-8 Pausing preserves the schedule phase: on resume, `next_run_on` is the first scheduled date **after today**, so a two-month pause does not generate two back-dated entries.
9. BR-9 Catch-up is capped at 12 occurrences per template per run (FR-12) and always produces `pending` rows when more than 3 are overdue, even if `auto_record=true` — bulk automatic posting of stale entries is never safe.
10. BR-10 `amount_mode='variable'` templates never auto-record regardless of the switch; the switch is disabled with the hint "Variable amounts always need your confirmation".
11. BR-11 A template whose category has been archived stays active but flags "Category archived — choose another" in the row and generates into the `other` system category if the owner ignores it for 30 days (never blocked, never silently wrong).
12. BR-12 Unpaid templates (`paid=false`) set the generated expense's `due_on = occurrence_date + due_day_offset` and post the ledger credit exactly as EXP-01 FR-4.
13. BR-13 The Upcoming forecast projects at most 90 days and at most 12 occurrences per template, so the number shown is always bounded and explainable.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View templates and upcoming list | `expenses.expense.read` + `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Create / edit template | `expenses.expense.write` + `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Pause / resume / end template | `expenses.expense.write` + `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Record a pending occurrence | `expenses.expense.write` | ✅ | ✅ | ❌ | ❌ |
| Skip a pending occurrence | `expenses.expense.write` | ✅ | ✅ | ❌ | ❌ |
| Void a generated expense | `expenses.expense.void` (EXP-01) | ✅ | ✅ | ❌ | ❌ |
| System generation | `actor_type='system'` | — | — | — | — |

#### 13. Edge Cases
1. EC-1 Template set to the 31st → February generates on the 28th (29th in a leap year), April on the 30th; March returns to the 31st (the clamp is per occurrence, never permanent).
2. EC-2 Template set to the last day (`−1`) → always the true last day of each month.
3. EC-3 Scheduler down for 5 days → on recovery each template catches up to 12 occurrences, all as `pending` when more than 3 are overdue (BR-9), with the catch-up banner.
4. EC-4 Two scheduler processes run concurrently (mis-configured cron) → the `U(recurring_id, occurrence_date)` constraint plus the `platform_job` dedupe key make the second a no-op; no duplicates.
5. EC-5 Owner edits a template between generation and confirmation → the pending occurrence keeps the amount it was generated with; the drawer shows "Template now says ₹13,500 — this entry was created at ₹12,000" with **Use new amount**.
6. EC-6 Template's party is archived → generation continues; for `paid=false` templates the ledger credit would fail the archived-party rule, so generation creates the occurrence as `pending` with the note "Party is archived — restore to record".
7. EC-7 `ends_on` passes with a pending occurrence outstanding → the template becomes `ended` but the pending occurrence remains actionable until recorded or skipped.
8. EC-8 50-template limit reached → **Add** is disabled with a hint; the API returns 409 `plan_limit_reached`.
9. EC-9 A daily template without an end date is attempted via the API → 400 (FR-12/§10) regardless of the UI.
10. EC-10 A generated expense is voided → the occurrence stays `recorded` and links to the voided expense; the row shows "Recorded (voided)" so the owner can decide to record it again.
11. EC-11 The expenses module is disabled for the tenant → templates stop generating (the scheduler skips the tenant) and the pages return 403 `module_disabled`; templates are preserved for when it is re-enabled.
12. EC-12 Tenant timezone or `fy_start_month` changed → next dates are unaffected (they are plain dates); only the FY of the generated expense's number changes, which is correct.
13. EC-13 Backfill accepted for 14 overdue occurrences → the cap creates 12 now and 2 on the next run, with the banner explaining it.
14. EC-14 A template duplicated for four staff and then the category merged (EXP-02 FR-7) → all four templates' `category_id` move in the merge transaction.
15. EC-15 The owner records a pending occurrence manually through EXP-01 (not via the occurrence) → the occurrence stays `pending` until skipped; the upcoming list offers **Mark as already recorded** which sets `status='skipped'` with reason "Recorded separately" and links the expense.

#### 14. API Requirements
- `GET /expenses/recurring?status=active,paused,ended&category_id&q&ordering=next_run_on,name&page` → `data[]` of templates with `schedule_summary` (server-rendered plain language, localised), `next_run_on`, `occurrences_created`, `last_expense: { id, number, expense_date }`.
- `POST /expenses/recurring` (body per FR-1/§10 + `backfill: boolean`) → 201; 409 `plan_limit_reached`.
- `GET /expenses/recurring/{id}` → template + `upcoming[]` (next 6 projected dates) + `generated[]` (last 12 expenses).
- `PATCH /expenses/recurring/{id}` (requires `version`) → 200; `DELETE` is **not** offered (use `/end`).
- `POST /expenses/recurring/{id}/pause` · `/resume` · `/end` → 200; 409 `recurring_already_ended`.
- `POST /expenses/recurring/{id}/duplicate { name }` → 201.
- `GET /expenses/recurring/upcoming?days=30|60|90` → `{ data: { days: [ { date, items: [ { occurrence_id?, recurring_id, name, party, category, amount, auto, status } ] } ], total, pending_count } }`.
- `POST /expenses/recurring/occurrences/{id}/record { amount?, expense_date?, mode?, reference?, note? }` → 201 `{ data: Expense }`; 409 `occurrence_already_recorded`.
- `POST /expenses/recurring/occurrences/{id}/skip { reason }` → 200; `POST …/mark-recorded { expense_id }` → 200 (EC-15).
- `GET /expenses?recurring_id=` (EXP-01 list gains the filter, CCR-36) for "View generated entries".
- Frontend: `recurringExpenseService.ts` (`list`, `get`, `create`, `update`, `pause`, `resume`, `end`, `duplicate`, `upcoming`, `recordOccurrence`, `skipOccurrence`); `recurringExpenseSlice` (`templates`, `upcoming`, `filters`, `drawer`, `submitting`) + `recurringExpenseThunk.ts`; `recurringDisplay.ts` (`scheduleSummary`, `nextDates`, `statusTone`, `upcomingTotal`) with the schedule maths mirrored client-side for the summary strip and unit-tested against the server's rules.

#### 15. Database Impact
New tables (CCR-36): `expenses_recurring` (§FR-1) and `expenses_recurring_occurrence` (`recurring_id FK NN`, `occurrence_date date NN`, `amount_suggested numeric(14,2) NN`, `status varchar(10) NN default 'pending'`, `expense_id uuid FK NULL`, `skipped_reason varchar(160) NULL`, `notified_at timestamptz NULL`, `U(recurring_id, occurrence_date)`, `IX(tenant_id, status, occurrence_date)`). `expenses_expense` gains `recurring_id uuid FK NULL` and `recurring_occurrence_date date NULL` with `IX(tenant_id, recurring_id)`. Writes `platform_job` (`expenses.generate_recurring` with `dedupe_key`), `notifications_notification`, `platform_audit_log`, and — through `record_expense()` — `expenses_expense`, `ledger_entry`, `parties_party`, `platform_document_sequence`. Reads `expenses_category`, `parties_party`, `tax_rate`, `platform_tenant_setting`. Migration order: create tables → add columns nullable → no backfill needed (new feature).

#### 16. Audit Requirements
`recurring_expense.created` (`after` = full template), `recurring_expense.updated` (`before`/`after` of changed fields, `metadata.version`), `recurring_expense.paused` / `.resumed` / `.ended` (`metadata.next_run_on`), `recurring_expense.duplicated` (`metadata.source_id`), `recurring_occurrence.generated` (`actor_type='system'`, `metadata` = `{ recurring_id, occurrence_date, auto }`), `recurring_occurrence.recorded` (`metadata.expense_id`, `metadata.amount_changed: bool`), `recurring_occurrence.skipped` (`metadata.reason`), `recurring_generation.failed` (`actor_type='system'`, `metadata.error_class`, `metadata.recurring_id`). Every auto-recorded expense also writes the ordinary `expense.recorded` row from EXP-01 with `actor_type='system'` — so the expense audit trail is complete without consulting this feature.

#### 17. Notifications
- In-app (NTF-01) `recurring_due_soon`: "Rent ₹12,000 to Landlord Sharma is due on 05/10", `data.route=/expenses/recurring?tab=upcoming&occurrence={id}`, actions **Record now** / **Skip**; sent at 09:15 IST on `occurrence_date − lead_days`; idempotent per occurrence.
- In-app `recurring_auto_recorded`: "Recorded ₹999 — Internet (recurring)", `data.route=/expenses/{id}`, with an **Undo** hint pointing at void; coalesced to one notification per tenant per day listing up to 5 items when several auto-record on the same morning.
- In-app `recurring_pending_waiting`: a weekly nudge (Mondays 09:15) when ≥ 1 occurrence has been pending for more than 7 days — "3 recurring entries are waiting for you".
- In-app `recurring_generation_failed` (owner/admin): "Some recurring entries could not be created" with the template name and the reason.
- SMS/WhatsApp/email: **Not applicable at Phase 2** — recurring expenses are internal bookkeeping; no party-facing message is generated (paying the landlord is a payment, and any message about it belongs to PAY-04). Push delivery of the same in-app notifications arrives with NTF-04.

#### 18. Analytics / Event Tracking
`ub.expenses.recurring_opened` `{ tab, templates_active, pending_count }`; `ub.expenses.recurring_created` `{ frequency, interval, auto_record, amount_mode, has_party, paid, lead_days, from_expense: bool, backfill: bool }`; `ub.expenses.recurring_updated` `{ fields_changed: [...] }`; `ub.expenses.recurring_paused` / `_resumed` / `_ended` `{ occurrences_created_bucket }`; `ub.expenses.recurring_duplicated` `{}`; `ub.expenses.recurring_occurrence_recorded` `{ auto: bool, amount_changed: bool, days_late_bucket }`; `ub.expenses.recurring_occurrence_skipped` `{ reason_chip }`; `ub.expenses.recurring_generated` (server) `{ count, auto_count, catch_up: bool }`; `ub.expenses.recurring_upcoming_viewed` `{ days, total_bucket }`. No template names, party names, category names or exact amounts.

#### 19. Security
Templates are tenant-scoped; cross-tenant ids → 404 on every endpoint including occurrence actions. Creating and editing templates requires `platform.tenant.manage` in addition to expense-write because a template is a standing instruction that spends money automatically — the same reasoning that gates the cashbook anchor. `auto_record` is the only automation in the expenses module that writes financial rows without a human in the loop, so: it is opt-in, never enabled by default, disabled for variable amounts (BR-10), capped for catch-up (BR-9), fully audited with `actor_type='system'`, and always reversible by void. The generation command runs with a tenant-scoped service context and must not be reachable over HTTP. Template `name`, `note` and `reference_template` are escaped on render and CSV-escaped on export. Rate limits: default 600/min; 30/min on occurrence record/skip. No new PII beyond the party reference already held by EXP-01.

#### 20. Performance
Generation query is `SELECT … FROM expenses_recurring WHERE status='active' AND next_run_on <= %s` on `IX(tenant_id, status, next_run_on)` — an index-only range scan per tenant, batched 500 per tick. One transaction per occurrence keeps lock windows to single-digit milliseconds and isolates failures. The Upcoming projection is pure date arithmetic over ≤ 50 templates × ≤ 12 occurrences with a single query for existing pending rows — no per-date queries. Templates list paginates at 25 with `select_related('category', 'party')`. The client mirrors `scheduleSummary` so the drawer's summary strip needs no round trip. CI asserts ≤ 4 queries for the Upcoming endpoint and runs the generation command against a 50-template fixture asserting ≤ 2 s and exactly one expense per template.

#### 21. Testing
T-EXP-04-1 (unit) next-date arithmetic table: monthly on the 31st across Jan→Feb→Mar (leap and non-leap), last-day (`−1`), weekly with interval 2, quarterly, yearly, daily with `max_occurrences`. T-EXP-04-2 (unit) generation is idempotent: running the command three times on the same day creates one expense per template. T-EXP-04-3 (unit) concurrent generation (two processes) creates no duplicates thanks to `U(recurring_id, occurrence_date)`. T-EXP-04-4 (unit) `auto_record=true` creates a `recorded` expense through `record_expense()` with `actor_type='system'`, a real number from the FY sequence and (for `paid=false`) a ledger credit; `auto_record=false` creates only a pending occurrence with no ledger or cashbook effect. T-EXP-04-5 (unit) `amount_mode='variable'` never auto-records even with the switch on. T-EXP-04-6 (unit) catch-up cap: a template dormant 24 months creates 12 pending occurrences, then 12 more on the next run, never auto-recorded. T-EXP-04-7 (unit) pause preserves phase; resume sets `next_run_on` to the first future date with no back-fill; pending occurrences of a paused template are cancelled with the right reason. T-EXP-04-8 (unit) template edit does not alter already-generated expenses (BR-4) and the pending occurrence keeps its generated amount (EC-5). T-EXP-04-9 (unit) `ends_on` / `max_occurrences` end the template exactly once, leaving outstanding pending occurrences actionable. T-EXP-04-10 (unit) archived party on a `paid=false` template yields a pending occurrence with the explanatory note rather than a failed generation. T-EXP-04-11 (API) create/patch validation: daily without an end → 400; 51st active template → 409; `stale_version` on a concurrent patch. T-EXP-04-12 (API) occurrence record/skip/mark-recorded happy paths and 409 on repeats. T-EXP-04-13 (API) permission matrix: accountant reads templates and upcoming but gets 403 on every write; staff gets 403 everywhere. T-EXP-04-14 (API) `GET /expenses?recurring_id=` returns only that template's generated expenses. T-EXP-04-15 (component) schedule builder renders the correct plain-language summary for 8 configurations in en and hi; Save disabled on an invalid schedule. T-EXP-04-16 (component) upcoming list grouping, totals, Record/Edit/Skip actions, and the auto badge. T-EXP-04-17 (component) backfill question appears only for a past `starts_on` and defaults to No. T-EXP-04-18 (E2E) create a monthly rent template with reminders → advance the clock 3 days → notification arrives → **Record now** → expense exists with the ledger credit → cashbook unchanged (unpaid) → settle with PAY-01 → cashbook shows the outflow. T-EXP-04-19 (E2E) auto template generates overnight, appears badged "Recurring" in the expense list, and voids cleanly. T-EXP-04-20 (perf) 50 templates generate in ≤ 2 s with one transaction each.

#### 22. Acceptance Criteria
- AC-1 (US-EXP-04-1) Given a template "Shop rent" ₹12,000, category Rent, monthly on the 5th starting 05/10/2026 with **Record automatically** off, when the scheduler runs on 05/10, then exactly one `expenses_recurring_occurrence(occurrence_date=2026-10-05, status='pending', amount_suggested=12000.00)` exists, no `expenses_expense` and no `ledger_entry` were created, and `next_run_on` is 05/11/2026.
- AC-2 (US-EXP-04-2) Given four salary templates created by duplicating the first, when the 1st arrives, then four occurrences appear in **Upcoming** grouped under that date with a header total of ₹48,000, and recording all four creates four expenses with distinct numbers from the FY sequence.
- AC-3 (US-EXP-04-3) Given a variable electricity template, when its occurrence is generated, then **Record automatically** was ignored (BR-10), the pending row shows the previous amount as a hint, and **Edit & record** at ₹5,310 creates the expense at ₹5,310 while the template's stored amount is unchanged.
- AC-4 (US-EXP-04-4) Given five active templates, when the owner opens **Upcoming** with the 30-day toggle, then each projected date is listed with its items and the sticky header shows the exact sum of those items, and switching to 90 days recomputes both without a page reload.
- AC-5 (US-EXP-04-5) Given an active template, when the owner pauses it for two months and then resumes, then no occurrences were generated while paused, no back-dated occurrences are created on resume, and `next_run_on` is the first scheduled date after today.
- AC-6 (US-EXP-04-6) Given a March expense of ₹12,000 generated from the rent template, when the owner changes the template amount to ₹13,500 in April, then the March expense still reads ₹12,000, the confirmation stated "future entries only", and April's occurrence is ₹13,500.
- AC-7 (US-EXP-04-7) Given `lead_days=3` on the rent template, when 02/10 arrives, then an in-app notification "Rent ₹12,000 to Landlord Sharma is due on 05/10" exists exactly once with **Record now** and **Skip** actions, and tapping **Record now** creates the expense and marks the occurrence `recorded`.

#### 23. Dependencies
EXP-01 (`record_expense()`, numbering, ledger rule, void), EXP-02 (categories, merge and delete interaction, `system_code`), EXP-03 (generated expenses appear in the cashbook; pending ones do not), PAY-01 (settling unpaid recurring expenses), LED-01 (archived-party rule), PLT-04 (`platform_document_sequence`), PLT-05 (settings and `version`), RPT-01 (dashboard "Coming up" tile), RPT-09 (fixed vs variable cost split via `recurring_id`), NTF-01 (all four notification types), NTF-04 (push delivery, later), ADR-012 (`platform_job`, `run_scheduler`, dedupe keys), `UbDrawer`, `UbDataGrid`, `UbTabs`, `UbDateInput`, `UbMoneyInput`, `UbReasonDialog`, `UbStatusBanner`, `MLToggleGroup`, `MLRadioGroup`, `MLSwitch`, CCR-36.

#### 24. Future Enhancements
Recurring **income** templates (rent received, subscriptions billed) generating invoices rather than expenses (SAL-12 recurring invoices, already Phase 2 in canon §0.3 — this feature's schedule engine should be shared with it); a proper payroll module with per-employee records, attendance and statutory deductions replacing salary templates; cash-flow forecast combining upcoming recurring expenses with open receivables and payables (RPT-13); auto-settling a recurring expense by creating the payment too (for standing-instruction bank debits); bank-feed matching so a detected standing debit confirms the occurrence automatically (PAY-08, Phase 3); template sharing across a partner's tenant base (WLB-07); escalation reminders when an occurrence stays pending past its due date; per-template approval by a second owner for high-value standing instructions.

## 17.5 Notifications (NTF)

### NTF-01 — In-app notification inbox

#### 1. Business Objective
Give DigiKhaato one dependable place to tell a member something that happened while they were not looking — a reminder is due, stock ran low, money arrived, a teammate joined, an import finished — without depending on SMS credits, a WhatsApp provider or push permissions, none of which exist reliably at MVP. The inbox is the **only** notification channel that always works, so every other channel (SMS, WhatsApp, push, email) is a *delivery* of something that already exists here. Measured by: ≥ 70 % of raised notifications are opened within 24 h by at least one recipient; unread badge accuracy 100 % (no phantom counts); inbox P95 ≤ 250 ms; zero notifications leaking across tenants or to members without the underlying read permission.

#### 2. User Personas
Owner (OW) receives everything about the business; Staff (ST) receives what concerns their work (reminders they own, low stock, imports they started) and nothing financial they cannot already read; Accountant (AC) receives export-ready and import-done notices; Admin (AD) like the owner; Partner admin (PA) and Super admin (SA) use their own console, not this inbox.

#### 3. User Stories
1. US-NTF-01-1 — As an owner I want a bell with a count so that I can see at a glance whether anything needs me.
2. US-NTF-01-2 — As an owner I want to tap a notification and land exactly on the thing it is about.
3. US-NTF-01-3 — As an owner I want yesterday's five low-stock alerts to be one line, not five, so that the inbox stays readable.
4. US-NTF-01-4 — As an owner I want to mark everything read in one tap when I have caught up.
5. US-NTF-01-5 — As staff I want to see only what concerns me so that I am not shown the shop's money position.
6. US-NTF-01-6 — As an owner I want to choose which kinds of notifications I get so that the bell stays meaningful.
7. US-NTF-01-7 — As an owner I want the count to be right the moment I open the app on another device.

#### 4. Functional Requirements
1. FR-1 **Model.** Rows live in `notifications_notification` (§21.3.2): `tenant_id`, `user_id NULL` (NULL = every member who holds the type's required permission), `type varchar(32)`, `title`, `body`, `data jsonb`, `read_at`, `created_at`. Extended (CCR-37) with `category varchar(16)` (`money`, `stock`, `reminders`, `team`, `system`), `severity varchar(8)` (`info`, `success`, `warning`, `danger`), `group_key varchar(80) NULL` (coalescing, FR-6), `count smallint NN default 1`, `actor_id uuid NULL`, `expires_at timestamptz NULL`, `dismissed_at timestamptz NULL`, and `read_by jsonb NN default '[]'` for broadcast rows (FR-5).
2. FR-2 **Type registry.** A single Python registry `notifications/registry.py` declares every type once: `NotificationType(code, category, severity, title_key, body_key, required_permission, default_recipients, group_window, route_builder, channels)`. MVP types: `reminder_due`, `reminder_overdue`, `low_stock`, `out_of_stock`, `payment_received`, `payment_voided`, `member_joined`, `member_invited`, `import_done`, `import_failed`, `export_ready`, `expense_recorded_by_staff`, `expense_unpaid_due`, `credit_limit_crossed`, `document_shared_viewed`. Phase 2 adds `payment_received_online`, `payment_request_unmatched`, `payment_provider_error`, `payment_auto_matched`, `cashbook_mismatch`, `recurring_due_soon`, `recurring_auto_recorded`, `whatsapp_delivery_failed`. Nothing may raise a notification outside the registry — this is what keeps §19's permission guarantee enforceable.
3. FR-3 **Raising.** `notifications.services.notify(tenant, type_code, *, user=None, params, data, actor=None, group_key=None)` is the only writer. It renders `title`/`body` from the type's i18n keys **per recipient locale** (so a Hindi member sees Hindi), resolves recipients (FR-5), applies coalescing (FR-6), honours per-user preferences (FR-9), writes the row(s), and — when the type declares extra `channels` and the member/party opted in — enqueues `platform_job('notifications.send_message', …)` for SMS/WhatsApp/push (NTF-02/03/04/05). Called inside the raising feature's `transaction.atomic()` so a notification never exists for a rolled-back action.
4. FR-4 **Bell and inbox.** `UbNotificationBell` sits in `UbPageHeader` (desktop) and the mobile top bar: a `lucide` `Bell` glyph with a `MLBadge` count pill (1–9, then "9+"), opening `NotificationPanel` — an `MLPopover` on desktop (420 px, max-height 70 vh) and a full `UbDrawer` bottom sheet on mobile. The panel has `UbTabs` **All** · **Unread**, a **Mark all read** text action, category filter chips, a virtualised list of `NotificationItem` rows, and a footer link **See all** → `/notifications` (a full page with date grouping, category filters and pagination for older items).
5. FR-5 **Recipients.** `user_id` set → a personal notification (read state is `read_at`). `user_id NULL` → a **broadcast** to every active member whose role holds `required_permission`; read state is tracked per user in `read_by` (a JSONB array of `{user_id, at}`) so one row serves the whole tenant instead of N rows. The unread count is `personal unread + broadcasts where the user is absent from read_by`, computed in one query. Members who join after a broadcast was raised see it only if it was created in the last 7 days (avoids a wall of history on day one).
6. FR-6 **Coalescing.** A type may declare `group_window` (minutes) and a `group_key` template. `notify()` looks for an **unread** row with the same `(tenant, type, group_key)` created inside the window; if found it increments `count`, refreshes `created_at`, re-renders the title from the plural i18n key ("{count} items are low on stock") and merges `data.ids[]` (capped at 50). Defaults: `low_stock` 1440 min keyed by date, `reminder_due` 1440 min keyed by date, `expense_recorded_by_staff` 60 min keyed by actor, `recurring_auto_recorded` 1440 min keyed by date, `payment_received` **no coalescing** (each payment matters individually). Reading a coalesced row and then triggering again starts a fresh row.
7. FR-7 **Deep links.** Each type's `route_builder` produces `data.route` (e.g. `/parties/{id}?tab=ledger`, `/items/{id}`, `/payments/{id}`, `/imports/{id}`, `/notifications`) plus optional `data.action` for a secondary button ("Send reminder", "Record now", "Undo"). Tapping the row marks it read, closes the panel and navigates; tapping the action button performs it inline without leaving the panel where the action is a single API call (reminder send, occurrence record, undo match), showing a row-level spinner then a success line.
8. FR-8 **Read state.** `POST /notifications/{id}/read` (idempotent), `POST /notifications/read-all` (scoped by the active category filter when one is applied, else everything), and automatic read-on-open for the row that was tapped. Unread count is served by `GET /notifications/unread-count` and refreshed: on app focus, after any read action, on a 60 s poll while a tab is visible, and — Phase 2 — by push (NTF-04). No WebSocket at MVP (ADR-021: no new dependency).
9. FR-9 **Preferences.** `/settings/notifications` lists the registry's categories with an in-app `MLSwitch` per **type** (default on) and, per type, the extra channels the tenant has configured (SMS/WhatsApp/push/email columns appear only when that channel exists). Stored per membership in `platform_membership.permissions_override`? **No** — in a dedicated `notifications_preference` table (CCR-38: `tenant_id`, `user_id`, `type_code`, `in_app boolean`, `sms`, `whatsapp`, `push`, `email`, `U(tenant_id, user_id, type_code)`), because preferences are not permissions. Turning a type off suppresses the row entirely (it is not written); system-critical types (`import_failed`, `payment_provider_error`, `cashbook_mismatch`) cannot be disabled and render their switches disabled with a hint.
10. FR-10 **Retention and pruning.** Rows are purged after 180 days (§21.3.2) by the scheduler task `prune_notifications` (daily, 03:10 IST), which also deletes rows past `expires_at` and dismissed rows older than 30 days. The inbox page paginates by cursor and never loads more than 50 rows at a time.
11. FR-11 **Dismiss.** A row may be dismissed (swipe on mobile, ⋯ on desktop) setting `dismissed_at`; dismissed rows leave both tabs but remain on `/notifications?show=dismissed` until pruned. Dismissing is not the same as reading and does not change the count for other members on a broadcast.
12. FR-12 **Empty and first-use.** The panel's empty state is deliberately warm ("You are all caught up") with a link to preferences; the full page's first-use state explains what will appear here and links to the help article.
13. FR-13 **No duplication across channels.** When a type is also delivered by SMS/WhatsApp/push, the in-app row is still created and carries `data.delivery: [{ channel, status, message_log_id }]` so the detail line can read "Also sent by SMS · delivered 10:02" (the message log lives in NTF-02). The inbox is the source of truth for *what happened*; `notifications_message_log` is the record of *how it was delivered*.

#### 5. Non-Functional Requirements
Unread count P95 ≤ 80 ms (single indexed query, cached 30 s per user). Panel first paint ≤ 250 ms from cache with a background revalidate. Inbox page P95 ≤ 350 ms for 50 rows. Badge must never show a count the list cannot explain (the count query and the list query use the same predicate). Polling costs at most one 1 kB request per minute per open tab and stops when the tab is hidden (`visibilitychange`). Panel JS ≤ 40 kB (it is on every page). Fully keyboard-navigable (the bell is a button, the panel traps focus, rows are links, Escape closes); the badge count is announced via `aria-live="polite"` when it changes. en/hi for every registry string, with plural forms through ICU (`{count, plural, one {# item is} other {# items are}} low on stock`). Offline: the last fetched page renders from the Redux cache with a muted "Showing saved notifications" line.

#### 6. User Flow
Primary: owner opens the app → bell shows "4" → taps → panel lists "₹898 received from Ramesh Traders · 2 min", "3 items are low on stock · 9:15", "Reminder due today for 5 parties · 9:15", "Priya joined your business · yesterday" → taps the payment row → marked read, badge becomes 3, navigates to the payment detail.
Alternate A (inline action): the reminder row has a **Send reminders** button → tapped → spinner → "5 WhatsApp messages ready" → the row becomes a success line without leaving the panel.
Alternate B (catch up): **Mark all read** → badge disappears, rows stay listed under **All** with normal weight.
Alternate C (staff): Priya's bell shows only low-stock and her own import notifications; the payment and cashbook types never reach her because she lacks `payments.payment.read`/`reports.financial.read`.
Alternate D (preferences): the owner turns **Low stock** off → tomorrow's scan raises nothing for them (other owners still get theirs).
Alternate E (two devices): the owner reads on the phone; the desktop tab's next 60 s poll drops the badge to match.
Alternate F (coalescing): three items cross the reorder point at 09:15 → one row "3 items are low on stock"; a fourth crosses at 11:00 while the row is unread → the same row becomes "4 items are low on stock".
Alternate G (dismiss): the owner swipes away "Export ready" after downloading → it leaves the panel.

#### 7. UI Requirements
`UbNotificationBell` (new shared component, `MLButton` icon variant + `MLBadge`): 40 px tap target, badge top-right with `--warning` fill for ≥ 1 and a pulse animation once on increment (140 ms, respecting `prefers-reduced-motion`). `NotificationPanel`: header row "Notifications" `ds-h3` + **Mark all read** (`MLButton` ghost, disabled at 0 unread); `UbTabs` All/Unread with counts; category chips (`UbFilterTag`) Money · Stock · Reminders · Team · System; list of `NotificationItem` — a 32 px severity glyph in a tinted circle (`--success-dim`, `--warning-dim`, `--error-dim`, `--info-dim`), title `ds-body-sm-medium` (unread) / `ds-body-sm` (read), body `ds-caption` clamped to two lines, relative time `ds-caption` muted, an unread dot on the right, an optional action `MLButton` sized sm, and a ⋯ menu (Mark read/unread, Dismiss); rows separated by hairlines, unread rows on `--accent-quiet`. Footer: **See all**. `NotificationsPage` (`/notifications`): `UbPageShell` with date group headers (Today / Yesterday / dd/mm), the same rows at full width, category chips, a `show=dismissed` toggle and cursor pagination ("Load older"). `NotificationPreferencesPage` (`/settings/notifications`): grouped by category, a row per type with the type's title, a one-line description, and switch columns per available channel; disabled switches carry a `UbHelpHint`. Mobile: the panel is a bottom `UbDrawer` at 85 vh with swipe-to-dismiss per row; the bell sits right of the page title.

#### 8. UX Requirements
Keys: `notifications.title` "Notifications", `notifications.markAllRead` "Mark all read", `notifications.all` "All", `notifications.unread` "Unread", `notifications.seeAll` "See all", `notifications.empty` "You are all caught up", `notifications.emptyHint` "We will tell you here when something needs you", `notifications.emptyFirst` "Reminders, low stock and payments will show up here", `notifications.dismiss` "Dismiss", `notifications.markUnread` "Mark as unread", `notifications.showDismissed` "Show dismissed", `notifications.loadOlder` "Load older", `notifications.offline` "Showing saved notifications", `notifications.prefs.title` "What you get told", `notifications.prefs.inApp` "In app", `notifications.prefs.required` "You cannot turn this one off", `notifications.category.money` "Money", `.stock` "Stock", `.reminders` "Reminders", `.team` "Team", `.system` "System". Type strings live beside the registry: `notifications.type.low_stock.title` "{count, plural, one {# item is} other {# items are}} low on stock", `…low_stock.body` "Tap to see what to reorder", `notifications.type.payment_received.title` "{amount} received from {party}", `…reminder_due.title` "{count, plural, one {# party has} other {# parties have}} a payment due today", `…member_joined.title` "{name} joined your business", `…import_done.title` "{count} {kind} imported", `…import_failed.title` "Import could not finish". Hindi: "सूचनाएँ", "सब पढ़ा हुआ चिह्नित करें", "सब", "अनपढ़ी", "सब देखें", "आप पूरी तरह अपडेट हैं", "हटाएँ", "पुरानी दिखाएँ", "आपको क्या बताया जाए". Copy rules: a notification title states **what happened**, the body states **the move it enables** (Koper's snackbar rule applied to the inbox); never more than one sentence each; amounts and counts always inside the sentence, never as a bare number; relative time up to 7 days, then dd/mm. Severity colour is decorative only — the title always carries the meaning.

#### 9. States
Bell: Zero (no badge) · Unread n · 9+ · Loading (no badge until the first count resolves — never a flicker of 0) · Error (badge hidden, silent). Panel: Loading (5 skeleton rows) · Ready · Empty ("You are all caught up") · Filtered-empty ("Nothing in Money") · Error (retry + request id) · Offline (cached + banner) · Acting (row spinner on an inline action) · Action success (row replaced by a success line for 3 s). Row: Unread · Read · Dismissing (fade 140 ms) · Coalesced (count chip) · Expired (not rendered). Preferences page: Loading · Ready · Saving (per-switch optimistic with rollback) · Error (snackbar + revert) · Channel unavailable (column hidden entirely, with a note "Set up SMS in Settings → Messaging to use this column"). Full page: Loading · Ready · Loading older · End of list ("That is everything from the last 180 days").

#### 10. Validation Rules
Client: none beyond the preference switches (booleans). Server: `GET /notifications` params `unread ∈ {true,false}`, `category` from the registry's enum, `cursor` opaque, `limit` 1–50 (default 25) → 400 `validation_error` otherwise; `POST /notifications/{id}/read` on a foreign-tenant or another user's personal row → 404 (never 403, per canon §0.11); `POST /notifications/read-all { category? }` validates the category; preferences `PUT /notifications/preferences { items: [{ type_code, in_app, sms, whatsapp, push, email }] }` rejects unknown `type_code` → 400 `details.items[i].type_code: ["Unknown notification type"]`, rejects turning off a required type → 409 `notification_type_required` (CCR-38), and rejects enabling a channel the tenant has not configured → 409 `channel_not_configured`. Internally, `notify()` raises `UnknownNotificationType` for a code not in the registry — a programming error that fails loudly in tests and is logged-and-skipped in production so a bad call never breaks the business transaction it sits inside.

#### 11. Business Rules
1. BR-1 **Permission is the filter, not the recipient list.** A broadcast reaches a member only if their role currently holds the type's `required_permission`; a role change therefore changes what a member can see retroactively, which is the correct behaviour for a shared inbox.
2. BR-2 A notification is never the system of record. Every row is a pointer to a real entity (`data.route`); if the entity is voided, archived or deleted, the row stays and the target renders its own "not available" state. Rows are never rewritten after the fact except for coalescing counts.
3. BR-3 Coalescing only merges **unread** rows within the window (FR-6); once read, a new event starts a new row, so an owner who has acknowledged today's low-stock list still learns about tomorrow's.
4. BR-4 `notify()` runs inside the caller's transaction; if the business action rolls back, so does the notification. Channel delivery, by contrast, is always deferred to `platform_job` so an SMS provider timeout can never roll back a payment.
5. BR-5 Unread count = personal rows with `read_at IS NULL` + broadcast rows where the user id is absent from `read_by`, both scoped to the active tenant, excluding `dismissed_at IS NOT NULL` and `expires_at < now()`.
6. BR-6 Switching tenant resets the inbox entirely: notifications are tenant-scoped and a member of three businesses has three inboxes.
7. BR-7 Preferences suppress **creation** for personal rows and **display** for broadcast rows (a broadcast is one row for everyone; a member who muted the type simply does not see it and it does not count for them). This is stored as the member's id in the row's `read_by`? **No** — it is evaluated at query time against `notifications_preference`, so a later preference change is reflected immediately.
8. BR-8 Required types (FR-9) ignore preferences entirely.
9. BR-9 The inbox never contains a party-facing message; anything a customer receives is a `notifications_message_log` row (NTF-02) and is only *referenced* here through `data.delivery`.
10. BR-10 Titles and bodies are rendered at write time in the recipient's locale for personal rows, and at **read** time for broadcasts (which store `params` in `data` rather than a frozen string) — so a member who switches to Hindi sees Hindi for shared rows.
11. BR-11 Retention is 180 days for everything; there is no archive. Anything that must be kept longer is an audit log entry, not a notification.
12. BR-12 A notification's `count` never exceeds 999 and `data.ids[]` never exceeds 50 entries; beyond that the row says "and more" and the route leads to the filtered list.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See the bell and own inbox | authenticated member | ✅ | ✅ | ✅ | ✅ |
| Receive a broadcast of type T | T's `required_permission` (e.g. `payments.payment.read` for `payment_received`, `inventory.stock.read` for `low_stock`, `platform.members.manage` for `member_joined`) | per role | per role | per role | per role |
| Mark own rows read / unread / dismissed | authenticated member | ✅ | ✅ | ✅ | ✅ |
| Edit own notification preferences | `notifications.settings.manage` | ✅ | ✅ | ✅ (own only) | ✅ (own only) |
| Configure channels available to the tenant | `platform.tenant.manage` (NTF-02) | ✅ | ✅ | ❌ | ❌ |
| Raise a notification | internal service only — no public endpoint exists | — | — | — | — |

#### 13. Edge Cases
1. EC-1 A member's role is downgraded after a broadcast was raised → the row silently disappears from their inbox and the count drops; no error, no trace for them.
2. EC-2 All owners have muted a type and something important happens → required types (FR-9) cannot be muted, so critical events always land; non-critical ones legitimately do not.
3. EC-3 Two tabs open, both poll, one marks all read → the other's next poll shows 0 and its list re-renders read rows in place (no jump to top).
4. EC-4 A coalesced row's underlying items are all resolved (stock restocked) before it is read → the row remains with its count; tapping it lands on the filtered list which is legitimately empty and shows "Nothing is low on stock now".
5. EC-5 1,000 notifications in a day (a misbehaving integration) → coalescing plus the per-type rate guard (max 50 rows per type per tenant per hour, excess merged into the current group row regardless of window) keeps the inbox usable; the guard itself raises one `system` notification to owners.
6. EC-6 A notification's target was deleted (a draft invoice hard-deleted) → the route 404s and the page shows "This is no longer available", with the row remaining.
7. EC-7 The member has no default tenant / was removed from the tenant → the inbox endpoint returns 403 `no_active_tenant` handled by the session layer, not here.
8. EC-8 Clock skew on the client makes a row appear "in 2 minutes" → relative time clamps to "just now" for any future timestamp.
9. EC-9 A very long party name in a title → clamped to two lines with `text-overflow: ellipsis`; the full text is in the row's `title` attribute and accessible name.
10. EC-10 Locale switched from `en` to `hi` mid-session → broadcast rows re-render in Hindi immediately (BR-10); personal rows already written in English stay English (they are historical text), which the help article explains.
11. EC-11 Push (NTF-04) delivers a notification whose in-app row the user already read on another device → tapping the push lands on the target and the read call is a harmless idempotent no-op.
12. EC-12 `notify()` called with an unknown type in production → logged at ERROR with the code, skipped, business transaction unaffected (FR-10 §10).
13. EC-13 A tenant with 40 members and a broadcast → exactly one row is written and 40 `read_by` entries accumulate over time; the JSONB stays small (≤ 3 kB) and is indexed by the containment operator only for the count query's `NOT (read_by @> …)` predicate.
14. EC-14 Pruning deletes a row a user is currently viewing → the panel's next fetch simply omits it; the open detail route is unaffected (it points at the entity, not the notification).

#### 14. API Requirements
- `GET /notifications?unread=true|false&category=&show=dismissed&cursor=&limit=25` (Part 22 §22.12) → `{ data: [ { id, type, category, severity, title, body, data: { route, action?, ids?, delivery? }, count, actor?, created_at, read_at|read_by_me, dismissed_at } ], meta: { next_cursor, has_more, unread_count } }`.
- `GET /notifications/unread-count` → `{ data: { count, by_category: { money, stock, reminders, team, system } } }` (cached 30 s per user).
- `POST /notifications/{id}/read` → 204 (idempotent); `POST /notifications/{id}/unread` → 204; `POST /notifications/{id}/dismiss` → 204.
- `POST /notifications/read-all { category? }` → 200 `{ data: { marked } }`.
- `GET /notifications/preferences` → `{ data: { categories: [ { code, types: [ { code, title, description, in_app, sms, whatsapp, push, email, required, available_channels[] } ] } ] } }`.
- `PUT /notifications/preferences { items: [...] }` → 200; 409 `notification_type_required`, 409 `channel_not_configured`.
- No endpoint creates a notification; creation is service-internal (FR-3) — stated explicitly so no future integration invents one.
- Frontend: `notificationService.ts` (`list`, `unreadCount`, `read`, `unread`, `dismiss`, `readAll`, `getPreferences`, `savePreferences`); `notificationSlice` (`items`, `cursor`, `unreadCount`, `byCategory`, `filters`, `panelOpen`, `status`) + `notificationThunk.ts`; a `useNotificationPoll()` hook wiring the 60 s visible-tab poll and the focus refresh; `notificationDisplay.ts` (`severityGlyph`, `relativeTime`, `routeFor`, `groupByDate`). The bell lives in `components/layout/` and reads only `unreadCount` so it never re-renders on list changes.

#### 15. Database Impact
`notifications_notification` extended per FR-1 (CCR-37). Indexes: existing `IX(tenant_id, user_id, read_at, created_at DESC)`; new `IX(tenant_id, type, group_key, created_at DESC) WHERE read_at IS NULL` for coalescing lookups, `IX(tenant_id, created_at DESC) WHERE user_id IS NULL` for broadcasts, and a GIN index on `read_by` for the broadcast unread predicate. New table `notifications_preference` (CCR-38). Reads `platform_membership` + `platform_role` (permission resolution for broadcasts — cached per tenant for 60 s), `platform_user` (locale). Writes `notifications_notification`, `notifications_preference`, `platform_job` (channel fan-out, pruning). No writes to any business table — the inbox is strictly downstream.

#### 16. Audit Requirements
Not applicable for reading, marking read or dismissing — these are personal UI state with no financial consequence and auditing them would swamp `platform_audit_log`. **Applicable** for: `notification.preferences_changed` (`before`/`after` of the changed type codes, per user) because it explains why someone "was never told"; and `notification.rate_guard_tripped` (`actor_type='system'`, `metadata.type_code`, `metadata.dropped`) from EC-5. Channel deliveries are recorded in `notifications_message_log` by NTF-02, not here.

#### 17. Notifications
Not applicable — this **is** the notification feature. For completeness: NTF-01 itself raises exactly two self-referential rows, both `system` category and both non-mutable: `notification_rate_guard` (EC-5) and `notification_channel_failed` (raised by NTF-02 when a delivery permanently fails, so the in-app inbox always knows when a customer was *not* reached).

#### 18. Analytics / Event Tracking
`ub.notifications.bell_opened` `{ unread_count_bucket, surface }`; `ub.notifications.item_clicked` `{ type, category, was_unread, age_minutes_bucket, coalesced_count_bucket }`; `ub.notifications.inline_action_used` `{ type, action }`; `ub.notifications.mark_all_read` `{ marked_bucket, category }`; `ub.notifications.dismissed` `{ type }`; `ub.notifications.page_viewed` `{ filter, rows_bucket }`; `ub.notifications.preferences_changed` `{ type, channel, enabled }`; `ub.notifications.raised` (server) `{ type, recipients_bucket, coalesced: bool, suppressed_by_preference: bool }`; `ub.notifications.rate_guard` (server) `{ type, dropped_bucket }`. No titles, bodies, party names, amounts or ids in properties — only type codes and buckets.

#### 19. Security
Tenant scoping on every query; a notification id from another tenant or another user's personal row returns 404. **The permission check is the security boundary**: a broadcast's `required_permission` is evaluated at read time against the member's current role, so a notification can never reveal something the member could not open anyway — and the title/body are written to be safe even so (an owner-only amount never appears in a type whose permission staff hold). There is no public creation endpoint (FR-14), so a compromised client cannot forge a notification. `data.route` is validated against an internal route allowlist at render time so a crafted row (only possible through a code bug) cannot become an open redirect or a `javascript:` URL. Titles and bodies are rendered as text, never as HTML. Preferences are per user and cannot be set for another member. Rate limits: default 600/min; `read-all` 30/min. PII: titles may contain a party name or a member name — this is data the recipient may already read by permission, and rows are purged at 180 days.

#### 20. Performance
The unread count is one query with a compound predicate over two partial indexes, cached 30 s per (tenant, user) in-process and invalidated on any read/dismiss by that user — P95 ≤ 80 ms. The list uses cursor pagination on `created_at DESC, id DESC` with `limit ≤ 50` and no joins (actor and route data are denormalised into `data`), so it is a single index scan. Broadcast permission resolution uses a per-tenant role→permission map cached for 60 s rather than a join per row. Coalescing is one indexed lookup plus one `UPDATE`. The panel renders at most 25 rows and virtualises beyond that. The poll is 60 s, visible-tab only, and returns a 1 kB payload; `ETag`/`304` further reduce it. Pruning runs nightly in batches of 5,000 with a statement timeout. CI asserts ≤ 2 queries for the count endpoint and ≤ 3 for the list.

#### 21. Testing
T-NTF-01-1 (unit) `notify()` writes a personal row with the recipient's locale rendering; a Hindi member gets Hindi. T-NTF-01-2 (unit) broadcast reaches only members holding the type's permission; a role downgrade removes it from the count immediately. T-NTF-01-3 (unit) coalescing merges within the window while unread, increments `count`, merges `data.ids` up to 50, and starts a fresh row after the first is read. T-NTF-01-4 (unit) unread count formula across personal + broadcast + dismissed + expired rows for three members with different roles. T-NTF-01-5 (unit) `notify()` inside a rolled-back transaction leaves no row; channel fan-out is enqueued, not executed inline. T-NTF-01-6 (unit) preferences suppress creation for personal rows and display for broadcasts; required types ignore preferences. T-NTF-01-7 (unit) unknown type code raises in tests and is logged-and-skipped with `DEBUG=False`. T-NTF-01-8 (unit) rate guard trips at 50 rows/type/tenant/hour and raises exactly one system notification. T-NTF-01-9 (unit) pruning removes rows older than 180 days, expired rows and dismissed rows older than 30 days, in batches. T-NTF-01-10 (API) list shapes, cursor pagination, category filter, `show=dismissed`; `meta.unread_count` agrees with `/unread-count` for the same state. T-NTF-01-11 (API) read/unread/dismiss are idempotent; another tenant's id → 404; another user's personal row → 404. T-NTF-01-12 (API) `read-all` with a category marks only that category. T-NTF-01-13 (API) preferences PUT rejects unknown types, required types and unconfigured channels with the right codes. T-NTF-01-14 (component) bell badge 0/1/9/9+ and the `aria-live` announcement; no flicker of 0 before the first count. T-NTF-01-15 (component) panel tabs, chips, unread styling, inline action success line, empty/filtered-empty/error/offline states. T-NTF-01-16 (component) mobile drawer swipe-to-dismiss and 44 px targets. T-NTF-01-17 (E2E) record a payment → owner's bell increments → open panel → tap → lands on the payment → badge decrements → second device's poll agrees within 60 s. T-NTF-01-18 (E2E) low-stock scan raises one coalesced row for 3 items; a 4th item merges into it; marking read and adding a 5th creates a new row. T-NTF-01-19 (permission) staff never receive `payment_received`, `cashbook_mismatch` or `credit_limit_crossed`. T-NTF-01-20 (perf) 10,000 notifications for a tenant: count ≤ 80 ms, list ≤ 350 ms with the stated query counts.

#### 22. Acceptance Criteria
- AC-1 (US-NTF-01-1) Given four unread notifications, when the owner opens any page, then the bell shows a `warning` badge "4" whose value matches `GET /notifications/unread-count`, and the count is announced politely to screen readers when it changes.
- AC-2 (US-NTF-01-2) Given a "₹898 received from Ramesh Traders" row, when the owner taps it, then it is marked read, the badge decrements by one, the panel closes and the app navigates to `/payments/{id}`.
- AC-3 (US-NTF-01-3) Given three items crossing their reorder point in one scan, when the notifications are raised, then exactly one row exists reading "3 items are low on stock" with `count=3` and `data.ids` holding the three item ids; a fourth item crossing while the row is unread updates the same row to "4 items are low on stock".
- AC-4 (US-NTF-01-4) Given any number of unread rows, when the owner taps **Mark all read**, then every row in the active category becomes read, the badge disappears, and the rows remain listed under **All** in read styling.
- AC-5 (US-NTF-01-5) Given Priya with the `staff` role, when a payment is received and the cashbook mismatch job runs, then neither notification appears in her inbox or her count, while a low-stock notification does.
- AC-6 (US-NTF-01-6) Given the preferences page, when the owner turns **Low stock** off, then the next scan raises no low-stock row for that owner (other owners still receive theirs), and the change is recorded in the audit log; the **Import could not finish** switch is disabled with the explanation that it cannot be turned off.
- AC-7 (US-NTF-01-7) Given the owner marks notifications read on their phone, when the desktop tab's next 60 s poll completes, then its badge matches the phone's state without a page reload and read rows re-render in place.

#### 23. Dependencies
PLT-02 (membership, roles and permission resolution), PLT-05 (settings shell for the preferences page), PLT-09 (audit log), LED-05/LED-06 (`reminder_due`), INV-08 (`low_stock`, `out_of_stock`), PAY-01/PAY-05 (`payment_received`, `payment_voided`), PAY-06/PAY-07 (Phase 2 money types), EXP-01/EXP-03/EXP-04 (expense, cashbook and recurring types), IMP-01 (`import_done`, `import_failed`), RPT-11 (`export_ready`), NTF-02 (channel fan-out and `notifications_message_log` for `data.delivery`), NTF-04 (push delivery of the same rows), ADR-012 (`platform_job` for fan-out and pruning), ADR-021 (no WebSocket dependency — polling instead), `UbNotificationBell` (new), `UbDrawer`, `UbTabs`, `UbFilterTag`, `UbEmptyState`, `MLPopover`, `MLBadge`, CCR-37/CCR-38.

#### 24. Future Enhancements
Web push so the badge updates without polling and the owner is reached when the app is closed (NTF-04); server-sent events or WebSockets for live updates once a dependency is justified by an ADR; digest notifications ("your evening summary") replacing several rows with one; per-notification snooze ("remind me this evening"); notification templates editable by partners for white-label wording (WLB-07); an activity feed separate from notifications (who did what, for owners of staffed shops); cross-tenant aggregation for members of several businesses ("2 unread in Sharma Store, 1 in Gupta Traders"); machine-generated insights as notifications ("collections are 20 % slower than last month") once RPT-13 exists.

### NTF-02 — Messaging provider adapters

#### 1. Business Objective
Make every outbound message in DigiKhaato — OTPs, transaction SMS to parties, reminders, receipts, invitations — go through **one adapter interface with one message log**, so that at MVP the product ships with a console backend that prints messages to the log (no vendor, no credits, no DLT paperwork, no cost) and at Phase 2 a real provider is a settings change rather than a code change. The registry of DLT-approved templates lives in the database so a partner can register their own sender ID and template IDs without a deploy. Measured by: 100 % of outbound messages pass through `send_message()` (asserted by a test that greps for direct provider calls); switching from console to a live provider requires zero code edits; every attempt has exactly one `notifications_message_log` row with a terminal status.

#### 2. User Personas
Super admin (SA) registers global templates and default providers; Partner admin (PA) configures the partner's sender ID, DLT entity id and template ids for their white-label base (WLB-06); Owner (OW) sees whether messaging is live, reads the message log and pays attention to failures; Staff (ST) and Accountant (AC) see delivery status on the entities they can read; Customer (CU) is the recipient and never sees this feature.

#### 3. User Stories
1. US-NTF-02-1 — As a developer I want one `send_message()` call for SMS so that features never know which provider is behind it.
2. US-NTF-02-2 — As an owner running the product locally I want messages to be logged instead of sent so that nothing costs money and nothing reaches a real customer by accident.
3. US-NTF-02-3 — As a partner admin I want to register my sender ID and DLT template IDs so that my merchants' SMS are compliant from day one.
4. US-NTF-02-4 — As an owner I want to see every message the app tried to send, with its status and the reason it failed.
5. US-NTF-02-5 — As an owner I want a failed message to be retried automatically a few times and then told to me, not silently dropped.
6. US-NTF-02-6 — As a super admin I want to change the SMS provider for a partner without a deploy.
7. US-NTF-02-7 — As a compliance owner I want DLT template IDs attached to every SMS and consent recorded before anything is sent to a customer.

#### 4. Functional Requirements
1. FR-1 **Adapter interface.** `notifications/providers/base.py` declares `MessageBackend` with `channel: str`, `send(message: OutboundMessage) -> SendResult`, `fetch_status(provider_message_id) -> DeliveryStatus | None`, and `verify_callback(raw_body, headers) -> list[DeliveryReceipt]`. `OutboundMessage` carries `to`, `body`, `template_code`, `dlt_template_id`, `sender_id`, `params`, `related_type/related_id`, `locale`, `unicode: bool`. `SendResult` carries `status ∈ {sent, queued, skipped, failed}`, `provider_message_id`, `cost`, `error`, `raw`.
2. FR-2 **Backends at MVP.** `ConsoleSmsBackend` (ADR-015) — renders the body, writes it to the structured log at INFO with `tenant_id`/`request_id`, returns `status='skipped'` with `provider_message_id=f"console-{uuid7()}"` and `cost=0`; it is the default in every environment where no provider is configured, including production, so a tenant without messaging simply never sends. `WaMeBackend` (channel `whatsapp`) — does not send anything; it renders the text and returns the `wa.me` URL in `raw.wa_url` for NTF-03's deep link, logging `status='sent'` only when the client confirms the user tapped through. `NullBackend` for channels with no implementation (email, push at MVP) returning `status='skipped'` with `error='channel_not_configured'`.
3. FR-3 **Backends at Phase 2.** `Msg91SmsBackend` and `KaleyraSmsBackend` (both plain REST over stdlib `urllib.request`, no SDK, per ADR-021/ADR-022), `WhatsAppCloudBackend` (NTF-05), `SmtpEmailBackend` (NTF-06, Django's built-in `EmailBackend`), `WebPushBackend` (NTF-04). Each lives behind the same interface and is selected by configuration only.
4. FR-4 **Resolution order.** `get_backend(tenant, channel)` resolves the backend from, in order: `platform_tenant_setting['messaging.<channel>.provider']` → `platform_partner.settings['messaging'][channel]['provider']` → `settings.DEFAULT_MESSAGE_BACKENDS[channel]` → `ConsoleSmsBackend`/`NullBackend`. Credentials resolve the same way and are stored encrypted in `platform_tenant_secret` / `platform_partner_secret` (CCR-22, shared with PAY-06), never returned by any GET.
5. FR-5 **The single entry point.** `notifications.services.send_message(tenant, channel, to, template_code, params, *, party=None, related=None, locale=None, force=False) -> MessageLog`. It: (a) resolves the template (FR-6); (b) checks consent and opt-in (FR-9); (c) renders the body and computes the segment count (FR-8); (d) creates a `notifications_message_log` row with `status='queued'`; (e) enqueues `platform_job('notifications.deliver_message', { message_log_id })`; (f) returns immediately. The scheduler (`run_scheduler`, ADR-012) drains the job, calls the backend, and updates the row to `sent`/`skipped`/`failed`. **No feature ever calls a backend directly** — a unit test asserts this by scanning for imports of `providers.*` outside `notifications/`.
6. FR-6 **Template registry.** `notifications_template` (§21.3.2) holds `partner_id NULL`, `tenant_id NULL`, `code`, `channel`, `locale`, `body` with `{{placeholders}}`, `dlt_template_id`, `whatsapp_template_name`, `is_active`, extended (CCR-39) with `sender_id varchar(16) NULL`, `category varchar(16)` (`transactional`, `service_implicit`, `service_explicit`, `promotional` — the TRAI/DLT categories), `variables text[]` (declared placeholder names), `max_variable_len jsonb`, `version smallint`, `approved_at`. Resolution is tenant → partner → global for `(code, channel, locale)`, falling back to `locale='en'`. Seeded globally by `manage.py seed_message_templates` with every code used in Part 17: `OTP_LOGIN`, `OTP_VERIFY`, `INVITE_MEMBER`, `LEDGER_ENTRY_SMS`, `REMINDER_SMS`, `REMINDER_WHATSAPP`, `RECEIPT_SMS`, `RECEIPT_SHARE`, `RECEIPT_VOID_SMS`, `VOUCHER_SHARE`, `STATEMENT_SHARE`, `PAY_LINK_SHARE`, `PAY_LINK_SMS`.
7. FR-7 **Rendering.** `render_template(template, params)` substitutes `{{name}}` placeholders with a strict whitelist — a missing declared variable raises `TemplateRenderError` (logged, row `failed`, never a half-rendered message); an undeclared extra param is ignored. Values are truncated per `max_variable_len` (DLT templates have fixed variable lengths) and stripped of newlines for SMS. Money is pre-formatted by the caller as `Rs 1,234` (never `₹` — the rupee glyph forces Unicode segmentation and doubles SMS cost).
8. FR-8 **Segments and cost.** `count_segments(body)` implements GSM-7 vs UCS-2 detection: GSM-7 (with the standard extension table) → 160 chars single / 153 concatenated; UCS-2 → 70 / 67. The result is stored on the log as `segments smallint` and `unicode boolean` (CCR-39) and multiplied by the provider's per-segment price (partner setting `messaging.sms.price_per_segment`, default ₹0.20) into `cost`. A Hindi body is always UCS-2; the composer UI (LED-06, NTF-03) shows "1 message (Hindi — 70 characters)" so the merchant sees the trade-off.
9. FR-9 **Consent gate (DPDP + TRAI).** Before any party-facing send, `send_message()` requires: `party.sms_opt_in = true`, a non-null `party.consent_at` when the template category is `service_explicit` or `promotional`, and a non-empty `to`. Failing any check writes the log row with `status='skipped'` and `error ∈ {party_opted_out, no_consent_recorded, no_mobile}` — the attempt is recorded, never silently discarded. `force=True` is available only to OTP and member-invitation sends (which are to the tenant's own users, not parties).
10. FR-10 **Retry policy.** A `failed` send with a retryable error class (network, 5xx, provider throttle) is retried by re-enqueuing with backoff 1/5/15 minutes, `attempts ≤ 3`, tracked on the log (`attempts smallint`, `next_attempt_at`). Non-retryable errors (invalid number, template not approved, insufficient balance, blacklisted) fail immediately. After the final failure the row is `failed` and NTF-01's `notification_channel_failed` is raised to owners with the reason in plain language.
11. FR-11 **Delivery receipts.** `POST /webhooks/messaging/{provider}` accepts provider DLRs, verifies the provider's signature or shared secret, matches on `provider_message_id`, and updates `status` to `delivered`/`failed` with `delivered_at` and the provider's error code. Unmatched receipts are stored on a `notifications_message_receipt` staging row for 7 days (late-arriving DLR before the send row commits). Providers without webhooks are polled by the scheduler task `poll_message_status` for rows `sent` in the last 24 h, at most 200 per tick.
12. FR-12 **Message log UI.** `/settings/messaging/log` (owner/admin): `UbDataGrid` with columns Sent at, Channel, To (masked), Template, Related (deep link to the party/payment/invoice), Status (`UbStatusBadge`), Segments, Cost, Error; filters by channel, status, template, date range and party; a totals header "482 messages · ₹96.40 this month". Each row expands to show the exact rendered body (the single most useful support tool). A per-entity strip reuses the same data: every party, payment and reminder detail view shows its `messages[]` (LED-08, PAY-04 CCR-6/CCR-17 pattern).
13. FR-13 **Provider settings UI.** `/settings/messaging`: per channel a card showing the resolved backend and its origin ("From your partner: Metis Labs"), a status chip (Live · Console (nothing is sent) · Not configured), a **Send a test message** action (to the member's own mobile, rate-limited 3/hour), and — for owners with `platform.tenant.manage` — fields to override the provider, credentials, sender ID and DLT entity id. A prominent explanatory banner at MVP: "Messages are not being sent — DigiKhaato is printing them to the log. Share on WhatsApp instead."
14. FR-14 **Template management UI.** `/settings/messaging/templates` (owner read, partner admin write via the partner console): a list per channel and locale with the body, its declared variables, the DLT template id, the category and an **approved** chip. Tenants may not edit bodies at MVP (DLT approval is per registered text); they may only choose which optional templates are enabled. Partner admins register new template versions with the DLT id after approval.
15. FR-15 **Kill switches.** `messaging.enabled` (tenant setting, default true) turns off every channel for a tenant in one switch; `settings.MESSAGING_GLOBAL_KILL` (env) stops all sends product-wide (incident response), writing every attempt as `skipped` with `error='globally_disabled'`. Neither ever loses a row.

#### 5. Non-Functional Requirements
`send_message()` returns in ≤ 15 ms (one insert + one job row); it is called inside business transactions and must never block on a network. Delivery latency depends on the scheduler tick: P95 ≤ 90 s from call to provider hand-off, which is acceptable for reminders and receipts and is why **OTP is the one exception** — OTP sends bypass the queue and call the backend inline with a 5 s timeout (an OTP that arrives a minute late is useless), falling back to a queued retry on timeout. Message log list P95 ≤ 400 ms for 10k rows/month. Backends must be deterministic and unit-testable without network access (the test suite ships a `FakeSmsBackend` recording calls). All provider I/O has explicit timeouts (10 s connect+read) and never follows redirects. Structured logs redact the message body for `promotional` categories and always redact credentials. en/hi for the settings and log UI; template bodies are content, not UI strings.

#### 6. User Flow
Primary (MVP, console): the owner opens Settings → Messaging → sees "SMS: Console — nothing is sent" with the explanatory banner and a link to WhatsApp sharing (NTF-03). A reminder send (LED-06) still produces a log row with status `skipped`, so the party's timeline reads "SMS not sent — no provider".
Alternate A (partner goes live): the partner admin registers MSG91 credentials, sender ID `SHRMST` and the DLT ids for `REMINDER_SMS` and `RECEIPT_SMS` in the partner console → every tenant under that partner immediately shows "SMS: Live (MSG91)" and reminders begin to send.
Alternate B (test): the owner taps **Send a test message** → receives it on their own mobile within seconds → the log shows one row `delivered`.
Alternate C (failure): a reminder to an invalid number fails non-retryably → the log row is `failed` with "Invalid mobile number" → NTF-01 tells the owner → the party detail shows the failure glyph → the owner fixes the number and resends.
Alternate D (throttle): the provider returns 429 → retries at 1, 5 and 15 minutes → the third succeeds → the row goes `sent` then `delivered` on the DLR.
Alternate E (opt-out): a party with `sms_opt_in=false` → the row is `skipped` with "Customer has opted out" and the composer had already disabled the SMS option.
Alternate F (incident): the global kill switch is set during a provider outage → every attempt is `skipped` with a clear reason and nothing is lost; unsetting it does **not** replay (by design — stale reminders are worse than none), which the runbook states.

#### 7. UI Requirements
`MessagingSettingsPage`: one `MLCard` per channel (SMS · WhatsApp · Email · Push) showing an icon, the resolved provider name, an origin caption, a `UbStatusBadge` (Live `success` · Console `warning` · Not configured `neutral` · Disabled `danger`), **Send a test message**, and (owner only) an **Override** disclosure with `UbField`s for provider `MLSelect`, API key (`type=password`, write-only, "••••• set"), sender ID (`MLInput`, 6 chars, uppercase), DLT entity id, and a **Test connection** button. A page-level `UbStatusBanner` at MVP explaining the console state. `MessageLogPage`: `UbPageHeader` "Message log" + `UbDateRangePicker` + filters; `UbDataGrid` with a monospace `to` column masked as `98•••••678`, a `UbStatusBadge` per status (queued `info`, sent `info`, delivered `success`, failed `danger`, skipped `neutral`), right-aligned segments and cost; row expansion renders the exact body in a `--surface-sunken` block with a copy button. `MessageTemplatesPage`: grouped by channel then locale, each row showing `code` (`ds-mono`), the body with `{{variables}}` highlighted in `--accent`, the DLT id, category chip and approved state. `MessagesStrip` (shared component reused by party, payment, reminder and invoice details): a horizontal list of small status chips with a tooltip carrying the time and error. Mobile: cards instead of grids; the body expansion is a bottom sheet.

#### 8. UX Requirements
Keys: `messaging.title` "Messaging", `messaging.desc` "How DigiKhaato sends SMS and WhatsApp", `messaging.channel.sms` "SMS", `.whatsapp` "WhatsApp", `.email` "Email", `.push` "Push", `messaging.status.live` "Live", `messaging.status.console` "Console — nothing is sent", `messaging.status.notConfigured` "Not set up", `messaging.status.disabled` "Turned off", `messaging.consoleBanner` "Messages are not being sent — DigiKhaato is only writing them to the log. Share on WhatsApp instead.", `messaging.fromPartner` "From your partner: {partner}", `messaging.test` "Send a test message", `messaging.testSent` "Test message sent — check your phone", `messaging.senderId` "Sender ID", `messaging.dltEntityId` "DLT entity ID", `messaging.log.title` "Message log", `messaging.log.to` "To", `messaging.log.template` "Template", `messaging.log.segments` "Parts", `messaging.log.cost` "Cost", `messaging.log.body` "What we sent", `messaging.log.total` "{count} messages · {cost} this month", `messaging.error.party_opted_out` "Customer has opted out of SMS", `messaging.error.no_consent_recorded` "No consent recorded for this customer", `messaging.error.no_mobile` "No mobile number", `messaging.error.channel_not_configured` "No SMS provider is set up", `messaging.error.invalid_number` "Invalid mobile number", `messaging.error.template_not_approved` "This template is not approved yet", `messaging.error.insufficient_balance` "The SMS account has no balance", `messaging.error.globally_disabled` "Sending is paused". Hindi: "संदेश", "एसएमएस", "चालू", "कुछ नहीं भेजा जा रहा", "टेस्ट संदेश भेजें", "संदेश लॉग", "किसे", "कितने भाग", "खर्च", "हमने क्या भेजा". Copy rules: never say "sent" when the console backend was used — say "not sent" plainly; every failure shows a human reason and, where possible, the fix ("Add a mobile number for this customer"); costs are always shown in rupees with the segment count beside them so the merchant understands why a Hindi message costs more.

#### 9. States
Channel card: Not configured · Console · Live · Disabled (tenant kill switch) · Globally paused (incident banner) · Testing (spinner) · Test failed (inline error with the provider's message). Credentials: Unset · Set (masked) · Validating · Invalid (danger + Reconnect). Message row lifecycle: `queued` → `sent` → `delivered`, or `queued` → `skipped` (console/consent/kill switch), or `queued` → `failed` (terminal after ≤ 3 attempts) with `attempts` shown. Log page: Loading · Ready · Empty first-use ("Nothing has been sent yet") · Filtered-empty · Error. Templates page: Loading · Ready · Missing template (a code used by code but absent from the registry renders a `danger` row "Not registered — messages of this type will fail", surfaced by a startup check). Job/scheduler: Idle · Draining · Backlogged (> 500 queued rows raises a system notification).

#### 10. Validation Rules
Provider settings: `provider` from the registered enum per channel → 400 `validation_error`; `api_key` 8–128 chars required when a provider is chosen; `sender_id` exactly 6 uppercase letters for Indian transactional SMS (`^[A-Z]{6}$`) → "Sender ID must be 6 capital letters"; `dlt_entity_id` 8–24 digits. Templates (partner console): `code` `^[A-Z][A-Z0-9_]{2,31}$` unique per `(scope, channel, locale)`; `body` 1–1,000 chars; every `{{variable}}` in the body must appear in `variables[]` and vice versa → 400 `details.body: ["Undeclared variable {{shop}}"]`; `dlt_template_id` required when `channel='sms'` and `category ≠ 'transactional'` → 400 `dlt_template_required`; `category` from the enum. Send-time: `to` must be E.164 with a valid Indian mobile prefix for SMS → `skipped` with `invalid_number`; `params` must satisfy the template's declared variables → `failed` with `TemplateRenderError`. Test send: 3/hour/user → 429. Server error codes: 409 `channel_not_configured`, 409 `template_not_registered` (CCR-39), 409 `dlt_template_required`, 403 `permission_denied`, 404 cross-tenant.

#### 11. Business Rules
1. BR-1 **One row per attempt-chain.** A message has exactly one `notifications_message_log` row from `queued` to its terminal status; retries increment `attempts` on that row rather than creating new rows, so the log is a list of *messages*, not of HTTP calls.
2. BR-2 Every send is logged, including the ones that never leave the building (`skipped`). "No row" must always mean "the feature never tried", which is what makes support diagnosable.
3. BR-3 The console backend is not a stub to be bypassed: it is the correct production behaviour for a tenant without a provider, and the UI says so honestly (FR-13).
4. BR-4 Template resolution is tenant → partner → global; a missing `(code, channel, locale)` falls back to `locale='en'` and then fails with `template_not_registered` rather than sending an unrendered body.
5. BR-5 DLT compliance is the partner's responsibility and is expressed as data (`dlt_template_id`, `sender_id`, `category`); the product never sends an SMS whose template lacks a DLT id when the resolved provider declares `requires_dlt=true`.
6. BR-6 Consent (FR-9) is checked at send time, not at composition time, because consent can be withdrawn between the two.
7. BR-7 Cost is an estimate computed from segments × the configured price, not a provider-reported figure, until a provider DLR carries a real cost — in which case the reported value overwrites the estimate and the row is flagged `cost_source='provider'`.
8. BR-8 OTP is the only inline (unqueued) send (§5); every other channel use is asynchronous.
9. BR-9 A message is never re-sent automatically after a terminal `failed`; resending is an explicit user action that creates a **new** log row linked to the old one via `meta.resend_of`.
10. BR-10 `wa.me` deep links are "sent" only when the client confirms the user tapped through (NTF-03 BR-4 / LED-06 FR-2); the product never claims to have messaged a customer on the user's behalf when it merely opened WhatsApp.
11. BR-11 Message bodies are retained for 180 days (matching notifications) and then truncated to the template code and params hash; the log row itself is kept for 7 years because it evidences consent-based communication.
12. BR-12 Provider credentials are never logged, never returned, never included in an export, and are re-validated on every settings save.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See messaging status | `notifications.settings.manage` | ✅ | ✅ | ❌ | ❌ |
| Override provider / credentials / sender ID | `platform.tenant.manage` + OTP step-up | ✅ | ❌ | ❌ | ❌ |
| Send a test message | `notifications.settings.manage` | ✅ | ✅ | ❌ | ❌ |
| Read the message log | `notifications.settings.manage` | ✅ | ✅ | ❌ | ✅ (read-only, for reconciling costs) |
| See the messages strip on an entity | that entity's read codename | ✅ | ✅ | ✅ | ✅ |
| Register / version templates | partner console (`partner.templates.manage`) or super admin | — | — | — | — |
| Toggle `messaging.enabled` | `platform.tenant.manage` | ✅ | ❌ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 A feature calls `send_message()` with a template code that is not in the registry → the row is written `failed` with `template_not_registered`, the owner is notified, and a startup self-check lists every code referenced in the codebase but missing from the seed (CI fails on a mismatch).
2. EC-2 Hindi reminder of 180 characters → UCS-2 → 3 segments → cost ₹0.60; the composer showed "3 parts" before sending.
3. EC-3 Provider returns a `provider_message_id` that collides with an existing row (provider bug) → the log keeps both; the DLR matcher prefers the most recent `sent` row and flags the ambiguity.
4. EC-4 DLR arrives before the send transaction commits → stored in the receipt staging table and applied when the row appears (within 7 days).
5. EC-5 Provider account runs out of balance mid-batch → the first failure marks `insufficient_balance` (non-retryable), the remaining queued rows fail fast on the same error, and **one** owner notification is raised, not fifty.
6. EC-6 The party's mobile changes between queueing and delivery → the log keeps the number it was queued with (`to_address` is a snapshot); the party detail explains the mismatch.
7. EC-7 A tenant switches provider with rows still `queued` → those rows deliver through the **new** backend (resolution happens at delivery time), which is intentional and noted in the runbook.
8. EC-8 The scheduler is down for two hours → rows stay `queued`; on recovery they drain oldest-first, and any row older than 6 hours whose template category is `reminder`-like is skipped with `error='stale'` rather than sending a stale nudge.
9. EC-9 A body renders to an empty string (all params blank) → `TemplateRenderError`, row `failed`, nothing sent.
10. EC-10 `to` is a landline or a 10-digit number without `+91` → normalised to E.164 by the shared `normalize_mobile()`; a non-mobile prefix is rejected as `invalid_number`.
11. EC-11 Two owners save provider credentials simultaneously → last write wins with `version` on the settings object; both saves are audited and the credentials are re-validated.
12. EC-12 Global kill switch turned on while 300 rows are queued → they resolve to `skipped` with `globally_disabled`; turning it off does not replay them (BR — stated in FR-15/Alternate F).
13. EC-13 A provider's webhook is called with a forged payload → signature verification fails, the request is logged and rejected with 400; no row is modified.
14. EC-14 A template is re-approved with a new DLT id → the partner creates a new `version`; in-flight queued rows keep the version they were rendered with (the body is already stored on the row).

#### 14. API Requirements
- `GET /notifications/messaging` → `{ data: { channels: [ { channel, provider, origin: tenant|partner|default, status, sender_id, requires_dlt, credentials_set, price_per_segment } ], messaging_enabled, globally_disabled } }`.
- `PUT /notifications/messaging/{channel}` (owner, step-up) `{ provider, api_key?, api_secret?, sender_id?, dlt_entity_id? }` → 200; 400 `provider_credentials_invalid`.
- `POST /notifications/messaging/{channel}/test { to? }` → 202 `{ message_log_id }`; 429 on the 3/hour limit.
- `GET /notifications/messages?channel&status&template_code&party_id&related_type&related_id&date_from&date_to&q&page` → `data[]` of log rows (body included only when the caller holds `notifications.settings.manage`) + `meta.totals { count, cost, by_status }`.
- `GET /notifications/messages/{id}` → the row with the rendered body, attempts, provider raw response (super admin only) and `related` summary.
- `POST /notifications/messages/{id}/resend` → 202 `{ message_log_id }` (new row, `meta.resend_of`); 409 `channel_not_configured`.
- `GET /notifications/templates?channel&locale&scope=global|partner|tenant` → the resolved registry with an `origin` per row.
- `POST /webhooks/messaging/{provider}` — unauthenticated, signature-verified, idempotent on `provider_message_id`, 200 fast (store-and-ack like PAY-06 FR-7).
- Internal only: `send_message()` (FR-5) — there is deliberately **no** public "send an arbitrary message" endpoint, so the product can never be used as an SMS gateway.
- Frontend: `messagingService.ts` (`getChannels`, `updateChannel`, `test`, `listMessages`, `getMessage`, `resend`, `listTemplates`); `messagingSlice` + `messagingThunk.ts`; `messageDisplay.ts` (`statusTone`, `maskTo`, `segmentLabel`, `errorText`); the shared `MessagesStrip` component reads `messages[]` already embedded in each entity's detail response (CCR-6/CCR-17 pattern) rather than querying this API.

#### 15. Database Impact
`notifications_message_log` extended (CCR-39): `segments smallint NN default 1`, `unicode boolean NN default false`, `attempts smallint NN default 0`, `next_attempt_at timestamptz NULL`, `template_version smallint NULL`, `sender_id varchar(16) NULL`, `cost_source varchar(10) NN default 'estimate'`, `body text NULL` (the rendered text, truncated at 180 days), `meta jsonb`. Indexes: existing `IX(tenant_id, created_at DESC)` and `IX(provider_message_id)`; new `IX(tenant_id, status, next_attempt_at) WHERE status='queued'` for the drain query and `IX(tenant_id, related_type, related_id)` for the per-entity strip. `notifications_template` extended per FR-6. New `notifications_message_receipt` staging table (`provider`, `provider_message_id`, `payload jsonb`, `received_at`, `applied_at NULL`, `U(provider, provider_message_id, received_at)`). Credentials in `platform_tenant_secret` / `platform_partner_secret` (CCR-22). Writes `platform_job` (delivery, polling, pruning), `notifications_notification` (failure notices), `platform_audit_log`.

#### 16. Audit Requirements
`messaging.provider_changed` (`before`/`after` = provider, sender_id, origin — **never credentials**, only `credentials_set: true/false`), `messaging.test_sent` (`metadata.to` masked), `messaging.enabled_changed`, `messaging.template_registered` / `.template_versioned` (partner scope, `metadata` = code, channel, locale, dlt id), `messaging.message_resent` (`metadata.original_id`), `messaging.globally_disabled` (super admin, `actor_type='super_admin'`). Individual sends are **not** audited — they are the message log, which is itself an append-mostly record retained for 7 years (BR-11); duplicating them into `platform_audit_log` would double the largest table in the system for no added evidentiary value.

#### 17. Notifications
- In-app (NTF-01) `notification_channel_failed` (owner/admin): "A reminder to Ramesh Traders could not be sent — Invalid mobile number", `data.route=/settings/messaging/log?id={id}`; coalesced to one row per error class per hour ("4 messages failed — the SMS account has no balance").
- In-app `messaging_backlog` (owner + super admin): raised when more than 500 rows sit `queued` for over 15 minutes — "Messages are piling up — the scheduler may be down".
- In-app `messaging_provider_invalid`: "Your SMS provider rejected the credentials — reconnect it" (owner only, once per 24 h).
- Outbound: this feature **is** the outbound path; it raises no party-facing message of its own except the test message (template `TEST_MESSAGE`: "This is a test message from {shop} on DigiKhaato. -{shop}").

#### 18. Analytics / Event Tracking
`ub.notifications.messaging_settings_viewed` `{ channels_live, channels_console }`; `ub.notifications.messaging_provider_changed` `{ channel, provider, origin }`; `ub.notifications.messaging_test_sent` `{ channel, result }`; `ub.notifications.message_log_viewed` `{ rows_bucket, filter_status }`; `ub.notifications.message_resent` `{ channel, original_error_class }`; `ub.notifications.message_sent` (server) `{ channel, template_code, status, segments, unicode, attempts, locale }`; `ub.notifications.message_failed` (server) `{ channel, template_code, error_class, attempts }`; `ub.notifications.message_skipped` (server) `{ channel, reason }`; `ub.notifications.dlr_received` (server) `{ channel, provider, status, latency_seconds_bucket }`. Never the recipient number, the body, the party name or credentials.

#### 19. Security
Credentials are encrypted at rest (AES-GCM via `platform_tenant_secret`/`platform_partner_secret`), write-only over the API, decrypted only inside the backend, redacted from every log line and excluded from tenant exports. There is no public send endpoint (FR-14), which is the single most important control — it prevents the product from being abused as a bulk SMS gateway. Test sends are restricted to the calling member's own registered mobile and rate-limited 3/hour. Webhook endpoints verify HMAC signatures with `hmac.compare_digest`, cap the body at 1 MiB, are idempotent, and never trust a tenant id from the payload (they match on `provider_message_id`, which is tenant-resolved from the stored row). Recipient numbers are PII: masked in every list view, excluded from analytics, and the stored `to_address` is the minimum needed for delivery evidence. Bodies may contain a party name and an amount and are therefore readable only with `notifications.settings.manage`. Template bodies are rendered with a strict placeholder whitelist (FR-7), so a crafted param cannot inject a new placeholder or a URL into a DLT-approved text. Outbound provider calls go to a pinned host allowlist over TLS with verification on. Rate limits: default 600/min; webhooks 600/min per provider.

#### 20. Performance
`send_message()` is two inserts and returns in ≤ 15 ms so it never slows a payment or an invoice. The drain query is `SELECT … WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) ORDER BY created_at LIMIT 200 FOR UPDATE SKIP LOCKED` on the partial index — safe for concurrent runners and bounded per tick. Each delivery is its own transaction so one provider timeout cannot block the batch. The log list paginates at 25 with no joins (related summaries are denormalised into `meta`), and `meta.totals` is a single aggregate. The per-entity `messages[]` strip is served from the entity's own query via `prefetch_related` on `IX(tenant_id, related_type, related_id)`, never an extra round trip. Body text is stored inline but excluded from list serializers (`defer('body')`). CI asserts ≤ 3 queries for the log list and runs the drain query's `EXPLAIN` against a 500k-row fixture.

#### 21. Testing
T-NTF-02-1 (unit) `ConsoleSmsBackend` returns `skipped`, writes the log line and never opens a socket (asserted with a socket guard). T-NTF-02-2 (unit) backend resolution order tenant → partner → default → console, including a tenant override of a partner provider. T-NTF-02-3 (unit) `render_template` substitutes declared variables, raises on a missing one, ignores extras, truncates per `max_variable_len` and strips newlines. T-NTF-02-4 (unit) `count_segments` table: GSM-7 160/153 boundaries, the extension table (`€`, `{`, `}` counting double), Hindi UCS-2 70/67, and the resulting cost. T-NTF-02-5 (unit) consent gate: opted-out, no consent for `service_explicit`, no mobile — each produces `skipped` with the right error and no send. T-NTF-02-6 (unit) retry policy: retryable error retries at 1/5/15 min up to 3 attempts then `failed` + one owner notification; non-retryable fails immediately. T-NTF-02-7 (unit) one row per attempt-chain (BR-1): three attempts leave one row with `attempts=3`. T-NTF-02-8 (unit) DLR matching updates `delivered_at`; an early DLR is staged and applied later; a forged signature is rejected. T-NTF-02-9 (unit) OTP sends inline and falls back to the queue on timeout. T-NTF-02-10 (unit) global kill switch and tenant `messaging.enabled` both produce `skipped` rows and no sends; turning them off does not replay. T-NTF-02-11 (unit) stale-reminder guard skips rows older than 6 hours. T-NTF-02-12 (architecture) a test scans the codebase and fails if any module outside `notifications/` imports a provider backend or calls a provider URL. T-NTF-02-13 (architecture) every template code referenced in code exists in the seed, and every seeded code is referenced (no orphans). T-NTF-02-14 (API) settings GET/PUT masks credentials, validates the sender ID regex, requires step-up, and audits without secrets. T-NTF-02-15 (API) test send is limited to the caller's own mobile and 3/hour. T-NTF-02-16 (API) message log filters, totals, body visibility by permission; accountant can read the list but the body is omitted without `notifications.settings.manage`. T-NTF-02-17 (API) resend creates a new row linked by `meta.resend_of`. T-NTF-02-18 (component) channel cards for each status, console banner, credentials masked state, test flow. T-NTF-02-19 (component) log grid statuses, masked recipients, segment and cost columns, body expansion. T-NTF-02-20 (E2E) with `FakeSmsBackend`: reminder → queued → scheduler tick → sent → DLR webhook → delivered → the party timeline shows the delivery chip. T-NTF-02-21 (perf) drain query with `SKIP LOCKED` under two concurrent runners processes each row exactly once.

#### 22. Acceptance Criteria
- AC-1 (US-NTF-02-1) Given any feature that messages a party, when it sends, then it calls only `notifications.services.send_message()`, and the architecture test fails the build if a provider is imported anywhere outside `notifications/`.
- AC-2 (US-NTF-02-2) Given a tenant with no provider configured, when a reminder is sent, then a `notifications_message_log` row exists with `status='skipped'`, `error='channel_not_configured'`, `provider='console'`, the body is written to the structured log, no network call is made, and the UI says "Console — nothing is sent" rather than claiming success.
- AC-3 (US-NTF-02-3) Given a partner admin who registers sender ID `SHRMST`, a DLT entity id and DLT template ids for `REMINDER_SMS` and `RECEIPT_SMS`, when a tenant under that partner sends a reminder, then the resolved template carries the DLT id and sender ID, the channel card reads "Live (MSG91) — From your partner: Metis Labs", and no code was deployed.
- AC-4 (US-NTF-02-4) Given 482 messages this month, when the owner opens the message log, then every attempt is listed with its time, masked recipient, template, status, parts, cost and error, the header totals read "482 messages · ₹96.40 this month", and expanding a row shows the exact text that was sent.
- AC-5 (US-NTF-02-5) Given a provider returning 429, when the message is delivered, then the row shows `attempts` rising through 1, 2 and 3 with retries at roughly 1, 5 and 15 minutes; if all three fail, then the row is `failed` and exactly one in-app notification tells the owner the plain-language reason.
- AC-6 (US-NTF-02-6) Given a super admin changing a partner's SMS provider, when the change is saved, then subsequent sends for that partner's tenants use the new backend with no restart and no deploy, and the change is audited without any credential value.
- AC-7 (US-NTF-02-7) Given a party with `sms_opt_in=false`, when a reminder is attempted, then no message is sent, the row is `skipped` with "Customer has opted out of SMS", and the composer had already hidden the SMS option; given a `service_explicit` template and a party with no `consent_at`, then the row is `skipped` with "No consent recorded for this customer".

#### 23. Dependencies
NTF-01 (failure and backlog notifications, `data.delivery`), NTF-03 (`WaMeBackend` renders the deep-link text), NTF-04/NTF-05/NTF-06 (further backends behind the same interface), LED-06/LED-07/LED-08 (the heaviest callers), PAY-04 (receipt SMS), PAY-06 (`PAY_LINK_SMS`, shared secret storage CCR-22), PLT-01 (OTP — the one inline send), PLT-02 (member invitations), PTY-01 (`sms_opt_in`, `consent_at`, `consent_source`), PLT-05 (settings, `version`), PLT-06 (OTP step-up for credentials), WLB-06 (partner-level provider, sender ID and templates), ADR-012 (`platform_job` + `run_scheduler`), ADR-015 (adapter-only at MVP), ADR-021/ADR-022 (stdlib HTTP, no SDK), `UbDataGrid`, `UbStatusBadge`, `UbStatusBanner`, `UbField`, CCR-22/CCR-39.

#### 24. Future Enhancements
Provider failover (try MSG91, fall back to Kaleyra on a hard failure) with per-provider health tracking; a real cost ledger reconciling provider invoices to the log (like PAY-06's settlement view); RCS and voice-OTP backends; per-template A/B testing of reminder wording with collection-rate measurement; scheduled sending windows honouring TRAI's promotional blackout hours; a self-service DLT registration wizard walking a merchant through the operator portal; bulk campaign sending (explicitly out of scope at MVP — the product is transactional only); message templates editable by tenants where the regulation allows (non-DLT channels such as WhatsApp utility with pre-approved variables); delivery-rate dashboards per template and per operator circle.

### NTF-03 — WhatsApp deep-link share

#### 1. Business Objective
WhatsApp is where Indian small businesses already talk to their customers, and at MVP DigiKhaato has no WhatsApp Business API, no SMS credits and no server-side PDF. The bridge is the **`wa.me` deep link**: the product composes the exact text (with the right numbers, in the right language, with a public link to the statement, invoice or receipt), opens WhatsApp with it prefilled, and lets the merchant press send from their own number — which is also why the customer trusts it. This one mechanism carries statements (LED-04), reminders (LED-06), invoices (SAL-08), receipts (PAY-04), payment links (PAY-06) and member invitations at zero cost and zero compliance overhead. Measured by: ≥ 60 % of reminders and ≥ 40 % of invoices are shared this way in month 1; ≥ 80 % of composed shares are confirmed as opened (the tap-through callback); public link view rate ≥ 35 % within 48 h.

#### 2. User Personas
Owner (OW) shares statements, bills, receipts and reminders; Staff (ST) shares the bill they just made at the counter; Accountant (AC) shares statements with the CA or the party; Customer (CU) receives the message and opens the link; Partner admin (PA) sets the default wording per white-label brand (WLB-07).

#### 3. User Stories
1. US-NTF-03-1 — As an owner I want to send a customer their khata on WhatsApp with one tap so that I do not have to type the balance myself.
2. US-NTF-03-2 — As staff I want to share the bill I just made, with a link the customer can open, so that the counter queue keeps moving.
3. US-NTF-03-3 — As an owner I want the message in Hindi when my customer is Hindi-speaking so that it is actually read.
4. US-NTF-03-4 — As a customer I want the link to open a clean page with the shop's name and my balance, and to be able to save it as a PDF.
5. US-NTF-03-5 — As an owner I want to share to a number that is not saved as a party (a one-off buyer) without creating a record.
6. US-NTF-03-6 — As an owner I want to know which shares I actually sent, and when, so that I do not nag the same customer twice.
7. US-NTF-03-7 — As an owner I want to revoke a link I shared by mistake so that the balance stops being visible.

#### 4. Functional Requirements
1. FR-1 **One share component.** `UbShareSheet` (Part 17.0.2) is the only share surface: a `MLDropdownMenu` on desktop and a bottom `UbDrawer` on mobile, with the actions **WhatsApp** (primary), **Copy link**, **Copy text**, **Download PDF** (browser print → Save as PDF, ADR-014), **SMS** (visible only when `feature_flags.sms_configured`) and **Email** (Phase 2, NTF-06). Every feature that shares mounts this component with a `shareKind` and an entity id; no feature composes its own menu.
2. FR-2 **Server composes the text.** The client never builds a message containing money. `POST /{resource}/{id}/share-links { kind, expires_in_days? }` returns `{ url, expires_at, share_text, wa_url }` where `share_text` is rendered server-side from the `notifications_template` registry (NTF-02 FR-6) in the **party's** language (`party.locale`? → falls back to `tenant.locale`) with the amounts formatted as `Rs 1,234` (never `₹`, for the same encoding reason as NTF-02 FR-7) and `wa_url` is the ready `https://wa.me/<91XXXXXXXXXX>?text=<urlencoded>`. Share kinds at MVP: `statement` (LED-04), `reminder` (LED-06), `invoice` / `estimate` / `credit_note` (SAL-08), `receipt` / `voucher` (PAY-04), `payment_link` (PAY-06, Phase 2), `invitation` (PLT-02).
3. FR-3 **Public link.** Each share creates a `parties_share_link` row (generalised by CCR-7 to `kind`, `params jsonb`, nullable `party_id`) with a 32-byte URL-safe token stored as `token_hash`, an expiry (defaults: statement 7 days, invoice 30, receipt 30, reminder 7, payment link = the request's expiry) and a `view_count`. The URL is `https://<host>/d/<token>` (documents and receipts) or `/khata/<token>` (statements), resolved by `GET /public/d/{token}` / `GET /public/khata/{token}` and rendered by `PublicDocumentPage` — the same React print components as the in-app view, read-only, `noindex`, with a language toggle and a **Save as PDF** button.
4. FR-4 **Opening WhatsApp.** Tapping **WhatsApp** calls `window.open(wa_url, '_blank', 'noopener')` (a user-gesture-initiated open, never a redirect, so mobile browsers do not block it) and then fires `POST /{resource}/{id}/send-share { channel: "whatsapp_manual" }` which writes the `notifications_message_log` row (`channel='whatsapp'`, `provider='wa_me'`, `status='sent'`, `template_code`, `to_address`, `related_type/related_id`, `body`) through NTF-02's `WaMeBackend`. The row is written **only after** the open succeeds — the product never claims to have messaged someone it did not (NTF-02 BR-10).
5. FR-5 **Recipient resolution.** The number is `party.mobile` when present. When the party has no mobile, or the entity has no party (walk-in), the sheet shows a `UbPhoneInput` "Customer's WhatsApp number" with a **not saved** caption; the entered number is used for the one URL and for `to_address` on the log row, and is never written to `parties_party` unless the user also ticks **Save to this customer** (which calls PTY-02). WhatsApp Web (`web.whatsapp.com`) is used instead of `wa.me` on desktop when the user has chosen it once (persisted in `localStorage` as `ub.share.waTarget`).
6. FR-6 **Text templates.** Bodies live in the NTF-02 registry with codes `STATEMENT_SHARE`, `REMINDER_WHATSAPP`, `INVOICE_SHARE`, `ESTIMATE_SHARE`, `CREDIT_NOTE_SHARE`, `RECEIPT_SHARE`, `VOUCHER_SHARE`, `PAY_LINK_SHARE`, `INVITE_MEMBER_WHATSAPP`, each with `en` and `hi` rows, `category='transactional'` and **no DLT id** (WhatsApp deep links are the user's own message, not a bulk send). Every body follows one shape: what happened / what is owed → the link → the shop name. Example `STATEMENT_SHARE` en: "Namaste {party}, here is your account with {shop} till {date}.\nYou will give: Rs {balance}\nSee details: {link}\n- {shop}"; hi: "नमस्ते {party}, {date} तक {shop} के साथ आपका हिसाब।\nआप देंगे: Rs {balance}\nविवरण: {link}\n- {shop}".
7. FR-7 **Length discipline.** The composed text is capped at 900 characters (WhatsApp's URL practical limit across browsers is well below the spec maximum); `render_share_text()` truncates the optional middle section (line items, last transactions) before the link and the sign-off, never the link. The composer preview shows the exact text with a character counter.
8. FR-8 **Preview and edit.** The share sheet shows the composed text in a read-only `--surface-sunken` block with a **Copy text** action. For `reminder` only (LED-06), an **Edit message** disclosure allows appending a personal line (≤ 120 chars) before sending; the generated amounts and link are not editable, and the appended text is stored on the log row so the merchant can see what they actually sent.
9. FR-9 **Bulk share.** Lists that support bulk selection (parties for reminders, LED-06 FR-6) call `POST /reminders/bulk { party_ids[], channel: "whatsapp_manual" }` which returns `[{ party_id, wa_url, text }]`; the UI then presents a **one-at-a-time queue** (`BulkShareQueue`): "1 of 12 — Ramesh Traders · Send" → tapping opens WhatsApp, returning to the app advances the queue. Browsers block multiple `window.open` calls, so batch sending is deliberately sequential and user-driven, with a progress bar and **Skip** per row.
10. FR-10 **PDF.** **Download PDF** opens the print route (`/print/...`, SAL-03 `PrintDocumentFrame`) and calls `window.print()`; the customer's public page carries the same button. There is no server-side PDF at MVP (ADR-014), so **no PDF file is ever attached to the WhatsApp message** — the link is the attachment. This is stated once in the sheet's help hint so the expectation is set.
11. FR-11 **Revoke and expiry.** `GET /share-links?kind&party_id&status=active|expired|revoked` lists a tenant's links; `POST /share-links/{id}/revoke` sets `revoked_at` so the public page renders "This link is no longer available — ask {shop} for a new one" with the shop's phone. A scheduler task `expire_share_links` marks past-expiry rows daily. Re-sharing the same entity within an active link's validity **reuses** the link (LED-06 BR-7 / PAY-04 BR-3) rather than minting a second token.
12. FR-12 **View tracking.** The public endpoint increments `view_count` and records `last_viewed_at` (CCR-7), debounced to one count per token per hour per IP hash. The in-app entity shows "Viewed 2 times · last 19/09 14:02", and a `document_shared_viewed` NTF-01 notification is raised the **first** time a shared link is opened ("Ramesh opened the statement you sent").
13. FR-13 **Fallbacks.** If `window.open` is blocked (in-app browsers, PWA standalone mode on some Androids) the sheet falls back to rendering the `wa_url` as a real `<a target="_blank">` the user taps directly, plus **Copy text** and **Copy link** — the message is never lost. If WhatsApp is not installed, the OS opens `wa.me` in a browser which prompts to install; the sheet's help hint mentions SMS and copy as alternatives.
14. FR-14 **Language.** The share text language follows, in order: an explicit `locale` chosen in the sheet's language `MLToggleGroup` (EN / हिं) → `party.locale` (CCR-40: a new nullable column on `parties_party`, set the first time a merchant chooses a language for that party) → `tenant.locale`. The chosen language is remembered per party so the second share needs no choice.

#### 5. Non-Functional Requirements
Share-link creation P95 ≤ 250 ms (one insert plus a template render; the link is minted lazily when the sheet opens, not on page load). Sheet interactive ≤ 150 ms from tap using data already in the entity's Redux slice; the composed text arrives with the link response and is shown as soon as it lands (skeleton for ≤ 250 ms). Public page: LCP ≤ 2.5 s on 3G, ≤ 150 kB JS, works without login, `noindex, nofollow`, cached 60 s per token in-process. The `wa.me` URL must stay under 2,000 characters total after encoding (FR-7 guarantees it). Full keyboard operation of the sheet; the WhatsApp action is a real button with an accessible name including the recipient ("Send on WhatsApp to Ramesh Traders"). en/hi for the sheet UI; the message body is content, not UI, and follows FR-14.

#### 6. User Flow
Primary (statement): Party → Ramesh Traders → **Share** → sheet opens, link minted, preview shows the Hindi text with "आप देंगे: Rs 2,800" and a `/khata/` link → **WhatsApp** → WhatsApp opens with the text prefilled to +91 98123 45678 → the owner presses send in WhatsApp → returning to the app, the timeline shows "Statement shared on WhatsApp · just now".
Alternate A (counter bill): staff issues INV/26-27/0042 → the success screen's **Share** → **WhatsApp** → text "Bill INV/26-27/0042 from Sharma Store: Rs 898. See bill: https://…/d/abc123" → sent in 4 seconds.
Alternate B (no mobile): walk-in receipt → the sheet asks for a number → typed → shared → **Save to this customer** left unticked → nothing persisted beyond the log row.
Alternate C (bulk reminders): Parties → filter Overdue → select 12 → **Remind on WhatsApp** → queue "1 of 12 · Ramesh Traders" → Send → WhatsApp → back → "2 of 12" → … → summary "10 sent, 2 skipped".
Alternate D (customer): the customer taps the link → the public khata page opens in their language → they see the running balance and the last 20 entries → **Save as PDF** → the owner gets "Ramesh opened the statement you sent".
Alternate E (revoke): the owner shared a statement to a wrong number → Party → Shared links → **Revoke** → the public page now says the link is no longer available.
Alternate F (blocked popup): an in-app browser blocks the open → the sheet shows a large "Open WhatsApp" link plus **Copy text** → the owner taps the link → same outcome.

#### 7. UI Requirements
`UbShareSheet`: header "Share" + the entity's one-line identity ("Statement · Ramesh Traders · till 18/09"); a language `MLToggleGroup` (EN / हिं) when the tenant has both locales; a recipient row showing the party's name and masked number with a **Change** action (opens `UbPhoneInput` inline); a preview block (`--surface-sunken`, `ds-body-sm`, `max-h-40` scrollable) with a character counter `ds-caption` and, for reminders, an **Edit message** disclosure with an `MLTextarea` (120 chars); then the action list — **WhatsApp** (`MLButton` primary with the WhatsApp glyph from `lucide-react`'s `MessageCircle`, since no brand icons are bundled), **Copy link**, **Copy text**, **Download PDF**, **SMS** (conditional), each `MLItem` height 48 px; a footer `UbHelpHint` "The bill opens as a link — WhatsApp cannot attach a PDF from the web". `BulkShareQueue` (`UbDialog`): progress "3 of 12", the current party's name and balance, **Send** (primary) / **Skip** (ghost) / **Stop**, and a completion summary list. `SharedLinksPanel` (inside the party/document detail): rows of kind, created, expires, views, and a **Revoke** action. `PublicDocumentPage` / `PublicKhataPage`: tenant logo and name, the document or statement, a language toggle, **Save as PDF**, a "Pay now" static UPI QR when `documents.show_upi_qr` (PAY-03), the shop's phone, and a footer "Generated by {app_name}" — no navigation, no login, no other party's data. Mobile: the sheet is a bottom drawer at 60 vh with 48 px rows; the preview collapses to 3 lines with **Show full text**.

#### 8. UX Requirements
Keys: `share.title` "Share", `share.whatsapp` "WhatsApp", `share.copyLink` "Copy link", `share.copyText` "Copy text", `share.downloadPdf` "Download PDF", `share.sms` "SMS", `share.email` "Email", `share.recipient` "To", `share.change` "Change", `share.enterNumber` "Customer's WhatsApp number", `share.notSaved` "Not saved to this customer", `share.saveToParty` "Save to this customer", `share.language` "Language", `share.preview` "Message", `share.showFull` "Show full text", `share.editMessage` "Add a line of your own", `share.charCount` "{count} of 900 characters", `share.pdfHint` "The bill opens as a link — WhatsApp cannot attach a PDF from the web", `share.opened` "WhatsApp opened", `share.copied` "Copied", `share.blocked` "Your browser blocked the popup — tap the link below", `share.bulk.progress` "{current} of {total}", `share.bulk.done` "{sent} sent, {skipped} skipped", `share.links.title` "Shared links", `share.links.views` "Viewed {count} times", `share.links.revoke` "Revoke", `share.links.revoked` "Link revoked", `share.public.expired` "This link is no longer available — ask {shop} for a new one", `share.public.savePdf` "Save as PDF". Hindi: "साझा करें", "व्हाट्सएप", "लिंक कॉपी करें", "टेक्स्ट कॉपी करें", "पीडीएफ डाउनलोड करें", "किसे", "बदलें", "ग्राहक का व्हाट्सएप नंबर", "इस ग्राहक में सहेजें", "भाषा", "संदेश", "अपनी एक लाइन जोड़ें", "व्हाट्सएप खुल गया", "कॉपी हो गया", "लिंक रद्द करें", "पीडीएफ सहेजें". Copy rules: the snackbar after sharing says "WhatsApp opened" — never "Message sent", because the merchant still has to press send; the PDF hint is stated once rather than repeated; the recipient is always visible before the action so a wrong number is caught before WhatsApp opens; Hindi text uses "आप देंगे / आप लेंगे" per canon §0.2 and the red/green semantics are carried by words since a text message has no colour.

#### 9. States
Sheet: Opening (skeleton preview, actions disabled 250 ms) · Ready · No recipient (phone input focused, WhatsApp disabled until valid) · Composing error (link creation failed → "Could not prepare the message" + Retry; **Copy text** still offered from the cached template when possible) · Opening WhatsApp (button spinner 400 ms) · Opened (snackbar, sheet closes) · Blocked (fallback link, FR-13) · Expired entity (e.g. sharing a voided invoice → warning strip "This bill was cancelled — the link will show it as cancelled"). Bulk queue: Idle · In progress · Paused (user left the app) · Completed · Stopped. Public page: Loading · Ready · Void/cancelled (watermark) · Expired · Revoked · Not found · Error. Shared links panel: Empty ("Nothing shared yet") · Active · Expired (muted) · Revoked (struck through).

#### 10. Validation Rules
`shareSchema`: `mobile` (only when the party has none) via `mobileValidation()` → "Enter a 10-digit mobile number"; `locale ∈ {en, hi}`; `personal_line` ≤ 120 chars, no URLs (a regex rejects `http`/`www` so a merchant cannot smuggle a different link into a message the product signs) → "Links are not allowed in your own line"; `expires_in_days` 1–90. Server: `POST /{resource}/{id}/share-links` → 404 cross-tenant, 409 `document_not_shareable` (drafts cannot be shared — CCR-41), 400 `validation_error`; `POST …/send-share` → 400 when `channel` is not `whatsapp_manual` at MVP, 409 `party_opted_out` is **not** applied (a manual WhatsApp message is the merchant's own communication, not an automated send — this is an explicit decision recorded in BR-6); `POST /share-links/{id}/revoke` → 409 `already_revoked`; public endpoints → 404 for unknown/expired/revoked tokens with the same response shape (no oracle), rate-limited 60/min/token and 600/min/IP.

#### 11. Business Rules
1. BR-1 The product **prepares** a message; the merchant **sends** it. Every piece of copy, analytics event and log row respects that distinction (status `sent` on the log means "the merchant was handed the message", and the UI wording is "WhatsApp opened").
2. BR-2 Money and balances in a share text are always rendered server-side from the same selectors the app uses, so a shared statement can never disagree with the in-app view.
3. BR-3 A share link is scoped to exactly one entity and one kind; it never exposes navigation, other parties, notes, cost prices, staff names or internal ids. Party mobiles are masked on public pages.
4. BR-4 Links expire by default (7–30 days by kind) and are revocable; an expired or revoked link returns the same "no longer available" page as an unknown token so a guessed token reveals nothing.
5. BR-5 Re-sharing within validity reuses the existing token; this keeps a customer's saved link working and avoids an unbounded token table.
6. BR-6 Consent (`sms_opt_in`, NTF-02 FR-9) gates **automated** channels only. A `wa.me` deep link is the merchant messaging from their own WhatsApp account and is therefore not gated, but the sheet still shows a quiet note when the party has opted out of automated messages, and the message log records the share so the audit trail is complete.
7. BR-7 The personal line (FR-8) may not contain a URL (§10) and is stored on the log row; the generated portion is never editable, so a merchant cannot alter an amount in a message that carries the product's link.
8. BR-8 `Rs` is used instead of `₹` in every share text (encoding cost for the SMS path, rendering reliability across old Android WhatsApp builds for the WhatsApp path); the in-app UI always uses `₹`.
9. BR-9 The first view of a shared link raises exactly one notification per link (FR-12); subsequent views only increment the counter.
10. BR-10 Drafts are never shareable (§10); an estimate, invoice, credit note, receipt or statement must exist in a final state so the customer never sees a number that later changes.
11. BR-11 The share text always ends with the shop name, and never includes the product's brand unless the tenant is on the default partner (white-label rule, WLB-03).
12. BR-12 A share of a voided document still works and shows the void state (PAY-04 FR-8 / SAL-05) — hiding it would be worse for the customer than showing the cancellation.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Share a statement | `ledger.statement.export` | ✅ | ✅ | ✅ | ✅ |
| Share an invoice / estimate / credit note | `sales.invoice.read` (the entity's read) | ✅ | ✅ | ✅ | ✅ |
| Share a receipt / voucher | `payments.payment.write` (PAY-04 §12) | ✅ | ✅ | ✅ | ❌ |
| Share a reminder | `ledger.reminder.write` | ✅ | ✅ | ✅ | ❌ |
| Bulk share reminders | `ledger.reminder.write` | ✅ | ✅ | ✅ (capped at 25 per batch) | ❌ |
| View shared links and view counts | the entity's read codename | ✅ | ✅ | ✅ | ✅ |
| Revoke a shared link | the entity's write codename | ✅ | ✅ | ❌ | ❌ |
| Open a public link | token only | — | — | — | — |

#### 13. Edge Cases
1. EC-1 Party mobile is a landline or malformed → the WhatsApp action is disabled with "This number cannot receive WhatsApp"; **Copy text** stays available.
2. EC-2 Extremely long party or shop name pushes the text past 900 characters → the optional middle section is truncated first (FR-7) and the counter shows the final length; the link is never cut.
3. EC-3 The customer opens the statement link after the balance changed → the public page renders **live** data as of the request (a statement link is a view, not a snapshot) with an "as on {date} {time}" line so there is no ambiguity.
4. EC-4 A link is opened 500 times (shared onward in a family group) → `view_count` climbs, one notification was raised on the first view, and the rate limiter protects the endpoint.
5. EC-5 The merchant shares from a desktop without WhatsApp Web logged in → `wa.me` opens the WhatsApp Web login page; the sheet's `ub.share.waTarget` preference lets them switch to `web.whatsapp.com` permanently.
6. EC-6 The user cancels in WhatsApp without sending → the log row still says `sent` (the product cannot know); this is why the UI says "WhatsApp opened" and why the party timeline shows "Shared on WhatsApp" rather than "Customer was told".
7. EC-7 Bulk queue interrupted (the app is backgrounded for 10 minutes) → the queue state is held in Redux and restored with "You were on 5 of 12 — continue?".
8. EC-8 The same invoice is shared twice in one day → the second share reuses the link, writes a second log row, and the timeline shows both (a deliberate repeat is information, not a duplicate).
9. EC-9 A party is archived after a statement was shared → the link keeps working (historical truth) until it expires; revoking is available.
10. EC-10 The tenant has no logo → the public page renders the trade name in `ds-h2` only; no broken image.
11. EC-11 A token collides (astronomically unlikely) → the unique index on `token_hash` makes the insert retry with a new token, transparently.
12. EC-12 The customer's browser blocks `window.print()` on the public page → the same fallback as LED-04 EC-9 ("Open print view").
13. EC-13 A share is attempted for a draft invoice → 409 `document_not_shareable`, with the sheet explaining "Issue the bill first".
14. EC-14 Hindi text with an emoji pasted into the personal line → allowed in WhatsApp (no DLT constraint), stripped for the SMS path by NTF-02's renderer.
15. EC-15 A merchant changes the party's mobile after sharing → the old log row keeps the number it was sent to (`to_address` snapshot), and the party timeline shows both.

#### 14. API Requirements
- `POST /parties/{id}/share-links { kind: "statement", expires_in_days?, locale? }` → 201 `{ data: { id, url, expires_at, share_text, wa_url } }` (Part 22 §22.4).
- `POST /sales/invoices/{id}/share-links` · `/sales/estimates/{id}/share-links` · `/sales/credit-notes/{id}/share-links` · `/payments/{id}/share-links` (PAY-04 CCR-19) · `/payment-requests/{id}/share-links` (PAY-06) — same request and response shape, differing only in `kind` defaults and expiry.
- `POST /{resource}/{id}/send-share { channel: "whatsapp_manual", mobile?, personal_line?, locale? }` → 200 `{ data: { wa_url, text, message_log_id } }` — writes the NTF-02 log row; `mobile` accepted only when the entity has no party mobile.
- `POST /reminders/bulk { party_ids[], channel: "whatsapp_manual", locale? }` → 200 `{ data: [ { party_id, wa_url, text, reminder_id } ] }` (Part 22 §22.5), capped at 50 (25 for staff).
- `GET /share-links?kind&party_id&related_type&related_id&status&page` → `data[]` `{ id, kind, url, created_at, expires_at, revoked_at, view_count, last_viewed_at, created_by }`.
- `POST /share-links/{id}/revoke` → 200; 409 `already_revoked`.
- Public: `GET /public/d/{token}` → `{ kind, tenant: { name, logo_url, phone, upi }, document|payment: {…} }`; `GET /public/khata/{token}` → `{ tenant, party: { name, mobile_masked }, opening, entries[], closing, as_on }`; `GET /public/d/{token}.pdf` **not mounted at MVP** (ADR-014) — the page's print button is the PDF path. Both are unauthenticated, `noindex`, rate-limited and return an identical 404 shape for unknown, expired and revoked tokens.
- Frontend: `shareService.ts` (`createLink`, `sendShare`, `listLinks`, `revokeLink`, `bulkReminderShare`); `shareSlice` (`byEntity: { link, text, status }`, `bulkQueue`, `waTarget`) + `shareThunk.ts`; `shareDisplay.ts` (`waUrl`, `charCount`, `maskMobile`, `kindLabel`); `UbShareSheet` in `src/design-system/` with the `MessagesStrip` (NTF-02) reused underneath for history.

#### 15. Database Impact
`parties_share_link` generalised (CCR-7, extended by CCR-41): `kind varchar(24) NN`, `party_id uuid NULL`, `related_type varchar(32) NULL`, `related_id uuid NULL`, `params jsonb NN default '{}'`, `token_hash varchar(64) NN U`, `expires_at`, `revoked_at NULL`, `view_count int NN default 0`, `last_viewed_at NULL`, `locale varchar(8) NULL`, `created_by_id`. Indexes `IX(tenant_id, kind, related_type, related_id)`, `IX(tenant_id, expires_at) WHERE revoked_at IS NULL`, `U(token_hash)`. `parties_party` gains `locale varchar(8) NULL` (CCR-40) for FR-14. Writes `notifications_message_log` (through NTF-02), `notifications_notification` (first view), `platform_audit_log`, `platform_job` (`expire_share_links`). Reads the shared entity's own tables (`ledger_entry`, `sales_document`, `payments_payment`, `parties_party`, `platform_tenant`) and `notifications_template`.

#### 16. Audit Requirements
`share_link.created` (`metadata` = kind, related entity, expiry, locale), `share_link.revoked` (`metadata.reason?`), `share.sent` (`metadata` = channel `whatsapp_manual`, template_code, `to_address` masked, `message_log_id`, `personal_line_present: bool`), `share_link.first_viewed` (`actor_type='system'`, `metadata.ip_hash`). Bulk shares write one `share.bulk_sent` row with the party count plus the individual `share.sent` rows. Public page views beyond the first are counted, not audited (they would swamp the log).

#### 17. Notifications
- In-app (NTF-01) `document_shared_viewed`: "Ramesh Traders opened the statement you sent", `data.route` = the entity, raised once per link on first view (BR-9); coalesced to one row per day when several links are opened.
- In-app `share_link_expiring` (Phase 2 nicety, listed here for completeness): not raised at MVP.
- Outbound: the WhatsApp text itself, which is not an automated send but a prepared message (BR-1) — logged in `notifications_message_log` with `provider='wa_me'`.
- SMS: the same `share_text` is reusable by the SMS action when NTF-02 has a live provider; it then becomes a genuine automated send subject to consent (NTF-02 FR-9).

#### 18. Analytics / Event Tracking
`ub.notifications.share_sheet_opened` `{ kind, has_party_mobile, locale, surface }`; `ub.notifications.share_link_created` (server) `{ kind, expires_in_days, reused: bool }`; `ub.notifications.share_action` `{ kind, action: whatsapp|copy_link|copy_text|pdf|sms, locale, personal_line: bool }`; `ub.notifications.share_blocked_fallback` `{ kind }`; `ub.notifications.share_bulk_started` `{ count }`; `ub.notifications.share_bulk_finished` `{ sent, skipped, stopped: bool }`; `ub.notifications.share_link_viewed` (server) `{ kind, hours_since_share_bucket, first_view: bool, locale }`; `ub.notifications.share_link_revoked` `{ kind, age_days_bucket }`; `ub.notifications.share_pdf_printed` `{ kind, surface: app|public }`. Never the token, the number, the party name, the shop name or the amount.

#### 19. Security
Tokens are 32 random bytes from `secrets.token_urlsafe`, stored only as `token_hash` (SHA-256), never logged, never in analytics, and never included in an export. Unknown, expired and revoked tokens return an identical response so the endpoint is not an existence oracle. Public pages are `noindex, nofollow`, send `Referrer-Policy: no-referrer` (so the token does not leak through an outbound click), set a strict CSP with no third-party origins, mask the party's mobile, and expose only the entity the token names — never a list, never navigation, never another party. Rate limits: 60/min per token, 600/min per IP, 30/hour per tenant on link creation. The personal line rejects URLs (BR-7) so the product's signed message cannot be turned into a phishing vector, and all rendered text is escaped. The `wa.me` URL is built server-side and URL-encoded once; the client never concatenates user input into it. Sharing respects the entity's read permission (§12), and revocation respects its write permission. DPDP: a public link discloses a party's balance to whoever holds the URL — expiry, revocation, masking and the merchant's explicit action are the controls, and the help article says so plainly.

#### 20. Performance
Link creation is one insert plus a template render, minted lazily on sheet open and cached in `shareSlice` for the session, so repeated shares of the same entity cost nothing. `share_text` is rendered from data already loaded for the entity view (no extra queries) except for the statement, which reuses LED-04's selector with a 20-entry cap. The public endpoints are read-only, use the entity's existing indexes, are cached 60 s per token in-process, and defer the `view_count` increment to a single `UPDATE … SET view_count = view_count + 1` outside the render path. The bulk endpoint renders at most 50 texts in one request with `select_related('party')` — a single query plus a bounded loop. `UbShareSheet` is code-split and loaded on first use (it is not on the critical path of any page).

#### 21. Testing
T-NTF-03-1 (unit) `render_share_text` for every kind in en and hi, with and without a personal line, asserting `Rs` (never `₹`), the link's presence and the shop sign-off. T-NTF-03-2 (unit) 900-character cap truncates the middle section, never the link or the sign-off. T-NTF-03-3 (unit) `wa_url` is correctly encoded for a Hindi body with newlines and stays under 2,000 characters. T-NTF-03-4 (unit) link reuse within validity; a new token after expiry; token collision retries. T-NTF-03-5 (unit) expiry defaults per kind; `expire_share_links` marks past-expiry rows. T-NTF-03-6 (unit) revoked, expired and unknown tokens return identical 404 payloads. T-NTF-03-7 (unit) first view raises exactly one notification and increments the counter; the second view only increments; the hourly debounce holds. T-NTF-03-8 (unit) the personal line rejects `http`, `https` and `www`. T-NTF-03-9 (unit) locale resolution order explicit → party → tenant, and the party's locale is remembered. T-NTF-03-10 (API) share-links on a draft invoice → 409 `document_not_shareable`; on a voided invoice → 201 with the void state visible publicly. T-NTF-03-11 (API) `send-share` writes exactly one `notifications_message_log` row with `provider='wa_me'`, `status='sent'`, the snapshot `to_address` and the body. T-NTF-03-12 (API) walk-in share accepts a `mobile` that is never persisted to `parties_party`. T-NTF-03-13 (API) permission matrix: accountant can share a statement, not a receipt; staff bulk share capped at 25. T-NTF-03-14 (API) public khata returns masked mobile, live balance and an `as_on` timestamp, with no other party's data and no navigation. T-NTF-03-15 (component) `UbShareSheet` states: opening, ready, no recipient, blocked fallback, char counter, language toggle, PDF hint. T-NTF-03-16 (component) `BulkShareQueue` progress, skip, stop, restore after backgrounding. T-NTF-03-17 (component) public page renders in both languages, shows the void watermark, and the print button calls `window.print`. T-NTF-03-18 (E2E) share a statement → assert the opened URL (stubbed `window.open`) decodes to the expected text → open the public link in a second context → owner receives the "opened" notification → revoke → the public page shows the unavailable state. T-NTF-03-19 (security) token is never present in logs or analytics payloads; `Referrer-Policy` and `noindex` headers are set; a guessed token returns the same 404 as an expired one.

#### 22. Acceptance Criteria
- AC-1 (US-NTF-03-1) Given Ramesh Traders with a balance of ₹2,800 and a mobile, when the owner taps Share → WhatsApp on the party page, then a `parties_share_link(kind='statement')` is created, `window.open` is called with a `wa.me/919812345678?text=` URL whose decoded text contains "Rs 2,800", a `/khata/` link and the shop name, one `notifications_message_log` row exists with `provider='wa_me'`, and the snackbar reads "WhatsApp opened".
- AC-2 (US-NTF-03-2) Given a freshly issued INV/26-27/0042, when staff shares it, then the text contains the bill number, "Rs 898" and a `/d/` link, the link opens the public bill page with the shop's logo and name, and the whole flow takes one tap from the invoice success screen.
- AC-3 (US-NTF-03-3) Given the sheet's language toggle set to हिं for a party, when the message is composed, then the Hindi template is used ("आप देंगे: Rs 2,800"), the choice is stored on `parties_party.locale`, and the next share for that party defaults to Hindi without asking.
- AC-4 (US-NTF-03-4) Given a shared statement link, when the customer opens it, then the page shows the shop's name and logo, the party's masked mobile, the opening balance, entries, closing balance and an "as on" timestamp, offers a language toggle and **Save as PDF**, carries `noindex` and exposes no navigation to any other data.
- AC-5 (US-NTF-03-5) Given a walk-in receipt with no party, when the owner enters a number in the sheet and shares, then the WhatsApp URL targets that number, the log row records it, and `parties_party` is unchanged unless **Save to this customer** was ticked.
- AC-6 (US-NTF-03-6) Given two shares of the same statement on the same day, when the owner opens the party timeline, then both shares are listed with their times and the shared-links panel shows one link with `view_count` and `last_viewed_at`.
- AC-7 (US-NTF-03-7) Given a statement shared to a wrong number, when the owner revokes the link, then the public URL renders "This link is no longer available — ask Sharma Store for a new one" with the shop's phone, the revocation is audited, and an unknown token returns exactly the same response.

#### 23. Dependencies
NTF-02 (`WaMeBackend`, template registry, `notifications_message_log`), NTF-01 (`document_shared_viewed`), LED-04 (statement selector and share link CCR-7), LED-06 (reminder composer, bulk share, BR-7 link reuse), SAL-03 (`PrintDocumentFrame`, print routes), SAL-08 (invoice share), SAL-14 (`PublicDocumentPage` shell), PAY-03 (UPI QR on public pages), PAY-04 (receipt share, `kind='receipt'`), PAY-06 (payment link share, Phase 2), PTY-01/PTY-02 (party mobile, inline save, `locale` CCR-40), PLT-02 (member invitation text), WLB-03 (branding on public pages and the sign-off rule), ADR-014 (client-side PDF only), ADR-021, `UbShareSheet`, `UbPhoneInput`, `UbDrawer`, `UbDialog`, `MLToggleGroup`, `MLTextarea`, CCR-7/CCR-40/CCR-41.

#### 24. Future Enhancements
WhatsApp Business API (NTF-05) turning these prepared messages into genuine automated sends with delivery receipts and template approval, while keeping the deep link as the fallback; server-side PDF (ADR-014 Phase 2) so a real document can be attached rather than linked; a customer portal (PTY-09) where one durable link shows every bill and the running khata instead of a link per document; QR codes printed on bills that open the same public page; share to Telegram/SMS/email from the same sheet without new code (the sheet is channel-agnostic); read receipts from the WhatsApp API replacing the "opened the link" proxy signal; scheduled sharing ("send this statement on the 1st of every month") built on LED-13's schedule engine; per-partner default wording and a template editor (WLB-07); shortened branded links on a partner domain.

### NTF-04 — Web push — Phase 2

#### 1. Business Objective
Reach the owner when DigiKhaato is closed. At MVP the inbox (NTF-01) only updates while a tab is open and SMS costs money; a collection reminder that fires at 09:15 is useless if the owner opens the app at 19:00. Web Push (the W3C Push API + VAPID, delivered by the browser's own push service) puts "5 parties owe you today" and "₹898 received" on the phone's lock screen at zero marginal cost, using the PWA the product already ships (ADR-020). It is deliberately a **delivery channel for notifications that already exist**, not a new source of truth. Measured by: ≥ 40 % of owners on Android Chrome grant permission when asked in context; push delivery success ≥ 90 % for subscribed devices; reminder-action rate (reminder sent within 2 h of the notification) at least double the non-push cohort; zero pushes containing data the recipient could not already read in-app.

#### 2. User Personas
Owner (OW) is the primary and, at Phase 2, the only subscriber type enabled by default; Admin (AD) may subscribe with the same rules; Staff (ST) may subscribe for stock and their own reminders when the owner enables it; Accountant (AC) subscribes for export-ready and import-done only; Customer (CU) is never pushed to (they are reached by WhatsApp/SMS, not by the merchant's app).

#### 3. User Stories
1. US-NTF-04-1 — As an owner I want a notification on my phone when a customer pays me so that I know without opening the app.
2. US-NTF-04-2 — As an owner I want the morning reminder list to reach me even when the app is closed so that I actually make the calls.
3. US-NTF-04-3 — As an owner I want to be asked for permission only when it is obviously useful, not on my first screen.
4. US-NTF-04-4 — As an owner I want to choose which kinds of push I get, using the same settings I already use for the inbox.
5. US-NTF-04-5 — As an owner I want tapping the push to open exactly the right screen, already logged in.
6. US-NTF-04-6 — As an owner I want push to stop on a phone I no longer use so that my data is not on a lost device.
7. US-NTF-04-7 — As an owner on an iPhone I want to be told honestly whether this works, and what to do instead.

#### 4. Functional Requirements
1. FR-1 **Standards-only implementation, no dependency.** Service worker (`public/sw.js`) + `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` on the client; server-side VAPID signing and Web Push encryption (RFC 8291 `aes128gcm`, RFC 8292 VAPID) implemented in `notifications/providers/webpush.py` using Python's stdlib `hashlib`, `hmac`, `secrets`, `base64` and `cryptography`'s ECDH primitives — **`cryptography` is already a transitive dependency of nothing at MVP, so adding it needs ADR-024** (recorded; the alternative, hand-rolling P-256 ECDH, is explicitly rejected as unsafe). No `pywebpush`, no Firebase SDK, no vendor.
2. FR-2 **Backend behind NTF-02.** `WebPushBackend(MessageBackend)` with `channel='push'` plugs into the existing adapter interface: `send()` encrypts the payload per subscription and POSTs it to the endpoint the browser gave us, over stdlib `urllib.request` with a 10 s timeout. Every push is therefore a `notifications_message_log` row like any other message, with the same statuses, retries and log UI (NTF-02 FR-12) — one channel column more, no new plumbing.
3. FR-3 **Subscription storage.** `notifications_push_subscription` (new table, CCR-42): `tenant_id`, `user_id`, `endpoint text NN U`, `p256dh varchar(255) NN`, `auth varchar(64) NN`, `user_agent varchar(255)`, `device_label varchar(80)`, `browser varchar(24)`, `platform varchar(16)`, `created_at`, `last_seen_at`, `last_success_at`, `failure_count smallint NN default 0`, `status varchar(12) NN default 'active'` (`active`, `expired`, `revoked`). `U(endpoint)` globally (an endpoint is unique per browser install); `IX(tenant_id, user_id, status)`. A user may have several subscriptions (phone + desktop); a subscription belongs to one user but is used for whichever tenant the notification is for, with the tenant name in the body when the user is a member of more than one business.
4. FR-4 **Permission prompt timing.** The browser prompt is never shown on load. `PushPrimer` — an `MLAlert`-style inline card, not a modal — appears in exactly three contexts: (a) after the owner sends their first reminder ("Want to know on your phone when they pay?"), (b) after the first payment is received in-app, (c) in `/settings/notifications` as an always-available **Turn on phone alerts** switch. Only a tap on the primer's **Turn on** calls `Notification.requestPermission()`, so a denial is a deliberate one. A dismissed primer does not reappear for 30 days (`localStorage` + a server-side `notifications_preference` flag so it is per user, not per device).
5. FR-5 **Subscribe flow.** On grant: register `sw.js` → `pushManager.subscribe()` with the VAPID public key from `GET /notifications/push/config` → `POST /notifications/push/subscriptions { endpoint, keys: { p256dh, auth }, user_agent, device_label }` → 201. The device label defaults to a parsed "Chrome on Android" and is editable in settings. On denial: the primer becomes a permanently visible but quiet "Phone alerts are blocked — turn them on in your browser settings" with a help link per browser.
6. FR-6 **Which notification types push.** The registry (NTF-01 FR-2) gains a `push_default: bool` per type. Defaults on: `payment_received`, `payment_received_online`, `reminder_due`, `low_stock`, `import_done`, `import_failed`, `export_ready`, `cashbook_mismatch`, `payment_provider_error`, `recurring_due_soon`. Defaults off: `member_joined`, `expense_recorded_by_staff`, `document_shared_viewed`, `payment_voided`, `payment_auto_matched`. Every one is overridable per user in the existing `notifications_preference` table's `push` column (NTF-01 FR-9) — there is **no separate push settings screen**.
7. FR-7 **Fan-out.** When `notify()` writes a row and the recipient has `push=true` for that type and ≥ 1 active subscription, it enqueues `platform_job('notifications.deliver_message', …)` per subscription through `send_message(channel='push')`. Delivery is therefore asynchronous on the 60 s scheduler tick — acceptable for every type in FR-6 (a payment alert one minute later is still useful). The payload carries `{ title, body, tag, route, notification_id, tenant_id, icon, badge, actions[] }` and is capped at 3,900 bytes (the 4 KB push limit after encryption overhead); long bodies are truncated with an ellipsis.
8. FR-8 **Service worker behaviour.** `sw.js` handles `push` by calling `showNotification(title, { body, tag, renotify: false, data, icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', actions })`; `tag` is the notification's `group_key` so a coalesced low-stock push replaces the previous one instead of stacking. `notificationclick` focuses an existing client on the same origin and posts a `NAVIGATE` message with the route, or opens `clients.openWindow(route)` when none exists; it also calls `POST /notifications/{id}/read` via `fetch` with credentials so the badge stays honest across devices. `notificationclose` is not tracked. The worker has no caching responsibilities beyond the PWA shell already defined in ADR-020.
9. FR-9 **Pruning dead subscriptions.** A `404`/`410` from the push service marks the subscription `expired` immediately and stops further attempts; other errors increment `failure_count` and, at 5 consecutive failures, mark it `expired`. `pushsubscriptionchange` in the worker re-subscribes and PATCHes the new endpoint. A scheduler task `prune_push_subscriptions` (weekly) deletes `expired` rows older than 30 days and `active` rows with `last_seen_at` older than 180 days.
10. FR-10 **Device management.** `/settings/notifications` gains a **Your devices** section listing each subscription with its label, browser, platform, last seen and a **Turn off** action (`DELETE /notifications/push/subscriptions/{id}` → `status='revoked'`), plus **Turn off on all devices**. The current device is marked "This device". Revoking a device is also offered from the session list (PLT-07) so logging out of a lost phone kills its push too.
11. FR-11 **Quiet hours.** A per-user preference `push_quiet_hours` (`{ start: "21:00", end: "07:00" }`, default off) holds non-urgent pushes until the window ends by setting the job's `run_after`; urgent types (`import_failed`, `payment_provider_error`, `cashbook_mismatch`) ignore it. Held pushes coalesce: at 07:00 the user gets one "3 things happened overnight" push linking to the inbox rather than three.
12. FR-12 **iOS honesty.** Safari supports Web Push only for **installed** home-screen PWAs (iOS 16.4+). The primer detects this (`navigator.standalone === false` on iOS) and, instead of a broken prompt, shows "Add DigiKhaato to your Home Screen to get phone alerts" with the three-step Share → Add to Home Screen instruction and a **Remind me later**. Once installed, the normal flow runs. Unsupported browsers hide the primer entirely and the settings switch renders disabled with "Your browser does not support phone alerts".
13. FR-13 **No new content.** A push may contain only the `title` and `body` already written to `notifications_notification` for that recipient — never an extra field, never a fuller amount, never a party detail the inbox omitted. This makes NTF-01's permission model (BR-1) the complete security argument for push as well.
14. FR-14 **Kill switches.** `messaging.enabled=false` (NTF-02 FR-15) and `settings.MESSAGING_GLOBAL_KILL` disable push like any other channel, writing `skipped` rows. A per-tenant `notifications.push_enabled` (default true) lets an owner turn off push for the whole business without touching each member's preferences.

#### 5. Non-Functional Requirements
Push delivery P95 ≤ 90 s from the triggering event (one scheduler tick plus the push service's own latency, typically < 3 s). Encryption and signing cost ≤ 15 ms per subscription; a fan-out to 40 members × 2 devices completes within one tick's budget. The service worker adds ≤ 8 kB to the PWA and must not delay first paint (registered after `load`). Subscription endpoints are opaque URLs on third-party origins (FCM, Mozilla, WNS) — the outbound allowlist must permit them, which is the one place the product talks to hosts it did not choose; every request has a 10 s timeout and no redirects. Payload ≤ 3,900 bytes. The prompt must never be triggered without a user gesture (browsers penalise sites that do). Notifications render correctly in Hindi on Android (Devanagari in the system notification shade) — verified on a real device matrix. Accessibility: the primer is keyboard-operable and its purpose is stated in text, not only in an icon.

#### 6. User Flow
Primary (opt-in): the owner sends their first WhatsApp reminder → an inline primer appears under the success message: "Want to know on your phone when Ramesh pays? **Turn on**" → tap → the browser's permission dialog → Allow → a confirmation push arrives immediately ("Phone alerts are on") → the device appears in Settings → Notifications → Your devices.
Alternate A (payment): a customer pays online at 21:40 → PAY-06 posts it → `notify()` writes the inbox row and enqueues the push → within a minute the lock screen shows "₹898 received from Ramesh Traders — Bill INV/26-27/0042 is now paid" → tapping opens the payment detail, already signed in, and the inbox badge drops.
Alternate B (morning reminders): 09:15 → the reminder scan raises one coalesced inbox row and one push "5 parties owe you today" → tapping opens the reminders list filtered to Due today.
Alternate C (quiet hours): the owner set 21:00–07:00 → the 21:40 payment push is held → at 07:00 one push says "2 things happened overnight" → opens the inbox.
Alternate D (iPhone): the primer shows the Add to Home Screen instructions → the owner installs → reopens from the home screen → the primer now offers **Turn on** → normal flow.
Alternate E (lost phone): Settings → Your devices → "Chrome on Android — last seen 12 days ago" → **Turn off** → that subscription is revoked and receives nothing further.
Alternate F (denied): the owner taps Block → the primer becomes a quiet line with per-browser instructions; the product never asks again automatically.

#### 7. UI Requirements
`PushPrimer` (new, `MLAlert` variant `info` with an icon, inline — never a modal): one-line reason tied to the context ("Know on your phone when a customer pays"), **Turn on** (`MLButton` primary sm) and **Not now** (ghost); on iOS non-standalone it swaps to the install instructions with a small three-step list and a `UbHelpHint` linking the help article. `/settings/notifications` (NTF-01 FR-9 page) gains: a **Phone alerts** header row with a master `MLSwitch` (calls subscribe/unsubscribe), a status line ("On for this device · 2 devices"), the per-type `push` switch column (already specified by NTF-01, now enabled), a **Quiet hours** row (`MLSwitch` + two `MLSelect` time pickers), and the **Your devices** `MLItem` list (label, `ds-caption` "Chrome on Android · last seen today", "This device" chip, **Turn off**). Blocked state: a `UbStatusBanner` warning with browser-specific steps. Unsupported: the master switch is disabled with the reason. The notification itself is the OS's own UI; the product controls only `title`, `body`, `icon` (the tenant's logo is **not** used — the app icon is, because the push comes from DigiKhaato, not from the merchant), `badge` (monochrome 72 px) and up to two `actions` ("Open", and for reminders "Send reminder" which deep-links rather than acting in the worker).

#### 8. UX Requirements
Keys: `push.primer.payment` "Know on your phone when a customer pays", `push.primer.reminder` "Get a phone alert when payments are due", `push.primer.turnOn` "Turn on", `push.primer.notNow` "Not now", `push.primer.ios` "Add DigiKhaato to your Home Screen to get phone alerts", `push.primer.iosStep1` "Tap Share", `push.primer.iosStep2` "Tap Add to Home Screen", `push.primer.iosStep3` "Open it from your Home Screen", `push.settings.title` "Phone alerts", `push.settings.on` "On for this device", `push.settings.off` "Off", `push.settings.devices` "Your devices", `push.settings.thisDevice` "This device", `push.settings.lastSeen` "Last seen {when}", `push.settings.turnOff` "Turn off", `push.settings.turnOffAll` "Turn off on all devices", `push.settings.quietHours` "Quiet hours", `push.settings.quietHoursHint` "We will hold alerts until morning, except urgent ones", `push.blocked.title` "Phone alerts are blocked", `push.blocked.help` "Turn them on in your browser settings", `push.unsupported` "Your browser does not support phone alerts", `push.confirm.title` "Phone alerts are on", `push.confirm.body` "We will tell you here when money moves or a payment is due", `push.overnight.title` "{count, plural, one {# thing} other {# things}} happened overnight". Hindi: "फ़ोन पर सूचना", "चालू करें", "अभी नहीं", "आपके डिवाइस", "यह डिवाइस", "बंद करें", "शांत घंटे", "आपके ब्राउज़र में सूचनाएँ बंद हैं", "फ़ोन सूचनाएँ चालू हैं". Copy rules: the primer states a benefit tied to what just happened, never "Enable notifications"; the permission is never requested without a tap; a blocked state is stated once, quietly, with a real fix; push bodies reuse the inbox wording verbatim (FR-13) so the same event never reads two different ways.

#### 9. States
Permission: `default` (primer eligible) · `granted` (subscribed) · `granted but not subscribed` (a re-subscribe is attempted silently on next load) · `denied` (quiet blocked banner) · `unsupported` (switch disabled) · `ios-not-installed` (install instructions). Subscription: Creating (switch spinner) · Active · Expired (auto-removed, the switch shows Off with "Your phone stopped receiving alerts — turn them on again") · Revoked. Delivery (per `notifications_message_log`): `queued` → `sent` → (no DLR exists for Web Push, so `sent` is terminal on success) · `failed` (with the push service's status code) · `skipped` (kill switch, preference off, quiet hours expired past relevance). Settings page: Loading · Ready · Saving (optimistic switch with rollback) · Error. Quiet hours: Off · On · Holding (a caption shows "2 alerts waiting until 07:00").

#### 10. Validation Rules
`POST /notifications/push/subscriptions`: `endpoint` required, `https://` URL ≤ 1,000 chars, host must match the allowlist of known push services (`*.googleapis.com`, `*.mozilla.com`, `*.windows.com`, `*.apple.com`) → 400 `invalid_push_endpoint` (CCR-42); `keys.p256dh` base64url 87–88 chars; `keys.auth` base64url 22–24 chars; `device_label` ≤ 80. Duplicate `endpoint` → 200 with the existing row refreshed (`last_seen_at`), never a duplicate. Quiet hours: `start`/`end` as `HH:MM`, may wrap midnight, must differ → 400 `validation_error`. Preferences reuse NTF-01 §10 rules with the addition that enabling `push` for a type when the user has no active subscription returns 409 `push_not_subscribed` with a hint to turn on phone alerts first. Server: 403 `permission_denied`, 404 for another user's subscription id, 409 `channel_not_configured` when VAPID keys are absent from settings, 429 on 10 subscribe attempts/hour/user.

#### 11. Business Rules
1. BR-1 Push is a **delivery** of an inbox row, never an independent message: if NTF-01 did not write a row for that recipient, no push is sent. The inbox remains the record; push is a courtesy.
2. BR-2 A push contains nothing the inbox row did not (FR-13), so NTF-01's permission filter is the whole authorisation story.
3. BR-3 Permission is requested only after a user gesture on a contextual primer (FR-4); the product never calls `requestPermission()` on load, and a denial is never re-prompted automatically.
4. BR-4 One `notifications_message_log` row per subscription per notification, so a user with a phone and a desktop has two rows and one inbox row — the log answers "did the alert reach the device", the inbox answers "was the user told".
5. BR-5 Coalescing carries through: the push `tag` is the inbox row's `group_key`, so an updated coalesced row replaces its earlier push instead of stacking a second one.
6. BR-6 Quiet hours delay non-urgent pushes and merge them into one morning push; urgent types (FR-11) are never delayed. Nothing is dropped — everything is in the inbox regardless.
7. BR-7 A `410 Gone` is authoritative: the subscription is dead and is expired immediately, never retried (unlike NTF-02's generic retry policy).
8. BR-8 Subscriptions are per (user, browser install), not per tenant; a user who is a member of three businesses gets pushes for all three on one subscription, each body prefixed with the business name when the user has more than one membership.
9. BR-9 Push is never used for a party-facing message; customers are reached through WhatsApp/SMS only (§2).
10. BR-10 VAPID keys are generated once per deployment, stored in settings (private key from the environment, never in the database), and rotating them invalidates every subscription — the runbook therefore treats rotation as a user-visible event requiring a re-subscribe prompt.
11. BR-11 The confirmation push on subscribe (FR-5) is mandatory: browsers require `userVisibleOnly`, and it also proves the round trip works before the user relies on it.
12. BR-12 Push failures never affect the business transaction that raised the notification (they are drained from `platform_job` long after the commit, NTF-02 BR-1 reasoning).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Subscribe this device to push | authenticated member + `notifications.settings.manage` | ✅ | ✅ | ✅ (when the tenant's `notifications.push_enabled` is on) | ✅ |
| Set own push preferences and quiet hours | `notifications.settings.manage` | ✅ | ✅ | ✅ | ✅ |
| See and revoke own devices | authenticated member | ✅ | ✅ | ✅ | ✅ |
| Turn push off for the whole business | `platform.tenant.manage` | ✅ | ❌ | ❌ | ❌ |
| Receive a push of type T | T's `required_permission` (NTF-01 BR-1) | per role | per role | per role | per role |
| Read push delivery rows in the message log | `notifications.settings.manage` | ✅ | ✅ | ❌ | ✅ |

#### 13. Edge Cases
1. EC-1 The user grants permission but the subscribe call fails (network) → the switch reverts with "Could not turn on phone alerts — try again"; the browser permission stays granted and the next attempt succeeds silently.
2. EC-2 The same browser profile is used by two members on one device (a shared counter tablet) → the endpoint is unique per browser install, so the second subscribe **transfers** the row to the new user after re-authentication, and the first user's row is revoked (a warning explains this: "Phone alerts on this device will now go to Priya").
3. EC-3 The user clears site data → the subscription silently dies; the next push returns 410 → expired; on next login the settings switch shows Off and the primer may reappear (the 30-day dismissal is server-side, so it is respected).
4. EC-4 A push is clicked while the app is open in another tab → `notificationclick` focuses that tab and posts `NAVIGATE`; no second tab is opened.
5. EC-5 The notification is clicked after the entity was voided → the route opens and the entity shows its void state (NTF-01 BR-2).
6. EC-6 The payload would exceed 3,900 bytes (a long Hindi body with a long party name) → the body is truncated at a grapheme boundary with "…"; the full text is in the inbox.
7. EC-7 The push service is down (FCM outage) → sends fail with 5xx → NTF-02's retry policy applies (1/5/15 min) → after three attempts the row is `failed`; the inbox row is unaffected and the user sees everything on next open.
8. EC-8 Quiet hours span a DST change → not applicable in `Asia/Kolkata`; the implementation still computes the window in the tenant timezone rather than UTC.
9. EC-9 40 subscriptions for one user (a developer testing) → the subscribe endpoint caps at 10 active per user, expiring the oldest.
10. EC-10 The user disables notifications at the OS level (not the browser) → pushes are accepted by the service and reported as delivered but never shown; the product cannot detect this and does not try — the settings page notes "If you do not see alerts, check your phone's notification settings for your browser".
11. EC-11 A tenant turns `notifications.push_enabled` off while members are subscribed → subscriptions remain but every send is `skipped`; turning it back on resumes without re-subscribing.
12. EC-12 VAPID keys rotate (BR-10) → every endpoint returns 403 → all subscriptions expire → a one-time banner asks members to turn phone alerts on again.
13. EC-13 A coalesced low-stock row updates three times before the user looks → the same `tag` means one visible notification whose text is the latest ("5 items are low on stock").
14. EC-14 An iOS user installs the PWA, subscribes, then removes it from the home screen → the subscription dies with 410 on the next send.

#### 14. API Requirements
- `GET /notifications/push/config` → `{ data: { vapid_public_key, supported_types: [...], enabled: bool } }` (public key only; the private key never leaves the server).
- `POST /notifications/push/subscriptions { endpoint, keys: { p256dh, auth }, user_agent?, device_label? }` → 201 `{ data: Subscription }` or 200 when the endpoint already exists; 400 `invalid_push_endpoint`; 409 `channel_not_configured`.
- `GET /notifications/push/subscriptions` → the caller's own devices `[{ id, device_label, browser, platform, created_at, last_seen_at, last_success_at, is_current, status }]`.
- `PATCH /notifications/push/subscriptions/{id} { device_label?, endpoint?, keys? }` → 200 (used by `pushsubscriptionchange`).
- `DELETE /notifications/push/subscriptions/{id}` → 204 (`status='revoked'`); `DELETE /notifications/push/subscriptions` → 204 (all of the caller's).
- `POST /notifications/push/test` → 202 `{ message_log_id }` — sends the confirmation push to the current device; 3/hour.
- `PUT /notifications/preferences` (NTF-01) now accepts `push` per type and a `quiet_hours` object; 409 `push_not_subscribed` per §10.
- Push delivery itself uses no DigiKhaato endpoint — the server POSTs to the browser vendor's opaque endpoint (FR-2). There is **no inbound webhook**: Web Push has no delivery receipt, which is why `sent` is terminal (§9).
- Frontend: `pushService.ts` (`getConfig`, `subscribe`, `listDevices`, `updateDevice`, `revoke`, `revokeAll`, `test`); `pushSlice` (`permission`, `subscription`, `devices`, `quietHours`, `primerDismissedUntil`, `status`) + `pushThunk.ts`; `usePushSubscription()` hook encapsulating the worker registration, `PushManager` calls and the `pushsubscriptionchange` listener; `public/sw.js` (plain JS, no build step, no library).

#### 15. Database Impact
New table `notifications_push_subscription` (FR-3, CCR-42). `notifications_preference` (NTF-01 CCR-38) gains `quiet_hours jsonb NULL` and its existing `push boolean` column becomes meaningful. The notification type registry gains `push_default` (code-level, not a table). `notifications_message_log` rows are written with `channel='push'` and `provider='webpush'`, `to_address` = a truncated endpoint hash (never the full endpoint, §19), `meta.subscription_id`. `platform_tenant_setting` gains `notifications.push_enabled`. Writes `platform_job` (fan-out, quiet-hours holds, weekly pruning), `platform_audit_log`. Reads `platform_membership` (for the multi-tenant body prefix), `platform_user`. Indexes: `U(endpoint)`, `IX(tenant_id, user_id, status)`, `IX(status, last_seen_at)` for pruning.

#### 16. Audit Requirements
`push.subscribed` (`metadata` = device_label, browser, platform — never the endpoint or keys), `push.unsubscribed` (`metadata.reason ∈ {user, expired, transferred, keys_rotated}`), `push.tenant_disabled` / `.tenant_enabled` (`platform.tenant.manage`), `push.quiet_hours_changed` (`before`/`after`). Individual deliveries are not audited — they are message-log rows (NTF-02 §16 reasoning). The endpoint and encryption keys are **never** written to the audit log, the application log or analytics.

#### 17. Notifications
This feature delivers other features' notifications and raises only two of its own, both in-app (NTF-01): `push_subscription_expired` — "Phone alerts stopped on Chrome on Android — turn them on again" (raised once per expired subscription, suppressed when the user has another active device); and `push_keys_rotated` — a one-time banner-style notification after VAPID rotation (BR-10/EC-12). The confirmation push itself (FR-5) is a push-only message with template code `PUSH_TEST` and writes an ordinary message-log row.

#### 18. Analytics / Event Tracking
`ub.notifications.push_primer_shown` `{ context: reminder|payment|settings, platform, browser }`; `ub.notifications.push_primer_action` `{ context, action: turn_on|not_now|ios_install }`; `ub.notifications.push_permission_result` `{ result: granted|denied|dismissed, platform, browser }`; `ub.notifications.push_subscribed` `{ platform, browser, devices_after }`; `ub.notifications.push_revoked` `{ reason }`; `ub.notifications.push_delivered` (server) `{ type, platform, status, latency_seconds_bucket }`; `ub.notifications.push_clicked` `{ type, action, seconds_since_sent_bucket }`; `ub.notifications.push_quiet_hours_changed` `{ enabled }`; `ub.notifications.push_held_batch` (server) `{ count_bucket }`. Never the endpoint, the keys, a title, a body, a party name or an amount.

#### 19. Security
The endpoint URL and the `p256dh`/`auth` keys are **capability credentials** — anyone holding them can push to that device — so they are stored in a table readable only by the notifications service, never returned by any API (the device list returns a label and metadata only), never logged, never exported, and represented in the message log by a salted hash prefix. Payloads are encrypted end-to-end per RFC 8291 before leaving the server, so the push service (Google, Mozilla, Apple) cannot read the body; the VAPID private key stays in the environment. Endpoint hosts are validated against an allowlist on subscribe (§10), which prevents the product from being turned into a request-forgery relay to arbitrary URLs — this is the main SSRF control and it is enforced again at send time. Content safety rests on FR-13/BR-2: since a push carries only what the inbox row carried, the NTF-01 permission model covers it entirely; a lock-screen preview can therefore never reveal more than the app would. Subscriptions are per user and can only be listed or revoked by their owner; another user's id → 404. Rate limits: subscribe 10/hour/user, test 3/hour/user, default 600/min. On logout-all (PLT-07) every subscription of that user is revoked, which is the answer to a lost device.

#### 20. Performance
Fan-out is one query for the recipient's active subscriptions (`IX(tenant_id, user_id, status)`) and one `platform_job` row per subscription, added inside the same transaction as the inbox row — two small inserts on the hot path. Encryption is ~10 ms per subscription and happens in the scheduler, not in the request. The drain query is NTF-02's `SKIP LOCKED` batch, shared. Quiet-hours holds cost nothing extra (they are just a later `run_after`). The service worker is 8 kB and registered after `load`, so it never competes with first paint. The settings device list is one indexed query with ≤ 10 rows. Pruning runs weekly in batches of 1,000. CI asserts that raising a notification for a user with 2 devices adds exactly 2 job rows and 0 extra queries beyond the subscription lookup.

#### 21. Testing
T-NTF-04-1 (unit) RFC 8291 encryption vectors: a known key pair, salt and plaintext produce the documented ciphertext (test vectors from the RFC) — this is the highest-risk code in the feature. T-NTF-04-2 (unit) VAPID JWT signing and header format verified against a known public key. T-NTF-04-3 (unit) `WebPushBackend.send()` maps 201 → `sent`, 404/410 → subscription expired and `failed` without retry, 429/5xx → retryable per NTF-02 FR-10. T-NTF-04-4 (unit) fan-out creates one job per active subscription and none for `expired`/`revoked` or when the type's `push` preference is false. T-NTF-04-5 (unit) payload cap truncates the body at a grapheme boundary and never drops `route` or `notification_id`. T-NTF-04-6 (unit) `tag` equals the inbox row's `group_key` so coalesced pushes replace. T-NTF-04-7 (unit) quiet hours delay non-urgent types via `run_after`, never delay urgent ones, and merge held items into one morning push. T-NTF-04-8 (unit) push content equals the inbox row's title/body exactly (FR-13 asserted mechanically). T-NTF-04-9 (unit) multi-tenant body prefix appears only when the user has more than one membership. T-NTF-04-10 (API) subscribe validates the endpoint host allowlist and key lengths; a duplicate endpoint refreshes rather than duplicating; the 10-per-user cap expires the oldest. T-NTF-04-11 (API) the device list never returns the endpoint or keys; another user's subscription id → 404. T-NTF-04-12 (API) `DELETE` revokes; logout-all revokes every subscription of the user. T-NTF-04-13 (API) enabling a type's `push` without a subscription → 409 `push_not_subscribed`. T-NTF-04-14 (API) tenant `notifications.push_enabled=false` → every send `skipped`, subscriptions intact. T-NTF-04-15 (component) `PushPrimer` variants: default, iOS non-standalone with install steps, denied, unsupported; **Turn on** calls `requestPermission` only on a click. T-NTF-04-16 (component) settings device list, "This device" marking, turn-off flows, quiet-hours pickers with a wrapping window. T-NTF-04-17 (worker, jsdom) `push` handler builds the right `showNotification` options; `notificationclick` focuses an existing client and posts `NAVIGATE`, else opens a window, and calls the read endpoint. T-NTF-04-18 (E2E, stubbed push service) subscribe → trigger a payment → assert one job, one message-log row `sent`, one captured push whose decrypted payload matches the inbox row → simulate 410 on the next send → subscription `expired` and the in-app notice raised. T-NTF-04-19 (security) endpoint and keys absent from every API response, log line and analytics payload; a non-allowlisted endpoint host is rejected at subscribe and at send.

#### 22. Acceptance Criteria
- AC-1 (US-NTF-04-1) Given a subscribed owner and a ₹898 payment recorded at 21:40, when the scheduler ticks, then exactly one push per active device is delivered whose title and body equal the inbox row's, tapping it opens `/payments/{id}` in the existing session, and the inbox badge decrements on every device.
- AC-2 (US-NTF-04-2) Given five parties due today, when the 09:15 reminder scan runs, then one coalesced inbox row and one push "5 parties owe you today" are produced (not five), the push `tag` equals the row's `group_key`, and tapping opens the reminders list filtered to Due today.
- AC-3 (US-NTF-04-3) Given a first-time owner, when the app loads, then `Notification.requestPermission()` is never called; the primer appears only after their first reminder or first received payment, and only a tap on **Turn on** triggers the browser prompt; **Not now** suppresses the primer for 30 days across devices.
- AC-4 (US-NTF-04-4) Given the notifications settings page, when the owner turns off **Low stock** for push while leaving it on in-app, then low-stock events still appear in the inbox and no push is sent, and the change is stored in `notifications_preference`.
- AC-5 (US-NTF-04-5) Given a push for an import that finished, when it is tapped while the app is already open in another tab, then that tab is focused and navigated to `/imports/{id}` rather than a second tab being opened, and the notification is marked read.
- AC-6 (US-NTF-04-6) Given two devices, when the owner taps **Turn off** on the one last seen 12 days ago, then its subscription is `revoked`, it receives nothing further, the other device is unaffected, and an audit row records the device label without the endpoint.
- AC-7 (US-NTF-04-7) Given Safari on iOS with the app opened in the browser, when the primer is eligible, then it shows the three-step Add to Home Screen instructions instead of a permission prompt; after installing and reopening from the home screen, **Turn on** performs the normal subscribe flow.

#### 23. Dependencies
NTF-01 (the inbox rows push delivers, the type registry, `notifications_preference`), NTF-02 (`MessageBackend` interface, `notifications_message_log`, retry policy, kill switches), PLT-07 (session list and logout-all revoking devices), PLT-05 (tenant settings `notifications.push_enabled`), PAY-01/PAY-06 (`payment_received`), LED-05/LED-07 (`reminder_due`), INV-08 (`low_stock`), IMP-01 (`import_done`/`import_failed`), RPT-11 (`export_ready`), EXP-03/EXP-04 (`cashbook_mismatch`, `recurring_due_soon`), ADR-012 (`platform_job` fan-out), ADR-020 (PWA and the service worker that already exists), ADR-021 + **ADR-024** (the `cryptography` dependency for RFC 8291), `MLAlert`, `MLSwitch`, `MLSelect`, `MLItem`, `UbStatusBanner`, `UbHelpHint`, CCR-42.

#### 24. Future Enhancements
Native wrappers (Capacitor, ADR-020 Phase 3) using FCM/APNs directly, sharing this feature's preference model and message log; rich pushes with an image (a low-stock item photo) and inline actions that act in the worker rather than deep-linking; a daily digest push at a user-chosen time replacing several alerts; per-type quiet hours instead of one global window; delivery analytics per browser and platform to explain silent failures; push for staff task assignment once a task model exists; "silent" data pushes to refresh the badge without a visible notification (once `userVisibleOnly: false` is broadly permitted, which it is not today); a web-push-to-customer channel for the customer portal (PTY-09), which would be the first time this product pushes to a party rather than a member.

### NTF-05 — WhatsApp Business API — Phase 2

#### 1. Business Objective
Turn the manual `wa.me` share (NTF-03) into a real automated channel: send DLT-free, WhatsApp-approved **Utility** template messages for reminders, receipts, invoices and payment links from the business's own verified WhatsApp number, receive delivery and read receipts, accept the customer's reply, and account for the per-conversation cost — because WhatsApp is both where Indian customers read (open rates far above SMS) and cheaper than SMS (≈ ₹0.115 per utility conversation versus ≈ ₹0.20 per SMS segment, and a Hindi reminder is three SMS segments but one WhatsApp message). Measured by: delivery rate ≥ 95 % and read rate ≥ 70 % for utility templates; cost per reminder at least 40 % below the SMS equivalent, shown on every log row; ≥ 25 % of reminder-receiving parties respond or pay within 72 h; zero messages sent to a party without recorded opt-in.

#### 2. User Personas
Partner admin (PA) owns the WABA (WhatsApp Business Account), the verified number, the template library and the billing relationship (WLB-06) — this is the normal deployment; Owner (OW) enables the channel for their tenant, sees costs and reads replies; Super admin (SA) registers the provider credentials and approves partner onboarding; Staff (ST) may trigger a send where they already may send a reminder; Accountant (AC) reads the cost report; Customer (CU) receives and may reply.

#### 3. User Stories
1. US-NTF-05-1 — As an owner I want overdue reminders to go out on WhatsApp automatically so that I stop sending them one by one.
2. US-NTF-05-2 — As an owner I want to see whether the customer received and read the message so that I know whether to call.
3. US-NTF-05-3 — As a partner admin I want to register my WABA, number and approved templates once so that all my merchants can send.
4. US-NTF-05-4 — As an owner I want to know what each message costs and what I have spent this month.
5. US-NTF-05-5 — As an owner I want a customer's reply to reach me so that a conversation does not die in a black hole.
6. US-NTF-05-6 — As an owner I want a customer who says STOP to never be messaged again.
7. US-NTF-05-7 — As an owner I want the app to fall back to the WhatsApp deep link when the API is not available so that I am never stuck.

#### 4. Functional Requirements
1. FR-1 **Backend behind NTF-02.** `WhatsAppCloudBackend(MessageBackend)` with `channel='whatsapp'` implements `send()`, `fetch_status()` and `verify_callback()` against the **WhatsApp Cloud API** (Meta Graph `POST /{phone_number_id}/messages`) over stdlib `urllib.request` with bearer auth, a 10 s timeout and no SDK (ADR-021/ADR-022). A second implementation `WhatsAppBspBackend` covers BSP-fronted deployments (Gupshup/AiSensy-style REST) behind the identical interface. Selection is per partner or tenant exactly as NTF-02 FR-4; `WaMeBackend` (NTF-03) remains registered as the fallback (FR-13).
2. FR-2 **Template model.** `notifications_template` (NTF-02 FR-6, CCR-39) is reused: `channel='whatsapp'`, `whatsapp_template_name`, `locale` (Meta's language code, e.g. `en`, `hi`), `category ∈ {utility, authentication, marketing}` (Meta's categories, distinct from the DLT ones — CCR-43 adds them to the enum), `variables text[]` positional (`{{1}}`, `{{2}}`, … as Meta requires), `components jsonb` (header/body/footer/buttons definitions), `approval_status ∈ {draft, submitted, approved, rejected, paused, disabled}`, `approval_error`, `quality_rating ∈ {green, yellow, red}`, `whatsapp_template_id`. MVP template set: `REMINDER_WHATSAPP_API`, `RECEIPT_WHATSAPP_API`, `INVOICE_WHATSAPP_API`, `STATEMENT_WHATSAPP_API`, `PAY_LINK_WHATSAPP_API`, each `utility`, in `en` and `hi`, each with a URL button pointing at the public share link (NTF-03 FR-3).
3. FR-3 **Template sync.** `manage.py sync_whatsapp_templates` (scheduled daily at 04:10 IST and on demand from the partner console) pulls the WABA's template list, upserts `approval_status`, `quality_rating` and `whatsapp_template_id` by `(whatsapp_template_name, locale)`, and marks any locally-registered template missing upstream as `draft`. Submission of a new template is done in Meta's console or by `POST /notifications/whatsapp/templates` (partner scope) which proxies Meta's create call; the product never auto-edits an approved template.
4. FR-4 **Sending.** `send_message(channel='whatsapp', …)` (NTF-02 FR-5) resolves the template, checks that `approval_status='approved'` and `quality_rating ≠ 'red'` (else `skipped` with `template_not_approved` / `template_quality_red`), maps the named params to Meta's **positional** components in the declared order, and enqueues delivery as any other message. The rendered fallback text is still stored on the log row (NTF-02 CCR-39 `body`) so the message log shows what the customer saw.
5. FR-5 **Opt-in is mandatory and recorded.** Meta requires prior opt-in. `send_message` refuses unless `party.sms_opt_in = true` **and** `party.consent_at IS NOT NULL` **and** `party.consent_source ∈ {form, link, verbal}` (DPDP alignment, PTY-01) → otherwise `skipped` with `no_consent_recorded`. A new `party.whatsapp_opt_out_at` column (CCR-43) is set by a STOP reply (FR-9) and blocks the channel permanently for that party until they opt in again explicitly through the merchant.
6. FR-6 **Conversation and cost accounting.** Meta bills per 24-hour **conversation** by category, not per message. The webhook's `pricing` object yields `conversation_id`, `category`, `billable` and (for BSPs) a rate; `notifications_conversation` (new table, CCR-44: `tenant_id`, `party_id`, `provider`, `conversation_id U`, `category`, `started_at`, `expires_at`, `billable`, `rate numeric(8,4)`, `cost numeric(8,4)`, `message_count`) records each one and the message log rows link to it (`meta.conversation_id`). A message that falls inside an open conversation costs nothing extra and its log row shows `cost = 0.0000` with `cost_source='conversation'`. Monthly cost is reported on the message-log page and in a **Messaging costs** card (Settings → Messaging) broken down by category.
7. FR-7 **Delivery and read receipts.** `POST /webhooks/messaging/whatsapp` (NTF-02 FR-11 shape) verifies Meta's `X-Hub-Signature-256` HMAC over the raw body, stores the event, acknowledges within 200 ms, and enqueues processing. Status events map to the log row by `provider_message_id` (Meta's `wamid`): `sent` → `sent`, `delivered` → `delivered`, `read` → **`read`** (a new terminal-plus status, CCR-43), `failed` → `failed` with Meta's error code translated to plain English. Read status is displayed in the `MessagesStrip` (NTF-02 FR-12) with a double-tick glyph — the single most requested signal by merchants.
8. FR-8 **Inbound replies.** Message events (the customer replying) create `notifications_inbound_message` rows (CCR-44: `tenant_id`, `party_id NULL`, `provider`, `provider_message_id U`, `from_address`, `type ∈ {text, image, button, interactive, other}`, `body text`, `media_attachment_id NULL`, `received_at`, `conversation_id`, `handled_at NULL`) matched to a party by mobile. Each inbound message raises an NTF-01 `whatsapp_reply_received` notification and appears in a **Replies** inbox at `/settings/messaging/replies` and inline on the party's timeline. **The product does not send free-form replies at MVP-of-Phase-2** (that needs an agent UI and a 24-hour session model); the Replies view offers **Open in WhatsApp** (an NTF-03 deep link) so the merchant answers from their own app. This is stated plainly in the UI so nobody expects a chat client.
9. FR-9 **STOP handling.** An inbound message whose normalised body matches `stop|unsubscribe|band karo|बंद करो|बंद|मत भेजो` (a maintained list, matched case- and diacritic-insensitively on the whole message only) sets `party.whatsapp_opt_out_at`, cancels that party's scheduled WhatsApp reminders (`ledger_reminder` rows with `channel='whatsapp_api'` → `cancelled`), raises an NTF-01 to owners, and — where the template library has one — sends a single `OPT_OUT_CONFIRM` utility message. Re-opt-in is a deliberate merchant action in the party form with a consent source, never automatic.
10. FR-10 **Which features use it.** When the channel is live, the channel picker gains **WhatsApp (automatic)** alongside **WhatsApp (open app)** in: LED-06 manual reminder, LED-07 automated D-1/D0 reminders, LED-12 (which becomes simply "this feature is live"), LED-13 recurring reminders, PAY-04 receipt send, SAL-08 invoice share, PAY-06 payment link share. The tenant setting `ledger.reminder_channel_default` may now be `whatsapp_api`. Nothing changes in those features' logic — only the channel value.
11. FR-11 **Number and WABA configuration.** Partner console (or Settings → Messaging → WhatsApp for a self-serve tenant): `waba_id`, `phone_number_id`, display number, access token (write-only, encrypted per NTF-02 FR-4 / CCR-22), webhook verify token, and a **Test connection** that calls Meta's phone-number endpoint and displays the verified display name and quality rating. A tenant may **not** send from the partner's number unless the partner allows it (`platform_partner.settings['whatsapp']['shared_number']`), because the display name the customer sees is the sender's brand (WLB-03).
12. FR-12 **Quality and throttling.** Meta assigns a per-number quality rating and messaging limit. The channel card surfaces both; a `red` rating or a reached tier limit makes `send_message` return `skipped` with `quality_red` / `rate_limit_reached` and raises an NTF-01 to owners and the partner. The product also enforces its own guard: at most 1 utility message per party per template per 24 h (dedupe key `(party_id, template_code, date)`), so a bug cannot burn a merchant's quality rating.
13. FR-13 **Fallback chain.** Configurable per template family via `messaging.whatsapp_fallback` (default `deep_link`): on `skipped`/`failed` for a reason in `{channel_not_configured, template_not_approved, quality_red, rate_limit_reached, party_opted_out}`, the originating feature is handed the NTF-03 deep link instead, so the merchant can still send manually; the log row records both attempts linked by `meta.fallback_of`. `sms` is an allowed fallback value where NTF-02 has a live SMS provider.
14. FR-14 **Media.** Templates may carry a **document header** (a PDF). At MVP-of-Phase-2 there is no server-side PDF (ADR-014), so every template uses a **URL button** to the public page instead; the schema and the backend support a document header so that when server PDFs land (ADR-014 Phase 2) attaching the actual invoice is a template change, not a code change.

#### 5. Non-Functional Requirements
`send_message` remains ≤ 15 ms (NTF-02); Meta hand-off P95 ≤ 90 s (one scheduler tick) and ≤ 2 s per API call. Webhook ack P95 ≤ 200 ms (store-and-ack, PAY-06 FR-7 pattern) — Meta retries aggressively and disables endpoints that are slow. Template sync completes in ≤ 10 s for 100 templates. Replies inbox P95 ≤ 400 ms. All Meta calls have explicit timeouts, no redirects, TLS verification on and a pinned host allowlist (`graph.facebook.com` or the BSP host). Hindi templates must render Devanagari correctly end to end (verified on real devices). Cost figures are always shown with the conversation caveat ("one conversation covers 24 hours") so a merchant is never confused by a ₹0.00 row. en/hi for all settings and log UI.

#### 6. User Flow
Primary (automated reminder): the partner has a live WABA; the owner sets `ledger.reminder_channel_default = whatsapp_api` → at 09:15 the D-0 scan (LED-07) raises 12 reminders → each becomes a `REMINDER_WHATSAPP_API` message → within a minute the customers receive "Namaste Ramesh, Rs 2,800 is due to Sharma Store today. See your account: [View khata]" from the shop's verified number → the owner's reminders list shows Delivered, then Read ticks → two customers pay by tapping the button.
Alternate A (receipt): a payment is recorded → the receipt template goes out automatically → the party timeline shows "WhatsApp · read 10:04".
Alternate B (reply): a customer replies "kal de dunga" → an inbound row is created, an NTF-01 tells the owner, the party timeline shows the reply, and **Open in WhatsApp** lets the owner answer from their phone.
Alternate C (STOP): a customer replies "band karo" → `whatsapp_opt_out_at` is set, their scheduled WhatsApp reminders are cancelled, the owner is told, and the party's channel picker now shows WhatsApp disabled with the reason.
Alternate D (not approved): the owner tries to send an invoice on WhatsApp before the template is approved → the row is `skipped` with "This template is not approved yet" and the sheet falls back to the deep link.
Alternate E (quality drop): Meta drops the number to `yellow` then `red` after complaints → the card warns at yellow, and at red every automatic send is skipped with a notification to the owner and partner; deep-link sharing continues to work.
Alternate F (cost review): the accountant opens Settings → Messaging → costs "₹412.60 this month · 3,588 utility conversations · ₹0.115 each" beside "SMS ₹96.40 · 482 messages".

#### 7. UI Requirements
Settings → Messaging → **WhatsApp** card (extending NTF-02 FR-13): status chip (Live · Not connected · Quality: red · Limit reached), the verified display name and number, quality rating pill (`success`/`warning`/`danger`), messaging tier ("1,000 customers / 24 h"), **Test connection**, and (partner/owner) the credential fields. **Templates** tab: a `UbDataGrid` of WhatsApp templates with name (`ds-mono`), language, category, approval status (`UbStatusBadge`), quality, last synced, and a preview showing header/body/footer/buttons with `{{1}}` substituted by sample values; **Sync now** and, for partners, **Submit new template**. **Messaging costs** `MLCard`: this month's total, a bar by category (utility/authentication/marketing), conversation count and average cost, with a caption explaining the 24-hour conversation window. **Replies** page: a two-column layout on desktop (party list / message list) and a single list on mobile, each row showing the party, the message text or media thumbnail, the time, an unhandled dot, and **Open in WhatsApp** + **Mark handled**; a prominent one-line notice "You reply from your own WhatsApp — DigiKhaato does not send free-form messages". `MessagesStrip` (NTF-02) gains the read double-tick and a tooltip with delivered/read times. The channel picker in reminder/receipt/share sheets shows **WhatsApp (automatic)** with a small "from your verified number" caption, and **WhatsApp (open app)** below it.

#### 8. UX Requirements
Keys: `whatsapp.title` "WhatsApp", `whatsapp.status.live` "Live — sending from {number}", `whatsapp.status.notConnected` "Not connected", `whatsapp.quality` "Quality", `whatsapp.quality.green` "Good", `.yellow` "Needs attention", `.red` "Blocked — messages are paused", `whatsapp.tier` "You can message {count} customers a day", `whatsapp.templates.title` "Message templates", `whatsapp.templates.status.approved` "Approved", `.submitted` "Waiting for approval", `.rejected` "Rejected", `.paused` "Paused by WhatsApp", `whatsapp.templates.sync` "Sync now", `whatsapp.templates.preview` "Preview", `whatsapp.cost.title` "Messaging costs", `whatsapp.cost.conversationHint` "One conversation covers 24 hours of messages to the same customer", `whatsapp.cost.month` "{amount} this month · {count} conversations", `whatsapp.channel.automatic` "WhatsApp (automatic)", `whatsapp.channel.automaticHint` "Sent from your verified number", `whatsapp.channel.openApp` "WhatsApp (open app)", `whatsapp.replies.title` "Replies", `whatsapp.replies.notice` "You reply from your own WhatsApp — DigiKhaato does not send free-form messages", `whatsapp.replies.openInWhatsapp` "Open in WhatsApp", `whatsapp.replies.markHandled` "Mark handled", `whatsapp.optOut.badge` "Opted out of WhatsApp", `whatsapp.optOut.notice` "{party} asked to stop WhatsApp messages on {date}", `whatsapp.error.template_not_approved` "This template is not approved yet", `whatsapp.error.quality_red` "WhatsApp has paused messages from your number", `whatsapp.error.rate_limit_reached` "You have reached today's WhatsApp limit", `whatsapp.error.no_consent_recorded` "No consent recorded for this customer". Hindi: "व्हाट्सएप", "चालू — {number} से भेजा जा रहा है", "गुणवत्ता", "संदेश टेम्पलेट", "मंज़ूरी का इंतज़ार", "अभी सिंक करें", "संदेश का खर्च", "व्हाट्सएप (अपने आप)", "व्हाट्सएप (ऐप खोलें)", "जवाब", "व्हाट्सएप में खोलें", "व्हाट्सएप बंद कर दिया". Copy rules: never claim a message was "read" unless Meta said so; always show the sender identity (the customer sees the shop's name, so the merchant must know which name goes out); costs are always accompanied by the conversation explanation; opt-out is stated on the party record permanently, not hidden in a log.

#### 9. States
Channel: Not connected · Connecting (test running) · Live (green) · Live (quality yellow, warning strip) · Paused (quality red or tier limit) · Credentials invalid · Disabled by tenant/partner/global kill (NTF-02 FR-15). Template row: Draft · Submitted · Approved · Rejected (with Meta's reason) · Paused · Disabled · Out of sync (local row with no upstream match). Message lifecycle: `queued` → `sent` → `delivered` → `read`, or `failed` (with a plain-English reason), or `skipped` (consent, approval, quality, limit, kill switch), with `meta.fallback_of` linking a deep-link attempt. Conversation: Open (within 24 h, further messages free) · Closed. Replies inbox: Loading · Empty ("No replies yet") · Ready · Unhandled (dot) · Handled · Media (thumbnail with a download that streams through the authenticated attachment view). Party: Opted in · Opted out (badge + date + who/what triggered it).

#### 10. Validation Rules
Credentials: `waba_id` and `phone_number_id` numeric 10–20 digits; `access_token` 64–512 chars, write-only; `webhook_verify_token` 12–64 chars → 400 `validation_error`; **Test connection** failure → 400 `provider_credentials_invalid`. Templates (partner scope): `whatsapp_template_name` `^[a-z0-9_]{3,60}$` (Meta's rule) unique per `(waba, locale)`; `category ∈ {utility, authentication, marketing}`; body ≤ 1,024 chars; positional variables must be contiguous from `{{1}}` with no gaps → 400 `details.body: ["Variables must be numbered 1, 2, 3 without gaps"]`; a variable may not be the first or last character of the body (Meta's rule) → 400; buttons ≤ 3 with a URL button's dynamic suffix declared. Send time: `approval_status='approved'` else `skipped`; `quality_rating='red'` → `skipped`; consent per FR-5; the 1-per-party-per-template-per-24h guard (FR-12) → `skipped` with `duplicate_suppressed`. Webhook: signature invalid → 400 and no state change; unknown `wamid` → staged for 7 days (NTF-02 FR-11). Server codes: 409 `channel_not_configured`, 409 `template_not_approved` (CCR-43), 409 `quality_red`, 409 `rate_limit_reached`, 409 `party_opted_out_whatsapp`, 403 `permission_denied`, 404 cross-tenant.

#### 11. Business Rules
1. BR-1 WhatsApp API sends are ordinary NTF-02 messages: one `notifications_message_log` row per attempt-chain, the same retry policy, the same log UI, the same kill switches. Nothing about this feature bypasses that pipeline.
2. BR-2 Opt-in is a hard precondition (FR-5) and opt-out is permanent until an explicit re-opt-in with a recorded source; the product never infers consent from a past transaction.
3. BR-3 Only **utility** templates are used for the MVP-of-Phase-2 set; the product never sends marketing templates, because a marketing message would put the merchant's number's quality rating — and therefore their reminders — at risk.
4. BR-4 The read receipt is displayed only when Meta reports it; absence of a read receipt is shown as "delivered", never as "not read" (the customer may have read-receipts disabled).
5. BR-5 Cost is per conversation, not per message (FR-6); the first billable message of a 24-hour window carries the cost and subsequent ones show ₹0.00 with the conversation link, so a merchant's monthly figure matches Meta's invoice.
6. BR-6 The product does not send free-form (session) messages at Phase 2 (FR-8); every outbound message is a template. This keeps the implementation stateless with respect to the 24-hour session window and avoids building an agent console.
7. BR-7 Inbound messages are stored and surfaced but never auto-answered; there is no bot, no auto-reply beyond the single `OPT_OUT_CONFIRM` (FR-9).
8. BR-8 The sending identity is the WABA's verified display name; a tenant on a partner's shared number must be told which name the customer will see, and the share text's sign-off (NTF-03 BR-11) must match it.
9. BR-9 The self-imposed 1-per-party-per-template-per-24h guard (FR-12) is independent of Meta's limits and exists to protect the number's quality rating from product bugs.
10. BR-10 Fallback (FR-13) never silently changes the channel a user chose: the UI says "WhatsApp automatic is unavailable — send it yourself?" and the deep link is offered, never sent on their behalf.
11. BR-11 Media received from a customer is downloaded once into `files_attachment` (`kind='whatsapp_inbound'`) and served through the authenticated attachment view; Meta's media URLs expire and are never stored as links.
12. BR-12 Template bodies are content owned by the partner/WABA, not tenant-editable (Meta approval is per text), mirroring NTF-02 FR-14.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See WhatsApp channel status, quality and tier | `notifications.settings.manage` | ✅ | ✅ | ❌ | ✅ |
| Connect / change WABA credentials | `platform.tenant.manage` + OTP step-up (or partner console) | ✅ | ❌ | ❌ | ❌ |
| Sync templates | `notifications.settings.manage` | ✅ | ✅ | ❌ | ❌ |
| Submit / version a template | partner console (`partner.templates.manage`) or super admin | — | — | — | — |
| Send via WhatsApp automatic | the originating feature's codename (`ledger.reminder.write`, `payments.payment.write`, `sales.invoice.read`) | ✅ | ✅ | ✅ | ❌ |
| Read the Replies inbox and mark handled | `parties.party.read` + `notifications.settings.manage` | ✅ | ✅ | ❌ | ✅ (read only) |
| See messaging costs | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Re-opt-in a party after STOP | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 The same `wamid` arrives in two status webhooks out of order (`read` before `delivered`) → statuses only advance (`queued < sent < delivered < read`); a backwards transition is ignored.
2. EC-2 A customer replies from a different number than the one stored → the inbound row has `party_id NULL` and appears in Replies as "Unknown number" with a **Match to customer** action that can also write a `parties_party.mobile` alternative.
3. EC-3 A template is approved in `en` but rejected in `hi` → the Hindi send resolves to the English template through NTF-02 BR-4's locale fallback, and the UI warns the partner that Hindi is unavailable.
4. EC-4 Meta pauses a template mid-campaign → subsequent sends are `skipped` with the reason and fall back per FR-13; already-sent messages are unaffected.
5. EC-5 A conversation is already open because the customer messaged first (a "service" conversation) → the utility message may be free; the pricing object says so and the log row reflects it.
6. EC-6 The webhook is called with a valid signature but for a WABA the product does not know → stored with `tenant_id NULL` for super-admin inspection, acknowledged 200.
7. EC-7 The access token expires (Meta tokens rotate) → the first 401 marks the channel `credentials_invalid`, raises one notification per 24 h, and suspends automatic sends while deep links keep working.
8. EC-8 A party opts out, then the merchant records a fresh written consent and re-enables → `whatsapp_opt_out_at` is cleared, `consent_at`/`consent_source` are updated, and the change is audited with the actor.
9. EC-9 A customer sends an image of a payment screenshot → stored as an attachment, shown in Replies and on the party timeline; the owner records the payment manually (no OCR — canon §0.3).
10. EC-10 12 reminders fire at 09:15 and Meta rate-limits at 10 → two are `failed` retryable and go out on the next tick; the log shows the attempts.
11. EC-11 A tenant on the partner's shared number is told (FR-11) that customers will see the partner's display name; if the partner later forbids sharing, the tenant's channel becomes Not connected with an explanation rather than silently failing.
12. EC-12 A customer replies "STOP" to a receipt (not a reminder) → the opt-out applies to the whole channel for that party, not to one template family, and the owner is told which message triggered it.
13. EC-13 The 24-hour dedupe guard blocks a genuinely needed second reminder (a customer paid partially and the amount changed) → the send is `skipped` with `duplicate_suppressed` and the UI offers the deep link, so the merchant is never blocked, only the automation is.
14. EC-14 A Hindi template's variable exceeds Meta's length rules → the render truncates per `max_variable_len` (NTF-02 FR-7) before submission, so the API never rejects on length.

#### 14. API Requirements
- `GET /notifications/whatsapp` → `{ data: { status, display_name, phone_number, waba_id_masked, quality_rating, messaging_tier, credentials_set, origin, shared_number: bool, monthly_cost, conversations_this_month } }`.
- `PUT /notifications/whatsapp` (owner step-up or partner console) `{ waba_id, phone_number_id, access_token?, webhook_verify_token? }` → 200; 400 `provider_credentials_invalid`.
- `POST /notifications/whatsapp/test { to? }` → 202 `{ message_log_id }` (sends an approved test template to the caller's own mobile; 3/hour).
- `GET /notifications/whatsapp/templates?locale&category&approval_status` → the synced library with previews and `origin`.
- `POST /notifications/whatsapp/templates` (partner scope) → 202 (proxies Meta's create); `POST /notifications/whatsapp/templates/sync` → 202.
- `GET /notifications/whatsapp/replies?party_id&handled=false&date_from&date_to&page` → inbound rows with `party`, `body`, `media_url` (authenticated), `received_at`, `handled_at`; `POST /notifications/whatsapp/replies/{id}/handle` → 200; `POST /notifications/whatsapp/replies/{id}/match { party_id }` → 200.
- `GET /notifications/whatsapp/costs?date_from&date_to` → `{ total, by_category, conversations, average }`.
- `POST /webhooks/messaging/whatsapp` — Meta's verification handshake on `GET` (`hub.mode`, `hub.verify_token`, `hub.challenge`) and events on `POST`, signature-verified, idempotent on `wamid`/event id, 200 fast.
- `PATCH /parties/{id}` gains `whatsapp_opt_out_at: null` (re-opt-in) guarded by `parties.party.write` and requiring `consent_source` (CCR-43).
- Frontend: `whatsappService.ts` (`getChannel`, `updateChannel`, `test`, `listTemplates`, `syncTemplates`, `listReplies`, `handleReply`, `matchReply`, `getCosts`); `whatsappSlice` + `whatsappThunk.ts`; `whatsappDisplay.ts` (`qualityTone`, `approvalTone`, `templatePreview`, `costCaption`); the channel picker lives in the existing reminder/share components and only reads `feature_flags.whatsapp_api_live`.

#### 15. Database Impact
`notifications_template` extended (CCR-43): `components jsonb`, `approval_status`, `approval_error text`, `quality_rating`, `whatsapp_template_id varchar(32)`, `category` enum widened. `notifications_message_log` gains the `read` status and `read_at timestamptz NULL`, plus `meta.conversation_id` and `meta.fallback_of`. `parties_party` gains `whatsapp_opt_out_at timestamptz NULL` (CCR-43). New tables `notifications_conversation` (CCR-44) and `notifications_inbound_message` (CCR-44) with `U(provider_message_id)`, `IX(tenant_id, handled_at, received_at DESC)`, `IX(tenant_id, party_id, received_at DESC)`. Credentials in `platform_tenant_secret`/`platform_partner_secret` (CCR-22). Writes `files_attachment` (inbound media), `ledger_reminder` (cancellation on STOP), `notifications_notification`, `platform_job`, `platform_audit_log`. Reads `notifications_template`, `parties_party`, `platform_partner.settings`.

#### 16. Audit Requirements
`whatsapp.channel_connected` / `.disconnected` (`metadata` = waba id masked, phone number, display name — never the token), `whatsapp.templates_synced` (`metadata` = counts by status), `whatsapp.template_submitted` (partner scope), `whatsapp.party_opted_out` (`actor_type='webhook'`, `metadata` = the triggering message id and matched keyword), `whatsapp.party_reopted_in` (`metadata` = consent source, actor — this is the DPDP-critical row), `whatsapp.reply_handled`, `whatsapp.quality_changed` (`actor_type='system'`, `before`/`after` rating). Individual sends and receipts remain message-log rows (NTF-02 §16), not audit rows.

#### 17. Notifications
- In-app (NTF-01) `whatsapp_reply_received`: "Ramesh Traders replied on WhatsApp — 'kal de dunga'" (body truncated to 80 chars), `data.route=/settings/messaging/replies?id={id}`; coalesced to one row per party per hour.
- In-app `whatsapp_party_opted_out`: "Ramesh Traders asked to stop WhatsApp messages", `data.route=/parties/{id}`.
- In-app `whatsapp_quality_warning` (owner + partner): "WhatsApp rated your number as needs attention — avoid sending to customers who did not ask" at yellow; `whatsapp_quality_blocked` at red: "WhatsApp has paused messages from your number".
- In-app `whatsapp_template_rejected` (partner + owner): "The Hindi reminder template was rejected — {reason}".
- In-app `whatsapp_credentials_invalid`: "Reconnect your WhatsApp Business account" (once per 24 h).
- Outbound to parties: the utility templates of FR-2 plus `OPT_OUT_CONFIRM`; all rendered and logged through NTF-02.

#### 18. Analytics / Event Tracking
`ub.notifications.whatsapp_channel_connected` `{ origin: tenant|partner, shared_number }`; `ub.notifications.whatsapp_templates_synced` `{ approved, submitted, rejected }`; `ub.notifications.whatsapp_sent` (server) `{ template_code, locale, category, conversation_new: bool, cost_bucket }`; `ub.notifications.whatsapp_status` (server) `{ template_code, status: sent|delivered|read|failed, latency_seconds_bucket, error_class }`; `ub.notifications.whatsapp_reply_received` (server) `{ type, matched_party: bool, hours_since_send_bucket }`; `ub.notifications.whatsapp_opt_out` (server) `{ trigger_template }`; `ub.notifications.whatsapp_fallback_used` `{ reason, fallback: deep_link|sms }`; `ub.notifications.whatsapp_quality_changed` (server) `{ from, to }`; `ub.notifications.whatsapp_costs_viewed` `{ month_cost_bucket }`. Never a message body, a number, a party name or a template variable value.

#### 19. Security
Access tokens and verify tokens are encrypted at rest, write-only over the API, decrypted only inside the backend, redacted everywhere (NTF-02 §19). The webhook verifies `X-Hub-Signature-256` with `hmac.compare_digest` over the **raw** body before any parsing, caps the body at 1 MiB, is idempotent on event id, and never trusts a tenant identifier from the payload (it resolves by `phone_number_id` → WABA → tenant/partner). Inbound media is fetched server-side with the bearer token to a size cap of 10 MB, validated by magic bytes, re-encoded for images (EXIF stripped) and stored under a UUID key — a customer-supplied file is treated exactly like an uploaded receipt (EXP-01 §19). Inbound message bodies are stored as text and rendered escaped; they are customer-authored content and must never be interpolated into a template or an outbound message. Opt-out handling is deliberately conservative (whole-message keyword match, never a substring) so "don't stop sending" cannot opt someone out by accident. The consent record (`consent_at`, `consent_source`, `whatsapp_opt_out_at`) is the DPDP evidence chain and is audited on every change with the actor. Rate limits: default 600/min; webhook 1,200/min; test send 3/hour; template sync 6/hour. Numbers are PII: masked in lists, excluded from analytics, retained only as long as the party exists.

#### 20. Performance
Sending reuses NTF-02's `SKIP LOCKED` drain; each Meta call is its own transaction with a 10 s timeout so one slow call cannot block the batch. The webhook is store-and-ack (one insert + one job row) and stays under 200 ms. Status updates are single-row updates keyed by the indexed `provider_message_id`. Conversation rows are upserted by `U(conversation_id)` — one write per 24-hour window per party, not per message. The Replies list is one indexed query with `select_related('party')`, paginated 25. Template sync pages Meta's API at 100 and upserts in one transaction. The costs endpoint is a single grouped aggregate over `notifications_conversation` with `IX(tenant_id, started_at)`. CI asserts ≤ 3 queries for the replies list and ≤ 2 for the webhook path.

#### 21. Testing
T-NTF-05-1 (unit) `WhatsAppCloudBackend.send()` builds Meta's payload with positional components in the declared order and maps 200 → `sent` with the returned `wamid`. T-NTF-05-2 (unit) signature verification accepts a known-good `X-Hub-Signature-256` and rejects a tampered body; the GET verification handshake echoes the challenge only for the right verify token. T-NTF-05-3 (unit) status transitions only advance; an out-of-order `read` before `delivered` still lands as `read`; an unknown `wamid` is staged. T-NTF-05-4 (unit) consent gate: no `consent_at`, `sms_opt_in=false`, or `whatsapp_opt_out_at` set → `skipped` with the right reason and no API call. T-NTF-05-5 (unit) STOP matching: "STOP", "stop.", "band karo", "बंद करो" opt out; "please don't stop sending" does not; the opt-out cancels scheduled `whatsapp_api` reminders and raises the notification. T-NTF-05-6 (unit) conversation accounting: the first billable message carries the cost, the next within 24 h costs 0 with the same `conversation_id`, and a new window starts after expiry. T-NTF-05-7 (unit) approval and quality gates skip with `template_not_approved` / `quality_red` and trigger the FR-13 fallback with `meta.fallback_of` linkage. T-NTF-05-8 (unit) the 1-per-party-per-template-per-24h guard suppresses a duplicate and records it. T-NTF-05-9 (unit) template sync upserts by name+locale, marks missing templates `draft`, and never overwrites an approved body locally. T-NTF-05-10 (unit) inbound media is downloaded, magic-byte validated, EXIF-stripped and stored as an attachment; the Meta URL is not persisted. T-NTF-05-11 (API) credentials PUT masks the token, requires step-up, audits without secrets; a bad token → 400. T-NTF-05-12 (API) replies list, handle and match; an unknown-number reply has `party_id NULL` and can be matched. T-NTF-05-13 (API) costs endpoint totals equal the sum of conversation costs for the range. T-NTF-05-14 (API) permission matrix: staff may trigger a send but cannot read replies or costs; accountant reads costs and replies but cannot re-opt-in a party. T-NTF-05-15 (API) re-opt-in requires `consent_source` and is audited. T-NTF-05-16 (component) channel card states (live, yellow, red, invalid, shared number), template grid with previews, costs card caption. T-NTF-05-17 (component) Replies UI including the "you reply from your own WhatsApp" notice and Open in WhatsApp deep link. T-NTF-05-18 (component) `MessagesStrip` renders the read double-tick with delivered/read times. T-NTF-05-19 (E2E, stubbed Meta) enable the channel → LED-07 D-0 scan → 3 messages sent → deliver and read webhooks → strip shows read → one customer replies STOP → opt-out applied, reminders cancelled, owner notified → next scan skips that party and offers the deep link. T-NTF-05-20 (perf) 200 status webhooks processed with ≤ 2 queries each.

#### 22. Acceptance Criteria
- AC-1 (US-NTF-05-1) Given a live WABA, approved `REMINDER_WHATSAPP_API` templates in `en` and `hi`, and `ledger.reminder_channel_default='whatsapp_api'`, when the D-0 scan runs for 12 due parties, then 12 `notifications_message_log` rows exist with `channel='whatsapp'`, each sent as a utility template from the verified number in the party's language, and each reminder row links to its message log.
- AC-2 (US-NTF-05-2) Given a sent message, when Meta delivers `delivered` and then `read` webhooks, then the log row advances to `delivered` and then `read` with timestamps, and the party timeline and reminder row show the double-tick with "read 10:04".
- AC-3 (US-NTF-05-3) Given a partner admin who registers the WABA, phone number id, token and verify token and syncs templates, then the channel card shows Live with the verified display name and quality rating, the template library lists the approved set with previews, and every tenant under that partner can send without further setup.
- AC-4 (US-NTF-05-4) Given 3,588 utility conversations in a month, when the accountant opens Messaging costs, then the total, the per-category breakdown, the conversation count and the average are shown with the 24-hour conversation caption, and messages inside an open conversation display ₹0.00 linked to their conversation.
- AC-5 (US-NTF-05-5) Given a customer replying "kal de dunga", then a `notifications_inbound_message` row exists matched to that party, an in-app notification is raised, the reply appears on the party timeline and in the Replies inbox as unhandled, and **Open in WhatsApp** produces a `wa.me` deep link to that number.
- AC-6 (US-NTF-05-6) Given a customer replying "band karo", then `parties_party.whatsapp_opt_out_at` is set, their scheduled `whatsapp_api` reminders become `cancelled`, the owner is notified, the party record shows the opt-out badge with the date, and every later WhatsApp send for that party is `skipped` with `party_opted_out_whatsapp` until an explicit re-opt-in with a recorded consent source.
- AC-7 (US-NTF-05-7) Given the template is not yet approved (or the number's quality is red), when the owner sends a reminder, then no API call is made, the row is `skipped` with a plain-English reason, and the UI offers the NTF-03 deep link instead — the merchant is never blocked from communicating.

#### 23. Dependencies
NTF-02 (adapter interface, template registry, message log, retry, kill switches, credential storage CCR-22), NTF-03 (deep-link fallback, public share links used as template buttons, `WaMeBackend`), NTF-01 (all in-app notifications), LED-06/LED-07/LED-12/LED-13 (reminder channels — LED-12 is realised by this feature), PAY-04 (receipt sends), PAY-06 (payment link template), SAL-08 (invoice share), PTY-01 (`sms_opt_in`, `consent_at`, `consent_source`, `whatsapp_opt_out_at` CCR-43), PLT-06 (OTP step-up), WLB-03/WLB-06 (partner WABA, display name, shared number policy), ADR-012 (`platform_job`), ADR-014 (no server PDF yet — URL buttons instead), ADR-021/ADR-022 (stdlib HTTP), `UbDataGrid`, `UbStatusBadge`, `UbStatusBanner`, `MessagesStrip`, CCR-22/CCR-43/CCR-44.

#### 24. Future Enhancements
A proper agent console for free-form session replies within the 24-hour window, with assignment and canned responses; server-side PDF (ADR-014 Phase 2) so invoices and statements arrive as document headers instead of links; interactive templates with quick-reply buttons ("I will pay tomorrow", "Already paid") writing straight into the reminder's status and the collection date; WhatsApp Flows for collecting a payment date without leaving the chat; click-to-WhatsApp payment links using Meta's native payment integration where available; multi-number support for shops with separate sales and accounts numbers; automated language detection from the customer's replies; per-template A/B testing of reminder wording against collection rate (shared with NTF-02 §24); a shared partner-level template library with per-tenant variable overrides (WLB-07); and cost forecasting that recommends WhatsApp versus SMS per party based on past read rates.

### NTF-06 — Email (invoices/statements) — Phase 2

#### 1. Business Objective
Add the one channel the accountant actually wants. WhatsApp and SMS reach the shopkeeper's customer; email reaches the **CA, the corporate buyer's accounts department and the auditor** — the people who need a statement as a file, in a thread, with a subject line they can search. Email is also the only channel that can carry an attachment today without a provider contract (SMTP is free, Django ships the backend, ADR-021 is untouched), which makes it the natural home for month-end statements, B2B invoices and report exports. Measured by: ≥ 30 % of GST-registered tenants send at least one invoice or statement by email in the first month of availability; bounce rate ≤ 2 %; ≥ 95 % of sends complete within 120 s; zero emails sent to a party without a recorded address and consent.

#### 2. User Personas
Accountant (AC) is the primary persona — sends statements and registers to the CA, receives export-ready files; Owner (OW) sends invoices to corporate buyers and configures the from-address; Admin (AD) same; Staff (ST) does not use email (their world is the counter and WhatsApp); Customer (CU) — specifically a B2B buyer's accounts contact — receives; Partner admin (PA) sets the default sending domain and footer for their white-label base (WLB-06).

#### 3. User Stories
1. US-NTF-06-1 — As an accountant I want to email a party's statement for a date range so that the CA gets it in a thread, not a chat.
2. US-NTF-06-2 — As an owner I want to email a tax invoice to my corporate buyer's accounts department so that they can process payment.
3. US-NTF-06-3 — As an accountant I want the GST summary and registers I export to arrive in my inbox so that I am not tied to the browser.
4. US-NTF-06-4 — As an owner I want emails to come from my shop's name so that the customer recognises them.
5. US-NTF-06-5 — As an owner I want to know when an email bounced so that I fix the address instead of waiting.
6. US-NTF-06-6 — As an owner I want to copy myself and add a short message so that the email reads like I wrote it.
7. US-NTF-06-7 — As a recipient I want the email to contain both a readable summary and a link (or file) so that I can act without installing anything.

#### 4. Functional Requirements
1. FR-1 **Backend behind NTF-02.** `SmtpEmailBackend(MessageBackend)` with `channel='email'` wraps Django's built-in `django.core.mail` (`EmailMultiAlternatives` over `smtp.EmailBackend`) — no new dependency. A second implementation `SesEmailBackend`/`ApiEmailBackend` speaks a transactional provider's REST API (SendGrid/SES/Postmark-shaped) over stdlib `urllib.request` for tenants that need bounce webhooks and better deliverability. Both are selected by the existing NTF-02 FR-4 resolution order; the default is `NullBackend` (`skipped` with `channel_not_configured`), so email is silent until someone configures it.
2. FR-2 **What can be emailed.** Kinds at Phase 2: `statement` (LED-04, a date range), `invoice` / `bill_of_supply` / `estimate` / `credit_note` (SAL-08), `receipt` / `voucher` (PAY-04), `payment_link` (PAY-06), `report_export` (RPT-11, the async export delivered to the requester), and `member_invitation` (PLT-02). Every one already has a share-link mechanism (NTF-03 FR-3); email reuses the same link and, where a file exists, attaches it.
3. FR-3 **Attachments.** At Phase 2 the product still has no server-side PDF for documents (ADR-014), so: `report_export` emails **attach** the generated CSV/XLSX (it is already a `files_attachment(kind='export_file')`), while `statement` and document kinds **link** to the public page and additionally attach a **CSV** of the statement rows or the document lines when the recipient asks for it (a **Attach as CSV** checkbox, default on for `statement`, off for documents). When server-side PDF lands (ADR-014 Phase 2), the same code path attaches the PDF by swapping the attachment resolver — the composer already has the checkbox and the schema already has `attachment_ids[]`.
4. FR-4 **Composer.** `EmailShareSheet` is a variant of `UbShareSheet` (NTF-03 FR-1) opened by the **Email** action: fields **To** (`MLInput` with chips, 1–5 addresses, prefilled from `party.email`), **Cc** (collapsed, includes a **Copy me** switch that adds the member's own address), **Subject** (prefilled from the template, editable), **Message** (an `MLTextarea` with the rendered body, the generated summary block shown read-only beneath an editable personal paragraph of ≤ 500 chars), **Attach as CSV** switch, and a preview of the attachment name and size. Send → `POST /{resource}/{id}/send-email`.
5. FR-5 **Templates.** Email bodies live in the NTF-02 registry with `channel='email'`, two parts per template (`subject` and `body`, the latter Markdown-ish rendered to both `text/plain` and a simple inline-CSS `text/html`): codes `STATEMENT_EMAIL`, `INVOICE_EMAIL`, `ESTIMATE_EMAIL`, `CREDIT_NOTE_EMAIL`, `RECEIPT_EMAIL`, `PAY_LINK_EMAIL`, `REPORT_EXPORT_EMAIL`, `INVITE_MEMBER_EMAIL`, in `en` and `hi`. The HTML part is intentionally plain — a header with the tenant's name (and logo when `branding.logo_attachment_id` exists, served from an absolute URL), a summary table, one primary link button, the personal paragraph, and the tenant's `doc_footer` — because rich HTML email is a deliverability and rendering liability. No tracking pixels, ever.
6. FR-6 **From, Reply-To and domain.** Sending uses `From: "{tenant.name} via {app_name}" <{configured_from_address}>` and `Reply-To: {tenant.email or the sending member's email}`, so replies reach the merchant while the envelope stays on a domain the deployment controls (SPF/DKIM/DMARC alignment). A tenant may **not** set an arbitrary `From` address at Phase 2 — spoofing their own domain would fail DMARC and poison the shared sending reputation. A partner may configure a verified sending domain for their whole base (WLB-06), in which case `From` becomes `"{tenant.name}" <no-reply@{partner_domain}>`.
7. FR-7 **Consent and addresses.** `party.email` is optional (§21.3.3). Sending requires a valid address and, for party-facing kinds, `party.sms_opt_in`? **No** — a separate `party.email_opt_out_at` (CCR-45), because a customer may want email but not SMS. Absence of an address → the composer asks for one with a **Save to this customer** switch (NTF-03 FR-5 pattern). Transactional emails to a party the merchant has a commercial relationship with are permitted under DPDP as service communication; marketing email is out of scope and no template of that category exists.
8. FR-8 **Bounce and complaint handling.** With `SmtpEmailBackend` there is no feedback loop, so a send is terminal at `sent`. With an API backend, `POST /webhooks/messaging/email` receives `delivered`, `bounce` (hard/soft), `complaint` and `open`? **No open tracking** (FR-5). A hard bounce or a complaint sets `party.email_opt_out_at`, marks the log row `failed` with a plain-English reason, and raises an NTF-01 to the sender. Soft bounces follow NTF-02's retry policy (1/5/15 min, ≤ 3 attempts).
9. FR-9 **Report exports by email.** RPT-11's async export gains a **Email it to me when ready** switch. On completion the export job calls `send_message(channel='email', template_code='REPORT_EXPORT_EMAIL', to=member.email, attachment_ids=[export.file_attachment_id])`; files above 8 MB are linked rather than attached (a 7-day authenticated download URL) with the body explaining why.
10. FR-10 **Member email addresses.** `platform_user.email` is optional at MVP (mobile is the identity, ADR-011). Emailing a member (export ready, invitation) requires it; the settings page prompts "Add your email to receive files and invitations" and verifies it with a one-time link (`POST /auth/email/verify/request` → `…/confirm`, CCR-46) before any send, so a typo cannot leak a statement.
11. FR-11 **Threading.** Each entity gets a stable `Message-ID` namespace and subsequent emails about the same entity set `In-Reply-To`/`References` to the first, so a statement sent monthly to a CA threads in Gmail instead of scattering. The subject carries the stable identifier (`Statement · Ramesh Traders · Apr–Sep 2026 · Sharma Store`) so search works.
12. FR-12 **Rate and size limits.** Per tenant: 200 emails/day and 20/hour (settings-overridable by a super admin), 5 recipients per send, 10 MB total attachment size, 500-character personal paragraph. Exceeding them returns 429 `email_quota_exceeded` (CCR-45) with a clear message and the reset time; the composer shows the remaining quota when below 20 %.
13. FR-13 **Log and history.** Email sends are ordinary `notifications_message_log` rows (`channel='email'`, `to_address` = the first recipient with the rest in `meta.recipients[]`, `body` = the rendered text part), visible in the message log (NTF-02 FR-12) and in the entity's `MessagesStrip`. The party timeline shows "Statement emailed to ca@example.com · 01/10".
14. FR-14 **No inbound email.** The product does not receive email at Phase 2 — `Reply-To` sends the recipient's reply to the merchant's own mailbox. There is no parsing, no ticketing and no attachment ingestion, and the UI says so where it matters ("Replies go to your own email").

#### 5. Non-Functional Requirements
`send_message` remains ≤ 15 ms (NTF-02); SMTP hand-off P95 ≤ 120 s (one scheduler tick plus the SMTP round trip, which may take seconds). Rendering an email (text + HTML + attachment resolution) P95 ≤ 300 ms including a 5,000-row statement CSV. Attachments stream from `MEDIA_ROOT` rather than loading fully into memory where the backend allows. The HTML part must render acceptably in Gmail, Outlook web, Apple Mail and Gmail Android: inline CSS only, tables for layout, no web fonts, max width 600 px, a plain-text alternative always present, and a total HTML size ≤ 100 kB. Devanagari renders with a system font stack and is always accompanied by the plain-text part. All SMTP/API calls have explicit timeouts (10 s) and TLS enforced (`EMAIL_USE_TLS`). en/hi for subjects and bodies, chosen like NTF-03 FR-14.

#### 6. User Flow
Primary (statement to the CA): Party → Ramesh Traders → **Share** → **Email** → To prefilled `accounts@rameshtraders.in`, Cc **Copy me** on, Subject "Statement · Ramesh Traders · Apr–Sep 2026 · Sharma Store", body shows the summary (opening, debits, credits, closing) with a **View statement** button and an editable line above it, **Attach as CSV** on → **Send** → snackbar "Email queued to accounts@rameshtraders.in" → within a minute the log row is `sent` and the party timeline shows it.
Alternate A (invoice to a corporate buyer): Invoice detail → Email → To the buyer's accounts address → the body carries the invoice number, date, GSTIN, taxable value, tax and total, plus a **View bill** button → sent.
Alternate B (export): Reports → GST summary → Export XLSX → **Email it to me when ready** → the job finishes → the accountant's inbox has the file attached.
Alternate C (no address): the party has no email → the composer asks for one with **Save to this customer** → saved → sent.
Alternate D (bounce): the address was wrong → an API backend reports a hard bounce → the log row is `failed` with "The address does not exist", `email_opt_out_at` is set, an in-app notification tells the sender, and the party record shows the bad address with a **Fix** action.
Alternate E (no email configured): the tenant has no provider → the **Email** action is hidden everywhere and Settings → Messaging shows "Email: not set up" with a one-line explanation.
Alternate F (quota): a tenant sends 200 statements at month end and hits the cap → 429 with "You have sent 200 emails today — the limit resets at midnight", and the composer had already warned at 160.

#### 7. UI Requirements
`EmailShareSheet` (`UbDrawer` on mobile, `UbDialog` ≥ 1024 px, 560 px wide): **To** field as removable `UbFilterTag` chips with an `MLInput` for the next address and inline validation; **Cc** disclosure with a **Copy me** `MLSwitch`; **Subject** `MLInput` (120 chars, with a reset-to-default `MLIconButton`); **Message** — a read-only summary block on `--surface-sunken` plus an editable `MLTextarea` above it labelled "Your message (optional)" with a counter; **Attach as CSV** `MLSwitch` with the resolved file name and size beneath it; a quota caption when below 20 % remaining; footer **Send email** (primary) / **Cancel**. `EmailPreviewDialog` (a **Preview** link) renders the HTML part in a sandboxed `iframe` (`sandbox=""`, `srcdoc`) so the sender sees exactly what arrives. Settings → Messaging → **Email** card (NTF-02 FR-13 shape): provider, from-address (read-only, with the partner domain when applicable), reply-to, **Send a test email**, status chip, and the daily quota with a usage bar (`MLProgress`). Party form gains an **Email** field with an opted-out badge and date when `email_opt_out_at` is set, plus a **Re-enable** action. Message log rows show a `Mail` glyph and the recipient masked as `acc•••@rameshtraders.in`.

#### 8. UX Requirements
Keys: `email.action` "Email", `email.to` "To", `email.cc` "Cc", `email.copyMe` "Copy me", `email.subject` "Subject", `email.subjectReset` "Use the default subject", `email.message` "Your message (optional)", `email.summary` "What we will include", `email.attachCsv` "Attach as CSV", `email.attachment` "{name} · {size}", `email.preview` "Preview", `email.send` "Send email", `email.queued` "Email queued to {address}", `email.sent` "Email sent", `email.addAddress` "Add an email address", `email.saveToParty` "Save to this customer", `email.repliesNotice` "Replies go to your own email", `email.quota` "{remaining} emails left today", `email.quotaExceeded` "You have sent {limit} emails today — the limit resets at {time}", `email.notConfigured` "Email is not set up", `email.optedOut` "This customer asked to stop emails on {date}", `email.reenable` "Re-enable email", `email.bounced` "The address does not exist — fix it and try again", `email.verifyYours` "Add your email to receive files and invitations", `email.verifySent` "Check your inbox and tap the link to confirm". Hindi: "ईमेल", "किसे", "मुझे भी भेजें", "विषय", "आपका संदेश (वैकल्पिक)", "सीएसवी जोड़ें", "पूर्वावलोकन", "ईमेल भेजें", "ईमेल भेजा गया", "इस ग्राहक में सहेजें", "जवाब आपके अपने ईमेल पर आएंगे", "आज {remaining} ईमेल बाकी", "ईमेल सेट नहीं है". Copy rules: the summary block is read-only and always shown so the sender knows exactly what numbers leave the building; the personal paragraph sits **above** the generated content so the email reads like a human wrote it; "queued" is used until the log row says `sent` (honesty rule, NTF-02 §8); no tracking is mentioned because none exists; the replies notice appears once in the composer footer.

#### 9. States
Composer: Initial (To focused or prefilled) · Invalid address (chip turns `danger` with a tooltip) · No address (empty state with the add-address prompt) · Rendering preview (spinner in the dialog) · Attachment building (CSV generation spinner, Send disabled) · Submitting · Queued (sheet closes, snackbar) · Error 429 quota (banner with the reset time) · Error 409 not configured (the action should not have been visible; shows a settings link) · Disabled (party opted out: Send disabled with the reason and a **Re-enable** link for those with `parties.party.write`). Log row: `queued` → `sent` → (`delivered` only with an API backend) or `failed` (bounce, complaint, SMTP error) or `skipped` (not configured, opted out, quota, kill switch). Settings card: Not configured · Configured (SMTP) · Configured (API, with bounce handling) · Credentials invalid · Quota near limit (`warning`) · Quota exhausted (`danger`). Member email: Absent (prompt) · Unverified (pending, with **Resend link**) · Verified.

#### 10. Validation Rules
`emailShareSchema`: `to` 1–5 entries, each RFC 5322-valid and ≤ 254 chars, deduplicated case-insensitively on the domain → "Enter a valid email address"; `cc` 0–3 entries with the same rule; total recipients ≤ 5 → "You can send to at most 5 addresses"; `subject` 1–120 chars, required, no newlines → "Add a subject"; `personal_message` ≤ 500 chars, **no URLs** (same anti-phishing rule as NTF-03 BR-7) → "Links are not allowed in your own message"; `attach_csv` boolean; `locale ∈ {en, hi}`. Server: 409 `channel_not_configured`, 409 `party_opted_out_email` (CCR-45), 429 `email_quota_exceeded` with `details.reset_at`, 413 `attachment_too_large` when the resolved attachments exceed 10 MB, 409 `document_not_shareable` for drafts (NTF-03 CCR-41), 400 `member_email_unverified` when sending to the caller's own unverified address, 404 cross-tenant. Member email verification: `POST /auth/email/verify/request` rate-limited 3/hour; the token is single-use, 24 h, hashed at rest.

#### 11. Business Rules
1. BR-1 Email is an NTF-02 channel like any other: one log row per attempt-chain, the same retry policy, the same kill switches, the same message log. Nothing here bypasses `send_message()`.
2. BR-2 The numbers in an email are rendered server-side from the same selectors as the app (NTF-03 BR-2), and the generated summary is not editable — only the personal paragraph is.
3. BR-3 `From` is always a domain the deployment controls (FR-6); tenants never send as their own domain at Phase 2. `Reply-To` carries the merchant so the conversation still belongs to them.
4. BR-4 No open tracking, no click tracking, no pixels (FR-5). The product cannot tell whether an email was read and never implies that it can; the public link's `view_count` (NTF-03 FR-12) is the only signal and it is labelled as a link view, not a read.
5. BR-5 A hard bounce or a complaint permanently opts the address out (`email_opt_out_at`) until a human re-enables it, because continuing to send to a bouncing address is the fastest way to lose a sending domain's reputation for every tenant on it.
6. BR-6 Quotas (FR-12) are per tenant and exist to protect the shared sending reputation, not to upsell; they are generous relative to the persona (an accountant sending month-end statements) and visible before they bite.
7. BR-7 Attachments are resolved server-side from entities the sender may read; the composer never accepts an arbitrary uploaded file, so the product cannot be used to mail attachments of the sender's choosing.
8. BR-8 Drafts are never emailable (NTF-03 BR-10 applies identically).
9. BR-9 Member-facing emails (export ready, invitation) require a **verified** address (FR-10); party-facing emails do not, because the merchant vouches for the address and a bounce is handled by BR-5.
10. BR-10 The HTML part is always accompanied by a plain-text alternative carrying the same numbers and the same link, so a text-only client loses nothing.
11. BR-11 Email is never used for reminders at Phase 2. A reminder is a nudge and belongs on WhatsApp/SMS where it is read within minutes; adding email would dilute the reminder features' measured outcomes. This is a product decision, not a technical limit, and is revisited in §24.
12. BR-12 Threading identifiers (FR-11) are derived from the entity id and the tenant id, never from a random value, so a re-send threads with the original even after a server restart.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Email a statement | `ledger.statement.export` | ✅ | ✅ | ❌ | ✅ |
| Email an invoice / estimate / credit note | that document's read codename + `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Email a receipt / voucher | `payments.payment.write` | ✅ | ✅ | ❌ | ❌ |
| Email a report export to self | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Configure the email channel | `platform.tenant.manage` | ✅ | ❌ | ❌ | ❌ |
| Send a test email | `notifications.settings.manage` | ✅ | ✅ | ❌ | ✅ |
| Re-enable a bounced/opted-out address | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Verify own email address | authenticated member | ✅ | ✅ | ✅ | ✅ |

Staff are deliberately excluded from sending: their workflow is the counter and WhatsApp, and every email leaves the tenant's shared sending reputation exposed.

#### 13. Edge Cases
1. EC-1 The party's email is a role address with a plus tag or an apostrophe (`o'brien+ub@x.co.in`) → accepted (RFC 5322) and not mangled by the chip input.
2. EC-2 Two recipients differ only by case → deduplicated on the domain, preserved on the local part (which is technically case-sensitive), and the sender is told "1 duplicate removed".
3. EC-3 The statement CSV for a 5,000-entry range exceeds 10 MB → the attachment is dropped, the body explains "The statement was too large to attach — use the link", and the send proceeds.
4. EC-4 SMTP times out mid-send → retryable per NTF-02 FR-10; a duplicate delivery is possible in principle (SMTP gives no idempotency), so the log row records `attempts` and the body carries no "message id" the recipient could act on twice.
5. EC-5 The recipient's server greylists the first attempt (451) → treated as retryable and succeeds on the second attempt minutes later, which is normal and needs no user-facing noise.
6. EC-6 A party has both an opted-out email and a valid WhatsApp number → the share sheet hides Email with the reason and offers WhatsApp.
7. EC-7 The tenant has no logo → the HTML header renders the trade name as text; no broken image placeholder is ever sent (a broken image in email is a spam signal).
8. EC-8 A member's email is changed after an export was requested → the export mails to the address that was verified at request time, recorded on the job payload.
9. EC-9 The personal paragraph contains a URL → rejected client- and server-side (§10), because the product's signed email must not become a phishing vehicle.
10. EC-10 The tenant's daily quota is consumed by a bulk statement run → 429 with the reset time; nothing is queued beyond the cap so the backlog cannot burst at midnight.
11. EC-11 A Hindi subject line → encoded per RFC 2047; the plain-text and HTML parts are UTF-8; verified against the four target clients.
12. EC-12 The same statement is emailed twice in a month → both thread together (FR-11) and both appear in the log; the second is not suppressed (a deliberate re-send is information).
13. EC-13 An API backend reports a complaint ("marked as spam") → treated exactly like a hard bounce (BR-5) and the sender is told plainly so they stop.
14. EC-14 A tenant on the partner's sending domain is suspended by the partner → the channel becomes Not configured with an explanation; existing links keep working.

#### 14. API Requirements
- `GET /notifications/email` → `{ data: { provider, status, from_address, reply_to, domain_origin: deployment|partner, credentials_set, quota: { daily_limit, used_today, resets_at }, bounce_handling: bool } }`.
- `PUT /notifications/email` (owner) `{ provider, host?, port?, username?, password?, use_tls?, api_key?, reply_to? }` → 200; 400 `provider_credentials_invalid` after a live connection probe.
- `POST /notifications/email/test { to? }` → 202 `{ message_log_id }`; 3/hour.
- `POST /parties/{id}/send-email { kind: "statement", to[], cc[], subject, personal_message?, attach_csv, date_from?, date_to?, locale? }` → 202 `{ data: { message_log_id, recipients } }`.
- `POST /sales/invoices/{id}/send-email` · `/sales/estimates/{id}/send-email` · `/sales/credit-notes/{id}/send-email` · `/payments/{id}/send-email` · `/payment-requests/{id}/send-email` — same body shape minus the date range.
- `POST /reports/exports/{id}/send-email { to? }` → 202 (defaults to the requesting member's verified address).
- `GET /{resource}/{id}/email-preview?locale&attach_csv` → `{ data: { subject, html, text, attachments: [{ name, size_bytes }] } }` for the preview dialog (rendered server-side, never composed on the client).
- `POST /webhooks/messaging/email` — provider bounce/complaint webhook, signature-verified, idempotent on the provider's event id (NTF-02 FR-11 shape).
- `PATCH /parties/{id} { email, email_opt_out_at: null }` — re-enable, guarded by `parties.party.write` (CCR-45).
- `POST /auth/email/verify/request` · `POST /auth/email/verify/confirm { token }` (CCR-46).
- Frontend: `emailService.ts` (`getChannel`, `updateChannel`, `test`, `preview`, `sendEntityEmail`, `sendExportEmail`, `requestVerify`, `confirmVerify`); `emailSlice` (`channel`, `quota`, `composer: { to, cc, subject, personalMessage, attachCsv, status }`, `preview`) + `emailThunk.ts`; `emailDisplay.ts` (`defaultSubject`, `maskAddress`, `quotaCaption`, `attachmentLabel`); `EmailShareSheet` lives beside `UbShareSheet` in `src/design-system/` and is code-split.

#### 15. Database Impact
`parties_party` gains `email_opt_out_at timestamptz NULL` and an `email_bounce_reason varchar(120) NULL` (CCR-45); `platform_user` gains `email_verified_at timestamptz NULL` and a `platform_email_verification` table (`user_id`, `email`, `token_hash U`, `expires_at`, `used_at`, CCR-46). `notifications_message_log` rows carry `channel='email'`, `meta.recipients[]`, `meta.attachments[]`, `meta.thread_root_id`; the existing `body` column stores the plain-text part. `notifications_template` holds the email templates with a `subject` column (CCR-45). A per-tenant daily counter lives in `platform_tenant_setting['messaging.email.usage']` (`{date, count}`) updated inside the send transaction — cheap, auditable and self-resetting. Writes `files_attachment` (generated CSVs, `kind='export_file'`, expiring in 7 days), `platform_job`, `notifications_notification`, `platform_audit_log`. Reads the entity tables, `platform_tenant` (branding, `doc_footer`), `platform_partner.settings` (sending domain).

#### 16. Audit Requirements
`email.channel_configured` (`metadata` = provider, from-address, reply-to — never the password or API key), `email.sent` (`metadata` = kind, entity, recipient count, recipients masked, attachment names and sizes, `message_log_id`, `personal_message_present: bool`), `email.bounced` (`actor_type='webhook'`, `metadata` = address masked, bounce type, provider reason), `email.party_opted_out` / `.party_reenabled` (`metadata` = actor and reason — the DPDP-relevant pair), `email.member_verified` (`metadata` = address masked). Test sends are audited as `email.test_sent`. Individual delivery events remain message-log rows (NTF-02 §16).

#### 17. Notifications
- In-app (NTF-01) `email_bounced`: "The statement to accounts@rameshtraders.in bounced — the address does not exist", `data.route=/parties/{id}`, with a **Fix address** action.
- In-app `email_quota_warning`: "You have 40 emails left today" (raised once per day at 80 % usage, owners and the sending member).
- In-app `email_channel_invalid`: "Reconnect your email settings — the server rejected the login" (owner, once per 24 h).
- In-app `export_ready` (NTF-01, existing) gains an email delivery when FR-9's switch is on; the in-app row still appears so the inbox remains complete (NTF-01 BR-1).
- Outbound to parties and members: the templates of FR-5 only. There are **no** reminder emails (BR-11) and no marketing email of any kind.

#### 18. Analytics / Event Tracking
`ub.notifications.email_composer_opened` `{ kind, had_address, surface }`; `ub.notifications.email_preview_viewed` `{ kind }`; `ub.notifications.email_sent` `{ kind, recipients, cc_self, attach_csv, personal_message: bool, locale }`; `ub.notifications.email_quota_warning_shown` `{ used_pct_bucket }`; `ub.notifications.email_quota_blocked` `{}`; `ub.notifications.email_result` (server) `{ kind, status: sent|failed|skipped, error_class, attempts, attachment_kb_bucket }`; `ub.notifications.email_bounced` (server) `{ bounce_type }`; `ub.notifications.email_channel_configured` `{ provider, origin }`; `ub.notifications.email_member_verified` `{}`. Never an address, a subject, a body, a party name or an amount.

#### 19. Security
SMTP passwords and API keys are encrypted at rest and write-only over the API (NTF-02 §19, CCR-22). `From` is locked to a controlled domain (FR-6/BR-3) so SPF, DKIM and DMARC align and the deployment's reputation is defensible; a tenant-supplied `Reply-To` is validated as a single address and header-injection is impossible because Django's mail API rejects newlines in headers — additionally every header value is stripped of `\r\n` before use. Recipients are capped at 5 and attachments are resolved server-side from entities the sender may read (BR-7), so the endpoint cannot be used as an open relay or an arbitrary-file mailer. The personal paragraph rejects URLs (§10) to keep a signed, branded email from carrying someone else's link. The HTML part is generated from a fixed template with escaped values — no user HTML is ever embedded — and carries no remote resources except the tenant logo on the deployment's own domain. Public links inside emails inherit NTF-03 §19 (hashed tokens, expiry, revocation, `noindex`, no referrer). Member email verification (FR-10) prevents a typo from mailing a statement to a stranger. Addresses are PII: masked in lists and logs, absent from analytics, and deleted with the party or the tenant (PLT-10). Rate limits: per-tenant quotas (FR-12), test sends 3/hour, verification requests 3/hour, default 600/min.

#### 20. Performance
Rendering is one template render plus, when attaching, one CSV generation that streams rows from the same selector the statement view uses (chunked at 1,000 rows, never materialising the whole set). Attachments are read from `MEDIA_ROOT` as file objects rather than bytes. The send itself is one SMTP session per message inside the scheduler's per-message transaction, so a slow recipient server never blocks the batch (NTF-02 §20's `SKIP LOCKED` drain applies unchanged). The preview endpoint renders without sending and is cached 60 s per (entity, locale, attach flag). The composer opens from data already in the entity's slice; only the preview and the quota require a round trip. The usage counter is a single JSONB update inside the send transaction. CI asserts ≤ 3 queries for the preview endpoint and that a 5,000-row statement CSV is generated with constant memory.

#### 21. Testing
T-NTF-06-1 (unit) `SmtpEmailBackend.send()` produces an `EmailMultiAlternatives` with both parts, the right `From`, `Reply-To`, `Message-ID`, `In-Reply-To` and attachments, and maps success to `sent`. T-NTF-06-2 (unit) header injection: a `Reply-To` or subject containing `\r\nBcc:` is rejected. T-NTF-06-3 (unit) template rendering for every code in en and hi produces matching numbers in the text and HTML parts. T-NTF-06-4 (unit) the personal paragraph rejects `http`, `https` and `www`; the generated summary is not editable. T-NTF-06-5 (unit) recipient validation, deduplication and the 5-address cap. T-NTF-06-6 (unit) attachment resolution: export file attached; statement CSV generated and attached; > 10 MB dropped with the body note; an entity the sender cannot read → 404. T-NTF-06-7 (unit) quota counting, the 429 with `reset_at`, the 80 % warning raised once per day, and midnight reset. T-NTF-06-8 (unit) bounce webhook sets `email_opt_out_at`, marks the row `failed`, raises the notification; a soft bounce retries per NTF-02. T-NTF-06-9 (unit) opted-out party → `skipped` with `party_opted_out_email` and no SMTP call; re-enable requires `parties.party.write` and is audited. T-NTF-06-10 (unit) member email verification is required for export emails and invitations, single-use, 24 h, hashed. T-NTF-06-11 (unit) threading headers are stable across sends for the same entity. T-NTF-06-12 (API) send endpoints for each kind; drafts → 409 `document_not_shareable`. T-NTF-06-13 (API) permission matrix: staff → 403 everywhere; accountant can email statements, registers and exports but not receipts; only the owner can configure the channel. T-NTF-06-14 (API) preview returns subject, html, text and attachment metadata without sending. T-NTF-06-15 (API) credentials are never returned; a bad SMTP login → 400 on save. T-NTF-06-16 (component) composer states: chips, invalid address, no address, quota warning, opted-out disabled state, attachment label, preview dialog sandboxing. T-NTF-06-17 (component) HTML part snapshot with and without a logo; plain-text fallback contains the same total and link. T-NTF-06-18 (E2E, `locmem` backend) email a statement with CSV → assert one message-log row `sent`, the recipient list, the attachment name, the party timeline entry and the threaded `Message-ID`; then simulate a hard bounce and assert the opt-out, the failure row and the notification. T-NTF-06-19 (perf) 5,000-row statement CSV generated with constant memory and attached within the 300 ms render budget excluding I/O.

#### 22. Acceptance Criteria
- AC-1 (US-NTF-06-1) Given Ramesh Traders with an email address and a range of Apr–Sep 2026, when the accountant emails the statement with **Attach as CSV** on, then one `notifications_message_log(channel='email')` row exists with the recipient and attachment recorded, the email carries the subject "Statement · Ramesh Traders · Apr–Sep 2026 · Sharma Store", a plain-text and an HTML part with the same opening, debits, credits and closing figures, a **View statement** link to the public page, and a CSV of the entries.
- AC-2 (US-NTF-06-2) Given an issued tax invoice, when the owner emails it to the buyer's accounts address, then the body shows the invoice number, date, both GSTINs, taxable value, tax breakup and total, and a **View bill** button opening the public document page; a draft invoice cannot be emailed (409).
- AC-3 (US-NTF-06-3) Given an XLSX GST summary export requested with **Email it to me when ready**, when the export job completes, then the file arrives attached to the requesting member's verified address and the in-app `export_ready` notification is still raised.
- AC-4 (US-NTF-06-4) Given a tenant named Sharma Store on the deployment's domain, when any email is sent, then `From` reads "Sharma Store via DigiKhaato" on a controlled domain, `Reply-To` is the tenant's or the sender's address, and the tenant cannot set an arbitrary `From`.
- AC-5 (US-NTF-06-5) Given an API backend and a wrong address, when a hard bounce is received, then the log row becomes `failed` with "The address does not exist", `parties_party.email_opt_out_at` is set, an in-app notification with a **Fix address** action is raised, and further sends to that party are `skipped` until it is re-enabled.
- AC-6 (US-NTF-06-6) Given the composer, when the owner switches **Copy me** on and writes a 200-character personal line, then the email includes their address in Cc, the personal paragraph appears above the generated summary, and a personal line containing a URL is rejected before sending.
- AC-7 (US-NTF-06-7) Given any sent email, when it is opened in a plain-text client, then the text part carries the same figures and the same link as the HTML part, contains no tracking pixel, and the HTML part loads no remote resource other than the tenant's logo on the deployment's own domain.

#### 23. Dependencies
NTF-02 (adapter interface, template registry, message log, retries, kill switches, credential storage CCR-22), NTF-03 (public share links reused as email links, composer patterns, the no-URL rule for personal text), NTF-01 (bounce, quota and channel notifications; `export_ready`), LED-04 (statement data and CSV rows), SAL-08 (invoice/estimate/credit-note share), PAY-04 (receipt), PAY-06 (payment link), RPT-11 (async exports and `files_attachment(kind='export_file')`), PTY-01 (`parties_party.email`, `email_opt_out_at` CCR-45), PLT-01/PLT-02 (member email, verification CCR-46, invitations), PLT-05 (settings and quotas), WLB-03/WLB-06 (partner sending domain, branding, `doc_footer`), ADR-014 (no server PDF yet — links and CSV instead), ADR-021 (Django's built-in email backend, no new dependency), `UbShareSheet`, `UbDialog`, `UbDrawer`, `UbFilterTag`, `MLTextarea`, `MLProgress`, CCR-22/CCR-45/CCR-46.

#### 24. Future Enhancements
Server-side PDF (ADR-014 Phase 2) attaching the real invoice, statement and receipt instead of linking; a verified custom sending domain per tenant with guided SPF/DKIM setup once deliverability is proven at scale; scheduled monthly statement emails to a party's accounts contact built on LED-13's schedule engine; email delivery of reminders for B2B parties where the payer is an accounts department rather than a person (revisiting BR-11 with evidence); inbound email parsing so a supplier's bill emailed to a tenant address becomes a draft purchase bill (a large feature, likely Phase 3, and the only reason the product would ever receive mail); per-recipient contact roles on a party ("accounts", "owner", "purchase") so the right person gets the right document; a partner-level email template editor (WLB-07); and deliverability dashboards showing bounce and complaint rates per domain so a bad list is visible before the sending reputation suffers.
