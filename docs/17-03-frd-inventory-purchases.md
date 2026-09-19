# Part 17 — FRD: Inventory (17.6), Purchases (17.7), Import / Export (17.8)

Normative inputs: Part 0 (canon), Part 16 (catalogue), Part 21 (§21.3.5 tax, §21.3.6 inventory, §21.3.8 purchases, §21.3.11 imports), Part 22 (§22.6, §22.8, §22.12), Part 17.0 (template), Part 23 (design system), research 01 §A.1–A.13/A.23/A.28/A.38 and 02 §C.1/§C.5. Where this chapter names a table, column, endpoint, status or permission it is one already defined in Parts 0/21/22; the only additions are collected under **Canon change requests** at the end.

## 17.6 Inventory (INV)

### 17.6.0 Conventions shared by the INV features

**Frontend location.** `src/modules/UdhaarBook/features/<feature>/{api,components,hooks,redux,types,constants,view-model,validation}` with features `item-list`, `item-form`, `item-detail`, `inventory-masters`, `stock-adjustment`, `stock-summary`. Slices/thunks follow the BrandHub Customer convention: `redux/itemListSlice.ts` + `redux/itemListThunk.ts` (`createAsyncThunk` → `api/itemService.ts`). Endpoint constants live in `src/api/APIPaths.ts` (`API_PATHS.ITEMS`, `API_PATHS.ITEM_BY_ID(id)`, `API_PATHS.ITEM_LOOKUP`, `API_PATHS.ITEM_MOVEMENTS(id)`, `API_PATHS.ITEM_ARCHIVE(id)`, `API_PATHS.ITEM_RESTORE(id)`, `API_PATHS.CATEGORIES`, `API_PATHS.UNITS`, `API_PATHS.STOCK_ADJUSTMENTS`, `API_PATHS.STOCK_SUMMARY`, `API_PATHS.STOCK_LOW`, `API_PATHS.TAX_RATES`, `API_PATHS.TAX_HSN`). Services map `snake_case` → `camelCase` and return typed `Item`, `ItemListRow`, `StockMovement`, `StockAdjustment` from `types/item.types.ts`. Yup schemas are exported from `src/hooks/useValidationSchemas.ts` (`itemSchema`, `openingStockSchema`, `categorySchema`, `unitSchema`, `stockAdjustmentSchema`, `stockAdjustmentLineSchema`). Toasts go through `snackbarSlice` only.

**Backend location.** Django app `inventory`: `services/item_service.py` (`create_item`, `update_item`, `archive_item`, `restore_item`, `generate_sku`), `services/stock_service.py` (`post_movement`, `post_opening_stock`, `post_adjustment`, `reverse_movements_for_source`, `check_availability`, `apply_weighted_average`), `services/low_stock_service.py` (`evaluate_crossing`, `scan_low_stock`), `selectors.py`. App `tax`: `selectors.py` (`rate_for(code, on_date)`, `search_hsn(q)`). Management commands: `seed_units`, `seed_tax_rates`, `seed_hsn`, `recalc_stock`, `scan_low_stock`, `run_scheduler`.

**Movement type per action (normative mapping, codes from §21.3.6).**

| Action | `movement_type` | Sign | `unit_cost` | Feature |
|---|---|---|---|---|
| Opening stock | `opening` | + | entered cost | INV-05, INV-09 |
| Purchase bill recorded | `purchase_in` | + | line inbound cost (§17.7 BR) | PUR-01 |
| Invoice issued | `sale_out` | − | snapshot = current `avg_cost` | SAL-02 |
| Credit note with restock | `sale_return_in` | + | original line `unit_cost_snapshot` | SAL-04 |
| Debit note / purchase return | `purchase_return_out` | − | snapshot = current `avg_cost` | PUR-07 |
| Manual adjustment + / − | `adjust_in` / `adjust_out` | + / − | entered (in) / snapshot avg (out) | INV-06 |
| Transfer initiated / received | `transfer_out` / `transfer_in` | − / + | snapshot avg / same value | INV-11 |
| Stock take | `stocktake_in` / `stocktake_out` | ± | as adjustments | INV-17 (P3) |
| Void of any posting document | `reversal` | opposite of reversed row | copy of reversed row's `unit_cost`; `reverses_id` set, which is what makes the costing rule treat it as a value reversal rather than a plain movement | PUR-04, SAL-05, INV-11 |

**Weighted-average cost (Part 21 §21.3.6 is normative; this is its restatement for the INV features).** On every inbound movement with a cost: `new_avg = (on_hand × avg + qty × unit_cost) / (on_hand + qty)`; if `on_hand ≤ 0` before the inbound, `new_avg = unit_cost`. A **plain** outbound never changes `avg_cost` — it snapshots the current average as its `unit_cost` so COGS is frozen at issue. A **`reversal` row is not a plain outbound**: a reversal of an inbound removes the value that inbound added, at the reversed row's `unit_cost` — `new_avg = (on_hand × avg − |qty| × c) / (on_hand − |qty|)`, and `new_avg = 0` when `on_hand` reaches or passes zero — and a reversal of an outbound comes back in at the cost the goods left at. This is what makes voiding a bill undo its cost effect instead of leaving it in the average. `avg_cost` is `numeric(14,4)` rounded half-up to 4 dp; stock value = `on_hand × avg_cost` rounded half-up to 2 dp at display time. `avg_cost_after` and `on_hand_after` are written on every movement row; `inventory_item_stock` mirrors the last row. Worked example (item "Basmati Rice 5kg", unit NOS, `allow_negative_stock = true` for illustration):

| # | Movement | qty | unit_cost | on_hand before | Calculation | on_hand after | avg after |
|---|---|---|---|---|---|---|---|
| 1 | `opening` | +10 | 40.0000 | 0 | on_hand ≤ 0 → reset | 10 | 40.0000 |
| 2 | `purchase_in` | +20 | 46.0000 | 10 | (10×40 + 20×46)/30 = 1320/30 | 30 | 44.0000 |
| 3 | `sale_out` | −25 | 44.0000 (snapshot) | 30 | outbound, unchanged | 5 | 44.0000 |
| 4 | `adjust_out` (damage) | −8 | 44.0000 (snapshot) | 5 | outbound, unchanged | −3 | 44.0000 |
| 5 | `purchase_in` | +12 | 50.0000 | −3 | on_hand ≤ 0 → reset | 9 | 50.0000 |
| 6 | `purchase_return_out` | −4 | 50.0000 (snapshot) | 9 | outbound, unchanged | 5 | 50.0000 |
| 7 | `purchase_in` | +3 | 41.0000 | 5 | (5×50 + 3×41)/8 = 373/8 = 46.625 | 8 | 46.6250 |

Row 5 shows the reset rule: the negative quantity is not "averaged into" the new cost.

**Order is part of the rule.** The canonical order of a `(item, location)` movement log is **(`movement_date`, `sequence_no`)**, where `sequence_no` is the gap-free arrival counter allocated per item and location at write time (Part 21 §21.3.6). Every figure derived from the log uses that order: the incremental update, `manage.py recalc_stock`, each row's `avg_cost_after` / `on_hand_after`, and `INV-08`'s `as_of` valuation.

**Backdating and recomputation.** A movement whose `movement_date` is on or after the item's latest movement date is a *tail insert*: the incremental step is the replay's last step, so the cache and the replay agree by construction. A movement dated **earlier** — which `INV-06` FR-2 and `PUR-01` (the supplier bill that arrives a week after the goods) both allow — lands in the middle of the log and invalidates every later average. The writer therefore leaves that row's `avg_cost_after` / `on_hand_after` null, applies the quantity to `inventory_item_stock.on_hand` (quantity is order-independent), marks `cost_state = 'stale'`, and enqueues `inventory.recompute_item_cost` for that item and location, idempotent per watermark date so a week of late bills collapses into one replay. Voiding a document enqueues the same job for every item it touched. A backdated purchase therefore **does** change the average of every later movement — which is what the merchant expects and what `INV-08`'s historical valuation already assumes — and it is a bounded, visible event rather than a silent divergence between the cache and the replay.

While `cost_state = 'stale'`, valuation surfaces (`INV-08`, `RPT-06`) show the cached figure with the note "Average cost recalculating"; the nightly drift job (Part 20 §20.11.5) excludes stale rows from its comparison and reports any that have been stale for more than fifteen minutes.

**Negative-stock policy.** Tenant setting `inventory.allow_negative_stock` (boolean, default `false`). When `false`, any outbound posting that would take `on_hand` below 0 for a tracked item is rejected atomically with 409 `insufficient_stock` and `details.lines[]` = `[{ "index": 0, "item_id": "…", "item_name": "…", "requested": "8.000", "available": "5.000", "unit_code": "NOS" }]` for **every** offending line (the client highlights all of them at once). When `true`, the posting succeeds, `on_hand` goes negative, and the item shows the `out` badge with the negative quantity.

**Stock badge tones (`UbStatusBadge`).** Server field `stock_status`: `out` when `track_stock` and `on_hand ≤ 0` → tone `danger`, label "Out of stock" (with the signed quantity when < 0); `low` when `reorder_point IS NOT NULL` and `0 < on_hand ≤ reorder_point` → tone `warning`, label "Low"; otherwise `ok` → tone `success`, label "In stock". Untracked goods and services carry no badge; the on-hand cell shows "—" with `text-muted`.

**Quantity input rules.** `UbQuantityInput` receives `decimals = unit.allow_decimal ? 3 : 0` and the unit code as addon; when `allow_decimal=false` the server also rejects non-integers with `qty_must_be_whole`.

---

### INV-01 — Create/edit item

#### 1. Business Objective
Give every business a single master record per thing it sells or buys so that billing (SAL-02), purchases (PUR-01), stock (INV-03…08) and GST reporting (RPT-07) read from one source. Success measures: ≥ 80 % of tenants that enable `inventory` create ≥ 5 items in week 1; median time to create an item on mobile ≤ 45 s; < 2 % of item saves rejected server-side after client validation (parity between `itemSchema` and DRF serializer).

#### 2. User Personas
Owner (OW) — sets up catalogue, prices, tax. Staff (ST) — adds items while billing (create-inline from `UbAsyncCombobox`). Accountant (AC) — read-only view of HSN/tax codes.

#### 3. User Stories
1. US-INV-01-1 — As an owner I want to add an item with name, unit, price and GST rate in under a minute so that I can start billing today.
2. US-INV-01-2 — As an owner I want the SKU generated for me when I don't have one so that every item is still uniquely identifiable.
3. US-INV-01-3 — As staff I want to scan a barcode into the item form so that later scans at the counter find the item instantly.
4. US-INV-01-4 — As an owner I want to search the HSN/SAC code and have the GST slab pre-filled so that I don't have to remember rates.
5. US-INV-01-5 — As an owner I want to record opening stock and cost while creating the item so that valuation is correct from day one.
6. US-INV-01-6 — As an owner I want to edit prices and tax later without touching past invoices so that history stays intact.
7. US-INV-01-7 — As staff I want to create an item inline from the invoice/purchase editor so that billing is not interrupted.

#### 4. Functional Requirements
1. FR-1 The item form captures the fields in §7 and persists them to `inventory_item` via `POST /items` (create) or `PATCH /items/{id}` (edit).
2. FR-2 When `sku` is blank on create, the server assigns one with the auto-SKU algorithm (BR-2) and returns it; the client shows the suggested value as an input placeholder computed by the same rule in `view-model/skuSuggest.ts`.
3. FR-3 `item_type = service` forces `track_stock = false`, hides Barcode, Reorder point, Opening stock, MRP and labels the code field "SAC".
4. FR-4 HSN/SAC field is a `UbAsyncCombobox` backed by `GET /taxes/hsn?q=` (≤ 20 results, `code — description`); free typing of a code not in the master is allowed.
5. FR-5 Selecting an HSN row sets `tax_code = tax_hsn.default_tax_code` unless the user has already changed `tax_code` in this session (dirty flag); a hint "Rate set from HSN 1006" appears under the tax field.
6. FR-6 Tax code options come from `GET /taxes/rates?as_of=<today>` filtered to `is_active` and effective on today; a legacy code already on the item (e.g. `GST12`) stays selectable with the hint "Rate ended 21/09/2025 — update recommended".
7. FR-7 Opening stock (`qty`, `unit_cost`, `as_of`) is accepted only on create when `track_stock=true`; it posts an `opening` movement (INV-05) in the same transaction as the item row.
8. FR-8 On edit, `track_stock` false→true requires an `opening_stock` object in the same PATCH (409 `opening_stock_required` otherwise); true→false is allowed only when `on_hand = 0` (409 `stock_nonzero`).
9. FR-9 Category and Unit pickers offer "+ Create '<typed text>'" which posts to `/categories` or `/units` and selects the new row without leaving the form (INV-04).
10. FR-10 Image upload accepts jpeg/png/webp ≤ 2 MB; client downsizes to ≤ 1200 px longest side before upload; server stores via Pillow at 800 px and 160 px thumbnail as `files_attachment.kind = item_image`.
11. FR-11 Barcode field accepts a USB/Bluetooth HID scanner: the scanner types the code and sends Enter; Enter inside the barcode field does **not** submit the form, it blurs the field and triggers the duplicate check `GET /items/lookup?barcode=`; a hit shows "Already used by <item name>" inline.
12. FR-12 Saving from the inline-create dialog returns the created item to the calling editor line and pre-fills qty 1.
13. FR-13 Every save writes an `AuditLog` (`item.created` / `item.updated` with changed fields).
14. FR-14 `selling_price` may be flagged `tax_inclusive_selling`; the form shows the derived exclusive/inclusive counterpart as a hint using the selected rate.

#### 5. Non-Functional Requirements
- P95 form open (edit) ≤ 400 ms on 4G (single `GET /items/{id}`); save ≤ 600 ms.
- HSN search debounced 300 ms; results ≤ 200 ms server-side (trigram index).
- Works at 320 px width; all controls ≥ 44 px tall on mobile; keyboard order Name → Type → Unit → Price → Tax → Save.
- Copy in `en.json`/`hi.json` under `items.form.*`; Hindi labels: Item = "आइटम", Selling price = "बिक्री मूल्य", Purchase price = "खरीद मूल्य", Stock = "स्टॉक".
- Offline: unsaved form values persist in `sessionStorage` key `ub.itemForm.draft` until saved or discarded.

#### 6. User Flow
Primary (create, mobile): Items tab → FAB "+" → full-screen form → type Name → choose Goods/Service (segmented) → Unit (default `NOS`, or tenant default from `PLT-06`) → Selling price → (optional) GST rate → Save → snackbar "Item saved · BASMATI-RICE-001" → returns to list with new row highlighted.
Alternate A (with stock): expand "Stock" section → toggle Track stock on → Opening qty, cost, date → Save → item detail shows on-hand.
Alternate B (inline from editor): in `UbLineItemsEditor` search returns no match → "Create '<text>'" → `UbDialog` with compact form (Name, Type, Unit, Price, Tax) → Save → line filled.
Alternate C (edit): Item detail → Edit → form pre-filled; SKU editable; barcode editable; Save with `version` → on 409 `stale_version` show banner "Changed elsewhere — reload".
Alternate D (scanner): focus Barcode → scan → Enter → lookup → "Available" tick or "Already used".

#### 7. UI Requirements
Screens: `app/items/new/page.tsx`, `app/items/[id]/edit/page.tsx` (Suspense wrapper → `<ItemFormPageContent/>`), and `ItemQuickCreateDialog` used by editors. Components: `UbPageShell`, `UbPageHeader` (title "New item"/"Edit item", back), `UbForm` + `UbField`, `MLToggleGroup` (Goods/Service), `UbCombobox` (Category, Unit — create-inline), `UbAsyncCombobox` (HSN/SAC), `MLSelect` (Tax rate), `UbMoneyInput` ×3, `UbQuantityInput` ×2, `UbDateInput`, `MLSwitch` ×2, `UbFileUpload` + `UbImagePreview`, `MLTextarea`, `UbInputHint`, `UbFieldError`.

| Field | Column | Input | Required | Mobile position |
|---|---|---|---|---|
| Name | `name` | `MLInput` text, maxLength 160, autofocus | yes | Section "Basics" |
| Type | `item_type` | `MLToggleGroup` Goods / Service | yes (default goods) | Basics |
| Category | `category_id` | `UbCombobox` create-inline | no | Basics |
| Unit | `unit_id` | `UbCombobox` create-inline, shows `code — name` | yes | Basics |
| SKU | `sku` | `MLInput`, placeholder = suggested auto-SKU, `ds-mono` | no | Section "Identifiers" |
| Barcode | `barcode` | `MLInput` inputmode numeric, scanner-aware (FR-11) | no | Identifiers |
| HSN / SAC | `hsn_sac` | `UbAsyncCombobox` | no | Section "Tax" |
| GST rate | `tax_code` | `MLSelect` | yes (default `GST0`) | Tax |
| Price includes GST | `tax_inclusive_selling` | `MLSwitch` | no | Tax |
| Selling price | `selling_price` | `UbMoneyInput` ₹ | yes (default 0) | Section "Pricing" |
| Purchase price | `purchase_price` | `UbMoneyInput` ₹ | no (default 0) | Pricing |
| MRP | `mrp` | `UbMoneyInput` ₹ | no | Pricing (goods only) |
| Track stock | `track_stock` | `MLSwitch` | goods default on | Section "Stock" |
| Reorder point | `reorder_point` | `UbQuantityInput` (unit addon) | no | Stock |
| Opening qty / cost / date | `opening_stock.*` | `UbQuantityInput`, `UbMoneyInput` (4 dp), `UbDateInput` (default today) | no (create only) | Stock |
| Image | `image_attachment_id` | `UbFileUpload` | no | Section "More" |
| Description | `description` | `MLTextarea` 3 rows, maxLength 2000 | no | More |

Mobile (< 640 px): single column, sections as collapsible groups (Basics, Pricing, Tax open; Identifiers, Stock, More collapsed with summary line), sticky bottom bar with primary "Save" and ghost "Cancel"; Type toggle full width. Desktop (≥ 1024 px): two-column grid inside `max-w-3xl` card — left column Basics + Pricing, right column Tax + Stock + Identifiers; image dropzone top-right 160 px square; primary action in page header and duplicated at form end; `Ctrl/Cmd+S` saves. Quick-create dialog: 5 fields, `max-h-[70vh]`.

#### 8. UX Requirements
- Sentence case labels; ₹ addon left, unit addon right; tabular numerals (`ds-num`).
- Default unit = tenant default (`PLT-06`) else `NOS`; default tax `GST0`; default type by `business_type` (services → `service`).
- Save success toast: "Item saved · {sku}" with action "Add another"; inline create toast suppressed (line fill is the confirmation).
- Destructive: none in this form. Leaving with unsaved changes → `UbConfirmDialog` "Discard changes?".
- Hindi keys: `items.form.title.new` = "नया आइटम", `items.form.save` = "सहेजें".
- Warnings (non-blocking) render as `UbInputHint` tone `warning`: barcode checksum mismatch, unknown HSN, legacy tax code.

#### 9. States
| State | What the user sees |
|---|---|
| Initial (create) | Empty form, defaults applied, SKU placeholder "Auto" |
| Loading (edit) | `UbSkeleton` form preset (8 rows) |
| Empty | n/a |
| Success | Toast + navigation to detail (create) or back (edit) |
| Error (validation) | Field errors under inputs; first error scrolled into view |
| Error (network/5xx) | `UbStatusBanner` "Couldn't save. Retry" with request id; form values retained |
| Disabled | Save disabled while submitting (`MLSpinner` + "Saving…"); `track_stock` switch disabled with tooltip when `on_hand ≠ 0` |
| Partial | Image uploaded but save failed → image kept in form, re-used on retry |
| Processing | Image compression progress bar under dropzone |
| Completed | Detail page with "Just created" highlight for 3 s |
| Failed | 409 `stale_version` banner with "Reload" |

#### 10. Validation Rules
Client (`itemSchema`) and server (DRF `ItemSerializer`) enforce identical rules; server messages localized; codes appear in `details.<field>`.

| Field | Rule | Message | Code |
|---|---|---|---|
| name | required, trimmed 1–160 | "Enter an item name" | `required` / `max_length` |
| item_type | ∈ goods, service | "Choose Goods or Service" | `invalid_choice` |
| sku | optional; 1–48; `^[A-Za-z0-9._/-]+$`; unique per tenant among non-deleted | "SKU already used by {item}" | `duplicate_sku` |
| barcode | optional; 4–48; `^[A-Za-z0-9-]+$`; unique | "Barcode already used by {item}" | `duplicate_barcode` |
| barcode (warning) | 12/13 digits and EAN/UPC check digit fails | "Check digit doesn't match — scanned correctly?" | `barcode_checksum` (warnings[]) |
| unit_id | required; exists, active | "Choose a unit" | `required` / `not_found` |
| category_id | exists, active | "Category not found" | `not_found` |
| hsn_sac (goods) | `^\d{4}(\d{2}(\d{2})?)?$` | "HSN must be 4, 6 or 8 digits" | `invalid_hsn` |
| hsn_sac (service) | `^99\d{2}(\d{2})?$` | "SAC must start with 99 and be 4 or 6 digits" | `invalid_sac` |
| hsn_sac (warning) | not in `tax_hsn` | "Code not in HSN master — double-check" | `hsn_unknown` (warnings[]) |
| tax_code | exists in `tax_rate`; active on today or already on item | "Select a GST rate" | `invalid_tax_code` |
| selling_price, purchase_price | ≥ 0, ≤ 999999999999.99, 2 dp | "Enter a valid amount" | `invalid_amount` |
| mrp | ≥ 0; goods only | "MRP applies to goods only" | `mrp_not_allowed` |
| selling_price vs mrp | `selling_price ≤ mrp` when mrp set and not tax-inclusive mismatch (compare tax-inclusive values) | "Selling price cannot exceed MRP" | `selling_price_above_mrp` |
| track_stock | must be false for services | "Services cannot track stock" | `track_stock_not_allowed` |
| reorder_point | ≥ 0; decimals per unit; only when track_stock | "Reorder point must be a whole number for NOS" | `qty_must_be_whole` |
| opening_stock.qty | > 0; decimals per unit | "Enter opening quantity" | `invalid_qty` |
| opening_stock.unit_cost | ≥ 0; 4 dp; required when qty > 0 (defaults to purchase_price) | "Enter cost per unit" | `required` |
| opening_stock.as_of | ≤ today | "Date cannot be in the future" | `future_date` |
| description | ≤ 2000 | | `max_length` |
| version (PATCH) | equals current | "Item changed elsewhere" | `stale_version` (409) |

#### 11. Business Rules
1. BR-1 Uniqueness of `sku` and `barcode` is per tenant and excludes soft-deleted rows (§21.3.6 partial indexes); archived items still hold their codes.
2. BR-2 **Auto-SKU algorithm** (`generate_sku(tenant, name)`): (a) NFKD-normalise, uppercase, replace every run of characters outside `[A-Z0-9]` with `-`, trim `-`; (b) truncate to 12 characters and trim trailing `-`; (c) if the result is empty (e.g. Devanagari-only name) use `ITEM`; (d) find the highest numeric suffix among tenant SKUs matching `^<prefix>-(\d{3,})$` and use `max + 1` (or 1), zero-padded to 3 digits (4+ digits once ≥ 1000); (e) insert; on unique-violation retry from (d) up to 3 times; then 409 `sku_generation_failed`. Example: "Basmati Rice 5kg" → `BASMATI-RICE-001`; second → `BASMATI-RICE-002`; "चीनी" → `ITEM-001`.
3. BR-3 `item_type = service` ⇒ `track_stock = false`, `mrp = NULL`, `barcode` allowed but hidden by default.
4. BR-4 `tax_code` default is `GST0`; when set from HSN master it is `tax_hsn.default_tax_code`. Rates are never stored on the item; documents resolve `(tax_code, document_date)` via `tax_rate` (§21.3.5).
5. BR-5 Editing `selling_price`, `purchase_price`, `tax_code`, `hsn_sac`, `name` never alters issued documents (they hold snapshots) — only future lines default from the new values.
6. BR-6 `purchase_price` is a reference "last known cost"; PUR-01 overwrites it with the latest recorded inbound unit cost (BR-7 of PUR-01). It is not the valuation cost (`avg_cost` is).
7. BR-7 Opening stock on create posts exactly one `opening` movement with `unit_cost = opening_stock.unit_cost`, `movement_date = as_of`, `source_type = 'item'`, `source_id = item.id`, and initialises `inventory_item_stock` for location `MAIN`.
8. BR-8 An item's `unit_id` cannot be changed once any movement or document line references the item (409 `unit_locked`); category, prices, tax may change freely.
9. BR-9 `tax_inclusive_selling = true` means `selling_price` is the price the customer pays; documents derive the exclusive `unit_price = selling_price / (1 + rate/100)` at 4 dp using the rate on the document date.
10. BR-10 Enforcement of `inventory.enabled` module toggle: when disabled, `/items` remains available for services and untracked goods; stock fields are hidden and `track_stock` forced `false`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Open form / create | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Edit | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Opening stock on create | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Enable track_stock later (opening stock on PATCH) | `inventory.stock.adjust` | ✅ | ✅ | override only | ❌ |
| Create category/unit inline | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| View | `inventory.item.read` | ✅ | ✅ | ✅ | ✅ |
Without `write` the Save button is hidden and the API returns 403 `permission_denied`.

#### 13. Edge Cases
1. EC-1 Two staff create "Sugar" simultaneously without SKU → both get distinct SKUs (`SUGAR-001`, `SUGAR-002`) through BR-2 retry.
2. EC-2 Name contains only emoji/Devanagari → prefix `ITEM`.
3. EC-3 Barcode scanned into the Name field by mistake → Name shows digits; hint "Looks like a barcode — move to Barcode?" with one-tap move.
4. EC-4 Tenant is `unregistered`: tax fields still shown (purchases carry GST) but hint "You can't charge GST on sales".
5. EC-5 `tax_code = GST12` on an item after 22/09/2025: shows legacy hint; new invoice lines block with `tax_rate_inactive` (SAL-02) — item edit is the fix.
6. EC-6 Opening stock date before tenant FY start → allowed; report as-of filters handle it.
7. EC-7 Image upload succeeds but item POST fails → attachment orphaned with `owner_id NULL`; GC job deletes after 30 days (§21.5).
8. EC-8 PATCH toggles `track_stock` off while on_hand = 0 but movements exist → allowed; movement history retained.
9. EC-9 Changing `unit_id` when locked → 409 `unit_locked` with hint to create a new item.
10. EC-10 `selling_price` set with `tax_inclusive_selling` and `GST0` → inclusive = exclusive; no hint shown.
11. EC-11 Duplicate-name items → allowed (SKU differentiates); list shows SKU under name.

#### 14. API Requirements
- `POST /items` — body: all §7 columns (snake_case) + `opening_stock: { qty, unit_cost, as_of, location_id? }`; `Idempotency-Key` optional. 201 `{ data: item }` with `sku` filled, `stock[]`, `warnings[]`. Errors: 400 `validation_error` (details per §10), 403, 409 `sku_generation_failed`.
- `PATCH /items/{id}` — partial; requires `version`; 409 `stale_version`, `stock_nonzero`, `opening_stock_required`, `unit_locked`.
- `GET /items/{id}` — for edit pre-fill (includes `version`, `image_url`, `unit`, `category`).
- `GET /items/lookup?barcode=` — 200 item or 404 `not_found` (used for duplicate check).
- `GET /taxes/hsn?q=` — `{ data: [ { code, description, default_tax_code, is_service } ] }`.
- `GET /taxes/rates?as_of=` — `{ data: [ { code, name, rate, cess_rate, effective_from, effective_to } ] }` (client caches for the session).
- `POST /categories`, `POST /units` (INV-04).
- Response deltas vs §22.6: item object includes `version`, `image_url`, `thumbnail_url`, `unit: { id, code, name, allow_decimal }`, `category: { id, name }`.

#### 15. Database Impact
Writes: `inventory_item` (all columns §21.3.6), `inventory_item_stock` (create row for `MAIN` when `track_stock`), `inventory_stock_movement` (`opening`), `files_attachment` (`item_image`), `platform_audit_log`. Reads: `inventory_unit`, `inventory_category`, `tax_rate`, `tax_hsn`, `inventory_location` (default). Indexes used: `U(tenant_id, sku)`, `U(tenant_id, barcode)`, trigram on `tax_hsn.description`. No new indexes.

#### 16. Audit Requirements
`item.created` (after snapshot of all fields), `item.updated` (before/after of changed fields only), `stock.opening_posted` (movement row) — actor, request_id, ip in `metadata`.

#### 17. Notifications
None. (Low-stock evaluation runs on movement posting — INV-07 — and an opening stock at or below `reorder_point` does trigger it.)

#### 18. Analytics / Event Tracking
`ub.inventory.item_created { item_type, has_sku_manual, has_barcode, has_hsn, tax_code, track_stock, has_opening_stock, source: form|inline|import }`, `ub.inventory.item_updated { changed_fields[] }`, `ub.inventory.hsn_searched { q_len, results }`, `ub.inventory.item_form_abandoned { filled_fields }`. Emitted via `src/utils/analytics.ts` (console sink at MVP; no SDK).

#### 19. Security
Tenant-scoped manager on every query; cross-tenant `category_id`/`unit_id` → 404. Image: content-type sniffed by Pillow, EXIF stripped, max 2 MB, filename randomised (`storage_key`). Strings trimmed; `description` rendered as plain text. Rate limit general 600 req/min. No PII in items.

#### 20. Performance
Single round trip per save; HSN search uses trigram GIN; tax rates fetched once per session and stored in `inventoryMastersSlice`. Image processing synchronous (≤ 300 ms for 2 MB). Item creation ≤ 5 SQL statements (insert item, insert stock, insert movement, insert audit, sequence none).

#### 21. Testing
- T-INV-01-1 unit: `generate_sku` cases (Latin, mixed, Devanagari, truncation to 12, suffix rollover 999→1000).
- T-INV-01-2 unit: HSN/SAC regex for goods and services; SAC `9983`, `998313` valid; `1234` invalid for service.
- T-INV-01-3 unit: `apply_weighted_average` for opening on empty stock.
- T-INV-01-4 API: create with opening stock → item, stock row, movement, audit rows; totals equal.
- T-INV-01-5 API: duplicate sku/barcode → 400 with `duplicate_sku`/`duplicate_barcode`.
- T-INV-01-6 API: PATCH track_stock true→false with on_hand ≠ 0 → 409 `stock_nonzero`.
- T-INV-01-7 API: PATCH stale version → 409.
- T-INV-01-8 API: service with track_stock true → 400 `track_stock_not_allowed`.
- T-INV-01-9 permission: accountant POST → 403; cross-tenant unit_id → 404.
- T-INV-01-10 component: `ItemForm` hides stock section for service; Enter in barcode does not submit; HSN select fills tax code unless dirty.
- T-INV-01-11 component: `itemSchema` parity table-driven against server fixtures.
- T-INV-01-12 E2E: create via FAB on 360 px viewport, verify list row and detail on-hand.
- T-INV-01-13 E2E: inline create from invoice editor fills line.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given an owner on Items, when they enter name "Sugar", unit KGS, price 42 and save, then the item appears in the list with SKU `SUGAR-001` and `GST0` within one screen transition.
- AC-2 (US-2) Given SKU left blank, when saved, then the response `sku` matches `^SUGAR-\d{3,}$` and is unique in the tenant.
- AC-3 (US-3) Given focus in Barcode, when a scanner types `8901234567890⏎`, then the form is not submitted and the field shows "Available" or "Already used by …".
- AC-4 (US-4) Given HSN search "rice", when the user picks `1006 — Rice`, then `tax_code` becomes the master's default and the hint names the HSN.
- AC-5 (US-5) Given Track stock on with qty 10, cost 40, when saved, then `GET /items/{id}` shows `stock[0].on_hand = "10.000"`, `avg_cost = "40.0000"`, and one `opening` movement exists.
- AC-6 (US-6) Given an item used in an issued invoice, when its price is changed, then the invoice line `unit_price` is unchanged.
- AC-7 (US-7) Given the invoice editor with no match for "Chai Patti", when staff creates it inline, then the line is filled with qty 1 and the editor keeps focus on quantity.

#### 23. Dependencies
INV-04 (categories/units), INV-05 (opening movement), `tax_rate`/`tax_hsn` seeds (`seed_tax_rates`, `seed_hsn`), PLT-06 defaults (unit, tax), files app (ADR-013), `UbAsyncCombobox`, `UbMoneyInput`, `UbQuantityInput`.

#### 24. Future Enhancements
INV-10 camera barcode capture into this field; INV-12 variants ("Contains variants" toggle); INV-13 price lists tab; INV-14 secondary unit fields; INV-16 batches; P2 alias names and preferred supplier; bulk GST-slab revision tool (research §A.1) via IMP-03.

---

### INV-02 — Item list & search

#### 1. Business Objective
Let a shopkeeper find any item in ≤ 2 s by name, SKU or scanned barcode and see stock health at a glance, so the item list doubles as the stock register. Measures: P95 search round-trip ≤ 300 ms; scanner lookup → item open ≤ 500 ms; low-stock filter used weekly by ≥ 30 % of stock-tracking tenants.

#### 2. User Personas
Owner (OW) — reviews prices and stock; Staff (ST) — finds items at the counter; Accountant (AC) — exports item master.

#### 3. User Stories
1. US-INV-02-1 — As staff I want to type part of a name or SKU and see matches instantly so I can open the right item.
2. US-INV-02-2 — As staff I want to scan a barcode anywhere on the list so the item opens without typing.
3. US-INV-02-3 — As an owner I want to filter low-stock and out-of-stock items so I know what to reorder.
4. US-INV-02-4 — As an owner I want to filter by category and type so I can review one shelf at a time.
5. US-INV-02-5 — As an owner I want to see total items and stock value for the filtered set.
6. US-INV-02-6 — As an owner I want archived items hidden by default but reachable.
7. US-INV-02-7 — As an accountant I want to export the filtered list to CSV (IMP-02).

#### 4. Functional Requirements
1. FR-1 `GET /items` drives a `UbDataGrid` with server pagination (`page`, `page_size` 25 default, 100 max), sorting whitelist `name`, `-updated_at`, `on_hand`, `-on_hand`, `selling_price`.
2. FR-2 Search `q` (debounced 300 ms) matches trigram on `name` and exact/prefix on `sku` and `barcode`; the server returns `match_field` so the row can highlight where it matched.
3. FR-3 Filters: Type (goods/service), Category (`UbCombobox`), Stock (`in`/`low`/`out`), Status (`active`/`archived`; default `active`). Only `tab` (Stock) and `q` persist in the URL; page resets to 1 on filter change.
4. FR-4 Stock tabs via `UbTabs`: All · In stock · Low · Out, with counts from `meta.counts` (see §14).
5. FR-5 Header totals (`meta.totals`): items count and stock value (Σ `on_hand × avg_cost`) for the filtered set.
6. FR-6 **Scanner behaviour**: a global `useScannerListener` hook on the list page captures HID keyboard bursts (≥ 4 characters typed in ≤ 50 ms per key, terminated by Enter) when focus is not inside a text input, calls `GET /items/lookup?barcode=`, and on 200 navigates to the item (or, in "add-to-bill" context, adds the line); on 404 shows toast "No item with barcode {code}" with action "Create item" (pre-filling barcode).
7. FR-7 Typing the barcode into `UbSearchInput` followed by Enter also calls `/items/lookup` first; if a single exact match exists the item opens, else the normal search results show.
8. FR-8 Row primary action opens the item detail (INV-03); row menu: Edit, Adjust stock (if `inventory.stock.adjust`), Archive/Restore (if `inventory.item.delete`), Copy SKU.
9. FR-9 Bulk selection (desktop): Archive, Export CSV; archive runs sequential `POST /items/{id}/archive` and reports per-row failures (`stock_nonzero`).
10. FR-10 Column visibility persisted in `localStorage` (`ub.itemList.columns`); density toggle.
11. FR-11 Mobile card layout: thumbnail (or initials), name, SKU (`ds-mono`), selling price right-aligned, stock badge + quantity, category chip.
12. FR-12 Empty states: first-use (no items) with CTA "Add item" and "Import CSV" (INV-09); filtered-empty with "Clear filters"; error with retry + request id.

#### 5. Non-Functional Requirements
List P95 ≤ 300 ms for 10k items; skeleton rows (8) while loading; keyboard: `/` focuses search, `↑/↓` moves rows, `Enter` opens; a11y: badges carry text labels; virtualisation not needed at 100 rows/page.

#### 6. User Flow
Primary: Items tab → list (tab All) → type "bas" → results → tap row → detail.
Alternate A (scan): list focused, scan `8901…⏎` → item opens.
Alternate B (low stock): tap tab "Low" → filtered list sorted by `on_hand` asc → row menu "Adjust stock" → INV-06 drawer.
Alternate C (archived): filter Status → Archived → row menu Restore.
Alternate D (export): toolbar ⋯ → Export CSV → IMP-02 flow.

#### 7. UI Requirements
Route `app/items/page.tsx` → `<ItemListPageContent/>`. Components: `UbPageHeader` (title "Items", count, primary "Add item", secondary "Import"), `UbTabs`, `UbDataGrid` toolbar (`UbSearchInput`, filter `UbCombobox` Category, `MLSelect` Type, `MLSelect` Status, `UbFilterTag` chips), `UbStatCard` ×2 (Items, Stock value) above the grid on desktop / inline strip on mobile, `UbStatusBadge`, `UbAmount`, `UbEmptyState`, `UbFab` (mobile "+").

Desktop columns (≥ 1024 px): Item (thumb 32 px + name + SKU) · Category · Unit · Selling price (right) · Purchase price (right, hidden for staff without `reports.financial.read`? — no: purchase price visible to all with `inventory.item.read`) · GST · On hand (badge + qty, right) · Updated · ⋯. Mobile: cards per FR-11, tabs scroll horizontally, filters in a bottom-sheet `UbDrawer` opened by a "Filter" button with active-count badge.

Redux: `itemListSlice` (`rows`, `meta`, `filters`, `status: idle|loading|succeeded|failed`, `selectedIds`), thunks `fetchItemList`, `archiveItem`, `restoreItem`, `lookupItemByBarcode`; selectors `selectItemListRows`, `selectItemListTotals`.

#### 8. UX Requirements
- Badge labels always textual ("In stock", "Low", "Out of stock"); negative on hand shown as "−3 NOS" in danger tone.
- Search placeholder "Search name, SKU or scan barcode"; Hindi `items.list.searchPlaceholder` = "नाम, SKU खोजें या बारकोड स्कैन करें".
- Archive requires `UbReasonDialog`? No — archive is reversible and non-financial: `UbConfirmDialog` with consequence text "Hidden from billing. Stock must be 0."
- Sorting default `name` asc; Low tab default `on_hand` asc.

#### 9. States
Initial → skeleton; Loading (filter change) → skeleton rows keep header; Empty first-use → illustration + CTAs; Empty filtered → "No items match" + Clear filters; Success → rows + totals; Error → `UbEmptyState` error variant; Disabled → bulk actions disabled with 0 selection; Partial → bulk archive result banner "3 archived, 1 skipped (stock not zero)"; Processing → scanner lookup shows inline spinner in search; Completed/Failed → toast.

#### 10. Validation Rules
`q` ≤ 80 chars (client truncates); `page_size` ≤ 100 (server clamps); invalid `ordering` → 400 `validation_error` (`details.ordering`); `barcode` param for lookup 4–48 chars.

#### 11. Business Rules
1. BR-1 `stock_status` computed server-side per §17.6.0; `stock=in` maps to `ok`.
2. BR-2 Default list excludes `archived`; archived rows render at 60 % opacity with badge "Archived" (neutral tone).
3. BR-3 Stock value total uses `inventory_item_stock` caches; never recomputed from movements on list requests.
4. BR-4 Barcode lookup is exact match on `barcode`, then exact on `sku` (fallback), excluding archived items unless `include_archived=true`.
5. BR-5 Scanner burst detection thresholds: ≥ 4 chars, inter-key ≤ 50 ms, terminator Enter or Tab; configurable constants in `constants/scanner.ts`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View list, search, lookup | `inventory.item.read` | ✅ | ✅ | ✅ | ✅ |
| Archive / restore | `inventory.item.delete` | ✅ | ✅ | ❌ | ❌ |
| Adjust stock (row action) | `inventory.stock.adjust` | ✅ | ✅ | override | ❌ |
| Export CSV | `reports.export` | ✅ | ✅ | ❌ | ✅ |

#### 13. Edge Cases
1. EC-1 Scanner sends code while focus is in the search box → treated as typed search + Enter (FR-7), same outcome.
2. EC-2 Barcode belongs to an archived item → 404 on lookup; toast offers "Show archived".
3. EC-3 Two items share name → both listed; SKU disambiguates.
4. EC-4 `reorder_point` null → never `low`.
5. EC-5 Very long names → 2-line clamp with title tooltip.
6. EC-6 Stock filter used with Type=service → empty filtered state with hint "Services don't track stock".
7. EC-7 Pagination beyond last page after archive → server clamps to last page.
8. EC-8 Scanner burst contains lowercase/uppercase mismatch → lookup is case-sensitive on stored value; barcodes are stored as scanned (no case folding) — hint in INV-01.

#### 14. API Requirements
`GET /items?q&type&category_id&stock=low|out|in&status&ordering&page&page_size&fields`. Response `data[]` per §22.6 plus deltas: `track_stock`, `category: {id, name}`, `match_field: name|sku|barcode|null`, `thumbnail_url`; `meta: { page, page_size, total, total_pages, totals: { items, stock_value }, counts: { all, in, low, out } }` (`counts` is a delta: computed over the filtered set ignoring the `stock` param). `GET /items/lookup?barcode=&include_archived=false` → 200 item / 404. `POST /items/{id}/archive` → 200 / 409 `stock_nonzero`; `POST /items/{id}/restore` → 200.

#### 15. Database Impact
Reads `inventory_item` joined `inventory_item_stock` (location `MAIN`), `inventory_category`, `inventory_unit`; indexes `IX(tenant_id, status, name)`, trigram(name), `IX(tenant_id, barcode)`, `U(tenant_id, sku)`. Counts query uses the same filtered CTE with `FILTER (WHERE …)` aggregates.

#### 16. Audit Requirements
`item.archived`, `item.restored` (status before/after). Reads not audited.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.inventory.list_viewed { tab, filters_count }`, `ub.inventory.item_searched { q_len, results, match_field }`, `ub.inventory.barcode_scanned { source: hid|typed, found }`, `ub.inventory.item_archived`, `ub.inventory.item_restored`.

#### 19. Security
Search param escaped for `ILIKE`; `ordering` whitelisted; lookup rate-limited by the general limit; archived items excluded from pickers to prevent accidental billing.

#### 20. Performance
Two queries per page (rows + counts/totals); `select_related(unit, category)`; `stock_value` from cache columns; responses ≤ 30 KB per page; thumbnails 160 px.

#### 21. Testing
- T-INV-02-1 API: search by partial name, exact SKU, barcode → `match_field` correct.
- T-INV-02-2 API: `stock=low` returns only `0 < on_hand ≤ reorder_point`.
- T-INV-02-3 API: counts and totals reflect filters; `counts` ignore `stock` param.
- T-INV-02-4 API: archive with on_hand ≠ 0 → 409; with 0 → 200 and status archived.
- T-INV-02-5 API: lookup archived → 404 unless `include_archived`.
- T-INV-02-6 unit: `useScannerListener` burst detection (fast keys + Enter → callback; slow typing → ignored).
- T-INV-02-7 component: mobile card renders badge text; tabs update URL `tab`.
- T-INV-02-8 E2E: scan on list opens detail; 404 offers create with barcode prefilled.
- T-INV-02-9 permission: staff sees no Archive action; accountant sees Export.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given 500 items, when staff types "bas", then matching rows appear within 300 ms with the matched text highlighted.
- AC-2 (US-2) Given the list open, when a HID scanner sends `8901234567890⏎`, then the matching item detail opens without a search-results step.
- AC-3 (US-3) Given items with reorder points, when the Low tab is selected, then only items with `0 < on_hand ≤ reorder_point` appear, sorted by on-hand ascending.
- AC-4 (US-4) Given filters Category=Grocery and Type=Goods, when applied, then the URL contains only `tab` and `q`, and page resets to 1.
- AC-5 (US-5) Given a filtered set, when totals render, then Stock value equals Σ `on_hand × avg_cost` of the rows across all pages.
- AC-6 (US-6) Given an archived item, when Status=Archived is chosen, then it appears dimmed with Restore available to owner/admin.
- AC-7 (US-7) Given accountant on the list, when Export CSV is chosen, then the IMP-02 export uses the current filters.

#### 23. Dependencies
INV-01, INV-03, INV-06, IMP-02, `UbDataGrid`, `UbTabs`, `useScannerListener` (shared hook in `src/hooks/`).

#### 24. Future Enhancements
INV-10 camera scan button in search; INV-11 per-location column; INV-13 price list column; P2 `UbCommandPalette` global search; saved views (research §A.39).

---

### INV-03 — Item detail & movement history

#### 1. Business Objective
Answer "how much do I have, what is it worth, and where did it go?" for one item in a single screen so owners trust the stock register enough to stop keeping a paper stock book. Measure: ≥ 50 % of stock-tracking tenants open a movement history weekly; zero discrepancies between displayed on-hand and Σ movements (asserted by `recalc_stock` in CI).

#### 2. User Personas
Owner (OW), Staff (ST) — check availability and history; Accountant (AC) — verify valuation.

#### 3. User Stories
1. US-INV-03-1 — As an owner I want to see on-hand, average cost and stock value for an item so I know what it is worth.
2. US-INV-03-2 — As staff I want to see the item's prices and tax so I can quote a customer.
3. US-INV-03-3 — As an owner I want a ledger of every stock movement with the document that caused it so I can trace discrepancies.
4. US-INV-03-4 — As an owner I want quick actions (Edit, Adjust stock, Archive) from the detail.
5. US-INV-03-5 — As an accountant I want to filter movements by date and type and see running on-hand.

#### 4. Functional Requirements
1. FR-1 `GET /items/{id}` renders header (image, name, SKU, barcode, category, unit, status badge), pricing card (selling, purchase, MRP, tax code + current rate, HSN), stock card (on-hand with badge, avg cost, value = on_hand × avg_cost, reorder point), and `movements_recent[10]`.
2. FR-2 Tab "Movements" loads `GET /items/{id}/movements?cursor&limit=50&date_from&date_to&type=` with cursor pagination and infinite scroll; each row: date, type label, signed qty (`UbAmount`-style tone: inbound success, outbound destructive), unit cost, on-hand after, avg after, source link (document number or adjustment number), created by.
3. FR-3 Type filter multi-select over the movement codes (§17.6.0 table); date range `UbDateRangePicker` with FY presets.
4. FR-4 Source link deep-links: `purchase_document` → `/purchases/bills/{id}`, `sales_document` → `/sales/invoices/{id}` (or credit note), `stock_adjustment` → adjustment detail drawer, `item` (opening) → no link, `stock_transfer` (P2).
5. FR-5 Header actions: Edit (INV-01), Adjust stock (INV-06 drawer pre-filled with item), Archive/Restore (INV-02 rules), "Add to bill" (opens SAL-02 editor with line).
6. FR-6 Reversal rows show a "↩ Reversal of {number}" caption and the reversed row shows "Reversed" muted style; toggle "Show reversals" default on.
7. FR-7 Services and untracked goods hide the stock card and Movements tab; a muted note "Stock not tracked" appears with an "Enable tracking" action for owners.
8. FR-8 Mobile: header + stacked cards; Movements as `UbTimeline` grouped by date. Desktop: two-column (left: pricing + stock cards; right: movements table `UbDataGrid` compact).

#### 5. Non-Functional Requirements
Detail P95 ≤ 350 ms; movements page ≤ 250 ms for 50 rows (index `(tenant_id, item_id, location_id, movement_date, sequence_no)`); movement rows use `ds-num`; screen-reader labels "In 12 NOS", "Out 3 NOS".

#### 6. User Flow
Primary: list row → detail → scroll stock card → tab Movements → scroll history → tap a `PB/26-27/0007` link → purchase bill.
Alternate A: detail → Adjust stock → drawer → post → detail refreshes stock card and a new `adjust_out` row appears at top.
Alternate B: filter type `sale_out` + date range this month → see quantities sold.

#### 7. UI Requirements
Route `app/items/[id]/page.tsx` → `<ItemDetailPageContent/>`. Components: `UbPageHeader` (breadcrumb Items › {name}, actions), `MLCard` ×3 (`UbCard`), `UbStatusBadge`, `UbAmount`, `UbTabs` (Overview · Movements), `UbDataGrid` (compact), `UbTimeline` (mobile), `UbDateRangePicker`, `MLSelect` multi (types), `UbEmptyState`, `UbSkeleton`. Redux: `itemDetailSlice` (`item`, `movements`, `nextCursor`, `filters`), thunks `fetchItemDetail`, `fetchItemMovements` (appends when cursor present), `refreshItemStock`.

Movement row fields: `movement_date` (dd/mm/yyyy), `movement_type` label map in `constants/movementTypes.ts` (`purchase_in` → "Purchase", `sale_out` → "Sale", `adjust_out` → "Adjustment −", `reversal` → "Reversal", …), `qty` signed, `unit_cost`, `on_hand_after`, `avg_cost_after`, `source` `{ type, id, number }`, `reason` (adjustments), `created_by.name`.

#### 8. UX Requirements
Inbound green (`success`), outbound red (`error`) — consistent with "you got/you gave" semantics for goods; text label always present. Value hint "= 8 NOS × ₹46.63". Hindi: `items.detail.onHand` = "स्टॉक में", `items.detail.movements` = "स्टॉक हलचल".

#### 9. States
Loading → skeleton header + cards; Empty movements → "No movements yet" with CTA "Add opening stock" (if tracked and no rows); Success; Error → error empty state; Partial (movements page fails) → inline retry row; Processing (infinite scroll) → 3 skeleton rows at bottom; Disabled → Adjust hidden without permission.

#### 10. Validation Rules
`date_from ≤ date_to` (400 `validation_error`); `type` values must be in the movement enum; `limit ≤ 100`.

#### 11. Business Rules
1. BR-1 Displayed on-hand and avg cost come from `inventory_item_stock`; the movement tab's last row `on_hand_after` must equal it (test asserts).
2. BR-2 Stock value = `round_half_up(on_hand × avg_cost, 2)`; negative on-hand shows negative value.
3. BR-3 Movement history is immutable; no edit/delete affordances exist on rows.
4. BR-4 Movements are listed in the reverse of the canonical order — `movement_date DESC, sequence_no DESC` (§17.6.0) — so the displayed running figures read consistently; running figures are the cached `*_after` columns (no recomputation on read). A row whose `avg_cost_after` is null is awaiting `inventory.recompute_item_cost` and renders as "—" with the tooltip "Recalculating".

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View detail | `inventory.item.read` | ✅ | ✅ | ✅ | ✅ |
| View movements & valuation | `inventory.stock.read` | ✅ | ✅ | ✅ | ✅ |
| Edit | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Adjust | `inventory.stock.adjust` | ✅ | ✅ | override | ❌ |
| Archive | `inventory.item.delete` | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 Item with `allow_negative_stock` history → rows with negative `on_hand_after` shown in danger tone.
2. EC-2 Source document voided → both original and `reversal` rows visible; original gets "Reversed" caption.
3. EC-3 Movement from a P2 location other than MAIN → location chip shown (hidden while single-location).
4. EC-4 10k+ movements → cursor pagination; no total count displayed.
5. EC-5 Item archived → header badge "Archived", actions reduced to Restore.
6. EC-6 Deleted creator user → "Removed user".

#### 14. API Requirements
`GET /items/{id}` → item + `stock: [ { location: {id, code, name}, on_hand, avg_cost, value } ]` + `movements_recent[10]` + `version`. `GET /items/{id}/movements?cursor&limit=50&date_from&date_to&type=purchase_in,sale_out` → `{ data: movement[], meta: { next_cursor, has_more } }`; movement object: `{ id, movement_date, movement_type, qty, unit_cost, on_hand_after, avg_cost_after, reason, source: { type, id, number }, reverses_id, created_by: { id, name }, created_at }` (`source.number` is a resolved delta). Cross-tenant id → 404.

#### 15. Database Impact
Reads `inventory_item`, `inventory_item_stock`, `inventory_stock_movement` (index above), joins to `purchases_document.number`, `sales_document.number`, `inventory_stock_adjustment.number` for `source.number`. No writes.

#### 16. Audit Requirements
None (reads). Actions launched from here audit under their own features.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.inventory.item_detail_viewed { has_stock, on_hand_status }`, `ub.inventory.movements_viewed { types[], range_days, pages }`, `ub.inventory.movement_source_opened { source_type }`.

#### 19. Security
Tenant scoping; source links resolve only within tenant; no PII.

#### 20. Performance
Cursor = base64 of `(movement_date, sequence_no)` — the canonical order, which is unique per item and location and therefore a total order; keyset pagination; `select_related` on source numbers via a single `CASE`-joined query or two batched lookups (≤ 3 queries per page, asserted).

#### 21. Testing
- T-INV-03-1 API: detail stock equals last movement `on_hand_after`/`avg_cost_after`.
- T-INV-03-2 API: cursor pagination stable across inserts; `has_more` correct.
- T-INV-03-3 API: type and date filters; invalid range → 400.
- T-INV-03-4 API: `source.number` resolved for purchase, sale, adjustment; opening has null.
- T-INV-03-5 component: timeline groups by date; reversal caption; negative tone.
- T-INV-03-6 permission: accountant sees no Edit/Adjust; cross-tenant → 404.
- T-INV-03-7 E2E: post adjustment from detail → new row at top, card updated.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given item with 8 NOS at avg ₹46.6250, when detail opens, then stock card shows "8 NOS", "₹46.63 avg", "₹373.00 value".
- AC-2 (US-2) Given item `GST5` with HSN 1006, when detail opens, then pricing card shows "GST 5 % · HSN 1006".
- AC-3 (US-3) Given movements from a purchase and a sale, when Movements opens, then each row links to its document number and the newest is first.
- AC-4 (US-4) Given owner on detail, when "Adjust stock" is tapped, then the INV-06 drawer opens with the item preselected.
- AC-5 (US-5) Given filter `sale_out` for this month, when applied, then only sale rows appear and running on-hand values remain the cached values.

#### 23. Dependencies
INV-01, INV-02, INV-05, INV-06, PUR-01, SAL-02 (source links), `UbTimeline`, `UbDataGrid`.

#### 24. Future Enhancements
INV-11 per-location stock table; INV-12 variant tabs; INV-16 batch tab; RPT-09 velocity sparkline (`UbSparkline`) on the stock card.

---
### INV-04 — Categories & units masters

#### 1. Business Objective
Provide the two small masters items depend on — categories for grouping/reporting and units with GST UQC codes and decimal rules — seeded so a new tenant never has to set them up before creating an item. Measures: ≥ 95 % of items created use a seeded or inline-created unit without visiting settings; zero invoices rejected for missing UQC.

#### 2. User Personas
Owner (OW) — manages masters; Staff (ST) — creates inline; Accountant (AC) — reads UQC mapping for GSTR-1 HSN summary.

#### 3. User Stories
1. US-INV-04-1 — As an owner I want ready-made units (NOS, KGS, LTR…) so I can start immediately.
2. US-INV-04-2 — As an owner I want to add a colloquial unit like "Peti" and tell the app it means BOX so invoices print a valid UQC.
3. US-INV-04-3 — As an owner I want to decide whether a unit allows decimals so staff cannot bill 1.5 pieces.
4. US-INV-04-4 — As an owner I want categories with one level of sub-category so reports group sensibly.
5. US-INV-04-5 — As staff I want to create a category or unit from the item form without leaving it.

#### 4. Functional Requirements
1. FR-1 `seed_units` loads system units (`tenant_id NULL`, `is_system=true`) per §C.5: `NOS, PCS→NOS (alias name "Pieces"), KGS, GMS, LTR, MLT, MTR, CMS, SQM, SQF, BOX, BAG, BDL, DOZ, PAC, PRS, SET, TON, QTL, BTL, CAN, ROL` with `allow_decimal=true` for `KGS, GMS, LTR, MLT, MTR, CMS, SQM, SQF, TON, QTL` and `false` for the rest.
2. FR-2 `GET /units` returns system units plus tenant units; `POST /units` `{ code, name, allow_decimal }` creates a tenant unit (`U(tenant_id, code)`).
3. FR-3 Unit form warns when `code` is not in the UQC list: "Not a GST unit code — it will print as typed on invoices" (see Canon change request CCR-03 for a proper `uqc_code` mapping).
4. FR-4 `GET/POST /categories` with `{ name, parent_id }`; one level of nesting (BR-2); list returns a tree `[ { id, name, children: [...] , item_count } ]`.
5. FR-5 Inline create from `UbCombobox` posts the typed text as `name` (category) or `code`+`name` (unit; code defaulted to first 8 uppercase alphanumerics of the name, editable in a mini dialog).
6. FR-6 Masters settings page lists both masters with counts and lets owners create rows; rename/deactivate are **not** available at MVP because canon exposes only `GET/POST` (CCR-02 requests `PATCH/DELETE`); the UI states "Rename coming soon".
7. FR-7 Deleting/archiving a category or unit is blocked while items reference it (future endpoint; documented for CCR-02).
8. FR-8 Tenant default unit (`PLT-06` setting) is selectable from the unit list.

#### 5. Non-Functional Requirements
Both lists fetched once per session into `inventoryMastersSlice` (≤ 200 rows, < 20 KB); Hindi names for system units (`hi.json` `units.NOS` = "नग", `units.KGS` = "किलो", `units.LTR` = "लीटर", `units.BOX` = "पेटी", `units.DOZ` = "दर्जन"); a11y: combobox announces "create new".

#### 6. User Flow
Primary: Settings → Inventory masters → tab Units → "Add unit" → code `PETI`, name "Peti", decimals off → Save → warning about UQC → confirm.
Alternate: Item form → Category combobox → type "Snacks" → "+ Create 'Snacks'" → selected. Alternate: Category with parent → Settings → Categories → "Add sub-category" under Grocery.

#### 7. UI Requirements
Route `app/settings/inventory-masters/page.tsx` → `<InventoryMastersPageContent/>`; `UbTabs` (Categories · Units); `UbDataGrid` simple (no server pagination); `UbDialog` forms with `UbField`: Category — Name (`MLInput` ≤ 60), Parent (`MLSelect` top-level only); Unit — Code (`MLInput` uppercase, ≤ 8), Name (≤ 40), Allow decimals (`MLSwitch`), hint showing UQC status. Mobile: full-screen dialogs; list as cards. Desktop: table + right-side `UbDrawer` form. Redux: `inventoryMastersSlice` (`categories`, `units`, `status`), thunks `fetchCategories`, `fetchUnits`, `createCategory`, `createUnit`. Yup: `categorySchema`, `unitSchema`.

#### 8. UX Requirements
System units marked with a lock icon and "GST unit" chip; tenant units show "Custom". Decimal rule explained in hint: "Off: whole numbers only (e.g. 3 NOS). On: up to 3 decimals (e.g. 1.250 KGS)". Inline-create confirmation is the selection itself (no toast).

#### 9. States
Loading skeleton (5 rows); Empty categories → "No categories yet — items work without them"; Success; Error retry; Disabled (create button hidden without permission); Duplicate → field error.

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| unit.code | required, 1–8, `^[A-Z0-9]+$` (client uppercases), unique per tenant and not equal to a system code | "Unit code already exists" | `duplicate_code` |
| unit.name | required, ≤ 40 | "Enter a unit name" | `required` |
| unit.allow_decimal | boolean | | |
| category.name | required, ≤ 60, unique among siblings (`U(tenant_id, parent_id, name)`) | "Category already exists here" | `duplicate_name` |
| category.parent_id | must be top-level (parent's `parent_id IS NULL`) | "Only one level of sub-categories" | `nesting_too_deep` |

#### 11. Business Rules
1. BR-1 System units are immutable and shared; a tenant cannot create a unit whose code equals a system code.
2. BR-2 Category depth ≤ 2 (parent → child).
3. BR-3 `allow_decimal` is fixed once any item uses the unit (409 `unit_in_use` on a future PATCH); at MVP it is create-only anyway.
4. BR-4 Documents snapshot `unit_code` on lines (§21.3.7), so later master changes never alter printed documents.
5. BR-5 UQC codes accepted as "GST units" are exactly the seeded system codes; anything else prints as typed (warning) until CCR-03 lands.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Read | `inventory.item.read` | ✅ | ✅ | ✅ | ✅ |
| Create (settings or inline) | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |

#### 13. Edge Cases
1. EC-1 Two tenants create `PETI` → allowed (per-tenant uniqueness).
2. EC-2 Inline create with name equal to an existing category (case-insensitive) → server returns existing row instead of 400 (`created=false` in `meta`), avoiding duplicates from typos in casing.
3. EC-3 Unit code typed lowercase `peti` → client uppercases before POST.
4. EC-4 Category with children cannot become a child itself (blocked by BR-2 on future PATCH).
5. EC-5 Tenant default unit points to a tenant unit later deleted (P2) → falls back to `NOS`.

#### 14. API Requirements
`GET /categories` → tree with `item_count`; `POST /categories` `{ name, parent_id? }` → 201 (or 200 with existing row when case-insensitive match, `meta.created=false`). `GET /units` → `{ data: [ { id, code, name, allow_decimal, is_system } ] }`; `POST /units` `{ code, name, allow_decimal }` → 201; 400 `duplicate_code`. Both under `inventory.item.write`.

#### 15. Database Impact
`inventory_category` (name, parent_id, sort_order), `inventory_unit` (code, name, allow_decimal, is_system). Reads item counts via `inventory_item.category_id` group-by. Seeds via `seed_units` (idempotent upsert by code).

#### 16. Audit Requirements
`category.created`, `unit.created` (after snapshot).

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.inventory.category_created { inline, has_parent }`, `ub.inventory.unit_created { inline, allow_decimal, is_uqc }`.

#### 19. Security
Tenant scoping; `parent_id` cross-tenant → 404; names trimmed and length-limited.

#### 20. Performance
Cached in Redux for the session; invalidated on create. Single query each.

#### 21. Testing
- T-INV-04-1 unit: `seed_units` idempotent; decimal flags per list.
- T-INV-04-2 API: create unit with system code → 400; duplicate tenant code → 400.
- T-INV-04-3 API: category nesting depth 3 → 400 `nesting_too_deep`.
- T-INV-04-4 API: case-insensitive existing category returns 200 existing.
- T-INV-04-5 component: inline create in `UbCombobox` selects new row.
- T-INV-04-6 permission: accountant POST → 403.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given a new tenant, when the item form opens, then Unit offers NOS, KGS, LTR, BOX… without setup.
- AC-2 (US-2) Given owner adds `PETI`, when saved, then it appears with a "Custom" chip and a UQC warning.
- AC-3 (US-3) Given unit NOS (decimals off), when staff enters 1.5 in a line qty, then the input rejects the decimal and the server returns `qty_must_be_whole`.
- AC-4 (US-4) Given category Grocery, when "Rice" is created under it, then the tree shows Grocery › Rice and the item list filter offers both.
- AC-5 (US-5) Given the item form, when staff types "Snacks" in Category and picks create, then the item saves with the new category.

#### 23. Dependencies
INV-01, PLT-06 (default unit), `seed_units`, CCR-02/CCR-03 for rename/UQC mapping.

#### 24. Future Enhancements
INV-14 secondary units and conversions; PATCH/DELETE endpoints (CCR-02); `uqc_code` mapping (CCR-03); category sort order UI; multi-level categories (research §A.5) not planned.

---

### INV-05 — Opening stock

#### 1. Business Objective
Let a business bring its current shelf count and cost into the system on day one so valuation, COGS and low-stock work from the first invoice. Measure: ≥ 70 % of stock-tracking tenants post opening stock for ≥ 50 % of tracked items in week 1 (via form or IMP/INV-09).

#### 2. User Personas
Owner (OW) — enters counts; Accountant (AC) — verifies opening valuation.

#### 3. User Stories
1. US-INV-05-1 — As an owner I want to enter opening quantity and cost when creating an item so its value is right immediately.
2. US-INV-05-2 — As an owner I want to add opening stock later to an item that had none so I can onboard gradually.
3. US-INV-05-3 — As an owner I want opening stock dated in the past so my stock summary as of 1 April is correct.
4. US-INV-05-4 — As an accountant I want opening stock clearly labelled in movement history and valuation.

#### 4. Functional Requirements
1. FR-1 Opening stock is a `StockMovement` of type `opening` with `qty > 0`, `unit_cost ≥ 0`, `movement_date = as_of`, `source_type='item'`, `source_id=item.id`, location `MAIN`.
2. FR-2 Entry paths: (a) `POST /items` with `opening_stock` (INV-01 FR-7); (b) `PATCH /items/{id}` with `track_stock: true` + `opening_stock` for an item without movements; (c) INV-09/IMP-01 `items` template columns `opening_stock_qty/unit_cost/date`; (d) IMP-01 `opening_stock` kind by SKU.
3. FR-3 At most one `opening` movement per item × location; a second attempt → 409 `opening_exists` with hint "Use Adjust stock instead".
4. FR-4 Opening stock for an item that already has other movements → 409 `item_has_movements` (use adjustment).
5. FR-5 The item detail stock card shows "Opening: 10 NOS @ ₹40.00 on 01/04/2026" when present.
6. FR-6 Opening posts run through `stock_service.post_opening_stock`, which applies the weighted-average rule (always the reset branch since on_hand = 0) and initialises `inventory_item_stock`.
7. FR-7 The opening cost defaults to `purchase_price` in the UI; `unit_cost = 0` is allowed (free/gifted stock) with a confirmation hint.

#### 5. Non-Functional Requirements
Same transaction as item create; ≤ 50 ms extra; date input `dd/mm/yyyy` with quick chips Today / FY start (1 April of current FY) / Pick.

#### 6. User Flow
Primary: INV-01 create → Stock section → Track stock on → Opening qty 10, cost 40, date 01/04/2026 → Save.
Alternate: Item detail (untracked goods) → "Enable tracking" → `UbDrawer` "Opening stock" (qty, cost, date) → Save → PATCH.

#### 7. UI Requirements
Inside `ItemForm` (section "Stock") and `OpeningStockDrawer` (`UbDrawer`, fields `UbQuantityInput` qty with unit addon, `UbMoneyInput` cost 4 dp, `UbDateInput`). Mobile bottom sheet; desktop right drawer 420 px. Yup `openingStockSchema`. Redux: reuses `itemFormThunk.updateItem`.

#### 8. UX Requirements
Label "Opening stock (what you have right now)" with Hindi `items.opening.title` = "शुरुआती स्टॉक"; cost hint "Per NOS, excluding GST if you claim ITC"; success toast "Opening stock added · 10 NOS".

#### 9. States
Hidden when `track_stock` off; Disabled with tooltip "Already has movements — use Adjust stock" when applicable; Processing → Save spinner; Success → stock card updates; Error → 409 messages inline in a `UbStatusBanner` within the drawer.

#### 10. Validation Rules
`qty > 0` and decimal rule (`invalid_qty`, `qty_must_be_whole`); `unit_cost ≥ 0`, ≤ 4 dp (`invalid_amount`); `as_of ≤ today` (`future_date`); `as_of ≥ 2000-01-01` (`date_too_old`); item must be `goods` with `track_stock` (`track_stock_not_allowed`).

#### 11. Business Rules
1. BR-1 Opening is a normal inbound movement in valuation: `avg_cost = unit_cost` (reset branch).
2. BR-2 Opening never posts to the party ledger (no supplier).
3. BR-3 Opening `movement_date` may predate other movements' dates only when it is also the first row by `sequence_no`; FR-4 guarantees this, so an opening balance is never a backdated insert and never triggers a recomputation.
4. BR-4 Low-stock evaluation (INV-07) runs after the opening post (an opening below the reorder point notifies).
5. BR-5 Stock summary `as_of` earlier than the opening date shows 0 for the item.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Opening on create | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Opening later (PATCH) / import kind `opening_stock` | `inventory.stock.adjust` | ✅ | ✅ | override | ❌ |

#### 13. Edge Cases
1. EC-1 Opening with `unit_cost = 0` then purchase at ₹50 → avg = (10×0 + 20×50)/30 = 33.3333 (documented; not a bug).
2. EC-2 Opening imported for an SKU that already has opening → row error `opening_exists` (IMP-01).
3. EC-3 Owner wants to correct opening qty → post adjustment (INV-06) with reason `count`; opening rows are immutable.
4. EC-4 `as_of` in a closed FY → allowed; reports handle.
5. EC-5 Item created as service then changed to goods → not allowed (item_type immutable? — yes, BR: `item_type` immutable after create; 409 `item_type_locked`).

#### 14. API Requirements
Via `POST /items` / `PATCH /items/{id}` (`opening_stock: { qty, unit_cost, as_of, location_id? }`) and `POST /imports` kinds. Errors: 409 `opening_exists`, `item_has_movements`, `item_type_locked`. Response includes the created movement in `stock[]`/`movements_recent`.

#### 15. Database Impact
`inventory_stock_movement` (`opening`), `inventory_item_stock` upsert, `platform_audit_log`.

#### 16. Audit Requirements
`stock.opening_posted` with movement row snapshot.

#### 17. Notifications
Low-stock (INV-07) if applicable.

#### 18. Analytics / Event Tracking
`ub.inventory.opening_stock_posted { path: create|patch|import, qty, has_cost, backdated_days }`.

#### 19. Security
Tenant scoping; `location_id` must belong to tenant (404).

#### 20. Performance
One insert + one upsert.

#### 21. Testing
- T-INV-05-1 unit: opening on zero stock sets avg = unit_cost; cost 0 accepted.
- T-INV-05-2 API: second opening → 409 `opening_exists`; opening after purchase → 409 `item_has_movements`.
- T-INV-05-3 API: PATCH `track_stock` true without opening → 409 `opening_stock_required`.
- T-INV-05-4 API: future date → 400 `future_date`.
- T-INV-05-5 E2E: enable tracking from detail → stock card shows values.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given create with opening 10 @ 40, when saved, then on-hand 10, avg 40.0000, value ₹400.00.
- AC-2 (US-2) Given an untracked goods item, when owner enables tracking with opening 5 @ 12, then the item is tracked with one `opening` movement.
- AC-3 (US-3) Given `as_of` = 01/04/2026, when stock summary `as_of=2026-04-01` is fetched, then the item is included; `as_of=2026-03-31` excludes it.
- AC-4 (US-4) Given movement history, when viewed, then the opening row is labelled "Opening stock" and has no source link.

#### 23. Dependencies
INV-01, INV-03, INV-07, IMP-01 (`opening_stock` kind), `stock_service`.

#### 24. Future Enhancements
INV-11 opening per location; INV-16 opening by batch; INV-17 stock take to true-up openings; "Inventory start date" preference (research §A.1) — not planned.

---
### INV-06 — Stock adjustment

#### 1. Business Objective
Give owners a controlled way to correct on-hand for damage, theft, count differences, personal use or other reasons, with an immutable audit trail, so the stock register can be trusted without a full stock-take module. Measures: adjustments carry a reason 100 % of the time (enforced); negative-stock rejections < 5 % of adjustment attempts after month 1 (indicates users understand the policy); P95 post ≤ 500 ms for 20 lines.

#### 2. User Personas
Owner (OW) — posts adjustments; Staff (ST) — only when `inventory.stock.adjust` granted via `permissions_override`; Accountant (AC) — reviews adjustments and their value impact.

#### 3. User Stories
1. US-INV-06-1 — As an owner I want to reduce stock of a damaged item with a reason so the register matches the shelf.
2. US-INV-06-2 — As an owner I want to add stock found during a count, with its cost, so valuation stays correct.
3. US-INV-06-3 — As an owner I want to adjust several items in one go after a shelf count.
4. US-INV-06-4 — As an owner I want to be stopped from taking stock below zero unless I have allowed negative stock in settings.
5. US-INV-06-5 — As an owner I want to see the value impact before I post.
6. US-INV-06-6 — As an accountant I want every adjustment numbered and traceable to who posted it and why.
7. US-INV-06-7 — As staff with permission I want to adjust from the item page quickly on my phone.

#### 4. Functional Requirements
1. FR-1 `POST /stock-adjustments` posts a header (`inventory_stock_adjustment`, status `posted`, number from sequence kind `stock_adjustment`, e.g. `ADJ/26-27/0003`) and one movement per line, atomically.
2. FR-2 Header fields: `adjustment_date` (default today, past allowed, future rejected), `location_id` (null → `MAIN`), `reason` ∈ `damage | theft | count | personal_use | other`, `note` (required when `reason = other`, ≤ 255).
3. FR-3 Line fields: `item_id` (tracked goods only), `qty` (signed, non-zero, decimal rule per unit), `unit_cost` (required when `qty > 0`; defaults to current `avg_cost`; ignored and snapshotted from `avg_cost` when `qty < 0`).
4. FR-4 The drawer shows per line: current on-hand, on-hand after, and value impact (`qty × unit_cost` for inbound; `qty × avg_cost` for outbound); footer totals: lines, net qty by unit is not summed (mixed units), net value impact.
5. FR-5 Lines can be entered as **Adjust by** (signed qty) or **Set to** (new on-hand); "Set to" computes `qty = new_on_hand − on_hand` client-side and sends `qty` (server only receives `qty`).
6. FR-6 Negative-stock policy per §17.6.0: when `inventory.allow_negative_stock=false` and any line would make on-hand < 0 → 409 `insufficient_stock` with `details.lines[]` for all offending lines; the drawer marks each such line with "Only 5 NOS available".
7. FR-7 Item picker is `UbAsyncCombobox` with barcode paste/scan support (HID Enter → lookup → adds line or increments qty of an existing line by 1 — research §A.3 auto-increment).
8. FR-8 Adjustment detail (`GET /stock-adjustments/{id}`) opens in a `UbDrawer` from movement history links and from the item detail; shows header, lines, value impact, posted by.
9. FR-9 Adjustments are immutable (no edit/void at MVP); the detail offers "Post opposite adjustment" which opens the drawer pre-filled with negated quantities and reason `count`, note "Reverses ADJ/26-27/0003".
10. FR-10 Posting writes `AuditLog` `stock.adjustment_posted` with header and line snapshots, and triggers INV-07 evaluation per item.
11. FR-11 Movement types: `adjust_in` for `qty > 0`, `adjust_out` for `qty < 0`; `reason` copied to each movement row; `source_type='stock_adjustment'`, `source_id=header.id`.
12. FR-12 Entry points: Items list row menu, item detail header, Stock summary row menu (INV-08), Low-stock list (INV-07), FAB menu "Adjust stock".

#### 5. Non-Functional Requirements
P95 ≤ 500 ms for 20 lines (one `SELECT … FOR UPDATE` on affected `inventory_item_stock` rows ordered by `item_id` to avoid deadlocks); drawer usable one-handed on 360 px; keyboard: Tab through qty fields, `Alt+N` adds a line; screen readers announce "Line 2: Sugar, on hand 5 KGS, after 3 KGS".

#### 6. User Flow
Primary (single item, mobile): Item detail → Adjust stock → bottom sheet with item preselected → reason Damage → qty −3 → sees "5 → 2 NOS, −₹132.00" → Post → toast "ADJ/26-27/0003 posted" → detail refreshes.
Alternate A (multi-line count): FAB → Adjust stock → reason Count → add items by scanning → "Set to" mode → enter counted quantities → footer shows net impact → Post.
Alternate B (blocked): qty −8 with 5 on hand → Post → 409 → line error "Only 5 NOS available" + banner "Negative stock is off. Change in Settings › Inventory." (link visible to owner/admin).
Alternate C (reason other): note required; Post disabled until ≥ 3 chars.

#### 7. UI Requirements
Component `StockAdjustmentDrawer` (`UbDrawer`, feature `stock-adjustment`), also routed at `app/stock/adjustments/new/page.tsx` for desktop deep links; `StockAdjustmentDetailDrawer`. Header: `UbDateInput`, `MLSelect` Reason (5 options, i18n labels), `MLTextarea` Note. Lines: `UbLineItemsEditor` in **adjustment mode** (columns: Item · On hand · Mode toggle (Adjust by / Set to) · Qty (`UbQuantityInput`, signed) · Unit cost (`UbMoneyInput` 4 dp, enabled only for inbound) · After · Value · remove). Footer: `UbTotalsPanel` variant with rows "Lines", "Value impact" (signed `UbAmount`). Primary "Post adjustment" (`MLButton` primary), secondary "Cancel".

Mobile (< 640 px): bottom sheet full height; lines as cards (item name, on hand → after, qty input, cost input when inbound, value); "Add item" button opens the item search as a nested sheet; scanner supported via `useScannerListener` scoped to the drawer. Desktop (≥ 1024 px): right drawer 720 px; table lines; sticky footer with totals and actions; `Enter` in qty moves to next line, `Ctrl+Enter` posts.

Redux: `stockAdjustmentSlice` (`draft: { header, lines[] }`, `status`, `lineErrors`), thunks `postStockAdjustment`, `fetchStockAdjustment`, `lookupItemForAdjustment`; service `stockService.ts` (`postAdjustment`, `getAdjustment`). Yup `stockAdjustmentSchema` (header) + `stockAdjustmentLineSchema` (array, min 1).

#### 8. UX Requirements
Reasons labelled (en/hi): Damage/"नुकसान", Theft/"चोरी", Count difference/"गिनती में अंतर", Personal use/"निजी उपयोग", Other/"अन्य". Outbound qty shown red with "−", inbound green with "+", labels "Stock out"/"Stock in" beside colour. Post is a financial state change → confirmation is the Post button itself plus consequence line in footer ("2 items · −₹312.00"); no extra dialog because the reason is already captured in the form (template rule satisfied by the mandatory reason). Toast includes number and "View" action.

#### 9. States
| State | UI |
|---|---|
| Initial | Header defaults, zero lines, Post disabled |
| Loading (item lookup) | Inline spinner in picker |
| Empty | "Add items to adjust" placeholder row |
| Success | Toast, drawer closes, caller refreshes |
| Error (validation) | Per-line errors + header field errors |
| Error (409 insufficient_stock) | Offending lines highlighted with available qty; banner with settings hint |
| Disabled | Post disabled while invalid or posting; cost field disabled for outbound |
| Partial | n/a (atomic) |
| Processing | Post button spinner "Posting…" |
| Completed | Detail drawer for the new adjustment when opened from "View" |
| Failed (5xx/network) | Banner with retry; draft retained in slice |

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| adjustment_date | required; ≤ today | "Date cannot be in the future" | `future_date` |
| reason | ∈ enum | "Choose a reason" | `invalid_choice` |
| note | required ≥ 3 chars when reason=other; ≤ 255 | "Describe the reason" | `required` |
| lines | 1–100 lines; unique `item_id` per adjustment | "Item appears twice" | `duplicate_line` |
| lines[i].item_id | tracked goods, active | "Item does not track stock" | `track_stock_not_allowed` |
| lines[i].qty | ≠ 0; decimals per unit; abs ≤ 9999999999.999 | "Quantity cannot be zero" | `invalid_qty` / `qty_must_be_whole` |
| lines[i].unit_cost | required when qty>0; ≥ 0; 4 dp | "Enter cost for stock added" | `required` |
| location_id | tenant location, active | | `not_found` |
| policy | on_hand + qty ≥ 0 unless setting | "Only {available} {unit} available" | `insufficient_stock` (409) |

#### 11. Business Rules
1. BR-1 One header → N movements; header status is always `posted`; no draft state at MVP.
2. BR-2 Inbound line: `apply_weighted_average(on_hand, avg, qty, unit_cost)` per §17.6.0; plain outbound: `unit_cost` snapshot = current `avg_cost`, avg unchanged. An adjustment never carries `reverses_id`, so the reversal cases of §17.6.0 do not arise here.
3. BR-3 Value impact (display and audit metadata): inbound `qty × unit_cost`; outbound `qty × avg_cost_before`; rounded half-up 2 dp; net = Σ.
4. BR-4 Availability check uses `on_hand` after applying earlier lines in the same request in order (two lines for the same item are rejected anyway by `duplicate_line`).
5. BR-5 Numbering: sequence kind `stock_adjustment`, default prefix `ADJ`, FY label per tenant `fy_start_month`; allocated inside the transaction with `SELECT … FOR UPDATE`.
6. BR-6 Adjustments never post to the party ledger or expenses; the money effect is visible only in valuation (RPT-06/RPT-10 P2).
7. BR-7 Staff permission: `inventory.stock.adjust` is absent from the `staff` system role; owners grant it per member through `platform_membership.permissions_override` (PLT-05), and the UI hides all entry points without it.
8. BR-8 When `allow_negative_stock=true`, an outbound below zero is posted; `stock_status=out` shows the negative figure; the next inbound resets avg (reset rule).
9. BR-9 Adjustment dates may be earlier than later-dated movements. Running caches are computed in the canonical order (`movement_date`, `sequence_no`) per §17.6.0 — **not** in posting order — so a backdated adjustment is a non-tail insert: its own `avg_cost_after`/`on_hand_after` are left null, `inventory_item_stock` takes the quantity immediately and is marked `cost_state='stale'`, and `inventory.recompute_item_cost` re-derives that item's averages. The detail view labels such a row "Backdated" (`movement_date` earlier than the item's latest movement date) and shows "Average cost recalculating" until the job completes.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Open drawer, post | `inventory.stock.adjust` | ✅ | ✅ | via override | ❌ |
| View adjustment detail | `inventory.stock.read` | ✅ | ✅ | ✅ | ✅ |
| Change negative-stock setting | `platform.tenant.manage` | ✅ | ✅ (partial) | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 Two users adjust the same item concurrently → row lock serialises; second sees fresh on-hand in the response and, if now insufficient, a 409.
2. EC-2 Line for an archived item → 400 `not_found` in picker (archived hidden); via API → 409 `item_archived`.
3. EC-3 "Set to" equal to current on-hand → qty 0 → client blocks with "No change".
4. EC-4 Inbound with `unit_cost = 0` → allowed with hint; avg dilutes (documented EC-1 of INV-05).
5. EC-5 Adjustment while item has no `inventory_item_stock` row (never had opening) → row created on the fly; inbound sets avg; outbound blocked unless negative allowed.
6. EC-6 100+ lines → client caps at 100 with message "Split into another adjustment".
7. EC-7 Setting toggled to `false` after negative stock exists → existing negatives remain; further outbound on those items blocked until inbound restores ≥ requested.
8. EC-8 Idempotency-Key replay with same body → original 201 replayed (`Idempotent-Replayed: true`); different body → 409 `idempotency_conflict`.
9. EC-9 Scanner adds the same barcode twice → qty increments by 1 in "Adjust by" mode; in "Set to" mode the line is focused instead.

#### 14. API Requirements
`POST /stock-adjustments` (header `Idempotency-Key` required) body per §22.6; response 201 `{ data: { id, number, adjustment_date, reason, note, location, lines: [ { item: {id, name, sku, unit_code}, qty, unit_cost, on_hand_before, on_hand_after, avg_cost_after, value_impact } ], value_impact_total, created_by, created_at }, meta: { movements: [ids] } }` (delta: `lines[]` with before/after figures and `value_impact_total`). Errors: 400 `validation_error` (`details.lines[i].qty` etc.), 403, 409 `insufficient_stock` (`details.lines[]` per §17.6.0), 409 `idempotency_conflict`. `GET /stock-adjustments/{id}` → same shape. Listing adjustments is not in canon; the movement history (INV-03) and audit log (PLT-08) are the browse paths at MVP (CCR-04 requests `GET /stock-adjustments`).

#### 15. Database Impact
Writes `inventory_stock_adjustment` (number, adjustment_date, location_id, reason, note, status), `inventory_stock_movement` ×N (`adjust_in`/`adjust_out`, reason, source), `inventory_item_stock` (on_hand, avg_cost, last_movement_at), `platform_document_sequence` (kind `stock_adjustment`), `platform_audit_log`. Reads `inventory_item`, `inventory_unit.allow_decimal`, `platform_tenant_setting` (`inventory.allow_negative_stock`).

#### 16. Audit Requirements
`stock.adjustment_posted` — `after`: header + lines with before/after on-hand, unit_cost, value impact; `metadata.reason`. Movement rows themselves are the ledger; no separate audit per movement.

#### 17. Notifications
INV-07 low-stock evaluation per affected item; no direct notification for the adjustment. Optional in-app notice to owners when a **staff** member posts an adjustment: type `stock_adjusted_by_staff`, title "Stock adjusted by {name}", body "{number} · {n} items · {value}" — enabled by default, gated by `notifications.settings.manage` (PLT-06).

#### 18. Analytics / Event Tracking
`ub.inventory.adjustment_posted { reason, lines, net_value_bucket, mode: adjust_by|set_to, entry_point, had_scan }`, `ub.inventory.adjustment_blocked_negative { lines_blocked }`, `ub.inventory.adjustment_drawer_abandoned { lines }`.

#### 19. Security
Permission enforced server-side per request; `item_id`/`location_id` tenant-scoped (404); note trimmed and stored as text; Idempotency-Key stored per tenant 24 h; rate limit general.

#### 20. Performance
Single transaction: lock stock rows (`ORDER BY item_id FOR UPDATE`), bulk insert movements, bulk update stock rows, one sequence update, one audit insert → ≤ 6 + N statements; N ≤ 100.

#### 21. Testing
- T-INV-06-1 unit: `post_adjustment` inbound updates avg per formula; outbound snapshots avg and leaves it unchanged.
- T-INV-06-2 unit: negative policy false → raises with all offending lines; true → posts negative on-hand.
- T-INV-06-3 unit: value impact rounding half-up.
- T-INV-06-3a unit (Tier 1): a backdated adjustment posted **between** two existing movements leaves `avg_cost_after` null on the new row, sets `cost_state='stale'`, enqueues exactly one `inventory.recompute_item_cost`, and after the job runs every movement's `avg_cost_after` equals an independent replay in (`movement_date`, `sequence_no`) order.
- T-INV-06-4 API: 201 shape; `number` sequential across two posts; idempotent replay.
- T-INV-06-5 API: reason other without note → 400; duplicate item lines → 400; service item → 400.
- T-INV-06-6 API: staff without override → 403; with override → 201.
- T-INV-06-7 API: concurrent adjustments on same item (threads) → consistent final on_hand.
- T-INV-06-8 component: "Set to" computes signed qty; cost disabled for outbound; footer net value.
- T-INV-06-9 component: 409 response maps to per-line errors and banner.
- T-INV-06-10 E2E: mobile adjust from item detail; movement row appears; badge changes to Low when crossing.
- T-INV-06-11 E2E: scanner adds/increments lines.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given Sugar on hand 5 KGS at avg ₹44, when owner posts −3 KGS reason Damage, then on hand is 2 KGS, avg ₹44, one `adjust_out` movement with `unit_cost=44.0000`, `reason=damage`, number `ADJ/26-27/0001`.
- AC-2 (US-2) Given Rice on hand 5 @ ₹50, when +3 @ ₹41 is posted, then avg becomes ₹46.6250 and on hand 8.
- AC-3 (US-3) Given three items counted, when posted in one adjustment, then one header with three lines exists and each item's history shows the same number.
- AC-4 (US-4) Given negative stock off and 5 on hand, when −8 is posted, then 409 `insufficient_stock` with `details.lines[0].available="5.000"` and nothing is written.
- AC-5 (US-5) Given lines entered, when the footer renders, then value impact equals Σ (qty × cost) for inbound and Σ (qty × avg) for outbound, before posting.
- AC-6 (US-6) Given a posted adjustment, when the accountant opens it, then number, date, reason, note, posted-by and lines are visible and no edit control exists.
- AC-7 (US-7) Given staff with `inventory.stock.adjust` override, when they adjust from the item page on mobile, then the bottom sheet posts successfully; without override the action is absent and the API returns 403.

#### 23. Dependencies
INV-01/03, INV-07, PLT-05 (`permissions_override`), PLT-06 (`inventory.allow_negative_stock`), sequence kind `stock_adjustment`, `UbLineItemsEditor` adjustment mode, `useScannerListener`.

#### 24. Future Enhancements
INV-17 stock-take sessions (count → variance → adjustment); value-only adjustments (research §A.9) — would need a movement type without qty, deliberately excluded; draft/approval states; `GET /stock-adjustments` list (CCR-04); P2 attachments (photo of damaged goods, `files_attachment.kind=bill_photo` reuse).

---

### INV-07 — Low-stock alerts

#### 1. Business Objective
Tell the owner, once and at the right moment, that an item needs reordering, so stock-outs (lost sales) fall without nagging. Measures: ≥ 40 % of low-stock notifications lead to a purchase bill or inbound adjustment for that item within 7 days; ≤ 1 notification per item per crossing (enforced).

#### 2. User Personas
Owner (OW) — receives alerts, reorders; Staff (ST) — sees the low-stock bucket when billing.

#### 3. User Stories
1. US-INV-07-1 — As an owner I want a notification when an item falls to or below its reorder point so I can reorder.
2. US-INV-07-2 — As an owner I don't want repeated alerts for the same item while it stays low.
3. US-INV-07-3 — As an owner I want a dashboard tile and list of all low/out items.
4. US-INV-07-4 — As an owner I want to act from the alert (create purchase bill, adjust stock).

#### 4. Functional Requirements
1. FR-1 A crossing occurs when, for a tracked item with `reorder_point IS NOT NULL`, `on_hand_before > reorder_point` and `on_hand_after ≤ reorder_point` as a result of any movement post, **or** when `reorder_point` is edited such that `on_hand ≤ new reorder_point` while `on_hand > old reorder_point` (or old was null).
2. FR-2 On every movement post and reorder-point edit the service calls `low_stock_service.evaluate_crossing(item, location)`; when a crossing is detected it calls `jobs.enqueue('inventory.low_stock_notify', { tenant_id, item_id, location_id })` (ADR-012) instead of writing the notification inline, so posting latency is unaffected.
3. FR-3 The runner task creates one `notifications_notification` row: `type='low_stock'`, `user_id NULL` (all members with `inventory.stock.read`), title "Low stock: {item name}", body "{on_hand} {unit} left · reorder at {reorder_point}", `data: { route: "/items/{id}", item_id, on_hand, reorder_point }`.
4. FR-4 **Once-per-crossing rule** (no schema change): before creating, the task computes `last_above_at = MAX(created_at)` of movements for the item/location with `on_hand_after > reorder_point` (NULL → item `created_at`) and skips if a `low_stock` notification for `data.item_id` exists with `created_at > last_above_at`. A re-notification is therefore only possible after stock has risen above the reorder point at least once.
5. FR-5 Nightly command `scan_low_stock` (via `run_scheduler`, 02:00 IST) evaluates all tracked items with the same rule to catch reorder-point edits made while the runner was down and to keep `GET /stock/low` counts warm; it never creates duplicates because of FR-4.
6. FR-6 `GET /stock/low` returns items with `stock_status ∈ {low, out}` sorted by `out` first then `on_hand/reorder_point` ascending; used by the dashboard tile (RPT-01) and the Low tab of INV-02.
7. FR-7 The notification row action buttons: "Add purchase" (opens PUR-01 editor with the item as line, supplier blank), "Adjust stock" (INV-06 drawer), "Mark read".
8. FR-8 Out-of-stock (on_hand ≤ 0) is a second, separate crossing when the item also crosses zero: title "Out of stock: {item}"; same once-per-crossing rule with threshold 0 (uses `type='low_stock'`, `data.level='out'`).
9. FR-9 Items without `reorder_point` never raise low alerts but do raise out-of-stock alerts when tracked and `on_hand` crosses ≤ 0.

#### 5. Non-Functional Requirements
Evaluation adds ≤ 5 ms per posted item (in-memory comparison of before/after); runner latency ≤ 60 s to notification; `scan_low_stock` for 10k items ≤ 10 s (single query with join on `inventory_item_stock`); Hindi copy `notifications.lowStock.title` = "स्टॉक कम: {item}".

#### 6. User Flow
Primary: invoice issue takes Rice from 6 → 4 (reorder 5) → runner creates notification → bell shows unread → owner taps → item detail → "Add purchase".
Alternate: owner raises reorder point 5 → 10 while on hand is 8 → crossing → notification.
Alternate: stock replenished to 30 then sold down to 5 again → new notification (second crossing).

#### 7. UI Requirements
No dedicated screen; surfaces: NTF-01 inbox row (`UbTimeline` item with warning icon), RPT-01 tile `UbStatCard` "Low stock" tone `warning` (count from `/stock/low` meta), INV-02 Low/Out tabs, `app/stock/low/page.tsx` → `<LowStockPageContent/>` list (`UbDataGrid`: Item, On hand (badge), Reorder point, Suggested qty = `max(reorder_point × 2 − on_hand, 0)` display-only, Last purchase cost, actions). Mobile cards; desktop table. Redux: `stockSummarySlice.low` with thunk `fetchLowStock`.

#### 8. UX Requirements
Never more than one badge per item; copy names the gap and the action ("4 NOS left · reorder at 5 — Add purchase"). Out-of-stock uses `danger` tone; low uses `warning`.

#### 9. States
Tile Loading skeleton; Empty ("All stocked up") success tone; Success list; Error retry; Notification read/unread styles per NTF-01.

#### 10. Validation Rules
Not applicable (no user input) beyond `reorder_point` validation in INV-01.

#### 11. Business Rules
1. BR-1 Thresholds are inclusive: `on_hand ≤ reorder_point` is low; `on_hand ≤ 0` is out.
2. BR-2 Crossing detection uses the atomic before/after values from the same transaction that posted the movement; batch posts (invoice with 20 lines) enqueue one job per crossed item.
3. BR-3 Job payload is idempotent: the task re-checks FR-4 at execution time; duplicate jobs produce no duplicate notifications.
4. BR-4 Notifications are tenant-wide (`user_id NULL`) and filtered by permission at read time (NTF-01).
5. BR-5 Voiding a document that raises stock above the reorder point resets the crossing state implicitly (FR-4 relies on movement history, so no explicit reset is needed).
6. BR-6 Archived items are excluded from scanning and from `/stock/low`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Receive/see low-stock notification & list | `inventory.stock.read` | ✅ | ✅ | ✅ | ✅ |
| Act: Add purchase | `purchases.bill.write` | ✅ | ✅ | ✅ | ❌ |
| Act: Adjust stock | `inventory.stock.adjust` | ✅ | ✅ | override | ❌ |

#### 13. Edge Cases
1. EC-1 Item oscillates 5 → 4 → 5 → 4 around reorder 5 within a day → two notifications (two genuine crossings); acceptable and documented.
2. EC-2 Reorder point removed (set null) → no future low alerts; out alerts continue.
3. EC-3 Runner down for hours → jobs queue; on restart FR-4 dedups; `scan_low_stock` covers missed evaluations.
4. EC-4 Movement backdated (`movement_date` earlier than the item's latest movement date) → the crossing is evaluated after `inventory.recompute_item_cost` completes, against the recomputed `on_hand`, so the alert reflects the corrected register rather than a half-applied one.
5. EC-5 Negative stock allowed and on hand −3 → `out` alert once at the zero crossing; further decreases do not re-notify.
6. EC-6 Notification purge after 180 days (§21.3.2) → FR-4 dedup window is effectively bounded; a crossing after purge could re-notify — acceptable.

#### 14. API Requirements
`GET /stock/low?location_id&page&page_size` → `{ data: [ { item: {id, name, sku, unit_code}, on_hand, reorder_point, stock_status, avg_cost, last_purchase_cost } ], meta: { totals: { low, out } } }` (`last_purchase_cost` = `inventory_item.purchase_price`). Notifications via `GET /notifications` (NTF-01). No new endpoints.

#### 15. Database Impact
Reads `inventory_item_stock`, `inventory_item.reorder_point`, `inventory_stock_movement` (`on_hand_after`, index `(tenant_id, item_id, location_id, movement_date, created_at)`), `notifications_notification` (index `(tenant_id, user_id, read_at, created_at DESC)`; FR-4 query filters `type='low_stock'` and `data->>'item_id'` — add expression index `IX(tenant_id, (data->>'item_id')) WHERE type='low_stock'` if P95 of the task exceeds 20 ms; otherwise none). Writes `platform_job`, `notifications_notification`.

#### 16. Audit Requirements
None (system notifications are not audited); job execution logged with `request_id=null`, `actor_type=system` in structured logs.

#### 17. Notifications
In-app only at MVP: type `low_stock`; template `notifications.lowStock.title/body` with placeholders `{item}`, `{on_hand}`, `{unit}`, `{reorder_point}`. SMS/WhatsApp not used (owner-facing alert). P2: web push (NTF-04).

#### 18. Analytics / Event Tracking
`ub.inventory.low_stock_notified { level: low|out, trigger: movement|reorder_edit|scan }`, `ub.inventory.low_stock_action { action: add_purchase|adjust|read }`.

#### 19. Security
Job payload contains only ids; task re-validates tenant scope; notifications respect permission filtering.

#### 20. Performance
Evaluation O(1) per item; nightly scan one SQL statement; `/stock/low` uses cache columns with index on `(tenant_id, status)` plus in-memory filter — for tenants > 50k items a partial index on `inventory_item_stock(on_hand)` may be added later.

#### 21. Testing
- T-INV-07-1 unit: `evaluate_crossing` truth table (above→equal, above→below, below→below, null reorder, reorder edit).
- T-INV-07-2 unit: once-per-crossing — second movement while low → no new notification; rise above then fall → new notification.
- T-INV-07-3 unit: out-of-stock crossing separate from low crossing; negative allowed → single out alert.
- T-INV-07-4 integration: invoice issue → job row → runner → notification with correct body.
- T-INV-07-5 integration: `scan_low_stock` idempotent on repeated runs.
- T-INV-07-6 API: `/stock/low` ordering and totals.
- T-INV-07-7 E2E: dashboard tile count equals list count; action buttons route correctly.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given Rice reorder 5 and on hand 6, when an invoice takes 2, then within 60 s a notification "Low stock: Rice — 4 NOS left · reorder at 5" exists.
- AC-2 (US-2) Given the notification exists and on hand drops to 2 then 1, when evaluated, then no additional low notification is created; when stock rises to 20 and later drops to 5, a new one is created.
- AC-3 (US-3) Given 3 low and 1 out items, when the dashboard loads, then the tile shows 4 and the list shows the out item first.
- AC-4 (US-4) Given the notification, when "Add purchase" is tapped, then PUR-01 opens with the item line prefilled.

#### 23. Dependencies
INV-01 (`reorder_point`), stock posting services (INV-05/06, PUR-01, SAL-02/04), NTF-01, RPT-01, `jobs` abstraction and `run_scheduler` (ADR-012).

#### 24. Future Enhancements
NTF-04 push; P2 "Reorder from supplier" using preferred supplier; replenishment rules (min/max, research §A.28); per-location thresholds (INV-11); email digest (NTF-06).

---

### INV-08 — Stock summary & valuation

#### 1. Business Objective
Show what the business holds and what it is worth (on-hand × weighted-average cost) per item and category, as of any date, so owners can see capital tied in stock and accountants can close books. Measures: valuation total equals Σ movements recomputation in CI (100 %); report P95 ≤ 800 ms for 10k items.

#### 2. User Personas
Owner (OW) — checks stock value and dead stock; Accountant (AC) — closing stock for the FY, exports.

#### 3. User Stories
1. US-INV-08-1 — As an owner I want a list of all tracked items with on-hand, avg cost and value, with a grand total.
2. US-INV-08-2 — As an owner I want to group/filter by category so I can see value per shelf.
3. US-INV-08-3 — As an accountant I want stock value as of 31 March so I can report closing stock.
4. US-INV-08-4 — As an accountant I want to export the summary to CSV.
5. US-INV-08-5 — As an owner I want to jump from a row to adjust or view the item.

#### 4. Functional Requirements
1. FR-1 `GET /stock/summary?category_id&location_id&as_of&q&page&page_size&ordering` returns per tracked item `{ item, category, on_hand, avg_cost, value, reorder_point, stock_status, last_movement_at }` and `meta.totals { items, on_hand_lines, value }`.
2. FR-2 Without `as_of` (or `as_of = today`) figures come from `inventory_item_stock` caches. With a past `as_of`, figures are the `on_hand_after` / `avg_cost_after` of the last movement with `movement_date ≤ as_of` per item, in the canonical order (`movement_date`, `sequence_no`) of §17.6.0 — no recomputation. An item whose `cost_state = 'stale'` (a backdated post or a void is awaiting `inventory.recompute_item_cost`) is returned with `cost_state: "stale"` and the row is annotated "Average cost recalculating"; its quantities are exact either way.
3. FR-3 Category grouping: toggle "Group by category" renders collapsible groups with subtotals (client-side over the current page when paginated; when `page_size=all` ≤ 2,000 rows the server returns `meta.by_category[]` subtotals — delta).
4. FR-4 Filters: category, stock status (in/low/out/negative), search `q`, "Hide zero stock" (default on).
5. FR-5 Row actions: View item (INV-03), Adjust stock (INV-06).
6. FR-6 Export CSV via IMP-02 (`/reports/stock-summary.csv` with the same params); columns: `sku,name,category,unit,on_hand,avg_cost,value,reorder_point,stock_status,last_movement_at`.
7. FR-7 The RPT-06 report page reuses this feature's components; `GET /reports/stock-summary` is an alias returning the same payload (§22.11).
8. FR-8 Value uses `round_half_up(on_hand × avg_cost, 2)` per row; totals sum rounded rows (so the total equals the sum of displayed rows).

#### 5. Non-Functional Requirements
P95 ≤ 800 ms (today) / ≤ 2 s (`as_of` past, 10k items — lateral join on movement index); mobile cards show name, on-hand badge, value; desktop table right-aligned numerals `ds-num`; FY presets in the date picker (31 Mar of each FY with data).

#### 6. User Flow
Primary: More → Stock summary → totals card "₹1,24,560.00 in 312 items" → filter category Grocery → subtotal → row → item.
Alternate: accountant sets As of 31/03/2026 → banner "Showing stock as of 31/03/2026 (historical)" → Export CSV → download.

#### 7. UI Requirements
Route `app/stock/summary/page.tsx` → `<StockSummaryPageContent/>`; `UbPageHeader` (title "Stock summary", actions Export), `UbStatCard` ×3 (Stock value, Items, Low/Out), toolbar (`UbSearchInput`, `UbCombobox` Category, `MLSelect` Status, `UbDateInput` As of with chips Today / FY end, `MLSwitch` Hide zero, `MLSwitch` Group by category), `UbDataGrid` columns Item (name + SKU) · Category · Unit · On hand (badge) · Avg cost · Value · Last movement · ⋯; group header rows with subtotal; `UbEmptyState`. Redux: `stockSummarySlice` (`rows`, `meta`, `filters`, `asOf`), thunks `fetchStockSummary`, `fetchLowStock`; service `stockService.ts`.

#### 8. UX Requirements
Historical mode banner (info tone) with "Back to today". Negative on-hand rows in danger tone with value negative. Totals labelled "Value at weighted-average cost (excl. GST where ITC claimed)". Hindi `stock.summary.title` = "स्टॉक सारांश".

#### 9. States
Loading skeleton (cards + 8 rows); Empty first-use "No tracked items yet — add items with stock"; Filtered-empty; Success; Error; Processing (historical query > 1 s shows "Calculating as of …" inline progress); Export states per IMP-02.

#### 10. Validation Rules
`as_of ≤ today` (`future_date`); `as_of ≥ 2000-01-01`; `page_size ≤ 100` or `all` (server caps `all` at 2,000 rows → 400 `too_many_rows` with hint to filter/export).

#### 11. Business Rules
1. BR-1 Only `track_stock=true` goods appear; archived items appear only when they hold non-zero stock (which archive rules prevent) — effectively excluded.
2. BR-2 Value per row is at `avg_cost`; no FIFO alternative at MVP.
3. BR-3 Historical `as_of` uses the movement row caches strictly in canonical order (`movement_date`, `sequence_no`), so a backdated post made later **does** change historical figures — consistent with the ledger philosophy and with §17.6.0. This is only true because those row caches are re-derived by `inventory.recompute_item_cost` after every non-tail insert; without that job the figures would be the arrival-order ones and would not match any replay.
4. BR-4 Totals are over the **filtered** set including rows on other pages.
5. BR-5 "Hide zero stock" hides rows with `on_hand = 0` only; negatives remain visible.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View summary (quantities) | `inventory.stock.read` | ✅ | ✅ | ✅ | ✅ |
| View valuation columns (avg cost, value) | `reports.financial.read` | ✅ | ✅ | ❌ (columns hidden, API omits) | ✅ |
| Export | `reports.export` | ✅ | ✅ | ❌ | ✅ |
| Adjust | `inventory.stock.adjust` | ✅ | ✅ | override | ❌ |

#### 13. Edge Cases
1. EC-1 Item with movements only after `as_of` → excluded (on hand 0 at that date).
2. EC-2 Category deleted (P2) → rows shown under "Uncategorised".
3. EC-3 Very large tenant (50k items) → pagination mandatory; `all` refused; export path recommended.
4. EC-4 Staff without financial read → API returns rows without `avg_cost`/`value` and `meta.totals.value = null`.
5. EC-5 Rounding: 3 × ₹46.6250 = 139.875 → ₹139.88 (half-up).

#### 14. API Requirements
`GET /stock/summary` params/response above; `GET /reports/stock-summary` alias; `GET /reports/stock-summary.csv` (IMP-02). Errors 400 `validation_error`, `too_many_rows`; 403 for export without permission. Field omission by permission is a documented delta.

#### 15. Database Impact
Reads `inventory_item`, `inventory_item_stock`, `inventory_category`, `inventory_unit`, `inventory_stock_movement` (historical via `LATERAL (SELECT on_hand_after, avg_cost_after … WHERE item_id=… AND movement_date ≤ as_of ORDER BY movement_date DESC, sequence_no DESC LIMIT 1)`). Optional `reports_snapshot` cache for tenants > 5k items (RPT-06). No writes.

#### 16. Audit Requirements
Export requests audited under IMP-02 (`export.requested`).

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.inventory.stock_summary_viewed { historical, grouped, filters_count }`, `ub.inventory.stock_summary_exported`.

#### 19. Security
Valuation fields gated by `reports.financial.read` server-side; tenant scoping; `q` escaped.

#### 20. Performance
Today path: one query over caches + count/total aggregate. Historical: lateral join using the movement index; 10k items ≈ 10k index probes ≤ 2 s; results cached 10 min per (tenant, as_of, filters) in `reports_snapshot` when > 5k items.

#### 21. Testing
- T-INV-08-1 API: totals equal Σ rounded row values; `recalc_stock` equality assertion.
- T-INV-08-2 API: `as_of` past selects correct movement row incl. same-day multiple movements.
- T-INV-08-3 API: staff response omits valuation fields.
- T-INV-08-4 API: `page_size=all` over 2,000 → 400.
- T-INV-08-5 component: grouping subtotals; historical banner; hide-zero switch.
- T-INV-08-6 E2E: export CSV columns and row count match filtered set.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given tracked items, when the summary loads, then each row shows on-hand, avg cost, value and the header total equals the sum of rows.
- AC-2 (US-2) Given Group by category, when enabled, then subtotals per category appear and sum to the grand total.
- AC-3 (US-3) Given `as_of=2026-03-31`, when loaded, then figures reflect the last movement on or before that date and a historical banner shows.
- AC-4 (US-4) Given accountant, when Export CSV is chosen, then a CSV with the specified columns downloads (or an export job is created for > 5k rows).
- AC-5 (US-5) Given a row, when "Adjust stock" is chosen, then the INV-06 drawer opens with the item.

#### 23. Dependencies
INV-03/06, RPT-06, IMP-02, `reports_snapshot` (optional), `reports.financial.read` gating.

#### 24. Future Enhancements
RPT-10 profit summary (COGS from `unit_cost` snapshots); RPT-09 movers; INV-11 per-location columns; ABC classification, dead-stock ageing (research §A.10); FIFO valuation — not planned.

---
### INV-09 — Import items (CSV)

#### 1. Business Objective
Let a business load its whole catalogue — including opening stock and cost — from a spreadsheet in minutes instead of typing hundreds of items, using the IMP-01 framework. Measures: median 500-row import validates in ≤ 10 s and commits in ≤ 20 s; ≥ 90 % of imports that reach `ready` are committed; first-attempt error rate trending down via clear row messages.

#### 2. User Personas
Owner (OW) — prepares and uploads the sheet; Accountant (AC) — may prepare the file (cannot commit).

#### 3. User Stories
1. US-INV-09-1 — As an owner I want to download an items template with example rows so I know exactly what to fill.
2. US-INV-09-2 — As an owner I want every row checked before anything is saved, with row-and-column error messages I can fix in my sheet.
3. US-INV-09-3 — As an owner I want opening stock and cost per item in the same file so valuation is right after import.
4. US-INV-09-4 — As an owner I want the import to be all-or-nothing so I never end up with half a catalogue.
5. US-INV-09-5 — As an owner I want categories and units named in the sheet to be matched or created automatically.

#### 4. Functional Requirements
1. FR-1 Template `GET /imports/templates/items.csv` has exactly these headers, in this order:
   `name,item_type,sku,barcode,category,unit,hsn_sac,tax_code,tax_inclusive_selling,purchase_price,selling_price,mrp,track_stock,reorder_point,opening_stock_qty,opening_stock_unit_cost,opening_stock_date,description`
   followed by a comment line starting with `#` (allowed values per column) and two example rows (`Basmati Rice 5kg,goods,,8901234567890,Grocery,NOS,1006,GST5,false,420.00,450.00,480.00,true,5,10,400.0000,2026-04-01,` and `Repair service,service,,,,NOS,998719,GST18,false,0,500.00,,false,,,,,`). The importer ignores `#` lines; example rows must be deleted by the user (a row whose `name` equals an example name is flagged with warning `example_row`).
2. FR-2 Column semantics and validation (per row, all errors collected; codes returned in `errors[]`):

| Column | Required | Rule | Error code / message |
|---|---|---|---|
| name | yes | 1–160 | `required` "Name is required" / `max_length` |
| item_type | no (default `goods`) | `goods`|`service` (case-insensitive) | `invalid_choice` "Use goods or service" |
| sku | no | 1–48, pattern per INV-01; unique in tenant **and** within the file | `duplicate_sku` "SKU already exists" / `duplicate_in_file` "SKU repeated at row {n}" |
| barcode | no | 4–48, pattern; unique in tenant and file | `duplicate_barcode` / `duplicate_in_file` |
| category | no | name; matched case-insensitively to top-level category or `Parent > Child`; created if missing (BR-3) | `nesting_too_deep` when more than one `>` |
| unit | yes | code (case-insensitive) matched to system/tenant units; **not** auto-created | `unknown_unit` "Unit {x} not found — add it in Settings first" |
| hsn_sac | no | INV-01 regex per type | `invalid_hsn` / `invalid_sac` |
| tax_code | no (default `GST0`) | active `tax_rate.code` on today | `invalid_tax_code` "Unknown or expired GST code" |
| tax_inclusive_selling | no (default false) | `true/false/yes/no/1/0` | `invalid_boolean` |
| purchase_price, selling_price | no (default 0) | decimal ≥ 0, ≤ 2 dp; Indian grouping and ₹ stripped | `invalid_amount` |
| mrp | no | decimal ≥ 0; goods only; ≥ selling_price (tax-inclusive comparison) | `mrp_not_allowed` / `selling_price_above_mrp` |
| track_stock | no (default true for goods, false for service) | boolean; services must be false | `track_stock_not_allowed` |
| reorder_point | no | decimal ≥ 0; decimals per unit | `invalid_qty` / `qty_must_be_whole` |
| opening_stock_qty | no | > 0 when present; requires track_stock | `invalid_qty` / `track_stock_not_allowed` |
| opening_stock_unit_cost | when qty present | ≥ 0, ≤ 4 dp; defaults to purchase_price if blank | `invalid_amount` |
| opening_stock_date | no (default today) | `YYYY-MM-DD` or `DD/MM/YYYY`; ≤ today | `invalid_date` / `future_date` |
| description | no | ≤ 2000 | `max_length` |

3. FR-3 Commit creates items in file order via `item_service.create_item` (same code path as `POST /items`), posting `opening` movements where given; SKUs left blank are generated by BR-2 of INV-01 within the same transaction (file order determines numbering).
4. FR-4 All-or-nothing: commit is refused (409 `import_has_errors`) while `error_rows > 0`; during `importing` a single `transaction.atomic()` wraps every row; any unexpected failure rolls back and sets the job `failed` with `result.error`.
5. FR-5 Warnings (non-blocking, `warnings[]`): `hsn_unknown`, `barcode_checksum`, `example_row`, `unknown_column` (ignored column), `category_created` (preview lists categories that will be created).
6. FR-6 Preview (`GET /imports/{id}` → `preview_rows[≤ 20]`) shows parsed values and the derived SKU placeholder "auto".
7. FR-7 Limits: ≤ 5,000 item rows per file (framework max 10,000 applies to parties); file ≤ 5 MB.
8. FR-8 Job kind `items`; the flow, states, polling and error CSV are as IMP-01.
9. FR-9 Result summary on `completed`: `{ created_items, opening_movements, categories_created, stock_value }`.

#### 5. Non-Functional Requirements
Validation ≤ 2 ms/row (unit/category/tax lookups preloaded into dicts; SKU/barcode uniqueness via one `IN` query per 1,000 rows); commit ≤ 30 ms/row; runner processes one job at a time per tenant; UTF-8 with or without BOM; Excel-saved CSV (CRLF, quoted commas) accepted.

#### 6. User Flow
Primary: Items → Import → step 1 Download template → step 2 Upload file (`UbFileUpload`) → job `uploaded` → "Checking file…" → `ready` with "312 rows · 0 errors · 4 categories will be created" → preview table → Commit → `importing` → `completed` → summary card → "Go to items".
Alternate: errors 7 → `ready` but Commit disabled → error table + "Download error CSV" → user fixes sheet → "Upload corrected file" (new job; old job `cancelled`).

#### 7. UI Requirements
Uses the IMP-01 wizard (`app/imports/page.tsx`, `app/imports/[id]/page.tsx`) with `kind=items` preselected from the Items page ("Import" action). Items-specific: preview grid columns follow the template; error table columns Row · Column · Value · Problem; summary `UbStatCard`s Created items / Opening stock value / Categories created. Redux: `importJobSlice` (IMP-01) — no separate slice.

#### 8. UX Requirements
Copy explains the boolean and unit rules in the `#` comment row and in an inline `UbHelpHint` per column header; Hindi `imports.items.title` = "आइटम इम्पोर्ट करें". Commit button label "Import 312 items" (count reflects valid rows).

#### 9. States
Per IMP-01 state machine mapped to UI: `uploaded/validating` → progress "Checking rows… {done}/{total}"; `ready` (0 errors) → Commit enabled; `ready` (errors) → Commit disabled + error table; `importing` → progress; `completed` → summary; `failed` → error banner with `result.error` and request id; `cancelled` → muted card.

#### 10. Validation Rules
Per FR-2, plus file-level: header row must contain all required columns (`name`, `unit`) else job `failed` with `result.error.code = missing_columns` and `columns[]`; > 5,000 rows → `too_many_rows`; empty file → `empty_file`.

#### 11. Business Rules
1. BR-1 Create-only at MVP: an existing SKU is an error, never an update (IMP-03 adds upsert).
2. BR-2 Within-file duplicates (SKU/barcode) are errors on the **later** row, referencing the earlier row number.
3. BR-3 Category auto-create: `Grocery` → top-level; `Grocery > Rice` → child (created if missing, parent created if missing); names trimmed; max depth 2.
4. BR-4 Units are never auto-created (UQC discipline, INV-04) — the error message directs to Settings.
5. BR-5 Opening movements use `movement_date = opening_stock_date`, `source_type='import'`, `source_id=job.id` so the import is traceable from movement history (label "Import {job short id}").
6. BR-6 The whole commit runs as the requesting user (`created_by_id`), even though executed by the runner; audit rows carry `actor_type=user`.
7. BR-7 Numbers accept `1,250.50`, `₹1250.5`, `1250` → normalised with `Decimal`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Upload/validate items file | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Commit (creates items; opening stock present) | `inventory.item.write` + `inventory.stock.adjust` when any row has opening stock | ✅ | ✅ | override | ❌ |
| View job | `inventory.item.read` | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. EC-1 Sheet saved from Excel with `;` delimiter → parser sniffs delimiter (`,` `;` `\t`); if header still unmatched → `missing_columns`.
2. EC-2 Barcode column formatted as number in Excel → `8.90123E+12` → error `invalid_barcode` "Format the column as text".
3. EC-3 Hindi item names → allowed; SKU auto `ITEM-001…`.
4. EC-4 5,000 rows with opening stock → 5,000 movements; commit ≈ 2–3 min; UI shows progress from `result.progress` updated every 200 rows.
5. EC-5 Same file uploaded twice → second validation flags every SKU as `duplicate_sku` (if SKUs given) or would create duplicates by name (allowed) → preview warns `possible_duplicate_names` when ≥ 50 % names already exist.
6. EC-6 Tax code `GST12` → `invalid_tax_code` with message "GST12 ended on 21/09/2025; use GST5 or GST18".
7. EC-7 Runner crashes mid-commit → transaction rolled back by DB; job left `importing` → `run_scheduler` startup marks jobs `importing` older than 30 min as `failed` (`result.error.code = interrupted`), user can re-commit.

#### 14. API Requirements
IMP-01 endpoints with `kind=items`: `POST /imports` (multipart), `GET /imports/{id}`, `POST /imports/{id}/commit` (409 `import_has_errors`, `import_not_ready`), `POST /imports/{id}/cancel`, `GET /imports/templates/items.csv`. Job response deltas for items: `preview_rows[].derived = { sku_auto: true|false, category_action: existing|create }`, `result` per FR-9.

#### 15. Database Impact
`imports_job` (kind `items`, counts, errors, result), `files_attachment` (`import_file`), `inventory_item`, `inventory_item_stock`, `inventory_stock_movement` (`opening`), `inventory_category`, `platform_audit_log`, `platform_job`.

#### 16. Audit Requirements
`import.requested { kind, total_rows }`, `import.committed { created_items, categories_created }`, plus per-item `item.created` rows (batched insert), `stock.opening_posted` aggregated as one audit row with count (to avoid 5,000 audit inserts — `metadata.batch=true`).

#### 17. Notifications
`import_done` in-app notification to the requesting user: "Items import finished — 312 items created" / "Items import failed" with route to the job (NTF-01 type list includes "import done").

#### 18. Analytics / Event Tracking
`ub.imports.items_uploaded { rows }`, `ub.imports.items_validated { errors, warnings, categories_to_create }`, `ub.imports.items_committed { created, with_opening, duration_ms }`, `ub.imports.error_csv_downloaded`.

#### 19. Security
File type by content sniff (text/csv); size limit; formulas neutralised (cells starting with `=`, `+`, `-`, `@` are prefixed with `'` in error CSV to prevent CSV injection on re-open); stored under `MEDIA_ROOT/imports/<tenant>/<job>.csv`; deleted 30 days after completion.

#### 20. Performance
Streaming parse (`csv` module) — never load whole file into memory beyond 5 MB; preloaded lookups; `bulk_create` in chunks of 500 for items and movements, then per-item stock upsert; sequence-free (SKUs generated in-memory with one `SELECT` per prefix).

#### 21. Testing
- T-INV-09-1 unit: column parsers (booleans, amounts with ₹ and commas, dates in both formats).
- T-INV-09-2 unit: within-file duplicates flagged on later row.
- T-INV-09-3 integration: validate fixture with 12 error kinds → `errors[]` codes and messages.
- T-INV-09-4 integration: commit with errors → 409; after fix → completed; DB counts match.
- T-INV-09-5 integration: failure injection mid-commit → nothing persisted, job `failed`.
- T-INV-09-6 integration: category `A > B` creation; unit unknown → error.
- T-INV-09-7 E2E: full wizard on 360 px; error CSV download content.
- T-INV-09-8 permission: accountant upload → 403; staff commit with opening stock without override → 403.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given the Items page, when "Download template" is tapped, then a CSV with the exact header list in FR-1 and two example rows downloads.
- AC-2 (US-2) Given a file with a bad tax code at row 7 and a repeated SKU at row 12, when validated, then `errors` contains `{row:7,column:"tax_code",code:"invalid_tax_code"}` and `{row:12,column:"sku",code:"duplicate_in_file"}` and Commit is disabled.
- AC-3 (US-3) Given a row with opening qty 10 @ 400, when committed, then the item has on-hand 10 and avg ₹400.0000 and one `opening` movement labelled Import.
- AC-4 (US-4) Given a DB failure during commit, when the job finishes, then zero items from that file exist and the job is `failed`.
- AC-5 (US-5) Given category "Grocery > Rice" not existing, when committed, then both categories exist and the item is in Rice.

#### 23. Dependencies
IMP-01 (framework, runner, wizard), INV-01/04/05 services, `seed_units`, `seed_tax_rates`, NTF-01.

#### 24. Future Enhancements
IMP-03 XLSX + upsert by SKU + bulk price update; INV-12 variant columns; INV-11 location column; image ZIP by SKU (research §A.1); IMP-04 Vyapar/Khatabook mappers.

---

### INV-10 — Barcode scanning (camera) — Phase 2

#### 1. Business Objective
Let phone-only shops scan product barcodes with the camera in item search, item form and billing, removing the need for a USB scanner. Measure: ≥ 25 % of mobile billing sessions on tenants with barcodes use camera scan; decode-to-line ≤ 1.5 s.

#### 2. User Personas
Staff (ST) at the counter with a phone; Owner (OW) adding items.

#### 3. User Stories
1. US-INV-10-1 — As staff I want to tap a camera icon in search and point at a barcode so the item is found.
2. US-INV-10-2 — As staff I want continuous scanning in the invoice editor so each scan adds or increments a line.
3. US-INV-10-3 — As an owner I want to capture a barcode into the item form with the camera.

#### 4. Functional Requirements
1. FR-1 `UbBarcodeScanner` component (feature-specific first, promoted to `Ub*` once used by search, item form and `UbLineItemsEditor`) opens a `UbDrawer` with a `<video>` from `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`.
2. FR-2 Decoding uses the browser-native `BarcodeDetector` API (formats `ean_13`, `ean_8`, `upc_a`, `upc_e`, `code_128`, `code_39`, `qr_code`) when available; otherwise the component shows "Camera scanning not supported on this browser — type the code or use a USB scanner". A JS decoder fallback (e.g. `@zxing/browser`) is **not** in the allowed dependency list and requires **ADR-025** before adoption; this FRD ships native-only.
3. FR-3 On decode the component debounces identical codes for 1.5 s, vibrates (`navigator.vibrate(50)`) and calls the host's `onDetected(code)`; hosts call `GET /items/lookup?barcode=` (same path as HID scanners).
4. FR-4 Continuous mode (editor): drawer stays open, shows a running list of scanned items with quantities, "Done" closes; single mode (search/form): closes on first decode.
5. FR-5 Permission denied → inline explanation and "Open settings" hint; no camera → fallback text.
6. FR-6 Torch toggle when `MediaTrackCapabilities.torch` is supported.

#### 5. Non-Functional Requirements
Decode loop via `requestAnimationFrame` at ≤ 10 fps to save battery; component unmount stops all tracks; works in PWA installed mode; no images leave the device.

#### 6. User Flow
Search → camera icon → drawer → align → beep/vibrate → item opens. Editor → "Scan" → continuous → 3 scans → Done → 3 lines.

#### 7. UI Requirements
`UbDrawer` full-height on mobile with viewfinder overlay (guide box, hairline), torch `MLIconButton`, close; desktop (webcam) 480 px dialog. Redux: none (local state); lookups via existing `lookupItemByBarcode` thunk.

#### 8. UX Requirements
Guide text "Hold steady; fill the box with the barcode"; success flash of the guide box in success tone; unknown code → toast with "Create item" (barcode prefilled).

#### 9. States
Requesting permission → Denied → Unsupported → Scanning → Detected (flash) → Lookup loading → Found/Not found → Closed.

#### 10. Validation Rules
Decoded value 4–48 chars `^[A-Za-z0-9-]+$`; others ignored with a subtle "Not a product barcode".

#### 11. Business Rules
1. BR-1 Camera scan and HID scan converge on the same lookup and same host behaviour (INV-02 FR-6/FR-7).
2. BR-2 Repeated scan of the same code in continuous mode increments qty by 1 (research §A.3).
3. BR-3 QR codes are decoded but only their text is used as a barcode value (no URL following).

#### 12. Permissions
Same as the host feature (`inventory.item.read` for lookup; `sales.invoice.write` etc. for adding lines). No new codename.

#### 13. Edge Cases
1. EC-1 iOS Safari lacks `BarcodeDetector` → unsupported message (until ADR-025).
2. EC-2 Low light → torch hint after 3 s without decode.
3. EC-3 Two barcodes in frame → first decoded wins; guide box narrows the region by cropping the canvas.
4. EC-4 Tab backgrounded → tracks paused via `visibilitychange`.

#### 14. API Requirements
`GET /items/lookup?barcode=` only.

#### 15. Database Impact
None.

#### 16. Audit Requirements
None.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.inventory.camera_scan_opened { host }`, `ub.inventory.camera_scan_result { supported, found, ms_to_decode }`.

#### 19. Security
Camera permission requested only on user action; frames never uploaded; `getUserMedia` requires HTTPS (already required).

#### 20. Performance
≤ 10 fps decode; canvas downscaled to 640 px width.

#### 21. Testing
- T-INV-10-1 unit: debounce identical codes; format filter.
- T-INV-10-2 component: unsupported path renders fallback; permission denied path.
- T-INV-10-3 E2E (Chrome Android emulation with fake device): decode → lookup → line added.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given Chrome Android, when the camera icon is tapped and an EAN-13 is shown, then the item opens within 1.5 s.
- AC-2 (US-2) Given continuous mode, when the same barcode is scanned twice, then the line qty is 2.
- AC-3 (US-3) Given the item form, when scanning, then the barcode field is filled and the duplicate check runs.

#### 23. Dependencies
INV-02 lookup, `useScannerListener` parity, ADR-025 for decoder fallback, PWA (ADR-020).

#### 24. Future Enhancements
Decoder fallback via ADR; batch/serial capture (INV-16/18); label printing (INV-15) to close the loop.

---

### INV-11 — Multi-location & transfers — Phase 2

#### 1. Business Objective
Support businesses with a shop and a godown (or two shops) by tracking on-hand per location and moving stock between them with a numbered transfer document. Measure: wholesalers/distributors enabling ≥ 2 locations ≥ 30 %; zero orphaned in-transit quantities older than 30 days (report).

#### 2. User Personas
Owner (OW) — manages locations, transfers; Staff (ST) — receives transfers; Accountant (AC) — valuation per location.

#### 3. User Stories
1. US-INV-11-1 — As an owner I want to add locations (Shop, Godown) so stock is tracked per place.
2. US-INV-11-2 — As an owner I want to transfer stock from Godown to Shop with a document so both counts are right.
3. US-INV-11-3 — As staff I want to receive an in-transit transfer when goods arrive.
4. US-INV-11-4 — As staff I want every stock-affecting document (bill, invoice, adjustment) to ask which location.

#### 4. Functional Requirements
1. FR-1 `GET/POST /locations` (`inventory_location`: `name`, `code`, `address`, `is_default`, `is_active`); `MAIN` pre-exists; UI reveals the concept when a second location is created (`inventory.locations_enabled` derived, not a setting).
2. FR-2 `POST /stock-transfers` creates `inventory_stock_transfer` (number from sequence kind `stock_transfer`, e.g. `TRF/26-27/0001`) with lines; statuses `draft`, `in_transit`, `received`, `cancelled` (§21.3.6).
3. FR-3 Actions: `POST /stock-transfers/{id}/initiate` (draft → in_transit: posts `transfer_out` at source with `unit_cost` = source `avg_cost`), `POST /stock-transfers/{id}/receive` (in_transit → received: posts `transfer_in` at destination with the same `unit_cost`, applying the weighted-average rule there), `POST /stock-transfers/{id}/cancel` (draft → cancelled; in_transit → cancelled posts `reversal` of the `transfer_out`), and a combined `POST /stock-transfers/{id}/initiate?receive=true` for same-moment transfers (research §A.8 "Transfer and Receive").
4. FR-4 In-transit quantity is Σ `transfer_out` not yet matched by `transfer_in` per transfer; shown on item detail as "In transit: 12 NOS".
5. FR-5 Documents gain a location selector: purchase bills and adjustments one location per document; invoices per document (per-line location deferred); default = user's last used location (localStorage) else `is_default`.
6. FR-6 Item detail shows a per-location table; stock summary/low-stock accept `location_id`; low-stock evaluation is per item × location (reorder point remains per item).
7. FR-7 Negative-stock policy applies per location.

#### 5. Non-Functional Requirements
Transfer post P95 ≤ 600 ms for 50 lines; `inventory_item_stock` rows created lazily per location; UI hides location UI entirely for single-location tenants (no regression for MVP users).

#### 6. User Flow
Settings → Locations → Add "Godown" → Items → item → "Transfer" → drawer (from Godown, to Shop, lines) → Initiate → status in_transit → Shop staff → Transfers → Receive → both counts updated.

#### 7. UI Requirements
Routes `app/settings/locations`, `app/stock/transfers`, `app/stock/transfers/new`, `app/stock/transfers/[id]`. Components: `UbDataGrid` (transfers list with `UbTabs` Draft/In transit/Received), `UbLineItemsEditor` transfer mode (Item · Available at source · Qty), `MLSelect` from/to, `UbStatusBadge` (draft neutral, in_transit info, received success, cancelled muted). Redux: `stockTransferSlice`/`stockTransferThunk` (`fetchTransfers`, `createTransfer`, `initiateTransfer`, `receiveTransfer`, `cancelTransfer`); `locationSlice` (`fetchLocations`, `createLocation`). Yup: `locationSchema`, `stockTransferSchema`.

#### 8. UX Requirements
Transfers are neutral (no red/green money semantics); qty shown with source/destination before→after; receive is one tap with confirmation listing lines.

#### 9. States
Per status badges; list tabs with counts; receive button only in `in_transit`; cancel with `UbReasonDialog`.

#### 10. Validation Rules
`from_location_id ≠ to_location_id` (`same_location`); lines ≥ 1, unique items, qty > 0 with unit decimal rule; availability at source per policy (`insufficient_stock` details); location `code` `^[A-Z0-9_]{2,12}$` unique; cannot deactivate a location with non-zero stock (`stock_nonzero`) or the default one (`default_location`).

#### 11. Business Rules
1. BR-1 Transfer value is cost-neutral: destination inbound uses the source `avg_cost` snapshot; tenant-level valuation is unchanged (except when destination `on_hand ≤ 0` triggers the reset rule — still cost-neutral because the incoming cost is used).
2. BR-2 Only one `is_default` location; documents default to it.
3. BR-3 Receiving posts the full transferred quantity; partial receipt is not supported (cancel and re-issue).
4. BR-4 `movement_type` codes: `transfer_out`/`transfer_in`; reversal on cancel.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Manage locations | `inventory.location.manage` | ✅ | ✅ | ❌ | ❌ |
| Create/initiate/cancel transfer | `inventory.stock.adjust` | ✅ | ✅ | override | ❌ |
| Receive transfer | `inventory.stock.adjust` | ✅ | ✅ | override | ❌ |
| View | `inventory.stock.read` | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. EC-1 Item sold from Shop while in transit → Shop availability excludes in-transit qty (not yet received).
2. EC-2 Cancel in_transit → `reversal` of `transfer_out` restores source; avg unchanged (rule).
3. EC-3 Location deactivated with in-transit outbound → blocked until received/cancelled.
4. EC-4 MVP data: all existing rows are at `MAIN`; enabling a second location needs no migration.

#### 14. API Requirements
`GET/POST /locations`, `PATCH /locations/{id}`; `GET/POST /stock-transfers`, `GET /stock-transfers/{id}`, `POST /stock-transfers/{id}/initiate|receive|cancel`. Errors: 400 `same_location`, 409 `insufficient_stock`, `stock_nonzero`, `default_location`, `invalid_transition`. Existing endpoints accept `location_id` (`/items/{id}` stock array already per location).

#### 15. Database Impact
`inventory_location`, `inventory_stock_transfer`, `inventory_stock_transfer_line`, `inventory_stock_movement` (`transfer_*`), `inventory_item_stock` per location, sequence kind `stock_transfer`, audit. `PATCH /locations/{id}` is a path addition (CCR-02 scope).

#### 16. Audit Requirements
`location.created/updated`, `transfer.created/initiated/received/cancelled` with lines.

#### 17. Notifications
In-app `transfer_in_transit` to members at destination ("Transfer TRF/26-27/0001 on its way — 5 items").

#### 18. Analytics / Event Tracking
`ub.inventory.location_created`, `ub.inventory.transfer_initiated { lines, combined }`, `ub.inventory.transfer_received { days_in_transit }`.

#### 19. Security
Tenant scoping; location ids validated; per-location restrictions per user (research §A.7) not in scope.

#### 20. Performance
Locks source and destination stock rows ordered by (item_id, location_id); ≤ 50 lines.

#### 21. Testing
- T-INV-11-1 unit: transfer cost neutrality incl. destination reset case.
- T-INV-11-2 API: state transitions and invalid ones (409).
- T-INV-11-3 API: cancel in_transit posts reversal; source restored.
- T-INV-11-4 E2E: two-location flow on mobile.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given owner adds "Godown", when saved, then item detail shows per-location stock and documents show a location selector.
- AC-2 (US-2) Given 20 NOS at Godown avg ₹44, when 12 are transferred and received, then Godown 8, Shop +12 at ₹44, tenant value unchanged.
- AC-3 (US-3) Given in_transit, when staff receives, then status `received` and Shop on-hand increases.
- AC-4 (US-4) Given two locations, when a purchase bill is recorded, then movements post at the chosen location.

#### 23. Dependencies
INV-03/06/08, PUR-01, SAL-02 location selector, sequence kind `stock_transfer`, `inventory.location.manage`.

#### 24. Future Enhancements
Per-line location on invoices; partial receipts; user–location restrictions; bins (research §A.7) — not planned.

---
### INV-12 — Item variants — Phase 2

#### 1. Business Objective
Let apparel, footwear and similar shops manage one product with size/colour variants, each with its own SKU, barcode and stock, without creating dozens of unrelated items. Measure: tenants with `business_type=retail` using variants have ≤ 50 % as many top-level items as comparable tenants without.

#### 2. User Personas
Owner (OW) — defines attributes/variants; Staff (ST) — picks a variant while billing.

#### 3. User Stories
1. US-INV-12-1 — As an owner I want to mark an item "has variants" and define attributes (Size: S/M/L; Colour: Red/Blue) so variants are generated.
2. US-INV-12-2 — As an owner I want each variant to have its own SKU, barcode, optional price override and stock.
3. US-INV-12-3 — As staff I want to search "T-shirt" and pick "M / Red" in the editor, or scan the variant barcode directly.

#### 4. Functional Requirements
1. FR-1 `PATCH /items/{id}` with `has_variants: true` (allowed only when the item has no movements/lines; otherwise 409 `item_has_movements`) converts the item into a parent; parent stock rows are not used.
2. FR-2 `GET/POST /items/{id}/variants`, `PATCH /items/{id}/variants/{vid}`, `POST …/archive` on `inventory_item_variant` (`attributes jsonb`, `sku`, `barcode`, price overrides `selling_price`, `purchase_price`, `mrp` nullable).
3. FR-3 Variant generator UI: attributes (≤ 3) × options (≤ 20 each) → cartesian preview (≤ 100 variants) with auto-SKU `<parent-prefix>-<OPT1>-<OPT2>` (e.g. `TSHIRT-M-RED`, truncated per INV-01 BR-2 rules, unique) and "copy price to all".
4. FR-4 Stock, movements, `inventory_item_stock` and document lines carry `variant_id`; opening stock and adjustments are per variant; list/summary show parent rows expandable to variants with per-variant on-hand; parent shows Σ.
5. FR-5 Barcode/SKU lookup searches variants first (variant barcode unique per tenant across items and variants).
6. FR-6 `UbAsyncCombobox` returns parent hits with a secondary variant picker (chips per attribute) before adding the line.
7. FR-7 Low-stock evaluates per variant using the parent's `reorder_point`.

#### 5. Non-Functional Requirements
Variant generation client-side; batch create in one POST (`variants[]`); ≤ 100 variants per parent.

#### 6. User Flow
Item form → "Contains variants" → attributes Size, Colour → options → Generate → grid (SKU, barcode, price, opening stock) → Save.

#### 7. UI Requirements
`ItemVariantsSection` in item form and `VariantsTab` on item detail (`UbDataGrid` compact: Variant · SKU · Barcode · Price · On hand); mobile: variants as cards. Redux: `itemDetailSlice.variants`, thunks `fetchVariants`, `saveVariants`. Yup: `variantSchema`.

#### 8. UX Requirements
Variant label rendered as attribute values joined with " / " (e.g. "M / Red"); parent name + variant label on document lines (`description` snapshot "T-shirt — M / Red").

#### 9. States
Generation preview; saving; per-variant validation errors in grid cells; archived variants hidden.

#### 10. Validation Rules
Attribute names unique, 1–20 chars; options unique per attribute; variant `sku`/`barcode` unique across tenant (items ∪ variants) — `duplicate_sku`/`duplicate_barcode`; price overrides ≥ 0; ≤ 100 variants (`too_many_variants`).

#### 11. Business Rules
1. BR-1 Parent holds shared fields (name, unit, HSN, tax, default prices, reorder point); variants override identifiers and prices only.
2. BR-2 Uniqueness of `inventory_item.barcode`/`sku` and `inventory_item_variant.barcode`/`sku` is enforced across both tables in the service (two partial unique indexes exist per table; cross-table check in code).
3. BR-3 Converting to variants is irreversible once any variant has movements ("Mark as single item" only while no movements).
4. BR-4 Weighted average is per variant × location.

#### 12. Permissions
`inventory.item.write` (define), `inventory.item.read` (view), `inventory.stock.adjust` (variant opening/adjust) — same matrix as INV-01/06.

#### 13. Edge Cases
1. EC-1 Adding an option later → new variants generated only for the new combinations.
2. EC-2 Variant archived with stock → blocked (`stock_nonzero`).
3. EC-3 Scanning a variant barcode in continuous mode → adds the variant line directly.
4. EC-4 Import (IMP-03) variants deferred; MVP items template unaffected.

#### 14. API Requirements
`GET/POST /items/{id}/variants` (batch POST `{ attributes: [ { name, options[] } ], variants: [ { attributes: {Size:"M",Colour:"Red"}, sku?, barcode?, selling_price?, purchase_price?, mrp?, opening_stock? } ] }`), `PATCH /items/{id}/variants/{vid}`, `POST /items/{id}/variants/{vid}/archive|restore` (path additions — CCR-02 scope). Item list rows gain `variant_count`, `on_hand` as Σ variants. `GET /items/lookup?barcode=` returns `{ item, variant }`.

#### 15. Database Impact
`inventory_item.has_variants`, `inventory_item_variant`, `variant_id` on `inventory_item_stock`, `inventory_stock_movement`, `sales_document_line`, `purchases_document_line`. Parent's `attributes` definition stored in `inventory_item.description`? No — stored in variant rows only; the attribute list is derived from distinct keys/values (no new column).

#### 16. Audit Requirements
`item.variants_defined`, `variant.created/updated/archived`.

#### 17. Notifications
Low-stock per variant (INV-07).

#### 18. Analytics / Event Tracking
`ub.inventory.variants_generated { attributes, variants }`, `ub.inventory.variant_picked { via: search|scan }`.

#### 19. Security
Tenant scoping; parent/variant relation validated (variant of another item → 404).

#### 20. Performance
Batch create; list aggregates Σ on-hand with one grouped query.

#### 21. Testing
- T-INV-12-1 unit: cartesian generation and SKU derivation; cap 100.
- T-INV-12-2 API: cross-table barcode uniqueness; convert with movements → 409.
- T-INV-12-3 API: movement posting with `variant_id`; parent Σ.
- T-INV-12-4 E2E: bill a variant via search and via scan.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given attributes Size {S,M} and Colour {Red}, when generated, then two variants `TSHIRT-S-RED`, `TSHIRT-M-RED` exist.
- AC-2 (US-2) Given variant opening stock 5 each, when the item detail opens, then parent shows 10 and each variant 5.
- AC-3 (US-3) Given the editor, when staff scans the M/Red barcode, then the line reads "T-shirt — M / Red".

#### 23. Dependencies
INV-01/02/03/05/06/07, SAL-02/PUR-01 line `variant_id`, INV-10 optional.

#### 24. Future Enhancements
Variant matrix ordering (research §A.2), per-variant images, IMP-03 variant import, price lists per variant (INV-13).

---

### INV-13 — Price lists — Phase 2

#### 1. Business Objective
Allow wholesalers to bill different customers at different prices (retail vs wholesale vs dealer) without editing lines manually, reducing errors and disputes. Measure: ≥ 60 % of invoice lines for parties with a price list use the list price unmodified.

#### 2. User Personas
Owner (OW) — defines lists and assigns to parties; Staff (ST) — bills with the right prices automatically.

#### 3. User Stories
1. US-INV-13-1 — As an owner I want named price lists (Retail, Wholesale) with a price per item.
2. US-INV-13-2 — As an owner I want to assign a default price list to a party so their invoices use it.
3. US-INV-13-3 — As staff I want to switch the price list on an invoice when needed and see prices update.
4. US-INV-13-4 — As an owner I want to create a list as a % markdown from selling price and then fine-tune items.

#### 4. Functional Requirements
1. FR-1 `GET/POST /price-lists`, `GET/PATCH /price-lists/{id}`, `PUT /price-lists/{id}/items` (bulk upsert of `[ { item_id, variant_id?, price } ]`) on `inventory_price_list` / `inventory_price_list_item`.
2. FR-2 List creation options: empty; copy from another list; **derive** as `selling_price × (1 ± pct/100)` with rounding rule `none | nearest_1 | nearest_10 | ends_99` (research §A.23) — derivation is a one-time fill, not a live formula.
3. FR-3 `parties_party.price_list_id` set via PTY-01 form ("Default price list").
4. FR-4 In SAL-01/SAL-02 editors a `price_list_id` selector defaults to the party's list (else the tenant default list, else none); adding an item takes `price_list_item.price` when present, else `item.selling_price`; changing the selector re-prices lines not manually edited (dirty flags per line).
5. FR-5 Line snapshot stores the effective `unit_price`; the document `meta.price_list_id` records which list was used.
6. FR-6 Price-list prices respect `tax_inclusive_selling` of the item (they are in the same basis as `selling_price`).
7. FR-7 Item detail gets a "Prices" tab listing the item's price across lists with inline edit.

#### 5. Non-Functional Requirements
Editor pricing lookups batched: `GET /price-lists/{id}/items?item_ids=` for the lines present; lists ≤ 10 per tenant, ≤ 10k items each.

#### 6. User Flow
Settings → Price lists → New "Wholesale" → derive −12 % from selling, round to ₹1 → save → open list grid → tweak Rice to ₹430 → Party Ramesh → default list Wholesale → new invoice for Ramesh → lines priced from Wholesale.

#### 7. UI Requirements
Routes `app/settings/price-lists`, `app/settings/price-lists/[id]`. Components: `UbDataGrid` editable price column (`UbMoneyInput` inline), derive dialog (`UbDialog`: pct `UbPercentInput`, direction markup/markdown, rounding `MLSelect`), editor selector `MLSelect` "Price list". Redux: `priceListSlice`/`priceListThunk` (`fetchPriceLists`, `createPriceList`, `savePriceListItems`, `fetchPricesForItems`). Yup: `priceListSchema`.

#### 8. UX Requirements
Show base selling price beside list price with delta %; lines re-priced show a brief highlight; label "Price list: Wholesale" on the invoice editor header (not printed unless setting).

#### 9. States
Empty (no lists) → CTA; grid loading; saving cell; conflict (`stale_version`) on list PATCH.

#### 10. Validation Rules
Name 1–60 unique; price ≥ 0 ≤ 2 dp; one `is_default` list; pct 0–90 for markdown, 0–500 for markup; item ids exist.

#### 11. Business Rules
1. BR-1 Resolution order for line price: manual edit > selected list price > item selling price.
2. BR-2 Price lists never affect purchase costs or valuation.
3. BR-3 Deleting a list (P2 `DELETE /price-lists/{id}`) clears `party.price_list_id` referencing it (SET NULL) and leaves documents untouched.
4. BR-4 Price lists are sales-only at this phase (purchase lists per research §A.23 not planned).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Manage lists | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Assign to party | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Switch list on a document | `sales.invoice.write` | ✅ | ✅ | ✅ | ❌ |

#### 13. Edge Cases
1. EC-1 Item missing from the list → falls back to selling price with a muted "base price" hint on the line.
2. EC-2 Party list archived/deleted → editor defaults to tenant default.
3. EC-3 Estimate converted to invoice keeps its line prices (snapshots), regardless of list changes.
4. EC-4 `ends_99` rounding on ₹0.50 → ₹0.99? Rule: `ends_99` = floor to whole rupee then −0.01, min ₹0.99.

#### 14. API Requirements
`GET/POST /price-lists`, `GET/PATCH /price-lists/{id}`, `PUT /price-lists/{id}/items`, `GET /price-lists/{id}/items?item_ids=`; `POST /price-lists/{id}/derive { pct, direction, rounding, source: selling_price|list_id }` (path additions within the canon `/price-lists` P2 surface). Sales editors accept `price_list_id` in POST/PATCH body.

#### 15. Database Impact
`inventory_price_list`, `inventory_price_list_item`, `parties_party.price_list_id`, `sales_document.meta.price_list_id`.

#### 16. Audit Requirements
`price_list.created/updated`, `price_list.items_updated { count }`, `party.updated` (price_list_id).

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.inventory.price_list_created { derived, rounding }`, `ub.sales.price_list_applied { source: party|manual|default }`.

#### 19. Security
Tenant scoping; bulk upsert capped at 2,000 items per request.

#### 20. Performance
Bulk upsert via `INSERT … ON CONFLICT (price_list_id, item_id, variant_id) DO UPDATE`; batched price fetch.

#### 21. Testing
- T-INV-13-1 unit: derive and rounding rules table.
- T-INV-13-2 API: bulk upsert; default list uniqueness.
- T-INV-13-3 API: invoice line pricing resolution order.
- T-INV-13-4 E2E: party default list drives invoice prices; manual switch re-prices non-dirty lines.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given list "Wholesale" with Rice ₹430, when viewed, then base ₹450 and −4.4 % are shown.
- AC-2 (US-2) Given Ramesh default Wholesale, when a new invoice adds Rice, then unit price is ₹430.
- AC-3 (US-3) Given the invoice, when the list is switched to Retail, then unedited lines re-price and edited ones keep their value.
- AC-4 (US-4) Given derive −12 % round to ₹1 from selling ₹450, then the list price is ₹396.

#### 23. Dependencies
PTY-01 (`price_list_id`), SAL-01/02 editors, INV-01 pricing basis.

#### 24. Future Enhancements
Volume tiers, per-location lists, purchase price lists (research §A.23), price-list-based labels (INV-15).

---

### INV-14 — Secondary units & conversions — Phase 2

#### 1. Business Objective
Let traders buy in boxes and sell in pieces (or buy in quintals and sell in kg) while stock stays in one primary unit, matching how Vyapar/myBillBook users work (research §C.5). Measure: ≥ 50 % of wholesale tenants set a secondary unit on ≥ 10 items; zero stock discrepancies from conversions (exact decimal arithmetic).

#### 2. User Personas
Owner (OW) — sets conversions; Staff (ST) — enters quantities in either unit.

#### 3. User Stories
1. US-INV-14-1 — As an owner I want to say 1 BOX = 12 NOS for an item so I can buy boxes and sell pieces.
2. US-INV-14-2 — As staff I want to type "2 BOX" on a purchase bill and see 24 NOS added to stock.
3. US-INV-14-3 — As staff I want the invoice to print the unit the customer bought in.

#### 4. Functional Requirements
1. FR-1 Item form gains `secondary_unit_id` and `conversion_factor` (`numeric(12,4)`, "1 secondary = N primary"); both or neither.
2. FR-2 `UbLineItemsEditor` shows a unit toggle per line for items with a secondary unit; the entered quantity and unit are converted to primary for stock: `qty_primary = qty_entered × conversion_factor` when entered in secondary; 3 dp half-up.
3. FR-3 Line columns: `qty` stored in **primary** unit (movement basis); `unit_code` snapshot = the unit the user chose; `meta`-free — to print the entered quantity the line also stores `unit_price` per **entered** unit: when entered in secondary, `unit_price` is per secondary unit and `qty` is the entered quantity in secondary; the movement qty is derived `qty × conversion_factor`. Decision: **lines store what was entered (`qty`, `unit_code`, `unit_price`); movements store primary quantity.** The line→movement conversion uses the factor snapshotted at posting time.
4. FR-4 Unit cost for weighted average on purchase = `taxable_value / qty_primary` (per primary unit).
5. FR-5 Price lists/selling price remain per primary unit; secondary price default = `selling_price × conversion_factor` (overridable on the line).
6. FR-6 Item detail shows on-hand as "48 NOS (4 BOX)".
7. FR-7 Import template (IMP-03) adds `secondary_unit`, `conversion_factor`.

#### 5. Non-Functional Requirements
Conversions with `decimal.js-light` on the client and `Decimal` on the server; identical rounding.

#### 6. User Flow
Item Rice: primary KGS, secondary BAG = 25 → purchase bill 4 BAG @ ₹1,000 → stock +100 KGS at ₹40/KGS → invoice 2.5 KGS.

#### 7. UI Requirements
Item form "Units" section: Primary (existing), Secondary (`UbCombobox`), factor (`UbQuantityInput` 4 dp) with live sentence "1 BAG = 25 KGS". Editor: unit toggle (`MLToggleGroup` KGS/BAG) inside the qty cell; hint under qty "= 100 KGS". Yup: `secondaryUnitSchema` (conditional).

#### 8. UX Requirements
Always show the primary equivalent when secondary chosen; print shows entered unit and, when setting `documents.show_primary_qty` (P2 setting proposal, optional), the equivalent in brackets.

#### 9. States
Toggle hidden without secondary unit; factor locked once movements exist (see BR-3).

#### 10. Validation Rules
`conversion_factor` > 0, ≤ 4 dp, ≠ 1 (`factor_one`); secondary ≠ primary (`same_unit`); primary decimal rule applies to the **converted** quantity (e.g. 0.5 BOX × 12 = 6 NOS valid; 0.3 BOX × 12 = 3.6 NOS invalid for NOS → `qty_must_be_whole`).

#### 11. Business Rules
1. BR-1 Stock, reorder point, avg cost and valuation are always in the primary unit.
2. BR-2 GST UQC on the invoice is the entered unit's code (both must be valid UQC or CCR-03 mapping).
3. BR-3 Changing `conversion_factor` after movements exist is allowed (it only affects future conversions) but shows a warning; documents keep snapshots.
4. BR-4 A line entered in secondary with a decimal that yields a non-whole primary quantity for a non-decimal unit is rejected (Validation above).

#### 12. Permissions
`inventory.item.write` to set units; editing lines per document permissions.

#### 13. Edge Cases
1. EC-1 Item with `allow_decimal=false` secondary (BOX) and factor 12.5 → allowed only if primary allows decimals.
2. EC-2 Purchase in BAG, return in KGS → debit note line in KGS; movement in KGS regardless.
3. EC-3 Price list price is per primary; the secondary line price is derived and rounded to 2 dp.

#### 14. API Requirements
Item fields `secondary_unit_id`, `conversion_factor` on `POST/PATCH /items`; document lines accept `unit_code` ∈ {primary, secondary} with `qty` in that unit; responses add `qty_primary` (derived). No new endpoints.

#### 15. Database Impact
`inventory_item.secondary_unit_id`, `conversion_factor`; lines unchanged (`qty`, `unit_code`, `unit_price`); movements in primary.

#### 16. Audit Requirements
`item.updated` (units fields).

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.inventory.secondary_unit_set`, `ub.documents.line_entered_secondary { doc_kind }`.

#### 19. Security
None beyond scoping.

#### 20. Performance
None significant.

#### 21. Testing
- T-INV-14-1 unit: conversion rounding; whole-number rule on converted qty.
- T-INV-14-2 API: purchase in secondary → movement primary qty and avg per primary.
- T-INV-14-3 API: invoice in secondary prints entered unit; stock deducted in primary.
- T-INV-14-4 E2E: toggle in editor shows equivalent.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given 1 BOX = 12 NOS, when saved, then item detail shows "48 NOS (4 BOX)" for 48 on hand.
- AC-2 (US-2) Given purchase line 2 BOX @ ₹480, when recorded, then movement +24 NOS at unit cost ₹40.0000.
- AC-3 (US-3) Given invoice line 1 BOX, when printed, then qty "1 BOX" and UQC BOX appear.

#### 23. Dependencies
INV-01/04, PUR-01, SAL-02, CCR-03 (UQC mapping for custom units).

#### 24. Future Enhancements
Multiple alternate units; barcode per unit (case vs each); price per secondary in price lists.

---

### INV-15 — Barcode label printing — Phase 2

#### 1. Business Objective
Let shops print shelf/product labels with barcode, name, price and MRP so items without manufacturer barcodes can be scanned at the counter. Measure: ≥ 20 % of tenants with scanning enabled print labels; zero external services (client-side print per ADR-014).

#### 2. User Personas
Owner (OW) — prints labels; Staff (ST) — prints for newly received goods.

#### 3. User Stories
1. US-INV-15-1 — As an owner I want to select items and quantities and print labels on A4 sticker sheets or a 50×25 mm roll.
2. US-INV-15-2 — As an owner I want items without a barcode to get an internal barcode generated so labels are scannable.
3. US-INV-15-3 — As staff I want to print labels for all lines of a purchase bill just received.

#### 4. Functional Requirements
1. FR-1 Label print view is a React print component (client-side `window.print()`), templates `a4_65` (65 labels, 38.1×21.2 mm), `a4_24` (24 labels, 70×37 mm), `roll_50x25`, `roll_38x25`; margins/offsets configurable in a dialog and persisted per tenant in `platform_tenant_setting` key `labels.templates` (new well-known key — CCR-05).
2. FR-2 Barcode rendering: in-house SVG generator `UbBarcode` supporting **Code128 (B/C auto)** and **EAN-13** (validates/computes check digit); no third-party library (same approach as `UbQrCode`).
3. FR-3 Items with no `barcode` get an internal code on demand: `POST /items/{id}/generate-barcode` assigns `2` + 11 digits (in-store EAN-13 prefix 20–29: `20` + zero-padded per-tenant sequence + check digit) — path addition (CCR-02 scope); the value is stored in `inventory_item.barcode` and is unique.
4. FR-4 Label content options: name (2 lines max), variant label, selling price (₹ with "incl. GST" when inclusive), MRP, SKU, tenant name; font sizes auto-fit.
5. FR-5 Entry points: item list bulk action "Print labels", item detail, purchase bill detail ("Labels for received items" pre-filling quantities = line qty).
6. FR-6 Print queue dialog: rows Item · Qty (labels) · Barcode value (with "Generate" when missing) → Preview → Print.

#### 5. Non-Functional Requirements
Preview renders ≤ 500 labels in ≤ 1 s; print CSS `@page` size per template; works on mobile via browser print/share-to-PDF; Hindi names render with Devanagari fallback font.

#### 6. User Flow
Bill recorded → "Print labels" → dialog lists lines with qty → 2 items lack barcode → Generate → Preview A4 65 → Print.

#### 7. UI Requirements
`LabelPrintDialog` (`UbDialog` wide), `LabelPreview` print component (`app/print/labels/page.tsx` opened in a new tab with state passed via `sessionStorage`), template `MLSelect`, offset inputs, `UbBarcode` SVG. Redux: none beyond item fetch; thunk `generateItemBarcode`. Yup: `labelPrintSchema` (qty per row 1–500).

#### 8. UX Requirements
Preview shows one sheet with a page count; a "Test print alignment" option prints outlines only.

#### 9. States
Missing barcodes flagged; generating; preview loading; print dialog handed to browser.

#### 10. Validation Rules
Total labels ≤ 2,000 per job; EAN-13 input must be 12/13 digits with valid check digit; Code128 values ASCII 32–126.

#### 11. Business Rules
1. BR-1 Generated internal barcodes use EAN-13 with prefix `20` (in-store range) and never collide with manufacturer codes.
2. BR-2 Existing barcode values are printed as Code128 unless they are valid EAN-13/UPC-A (printed as EAN-13/UPC-A) so scanners read them as the manufacturer intended.
3. BR-3 Prices on labels are the current item prices (or the selected price list price — INV-13) at print time; no snapshot.

#### 12. Permissions
`inventory.item.read` to print; `inventory.item.write` to generate barcodes.

#### 13. Edge Cases
1. EC-1 Very long names → 2-line clamp with ellipsis.
2. EC-2 Variants (INV-12) → one label per variant with variant label.
3. EC-3 Printer scaling ("fit to page") misaligns → alignment test and offset settings.
4. EC-4 Barcode value with lowercase letters → Code128 set B handles it.

#### 14. API Requirements
`POST /items/{id}/generate-barcode` → 200 `{ barcode }` (409 `barcode_exists` when the item already has one). Sequence via `platform_document_sequence` kind `barcode`? — no such kind; use a tenant setting counter `labels.next_internal_barcode` (CCR-05) allocated with `SELECT … FOR UPDATE` on the setting row.

#### 15. Database Impact
`inventory_item.barcode`, `platform_tenant_setting` (`labels.templates`, `labels.next_internal_barcode`).

#### 16. Audit Requirements
`item.barcode_generated`.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.inventory.labels_printed { template, labels, items }`, `ub.inventory.barcode_generated`.

#### 19. Security
Client-side only; no external calls.

#### 20. Performance
SVG barcodes are light (≤ 2 KB each); 500 labels ≈ 1 MB DOM — acceptable.

#### 21. Testing
- T-INV-15-1 unit: EAN-13 check digit; Code128 B/C encoding against known vectors.
- T-INV-15-2 API: generate barcode uniqueness and 409.
- T-INV-15-3 component: template grid geometry snapshot.
- T-INV-15-4 E2E: labels from purchase bill; scan of printed barcode (manual QA).

#### 22. Acceptance Criteria
- AC-1 (US-1) Given 3 items with quantities 10/5/1, when printed on `a4_65`, then 16 labels render on one sheet in the correct grid.
- AC-2 (US-2) Given an item without barcode, when Generate is tapped, then a valid EAN-13 starting with 20 is stored and rendered.
- AC-3 (US-3) Given a recorded bill with 4 lines, when "Print labels" is opened, then quantities default to the line quantities.

#### 23. Dependencies
INV-01/02, PUR-01, INV-12/13 optional, ADR-014 (client-side print), CCR-05 setting keys.

#### 24. Future Enhancements
QR labels with price-list encoding (research §A.3), batch/expiry on labels (INV-16), custom label designer — not planned.

---
## 17.7 Purchases (PUR)

### 17.7.0 Conventions shared by the PUR features

Frontend features `purchase-bills` (`purchaseBillListSlice`/`purchaseBillListThunk` → `fetchPurchaseBillList`; `purchaseBillEditorSlice`/`purchaseBillEditorThunk` → `createPurchaseBill`, `updatePurchaseBill`, `recordPurchaseBill`, `voidPurchaseBill`, `fetchPurchaseBill`; service `api/purchaseBillService.ts`), `supplier-payments` (thunk `recordSupplierPayment` calling the payments feature's `paymentService.ts`), Phase 2 `purchase-orders`, `debit-notes`. Paths: `API_PATHS.PURCHASE_BILLS`, `PURCHASE_BILL_BY_ID(id)`, `PURCHASE_BILL_RECORD(id)`, `PURCHASE_BILL_VOID(id)`, `PAYMENTS`, `PAYMENT_VOID(id)`, P2 `PURCHASE_ORDERS`, `PURCHASE_ORDER_RECEIVE(id)`, `DEBIT_NOTES`. Yup: `purchaseBillSchema`, `purchaseBillLineSchema`, `supplierPaymentSchema`, `voidReasonSchema`, P2 `purchaseOrderSchema`, `goodsReceiptSchema`, `debitNoteSchema`, `landedCostSchema`. Backend app `purchases`: `services/bill_service.py` (`create_draft`, `update_draft`, `compute_totals`, `record_bill`, `void_bill`, `inbound_unit_cost`), `services/order_service.py` (P2), `services/debit_note_service.py` (P2); ledger posting through `ledger.services.post_entry`; stock through `inventory.services.stock_service`; payments through `payments.services.payment_service.record_payment`.

**Tax computation for purchase lines (same engine as sales, `tax.services.compute_line`).** `rate = tax_rate.rate for (tax_code, document_date)`; `gross = qty × unit_cost` (4 dp intermediate); line discount `percent` → `discount_amount = round2(gross × pct/100)`, `amount` → as given; `taxable_value = round2(gross − discount_amount)`; document discount apportioned to lines pro rata by `taxable_value` (2 dp, remainder to the last line) **before** tax; `is_inter_state = supplier state ≠ tenant state_code` (supplier state = `party.state_code`, else first two digits of `party.gstin`, else tenant state → intra); intra: `cgst = sgst = round2(taxable × rate/200)`; inter: `igst = round2(taxable × rate/100)`; `cess = round2(taxable × cess_rate/100)`; `line_total = taxable + taxes`; document totals are sums of line values; `round_off` to nearest rupee when `documents.round_off` setting is on (default on) — signed, `numeric(6,2)`; `grand_total = Σ line_total + round_off`. Half-up everywhere (ADR-010).

**Inbound unit cost for valuation (normative).** `itc_claimable = tenant.gst_type == 'regular' AND bill.itc_eligible`. Per line: `cost_base = taxable_value_after_doc_discount` if `itc_claimable` else `line_total` (tax is a cost when it cannot be claimed); `inbound_unit_cost = round4(cost_base / qty_primary)` (+ landed share, PUR-08). Worked example (tenant Maharashtra `27`, `regular`; supplier GSTIN `27…` → intra-state; `GST5`): line 1 Rice 20 NOS @ ₹46 → taxable 920.00, CGST 23.00, SGST 23.00, total 966.00, cost 920/20 = **46.0000**; line 2 Sugar 50 KGS @ ₹38, discount 2 % → gross 1900.00, discount 38.00, taxable 1862.00, CGST 46.55, SGST 46.55, total 1955.10, cost 1862/50 = **37.2400**. Subtotal 2782.00, taxes 139.10, Σ 2921.10, round_off −0.10, grand 2921.00. If `itc_eligible=false`: Rice cost 966/20 = 48.3000, Sugar 1955.10/50 = 39.1020.

**Supplier ledger directions (canon §0.2).** Purchase bill → `credit` (business owes more; `entry_type=purchase_bill`); supplier payment → `debit` (`payment_out`); debit note → `debit` (`debit_note`); void → `reversal` with the opposite direction. Party balance negative = "You will give".

---

### PUR-01 — Purchase bill entry

#### 1. Business Objective
Record what the business bought so that stock rises at the right cost, the supplier's khata shows what is owed, and GST inward figures are ready for ITC — in one action, atomically. Measures: median time to record a 5-line bill ≤ 90 s (mobile); 100 % of recorded bills have matching stock movements and ledger entry (CI invariant); duplicate supplier invoices blocked (409 rate tracked).

#### 2. User Personas
Owner (OW) — records bills, decides payment; Staff (ST) — records bills on delivery; Accountant (AC) — reviews GST/ITC fields.

#### 3. User Stories
1. US-PUR-01-1 — As an owner I want to enter a supplier bill with items, quantities and costs so my stock and payable update together.
2. US-PUR-01-2 — As staff I want to pick the supplier and items by search or scan so entry is fast.
3. US-PUR-01-3 — As an owner I want to pay part or all of the bill on the spot (cash/UPI/bank) and have the rest go to the supplier's khata.
4. US-PUR-01-4 — As an owner I want to be warned if I enter the same supplier invoice twice.
5. US-PUR-01-5 — As an accountant I want the supplier's invoice number/date, GST breakup and ITC eligibility captured for GSTR-3B.
6. US-PUR-01-6 — As an owner I want to attach a photo of the paper bill.
7. US-PUR-01-7 — As staff I want to save a draft when the delivery is interrupted and finish later.
8. US-PUR-01-8 — As an owner I want a new item created inline when the supplier brings something new.

#### 4. Functional Requirements
1. FR-1 `POST /purchases/bills` creates a `draft` `purchases_document` (`kind=purchase_bill`) with lines; `PATCH /purchases/bills/{id}` edits drafts (requires `version`); `POST /purchases/bills/{id}/record` posts it; `POST /purchases/bills?record=true` with `Idempotency-Key` creates and records atomically (mirror of sales `issue=true`).
2. FR-2 Header fields: supplier (`party_id`, must have `is_supplier=true`; choosing a customer-only party offers "Mark as supplier too" which PATCHes the party), `supplier_invoice_number` (≤ 48), `supplier_invoice_date`, `document_date` (default today), `due_on` (default `document_date + party.credit_days`; when the party has no `credit_days`, `due_on = document_date` — there is no purchases-specific due-days setting in canon), `reverse_charge`, `itc_eligible` (default `true` for `regular`; hidden and `false` for others), `notes`, `attachment_id` (`bill_photo`).
3. FR-3 Lines (`UbLineItemsEditor` purchase mode): item (search/scan/create inline), description (snapshot, editable), qty (decimal rule), unit (item unit; secondary in P2), unit cost (`unit_cost`, 4 dp, default = item `purchase_price`), discount (% or ₹), tax code (default item `tax_code`; editable per line because supplier bills may differ), computed taxable, tax, line total. Free-text lines without `item_id` are allowed for services/expenses on a bill when setting `documents.allow_free_text_lines` (existing sales rule §21.3.7) — such lines post no stock.
4. FR-4 Document discount (% or ₹), round-off toggle, `UbTotalsPanel` live preview (client) — server recomputes and is authoritative (§0.11 rule 3).
5. FR-5 Payment section (optional): "Paid now" with `mode_breakup[]` (cash/upi/bank/cheque/card/other, amount, reference) — Σ ≤ grand_total; remainder shown as "To supplier khata ₹X".
6. FR-6 **Record** (`record_bill`, one `transaction.atomic()`): (a) validate; (b) allocate `number` from sequence kind `purchase_bill` (`PB/26-27/0007`); (c) snapshot `party_snapshot`, `supplier_gstin_snapshot`, `place_of_supply_state = tenant.state_code`, `is_inter_state`; (d) compute totals; (e) for each stock line post `purchase_in` (qty in primary unit, `unit_cost = inbound_unit_cost`, `movement_date = document_date`, `source_type='purchase_document'`) updating `inventory_item_stock` by the weighted-average rule of §17.6.0 — and where `document_date` is earlier than the item's latest movement date (the bill that arrives after the goods, which FR-2 and EC-3 both permit), the movement is a non-tail insert: quantity applies immediately, the average does not, the row is marked `cost_state='stale'` and one `inventory.recompute_item_cost` is enqueued per affected item and location; (f) update `inventory_item.purchase_price = inbound_unit_cost` (last cost); (g) post ledger `credit` `amount = grand_total`, `entry_type = purchase_bill`, `entry_date = document_date`, `source_type = purchase_document`; (h) if payment given: `payment_service.record_payment(direction='out', party, mode_breakup, allocations=[{purchase_document, bill, amount}])` which posts ledger `debit` `payment_out` and updates `amount_paid/amount_due`; (i) set status `recorded` / `partially_paid` / `paid`; (j) audit `purchase_bill.recorded`; (k) enqueue low-stock re-evaluation is not needed (inbound) — skip; (l) return the full document.
7. FR-7 Duplicate check: on blur of `supplier_invoice_number` the client calls `GET /purchases/bills?party_id=&supplier_invoice_number=&status=!void` (filter delta) and warns inline "Already recorded as PB/26-27/0003 on 12/08/2026"; the server enforces the partial unique index and returns 409 `duplicate_supplier_invoice` with `details.existing: { id, number, document_date }`.
8. FR-8 Draft autosave every 10 s when dirty (PATCH) and on blur of the last field; drafts appear in the list tab "Drafts"; `DELETE /purchases/bills/{id}` deletes drafts only.
9. FR-9 Detail view (`GET /purchases/bills/{id}`) shows header, lines, totals, payments, ledger entry link, movements link, attachment; actions: Record (draft), Pay (PUR-02), Void (PUR-04), Duplicate (new draft copying lines), Print (client-side print component `PurchaseBillPrint`, internal record — not a tax document).
10. FR-10 Overdue: nightly `refresh_overdue_status` sets `overdue` for `recorded`/`partially_paid` bills with `due_on < today` and back to `recorded`/`partially_paid` if `due_on` is edited (drafts only) — status is derived.
11. FR-11 Unregistered/composition tenants: tax columns still available (supplier charges GST) but `itc_eligible` is forced `false`; the totals panel labels tax as "GST (cost)".
12. FR-12 Inline item creation from the editor (INV-01 FR-12) pre-fills `purchase_price` from the typed cost and `tax_code` from the line.

#### 5. Non-Functional Requirements
Record P95 ≤ 700 ms for 20 lines; editor first paint ≤ 1 s on 4G; keyboard-first on desktop (Tab order item → qty → cost → discount → next line; `Enter` on last cell adds a line; `Ctrl+Enter` records); thumb-reachable Record button on mobile; Hindi: `purchases.bill.title` = "खरीद बिल", `purchases.bill.supplier` = "सप्लायर", `purchases.bill.paidNow` = "अभी भुगतान".

#### 6. User Flow
Primary (mobile): Bills → Purchases → FAB "+ Purchase bill" → pick supplier (recent suppliers first) → supplier invoice no./date → Add item (search "rice") → qty 20, cost 46 → Add item (scan) → totals → toggle "Paid now" ₹1,000 cash → Record → toast "PB/26-27/0007 recorded · You will give ₹1,921.00 to Agro Traders" → detail.
Alternate A (duplicate): invoice number matches → warning; user proceeds → 409 → banner with link to existing bill.
Alternate B (draft): network drops → autosave kept draft → later opens from Drafts → Record.
Alternate C (new item): search returns none → Create → quick form → line filled.
Alternate D (insufficient permission): staff records; payment section hidden if no `payments.payment.write`.
Alternate E (cost differs from last): cost 52 vs last 46 → hint "Last cost ₹46.00 (+13 %)".

#### 7. UI Requirements
Routes `app/purchases/bills/new/page.tsx`, `app/purchases/bills/[id]/edit/page.tsx`, `app/purchases/bills/[id]/page.tsx`. Components: `UbPageHeader`, `UbAsyncCombobox` (supplier, `type=supplier` filter with create-inline → PTY-01 quick form with `is_supplier=true`), `UbField`s (`MLInput` supplier invoice no., `UbDateInput` ×3), `MLSwitch` (reverse charge, ITC eligible), `UbLineItemsEditor` (purchase mode), `UbTotalsPanel`, `PaymentNowSection` (feature component: `MLSwitch` "Paid now", `mode_breakup` rows with `MLSelect` mode + `UbMoneyInput` + `MLInput` reference, "Pay full" chip), `UbFileUpload` (bill photo), `MLTextarea` notes, sticky action bar (Save draft · Record).

`UbLineItemsEditor` purchase-mode columns (desktop ≥ 1024 px, table): # · Item (name + SKU, `UbAsyncCombobox`, scanner-aware) · Qty (`UbQuantityInput`) · Unit (read-only) · Cost (`UbMoneyInput` 4 dp) · Disc (`UbPercentInput`/₹ toggle) · GST (`MLSelect` code) · Taxable (ro) · Tax (ro) · Total (ro) · ⋯ (remove, duplicate). Footer row "Add item" + "Scan". Mobile (< 640 px, card mode): each line a card — item name/SKU header with remove; row 1 Qty × Cost; row 2 Disc · GST; footer Total; "Add item" full-width button opens item search sheet; scanner via `useScannerListener` scoped to the editor.

Layout: desktop two columns — left 2/3 header + lines, right 1/3 sticky `UbTotalsPanel` + payment + attachment; mobile single column with totals collapsed into a bottom summary bar ("Total ₹2,921.00 · Record") expanding to the panel.

Redux: `purchaseBillEditorSlice` (`doc`, `lines[]`, `payment`, `status`, `version`, `dirty`, `lineErrors`, `duplicateWarning`), thunks above plus `checkDuplicateSupplierInvoice`; view-model `purchaseBillTotals.ts` (client preview using `decimal.js-light`, same rounding), `purchaseBillActions.ts`.

#### 8. UX Requirements
Money semantics: bill total shown neutral in editor; on record the toast states the ledger effect in party terms: "You will give ₹1,921.00 to Agro Traders" (success tone = credit to supplier). Cost hint vs last cost; tax code mismatch vs item default shows a subtle "differs from item (GST5)". Record confirmation is the button (bill is reversible via void with reason). Void uses `UbReasonDialog` (PUR-04). Defaults: document_date today; due_on from credit days; ITC on for regular.

#### 9. States
Initial (new draft, supplier empty, one empty line) · Loading (edit: skeleton) · Empty (no lines: Record disabled, hint) · Success (recorded → detail) · Error validation (field/line errors) · Error 409 duplicate (banner + link) · Error 409 `insufficient_stock` n/a (inbound) · Disabled (Record disabled while invalid/saving; payment section disabled without permission) · Partial (attachment uploaded, bill draft not yet saved → kept in slice) · Processing ("Recording…" spinner) · Completed (detail with status badge `recorded`/`partially_paid`/`paid`) · Failed (network → banner retry; draft persisted).

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| party_id | required; `is_supplier=true`; active | "Choose a supplier" | `required` / `not_supplier` |
| supplier_invoice_number | optional; ≤ 48; unique per supplier among non-void | "Already recorded as {number}" | `duplicate_supplier_invoice` (409) |
| supplier_invoice_date | optional; ≤ today; ≤ document_date + 0 (may precede) | "Cannot be in the future" | `future_date` |
| document_date | required; ≤ today; ≥ FY start − 2 years | | `future_date` |
| due_on | ≥ document_date | "Due date before bill date" | `due_before_date` |
| lines | 1–200 | "Add at least one item" | `required` |
| lines[i].item_id | active item, not archived; or null with free-text allowed | "Item not found" | `not_found` / `free_text_not_allowed` |
| lines[i].qty | > 0; decimal rule per unit; ≤ 9999999999.999 | | `invalid_qty` / `qty_must_be_whole` |
| lines[i].unit_cost | ≥ 0; 4 dp | | `invalid_amount` |
| lines[i].discount_value | percent 0–100 / amount ≤ gross | "Discount exceeds line amount" | `discount_too_large` |
| lines[i].tax_code | active on document_date | "GST12 not valid on this date" | `tax_rate_inactive` |
| discount (doc) | percent 0–100 / amount ≤ subtotal | | `discount_too_large` |
| payment.mode_breakup | Σ amounts ≤ grand_total; each > 0; mode enum; reference ≤ 64 | "Payment exceeds bill total" | `payment_exceeds_total` |
| attachment_id | kind `bill_photo`, tenant-owned | | `not_found` |
| version (PATCH) | current | | `stale_version` (409) |
| status (record) | must be `draft` | | `document_not_draft` (409) |

#### 11. Business Rules
1. BR-1 Totals and taxes per §17.7.0; client totals are previews only.
2. BR-2 Inbound unit cost per §17.7.0 (ITC rule); document discount apportioned before cost.
3. BR-3 Ledger entry amount = `grand_total` (including tax and round-off), one entry per bill.
3a. BR-3a A backdated bill (`document_date` before the item's latest movement date) retroactively changes the weighted-average cost of every later movement of that item, by replay — per §17.6.0. This is intended: the goods were on the shelf from the bill's date and their cost belongs there. The recomputation is asynchronous and bounded to the affected items; until it completes those items report `cost_state='stale'`.
4. BR-4 Payment now creates a separate `payments_payment` (`direction=out`, number from `payment_out` sequence `PAYOUT/26-27/0004`) allocated to the bill; it is voidable independently (PAY-05).
5. BR-5 Status after record: `paid` if `amount_due = 0`, `partially_paid` if `0 < amount_paid < grand_total`, else `recorded`; `overdue` derived nightly.
6. BR-6 `item.purchase_price` is overwritten with the latest `inbound_unit_cost` of a recorded bill (last cost). Voiding does not restore the previous value.
7. BR-7 Recorded bills are immutable except `notes`, `attachment_id`, `due_on`? — no: only `notes` and `attachment_id` (PATCH allowed post-record for these two fields; everything else 409 `document_not_draft`).
8. BR-8 `is_inter_state` decides CGST/SGST vs IGST per §17.7.0; `reverse_charge=true` keeps tax figures for reporting (GSTR-3B 3.1(d)) but the ledger amount excludes tax when RCM applies? Decision: **ledger amount = grand_total as printed by the supplier**; for RCM bills the supplier does not charge tax, so the user enters tax code `NONGST`/`GST0` on lines and the RCM liability is reported separately by RPT-07 — this FRD does not compute RCM tax.
9. BR-9 Free-text lines (no `item_id`) post no stock; service items post no stock; untracked goods post no stock; only `track_stock=true` lines post `purchase_in`.
10. BR-10 Supplier `party.credit_days` drives `due_on`; when null and no setting, `due_on = document_date`.
11. BR-11 Draft hard-delete allowed by its creator or owner/admin (§21.6).
12. BR-12 Numbering per FY (`fy_label` from `document_date` and `fy_start_month`); voided bills keep numbers.
13. BR-13 Idempotency: `POST …?record=true` and `POST …/record` require `Idempotency-Key`; replay returns the original document.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View bills | `purchases.bill.read` | ✅ | ✅ | ✅ | ✅ |
| Create/edit draft, record | `purchases.bill.write` | ✅ | ✅ | ✅ | ❌ |
| Pay now section | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| Create supplier inline | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Create item inline | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Void | `purchases.bill.void` | ✅ | ✅ | ❌ | ❌ |
| Delete draft | `purchases.bill.write` (creator) / owner, admin | ✅ | ✅ | own | ❌ |
Recording a bill posts stock without needing `inventory.stock.adjust` (document-driven movement).

#### 13. Edge Cases
1. EC-1 Same supplier invoice number for two different suppliers → allowed (uniqueness is per party).
2. EC-2 Supplier invoice number blank on two bills → allowed (partial index excludes NULL).
3. EC-3 Supplier bill dated last FY (e.g. 28/03/2026) recorded in April → `fy_label` from `document_date` → number in the 25-26 series; allowed with a warning "Previous financial year".
4. EC-4 Bill with only service lines → no movements; ledger only.
5. EC-5 Cost entered inclusive of GST by the user → provide per-line "Cost includes GST" toggle? Not at MVP; hint explains "Enter cost before GST" (P2 candidate).
6. EC-6 Payment now exceeds total → 400 `payment_exceeds_total`; excess advances must be recorded via PAY-01 separately.
7. EC-7 Party archived after draft creation → record → 409 `party_archived`.
8. EC-8 Item archived after draft creation → record → 409 `item_archived` with line index.
9. EC-9 Tax code became inactive between draft and record (22/09/2025 change) → 400 `tax_rate_inactive` on the line.
10. EC-10 Very large qty × cost overflow of `numeric(14,2)` → 400 `amount_too_large`.
11. EC-11 Idempotent replay after client timeout → same 201, no duplicate movements.
12. EC-12 Bill photo 6 MB → client compresses to ≤ 2 MB; server rejects > 2 MB.
13. EC-13 Inter-state supplier without GSTIN and no `state_code` → treated intra-state with a warning "Supplier state unknown — assumed {tenant state}".

#### 14. API Requirements
- `POST /purchases/bills` body: `{ party_id, supplier_invoice_number?, supplier_invoice_date?, document_date, due_on?, reverse_charge?, itc_eligible?, lines: [ { item_id?, description?, qty, unit_cost, discount_type?, discount_value?, tax_code? } ], discount_type?, discount_value?, round_off_enabled?, notes?, attachment_id?, payment?: { mode_breakup: [ { mode, amount, reference? } ], note? } }` → 201 draft (or recorded with `?record=true`).
- `PATCH /purchases/bills/{id}` (draft; `version`) ; `DELETE /purchases/bills/{id}` (draft).
- `POST /purchases/bills/{id}/record` (`Idempotency-Key`) → 200 document with `status`, `number`, `movements[]` ids, `ledger_entry_id`, `payment?`.
- `GET /purchases/bills/{id}` → common document shape (§22.7) + `supplier_invoice_number`, `supplier_invoice_date`, `itc_eligible`, `is_inter_state`, `lines[].unit_cost`, `lines[].inbound_unit_cost` (delta), `payments[]`, `ledger_entry: { id }`, `attachment: { id, url }`, `version`.
- `GET /purchases/bills?…&supplier_invoice_number=` (filter delta for duplicate pre-check).
- Errors: 400 `validation_error`, `kind_not_allowed` n/a, `payment_exceeds_total`, `tax_rate_inactive`; 403; 409 `duplicate_supplier_invoice`, `document_not_draft`, `stale_version`, `party_archived`, `item_archived`, `idempotency_conflict`.

#### 15. Database Impact
Writes: `purchases_document` (all mirrored columns + `supplier_invoice_number`, `supplier_invoice_date`, `itc_eligible`), `purchases_document_line` (`unit_cost`, taxes, `line_total`), `inventory_stock_movement` (`purchase_in`), `inventory_item_stock`, `inventory_item.purchase_price`, `ledger_entry` (credit), `parties_party.balance/payable_total/last_activity_at`, `payments_payment`, `payments_allocation`, `purchases_document.amount_paid/amount_due`, `platform_document_sequence` (`purchase_bill`, `payment_out`), `files_attachment` (`bill_photo`), `platform_audit_log`. Reads: `tax_rate`, `parties_party`, `inventory_item`, `inventory_unit`, `platform_tenant` (state, gst_type), settings. Indexes used: `U(tenant_id, party_id, supplier_invoice_number) WHERE … status <> 'void'`, `IX(tenant_id, kind, status, document_date DESC)`.

#### 16. Audit Requirements
`purchase_bill.draft_created`, `purchase_bill.updated` (draft diff), `purchase_bill.recorded` (totals, number, movement ids, ledger id, payment id), `purchase_bill.deleted` (draft), `payment.recorded` (via payments), `ledger.entry.created` (via ledger). `before/after` totals + status per §21.7.

#### 17. Notifications
None to the supplier at MVP. In-app to owners when staff records a bill above `ledger.credit_limit_mode`-independent threshold? Not defined — none. (Low-stock not relevant for inbound.)

#### 18. Analytics / Event Tracking
`ub.purchases.bill_draft_created`, `ub.purchases.bill_recorded { lines, stock_lines, grand_total_bucket, paid_now: none|partial|full, itc_eligible, inter_state, via: editor|record_param }`, `ub.purchases.duplicate_supplier_invoice_blocked`, `ub.purchases.bill_editor_abandoned { lines }`, `ub.purchases.item_created_inline`.

#### 19. Security
Tenant scoping on party/item/attachment ids (404); permission checks per action; `supplier_invoice_number` trimmed, stored as text; amounts parsed as `Decimal` from strings only (reject floats → 400); Idempotency-Key per tenant; attachment content sniffed; rate limit general.

#### 20. Performance
Record transaction: lock stock rows ordered, bulk insert lines and movements, single ledger insert, party balance `UPDATE … SET balance = balance − amount` (atomic increment), sequence `FOR UPDATE`, ≤ 12 + 2N statements; tax rates cached per request; list index above.

#### 21. Testing
- T-PUR-01-1 unit: `compute_totals` worked example (§17.7.0) exact figures incl. round-off; inter-state variant (IGST 5 %).
- T-PUR-01-2 unit: `inbound_unit_cost` ITC vs non-ITC; doc discount apportionment remainder to last line.
- T-PUR-01-3 unit: weighted average after record on existing stock (INV example rows 2, 5).
- T-PUR-01-4 API: create draft → record → status, number, movements, ledger credit, party balance −2921, `purchase_price` updated.
- T-PUR-01-5 API: record with payment 1000 cash → payment out, allocation, `partially_paid`, `amount_due 1921`, ledger debit 1000, balance −1921.
- T-PUR-01-6 API: duplicate supplier invoice → 409 with `details.existing`; voided original → allowed.
- T-PUR-01-7 API: idempotent replay; different body → 409.
- T-PUR-01-8 API: service-only bill → no movements; free-text line without setting → 400.
- T-PUR-01-9 API: composition tenant → `itc_eligible` forced false; cost includes tax.
- T-PUR-01-10 API: PATCH after record (non-notes field) → 409; notes → 200.
- T-PUR-01-11 permission: accountant POST → 403; staff without payments write → payment ignored? No — 403 `permission_denied` with `details.payment`.
- T-PUR-01-12 component: editor totals preview equals server totals for fixture set (parity test); card mode on 360 px; scanner adds line.
- T-PUR-01-13 E2E: full mobile flow with pay-now and duplicate warning.
- T-PUR-01-14 integration: transaction rollback when ledger post fails → no movements, no number consumed? Number is consumed inside the same transaction → rolled back too (sequence row update reverted).

#### 22. Acceptance Criteria
- AC-1 (US-1) Given the §17.7.0 example bill, when recorded, then `grand_total="2921.00"`, two `purchase_in` movements (20 @ 46.0000, 50 @ 37.2400), one ledger credit ₹2,921.00 and the supplier balance decreases by 2,921.
- AC-2 (US-2) Given the editor, when staff scans a barcode, then a line is added with qty 1 and cost = item purchase price; scanning again increments to 2.
- AC-3 (US-3) Given "Paid now" ₹1,000 cash, when recorded, then a `PAYOUT` payment allocated ₹1,000 exists, bill status `partially_paid`, amount due ₹1,921.00, and the khata shows −2,921 then +1,000.
- AC-4 (US-4) Given a recorded bill with supplier invoice `AT/778`, when another bill for the same supplier uses `AT/778`, then the editor warns on blur and the server returns 409 `duplicate_supplier_invoice`.
- AC-5 (US-5) Given a regular tenant, when the bill is recorded with ITC eligible, then `itc_eligible=true`, CGST/SGST split is stored per line and the purchase register shows the breakup.
- AC-6 (US-6) Given a bill photo attached, when the detail opens, then the image is viewable and linked to the bill.
- AC-7 (US-7) Given a half-entered bill, when the app is closed and reopened, then the draft is in the Drafts tab with the lines intact.
- AC-8 (US-8) Given an unknown item, when created inline with cost 52 and GST5, then the line is filled and the item's purchase price is 52.

#### 23. Dependencies
PTY-01 (suppliers), INV-01/05 (items, stock service), LED-10 (ledger posting), PAY-01 (payment service), PLT-06 (numbering, round-off, free-text setting), `tax` app, `UbLineItemsEditor`, `UbTotalsPanel`, files (ADR-013), sequences `purchase_bill`, `payment_out`.

#### 24. Future Enhancements
PUR-05/06 create bill from PO/GRN; PUR-07 debit notes; PUR-08 landed cost; P2 per-line "cost includes GST" toggle; TDS on bills (research §C.1) — Phase 3; supplier bill OCR — not planned.

---
### PUR-02 — Supplier payment

#### 1. Business Objective
Record money paid to suppliers so the supplier khata, open bills and cashbook agree, and so "to pay" on the dashboard is always current. Measures: ≥ 90 % of supplier payments allocated (auto or manual) to bills; zero mismatches between Σ allocations and bill `amount_paid` (CI invariant); P95 record ≤ 400 ms.

#### 2. User Personas
Owner (OW) — pays suppliers; Staff (ST) — records payments when permitted; Accountant (AC) — reconciles.

#### 3. User Stories
1. US-PUR-02-1 — As an owner I want to record a payment to a supplier with mode and reference so the khata is correct.
2. US-PUR-02-2 — As an owner I want the payment applied to the oldest unpaid bills automatically, or choose bills myself.
3. US-PUR-02-3 — As an owner I want to pay one specific bill from its page.
4. US-PUR-02-4 — As an owner I want to pay an advance (no open bills) and see it as "You will get" from the supplier.
5. US-PUR-02-5 — As an accountant I want a payment voucher I can print/share.

#### 4. Functional Requirements
1. FR-1 Uses `POST /payments` with `direction=out` (PAY-01 engine): `party_id` (supplier), `payment_date`, `mode_breakup[]`, `note`, `allocations: "auto" | [ { document_type: "purchase_document", document_id, amount } ]`.
2. FR-2 Posts one ledger `debit` entry (`entry_type=payment_out`, amount = Σ modes), number from sequence `payment_out` (`PAYOUT/26-27/0004`), updates each allocated bill's `amount_paid/amount_due/status`, and sets `unallocated_amount` on the payment.
3. FR-3 `allocations:"auto"` applies FIFO over the supplier's open bills (`recorded`, `partially_paid`, `overdue`) by `due_on` then `document_date`, capped at `amount`.
4. FR-4 Entry points: supplier khata (PTY-03 quick action "You gave" → for suppliers labelled "Pay"), bill detail "Pay" (pre-allocates to that bill), Purchases list bulk "Pay selected", Payments list.
5. FR-5 Drawer shows open bills of the supplier with due amounts, checkboxes and editable allocation amounts; "Auto" chip fills FIFO; remaining amount shown as "Advance ₹X".
6. FR-6 Payment detail (`GET /payments/{id}`) shows modes, allocations with bill links, ledger link, and `PaymentVoucherPrint` (client-side print/share via `UbShareSheet`; PAY-04).
7. FR-7 Void via PAY-05 (`POST /payments/{id}/void`) reverses the ledger debit and removes allocations (bills revert to `recorded`/`partially_paid`).
8. FR-8 Party balance after payment returned in `meta.party_balance`; toast phrases it: negative → "You will give ₹X", positive → "You will get ₹X (advance)".

#### 5. Non-Functional Requirements
Drawer opens ≤ 300 ms with bills preloaded (`GET /purchases/bills?party_id&status=recorded,partially_paid,overdue&ordering=due_on&page_size=100`); Hindi: `payments.out.title` = "भुगतान दर्ज करें", `payments.out.advance` = "एडवांस".

#### 6. User Flow
Primary: Bill detail (₹1,921 due) → Pay → drawer pre-filled amount 1,921, mode UPI, reference → Record → bill `paid`, toast "Paid ₹1,921.00 · Agro Traders settled".
Alternate A: Supplier khata → Pay ₹5,000 → Auto → covers bills 3 (₹1,921) and 4 (₹3,000), advance ₹79 → Record.
Alternate B: manual allocation — untick bill 4, allocate ₹1,921 only → advance ₹3,079 → warning "₹3,079 stays as advance".
Alternate C: split modes ₹4,000 bank + ₹1,000 cash (PAY-02).

#### 7. UI Requirements
`SupplierPaymentDrawer` (`UbDrawer`; feature `supplier-payments`): `UbPartyHeader` (supplier, balance), `UbDateInput`, `ModeBreakupEditor` (shared with PAY-01: rows `MLSelect` mode · `UbMoneyInput` · `MLInput` reference; "+ Add mode"), `UbMoneyInput` total (derived, read-only when > 1 mode), allocations list (`MLCheckbox` per bill: number, date, due, amount input `UbMoneyInput`), chip "Auto (FIFO)", summary rows Allocated / Advance, `MLTextarea` note, primary "Record payment". Mobile bottom sheet full height; desktop right drawer 560 px. Redux: `supplierPaymentSlice` (`openBills`, `allocations`, `status`), thunks `fetchOpenBillsForSupplier`, `recordSupplierPayment`. Yup: `supplierPaymentSchema` (`mode_breakup` min 1, Σ > 0; allocations Σ ≤ total; each ≤ bill `amount_due`).

#### 8. UX Requirements
Supplier payment is "You gave" in ledger terms but is money out: colour the amount neutral in the drawer and success tone in the khata for "settled"; text label "Paid" always present. Default date today; default mode last used (localStorage `ub.payments.lastMode`).

#### 9. States
Loading bills skeleton; Empty (no open bills → allocation section replaced by "No unpaid bills — this will be recorded as an advance"); Success; Error (400 allocation > due → per-row error); Disabled (Record disabled until Σ modes > 0); Processing; Completed (detail/voucher); Failed (banner retry).

#### 10. Validation Rules
`party_id` required, `is_supplier`; `payment_date ≤ today`; `mode_breakup[]` ≥ 1, each `amount > 0`, `mode` ∈ enum, `reference` ≤ 64 (required for `cheque`); Σ allocations ≤ Σ modes (`allocation_exceeds_payment`); each allocation ≤ bill `amount_due` (`allocation_exceeds_due`); bill must belong to the same party and be open (`document_not_open`); duplicate bill in allocations (`duplicate_allocation`).

#### 11. Business Rules
1. BR-1 Ledger: one `debit` entry for the full amount; allocations do not create ledger entries.
2. BR-2 Bill status recomputed from `amount_due`: 0 → `paid`; `0 < due < total` → `partially_paid`; else `recorded` (or `overdue` if past due — nightly job also refreshes immediately on write).
3. BR-3 Unallocated remainder is an advance visible as positive party balance; later bills can be allocated from it via PAY-01 "allocate existing payment"? — not at MVP; the advance simply nets in the balance (allocation of existing advances is P2).
4. BR-4 Void of a bill (PUR-04) leaves its payments as unallocated advances (mirror of §22.7 invoice void).
5. BR-5 Payments to walk-in/no-party are not allowed for `direction=out` (400 `party_required`).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Record supplier payment | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| View | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |
| Void | `payments.payment.void` | ✅ | ✅ | ❌ | ❌ |
| Print/share voucher | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. EC-1 Two payments allocated to the same bill concurrently → row lock on the bill; second fails `allocation_exceeds_due` if over.
2. EC-2 Payment dated before the bill date → allowed (advance then bill), statement shows chronological order by date.
3. EC-3 Cheque bounce → void payment with reason (PAY-05); PDC tracking is P3.
4. EC-4 Party is both customer and supplier → khata nets both; drawer only lists purchase bills for `out`.
5. EC-5 Amount typed larger than all open bills → auto allocates all, remainder advance with explicit warning.

#### 14. API Requirements
`POST /payments` (`Idempotency-Key`) → 201 `{ data: payment, meta: { party_balance } }`; `GET /payments?direction=out&party_id&…`; `GET /payments/{id}`; `POST /payments/{id}/void { reason }`; `GET /purchases/bills?party_id&status=…` for open bills. Errors 400 `allocation_exceeds_payment`, `allocation_exceeds_due`, `document_not_open`, `party_required`; 403; 409 `idempotency_conflict`.

#### 15. Database Impact
`payments_payment` (direction out, `mode_breakup`, `primary_mode`, `unallocated_amount`), `payments_allocation` (`purchase_document`), `purchases_document.amount_paid/amount_due/status`, `ledger_entry` (debit `payment_out`), `parties_party.balance/payable_total`, sequence `payment_out`, audit.

#### 16. Audit Requirements
`payment.recorded` (full row + allocations), `payment.voided`, `purchase_bill.status_changed` (before/after status).

#### 17. Notifications
None at MVP (supplier-facing SMS not in scope). Optional in-app to owners when staff records a payment out > ₹10,000: type `payment_out_by_staff` — enabled by default, manageable under `notifications.settings.manage`.

#### 18. Analytics / Event Tracking
`ub.payments.out_recorded { modes, allocation: auto|manual|none, bills_count, advance_bucket, entry_point }`, `ub.payments.out_voided`.

#### 19. Security
Permission per action; party/bill ids scoped; references trimmed; Idempotency-Key; amounts as strings.

#### 20. Performance
Locks bills `FOR UPDATE` ordered by id; ≤ 100 allocations; single ledger insert; party balance atomic update.

#### 21. Testing
- T-PUR-02-1 unit: FIFO allocation over due_on/document_date with cap.
- T-PUR-02-2 API: pay full → bill `paid`, ledger debit, balance 0.
- T-PUR-02-3 API: pay with advance → `unallocated_amount`, positive balance.
- T-PUR-02-4 API: allocation > due → 400; wrong party's bill → 400.
- T-PUR-02-5 API: void payment → allocations removed, bill status reverts, reversal entry.
- T-PUR-02-6 component: drawer auto chip; per-row validation; split modes.
- T-PUR-02-7 E2E: pay from bill detail on mobile; voucher print view renders.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given supplier balance −2,921, when ₹1,000 UPI with UTR is recorded, then a `PAYOUT` payment exists, ledger shows debit 1,000 and balance is −1,921.
- AC-2 (US-2) Given bills ₹1,921 (due earlier) and ₹3,000, when ₹4,000 is recorded with Auto, then allocations are 1,921 and 2,079 and statuses `paid` and `partially_paid`.
- AC-3 (US-3) Given bill detail, when Pay is tapped, then the drawer pre-allocates the bill's due amount.
- AC-4 (US-4) Given no open bills, when ₹500 is recorded, then the balance becomes +500 shown as "You will get ₹500 (advance)".
- AC-5 (US-5) Given a recorded payment, when Print is chosen, then a branded voucher with number, supplier, modes and allocations opens in the print view.

#### 23. Dependencies
PAY-01/02/04/05 (engine, split modes, voucher, void), PUR-01, PTY-03, LED-10, sequence `payment_out`.

#### 24. Future Enhancements
Allocate existing advances to new bills (P2), payment via aggregator payouts (not planned), PDC tracking (PAY-09), TDS deduction on supplier payments (P3).

---

### PUR-03 — Purchase list & filters

#### 1. Business Objective
Give owners and accountants one place to see all purchase bills, what is unpaid and overdue, and payable totals, with the same list ergonomics as sales. Measure: P95 list ≤ 300 ms at 20k bills; "Unpaid" tab is the most used view (instrumented).

#### 2. User Personas
Owner (OW), Accountant (AC); Staff (ST) sees bills they can act on.

#### 3. User Stories
1. US-PUR-03-1 — As an owner I want tabs All / Unpaid / Overdue / Paid / Drafts / Void with counts.
2. US-PUR-03-2 — As an owner I want to filter by supplier and date range and search by number or supplier invoice number.
3. US-PUR-03-3 — As an owner I want header totals: bills count, total amount, amount due for the filtered set.
4. US-PUR-03-4 — As an accountant I want to export the filtered list (purchase register) to CSV.
5. US-PUR-03-5 — As an owner I want to pay or void from the row menu.

#### 4. Functional Requirements
1. FR-1 `GET /purchases/bills?status=&party_id=&date_from=&date_to=&q=&ordering=&page=&page_size=` in `UbDataGrid`; tabs map to `status`: Unpaid = `recorded,partially_paid,overdue`; Overdue = `overdue`; Paid = `paid`; Drafts = `draft`; Void = `void`; All = all.
2. FR-2 `q` searches `number`, `supplier_invoice_number`, `party_snapshot.name`.
3. FR-3 `meta.totals { count, grand_total, amount_due }` over the filtered set; `meta.counts` per tab (delta, computed ignoring `status`).
4. FR-4 Date range default: current FY; presets This month / Last month / FY / Custom (`UbDateRangePicker`); range in URL alongside `tab`.
5. FR-5 Row: Number · Date · Supplier · Supplier inv. no. · Due date (overdue in danger tone with "3 days late") · Total · Due · Status badge · ⋯ (View, Pay, Void, Duplicate, Print).
6. FR-6 Bulk (desktop): Pay selected (same supplier only → PUR-02 drawer with allocations), Export CSV.
7. FR-7 Mobile cards: supplier + number, date, total, due, badge; swipe not used; tap opens detail.
8. FR-8 Export via IMP-02 (`/reports/purchase-register.csv` with same filters; RPT-04).

#### 5. Non-Functional Requirements
Index `(tenant_id, kind, status, document_date DESC)`; 25 rows/page; skeletons; keyboard navigation as INV-02.

#### 6. User Flow
Bills → Purchases → tab Unpaid → filter supplier Agro Traders → totals due ₹4,921 → row ⋯ Pay → PUR-02.

#### 7. UI Requirements
Route `app/purchases/bills/page.tsx` → `<PurchaseBillListPageContent/>`; `UbPageHeader` (title "Purchases", primary "New bill"), `UbTabs`, `UbStatCard` ×3 (Bills, Total, To pay — tone danger when > 0? No: payables are neutral/warning; "To pay" uses `warning` when overdue > 0), toolbar (`UbSearchInput`, `UbAsyncCombobox` supplier, `UbDateRangePicker`), `UbDataGrid`, `UbStatusBadge` tone map: `draft` neutral, `recorded` info, `partially_paid` warning, `overdue` danger, `paid` success, `void` muted. Redux: `purchaseBillListSlice`, thunk `fetchPurchaseBillList`.

#### 8. UX Requirements
Status labels en/hi: recorded "Recorded"/"दर्ज", partially_paid "Partly paid"/"आंशिक भुगतान", overdue "Overdue"/"बकाया", paid "Paid"/"भुगतान हुआ", void "Void"/"रद्द". Amount due right-aligned `ds-num`.

#### 9. States
Loading skeleton; Empty first-use ("No purchase bills yet — record your first bill"); Filtered-empty; Success; Error retry; Bulk partial results banner.

#### 10. Validation Rules
`date_from ≤ date_to`; `status` values in enum; `ordering` whitelist (`-document_date`, `document_date`, `due_on`, `-grand_total`, `-amount_due`, `number`).

#### 11. Business Rules
1. BR-1 Totals over filtered set across pages; `amount_due` excludes `void` and `draft`.
2. BR-2 `overdue` is stored (nightly) so filtering is index-friendly; the row still computes "days late" client-side.
3. BR-3 Drafts show `—` for number and totals as preview values.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View list | `purchases.bill.read` | ✅ | ✅ | ✅ | ✅ |
| Pay (row/bulk) | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| Void | `purchases.bill.void` | ✅ | ✅ | ❌ | ❌ |
| Export | `reports.export` | ✅ | ✅ | ❌ | ✅ |

#### 13. Edge Cases
1. EC-1 Supplier renamed → list shows `party_snapshot.name` for recorded bills (frozen) and current name for drafts.
2. EC-2 Bill dated in previous FY within range → shown; FY preset boundaries follow `fy_start_month`.
3. EC-3 Bulk pay across two suppliers → disabled with hint "Select bills of one supplier".
4. EC-4 20k bills → page + counts queries ≤ 300 ms with index; counts cached 30 s per filter hash in memory.

#### 14. API Requirements
`GET /purchases/bills` params/response as above (`meta.counts` delta); `GET /reports/purchase-register.csv?…` (IMP-02).

#### 15. Database Impact
Reads `purchases_document`, `parties_party`; index above plus `IX(tenant_id, party_id, document_date DESC)`.

#### 16. Audit Requirements
None for reads; export under IMP-02.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.purchases.list_viewed { tab, has_supplier_filter, range_preset }`, `ub.purchases.list_exported`.

#### 19. Security
Whitelisted ordering; `q` escaped; scoping.

#### 20. Performance
Two queries per page; `select_related(party)`; counts aggregate with `FILTER`.

#### 21. Testing
- T-PUR-03-1 API: tab → status mapping; totals; counts.
- T-PUR-03-2 API: search by supplier invoice number.
- T-PUR-03-3 component: badge tones; days-late text; bulk pay disabled across suppliers.
- T-PUR-03-4 E2E: filter + export flow.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given bills in each status, when Unpaid is selected, then only `recorded`, `partially_paid`, `overdue` rows appear and the tab count matches.
- AC-2 (US-2) Given search "AT/778", when entered, then the bill with that supplier invoice number is listed.
- AC-3 (US-3) Given a supplier filter, when applied, then the "To pay" total equals Σ `amount_due` of visible and non-visible pages.
- AC-4 (US-4) Given accountant, when Export is chosen, then the purchase register CSV downloads with the same filters.
- AC-5 (US-5) Given an unpaid row, when ⋯ Pay is chosen, then PUR-02 opens pre-allocated.

#### 23. Dependencies
PUR-01/02/04, RPT-04, IMP-02, `refresh_overdue_status` job, `UbDataGrid`.

#### 24. Future Enhancements
Saved views; supplier ageing link (RPT-05 payables); PO/GRN tabs (PUR-05/06); debit-note tab (PUR-07).

---

### PUR-04 — Void purchase bill

#### 1. Business Objective
Allow a recorded bill to be cancelled with a reason while keeping the audit trail: stock and the supplier khata revert exactly, the number is retained, and payments stay as advances. Measure: 100 % of voids produce matching reversal rows; void completes ≤ 500 ms.

#### 2. User Personas
Owner (OW), Admin — void; Accountant (AC) — sees voided bills with reasons.

#### 3. User Stories
1. US-PUR-04-1 — As an owner I want to void a wrongly entered bill with a reason so stock and khata are corrected.
2. US-PUR-04-2 — As an owner I want to see exactly what the void will do before confirming.
3. US-PUR-04-3 — As an accountant I want voided bills visible with number, reason and who voided them.
4. US-PUR-04-4 — As an owner I want to be stopped if voiding would make stock negative because goods were already sold.

#### 4. Functional Requirements
1. FR-1 `POST /purchases/bills/{id}/void { reason }` (≥ 3 chars) for status ∈ `recorded`, `partially_paid`, `paid`, `overdue`; `draft` → use DELETE (409 `document_not_recorded`); already void → 409 `document_already_void`.
2. FR-2 Atomic effects: (a) for each `purchase_in` movement of the bill post a `reversal` movement with `qty = −original qty`, `unit_cost = original unit_cost`, `reverses_id`, `movement_date = today` (void date), `source_type='purchase_document'`, `source_id=bill.id` — a reversal of an inbound, which by §17.6.0 **removes the value that inbound added** rather than leaving the average alone; and after the reversals, mark each affected `(item, location)` `cost_state='stale'` and enqueue one `inventory.recompute_item_cost`, unconditionally (Part 21 §21.3.6 (4)), so the average is re-derived from the log rather than patched; (b) `check_availability` before posting — if any item would go below 0 and `allow_negative_stock=false` → 409 `insufficient_stock` with `details.lines[]`; (c) post ledger `reversal` entry (`direction=debit`, amount = grand_total, `reverses_id` = original credit entry, `reason`), mark original `reversed`; (d) delete `payments_allocation` rows of this bill → payments become unallocated advances (`unallocated_amount` updated); (e) set `status=void`, `voided_at`, `void_reason`; (f) audit `purchase_bill.voided`.
3. FR-3 Confirmation `UbReasonDialog` lists consequences computed from `GET /purchases/bills/{id}` : "Stock: −20 NOS Rice, −50 KGS Sugar · Khata: +₹2,921.00 (you will give less) · Payments: ₹1,000.00 becomes advance".
4. FR-4 `item.purchase_price` is **not** rolled back (BR-6 of `PUR-01`) — it is the *last* cost, and the last bill did happen. The **weighted-average cost *is* recomputed**: the dialog states "Average cost will be recalculated", and the bill detail shows "Average cost recalculating" on the affected items until `inventory.recompute_item_cost` completes (typically within seconds). This is the promise Part 15 journey 6 makes about a cost mistyped by a factor of ten — void the bill and the average is correct again — and the product never patches an average in place.
5. FR-5 Voided bill remains listed under Void tab with number; detail shows a "Void" banner with reason, actor, time; movements tab shows both rows.
6. FR-6 The `duplicate_supplier_invoice` constraint excludes void bills, so the same supplier invoice can be re-entered correctly.
7. FR-7 "Void and duplicate" action: void then open a new draft copying lines for correction.

#### 5. Non-Functional Requirements
≤ 500 ms for the synchronous part; the cost recomputation is asynchronous and bounded to the affected items. Dialog copy en/hi (`purchases.void.title` = "बिल रद्द करें"). Reversal rows are dated today, not backdated to the bill, so historical valuation `as_of` before the void still shows the goods — accounting-consistent, and it also makes the reversals tail inserts.

#### 6. User Flow
Bill detail → ⋯ Void → dialog with consequences → reason "Entered twice" → Void → toast "PB/26-27/0007 voided" → status badge Void.
Alternate: goods already sold → 409 → dialog shows "Cannot void: Rice would go to −5 NOS. Allow negative stock in settings or adjust first."

#### 7. UI Requirements
`UbReasonDialog` (title, consequences list, reason `MLTextarea`, destructive outlined button "Void bill"); void banner (`UbStatusBanner` tone danger) on detail; Void tab in list. Redux: thunk `voidPurchaseBill` in `purchaseBillEditorThunk`, updates list row. Yup: `voidReasonSchema` (min 3, max 160).

#### 8. UX Requirements
Destructive action outlined (Koper rule), never filled red; consequences use signed quantities and khata effect in party terms.

#### 9. States
Dialog idle → validating reason → processing spinner → success (banner) / error (409 insufficient stock with per-item list; `document_already_void` → refresh).

#### 10. Validation Rules
`reason` 3–160 chars (`required`/`max_length`); status transition rules (`document_not_recorded`, `document_already_void`); availability (`insufficient_stock`).

#### 11. Business Rules
1. BR-1 Void never deletes: lines, movements, ledger entry and payments are retained; reversal rows are added.
2. BR-2 Number retained; sequence not decremented.
3. BR-3 Payments allocated to the voided bill become unallocated advances; the user is prompted to void or keep them (link to PAY-05).
4. BR-4 The reversal movement's `unit_cost` copies the original inbound cost and its `reverses_id` points at that inbound, which is what makes the costing rule treat it as a value reversal (§17.6.0) rather than as a plain outbound. `avg_cost` is then re-derived by `inventory.recompute_item_cost`; `recalc_stock` and the nightly drift job replay the same function in the same canonical order, so the cache, the replay and the drift check agree by construction. The previous rule — "avg unchanged, documented approximation" — was not an approximation but a defect: a bill voided because its cost was mistyped left the mistyped cost in the average forever (Part 41 BE-02).
5. BR-5 Void is blocked for bills whose debit notes (PUR-07, P2) are not void (409 `has_dependent_documents`).
6. BR-6 Ledger reversal `entry_date = today`; statements with corrections hidden collapse both rows.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Void | `purchases.bill.void` | ✅ | ✅ | ❌ | ❌ |
| View void reason | `purchases.bill.read` | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. EC-1 Partial sale after purchase (bought 20, sold 8, on hand 12) → void needs 20 → −8 → blocked unless negative allowed. When `allow_negative_stock=true` the void posts, `on_hand` goes to −8 and the item's `avg_cost` becomes `0` (§17.6.0: a value reversal that takes on-hand to or below zero resets the average), with the next inbound setting the average to its own cost. Nothing is ever "un-sold": the 8 units already issued keep the COGS they were issued at.
2. EC-2 Bill from a previous FY voided now → allowed; GST reporting for that period is the accountant's concern (RPT-07 shows void separately).
3. EC-3 Payment already voided → step (d) no-op.
4. EC-4 Concurrent void and payment → bill row locked `FOR UPDATE`; payment gets `document_not_open`.
5. EC-5 Idempotency-Key replay on void → same 200.

#### 14. API Requirements
`POST /purchases/bills/{id}/void { reason }` (`Idempotency-Key` optional) → 200 document (`status=void`, `void_reason`, `voided_at`, `reversal_movements[]`, `reversal_ledger_entry_id`, `released_payments[]`). Errors 400 `validation_error`; 403; 409 `document_already_void`, `document_not_recorded`, `insufficient_stock`, `has_dependent_documents`.

#### 15. Database Impact
`purchases_document` (status, voided_at, void_reason), `inventory_stock_movement` (`reversal`), `inventory_item_stock` (on_hand, `cost_state='stale'`), `platform_job` (`inventory.recompute_item_cost`, one per affected item+location), `ledger_entry` (reversal + `reversed_by_id` on original), `parties_party.balance`, `payments_allocation` (delete), `payments_payment.unallocated_amount`, audit.

#### 16. Audit Requirements
`purchase_bill.voided` with before/after status, reason, reversal ids, released payment ids; `ledger.entry.reversed`.

#### 17. Notifications
In-app to owners when an admin voids a bill > ₹10,000 (type `document_voided`), default on.

#### 18. Analytics / Event Tracking
`ub.purchases.bill_voided { age_days, had_payments, grand_total_bucket, blocked_negative: bool }`.

#### 19. Security
Permission; scoping; reason stored as text; audit mandatory.

#### 20. Performance
Same lock ordering as record; ≤ 8 + 2N statements.

#### 21. Testing
- T-PUR-04-1 API: void → reversal movements (−qty, same cost, `reverses_id` set), ledger reversal, balance restored, allocations released, status void.
- T-PUR-04-1a API (Tier 1): a bill recorded at a cost ten times too high, with no intervening movement, is voided → after `inventory.recompute_item_cost` runs, the item's `avg_cost` equals its value before the bill was recorded, to 4 dp. This is Part 15 journey 6's promise, asserted.
- T-PUR-04-1b API (Tier 1): the same with an intervening sale and a backdated adjustment → the cache equals an independent replay in (`movement_date`, `sequence_no`) order.
- T-PUR-04-2 API: void with insufficient stock → 409 details; with setting true → success and negative on-hand.
- T-PUR-04-3 API: void draft → 409; void twice → 409.
- T-PUR-04-4 API: re-enter same supplier invoice after void → 201.
- T-PUR-04-5 component: consequences text; outlined destructive button.
- T-PUR-04-6 E2E: void and duplicate flow.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given the §17.7.0 bill recorded and unpaid, when voided with reason, then movements −20 Rice and −50 Sugar exist with `reverses_id` set, ledger has a debit reversal of ₹2,921, the supplier balance returns to its prior value, and each affected item's `avg_cost` returns to its pre-bill figure once the enqueued recomputation completes.
- AC-2 (US-2) Given the void dialog, when opened, then it lists stock, khata and payment consequences before the reason is typed.
- AC-3 (US-3) Given a voided bill, when the accountant opens it, then number, reason, actor and time are visible and the Void tab lists it.
- AC-4 (US-4) Given 8 of 20 units already sold and negative stock off, when voiding, then 409 `insufficient_stock` is shown with "Rice would go to −8".

#### 23. Dependencies
PUR-01, LED-03 semantics (reversal), PAY-05, INV-06 policy, `UbReasonDialog`.

#### 24. Future Enhancements
PUR-07 debit notes for partial returns (preferred over void for partial corrections); edit-after-record via void-and-duplicate remains the model.

---
### PUR-05 — Purchase order — Phase 2

#### 1. Business Objective
Let a business tell a supplier what to send before the goods arrive, so receipts (PUR-06) and bills (PUR-01) can be checked against what was ordered instead of typed again. Measures: ≥ 60 % of bills from PO-using tenants reference a `po_id`; median PO creation ≤ 60 s; share-to-WhatsApp used on ≥ 40 % of `sent` POs.

#### 2. User Personas
Owner (OW) — raises and sends orders; Staff (ST) — drafts orders for approval; Accountant (AC) — reads open commitments.

#### 3. User Stories
1. US-PUR-05-1 — As an owner I want to create a PO with items, quantities and expected costs so the supplier knows exactly what to deliver.
2. US-PUR-05-2 — As an owner I want to send the PO as a PDF over WhatsApp from my phone.
3. US-PUR-05-3 — As staff I want to see how much of each PO line has arrived so I can chase the balance.
4. US-PUR-05-4 — As an owner I want to close an order the supplier will not fulfil, keeping what was already received.
5. US-PUR-05-5 — As an owner I want to raise a PO from low-stock items in one tap (INV-07).

#### 4. Functional Requirements
1. FR-1 `POST /purchases/orders` creates a `purchases_document` with `kind=purchase_order`, `status=draft`; `PATCH /purchases/orders/{id}` edits while `draft` or `sent` (requires `version`); `DELETE` only `draft`.
2. FR-2 Header: supplier (`party_id`, `is_supplier=true`), `document_date` (default today), `due_on` used as **expected delivery date** (label "Expected by", may be in the future — the only purchase document where a future `due_on` is allowed), `reference` free text (stored in `notes` prefix? No — stored in `meta.reference`), `notes`, `terms`. `supplier_invoice_*`, `itc_eligible` are hidden and NULL for POs.
3. FR-3 Lines (`UbLineItemsEditor` order mode): item (goods or service; free-text allowed per setting), qty, unit, expected `unit_cost` (default item `purchase_price`), discount, tax code; server computes the same totals as a bill (§17.7.0) as an **estimate** — POs never post stock or ledger. `received_qty` is server-maintained (PUR-06), never client-writable.
4. FR-4 Transitions (sub-resource verbs): `POST …/send` (`draft → sent`; allocates `number` from sequence kind `purchase_order`, snapshots party, freezes lines except quantity increases and new lines per BR-3); `POST …/close` (`sent | partially_received → closed`, reason optional, BR-4); `POST …/cancel` (`draft | sent → cancelled`, reason ≥ 3 chars; refused once any receipt exists → 409 `has_dependent_documents`). `partially_received` and `received` are set only by PUR-06.
5. FR-5 Share: `GET /purchases/orders/{id}.pdf` renders the client-side print component `PurchaseOrderPrint` (ADR-014; "PURCHASE ORDER", tenant branding, supplier block, lines with qty/unit/expected rate, estimated total, "Expected by", terms); `POST /purchases/orders/{id}/share-links` returns a 30-day public token served by `GET /public/d/{token}`; `UbShareSheet` builds `https://wa.me/91<mobile>?text=<encoded>` with template `purchases.po.share_text` ("Purchase order {number} from {business} — {url}"). Sharing does not change status; the user marks Send explicitly ("Send" = mark sent + open share sheet).
6. FR-6 Detail (`GET /purchases/orders/{id}`) shows per line `qty`, `received_qty`, `pending_qty = qty − received_qty`, linked receipts (PUR-06) and bills (`po_id`), progress bar "12 of 30 received"; actions Send / Receive / Create bill / Close / Cancel / Duplicate / Print / Share.
7. FR-7 List `GET /purchases/orders?status=&party_id=&date_from&date_to&q&ordering&page` with tabs Draft · Sent · Partially received · Received · Closed · Cancelled and `meta.counts`; `meta.totals.open_value` = Σ estimated total of `sent`/`partially_received`.
8. FR-8 "Create bill from PO" opens PUR-01 pre-filled with pending or received quantities (chooser) and `po_id` set; PUR-01 records normally. Bill lines carry `po_id` on the header only (canon has no line-level PO link).
9. FR-9 Entry from INV-07: "Raise PO" on the low-stock list groups selected items by their last supplier (latest recorded bill) and opens one draft per supplier with `qty = reorder_point × 2 − on_hand` (editable).

#### 5. Non-Functional Requirements
Create P95 ≤ 400 ms; PDF print view ≤ 1 s; Hindi `purchases.po.title` = "खरीद ऑर्डर", `purchases.po.expectedBy` = "अपेक्षित तारीख"; keyboard rules as PUR-01; module gate `purchases` and plan entitlement `purchases.orders` (Phase 2 plan feature).

#### 6. User Flow
Primary: Purchases → Orders → "+ Purchase order" → supplier → items (Rice 30 NOS @ 46, Sugar 100 KGS @ 38) → Expected by 25/09 → Save draft → Send → share sheet → WhatsApp → status `sent`. Later: Receive (PUR-06) 20 Rice → `partially_received` → Receive rest → `received` → Create bill → PUR-01.
Alternate A: supplier drops Sugar → Close with reason "Supplier out of stock" → `closed`; received Rice stays billed.
Alternate B: edit after send (add 10 more Rice) → PATCH allowed (BR-3) → banner "Edited after sending — resend to supplier".

#### 7. UI Requirements
Routes `app/purchases/orders/page.tsx`, `…/new/page.tsx`, `…/[id]/page.tsx`, `…/[id]/edit/page.tsx`. Feature folder `purchase-orders`: Redux `purchaseOrderSlice` (`list`, `counts`, `current`, `version`, `saving`, `shareLink`) + `purchaseOrderThunk.ts` (`fetchPurchaseOrders`, `fetchPurchaseOrder`, `createPurchaseOrder`, `updatePurchaseOrder`, `sendPurchaseOrder`, `closePurchaseOrder`, `cancelPurchaseOrder`, `createPurchaseOrderShareLink`) calling `api/purchaseService.ts` (shared by PUR-05/06/07/08; paths `API_PATHS.PURCHASE_ORDERS`, `PURCHASE_ORDER_BY_ID(id)`, `PURCHASE_ORDER_SEND(id)`, `PURCHASE_ORDER_CLOSE(id)`, `PURCHASE_ORDER_CANCEL(id)`, `PURCHASE_ORDER_RECEIVE(id)`, `PURCHASE_ORDER_SHARE_LINKS(id)`). Yup `purchaseOrderSchema`, `purchaseOrderLineSchema`. Desktop: two-column editor as PUR-01 with `UbTotalsPanel` titled "Estimated total"; detail uses `UbDataGrid` for lines with columns Item · Ordered · Received · Pending · Rate · Amount, `MLProgress` per line. Mobile: card lines; sticky bar "Save · Send"; detail progress under header; `UbDrawer` for Close/Cancel reasons (`UbReasonDialog`).

#### 8. UX Requirements
Status tones: `draft` neutral, `sent` info, `partially_received` warning, `received` success, `closed` muted, `cancelled` danger. Totals labelled "Estimated" everywhere; no khata effect sentence on save (nothing posts). Edited-after-send banner persists until next share.

#### 9. States
Initial (new draft) · Loading · Empty (no lines: Send disabled) · Success (saved/sent) · Error (validation; 409 `stale_version`, `has_dependent_documents`) · Disabled (Receive hidden until `sent`) · Partial (`partially_received` with progress) · Completed (`received`/`closed`) · Failed (network → draft kept).

#### 10. Validation Rules
As PUR-01 for party/lines/costs, plus: `due_on` ≥ `document_date` (future allowed) — `expected_before_date`; PATCH on `received`/`closed`/`cancelled` → 409 `document_not_editable`; line qty decrease below `received_qty` → 400 `qty_below_received`; `send` requires ≥ 1 line and a supplier → 400 `required`.

#### 11. Business Rules
1. BR-1 POs post nothing: no `inventory_stock_movement`, no `ledger_entry`, no payment; totals are estimates recomputed on every save.
2. BR-2 Number allocated at `send`, kind `purchase_order` (`PO/26-27/0012`); drafts have `number NULL`.
3. BR-3 After `send`, lines may be added and quantities increased; decreases below `received_qty` are refused (research §A.11 rule). Costs and tax codes remain editable until the first receipt, then frozen.
4. BR-4 `close` requires `received_qty > 0` on at least one line or an explicit reason; `closed` lines cannot be received; open commitment = Σ `pending_qty × unit_cost` excludes closed/cancelled.
5. BR-5 `cancel` is only possible with zero receipts; otherwise use `close`.
6. BR-6 Status derivation after each receipt: all lines `received_qty ≥ qty` → `received`; any `received_qty > 0` → `partially_received`; else `sent`.
7. BR-7 Duplicate creates a new `draft` copying lines with current item `purchase_price` (not the old expected cost) — hint shows the difference.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View orders | `purchases.bill.read` | ✅ | ✅ | ✅ | ✅ |
| Create/edit/send/close/cancel | `purchases.order.write` | ✅ | ✅ | ✅ (default on) | ❌ |
| Share link / print | `purchases.bill.read` | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
1. EC-1 Supplier without mobile → WhatsApp option disabled, copy link and download PDF remain.
2. EC-2 Item archived after PO sent → receipt for that line blocked (409 `item_archived`); PO can be closed.
3. EC-3 Expected date passed with pending qty → list badge "Late" (derived client-side: `due_on < today` and status `sent`/`partially_received`); no stored status.
4. EC-4 Two users edit the same sent PO → `stale_version`.
5. EC-5 PO in previous FY received this FY → PO number stays in its FY series; GRN/bill numbered in the current FY.
6. EC-6 Price changed at receipt vs PO → not recorded on the PO; the bill (PUR-01) carries actual costs and the detail shows "Billed ₹X vs estimated ₹Y".

#### 14. API Requirements
- `POST /purchases/orders` `{ party_id, document_date, due_on?, lines[] (item_id?, description?, qty, unit_cost, discount_*, tax_code?), discount_*, notes?, terms?, meta?: { reference } }` → 201 draft; `PATCH /purchases/orders/{id}` (`version`); `DELETE` (draft).
- `POST /purchases/orders/{id}/send` → 200 (`number`, `status=sent`); `POST …/close { reason? }`; `POST …/cancel { reason }`; `POST …/share-links { expires_in_days }` → `{ url, expires_at }`; `GET …/{id}.pdf`. Paths beyond canon §0.8 (`send`, `close`, `cancel`, `share-links`, `.pdf`, `PATCH`) — CCR-06.
- `GET /purchases/orders/{id}` → common document shape + `lines[].received_qty`, `lines[].pending_qty`, `receipts[] { id, number, document_date }`, `bills[] { id, number, grand_total }`, `open_value`, `version`.
- Errors: 400 `validation_error`, `qty_below_received`, `expected_before_date`; 403; 404; 409 `document_not_draft`, `document_not_editable`, `has_dependent_documents`, `stale_version`.

#### 15. Database Impact
`purchases_document` (`kind=purchase_order`, statuses per canon §0.7 PurchaseOrder, `due_on` as expected date, `public_token_hash`, `meta.reference`), `purchases_document_line` (`received_qty` cache), `platform_document_sequence` (`purchase_order`), `platform_audit_log`. Reads parties, items, tax rates. Index `IX(tenant_id, kind, status, document_date DESC)` serves tabs.

#### 16. Audit Requirements
`purchase_order.draft_created`, `.updated` (line diff), `.sent` (number), `.closed` (reason, pending qty snapshot), `.cancelled` (reason), `.shared` (channel).

#### 17. Notifications
None to the supplier beyond the manual share. In-app `po_late` to the creator when `due_on` passes with pending quantity (nightly `refresh_overdue_status` reuse, type addition — CCR-06).

#### 18. Analytics / Event Tracking
`ub.purchases.po_created { lines, from: editor|low_stock|duplicate }`, `ub.purchases.po_sent { estimated_total_bucket, shared_via: whatsapp|link|pdf|none }`, `ub.purchases.po_closed { pending_lines }`, `ub.purchases.po_cancelled`, `ub.purchases.po_edited_after_send`.

#### 19. Security
Public token 32 random bytes hashed; share link exposes the print view only; tenant scoping; permission per action; `wa.me` text URL-encoded, no user HTML.

#### 20. Performance
No posting → single insert/update transaction; detail loads receipts/bills via one `IN` query on `po_id`; list uses `meta.counts` single grouped query.

#### 21. Testing
- T-PUR-05-1 API: create → send → number `PO/…`, status `sent`, no movements/ledger rows.
- T-PUR-05-2 API: PATCH after send increasing qty → 200; decreasing below received → 400.
- T-PUR-05-3 API: cancel after a receipt → 409; close → 200 with commitment excluded from `open_value`.
- T-PUR-05-4 API: share link → public GET renders PO; expired → 404.
- T-PUR-05-5 component: progress per line; status tones; edited-after-send banner.
- T-PUR-05-6 E2E: low-stock → Raise PO → send via WhatsApp deep link (URL asserted).

#### 22. Acceptance Criteria
- AC-1 (US-1) Given a supplier and two lines, when the PO is sent, then it has a `PO/` number, status `sent`, and stock and khata are unchanged.
- AC-2 (US-2) Given a sent PO, when Share → WhatsApp is tapped, then a `wa.me` link opens with the PO number and public URL.
- AC-3 (US-3) Given 20 of 30 Rice received, when the detail opens, then the line shows Pending 10 and status `partially_received`.
- AC-4 (US-4) Given a partially received PO, when closed with a reason, then status is `closed`, received lines remain, and no further receipt is possible.
- AC-5 (US-5) Given three low-stock items from one supplier, when Raise PO is tapped, then one draft with three lines and suggested quantities opens.

#### 23. Dependencies
PUR-01 (bill from PO), PUR-06, INV-07, PTY-01, ADR-014 print, public document route (SAL-06 share links), sequence `purchase_order`, CCR-06.

#### 24. Future Enhancements
Approval workflow (Zoho §A.11) — Phase 3; drop-ship "deliver to customer"; supplier acknowledgement via public page; email sending when the messaging adapter lands (NTF-04).

---
### PUR-06 — Goods receipt against PO — Phase 2

#### 1. Business Objective
Put goods into stock the moment they arrive at the door — checked against the order, in parts if needed — without waiting for the supplier's bill, so shelves and valuation are right today and the bill is reconciled later. Measures: receipt-to-stock ≤ 45 s median on mobile; 100 % of GRN movements traceable to a PO line; over-receipts flagged and confirmed (rate tracked).

#### 2. User Personas
Staff (ST) — receives deliveries; Owner (OW) — confirms over-receipts and bills; Accountant (AC) — reads unbilled receipts.

#### 3. User Stories
1. US-PUR-06-1 — As staff I want to tick off what arrived against the PO so stock rises immediately.
2. US-PUR-06-2 — As staff I want to receive part of an order now and the rest later.
3. US-PUR-06-3 — As an owner I want to be warned when more arrives than was ordered and decide whether to accept it.
4. US-PUR-06-4 — As an owner I want to create the supplier bill from what was received so quantities and costs are not retyped.
5. US-PUR-06-5 — As an accountant I want a list of received-but-unbilled goods so payables are complete at month end.

#### 4. Functional Requirements
1. FR-1 `POST /purchases/orders/{id}/receive` (`Idempotency-Key` required) creates a `purchases_document` with `kind=goods_receipt`, `po_id = {id}`, `status=recorded` **in one step** (no draft for GRNs — receiving is a physical fact; corrections are by void, FR-8). Body: `document_date` (receipt date, ≤ today), `lines[] { po_line_id, qty_received, unit_cost? }`, `notes?`, `attachment_id?` (delivery challan photo, kind `bill_photo`), `confirm_over_receipt: false`.
2. FR-2 Only `sent` / `partially_received` POs can be received (409 `document_not_open`); closed lines are skipped (400 `line_closed`).
3. FR-3 Per line: `pending = qty − received_qty`; when `qty_received > pending` the server returns 409 `over_receipt` with `details.lines[] { po_line_id, ordered, already_received, requested, over_by }` unless `confirm_over_receipt=true` **and** the caller holds `purchases.bill.void`-level authority (owner/admin — BR-4). The client shows the warning inline, and offers "Accept extra (admin)".
4. FR-4 Atomic effects (`order_service.receive`): (a) allocate `number` from sequence kind `goods_receipt` (`GRN/26-27/0003`; CCR-07); (b) copy lines from the PO with `qty = qty_received`, `unit_cost = body.unit_cost ?? po_line.unit_cost`, `tax_code`, description snapshot; (c) for each `track_stock` line post `purchase_in` with `unit_cost = inbound_unit_cost` computed per §17.7.0 using the PO's tax code and the tenant's ITC rule (`itc_eligible` assumed `true` for `regular` tenants at receipt; corrected by the bill, FR-6), `movement_date = document_date`, `source_type='purchase_document'`, `source_id = grn.id`; (d) weighted-average update; (e) `po_line.received_qty += qty_received`; (f) PO status per PUR-05 BR-6; (g) audit; (h) **no ledger entry** — the supplier is owed only when the bill is recorded (PUR-01).
5. FR-5 GRN totals are computed for information (estimated value received) and shown as "Value received (est.)".
6. FR-6 Billing a GRN: "Create bill" on the GRN or PO opens PUR-01 pre-filled from one or several unbilled GRNs of the same PO (multi-select) with `po_id` set and `meta.grn_ids[]`; when the bill is recorded, PUR-01 **does not post stock again** for quantities covered by GRNs: the bill's `purchase_in` posting is replaced by a cost-true-up — for each item, if `bill inbound_unit_cost ≠ GRN unit_cost`, an `adjust_in`/`adjust_out` pair is *not* used; instead the bill posts a zero-quantity correction? Canon forbids `qty = 0` movements (`CHECK <> 0`). Decision: the bill posts **no movement** for GRN-covered quantities and the GRN cost stands as the valuation cost; the bill's actual cost updates `item.purchase_price` (last cost) only. Cost differences are visible in the PO detail ("Billed vs received value"). Quantities on the bill above the GRN-covered quantity post `purchase_in` normally.
7. FR-7 GRN detail (`GET /purchases/receipts/{id}` — CCR-07) shows lines, movements, PO link, bill link, attachment, `billed_qty` per line; list `GET /purchases/receipts?po_id=&party_id=&billed=false&date_from&date_to` with tab "Unbilled" (`meta.totals.unbilled_value`).
8. FR-8 Void GRN (`POST /purchases/receipts/{id}/void { reason }`, owner/admin): reverses its movements (PUR-04 semantics, `insufficient_stock` check), decrements `po_line.received_qty`, re-derives PO status; refused when a recorded bill references the GRN (409 `has_dependent_documents`).
9. FR-9 Scanner: scanning a barcode in the receipt screen increments `qty_received` on the matching PO line; unknown item → toast "Not on this order".

#### 5. Non-Functional Requirements
Receive P95 ≤ 600 ms for 30 lines; screen usable one-handed (qty steppers 44 px); Hindi `purchases.grn.title` = "माल प्राप्ति", `purchases.grn.overReceipt` = "ऑर्डर से ज़्यादा आया"; works on 360 px with the PO lines as cards.

#### 6. User Flow
Primary (mobile): PO detail → Receive → list of pending lines with "Receive all pending" chip → adjust Rice 20 of 30 → Save → toast "GRN/26-27/0003 · Stock +20 NOS Rice" → PO `partially_received`. Second delivery → Receive → remaining 10 → PO `received` → "Create bill" → PUR-01 pre-filled (30 Rice @ 46) → Record.
Alternate A: 35 Rice arrive → warning "Ordered 30, already received 0, entered 35 (+5)" → staff cannot proceed; owner taps "Accept extra" → GRN recorded with 35, PO line `received_qty=35`, status `received`.
Alternate B: wrong receipt → Void GRN → stock −20 → PO back to `sent`.

#### 7. UI Requirements
Routes `app/purchases/orders/[id]/receive/page.tsx`, `app/purchases/receipts/page.tsx`, `app/purchases/receipts/[id]/page.tsx`. Feature folder `goods-receipts` reusing `purchaseOrderSlice` for the PO and a `goodsReceiptSlice` (`list`, `current`, `receiving`, `overReceiptLines`) with `goodsReceiptThunk.ts` (`receivePurchaseOrder`, `fetchGoodsReceipts`, `fetchGoodsReceipt`, `voidGoodsReceipt`) over `purchaseService.ts` (paths `PURCHASE_ORDER_RECEIVE(id)`, `PURCHASE_RECEIPTS`, `PURCHASE_RECEIPT_BY_ID(id)`, `PURCHASE_RECEIPT_VOID(id)`). Yup `goodsReceiptSchema` (`lines[].qtyReceived` ≥ 0, decimals per unit, at least one > 0). Receive screen: `UbPageHeader` ("Receive against PO/26-27/0012"), `UbDateInput`, `UbLineItemsEditor` receive mode — columns Item · Ordered · Received so far · Receiving now (`UbQuantityInput` with ± steppers) · Cost (optional override) — over-receipt cell outlined warning with `UbHelpHint`; `UbFileUpload` (challan photo); sticky "Receive" button. Desktop: `UbDataGrid` lines + right summary card (lines received, est. value). GRN list: `UbDataGrid` with tabs All · Unbilled; row opens `UbDrawer` detail.

#### 8. UX Requirements
Toast states the stock effect in item terms ("Stock +20 NOS Rice, +100 KGS Sugar"), never a khata sentence (nothing owed yet); unbilled badge tone warning; over-receipt confirm copy: "Accepting will record 5 NOS more than ordered. The bill must match what was received."

#### 9. States
Loading PO · Ready (pending lines) · Nothing pending (Receive disabled, hint "All received") · Validating · Over-receipt warning (blocked/confirmable) · Processing · Success (GRN detail) · Error (409 `document_not_open`, `item_archived`, `stale_version`) · Void processing/blocked (`has_dependent_documents`, `insufficient_stock`).

#### 10. Validation Rules
`document_date` ≤ today and ≥ PO `document_date` (`date_before_order`); `lines` non-empty with Σ `qty_received` > 0 (`nothing_to_receive`); `qty_received` ≥ 0, decimal rule (`invalid_qty`, `qty_must_be_whole`); `po_line_id` belongs to the PO (`not_found`); over-receipt per FR-3 (`over_receipt`, 409); `unit_cost` ≥ 0, 4 dp; `attachment_id` tenant-owned kind `bill_photo`.

#### 11. Business Rules
1. BR-1 A GRN is the stock event; the bill is the liability event. Together they equal a PUR-01 direct bill.
2. BR-2 Receipt cost = PO expected cost unless overridden at receipt; the bill's real cost never rewrites GRN movements (FR-6) — accepted approximation, disclosed in the stock summary tooltip "valued at receipt cost".
3. BR-3 Partial receipts are unlimited in number; `received_qty` is the cumulative cache and must equal Σ non-void GRN lines (CI invariant `check_po_received_qty`).
4. BR-4 Over-receipt acceptance requires owner/admin (`purchases.bill.void` used as the admin marker until a dedicated codename exists — CCR-08); staff see the warning but cannot confirm.
5. BR-5 GRN numbering per FY, kind `goods_receipt` (CCR-07); void keeps the number.
6. BR-6 A GRN belongs to exactly one PO; a bill may cover several GRNs of the same PO, never GRNs of different POs.
7. BR-7 `billed_qty` per GRN line = Σ recorded bill line qty attributed in PO-line order (FIFO across GRNs); `billed=false` filter = any line with `billed_qty < qty`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Receive | `purchases.order.write` | ✅ | ✅ | ✅ | ❌ |
| Accept over-receipt | `purchases.bill.void` (admin marker, CCR-08) | ✅ | ✅ | ❌ | ❌ |
| Void GRN | `purchases.bill.void` | ✅ | ✅ | ❌ | ❌ |
| View receipts | `purchases.bill.read` | ✅ | ✅ | ✅ | ✅ |
Receiving posts stock without `inventory.stock.adjust` (document-driven).

#### 13. Edge Cases
1. EC-1 Service lines on a PO → received as a record only (no movement), still count for `received_qty`.
2. EC-2 Item untracked → no movement; receipt recorded.
3. EC-3 Two staff receive the same PO concurrently → PO row `FOR UPDATE`; second sees updated pending or `over_receipt`.
4. EC-4 Receipt dated before a later-dated sale already posted → allowed; it is a non-tail insert in the canonical order (`movement_date`, `sequence_no`) per §17.6.0, so it enqueues `inventory.recompute_item_cost` and `recalc_stock` reproduces the averages exactly.
5. EC-5 PO closed between opening the screen and saving → 409 `document_not_open`.
6. EC-6 Bill recorded for more than received (supplier bills 30, received 20) → bill posts `purchase_in` for the 10 uncovered units (FR-6) and the PO shows "billed ahead of receipt" warning.
7. EC-7 GRN voided after partial bill → 409 `has_dependent_documents`; void the bill first (PUR-04).

#### 14. API Requirements
- `POST /purchases/orders/{id}/receive` (canon §0.8) body per FR-1 → 201 GRN `{ id, number, kind: "goods_receipt", status, po: { id, number, status }, lines[] { po_line_id, item, qty, unit_cost, inbound_unit_cost, on_hand_after }, movements[] ids, estimated_value }`.
- `GET /purchases/receipts`, `GET /purchases/receipts/{id}`, `POST /purchases/receipts/{id}/void { reason }` — path additions (CCR-07).
- PUR-01 delta: `POST /purchases/bills` accepts `po_id` and `meta.grn_ids[]`; response `lines[].covered_by_grn_qty`.
- Errors: 400 `validation_error`, `nothing_to_receive`, `date_before_order`, `line_closed`; 403; 404; 409 `document_not_open`, `over_receipt`, `item_archived`, `insufficient_stock` (void), `has_dependent_documents`, `idempotency_conflict`.

#### 15. Database Impact
`purchases_document` (`kind=goods_receipt`, `po_id`, `status recorded|void`), `purchases_document_line` (qty, unit_cost, `received_qty` unused on GRN lines), PO lines `received_qty`, `inventory_stock_movement` (`purchase_in`, `reversal`), `inventory_item_stock`, `platform_document_sequence` (`goods_receipt`, CCR-07), `files_attachment`, `platform_audit_log`. GRN statuses reuse the bill set (`recorded`, `void`) — no new status.

#### 16. Audit Requirements
`goods_receipt.recorded { po_id, lines, movement_ids, over_receipt: bool, confirmed_by }`, `goods_receipt.voided { reason, reversal_ids }`, `purchase_order.status_changed { from, to }`.

#### 17. Notifications
In-app `over_receipt_confirmed` to owners when an admin accepts an over-receipt (type addition — CCR-06); `po_received` to the PO creator when status becomes `received`.

#### 18. Analytics / Event Tracking
`ub.purchases.grn_recorded { lines, partial: bool, over_receipt: none|blocked|confirmed, via_scanner: bool }`, `ub.purchases.grn_voided`, `ub.purchases.bill_from_grn { grn_count, cost_variance_bucket }`.

#### 19. Security
Idempotency per tenant; PO/GRN scoping (404); over-receipt confirmation checked server-side regardless of client flag; attachment sniffing as PUR-01.

#### 20. Performance
Lock PO row then stock rows in item-id order; bulk insert GRN lines and movements; one `UPDATE` per PO line; ≤ 10 + 3N statements.

#### 21. Testing
- T-PUR-06-1 API: receive 20 of 30 → GRN number, `purchase_in` 20 @ PO cost, PO `partially_received`, no ledger entry.
- T-PUR-06-2 API: receive 35 → 409 `over_receipt` details; with confirm as staff → 403; as owner → 201, PO `received`.
- T-PUR-06-3 API: bill from GRN → no duplicate movement; bill with 10 extra → one `purchase_in` for 10.
- T-PUR-06-4 API: void GRN → reversal, `received_qty` back, PO `sent`; void after bill → 409.
- T-PUR-06-5 unit: `check_po_received_qty` invariant over random receipt/void sequences.
- T-PUR-06-6 component: steppers, over-receipt outline, "Receive all pending".
- T-PUR-06-7 E2E: two-delivery flow then bill creation on mobile.

#### 22. Acceptance Criteria
- AC-1 (US-1) Given a sent PO for 30 Rice, when 30 are received, then on-hand rises by 30 at the PO cost and the PO is `received`.
- AC-2 (US-2) Given 20 received first, when the remaining 10 are received later, then two GRNs exist and `received_qty = 30`.
- AC-3 (US-3) Given 35 entered for 30 ordered, when staff save, then an over-receipt warning blocks; when an owner confirms, then the GRN records 35.
- AC-4 (US-4) Given a received PO, when "Create bill" is used and recorded, then the bill has `po_id`, no additional movements, and the supplier khata shows the bill total.
- AC-5 (US-5) Given two unbilled GRNs, when the accountant opens Receipts → Unbilled, then both appear with `unbilled_value` in the header.

#### 23. Dependencies
PUR-05, PUR-01 (po_id/grn_ids delta), INV stock service, PUR-04 void semantics, sequence `goods_receipt` (CCR-07), CCR-07/08.

#### 24. Future Enhancements
Batch/expiry capture at receipt (INV-16, P3); quality-reject quantities creating a debit note (PUR-07) directly from the GRN; landed cost on GRN (PUR-08 covers bills).

---
### PUR-07 — Debit note / purchase return — Phase 2

#### 1. Business Objective
Give the business a proper document for goods sent back to a supplier or for a supplier's billing error, so that stock leaves at the cost it came in at, the supplier's khata shows that less is owed, and the input tax credit already taken is reversed in the right period — without voiding a correct bill or editing an immutable one. Measures: 100 % of returns traceable to a bill line with quantity caps enforced (CI invariant `check_bill_returned_qty`); issue P95 ≤ 450 ms; every issued debit note carries a GST treatment code and appears in RPT-07's inward ITC-reversal block; zero use of PUR-04 void for partial corrections after this feature ships (tracked as a ratio).

#### 2. User Personas
Owner (OW) — decides to return goods, negotiates the credit, issues the note; Accountant (AC) — reconciles the note against the supplier's GST credit note in GSTR-2B and reverses ITC in GSTR-3B; Staff (ST) — may prepare a draft (`purchases.bill.write`) but not issue or void when the tenant restricts it via `permissions_override`.

#### 3. User Stories
1. US-PUR-07-1 — As an owner I want to return part of a purchase bill and pick exactly which lines and quantities went back, so that my stock and payable both drop by the right amount.
2. US-PUR-07-2 — As an owner I want a standalone debit note for a rate or quantity error on a supplier's bill, so that I can reduce what I owe without any goods moving.
3. US-PUR-07-3 — As an owner I want the note to reduce the open bill automatically, and to keep the rest as a credit with the supplier when the bill is already paid.
4. US-PUR-07-4 — As an owner I want to record the refund when the supplier actually pays me back, so that the khata closes.
5. US-PUR-07-5 — As an accountant I want the note to reverse tax at the bill's original rates and to tell me what to do in GSTR-3B and where (if anywhere) it lands in GSTR-1, so that my returns match my books.
6. US-PUR-07-6 — As an owner I want to be stopped when I try to return more than I bought, or more than is on the shelf.
7. US-PUR-07-7 — As an owner I want to share the note with the supplier on WhatsApp so they issue their credit note.

#### 4. Functional Requirements
1. FR-1 The system shall create `purchases_document` rows with `kind='debit_note'`, statuses `draft`, `issued`, `applied`, `void` (canon §0.7), numbered from `platform_document_sequence` kind `debit_note` (prefix `DN`, e.g. `DN/26-27/0002`) on issue (CCR-07 numbering discipline).
2. FR-2 **Against-bill mode** (`against_id` = a `recorded`/`partially_paid`/`paid`/`overdue` purchase bill of the same supplier): the editor lists the bill's lines with `billed qty`, `already returned` (`purchases_document_line.returned_qty`, the mirror of the sales line column per §21.3.8) and an input `return qty ≤ qty − returned_qty`; `unit_cost`, `discount_type`/`discount_value`, `tax_code`, `tax_rate` and `tax_inclusive` are copied from the bill line and are read-only; `place_of_supply_state`, `is_inter_state`, `reverse_charge`, `itc_eligible`, `supplier_gstin_snapshot` and `party_snapshot` are copied from the bill.
3. FR-3 **Standalone mode** (`against_id` NULL): supplier required, lines free (item or free text where `documents.allow_free_text_lines` permits), `unit_cost` and `tax_code` entered, rates resolved as of `document_date` by `tax.selectors.rate_for`. Used for rate/quantity corrections where nothing physically moves — `restock_out` is forced `false` for such lines.
4. FR-4 Totals shall use the purchase tax engine of §17.7.0 unchanged. In against-bill mode the bill's document discount is allocated proportionally to the returned quantity: `share_i = round2(bill.meta.doc_discount_allocation[line_no] × return_qty / billed_qty)`, deducted from the line's gross before tax; the residual paise of the allocation go to the last returning line (same rule as §17.7.0).
5. FR-5 `restock_out: true|false` (document level, default `true` when any goods line is present) shall control posting of `inventory_stock_movement` rows with `movement_type='purchase_return_out'`, `qty = −return_qty`, `unit_cost = bill line inbound_unit_cost` (standalone: item `inventory_item_stock.avg_cost`), `movement_date = document_date`, `source_type='purchase_document'`, `source_id = debit_note.id`. `false` is used when the supplier accepts a price correction without goods moving, or when goods were already scrapped through INV-06.
6. FR-6 Availability: before posting, `stock_service.check_availability` shall run for every outbound line; a shortfall returns 409 `insufficient_stock` with `details.lines[] { line_no, item_id, requested, available }` unless `inventory.allow_negative_stock` is on.
7. FR-7 On issue (`POST /purchases/debit-notes/{id}/issue`, one `transaction.atomic()`): (a) allocate the number; (b) recompute totals; (c) post the outbound movements (FR-5) — average cost is **not** recomputed (canon outbound rule, BR-5); (d) post one `ledger_entry` `direction='debit'`, `entry_type='debit_note'`, `amount = grand_total`, `entry_date = document_date`, `source_type='purchase_document'`, `source_id = debit_note.id` — the supplier is owed less; (e) increment `returned_qty` on each referenced bill line under `SELECT … FOR UPDATE`; (f) when `against_id` is set and the bill has `amount_due > 0`, auto-apply `min(grand_total, bill.amount_due)` through `purchases_debit_application` (CCR-09), reducing the bill's `amount_due` and recomputing its status; (g) set status `applied` when Σ applications + Σ refund allocations = `grand_total`, else `issued`; (h) audit `debit_note.issued`.
8. FR-8 `settlement ∈ {adjust_against_bill, refund_expected}`: `adjust_against_bill` (default) leaves any unapplied amount as open credit with the supplier, visible on the party header as a positive balance component; `refund_expected` marks the note for follow-up and enables the "Record refund" action, which calls `payment_service.record_payment(direction='in', party=supplier, …)` allocated to the debit note (`payments_allocation.document_type='purchase_document'`, `document_id = debit_note.id`), posting ledger `payment_in` (credit).
9. FR-9 `POST /purchases/debit-notes/{id}/apply { bill_id, amount }` shall apply open credit to another `recorded|partially_paid|overdue` bill of the same supplier, with `amount ≤ min(open credit, bill.amount_due)`; the bill's `amount_paid`/`amount_due`/status are recomputed.
10. FR-10 Void (`POST /purchases/debit-notes/{id}/void { reason }`) shall reverse the movements (`movement_type='reversal'`, `qty = +original`, `reverses_id`), post a ledger `reversal` (credit) marking the original `reversed`, delete the `purchases_debit_application` rows (restoring the bill's `amount_due` and status), decrement `returned_qty`, and refuse while a non-void refund payment exists (400 `validation_error`, `non_field_errors: ["Void the refund payment first"]`, mirroring SAL-04 FR-10).
11. FR-11 **GST treatment** is stored as `meta.gst_treatment ∈ {supplier_credit_note_expected, self_rcm_adjustment, commercial_only}` and drives the copy, the report mapping (BR-8) and the print footer:
    - `supplier_credit_note_expected` (default when the supplier is `regular` and the bill was `itc_eligible`): under Sec 34(1) the **supplier** issues the GST credit note; this document is the business's commercial debit note and the trigger to chase it. ITC of `cgst + sgst + igst + cess` on the note must be reversed in **GSTR-3B Table 4(B)(2)** for the period of issue, and the supplier's credit note will appear in **GSTR-2B (B2B-CDNR)**.
    - `self_rcm_adjustment` (bill had `reverse_charge = true`): the business self-invoiced under Sec 31(3)(f), so it issues its own note under Sec 34(3); it is reported by the business in **GSTR-1 Table 9B (CDNR)** with `note_type='D'`, `reverse_charge='Y'` and the counter-party GSTIN, and the RCM liability in **GSTR-3B 3.1(d)** plus the matching ITC in 4(A)(3) both reduce.
    - `commercial_only` (unregistered/composition tenant, or `itc_eligible = false`): no GST effect; tax on the note is part of cost.
12. FR-12 Reason is mandatory: `reason_code ∈ {goods_returned, damaged_goods, short_supply, rate_correction, qty_correction, discount_agreed, other}` plus free text, stored as `notes` prefixed with the code (no new column — the SAL-04 FR-12 convention).
13. FR-13 A debit note may be created from a bill detail ("Return / Debit note"), from a GRN line (PUR-06 §24 quality-reject path, pre-filling the rejected quantity), or standalone from Purchases → Debit notes → New.
14. FR-14 Print/share: client-side print component `DebitNotePrint` (ADR-014) titled "DEBIT NOTE", showing "Against PB/26-27/0007 dated 12/08/2026 · Supplier invoice AGT/1129", the GST treatment sentence from FR-11 and the tax breakup; `POST /purchases/debit-notes/{id}/share-links` returns a public URL reusing the SAL-06 public document route, and `UbShareSheet` offers WhatsApp with the text of §17 below.
15. FR-15 Previous-FY bills: allowed, with a soft warning "Reverse the credit in a return filed by 30 Nov {yyyy} for the tax effect to stand" (Sec 34 outer limit).

#### 5. Non-Functional Requirements
Issue P95 ≤ 450 ms for 10 lines; prefill from the bill ≤ 300 ms (reuses `GET /purchases/bills/{id}?include=lines` which already returns `returned_qty`); editor usable at 360 px with lines as cards and a capped stepper; i18n keys `purchases.debitNote.*` in `en`/`hi` — `purchases.debitNote.title` = "डेबिट नोट", `purchases.debitNote.return` = "वापसी", `purchases.debitNote.restock` = "स्टॉक से घटाएँ", `purchases.debitNote.openCredit` = "बकाया क्रेडिट"; WCAG AA per §23.6; works offline-degraded as a draft (autosave, PUR-01 FR-8 mechanism).

#### 6. User Flow
Primary: Purchases → bill PB/26-27/0007 → ⋯ → "Return / Debit note" → editor prefilled with the bill's two lines at return qty 0 → Rice 5 of 20 → restock stays on → reason "Damaged goods" → settlement "Adjust against this bill" → consequence strip "Stock −5 NOS Rice · Agro Traders +₹241.50 (you will give less) · Bill due ₹1,679.50" → Issue → success sheet "DN/26-27/0002 issued · applied ₹241.50 to PB/26-27/0007" → Share on WhatsApp.
Alternate A (bill already paid): auto-application finds `amount_due = 0` → the whole note stays open credit → sheet shows "Open credit ₹241.50 with Agro Traders · Apply to another bill / Record refund".
Alternate B (standalone rate correction): Debit notes → New → supplier → line "Rate corrected on AGT/1129" ₹300 GST5, `restock_out` off → Issue → no movement, ledger debit only.
Alternate C (already sold): return 5 but on-hand 2 → 409 `insufficient_stock` → dialog "Rice would go to −3 NOS. Reduce the quantity, adjust stock first, or allow negative stock in Settings."
Alternate D (refund): note `refund_expected` → later "Record refund" → ₹241.50 UPI in → note `applied`, khata flat.
Alternate E (mistake): ⋯ → Void → `UbReasonDialog` with consequences → stock +5, bill due back to ₹1,921.00.

#### 7. UI Requirements
Routes `app/purchases/debit-notes/page.tsx`, `app/purchases/debit-notes/new/page.tsx`, `app/purchases/debit-notes/[id]/page.tsx`. Feature folder `debit-notes` with `redux/debitNoteListSlice.ts` + `debitNoteListThunk.ts` (`fetchDebitNotes`) and `redux/debitNoteEditorSlice.ts` + `debitNoteEditorThunk.ts` (`fetchBillForReturn`, `saveDebitNoteDraft`, `issueDebitNote`, `applyDebitNote`, `recordDebitNoteRefund`, `voidDebitNote`) over `api/debitNoteService.ts`; paths `API_PATHS.DEBIT_NOTES`, `DEBIT_NOTE_BY_ID(id)`, `DEBIT_NOTE_ISSUE(id)`, `DEBIT_NOTE_APPLY(id)`, `DEBIT_NOTE_VOID(id)`, `DEBIT_NOTE_SHARE_LINKS(id)`. Yup `debitNoteSchema`, `debitNoteLineSchema`, `voidReasonSchema`.

Editor: `UbPageHeader` ("Debit note against PB/26-27/0007"), bill summary `MLCard` (number, supplier invoice no./date, grand total, due), `UbAsyncCombobox` (supplier — locked in against-bill mode), `UbDateInput` (`document_date`), `MLSelect` (`reason_code`) + `MLInput` (free text), `MLSwitch` ("Reduce stock", `restock_out`), `MLRadioGroup` (settlement), `UbLineItemsEditor` in **purchase-return mode** — desktop columns # · Item (name + SKU, read-only against a bill) · Billed · Returned so far · Return qty (`UbQuantityInput`, max hint and stepper capped) · Cost (read-only) · Disc (read-only) · GST (read-only) · Taxable · Tax · Total · ⋯; mobile card mode with the stepper and a "Return all" chip per card. `UbTotalsPanel` (right on desktop, bottom summary bar on mobile: "Debit ₹241.50 · Issue"), `UbStatusBanner` for the previous-FY and GST-treatment notices, `UbFileUpload` (photo of the returned goods / transporter docket, `files_attachment.kind='bill_photo'`), `UbConfirmDialog` for issue with the consequence list, `UbReasonDialog` for void, `UbDrawer` for the refund sheet (PAY-01 `mode_breakup` component reused), `UbShareSheet` on the detail.
List: `UbDataGrid` with `UbTabs` All · Open credit · Applied · Void, columns Number · Date · Supplier · Against bill · Amount · Open · Status, `meta.totals { count, grand_total, open_credit }` in the header row; row opens `UbDrawer` detail. Keyboard: `Enter` moves down the Return qty column, `Ctrl+Enter` issues, `F8` opens the refund sheet.

#### 8. UX Requirements
Colour semantics: the debit note reduces what the business owes, so the amount is shown in the `success` family with the label "You will give less"; the supplier's balance chip updates live in the consequence strip. Consequence preview before issue is mandatory and states all three effects in one line ("Stock −5 NOS Rice · Agro Traders +₹241.50 · Bill due ₹1,679.50"). The GST treatment sentence is shown as a quiet `UbHelpHint` next to the totals, never as a blocking dialog: "Agro Traders must send you a credit note. Reverse ₹11.50 ITC in this month's GSTR-3B." Destructive void is outlined, never filled (Koper rule). Defaults: `document_date` today; `restock_out` on for goods; settlement `adjust_against_bill`; reason empty and required. Undo is not offered — the note is a document; correction is by void with a reason.

#### 9. States
| State | UI |
|---|---|
| Initial (new draft) | bill lines listed at qty 0, Issue disabled ("Enter at least one quantity") |
| Loading | `UbSkeleton` line rows while the bill prefill resolves |
| Empty | Debit-notes list first-use: "No debit notes yet — returns start from a purchase bill" + secondary "Standalone debit note" |
| Processing | "Issuing…" with `MLSpinner` in the button; editor read-only |
| Success / Issued | detail with `UbStatusBadge` `issued` and an "Open credit ₹x" chip; actions Apply, Record refund, Print, Share, Void |
| Applied | badge `success`; applications table (bill, amount, date) and refunds list |
| Partial | issued with part applied — both the applied amount and the open credit are shown |
| Void | `UbStatusBanner` danger with reason, actor, time; reversal movement and ledger links |
| Disabled | Issue disabled while invalid/saving; refund action hidden without `payments.payment.write` |
| Error | field/line errors inline; 409 `insufficient_stock` as a per-item dialog; 409 `stale_version` → "The bill changed — reload" |
| Failed | network failure keeps the draft in `debitNoteEditorSlice` with a retry banner |

#### 10. Validation Rules
Yup `debitNoteSchema`: `party_id` required and `is_supplier=true` ("Choose a supplier", `required`/`not_supplier`); `against_id` must be a non-void purchase bill of the same supplier ("Choose a bill of this supplier", `validation_error` on `against_id`); `document_date` ≥ bill `document_date` and ≤ today ("Cannot be before the bill date" `date_before_bill`, "Future dates are not allowed" `future_date`); at least one line with qty > 0 ("Enter a quantity to return", `nothing_to_return`); `lines[i].qty ≤ billed − returned` ("Only {n} {unit} can be returned", `qty_above_billed`); decimal places per the unit's `allow_decimal` (`invalid_qty`, `qty_must_be_whole`); `unit_cost` ≥ 0 with ≤ 4 dp (`invalid_amount`); `reason_code` required ("Choose a reason", `required`), free text ≤ 160; refund `amount ≤ open credit` ("Refund cannot exceed ₹{open}", `amount_above_open_credit`) and Σ `mode_breakup` = refund amount (`mode_sum_mismatch`); `restock_out` ignored for services and free-text lines; `attachment_id` must be a tenant-owned attachment of kind `bill_photo` (`not_found`).

#### 11. Business Rules
1. BR-1 Tax on an against-bill note uses the bill line's snapshotted `tax_code`, `tax_rate`, `tax_inclusive`, `unit_cost` and discount ratio — never today's rate. A bill from before 22/09/2025 returns at `GST12`, and the note prints that rate.
2. BR-2 Quantity cap: `Σ returned_qty across non-void debit notes ≤ billed qty`, enforced with `SELECT … FOR UPDATE` on the bill lines inside the issue transaction; the CI invariant `check_bill_returned_qty` re-derives the cache from the notes.
3. BR-3 Ledger direction: debit note → `debit` (`entry_type='debit_note'`), refund received → `credit` (`payment_in`), void → `reversal` with the opposite direction (§17.7.0). Net khata effect of a fully refunded return is zero.
4. BR-4 Auto-application order: against the referenced bill first, then open credit; manual application (FR-9) is oldest-bill-first when the user picks "Apply to oldest".
5. BR-5 **Valuation.** `purchase_return_out` is an outbound movement, so `inventory_item_stock.avg_cost` is unchanged (canon §21.3.6 outbound rule) even when the returned cost differs from the current average; the value difference stays in the stock account as a variance and is disclosed in INV-08's tooltip ("returns leave at their bill cost; average unchanged"). `recalc_stock` follows the same rule, so the cache and the movements always agree.
6. BR-6 `inventory_item.purchase_price` (last cost) is **not** rolled back by a return — the last purchase really did happen at that cost.
7. BR-7 Numbering `DN/26-27/0002` from the FY of `document_date`; void keeps the number; the sequence is never decremented.
8. BR-8 **GSTR mapping (normative).**

| `meta.gst_treatment` | Trigger | Tenant's GSTR-1 | Tenant's GSTR-3B | Source of truth |
|---|---|---|---|---|
| `supplier_credit_note_expected` | supplier `regular`, bill `itc_eligible`, forward charge | **none** — the GST note is the supplier's (Sec 34(1)) | ITC reversed in **4(B)(2)** for the month of `document_date` | supplier's note in **GSTR-2B B2B-CDNR** |
| `self_rcm_adjustment` | bill `reverse_charge = true` | **Table 9B (CDNR)** — `note_type='D'`, `reverse_charge='Y'`, note no./date, original invoice no./date, POS, rate-wise taxable + IGST/CGST/SGST/cess | RCM liability in **3.1(d)** and ITC in **4(A)(3)** both reduce | the tenant's own note |
| `commercial_only` | tenant `unregistered`/`composition`, or `itc_eligible = false` | none | none | — |

RPT-07 (GST summary) shows every issued debit note in the **inward** section under "ITC reversal (Sec 17 / credit notes)" with the rate-wise split, and only `self_rcm_adjustment` notes are carried into the Phase-2 GSTR-1 JSON export (RPT-12) CDNR block.
9. BR-9 A debit note may reference exactly one bill; one bill may have many debit notes. Multi-bill notes are not supported (see §24).
10. BR-10 PUR-04 BR-5 stands: voiding a bill is blocked while it has non-void debit notes (409 `has_dependent_documents`) — the note must be voided first.
11. BR-11 A debit note cannot be edited after issue; `PATCH` is refused with 409 `document_not_draft`.
12. BR-12 Composition and unregistered tenants issue notes with the supplier's tax shown as part of cost and `meta.gst_treatment='commercial_only'`; the totals panel labels tax "GST (cost)" exactly as PUR-01 FR-11.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View debit notes | `purchases.bill.read` | ✅ | ✅ | ✅ | ✅ |
| Create / edit draft | `purchases.bill.write` (a dedicated `purchases.debit_note.write` is requested — CCR-10) | ✅ | ✅ | ✅ | ❌ |
| Issue | `purchases.bill.write` | ✅ | ✅ | ✅ (tenants may deny via `platform_membership.permissions_override`) | ❌ |
| Apply to another bill | `purchases.bill.write` | ✅ | ✅ | ✅ | ❌ |
| Record refund | `purchases.bill.write` + `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| Void | `purchases.bill.void` | ✅ | ✅ | ❌ | ❌ |
| Export list | `reports.export` | ✅ | ✅ | ❌ | ✅ |
Issuing posts stock without `inventory.stock.adjust` because the movement is document-driven (same rule as PUR-01 and PUR-06).

#### 13. Edge Cases
1. EC-1 Bill already void → cannot create against it (400 `validation_error` on `against_id`: "This bill is void").
2. EC-2 Item archived since purchase → outbound movement still allowed on an archived item; the editor shows an "Archived" chip.
3. EC-3 Returned goods already sold, negative stock disallowed → 409 `insufficient_stock` with the per-item shortfall (Alternate C).
4. EC-4 Return of a tax-inclusive line: taxable is back-calculated on the returned portion from the snapshot rate; the sum of partial returns may differ from the line total by ≤ ₹0.01 — accepted and documented (mirrors SAL-04 EC-3).
5. EC-5 Two users return the same line concurrently → bill line row lock; the second request sees the updated cap or fails `qty_above_billed`.
6. EC-6 Note larger than the bill's due because the bill was partly paid → the excess becomes open credit; the UI suggests "Apply to PB/26-27/0011 (₹4,200 due)".
7. EC-7 Supplier sends a smaller credit note than the business's debit note → the difference stays as open credit; the accountant reconciles from RPT-04 and may issue a second note or void and reissue.
8. EC-8 Free-text line on the original bill (no `item_id`) → returnable, `restock_out` has no effect, no movement.
9. EC-9 Void after a refund was received → blocked (FR-10); void the payment (PAY-05) first.
10. EC-10 Bill from a previous FY → allowed with the FR-15 warning; numbering uses the current FY.
11. EC-11 `restock_out` on for a service line → ignored silently; the print shows no quantity effect.
12. EC-12 Idempotency-Key replayed on issue → the original 201 is returned with `Idempotent-Replayed: true`; a different body on the same key → 409 `idempotency_conflict`.
13. EC-13 Applying open credit to a bill of a different supplier → 400 `validation_error` on `bill_id`.

#### 14. API Requirements
- `GET /purchases/debit-notes?status=&party_id=&against_id=&date_from=&date_to=&q=&ordering=-document_date&page=&page_size=` (canon §0.8 P2 path) → `data[]` `{ id, number, status, party {id,name}, against {id, number, supplier_invoice_number}, document_date, grand_total, applied_amount, open_credit, gst_treatment }`, `meta.totals { count, grand_total, open_credit }` over the filtered set.
- `POST /purchases/debit-notes` `{ against_id?, party_id, document_date, reason_code, reason_note?, restock_out, settlement, lines[] { bill_line_no? , item_id?, description?, qty, unit_cost?, tax_code?, discount_type?, discount_value? }, round_off_enabled?, notes?, attachment_id? }` → 201 draft; with `?issue=true` and `Idempotency-Key` it drafts and issues atomically.
- `PATCH /purchases/debit-notes/{id}` (draft only, `version` required → 409 `stale_version`), `DELETE /purchases/debit-notes/{id}` (draft only).
- `POST /purchases/debit-notes/{id}/issue` → 200 document with `movements[]`, `ledger_entry_id`, `applications[]`, `open_credit`; `POST /purchases/debit-notes/{id}/apply { bill_id, amount }` → 200 `{ data: debit_note, meta: { bill: { id, amount_due, status } } }`; `POST /purchases/debit-notes/{id}/refund { mode_breakup[], payment_date?, reference? }` → 201 payment; `POST /purchases/debit-notes/{id}/void { reason }` → 200; `POST /purchases/debit-notes/{id}/share-links { expires_in_days }` → `{ url, expires_at }`. All sub-paths beyond the canon list are collected as **CCR-11**.
- `GET /purchases/debit-notes/{id}` → document with `lines[]` (each carrying `billed_qty`, `returned_qty_before`), `against`, `applications[]`, `refunds[]`, `movements[]`, `gst_treatment`, `gst_note` (the FR-11 sentence).
- PUR-01/PUR-03 deltas: bill detail gains `debit_notes[] { id, number, grand_total, status }` and `returnable_qty` per line; the bill list gains a `has_debit_notes` boolean for the filter chip.
- Errors: 400 `validation_error` (`details.lines[i].qty`, `date_before_bill`, `nothing_to_return`), 403 `permission_denied`, 404 (cross-tenant), 409 `document_not_draft`, `document_already_void`, `insufficient_stock`, `stale_version`, `has_dependent_documents`, `idempotency_conflict`.

#### 15. Database Impact
Writes: `purchases_document` (`kind='debit_note'`, `against_id`, `number`, `fy_label`, totals, `party_snapshot`, `supplier_gstin_snapshot`, `meta.gst_treatment`, `status`, `voided_at`, `void_reason`), `purchases_document_line` (return lines with snapshots and `landed_cost_share` copied from the bill line for cost fidelity — PUR-08), `purchases_document_line.returned_qty` on the **bill's** lines, new table `purchases_debit_application (id, tenant_id, debit_note_id, bill_id, amount numeric(14,2), created_at)` with `U(debit_note_id, bill_id)` and `IX(tenant_id, bill_id)` — **CCR-09**, mirroring `sales_credit_application`; `inventory_stock_movement` (`purchase_return_out`, `reversal`), `inventory_item_stock` (`on_hand`, `last_movement_at`; `avg_cost` untouched per BR-5), `ledger_entry` (`debit_note`, `payment_in`, `reversal` + `reversed_by_id` on the original), `parties_party` (`balance`, `payable_total`, `last_activity_at`), `payments_payment` / `payments_allocation` (refunds), `platform_document_sequence` (kind `debit_note`), `files_attachment`, `platform_audit_log`. Reads the bill and its lines `FOR UPDATE`. New index requested with CCR-09: `IX(purchases_document.tenant_id, against_id)` for "debit notes of this bill" — the existing `IX(tenant_id, kind, status, document_date DESC)` does not cover it.

#### 16. Audit Requirements
`debit_note.draft_created { against_id, lines }`, `debit_note.issued` (after: number, totals, restock_out, gst_treatment, movement ids, ledger entry id, applications), `debit_note.applied { bill_id, amount }`, `debit_note.refund_recorded { payment_id, amount }`, `debit_note.voided { reason, reversal_movement_ids, reversal_ledger_entry_id, applications_removed }`, plus the `ledger.entry.reversed` row from the ledger service. Snapshots: totals and status before/after on issue and void; the full line set on issue.

#### 17. Notifications
No automatic message to the supplier (WhatsApp is a manual share, ADR-015). In-app `document_voided` to owners when an admin voids a debit note above ₹10,000 (the PUR-04 type, reused). WhatsApp share text: EN `Namaste {party}, debit note {number} for ₹{total} against your bill {supplier_invoice_number} dated {date}. Please send your credit note. {shop}` / HI `नमस्ते {party}, आपके बिल {supplier_invoice_number} ({date}) के विरुद्ध ₹{total} का डेबिट नोट {number}। कृपया अपना क्रेडिट नोट भेजें। {shop}`. Optional supplier SMS is **not** offered (supplier SMS templates are out of scope at Phase 2; only party reminders are automated).

#### 18. Analytics / Event Tracking
`ub.purchases.debit_note_draft_created { against: true|false, source: bill|grn|standalone }`, `ub.purchases.debit_note_issued { against: bool, lines, restock_out, reason_code, settlement, gst_treatment, grand_total_bucket, bill_age_days, auto_applied_amount_bucket }`, `ub.purchases.debit_note_applied { amount_bucket, target: same_bill|other_bill }`, `ub.purchases.debit_note_refund_recorded { modes[], amount_bucket }`, `ub.purchases.debit_note_voided { age_days, had_refund: bool }`, `ub.purchases.debit_note_blocked_stock { items }`, `ub.purchases.debit_note_shared { channel }`.

#### 19. Security
Bill, party, item and attachment ids resolved through the tenant-scoped manager (cross-tenant → 404, never 403); quantity caps and availability enforced server-side regardless of the client state; `Idempotency-Key` scoped per tenant for 24 h; share-link tokens stored as `token_hash` with an expiry and are revocable (SAL-06 mechanism), and the public view exposes only the document, never the supplier's other data; reason and note text is escaped on render and in the print component; every issue/void writes an audit row with the actor, IP and request id.

#### 20. Performance
One transaction; lock order bill → bill lines (by `line_no`) → stock rows (by `item_id`) — identical to PUR-01/PUR-04 so the three cannot deadlock. Query budget ≤ 10 + 3N statements for N lines (`bulk_create` for note lines and movements, one `UPDATE … FROM (VALUES …)` for `returned_qty`, one upsert per item stock row). List uses `IX(tenant_id, kind, status, document_date DESC)`; the bill-detail panel uses the CCR-09 `against_id` index. Prefill is a single bill fetch with `select_related('party')` and `prefetch_related('lines__item')`.

#### 21. Testing
- T-PUR-07-1 unit: against-bill tax uses the snapshot rate — a `GST12` bill line returned today produces 12 % on the note, not 5 %.
- T-PUR-07-2 unit: document-discount share allocated proportionally to the returned quantity with the residual paise on the last returning line.
- T-PUR-07-3 API: return 5 of 20 → `purchase_return_out` −5 at the bill's inbound cost, `avg_cost` unchanged, ledger debit, bill `amount_due` reduced, note `applied`.
- T-PUR-07-4 API: quantity cap — return 15 then 10 of 20 → second 400 with `details.lines[0].qty`.
- T-PUR-07-5 API: `restock_out=false` → no movements, ledger only.
- T-PUR-07-6 API: on-hand 2, return 5, negative stock off → 409 `insufficient_stock`; setting on → 201 with on-hand −3.
- T-PUR-07-7 API: fully paid bill → whole note becomes open credit; `apply` to another bill of the same supplier succeeds, to another supplier 400.
- T-PUR-07-8 API: refund recorded → `payment_in` credit, note `applied`, khata net zero; void with the refund present → 400.
- T-PUR-07-9 API: void → reversal movements and ledger entry, `returned_qty` restored, applications removed, bill back to `partially_paid`.
- T-PUR-07-10 API: void the bill while a live note exists → 409 `has_dependent_documents` (PUR-04 BR-5 regression).
- T-PUR-07-11 unit: `gst_treatment` resolution over the matrix of tenant `gst_type` × `itc_eligible` × `reverse_charge`; RPT-07 inward reversal picks up only issued, non-void notes.
- T-PUR-07-12 unit: `check_bill_returned_qty` invariant over random issue/void sequences.
- T-PUR-07-13 permission: accountant create → 403; staff issue → 201; staff void → 403; refund without `payments.payment.write` → 403.
- T-PUR-07-14 component: return-mode editor caps the stepper at remaining qty; consequence strip text; GST hint copy per treatment.
- T-PUR-07-15 E2E (mobile 360 px): bill → return 1 line → issue → share sheet → void.

#### 22. Acceptance Criteria
- AC-1 (US-PUR-07-1) Given PB/26-27/0007 with 20 NOS Rice at ₹46, when I issue a debit note for 5 NOS, then a `purchase_return_out` of −5 at ₹46.0000 exists, the bill line shows returned 5/20, and Agro Traders' balance rises by ₹241.50 ("you will give less").
- AC-2 (US-PUR-07-2) Given no bill selected, when I issue a standalone debit note of ₹300 with `restock_out` off, then no stock movement exists and the supplier's khata shows a ₹300 debit.
- AC-3 (US-PUR-07-3) Given the bill has ₹1,921.00 due, when the note of ₹241.50 is issued, then ₹241.50 is auto-applied, the bill's due becomes ₹1,679.50 and the note is `applied`; given the bill was fully paid, then the note stays `issued` with open credit ₹241.50.
- AC-4 (US-PUR-07-4) Given an open credit of ₹241.50 with settlement `refund_expected`, when I record a ₹241.50 UPI receipt, then a `payment_in` ledger credit exists, the note is `applied` and the supplier balance returns to its pre-note value.
- AC-5 (US-PUR-07-5) Given a `regular` tenant, an `itc_eligible` forward-charge bill and an issued note, when the accountant opens the note, then `gst_treatment` is `supplier_credit_note_expected`, the note is absent from GSTR-1 and RPT-07 lists ₹11.50 under inward ITC reversal; given the bill had `reverse_charge = true`, then `gst_treatment` is `self_rcm_adjustment` and the note appears in the GSTR-1 9B (CDNR) block with `note_type='D'`.
- AC-6 (US-PUR-07-6) Given 20 billed and 18 already returned, when I enter 5, then the field shows "Only 2 NOS can be returned" and Issue stays disabled; given on-hand is 2 and negative stock is off, when I issue for 5, then 409 `insufficient_stock` names Rice and the shortfall.
- AC-7 (US-PUR-07-7) Given an issued note, when I tap Share → WhatsApp, then `wa.me` opens with the FR-14 text including the number, amount and the supplier's invoice number, and a share link valid for 7 days.

#### 23. Dependencies
PUR-01 (bill, lines, tax engine, `inbound_unit_cost`), PUR-03 (list patterns), PUR-04 (void semantics and BR-5 dependency block), PUR-06 (quality-reject entry point), PUR-08 (`landed_cost_share` carried onto return lines), INV-06 (`stock_service.post_movement`, `check_availability`, negative-stock setting), LED-03 (reversal semantics), PAY-01/PAY-05 (refund payment and its void), SAL-04 (mirrored design), SAL-06 (public document route and share links), RPT-04/RPT-07 (purchase register and GST summary), `UbLineItemsEditor` return mode, `UbReasonDialog`, sequence kind `debit_note`, CCR-09 (`purchases_debit_application` + index), CCR-10 (permission codename), CCR-11 (sub-paths).

#### 24. Future Enhancements
One debit note against several bills of the same supplier (needs a link table like `purchases_debit_application` extended to many origins); automatic matching of the supplier's GSTR-2B credit note to the note (Phase 3, with the reconciliation module); RPT-12 GSTR-1 JSON export carrying the `self_rcm_adjustment` CDNR block; batch/expiry-aware returns once INV-16 lands; a "Return to supplier" shortcut from the low-stock and damaged-goods flows; supplier-side e-invoice acknowledgement (Phase 3).

---
### PUR-08 — Landed cost allocation — Phase 2

#### 1. Business Objective
Make the cost of an item the cost of *getting it onto the shelf*, not just the price on the supplier's bill. Freight, insurance, loading, packing and octroi-style charges are spread across the lines of a purchase so that the weighted-average cost, the stock valuation and every margin figure downstream tell the truth. Measures: Σ of allocated shares equals the charge total to the paisa on 100 % of allocations (CI invariant `check_landed_cost_sum`); allocation preview renders ≤ 200 ms for 50 lines; ≥ 60 % of distribution/wholesale tenants who record freight use the feature within 60 days; gross-margin error attributable to unallocated freight drops to zero for bills that carry charges.

#### 2. User Personas
Owner (OW) — enters the charges and picks the basis; Accountant (AC) — reviews the allocation, the ITC treatment of each charge and the variance on post-record allocations; Staff (ST) — may see the landed cost on the bill but does not add charges.

#### 3. User Stories
1. US-PUR-08-1 — As an owner I want to add freight and other charges to a purchase bill and have them spread over the items, so that my cost per unit is the real cost.
2. US-PUR-08-2 — As an owner I want to choose how each charge is spread — by value, by quantity or by weight — because freight follows weight while insurance follows value.
3. US-PUR-08-3 — As an owner I want to see the before-and-after unit cost of every line before I record the bill, so that I can sanity-check the numbers.
4. US-PUR-08-4 — As an owner I want the average cost of each item to be updated using the landed cost, so that stock value and profit are right.
5. US-PUR-08-5 — As an owner I want to add the transporter's charge to a bill I already recorded, when his bill reaches me a week later.
6. US-PUR-08-6 — As an accountant I want to say whether each charge's GST is claimable, and to see the leftover cost when some of the goods are already sold.
7. US-PUR-08-7 — As an owner I want the transporter's charge to become a payable to *him*, not to the goods supplier.

#### 4. Functional Requirements
1. FR-1 A purchase bill (PUR-01) gains a **Charges** section holding zero or more rows in the new table `purchases_landed_cost_charge` (**CCR-12**): `id, tenant_id, document_id (FK purchases_document), charge_type, label, amount numeric(14,2), tax_code, tax_amount numeric(14,2), itc_eligible boolean, allocation_method, source, party_id NULL, expense_id NULL, linked_document_id NULL, sort_order, created_at, created_by_id`; `IX(tenant_id, document_id)`.
2. FR-2 `charge_type ∈ {freight, insurance, loading, packing, customs_duty, octroi, clearing, other}`; `label` is free text (≤ 60) shown on screen and in print; `allocation_method ∈ {by_value, by_quantity, by_weight, none}` — `none` keeps the charge out of item cost (it is a period cost) and is the only method that produces no `landed_cost_share`.
3. FR-3 `source ∈ {on_bill, third_party, already_recorded}` decides the liability:
   - `on_bill` — the charge is part of the supplier's own bill; it is posted as a **non-stock line** of the bill (`item_id NULL`, description = label, `qty = 1`, `tax_code` as entered) so the supplier ledger credit and the bill's `grand_total` already include it. The line is excluded from stock posting and re-enters as a charge for allocation, never double-counted (BR-2).
   - `third_party` — the charge is owed to another party (`party_id` required): on record the system creates an `expenses_expense` (`category` = the seeded "Transport" category for freight/clearing, "Purchases-misc" otherwise, `party_id`, `amount`, `tax_code`, `tax_amount`, `reference = bill.number`, `note = 'Landed cost on {bill.number}'`) and stores its id in `expense_id`; if the expense is marked unpaid it posts the supplier-style ledger credit for that party per §22.10.
   - `already_recorded` — the user points at an existing `expenses_expense` or `purchases_document` (`linked_document_id`); nothing new is posted, only the allocation.
4. FR-4 **Allocable amount of a charge.** `itc_claimable_charge = tenant.gst_type == 'regular' AND charge.itc_eligible`; `allocable = amount` when `itc_claimable_charge` (the tax is recoverable and never enters cost), else `allocable = amount + tax_amount`. `amount` is always the pre-tax value of the charge; `tax_amount` is computed by `tax.services.compute_line` from `tax_code` and the bill's `is_inter_state`.
5. FR-5 **Allocation basis weights** per bill line `i` (only lines with `track_stock = true` and `item_type = 'goods'` take a share; service, free-text and `none`-method lines get `landed_cost_share = 0`):
   - `by_value` → `w_i = taxable_value_after_doc_discount_i` (the §17.7.0 figure).
   - `by_quantity` → `w_i = qty_i` in the line's primary unit. When the participating lines carry more than one distinct `unit_code` the editor shows the warning "Quantities are in different units (NOS, KGS) — by value or by weight is usually fairer"; the allocation still runs.
   - `by_weight` → `w_i = qty_i × item.net_weight_kg` using the new nullable column `inventory_item.net_weight_kg numeric(12,4)` (**CCR-14**, editable on the INV-01 item form under "Logistics"). A participating line whose item has no weight blocks the allocation with 400 `missing_weight` and `details.items[] { id, name }`.
6. FR-6 **Allocation algorithm (normative, per charge).** Let `C` be `allocable` in paise (`C = allocable × 100`, an integer), and `w_i ≥ 0` the weights of the participating lines with `W = Σ w_i`.
   ```
   if W == 0            → 400 validation_error `no_allocation_base`
   raw_i   = C × w_i / W                       # exact rational, Decimal, no rounding yet
   base_i  = floor(raw_i)                      # whole paise, truncated
   R       = C − Σ base_i                      # 0 ≤ R < number of participating lines
   frac_i  = raw_i − base_i                    # fractional paise remainder
   order   = lines sorted by frac_i DESC, then line_no ASC
   the first R lines in `order` receive one extra paisa each
   share_i = (base_i + extra_i) / 100          # numeric(14,2)
   ```
   This is the largest-remainder rule; it guarantees `Σ share_i = allocable` exactly, is deterministic (the `line_no` tie-break removes all ambiguity) and is implemented once in `purchases/services/landed_cost_service.py::allocate(charge, lines)`. The per-line total is `landed_cost_share_i = Σ over charges of share_i`, stored in `purchases_document_line.landed_cost_share` (§21.3.8).
7. FR-7 **Landed unit cost.** `landed_unit_cost_i = round4( (cost_base_i + landed_cost_share_i) / qty_i )`, where `cost_base_i` is the §17.7.0 figure (`taxable_value_after_doc_discount` when `itc_claimable`, else `line_total`). This value replaces `inbound_unit_cost` everywhere PUR-01 FR-6 uses it: the `purchase_in` movement's `unit_cost`, the weighted-average update of `inventory_item_stock.avg_cost` (§21.3.6 rule, unchanged), and `inventory_item.purchase_price` (last cost).
8. FR-8 **Worked example (normative).** Extending the §17.7.0 bill with a third line — tenant Maharashtra, `regular`, `itc_eligible = true`, intra-state, so `cost_base` = taxable:

   | # | Item | Qty | Unit | Taxable | Weight/unit | Line weight |
   |---|---|---|---|---|---|---|
   | 1 | Rice | 20 | NOS | 920.00 | 5.0000 kg | 100.000 kg |
   | 2 | Sugar | 50 | KGS | 1,862.00 | 1.0000 kg | 50.000 kg |
   | 3 | Dal | 10 | KGS | 950.00 | 1.0000 kg | 10.000 kg |
   | | | 80 | | **3,732.00** | | **160.000 kg** |

   Charges: Insurance ₹100.00 `by_value`; Freight ₹1,250.00 `by_weight`; Loading ₹150.00 `by_quantity` (all with `itc_eligible = true`, so `allocable = amount`).

   *Insurance, by value* — `raw` in paise: Rice `10000 × 920/3732 = 2465.1661`, Sugar `4989.2818`, Dal `2545.5520`. `base` = 2465 / 4989 / 2545, Σ = 9999, `R = 1`. Fractions 0.1661 / 0.2818 / 0.5520 → the extra paisa goes to Dal. **Shares 24.65 · 49.89 · 25.46 (Σ 100.00).**

   *Freight, by weight* — `raw`: Rice `125000 × 100/160 = 78125.0000`, Sugar `39062.5000`, Dal `7812.5000`. `base` Σ = 124999, `R = 1`. Fractions 0.0000 / 0.5000 / 0.5000 → tie between Sugar and Dal, broken by ascending `line_no` → Sugar. **Shares 781.25 · 390.63 · 78.12 (Σ 1,250.00).**

   *Loading, by quantity* — `raw`: `15000 × 20/80 = 3750`, `9375`, `1875`; no remainder, `R = 0`. **Shares 37.50 · 93.75 · 18.75 (Σ 150.00).**

   `landed_cost_share`: Rice `24.65 + 781.25 + 37.50 = 843.40`; Sugar `49.89 + 390.63 + 93.75 = 534.27`; Dal `25.46 + 78.12 + 18.75 = 122.33`; Σ = 1,500.00 = 100 + 1,250 + 150. ✓

   `landed_unit_cost`: Rice `(920.00 + 843.40)/20 = 88.1700`; Sugar `(1,862.00 + 534.27)/50 = 47.9254`; Dal `(950.00 + 122.33)/10 = 107.2330` (against 46.0000 / 37.2400 / 95.0000 without landed cost).

   Weighted average, Rice with 10 NOS on hand at ₹44.0000 before: `new_avg = (10 × 44.0000 + 20 × 88.1700) / 30 = 2,203.40/30 = 73.4467` (round4).
9. FR-9 **Preview.** `POST /purchases/bills/{id}/landed-costs/preview` (draft or recorded) returns, without writing anything, `lines[] { line_no, item, qty, cost_base, share_by_charge[], landed_cost_share, unit_cost_before, unit_cost_after, avg_cost_before, avg_cost_after }` and `charges[] { id, label, allocable, allocated, residual_paise_to }`. The editor renders this live (debounced 300 ms) — it is a preview only; the server recomputes on record (§0.11 rule 3).
10. FR-10 **Record-time path (primary).** Charges entered before `POST /purchases/bills/{id}/record` are allocated inside the same transaction, *before* movements are posted, so every `purchase_in` carries the landed unit cost from birth and no revaluation is needed. This is the only path the UI encourages.
11. FR-11 **Post-record path.** `POST /purchases/bills/{id}/landed-costs` on a `recorded`/`partially_paid`/`paid`/`overdue` bill adds charges and revalues, because the bill's movements are immutable (§0.11 rule 1) and a zero-quantity movement is forbidden (`CHECK qty <> 0`). Per participating line:
    ```
    revalue_qty_i = min(qty_i, item_stock.on_hand_i)          # only what is still on the shelf
    absorbed_i    = round2(share_i × revalue_qty_i / qty_i)
    variance_i    = share_i − absorbed_i                      # cost of units already sold
    avg_new_i     = round4(avg_old_i + absorbed_i / on_hand_i)  # on_hand_i > 0
    ```
    The revaluation writes one row per line to the new table `inventory_valuation_adjustment` (**CCR-13**: `id, tenant_id, item_id, variant_id NULL, location_id, adjustment_date, value_delta numeric(14,2), qty_at_adjustment numeric(14,3), avg_cost_before/avg_cost_after numeric(14,4), source_type, source_id, reason varchar(32), created_by_id, created_at`; `IX(tenant_id, item_id, adjustment_date)`) and updates `inventory_item_stock.avg_cost`. `manage.py recalc_stock` replays movements and valuation adjustments interleaved in `(date, created_at)` order, so the cache stays reproducible. When `on_hand_i ≤ 0` the whole share is variance.
12. FR-12 **Variance treatment.** `Σ variance_i` is shown on the bill as "Landed cost not absorbed (goods already sold) ₹x" and is included in RPT-04's purchase register as a memo column. When the setting `purchases.landed_cost_variance_to_expense` (**CCR-15**) is on, the revaluation also records an `expenses_expense` in the "Purchases-misc" category for the variance so the P&L picks it up; default off at Phase 2.
13. FR-13 Deleting a charge: `DELETE /purchases/bills/{id}/landed-costs/{charge_id}` is allowed only while the bill is `draft` (409 `document_not_draft` otherwise); on a recorded bill the correction path is a compensating charge with a negative `amount` (allowed, |amount| ≤ the charge already allocated) which revalues in the opposite direction.
14. FR-14 Defaults: `purchases.landed_cost_default_method` (CCR-15, default `by_value`) pre-selects the method for a new charge; the last used `charge_type`/`label` pair per tenant is offered as a chip row ("Freight ₹—", "Loading ₹—").
15. FR-15 Print and detail: the bill's print component shows a Charges block (label, amount, basis) and a per-line "Landed cost/unit" column when any charge exists; the bill detail shows both `unit_cost` and `landed_unit_cost` per line with the delta as a percentage.

#### 5. Non-Functional Requirements
Preview P95 ≤ 200 ms for 50 lines × 6 charges (pure Decimal arithmetic, no DB round-trip beyond the bill fetch); record with charges adds ≤ 80 ms to PUR-01's budget; post-record revaluation P95 ≤ 500 ms for 50 lines; all arithmetic in `Decimal` with `ROUND_HALF_UP` server-side and `decimal.js-light` client-side using the identical algorithm (shared test vectors from FR-8); mobile-first — the charges list is a card stack below the totals on < 640 px; i18n `purchases.landedCost.*` (`purchases.landedCost.title` = "अतिरिक्त खर्च", `purchases.landedCost.freight` = "भाड़ा", `purchases.landedCost.byWeight` = "वज़न के अनुसार", `purchases.landedCost.perUnitAfter` = "प्रति यूनिट लागत"); accessible numeric tables with `ds-num` tabular figures and right alignment.

#### 6. User Flow
Primary: bill editor → lines entered → "Add charges" → charge sheet: type Freight, label "Transporter — Shree Roadlines", amount 1,250, GST 5 % ITC yes, basis **By weight**, source **Third party → Shree Roadlines** → Add → repeat for Insurance (by value) and Loading (by quantity) → the totals panel grows a "Charges ₹1,500.00" row and each line card shows "₹46.00 → ₹88.17/unit" → Record → toast "PB/26-27/0009 recorded · Cost includes ₹1,500 charges · You will give ₹2,921.00 to Agro Traders and ₹1,312.50 to Shree Roadlines".
Alternate A (post-record): bill detail → ⋯ → "Add landed cost" → warning card "This bill is already recorded — costs will be revalued for the quantity still in stock" → charge added → result sheet "Rice avg ₹73.45 → ₹78.66 · ₹210.85 not absorbed (14 NOS already sold)".
Alternate B (missing weight): basis By weight and Dal has no weight → inline error "Set a weight for Dal to allocate by weight" with a link that opens the item drawer; after saving the weight the preview refreshes.
Alternate C (charge already recorded as an expense): source "Already recorded" → picker over recent unlinked expenses of the transport categories → allocation only.
Alternate D (period cost): basis "Do not add to item cost" → the charge is recorded (expense or bill line) but no `landed_cost_share` is written and the preview shows all lines unchanged.

#### 7. UI Requirements
Routes: none new — the feature lives inside `app/purchases/bills/new/page.tsx`, `.../[id]/edit/page.tsx` and `.../[id]/page.tsx`. Feature folder `purchase-bills` gains `components/LandedCostSection.tsx`, `components/LandedCostChargeSheet.tsx`, `components/LandedCostPreviewTable.tsx`, `view-model/landedCostAllocation.ts` (the client mirror of FR-6), `redux/landedCostSlice.ts` (`charges[]`, `preview`, `previewStatus`, `errors`) and `redux/landedCostThunk.ts` (`previewLandedCost`, `addLandedCostCharge`, `removeLandedCostCharge`, `applyLandedCostToRecordedBill`) over `api/purchaseBillService.ts`; paths `API_PATHS.BILL_LANDED_COSTS(id)`, `BILL_LANDED_COST_PREVIEW(id)`, `BILL_LANDED_COST_BY_ID(id, chargeId)`. Yup `landedCostSchema`, `landedCostChargeSchema`.

Components: `LandedCostSection` is an `MLCard` under `UbTotalsPanel` on desktop (right column) and a collapsible card above the sticky bar on mobile, listing charges as `MLItem` rows (icon by `charge_type`, label, amount, basis chip, source chip, ⋯ menu edit/remove) with an "Add charge" `MLButton` (ghost, `+`). `LandedCostChargeSheet` is a `UbDrawer` with `MLSelect` (`charge_type`), `MLInput` (label), `UbMoneyInput` (amount), `MLSelect` (`tax_code`), `MLSwitch` (`itc_eligible`), `MLRadioGroup` (`allocation_method`, four options with one-line explanations), `MLRadioGroup` (`source`) and, conditionally, `UbAsyncCombobox` (party) or an expense picker. `LandedCostPreviewTable` is a `UbDataGrid` in compact density — columns Item · Qty · Cost base · Insurance · Freight · Loading · Total charge · Cost/unit before · Cost/unit after · Δ% — with a totals footer that must equal the charge amounts (a red footer cell if it ever does not, which is a bug guard). `UbStatusBanner` (tone warning) for the post-record path; `UbConfirmDialog` before applying a post-record revaluation, listing per-item avg-cost before/after and the unabsorbed variance; `UbHelpHint` on each basis option. Desktop keyboard: `Alt+C` opens the charge sheet, `Esc` closes, `Enter` adds.

#### 8. UX Requirements
Copy names the effect, never the mechanism: "Spread over items by weight", not "allocate pro rata". Each line card shows the before → after unit cost inline (`₹46.00 → ₹88.17`) with the delta in `ds-caption`; colour is neutral because a cost rise is neither good nor bad. The charges total appears in `UbTotalsPanel` as its own row **below** the document total with the note "Charges are added to item cost, not to what you owe {supplier}" whenever any charge is `third_party` — this is the single most misunderstood point and the copy is mandatory. The post-record confirm dialog states the irreversibility plainly: "Average cost changes now. Past sales keep the cost they were sold at." Defaults: basis from the tenant setting; `itc_eligible` follows the bill; `source` defaults to `on_bill` when the charge is typed while the supplier field is focused, else `third_party`.

#### 9. States
| State | UI |
|---|---|
| Initial | Charges card with "No charges" and an "Add charge" button |
| Loading | preview skeleton rows in `LandedCostPreviewTable` |
| Empty | preview hidden entirely until the first charge exists |
| Processing | "Calculating…" chip on the preview header; Record disabled while a preview is in flight |
| Success (draft) | preview table populated; totals footer matches |
| Success (post-record) | result sheet with per-item avg before/after and the variance |
| Partial | some charges `none` basis → shown greyed with "not in item cost" |
| Error | `missing_weight` inline per item with a fix link; `no_allocation_base` ("No goods lines to spread this charge over"); `document_not_draft` on delete |
| Disabled | charge actions hidden without `purchases.bill.write`; post-record apply hidden without `inventory.stock.adjust` |
| Completed | recorded bill detail shows the Charges block and the landed column |
| Failed | network failure keeps `charges[]` in the slice; retry banner |

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| `charge_type` | required, in the FR-2 set | "Choose a charge type" | `required` / `invalid_choice` |
| `label` | ≤ 60 | "Keep the label under 60 characters" | `max_length` |
| `amount` | required, ≠ 0, ≤ 2 dp, \|amount\| ≤ 10,00,000; negative only as a correction on a recorded bill | "Enter an amount" / "Negative charges are only allowed to correct a recorded bill" | `required` / `invalid_amount` / `negative_not_allowed` |
| `tax_code` | active `tax_rate.code` on `document_date` | "Unknown or expired GST code" | `invalid_tax_code` |
| `allocation_method` | required, in the FR-2 set | "Choose how to spread this charge" | `required` |
| `source` | required; `party_id` required for `third_party`; `linked_document_id` required for `already_recorded` | "Choose who is being paid" | `required` / `not_found` |
| `party_id` | tenant party, `is_supplier = true` | "Choose a supplier" | `not_supplier` |
| basis weights | `Σ w > 0` over participating lines | "No goods lines to spread this charge over" | `no_allocation_base` |
| `by_weight` | every participating item has `net_weight_kg > 0` | "Set a weight for {item} to allocate by weight" | `missing_weight` |
| post-record negative | \|amount\| ≤ already-allocated amount for that charge type | "Cannot reverse more than was added" | `amount_above_allocated` |
| bill status | charges editable on `draft`; add-and-revalue on recorded; never on `void` | "This bill is void" | `document_already_void` |

#### 11. Business Rules
1. BR-1 `Σ landed_cost_share over all lines = Σ allocable over all charges with a method ≠ none`, exactly, in paise — enforced by FR-6 and asserted by `check_landed_cost_sum` in CI and by an assertion inside the service before the transaction commits.
2. BR-2 An `on_bill` charge is a bill line **and** a charge row; it is excluded from the allocation base (it is not a goods line) and its amount is never added to the bill total twice — the charge row carries `linked_document_line_no` in `purchases_landed_cost_charge.linked_document_id`'s sibling field? No: the bill line is identified by `sort_order` matching and the service asserts `Σ on_bill charges = Σ non-stock line totals` before allocating.
3. BR-3 `third_party` charges never touch the goods supplier's ledger; they create their own expense and their own party balance effect (FR-3). The bill's `grand_total`, `amount_due` and the supplier's khata are computed from the bill lines alone.
4. BR-4 A charge's own GST is cost only when it cannot be claimed (FR-4) — the same rule as the bill's `inbound_unit_cost` in §17.7.0, applied to charges.
5. BR-5 Services, free-text lines and `track_stock = false` items never receive a share; if a bill has only such lines, any charge with a method ≠ `none` fails `no_allocation_base`.
6. BR-6 Record-time allocation is the canonical path; the post-record path is a revaluation, not a restatement — past `sale_out` movements keep their `unit_cost` snapshot and past COGS is never rewritten (immutability, §0.11 rule 1).
7. BR-7 Residual paise are assigned by the largest-remainder rule with a `line_no` tie-break (FR-6) — deterministic, so re-running the preview and the record produce byte-identical shares.
8. BR-8 Rounding: weights use the full precision of `qty` (3 dp) and `net_weight_kg` (4 dp); `raw_i` is an exact `Decimal` quotient carried to 10 dp before truncation to paise; only `share_i` (2 dp) and `landed_unit_cost` (4 dp) are stored.
9. BR-9 Void of a bill with charges (PUR-04) reverses the `purchase_in` movements at their landed `unit_cost` (so the reversal is value-neutral), voids the `third_party` expenses it created (`expenses_expense` → `void` with reason "Purchase bill voided"), and leaves `already_recorded` links untouched; `avg_cost` is not recomputed, exactly as PUR-04 BR-4.
10. BR-10 A debit note (PUR-07) against a bill with charges returns goods at the **landed** cost: the return line copies `landed_cost_share` pro rata to the returned quantity, and the `purchase_return_out` movement's `unit_cost` is the landed unit cost. Charges themselves are not refunded by the note.
11. BR-11 Landed cost is per bill; it never spans bills. A freight bill covering three purchase bills must be split by the user into three charges (one per bill) — the UI offers "Split this charge across bills" only in §24.
12. BR-12 `inventory_item.purchase_price` (last cost) stores the landed unit cost, so PUR-01's "last cost" hint and the default cost on the next bill reflect reality.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View charges & landed cost | `purchases.bill.read` | ✅ | ✅ | ✅ | ✅ |
| Add/edit/remove charges on a draft | `purchases.bill.write` | ✅ | ✅ | ✅ | ❌ |
| Create the `third_party` expense | `purchases.bill.write` + `expenses.expense.write` | ✅ | ✅ | ✅ | ❌ |
| Apply landed cost to a recorded bill (revaluation) | `purchases.bill.write` + `inventory.stock.adjust` | ✅ | ✅ | override only | ❌ |
| Set `net_weight_kg` on an item | `inventory.item.write` | ✅ | ✅ | ✅ | ❌ |
| Change the default method setting | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
1. EC-1 One goods line only → that line takes the whole charge; `R = 0` by construction.
2. EC-2 A line with `qty` so small that `raw_i < 1` paisa → `base_i = 0` and it competes for the residual on its fraction; a line may legitimately receive ₹0.00.
3. EC-3 Charge larger than the goods value (₹5,000 freight on ₹800 of goods) → allowed with the warning "Charges are larger than the goods value — check the amount"; unit cost rises accordingly.
4. EC-4 `by_weight` where all weights are equal → identical to `by_quantity`; no special case.
5. EC-5 Mixed units under `by_quantity` → warning (FR-5), allocation proceeds.
6. EC-6 Post-record revaluation when every unit is already sold (`on_hand = 0`) → `absorbed = 0`, the full share is variance, `avg_cost` untouched, and the result sheet says so plainly.
7. EC-7 Negative on-hand (negative stock allowed) → treated as `on_hand ≤ 0`: full variance, no revaluation, because dividing by a negative on-hand would corrupt the average.
8. EC-8 Two users add charges to the same draft concurrently → the bill row is locked `FOR UPDATE` on record; the preview is client-side so it simply refreshes.
9. EC-9 A `third_party` charge whose party is archived → 400 `validation_error` on `party_id`; restore the party or pick another.
10. EC-10 Item archived between record and a post-record revaluation → revaluation still allowed (valuation is not a user-facing stock action).
11. EC-11 Rounding stress: 47 lines and a ₹1.00 charge → 100 paise spread over 47 lines; 47 lines get 2 paise and 6 lines get 3 paise? — the algorithm gives `base = 2` paise to each (Σ 94) and distributes the remaining 6 paise to the 6 largest fractions; `Σ = 100` is asserted.
12. EC-12 Charge deleted on a draft after the preview was shown → preview recomputes; `landed_cost_share` is only ever persisted at record time.
13. EC-13 Bill voided after a post-record revaluation → the revaluation is **not** unwound (it was a valuation event, not a document effect); the void dialog states "Average cost is not rolled back" (PUR-04 FR-4 copy, reused).

#### 14. API Requirements
- `GET /purchases/bills/{id}/landed-costs` → `{ data: { charges[], lines[] { line_no, landed_cost_share, landed_unit_cost }, totals: { charges_total, allocable_total, allocated_total, variance_total } } }`.
- `POST /purchases/bills/{id}/landed-costs` body `{ charges: [ { charge_type, label, amount, tax_code?, itc_eligible?, allocation_method, source, party_id?, linked_document_id? } ], apply: true|false }` → on a draft, 200 with the recomputed preview (`apply` ignored); on a recorded bill with `apply: true` and `Idempotency-Key`, 200 with `{ revaluations[] { item_id, on_hand, avg_cost_before, avg_cost_after, absorbed, variance }, variance_total, expense_ids[] }`.
- `POST /purchases/bills/{id}/landed-costs/preview` body as above → 200 preview, writes nothing.
- `DELETE /purchases/bills/{id}/landed-costs/{charge_id}` → 204 (draft only).
- PUR-01 deltas: `POST /purchases/bills` and `PATCH` accept an inline `landed_costs[]` array with the same charge shape; `POST /purchases/bills/{id}/record` allocates before posting movements; every bill response gains `landed_costs[]`, and each line gains `landed_cost_share` and `landed_unit_cost`.
- These paths are additions to canon §0.8 — collected as **CCR-16**.
- Errors: 400 `validation_error` (`missing_weight` with `details.items[]`, `no_allocation_base`, `invalid_amount`, `negative_not_allowed`, `amount_above_allocated`), 403 `permission_denied`, 404, 409 `document_not_draft` (delete), `document_already_void`, `stale_version`, `idempotency_conflict`.

#### 15. Database Impact
New: `purchases_landed_cost_charge` (FR-1, **CCR-12**) with `IX(tenant_id, document_id)`; `inventory_valuation_adjustment` (FR-11, **CCR-13**) with `IX(tenant_id, item_id, adjustment_date)`; `inventory_item.net_weight_kg numeric(12,4) NULL` (**CCR-14**, added nullable — no backfill, no lock per §21.8); tenant settings `purchases.landed_cost_default_method`, `purchases.landed_cost_variance_to_expense` in `platform_tenant_setting` (**CCR-15**). Written: `purchases_document_line.landed_cost_share` (existing column, §21.3.8), `inventory_stock_movement.unit_cost`/`avg_cost_after` (landed values, record path), `inventory_item_stock.avg_cost`, `inventory_item.purchase_price`, `expenses_expense` (+ `ledger_entry` for unpaid third-party charges and `parties_party` caches), `platform_audit_log`. Read: bill + lines + item stock rows `FOR UPDATE` in `item_id` order. `manage.py recalc_stock` is extended to replay `inventory_valuation_adjustment` interleaved with movements by `(date, created_at)`.

#### 16. Audit Requirements
`landed_cost.charges_saved { bill_id, charges: [{type, amount, method, source}], allocated_total }` (draft edits, before/after charge set), `landed_cost.allocated { bill_id, per_line: [{line_no, share, unit_cost_before, unit_cost_after}] }` written inside the record transaction, `landed_cost.revalued { bill_id, per_item: [{item_id, on_hand, avg_before, avg_after, absorbed, variance}], variance_total }`, `landed_cost.charge_removed { charge_id, amount }`, plus the standard `expense.recorded` rows for third-party charges. Snapshots are full for the revaluation (it is a valuation change with no movement to point at) — this audit row is the only human-readable trace, so it is mandatory and never batched.

#### 17. Notifications
In-app `landed_cost_revalued` to owners when a post-record revaluation changes any item's `avg_cost` by more than 10 %: "Average cost of Rice changed from ₹73.45 to ₹78.66 after adding freight to PB/26-27/0009" with a route to the bill (a new `notifications_notification.type`, collected with CCR-06's type list). No SMS or WhatsApp — this is internal bookkeeping.

#### 18. Analytics / Event Tracking
`ub.purchases.landed_cost_charge_added { charge_type, allocation_method, source, amount_bucket, itc_eligible }`, `ub.purchases.landed_cost_previewed { charges, lines, duration_ms }`, `ub.purchases.landed_cost_allocated { charges, lines, allocated_total_bucket, methods[], at: record|post_record }`, `ub.purchases.landed_cost_revalued { items, absorbed_bucket, variance_bucket, variance_ratio }`, `ub.purchases.landed_cost_blocked { code }`, `ub.inventory.item_weight_set { from: landed_cost }`.

#### 19. Security
All ids (bill, party, item, expense, linked document) resolved through the tenant-scoped manager — cross-tenant returns 404. The allocation runs entirely server-side; a client-supplied `landed_cost_share` is ignored (§0.11 rule 3). Post-record revaluation is permission-gated twice (`purchases.bill.write` + `inventory.stock.adjust`), rate-limited to 20/hour/tenant to prevent valuation churn, and carries a mandatory audit row with the actor, request id and IP. Charge labels are escaped in the print component. `Idempotency-Key` is required for the revaluation so a retried request cannot double-revalue.

#### 20. Performance
The allocation is pure arithmetic — `O(charges × lines)` with no queries; a 6-charge, 50-line bill is ~300 Decimal divisions, well under 5 ms. The preview endpoint issues one query (`bill` with `prefetch_related('lines__item')`) plus one `inventory_item_stock` fetch for the before/after averages. Record adds no statements to PUR-01 beyond the `bulk_create` of charge rows. Revaluation is `≤ 4 + 3N` statements: lock stock rows in `item_id` order (same order as PUR-01/04/07, so no deadlock), `bulk_create` the valuation adjustments, one `UPDATE … FROM (VALUES …)` for the stock rows. `recalc_stock` gains one extra ordered scan of `inventory_valuation_adjustment` per item.

#### 21. Testing
- T-PUR-08-1 unit: the FR-8 vectors — all three charges, all three bases, exact shares 24.65/49.89/25.46, 781.25/390.63/78.12, 37.50/93.75/18.75 and landed unit costs 88.1700/47.9254/107.2330.
- T-PUR-08-2 unit: residual assignment — largest fraction wins; exact tie resolved by the lower `line_no` (the freight case).
- T-PUR-08-3 property test: for 10,000 random (charge, weights) combinations, `Σ share = allocable` in paise and every `share ≥ 0`.
- T-PUR-08-4 unit: `itc_eligible = false` charge → `allocable = amount + tax_amount` and the shares scale accordingly.
- T-PUR-08-5 API: record a bill with charges → `purchase_in` movements carry the landed `unit_cost`, `avg_cost` = 73.4467 for the Rice fixture, `item.purchase_price` = 88.1700.
- T-PUR-08-6 API: post-record revaluation with 6 of 20 units left → `absorbed = share × 6/20`, `avg_cost` updated, variance reported, one `inventory_valuation_adjustment` row per item.
- T-PUR-08-7 API: post-record revaluation with `on_hand = 0` → no avg change, full variance; with `on_hand < 0` → same.
- T-PUR-08-8 API: `by_weight` with a weightless item → 400 `missing_weight` naming the item; after setting `net_weight_kg` → 200.
- T-PUR-08-9 API: `third_party` charge → expense created for the transporter, goods supplier's balance unchanged, transporter's balance moved.
- T-PUR-08-10 API: void a bill with charges (PUR-04) → reversals at landed cost, third-party expenses voided, `avg_cost` untouched.
- T-PUR-08-11 API: debit note (PUR-07) against a landed bill → return posts at the landed unit cost with the pro-rata `landed_cost_share` (BR-10).
- T-PUR-08-12 integration: `recalc_stock` after a record + revaluation + sale reproduces `avg_cost` exactly.
- T-PUR-08-13 permission: staff revaluation without `inventory.stock.adjust` → 403; accountant add charge → 403.
- T-PUR-08-14 component: preview table footer equals the charge totals; basis radio copy; before → after chip per line.
- T-PUR-08-15 E2E (360 px): add three charges, check the per-line cost chips, record, open the detail and see the Charges block.

#### 22. Acceptance Criteria
- AC-1 (US-PUR-08-1) Given the FR-8 bill, when I add Insurance ₹100, Freight ₹1,250 and Loading ₹150 and record, then `landed_cost_share` is 843.40 / 534.27 / 122.33 and their sum is exactly ₹1,500.00.
- AC-2 (US-PUR-08-2) Given Freight on the basis "By weight", when the preview runs, then Rice (100 kg of 160 kg) carries ₹781.25 and Sugar and Dal carry ₹390.63 and ₹78.12, and switching the basis to "By value" changes the shares to the value-proportional figures without any other edit.
- AC-3 (US-PUR-08-3) Given charges are present, when I look at a line before recording, then it shows "₹46.00 → ₹88.17/unit" and the preview table's footer equals the charge totals.
- AC-4 (US-PUR-08-4) Given Rice has 10 NOS on hand at ₹44.0000, when the bill of 20 NOS at a landed ₹88.1700 is recorded, then `inventory_item_stock.avg_cost` becomes ₹73.4467 and the `purchase_in` movement's `unit_cost` is ₹88.1700.
- AC-5 (US-PUR-08-5) Given PB/26-27/0009 is recorded and 14 of 20 Rice are sold, when I add a ₹1,000 freight charge and apply it, then ₹300.00 is absorbed into the 6 units on hand, ₹700.00 is reported as unabsorbed variance, and an `inventory_valuation_adjustment` row records the before/after average.
- AC-6 (US-PUR-08-6) Given a freight charge with `itc_eligible = false` and 5 % GST, when it is allocated, then the allocated amount is `amount + tax_amount`; and given goods already sold, then the result sheet names the unabsorbed amount per item.
- AC-7 (US-PUR-08-7) Given the freight charge's source is "Third party → Shree Roadlines", when the bill is recorded, then an expense for Shree Roadlines exists, his party balance moves by the charge amount, and Agro Traders' balance is exactly the bill's `grand_total`.

#### 23. Dependencies
PUR-01 (bill, lines, `cost_base`/`inbound_unit_cost`, record transaction), PUR-04 (void semantics, BR-9), PUR-07 (returns at landed cost, BR-10), INV-01 (`net_weight_kg` field on the item form), INV-06/`stock_service` (movement posting and the weighted-average rule of §21.3.6), INV-08 (stock valuation display and the "valued at landed cost" tooltip), EXP-01 (`expenses_expense` creation for third-party charges), RPT-04 (purchase register memo column), `manage.py recalc_stock`, CCR-12 (charge table), CCR-13 (valuation adjustment table + recalc replay), CCR-14 (`inventory_item.net_weight_kg`), CCR-15 (settings keys), CCR-16 (endpoint paths).

#### 24. Future Enhancements
One freight bill split across several purchase bills in a single action (BR-11), with the split itself allocated by value or weight; allocation by volume (CBM) for importers; customs duty and IGST-on-import handling with a bill-of-entry reference (Phase 3, alongside e-way bill work); a landed-cost rule engine that applies standing charges automatically by supplier or route; FIFO/batch-aware absorption once INV-16 lands, which would let the post-record path revalue only the batches still in stock instead of using the weighted average; a "landed cost variance" P&L line when the accounting module (canon §0.3 Future) arrives.

---
## 17.8 Import & export (IMP)

The `import_export` module (canon §0.3) is two small products with one shared spine. **Import** turns a spreadsheet a shopkeeper already keeps — or an export from Khatabook, Vyapar or a Tally report — into parties, items and opening figures, with every row checked before anything is written. **Export** turns any list or report the user is looking at, with the filters they have applied, into a CSV or Excel file they can send to their accountant. Both are slow, bursty, memory-hungry operations that must not be done inside a web request, and both must work on a single VPS with no Celery and no Redis (ADR-012, ADR-021): the work is enqueued as a `platform_job` row and drained by the cron-driven `python manage.py run_scheduler`, and the files live on local disk under `MEDIA_ROOT` through the Django storage API (ADR-013).

IMP-01 specifies the framework, IMP-02 the export side, IMP-03 the Phase-2 Excel and bulk-edit extensions. The module-specific importers — parties (PTY-10), items (INV-09), opening balances (LED-02) and opening stock (INV-05) — are specified in their own features and plug into IMP-01 through one registry entry each; they add columns and business rules, never a second engine.

## 17.8.0 Conventions shared by the IMP features

**Frontend location.** Features `imports` and `exports` under `src/modules/UdhaarBook/features/`. `imports`: `redux/importJobSlice.ts` (`job`, `preview`, `errors`, `status`, `polling`, `uploadProgress`) + `redux/importJobThunk.ts` (`uploadImportFile`, `fetchImportJob`, `commitImportJob`, `cancelImportJob`) over `api/importService.ts`; components `ImportWizard`, `ImportKindPicker`, `ImportDropzone`, `ImportPreviewTable`, `ImportErrorTable`, `ImportSummaryCard`; `view-model/importDisplay.ts` (status → badge tone, progress label). `exports`: `redux/exportSlice.ts` (`requests{}` keyed by resource, `status`, `downloads[]`) + `redux/exportThunk.ts` (`requestExport`, `pollExport`, `cancelExport`) over `api/exportService.ts`; components `ExportMenu`, `ExportColumnsDialog`, `ExportProgressToast`, `ExportHistoryDrawer`. Endpoint constants: `API_PATHS.IMPORTS`, `IMPORT_BY_ID(id)`, `IMPORT_COMMIT(id)`, `IMPORT_CANCEL(id)`, `IMPORT_TEMPLATE(kind)`, `IMPORT_ERRORS_CSV(id)`, `EXPORTS`, `EXPORT_BY_ID(id)`, `EXPORT_DOWNLOAD(id)`. Yup: `importUploadSchema`, `exportRequestSchema`, `bulkPriceUpdateSchema` (P2). Toasts through `snackbarSlice` only; long-running feedback through the wizard's own progress, never a full-page spinner (§23.3).

**Backend location.** Django app `imports`: `registry.py` (the `ImporterSpec` registry), `services/import_service.py` (`create_job`, `validate_job`, `commit_job`, `cancel_job`, `build_error_file`), `services/export_service.py` (`create_export`, `build_export`, `stream_sync`), `parsers/csv_reader.py` (dialect sniffing, encoding, streaming), `parsers/xlsx_reader.py` (P2, IMP-03), `parsers/coerce.py` (the shared scalar parsers of the table below), `writers/csv_writer.py`, `writers/xlsx_writer.py` (ADR-023), `importers/{parties,items,opening_stock,item_prices}.py`, `exporters/` (one per resource), `tasks.py` (`import_validate`, `import_commit`, `export_build`, registered with the jobs runner), `selectors.py`. Management commands: `run_scheduler` (shared), `purge_import_files` (retention), `reap_stale_jobs`.

**Jobs, not requests (ADR-012).** Every import and every large export is `jobs.enqueue(task, payload)` → one `platform_job` row → `run_scheduler` ticking every 60 s. No Celery, no Redis, no threads in the web process. A task is idempotent, takes a lease (`lease_until`), records `attempts` and `last_error`, and is safe to re-run. `platform_job` has no column specification in Part 21; the one this chapter relies on is requested as **CCR-18**: `id uuid PK, tenant_id uuid NULL, task varchar(64) NN, payload jsonb NN default {}, status varchar(12) NN (queued|running|done|failed|cancelled), run_after timestamptz NN default now(), lease_until timestamptz NULL, attempts smallint NN default 0, max_attempts smallint NN default 3, last_error text NULL, coalesce_key varchar(120) NULL, created_at, finished_at`; `IX(status, run_after)`, `U(coalesce_key) WHERE status='queued'`.

**Files.** Uploaded and generated files are `files_attachment` rows (`kind='import_file'` / `'export_file'`) stored under `MEDIA_ROOT/imports/<tenant_id>/<job_id>.<ext>` and `MEDIA_ROOT/exports/<tenant_id>/<export_id>.<ext>`. Downloads are served by an authenticated, tenant-scoped view that streams from storage — never a guessable static URL. Import files are deleted 30 days after the job finishes; export files after 7 days (`reports_export.expires_at`), both by `purge_import_files`.

**Shared scalar parsing (`parsers/coerce.py`, normative).** Every importer and every template uses these and nothing else, so an error message means the same thing in every module.

| Type | Accepted input | Normalisation | Error code |
|---|---|---|---|
| Money | `1250`, `1250.5`, `1,250.50`, `₹1,250.50`, `1250.50 ` | strip `₹`, spaces and `,`; `Decimal`; ≤ 2 dp; reject `(1250)` | `invalid_amount` |
| Quantity | as money | ≤ 3 dp; whole numbers only when the unit has `allow_decimal=false` | `invalid_qty`, `qty_must_be_whole` |
| Unit cost | as money | ≤ 4 dp | `invalid_amount` |
| Percent | `5`, `5%`, `5.5` | strip `%`; 0–100 | `invalid_percent` |
| Date | `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY` | tenant timezone; `DD/MM` never `MM/DD` | `invalid_date`, `future_date` |
| Boolean | `true/false`, `yes/no`, `y/n`, `1/0`, `हाँ/नहीं` (case-insensitive) | `bool` | `invalid_boolean` |
| Mobile | `9876543210`, `+919876543210`, `091-98765 43210` | strip non-digits, take the last 10, prefix `+91` | `invalid_mobile` |
| Enum | any case | lower-cased and matched to the allowed set | `invalid_choice` |
| Text | any | trimmed; NFC-normalised; control characters stripped | `max_length` |

**CSV dialect (normative).** UTF-8, with or without BOM; `cp1252` retried when UTF-8 decoding fails (Excel on old Windows), and if both fail the job ends `failed` with `result.error.code='bad_encoding'`. Delimiter sniffed among `,` `;` `\t` `|` from the header line. CRLF and LF both accepted. Quoted fields with embedded delimiters and newlines are supported by the stdlib `csv` module. Lines whose first non-space character is `#` are comments and are skipped. A blank line ends nothing — it is skipped and counted. Written files always use `,`, CRLF and a UTF-8 BOM so Excel on Windows opens Devanagari correctly.

**CSV injection.** Every value written to a CSV or XLSX cell (error files, templates, exports) whose first character is `=`, `+`, `-`, `@`, TAB or CR is prefixed with a single quote `'`. This is applied centrally in `writers/csv_writer.py` and `writers/xlsx_writer.py`, so no exporter can forget it.

**Job status vocabulary** is canon §0.7's import-job set — `uploaded`, `validating`, `ready`, `importing`, `completed`, `failed`, `cancelled` — used verbatim by every import kind; exports use `reports_export.status` with `queued`, `running`, `ready`, `failed`, `expired`.

**Error model.** One row error is `{ row: <1-based data row number as the user sees it in the sheet>, column: "<header name>", value: "<as typed, truncated to 80>", code: "<snake_case>", message: "<English sentence>" }`. `imports_job.errors` stores the first 500; the full set is written to an error CSV (the original row plus `_row`, `_column`, `_problem` columns) offered as a download. Warnings use the same shape in `result.warnings` and never block a commit.

**Limits.** 10,000 data rows and 5 MB per import file (a kind may lower it — INV-09 caps items at 5,000); 200 columns; one running import per tenant (a second upload is accepted and queued); 100,000 rows per export before the async path becomes mandatory.

---

### IMP-01 — CSV import framework

#### 1. Business Objective
Let a business bring its existing data in from a spreadsheet without typing it twice and without risking a half-imported mess — upload, see every problem row by row, fix the sheet, commit once, all-or-nothing. It is the single largest onboarding drop-off remover: a shop with 400 parties and 600 items will not retype them. Measures: a 500-row file validates in ≤ 10 s and commits in ≤ 20 s; ≥ 90 % of jobs that reach `ready` with zero errors are committed; ≥ 70 % of files with errors are re-uploaded successfully within the same session; zero partial imports in production (asserted by the all-or-nothing transaction and monitored by the count of `failed` jobs with rows created, which must be 0).

#### 2. User Personas
Owner (OW) — the only persona who can commit, because the commit creates master data and financial opening figures; Accountant (AC) — often prepares and uploads the sheet on the owner's behalf and reads the error list, but cannot commit (canon §0.9: accountant has no `write`); Staff (ST) — may upload for kinds whose write permission they hold (items), never for opening balances.

#### 3. User Stories
1. US-IMP-01-1 — As an owner I want to download a template for what I am importing, with the columns named and example rows filled in, so that I know exactly what the file must look like.
2. US-IMP-01-2 — As an owner I want every row checked and every problem listed with the row number, the column and what is wrong, before anything is saved, so that I can fix my sheet and try again.
3. US-IMP-01-3 — As an owner I want to see a preview of the first rows as the system understood them, so that I can catch a wrong column mapping before I commit.
4. US-IMP-01-4 — As an owner I want the import to be all-or-nothing, so that a failure halfway never leaves me with half a catalogue.
5. US-IMP-01-5 — As an owner I want to download a copy of my file with the problems marked, so that I can fix it in Excel without hunting.
6. US-IMP-01-6 — As an owner I want the import to keep running while I use the app, and to tell me when it is done.
7. US-IMP-01-7 — As an owner I want to abandon an import I started by mistake, and to know that nothing was saved.
8. US-IMP-01-8 — As an accountant I want to see who imported what and when, so that unexplained master data has a trail.

#### 4. Functional Requirements
1. FR-1 **Registry.** `imports/registry.py` exposes `register(ImporterSpec)` and `get(kind)`. An `ImporterSpec` declares: `kind` (string, the `imports_job.kind` value), `label` (i18n key), `columns` (ordered list of `ColumnSpec { name, required, type, help, choices?, max_length? }`), `template_rows` (example rows), `max_rows`, `required_permissions` (list of codenames, all of which the caller must hold), `preflight(tenant, rows)` → tenant-wide lookups loaded once (units, categories, tax codes, existing SKUs/mobiles), `validate_row(ctx, row, index)` → `(clean, errors, warnings)`, `commit_rows(ctx, clean_rows)` → `result dict`, and `summary_fields` (what the completion card shows). MVP registrations: `parties` (PTY-10), `items` (INV-09), `opening_stock` (INV-05); Phase 2 adds `item_prices` (IMP-03).
2. FR-2 **Templates.** `GET /imports/templates/{kind}.csv` returns the spec's header row, a `#` comment line documenting the allowed values per column, and the example rows, with a UTF-8 BOM and CRLF. Unauthenticated access is refused; the file name is `udhaarbook-{kind}-template.csv`. Example rows are detectable by the importer and flagged `example_row` as a warning so an untouched template does not silently create junk.
3. FR-3 **Upload.** `POST /imports` (multipart, `kind` + `file`) creates a `files_attachment` (`kind='import_file'`, sha256 computed), an `imports_job` row with `status='uploaded'`, and enqueues `jobs.enqueue('import_validate', {job_id})`. Returns **201** with the job. The request never parses the file. Permission is the spec's `required_permissions` for the kind (403 otherwise); the plan's storage limit is checked (403 `plan_limit_reached`).
4. FR-4 **Validation task.** `import_validate` sets `status='validating'`, streams the file, and for each data row: coerces scalars (§17.8.0), calls `validate_row`, and accumulates `total_rows`, `valid_rows`, `error_rows`, `errors[]` (first 500 persisted, the rest counted) and `warnings[]`. Header handling: unknown columns are ignored with a `unknown_column` warning; missing **required** columns end the job `failed` with `result.error = { code: 'missing_columns', columns: [...] }`; a file with zero data rows ends `failed` with `empty_file`; more than the spec's `max_rows` ends `failed` with `too_many_rows`. On success the job becomes `ready` regardless of `error_rows`, and `result.preview_rows` holds the first 20 rows as the importer understood them. Progress is written to `result.progress = { done, total }` every 200 rows so the UI can show a bar.
5. FR-5 **Within-file duplicates** are the framework's job, not each importer's: the spec names the unique key columns, and a repeat is an error on the **later** row with code `duplicate_in_file` and the message "Repeats row {n}".
6. FR-6 **Commit.** `POST /imports/{id}/commit` is allowed only when `status='ready'` (409 `import_not_ready`) and `error_rows = 0` (409 `import_has_errors`, `details.error_rows`); it sets `status='importing'`, enqueues `jobs.enqueue('import_commit', {job_id, actor_id})` and returns **202** with the job. The task runs `commit_rows` inside **one** `transaction.atomic()`; any exception rolls the whole thing back and sets `status='failed'` with `result.error = { code, message, request_id }`. On success: `status='completed'`, `finished_at`, `result` from the spec's summary, and an in-app notification (§17).
7. FR-7 **Cancel.** `POST /imports/{id}/cancel` is allowed while `uploaded`, `validating` or `ready`; it sets `cancelled`, marks the queued `platform_job` row `cancelled`, and deletes the stored file. Cancelling during `importing` is refused (409 `import_in_progress`) — the transaction is already running and is either committed whole or rolled back whole.
8. FR-8 **Polling.** `GET /imports/{id}` returns the job with `status`, counts, `errors[≤500]`, `warnings[]`, `preview_rows[≤20]`, `result`, `file: { name, size_bytes }`, `can_commit`, `created_by`. The client polls every 2 s while the status is non-terminal, backing off to 5 s after 30 s and to 15 s after 2 min, and stops on a terminal status or when the tab is hidden.
9. FR-9 **Error file.** `GET /imports/{id}/errors.csv` (**CCR-19**) streams the user's original rows plus `_row`, `_column`, `_problem` columns for every failing row, built lazily on first request and cached as a `files_attachment`. Values are injection-neutralised (§17.8.0).
10. FR-10 **Job list.** `GET /imports?kind=&status=&page=` (**CCR-19**) returns the tenant's import history, newest first, so a user can find yesterday's job and see what it created.
11. FR-11 **Actor.** The commit runs as the requesting user: `created_by_id` on every created row is the job's `created_by_id`, and audit rows carry `actor_type='user'` with that actor, even though the process is the scheduler.
12. FR-12 **Stale jobs.** `reap_stale_jobs` (run on every `run_scheduler` tick) moves jobs stuck in `validating` for > 10 min or `importing` for > 30 min to `failed` with `result.error.code='interrupted'`, so a crashed runner never leaves a job spinning. Because the commit is a single transaction, the database has already rolled back anything it started; the user may simply commit again.
13. FR-13 **One at a time per tenant.** `import_commit` takes an advisory lock on `(tenant_id, 'import')`; a second commit waits rather than interleaving, so two files cannot race on the same uniqueness checks.
14. FR-14 **Wizard entry points.** The generic wizard is at `/imports`; every module page that supports import ("Parties → ⋯ → Import", "Items → ⋯ → Import") deep-links to `/imports?kind=items`, which skips the kind picker.

#### 5. Non-Functional Requirements
Validation ≤ 2 ms/row with all tenant lookups preloaded into dictionaries and uniqueness checked with one `IN` query per 1,000 rows; commit ≤ 30 ms/row; peak memory ≤ 128 MB for a 10,000-row file (streaming parse, never `read()` the whole file); upload progress shown from the XHR `progress` event; the wizard is fully usable at 360 px with the preview table scrolling horizontally and the error table as cards; all copy in `en` and `hi` (`imports.title` = "इम्पोर्ट", `imports.upload` = "फ़ाइल चुनें", `imports.checking` = "जाँच हो रही है…", `imports.errorsFound` = "{n} पंक्तियों में गड़बड़ी", `imports.commit` = "इम्पोर्ट करें"); keyboard-accessible dropzone (Enter/Space opens the file picker) and an `aria-live="polite"` region announcing status changes.

#### 6. User Flow
Primary: Parties → ⋯ → Import → the wizard opens at step 2 with `kind=parties` → "Download template" → the user fills it in Excel → drag the file onto the dropzone → upload bar → "Checking rows… 240/412" → `ready`, 412 rows, 0 errors, 3 warnings → preview table of the first 20 rows → "Import 412 parties" → `importing` with a progress bar → `completed` → summary card "412 parties created · ₹1,24,500 opening receivable" → "Go to parties".
Alternate A (errors): `ready` with 7 error rows → the Commit button is disabled with the reason beneath it → error table Row · Column · Value · Problem → "Download file with problems" → the user fixes the sheet → "Upload corrected file" starts a new job and cancels the old one.
Alternate B (wrong template): a parties file uploaded under `kind=items` → `failed` with `missing_columns` naming `name, unit` → banner "This does not look like an items file — download the items template".
Alternate C (leave and return): the user navigates away during `importing` → a snackbar with "Import running — we will tell you when it is done" → the in-app notification arrives → tapping it opens the job page.
Alternate D (cancel): `ready` → "Cancel import" → confirm → `cancelled`, nothing saved, the file deleted.
Alternate E (crash): the container restarts mid-commit → the job is `importing` → `reap_stale_jobs` marks it `failed` (`interrupted`) → the banner says "The import was interrupted and nothing was saved — commit again" with the Commit button re-enabled.

#### 7. UI Requirements
Routes `app/imports/page.tsx` (the wizard, reading `?kind=`) and `app/imports/[id]/page.tsx` (a job, deep-linkable from the notification). Layout is `UbPageShell` + `UbPageHeader` ("Import data") with a three-step `MLTabs`-based stepper (Choose what to import · Upload · Review & import) that is linear and non-skippable.

| Step | Components | Behaviour |
|---|---|---|
| 1 Kind | `ImportKindPicker` — `MLCard` per registered kind with icon, label, one-line description and a "Download template" `MLButton` (ghost) | Kinds the user lacks permission for are rendered disabled with `UbHelpHint` "Ask the owner" |
| 2 Upload | `ImportDropzone` — `UbFileUpload` (react-dropzone, `.csv` only at MVP, `.xlsx` added by IMP-03), `MLProgress` for the upload, file card with name/size/remove | Rejects the wrong extension and oversize files client-side with the same message the server would give |
| 3 Review | `UbStatCard` row (Total rows · Ready to import · Rows with problems · Warnings), `ImportPreviewTable` (`UbDataGrid`, compact, the spec's columns, `ds-num` for numeric cells), `ImportErrorTable` (`UbDataGrid`: Row · Column · Value · Problem, with a `UbSearchInput` and a column filter), `MLAlert` for warnings, sticky action bar (Cancel · Download file with problems · Commit) | Commit is `MLButton` primary labelled "Import {valid_rows} {kind}", disabled with an inline reason when `error_rows > 0` |
| Progress | `MLProgress` with "{done}/{total}" and an indeterminate state before the first tick | Polls per FR-8 |
| Done | `ImportSummaryCard` — `UbStatCard`s from the spec's `summary_fields` plus a primary CTA to the created records and a secondary "Import another file" | |

Mobile: the stepper collapses to a title plus "Step 2 of 3"; the preview and error tables become card lists (`MLCard` per row with the column names as labels); the action bar is sticky at the bottom above `UbBottomNav`. Redux: one `importJobSlice` shared by every kind — module-specific features never add a slice (INV-09 §7 already states this). Errors surface through `snackbarSlice` for request failures and inline for row problems.

#### 8. UX Requirements
The wizard never says "job" or "validation" — it says "checking your file" and "problems". Every error message is a sentence a shopkeeper can act on and names the fix, not the rule: "Unit KG not found — add it in Settings → Units first", not "FK constraint". The Commit button always carries the count so the user knows the scale of what they are about to do, and its disabled state carries the reason inline beneath it rather than in a tooltip (touch devices have no hover). Warnings are informational and never block; they are collapsed behind "3 things to check" and expand in place. The all-or-nothing promise is stated on the review step in one line: "Nothing is saved until you tap Import, and if anything fails, nothing is saved at all." Destructive actions (Cancel import) use the outlined destructive variant with a `UbConfirmDialog`. Numbers in the preview use `ds-num` tabular figures and en-IN grouping so a misparsed amount is visually obvious.

#### 9. States
| Canon status | What the user sees |
|---|---|
| — (initial) | Step 1, kind cards, no job |
| `uploaded` | "Uploading…" then "Queued — starting shortly" with an indeterminate `MLProgress` |
| `validating` | "Checking rows… {done}/{total}" with a determinate bar |
| `ready`, 0 errors | Green summary tiles, preview, Commit enabled |
| `ready`, errors > 0 | Warning tiles, error table, Commit disabled with the reason |
| `importing` | "Importing… {done}/{total}", every action disabled except a passive "you can leave this page" note |
| `completed` | Summary card, CTA to the records, "Import another file" |
| `failed` | `UbEmptyState` error variant with `result.error.message`, the request id in `ds-mono`, a Retry (re-commit) or "Upload again" action |
| `cancelled` | Muted card "Import cancelled — nothing was saved" with "Start again" |
| Disabled | Kind cards the user cannot use; Commit for accountants |
| Loading | `UbSkeleton` rows in the preview and error tables while the job is fetched |
| Empty | Job list with no history: first-use `UbEmptyState` "No imports yet" + "Import data" |

#### 10. Validation Rules
File level, before any row is read: `kind` must be registered (400 `invalid_choice`, "Choose what to import"); the file is required (400 `required`, "Choose a file"); the extension must be `.csv` (400 `invalid_file_type`, "Upload a CSV file — you can save an Excel sheet as CSV"); size ≤ 5 MB (400 `file_too_large`, "The file is larger than 5 MB"); content sniffed as text (400 `invalid_file_type`); decodable as UTF-8 or cp1252 (job `failed`, `bad_encoding`, "The file's characters could not be read — save it as CSV UTF-8"); the header must carry every required column (job `failed`, `missing_columns`, "These columns are missing: {list}"); 1 ≤ data rows ≤ `spec.max_rows` (`empty_file`, "The file has no rows"; `too_many_rows`, "Import at most {max} rows at a time — split the file"). Row level: the shared coercers of §17.8.0 plus the spec's `validate_row`. Commit level: `status='ready'` (409 `import_not_ready`), `error_rows = 0` (409 `import_has_errors`, "Fix {n} rows first"), permissions re-checked at commit time because the runner executes later (403 `permission_denied`).

#### 11. Business Rules
1. BR-1 **All-or-nothing.** One `transaction.atomic()` wraps the whole commit. There is no partial import, no "skip bad rows and continue", and no resume — a failed commit leaves the database exactly as it was.
2. BR-2 **Validate then commit, never validate-and-commit.** The two phases are separate jobs with the file re-read for the commit, so what the user approved in the preview is what runs.
3. BR-3 **Create-only at MVP.** Every registered importer creates rows; none updates an existing row. Matching an existing unique key is an error, not an update (IMP-03 adds an explicit upsert mode).
4. BR-4 **The framework owns file mechanics and scalars; the spec owns meaning.** Encoding, dialect, comments, header matching, duplicates-in-file, limits, progress, errors, retention and permissions live in `import_service`; column semantics and object creation live in the `ImporterSpec`. A new import kind must not touch `import_service`.
5. BR-5 **Row numbers are the user's row numbers**: the header is row 1, the first data row is row 2, comment and blank lines keep their positions so the number matches what Excel shows.
6. BR-6 **Importers call the same services as the UI** (`party_service.create_party`, `item_service.create_item`, `stock_service.post_opening_stock`, `ledger.services.post_entry`), so every rule, cache update and audit row is identical to a manual create. No importer writes a model directly.
7. BR-7 **Audit is aggregated.** A 5,000-row import writes one `import.committed` row with counts plus the per-entity rows the services produce with `metadata.batch=true` and `metadata.import_job_id`, so the audit browser (PLT-08) stays usable.
8. BR-8 **Traceability.** Every row created by an import carries the job in its audit metadata, and ledger entries and stock movements created by an import use `source_type='import'`, `source_id=job.id` so the movement history shows "Import {short id}".
9. BR-9 **Retention.** Import files are deleted 30 days after the job reaches a terminal status; the `imports_job` row (counts, errors, result) is kept for the audit trail.
10. BR-10 **Permissions are checked twice** — at upload and again inside the commit task against the current membership — because a role may change between the two.
11. BR-11 **A tenant has at most one running commit** (FR-13); validations may run in parallel because they write nothing.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Download a template | the kind's read codename (`parties.party.read`, `inventory.item.read`) | ✅ | ✅ | ✅ | ✅ |
| Upload & validate | the kind's `required_permissions` (`parties.party.write`, `inventory.item.write`, `ledger.entry.write`) | ✅ | ✅ | per kind | ❌ |
| Commit | same, re-checked at run time; `inventory.stock.adjust` additionally when the kind posts stock | ✅ | ✅ | per kind / override | ❌ |
| Cancel | the uploader, or `platform.tenant.manage` | ✅ | ✅ | own job | ❌ |
| View job & history | the kind's read codename | ✅ | ✅ | ✅ | ✅ |
| Download the error file | the kind's read codename | ✅ | ✅ | ✅ | ✅ |
No new permission codename is introduced — the framework borrows the module's own, which is why an accountant can prepare and inspect but never commit.

#### 13. Edge Cases
1. EC-1 A file saved from Excel with `;` as the delimiter (European locale) → sniffed correctly; if the header still does not match, `missing_columns` names what it looked for.
2. EC-2 A file whose header row is the second line because row 1 is a title → `missing_columns`; the message suggests "The first row must be the column names".
3. EC-3 A 12 MB file → rejected client-side before the upload starts and again server-side.
4. EC-4 The user closes the tab during `validating` → the task continues; returning to `/imports` shows the running job at the top of the history.
5. EC-5 Two owners commit two different files at the same moment → the advisory lock serialises them; the second shows "Waiting for another import to finish".
6. EC-6 The same file uploaded twice → allowed; the second validation reports the first import's rows as duplicates, which is the correct answer.
7. EC-7 A row with 40 columns when the header has 12 → the extra values are ignored with one `unknown_column` warning for the file, not one per row.
8. EC-8 A row with fewer cells than the header → missing values are treated as blank, and required-column errors follow naturally.
9. EC-9 Devanagari names, emoji, or a smart quote in a text column → accepted; control characters are stripped; the preview renders them so the user can see the encoding is right.
10. EC-10 A cell containing `=cmd|' /C calc'!A0` → stored as text, and neutralised on the way out into the error CSV (§17.8.0).
11. EC-11 The disk fills during upload → 500 with a clear message and no orphan `imports_job` row (the attachment is created first and the job only after it lands).
12. EC-12 The job's kind is deregistered by a later release → `GET` still renders the history row with the raw kind; commit is refused with `invalid_choice`.
13. EC-13 A commit that succeeds but whose notification fails → the job stays `completed`; notifications are best-effort and never roll back the import.
14. EC-14 10,000 rows with opening balances → ~10,000 ledger entries in one transaction; the commit takes ~2–4 min and the UI shows progress from `result.progress`, which the task updates outside the transaction's visibility only at the end — so the bar advances during validation and is indeterminate during the commit, and the copy says "This can take a few minutes".

#### 14. API Requirements
- `POST /imports` — multipart `{ kind, file }`, `Idempotency-Key` optional → **201** `{ data: { id, kind, status: "uploaded", file: { name, size_bytes }, created_at, created_by } }`. Errors: 400 `validation_error` (`kind`, `file`, `invalid_file_type`, `file_too_large`), 403 `permission_denied` / `plan_limit_reached`, 413 mapped to 400 `file_too_large`.
- `GET /imports/{id}` → `{ data: { id, kind, status, total_rows, valid_rows, error_rows, errors[≤500], errors_truncated: bool, warnings[], preview_rows[≤20], columns[], result, can_commit, file, started_at, finished_at, created_by, created_at } }`.
- `POST /imports/{id}/commit` → **202** `{ data: job, message: "Import started" }`. Errors: 409 `import_not_ready`, `import_has_errors` (`details.error_rows`), 403.
- `POST /imports/{id}/cancel` → 200 job (`cancelled`). Errors: 409 `import_in_progress`.
- `GET /imports/templates/{kind}.csv` → `text/csv` attachment. 404 for an unknown kind.
- `GET /imports/{id}/errors.csv` → `text/csv` attachment (**CCR-19**). 409 when there are no errors.
- `GET /imports?kind=&status=&page=&page_size=` → paginated history (**CCR-19**).
- All are tenant-scoped by the `tid` claim; cross-tenant ids return 404. `Accept-Language` localises messages. Rate limit: 20 uploads per hour per tenant (`429`).
- Frontend: `importService.upload(kind, file, onProgress)`, `get(id)`, `commit(id)`, `cancel(id)`, `templateUrl(kind)`, `errorsUrl(id)`, `list(params)`; thunks per §17.8.0.

#### 15. Database Impact
`imports_job` (§21.3.11) — insert on upload; updates for `status`, `total_rows`, `valid_rows`, `error_rows`, `errors`, `result`, `started_at`, `finished_at`. Additions requested as **CCR-17**: `error_file_attachment_id uuid NULL` (the cached error CSV), `options jsonb NN default '{}'` (used by IMP-03's mode flags), `created_by_id` made explicit, and `IX(tenant_id, status)` for the history filter and the stale-job reaper; the `kind` column is documented as an open registry value rather than a fixed enum. `files_attachment` (`kind='import_file'`) insert and soft-delete. `platform_job` (**CCR-18**) insert per phase, update for lease/attempts/status. Everything the importers create is listed in their own features (`parties_party`, `ledger_entry`, `inventory_item`, `inventory_category`, `inventory_stock_movement`, `inventory_item_stock`), always through their services. `platform_audit_log` inserts per BR-7. `notifications_notification` one row on completion.

#### 16. Audit Requirements
`import.requested { job_id, kind, file_name, size_bytes, sha256 }` on upload; `import.validated { job_id, total_rows, valid_rows, error_rows, top_error_codes }`; `import.committed { job_id, kind, result }` with the spec's summary in `after`; `import.failed { job_id, code, message }`; `import.cancelled { job_id, at_status }`; `import.error_file_downloaded { job_id }`. Actor is the uploading user in every case (BR-10/FR-11), `actor_type='user'`, with `metadata.request_id` and `metadata.runner=true` on the rows written by the scheduler so it is clear the work ran out of band. Retention follows the financial-action rule (≥ 7 years) because opening balances are financial.

#### 17. Notifications
In-app `import_done` (the type already listed for NTF-01) to the requesting user only: success "Items import finished — 312 items created", failure "Items import failed — nothing was saved", each with `data.route = /imports/{id}`. No SMS, no WhatsApp — this is an internal operation. A snackbar is shown instead of a notification when the user is still on the wizard page, so the same event never appears twice.

#### 18. Analytics / Event Tracking
`ub.imports.template_downloaded { kind }`, `ub.imports.file_uploaded { kind, rows_estimate, size_bytes, source: wizard|module_page }`, `ub.imports.validated { kind, total_rows, error_rows, warning_count, top_error_codes[], duration_ms }`, `ub.imports.error_csv_downloaded { kind, error_rows }`, `ub.imports.committed { kind, rows, duration_ms }`, `ub.imports.failed { kind, at: validate|commit, code }`, `ub.imports.cancelled { kind, at_status }`, `ub.imports.reuploaded { kind, previous_error_rows }` — the last one is the funnel metric for the "fix and retry" loop.

#### 19. Security
Uploads are size-capped, extension-checked and content-sniffed; the stored name is the job UUID, never the user's file name (which is kept only as metadata), so path traversal is impossible. Files live under `MEDIA_ROOT/imports/<tenant_id>/` and are served only through an authenticated, tenant-scoped streaming view — a job of another tenant returns 404. `sha256` is stored for every upload so a support question about "which file did I send" is answerable. CSV injection is neutralised on every write path (§17.8.0). Row values are never interpolated into SQL — importers use the ORM and the module services. Error messages echo the offending value truncated to 80 characters and HTML-escaped on render. The commit re-checks permissions and the tenant's status (a `pending_deletion` tenant cannot import). Rate limits: 20 uploads/hour/tenant, 5 concurrent jobs/tenant. PII in import files (mobiles, addresses) is covered by the 30-day retention and by PLT-10's erase path.

#### 20. Performance
Streaming parse with the stdlib `csv` module over a file object — memory is O(row), not O(file). Preflight loads every tenant-wide lookup once into dictionaries (units by code, categories by lower-cased path, tax codes active today, existing SKUs/mobiles fetched in `IN` batches of 1,000), so per-row validation issues zero queries. Commit uses the module services but batches where they allow it (`bulk_create` in chunks of 500 for lines and movements, followed by the per-object cache updates the services own). Target: 500 rows validate ≤ 10 s and commit ≤ 20 s; 10,000 rows validate ≤ 90 s and commit ≤ 4 min. The scheduler processes one commit per tenant (FR-13) but several tenants concurrently. `GET /imports/{id}` is a single row read; `errors` is capped at 500 entries so the payload stays under ~120 KB.

#### 21. Testing
- T-IMP-01-1 unit: the §17.8.0 coercers — money with `₹` and grouping, dates in both formats, booleans including `हाँ`, mobiles in four shapes, each with its error code.
- T-IMP-01-2 unit: dialect sniffing over `,` `;` `\t` `|`; BOM present and absent; cp1252 fallback; CRLF and LF; a quoted field containing a newline and a comma.
- T-IMP-01-3 unit: row numbering with comment and blank lines interleaved matches the spreadsheet's numbering.
- T-IMP-01-4 unit: within-file duplicate flagged on the later row with a reference to the earlier one.
- T-IMP-01-5 integration: missing required column → `failed` with `missing_columns`; zero rows → `empty_file`; `max_rows + 1` → `too_many_rows`.
- T-IMP-01-6 integration: a fixture with one error of every registered code → `errors[]` shape, count, truncation flag at 500, and the error CSV content.
- T-IMP-01-7 integration: commit with errors → 409 `import_has_errors`; after a corrected re-upload → `completed` and the DB counts match the summary.
- T-IMP-01-8 integration: failure injected in the middle of `commit_rows` → zero rows persisted, job `failed`, and a subsequent commit of the same job succeeds.
- T-IMP-01-9 integration: `reap_stale_jobs` marks an `importing` job older than 30 min as `failed` with `interrupted`.
- T-IMP-01-10 integration: two concurrent commits for one tenant serialise (advisory lock) and both complete correctly.
- T-IMP-01-11 permission: accountant upload → 403; accountant commit → 403; staff commit of an opening-balance file → 403; role revoked between upload and commit → 403 at commit.
- T-IMP-01-12 security: a file named `../../etc/passwd.csv` stores under the job UUID; a cell starting with `=` is prefixed with `'` in the error CSV; another tenant's job id → 404.
- T-IMP-01-13 component: the wizard's three steps, the disabled Commit with its inline reason, the progress label, the mobile card rendering of the error table.
- T-IMP-01-14 E2E (360 px): download template → upload a file with 3 errors → download the error file → upload the fix → commit → summary → navigate to the created records.
- T-IMP-01-15 performance: a 10,000-row fixture validates within budget and peak RSS stays under 128 MB.

#### 22. Acceptance Criteria
- AC-1 (US-IMP-01-1) Given the Parties page, when I choose Import and tap "Download template", then a CSV downloads whose first row is the registered column list, whose second row is a `#` comment describing the allowed values, and which contains the spec's example rows.
- AC-2 (US-IMP-01-2) Given a file with a bad date in row 7 and a repeated mobile in row 12, when validation finishes, then the job is `ready` with `error_rows = 2`, `errors` contains `{row: 7, column: "opening_as_of", code: "invalid_date"}` and `{row: 12, column: "mobile", code: "duplicate_in_file"}`, and the Commit button is disabled with the reason shown.
- AC-3 (US-IMP-01-3) Given a valid file, when the review step renders, then the first 20 rows are shown as the importer parsed them, with amounts formatted en-IN, so a column shifted by one is visible at a glance.
- AC-4 (US-IMP-01-4) Given a database error on row 400 of 412 during the commit, when the job finishes, then zero rows from that file exist, the job is `failed` with the error code and request id, and the user can commit again.
- AC-5 (US-IMP-01-5) Given 7 error rows, when I tap "Download file with problems", then I receive a CSV containing my original rows plus `_row`, `_column` and `_problem` columns, with any cell starting with `=` prefixed by `'`.
- AC-6 (US-IMP-01-6) Given a commit in progress, when I navigate to another page, then the import keeps running and an in-app notification "Items import finished — 312 items created" arrives, linking back to the job.
- AC-7 (US-IMP-01-7) Given a `ready` job, when I cancel it, then the status is `cancelled`, the stored file is deleted and no records were created.
- AC-8 (US-IMP-01-8) Given a completed import, when the accountant opens the audit log filtered to `import.committed`, then one row shows the actor, the kind, the counts and the summary, and the created parties each carry `metadata.import_job_id`.

#### 23. Dependencies
`platform_job` + `manage.py run_scheduler` (ADR-012, CCR-18), `files_attachment` and the local-disk storage backend (ADR-013), `imports_job` (§21.3.11 + CCR-17), the module services and their permissions (PTY-01, INV-01, INV-05, LED-02), NTF-01 (in-app notification type "import done"), PLT-08 (audit browser), `UbFileUpload`/`UbDataGrid`/`UbEmptyState`/`UbStatCard`, CCR-19 (job list and error-file endpoints). Consumed by PTY-10, INV-09, LED-02 and, in Phase 2, IMP-03.

#### 24. Future Enhancements
IMP-03 adds XLSX input, an explicit upsert mode and bulk price editing; IMP-04 (Phase 3) adds mappers that recognise Khatabook and Vyapar export layouts and translate them into the canonical templates, so the user does not rearrange columns by hand; a column-mapping step ("your column `Customer Name` → our column `name`") with a remembered mapping per tenant; resumable chunked uploads for poor connections; scheduled imports from a watched folder or an emailed attachment (Phase 3); a dry-run diff view for upsert mode showing what would change per row.

---
### IMP-02 — Bulk export

#### 1. Business Objective
Whatever a user is looking at — a filtered party list, this month's overdue invoices, the movement history of one item, the day book for a quarter — must be one tap away from a CSV or Excel file that contains exactly that, so it can go to an accountant, a bank or a spreadsheet without anyone retyping or screenshotting. Measures: an export of ≤ 5,000 rows starts downloading in ≤ 3 s; every export contains exactly the rows the list showed (asserted by a test that compares the export's row count with the list's `meta.total` under identical filters); ≥ 40 % of accountant-role sessions use an export within 30 days; zero exports that leak a row of another tenant (CI tenant-isolation test).

#### 2. User Personas
Owner (OW) — exports a list to send on WhatsApp or to keep a backup; Accountant (AC) — the heaviest user: exports registers, aging, the day book and ledgers every month, and needs Excel-friendly numbers and dates; Staff (ST) — no export rights by default (canon §0.9 gives staff `reports.basic.read` but not `reports.export`), so the action is hidden.

#### 3. User Stories
1. US-IMP-02-1 — As an accountant I want to export the list I am looking at, with the filters, search and sort I have applied, so that the file matches what I checked on screen.
2. US-IMP-02-2 — As an accountant I want Excel to see numbers as numbers and dates as dates, so that I can total a column without cleaning the file first.
3. US-IMP-02-3 — As an owner I want to choose which columns go into the file, so that I can send a supplier a list without my cost prices in it.
4. US-IMP-02-4 — As an accountant I want a big date range to keep working in the background and give me a download link when it is ready, instead of timing out.
5. US-IMP-02-5 — As an accountant I want to find a file I generated yesterday without generating it again.
6. US-IMP-02-6 — As an owner I want the totals I see at the top of the list to be in the file too, so the numbers can be checked.
7. US-IMP-02-7 — As an owner I want to know that a file I share will stop working after a while, so old data does not sit on a link forever.

#### 4. Functional Requirements
1. FR-1 **One filter definition, two consumers.** Each exportable resource has one `django-filter` `FilterSet` used by both its list endpoint and its exporter. An export request carries the **same query parameters** as the list request that produced the screen (`q`, `status`, `date_from`, `date_to`, `party_id`, `category_id`, `tag`, `ordering`, …); the server re-runs the same filtered, ordered queryset without `page`/`page_size`. Any parameter the FilterSet does not declare is rejected (400 `validation_error`) rather than silently ignored — an ignored filter would produce a file that does not match the screen.
2. FR-2 **Resource registry** (`imports/exporters/registry.py`, mirroring IMP-01's importer registry). An `ExporterSpec` declares `resource`, `label`, `filterset`, `queryset(tenant, filters)`, `columns` (ordered `ColumnSpec { key, header, type ∈ text|number|money|qty|percent|date|datetime|bool, default_visible, permission? }`), `totals` (which columns carry a totals row and how), `default_ordering`, `required_permissions`, and `max_rows`. MVP resources:

| `resource` | Source | Default columns (abridged) | Totals row |
|---|---|---|---|
| `parties` | `parties_party` | name, mobile, type, tags, balance, collection_date, credit_limit, last_activity_at, status | balance |
| `party_statement` | `ledger_entry` for one party | date, type, note, reference, debit, credit, running_balance, document | debit, credit |
| `ledger_entries` | `ledger_entry` | date, party, type, note, mode, reference, debit, credit, created_by | debit, credit |
| `items` | `inventory_item` + `inventory_item_stock` | name, sku, barcode, category, unit, hsn_sac, tax_code, purchase_price, selling_price, mrp, on_hand, reorder_point, stock_value, status | on_hand, stock_value |
| `stock_movements` | `inventory_stock_movement` | date, item, sku, type, qty, unit_cost, on_hand_after, source, reference | qty |
| `sales_invoices` | `sales_document` (`kind` filtered) | number, date, party, gstin, status, taxable_total, cgst, sgst, igst, cess, round_off, grand_total, amount_paid, amount_due, due_on | every money column |
| `purchase_bills` | `purchases_document` | number, date, supplier, supplier_invoice_number, supplier_invoice_date, status, taxable_total, taxes, grand_total, amount_due, itc_eligible | every money column |
| `debit_notes` | `purchases_document` (`kind='debit_note'`) | number, date, supplier, against, grand_total, applied, open_credit, status | grand_total, open_credit |
| `payments` | `payments_payment` | number, date, direction, party, modes, reference, amount, unallocated_amount, allocations | amount |
| `expenses` | `expenses_expense` | number, date, category, party, mode, reference, amount, tax_amount | amount, tax_amount |
| `audit_logs` | `platform_audit_log` | created_at, actor, action, entity_type, entity_id, reason, request_id | — |

   Report exports (`day_book`, `sales_register`, `purchase_register`, `stock_summary`, `gst_summary`, `receivables_aging`, `payables_aging`, `cashbook`) reuse the same machinery through `GET /reports/{name}.csv|.xlsx` (§22.11) with the report's own params; the writer, the threshold, the async path and the download view are shared, so the report features specify only their columns.
3. FR-3 **Formats.** `csv` (UTF-8 with BOM, CRLF, `,`) and `xlsx`. XLSX is produced by an in-house minimal writer `imports/writers/xlsx_writer.py` built on the standard library (`zipfile` + generated SheetML) — **ADR-023** is requested for this decision; `openpyxl` is deliberately not added under the minimal-dependency policy (ADR-021). The writer supports a single sheet, a bold frozen header row, column widths, and three number formats (`#,##0.00` money, `#,##0.000` quantity, `dd/mm/yyyy` date) applied by `ColumnSpec.type`. It writes rows in a stream and never holds more than one chunk in memory.
4. FR-4 **Typed cells (US-2).** Money and quantity columns are written as **plain decimal numbers** — no `₹`, no thousands separators, dot decimal — so Excel and Google Sheets parse them; the CSV therefore reads `1250.50`, not `₹1,250.50`. Dates are `YYYY-MM-DD` in CSV and real date cells in XLSX. Booleans are `Yes`/`No` (localised). Negative amounts carry a leading `-`, never parentheses. This is a deliberate departure from the on-screen en-IN formatting and is stated in the export dialog.
5. FR-5 **Column choice (US-3).** The export dialog pre-selects the columns currently visible in the user's `UbDataGrid` (the grid already persists column visibility) plus any column the spec marks as always-included (the record's identifier). The user may tick or untick any column their permissions allow: a `ColumnSpec.permission` (for example `reports.financial.read` on `purchase_price` and `stock_value`) hides the column from users who lack it, server-side as well as in the dialog. The chosen `columns[]` are sent with the request and remembered per resource in `localStorage`.
6. FR-6 **Sync vs async threshold.** The server counts the filtered queryset first. When `count ≤ 5,000` the response is a `StreamingHttpResponse` with `Content-Disposition: attachment; filename="udhaarbook-{resource}-{yyyymmdd-hhmm}.{ext}"` — **200**, nothing is stored. When `count > 5,000` the request returns **202** `{ data: { export_id, status: "queued", row_count } }`, creates a `reports_export` row (`report_name = 'list:{resource}'`, `params` = the validated filters + columns, `format`, `status='queued'`, `row_count`) and enqueues `jobs.enqueue('export_build', {export_id})` for `run_scheduler`. `count > 100,000` is refused with 400 `export_too_large` and the message "Narrow the date range — at most 1,00,000 rows per file".
7. FR-7 **Async lifecycle.** `export_build` streams the queryset with `.iterator(chunk_size=2000)` straight into the writer and into a file at `MEDIA_ROOT/exports/<tenant_id>/<export_id>.<ext>`, creates a `files_attachment` (`kind='export_file'`), sets `reports_export.status='ready'`, `file_attachment_id`, `row_count` and `expires_at = now + 7 days`, and raises an `export_ready` notification. Failure sets `status='failed'` with the error in `params.error` and notifies once.
8. FR-8 **Download.** `GET /exports/{id}/download` streams the stored file through an authenticated, tenant-scoped view (404 cross-tenant), sets the same `Content-Disposition`, and increments a download counter in `params.downloads`. After `expires_at` the endpoint returns 410 `export_expired` with "This file has expired — generate it again"; the nightly `purge_export_files` command deletes the blob and flips the status to `expired`.
9. FR-9 **History (US-5).** `GET /exports?resource=&status=&page=` lists the tenant's exports newest first with `report_name`, `format`, `row_count`, `status`, `created_by`, `created_at`, `expires_at`; the UI surfaces it as an "Export history" drawer from the export menu and from Settings → Data.
10. FR-10 **Totals row (US-6).** When the spec declares `totals`, the last row of the file repeats the list's `meta.totals` under the matching columns, with the label column reading "Total ({n} rows)". The totals are computed by the same aggregate the list header uses, over the filtered set, not by summing the exported page.
11. FR-11 **Header block.** Every file begins with the header row of column names. For reports (not lists) a two-line preamble precedes it: line 1 the tenant name and the report title, line 2 the filters in words ("01/04/2026 to 30/06/2026 · Status: overdue"). Lists have no preamble so they paste straight into a pivot table; the same filter sentence is instead carried in the file name and in the export history.
12. FR-12 **Cancel.** `POST /exports/{id}/cancel` marks a `queued` export `cancelled` and cancels its `platform_job`; a `running` export cannot be cancelled (409 `export_in_progress`).
13. FR-13 **Entry points.** Every `UbDataGrid` toolbar gains an "Export" `MLDropdownMenu` with "CSV", "Excel" and "Choose columns…"; every report page gains the same in its header; the party detail exports the statement (`party_statement`, which is also reachable as a PDF through LED-05); bulk row selection in the grid exports only the selected rows by adding `id__in` to the filters.
14. FR-14 **Progress and delivery.** For an async export the client shows a `UbSnackbar` "Preparing your file — we will tell you when it is ready", polls `GET /exports/{id}` every 3 s (backing off to 10 s), and when `ready` replaces the toast with one carrying a "Download" action; the notification (§17) covers the case where the user has navigated away.

#### 5. Non-Functional Requirements
Sync export of 5,000 rows starts streaming within 3 s (first byte) and completes within 15 s on a 4G connection; async export of 100,000 rows completes within 4 min and uses ≤ 128 MB of memory; CSV writing throughput ≥ 20,000 rows/s, XLSX ≥ 8,000 rows/s; no request holds a database connection while writing a stored file (the async path runs in the scheduler); file names and the preamble are localised (`en`/`hi`) while column headers stay in the UI language of the requester (`Accept-Language`); the export menu is reachable by keyboard from the grid toolbar and announces the async case through `aria-live`; the dialog is usable at 360 px with the column list as a scrollable checkbox stack.

#### 6. User Flow
Primary (small list): Parties → filter "You will get" + tag "Camp Area" → 240 rows → toolbar Export → CSV → the browser downloads `udhaarbook-parties-20260918-1142.csv` within two seconds; opening it in Excel shows 240 rows plus a totals row and the balance column summing correctly.
Alternate A (columns): Export → "Choose columns…" → untick `credit_limit` and `purchase_price` → Export → the file omits them.
Alternate B (large): Ledger entries, 1 Apr to 30 Sep, 38,000 rows → Export → Excel → 202 → toast "Preparing your file…" → the user keeps working → notification "Your export is ready — 38,000 rows" → tap → download.
Alternate C (too large): 1,40,000 rows → 400 `export_too_large` → inline message "Narrow the date range — at most 1,00,000 rows per file" with a "Last 3 months" quick chip.
Alternate D (history): Settings → Data → Export history → yesterday's file listed with "Expires in 6 days" → Download.
Alternate E (expired): a week-old link → 410 → the page offers "Generate again" with the original filters pre-applied from `params`.
Alternate F (no permission): a staff user sees no Export item in the toolbar at all (entitlement-driven, not a disabled button).

#### 7. UI Requirements
No new route for the common case — the feature lives in the grid toolbar and the report headers; the history drawer is reachable at `app/settings/data/page.tsx` (Settings → Data) and as a drawer anywhere. Components: `ExportMenu` (`MLDropdownMenu` with CSV / Excel / Choose columns… / Export history), `ExportColumnsDialog` (`UbDialog`: a scrollable `MLCheckbox` list grouped by "Shown on screen" and "Other columns", a "Reset to visible columns" ghost button, a footer with the format `MLToggleGroup` and the row count "Exporting 240 rows"), `ExportProgressToast` (a `UbSnackbar` variant with a determinate `MLProgress` when `row_count` is known and a Download action when ready), `ExportHistoryDrawer` (`UbDrawer` + `UbDataGrid` compact: File · Rows · Format · Created · Expires · Download, with `UbStatusBadge` for `queued`/`running`/`ready`/`failed`/`expired`). Redux: `exportSlice` holds `requests` keyed by `resource`, the active polling handles and the history page; `exportThunk` exposes `requestExport({resource, params, format, columns})`, `pollExport(id)`, `fetchExportHistory()`, `cancelExport(id)`. The grid passes its current filter object and visible column keys straight into the thunk, which is what guarantees FR-1 on the client side.
Mobile: the Export item sits in the list's `⋯` overflow sheet; the columns dialog becomes a bottom `UbDrawer`; the ready toast is a full-width bar above `UbBottomNav` with the Download action.

#### 8. UX Requirements
The menu always states what will be exported in the item label — "Export 240 rows (CSV)" — so there is never a surprise about scope; when a row selection is active it reads "Export 12 selected". The columns dialog says plainly that money and dates are written for spreadsheets, not for reading: "Amounts are written as plain numbers (1250.50) so Excel can add them up." The async case is never a blocking modal; the user keeps working, and the file arrives through the toast and the notification. Expiry is stated up front in the ready toast and in the history drawer ("Link works for 7 days"), which is the honest answer to US-7. Failure copy names the fix: "The export failed. Try a smaller date range, or contact support with request id {id}." Nothing about jobs, queues or schedulers appears in any string.

#### 9. States
| State | UI |
|---|---|
| Idle | Export item in the toolbar with the row count |
| Disabled | hidden entirely without `reports.export` (not greyed) |
| Preparing (sync) | the menu item shows an inline `MLSpinner` for up to 3 s, then the browser takes over |
| Queued (async) | toast "Preparing your file…" with an indeterminate bar; the history row shows `queued` |
| Running | toast bar determinate when `row_count` is known; history badge `running` |
| Ready | toast with a Download action; notification; history badge `ready` with the expiry |
| Downloaded | history row shows the download count |
| Failed | toast error with the request id and a Retry action; history badge `failed` with the reason |
| Expired | history badge muted `expired`; the download endpoint returns 410 and the UI offers "Generate again" |
| Cancelled | history row muted; no file |
| Empty (no rows) | the Export item is disabled with the hint "Nothing to export — clear a filter" |
| Error (too large) | inline message in the menu with a narrower-range suggestion |

#### 10. Validation Rules
`resource` must be registered (400 `invalid_choice`); `format ∈ {csv, xlsx}` (400 `invalid_choice`, "Choose CSV or Excel"); `columns[]` must be a non-empty subset of the spec's columns that the caller may see (400 `validation_error`, "Unknown column {x}" / 403 when a permissioned column is requested without the right); every filter parameter must be declared by the resource's FilterSet (400 `validation_error` naming the parameter, "This filter cannot be used for an export"); `date_from ≤ date_to` (400 `invalid_date_range`); the filtered count must be ≥ 1 (400 `nothing_to_export`, "Nothing matches these filters") and ≤ 100,000 (400 `export_too_large`); `id__in` (selection export) is capped at 1,000 ids (400 `too_many_ids`); rate limit 10 exports per hour per user (429 with `Retry-After`).

#### 11. Business Rules
1. BR-1 **The file is the screen.** An export uses the same FilterSet, the same ordering and the same tenant-scoped queryset as the list endpoint; pagination is the only thing dropped. Adding a filter to a list without adding it to the FilterSet is a defect, caught by the parity test (T-IMP-02-3).
2. BR-2 **Reads only.** An export never writes business data. The only rows it creates are `reports_export`, `files_attachment`, `platform_job` and the audit row.
3. BR-3 **Numbers are numbers** (FR-4): no currency symbol, no grouping, dot decimal, `-` for negatives, and money always to exactly 2 decimals, quantities to 3, unit costs to 4 — the same precision the database holds.
4. BR-4 **Column permissions are enforced server-side.** `purchase_price`, `unit_cost`, `avg_cost`, `stock_value`, `landed_cost_share` and margin columns require `reports.financial.read`; requesting them without it is 403, regardless of what the client sends.
5. BR-5 **The 5,000-row threshold** decides sync vs async, and 100,000 is the hard cap. These are settings-tunable per deployment but not per tenant.
6. BR-6 **Files expire after 7 days** (`reports_export.expires_at`, §21.3.11) and are then deleted from disk; the `reports_export` row survives as history with `status='expired'`.
7. BR-7 **Export is not a share.** A download link is authenticated and tenant-scoped; there is no public export URL. Sharing means downloading and sending the file, or using the public statement link (PTY-09), never handing out an export URL.
8. BR-8 **Totals come from aggregates** over the filtered set (BR-1), so a totals row can never disagree with the list header.
9. BR-9 **Ordering is deterministic**: the spec's `default_ordering` always ends with the primary key, so two exports of the same data produce the same file.
10. BR-10 **Report exports and list exports share one pipeline**; `GET /reports/{name}.csv|.xlsx` (§22.11) is a thin alias over the same `export_service`, and its 202 response carries the same `export_id` shape that `GET /reports/exports/{id}` (used by PLT-10 and PLT-08) already polls.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Export a list | `reports.export` + the resource's read codename | ✅ | ✅ | ❌ | ✅ |
| Export parties | `parties.party.export` (canon has a dedicated codename) | ✅ | ✅ | ❌ | ✅ |
| Export a party statement | `ledger.statement.export` | ✅ | ✅ | ❌ | ✅ |
| Export a report | `reports.export` + `reports.basic.read`; financial reports also `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Export cost/margin columns | `reports.financial.read` | ✅ | ✅ | ❌ | ✅ |
| Export the audit log | `platform.audit.read` + `reports.export` | ✅ | ✅ | ❌ | ✅ |
| View export history / download | the permissions of the export's own resource, re-checked on download | ✅ | ✅ | ❌ | ✅ |
| Cancel a queued export | its creator, or `platform.tenant.manage` | ✅ | ✅ | ❌ | ✅ (own) |
Staff are excluded by canon's role definition; a tenant that wants a staff member to export grants `reports.export` through `platform_membership.permissions_override`.

#### 13. Edge Cases
1. EC-1 The list changes between the count and the stream (a row is created) → the file reflects the queryset at stream time; the row count in the file name may differ from the toast by a row or two, which is accepted and noted in the history row's tooltip.
2. EC-2 A filter that produces zero rows → 400 `nothing_to_export` rather than an empty file, because an empty file looks like a bug to a shopkeeper.
3. EC-3 A 1,00,001-row range → 400 `export_too_large` with a suggested narrower range computed from the data (the smallest range chip that fits).
4. EC-4 A cell value beginning with `=` (a party named `=SUM`) → neutralised with a leading apostrophe by the shared writers (§17.8.0).
5. EC-5 Devanagari text in CSV opened in Excel on Windows → readable because the writer emits a UTF-8 BOM.
6. EC-6 A very long note (2,000 characters) → written whole in CSV; truncated to the 32,767-character cell limit in XLSX with an ellipsis.
7. EC-7 The user's role is downgraded between the request and the download → the download view re-checks and returns 403.
8. EC-8 Two identical exports requested in quick succession → both run; there is no deduplication, but the rate limit caps the damage.
9. EC-9 The scheduler is down → the export sits `queued`; the history row shows "Queued" and `GET /admin/health` surfaces the job lag for support.
10. EC-10 Disk full during an async build → `status='failed'` with a clear message; no partial file is left (the writer writes to a temporary name and renames on success).
11. EC-11 A cross-tenant `export_id` → 404, never 403.
12. EC-12 An XLSX of 100,000 rows × 20 columns → about 25 MB; the writer streams and the browser downloads it; the history row shows the size.
13. EC-13 A selection export of 1,001 selected rows → 400 `too_many_ids`; the UI suggests "Export all matching rows instead".
14. EC-14 An export of `party_statement` for a party with 200,000 entries → exceeds the cap; the UI suggests a financial-year range, which is what an accountant wants anyway.

#### 14. API Requirements
- `POST /exports` `{ resource, format: "csv"|"xlsx", columns: ["name","balance",…], filters: { …the list's query params… } }` → **200** streaming file when `count ≤ 5,000`, or **202** `{ data: { export_id, status: "queued", row_count, estimated_seconds } }`. `GET /exports/{id}` → `{ data: { id, resource, report_name, format, status, row_count, size_bytes, created_by, created_at, expires_at, download_url, error? } }`. `GET /exports/{id}/download` → the file (410 `export_expired` after `expires_at`). `GET /exports?resource=&status=&page=` → history. `POST /exports/{id}/cancel` → 200. These paths are additions to canon §0.8 and are collected as **CCR-20**, together with the reuse of `reports_export` for list exports (`report_name = 'list:{resource}'`) and the requested columns `reports_export.resource varchar(32) NULL`, `reports_export.created_by_id` and `IX(tenant_id, created_at DESC)`.
- `GET /reports/{name}.csv|.xlsx?…` (§22.11, unchanged) is the report alias; > 5,000 rows returns 202 `{ export_id }` polled at `GET /reports/exports/{id}`, which is the same object as `GET /exports/{id}` (PLT-08 and PLT-10 already depend on this path and keep working).
- Errors: 400 `validation_error`, `invalid_choice`, `nothing_to_export`, `export_too_large`, `too_many_ids`, `invalid_date_range`; 403 `permission_denied`; 404; 409 `export_in_progress` (cancel); 410 `export_expired`; 429 with `Retry-After`.
- Frontend: `exportService.request(payload)` (handles both the 200 blob and the 202 job), `get(id)`, `download(id)`, `list(params)`, `cancel(id)`; a shared `useExport(resource)` hook wires any `UbDataGrid` toolbar to `exportThunk` with the grid's current filters and visible columns.

#### 15. Database Impact
`reports_export` (§21.3.11) — insert per async export; updates for `status`, `file_attachment_id`, `row_count`, `expires_at`, `params.error`, `params.downloads`. **CCR-20** requests `resource varchar(32) NULL`, `created_by_id uuid NULL`, `size_bytes bigint NULL` and `IX(tenant_id, created_at DESC)` plus `IX(status, expires_at)` for the purge job. `files_attachment` (`kind='export_file'`) insert and soft-delete on expiry. `platform_job` (CCR-18) one row per async export. `platform_audit_log` one row per export request and one per download of a stored file. Reads: whatever the resource's queryset touches, always through the tenant-scoped manager and always with `select_related`/`prefetch_related` declared by the `ExporterSpec` so a 100,000-row export does not become 100,000 queries; `.iterator(chunk_size=2000)` keeps the server-side cursor small. No new indexes are needed on the business tables — every exporter reuses the list endpoint's index (§21.4).

#### 16. Audit Requirements
`export.requested { resource|report_name, format, filters, columns, row_count, sync: bool }` on every request — this is the row that answers "who took the customer list out of the system", so it is mandatory even for the sync path; `export.completed { export_id, row_count, size_bytes, duration_ms }`; `export.failed { export_id, code }`; `export.downloaded { export_id, actor }` on each download of a stored file; `export.expired { export_id }` from the purge command with `actor_type='system'`. Retention follows the audit table's policy; the rows carry no exported data, only the filters.

#### 17. Notifications
In-app `export_ready` to the requesting user when an async export finishes: "Your export is ready — 38,000 rows (Excel)" with `data.route = /exports/{id}` and a download action; `export_failed` on failure with the reason. Nothing is sent for a sync export (the file is already in the browser). No SMS or WhatsApp. The notification is suppressed when the user is still on the page that requested the export and the toast has already updated, so the event never appears twice (the IMP-01 rule, reused).

#### 18. Analytics / Event Tracking
`ub.exports.requested { resource, format, row_count, column_count, sync: bool, from: grid|report|selection|history }`, `ub.exports.completed { resource, format, row_count, duration_ms }`, `ub.exports.failed { resource, code }`, `ub.exports.downloaded { resource, format, age_hours }`, `ub.exports.columns_customised { resource, removed[], added[] }`, `ub.exports.blocked { code }` (`export_too_large`, `nothing_to_export`, `permission_denied`), `ub.exports.history_opened`.

#### 19. Security
Every export is tenant-scoped through the same manager as the list, and the CI tenant-isolation suite runs an export of every registered resource as a member of tenant A with tenant B's data present, asserting zero foreign rows. Download URLs are authenticated and permission-checked at download time, not just at creation; there is no signed public URL (BR-7). Files are stored under `MEDIA_ROOT/exports/<tenant_id>/` with UUID names. CSV injection is neutralised by the shared writers. Column-level permissions (BR-4) prevent a staff member with an override from exporting cost data. Rate limits (10/hour/user, §22.1) and the 100,000-row cap bound both abuse and accidental denial of service. Export requests are audited with their filters, which is the DPDP-relevant trace for personal data leaving the system; the export history makes that visible to the owner without a support ticket. Files carry no tenant data in their names beyond the resource and a timestamp.

#### 20. Performance
Sync path: one `COUNT(*)` (cheap on the list's index), then a streaming response over `.iterator(chunk_size=2000)` — constant memory, first byte in well under a second for a warm index. Async path: identical iteration inside the scheduler, writing to a temporary file and renaming on success. The XLSX writer emits SheetML incrementally into the zip stream, so a 100,000-row sheet never materialises in memory. Serialisation is done by plain attribute access and `ColumnSpec` formatters, not DRF serializers, which is roughly 5× faster for this shape of work. Related objects are pre-joined per the spec (`select_related('party','category','unit')`), so the query count is O(1). Budgets: 5,000-row CSV ≤ 3 s to first byte and ≤ 15 s total; 100,000-row XLSX ≤ 4 min and ≤ 128 MB RSS; the purge command processes a day's expired files in ≤ 30 s.

#### 21. Testing
- T-IMP-02-1 unit: `ColumnSpec` formatters — money `1250.5` → `1250.50`, quantity `3` → `3.000`, negative `-98.60`, date `2026-09-18`, boolean `Yes`, null → empty string.
- T-IMP-02-2 unit: CSV dialect — BOM present, CRLF, a value containing a comma, a quote and a newline round-trips through Python's `csv.reader`.
- T-IMP-02-3 **parity test** (the important one): for every registered resource, run the list endpoint and the export with an identical randomised filter set and assert `export row count == meta.total` and that the first and last rows match the first and last rows of the sorted list.
- T-IMP-02-4 integration: 5,001 rows → 202 with an `export_id`; 5,000 rows → 200 streaming; 100,001 → 400 `export_too_large`.
- T-IMP-02-5 integration: async build produces a file, `status='ready'`, `expires_at` 7 days out, a notification exists, and the download streams the same byte count.
- T-IMP-02-6 integration: download after `expires_at` → 410; after the purge command → the blob is gone and the status is `expired`.
- T-IMP-02-7 permission: staff export → 403/hidden; accountant export → 200; `purchase_price` requested without `reports.financial.read` → 403; audit-log export without `platform.audit.read` → 403.
- T-IMP-02-8 security: cross-tenant `export_id` → 404; a party named `=SUM(A1)` is written as `'=SUM(A1)`; the tenant-isolation suite over every resource.
- T-IMP-02-9 unit: the XLSX writer's output opens in a reference parser, the header row is bold and frozen, money cells carry `#,##0.00` and date cells are real dates.
- T-IMP-02-10 integration: totals row equals `meta.totals` for parties, invoices and payments under three different filter sets.
- T-IMP-02-11 integration: selection export with `id__in` of 12 ids returns exactly those rows; 1,001 ids → 400.
- T-IMP-02-12 component: the export menu label carries the row count; the columns dialog pre-selects the grid's visible columns and hides permissioned ones; the ready toast shows a Download action.
- T-IMP-02-13 E2E (360 px): filter a party list, export CSV, open the file and check the row count and the totals row; then a large ledger export through the async path and the notification.
- T-IMP-02-14 performance: 100,000-row CSV and XLSX within the FR budgets with RSS asserted.

#### 22. Acceptance Criteria
- AC-1 (US-IMP-02-1) Given the party list filtered to "You will get" and tag "Camp Area" showing 240 rows, when I export to CSV, then the file has 240 data rows plus a header and a totals row, and those rows are the same rows in the same order as the screen.
- AC-2 (US-IMP-02-2) Given an exported CSV, when I open it in Excel, then the balance column sums with `=SUM()` without any cleaning, amounts read as `1250.50` and dates are recognised as dates.
- AC-3 (US-IMP-02-3) Given the columns dialog, when I untick `purchase_price` and export, then the file has no such column; and given a user without `reports.financial.read`, then the column is not offered and is refused with 403 if requested directly.
- AC-4 (US-IMP-02-4) Given a ledger export of 38,000 rows, when I request it, then the API returns 202 with an `export_id`, I can keep using the app, and a notification "Your export is ready — 38,000 rows" arrives with a working download.
- AC-5 (US-IMP-02-5) Given an export generated yesterday, when I open Export history, then it is listed with its row count, format and remaining validity, and Download works without regenerating it.
- AC-6 (US-IMP-02-6) Given the invoice list showing totals of ₹4,12,300 due, when I export it, then the last row of the file carries the same total under the `amount_due` column.
- AC-7 (US-IMP-02-7) Given a file older than 7 days, when I open its download link, then I get a clear "This file has expired — generate it again" message and a button that re-applies the original filters.

#### 23. Dependencies
`reports_export` (§21.3.11 + CCR-20), `files_attachment` (`export_file`), `platform_job` + `run_scheduler` (ADR-012, CCR-18), the shared writers and CSV conventions of §17.8.0, ADR-023 (in-house XLSX writer), `UbDataGrid` (column visibility and row selection), `UbDialog`/`UbDrawer`/`UbSnackbar`/`UbStatusBadge`, NTF-01 (`export_ready` type), PLT-08 (audit-log export), PLT-10 (the full-tenant ZIP export reuses `reports_export` and this download view), every list feature's FilterSet (PTY-02, INV-02, SAL-08, PUR-03, PAY-03, EXP-02, LED-04), RPT-02…RPT-07 (report exports), `purge_export_files`.

#### 24. Future Enhancements
Scheduled exports emailed or WhatsApped monthly to the accountant (Phase 3, needs the messaging adapters of NTF-02); saved export presets ("My GST pack") that bundle several resources into one ZIP; Tally XML (RPT-13) and GSTR-1 JSON (RPT-12) as additional formats on the same pipeline; a Google Sheets push through a connector (Future); PDF for lists (today only documents and statements have print views); incremental exports ("only what changed since my last export") keyed on `updated_at`; per-tenant column presets shared across users.

---
### IMP-03 — Excel templates & bulk edit — Phase 2

#### 1. Business Objective
Meet users where their data already is. Most shopkeepers and their accountants keep catalogues and price lists in `.xlsx`, not `.csv`, and "save as CSV" is the single most common failure point of IMP-01 — wrong delimiter, mangled Devanagari, barcodes turned into `8.9E+12`. Accepting the Excel file directly removes that step. The second half of the feature removes the other painful chore: changing hundreds of prices at once, by sheet or by rule, safely, with a preview and an undo. Measures: Excel uploads reach `ready` at a ≥ 15-point higher rate than CSV uploads of the same kinds; ≥ 50 % of Phase-2 tenants with > 100 items use a bulk price update within 90 days; zero unintended mass price changes (every apply has a preview and a 24-hour revert, and the revert-usage rate is monitored); a 2,000-item price update completes in ≤ 60 s.

#### 2. User Personas
Owner (OW) — the only persona who may change prices in bulk or upsert master data; Accountant (AC) — prepares the Excel file and reviews the diff, cannot apply; Staff (ST) — excluded from bulk edits entirely, even when they hold `inventory.item.write`, because the blast radius is a whole catalogue.

#### 3. User Stories
1. US-IMP-03-1 — As an owner I want to upload my Excel file directly, so that I do not have to save it as CSV and lose my Hindi names and barcodes.
2. US-IMP-03-2 — As an owner I want an Excel template with dropdowns for units, GST codes and yes/no columns, so that I cannot type a value the system will reject.
3. US-IMP-03-3 — As an owner I want to re-upload my sheet after changing it and have existing items updated instead of rejected as duplicates.
4. US-IMP-03-4 — As an owner I want to see, before anything is saved, which rows will be created, which will be updated and exactly which fields change.
5. US-IMP-03-5 — As an owner I want to raise all my supplier's prices by 8 % without touching each item.
6. US-IMP-03-6 — As an owner I want prices rounded sensibly after a percentage change, so that I do not end up selling at ₹437.83.
7. US-IMP-03-7 — As an owner I want to undo a bulk change I regret, for a while afterwards.
8. US-IMP-03-8 — As an accountant I want a record of what changed, from what, to what and by whom.

#### 4. Functional Requirements
1. FR-1 **XLSX input.** `POST /imports` accepts `.xlsx` in addition to `.csv` for every registered kind. Parsing is done by the in-house `imports/parsers/xlsx_reader.py` built on the standard library (`zipfile` + `xml.etree.ElementTree` streaming over `xl/worksheets/sheet1.xml`, `xl/sharedStrings.xml` and `xl/styles.xml`) — **ADR-023**, the same decision that gives IMP-02 its writer; `openpyxl` is not added (ADR-021). Supported: the first worksheet only (or the sheet named `Data` when present), shared and inline strings, numeric cells, boolean cells, date cells resolved through the workbook's number formats and the 1900/1904 epoch flag (including the 1900 leap-year quirk), formula cells read as their **cached value** (a formula with no cached value is an error `formula_without_value`), and merged cells read as the top-left value with a `merged_cell` warning. Not supported and rejected with a clear message: `.xls` (`legacy_excel_format`, "Save as .xlsx first"), password-protected workbooks (`encrypted_file`), macros are simply ignored, and charts, images and pivot caches are skipped.
2. FR-2 **Row and column semantics are unchanged.** After parsing, an XLSX row becomes the same list of strings a CSV row would, and the shared coercers of §17.8.0 and each `ImporterSpec` run exactly as before — except that a cell already typed as a number or a date is passed through without string parsing, which is what saves barcodes and dates from Excel's own mangling. A numeric cell in a text column (a barcode stored as a number) is rendered without exponent notation and flagged `numeric_text_column` as a warning rather than the CSV-era error.
3. FR-3 **XLSX templates.** `GET /imports/templates/{kind}.xlsx` returns a two-sheet workbook produced by `writers/xlsx_writer.py`: sheet `Data` with the frozen, bold header row, the `#`-comment guidance moved into a cell comment on each header, the spec's example rows, sensible column widths, and **data validation dropdowns** (`<dataValidation type="list">`) on every enum column (`item_type`, `tax_code`, `unit`, every boolean column, `direction` for opening balances) sourced from a hidden `Lists` sheet populated with the tenant's own units, categories and active tax codes; sheet `Instructions` with the column table (name, required, meaning, example) in the requester's language. Columns that must stay text (`sku`, `barcode`, `hsn_sac`, `mobile`) are given a text number format so Excel does not reformat them.
4. FR-4 **Upsert mode.** `POST /imports` accepts `options: { mode: "create_only" | "upsert", match_on: "<column>" }` stored in `imports_job.options` (**CCR-21**). `create_only` is the default and is IMP-01's behaviour. In `upsert` mode the spec's declared match key is used to find an existing row — items match on `sku` (or `barcode` when `match_on='barcode'`), parties on `mobile` (or `display_code`), item prices on `sku` — and the row becomes an update instead of an error. A kind that does not declare a match key rejects `upsert` with 400 `upsert_not_supported` (`opening_stock` and opening balances are create-only by nature: they post immutable ledger and stock rows).
5. FR-5 **Update semantics.** Only columns **present in the file's header** are updated; a column the user removed from the sheet is left untouched, and an empty cell in a present column means "clear this optional field" for nullable columns and is an error for required ones (`required_on_update`). Immutable-by-nature fields are never updated and produce the error `immutable_field` when they differ: an item's `item_type` and `unit_id` once stock movements exist, a party's `mobile` when it would collide with another party. Changing `track_stock` follows the INV-01 rules (false→true needs opening stock, true→false needs `on_hand = 0`), surfaced as row errors rather than silent skips.
6. FR-6 **Diff preview.** In `upsert` mode `GET /imports/{id}` returns, in addition to IMP-01's fields, `result.diff_summary = { create: n, update: n, unchanged: n, error: n }` and `result.diff_rows[≤500] = [{ row, action: "create"|"update"|"unchanged", key, entity_id?, changes: [{ column, from, to }] }]`. A row whose every present column already matches is `unchanged` and is skipped at commit (no write, no audit row), which keeps a re-uploaded sheet cheap and idempotent.
7. FR-7 **Bulk price update by sheet.** A new importer kind `item_prices` (registry entry, MVP of this feature) with columns `sku, name (read-only echo), selling_price, purchase_price, mrp, tax_code` and `mode` forced to `upsert` on `sku`. Rows whose `sku` is unknown are errors (`item_not_found`), never creations — a price sheet must not invent items. The natural workflow is: export items (IMP-02) → edit the price columns in Excel → import as `item_prices`.
8. FR-8 **Bulk price update by rule (in-app).** `POST /items/bulk-price-update/preview` and `POST /items/bulk-price-update` (**CCR-22**) with `{ selection: { item_ids[] } | { filters: {…the item list's filters…} }, target: "selling_price"|"purchase_price"|"mrp", operation, value, rounding, skip_zero: true }` where `operation ∈ { set, increase_percent, decrease_percent, increase_amount, decrease_amount, set_margin_over_purchase }` and `rounding ∈ { none, nearest_1, nearest_5, nearest_10, end_99, end_95 }`. The maths is normative:
   ```
   base       = item[target]                        # Decimal, 2 dp
   raw        = set                     → value
              | increase_percent        → base × (1 + value/100)
              | decrease_percent        → base × (1 − value/100)
              | increase_amount         → base + value
              | decrease_amount         → base − value
              | set_margin_over_purchase→ item.purchase_price × (1 + value/100)
   stepped    = none      → round2(raw)                       # half-up
              | nearest_1 → Decimal(round_half_up(raw, 0))
              | nearest_5 → Decimal(round_half_up(raw/5, 0)) × 5
              | nearest_10→ Decimal(round_half_up(raw/10,0)) × 10
              | end_99    → floor(raw/100)×100 + 99  if that ≥ raw − 50 else ceil(raw/100)×100 + 99  → nearest ₹x99
              | end_95    → same rule with 95
   new_value  = max(stepped, 0)                                # never negative
   ```
   Worked example: base ₹405.00, `increase_percent 8` → raw 437.40 → `nearest_5` → 437.40/5 = 87.48 → 87 → **₹435.00**; with `end_99` → floor(437.40/100)=4 → 499 vs ceil → 499? the rule picks the ₹x99 nearest to 437.40, i.e. **₹399.00** (|437.40−399| = 38.40) over ₹499.00 (61.60). With `none` → **₹437.40**.
9. FR-9 **Preview before apply.** `POST /items/bulk-price-update/preview` writes nothing and returns `{ count, rows[≤500] { item_id, name, sku, from, to, delta, delta_percent }, warnings[] }`. `warnings` covers: `below_purchase_price` (new selling price below `purchase_price`), `above_mrp` (new selling price above `mrp`), `zero_base` (base is 0 and the operation is multiplicative — skipped when `skip_zero`), `large_change` (|delta_percent| > 50). The apply endpoint refuses without `confirm: true` when any `below_purchase_price` or `large_change` warning exists (409 `confirmation_required` with `details.warnings`).
10. FR-10 **Scale.** ≤ 500 affected items apply synchronously in one transaction (200 with the result). > 500 create an `imports_job` with `kind='item_prices'`, `options.source='rule'` and the resolved item ids in `options.selection`, and go through the IMP-01 machinery — the same job page, the same progress, the same notification — so there is one place to look for "what did I change".
11. FR-11 **Revert (US-7).** Every bulk price change — by sheet or by rule — stores the before-values in `imports_job.result.revert = { target, items: [{ item_id, from }] }` (capped at 10,000 entries). `POST /imports/{id}/revert` (**CCR-21**) within **24 hours** of completion restores them in one transaction, creates a *new* completed job of kind `item_prices` with `options.reverts_job_id`, and marks the original `result.reverted_by`. After 24 hours, or when any of the affected items has been edited since, the endpoint returns 409 `revert_window_closed` or 409 `items_changed_since` with `details.items[]`, and the UI directs the user to re-import the previous values (which the export they hopefully kept still holds).
12. FR-12 **Safety rails.** A rule-based apply that would touch more than 50 % of the tenant's active items, or more than 1,000 items, shows a second confirmation naming the exact count and requires the user to type the count? — no typing gimmicks: it requires `confirm: true` plus an explicit `UbConfirmDialog` whose primary action is the outlined destructive variant and whose body states "This changes prices for 1,240 of your 1,800 items. You can undo this for 24 hours." Bulk edit is refused entirely while another bulk job for the same tenant is running (409 `import_in_progress`).
13. FR-13 **Scope of bulk edit at Phase 2** is prices only (`selling_price`, `purchase_price`, `mrp`) plus, through the sheet path, `tax_code`. Bulk changes to stock, categories, units or party fields are explicitly out of scope (see §24) — the sheet upsert path already covers them for users who want them, with a full diff.
14. FR-14 **Entry points.** Items list → select rows or apply filters → toolbar "Bulk actions" → "Update prices…"; Items list → ⋯ → "Import prices (Excel)"; the import wizard's kind picker gains "Item prices" and every kind card gains an "Excel" template button beside the CSV one.

#### 5. Non-Functional Requirements
XLSX parsing throughput ≥ 5,000 rows/s with memory O(row) (streaming `iterparse`, shared strings held in one list); a 10,000-row `.xlsx` validates within the IMP-01 budget plus 20 %; template generation ≤ 500 ms; the rule preview for 2,000 items ≤ 800 ms (one query plus in-memory Decimal maths); the apply of 2,000 items ≤ 60 s including audit; the diff table renders 500 rows at 60 fps through virtualisation in `UbDataGrid`; all new copy in `en`/`hi` (`imports.mode.upsert` = "मौजूदा को अपडेट करें", `imports.diff.update` = "अपडेट", `items.bulkPrice.title` = "कीमतें बदलें", `items.bulkPrice.increasePercent` = "% बढ़ाएँ", `items.bulkPrice.rounding` = "गोल करें", `imports.revert` = "वापस करें"); the bulk-price drawer is fully operable at 360 px with the preview as cards.

#### 6. User Flow
Primary (Excel upsert): Items → ⋯ → Import → the kind card shows "CSV" and "Excel" template buttons → download the Excel template → fill 120 rows, 90 of which already exist by SKU → upload the `.xlsx` → mode toggle "Update items that already exist" → `ready` with "30 new · 90 updated · 0 unchanged · 0 problems" → open "What will change" → a diff table showing per row the columns that move → Import → `completed` → summary "30 created, 90 updated" → "Undo is available for 24 hours" (prices only).
Primary (rule): Items → filter Category = Grocery (340 items) → Bulk actions → Update prices… → drawer: target "Selling price", operation "Increase by %", value 8, rounding "Nearest ₹5" → Preview → table of 340 rows with from → to and 3 warnings ("2 items would sell below cost") → the owner unticks those two → Apply → confirm dialog naming 338 items → toast "338 prices updated · Undo" → the item list refreshes.
Alternate A (large rule): 2,400 items → 202 → the job page with progress → notification → summary with the Undo button.
Alternate B (undo): summary card → Undo → confirm → "338 prices restored".
Alternate C (undo too late): 30 hours later → 409 `revert_window_closed` → the card explains and offers "Export current prices" so the user at least has a snapshot.
Alternate D (bad file): `.xls` → rejected at upload with "Save the file as .xlsx (Excel Workbook) and try again".
Alternate E (formula file): a sheet whose price column is `=B2*1.08` with cached values → imported from the cached values, with a warning "12 cells were formulas — their last calculated values were used".

#### 7. UI Requirements
Routes: the IMP-01 wizard (`app/imports/page.tsx`, `app/imports/[id]/page.tsx`) gains the mode toggle, the diff view and the revert action; no new route for the rule path, which lives in a `UbDrawer` over the items list. Components: `ImportModeToggle` (`MLToggleGroup` "Create only" / "Update existing", with a `UbHelpHint` explaining the match key and a `MLSelect` for `match_on` when a kind offers more than one), `ImportDiffTable` (`UbDataGrid`, virtualised, grouped by action with `UbStatusBadge` tones — `success` create, `info` update, muted unchanged, `error` problem — and an expandable per-row change list rendering `from → to` with the changed values in `ds-num`), `ImportRevertCard` (`MLAlert` on a completed price job with the remaining window as a countdown and an outlined destructive "Undo" button), `BulkPriceDrawer` (`UbDrawer`: scope summary "340 items match your filters" with a "selected rows only" switch, `MLSelect` target, `MLRadioGroup` operation, `UbMoneyInput`/`UbPercentInput` bound to the operation, `MLSelect` rounding with a live example "₹405.00 → ₹435.00", `MLSwitch` "Skip items priced 0", Preview button), `BulkPricePreviewTable` (`UbDataGrid` with a per-row `MLCheckbox` so an item can be excluded, warning rows outlined in `warning` tone with the reason inline), `UbConfirmDialog` for the apply. Redux: `importJobSlice` gains `mode`, `matchOn`, `diffRows`, `diffSummary`, `revert`; a new `bulkPriceSlice` (`scope`, `form`, `preview`, `excluded[]`, `status`) with `bulkPriceThunk` (`previewBulkPrice`, `applyBulkPrice`, `revertPriceJob`) over `api/itemService.ts`; Yup `bulkPriceUpdateSchema` and an extended `importUploadSchema`.

#### 8. UX Requirements
The mode toggle is phrased as an outcome, not a mechanism: "Create only — stop if an item already exists" / "Update existing — change items that match by SKU". The diff is the heart of the feature and is never optional: the Import button on an upsert job is labelled "Create 30 and update 90" so the user cannot miss the scale. In the rule drawer the rounding `MLSelect` shows a live worked example using the first matching item, which is how a shopkeeper actually checks that a rule does what they meant. Warnings are shown inline on the row, in `warning` tone with a one-line reason ("Below cost ₹412.00"), and the two rows the owner unticks simply drop out of the apply — no modal argument. Every completed price change ends with a plain sentence about undo and a countdown, because the fear of a mass change is the real blocker. Destructive confirmations are outlined per §23; nothing in this feature uses a filled red button. Copy never says "upsert", "diff" or "job".

#### 9. States
| State | UI |
|---|---|
| Initial (wizard) | mode toggle defaulted to "Create only"; Excel and CSV template buttons side by side |
| Loading | diff table skeleton while the job is fetched |
| Empty | upsert preview with everything `unchanged` → "Nothing to change — this file matches what you already have" and the Import button disabled |
| Processing | IMP-01's progress, plus "Updating prices…" wording for `item_prices` |
| Success | summary with created/updated/unchanged counts and the revert card with its countdown |
| Partial | never — the commit remains all-or-nothing (IMP-01 BR-1) |
| Completed + reverted | the original job's card shows "Undone on 19/09/2026 by Akash" and the Undo button is gone |
| Failed | IMP-01's failure card; for the rule path, an error toast naming the code |
| Disabled | bulk actions hidden without `inventory.item.write`; upsert mode hidden for kinds that do not support it; Undo hidden outside the window |
| Error (rule) | `confirmation_required` renders the confirm dialog; `revert_window_closed` and `items_changed_since` render as explanatory cards with the affected item names |
| Preview stale | changing any field in the drawer invalidates the preview and greys the Apply button until Preview is run again |

#### 10. Validation Rules
File: extension `.csv` or `.xlsx` (400 `invalid_file_type`); `.xls` → 400 `legacy_excel_format` ("Save as .xlsx (Excel Workbook) and try again"); encrypted → job `failed` with `encrypted_file` ("Remove the password and upload again"); no worksheet or an empty first sheet → `empty_file`; a formula cell without a cached value → row error `formula_without_value` ("Open the file in Excel, save it, and upload again"). Options: `mode ∈ {create_only, upsert}` (400 `invalid_choice`); `match_on` must be one the kind declares (400 `invalid_choice`); `upsert` on a kind without a match key → 400 `upsert_not_supported`. Upsert rows: unknown key in `item_prices` → `item_not_found` ("No item with SKU {x}"); a blank required column on an update → `required_on_update`; an immutable field changed → `immutable_field` ("Unit cannot be changed once stock has moved"). Rule form: `target` and `operation` required (`required`); `value` required, > 0 for percentage and amount operations, ≥ 0 for `set` (400 `invalid_amount`, "Enter a value greater than zero"); percentages ≤ 500 (`invalid_percent`, "Use 500 % or less"); `decrease_percent` ≤ 100; a selection or a filter set is required and must match ≥ 1 item (400 `nothing_to_update`, "No items match"); ≤ 10,000 affected items (400 `too_many_items`, "Narrow the selection — at most 10,000 items"); `confirm` required when FR-9/FR-12 demand it (409 `confirmation_required`). Revert: within 24 h (409 `revert_window_closed`, "Undo is only available for 24 hours"); no affected item edited since (409 `items_changed_since`).

#### 11. Business Rules
1. BR-1 XLSX changes only the parser. Validation, the all-or-nothing commit, permissions, retention, audit and the wizard are IMP-01's, unchanged (IMP-01 BR-4).
2. BR-2 Upsert updates only the columns present in the header (FR-5); absence means "leave alone", blank means "clear" for nullable columns.
3. BR-3 `unchanged` rows are skipped entirely at commit — no write, no `updated_at` bump, no audit row — so re-uploading the same sheet is a no-op.
4. BR-4 A price sheet never creates items (FR-7); a catalogue sheet may, in `upsert` mode.
5. BR-5 The rule maths of FR-8 is normative and shared by the preview, the sync apply and the async job; the client's drawer example uses the identical algorithm in `decimal.js-light` and the three are covered by one set of test vectors.
6. BR-6 Rounding never produces a negative price; `max(stepped, 0)` is applied last.
7. BR-7 `mrp` is never raised implicitly: a selling price that crosses `mrp` is a warning, not an automatic `mrp` change; and `mrp` itself can only be changed by targeting it directly.
8. BR-8 Undo restores values, not history: it writes the previous numbers back and records that it did so; it does not delete the original job's audit rows.
9. BR-9 The undo window is 24 hours from `finished_at` and is void as soon as any affected item's `selling_price`/`purchase_price`/`mrp` has changed by another path (FR-11), because a blind restore would silently discard that change.
10. BR-10 Bulk edits are prices only at Phase 2 (FR-13); anything else goes through the sheet path so the user sees a diff.
11. BR-11 One bulk job per tenant at a time (IMP-01 BR-11), and a rule apply over 500 items always becomes a job so it is visible in the import history.
12. BR-12 Every price change, by any path, writes `item.price_changed` audit rows with `before`/`after` per item, batched with `metadata.batch=true` and `metadata.import_job_id` (IMP-01 BR-7), so the audit browser stays usable while the trail stays complete.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Download an Excel template | `inventory.item.read` (or the kind's read codename) | ✅ | ✅ | ✅ | ✅ |
| Upload an `.xlsx` | the kind's `required_permissions` (IMP-01) | ✅ | ✅ | per kind | ❌ |
| Use `upsert` mode | the kind's write codename **and** `platform.tenant.manage`-free but owner/admin only by role check (an update path is not a staff action) | ✅ | ✅ | ❌ | ❌ |
| Import item prices | `inventory.item.write` | ✅ | ✅ | ❌ | ❌ |
| Preview a rule-based price update | `inventory.item.read` | ✅ | ✅ | ✅ | ✅ |
| Apply a rule-based price update | `inventory.item.write`, owner/admin only | ✅ | ✅ | ❌ | ❌ |
| Undo a price job | `inventory.item.write`, and the actor must be the job's creator or an owner | ✅ | ✅ | ❌ | ❌ |
| View the diff and the history | the kind's read codename | ✅ | ✅ | ✅ | ✅ |
Staff exclusion from bulk apply is a role check on top of the codename (§12 of INV-01 grants staff `inventory.item.write` for single items); a tenant may grant it through `platform_membership.permissions_override`.

#### 13. Edge Cases
1. EC-1 A workbook whose first sheet is a cover page → the reader prefers a sheet named `Data`, else the first sheet with a matching header row, else `missing_columns`.
2. EC-2 A 1904-epoch workbook (Excel for Mac) → dates resolved correctly via `workbookPr/@date1904`.
3. EC-3 A date typed as text ("18/09/2026") in an XLSX → falls through to the string coercer and parses as dd/mm/yyyy.
4. EC-4 A barcode stored as a number → read from the numeric cell and rendered without exponent notation, with a `numeric_text_column` warning instead of the CSV-era `invalid_barcode` error.
5. EC-5 Trailing empty rows that Excel keeps in `dimension` → rows with every cell blank are skipped, not counted as data.
6. EC-6 200,000 shared strings in a 10,000-row file → streamed; memory stays bounded because only the strings actually referenced by the sheet are retained.
7. EC-7 Upsert where two file rows match the same existing item → the later row is `duplicate_in_file` (IMP-01 FR-5), not a double update.
8. EC-8 Upsert where the match column is blank → treated as a create; blank keys never match.
9. EC-9 A rule applied to a filter whose result set changes between preview and apply → the apply resolves the filter again and reports the new count in the confirm dialog; the user confirms the number they are shown.
10. EC-10 A rule targeting `purchase_price` → `inventory_item.purchase_price` is the "last cost" hint, not a valuation input (INV-01 BR); `inventory_item_stock.avg_cost` is untouched, and the drawer says so.
11. EC-11 `set_margin_over_purchase` on an item with `purchase_price = 0` → `zero_base` warning and the row is skipped when `skip_zero`.
12. EC-12 `end_99` on a base of ₹40 → nearest ₹x99 below is ₹0? The rule floors at the ₹99 grid and clamps to ₹99 as the minimum, with a `large_change` warning when the delta exceeds 50 %.
13. EC-13 Undo attempted while another bulk job is running → 409 `import_in_progress`.
14. EC-14 Undo of a job that both created and updated items → only the updated items' prices are restored; created items are left alone (deleting them would destroy stock and documents), and the card says so.
15. EC-15 An item archived between the apply and the undo → its price is still restored (archiving does not freeze prices), with a note in the result.

#### 14. API Requirements
- `POST /imports` — multipart gains `options` as a JSON string field `{ mode, match_on }`; the accepted content types add `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Errors add 400 `legacy_excel_format`, `upsert_not_supported`, `invalid_choice`.
- `GET /imports/templates/{kind}.xlsx` → the workbook of FR-3.
- `GET /imports/{id}` — response gains `options`, `result.diff_summary`, `result.diff_rows[≤500]`, `result.revert { available, expires_at, item_count }`, `result.reverted_by`.
- `POST /imports/{id}/revert` → 200 `{ data: { new_job_id, restored: n } }` (**CCR-21**). Errors: 409 `revert_window_closed`, `items_changed_since` (`details.items[]`), `import_in_progress`, 403.
- `POST /items/bulk-price-update/preview` `{ selection, target, operation, value, rounding, skip_zero }` → 200 `{ data: { count, rows[≤500], warnings[] } }`; writes nothing (**CCR-22**).
- `POST /items/bulk-price-update` — same body plus `confirm: bool` and `exclude_item_ids[]`; `Idempotency-Key` required → **200** `{ data: { updated, job_id: null, revert_expires_at } }` when ≤ 500 items, or **202** `{ data: { job_id } }` above that (**CCR-22**). Errors: 400 `validation_error`, `nothing_to_update`, `too_many_items`, `invalid_percent`; 403; 409 `confirmation_required` (`details.warnings`), `import_in_progress`; 429.
- Frontend: `importService.upload(kind, file, {mode, matchOn})`, `revert(id)`, `templateUrl(kind, 'xlsx')`; `itemService.previewBulkPrice(payload)`, `applyBulkPrice(payload)`.

#### 15. Database Impact
`imports_job` — `options jsonb` (CCR-17, now carrying `mode`, `match_on`, `source`, `selection`, `reverts_job_id`) and `result` carrying `diff_summary`, `diff_rows`, `revert` and `reverted_by` (**CCR-21** documents the `result`/`options` sub-schemas and adds `IX(tenant_id, kind, created_at DESC)` for the price-job history). `files_attachment` (`import_file`, now also `.xlsx`). `inventory_item` — `selling_price`, `purchase_price`, `mrp`, `tax_code` updated in bulk with a single `UPDATE … FROM (VALUES …)` per chunk of 1,000; `updated_at` bumped only for rows that actually change (BR-3). `inventory_item_stock` is **not** touched — bulk price editing never changes valuation. `platform_job` (CCR-18) for the async path. `platform_audit_log` — `item.price_changed` rows per item, batched. No new business table: the revert payload lives in `imports_job.result`, which is why it is capped at 10,000 entries and why the window is 24 hours rather than forever.

#### 16. Audit Requirements
`import.requested` gains `options` in its metadata; `import.committed` gains `diff_summary`. New actions: `item.price_changed { item_id, target, from, to, source: sheet|rule|revert, import_job_id }` — one row per item, batched (BR-12); `import.reverted { job_id, new_job_id, restored, target }`; `items.bulk_price_updated { count, target, operation, value, rounding, filters_or_selection, warnings_overridden }` — one summary row per apply, which is the row a support agent looks at first. Before/after snapshots are the per-item `from`/`to` pairs; the summary row carries the rule so "why did 340 prices move" is answerable without reading 340 rows.

#### 17. Notifications
In-app `import_done` (reused) for the async price path: "Price update finished — 2,400 items updated" with `data.route` to the job and `data.revert_expires_at` so the card can show the countdown; `import_failed` on failure. A second in-app notification `bulk_price_reverted` goes to all owners when someone reverts a price job, because an undo of a catalogue-wide change is something every owner should see: "Akash undid the price update of 18/09/2026 — 338 prices restored." No SMS or WhatsApp.

#### 18. Analytics / Event Tracking
`ub.imports.xlsx_uploaded { kind, rows, sheet_count, had_formulas: bool }`, `ub.imports.template_downloaded { kind, format: csv|xlsx }`, `ub.imports.mode_selected { kind, mode, match_on }`, `ub.imports.diff_viewed { create, update, unchanged }`, `ub.imports.upsert_committed { kind, created, updated, unchanged }`, `ub.imports.reverted { kind, restored, age_minutes }`, `ub.inventory.bulk_price_previewed { count, target, operation, rounding, warnings }`, `ub.inventory.bulk_price_applied { count, target, operation, value_bucket, rounding, excluded, async: bool }`, `ub.inventory.bulk_price_blocked { code }`.

#### 19. Security
The XLSX reader is the new attack surface and is hardened accordingly: entries are read through `zipfile` with a total-uncompressed-size cap of 200 MB and a per-entry cap of 100 MB (zip-bomb defence, refused with `file_too_large`); only the four entries the parser needs are opened and their names are checked against a whitelist (no path traversal out of the archive); XML is parsed with `ElementTree` with external entity resolution disabled and DTDs rejected (XXE and billion-laughs defence); relationship files are not followed, so no external link is ever fetched; formulas are never evaluated, only their cached values read. Everything else inherits IMP-01: tenant-scoped ids, permissions re-checked inside the task, 30-day file retention, CSV/XLSX injection neutralisation on every write. Bulk apply is owner/admin-only, `Idempotency-Key`-protected so a retried request cannot double-apply a percentage, rate-limited to 10 applies per hour per tenant, and always audited with the rule. The revert endpoint is equally gated and equally audited.

#### 20. Performance
The reader streams with `iterparse` and clears elements as it goes; shared strings are indexed once. A 10,000-row × 20-column `.xlsx` parses in ≈ 2 s and holds ≤ 60 MB. Upsert adds one keyed lookup per row against a dictionary preloaded in `preflight` (one query fetching the key column and the comparable fields for the whole tenant, or an `IN` batch of 1,000 when the catalogue is large), so the diff costs no extra queries. The commit writes with `bulk_update` in chunks of 1,000 on the changed rows only. The rule path resolves the selection with one query returning `(id, selling_price, purchase_price, mrp)`, does the arithmetic in memory, and writes with the same chunked `bulk_update`; 2,000 items take ≈ 6 s including audit inserts (`bulk_create` in chunks of 1,000). The preview is read-only and never locks. Template generation streams straight into the response.

#### 21. Testing
- T-IMP-03-1 unit: XLSX reader — shared strings, inline strings, numeric cells, boolean cells, dates under both epochs including 29/02/1900, a cached formula value, a merged cell, a blank trailing row.
- T-IMP-03-2 unit: reader rejections — `.xls` magic bytes, an encrypted workbook, a zip bomb over the size cap, an XML entity expansion attempt, an archive entry named `../../x`.
- T-IMP-03-3 unit: a barcode as a numeric cell renders as `8901234567890`, never `8.90123E+12`.
- T-IMP-03-4 unit: the FR-8 rule vectors — base 405 with `increase_percent 8` under every rounding mode (437.40 / 437 / 435 / 440 / 399 / 395), `decrease_percent 100` → 0, `set_margin_over_purchase` with a zero base, and the non-negative clamp.
- T-IMP-03-5 unit: the client's `decimal.js-light` implementation matches the server's for the whole vector table (shared fixture).
- T-IMP-03-6 integration: upsert of a 120-row items sheet with 90 matches → `diff_summary {create:30, update:90, unchanged:0}`; re-uploading the same file → `{create:0, update:0, unchanged:120}` and a commit that writes nothing.
- T-IMP-03-7 integration: a column absent from the header is not cleared; a blank cell in a present nullable column clears it; a blank in a required column errors `required_on_update`.
- T-IMP-03-8 integration: `item_prices` with an unknown SKU → `item_not_found`, no creation.
- T-IMP-03-9 integration: rule apply over 340 items → prices updated, audit rows written, `revert` payload stored, `revert_expires_at` 24 h out.
- T-IMP-03-10 integration: revert restores every value and creates a linked job; revert after 24 h → 409; revert after one item was edited → 409 `items_changed_since` naming it.
- T-IMP-03-11 integration: 600 affected items → 202 with a job; 500 → 200 synchronously.
- T-IMP-03-12 integration: `below_purchase_price` present without `confirm` → 409 `confirmation_required`; with `confirm` → applied; excluded ids are not touched.
- T-IMP-03-13 permission: staff apply → 403; accountant apply → 403; accountant preview → 200; staff upsert upload → 403.
- T-IMP-03-14 component: the mode toggle copy, the diff table's grouping and expandable change list, the rounding live example, the preview row exclusion, the revert countdown.
- T-IMP-03-15 E2E (360 px): Excel template → fill → upsert upload → diff → import → bulk rule update → preview → apply → undo.
- T-IMP-03-16 performance: 10,000-row `.xlsx` parse and a 2,000-item apply within the §20 budgets with RSS asserted.

#### 22. Acceptance Criteria
- AC-1 (US-IMP-03-1) Given an `.xlsx` catalogue with Hindi names and barcodes stored as numbers, when I upload it, then it validates without a "save as CSV" step, the names are intact and the barcodes appear as full digit strings.
- AC-2 (US-IMP-03-2) Given the Excel template for items, when I open it, then the unit, GST code and yes/no columns are dropdowns sourced from my own units and active tax codes, and the SKU and barcode columns are formatted as text.
- AC-3 (US-IMP-03-3) Given 90 of my 120 rows already exist by SKU, when I choose "Update existing" and import, then 30 items are created and 90 updated, and nothing is reported as a duplicate error.
- AC-4 (US-IMP-03-4) Given an upsert job, when I open "What will change", then each row shows create/update/unchanged and each update lists the columns that move as `from → to`, and the Import button reads "Create 30 and update 90".
- AC-5 (US-IMP-03-5) Given 340 Grocery items, when I apply "Increase selling price by 8 %", then all 340 prices rise by 8 % before rounding and the item list reflects it immediately.
- AC-6 (US-IMP-03-6) Given a base price of ₹405.00 with "Increase by 8 %" and rounding "Nearest ₹5", then the new price is ₹435.00; with rounding "None" it is ₹437.40; and the drawer showed exactly that example before I applied.
- AC-7 (US-IMP-03-7) Given a price update finished 2 hours ago, when I tap Undo, then all affected prices return to their previous values, a linked job records the undo, and the original job shows "Undone"; given 30 hours have passed, then Undo is unavailable with a clear explanation.
- AC-8 (US-IMP-03-8) Given any bulk price change, when the accountant filters the audit log to `items.bulk_price_updated`, then one row states the rule, the count and the actor, and the per-item `item.price_changed` rows carry the before and after values.

#### 23. Dependencies
IMP-01 (the whole framework — wizard, jobs, validation, commit, audit, retention), IMP-02 and ADR-023 (the shared in-house XLSX reader/writer), INV-01 (item fields, price rules, `track_stock` transitions), INV-02 (the item list's filters and row selection feed the rule scope), INV-09 (the items importer this feature extends with upsert), PTY-10 (the parties importer, same extension), `platform_job` + `run_scheduler` (ADR-012, CCR-18), NTF-01 (`import_done`, `bulk_price_reverted`), PLT-08 (audit browser), `UbDrawer`/`UbDataGrid`/`UbConfirmDialog`/`MLToggleGroup`, CCR-17 (`imports_job.options`), CCR-21 (revert endpoint and the `options`/`result` sub-schemas), CCR-22 (bulk-price endpoints).

#### 24. Future Enhancements
Bulk edit beyond prices — category, tax code, reorder point, party tags and credit limits — each with the same preview-and-undo shape; a column-mapping step so a user's own sheet layout can be used without rearranging columns, with the mapping remembered per tenant; scheduled or rule-based price lists (INV-13 price lists make "supplier X + 12 %" a stored rule rather than a one-off action); an undo window configurable per tenant and backed by a proper `inventory_item_price_history` table instead of the job payload, which would also give a price-change chart per item; margin-aware bulk pricing that reads `inventory_item_stock.avg_cost` and sets a target margin per category; IMP-04's Khatabook and Vyapar mappers reusing the upsert path so a migration can be re-run safely; Google Sheets as a direct source (Future, needs an external connector and an ADR).

---
