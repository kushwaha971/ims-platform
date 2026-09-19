# Part 21 — Database Architecture

## 21.1 Principles

1. **One PostgreSQL database, shared schema, `tenant_id` on every business row.** Tenant isolation is enforced in the application by the tenant-scoped manager (Part 20) and, from Phase 2, additionally by PostgreSQL row-level security policies keyed on `current_setting('app.tenant_id')`. The schema is designed so RLS can be switched on without changes.
2. **Ledgers are append-only.** `ledger_entry` and `inventory_stock_movement` have no `UPDATE`/`DELETE` paths in application code; corrections are new rows. A database trigger (`forbid_update_delete()`) is installed on both tables as defence-in-depth.
3. **Denormalised balances are caches.** `parties_party.balance`, `inventory_item_stock.on_hand`, `inventory_item_stock.avg_cost` and document `amount_paid/amount_due` are recomputable from the ledgers by `manage.py recalc_balances` and `recalc_stock`. Tests assert equality.
4. **Soft delete only for master data** (`deleted_at`). Documents are voided (status), never deleted. Ledgers never deleted.
5. **UUID v7 primary keys** (`uuid` column, generated in application via `uuid6.uuid7()`; Postgres 16 has no native v7). Human-readable numbers (`INV-2026-27/0001`) live in `number` columns backed by `platform_document_sequence`.
6. **Money** `numeric(14,2)`, **quantity** `numeric(14,3)`, **unit cost** `numeric(14,4)`, **rate/percent** `numeric(6,3)`. Never `float`.
7. **Timestamps** `timestamptz` in UTC (`created_at`, `updated_at` on every table). **Business dates** `date` in tenant timezone.
8. **Unique constraints are per tenant** and exclude soft-deleted rows (partial unique indexes `WHERE deleted_at IS NULL`).
9. **Every table gets** `created_by_id` (nullable FK to user, `ON DELETE SET NULL`) where a human creates the row.
10. **Foreign keys to tenant use `ON DELETE RESTRICT`**; tenant deletion is a background job that deletes children in dependency order after export (PLT-10).

Abstract base (Django): `TenantModel` adds `id (uuid, pk)`, `tenant (FK, db_index)`, `created_at`, `updated_at`, `created_by`; `SoftDeleteModel` adds `deleted_at` and the `all_objects`/`objects` managers.

## 21.2 Entity-relationship overview

```
Partner 1──* Tenant 1──* Membership *──1 User
                 │  1──* TenantSetting, DocumentSequence, Role(custom), Invitation, AuditLog
                 │
                 ├──* Party ──* PartyTag
                 │      │ 1──* LedgerEntry ──? (SalesDocument | PurchaseDocument | Payment | Expense)
                 │      │ 1──* Reminder
                 │      └──* SalesDocument, PurchaseDocument, Payment
                 │
                 ├──* Category, Unit, Location, TaxRate(global+tenant)
                 ├──* Item ──* ItemStock (per Location)
                 │      ├──* StockMovement ──? (SalesDocument | PurchaseDocument | StockAdjustment | StockTransfer)
                 │      └──* ItemVariant (P2), PriceListItem (P2), Batch (P3)
                 │
                 ├──* SalesDocument 1──* SalesDocumentLine ──1 Item
                 │        └──* PaymentAllocation *──1 Payment
                 ├──* PurchaseDocument 1──* PurchaseDocumentLine ──1 Item
                 │        └──* PaymentAllocation
                 ├──* Payment ──* PaymentAllocation ; Payment ──? PaymentRequest (P2)
                 ├──* Expense ──1 ExpenseCategory ; Expense ──? Party
                 ├──* Notification, MessageLog, Attachment(polymorphic), ImportJob
                 └──* HelpArticle (global, P2)
```

Relationship rules:

- A `LedgerEntry` always belongs to exactly one `Party`. It optionally references one source object via (`source_type`, `source_id`) — a sales document, purchase document, payment, expense, or another ledger entry (for reversals). Manual "you gave/you got" entries have `source_type = manual`.
- A `StockMovement` always belongs to one `Item` and one `Location`, optionally one `ItemVariant`/`Batch`, and references its posting document via (`source_type`, `source_id`).
- A `Payment` is one money event (in or out) for one party (or none for walk-in). It may be allocated to many documents through `PaymentAllocation`; Σ allocations ≤ amount; the unallocated remainder is an advance shown on the party balance.
- A `SalesDocument` of kind `credit_note` may reference `against_id` (an invoice). `estimate` may reference `converted_to_id`.

## 21.3 Table specifications

Column notation: `name type [constraints] — meaning`. `NN` = not null. `U(...)` = unique constraint/index. `IX(...)` = index. Common columns (`id`, `tenant_id`, `created_at`, `updated_at`, `created_by_id`) are listed once in §21.1 and omitted below unless different.

### 21.3.1 Platform

**`platform_partner`** — white-label reseller.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| id | uuid | PK | |
| code | varchar(32) | NN, U | Short code (`metis`, `hdfcbank`) |
| name | varchar(120) | NN | Display name |
| status | varchar(16) | NN, default `active` | `active`, `suspended` |
| branding | jsonb | NN, default `{}` | Default logo URL, colours, app name, legal footer (schema v1) |
| allowed_modules | text[] | NN | Module codes tenants may enable |
| default_plan_id | uuid | FK `platform_plan` NULL | |
| support_contact | jsonb | | phone, whatsapp, email, hours |
| hostnames | text[] | U per element (GIN) | Partner domains (P2) |
| settings | jsonb | NN default `{}` | Messaging sender IDs, etc. |

**`platform_plan`** — entitlement bundle. `code U`, `name`, `modules text[]`, `limits jsonb` (`{max_users, max_parties, max_invoices_per_month, storage_mb}`), `price_inr_month numeric(10,2) NULL`, `is_active`.

**`platform_tenant`** — a business.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| id | uuid | PK | |
| partner_id | uuid | FK partner NN | |
| plan_id | uuid | FK plan NN | |
| name | varchar(160) | NN | Trade name shown in app |
| legal_name | varchar(200) | | On documents if different |
| business_type | varchar(32) | NN | `retail`, `wholesale`, `distribution`, `services`, `trader`, `manufacturer`, `professional`, `food`, `other` |
| gst_type | varchar(16) | NN default `unregistered` | `unregistered`, `composition`, `regular` |
| gstin | varchar(15) | NULL, CHECK regex | Validated with checksum in app |
| pan | varchar(10) | NULL | |
| state_code | char(2) | NN | GST state code; supplier state for place-of-supply |
| address | jsonb | NN default `{}` | line1, line2, city, district, state, pincode |
| phone | varchar(15) | NN | |
| email | varchar(254) | NULL | |
| currency | char(3) | NN default `INR` | |
| timezone | varchar(64) | NN default `Asia/Kolkata` | |
| locale | varchar(8) | NN default `en` | Default UI language for new members |
| fy_start_month | smallint | NN default 4 | |
| enabled_modules | text[] | NN | Subset of plan.modules and partner.allowed_modules |
| branding | jsonb | NN default `{}` | logo_attachment_id, primary_hex, secondary_hex, doc_header, doc_footer, signature_attachment_id, app_name |
| bank_details | jsonb | | account name/number/IFSC/bank/branch |
| upi_vpa | varchar(80) | NULL | For QR |
| status | varchar(16) | NN default `active` | `active`, `suspended`, `pending_deletion`, `deleted` |
| deletion_requested_at | timestamptz | NULL | Cool-off start (PLT-10) |
| onboarding_step | smallint | NN default 0 | Wizard resume |

IX(partner_id), IX(status), U(gstin) WHERE gstin IS NOT NULL AND status <> 'deleted' — *decision:* one tenant per GSTIN per partner (`U(partner_id, gstin)`).

**`platform_user`** — person.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| mobile | varchar(15) | NN, U — E.164 (`+91XXXXXXXXXX`) |
| email | varchar(254) | NULL, U WHERE NOT NULL |
| full_name | varchar(120) | NN |
| password_hash | varchar(255) | NULL (OTP-only users) |
| locale | varchar(8) | NN default `en` |
| is_super_admin | boolean | NN default false |
| is_active | boolean | NN default true |
| last_login_at | timestamptz | NULL |
| mfa_secret | varchar(64) | NULL (super admins, P2) |
| token_epoch | integer | NN default 1 — bumped to invalidate every outstanding access token for this user at once |

`token_epoch` is the no-Redis answer to immediate global revocation (Part 20 §20.5.3). Access tokens carry the epoch they were minted under; the authentication class rejects a token whose epoch is behind the row. Bumping it is the operator action for a compromised account, and it is the only mechanism that cuts an access token before its 15 minutes elapse.

**`platform_membership`**

| Column | Type | Constraints |
|---|---|---|
| user_id | uuid | FK user NN |
| tenant_id | uuid | FK tenant NN |
| role_id | uuid | FK role NN |
| status | varchar(16) | NN default `active` (`invited`, `active`, `suspended`, `removed`) |
| is_default | boolean | NN default false — the tenant opened on login |
| joined_at | timestamptz | NULL |
| permissions_override | jsonb | NN default `{}` — per-member allow/deny (e.g. staff may adjust stock) |
| permissions_version | integer | NN default 1 — bumped on every role change or override edit |

U(user_id, tenant_id); IX(tenant_id, status).

`permissions_version` is the stored counterpart of the `ver` claim in Part 22 §22.2. Access tokens embed the version they were minted under; the permission class raises `token_stale` when the claim is behind the row, so a role change takes effect on the member's next request rather than at the next refresh. Any write that changes `role_id` or `permissions_override` must bump it in the same transaction.

**`platform_role`** — `tenant_id NULL` for system roles (`owner`, `admin`, `staff`, `accountant`), tenant-specific for custom roles (P3). Columns: `code varchar(32)`, `name`, `is_system boolean`, `permissions text[]` (codenames). U(tenant_id, code).

**`platform_invitation`** — `tenant_id`, `mobile`, `role_id`, `token_hash varchar(64) U`, `status`, `expires_at`, `invited_by_id`, `accepted_user_id NULL`. IX(tenant_id, status).

**`platform_otp_challenge`** — `mobile`, `purpose` (`login`, `signup`, `verify`, `reset`), `code_hash`, `attempts smallint`, `expires_at`, `verified_at NULL`, `ip inet`, `device_hint varchar(120)`. IX(mobile, created_at). Rows purged after 24 h.

**`platform_session`** — refresh-token family: `user_id`, `tenant_id NULL`, `family_id uuid`, `token_hash U`, `device_label`, `user_agent`, `ip`, `expires_at`, `revoked_at NULL`, `replaced_by_id NULL`. IX(user_id, revoked_at).

**`platform_tenant_setting`** — `tenant_id`, `key varchar(64)`, `value jsonb`, `schema_version smallint`. U(tenant_id, key). Well-known keys: `numbering` (per kind prefix/next/reset_fy), `sales.default_due_days`, `sales.default_kind`, `inventory.allow_negative_stock`, `inventory.enabled`, `ledger.credit_limit_mode` (`off|warn|block`), `ledger.reminder_templates`, `ledger.auto_sms` (`off|on`), `ledger.party_sms_on_entry`, `documents.terms`, `documents.show_upi_qr`, `locale.number_format`.

**`platform_document_sequence`** — `tenant_id`, `kind varchar(24)` (`estimate`, `invoice`, `bill_of_supply`, `credit_note`, `purchase_bill`, `debit_note`, `payment_in`, `payment_out`, `purchase_order`, `delivery_challan`, `stock_adjustment`, `stock_transfer`), `fy_label varchar(9)` (`2026-27`), `prefix varchar(12)`, `next_number int NN default 1`, `padding smallint default 4`. U(tenant_id, kind, fy_label). Allocation: `SELECT … FOR UPDATE` inside the posting transaction; numbers never reused; voided documents keep their number.

**`platform_audit_log`** — append-only.

| Column | Type | Meaning |
|---|---|---|
| id | uuid | |
| tenant_id | uuid NULL | NULL for platform-level events |
| actor_id | uuid NULL | user; NULL for system jobs |
| actor_type | varchar(16) | `user`, `system`, `webhook`, `super_admin` |
| action | varchar(64) | `party.created`, `invoice.issued`, `ledger.entry.reversed`, `member.role_changed`… |
| entity_type | varchar(48) | table/model name |
| entity_id | uuid NULL | |
| before | jsonb NULL | Snapshot of changed fields (critical entities only) |
| after | jsonb NULL | |
| metadata | jsonb | request_id, ip, user_agent, reason |
| created_at | timestamptz | |

IX(tenant_id, created_at DESC), IX(tenant_id, entity_type, entity_id). Partitioned by month from Phase 2 (`created_at` range partitions). Retention ≥ 7 years for financial actions (GST record-keeping 72 months).

**`platform_job`** — the background-work queue. ADR-012 admits no broker: asynchronous work is rows in this table, claimed by `manage.py run_scheduler`. Part 20 §20.8 owns the operational narrative (runner loop, registry, job catalogue, local development); this section is the schema's home.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| id | uuid | PK, default `uuid7()` | |
| tenant_id | uuid | FK `platform_tenant` **NULL**, ON DELETE RESTRICT | Tenant the work belongs to. NULL for platform-level jobs (purging idempotency keys across all tenants, per-tenant fan-out jobs) |
| job_type | varchar(64) | NN | Registry key `<app>.<verb>` — `notifications.send_party_entry_sms`, `sales.refresh_overdue`, `reports.build_export`, `imports.commit`. Absent from the registry ⇒ dead-lettered on first claim |
| payload | jsonb | NN default `{}`, CHECK `pg_column_size(payload) < 65536` | Handler arguments: ids and scalars only, never a serialised model, never PII beyond ids. 64 KB ceiling |
| status | varchar(12) | NN default `queued` | `queued`, `running`, `succeeded`, `failed`, `dead_letter`, `cancelled` |
| priority | smallint | NN default 100 | Lower runs first. 10 interactive (a user waits), 100 normal, 200 maintenance |
| run_after | timestamptz | NN default `now()` | Not eligible before this instant; carries delays and retry backoff |
| attempts | smallint | NN default 0 | Incremented at claim, not at completion |
| max_attempts | smallint | NN default 5 | Per-job override; dead-letter when `attempts >= max_attempts` |
| locked_at | timestamptz | NULL | Set at claim, cleared on completion; drives the visibility timeout |
| locked_by | varchar(64) | NULL | `{hostname}:{pid}:{runner_uuid}` of the claiming runner |
| started_at | timestamptz | NULL | First time this attempt began executing |
| finished_at | timestamptz | NULL | Terminal timestamp (`succeeded`, `dead_letter`, `cancelled`) |
| result | jsonb | NULL | Handler return value — a summary for observability, never a payload dump |
| error | text | NULL | Last exception class + message + truncated traceback (8 KB max). Never request bodies or PII |
| idempotency_token | varchar(128) | NULL | Caller-supplied dedupe token (Part 20 §20.8.9) |
| scheduled_key | varchar(96) | NULL | Recurring jobs: `{job_type}:{period_key}`, e.g. `sales.refresh_overdue:2026-09-18` |
| created_by_id | uuid | FK `platform_user` NULL, ON DELETE SET NULL | The human who caused the job, when there is one |
| created_at | timestamptz | NN | |
| updated_at | timestamptz | NN | |

```sql
-- The claim query's index. Partial, because only queued rows are ever claimed.
CREATE INDEX ix_job_claim ON platform_job (priority, run_after, created_at)
  WHERE status = 'queued';
-- Visibility-timeout sweep.
CREATE INDEX ix_job_stuck ON platform_job (locked_at) WHERE status = 'running';
-- Operator dashboards (Part 30 §30.6).
CREATE INDEX ix_job_tenant_recent ON platform_job (tenant_id, created_at DESC);
CREATE INDEX ix_job_status_recent ON platform_job (status, created_at DESC);
-- Deduplication: one live job per token.
CREATE UNIQUE INDEX uq_job_idem ON platform_job (tenant_id, job_type, idempotency_token)
  WHERE idempotency_token IS NOT NULL AND status IN ('queued','running','succeeded');
-- Recurring jobs: one row per job type per period, ever. This is the whole of the
-- distributed-cron implementation — the second runner's INSERT simply fails.
CREATE UNIQUE INDEX uq_job_scheduled ON platform_job (scheduled_key)
  WHERE scheduled_key IS NOT NULL;

ALTER TABLE platform_job ADD CONSTRAINT ck_job_attempts
  CHECK (attempts >= 0 AND attempts <= max_attempts + 1);
ALTER TABLE platform_job ADD CONSTRAINT ck_job_payload_size
  CHECK (pg_column_size(payload) < 65536);
```

Claiming is `SELECT … FOR UPDATE SKIP LOCKED` inside a CTE that feeds an `UPDATE … RETURNING`, so claim-and-mark is one round trip and any number of runners claim disjoint batches without blocking. A runner killed mid-job leaves a stale `locked_at`; the reaper returns rows whose lock is older than the job type's timeout (default 300 s) plus 60 s grace to `queued`. Because `attempts` was already incremented at claim, a job that repeatedly kills its runner still reaches `max_attempts` and dead-letters rather than looping. Retry backoff is 30 s doubling to a 1 h cap with ±20 % jitter. Retention: `succeeded` rows are deleted after 14 days by `platform.purge_jobs`; `dead_letter` rows are kept 180 days, because they are an operator's only record of work that never happened.

**`platform_idempotency_key`** — storage behind the `Idempotency-Key` contract in Part 22 §22.1. One row per (tenant, scope, key); the unique index is the lock that makes two concurrent identical requests impossible to both execute.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| id | uuid | PK | |
| tenant_id | uuid | FK tenant NN, ON DELETE RESTRICT | Keys are scoped per tenant |
| user_id | uuid | FK user NULL, ON DELETE SET NULL | The actor who first used the key |
| key | varchar(64) | NN | The client's `Idempotency-Key` header value |
| scope | varchar(48) | NN | Endpoint family: `ledger_entry`, `sales_invoice_issue`, `payment`, … |
| request_hash | char(64) | NN | `sha256(canonical_json(body) + method + path)`; a mismatch is 409 `idempotency_conflict` |
| status | varchar(12) | NN | `in_progress`, `completed` |
| response_status | smallint | NULL | Replayed HTTP status |
| response_body | jsonb | NULL | Replayed envelope |
| entity_id | uuid | NULL | Convenience pointer to the created row |
| created_at | timestamptz | NN | |
| completed_at | timestamptz | NULL | |
| expires_at | timestamptz | NN | `created_at + 24 h` (Part 22 §22.1) |

U(tenant_id, scope, key); IX(expires_at) for `platform.purge_idempotency_keys`, which runs hourly and deletes expired rows.

### 21.3.2 Files & notifications

**`files_attachment`** — `tenant_id`, `owner_type varchar(48)`, `owner_id uuid`, `kind varchar(24)` (`logo`, `signature`, `item_image`, `bill_photo`, `receipt`, `import_file`, `export_file`, `document_pdf`), `storage_key varchar(255) U`, `original_name`, `content_type`, `size_bytes bigint`, `width/height int NULL`, `sha256 char(64)`, `deleted_at`. IX(tenant_id, owner_type, owner_id).

**`notifications_notification`** — `tenant_id`, `user_id NULL` (NULL = all members with permission), `type varchar(32)`, `title`, `body`, `data jsonb` (deep-link route, ids), `read_at NULL`, `created_at`. IX(tenant_id, user_id, read_at, created_at DESC). Purged after 180 days.

**`notifications_message_log`** — `tenant_id`, `party_id NULL`, `channel` (`sms`, `whatsapp`, `email`, `push`), `template_code`, `to_address`, `payload jsonb`, `provider`, `provider_message_id`, `status` (`queued`, `sent`, `delivered`, `failed`, `skipped`), `error`, `cost numeric(8,4) NULL`, `sent_at`, `delivered_at`, `related_type/related_id`. IX(tenant_id, created_at DESC), IX(provider_message_id).

**`notifications_template`** — `partner_id NULL`, `tenant_id NULL`, `code`, `channel`, `locale`, `body` with `{{placeholders}}`, `dlt_template_id varchar(32) NULL`, `whatsapp_template_name NULL`, `is_active`. Resolution order tenant → partner → global.

### 21.3.3 Parties

**`parties_party`**

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| name | varchar(160) | NN | |
| display_code | varchar(24) | NULL | Optional short code |
| mobile | varchar(15) | NULL | E.164; U(tenant_id, mobile) WHERE mobile IS NOT NULL AND deleted_at IS NULL |
| alt_phone | varchar(15) | NULL | |
| email | varchar(254) | NULL | |
| is_customer | boolean | NN default true | |
| is_supplier | boolean | NN default false | |
| gstin | varchar(15) | NULL | Validated |
| gst_registration | varchar(16) | NN default `unregistered` | `unregistered`, `regular`, `composition`, `overseas` |
| billing_address | jsonb | NN default `{}` | |
| shipping_address | jsonb | NN default `{}` | |
| state_code | char(2) | NULL | Place-of-supply default |
| notes | text | | |
| balance | numeric(14,2) | NN default 0 | Cache: Σdebit − Σcredit of posted entries |
| receivable_total / payable_total | numeric(14,2) | NN default 0 | Caches for reporting |
| last_activity_at | timestamptz | NULL | Latest ledger entry time |
| collection_date | date | NULL | Next promised payment |
| credit_limit | numeric(14,2) | NULL | |
| credit_days | smallint | NULL | Default due days for this party |
| price_list_id | uuid | FK NULL (P2) | |
| sms_opt_in | boolean | NN default true | Party-level consent for transaction SMS |
| consent_source | varchar(32) | NULL | `verbal`, `form`, `link` (DPDP) |
| consent_at | timestamptz | NULL | |
| status | varchar(16) | NN default `active` | `active`, `archived` |
| deleted_at | timestamptz | NULL | |

IX(tenant_id, status, last_activity_at DESC), IX(tenant_id, balance), IX(tenant_id, collection_date), GIN trigram on `name` for search (`pg_trgm`), IX(tenant_id, is_customer), IX(tenant_id, is_supplier).

**`parties_tag`** — `tenant_id`, `name varchar(40)`, `color varchar(7)`. U(tenant_id, name). **`parties_party_tag`** — `party_id`, `tag_id`; U(party_id, tag_id).

**`parties_share_link`** (P2 PTY-09) — `party_id`, `token_hash U`, `expires_at`, `revoked_at`, `view_count`.

### 21.3.4 Ledger

**`ledger_entry`** — immutable.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| id | uuid | PK | |
| tenant_id | uuid | NN | |
| party_id | uuid | FK party NN | |
| direction | varchar(6) | NN CHECK in (`debit`,`credit`) | See canon §0.2 |
| amount | numeric(14,2) | NN CHECK > 0 | |
| entry_date | date | NN | Business date (past allowed; future not allowed) |
| entry_type | varchar(24) | NN | `opening`, `manual_gave`, `manual_got`, `invoice`, `credit_note`, `purchase_bill`, `debit_note`, `payment_in`, `payment_out`, `expense`, `write_off`, `interest` (P3), `reversal`, `correction` |
| source_type | varchar(32) | NN | `manual`, `sales_document`, `purchase_document`, `payment`, `expense`, `ledger_entry` |
| source_id | uuid | NULL | |
| note | varchar(255) | | |
| payment_mode | varchar(16) | NULL | For manual "got": `cash`, `upi`, `bank`, `cheque`, `card`, `other` |
| reference | varchar(64) | NULL | UTR/cheque no |
| status | varchar(10) | NN default `posted` | `posted`, `reversed` |
| reversed_by_id | uuid | FK self NULL | Set on the original when reversed |
| reverses_id | uuid | FK self NULL | Set on the reversal entry |
| supersedes_id | uuid | FK self NULL | Set on the replacement entry of a correction |
| reason | varchar(160) | NULL | Required on reversal/correction |
| running_balance_after | numeric(14,2) | NULL | Optional cache for statements, computed on read otherwise |
| created_by_id | uuid | | |
| created_at | timestamptz | NN | |

IX(tenant_id, party_id, entry_date, created_at), IX(tenant_id, source_type, source_id), IX(tenant_id, entry_date), IX(tenant_id, created_at DESC). Trigger `forbid_update_delete` except allowing update of `status`, `reversed_by_id` (the only mutable fields). Constraint: `reversal` rows must have `reverses_id NOT NULL`.

Balance recompute rule: `balance = Σ amount WHERE direction='debit' AND status='posted' − Σ amount WHERE direction='credit' AND status='posted'`; reversal entries are themselves `posted` with opposite direction, so either exclusion approach yields the same number — the implementation **excludes both the reversed entry and its reversal** when `include_corrections=false` in statements, but the balance formula simply sums all posted rows (reversal pairs cancel).

**`ledger_reminder`**

| Column | Type | Meaning |
|---|---|---|
| party_id | uuid FK | |
| due_on | date NN | |
| channel | varchar(12) | `whatsapp_manual`, `sms`, `whatsapp_api`, `call`, `in_app` |
| kind | varchar(12) | `manual`, `auto_d1`, `auto_d0`, `recurring` |
| status | varchar(12) | `scheduled`, `sent`, `failed`, `done`, `dismissed`, `cancelled` |
| message_log_id | uuid NULL | |
| snapshot_balance | numeric(14,2) | Balance at send time |
| note | varchar(255) | |
| scheduled_for | timestamptz NULL | |
| sent_at | timestamptz NULL | |

IX(tenant_id, status, due_on), IX(party_id, created_at DESC). U(party_id, due_on, kind) WHERE kind IN ('auto_d1','auto_d0') — one auto reminder per kind per date.

### 21.3.5 Tax

**`tax_rate`** — global rows (`tenant_id NULL`) seeded from GST law, tenant rows allowed for custom cess.

| Column | Type | Meaning |
|---|---|---|
| code | varchar(16) | `GST0`, `GST5`, `GST18`, `GST40`, `GST3`, `GST0_25`, `EXEMPT`, `NIL`, `NONGST`; legacy `GST12`, `GST28` |
| name | varchar(40) | |
| rate | numeric(6,3) | Total percent |
| cess_rate | numeric(6,3) | default 0 |
| effective_from | date | |
| effective_to | date NULL | e.g. `GST12` ends 2025-09-21 |
| is_active | boolean | |

U(tenant_id, code, effective_from). Rate lookup is always by `(code, document_date)`.

**`tax_hsn`** — reference table `code varchar(8)`, `description`, `default_tax_code`, `is_service boolean`. Loaded from public HSN master; searchable (`GIN` trigram).

### 21.3.6 Inventory

**`inventory_category`** — `name`, `parent_id NULL` (one level of nesting), `sort_order`. U(tenant_id, parent_id, name) WHERE deleted_at IS NULL.

**`inventory_unit`** — `code varchar(8)` (UQC: `NOS`, `KGS`…), `name`, `allow_decimal boolean`, `is_system boolean`. U(tenant_id, code). System units seeded with `tenant_id NULL`.

**`inventory_location`** — `name`, `code`, `address jsonb`, `is_default`, `is_active`. U(tenant_id, code). MVP auto-creates `MAIN` and hides the concept in UI until Phase 2.

**`inventory_item`**

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| name | varchar(160) | NN | |
| item_type | varchar(8) | NN | `goods`, `service` |
| sku | varchar(48) | NN | U(tenant_id, sku) WHERE deleted_at IS NULL |
| barcode | varchar(48) | NULL | U(tenant_id, barcode) WHERE barcode IS NOT NULL AND deleted_at IS NULL |
| category_id | uuid | FK NULL | |
| unit_id | uuid | FK NN | Primary unit |
| secondary_unit_id / conversion_factor | uuid NULL / numeric(12,4) NULL | | P2 |
| hsn_sac | varchar(8) | NULL | 4/6/8 digits |
| tax_code | varchar(16) | NN default `GST0` | FK-like to tax_rate.code |
| tax_inclusive_selling | boolean | NN default false | Whether selling_price includes tax |
| purchase_price | numeric(14,2) | NN default 0 | Last/known cost |
| selling_price | numeric(14,2) | NN default 0 | |
| mrp | numeric(14,2) | NULL | |
| track_stock | boolean | NN default true for goods | Services always false |
| reorder_point | numeric(14,3) | NULL | |
| track_batches | boolean | default false | P3 |
| has_variants | boolean | default false | P2 |
| image_attachment_id | uuid | NULL | |
| description | text | | |
| status | varchar(16) | NN default `active` | `active`, `archived` |
| deleted_at | timestamptz | NULL | |

IX(tenant_id, status, name), GIN trigram (name), IX(tenant_id, category_id), IX(tenant_id, barcode).

**`inventory_item_variant`** (P2) — `item_id`, `attributes jsonb` (`{size:"M", colour:"Red"}`), `sku U`, `barcode U`, price overrides NULL. Stock and lines reference `variant_id` when present.

**`inventory_item_stock`** — cache: `item_id`, `variant_id NULL`, `location_id`, `on_hand numeric(14,3) NN default 0`, `avg_cost numeric(14,4) NN default 0`, `last_movement_at`, `last_sequence_no integer NN default 0` (the high-water mark that allocates `inventory_stock_movement.sequence_no`), `cost_state varchar(8) NN default 'current'` ∈ `current`, `stale` (a backdated insert or a void has made the incremental pair unreliable and `inventory.recompute_item_cost` is pending), `cost_stale_since timestamptz NULL`. U(item_id, variant_id, location_id).

**`inventory_stock_movement`** — immutable.

| Column | Type | Meaning |
|---|---|---|
| item_id, variant_id NULL, location_id | uuid | |
| sequence_no | integer NN | Gap-free arrival counter per (item_id, location_id), allocated from `inventory_item_stock.last_sequence_no + 1` under the same row lock every writer already holds. Never reassigned. It is the tie-breaker of the canonical order below |
| batch_id | uuid NULL | P3 |
| movement_type | varchar(24) | `opening`, `purchase_in`, `sale_out`, `sale_return_in`, `purchase_return_out`, `adjust_in`, `adjust_out`, `transfer_in`, `transfer_out`, `stocktake_in`, `stocktake_out`, `reversal` |
| qty | numeric(14,3) NN CHECK <> 0 | Signed: + in, − out |
| unit_cost | numeric(14,4) NULL | Set on inbound (cost) and snapshotted on outbound (COGS = current avg) |
| avg_cost_after | numeric(14,4) NULL | Cache of running average after this movement |
| on_hand_after | numeric(14,3) NULL | Cache |
| reason | varchar(32) NULL | Adjustments |
| source_type / source_id | varchar(32) / uuid | Posting document |
| reverses_id | uuid NULL | |
| movement_date | date NN | Business date of the document |
| created_at | timestamptz | |

U(item_id, location_id, sequence_no), IX(tenant_id, item_id, location_id, movement_date, sequence_no) — the canonical-order index, which every replay scans — IX(tenant_id, source_type, source_id), IX(tenant_id, movement_date). Trigger `forbid_update_delete`: `qty`, `unit_cost`, `movement_date`, `sequence_no`, `movement_type`, `reverses_id` and every other column recording a fact are immutable. The **only** permitted updates are the two derived columns `avg_cost_after` and `on_hand_after`, and only from `inventory.recompute_item_cost` (§21.3.6 below), which re-derives them from the immutable facts — exactly as `ledger_entry` permits `status` and `reversed_by_id` and nothing else.

**The weighted-average costing rule — normative, and stated only here.**

This subsection is the single normative statement of stock costing. Part 20 §20.6.2 implements it and may not diverge from it; Part 17 §17.6.0, `INV-06`, `INV-08`, `PUR-01`, `PUR-04` and Part 28 §28.2.3/§28.2.5 cite it. Where any of them appears to say something else, this subsection governs.

**(1) Canonical order.** For one `(item_id, location_id)` the movement log is ordered by **`(movement_date, sequence_no)`**, ascending. Nothing else is a valid order: `created_at` is not stable under a bulk import that writes several rows in one statement, and `id` is a UUID. Every figure derived from the log — the incremental update, the replay, each movement's `avg_cost_after` / `on_hand_after`, and the `as_of` valuation of `INV-08` — uses this order and no other.

**(2) The incremental step.** Writing a movement applies exactly one step of the replay to `inventory_item_stock`, by cases on the movement itself:

| Case | Condition | `avg_cost_after` | `unit_cost` on the row |
|---|---|---|---|
| Inbound with a cost | `qty > 0`, `unit_cost` given, `on_hand > 0` | `(on_hand×avg + qty×unit_cost) / (on_hand + qty)` | as entered |
| Inbound, reset | `qty > 0`, `unit_cost` given, `on_hand ≤ 0` | `unit_cost` — a restart, not a blend | as entered |
| Inbound without a cost | `qty > 0`, `unit_cost` null | `avg` unchanged | current `avg_cost` |
| Plain outbound | `qty < 0`, `reverses_id` null | `avg` unchanged | snapshot of current `avg_cost` (COGS frozen at issue) |
| **Reversal of an inbound** | `qty < 0`, `reverses_id` → a row with `qty > 0` | value-removing: `(on_hand×avg − |qty|×c) / (on_hand − |qty|)` where `c` is the **reversed row's** `unit_cost`; when `on_hand_after ≤ 0`, `avg_cost_after = 0` | copy of the reversed row's `unit_cost` |
| **Reversal of an outbound** | `qty > 0`, `reverses_id` → a row with `qty < 0` | treated as an inbound at the reversed row's `unit_cost` (the cost the goods left at), by the two inbound cases above | copy of the reversed row's `unit_cost` |

A reversal of an inbound is therefore *not* a plain outbound. Treating it as one is the defect that left a voided bill's cost in the average (Part 41 BE-02); removing value at the cost that was blended in is what makes a void undo a receipt exactly when nothing has intervened.

**Rounding.** The quotient is quantised to 4 dp `ROUND_HALF_UP`, matching `numeric(14,4)`. The numerator is computed at full `Decimal` precision — intermediate products are never quantised, or a 3-dp quantity times a 4-dp cost loses paisa on every receipt. `on_hand` is quantised to 3 dp. Stock value is `round_half_up(on_hand × avg_cost, 2)` at display time, never stored.

**(3) Tail inserts and backdated inserts.** A write is a **tail insert** when its `movement_date ≥ max(movement_date)` over the existing movements of that `(item_id, location_id)` — its canonical position is last, so the incremental step in (2) *is* the final step of the replay and the cache equals the replay by construction. Any other write is a **backdated insert**: its canonical position is interior, every later row's derived pair is now wrong, and the incremental step must not be trusted. On a backdated insert the writer, in the same transaction:

1. writes the movement with `avg_cost_after` and `on_hand_after` **null**;
2. updates `inventory_item_stock.on_hand` by `qty` (quantity is order-independent and stays exact), leaves `avg_cost` untouched, and sets `cost_state = 'stale'`, `cost_stale_since = now()`;
3. enqueues `inventory.recompute_item_cost` on commit, idempotent on `(item_id, location_id, watermark_date)` where `watermark_date` is the earliest backdated `movement_date` of the burst, so a supplier's week of late bills collapses into one recomputation.

A backdated purchase therefore **does** change the average of every later movement, which is the behaviour the merchant expects and the behaviour `INV-08`'s `as_of` valuation already assumes. It is a bounded, visible, testable event, not a silent divergence.

**(4) Void and reversal.** Voiding a document posts its reversal movements dated the void date and, regardless of whether they are tail inserts, **enqueues `inventory.recompute_item_cost` for every affected `(item_id, location_id)`** and sets `cost_state = 'stale'`. The unconditional enqueue is deliberate: the value-removing step in (2) is exact only while the reversed row's cost is still the cost that was blended in, which a reset (`on_hand ≤ 0`) or an intervening backdated insert can falsify. The product re-derives the average; it never patches one in place.

**(5) A void that would drive on-hand negative.** The availability check runs before any reversal is written. When `inventory.allow_negative_stock = false` and any line would take `on_hand` below zero, the whole void is rejected — 409 `insufficient_stock`, nothing written. When the setting is `true` the void posts, `on_hand` goes negative, `avg_cost_after` is `0` by the reversal case in (2), and the next inbound resets the average to its own cost by the reset rule.

**(6) The replay.** `inventory.recompute_item_cost` is a pure function of the immutable columns: start from `(on_hand, avg) = (0, 0)`, walk the movements of one `(item_id, location_id)` in canonical order, apply (2) to each, write each row's `avg_cost_after` / `on_hand_after`, then write the final pair to `inventory_item_stock` and set `cost_state = 'current'`. It is idempotent, safe on production, and scoped to one item and location — bounded by that item's history, never by a tenant's.

**(7) What the nightly drift job compares.** `platform.check_invariants` (Part 20 §20.8.4, §20.11.5) compares, per `(item_id, location_id)` and reporting only: the cached `on_hand` against `SUM(qty)`; the cached `avg_cost` against the replay's final average; and every movement row's `(on_hand_after, avg_cost_after)` against the replay's value at that row. Rows whose `cost_state = 'stale'` are excluded and counted separately; a row stale for longer than fifteen minutes is itself a reported violation, because it means a recompute was enqueued and never ran. The job never writes a correction.

**`inventory_stock_adjustment`** — header: `number`, `adjustment_date`, `location_id`, `reason varchar(32)`, `note`, `status posted`. Lines are the movements with `source_type='stock_adjustment'`.

**`inventory_stock_transfer`** (P2) — `number`, `from_location_id`, `to_location_id`, `transfer_date`, `status` (`draft`, `in_transit`, `received`, `cancelled`), lines table `inventory_stock_transfer_line` (`item_id`, `variant_id`, `qty`).

**`inventory_price_list`** / **`inventory_price_list_item`** (P2) — `name`, `is_default`, `currency`; items: `price_list_id`, `item_id`, `variant_id NULL`, `price`. U(price_list_id, item_id, variant_id).

**`inventory_batch`** (P3) — `item_id`, `batch_no`, `expiry_date NULL`, `mfg_date NULL`. U(item_id, batch_no).

### 21.3.7 Sales

**`sales_document`**

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| kind | varchar(16) | NN | `estimate`, `invoice`, `bill_of_supply`, `credit_note`, `sales_order` (P3), `delivery_challan` (P2) |
| number | varchar(32) | NULL until issued | U(tenant_id, kind, fy_label, number) |
| fy_label | varchar(9) | NN | |
| status | varchar(16) | NN | Per canon §0.7 |
| party_id | uuid | FK NULL | NULL = walk-in |
| walk_in_name / walk_in_mobile | varchar | NULL | |
| document_date | date | NN | |
| due_on | date | NULL | Invoices |
| valid_until | date | NULL | Estimates |
| place_of_supply_state | char(2) | NN for tax docs | |
| is_inter_state | boolean | NN | Derived at issue: supplier state ≠ POS |
| reverse_charge | boolean | NN default false | |
| supplier_gstin_snapshot / party_gstin_snapshot | varchar(15) | | Frozen at issue |
| party_snapshot | jsonb | NN | name, address, gstin, state at issue time (documents must not change when party edited) |
| subtotal | numeric(14,2) | NN | Σ line taxable value before doc discount |
| discount_type / discount_value | varchar(8) / numeric(14,2) | | `percent` or `amount` at document level |
| discount_amount | numeric(14,2) | NN default 0 | |
| taxable_total | numeric(14,2) | NN | |
| cgst_total / sgst_total / igst_total / cess_total | numeric(14,2) | NN default 0 | |
| round_off | numeric(6,2) | NN default 0 | To nearest rupee when setting on |
| grand_total | numeric(14,2) | NN | |
| amount_paid | numeric(14,2) | NN default 0 | Cache from allocations |
| amount_due | numeric(14,2) | NN default 0 | grand_total − amount_paid − credits applied |
| against_id | uuid | FK self NULL | Credit note → invoice |
| converted_to_id / converted_from_id | uuid | FK self NULL | Estimate ↔ invoice |
| notes / terms | text | | |
| issued_at / voided_at | timestamptz | NULL | |
| void_reason | varchar(160) | NULL | |
| pdf_attachment_id | uuid | NULL | Cached rendered PDF at issue |
| public_token_hash | varchar(64) | NULL U | For share links |
| irn / irn_ack_no / irn_ack_date / signed_qr | | NULL | P3 e-invoice |
| eway_bill_no / eway_valid_until | | NULL | P3 |
| version | integer | NN default 1 | Optimistic-concurrency counter; incremented by every successful mutation |
| meta | jsonb | | Template id, print count |

IX(tenant_id, kind, status, document_date DESC), IX(tenant_id, party_id, document_date DESC), IX(tenant_id, due_on) WHERE status IN ('issued','partially_paid'), IX(tenant_id, number).

`version` implements the optimistic concurrency required by Part 22 §22.1 and §22.7: a mutating request carries the version it read (`If-Match`/body field), the update is `WHERE id = … AND version = …` and a zero-row result is 409 `version_conflict` rather than a silent last-writer-wins. It is the mechanism that makes two staff editing the same draft invoice safe on a shared shop counter.

**`sales_document_line`**

| Column | Type | Meaning |
|---|---|---|
| document_id | uuid FK NN | |
| line_no | smallint NN | U(document_id, line_no) |
| item_id | uuid FK NULL | NULL allowed for free-text line (services) if setting permits |
| variant_id / batch_id | uuid NULL | |
| description | varchar(255) NN | Snapshot of item name |
| hsn_sac | varchar(8) NULL | Snapshot |
| qty | numeric(14,3) NN CHECK > 0 | |
| unit_code | varchar(8) NN | Snapshot |
| unit_price | numeric(14,4) NN | Before tax if `tax_inclusive=false` |
| tax_inclusive | boolean NN | |
| discount_type / discount_value | | Line discount |
| discount_amount | numeric(14,2) | |
| taxable_value | numeric(14,2) NN | qty×price − discount (net of tax when inclusive) |
| tax_code | varchar(16) NN | |
| tax_rate | numeric(6,3) NN | Snapshot |
| cgst / sgst / igst / cess | numeric(14,2) NN default 0 | |
| line_total | numeric(14,2) NN | taxable_value + taxes |
| unit_cost_snapshot | numeric(14,4) NULL | COGS at issue |
| returned_qty | numeric(14,3) NN default 0 | Cache from credit notes |

### 21.3.8 Purchases

**`purchases_document`** — mirrors sales with `kind ∈ {purchase_bill, debit_note, purchase_order (P2), goods_receipt (P2)}`, plus `supplier_invoice_number varchar(48)`, `supplier_invoice_date date`, `itc_eligible boolean default true`, `against_id` (debit note → bill), `po_id` (GRN → PO). U(tenant_id, party_id, supplier_invoice_number) WHERE supplier_invoice_number IS NOT NULL AND status <> 'void' — prevents double-entry of the same supplier bill. **`purchases_document_line`** mirrors sales lines with `unit_cost numeric(14,4)`, `received_qty` (PO), `landed_cost_share` (P2). `purchases_document` also carries `version integer NN default 1` with exactly the semantics given for `sales_document.version` above — the two document tables must not diverge on concurrency handling.

### 21.3.9 Payments

**`payments_payment`**

| Column | Type | Meaning |
|---|---|---|
| number | varchar(32) | Receipt number (`RCT-…` / `PAYOUT-…`) |
| direction | varchar(3) | `in`, `out` |
| party_id | uuid NULL | NULL for walk-in sale payments |
| payment_date | date NN | |
| amount | numeric(14,2) NN CHECK > 0 | Total across modes |
| mode_breakup | jsonb NN | `[{"mode":"upi","amount":"700.00","reference":"UTR…"},{"mode":"cash","amount":"300.00"}]` |
| primary_mode | varchar(12) | Derived: largest share |
| reference | varchar(64) | |
| note | varchar(255) | |
| status | varchar(10) | `recorded`, `void` |
| voided_at / void_reason | | |
| payment_request_id | uuid NULL | P2 |
| unallocated_amount | numeric(14,2) NN | Cache |
| pdf_attachment_id | uuid NULL | |

IX(tenant_id, payment_date DESC), IX(tenant_id, party_id, payment_date DESC), IX(tenant_id, direction, status).

**`payments_allocation`** — `payment_id`, `document_type` (`sales_document`, `purchase_document`), `document_id`, `amount numeric(14,2) CHECK > 0`, `created_at`. U(payment_id, document_type, document_id). Also used for credit-note application (`payment_id NULL`, `credit_note_id` set) — *decision:* separate table **`sales_credit_application`** (`credit_note_id`, `invoice_id`, `amount`) to keep semantics clear.

**`payments_request`** (P2) — `party_id NULL`, `document_id NULL`, `amount`, `provider` (`upi_static`, `razorpay`…), `provider_order_id`, `provider_payment_id`, `short_code varchar(12) U` (for `/p/<code>` links), `status`, `payer_vpa`, `utr`, `expires_at`, `paid_at`, `raw_webhook jsonb`, `matched_payment_id NULL`. IX(tenant_id, status), U(provider, provider_payment_id) WHERE NOT NULL — idempotent webhook handling.

**`payments_vpa_mapping`** (P2) — `payer_vpa`, `party_id`, `confidence`, `last_used_at`. U(tenant_id, payer_vpa).

### 21.3.10 Expenses

**`expenses_category`** — `name`, `is_system`. Seeded: Rent, Salaries, Electricity, Transport, Purchases-misc, Food, Marketing, Fees, Other. **`expenses_expense`** — `number`, `category_id`, `party_id NULL`, `expense_date`, `amount`, `tax_amount`, `tax_code NULL`, `mode`, `reference`, `note`, `receipt_attachment_id`, `status` (`recorded`, `void`). IX(tenant_id, expense_date DESC), IX(tenant_id, category_id).

### 21.3.11 Imports & reports

**`imports_job`** — `kind` (`parties`, `items`, `opening_stock`), `file_attachment_id`, `status`, `total_rows`, `valid_rows`, `error_rows`, `errors jsonb` (first 500 row errors), `result jsonb`, `started_at`, `finished_at`. IX(tenant_id, created_at DESC).

**`reports_export`** — `report_name`, `params jsonb`, `format`, `status`, `file_attachment_id`, `row_count`, `expires_at`. Files expire after 7 days.

**`help_article`** (P2, global) — per research §D.4 content model: `slug`, `locale`, `title`, `body_md`, `topic`, `tags text[]`, `related text[]`, `screen_ids text[]`, `status`, `version`, `published_at`. **`help_feedback`**, **`help_search_log`**.

## 21.4 Index & performance strategy

| Access pattern | Index |
|---|---|
| Party list sorted by recent activity with filters | `(tenant_id, status, last_activity_at DESC)` + balance index; trigram on name for `ILIKE %q%` |
| Party statement | `(tenant_id, party_id, entry_date, created_at)` — range scan, running balance in SQL window function |
| Aging | Query over `ledger_entry` grouped by party with `age = today − entry_date` on open debit entries net of credits (FIFO application computed in SQL CTE); cached nightly into `reports_snapshot` for tenants with > 5k entries |
| Item search by barcode | `(tenant_id, barcode)` exact; SKU exact; trigram name |
| Movement history | `(tenant_id, item_id, location_id, movement_date, sequence_no)` — the canonical order (§21.3.6) |
| Overdue invoices | partial index on `due_on` for open statuses |
| Dashboard tiles | `reports_snapshot` refreshed on write via debounced Celery task (≤ 60 s staleness) + direct queries for small tenants |
| Audit browse | `(tenant_id, created_at DESC)` monthly partitions |
| Job claim (every runner tick) | `ix_job_claim (priority, run_after, created_at) WHERE status = 'queued'` — partial, because only queued rows are ever claimed |
| Job visibility-timeout sweep | `ix_job_stuck (locked_at) WHERE status = 'running'` |
| Job dedupe at enqueue | `uq_job_idem (tenant_id, job_type, idempotency_token)` partial unique; `uq_job_scheduled (scheduled_key)` partial unique |
| Job operator views | `ix_job_tenant_recent (tenant_id, created_at DESC)`, `ix_job_status_recent (status, created_at DESC)` |
| Idempotency-key lookup and purge | `U(tenant_id, scope, key)` — the lock as well as the lookup; `IX(expires_at)` for the hourly purge |

Rules: every list endpoint is paginated (default 25, max 100); every query in a list view is checked with `EXPLAIN` in CI for tenants seeded with 100k ledger rows (performance test fixture); `select_related`/`prefetch_related` mandatory for serializers touching relations (assert query counts in tests).

## 21.5 Cascade and deletion behaviour

| Relationship | On delete |
|---|---|
| Tenant → everything | RESTRICT; explicit deletion job |
| User → membership | CASCADE (membership rows) ; created_by FKs SET NULL |
| Party → ledger entries/documents | RESTRICT (archive instead) |
| Item → lines/movements | RESTRICT (archive instead) |
| Document → lines | CASCADE (only while `draft`; issued documents are voided) |
| Payment → allocations | CASCADE (void reverses ledger first) |
| Attachment owner deleted | Attachments soft-deleted; storage GC job after 30 days |
| Tenant → jobs / idempotency keys | RESTRICT, as for every other tenant child; the deletion job drains and deletes these rows in dependency order. `platform_job.tenant_id` is nullable so platform-level jobs survive a tenant's removal |
| User → job `created_by` / idempotency-key `user_id` | SET NULL; a job outlives the person who queued it |

## 21.6 Soft delete, archive and void

- Master data (`Party`, `Item`, `Category`, `Unit`, `Tag`): `status=archived` for user action; `deleted_at` only via merge/import rollback or tenant deletion.
- Documents: `draft` may be hard-deleted by its creator; anything issued/recorded can only be **voided** (status + reason + reversing ledger/stock rows).
- Ledger/stock rows: never deleted; reversal rows.

## 21.7 Audit requirements per entity

| Entity | Audited actions | Before/after snapshot |
|---|---|---|
| Tenant, settings, branding | update | yes |
| Membership/role | invite, accept, role change, suspend, remove | yes |
| Party | create, update, archive, restore, merge | changed fields |
| LedgerEntry | create, reverse, correct | full row |
| Item | create, update, archive | changed fields |
| StockAdjustment | post | lines |
| Sales/Purchase documents | create draft, issue, void, convert | totals + status |
| Payment | record, void | full |
| Expense | record, void | full |
| Reminder | send, done, dismiss | minimal |
| Export/Import | request, complete | params |
| Auth | login success/failure (mobile hashed), OTP requests, session revoke | metadata only |

## 21.8 Migration policy

- One migration per PR; never edit a merged migration; data migrations separated from schema migrations; `RunPython` reversible or explicitly `noop` reverse.
- Adding a NOT NULL column to a large table: add nullable → backfill in batches (management command) → set NOT NULL with `CHECK … NOT VALID` then `VALIDATE` (Postgres pattern) to avoid long locks.
- Indexes on big tables created `CONCURRENTLY` via `AddIndexConcurrently` in `atomic = False` migrations.
- Migration naming `NNNN_<verb>_<entity>` (`0007_add_credit_limit_to_party`).
- Seed data (tax rates, units, system roles, expense categories, HSN master) via idempotent management commands, not migrations (except system roles which are required for constraints).

## 21.9 Extension points reserved for later phases

- `tenant_id` nullable on `tax_rate`, `notifications_template`, `help_article` allows global + override.
- `source_type/source_id` polymorphism on ledger and stock lets new document kinds post without schema change.
- `mode_breakup jsonb` on payments avoids a lines table for split payments while remaining queryable (`jsonb_path`).
- `sales_document.kind` enum can grow (sales order, challan) without new tables; lines table shared.
- Partitioning keys (`created_at`) chosen for audit and message logs.
- `accounting` module (Future) would introduce `gl_account` and `journal_entry` tables; ledger entries carry enough typing (`entry_type`) to be projected into journals retrospectively.
