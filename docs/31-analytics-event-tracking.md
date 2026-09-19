# Part 31 — Analytics and Event Tracking

This part specifies what UdhaarBook measures about itself, how the measurement is implemented within the minimal-dependency constraint (ADR-021: no third-party analytics SDK at MVP), and what is deliberately never collected. It is the destination for every FRD's section 18, and the event catalogue in §31.4 is the normative list — an event emitted by code but absent here is a defect, and an event named here but never emitted is dead weight to be removed.

---

## 31.1 Measurement philosophy

### 31.1.1 What the product must be able to answer about itself

Analytics exists here to answer six questions, and its design is judged by whether it answers them cheaply:

1. **Is the product thesis true?** UdhaarBook's claim is that a ledger fed by billing, inventory and payments beats four apps. The measurable form of that claim is the share of active tenants using the ledger *and* at least one document module in the same month (Part 1 §1.11). If that number is low, the product is a khata app with extra screens.
2. **Where do merchants stop?** Onboarding, first party, first entry, first bill, first payment — a funnel with five steps, each of which a merchant can abandon, and each abandonment has a different fix.
3. **What do merchants actually do daily?** Not what they say. The distribution of actions per active day tells us which features earn their maintenance and which are ballast.
4. **Where does the product hurt?** Failed writes, blocked actions, validation rejections, limit hits, empty search results, retries. Every one of these is a merchant who tried and could not.
5. **Is the paid wall in the right place?** Limit-hit events versus upgrade conversations versus churn.
6. **Is the partner channel working?** The same questions, sliced by partner, without ever giving a partner more than Part 24 §24.6.3 permits.

### 31.1.2 Principles

- **Server-first.** Anything that corresponds to a state change is emitted server-side, inside the same transaction as the write. A client-side event for "invoice issued" is a lie waiting to happen — it fires on a network failure, it fires twice on a retry, it does not fire when an ad blocker eats the request. Client-side events exist only for things the server cannot see: a screen viewed, a dialog opened, a form abandoned, a filter changed.
- **Events are facts, not opinions.** `ub.sales.invoice_issued` is a fact. `ub.sales.user_seemed_confused` is not an event. Derived judgements belong in queries, not in the emitter.
- **One event per thing that happened.** Not one per function call, not one per render. Duplicate emission is treated as a defect and asserted against (§31.6.6).
- **No PII, ever, enforced at the emitter** rather than by convention (§31.6.4). An event carries ids, enums, counts and booleans — never a name, a mobile number, a GSTIN, an address, a note, an item description or a message body.
- **Money is a magnitude, not a value.** Amounts are recorded as bucketed magnitudes (§31.5.3), never as the rupee figure, because a stream of exact invoice totals is a reconstruction of the merchant's book by another route.
- **The analytics table is not the source of truth.** Every business metric that *can* be computed from business tables (revenue, invoice counts, balances) is computed from business tables. Events measure *behaviour* — intent, navigation, friction, abandonment — which business tables cannot see. This split keeps the event stream small and keeps a dropped event from corrupting a number that matters.
- **Cheap to drop.** If the analytics writer fails, the business write must still succeed. The emitter never raises into the caller (§31.6.3).

---

## 31.2 The metric tree

### 31.2.1 North star

> **Integrated Active Tenants (IAT)** — the number of tenants that, within a calendar month, recorded **at least 8 ledger entries** *and* issued **at least 1 document** (invoice, bill of supply, purchase bill or credit note).

Numerator and denominator are stated exactly because a metric without an exact definition drifts:

| Element | Definition |
|---|---|
| Window | Calendar month in the tenant's timezone (`Asia/Kolkata` default) |
| Ledger activity | `ledger_entry` rows with `status='posted'`, **any** `entry_type`, created in the window, counted per tenant, `≥ 8` |
| Document activity | `sales_document` with `kind ∈ {invoice, bill_of_supply, credit_note}` and `status ≠ draft`, **or** `purchases_document` with `kind='purchase_bill'` and `status ≠ draft`, `issued_at`/`recorded_at` in the window, `≥ 1` |
| Excluded | tenants with `status ∈ {suspended, pending_deletion, deleted}`; demo tenants (`metadata.is_demo`); tenants created within the window that have not completed onboarding |
| Reported as | Absolute count, and **IAT rate** = IAT ÷ Monthly Active Tenants |

```sql
-- North star: IAT and IAT rate for a month.
WITH window AS (SELECT date_trunc('month', :as_of::date) AS m_start,
                       date_trunc('month', :as_of::date) + interval '1 month' AS m_end),
eligible AS (
  SELECT t.id FROM platform_tenant t, window w
   WHERE t.status = 'active' AND t.onboarding_step >= 99
     AND COALESCE((t.branding->>'is_demo')::bool, false) = false
     AND t.created_at < w.m_end),
ledger AS (
  SELECT le.tenant_id, count(*) AS n FROM ledger_entry le, window w
   WHERE le.status = 'posted' AND le.created_at >= w.m_start AND le.created_at < w.m_end
   GROUP BY 1),
docs AS (
  SELECT tenant_id, count(*) AS n FROM (
      SELECT tenant_id, issued_at AS at FROM sales_document, window w
       WHERE kind IN ('invoice','bill_of_supply','credit_note') AND status <> 'draft'
         AND issued_at >= w.m_start AND issued_at < w.m_end
      UNION ALL
      SELECT tenant_id, created_at FROM purchases_document, window w
       WHERE kind = 'purchase_bill' AND status <> 'draft'
         AND created_at >= w.m_start AND created_at < w.m_end) x
   GROUP BY 1),
active AS (SELECT e.id FROM eligible e
            WHERE EXISTS (SELECT 1 FROM ledger l WHERE l.tenant_id = e.id AND l.n >= 1)
               OR EXISTS (SELECT 1 FROM docs  d WHERE d.tenant_id = e.id AND d.n >= 1))
SELECT (SELECT count(*) FROM eligible e
         JOIN ledger l ON l.tenant_id = e.id AND l.n >= 8
         JOIN docs   d ON d.tenant_id = e.id AND d.n >= 1)                       AS iat,
       (SELECT count(*) FROM active)                                             AS mat,
       round(100.0 * (SELECT count(*) FROM eligible e
                       JOIN ledger l ON l.tenant_id = e.id AND l.n >= 8
                       JOIN docs   d ON d.tenant_id = e.id AND d.n >= 1)
                   / NULLIF((SELECT count(*) FROM active), 0), 1)                AS iat_rate_pct;
```

### 31.2.2 The four input metrics

IAT moves only if one of these moves. Each has an exact definition and an owner.

| # | Input metric | Definition | Window | Why it feeds IAT |
|---|---|---|---|---|
| **I1** | **Activated tenants** | Tenants reaching the activation definition (§31.3.1) | Cohort by signup week | A tenant that never activates can never be integrated |
| **I2** | **Ledger habit rate** | Activated tenants with ≥ 8 posted ledger entries in the month ÷ activated tenants | Calendar month | The ledger is the daily habit; without it there is no retention to build on |
| **I3** | **Document adoption rate** | Tenants with ≥ 1 non-draft document in the month ÷ tenants with ≥ 1 ledger entry in the month | Calendar month | The crossing from khata app to business OS — the single conversion the thesis depends on |
| **I4** | **M1 tenant retention** | Tenants active in month *n* that are active in month *n+1* ÷ tenants active in month *n* | Month over month | Compounds everything above |

```sql
-- I3: document adoption among ledger-using tenants.
SELECT round(100.0 * count(*) FILTER (WHERE d.n > 0) / NULLIF(count(*), 0), 1) AS adoption_pct
FROM ledger l LEFT JOIN docs d ON d.tenant_id = l.tenant_id
WHERE l.n > 0;
```

### 31.2.3 Per-module health metrics

Each module owns two or three numbers. A module whose numbers do not move is a module whose next investment is questionable.

| Module | Metric | Numerator ÷ denominator | Window | SQL shape |
|---|---|---|---|---|
| `platform` | Onboarding completion | `ub.platform.onboarding_completed` distinct tenants ÷ `ub.platform.tenant_created` | signup cohort week | events, distinct on `tenant_id` |
| `platform` | Team adoption | tenants with ≥ 2 active memberships ÷ active tenants | month | `platform_membership` group/having |
| `parties` | Party coverage | tenants with ≥ 10 active parties ÷ active tenants | month | `parties_party` count per tenant |
| `parties` | Search success | `list_searched` where `result_count > 0` ÷ all `list_searched` | week | events |
| `ledger` | Entries per active day | posted entries ÷ distinct (tenant, active date) | month | `ledger_entry` group by tenant, date |
| `ledger` | Reminder follow-through | parties whose balance fell within 7 days of `reminder_sent` ÷ `reminder_sent` | rolling 30 d | events joined to `ledger_entry` |
| `ledger` | Correction rate | `entry_corrected` + `entry_reversed` ÷ `entry_posted` | month | events — a rising number means the entry form is wrong |
| `inventory` | Stock trust | items with `on_hand > 0` and a movement in 30 d ÷ items with `track_stock` | month | `inventory_item_stock` + movements |
| `inventory` | Adjustment rate | `adjustment_posted` ÷ `invoice_issued` | month | events — high means stock is drifting |
| `sales` | Time to first bill | median minutes from `onboarding_completed` to first `invoice_issued` | cohort | events |
| `sales` | Draft abandonment | `invoice_editor_abandoned` ÷ (`abandoned` + `invoice_issued`) | week | events |
| `sales` | Issue failure rate | `invoice_issue_failed` ÷ (`failed` + `invoice_issued`) | week | events, split by `reason` |
| `purchases` | Purchase capture | tenants with ≥ 1 purchase bill ÷ tenants with ≥ 1 invoice | month | business tables |
| `payments` | Collection lag | median days from `invoice_issued` to full allocation | month | `sales_document` + `payments_allocation` |
| `payments` | UPI attach rate | tenants with `upi_vpa` set ÷ active tenants | month | `platform_tenant` |
| `expenses` | Cashbook use | tenants with ≥ 4 expenses in the month ÷ active tenants | month | `expenses_expense` |
| `reports` | Report reach | distinct tenants with ≥ 1 `ub.reports.viewed` ÷ active tenants | month | events |
| `notifications` | Share rate | documents with ≥ 1 `document_shared` ÷ documents issued | month | events + business |
| `notifications` | Message success | `message_sent` with terminal `delivered` ÷ `message_sent` | week | `notifications_message_log` |
| `import_export` | Import success | `imports.committed` ÷ `imports.file_uploaded` | month | events |
| `help` | Self-serve rate | help sessions without a support contact click ÷ help sessions | month | events |
| `whitelabel` | Branding adoption | tenants with a logo or a colour set ÷ active tenants | month | `platform_tenant.branding` |

---

## 31.3 Activation and retention

### 31.3.1 What "activated" means here

A ledger app and an inventory app activate differently, and UdhaarBook is both. Using a single definition would misread half the base, so activation is defined **by the tenant's declared business type and enabled modules**, with a common floor.

**The aha-moment hypothesis.** The moment a merchant stops evaluating and starts depending is the moment the app tells them something they did not already know — the first time they open it to *check* rather than to *enter*. Operationally, that is the first time a merchant returns on a later day and views a party's balance or the dashboard without recording anything. That is a testable hypothesis, and §31.7.1 specifies the funnel that measures it.

**Activation definitions (normative):**

| Tenant shape | Activated when, within 7 days of tenant creation |
|---|---|
| **Floor (all tenants)** | Onboarding completed **and** ≥ 3 parties **and** ≥ 5 posted ledger entries **and** a session on ≥ 2 distinct days |
| **Ledger-led** (`inventory` disabled, or business type `services`/`professional`) | Floor only |
| **Billing-led** (`sales` enabled, business type `retail`/`wholesale`/`trader`/`food`) | Floor **and** ≥ 1 issued invoice or bill of supply |
| **Inventory-led** (`inventory` enabled, business type `distribution`/`manufacturer`) | Floor **and** ≥ 10 items with opening stock **and** ≥ 1 issued document |

Rationale for the shape: three parties proves the merchant entered their real book rather than a test row; five entries proves it was not a single sitting of curiosity; two distinct days proves return, which is the only signal that separates a trial from a habit. The 7-day window is short on purpose — a merchant who has not done these things in a week is unlikely to do them in a month, and a long window hides the problem.

**Anti-definitions**, stated so nobody proposes them: signing up is not activation; completing onboarding is not activation (it is a wizard, not a decision); one big import is not activation (imported rows are not use).

### 31.3.2 Retention

Tenant-level, not user-level — the business is the customer.

| Metric | Definition |
|---|---|
| **Active day** | A tenant-day with ≥ 1 *meaningful* action: a posted ledger entry, an issued/recorded document, a payment, an expense, a reminder sent, or a report viewed. A login alone is **not** an active day |
| **D1** | Activated tenants with an active day on calendar day 1 after signup ÷ activated tenants |
| **D7** | Active day **on** day 7 (point-in-time), reported alongside **D1–D7 range retention** (any active day in days 1–7) because a shop closed on the seventh day is not churn |
| **D30** | Active day in days 24–30 (a 7-day window, not a single day — weekly rhythms dominate this market) |
| **W1/W4/W12** | Active in calendar week *n* after the signup week — the primary retention series, because it tolerates weekly closing days |
| **M1/M3/M12** | Active in calendar month *n* after the signup month; M12 is the logo-retention number in Part 1 §1.11 |
| **Resurrection** | Inactive for a full month, active again in a later month ÷ tenants inactive that month |
| **Churn (paid)** | Paying tenants that lapse or cancel ÷ paying tenants at period start |

**Cohorts** are cut by: signup week; business type; GST type; partner; acquisition surface (partner host, direct, invited); activation status; and modules enabled at day 7. Every retention chart is reported for at least *activated* and *all* cohorts, because mixing them makes onboarding improvements look like retention improvements.

```sql
-- Weekly tenant retention triangle for a signup cohort.
WITH cohort AS (
  SELECT id, date_trunc('week', created_at) AS cohort_week FROM platform_tenant
   WHERE status = 'active' AND COALESCE((branding->>'is_demo')::bool,false) = false),
activity AS (
  SELECT tenant_id, date_trunc('week', occurred_at) AS active_week
    FROM analytics_event
   WHERE name IN ('ub.ledger.entry_posted','ub.sales.invoice_issued','ub.payments.recorded',
                  'ub.expenses.recorded','ub.purchases.bill_recorded','ub.reports.viewed')
   GROUP BY 1,2)
SELECT c.cohort_week,
       (EXTRACT(epoch FROM a.active_week - c.cohort_week)/604800)::int AS week_n,
       count(DISTINCT c.id)                                            AS tenants
  FROM cohort c JOIN activity a ON a.tenant_id = c.id
 WHERE a.active_week >= c.cohort_week
 GROUP BY 1,2 ORDER BY 1,2;
```

---

## 31.4 The event catalogue

### 31.4.1 How to read it

Columns: **Event** (`ub.<module>.<event>`) · **Trigger** · **Properties** beyond the common set · **Persona** (OW owner, ST staff, AC accountant, PA partner admin, SA super admin, CU end customer) · **Src** (S = server-emitted inside the transaction, C = client-emitted) · **Feature**.

Every event additionally carries the **common property set** defined in §31.5.2 (`tenant_id`, `user_id`, `role`, `partner_code`, `session_id`, `occurred_at`, `surface`, `locale`, `app_version`, `platform`), which is therefore never repeated in the table.

Where a family of events shares its trigger shape and properties, the family is written on one row with its members separated by `/`. This is a formatting convenience only — each name is a distinct, individually emitted event.

### 31.4.2 Platform (`ub.platform.*`) — PLT

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `otp_requested` | OTP send accepted | `purpose`, `is_new_mobile: bool`, `attempt_no: int` | OW/ST | S | PLT-01 |
| `otp_verified` / `otp_failed` / `otp_throttled` | verify outcome | `purpose`, `attempts_used: int`, `reason?` | OW/ST | S | PLT-01 |
| `login_method_selected` | auth screen choice | `method: otp\|password` | OW/ST | C | PLT-01/02 |
| `password_login` | password auth | `success: bool` | ST/AC | S | PLT-02 |
| `password_set` / `password_reset_requested` / `password_reset_completed` | password lifecycle | `via: invite\|otp\|settings` | ST/AC | S | PLT-02 |
| `new_device_login` | unrecognised device | `device_kind` | OW | S | PLT-09 |
| `tenant_created` | tenant row committed | `business_type`, `gst_type`, `partner_code`, `source: direct\|partner_host\|invite` | OW | S | PLT-03 |
| `onboarding_step_viewed` / `onboarding_step_completed` | wizard step | `step: int`, `step_key`, `duration_ms: int` | OW | C/S | PLT-03 |
| `onboarding_completed` | wizard finished | `total_duration_ms: int`, `modules_enabled[]`, `skipped_steps[]` | OW | S | PLT-03 |
| `onboarding_abandoned` | wizard left ≥ 30 min | `last_step: int` | OW | S | PLT-03 |
| `tenant_switched` / `default_tenant_set` | tenant context change | `from_tenant_hash`, `to_business_type` | OW | S | PLT-04 |
| `tenant_left` | membership self-removed | — | OW/ST | S | PLT-04 |
| `member_invited` / `invite_shared` / `invite_accepted` / `invite_limit_hit` | invitation lifecycle | `role`, `channel: sms\|whatsapp\|copy` | OW | S | PLT-05 |
| `member_role_changed` / `member_suspended` / `member_removed` | membership change | `from_role`, `to_role` | OW | S | PLT-05 |
| `permissions_refreshed` | `ver` claim bump handled | `reason` | all | C | PLT-05 |
| `settings_saved` / `settings_reset_preset` | settings write | `keys_changed[]`, `preset?` | OW | S | PLT-06 |
| `numbering_changed` | series edited | `kind`, `changed: prefix\|next\|padding\|reset_fy` | OW | S | PLT-06 |
| `module_toggled` / `module_locked_viewed` | module switch / locked hint seen | `module`, `enabled: bool` | OW | S/C | PLT-06, PLT-15 |
| `profile_saved` / `gst_type_changed` / `upi_vpa_set` / `signature_uploaded` | business profile | `fields[]`, `from`/`to` for gst_type | OW | S | PLT-07 |
| `audit_viewed` / `audit_row_opened` / `audit_exported` | audit log use | `filters[]`, `row_count_bucket` | OW/AC | C/S | PLT-08 |
| `session_revoked` / `session_renamed` | device management | `scope: one\|all` | OW | S | PLT-09 |
| `export_requested` / `export_completed` | tenant data export | `size_bucket`, `duration_ms` | OW | S | PLT-10 |
| `deletion_requested` / `deletion_cancelled` / `deletion_executed` / `account_deleted` | deletion lifecycle | `cool_off_days_remaining` | OW | S | PLT-10 |
| `app_lock_enabled` / `app_lock_unlocked` / `app_lock_failed` / `app_lock_reset_via_login` | PIN gate (P2) | `method: pin\|biometric` | OW/ST | C | PLT-11 |
| `plan_limit_near` / `plan_limit_hit` / `plan_contact_clicked` | entitlement boundary | `limit_key`, `limit: int`, `used: int`, `plan_code`, `channel?` | OW | S/C | PLT-15 |

### 31.4.3 Admin and white-label (`ub.admin.*`, `ub.whitelabel.*`) — PLT-14, WLB

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `ub.admin.tenant_searched` | super-admin search | `by: name\|gstin\|mobile`, `result_count` | SA | S | PLT-14 |
| `ub.admin.plan_changed` / `override_set` | entitlement change | `limit_key?`, `from`, `to` | SA | S | PLT-14/15 |
| `ub.admin.tenant_suspended` | suspension | `reason_len` | SA | S | PLT-14 |
| `ub.admin.access_requested` / `impersonation_started` | consented support access | `scope`, `expiry_minutes` | SA | S | PLT-14 |
| `ub.admin.health_viewed` | ops health page | — | SA | C | PLT-14 |
| `ub.whitelabel.branding_saved` | tenant branding write | `keys_changed[]`, `has_logo: bool`, `source_before[]` | OW | S | WLB-01 |
| `ub.whitelabel.low_contrast_rejected` | contrast check failed | `ratio: float`, `suggested: bool` | OW | S | WLB-01 |
| `ub.whitelabel.branding_reset` | key reset to default | `key` | OW | S | WLB-01 |
| `ub.whitelabel.partner_created` / `partner_updated` / `partner_suspended` | partner record change | `fields[]` | SA | S | WLB-02 |
| `ub.whitelabel.branded_login_viewed` | auth screen on a partner host | `partner_code`, `resolution: host\|subdomain\|default` | OW/ST | C | WLB-03 |
| `ub.whitelabel.hostname_verified` / `wrong_partner_redirect` | domain lifecycle / cross-partner login | `host_hash` | PA / OW | S | WLB-03 |
| `ub.whitelabel.partner_console_viewed` | console opened | `section` | PA | C | WLB-04 |
| `ub.whitelabel.partner_override_set` / `partner_ceiling_hit` | entitlement within/above ceiling | `limit_key`, `value`, `ceiling` | PA | S | WLB-04 |
| `ub.whitelabel.theme_validated` / `theme_approved` | theme lifecycle | `passed: bool`, `failed_checks[]` | PA/SA | S | WLB-05 |
| `ub.whitelabel.messaging_configured` / `template_saved` | messaging setup | `channel`, `provider`, `code?`, `lint_passed: bool` | PA | S | WLB-06 |

### 31.4.4 Parties (`ub.parties.*`) — PTY

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `created` / `updated` / `create_failed` | party write | `is_customer`, `is_supplier`, `has_gstin`, `has_opening_balance`, `entry_point: list\|document\|import\|contacts`, `error_code?` | OW/ST | S | PTY-01 |
| `gstin_checksum_failed` | GSTIN rejected | `stage: client\|server` | OW/ST | C/S | PTY-01 |
| `duplicate_hint_shown` / `duplicate_dismissed` / `duplicates_viewed` | duplicate detection | `match_on: mobile\|name` | OW/ST | C | PTY-01, PTY-08 |
| `list_viewed` / `list_searched` / `list_filtered` / `list_sorted` / `list_row_action` / `list_bulk_action` / `columns_changed` / `page_changed` | list interaction | `filters[]`, `result_count`, `ordering`, `action` | OW/ST | C | PTY-02 |
| `list_load_failed` / `list_stale_shown` | list failure / cached view | `error_code`, `age_seconds` | OW/ST | C | PTY-02 |
| `totals_tile_tapped` | header totals drill | `tile: receivable\|payable\|settled` | OW | C | PTY-02 |
| `detail_viewed` / `detail_offline_shown` / `opened` | khata page | `balance_sign`, `entry_count_bucket`, `from` | OW/ST | C | PTY-03 |
| `quick_action` | party quick action | `action: gave\|got\|bill\|remind\|share\|call` | OW/ST | C | PTY-03 |
| `timeline_filtered` / `timeline_paged` / `timeline_row_opened` | timeline use | `filter`, `row_type` | OW/ST | C | PTY-03 |
| `archived` / `restored` / `archive_attempted` / `archive_blocked` / `archive_undone` / `restore_blocked_plan` | archive lifecycle | `balance_nonzero: bool`, `reason_code?` | OW | S | PTY-04 |
| `tag_created` / `tag_renamed` / `tag_recoloured` / `tag_deleted` / `tag_merged` / `tag_assigned` / `tag_removed` / `tag_filter_applied` / `tag_limit_hit` | tag lifecycle | `tag_count`, `party_count?` | OW | S/C | PTY-05 |
| `bulk_tagged` / `bulk_tag_undone` / `bulk_archived` | bulk operations | `count` | OW | S | PTY-02/05 |
| `credit_limit_set` / `credit_limit_cleared` / `credit_mode_changed` | credit configuration | `mode: off\|warn\|block`, `limit_bucket` | OW | S | PTY-06 |
| `credit_check_run` / `credit_warned` / `credit_blocked` / `credit_overridden` / `credit_override_requested` / `credit_dialog_action` / `credit_filter_used` | credit enforcement | `mode`, `utilisation_pct`, `action` | OW/ST | S/C | PTY-06 |
| `contacts_picker_opened` / `contacts_supported` / `contacts_rationale_shown` / `contacts_rationale_action` / `contacts_picked` / `contacts_reviewed` / `contacts_submitted` / `contacts_result` / `contacts_duplicates` / `contacts_denied` / `contacts_cancelled` | contact import (P2) | `supported: bool`, `picked_count`, `imported_count`, `duplicate_count` | OW/ST | C | PTY-07 |
| `merge_started` / `merge_preview` / `merge_field_choice` / `merge_swapped` / `merge_confirmed` / `merge_failed` / `merge_async` / `merged_link_redirect` | merge (P2) | `entry_count_bucket`, `field`, `error_code?` | OW | S/C | PTY-08 |
| `share_link_created` / `share_link_copied` / `share_link_shared` / `share_link_revoked` / `share_links_revoked_all` / `share_link_limit_hit` | khata share link (P2) | `expires_days`, `channel` | OW | S | PTY-09 |
| `khata_link_viewed` / `khata_link_blocked` | public khata page opened | `expired: bool` | CU | S | PTY-09 |
| `import_template_downloaded` / `import_uploaded` / `import_mapping_auto` / `import_mapping_changed` / `import_validated` / `import_duplicate_mode` / `import_committed` / `import_cancelled` / `import_failed` / `import_errors_downloaded` / `import_plan_blocked` | party CSV import | `row_count`, `valid_rows`, `error_rows`, `mode`, `error_code?` | OW | S | PTY-10 |
| `exported` | party list export | `format`, `row_count_bucket`, `filters[]` | OW/AC | S | PTY-02 |
| `collection_date_set` / `sms_opt_in_changed` / `write_off_posted` / `party_erased` / `optimistic_entry_failed` / `statement_shared` | misc party actions | `days_ahead`, `opt_in: bool`, `amount_bucket`, `channel` | OW/ST | S | PTY-01/03, LED-11 |

### 31.4.5 Ledger (`ub.ledger.*`) — LED

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `entry_drawer_opened` | you gave/got sheet opened | `direction`, `from: party\|list\|fab` | OW/ST | C | LED-01 |
| `entry_posted` | entry committed | `direction`, `entry_type`, `amount_bucket`, `has_note: bool`, `has_photo: bool`, `payment_mode?`, `backdated_days: int`, `latency_ms: int` | OW/ST | S | LED-01 |
| `entry_post_failed` | write rejected | `error_code`, `direction` | OW/ST | S | LED-01 |
| `opening_posted` | opening balance | `direction`, `amount_bucket` | OW | S | LED-02 |
| `entry_reversed` / `entry_corrected` / `correction_blocked` | correction lifecycle | `entry_type`, `age_days`, `fields_changed[]`, `reason_len`, `error_code?` | OW | S | LED-03 |
| `corrections_toggle` | statement toggle | `include: bool` | OW/AC | C | LED-03/04 |
| `statement_viewed` / `statement_printed` / `statement_exported` / `statement_shared` | statement use | `range_days`, `entry_count_bucket`, `format?`, `channel?` | OW/ST/AC | C/S | LED-04 |
| `collection_date_set` / `collection_date_cleared` / `bucket_opened` | collection dates and buckets | `days_ahead`, `bucket: today\|overdue\|upcoming` | OW/ST | S/C | LED-05 |
| `reminder_sheet_opened` / `reminder_sent` / `reminder_marked` / `reminder_bulk_completed` | manual reminders | `channel`, `party_count`, `balance_bucket`, `outcome: done\|dismissed` | OW/ST | C/S | LED-06 |
| `auto_reminder_scheduled` / `auto_reminder_result` / `auto_reminder_channel_changed` / `auto_sms_toggled` | automated reminders | `kind: auto_d1\|auto_d0`, `channel`, `status`, `enabled: bool` | OW | S | LED-07 |
| `party_sms_toggled` / `party_sms_result` | per-entry SMS to party | `enabled: bool`, `status`, `skip_reason?` | OW | S | LED-08 |
| `aging_viewed` / `aging_drilldown` / `aging_exported` / `bucket_opened` | aging report | `type: receivable\|payable`, `bucket`, `party_count` | OW/AC | C/S | LED-09 |
| `source_posted` / `source_reversed` | document-driven ledger entry | `source_type`, `entry_type` | all | S | LED-10 |
| `write_off_posted` | write-off | `amount_bucket`, `reason_len` | OW | S | LED-11 |
| `recurring_run` / `reminder_rule_saved` | recurring reminders (P2) | `cadence`, `party_count` | OW | S | LED-13 |
| `integrity_findings` | `check_integrity` result | `drift_count`, `checked_tenants` | SA | S | — (ops) |

### 31.4.6 Inventory (`ub.inventory.*`) — INV

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `item_created` / `item_updated` / `item_archived` / `item_restored` | item lifecycle | `item_type`, `track_stock`, `has_barcode`, `has_image`, `has_hsn`, `entry_point`, `blocked_reason?` | OW/ST | S | INV-01 |
| `item_form_abandoned` | item drawer closed unsaved | `fields_filled: int`, `duration_ms` | OW/ST | C | INV-01 |
| `hsn_searched` | HSN lookup | `result_count`, `selected: bool` | OW | C | INV-01 |
| `list_viewed` / `item_searched` / `item_detail_viewed` | item browsing | `filters[]`, `result_count`, `by: name\|sku\|barcode` | OW/ST | C | INV-02/03 |
| `movements_viewed` / `movement_source_opened` | movement history | `movement_count_bucket`, `source_type` | OW/ST | C | INV-03 |
| `category_created` / `unit_created` / `location_created` | masters | `inline: bool` | OW | S | INV-04, INV-11 |
| `opening_stock_posted` | opening movement | `qty_bucket`, `has_cost: bool`, `via: form\|import` | OW | S | INV-05 |
| `adjustment_drawer_abandoned` / `adjustment_posted` / `adjustment_blocked_negative` | stock adjustment | `reason`, `line_count`, `direction: in\|out`, `allow_negative: bool` | OW/ST | S/C | INV-06 |
| `low_stock_notified` / `low_stock_action` | reorder point crossed | `item_count`, `action: adjust\|purchase\|dismiss` | OW | S/C | INV-07 |
| `stock_summary_viewed` / `stock_summary_exported` | valuation report | `item_count_bucket`, `value_bucket`, `format?` | OW/AC | C/S | INV-08 |
| `barcode_scanned` / `camera_scan_opened` / `camera_scan_result` / `barcode_generated` / `labels_printed` | barcode (P2) | `surface: item_search\|billing`, `success: bool`, `label_count` | ST | C | INV-10, INV-15 |
| `transfer_initiated` / `transfer_received` | transfers (P2) | `line_count`, `from_location`, `to_location` | OW | S | INV-11 |
| `variants_generated` / `variant_picked` | variants (P2) | `variant_count`, `attributes[]` | OW/ST | S/C | INV-12 |
| `price_list_created` / `bulk_price_previewed` / `bulk_price_applied` / `bulk_price_blocked` | price lists (P2) | `item_count`, `change_pct_bucket`, `error_code?` | OW | S | INV-13 |
| `secondary_unit_set` / `item_weight_set` | units (P2) | `factor_bucket` | OW | S | INV-14 |

### 31.4.7 Sales (`ub.sales.*`) — SAL

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `draft_created` / `invoice_draft_saved` / `draft_autosaved` / `draft_restored` / `draft_discarded` / `draft_conflict` | draft lifecycle | `kind`, `line_count`, `autosave_seq`, `conflict_resolution?` | OW/ST | S/C | SAL-06 |
| `invoice_issued` | invoice/bill of supply issued | `kind`, `line_count`, `amount_bucket`, `is_inter_state`, `tax_codes[]`, `has_discount`, `party_type: party\|walk_in`, `paid_at_counter: bool`, `payment_modes[]`, `duration_ms`, `entry_point` | OW/ST | S | SAL-02 |
| `invoice_issue_failed` | issue rejected | `error_code`, `line_count` | OW/ST | S | SAL-02 |
| `invoice_voided` | void | `reason_len`, `age_days`, `had_payments: bool` | OW | S | SAL-05 |
| `credit_limit_warning` | limit warn on issue | `mode`, `utilisation_pct` | OW/ST | S | PTY-06 |
| `estimate_created` / `estimate_shared` / `estimate_status_changed` / `estimate_converted` | estimate lifecycle | `amount_bucket`, `to_status`, `age_days` | OW/ST | S | SAL-01 |
| `document_printed` / `document_shared` / `document_duplicated` | output actions | `template: a4\|thermal80`, `channel: whatsapp\|link\|sms\|download`, `kind` | OW/ST | C/S | SAL-03, SAL-06 |
| `public_page_viewed` / `public_pay_clicked` / `public_payment_succeeded` / `public_utr_claimed` / `public_estimate_accepted` | public document page | `kind`, `referrer_kind`, `amount_bucket` | CU | S | SAL-03, SAL-14 |
| `credit_note_issued` / `credit_note_applied` / `credit_note_voided` | credit notes | `against_invoice: bool`, `restock: bool`, `settlement`, `amount_bucket` | OW | S | SAL-04 |
| `walkin_saved_as_party` | walk-in converted | — | ST | S | SAL-07 |
| `list_viewed` / `list_searched` / `list_row_action` | sales list | `tab`, `filters[]`, `result_count`, `action` | OW/ST/AC | C | SAL-08 |
| `price_list_applied` | price list on a line (P2) | `list_name_hash` | ST | C | INV-13 |
| `challan_issued` / `challan_converted` / `challan_returned` | delivery challan (P2) | `line_count` | OW | S | SAL-09 |
| `recurring_created` / `recurring_generated` | recurring invoices (P2) | `cadence`, `generated_count` | OW | S | SAL-10 |
| `ub.documents.line_entered_secondary` | line entered in a secondary unit (P2) | `unit_code`, `factor` | ST | C | INV-14 |

### 31.4.8 Purchases (`ub.purchases.*`) — PUR

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `bill_draft_created` / `bill_recorded` / `bill_voided` / `bill_editor_abandoned` | purchase bill lifecycle | `line_count`, `amount_bucket`, `itc_eligible`, `has_supplier_invoice_no`, `paid_now: bool` | OW | S/C | PUR-01 |
| `duplicate_supplier_invoice_blocked` | duplicate guard | `supplier_known: bool` | OW | S | PUR-01 |
| `item_created_inline` | item created from a bill line | — | OW | S | PUR-01 |
| `list_viewed` / `list_exported` | purchase list | `filters[]`, `result_count`, `format?` | OW/AC | C/S | PUR-03 |
| `po_created` / `po_sent` / `po_edited_after_send` / `po_closed` / `po_cancelled` | purchase orders (P2) | `line_count`, `amount_bucket` | OW | S | PUR-04 |
| `grn_recorded` / `grn_voided` / `bill_from_grn` | goods receipt (P2) | `line_count`, `variance_lines` | OW | S | PUR-05 |
| `debit_note_draft_created` / `debit_note_issued` / `debit_note_applied` / `debit_note_refund_recorded` / `debit_note_voided` / `debit_note_shared` / `debit_note_blocked_stock` | debit notes (P2) | `against_bill: bool`, `restock: bool`, `amount_bucket`, `error_code?` | OW | S | PUR-06 |
| `landed_cost_charge_added` / `landed_cost_previewed` / `landed_cost_allocated` / `landed_cost_revalued` / `landed_cost_blocked` | landed cost (P2) | `basis`, `charge_count`, `item_count` | OW | S | PUR-07 |

### 31.4.9 Payments (`ub.payments.*`) — PAY

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `recorded` / `out_recorded` / `record_failed` | payment write | `direction`, `amount_bucket`, `mode_count`, `modes[]`, `allocation: auto\|manual\|none`, `allocated_count`, `residual: bool`, `error_code?` | OW/ST | S | PAY-01/02 |
| `mode_line_added` | split payment line | `mode`, `line_index` | OW/ST | C | PAY-01 |
| `voided` / `out_voided` / `void_dialog_opened` / `void_failed` / `void_requested_by_staff` | void lifecycle | `reason_len`, `age_days`, `error_code?` | OW | S/C | PAY-05 |
| `receipt_printed` / `receipt_shared` / `receipt_sms_result` / `receipt_public_viewed` | receipt output | `channel`, `status` | OW/ST/CU | C/S | PAY-04 |
| `upi_vpa_set` / `collect_qr_shown` / `counter_qr_printed` / `collect_mark_received` | UPI collection | `source: invoice\|counter\|party`, `amount_bucket` | OW/ST | S/C | PAY-04 |
| `request_created` / `request_shared` / `request_paid` / `request_cancelled` | payment requests (P2) | `provider`, `amount_bucket`, `ttl_hours` | OW | S | PAY-06 |
| `provider_connect_started` / `provider_connected` | aggregator onboarding (P2) | `provider` | OW | S | PAY-06 |
| `webhook_received` / `webhook_failed` | provider webhook (P2) | `provider`, `event_type`, `duplicate: bool`, `error_code?` | — | S | PAY-06 |
| `unmatched_viewed` / `unmatched_suggestion_shown` / `unmatched_auto_matched` / `unmatched_matched` / `unmatched_split` / `unmatched_ignored` / `unmatched_undone` | unmatched queue (P2) | `count`, `confidence_bucket`, `method` | OW | S/C | PAY-07 |
| `vpa_mapping_changed` / `settlement_imported` | reconciliation (P2) | `row_count` | OW | S | PAY-07 |

### 31.4.10 Expenses, reports, notifications, imports, exports, help, public

| Event | Trigger | Properties | Persona | Src | Feature |
|---|---|---|---|---|---|
| `ub.expenses.drawer_opened` / `draft_saved` / `recorded` / `updated` / `voided` | expense lifecycle | `category_id`, `amount_bucket`, `mode`, `has_receipt`, `has_party`, `paid: bool` | OW/ST | S/C | EXP-01 |
| `ub.expenses.duplicate_warning_shown` / `staff_limit_blocked` / `receipt_uploaded` / `list_filtered` | expense friction | `error_code?`, `size_kb_bucket`, `filters[]` | OW/ST | S/C | EXP-01 |
| `ub.expenses.categories_opened` / `category_created` / `category_renamed` / `category_recoloured` / `category_reordered` / `category_merged` / `category_archived` / `category_restored` / `category_deleted` / `category_limit_hit` | category masters | `count`, `is_system: bool` | OW | S | EXP-02 |
| `ub.expenses.cashbook_viewed` / `cashbook_day_expanded` / `cashbook_breakdown_expanded` / `cashbook_row_opened` / `cashbook_opening_set` / `cashbook_mismatch_seen` / `cashbook_close_day_cta` / `cashbook_close_day_used` / `cashbook_exported` | cashbook | `range_days`, `mismatch_amount_bucket`, `format?` | OW | C/S | EXP-03 |
| `ub.expenses.recurring_created` / `recurring_updated` / `recurring_paused` / `recurring_duplicated` / `recurring_generated` / `recurring_occurrence_recorded` / `recurring_occurrence_skipped` / `recurring_opened` / `recurring_upcoming_viewed` | recurring expenses (P2) | `cadence`, `generated_count` | OW | S/C | EXP-04 |
| `ub.reports.dashboard_viewed` / `dashboard_tile_clicked` / `dashboard_quick_action` | dashboard | `tiles_rendered[]`, `tile`, `action`, `load_ms` | OW | C | RPT-01 |
| `ub.reports.viewed` / `row_opened` / `print_clicked` / `exported` | any report | `report`, `range_days`, `filters[]`, `row_count_bucket`, `format?` | OW/AC | C/S | RPT-* |
| `ub.reports.gst_view_changed` / `gst_drilldown` / `gst_rounding_toggled` / `gst_exception_opened` / `gst_exception_fixed` / `gst_filing_reminder_clicked` / `gstr_json_downloaded` | GST reporting | `view`, `period`, `exception_kind`, `fixed: bool` | OW/AC | C/S | RPT-06 |
| `ub.reports.profit_drilldown` / `profit_breakdown_changed` / `profit_expenses_toggled` / `profit_caveat_clicked` / `profit_digest_clicked` | profit report (P2) | `dimension`, `include_expenses: bool` | OW | C | RPT-09 |
| `ub.reports.stock_tab_changed` / `stock_row_action` / `stock_purchase_list_created` / `dead_stock_action` / `velocity_tab_changed` / `velocity_row_drilldown` / `velocity_compare_toggled` / `velocity_thresholds_changed` | stock analytics (P2) | `tab`, `action`, `item_count` | OW | C/S | RPT-10 |
| `ub.reports.staff_view_changed` / `staff_detail_opened` / `staff_metric_drilldown` / `staff_self_view_toggled` / `staff_quality_disclosed` | staff performance (P2) | `metric`, `period` | OW | C | RPT-11 |
| `ub.reports.aging_drilldown` | aging drill from a report | `bucket` | OW/AC | C | LED-09 |
| `ub.exports.requested` / `completed` / `failed` / `downloaded` / `blocked` / `retried` / `columns_customised` / `history_opened` | export jobs | `report`, `format`, `row_count_bucket`, `duration_ms`, `error_code?` | OW/AC | S/C | RPT-08 |
| `ub.notifications.raised` / `page_viewed` / `bell_opened` / `item_clicked` / `inline_action_used` / `mark_all_read` / `dismissed` | in-app inbox | `type`, `unread_count`, `action` | all | S/C | NTF-01 |
| `ub.notifications.message_sent` / `message_skipped` / `message_failed` / `message_resent` / `dlr_received` / `message_log_viewed` | outbound messaging | `channel`, `template_code`, `status`, `partner_code`, `skip_reason?`, `provider` | OW | S | NTF-02 |
| `ub.notifications.messaging_settings_viewed` / `messaging_provider_changed` / `messaging_test_sent` / `preferences_changed` / `rate_guard` | messaging configuration | `channel`, `provider`, `keys[]` | OW/PA | S/C | NTF-02 |
| `ub.notifications.share_sheet_opened` / `share_action` / `share_link_created` / `share_link_viewed` / `share_link_revoked` / `share_pdf_printed` / `share_blocked_fallback` / `share_bulk_started` / `share_bulk_finished` | sharing | `kind`, `channel`, `count`, `fallback_reason?` | OW/ST | C/S | NTF-03 |
| `ub.notifications.whatsapp_channel_connected` / `whatsapp_sent` / `whatsapp_status` / `whatsapp_reply_received` / `whatsapp_opt_out` / `whatsapp_fallback_used` / `whatsapp_templates_synced` / `whatsapp_quality_changed` / `whatsapp_costs_viewed` | WhatsApp API (P2) | `template_name`, `category`, `status`, `quality_tier`, `cost_bucket` | OW | S | NTF-05, LED-12 |
| `ub.notifications.email_channel_configured` / `email_member_verified` / `email_composer_opened` / `email_preview_viewed` / `email_sent` / `email_result` / `email_bounced` / `email_quota_warning_shown` / `email_quota_blocked` | email (P2) | `template_code`, `status`, `quota_pct` | OW | S/C | NTF-06 |
| `ub.notifications.push_primer_shown` / `push_primer_action` / `push_permission_result` / `push_subscribed` / `push_revoked` / `push_delivered` / `push_clicked` / `push_held_batch` / `push_quiet_hours_changed` | web push (P2) | `permission`, `type`, `batch_size` | OW/ST | C | NTF-07 |
| `ub.imports.template_downloaded` / `file_uploaded` / `xlsx_uploaded` / `mode_selected` / `validated` / `diff_viewed` / `committed` / `items_committed` / `upsert_committed` / `cancelled` / `failed` / `reuploaded` / `reverted` / `error_csv_downloaded` | generic import pipeline | `kind`, `row_count`, `valid_rows`, `error_rows`, `mode`, `error_code?` | OW | S | IMP-01/02 |
| `ub.imports.items_uploaded` / `items_validated` | item import | `row_count`, `with_opening_stock: bool` | OW | S | INV-09 |
| `ub.help.opened` / `searched` / `search_zero_result` / `result_clicked` / `article_viewed` / `article_completed` / `related_clicked` / `faq_expanded` / `feedback_given` / `locale_switched` / `screen_help_opened` / `hint_opened` / `hint_article_clicked` / `support_contact_clicked` / `offline_fallback_shown` | help centre (P2) | `query_hash`, `result_count`, `slug`, `screen_id`, `helpful: bool`, `channel?` | all | C | HLP-01/02 |
| `ub.help.tour_offered` / `tour_started` / `tour_step_viewed` / `tour_step_skipped` / `tour_paused` / `tour_resumed` / `tour_completed` / `tour_skipped` / `tour_replayed` | guided tours (P2) | `tour_id`, `step`, `step_count` | OW/ST | C | HLP-03 |
| `ub.help.whats_new_opened` / `whats_new_strip_shown` / `whats_new_strip_dismissed` / `whats_new_note_viewed` / `whats_new_article_clicked` / `whats_new_kind_filtered` / `whats_new_marked_seen` / `whats_new_show_everything_toggled` / `whats_new_offline_shown` | what's new (P2) | `release`, `kind` | all | C | HLP-04 |
| `ub.public.statement_viewed` | public statement page opened | `kind`, `expired: bool` | CU | S | LED-04, PTY-09 |

### 31.4.11 Canonicalisation note

The FRDs contain a small number of event names that were split across a line break or written in an abbreviated form. The catalogue above is authoritative and the following mappings apply; the abbreviated forms must not appear in code:

| Appears in an FRD as | Canonical name |
|---|---|
| `ub.contacts.rationale` | `ub.parties.contacts_rationale_shown` |
| `ub.expense.draft` | `ub.expenses.draft_saved` |
| `ub.grid.sales…`, `ub.parties.page…`, `ub.parties.columns…`, `ub.parties.list_bulk…`, `ub.parties.opened` | `ub.sales.list_viewed`, `ub.parties.page_changed`, `ub.parties.columns_changed`, `ub.parties.list_bulk_action`, `ub.parties.detail_viewed` |
| `ub.payments.last…`, `ub.sales.last…` | property `last_*` on the owning list event, not separate events |
| `ub.reports.gstr…` | `ub.reports.gstr_json_downloaded` |
| `ub.sales.draft…`, `ub.sales.rule…` | `ub.sales.draft_created`, `ub.sales.recurring_created` |
| `ub.share.wa…` | `ub.notifications.share_action` with `channel='whatsapp'` |
| `ub.help.` (bare) | the specific `ub.help.*` name in the owning FRD row |

---

## 31.5 Naming, properties, versioning

### 31.5.1 Naming rules

```
ub.<module>.<object>_<past_tense_verb>
```

- `ub.` prefix always; `<module>` is a canon §0.3 module code (or `whitelabel`, `admin`, `public`, `exports`, `imports`, `documents`, which are the recognised cross-cutting namespaces).
- Lowercase `snake_case`; no camelCase, no dots beyond the three segments, no dynamic segments. `ub.parties.tag_created` — never `ub.parties.tag.created` and never `ub.parties.tag_${id}_created`.
- **Past tense for facts** (`invoice_issued`, `entry_posted`), **past tense for UI facts too** (`list_viewed`, `drawer_opened`). Present tense and gerunds are rejected in review.
- The name says *what happened*, not *what the user wanted*: `invoice_issue_failed`, not `invoice_issue_attempted`.
- Failure variants are `<verb>_failed` or `<verb>_blocked`: `_failed` means the system could not, `_blocked` means the system refused (a rule, a permission, a limit). The distinction matters because they have different fixes.
- Names are **stable identifiers**. Renaming an event is a breaking change and follows §31.5.5.
- Maximum length 64 characters, enforced by the emitter.

### 31.5.2 The common property set

Attached by the emitter to every event; never passed by callers; never duplicated in the catalogue.

| Property | Type | Source | Notes |
|---|---|---|---|
| `event_id` | uuid v7 | emitter | Deduplication key |
| `name` | string | caller | From the catalogue |
| `occurred_at` | timestamptz | emitter | UTC; client events carry the client timestamp too (`client_ts`) for offline replay |
| `tenant_id` | uuid null | context | NULL for pre-auth and partner/admin events |
| `user_id` | uuid null | context | NULL for public-page events |
| `role` | string null | context | `owner`/`admin`/`staff`/`accountant`/`partner_admin`/`super_admin`/`public` |
| `partner_code` | string | context | Part 24 §24.3; always present |
| `session_id` | uuid | context | Rotates on login/logout; not the JWT session |
| `surface` | string | caller/emitter | `web_mobile`, `web_desktop`, `pwa`, `api`, `scheduler`, `public_page` |
| `locale` | string | context | `en`/`hi` |
| `app_version` | string | build | Frontend build version or backend version |
| `platform` | string | emitter | `android`/`ios`/`desktop`/`server`, from a coarse UA parse — never the full UA string |
| `request_id` | string null | context | Joins an event to the structured log line |
| `schema_version` | smallint | catalogue | Per-event, §31.5.5 |

### 31.5.3 Property conventions

| Convention | Rule |
|---|---|
| **Types** | Only `string` (from a declared enum), `int`, `float`, `bool`, `string[]`, or `null`. No nested objects, no free text |
| **Money** | Never a value. Always `*_bucket`, one of: `0`, `1_100`, `100_500`, `500_1k`, `1k_5k`, `5k_25k`, `25k_1L`, `1L_5L`, `5L_plus` |
| **Counts** | Exact up to 20; above that `*_count_bucket`: `21_50`, `51_100`, `101_500`, `501_plus` |
| **Durations** | `*_ms` as an int, capped at 600,000 |
| **Enums** | Declared in the catalogue; an undeclared value is coerced to `"other"` and logged, never stored raw |
| **Identifiers** | Internal UUIDs of tenant-owned objects (`party_id`, `item_id`) are permitted **only** where the metric needs a join, and are listed in the catalogue. They are meaningless outside the database |
| **Hashes** | Where a value is needed for cardinality but must not be readable (`query_hash`, `host_hash`, `from_tenant_hash`), it is `sha256(value + SECRET_KEY)[:16]` — stable within a deployment, useless outside it |
| **Booleans** | Named as predicates: `has_logo`, `is_inter_state`, `paid_at_counter` |
| **Absent vs false** | A property that does not apply is omitted, not set to `null` or `false` |
| **Property count** | ≤ 15 beyond the common set; more means the event is doing two jobs |

### 31.5.4 What is never a property

Names (of anything), mobile numbers, emails, GSTINs, PANs, addresses, pincodes, bank details, VPAs, UTRs, invoice numbers, item names or descriptions, notes, reasons (only `reason_len`), message bodies, search queries (only `query_hash` and `result_count`), exact amounts, exact balances, file names, IP addresses, and full user-agent strings. This list is implemented as a deny-list in the emitter (§31.6.4), not as guidance.

### 31.5.5 Versioning and deprecation

Each event has a `schema_version`, starting at 1.

| Change | Allowed? | Version |
|---|---|---|
| Add an optional property | ✅ additive | unchanged |
| Add a value to an enum | ✅ additive | unchanged |
| Make an optional property required | ⚠️ | +1 |
| Change a property's type or units | ⚠️ | +1 |
| Remove a property | ⚠️ | +1 |
| Change what triggers the event | ❌ | new event name |
| Rename the event | ❌ | new event name |

Deprecation: mark the event deprecated in this chapter with the replacement and a removal date at least **90 days** out; emit both old and new during the overlap; the emitter logs a WARNING on each deprecated emission with the call site so the remaining callers are findable; remove the code after the date; keep the rows. **Event rows are never rewritten or deleted for a schema change** — a query that spans a version boundary must handle both, and `schema_version` is what lets it.

---

## 31.6 Implementation

### 31.6.1 The constraint and the shape

ADR-021 permits no analytics SDK — no Segment, no Mixpanel, no PostHog, no GA. Events are written to a local table by a thin client hook and a server-side emitter. This is not a compromise: for a product whose first deployment is one machine, a table is faster to query, costs nothing, ships no data to a third party (which matters under DPDP), and is the correct substrate to replay from when a real provider is eventually added.

```
  React component ──▶ useAnalytics().track(name, props)
                            │   batches in memory, flushes every 10 s / 20 events / on hide
                            ▼
                     POST /api/v1/analytics/events  (array, ≤ 50)
                            │
  Django service ──▶ analytics.emit(name, props)  ◀─────────────┘
                            │   same validator, same deny-list, same writer
                            ▼
                     analytics_event  (Postgres table)
                            │
                            ├──▶ SQL dashboards (§31.8)
                            └──▶ [seam] forwarder job → a real provider, later (§31.6.7)
```

### 31.6.2 The table

```sql
CREATE TABLE analytics_event (
    id              uuid PRIMARY KEY,                    -- uuid7, time-ordered
    name            varchar(64)  NOT NULL,
    schema_version  smallint     NOT NULL DEFAULT 1,
    occurred_at     timestamptz  NOT NULL,               -- authoritative timestamp
    received_at     timestamptz  NOT NULL DEFAULT now(), -- differs from occurred_at for buffered client events
    tenant_id       uuid         NULL REFERENCES platform_tenant(id) ON DELETE CASCADE,
    partner_id      uuid         NULL REFERENCES platform_partner(id) ON DELETE SET NULL,
    user_id         uuid         NULL REFERENCES platform_user(id)   ON DELETE SET NULL,
    role            varchar(16)  NULL,
    session_id      uuid         NULL,
    surface         varchar(16)  NOT NULL,
    platform        varchar(12)  NOT NULL DEFAULT 'server',
    locale          varchar(8)   NOT NULL DEFAULT 'en',
    app_version     varchar(32)  NULL,
    request_id      varchar(64)  NULL,
    props           jsonb        NOT NULL DEFAULT '{}',
    CONSTRAINT analytics_event_props_is_object CHECK (jsonb_typeof(props) = 'object')
);

CREATE INDEX analytics_event_name_time_idx    ON analytics_event (name, occurred_at DESC);
CREATE INDEX analytics_event_tenant_time_idx  ON analytics_event (tenant_id, occurred_at DESC);
CREATE INDEX analytics_event_partner_time_idx ON analytics_event (partner_id, occurred_at DESC);
CREATE INDEX analytics_event_time_idx         ON analytics_event (occurred_at DESC);
CREATE INDEX analytics_event_props_gin        ON analytics_event USING gin (props jsonb_path_ops);
```

Notes that are decisions, not incidentals:

- **`tenant_id` has `ON DELETE CASCADE`** — the one place in the schema where tenant deletion cascades. Analytics rows are not business records; when a tenant exercises its deletion right (PLT-10) its events go with it.
- **`partner_id` is denormalised** onto the row so partner slicing never joins to `platform_tenant`, which a partner-facing query must not do.
- The table is **not** a `TenantModel` and is **not** exposed through any tenant API. It is read by Metis through SQL and by the internal dashboards; there is no `/api/v1/analytics` read endpoint at MVP.
- Partitioning by month is the growth path (Part 21 §21.9 reserves `occurred_at` as the key); at MVP volumes (~50–200 events per active tenant-day) a single table is correct.

### 31.6.3 The server emitter

```python
# analytics/services.py
def emit(name: str, props: Mapping | None = None, *, tenant=None, user=None,
         surface: str = "api", occurred_at=None) -> None:
    """Record one analytics event. Never raises into the caller.

    Called from service functions AFTER the business write, inside the same
    transaction via transaction.on_commit, so an event is never recorded for a
    write that rolled back.
    """
    try:
        spec = CATALOGUE[name]                       # KeyError ⇒ unknown event
    except KeyError:
        logger.warning("analytics.unknown_event", extra={"event_name": name})
        return
    try:
        clean = validate_and_scrub(spec, props or {})    # §31.6.4
        row = build_row(spec, clean, tenant, user, surface, occurred_at)
        transaction.on_commit(lambda: _write(row))
    except Exception:                                 # noqa: BLE001 — analytics must never break a write
        logger.exception("analytics.emit_failed", extra={"event_name": name})
```

Three properties of this function are load-bearing:

1. **`on_commit`.** An event fires only if its transaction commits. Emitting inline would record `invoice_issued` for invoices that were rolled back by a later stock check.
2. **Never raises.** A malformed property, a full disk, an unknown event — none of these may fail a merchant's write. The failure goes to the log.
3. **Catalogue-driven.** `CATALOGUE` is generated from this chapter's tables into `analytics/catalogue.py`, and a test asserts the generated catalogue matches the document (§31.6.6). An event emitted by code but absent from the catalogue is dropped with a warning, which is how the catalogue stays honest.

### 31.6.4 PII exclusion at the emitter

```python
FORBIDDEN_KEYS = re.compile(
    r"(name|mobile|phone|email|gstin|pan|address|pincode|vpa|utr|account|ifsc|"
    r"note|reason$|message|body|query$|description|title|number$|file|ip|user_agent)",
    re.I)
VALUE_PATTERNS = [
    re.compile(r"\+?\d{10,13}"),                                  # phone-shaped
    re.compile(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]"),# GSTIN-shaped
    re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+"),                      # email-shaped
]

def validate_and_scrub(spec, props):
    out = {}
    for key, value in props.items():
        if key not in spec.properties:
            raise UndeclaredProperty(key)                  # caught by emit(); logged
        if FORBIDDEN_KEYS.search(key):
            raise ForbiddenProperty(key)
        if isinstance(value, str):
            if any(p.search(value) for p in VALUE_PATTERNS):
                raise PiiDetected(key)
            if value not in spec.properties[key].enum:
                value = "other"
        out[key] = coerce(spec.properties[key].type, value)
    return out
```

The key-name check is the primary defence; the value-pattern check is the backstop for a property that is legitimately a string but whose caller passed the wrong thing. Both raise, both are caught by `emit`, both log with the call site. A unit test asserts every catalogue property name passes the key check and that known PII values are rejected — the test is the specification of this rule (`T-ANALYTICS-PII-*`).

### 31.6.5 The client

```ts
// src/hooks/useAnalytics.ts — the only client entry point.
export function useAnalytics() {
  const track = useCallback((name: UbEventName, props?: UbEventProps) => {
    if (!consentGranted()) return;                       // §31.10
    buffer.push({ name, props, client_ts: new Date().toISOString(),
                  surface: currentSurface(), session_id: sessionId() });
    if (buffer.length >= 20) flush();
  }, []);
  return { track };
}
```

| Concern | Behaviour |
|---|---|
| **Batching** | Flush on 20 events, or every 10 s, or on `visibilitychange → hidden`, or on route change away from the app |
| **Transport** | `navigator.sendBeacon` on page hide (fire-and-forget, survives unload), Axios `POST /analytics/events` otherwise. Never blocks navigation |
| **Offline buffering** | The buffer persists to `localStorage` under `ub_analytics_queue` (cap 500 events, FIFO eviction, 7-day TTL). On reconnect, the queue flushes oldest-first. `occurred_at` is the client timestamp; `received_at` shows the lag |
| **Clock skew** | The server rejects `client_ts` more than 48 h in the future or 30 days in the past, substituting `received_at` and setting `props._clock_skew = true` |
| **Deduplication** | Each buffered event carries a client-generated `event_id`; the server's insert is `ON CONFLICT (id) DO NOTHING`, so a retried batch is idempotent |
| **Failure** | A failed flush retries with backoff up to 3 times, then drops the batch. Analytics never surfaces an error to the merchant |
| **Cost** | The endpoint is rate-limited to 60 requests/min per session and 50 events per request; oversized batches are truncated, not rejected |
| **Type safety** | `UbEventName` is a union type generated from the catalogue, and `UbEventProps` is keyed by event name, so a typo or an undeclared property is a TypeScript error |

### 31.6.6 Testing the instrumentation

Part 28's definition of done requires a feature's events to be emitted and asserted. Concretely:

- **Catalogue parity** — a test parses this chapter's tables and asserts the generated `CATALOGUE` matches exactly; a name in one and not the other fails.
- **Emission** — each service test that performs a business write asserts the expected event was recorded with the expected properties, using the `assert_event_emitted` helper. The `assert_rows_written` helper (Part 28 §28.3.4) counts `analytics_event` too, so an unexpected extra event fails.
- **No duplicates** — issuing one invoice records exactly one `ub.sales.invoice_issued`; a replayed idempotent request records none.
- **Rollback** — an induced failure after the write asserts **zero** events (the `on_commit` guarantee).
- **PII** — the deny-list tests above.
- **Client** — the Jest suite asserts the buffer batches, flushes on hide, persists across a simulated reload, and drops everything when consent is absent.

### 31.6.7 The provider seam

When a real analytics provider is justified — realistically when there are enough tenants that SQL-by-hand stops scaling, or when a partner requires their own reporting — the change is one job and one adapter:

1. Add `analytics.forwarders.<provider>` implementing `send(batch: list[EventRow]) -> None` (an ADR, because it adds a dependency or at least an outbound HTTP path).
2. Add a scheduler job `analytics.forward` that reads rows newer than a watermark in `platform_job.result`, maps them, and sends in batches with retry.
3. Set `ANALYTICS_FORWARD_PROVIDER` in the environment.

Nothing in the application changes: no call site, no property, no name. The local table remains the source of truth and the replay buffer, which means a provider outage loses nothing and a provider migration is a re-run of the forwarder from an earlier watermark. This is the entire reason the SDK was not adopted in the first place.

---

## 31.7 Funnels

Each funnel is a fixed, ordered event sequence with an expected drop-off shape. "Expected" is a hypothesis to be falsified, not a target — the value of writing it down is that a measured shape that differs from the expectation is information.

### 31.7.1 Onboarding to habit (the primary funnel)

| # | Step | Event | Expected pass-through | If it drops here |
|---|---|---|---|---|
| 1 | Reached the app | `ub.whitelabel.branded_login_viewed` or the app's first screen | — | acquisition, not product |
| 2 | Requested an OTP | `ub.platform.otp_requested` | 60–70 % | the value proposition on the login screen |
| 3 | Verified | `ub.platform.otp_verified` | 85–92 % | SMS delivery — the most expensive drop in India |
| 4 | Created the business | `ub.platform.tenant_created` | 80–90 % | the wizard asks too much too early |
| 5 | Completed onboarding | `ub.platform.onboarding_completed` | 70–85 % | step-level drop visible in `onboarding_step_viewed` vs `_completed` |
| 6 | First party | `ub.parties.created` | 70–85 % | the empty state does not name the next action |
| 7 | **First ledger entry** | `ub.ledger.entry_posted` | 80–90 % | the core interaction is wrong — the most serious possible finding |
| 8 | Fifth entry, day 2+ | `entry_posted` count ≥ 5 across ≥ 2 days | 35–50 % | the product was tried, not adopted |
| 9 | **Return without writing** (the aha moment) | a session with `parties.detail_viewed` or `reports.dashboard_viewed` and no write | 25–40 % | the app is a notebook, not a source of truth |
| 10 | First document | `ub.sales.invoice_issued` or `ub.purchases.bill_recorded` | 30–45 % | the thesis crossing — the number that matters most |

Steps 1–7 should complete in one session; the funnel is measured both **same-session** and **7-day**. The gap between them is itself a metric: a large gap means the product is being evaluated rather than adopted.

### 31.7.2 First bill

`ub.sales.list_viewed` → `ub.sales.draft_created` → line added (`ub.inventory.item_searched` or `item_created`) → party chosen or walk-in → `ub.sales.invoice_issued`. Expected: 80 % / 65 % / 90 % / 70 %. The two expected losses are the first (a merchant opening the list to look, not to bill — benign) and the last (party selection and tax choices — the step to optimise). `ub.sales.invoice_editor_abandoned` with `line_count` and `duration_ms` tells which.

### 31.7.3 Getting paid

`ub.sales.invoice_issued` (unpaid) → `ub.ledger.reminder_sent` → `ub.payments.recorded` for that party within 7 days. Expected: 40 % of unpaid invoices get a reminder; 45–60 % of reminded parties pay within 7 days versus a 25–35 % baseline for unreminded. The lift between those two numbers is the product's most defensible commercial claim, and it is measurable from day one.

### 31.7.4 Inventory trust

`ub.inventory.item_created` → `opening_stock_posted` → `invoice_issued` including that item → `stock_summary_viewed`. Expected 60 % / 70 % / 30 %. Low pass-through at the last step means merchants do not believe the stock number, which shows up next as a rising `adjustment_posted` rate.

### 31.7.5 Limit to conversation

`ub.platform.plan_limit_near` → `plan_limit_hit` → `plan_contact_clicked`. Expected: 30 % of near-limit tenants hit the limit within 30 days; 35–50 % of those click the contact. A low contact rate means either the limit is not painful (the wall is in the wrong place) or the dialog is not actionable.

### 31.7.6 Partner onboarding

`ub.whitelabel.partner_created` → `branded_login_viewed` on a verified host → `ub.platform.tenant_created` with `source='partner_host'` → that tenant's activation. Measured per partner and compared to the direct channel; a partner channel that activates materially worse than direct is a distribution problem to solve with the partner, not a product problem.

---

## 31.8 Dashboards and queries

Four dashboards. Each is a set of SQL queries run against the production replica (or the primary, at MVP scale) and rendered by the internal reporting route. No BI tool at MVP.

### 31.8.1 Product health (weekly)

IAT and IAT rate (§31.2.1); I1–I4 (§31.2.2); the retention triangle (§31.3.2); the onboarding funnel (§31.7.1); new tenants by partner and business type.

```sql
-- Onboarding funnel for a signup cohort week.
WITH c AS (SELECT id, created_at FROM platform_tenant
            WHERE created_at >= :week_start AND created_at < :week_start + interval '7 days'),
s AS (
  SELECT c.id,
    max((e.name = 'ub.platform.onboarding_completed')::int)                         AS onboarded,
    max((e.name = 'ub.parties.created')::int)                                       AS first_party,
    max((e.name = 'ub.ledger.entry_posted')::int)                                   AS first_entry,
    count(*) FILTER (WHERE e.name = 'ub.ledger.entry_posted')                       AS entries,
    count(DISTINCT date_trunc('day', e.occurred_at))                                AS active_days,
    max((e.name IN ('ub.sales.invoice_issued','ub.purchases.bill_recorded'))::int)  AS first_doc
  FROM c LEFT JOIN analytics_event e
    ON e.tenant_id = c.id AND e.occurred_at < c.created_at + interval '7 days'
  GROUP BY c.id)
SELECT count(*) AS signed_up,
       sum(onboarded) AS onboarded, sum(first_party) AS first_party,
       sum(first_entry) AS first_entry,
       count(*) FILTER (WHERE entries >= 5 AND active_days >= 2) AS habit,
       sum(first_doc) AS first_document
FROM s;
```

### 31.8.2 Friction (daily)

Everything that stopped a merchant, ranked by count, with a 7-day trend:

```sql
SELECT e.name,
       coalesce(e.props->>'error_code', e.props->>'reason', '—') AS reason,
       count(*)                            AS n,
       count(DISTINCT e.tenant_id)         AS tenants
FROM analytics_event e
WHERE e.occurred_at >= now() - interval '7 days'
  AND (e.name LIKE '%_failed' OR e.name LIKE '%_blocked' OR e.name LIKE '%_rejected'
       OR e.name IN ('ub.platform.plan_limit_hit','ub.parties.credit_blocked',
                     'ub.inventory.adjustment_blocked_negative','ub.parties.search_zero_result'))
GROUP BY 1,2 ORDER BY n DESC LIMIT 40;
```

Plus: search zero-result rate; validation rejections by field; correction rate by entry type; draft abandonment by module; message `skipped`/`failed` by reason; P95 `latency_ms` on `entry_posted` and `invoice_issued` by `platform`.

### 31.8.3 Module adoption (monthly)

Per module, per business type: reach (tenants using it ÷ active tenants), depth (median actions per using tenant), and stickiness (using in month *n* and *n+1* ÷ using in *n*). Driven by the per-module metrics in §31.2.3. The output is a single table read top-to-bottom, and the conversation it exists to start is "which module do we stop investing in".

### 31.8.4 Partner channel (monthly)

Per partner: tenants created, activated, IAT, retention, messages sent and cost, limit hits, support access requests. Sourced from `analytics_event.partner_id` and from business tables joined through `platform_tenant`.

**This dashboard is read by Metis only.** What a partner sees through `GET /partner/usage` is the strict subset defined in Part 24 §24.6.3 — counts and volumes, never money and never anything per-party. A query written for this dashboard must never be repurposed into a partner endpoint, and the serializer allow-list (Part 24 §24.10.3) is what enforces that.

---

## 31.9 Experimentation and feature flags

### 31.9.1 What can honestly be tested at this stage

With 500 tenants at six months and 5,000 at twelve (Part 1 §1.11), the arithmetic is unforgiving. Detecting a 5 percentage-point lift on a 40 % baseline at 80 % power needs roughly 1,500 subjects per arm. At MVP scale a conventional A/B test can only detect an enormous effect, and running underpowered tests produces confident nonsense — which is worse than no test.

**Therefore, at MVP:**

| Method | Use it for | Do not use it for |
|---|---|---|
| **Before/after with a guardrail set** | Big, obvious changes: a redesigned entry sheet, a new empty state, a reordered onboarding. Measure the funnel step before and after, watch the guardrails (entry rate, error rate, latency), accept that confounds exist and say so | Anything subtle |
| **Cohort comparison** | Comparing business types, partners, acquisition surfaces — natural experiments that already have enough subjects | Claiming causation |
| **Staged rollout by flag** | Risk containment: 10 % → 50 % → 100 % with error and friction monitoring | Measuring a lift |
| **Qualitative (5–8 merchants)** | Anything about comprehension, vocabulary or workflow. Eight merchants will find a confusing label; eight thousand events will not explain it | Preference at scale |
| **Server-side holdouts** | Nothing yet | — |
| **Randomised A/B** | **Only** from ~2,000 monthly active tenants, and only on a metric with a high base rate (a screen-level interaction, not a monthly one) | Retention, activation, revenue |

Stated plainly so it is not relitigated: **UdhaarBook does not run A/B tests at MVP.** It ships with flags, rolls out in stages, watches friction daily, and talks to merchants.

### 31.9.2 The feature-flag mechanism

No third-party flag service (ADR-021). Flags are rows resolved through the same three-level chain as everything else (Part 24 §24.2.2).

```
platform_feature_flag:
  key varchar(64) PK              -- 'sales.thermal_template_v2'
  description varchar(200)
  default_enabled boolean NOT NULL DEFAULT false
  rollout_percent smallint NOT NULL DEFAULT 0   -- deterministic bucketing by tenant_id
  status varchar(12) NOT NULL DEFAULT 'active'  -- active | archived
  created_at, updated_at
platform_feature_flag_override:
  flag_key, scope ∈ {partner, tenant}, scope_id uuid, enabled boolean, reason varchar(160)
  U(flag_key, scope, scope_id)
```

```python
def is_enabled(key: str, tenant=None, partner=None) -> bool:
    flag = flag_cache.get(key)                      # 5-min in-process cache, as §24.3.3
    if flag is None or flag.status != "active":
        return False                                # unknown flag ⇒ off, always
    if tenant and (o := flag.override_for("tenant", tenant.id)) is not None:
        return o
    if (p := partner or (tenant and tenant.partner)) and \
       (o := flag.override_for("partner", p.id)) is not None:
        return o
    if flag.rollout_percent and tenant:
        bucket = int(hashlib.sha256(f"{key}:{tenant.id}".encode()).hexdigest()[:8], 16) % 100
        return bucket < flag.rollout_percent
    return flag.default_enabled
```

Rules: bucketing is **deterministic on `(key, tenant_id)`**, so a tenant never flickers between variants and changing one flag's percentage does not reshuffle another's; the flag set and each tenant's resolved values are returned by `GET /auth/me` as `feature_flags` (Part 22 §22.2) so the client branches without a round trip; an unknown flag is off; every flag has an **owner and a removal date** recorded in its description, and a flag older than 90 days past its date fails a weekly CI check — permanent flags are configuration and belong in settings, not in the flag table; and every flag flip writes an audit row and emits `ub.platform.feature_flag_changed {key, scope, enabled}`. Flags are **never** used for entitlements: modules are gated by plans (PLT-15), permissions by roles. A flag controls whether code is live; it never controls whether a customer is allowed.

---

## 31.10 Privacy

### 31.10.1 The DPDP position

Under India's Digital Personal Data Protection Act, the **merchant (tenant) is the Data Fiduciary** for their parties' personal data; **Metis Labs is a Data Processor** acting on the merchant's instructions. For the merchant's *own* users — the owner and staff who log in — Metis is the Fiduciary. Analytics therefore splits cleanly:

| Subject | Role | Basis | Consent |
|---|---|---|---|
| Tenant users (owner, staff, accountant) | Metis is Fiduciary | Legitimate use for service provision and security; **consent for product analytics** | Yes, per user, revocable (§31.10.4) |
| Parties (the merchant's customers) | Merchant is Fiduciary | — | **No party personal data is ever in an analytics event** (§31.5.4), so no basis is required |
| Public-page visitors (`ub.public.*`, `ub.sales.public_page_viewed`) | Metis is Fiduciary | Legitimate use for delivering the page | Counts only; no identifiers, no cookies beyond the session |
| Partner admins | Metis is Fiduciary | Contract | Same consent mechanism |

### 31.10.2 Consent

- Product-analytics consent is requested **once**, during onboarding, in plain language in `en` and `hi`: "Help us improve UdhaarBook by sharing anonymous usage data. We never collect your customers' names, numbers or amounts." Options: *Allow* / *Not now*. Declining costs the merchant nothing and is never re-prompted more than once per 180 days.
- Consent is stored per user (`platform_user.analytics_consent ∈ {granted, denied, unset}` with `consent_at`) and is checked by both the client hook and the server emitter. `unset` behaves as denied for behavioural events.
- **Operational events are exempt** from consent and are emitted regardless, because they are necessary for the service and for security rather than for product analytics: authentication outcomes (`otp_*`, `password_login`, `new_device_login`), failures and blocks (`*_failed`, `*_blocked`), message delivery status, limit hits, and admin/partner actions on a tenant. These are also the events that feed the audit and support paths. The distinction is recorded per event in the generated catalogue as `consent_required: bool`, and the emitter enforces it.
- Consent is recorded in the audit log (`user.analytics_consent_changed`) so the record of consent exists independently of the flag.

### 31.10.3 What is never collected

Restating §31.5.4 as a privacy commitment, because it is one: no party names, mobiles, emails, GSTINs, addresses or balances; no item names or descriptions; no note, reason or message text; no search queries in clear; no exact money values; no invoice numbers; no bank details, VPAs or UTRs; no IP addresses in the event stream (the access log holds them for 30 days for security, separately); no full user-agent strings; no third-party trackers, no advertising identifiers, no fingerprinting, no session replay, no heatmaps; no cross-site cookies. The public share pages carry **no analytics beyond a server-side view count**, because the person opening them is the merchant's customer and has no relationship with us at all.

### 31.10.4 Anonymisation, retention and erasure

| Age | Treatment |
|---|---|
| 0–90 days | Full rows as specified |
| 90 days | `user_id` and `session_id` nulled; `request_id` nulled. Rows become tenant-level, not person-level |
| 13 months | Rows aggregated into `analytics_daily_rollup` (`date, tenant_id, partner_id, name, surface, count`) and the detail rows deleted |
| 25 months | Rollups aggregated to month and partner; tenant-level detail dropped |

Run by the scheduler jobs `analytics.anonymise` (daily) and `analytics.rollup` (weekly). Retention is shorter than the business tables' deliberately: financial records must be kept 72 months for GST, behavioural data must not.

**Erasure.** A user's deletion request nulls their `user_id` across `analytics_event` immediately (the rows remain as tenant-level counts, which contain nothing about them). A tenant's deletion (PLT-10) cascades and removes every event row, including from the rollups for that tenant, within the 30-day cool-off execution. Both are asserted by tests. A merchant asking "delete everything you know about me" gets a truthful yes.

**Opt-out** is available at any time in Settings → Privacy, takes effect on the next request (the client hook reads consent from `/auth/me`, and the server emitter checks it per event), and — on the merchant's request — additionally purges their historical behavioural events. Opting out never degrades the product: no feature is withheld, no nag is shown, and the operational events that keep the service working and secure continue, which is disclosed in the same screen rather than buried in a policy.
