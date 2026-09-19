# Part 43 — Change-Request Register

## 43.1 Why this document exists

The DigiKhaato specification was written by several authors working in parallel against a shared foundation. Part 0 (canon), Part 21 (database architecture) and Part 22 (API specification) were fixed early so that the functional requirement documents could be written against something stable. That was the right call — but it meant every author who found a gap in the foundation had nowhere to put the fix except a note in their own chapter.

Each of them invented the same mechanism independently, and each of them invented it slightly differently.

- **Part 17-01 (Platform & Parties)** numbered its change requests `CCR-1` through `CCR-32`.
- **Part 17-02 (Ledger & Payments)** numbered its change requests `CCR-1` through `CCR-46`.
- **Part 17-03 (Inventory & Purchases)** numbered its change requests `CCR-02` through `CCR-22`, zero-padded.
- **Part 17-04 (Sales & Reports)** used three per-module prefixes: `CR-SAL-1…7`, `CR-RPT-1…9` and `CR-HLP-1…4`.
- **Part 20 (Backend Architecture)** used `CR-BE-1…5` and, in one place, cited `CR-SAL-3` from Part 17-04 by its original number.

The result is a register that cannot be read. `CCR-4` means "add `platform_membership.permissions_version`" in Part 17-01 and "add a partial unique index on the opening ledger entry" in Part 17-02. `CCR-11` means "add `POST /parties/{id}/erase`" in one chapter and "add `parties_party.whatsapp_opt_in`" in another. `CCR-30` is a party-merge endpoint in Part 17-01 and an expense-table extension in Part 17-02. There are three separate `CCR-17`s. A reader who finds "see CCR-22" in a chapter they are not currently holding has no way to resolve it, and an engineer who is told "apply CCR-12 before build" has a one-in-three chance of applying the right change.

The collision was not carelessness. It is the predictable consequence of four authors each doing the locally correct thing — numbering their own findings — with no allocator between them. This document is that allocator, applied retrospectively.

## 43.2 The global scheme

From this document forward there is exactly one change-request namespace for the whole specification:

> **`CR-<NNN>`** — three digits, zero-padded, allocated once by this register, never reused, never renumbered.

Rules:

1. **One ID per change, not per mention.** A change request that appears in five sections of its home chapter has one global ID. A change request raised independently by two chapters has one global ID with two recorded sources.
2. **IDs are allocated in source order**, not in target order: Part 20's five requests first, then Part 17-01, Part 17-02, Part 17-03, Part 17-04, then anything raised by this reconciliation pass itself. This makes the mapping in §43.3 mechanical and checkable. The *register* in §43.4 is grouped by target document, because that is how the changes will be applied.
3. **IDs are permanent.** A rejected or withdrawn change keeps its ID; the ID is never handed to a different change. Gaps do not appear because merged requests share an ID rather than burning one.
4. **New change requests continue this sequence.** The next free ID is **CR-119**. Anyone raising a change against the foundation documents allocates the next number here, in this file, and cites the global ID in their own chapter — they do not start a local series.
5. **Original IDs remain valid as references.** Every chapter that says `CCR-12` still says `CCR-12`; §43.3 resolves it. Chapters are not edited to renumber their own citations, because doing so across four files of ~300,000 words would create more risk than it removes. The mapping table is the bridge.

### 43.2.1 Status vocabulary

| Status | Meaning |
|---|---|
| **Absorbed** | The change has already been applied to the target document. Nothing further is required; the entry exists so the original citation resolves. |
| **Accepted** | The change is agreed and must be applied to the target document. §43.5 orders these. |
| **Deferred** | The change is not agreed, or is agreed but not for this release. Every Deferred entry carries a reason. Deferred entries that represent a genuine disagreement between chapters are additionally flagged **⚠ decision needed** and are listed for Part 37's open-questions register. |
| **Rejected** | The change will not be made. Every Rejected entry carries a reason. |

### 43.2.2 Change-nature vocabulary

`new table`, `new column`, `new index`, `new endpoint`, `endpoint delta` (an existing endpoint gains parameters, fields or formats), `new error code`, `new setting` (a well-known `platform_tenant_setting` key), `new permission`, `new header`, `clarification` (no schema or contract change; the target document is ambiguous and must say what it already means).

## 43.3 Mapping from original IDs to global IDs

Read this table left to right to resolve any citation you find in a chapter. Where two rows share a global ID, the change was raised twice and has been merged — both sources are correct and both describe the same change.

| Original ID | Source chapter | Global ID |
|---|---|---|
| CR-BE-1 | 20 Backend Architecture | CR-001 |
| CR-BE-2 | 20 Backend Architecture | CR-002 |
| CR-BE-3 | 20 Backend Architecture | CR-003 |
| CR-BE-4 | 20 Backend Architecture | CR-004 |
| CR-BE-5 | 20 Backend Architecture | CR-005 |
| CCR-1 | 17-01 Platform & Parties | CR-006 |
| CCR-2 | 17-01 Platform & Parties | CR-007 |
| CCR-3 | 17-01 Platform & Parties | CR-008 |
| CCR-4 | 17-01 Platform & Parties | **CR-004** (merged) |
| CCR-5 | 17-01 Platform & Parties | CR-009 |
| CCR-6 | 17-01 Platform & Parties | CR-010 |
| CCR-7 | 17-01 Platform & Parties | CR-011 |
| CCR-8 | 17-01 Platform & Parties | CR-012 |
| CCR-9 | 17-01 Platform & Parties | CR-013 |
| CCR-10 | 17-01 Platform & Parties | CR-014 |
| CCR-11 | 17-01 Platform & Parties | CR-015 |
| CCR-12 | 17-01 Platform & Parties | CR-016 |
| CCR-13 | 17-01 Platform & Parties | CR-017 |
| CCR-14 | 17-01 Platform & Parties | CR-018 |
| CCR-15 | 17-01 Platform & Parties | CR-019 |
| CCR-16 | 17-01 Platform & Parties | CR-020 |
| CCR-17 | 17-01 Platform & Parties | CR-021 |
| CCR-18 | 17-01 Platform & Parties | CR-022 |
| CCR-19 | 17-01 Platform & Parties | CR-023 |
| CCR-20 | 17-01 Platform & Parties | CR-024 |
| CCR-21 | 17-01 Platform & Parties | CR-025 |
| CCR-22 | 17-01 Platform & Parties | CR-026 |
| CCR-23 | 17-01 Platform & Parties | CR-027 |
| CCR-24 | 17-01 Platform & Parties | CR-028 |
| CCR-25 | 17-01 Platform & Parties | CR-029 |
| CCR-26 | 17-01 Platform & Parties | CR-030 |
| CCR-27 | 17-01 Platform & Parties | CR-031 |
| CCR-28 | 17-01 Platform & Parties | CR-032 |
| CCR-29 | 17-01 Platform & Parties | CR-033 |
| CCR-30 | 17-01 Platform & Parties | CR-034 |
| CCR-31 | 17-01 Platform & Parties | CR-035 |
| CCR-32 | 17-01 Platform & Parties | CR-036 |
| CCR-1 | 17-02 Ledger & Payments | CR-037 |
| CCR-2 | 17-02 Ledger & Payments | CR-038 |
| CCR-3 | 17-02 Ledger & Payments | CR-039 |
| CCR-4 | 17-02 Ledger & Payments | CR-040 |
| CCR-5 | 17-02 Ledger & Payments | CR-041 |
| CCR-6 | 17-02 Ledger & Payments | CR-042 |
| CCR-7 | 17-02 Ledger & Payments | CR-043 |
| CCR-8 | 17-02 Ledger & Payments | CR-044 |
| CCR-9 | 17-02 Ledger & Payments | **CR-001** (merged) |
| CCR-10 | 17-02 Ledger & Payments | CR-045 |
| CCR-11 | 17-02 Ledger & Payments | CR-046 |
| CCR-12 | 17-02 Ledger & Payments | CR-047 |
| CCR-13 | 17-02 Ledger & Payments | CR-048 |
| CCR-14 | 17-02 Ledger & Payments | CR-049 |
| CCR-15 | 17-02 Ledger & Payments | CR-050 |
| CCR-16 | 17-02 Ledger & Payments | CR-051 |
| CCR-17 | 17-02 Ledger & Payments | CR-052 |
| CCR-18 | 17-02 Ledger & Payments | CR-053 |
| CCR-19 | 17-02 Ledger & Payments | CR-054 |
| CCR-20 | 17-02 Ledger & Payments | CR-055 |
| CCR-21 | 17-02 Ledger & Payments | CR-056 |
| CCR-22 | 17-02 Ledger & Payments | CR-057 |
| CCR-23 | 17-02 Ledger & Payments | CR-058 |
| CCR-24 | 17-02 Ledger & Payments | CR-059 |
| CCR-25 | 17-02 Ledger & Payments | CR-060 |
| CCR-26 | 17-02 Ledger & Payments | CR-061 |
| CCR-27 | 17-02 Ledger & Payments | CR-062 |
| CCR-28 | 17-02 Ledger & Payments | CR-063 |
| CCR-29 | 17-02 Ledger & Payments | CR-064 |
| CCR-30 | 17-02 Ledger & Payments | CR-065 |
| CCR-31 | 17-02 Ledger & Payments | CR-066 |
| CCR-32 | 17-02 Ledger & Payments | CR-067 |
| CCR-33 | 17-02 Ledger & Payments | CR-068 |
| CCR-34 | 17-02 Ledger & Payments | CR-069 |
| CCR-35 | 17-02 Ledger & Payments | CR-070 |
| CCR-36 | 17-02 Ledger & Payments | CR-071 |
| CCR-37 | 17-02 Ledger & Payments | CR-072 |
| CCR-38 | 17-02 Ledger & Payments | CR-073 |
| CCR-39 | 17-02 Ledger & Payments | CR-074 |
| CCR-40 | 17-02 Ledger & Payments | CR-075 |
| CCR-41 | 17-02 Ledger & Payments | **CR-043** (merged) |
| CCR-42 | 17-02 Ledger & Payments | CR-076 |
| CCR-43 | 17-02 Ledger & Payments | CR-077 |
| CCR-44 | 17-02 Ledger & Payments | CR-078 |
| CCR-45 | 17-02 Ledger & Payments | CR-079 |
| CCR-46 | 17-02 Ledger & Payments | CR-080 |
| CCR-02 | 17-03 Inventory & Purchases | CR-081 |
| CCR-03 | 17-03 Inventory & Purchases | CR-082 |
| CCR-04 | 17-03 Inventory & Purchases | CR-083 |
| CCR-05 | 17-03 Inventory & Purchases | CR-084 |
| CCR-06 | 17-03 Inventory & Purchases | CR-085 |
| CCR-07 | 17-03 Inventory & Purchases | CR-086 |
| CCR-08 | 17-03 Inventory & Purchases | CR-087 |
| CCR-09 | 17-03 Inventory & Purchases | CR-088 |
| CCR-10 | 17-03 Inventory & Purchases | CR-089 |
| CCR-11 | 17-03 Inventory & Purchases | CR-090 |
| CCR-12 | 17-03 Inventory & Purchases | CR-091 |
| CCR-13 | 17-03 Inventory & Purchases | CR-092 |
| CCR-14 | 17-03 Inventory & Purchases | CR-093 |
| CCR-15 | 17-03 Inventory & Purchases | CR-094 |
| CCR-16 | 17-03 Inventory & Purchases | CR-095 |
| CCR-17 | 17-03 Inventory & Purchases | CR-096 |
| CCR-18 | 17-03 Inventory & Purchases | **CR-001** (merged) |
| CCR-19 | 17-03 Inventory & Purchases | CR-097 |
| CCR-20 | 17-03 Inventory & Purchases | CR-098 |
| CCR-21 | 17-03 Inventory & Purchases | **CR-096** (merged) |
| CCR-22 | 17-03 Inventory & Purchases | CR-099 |
| CR-SAL-1 | 17-04 Sales & Reports | CR-100 |
| CR-SAL-2 | 17-04 Sales & Reports | CR-101 |
| CR-SAL-3 | 17-04 Sales & Reports | **CR-003** (merged; also CR-002) |
| CR-SAL-4 | 17-04 Sales & Reports | CR-102 |
| CR-SAL-5 | 17-04 Sales & Reports | CR-103 |
| CR-SAL-6 | 17-04 Sales & Reports | CR-104 |
| CR-SAL-7 | 17-04 Sales & Reports | CR-105 |
| CR-RPT-1 | 17-04 Sales & Reports | CR-106 |
| CR-RPT-2 | 17-04 Sales & Reports | CR-107 |
| CR-RPT-3 | 17-04 Sales & Reports | CR-108 |
| CR-RPT-4 | 17-04 Sales & Reports | **CR-098** (merged) |
| CR-RPT-5 | 17-04 Sales & Reports | CR-109 |
| CR-RPT-6 | 17-04 Sales & Reports | CR-110 |
| CR-RPT-7 | 17-04 Sales & Reports | CR-111 |
| CR-RPT-8 | 17-04 Sales & Reports | CR-112 |
| CR-RPT-9 | 17-04 Sales & Reports | CR-113 |
| CR-HLP-1 | 17-04 Sales & Reports | CR-114 |
| CR-HLP-2 | 17-04 Sales & Reports | CR-115 |
| CR-HLP-3 | 17-04 Sales & Reports | CR-116 |
| CR-HLP-4 | 17-04 Sales & Reports | CR-117 |
| — (raised by this pass) | 43 Change-Request Register | CR-118 |

**Totals.** 124 change requests were harvested from five chapters. Seven were merged as duplicates of a request raised elsewhere (17-01 CCR-4; 17-02 CCR-9 and CCR-41; 17-03 CCR-18 and CCR-21; 17-04 CR-SAL-3 and CR-RPT-4), leaving 117 distinct changes, plus one raised by this reconciliation pass — **118 global IDs, CR-001 through CR-118**.

## 43.4 The consolidated register

Grouped by target document. Within each group, entries are in global-ID order.

### 43.4.1 Target: Part 21 — Database Architecture

| Global ID | Original ID(s) & source | Target section | Nature | Change | Status |
|---|---|---|---|---|---|
| CR-001 | CR-BE-1 (20); CCR-9 (17-02); CCR-18 (17-03) | §21.3.1 Platform; §21.4; §21.5 | new table | Specify `platform_job`, the ADR-012 background-work queue, with its full column list, the partial claim index, the two partial unique indexes for deduplication and recurring jobs, and its `RESTRICT`/`SET NULL` cascade behaviour. Part 20 §20.8 keeps the operational narrative; Part 21 becomes the schema's home. Three chapters raised this independently — Part 20 for the runner, 17-02 for reminder SMS, 17-03 for async exports. | **Absorbed** (applied 2026-09-18) |
| CR-002 | CR-BE-2 (20); half of CR-SAL-3 (17-04) | §21.3.1 Platform; §21.4 | new table | Specify `platform_idempotency_key` — the storage behind the `Idempotency-Key` contract that Part 22 §22.1 mandates but never gave a home. `U(tenant_id, scope, key)` is both the lookup and the lock; `IX(expires_at)` serves the hourly purge. | **Absorbed** (applied 2026-09-18) |
| CR-003 | CR-BE-3 (20); CR-SAL-3 (17-04) | §21.3.7 Sales; §21.3.8 Purchases | new column | Add `version integer NOT NULL DEFAULT 1` to `sales_document` and `purchases_document`. Part 22 §22.1 and §22.7 require optimistic concurrency on mutable documents and Part 21 omitted the column; SAL-02 §15 flagged the same gap while specifying the invoice write path. | **Absorbed** (applied 2026-09-18) |
| CR-004 | CR-BE-4 (20); CCR-4 (17-01) | §21.3.1 Platform | new column | Add `permissions_version integer NOT NULL DEFAULT 1` to `platform_membership` as the stored counterpart of the `ver` access-token claim. Any write that changes `role_id` or `permissions_override` bumps it in the same transaction, so a role change takes effect on the member's next request rather than at their next refresh. | **Absorbed** (applied 2026-09-18) |
| CR-005 | CR-BE-5 (20) | §21.3.1 Platform | new column | Add `token_epoch integer NOT NULL DEFAULT 1` to `platform_user`. Bumping it invalidates every outstanding access token for that user at once, which is the only mechanism that cuts an access token before its 15 minutes elapse without introducing a Redis blocklist. | **Absorbed** (applied 2026-09-18) |
| CR-023 | CCR-19 (17-01) | §21.3.3 Parties | new index | Add a partial unique index on `parties_party(tenant_id, display_code) WHERE display_code IS NOT NULL AND deleted_at IS NULL`. PTY-01 currently enforces `display_code` uniqueness in the service only, which is a race under concurrent creates. | **Accepted** |
| CR-025 | CCR-21 (17-01) | §21.3.3 Parties; §21.4 | new index | Add `IX(tenant_id, status, balance DESC)` to serve the party list's "archived or active, highest balance first" sort without a sort node, and a partial `IX(tenant_id, collection_date) WHERE balance > 0` for the overdue collection chip. | **Accepted** |
| CR-030 | CCR-26 (17-01); pattern shared with CCR-33 (17-02) | §21.3.3 Parties | new index | Add `IX(tag_id)` to `parties_party_tag` — the existing `U(party_id, tag_id)` serves party→tags but not tag→parties, which the `party_count` annotation and the list's tag filter both need — and replace `parties_tag`'s plain `U(tenant_id, name)` with a functional `U(tenant_id, lower(name))` so case-insensitive uniqueness is a database guarantee rather than a service convention. Both created `CONCURRENTLY` per §21.8. | **Accepted** |
| CR-032 | CCR-28 (17-01) | §21.3.3 Parties; §21.4 | new index | Add a partial `IX(tenant_id, credit_limit) WHERE credit_limit IS NOT NULL` and a generated `credit_usage` column so the `credit=over|near` party filter stops being a sequential predicate. The chapter itself states this is not needed below 10,000 parties per tenant. | **Deferred** — performance only; required before any tenant exceeds 10,000 parties, not before build. |
| CR-018 | CCR-14 (17-01) | §21.3.2 Files; §21.1 rule 1 | new column | Make `files_attachment.tenant_id` nullable so a partner logo, uploaded through the super-admin console, can be stored with `owner_type='partner'` and no tenant. | **Deferred ⚠ decision needed** — see §43.4.6 C2. |
| CR-021 | CCR-17 (17-01) | §21.3.2 Files | clarification | Register `font` as an attachment `kind`, for partner typography overrides (WLB-05). | **Accepted** |
| CR-034 | CCR-30 (17-01) | §21.3.3 Parties; §21.2; §22.4 | new column | Party merge: add `merged_into_id uuid NULL` to `parties_party`, and amend `ledger_entry`'s `forbid_update_delete()` trigger to permit an update of `party_id` when `current_setting('app.merge_in_progress', true) = 'on'`, a GUC set with `SET LOCAL` by the merge service alone. Also adds the `POST /parties/{target_id}/merge` endpoint and a merge-suggestion dismissal setting. The trigger amendment is deliberately **not** extended to `inventory_stock_movement`. | **Accepted** |
| CR-035 | CCR-31 (17-01) | §21.3.3 Parties | new column | Extend `parties_share_link` with `kind varchar(16) NN default 'khata'`, `label varchar(40) NULL`, `token_suffix varchar(6) NN`, `created_by_id`, `last_viewed_at`, plus `IX(party_id, revoked_at, expires_at)` and a partial `IX(tenant_id, expires_at) WHERE revoked_at IS NULL`. | **Deferred ⚠ decision needed** — see §43.4.6 C1. |
| CR-043 | CCR-7 + CCR-41 (17-02) | §21.3.3 Parties | new column | Generalise `parties_share_link` into an any-entity share table: `kind varchar(24) NN`, `party_id uuid NULL`, `related_type`, `related_id`, `params jsonb`, `locale varchar(8) NULL`, `view_count`, `last_viewed_at`, with `IX(tenant_id, kind, related_type, related_id)`. Raised twice inside 17-02 — once for statement links (LED-04), once for the generalised share sheet (NTF-03). | **Deferred ⚠ decision needed** — see §43.4.6 C1. |
| CR-036 | CCR-32 (17-01) | §21.3.11 Imports | new column | Add `column_map jsonb NOT NULL DEFAULT '{}'` to `imports_job` to persist the user's column mapping between validate and commit, plus a partial `IX(tenant_id, status) WHERE status IN ('uploaded','validating','ready','importing')` for the progress poller. | **Deferred ⚠ decision needed** — see §43.4.6 C5. |
| CR-096 | CCR-17 + CCR-21 (17-03) | §21.3.11 Imports | new column | Add `options jsonb` to `imports_job` carrying `mode`, `match_on`, `source`, `selection` and `reverts_job_id`, document the `result` sub-schema (`diff_summary`, `diff_rows`, `revert`, `reverted_by`), and add `IX(tenant_id, kind, created_at DESC)` for the price-job history. Raised twice inside 17-03. | **Deferred ⚠ decision needed** — see §43.4.6 C5. |
| CR-040 | CCR-4 (17-02) | §21.3.4 Ledger | new index | Add a partial unique index enforcing at most one posted `opening` entry per party, as defence-in-depth behind LED-02 BR-2's `SELECT … FOR UPDATE` check. | **Accepted** |
| CR-046 | CCR-11 (17-02) | §21.3.3 Parties | new column | Add `whatsapp_opt_in boolean` to `parties_party` with its own `consent_source`/`consent_at` recording, for LED-12 WhatsApp reminders. Eligibility for an API-template send requires explicit opt-in, separate from the SMS `sms_opt_in` flag. | **Accepted** (Phase 2) |
| CR-048 | CCR-13 (17-02) | §21.3.4 Ledger | new table | New table `ledger_reminder_rule` for LED-13 recurring reminders: `party_id NULL` / `tag_id NULL` (exactly one set), `frequency ∈ {weekly, monthly}`, `weekday`, `day_of_month` (1–28 or −1 for last day), `channel`, `lead_days`, `min_balance`, `is_active`, `last_run_on`, `next_run_on`. | **Accepted** (Phase 2) |
| CR-057 | CCR-22 (17-02) | §21.3.1 Platform | new table | New table `platform_tenant_secret` holding provider credentials encrypted at rest (AES-GCM under `settings.SECRET_ENCRYPTION_KEY`). Secrets are never returned by any GET; the API exposes only `key_secret_set: true`. | **Accepted** (Phase 2) |
| CR-059 | CCR-24 (17-02) | §21.3.9 Payments | new table | New table `payments_webhook_event` (`provider`, `event_id U`, `event_type`, `raw jsonb`, `signature_ok`, `status ∈ {received, processed, failed, ignored}`, `attempts`, `last_error`, `tenant_id NULL`) implementing store-then-acknowledge for aggregator webhooks. | **Accepted** (Phase 2) |
| CR-061 | CCR-26 (17-02) | §21.3.9 Payments | new column | Extend `payments_request` with `kind varchar(8)`, `provider_url varchar(500)`, `qr_payload text`, `fee_amount`, `fee_tax_amount`, `meta jsonb`; add `payments_payment.provider_payment_id varchar(64) NULL` with `U(tenant_id, provider_payment_id) WHERE NOT NULL` for idempotent webhook posting. | **Accepted** (Phase 2) |
| CR-062 | CCR-27 (17-02) | §21.3.9 Payments | new table | New tables `payments_settlement` and the `payments_settlement_payment` join, for the aggregator settlement view. | **Accepted** (Phase 2) |
| CR-064 | CCR-29 (17-02) | §21.3.9 Payments; §21.4 | new index | Add a partial `IX(tenant_id, direction, payment_date DESC) WHERE party_id IS NULL AND status='recorded'` to serve the unmatched-payments queue without scanning the payment table. | **Accepted** (Phase 2) |
| CR-065 | CCR-30 (17-02) | §21.3.10 Expenses | new column | Extend `expenses_expense` with `paid boolean NN default true`, `due_on date NULL`, `itc_eligible boolean NN default true`, `supplier_gstin varchar(15) NULL`, `voided_at`, `void_reason`, `meta jsonb`. An unpaid expense posts a ledger entry against the party; a paid one does not. | **Accepted** |
| CR-066 | CCR-31 (17-02) | §21.3.10 Expenses | new column | Add `version int NOT NULL DEFAULT 1` to `expenses_expense`, so EXP-01's 24-hour edit window uses the same optimistic-concurrency contract as documents. | **Deferred ⚠ decision needed** — see §43.4.6 C4. |
| CR-068 | CCR-33 (17-02) | §21.3.10 Expenses | new column | Extend `expenses_category` with `system_code varchar(24) NULL`, `color varchar(7)`, `icon varchar(24)`, `sort_order smallint`, `status varchar(16)`, `deleted_at`, plus `U(tenant_id, lower(name)) WHERE deleted_at IS NULL` and `U(tenant_id, system_code) WHERE system_code IS NOT NULL`. `system_code` is what lets PAY-06 route settlement fees to a known category. | **Accepted** |
| CR-070 | CCR-35 (17-02) | §21.4 | new index | Add the cashbook's access-pattern indexes on `payments_payment(tenant_id, payment_date, …)` and the matching expense index, so EXP-03's day-wise view is a range scan. | **Accepted** |
| CR-071 | CCR-36 (17-02) | §21.3.10 Expenses | new table | New tables `expenses_recurring` and `expenses_recurring_occurrence` (`recurring_id`, `occurrence_date`, `amount_suggested`, `status`, `expense_id NULL`, `skipped_reason`, `notified_at`, `U(recurring_id, occurrence_date)`, `IX(tenant_id, status, occurrence_date)`) for EXP-04. `expenses_expense` gains `recurring_id` and `recurring_occurrence_date`. | **Accepted** (Phase 2) |
| CR-072 | CCR-37 (17-02) | §21.3.2 Notifications | new column | Extend `notifications_notification` for coalescing and broadcast: a `group_key`, a `read_by` set for tenant-wide notifications, `IX(tenant_id, type, group_key, created_at DESC) WHERE read_at IS NULL`, `IX(tenant_id, created_at DESC) WHERE user_id IS NULL`, and a GIN index on `read_by`. | **Accepted** |
| CR-073 | CCR-38 (17-02) | §21.3.2 Notifications | new table | New table `notifications_preference` (per user and type, per channel), later gaining `quiet_hours jsonb NULL`. | **Accepted** (Phase 2) |
| CR-074 | CCR-39 (17-02) | §21.3.2 Notifications | new column | Extend `notifications_message_log` with `segments smallint`, `unicode boolean`, `attempts smallint`, `next_attempt_at`, `template_version`, `sender_id varchar(16)`, `cost_source varchar(10)`, `body text NULL` (the rendered text, purged at 180 days) and `meta jsonb`. This is what makes the message-log UI a usable support tool. | **Accepted** |
| CR-075 | CCR-40 (17-02) | §21.3.3 Parties | new column | Add `locale varchar(8) NULL` to `parties_party`, set the first time a merchant picks a share language for that party, so the second share needs no choice. Resolution order is explicit locale → party locale → tenant locale. | **Accepted** |
| CR-076 | CCR-42 (17-02) | §21.3.2 Notifications | new table | New table `notifications_push_subscription` for NTF-04 web push. Message-log rows for push carry a truncated endpoint hash, never the full endpoint. | **Accepted** (Phase 2) |
| CR-077 | CCR-43 (17-02) | §21.3.2 Notifications; §21.3.3 Parties | new column | Extend `notifications_template` with `components jsonb`, `approval_status`, `approval_error text`, `quality_rating`, `whatsapp_template_id` and a widened `category`; add the `read` status and `read_at` to `notifications_message_log`; add `whatsapp_opt_out_at` to `parties_party`. | **Accepted** (Phase 2) |
| CR-078 | CCR-44 (17-02) | §21.3.2 Notifications | new table | New tables `notifications_conversation` (`conversation_id U`, `category`, `started_at`, `expires_at`, `billable`, `rate`, `cost`, `message_count`) and `notifications_inbound_message`. Meta bills per 24-hour conversation, not per message, so per-message cost accounting is structurally wrong without this table. | **Accepted** (Phase 2) |
| CR-079 | CCR-45 (17-02) | §21.3.3 Parties | new column | Add `email_opt_out_at timestamptz NULL` and `email_bounce_reason varchar(120) NULL` to `parties_party` for NTF-06. | **Accepted** (Phase 2) |
| CR-080 | CCR-46 (17-02) | §21.3.1 Platform | new table | Add `platform_user.email_verified_at` and a `platform_email_verification` table (`user_id`, `email`, `token_hash U`, `expires_at`, `used_at`). | **Accepted** (Phase 2) |
| CR-086 | CCR-07 (17-03) | §21.3.1 Platform | clarification | Register `goods_receipt` as a `platform_document_sequence.kind`. GRN reuses the purchase-bill status set; no new status is introduced. | **Accepted** (Phase 2) |
| CR-088 | CCR-09 (17-03) | §21.3.8 Purchases | new table | New table `purchases_debit_application` (`debit_note_id`, `bill_id`, `amount numeric(14,2)`) mirroring `sales_credit_application`, so a debit note applied against a bill has the same explicit semantics as a credit note against an invoice. | **Accepted** (Phase 2) |
| CR-091 | CCR-12 (17-03) | §21.3.8 Purchases | new table | New table `purchases_landed_cost_charge` (`document_id`, `charge_type`, `label`, `amount`, `tax_code`, `tax_amount`, `itc_eligible`, `allocation_method`, `source`, `party_id NULL`, `expense_id NULL`, `linked_document_id NULL`, `sort_order`) with `IX(tenant_id, document_id)`, holding the freight and handling charges PUR-08 spreads into unit cost. | **Accepted** (Phase 2) |
| CR-092 | CCR-13 (17-03) | §21.3.6 Inventory | new table | New table `inventory_valuation_adjustment` (`item_id`, `variant_id NULL`, `location_id`, `adjustment_date`, `value_delta`, `qty_at_adjustment`, `avg_cost_before`/`avg_cost_after`, `source_type`, `source_id`, `reason`) with `IX(tenant_id, item_id, adjustment_date)`. Without it, `manage.py recalc_stock` cannot replay a landed-cost revaluation and the recomputability guarantee in §21.1 rule 3 is broken for any tenant using PUR-08. | **Accepted** (Phase 2) |
| CR-093 | CCR-14 (17-03) | §21.3.6 Inventory | new column | Add `inventory_item.net_weight_kg numeric(12,4) NULL` so landed cost can be allocated `by_weight`. A participating line whose item has no weight blocks the allocation with 400 `missing_weight`. | **Accepted** (Phase 2) |
| CR-098 | CCR-20 (17-03); CR-RPT-4 (17-04) | §21.3.11 Reports | new column | Extend `reports_export` with `resource varchar(32) NULL`, `created_by_id uuid NULL` and `size_bytes bigint NULL`, plus `IX(tenant_id, created_at DESC)` and `IX(status, expires_at)` for the expiry purge. Raised independently by the inventory/import author and the reports author. | **Accepted** |
| CR-106 | CR-RPT-1 (17-04) | §21.3.11 Reports | new table | Specify `reports_snapshot`, which Part 20 §20.1.2 assigns to the `reports` app but Part 21 never defines: `tenant_id`, `report_name`, `as_of`, `params_hash`, `payload jsonb`, `row_count`, `computed_at`, `U(tenant_id, report_name, as_of, params_hash)`. It backs the nightly aging cache for tenants above 5,000 posted ledger rows and is already referenced by §21.4's dashboard-tiles row. | **Accepted** |
| CR-115 | CR-HLP-2 (17-04) | §21.3.11 Help | new column | Extend `help_article` with `excerpt varchar(240)`, `reading_minutes smallint`, `sort_order smallint`, `helpful_count`/`not_helpful_count int NN default 0` and `word_count int`; add `U(slug, locale, version)`, `IX(status, topic, sort_order)`, GIN trigram on `title` and `body_md`, and a GIN index on `tags`. | **Accepted** (Phase 2) |
| CR-116 | CR-HLP-3 (17-04) | §21.3.11 Help | new table | New table `help_tour_progress` (per user, per tour code) backing the two guided-tour endpoints. | **Accepted** (Phase 2) |
| CR-117 | CR-HLP-4 (17-04) | §21.3.11 Help | new table | New global table `help_release_note` (`version`, `sort_seq`, `released_on`, `locale`, `slug`, `title`, `summary`, `body_md`, `kind ∈ {new, improved, fixed}`, `modules text[]`, `is_major`) plus its per-user read-state table, backing HLP-03 "What's new". | **Accepted** (Phase 2) |
| CR-104 | CR-SAL-6 (17-04) | §21.3.7 Sales | new table | New table `sales_recurring_profile` (party, template payload, `frequency ∈ {weekly, monthly, quarterly, yearly}`, `interval`, `start_on`, `end_on NULL`, `next_run_on`, `day_of_month` 1–28 or `last`, `auto_issue`, `status ∈ {active, paused, ended}`, `last_generated_id`, `occurrences_count`) backing SAL-10. | **Accepted** (Phase 2) |

### 43.4.2 Target: Part 22 — API Specification

| Global ID | Original ID(s) & source | Target section | Nature | Change | Status |
|---|---|---|---|---|---|
| CR-006 | CCR-1 (17-01) | §22.3 | new endpoint | `POST /tenants` `{name, business_type, state_code, locale, owner_name?}` with a required `Idempotency-Key` → 201 `{tenant, membership, access_token?}` and new cookies carrying `tid`. Tenant creation is the one write that has no tenant context yet, so it needs its own documented contract. | **Accepted** |
| CR-007 | CCR-2 (17-01) | §22.3 | endpoint delta | `PATCH /tenants/current` accepts `onboarding_step` as a writable field and returns `warnings[]` in `meta`, so the onboarding wizard can resume and surface non-blocking issues without a second call. | **Accepted** |
| CR-008 | CCR-3 (17-01) | §22.1 | new header | Every API response carries `X-Tenant-Id`, the server's echo of the resolved `tid`. The Axios response interceptor compares it with the active tenant and discards responses belonging to a tenant that was switched in another tab. Cheap, and it closes a whole class of cross-tab data-leak bugs. | **Accepted** |
| CR-009 | CCR-5 (17-01) | §22.2 | new endpoint | `GET /public/invitations/{token}` (unauthenticated, returns `{tenant_name, role, inviter_name, expires_at, mobile_hint}`) and `POST /invitations/{token}/accept`. Without the public read the `/join/{token}` page cannot render before the invitee authenticates. | **Accepted** |
| CR-010 | CCR-6 (17-01) | §21.3.1 well-known keys | new setting | Register three well-known `platform_tenant_setting` keys: `parties.labels`, `inventory.favourite_units` and `numbering.<kind>.reset_fy`. | **Accepted** |
| CR-011 | CCR-7 (17-01) | §22.1, §22.3 | endpoint delta | Add `ETag` on `GET /tenants/current/settings` and `If-Match` on `PUT`, returning 412 on a stale write. Part 22 lists 412 as a status but does not apply it to settings, which are the most commonly concurrently-edited object in the product. | **Accepted** |
| CR-012 | CCR-8 (17-01) | §21.4 | new index | Add `IX(platform_tenant.name gin_trgm_ops)` and the matching super-admin console indexes so tenant search in the ops console is not a sequential scan across every tenant on the platform. | **Accepted** |
| CR-013 | CCR-9 (17-01) | §22.2 | new endpoint | Session management: `GET /auth/sessions`, `PATCH /auth/sessions/{id}` (rename), `DELETE /auth/sessions/{id}`, `POST /memberships/{id}/revoke-sessions`; new error codes 401 `permissions_changed`, 401 `session_revoked`, 409 `current_session`. PLT-09 is an MVP feature with no endpoints in Part 22. | **Accepted** |
| CR-014 | CCR-10 (17-01) | §22.2 | new endpoint | `DELETE /auth/me` — user-account deletion under DPDP, allowed only with no active or invited memberships and no owned non-deleted tenant; anonymises the row and revokes sessions; 409 `memberships_exist` otherwise. | **Accepted** |
| CR-015 | CCR-11 (17-01) | §22.4 | new endpoint | `POST /parties/{id}/erase {reason}` — merchant-executed erasure of a data principal's personal data: blanks contact fields, addresses, notes and consent columns and deletes the party's message logs, while keeping `name` and all ledger and document rows, which are statutory financial records. | **Accepted** |
| CR-016 | CCR-12 (17-01) | §22.13 | new endpoint | Super-admin console endpoints: `/admin/tenants/{id}/access-request`, `/admin/users`, `/admin/health`, `/admin/audit-logs`, and the owner-side `POST /support/access-requests/{id}/allow|deny`. Impersonation with consent is an MVP requirement (PLT-14) and consent needs an endpoint the owner can call. | **Accepted** |
| CR-017 | CCR-13 (17-01) | §22.3 | new endpoint | `GET /manifest?tid=` — a per-tenant PWA manifest so an installed app carries the tenant's (or partner's) name and icon. | **Accepted** |
| CR-019 | CCR-15 (17-01) | §22.3 | new endpoint | `GET /public/branding?host=`, `GET/POST/DELETE /partner/hostnames`, `POST /partner/hostnames/{host}/verify`; auth responses gain `other_partner_tenants`; new errors 403 `wrong_partner_host`, 409 `hostname_in_use`. | **Accepted** (Phase 2) |
| CR-020 | CCR-16 (17-01) | §22.13 | new endpoint | The `/partner/*` console namespace mirroring the super-admin subset scoped to `partner_id`: `GET /partner/tenants`, `GET/PATCH /partner/tenants/{id}`, `GET/PATCH /partner/profile`. Entitlement changes are bounded by `partner.settings.allowed_plan_ids` and `max_overrides`. | **Accepted** (Phase 2) |
| CR-022 | CCR-18 (17-01) | §22.12 | new endpoint | `POST /webhooks/messaging/{provider}` — idempotent delivery-status updates keyed on `provider_message_id`. | **Accepted** |
| CR-024 | CCR-20 (17-01) | §22.4 | endpoint delta | Six documented deltas on `GET /parties`: `collection=today|overdue|upcoming` (with the `balance > 0` condition on `overdue`), `tag=` as a comma list with OR semantics, `format=csv` streaming the filtered set (202 + `export_id` above 5,000 rows), `collection_date` added to the `ordering` whitelist, `meta.totals` defined as filtered-set aggregates, and sparse `fields=`. | **Accepted** |
| CR-026 | CCR-22 (17-01) | §22.1 | endpoint delta | Offer cursor pagination on the party list for very large tenants, alongside the existing offset pagination. | **Deferred** — Phase 2; offset pagination is adequate at the MVP tenant-size envelope and a second pagination mode doubles the client surface. |
| CR-027 | CCR-23 (17-01) | §22.5 | endpoint delta | `GET /parties/{id}/ledger-entries` rows carry `running_balance` (string) and a `source` summary `{type, id, number, route}` for navigation, and the endpoint accepts `format=csv`. Without `running_balance` from the server the client must recompute the whole statement to show one page. | **Accepted** |
| CR-028 | CCR-24 (17-01) | §22.4 | new endpoint | `POST /parties/bulk-archive {ids[], reason?}` → `{archived[], skipped[{id, name, code, balance}]}`; 400 above 200 ids. The skip set is computed by the database in one statement, not by a read-then-write loop. | **Accepted** |
| CR-029 | CCR-25 (17-01) | §22.4 | new endpoint | The tag endpoints (list, create, rename, merge, delete, bulk add/remove on parties) plus error codes `tag_name_taken`, `tag_limit_reached`, `too_many_rows`. PTY-05 is an MVP feature with no endpoints in Part 22. | **Accepted** |
| CR-031 | CCR-27 (17-01) | §22.4 | new endpoint | `GET /parties/{id}/credit-check?amount=&operation=entry|invoice` → `{status: ok|warn|block, mode, limit, exposure_before, exposure_after, available_before, over_by, can_override}`. A single PK read, idempotent, safe to call on every amount change. The write path performs the same check on the row it already locks, so this endpoint adds zero queries to writes. | **Accepted** |
| CR-033 | CCR-29 (17-01) | §22.4 | new endpoint | `POST /parties/bulk {parties[], source}` → `{created[], skipped[{index, mobile, code, existing_party_id?}]}`, for the phone-contacts importer. Each row runs full PTY-01 validation server-side; a duplicate mobile is skipped, never merged silently. | **Accepted** (Phase 2) |
| CR-037 | CCR-1 (17-02) | §22.5 | endpoint delta | On `POST /ledger-entries`, only `entry_type='opening'` may be requested by the client; every other entry type is derived from `direction` and the source. This closes the door on a client inventing an entry type the ledger's reporting logic does not expect. | **Accepted** |
| CR-038 | CCR-2 (17-02) | §22.1 | new error code | Register 409 `party_archived` in the stable error list. Cited by 17-01 PTY-01 as well, which is how the two chapters found each other. | **Accepted** |
| CR-039 | CCR-3 (17-02) | §22.10 | new endpoint | The attachment upload endpoint used before the ledger-entry POST, so a failed photo upload never blocks saving the entry. | **Accepted** |
| CR-041 | CCR-5 (17-02) | §21.3.1 well-known keys | new setting | Register `ledger.notify_owner_on_staff_entry` (boolean, default off) gating the `staff_entry_posted` in-app notification to owners. | **Accepted** |
| CR-042 | CCR-6 (17-02) | §22.5 | endpoint delta | `GET /ledger-entries/{id}` returns `messages: [{channel, status, sent_at}]`, and each row of `GET /parties/{id}/ledger-entries` carries `last_message_status`, so the SMS-delivery glyph on the timeline does not need a request per row. | **Accepted** |
| CR-044 | CCR-8 (17-02) | §22.5 | clarification | `GET /parties/{id}/statement.pdf` is a Phase 2 route (server-side PDF, ADR-014) and is explicitly **not mounted** at MVP. Part 22 should say so rather than leaving the path implied. | **Accepted** |
| CR-045 | CCR-10 (17-02) | §21.3.3 | clarification | Add `sms_notice` to the documented value set of `parties_party.consent_source`, for consent captured by the SMS notice itself. | **Accepted** |
| CR-047 | CCR-12 (17-02) | §22.12 | new endpoint | `POST /webhooks/notifications/whatsapp` with HMAC `X-Hub-Signature-256` verification; `GET /reminders` rows gain `cost` from the joined message log; new setting `ledger.auto_reminder_channel`. | **Accepted** (Phase 2) |
| CR-049 | CCR-14 (17-02) | §22.7 | new endpoint | `POST /payments/{id}/allocations` to apply an existing advance to a later document. At MVP an advance shows on the party balance but documents remain due until allocated manually; this endpoint is what makes that manual step possible. | **Deferred** — Phase 2, as the raising chapter itself proposes. |
| CR-051 | CCR-16 (17-02) | §22.7 | new endpoint | `POST /payments/upi-intent {amount, note, party_id?, document_id?}` → `{upi_url, web_url, qr_svg_url}`, with `tr` reference conventions per source (`INV-…`, `PTY-…`, `RM-…`). | **Accepted** |
| CR-052 | CCR-17 (17-02) | §22.7 | endpoint delta | `GET /payments/{id}` gains `party_balance_after`, `messages[]` and `share: {url, expires_at} | null`, and the message-log UI at `/settings/messaging/log` is specified as an owner/admin surface. | **Accepted** |
| CR-053 | CCR-18 (17-02) | §21.3.1 well-known keys | new setting | Register `payments.receipt_template ∈ {a5, thermal80}` (default `a5`, seeded `thermal80` for `business_type ∈ {retail, food}`) and `payments.receipt_sms_on_record` (boolean, default off). | **Accepted** |
| CR-054 | CCR-19 (17-02) | §22.7 | new endpoint | `POST /payments/{id}/send-receipt {channel}` → 202 `{message_log_id}` for a manual receipt resend. | **Accepted** |
| CR-055 | CCR-20 (17-02) | §22.1 | new error code | Register 409 `party_opted_out` (the party has `sms_opt_in=false`) and 409 `channel_not_configured` (no SMS provider in production), plus `POST /payments/{id}/share-links` with `expires_in_days` 1–90, default 30. | **Accepted** |
| CR-056 | CCR-21 (17-02) | §21.3.1 well-known keys | new setting | Register `payments.link_expiry_hours` (default 72) governing payment-link expiry. | **Accepted** (Phase 2) |
| CR-058 | CCR-23 (17-02) | §22.7 | new endpoint | `POST /payments/provider/connect {provider, key_id, key_secret, webhook_secret}` — owner only, behind an OTP step-up; stores `key_id` in settings and the secrets encrypted in `platform_tenant_secret` (CR-057); validated by a live call before it is saved; secrets never returned by any GET. | **Accepted** (Phase 2) |
| CR-060 | CCR-25 (17-02) | §22.12 | clarification | Document that webhook processing is asynchronous through `platform_job` rather than inline: the endpoint stores the event and enqueues `payments.process_webhook_event`, the handler takes an advisory lock on `(tenant_id, provider_payment_id)` and exits early if a payment with that id already exists. Retry schedule 1/5/15/60/240/720 minutes. | **Accepted** (Phase 2) |
| CR-063 | CCR-28 (17-02) | §22.7 | new endpoint | The unmatched-payments queue (PAY-07): list, one-tap map to a party, and the learned `payments_vpa_mapping` write. | **Accepted** (Phase 2) |
| CR-067 | CCR-32 (17-02) | §22.8 | endpoint delta | `PATCH /expenses/{id}` carrying `version`, editable only while `status='recorded'`, within 24 hours of creation, by the creator or an owner/admin, and only when the expense has no payment allocations. Amount is deliberately not editable — a wrong amount is voided and re-entered. | **Accepted** |
| CR-069 | CCR-34 (17-02) | §22.8 | new endpoint | `POST /expense-categories/{id}/archive` and `/restore`; hard `DELETE` permitted only when the category has never been used and is not a system category. | **Accepted** |
| CR-081 | CCR-02 (17-03) | §22.6 | new endpoint | `PATCH` and `DELETE` on the category and unit masters. Canon exposes only `GET`/`POST`, so rename and deactivate are impossible and the UI has to say "Rename coming soon" for an MVP master-data screen. | **Accepted** |
| CR-082 | CCR-03 (17-03) | §22.6 | endpoint delta | Expose `uqc_code` mapping on the unit master, so GST returns can carry the statutory unit-quantity code without a second lookup table in the client. | **Accepted** |
| CR-083 | CCR-04 (17-03) | §22.6 | endpoint delta | `POST /stock-adjustments` responds with per-line `on_hand_before`, `on_hand_after`, `avg_cost_after` and `value_impact`, a `value_impact_total`, and `meta.movements[]`. An adjustment whose valuation effect is invisible is an adjustment a merchant cannot check. | **Accepted** |
| CR-084 | CCR-05 (17-03) | §21.3.1 well-known keys | new setting | Register `labels.templates` holding per-tenant label-sheet margins and offsets for INV-15 barcode label printing. | **Accepted** (Phase 2) |
| CR-085 | CCR-06 (17-03) | §22.12 | clarification | Register the `landed_cost_revalued` in-app notification type, raised when a post-record revaluation moves an item's average cost by more than 10 %. Internal bookkeeping only — no SMS, no WhatsApp. | **Accepted** (Phase 2) |
| CR-087 | CCR-08 (17-03) | §0.9 permissions | new permission | Over-receipt acceptance currently borrows `purchases.bill.void` as an admin marker. A dedicated codename is requested. | **Accepted** (Phase 2) — merge with CR-089 when allocating codenames. |
| CR-089 | CCR-10 (17-03) | §0.9 permissions | new permission | Add a dedicated `purchases.debit_note.write` codename rather than overloading `purchases.bill.write`. | **Accepted** (Phase 2) |
| CR-090 | CCR-11 (17-03) | §22.6 | new endpoint | The debit-note lifecycle: `POST /purchases/debit-notes/{id}/issue`, `/apply {bill_id, amount}`, `/refund {mode_breakup[], …}`, and `/void`. | **Accepted** (Phase 2) |
| CR-094 | CCR-15 (17-03) | — | clarification | The PUR-08 dependency list, recording that landed cost touches PUR-01, PUR-04, PUR-07, INV-01, INV-06, INV-08, EXP-01, RPT-04 and `manage.py recalc_stock`. No contract change; recorded so the dependency is not lost when CR-091 and CR-092 are applied. | **Accepted** |
| CR-095 | CCR-16 (17-03) | §0.8 route map | new endpoint | Register the landed-cost routes as additions to the canon route map. | **Accepted** (Phase 2) |
| CR-097 | CCR-19 (17-03) | §22.9 | new endpoint | `GET /imports/{id}/errors.csv` — streams the user's original rows plus `_row`, `_column` and `_problem` columns for every failing row, built lazily and cached as an attachment. Values are injection-neutralised. This is the difference between a merchant fixing a 5,000-row import and abandoning it. | **Accepted** |
| CR-099 | CCR-22 (17-03) | §22.6 | new endpoint | `POST /items/bulk-price-update/preview` and `POST /items/bulk-price-update` with `{selection, target, operation, value, rounding, skip_zero}`, where `operation ∈ {set, increase_percent, decrease_percent, increase_amount, decrease_amount, set_margin_over_purchase}` and `rounding ∈ {none, nearest_1, nearest_5, nearest_10, end_99, end_95}`. | **Accepted** (Phase 2) |
| CR-100 | CR-SAL-1 (17-04) | §0.8 route map; §22.6 | new endpoint | `POST /sales/<kind>/{id}/duplicate` creating a new draft that copies party, lines, discounts, notes, terms and place of supply, with `document_date` reset to today and number, status, payments and conversion links deliberately not copied. SAL-06 is an MVP feature and the path is not in the canon route map. | **Accepted** |
| CR-101 | CR-SAL-2 (17-04) | §21.3.1 well-known keys | new setting | Register `sales.auto_print` (auto-dismiss the post-issue success sheet and go straight to print on desktop) and `sales.allow_free_text_lines` (permit lines with `item_id NULL`, which require a description and tax code and never move stock). | **Accepted** |
| CR-102 | CR-SAL-4 (17-04) | §22.6 | clarification | Print count is tracked as a client-side analytics event (`ub.sales.document_printed`), **not** as a server mutation. `meta.print_count` stays reserved for the Phase 2 server-side PDF. Recorded because the obvious alternatives — a `POST …/print-events` endpoint, or a `PATCH` on an issued document — are both wrong, and the next author to look at this needs to know that was considered. | **Accepted** |
| CR-103 | CR-SAL-5 (17-04) | §22.6 | new endpoint | `POST /sales/delivery-challans/{id}/convert {lines?: [{line_no, qty}]}` creating a draft invoice for the selected quantities; partial conversion keeps the challan `issued` with `meta.converted_qty` per line until fully converted. | **Accepted** (Phase 2) |
| CR-105 | CR-SAL-7 (17-04) | §22.7 | new endpoint | `POST /payment-requests/{id}/claim {utr}` — the "Paid? Enter UTR" path on the public document page for UPI intent, which has no callback. Moves the request to `pending` and creates an entry in the unmatched/claims queue for one-tap confirmation. | **Accepted** (Phase 2) |
| CR-107 | CR-RPT-2 (17-04) | §22.11 | new endpoint | `GET /reports/gst-summary` with its full parameter set and the `outward`/`hsn`/`docs`/`inward`/`gstr3b`/`exceptions` payload; `format=xlsx` returns the workbook synchronously below 5,000 contributing documents and 202 + `export_id` above it. | **Accepted** |
| CR-108 | CR-RPT-3 (17-04) | §21.3.1 well-known keys | new setting | Register `gst.b2cl_threshold` and `gst.composition_rate`. Both are legislated values that change without warning and must not be constants in code. | **Accepted** |
| CR-109 | CR-RPT-5 (17-04) | §22.1 | new error code | Add `export_expired` (410) and `export_queue_full` (429) to the stable error list. | **Accepted** |
| CR-110 | CR-RPT-6 (17-04) | §22.11 | new endpoint | `GET /reports/item-movement` with velocity classification, comparison window and `format=json|csv|xlsx`, plus the four settings keys `reports.velocity_*`, `dead_window_days` and `new_item_days`. §22.11 lists no item-movement report at all. | **Accepted** (Phase 2) |
| CR-111 | CR-RPT-7 (17-04) | §22.11 | new endpoint | `GET /reports/profit-summary` returning `{periods[], breakdown[]}` with expense allocation options, plus the Phase 2 entitlement key `reports.profit`. | **Accepted** (Phase 2) |
| CR-112 | CR-RPT-8 (17-04) | §22.11 | new endpoint | `GET /reports/staff-performance` and `GET /reports/staff-performance/{user_id}` with `daily[]` and three paginated document sub-resources. | **Accepted** (Phase 2) |
| CR-113 | CR-RPT-9 (17-04) | §22.11 | new endpoint | The GSTR-1 JSON preview and generate endpoints, the settings keys `gst.gstr1_json_version` and `gst.filing_frequency`, and four new error codes: `gstr1_blocked`, `gstr1_warnings_unacknowledged`, `period_not_closed`, `schema_validation_failed`. | **Accepted** (Phase 2) |
| CR-114 | CR-HLP-1 (17-04) | §22.12 | new endpoint | The help-content endpoints: `GET /help/articles`, `GET /help/articles/{slug}`, `GET /help/topics`, `POST /help/articles/{slug}/feedback`, with the management commands that seed and recount them. | **Accepted** (Phase 2) |

### 43.4.3 Target: Part 0 — Canon

| Global ID | Original ID(s) & source | Target section | Nature | Change | Status |
|---|---|---|---|---|---|
| CR-050 | CCR-15 (17-02) | ADR-021 dependency allow-list | clarification | PAY-03's UPI QR is specified as an in-house pure-Python encoder (QR Model 2, byte mode, EC level M, versions 1–10, ISO/IEC 18004 mask selection). The chapter offers `segno` as an alternative "if the team prefers not to maintain the encoder" — which would be a new entry on the closed ADR-021 allow-list. | **Deferred ⚠ decision needed** — see §43.4.6 C3. |
| CR-087, CR-089 | CCR-08, CCR-10 (17-03) | §0.9 permission codenames | new permission | See §43.4.2. Both add codenames to the canon permission list and should be allocated together so the purchases codename family stays symmetrical with sales. | **Accepted** (Phase 2) |
| CR-095, CR-100, CR-103 | CCR-16 (17-03); CR-SAL-1, CR-SAL-5 (17-04) | §0.8 route map | new endpoint | Three chapters found routes they needed that the canon route map does not list. Recorded here as well as under Part 22 because the canon route map is the list the frontend router is generated from. | **Accepted** |

### 43.4.4 Target: Part 16 — Feature Catalogue

| Global ID | Original ID(s) & source | Target section | Nature | Change | Status |
|---|---|---|---|---|---|
| CR-118 | — (raised by this reconciliation pass) | §16.15 Phase totals | clarification | The phase-totals table stated 67 MVP / 41 Phase 2 / 24 Phase 3 / 5 Future = 137. A row-by-row count of the phase column across all fourteen module tables gives 74 / 37 / 19 / 1 = 131. The summary was an early estimate never re-derived after the module tables were finalised; the rows are authoritative and the table has been corrected to match them, with a dated note recording the change. This also answers OQ-01 in Part 18 §18 — the catalogue is not missing rows; the summary was wrong. | **Absorbed** (applied 2026-09-18) |

### 43.4.5 Target: Part 19 / Part 23 — Frontend and Design System

| Global ID | Original ID(s) & source | Target section | Nature | Change | Status |
|---|---|---|---|---|---|
| CR-021 | CCR-17 (17-01) | §23 typography | clarification | Partner font uploads (`files_attachment.kind='font'`) feed the WLB-05 typography override. Recorded against Part 23 as well as Part 21 because the token contract has to name which font slots a partner may replace. | **Accepted** (Phase 2) |
| CR-085 | CCR-06 (17-03) | §23 palette | clarification | The `landed_cost_revalued` notification uses the standard in-app notification treatment; no new tone is introduced. | **Accepted** (Phase 2) |

### 43.4.6 Contradictions — changes that need a decision

Five pairs of change requests do not merely overlap; they propose incompatible things. Where that happens this register records **both positions** and picks neither. Each is carried into Part 37's open-questions register as an `OQ-` entry, and each blocks the corresponding Part 21 amendment until it is answered.

**C1 — What shape is `parties_share_link`?**  *CR-035 (17-01 CCR-31) vs CR-043 (17-02 CCR-7 + CCR-41).*
17-01 treats the table as a party-khata share link and extends it in place: `kind varchar(16) NN default 'khata'`, `label`, `token_suffix`, `last_viewed_at`. 17-02 treats it as the platform's one share-link table for any entity and generalises it: `kind varchar(24) NN` with no default, `party_id` becomes nullable, and new `related_type`/`related_id`/`params jsonb`/`locale` columns carry statements, payment receipts and public documents. The two are not additive: one makes `party_id` mandatory and the `kind` column a narrow enum with a party default; the other makes `party_id` optional and `kind` an open discriminator. Applying 17-01's version first and 17-02's second would require a second migration that widens `kind` and drops a `NOT NULL` on a table that already holds live tokens.
*Positions.* 17-01's is simpler and matches MVP scope, where the only share link is a khata link. 17-02's is what PAY-04 receipt sharing, SAL-03 public invoices and NTF-03 all need, and three of those four consumers are already specified. **Recommendation for the decision: adopt the generalised form (CR-043) and treat CR-035's `label` and `token_suffix` as additions to it**, because the generalisation is cheap now and expensive after tokens exist in production. But this register does not make that call. **Deferred; both blocked until decided.**

**C2 — May `files_attachment.tenant_id` be NULL?**  *CR-018 (17-01 CCR-14) vs Part 21 §21.1 rule 1 and Part 20 §20.4.*
17-01 needs to store a partner's logo and fonts, which belong to a partner and not to any tenant, and proposes making `files_attachment.tenant_id` nullable for `owner_type='partner'`. Part 21 §21.1 rule 1 and the `TenantModel` base make `tenant_id` non-null on every business row, and Part 20's tenancy layer relies on that: the scoped manager, the two-tenant isolation fixture and the Phase 2 RLS policy all assume a non-null tenant column. A nullable `tenant_id` on an attachment table punches a hole in the mechanism that the whole isolation story rests on.
*Positions.* (a) Make the column nullable and special-case `owner_type='partner'` in the manager — least migration work, most risk to the isolation invariant. (b) Give partners their own `platform_partner_asset` table — keeps the invariant intact, costs one small table and a second upload path. (c) Store partner assets against a designated system tenant — keeps both the invariant and one upload path, at the cost of a slightly dishonest row. **Deferred ⚠ — this is a security-adjacent decision and belongs with the Part 27 author, not with a chapter author.**

**C3 — In-house QR encoder, or `segno`?**  *CR-050 (17-02 CCR-15) vs ADR-021.*
17-02 specifies a pure-Python QR encoder inside `payments/qr/` (about 400 lines: encoder, mask selection, SVG renderer) and, in the same paragraph, offers `segno` as an alternative if the team would rather not maintain it. ADR-021's backend dependency allow-list is closed; adding `segno` is a new ADR, not a preference.
*Positions.* Writing it keeps the allow-list closed and the dependency count at ADR-021's number, at the cost of owning an ISO/IEC 18004 implementation that must be right the first time — a wrong mask or a wrong error-correction level produces a QR that scans on the developer's phone and not on the merchant's customer's. Taking `segno` costs one pure-Python, zero-dependency package and an ADR. **Deferred ⚠ — needs an ADR either way; it cannot be settled inside an FRD.**

**C4 — Which tables get the optimistic-concurrency `version` column?**  *CR-066 (17-02 CCR-31) vs CR-003 (20 CR-BE-3).*
Part 20 adds `version` to `sales_document` and `purchases_document` and states explicitly that "nothing else in this chapter adds a column". 17-02 adds `version int NN default 1` to `expenses_expense` so that EXP-01's 24-hour edit window uses the same `If-Match`-style contract. Neither is wrong; they disagree about whether `version` is a property of *documents* or of *every mutable financial row*.
*Positions.* Documents-only is the narrower contract and matches Part 22 §22.7, which describes concurrency in terms of documents. All-mutable-rows is more consistent for a client that has to know, per endpoint, whether to send a version. Expenses, payments and stock adjustments are all editable or voidable and all have the same two-staff-on-one-counter race. **Deferred ⚠ — the answer determines whether Part 22 §22.1 states a general rule or an endpoint-by-endpoint one.**

**C5 — How does `imports_job` carry its configuration?**  *CR-036 (17-01 CCR-32) vs CR-096 (17-03 CCR-17 + CCR-21).*
17-01 adds `column_map jsonb NOT NULL DEFAULT '{}'` holding the user's column mapping between the validate and commit phases. 17-03 adds `options jsonb` holding `mode`, `match_on`, `source`, `selection` and `reverts_job_id`, and extends `result` with `diff_summary`, `diff_rows`, `revert` and `reverted_by`. Both are a per-job configuration blob on the same table under different names; applying both gives `imports_job` two config columns with overlapping purposes, which guarantees that in six months one of them will be the one nobody populates.
*Positions.* (a) One `options jsonb` column with `column_map` as a key inside it — one column, one convention, one migration. (b) Two columns, on the argument that the column mapping is a distinct concern from the import mode. **Recommendation for the decision: (a).** Each chapter also proposes a different partial index on the same table; whichever shape is chosen, the two index proposals should be merged into one. **Deferred; both blocked until decided.**

These five are the entirety of the contradictory set. Every other overlap between chapters turned out to be either the same change described twice (merged, seven cases) or two genuinely additive changes to the same table (recorded separately, applied in either order).

## 43.5 The ordered application plan

Applying 118 change requests in an arbitrary order will produce a schema that needs to be migrated twice. This is the order.

### 43.5.1 Already applied

**CR-001, CR-002, CR-003, CR-004, CR-005 and CR-118** are **Absorbed**: applied to Part 21 (the first five) and Part 16 (the last) on 2026-09-18, as part of this reconciliation pass. Part 20 §20.8.2 carries a cross-reference pointing at Part 21 §21.3.1 for the `platform_job` column specification; the two sections must from now on be changed together, with Part 21 authoritative for columns, indexes and cascades and Part 20 authoritative for the runner's behaviour.

### 43.5.2 Gate 1 — must be applied to Part 21 before the first migration is written

These change the MVP schema. A migration written before they land will need a second migration to correct it, and two of them touch tables that hold immutable rows, where a corrective migration is expensive.

| Order | Global ID | Why it is a gate |
|---|---|---|
| 1 | CR-106 | `reports_snapshot` is referenced by Part 21 §21.4's own dashboard row and assigned to the `reports` app by Part 20, but has no definition anywhere. The dashboard cannot be built without it. |
| 2 | CR-098 | `reports_export` gains `resource`, `created_by_id`, `size_bytes` and two indexes. Every MVP report's async path writes this table. |
| 3 | CR-040 | The partial unique index on the opening ledger entry. Adding a unique index to `ledger_entry` after it holds production rows means dealing with the violations first. |
| 4 | CR-023 | The `display_code` partial unique index, for the same reason. |
| 5 | CR-030 | `IX(tag_id)` on `parties_party_tag` and the functional case-insensitive unique on `parties_tag`. The functional index *replaces* an existing constraint, which is far cheaper before any tenant has tags. |
| 6 | CR-025 | The two party-list indexes. Not correctness-critical, but they are in the same migration as CR-030 and Part 21 §21.8 wants index work batched. |
| 7 | CR-065 | The seven `expenses_expense` columns. `paid` and `due_on` change whether an expense posts a ledger entry, which is business logic, not a display concern — it must be decided before EXP-01 is built. |
| 8 | CR-068 | The `expenses_category` extension, including `system_code`, which PAY-06 depends on to route settlement fees. |
| 9 | CR-072, CR-074 | The notification and message-log extensions. `notifications_message_log` is written on the first SMS the product ever sends; `segments` and `cost_source` cannot be backfilled for messages already sent. |
| 10 | CR-075, CR-045 | `parties_party.locale` and the `sms_notice` consent value. Both are single-column additions on a table that is created in the first migration anyway. |
| 11 | CR-021 | Register `font` as an attachment kind — an enum value, but one that is validated on upload. |
| 12 | CR-034 | The party-merge column and the `forbid_update_delete` trigger amendment. The trigger is created in the first migration; amending a trigger later means re-creating it, which on an append-only table is a change worth doing once. |

**Blocked on a decision, and therefore also Gate 1 if answered in time:** CR-018 (C2), CR-036 / CR-096 (C5), CR-066 (C4), CR-035 / CR-043 (C1). Of these, **C1 and C5 must be answered before the first migration** — both concern tables (`parties_share_link`, `imports_job`) that exist at MVP, and both choices are cheap now and expensive later. C2 must be answered before the first partner logo is uploaded. C3 must be answered before PAY-03 is built. C4 can be answered as late as the first mutable-expense endpoint, but answering it early is free.

### 43.5.3 Gate 2 — must be applied to Part 22 before the first endpoint is written

These are MVP endpoints, deltas and error codes with no home in the API specification. An engineer or coding agent working from Part 22 alone will not build them.

| Order | Global IDs | Group |
|---|---|---|
| 1 | CR-008, CR-011, CR-038, CR-055, CR-109 | Cross-cutting contract: the `X-Tenant-Id` header, `ETag`/`If-Match` on settings, and four stable error codes (`party_archived`, `party_opted_out`, `channel_not_configured`, `export_expired`, `export_queue_full`). These change the shape of every endpoint's documentation, so they go first. |
| 2 | CR-006, CR-007, CR-009, CR-013, CR-014, CR-016, CR-017 | Platform and auth: tenant creation, onboarding resume, invitation acceptance, session management, account deletion, the super-admin console, the per-tenant manifest. PLT-09 and PLT-14 are MVP features with no endpoints at all today. |
| 3 | CR-024, CR-027, CR-028, CR-029, CR-031, CR-015 | Parties: the `GET /parties` deltas, the ledger-entry list deltas, bulk archive, the tag endpoints, credit-check, and DPDP erasure. PTY-05 and PTY-06 are MVP features with no endpoints today. |
| 4 | CR-037, CR-039, CR-042, CR-044 | Ledger: the entry-type restriction, the attachment upload, the message-status fields on entries, and the explicit statement that the server-rendered statement PDF is not mounted at MVP. |
| 5 | CR-051, CR-052, CR-054 | Payments: the UPI intent endpoint, the payment-detail additions, the manual receipt resend. |
| 6 | CR-067, CR-069 | Expenses: the edit window and the category archive/restore lifecycle. |
| 7 | CR-081, CR-082, CR-083, CR-097 | Inventory and imports: `PATCH`/`DELETE` on masters, `uqc_code`, the adjustment response's before/after figures, and the import error CSV. |
| 8 | CR-100, CR-101, CR-102, CR-107, CR-108 | Sales and reports: document duplicate, the two sales settings, the print-count clarification, the GST summary endpoint, the two GST settings keys. |
| 9 | CR-010, CR-041, CR-053 | The remaining MVP `platform_tenant_setting` well-known keys. These go last only because they are additions to one list in Part 21 §21.3.1 and are best applied in a single edit. |
| 10 | CR-012, CR-022, CR-064, CR-070 | The remaining MVP indexes and the messaging delivery webhook. |
| 11 | CR-087, CR-089, CR-095 | Canon additions: two permission codenames and the route-map entries. Applied to Part 0, not Part 22, but in the same pass so the frontend router and the permission map are generated from a consistent canon. |

### 43.5.4 Can follow — Phase 2 and later

Everything not listed above is Phase 2 or later and may be applied after the MVP build starts, provided it is applied before the feature that needs it is built. In dependency order within their own phase:

- **Payments aggregator (PAY-06, PAY-07):** CR-057 → CR-058 → CR-059 → CR-060 → CR-061 → CR-062 → CR-063 → CR-105. The credential table must exist before the connect endpoint; the webhook-event table before the webhook endpoint.
- **Messaging depth (LED-12, NTF-04/05/06):** CR-046 → CR-047 → CR-073 → CR-076 → CR-077 → CR-078 → CR-079 → CR-080 → CR-056. Consent columns first, then channel tables, then cost accounting.
- **Purchases depth (PUR-05…08):** CR-086 → CR-088 → CR-090 → CR-091 → CR-092 → CR-093 → CR-094. `inventory_valuation_adjustment` (CR-092) must land with or before the landed-cost charge table (CR-091), or `recalc_stock` silently stops being able to reproduce stock value.
- **Reports depth (RPT-09…12):** CR-110 → CR-111 → CR-112 → CR-113.
- **Help (HLP-01…03):** CR-114 → CR-115 → CR-116 → CR-117.
- **Sales depth (SAL-09, SAL-10):** CR-103 → CR-104.
- **Ledger and expense depth (LED-13, EXP-04):** CR-048, CR-071.
- **White-label depth (WLB-03…06):** CR-019 → CR-020, and CR-018 once C2 is decided.
- **Import/export depth (IMP-03):** CR-084, CR-099, and CR-096 / CR-036 once C5 is decided.
- **Parties depth (PTY-07, PTY-08):** CR-033, and CR-035 / CR-043 once C1 is decided.
- **Deferred on merit, not on phase:** CR-026 (cursor pagination — offset pagination is adequate at the MVP size envelope), CR-032 (the credit-limit index — required before any tenant exceeds 10,000 parties), CR-049 (advance allocation — Phase 2 by the raising chapter's own statement).

### 43.5.5 For Part 37's open-questions register

Five entries are handed to Part 37 as open questions requiring a named decision-maker and a date:

| Ref | Question | Blocks | Suggested owner |
|---|---|---|---|
| C1 | Is `parties_share_link` a party-khata table or the platform's generalised share table? | CR-035, CR-043; first migration | Backend architect |
| C2 | May `files_attachment.tenant_id` be NULL for partner-owned assets, or do partner assets get their own table? | CR-018; first partner logo upload | Security (Part 27) with backend architect |
| C3 | In-house QR encoder or `segno` on the ADR-021 allow-list? | CR-050; PAY-03 build | Whoever owns ADR-021 |
| C4 | Is optimistic concurrency a property of documents only, or of every mutable financial row? | CR-066, and the wording of Part 22 §22.1 | API owner |
| C5 | Does `imports_job` carry one `options jsonb` or separate `options` and `column_map` columns? | CR-036, CR-096; first migration | Backend architect |

## 43.6 Maintaining this register

One rule: **a change request that is not in this file does not exist.** An author who finds a gap in Parts 0, 21 or 22 allocates the next `CR-<NNN>` here, writes the entry, and cites the global ID in their own chapter. They do not start a local series, and they do not silently amend a foundation document — the register is what lets the next reader tell an intentional amendment from an accident. When a change moves from Accepted to Absorbed, the entry's status is updated and the date of application is recorded; the entry is never deleted, because the original citation in the raising chapter still needs somewhere to resolve.
