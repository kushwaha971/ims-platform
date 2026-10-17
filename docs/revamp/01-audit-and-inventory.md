# 01 · Audit and inventory of the app as it is

Status: **done for the first pass, 17 Oct 2026**. Read-only survey of `dev` at 31784ab.
Nothing here is a proposal; proposals are in 04 onwards.

Paths are relative to `frontend/` unless they start with `backend/` or `docs/`.
Feature code is `src/modules/DigiKhaato/features/<feature>/` and is written as `F/<feature>`.

## 1. Size of the thing

| Fact | Count | Evidence |
|---|---:|---|
| Pages (`page.tsx`) | 116 | (app) 93, (auth) 9, (admin) 5, (public) 5, (internal) 1, plus `/`, `/solutions`, `/solutions/[slug]` |
| `loading.tsx` route boundaries | **0** | `find app -name loading.tsx` |
| `error.tsx` | 2 | `app/error.tsx`, `app/(app)/error.tsx` |
| App manifests | 4 | `src/modules/appManifests.ts`: Shop, Udhaar (khata), Library, Lending |
| Feature folders | 33 | `src/modules/DigiKhaato/features/` |
| `router.push` / `replace` calls | 110 | navigation done in handlers, which never prefetch |
| Buttons passing `busy=` | 193 | caller-managed pending state |
| `createAsyncThunk` | 285 in 66 files | Redux Toolkit, no TanStack Query (binding) |
| `next/dynamic` calls | ~165 in 65 files | drawers and dialogs are lazy |
| Library pages / Lending pages | 16 / 7 | §6 |

## 2. Modules and screens

### Shop (`F/shop/app.ts`, code `shop`)
Prefixes `/dashboard /customers /suppliers /sales /items /stock /purchases /cashbook /reports`.
Phone tabs: Home · Customers · Suppliers · Bills · More.

| Area | Routes | Main component, and what it opens |
|---|---|---|
| Home | `/dashboard` | `DashboardPageContent`, `DashboardPanels` (to collect/to pay, today strip, quick actions, attention list) |
| Customers, suppliers | `/customers`, `/suppliers`, `/parties` | `PartyListPageContent` → `PartyFormDrawer`, sort dialog/sheet, bulk archive, bulk tag |
| Person page | `/parties/[id]`, `/statement`, `/parties/tags` | `PartyDetailPageContent` → entry, correction, opening-balance drawers; reverse, archive, relation dialogs; identity drawer; reminder sheet; module panels |
| Sales | `/sales/{invoices,estimates,orders,challans,credit-notes}` (+ `[id]`, `new`, `[id]/edit`) | list, `InvoiceDetailPageContent` (payment drawer, share sheet, void, cancel, apply credit), `InvoiceEditorPageContent` (`UbTotalDock` on phones) |
| Purchases | `/purchases/{bills,orders,debit-notes}` (+ detail, editor), `/expenses` | `PurchaseBillDetailPageContent` (void, cancel, paid-now, debit note), `ExpensesPageContent` |
| Items, stock | `/items`, `/items/[id]`, `/items/masters`, `/items/price-lists[/id]`, `/stock/summary`, `/stock/low`, `/imports[/id]` | item form, stock adjustment, CSV import wizard |
| Money | `/payments`, `/payments/[id]`, `/cashbook` | `PaymentFormDrawer`, apply advance, collect by QR, void payment |
| Reports | `/reports` + day book, sales register, purchase register, GST summary, profit, aging | `ReportsHubPageContent` from `reportsRegistry.ts` |

### Udhaar book (`F/khata/app.ts`, code `khata`, book `main`)
`/khata` (the party list, reading the Udhaar book), `/parties/[id]` (shared person page), `/ledger/aging`, `/ledger/reminders`.
Phone tabs: People · Aging · Reminders · More.

### Library and Lending
Inventoried in full in [02-preserve-and-contracts.md](02-preserve-and-contracts.md), because they are live and frozen.

### App-wide
| Area | Routes | Notes |
|---|---|---|
| Sign in | `/login`, `/signup` (OTP), `/login/email`, `/forgot-password`, `/reset-password`, `/set-password`, `/accept-invite/[token]` | `OtpSignInPageContent`, `UbOtpInput` |
| Onboarding | `/onboarding/step/[n]` (4 steps) | business + app choice, address, GST, preset summary |
| Business switch | `/switch`, `TenantSwitcherMenu` | the switcher also lists the open business's apps |
| More (phone) | `/more` | remaining nav rows, search, business switch, devices, language, theme, sign out |
| Settings | `/settings`, `/profile`, `/team`, `/branding`, `/business-days`, `/data`, `/devices`, `/plan`, `/activity` | there is no personal-profile page; `/settings/profile` is the business |
| Notifications | no route | bell → `NotificationPanel` in a `UbDialog` |
| Admin console | `/admin/tenants[/id]`, `/admin/partners`, `/admin/health` | `AdminShell` |
| Public | `/d/[token]`, `/pay/[token]`, `/in/[token]`, `/legal/*`, `/`, `/solutions/*` | customer-facing: no product name (CLAUDE.md) |

## 3. Navigation today

- **Shell**: `app/(app)/layout.tsx` → `AppGroupShell` (`AppRouteWarmup`, `RequireSession`) → `src/components/layout/UbAppShell.tsx`.
- **Desktop**: `UbSidebar.tsx`, a sticky dark rail at `lg` and up, with `TenantSwitcherMenu rail` on top and `NavSections.tsx` below. The active row is the longest matching href prefix (`activeNav.ts`). `UbAppTopBar.tsx` (56 px) has party search (Shop only), `NotificationBell` and `AccountMenu`.
- **Phone**: a 56 px header shows the logo or `MobileBackButton`, plus `TenantSwitcherMenu`, `MobileQuickSearch` and the bell. `MobileTabBar` → `UbBottomNav`: up to 4 manifest rows plus More, `next/link` with default prefetch.
- **Choosing the app**: `useNavigation()` takes the app from the path's prefix, then from `history.state.yourkhataApp` (for shared pages like `/parties`), then the session's `activeApp`, then the first accessible app; a mismatch dispatches `switchApp`.
- **Switching app**: `TenantSwitcherMenu` lists businesses and the open business's apps; picking one calls `router.push(app.homePath)`. It is reached from the header, not from the bottom bar.
- **Bottom bar visibility** (`F/navigation/mobileNav.ts`): hidden on `/new`, `/edit` and the person page (`/parties/<id>`), shown everywhere else, including other detail pages.
- **Overlap**: `--ub-nav-offset` (`primitives.css:204`) lifts `UbBottomBar`, `UbFab` and `main` padding above the bar; safe-area bottom is handled; the top inset is not.

## 4. Notifications today
- `NotificationBell` (header and top bar) lazy-loads `NotificationPanel`, which is a **`UbDialog`**: a modal on desktop, a sheet on phones.
- API: `GET /notifications?cursor&limit=25` (with `meta.unread_count`), `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all` (`src/api/APIPaths.ts:257-261`).
- Polling every 60 s while visible, plus on focus (`useNotificationPoll.ts`). Owner directive of 23 Sep: an in-app list, no push (BACKLOG; NTF-04 web push needs ADR-024).
- Tapping a row marks it read, then `router.push(safeRoute(row.route))`.

## 5. PWA today
- `public/manifest.webmanifest`: standalone, portrait, `start_url /dashboard?src=pwa`, shortcuts You gave · New bill · Parties.
- **`start_url` is the Shop's home for every business**, including Library-only and Lending-only ones, and the "You gave" shortcut goes to `/parties?action=gave`, which predates the separate Udhaar app (DEC-019).
- `public/sw.js` (hand-written, v1): static cache-first; navigations network-first with a 3 s timeout then cache then a "No signal" page; six API reads cached per tenant; writes never cached.
- **The worker registers only when `NEXT_PUBLIC_SW_ENABLED=true`.** `frontend/.env.example` has `false`; `.env.local.example` has `true`. Whether production has it on is unknown and must be checked (P-01 in 05).
- No install prompt handling, no standalone detection, no update prompt, no top safe-area handling.

## 6. Interaction feedback today
- `UbButton` has `busy` / `busyLabel` (spinner, `aria-busy`, disabled). There is no automatic pending state: each caller sets `busy`.
- `UbForm` wraps react-hook-form's `handleSubmit` and has **no in-flight guard**; a second submit before `busy` re-renders is possible.
- Idempotency: `src/api/AxiosInstances.ts:118-133` adds an `Idempotency-Key` to POSTs on an allowlist (`IDEMPOTENT_POST_PATHS`, `APIPaths.ts:384`); editors mint keys so a retry reuses them.
- **No `loading.tsx` anywhere**, no route progress indicator. Suspense fallbacks exist for `useSearchParams`, not for transitions.
- 110 navigations are `router.push` in handlers; `next/link` is only used inside design-system components.
- `app/layout.tsx:100` reads `cookies()`, so every route renders dynamically on the server.

## 7. Performance facts already measured

| Fact | Value | Source |
|---|---|---|
| Framework chunk | 127.3 / 128 KB gz | 15-theme review |
| Shared app chunk | 111.8 / 112 KB gz | same |
| First load, median route budget | ~317 KB gz | `bundle-budgets.json` |
| Heaviest routes | ~400 KB (`/sales/estimates/new`), ~393 (invoice editor) | same |
| Home `/dashboard` first load | 336 KB | same |
| `/library` / `/lending` first load | 314 / 306 KB | same |
| Server P95 at 2k parties / 100k entries / 20k invoices | every endpoint under 1.5 s | `docs/performance/2026-09-28-scale-run.md` |
| Client metrics on app routes (LCP, INP) | **never measured** | only `e2e/landing.mjs --perf` measures, landing page only |
| Field web vitals | **none** | no `web-vitals`, no `useReportWebVitals` |
| Budget ratchet | dozens of "measured + 0.5 KB" raises | `bundle-budgets.json` notes |

Dependencies flagged: `recharts` and `date-fns` appear unused by `src` (verify before removal); `posthog-js` session replay runs on phones after idle and its cost is unmeasured.

## 8. Existing plans this revamp extends (do not duplicate)

| Document | What it decided | Status found |
|---|---|---|
| `docs/mobile-redesign/` (9 Oct) | bottom nav + More, action sheets, FAB, docked khata, folded forms | **mostly built** (UbBottomNav, UbActionSheet, UbFab, UbTotalDock, /more) but docs still say "proposal"; colours in 04 are stale (indigo) |
| `docs/platform/14-platform-shell-and-apps.md` | context switcher: popover on desktop, sheet on phones | built; reached from the header |
| `docs/DESIGN-SYSTEM.md` | teal/marigold theme (17 Oct), fonts, 40 px inputs, axe sweep | current; §6 "no bell" is stale |
| `docs/shop-ims-readiness/` | Shop programme WP-01…WP-10, gaps TV-01…07 | in progress; WP-10 owns device and performance tests |
| `docs/PRODUCT-REVIEW-2026-10.md` | bottom nav on nested pages, open P1s | open: Back can leave the app; wide report tables on phones |
| `docs/qa/HANDOFF.md` | UX18 filter/rendering work, bundle rule | open |
| `docs/review/03-performance.md` | the `/auth/me` → list waterfall (M7) | partly fixed: warm-up covers `/parties` and `/khata` only |

## 9. Problems found, in one list

| ID | Problem | Kind | Evidence |
|---|---|---|---|
| A-01 | Taps on links and buttons that navigate show nothing until the next page arrives | feedback | 0 `loading.tsx`, 110 `router.push`, dynamic root layout |
| A-02 | A second form submit is possible before `busy` renders | duplicate risk | `UbForm` has no guard; idempotency only on allowlisted POSTs |
| A-03 | No module switcher in the bottom bar; switching apps lives in the header menu | navigation | §3 |
| A-04 | Notifications always open as a modal dialog | notifications | §4 |
| A-05 | PWA opens the Shop for every business; shortcuts predate DEC-019 | PWA | §5 |
| A-06 | Service worker may be off in production | PWA | §5 |
| A-07 | No client performance measurement on app routes, no field vitals | performance | §7 |
| A-08 | First load ~317 KB median, ratcheting up | performance | §7 |
| A-09 | Shop tabs other than parties wait for `/auth/me` before fetching | performance | review/03 M7; `AppRouteWarmup` |
| A-10 | Back can leave the app from a deep link (P1) | navigation | PRODUCT-REVIEW §1 |
| A-11 | Report tables are wide tables on phones | responsive | PRODUCT-REVIEW |
| A-12 | `/` sends a signed-in person to `/dashboard` whatever their app | navigation | `proxy.ts` |
| A-13 | No personal profile page; account items are spread across More, AccountMenu and Settings | IA | §2 |
| A-14 | Header has no top safe-area handling in standalone mode | PWA | §3 |
| A-15 | Design docs disagree (mobile-redesign/04 indigo vs DESIGN-SYSTEM teal; §6 "no bell") | docs | §8 |
