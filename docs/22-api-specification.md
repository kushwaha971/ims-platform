# Part 22 — API Standards and Specification

## 22.1 Conventions

| Topic | Standard |
|---|---|
| Base URL | `/api/v1/` — version in path; breaking changes ship as `/api/v2/` with a 12-month overlap |
| Style | Resource-oriented REST, JSON only (`application/json; charset=utf-8`); multipart only for uploads |
| Naming | Plural nouns, kebab-case paths (`/credit-notes`), snake_case JSON keys |
| Methods | `GET` read, `POST` create/actions, `PATCH` partial update, `PUT` full replace (settings/branding only), `DELETE` soft archive/draft delete |
| Actions | Sub-resource verbs for state transitions: `POST /sales/invoices/{id}/issue`, `/void`, `/convert`, `/reverse` — never `PATCH status` |
| IDs | UUID strings; human numbers are attributes |
| Dates | `YYYY-MM-DD` for business dates; RFC 3339 UTC for timestamps |
| Money | Strings with exactly 2 decimals (`"1250.00"`); quantities strings up to 3 decimals; percentages numbers |
| Envelope | Success: `{ "data": <object|array>, "meta": {…}? , "message": "…"? }`. Errors: `{ "error": { "code", "message", "details", "request_id" } }` |
| Status codes | 200 OK, 201 Created, 202 Accepted (async jobs), 204 No Content, 400 validation, 401 unauthenticated, 403 forbidden (permission/entitlement), 404 not found (incl. cross-tenant), 409 conflict (business rule, idempotency replay mismatch, version conflict), 412 precondition failed (ETag), 422 semantic (reserved), 429 throttled, 500/503 |
| Error codes | Stable `snake_case` strings, registered in **§22.1.1** and nowhere else. That registry is complete and closed: the set of codes the application emits equals the set documented there (Part 28 §28.3.6), the naming rule for a new one is §22.1.2 and the process for adding one is §22.1.3. |
| Validation detail | `details: { "field_name": ["message", …], "non_field_errors": ["…"] }` — messages localized by `Accept-Language` |
| Pagination | Default **page** pagination `?page=1&page_size=25` (max 100) → `meta: { page, page_size, total, total_pages }`. **Cursor** pagination for ledger entries and movements `?cursor=…&limit=50` → `meta: { next_cursor, has_more }` |
| Filtering | Query params named after fields; ranges `date_from`/`date_to`, `amount_min`/`amount_max`; enums `status=issued,overdue` (comma list); booleans `true/false` |
| Sorting | `?ordering=-document_date,number` (leading `-` = desc); whitelist per endpoint |
| Search | `?q=` full-text/trigram over declared fields |
| Field selection | `?fields=id,name,balance` (sparse) supported on lists |
| Expansion | `?include=party,lines` where declared |
| Idempotency | `Idempotency-Key: <uuid>` header on POST that creates documents/payments/entries; server stores key+hash of body for 24 h per tenant; same key+same body → replay original response (200/201 with `Idempotent-Replayed: true`); same key+different body → 409 `idempotency_conflict` |
| Concurrency | `version` integer on mutable documents; PATCH must send `version`; mismatch → 409 `stale_version` |
| Rate limits | Per user: 600 req/min general; OTP request 5/mobile/10 min and 20/IP/hour; exports 10/hour; webhooks per provider IP allowlist. Headers `X-RateLimit-Limit/Remaining/Reset` |
| Localisation | `Accept-Language: hi` → localized messages; monetary formatting is client-side |
| Tracing | `X-Request-Id` accepted or generated; returned in every response and error |
| Tenant context | Derived from JWT `tid` claim; `X-Tenant-Id` header is **not** trusted; switching tenant issues a new token |
| Auth transport | `Authorization: Bearer <access>` for API clients; browser uses httpOnly cookies `ub_access` (15 min) and `ub_refresh` (30 d, path `/api/v1/auth/refresh`) with `SameSite=Lax`, `Secure`; CSRF protection via double-submit `X-CSRF-Token` for cookie sessions |
| Deprecation | `Deprecation` and `Sunset` headers; changelog in Part 40 |


### 22.1.1 The error-code registry

This registry is normative and complete: **every error an UdhaarBook API may return carries a `code` from this table, and no code outside it may be emitted.** Part 28 §28.3.6's equality assertion — the emitted set equals the documented set — is made against this section. Part 19 §19.4.4's rule that the client switches on `code` and never on `message` is only honourable because this table exists; an unregistered code is therefore a defect in the backend, not a gap in the frontend.

Ownership is recorded as **T-16** in Part 0 §0.12.2. No other chapter may carry this table, and a chapter that needs a code names the code.

**Envelope.** Every error is the standard envelope `{ "error": { "code", "message", "details", "request_id" } }`. The `Envelope` column says what `details` carries:

| Symbol | `details` |
|---|---|
| `E` | `null` — the code and the request id are the whole of it |
| `F` | The field map `{ "field_name": ["message", …], "non_field_errors": ["…"] }` of Part 22 §22.1 |
| `D …` | The named keys listed in the cell, at the top level of `details`, with their natural JSON types (amounts as strings, counts as numbers) |

**Messages.** The English message is the `en` string; it is the copy, not a paraphrase, and changing it is a copy change reviewed like any other. The `hi` key is the ICU key in `locales/hi.json`; the derivation is always `errors.<code>` and it is spelled out so that `scripts/check-locales.mjs` can compare the two lists literally rather than by convention. A `details` key is never localised.

**Retryable** means the client may repeat the identical request, unchanged, and it may then succeed. Only these are retryable, and Part 19's Axios layer may retry only these: `idempotency_in_progress`, `service_busy`, `rate_limited`, `otp_throttled`, `login_throttled`, `token_stale` (once, after a refresh), `server_error`, `provider_error`, `email_quota_exceeded`, `export_queue_full`. Everything else is a state the user must change.

**A — Cross-cutting (every module may raise these)**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `validation_error` | 400 | F | A serializer rejects the body: a required field is absent, a type is wrong, an enum value is unknown or a declared field-level rule fails. | "Please check the highlighted fields." | `errors.validation_error` | no |
| `not_found` | 404 | E | The addressed row does not exist, is soft-deleted, or belongs to another tenant. Canon §0.11 rule 2 forbids distinguishing the third case. | "Not found." | `errors.not_found` | no |
| `permission_denied` | 403 | E | The principal is authenticated and its role lacks the codename the endpoint declares (Part 0 §0.9). | "You do not have permission to do this." | `errors.permission_denied` | no |
| `module_disabled` | 403 | D `module` | The endpoint belongs to a module absent from the tenant's `enabled_modules`. | "This module is switched off for your business." | `errors.module_disabled` | no |
| `plan_limit_reached` | 403 | D `limit`, `current`, `maximum` | A plan limit in Part 24 §24.9.1 would be exceeded by this write. | "Your plan's limit has been reached." | `errors.plan_limit_reached` | no |
| `idempotency_conflict` | 409 | E | The same `Idempotency-Key` was used within 24 h with a different body hash (Part 20 §20.6.5). | "This request was already sent with different details." | `errors.idempotency_conflict` | no |
| `idempotency_in_progress` | 409 | D `retry_after` | The same `Idempotency-Key` is being processed by another in-flight request; the first has not yet committed. | "Still processing your previous request. Try again in a moment." | `errors.idempotency_in_progress` | **yes** |
| `stale_version` | 409 | D `current_version` | A `PATCH` carried a `version` behind the stored one (Part 22 §22.1 Concurrency). | "Somebody else changed this. Reload and try again." | `errors.stale_version` | no |
| `precondition_failed` | 412 | D `current_etag` | An `If-Match` header did not match the resource's current `ETag`. Used by settings and branding. | "This was changed elsewhere. Reload and try again." | `errors.precondition_failed` | no |
| `too_many_rows` | 400 | D `count`, `maximum` | A bulk request carried more rows than the endpoint's declared cap. | "Too many rows in one request." | `errors.too_many_rows` | no |
| `too_many_ids` | 400 | D `count`, `maximum` | A bulk request carried more ids than the endpoint's declared cap. | "Too many items selected." | `errors.too_many_ids` | no |
| `file_too_large` | 400 | D `bytes`, `maximum_bytes` | An upload exceeds the endpoint's size cap. | "This file is too large." | `errors.file_too_large` | no |
| `image_too_large` | 400 | D `width`, `height`, `maximum` | An uploaded image exceeds the pixel dimensions the resizer accepts (Part 20 §20.9.3). | "This image is too large." | `errors.image_too_large` | no |
| `unsupported_file_type` | 400 | D `content_type`, `allowed` | An upload's sniffed content type is not on the endpoint's allow-list. | "This file type is not supported." | `errors.unsupported_file_type` | no |
| `service_busy` | 503 | D `retry_after` | A lock could not be taken inside its timeout, or a bounded worker pool is saturated (Part 20 §20.11.2). | "We are busy right now. Please try again." | `errors.service_busy` | **yes** |
| `rate_limited` | 429 | D `retry_after`, `limit` | A per-user or per-endpoint rate limit in Part 22 §22.1 was exceeded. | "Too many requests. Please wait a moment." | `errors.rate_limited` | **yes** |
| `server_error` | 500 | E | An unhandled exception. The `request_id` is the only thing the client shows. | "Something went wrong. Quote this reference to support." | `errors.server_error` | **yes** |

**B — Authentication, session and tenant context**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `invalid_credentials` | 401 | E | Mobile/email and password do not match. Deliberately indistinguishable from an unknown user. | "Mobile number or password is incorrect." | `errors.invalid_credentials` | no |
| `otp_invalid` | 400 | D `attempts_left` | The submitted OTP is wrong or the challenge is spent. Five wrong attempts void the challenge. | "That code is not correct." | `errors.otp_invalid` | no |
| `otp_throttled` | 429 | D `retry_after` | OTP send or verify exceeded 5/mobile/10 min or 20/IP/hour. | "Too many attempts. Try again later." | `errors.otp_throttled` | **yes** |
| `login_throttled` | 429 | D `retry_after` | Password login exceeded its per-mobile attempt budget. | "Too many attempts. Try again later." | `errors.login_throttled` | **yes** |
| `invalid_token` | 401 | E | The access or refresh token fails signature, structure or expiry validation. | "Your session is not valid. Please sign in again." | `errors.invalid_token` | no |
| `token_stale` | 401 | E | The token's `ver` claim is behind the membership's `permissions_version`: the role changed since the token was minted (Part 20 §20.5.1). The client refreshes once and retries. | "Your permissions changed. Reloading." | `errors.token_stale` | **yes** |
| `session_revoked` | 401 | E | The refresh family was revoked, by logout-everywhere, by a password change or by refresh-token reuse detection. | "You were signed out. Please sign in again." | `errors.session_revoked` | no |
| `current_session` | 409 | E | An attempt to revoke or rename the session making the request. | "You cannot revoke the session you are using." | `errors.current_session` | no |
| `no_active_tenant` | 403 | E | A business endpoint was called with a token carrying no `tid`: the user has no membership, or has not chosen a business. | "Choose a business first." | `errors.no_active_tenant` | no |
| `invitation_invalid` | 400 | E | An invitation token is unknown, expired, already accepted or revoked. | "This invitation is no longer valid." | `errors.invitation_invalid` | no |
| `memberships_exist` | 409 | D `tenant_ids` | `DELETE /auth/me` was called while the user still holds an active or invited membership. | "Leave or close your businesses first." | `errors.memberships_exist` | no |
| `export_required` | 409 | E | Tenant deletion was requested before the DPDP data export required by `PLT-10` has been generated and downloaded. | "Download your data before closing the business." | `errors.export_required` | no |
| `impersonation_not_consented` | 403 | E | A super-admin impersonation token was used against a tenant that has not granted an active consent window (Part 20 §20.4.8). | "The business has not allowed support access." | `errors.impersonation_not_consented` | no |
| `impersonation_forbidden` | 403 | E | An impersonation token attempted a write, or an endpoint on the impersonation deny-list (Part 27 §27.8). | "Support access is read-only." | `errors.impersonation_forbidden` | no |

**C — Platform, governance and white-label**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `last_owner` | 409 | E | Removing, suspending or demoting the last `owner` membership of a tenant. | "A business must always have one owner." | `errors.last_owner` | no |
| `self_change_forbidden` | 403 | E | A member attempted to change their own role, status or permission override. | "You cannot change your own role." | `errors.self_change_forbidden` | no |
| `tenant_suspended` | 403 | E | The tenant is suspended by its partner or by Metis ops. | "This business is suspended. Contact support." | `errors.tenant_suspended` | no |
| `partner_suspended` | 403 | E | The owning partner is suspended, which suspends every tenant under it. | "This service is suspended. Contact support." | `errors.partner_suspended` | no |
| `tenant_pending_deletion` | 409 | E | A write was attempted during the 30-day deletion cool-off. | "This business is being closed. Cancel the closure to continue." | `errors.tenant_pending_deletion` | no |
| `plan_in_use` | 409 | D `tenant_count` | A plan with live tenants was archived or deleted. | "This plan is in use." | `errors.plan_in_use` | no |
| `module_has_data` | 409 | D `module`, `row_count` | A module with business rows was switched off. | "This module has data and cannot be switched off." | `errors.module_has_data` | no |
| `gst_type_locked` | 409 | D `issued_invoice_count` | `gst_type` was changed away from `regular` while tax invoices exist in the current financial year. | "You have already issued tax invoices this year." | `errors.gst_type_locked` | no |
| `gstin_in_use` | 409 | D `tenant_id` | The GSTIN is already registered to another tenant on the platform. | "This GSTIN is already registered." | `errors.gstin_in_use` | no |
| `sequence_backwards` | 409 | D `current`, `requested` | A document-sequence `next_number` was set below the highest allocated number. | "Numbering cannot go backwards." | `errors.sequence_backwards` | no |
| `branding_locked` | 403 | E | A tenant edited a branding field its partner has locked (Part 24 §24.4). | "Your provider manages this setting." | `errors.branding_locked` | no |
| `low_contrast` | 400 | D `contrast_ratio`, `suggested_hex` | A branding primary colour fails the ≥ 3:1 contrast check against white. | "This colour is too light to read. Try the suggested one." | `errors.low_contrast` | no |
| `theme_invalid` | 400 | F | A partner theme payload fails its JSON schema, or names a token outside the overridable subset (Part 24 §24.4.2). | "This theme is not valid." | `errors.theme_invalid` | no |
| `template_mismatch` | 409 | D `expected`, `received` | A branding or document template version does not match the one the partner profile declares. | "Template version mismatch." | `errors.template_mismatch` | no |
| `font_missing_devanagari` | 400 | D `font_family` | An uploaded partner font has no Devanagari coverage, which would break `hi` rendering. | "This font does not support Hindi." | `errors.font_missing_devanagari` | no |
| `hostname_in_use` | 409 | D `partner_id` | A partner hostname is already claimed and verified by another partner. | "This hostname is already in use." | `errors.hostname_in_use` | no |
| `wrong_partner_host` | 403 | E | A session for a tenant of partner A was presented on partner B's hostname. | "This address does not serve your business." | `errors.wrong_partner_host` | no |
| `partner_ceiling_exceeded` | 403 | D `limit`, `current` | A partner entitlement override exceeds `partner.settings.max_overrides` or leaves `allowed_plan_ids`. | "Your provider's limit has been reached." | `errors.partner_ceiling_exceeded` | no |
| `share_link_limit` | 409 | D `limit` | A party or document already holds the maximum number of live share links. | "Too many share links. Revoke one first." | `errors.share_link_limit` | no |
| `link_expired` | 404 | E | A public share token is past `expires_at`. Returned as 404 so a token cannot be probed for existence. | "This link has expired." | `errors.link_expired` | no |
| `link_revoked` | 404 | E | A public share token was revoked. Also 404, for the same reason. | "This link is no longer available." | `errors.link_revoked` | no |

**D — Parties and ledger**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `party_archived` | 409 | D `party_id` | A write was attempted against an archived party: a ledger entry, a document, a payment or a reminder. | "This party is archived. Restore it to continue." | `errors.party_archived` | no |
| `party_already_archived` | 409 | E | `POST /parties/{id}/archive` on a party already archived. | "This party is already archived." | `errors.party_already_archived` | no |
| `party_not_archived` | 409 | E | `POST /parties/{id}/restore` on an active party. | "This party is not archived." | `errors.party_not_archived` | no |
| `party_balance_nonzero` | 409 | D `balance` | Archiving a party whose balance is not zero, without a recorded write-off. | "Settle or write off the balance first." | `errors.party_balance_nonzero` | no |
| `party_deleted` | 409 | E | A write addressed a party erased under `POST /parties/{id}/erase`. | "This party's details were erased." | `errors.party_deleted` | no |
| `credit_limit_exceeded` | 409 | D `limit`, `exposure_before`, `exposure_after`, `over_by`, `can_override` | A debit would take the party past its credit limit while the tenant's credit-limit mode is `block`. | "This party is over their credit limit." | `errors.credit_limit_exceeded` | no |
| `override_not_allowed` | 403 | E | `override=true` was sent by a principal without the owner/admin right to override a credit block. | "You cannot override this limit." | `errors.override_not_allowed` | no |
| `opening_balance_exists` | 409 | D `entry_id` | A second `opening` ledger entry was posted for a party. | "This party already has an opening balance." | `errors.opening_balance_exists` | no |
| `entry_already_reversed` | 409 | D `reversal_entry_id` | `reverse` or `correct` on an entry whose status is already `reversed`. | "This entry was already reversed." | `errors.entry_already_reversed` | no |
| `use_document_void` | 409 | D `source_type`, `source_id`, `route` | `reverse` or `correct` on a document-sourced ledger entry. The document must be voided instead. | "Void the bill instead of the entry." | `errors.use_document_void` | no |
| `merge_self` | 409 | E | A party merge named the same party as source and target. | "Choose two different parties." | `errors.merge_self` | no |
| `merge_in_progress` | 409 | E | A second merge was started while one is running for the tenant. | "A merge is already running." | `errors.merge_in_progress` | no |
| `merge_balance_mismatch` | 409 | D `expected`, `actual` | The merged balance does not equal the sum of the two parties' balances; the merge is refused rather than committed. | "Balances do not add up. The merge was cancelled." | `errors.merge_balance_mismatch` | no |
| `merge_too_large` | 409 | D `row_count`, `maximum` | A merge would move more rows than the synchronous path permits. | "This party has too much history to merge here." | `errors.merge_too_large` | no |
| `tag_name_taken` | 409 | E | A tag name already exists for the tenant, case-insensitively. | "A tag with this name already exists." | `errors.tag_name_taken` | no |
| `tag_limit_reached` | 400 | D `limit` | The per-tenant or per-party tag cap was reached. | "Too many tags." | `errors.tag_limit_reached` | no |
| `collection_requires_receivable` | 409 | E | A collection date was set on a party whose balance is not a receivable. | "Collection dates apply to parties who owe you." | `errors.collection_requires_receivable` | no |
| `nothing_due` | 409 | D `party_id` | A reminder, an auto-allocation or a collection action was requested for a party with nothing outstanding. | "There is nothing due from this party." | `errors.nothing_due` | no |

**E — Inventory**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `insufficient_stock` | 409 | D `lines[i]`, `item_id`, `available`, `requested` | A movement would take on-hand below zero while `inventory.allow_negative_stock` is off. | "Not enough stock." | `errors.insufficient_stock` | no |
| `stock_nonzero` | 409 | D `on_hand` | Archiving an item whose on-hand is not zero. | "Adjust the stock to zero first." | `errors.stock_nonzero` | no |
| `item_archived` | 409 | D `item_id` | A document line or movement names an archived item. | "This item is archived." | `errors.item_archived` | no |
| `item_has_movements` | 409 | D `movement_count` | A change was attempted that the movement history forbids, such as deleting an item that has moved. | "This item already has stock history." | `errors.item_has_movements` | no |
| `item_type_locked` | 409 | E | `item_type` was changed between `goods` and `service` after movements or document lines exist. | "You cannot change the item type now." | `errors.item_type_locked` | no |
| `track_stock_not_allowed` | 400 | E | `track_stock` was turned on for a service item, or off while on-hand is not zero. | "Stock tracking cannot be changed for this item." | `errors.track_stock_not_allowed` | no |
| `opening_stock_required` | 409 | E | `track_stock` was turned on without an opening-stock quantity and date. | "Enter the opening stock." | `errors.opening_stock_required` | no |
| `opening_exists` | 409 | D `movement_id` | A second `opening` stock movement was posted for an item at a location. | "This item already has an opening stock entry." | `errors.opening_exists` | no |
| `duplicate_sku` | 400 | D `sku`, `item_id` | The SKU is already used by another item of the tenant. | "This SKU is already used." | `errors.duplicate_sku` | no |
| `barcode_exists` | 409 | D `barcode`, `item_id` | The barcode is already used by another item of the tenant. | "This barcode is already used." | `errors.barcode_exists` | no |
| `sku_generation_failed` | 409 | E | Auto-SKU could not find a free suffix after its bounded attempts. | "Could not generate a code. Enter one." | `errors.sku_generation_failed` | no |
| `unit_in_use` | 409 | D `item_count` | A unit with items against it was deleted. | "This unit is in use." | `errors.unit_in_use` | no |
| `unit_locked` | 409 | E | A system unit (`is_system`) was renamed or deleted. | "This is a standard unit and cannot be changed." | `errors.unit_locked` | no |
| `category_in_use` | 409 | D `item_count` | A category with items or children against it was deleted. | "This category is in use." | `errors.category_in_use` | no |
| `last_category` | 409 | E | The tenant's last expense or item category was deleted. | "Keep at least one category." | `errors.last_category` | no |
| `system_category_immutable` | 409 | E | A category carrying a `system_code` was renamed or deleted. | "This category is managed by the system." | `errors.system_category_immutable` | no |
| `nesting_too_deep` | 400 | D `maximum_depth` | A category parent would exceed the one level of nesting the schema permits. | "Categories can only be one level deep." | `errors.nesting_too_deep` | no |
| `tax_rate_inactive` | 400 | D `tax_code` | A document line named a tax code that is not active. | "This tax rate is not active." | `errors.tax_rate_inactive` | no |
| `tax_rate_not_effective` | 400 | D `tax_code`, `document_date` | A tax code has no row effective on the document's date. | "This tax rate does not apply on that date." | `errors.tax_rate_not_effective` | no |
| `missing_weight` | 400 | D `item_id` | Landed cost was allocated `by_weight` and a participating item has no net weight. | "Enter a weight for this item." | `errors.missing_weight` | no |
| `same_location` | 400 | E | A stock transfer names one location as both source and destination. | "Choose two different locations." | `errors.same_location` | no |

**F — Sales and purchases documents**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `kind_not_allowed` | 400 | D `kind`, `allowed_kinds`, `gst_type` | The requested document kind is not permitted for the tenant's GST type: `invoice` for an unregistered tenant, or anything but `bill_of_supply` for a composition tenant. | "Your GST registration does not allow this document." | `errors.kind_not_allowed` | no |
| `document_not_draft` | 409 | D `status` | An edit or delete was attempted on a document past `draft`. | "This document is no longer a draft." | `errors.document_not_draft` | no |
| `document_not_open` | 409 | D `status` | A payment, allocation or return was applied to a document that is not open. | "This document is closed." | `errors.document_not_open` | no |
| `document_not_recorded` | 409 | D `status` | A purchase action requires a `recorded` bill and the bill is not one. | "This bill has not been recorded yet." | `errors.document_not_recorded` | no |
| `document_not_editable` | 409 | D `status`, `reason` | An edit was attempted inside a window that has closed, such as an expense past its 24-hour edit window. | "The time to edit this has passed." | `errors.document_not_editable` | no |
| `document_already_void` | 409 | E | `void` was called on a document already void. | "This document is already cancelled." | `errors.document_already_void` | no |
| `document_not_shareable` | 409 | D `status` | A share link was requested for a draft or void document. | "Issue the document before sharing it." | `errors.document_not_shareable` | no |
| `has_dependent_documents` | 409 | D `document_ids` | A void would orphan a credit note, debit note, receipt or GRN that references the document. | "Cancel the linked documents first." | `errors.has_dependent_documents` | no |
| `duplicate_supplier_invoice` | 409 | D `document_id`, `number` | The supplier invoice number and date are already recorded for that supplier. | "This supplier bill is already entered." | `errors.duplicate_supplier_invoice` | no |
| `duplicate_code` | 400 | D `code` | A human-visible code the tenant supplies is already taken. | "This code is already used." | `errors.duplicate_code` | no |
| `line_closed` | 409 | D `line_no` | A purchase-order line already fully received was edited or received again. | "This line is complete." | `errors.line_closed` | no |
| `over_receipt` | 409 | D `line_no`, `ordered`, `received` | A goods receipt exceeds the ordered quantity beyond the permitted tolerance. | "You are receiving more than was ordered." | `errors.over_receipt` | no |
| `qty_below_received` | 400 | D `line_no`, `received` | A purchase-order line quantity was reduced below what has been received. | "Received quantity is higher than this." | `errors.qty_below_received` | no |
| `items_changed_since` | 409 | D `changed_item_ids` | A document was issued from a stale draft whose items changed underneath it. | "Some items changed. Review the document." | `errors.items_changed_since` | no |
| `nothing_to_return` | 409 | E | A credit or debit note was raised where nothing remains returnable on the source document. | "There is nothing left to return." | `errors.nothing_to_return` | no |
| `refund_exists` | 409 | D `payment_id` | A credit note with a refund already recorded was voided or re-settled. | "A refund was already paid against this note." | `errors.refund_exists` | no |
| `gst_not_registered` | 409 | E | A tax invoice or a GST report was requested for an unregistered tenant. | "Your business is not registered for GST." | `errors.gst_not_registered` | no |

**G — Payments and expenses**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `over_allocated` | 409 | D `payment_id`, `allocatable`, `requested` | Allocations exceed the payment amount, or exceed the addressed document's amount due. This is the single code for both, and it replaces the four per-FRD spellings listed in §22.1.4. | "This is more than is outstanding." | `errors.over_allocated` | no |
| `mode_sum_mismatch` | 400 | D `amount`, `mode_sum` | The sum of `mode_breakup` amounts does not equal the payment amount. | "The payment modes do not add up." | `errors.mode_sum_mismatch` | no |
| `split_amount_mismatch` | 400 | D `expected`, `received` | A split or settlement payload's parts do not sum to its whole. | "The amounts do not add up." | `errors.split_amount_mismatch` | no |
| `payment_already_void` | 409 | E | `void` was called on a payment already void. | "This payment is already cancelled." | `errors.payment_already_void` | no |
| `payment_not_unmatched` | 409 | D `status` | A match was attempted on a payment that is not in the unmatched queue. | "This payment is already matched." | `errors.payment_not_unmatched` | no |
| `payment_already_matched` | 409 | D `party_id` | A second match was attempted on a matched payment. | "This payment is already matched." | `errors.payment_already_matched` | no |
| `payment_request_linked` | 409 | D `request_id` | A payment carrying a live aggregator request was voided. | "Cancel the payment request first." | `errors.payment_request_linked` | no |
| `upi_vpa_missing` | 409 | E | A UPI intent or QR was requested and the tenant has no VPA configured. | "Add your UPI ID in settings." | `errors.upi_vpa_missing` | no |
| `expense_already_void` | 409 | E | `void` was called on an expense already void. | "This expense is already cancelled." | `errors.expense_already_void` | no |
| `expense_amount_immutable` | 409 | E | An expense amount was edited after its ledger entry was posted; the expense must be voided and re-entered. | "Cancel and re-enter to change the amount." | `errors.expense_amount_immutable` | no |

**H — Notifications and messaging**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `channel_not_configured` | 409 | D `channel` | A send was requested on a channel with no configured provider — the state the console SMS backend leaves at MVP. | "This channel is not set up yet." | `errors.channel_not_configured` | no |
| `provider_not_configured` | 403 | D `provider` | A provider-specific endpoint was called before its credentials exist. | "This provider is not set up." | `errors.provider_not_configured` | no |
| `provider_credentials_invalid` | 400 | D `provider` | Provider credentials were rejected at save time by a validation call. | "These provider details were not accepted." | `errors.provider_credentials_invalid` | no |
| `provider_error` | 502 | D `provider`, `provider_code` | The provider accepted the call and returned a failure. The provider's own code travels in `details`, never in `code`. | "The messaging provider returned an error." | `errors.provider_error` | **yes** |
| `signature_invalid` | 400 | E | An inbound webhook failed HMAC verification. | "Signature verification failed." | `errors.signature_invalid` | no |
| `dlt_template_required` | 409 | D `template_code` | An SMS send was attempted without a DLT-registered template, which Indian law requires. | "This message needs a registered template." | `errors.dlt_template_required` | no |
| `template_not_registered` | 409 | D `template_code` | The named template does not exist for the sender. | "This template is not registered." | `errors.template_not_registered` | no |
| `template_not_approved` | 409 | D `template_code`, `approval_status` | The template exists and is not approved for sending. | "This template is not approved yet." | `errors.template_not_approved` | no |
| `party_opted_out` | 409 | D `channel` | A send was attempted to a party who has opted out of that channel. | "This party has opted out of messages." | `errors.party_opted_out` | no |
| `push_not_subscribed` | 409 | E | A push send was attempted for a user with no live subscription. | "Notifications are not switched on for this device." | `errors.push_not_subscribed` | no |
| `invalid_push_endpoint` | 400 | E | A push subscription payload is malformed. | "This device could not be registered." | `errors.invalid_push_endpoint` | no |
| `push_subscription_expired` | 409 | D `subscription_id` | The push service reported the subscription gone; it is deleted and the send is abandoned. | "This device is no longer registered." | `errors.push_subscription_expired` | no |
| `email_quota_exceeded` | 429 | D `retry_after`, `sent`, `limit` | The tenant's daily outbound email allowance is spent. | "You have sent the maximum emails for today." | `errors.email_quota_exceeded` | **yes** |

**I — Import, export and reports**

| Code | HTTP | Envelope | Raised when | English message | `hi` key | Retryable |
|---|---|---|---|---|---|---|
| `import_not_ready` | 409 | D `status` | `commit` was called on an import job that is not in `ready`. | "This import is not ready to apply." | `errors.import_not_ready` | no |
| `import_has_errors` | 409 | D `error_count` | `commit` was called while blocking row errors remain. | "Fix the highlighted rows first." | `errors.import_has_errors` | no |
| `import_in_progress` | 409 | D `job_id` | A second import of the same kind was started while one is running. | "An import is already running." | `errors.import_in_progress` | no |
| `missing_columns` | 400 | D `columns` | An uploaded file lacks a required column after mapping. | "Some required columns are missing." | `errors.missing_columns` | no |
| `unknown_column` | 400 | D `columns` | A mapping names a column the target does not have. | "Unknown column in the mapping." | `errors.unknown_column` | no |
| `duplicate_in_file` | 400 | D `rows` | The uploaded file contains rows the target's unique constraint cannot both accept. | "The file has duplicate rows." | `errors.duplicate_in_file` | no |
| `legacy_excel_format` | 400 | E | A `.xls` (BIFF) file was uploaded; only `.xlsx` and CSV are read. | "Save the file as .xlsx or .csv and try again." | `errors.legacy_excel_format` | no |
| `upsert_not_supported` | 400 | D `kind` | `mode=upsert` was requested for an import kind that only inserts. | "This import cannot update existing rows." | `errors.upsert_not_supported` | no |
| `revert_window_closed` | 409 | D `expires_at` | An import revert was requested past its window. | "The time to undo this import has passed." | `errors.revert_window_closed` | no |
| `export_in_progress` | 409 | D `export_id` | A second export of the same report and parameters was requested while one is running. | "This export is already running." | `errors.export_in_progress` | no |
| `export_too_large` | 400 | D `row_count`, `maximum` | An export exceeds the row ceiling even asynchronously. | "This export is too large. Narrow the date range." | `errors.export_too_large` | no |
| `export_expired` | 404 | E | A download was requested past the export's `expires_at`. The file is gone, not hidden. | "This download has expired. Run the report again." | `errors.export_expired` | no |
| `export_queue_full` | 503 | D `retry_after` | The export worker's bounded queue is full. | "Exports are busy. Please try again shortly." | `errors.export_queue_full` | **yes** |
| `nothing_to_export` | 400 | E | An export's filtered set is empty. | "There is nothing to export." | `errors.nothing_to_export` | no |
| `period_not_closed` | 409 | D `period` | A filed-period action was attempted on a period that is not closed. | "This period is not closed yet." | `errors.period_not_closed` | no |
| `gstr1_blocked` | 409 | D `blocking_count` | A GSTR-1 export was requested while blocking reconciliation errors remain (`RPT-07`). | "Fix the reconciliation errors first." | `errors.gstr1_blocked` | no |
| `gstr1_warnings_unacknowledged` | 409 | D `warning_count` | A GSTR-1 export was requested with unacknowledged warnings. | "Review the warnings before exporting." | `errors.gstr1_warnings_unacknowledged` | no |
| `schema_validation_failed` | 400 | F | A settings or template payload failed its registered JSON schema. | "These settings are not valid." | `errors.schema_validation_failed` | no |
| `confirmation_required` | 409 | D `confirm_token`, `impact` | A destructive or large-blast-radius action needs an explicit second call carrying the token returned here. | "Please confirm this action." | `errors.confirmation_required` | no |


### 22.1.2 The naming rule

A new code obeys all six of these, and a code that breaks one is rejected at review rather than argued about afterwards.

1. **`snake_case`, ASCII, stable forever.** A code is part of the contract; it is never renamed. A wrong name is retired by registering the right one and deprecating the wrong one per §22.1.3.
2. **It names the *state that blocks the request*, not the action refused and not the fix.** `party_archived`, not `cannot_add_entry` and not `restore_party_first`. The client composes the sentence; the server states the fact.
3. **It is `<subject>_<condition>`.** The subject is the noun the merchant would use (`party`, `document`, `payment`, `export`, `template`), the condition is the adjective or past participle of its state (`_archived`, `_already_void`, `_not_draft`, `_expired`). Where the condition alone is unambiguous across the whole API — `not_found`, `permission_denied` — the subject is omitted, and that set is closed: it is exactly the group A table above.
4. **A field-level rejection is never a top-level code.** If the answer is "this one field is wrong", the code is `validation_error` and the field is in `details`. Twenty-two per-field spellings were found in the FRDs during this reconciliation and every one of them is now `validation_error`; §22.1.4 lists them.
5. **It never carries a provider's vocabulary.** A provider's own code travels in `details.provider_code`. `provider_error` is the code; Razorpay's or MSG91's is data.
6. **One condition, one code, across every module.** If two modules can reach the same state, they raise the same code and distinguish themselves in `details`. `over_allocated` is the worked example: four FRDs had four spellings for one condition.

### 22.1.3 Adding, changing or retiring a code

A code is a public contract with the frontend, with `hi` copy, with the E2E suite and with anyone reading a support ticket. It is added by the process below and by no other.

1. **Raise it in `docs/CR-LOG.md`** against Part 22, naming the FRD requirement that needs it, the HTTP status, the envelope shape and the condition. Ten minutes; the point is that somebody who holds the whole registry reads it and usually answers "that is `validation_error`" or "that is `over_allocated`".
2. **The API owner adds the row here.** Nobody adds a code in a serializer and documents it later; that is the exact sequence that produced the gap this amendment closes.
3. **Both locales land in the same change.** `en` in the table, `errors.<code>` in `locales/en.json` and `locales/hi.json`. A code with no `hi` key fails `scripts/check-locales.mjs`.
4. **The test follows.** The condition gets a test that asserts the code, per Part 28 §28.3.6. A code with no test that raises it is dead and is caught by the same equality assertion from the other side.
5. **Retiring** is a two-release move: the row is marked `deprecated → <replacement>` and stays here for one minor version so a client pinned to the old build still resolves it, then it is deleted. A deprecated code is still emitted; a deleted one is not.

Adding a code is a **Class B** change in Part 39's taxonomy when it accompanies a new endpoint, and **Class C** when it changes what an existing endpoint returns, because that changes what a shipped client will do.

### 22.1.4 Non-canonical spellings found in the corpus, and what they become

These appear in Parts 17-01 to 17-04, 20, 24 and 27 and are **not** codes. Each row is a defect in its chapter, to be corrected by that chapter's author; until it is, this table is the mapping, and `scripts/check_table_ownership.py` reports every remaining use.

| Found as | In | Becomes |
|---|---|---|
| `allocation_exceeds_payment`, `amount_exceeds_due`, `amount_above_allocated`, `payment_exceeds_total` | 17-02, 17-03 | `over_allocated` |
| `permissions_changed` | 17-01 (CR-013) | `token_stale` |
| `credentials_invalid` | 17-02 | `invalid_credentials` |
| `duplicate_barcode` | 17-03 | `barcode_exists` |
| `duplicate_category` | 17-02 | `duplicate_code` |
| `too_many_items` | 17-03 | `too_many_rows` |
| `rate_limit_reached`, `platform_rate_limit` | 17-02, 27 | `rate_limited` |
| `party_opted_out_email`, `party_opted_out_whatsapp` | 17-02 | `party_opted_out` with `details.channel` |
| `item_not_found` | 17-03 | `not_found` |
| `category_inactive` | 17-02 | `not_found` |
| `version_conflict` | 21 §21.3 | `stale_version` |
| `already_revoked` | 17-02 | `link_revoked` (share links) or `session_revoked` (sessions); the FRD must say which |
| `duplicate_mobile`, `duplicate_existing`, `duplicate_rows`, `duplicate_sku` on create, `invalid_amount`, `invalid_qty`, `invalid_percent`, `invalid_number`, `invalid_notes`, `invalid_tags`, `invalid_choice`, `invalid_date_range`, `invalid_file_type`, `invalid_barcode`, `future_date`, `negative_not_allowed`, `amount_too_large`, `required`, `nothing_to_update`, `not_supplier`, `party_required`, `notification_type_required`, `email_channel_invalid`, `messaging_provider_invalid`, `webhook_verify_token` | 17-01…17-04 | `validation_error`, with the field in `details` (§22.1.2 rule 4) |

### 22.1.5 Referenced but not registered — the open gaps

Each of these is named somewhere in the corpus in a way that reads like a code and cannot responsibly be defined here, because the rule it would report does not yet exist. They are listed rather than invented, because an invented code is worse than a missing one: it looks decided.

| Name | Where | Why it is not registered | Owner and gate |
|---|---|---|---|
| `insufficient_balance` | 17-02 | It is not stated what balance is compared, nor whether the guarded object is an advance allocation or a wallet, which does not exist at MVP. | Ledger/payments author, before `PAY-02` |
| `cashbook_mismatch` | 17-02 `EXP-03` | No rule states what is reconciled against what, so no condition can be written. | `EXP-03` author, before `EXP-03` |
| `notification_channel_failed`, `whatsapp_delivery_failed` | 17-02 | These are asynchronous delivery outcomes and belong to `notifications_message_log.status`, not to an HTTP response. Either re-scope them there or specify the synchronous condition. | Notifications author, before `NTF-02` |
| `gstin_checksum_failed`, `invalid_gstin_checksum`, `missing_hsn`, `missing_pos`, `missing_uqc`, `missing_tenant_gstin`, `missing_party_gstin`, `pos_state_mismatch`, `legacy_rate_used` | 17-04 `RPT-07` | These are **reconciliation warnings** on a report row, not HTTP errors. `RPT-07` needs its own warning vocabulary with its own severity and acknowledgement semantics, which Part 42 A-42 assigns. They are recorded here so that Part 28 §28.3.6's equality assertion does not fail on them by mistake. | `RPT-07` author, with A-42, before the GST summary |
| `quality_red`, `recurring_already_ended`, `occurrence_already_recorded`, `request_not_pending`, `sync_settlements`, `payment_provider_error`, `payment_refunded`, `payment_not_matched`, `member_email_unverified`, `quiet_hours`, `service_explicit`, `duplicate_suppressed`, `tour_not_completed` | 17-02, 17-04 | Every one belongs to a Phase 2 feature. They are registered when their feature is built, by §22.1.3, and not before. | Feature author at Phase 2 entry |

Two exclusions, stated so nobody adds them by accident. **Client-synthesised codes are not server codes.** Part 19 §19.4.4's `network_error` and its timeout equivalent are produced by the Axios layer when no response arrived; they are not in this registry and they are excluded from Part 28 §28.3.6's equality assertion. **Metric and status names are not codes.** `failed_24h` (Part 29 §29.3.4), `low_stock`, and the status values of Part 0 §0.7 are none of them error codes; they belong in `scripts/not_error_codes.txt`, which the ownership check reads:


**How the check is introduced without being switched off.** Run today against the corpus as it stands, `check_table_ownership.py` reports **thirty-three** names: every one is a row of §22.1.4 or §22.1.5 and none is a code this registry has missed. A gate that fails on its first run gets disabled, so the `ORPHAN` class runs in **warn** mode until the §22.1.4 corrections land in Parts 17-01 to 17-04, 20, 21, 24 and 27 — that is one change request per chapter, tracked in `docs/CR-LOG.md` — and flips to **fail** at the same commit as the last of them. The `DUPLICATE`, `DRIFT` and `PAIRED` classes fail from the first run, because their findings are already down to three.

```text
# scripts/not_error_codes.txt — words the code regex cannot distinguish from codes.
# Adding a real error code here instead of to Part 22 §22.1.1 is the defect this file exists to expose.
failed_24h low_stock network_error entry_type entry_date party_id party_ids tag_id tag_ids
document_id document_date place_of_supply_state credit_days credit_limit plan_limits plan_id
amount amount_due partially_paid payment_in sale_out stock_value entry_count party_count
request_id last_error current_version current_step token_hash token_epoch token_suffix
is_inter_state is_customer itc_eligible max_users max_parties max_invoices_per_month
other_partner_tenants required_permissions existing_party_id existing_status suggested_hex
allowed_plan_ids received_qty value_impact_total expected_before_date include_archived
enforce_monotonic override confirm_balance in_progress not_started sha256 imports_job
payments_payment decrease_percent unit_cost result reset_at section class as_of against_id
walk_in_name note notes online block channel opening paid ready received reversed queued
importing invited draft converted cancelled completed sent active suspended alpha beta
regular unregistered invoice credit_note expense inventory parties truncate upsert call
comment errors format limit ordering direction confirm role user_id type_code personal_message
next_number opening_balance location_id parent_id unit_id source_id meta name tags body
skipped failed is_system is_customer
```

## 22.2 Authentication & session

### POST `/auth/otp/request`
Request `{ "mobile": "+919876543210", "purpose": "login" }` → 200 `{ "data": { "challenge_id": "…", "expires_in": 300, "retry_after": 30 } }`. Errors: 429 `otp_throttled`. Sends via SMS adapter; in dev, code is logged. Never reveals whether mobile exists.

### POST `/auth/otp/verify`
`{ "challenge_id", "code": "123456", "device_label": "Akash's Pixel" }` → 200 `{ "data": { "user": {…}, "tenants": [ { "id", "name", "role", "is_default" } ], "active_tenant_id": "…"|null, "access_token": "…"(API clients only), "permissions": [ … ] } }` + cookies. New mobile → `user.is_new=true`, `tenants=[]`; client routes to onboarding. 5 wrong attempts invalidates challenge (400 `otp_invalid`, `attempts_left`).

### POST `/auth/login`
`{ "mobile"|"email", "password" }` → same shape as verify. 401 `invalid_credentials` generic; throttled.

### POST `/auth/refresh` → rotates refresh (family detection: reuse of an old token revokes the family). 
### POST `/auth/logout` → revokes current session (`?all=true` revokes all).
### POST `/auth/switch-tenant` `{ "tenant_id" }` → new tokens with `tid`; 403 if not a member.
### GET `/auth/me` → user, memberships, active tenant summary (`enabled_modules`, `gst_type`, `branding`), `permissions[]`, `plan_limits`, `feature_flags`.
### POST `/auth/password/set` (via invitation/OTP-verified) / `POST /auth/password/reset/request` / `POST /auth/password/reset/confirm`.

JWT claims: `sub` (user id), `tid` (tenant id), `rol` (role code), `sid` (session id), `ver` (permissions version — bump on role change forces re-fetch), `exp`.

## 22.3 Tenant & platform

- `GET /tenants/current` → tenant profile; `PATCH /tenants/current` (owner/admin) fields: name, legal_name, business_type, gst_type, gstin (validated; changing gst_type from regular → other requires no issued tax invoices in current FY, else 409), pan, address, state_code, phone, email, bank_details, upi_vpa, locale, enabled_modules (subset of plan).
- `GET /tenants/current/settings` → `{ "numbering": {…}, "sales": {…}, … }`; `PUT /tenants/current/settings` full object validated against JSON schema per key.
- `GET/PUT /tenants/current/branding` (multipart with `logo`, `signature` files; fields `primary_hex`, `secondary_hex`, `app_name`, `doc_header`, `doc_footer`). Server validates WCAG contrast of primary vs white ≥ 3:1 (else 400 `low_contrast`).
- `GET /memberships?status=` ; `POST /memberships/invite` `{ "mobile", "role": "staff", "name" }` → 201 invitation (+ SMS/WhatsApp share text); `PATCH /memberships/{id}` `{ "role", "status", "permissions_override" }`; `DELETE /memberships/{id}` (owner cannot remove last owner → 409).
- `GET /roles` → system + custom roles with permissions; `GET /permissions/me`.
- `GET /audit-logs?entity_type=&entity_id=&actor_id=&action=&date_from=&date_to=` (owner/admin/accountant).
- `POST /tenants/current/export` → 202 job; `POST /tenants/current/delete-request` (owner, OTP re-verify) → status `pending_deletion`, 30-day cool-off; `POST /tenants/current/delete-cancel`.
- Super admin: `/admin/partners`, `/admin/tenants`, `/admin/tenants/{id}/impersonate` (consent flag, audited), `/admin/plans`.

## 22.4 Parties

### GET `/parties`
Params: `q`, `type=customer|supplier`, `balance=owes_me|i_owe|settled`, `status=active|archived`, `tag=`, `collection=today|overdue|upcoming`, `ordering=-last_activity_at|balance|-balance|name`, `page`, `page_size`.
Response `data[]`: `{ id, name, mobile, is_customer, is_supplier, balance, collection_date, tags[], last_activity_at, status }`; `meta.totals: { receivable, payable, count }` computed over the **filtered** set.

### POST `/parties`
```json
{ "name": "Ramesh Traders", "mobile": "+919812345678", "is_customer": true, "is_supplier": false,
  "gstin": "27AAPFU0939F1ZV", "billing_address": { "line1": "…", "city": "Pune", "state_code": "27", "pincode": "411001" },
  "state_code": "27", "tags": ["Camp Area"], "credit_limit": "50000.00", "credit_days": 15,
  "opening_balance": { "amount": "2300.00", "direction": "debit", "as_of": "2026-04-01" }, "sms_opt_in": true }
```
→ 201 party. Errors: 400 duplicate mobile (`details.mobile`), invalid GSTIN checksum, GSTIN state ≠ state_code (warning field `warnings[]`, not error).

### GET `/parties/{id}` → party + `summary: { balance, receivable, payable, open_invoices, overdue_amount, last_payment_at }` + `recent_entries[5]`.
### PATCH `/parties/{id}`; POST `/parties/{id}/archive` (409 `party_balance_nonzero`); POST `/parties/{id}/restore`.
### GET `/parties/{id}/statement?date_from&date_to&include_corrections=false&cursor`
Returns opening balance for range, entries with `running_balance`, closing balance, and document links. `Accept: application/pdf` or `/statement.pdf?…` → PDF (cached 10 min).
### POST `/parties/{id}/share-links` `{ "kind": "statement", "expires_in_days": 7 }` → `{ url, expires_at }`.

## 22.5 Ledger

### POST `/ledger-entries`
```json
{ "party_id": "…", "direction": "debit", "amount": "500.00", "entry_date": "2026-09-18",
  "note": "Sugar 10kg", "payment_mode": null, "reference": null, "attachment_id": null }
```
Headers: `Idempotency-Key`. Behaviour: `direction=debit` ⇒ `entry_type=manual_gave`; `credit` ⇒ `manual_got` (payment_mode required). Credit-limit check per setting (`warn` returns `warnings[]`, `block` returns 409 `credit_limit_exceeded` unless `override=true` by owner/admin). Response 201 `{ data: entry, meta: { party_balance } }`. Triggers party SMS if enabled.

### GET `/parties/{id}/ledger-entries?cursor&limit&date_from&date_to&type=&include_reversed=false`
### GET `/ledger-entries/{id}` → entry with `source` summary (invoice number etc.) and `history` (reversal/correction chain).
### POST `/ledger-entries/{id}/reverse` `{ "reason": "Entered twice" }` → 201 reversal entry; only for `source_type=manual|opening`; document-sourced entries must be reversed by voiding the document (409 `use_document_void`).
### POST `/ledger-entries/{id}/correct` `{ "reason", "amount", "entry_date", "note", "direction" }` → 201 `{ reversal, replacement }` atomically.
### GET `/ledger/summary` → `{ receivable, payable, due_today: {count, amount}, overdue: {count, amount}, upcoming_7d: {…} }`.
### GET `/ledger/aging?type=receivable|payable&as_of=` → per party buckets `[0_30, 31_60, 61_90, 90_plus, total]` + totals.

### Reminders
`GET /reminders?status=&due=today|overdue|upcoming&party_id=`; `POST /reminders` `{ party_id, due_on, channel, note }`; `PATCH /reminders/{id}` `{ status: done|dismissed, due_on }`; `POST /reminders/{id}/send` → for `whatsapp_manual` returns `{ wa_url, text }` and logs `sent`; for `sms` enqueues (202) and returns message_log id; 409 `channel_not_configured`.
`POST /reminders/bulk` `{ party_ids[], channel }` → returns list of `{ party_id, wa_url }` (manual) or 202 (sms).

## 22.6 Inventory

### GET `/items?q&type=goods|service&category_id&stock=low|out|in&status&ordering=name|-updated_at|on_hand&page`
`data[]`: `{ id, name, sku, barcode, item_type, unit: {code}, selling_price, purchase_price, tax_code, on_hand, reorder_point, stock_status: ok|low|out, image_url, status }`. `meta.totals: { items, stock_value }`.
### POST `/items` — fields per §21.3.6 plus `opening_stock: { qty, unit_cost, location_id?, as_of }`. Auto-SKU when omitted: slug of name + 3 digits, unique. 400 on duplicate sku/barcode.
### GET `/items/{id}` → item + `stock: [ { location, on_hand, avg_cost, value } ]` + `movements_recent[10]`.
### PATCH `/items/{id}` (changing `track_stock` false→true requires opening stock; true→false requires on_hand = 0 → 409). POST `/items/{id}/archive` (409 `stock_nonzero`), `/restore`.
### GET `/items/{id}/movements?cursor&limit&date_from&date_to&type=`
### GET `/items/lookup?barcode=` → single item or 404 (fast path for scanners).
### GET/POST `/categories`, `/units` (units: `code`, `name`, `allow_decimal`).
### POST `/stock-adjustments`
```json
{ "adjustment_date": "2026-09-18", "location_id": null, "reason": "damage", "note": "Rain damage",
  "lines": [ { "item_id": "…", "qty": "-3", "unit_cost": null }, { "item_id": "…", "qty": "12", "unit_cost": "40.0000" } ] }
```
→ 201 header with `movements[]`; 409 `insufficient_stock` (`details.lines[i]`) unless `inventory.allow_negative_stock`.
### GET `/stock/summary?category_id&location_id&as_of` → per item `{ on_hand, avg_cost, value }` + totals; `GET /stock/low`.
### Phase 2: `/locations`, `/stock-transfers`, `/price-lists`, `/items/{id}/variants`.

## 22.7 Sales

### Common document shape
```json
{ "id": "…", "kind": "invoice", "number": "INV/26-27/0042", "status": "issued", "version": 3,
  "party": { "id": "…", "name": "…", "gstin": "…" } | null, "walk_in_name": null,
  "document_date": "2026-09-18", "due_on": "2026-10-03", "place_of_supply_state": "27", "is_inter_state": false,
  "lines": [ { "line_no": 1, "item_id": "…", "description": "Basmati Rice 5kg", "hsn_sac": "1006", "qty": "2.000", "unit_code": "NOS",
               "unit_price": "450.0000", "tax_inclusive": false, "discount_type": "percent", "discount_value": "5",
               "discount_amount": "45.00", "taxable_value": "855.00", "tax_code": "GST5", "tax_rate": 5,
               "cgst": "21.38", "sgst": "21.37", "igst": "0.00", "cess": "0.00", "line_total": "897.75" } ],
  "subtotal": "855.00", "discount_type": null, "discount_amount": "0.00", "taxable_total": "855.00",
  "cgst_total": "21.38", "sgst_total": "21.37", "igst_total": "0.00", "cess_total": "0.00", "round_off": "0.25", "grand_total": "898.00",
  "amount_paid": "898.00", "amount_due": "0.00", "payments": [ { "id": "…", "amount": "898.00", "mode_breakup": [...] } ],
  "notes": "", "terms": "…", "pdf_url": "/api/v1/sales/invoices/{id}.pdf", "public_url": "https://…/d/abc123",
  "created_by": {…}, "issued_at": "…", "created_at": "…", "updated_at": "…" }
```

### GET `/sales/invoices?status=draft,issued,partially_paid,paid,overdue,void&party_id&date_from&date_to&q&ordering&page`
`meta.totals: { count, grand_total, amount_due }` over filtered set.
### POST `/sales/invoices` (draft) — body: `kind` (`invoice`|`bill_of_supply`; server forces `bill_of_supply` for composition tenants and rejects `invoice` for unregistered → 400 `kind_not_allowed`), `party_id`|`walk_in_*`, `document_date`, `due_on`|`credit_days`, `place_of_supply_state` (defaults party state → tenant state), `reverse_charge`, `lines[]` (`item_id`, `qty`, `unit_price`?, `discount_*`?, `description`? , `tax_code`? — defaults from item), `discount_*`, `round_off_enabled`, `notes`, `terms`, `payment` (optional immediate `{ mode_breakup[] , reference }`). Server recomputes every total; client-supplied totals ignored. Returns 201 draft **or**, with `?issue=true`, issues atomically (number allocated, stock deducted, ledger posted, payment recorded). `Idempotency-Key` required for `issue=true`.
### PATCH `/sales/invoices/{id}` — only while `draft`; requires `version`.
### POST `/sales/invoices/{id}/issue` → allocates number, snapshots party, posts `sale_out` movements (409 `insufficient_stock` unless allowed), posts ledger debit for party (credit sales) and records payment if given; renders PDF async (202-style: `pdf_status: pending` then `ready`). 
### POST `/sales/invoices/{id}/void` `{ "reason" }` → reverses stock and ledger, voids unallocated payments? **No** — payments remain as party advance (unallocated) and user is prompted; 409 if e-invoice IRN exists beyond 24 h (P3).
### GET `/sales/invoices/{id}.pdf?template=a4|thermal80` ; POST `/sales/invoices/{id}/share-links`; `GET /sales/invoices/{id}/upi-intent` → `{ upi_url, qr_svg_url }`.
### DELETE `/sales/invoices/{id}` → only drafts.
### Estimates: `/sales/estimates` same shape (no tax if tenant unregistered; tax preview allowed), statuses per canon; `POST /sales/estimates/{id}/convert` → new draft invoice with `converted_from_id`.
### Credit notes: `POST /sales/credit-notes` `{ against_id?, party_id, document_date, reason, lines[] (item_id, qty ≤ invoiced − returned), restock: true|false, settlement: "hold_advance"|"refund" , refund_payment? }`; `POST …/issue` posts `sale_return_in` (if restock) + ledger credit; `apply` to invoice via `POST /sales/credit-notes/{id}/apply` `{ invoice_id, amount }`.

## 22.8 Purchases

`GET/POST /purchases/bills`, `PATCH` (draft), `POST /purchases/bills/{id}/record` (posts `purchase_in` movements with unit cost and avg-cost update, ledger credit to supplier, optional payment), `POST /purchases/bills/{id}/void`. Fields add `supplier_invoice_number`, `supplier_invoice_date`, `itc_eligible`. 409 `duplicate_supplier_invoice`. Phase 2: `/purchases/orders`, `/purchases/orders/{id}/receive`, `/purchases/debit-notes`.

## 22.9 Payments

### POST `/payments`
```json
{ "direction": "in", "party_id": "…", "payment_date": "2026-09-18",
  "mode_breakup": [ { "mode": "upi", "amount": "700.00", "reference": "UTR123" }, { "mode": "cash", "amount": "300.00" } ],
  "note": "Part payment", "allocations": [ { "document_type": "sales_document", "document_id": "…", "amount": "898.00" } ] | "auto" }
```
Rules: Σ mode amounts = amount; Σ allocations ≤ amount; `allocations:"auto"` applies FIFO to oldest open documents; remainder becomes advance. Posts ledger `payment_in` (credit) / `payment_out` (debit). 201 with `party_balance`.
### GET `/payments?direction&party_id&mode&date_from&date_to&page`; `GET /payments/{id}`; `POST /payments/{id}/void {reason}`; `GET /payments/{id}.pdf`.
### `GET /payments/qr.svg?amount=&note=&ref=` → SVG QR from tenant VPA; `POST /payments/upi-intent` `{ amount, note, party_id?, document_id? }` → `{ upi_url, web_url }`.
### Phase 2: `POST /payment-requests`, `GET /payment-requests/{id}`, `POST /webhooks/payments/razorpay` (signature verified, idempotent on `provider_payment_id`), `GET /payments/unmatched`, `POST /payments/unmatched/{id}/match { party_id, allocations }`.

## 22.10 Expenses
`GET/POST /expenses`, `POST /expenses/{id}/void`, `GET/POST /expense-categories`. Expense with `party_id` and `paid=false` posts a ledger credit (payable); `paid=true` posts nothing to ledger but appears in cashbook.

## 22.11 Reports
All `GET`, params `date_from`, `date_to`, filters per report, `format=json|csv|xlsx`. CSV/XLSX for > 5k rows → 202 `{ export_id }`, poll `GET /reports/exports/{id}` → `{ status, download_url }`.

| Endpoint | Key params | Returns |
|---|---|---|
| `/reports/dashboard` | — | tiles + recent activity + top debtors + low stock count (cached ≤ 60 s) |
| `/reports/day-book` | date range, type | chronological rows across sales/purchases/payments/expenses/manual entries with running cash & bank |
| `/reports/sales-register` | date range, party, status | invoice-wise rows with tax columns; totals |
| `/reports/purchase-register` | idem | |
| `/reports/receivables-aging`, `/payables-aging` | as_of, tag | party rows × buckets |
| `/reports/stock-summary` | category, location, as_of | item rows on_hand/avg_cost/value; totals |
| `/reports/gst-summary` | period (month/quarter), type outward|inward | by tax code: taxable, cgst, sgst, igst, cess; HSN summary; document series summary; B2B vs B2C split |
| `/reports/cashbook` | date range, mode | opening, in, out, closing per day |

## 22.12 Notifications, imports, misc
- `GET /notifications?unread=true&cursor`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `GET /notifications/unread-count`.
- `POST /imports` multipart `{ kind, file }` → 201 job (`validating`); `GET /imports/{id}` → status, errors sample, preview rows; `POST /imports/{id}/commit` → 202; `POST /imports/{id}/cancel`. `GET /imports/templates/{kind}.csv`.
- `GET /taxes/rates?as_of=` ; `GET /taxes/hsn?q=rice` (≤ 20 results).
- `GET /system/health` (unauthenticated, shallow), `GET /system/version`.
- Public (unauthenticated, token-based): `GET /public/d/{token}` → document JSON for public page; `GET /public/d/{token}.pdf`; `GET /public/khata/{token}` (P2).

## 22.13 Webhooks (inbound, Phase 2) and outbound (Phase 3)
Inbound provider webhooks verify HMAC signatures, are idempotent on provider ids, respond 200 fast and process in Celery. Outbound tenant webhooks (P3) deliver `{ id, type, tenant_id, occurred_at, data }` with HMAC `X-UB-Signature`, retries with exponential backoff up to 24 h, and a delivery log.

## 22.14 Worked example — record a credit sale and a partial payment

1. `POST /sales/invoices?issue=true` with `Idempotency-Key`, party Ramesh, 2 × Rice @450, GST5 → 201 `status=issued`, `grand_total=898.00`, `amount_due=898.00`. Side effects: `StockMovement(sale_out −2)`, `LedgerEntry(debit 898, entry_type=invoice)`, `Party.balance += 898`, audit rows, notification none.
2. `POST /payments` `direction=in`, amount 500 UPI, `allocations:"auto"` → allocation 500 to invoice, invoice `partially_paid`, `amount_due=398.00`; `LedgerEntry(credit 500, payment_in)`; `Party.balance = 398`; SMS to party if enabled: "Received ₹500. Balance ₹398."
3. `GET /parties/{id}/statement` → opening 0 → +898 (INV/26-27/0042) → −500 (RCT/26-27/0017) → closing 398.
4. Owner voids the invoice by mistake? `POST /sales/invoices/{id}/void` → stock +2 (`reversal`), ledger credit 898 (`reversal`), invoice `void`; the ₹500 payment remains as unallocated advance; party balance −102 ("You will give ₹102"). Statement shows both with corrections toggle.
