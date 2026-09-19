# Part 0 — Canon: Definitions, Decisions and Identifiers

This part is the **normative vocabulary** of the DigiKhaato specification. Every other chapter, every FRD, every API path and every table name must use the identifiers defined here. If a later chapter conflicts with this part, this part wins and the later chapter is a defect to be fixed.

## 0.1 Product identity

| Item | Value |
|---|---|
| Product name | **DigiKhaato** (final product name, `DEC-011`; white-label partners may rename per tenant/partner) |
| One-line definition | A mobile-first, white-label business operating system for Indian small businesses of every type, built around a **party ledger (udhaar/khata)** that is fed by **GST-compliant billing**, **inventory** and **payments** — one book of truth instead of four apps. |
| Vendor | Metis Labs (Metis Labs B.V.) |
| Target market (v1) | India (INR, GST, UPI, WhatsApp, Hindi + English). Architecture keeps tax regime, currency and locale tenant-configurable for later regions. |
| Target customers (v1) | Owner-operated and staffed small businesses of **all types**: retail shops, wholesalers/distributors, traders, service providers, small manufacturers/job-workers, professionals. Business type is chosen at onboarding and only tunes defaults. |
| Delivery model | Multi-tenant SaaS, optionally white-labelled per **Partner** (bank, fintech, distributor, ERP vendor) who resells to their merchant base. |
| Engineering reference | BrandHub Customer Module (`brandhub/BrandHub/apps/frontend/src/modules/Customer`, `app/customer/**`) for frontend organisation, `ml-uikit` design system, list-page/form/dialog patterns; BrandHub Django services for backend conventions; legacy DigiKhaato `customer_ledger` for ledger semantics and fail-closed tenancy primitives. |

**"legacy DigiKhaato".** The product was named **DigiKhaato** by `DEC-011`, replacing the working name *UdhaarBook*. Metis Labs already operates an older money-management application that this specification cites as an engineering reference, and that application is also called DigiKhaato; its udhaar ledger module was itself called UdhaarBook. Throughout this corpus the older application is written **legacy DigiKhaato** and the unqualified name **DigiKhaato** always means the product specified here. The two are different systems and must never be conflated.

## 0.2 Glossary (use these words in code, API and UI copy)

| Term | Definition | Code identifier |
|---|---|---|
| Tenant | One business (shop, firm, practice). Owns all business data. Synonym in UI: "Business". | `Tenant` |
| Partner | A white-label reseller that owns branding defaults, entitlements and support for a set of tenants. Metis Labs itself is the default partner. | `Partner` |
| Member / Membership | A user's role-bearing relationship to a tenant. A user may be a member of several tenants ("multiple businesses"). | `Membership` |
| Party | Any counter-party of the business: customer, supplier, or both. Replaces "customer", "vendor", "borrower" as separate tables. UI shows "Customer"/"Supplier" labels according to flags. | `Party` (`is_customer`, `is_supplier`) |
| Udhaar / Khata / Ledger | The per-party running account. "You gave" (udhaar, debit to party, receivable ↑) and "You got" (jama, credit to party, receivable ↓). | `LedgerEntry` |
| Ledger direction | `debit` = party owes the business more (you gave / sale on credit / opening receivable). `credit` = party owes less (you got / payment received / credit note). For suppliers the same directions apply from the business's point of view (a purchase bill is a **credit** — you owe more; a supplier payment is a **debit**). | `direction ∈ {debit, credit}` |
| Party balance | Σ debit − Σ credit of non-reversed entries. Positive = party owes the business ("You will get"). Negative = the business owes the party ("You will give"). | `Party.balance` (denormalised, recomputable) |
| Item | A product or service the business sells or buys. | `Item` (`item_type ∈ {goods, service}`) |
| Stock movement | Immutable signed quantity change for an item at a location. On-hand = Σ movements. | `StockMovement` |
| Document | Any commercial document with a number, lines and a status: estimate, invoice, credit note, purchase bill, debit note, purchase order, payment receipt. | `SalesDocument`, `PurchaseDocument`, `Payment` |
| Kachha bill / Pakka bill | Informal non-GST bill (Estimate/Quotation or Bill of Supply) vs formal Tax Invoice. | `SalesDocument.kind` |
| Collection date | Date by which a party promised to pay; drives reminder buckets. | `Party.collection_date`, `Reminder.due_on` |
| Reminder | A scheduled or manual nudge to a party to pay, via WhatsApp (manual deep link), SMS (automated, provider-gated) or in-app task. | `Reminder` |
| Business type | Onboarding choice that seeds defaults (inventory on/off, units, document kinds, party labels). Never hard-wires behaviour. | `Tenant.business_type` |
| GST type | `unregistered`, `composition`, `regular`. Drives document kinds and tax rendering. | `Tenant.gst_type` |
| Feature key | Stable string used for entitlement (plan) and permission (role) gating, e.g. `ledger.entries.write`. | `permission codename` |
| Module | A product area toggled per tenant: `ledger`, `inventory`, `sales`, `purchases`, `payments`, `expenses`, `reports`, `team`, `help`, later `loans`. | `ModuleCode` |

Vernacular mapping for UI copy (from research §C.4): "You gave" = उधार दिया / naam; "You got" = जमा / payment received; "Hisaab" = statement; "Baaki" = balance; "Party" is acceptable in Hindi and English.

## 0.3 Module map and phase assignment

| Module code | Name | MVP | Phase 2 | Phase 3 | Future |
|---|---|---|---|---|---|
| `platform` | Auth, tenants, memberships, roles, settings, onboarding, white-label, audit, notifications core | ✅ core | partner domains, custom roles UI | SSO for partners, API keys | multi-org consolidation |
| `parties` | Party master, tags, credit limits | ✅ (tags, limits basic) | party groups/areas, merge, import from contacts | — | — |
| `ledger` | Udhaar entries, opening balance, statement, corrections, reminders, aging | ✅ full parity + | automated SMS/WhatsApp reminders, public "view khata" link, recurring reminders | interest/late-fee (optional), collection routes | — |
| `inventory` | Items, categories, units, opening stock, adjustments, low stock, movement history | ✅ single location | multi-location, transfers, variants, price lists, barcode scan, secondary units | batches/expiry, stock take, serials (opt) | composite items/BOM |
| `sales` | Estimates, tax invoices/bill of supply, credit notes, payments in, print/share | ✅ | sales returns UX, delivery challan, thermal templates, recurring invoices | sales orders, e-invoice (IRN), e-way bill | marketplace/e-commerce sync |
| `purchases` | Purchase bills, supplier payments | ✅ simple | POs, GRN, debit notes/purchase returns, landed cost | — | — |
| `payments` | Record payments (multi-mode), allocation, UPI static/dynamic QR | ✅ | payment aggregator (Razorpay etc.), payment links, webhooks, unmatched queue, reconciliation | bank statement import & matching | bank feeds |
| `expenses` | Expense entries, categories, cashbook view | ✅ lite | recurring expenses, attachments OCR (no) | — | — |
| `reports` | Dashboard, party statement, aging, day book, sales/purchase registers, stock summary, GST summary, CSV/Excel export | ✅ | valuation, item movement, profit summary, staff performance, GSTR-1 JSON | Tally XML export, scheduled reports | BI connector |
| `notifications` | In-app inbox, transactional SMS adapter (config-gated), WhatsApp deep-link share | ✅ | WhatsApp Business API templates (utility), push (PWA) | — | — |
| `import_export` | CSV import parties/items/opening balances; CSV export everywhere | ✅ | Excel templates, bulk edit | migration from Khatabook/Vyapar exports | — |
| `help` | In-app help articles, FAQ, what's new | — | ✅ | tours | — |
| `loans` | Daily-collection loan book (from legacy DigiKhaato) | — | — | ✅ optional module | — |
| `accounting` | Double-entry GL, P&L, balance sheet, bank reconciliation | — | — | — | ✅ |

## 0.4 Technology decisions (normative)

| Area | Decision | ADR |
|---|---|---|
| Frontend framework | Next.js (App Router, same major as BrandHub — 16.x), React 18.3, TypeScript strict | ADR-001 |
| UI foundation | **Tailwind CSS v3.4 + `ml-uikit` (`ML*` primitives)** with app-level `Ub*` wrappers in `src/design-system/` built with the **exact BrandHub Customer design-system component template**. Visual tokens from the **Koper Design System** re-hued to a **Zoho-like blue, light-first theme** (Part 23). No MUI, no CSS-scoping script. | ADR-002 |
| Forms & validation | React Hook Form + **Yup** via `@hookform/resolvers/yup`; central schemas in `src/hooks/useValidationSchemas.ts` (BrandHub pattern: i18n-aware validators such as `mobileValidation()`, `gstinValidation()`, `amountValidation()`); no Formik | ADR-003 |
| Server & client state | **Redux Toolkit exactly as BrandHub Customer**: per-feature `redux/<x>Slice.ts` + `redux/<x>Thunk.ts` (`createAsyncThunk` calling `api/<x>Service.ts`), typed `RootState`/`AppDispatch`, selectors co-located, `snackbarSlice` single toast channel, `whiteLabelSlice`, `sessionSlice`. **TanStack Query is not used** (BrandHub Customer does not use it; one data-layer pattern only). | ADR-004 |
| Tables | TanStack Table v8 inside `UbDataGrid` (port of `BrandHubDataGrid`) | ADR-005 |
| i18n | `react-intl` (BrandHub) with ICU messages; locales `en`, `hi` at MVP; `useTranslation()` wrapper as in BrandHub | ADR-006 |
| HTTP | Axios instance(s) in `src/api/AxiosInstances.ts` with cookie-Bearer interceptor and `handleAxiosError`; endpoint constants in `src/api/APIPaths.ts`; base URL from `src/constants.ts` env-backed `API_BASE_URLS` | ADR-004 |
| Backend | Django 5.2 LTS + Django REST Framework, Python 3.12, **modular monolith** (one project, one app per module) | ADR-007 |
| Database | PostgreSQL 16 in Docker (dev and prod), shared schema, `tenant_id` on every business row, fail-closed scoping; optional RLS in Phase 2 | ADR-008 |
| IDs | UUID (v7, time-ordered) primary keys; human numbers via per-tenant sequences | ADR-009 |
| Money & quantity | `Decimal` end-to-end; DB `numeric(14,2)` money, `numeric(14,3)` quantities, `numeric(14,4)` unit costs; API amounts as **strings** (`"1234.50"`); half-up rounding at line and document level per GST rules | ADR-010 |
| Auth | Mobile number + password (MVP, local use) with OTP verification pluggable through the SMS adapter (console backend prints the code); JWT access (15 min) + rotating refresh (30 d) in httpOnly cookies; SimpleJWT; active tenant in claims | ADR-011 |
| Background jobs | **No Celery/Redis at MVP.** Scheduled work (reminders D-1/D0, low-stock scan, overdue status refresh, export generation) runs as idempotent `manage.py` commands invoked by cron (`crontab` / docker-compose `scheduler` service running `python manage.py run_scheduler`). A `jobs` abstraction (`enqueue(task, payload)`) writes rows to `platform_job` and is executed by the same runner, so Celery can replace the runner later without touching callers. | ADR-012 |
| Files | Local disk `MEDIA_ROOT` via Django storage API (dev and single-server prod); S3-compatible backend is a settings switch only (Phase 2+). Images resized with Pillow. | ADR-013 |
| PDF | **Client-side**: React print components + `window.print()` / browser "Save as PDF" with tenant branding; public share links render the same print view. Server-side PDF (WeasyPrint) deferred to Phase 2 for automated sending. | ADR-014 |
| Messaging | Adapter interfaces only at MVP: SMS `ConsoleSmsBackend` (logs message), WhatsApp deep link (`wa.me`) for sharing; real providers (MSG91/Kaleyra, WhatsApp Cloud API) are Phase 2 adapters | ADR-015 |
| Payments | Manual recording + UPI static/dynamic QR & intent link generated locally (MVP); Payment Aggregator adapter (Razorpay) Phase 2 | ADR-016 |
| API style | REST/JSON, `/api/v1/`, page + cursor pagination, standard envelope, structured error object, idempotency keys on document POSTs | ADR-017 |
| Observability | Django structured JSON logging with `request_id`/`tenant_id` (stdlib `logging`, `django-request-id`-style middleware written in-house), `/system/health`; Sentry/OpenTelemetry/Prometheus are optional Phase 2 settings-gated add-ons | ADR-018 |
| Deployment | docker-compose (`db`, `backend`, `scheduler`, `frontend`) for local and single-VPS; Kubernetes manifests (BrandHub `k8s-files` style) only when a partner needs scale (Phase 3) | ADR-019 |
| Mobile | Responsive web + PWA manifest (installable); offline write queue Phase 2; Capacitor wrappers Phase 3 | ADR-020 |
| Dependency policy | **Minimal third-party libraries.** Frontend allowed at MVP: next, react, react-dom, typescript, tailwindcss, tailwindcss-animate, ml-uikit, class-variance-authority, clsx, tailwind-merge, lucide-react, @reduxjs/toolkit, react-redux, axios, react-hook-form, @hookform/resolvers, yup, @tanstack/react-table, react-intl, dayjs, decimal.js-light, js-cookie, react-dropzone, react-error-boundary; dev: eslint, prettier, jest, @testing-library/*, husky. Backend allowed at MVP: Django, djangorestframework, djangorestframework-simplejwt, psycopg[binary], django-filter, django-cors-headers, Pillow, python-decouple/environs, pytest, pytest-django, black, isort, flake8, factory-boy. **Anything else needs an ADR.** | ADR-021 |

## 0.5 Feature identifier scheme

Every feature has a stable ID: `<MODULE>-<NN>` (e.g. `LED-03`). FRD chapters, task breakdown, acceptance tests and analytics events reference features by this ID. IDs never change; retired features are marked "withdrawn".

Module prefixes: `PLT` platform, `PTY` parties, `LED` ledger, `INV` inventory, `SAL` sales, `PUR` purchases, `PAY` payments, `EXP` expenses, `RPT` reports, `NTF` notifications, `IMP` import/export, `HLP` help, `WLB` white-label, `LON` loans.

## 0.6 Canonical entities (summary; full schema in Part 21)

| Entity | Table | Purpose |
|---|---|---|
| Partner | `platform_partner` | White-label reseller; branding defaults, entitlements, support contact |
| Tenant | `platform_tenant` | Business; profile, GST type, business type, settings JSON, branding |
| User | `platform_user` | Person; mobile (unique), optional email, password hash, locale |
| Membership | `platform_membership` | User × Tenant × Role; status |
| Role / Permission | `platform_role`, `platform_role_permission` | System roles (owner, admin, staff, accountant) + custom roles (P3) |
| Invitation | `platform_invitation` | Pending membership invite (token, expiry) |
| OtpChallenge | `platform_otp_challenge` | OTP send/verify with throttling |
| Device / Session | `platform_session` | Refresh-token family, device label, revocation |
| TenantSetting | `platform_tenant_setting` | Key/value with schema versions (numbering, defaults, feature toggles) |
| DocumentSequence | `platform_document_sequence` | Per tenant × kind × FY numbering |
| AuditLog | `platform_audit_log` | Append-only actor/tenant/entity/before/after |
| Notification | `notifications_notification` | In-app inbox rows |
| MessageLog | `notifications_message_log` | Outbound SMS/WhatsApp/email attempts with provider ids/status |
| Attachment | `files_attachment` | Stored file metadata linked polymorphically |
| Party | `parties_party` | Customer/supplier master with flags, balance, collection date, credit limit |
| PartyTag | `parties_tag`, `parties_party_tag` | Grouping/areas |
| LedgerEntry | `ledger_entry` | Immutable party ledger line; direction, amount, source document link, reversal links |
| Reminder | `ledger_reminder` | Scheduled/manual reminders with channel and status |
| Category, Unit | `inventory_category`, `inventory_unit` | Item masters |
| Item | `inventory_item` | Goods/services with prices, tax, HSN/SAC, stock flags |
| ItemVariant (P2) | `inventory_item_variant` | Size/colour variants sharing an item |
| Location (P2 multi) | `inventory_location` | Store/godown; one default at MVP |
| StockMovement | `inventory_stock_movement` | Immutable signed movement with cost |
| ItemStock | `inventory_item_stock` | Denormalised on-hand & avg cost per item × location |
| StockAdjustment | `inventory_stock_adjustment` | Header for manual adjustments (reason) |
| PriceList (P2) | `inventory_price_list`, `inventory_price_list_item` | Named prices |
| TaxRate | `tax_rate` | GST slab with effective dates; cess |
| SalesDocument / Line | `sales_document`, `sales_document_line` | Estimate, tax invoice, bill of supply, credit note (+ sales order, delivery challan later) |
| PurchaseDocument / Line | `purchases_document`, `purchases_document_line` | Purchase bill, debit note (+ PO, GRN later) |
| Payment | `payments_payment` | Money in/out with mode, reference, party, allocations |
| PaymentAllocation | `payments_allocation` | Payment ↔ document amounts |
| PaymentRequest (P2) | `payments_request` | UPI dynamic request/PA order with status |
| Expense / ExpenseCategory | `expenses_expense`, `expenses_category` | Business expenses |
| Report snapshot (opt) | `reports_snapshot` | Cached heavy report results |
| HelpArticle (P2) | `help_article` | In-app help content |

## 0.7 Canonical statuses

| Entity | Statuses (exact codes) | Notes |
|---|---|---|
| Membership | `invited`, `active`, `suspended`, `removed` | |
| Party | `active`, `archived` | Archive blocked while balance ≠ 0 unless "write off" recorded |
| LedgerEntry | `posted`, `reversed` | Never deleted; a correction posts a reversal and a new entry (`supersedes_id`) |
| Reminder | `scheduled`, `sent`, `failed`, `done`, `dismissed`, `cancelled` | `done` = party paid / user marked |
| Item | `active`, `archived` | Archive blocked while on-hand ≠ 0 (must adjust first) |
| StockMovement | (none; immutable) | Reversal by opposite movement referencing `reverses_id` |
| StockAdjustment | `posted` | Header only |
| SalesDocument (estimate) | `draft`, `sent`, `accepted`, `rejected`, `expired`, `converted` | Estimate → invoice via `converted_to_id` |
| SalesDocument (invoice / bill of supply) | `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `void` | `overdue` is derived (issued/partially_paid and `due_on < today`), stored for filtering by nightly job |
| SalesDocument (credit note) | `draft`, `issued`, `applied`, `void` | `applied` when fully allocated/refunded |
| PurchaseDocument (bill) | `draft`, `recorded`, `partially_paid`, `paid`, `overdue`, `void` | |
| PurchaseDocument (debit note) | `draft`, `issued`, `applied`, `void` | |
| PurchaseOrder (P2) | `draft`, `sent`, `partially_received`, `received`, `closed`, `cancelled` | |
| Payment | `recorded`, `void` | Void posts reversing ledger entries |
| PaymentRequest (P2) | `created`, `pending`, `paid`, `expired`, `failed`, `cancelled`, `unmatched` | |
| Expense | `recorded`, `void` | |
| Invitation | `pending`, `accepted`, `expired`, `revoked` | |
| MessageLog | `queued`, `sent`, `delivered`, `failed`, `skipped` | `skipped` when provider not configured |
| Import job | `uploaded`, `validating`, `ready`, `importing`, `completed`, `failed`, `cancelled` | |

## 0.8 Canonical API surface (paths only; full spec in Part 22)

Base: `https://<host>/api/v1/`. All business endpoints require `Authorization: Bearer` (or cookie) and are tenant-scoped by the token's `tid` claim.

```
POST   /auth/otp/request                 POST /auth/otp/verify        POST /auth/login (password)
POST   /auth/refresh                     POST /auth/logout            GET  /auth/me
POST   /auth/switch-tenant               POST /auth/password/set      POST /auth/password/reset/*

GET    /tenants/current                  PATCH /tenants/current       GET/PUT /tenants/current/settings
GET    /tenants/current/branding         PUT   /tenants/current/branding (multipart logo)
POST   /tenants/current/export           POST /tenants/current/delete-request       POST /tenants/current/delete-cancel
GET    /memberships                      POST /memberships/invite     PATCH/DELETE /memberships/{id}
GET    /roles                            GET  /permissions/me
GET    /audit-logs

GET/POST /parties                        GET/PATCH/DELETE /parties/{id}     POST /parties/{id}/archive|restore
GET    /parties/{id}/statement           GET  /parties/{id}/statement.pdf   POST /parties/{id}/share-links
GET/POST /parties/{id}/ledger-entries    POST /ledger-entries               GET /ledger-entries/{id}
POST   /ledger-entries/{id}/reverse      POST /ledger-entries/{id}/correct
GET/POST /reminders                      PATCH /reminders/{id}              POST /reminders/{id}/send
GET    /ledger/summary                   GET  /ledger/aging

GET/POST /items                          GET/PATCH/DELETE /items/{id}       POST /items/{id}/archive|restore
GET/POST /categories   GET/POST /units   GET /items/{id}/movements
POST   /stock-adjustments                GET  /stock-adjustments/{id}
GET    /stock/summary                    GET  /stock/low
GET/POST /locations (P2)                 POST /stock-transfers (P2)         GET/POST /price-lists (P2)

GET/POST /sales/estimates                GET/PATCH /sales/estimates/{id}    POST /sales/estimates/{id}/convert
GET/POST /sales/invoices                 GET/PATCH /sales/invoices/{id}     POST /sales/invoices/{id}/issue|void
GET    /sales/invoices/{id}.pdf          POST /sales/invoices/{id}/share-links      GET /sales/invoices/{id}/upi-intent
GET/POST /sales/credit-notes             POST /sales/credit-notes/{id}/issue|void|apply
GET/POST /purchases/bills                POST /purchases/bills/{id}/record|void
GET/POST /purchases/debit-notes (P2)     GET/POST /purchases/orders (P2)    POST /purchases/orders/{id}/receive (P2)

GET/POST /payments                       GET /payments/{id}                 POST /payments/{id}/void
POST   /payments/upi-intent              GET  /payments/qr.svg
GET/POST /payment-requests (P2)          GET  /payment-requests/{id} (P2)           POST /webhooks/payments/{provider} (P2)
GET    /payments/unmatched (P2)          POST /payments/unmatched/{id}/match (P2)

GET/POST /expenses                       GET/POST /expense-categories       POST /expenses/{id}/void

GET    /reports/dashboard                GET /reports/day-book              GET /reports/sales-register
GET    /reports/purchase-register        GET /reports/stock-summary         GET /reports/gst-summary
GET    /reports/receivables-aging        GET /reports/payables-aging        GET /reports/{name}.csv|.xlsx

GET    /notifications                    POST /notifications/{id}/read      POST /notifications/read-all
GET    /notifications/unread-count
POST   /imports (multipart)              GET  /imports/{id}                 POST /imports/{id}/commit
POST   /imports/{id}/cancel              GET  /imports/templates/{kind}.csv
GET    /taxes/rates                      GET  /taxes/hsn?q=
GET    /help/articles (P2)               GET  /system/health                GET /system/version
```

## 0.9 Canonical permission codenames

Format `<module>.<resource>.<action>`; actions ∈ `read | write | delete | approve | export | manage`.

```
platform.tenant.manage       platform.members.manage      platform.branding.manage    platform.audit.read
parties.party.read/write/delete/export
ledger.entry.read/write      ledger.entry.correct         ledger.reminder.write       ledger.statement.export
inventory.item.read/write/delete   inventory.stock.adjust   inventory.stock.read   inventory.location.manage
sales.estimate.read/write    sales.invoice.read/write     sales.invoice.void          sales.credit_note.write
purchases.bill.read/write    purchases.bill.void          purchases.order.write
payments.payment.read/write  payments.payment.void        payments.request.write
expenses.expense.read/write  expenses.expense.void
reports.basic.read           reports.financial.read       reports.export
notifications.settings.manage
```

System roles (MVP):

| Role | Summary | Notable exclusions |
|---|---|---|
| `owner` | Everything; cannot be removed; one or more per tenant | — |
| `admin` | Everything except tenant deletion, ownership transfer, billing | `platform.tenant.manage` (partial) |
| `staff` | Day-to-day: parties read/write, ledger entries write (no correct), invoices/estimates write (no void), payments write (no void), stock adjust off by default, reports basic | `*.void`, `ledger.entry.correct`, `reports.financial.read`, `platform.*` |
| `accountant` | Read everything, export everything, no writes except notes | all `write` |

## 0.10 Naming conventions (cross-cutting)

- Frontend mirrors `brandhub/apps/frontend` **exactly**: `app/**` thin route files (`page.tsx` = Suspense wrapper + `<XPageContent/>` from the feature); `src/modules/DigiKhaato/features/<feature>/{api,components,hooks,redux,types,constants,view-model,validation}`; `src/modules/DigiKhaato/design-system/Ub*/` with barrel `index.ts`; `src/modules/DigiKhaato/components/layout/` (shell, sidebar, header, bottom nav); `src/api/AxiosInstances.ts`, `src/api/APIPaths.ts`, `src/constants.ts`; `src/redux/store.ts` + `src/redux/slice/*` for cross-feature slices (`snackbarSlice`, `whiteLabelSlice`, `sessionSlice`); `src/hooks/useValidationSchemas.ts`, `src/hooks/useTranslation.ts`; `src/utils/*` (cn, money, dates, cookies, format); `locales/en.json`, `locales/hi.json`. File naming: components `PascalCase.tsx`; hooks `useX.ts`; services `<resource>Service.ts`; slices `<x>Slice.ts`; thunks `<x>Thunk.ts`; types `<x>.types.ts`; view-model helpers `<x>Display.ts`/`<x>Actions.ts`.
- Backend: Django apps named by module code (`platform`, `parties`, `ledger`, `inventory`, `sales`, `purchases`, `payments`, `expenses`, `reports`, `notifications`, `files`, `imports`, `tax`); models `PascalCase`; tables `<app>_<snake>`; services in `services/`; selectors in `selectors.py`.
- API JSON: `snake_case` keys; frontend maps to `camelCase` at the service boundary (BrandHub pattern).
- Dates: ISO-8601; business dates as `YYYY-MM-DD`; timestamps UTC with `Z`; tenant timezone `Asia/Kolkata` default.
- Money: strings with 2 decimals; quantities strings with up to 3 decimals; percentages numbers.

## 0.11 Non-negotiable engineering rules

1. Ledger entries and stock movements are **immutable**; corrections are reversals plus new rows.
2. Every business table has `tenant_id`; every queryset goes through the tenant-scoped manager; cross-tenant IDs return 404, never 403.
3. Money maths is `Decimal` only; totals are computed server-side; the client's totals are previews.
4. Every state-changing endpoint is wrapped in `transaction.atomic()` and writes an `AuditLog` row through the service layer.
5. Every POST that creates a document or payment accepts an `Idempotency-Key`.
6. No feature ships without: FRD acceptance criteria met, tests, permission checks, loading/empty/error states, i18n keys in `en` and `hi`.
7. Reuse `ML*` primitives; extend via `Ub*` wrappers only when the pattern recurs in ≥2 features.

## 0.12 Normative-table ownership

The corpus's most expensive failure mode is not a missing table. It is the same normative table written twice, in two chapters, with different content — because an implementer who meets two authoritative answers does not stop and ask; the implementer picks one, silently, and the choice is discovered weeks later in a defect that looks like a bug and is actually a specification conflict. Ten such pairs were found by the Part 42 review.

The rule that closes it has three parts, and all three are normative.

1. **Every normative table in this corpus has exactly one owning chapter and section.** The owner is the only place where the table's content may be stated. Adding a row, changing a value or retiring an entry is an edit to the owner and to nothing else.
2. **Every other mention is a cross-reference, not a copy.** A chapter that needs the table names it and points at it. A chapter that needs three of its rows names the three rows in prose and points at it. A chapter may not reproduce it, "for convenience" or otherwise.
3. **A table not in the index below is not normative.** Illustrative tables, worked examples, comparison tables in the research chapters and summary tables in Part 1 are outside this rule and outside the CI check, and they are outside it precisely because nothing may be built from them.

Where a chapter legitimately needs a *different view* of the same underlying set — an index of paths against the contracts for those paths, an entity list against the columns of those entities — the two are not duplicates and are not banned. They are a **paired** table, they share a key column, and CI reconciles them on that key rather than forbidding the second one.

### 0.12.1 The two classes

| Class | Shape | Rule | What CI does |
|---|---|---|---|
| **A — single copy** | One table, one place | The fingerprint header row may appear in the owning file and nowhere else | Fails the build on a second occurrence |
| **B — paired views** | An index in one chapter, the detail in another, sharing a key column | Both are normative for their own columns; neither may carry the other's | Fails the build when the key sets differ (or, where declared `⊆`, when the subset is violated) |

A copy that genuinely must exist — a generated appendix, a printable extract — is legal only when it is marked in the source as an extract and is byte-identical to the owner's table:

```markdown
<!-- extract-of: T-07 -->
| Entity | Statuses (exact codes) | Notes |
```

CI then compares the extract against the owner and fails on any drift, which converts a copy from a hazard into a build artefact.

### 0.12.2 The index

`Owner` is where the content lives. `Fingerprint` is the table's header row as a semicolon-separated cell list, which is what CI matches on; `—` means the entry is a specification rather than a single table and is enforced by review rather than by the header check. `Key` is the reconciliation column for Class B.

| ID | Table | Owner | Class | Key | Fingerprint | Must cross-reference, never copy |
|---|---|---|---|---|---|---|
| T-01 | Product identity | Part 0 §0.1 | A | — | Item; Value | Parts 1, 18 §18.1 |
| T-02 | Glossary | Part 0 §0.2 | A | — | Term; Definition; Code identifier | Parts 10, 18, 25, 26, all FRDs |
| T-03 | Module map and phase assignment | Part 0 §0.3 | A | — | Module code; Name; MVP; Phase 2; Phase 3; Future | Parts 11, 12 §12.2, 13 §13.2–§13.5, 16 |
| T-04 | Technology decisions | Part 0 §0.4 | A | — | Area; Decision; ADR | Part 38 (rationale only), Parts 19 §19.1, 20 §20.1 |
| T-05 | Dependency allow-list (runtime and tooling) | Part 0 §0.4, ADR-021 row | A | — | — | Part 38 ADR-021, Parts 25 §25.13, 26 §26.15, 28, 33 `TSK-CHS-CI-03…05` |
| T-06 | Feature-ID prefixes | Part 0 §0.5 | A | — | — | Parts 16, 31 §31.4, 33 |
| T-07 | Canonical entity ↔ table index | Part 0 §0.6 | B | table name | Entity; Table; Purpose | Detail owner is T-08 |
| T-08 | Table and column definitions | Part 21 §21.3 | B | table name | — | Parts 20, 22, all FRDs §15 |
| T-09 | Status enumerations per entity | Part 0 §0.7 | A | — | Entity; Statuses (exact codes); Notes | Parts 21, 22, 26 R3.4, all FRDs §9 |
| T-10 | API path inventory | Part 0 §0.8 | B | method + path | — | Contract owner is T-11 |
| T-11 | Per-endpoint API contract | Part 22 §22.2–§22.12 | B | method + path | — | Parts 19 §19.4, 20 §20.7, all FRDs §14 |
| T-12 | Permission codenames | Part 0 §0.9 | A | — | — | Parts 20 §20.5.5, 24 §24.6.2, 27, 28 §28.2.2, all FRDs §11 |
| T-13 | System roles and their exclusions | Part 0 §0.9 | A | — | Role; Summary; Notable exclusions | Parts 17-01 `PLT-05`, 20 §20.5.5, 28 §28.2.2 |
| T-14 | Naming conventions | Part 0 §0.10 | A | — | — | Parts 19 §19.2, 20 §20.2, 25 §25.2, 26 §26.2 |
| T-15 | Non-negotiable engineering rules | Part 0 §0.11 | A | — | — | Parts 34, 35 §35.2 |
| T-16 | Error-code registry | Part 22 §22.1.1 | A | — | Code; HTTP; Envelope; Raised when; English message; `hi` key; Retryable | Parts 19 §19.4.4, 20, 26 §26.10, 28 §28.3.6, all FRDs §13 |
| T-17 | API conventions (pagination, filtering, idempotency, rate limits, headers) | Part 22 §22.1 | A | — | Topic; Standard | Parts 19 §19.4, 20 §20.6.5, 27 §27.6 |
| T-18 | Job-type registry | Part 20 §20.8.4 | A | — | — | Parts 29 §29.3.2, 30 §30.6 |
| T-19 | Scheduler concurrency model | Part 20 §20.8.6 | A | — | — | Part 29 §29.3.3 |
| T-20 | Query budgets | Part 20 §20.14.1 | A | — | — | Part 28 §28.3.10 |
| T-21 | Lock order | Part 20 §20.11.2 | A | — | — | FRDs `SAL-02`, `PUR-04`, `INV-06` |
| T-22 | Constraint inventory (which invariant each constraint defends) | Part 20 §20.11.4 | B | constraint name | — | Definitions live in T-08 |
| T-23 | Index and performance strategy | Part 21 §21.4 | A | — | — | Part 20 §20.14 |
| T-24 | Audit requirements per entity | Part 21 §21.7 | A | — | — | Parts 27 §27.9, 30 §30.5 |
| T-25 | Tax-rate codes and slabs | Part 21 §21.3.5 | A | — | Column; Type; Meaning | Parts 20 tax service, 28 §28.10, FRD 17-04 |
| T-26 | GST tax fixture file | Part 28 §28.10 | A | — | — | Part 19 §19.2.4 |
| T-27 | Well-known tenant-setting keys | Part 21 §21.3.1 | A | — | — | Parts 17-01 `PLT-06`, 20 §20.13 |
| T-28 | Environment-variable catalogue | Part 29 §29.2.4 | A | — | — | Parts 19 §19.14.1 (`NEXT_PUBLIC_*` subset, ⊆), 20 §20.13.2, 28 §28.3.9 |
| T-29 | Compose service topology | Part 29 §29.2.1 | B | service name | — | Canon §0.4 ADR-019 names the core services; Part 29 may add environment-scoped services and may not rename or drop a core one |
| T-30 | Migration execution position | Part 29 §29.5.2 | A | — | — | Part 20 §20.13.5 |
| T-31 | Backup and restore procedure | Part 29 §29.5.1 | A | — | — | Parts 30 §30.10, 36 |
| T-32 | Release steps and rollback | Part 29 §29.6.2–§29.6.4 | A | — | — | Parts 28 §28.11, 35 §35.4 |
| T-33 | Analytics event catalogue | Part 31 §31.4 | A | — | Event; When; Properties; Feature | Parts 19 §19.12.5, 28, all FRDs §20 |
| T-34 | Event naming and common property set | Part 31 §31.5 | A | — | — | Part 19 §19.12.5 |
| T-35 | Log-event catalogue | Part 30 §30.3 | A | — | — | Parts 26 §26.12, 29 |
| T-36 | Alerting rules | Part 30 §30.10 | A | — | — | Parts 29 §29.8, 36 |
| T-37 | Design tokens — spacing, radius, layout | Part 23 §23.2.1 | A | — | — | Parts 19 §19.8.3, 24 §24.4, 25 R-S-2 |
| T-38 | Design tokens — typography | Part 23 §23.2.2 | A | — | — | Parts 19 §19.8.3, 24 §24.4 |
| T-39 | Design tokens — elevation and motion | Part 23 §23.2.3 | A | — | — | Part 19 §19.8.3 |
| T-40 | Design tokens — colour | Part 23 §23.2.4 | A | — | — | Parts 19 §19.8.3, 24 §24.4 |
| T-41 | Overridable token subset | Part 24 §24.4.2 | B ⊆ | token name | — | Must be a subset of T-37…T-40 |
| T-42 | Component decision matrix | Part 23 §23.3 | A | — | — | Parts 19 §19.8, 25 R-C-2 |
| T-43 | `Ub*` component inventory | Part 23 §23.7 | A | — | — | Part 19 §19.2.5 |
| T-44 | Interaction states | Part 23 §23.5 | A | — | — | Parts 25, 28 §28.4.5 |
| T-45 | Bundle budgets | Part 19 §19.9.2 | A | — | — | Part 28 §28.9.1 |
| T-46 | Performance budgets | Part 18 §18.8.1 | A | — | — | Parts 1 §1.11, 19 §19.9.1, 28 §28.9.1, 35 |
| T-47 | Coverage floors | Part 28 §28.7 | A | — | — | Parts 12 §12.5, 18 NFR-45, 19 §19.14.6, 35 |
| T-48 | Test-ID convention and traceability | Part 28 §28.6.1–§28.6.2 | A | — | — | Parts 33, 35 §35.3.1 |
| T-49 | Definition of done | Part 35 | A | — | — | Canon §0.11 rule 6, Parts 12 §12.8, 25 §25.18, 26 §26.20, 28 §28.6.3 |
| T-50 | Device matrix | Part 28 §28.8.1 | A | — | — | Parts 18 §18.8.3, 19 §19.9 |
| T-51 | Feature catalogue | Part 16 | B | feature ID | — | Parts 12 §12.2, 13 §13.2–§13.5, 32, 33 |
| T-52 | Phase feature totals | Part 16 §16.15 | A | — | — | Parts 1 §1.11, 12 §12.1, 13 §13.2, 18 §18.6 |
| T-53 | Cut-line list and its order | Part 12 §12.7 | A | — | — | Parts 13 §13.2, 32 §32.1.5, 35 §35.3.4 |
| T-54 | Launch-readiness checklist | Part 12 §12.8 | A | — | — | Parts 13 §13.2, 35 §35.6 |
| T-55 | Plan and entitlement matrix | Part 24 §24.9.1 | A | — | Plan; Modules; `max_users`; `max_parties`; `max_invoices_per_month`; `storage_mb` | Parts 11 §11.2, 17-01 `PLT-15`, 18 §18.12 |
| T-56 | Partner-scoped permission set | Part 24 §24.6.2 | B ⊆ | codename | — | Must be a subset of T-12 |
| T-57 | Sprint capacity and velocity derivation | Part 32 §32.1.3 | A | — | Step; Figure; Reasoning | Parts 13 §13.2, 33 §33.8.3 |
| T-58 | Task points and the bottom-up estimate | Part 33 §33.9 | A | — | — | Parts 13 §13.2, 32 §32.2 |
| T-59 | Architecture decision records | Part 38 | A | — | — | Canon §0.4 cites ADR numbers only |
| T-60 | Open-questions register | Part 37 | A | — | ID; Question; Type; Decider; Deadline; Blast radius | Part 18 §18.15 is an extract |
| T-61 | Product decision log | Part 39 | A | — | — | Parts 12 §12.7, 13 §13.8, 18 §18.1 |
| T-62 | Risk register | Part 36 | A | — | — | Part 18 §18.14 |
| T-63 | Consolidated change-request register (frozen at hand-over) | Part 43 | A | — | — | Live successor is T-65 |
| T-64 | Implementation decision log | `docs/DECISIONS.md` | A | — | — | Parts 37, 38, 39 |
| T-65 | Change-request log (live) | `docs/CR-LOG.md` | A | — | — | Part 43 |

### 0.12.3 What a cross-reference looks like

The required form names the owner and states nothing the owner states:

> Job names and schedules are defined in Part 20 §20.8.4. This chapter specifies how the runner invokes them and nothing about which jobs exist.

The forbidden form is any of: a table with the owner's columns; a bulleted restatement of the owner's rows; "for reference, the current values are…"; and a footnote giving one row's value. The last is the most common and the most dangerous, because it is the one that is never updated.

### 0.12.4 Changing an owned table

A change to an owned table is a change to the specification, not an edit. The sequence is fixed:

1. Raise it in `docs/CR-LOG.md` against the owning chapter, with the reason and the consumers affected (the index's last column lists them).
2. The owning chapter's author edits the owner. Nobody else edits the owner, and the author edits nothing else.
3. Every consumer named in the last column is re-read for a stale cross-reference, in the same change.
4. CI runs `scripts/check_table_ownership.py`, which must pass before merge.
5. The corpus version is bumped per `docs/CR-LOG.md` §4.

A new normative table is created by adding its row to §0.12.2 **in the same commit** that creates the table. A table with no row in this index is, by rule 3 above, not normative, and CI will not defend it.

### 0.12.5 The CI check

`scripts/check_table_ownership.py`, run in the `check` stage of the pipeline (Part 28 §28.11.1) and by `make ci`. Standard library only, per ADR-021. It parses this index out of this chapter, so the index is the configuration and there is no second list to keep in step.

```python
#!/usr/bin/env python3
"""Enforce Part 0 §0.12: one owner per normative table.

Checks, in order:
  1. DUPLICATE  a Class A fingerprint header row outside its owning file
  2. DRIFT      an `<!-- extract-of: T-nn -->` copy that differs from the owner
  3. PAIRED     Class B key sets that disagree (T-07/T-08, T-10/T-11)
  4. ORPHAN     an error code used with an HTTP status but absent from T-16

Exit 0 clean, 1 on any finding. No third-party imports (ADR-021).
"""
from __future__ import annotations

import pathlib
import re
import sys

DOCS = pathlib.Path(__file__).resolve().parent.parent / "docs"
CANON = DOCS / "00-canon.md"
INDEX_HEADING = "### 0.12.2"

# Chapter number -> file, derived from the filenames themselves.
FILES = sorted(DOCS.glob("*.md"))


def cells(line: str) -> list[str]:
    """Normalised cell list of a markdown table row."""
    if not line.lstrip().startswith("|"):
        return []
    raw = line.strip().strip("|").split("|")
    out = []
    for c in raw:
        c = c.strip()
        c = re.sub(r"[`*_]", "", c)
        out.append(c.lower())
    return out


def section(path: pathlib.Path, heading: str) -> list[str]:
    """Lines of one section, heading exclusive, up to the next heading of equal or higher level."""
    lines = path.read_text(encoding="utf-8").splitlines()
    level = len(heading.split(" ")[0])  # unused marker length; headings are '### 0.12.2'
    out, inside = [], False
    for ln in lines:
        if ln.startswith(heading):
            inside = True
            continue
        if inside and re.match(r"^#{2,3} ", ln):
            break
        if inside:
            out.append(ln)
    return out


def parse_index() -> list[dict]:
    rows = []
    for ln in section(CANON, INDEX_HEADING):
        c = cells(ln)
        if len(c) != 7 or c[0] in ("id", "---") or set(c[0]) <= {"-", ":"}:
            continue
        if not re.match(r"^t-\d+$", c[0]):
            continue
        rows.append(
            {
                "id": c[0].upper(),
                "table": c[1],
                "owner": c[2],
                "cls": c[3],
                "key": c[4],
                "fingerprint": [p.strip() for p in c[5].split(";")] if c[5] != "—" else [],
            }
        )
    return rows


def owner_file(owner: str) -> pathlib.Path | None:
    """'part 22 §22.1.1' -> docs/22-*.md ; a literal docs/ path is taken as given."""
    m = re.search(r"docs/([\w.\-]+\.md)", owner)
    if m:
        return DOCS / m.group(1)
    m = re.search(r"part (\d+)(?:-(\d+))?", owner)
    if not m:
        return None
    stem = m.group(1).zfill(2) + (f"-{m.group(2)}" if m.group(2) else "")
    hits = [p for p in FILES if p.name.startswith(stem + "-")]
    return hits[0] if hits else None


def iter_lines(path: pathlib.Path):
    """Yield (lineno, text) outside fenced code blocks."""
    fenced = False
    for i, ln in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if ln.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if not fenced:
            yield i, ln


def check_duplicates(index) -> list[str]:
    findings = []
    for row in index:
        if row["cls"] != "a" or not row["fingerprint"]:
            continue
        own = owner_file(row["owner"])
        if own is None:
            findings.append(f"{row['id']}: owner '{row['owner']}' does not resolve to a file")
            continue
        for path in FILES:
            prev = ""
            for no, ln in iter_lines(path):
                if cells(ln) == row["fingerprint"]:
                    if path == own:
                        prev = ln
                        continue
                    if f"extract-of: {row['id'].lower()}" in prev.lower():
                        prev = ln
                        continue
                    findings.append(
                        f"{row['id']} DUPLICATE  {path.name}:{no} carries the header of "
                        f"'{row['table']}', owned by {row['owner']}. Replace it with a cross-reference "
                        f"(Part 0 §0.12.3)."
                    )
                prev = ln
    return findings


def table_after(path: pathlib.Path, fingerprint: list[str]) -> list[list[str]]:
    rows, taking = [], False
    for _, ln in iter_lines(path):
        c = cells(ln)
        if c == fingerprint:
            taking = True
            continue
        if taking:
            if not c:
                break
            if set("".join(c)) <= {"-", ":", " "}:
                continue
            rows.append(c)
    return rows


def check_extracts(index) -> list[str]:
    findings = []
    by_id = {r["id"]: r for r in index}
    for path in FILES:
        prev = ""
        for no, ln in iter_lines(path):
            m = re.search(r"extract-of:\s*(T-\d+)", prev, re.I)
            if m and cells(ln):
                row = by_id.get(m.group(1).upper())
                if row is None:
                    findings.append(f"{path.name}:{no} extract-of names unknown table {m.group(1)}")
                else:
                    own = owner_file(row["owner"])
                    if own and table_after(own, row["fingerprint"]) != table_after(path, row["fingerprint"]):
                        findings.append(
                            f"{row['id']} DRIFT  {path.name}:{no} is declared an extract of "
                            f"{row['owner']} and differs from it."
                        )
            prev = ln
    return findings


PATH_RE = re.compile(r"\b(GET|POST|PATCH|PUT|DELETE)\s+`?(/[a-z0-9{}/.\-]+)")


def check_paths() -> list[str]:
    """T-10 / T-11: every path in Part 22's headings is in canon §0.8 and vice versa."""
    canon_paths = set()
    for ln in section(CANON, "## 0.8"):
        for p in re.findall(r"(?<![\w`])(/[a-z][a-z0-9{}*/.\-]*(?:\|[a-z\-]+)*)", ln):
            head, _, alts = p.rstrip(".").partition("|")
            canon_paths.add(head)
            base = head.rsplit("/", 1)[0]
            for alt in alts.split("|"):
                if alt:
                    canon_paths.add(f"{base}/{alt}")
    api = next((p for p in FILES if p.name.startswith("22-")), None)
    if api is None:
        return ["T-11: Part 22 not found"]
    spec_paths = set()
    for _, ln in iter_lines(api):
        if ln.startswith("###") or ln.startswith("- `"):
            for meth, p in PATH_RE.findall(ln):
                spec_paths.add(p.rstrip("."))
    def norm(p: str) -> list[str]:
        return [re.sub(r"\{[^}]*\}", "*", s) for s in p.strip("/").split("/")]

    canon_norm = [norm(p) for p in canon_paths]

    def covered(p: str) -> bool:
        got = norm(p)
        for want in canon_norm:
            if len(want) != len(got):
                continue
            if all(w == "*" or w == g or g == "*" for w, g in zip(want, got)):
                return True
        return False

    missing = sorted(p for p in spec_paths if not covered(p))
    return [
        f"T-10 PAIRED  {p} has a contract in Part 22 and no row in canon §0.8" for p in missing
    ]


def check_tables() -> list[str]:
    """T-07 / T-08: every table named in canon §0.6 is defined in Part 21 §21.3."""
    canon_tables = set()
    for ln in section(CANON, "## 0.6"):
        for t in re.findall(r"`([a-z][a-z0-9_]+)`", ln):
            if "_" in t:
                canon_tables.add(t)
    db = next((p for p in FILES if p.name.startswith("21-")), None)
    if db is None:
        return ["T-08: Part 21 not found"]
    defined = set(re.findall(r"\*\*`([a-z][a-z0-9_]+)`\*\*", db.read_text(encoding="utf-8")))
    return [
        f"T-07 PAIRED  `{t}` is in canon §0.6 and is not defined in Part 21 §21.3"
        for t in sorted(canon_tables - defined)
    ]


CODE_NEAR_STATUS = re.compile(
    r"\b(?:400|401|403|404|409|410|412|422|429|500|503)\b[^`\n]{0,24}`([a-z][a-z0-9_]{3,40})`"
)


def check_error_codes(index) -> list[str]:
    row = next((r for r in index if r["id"] == "T-16"), None)
    if row is None:
        return ["T-16: not in the index"]
    own = owner_file(row["owner"])
    registered = {c[0] for c in table_after(own, row["fingerprint"])} if own else set()
    if own:  # every registry row is `| `code` | <status> | …`
        registered |= set(
            re.findall(r"^\| `([a-z][a-z0-9_]+)` \| \d{3} \|", own.read_text(encoding="utf-8"), re.M)
        )
    findings = []
    for path in FILES:
        if path.name[:2] in {"41", "42", "43"}:  # review chapters quote codes as evidence
            continue
        for no, ln in iter_lines(path):
            if path == own and ln.lstrip().startswith("|"):
                continue  # the registry's own rows, whose `details` keys are not codes
            for code in CODE_NEAR_STATUS.findall(ln):
                if code not in registered and code not in FIELD_WORDS:
                    findings.append(
                        f"T-16 ORPHAN  {path.name}:{no} uses `{code}` with an HTTP status and it is "
                        f"not in the registry at {row['owner']}."
                    )
    return sorted(set(findings))


# Words that look like codes and are field names, statuses or parameters.
FIELD_WORDS = set()
FIELD_WORD_FILE = DOCS.parent / "scripts" / "not_error_codes.txt"
if FIELD_WORD_FILE.exists():
    FIELD_WORDS = {w.strip() for w in FIELD_WORD_FILE.read_text().split() if w.strip()}


def main() -> int:
    index = parse_index()
    if len(index) < 40:
        print(f"check_table_ownership: parsed only {len(index)} index rows; canon §0.12.2 is malformed")
        return 1
    findings = (
        check_duplicates(index)
        + check_extracts(index)
        + check_paths()
        + check_tables()
        + check_error_codes(index)
    )
    for f in findings:
        print(f)
    print(f"\n{len(index)} owned tables checked, {len(findings)} finding(s).")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
```

Two notes on the check, both deliberate.

**It matches header rows, not content.** A chapter that restates one row of an owned table in prose is not caught by this script and is caught by review; the script's job is the failure mode that review misses, which is a second full table that looks authoritative. The review checklist item is one line: *does this chapter state anything the index says it does not own?*

**`ORPHAN` is the check that closes the error-code contract.** Part 28 §28.3.6 asserts that the set of codes the application can emit equals the documented set; that assertion is made against running code. This check makes the same assertion against the corpus, which is where the divergence starts. `scripts/not_error_codes.txt` holds the field names and status values that the regular expression cannot distinguish from codes; adding a word to it is a reviewed change, and adding a *code* to it instead of to Part 22 §22.1.1 is the specific defect the file exists to make visible.
