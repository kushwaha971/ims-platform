# Part 17 (cont.) — FRDs: Sales (SAL), Reports (RPT), Help (HLP)

This chapter specifies the Sales, Reports and Help modules at implementation depth using the 24-section template of Part 17 §17.0.1. It is bound by Part 0 (canon), Part 21 (schema), Part 22 (API), Part 23 (design system) and the shared UI vocabulary of §17.0.2. Anything not derivable from those documents is listed under **Canon change requests** at the end of this file; nothing in the feature bodies introduces a table, column, endpoint or status silently.

Conventions used throughout this chapter:

- Frontend feature folders: `src/modules/DigiKhaato/features/sales/`, `…/features/reports/`, `…/features/help/`, each with `{api,components,hooks,redux,types,constants,view-model,validation}` per canon §0.10. Services are `api/salesService.ts`, `api/reportsService.ts`, `api/helpService.ts`; slices `redux/<x>Slice.ts`; thunks `redux/<x>Thunk.ts` created with `createAsyncThunk` (ADR-004, no TanStack Query).
- Backend apps: `sales`, `reports`, `help`, `tax`, `payments`, `inventory`, `ledger`; services in `sales/services/`, selectors in `sales/selectors.py`.
- Money maths: `Decimal`, `ROUND_HALF_UP`, 2 dp for money, 3 dp for quantity, 4 dp for unit price/cost (ADR-010). Client previews use `decimal.js-light` with the same rounding mode; the server result is authoritative (canon §0.11 rule 3).
- Print/PDF: React print components + `window.print()` (ADR-014). "PDF" in UI copy means the browser's Save-as-PDF of the print view; there is no server-rendered PDF at MVP.
- Background work: `jobs.enqueue(task, payload)` → `platform_job` row → `manage.py run_scheduler` (ADR-012). No Celery.
- Permissions: codenames from canon §0.9; roles `owner`, `admin`, `staff`, `accountant`.
- Error codes: from Part 22 §22.1 plus those introduced in §22.7 (`kind_not_allowed`).

---

## 17.9 Sales (SAL)

### SAL-01 — Estimate / quotation (kachha bill)

#### 1. Business Objective
Let a business hand a customer a priced, non-tax document ("kachha bill", quotation, proforma) before a sale is final, then convert it to a Tax Invoice or Bill of Supply without retyping. Success measures: ≥ 40 % of tenants that issue invoices also issue estimates within 60 days; conversion rate of `accepted` estimates ≥ 70 %; median time from estimate to converted invoice < 2 min of interaction time.

#### 2. User Personas
- **OW** (owner) — prices a job, sends the quote on WhatsApp, converts when the customer agrees.
- **ST** (staff/salesperson) — prepares quotes at the counter or in the field.
- **CU** (end customer) — receives the estimate via WhatsApp link or print.

#### 3. User Stories
1. `US-SAL01-1` As an owner I want to create an estimate with items, quantities and prices so that the customer sees the total before I commit stock or tax.
2. `US-SAL01-2` As staff I want to share the estimate on WhatsApp or print it so that the customer can approve it remotely.
3. `US-SAL01-3` As an owner I want to convert an accepted estimate into an invoice in one tap so that I do not retype lines.
4. `US-SAL01-4` As an owner I want to mark an estimate accepted, rejected or let it expire so that the estimates list reflects reality.
5. `US-SAL01-5` As an owner I want estimates to show a tax preview (if I am GST-registered) so that the customer knows the final payable.
6. `US-SAL01-6` As an accountant I want estimates to be clearly non-tax documents so that they never enter GST reports.

#### 4. Functional Requirements
1. `FR-1` The system shall create `sales_document` rows with `kind = 'estimate'` using the same line editor and totals engine as SAL-02 (BR-SAL02-1…12), with the tax preview computed but labelled "Estimated tax" on tenants with `gst_type ∈ {regular}` and suppressed (all tax columns 0) for `composition` and `unregistered` tenants.
2. `FR-2` Estimates shall be numbered from the `estimate` sequence (`platform_document_sequence.kind = 'estimate'`, default prefix `EST`) at the moment of leaving `draft` (transition to `sent`).
3. `FR-3` Estimates shall support statuses `draft`, `sent`, `accepted`, `rejected`, `expired`, `converted` (canon §0.7) with the transitions in §9.
4. `FR-4` `valid_until` shall default to `document_date + 15 days` (constant `ESTIMATE_DEFAULT_VALIDITY_DAYS = 15` in `features/sales/constants/estimates.ts`) and be editable.
5. `FR-5` A nightly runner task `sales.expire_estimates` shall set `sent → expired` where `valid_until < today` (tenant timezone).
6. `FR-6` `POST /sales/estimates/{id}/convert` shall create a new **draft** invoice (or bill of supply, per tenant `gst_type`) copying party, lines, discounts and notes, setting `converted_from_id` on the invoice and `converted_to_id` + status `converted` on the estimate, atomically.
7. `FR-7` Converting shall re-price nothing automatically; the draft invoice carries the estimate's prices and the user may edit before issuing. Item tax codes are refreshed from the item master at conversion time and a `warnings[]` entry is returned for each line whose tax code changed.
8. `FR-8` Estimates shall never post stock movements, ledger entries or payments.
9. `FR-9` Estimates shall be printable/shareable via SAL-03 templates with the document title "Estimate" (Hindi: "अनुमान / कच्चा बिल") and the footer line "This is not a tax invoice".
10. `FR-10` The estimates list shall show status tabs (all / draft / sent / accepted / expired / converted), date range, party filter and `meta.totals`.
11. `FR-11` An estimate that has left `draft` is not editable (canon defines no reopen action); changes after `sent` are made by **duplicating** (SAL-06) and marking the original `rejected`. The UI offers "Duplicate & edit" on non-draft estimates.
12. `FR-12` Deleting is allowed only for `draft` (`DELETE /sales/estimates/{id}`).

#### 5. Non-Functional Requirements
- Editor first interactive < 1.5 s on a 2019 mid-range Android over 4G; line add/remove recompute < 50 ms client-side.
- Works at 320 px width; single-column form; line editor in card mode below `md`.
- All strings in `en.json`/`hi.json` under `sales.estimate.*`.
- Print view renders without network after first load (fonts self-hosted).

#### 6. User Flow
Primary: Sales → Estimates → "New estimate" → select party (or walk-in name) → add lines (search/scan) → optional discount → check totals → "Save & share" → status `sent`, `UbShareSheet` opens (WhatsApp / copy link / print) → later "Mark accepted" → "Convert to invoice" → SAL-02 editor opens on the new draft.
Alternates: (a) "Save as draft" keeps `draft`, no number. (b) Customer declines → "Mark rejected" with optional note. (c) Validity passes → nightly job sets `expired`; user may still convert an expired estimate (allowed, BR-5). (d) Party has no mobile → WhatsApp option asks for a number (not saved to party unless ticked).

#### 7. UI Requirements
Screens: `app/(app)/sales/estimates/page.tsx` → `<EstimatesListPageContent/>`; `app/(app)/sales/estimates/new/page.tsx` and `[id]/page.tsx` → `<EstimateEditorPageContent/>`; `[id]/view` → `<EstimateDetailPageContent/>`.
Components: `UbPageShell`, `UbDataGrid` (list), `UbTabs`, `UbLineItemsEditor`, `UbTotalsPanel`, `UbAsyncCombobox` (party, item), `UbDateInput` (document date, valid until), `UbMoneyInput`, `UbQuantityInput`, `UbPercentInput`, `UbShareSheet`, `UbStatusBadge`, `UbConfirmDialog`.

| Field | Input | Notes |
|---|---|---|
| Party | `UbAsyncCombobox` with "Create party" inline | Optional; else `walk_in_name` text |
| Document date | `UbDateInput` | Default today; past allowed; future rejected |
| Valid until | `UbDateInput` | Default +15 d; must be ≥ document date |
| Lines | `UbLineItemsEditor` | Same columns as SAL-02 §7 |
| Document discount | `UbPercentInput` / `UbMoneyInput` toggle | |
| Notes / Terms | `MLTextarea` | Terms default from `documents.terms` |

Desktop (≥ 1024): two-column — editor left (8/12), `UbTotalsPanel` sticky right (4/12). Mobile: single column, totals collapsed into a bottom sheet bar showing grand total + "Save" button.
Keyboard: identical to SAL-02 §7 (F2 party, F4 item search, Ctrl+S save, Ctrl+Enter save & share).

#### 8. UX Requirements
- Title copy: "Estimate" / "अनुमान". Status badge tones: draft `default`, sent `info`, accepted `success`, rejected `error`, expired `warning`, converted `default` with link "Invoice INV/26-27/0042".
- Convert button is the single primary action on `accepted` estimates; on `sent`, primary is "Mark accepted".
- Conversion confirmation dialog copy: "Create invoice from EST/26-27/0007? Lines and prices are copied; you can edit before issuing." Hindi key `sales.estimate.convert.confirm`.
- Tax preview label: "Estimated GST (final on invoice)".
- Default terms appear read-only until tapped.

#### 9. States
| State | UI |
|---|---|
| Initial (new) | Editor with one empty line, party focus |
| Loading (open existing) | `UbSkeleton` form preset |
| Empty (list, first use) | `UbEmptyState` first-use: "No estimates yet" + "New estimate" + help link |
| Filtered-empty | "No estimates match" + "Clear filters" |
| Draft | Editable; "Save draft", "Save & share" |
| Sent | Read-only; actions: Share, Mark accepted, Mark rejected, Duplicate, Convert |
| Accepted | Read-only; primary Convert |
| Rejected / Expired | Read-only; Duplicate, Convert (expired only) |
| Converted | Read-only; banner linking to invoice |
| Processing (convert) | Button spinner "Creating invoice…" |
| Error | Inline banner with `request_id`; retry |

Transitions: `draft → sent` (share/print/“Mark sent”), `sent → accepted|rejected|expired`, `sent|accepted|expired → converted`, `draft → deleted`. `rejected` is terminal (duplicate to continue).

#### 10. Validation Rules
Yup schema `estimateSchema` (extends `salesDocumentBaseSchema`, `validation/estimateSchema.ts`):
- `document_date`: required, ≤ today → "Date cannot be in the future" (`validation_error`, `details.document_date`).
- `valid_until`: ≥ `document_date` → "Valid-until must be on or after the document date".
- `lines`: min 1 → "Add at least one item".
- Line rules as SAL-02 §10.
- `party_id` xor `walk_in_name` (non-empty ≤ 120) → "Choose a party or enter a name".

#### 11. Business Rules
1. `BR-1` Estimates never affect stock, ledger, payments or GST reports (excluded by `kind` in every selector).
2. `BR-2` Number allocated at `draft → sent`; voided/rejected numbers are never reused.
3. `BR-3` Tax preview uses the tax engine of SAL-02 with `document_date` rate lookup; for `composition`/`unregistered` tenants tax columns are forced to 0 and hidden.
4. `BR-4` Conversion copies `party_snapshot` fresh from the current party (not the estimate's snapshot) because the invoice snapshot must be taken at issue.
5. `BR-5` An `expired` estimate may be converted (business reality: the customer came back late); the created invoice gets today's date.
6. `BR-6` One estimate converts at most once: `converted_to_id NOT NULL` → 409 `document_not_draft` with message "Estimate already converted" (no new error code introduced).
7. `BR-7` `valid_until` default 15 days; tenant may change the default via settings key `sales.estimate_validity_days` (see Canon change requests).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View list/detail | `sales.estimate.read` | ✅ | ✅ | ✅ | ✅ |
| Create/edit/share/mark status | `sales.estimate.write` | ✅ | ✅ | ✅ | ❌ |
| Convert | `sales.estimate.write` + `sales.invoice.write` | ✅ | ✅ | ✅ | ❌ |
| Delete draft | `sales.estimate.write` (creator or owner/admin) | ✅ | ✅ | own | ❌ |

#### 13. Edge Cases
1. `EC-1` Item archived after estimate sent → conversion copies the line with `item_id` retained; issue-time check in SAL-02 blocks (`validation_error`, `details.lines[i].item_id: "Item is archived"`); UI offers "Replace item".
2. `EC-2` Party archived → conversion blocked with 409 `party_archived`? Not a canon code → use 400 `validation_error` `details.party_id: "Party is archived; restore first"`.
3. `EC-3` Tenant changed `gst_type` between estimate and conversion → invoice kind follows the **current** `gst_type`; preview totals may differ; warning shown.
4. `EC-4` Tax rate changed by law between dates → conversion uses invoice date rates; `warnings[]` lists changed rates.
5. `EC-5` Two users convert the same estimate concurrently → second gets 409 `document_not_draft`.
6. `EC-6` Estimate for walk-in (no party) → invoice draft is walk-in; SAL-07 rules apply at issue.
7. `EC-7` Sharing before saving → client saves first (draft → sent), then opens the share sheet.
8. `EC-8` `valid_until` earlier than today when marking sent → allowed but badge shows `expired` after nightly run; UI warns "Validity already passed".

#### 14. API Requirements
- `GET /sales/estimates?status=&party_id=&date_from=&date_to=&q=&ordering=&page=` → common document shape; `meta.totals { count, grand_total }`.
- `POST /sales/estimates` (draft), `PATCH /sales/estimates/{id}` (draft only, `version`), `DELETE /sales/estimates/{id}` (draft only).
- Status transitions via actions: `POST /sales/estimates/{id}/mark-sent`, `/mark-accepted`, `/mark-rejected` `{ note? }`. These action paths are not in canon §0.8 (which lists only `/convert`), and §22.1 forbids `PATCH status`, so they are requested in CR-SAL-1.
- `POST /sales/estimates/{id}/convert` → 201 `{ data: <draft invoice>, meta: { warnings[] } }`; 409 `document_not_draft` if already converted; 400 `kind_not_allowed` never (kind chosen by server).
- Share links: `POST /sales/estimates/{id}/share-links` (mirrors invoices, CR-SAL-1).
- Errors: 400 `validation_error`, 404 `not_found`, 403 `permission_denied`, 409 `stale_version`.

#### 15. Database Impact
Reads/writes `sales_document` (`kind='estimate'`, `valid_until`, `converted_to_id`, `status`, `number`, `fy_label`), `sales_document_line`, `platform_document_sequence` (`kind='estimate'`), `platform_audit_log`. Conversion writes a new `sales_document` (`kind` per tenant, `converted_from_id`). No new indexes (covered by `IX(tenant_id, kind, status, document_date DESC)`).

#### 16. Audit Requirements
`estimate.created`, `estimate.updated` (draft), `estimate.sent`, `estimate.accepted`, `estimate.rejected`, `estimate.expired` (actor_type `system`), `estimate.converted` (metadata `invoice_id`), `estimate.deleted`. Snapshot: totals + status (Part 21 §21.7).

#### 17. Notifications
No in-app notifications. WhatsApp share text (NTF-03), placeholders `{shop}`, `{party}`, `{number}`, `{total}`, `{valid_until}`, `{link}`:
- EN: `Namaste {party}, here is your estimate {number} from {shop} for ₹{total}, valid till {valid_until}. View: {link}`
- HI: `नमस्ते {party}, {shop} की ओर से आपका अनुमान {number} ₹{total} का है, {valid_until} तक मान्य। देखें: {link}`

#### 18. Analytics / Event Tracking
`ub.sales.estimate_created { lines, has_party, grand_total_bucket }`, `ub.sales.estimate_shared { channel }`, `ub.sales.estimate_status_changed { from, to }`, `ub.sales.estimate_converted { age_days, lines }`.

#### 19. Security
Tenant-scoped manager; cross-tenant id → 404. `walk_in_name` sanitised (strip control chars, ≤ 120). Share tokens 32 bytes random, stored hashed (`public_token_hash`), default expiry 30 days. Rate limit: share-link creation 60/hour/user.

#### 20. Performance
List uses `IX(tenant_id, kind, status, document_date DESC)`; `select_related('party')`, `prefetch_related('lines')` only on detail; list serializer omits lines. Nightly expiry job batched 500 rows per `UPDATE … WHERE id IN`.

#### 21. Testing
- `T-SAL01-1` unit: default `valid_until` = date + 15.
- `T-SAL01-2` unit: tax preview zero for composition tenant.
- `T-SAL01-3` API: number allocated on `mark-sent`, not on draft create.
- `T-SAL01-4` API: convert creates draft invoice with `converted_from_id`, estimate `converted`; second convert → 409.
- `T-SAL01-5` API: convert refreshes tax codes and returns warnings.
- `T-SAL01-6` API: no `StockMovement`/`LedgerEntry` rows after any estimate action.
- `T-SAL01-7` job: `expire_estimates` idempotent, tenant-timezone aware (IST midnight).
- `T-SAL01-8` component: `EstimateEditor` shows "Estimated GST" label for regular tenant, hides for composition.
- `T-SAL01-9` permission: accountant gets 403 on POST; staff can convert.
- `T-SAL01-10` E2E: create → share (wa.me URL contains encoded text) → accept → convert → issue invoice.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given a regular tenant, when I save an estimate with 2 lines, then totals show subtotal, "Estimated GST" and grand total, and no stock or ledger rows exist.
- `AC-2` (US-2) Given a `draft` estimate, when I tap Share → WhatsApp, then the estimate becomes `sent` with a number `EST/26-27/NNNN` and wa.me opens with the EN/HI text.
- `AC-3` (US-3) Given an `accepted` estimate, when I tap Convert, then a `draft` invoice opens with identical lines and `converted_from_id` set, and the estimate shows `converted`.
- `AC-4` (US-4) Given a `sent` estimate with `valid_until` yesterday, when the nightly job runs, then status is `expired`.
- `AC-5` (US-6) Given estimates exist, when the accountant opens the GST summary, then no estimate amounts are included.

#### 23. Dependencies
SAL-02 (line editor, tax engine), SAL-03 (print/share), SAL-06 (drafts/duplicate), PTY-01, INV-01, PLT-06 (`numbering`, `documents.terms`), NTF-03, runner (ADR-012).

#### 24. Future Enhancements
SAL-11 sales orders (backorders), estimate acceptance by customer on public page (SAL-14 extension), estimate templates per business type, e-signature.

---

### SAL-02 — Tax invoice / bill of supply

#### 1. Business Objective
Produce a GST-compliant Tax Invoice (regular tenants) or Bill of Supply (composition tenants) or a plain Invoice (unregistered tenants) at billing-counter speed, with every side effect — number, stock, ledger, payment — applied atomically so the invoice, the khata and the stock register never disagree. Measures: invoice creation p50 ≤ 40 s for a 3-line cash bill on desktop; zero tolerance for total mismatches between print, API and ledger (asserted by tests); < 0.5 % of issued invoices voided for "wrong tax".

#### 2. User Personas
- **OW** — issues invoices, sets numbering/terms, decides credit vs cash.
- **ST** — bills at the counter all day; keyboard and scanner driven on desktop, thumb driven on mobile.
- **AC** — reads issued invoices and relies on the tax split for GSTR-1/3B.
- **CU** — receives the invoice (SAL-03).

#### 3. User Stories
1. `US-SAL02-1` As staff I want to bill a walk-in customer in under a minute using keyboard and barcode scanner so that the queue moves.
2. `US-SAL02-2` As an owner I want a credit sale to a party to post to their khata automatically so that "you gave" is never forgotten.
3. `US-SAL02-3` As an owner I want the GST split (CGST/SGST or IGST) computed from my state and the customer's place of supply so that I never file wrong.
4. `US-SAL02-4` As staff I want tax-inclusive prices (MRP billing) to back-calculate the taxable value so that the customer pays exactly the shelf price.
5. `US-SAL02-5` As an owner I want a document-level discount and a round-off to the rupee so that cash handling is simple.
6. `US-SAL02-6` As an accountant I want every invoice to carry the Rule 46 mandatory fields so that the invoice is valid evidence.
7. `US-SAL02-7` As an owner under composition I want the system to force a Bill of Supply with the statutory wording so that I do not accidentally charge GST.
8. `US-SAL02-8` As an owner I want invoices numbered per financial year in a predictable series so that GSTR-1 Table 13 is trivial.
9. `US-SAL02-9` As an owner I want to be warned or blocked when a credit sale pushes a party over its credit limit.
10. `US-SAL02-10` As staff I want to take payment on the spot in multiple modes so that a ₹700 UPI + ₹300 cash bill is one document.

#### 4. Functional Requirements
1. `FR-1` The system shall create documents with `kind ∈ {invoice, bill_of_supply}` (`sales_document.kind`) chosen by the server from `platform_tenant.gst_type`: `regular → invoice`, `composition → bill_of_supply`, `unregistered → invoice` with **no tax** (all tax columns 0, tax section hidden, title "Invoice"). A client-supplied `kind` that conflicts returns 400 `kind_not_allowed`.
2. `FR-2` The system shall implement the line editor with columns: item (search by name/SKU/barcode, scan-paste), description (editable snapshot), HSN/SAC (from item, editable), qty (3 dp, unit from item), unit price (4 dp; toggle inclusive/exclusive per line, default from `inventory_item.tax_inclusive_selling`), line discount (percent or amount), tax code (default from item, override allowed), computed taxable value, tax amount and line total.
3. `FR-3` The system shall compute every amount server-side per BR-1…BR-12 and treat client totals as previews.
4. `FR-4` The system shall determine `is_inter_state = (tenant.state_code ≠ place_of_supply_state)` at issue and split tax into CGST+SGST (intra) or IGST (inter) per BR-5.
5. `FR-5` The system shall default `place_of_supply_state` to `party.state_code`, then `party.billing_address.state_code`, then `tenant.state_code`; for walk-in it is `tenant.state_code`. The field is editable before issue.
6. `FR-6` The system shall allocate `number` from `platform_document_sequence (tenant, kind, fy_label)` with `SELECT … FOR UPDATE` inside the issue transaction, at the point `BR-16` fixes — after the party and stock locks, immediately before the ledger entry — so the sequence row is held for the shortest span; `fy_label` is derived from `document_date` and `tenant.fy_start_month` (default April → `2026-27` for dates 2026-04-01…2027-03-31).
7. `FR-7` On issue the system shall, in one `transaction.atomic()` and in the order fixed by `BR-16`: snapshot party (`party_snapshot`, `party_gstin_snapshot`, `supplier_gstin_snapshot`); post `inventory_stock_movement` rows `movement_type='sale_out'`, `qty = −line.qty`, `unit_cost = current avg_cost` (snapshotted to `line.unit_cost_snapshot`) for each line whose item has `track_stock=true`; update `inventory_item_stock.on_hand`; allocate `number` (after the stock locks, per `BR-16` step 5); post one `ledger_entry` (`direction='debit'`, `entry_type='invoice'`, `amount=grand_total`, `source_type='sales_document'`) when `party_id` is set; record the optional immediate `payment` (PAY-01 rules) with allocation to this document; set `amount_paid/amount_due`; set status `issued` / `partially_paid` / `paid`; write audit; return the document.
8. `FR-8` If any line's item would go below zero and `inventory.allow_negative_stock = false`, the system shall return 409 `insufficient_stock` with `details.lines[i] = { item_id, requested, available }` and nothing shall be written.
9. `FR-9` The system shall enforce the credit-limit setting `ledger.credit_limit_mode` on credit sales (BR-13): `warn` → `meta.warnings[]`; `block` → 409 `credit_limit_exceeded` unless `override=true` is sent by an owner/admin.
10. `FR-10` Walk-in invoices (`party_id` NULL) shall require a `payment` whose Σ `mode_breakup` = `grand_total` (SAL-07); otherwise 400 `validation_error` `details.payment: "Walk-in sale must be paid in full"`.
11. `FR-11` The system shall support `due_on` (default `document_date + party.credit_days ?? sales.default_due_days`) for credit sales; `due_on` is NULL when `amount_due = 0` at issue.
12. `FR-12` `reverse_charge` flag shall be settable (default false) and printed as "Tax payable on reverse charge: Yes/No".
13. `FR-13` Drafts shall be saved via `POST /sales/invoices` and `PATCH … {version}`; `POST /sales/invoices?issue=true` and `POST /sales/invoices/{id}/issue` shall perform FR-7; `Idempotency-Key` is mandatory on both issuing calls.
14. `FR-14` The system shall allow issue for any past `document_date` within the current or the previous financial year (back-dated bills entered after year end); dates older than the previous FY return 400 `validation_error` `details.document_date`.
15. `FR-15` The system shall refresh item defaults (price, tax code, HSN) only when a line is created; existing draft lines keep their values until the user re-selects the item.
16. `FR-16` The system shall present a Rule 46 completeness check before issue (BR-15) and block issue for hard failures (missing supplier GSTIN on a Tax Invoice; missing HSN on a B2B line when tenant setting requires; missing party name) with `details` per field.
17. `FR-17` The system shall show and print the tax-rate history correctly: the rate used is `tax_rate.rate WHERE code = line.tax_code AND effective_from ≤ document_date AND (effective_to IS NULL OR effective_to ≥ document_date)`; a legacy code (`GST12`, `GST28`) on a document dated after `effective_to` fails validation with "Rate GST12 is not applicable on 2026-09-18; choose GST5 or GST18".
18. `FR-18` The desktop editor shall be fully operable by keyboard (§7) and accept barcode scanner input (keyboard-wedge) anywhere in the item search field.
19. `FR-19` The system shall persist per-line and per-document `discount_type/discount_value/discount_amount`, `round_off`, and all totals exactly as computed, and expose them in the common document JSON (§22.7).

#### 5. Non-Functional Requirements
- Issue call p95 ≤ 400 ms for ≤ 20 lines on the reference VPS; p95 ≤ 900 ms with immediate payment.
- Editor recompute of totals ≤ 16 ms for 50 lines (client, `decimal.js-light`).
- Barcode scan → line added ≤ 300 ms (`GET /items/lookup?barcode=` p95 ≤ 120 ms).
- Offline: draft kept in `localStorage` key `ub.sales.draft.<tenantId>.<uuid>` on every change (debounced 500 ms); restore prompt on reopen; issuing requires network.
- Accessibility: all inputs labelled; totals announced via `aria-live="polite"` on change; focus order matches visual order; touch targets ≥ 44 px on mobile.
- Localisation: `en`, `hi`; amounts `Intl.NumberFormat('en-IN')`; print uses the tenant locale, currency INR.

#### 6. User Flow
**Primary (counter, desktop, cash walk-in):** Sales → New bill (`N` from list, or `Alt+N` global) → cursor in item search → scan barcode → line added with qty 1 → type qty `2` `Enter` → scan next item → `F8` (payment) → payment sheet defaults full amount in `cash` → `Enter` → issue → print dialog opens (80 mm if `sales.default_template = thermal80`) → new blank bill (`Ctrl+N`).
**Credit sale to party (mobile):** FAB "+" → "Bill" → party picker (recent parties first) → add items via search → totals bar → "Save & issue" → sheet: "Received now?" (amount, modes) or "Full credit" → issue → success sheet: "INV/26-27/0042 issued · ₹1,772 added to Ramesh's khata" with Share / Print / New bill.
Alternates: (a) Stock short → dialog lists short items with available qty; options "Reduce qty" / "Allow negative" (only if setting on) / "Remove line". (b) Credit limit exceeded in `warn` → banner "Ramesh will owe ₹62,000 (limit ₹50,000)" with Continue; in `block` → owner/admin sees "Override" (reason captured in audit metadata), staff sees "Ask owner". (c) Party without state → POS defaults to tenant state; a hint "Intra-state assumed" is shown. (d) Draft autosave (SAL-06). (e) Duplicate invoice number race → sequence lock serialises; no user-visible effect.

#### 7. UI Requirements
Routes: `app/(app)/sales/invoices/page.tsx` → `<InvoicesListPageContent/>` (SAL-08); `…/new/page.tsx` and `[id]/edit/page.tsx` → `<InvoiceEditorPageContent/>`; `[id]/page.tsx` → `<InvoiceDetailPageContent/>` (view, actions, print preview).

**Desktop billing counter layout (≥ 1024 px):**
```
┌ UbPageHeader: "New Tax Invoice"  [Draft saved 12:41]      [Save draft] [Issue ▸ Ctrl+Enter] ┐
├───────────────────────────────────────────────┬──────────────────────────────────────────────┤
│ Party [F2] ▾  Ramesh Traders · GSTIN 27…      │ UbTotalsPanel (sticky)                        │
│ Date [F3] 18/09/2026   Due 03/10/2026         │ Subtotal            ₹1,692.14                 │
│ POS: Maharashtra (27) · Intra-state           │ Discount (₹50)         −₹50.00                │
│ Item search / scan [F4] ____________________  │ Taxable             ₹1,642.14                 │
│ ┌ UbLineItemsEditor ──────────────────────┐   │ CGST                   ₹65.02                 │
│ │ # Item        HSN  Qty Unit Rate  Disc │   │ SGST                   ₹65.03                 │
│ │   Taxable  GST%  Tax    Total   ⋯      │   │ Round-off              −₹0.19                 │
│ │ 1 Basmati…  1006 2 NOS 450.00 5%       │   │ ───────────────────────────────               │
│ │   829.74   5%   41.49  871.23          │   │ Grand total         ₹1,772.00  (ds-metric-md) │
│ │ …                                      │   │ [Payment F8]  Cash ₹1,772 · Due ₹0            │
│ └────────────────────────────────────────┘   │ Notes / Terms (collapsed)                      │
│ Doc discount [F6]  Reverse charge ☐            │ Rule 46 check ✓ 9/9                          │
└───────────────────────────────────────────────┴──────────────────────────────────────────────┘
```
- Line grid: `UbLineItemsEditor` (TanStack-free plain `MLTable*`; row = RHF `useFieldArray` item). Columns and widths (desktop): # 32 px · Item 28 % · HSN 80 px · Qty 90 px · Unit 64 px · Rate 110 px · Disc 90 px · Taxable 110 px · GST % 70 px · Tax 100 px · Total 110 px · actions 40 px. Numbers right-aligned `ds-num`.
- Per-line inclusive toggle is in the Rate cell's addon menu ("Incl. GST" / "Excl. GST").
- Row context menu (`⋯`): Edit description, Change tax, Remove (Del).

**Keyboard map (desktop):**
| Key | Action |
|---|---|
| `F2` | Focus party picker |
| `F3` | Focus date |
| `F4` / `/` | Focus item search (scanner target) |
| `Enter` in item search | Add highlighted item, focus its Qty |
| `Enter` in Qty/Rate/Disc | Move to next cell; on last cell of last row → item search |
| `Tab` / `Shift+Tab` | Next / previous cell |
| `↑` / `↓` | Move between rows in same column |
| `Alt+↑/↓` | Increment/decrement qty by 1 |
| `Delete` (row focused) | Remove row (undo toast 5 s) |
| `F6` | Document discount |
| `F7` | Toggle inclusive/exclusive on focused line |
| `F8` | Open payment sheet |
| `Ctrl+S` | Save draft |
| `Ctrl+Enter` | Issue (opens confirm if Rule 46 warnings exist) |
| `Ctrl+P` | Print/preview (after issue) |
| `Ctrl+N` | New bill (after issue) |
| `Esc` | Close sheet/popover; second `Esc` asks to discard unsaved draft |

Scanner: keyboard-wedge scanners type digits then `Enter`; the item search detects ≥ 8 chars typed in < 50 ms and calls `GET /items/lookup?barcode=`; miss → snackbar "No item with barcode 890…" + "Create item" (INV-01 drawer with barcode prefilled).

**Mobile layout (< 640 px):**
- Header: back, title "New bill", overflow (Save draft, Discard).
- Party card (tap → bottom-sheet picker with search and "Walk-in" chip). Below: date chip, POS chip.
- Lines as cards: name, HSN, `qty × rate` stepper row (− 1 +), discount chip, right-aligned line total; swipe-left to remove.
- Sticky bottom bar: "Total ₹1,772.00 · 3 items" + primary button "Issue". Tap total → totals sheet with breakup, doc discount, round-off toggle.
- Add item: FAB-like "+ Add item" button above bottom bar → full-screen search with camera scan button (INV-10, P2; disabled at MVP with hint).
- Payment sheet: amount (prefilled grand total), mode chips (Cash, UPI, Bank, Cheque, Card, Other), "Split" adds second row; reference field for UPI/cheque; "Full credit" secondary action (hidden for walk-in).

Components: `UbPageShell`, `UbPageHeader`, `UbLineItemsEditor`, `UbTotalsPanel`, `UbAsyncCombobox`, `UbMoneyInput`, `UbQuantityInput`, `UbPercentInput`, `UbDateInput`, `UbDrawer` (payment sheet), `UbConfirmDialog` (Rule 46 warnings), `UbStatusBanner` (credit limit), `UbSnackbar`, `UbQrCode` (on print), `UbHelpHint` on POS field.

Field table:
| Field | Input | Default | Constraint |
|---|---|---|---|
| Party | `UbAsyncCombobox` | none | xor walk-in |
| Walk-in name / mobile | `MLInput`, `UbPhoneInput` | blank | name ≤ 120; mobile E.164 optional |
| Document date | `UbDateInput` | today | ≤ today; ≥ start of previous FY |
| Due on | `UbDateInput` | date + credit days | ≥ document date |
| Place of supply | `MLSelect` (36 states/UTs) | party → tenant | required for tax docs |
| Reverse charge | `MLSwitch` | off | |
| Line item | `UbAsyncCombobox` | — | active item or free text (setting) |
| Qty | `UbQuantityInput` | 1 | > 0; decimals only if unit `allow_decimal` |
| Unit price | `UbMoneyInput` (4 dp) | item price | ≥ 0 |
| Inclusive | toggle | item flag | |
| Line discount | `UbPercentInput`/`UbMoneyInput` | none | 0–100 % or ≤ gross |
| Tax code | `MLSelect` from `GET /taxes/rates?as_of=` | item tax_code | active on date |
| Doc discount | percent/amount | none | ≤ subtotal |
| Round-off | `MLSwitch` | setting | |
| Notes / Terms | `MLTextarea` | `documents.terms` | ≤ 2,000 chars |
| Payment | sheet | full/none | Σ modes = amount |

#### 8. UX Requirements
- Copy keys `sales.invoice.*`. Titles: regular → "Tax Invoice" / "टैक्स इनवॉइस"; composition → "Bill of Supply" / "बिल ऑफ़ सप्लाई"; unregistered → "Invoice" / "बिल".
- Colour: amounts due from party in `error` tone in the success sheet ("₹1,772 added to khata"), payments received in `success`.
- Success sheet after issue is the only modal; it names the number, the ledger effect and offers Print / Share / New bill; auto-dismisses after 8 s on desktop when `sales.auto_print` is on (see CR-SAL-2).
- Destructive: removing a row shows an undo toast; discarding a draft asks once.
- Defaults come from settings; the user never types GSTIN, state or terms on an invoice.
- Composition footer wording is not editable: "Composition taxable person, not eligible to collect tax on supplies".
- Every warning (credit limit, Rule 46, rate change) is a banner with an action, never a blocking alert unless the rule is hard.

#### 9. States
| State | UI |
|---|---|
| Initial | Empty editor, focus item search (desktop) / party (mobile) |
| Loading | Skeleton form preset; totals skeleton |
| Draft (autosaved) | "Draft saved hh:mm" in header |
| Validating | Rule 46 panel updates live (✓/!) |
| Processing (issue) | Primary button spinner "Issuing…"; editor read-only |
| Success (issued) | Success sheet; document becomes read-only detail view |
| Partial (issued, part paid) | Status `partially_paid`, due badge |
| Completed (paid) | Status `paid`, no due |
| Failed (409 stock) | Dialog with short items; editor stays editable |
| Failed (409 credit limit) | Banner with Override (owner/admin) |
| Failed (network) | Toast "Couldn't issue. Draft kept." + Retry; idempotency key reused |
| Disabled | Staff without `sales.invoice.write` sees list only; Issue disabled when `lines.length = 0` |
| Void | Detail shows `void` badge, reason, reversing links (SAL-05) |

#### 10. Validation Rules
Yup: `invoiceSchema` (`validation/invoiceSchema.ts`) composed of `salesDocumentBaseSchema`, `invoiceLineSchema`, `paymentBreakupSchema` (shared with PAY-01) and using `amountValidation()`, `quantityValidation()`, `gstinValidation()` from `useValidationSchemas.ts`.

| Rule | Message (EN) | Code / details |
|---|---|---|
| ≥ 1 line | "Add at least one item" | `validation_error` `lines` |
| qty > 0; ≤ 3 dp; integer if unit disallows decimals | "Quantity must be a whole number for NOS" | `lines[i].qty` |
| unit_price ≥ 0, ≤ 4 dp | "Price cannot be negative" | `lines[i].unit_price` |
| line discount percent 0–100 | "Discount must be between 0 and 100 %" | `lines[i].discount_value` |
| line discount amount ≤ gross | "Discount cannot exceed the line amount" | idem |
| tax_code active on document_date | "Rate GST12 is not applicable on {date}" | `lines[i].tax_code` |
| doc discount ≤ subtotal | "Discount cannot exceed subtotal" | `discount_value` |
| document_date ≤ today | "Date cannot be in the future" | `document_date` |
| document_date ≥ previous FY start | "Date is too old for a new invoice" | `document_date` |
| due_on ≥ document_date | "Due date cannot be before the invoice date" | `due_on` |
| party xor walk-in | "Choose a party or bill as walk-in" | `party_id` |
| walk-in ⇒ payment full | "Walk-in sale must be paid in full" | `payment` |
| Σ mode_breakup = payment.amount | "Split amounts must add up to ₹{amount}" | `payment.mode_breakup` |
| payment.amount ≤ grand_total | "Payment cannot exceed the bill total" (excess must be a separate advance) | `payment.amount` |
| kind vs gst_type | "Tax invoice not allowed for unregistered business" | 400 `kind_not_allowed` |
| supplier GSTIN present for `invoice` on regular tenant | "Add your GSTIN in Business profile" | `non_field_errors` |
| party GSTIN valid (checksum) if present | "Invalid GSTIN" | `party_snapshot.gstin` |
| HSN 4/6/8 digits when present | "HSN must be 4, 6 or 8 digits" | `lines[i].hsn_sac` |
| POS state code valid | "Choose place of supply" | `place_of_supply_state` |
| version matches | — | 409 `stale_version` |
| status draft for PATCH/issue | — | 409 `document_not_draft` |

#### 11. Business Rules
The **tax algorithm** (`sales/services/tax_engine.py`, mirrored in `features/sales/view-model/taxEngine.ts`). All rounding `ROUND_HALF_UP`; `q2(x) = round(x, 2)`.

1. `BR-1` **Rate lookup.** `rate, cess = tax_rate(code, document_date)` (FR-17). Unregistered tenants and `bill_of_supply` force `rate = cess = 0` for every line, regardless of item tax code (code is still stored for later migration to regular).
2. `BR-2` **Line gross.** `gross = q2(qty × unit_price)` (qty 3 dp × price 4 dp, rounded once).
3. `BR-3` **Line discount.** `percent`: `line_discount = q2(gross × value / 100)`; `amount`: `line_discount = q2(value)` capped at `gross`. `net = gross − line_discount`.
4. `BR-4` **Line taxable (order: taxable → tax).**
   - Exclusive: `taxable_line = net`.
   - Inclusive: `taxable_line = q2(net / (1 + (rate + cess)/100))`; the inclusive tax is `net − taxable_line` (so price × qty is honoured to the paisa). *Example:* ₹118.00 incl. @ 18 % → `taxable = q2(118 / 1.18) = 100.00`, tax = 18.00 → CGST 9.00 + SGST 9.00.
   - `taxable_line` is the value stored as the line's pre-document-discount taxable value and summed into `subtotal`.
5. `BR-5` **Document discount allocation (proportional).** `subtotal = Σ taxable_line`. `discount_amount = q2(subtotal × value/100)` (percent) or `q2(value)` (amount), capped at `subtotal`. Each line's share `share_i = q2(discount_amount × taxable_line_i / subtotal)`; the rounding residual `discount_amount − Σ share_i` (always within ±0.0n) is added to the share of the line with the largest `taxable_line` (ties → lowest `line_no`). `taxable_i = taxable_line_i − share_i`. Stored: `sales_document_line.taxable_value = taxable_i` (post both discounts, which is the Rule 46 "taxable value after discount"); `sales_document.subtotal = Σ taxable_line`, `discount_amount`, `taxable_total = Σ taxable_i = subtotal − discount_amount`. The per-line shares are kept in `sales_document.meta.doc_discount_allocation = { "<line_no>": "25.26", … }` for print and audit (jsonb, no schema change).
6. `BR-6` **Line tax split.** Intra-state (`tenant.state_code = place_of_supply_state`): `tax_i = q2(taxable_i × rate/100)`; `cgst_i = q2(taxable_i × rate/200)`; `sgst_i = tax_i − cgst_i`; `igst_i = 0`. Inter-state: `igst_i = q2(taxable_i × rate/100)`; `cgst_i = sgst_i = 0`. `cess_i = q2(taxable_i × cess/100)`. `line_total_i = taxable_i + cgst_i + sgst_i + igst_i + cess_i`. For inclusive lines with a document discount the recomputed tax legitimately differs from `net − taxable_line`; the customer's payable is `line_total_i`.
7. `BR-7` **Document totals.** `cgst_total = Σ cgst_i`, likewise `sgst_total`, `igst_total`, `cess_total`; `grand_raw = taxable_total + cgst_total + sgst_total + igst_total + cess_total`.
8. `BR-8` **Round-off.** If `round_off_enabled`: `grand_total = round_half_up(grand_raw, 0)`; `round_off = grand_total − grand_raw` (∈ [−0.50, +0.49]). Else `grand_total = grand_raw`, `round_off = 0`. Default from setting `sales.round_off_default` (CR-SAL-2), default `true`.
9. `BR-9` **Invariants (asserted in tests and by a `CHECK`-like service assertion):** `Σ line_total_i = grand_raw`; `taxable_total + discount_amount = subtotal`; `grand_total = grand_raw + round_off`; `amount_due = grand_total − amount_paid − Σ sales_credit_application.amount`.
10. `BR-10` **Worked example (intra-state, Maharashtra → Maharashtra, doc discount ₹50, round-off on):**

| # | Item | Qty | Rate | Incl? | Line disc | Gross | taxable_line | Share of ₹50 | taxable_i | Rate | CGST | SGST | Line total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Basmati Rice 5 kg | 2 | 450.0000 | No | 5 % (45.00) | 900.00 | 855.00 | 25.26 | 829.74 | 5 % | 20.74 | 20.75 | 871.23 |
| 2 | Cooking Oil 1 L | 3 | 160.0000 | Yes | — | 480.00 | 457.14 | 13.51 | 443.63 | 5 % | 11.09 | 11.09 | 465.81 |
| 3 | Detergent 1 kg | 4 | 95.0000 | No | — | 380.00 | 380.00 | 11.23 | 368.77 | 18 % | 33.19 | 33.19 | 435.15 |

   `subtotal = 1,692.14`; `discount_amount = 50.00` (shares 25.26 + 13.51 + 11.23 = 50.00, residual 0); `taxable_total = 1,642.14`; `cgst_total = 65.02`; `sgst_total = 65.03`; `grand_raw = 1,772.19`; `round_off = −0.19`; `grand_total = 1,772.00`. Inter-state variant: IGST per line 41.49 / 22.18 / 66.38, `igst_total = 130.05`, same grand total. Line 2 check: 480 / 1.05 = 457.142857 → 457.14; line-1 split: 829.74 × 0.025 = 20.7435 → 20.74; 829.74 × 0.05 = 41.487 → 41.49; sgst = 41.49 − 20.74 = 20.75. The §22.7 example (855.00 @ 5 % → CGST 21.38, SGST 21.37) follows the same rule (21.375 → 21.38 half-up; 42.75 − 21.38 = 21.37).
11. `BR-11` **Intra/inter-state decision.** Evaluated at issue from `tenant.state_code` (from GSTIN positions 1–2 when GSTIN present; must match, else PLT-07 blocks saving the profile) and `place_of_supply_state`. Result stored in `is_inter_state`. For intra-state supplies in Union Territories without a legislature the print label is "UTGST" instead of "SGST" (Chandigarh 04, Dadra & Nagar Haveli and Daman & Diu 26, Lakshadweep 31, Andaman & Nicobar 35, Ladakh 38; Delhi 07, Puducherry 34 and J&K 01 have legislatures and print "SGST"). The label map `UTGST_STATE_CODES = ['04','26','31','35','38']` lives in `features/sales/constants/gst.ts`; the stored column remains `sgst`.
12. `BR-12` **Document kind by GST type.** `regular → invoice` (title "Tax Invoice"; tax lines rendered); `composition → bill_of_supply` (no tax lines; statutory footer; tax columns 0; composition levy is the tenant's liability, never on the document); `unregistered → invoice` with no tax (title "Invoice", GST section hidden). Mixed taxable/exempt lines to an unregistered recipient on a regular tenant print as a single "Tax Invoice" (invoice-cum-bill-of-supply wording is a P2 print option).
13. `BR-13` **Credit-limit check.** For credit sales (`party_id` set and `amount_due_after_payment > 0`): `projected = party.balance + amount_due_after_payment`; if `party.credit_limit IS NOT NULL AND projected > credit_limit`: mode `off` → nothing; `warn` → `meta.warnings[] += { code: "credit_limit_exceeded", limit, projected }`; `block` → 409 `credit_limit_exceeded` unless `override=true` and actor role ∈ {owner, admin} (override recorded in audit metadata `credit_limit_override: true`).
14. `BR-14` **FY numbering.** `fy_label = "YYYY-YY"` from `document_date` and `fy_start_month`; number string = `f"{prefix}/{fy_short}/{n:0{padding}d}"`, e.g. `INV/26-27/0042` (`fy_short = "26-27"`). Total length must be ≤ 16 chars, alphanumeric plus `/` and `-` (Rule 46): validation on the `numbering` setting rejects `prefix` longer than `16 − 7 − padding` (for padding 4 → prefix ≤ 5). Sequence rows are created lazily per FY with `next_number = 1`; numbers are never reused; void keeps the number. Default prefixes: `INV`, `BOS`, `EST`, `CN`, `DC`.
15. `BR-15` **Rule 46 checklist → columns.**

| Rule 46 requirement | Source column(s) | Hard/Soft |
|---|---|---|
| Supplier name, address, GSTIN | `platform_tenant.legal_name|name`, `address`, `gstin` → `supplier_gstin_snapshot` | Hard for `invoice` on regular |
| Consecutive serial ≤ 16 chars, unique per FY | `number`, `fy_label`, `platform_document_sequence` | Hard |
| Date of issue | `document_date` | Hard |
| Recipient name, address, GSTIN (if registered) | `party_snapshot.{name,address,gstin}`, `party_gstin_snapshot` | Name hard; GSTIN soft |
| Recipient name/address/state when unregistered and value ≥ ₹50,000 | `party_snapshot`, `walk_in_name`, `place_of_supply_state` | Soft warning when `grand_total ≥ 50000` and no address |
| HSN/SAC | `sales_document_line.hsn_sac` | Soft (hard when `sales.require_hsn_b2b` and party GSTIN present — CR-SAL-2) |
| Description | `description` | Hard |
| Quantity + UQC | `qty`, `unit_code` | Hard for goods |
| Total value | `gross` (qty × rate) printed per line | — |
| Taxable value after discount | `taxable_value` | Hard |
| Rate and amount of CGST/SGST/IGST/cess | `tax_rate`, `cgst`, `sgst`, `igst`, `cess` + totals | Hard on tax docs |
| Place of supply with state name (inter-state) | `place_of_supply_state`, `is_inter_state` | Hard |
| Delivery address if different | `party_snapshot.shipping_address` | Soft |
| Reverse charge flag | `reverse_charge` | Printed always |
| Signature | `platform_tenant.branding.signature_attachment_id` | Soft ("Authorised signatory" line printed regardless) |

16. `BR-16` **Atomic issue side effects (ordered).** The order below is both the behavioural order and the lock order; it obeys Part 20 §20.11.2 **L0** and **L4** exactly, and neither document refines the other. All of it is one `transaction.atomic()`.

    1. **Unlocked pre-check** (`check_availability`): validate items active, quantities, tax codes, and report any `insufficient_stock` line before anything is written. This read is **advisory** — it exists to give the user all the failing lines at once, and its result may be stale by the next step. It never decides whether the issue succeeds (Part 20 §20.11.2 **L4a**).
    2. Lock the **party** row (L1), when `party_id` is set; snapshot party (`party_snapshot`, `party_gstin_snapshot`, `supplier_gstin_snapshot`).
    3. Lock the **`inventory_item_stock`** rows for every stock line, **ordered by `item_id`** (L2). Under those locks, re-check availability — **this** check is authoritative and is the one `test_concurrent_issue_same_stock` proves — then post the `sale_out` movements (`qty = −line.qty`, `unit_cost` = the current `avg_cost` snapshot, so COGS is frozen at issue and the average is unchanged) and update `inventory_item_stock`.
    4. Compute totals (BR-1…8), recomputed server-side even if unchanged since draft.
    5. **Lock `platform_document_sequence` and allocate `number`** — last of the contended locks, and deliberately so. Everything that can fail has already failed, so the hottest row in the product is held for the tail of the transaction rather than its whole span (Part 20 §20.11.2 **L4**). The increment is inside the transaction, so a rollback returns the number.
    6. Ledger debit `amount = grand_total` (party sales only).
    7. Payment record (PAY-01 service) with `payments_allocation` to this document, ledger credit `payment_in`.
    8. Set `amount_paid`, `amount_due`, status; party `balance`, `last_activity_at`, `receivable_total` caches.
    9. Audit `invoice.issued`.
    10. Low-stock notification check (INV-07) after commit via `transaction.on_commit`.

    Any failure rolls back everything, including the number. A previous draft of this rule listed sequence allocation as step 1 while Part 20 §20.11.2 L4 asserted a different order in a parenthesis; the two are now one order, stated here and in L0, and no document overrides the other (Part 41 BE-05).
17. `BR-17` **Status at issue:** `amount_due = 0 → paid`; `0 < amount_paid < grand_total → partially_paid`; `amount_paid = 0 → issued`. `overdue` is applied only by the nightly job (`sales.refresh_overdue`) and never at issue.
18. `BR-18` **Ledger amount** is `grand_total` (including tax and round-off) — the customer owes the rounded payable.
19. `BR-19` **Services** (`item_type='service'`) never move stock; `unit_cost_snapshot` NULL.
20. `BR-20` **Free-text lines** (`item_id` NULL) are allowed only when `sales.allow_free_text_lines = true` (CR-SAL-2); they require `description`, `tax_code`, optional HSN, and never move stock.
21. `BR-21` **Walk-in mobile** (SAL-07) is stored on the document only; no party is created unless the user taps "Save as party".

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| List/view | `sales.invoice.read` | ✅ | ✅ | ✅ | ✅ |
| Create draft, edit draft, issue, record payment on issue | `sales.invoice.write` (+ `payments.payment.write` for the payment) | ✅ | ✅ | ✅ | ❌ |
| Override credit-limit block | `sales.invoice.write` AND role ∈ {owner, admin} | ✅ | ✅ | ❌ | ❌ |
| Allow negative stock on the fly | setting only (no per-action permission) | — | — | — | — |
| Void | `sales.invoice.void` (SAL-05) | ✅ | ✅ | ❌ | ❌ |
| Delete draft | `sales.invoice.write` (creator or owner/admin) | ✅ | ✅ | own | ❌ |

Module gate: `sales` in `tenant.enabled_modules` else 403 `module_disabled`. Plan gate: `max_invoices_per_month` → 403 `plan_limit_reached` at issue.

#### 13. Edge Cases
1. `EC-1` Item switched from exclusive to inclusive mid-line with a discount → discount recomputed on the inclusive gross; totals panel flashes the changed cells (140 ms).
2. `EC-2` Tenant GSTIN state ≠ `tenant.state_code` → blocked upstream (PLT-07); if legacy data disagrees, issue uses GSTIN state and logs a warning.
3. `EC-3` Party GSTIN present but party `gst_registration = unregistered` → treat as B2B (GSTIN wins), `warnings[]` "Party marked unregistered but has GSTIN".
4. `EC-4` Inclusive price with 0 % rate → taxable = net; no tax.
5. `EC-5` Document discount 100 % → all taxable 0; grand total 0; issue allowed (free sample) but a payment of 0 is not created; status `paid` (amount_due 0). Ledger entry skipped because `amount > 0` constraint; audit notes `zero_value: true`.
6. `EC-6` Qty with 3 dp on integer unit → blocked client and server.
7. `EC-7` Two staff issue simultaneously → sequence lock serialises; both succeed with consecutive numbers.
8. `EC-8` Network drop after server commit → client retries with same `Idempotency-Key` → replay 201 with `Idempotent-Replayed: true`; no duplicate.
9. `EC-9` Same key, edited body → 409 `idempotency_conflict`; client generates a new key only after the user explicitly re-issues.
10. `EC-10` `document_date` in previous FY (e.g. 31/03/2026 entered on 02/04/2026) → number from the `2025-26` sequence; allowed (FR-14).
11. `EC-11` Date backdated before a rate change (e.g. 15/09/2025 with GST12) → allowed; rate from history.
12. `EC-12` Party has `credit_days` but invoice fully paid → `due_on` NULL.
13. `EC-13` Payment > grand_total → rejected; user records the surplus as an advance via PAY-01 afterwards.
14. `EC-14` Item `track_stock=false` (goods not tracked) → no movement; no stock check.
15. `EC-15` Negative stock allowed → `on_hand_after` negative; low-stock notification fires once.
16. `EC-16` Line qty edited to 0 → row removed after confirmation.
17. `EC-17` Plan limit reached → 403 `plan_limit_reached` before any write; UI shows upgrade hint (partner support contact).
18. `EC-18` Composition tenant selects an item with `GST18` → stored code kept, rate forced 0, no tax shown; a subtle hint "Composition: GST not charged".
19. `EC-19` Reverse charge on → tax computed and printed as usual with flag "Yes"; ledger amount unchanged (business decision; RCM liability sits with recipient, documented for GSTR-3B 3.1(d) in RPT-07).
20. `EC-20` POS = tenant state but party address in another state → intra-state (POS wins); hint shown.

#### 14. API Requirements
- `POST /sales/invoices` body per §22.7: `kind?`, `party_id | walk_in_name, walk_in_mobile?`, `document_date`, `due_on? | credit_days?`, `place_of_supply_state?`, `reverse_charge?`, `lines[] { item_id?, description?, hsn_sac?, qty, unit_code?, unit_price?, tax_inclusive?, discount_type?, discount_value?, tax_code? }`, `discount_type?`, `discount_value?`, `round_off_enabled?`, `notes?`, `terms?`, `payment? { payment_date?, mode_breakup[] { mode, amount, reference? }, note? }`, `override?` (credit limit). Query `?issue=true`. Headers `Idempotency-Key` (required with `issue=true`). Responses 201 document (+ `meta.warnings[]`), 400 `validation_error` / `kind_not_allowed`, 403 `permission_denied` / `module_disabled` / `plan_limit_reached`, 409 `insufficient_stock` / `credit_limit_exceeded` / `idempotency_conflict`.
- `PATCH /sales/invoices/{id}` — draft only; body any of the above plus `version`; 409 `document_not_draft`, `stale_version`.
- `POST /sales/invoices/{id}/issue` `{ payment?, override? }` — 409s as above; 200 document.
- `GET /sales/invoices/{id}?include=lines,payments` — full shape.
- `DELETE /sales/invoices/{id}` — 204 draft only; else 409 `document_not_draft`.
- `GET /items/lookup?barcode=`, `GET /items?q=`, `GET /parties?q=`, `GET /taxes/rates?as_of=` used by the editor.
- Response additions within the common shape: `meta.warnings[] { code, message, details }`, `meta.rule46 { passed: bool, issues[] }` on draft save (computed, not stored).

Frontend: `salesService.ts` → `createInvoice(body, {issue, idempotencyKey})`, `updateInvoice(id, body)`, `issueInvoice(id, body, idempotencyKey)`, `getInvoice(id)`, `deleteInvoice(id)`; thunks in `redux/salesThunk.ts`: `saveInvoiceDraft`, `issueInvoice`, `fetchInvoice`, `deleteInvoiceDraft`; slice `redux/invoiceEditorSlice.ts` (state: `document`, `lines[]`, `totalsPreview`, `warnings`, `rule46`, `saving`, `issuing`, `error`, `idempotencyKey`); selectors `selectTotalsPreview`, `selectRule46`. `APIPaths.ts` keys `SALES_INVOICES`, `SALES_INVOICE(id)`, `SALES_INVOICE_ISSUE(id)`.

#### 15. Database Impact
Writes: `sales_document` (all monetary columns, `kind`, `number`, `fy_label`, `status`, `party_snapshot`, `*_gstin_snapshot`, `place_of_supply_state`, `is_inter_state`, `reverse_charge`, `due_on`, `issued_at`, `meta.doc_discount_allocation`, `version` — *note:* `version` appears in §22.1/§22.7 but not in §21.3.7's column list; see CR-SAL-3), `sales_document_line` (all), `platform_document_sequence` (`next_number`), `inventory_stock_movement`, `inventory_item_stock`, `ledger_entry`, `parties_party` (caches), `payments_payment`, `payments_allocation`, `platform_audit_log`. Reads: `tax_rate`, `tax_hsn`, `inventory_item`, `inventory_unit`, `platform_tenant`, `platform_tenant_setting`. Indexes: existing ones suffice; the idempotency store is `platform_idempotency_key`? Not in Part 21 — §22.1 says the server stores key + body hash for 24 h; see CR-SAL-3.

#### 16. Audit Requirements
`invoice.draft_created`, `invoice.draft_updated` (before/after totals), `invoice.issued` (after: number, totals, status, `credit_limit_override`, `warnings`), `invoice.draft_deleted`, `payment.recorded` (from PAY-01 service), `ledger.entry.created`, `stock.movement.created` (batched metadata `document_id`). Actor = issuing user; `metadata.request_id`, `idempotency_key`.

#### 17. Notifications
- In-app: none for the issuer. Low stock (INV-07) if crossing reorder point.
- Party SMS (LED-08, config-gated): template `sale_credit` — EN `₹{amount} bill {number} added at {shop}. Balance ₹{balance}.` / HI `{shop} पर ₹{amount} का बिल {number} जोड़ा गया। बाकी ₹{balance}।` — enqueued via `notifications` adapter only when provider configured and `party.sms_opt_in`.
- WhatsApp share handled by SAL-03.

#### 18. Analytics / Event Tracking
`ub.sales.invoice_draft_saved { lines, autosave }`, `ub.sales.invoice_issued { kind, lines, is_inter_state, has_party, paid_now: full|partial|none, modes[], grand_total_bucket, used_scanner, used_keyboard_shortcuts, device: mobile|desktop, duration_ms }`, `ub.sales.invoice_issue_failed { error_code }`, `ub.sales.credit_limit_warning { mode, overridden }`, `ub.sales.rule46_warning { issues[] }`.

#### 19. Security
Tenant scoping on every query (item, party, sequence). Idempotency keys are per tenant. `notes/terms/description` HTML-escaped on print (React escapes by default; no `dangerouslySetInnerHTML`). Walk-in mobile is PII: masked in lists (`+91 98••• ••210`), full in detail for `sales.invoice.read`. Rate limit 600 req/min general; issue is not additionally limited. Server ignores client totals (canon §0.11-3). Override flag honoured only for owner/admin (checked from JWT `rol`, re-validated against membership).

#### 20. Performance
Single round trip for issue; item and party lookups debounced 300 ms with abortable Axios requests; `GET /taxes/rates` cached in `taxSlice` for the session (invalidated daily). Server: `select_for_update` only on the sequence row and the affected `inventory_item_stock` rows (ordered by `item_id` to avoid deadlocks); ≤ 6 + 2·lines queries asserted with `assertNumQueries` in tests. Line editor renders rows with `memo`, per-row RHF `Controller`.

#### 21. Testing
- `T-SAL02-1` unit: `tax_engine` inclusive 118 @18 → 100/9/9.
- `T-SAL02-2` unit: worked example BR-10 exact figures (intra and inter).
- `T-SAL02-3` unit: 855 @5 → 21.38/21.37.
- `T-SAL02-4` unit: doc discount residual lands on largest line; Σ shares = discount.
- `T-SAL02-5` unit: round-off bounds and sign; disabled → 0.
- `T-SAL02-6` unit: rate history — GST12 on 2025-09-15 valid, on 2025-09-22 invalid.
- `T-SAL02-7` unit: fy_label for 31/03/2026 → `2025-26`, 01/04/2026 → `2026-27`; number ≤ 16 chars.
- `T-SAL02-8` API: composition tenant + `kind=invoice` → 400 `kind_not_allowed`; omitted kind → `bill_of_supply`, all taxes 0.
- `T-SAL02-9` API: issue with stock 1, qty 2 → 409 `insufficient_stock`, no rows written, sequence unchanged.
- `T-SAL02-10` API: issue credit sale → `LedgerEntry(debit, grand_total)`, `StockMovement(sale_out)`, party balance; recalc commands agree.
- `T-SAL02-11` API: issue with payment 700 UPI + 300 cash on 1,000 → status `paid`, allocation 1,000, ledger debit 1,000 + credit 1,000.
- `T-SAL02-12` API: walk-in without payment → 400; with partial → 400.
- `T-SAL02-13` API: credit limit `warn` → warnings; `block` → 409; owner `override` → 201 with audit flag; staff override ignored → 409.
- `T-SAL02-14` API: idempotent replay; conflict on changed body.
- `T-SAL02-15` API: PATCH on issued → 409 `document_not_draft`; stale version → 409.
- `T-SAL02-16` API: `is_inter_state` derived correctly for POS ≠ tenant state; IGST populated.
- `T-SAL02-17` API: plan limit → 403 before writes.
- `T-SAL02-18` component: keyboard map (F4 focus, Enter adds, Delete removes with undo).
- `T-SAL02-19` component: scanner burst detection triggers lookup, miss opens create-item.
- `T-SAL02-20` component: mobile totals sheet shows breakup; issue button disabled with zero lines.
- `T-SAL02-21` permission: accountant POST → 403; staff issue → 201.
- `T-SAL02-22` E2E: counter flow scan → qty → F8 → Enter → print dialog invoked (`window.print` spied).
- `T-SAL02-23` property test: random invoices (≤ 20 lines) satisfy BR-9 invariants.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given a desktop with a scanner, when I scan two barcodes, press F8 and Enter, then an invoice is issued with 2 lines, status `paid`, and the print dialog opens within 2 s.
- `AC-2` (US-2) Given party Ramesh (balance ₹0), when I issue a ₹1,772 credit invoice, then Ramesh's balance is ₹1,772 and his khata shows an `invoice` entry linking to INV/26-27/NNNN.
- `AC-3` (US-3) Given tenant state 27 and POS 24, when I issue, then `is_inter_state = true`, IGST totals equal Σ line IGST and CGST/SGST are 0.00.
- `AC-4` (US-4) Given an inclusive line ₹118 @ 18 %, when totals compute, then taxable 100.00, CGST 9.00, SGST 9.00, line total 118.00.
- `AC-5` (US-5) Given the BR-10 invoice, when issued, then grand total is ₹1,772.00 with round-off −0.19 and ledger debit 1,772.00.
- `AC-6` (US-6) Given a regular tenant without GSTIN, when I try to issue a Tax Invoice, then issue is blocked with "Add your GSTIN in Business profile".
- `AC-7` (US-7) Given a composition tenant, when I issue, then the document is a Bill of Supply with zero tax and the statutory footer.
- `AC-8` (US-8) Given numbering prefix `INV`, padding 4, when the first invoice of FY 2026-27 is issued, then its number is `INV/26-27/0001` and the next is `0002` even if the first is voided.
- `AC-9` (US-9) Given `ledger.credit_limit_mode = block` and Ramesh limit ₹50,000 balance ₹49,000, when staff issues a ₹1,772 credit invoice, then 409 `credit_limit_exceeded`; when the owner issues with override, then 201 and the audit row records the override.
- `AC-10` (US-10) Given a ₹1,000 bill, when I pay ₹700 UPI + ₹300 cash, then one payment with two `mode_breakup` rows is recorded and the invoice is `paid`.

#### 23. Dependencies
PLT-03/06/07 (gst_type, state, GSTIN, numbering, defaults), PTY-01/06, INV-01/05/06/07, LED-10, PAY-01/02, tax seed (`tax_rate`, `tax_hsn`), SAL-03 (print), SAL-05 (void), SAL-06 (drafts), SAL-07 (walk-in), SAL-08 (list), runner (`sales.refresh_overdue`).

#### 24. Future Enhancements
SAL-09 delivery challan, SAL-10 recurring, SAL-12 e-invoice (IRN, signed QR; the `irn*` columns exist), SAL-13 e-way bill, INV-10 camera scanning, INV-13 price lists per party, TDS-deducted-by-customer entry type (research §C.1), invoice-cum-bill-of-supply print variant, multi-GSTIN branches.

---
### SAL-03 — Invoice PDF, print & share

#### 1. Business Objective
Give every issued document a printable, shareable rendering — A4 for wholesale/B2B and 80 mm thermal for counters — branded per tenant, carrying a UPI QR so the customer can pay from the paper, and shareable on WhatsApp in one tap. Measures: ≥ 80 % of issued invoices are printed or shared within 5 minutes of issue; print view first paint ≤ 1 s on desktop; zero layout defects across Chrome/Edge/Android Chrome print engines (visual regression suite).

#### 2. User Personas
- **OW** — configures template defaults, branding, terms; shares B2B invoices.
- **ST** — prints thermal receipts at the counter; shares on WhatsApp.
- **CU** — receives a link or paper; pays via QR.

#### 3. User Stories
1. `US-SAL03-1` As staff I want the print dialog to open automatically after issuing so that the receipt is in the customer's hand without extra taps.
2. `US-SAL03-2` As an owner I want an A4 invoice with my logo, GSTIN, bank details and signature so that B2B customers accept it for ITC.
3. `US-SAL03-3` As staff I want a compact 80 mm receipt so that thermal printers produce a readable slip.
4. `US-SAL03-4` As a customer I want a UPI QR on the invoice so that I can pay the exact amount immediately.
5. `US-SAL03-5` As staff I want to send the invoice on WhatsApp with a link the customer can open on any phone.
6. `US-SAL03-6` As an owner I want a "Save as PDF" that works offline so that I can email invoices myself.

#### 4. Functional Requirements
1. `FR-1` The system shall render documents through React print components `InvoicePrintA4` and `InvoicePrintThermal80` in `features/sales/components/print/`, sharing `PrintDocumentFrame` (page setup, fonts, tokens) and data from the common document JSON (§22.7). The same components render estimates, bills of supply and credit notes by `kind`.
2. `FR-2` Printing shall use `window.print()` on a dedicated print route `app/(print)/print/sales/[kind]/[id]/page.tsx?template=a4|thermal80` opened in a hidden iframe (desktop) or new tab (mobile), with `@page` CSS for size (`A4` / `80mm auto`) and margins.
3. `FR-3` The default template shall come from setting `sales.default_template` (`a4|thermal80`, CR-SAL-2); the detail page offers both.
4. `FR-4` The system shall embed a UPI QR (`UbQrCode`) when `documents.show_upi_qr = true` and `tenant.upi_vpa` is set: dynamic `upi://pay?pa=&pn=&am=<amount_due>&cu=INR&tn=<number>&tr=<document id short>` for documents with `amount_due > 0`; static (`pa`, `pn` only) otherwise; all values URL-encoded (research §C.2).
5. `FR-5` `POST /sales/invoices/{id}/share-links` shall create a public token (`public_token_hash`) and return `{ url: https://<host>/d/<token>, expires_at }`; `GET /public/d/{token}` returns the document JSON for the public page; the public page renders `InvoicePrintA4` read-only plus a "Pay via UPI" intent button (mobile).
6. `FR-6` WhatsApp share shall open `https://wa.me/91XXXXXXXXXX?text=<encoded>` with the template in §17 in the tenant's locale; when the party has no mobile, a number prompt appears; the share is logged to `notifications_message_log` with `channel='whatsapp'`, `status='sent'`, `template_code='invoice_share'` (manual deep link; no delivery receipt).
7. `FR-7` "Download PDF" shall trigger the browser print dialog with the hint "Choose 'Save as PDF'"; the filename hint is set via `document.title = "<number>"`.
8. `FR-8` The system shall increment `meta.print_count` on the document each time the print route is invoked for an issued document (`POST /sales/invoices/{id}/print-events`? Not canonical — instead the print route calls `PATCH`? Forbidden for issued documents). Decision: print count is tracked client-side as an analytics event only (`ub.sales.document_printed`); `meta.print_count` remains reserved for Phase 2 server-side PDF (CR-SAL-4 notes this).
9. `FR-9` Draft documents shall print with a diagonal "DRAFT — not valid" watermark and no number; void documents print with a "VOID" watermark and the void reason.
10. `FR-10` The A4 template shall support 1–n pages: the line table repeats its header on each page, totals and tax summary appear only on the last page, page footer shows "Page x of y" via CSS counters.
11. `FR-11` The thermal template shall be printer-agnostic (no ESC/POS at MVP): 80 mm paper, 72 mm printable width, monospaced numerals, 42-character line budget; a `58mm` variant is Phase 2.
12. `FR-12` Tenant branding (`platform_tenant.branding`: logo, `primary_hex`, `doc_header`, `doc_footer`, signature) shall apply to A4; thermal uses logo (monochrome) + header text only.
13. `FR-13` `GET /sales/invoices/{id}.pdf` shall not be implemented server-side at MVP (ADR-014); `pdf_url` in the document JSON shall point to the print route and `pdf_attachment_id` remains NULL. See CR-SAL-4.
14. `FR-14` The share sheet (`UbShareSheet`) shall offer: WhatsApp, Copy link, Print, Save as PDF, SMS (config-gated, LED-08 adapter, template `invoice_share_sms`).

#### 5. Non-Functional Requirements
- Print route renders from Redux cache when available (no refetch) and from `GET /sales/invoices/{id}` otherwise; ≤ 1 s to `window.print()`.
- Fonts self-hosted; QR generated locally (`UbQrCode`, tiny generator, no external service).
- Public page works without login, `noindex`, ≤ 150 kB JS.
- Print CSS avoids `position: fixed` (Chrome duplicates on multipage) and uses `break-inside: avoid` on rows.
- Colour: A4 uses primary hex only for the header band and rules; thermal is pure black.
- Hindi: labels bilingual on A4 when tenant locale `hi` ("Taxable value / कर योग्य मूल्य"); Devanagari fallback font embedded.

#### 6. User Flow
Issue → success sheet → "Print" (default template) → print dialog → done. Or "Share" → `UbShareSheet` → WhatsApp → number confirm → wa.me opens → back. Or detail page → "Print ▾" → A4 / Thermal / Save as PDF. Public link → customer opens → sees invoice → taps "Pay ₹1,772 via UPI" → UPI app → returns (no callback at MVP; owner records payment PAY-01).

#### 7. UI Requirements
**A4 template anatomy (`InvoicePrintA4`, 210 × 297 mm, margins 12 mm):**
1. Header band: logo (max 40 × 14 mm) left; tenant `legal_name|name`, address, phone, email, GSTIN (`ds-mono`), `doc_header` text right; title centre-right: "TAX INVOICE" / "BILL OF SUPPLY" / "INVOICE" / "ESTIMATE" / "CREDIT NOTE"; sub-caption "Original for recipient" (tax docs).
2. Meta grid (2 × 3): Invoice no. · Date · Due date | Place of supply (name + code) · Reverse charge Yes/No · Reference (estimate/against number).
3. Party blocks: "Bill to" (name, address, GSTIN, state, mobile) and "Ship to" (when shipping address differs).
4. Line table columns: # · Description (HSN/SAC beneath in caption) · Qty · Unit · Rate · Disc · Taxable value · GST % · CGST · SGST/UTGST · IGST · Cess · Total. Inter-state hides CGST/SGST columns; intra-state hides IGST; bill of supply/unregistered hide all tax columns and show # · Description · Qty · Unit · Rate · Disc · Amount.
5. Totals block (right, 70 mm): Subtotal · Discount · Taxable total · CGST · SGST · IGST · Cess · Round-off · **Grand total** (`ds-metric-sm`) · Amount paid · Balance due · "Amount in words" (Indian numbering: "One thousand seven hundred seventy-two rupees only").
6. Tax summary by rate (left, mirrors GSTR requirement): Rate · Taxable · CGST · SGST · IGST · Cess — rows per distinct `tax_code`.
7. Payment block: UPI QR 28 mm + VPA text; bank details (account, IFSC) from `bank_details`.
8. Footer: terms (`terms`), notes, composition wording (if `bill_of_supply`), `doc_footer`, signature image + "Authorised signatory", "Page x of y", "Generated by <app_name>" (white-label `branding.app_name`).

**80 mm thermal anatomy (`InvoicePrintThermal80`, width 72 mm, font 11 px mono numerals):**
1. Centre: logo (mono, ≤ 20 mm) · shop name (bold) · address (2 lines) · phone · GSTIN.
2. Title line: `TAX INVOICE` · `No: INV/26-27/0042` · `Date: 18/09/26 12:41`.
3. Party line: `To: Ramesh Traders 98••••3210` (or `Walk-in`).
4. Lines: row 1 `Basmati Rice 5kg` ; row 2 `2 NOS x 450.00   -5%   871.23` (qty × rate, discount, total right-aligned); HSN and GST% in a caption row when tax doc.
5. Dashed rule; Subtotal · Discount · Taxable · CGST · SGST (or IGST) · Round-off · **TOTAL** (double-height) · Paid (mode) · Balance.
6. Tax summary compact: `GST 5%: 1273.37 | 31.83 | 31.84`.
7. QR 32 mm centre + `Scan to pay ₹1,772.00` + VPA.
8. Footer: `Thank you! / धन्यवाद`, terms (first 2 lines), composition wording if applicable, app name.

Components: `PrintDocumentFrame` (sets `<html data-print-template>`, injects `@page`), `PrintLineTable`, `PrintTotals`, `PrintTaxSummary`, `PrintPartyBlock`, `AmountInWords` (util `src/utils/amountInWords.ts`, EN + HI), `UbQrCode`, `UbShareSheet`. Detail page actions: `MLButton` "Print" (split button with template menu), "Share" (`UbShareSheet`).

#### 8. UX Requirements
- Print after issue is automatic only if `sales.auto_print` (CR-SAL-2) is on; otherwise the success sheet's primary action is "Print".
- Copy: "Print" / "प्रिंट", "Share on WhatsApp" / "WhatsApp पर भेजें", "Save as PDF" / "PDF सेव करें", "Copy link" / "लिंक कॉपी करें".
- The share sheet shows the link expiry ("Link valid 30 days") and a "Regenerate" action.
- On thermal, avoid grey; ensure ≥ 11 px text.
- Never show the app's own colours on a bill of supply beyond the header band; statutory text is not stylised.

#### 9. States
| State | UI |
|---|---|
| Loading print data | Blank page with skeleton; `window.print()` deferred until fonts ready (`document.fonts.ready`) |
| Ready | Print dialog open |
| Draft | Watermark DRAFT, no QR |
| Issued, unpaid | QR dynamic with `am` = amount due |
| Paid | Stamp "PAID" (outline), QR static or hidden per setting |
| Void | Watermark VOID + reason |
| Share link created | Sheet shows URL, copy confirmation toast |
| Share link expired (public) | Public page: "This link has expired. Ask the business for a new one." |
| Error (fetch) | "Couldn't load invoice" + retry + request id |
| SMS not configured | SMS option disabled with hint |

#### 10. Validation Rules
- Share link `expires_in_days` 1–90 (default 30) → "Expiry must be 1–90 days".
- WhatsApp number: 10-digit Indian mobile after +91 normalisation → "Enter a valid 10-digit mobile".
- UPI QR requires valid VPA pattern `^[\w.\-]{2,256}@[a-zA-Z]{2,64}$` on tenant profile (validated in PLT-07); print omits QR if invalid.

#### 11. Business Rules
1. `BR-1` Template selection: `?template=` param → setting default → `a4`.
2. `BR-2` UPI amount = `amount_due` at render time; 0 due → static QR (or hidden if `documents.show_upi_qr_when_paid = false`? Not a canon key — omitted; behaviour: static QR shown).
3. `BR-3` `tn` (note) = document number, ≤ 50 chars; `tr` = first 12 chars of document id hex (reconciliation key surfaced on the receipt).
4. `BR-4` Public token: 32 random bytes, base64url, stored as SHA-256 in `public_token_hash`; one active token per document (regenerate replaces; old link dies).
5. `BR-5` Estimates print "This is not a tax invoice"; bills of supply print the composition sentence; unregistered invoices omit GST column and print "Not a GST invoice"? **No** — they print no statement; they simply carry no tax fields.
6. `BR-6` Amount in words uses Indian grouping (lakh/crore) and "paise" when non-integer.
7. `BR-7` Copies: A4 offers "Original for recipient" / "Duplicate for transporter" / "Triplicate for supplier" as a print-dialog copy count; captions differ per copy (CSS counter over repeated component).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Print / Save PDF / view public link | `sales.invoice.read` (estimates: `sales.estimate.read`) | ✅ | ✅ | ✅ | ✅ |
| Create share link, WhatsApp share | `sales.invoice.read` | ✅ | ✅ | ✅ | ✅ |
| Change default template/branding | `platform.tenant.manage`, `platform.branding.manage` | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. `EC-1` Tenant has no logo → header shows name in `ds-h2`; layout unchanged.
2. `EC-2` 60-line invoice → A4 paginates; thermal prints continuously.
3. `EC-3` Very long item names → wrap to 2 lines (A4) / truncate at 28 chars with ellipsis (thermal).
4. `EC-4` Browser blocks popups (mobile) → fallback: navigate to print route in same tab with "Back" button.
5. `EC-5` Party mobile missing → WhatsApp prompt; entered number not persisted unless "Save to party".
6. `EC-6` Document voided after link shared → public page shows VOID watermark and hides pay button.
7. `EC-7` Partial payment after link shared → public page recomputes QR amount on load.
8. `EC-8` `primary_hex` too light → PLT branding already enforces ≥ 3:1; print uses black text regardless.
9. `EC-9` Offline → print works from cache; share link creation fails with retry.
10. `EC-10` Walk-in document → "To: Walk-in customer" and optional mobile; WhatsApp share prompts for number prefilled with `walk_in_mobile`.

#### 14. API Requirements
- `GET /sales/invoices/{id}` (data), `POST /sales/invoices/{id}/share-links { expires_in_days? } → 201 { url, expires_at }`, `GET /sales/invoices/{id}/upi-intent → { upi_url, qr_svg_url }` (server builds the string so encoding is canonical; `qr_svg_url = /payments/qr.svg?amount=&note=&ref=`), `GET /public/d/{token}` (200 document JSON with `pdf_url` null, `tenant_branding` subset; 404 expired/unknown), `GET /payments/qr.svg`.
- Estimates: `POST /sales/estimates/{id}/share-links` (CR-SAL-1).
- Message log write for WhatsApp share performed via `POST /notifications/message-logs`? Not canonical — the share is logged server-side as a side effect of `POST …/share-links` with `channel: "whatsapp"` in the body (`{ expires_in_days, channel? }`), which creates the `notifications_message_log` row (`status='sent'`). No new endpoint.
- Frontend: `salesService.createShareLink(kind, id, body)`, `salesService.getUpiIntent(id)`; thunk `createShareLink`; slice `shareSlice` (in `features/sales/redux/`) holding `{ url, expiresAt, status }` per document id.

#### 15. Database Impact
Reads `sales_document`, `sales_document_line`, `platform_tenant` (branding, bank_details, upi_vpa, gstin, address), `files_attachment` (logo, signature). Writes `sales_document.public_token_hash`, `notifications_message_log`. No new indexes (`public_token_hash` unique index exists).

#### 16. Audit Requirements
`invoice.share_link_created { expires_at, channel }`, `invoice.share_link_regenerated`. Printing is not audited (client-side).

#### 17. Notifications
WhatsApp share text (`invoice_share`), placeholders `{party}`, `{shop}`, `{number}`, `{total}`, `{due}`, `{due_date}`, `{link}`, `{upi}`:
- EN (credit): `Namaste {party}, your bill {number} from {shop} is ₹{total}. Balance due ₹{due} by {due_date}. View bill: {link} · Pay via UPI: {upi}`
- EN (paid): `Namaste {party}, thank you for your purchase at {shop}. Bill {number} for ₹{total} is paid. View: {link}`
- HI (credit): `नमस्ते {party}, {shop} का आपका बिल {number} ₹{total} का है। बाकी ₹{due}, {due_date} तक। बिल देखें: {link} · UPI से भुगतान: {upi}`
- HI (paid): `नमस्ते {party}, {shop} से खरीदारी के लिए धन्यवाद। बिल {number} ₹{total} का भुगतान हो गया। देखें: {link}`
SMS (`invoice_share_sms`, ≤ 160 chars, DLT template): `Bill {number} Rs{total} from {shop}. Due Rs{due}. {link}`.

#### 18. Analytics / Event Tracking
`ub.sales.document_printed { kind, template, copies, auto }`, `ub.sales.document_shared { kind, channel: whatsapp|link|sms|pdf }`, `ub.sales.public_page_viewed { kind, has_due }` (server-side on `GET /public/d/`), `ub.sales.public_pay_clicked`.

#### 19. Security
Public endpoint: token compared by hash, constant-time; no enumeration (404 for both unknown and expired); rate limit 60/min/IP; response excludes internal ids other than the document id, excludes party mobile except last 4 digits, excludes cost snapshots. Print route requires session (except public). No third-party fonts or QR services. `noindex, nofollow` on public pages.

#### 20. Performance
Print components are pure; memoised rows; SVG QR ≤ 4 kB. Public page served by Next.js with `dynamic = 'force-dynamic'` and `Cache-Control: private, no-store`. Server `GET /public/d/{token}` uses the unique index; document cached 60 s in-process per token.

#### 21. Testing
- `T-SAL03-1` unit: UPI string encoding (space, `&` in `pn`), `am` two decimals, `tn` ≤ 50.
- `T-SAL03-2` unit: `amountInWords(1772.00)` → "One thousand seven hundred seventy-two rupees only"; 123456.50 → "One lakh twenty-three thousand four hundred fifty-six rupees and fifty paise only".
- `T-SAL03-3` component: A4 hides IGST column for intra, hides CGST/SGST for inter, hides all for bill of supply.
- `T-SAL03-4` component: DRAFT/VOID watermarks by status.
- `T-SAL03-5` component: thermal line ≤ 42 chars; truncation.
- `T-SAL03-6` API: share link create → 201, hash stored, public GET 200; regenerate invalidates old token (404).
- `T-SAL03-7` API: public GET masks mobile, omits `unit_cost_snapshot`.
- `T-SAL03-8` API: share-links with `channel: whatsapp` logs `notifications_message_log`.
- `T-SAL03-9` E2E: issue → Print → `window.print` called with template from setting.
- `T-SAL03-10` visual regression: A4 & thermal snapshots for 1-line, 3-line (BR-10 example), 60-line.
- `T-SAL03-11` permission: accountant can create share link; staff can print.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given `sales.auto_print = true`, when I issue, then the print dialog opens with the default template within 2 s.
- `AC-2` (US-2) Given a regular tenant with logo and signature, when I print A4, then header shows logo, GSTIN, title "TAX INVOICE", line table with HSN and tax columns, tax summary by rate, bank details and signature.
- `AC-3` (US-3) Given the thermal template, when I print, then output fits 72 mm, shows lines, totals, QR and footer.
- `AC-4` (US-4) Given `amount_due = 1772.00` and VPA set, when rendered, then the QR encodes `upi://pay?pa=…&am=1772.00&cu=INR&tn=INV%2F26-27%2F0042…`.
- `AC-5` (US-5) Given party mobile +919876543210, when I tap WhatsApp, then wa.me opens with the HI/EN text containing the public link, and a message log row exists.
- `AC-6` (US-6) Given no network, when I tap Save as PDF on a cached invoice, then the print dialog opens.

#### 23. Dependencies
WLB-01 (branding), PLT-07 (GSTIN, bank, VPA, signature), PAY-03 (QR/intent), NTF-03, NTF-02 (SMS adapter), SAL-02, SAL-04 (credit note print), SAL-01.

#### 24. Future Enhancements
Server-side PDF (WeasyPrint, Phase 2) enabling automated WhatsApp/email sends and `pdf_attachment_id`; 58 mm thermal; ESC/POS direct printing via WebUSB (P3); template gallery with per-party template (research §A.37); e-invoice signed QR (SAL-12); customer pay page with PA (SAL-14).

---

### SAL-04 — Credit note / sales return

#### 1. Business Objective
Record returns, post-sale discounts and billing corrections against issued invoices in the GST-correct way — a Credit Note that reduces the customer's receivable, optionally restocks goods, and either holds the value as an advance or refunds it — without editing or deleting the original invoice. Measures: 100 % of returns traceable to an invoice line with quantity caps enforced; credit-note issue p95 ≤ 400 ms; credit notes appear in GST summary under Sec 34 with correct sign.

#### 2. User Personas
- **OW** — approves returns and refunds.
- **ST** — has `sales.credit_note.write` per canon §0.9 role definition; typically initiates at the counter.
- **AC** — reconciles credit notes to GSTR-1 (9B) and ledger.
- **CU** — receives the credit note and refund/advance.

#### 3. User Stories
1. `US-SAL04-1` As an owner I want to create a credit note against an invoice, picking lines and quantities, so that the return is documented and the customer's balance reduces.
2. `US-SAL04-2` As staff I want returned goods to go back into stock when they are resaleable, and not when damaged, so that on-hand is right.
3. `US-SAL04-3` As an owner I want to refund cash/UPI immediately or hold the amount as an advance so that the customer's khata reflects what actually happened.
4. `US-SAL04-4` As an owner I want a standalone credit note (no invoice) for a goodwill discount so that I can adjust a party balance with a proper document.
5. `US-SAL04-5` As an accountant I want credit notes to reverse tax by the invoice's original rates so that GSTR-1 9B is correct.
6. `US-SAL04-6` As an owner I want to apply an open credit note to another unpaid invoice of the same party.

#### 4. Functional Requirements
1. `FR-1` The system shall create `sales_document` rows with `kind='credit_note'`, statuses `draft`, `issued`, `applied`, `void`, numbered from sequence `credit_note` (prefix `CN`).
2. `FR-2` Against-invoice mode (`against_id` set): the editor shall list the invoice's lines with `invoiced qty`, `already returned` (`returned_qty`) and an input `return qty` (≤ `qty − returned_qty`); price, discount, tax code, tax rate and `tax_inclusive` are copied from the invoice line and are read-only; `place_of_supply_state`, `is_inter_state`, `reverse_charge` and `party_snapshot` are copied from the invoice.
3. `FR-3` Standalone mode (`against_id` NULL): party required (no walk-in), lines free (item or free text), tax computed with rates as of `document_date`; place of supply per SAL-02 FR-5.
4. `FR-4` Totals shall use the SAL-02 tax engine (BR-1…8) with the addition that the against-invoice mode allocates the **original document discount proportionally** to returned quantities: `share_i(return) = q2(invoice.meta.doc_discount_allocation[line_no] × return_qty / invoiced_qty)`; round-off follows the credit note's own setting.
5. `FR-5` `restock: true|false` (per document; default true for goods) shall control posting of `inventory_stock_movement` rows `movement_type='sale_return_in'`, `qty=+return_qty`, `unit_cost = line.unit_cost_snapshot` (from the invoice; standalone: item current `avg_cost`) so weighted average is restored, not distorted.
6. `FR-6` On issue the system shall post one `ledger_entry` (`direction='credit'`, `entry_type='credit_note'`, `amount=grand_total`, `source_type='sales_document'`), increment `returned_qty` on each referenced invoice line, and, when `against_id` is set and the invoice has `amount_due > 0`, auto-apply `min(grand_total, invoice.amount_due)` via `sales_credit_application` reducing the invoice's `amount_due` (BR-3).
7. `FR-7` `settlement ∈ {hold_advance, refund}`: `hold_advance` leaves the unapplied balance as party advance (negative balance, "You will give"); `refund` records a `payments_payment` `direction='out'` for `refund_amount ≤ unapplied amount` with `mode_breakup`, posting ledger `payment_out` (debit), and allocates it? — canon `payments_allocation.document_type ∈ {sales_document, purchase_document}`: the refund payment is allocated to the credit note document (`document_type='sales_document'`, `document_id=credit_note.id`) so `unallocated_amount` and the credit note's `amount_paid` cache are consistent.
8. `FR-8` Status `applied` shall be set when Σ applications + Σ refund allocations = `grand_total`; otherwise `issued` (open credit).
9. `FR-9` `POST /sales/credit-notes/{id}/apply { invoice_id, amount }` shall apply open credit to another `issued|partially_paid|overdue` invoice of the same party; `amount ≤ min(open credit, invoice.amount_due)`; invoice status recomputed.
10. `FR-10` Void (`POST /sales/credit-notes/{id}/void { reason }`) shall reverse stock (`reversal` movements), ledger (`reversal` entry), remove `sales_credit_application` rows (restoring invoice `amount_due`), decrement `returned_qty`, and require that any refund payment is voided first (409 `document_not_draft`? — more precise: 409 with code `refund_exists`; not canonical → use 409 `document_already_void`? No. Decision: block with 400 `validation_error` `non_field_errors: ["Void the refund payment first"]`).
11. `FR-11` The credit note shall print via SAL-03 with title "CREDIT NOTE", reference "Against INV/26-27/0042 dated …", reason line, and tax columns mirroring the invoice.
12. `FR-12` Reason is mandatory (`reason` ∈ `sales_return`, `post_sale_discount`, `rate_correction`, `qty_correction`, `deficiency`, `other` + free text) and stored in `notes` prefixed by the code (no dedicated column; see CR-SAL-3 note).
13. `FR-13` Credit notes against invoices dated in a previous FY shall be allowed (Sec 34 allows until 30 Nov following FY) with a soft warning "Declare in GSTR-1 by 30 Nov {yyyy} for tax effect".

#### 5. Non-Functional Requirements
Issue p95 ≤ 400 ms; editor prefill from invoice ≤ 300 ms; mobile card layout; i18n keys `sales.creditNote.*`; accessibility as SAL-02.

#### 6. User Flow
Primary: Invoice detail → "Credit note / Return" → editor prefilled with lines (return qty 0) → enter quantities → toggle "Restock items" (per document) → settlement: "Hold as advance" (default when invoice unpaid → auto-applies first) or "Refund now" (mode, reference) → Issue → success sheet "CN/26-27/0003 issued · Ramesh's balance ₹0 · Refunded ₹465.81 cash" → Print/Share.
Alternates: (a) Standalone: Sales → Credit notes → New → party → lines → reason. (b) Apply later: Credit note detail → "Apply to invoice" → pick invoice → amount → Apply. (c) Damaged goods: restock off → no stock movement; note "Damaged".

#### 7. UI Requirements
Routes `app/(app)/sales/credit-notes/{page,new,[id]}`. Components: `UbLineItemsEditor` in **return mode** (columns: Item · Invoiced · Returned · Return qty · Rate · Taxable · Tax · Total; qty cell with max hint), `UbTotalsPanel`, `MLRadioGroup` (settlement), `MLSwitch` (restock), `MLSelect` (reason), `UbDrawer` (refund payment sheet reusing PAY-01 breakup component), `UbConfirmDialog`.
Desktop: invoice summary card (number, date, total, due) above lines; totals right. Mobile: lines as cards with stepper capped at max; sticky bar "Credit ₹465.81 · Issue".
Keyboard: `Enter` moves down Return qty column; `Ctrl+Enter` issue; `F8` refund sheet.
Fields:
| Field | Input | Rule |
|---|---|---|
| Against invoice | `UbAsyncCombobox` (issued/paid invoices of party) | optional |
| Party | from invoice / `UbAsyncCombobox` | required |
| Date | `UbDateInput` | ≥ invoice date, ≤ today |
| Reason | `MLSelect` + `MLInput` | required |
| Restock | `MLSwitch` | default true if any goods line |
| Return qty | `UbQuantityInput` | 0 < q ≤ remaining |
| Settlement | `MLRadioGroup` | hold_advance / refund |
| Refund | mode breakup | Σ = refund amount ≤ open credit |

#### 8. UX Requirements
Copy: "Credit note" / "क्रेडिट नोट", "Return" / "वापसी", "Hold as advance" / "एडवांस में रखें", "Refund now" / "अभी वापस करें". Consequence preview before issue: "Stock +3 Cooking Oil · Ramesh −₹465.81 · Refund ₹465.81 cash". Colour: credit amount in `success` tone. Warning banner for previous-FY invoices (FR-13). Refund defaults to the invoice's original payment mode when fully paid.

#### 9. States
| State | UI |
|---|---|
| Draft | editable; number absent |
| Processing | "Issuing…" |
| Issued (open credit) | badge `info` "Open credit ₹x"; actions Apply, Refund, Print, Share, Void |
| Applied | badge `success`; shows applications list (invoice, amount) and refunds |
| Void | badge `error`, reason, reversal links |
| Error 409 stock | n/a for restock (inbound); for void → `insufficient_stock` if returned goods were since sold and negative stock disallowed |
| Empty list | first-use: "No credit notes yet" (no CTA — returns start from an invoice) + "Standalone credit note" secondary |

#### 10. Validation Rules
Yup `creditNoteSchema`: `party_id` required; `against_id` invoice must be `issued|partially_paid|paid|overdue` of the same party (400 `validation_error` `against_id`); `lines[i].qty ≤ invoiced − returned` → "Only {n} {unit} can be returned"; at least one line with qty > 0; `document_date ≥ invoice.document_date` → "Cannot be before the invoice date"; `reason` required → "Choose a reason"; refund `amount ≤ open credit` → "Refund cannot exceed ₹{open}"; Σ modes = refund amount; `restock` ignored for services.

#### 11. Business Rules
1. `BR-1` Tax on against-invoice credit notes uses the invoice line's snapshotted `tax_rate`, `tax_code`, `tax_inclusive`, `unit_price`, line discount ratio — never today's rate.
2. `BR-2` Quantity cap: `Σ returned_qty across non-void credit notes ≤ invoiced qty` enforced with `SELECT … FOR UPDATE` on the invoice lines inside the issue transaction.
3. `BR-3` Auto-application order: on issue against an invoice with `amount_due > 0`, apply first to that invoice; remainder is open credit. Application writes `sales_credit_application(credit_note_id, invoice_id, amount)` and recomputes invoice `amount_due` and status (`paid` when 0).
4. `BR-4` Ledger: credit note = credit `grand_total`; refund = debit `refund_amount` (`payment_out`). Net effect on party for a fully refunded return is 0.
5. `BR-5` Restock cost = `unit_cost_snapshot` of the invoice line (COGS reversal), applying the weighted-average rule of Part 21 §21.3.6.
6. `BR-6` A credit note cannot exceed the invoice's `grand_total` net of previous credit notes (implied by qty cap; for standalone no cap).
7. `BR-7` Void restores `returned_qty`, removes applications (invoice `amount_due` increases, status recomputed — may return to `partially_paid`/`issued`/`overdue`).
8. `BR-8` Numbering: `CN/26-27/0003`; FY from credit note date.
9. `BR-9` Sec 34 wording printed: "Credit note issued under Section 34 of CGST Act against invoice {number} dated {date}".
10. `BR-10` Composition/unregistered tenants issue credit notes with zero tax (mirrors their invoices).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View | `sales.invoice.read` (no separate read codename exists) | ✅ | ✅ | ✅ | ✅ |
| Create/issue/apply | `sales.credit_note.write` | ✅ | ✅ | ✅ (per canon role; tenants may deny via `permissions_override`) | ❌ |
| Refund payment | `sales.credit_note.write` + `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| Void | `sales.invoice.void` (credit notes are sales documents; no `sales.credit_note.void` exists) | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. `EC-1` Invoice already voided → cannot create against it (400 `against_id`: "Invoice is void").
2. `EC-2` Item archived since sale → restock still allowed (movement on archived item permitted for returns); UI hint.
3. `EC-3` Partial return of an inclusive line: taxable back-calculated on the returned portion using snapshot rate; rounding may differ by ₹0.01 from proportional share — accepted, documented.
4. `EC-4` Return qty with 3 dp on integer unit → blocked.
5. `EC-5` Credit note larger than invoice due, party has other unpaid invoices → remainder is open credit; UI suggests "Apply to INV/… (₹x due)".
6. `EC-6` Refund via cheque → reference required; PDC tracking is P3.
7. `EC-7` Walk-in invoice return → no party: credit note requires a party; UI offers "Create party from walk-in" (name/mobile prefilled) or "Refund without credit note" is **not** offered (document trail mandatory). Standalone walk-in credit notes are not supported at MVP.
8. `EC-8` Invoice from previous FY → allowed, warning (FR-13).
9. `EC-9` Concurrent credit notes against the same line → row lock; second sees updated cap or 400.
10. `EC-10` Void credit note whose restocked goods were sold → 409 `insufficient_stock` unless negative allowed.
11. `EC-11` Applying credit to an invoice of a different party → 400 `validation_error` `invoice_id`.

#### 14. API Requirements
- `GET /sales/credit-notes?status=&party_id=&against_id=&date_from=&date_to=&q=&page=`; `meta.totals { count, grand_total, open_credit }`.
- `POST /sales/credit-notes` `{ against_id?, party_id, document_date, reason, reason_note?, lines[] { line_no? (invoice line ref), item_id?, description?, qty, unit_price?, tax_code?, discount_*? }, restock, settlement: "hold_advance"|"refund", refund_payment? { mode_breakup[], reference?, payment_date? }, round_off_enabled?, notes? }` → 201 draft; `?issue=true` with `Idempotency-Key` issues atomically.
- `PATCH /sales/credit-notes/{id}` (draft, `version`), `DELETE` (draft).
- `POST /sales/credit-notes/{id}/issue { refund_payment? }`, `POST /sales/credit-notes/{id}/apply { invoice_id, amount }` → 200 `{ data: credit_note, meta: { invoice: { id, amount_due, status } } }`, `POST /sales/credit-notes/{id}/void { reason }`, `GET /sales/credit-notes/{id}` (includes `against { id, number, date }`, `applications[]`, `refunds[]`), `POST /sales/credit-notes/{id}/share-links` (CR-SAL-1 generalises share links to all sales kinds).
- Errors: 400 `validation_error` (qty cap: `details.lines[i].qty`), 409 `document_not_draft`, `stale_version`, `document_already_void`, `insufficient_stock` (void path), 403 `permission_denied`.
- Frontend: `salesService.createCreditNote`, `issueCreditNote`, `applyCreditNote`, `voidCreditNote`; thunks `saveCreditNoteDraft`, `issueCreditNote`, `applyCreditNote`, `voidCreditNote`; slice `creditNoteEditorSlice` (`invoiceLines[]` with caps, `returnQty`, `restock`, `settlement`, `refund`).

#### 15. Database Impact
Writes `sales_document` (`kind='credit_note'`, `against_id`, totals, `party_snapshot` copied), `sales_document_line` (with `item_id`, snapshots), `sales_document_line.returned_qty` on the invoice, `sales_credit_application`, `inventory_stock_movement` (`sale_return_in`, `reversal`), `inventory_item_stock`, `ledger_entry` (`credit_note`, `payment_out`, `reversal`), `payments_payment`, `payments_allocation`, `parties_party` caches, `platform_document_sequence`, `platform_audit_log`. Reads invoice + lines with `FOR UPDATE`. Index suggestion (optional): `IX(sales_document.tenant_id, against_id)` for "credit notes of this invoice" — existing indexes don't cover; listed in CR-SAL-3.

#### 16. Audit Requirements
`credit_note.draft_created`, `credit_note.issued` (after: number, totals, restock, settlement, applications), `credit_note.applied { invoice_id, amount }`, `credit_note.voided { reason }`, plus `payment.recorded` for refunds, ledger/stock creation events. Snapshots: totals + status.

#### 17. Notifications
Party SMS (config-gated) template `credit_note_issued`: EN `Credit note {number} of ₹{amount} issued by {shop}. Balance ₹{balance}.` / HI `{shop} ने ₹{amount} का क्रेडिट नोट {number} जारी किया। बाकी ₹{balance}।`. WhatsApp share text: EN `Namaste {party}, credit note {number} for ₹{total} against bill {against} has been issued by {shop}. View: {link}` / HI `नमस्ते {party}, बिल {against} के लिए ₹{total} का क्रेडिट नोट {number} {shop} ने जारी किया। देखें: {link}`.

#### 18. Analytics / Event Tracking
`ub.sales.credit_note_issued { against: true|false, lines, restock, settlement, refund_modes[], grand_total_bucket, invoice_age_days }`, `ub.sales.credit_note_applied { amount_bucket }`, `ub.sales.credit_note_voided`.

#### 19. Security
Party/invoice ids tenant-scoped; cap enforced server-side with row locks; refund payments require `payments.payment.write`; reason text sanitised; audit of every refund with actor.

#### 20. Performance
One transaction; ≤ 8 + 3·lines queries; prefill endpoint reuses `GET /sales/invoices/{id}?include=lines` (returned_qty included). List index `(tenant_id, kind, status, document_date DESC)`.

#### 21. Testing
- `T-SAL04-1` unit: return of 3 of 5 inclusive units @160 GST5 → taxable 457.14, tax 22.86 (snapshot rates).
- `T-SAL04-2` unit: original doc discount share allocated proportionally to returned qty.
- `T-SAL04-3` API: qty cap — return 3 then 3 of 5 → second 400 `details.lines[0].qty`.
- `T-SAL04-4` API: issue against unpaid invoice → application row, invoice `amount_due` reduced, status recomputed; ledger credit; stock `sale_return_in` at snapshot cost; avg cost restored.
- `T-SAL04-5` API: `restock=false` → no movements.
- `T-SAL04-6` API: `settlement=refund` → payment out, ledger debit, credit note `applied`.
- `T-SAL04-7` API: apply to other invoice of same party → ok; different party → 400.
- `T-SAL04-8` API: void → reversals, applications removed, `returned_qty` restored; void with refund present → 400.
- `T-SAL04-9` API: composition tenant → zero tax.
- `T-SAL04-10` permission: accountant 403; staff 201; staff void 403.
- `T-SAL04-11` component: return-mode editor caps stepper at remaining qty; consequence preview text.
- `T-SAL04-12` E2E: invoice → return 1 line → refund cash → print credit note shows "Against INV…".

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given INV/26-27/0042 with 3 × Cooking Oil, when I create a credit note returning 3 and issue, then CN/26-27/NNNN exists, Ramesh's balance falls by ₹465.81 and the invoice line shows returned 3/3.
- `AC-2` (US-2) Given restock on, when issued, then Cooking Oil on-hand +3 with unit cost = invoice `unit_cost_snapshot`; given restock off, then on-hand unchanged.
- `AC-3` (US-3) Given "Refund now" ₹465.81 cash, when issued, then a payment-out exists, ledger shows credit 465.81 and debit 465.81, credit note status `applied`.
- `AC-4` (US-4) Given no invoice, when I issue a standalone credit note ₹200 for Ramesh, then his balance reduces by ₹200 and the note prints without an "Against" reference.
- `AC-5` (US-5) Given an invoice dated 15/09/2025 with GST12, when I return a line today, then the credit note uses 12 % (snapshot) and warns about the 30 Nov declaration deadline.
- `AC-6` (US-6) Given open credit ₹200 and another invoice due ₹500, when I apply ₹200, then that invoice's due is ₹300 and the note becomes `applied`.

#### 23. Dependencies
SAL-02 (tax engine, invoice lines), SAL-03 (print), SAL-05 (void semantics), PAY-01/05 (refund payment and its void), INV-06 (movement types), LED-10, RPT-07 (9B reporting).

#### 24. Future Enhancements
Sales return UX with "Credit-only quantity" per line (Zoho §A.26) in Phase 2; one credit note against multiple invoices (Sec 34 allows) — needs a link table (P2); debit note to customer (rate increase) — P3; e-invoice for credit notes (SAL-12).

---
### SAL-05 — Void / cancel invoice

#### 1. Business Objective
Allow an owner to cancel an invoice that was issued in error without deleting evidence: the number is retained, the document is marked void with a reason, and stock and ledger effects are reversed by new rows. Measures: void completes in one transaction ≤ 300 ms; `recalc_balances`/`recalc_stock` agree after any void; every void has an actor and reason in audit.

#### 2. User Personas
**OW**/admin — the only roles with `sales.invoice.void`. **AC** — reviews voids in registers (voided invoices are listed with zero values in GSTR-1 Table 13 "cancelled").

#### 3. User Stories
1. `US-SAL05-1` As an owner I want to void a wrongly issued invoice so that the customer's khata and stock are corrected.
2. `US-SAL05-2` As an owner I want to see the consequences before confirming so that I am not surprised by an advance appearing on the party.
3. `US-SAL05-3` As an accountant I want voided numbers to remain visible so that the series has no gaps in Table 13.
4. `US-SAL05-4` As staff I want to discard a draft I no longer need.

#### 4. Functional Requirements
1. `FR-1` `POST /sales/invoices/{id}/void { reason }` shall be allowed for statuses `issued`, `partially_paid`, `paid`, `overdue`; `draft` documents are deleted (`DELETE`), not voided; `void` → 409 `document_already_void`.
2. `FR-2` Void shall, atomically: set `status='void'`, `voided_at`, `void_reason`; post `inventory_stock_movement` rows `movement_type='reversal'`, `qty=+line.qty`, `unit_cost=line.unit_cost_snapshot`, `reverses_id` = original `sale_out` movement (weighted average recomputed per Part 21 inbound rule using the snapshot cost); post a `ledger_entry` `direction='credit'`, `entry_type='reversal'`, `amount=grand_total`, `reverses_id` = the invoice's debit entry and set `reversed_by_id`/`status='reversed'` on the original (canon §0.7: reversal pairs); delete `payments_allocation` rows pointing to this invoice so payments become unallocated advances (`unallocated_amount` recomputed); remove `sales_credit_application` rows (credit notes return to `issued` open credit); set `amount_paid = 0`, `amount_due = 0`; update party caches; audit.
3. `FR-3` Void shall be blocked (400 `validation_error`, `non_field_errors`) when a non-void credit note exists against the invoice ("Void credit note CN/… first"), keeping the document graph acyclic and totals reconstructible.
4. `FR-4` If stock reversal would require nothing (services, untracked items) no movements are written.
5. `FR-5` The confirmation dialog (`UbReasonDialog`) shall show consequences computed client-side from the document: "Stock: +2 Basmati Rice, +3 Cooking Oil · Ledger: Ramesh −₹1,772.00 · Payments: ₹500 becomes advance for Ramesh".
6. `FR-6` After void, the response shall include `meta.unallocated_payments[] { payment_id, number, amount }` and the UI shall prompt "Refund or keep as advance?" linking to PAY-01 (record payment out) — the payment itself is never auto-voided (§22.7 decision).
7. `FR-7` Walk-in invoice void: the payment has no party; it stays `recorded` with `unallocated_amount = amount`; the UI prompts "Refund ₹x to customer?" which opens PAY-01 payment-out with `party_id` NULL is not supported — so the prompt offers "Void the payment (money returned)" (PAY-05) as the single follow-up.
8. `FR-8` The void reason (≥ 3 chars, ≤ 160) shall print on the VOID watermark copy and appear in the list as a tooltip.
9. `FR-9` Estimates are not voided (statuses have no `void`); they are rejected. Credit notes void per SAL-04 FR-10. Purchase bills per PUR-04.
10. `FR-10` Voided invoices shall remain in registers with a `void` flag and zero contribution to totals except GSTR-1 Table 13 cancelled count (RPT-07).

#### 5. Non-Functional Requirements
p95 ≤ 300 ms; consequence preview instant (client); i18n `sales.void.*`; works on mobile via bottom-sheet reason dialog.

#### 6. User Flow
Invoice detail → overflow "Void" (owner/admin only) → `UbReasonDialog` with consequences and reason input → Confirm → toast "INV/26-27/0042 voided" → if unallocated payments exist, follow-up sheet "₹500 from Ramesh is now an advance — Refund now / Keep as advance" → detail shows VOID badge, reason, links to reversal entries.
Alternate: draft → "Discard draft" → confirm → deleted, back to list.

#### 7. UI Requirements
`UbReasonDialog` (title "Void invoice INV/26-27/0042?", consequence list with icons (package, book, wallet), reason `MLTextarea`, destructive outlined button "Void invoice"). Detail page: `UbStatusBadge` `void` tone `error`; banner "Voided on 18/09/2026 by Akash — Reason: Duplicate bill" with links "Stock reversal", "Ledger reversal". List row: strike-through number? No — Koper rule: badges carry state; number stays legible, badge shows VOID.
Mobile: reason dialog as bottom sheet; consequences collapsible.

#### 8. UX Requirements
Copy: "Void" / "रद्द करें"; consequence sentence template `sales.void.consequences` with ICU plurals. Never say "delete" for issued documents. Success toast offers "Undo"? Not possible (immutable); toast offers "View reversal". Accountant sees the Void action disabled with tooltip "Only owner or admin can void".

#### 9. States
| State | UI |
|---|---|
| Confirm | dialog open, button disabled until reason ≥ 3 chars |
| Processing | button spinner "Voiding…" |
| Success | badge void; follow-up sheet when payments exist |
| Failed (credit note exists) | dialog error line with link to the credit note |
| Failed (already void) | toast "Already voided" and refresh |
| Failed (network) | retry; idempotent by document state (second call → 409 `document_already_void`, treated as success) |

#### 10. Validation Rules
`voidReasonSchema`: `reason` string 3–160 → "Give a reason (at least 3 characters)". Server: status check → 409 `document_already_void` / 409 `document_not_draft` semantics inverted (drafts must use DELETE) → 400 `validation_error` "Drafts are deleted, not voided".

#### 11. Business Rules
1. `BR-1` Number retained; sequence untouched.
2. `BR-2` Reversal movements carry the original `unit_cost_snapshot` so the weighted average after void equals the pre-sale average when no other movements intervened (test-asserted).
3. `BR-3` Ledger reversal amount = `grand_total`; original entry marked `reversed`; statement with `include_corrections=false` hides both.
4. `BR-4` Payments are never voided by an invoice void; allocations are removed; `payments_payment.unallocated_amount += allocation.amount`.
5. `BR-5` Credit applications removed; credit notes recomputed to `issued` (open) if previously `applied` solely through this invoice.
6. `BR-6` Void date is `now()`; the reversal `ledger_entry.entry_date` and `stock movement_date` are **today** (tenant date), not the invoice date, so past periods stay closed; RPT-07 reports the void in the period of the original document as "cancelled" and excludes its values.
7. `BR-7` Voiding an `overdue` invoice removes it from overdue buckets immediately (status change), no nightly job needed.
8. `BR-8` Void is irreversible; re-issue by duplicating (SAL-06).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Void invoice/bill of supply/credit note | `sales.invoice.void` | ✅ | ✅ | ❌ | ❌ |
| Delete draft | `sales.invoice.write` (own drafts for staff) | ✅ | ✅ | own | ❌ |
| View void details | `sales.invoice.read` | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. `EC-1` Invoice items since archived → reversal movement allowed on archived items.
2. `EC-2` Negative-stock tenant; voiding restores stock possibly to positive — fine.
3. `EC-3` Party archived after invoice → void allowed; ledger reversal posts to archived party (balance may become non-zero; archive rule concerns future archiving only).
4. `EC-4` Invoice with public share link → link remains, renders VOID.
5. `EC-5` Invoice from previous FY → allowed; GST warning "Report as cancelled/adjust in current period per your CA".
6. `EC-6` Concurrent void by two admins → second gets 409 `document_already_void`.
7. `EC-7` Payment fully allocated across two invoices, one voided → only that allocation removed; payment partially unallocated.
8. `EC-8` Void after low-stock notification → stock rises; no "restocked" notification (INV-07 fires only on downward crossing).
9. `EC-9` Estimate linked (`converted_from_id`) → estimate stays `converted`; UI shows "Invoice voided" on the estimate with "Convert again" (creates a new draft; allowed because the previous conversion is void — server relaxes BR-6 of SAL-01 when `converted_to.status='void'`).

#### 14. API Requirements
`POST /sales/invoices/{id}/void { reason }` → 200 `{ data: document(status=void), meta: { reversals: { stock_movement_ids[], ledger_entry_id }, unallocated_payments[] } }`; 409 `document_already_void`; 400 `validation_error` (credit note exists; draft); 403 `permission_denied`. `DELETE /sales/invoices/{id}` → 204 (draft) else 409 `document_not_draft`. Frontend: `salesService.voidInvoice(id, reason)`, thunk `voidInvoice`, slice `invoiceDetailSlice` (`voiding`, `voidResult`).

#### 15. Database Impact
`sales_document` (`status`, `voided_at`, `void_reason`, `amount_paid`, `amount_due`), `inventory_stock_movement` (+`reversal`), `inventory_item_stock`, `ledger_entry` (+reversal; original `status`, `reversed_by_id`), `payments_allocation` (delete), `payments_payment.unallocated_amount`, `sales_credit_application` (delete), `parties_party` caches, `platform_audit_log`.

#### 16. Audit Requirements
`invoice.voided` with before `{status, amount_paid, amount_due}` after `{status: void, void_reason}` and metadata `{ reversal_ids, unallocated_payment_ids }`; `ledger.entry.reversed`, `stock.movement.reversed`.

#### 17. Notifications
Party SMS (config-gated) template `invoice_voided`: EN `Bill {number} of ₹{amount} at {shop} was cancelled. Balance ₹{balance}.` / HI `{shop} पर ₹{amount} का बिल {number} रद्द किया गया। बाकी ₹{balance}।`. In-app notification to owner when a non-owner admin voids: type `invoice_voided`.

#### 18. Analytics / Event Tracking
`ub.sales.invoice_voided { age_minutes, had_payments, had_credit_notes_blocked, lines }`, `ub.sales.draft_discarded`.

#### 19. Security
Only owner/admin; reason logged; cross-tenant 404; idempotent on repeated calls.

#### 20. Performance
Single transaction; movements batch-inserted (`bulk_create`); ≤ 10 queries + 1 per line.

#### 21. Testing
- `T-SAL05-1` API: void issued credit invoice → reversal movement/entry rows, party balance back, statuses correct.
- `T-SAL05-2` API: void paid invoice → allocation removed, payment unallocated, party balance negative (advance) — §22.14 step 4 replicated (−102).
- `T-SAL05-3` API: void with credit note → 400.
- `T-SAL05-4` API: void twice → 409 `document_already_void`.
- `T-SAL05-5` API: staff void → 403.
- `T-SAL05-6` unit: avg cost after void equals pre-sale avg.
- `T-SAL05-7` API: draft DELETE → 204; void draft → 400.
- `T-SAL05-8` component: reason dialog disables confirm < 3 chars; consequences text.
- `T-SAL05-9` E2E: void → follow-up sheet → "Keep as advance" → party shows "You will give".

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given issued INV/26-27/0042 (2 × Rice, ₹898 credit), when the owner voids with reason, then stock +2, Ramesh −₹898, status `void`, number unchanged.
- `AC-2` (US-2) Given a ₹500 payment on that invoice, when I open Void, then the dialog says "₹500 becomes advance for Ramesh"; after confirming, Ramesh's balance is −₹102 (You will give).
- `AC-3` (US-3) Given a voided invoice, when the accountant opens the sales register, then the row appears flagged VOID with zero totals.
- `AC-4` (US-4) Given a draft, when staff taps Discard, then it is deleted and absent from the list.

#### 23. Dependencies
SAL-02, SAL-04, PAY-01/05, LED-03 (reversal semantics), INV-06, RPT-03/07.

#### 24. Future Enhancements
"Revert to draft" (Zoho) is deliberately not offered; e-invoice cancel window (SAL-12, 24 h) becomes a hard rule; bulk void (P3).

---

### SAL-06 — Draft autosave & duplicate

#### 1. Business Objective
Never lose a half-typed bill and never retype a repeat order: drafts persist locally and on the server, and any document can be duplicated into a new draft. Measures: < 1 % of editor sessions end with lost input (measured by restore prompts accepted vs. drafts abandoned); duplicate used on ≥ 15 % of invoices for wholesale tenants.

#### 2. User Personas
**ST** — interrupted at the counter; repeats weekly orders. **OW** — duplicates last month's invoice for a service retainer.

#### 3. User Stories
1. `US-SAL06-1` As staff I want my in-progress bill kept if the app closes so that I continue where I left off.
2. `US-SAL06-2` As staff I want drafts saved on the server so that I can open them on another device.
3. `US-SAL06-3` As an owner I want to duplicate any invoice, estimate or credit note into a new draft so that repeat billing is fast.
4. `US-SAL06-4` As an owner I want a drafts tab with counts so that unfinished bills are visible.

#### 4. Functional Requirements
1. `FR-1` The editor shall persist its form state to `localStorage` key `ub.sales.draft.<tenantId>.<kind>.<localDraftId>` on every change (debounced 500 ms) with `{ savedAt, version, form }`; entries older than 7 days are purged on load.
2. `FR-2` Server drafts: after the first meaningful change (a line or a party), the client shall `POST /sales/<kind>` (draft) once, then `PATCH` with `version` every 3 s while dirty (debounced) and on blur/route change; the header shows "Draft saved hh:mm" / "Saving…" / "Offline — saved on this device".
3. `FR-3` On opening the editor for a server draft, if a newer local copy exists (`savedAt > server.updated_at`), the client shall prompt "Restore unsaved changes from this device?" (Restore / Discard).
4. `FR-4` On opening "New", if unsynced local drafts exist for this tenant/kind, a banner "You have 2 unsaved drafts" shall link to them.
5. `FR-5` `POST /sales/<kind>/{id}/duplicate` shall create a new `draft` copying party, lines (item, description, qty, unit_price, tax_inclusive, discounts, tax_code — refreshed against current item status), document discount, notes, terms, `place_of_supply_state`; `document_date` = today, `due_on` recomputed, number/status/payments/against_id/converted ids **not** copied. Path is not in canon §0.8 → CR-SAL-1.
6. `FR-6` Duplicate shall be available for every status including `void` and `converted`; for credit notes it duplicates as **standalone** (no `against_id`) with a warning.
7. `FR-7` Drafts shall be listed under the "Draft" tab (SAL-08) with the creator and last saved time; staff see only their own drafts unless they hold `sales.invoice.read` for all (they do — read is not restricted; the tab shows all, edit restricted to creator/owner/admin per SAL-02 §12).
8. `FR-8` Draft count per kind shall be exposed in `meta.tabs.draft` of the list endpoint and on the mobile "Bills" tab badge.
9. `FR-9` Stale-version handling: a `PATCH` 409 `stale_version` shall fetch the server draft and show "This draft was changed on another device" with options "Use server version" / "Keep mine (overwrite)".
10. `FR-10` Deleting a draft shall clear its local copy.

#### 5. Non-Functional Requirements
Autosave never blocks typing (async, cancelable); local write ≤ 5 ms; server PATCH payload only changed fields where practical (whole `lines[]` sent — acceptable, ≤ 20 kB); storage quota errors caught (try/catch) and surfaced as "Local save unavailable".

#### 6. User Flow
Typing → "Saving…" → "Draft saved 12:41" → app killed → reopen → drafts banner → open → prompt restore local → continue → Issue → local key removed. Duplicate: invoice detail → overflow "Duplicate" → confirm ("Create a copy as a new draft?") → editor opens on the copy with a banner "Copied from INV/26-27/0042".

#### 7. UI Requirements
Header save indicator (`ds-caption`, states: Saving…, Saved hh:mm, Offline, Error — retry). `UbStatusBanner` for unsaved drafts. `UbConfirmDialog` for restore and duplicate. Drafts tab in `UbTabs` with count badge. Duplicate action in `MLDropdownMenu` on detail and as row action in list. Mobile: same, with the indicator under the title.

#### 8. UX Requirements
Copy: "Draft saved" / "ड्राफ्ट सेव हुआ", "Unsaved changes on this device" / "इस डिवाइस पर असेव बदलाव", "Duplicate" / "कॉपी बनाएँ". Restore prompt defaults to Restore. Duplicate never copies payments; the banner says so.

#### 9. States
| State | UI |
|---|---|
| Clean | "Draft saved hh:mm" |
| Dirty | "Saving…" (after 3 s) |
| Offline | "Offline — saved on this device" (amber dot) |
| Conflict | dialog (FR-9) |
| Save error (4xx) | red indicator "Couldn't save" + details |
| Restore prompt | dialog |
| Duplicating | spinner |

#### 10. Validation Rules
Drafts are saved even when invalid (server accepts partial drafts: `lines` may be empty, party absent) — draft POST/PATCH relax "≥ 1 line" and "party xor walk-in"; validation is enforced at issue. Duplicate of a document whose items are archived → lines kept, issue-time validation flags them.

#### 11. Business Rules
1. `BR-1` A draft has no number; `fy_label` is set from `document_date` and updated on date change.
2. `BR-2` Local drafts are per browser profile and tenant; switching tenant hides other tenants' drafts.
3. `BR-3` Server draft is authoritative once created; local copy is a cache except when newer (FR-3).
4. `BR-4` Duplicate refreshes `hsn_sac`, `unit_code` from the item master but keeps prices (business chooses).
5. `BR-5` Drafts older than 90 days are flagged "stale" in the list (no auto-delete).
6. `BR-6` `version` increments on every server change; the client stores it and sends it back.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Create/save draft | `sales.<kind>.write` | ✅ | ✅ | ✅ | ❌ |
| Edit others' drafts | `sales.<kind>.write` + role owner/admin | ✅ | ✅ | ❌ | ❌ |
| Duplicate | `sales.<kind>.write` | ✅ | ✅ | ✅ | ❌ |
| View drafts tab | `sales.<kind>.read` | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. `EC-1` Two tabs editing the same draft → `stale_version` conflict dialog.
2. `EC-2` localStorage full/private mode → local save disabled with indicator; server save continues.
3. `EC-3` Draft created offline never reached server → appears only in local banner; on reconnect, opening it POSTs it.
4. `EC-4` Duplicate a walk-in paid invoice → walk-in name copied, payment not; user must pay at issue (SAL-07).
5. `EC-5` Duplicate across gst_type change → kind follows current tenant type.
6. `EC-6` Draft's party archived → editor shows warning; issue blocked until party changed.
7. `EC-7` Draft with legacy tax code after 22-Sep-2025 → issue blocked with rate message (SAL-02 FR-17); duplicate refreshes to item's current code.

#### 14. API Requirements
`POST /sales/{invoices|estimates|credit-notes}` (draft, relaxed validation), `PATCH …/{id} { version, … }` → 200 with new `version`; 409 `stale_version` returns `{ error, details: { current_version, server_updated_at } }`; `DELETE …/{id}`; `POST …/{id}/duplicate` → 201 draft (CR-SAL-1); list `?status=draft` and `meta.tabs`. Frontend: `useDraftAutosave(kind, form)` hook (`features/sales/hooks/useDraftAutosave.ts`) → thunks `saveInvoiceDraft`/`saveEstimateDraft`/`saveCreditNoteDraft`; `salesService.duplicateDocument(kind, id)`; local persistence util `src/utils/localDrafts.ts`.

#### 15. Database Impact
`sales_document` (`status='draft'`, `version`, `updated_at`), `sales_document_line` (replace-all on PATCH inside a transaction), audit `*.draft_updated` throttled: only one audit row per 10 minutes per draft (metadata `changes_count`) to avoid noise.

#### 16. Audit Requirements
`invoice.draft_created`, `invoice.draft_updated` (throttled), `invoice.draft_deleted`, `invoice.duplicated { source_id }`.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.sales.draft_autosaved { kind, local|server }`, `ub.sales.draft_restored { accepted }`, `ub.sales.draft_conflict { resolution }`, `ub.sales.document_duplicated { kind, source_status }`.

#### 19. Security
Local drafts contain party names/mobiles — stored only in the browser; cleared on logout (`sessionSlice` logout clears `ub.sales.draft.*` keys). Server drafts tenant-scoped.

#### 20. Performance
Debounced saves; `PATCH` ≤ 20 kB; drafts tab count computed with the list query (`COUNT(*) FILTER (WHERE status='draft')`).

#### 21. Testing
- `T-SAL06-1` unit: `localDrafts` write/read/purge (7 days).
- `T-SAL06-2` component: typing triggers local save ≤ 500 ms and server PATCH ≤ 3 s (fake timers).
- `T-SAL06-3` component: restore prompt when local newer; discard removes key.
- `T-SAL06-4` API: PATCH stale version → 409 with `current_version`.
- `T-SAL06-5` API: duplicate copies lines, not payments/number; credit note duplicate drops `against_id`.
- `T-SAL06-6` API: draft with zero lines accepted; issue rejected.
- `T-SAL06-7` permission: staff editing another staff's draft → 403.
- `T-SAL06-8` E2E: kill tab mid-edit → reopen → restore → issue → local key gone.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given I typed two lines and closed the tab, when I reopen the app, then a banner offers the unsaved draft and restoring shows both lines.
- `AC-2` (US-2) Given a draft saved on desktop, when I open Bills → Draft on mobile, then the draft is listed and editable.
- `AC-3` (US-3) Given INV/26-27/0042, when I tap Duplicate, then a new draft opens with the same lines dated today and no payment.
- `AC-4` (US-4) Given 3 drafts, when I open Sales, then the Draft tab shows "3".

#### 23. Dependencies
SAL-01/02/04 editors, SAL-08 tabs, `sessionSlice` (logout hook), Part 22 concurrency (`version`).

#### 24. Future Enhancements
Offline write queue for issue (ADR-020, P2), draft templates ("Save as template"), recurring invoices (SAL-10) supersede duplicate for schedules.

---

### SAL-07 — Walk-in / cash sale

#### 1. Business Objective
Bill anonymous counter customers without creating a party, guaranteeing that such sales are always fully paid so no receivable exists without a khata. Measures: walk-in share of invoices in retail tenants ≥ 50 %; zero walk-in documents with `amount_due > 0`.

#### 2. User Personas
**ST** — counter billing. **CU** — optionally receives SMS/WhatsApp with the bill.

#### 3. User Stories
1. `US-SAL07-1` As staff I want to bill without picking a party so that small cash sales take seconds.
2. `US-SAL07-2` As staff I want to optionally enter the customer's mobile so that they get the bill on SMS/WhatsApp.
3. `US-SAL07-3` As an owner I want walk-in sales to always be paid in full so that nothing goes uncollected without a name.
4. `US-SAL07-4` As staff I want to convert a walk-in into a party when the customer wants credit so that the bill moves to a khata.

#### 4. Functional Requirements
1. `FR-1` The editor shall default to **walk-in** for tenants whose `business_type ∈ {retail, food}` and to **party** otherwise (constant map `DEFAULT_BILLING_MODE_BY_BUSINESS_TYPE`); a "Walk-in" chip toggles modes.
2. `FR-2` Walk-in documents shall have `party_id NULL`, optional `walk_in_name` (default "Walk-in customer" at print), optional `walk_in_mobile` (E.164).
3. `FR-3` Issue shall require `payment` with Σ `mode_breakup` = `grand_total` (SAL-02 FR-10); the payment sheet defaults to the full amount in `cash` and cannot be dismissed without payment for walk-ins ("Full credit" hidden).
4. `FR-4` The payment shall be recorded with `party_id NULL`, allocated to the invoice; no ledger entry is posted (no party).
5. `FR-5` "Save as party" (in the success sheet or the editor) shall create a party from `walk_in_name/mobile` (PTY-01) and, before issue, switch the draft to party mode; after issue it only creates the party (the issued document keeps `party_id NULL` — documents are immutable after issue).
6. `FR-6` Walk-in invoices shall be B2C in RPT-07 (Table 7); inter-state walk-in invoices > ₹2,50,000 fall in Table 5 (B2C large) and require `walk_in_name` + address? Address isn't a walk-in column — the rule triggers a soft warning "Enter customer name and address (use a party) for inter-state sales above ₹2.5 lakh" and the system recommends switching to party mode (Rule 46 unregistered ≥ ₹50,000 also warns).
7. `FR-7` Sales list and registers shall show "Walk-in" (plus name if given) in the party column with a distinct muted style.
8. `FR-8` `walk_in_mobile` shall enable WhatsApp share prefilled (SAL-03) and, when the SMS provider is configured, an optional "Send bill by SMS" toggle in the success sheet (template `invoice_share_sms`), consent recorded as `consent_source='verbal'` in the message log payload (no party row).
9. `FR-9` Returns on walk-in invoices require creating a party first (SAL-04 EC-7).

#### 5. Non-Functional Requirements
Mode toggle instant; payment sheet opens ≤ 100 ms; mobile numbers masked in lists; i18n `sales.walkIn.*`.

#### 6. User Flow
New bill (walk-in default) → scan/add items → F8 → payment sheet (full, cash) → Enter → issued → success sheet: Print / Share (asks number) / "Save as party" → next bill.
Alternate: customer wants credit → tap "Walk-in" chip → party picker → create party inline → continue as credit sale.

#### 7. UI Requirements
Party field renders as a segmented control (`MLToggleGroup`): "Walk-in" | "Party". In walk-in mode: optional `MLInput` name and `UbPhoneInput` mobile (collapsed under "Add customer details"). Payment sheet (shared `PaymentBreakupSheet` component from PAY-01/02): amount (read-only = grand total for walk-in), mode chips, split rows, reference. Success sheet shows "Paid ₹1,772 (Cash)" and mobile-dependent share options.

#### 8. UX Requirements
Copy: "Walk-in customer" / "काउंटर ग्राहक"; "Customer mobile (optional)" / "ग्राहक मोबाइल (वैकल्पिक)"; "Walk-in sales must be paid in full" / "काउंटर बिक्री का पूरा भुगतान ज़रूरी है". Never ask for the mobile before items (speed first). Cash is default; last-used mode remembered per device (`localStorage ub.sales.lastMode`).

#### 9. States
| State | UI |
|---|---|
| Walk-in mode | chip active, name/mobile collapsed |
| Party mode | picker |
| Payment sheet (walk-in) | amount locked, "Full credit" hidden |
| Issued | success sheet with "Save as party" |
| Validation fail | "Walk-in sale must be paid in full" |

#### 10. Validation Rules
`walk_in_name` ≤ 120 chars; `walk_in_mobile` valid Indian mobile → "Enter a valid 10-digit mobile"; payment Σ = grand_total → 400 `details.payment`; party mode requires `party_id`.

#### 11. Business Rules
1. `BR-1` `party_id NULL ⇒ amount_due = 0` at issue (invariant).
2. `BR-2` No ledger entries for walk-in invoices or their payments.
3. `BR-3` Cashbook (EXP-03) includes walk-in payments by mode.
4. `BR-4` Walk-in with GSTIN is impossible (no field) → always B2C.
5. `BR-5` Place of supply for walk-in = tenant state unless changed manually (inter-state counter sales are rare but allowed).
6. `BR-6` Creating a party from walk-in details after issue does not link the document (immutable); the party's khata starts empty.

#### 12. Permissions
Same as SAL-02 (`sales.invoice.write`, `payments.payment.write`). "Save as party" needs `parties.party.write`.

#### 13. Edge Cases
1. `EC-1` Duplicate mobile of an existing party entered as walk-in → hint "Ramesh Traders has this number — bill to party?" (lookup `GET /parties?q=<mobile>`), non-blocking.
2. `EC-2` Payment split where one mode is `cheque` for a walk-in → allowed (reference required); cash-drawer report shows cheque separately.
3. `EC-3` Void walk-in invoice → payment stays recorded and unallocated; follow-up "Void payment (money returned)" (SAL-05 FR-7).
4. `EC-4` Grand total 0 (100 % discount) → payment of 0 not created; issue allowed; status `paid`.
5. `EC-5` Walk-in estimate converted → invoice in walk-in mode; payment required at issue.
6. `EC-6` Tenant disables `payments` module → walk-in issue impossible; editor forces party mode with explanation (module gate).

#### 14. API Requirements
Covered by `POST /sales/invoices` (`walk_in_name`, `walk_in_mobile`, `payment` required) and `POST /parties` for "Save as party". Error 400 `validation_error` `details.payment`. Lists expose `party: null, walk_in_name`.

#### 15. Database Impact
`sales_document.party_id NULL`, `walk_in_name`, `walk_in_mobile`; `payments_payment.party_id NULL`; `payments_allocation`. No ledger rows.

#### 16. Audit Requirements
As SAL-02; `metadata.walk_in = true`.

#### 17. Notifications
SMS (config-gated) `invoice_share_sms` to `walk_in_mobile` when toggled; WhatsApp via SAL-03 with prompt prefilled.

#### 18. Analytics / Event Tracking
`ub.sales.invoice_issued { has_party: false, mobile_captured }`, `ub.sales.walkin_saved_as_party`.

#### 19. Security
Walk-in mobile masked in lists/exports for roles other than owner/admin/accountant (`+91 98••• ••210`); full value in detail for `sales.invoice.read`. Consent for SMS recorded per message log.

#### 20. Performance
No additional queries; party-mobile hint lookup debounced 400 ms.

#### 21. Testing
- `T-SAL07-1` API: walk-in without payment → 400; partial → 400; full → 201 `paid`, no ledger rows, payment `party_id NULL`.
- `T-SAL07-2` API: walk-in inter-state > 2.5 L → warning in `meta.warnings`.
- `T-SAL07-3` component: default mode by business type; "Full credit" hidden in walk-in.
- `T-SAL07-4` component: duplicate-mobile hint appears.
- `T-SAL07-5` API: save as party creates party; document unchanged.
- `T-SAL07-6` E2E: retail tenant new bill → walk-in default → pay → success sheet.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given a retail tenant, when I open New bill, then walk-in mode is preselected and I can issue after adding items and paying.
- `AC-2` (US-2) Given I enter mobile 98765 43210, when the bill is issued, then WhatsApp share opens to that number with the bill link.
- `AC-3` (US-3) Given a walk-in bill of ₹1,772, when I try to issue with ₹1,000 paid, then I see "Walk-in sale must be paid in full".
- `AC-4` (US-4) Given a walk-in draft, when I tap "Save as party", then a party is created and the draft switches to party mode.

#### 23. Dependencies
SAL-02, PAY-01/02, PTY-01, NTF-02/03, EXP-03 (cashbook), RPT-07.

#### 24. Future Enhancements
Loyalty/customer mobile lookup across walk-ins (P3), receipt SMS analytics, camera barcode (INV-10).

---

### SAL-08 — Sales list & filters

#### 1. Business Objective
One list to find any sales document by status, party, date, number or amount, with totals for the filtered set, on both desktop grid and mobile cards. Measures: p95 list load ≤ 500 ms for 100k documents; "find a bill" median ≤ 10 s in usability tests.

#### 2. User Personas
**OW**, **ST**, **AC** — all read sales documents; **AC** exports (IMP-02/RPT-08).

#### 3. User Stories
1. `US-SAL08-1` As an owner I want tabs All / Unpaid / Overdue / Paid / Draft with counts so that I see collection work at a glance.
2. `US-SAL08-2` As staff I want to search by number, party name or mobile so that I can reprint a bill quickly.
3. `US-SAL08-3` As an accountant I want date-range, party and amount filters and totals so that I can reconcile a period.
4. `US-SAL08-4` As an owner I want row actions (view, print, share, record payment, duplicate, void) so that I act without opening each bill.
5. `US-SAL08-5` As an accountant I want to export the filtered list to CSV.

#### 4. Functional Requirements
1. `FR-1` Route `/sales/invoices` shall render `UbDataGrid` backed by `GET /sales/invoices` with server pagination (25/page, max 100), sorting whitelist `-document_date` (default), `document_date`, `number`, `grand_total`, `-grand_total`, `amount_due`, `due_on`, `party__name`.
2. `FR-2` Tabs (`UbTabs`, URL param `tab`): `all` (excludes drafts and voids), `unpaid` (`status=issued,partially_paid,overdue`), `overdue` (`status=overdue`), `paid` (`status=paid`), `draft` (`status=draft`), `void` (`status=void`) with counts from `meta.tabs` (computed over the date/party/search filter, not the tab).
3. `FR-3` Filters: `UbDateRangePicker` (presets Today, Yesterday, This week, This month, This FY, Last FY, Custom; default This FY), party (`UbAsyncCombobox`), amount min/max, kind (Tax invoice / Bill of supply — only when tenant has both historically), created by (owner/admin only). Only `tab` and date range live in the URL (§17.0.3).
4. `FR-4` Search `q` shall match `number` (prefix, case-insensitive), `party_snapshot.name` / `walk_in_name` (trigram), `walk_in_mobile`/party mobile (suffix ≥ 4 digits).
5. `FR-5` Totals header shall show `meta.totals { count, grand_total, amount_due }` for the filtered set (voids excluded from sums).
6. `FR-6` Columns (desktop): Date · Number · Party (Walk-in muted) · Status badge · Total · Paid · Due · Due date (relative "3 d overdue" in error tone) · Created by · actions. Column visibility persisted per user in `localStorage ub.grid.sales.columns`.
7. `FR-7` Row click opens the detail page (desktop: drawer preview `UbDrawer` with Print/Share/Record payment; "Open" for full page). Mobile: cards with number, party, date, total, due badge; tap → detail.
8. `FR-8` Row actions: View, Print, Share, Record payment (opens PAY-01 sheet prefilled with `amount_due`), Duplicate, Void (permission-gated), Delete (drafts).
9. `FR-9` Bulk selection (desktop): Print selected (queues print route sequentially), Export CSV (IMP-02), Share reminders? Not for invoices (reminders are party-level, LED-06) — omitted.
10. `FR-10` Estimates and credit notes have their own lists (`/sales/estimates`, `/sales/credit-notes`) reusing the same grid configuration with kind-specific tabs (estimates: all/draft/sent/accepted/expired/converted; credit notes: all/open/applied/void).
11. `FR-11` Empty states: first-use ("No bills yet. Create your first bill." + New bill + help link), filtered-empty ("No bills match" + Clear filters), error (retry + request id).
12. `FR-12` A quick "New bill" primary button (desktop header; mobile FAB) and keyboard `N`.

#### 5. Non-Functional Requirements
p95 ≤ 500 ms at 100k rows (indexes below); skeleton rows while loading; page resets to 1 on filter change; grid a11y (row headers, sortable column ARIA); mobile cards ≥ 44 px targets; i18n `sales.list.*`.

#### 6. User Flow
Sales → list (This FY, tab All) → tap Unpaid → filter party Ramesh → totals "3 bills · ₹5,400 due" → row → drawer → Record payment → PAY-01 sheet → saved → row updates (status `paid`), totals refresh.

#### 7. UI Requirements
`UbPageShell` + `UbPageHeader` (title "Bills", actions New bill, Export), `UbTabs` (counts), toolbar: `UbSearchInput`, `UbDateRangePicker`, party `UbAsyncCombobox`, "More filters" popover (amount, kind, created by), `UbFilterTag`s row, `UbDataGrid`, totals bar (`UbStatCard` compact ×3: Count, Total, Due). Mobile: sticky tabs (scrollable), search + date chip, cards, FAB.
Status badge tones: draft `default`, issued `info`, partially_paid `warning`, paid `success`, overdue `error`, void `default` with strike icon.

#### 8. UX Requirements
Due column: `error` tone with "Overdue 3 d" text; upcoming due within 3 days `warning`. Amount formatting en-IN. Filters visible as removable tags. Persist last tab per user? No — URL-driven; default `all`. Export button shows "Exports current filters".

#### 9. States
Initial → Loading (skeleton 8 rows) → Success / Empty (3 variants) / Error. Row-level "Saving…" after record payment until refetch. Offline: last page cached in slice for read-only view with banner.

#### 10. Validation Rules
`date_from ≤ date_to` → "From date must be before To date"; `amount_min ≤ amount_max`; page_size ≤ 100 (server clamps).

#### 11. Business Rules
1. `BR-1` `all` excludes `draft` and `void`; `meta.totals` exclude `void` always.
2. `BR-2` Overdue derived nightly; the list additionally computes `is_overdue = due_on < today AND status IN (issued, partially_paid)` client-side for same-day accuracy (badge text), while the tab uses stored status.
3. `BR-3` Sorting by party uses `party_snapshot->>'name'` (walk-ins sort by `walk_in_name`, NULLs last).
4. `BR-4` Default date range This FY (tenant `fy_start_month`).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View list | `sales.invoice.read` / `sales.estimate.read` | ✅ | ✅ | ✅ | ✅ |
| Record payment action | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| Void action | `sales.invoice.void` | ✅ | ✅ | ❌ | ❌ |
| Export CSV | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Created-by filter | owner/admin | ✅ | ✅ | ❌ | ✅ |

#### 13. Edge Cases
1. `EC-1` Tenant with 0 invoices but drafts → All tab empty state variant "No issued bills yet; 2 drafts" linking to Draft tab.
2. `EC-2` Search "0042" matches `INV/26-27/0042`, `BOS/26-27/0042`; results grouped by kind badge.
3. `EC-3` Party renamed → list shows snapshot name (documents immutable); filter by party id still works.
4. `EC-4` Date range spanning FYs → numbers from both series shown; sort by number is lexical within FY — hint shown.
5. `EC-5` 100k rows export → RPT-08 async job.
6. `EC-6` Row voided by another user while drawer open → action returns 409, drawer refreshes.

#### 14. API Requirements
`GET /sales/invoices?status=&party_id=&date_from=&date_to=&q=&amount_min=&amount_max=&kind=&created_by=&ordering=&page=&page_size=&fields=` → `data[]` (list fields: id, kind, number, status, party {id,name} | null, walk_in_name, document_date, due_on, grand_total, amount_paid, amount_due, created_by {id,name}), `meta { page, page_size, total, total_pages, totals { count, grand_total, amount_due }, tabs { all, unpaid, overdue, paid, draft, void } }`. Export via `GET /reports/sales-register.csv?…` (RPT-03/08) or `IMP-02` list export. Frontend: `invoiceListSlice` (filters, page, rows, meta, status), thunk `fetchInvoices` (aborts previous), `salesService.listInvoices(params)`; `useInvoiceListFilters()` syncs `tab`/dates with URL.

#### 15. Database Impact
Reads `sales_document` via `IX(tenant_id, kind, status, document_date DESC)`, `IX(tenant_id, party_id, document_date DESC)`, `IX(tenant_id, number)`, overdue partial index. Suggested additional index for search: GIN trigram on `(party_snapshot->>'name')` — CR-SAL-3 (optional). Tab counts via one grouped query.

#### 16. Audit Requirements
None (reads). Export requests audited by RPT-08.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.sales.list_viewed { tab, has_filters, device }`, `ub.sales.list_searched { q_type: number|name|mobile }`, `ub.sales.list_row_action { action }`.

#### 19. Security
Tenant scope; mobile masking per role; `created_by` filter restricted; `q` length ≤ 64; ordering whitelist.

#### 20. Performance
Server: `COUNT` and totals in one query with `FILTER` aggregates; `total` capped estimation beyond 10k rows (`total_estimated: true`). Client: virtualisation not needed at 25–100 rows; abortable requests; skeleton.

#### 21. Testing
- `T-SAL08-1` API: tab filters map to statuses; totals exclude void; tab counts reflect date filter.
- `T-SAL08-2` API: search by number prefix, party trigram, mobile suffix.
- `T-SAL08-3` API: ordering whitelist rejects unknown (400).
- `T-SAL08-4` component: URL sync of `tab` and dates; page reset on filter change.
- `T-SAL08-5` component: mobile cards render; FAB present.
- `T-SAL08-6` permission: staff lacks Void action; accountant lacks Record payment.
- `T-SAL08-7` performance: 100k-row fixture p95 ≤ 500 ms (`EXPLAIN` uses index).
- `T-SAL08-8` E2E: filter Unpaid → record payment from drawer → row updates.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given 5 unpaid and 2 overdue bills this FY, when I open Bills, then tabs show Unpaid 5 (includes overdue) and Overdue 2.
- `AC-2` (US-2) Given INV/26-27/0042 for Ramesh (mobile …3210), when I search "3210", then the bill appears.
- `AC-3` (US-3) Given a date range and party filter, when applied, then totals show count/total/due for that set only.
- `AC-4` (US-4) Given a row, when I open its actions, then Print, Share, Record payment, Duplicate are available and Void appears only for owner/admin.
- `AC-5` (US-5) Given filters applied, when the accountant taps Export, then a CSV with the same rows downloads (or an export job starts for > 5k rows).

#### 23. Dependencies
SAL-02/03/05/06, PAY-01, RPT-03/08, IMP-02, `UbDataGrid`, nightly `sales.refresh_overdue`.

#### 24. Future Enhancements
Saved views (Zoho custom views), command palette search (P2 `UbCommandPalette`), bulk WhatsApp share, column totals per page.

---
### SAL-09 — Delivery challan (Phase 2)

#### 1. Business Objective
Document goods leaving the premises without a sale (supply on approval, job work, branch transfer, samples) so the transporter carries a valid challan and the invoice can be raised later from the same lines. Measures: challan → invoice conversion ≥ 60 %; challan issue ≤ 30 s.

#### 2. User Personas
**OW** — wholesalers, job-workers, distributors. **ST** — dispatch staff. **AC** — reconciles challans without invoices at period end.

#### 3. User Stories
1. `US-SAL09-1` As an owner I want to issue a delivery challan with items, quantities and a challan type so that goods move legally without an invoice.
2. `US-SAL09-2` As an owner I want to convert a challan (fully or partially) into an invoice so that billing follows delivery.
3. `US-SAL09-3` As an accountant I want a list of open challans so that nothing leaves un-billed.
4. `US-SAL09-4` As a driver I want the printed challan to show transporter and vehicle details.

#### 4. Functional Requirements
1. `FR-1` Documents with `kind='delivery_challan'` (exists in `sales_document.kind` and `platform_document_sequence.kind`, prefix `DC`), statuses `draft`, `issued`, `converted`, `void` (status set for this kind is not in canon §0.7 → CR-SAL-5).
2. `FR-2` Fields: party (required), `document_date`, challan type (`supply_on_approval`, `job_work`, `branch_transfer`, `sample`, `other`) stored in `meta.challan_type`, transporter name, vehicle number, e-way bill number (manual text, P3 automates) in `meta.transport`, lines (item, qty, unit, indicative rate optional), notes.
3. `FR-3` Challans shall show taxable value and GST **indicatively** (Rule 55 requires tax where applicable on the challan) using the SAL-02 engine but shall post **no ledger entry and no payment**.
4. `FR-4` Stock: issuing a challan shall post `inventory_stock_movement` rows `movement_type='sale_out'` with `source_type='sales_document'` (goods physically left; `unit_cost` snapshotted). Conversion to invoice shall **not** post stock again (the invoice's lines carry `meta.from_challan_line = true` and the issue service skips movements for them). Void of an unconverted challan reverses the movements; void of a converted challan is blocked (void the invoice, which reverses the movement it inherited — the reversal references the challan's movement via `reverses_id`).
5. `FR-5` `POST /sales/delivery-challans/{id}/convert { lines?: [{ line_no, qty }] }` shall create a draft invoice with the selected quantities (default all remaining); partial conversion keeps the challan `issued` with `meta.converted_qty` per line until fully converted, then `converted` with `converted_to_id` (last invoice). Endpoint not in canon → CR-SAL-5.
6. `FR-6` Print via SAL-03 with title "DELIVERY CHALLAN", challan type, transporter block, and "Not a tax invoice" footer; A4 only.
7. `FR-7` List with tabs all/draft/open/converted/void; "Open challans" total qty and value.

#### 5. Non-Functional Requirements
As SAL-02; mobile support for dispatch (camera scan P2).

#### 6. User Flow
Sales → Challans → New → party → type → items → transport details → Issue → print (3 copies: consignor/consignee/transporter) → later "Convert to invoice" → pick quantities → draft invoice → issue (no stock re-deduction).

#### 7. UI Requirements
Editor reuses `UbLineItemsEditor` (tax columns collapsed by default), `MLSelect` type, transporter fields group; conversion dialog `UbDialog` with per-line qty inputs capped at remaining. List: `UbDataGrid` with columns Date · Number · Party · Type · Qty · Value · Status.

#### 8. UX Requirements
Copy "Delivery challan" / "डिलीवरी चालान"; consequence text on issue "Stock −{n} items (goods dispatched)". Conversion banner on the challan: "2 of 5 boxes billed".

#### 9. States
draft → issued (open) → partially converted (issued with progress) → converted; void from draft/issued only.

#### 10. Validation Rules
Party required; ≥ 1 line; qty > 0; conversion qty ≤ remaining → "Only {n} remaining"; vehicle number pattern soft (`^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`) warning only.

#### 11. Business Rules
1. `BR-1` Challan never affects ledger or GST reports (except e-way context).
2. `BR-2` Stock leaves at challan issue; invoice conversion inherits movements (no double deduction).
3. `BR-3` Invoice prices default from the challan's indicative rate, else item price at conversion.
4. `BR-4` Challan number series `DC/26-27/0001`, ≤ 16 chars.
5. `BR-5` Challans older than `sales.challan_open_alert_days` (default 30, CR-SAL-2) appear as an in-app notification `challan_open` to owner weekly.

#### 12. Permissions
`sales.invoice.read/write` govern challans (no dedicated codename; canon has none for challan); void `sales.invoice.void`. Staff can issue and convert; accountant read-only.

#### 13. Edge Cases
1. `EC-1` Goods returned unsold after approval → "Return" action on challan posts `sale_return_in` for returned qty and reduces remaining (`meta.returned_qty`).
2. `EC-2` Party changes between challan and invoice → conversion keeps challan party; not editable on the converted invoice draft? Editable, with warning.
3. `EC-3` Conversion across FY → invoice numbered in the new FY.
4. `EC-4` Item archived after challan → conversion allowed (movement already done).
5. `EC-5` Void invoice created from challan → stock reversal posts; challan remaining qty restored and status back to `issued`.

#### 14. API Requirements
`GET/POST /sales/delivery-challans`, `PATCH/DELETE …/{id}` (draft), `POST …/{id}/issue`, `POST …/{id}/convert`, `POST …/{id}/return { lines[] }`, `POST …/{id}/void`, `POST …/{id}/share-links` — all CR-SAL-5. Frontend `challanEditorSlice`, thunks `issueChallan`, `convertChallan`; `salesService.*Challan`.

#### 15. Database Impact
`sales_document` (`kind='delivery_challan'`, `meta.challan_type`, `meta.transport`, `meta.converted_qty`, `meta.returned_qty`, `converted_to_id`), lines, movements, sequence, audit. Invoice lines `meta`? `sales_document_line` has no `meta` column → the "from challan" marker is stored in the invoice header `meta.from_challan = { challan_id, lines: { line_no: qty } }` (jsonb). No schema change.

#### 16. Audit Requirements
`challan.issued`, `challan.converted { invoice_id, lines }`, `challan.returned`, `challan.voided`.

#### 17. Notifications
In-app `challan_open` weekly digest (owner). WhatsApp share text EN `Delivery challan {number} from {shop} for {party}: {qty} items. View: {link}` / HI `{shop} से {party} के लिए डिलीवरी चालान {number}: {qty} आइटम। देखें: {link}`.

#### 18. Analytics / Event Tracking
`ub.sales.challan_issued { type, lines }`, `ub.sales.challan_converted { partial }`, `ub.sales.challan_returned`.

#### 19. Security
As SAL-02; transporter fields sanitised.

#### 20. Performance
As SAL-02.

#### 21. Testing
- `T-SAL09-1` API: issue posts `sale_out`; no ledger.
- `T-SAL09-2` API: convert full → invoice issue skips movements; stock unchanged.
- `T-SAL09-3` API: partial convert twice → status `converted` after last; caps enforced.
- `T-SAL09-4` API: void converted → blocked; void invoice → challan reopens.
- `T-SAL09-5` component: conversion dialog caps.
- `T-SAL09-6` E2E: challan → print → convert → issue → stock once.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given 5 boxes, when I issue a job-work challan, then stock −5 and no khata entry exists.
- `AC-2` (US-2) Given the challan, when I convert 3 boxes, then a draft invoice with 3 boxes opens and issuing it does not change stock; challan shows "3 of 5 billed".
- `AC-3` (US-3) Given open challans, when the accountant opens the Open tab, then remaining quantities and values are listed.
- `AC-4` (US-4) Given transporter and vehicle entered, when printed, then the challan shows them and the challan type.

#### 23. Dependencies
SAL-02/03/05, INV-06, SAL-13 (e-way, P3), CR-SAL-5.

#### 24. Future Enhancements
e-Way bill generation (SAL-13), challan against sales order (SAL-11), batch/serial capture (INV-16/18).

---

### SAL-10 — Recurring invoices (Phase 2)

#### 1. Business Objective
Service businesses (tuition, gyms, subscriptions, maintenance contracts, rentals) bill the same party every period; a recurring profile generates the draft (or issued) invoice on schedule so nothing is missed. Measures: ≥ 25 % of `services`/`professional` tenants create a profile; generation job success ≥ 99.9 %.

#### 2. User Personas
**OW** — sets up profiles. **ST** — reviews generated drafts. **CU** — receives invoices on schedule (WhatsApp manual or automated in P2 messaging).

#### 3. User Stories
1. `US-SAL10-1` As an owner I want to create a recurring profile from an existing invoice with a frequency and start/end so that monthly bills generate themselves.
2. `US-SAL10-2` As an owner I want to choose whether generated invoices are drafts for review or issued automatically so that I control risk.
3. `US-SAL10-3` As an owner I want to pause, resume or end a profile.
4. `US-SAL10-4` As staff I want a "Generated today" list so that I can send them.

#### 4. Functional Requirements
1. `FR-1` A profile entity `sales_recurring_profile` (new table → CR-SAL-6) stores: party, template payload (lines, discounts, notes, terms, POS, due days), `frequency ∈ {weekly, monthly, quarterly, yearly}`, `interval` (every n), `start_on`, `end_on NULL`, `next_run_on`, `day_of_month` (1–28 or `last`), `auto_issue boolean`, `status ∈ {active, paused, ended}`, `last_generated_id`, `occurrences_count`.
2. `FR-2` Runner task `sales.generate_recurring` (daily 06:00 IST via `run_scheduler`) shall, for each active profile with `next_run_on ≤ today`, create an invoice from the template (draft, or issued when `auto_issue` and validation passes), stamp `meta.recurring_profile_id`, advance `next_run_on`, and end the profile when `end_on` passed; idempotent per `(profile_id, run_date)` via `platform_job` payload key.
3. `FR-3` Auto-issue shall apply SAL-02 rules; failures (insufficient stock, credit limit block, archived party) shall fall back to a **draft** plus an in-app notification `recurring_needs_attention`.
4. `FR-4` Prices: `price_mode ∈ {fixed, current}` — fixed uses template prices; current refreshes from item master at generation.
5. `FR-5` Profiles can be created from an issued invoice ("Make recurring") or from scratch; edits apply to future runs only.
6. `FR-6` List of profiles with next run, party, amount, status; actions pause/resume/end/run now (owner).
7. `FR-7` Generated invoices show a banner "Generated from recurring profile {name}" and appear in a "Generated today" filter in SAL-08 (`?recurring=today`).

#### 5. Non-Functional Requirements
Job processes 10k profiles in ≤ 5 min; time zone Asia/Kolkata; retries 3× with backoff on transient errors; no duplicate generation across runner restarts.

#### 6. User Flow
Invoice detail → "Make recurring" → sheet: name, frequency Monthly, day 1, start next month, end none, auto-issue off → Save → profile active → on day 1 draft appears; owner reviews, issues, shares.

#### 7. UI Requirements
Route `/sales/recurring` list (`UbDataGrid`) + `UbDrawer` editor: `MLSelect` frequency, `MLInput` interval, `UbDateInput` start/end, day-of-month select, `MLSwitch` auto-issue, price mode radio, template line preview (read-only `UbLineItemsEditor`). Status badges active `success`, paused `warning`, ended `default`.

#### 8. UX Requirements
Copy "Recurring bill" / "दोहराने वाला बिल"; explain auto-issue risk inline ("Issued bills post to khata and stock automatically"). Next run date shown relative ("in 12 days").

#### 9. States
active / paused / ended; generation result per run: `generated_draft`, `generated_issued`, `failed` (visible in profile history).

#### 10. Validation Rules
Party required (no walk-in recurring); `start_on ≥ today`; `end_on > start_on`; `interval` 1–12; `day_of_month` 1–28 or last → "Choose 1–28 or Last day"; template ≥ 1 line.

#### 11. Business Rules
1. `BR-1` Generation date = `next_run_on`; `document_date` = that date; `due_on` = date + due days.
2. `BR-2` Months with fewer days: `last` = actual month end; otherwise day clamp is unnecessary (≤ 28).
3. `BR-3` Profiles never generate retroactively more than one missed occurrence; missed runs (server down) generate once with the original date and skip ahead.
4. `BR-4` Ending a profile does not affect generated documents.
5. `BR-5` Party archived → profile auto-paused with notification.

#### 12. Permissions
Create/edit/pause/end: `sales.invoice.write` + role owner/admin (staff cannot manage profiles); view: `sales.invoice.read`; generated documents follow SAL-02 permissions.

#### 13. Edge Cases
1. `EC-1` Tax rate changed → generated invoice uses rates as of its date (SAL-02 FR-17); fixed price mode keeps prices, tax recomputed.
2. `EC-2` `auto_issue` with credit-limit `block` → draft + notification (FR-3).
3. `EC-3` Plan limit reached → draft not created; notification `plan_limit_reached`.
4. `EC-4` Two runners overlap → job lock (`platform_job` status `running` with lease) prevents duplicates.
5. `EC-5` Owner runs "Run now" on a paused profile → allowed once, does not resume.

#### 14. API Requirements
`GET/POST /sales/recurring-profiles`, `GET/PATCH /sales/recurring-profiles/{id}`, `POST …/{id}/pause|resume|end|run-now`, `GET …/{id}/history` — CR-SAL-6. Frontend `recurringProfilesSlice`, thunks `fetchRecurringProfiles`, `saveRecurringProfile`, `runRecurringNow`; `salesService.recurring*`.

#### 15. Database Impact
New table `sales_recurring_profile` (CR-SAL-6) with IX(tenant_id, status, next_run_on); `platform_job` rows; generated `sales_document` (`meta.recurring_profile_id`).

#### 16. Audit Requirements
`recurring.created/updated/paused/resumed/ended`, `recurring.generated { profile_id, document_id, issued }` (actor `system`), `recurring.failed { reason }`.

#### 17. Notifications
In-app `recurring_generated` (daily digest: "3 bills generated today"), `recurring_needs_attention`. WhatsApp share of generated invoices per SAL-03 (manual); automated sending requires NTF-05/06 (P2 messaging).

#### 18. Analytics / Event Tracking
`ub.sales.recurring_created { frequency, auto_issue }`, `ub.sales.recurring_generated { issued, failed_reason }`.

#### 19. Security
Owner/admin only for profiles; job runs as `actor_type='system'`; template payload validated on save and again at generation.

#### 20. Performance
Runner selects due profiles with the index and processes in batches of 200 in separate transactions.

#### 21. Testing
- `T-SAL10-1` unit: `next_run_on` progression monthly day 31 → last day handling; quarterly; yearly (leap day).
- `T-SAL10-2` job: idempotent re-run same day; missed run generates once.
- `T-SAL10-3` API: auto-issue fallback to draft on insufficient stock + notification.
- `T-SAL10-4` API: pause/resume/end transitions; run-now.
- `T-SAL10-5` permission: staff 403 on profile create.
- `T-SAL10-6` E2E: make recurring from invoice → simulate date → draft appears with banner.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given INV/26-27/0042, when I make it monthly from 1 Oct, then on 1 Oct a draft invoice for the same party and lines exists dated 01/10/2026.
- `AC-2` (US-2) Given auto-issue on and stock sufficient, when the job runs, then the invoice is `issued` and the khata updated; given stock short, then a draft plus a notification.
- `AC-3` (US-3) Given a paused profile, when the date passes, then nothing generates; after resume, the next occurrence generates.
- `AC-4` (US-4) Given 3 generated drafts today, when staff opens Bills with "Generated today", then 3 rows appear.

#### 23. Dependencies
SAL-02, SAL-06, runner (ADR-012), NTF-01, CR-SAL-6.

#### 24. Future Enhancements
Automated WhatsApp/email delivery (NTF-05/06), customer auto-pay via PA mandates (UPI AutoPay, P3), proration.

---

### SAL-14 — Customer-facing invoice page & pay (Phase 2)

#### 1. Business Objective
Turn the public invoice link into a payment surface: the customer sees the bill on any phone, pays via UPI intent or the payment aggregator (PAY-06), and the invoice status updates automatically via webhook — closing the "money debited, ledger not updated" gap (research §C.2). Measures: ≥ 30 % of shared unpaid invoices paid through the page within 7 days; webhook-to-status latency ≤ 30 s.

#### 2. User Personas
**CU** — pays. **OW/ST** — share links, see status flip to paid. **PA** — brands the page.

#### 3. User Stories
1. `US-SAL14-1` As a customer I want to open a link and see the invoice with the amount due and a Pay button so that I can pay without an app account.
2. `US-SAL14-2` As a customer I want UPI apps to open with the amount prefilled so that I do not mistype.
3. `US-SAL14-3` As an owner I want the invoice to become paid automatically when the customer pays via the aggregator so that I do not record it manually.
4. `US-SAL14-4` As a customer I want to download the invoice as PDF from the page.
5. `US-SAL14-5` As a partner I want the page to carry my/tenant branding.

#### 4. Functional Requirements
1. `FR-1` Public route `/d/{token}` (Next.js) renders `InvoicePrintA4` in a responsive wrapper (`PublicDocumentPage`) using `GET /public/d/{token}`; mobile shows a summary card (number, shop, total, due) with a sticky "Pay ₹{due}" button; full invoice below.
2. `FR-2` Pay options: (a) **UPI intent** (MVP capability, PAY-03): builds `upi://pay` with `am = amount_due`, `tr` = payment request short code; shows QR on desktop; (b) **Aggregator** (PAY-06): `POST /payment-requests { document_id, amount }` creates a `payments_request` (`provider='razorpay'`) and opens the provider checkout; webhook `POST /webhooks/payments/razorpay` posts the payment (PAY-01 service) with allocation to the document and marks the request `paid`.
3. `FR-3` For UPI intent (no callback), the page shall show "Paid? Enter UTR" → `POST /payment-requests/{id}/claim { utr }` moves the request to `pending`, creating an entry in the tenant's unmatched/claims queue (PAY-07) for one-tap confirmation; status shows "Awaiting confirmation" — endpoint CR-SAL-7.
4. `FR-4` The page shall poll `GET /public/d/{token}` every 5 s while a payment is in progress (max 3 min) and flip to "Paid ✓" when `amount_due = 0`.
5. `FR-5` Partial payment: "Pay other amount" allowed if tenant setting `sales.public_partial_pay = true` (CR-SAL-2), min ₹1.
6. `FR-6` PDF download: Phase 2 server-side PDF (`GET /public/d/{token}.pdf`, ADR-014 P2) — until then the page offers Print/Save as PDF.
7. `FR-7` Branding: tenant logo/primary colour; partner footer (`platform_partner.branding.legal_footer`); `app_name`.
8. `FR-8` Link lifecycle: expiry per share link; expired → message with shop contact (tenant phone) to request a new link; void document → VOID watermark, pay hidden; paid → receipt view with payment details (mode, date, UTR last 4).
9. `FR-9` Owner-side: invoice detail shows "Viewed by customer on {date}" (view count stored in `meta.public_views`) and "Paid online" badge for aggregator payments.
10. `FR-10` Estimates on the public page offer "Accept" → `POST /public/d/{token}/accept` → estimate `accepted` (CR-SAL-7); credit notes render read-only.

#### 5. Non-Functional Requirements
LCP ≤ 2.5 s on 3G; ≤ 150 kB JS; no login; WCAG AA; Hindi/English toggle on page; checkout handled by provider SDK loaded only on Pay tap (dependency ADR needed for provider SDK — PAY-06 scope).

#### 6. User Flow
Customer taps WhatsApp link → page loads → "Pay ₹1,772" → sheet: "Pay with any UPI app" (intent) / "Pay with card/netbanking" (aggregator) → pays → returns → page polls → "Paid ✓ Thank you" → owner sees invoice `paid`, ledger `payment_in`, notification "₹1,772 received from Ramesh (online)".

#### 7. UI Requirements
`PublicDocumentPage` (features/sales/components/public/): header with logo + shop name; summary `MLCard`; `MLButton` primary Pay; `UbQrCode` on ≥ 768 px; `MLDrawer` pay options; status banner; language toggle (`MLToggleGroup`); print button. Owner detail: `UbStatusBadge` "Paid online", views caption.

#### 8. UX Requirements
Copy in customer tone: "Bill from {shop}" / "{shop} का बिल"; "Pay ₹{due}" / "₹{due} भुगतान करें"; "Paid? Enter UTR" / "भुगतान किया? UTR दर्ज करें". Never expose internal ids or costs. Show the shop's phone for disputes.

#### 9. States
loading · ready-unpaid · paying (provider open) · awaiting-confirmation (UTR claim) · paid · partially paid · expired-link · void · error.

#### 10. Validation Rules
UTR 12 digits (or 22 alnum for IMPS/NEFT) → "Enter a valid UTR"; custom amount ≥ 1 and ≤ due; token format; rate limits.

#### 11. Business Rules
1. `BR-1` Payment amount cannot exceed `amount_due`; provider order amount fixed server-side.
2. `BR-2` Webhook idempotent on `provider_payment_id`; payment posted once; allocation to the document; excess (should not happen) → advance.
3. `BR-3` UTR claims never post money; they create a `payments_request` status `pending` awaiting owner confirmation (PAY-07) — the owner confirms → PAY-01 payment recorded.
4. `BR-4` Page view increments `meta.public_views` (server-side on GET, throttled 1/min per token).
5. `BR-5` Expired link cannot be used to pay even if the document is unpaid.

#### 12. Permissions
Public (token). Owner-side settings: `platform.tenant.manage` (enable online pay, partial pay). Payment posting from webhook runs as `actor_type='webhook'`.

#### 13. Edge Cases
1. `EC-1` Customer pays twice (UPI intent then aggregator) → second payment becomes advance; owner notified; refund via SAL-04/PAY-05 flow.
2. `EC-2` Webhook delayed > 3 min → page stops polling with "We'll update once the bank confirms"; later status correct.
3. `EC-3` Invoice voided while customer pays → payment lands as advance for party (or unallocated for walk-in); owner prompted.
4. `EC-4` Walk-in invoice paid online is impossible (already paid in full); page shows receipt.
5. `EC-5` Tenant VPA missing and PA not configured → Pay hidden; "Contact shop to pay".
6. `EC-6` Provider failure → request `failed`; page offers retry.

#### 14. API Requirements
`GET /public/d/{token}` (adds `pay_options { upi_intent_url?, qr_svg_url?, aggregator_enabled, partial_allowed }`, `payment_status`), `POST /public/d/{token}/payment-requests { amount, method: upi|aggregator }` (creates `payments_request` bound to token; CR-SAL-7), `POST /public/d/{token}/claim-utr { request_id, utr }` (CR-SAL-7), `POST /public/d/{token}/accept` (estimates; CR-SAL-7), `POST /webhooks/payments/razorpay` (PAY-06), `GET /public/d/{token}.pdf` (P2). Frontend `publicDocumentSlice` (no auth interceptor), `publicService.ts`.

#### 15. Database Impact
`payments_request` (P2 table exists), `payments_payment`, `payments_allocation`, `ledger_entry`, `sales_document` (`amount_paid/due`, `status`, `meta.public_views`), `payments_vpa_mapping` (learned), `notifications_notification`.

#### 16. Audit Requirements
`public.document_viewed` (metadata only, throttled), `payment.recorded` (webhook actor), `payment_request.created/paid/claimed`, `estimate.accepted { via: public }`.

#### 17. Notifications
Owner in-app `payment_received_online` ("₹1,772 received from Ramesh for INV/26-27/0042 (UPI)"); party SMS/WhatsApp receipt (P2 templates). WhatsApp share text (owner → customer) as SAL-03 with `{link}` to this page.

#### 18. Analytics / Event Tracking
`ub.sales.public_page_viewed`, `ub.sales.public_pay_clicked { method }`, `ub.sales.public_payment_succeeded { method, latency_s }`, `ub.sales.public_utr_claimed`, `ub.sales.public_estimate_accepted`.

#### 19. Security
Token hashed; per-token rate limit 60/min; webhook HMAC verification, replay protection; no PII beyond party display name; CSP restricts provider SDK origins; amounts server-authoritative; `noindex`.

#### 20. Performance
Static shell + client fetch; QR SVG inline; polling capped; CDN-cacheable assets only.

#### 21. Testing
- `T-SAL14-1` API: public GET pay options by configuration matrix (VPA/PA on-off).
- `T-SAL14-2` API: create payment request → provider order amount = due; webhook → payment + allocation + status `paid`; duplicate webhook ignored.
- `T-SAL14-3` API: UTR claim → request `pending`; owner confirm → payment.
- `T-SAL14-4` API: expired token → 404; void → pay hidden.
- `T-SAL14-5` component: polling flips to Paid; language toggle.
- `T-SAL14-6` security: HMAC invalid → 400; rate limit → 429.
- `T-SAL14-7` E2E (sandbox): share → pay → owner sees paid.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given an unpaid invoice link, when the customer opens it on mobile, then the summary shows ₹1,772 due and a Pay button.
- `AC-2` (US-2) Given the UPI option, when tapped, then a `upi://pay` intent with `am=1772.00` opens.
- `AC-3` (US-3) Given aggregator payment success, when the webhook arrives, then within 30 s the invoice is `paid`, the khata shows `payment_in`, and the owner gets a notification.
- `AC-4` (US-4) Given the page, when the customer taps Download, then a PDF (or print dialog at MVP) is produced.
- `AC-5` (US-5) Given partner X's tenant, when the page renders, then tenant logo and partner legal footer appear.

#### 23. Dependencies
PAY-03/06/07, NTF-01, WLB-01/02, SAL-03, PTY-09 (shared token patterns), ADR for provider SDK, CR-SAL-7.

#### 24. Future Enhancements
Customer portal with all bills and statement (PTY-09 extension), saved payment methods, EMI/BNPL offers via partner (Future), dispute/comment thread.

---

## 17.10 Reports (RPT)

Shared conventions for every report FRD in this section (referenced as **RPT-common**):

- **Frontend:** `features/reports/` with `api/reportsService.ts` (`getDashboard()`, `getReport(name, params)`, `requestExport(name, params, format)`, `getExport(id)`), `redux/reportSlice.ts` (state keyed by report name: `{ params, rows, totals, meta, status, error }`), `redux/dashboardSlice.ts`, `redux/exportSlice.ts`, thunks in `redux/reportsThunk.ts` (`fetchDashboard`, `fetchReport`, `requestExport`, `pollExport`). Shared components `ReportPageShell` (title, `UbDateRangePicker` with FY presets, filter bar, Export button, totals row), `ReportTable` (thin `UbDataGrid` config with right-aligned `ds-num` columns, sticky totals footer), `ReportEmpty`. Routes `app/(app)/reports/page.tsx` (index of reports by permission) and `app/(app)/reports/[name]/page.tsx`.
- **Backend:** `reports/selectors.py` builds one SQL/ORM query per report returning rows + totals; `reports/services/export.py` streams CSV; `reports/views.py` handles `format`.
- **CSV rules (RPT-08):** UTF-8 with BOM, RFC 4180 quoting, `\r\n` line ends, header row exactly as listed in each FRD, amounts as plain decimals `1234.50` (no grouping, no ₹), quantities up to 3 dp, dates `YYYY-MM-DD`, booleans `true/false`, empty string for NULL; file name `<report>_<from>_<to>.csv` (e.g. `sales-register_2026-04-01_2026-09-18.csv`); a final `TOTAL` row only where the FRD says so.
- **Date semantics:** business dates in tenant timezone; `date_to` inclusive; default range = FY-to-date unless stated.
- **Permissions:** `reports.basic.read` (dashboard, day book, stock summary, aging, sales/purchase registers without cost columns), `reports.financial.read` (GST summary, profit, cost/valuation columns, staff performance), `reports.export` (any CSV/XLSX). Role matrix: owner ✅ all; admin ✅ all; staff `reports.basic.read` only; accountant `reports.basic.read` + `reports.financial.read` + `reports.export`.
- **Void handling:** voided documents are excluded from sums and listed only where a report says "flag void".
- **Caching:** dashboard ≤ 60 s (`reports_snapshot` or in-process cache keyed by tenant + minute); other reports uncached at MVP except aging for tenants > 5k ledger rows (nightly snapshot).

---

### RPT-01 — Dashboard

#### 1. Business Objective
Answer the owner's five daily questions on one screen — what do I have to collect, what do I owe, who is due today, what did I sell today, what am I running out of — and make each answer a tap away from action. Measures: dashboard is the first screen for ≥ 90 % of sessions; p95 render ≤ 800 ms; tile → action click-through ≥ 30 %.

#### 2. User Personas
**OW** (primary), **AC** (read), **ST** (restricted tiles: today's sales and low stock only when `reports.basic.read`).

#### 3. User Stories
1. `US-RPT01-1` As an owner I want to see total receivable and payable so that I know my exposure.
2. `US-RPT01-2` As an owner I want due-today and overdue buckets so that I know whom to call.
3. `US-RPT01-3` As an owner I want today's sales and cash in hand so that I can close the day.
4. `US-RPT01-4` As an owner I want a low-stock count so that I reorder in time.
5. `US-RPT01-5` As an owner I want recent activity and top debtors so that I catch mistakes and chase the biggest balances.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/dashboard` shall return `tiles`, `recent_activity[]`, `top_debtors[]`, `low_stock_items[]` in one response, cached ≤ 60 s per tenant.
2. `FR-2` Tile definitions (all tenant-scoped, amounts `Decimal` strings):

| Tile | Definition | Query (normative) | Tone | Tap → |
|---|---|---|---|---|
| To collect | Σ positive party balances | `SELECT COALESCE(SUM(balance),0) FROM parties_party WHERE tenant_id=:t AND status='active' AND balance > 0` | error (receivable) | Parties `balance=owes_me` |
| To pay | Σ absolute negative party balances | `… SUM(-balance) … WHERE balance < 0` | success | Parties `balance=i_owe` |
| Due today | Parties with `collection_date = today` and balance > 0: count + Σ balance | `SELECT COUNT(*), SUM(balance) FROM parties_party WHERE collection_date = :today AND balance > 0 AND status='active'` | warning | Parties `collection=today` |
| Overdue | Parties with `collection_date < today` and balance > 0, **plus** invoices `status='overdue'` amount (shown as secondary line "₹x in 4 bills") | parties: `… collection_date < :today …`; invoices: `SELECT COUNT(*), SUM(amount_due) FROM sales_document WHERE kind IN ('invoice','bill_of_supply') AND status='overdue'` | error | Parties `collection=overdue` / Bills tab overdue |
| Today's sales | Σ `grand_total` of `invoice`/`bill_of_supply` with `document_date = today` and `status ≠ 'draft','void'` minus Σ `grand_total` of `credit_note` issued today (`status IN ('issued','applied')`); count of bills | `SUM(CASE kind…)` grouped in one query | default | Bills (date = today) |
| Cash in hand | Σ cash-mode inflows − outflows, all time: payments `direction='in'` cash shares + walk-in cash − payments `direction='out'` cash shares − expenses `mode='cash'` (`status='recorded'`) | `mode_breakup` unnested via `jsonb_array_elements`; see BR-3 | default | Cashbook (EXP-03) |
| Low stock | Count of items `track_stock AND status='active' AND on_hand ≤ reorder_point` (reorder_point NOT NULL); secondary "x out of stock" (`on_hand ≤ 0`) | join `inventory_item_stock` | warning / error when out > 0 | Items `stock=low` |
| Upcoming (7 d) | Parties with `collection_date` in (today, today+7], count + Σ | index `(tenant_id, collection_date)` | info | Parties `collection=upcoming` |

3. `FR-3` `recent_activity[]` (last 10): union of `ledger_entry` (posted, any type), `sales_document` issued/void, `payments_payment` recorded, `expenses_expense` recorded, `inventory_stock_adjustment` posted — each `{ type, at, title, amount?, direction?, party?, link }`, ordered by `created_at DESC`.
4. `FR-4` `top_debtors[]` (5): parties with highest positive balance `{ id, name, balance, collection_date, mobile_masked }`, with per-row quick actions Remind (LED-06) and Bill.
5. `FR-5` `low_stock_items[]` (5): `{ id, name, on_hand, reorder_point, unit }`.
6. `FR-6` Tiles hidden when the module is disabled (`inventory` off → no Low stock; `payments`/`expenses` off → no Cash in hand) or when the persona lacks permission (staff sees Today's sales, Low stock, Due today only).
7. `FR-7` A "Quick actions" row: You gave, You got, New bill, Add item, Remind — permission-gated.
8. `FR-8` Pull-to-refresh (mobile) and a refresh icon; the response includes `generated_at`; the UI shows "Updated 30 s ago".
9. `FR-9` First-use dashboard (no parties, no items): onboarding checklist card (Add party · Add item · Make first bill · Set UPI) replaces tiles until 1 party and 1 document exist.

#### 5. Non-Functional Requirements
p95 API ≤ 300 ms (cached) / ≤ 800 ms (cold); single request; skeleton tiles; tiles readable at 320 px in 2 columns; numbers `ds-metric-md`, short form ₹1.2 L / ₹3.4 Cr above 5 digits with full value on tooltip; i18n `reports.dashboard.*`; `aria-live` on refresh.

#### 6. User Flow
Login → dashboard → tiles skeleton → data → tap Overdue → parties filtered → Remind. Or tap Today's sales → Bills filtered today. Or top debtor → Remind → wa.me.

#### 7. UI Requirements
`app/(app)/dashboard/page.tsx` → `<DashboardPageContent/>`. Layout desktop: 4 tiles × 2 rows (`UbStatCard` with label, value, baseline "vs yesterday" for Today's sales only — baseline = yesterday's sales), then two columns: Recent activity (`UbTimeline`) left; Top debtors + Low stock cards right. Mobile: quick actions row (horizontal scroll), 2×4 tile grid, then stacked cards. Components: `UbStatCard`, `UbTimeline`, `MLCard`, `UbAmount`, `UbEmptyState`, `UbSkeleton`, `UbHelpHint` on Cash in hand ("Cash from payments and expenses recorded as cash").

#### 8. UX Requirements
Colour semantics: To collect / Overdue in error tone; To pay in success; others neutral. Labels: "To collect" / "लेना है", "To pay" / "देना है", "Due today" / "आज की वसूली", "Overdue" / "बकाया", "Today's sales" / "आज की बिक्री", "Cash in hand" / "नकद", "Low stock" / "कम स्टॉक", "Upcoming" / "आने वाली". Every tile has a baseline or secondary line (Koper "never a naked number"). Empty tile shows "₹0" not blank.

#### 9. States
Loading (8 skeleton tiles) · Ready · Stale (offline: last cached response with banner "Showing data from 10:32") · Error (retry) · First-use (checklist) · Restricted (staff subset).

#### 10. Validation Rules
None (no inputs). Server validates permission per tile and omits disallowed tiles rather than 403-ing the whole response.

#### 11. Business Rules
1. `BR-1` Party balance sign convention per canon §0.2; suppliers with positive balance (they owe us) count in To collect.
2. `BR-2` Today's sales includes walk-in and party sales; excludes estimates, drafts, voids; nets credit notes issued today (not applied date).
3. `BR-3` Cash in hand = Σ over `payments_payment` `status='recorded'` of `mode_breakup[].amount WHERE mode='cash'` signed by direction (`in` +, `out` −) − Σ `expenses_expense.amount WHERE mode='cash' AND status='recorded'`. Opening cash is not modelled at MVP (Future: accounting module); tile tooltip states "since you started using DigiKhaato".
4. `BR-4` Low stock uses `inventory_item_stock` cache; recomputed by `recalc_stock` if drift.
5. `BR-5` Cache invalidation: write-through — services that post ledger/stock/documents call `reports.cache.invalidate(tenant_id)`; otherwise TTL 60 s.
6. `BR-6` Overdue tile combines party-level collection dates (khata users) and invoice-level `overdue` (billing users); the primary number is the party-level Σ balance; the secondary line is invoice-level.

#### 12. Permissions
| Tile/section | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| To collect / To pay / Due today / Overdue / Upcoming / Top debtors | `reports.basic.read` + `parties.party.read` | ✅ | ✅ | ✅ (staff has parties read) | ✅ |
| Today's sales | `reports.basic.read` + `sales.invoice.read` | ✅ | ✅ | ✅ | ✅ |
| Cash in hand | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Low stock | `inventory.stock.read` | ✅ | ✅ | ✅ | ✅ |
| Recent activity | `reports.basic.read` (rows filtered by per-entity read permission) | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. `EC-1` Tenant timezone midnight: "today" computed in Asia/Kolkata even if server UTC.
2. `EC-2` Party with collection date in the past but balance 0 → not overdue.
3. `EC-3` Credit note larger than today's sales (returns day) → Today's sales negative; shown as −₹x with tone error.
4. `EC-4` 50k parties → tile query uses `IX(tenant_id, balance)`; ≤ 50 ms.
5. `EC-5` Module `ledger` disabled (billing-only tenant) → party tiles still shown (balances exist via documents).
6. `EC-6` Cache serves stale after a big import → invalidation hook on import commit.

#### 14. API Requirements
`GET /reports/dashboard` → `{ data: { generated_at, tiles: { to_collect: { amount }, to_pay: { amount }, due_today: { count, amount }, overdue: { count, amount, invoices: { count, amount } }, today_sales: { amount, count, yesterday_amount }, cash_in_hand: { amount }|null, low_stock: { count, out_count }|null, upcoming_7d: { count, amount } }, recent_activity: [...], top_debtors: [...], low_stock_items: [...], first_use: { has_party, has_item, has_document, has_upi } } }`. 200 only; tiles omitted per permission/module. Headers `Cache-Control: private, max-age=60`. Frontend `dashboardSlice`, thunk `fetchDashboard`, `reportsService.getDashboard()`.

#### 15. Database Impact
Reads `parties_party` (balance, collection_date), `sales_document`, `payments_payment` (`mode_breakup`), `expenses_expense`, `inventory_item`, `inventory_item_stock`, `ledger_entry`, `inventory_stock_adjustment`. Optional write `reports_snapshot` (report_name `dashboard`) for tenants > 5k entries. Indexes: existing `(tenant_id, balance)`, `(tenant_id, collection_date)`, `(tenant_id, kind, status, document_date DESC)`, `(tenant_id, payment_date DESC)`. Suggested: expression index on `payments_payment` for cash sums is unnecessary at MVP volumes.

#### 16. Audit Requirements
None.

#### 17. Notifications
None (the bell is NTF-01; dashboard shows unread count in header).

#### 18. Analytics / Event Tracking
`ub.reports.dashboard_viewed { first_use, tiles_visible[] }`, `ub.reports.dashboard_tile_clicked { tile }`, `ub.reports.dashboard_quick_action { action }`.

#### 19. Security
Tenant scope; masked mobiles in top debtors for staff; no cross-tenant cache key collision (key includes tenant id and permissions version `ver`).

#### 20. Performance
One SQL statement per tile group (3 statements total: parties aggregate, documents aggregate, cash/stock aggregates) executed in a single request; results cached 60 s; recent activity via `UNION ALL` limited 10 each then sorted in Python.

#### 21. Testing
- `T-RPT01-1` unit: each tile query against fixture (balances +/−, collection dates, overdue invoices, today's sales with credit note, cash breakup, low stock).
- `T-RPT01-2` unit: today in IST vs UTC boundary.
- `T-RPT01-3` API: staff response omits Cash in hand; accountant includes.
- `T-RPT01-4` API: module disabled omits Low stock.
- `T-RPT01-5` API: cache hit within 60 s; invalidated after invoice issue.
- `T-RPT01-6` component: skeleton → tiles; short-form ₹ formatting; first-use checklist.
- `T-RPT01-7` E2E: issue invoice → dashboard Today's sales increases.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given parties with balances +5,000, +2,000, −1,500, when I open the dashboard, then To collect = ₹7,000 and To pay = ₹1,500.
- `AC-2` (US-2) Given Ramesh collection date today (₹1,772) and Suresh yesterday (₹500), then Due today = 1 · ₹1,772 and Overdue = 1 · ₹500.
- `AC-3` (US-3) Given two bills today ₹1,772 and ₹898 and a credit note ₹465.81, then Today's sales = ₹2,204.19 (2 bills); given cash payments in ₹1,000 and a cash expense ₹200, then Cash in hand = ₹800.
- `AC-4` (US-4) Given 3 items at/below reorder point of which 1 is out, then Low stock shows 3 with "1 out of stock".
- `AC-5` (US-5) Given recent actions, then the activity list shows the last 10 with links, and Top debtors lists the 5 largest balances with Remind.

#### 23. Dependencies
LED-05/09, PTY-02, SAL-08, PAY-01, EXP-01/03, INV-07/08, NTF-01, PLT-06 (modules), runner `sales.refresh_overdue`.

#### 24. Future Enhancements
Sparklines (`UbSparkline`) for 7-day sales, custom tiles (Zoho custom dashboards), scheduled daily summary (RPT-14), profit tile (RPT-10).

---

### RPT-02 — Day book

#### 1. Business Objective
A chronological register of everything that happened on a day or range — bills, purchases, payments in/out, expenses, manual khata entries — with running cash and bank positions, replacing the paper "roznamcha". Measures: used by ≥ 50 % of owners weekly; p95 ≤ 600 ms for a month.

#### 2. User Personas
**OW** — end-of-day check. **AC** — period audit.

#### 3. User Stories
1. `US-RPT02-1` As an owner I want all of today's transactions in one list with a closing cash figure so that I can tally the drawer.
2. `US-RPT02-2` As an accountant I want to filter by type and export so that I can post to accounting software.
3. `US-RPT02-3` As an owner I want each row to open the source document.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/day-book?date_from&date_to&type=&party_id=&created_by=&format=` returns rows ordered by business date then `created_at`, with opening cash/bank before `date_from` and running `cash_balance`, `bank_balance` after each row.
2. `FR-2` Row sources and mapping:

| Type code | Source | Amount sign for cash/bank | Columns |
|---|---|---|---|
| `sale` | `sales_document` kind invoice/bill_of_supply status ≠ draft/void, `document_date` | none (credit) — payments recorded separately | number, party/walk-in, grand_total, amount_due |
| `credit_note` | credit_note issued/applied | none | number, party, grand_total |
| `purchase` | `purchases_document` purchase_bill recorded+ | none | number, supplier, grand_total |
| `payment_in` | `payments_payment` direction in, recorded | + per mode_breakup (cash → cash; upi/bank/card/cheque → bank; other → neither) | number, party, amount, modes |
| `payment_out` | direction out | − | idem |
| `expense` | `expenses_expense` recorded | − by `mode` | number, category, party?, amount |
| `manual_gave` / `manual_got` | `ledger_entry` entry_type manual_* posted | `manual_got` with payment_mode → + cash/bank; `manual_gave` none | party, amount, note |
| `opening` / `write_off` / `reversal` / `correction` | `ledger_entry` | none | party, amount, reason |
| `stock_adjustment` | `inventory_stock_adjustment` | none | number, reason, lines count |

3. `FR-3` Totals footer: count per type, Σ sales, Σ purchases, Σ payments in, Σ payments out, Σ expenses, closing cash, closing bank.
4. `FR-4` Filters: type multi-select, party, created by (owner/admin), mode.
5. `FR-5` Default range: today. Presets: Today, Yesterday, This week, This month, Custom.
6. `FR-6` CSV headers: `date,time,type,number,party,description,debit,credit,mode,cash_balance,bank_balance,created_by,reference,source_id` where `debit` = money in (cash/bank +) and `credit` = money out for money rows; for non-money rows `debit/credit` empty and `description` carries the amount context (e.g. "Sale ₹1,772.00 credit").
7. `FR-7` Voided documents/payments appear as rows flagged `void` (type suffix `_void`) only when filter `include_void=true`; excluded from totals.

#### 5. Non-Functional Requirements
Cursor pagination `?cursor&limit=100` for ranges > 1 day; running balances computed server-side (window function) so pagination is consistent; mobile cards grouped by date (`UbTimeline`).

#### 6. User Flow
Reports → Day book → today → scroll → footer closing cash ₹800 → tap a payment row → payment detail → back.

#### 7. UI Requirements
`ReportPageShell` + `UbTimeline` (mobile) / `ReportTable` (desktop) columns: Time · Type (badge) · Number · Party · Description · In · Out · Mode · Cash · Bank · By. Type filter as `UbFilterTag` chips. Sticky footer with totals.

#### 8. UX Requirements
In amounts success tone, Out error tone; non-money rows muted amounts. Copy "Day book" / "रोज़नामचा". Opening balance row at top ("Opening cash ₹…").

#### 9. States
Loading skeleton · Empty ("No transactions on this day") · Ready · Error · Exporting.

#### 10. Validation Rules
Range ≤ 366 days → "Choose a range up to one year"; `date_from ≤ date_to`.

#### 11. Business Rules
1. `BR-1` Cash/bank classification of modes: `cash → cash`; `upi, bank, card, cheque → bank`; `other → unclassified` (shown in In/Out but not in balances).
2. `BR-2` Opening balances = Σ classified inflows − outflows before `date_from` (all time).
3. `BR-3` Ordering: `entry_date/document_date/payment_date ASC, created_at ASC`.
4. `BR-4` Rows are never duplicated: an invoice with immediate payment yields a `sale` row and a `payment_in` row.

#### 12. Permissions
`reports.basic.read` (rows filtered by entity read permissions); export `reports.export`; `created_by` filter owner/admin/accountant. Staff sees the day book without purchases if lacking `purchases.bill.read`.

#### 13. Edge Cases
1. `EC-1` Payment with split modes → one row, In = total, Mode "UPI 700 + Cash 300", cash balance +300, bank +700.
2. `EC-2` Backdated entry created today for last week → appears on its business date; a "recorded on" caption shows the actual creation date.
3. `EC-3` Reversal entries → shown as type `reversal` with link to original.
4. `EC-4` Expense `paid=false` (payable) → row with no cash effect, description "Payable".
5. `EC-5` 10k rows/month → cursor paging; export via job.

#### 14. API Requirements
`GET /reports/day-book?date_from&date_to&type=&party_id=&created_by=&include_void=false&cursor&limit=100&format=json|csv` → `{ data: { opening: { cash, bank }, rows[], closing: { cash, bank }, totals {…} }, meta: { next_cursor, has_more } }`. Frontend `fetchReport('day-book', params)`.

#### 15. Database Impact
Reads across `sales_document`, `purchases_document`, `payments_payment`, `expenses_expense`, `ledger_entry`, `inventory_stock_adjustment` using date indexes; `UNION ALL` in a CTE with window `SUM() OVER (ORDER BY date, created_at)`.

#### 16. Audit Requirements
Export request audited (RPT-08).

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'day-book', range_days, filters[] }`, `ub.reports.row_opened { type }`.

#### 19. Security
Tenant scope; per-entity permission filtering; export gated.

#### 20. Performance
Indexes `(tenant_id, entry_date)`, `(tenant_id, payment_date DESC)`, `(tenant_id, expense_date DESC)`, `(tenant_id, kind, status, document_date DESC)`; opening balance via one aggregate; `EXPLAIN` checked at 100k rows.

#### 21. Testing
- `T-RPT02-1` unit: mode classification and running balances (split payment).
- `T-RPT02-2` unit: opening balance excludes void.
- `T-RPT02-3` API: cursor paging consistent balances.
- `T-RPT02-4` API: staff without purchases read → no purchase rows.
- `T-RPT02-5` API: CSV headers exact.
- `T-RPT02-6` component: timeline grouping by date on mobile.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given today: sale ₹1,772 paid ₹1,000 cash + ₹772 UPI, expense ₹200 cash, when I open Day book, then rows show sale, payment (In 1,772; Cash +1,000; Bank +772), expense (Out 200), closing cash ₹800, bank ₹772.
- `AC-2` (US-2) Given type filter `payment_in,payment_out`, when exporting, then the CSV has only payment rows with the exact headers.
- `AC-3` (US-3) Given a sale row, when tapped, then the invoice detail opens.

#### 23. Dependencies
LED-01/03, SAL-02, PUR-01, PAY-01/02, EXP-01/03, RPT-08.

#### 24. Future Enhancements
Cash-drawer opening float and denomination count (P2), bank account split (P3 accounting), Tally XML (RPT-13).

---

### RPT-03 — Sales register

#### 1. Business Objective
Invoice-wise register with full tax breakup for the period — the accountant's source for GSTR-1 preparation and audit. Measures: register totals equal Σ documents (test); CSV opens correctly in Excel/Tally import; p95 ≤ 700 ms per quarter.

#### 2. User Personas
**AC** (primary), **OW**.

#### 3. User Stories
1. `US-RPT03-1` As an accountant I want every invoice, bill of supply and credit note for a period with taxable and tax columns so that I can prepare returns.
2. `US-RPT03-2` As an accountant I want B2B/B2C classification and party GSTIN on each row.
3. `US-RPT03-3` As an owner I want totals by status (paid/unpaid) for the period.
4. `US-RPT03-4` As an accountant I want line-level detail (HSN-wise) as an alternative view.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/sales-register?date_from&date_to&party_id=&status=&kind=&level=document|line&format=` returns document-wise rows by default.
2. `FR-2` Document-level columns (and CSV header, in order): `date,number,kind,status,party_name,party_gstin,gst_registration,pos_state,is_inter_state,reverse_charge,subtotal,discount,taxable_total,cgst,sgst,igst,cess,round_off,grand_total,amount_paid,amount_due,due_on,against_number,created_by`. Credit notes carry **negative** amounts in `taxable_total`, taxes and `grand_total` so column sums net correctly.
3. `FR-3` Line-level (`level=line`) columns: `date,number,kind,party_name,party_gstin,line_no,item_name,hsn_sac,qty,unit,unit_price,tax_inclusive,line_discount,taxable_value,tax_rate,cgst,sgst,igst,cess,line_total`.
4. `FR-4` Totals footer: count by kind, Σ taxable, Σ each tax, Σ grand total, Σ paid, Σ due; plus B2B vs B2C split (`party_gstin` present → B2B).
5. `FR-5` Voided documents included as rows with `status=void` and zero monetary columns when `include_void=true` (default true for accountant view so Table 13 counts reconcile; default false for owner? — single default: `include_void=false`, toggle in UI).
6. `FR-6` Filters: party, status multi, kind, B2B/B2C, inter/intra, created by.
7. `FR-7` Default range: current month; presets include GST periods (Month, Quarter, FY).

#### 5. Non-Functional Requirements
Server pagination 100 rows; CSV streaming; > 5k rows → export job (RPT-08); desktop-first (accountant) but mobile cards work.

#### 6. User Flow
Reports → Sales register → month → review totals → toggle Line-level → Export CSV → open in Excel.

#### 7. UI Requirements
`ReportPageShell` with `MLToggleGroup` Document/Line level, filters, `ReportTable` with sticky first columns (Date, Number), tax columns grouped under "GST" header, totals footer, B2B/B2C mini stats (`UbStatCard` compact). Row click → document detail.

#### 8. UX Requirements
Credit notes shown with negative amounts in error tone and a "CN" badge; void rows muted with badge. Copy "Sales register" / "बिक्री रजिस्टर".

#### 9. States
Loading · Empty ("No sales in this period") · Ready · Error · Exporting (job progress).

#### 10. Validation Rules
Range ≤ 366 days; `level ∈ {document, line}`; status codes valid.

#### 11. Business Rules
1. `BR-1` Sign convention: invoices/bills positive; credit notes negative; totals net.
2. `BR-2` `gst_registration` from `party_snapshot` (frozen), not current party.
3. `BR-3` B2B = `party_gstin_snapshot IS NOT NULL`.
4. `BR-4` `taxable_value` at line level is post-document-discount (SAL-02 BR-5), so Σ lines = document `taxable_total`.
5. `BR-5` Estimates and challans are never included.

#### 12. Permissions
`reports.basic.read` for document level without cost; `reports.financial.read` not required (no cost columns); export `reports.export`. Staff may view (basic) but cannot export.

#### 13. Edge Cases
1. `EC-1` Composition tenant → tax columns all 0; kind `bill_of_supply`.
2. `EC-2` Document dated in range but issued later (backdated) → included by `document_date`.
3. `EC-3` Credit note against previous-period invoice → appears in credit note's period.
4. `EC-4` Walk-in → `party_name` "Walk-in" + name; GSTIN empty; B2C.
5. `EC-5` Number sort across FYs → secondary sort by `document_date`.

#### 14. API Requirements
As FR-1; response `{ data: rows[], meta: { page…, totals { count_by_kind, taxable_total, cgst, sgst, igst, cess, grand_total, amount_paid, amount_due, b2b: { count, taxable, tax }, b2c: {…} } } }`; `format=csv` streams or 202 `{ export_id }`. Frontend `fetchReport('sales-register')`.

#### 15. Database Impact
Reads `sales_document` (+ `sales_document_line` for line level) with `(tenant_id, kind, status, document_date DESC)`; `party_snapshot` JSON fields.

#### 16. Audit Requirements
Export audited.

#### 17. Notifications
Export ready (RPT-08).

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'sales-register', level, range_days }`, `ub.reports.exported { report, rows, async }`.

#### 19. Security
Masked walk-in mobile not included in CSV (column omitted); party GSTIN is business data (included).

#### 20. Performance
Index scan on date; line level joins lines with `IX(document_id)`; CSV streamed with `StreamingHttpResponse` in 1k-row chunks.

#### 21. Testing
- `T-RPT03-1` API: totals equal Σ documents; credit notes negative; void excluded by default, included with flag and zero amounts.
- `T-RPT03-2` API: line level Σ taxable = document taxable_total (BR-10 example).
- `T-RPT03-3` API: CSV headers exact; BOM present; amounts plain.
- `T-RPT03-4` API: B2B/B2C split.
- `T-RPT03-5` permission: staff export → 403.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given the BR-10 invoice and a ₹465.81 credit note in September, when I open the register for September, then rows show +1,772.00 and −465.81 with taxes, and totals net to ₹1,306.19.
- `AC-2` (US-2) Given Ramesh has a GSTIN, then his row shows `party_gstin` and B2B; a walk-in row shows B2C.
- `AC-3` (US-3) Given 2 paid and 1 unpaid invoice, then totals show Σ paid and Σ due.
- `AC-4` (US-4) Given Line level, then rows per line with HSN and `taxable_value` appear and sum to document totals.

#### 23. Dependencies
SAL-02/04/05, RPT-07/08.

#### 24. Future Enhancements
Sales by item/category/salesperson (Zoho §A.29) → RPT-09/11; Tally XML (RPT-13).

---

### RPT-04 — Purchase register

#### 1. Business Objective
Bill-wise purchase register with tax and ITC eligibility for GSTR-3B inward figures and supplier reconciliation. Measures and structure mirror RPT-03.

#### 2. User Personas
**AC**, **OW**.

#### 3. User Stories
1. `US-RPT04-1` As an accountant I want bill-wise purchases with supplier GSTIN, supplier invoice number/date and tax columns so that I can reconcile with GSTR-2B.
2. `US-RPT04-2` As an accountant I want an ITC-eligible subtotal.
3. `US-RPT04-3` As an owner I want unpaid purchase totals.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/purchase-register?date_from&date_to&party_id=&status=&kind=&itc=&level=&format=`.
2. `FR-2` Document-level CSV header: `date,number,kind,status,supplier_name,supplier_gstin,supplier_invoice_number,supplier_invoice_date,pos_state,is_inter_state,reverse_charge,itc_eligible,subtotal,discount,taxable_total,cgst,sgst,igst,cess,round_off,grand_total,amount_paid,amount_due,due_on,against_number,created_by`. Debit notes (P2) negative.
3. `FR-3` Line level: as RPT-03 plus `unit_cost`, `itc_eligible`.
4. `FR-4` Totals: Σ per column; ITC-eligible Σ (cgst, sgst, igst, cess where `itc_eligible=true` and not reverse charge? — RCM ITC is claimable after payment; shown separately as `rcm_tax`).
5. `FR-5` Default range current month; GST period presets.
6. `FR-6` Filters: supplier, status, ITC eligible, inter/intra, kind.

#### 5. Non-Functional Requirements
As RPT-03.

#### 6. User Flow
Reports → Purchase register → month → filter ITC eligible → Export.

#### 7. UI Requirements
As RPT-03 with supplier columns; ITC badge; "RCM" badge when `reverse_charge`.

#### 8. UX Requirements
Copy "Purchase register" / "खरीद रजिस्टर". Debit notes negative in error tone.

#### 9. States
As RPT-03.

#### 10. Validation Rules
As RPT-03; `itc ∈ {true,false}`.

#### 11. Business Rules
1. `BR-1` Rows by `purchases_document.document_date` (our recording date), with `supplier_invoice_date` shown separately.
2. `BR-2` ITC-eligible tax = Σ taxes where `itc_eligible=true`; RCM tax reported separately (RPT-07 3.1(d)).
3. `BR-3` Purchase orders/GRNs (P2) excluded; only `purchase_bill` and `debit_note`.
4. `BR-4` Void excluded from sums; flag when `include_void=true`.

#### 12. Permissions
`reports.basic.read` + `purchases.bill.read`; cost columns at line level require `reports.financial.read`; export `reports.export`.

#### 13. Edge Cases
1. `EC-1` Composition tenant → purchases still carry supplier tax (paid, not claimable); `itc_eligible` forced false; register shows tax as cost.
2. `EC-2` Unregistered supplier → GSTIN empty; RCM may apply (flag from document).
3. `EC-3` Duplicate supplier invoice prevented upstream (`duplicate_supplier_invoice`).
4. `EC-4` Bill in INR only at MVP.

#### 14. API Requirements
As FR-1; totals `{ …, itc_eligible: { cgst, sgst, igst, cess }, rcm_tax }`. Frontend `fetchReport('purchase-register')`.

#### 15. Database Impact
Reads `purchases_document`, `purchases_document_line`; index `(tenant_id, kind, status, document_date DESC)` (mirrors sales).

#### 16. Audit Requirements
Export audited.

#### 17. Notifications
Export ready.

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'purchase-register' }`, `ub.reports.exported`.

#### 19. Security
Cost data gated by `reports.financial.read` at line level.

#### 20. Performance
As RPT-03.

#### 21. Testing
- `T-RPT04-1` API: totals; ITC subtotal excludes `itc_eligible=false`; RCM separate.
- `T-RPT04-2` API: composition → itc false.
- `T-RPT04-3` API: CSV headers exact.
- `T-RPT04-4` permission: staff line level without financial → cost omitted.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given two bills with supplier GSTINs, when I open the register, then rows show supplier invoice number/date and taxes.
- `AC-2` (US-2) Given one bill `itc_eligible=false`, then ITC-eligible totals exclude it.
- `AC-3` (US-3) Given one unpaid bill, then Σ due equals its `amount_due`.

#### 23. Dependencies
PUR-01/03/04, PUR-07 (debit notes, P2), RPT-07/08.

#### 24. Future Enhancements
GSTR-2B reconciliation (P3), landed cost columns (PUR-08).

---

### RPT-05 — Receivables / payables aging

#### 1. Business Objective
Give the owner and the accountant a party-wise picture of *how old* the outstanding money is, in both directions, as of any date — so collections start with the oldest balances and provisions can be made at year end. LED-09 specifies the algorithm and the ledger-home page; RPT-05 is the **report surface** of the same selector: both directions under Reports, `as_of` in the past, tag/party-type filters, party contact columns for collection work, exact CSV/XLSX columns, and the snapshot path for large tenants. Measures: Σ buckets = Σ party balances to the paisa (CI test); p95 ≤ 500 ms live for 100k entries, ≤ 100 ms from snapshot; ≥ 40 % of owners with > 20 debtors open the report monthly.

#### 2. User Personas
**OW** (collections priority), **AC** (provisioning, FY-end schedules), **ST** (collection staff: rows without totals cards? — no: staff has `reports.basic.read`, so rows and totals are visible; export is not).

#### 3. User Stories
1. `US-RPT05-1` As an owner I want receivables by party split into 0–30 / 31–60 / 61–90 / 90+ days so that I chase the oldest first.
2. `US-RPT05-2` As an owner I want the same for payables so that I know which supplier I have kept waiting longest.
3. `US-RPT05-3` As an accountant I want aging as of 31 March with a CSV/XLSX so that I can prepare the debtors schedule.
4. `US-RPT05-4` As an owner I want to filter by tag (area/route) and see the party's mobile and collection date beside the buckets so that the report doubles as a collection sheet.
5. `US-RPT05-5` As an owner of a large business I want the report to open instantly even with lakhs of entries.

#### 4. Functional Requirements
1. `FR-1` Endpoints `GET /reports/receivables-aging` and `GET /reports/payables-aging` with params `as_of` (default today), `tag`, `party_id`, `min_total`, `bucket` (`0_30|31_60|61_90|90_plus` — only parties with a non-zero amount in that bucket), `ordering` (`-90_plus` default, `-total`, `name`, `-oldest_days`), `page`, `page_size`, `fresh`, `format`.
2. `FR-2` Row shape: `{ party: { id, name, mobile_masked|mobile, is_customer, is_supplier, tags[] }, collection_date, credit_limit, buckets: { "0_30", "31_60", "61_90", "90_plus" }, total, oldest_entry_date, oldest_days, last_payment_date }`. `mobile` is unmasked for `parties.party.read` holders (all roles have it) — the report is a collection sheet.
3. `FR-3` `meta`: `{ as_of, totals: { "0_30", "31_60", "61_90", "90_plus", total, party_count }, cached_at | null, page, page_size, total, total_pages }`. Totals are over the **filtered** set (all pages).
4. `FR-4` Both endpoints call `ledger.selectors.aging(tenant, type, as_of, filters)` (LED-09 BR-2/BR-7) — one implementation; RPT-05 adds the joins to `parties_party` (mobile, collection_date, credit_limit), `parties_party_tag` and a `LATERAL` for `last_payment_date` (latest posted `payment_in` credit for receivable, `payment_out` debit for payable).
5. `FR-5` CSV header (exact, in order): `party_name,mobile,party_type,tags,collection_date,credit_limit,bucket_0_30,bucket_31_60,bucket_61_90,bucket_90_plus,total,oldest_entry_date,oldest_days,last_payment_date`. A final `TOTAL` row carries the four bucket sums and `total`; `party_name = TOTAL`, other text columns empty. File name `receivables-aging_<as_of>.csv` / `payables-aging_<as_of>.csv` (single date, no range). `party_type ∈ customer|supplier|both`. `tags` joined by `;`.
6. `FR-6` Snapshot: for tenants with > 5,000 posted `ledger_entry` rows the scheduled task `reports.refresh_snapshots` (02:00 IST, runner ADR-012) writes one `reports_snapshot` row per `(tenant, report_name ∈ {receivables_aging, payables_aging}, as_of = today)` holding the full unfiltered row set; the endpoint serves the snapshot when `as_of = today` and no `fresh=true`, applying filters/ordering/pagination in Python over the cached rows (≤ 50k parties); `meta.cached_at` is set. Any other `as_of` is computed live. The column set of `reports_snapshot` is not specified in Part 21 → **CR-RPT-1**.
7. `FR-7` Page `app/(app)/reports/aging/page.tsx` → `<AgingReportPageContent/>` with `UbTabs` Receivable · Payable (URL `?type=`), `UbDateInput` "As of" (chips Today · FY end · Last FY end · Pick), `UbCombobox` Tag, `MLSelect` Bucket, `UbStatCard` × 4 (bucket totals with % of total as baseline), `ReportTable` (Party · Mobile · Collection date · 0–30 · 31–60 · 61–90 · 90+ · Total · Oldest), sticky totals footer, Export button (RPT-08).
8. `FR-8` Row actions: Statement (LED-04 with `date_to=as_of`), Remind (LED-06, receivable only), Pay (PAY-01 `direction=out`, payable only). Bucket cell tap opens the statement filtered to that age window (`agingDisplay.bucketRanges(asOf)` from LED-09).
9. `FR-9` The LED-09 page (`/ledger/aging`) links to this report for filters/export; the dashboard mini aging bar (RPT-01) deep-links here.
10. `FR-10` `fresh=true` bypasses the snapshot and requires `reports.financial.read` (LED-09 BR-8); the response then carries `cached_at = null`.

#### 5. Non-Functional Requirements
p95 live ≤ 500 ms (100k entries, 5k parties), snapshot ≤ 100 ms; page size 25 (max 100); mobile (< 640 px) card mode: party name, mobile (tap-to-call `tel:`), `AgingBucketBar`, total, oldest days; desktop ≥ 1024 px full grid with `ds-num` right-aligned columns; bucket colours per LED-09 §5 with numeric labels; Hindi keys `reports.aging.*` reuse `ledger.aging.*` labels; `aria-label` on bucket bars ("0–30 days ₹1,200; 31–60 days ₹0 …").

#### 6. User Flow
Reports → Aging → Receivable (default) → sorted by 90+ desc → filter tag "Camp Area" → totals cards update → tap Ramesh 90+ ₹1,200 → statement (entries older than 90 days) → Remind → back. Alternate A: AC sets As of 31/03/2026 → live compute banner "As of 31/03/2026 (historical)" → Export XLSX → download. Alternate B: Payable tab → sort by oldest → Pay supplier.

#### 7. UI Requirements
`ReportPageShell` (title "Aging" / "बाकी की उम्र"; description "Who owes how much, and for how long"), tabs, filter row (`UbDateInput`, `UbCombobox` tag, `MLSelect` bucket, `UbSearchInput` party), `UbStatCard` row, `ReportTable` with column groups "Buckets" (4) and "Party" (sticky first column), footer totals, `UbEmptyState` (success tone when nothing outstanding). Components reused from LED-09: `AgingBucketBar`. Redux: dedicated `agingReportSlice` (`type`, `asOf`, `filters`, `rows`, `totals`, `cachedAt`, `status`, `error`) because the report keeps two tabs' state; thunk `fetchAgingReport({ type, params })` in `reportsThunk.ts` calling `reportsService.getReport('receivables-aging'|'payables-aging', params)`; export via `requestExport`.

#### 8. UX Requirements
Receivable totals in error tone, payable in success tone (canon colour semantics); 90+ bucket header carries a subtle error-dim wash. Copy: "Receivable" = "लेना है", "Payable" = "देना है", "Oldest" = "सबसे पुराना", "As of" = "तारीख तक". Cached caption "Updated 02:10 today · Refresh" (Refresh visible only to `reports.financial.read`). Historical banner (info tone) with "Back to today". No confirmations; no destructive actions.

#### 9. States
Loading (4 skeleton cards + 8 skeleton rows) · Ready · Cached (caption) · Historical (banner) · Empty first-use ("No udhaar yet") · Empty settled ("Everyone is settled as of {date}", success) · Filtered-empty (clear filters) · Error (retry + request id) · Exporting (RPT-08 progress in snackbar).

#### 10. Validation Rules
`as_of ≤ today` → 400 `validation_error` "As-of date cannot be in the future"; `as_of ≥ 2000-01-01`; `bucket` in the four codes; `tag` must exist in tenant → 400; `min_total ≥ 0`; `page_size ≤ 100`; `fresh=true` without `reports.financial.read` → 403 `permission_denied`.

#### 11. Business Rules
1. `BR-1` FIFO application per LED-09 BR-2 (receivable) and BR-3 (payable); buckets by `age = as_of − entry_date` in days: `0_30: 0–30`, `31_60`, `61_90`, `90_plus: > 90`.
2. `BR-2` Normative SQL (receivable; payable swaps `debit`/`credit`):
```sql
WITH p AS (SELECT :tenant_id::uuid AS t, :as_of::date AS as_of),
e AS (SELECT party_id, direction, amount, entry_date, created_at
        FROM ledger_entry, p
       WHERE tenant_id = p.t AND status = 'posted' AND entry_date <= p.as_of),
c AS (SELECT party_id, SUM(amount) AS credits FROM e WHERE direction = 'credit' GROUP BY party_id),
d AS (SELECT party_id, amount, entry_date,
             SUM(amount) OVER (PARTITION BY party_id ORDER BY entry_date, created_at
                               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum
        FROM e WHERE direction = 'debit'),
o AS (SELECT d.party_id, d.entry_date,
             GREATEST(0, LEAST(d.amount, d.cum - COALESCE(c.credits, 0))) AS open_amt
        FROM d LEFT JOIN c USING (party_id)),
b AS (SELECT o.party_id,
             COALESCE(SUM(open_amt) FILTER (WHERE p.as_of - entry_date <= 30), 0)               AS b_0_30,
             COALESCE(SUM(open_amt) FILTER (WHERE p.as_of - entry_date BETWEEN 31 AND 60), 0)   AS b_31_60,
             COALESCE(SUM(open_amt) FILTER (WHERE p.as_of - entry_date BETWEEN 61 AND 90), 0)   AS b_61_90,
             COALESCE(SUM(open_amt) FILTER (WHERE p.as_of - entry_date > 90), 0)                AS b_90_plus,
             SUM(open_amt) AS total,
             MIN(entry_date) FILTER (WHERE open_amt > 0) AS oldest_entry_date
        FROM o, p WHERE open_amt > 0 GROUP BY o.party_id)
SELECT pp.id, pp.name, pp.mobile, pp.collection_date, pp.credit_limit, b.*,
       (p.as_of - b.oldest_entry_date) AS oldest_days
  FROM b JOIN parties_party pp ON pp.id = b.party_id, p
 WHERE b.total > 0
 ORDER BY b.b_90_plus DESC, b.total DESC;
```
   Filters (`tag`, `party_id`, `bucket`, `min_total`) are applied to the final `SELECT`; `meta.totals` is a second aggregate over `b` with the same filters. A party whose credits exceed debits (negative balance) yields all `open_amt = 0` and drops out — it appears in the payable report instead.
3. `BR-3` Σ of the four buckets = `total` = party balance as of `as_of` (positive side). For `as_of = today` and no filter, `meta.totals.total = /ledger/summary.receivable` (asserted).
4. `BR-4` Opening entries participate with age from `entry_date` (LED-09 BR-4); reversal pairs net through FIFO (accepted approximation documented in LED-09).
5. `BR-5` `last_payment_date` = latest posted `payment_in`-type credit entry `≤ as_of` (receivable) / `payment_out` debit (payable); manual `manual_got` counts as payment.
6. `BR-6` Snapshot threshold is evaluated per tenant nightly (`COUNT(*) > 5000` on posted entries); once a tenant crosses it the snapshot is kept; write-through invalidation is **not** attempted (staleness ≤ 24 h, disclosed by `cached_at`).
7. `BR-7` Archived parties are excluded (balance 0 by rule); parties without ledger activity are excluded.
8. `BR-8` `credit_limit` shown only for receivable; a row whose `total > credit_limit` gets a warning badge "Over limit".

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View report (both types) | `reports.basic.read` + `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ |
| Historical `as_of` | `reports.basic.read` | ✅ | ✅ | ✅ | ✅ |
| `fresh=true` | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Export CSV/XLSX | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Remind / Pay row actions | `ledger.reminder.write` / `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |

#### 13. Edge Cases
1. `EC-1` Debit ₹1,000 (100 days) + credit ₹900 (today) → 90+ = ₹100 (LED-09 EC-1).
2. `EC-2` Party both customer and supplier with balance +500 → receivable only; the payable report omits it.
3. `EC-3` `as_of` earlier than every entry → empty (settled) state with the date.
4. `EC-4` Tag filter + snapshot → filtering is done over cached rows (tags read live so a re-tag today is reflected).
5. `EC-5` Bucket filter `90_plus` → rows with `b_90_plus > 0`; totals cards still show all four buckets **for those rows**.
6. `EC-6` 50k parties → live query ~ 1 s at the 100k fixture; snapshot path mandatory (BR-6) and pagination 25.
7. `EC-7` Party mobile NULL → `tel:` action hidden; CSV column empty.
8. `EC-8` Correction dated in the past (LED-03) changes historical buckets — accepted, consistent with the ledger philosophy.
9. `EC-9` Same `as_of` requested twice within a minute by an accountant with `fresh=true` → both live (no per-request cache); rate limit 600/min applies.

#### 14. API Requirements
`GET /reports/receivables-aging?as_of&tag&party_id&min_total&bucket&ordering&page&page_size&fresh&format=json|csv|xlsx` and `GET /reports/payables-aging?…` → `{ data: rows[], meta }` per FR-2/FR-3; `format=csv|xlsx` streams for ≤ 5k rows, else 202 `{ export_id }` (RPT-08); the canonical aliases `GET /reports/receivables-aging.csv|.xlsx` (§0.8) map to the same view. Errors: 400 `validation_error`, 403 `permission_denied`, 429. Frontend: `reportsService.getReport(name, params)`, `fetchAgingReport` thunk, `agingReportSlice`; selectors `selectAgingRows`, `selectAgingTotals`.

#### 15. Database Impact
Reads `ledger_entry` via `IX(tenant_id, party_id, entry_date, created_at)`, `parties_party`, `parties_party_tag`, `parties_tag`. Writes `reports_snapshot` nightly (CR-RPT-1 defines columns: `tenant_id`, `report_name`, `as_of`, `params_hash`, `payload jsonb`, `row_count`, `computed_at`; U(tenant_id, report_name, as_of, params_hash)). No new indexes on `ledger_entry`.

#### 16. Audit Requirements
`reports.aging.exported` `{ type, as_of, params, row_count }` (via RPT-08 `export.requested`/`export.completed`). Views not audited.

#### 17. Notifications
Export ready (RPT-08). None otherwise.

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'receivables-aging'|'payables-aging', as_of_is_today, cached, filters[] }`, `ub.reports.aging_drilldown { bucket, action: statement|remind|pay }`, `ub.reports.exported { report, format, rows, async }`.

#### 19. Security
Tenant scope on every CTE (`tenant_id = :t` in the base select — never rely on joins); snapshot rows keyed by tenant; CSV text cells formula-escaped (RPT-08 BR-6); mobiles are business contact data (DPDP: purpose = collection) — included in export only for `reports.export` holders, and the export is audited.

#### 20. Performance
One CTE query (index range scan per party on `(tenant_id, party_id, entry_date, created_at)`), one aggregate for totals, one `LATERAL` per page for `last_payment_date` (25 rows). `EXPLAIN` in CI on the 100k fixture; window function memory bounded by `work_mem` (set 64 MB for the reports role). Snapshot job processes tenants sequentially with `statement_timeout = 60s` per tenant and logs duration.

#### 21. Testing
- `T-RPT05-1` unit: BR-2 SQL on fixture (EC-1) → 90+ = 100; payable mirror with a supplier.
- `T-RPT05-2` unit: property test — 500 fuzzed parties, Σ buckets = balance as of `as_of` for random `as_of`.
- `T-RPT05-3` API: `as_of` past excludes later entries; future → 400.
- `T-RPT05-4` API: tag filter totals equal Σ filtered rows; bucket filter semantics (EC-5).
- `T-RPT05-5` API: snapshot served (`cached_at`) for a > 5k tenant; `fresh=true` by staff → 403; by accountant → live.
- `T-RPT05-6` API: CSV header exact; `TOTAL` row; file name; XLSX opens (RPT-08 writer test).
- `T-RPT05-7` component: tabs preserve per-type filters; mobile card shows `tel:` link; bucket bar `aria-label`.
- `T-RPT05-8` E2E: aging → 90+ cell → statement date window → Remind → `wa.me` URL contains balance.
- `T-RPT05-9` perf: 100k fixture ≤ 500 ms live.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given Ramesh has debit ₹1,000 dated 100 days ago and credit ₹900 today, when I open Receivable aging, then his row shows 0–30 ₹0, 31–60 ₹0, 61–90 ₹0, 90+ ₹100, total ₹100, oldest 100 days.
- `AC-2` (US-2) Given supplier Mahesh has a recorded bill ₹5,000 dated 45 days ago and I paid ₹2,000 yesterday, when I open Payable aging, then his row shows 31–60 ₹3,000 and total ₹3,000.
- `AC-3` (US-3) Given `as_of = 31/03/2026`, when the accountant exports XLSX, then the sheet has the FR-5 columns, only entries dated ≤ 31/03/2026 are considered, and the `TOTAL` row equals the sum of rows.
- `AC-4` (US-4) Given tag "Camp Area" on 3 of 10 debtors, when I filter by it, then 3 rows appear with mobile and collection date, and the totals cards reflect only those rows.
- `AC-5` (US-5) Given a tenant with 20k entries and last night's snapshot, when I open the report today, then it renders from the snapshot with "Updated 02:10 today" and the accountant's Refresh recomputes live.

#### 23. Dependencies
LED-09 (selector, `AgingBucketBar`, `bucketRanges`), LED-04/06, PAY-01, PTY-05 (tags), RPT-08 (export), scheduler `reports.refresh_snapshots`, CR-RPT-1.

#### 24. Future Enhancements
Document-level aging by invoice `due_on` (P2), configurable bucket edges (P2 setting), aging trend by month (RPT-10 P2), collection routes (LED-15 P3).

---

### RPT-06 — Stock summary & low stock

#### 1. Business Objective
Turn the inventory ledger into two numbers the owner acts on: **what is on the shelf and what is it worth**, and **what is about to run out**. The stock summary is the valuation surface (on-hand × weighted-average cost) the accountant needs at FY end for closing stock; the low-stock view is the reorder worklist the owner works through before calling suppliers. INV-07 (movement history) and INV-08 (low-stock alert) own the item-level surfaces; RPT-06 is the **tenant-wide report surface** of the same caches: category/location filters, `as_of` valuation, exact CSV/XLSX columns, and a reorder worklist with a one-tap purchase path. Measures: Σ `stock_value` equals Σ (`on_hand` × `avg_cost`) over `inventory_item_stock` to the paisa (CI test); p95 ≤ 400 ms for 5,000 items live, ≤ 900 ms for a historical `as_of`; ≥ 60 % of inventory-enabled tenants open the report monthly; ≥ 25 % of low-stock rows convert to a purchase bill or PO within 7 days.

#### 2. User Personas
**OW** (primary — valuation and reordering), **AC** (closing stock for the books, FY-end `as_of`), **ST** (counter staff: on-hand and low-stock columns only; cost and value columns are hidden without `reports.financial.read`).

#### 3. User Stories
1. `US-RPT06-1` As an owner I want a list of every stocked item with its on-hand quantity and value so that I know how much money is sitting on my shelves.
2. `US-RPT06-2` As an owner I want to see only the items at or below their reorder level so that I can make one purchase list instead of walking the shop.
3. `US-RPT06-3` As an accountant I want the stock valuation as of 31 March so that I can put closing stock in the books.
4. `US-RPT06-4` As an owner I want to filter by category so that I can review one section (for example "Rice & Atta") at a time.
5. `US-RPT06-5` As an owner I want to export the summary to Excel so that I can share the reorder list with my supplier on WhatsApp.
6. `US-RPT06-6` As a staff member I want to see what is out of stock so that I stop promising goods we do not have.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/stock-summary` with params `category_id`, `location_id` (Phase 2; MVP forces the default `MAIN` location), `as_of` (default today), `stock` (`all|in|low|out`, default `all`), `q` (item name/SKU/barcode trigram), `item_type` (MVP always `goods`; services excluded), `include_zero` (default `true`), `min_value`, `ordering` (`-stock_value` default, `name`, `-on_hand`, `stock_status`, `-last_movement_date`), `page`, `page_size`, `format`.
2. `FR-2` `GET /stock/low` is the same selector pinned to `stock=low`, `include_zero=true`, `ordering=stock_status,name` — one implementation (`inventory.selectors.stock_summary(tenant, filters)`), two entry points; `/stock/low` additionally returns `suggested_order_qty` per row and is the endpoint the low-stock notification (INV-08) deep-links into.
3. `FR-3` Row shape: `{ item: { id, name, sku, barcode, hsn_sac, tax_code, item_type, image_url, category: { id, name }|null, unit: { code, name, allow_decimal } }, on_hand, avg_cost, stock_value, reorder_point, stock_status, selling_price, potential_sale_value, last_movement_date, suggested_order_qty }`. Quantities are strings with 3 decimals, money strings with 2 decimals, `avg_cost` a string with 4 decimals.
4. `FR-4` `meta`: `{ as_of, location: { id, name }, totals: { item_count, in_stock_count, low_count, out_count, total_qty, total_value, total_potential_sale_value }, page, page_size, total, total_pages, cost_visible: true|false }`. Totals are computed over the **filtered** set across all pages.
5. `FR-5` `stock_status` derivation (normative, evaluated server-side, never in the client): `out` when `on_hand <= 0`; `low` when `reorder_point IS NOT NULL AND 0 < on_hand <= reorder_point`; otherwise `ok`. Items with `reorder_point IS NULL` can only be `out` or `ok`.
6. `FR-6` `suggested_order_qty = GREATEST(reorder_point − on_hand, 0)` rounded **up** to the item's unit precision (`inventory_unit.allow_decimal = false` ⇒ `CEIL` to integer); `NULL` when `reorder_point IS NULL`. It is a hint only; PUR-01 never pre-fills quantities without the user confirming.
7. `FR-7` Live path (`as_of = today`): read the `inventory_item_stock` cache. Historical path (`as_of < today`): recompute from `inventory_stock_movement` per BR-2. A response computed from movements carries `meta.historical = true` and the UI shows the historical banner.
8. `FR-8` Cost and value columns (`avg_cost`, `stock_value`, `potential_sale_value`, `totals.total_value`, `totals.total_potential_sale_value`) are omitted from the payload — not zeroed — when the caller lacks `reports.financial.read`; `meta.cost_visible = false` tells the UI to drop the columns rather than render blanks.
9. `FR-9` Page `app/(app)/reports/stock/page.tsx` → `<StockSummaryPageContent/>` with `UbTabs` All · Low · Out (URL `?stock=`, counts from `meta.totals`), filter row, four `UbStatCard` tiles (Items · Total quantity · Stock value · Low/Out), `ReportTable`, sticky totals footer and Export (RPT-08).
10. `FR-10` Row actions: **Adjust** (INV-06 `POST /stock-adjustments` pre-filled with the item), **Movements** (INV-07 `/items/{id}/movements`), **Buy** (PUR-01 new purchase bill with the item and `suggested_order_qty`), **Edit item** (INV-01). Bulk selection on the Low tab offers **Create purchase list** → one draft purchase bill containing every selected row with its suggested quantity and the supplier picked in a `UbAsyncCombobox`.
11. `FR-11` Service items (`item_type='service'`) and items with `track_stock = false` are excluded from every row and every total; the report footer states "Only stocked goods are listed".
12. `FR-12` Archived items with `on_hand ≠ 0` are included (archiving requires zero stock, so this can only arise from a data repair) and carry a muted "Archived" badge; archived items with `on_hand = 0` are excluded.

#### 5. Non-Functional Requirements
p95 ≤ 400 ms live at 5,000 items, ≤ 900 ms for a historical `as_of` at 200k movements; page size 25 (max 100); CSV streamed in 1,000-row chunks, > 5k rows → async export (RPT-08). Mobile (< 640 px) card mode: item name + SKU, on-hand with unit as the metric (`ds-metric-sm`), status badge, value as the baseline line, chevron to the item. Desktop (≥ 1024 px) full grid, numeric columns `ds-num` right-aligned, first column (item) sticky. Works offline from the last cached response with the stale banner. i18n keys `reports.stock.*`; Hindi labels per §8. `aria-label` on every status badge ("Low stock: 4 NOS, reorder at 10"); colour never carries status alone.

#### 6. User Flow
Reports → Stock summary → All tab, sorted by value descending → tiles show 312 items · ₹4,86,200 → switch to **Low** tab → 7 rows → select 5 → Create purchase list → supplier Mahesh Distributors → draft purchase bill opens with 5 lines and suggested quantities → PUR-01 continues.
Alternate A (valuation): AC sets As of = 31/03/2026 → historical banner → tiles recompute → Export XLSX → RPT-08 job → download link in the bell.
Alternate B (category review): filter Category = "Rice & Atta" → 22 rows, ₹1,12,400 → tap an item → item detail (INV-01) → Movements.
Alternate C (from the alert): low-stock notification (INV-08) → deep-link `/reports/stock?stock=low` → same worklist.

#### 7. UI Requirements
`ReportPageShell` (title "Stock summary" / "स्टॉक सारांश"; description "What you have and what it is worth"). Filter row: `UbTabs` (All · Low · Out with counts), `UbSearchInput` (300 ms debounce, placeholder "Search item, SKU or barcode"), `UbCombobox` Category, `UbDateInput` "As of" (chips Today · FY end · Last FY end · Pick), `MLToggleGroup` "Include zero stock", `MLSelect` ordering, Export button. Tiles: `UbStatCard` × 4 — Items (value = count, baseline "of which 7 low"), Total quantity (value = Σ on-hand with the dominant unit suppressed when units are mixed — shows "—" and the tooltip "Quantities are in different units"), Stock value (tone default, baseline "at average cost"), Low / Out (tone warning, or error when `out_count > 0`). `ReportTable` columns: Item (name + SKU, sticky) · Category · Unit · On hand (`ds-num`) · Avg cost · Stock value · Reorder at · Status (`UbStatusBadge`) · Last movement. `UbHelpHint` on the Avg cost header: "Weighted average of what you paid, updated on every purchase". Row click opens the item drawer (`UbDrawer`, INV-01 summary + last 5 movements); the kebab menu carries the FR-10 actions. Mobile: `UbFab` hidden (this is a read surface); bulk selection uses long-press. Redux: `stockReportSlice` (`filters`, `rows`, `totals`, `status`, `error`, `selectedIds`), thunk `fetchStockSummary(params)` in `reportsThunk.ts` calling `reportsService.getReport('stock-summary', params)`; selectors `selectStockRows`, `selectStockTotals`, `selectLowCount`.

#### 8. UX Requirements
Copy: "Stock summary" = "स्टॉक सारांश", "On hand" = "मौजूद स्टॉक", "Stock value" = "स्टॉक की कीमत", "Reorder at" = "दोबारा मंगाएँ", "Low stock" = "कम स्टॉक", "Out of stock" = "स्टॉक खत्म", "Buy" = "खरीदें", "Adjust" = "स्टॉक ठीक करें". Status tones: `ok` neutral (no badge — absence of a badge is the healthy state, Koper "absence is a finding" inverted here to keep the grid quiet), `low` warning, `out` error. Every tile carries a baseline; the Stock value tile's baseline names the method ("at weighted-average cost"), never a naked number. No confirmations and no destructive actions on this screen — the destructive path is INV-06 and carries its own `UbReasonDialog`. Historical `as_of` shows an info `UbStatusBanner`: "Showing stock as it was on 31/03/2026 · Back to today". When cost is hidden the table shows a single `UbInputHint` under the header: "Cost and value are visible to owners, admins and accountants".

#### 9. States
Initial (filters from URL) · Loading (4 skeleton tiles + 10 skeleton rows) · Ready · Historical (banner) · Empty first-use ("No items yet" + "Add item" CTA → INV-01, help link) · Empty filtered ("No items match these filters" + Clear filters) · Empty healthy on the Low tab ("Nothing is running low", success tone, illustration) · Error (retry + `request_id`) · Partial (cost columns hidden, `cost_visible=false`) · Processing (async export queued, snackbar "Preparing your file…") · Completed (download link in snackbar + bell) · Failed (export failed, retry).

#### 10. Validation Rules
| Field | Rule | Error (HTTP 400 `validation_error`) |
|---|---|---|
| `as_of` | `≤ today`, `≥ 2000-01-01` | "As-of date cannot be in the future" (`details.as_of`) |
| `category_id` | must exist in tenant and not be soft-deleted | "This category no longer exists" |
| `location_id` | must exist; MVP rejects anything but the default | "Multiple locations are not available on your plan" (403 `module_disabled`) |
| `stock` | ∈ `all,in,low,out` | "Unknown stock filter" |
| `ordering` | whitelist per FR-1 | "Cannot sort by this column" |
| `page_size` | ≤ 100 | "Page size cannot be more than 100" |
| `min_value` | `≥ 0`, ≤ 14 digits | "Minimum value cannot be negative" |
| `format` | ∈ `json,csv,xlsx`; `csv`/`xlsx` require `reports.export` | 403 `permission_denied` "You do not have permission to export reports" |

#### 11. Business Rules
1. `BR-1` Live valuation (normative SQL; `:t` tenant, `:loc` default location):
```sql
SELECT i.id, i.name, i.sku, i.barcode, i.hsn_sac, i.tax_code, i.selling_price, i.reorder_point,
       c.name AS category_name, u.code AS unit_code,
       COALESCE(s.on_hand, 0)::numeric(14,3)  AS on_hand,
       COALESCE(s.avg_cost, 0)::numeric(14,4) AS avg_cost,
       ROUND(COALESCE(s.on_hand,0) * COALESCE(s.avg_cost,0), 2)     AS stock_value,
       ROUND(COALESCE(s.on_hand,0) * i.selling_price, 2)            AS potential_sale_value,
       s.last_movement_at::date AS last_movement_date
  FROM inventory_item i
  JOIN inventory_unit u        ON u.id = i.unit_id
  LEFT JOIN inventory_category c ON c.id = i.category_id
  LEFT JOIN inventory_item_stock s ON s.item_id = i.id AND s.variant_id IS NULL AND s.location_id = :loc
 WHERE i.tenant_id = :t AND i.deleted_at IS NULL AND i.track_stock AND i.item_type = 'goods'
 ORDER BY stock_value DESC NULLS LAST, i.name;
```
2. `BR-2` Historical valuation (`as_of < today`) never reads the cache. On-hand is `SUM(qty)` over `inventory_stock_movement` with `movement_date <= :as_of`; the cost is the running average **as it stood then**, taken from the last movement's `avg_cost_after` in canonical (`movement_date`, `sequence_no`) order — the column exists precisely so history does not have to be replayed, and `inventory.recompute_item_cost` is what keeps it true after a backdated post or a void:
```sql
WITH m AS (SELECT item_id, location_id, qty, avg_cost_after, movement_date, sequence_no
             FROM inventory_stock_movement
            WHERE tenant_id = :t AND movement_date <= :as_of),
 q AS (SELECT item_id, location_id, SUM(qty) AS on_hand FROM m GROUP BY item_id, location_id),
 a AS (SELECT DISTINCT ON (item_id, location_id) item_id, location_id, COALESCE(avg_cost_after, 0) AS avg_cost
         FROM m ORDER BY item_id, location_id, movement_date DESC, sequence_no DESC)
SELECT q.item_id, q.on_hand, a.avg_cost, ROUND(q.on_hand * a.avg_cost, 2) AS stock_value
  FROM q JOIN a USING (item_id, location_id);
```
   Items with no movement on or before `as_of` are reported as `on_hand = 0`, `avg_cost = 0`. This is an **exact** reconstruction, not an estimate, because §21.3.6 requires `avg_cost_after` on every movement.
3. `BR-3` Weighted-average cost is defined once, in Part 21 §21.3.6, together with its canonical order (`movement_date`, `sequence_no`): on inbound with cost, `new_avg = (on_hand × avg + qty × unit_cost) / (on_hand + qty)`, and `new_avg = unit_cost` when `on_hand ≤ 0` before the inbound; a **plain** outbound never changes the average, while a **`reversal` row** (a void) removes the value its original added and is followed by a replay. RPT-06 **reads** the result and never recomputes it. An item whose `inventory_item_stock.cost_state = 'stale'` is awaiting `inventory.recompute_item_cost` after a backdated post or a void; the report shows its cached figure annotated "Average cost recalculating". Any drift between the cache and the movements is a defect, reported by the nightly `platform.check_invariants` and fixed by an operator running `manage.py recalc_stock --fix`, never by this report.
4. `BR-4` Rounding: `stock_value` and `potential_sale_value` are `ROUND(qty × cost, 2)` half-up **per item**, and the totals are `SUM` of the per-item rounded values — so the footer always equals the visible column, with a maximum drift of ₹0.005 per item against an unrounded ideal. `avg_cost` is displayed to 4 decimals in the grid tooltip and to 2 in the cell.
5. `BR-5` Negative on-hand is possible when `inventory.allow_negative_stock` is on. Such rows have `stock_status = 'out'`, a negative `on_hand` rendered in error tone, and a **negative** `stock_value` (they reduce the total honestly rather than being clamped to zero); the tiles show a footnote "3 items have negative stock — adjust them".
6. `BR-6` `total_qty` is the plain sum of `on_hand` across the filtered rows and is only meaningful when the filtered set shares one unit. The API returns it always; the UI suppresses it (shows "—") when the filtered set has more than one distinct `unit_code`.
7. `BR-7` `potential_sale_value` uses `inventory_item.selling_price` as it is **today**, even in a historical view, because price history is not modelled at MVP; the column header carries a `UbHelpHint` saying so.
8. `BR-8` The Low tab's ordering is `stock_status` first (`out` before `low`), then `name` — out-of-stock items are the ones costing a sale today.
9. `BR-9` The report is never snapshotted into `reports_snapshot`: the cache table `inventory_item_stock` already *is* the snapshot, and it is maintained write-through by the posting services.
10. `BR-10` Worked example. Item "Basmati Rice 5kg", unit NOS, reorder point 10. Movements: `opening +20 @ 320.0000` (avg 320.0000), `purchase_in +30 @ 340.0000` → `new_avg = (20×320 + 30×340) / 50 = 332.0000`, `sale_out −45` (avg unchanged, `unit_cost` snapshotted 332.0000). On hand = 5, avg cost = 332.0000, `stock_value = ROUND(5 × 332.0000, 2) = ₹1,660.00`, `stock_status = low` (0 < 5 ≤ 10), `suggested_order_qty = CEIL(10 − 5) = 5`, `potential_sale_value = 5 × 450.00 = ₹2,250.00`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View report (quantity columns) | `inventory.stock.read` + `reports.basic.read` | ✅ | ✅ | ✅ | ✅ |
| Cost / value columns and tiles | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Historical `as_of` | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Export CSV/XLSX | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Row action Adjust | `inventory.stock.adjust` | ✅ | ✅ | ⚙ (off by default, `permissions_override`) | ❌ |
| Row action Buy / Create purchase list | `purchases.bill.read` + `purchases.bill.write` | ✅ | ✅ | ❌ | ❌ |
| Row action Edit item | `inventory.item.write` | ✅ | ✅ | ❌ | ❌ |

Module gate: the whole route 403s with `module_disabled` when `inventory` is not in `Tenant.enabled_modules`; the Reports nav hides the entry rather than showing a dead link.

#### 13. Edge Cases
1. `EC-1` Item created today with opening stock dated last week → the historical path picks it up from the `opening` movement's `movement_date`, not `created_at`.
2. `EC-2` Item with `reorder_point = 0` → never `low` (0 < on_hand ≤ 0 is unsatisfiable); only `out` when on-hand ≤ 0. The item form (INV-01) warns "A reorder level of 0 means you will only be told when stock is finished".
3. `EC-3` All items have `reorder_point IS NULL` → Low tab shows the first-use empty state "Set reorder levels to get this list" with a link to INV-01.
4. `EC-4` 5,000 items with 200k movements, `as_of` = last FY end → the BR-2 CTE is the slow path; it runs with `statement_timeout = 30s` and, above 20k items, returns 202 with an export job instead of a JSON page (the UI says "This valuation is large — we will prepare a file").
5. `EC-5` A purchase bill is voided after the `as_of` date → the reversing movement carries a later `movement_date`, so the historical view correctly still shows the stock as it stood.
6. `EC-6` Mixed units in the filtered set → `total_qty` suppressed per BR-6; the CSV still carries the raw sum with a `unit` column of `MIXED` on the TOTAL row.
7. `EC-7` `avg_cost = 0` because every inbound was recorded without a cost (opening stock entered as quantity only) → `stock_value = 0`; the tile baseline adds "12 items have no cost — add purchase prices" linking to INV-01.
8. `EC-8` Item archived while a low-stock notification is open → the row is excluded (on-hand is zero by the archive rule) and the notification deep-link lands on the filtered-empty state, not an error.
9. `EC-9` Two users create purchase lists from the same low-stock selection simultaneously → two independent drafts; no locking. PUR-01's duplicate-supplier-invoice guard is the only uniqueness rule and it does not apply to drafts.
10. `EC-10` Staff member opens a deep link containing `as_of=2026-03-31` → 403 `permission_denied`; the UI catches it and resets to today with the snackbar "Past valuations are for owners and accountants".

#### 14. API Requirements
`GET /reports/stock-summary?category_id&location_id&as_of&stock&q&include_zero&min_value&ordering&page&page_size&format=json|csv|xlsx` → `200 { "data": rows[], "meta": {…} }` per FR-3/FR-4. `GET /stock/low?category_id&q&page&page_size` → the same envelope pinned per FR-2, plus `meta.totals.low_count`/`out_count`. The canonical aliases `GET /reports/stock-summary.csv|.xlsx` (§0.8) map to the same view; ≤ 5,000 rows stream synchronously with `StreamingHttpResponse`, anything larger returns `202 { "data": { "export_id": "…" } }` and is polled at `GET /reports/exports/{id}` (RPT-08). Errors: 400 `validation_error`, 403 `permission_denied`, 403 `module_disabled`, 429 (export budget 10/hour). Auth: bearer/cookie, tenant from `tid`. Headers: `Cache-Control: private, max-age=30` on the live path, `no-store` on the historical path.
CSV header (exact, in order): `item_name,sku,barcode,category,unit,hsn_sac,tax_code,on_hand,avg_cost,stock_value,reorder_point,stock_status,selling_price,potential_sale_value,last_movement_date`. A final `TOTAL` row carries `on_hand`, `stock_value` and `potential_sale_value` sums with `item_name = TOTAL` and other text columns empty. File name `stock-summary_<as_of>.csv`. Cost columns are dropped from the header entirely when `cost_visible = false`.
Frontend: `reportsService.getReport('stock-summary', params)` and `.getReport('stock-low', params)`, thunk `fetchStockSummary`, slice `stockReportSlice`; export via `requestExport({ report: 'stock-summary', params, format })`.

#### 15. Database Impact
Reads `inventory_item` (`IX(tenant_id, status, name)`, GIN trigram on `name` for `q`, `IX(tenant_id, category_id)`), `inventory_item_stock` (`U(item_id, variant_id, location_id)` used as the join index), `inventory_category`, `inventory_unit`, `inventory_location`, and on the historical path `inventory_stock_movement` (`IX(tenant_id, item_id, location_id, movement_date, sequence_no)` and `IX(tenant_id, movement_date)`). Writes: none, except `reports_export` + `files_attachment` rows created by RPT-08 for async files. New index: **none required** — the historical CTE's `DISTINCT ON (item_id, location_id) … ORDER BY movement_date DESC` is served by the existing composite index read backwards. No schema change.

#### 16. Audit Requirements
Views are not audited. Exports are, through RPT-08: `platform_audit_log` rows `action='report.exported'`, `entity_type='reports_export'`, `metadata = { report: 'stock-summary', params: { as_of, category_id, stock }, row_count, format }`. Creating a purchase list from the Low tab is audited by PUR-01 as `purchase_bill.created` with `metadata.source = 'low_stock_report'`.

#### 17. Notifications
RPT-06 raises none of its own. The daily low-stock scan is INV-08: the scheduled job `inventory.scan_low_stock` (daily 01:00 IST per the registry in Part 20 §20.8.4, which owns every job name and time; `manage.py run_scheduler`, ADR-012) writes one `notifications_notification` per tenant with `type='low_stock'`, title "{n} items are running low", body "{first 3 item names} and {n−3} more", `data = { route: '/reports/stock?stock=low' }`. Export-ready notifications come from RPT-08.

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'stock-summary', tab, as_of_is_today, filters[], row_count, cost_visible }`, `ub.reports.stock_tab_changed { from, to }`, `ub.reports.stock_row_action { action: 'adjust'|'buy'|'movements'|'edit' }`, `ub.reports.stock_purchase_list_created { item_count, total_suggested_qty }`, `ub.reports.exported { report: 'stock-summary', format, rows, async }`.

#### 19. Security
Tenant scope is asserted in the base `WHERE` of every query and every CTE (`i.tenant_id = :t`, `m.tenant_id = :t`) — never inferred from a join. Cost and valuation are commercially sensitive and are removed from the serializer, the CSV header and the XLSX sheet when `reports.financial.read` is absent, so a staff member cannot recover margins by reading the payload. `q` goes through the ORM's parameterised trigram filter; `ordering` is whitelisted; `category_id`/`location_id` are resolved inside the tenant scope so a cross-tenant UUID yields 404, never 403. CSV cells beginning with `= + - @` are prefixed with `'` per RPT-08 BR-6 (formula injection). Export files live under `MEDIA_ROOT/exports/<tenant_id>/` with a random storage key and are served through an authenticated view, never by directory listing; they expire after 7 days (`reports_export.expires_at`).

#### 20. Performance
Live path: one indexed sequential scan of `inventory_item` (tenant-filtered) with a hash join to `inventory_item_stock` — ~15 ms at 5,000 items; totals are a second aggregate over the same filtered set, executed in the same request. Historical path: one CTE over `inventory_stock_movement` using the composite index; at the 200k-movement fixture this measures ~600 ms and is the case `EXPLAIN` is asserted on in CI. Pagination is mandatory (25 default, 100 max). The live response is cached 30 s per `(tenant, permissions version, params hash)` and invalidated write-through by the stock-posting service (`reports.cache.invalidate(tenant_id)` from SAL-02 issue, PUR-01 record, INV-06 adjust, and any void). CSV is streamed in 1,000-row chunks so memory is O(chunk); XLSX is written with the same streaming writer used by RPT-08.

#### 21. Testing
- `T-RPT06-1` unit: BR-10 worked example end-to-end — movements posted, cache and report agree on `on_hand = 5`, `avg_cost = 332.0000`, `stock_value = 1660.00`, `stock_status = low`, `suggested_order_qty = 5`.
- `T-RPT06-2` unit: `stock_status` truth table across `reorder_point` NULL / 0 / 10 and `on_hand` −2 / 0 / 5 / 50.
- `T-RPT06-3` unit: historical BR-2 reconstruction equals a replay of the weighted-average rule for 200 randomised movement sequences (property test).
- `T-RPT06-4` unit: rounding — 3 items at `qty × cost` with .005 tails; footer equals Σ of displayed cells (BR-4).
- `T-RPT06-5` API: `include_zero=false` drops zero rows but totals stay consistent; `min_value` filter; `q` matches SKU and barcode.
- `T-RPT06-6` API: staff response omits `avg_cost`/`stock_value`/`potential_sale_value` and sets `cost_visible=false`; accountant includes them.
- `T-RPT06-7` API: staff `as_of` in the past → 403; `as_of` in the future → 400 with the exact message.
- `T-RPT06-8` API: `inventory` module disabled → 403 `module_disabled`.
- `T-RPT06-9` API: CSV header exact, BOM present, TOTAL row correct, cost columns absent for staff; XLSX opens and the numeric cells are numbers, not text.
- `T-RPT06-10` API: negative stock (BR-5) produces a negative `stock_value` and an `out` status.
- `T-RPT06-11` component: tabs carry counts; mixed units suppress `total_qty`; historical banner renders with "Back to today"; low-tab healthy empty state uses the success tone.
- `T-RPT06-12` E2E: post a sale that drops an item to 5 → open Low tab → select it → Create purchase list → a draft purchase bill opens with qty 5.
- `T-RPT06-13` E2E: void the purchase bill → reversing movement → report value returns to the prior number.
- `T-RPT06-14` perf: 5,000 items live ≤ 400 ms; 200k movements historical ≤ 900 ms; `EXPLAIN` shows index scans, no sequential scan on `inventory_stock_movement`.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given 312 stocked items whose `on_hand × avg_cost` sums to ₹4,86,200.00, when I open Stock summary, then the Items tile shows 312, the Stock value tile shows ₹4,86,200.00, and the table footer total equals the sum of the visible Stock value cells.
- `AC-2` (US-2) Given Basmati Rice 5kg is at 5 NOS with a reorder level of 10 and Toor Dal is at 0, when I open the Low tab, then both rows appear with Toor Dal first (out before low), Rice shows a suggested order of 5, and the tab badge reads 2.
- `AC-3` (US-3) Given 45 units were sold on 02/04/2026, when the accountant sets As of = 31/03/2026, then the report shows the pre-sale on-hand and the average cost recorded on the last movement dated on or before 31/03/2026, and the banner reads "Showing stock as it was on 31/03/2026".
- `AC-4` (US-4) Given category "Rice & Atta" has 22 items worth ₹1,12,400.00, when I filter by it, then 22 rows appear and all four tiles reflect only those rows.
- `AC-5` (US-5) Given I have `reports.export`, when I export the Low tab as XLSX, then the file contains the FR-14 columns for exactly the low and out rows plus a TOTAL row, and the file name is `stock-summary_<today>.xlsx`.
- `AC-6` (US-6) Given I am a staff member, when I open the report, then I see On hand, Reorder at and Status but no Avg cost, Stock value or Stock value tile, and no Export button.

#### 23. Dependencies
INV-01 (item master, `reorder_point`, `selling_price`), INV-04 (opening stock), INV-06 (adjustments), INV-07 (movement history), INV-08 (low-stock alert and the `inventory.scan_low_stock` runner), PUR-01 (purchase bill draft from the worklist), SAL-02/PUR-01 posting services for the `inventory_item_stock` cache and `avg_cost_after`, RPT-08 (export), PLT-06 (module gating), `manage.py recalc_stock` (cache integrity).

#### 24. Future Enhancements
Per-location and in-transit columns with a location switcher (INV-11 multi-location, P2); batch/expiry ageing columns (INV-13, P3); days-of-cover and reorder suggestion driven by real velocity instead of a static reorder point (RPT-09); stock ageing buckets (items unsold for 90+ days) folded into RPT-09; FIFO/LIFO valuation as a tenant setting alongside weighted average (accounting module, Future); stock-take variance report (INV-14, P3); scheduled monthly valuation email (RPT-14, P3).

---

### RPT-07 — GST summary

#### 1. Business Objective
Give the accountant every figure needed to file **GSTR-1** and **GSTR-3B** for a tax period without opening a single invoice, and give the owner the one number that matters — "how much GST do I have to pay this month". Each figure on the screen names the return table or box it belongs to, so the report is not merely informative but *transcribable*: the accountant reads a row and types it into the portal (or, from Phase 2, exports the JSON — RPT-12). RPT-03/RPT-04 are the document registers; RPT-07 is the **return-shaped aggregation** of the same rows. Measures: Σ of the rate-wise taxable values equals the sales register's `taxable_total` for the same period to the paisa (CI test); Σ of the HSN table's taxable values equals the same number (CI test); ≥ 70 % of `gst_type='regular'` tenants open the report in the filing window (1st–11th of the month); support tickets asking "which number goes in 3.1(a)" fall to zero.

#### 2. User Personas
**AC** (primary — files the returns), **OW** (secondary — wants the net payable and whether anything is missing). **ST** has no access: `reports.financial.read` is required for the whole report.

#### 3. User Stories
1. `US-RPT07-1` As an accountant I want outward supplies summarised by GST slab with CGST, SGST, IGST and cess so that I can fill GSTR-3B box 3.1(a).
2. `US-RPT07-2` As an accountant I want the outward supplies split by nature — B2B, B2CL, B2CS, credit/debit notes, nil/exempt/non-GST — with the GSTR-1 table number against each so that I can fill GSTR-1 table by table.
3. `US-RPT07-3` As an accountant I want an HSN-wise summary with UQC and quantity so that I can fill GSTR-1 table 12.
4. `US-RPT07-4` As an accountant I want the document-series summary (from, to, count, cancelled) so that I can fill GSTR-1 table 13.
5. `US-RPT07-5` As an accountant I want inward supplies by slab with the ITC-eligible split so that I can fill GSTR-3B table 4(A)(5).
6. `US-RPT07-6` As an owner I want a single "net GST payable" figure for the month so that I know what to keep aside.
7. `US-RPT07-7` As an accountant I want to see the invoices that would be rejected by the portal — missing GSTIN, missing HSN, missing place of supply — before I file, so that I fix them first.
8. `US-RPT07-8` As an accountant I want to export the whole summary as one Excel workbook with a sheet per table so that I can attach it to my working papers.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/gst-summary` with params `period` (`2026-09` month, `2026-Q2` quarter, or `fy:2026-27`), or `date_from`/`date_to` for an arbitrary range; `type` (`outward|inward|both`, default `both`); `section` (comma list to fetch a subset: `rate,nature,hsn,docs,itc,exceptions,gstr3b`); `rounding` (`paise|rupee`, default `paise`); `format` (`json|csv|xlsx`).
2. `FR-2` The response is sectioned, and **every section row carries the return coordinates it maps to**: `gstr1_table` (a string such as `4A`, `5A`, `7`, `9B`, `12`, `13`) and `gstr3b_box` (such as `3.1(a)`, `3.1(c)`, `3.2`, `4(A)(5)`). These are data, not UI labels, so the export and RPT-12 read the same mapping.
3. `FR-3` Section **`outward.by_rate[]`** — one row per `(tax_rate, is_inter_state)` pair present in the period: `{ tax_code, tax_rate, is_inter_state, taxable_value, cgst, sgst, igst, cess, invoice_count, gstr3b_box: "3.1(a)" }`, plus a `total` row. Nil-rated, exempt and non-GST rows are separated out and carry `gstr3b_box: "3.1(c)"` (nil/exempt) or `"3.1(e)"` (non-GST).
4. `FR-4` Section **`outward.by_nature[]`** — the GSTR-1 shape, one row per nature with `{ nature, gstr1_table, document_count, taxable_value, cgst, sgst, igst, cess, invoice_value }`:

| Nature | Code | GSTR-1 table | Population rule |
|---|---|---|---|
| B2B — registered parties | `b2b` | `4A` (`4B` when `reverse_charge`) | `kind IN ('invoice','bill_of_supply')`, `party_gstin_snapshot IS NOT NULL` |
| B2C large — inter-state, above threshold | `b2cl` | `5A` | `party_gstin_snapshot IS NULL AND is_inter_state AND grand_total > threshold` (BR-4) |
| B2C small — everything else B2C | `b2cs` | `7` (`7A` intra, `7B` inter) | `party_gstin_snapshot IS NULL` and not B2CL; reported **rate-wise and state-wise**, never invoice-wise |
| Credit/debit notes to registered | `cdnr` | `9B` | `kind='credit_note'`, `party_gstin_snapshot IS NOT NULL` |
| Credit notes to unregistered (B2CL-linked) | `cdnur` | `9B (UR)` | `kind='credit_note'`, no GSTIN, original was B2CL |
| Nil-rated / exempt / non-GST | `nil_exempt` | `8A–8D` | `tax_code IN ('GST0','NIL','EXEMPT','NONGST')`, split by registered/unregistered × intra/inter |
| Advances / adjustments | `advances` | `11A/11B` | **Not applicable — DigiKhaato does not model tax on advances at MVP** (BR-11) |

5. `FR-5` Section **`hsn[]`** — GSTR-1 table 12, one row per `(hsn_sac, unit_code, tax_rate, supply_type)` where `supply_type ∈ {b2b, b2c}` (the portal's Phase-III split): `{ hsn_sac, description, uqc, supply_type, total_qty, tax_rate, taxable_value, igst, cgst, sgst, cess, total_value, gstr1_table: "12" }`. `description` is the most frequent `sales_document_line.description` for that HSN in the period, truncated to 30 characters (the portal's limit). `uqc` is the item's `inventory_unit.code`, which is already a UQC by §21.3.6.
6. `FR-6` Section **`docs[]`** — GSTR-1 table 13, one row per document nature: `{ nature, series_prefix, from_number, to_number, total_count, cancelled_count, gstr1_table: "13" }` for natures Invoices for outward supply, Credit notes, Debit notes, Receipt vouchers, Delivery challans. Built from `sales_document.number` within the period, grouped by the numeric series; `cancelled_count` is the count of `status='void'`.
7. `FR-7` Section **`inward.by_rate[]`** — purchases mirror of FR-3 from `purchases_document`, with the extra split `{ itc_eligible: true|false }` and `{ reverse_charge: true|false }`; ITC-eligible rows carry `gstr3b_box: "4(A)(5)"`, reverse-charge inward rows carry `"3.1(d)"` for the liability and `"4(A)(3)"` for the credit.
8. `FR-8` Section **`gstr3b`** — a computed box-by-box block the accountant can read top to bottom: `{ "3.1(a)": {taxable, igst, cgst, sgst, cess}, "3.1(b)": {...}, "3.1(c)": {...}, "3.1(d)": {...}, "3.1(e)": {...}, "3.2": [ { pos_state, taxable, igst } ], "4(A)(5)": {...}, "4(A)(3)": {...}, "5": {...}, "net_payable": { igst, cgst, sgst, cess, total } }`.
9. `FR-9` Section **`exceptions[]`** — the pre-filing checklist: one row per document that the portal would reject or that would misclassify, `{ document_id, number, document_date, party_name, issue_code, message, link }`. Issue codes: `missing_party_gstin` (party marked registered but GSTIN blank), `invalid_gstin_checksum`, `missing_hsn` (line without `hsn_sac` on a tax invoice), `missing_pos` (`place_of_supply_state` null), `pos_state_mismatch` (POS = supplier state but `is_inter_state = true`, or the reverse), `legacy_rate_used` (a `tax_code` whose `tax_rate.effective_to < document_date`), `cn_without_original` (credit note with no `against_id` and no B2CL linkage), `zero_taxable_with_tax`.
10. `FR-10` Section **`meta`**: `{ period, date_from, date_to, gst_type, gstin, state_code, rounding, generated_at, filing_due_dates: { gstr1, gstr3b }, exception_count, is_ready: exception_count == 0 }`.
11. `FR-11` The report is only produced for `gst_type='regular'`. `composition` tenants get a reduced report (turnover by rate for CMP-08, no ITC, no B2B) with a banner naming GSTR-4/CMP-08; `unregistered` tenants get a 403 `module_disabled`-style refusal rendered as an empty state, not an error page.
12. `FR-12` Page `app/(app)/reports/gst/page.tsx` → `<GstSummaryPageContent/>`, with a period selector, an `MLToggleGroup` for **GSTR-1 view** / **GSTR-3B view** / **Details**, and a persistent "Ready to file" / "{n} issues to fix" strip.
13. `FR-13` Every figure in the GSTR-1 and GSTR-3B views is click-through: tapping a cell opens a `UbDrawer` listing the contributing documents (number, date, party, taxable, tax) with links to SAL-02/PUR-01, so any number can be defended.
14. `FR-14` Export (RPT-08) produces **one XLSX workbook with one sheet per section** — `Summary`, `B2B`, `B2CL`, `B2CS`, `CDNR`, `NIL-EXEMPT`, `HSN`, `DOCS`, `INWARD`, `GSTR3B`, `EXCEPTIONS` — and, for `format=csv`, a ZIP of the same sheets as separate files.

#### 5. Non-Functional Requirements
p95 ≤ 900 ms for a month at 2,000 invoices, ≤ 2.5 s for a quarter at 6,000, computed in a single request with at most six aggregate statements; > 20,000 documents in the range → async export path only. Desktop-first (this is an accountant's screen at a laptop) but every section is a mobile card stack below 640 px with horizontal scroll locked to the table, never the page. All monetary values are `Decimal` strings; the client never re-adds. i18n `reports.gst.*`; return terminology (GSTR-1, 3B, B2B, HSN, UQC, ITC) is **not translated** — it is the portal's vocabulary — while the surrounding copy is (`hi` keys present). Numbers use `ds-num` tabular figures; the rupee-rounded view uses whole rupees with no decimals. `aria-describedby` on each figure carries its return coordinate so screen readers announce "three lakh twenty thousand, GSTR-3B box 3.1(a)".

#### 6. User Flow
Reports → GST summary → period defaults to the **last completed month** (not the current one — the accountant files for the closed month) → the strip reads "3 issues to fix" → tap → exceptions list → fix a missing GSTIN on party Ramesh (PTY-02) → back → "Ready to file" → switch to GSTR-1 view → read table 4A, 5A, 7, 9B, 12, 13 into the portal → switch to GSTR-3B view → read 3.1(a), 3.2, 4(A)(5) → net payable ₹18,430 → Export XLSX for the working papers.
Alternate A (owner): opens the report, reads only the "Net GST payable" tile and the due-date chip, leaves.
Alternate B (defending a number): taps taxable value in the 18 % row → drawer lists 42 invoices → taps one → invoice detail.
Alternate C (composition): banner "You are on the composition scheme — file CMP-08 quarterly"; the screen shows turnover by rate and the composition tax computed at the tenant's notified rate (setting, BR-12).

#### 7. UI Requirements
`ReportPageShell` (title "GST summary" / "जीएसटी सारांश"; description "Everything you need for GSTR-1 and GSTR-3B"). Controls: `MLSelect` period type (Month · Quarter · FY · Custom), `UbDateRangePicker` for Custom with FY/quarter presets, `MLToggleGroup` view (GSTR-1 · GSTR-3B · Details), `MLSwitch` "Round to rupees", Export button. Header tiles (`UbStatCard` × 4): Taxable outward (baseline "in {n} documents"), Output tax (CGST+SGST+IGST+cess), ITC available, **Net GST payable** (tone warning, baseline "Due by 20/10/2026"). Filing strip: `UbStatusBanner` success ("Ready to file") or warning ("3 issues to fix · Review") with a chevron into the exceptions list. Sections render as `MLCard`s each with an `MLBadge` carrying the return coordinate ("GSTR-1 · 4A", "GSTR-3B · 3.1(a)") and a `UbHelpHint` explaining the table in one sentence. Feature-local components (per §23.3 "feature-specific"): `GstRateTable`, `GstNatureTable`, `GstHsnTable`, `GstDocsTable`, `Gstr3bBoxList`, `GstExceptionList`, `GstDrilldownDrawer` — built from `ReportTable`, `MLCard`, `UbStatusBadge`, `UbAmount`, `UbDrawer`. Redux: `gstReportSlice` (`period`, `view`, `rounding`, `sections`, `exceptions`, `status`, `error`), thunk `fetchGstSummary(params)` in `reportsThunk.ts` → `reportsService.getReport('gst-summary', params)`; selector `selectGstr3bBoxes`, `selectGstExceptionCount`.

#### 8. UX Requirements
Copy: "GST summary" = "जीएसटी सारांश", "Taxable value" = "कर योग्य राशि", "Output tax" = "जमा किया गया टैक्स", "Input tax credit" = "इनपुट टैक्स क्रेडिट", "Net payable" = "देना है", "Ready to file" = "फाइल करने के लिए तैयार", "Issues to fix" = "ठीक करने हैं". Net payable is shown in warning tone (it is money going out, but it is not a receivable, so the ledger red/green semantics deliberately do not apply — a third tone keeps the canon's red = "you gave" unambiguous, and the label always accompanies it). Every table header states the return table; nothing is a naked number. The rupee-rounding switch shows a caption "Rounded the way the portal rounds — half-up to the nearest rupee" so the accountant is not surprised by a ₹1 difference. No destructive actions, no confirmations. Sticky section navigation on desktop (a left rail listing 4A · 5A · 7 · 9B · 8 · 12 · 13 · 3B).

#### 9. States
Initial (last completed month) · Loading (tiles + 3 card skeletons) · Ready · Ready-with-exceptions (warning strip) · Empty ("No documents in this period" with the period named) · Not applicable (`gst_type='unregistered'` → `UbEmptyState` "You are not registered for GST" + link to PLT-04 settings) · Composition (reduced report + banner) · Error (retry + `request_id`) · Processing (export queued) · Completed (workbook ready) · Failed (export failed).

#### 10. Validation Rules
| Field | Rule | Error (400 `validation_error`) |
|---|---|---|
| `period` | matches `YYYY-MM`, `YYYY-Qn` (n 1–4), or `fy:YYYY-YY` | "Period must be a month (2026-09), a quarter (2026-Q2) or a financial year (fy:2026-27)" |
| `period` / `date_from` | mutually exclusive | "Give either a period or a date range, not both" |
| `date_to − date_from` | ≤ 366 days | "GST summary can cover at most one year" |
| `date_to` | ≤ today | "Period cannot be in the future" |
| `type` | ∈ `outward,inward,both` | "Unknown supply type" |
| `section` | every element in the FR-1 whitelist | "Unknown section: {value}" |
| `rounding` | ∈ `paise,rupee` | "Rounding must be paise or rupee" |
| permission | `reports.financial.read` | 403 `permission_denied` "GST reports are available to owners, admins and accountants" |
| tenant | `gst_type='unregistered'` | 409 `gst_not_registered` "Add your GSTIN in Business settings to use GST reports" |

#### 11. Business Rules
1. `BR-1` **Source of truth is the document, frozen.** Every figure comes from `sales_document`/`sales_document_line` and `purchases_document`/`purchases_document_line` as they were issued: `party_gstin_snapshot`, `supplier_gstin_snapshot`, `party_snapshot`, `place_of_supply_state`, `is_inter_state`, `tax_rate` and the line tax columns. Editing a party today never changes a filed period. Documents with `status='draft'` are excluded; `status='void'` documents are excluded from all monetary sections and counted only in `docs[].cancelled_count`.
2. `BR-2` **Period selection is by `document_date`**, not `issued_at` and not `created_at` — a backdated invoice belongs to the period it is dated in, which is what the portal expects and what RPT-03 already does (RPT-03 EC-2).
3. `BR-3` **Intra vs inter.** `is_inter_state` is frozen on the document at issue (supplier `state_code` ≠ `place_of_supply_state`). Intra-state documents carry `cgst` and `sgst` with `cgst = sgst = ROUND(taxable_value × rate / 200, 2)`, IGST zero; inter-state carry `igst = ROUND(taxable_value × rate / 100, 2)`, CGST/SGST zero. RPT-07 never recomputes these — it sums the stored line columns, so the report and the printed invoice can never disagree.
4. `BR-4` **B2CL threshold.** A B2C inter-state document is B2CL when `grand_total > threshold`, where the threshold is read from the tenant setting `gst.b2cl_threshold` resolved **by document date**: `250000.00` for documents dated before 2024-11-01 and `100000.00` on or after, matching the notified change. The setting is a single JSON value `{ "effective": [ { "from": "2017-07-01", "amount": "250000.00" }, { "from": "2024-11-01", "amount": "100000.00" } ] }` so a future change is a settings edit, not a deploy.
5. `BR-5` **B2CS is rate-wise and state-wise, never invoice-wise.** Aggregation key is `(place_of_supply_state, tax_rate, is_inter_state)`; the row carries no document numbers. Credit notes to unregistered parties that are not B2CL-linked are **netted into B2CS** (negative values reduce the bucket), which is the portal's own rule — they never appear as CDNUR rows.
6. `BR-6` **Rounding.** Line-level tax is already rounded half-up to 2 decimals at issue (canon ADR-010). RPT-07 sums the stored values; it does not re-derive tax from a rate to avoid double rounding. Section totals are plain `SUM` of the rounded line values. With `rounding=rupee`, every *displayed and exported* figure is `ROUND(value, 0)` half-up applied **to the section total**, not to each row (rows then carry their paise value in a tooltip), because the portal accepts rupee figures at box level. `round_off` on `sales_document` is **excluded** from taxable value and tax and appears only in `invoice_value`, matching GSTR-1 where invoice value includes the round-off but the taxable value does not.
7. `BR-7` **Credit notes carry negative sign** in every aggregate section (`outward.by_rate`, `hsn`, `gstr3b`), so `3.1(a)` is net of returns; they additionally appear as their own positive-valued CDNR rows in `by_nature` because table 9B is reported separately. The two views are therefore intentionally different and each names its table so the accountant cannot conflate them.
8. `BR-8` **Normative outward rate-wise SQL:**
```sql
SELECT l.tax_code, l.tax_rate, d.is_inter_state,
       SUM(CASE WHEN d.kind = 'credit_note' THEN -l.taxable_value ELSE l.taxable_value END) AS taxable_value,
       SUM(CASE WHEN d.kind = 'credit_note' THEN -l.cgst ELSE l.cgst END)                   AS cgst,
       SUM(CASE WHEN d.kind = 'credit_note' THEN -l.sgst ELSE l.sgst END)                   AS sgst,
       SUM(CASE WHEN d.kind = 'credit_note' THEN -l.igst ELSE l.igst END)                   AS igst,
       SUM(CASE WHEN d.kind = 'credit_note' THEN -l.cess ELSE l.cess END)                   AS cess,
       COUNT(DISTINCT d.id) AS document_count
  FROM sales_document d
  JOIN sales_document_line l ON l.document_id = d.id
 WHERE d.tenant_id = :t
   AND d.kind IN ('invoice','bill_of_supply','credit_note')
   AND d.status NOT IN ('draft','void')
   AND d.document_date BETWEEN :date_from AND :date_to
 GROUP BY l.tax_code, l.tax_rate, d.is_inter_state
 ORDER BY l.tax_rate, d.is_inter_state;
```
   The HSN section is the same statement grouped by `(l.hsn_sac, l.unit_code, l.tax_rate, CASE WHEN d.party_gstin_snapshot IS NULL THEN 'b2c' ELSE 'b2b' END)` with `SUM(l.qty)` added; the nature section is the same statement grouped by the FR-4 classification expression. All three run over the same index range scan.
9. `BR-9` **GSTR-3B box mapping (normative):**

| Box | Meaning | Computed as |
|---|---|---|
| `3.1(a)` | Outward taxable supplies (other than zero-rated, nil, exempt) | Σ `outward.by_rate` where `tax_rate > 0`, net of credit notes |
| `3.1(b)` | Zero-rated (exports, SEZ) | **Not applicable — exports are not modelled at MVP**; the box is returned as all-zero with `note: "not_modelled"` |
| `3.1(c)` | Nil-rated and exempted | Σ where `tax_code IN ('GST0','NIL','EXEMPT')` |
| `3.1(d)` | Inward supplies liable to reverse charge | Σ `purchases_document` lines where `reverse_charge = true` |
| `3.1(e)` | Non-GST outward supplies | Σ where `tax_code = 'NONGST'` |
| `3.2` | Of 3.1(a), inter-state supplies to unregistered, composition and UIN holders — state-wise | `outward.by_nature` rows `b2cl` + `b2cs` where `is_inter_state`, grouped by `place_of_supply_state` |
| `4(A)(3)` | ITC on inward supplies liable to reverse charge | Σ reverse-charge inward tax where `itc_eligible` |
| `4(A)(5)` | All other ITC | Σ `purchases_document` line tax where `itc_eligible = true AND reverse_charge = false`, net of debit notes |
| `4(B)` | ITC reversed | **Not applicable — reversal tracking (rule 42/43, 180-day rule) is not modelled at MVP** |
| `5` | Values of exempt, nil-rated and non-GST inward supplies | Σ inward where `tax_rate = 0` |

10. `BR-10` **Net payable** = `MAX(output_igst − itc_igst, 0) + MAX(output_cgst − itc_cgst_after_igst_setoff, 0) + …`. The full cross-utilisation ladder (IGST credit set off against IGST, then CGST, then SGST; CGST credit never against SGST) is **out of scope at MVP**: RPT-07 computes and labels a **simple** figure `net_payable = (output_tax − itc_eligible_tax)` per head with negatives shown as "credit carried forward", and the tile carries a `UbHelpHint`: "A simple head-wise figure. Your final liability after credit set-off is calculated on the portal." Stating the limitation is the requirement; silently showing a wrong number is not acceptable.
11. `BR-11` **Tax on advances (GSTR-1 tables 11A/11B) is not modelled.** Payments received against no document are unallocated advances on the ledger and carry no tax. The nature table shows the `advances` row as "Not applicable" with the reason, so the accountant knows it was considered and excluded rather than forgotten.
12. `BR-12` **Composition tenants** issue `bill_of_supply` only and collect no tax. The reduced report shows turnover by rate-less bucket and computes the composition levy as `turnover × rate` where the rate comes from the tenant setting `gst.composition_rate` (default 1.000 for traders/manufacturers, 5.000 for restaurants, 6.000 for other service providers), labelled "CMP-08 box 3". No ITC section is rendered.
13. `BR-13` **Legacy slabs.** A document dated before a slab's `tax_rate.effective_to` legitimately carries that slab (for example `GST12` before 2025-09-22). The report groups by the **stored** `tax_rate` on the line, so a period spanning the change shows both 12 % and 18 % rows. A document dated *after* `effective_to` carrying that code raises the `legacy_rate_used` exception (FR-9).
14. `BR-14` **Worked example.** September 2026: one intra-state B2B invoice to Ramesh Traders (GSTIN present) with taxable ₹1,688.57 at 5 % → CGST ₹42.21, SGST ₹42.22, grand total ₹1,772.00 (round-off ₹−1.00); one walk-in intra-state B2C invoice taxable ₹855.00 at 5 % → CGST ₹21.38, SGST ₹21.37, total ₹898.00; one credit note against the B2B invoice taxable ₹443.63 at 5 % → CGST ₹11.09, SGST ₹11.09, total ₹465.81. Then: `outward.by_rate` 5 % intra = taxable ₹2,099.94, CGST ₹52.50, SGST ₹52.50 (net of the credit note). `by_nature`: B2B (4A) 1 document taxable ₹1,688.57; B2CS (7, intra, 5 %) taxable ₹855.00; CDNR (9B) 1 document taxable ₹443.63. `gstr3b` `3.1(a)` = taxable ₹2,099.94, CGST ₹52.50, SGST ₹52.50. HSN row `1006 / NOS / 5 %` b2b qty 2.000 taxable ₹1,688.57. `docs` row "Invoices for outward supply" from `INV/26-27/0041` to `INV/26-27/0042`, total 2, cancelled 0.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View any section | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Drill-down into documents | `reports.financial.read` + `sales.invoice.read` / `purchases.bill.read` | ✅ | ✅ | ❌ | ✅ |
| Exceptions list and links to fix | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Fix a party GSTIN from the exceptions list | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Export workbook | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| GSTR-1 JSON (P2) | `reports.export` | ✅ | ✅ | ❌ | ✅ |

A staff member hitting the route gets 403 `permission_denied`; the Reports nav does not render the entry for them.

#### 13. Edge Cases
1. `EC-1` A tax invoice issued while the tenant was `regular`, then the tenant switches to `composition` mid-year → the historical period still reports the tax invoices (BR-1); the banner names both schemes for periods that span the switch.
2. `EC-2` Party GSTIN added *after* the invoice was issued → the invoice stays B2C in the filed period (`party_gstin_snapshot` is null); the exceptions list flags it as `missing_party_gstin` **only for documents in an unfiled period** so the accountant can void and re-issue if it still matters.
3. `EC-3` Credit note issued in October against a September invoice → it lands in October's 9B and reduces October's `3.1(a)`, exactly as the portal expects (RPT-03 EC-3).
4. `EC-4` Inter-state B2C invoice of exactly ₹1,00,000.00 → **not** B2CL (`>` is strict); ₹1,00,000.01 is.
5. `EC-5` Line with `hsn_sac` null on a tax invoice → `missing_hsn` exception; the HSN section groups such lines under `hsn_sac = '(missing)'` so the total still reconciles.
6. `EC-6` An item sold in KGS and later in GMS (secondary unit, P2) → two HSN rows with different UQCs; the report does not convert units and says so in a footnote.
7. `EC-7` Document with `place_of_supply_state` equal to the supplier state but `is_inter_state = true` (data repair gone wrong) → `pos_state_mismatch` exception; the figure is still reported using the stored `is_inter_state` so the report matches the printed invoice.
8. `EC-8` A quarter is requested and one month within it has no documents → the section rows simply have no contribution; `docs[]` reports the series that exist, with gaps visible in the from/to numbers.
9. `EC-9` Voided invoice numbers `INV/26-27/0043` and `0047` in the period → `docs[]` shows from `0041` to `0048`, total 8, cancelled 2 (numbers are never reused — §21.3.1).
10. `EC-10` Purchases with `itc_eligible = false` (blocked credit, section 17(5)) → included in the inward table with the flag, excluded from `4(A)(5)`, and the difference is shown as a caption "₹2,340 of input tax is not claimable".
11. `EC-11` A cess-bearing item (tobacco, aerated drinks) → `cess` columns populate and flow into `3.1(a)`; the cess ledger is not modelled separately.
12. `EC-12` 6,000 documents in a quarter → the six aggregates run in ~2 s; the UI streams sections as they arrive by requesting `section=rate,nature` first and `section=hsn,docs,inward,exceptions` in a second call.
13. `EC-13` Accountant requests `fy:2026-27` before the FY has ended → allowed; `date_to` is clamped to today and `meta` says "Year to date".
14. `EC-14` A document carries `reverse_charge = true` on the **sales** side (supply liable to RCM in the recipient's hands) → it is reported under 4B of GSTR-1 and is **excluded** from `3.1(a)` (the recipient pays); the nature table names this explicitly.

#### 14. API Requirements
`GET /reports/gst-summary?period&date_from&date_to&type&section&rounding&format` → `200 { "data": { "outward": { "by_rate": [...], "by_nature": [...] }, "hsn": [...], "docs": [...], "inward": { "by_rate": [...], "itc": {...} }, "gstr3b": {...}, "exceptions": [...] }, "meta": {…} }`. `format=xlsx` returns the FR-14 workbook — synchronously below 5,000 contributing documents, otherwise `202 { "data": { "export_id": "…" } }` polled at `GET /reports/exports/{id}`. Errors: 400 `validation_error`, 403 `permission_denied`, 409 `gst_not_registered`, 429. `Cache-Control: private, max-age=120` for closed periods, `no-store` for a period containing today. The drill-down uses the existing register endpoints rather than a new one: `GET /reports/sales-register?date_from&date_to&tax_code&is_inter_state&level=line` with the cell's grouping keys as filters — **CR-RPT-2** records that `tax_code`, `is_inter_state` and `b2b` filters must be added to RPT-03's parameter whitelist. Frontend: `reportsService.getReport('gst-summary', params)`, thunk `fetchGstSummary`, slice `gstReportSlice`.

#### 15. Database Impact
Reads `sales_document` (`IX(tenant_id, kind, status, document_date DESC)`), `sales_document_line` (FK index on `document_id`), `purchases_document`, `purchases_document_line`, `platform_tenant` (`gstin`, `state_code`, `gst_type`), `platform_tenant_setting` (`gst.b2cl_threshold`, `gst.composition_rate`), `tax_rate` (for `effective_to` in the legacy-slab exception), `inventory_unit` (UQC via the line's `unit_code` snapshot — no join needed), `platform_document_sequence` (series prefixes for `docs[]`). Writes: none, beyond `reports_export` + `files_attachment` for the workbook. New index recommended: `CREATE INDEX CONCURRENTLY sales_document_line_doc_tax_idx ON sales_document_line (document_id, tax_code, tax_rate)` — it turns the four grouped aggregates into index-only scans on the line side; added in an `atomic = False` migration per §21.8. Two new settings keys are added to the well-known list in §21.3.1 (`gst.b2cl_threshold`, `gst.composition_rate`) — **CR-RPT-3**.

#### 16. Audit Requirements
Viewing is not audited. Exports are, via RPT-08: `action='report.exported'`, `metadata = { report: 'gst-summary', period, type, rounding, format, document_count }`. Because this report is the basis of a statutory filing, the audit row additionally stores `metadata.figures_hash` — a SHA-256 of the canonicalised `gstr3b` block — so a later dispute can prove which numbers were produced on which date. Fixing a party GSTIN from the exceptions list is audited by PTY-02 as `party.updated` with the changed fields.

#### 17. Notifications
Two scheduled reminders, produced by the runner command `reports.gst_filing_reminder` (ADR-012, 09:00 IST daily, idempotent on `(tenant, period, kind)`): on the 8th of the month, `notifications_notification` `type='gst_filing'`, title "GSTR-1 for {month} is due on the 11th", body "{n} issues to fix before you file" (or "Everything looks ready"), `data.route = '/reports/gst?period={period}'`; on the 17th, the same for GSTR-3B due on the 20th. Sent only to members holding `reports.financial.read` (`user_id` null with a permission filter at read time is not sufficient — the job writes one row per qualifying member). Composition tenants get a quarterly CMP-08 reminder on the 15th of the month following the quarter. No SMS and no WhatsApp: this is an in-app concern.

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'gst-summary', period_type, type, view, exception_count, is_ready }`, `ub.reports.gst_view_changed { from, to }`, `ub.reports.gst_drilldown { section, key, document_count }`, `ub.reports.gst_exception_opened { issue_code }`, `ub.reports.gst_exception_fixed { issue_code }`, `ub.reports.gst_rounding_toggled { rounding }`, `ub.reports.exported { report: 'gst-summary', format, sections[], async }`, `ub.reports.gst_filing_reminder_clicked { return: 'gstr1'|'gstr3b' }`.

#### 19. Security
`reports.financial.read` is enforced at the view, not only in the UI; there is no partial payload for lesser roles because every section is financial. Tenant scope is in the base `WHERE` of all six aggregates. GSTIN values are business identifiers, not personal data, but party names and the drill-down are still tenant-scoped and cross-tenant IDs 404. The workbook is written to `MEDIA_ROOT/exports/<tenant_id>/<uuid>.xlsx` and served through the authenticated `reports_export` download view; `expires_at` is 7 days; CSV/ZIP text cells are formula-escaped (RPT-08 BR-6). The `figures_hash` in the audit row contains no amounts in clear, only a digest. Export rate limit 10/hour per user (§22.1).

#### 20. Performance
Six statements per full request: outward rate-wise, outward nature-wise, HSN, docs, inward rate-wise, exceptions. Each is a single index range scan on `(tenant_id, kind, status, document_date)` joined to lines; the recommended `sales_document_line_doc_tax_idx` keeps the line side index-only. The exceptions query is the most expensive (it left-joins `tax_rate` and tests several predicates) and is therefore requested in the second `section` call so the first paint is fast. `EXPLAIN` asserted in CI on a fixture of 6,000 documents / 24,000 lines. Closed periods (whose `date_to < today`) are cached 120 s in the same report cache as RPT-01 and additionally memoised per `(tenant, period, rounding)`; a period containing today is never cached. No `reports_snapshot` row is written: a month's aggregate is cheap enough, and a stale statutory figure is worse than a slow one.

#### 21. Testing
- `T-RPT07-1` unit: BR-14 worked example — every section's every figure asserted to the paisa, including the credit-note sign convention in `by_rate` versus the positive CDNR row in `by_nature`.
- `T-RPT07-2` unit: B2CL threshold by document date (EC-4 boundary at both ₹2.5 L pre-2024-11-01 and ₹1 L after).
- `T-RPT07-3` unit: B2CS aggregation key is `(pos_state, rate, is_inter_state)` and unregistered credit notes net into it (BR-5).
- `T-RPT07-4` unit: intra vs inter split — CGST = SGST, IGST zero, and vice versa; values are read from the line, not recomputed (mutate a line's `cgst` in the fixture and assert the report follows it).
- `T-RPT07-5` unit: rupee rounding applies at section total, not per row; Σ rows in paise ≠ Σ rows rounded is tolerated and documented.
- `T-RPT07-6` unit: HSN section Σ taxable = `outward.by_rate` Σ taxable = RPT-03 `taxable_total` for the same period (three-way reconciliation).
- `T-RPT07-7` unit: `docs[]` from/to/count/cancelled with two voided numbers in the middle of a series (EC-9).
- `T-RPT07-8` unit: every GSTR-3B box in BR-9, including the all-zero `3.1(b)` with `note: "not_modelled"` and the RCM sales exclusion (EC-14).
- `T-RPT07-9` unit: each of the nine exception codes fires on a purpose-built fixture and does not fire on a clean one.
- `T-RPT07-10` unit: legacy slab — a document dated 2025-09-10 at `GST12` groups as 12 % without an exception; the same code on 2025-10-10 raises `legacy_rate_used`.
- `T-RPT07-11` API: `gst_type='unregistered'` → 409 `gst_not_registered`; `composition` → reduced payload with the CMP-08 block and no ITC section.
- `T-RPT07-12` API: staff → 403; accountant → 200; `section` subsetting returns exactly the requested keys.
- `T-RPT07-13` API: period parsing for `2026-09`, `2026-Q2`, `fy:2026-27`, and each 400 message.
- `T-RPT07-14` API: XLSX workbook has the eleven FR-14 sheets with the expected headers; CSV format returns a ZIP.
- `T-RPT07-15` component: view toggle preserves period; every figure cell exposes its return coordinate via `aria-describedby`; the filing strip switches between success and warning.
- `T-RPT07-16` E2E: issue the BR-14 documents → open the report for September → assert the on-screen 3.1(a) figures → fix a missing GSTIN → strip turns "Ready to file" → export XLSX → download.
- `T-RPT07-17` perf: 6,000 documents / 24,000 lines in a quarter ≤ 2.5 s; `EXPLAIN` shows no sequential scan on `sales_document_line`.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given the BR-14 September documents, when I open GST summary for 2026-09, then `outward.by_rate` shows one 5 % intra-state row with taxable ₹2,099.94, CGST ₹52.50 and SGST ₹52.50, and the row is badged "GSTR-3B · 3.1(a)".
- `AC-2` (US-2) Given the same period, when I switch to the GSTR-1 view, then I see B2B (4A) 1 document ₹1,688.57, B2CS (7) ₹855.00 and CDNR (9B) 1 document ₹443.63, each badged with its table number, and the advances row reads "Not applicable — tax on advances is not recorded in DigiKhaato".
- `AC-3` (US-3) Given the invoice line carries HSN 1006, unit NOS, qty 2 at 5 %, when I open the HSN section, then a row shows `1006 · NOS · 5% · b2b · qty 2.000 · taxable ₹1,688.57` badged "GSTR-1 · 12".
- `AC-4` (US-4) Given invoices `INV/26-27/0041` to `INV/26-27/0048` of which `0043` and `0047` are void, when I open the document summary, then the row reads from `0041`, to `0048`, total 8, cancelled 2, badged "GSTR-1 · 13".
- `AC-5` (US-5) Given a purchase bill with ₹5,000 taxable at 18 % marked ITC-eligible and another ₹2,000 at 18 % marked not eligible, when I open the inward section, then `4(A)(5)` shows ₹900.00 and a caption states that ₹360.00 is not claimable.
- `AC-6` (US-6) Given output tax ₹105.00 and eligible ITC ₹900.00, when I open the report, then the Net GST payable tile shows a head-wise credit carried forward with the help hint naming the portal as the place of final set-off, and the due-date chip reads 20/10/2026.
- `AC-7` (US-7) Given one invoice whose party is marked registered but has no GSTIN and one line without HSN, when I open the report, then the strip reads "2 issues to fix", the exceptions list names both with document links, and after I add the GSTIN the count falls to 1.
- `AC-8` (US-8) Given `reports.export`, when I export XLSX, then the workbook has the sheets Summary, B2B, B2CL, B2CS, CDNR, NIL-EXEMPT, HSN, DOCS, INWARD, GSTR3B and EXCEPTIONS, and the GSTR3B sheet's 3.1(a) row equals the on-screen figure.

#### 23. Dependencies
SAL-02 (tax computation, snapshots, `is_inter_state`, `place_of_supply_state`), SAL-04 (credit notes), SAL-05 (void), PUR-01/PUR-03 (`itc_eligible`, `reverse_charge`), PTY-02 (party GSTIN and `gst_registration`), PLT-04 (tenant GSTIN, `state_code`, `gst_type`, settings), INV-01 (HSN/SAC on items, UQC units), `tax_rate` seed data with `effective_from/to`, RPT-03/RPT-04 (drill-down and reconciliation), RPT-08 (export), NTF-01 (filing reminders), scheduler command `reports.gst_filing_reminder`, CR-RPT-2 (register filters), CR-RPT-3 (settings keys).

#### 24. Future Enhancements
GSTR-1 JSON for the offline tool (RPT-12, P2) reads this report's sections unchanged; GSTR-3B JSON (P3); GSTR-2B reconciliation against the purchase register with a matched/unmatched worklist (P3); e-invoice IRN generation and the resulting auto-population of tables 4A/9B (SAL-11, P3); tax on advances (11A/11B) once receipt vouchers exist; ITC cross-utilisation ladder and the electronic credit ledger once the accounting module lands; export/SEZ supplies for 3.1(b) and GSTR-1 table 6; QRMP quarterly filing mode with IFF for the first two months; direct filing through the GSP API (Future).

---

### RPT-08 — Export (CSV / Excel)

#### 1. Business Objective
Make every report leave the app. The accountant works in Excel and in Tally; the owner sends lists on WhatsApp; the bank asks for a statement. One export mechanism — same button, same file naming, same column discipline, same permission — serves all fourteen report surfaces and the list screens, so a new report ships with an export for free instead of inventing its own. Large ranges must not block the request or the user: they become a `platform_job` row drained by the cron-driven runner, and the file arrives as a download link in the bell. Measures: every report in Part 17.10 has a working export on the day it ships (CI test enumerates them); p95 synchronous export ≤ 1.5 s for 5,000 rows; ≥ 95 % of async exports complete within 2 minutes of being queued; zero CSV formula-injection findings in the security review; zero files served to the wrong tenant (CI test).

#### 2. User Personas
**AC** (primary — takes everything into Excel), **OW** (occasional — reorder lists, debtor lists), **ST** (excluded: `reports.export` is not in the staff role).

#### 3. User Stories
1. `US-RPT08-1` As an accountant I want to export any report to CSV so that I can open it in Excel or import it into Tally.
2. `US-RPT08-2` As an accountant I want an Excel file with proper number and date cells so that I do not have to re-type or re-format anything.
3. `US-RPT08-3` As an accountant I want a large date range to export without the app freezing, and to be told when the file is ready.
4. `US-RPT08-4` As an owner I want the exported file to reflect exactly the filters I am looking at so that I do not have to explain a mismatch.
5. `US-RPT08-5` As an owner I want to find files I exported earlier so that I do not have to generate them again.
6. `US-RPT08-6` As a business owner I want exports to be limited to people I trust so that my data does not walk out with a counter assistant.

#### 4. Functional Requirements
1. `FR-1` Every report endpoint accepts `format=json|csv|xlsx` (default `json`). `format=csv|xlsx` requires `reports.export`. The **same** query, filters, ordering and permission-based column suppression that produced the on-screen result produce the file — there is one selector per report and the exporter is a renderer over its rows (FR-4 of each report).
2. `FR-2` **Synchronous path.** When the estimated row count is ≤ 5,000, the response is the file itself: `200` with `Content-Type: text/csv; charset=utf-8` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="<name>"`, streamed with `StreamingHttpResponse` in 1,000-row chunks. The row count is estimated with a `COUNT(*)` over the same filtered queryset before rendering begins.
3. `FR-3` **Asynchronous path.** Above 5,000 rows the endpoint returns `202 { "data": { "export_id": "…", "status": "queued", "report": "…", "format": "…", "estimated_rows": 18420 } }`, having written one `reports_export` row (`status='queued'`) and one `platform_job` row (`job_type='reports.build_export'`, `payload={ export_id }`). The client polls `GET /reports/exports/{id}` every 3 s (backing off to 10 s after 30 s) until `status ∈ {ready, failed}`.
4. `FR-4` **The runner.** `manage.py run_scheduler` (ADR-012; cron every minute in `crontab`, or the docker-compose `scheduler` service) claims queued jobs with `SELECT … FOR UPDATE SKIP LOCKED LIMIT 5`, runs `reports.build_export` for each, and writes the file to `MEDIA_ROOT/exports/<tenant_id>/<uuid4>.<ext>` through the Django storage API (ADR-013). There is **no Celery and no Redis**: the queue is a table, the worker is a cron-invoked management command, and the abstraction `jobs.enqueue(task, payload)` is the only thing callers touch, so a real broker can replace the runner later without changing this feature.
5. `FR-5` **Job outcome.** On success the job sets `reports_export.status='ready'`, `file_attachment_id`, `row_count`, `expires_at = now + 7 days`, and writes a `notifications_notification` (`type='export_ready'`). On failure it sets `status='failed'`, `result.error` (a user-safe message plus an internal `request_id`), and notifies with `type='export_failed'`. A job that dies mid-run is re-claimed after a 10-minute lease expiry, at most 3 attempts, then `failed`.
6. `FR-6` `GET /reports/exports/{id}` → `{ id, report, params, format, status, row_count, file_size_bytes, download_url, expires_at, created_at, finished_at, error }`. `GET /reports/exports` → the user's export history (newest first, page 25), which is US-5's surface.
7. `FR-7` `GET /reports/exports/{id}/download` streams the file from disk with the correct `Content-Type` and the human file name, after re-checking tenant, ownership and `reports.export`. The stored path is never exposed; `download_url` points at this endpoint.
8. `FR-8` **File naming (normative):** `<report-slug>_<range>.<ext>` where `<range>` is `<date_from>_<date_to>` for range reports, `<as_of>` for point-in-time reports, and `<YYYY-MM-DD>` (today) for reports with no date. Examples: `sales-register_2026-09-01_2026-09-30.csv`, `receivables-aging_2026-09-18.xlsx`, `stock-summary_2026-09-18.csv`, `gst-summary_2026-09.xlsx`. Slugs are fixed per report and are the same strings used in `reports_export.report_name` and in the analytics events.
9. `FR-9` **CSV rules:** UTF-8 with a BOM (`﻿`) so Excel on Windows opens Devanagari correctly; `\r\n` line endings; comma delimiter; every field quoted only when it contains a comma, quote or newline (Python `csv.QUOTE_MINIMAL`); amounts as plain decimal strings with 2 decimals and **no** thousands separator and **no** ₹ symbol; quantities with 3 decimals; dates as `YYYY-MM-DD`; booleans as `true`/`false`; empty for null; multi-values joined with `;`. One header row, exactly the columns each report's FR declares, in that order. A `TOTAL` row where the report declares one.
10. `FR-10` **XLSX rules:** one sheet per section (most reports have one; RPT-07 has eleven), sheet names ≤ 31 characters and free of `[]:*?/\`; row 1 is the header, bold, frozen (`freezePanes A2`), with an autofilter over the used range; money and quantity cells are **numbers** with the number formats `#,##,##0.00` (Indian grouping) and `#,##0.000`; dates are date cells with format `dd/mm/yyyy`; text stays text; column widths are derived from the longest value capped at 40 characters; the TOTAL row is bold with a top border.
11. `FR-11` **XLSX is written in-house.** ADR-021 does not permit `openpyxl`/`xlsxwriter`, and this feature does not justify an ADR: `reports/exporters/xlsx.py` implements `XlsxStreamWriter` over the standard library (`zipfile`, `xml.sax.saxutils.escape`, `datetime`) emitting a minimal but valid OOXML package — `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/styles.xml` (the six formats above), and one `xl/worksheets/sheetN.xml` per section written row by row with inline strings (`t="inlineStr"`) so no shared-string table has to be held in memory. It supports exactly what FR-10 describes and nothing else. Opening the output in Excel, LibreOffice and Google Sheets is an acceptance test, not an assumption.
12. `FR-12` **PDF is not an export format here.** Per ADR-014, documents and report pages are printed client-side: each report page has a `ReportPrintView` React component rendered by the Print action and sent to `window.print()`, and the browser's "Save as PDF" produces the file. `format=pdf` on any report endpoint returns 400 `validation_error` with "Reports are printed from your browser — use the Print button".
13. `FR-13` **UI.** The Export control is a `UbShareSheet`-style `MLDropdownMenu` on every `ReportPageShell`: "Download CSV", "Download Excel", "Print". Synchronous downloads trigger the browser download and a `UbSnackbar` "Your file is downloading". Asynchronous ones show "Preparing your file — we will tell you when it is ready", add a row to the export history, and raise the bell notification on completion with a direct download action.
14. `FR-14` **List screens reuse the same mechanism**: PTY-01 parties, SAL-08 bills, INV-02 items, PAY-02 payments and EXP-02 expenses each expose `format=csv` on their list endpoint with the same permission, naming, escaping and async threshold. Their column sets are declared in their own FRDs; the machinery is this one.
15. `FR-15` **Quotas.** 10 export requests per user per hour (§22.1) and at most 3 queued-or-running jobs per tenant; a fourth returns 429 `export_queue_full` with "You already have 3 files being prepared — try again when they are done". A tenant's export files are capped at 500 MB total; the oldest expired files are purged first by the GC command.

#### 5. Non-Functional Requirements
Synchronous p95 ≤ 1.5 s at 5,000 rows (CSV) and ≤ 3 s (XLSX); memory is O(chunk) — no report ever materialises its full row set in Python; the runner processes a 100,000-row export in ≤ 90 s and holds ≤ 150 MB RSS. The polling client stops after 10 minutes and tells the user to check the bell. Download works on mobile browsers (Android Chrome, iOS Safari) — `Content-Disposition` with an ASCII fallback file name plus `filename*=UTF-8''…` for Hindi report names. Files are written with mode 0640 under `MEDIA_ROOT`, which is not served by the web server directly. i18n `reports.export.*`.

#### 6. User Flow
Report screen → Export → Download Excel → (≤ 5,000 rows) file downloads, snackbar confirms.
Alternate A (large): Export → "Preparing your file…" → the user keeps working → bell badge → "Your Sales register is ready" → Download → file saves. 
Alternate B (history): More → Exports → list of the last files with size, row count and "Expires in 5 days" → Download again.
Alternate C (failure): job fails → bell "We could not prepare your Sales register" → tap → export detail with the reason and a Retry button that re-queues the same params.
Alternate D (staff): the Export control is not rendered; a deep link to `?format=csv` returns 403 and the UI shows "Ask the owner to export this".

#### 7. UI Requirements
Shared component `ReportExportMenu` (feature-local, promoted to `Ub*` only if a second module needs it — §23.3) built from `MLDropdownMenu*` + `MLButton`, mounted in `ReportPageShell`'s action slot; disabled with a tooltip when `reports.export` is absent. Export history page `app/(app)/reports/exports/page.tsx` → `<ExportHistoryPageContent/>` using `UbDataGrid` with columns Report · Filters (summarised chips) · Format · Rows · Size · Status (`UbStatusBadge`: Queued · Preparing · Ready · Failed · Expired) · Created · Action (Download / Retry). Mobile: card list. Progress is not a percentage (the job cannot report one honestly) — it is an indeterminate `MLProgress` with the elapsed time. Redux: `exportsSlice` (`items`, `polling`, `status`), thunks `requestExport({ report, params, format })`, `fetchExport(id)`, `fetchExportHistory()` in `reportsThunk.ts`; `reportsService.requestExport()` and `.getExport(id)`. The poll lives in a `useExportPolling(id)` hook so leaving the page does not cancel the job, only the polling.

#### 8. UX Requirements
Copy: "Download CSV" = "CSV डाउनलोड करें", "Download Excel" = "Excel डाउनलोड करें", "Preparing your file" = "फ़ाइल तैयार हो रही है", "Your file is ready" = "आपकी फ़ाइल तैयार है", "Expires in {n} days" = "{n} दिन में हट जाएगी". The snackbar for an async request names the report and sets the expectation ("Sales register · we will tell you when it is ready — usually under a minute"), following the Koper rule that a toast states what happened and the move it enables. Nothing is a modal: exporting never interrupts. The file-expiry notice is always visible in the history so a missing file is never a surprise. No confirmation dialog — exporting is not destructive — but the first export of a tenant's data shows a one-time `UbInputHint` in the menu: "Exported files leave DigiKhaato. Share them carefully."

#### 9. States
Idle · Requesting (menu item shows `MLSpinner`) · Downloading (sync; browser handles it) · Queued · Preparing · Ready (download available) · Failed (reason + Retry) · Expired (file gone; Retry re-queues) · Forbidden (control hidden / 403 on deep link) · Throttled (429 with the wait time) · Queue full (429 `export_queue_full`).

#### 10. Validation Rules
| Field | Rule | Error |
|---|---|---|
| `format` | ∈ `json,csv,xlsx` | 400 `validation_error` "Unknown format" |
| `format=pdf` | rejected | 400 `validation_error` "Reports are printed from your browser — use the Print button" |
| permission | `reports.export` | 403 `permission_denied` "You do not have permission to export reports" |
| report params | validated by the report's own rules first | the report's own 400 — an invalid filter never reaches the exporter |
| rate | ≤ 10/hour/user | 429 `rate_limited` "You have exported 10 files this hour — try again at {time}" |
| queue | ≤ 3 active per tenant | 429 `export_queue_full` "You already have 3 files being prepared" |
| `{id}` | belongs to the tenant and to the requesting user (or the caller holds `platform.audit.read`) | 404 `not_found` |
| expired file | `expires_at < now` or the file is missing on disk | 410 `export_expired` "This file has expired — generate it again" |

#### 11. Business Rules
1. `BR-1` **The file equals the screen.** The exporter receives the report's selector and its validated params; it never re-implements a filter. A CI test per report asserts that the JSON row count and the CSV data-row count are equal for the same params, and that every JSON numeric field appears in the CSV.
2. `BR-2` **Permission-based column suppression flows into the file.** If a role cannot see a column on screen (RPT-06 cost columns, RPT-04 line costs), the column is absent from the header, not blank — otherwise the header would leak the existence of the data. The permission set is captured at request time and stored in `reports_export.params.permissions_version`, so a job queued by an accountant cannot be downloaded by someone who has since lost the right (FR-7 re-checks).
3. `BR-3` **Async threshold is 5,000 rows** for every report, measured by a `COUNT(*)` on the filtered queryset before rendering. RPT-07 measures contributing *documents*, not output rows, because its output is many small sheets.
4. `BR-4` **Retention is 7 days** (`reports_export.expires_at`, §21.3.11). The scheduled job `reports.expire_exports` (daily 03:15 IST per Part 20 §20.8.4, which owns the name and the time) deletes the file from storage, soft-deletes the `files_attachment`, and sets `reports_export.status='expired'`. The row itself is kept for audit.
5. `BR-5` **Idempotency.** A repeat request with identical `(tenant, user, report, params hash, format)` inside 60 seconds returns the existing `export_id` instead of queueing a second job, so a double-tap does not create two files. `params_hash` is a SHA-256 of the canonicalised params JSON.
6. `BR-6` **Formula injection.** Any CSV or inline-string XLSX cell whose first character is `=`, `+`, `-`, `@`, tab or carriage return is prefixed with a single quote `'`. This applies to every text column of every report — party names, notes, item descriptions, reasons — because those are user-supplied. Numeric cells are written as numbers and are therefore never escaped. A unit test feeds `=cmd|'/c calc'!A0` as a party name through each report.
7. `BR-7` **Indian number formatting is a display concern only.** Files carry machine-readable values (`1234567.89`), and the XLSX *number format* renders them as `12,34,567.89`. CSV carries no grouping at all — grouping in CSV breaks every importer.
8. `BR-8` **Negative values keep their sign** (credit notes in RPT-03, negative stock in RPT-06) and are written as `-465.81`, never as `(465.81)`.
9. `BR-9` **One job, one file.** A multi-section report produces one workbook (XLSX) or one ZIP of CSVs; it never produces several downloads. The ZIP is written with `zipfile.ZIP_DEFLATED` and contains files named `<report-slug>_<section>_<range>.csv`.
10. `BR-10` **The runner is idempotent.** `reports.build_export` is safe to re-run: it writes to a temporary path and moves it into place atomically, and it no-ops when `reports_export.status='ready'`. Job claiming uses `FOR UPDATE SKIP LOCKED` so two concurrent runner invocations (a slow cron overlapping the next tick) cannot process the same job.
11. `BR-11` **Storage layout** is `MEDIA_ROOT/exports/<tenant_id>/<uuid4>.<ext>`; the `files_attachment` row carries `kind='export_file'`, `storage_key`, `content_type`, `size_bytes` and `sha256`. Moving to S3 later is a `DEFAULT_FILE_STORAGE` setting change only (ADR-013) — no code in this feature touches the filesystem directly.
12. `BR-12` **Failure is user-visible and specific.** The job maps internal exceptions to one of: "The date range is too large — try a shorter period", "Something went wrong while preparing the file (reference {request_id})", "Your plan's storage limit is full". Stack traces never reach the user.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Request an export of any report | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Export a list screen (parties, items, bills, payments) | `reports.export` (+ that module's read) | ✅ | ✅ | ❌ | ✅ |
| Export party statements | `ledger.statement.export` | ✅ | ✅ | ❌ | ✅ |
| See own export history | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| See the tenant's whole export history | `platform.audit.read` | ✅ | ✅ | ❌ | ✅ |
| Download a file | `reports.export` + owner of the export (or `platform.audit.read`) | ✅ | ✅ | ❌ | ✅ |
| Print (client-side PDF) | the report's own read permission | ✅ | ✅ | ✅ | ✅ |

Printing is deliberately *not* gated by `reports.export`: a staff member may print what they can already see on screen; taking a data file away is the privileged act.

#### 13. Edge Cases
1. `EC-1` A filter changes between the screen render and the Export click → the exporter uses the params sent with the request, and the file name and the history row record them, so the file is always explainable.
2. `EC-2` Zero rows → the file is still produced with the header row (and the TOTAL row with zeros where declared); the snackbar says "No rows matched — the file has only headers".
3. `EC-3` The report changes shape (a column is added) while a job is queued → the job renders with the current code; the history row's stored `params` do not pin a schema version. Accepted: exports are not a contract, and the header row names the columns.
4. `EC-4` The runner is not running (cron misconfigured) → jobs sit in `queued`; a health check `GET /system/health` reports `jobs.oldest_queued_age_seconds` and the export detail shows "Taking longer than usual" after 5 minutes.
5. `EC-5` Disk full → the job fails with BR-12's storage message; the GC command runs immediately after a storage failure to reclaim expired files.
6. `EC-6` The user logs out while a job runs → the job completes and the notification waits in the bell.
7. `EC-7` The user is removed from the tenant before downloading → FR-7's re-check 404s, and the file is purged by the membership-removal handler.
8. `EC-8` A 1,000,000-row request (a five-year day book) → `COUNT(*)` puts it on the async path; the job streams it; the resulting CSV is ~180 MB, which exceeds the 500 MB tenant cap only in combination — the cap check happens before writing and fails fast with a message suggesting a shorter range.
9. `EC-9` Two users export the same report with the same params at the same second → BR-5's idempotency window is per user, so two files are produced; this is correct, since each user's permission-suppressed column set may differ.
10. `EC-10` A party name contains a comma and a double quote → CSV quoting handles it (`"Ramesh ""Bhai"" Traders, Camp"`); a round-trip test parses the file back.
11. `EC-11` A Hindi report name in `Content-Disposition` → ASCII fallback `sales-register_....csv` plus `filename*=UTF-8''…`; slugs are always ASCII so this only affects a future localised slug.
12. `EC-12` XLSX with more than 1,048,576 rows → the writer raises before starting and the job fails with "This report is too large for Excel — download it as CSV".
13. `EC-13` A sheet name collides after truncation to 31 characters (RPT-07 sections) → the writer appends a numeric suffix and a unit test asserts uniqueness.
14. `EC-14` The file exists on disk but the `files_attachment` row was soft-deleted → treated as expired (410), not as a 500.

#### 14. API Requirements
- Every report: `GET /reports/{name}?…&format=csv|xlsx` → 200 file (sync) or 202 `{ export_id }` (async). The canonical aliases `GET /reports/{name}.csv` and `.xlsx` (§0.8) map to the same view with `format` inferred from the extension.
- `GET /reports/exports?status=&report=&page=` → `{ data: [...], meta: { page, page_size, total, total_pages } }`.
- `GET /reports/exports/{id}` → the FR-6 object. 404 cross-tenant; 410 `export_expired`.
- `GET /reports/exports/{id}/download` → file stream; 302 is **not** used (no signed URLs at MVP, no CDN).
- `POST /reports/exports/{id}/retry` → re-queues the same params as a **new** `reports_export` row and returns 202 with the new id; the old row stays `failed` for audit.
- `DELETE /reports/exports/{id}` → deletes the file and marks the row `expired` (a user clearing their own files).
Errors across all of these: 400 `validation_error`, 403 `permission_denied`, 404 `not_found`, 410 `export_expired`, 429 `rate_limited` / `export_queue_full`, 503 when storage is unavailable. Two new error codes (`export_expired`, `export_queue_full`) are added to the §22.1 stable list — **CR-RPT-5**.
Frontend: `reportsService.requestExport(report, params, format)`, `.getExport(id)`, `.listExports(params)`, `.retryExport(id)`; `exportsSlice` with `requestExport`/`fetchExport`/`fetchExportHistory` thunks; the snackbar is the single toast channel (`snackbarSlice`).

#### 15. Database Impact
Writes `reports_export` (§21.3.11: `report_name`, `params jsonb`, `format`, `status`, `file_attachment_id`, `row_count`, `expires_at`) — extended by **CR-RPT-4** with `requested_by_id uuid FK platform_user`, `params_hash char(64)`, `started_at timestamptz`, `finished_at timestamptz`, `attempts smallint NN default 0`, `error text NULL`, `file_size_bytes bigint NULL`; indexes `IX(tenant_id, created_at DESC)`, `IX(tenant_id, status)`, `IX(tenant_id, requested_by_id, created_at DESC)`, `U(tenant_id, requested_by_id, params_hash, format) WHERE status IN ('queued','running')` (BR-5). Writes `files_attachment` (`kind='export_file'`). Writes `platform_job` — whose columns are not specified in Part 21 and are defined here as **CR-RPT-4**: `id uuid PK`, `tenant_id uuid NULL`, `task varchar(64) NN`, `payload jsonb NN`, `status varchar(12) NN default 'queued'` (`queued`, `running`, `done`, `failed`), `run_after timestamptz NN default now()`, `locked_at timestamptz NULL`, `locked_by varchar(64) NULL`, `attempts smallint NN default 0`, `max_attempts smallint NN default 3`, `last_error text NULL`, `created_at`, `finished_at`; `IX(status, run_after)` and `IX(tenant_id, task, created_at DESC)`. Writes `notifications_notification` and `platform_audit_log`. Reads: whatever the underlying report reads.

#### 16. Audit Requirements
Two audit rows per export, both mandated by §21.7 ("Export/Import — request, complete — params"): on request, `action='report.export_requested'`, `entity_type='reports_export'`, `entity_id`, `metadata = { report, params, format, estimated_rows, async }`; on completion, `action='report.exported'` with `metadata = { report, params, format, row_count, file_size_bytes, duration_ms }`. Downloads are audited too (`action='report.export_downloaded'`, `metadata = { report, file_size_bytes }`) because a file may be downloaded by a different person from the one who requested it — this is the trail that answers "who took the customer list". Failures write `action='report.export_failed'` with the user-safe message and the internal `request_id`. Retention follows the 7-year financial rule.

#### 17. Notifications
In-app only. `type='export_ready'`: title "Your {report name} is ready", body "{row_count} rows · {size} · expires {date}", `data = { route: '/reports/exports', export_id, download_url }`, addressed to `user_id` = the requester. `type='export_failed'`: title "We could not prepare your {report name}", body = BR-12's message, with a Retry action. No SMS, no WhatsApp, no email — an export is a private, in-session concern and sending files out of band would be a data-protection problem the product does not need. Synchronous exports raise no notification, only a snackbar.

#### 18. Analytics / Event Tracking
`ub.reports.export_requested { report, format, async, estimated_rows, filters[] }`, `ub.reports.exported { report, format, rows, async, duration_ms }`, `ub.reports.export_failed { report, format, reason }`, `ub.reports.export_downloaded { report, format, from: 'snackbar'|'bell'|'history' }`, `ub.reports.export_retried { report }`, `ub.reports.export_history_viewed {}`, `ub.reports.print_clicked { report }`.

#### 19. Security
Tenant scope is applied twice — once by the report's selector and once by the `reports_export` lookup — and the file path itself contains the tenant id so a mismatch is detectable in logs. Files are never served from a public directory: `MEDIA_ROOT` is outside the web root and the only route to a file is FR-7's authenticated view, which re-checks membership, `reports.export` and ownership on every download. Storage keys are random UUIDs, so guessing a path is useless even if the directory were exposed. Formula injection is handled by BR-6 and tested per report. The export history deliberately shows *who* requested each file, making exfiltration visible to the owner. DPDP: exports containing party mobiles (RPT-05, PTY-01) are audited with the row count, and the export menu's one-time hint states that files leave the app. Rate limits (FR-15) bound both cost and bulk extraction. The `platform_job` payload contains only an `export_id`, never params or PII, so job rows are safe to log.

#### 20. Performance
CSV rendering is a generator over `queryset.iterator(chunk_size=1000)` with `select_related` on every serialized relation, so query count is constant and memory is bounded; the HTTP response streams as it renders. XLSX uses the same generator writing inline-string rows straight into the zip stream, so a 100,000-row sheet never exists in memory. `COUNT(*)` for the threshold reuses the report's filtered queryset and its indexes. The runner claims at most 5 jobs per tick with `SKIP LOCKED`, sets `statement_timeout = 120s` per job, and records `duration_ms`; a job exceeding the timeout fails with the "too large" message rather than hanging the runner. Purge runs nightly. The export history list is paginated and indexed.

#### 21. Testing
- `T-RPT08-1` unit: CSV writer — BOM, CRLF, minimal quoting, decimal formatting, date formatting, null handling, `;`-joined multi-values, TOTAL row.
- `T-RPT08-2` unit: BR-6 formula escaping across `=`, `+`, `-`, `@`, tab and CR, in both CSV and XLSX inline strings; numeric cells untouched.
- `T-RPT08-3` unit: `XlsxStreamWriter` produces a package that `zipfile` validates and that a golden-file comparison of `xl/worksheets/sheet1.xml` matches; number formats, frozen header, autofilter, column widths and sheet-name uniqueness (EC-13) asserted.
- `T-RPT08-4` integration: the produced XLSX opens in LibreOffice headless (`soffice --convert-to csv`) and the round-tripped values equal the source rows — the acceptance test for FR-11.
- `T-RPT08-5` unit: threshold logic — 5,000 rows sync, 5,001 async; RPT-07 counts documents, not rows.
- `T-RPT08-6` unit: BR-5 idempotency window returns the same `export_id` within 60 s and a new one after.
- `T-RPT08-7` unit: runner claims with `SKIP LOCKED`; two concurrent runners process disjoint jobs; a dead job is re-claimed after the lease and gives up after 3 attempts.
- `T-RPT08-8` unit: atomic write — a job killed mid-write leaves no partial file at the final path.
- `T-RPT08-9` API: 202 shape, poll to `ready`, `download_url` streams the right bytes with the right `Content-Disposition`.
- `T-RPT08-10` API: staff → 403 on every `format=csv` endpoint (parametrised over all fourteen reports and five list screens); `format=pdf` → 400 with the exact message.
- `T-RPT08-11` API: expired file → 410; cross-tenant id → 404; removed member → 404 (EC-7).
- `T-RPT08-12` API: rate limit 11th request → 429 `rate_limited`; 4th queued job → 429 `export_queue_full`.
- `T-RPT08-13` API (contract, parametrised over every report): CSV data-row count equals JSON `meta.total`, and the CSV header exactly equals the report's declared column list (BR-1). This is the test that keeps a new report from shipping without a correct export.
- `T-RPT08-14` API: permission-suppressed columns are absent from the header, not blank (BR-2).
- `T-RPT08-15` component: export menu hidden without permission; snackbar copy for sync vs async; polling hook backs off and stops at 10 minutes; history badges map to statuses.
- `T-RPT08-16` E2E: request a 20,000-row day-book export → 202 → run `manage.py run_scheduler` → notification appears → download → file has 20,001 lines including the header.
- `T-RPT08-17` E2E: retry a failed export → new row, old row still `failed`.
- `T-RPT08-18` perf: 100,000-row CSV in ≤ 90 s and ≤ 150 MB RSS in the runner; 5,000-row sync CSV ≤ 1.5 s.
- `T-RPT08-19` security: party name `=cmd|'/c calc'!A0` is escaped in every report's export; a download attempt with another tenant's export id 404s.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given I am an accountant on the Sales register for September, when I choose Download CSV and the register has 320 rows, then a file named `sales-register_2026-09-01_2026-09-30.csv` downloads immediately, opens in Excel with Hindi party names intact, and has 320 data rows plus a header.
- `AC-2` (US-2) Given the same report, when I choose Download Excel, then the workbook's amount cells are numbers formatted `12,34,567.89`, the date cells are dates formatted `dd/mm/yyyy`, row 1 is bold and frozen, and an autofilter covers the used range.
- `AC-3` (US-3) Given a day book for a whole financial year with 18,420 rows, when I choose Download CSV, then I get "Preparing your file" immediately, the request does not block, and within two minutes a bell notification says "Your Day book is ready" with a working download link.
- `AC-4` (US-4) Given I have filtered the stock summary to the category "Rice & Atta" and the Low tab, when I export, then the file contains exactly those rows and the export history row shows those filters.
- `AC-5` (US-5) Given I exported three files this week, when I open More → Exports, then I see all three with their row counts, sizes, statuses and "Expires in {n} days", and I can download any that is still ready.
- `AC-6` (US-6) Given I am a staff member, when I open any report, then there is no Export control, and a hand-typed `?format=csv` URL returns 403 with "You do not have permission to export reports" while the Print button still works.

#### 23. Dependencies
Every report in §17.10 (RPT-01 … RPT-12) and the list screens PTY-01, INV-02, SAL-08, PAY-02, EXP-02, LED-04 (statement export); `platform_job` + `jobs.enqueue` + `manage.py run_scheduler` (ADR-012); Django storage under `MEDIA_ROOT` (ADR-013); `files_attachment` (§21.3.2); NTF-01 (in-app bell); PLT-08 (roles and `reports.export`); PLT-09 (audit log); the scheduled jobs `reports.build_export` and `reports.expire_exports` (Part 20 §20.8.4); CR-RPT-4 (`platform_job` and `reports_export` columns), CR-RPT-5 (two new error codes).

#### 24. Future Enhancements
Scheduled reports — "email me the sales register on the 1st of every month" (RPT-14, P3) reuses the same job and file machinery with a delivery step; Tally XML export (RPT-13, P3); a real broker behind `jobs.enqueue` (Celery + Redis) when a partner's volume needs it, with no caller changes (ADR-012's stated exit); S3 storage plus pre-signed download URLs as a settings switch (ADR-013); server-rendered PDF via WeasyPrint for automated sending (ADR-014's Phase 2 note) which would finally make `format=pdf` legal; per-report saved column selections and saved filter sets; direct-to-WhatsApp sharing of a generated file once the WhatsApp Business API adapter exists (NTF-04, P2); incremental/delta exports for accounting-software sync (BI connector, Future).

---

### RPT-09 — Item movement & fast/slow movers (Phase 2)

#### 1. Business Objective
Tell the owner which items earn their shelf space and which are dead money. RPT-06 answers "what do I have"; RPT-09 answers "how fast does it leave, and how long will what I have last". It turns the immutable `inventory_stock_movement` log into a per-item opening → in → out → closing statement for a window, derives a velocity and a days-of-cover figure, and classifies every item as fast, medium, slow or dead so that reordering stops being guesswork and dead stock becomes visible enough to discount. INV-07 is the *single item's* movement history; RPT-09 is the *whole catalogue's* movement report. Measures: closing quantity in the report equals `inventory_item_stock.on_hand` for every item when the window ends today (CI test); p95 ≤ 1.2 s for 5,000 items over a 90-day window; ≥ 30 % of owners with > 100 items open it monthly; dead-stock value falls in cohorts that use it.

#### 2. User Personas
**OW** (primary — buying decisions, clearance decisions), **AC** (secondary — dead-stock provisioning at FY end), **ST** (no access to value columns; quantity view only where `reports.basic.read` and `inventory.stock.read` are held).

#### 3. User Stories
1. `US-RPT09-1` As an owner I want to see, for a period, how much of each item came in, went out and remains so that I can check my stock story adds up.
2. `US-RPT09-2` As an owner I want the items that sell fastest so that I never run out of them.
3. `US-RPT09-3` As an owner I want the items that have not sold at all so that I can discount or stop buying them.
4. `US-RPT09-4` As an owner I want to know how many days my current stock will last at the current rate so that I time my purchases.
5. `US-RPT09-5` As an accountant I want the dead-stock list with its value as of the year end so that I can consider a write-down.
6. `US-RPT09-6` As an owner I want to compare two periods (this month vs last month) so that I can see what is picking up and what is fading.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/item-movement` with params `date_from`, `date_to` (default last 30 days), `category_id`, `location_id`, `q`, `class` (`fast|medium|slow|dead|new`, comma list), `movement_type` (restrict the in/out breakdown), `min_sold_qty`, `compare` (`none|previous_period|same_period_last_year`, default `none`), `ordering` (`-sold_qty` default, `-sold_value`, `velocity`, `days_of_cover`, `-days_since_last_sale`, `name`), `page`, `page_size`, `format`.
2. `FR-2` Row shape: `{ item: { id, name, sku, category, unit }, opening_qty, in_qty: { purchase, sale_return, adjust_in, transfer_in, opening }, out_qty: { sale, purchase_return, adjust_out, transfer_out }, closing_qty, sold_qty, sold_value, cogs_value, margin_value, margin_pct, velocity_per_day, days_of_cover, days_since_last_sale, first_movement_date, classification, compare: { sold_qty, sold_value, delta_qty_pct } | null }`.
3. `FR-3` `meta`: `{ date_from, date_to, window_days, totals: { item_count, sold_qty, sold_value, cogs_value, margin_value, closing_value, dead_count, dead_value, fast_count, slow_count }, thresholds: { fast_percentile, slow_percentile, dead_window_days, new_item_days }, page, page_size, total, total_pages, cost_visible }`.
4. `FR-4` Classification is computed over the **filtered** set, in this order (first match wins): `new` when `first_movement_date > date_to − new_item_days` (default 30) — a new item cannot be slow; `dead` when `sold_qty = 0` and `closing_qty > 0`; `fast` when `sold_qty` is at or above the `fast_percentile` (default 80) of the non-new, non-dead rows; `slow` when at or below `slow_percentile` (default 20); otherwise `medium`. Percentiles are computed with `PERCENTILE_CONT` over `sold_qty`; thresholds come from the tenant settings `reports.velocity_fast_percentile`, `reports.velocity_slow_percentile`, `reports.dead_window_days`, `reports.new_item_days`.
5. `FR-5` `velocity_per_day = sold_qty / window_days` (3 decimals). `days_of_cover = closing_qty / velocity_per_day` rounded to 0 decimals, `null` when `velocity_per_day = 0`, and capped for display at 999 with "999+".
6. `FR-6` `days_since_last_sale = date_to − MAX(movement_date)` over `sale_out` movements for the item at any date (not only inside the window), `null` when the item has never sold.
7. `FR-7` A **Dead stock** tab pins `class=dead`, orders by `-closing_value`, and adds the row action **Discount** (opens INV-01's price field) and **Adjust** (INV-06, reason `write_off`). Its tile shows `dead_count` and `dead_value` — the headline number of the report.
8. `FR-8` `compare` adds a second aggregate over the shifted window and returns `delta_qty_pct = ROUND((sold_qty − prev_sold_qty) / NULLIF(prev_sold_qty, 0) × 100, 1)`, `null` when the previous period had no sales (rendered as "new" rather than "∞").
9. `FR-9` Page `app/(app)/reports/item-movement/page.tsx` → `<ItemMovementPageContent/>` with `UbTabs` All · Fast · Slow · Dead (counts from `meta.totals`), a `UbDateRangePicker` with presets (Last 30 days · Last 90 days · This month · Last month · This FY), a compare toggle, filters and Export.
10. `FR-10` Row click opens a `UbDrawer` with the item's movement timeline for the window — the INV-07 component `ItemMovementTimeline` reused unchanged — plus a small sold-quantity sparkline by week (`UbSparkline`).
11. `FR-11` Value columns (`sold_value`, `cogs_value`, `margin_*`, `closing_value`, `dead_value`) follow RPT-06 FR-8: omitted, not zeroed, without `reports.financial.read`, with `meta.cost_visible = false`.
12. `FR-12` Services and non-stocked items are excluded (they have no movements); the footer says so, as in RPT-06 FR-11.

#### 5. Non-Functional Requirements
p95 ≤ 1.2 s for 5,000 items × 90 days (≈ 60k movements in range), ≤ 3 s with `compare` (two windows); > 20,000 items → async export only. Page size 25 (max 100). Mobile card mode: item name, a compact in/out/closing triplet, the classification badge and days of cover as the metric. Desktop: grouped column headers ("In", "Out", "Performance"). Numeric columns `ds-num`. i18n `reports.item_movement.*`. Classification badges carry text, never colour alone. `aria-label` on each badge ("Fast mover: sold 240 in 30 days").

#### 6. User Flow
Reports → Item movement → Last 30 days → Fast tab → top 12 items → note the ones with days of cover under 7 → tap one → drawer → Buy (PUR-01).
Alternate A (dead stock): Dead tab → 23 items worth ₹41,200 → sort by value → Discount the top three (INV-01) or Adjust as write-off (INV-06).
Alternate B (trend): compare = previous period → the delta column shows −62 % on an item → drawer sparkline confirms the fall → decide not to reorder.
Alternate C (FY-end): AC sets the range to the financial year, exports the Dead tab as XLSX for the provisioning note.

#### 7. UI Requirements
`ReportPageShell` (title "Item movement" / "आइटम की आवाजाही"; description "What moved, how fast, and what is not moving"). Controls: `UbTabs`, `UbDateRangePicker`, `MLSelect` compare, `UbCombobox` category, `UbSearchInput`, `MLSelect` ordering, Export menu (RPT-08). Tiles (`UbStatCard` × 4): Sold quantity (baseline "in {window_days} days"), Sold value, Dead stock (tone warning; value + count), Fast movers (count, baseline "top {100−fast_percentile} %"). `ReportTable` columns: Item (sticky) · Opening · In · Out · Closing · Sold · Sold value · Velocity/day · Days of cover · Last sold · Class (`UbStatusBadge`) · Δ vs previous (when comparing). Column group headers "In" and "Out" expand on click into their sub-columns (purchase / return / adjust). `UbHelpHint` on Days of cover: "At the current selling rate, how long today's stock will last". Feature-local components: `VelocityBadge`, `MovementSplitCell`, `DeadStockTile`; reused: `ItemMovementTimeline` (INV-07), `UbSparkline`. Redux: `itemMovementSlice`, thunk `fetchItemMovement(params)` → `reportsService.getReport('item-movement', params)`.

#### 8. UX Requirements
Copy: "Fast mover" = "तेज़ बिकने वाला", "Slow mover" = "धीमा", "Dead stock" = "नहीं बिक रहा", "Days of cover" = "कितने दिन चलेगा", "Velocity" = "बिक्री की रफ़्तार", "Last sold" = "आखिरी बिक्री". Tones: fast = success, medium = neutral (no badge), slow = warning, dead = error, new = info. The dead-stock tile is the only alarming element on the page and it names the money ("₹41,200 not moving") rather than the count alone. Percentile thresholds are stated on screen ("Fast = top 20 % by quantity sold in this period") so nobody has to guess what the badge means; changing them is a settings link for the owner. No destructive actions on this screen; Discount and Adjust hand off to features that carry their own confirmations.

#### 9. States
Initial (last 30 days, All tab) · Loading (4 tiles + 10 rows skeleton) · Ready · Comparing (extra column, longer skeleton) · Empty first-use ("No stock movements yet") · Empty filtered · Empty healthy on Dead tab ("Everything is moving", success tone) · Error · Partial (values hidden) · Processing/Completed/Failed (export, RPT-08).

#### 10. Validation Rules
| Field | Rule | Error (400 `validation_error`) |
|---|---|---|
| `date_to − date_from` | ≥ 1 day and ≤ 731 days | "Choose a period between 1 day and 2 years" |
| `date_to` | ≤ today | "Period cannot be in the future" |
| `class` | ∈ `fast,medium,slow,dead,new` | "Unknown class: {value}" |
| `compare` | ∈ `none,previous_period,same_period_last_year` | "Unknown comparison" |
| `ordering` | whitelist per FR-1 | "Cannot sort by this column" |
| `min_sold_qty` | ≥ 0 | "Minimum sold quantity cannot be negative" |
| settings percentiles | `0 < slow < fast < 100` | 400 on the settings write (PLT-05), not here |
| value columns | `reports.financial.read` | omitted per FR-11, never 403 for the whole report |

#### 11. Business Rules
1. `BR-1` **Everything is derived from `inventory_stock_movement`, never from documents.** A sale that was voided produced a `reversal` movement, so the window's arithmetic already nets it; no `status` filter on documents is applied or needed. This is why the report and the stock cache can never disagree.
2. `BR-2` Normative aggregation:
```sql
WITH w AS (SELECT :date_from::date AS df, :date_to::date AS dt),
 base AS (SELECT item_id, movement_type, qty, unit_cost, movement_date
            FROM inventory_stock_movement, w
           WHERE tenant_id = :t AND location_id = :loc AND movement_date <= w.dt),
 opening AS (SELECT item_id, SUM(qty) AS opening_qty
               FROM base, w WHERE movement_date < w.df GROUP BY item_id),
 win AS (
   SELECT b.item_id,
          SUM(b.qty) FILTER (WHERE b.qty > 0)                                   AS in_qty,
          SUM(-b.qty) FILTER (WHERE b.qty < 0)                                  AS out_qty,
          SUM(-b.qty) FILTER (WHERE b.movement_type = 'sale_out')               AS gross_sold_qty,
          SUM(b.qty)  FILTER (WHERE b.movement_type = 'sale_return_in')         AS returned_qty,
          SUM(-b.qty * COALESCE(b.unit_cost,0)) FILTER (WHERE b.movement_type = 'sale_out') AS cogs_value,
          MAX(b.movement_date) FILTER (WHERE b.movement_type = 'sale_out')      AS last_sale_date
     FROM base b, w WHERE b.movement_date BETWEEN w.df AND w.dt GROUP BY b.item_id)
SELECT i.id, COALESCE(o.opening_qty,0) AS opening_qty,
       COALESCE(w2.in_qty,0) AS in_qty, COALESCE(w2.out_qty,0) AS out_qty,
       COALESCE(o.opening_qty,0) + COALESCE(w2.in_qty,0) - COALESCE(w2.out_qty,0) AS closing_qty,
       COALESCE(w2.gross_sold_qty,0) - COALESCE(w2.returned_qty,0) AS sold_qty,
       COALESCE(w2.cogs_value,0) AS cogs_value, w2.last_sale_date
  FROM inventory_item i
  LEFT JOIN opening o ON o.item_id = i.id
  LEFT JOIN win w2    ON w2.item_id = i.id
 WHERE i.tenant_id = :t AND i.deleted_at IS NULL AND i.track_stock AND i.item_type = 'goods';
```
   The `in_qty`/`out_qty` breakdown by `movement_type` is the same statement with one `FILTER` per type.
3. `BR-3` **Identity that must always hold:** `opening_qty + Σ in_qty − Σ out_qty = closing_qty`, and when `date_to = today`, `closing_qty = inventory_item_stock.on_hand`. Both are CI assertions (T-RPT09-1). A failure means the cache has drifted and `manage.py recalc_stock` is the fix.
4. `BR-4` `sold_qty` is **net of sales returns** (`sale_out` minus `sale_return_in`) so velocity is not inflated by goods that came back. `out_qty` keeps them separate so the movement statement still balances.
5. `BR-5` `sold_value` = Σ `sales_document_line.taxable_value` for `sale_out`-posting documents in the window, net of credit-note lines — it is read from the sales side, not from the movement, because a movement has no selling price. It is therefore `null` (and the column blank) for stock that left through an adjustment rather than a sale.
6. `BR-6` `cogs_value` uses the **`unit_cost` snapshotted on the outbound movement**, not today's average cost — the same rule RPT-10 states normatively (RPT-10 BR-2). `margin_value = sold_value − cogs_value`; `margin_pct = ROUND(margin_value / NULLIF(sold_value,0) × 100, 1)`.
7. `BR-7` Rounding: quantities to 3 decimals, money to 2 (half-up), velocity to 3, days of cover to 0, percentages to 1. Totals are sums of the rounded row values, as in RPT-06 BR-4.
8. `BR-8` A window shorter than 7 days produces a velocity that is statistically meaningless; the UI shows an info caption "Short period — velocity and days of cover may mislead" and the classification is still computed (the owner asked for it) but `fast`/`slow` badges are suppressed below 7 days.
9. `BR-9` Items archived during the window are included with their movements (they had activity) and carry the Archived badge; items archived before `date_from` with no movements in the window are excluded.
10. `BR-10` Negative `closing_qty` (allowed when `inventory.allow_negative_stock`) is shown as-is and forces `days_of_cover = 0` with the "Out" tone, never a negative cover figure.
11. `BR-11` **Worked example.** Window 01/09/2026–30/09/2026 (30 days), item Basmati Rice 5kg, unit NOS. Opening 20. In: purchase 30. Out: sales 45, sale return 3 (an inbound of 3). Then `opening_qty = 20`, `in_qty = 33` (30 purchase + 3 return), `out_qty = 45`, `closing_qty = 8`, `sold_qty = 45 − 3 = 42`, `velocity_per_day = 42 / 30 = 1.400`, `days_of_cover = ROUND(8 / 1.400) = 6`. With `sold_value = ₹18,900.00` and `cogs_value = 42 × 332.0000 = ₹13,944.00`, `margin_value = ₹4,956.00` and `margin_pct = 26.2 %`. If this item's `sold_qty` sits above the 80th percentile of the catalogue it is badged **Fast** — and with 6 days of cover it is the first line of the next purchase order.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View quantity columns and classification | `inventory.stock.read` + `reports.basic.read` | ✅ | ✅ | ✅ | ✅ |
| Value, COGS and margin columns and tiles | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Compare periods | `reports.basic.read` | ✅ | ✅ | ✅ | ✅ |
| Export | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Row action Discount (edit price) | `inventory.item.write` | ✅ | ✅ | ❌ | ❌ |
| Row action Adjust / write-off | `inventory.stock.adjust` | ✅ | ✅ | ⚙ override | ❌ |
| Change velocity thresholds | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |

Module gate: `inventory` must be enabled; Phase-2 entitlement gate on the plan (`reports.item_movement` feature key) hides the nav entry on plans that do not include it.

#### 13. Edge Cases
1. `EC-1` Item with opening stock only and no movements in the window → `sold_qty = 0`, `closing_qty = opening_qty` → classified `dead` (correctly — it has stock and no sales).
2. `EC-2` Item created inside the window → `new`; it never shows as slow or dead even with zero sales, so a genuinely new line is not condemned in its first month.
3. `EC-3` Item with sales but zero stock → `days_of_cover = 0`, classification still `fast` if it sold enough; the row is the argument for reordering it.
4. `EC-4` All items sold the same quantity → every percentile collapses to the same value; the classifier then marks all of them `medium` rather than arbitrarily splitting them, and the tile baselines say "not enough variation to rank".
5. `EC-5` A sale voided inside the window → the `reversal` movement nets both `out_qty` and `sold_qty`; a sale voided *after* `date_to` does not affect a closed window's report (the reversal carries a later `movement_date`), which is correct for historical comparison.
6. `EC-6` A credit note issued with `restock = false` → no inbound movement, so `sold_qty` is not reduced; `sold_value` **is** reduced (BR-5 reads the sales side). The column tooltip states this asymmetry, which is real: the goods did not come back but the revenue did.
7. `EC-7` Window spanning an item's unit change (P2 secondary units) → quantities are always in the primary unit; the report does not convert and says so.
8. `EC-8` `compare=same_period_last_year` when the tenant is 4 months old → the previous window has no data; `delta_qty_pct` is `null` and the cell renders "—" with the tooltip "No data for that period".
9. `EC-9` 20,000 items × 731 days → the aggregate exceeds the interactive budget; the endpoint returns 202 with an export job (RPT-06 EC-4's rule, applied here to the row count rather than the item count).
10. `EC-10` Items with movements only at a non-default location while `location_id` filters to MAIN (P2 multi-location) → excluded from the window arithmetic; the footer names the location being reported.
11. `EC-11` `unit_cost` missing on old `sale_out` movements (data created before the snapshot column was populated) → `cogs_value` for those rows is 0 and the row carries a `data_gap` flag; the tile baseline says "{n} items have incomplete cost history".
12. `EC-12` Staff opens the Dead tab → the tab exists (dead is a quantity-derived class) but the dead-stock tile shows the count only, never the value.

#### 14. API Requirements
`GET /reports/item-movement?date_from&date_to&category_id&location_id&q&class&movement_type&min_sold_qty&compare&ordering&page&page_size&format=json|csv|xlsx` → `200 { "data": rows[], "meta": {…} }` per FR-2/FR-3, or `202 { "export_id" }` above the threshold (RPT-08). This endpoint is **new** — §22.11's table lists no item-movement report — and is added there as **CR-RPT-6**, together with the four `reports.velocity_*`/`dead_window_days`/`new_item_days` settings keys. The existing `GET /items/{id}/movements` (INV-07) remains the per-item cursor feed and is unchanged. Errors: 400 `validation_error`, 403 `permission_denied`, 403 `module_disabled`, 429. `Cache-Control: private, max-age=120` for a closed window, `no-store` when `date_to = today`. CSV header (exact): `item_name,sku,category,unit,opening_qty,in_purchase,in_sale_return,in_adjust,out_sale,out_purchase_return,out_adjust,closing_qty,sold_qty,sold_value,cogs_value,margin_value,margin_pct,velocity_per_day,days_of_cover,days_since_last_sale,classification` plus `compare_sold_qty,delta_qty_pct` when comparing, and a TOTAL row over the numeric columns. Frontend: `reportsService.getReport('item-movement', params)`, `itemMovementSlice`, `fetchItemMovement`.

#### 15. Database Impact
Reads `inventory_stock_movement` (`IX(tenant_id, item_id, location_id, movement_date, sequence_no)` — the window predicate is a range scan on the trailing key, the `< date_from` opening aggregate reuses the same index), `inventory_item`, `inventory_item_stock` (for the `closing_qty` identity check), `inventory_category`, `inventory_unit`, and `sales_document_line` joined through `sales_document` for `sold_value` (`IX(tenant_id, kind, status, document_date DESC)`). Writes: none, beyond RPT-08's export rows. New index recommended for the movement-type breakdown at scale: `CREATE INDEX CONCURRENTLY inventory_stock_movement_tenant_type_date_idx ON inventory_stock_movement (tenant_id, movement_type, movement_date)` in an `atomic = False` migration (§21.8). No schema change; the report is a pure read over an append-only table, which is exactly what §21.9 designed for.

#### 16. Audit Requirements
Views are not audited. Exports are, via RPT-08 (`report.exported`, `metadata.report = 'item-movement'`, with `class` and the window in `params`). Actions launched from a row are audited by their own features: `item.updated` (price change from Discount), `stock_adjustment.posted` with `metadata.reason = 'write_off'` and `metadata.source = 'dead_stock_report'`.

#### 17. Notifications
None raised directly. A Phase-2 opt-in setting `reports.dead_stock_digest` (`off|monthly`) makes the scheduled command `reports.dead_stock_digest` (1st of the month, 08:00 IST, ADR-012 runner) write a `notifications_notification` `type='dead_stock'`, title "₹{value} of stock has not moved in 90 days", body "{n} items · tap to review", `data.route = '/reports/item-movement?class=dead'`, addressed to members with `reports.financial.read`. Off by default — an unasked-for monthly scolding is not a feature.

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'item-movement', tab, window_days, compare, filters[], row_count, cost_visible }`, `ub.reports.velocity_tab_changed { from, to }`, `ub.reports.velocity_row_drilldown { classification }`, `ub.reports.dead_stock_action { action: 'discount'|'adjust'|'ignore', item_value }`, `ub.reports.velocity_compare_toggled { compare }`, `ub.reports.velocity_thresholds_changed { fast_percentile, slow_percentile }`, `ub.reports.exported { report: 'item-movement', format, rows, async }`.

#### 19. Security
Tenant scope in the base `WHERE` of every CTE. Selling prices, costs and margins are the most commercially sensitive numbers in the product and are suppressed at serializer, CSV-header and XLSX-sheet level without `reports.financial.read` (RPT-08 BR-2), so a staff member cannot infer margin from a velocity report. `q` uses the parameterised trigram filter; `ordering`, `class` and `movement_type` are whitelisted; `category_id`/`location_id` resolve inside the tenant scope (cross-tenant → 404). The dead-stock digest notification carries a value figure and is therefore only written for members holding `reports.financial.read`. Export files follow RPT-08's storage, escaping and expiry rules.

#### 20. Performance
Three statements: the BR-2 window/opening aggregate, the `sold_value` aggregate over sales lines, and the percentile pass (`PERCENTILE_CONT` over the already-materialised window CTE, so no extra table access). With `compare`, the first two run twice against the shifted window. The 90-day/5,000-item fixture measures ~700 ms; `EXPLAIN` is asserted in CI to show index range scans on `inventory_stock_movement` and no sequential scan. Pagination is applied after classification (the percentile must see the whole filtered set), so the aggregate is materialised once per request and paged in Python — bounded by the 20,000-row async threshold (EC-9). Closed windows are cached 120 s per `(tenant, permissions version, params hash)`; windows ending today are not cached, because a sale made a minute ago should move the number.

#### 21. Testing
- `T-RPT09-1` unit: BR-3 identity — for 200 randomised movement sequences, `opening + in − out = closing`, and with `date_to = today`, `closing_qty = inventory_item_stock.on_hand` for every item.
- `T-RPT09-2` unit: BR-11 worked example to the last decimal, including the sale-return netting in `sold_qty` but not in `out_qty`.
- `T-RPT09-3` unit: classification truth table across `new`, `dead`, percentile boundaries (exactly at P80 → fast; exactly at P20 → slow), and the flat-distribution case (EC-4).
- `T-RPT09-4` unit: `days_of_cover` null when velocity is 0, 0 when closing is negative, 999+ capping.
- `T-RPT09-5` unit: `cogs_value` uses the movement's snapshotted `unit_cost` — change `inventory_item_stock.avg_cost` after the sale and assert the report does not move (BR-6).
- `T-RPT09-6` unit: voided sale inside the window nets out (EC-5); voided after the window does not alter it.
- `T-RPT09-7` unit: credit note with `restock=false` reduces `sold_value` but not `sold_qty` (EC-6).
- `T-RPT09-8` API: `compare=previous_period` shifts the window by exactly `window_days`; `same_period_last_year` shifts by one year; `delta_qty_pct` null when the previous window is empty.
- `T-RPT09-9` API: staff response omits every value column and sets `cost_visible=false`; the Dead tile carries a count but no value (EC-12).
- `T-RPT09-10` API: range > 731 days → 400 with the exact message; `date_to` in the future → 400; unknown `class` → 400.
- `T-RPT09-11` API: CSV header exact including the compare columns only when comparing; TOTAL row sums match.
- `T-RPT09-12` component: tabs carry counts; badges render text with colour; the short-window caption appears below 7 days and suppresses fast/slow badges (BR-8); the drawer reuses `ItemMovementTimeline`.
- `T-RPT09-13` E2E: sell 42 units of an item over a month, return 3, then open the report — assert velocity 1.400, cover 6 and the Fast badge; discount it from the Dead tab of a different item and see the price change in INV-01.
- `T-RPT09-14` perf: 5,000 items × 90 days ≤ 1.2 s; with compare ≤ 3 s; `EXPLAIN` shows no sequential scan.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given the BR-11 movements for September, when I open Item movement for 01/09–30/09, then the row shows opening 20, in 33, out 45 and closing 8, and closing equals the item's current on-hand.
- `AC-2` (US-2) Given the item sold 42 units, the most of any item, when I open the Fast tab, then it appears with the Fast badge, velocity 1.400 per day and 6 days of cover.
- `AC-3` (US-3) Given 23 items with stock and zero sales in the window, when I open the Dead tab, then 23 rows appear ordered by value, the tile reads "₹41,200 not moving · 23 items", and each row offers Discount and Adjust.
- `AC-4` (US-4) Given 8 units remain at 1.400 per day, when I look at the row, then Days of cover reads 6 and the help hint explains it is at the current selling rate.
- `AC-5` (US-5) Given the accountant sets the range to 01/04/2026–31/03/2027 and opens the Dead tab, when they export XLSX, then the file lists the dead items with their closing quantity and value and a TOTAL row.
- `AC-6` (US-6) Given the item sold 42 units this month and 110 last month, when I turn on compare with the previous period, then the delta column reads −61.8 % and the drawer sparkline shows the fall by week.

#### 23. Dependencies
INV-01 (items, prices), INV-04 (opening stock), INV-06 (adjustments, write-off reason), INV-07 (`ItemMovementTimeline`, per-item movements), SAL-02/SAL-04 (the `sale_out`/`sale_return_in` movements and their `unit_cost` snapshots), PUR-01 (`purchase_in`), RPT-06 (stock cache and the valuation vocabulary), RPT-08 (export), RPT-10 (shares the COGS rule), PLT-05 (settings for the four thresholds), NTF-01 (optional digest), scheduler command `reports.dead_stock_digest`, CR-RPT-6 (new endpoint and settings keys), Phase-2 plan entitlement `reports.item_movement`.

#### 24. Future Enhancements
ABC/Pareto classification by value contribution alongside the velocity classes; seasonality-aware reorder suggestion (moving average with a trend term) feeding PUR-02 purchase orders directly; stock-ageing buckets by lot age (0–30/31–60/61–90/90+ days on shelf) once batches land (INV-13, P3); item-movement by location and inter-location transfer analysis (INV-11, P2); category and supplier roll-ups; a "never sold since added" cohort separate from `dead`; margin-per-shelf-day ranking once RPT-10 ships; export straight into a purchase order (PUR-02) for every item below its days-of-cover target.

---

### RPT-10 — Profit summary (Phase 2)

#### 1. Business Objective
Answer the question every shopkeeper asks and almost no khata app answers: **did I actually make money this month?** Revenue alone is vanity; RPT-10 subtracts the cost of what was sold — taken from the weighted-average cost snapshotted on each outbound stock movement — and then subtracts recorded business expenses, to produce a gross profit, a net profit and a margin percentage, sliced by period, category, item or party. It is deliberately *not* a statutory profit-and-loss statement (§11 says so on the screen), but it is an honest, reconcilable operating figure built only from data the tenant already entered. Measures: gross profit in the report equals Σ (line revenue − line COGS) over the same documents to the paisa (CI test); COGS equals Σ of the `unit_cost` snapshots on `sale_out` movements for the period (CI test); p95 ≤ 1 s for a month, ≤ 2.5 s for a year; ≥ 50 % of Phase-2 owners with inventory open it within a month of launch.

#### 2. User Personas
**OW** (primary — is the business working), **AC** (secondary — management figures, not the filed accounts), **ST** (no access whatsoever: the entire report is behind `reports.financial.read`).

#### 3. User Stories
1. `US-RPT10-1` As an owner I want to see sales, cost of goods sold and gross profit for a month so that I know my real trading margin.
2. `US-RPT10-2` As an owner I want expenses subtracted so that I see what is left after rent, salaries and electricity.
3. `US-RPT10-3` As an owner I want a month-by-month trend so that I can see whether things are improving.
4. `US-RPT10-4` As an owner I want profit by category and by item so that I know what actually earns and what only turns over.
5. `US-RPT10-5` As an owner I want profit by party so that I know which customers are worth the discount I give them.
6. `US-RPT10-6` As an accountant I want the method written down — which costs, which dates, what is excluded — so that I can reconcile it with the books and explain the difference.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/profit-summary` with params `date_from`, `date_to` (default current month), `group_by` (`none|day|week|month|quarter|fy`, default `month`), `breakdown` (`none|category|item|party`, default `none`), `category_id`, `party_id`, `item_id`, `include_expenses` (default `true`), `expense_allocation` (`period|none`, default `period`), `ordering`, `page`, `page_size`, `format`.
2. `FR-2` Response has two parts. `data.periods[]` — one row per `group_by` bucket: `{ period_label, period_start, period_end, revenue, cogs, gross_profit, gross_margin_pct, expenses, net_profit, net_margin_pct, document_count, revenue_without_cost, unknown_cost_flag }`. `data.breakdown[]` — present when `breakdown ≠ none`, one row per category / item / party over the **whole range**: `{ key: { id, name }, revenue, cogs, gross_profit, gross_margin_pct, qty_sold, share_of_profit_pct }`.
3. `FR-3` `meta`: `{ date_from, date_to, group_by, breakdown, totals: { revenue, cogs, gross_profit, gross_margin_pct, expenses, net_profit, net_margin_pct, document_count, revenue_without_cost }, method: { cogs: 'weighted_average_at_sale', revenue: 'taxable_value_net_of_returns', expenses: 'recorded_cash_and_credit' }, caveats: [ … ], page, page_size, total, total_pages }`.
4. `FR-4` The `caveats[]` array is rendered verbatim on the screen and in the export, and always contains at least: "Tax is excluded from both sales and cost", "Cost is the average cost at the time of sale", "Items without a purchase cost contribute ₹0 cost", "Services and free-text lines have no cost", "This is an operating figure, not a statutory profit-and-loss statement". A caveat is appended dynamically when `revenue_without_cost > 0` naming the amount.
5. `FR-5` A **profit trend** chart (`MLChart*` line/bar combo via ml-uikit, tokens `--viz-1` revenue, `--viz-2` gross profit, `--viz-4` expenses) sits above the table when `group_by ≠ none`, with the net-profit line plotted on the same axis and a zero baseline drawn in `--border-strong`.
6. `FR-6` `breakdown=item` rows carry a **Discount-aware margin**: because `taxable_value` is already net of line and document discount (SAL-02 BR-5), the margin shown is the margin actually realised, not the list-price margin. The column header states "after discount".
7. `FR-7` `breakdown=party` attributes expenses to nobody — expenses are a period figure, never allocated per party or item. Party rows therefore show revenue, COGS, gross profit and margin only, and the column set makes that explicit rather than showing an empty net-profit column.
8. `FR-8` `expense_allocation=period` spreads nothing: each bucket carries the expenses whose `expense_date` falls in it. `expense_allocation=none` suppresses expenses entirely and the report shows gross profit only (useful when expenses are not being recorded diligently).
9. `FR-9` Row and bucket click-through: a period row opens a `UbDrawer` listing its contributing documents with per-document revenue, COGS and margin; a breakdown row opens the same list filtered to that category/item/party. Every figure is defensible down to an invoice line.
10. `FR-10` Page `app/(app)/reports/profit/page.tsx` → `<ProfitSummaryPageContent/>`: four tiles, the trend chart, an `MLToggleGroup` for breakdown (None · Category · Item · Party), the period table, the breakdown table, and a permanently visible method/caveats card at the bottom.
11. `FR-11` Export (RPT-08) produces one workbook with sheets `Summary`, `Periods`, `Breakdown` and `Method` — the last sheet carrying the `method` and `caveats` text so a file that leaves the app carries its own disclaimer.
12. `FR-12` When the `inventory` module is disabled the report still works with `cogs = 0` for everything, and the UI switches its headline from "Gross profit" to "Sales less expenses", with a banner explaining that cost of goods needs inventory turned on. This is honest rather than hiding the feature from service businesses, who legitimately have no COGS.

#### 5. Non-Functional Requirements
p95 ≤ 1 s for a month (2,000 invoices, 8,000 lines), ≤ 2.5 s for a financial year; `breakdown=item` over a year is the worst case and is capped by pagination plus the 20,000-row async threshold. All money is `Decimal` server-side; the client never subtracts. Chart renders once with the Koper 640 ms reveal and never animates on filter change. Mobile: tiles 2×2, chart 220 px tall with horizontal scroll by bucket, tables as cards. i18n `reports.profit.*` with full Hindi copy — this is an owner screen, not an accountant screen. Negative profit is announced to screen readers as "loss of ₹4,200", never as a bare minus sign.

#### 6. User Flow
Reports → Profit → current month → tiles: Sales ₹4,86,000 · Cost ₹3,72,400 · Gross profit ₹1,13,600 (23.4 %) · Net profit ₹68,100 → chart shows six months → switch breakdown to Category → "Rice & Atta" earns 41 % of the profit on 28 % of the sales → tap it → drawer lists its invoices.
Alternate A (loss): net profit negative → the tile is error-toned and reads "Loss ₹12,400" with the baseline "expenses ₹1,24,000 in this period" and a link to the cashbook (EXP-03).
Alternate B (missing costs): the caveat strip reads "₹42,000 of sales had no cost recorded — add purchase prices" and links to RPT-06's cost-gap list.
Alternate C (service business): inventory off → banner → the screen shows Sales less expenses only.
Alternate D (accountant): sets the range to the financial year, reads the method card, exports the workbook for the working papers.

#### 7. UI Requirements
`ReportPageShell` (title "Profit" / "मुनाफ़ा"; description "What you earned after cost of goods and expenses"). Controls: `UbDateRangePicker` (presets This month · Last month · This quarter · This FY · Last FY · Custom), `MLSelect` group by, `MLToggleGroup` breakdown, `MLSwitch` "Include expenses", `UbCombobox` category/party/item filter (contextual to the breakdown), Export menu. Tiles (`UbStatCard` × 4): Sales (baseline "{n} bills"), Cost of goods (baseline "average cost at sale"), **Gross profit** (value + margin % as the delta slot, tone success when positive), **Net profit** (tone success/error, baseline "after ₹{expenses} expenses"). Chart: feature-local `ProfitTrendChart` over `MLChart*`. Tables: `ReportTable` for periods (Period · Sales · Cost · Gross profit · Margin % · Expenses · Net profit) with a totals footer, and a second `ReportTable` for the breakdown (Name · Qty sold · Sales · Cost · Gross profit · Margin % · Share of profit % with an inline `MLProgress` bar). Method card: `MLCard` with `ds-body-sm` bullets from `meta.caveats`, always expanded, never a tooltip — a disclaimer that has to be hunted for is not a disclaimer. Feature-local: `ProfitTrendChart`, `MarginCell`, `ProfitMethodCard`, `ProfitDrilldownDrawer`. Redux: `profitReportSlice`, thunk `fetchProfitSummary(params)` → `reportsService.getReport('profit-summary', params)`.

#### 8. UX Requirements
Copy: "Profit" = "मुनाफ़ा", "Sales" = "बिक्री", "Cost of goods" = "माल की लागत", "Gross profit" = "कुल मुनाफ़ा", "Expenses" = "खर्च", "Net profit" = "शुद्ध मुनाफ़ा", "Loss" = "नुकसान", "Margin" = "मार्जिन". Colour: profit uses `--success`, loss uses `--error`, and the word "Loss" always accompanies the colour — the canon's red/green ledger semantics are about receivables, so the label is what disambiguates here. Margin percentage is never shown without its rupee value beside it (Koper: never a naked number). The caveats strip is `--warning` toned only when a dynamic caveat fires (missing costs); otherwise it is neutral, because the standing caveats are information, not a problem. No confirmations, no destructive actions. Empty expense data produces the caption "No expenses recorded in this period — net profit equals gross profit", which teaches the feature rather than showing a zero.

#### 9. States
Initial (current month, group by month) · Loading (tiles + chart skeleton + rows) · Ready · Ready-with-gaps (missing-cost caveat) · Loss (error-toned tiles) · Empty ("No sales in this period") · No-inventory (banner, gross profit hidden) · Expenses off (`expense_allocation=none`) · Error · Processing/Completed/Failed (export).

#### 10. Validation Rules
| Field | Rule | Error (400 `validation_error`) |
|---|---|---|
| `date_to − date_from` | ≥ 0 days and ≤ 1,096 days (3 years) | "Choose a period of up to 3 years" |
| `date_to` | ≤ today | "Period cannot be in the future" |
| `group_by` | ∈ `none,day,week,month,quarter,fy` | "Unknown grouping" |
| `group_by=day` with a range > 92 days | rejected | "Daily grouping is available for up to 3 months" |
| `breakdown` | ∈ `none,category,item,party` | "Unknown breakdown" |
| `expense_allocation` | ∈ `period,none` | "Unknown expense option" |
| `category_id`/`party_id`/`item_id` | exists in tenant | "This {thing} no longer exists" |
| permission | `reports.financial.read` | 403 `permission_denied` "Profit reports are available to owners, admins and accountants" |

#### 11. Business Rules
1. `BR-1` **Revenue** = Σ `sales_document_line.taxable_value` over `sales_document` with `kind IN ('invoice','bill_of_supply')` and `status NOT IN ('draft','void')`, **minus** Σ `taxable_value` of `kind='credit_note'` lines with the same status rule. Tax (`cgst`/`sgst`/`igst`/`cess`) is excluded — it was never the business's money. `round_off` is excluded. Line and document discounts are already netted into `taxable_value` (SAL-02 BR-5), so revenue is what was actually charged. Period membership is by `document_date` (RPT-07 BR-2).
2. `BR-2` **COGS uses the weighted-average cost captured on the stock movement, not the item's current cost.** Normatively:
```sql
SELECT SUM(-m.qty * COALESCE(m.unit_cost, 0)) FILTER (WHERE m.movement_type = 'sale_out')
     - SUM( m.qty * COALESCE(m.unit_cost, 0)) FILTER (WHERE m.movement_type = 'sale_return_in')
  FROM inventory_stock_movement m
 WHERE m.tenant_id = :t
   AND m.movement_date BETWEEN :date_from AND :date_to
   AND m.movement_type IN ('sale_out','sale_return_in');
```
   `inventory_stock_movement.unit_cost` on an outbound row is the running weighted average **at the instant of the sale**, snapshotted by the posting service per §21.3.6 ("snapshotted on outbound (COGS = current avg)"). The report must never join to `inventory_item_stock.avg_cost` or `inventory_item.purchase_price`: a purchase made after the sale changes the average, and using today's average would silently rewrite last month's profit. A CI test asserts exactly this (T-RPT10-3). `sales_document_line.unit_cost_snapshot` carries the same figure at line granularity and is the source for the item/category/party breakdowns, where a per-line join is needed; the two must agree (T-RPT10-4).
3. `BR-3` **Gross profit** = revenue − COGS. `gross_margin_pct = ROUND(gross_profit / NULLIF(revenue, 0) × 100, 1)`; `null` (rendered "—") when revenue is 0.
4. `BR-4` **Expenses** = Σ `expenses_expense.amount` where `status='recorded'` and `expense_date` is in the bucket. `tax_amount` on an expense is excluded when the tenant is `gst_type='regular'` (it is input credit, not cost) and **included** when the tenant is `unregistered` or `composition` (there is no credit to claim, so the tax is a real cost). Expenses of category `Purchases-misc` are included like any other expense; the caveat card warns that recording stock purchases as expenses *and* as purchase bills would double-count, and RPT-10 cannot detect that for the user.
5. `BR-5` **Net profit** = gross profit − expenses. `net_margin_pct = ROUND(net_profit / NULLIF(revenue, 0) × 100, 1)`.
6. `BR-6` **Lines without a cost** — services (`item_type='service'`), free-text lines (`item_id IS NULL`), non-stocked goods (`track_stock=false`) and goods whose inbound movements carried no cost — contribute revenue with `cogs = 0`. Their revenue is summed into `revenue_without_cost` and surfaced as a caveat, so a 100 % margin is never presented as a fact without its explanation.
7. `BR-7` **Perpetual, not periodic.** DigiKhaato computes COGS transaction by transaction from the movement log, because the log carries cost. It does **not** use the periodic formula (opening stock + purchases − closing stock), which would give a different answer whenever stock is adjusted, damaged or miscounted. The method card names the choice and the difference, so an accountant reconciling to a periodic P&L knows where to look: adjustments, write-offs and negative stock are the reconciling items.
8. `BR-8` **Rounding** is half-up to 2 decimals at every stage; percentages to 1 decimal. Bucket values are summed from rounded line values, and `meta.totals` equals Σ of the bucket rows exactly (asserted), so the footer can never disagree with the column.
9. `BR-9` **Exclusions, stated once.** Not included: depreciation, owner's drawings, loans and interest, opening/closing stock adjustments, salaries not recorded as expenses, accruals and prepayments, bad-debt write-offs (LED `write_off` entries are a ledger event, not an expense), tax liabilities. Each appears in `caveats[]` only when it could plausibly apply (for example, a `write_off` ledger entry in the period appends "₹{x} was written off in the ledger and is not counted as an expense here").
10. `BR-10` **Void and reversal handling.** A voided invoice's reversing stock movement carries a later `movement_date` (the void date), so profit is corrected in the period of the void, not retrospectively. This is deliberate and matches the ledger philosophy (canon §0.11); the method card says "corrections appear on the date they were made".
11. `BR-11` **Worked example.** September 2026. Sales: invoice A taxable ₹1,688.57 (2 × Basmati Rice 5kg), invoice B taxable ₹855.00 (walk-in, 1 × Rice + sundries), credit note C taxable ₹443.63 against A. Revenue = 1,688.57 + 855.00 − 443.63 = **₹2,099.94**. Stock movements in the period: `sale_out` 2 × 332.0000 and 1 × 332.0000 (the weighted average at the time of each sale), `sale_return_in` 1 × 332.0000 from the credit note. COGS = (2 + 1) × 332.0000 − 1 × 332.0000 = **₹664.00**. Gross profit = 2,099.94 − 664.00 = **₹1,435.94**, margin **68.4 %**. Expenses recorded in September: shop rent ₹8,000.00, electricity ₹1,240.00 → ₹9,240.00. Net profit = 1,435.94 − 9,240.00 = **−₹7,804.06**, shown as "Loss ₹7,804.06". Note that a later purchase raising the average cost to ₹348.0000 does **not** change any of these figures — that is the whole point of BR-2.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View the report at all | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Breakdown by item/category | `reports.financial.read` + `inventory.item.read` | ✅ | ✅ | ❌ | ✅ |
| Breakdown by party | `reports.financial.read` + `parties.party.read` | ✅ | ✅ | ❌ | ✅ |
| Drill-down into documents | + `sales.invoice.read` | ✅ | ✅ | ❌ | ✅ |
| Export | `reports.export` | ✅ | ✅ | ❌ | ✅ |

There is no reduced view for staff. Margin is the single most sensitive number a small business holds, and a partial payload would leak it by subtraction; the route 403s and the nav entry is not rendered. Phase-2 plan entitlement `reports.profit` gates the feature per plan.

#### 13. Edge Cases
1. `EC-1` Item sold before any costed purchase (opening stock entered as quantity only) → `unit_cost = 0` on the movement → COGS 0, revenue counted, `revenue_without_cost` increases, caveat fires. The report is not wrong; it is incomplete, and it says so.
2. `EC-2` Negative stock sale (`allow_negative_stock`) → the movement's `unit_cost` is the average at that moment, which may be 0 if the item has never been purchased; treated as EC-1.
3. `EC-3` Credit note with `restock=false` → no `sale_return_in` movement, so COGS is **not** reduced while revenue is; the margin correctly falls, because the goods were lost. A caveat fires naming the amount.
4. `EC-4` Purchase return (`purchase_return_out`) in the period → not part of COGS; it adjusts inventory value, not the cost of goods already sold. The method card says so.
5. `EC-5` Stock adjustment for damage in the period → not an expense and not COGS; it reduces stock value only. A caveat fires: "₹{x} of stock was written off in adjustments and is not counted here" with a link to INV-07.
6. `EC-6` Expense dated in the period but for a different period (annual insurance) → counted in full in its `expense_date` bucket; no accrual logic (BR-9).
7. `EC-7` `group_by=fy` on a range spanning two financial years → two rows using `platform_tenant.fy_start_month`.
8. `EC-8` `breakdown=party` with walk-in sales → a single synthetic row "Walk-in" aggregating all `party_id IS NULL` documents.
9. `EC-9` An item sold in a period, then archived → still appears in the item breakdown for that period (documents are history).
10. `EC-10` Revenue 0 and COGS > 0 (goods left only through adjustments) → `gross_margin_pct` null, gross profit negative; the tile reads "Loss" and the caveat names adjustments.
11. `EC-11` Tenant switched from `unregistered` to `regular` mid-range → BR-4's expense-tax rule is evaluated per expense using the tenant's `gst_type` **at the time of the report run**, not historically; this is a stated approximation in `caveats[]` because expense rows do not snapshot the scheme.
12. `EC-12` A document dated in the range but whose stock movements were posted at a different date (backdated invoice issued today) → revenue lands by `document_date`, COGS by `movement_date`. When these differ, the bucket's revenue and COGS can mismatch. The selector therefore computes COGS **by `document_date` of the source document** for the period tables (joining the movement to its `source_id`), and uses `movement_date` only in the reconciliation footnote. This is BR-2's SQL with `JOIN sales_document d ON d.id = m.source_id AND d.document_date BETWEEN …` replacing the date predicate — a single, documented choice rather than an accident.
13. `EC-13` 3-year range with `breakdown=item` over 5,000 items → 202 async export (RPT-08).

#### 14. API Requirements
`GET /reports/profit-summary?date_from&date_to&group_by&breakdown&category_id&party_id&item_id&include_expenses&expense_allocation&ordering&page&page_size&format=json|csv|xlsx` → `200 { "data": { "periods": [...], "breakdown": [...] }, "meta": {…} }` per FR-2/FR-3, or `202 { "export_id" }`. This endpoint is **new** — §22.11 does not list it — and is added as **CR-RPT-7** together with the Phase-2 entitlement key `reports.profit`. Errors: 400 `validation_error`, 403 `permission_denied`, 429. `Cache-Control: private, max-age=120` for closed ranges, `no-store` when the range includes today. Drill-down reuses `GET /reports/sales-register?date_from&date_to&party_id&level=line` plus the new `item_id`/`category_id` filters recorded in CR-RPT-2. CSV header (periods sheet, exact): `period,period_start,period_end,document_count,revenue,cogs,gross_profit,gross_margin_pct,expenses,net_profit,net_margin_pct` with a TOTAL row; breakdown sheet: `name,qty_sold,revenue,cogs,gross_profit,gross_margin_pct,share_of_profit_pct`; method sheet: `key,value` rows carrying `method` and each caveat. Frontend: `reportsService.getReport('profit-summary', params)`, `profitReportSlice`, `fetchProfitSummary`.

#### 15. Database Impact
Reads `sales_document` + `sales_document_line` (`IX(tenant_id, kind, status, document_date DESC)`, plus `unit_cost_snapshot` for the breakdowns), `inventory_stock_movement` (`IX(tenant_id, source_type, source_id)` for the EC-12 join, `IX(tenant_id, movement_date)` for the reconciliation figure), `expenses_expense` (`IX(tenant_id, expense_date DESC)`, `IX(tenant_id, category_id)`), `inventory_item`, `inventory_category`, `parties_party`, `platform_tenant` (`fy_start_month`, `gst_type`), `ledger_entry` (only to detect `entry_type='write_off'` in the period for a caveat). Writes: none beyond RPT-08's export rows. New index recommended: `CREATE INDEX CONCURRENTLY sales_document_line_item_doc_idx ON sales_document_line (item_id, document_id) INCLUDE (taxable_value, unit_cost_snapshot, qty)` for the item and category breakdowns, in an `atomic = False` migration. **Data prerequisite:** `sales_document_line.unit_cost_snapshot` must be populated by SAL-02's issue service for every stocked line; a backfill management command `backfill_unit_cost_snapshot` reads the matching `sale_out` movement for historical documents and is run once before the feature is enabled — documents it cannot match are counted in `revenue_without_cost`.

#### 16. Audit Requirements
Views are not audited. Exports are, via RPT-08, with `metadata = { report: 'profit-summary', date_from, date_to, group_by, breakdown }`. Because the figures leave the app and may be shown to a lender or a partner, the completion audit row additionally stores `metadata.totals_hash` (SHA-256 of the canonicalised `meta.totals`), the same device RPT-07 uses, so it can later be shown which numbers were produced on which date.

#### 17. Notifications
None by default. A Phase-2 opt-in setting `reports.monthly_profit_digest` (`off|on`, off by default) makes the scheduled command `reports.monthly_profit_digest` (1st of each month, 08:30 IST, ADR-012 runner, idempotent on `(tenant, month)`) write a `notifications_notification` `type='profit_digest'` to every member holding `reports.financial.read`: title "Last month you made ₹{net_profit}" (or "Last month you lost ₹{amount}"), body "Sales ₹{revenue} · Cost ₹{cogs} · Expenses ₹{expenses}", `data.route = '/reports/profit?date_from=…&date_to=…'`. No SMS, no WhatsApp: a profit figure is not something to put in a text message queue.

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'profit-summary', group_by, breakdown, range_days, has_cost_gap, is_loss }`, `ub.reports.profit_breakdown_changed { from, to }`, `ub.reports.profit_drilldown { dimension, key }`, `ub.reports.profit_caveat_clicked { caveat_code }`, `ub.reports.profit_expenses_toggled { include_expenses }`, `ub.reports.profit_digest_clicked {}`, `ub.reports.exported { report: 'profit-summary', format, rows, async }`.

#### 19. Security
The whole report is behind `reports.financial.read`; there is no partial payload (§12). Tenant scope is in the base `WHERE` of every aggregate and in the movement→document join. `item_id`, `category_id` and `party_id` resolve inside the tenant scope so cross-tenant identifiers 404. The drill-down reuses the register endpoint, which enforces its own permissions, so no new data path is created. Export files follow RPT-08's storage, escaping, expiry and download-audit rules; the Method sheet travels with the file so a screenshot of a margin cannot be separated from its caveats. The digest notification is written only for qualifying members. No PII beyond party names in the party breakdown, which is already visible to anyone holding `parties.party.read`.

#### 20. Performance
Four statements: revenue by bucket (documents joined to lines), COGS by bucket (lines with `unit_cost_snapshot`, or the movement join for the reconciliation figure), expenses by bucket, and the breakdown aggregate when requested. Bucketing uses `date_trunc` with the tenant's FY offset applied in SQL rather than in Python. The month fixture (2,000 invoices / 8,000 lines / 300 expenses) measures ~450 ms; the FY fixture ~1.8 s; `EXPLAIN` asserted in CI with no sequential scan on `sales_document_line`. Breakdown rows are paginated (25/100) after aggregation; above 20,000 breakdown rows the endpoint returns 202 (EC-13). Closed ranges cached 120 s per `(tenant, permissions version, params hash)`; ranges including today are not cached. The chart receives at most 36 buckets; a request that would produce more is rejected by the `group_by=day` rule in §10.

#### 21. Testing
- `T-RPT10-1` unit: BR-11 worked example end to end — revenue ₹2,099.94, COGS ₹664.00, gross ₹1,435.94, margin 68.4 %, expenses ₹9,240.00, net −₹7,804.06 shown as a loss.
- `T-RPT10-2` unit: revenue excludes tax and round-off, is net of document and line discounts, and is reduced by credit notes.
- `T-RPT10-3` unit (**the central test**): after computing the report, post a purchase that raises `inventory_item_stock.avg_cost` from 332.0000 to 348.0000, recompute, and assert COGS is **unchanged** at ₹664.00 — proving the weighted-average snapshot on the movement is used and not the current cost.
- `T-RPT10-4` unit: `sales_document_line.unit_cost_snapshot` and the matching `sale_out` movement's `unit_cost` agree for every line in the fixture; the period table and the item breakdown therefore produce the same COGS total.
- `T-RPT10-5` unit: `restock=false` credit note reduces revenue but not COGS (EC-3) and fires the caveat.
- `T-RPT10-6` unit: service lines, free-text lines and zero-cost goods accumulate into `revenue_without_cost` and fire the caveat with the right amount (BR-6).
- `T-RPT10-7` unit: expense tax inclusion flips with `gst_type` (BR-4) and the approximation caveat fires for a mid-range scheme change (EC-11).
- `T-RPT10-8` unit: bucketing for day/week/month/quarter/fy including the FY offset from `fy_start_month = 4` and a range spanning two FYs (EC-7).
- `T-RPT10-9` unit: `meta.totals` equals Σ of the period rows exactly (BR-8); breakdown Σ gross profit equals the period Σ gross profit.
- `T-RPT10-10` unit: backdated invoice — COGS lands in the document's period, not the movement's (EC-12), with the reconciliation footnote populated.
- `T-RPT10-11` unit: void in a later period corrects that later period only (BR-10).
- `T-RPT10-12` API: staff → 403 on every parameter combination; accountant → 200; `group_by=day` over 120 days → 400 with the exact message.
- `T-RPT10-13` API: `inventory` disabled → COGS 0 everywhere, banner flag in `meta`, headline switched (FR-12).
- `T-RPT10-14` API: CSV/XLSX sheets Periods, Breakdown and Method with the declared headers; the Method sheet contains every caveat string.
- `T-RPT10-15` component: loss rendering (word + tone + screen-reader text), margin cell never without its rupee value, method card always expanded, chart zero baseline present.
- `T-RPT10-16` E2E: issue the BR-11 documents and expenses → open Profit for September → assert the four tiles → switch to breakdown by item → tap Rice → drawer lists the three documents.
- `T-RPT10-17` perf: month ≤ 1 s, FY ≤ 2.5 s, FY with item breakdown ≤ 2.5 s or 202.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given the BR-11 September documents, when I open Profit for September, then Sales shows ₹2,099.94, Cost of goods ₹664.00, Gross profit ₹1,435.94 and the margin 68.4 %.
- `AC-2` (US-2) Given rent ₹8,000 and electricity ₹1,240 recorded in September, when I look at the same screen, then Expenses shows ₹9,240.00 and Net profit shows "Loss ₹7,804.06" in error tone with the word "Loss".
- `AC-3` (US-3) Given six months of data and group by month, when I open the report for that range, then the table has six rows and the chart plots revenue, gross profit and expenses with a zero baseline.
- `AC-4` (US-4) Given the category "Rice & Atta" contributes ₹1,435.94 of the period's gross profit, when I switch the breakdown to Category, then its row shows its revenue, cost, gross profit, margin and its share-of-profit bar, and the breakdown's gross-profit total equals the period total.
- `AC-5` (US-5) Given a party breakdown, when I select it, then rows show revenue, cost, gross profit and margin per party with walk-in aggregated as one row, and no net-profit column is offered.
- `AC-6` (US-6) Given any range, when I scroll to the bottom, then the method card states that cost is the average cost at the time of sale, that tax is excluded, and that this is not a statutory profit-and-loss statement — and the same text appears on the Method sheet of the export.
- `AC-7` (US-1, US-6) Given I buy more stock at a higher price after the month closed, when I reopen the September report, then every figure is unchanged.

#### 23. Dependencies
SAL-02 (line `taxable_value` and the `unit_cost_snapshot` written at issue), SAL-04 (credit notes and `restock`), SAL-05 (void), INV-04/INV-06 (opening stock and adjustments — the reconciling items), PUR-01 (purchase cost feeding the weighted average, §21.3.6), EXP-01/EXP-02 (expenses and categories), PLT-04 (`fy_start_month`, `gst_type`), RPT-03 (drill-down and reconciliation), RPT-06 (cost-gap list), RPT-08 (export), RPT-09 (shares the COGS rule), NTF-01 (optional digest), scheduler command `reports.monthly_profit_digest`, the backfill command `backfill_unit_cost_snapshot`, CR-RPT-2 (register filters), CR-RPT-7 (new endpoint and entitlement key), Phase-2 plan entitlement `reports.profit`.

#### 24. Future Enhancements
A true profit-and-loss statement with opening/closing stock, depreciation and accruals once the `accounting` module lands (canon §0.3, Future); FIFO and specific-identification costing as tenant-selectable methods beside weighted average; profit by salesperson (joins RPT-11's attribution); profit by location (INV-11, P2); budget-versus-actual with targets per category; a break-even tile ("you need ₹x of sales a day to cover expenses"); cash profit versus accrual profit side by side once the cashbook and the register can be reconciled automatically; export straight to Tally XML (RPT-13, P3) so the management figure and the filed figure start from the same file.

---

### RPT-11 — Staff performance (Phase 2)

#### 1. Business Objective
Show the owner what each member of the team actually did in a period — how many bills they made and for how much, how much money they collected, how much discount they gave away, how many parties they added, and how often they voided something — so that incentives, shift planning and trust decisions rest on the record instead of on impressions. The report is built entirely from `created_by_id`, which every business table already carries (§21.1 rule 9), so it costs no new data entry. It is scoped honestly: it measures **who entered the record**, not who made the sale, and the screen says so, because a shop where the owner bills everything would otherwise read as a shop with one heroic salesman. Measures: Σ of per-user sales equals the sales register total for the same period (CI test); p95 ≤ 700 ms for a month; ≥ 40 % of tenants with 2+ active staff members open it monthly; zero instances of a staff member being able to see another's figures (permission test).

#### 2. User Personas
**OW** (primary — the only persona this report is designed for), **AC** (secondary — payroll/incentive verification), **ST** (sees **only their own** row, and only when the owner has enabled `reports.staff_self_view`; off by default).

#### 3. User Stories
1. `US-RPT11-1` As an owner I want sales value and bill count by user for a period so that I can pay incentives fairly.
2. `US-RPT11-2` As an owner I want collections by user so that I know who is actually bringing the money in, not just writing bills.
3. `US-RPT11-3` As an owner I want to see discounts given by each user so that I can spot money leaking at the counter.
4. `US-RPT11-4` As an owner I want to see voids, reversals and backdated entries by user so that I can investigate mistakes or worse.
5. `US-RPT11-5` As an owner I want a per-user detail view with their documents so that a conversation with a staff member starts from facts.
6. `US-RPT11-6` As an owner I want to compare this month with last month per user so that I see who is improving.
7. `US-RPT11-7` As a staff member I want to see my own numbers so that I know where I stand, without seeing my colleagues'.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/staff-performance` with params `date_from`, `date_to` (default current month), `user_id` (repeatable), `role`, `include_removed` (default `true` — a person who left still did the work), `compare` (`none|previous_period`, default `none`), `ordering` (`-sales_value` default, `-collections_value`, `-bill_count`, `name`, `-void_count`), `metric_set` (`sales|collections|ledger|quality|all`, default `all`), `format`.
2. `FR-2` Row shape, one per user who has any activity in the range (plus users with none when explicitly requested by `user_id`): `{ user: { id, full_name, mobile_masked, role, membership_status }, sales: { bill_count, issued_count, draft_count, sales_value, average_bill_value, items_per_bill, credit_note_count, credit_note_value, discount_value, discount_pct_of_gross }, collections: { payment_count, collections_value, cash_share_pct, modes: { cash, upi, bank, cheque, card, other } }, ledger: { entries_count, gave_value, got_value, parties_added, reminders_sent }, quality: { void_count, void_value, reversal_count, backdated_count, negative_stock_count, avg_seconds_to_issue }, activity: { active_days, first_activity_at, last_activity_at }, compare: {…}|null }`.
3. `FR-3` `meta`: `{ date_from, date_to, window_days, totals: {…same shape, summed…}, unattributed: { sales_value, collections_value, reason: 'system_or_deleted_user' }, user_count, attribution_note, page, page_size, total, total_pages }`.
4. `FR-4` **Attribution rule (single, stated everywhere):** every figure is attributed by the row's `created_by_id`. `sales_document` → the user who created the draft, **not** the user who issued it, unless the two differ, in which case both are reported (`bill_count` by creator, `issued_count` by a second aggregate on the audit log's `invoice.issued` actor). `payments_payment`, `ledger_entry`, `parties_party`, `expenses_expense` and `ledger_reminder` attribute by `created_by_id` directly. Rows with `created_by_id IS NULL` (system jobs, deleted users) roll into `meta.unattributed`.
5. `FR-5` A **leaderboard** view (default) shows one card per user with their headline metric and a rank; a **table** view shows every metric as columns. `MLToggleGroup` switches them and the choice persists per user in `localStorage` via the existing preferences hook.
6. `FR-6` Per-user drill-down: tapping a row opens a full page `app/(app)/reports/staff/[userId]/page.tsx` → `<StaffDetailPageContent/>` with the same metrics for that user, a daily sparkline, and three lists (their bills, their payments, their voids) each linking to the underlying documents.
7. `FR-7` `metric_set` lets the client fetch only what it renders; the leaderboard requests `sales,collections`, the table requests `all`.
8. `FR-8` `compare=previous_period` adds `compare.{sales_value, collections_value, bill_count}` and `delta_pct` per metric, computed as in RPT-09 FR-8.
9. `FR-9` The **quality** metric set is shown behind a deliberate second click ("Show quality and exceptions") with the caption "These are error signals, not accusations" — voids and reversals have legitimate causes and a leaderboard that ranks people by them would be actively harmful.
10. `FR-10` `reports.staff_self_view` (tenant setting, default `false`) enables a staff member to call the endpoint with no `user_id` and receive **exactly one row — their own** — with `meta.totals` equal to that row and no other user's data present in the payload in any form.
11. `FR-11` Members whose `platform_membership.status = 'removed'` are included with a "Left" badge when `include_removed=true`, so a period's history stays complete after somebody leaves.
12. `FR-12` Export (RPT-08) produces sheets `Summary` (one row per user, all metrics), `Daily` (user × date), and `Method` carrying the attribution note.

#### 5. Non-Functional Requirements
p95 ≤ 700 ms for a month with 10 users and 2,000 documents, ≤ 2 s for a financial year; five aggregates per request, each a grouped scan over one table. Leaderboard renders at 320 px as a single-column card stack; the table scrolls horizontally within its own container. i18n `reports.staff.*` in full Hindi. Mobile numbers are masked by default (`+91 98•••• 3210`) and revealed only to `platform.members.manage` holders. No metric animates or counts up — a performance number that moves is a number nobody trusts.

#### 6. User Flow
Reports → Staff → current month → leaderboard: Suresh ₹2,84,000 in 96 bills, Priya ₹1,42,000 in 61 bills, Owner ₹60,000 in 12 → tap Suresh → detail page → his bills, his ₹1,90,000 collected, his 3 voids → back → switch to table view → notice Priya's discount is 4.2 % of gross against a 1.8 % average → tap the discount cell → her discounted bills.
Alternate A (compare): turn on compare with last month → Suresh +18 %, Priya −31 % → conversation.
Alternate B (quality): "Show quality and exceptions" → voids and backdated entries by user → tap a void → SAL-05's reason and audit trail.
Alternate C (staff self view, enabled): a staff member opens Reports → Staff → sees one card, their own, with the caption "Your numbers for September".
Alternate D (staff self view, disabled): the nav entry is not rendered; a deep link 403s.

#### 7. UI Requirements
`ReportPageShell` (title "Staff performance" / "स्टाफ का काम"; description "What each person billed, collected and recorded"). Controls: `UbDateRangePicker` (This month · Last month · This quarter · This FY · Custom), `MLToggleGroup` Leaderboard/Table, `UbCombobox` user filter (multi), `MLSelect` role, `MLSwitch` compare, Export. Tiles (`UbStatCard` × 3): Total sales recorded, Total collected, Active people (baseline "of {n} members"). Leaderboard: feature-local `StaffLeaderboardCard` built on `MLCard` + `MLAvatar` + `UbAmount` + `UbSparkline`, one per user, rank chip, headline metric switchable between sales and collections, secondary line "96 bills · avg ₹2,958 · 22 active days". Table: `ReportTable` with column groups Sales · Collections · Ledger · Quality, sticky user column. Detail page: `UbPageHeader` with the user's name and role, `UbStatCard` row, `UbSparkline` daily, three `UbDataGrid`s (Bills · Payments · Voids & reversals) each with its own tab via `UbTabs`. Feature-local: `StaffLeaderboardCard`, `StaffMetricTable`, `AttributionNote`, `QualityDisclosure`. Redux: `staffReportSlice`, thunks `fetchStaffPerformance(params)` and `fetchStaffDetail(userId, params)` → `reportsService.getReport('staff-performance', params)`.

#### 8. UX Requirements
Copy: "Staff performance" = "स्टाफ का काम", "Bills made" = "बनाए गए बिल", "Collected" = "वसूली", "Discount given" = "दी गई छूट", "Voided" = "रद्द किए", "Active days" = "काम के दिन", "Left" = "छोड़ चुके". The attribution note sits above the first metric, not in a tooltip: "These numbers come from who entered each record in DigiKhaato. If one person bills for everyone, the numbers will say so." Ranks are shown but no medals, no confetti, no "top performer" badge — the product does not editorialise about people. Negative deltas are stated plainly without alarm tones; only the quality section uses warning tones, and only after the explicit disclosure click. Discount percentage is always paired with its rupee value. A user with zero activity reads "No activity in this period", never "0" in every cell.

#### 9. States
Initial (current month, leaderboard) · Loading (3 tiles + 4 card skeletons) · Ready · Comparing · Quality disclosed · Empty ("Only you have used DigiKhaato in this period" when a single user has activity — with a link to PLT-07 invite) · Empty filtered · Self-view (single card) · Forbidden (staff without self-view) · Error · Processing/Completed/Failed (export).

#### 10. Validation Rules
| Field | Rule | Error (400 `validation_error`) |
|---|---|---|
| `date_to − date_from` | ≥ 0 and ≤ 731 days | "Choose a period of up to 2 years" |
| `date_to` | ≤ today | "Period cannot be in the future" |
| `user_id` | each must be a member (any status) of this tenant | 404 `not_found` (never 403 — a cross-tenant user id must not be confirmed to exist) |
| `role` | ∈ `owner,admin,staff,accountant` or a custom role code | "Unknown role" |
| `compare` | ∈ `none,previous_period` | "Unknown comparison" |
| `metric_set` | ∈ `sales,collections,ledger,quality,all` (comma list) | "Unknown metric set" |
| `ordering` | whitelist per FR-1 | "Cannot sort by this column" |
| staff caller | `reports.staff_self_view` must be on, and `user_id` must be absent or equal to self | 403 `permission_denied` "You can only see your own numbers" |

#### 11. Business Rules
1. `BR-1` **Attribution is by `created_by_id`, always, and the report says so.** No heuristic assigns a bill to whoever was logged in nearby, and no figure is inferred. `meta.attribution_note` carries the sentence the UI renders.
2. `BR-2` **Sales value** = Σ `sales_document.grand_total` for `kind IN ('invoice','bill_of_supply')`, `status NOT IN ('draft','void')`, `document_date` in range, grouped by `created_by_id`; credit notes are reported separately (count and value) and **not** subtracted from `sales_value`, because subtracting a return from the seller's number punishes them for a customer's decision. `net_sales_value` is available as a secondary column for owners who want it.
3. `BR-3` **Collections value** = Σ `payments_payment.amount` where `direction='in'` and `status='recorded'` and `payment_date` in range, grouped by `created_by_id`. `cash_share_pct` = Σ cash-mode amounts (from `mode_breakup` unnested with `jsonb_array_elements`) ÷ `collections_value` × 100, rounded to 1 decimal — a high cash share on one person's collections is exactly the signal an owner opens this report for.
4. `BR-4` **Discount value** = Σ `sales_document.discount_amount` + Σ `sales_document_line.discount_amount` for the same documents; `discount_pct_of_gross = ROUND(discount_value / NULLIF(discount_value + taxable_total, 0) × 100, 1)`.
5. `BR-5` **Active days** = `COUNT(DISTINCT date(created_at AT TIME ZONE tenant_timezone))` across the union of that user's sales documents, payments, ledger entries and expenses in the range. It measures presence in the app, not attendance, and the tooltip says so.
6. `BR-6` **`avg_seconds_to_issue`** = mean of `issued_at − created_at` over documents the user both created and issued — a speed-at-the-counter signal that is deliberately not ranked.
7. `BR-7` **Quality metrics.** `void_count`/`void_value` attribute to the **voider** (the actor on the `invoice.voided` audit row), not to the creator, because voiding is the act being measured. `reversal_count` counts `ledger_entry` rows with `entry_type='reversal'` created by the user. `backdated_count` counts documents and entries whose business date is more than 1 day before their `created_at` date. `negative_stock_count` counts issues that drove an item's on-hand below zero.
8. `BR-8` **Normative sales aggregate:**
```sql
SELECT d.created_by_id,
       COUNT(*) FILTER (WHERE d.status <> 'draft')                 AS bill_count,
       COUNT(*) FILTER (WHERE d.status = 'draft')                  AS draft_count,
       SUM(d.grand_total) FILTER (WHERE d.kind <> 'credit_note')   AS sales_value,
       SUM(d.grand_total) FILTER (WHERE d.kind = 'credit_note')    AS credit_note_value,
       SUM(d.discount_amount)                                      AS doc_discount_value,
       AVG(d.grand_total) FILTER (WHERE d.kind <> 'credit_note')   AS average_bill_value
  FROM sales_document d
 WHERE d.tenant_id = :t
   AND d.kind IN ('invoice','bill_of_supply','credit_note')
   AND d.status NOT IN ('void')
   AND d.document_date BETWEEN :date_from AND :date_to
 GROUP BY d.created_by_id;
```
   The collections, ledger and quality aggregates are the same shape over `payments_payment`, `ledger_entry` and `platform_audit_log` respectively.
9. `BR-9` **Reconciliation invariant:** `Σ rows.sales.sales_value + meta.unattributed.sales_value` = RPT-03's `grand_total` total for the same range and filters. Asserted in CI (T-RPT11-2). The same holds for collections against RPT-02's payment rows.
10. `BR-10` **The owner is a user too** and appears in the report with their own row. Excluding the owner would make every comparison meaningless in a shop where the owner bills most of the day.
11. `BR-11` **No derived judgement is stored or exposed.** There is no "score", no "efficiency index" and no ranking persisted anywhere. Rank is a presentation-order artefact of the chosen `ordering` and changes with it; the API never returns a `rank` field.
12. `BR-12` **Worked example.** September 2026, three members. Suresh created 96 non-draft bills totalling ₹2,84,000 with ₹11,900 of discount, issued 94 of them, recorded 61 payments in totalling ₹1,90,000 of which ₹1,52,000 was cash (80.0 %), added 14 parties, voided 3 bills worth ₹6,400, and was active on 22 distinct days. His row therefore reads: bills 96, sales ₹2,84,000, average bill ₹2,958.33, discount ₹11,900 (4.0 % of gross), collected ₹1,90,000, cash share 80.0 %, parties added 14, voids 3 / ₹6,400, active days 22. With `compare=previous_period` and August sales of ₹2,40,600, `delta_pct = +18.0`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View all users' figures | `platform.members.manage` + `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| View own figures only | `reports.basic.read` + tenant setting `reports.staff_self_view` | ✅ | ✅ | ⚙ (setting) | ✅ |
| Quality / exceptions section | `platform.audit.read` | ✅ | ✅ | ❌ | ✅ |
| Per-user detail page | `platform.members.manage` (or self) | ✅ | ✅ | ⚙ self only | ✅ |
| Unmasked mobile numbers | `platform.members.manage` | ✅ | ✅ | ❌ | ❌ |
| Export | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Toggle `reports.staff_self_view` | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |

The double gate (`platform.members.manage` **and** `reports.financial.read`) is deliberate: this report combines personnel data with financial data and neither permission alone should unlock it. Phase-2 plan entitlement `reports.staff` gates the feature per plan; tenants with a single member never see the nav entry.

#### 13. Edge Cases
1. `EC-1` A staff member is removed mid-period → their row persists with the "Left" badge and `membership_status='removed'`; their documents are untouched (§21.5 sets `created_by` to NULL only on *user* deletion, which the product does not do).
2. `EC-2` A user is deleted at the platform level (a rare support action) → their rows' `created_by_id` becomes NULL and the figures move to `meta.unattributed` with `reason='system_or_deleted_user'`; the number is shown, never silently dropped.
3. `EC-3` A document created by staff and issued by the owner → `bill_count` credits the creator, `issued_count` credits the issuer, and the column headers say "made" and "issued" so the difference is legible.
4. `EC-4` A payment recorded by one user against an invoice created by another → collections credit the recorder; there is no split attribution.
5. `EC-5` Bulk import of parties (IMP-01) by the owner → `parties_added` spikes for the owner; the import's `created_by` is the importing user and a footnote names imports over 50 rows.
6. `EC-6` Scheduled jobs (overdue refresh, auto reminders) create no documents but do create reminder rows with `created_by_id IS NULL` → unattributed, never credited to anyone.
7. `EC-7` Two members share a device and a login (common in small shops) → the report cannot detect this; the attribution note and the help article both say that separate logins are the only way to get separate numbers, and PLT-07's invite flow is linked from the empty state.
8. `EC-8` `compare` when a user did not exist in the previous period → `delta_pct = null`, rendered "new".
9. `EC-9` Staff self-view on, staff member passes another user's id → 403 with "You can only see your own numbers"; passing their own id or no id succeeds.
10. `EC-10` A void performed by a user who is not the creator → counted in the voider's `void_count` and in nobody's `bill_count` reduction (BR-2 already excludes voided documents from `sales_value` for the creator, so the sale simply disappears from the seller's total — this asymmetry is documented in the method text).
11. `EC-11` Range with no activity by anyone → the empty state names the range, not "no data".
12. `EC-12` 50 members over a financial year → pagination 25; the leaderboard shows the top 10 with "Show all" and the aggregates still cover everyone.

#### 14. API Requirements
`GET /reports/staff-performance?date_from&date_to&user_id&role&include_removed&compare&metric_set&ordering&page&page_size&format=json|csv|xlsx` → `200 { "data": rows[], "meta": {…} }` per FR-2/FR-3, or `202 { "export_id" }` above the RPT-08 threshold. `GET /reports/staff-performance/{user_id}?date_from&date_to` → the single-user detail payload with `daily[]` (`{ date, sales_value, collections_value, bill_count }`) and the three document lists as paginated sub-resources (`?include=bills,payments,voids`). Both endpoints are **new** — §22.11 lists neither — and are added as **CR-RPT-8**, along with the tenant setting key `reports.staff_self_view` and the Phase-2 entitlement `reports.staff`. Errors: 400 `validation_error`, 403 `permission_denied`, 404 `not_found`, 429. `Cache-Control: private, no-store` always — personnel figures are never cached at the edge, and the 120 s report cache is deliberately not used for this report. CSV header (exact): `user_name,role,status,bill_count,issued_count,sales_value,average_bill_value,credit_note_count,credit_note_value,discount_value,discount_pct_of_gross,payment_count,collections_value,cash_share_pct,entries_count,parties_added,reminders_sent,void_count,void_value,reversal_count,backdated_count,active_days,first_activity_at,last_activity_at` plus `compare_sales_value,delta_pct` when comparing, and a TOTAL row. Frontend: `reportsService.getReport('staff-performance', params)` and `.getStaffDetail(userId, params)`, `staffReportSlice`.

#### 15. Database Impact
Reads `sales_document` (`IX(tenant_id, kind, status, document_date DESC)`), `sales_document_line` (line discounts), `payments_payment` (`IX(tenant_id, payment_date DESC)`, `mode_breakup` unnested), `ledger_entry` (`IX(tenant_id, created_at DESC)`), `parties_party`, `expenses_expense`, `ledger_reminder`, `platform_membership`, `platform_user`, `platform_role`, and `platform_audit_log` (`IX(tenant_id, created_at DESC)`) for voids, issues and backdating. Writes: none beyond RPT-08's export rows. New indexes recommended, each in an `atomic = False` migration: `CREATE INDEX CONCURRENTLY sales_document_creator_date_idx ON sales_document (tenant_id, created_by_id, document_date)` and `CREATE INDEX CONCURRENTLY payments_payment_creator_date_idx ON payments_payment (tenant_id, created_by_id, payment_date)` — without them the grouped scans fall back to the date indexes and filter, which is acceptable at MVP volumes but not at a 50-user tenant. The audit-log aggregate benefits from the monthly partitioning already planned in §21.3.1.

#### 16. Audit Requirements
**Viewing this report is itself audited** — unusually, and deliberately, because it is a report about people: `action='report.staff_viewed'`, `entity_type='platform_user'`, `entity_id` = the subject user id (or NULL for the list view), `metadata = { date_from, date_to, user_count, self_view }`. Exports are audited by RPT-08 with `metadata.report='staff-performance'` and the subject user ids. Turning `reports.staff_self_view` on or off is audited by PLT-05 as a settings change with before/after. This trail means an owner can later see who looked at whose numbers, which is the minimum a product owes people it measures.

#### 17. Notifications
None. There is no digest, no "top performer of the month" push and no alert when somebody's numbers fall. Automated commentary on a person's work would be both a product mistake and an HR hazard; the owner opens the report when they want it. (The one exception considered and rejected: a "nobody has billed today" alert, which belongs to RPT-01's dashboard as a business signal, not to this report as a people signal.)

#### 18. Analytics / Event Tracking
`ub.reports.viewed { report: 'staff-performance', view: 'leaderboard'|'table', window_days, user_count, compare, self_view }`, `ub.reports.staff_view_changed { from, to }`, `ub.reports.staff_detail_opened { has_compare }`, `ub.reports.staff_quality_disclosed {}`, `ub.reports.staff_metric_drilldown { metric }`, `ub.reports.staff_self_view_toggled { enabled }`, `ub.reports.exported { report: 'staff-performance', format, rows, async }`. No event carries a user's name or mobile — only counts and the subject's id where the backend already knows it.

#### 19. Security
Double permission gate (§12) enforced in the view, not the UI. In self-view mode the queryset is filtered to `created_by_id = request.user.id` **before** aggregation, so no other user's figures exist in the response object at any point — a serializer-level exclusion would be a leak waiting for a bug. `user_id` params resolve against `platform_membership` inside the tenant, so a cross-tenant user id returns 404 and cannot be used to confirm that a user exists. Mobile numbers are masked unless `platform.members.manage` is held. `Cache-Control: no-store` on every response. DPDP posture: this is employment-context processing of personal data — the lawful basis is the employment relationship, the purpose is limited to the tenant's own workforce management, retention follows the underlying records, and the subject can see their own figures when self-view is enabled; the audit trail in §16 makes access accountable. The export's Method sheet carries the same attribution note so a printed leaderboard cannot be separated from its caveat.

#### 20. Performance
Five grouped aggregates per request (sales, payments, ledger, parties/expenses/reminders, audit), each an index scan grouped by `created_by_id`, joined in Python to the membership list — which is at most a few dozen rows, so the join is free. The month fixture (10 users, 2,000 documents, 900 payments) measures ~300 ms; the FY fixture ~1.4 s. `compare` doubles the first two aggregates only. The `mode_breakup` unnesting for `cash_share_pct` is the most expensive expression and is computed only when `metric_set` includes `collections`. The detail page's three lists are ordinary paginated `UbDataGrid` queries against existing indexes. No caching (§14), so every load is live; the endpoint is rate-limited at the standard 600/min and the leaderboard requests a reduced `metric_set` to keep first paint fast.

#### 21. Testing
- `T-RPT11-1` unit: BR-12 worked example — every metric asserted, including `average_bill_value` ₹2,958.33, `cash_share_pct` 80.0 and `discount_pct_of_gross` 4.0.
- `T-RPT11-2` unit: BR-9 reconciliation — Σ per-user `sales_value` + `meta.unattributed.sales_value` equals RPT-03's total for the same range; same for collections against the day book.
- `T-RPT11-3` unit: creator vs issuer attribution (EC-3) — `bill_count` and `issued_count` land on different users.
- `T-RPT11-4` unit: voids attribute to the voider, not the creator (BR-7, EC-10); reversals and backdated entries counted correctly.
- `T-RPT11-5` unit: `active_days` counts distinct dates in the tenant timezone across four source tables, not in UTC.
- `T-RPT11-6` unit: `created_by_id IS NULL` rows roll into `meta.unattributed` and are not credited to any user (EC-2, EC-6).
- `T-RPT11-7` unit: removed member included with the Left badge when `include_removed=true`, excluded when false (EC-1).
- `T-RPT11-8` API (**the security test**): staff with self-view **off** → 403; with self-view **on** and no `user_id` → exactly one row, their own, and `meta.totals` equal to it; with another user's `user_id` → 403; the raw response body asserted to contain no other user's id or name.
- `T-RPT11-9` API: accountant without `platform.members.manage` → 403 on the list view (the double gate).
- `T-RPT11-10` API: `compare=previous_period` shifts by `window_days`; a user absent from the previous period gets `delta_pct = null`.
- `T-RPT11-11` API: `Cache-Control: no-store` on every response; cross-tenant `user_id` → 404 not 403.
- `T-RPT11-12` API: CSV header exact; the Method sheet of the XLSX carries the attribution note.
- `T-RPT11-13` audit: opening the list writes `report.staff_viewed` with `user_count`; opening a detail page writes it with `entity_id` set; toggling the setting writes a settings audit row.
- `T-RPT11-14` component: quality section hidden until disclosed; no `rank` field consumed from the API; masked mobiles for an admin without `platform.members.manage`; empty state links to the invite flow.
- `T-RPT11-15` E2E: two logins create bills and payments in a period → the leaderboard shows both with correct totals → the owner opens one detail page → the lists show that user's documents only.
- `T-RPT11-16` perf: 10 users / month ≤ 700 ms; 50 users / FY ≤ 2 s; `EXPLAIN` uses the creator indexes.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given Suresh created 96 non-draft bills totalling ₹2,84,000 in September, when I open Staff performance for September, then his card shows ₹2,84,000, 96 bills and an average bill of ₹2,958.33.
- `AC-2` (US-2) Given he recorded ₹1,90,000 of payments in, of which ₹1,52,000 was cash, when I look at his collections, then they read ₹1,90,000 with an 80.0 % cash share.
- `AC-3` (US-3) Given he gave ₹11,900 of discount on ₹2,84,000 of gross, when I switch to the table view, then his discount column reads ₹11,900 and 4.0 %, and tapping it lists the discounted bills.
- `AC-4` (US-4) Given he voided 3 bills worth ₹6,400, when I click "Show quality and exceptions", then his void count reads 3 / ₹6,400 with the caption "These are error signals, not accusations", and each void links to its reason and audit trail.
- `AC-5` (US-5) Given I tap his card, when the detail page opens, then I see his daily sparkline and three tabs listing his bills, his payments and his voids, each linking to the document.
- `AC-6` (US-6) Given August sales of ₹2,40,600, when I turn on compare, then his card shows +18.0 % against the previous period.
- `AC-7` (US-7) Given the owner has turned on "Let staff see their own numbers", when Suresh opens the report, then he sees exactly one card — his own — and the response contains no data about any other member; with the setting off, the nav entry is absent and a deep link returns "You can only see your own numbers".

#### 23. Dependencies
PLT-07 (memberships, invitations — separate logins are the precondition for the whole report), PLT-08 (roles and permissions), PLT-05 (the `reports.staff_self_view` setting), PLT-09 (audit log — the source for voids, issues and the §16 view audit), SAL-02/SAL-05 (documents and voids), SAL-08 (the bill lists reused on the detail page), PAY-01/PAY-02 (payments and `mode_breakup`), LED-01/LED-03/LED-06 (entries, reversals, reminders), PTY-02 (parties added), EXP-01 (expenses recorded), RPT-03 (reconciliation), RPT-08 (export), CR-RPT-8 (two new endpoints, the setting key and the entitlement), Phase-2 plan entitlement `reports.staff`.

#### 24. Future Enhancements
A true `salesperson_id` on `sales_document`, chosen at billing time and independent of who typed the bill, which would turn attribution from a proxy into a fact (SAL-15, P3); commission and incentive computation on top of it, with per-user rules and a payable output; shift and attendance capture so `active_days` can become hours; targets per user with progress tracking against them; collection-efficiency ratios (collected ÷ billed by the same user); per-user margin once RPT-10's line-level costing is available to this report; a staff-facing "my numbers" mobile view with only their own trend; anomaly surfacing (an unusually high discount or void rate flagged quietly to the owner) — explicitly deferred until the product can do it without turning into surveillance.

---

### RPT-12 — GSTR-1 JSON export (Phase 2)

#### 1. Business Objective
Remove the last piece of typing from the filing workflow. RPT-07 gives the accountant every GSTR-1 figure on screen; RPT-12 emits the same figures as a **JSON file in the GST Returns Offline Tool schema**, ready to be loaded into the offline utility and uploaded to the portal. Nothing is re-keyed, nothing is transcribed wrongly, and the file is generated from the same selector that produced the on-screen numbers, so the file and the screen can never disagree. It is explicitly an *offline-tool* export, not a direct filing integration: DigiKhaato produces the file, the accountant reviews it in the utility and files it. Measures: a generated file loads into the current offline utility without a schema error in 100 % of CI fixture cases; the utility's computed summary equals RPT-07's on-screen summary to the rupee for the golden fixture; ≥ 60 % of regular-scheme tenants with an accountant use the export within two filing cycles; zero reported instances of a file that the portal rejected for a structural reason.

#### 2. User Personas
**AC** (primary and, in practice, sole — the person who opens the offline utility), **OW** (secondary — may download the file to hand to an external CA).

#### 3. User Stories
1. `US-RPT12-1` As an accountant I want a GSTR-1 JSON file for a tax period so that I can load it into the offline tool instead of typing invoices.
2. `US-RPT12-2` As an accountant I want the file to be blocked when data is missing or invalid so that the utility does not reject it after I have already committed to the upload.
3. `US-RPT12-3` As an accountant I want a preview of what the file contains — section counts and totals — so that I can sanity-check it before uploading.
4. `US-RPT12-4` As an accountant I want the file to match the on-screen GST summary exactly so that I can defend every figure.
5. `US-RPT12-5` As an accountant I want to regenerate the file after fixing something so that I always upload the latest version.
6. `US-RPT12-6` As an external CA I want to receive one file per period with a clear name so that I know what I am uploading.

#### 4. Functional Requirements
1. `FR-1` `GET /reports/gstr1-json?period=2026-09&preview=true` returns the **preview**: `{ gstin, fp, version, sections: [ { code, gstr1_table, record_count, invoice_count, taxable_value, igst, cgst, sgst, cess } ], totals: {…}, blocking_issues: [...], warnings: [...], can_generate: true|false, last_generated: { export_id, generated_at, file_hash } | null }`.
2. `FR-2` `POST /reports/gstr1-json` with `{ "period": "2026-09", "acknowledge_warnings": true }` generates the file. Below 5,000 contributing documents it responds `200` with the file itself (`Content-Type: application/json`, `Content-Disposition: attachment`); above, it responds `202 { "export_id" }` and the file is produced by the `platform_job` runner exactly as in RPT-08 FR-4. Generation is refused with `409 gstr1_blocked` while `blocking_issues` is non-empty.
3. `FR-3` The emitted document follows the offline-tool schema, top level: `{ "gstin", "fp", "version", "hash": "hash", "b2b": [...], "b2cl": [...], "b2cs": [...], "cdnr": [...], "cdnur": [...], "nil": { "inv": [...] }, "hsn": { "data": [...] }, "doc_issue": { "doc_det": [...] } }`. `fp` is `MMYYYY` (`"092026"`). `version` comes from the tenant setting `gst.gstr1_json_version` (default `"GST3.2.2"`) so a portal schema bump is a settings change, not a release. `hash` is the literal string `"hash"`, as the utility expects. Sections with no records are **omitted entirely**, never emitted as empty arrays.
4. `FR-4` **Section shapes (normative).**
   - `b2b[]`: `{ "ctin": "<party GSTIN>", "inv": [ { "inum", "idt": "DD-MM-YYYY", "val": <grand_total>, "pos": "<2-digit>", "rchrg": "N"|"Y", "inv_typ": "R", "itms": [ { "num": <rate as integer key>, "itm_det": { "rt": <rate>, "txval", "iamt", "camt", "samt", "csamt" } } ] } ] }`, grouped by counter-party GSTIN.
   - `b2cl[]`: `{ "pos", "inv": [ { "inum", "idt", "val", "itms": [...] } ] }`, grouped by place of supply.
   - `b2cs[]`: flat records `{ "sply_ty": "INTRA"|"INTER", "typ": "OE", "pos", "rt", "txval", "iamt", "camt", "samt", "csamt" }` — rate-wise and state-wise, never invoice-wise (RPT-07 BR-5).
   - `cdnr[]`: `{ "ctin", "nt": [ { "ntty": "C"|"D", "nt_num", "nt_dt", "p_gst": "N", "inum", "idt", "val", "itms": [...] } ] }` where `inum`/`idt` are the **original** document's number and date from `against_id`.
   - `cdnur[]`: `{ "typ": "B2CL", "ntty": "C", "nt_num", "nt_dt", "val", "itms": [...] }` — only for notes against B2CL originals; all other unregistered notes are netted into `b2cs`.
   - `nil.inv[]`: `{ "sply_ty": "INTRB2B"|"INTRB2C"|"INTERB2B"|"INTERB2C", "expt_amt", "nil_amt", "ngsup_amt" }`.
   - `hsn.data[]`: `{ "num": <serial>, "hsn_sc", "desc", "uqc", "qty", "rt", "txval", "iamt", "camt", "samt", "csamt", "val" }`.
   - `doc_issue.doc_det[]`: `{ "doc_num": <nature code>, "docs": [ { "num": <serial>, "from", "to", "totnum", "cancel", "net_issue" } ] }` with nature codes 1 (Invoices for outward supply), 4 (Delivery challan), 5 (Credit note), 6 (Debit note), 7 (Receipt voucher) as the utility numbers them.
5. `FR-5` Every monetary field is a **JSON number** with at most 2 decimals (`1688.57`, not `"1688.57"`) — the one place in the product where money is not a string, because the schema demands it. Quantities are numbers with up to 3 decimals. Dates are `DD-MM-YYYY` strings. `pos` and `sply_ty` are strings. `rchrg`, `p_gst` are `"Y"`/`"N"`.
6. `FR-6` **Blocking issues** (generation refused): `missing_tenant_gstin`, `invalid_tenant_gstin`, `missing_party_gstin` on any B2B document, `invalid_party_gstin_checksum`, `missing_pos`, `missing_hsn` on any line of a tax invoice, `missing_uqc`, `cn_without_original` for a CDNR note, `zero_rate_with_tax`, `period_not_closed` (the period's `date_to` is in the future). Each carries the document link so it can be fixed. The list is the RPT-07 exceptions list with severity raised — one exception model, two consumers.
7. `FR-7` **Warnings** (generation allowed after `acknowledge_warnings`): `legacy_rate_used`, `description_truncated` (an HSN description over 30 characters), `b2cl_threshold_boundary` (a document within ₹1,000 of the threshold), `void_in_period` (voided numbers present, which is normal but worth knowing), `unregistered_party_with_gstin_shaped_field`.
8. `FR-8` The preview screen shows one card per section with its record count and totals, the blocking and warning lists, and a **Generate file** button that is disabled while blocking issues exist. Fixing an issue and returning re-runs the preview.
9. `FR-9` Generated files are `reports_export` rows with `report_name='gstr1-json'`, `format='json'`, the standard 7-day expiry and the standard download path (RPT-08 FR-7). File name: `gstr1_<gstin>_<fp>.json` — for example `gstr1_27AAPFU0939F1ZV_092026.json`.
10. `FR-10` **Regeneration** is always allowed and always produces a new `reports_export` row; the preview shows `last_generated` with its timestamp and a SHA-256 `file_hash` so the accountant can tell whether what they hold is current. A banner appears when documents in the period changed after the last generation: "3 documents changed since you generated this file".
11. `FR-11` Page `app/(app)/reports/gst/gstr1-json/page.tsx` → `<Gstr1JsonPageContent/>`, reachable from RPT-07's GSTR-1 view as a primary action ("Download JSON for the offline tool") and from the Reports index.
12. `FR-12` A **schema self-check** runs before the file is written: the generated structure is validated against a bundled JSON Schema document (`reports/schemas/gstr1_<version>.json`, plain `jsonschema`-style validation implemented in-house over the standard library per ADR-021) and a failure aborts the job with `schema_validation_failed` rather than shipping an invalid file.

#### 5. Non-Functional Requirements
p95 ≤ 2 s for a month with 2,000 documents (preview) and ≤ 4 s to generate; above 5,000 documents the async path applies. The emitted file is UTF-8 without a BOM, compact (no indentation) for upload and offered with a "pretty" variant for inspection (`?pretty=true` on download). Memory is bounded: sections are assembled per group and streamed into the file. Desktop-first screen; the mobile layout works but downloading a JSON on a phone is a rare path. i18n `reports.gstr1.*` — schema field names are never translated. Screen readers announce blocking issues first, as a list, before the section cards.

#### 6. User Flow
Reports → GST summary → GSTR-1 view → "Download JSON for the offline tool" → preview page → "2 issues must be fixed": missing GSTIN on party Ramesh Traders, missing HSN on invoice `INV/26-27/0044` → fix both (PTY-02, SAL-02) → return → preview clean, 1 warning (2 voided numbers in the series) → acknowledge → Generate file → file downloads as `gstr1_27AAPFU0939F1ZV_092026.json` → open the offline utility → import → its summary matches the screen → upload.
Alternate A (large period): quarter with 8,000 documents → 202 → bell notification when ready → download.
Alternate B (regeneration): a credit note is added the next day → returning to the preview shows "1 document changed since you generated this file" → regenerate.
Alternate C (owner hands it over): owner downloads the file and sends it to the external CA over email outside the app.

#### 7. UI Requirements
`ReportPageShell` (title "GSTR-1 JSON" / "जीएसटीआर-1 फाइल"; description "File for the GST offline tool"). Header: period chip (inherited from RPT-07), GSTIN, `fp`, schema version, and a `UbStatusBadge` reading Ready / Blocked / Warnings. Body: `GstJsonIssueList` (blocking issues in error tone with document links and a fix action per issue code; warnings in warning tone with an acknowledge checkbox), then `GstJsonSectionCards` — one `MLCard` per emitted section showing the schema key (`b2b`, `b2cs`, `hsn`, `doc_issue`…), its GSTR-1 table number, record count, invoice count and totals. Footer: a `UbConfirmDialog`-free primary button "Generate file" (generation is not destructive), a secondary "Download last file" when one exists, and a `ds-caption` line "Loads into the GST Returns Offline Tool · schema {version}". A collapsible `MLAccordion`-style raw preview shows the first 40 lines of the JSON for the technically minded. Feature-local: `GstJsonIssueList`, `GstJsonSectionCards`, `GstJsonRawPreview`, `Gstr1GenerateButton`. Redux: `gstr1JsonSlice` (`period`, `preview`, `acknowledged`, `generation`, `status`), thunks `fetchGstr1Preview(period)` and `generateGstr1Json({ period, acknowledge_warnings })` → `reportsService.getGstr1Preview()` / `.generateGstr1Json()`, polling via the shared `useExportPolling` hook.

#### 8. UX Requirements
Copy: "GSTR-1 JSON" (untranslated — it is the portal's name), "Issues to fix" = "ठीक करने हैं", "Warnings" = "ध्यान दें", "Generate file" = "फ़ाइल बनाएँ", "Loads into the GST offline tool" = "जीएसटी ऑफ़लाइन टूल में लोड करें". The blocked state is explained, never merely asserted: each issue says what is wrong, which document, and what to do, with a link that lands on the field. The warning acknowledgement is a single checkbox, not a modal, and its label names the consequence ("I have reviewed these — the file may still be accepted"). The page never claims the return has been filed; the final caption is "Now upload this file in the offline tool" so nobody mistakes a download for a filing. Regeneration is encouraged rather than guarded: there is no "are you sure", because generating a fresh file is always the safer act.

#### 9. States
Initial (period inherited) · Loading preview · Blocked (issues, generate disabled) · Warnings (acknowledge required) · Ready · Generating (sync spinner in the button) · Queued/Preparing (async, with the RPT-08 progress affordance) · Generated (file link + hash + timestamp) · Stale (documents changed since generation) · Expired (last file past 7 days; regenerate) · Not applicable (`gst_type ≠ 'regular'` → empty state naming CMP-08 for composition and settings for unregistered) · Error (retry + `request_id`) · Failed (schema self-check failed — an internal defect, reported with a request id and a "report this" link).

#### 10. Validation Rules
| Field | Rule | Error |
|---|---|---|
| `period` | `YYYY-MM` or `YYYY-Qn`; quarterly only when the tenant setting `gst.filing_frequency = 'quarterly'` | 400 `validation_error` "Choose a month, or switch to quarterly filing in settings" |
| `period` | must be closed (`date_to < today`) | 409 `period_not_closed` "You can generate the file after the period ends" |
| tenant `gstin` | present and checksum-valid | 409 `gstr1_blocked` (`missing_tenant_gstin` / `invalid_tenant_gstin`) |
| tenant `gst_type` | must be `regular` | 409 `gst_not_registered` / "Composition tenants file CMP-08" |
| `acknowledge_warnings` | required `true` when warnings exist | 409 `gstr1_warnings_unacknowledged` "Review the warnings before generating" |
| blocking issues | must be empty | 409 `gstr1_blocked` with `details.issues[]` |
| permission | `reports.export` + `reports.financial.read` | 403 `permission_denied` |

#### 11. Business Rules
1. `BR-1` **One selector, two outputs.** RPT-12 calls `reports.selectors.gst_summary(tenant, period)` — the same function RPT-07 renders — and serialises its sections into the schema. It never issues its own aggregate queries. A CI test asserts that for the golden fixture, every JSON section total equals the corresponding RPT-07 section total (T-RPT12-2). This is the rule that makes US-4 structurally true rather than hopefully true.
2. `BR-2` **Classification rules are RPT-07's**, unchanged: B2B by `party_gstin_snapshot`, B2CL by the date-resolved threshold (RPT-07 BR-4), B2CS rate-wise and state-wise with unregistered notes netted in (RPT-07 BR-5), CDNR against `against_id`, nil/exempt/non-GST by `tax_code`.
3. `BR-3` **Sign convention differs from the screen.** In the JSON, credit notes are **positive** values inside `cdnr`/`cdnur` — the schema carries the note type (`ntty: "C"`) and the portal applies the sign. RPT-07's `by_rate` view shows them negative. Both are correct in their own frame; the generator inverts RPT-07's netted values back to note-positive when emitting `cdnr`, and a unit test pins the inversion (T-RPT12-4).
4. `BR-4` **Item grouping inside an invoice.** `itms[]` has one entry per distinct tax rate on the document, not one per line: lines are summed by `rt`, and `num` is the sequential index within `itms` starting at 1. `txval` is Σ `taxable_value` for that rate, and the tax fields are Σ of the stored line taxes — never recomputed from the rate (RPT-07 BR-3).
5. `BR-5` **Rounding.** Every emitted number is `ROUND(value, 2)` half-up on the already-rounded sum of stored line values (RPT-07 BR-6 — no double rounding from a rate). `val` (invoice value) is `sales_document.grand_total`, which includes `round_off`; `txval` excludes it. The utility's own summary therefore reconciles with the screen because both start from the same stored numbers.
6. `BR-6` **`doc_issue` is built from the numbers actually allocated**, not from `platform_document_sequence.next_number`: `from` is the lowest and `to` the highest `number` of that nature in the period, `totnum` is the count of allocated numbers in the range inclusive, `cancel` is the count of `status='void'`, and `net_issue = totnum − cancel`. Because numbers are never reused (§21.3.1), a gap in the middle is a void and shows up in `cancel` — which is exactly what the table asks for.
7. `BR-7` **`desc` truncation.** HSN descriptions are truncated to 30 characters at a word boundary where possible; every truncation raises the `description_truncated` warning naming the HSN so the accountant can decide whether the shortened text is acceptable.
8. `BR-8` **`uqc` must be a valid Unit Quantity Code.** `inventory_unit.code` is seeded from the UQC list (§21.3.6), so the common path is valid; a tenant-created unit whose code is not in the UQC master raises the blocking issue `missing_uqc` with a link to fix the unit (INV-03) rather than silently emitting an invalid code.
9. `BR-9` **Omission over emptiness.** A tenant with no B2CL supplies emits no `b2cl` key at all. The utility treats an empty array inconsistently across versions; omitting is always safe.
10. `BR-10` **The file is never filed automatically and never leaves the tenant's control.** There is no portal API call, no GSP, no credential storage. DigiKhaato writes a file to `MEDIA_ROOT` and the user downloads it. This is stated on the screen and in the help article.
11. `BR-11` **Not emitted at Phase 2, and why:** `exp` (exports), `at`/`atadj` (tax on advances — RPT-07 BR-11), `txpd` (tax paid), `supeco` (e-commerce operator supplies), `sez` variants of `inv_typ`. Each is listed in the preview's "Not included" note with its reason, so an accountant who has such supplies knows immediately that this export is not sufficient for them and can fall back to manual entry for those tables.
12. `BR-12` **Worked example.** September 2026 with RPT-07's BR-14 documents produces:
```json
{ "gstin": "27AAPFU0939F1ZV", "fp": "092026", "version": "GST3.2.2", "hash": "hash",
  "b2b": [ { "ctin": "27AABCR1234M1Z5", "inv": [ { "inum": "INV/26-27/0041", "idt": "05-09-2026",
      "val": 1772.00, "pos": "27", "rchrg": "N", "inv_typ": "R",
      "itms": [ { "num": 1, "itm_det": { "rt": 5, "txval": 1688.57, "iamt": 0, "camt": 42.21, "samt": 42.22, "csamt": 0 } } ] } ] } ],
  "b2cs": [ { "sply_ty": "INTRA", "typ": "OE", "pos": "27", "rt": 5, "txval": 855.00, "iamt": 0, "camt": 21.38, "samt": 21.37, "csamt": 0 } ],
  "cdnr": [ { "ctin": "27AABCR1234M1Z5", "nt": [ { "ntty": "C", "nt_num": "CN/26-27/0003", "nt_dt": "22-09-2026",
      "p_gst": "N", "inum": "INV/26-27/0041", "idt": "05-09-2026", "val": 465.81,
      "itms": [ { "num": 1, "itm_det": { "rt": 5, "txval": 443.63, "iamt": 0, "camt": 11.09, "samt": 11.09, "csamt": 0 } } ] } ] } ],
  "hsn": { "data": [ { "num": 1, "hsn_sc": "1006", "desc": "Basmati Rice 5kg", "uqc": "NOS", "qty": 2,
      "rt": 5, "txval": 1688.57, "iamt": 0, "camt": 42.21, "samt": 42.22, "csamt": 0, "val": 1772.00 } ] },
  "doc_issue": { "doc_det": [ { "doc_num": 1, "docs": [ { "num": 1, "from": "INV/26-27/0041", "to": "INV/26-27/0042",
      "totnum": 2, "cancel": 0, "net_issue": 2 } ] } ] } }
```
   Note the credit note's positive `txval` inside `cdnr` (BR-3) against RPT-07's on-screen −₹443.63 in the rate view.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View the preview | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Generate the file | `reports.financial.read` + `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Download a previously generated file | `reports.export` + ownership (RPT-08 FR-7) | ✅ | ✅ | ❌ | ✅ |
| Fix a blocking issue (party GSTIN) | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Fix a blocking issue (invoice HSN) | `sales.invoice.write` (draft) or void+reissue (`sales.invoice.void`) | ✅ | ✅ | ❌ | ❌ |
| Change the schema version setting | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |

Phase-2 plan entitlement `reports.gstr1_json` gates the feature; unregistered and composition tenants never see the nav entry.

#### 13. Edge Cases
1. `EC-1` A B2B invoice whose party GSTIN belongs to a different state than the place of supply → allowed (the POS governs); no issue raised, because this is legitimate bill-to/ship-to.
2. `EC-2` A credit note issued in the period against an invoice from a **previous** period → emitted in `cdnr` with the original `inum`/`idt` pointing at the earlier document, which is exactly what the schema expects.
3. `EC-3` A credit note against a B2C **small** original → netted into `b2cs` (BR-2), never emitted as `cdnur`; if the netting drives a `b2cs` record negative, the record is still emitted with the negative `txval`, which the portal accepts as a downward adjustment.
4. `EC-4` Two invoices to the same GSTIN → one `b2b` entry with two objects in `inv[]`, not two `b2b` entries; the grouping is asserted in a test.
5. `EC-5` An invoice with lines at 5 % and 18 % → one `inv` object with two `itms` entries, `num` 1 and 2.
6. `EC-6` A document with `reverse_charge = true` on the sales side → emitted with `rchrg: "Y"` and excluded from the 3B-facing figures (RPT-07 EC-14), but still present in `b2b`.
7. `EC-7` A void that removed the only document of a nature → the `doc_issue` record still reports the series with `cancel` equal to `totnum` and `net_issue` 0.
8. `EC-8` Tenant GSTIN changed mid-year (a real, rare event) → the file uses the GSTIN on the documents' `supplier_gstin_snapshot`; if the period contains two different snapshots, generation is blocked with `mixed_supplier_gstin` and the message "This period has invoices under two GSTINs — file them separately".
9. `EC-9` An HSN of fewer than 4 digits on a tax invoice → blocking `missing_hsn` (the schema requires at least 4).
10. `EC-10` A free-text line with no item and no HSN on a tax invoice → blocking `missing_hsn` with a link to the document; on a bill of supply it is a warning only.
11. `EC-11` Quarterly filer (QRMP) selects a quarter → allowed when `gst.filing_frequency='quarterly'`; the `fp` is the **last month of the quarter**, per the utility's convention, and the preview states which month it wrote.
12. `EC-12` The schema self-check fails after a portal version bump that the bundled schema does not match → the job fails with `schema_validation_failed`, the previously generated file remains downloadable, and the setting allows pinning an older `version` while the bundled schema is updated.
13. `EC-13` 8,000 documents in a quarter → async path; the generated file is ~14 MB and is served through the standard download view.
14. `EC-14` The accountant downloads the file, then a colleague voids an invoice in the period → the preview's stale banner fires on the next visit; the already-downloaded file is not recalled (it cannot be), which is why the hash and timestamp are shown.

#### 14. API Requirements
- `GET /reports/gstr1-json?period=&preview=true` → `200` FR-1 preview object.
- `POST /reports/gstr1-json` `{ period, acknowledge_warnings }` → `200` file, or `202 { export_id }`; `409 gstr1_blocked` / `gstr1_warnings_unacknowledged` / `period_not_closed` / `gst_not_registered`; `403 permission_denied`.
- `GET /reports/exports/{id}` and `/download` (RPT-08) serve the generated file; `?pretty=true` on download returns the indented variant.
Both endpoints are **new** and are added to §22.11 as **CR-RPT-9**, together with the settings keys `gst.gstr1_json_version` and `gst.filing_frequency`, and four new error codes (`gstr1_blocked`, `gstr1_warnings_unacknowledged`, `period_not_closed`, `schema_validation_failed`) added to the §22.1 stable list. `Cache-Control: private, no-store` on the preview (it must never show a stale issue list). Frontend: `reportsService.getGstr1Preview(period)`, `.generateGstr1Json(payload)`, `gstr1JsonSlice`, `useExportPolling`.

#### 15. Database Impact
Reads exactly what RPT-07 reads — `sales_document`, `sales_document_line`, `platform_tenant`, `platform_tenant_setting`, `tax_rate`, `platform_document_sequence` — through the shared selector, plus `parties_party` for the fix links. Writes `reports_export` (`report_name='gstr1-json'`, `format='json'`, `params={period, version}`, `file_size_bytes`, the CR-RPT-4 columns) and `files_attachment` (`kind='export_file'`), plus `platform_job` for the async path and `platform_audit_log`. New index: none — the recommended `sales_document_line_doc_tax_idx` from RPT-07 already serves the aggregate. No schema change. The bundled schema files live in the source tree (`reports/schemas/`), not in the database.

#### 16. Audit Requirements
Generation is audited as a first-class financial act, not merely as an export: `action='gstr1.json_generated'`, `entity_type='reports_export'`, `entity_id`, `metadata = { period, fp, version, section_counts, totals, file_hash, warnings_acknowledged[] }`. Blocked attempts are audited too (`action='gstr1.json_blocked'`, `metadata.issues[]`) because a pattern of blocked attempts is a data-quality signal worth seeing in the audit view. Downloads inherit RPT-08's `report.export_downloaded` row. The `file_hash` in the audit row is the answer to "which file did we upload in October" months later. Retention follows the 7-year financial rule (§21.3.1).

#### 17. Notifications
Async generation reuses RPT-08's `export_ready` / `export_failed` notifications with the report name "GSTR-1 JSON". The RPT-07 filing reminder (8th of the month) gains a second action, "Generate JSON", deep-linking to `/reports/gst/gstr1-json?period={period}` — one notification, two useful buttons, rather than a second reminder. No SMS, no WhatsApp.

#### 18. Analytics / Event Tracking
`ub.reports.gstr1_preview_viewed { period, can_generate, blocking_count, warning_count, section_counts }`, `ub.reports.gstr1_blocked { issue_codes[] }`, `ub.reports.gstr1_issue_fix_clicked { issue_code }`, `ub.reports.gstr1_warnings_acknowledged { warning_codes[] }`, `ub.reports.gstr1_generated { period, async, document_count, file_size_bytes, version }`, `ub.reports.gstr1_regenerated { period, days_since_last }`, `ub.reports.gstr1_downloaded { period, pretty }`, `ub.reports.gstr1_stale_banner_shown { changed_documents }`.

#### 19. Security
Behind both `reports.financial.read` and `reports.export`. Tenant scope comes from the shared selector; the emitted `gstin` is read from `platform_tenant`, never from a request parameter, so a file can never be generated under another business's GSTIN. The file contains counter-party GSTINs, invoice numbers and amounts — business data rather than personal data, but commercially sensitive — and is therefore stored, served, audited and expired exactly like every other export (RPT-08 §19): random storage key under `MEDIA_ROOT/exports/<tenant_id>/`, authenticated download view, 7-day expiry, download audit. No portal credentials are ever requested, stored or transmitted (BR-10), which removes the largest security surface such a feature could have had. The schema self-check (FR-12) runs on the generated structure before it is written, so a malformed file never reaches disk. JSON is emitted by the standard library serializer with `ensure_ascii=False` and no user-controlled keys, so injection into the structure is not possible.

#### 20. Performance
The preview is the RPT-07 selector plus the exceptions pass — ~900 ms for a month at 2,000 documents, ~2.5 s for a quarter at 6,000 — and is not cached (§14), because a stale "ready to generate" would be worse than a slow one. Generation adds a serialisation pass that is linear in the number of invoices and HSN groups and writes with an incremental encoder, so a 14 MB file (EC-13) never exists in memory as a single string. The schema self-check walks the structure once. Above 5,000 documents the whole thing moves to the `platform_job` runner with `statement_timeout = 120s`. `EXPLAIN` coverage comes from RPT-07's CI assertions, since the queries are the same.

#### 21. Testing
- `T-RPT12-1` unit: BR-12 golden file — the generated JSON is compared byte-for-byte (after key-order normalisation) against a committed fixture, covering `b2b`, `b2cs`, `cdnr`, `hsn` and `doc_issue`.
- `T-RPT12-2` unit (**the central test**): every section total in the JSON equals the corresponding RPT-07 section total for the same period, across a 500-document randomised fixture.
- `T-RPT12-3` unit: schema validation — the golden file and 20 generated variants validate against `reports/schemas/gstr1_GST3.2.2.json`; a deliberately corrupted structure fails with `schema_validation_failed`.
- `T-RPT12-4` unit: BR-3 sign inversion — credit-note values are positive in `cdnr` while RPT-07's rate view shows them negative.
- `T-RPT12-5` unit: `itms` grouping by rate with sequential `num` (EC-5); two invoices to one GSTIN grouped under one `ctin` (EC-4).
- `T-RPT12-6` unit: `doc_issue` from/to/totnum/cancel/net_issue with voids in the middle of the series (BR-6, EC-7).
- `T-RPT12-7` unit: every blocking issue code fires on a purpose-built fixture and is absent on a clean one; every warning likewise.
- `T-RPT12-8` unit: B2CL threshold and unregistered-note netting inherited from RPT-07 produce the right sections (EC-3).
- `T-RPT12-9` unit: `desc` truncation at 30 characters raises the warning and truncates at a word boundary; invalid UQC blocks (BR-8).
- `T-RPT12-10` unit: empty sections are omitted, not emitted as `[]` (BR-9).
- `T-RPT12-11` unit: number formatting — money as JSON numbers with ≤ 2 decimals, dates as `DD-MM-YYYY`, `fp` as `MMYYYY`, `hash` literal.
- `T-RPT12-12` API: blocked → 409 with `details.issues[]`; unacknowledged warnings → 409; open period → 409 `period_not_closed`; composition → 409; staff → 403.
- `T-RPT12-13` API: sync generation below the threshold returns the file with the right `Content-Disposition`; above it returns 202 and the runner produces the same bytes (EC-13).
- `T-RPT12-14` API: mixed supplier GSTIN in a period blocks with `mixed_supplier_gstin` (EC-8); quarterly `fp` is the quarter's last month (EC-11).
- `T-RPT12-15` audit: generation writes `gstr1.json_generated` with the file hash; a blocked attempt writes `gstr1.json_blocked` with the issue codes.
- `T-RPT12-16` component: generate button disabled while blocked; warning checkbox gates it; stale banner appears after a document changes; raw preview renders the first 40 lines.
- `T-RPT12-17` E2E: issue the BR-14 documents with one missing party GSTIN → preview blocked → fix the party → preview ready → generate → download → the file parses and its `b2b[0].inv[0].val` equals 1772.00.
- `T-RPT12-18` perf: month ≤ 2 s preview / ≤ 4 s generate; quarter of 8,000 documents completes in the runner within 60 s.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given a closed month with issued invoices, when I generate the file, then I receive `gstr1_27AAPFU0939F1ZV_092026.json` containing `gstin`, `fp` `"092026"`, `version` and the populated sections, and it loads into the GST Returns Offline Tool without a schema error.
- `AC-2` (US-2) Given a B2B invoice whose party has no GSTIN and a tax invoice line with no HSN, when I open the preview, then the Generate button is disabled, two blocking issues are listed with links to the party and the invoice, and a POST returns 409 `gstr1_blocked`.
- `AC-3` (US-3) Given a clean period, when I open the preview, then I see a card per emitted section with its record count and totals, and the totals equal the GST summary screen for the same period.
- `AC-4` (US-4) Given the BR-14 documents, when I compare the generated JSON with the GSTR-1 view, then `b2b` taxable ₹1,688.57, `b2cs` taxable ₹855.00 and `cdnr` taxable ₹443.63 match the screen, with the credit note positive in the JSON and negative in the rate view.
- `AC-5` (US-5) Given I generated a file and then a colleague voided an invoice in that period, when I return to the preview, then a banner says a document changed since generation, and regenerating produces a new file with a different hash.
- `AC-6` (US-6) Given the owner downloads the file, when they look at it, then its name carries the GSTIN and the period, and the page's caption tells them to upload it in the offline tool — not that the return has been filed.

#### 23. Dependencies
RPT-07 (the shared selector, the classification rules, the exception model — RPT-12 cannot ship before it), RPT-08 (job, storage, download, expiry, audit), SAL-02/SAL-04/SAL-05 (documents, credit notes, voids and their snapshots), PTY-02 (party GSTIN and `gst_registration`), INV-01/INV-03 (HSN and UQC units), PLT-04/PLT-05 (tenant GSTIN, `gst_type`, the two new settings keys), PLT-09 (audit), NTF-01 (async notifications and the filing reminder's second action), the bundled schema files `reports/schemas/gstr1_*.json`, CR-RPT-9 (endpoints, settings and error codes), Phase-2 plan entitlement `reports.gstr1_json`.

#### 24. Future Enhancements
GSTR-3B JSON on the same machinery (P3); GSTR-1 tables not yet emitted — exports (`exp`), SEZ `inv_typ` variants, tax on advances (`at`/`atadj`), e-commerce supplies (`supeco`) — each unlocked by the feature that creates the underlying data; IFF (Invoice Furnishing Facility) files for the first two months of a QRMP quarter; GSTR-2B JSON *import* and reconciliation against the purchase register (P3); e-invoice IRN generation, after which tables 4A and 9B are auto-populated on the portal and this export becomes a cross-check rather than the primary path (SAL-11, P3); direct filing through a GSP/ASP API with the credentials held by the tenant, which would finally close the loop but requires an ADR, a security review and a commercial agreement (Future); a signed manifest alongside the file so an external CA can verify it came from DigiKhaato unmodified.

---

## 17.11 Help & onboarding (HLP)

The `help` module (canon §0.3) is Phase 2 in its entirety. It exists because DigiKhaato asks a shopkeeper to change how they keep their books, and a product that changes a habit has to explain itself at the moment of doubt rather than in a manual nobody opens. Three features carry that load: **HLP-01** is the help centre — the library of articles, searchable in the mixed Hindi-English the target user actually types; **HLP-02** is contextual help — the "?" beside a field and the guided tours that walk a new owner through the four journeys that matter; **HLP-03** is what's new — the release-notes list that tells a returning user what changed.

Content is **global, not tenant-owned**: `help_article.tenant_id` is NULL (§21.9 reserves the column for partner overrides later), articles are versioned and published by Metis Labs, and every article exists in `en` and `hi`. Nothing in this module is a business record, so none of it is audited, none of it is exported, and none of it is gated by a permission codename — any authenticated member of an active tenant can read every article. What *is* recorded is which questions people ask and which answers failed them (`help_search_log`, `help_feedback`), because that is how the content gets better. The module is entitlement-gated only in the sense that a partner may white-label it (Part 24); it is never sold as a plan feature.

### HLP-01 — In-app help centre (Phase 2)

#### 1. Business Objective
Answer the user's question inside the app, in their own words, before they call the shop next door or give up. The help centre is a searchable library of short task-shaped articles organised by topic, with a search that understands "udhaar kaise likhe" as well as "how to record a credit sale", a FAQ for the twenty questions everyone asks, and a "was this helpful" signal on every article so the content team learns where the explanations fail. Measures: ≥ 60 % of help searches end in an article open (not an empty result); ≥ 70 % of opened articles are marked helpful; support contacts per 100 active tenants fall by ≥ 30 % within two months of launch; p95 search ≤ 300 ms; zero-result searches are reviewed weekly and drive the content backlog.

#### 2. User Personas
**OW** (primary — sets the business up and hits the unfamiliar concepts first), **ST** (primary — needs to be told how to do one task without asking the owner), **AC** (occasional — GST and export articles). Help is the one surface in the product with no role distinction: everybody sees everything.

#### 3. User Stories
1. `US-HLP01-1` As an owner I want to browse help by topic so that I can learn a whole area (billing, udhaar, stock) in order.
2. `US-HLP01-2` As a staff member I want to search in the words I use — "bill kaise banaye", "party add karna" — and find the right article so that I do not need to know the English term.
3. `US-HLP01-3` As an owner I want short articles with pictures of the actual screens so that I can follow along on my phone.
4. `US-HLP01-4` As a user I want to say whether an article helped so that the app stops showing me things that do not.
5. `US-HLP01-5` As a user I want a FAQ so that the common questions are one tap away without searching.
6. `US-HLP01-6` As a user I want related articles at the end so that I can keep going after the first answer.
7. `US-HLP01-7` As a user I want help in Hindi so that I am not reading English while working.

#### 4. Functional Requirements
1. `FR-1` `GET /help/articles?q=&topic=&screen_id=&locale=&limit=&cursor=` returns article summaries `{ slug, title, excerpt, topic, tags[], locale, reading_minutes, updated_at, score }`. Without `q` it lists by topic and `sort_order`; with `q` it searches per FR-4.
2. `FR-2` `GET /help/articles/{slug}?locale=` returns the full article `{ slug, locale, title, body_md, topic, tags[], related[] (resolved to summaries), screen_ids[], version, published_at, updated_at, helpful_count, not_helpful_count, feedback_given: true|false }`.
3. `FR-3` `GET /help/topics?locale=` returns the topic tree `{ code, name, description, icon, article_count, articles[] (summaries, ordered) }`. Topics at launch: `getting-started`, `parties-and-udhaar`, `billing-and-gst`, `stock`, `payments-and-upi`, `purchases-and-expenses`, `reports`, `team-and-settings`, `whatsapp-and-sharing`, `troubleshooting`.
4. `FR-4` **Search** matches, in this order of contribution to `score`: exact slug or title match; title trigram similarity; tag exact match; **synonym expansion** (FR-5); body trigram similarity. Results are ranked by score, capped at 20, and a `q` shorter than 2 characters returns the topic list instead of an error.
5. `FR-5` **Hinglish synonym expansion.** A curated synonym map translates the vernacular the user types into the canonical terms the articles use, before the query hits the index. The map is global content, stored in `help_synonym` (`term`, `maps_to text[]`, `locale`, `is_active`) and seeded from canon §0.2's vernacular mapping plus the search-log backlog. Launch entries include: udhaar/udhar/उधार → credit, ledger, khata; khata/खाता → ledger, statement; naam → you gave, debit; jama/जमा → you got, payment received; baaki/बाकी → balance, outstanding; hisaab/हिसाब → statement, account; bill banao/banana → create invoice; kachha bill → estimate, quotation; pakka bill → tax invoice; party → customer, supplier; maal → item, stock, goods; kharcha/खर्च → expense; vasooli → collection, receivable; paisa aaya → payment received; stock khatam → out of stock; GST bharna → GST return, GSTR-1; whatsapp bhejo → share on WhatsApp. Expansion is additive: the original term is always still searched, so a user who types the English word is never penalised.
6. `FR-6` **Transliteration tolerance.** Devanagari input is matched against both the `hi` and `en` article sets, and common Roman-Hindi spelling variants are normalised before lookup (`udhaar`/`udhar`/`udharr`, `hisaab`/`hisab`, `paisa`/`paise`) by a small normalisation table in the same `help_synonym` content, not by a fuzzy library (ADR-021).
7. `FR-7` **Article body** is Markdown (`body_md`) rendered client-side by a small in-house renderer supporting headings, paragraphs, bold, italics, ordered and unordered lists, inline code, links, images, callouts (`> [!note]`, `> [!warning]`) and a step block — the exact subset the content style guide permits, so no third-party Markdown dependency is added. Images are `files_attachment` URLs of real product screenshots, served at two widths.
8. `FR-8` **FAQ** is a pinned topic (`code='faq'`) whose articles are rendered as an accordion (`MLAccordion`-style, built from `MLCollapsible`) on the help home rather than as separate pages, because a FAQ answer that costs a navigation is not a FAQ answer.
9. `FR-9` **Feedback.** `POST /help/articles/{slug}/feedback` `{ helpful: true|false, comment?: string }` writes a `help_feedback` row. After a `false`, the UI reveals an optional one-line "What were you looking for?" field and a link to support (partner `support_contact` from `platform_partner`). One feedback per user per article per `version`; a re-vote replaces the previous row.
10. `FR-10` **Search logging.** Every executed search writes a `help_search_log` row `{ tenant_id, user_id, query_raw, query_expanded, locale, result_count, clicked_slug, screen_id }`; the click is patched onto the row when a result is opened. Zero-result queries are the content backlog.
11. `FR-11` **Offline/empty-network behaviour:** the twelve most-opened articles per locale are cached in the PWA's cache storage on first visit, so the help centre works on a dead network at the counter. Search falls back to title-only matching over the cached set with a banner "Showing saved help — connect to search everything".
12. `FR-12` **Entry points:** the sidebar "Help" item, the `UbHelpHint` "?" on any screen (HLP-02 supplies `screen_id`, and the drawer lists that screen's articles first), the empty states (each `UbEmptyState` carries a help link per §17.0.3), and a global keyboard shortcut `?` on desktop.
13. `FR-13` Pages: `app/(app)/help/page.tsx` → `<HelpHomePageContent/>` (search, topics, FAQ accordion, "Popular right now"), `app/(app)/help/[slug]/page.tsx` → `<HelpArticlePageContent/>`, and `app/(app)/help/search/page.tsx` → `<HelpSearchPageContent/>` (URL-synced `?q=`).

#### 5. Non-Functional Requirements
p95 search ≤ 300 ms and article fetch ≤ 150 ms (content is small, global and cacheable); `Cache-Control: public, max-age=300, stale-while-revalidate=3600` on articles and topics since nothing in them is tenant data. Articles target a reading level of class 8, ≤ 400 words, ≤ 6 steps per procedure. Mobile-first: article body at 15 px `ds-body` with 1.65 line height (Devanagari matras need the room), images full-bleed to the 16 px gutter, sticky "Was this helpful?" bar at the bottom. Full `en` and `hi` parity is a launch gate — an article that exists only in English is not published. Screen-reader landmarks on the article (`article`, `nav` for related). No layout shift when images load (aspect ratios declared).

#### 6. User Flow
Anywhere → "?" or sidebar Help → help home → search "udhaar kaise likhe" → expansion adds credit/ledger/khata → three results, top one "उधार कैसे लिखें" → article with four steps and two screenshots → "Was this helpful?" → Yes → related articles → "पार्टी कैसे जोड़ें".
Alternate A (browse): help home → topic "Billing and GST" → nine articles in order → read the first.
Alternate B (FAQ): help home → FAQ accordion → "Can I edit a bill after issuing it?" → expands in place with a link to SAL-05.
Alternate C (failure): search "e-way bill" → zero results → empty state "We do not have an article on this yet" + the query logged + a link to the partner's support contact.
Alternate D (contextual): on the invoice screen, "?" → drawer listing that screen's articles first ("Make a tax invoice", "Choose the right tax rate") then a search box.

#### 7. UI Requirements
Help home (`<HelpHomePageContent/>`): `UbPageShell` + `UbSearchInput` (large, autofocused on desktop, placeholder "Search help — try 'udhaar kaise likhe'"), a topic grid of `MLCard`s with a `lucide-react` icon and article count, the FAQ accordion, and a "Popular right now" list. Article page: `UbPageHeader` with breadcrumb Help → Topic → Title, the rendered body, an inline `UbImagePreview` for screenshots, a callout component, a sticky `HelpFeedbackBar` (`MLCard` + two `MLButton`s), and a related-articles list built from `MLItem*`. Search page: results as `MLItem*` rows with the matched term highlighted and the topic as a `MLBadge`, plus a "Nothing matched" `UbEmptyState` carrying the support link. Contextual drawer: `UbDrawer` (right on desktop, bottom on mobile) with the same search and the screen's articles pinned. Feature-local components: `HelpSearch`, `HelpTopicGrid`, `HelpArticleBody` (the Markdown renderer), `HelpCallout`, `HelpFeedbackBar`, `HelpFaqAccordion`, `HelpRelatedList`, `HelpDrawer`. Redux: `helpSlice` (`query`, `results`, `topics`, `article`, `feedbackGiven`, `status`), thunks `searchHelp(q)`, `fetchHelpTopics()`, `fetchHelpArticle(slug)`, `sendHelpFeedback(payload)` in `helpThunk.ts` calling `helpService.*`.

#### 8. UX Requirements
Copy: "Help" = "मदद", "Search help" = "मदद खोजें", "Was this helpful?" = "क्या यह मददगार था?", "Yes" = "हाँ", "No" = "नहीं", "What were you looking for?" = "आप क्या ढूँढ रहे थे?", "Related" = "यह भी देखें", "Popular right now" = "अभी सबसे ज़्यादा पढ़े गए". Article titles are written as the user's question or the user's task ("उधार कैसे लिखें", "Make a tax invoice"), never as a noun phrase ("Ledger entries"). The locale follows the user's `platform_user.locale` and can be switched per article with a single control, because a user may prefer Hindi copy in the app and English help or the reverse. No modal ever holds an article: help opens in a drawer or a page, and the drawer preserves the screen behind it so the user can follow the steps live. Feedback is one tap and never blocks; the follow-up field is optional and the submit is implicit on blur.

#### 9. States
Initial (home, topics loaded) · Searching (debounced 300 ms, skeleton rows) · Results · Zero results (empty state + support link + the query echoed) · Article loading (skeleton paragraphs) · Article ready · Feedback given (bar collapses to "Thanks — noted") · Offline/cached (banner, reduced search) · Error (retry + `request_id`) · Locale missing (should never happen — the publish gate forbids it — but if it does, the other locale is shown with a notice "Available in English only").

#### 10. Validation Rules
| Field | Rule | Error |
|---|---|---|
| `q` | ≤ 100 characters; < 2 characters returns topics rather than an error | 400 `validation_error` "Search is too long" |
| `topic` | must be a known topic code | 400 "Unknown topic" |
| `locale` | ∈ `en,hi` | 400 "Unsupported language" |
| `slug` | exists and `status='published'` | 404 `not_found` (a draft article is invisible to the app) |
| feedback `helpful` | boolean, required | 400 "Tell us yes or no" |
| feedback `comment` | ≤ 500 characters, stripped of HTML | 400 "Comment is too long" |
| feedback rate | ≤ 20 per user per hour | 429 `rate_limited` |

#### 11. Business Rules
1. `BR-1` Articles are **global content**: `help_article.tenant_id IS NULL`, published by Metis Labs, versioned (`version`), and never editable by a tenant. A partner may later override branding and support contacts, not article text (§21.9).
2. `BR-2` Only `status='published'` articles are served. `draft` and `archived` are invisible to the app and 404 by slug, so an unfinished article can never leak through a guessed URL.
3. `BR-3` An article is publishable only when both `en` and `hi` rows exist for the slug at the same `version`. This is enforced by the content management command `publish_help_article`, not by the API, and is asserted in CI over the seed content.
4. `BR-4` Search scoring (normative weights): exact slug 100, exact title 90, title trigram `similarity × 60`, tag exact 40, synonym-derived match `× 0.8` of whatever it matched, body trigram `similarity × 25`. Ties break by `helpful_count DESC`, then `updated_at DESC`. The weights live in one constant so they can be tuned from the search-log evidence.
5. `BR-5` Synonym expansion never *replaces* the query; the expanded query is `original OR synonym1 OR synonym2 …`, and `query_expanded` is logged so the map's effect is measurable.
6. `BR-6` `helpful_count` and `not_helpful_count` are denormalised counters on `help_article`, recomputed nightly from `help_feedback` by `manage.py recalc_help_counters`; they are display-only and never drive ranking beyond the tie-break in BR-4.
7. `BR-7` Feedback is **per user per article per version**: publishing a new version resets the question, because a rewritten article deserves a fresh verdict. `U(article_id, user_id, version)` enforces it and a re-vote updates the row.
8. `BR-8` `help_search_log` retains 180 days (the same window as notifications, §21.3.2) and stores the raw query. Queries are business questions, not personal data, but the raw text is still treated as user content: it is never rendered back to another user, and the weekly content review works from aggregates.
9. `BR-9` Reading time = `CEIL(word_count / 180)` minutes, computed at publish and stored, so the list does not compute it per request.
10. `BR-10` `related[]` is authored, not inferred — the content team lists the slugs. An inferred "related" list that gets it wrong is worse than none, and the corpus is too small for the inference to be good.
11. `BR-11` `screen_ids[]` maps an article to the screens where it is contextually relevant (HLP-02 consumes it). One article may serve several screens; one screen may have several articles, ordered by their position in the array.
12. `BR-12` **Worked example.** A staff member types `udhaar kaise likhe`. Normalisation maps `udhaar` → `udhaar` (canonical Roman form) and `kaise likhe` is stopword-stripped to `likhe` → no synonym. Expansion turns the query into `udhaar OR credit OR ledger OR khata OR likhe`. Scores: article `record-a-credit-sale` (title "उधार कैसे लिखें", tags `udhaar, credit, ledger`) scores 90 (exact title in `hi`) + 40 (tag) = 130; `party-statement` scores 40 (tag `khata`) × 0.8 = 32; `what-is-udhaar` scores 90 × 0.8 = 72 via synonym. Result order: `record-a-credit-sale`, `what-is-udhaar`, `party-statement`. The search log records `query_raw='udhaar kaise likhe'`, `query_expanded='udhaar|credit|ledger|khata|likhe'`, `result_count=3`, and `clicked_slug='record-a-credit-sale'` when the user taps.

#### 12. Permissions
No permission codename gates any part of this feature. Every authenticated member of an active tenant may list topics, search, read any published article and leave feedback, regardless of role — a staff member who cannot see a report can still read the article about it, and withholding an explanation from somebody would serve nobody. Unauthenticated access is refused (the help centre lives inside the app shell and its content references in-product screens), with the single exception of Phase-3 public help pages for marketing, which are out of scope here. Content authoring is not a tenant-facing capability at all: articles are written and published through management commands by Metis Labs, so there is no authoring permission, no authoring UI and no attack surface for content injection.

#### 13. Edge Cases
1. `EC-1` A search matching nothing → zero-result empty state, the query logged, the partner's `support_contact` shown (phone/WhatsApp/email from `platform_partner.support_contact`), and — if the query matches a known-but-unbuilt feature (`e-way bill`, `bank reconciliation`) — a line saying the feature is not available yet rather than implying the article is missing.
2. `EC-2` A slug that existed and was archived → 404 with a soft landing: the topic page for the article's former topic, not a bare error.
3. `EC-3` A user switches locale mid-article → the same slug is re-fetched in the new locale and the scroll position is preserved by heading anchor, not by pixel offset.
4. `EC-4` An article references a module the tenant has disabled (a stock article for a service business) → shown, with a small notice "This is about Stock, which is turned off for your business" and a link to PLT-06.
5. `EC-5` A screenshot is stale after a UI change → the content version is bumped, feedback resets (BR-7), and the stale image is the content team's problem, not a code path; an `image_version` field is deliberately not added.
6. `EC-6` Two users on the same device (shared login, EC-7 of RPT-11) → feedback is per `platform_user`, so the shared account votes once; acceptable.
7. `EC-7` A user searches in Devanagari for an article whose title is Roman ("GST summary") → transliteration tolerance plus tags carry it; the tag set on every article includes both scripts for its key terms, which is a content rule, not a code rule.
8. `EC-8` Very long query (a pasted error message) → truncated at 100 characters with the tail ignored, logged in full up to 500 characters for the backlog.
9. `EC-9` Offline with no cached articles (first-ever visit is offline) → the help home shows the offline empty state with the support phone number, which is the one thing worth having without a network.
10. `EC-10` A user taps "No, this did not help" on five articles in a session → after the third, the follow-up field is replaced by a direct "Talk to support" card, because continuing to ask a frustrated person to write feedback is bad manners.
11. `EC-11` Feedback submitted twice quickly (double tap) → idempotent by `U(article_id, user_id, version)`; the second write updates rather than duplicating.
12. `EC-12` A synonym maps a term into a word that appears in dozens of article bodies (`bill`) → the body-trigram weight (25) keeps it from dominating, and the synonym map deliberately maps to *tags and titles* vocabulary rather than to common body words.

#### 14. API Requirements
`GET /help/articles?q&topic&screen_id&locale&limit&cursor` → `{ data: summaries[], meta: { next_cursor, has_more, query_expanded, result_count } }`. `GET /help/articles/{slug}?locale` → the FR-2 object; 404 for unpublished. `GET /help/topics?locale` → the FR-3 tree. `POST /help/articles/{slug}/feedback` `{ helpful, comment? }` → `201 { data: { recorded: true } }`; 429 on abuse. `POST /help/search-log/{id}/click` `{ slug }` → `204`, patching the click onto the logged search (the search response returns `meta.search_log_id`). §0.8 lists only `GET /help/articles (P2)`; the topics, article-detail, feedback and click endpoints are added as **CR-HLP-1**. Auth: standard bearer/cookie; tenant context is used only for logging, never for filtering content. `Cache-Control: public, max-age=300, stale-while-revalidate=3600` on GETs (content is global, so a shared cache is safe and deliberate); `no-store` on the POSTs. Frontend: `helpService.search()`, `.getArticle()`, `.getTopics()`, `.sendFeedback()`, `.logClick()`; `helpSlice`; the service lives in `src/modules/DigiKhaato/features/help/api/helpService.ts` per §0.10.

#### 15. Database Impact
Reads and writes the three Part-21 help tables. `help_article` (§21.3.11): `slug`, `locale`, `title`, `body_md`, `topic`, `tags text[]`, `related text[]`, `screen_ids text[]`, `status`, `version`, `published_at` — extended by **CR-HLP-2** with `excerpt varchar(240)`, `reading_minutes smallint`, `sort_order smallint`, `helpful_count int NN default 0`, `not_helpful_count int NN default 0`, `word_count int`; `U(slug, locale, version)`, `IX(status, topic, sort_order)`, GIN trigram on `title` and `body_md`, GIN on `tags` and `screen_ids`. `help_feedback`: `article_id`, `article_version`, `tenant_id`, `user_id`, `helpful boolean`, `comment varchar(500) NULL`, `created_at`; `U(article_id, user_id, article_version)`, `IX(article_id, created_at DESC)`. `help_search_log`: `tenant_id`, `user_id`, `query_raw varchar(500)`, `query_expanded varchar(1000)`, `locale`, `result_count smallint`, `clicked_slug varchar(120) NULL`, `screen_id varchar(64) NULL`, `created_at`; `IX(created_at DESC)`, `IX(result_count) WHERE result_count = 0` (the zero-result backlog is a single indexed scan). New table **`help_synonym`** (CR-HLP-2): `id`, `term varchar(60)`, `maps_to text[]`, `locale varchar(8) NULL` (NULL = both), `kind varchar(12)` (`synonym`, `normalise`), `is_active boolean`; `U(term, locale)`. All four are global (`tenant_id` NULL on articles and synonyms) and seeded by idempotent management commands per §21.8, never by migrations.

#### 16. Audit Requirements
Not applicable — reading help is not a business action and nothing in this feature changes a business record. Content publication happens outside the tenant-facing system through `publish_help_article`, which writes a platform-level `platform_audit_log` row (`tenant_id` NULL, `actor_type='super_admin'`, `action='help_article.published'`, `metadata = { slug, locale, version }`) so the content history is traceable, but no tenant audit row is ever written by this feature.

#### 17. Notifications
None. Help is pull, never push. A new article does not raise a notification; what's new (HLP-03) is where changes are announced, on the user's own schedule.

#### 18. Analytics / Event Tracking
The help module uses the `ub.help.*` namespace rather than `ub.reports.*`: `ub.help.opened { from: 'sidebar'|'hint'|'empty_state'|'shortcut'|'tour', screen_id }`, `ub.help.searched { query_length, expanded, result_count, locale }`, `ub.help.search_zero_result { query_raw }`, `ub.help.result_clicked { slug, position, score }`, `ub.help.article_viewed { slug, locale, from, reading_minutes }`, `ub.help.article_completed { slug, scroll_pct }`, `ub.help.feedback { slug, helpful, has_comment }`, `ub.help.related_clicked { from_slug, to_slug }`, `ub.help.faq_expanded { slug }`, `ub.help.support_contact_clicked { channel, from: 'zero_result'|'negative_feedback' }`, `ub.help.locale_switched { from, to }`, `ub.help.offline_fallback_shown {}`.

#### 19. Security
Content is global and read-only to the app, so there is no tenant-isolation surface on the read path; the only tenant-scoped writes are `help_feedback` and `help_search_log`, both keyed by `tenant_id` and `user_id` from the token. `body_md` is authored by Metis Labs and rendered by the in-house renderer with an explicit allow-list of node types — raw HTML in Markdown is **not** rendered, and link `href`s are restricted to `https:`, in-app routes and `tel:`/`mailto:`, so a compromised content pipeline cannot inject script into every tenant's app. Feedback comments are stripped of markup, length-capped and never displayed to another user. Search queries are parameterised; the trigram operators take bound parameters and `topic`/`locale` are whitelisted. Rate limits: 60 searches per user per minute and 20 feedback writes per hour. The public cache headers are safe precisely because no response on this path contains tenant data — a fact asserted by a test that fails if a help serializer ever gains a tenant-scoped field.

#### 20. Performance
The corpus is small (low hundreds of articles) and global, so the whole search runs as one statement over a GIN-trigram-indexed table with no tenant predicate, typically ≤ 40 ms; the 300 ms budget is dominated by the network. Topic and article responses are cacheable by the CDN and the browser for 5 minutes with a 1-hour stale-while-revalidate window, so a returning user pays nothing. Synonym expansion happens in Python against an in-process dictionary refreshed every 10 minutes from `help_synonym`, not by a join per query. The twelve most-opened articles per locale are precomputed nightly by `manage.py refresh_help_popular` and are what FR-11 caches offline. `help_search_log` writes are fire-and-forget within the same transaction but never block the response on failure (a logging error must not break a search). Counters are recomputed nightly rather than incremented per vote, so feedback writes take no lock on the article row.

#### 21. Testing
- `T-HLP01-1` unit: BR-12 worked example — scores, order and the logged `query_expanded` asserted exactly.
- `T-HLP01-2` unit: synonym expansion is additive (the original term still matches) and case/script-insensitive; normalisation handles `udhar`/`udhaar`/`udharr`, `hisab`/`hisaab`.
- `T-HLP01-3` unit: scoring weights and tie-breaks (BR-4) over a fixture corpus of 40 articles.
- `T-HLP01-4` unit: `q` of 1 character returns topics, not an error; `q` of 200 characters truncates at 100 and logs 500.
- `T-HLP01-5` unit: Markdown renderer — every permitted node renders, raw HTML is escaped, a `javascript:` href is dropped, an unknown node type is ignored rather than crashing the page.
- `T-HLP01-6` unit: reading time and excerpt computed at publish; `publish_help_article` refuses a slug missing its `hi` counterpart (BR-3).
- `T-HLP01-7` API: unpublished slug → 404; archived slug → 404; published → 200 with `related[]` resolved to summaries.
- `T-HLP01-8` API: feedback idempotency per `(article, user, version)`; a re-vote updates; a new version re-asks (BR-7).
- `T-HLP01-9` API: response headers are `public` on GETs and no help serializer exposes a tenant-scoped field (the isolation assertion in §19).
- `T-HLP01-10` API: search-log row written with `query_raw`, `query_expanded`, `result_count`; the click patch sets `clicked_slug`.
- `T-HLP01-11` API: rate limits — 61st search in a minute and 21st feedback in an hour both 429.
- `T-HLP01-12` component: search debounce 300 ms; zero-result state shows the query and the support contact; negative feedback reveals the follow-up and, after three, the support card (EC-10); the feedback bar collapses after voting.
- `T-HLP01-13` component: locale switch re-fetches and preserves the heading anchor (EC-3); disabled-module notice renders (EC-4).
- `T-HLP01-14` component: offline fallback banner and title-only search over the cached set (FR-11, EC-9).
- `T-HLP01-15` E2E: from the invoice screen tap "?" → drawer lists that screen's articles first → open one → mark it helpful → related article opens → the search log shows both events.
- `T-HLP01-16` content: every seeded article has `en` and `hi`, a topic, at least two tags in both scripts, an excerpt, and every `related` slug resolves (a CI test over the content seed, not over code).

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given the help home, when I tap the topic "Billing and GST", then I see its articles in the authored order with a count matching the topic card.
- `AC-2` (US-2) Given I type "udhaar kaise likhe", when the search runs, then "उधार कैसे लिखें" is the first result, "What is udhaar?" is second, and the expanded query recorded in the log contains credit, ledger and khata.
- `AC-3` (US-3) Given I open an article on my phone, when it renders, then it is under 400 words, its steps are numbered, its screenshots are full-bleed to the 16 px gutter, and nothing shifts as the images load.
- `AC-4` (US-4) Given I tap "No" on "Was this helpful?", when the follow-up appears, then I can write one line, it is saved against that article version, and the bar collapses to "Thanks — noted".
- `AC-5` (US-5) Given the help home, when I tap a FAQ question, then the answer expands in place without a navigation, and its link to the related feature works.
- `AC-6` (US-6) Given I reach the end of an article, when I look below the feedback bar, then I see the authored related articles, and tapping one opens it.
- `AC-7` (US-7) Given my locale is `hi`, when I open any article, then its Hindi version loads, and a single control switches that article to English without changing my app language.

#### 23. Dependencies
PLT-01/PLT-02 (authenticated session and active tenant for logging), PLT-06 (enabled modules, for EC-4's notice), PLT-03 (partner `support_contact` shown on failure paths), HLP-02 (supplies `screen_id` and consumes `screen_ids[]`), HLP-03 (linked from the help home), NTF-01 (not used — stated as a deliberate non-dependency), the content seed and the management commands `seed_help_content`, `publish_help_article`, `recalc_help_counters`, `refresh_help_popular`, the PWA service worker (ADR-020) for FR-11, CR-HLP-1 (endpoints), CR-HLP-2 (table columns and the new `help_synonym` table).

#### 24. Future Enhancements
Video walkthroughs (60–90 seconds, one per tour) hosted as attachments rather than embedded from a third party; partner-authored articles layered over the global set using the `tenant_id`/`partner_id` override reserved in §21.9; a "contact support" form that attaches the last search, the current screen and the request id so the support conversation starts informed; article usefulness ranking driven by the feedback and click-through data rather than by authored `sort_order`; more locales (Marathi, Gujarati, Tamil) once the UI locale set grows; an in-app changelog-to-article link so HLP-03 entries point at the article that explains the change; semantic search over embeddings if the corpus outgrows trigram matching — explicitly deferred, since a few hundred articles do not need it and it would breach ADR-021; a public, unauthenticated help site sharing the same content for marketing and SEO (Phase 3).

---

### HLP-02 — Contextual help & tours (Phase 2)

#### 1. Business Objective
Put the explanation where the confusion is. Two mechanisms do it: a **"?" on every screen and beside every field whose meaning is not obvious**, opening the help drawer already filtered to that screen; and **four guided tours** that walk a new owner through the four journeys that decide whether DigiKhaato sticks — make a bill, keep udhaar, manage stock, get paid. HLP-01 is the library; HLP-02 is the delivery, and it is the difference between content that exists and content that is read. Measures: ≥ 50 % of new tenants complete at least one tour in their first week; tenants completing the "First bill" tour reach their first issued invoice ≥ 2× more often than those who skip it; help-drawer opens per session ≥ 0.4 in week one and ≤ 0.1 by week four (the content should make itself unnecessary); tour abandonment at any single step ≤ 20 % — a step that loses more than a fifth of people is a product defect, not a content defect.

#### 2. User Personas
**OW** (primary — the person being onboarded), **ST** (secondary — sees the "?" everywhere and the two tours relevant to counter work), **AC** (contextual help only; tours are not offered, since an accountant arrives knowing what a credit note is).

#### 3. User Stories
1. `US-HLP02-1` As an owner I want a "?" on each screen so that I can get help about exactly what I am looking at.
2. `US-HLP02-2` As an owner I want a short explanation beside confusing fields — place of supply, reverse charge, reorder level — so that I do not have to leave the form.
3. `US-HLP02-3` As a new owner I want a guided tour that walks me through making my first bill so that I succeed on the first attempt.
4. `US-HLP02-4` As a new owner I want tours for udhaar, stock and getting paid so that I learn the whole product in small pieces.
5. `US-HLP02-5` As a user I want to pause a tour and pick it up later so that a customer walking in does not cost me the lesson.
6. `US-HLP02-6` As a user I want to replay or skip tours so that the app never nags me.
7. `US-HLP02-7` As a staff member I want the same "?" help so that I can learn my job without interrupting the owner.

#### 4. Functional Requirements
1. `FR-1` **Screen registry.** Every route declares a stable `screen_id` (`dashboard`, `parties.list`, `parties.detail`, `ledger.entry.new`, `sales.invoice.new`, `sales.invoice.detail`, `items.list`, `items.new`, `stock.adjust`, `payments.new`, `reports.gst`, `settings.business`, …) in one constant file `features/help/constants/screenIds.ts`. `UbPageShell` reads it from context and passes it to the help affordances. A route without a `screen_id` fails a lint rule.
2. `FR-2` **Screen-level "?"** sits in `UbPageHeader`'s action slot as an `MLIconButton`. Tapping it opens the HLP-01 `HelpDrawer` with `?screen_id=` so that screen's articles (`help_article.screen_ids @> ARRAY[screen_id]`) are listed first, followed by the search box and the topic list.
3. `FR-3` **Field-level hints** use the existing `UbHelpHint` (`MLTooltip` on desktop hover/focus, `MLPopover` on mobile tap — a tooltip that needs a hover is useless on a phone). Content comes from i18n keys `help.hint.<screen_id>.<field>` in `en.json`/`hi.json`, not from the database, because a hint is one sentence that must render instantly and offline. A hint may carry one "Read more" link to an article slug.
4. `FR-4` **Hint inventory (launch set, normative).** At minimum: `sales.invoice.new` — place of supply, reverse charge, tax-inclusive price, due date, round-off, bill of supply vs tax invoice; `ledger.entry.new` — you gave vs you got, collection date, credit limit; `items.new` — HSN/SAC, reorder level, track stock, tax rate, MRP vs selling price, opening stock; `parties.new` — GSTIN, credit days, credit limit, SMS consent; `payments.new` — split payment modes, allocation, advance; `stock.adjust` — reason codes; `settings.business` — GST type, financial year start, numbering prefix; `reports.gst` — each return coordinate (delegated to RPT-07's badges). Every hint exists in both locales; a missing `hi` key fails the i18n CI check.
5. `FR-5` **Four tours (normative definitions).**

| Code | Name | Audience | Steps | Completion event |
|---|---|---|---|---|
| `first-bill` | Make your first bill | OW, ST | 7: Bills nav → New bill → pick or add a party → add an item (with search/scan) → quantity and price → totals panel explained → Issue and share | an invoice reaches `issued` |
| `udhaar` | Keep your khata | OW, ST | 6: Parties nav → open a party → "You gave" → amount, date, note → "You got" with payment mode → statement and Remind | a `ledger_entry` is posted |
| `stock` | Set up your stock | OW | 6: Items nav → Add item → unit, price, tax → opening stock → reorder level → Low stock report | an item with `track_stock` and opening stock exists |
| `get-paid` | Get paid faster | OW | 5: UPI VPA in settings → QR on the bill → record a payment → allocation → share the receipt on WhatsApp | a `payments_payment` is recorded |

6. `FR-6` **Tour engine, in-house.** No `react-joyride` or equivalent (ADR-021). `TourProvider` holds the active tour in `helpTourSlice`; each step names an anchor by `data-tour-id` attribute, a placement, a title, a body (≤ 30 words), and an optional `advance_on` condition (`click`, `route`, `event`). `TourStepPopover` renders with `MLPopover` anchored to the element, plus a `TourSpotlight` overlay: a full-screen scrim with a cut-out over the anchor's bounding box, drawn as an SVG mask so no DOM surgery is needed on the underlying component.
7. `FR-7` **Anchoring rules:** a step whose anchor is missing (the element is not on screen, the module is off, the viewport is too small) is **skipped forward** to the next resolvable step rather than blocking; if no step resolves, the tour ends gracefully with "We will show you this later" and is marked `skipped`. The tour never blocks the app: the scrim is dismissible with Escape, a tap outside, or the X.
8. `FR-8` **Progress is server-side per user per tenant** so a tour resumes across devices: `help_tour_progress` (`user_id`, `tenant_id`, `tour_code`, `status ∈ {not_started, in_progress, completed, skipped}`, `current_step`, `started_at`, `completed_at`, `last_seen_at`). A `localStorage` mirror gives instant resume before the API responds, and the server value wins on conflict.
9. `FR-9` **Offering rules.** A tour is offered at most once automatically, from the dashboard's onboarding checklist (RPT-01 FR-9) and from the relevant screen's first visit, and never more than one offer per session. `status='skipped'` or `completed` suppresses the offer permanently. All four tours are always available on demand from Help → Tours, so "skip" costs nothing.
10. `FR-10` **Completion is behavioural, not click-based.** A tour is `completed` when its completion event fires (FR-5 column 5), not when the user reaches the last popover — finishing the narration without doing the thing is not learning. Reaching the last step without the event marks `in_progress` with `current_step = last`, and the final popover says "Now try it — we will mark this done when you do".
11. `FR-11` **Tour list page** `app/(app)/help/tours/page.tsx` → `<HelpToursPageContent/>`: four cards with a title, a one-line outcome, a duration estimate, a progress ring, and Start / Resume / Replay.
12. `FR-12` **Reduced motion and accessibility.** With `prefers-reduced-motion`, the spotlight does not animate between steps and the popover appears without the 10 px rise. Focus moves to each popover on step change, the popover is an `aria-dialog` with `aria-describedby` on its body, the spotlight cut-out is `aria-hidden`, and the anchored element receives `aria-describedby` pointing at the step body so a screen reader hears the instruction in place. Escape ends the tour and returns focus to the element that started it.

#### 5. Non-Functional Requirements
The tour engine adds ≤ 12 KB gzipped to the bundle and is code-split so it loads only when a tour starts; hints add nothing beyond i18n strings already shipped. Step transition ≤ 220 ms (`--dur-base`, `--ease-entrance`), spotlight repositioned on scroll and resize with a passive listener and `requestAnimationFrame`, never on a timer. Hints render instantly and work offline (they are i18n strings). Tour progress writes are debounced to one per step and are fire-and-forget — a failed progress write never interrupts the tour. Everything works at 320 px: the popover becomes a bottom sheet below `sm` with the anchor still spotlit. Full `en`/`hi` parity on every step title and body.

#### 6. User Flow
New owner finishes onboarding → dashboard checklist → "Make your first bill" → tour starts → spotlight on the Bills nav item → tap → step 2 on the New bill button → … → step 7 on Issue → the owner issues the invoice → completion event fires → the tour card shows Completed and the checklist ticks.
Alternate A (interrupted): at step 4 a customer arrives; the owner taps outside → "Paused — resume from Help → Tours" → next day, Resume opens step 4 on the right screen.
Alternate B (contextual): on the invoice form, the owner is unsure about Place of supply → taps the "?" beside the field → a one-sentence popover with "Read more" → article opens in the drawer over the form, the half-filled form untouched behind it.
Alternate C (screen help): on the GST summary, the header "?" → drawer listing that screen's three articles first.
Alternate D (skip): the owner taps Skip on the offer → no further offers for that tour, and the Tours page still shows Start.

#### 7. UI Requirements
Components (feature-local, in `features/help/components/`): `TourProvider`, `TourStepPopover`, `TourSpotlight`, `TourProgressDots`, `TourOfferCard`, `HelpTourList`; shared: `UbHelpHint` (already in the §17.0.2 vocabulary), `UbDrawer`, `MLPopover`, `MLIconButton`, `MLProgress`. Step popover anatomy: step counter ("3 of 7") in `ds-label`, title in `ds-h4`, body in `ds-body-sm`, an optional inline image, and three controls — Back (ghost), Skip tour (ghost, always present), Next (primary). Spotlight: `--overlay-scrim` at 72 % with an 8 px `--radius-md` cut-out and a 2 px `--accent` ring on the anchor. Tours page cards: `MLCard` with `MLProgress` ring, outcome line ("You will have issued a real bill"), duration ("about 2 minutes"), and the primary control. Offer: a dismissible `MLCard` on the dashboard, never a modal — an onboarding modal on a shopkeeper's first login at a busy counter is a hostile pattern. Redux: `helpTourSlice` (`activeTour`, `stepIndex`, `progress` per tour, `offersShownThisSession`), thunks `fetchTourProgress()`, `updateTourProgress({ tour_code, status, current_step })` in `helpThunk.ts`.

#### 8. UX Requirements
Copy: "Skip tour" = "छोड़ें", "Next" = "आगे", "Back" = "पीछे", "Resume" = "फिर से शुरू करें", "Replay" = "दोबारा देखें", "Paused" = "रुका हुआ", "{n} of {m}" = "{m} में से {n}". Step bodies are imperative and short — "Tap New bill", "Search the item or scan its barcode" — never explanatory paragraphs; the explanation lives in the article one tap away. Every step has a Skip; no tour ever has a step the user cannot leave. The offer appears once and, if dismissed, never returns. Tours are named by their outcome, not by their mechanism ("Get paid faster", not "Payments module tour"). The spotlight never covers the thing it is pointing at, and on mobile the sheet is positioned so the anchor stays visible above it. Nothing in a tour writes data on the user's behalf: the tour points, the user acts.

#### 9. States
Hint: idle · open (tooltip/popover) · with-article-link.
Screen help: closed · drawer open (screen articles) · searching · article open.
Tour: not started · offered · in progress (step n) · paused (dismissed mid-way) · anchor missing (auto-advance) · completed (event fired) · skipped · replaying · unavailable (module off — the card reads "Turn on Stock to take this tour" with a settings link).
Errors: progress write failed (silent; the local mirror carries on) · tour definition missing (the card is hidden rather than showing a broken tour).

#### 10. Validation Rules
| Field | Rule | Error |
|---|---|---|
| `tour_code` | ∈ `first-bill,udhaar,stock,get-paid` | 400 `validation_error` "Unknown tour" |
| `status` | ∈ `in_progress,completed,skipped` (`not_started` is never written) | 400 "Unknown status" |
| `current_step` | integer ≥ 0 and < the tour's step count | 400 "Step out of range" |
| transition | `completed` may not be set by the client for a tour whose completion event has not fired | 409 `tour_not_completed` "This tour completes when you make the bill" |
| `screen_id` (help drawer) | must be in the registry | ignored (the drawer falls back to unfiltered) rather than erroring — a bad screen id must never break a help affordance |
| rate | ≤ 120 progress writes per user per hour | 429 `rate_limited` |

#### 11. Business Rules
1. `BR-1` **`screen_id` is a build-time constant, not a runtime string.** The registry is the single source; articles reference it in `screen_ids[]` (HLP-01 BR-11), hints reference it in their i18n key, and analytics reference it in event properties. A CI test asserts that every `screen_ids[]` value in the content seed exists in the registry and that every registry entry is used by at least one route.
2. `BR-2` **Hints are i18n strings; articles are database rows.** The split is deliberate: a hint must render with no network and no query, so it ships in the bundle; an article is long, versioned and edited without a release, so it lives in the database. A hint is never longer than 140 characters — if it needs more, it needs an article.
3. `BR-3` **Tours are declarative data in the front end** (`features/help/constants/tours.ts`): `{ code, name, outcome, audience[], estimated_seconds, completion_event, steps: [ { anchor, placement, title_key, body_key, route?, advance_on } ] }`. They are not stored in the database at Phase 2 because a step's anchor is a front-end concern and a mismatch between a database step and a shipped component would be a silent breakage. Progress *is* stored server-side (FR-8).
4. `BR-4` **Completion events (normative binding):** `first-bill` ← the `ub.sales.invoice_issued` analytics event or a successful `POST /sales/invoices/{id}/issue` in this session; `udhaar` ← a successful `POST /ledger-entries`; `stock` ← a successful `POST /items` with `opening_stock` and `track_stock=true`; `get-paid` ← a successful `POST /payments` with `direction='in'`. The front end marks completion optimistically on the successful response and confirms with `POST /help/tours/{code}/progress`.
5. `BR-5` **Audience gating.** `first-bill` and `udhaar` are offered to owners and staff; `stock` and `get-paid` to owners and admins only. An accountant is offered none. A tour whose module is disabled is shown as unavailable rather than hidden, so the owner learns the capability exists (FR-9's "Turn on Stock" affordance).
6. `BR-6` **One offer per session, one automatic offer per tour, ever.** `offersShownThisSession` lives in the slice; the permanent suppression lives in `help_tour_progress.status`. There is no re-engagement campaign, no "you have not finished your tour" nudge and no email — the Tours page is always there for anyone who wants it.
7. `BR-7` **Progress conflict resolution:** on load, the server row wins unless the local mirror has a strictly greater `current_step` for the same `in_progress` tour, in which case the local value is pushed up. `completed` and `skipped` are terminal and never regress.
8. `BR-8` **Replay** sets `status='in_progress'`, `current_step=0` and clears `completed_at`, keeping `started_at` as the original — the history of having completed it once is preserved in the analytics, not in the row.
9. `BR-9` **Anchor resolution** runs on each step entry with a 500 ms grace (a route transition may still be rendering); if the anchor is still absent the step is skipped forward (FR-7) and `ub.help.tour_step_skipped` fires with the reason, which is how a broken anchor is discovered in production.
10. `BR-10` **Worked example.** A new owner starts `first-bill`. Step 1 anchors `data-tour-id="nav-bills"`; the owner taps it, `advance_on: 'route'` matches `/sales/invoices`, step 2 anchors `data-tour-id="new-bill-button"`. At step 4 the owner dismisses; `POST /help/tours/first-bill/progress { status: 'in_progress', current_step: 3 }` is written. Next day on another phone, the Tours page shows a 4-of-7 ring and Resume; resuming routes to `/sales/invoices/new` and opens step 4. The owner completes the form and issues the invoice; the issue response triggers `POST /help/tours/first-bill/progress { status: 'completed', current_step: 6 }`, the card turns to Completed with Replay, and the dashboard checklist's "Make first bill" item ticks.

#### 12. Permissions
No permission codename gates contextual help; the "?" and every hint are available to every authenticated member, exactly as in HLP-01 §12. Tours are gated only by **audience** (BR-5) and by module availability, which are product decisions rather than permissions: a staff member is offered `first-bill` because they will make bills, and is not offered `get-paid` because the UPI setting is in a screen they cannot open. A tour never leads a user to a screen or a control their role cannot use — a CI test walks every tour's steps against every role's permission set and fails if a step anchors an element that role would not see. Writing one's own `help_tour_progress` requires nothing beyond an authenticated session; reading or writing another user's progress is not possible through any endpoint.

#### 13. Edge Cases
1. `EC-1` The user rotates the phone or the keyboard opens mid-step → the spotlight recomputes on resize; if the anchor scrolls out of view the popover scrolls it back with `scrollIntoView({ block: 'center' })`.
2. `EC-2` A step's anchor is behind a closed accordion or a collapsed sidebar → the step definition names an `open_first` selector; the engine clicks it before anchoring. Where that is not possible, the step is skipped forward (BR-9).
3. `EC-3` The user navigates away mid-tour by a route the tour did not expect → the tour pauses rather than following; a "Resume tour" chip appears in the header for the rest of the session.
4. `EC-4` Two tabs open, the tour started in one → the second tab does not show it; progress is reconciled by BR-7 on next load.
5. `EC-5` The user completes the behaviour without ever starting the tour (a confident owner issues a bill on day one) → the tour is marked `completed` on the completion event even from `not_started`, and is never offered. Teaching somebody something they have already done is a small insult.
6. `EC-6` Module turned off mid-tour (an owner disables Stock in another tab) → the next step's anchor is missing → graceful end with the unavailable message.
7. `EC-7` `prefers-reduced-motion` → no spotlight animation, no rise; the step still highlights with the accent ring.
8. `EC-8` A very small viewport (320 × 568) where the popover would cover the anchor → the popover becomes a bottom sheet and the anchor is scrolled into the upper half.
9. `EC-9` A hint's i18n key is missing in `hi` → the CI check fails the build; at runtime the fallback is the `en` string rather than a raw key, so the worst case is English, never `help.hint.foo.bar`.
10. `EC-10` Progress endpoint returns 429 → writes are dropped silently and the local mirror carries the tour; nothing user-visible happens.
11. `EC-11` A staff member reaches a step whose control they lack permission for (a definition defect) → the CI test in §12 should have caught it; at runtime the anchor is missing and BR-9 skips forward.
12. `EC-12` The user taps "?" while a tour is active → the drawer opens over the tour, the spotlight dims, and closing the drawer returns to the same step.
13. `EC-13` A tour's completion event fires while the user is on a completely different screen (a colleague issued the bill) → completion is bound to the **acting user's own** successful request, not to a tenant-wide event, so a colleague's action never completes somebody else's tour.

#### 14. API Requirements
- `GET /help/tours` → `{ data: [ { tour_code, status, current_step, step_count, started_at, completed_at } ] }` for the calling user in the active tenant; tour definitions themselves are front-end constants (BR-3) and are not served.
- `POST /help/tours/{tour_code}/progress` `{ status, current_step }` → `200 { data: { tour_code, status, current_step } }`; `400` per §10; `409 tour_not_completed` when the client claims completion without the event; `429` on abuse.
- `GET /help/articles?screen_id=` (HLP-01 FR-1) is the contextual drawer's query — no new endpoint.
Both tour endpoints are new and are added as **CR-HLP-3**, together with the `help_tour_progress` table. `Cache-Control: private, no-store` (progress is per user and changes constantly). Auth: standard session; tenant from `tid`. Frontend: `helpService.getTours()`, `.updateTourProgress(code, payload)`; `helpTourSlice`; the completion hook `useTourCompletion(event)` is subscribed by the four features named in BR-4 so they do not need to know about tours beyond firing their own existing success action.

#### 15. Database Impact
New table **`help_tour_progress`** (CR-HLP-3): `id uuid PK`, `tenant_id uuid FK NN`, `user_id uuid FK NN`, `tour_code varchar(24) NN`, `status varchar(16) NN default 'in_progress'`, `current_step smallint NN default 0`, `started_at timestamptz NN`, `completed_at timestamptz NULL`, `last_seen_at timestamptz NN`, `created_at`, `updated_at`; `U(tenant_id, user_id, tour_code)`, `IX(tenant_id, tour_code, status)`. It is a tenant-scoped row because the same person may be at a different point in two businesses. Reads `help_article` (`screen_ids` GIN index, HLP-01 §15) for the contextual drawer. No other table is touched: hints are i18n strings, tour definitions are front-end constants, and nothing here is a business record. Seeded by nothing — rows are created on first interaction.

#### 16. Audit Requirements
Not applicable — no business record is created, read or changed. Tour progress is a personal UI state, deliberately kept out of `platform_audit_log`: auditing whether somebody watched a tutorial would be surveillance without a purpose, and §21.7 lists no such entity.

#### 17. Notifications
None, by explicit decision. An unfinished tour never produces a notification, a badge count, an email or a push. The only place an incomplete tour is visible is the dashboard's onboarding checklist (RPT-01 FR-9), which the user can dismiss, and the Tours page, which the user chooses to open. Nagging somebody about a tutorial is the fastest way to make them stop trusting the notification bell.

#### 18. Analytics / Event Tracking
`ub.help.hint_opened { screen_id, field, has_article_link }`, `ub.help.hint_article_clicked { screen_id, field, slug }`, `ub.help.screen_help_opened { screen_id, article_count }`, `ub.help.tour_offered { tour_code, surface: 'dashboard'|'screen_first_visit' }`, `ub.help.tour_started { tour_code, from: 'offer'|'tours_page'|'checklist' }`, `ub.help.tour_step_viewed { tour_code, step_index, step_anchor }`, `ub.help.tour_step_skipped { tour_code, step_index, reason: 'anchor_missing'|'module_off' }`, `ub.help.tour_paused { tour_code, step_index }`, `ub.help.tour_resumed { tour_code, step_index, hours_since_pause }`, `ub.help.tour_skipped { tour_code, step_index }`, `ub.help.tour_completed { tour_code, steps_viewed, seconds_elapsed, completed_without_starting }`, `ub.help.tour_replayed { tour_code }`. The step-level funnel is the report that finds the 20 %-abandonment defect named in §1.

#### 19. Security
Nothing in this feature reads or writes a business record, so the tenant-isolation surface is limited to `help_tour_progress`, which is scoped by `(tenant_id, user_id)` from the token on both read and write; there is no endpoint that accepts a `user_id`, so one member cannot read or alter another's progress. `tour_code` and `status` are whitelisted enums and `current_step` is range-checked against the server's known step count, so a crafted request cannot store arbitrary data. The spotlight overlay is rendered by the app itself over its own DOM — it never injects markup into other components and never reads their contents, so it cannot be used to exfiltrate a field's value. Hint text is i18n content shipped with the build, not user or content-team input at runtime, so there is no injection path. `prefers-reduced-motion` and focus management (FR-12) are accessibility requirements, but the focus trap is also a safety property: a scrim that captures clicks without capturing focus would let a user act blind.

#### 20. Performance
The tour engine is dynamically imported on first use and adds nothing to the initial bundle; hints are strings already in the loaded locale file. Anchor resolution is a single `document.querySelector` per step with a 500 ms grace, and repositioning is driven by `ResizeObserver` plus a passive `scroll` listener coalesced through `requestAnimationFrame` — no polling. The spotlight is one SVG element with a mask, so stepping does not reflow the page. Progress writes are one small POST per step, debounced 400 ms and fire-and-forget. `GET /help/tours` returns at most four rows and is fetched once per session. The contextual drawer reuses HLP-01's cached article queries, so opening the "?" on a screen visited before is instant.

#### 21. Testing
- `T-HLP02-1` unit: BR-10 worked example — step advance on route, pause writes `in_progress` with the right step, resume restores it, completion event writes `completed`.
- `T-HLP02-2` unit: BR-7 conflict resolution — a local step greater than the server's is pushed up; `completed` and `skipped` never regress.
- `T-HLP02-3` unit: anchor missing → skip forward with the reason event; all anchors missing → graceful end as `skipped` (FR-7, BR-9).
- `T-HLP02-4` unit: audience gating — an accountant is offered no tour; a staff member is offered `first-bill` and `udhaar` only (BR-5).
- `T-HLP02-5` unit: completion from `not_started` when the behaviour happens first (EC-5); completion bound to the acting user only (EC-13).
- `T-HLP02-6` component: `TourStepPopover` renders counter/title/body/controls, traps focus, closes on Escape and returns focus to the opener; `aria-describedby` is set on the anchor.
- `T-HLP02-7` component: `TourSpotlight` cut-out matches the anchor's bounding box after scroll and resize; `prefers-reduced-motion` removes the transition (EC-7).
- `T-HLP02-8` component: below `sm` the popover renders as a bottom sheet with the anchor scrolled into the upper half (EC-8).
- `T-HLP02-9` component: `UbHelpHint` opens on hover **and** focus on desktop and on tap on mobile; the "Read more" link opens the drawer without losing the form's state (Alternate B).
- `T-HLP02-10` API: `POST progress` validation table in §10 including `409 tour_not_completed`; another user's progress is unreachable (no parameter exists to request it).
- `T-HLP02-11` API: `GET /help/tours` returns exactly the four rows for the caller in the active tenant and different rows for the same user in a second tenant.
- `T-HLP02-12` integration (**the registry test**): every `screen_id` in the registry is used by a route; every `screen_ids[]` value in the content seed exists in the registry; every route rendered by `UbPageShell` declares one (BR-1).
- `T-HLP02-13` integration (**the permission walk**): for each tour and each role, every step's anchor corresponds to an element that role can see (§12).
- `T-HLP02-14` i18n: every tour step `title_key`/`body_key` and every hint key in the FR-4 inventory exists in both `en.json` and `hi.json`; a missing key fails the build (EC-9).
- `T-HLP02-15` E2E: run `first-bill` end to end on a seeded tenant — seven steps, an issued invoice, the card turning Completed, the checklist ticking.
- `T-HLP02-16` E2E: pause at step 4, reload in a different session, resume at step 4.
- `T-HLP02-17` perf: the tour chunk is ≤ 12 KB gzipped (a bundle-size assertion in CI) and is absent from the initial bundle.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given I am on the GST summary, when I tap the "?" in the header, then the help drawer opens listing that screen's articles first, followed by search.
- `AC-2` (US-2) Given I am filling a new invoice, when I tap the "?" beside Place of supply, then a one-sentence explanation appears in my language with a "Read more" link, and dismissing it leaves my half-filled form untouched.
- `AC-3` (US-3) Given I am a new owner on the dashboard, when I start "Make your first bill", then seven steps spotlight the real controls in order, each with Back, Next and Skip, and the tour is marked complete only once I have actually issued a bill.
- `AC-4` (US-4) Given Help → Tours, when I open it, then I see four cards — Make your first bill, Keep your khata, Set up your stock, Get paid faster — each with its outcome, duration and progress.
- `AC-5` (US-5) Given I am at step 4 and I tap outside, when I return the next day on another device, then the card shows 4 of 7 with Resume, and resuming opens step 4 on the right screen.
- `AC-6` (US-6) Given I tap Skip on an offered tour, when I continue using the app, then that tour is never offered again, and it is still available to start from Help → Tours.
- `AC-7` (US-7) Given I am a staff member, when I use any screen, then the "?" and every field hint work for me exactly as for the owner, and I am offered the bill and khata tours but not the stock or payment ones.

#### 23. Dependencies
HLP-01 (the drawer, the article query by `screen_id`, the `screen_ids[]` content field), PLT-01/PLT-02 (session and active tenant), PLT-06 (enabled modules, for tour availability), PLT-08 (roles, for audience gating and the permission walk), RPT-01 FR-9 (the dashboard onboarding checklist that offers tours), SAL-02, LED-01, INV-01 and PAY-01 (the four completion events in BR-4), `UbPageShell`/`UbPageHeader`/`UbHelpHint`/`UbDrawer` (§17.0.2), the i18n files `en.json`/`hi.json` and the i18n CI check, the `screenIds.ts` registry and the `tours.ts` definitions, CR-HLP-3 (two endpoints and the `help_tour_progress` table).

#### 24. Future Enhancements
Short screen-recorded videos per tour step, shipped as attachments rather than embedded from a third party; a fifth tour for GST filing once RPT-12 is in wide use; branching tours that adapt to the tenant's `business_type` (a service business should not be walked through barcodes); checklist-style progressive onboarding that unlocks features as they are learned; partner-authored tours for white-label deployments; in-product "what changed here" markers linking a screen to its HLP-03 release note; a tour authoring surface for the content team so steps stop being front-end constants (only once anchors are stable enough for a database definition to be safe); measuring time-to-first-bill against tour completion as a cohort metric in the analytics warehouse.

---

### HLP-03 — What's new (Phase 2)

#### 1. Business Objective
Tell users what changed, in their words, without interrupting them. DigiKhaato ships continuously; a shopkeeper who opens the app to find the bill screen rearranged and no explanation loses trust in the product. "What's new" is a reverse-chronological list of release notes written for shopkeepers rather than for engineers, filtered to the modules the tenant actually uses, with a quiet unread marker and a single "Got it" that clears it. It is also the honest place to announce that something was **fixed** — a product that only ever announces new features is read as a product that never has bugs, which nobody believes. Measures: ≥ 40 % of active users open a major release note within seven days of its publication; support contacts about "why did this change" fall to near zero after a UI change that carried a note; unread badge dismissal rate ≥ 80 % (an indicator that the marker is being read, not ignored); zero release notes published without both `en` and `hi`.

#### 2. User Personas
**OW** (primary — decides whether a change matters to the business), **ST** (sees notes for the modules they use), **AC** (cares most about GST and export changes). As with the rest of the help module, there is no role gate: what differs is which notes are *relevant*, not which are *permitted*.

#### 3. User Stories
1. `US-HLP03-1` As an owner I want a list of what changed recently so that I understand a screen that looks different today.
2. `US-HLP03-2` As an owner I want a quiet marker when there is something new so that I notice without being interrupted.
3. `US-HLP03-3` As an owner I want only the changes that affect the parts of the app I use so that I am not reading about stock when I have stock turned off.
4. `US-HLP03-4` As a user I want to know when something was fixed so that I stop working around a bug I already reported.
5. `US-HLP03-5` As a user I want a link from a release note to the help article so that I can learn the new thing properly.
6. `US-HLP03-6` As a user I want the notes in Hindi so that I actually read them.

#### 4. Functional Requirements
1. `FR-1` `GET /help/releases?locale=&since=&modules=&kind=&cursor=&limit=` returns release notes newest first: `{ version, released_on, title, summary, body_md, kind, modules[], is_major, related_articles[] (resolved summaries), image_url, locale }`. Default page 20, cursor pagination.
2. `FR-2` `kind ∈ { new, improved, fixed }` — exactly three, no more. A note carries one kind; a release with several changes is several notes sharing a `version`, which is what makes the list scannable.
3. `FR-3` **Relevance filtering.** By default the endpoint returns only notes whose `modules[]` intersects the tenant's `enabled_modules` (plus notes with an empty `modules[]`, which are product-wide). `?modules=all` returns everything, exposed in the UI as a "Show everything" toggle, so nothing is ever hidden without a way to see it.
4. `FR-4` **Unread state.** `GET /help/releases/unread-count` returns `{ count, latest_version, has_major }` computed from the user's `help_release_seen.last_seen_version` against the published set, already relevance-filtered. `POST /help/releases/seen` `{ version }` advances the marker to that version (never backwards).
5. `FR-5` **The marker is quiet.** A `MLBadge` dot on the sidebar "What's new" item and, for a `is_major` release only, a single dismissible `MLCard` strip on the dashboard: "DigiKhaato got better — see what's new". No modal, no takeover, no notification, no badge on the bell. The strip appears once per major version per user and is dismissed by reading the list or by tapping the X.
6. `FR-6` **Grouping.** The list groups by `version` with a date heading ("18 September 2026 · v1.7"), then by kind within the version in the order New → Improved → Fixed, each with its `UbStatusBadge` tone (info / default / success).
7. `FR-7` **Body** is the same Markdown subset and the same in-house renderer as HLP-01 FR-7, with the same allow-list. Notes are short by rule: `summary` ≤ 140 characters, `body_md` ≤ 120 words, at most one image.
8. `FR-8` **Article links.** `related_article_slugs[]` resolves to HLP-01 summaries rendered as "Learn how" links that open the help drawer over the list, so a note about a new feature leads directly into the instructions for it.
9. `FR-9` **Deep links.** Each note is addressable at `/help/whats-new#v1.7-<slug>` so support and the in-app strip can point at a specific note, and the anchor scrolls it into view with the accent ring used by HLP-02's spotlight.
10. `FR-10` Page `app/(app)/help/whats-new/page.tsx` → `<WhatsNewPageContent/>`; entry points are the sidebar item (with the dot), the help home ("What's new" card showing the latest three), the dashboard strip for major releases, and `GET /system/version`'s value shown in Settings → About, which links here.
11. `FR-11` **No unread state for a brand-new user.** A user whose first login is after version *v* has `last_seen_version = v` seeded on first access, so they start at zero unread rather than inheriting eighteen months of history — though the full list remains browsable.
12. `FR-12` **Offline:** the last fetched page is cached by the PWA (ADR-020) like HLP-01's popular articles, so the list opens without a network with a "Showing saved notes" banner.

#### 5. Non-Functional Requirements
p95 ≤ 200 ms for the list and ≤ 80 ms for the unread count (which is fetched on app load and must never be on the critical path — it is requested after first paint and its failure is silent). Content is global, so responses carry `Cache-Control: public, max-age=300, stale-while-revalidate=3600` for the list and `private, max-age=60` for the unread count. Full `en`/`hi` parity is a publish gate. The list renders at 320 px as a single column with the version heading sticky. Images declare aspect ratios so nothing shifts. The unread dot meets the 3:1 non-text contrast requirement and is accompanied by an accessible name ("3 new updates"), never by colour alone.

#### 6. User Flow
The owner opens the app → a quiet dot on the sidebar "What's new" → later, between customers, they tap it → the list opens grouped by version → the top group reads "New · GST summary now shows GSTR-1 table numbers" with a "Learn how" link → they read two notes, tap Got it → the dot clears → next release, the dot returns.
Alternate A (major release): the dashboard strip appears once → tapping it opens the list anchored at that version → dismissing it without opening also clears the strip but not the dot.
Alternate B (irrelevant module): a tenant with `inventory` off never sees stock notes; turning on "Show everything" reveals them with their module badge.
Alternate C (support): a support reply links `/help/whats-new#v1.7-gst-table-numbers` → the app opens the list scrolled and ringed on that note.
Alternate D (new user): first login after v1.7 → no unread, no strip, and the list shows the full history if they choose to browse.

#### 7. UI Requirements
`UbPageShell` + `UbPageHeader` (title "What's new" / "क्या नया है"; description "Recent changes to DigiKhaato"). Controls: `MLToggleGroup` "For my business" / "Everything" (FR-3), `MLSelect` kind filter, and a "Got it" primary button pinned to the header while unread notes exist. List: version group headings (`ds-h4` + `ds-caption` date), each note an `MLCard` with a kind `UbStatusBadge`, title (`ds-body-medium`), summary, optional image (`UbImagePreview`), rendered body, module `MLBadge`s, and the "Learn how" links. Dashboard strip: a dismissible `MLCard` using `UbStatusBanner`'s info tone. Help home card: the latest three titles with dates. Feature-local components: `WhatsNewList`, `ReleaseNoteCard`, `ReleaseVersionHeading`, `WhatsNewStrip`, `WhatsNewDot`. Redux: `whatsNewSlice` (`items`, `cursor`, `unreadCount`, `latestVersion`, `hasMajor`, `showEverything`, `status`), thunks `fetchReleases(params)`, `fetchUnreadCount()`, `markReleasesSeen(version)` in `helpThunk.ts` calling `helpService.getReleases()`, `.getReleaseUnreadCount()`, `.markReleasesSeen()`.

#### 8. UX Requirements
Copy: "What's new" = "क्या नया है", "New" = "नया", "Improved" = "बेहतर", "Fixed" = "ठीक किया", "Got it" = "समझ गया", "Learn how" = "कैसे करें", "For my business" = "मेरे काम का", "Everything" = "सब कुछ", "Showing saved notes" = "सेव किए गए अपडेट". Notes are written in the second person about the user's work, never about the codebase: "Your GST summary now tells you which return table each figure belongs to", not "Added `gstr1_table` to the GST summary serializer". A `fixed` note names the symptom the user saw, not the cause: "Bills sometimes showed the wrong due date after changing credit days — fixed". No version numbers in titles (they are in the heading), no emoji anywhere (§23.1), no marketing language, and no "we are excited to announce". The unread marker is a dot, never a count on the bell — the bell is for the user's business, and a product announcement is not the user's business.

#### 9. States
Initial (relevance-filtered, first page) · Loading (skeleton cards) · Ready · Unread (Got it visible, dot shown) · All read (Got it hidden, dot cleared) · Showing everything (toggle on, module badges emphasised) · Filtered by kind · Empty ("Nothing new since you last looked" — which is a good state, shown in success tone) · Empty for a brand-new user (FR-11: "You are up to date") · Offline/cached (banner) · Error (retry + `request_id`) · Deep-linked (anchored note ringed).

#### 10. Validation Rules
| Field | Rule | Error |
|---|---|---|
| `locale` | ∈ `en,hi` | 400 `validation_error` "Unsupported language" |
| `since` | a valid version string or ISO date | 400 "Invalid version or date" |
| `kind` | ∈ `new,improved,fixed` (comma list) | 400 "Unknown kind" |
| `modules` | `all` or a comma list of known module codes | 400 "Unknown module" |
| `limit` | ≤ 50 | 400 "Page size cannot be more than 50" |
| `version` (POST seen) | must be a published version | 400 "Unknown version" |
| `version` (POST seen) | must be ≥ the stored `last_seen_version` | ignored, `200` with the stored value — moving the marker backwards is never an error, just a no-op |
| rate | ≤ 60 seen-writes per user per hour | 429 `rate_limited` |

#### 11. Business Rules
1. `BR-1` Release notes are **global, published content** like articles: `tenant_id IS NULL`, authored by Metis Labs, with `status ∈ {draft, published, archived}` and both locales required at publish (mirroring HLP-01 BR-3). Only `published` notes are served.
2. `BR-2` **Versions are ordered by `released_on`, not by string comparison.** `version` is a display label (`v1.7`, `v1.7.2`); ordering, the unread computation and the `since` filter all use `released_on` and the surrogate `sort_seq` integer assigned at publish, so a version-numbering scheme change never breaks the list.
3. `BR-3` **Unread count** = the number of relevance-filtered published notes with `sort_seq > (SELECT sort_seq FROM the user's last_seen_version)`. `has_major` is true when any of them has `is_major`. Relevance filtering is applied **before** counting, so a dot never appears for a note the user will not be shown.
4. `BR-4` **The marker advances, never retreats** (BR-2's ordering, §10's no-op rule). "Got it" writes the current `latest_version`; opening the page does not, because scrolling past something is not reading it.
5. `BR-5` **Relevance** is `note.modules[] && tenant.enabled_modules` (array overlap) `OR note.modules = '{}'`. Plan entitlements are deliberately **not** used: a note about a Phase-2 feature the tenant's plan does not include is still shown when the module is enabled, because knowing the product has grown is legitimate, and the note links to the feature rather than to a paywall.
6. `BR-6` **One change, one note.** A release with a new report, an improvement and two fixes is four notes sharing a `version` and a `released_on`. This keeps each note scannable, each kind badge honest, and each deep link precise.
7. `BR-7` **`is_major` is rationed.** At most one note per version may be major, and a major note is the only thing that may raise the dashboard strip. The content rule is that `is_major` means "the user will notice this without being told" — a new module, a redesigned screen, a changed default. Everything else is ordinary.
8. `BR-8` **Fixed notes are published for user-visible defects only.** Internal fixes, refactors, dependency bumps and performance work that nobody felt do not appear; a changelog full of invisible changes trains people to stop reading it.
9. `BR-9` **No note is ever edited after publication** in a way that changes its meaning; a correction is a new note referencing the old one. The `version`/`sort_seq` pair is therefore stable, which is what makes `last_seen_version` a reliable marker.
10. `BR-10` **Worked example.** On 18/09/2026 v1.7 publishes four notes: (a) `new`, modules `['reports']`, major, "Your GST summary now shows which return table every figure belongs to", linking to the article `gst-summary-explained`; (b) `new`, modules `['reports']`, "Download your GSTR-1 as a JSON file for the offline tool"; (c) `improved`, modules `['sales']`, "The bill screen remembers your last used tax rate"; (d) `fixed`, modules `['ledger']`, "Reminders sometimes showed yesterday's balance — fixed". A tenant with `reports`, `sales` and `ledger` enabled and `last_seen_version = v1.6` gets `count = 4`, `has_major = true`, the sidebar dot and one dashboard strip. A tenant with `inventory` only — an impossible configuration in practice, but the rule must hold — would get notes with empty `modules[]` and nothing else. Tapping "Got it" writes `last_seen_version = v1.7`; the dot and the strip clear; the next release brings them back.

#### 12. Permissions
No permission codename gates this feature, in keeping with HLP-01 §12 and HLP-02 §12: every authenticated member of an active tenant may read every published note, mark their own marker and toggle "Show everything". There is no role-based filtering — relevance is by module, not by permission, because a staff member who cannot open the GST summary still benefits from knowing the product changed and still works beside somebody who can. Writing another user's marker is impossible: the endpoint takes no `user_id` and derives both the user and the tenant from the token. Authoring is not a tenant-facing capability at all — notes are published by Metis Labs through the management command `publish_release_note`, so there is no authoring permission and no content-injection surface, exactly as in HLP-01.

#### 13. Edge Cases
1. `EC-1` A user belongs to two tenants with different enabled modules → the marker and the relevance filter are both tenant-scoped, so the same person can have 2 unread in one business and 0 in the other. This is correct and the `U(tenant_id, user_id)` key enforces it.
2. `EC-2` A module is enabled after a note was published → the note becomes relevant retroactively and can raise the unread count; this is desirable, since the user now cares.
3. `EC-3` A brand-new user's first login → FR-11 seeds `last_seen_version` to the current latest, so the dot never greets somebody on day one with eighteen months of history.
4. `EC-4` A note is archived after publication (a feature was rolled back) → it disappears from the list and from the unread computation; a user who had already seen it is unaffected because the marker is a `sort_seq`, not a set of read ids.
5. `EC-5` Two releases ship on the same day → both appear, ordered by `sort_seq`, under two headings with the same date; the heading includes the version so they are distinguishable.
6. `EC-6` The user taps "Got it" while a new release publishes in the same second → the marker is written to the version the client displayed, so the newest note stays unread rather than being silently swallowed.
7. `EC-7` Deep link to an archived or unknown anchor → the page opens at the top with a neutral caption "That update is no longer listed", never an error page.
8. `EC-8` `hi` translation missing at publish → blocked by the publish gate (BR-1); at runtime an impossible state, and the fallback is the `en` text with a language notice rather than a blank card.
9. `EC-9` Offline on first ever visit → the offline empty state, with the sidebar dot suppressed since the count could not be fetched (a dot that cannot be cleared is worse than no dot).
10. `EC-10` A very long history (200 notes) → cursor pagination at 20; the unread count is a single indexed `COUNT(*)` and does not page.
11. `EC-11` The unread-count request fails on app load → silent; no dot, no error, and the page still works when opened manually (§5).
12. `EC-12` A tenant disables every module except `platform` → only product-wide notes (empty `modules[]`) are relevant; the list is short rather than empty, and "Show everything" is one tap away.

#### 14. API Requirements
- `GET /help/releases?locale&since&modules&kind&cursor&limit` → `{ data: notes[], meta: { next_cursor, has_more, latest_version, filtered_by_modules } }`.
- `GET /help/releases/unread-count` → `{ data: { count, latest_version, has_major } }`.
- `POST /help/releases/seen` `{ version }` → `{ data: { last_seen_version, count: 0 } }`; the backwards no-op of §10 returns `200` with the stored value.
All three are new — §0.8 and §22.12 list nothing for release notes — and are added as **CR-HLP-4**, together with the two tables in §15. Headers: `Cache-Control: public, max-age=300, stale-while-revalidate=3600` on the list (global content, no tenant data in the payload — the same assertion as HLP-01 §19), `private, max-age=60` on the unread count (it is per user), `no-store` on the POST. Errors: 400 `validation_error`, 429 `rate_limited`. Auth: standard session; tenant from `tid` for relevance and for the marker. Frontend: `helpService.getReleases()`, `.getReleaseUnreadCount()`, `.markReleasesSeen(version)`; `whatsNewSlice`; the unread count is fetched by the app shell after first paint and its rejection is swallowed.

#### 15. Database Impact
New table **`help_release_note`** (CR-HLP-4, global): `id uuid PK`, `version varchar(16) NN`, `sort_seq int NN`, `released_on date NN`, `locale varchar(8) NN`, `slug varchar(120) NN`, `title varchar(160) NN`, `summary varchar(240) NN`, `body_md text NN`, `kind varchar(10) NN` (`new`, `improved`, `fixed`), `modules text[] NN default '{}'`, `is_major boolean NN default false`, `related_article_slugs text[] NN default '{}'`, `image_attachment_id uuid NULL`, `status varchar(12) NN default 'draft'`, `published_at timestamptz NULL`, `created_at`, `updated_at`; `U(slug, locale)`, `U(version, slug, locale)`, `IX(status, sort_seq DESC)`, GIN on `modules`, and a partial unique index enforcing BR-7: `U(version) WHERE is_major AND status='published'`. New table **`help_release_seen`**: `id uuid PK`, `tenant_id uuid FK NN`, `user_id uuid FK NN`, `last_seen_version varchar(16) NN`, `last_seen_sort_seq int NN`, `last_seen_at timestamptz NN`, `created_at`, `updated_at`; `U(tenant_id, user_id)`. Reads `platform_tenant.enabled_modules` for relevance and `help_article` for `related_article_slugs` resolution. Both tables are seeded and published by the idempotent management commands `seed_release_notes` and `publish_release_note` per §21.8, never by migrations.

#### 16. Audit Requirements
Not applicable at the tenant level — reading release notes and advancing a personal marker are not business actions and §21.7 lists no such entity. Publication is a platform action and writes a platform-level `platform_audit_log` row (`tenant_id` NULL, `actor_type='super_admin'`, `action='release_note.published'`, `metadata = { version, slug, locale, kind, is_major, modules }`), which is also how the "no note published without both locales" gate leaves a trace.

#### 17. Notifications
None — and this is the feature where saying so matters most. A release note never becomes a `notifications_notification`, never rings the bell, never sends an SMS and never sends a push. The bell belongs to the user's business (a payment received, an export ready, stock running low); a product announcement in it would devalue every row beside it. The entire notification surface of this feature is one dot on a sidebar item and, for a major release only, one dismissible strip on the dashboard (FR-5).

#### 18. Analytics / Event Tracking
`ub.help.whats_new_opened { from: 'sidebar'|'dashboard_strip'|'help_home'|'deep_link'|'settings_about', unread_count, has_major }`, `ub.help.whats_new_note_viewed { version, slug, kind, is_major, position }`, `ub.help.whats_new_article_clicked { version, slug, article_slug }`, `ub.help.whats_new_marked_seen { version, notes_unread_before }`, `ub.help.whats_new_strip_shown { version }`, `ub.help.whats_new_strip_dismissed { version, opened: true|false }`, `ub.help.whats_new_show_everything_toggled { enabled }`, `ub.help.whats_new_kind_filtered { kind }`, `ub.help.whats_new_offline_shown {}`. The pair `strip_shown` / `strip_dismissed { opened }` is the measure of whether the announcement mechanism is earning its place or being swatted away.

#### 19. Security
The read path carries no tenant data — notes are global and the payload contains no tenant, user or business field — which is what makes the `public` cache headers safe; a test fails the build if a release-note serializer ever gains a tenant-scoped field, mirroring HLP-01 §19. The only tenant-scoped state is `help_release_seen`, keyed by `(tenant_id, user_id)` from the token with no parameter that could address another user's row. `body_md` is authored content rendered by the same allow-list renderer as HLP-01 FR-7 — no raw HTML, `href`s limited to `https:`, in-app routes, `tel:` and `mailto:` — so a compromised content pipeline cannot inject script into every tenant's app through a release note, which would otherwise be an unusually attractive target because every user sees it. `version`, `kind` and `modules` parameters are whitelisted; `since` is parsed, never interpolated. Rate limit on the seen-write (§10) bounds a trivial abuse path. No release note ever contains a customer name, an amount or any tenant data, and that is a content rule enforced at review, not a technical control the code can apply.

#### 20. Performance
The corpus is small and global: the list is one indexed scan on `(status, sort_seq DESC)` with a GIN overlap test on `modules`, typically ≤ 20 ms, and is cacheable by the CDN for five minutes with a one-hour stale-while-revalidate window, so most requests never reach the application. The unread count is a single `COUNT(*)` over the same index bounded by the user's `last_seen_sort_seq` — ≤ 5 ms — and is fetched once per session after first paint, off the critical path, with its failure swallowed (EC-11). `related_article_slugs` resolution is one `IN` query per page, not per note. The last fetched page is cached by the service worker for the offline state. There is no snapshot, no denormalised counter and no background job: at this size, none of them would pay for themselves.

#### 21. Testing
- `T-HLP03-1` unit: BR-10 worked example — four notes, relevance-filtered count of 4, `has_major` true, marker written on "Got it", count falls to 0, next publish restores it.
- `T-HLP03-2` unit: relevance overlap (BR-5) including the empty-`modules[]` product-wide case and the retroactive relevance of EC-2.
- `T-HLP03-3` unit: ordering and unread computation use `sort_seq`/`released_on`, not string comparison of `version` (BR-2) — asserted with `v1.9` preceding `v1.10`.
- `T-HLP03-4` unit: the marker never retreats; a backwards POST is a no-op returning the stored value (BR-4, §10).
- `T-HLP03-5` unit: the partial unique index rejects a second `is_major` note in one published version (BR-7).
- `T-HLP03-6` unit: the publish command refuses a note missing its `hi` row (BR-1) and writes the platform audit row (§16).
- `T-HLP03-7` unit: a brand-new user is seeded to the latest version and sees zero unread (FR-11, EC-3).
- `T-HLP03-8` API: cursor pagination and `limit ≤ 50`; `modules=all` returns everything; `kind` filter; unknown values 400 per §10.
- `T-HLP03-9` API: the list response contains no tenant-scoped field (the §19 assertion) and carries the `public` cache headers; the unread count carries `private`.
- `T-HLP03-10` API: the same user in two tenants has independent markers and counts (EC-1).
- `T-HLP03-11` API: an archived note leaves the list and the count without disturbing an advanced marker (EC-4).
- `T-HLP03-12` component: version grouping with kind ordering New → Improved → Fixed; two releases on one date render as two headings (EC-5); "Got it" hides once everything is read.
- `T-HLP03-13` component: the dot exposes an accessible name and meets contrast; it is suppressed when the count request failed (EC-9, EC-11); the strip shows once per major version and its dismissal is recorded with `opened`.
- `T-HLP03-14` component: a deep link scrolls to and rings the note; an unknown anchor lands at the top with the neutral caption (EC-7).
- `T-HLP03-15` component: the Markdown renderer rejects raw HTML and a `javascript:` href in a release body (shared with T-HLP01-5, re-asserted here because the blast radius is every tenant).
- `T-HLP03-16` E2E: publish v1.7 with the BR-10 notes → the owner sees the dot and the strip → opens the list → taps a "Learn how" link → the article drawer opens over the list → taps "Got it" → both markers clear and stay clear after a reload.
- `T-HLP03-17` content: every seeded note has both locales, a kind, a summary within 240 characters, a body within 120 words, and every `related_article_slugs` entry resolves to a published article.

#### 22. Acceptance Criteria
- `AC-1` (US-1) Given v1.7 published four notes, when I open What's new, then I see them grouped under "18 September 2026 · v1.7" ordered New, New, Improved, Fixed, each with its kind badge.
- `AC-2` (US-2) Given I have not looked since v1.6, when I open the app, then a dot appears on the sidebar "What's new" item with the accessible name "4 new updates", and no modal, notification or bell badge appears; tapping "Got it" clears it permanently.
- `AC-3` (US-3) Given my business has Stock turned off, when I open the list, then no stock notes appear, and turning on "Show everything" reveals them with their module badge.
- `AC-4` (US-4) Given a reminder bug was fixed, when I read the list, then a "Fixed" note describes the symptom I saw — "Reminders sometimes showed yesterday's balance" — without mentioning code.
- `AC-5` (US-5) Given the GST note links to an article, when I tap "Learn how", then the help drawer opens over the list with that article, and closing it returns me to my place.
- `AC-6` (US-6) Given my language is Hindi, when I open What's new, then every title, summary and body renders in Hindi, because no note is published without both languages.

#### 23. Dependencies
HLP-01 (the Markdown renderer, the article summaries behind `related_article_slugs`, the help drawer, the help home card), HLP-02 (the anchor ring reused for deep links), PLT-01/PLT-02 (session and active tenant), PLT-06 (`enabled_modules` for relevance), PLT-03 (partner branding — a white-label tenant's notes say the partner's app name, resolved client-side from `whiteLabelSlice`), RPT-01 (the dashboard, which hosts the major-release strip), `GET /system/version` (Settings → About links here), the PWA service worker (ADR-020) for FR-12, the management commands `seed_release_notes` and `publish_release_note`, CR-HLP-4 (three endpoints and the two new tables).

#### 24. Future Enhancements
Per-note reactions (a simple useful/not-useful, reusing `help_feedback`'s shape) so the content team learns which announcements land; a public changelog page sharing the same content for marketing and for partners' own release communications; partner-authored notes layered over the global set using the `tenant_id`/`partner_id` override reserved in §21.9, so a white-label reseller can announce their own changes alongside the product's; a "you have not used this new feature yet" prompt — considered and deferred, because it edges from informing into nagging and HLP-02 §17 already draws that line; digest delivery by email for owners who want a monthly summary, opt-in only and never on by default; linking a note to the specific screen it changed so HLP-02's contextual drawer can surface "what changed here" beside the "?"; and, once the product is multilingual beyond `en`/`hi`, publishing notes per locale with a translation-status gate so a Marathi user is never shown an English announcement without being told why.
