# What is live today: the capability inventory

Status: **Phase 1, 29 Sep 2026** (CR-2026-09-29-PLATFORM-B). Grouped by the module map in
[00-platform-vision.md](00-platform-vision.md) §2.

This is the **source of truth for what the landing page may claim as available.** A capability is
listed here only if all three exist in the code today:

- a backend endpoint under `backend/apps/<app>/urls.py`;
- a screen under `frontend/app/(app)/…`, with its `ROUTES` constant;
- a `ready: true` navigation entry, or a control on a ready screen.

If a line is not here, the landing page does not say it. If code changes a line, change it here in
the same commit.

How it was compiled: from `backend/apps/*/urls.py`, `frontend/src/routes.ts`, the page tree
under `frontend/app/`, `features/navigation/sidebarConfig.ts` and each feature's `components/`,
read at commit 15ffe67.

---

## Core (every tenant)

### Platform: sign-in, business, settings (`platform_app`, `platform`)

| Capability | Where |
|---|---|
| Sign up and log in with email and password (DEC-010: no OTP). Log out, and token refresh. | `/signup`, `/login`; `POST /auth/register`, `/auth/login` |
| Set up a business in a four-step wizard: name, type, state, GSTIN (optional). | `/onboarding/step/[n]` |
| One login can belong to several businesses, and switch between them. | `/switch`; `POST /auth/switch-tenant` |
| Business profile: name, address, GSTIN, contact details. | `/settings/profile` |
| Branding: logo, signature, colour, all used on the business's own documents. | `/settings/branding`; `files/<id>` |
| Signed-in devices: list, rename, sign out one device. | `/settings/devices`; `/auth/sessions` |
| Activity (audit) log, filtered by who and what. | `/settings/activity`; `/audit-logs` |
| Your data: export everything, request deletion (with cancel), and allow a support session. | `/settings/data`; `/tenants/current/export`, `/deletion` |
| Plan and usage page, with limit banners. There is no billing and nothing is charged. | `/settings/plan` |
| Light and dark theme; the choice persists. | the app bar; the `ub_theme_choice` cookie |
| Hindi and English on every screen; switch at any time. | locale cookie; `locales/catalogues/*` |
| Module switches per business (`enabled_modules` + `MODULE_DEPENDENCIES`). | `/settings`; `tenants/current/settings` |
| Operator console for the product team (not a merchant feature). Its support sessions are view only. | `/admin/*` |

A password-reset screen exists (`/forgot-password`, `/reset-password`), but **no email is
delivered** (DEC-012, console backend). The landing page must not offer reset by email.

### Team and roles (`team`)

| Capability | Where |
|---|---|
| Owner adds a member by creating the account. The server shows a temporary password once, and the owner sends it by hand (DEC-012). | `/settings/team`; `/members` |
| Invite links the owner copies and shares; the member accepts at `/accept-invite/[token]`. | `/invitations` |
| Four roles: owner, admin, staff, accountant, with per-permission checks. | `permissions_registry.py` |

### People and contacts (`parties`)

| Capability | Where |
|---|---|
| Customers and suppliers: create, edit, archive and restore (blocked while a balance is not zero), bulk archive. | `/parties`, `/parties/[id]` |
| Search, plus filters by type, balance, status, collection and tag; the filters are kept in the URL. | `/parties?…` |
| Tags: manage, merge, bulk assign, and filter by tag. | `/parties/tags` |
| Credit limit per party, enforced when an entry is saved; near-limit and over-limit lists. | party form; `/parties` chips |
| Promise-to-pay date on a party. | `/parties/[id]` |
| Opening balance, posted as a ledger entry. | party form |

### Money in and out, and balances (`ledger`)

| Capability | Where |
|---|---|
| You gave and You got entries, with a note and a date (backdating allowed). The running balance moves inside one transaction. | `/parties/[id]`; `/ledger-entries` |
| Corrections: reverse or correct an entry. The mistake stays visible; nothing is deleted. | ⋯ on each timeline row |
| Write-off of a small residual balance. | `/parties/[id]` |
| Statement for any period: running balance, opening, corrections toggle, CSV export, and print or save as PDF. | `/parties/[id]/statement` |
| Receivable and payable aging buckets. | `/ledger/aging` |

### Reminders (`ledger` reminders, `notifications`)

| Capability | Where |
|---|---|
| Reminder list of who is due, with buckets. | `/ledger/reminders` |
| A reminder text with the exact amount, which the merchant sends through WhatsApp or SMS on their own phone (`wa.me` / `sms:` links). **The product sends nothing** (DEC-012). | `UbShareSheet`; `reminders/<id>/send` records it |
| Bulk reminders (one tap each, prepared in a batch), reminder history, and reminder settings. | `/ledger/reminders` |
| In-app notifications: the bell, unread count, mark read. | app bar; `/notifications` |

### Payments (`payments`)

| Capability | Where |
|---|---|
| Record a payment received or made, in several modes (cash, UPI, bank, cheque, card, other), allocated against bills. | `/payments`; `POST /payments` |
| Receipt page, printable as an A5 PDF and shareable. | `/payments/[id]` |
| Void a payment, with a reason. | `/payments/[id]` |
| UPI QR code and UPI intent to collect a payment, generated locally. No gateway: the money never passes through the product. | `CollectQrSheet`; `payments/qr.svg` |

### Documents and share links (print pipeline, `files`, `sales` share)

| Capability | Where |
|---|---|
| Print or save as PDF (`window.print()`): tax invoice (A4 or 80 mm), estimate, credit note, receipt (A5), statement. Every document carries the business's name and logo, never the product's. | each detail page |
| Share link for a sales document: one live link per document, reset on demand. The customer opens it at `/d/<token>` with no account. | invoice, estimate or credit-note detail |
| Share on WhatsApp: a prepared message the merchant sends. | `UbShareSheet` |
| Attachments: the logo and signature images, with magic-byte checks. | `files/<id>` |

**Not live:** share links for statements (`parties_share_link`, PTY-09) and attachments on
entries or bills.

### Reports (`reports`)

| Capability | Where |
|---|---|
| Dashboard: to collect, to pay, overdue, today's sales, low stock. | `/dashboard` |
| Reports hub: only reports that are built are listed. | `/reports` |
| Day book: everything that happened, in order. | `/reports/day-book` |
| Sales register and purchase register. | `/reports/sales-register`, `/purchase-register` |
| GST summary: output tax, input tax credit, net payable, in GSTR-3B box order (for reading only; nothing is filed). | `/reports/gst-summary` |
| Report exports to CSV. | `reports/exports/<id>` |

### Import and export (`import_export`)

| Capability | Where |
|---|---|
| CSV import wizard for parties and items: template download, column mapping, review, commit, and an errors CSV. | `/imports`, `/imports/[id]` |
| CSV export from the lists and reports; full business data export. | list header actions; `/settings/data` |

### Help (`help`)

**Not live.** The app package is reserved and has no models or views.

---

## Shop and billing

### Sales (`sales`, `tax`)

| Capability | Where |
|---|---|
| GST tax invoices. CGST and SGST, or IGST, are worked out from each item's rate and the place of supply. Also drafts, walk-in cash sales, and edit before issue. | `/sales/invoices`, `/new`, `/[id]`, `/[id]/edit` |
| Record a payment against an invoice (part or full), from the invoice. | `InvoicePaymentDrawer` |
| Estimates (quotations), converted to an invoice. | `/sales/estimates` |
| Credit notes (returns against a bill), with quantity caps and settlement or credit applied. | `/sales/credit-notes` |
| Void a document, with a reason. | detail pages |
| Tax rates and HSN lookup. | `/taxes/rates`, `/taxes/hsn` |

**Not live:** e-invoice (IRN), e-way bill, GST return filing.

### Purchases (`purchases`)

| Capability | Where |
|---|---|
| Purchase bills with input GST: drafts, record, void. | `/purchases/bills`, `/new`, `/[id]` |
| Paid now on the bill, and supplier payments against each bill later. | `PurchasePaidNowDrawer`; payments seam |

### Inventory: items and stock (`inventory`)

| Capability | Where |
|---|---|
| Items with category, unit, HSN, GST rate and prices; item detail with its stock movements. | `/items`, `/items/[id]` |
| Categories and units (the masters). | `/items/masters` |
| Stock adjustments with a reason, which move stock and its value. | `StockAdjustmentDrawer` |
| Stock summary (quantity and value) and the low-stock list, with a badge in the menu. | `/stock/summary`, `/stock/low` |

**Not live:** barcode printing or scanning as a merchant feature, and multiple godowns or branches.

### Expenses and cashbook (`expenses`)

| Capability | Where |
|---|---|
| Expenses with a category and an optional party; void. | `/expenses` |
| Cashbook: money in and out, day by day. | `/cashbook` |

---

## Planned modules: nothing is live

| Module | Status (vision §2) | In the code today |
|---|---|---|
| Lending and collections | Planned | nothing |
| Library | Planned | nothing |
| Gym and fitness | Planned | nothing |
| Hotel and stays | Planned | nothing |

**Landing page (changed by CR-2026-09-29-PLATFORM-D).** The owner decided that the pre-launch
page presents every module the same way, as part of the product, with no Live or Planned label.
These modules are still **not built**. On the page they have text and an icon illustration only:
no screenshots, demos, dates or invented screens. Their status lives in one place,
`frontend/src/modules/DigiKhaato/features/landing/config/modules.ts`, which is not rendered.
Before yourkhata.com is public, every module shown must be live, or the owner must re-confirm the
page (the pre-launch gate in `STATUS.md`). **In the app** a planned module stays absent until it
is built.

---

## Never claim (not built anywhere)

- offline mode
- SMS or email sent by the product
- e-invoice or e-way bill
- GST return filing
- bank sync
- a payment gateway or accepting online payments
- barcode
- P&L or balance sheet
- branches
- a native or store app
- testimonials, user counts or ratings

`src/tests/unbuiltFeatureCopy.test.ts` enforces this list on every `landing.*` string.

## What the landing page may say, mapped to this file

| Landing claim | Backed by |
|---|---|
| Core: people and contacts | Parties |
| Core: money in and out, balances | Ledger |
| Core: payments | Payments |
| Core: documents and share links | Print pipeline and sales share links. Statement share links are not live. |
| Core: reminders | Reminders. The merchant sends; the product never does. |
| Core: reports | Reports |
| Core: team and roles | Team |
| Core: Hindi and English | Platform |
| Core: CSV import and export | Import and export |
| Shop and billing: live | Sales, Purchases, Inventory, Expenses |
| "Why YourKhata" points | Each is mapped to a line above, or to a binding rule, in `features/landing/config/why.ts` |
