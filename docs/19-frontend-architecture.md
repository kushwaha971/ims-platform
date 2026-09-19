# Part 19 — Frontend Architecture

## 19.0 Status, scope and how to read this chapter

This chapter is **normative**. It tells an engineer — or an AI coding agent — where every frontend file lives, what it may import, what it must contain and how it talks to the layer beneath it. Together with Part 23 (Design System), Part 22 (API Specification), Part 25 (Frontend Coding Standards) and the feature specifications in Part 17, it is sufficient to build the UdhaarBook web client from an empty directory without inventing a single structural decision.

Where this chapter and Part 0 (Canon) disagree, **Part 0 wins** and this chapter is a defect. Where this chapter and a Part 17 FRD disagree on a screen-level detail, the FRD wins for that screen; where they disagree on structure, this chapter wins.

**The governing constraint.** The UdhaarBook frontend replicates the conventions of the **BrandHub Customer module** (`brandhub/BrandHub/apps/frontend/src/modules/Customer`, `app/customer/**`) exactly: the same folder layout, the same Redux Toolkit slice + `createAsyncThunk` data layer, the same service layer over a shared Axios instance, the same React Hook Form + Yup forms driven by one central `useValidationSchemas()` hook, the same design-system wrapper component template, the same thin `app/**` route files. This is not a suggestion to be weighed against alternatives. It is the reference implementation, and deviations require an ADR.

Three consequences follow immediately, and they are repeated here because they are the ones most often violated by well-meaning contributors:

1. **TanStack Query is not used.** Not for server state, not for caching, not for "just this one screen". BrandHub Customer does not use it and UdhaarBook has exactly one data-layer pattern: slice + thunk + service. Caching, invalidation and refetch rules are specified explicitly in §19.3.6 rather than delegated to a library.
2. **The third-party dependency list is closed.** ADR-021 in the canon enumerates the permitted frontend packages. Anything not on that list — a date library beyond `dayjs`, a state library beyond `@reduxjs/toolkit`, a table library beyond `@tanstack/react-table`, a form library beyond `react-hook-form`, an icon set beyond `lucide-react` — requires a written ADR before the first `npm install`. The product runs locally for personal use first and must remain trivially extensible and auditable later; every dependency is a future migration cost.
3. **The design system is `ml-uikit` primitives wrapped in `Ub*` components.** Features never reach past `Ub*` into raw HTML controls, and never fork `ml-uikit`.

The reader is assumed to have read Part 23 §23.4 (the component template) and Part 17 §17.0.2 (the `Ub*` vocabulary). This chapter does not repeat them.

---

## 19.1 Architectural overview and the layering rule

### 19.1.1 The seven layers

UdhaarBook's client is a strictly layered application. Data flows *down* through seven layers on the way out and back *up* the same seven on the way in. Every layer has exactly one job, one set of permitted imports and one forbidden direction.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. ROUTE            app/(app)/parties/page.tsx                               │
│                     Thin. Suspense boundary + one <XPageContent/> import.    │
│                     No state, no data, no layout decisions, no business logic.│
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ renders
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ 2. PAGE CONTENT     features/parties/components/PartyListPageContent.tsx      │
│                     Composes the screen from Ub* components and feature       │
│                     components. Owns URL state and local UI state. Calls      │
│                     feature hooks. Never calls services or axios.             │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ uses
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ 3. VIEW-MODEL       features/parties/view-model/partyDisplay.ts               │
│                     Pure functions. Row → display strings, tone classes,      │
│                     action menus, derived flags. No React, no Redux, no I/O.  │
└──────────────────────────────────────────────────────────────────────────────┘
                ▲ consumed by layer 2
┌───────────────┴──────────────────────────────────────────────────────────────┐
│ 4. FEATURE HOOK     features/parties/hooks/usePartyList.ts                    │
│                     'use client'. Binds React to Redux: useSelector +         │
│                     useDispatch(thunk), effects that fetch, memoised handlers.│
│                     Returns a plain, typed result object. No JSX.             │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ dispatches
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ 5. REDUX            features/parties/redux/partyListSlice.ts                  │
│                     partyListThunk.ts                                         │
│                     createSlice holds state; createAsyncThunk owns the async  │
│                     lifecycle and rejectWithValue. Selectors co-located.      │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ calls
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ 6. SERVICE          features/parties/api/partyService.ts                      │
│                     One exported async function per endpoint. Owns the        │
│                     snake_case ⇄ camelCase mapping, query-string building     │
│                     and response typing. Returns domain objects, not AxiosRes.│
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ uses
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ 7. TRANSPORT        src/api/AxiosInstances.ts + src/api/APIPaths.ts           │
│                     One axios instance. Interceptors: auth, tenant, request-id│
│                     idempotency, refresh-on-401 single-flight, error          │
│                     normalisation into ApiError.                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 19.1.2 The import rule, stated as law

The following table is enforced by ESLint (`import/no-restricted-paths`, §25.12) and by code review. "May import" is exhaustive: anything not listed is forbidden.

| Layer | May import | Must never import |
|---|---|---|
| **Route** (`app/**`) | One feature `*PageContent` component; `next/*`; `react` (`Suspense` only) | Redux, services, axios, `Ub*` components, feature hooks, view-models |
| **Page content / feature component** | `Ub*` design system, sibling feature components, feature hooks, view-model helpers, feature `types`, feature `constants`, `src/hooks/*`, `src/utils/*`, `next/navigation`, `react-intl` via `useTranslation()` | `axios`, `src/api/*`, any `*Service.ts`, `createAsyncThunk` definitions used directly without a hook *(a bare `dispatch(thunk())` in a page is allowed only for one-shot fire-and-forget fetches; anything with state belongs in a hook)* |
| **View-model** | Feature `types`, `src/utils/*`, `decimal.js-light`, `dayjs` | React, Redux, `Ub*`, services, axios, `react-intl` |
| **Feature hook** | `react`, `react-redux`, feature thunks, feature slice selectors, feature types, `src/hooks/*`, `src/utils/*`, `next/navigation` | JSX, `Ub*` components, axios, services directly |
| **Slice** | `@reduxjs/toolkit`, feature thunks, feature types, `src/redux/store` (type-only `RootState`) | React, services, axios, other features' slices *(cross-feature reaction is via `extraReducers` on the other feature's exported action, never by importing its reducer)* |
| **Thunk** | `@reduxjs/toolkit`, feature service, feature types, `src/utils/apiError` | React, `Ub*`, axios directly, other features' services |
| **Service** | `src/api/AxiosInstances`, `src/api/APIPaths`, feature types, `src/utils/*` mappers | React, Redux, `Ub*`, `react-intl` |
| **Transport** | `axios`, `src/constants`, `src/utils/*` | Everything above it |
| **Design system (`Ub*`)** | `ml-uikit`, `lucide-react`, `react`, `src/utils/cn`, sibling `Ub*` | Redux, services, axios, feature code, `react-intl` message *definitions* (text always arrives as props) |

Two rules deserve emphasis because they are the load-bearing ones:

- **No component ever imports axios or a service.** If a component needs data, a hook gets it from Redux; if a hook needs data, a thunk fetches it. The only exception in the entire codebase is the public document view (§19.7.6), which is unauthenticated, has no store, and calls one service function directly from its page content — documented inline as such.
- **No `Ub*` component knows about the domain.** `UbAmount` formats a decimal string with a sign, a tone and a caller-supplied label — its full contract is Part 23 §23.2.6 and its implementation Part 25 R-C-2 — but it does not know what a party balance is; the *feature* decides which sign, tone and label a figure carries. `UbDataGrid` renders columns; it does not know what an invoice is. Domain knowledge starts at the feature boundary. This is what makes the design system portable across the white-label partners of Part 24.

### 19.1.3 Data flow, worked end to end

Take LED-01 ("You gave ₹500 to Ramesh"), the most frequent action in the product. The full round trip, with the file that owns each step:

```
 user taps "You gave ₹"  in PartyHeaderActions.tsx              (layer 2)
   └─> useLedgerEntryDrawer().open('debit')                      (layer 4)
         └─> local drawer state opens; RHF form created with
             ledgerEntrySchema from useValidationSchemas()        (layer 4 + src/hooks)
 user types 500, taps Save
   └─> handleSubmit -> postEntry(values)                          (layer 4)
         └─> dispatch(postLedgerEntry({ partyId, ...values,
                     idempotencyKey }))                           (layer 5, thunk)
               ├─ pending  -> ledgerEntrySlice.posting = 'pending'
               │             optimistic row pushed with
               │             clientId = idempotencyKey            (layer 5, slice)
               └─> ledgerService.postLedgerEntry(payload, key)     (layer 6)
                     └─> api.post(API_PATHS.LEDGER_ENTRIES, body,
                             { headers: { 'Idempotency-Key': key }})(layer 7)
                           ├─ request interceptor: Authorization,
                           │   X-Request-Id
                           └─ response 201
                     <─ maps snake->camel, returns { entry, meta }
               fulfilled -> slice replaces optimistic row by clientId,
                            sets posting='idle'
                         -> extraReducers in partySlice listens to
                            postLedgerEntry.fulfilled and updates
                            party.balance from meta.partyBalance
   <─ hook returns; component closes drawer, dispatches
      showSnackbar({ id: 'ledger.entry.saved', params: {...} })
```

Note three properties of this flow that are architectural, not incidental:

1. **The idempotency key is minted once, in the hook, before the first attempt**, and reused on every retry of the same logical action (LED-01 FR-12, BR-8). It lives in the slice, not in the component, so that a remount does not mint a new one.
2. **Cross-feature state updates happen in `extraReducers`, listening to the other feature's thunk.** `partySlice` reacts to `postLedgerEntry.fulfilled`. It does not import `ledgerService`, and the ledger feature does not import `partySlice`. This keeps the dependency graph acyclic.
3. **The snackbar is dispatched by the component, not the thunk.** Thunks are UI-free: they resolve or `rejectWithValue`. Deciding *whether* the user should see a toast is a presentation decision. (The single exception is the transport-level error snackbar in §19.4.5, which exists so that no failure is ever silent.)

### 19.1.4 Server components: the decision

Next.js App Router offers React Server Components. **UdhaarBook does not use them for application screens.** Every route under `app/(app)/**` is a client component (`'use client'` at the top of its `*PageContent`).

The reasoning is not laziness; it is coherence with the data layer. Server components would need a second way to fetch data (server-side, with the tenant JWT read from cookies on the server) alongside the Redux/thunk path used by every interaction. Two data paths means two caching stories, two error stories and two auth stories. BrandHub Customer reached the same conclusion. Server components are used for exactly two things:

- **Static shells**: `app/layout.tsx`, `app/(app)/layout.tsx` and the route-group layouts, which render providers and pass children through. They contain no data fetching.
- **The public document view** (`app/(public)/d/[token]/page.tsx`), which is unauthenticated, cacheable and has no store — a genuine server-rendered page.

`app/**/page.tsx` files for application screens are `'use client'` and contain nothing but a Suspense wrapper (required because `useSearchParams` suspends) and the feature's page-content component:

```tsx
// app/(app)/parties/page.tsx
'use client';

import { Suspense } from 'react';
import { PartyListPageContent } from 'modules/UdhaarBook/features/parties/components/PartyListPageContent';
import { UbPageSkeleton } from 'modules/UdhaarBook/design-system';

export default function PartiesPage() {
  return (
    <Suspense fallback={<UbPageSkeleton variant="list" />}>
      <PartyListPageContent />
    </Suspense>
  );
}
```

That is the *entire* file, and every application route file looks like it. A route file that grows a `useState`, a `useEffect` or an import from `src/api` has been written in the wrong place and must be moved into the feature.

---

## 19.2 The repository tree

### 19.2.1 Top level

The frontend is one Next.js application. It is not a monorepo at MVP; if a second surface (partner admin, mobile shell) appears in Phase 3, it becomes `apps/web` under an Nx workspace exactly as BrandHub did, and nothing inside `src/` changes.

```
udhaarbook/frontend/
├── app/                            # Next.js App Router — thin routes only
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js                       # service worker (MVP; caching per §19.10.2)
│   ├── icons/                      # PWA icons 192/512, maskable
│   └── fonts/                      # self-hosted Inter, Noto Sans Devanagari, IBM Plex Mono
├── locales/
│   ├── en.json
│   └── hi.json
├── src/
│   ├── api/
│   │   ├── AxiosInstances.ts
│   │   └── APIPaths.ts
│   ├── constants.ts                # env-backed API_BASE_URLS, APP_CONFIG
│   ├── design-system/              # see §19.2.4  (Ub* wrappers; barrel index.ts)
│   ├── components/
│   │   └── layout/                 # shell, sidebar, header, bottom nav, snackbar host
│   ├── hooks/
│   │   ├── useValidationSchemas.ts
│   │   ├── useTranslation.ts
│   │   ├── useDebounce.ts
│   │   ├── useExclusiveModal.ts
│   │   ├── useIdempotencyKey.ts
│   │   ├── usePermissions.ts
│   │   ├── useDegradedNetwork.ts       # the three-state network model (§19.10.3)
│   │   └── useUnsavedChangesGuard.ts
│   ├── modules/
│   │   └── UdhaarBook/
│   │       └── features/           # see §19.2.3
│   ├── redux/
│   │   ├── store.ts
│   │   ├── invalidation/           # registry.ts, map.ts, listener.ts, types.ts (§19.3.6)
│   │   └── slice/
│   │       ├── snackbarSlice.ts
│   │       ├── sessionSlice.ts
│   │       ├── whiteLabelSlice.ts
│   │       ├── localeSlice.ts
│   │       ├── themeSlice.ts
│   │       ├── networkSlice.ts             # the three-state model (§19.10.3)
│   │       └── offlineQueueSlice.ts        # the outbox (MVP: ledger entries — §19.10.4)
│   ├── types/
│   │   ├── api.types.ts            # ApiError, Envelope<T>, PageMeta, CursorMeta
│   │   └── domain.types.ts         # shared enums mirrored from canon §0.7
│   ├── utils/
│   │   ├── cn.ts
│   │   ├── money.ts
│   │   ├── quantity.ts
│   │   ├── dates.ts
│   │   ├── gst.ts
│   │   ├── caseMapper.ts
│   │   ├── queryString.ts
│   │   ├── apiError.ts
│   │   ├── cookieUtils.ts
│   │   ├── storage.ts
│   │   ├── outbox.ts               # IndexedDB outbox (§19.10.4)
│   │   ├── image.ts
│   │   ├── share.ts
│   │   └── analytics.ts
│   └── tests/
│       ├── setupTests.ts
│       ├── renderWithProviders.tsx
│       └── fixtures/
├── .env.local.example
├── .eslintrc.json / eslint.config.mjs
├── .prettierrc
├── jest.config.ts
├── next.config.js
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

`src/modules/UdhaarBook/` exists — rather than features sitting directly under `src/` — for one reason: it mirrors BrandHub's `src/modules/Customer/` so that a developer moving between the two codebases finds the same shape, and so that a second module (a partner admin console, a super-admin console) can be added later as `src/modules/UdhaarAdmin/` without disturbing anything.

### 19.2.2 The `app/` tree

Route groups carry layout, not URL segments. The application shell lives in `(app)`; authentication screens in `(auth)`; unauthenticated public document views in `(public)`; the internal design-system gallery in `(internal)`.

```
app/
├── layout.tsx                      # <html> · fonts · providers (Redux, Intl, Theme, ErrorBoundary)
├── globals.css                     # tokens/*.css imports + ml-uikit stylesheet + tailwind layers
├── not-found.tsx
├── error.tsx                       # root error boundary
├── (auth)/
│   ├── layout.tsx                  # centred card, brand mark, no shell
│   ├── login/page.tsx
│   ├── otp/page.tsx
│   ├── set-password/page.tsx
│   ├── forgot-password/page.tsx
│   └── onboarding/page.tsx         # PLT-02 business setup wizard
├── (app)/
│   ├── layout.tsx                  # <UbAppShell> = sidebar + header + bottom nav + snackbar
│   ├── error.tsx                   # app-level error boundary (request id + retry)
│   ├── dashboard/page.tsx
│   ├── parties/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/
│   │       ├── page.tsx            # party khata (PTY-03 + LED-04)
│   │       └── statement/page.tsx
│   ├── ledger/
│   │   ├── reminders/page.tsx
│   │   └── aging/page.tsx
│   ├── items/
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── stock/
│   │   ├── adjustments/page.tsx
│   │   └── low/page.tsx
│   ├── sales/
│   │   ├── invoices/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       ├── edit/page.tsx
│   │   │       └── print/page.tsx  # print-only route, no shell
│   │   ├── estimates/…             # same shape
│   │   └── credit-notes/…
│   ├── purchases/bills/…
│   ├── payments/
│   │   ├── page.tsx
│   │   └── new/page.tsx
│   ├── expenses/page.tsx
│   ├── reports/
│   │   ├── page.tsx
│   │   ├── day-book/page.tsx
│   │   ├── sales-register/page.tsx
│   │   ├── gst-summary/page.tsx
│   │   └── stock-summary/page.tsx
│   ├── settings/
│   │   ├── page.tsx
│   │   ├── business/page.tsx
│   │   ├── numbering/page.tsx
│   │   ├── branding/page.tsx
│   │   ├── team/page.tsx
│   │   └── modules/page.tsx
│   └── notifications/page.tsx
├── (public)/
│   └── d/[token]/
│       ├── page.tsx                # shared invoice / statement (server component)
│       └── print/page.tsx
└── (internal)/
    └── design-system/page.tsx      # live Ub* gallery (Part 23 §23.4)
```

Two conventions are fixed here and must not be improvised:

- **Print routes are separate routes, not modals.** `sales/invoices/[id]/print` renders the React print component (Part 23 §23.7 deliverable 4) inside a bare layout with `@media print` rules and calls `window.print()` on mount when `?auto=1`. This is how ADR-014's client-side PDF story works: no server render, no `pdf-lib`, no headless browser.
- **`new` and `edit` are routes, not drawers**, for documents (invoice, estimate, credit note, purchase bill). Everything else — party create, item create, ledger entry, payment, expense, stock adjustment, reminder — is a `UbDrawer` opened over the list, with no route change. The rule: *if the form has line items, it gets a route; otherwise it gets a drawer.* Documents need deep links, autosaved drafts, browser-back semantics and a keyboard-first full-screen layout; a three-field drawer does not.

### 19.2.3 A simple feature in full: `parties`

This is the canonical shape. Every feature folder has the same eight subdirectories, and a feature omits a subdirectory only when it genuinely has nothing to put in it.

```
src/modules/UdhaarBook/features/parties/
├── api/
│   ├── partyService.ts             # listParties, getParty, createParty, updateParty,
│   │                               # archiveParty, restoreParty, exportParties
│   └── partyTagService.ts          # listTags, createTag, assignTags
├── components/
│   ├── PartyListPageContent.tsx    # the screen (PTY-02)
│   ├── PartyTotalsHeader.tsx       # two UbStatCards, tappable → balance filter
│   ├── PartyListToolbar.tsx        # UbSearchInput + chips + tag combobox + sort menu
│   ├── PartyListFiltersDrawer.tsx  # mobile filter sheet
│   ├── PartyListRow.tsx            # mobile card row (memo)
│   ├── PartyRowActionsMenu.tsx     # ⋯ menu, entries filtered by permissions
│   ├── PartyFormDrawer.tsx         # create/edit (PTY-01)
│   ├── PartyDetailPageContent.tsx  # khata page (PTY-03)
│   ├── PartyHeaderCard.tsx         # UbPartyHeader + quick actions
│   ├── PartyArchiveDialog.tsx      # UbConfirmDialog (PTY-04)
│   └── PartyBulkActionBar.tsx      # desktop selection bar
├── constants/
│   ├── partyFilters.ts             # BALANCE_FILTERS, TYPE_FILTERS, COLLECTION_FILTERS
│   ├── partySort.ts                # ORDERING_OPTIONS whitelist (mirrors PTY-02 FR-7)
│   └── partyListDefaults.ts        # DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, SELECTION_CAP
├── hooks/
│   ├── usePartyList.ts             # fetch + filters + pagination + selection
│   ├── usePartyDetail.ts
│   ├── usePartyForm.ts             # RHF form binding for create/edit
│   ├── usePartyActions.ts          # archive / restore / export, with confirms
│   └── usePartySearch.ts           # debounced async combobox source (shared by sales)
├── redux/
│   ├── partyListSlice.ts
│   ├── partyListThunk.ts
│   ├── partyDetailSlice.ts
│   ├── partyDetailThunk.ts
│   ├── partyFormSlice.ts
│   ├── partyFormThunk.ts
│   └── partyTagSlice.ts
├── types/
│   └── party.types.ts              # Party, PartyListParams, PartyListResponse, PartyTag…
├── validation/
│   └── partySchemas.ts             # usePartySchemas(): composes useValidationSchemas()
└── view-model/
    ├── partyDisplay.ts             # initials, secondaryLine, balanceLabel, balanceTone
    └── partyActions.ts             # rowMenu(party, permissions) → MenuItem[]
```

`PartyListPageContent.tsx` is around 180 lines and contains no `axios`, no `Yup`, no formatting logic and no permission arithmetic — all of it is delegated. That is the measure of whether the layering is being honoured.

### 19.2.4 A complex feature in full: `sales`

The sales feature is the stress test: a document editor with a field array, live totals, keyboard navigation, autosaved drafts, a tax engine mirrored from the backend, and three document kinds sharing one editor.

```
src/modules/UdhaarBook/features/sales/
├── api/
│   ├── salesService.ts             # createInvoice, updateInvoice, issueInvoice,
│   │                               # getInvoice, deleteInvoice, listInvoices, voidInvoice
│   ├── estimateService.ts          # listEstimates, createEstimate, convertEstimate
│   ├── creditNoteService.ts
│   └── shareService.ts             # createShareLink, buildWhatsAppText
├── components/
│   ├── list/
│   │   ├── InvoicesListPageContent.tsx      # SAL-08
│   │   ├── InvoiceListColumns.tsx           # UbDataGrid column factory (module-level)
│   │   ├── InvoiceListFilters.tsx
│   │   └── InvoiceStatusCell.tsx
│   ├── editor/
│   │   ├── InvoiceEditorPageContent.tsx     # SAL-02 — orchestrates the editor
│   │   ├── InvoiceEditorHeader.tsx          # title, draft-saved stamp, Save/Issue
│   │   ├── InvoicePartySection.tsx          # UbAsyncCombobox + walk-in fields (F2)
│   │   ├── InvoiceMetaSection.tsx           # date, due, place of supply, reverse charge
│   │   ├── InvoiceLinesSection.tsx          # wraps UbLineItemsEditor + useFieldArray
│   │   ├── InvoiceLineRow.tsx               # memo; one RHF Controller per editable cell
│   │   ├── InvoiceLineMobileCard.tsx        # < 640 px card form of a line
│   │   ├── InvoiceItemSearch.tsx            # scanner-aware item search (F4)
│   │   ├── InvoiceTotalsPanel.tsx           # UbTotalsPanel bound to the preview selector
│   │   ├── InvoiceDocumentDiscount.tsx      # F6
│   │   ├── InvoicePaymentSheet.tsx          # F8 — UbDrawer, multi-mode breakup
│   │   ├── InvoiceRule46Checklist.tsx       # 9-point compliance panel
│   │   ├── InvoiceStockShortDialog.tsx      # UbConfirmDialog with per-item shortfall
│   │   ├── InvoiceCreditLimitBanner.tsx     # UbStatusBanner warn/block/override
│   │   └── InvoiceDraftRestorePrompt.tsx    # localStorage draft recovery
│   ├── detail/
│   │   ├── InvoiceDetailPageContent.tsx
│   │   ├── InvoiceActionsMenu.tsx           # share, print, void, duplicate, record payment
│   │   ├── InvoiceVoidDialog.tsx            # UbReasonDialog
│   │   └── InvoicePaymentsSection.tsx
│   └── print/
│       ├── InvoicePrintA4.tsx               # React print component, tokens only
│       ├── InvoicePrintThermal80.tsx
│       └── InvoicePrintHeader.tsx           # tenant branding block (shared)
├── constants/
│   ├── invoiceKinds.ts                      # INVOICE | BILL_OF_SUPPLY | ESTIMATE | CREDIT_NOTE
│   ├── invoiceKeyboardMap.ts                # F2…F8, Ctrl+S, Ctrl+Enter (SAL-02 §7)
│   ├── invoiceStatuses.ts                   # status → tone map for UbStatusBadge
│   ├── placeOfSupply.ts                     # 36 state codes + names (en/hi keys)
│   └── invoiceDefaults.ts                   # EMPTY_LINE, MAX_LINES, AUTOSAVE_DEBOUNCE_MS
├── hooks/
│   ├── useInvoiceEditor.ts                  # the orchestrator: RHF form + field array +
│   │                                        # totals preview + autosave + issue
│   ├── useInvoiceLines.ts                   # field-array helpers, focus movement
│   ├── useInvoiceTotals.ts                  # memoised taxEngine run over watched lines
│   ├── useInvoiceKeyboard.ts                # binds invoiceKeyboardMap to the editor
│   ├── useBarcodeScanner.ts                 # ≥8 chars in <50 ms → lookup by barcode
│   ├── useInvoiceDraftAutosave.ts           # debounced localStorage + PATCH draft
│   ├── useInvoiceIssue.ts                   # issue flow incl. stock/credit dialogs
│   ├── useInvoiceList.ts
│   ├── useInvoiceDetail.ts
│   └── useInvoicePrint.ts                   # opens print route, window.print()
├── redux/
│   ├── invoiceEditorSlice.ts                # document, lines, totalsPreview, warnings,
│   │                                        # rule46, saving, issuing, error, idempotencyKey
│   ├── invoiceEditorThunk.ts                # saveInvoiceDraft, issueInvoice, fetchInvoice,
│   │                                        # deleteInvoiceDraft
│   ├── invoiceListSlice.ts
│   ├── invoiceListThunk.ts
│   ├── invoiceDetailSlice.ts
│   ├── invoiceDetailThunk.ts
│   ├── estimateListSlice.ts
│   ├── estimateListThunk.ts
│   ├── creditNoteSlice.ts
│   └── creditNoteThunk.ts
├── types/
│   ├── invoice.types.ts                     # SalesDocument, SalesDocumentLine, Totals…
│   ├── invoiceForm.types.ts                 # the RHF shape (strings, not Decimals)
│   └── estimate.types.ts
├── validation/
│   └── invoiceSchemas.ts                    # useInvoiceSchemas(): header + line + payment
└── view-model/
    ├── taxEngine.ts                         # mirror of sales/services/tax_engine.py
    ├── invoiceDisplay.ts                    # status label/tone, number formatting, due text
    ├── invoiceActions.ts                    # which actions a status+permission set allows
    ├── rule46.ts                            # the 9 mandatory-field checks
    └── invoiceDraftStorage.ts               # localStorage key shape and (de)serialisation
```

Three notes on the complex case:

- **`view-model/taxEngine.ts` is a mirror, not a source of truth.** The server recomputes every total on save and issue (SAL-02 BR-16, canon §0.11 rule 3). The client engine exists so the totals panel updates as the user types. Its unit tests use the *same fixture table* as the backend's `test_tax_engine.py`, checked in at `src/tests/fixtures/taxEngine.cases.json`, so a divergence fails CI on both sides.
- **The editor has one slice and one form.** The RHF form owns the *editable* state (lines, party, dates, discounts). The slice owns the *server-derived* state (saved document, version, warnings, rule46 result, idempotency key, saving/issuing flags). They are never duplicated: the form is not mirrored into Redux on every keystroke, and the slice does not hold draft line edits. §19.5.4 specifies the handoff precisely.
- **`components/` has subfolders here and not in `parties/`.** The rule: flat until a feature exceeds roughly a dozen components, then group by screen (`list/`, `editor/`, `detail/`, `print/`). Never group by type ("modals/", "cards/") — group by the screen the component belongs to.

### 19.2.5 The design system folder

```
src/design-system/
├── index.ts                        # the barrel — the ONLY import path for features
├── UbAmount/{UbAmount.tsx,index.ts}
├── UbAsyncCombobox/{UbAsyncCombobox.tsx,index.ts}
├── UbBottomNav/{UbBottomNav.tsx,index.ts}
├── UbCard/{UbCard.tsx,index.ts}
├── UbCombobox/{UbCombobox.tsx,index.ts}
├── UbConfirmDialog/{UbConfirmDialog.tsx,index.ts}
├── UbDataGrid/
│   ├── UbDataGrid.tsx
│   ├── UbDataGridToolbar.tsx
│   ├── UbDataGridPagination.tsx
│   ├── UbDataGridEmptyState.tsx
│   ├── UbDataGridMobileList.tsx    # the < md card rendering of the same columns
│   ├── types.ts
│   └── index.ts
├── UbDateInput/…
├── UbDateRangePicker/…
├── UbDialog/…
├── UbDrawer/…
├── UbEmptyState/…
├── UbFab/…
├── UbField/{UbField.tsx,UbFieldError.tsx,UbInputHint.tsx,index.ts}
├── UbFileUpload/…
├── UbFilterTag/…
├── UbForm/{UbForm.tsx,index.ts}
├── UbHelpHint/…
├── UbLineItemsEditor/…
├── UbMoneyInput/…
├── UbPageHeader/…
├── UbPageShell/…
├── UbPartyHeader/…
├── UbPercentInput/…
├── UbPhoneInput/…
├── UbQrCode/{UbQrCode.tsx,qrEncoder.ts,index.ts}
├── UbQuantityInput/…
├── UbReasonDialog/…
├── UbSearchInput/…
├── UbShareSheet/…
├── UbSidebar/…
├── UbSkeleton/…
├── UbSnackbar/…
├── UbStatCard/…
├── UbStatusBadge/…
├── UbStatusBanner/…
├── UbTabs/…
├── UbTimeline/…
├── UbTotalsPanel/…
├── theme/
│   ├── ThemeProvider.tsx           # data-theme on <html>, prefers-color-scheme
│   └── useWhiteLabelTheme.ts       # applies tenant --primary-* ramp from whiteLabelSlice
└── useExclusiveModal.ts
```

Every component folder holds the component file plus an `index.ts` that re-exports the component and its prop types; the root `index.ts` re-exports everything. Features import **only** from `modules/UdhaarBook/design-system` (the barrel) — never from a deep path. This is what lets a component be split into several files later without touching a single feature.

### 19.2.6 Path aliases

`tsconfig.json` defines exactly four aliases, mirroring BrandHub:

```jsonc
"paths": {
  "src/*":     ["./src/*"],
  "modules/*": ["./src/modules/*"],
  "app/*":     ["./app/*"],
  "locales/*": ["./locales/*"]
}
```

Within a feature, sibling imports are relative (`../redux/partyListThunk`, `./PartyListRow`). Across features and into shared code, imports are aliased (`src/hooks/useTranslation`, `modules/UdhaarBook/design-system`). Relative paths that climb more than two levels (`../../../`) are forbidden — that is always a sign the import should be aliased.

---

## 19.3 State management

### 19.3.1 Where state lives — the three-way split

Every piece of state in the application belongs to exactly one of three homes. Choosing wrongly is the single most common source of bugs in a Redux application, so the rule is mechanical.

| Home | What belongs there | Why | Examples |
|---|---|---|---|
| **URL** (`useSearchParams`) | State that must survive a reload, be shareable by link, or be restored by the browser Back button | The URL is the only state a user can send to somebody else | `?tab=archived` on the party list; `?tab=ongoing` on invoices; `?date_from&date_to` on reports; `?step=payment` on onboarding; the record `[id]` itself |
| **Redux** | Server-derived data, cross-screen state, and anything two components far apart must agree on | It is the only store the thunks can write to and the only one that survives navigation between routes | Party list rows + meta + totals; the active session and permissions; the invoice editor's server document and version; snackbar; white-label theme; offline queue |
| **Local component state** (`useState`/`useReducer`/RHF) | Ephemeral UI state and in-progress form input | Cheapest, most local, dies with the component — which is correct for a drawer that is closed | Whether a drawer is open; the current search *input* before debounce commits it; which accordion row is expanded; every RHF field value until submit; focused cell in the line editor |

The three hard rules that follow from the table:

1. **Search text, filter chips and sort are not in the URL.** Only `tab` (and, on reports, the date range) is. This is a shared UX rule (Part 17 §17.0.3) and it is deliberate: a reloaded list is always the default view, which is what a shopkeeper expects when they pull the app back up. Filters *do* live in the list slice so that navigating to a party and pressing Back restores them within the session.
2. **Form values are not in Redux.** React Hook Form owns them, uncontrolled, until submit. Mirroring every keystroke into Redux is the classic performance mistake; on the invoice line editor with 20 lines it is fatal. The one exception is autosaved document drafts, and even there only the *serialised snapshot* is persisted (§19.5.7), never the live field state.
3. **Derived values are not stored.** A party's "You will get" label is computed by `partyDisplay.balanceLabel(balance)` at render time, not stored in the slice. Totals previews are computed by a memoised selector over the watched form values, not stored. Anything that can be computed is computed.

### 19.3.2 Slice anatomy

Every slice follows one of three shapes. Picking the shape is the first decision when adding a feature.

**Shape A — list slice** (paginated, filtered server collection). Used by parties, items, invoices, payments, expenses, reminders, notifications.

```ts
interface ListState<TRow, TFilters> {
  rows: TRow[];
  meta: PageMeta;             // page, pageSize, total, totalPages
  totals: Record<string, string> | null;  // server aggregates over the filtered set
  filters: TFilters;          // committed filter/sort/search values (not the raw input)
  status: RequestStatus;      // 'idle' | 'loading' | 'refreshing' | 'succeeded' | 'failed'
  error: ApiErrorShape | null;
  selectedIds: string[];      // desktop bulk selection, capped
  lastFetchedAt: number | null;
  stale: boolean;             // set by the invalidation listener (§19.3.6)
  staleUrgency: 'now' | 'next-mount' | null;
}
```

**Shape B — detail slice** (one record, keyed by id so several can be cached). Used by party detail, invoice detail, item detail.

```ts
interface DetailState<T> {
  byId: Record<string, { data: T | null; status: RequestStatus; error: ApiErrorShape | null }>;
  currentId: string | null;
  stale: boolean;             // set by the invalidation listener (§19.3.6)
  staleUrgency: 'now' | 'next-mount' | null;
}
```

**Shape C — editor/form slice** (a mutation in progress). Used by the invoice editor, the ledger entry drawer, the payment drawer.

```ts
interface EditorState<T> {
  document: T | null;         // last server state
  version: number | null;     // optimistic-concurrency token (Part 22 §22.1)
  idempotencyKey: string | null;
  saving: boolean;
  issuing: boolean;
  warnings: ApiWarning[];
  error: ApiErrorShape | null;
}
```

Fixed conventions across all three:

- **`status` is a discriminated string union, never a pair of booleans.** `isLoading && isError` is an unrepresentable state that a union makes impossible. `'refreshing'` exists so a background refetch keeps the old rows on screen instead of flashing a skeleton.
- **`error` is the normalised `ApiErrorShape` (§19.4.4), never a raw string and never an Error object.** Errors must be serialisable — Redux state must survive `JSON.stringify` for the devtools and for the offline queue.
- **The slice name matches the file name matches the store key.** `partyListSlice.ts` → `createSlice({ name: 'partyList' })` → `store.partyList`. No exceptions; this is what makes a stack trace in production legible.
- **Selectors are co-located at the bottom of the slice file and exported by name.** `selectPartyRows`, `selectPartyListStatus`, `selectPartyTotals`. Components never write `useSelector((s) => s.partyList.rows)` inline.
- **Every slice that caches server data accepts the invalidation signal.** `acceptInvalidation('<storeKey>')(builder)` is the first line of its `extraReducers` (§19.3.6). A slice that holds server rows and does not accept it is a stale screen waiting to happen, and the registry test names it.
- **`initialState` is a `const` declared above the slice and reused by a `reset*` reducer.** Every list slice has `resetPartyList: () => initialState` so that a tenant switch or a logout can clear everything (§19.7.4).

### 19.3.3 Thunk anatomy

Every thunk is `createAsyncThunk` with three type arguments filled in — return type, argument type, and `{ rejectValue: ApiErrorShape }` — and a body that is exactly a `try` calling one service function and a `catch` calling `rejectWithValue(toApiError(error))`.

Forbidden inside a thunk: JSX, `window`, `document`, `dispatch(showSnackbar(...))`, direct axios calls, and business rules. A thunk that needs another thunk's result uses `await dispatch(other()).unwrap()` and lets failures propagate.

The action-type string is `'<sliceName>/<thunkName>'` — matching the slice that owns it — so that the devtools timeline reads as a sentence.

### 19.3.4 The complete triple: service, thunk, slice

This is the reference implementation for the party list (PTY-02). Every other list feature is a transliteration of these three files.

**`src/modules/UdhaarBook/features/parties/api/partyService.ts`**

```ts
import { api } from 'src/api/AxiosInstances';
import { API_PATHS } from 'src/api/APIPaths';
import { toQueryString } from 'src/utils/queryString';
import { camelizeKeys } from 'src/utils/caseMapper';
import type {
  Party,
  PartyListParams,
  PartyListResult,
  PartyApiRow,
} from '../types/party.types';

// ── Wire shapes (snake_case, exactly as Part 22 §22.4 documents them) ────────

interface PartyListApiResponse {
  readonly data: PartyApiRow[];
  readonly meta: {
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
    readonly total_pages: number;
    readonly totals: {
      readonly receivable: string;
      readonly payable: string;
      readonly count: number;
    };
  };
}

/**
 * Maps one wire row to the domain shape.
 *
 * Money stays a STRING here on purpose. `balance` is `numeric(14,2)` server-side
 * and turning it into a JS number at the boundary is how rounding bugs get in.
 * `UbAmount` and `view-model/*` parse with decimal.js-light when they need maths.
 */
const toParty = (row: PartyApiRow): Party => ({
  id: row.id,
  name: row.name,
  displayCode: row.display_code,
  mobile: row.mobile,
  isCustomer: row.is_customer,
  isSupplier: row.is_supplier,
  balance: row.balance,
  collectionDate: row.collection_date,
  creditLimit: row.credit_limit,
  tags: row.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
  lastActivityAt: row.last_activity_at,
  status: row.status,
});

/** GET /parties — list with server-side filtering, sorting and filtered-set totals. */
export const listParties = async (
  params: PartyListParams,
  signal?: AbortSignal
): Promise<PartyListResult> => {
  const query = toQueryString({
    q: params.q || undefined,
    type: params.type || undefined,
    balance: params.balance || undefined,
    status: params.status,
    tag: params.tags?.length ? params.tags.join(',') : undefined,
    collection: params.collection || undefined,
    ordering: params.ordering,
    page: params.page,
    page_size: params.pageSize,
  });

  const response = await api.get<PartyListApiResponse>(
    `${API_PATHS.PARTIES}${query}`,
    { signal }
  );

  return {
    rows: response.data.data.map(toParty),
    meta: {
      page: response.data.meta.page,
      pageSize: response.data.meta.page_size,
      total: response.data.meta.total,
      totalPages: response.data.meta.total_pages,
    },
    totals: {
      receivable: response.data.meta.totals.receivable,
      payable: response.data.meta.totals.payable,
      count: response.data.meta.totals.count,
    },
  };
};

/** GET /parties/{id} — party plus summary and recent entries. */
export const getParty = async (id: string): Promise<Party> => {
  const response = await api.get<{ data: PartyApiRow }>(API_PATHS.PARTY(id));
  return toParty(response.data.data);
};

/** POST /parties — create. Idempotency key supplied by the caller. */
export const createParty = async (
  body: CreatePartyBody,
  idempotencyKey: string
): Promise<Party> => {
  const response = await api.post<{ data: PartyApiRow }>(
    API_PATHS.PARTIES,
    snakeifyCreateBody(body),
    { headers: { 'Idempotency-Key': idempotencyKey } }
  );
  return toParty(response.data.data);
};

/** POST /parties/{id}/archive — 409 party_balance_nonzero is surfaced as ApiError. */
export const archiveParty = async (id: string): Promise<void> => {
  await api.post(API_PATHS.PARTY_ARCHIVE(id));
};

/** GET /parties?format=csv — returns a blob under 5k rows, else an export job id. */
export const exportParties = async (
  params: PartyListParams
): Promise<{ blob: Blob } | { exportId: string }> => {
  const query = toQueryString({ ...toWireParams(params), format: 'csv' });
  const response = await api.get(`${API_PATHS.PARTIES}${query}`, {
    responseType: 'blob',
  });
  if (response.status === 202) {
    const parsed = JSON.parse(await (response.data as Blob).text());
    return { exportId: parsed.data.export_id };
  }
  return { blob: response.data as Blob };
};
```

**`src/modules/UdhaarBook/features/parties/redux/partyListThunk.ts`**

```ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { toApiError } from 'src/utils/apiError';
import type { ApiErrorShape } from 'src/types/api.types';
import { listParties, exportParties } from '../api/partyService';
import type { PartyListParams, PartyListResult } from '../types/party.types';

export interface FetchPartyListArg {
  readonly params: PartyListParams;
  /** 'replace' repaints the list (desktop paging, filter change);
   *  'append' adds a page (mobile infinite scroll). */
  readonly mode: 'replace' | 'append';
}

export interface FetchPartyListResult extends PartyListResult {
  readonly mode: 'replace' | 'append';
}

export const fetchPartyList = createAsyncThunk<
  FetchPartyListResult,
  FetchPartyListArg,
  { rejectValue: ApiErrorShape }
>('partyList/fetchPartyList', async ({ params, mode }, { signal, rejectWithValue }) => {
  try {
    const result = await listParties(params, signal);
    return { ...result, mode };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.list.error.title'));
  }
});

export const exportPartyList = createAsyncThunk<
  { exportId: string | null },
  PartyListParams,
  { rejectValue: ApiErrorShape }
>('partyList/exportPartyList', async (params, { rejectWithValue }) => {
  try {
    const result = await exportParties(params);
    if ('blob' in result) {
      downloadBlob(result.blob, `parties-${todayStamp()}.csv`);
      return { exportId: null };
    }
    return { exportId: result.exportId };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.list.export.failed'));
  }
});
```

**`src/modules/UdhaarBook/features/parties/redux/partyListSlice.ts`**

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';
import type { Party, PartyListFilters } from '../types/party.types';
import { DEFAULT_PAGE_SIZE, SELECTION_CAP } from '../constants/partyListDefaults';
import { fetchPartyList } from './partyListThunk';
import { archivePartyThunk, restorePartyThunk } from './partyActionThunk';
import { saveParty } from './partyFormThunk';
import { postLedgerEntry } from 'modules/UdhaarBook/features/ledger/redux/ledgerEntryThunk';

export interface PartyListState {
  rows: Party[];
  meta: PageMeta;
  totals: { receivable: string; payable: string; count: number } | null;
  filters: PartyListFilters;
  status: RequestStatus;
  error: ApiErrorShape | null;
  selectedIds: string[];
  /** Set when a mutation elsewhere makes this list stale; the hook refetches on mount. */
  stale: boolean;
}

const initialFilters: PartyListFilters = {
  q: '',
  type: null,
  balance: null,
  status: 'active',
  tags: [],
  collection: null,
  ordering: '-last_activity_at',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

const initialState: PartyListState = {
  rows: [],
  meta: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 0 },
  totals: null,
  filters: initialFilters,
  // Start in 'loading' so the grid paints its skeleton on first render rather
  // than flashing an empty state before the first request resolves.
  status: 'loading',
  error: null,
  selectedIds: [],
  stale: false,
};

const partyListSlice = createSlice({
  name: 'partyList',
  initialState,
  reducers: {
    /** Any filter change resets pagination — shared UX rule 17.0.3. */
    filtersChanged(state, action: PayloadAction<Partial<PartyListFilters>>) {
      state.filters = { ...state.filters, ...action.payload, page: 1 };
      state.selectedIds = [];
    },
    pageChanged(state, action: PayloadAction<{ page: number; pageSize?: number }>) {
      state.filters.page = action.payload.page;
      if (action.payload.pageSize) state.filters.pageSize = action.payload.pageSize;
    },
    filtersCleared(state) {
      state.filters = { ...initialFilters, status: state.filters.status };
      state.selectedIds = [];
    },
    selectionChanged(state, action: PayloadAction<string[]>) {
      state.selectedIds = action.payload.slice(0, SELECTION_CAP);
    },
    /** Balance patched in place after a ledger entry, avoiding a full refetch. */
    balanceUpdated(state, action: PayloadAction<{ partyId: string; balance: string }>) {
      const row = state.rows.find((r) => r.id === action.payload.partyId);
      if (row) row.balance = action.payload.balance;
    },
    markStale(state) {
      state.stale = true;
    },
    resetPartyList: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPartyList.pending, (state, action) => {
        // A background refresh keeps rows visible; a replace shows the skeleton.
        state.status =
          action.meta.arg.mode === 'append' || state.rows.length > 0
            ? 'refreshing'
            : 'loading';
        state.error = null;
      })
      .addCase(fetchPartyList.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.rows =
          action.payload.mode === 'append'
            ? [...state.rows, ...action.payload.rows]
            : action.payload.rows;
        state.meta = action.payload.meta;
        state.totals = action.payload.totals;
        state.stale = false;
      })
      .addCase(fetchPartyList.rejected, (state, action) => {
        // An aborted request is a superseded keystroke, not a failure.
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = action.payload ?? null;
      })
      // ── Cross-feature invalidation (§19.3.6) ──────────────────────────────
      .addCase(postLedgerEntry.fulfilled, (state, action) => {
        const { partyId, partyBalance } = action.payload;
        const row = state.rows.find((r) => r.id === partyId);
        if (row) row.balance = partyBalance;
        // Totals are server aggregates over the filtered set — they cannot be
        // patched correctly on the client, so mark stale and let the hook refetch.
        state.stale = true;
      })
      .addCase(saveParty.fulfilled, (state) => {
        state.stale = true;
      })
      .addCase(archivePartyThunk.fulfilled, (state, action) => {
        state.rows = state.rows.filter((r) => r.id !== action.payload.partyId);
        state.stale = true;
      })
      .addCase(restorePartyThunk.fulfilled, (state) => {
        state.stale = true;
      });
  },
});

export const {
  filtersChanged,
  pageChanged,
  filtersCleared,
  selectionChanged,
  balanceUpdated,
  markStale,
  resetPartyList,
} = partyListSlice.actions;

export default partyListSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectPartyRows = (state: RootState) => state.partyList.rows;
export const selectPartyListMeta = (state: RootState) => state.partyList.meta;
export const selectPartyTotals = (state: RootState) => state.partyList.totals;
export const selectPartyFilters = (state: RootState) => state.partyList.filters;
export const selectPartyListStatus = (state: RootState) => state.partyList.status;
export const selectPartyListError = (state: RootState) => state.partyList.error;
export const selectPartySelection = (state: RootState) => state.partyList.selectedIds;
export const selectPartyListStale = (state: RootState) => state.partyList.stale;
```

And the hook that binds it to React — the only place a component touches any of this:

```ts
// src/modules/UdhaarBook/features/parties/hooks/usePartyList.ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from 'src/redux/store';
import { useDebounce } from 'src/hooks/useDebounce';
import {
  filtersChanged,
  filtersCleared,
  pageChanged,
  selectPartyFilters,
  selectPartyListError,
  selectPartyListStale,
  selectPartyListStatus,
  selectPartyRows,
  selectPartyListMeta,
  selectPartyTotals,
} from '../redux/partyListSlice';
import { fetchPartyList } from '../redux/partyListThunk';
import type { PartyListFilters } from '../types/party.types';

export function usePartyList(mode: 'replace' | 'append' = 'replace') {
  const dispatch = useDispatch<AppDispatch>();

  const rows = useSelector(selectPartyRows);
  const meta = useSelector(selectPartyListMeta);
  const totals = useSelector(selectPartyTotals);
  const filters = useSelector(selectPartyFilters);
  const status = useSelector(selectPartyListStatus);
  const error = useSelector(selectPartyListError);
  const stale = useSelector(selectPartyListStale);

  // The raw input is local; only the debounced value is committed to the slice,
  // so every keystroke does not produce a request or a store write.
  const [searchInput, setSearchInput] = useState(filters.q);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    const committed = debouncedSearch.trim();
    if (committed !== filters.q) dispatch(filtersChanged({ q: committed }));
  }, [debouncedSearch, filters.q, dispatch]);

  // One effect, one request. The promise is aborted when the filter set changes
  // mid-flight so a slow page 1 can never overwrite a fast page 2.
  useEffect(() => {
    const promise = dispatch(fetchPartyList({ params: filters, mode }));
    return () => promise.abort();
  }, [dispatch, filters, mode]);

  // A mutation elsewhere marked us stale — refetch once, silently.
  useEffect(() => {
    if (stale) dispatch(fetchPartyList({ params: filters, mode: 'replace' }));
  }, [stale, dispatch, filters]);

  const setFilters = useCallback(
    (patch: Partial<PartyListFilters>) => dispatch(filtersChanged(patch)),
    [dispatch]
  );
  const setPage = useCallback(
    (page: number, pageSize?: number) => dispatch(pageChanged({ page, pageSize })),
    [dispatch]
  );
  const clearFilters = useCallback(() => dispatch(filtersCleared()), [dispatch]);

  const activeFilterCount = useMemo(
    () =>
      [filters.q, filters.type, filters.balance, filters.collection].filter(Boolean)
        .length + filters.tags.length,
    [filters]
  );

  return {
    rows, meta, totals, filters, status, error,
    searchInput, setSearchInput,
    setFilters, setPage, clearFilters, activeFilterCount,
    isLoading: status === 'loading',
    isRefreshing: status === 'refreshing',
  };
}
```

### 19.3.5 Normalisation policy

**UdhaarBook does not normalise entities into an `entities`/`ids` graph, with two exceptions.** `createEntityAdapter` is not used for list slices.

The reasoning: normalisation pays for itself when the same entity appears in many places and must stay consistent. In UdhaarBook the lists are *server-filtered, server-sorted and server-aggregated*; a normalised store would still need the server's ordering and its filtered totals, so the id array plus a lookup table buys nothing but indirection. Every list refetch replaces the rows wholesale, and targeted patches (a balance after a ledger entry) are one `find` on an array of at most 100 rows.

The two exceptions, where entities genuinely appear in multiple views at once:

1. **Ledger entries** (`ledgerEntrySlice`), which are cursor-paginated per party and appear in the party timeline, the day book and the statement. Shape: `{ byParty: Record<partyId, { ids: string[]; cursor: string | null; hasMore: boolean }>, entities: Record<entryId, LedgerEntry> }`. This is specified by LED-01 §14 and is normative.
2. **Detail caches** (Shape B above), which are keyed by id so that navigating party → invoice → back to party does not refetch.

Items in the invoice editor are *not* normalised: a line snapshots the item's name, HSN, price and tax code at the moment it is added (SAL-02 FR-15), so it is deliberately decoupled from the item master.

### 19.3.6 Cache invalidation without TanStack Query

This is the section that replaces what a query library would have given us. Because we do not have one, the rules must be written down, and they are enforced by the `extraReducers` blocks shown above.

**The three mechanisms, in order of preference:**

1. **Patch in place** when the mutation's response contains the authoritative new value for a field already on screen. Example: `postLedgerEntry.fulfilled` carries `meta.party_balance`; `partyListSlice` and `partyDetailSlice` both write it straight into the row. No request. This is what makes the ledger feel instant.
2. **Mark stale** when the mutation invalidates something the client cannot recompute — server aggregates, orderings, derived statuses, pagination. The slice sets `stale = true`; the feature hook sees it on its next render and refetches once. This is a *deferred* refetch: a list that is not mounted costs nothing.
3. **Refetch immediately** only when the user is looking at the thing that changed and a patch is impossible. Example: issuing an invoice from the invoice detail page refetches that invoice, because status, number, amount_due, payments and PDF state all changed at once.

**The invalidation map is code, not a table.** The previous version of this section was a thirteen-row table with the instruction "when you add a mutation, you add a row here". Thirteen rows against seventy-four features is an 18 %-complete rule enforced by memory, and three of its rows named slices that do not exist. A forgotten row is a merchant looking at a balance that "did not update", which is the one bug this product cannot afford. So the map is a typed module that **fails to compile** when a mutation has no entry or names a slice that does not exist, and a test that **fails CI** when a mutating thunk is not in the registry at all.

Four files, in `src/redux/invalidation/`:

```ts
// ── types.ts ────────────────────────────────────────────────────────────────
import type { RootState } from 'src/redux/store';
import type { TMutationName } from './registry';

/** Every key of the store, and nothing else. A typo does not compile. */
export type TSliceKey = keyof RootState;

/** [slice, the field this mutation's own extraReducers writes in place] */
export type TPatch = readonly [slice: TSliceKey, field: string];

export interface TInvalidationEntry {
  /** Documented and asserted; applied by the named slice's extraReducers (§19.3.2). */
  readonly patch?: readonly TPatch[];
  /** Refetch on next mount. The default and the cheap one. */
  readonly stale?: readonly TSliceKey[];
  /** Refetch now if mounted — only when the user is looking at what changed. */
  readonly refetch?: readonly TSliceKey[];
  /** Tenant switch only. */
  readonly resetAll?: true;
}

export type TInvalidationMap = Readonly<Record<TMutationName, TInvalidationEntry>>;
```

```ts
// ── registry.ts ─────────────────────────────────────────────────────────────
// Every async thunk in the codebase is registered exactly once, as a QUERY or a
// MUTATION. This is what makes completeness checkable rather than remembered.
export const MUTATIONS = {
  // parties
  saveParty, archiveParty, restoreParty, mergeParties, savePartyTag, deletePartyTag,
  commitImportJob, cancelImportJob,
  // ledger
  postLedgerEntry, postOpeningBalance, correctLedgerEntry, reverseLedgerEntry,
  writeOffBalance, saveReminder, sendReminder, snoozeReminder,
  // sales
  saveInvoiceDraft, issueInvoice, voidInvoice, saveEstimate, convertEstimate,
  issueCreditNote, voidCreditNote, applyCreditNote,
  // purchases
  savePurchaseBillDraft, recordPurchaseBill, voidPurchaseBill, recordGoodsReceipt,
  voidGoodsReceipt,
  // payments
  recordPayment, voidPayment, matchPayment, ignoreUnmatchedPayment, recordSupplierPayment,
  // inventory
  saveItem, archiveItem, postStockAdjustment, saveCategory, saveUnit, bulkPriceUpdate,
  // expenses
  saveExpense, voidExpense, saveExpenseCategory, saveRecurringExpense,
  confirmRecurringOccurrence,
  // platform & settings
  saveTenantSettings, saveBranding, saveMembership, inviteMember, revokeMembership,
  createShareLink, revokeShareLink, switchTenant,
} as const;

export type TMutationName = keyof typeof MUTATIONS;
```

```ts
// ── map.ts ──────────────────────────────────────────────────────────────────
import type { TInvalidationMap } from './types';

/**
 * The single normative statement of what a mutation invalidates.
 * `Record<TMutationName, …>` is total: adding a thunk to MUTATIONS without an
 * entry here is a TypeScript error, not a code-review miss.
 */
export const INVALIDATION: TInvalidationMap = {
  // ── parties ───────────────────────────────────────────────────────────────
  saveParty:        { patch: [['partyDetail', 'byId[id]']],
                      stale: ['partyList', 'partySearchCache'] },
  archiveParty:     { patch: [['partyList', 'rows (remove)']],
                      stale: ['partyList', 'partySearchCache', 'dashboard', 'ledgerAging'] },
  restoreParty:     { patch: [['partyList', 'rows (insert)']],
                      stale: ['partyList', 'partySearchCache', 'dashboard', 'ledgerAging'] },
  mergeParties:     { stale: ['partyList', 'partySearchCache', 'partyStatement', 'dashboard',
                              'ledgerAging', 'reminderList'],
                      refetch: ['partyDetail', 'ledgerEntry'] },
  savePartyTag:     { stale: ['partyTag', 'partyList'] },
  deletePartyTag:   { stale: ['partyTag', 'partyList'] },
  commitImportJob:  { stale: ['partyList', 'partySearchCache', 'itemList', 'itemSearchCache',
                              'ledgerEntry', 'partyStatement', 'dashboard', 'ledgerAging',
                              'stockSummary', 'lowStock', 'reminderList'],
                      refetch: ['importJob'] },
  cancelImportJob:  { refetch: ['importJob'] },

  // ── ledger ────────────────────────────────────────────────────────────────
  postLedgerEntry:  { patch: [['partyList', 'rows[].balance'],
                              ['partyDetail', 'balance'],
                              ['ledgerEntry', 'byParty[partyId] (prepend)']],
                      stale: ['partyList', 'partyStatement', 'dashboard', 'cashbook',
                              'dayBook', 'ledgerAging', 'reminderList'] },
  postOpeningBalance: { patch: [['partyDetail', 'balance']],
                      stale: ['partyList', 'partyStatement', 'dashboard', 'ledgerAging'],
                      refetch: ['ledgerEntry'] },
  correctLedgerEntry: { patch: [['partyDetail', 'balance']],
                      stale: ['partyList', 'partyStatement', 'dashboard', 'cashbook',
                              'dayBook', 'ledgerAging', 'reminderList'],
                      refetch: ['ledgerEntry'] },
  reverseLedgerEntry: { patch: [['partyDetail', 'balance']],
                      stale: ['partyList', 'partyStatement', 'dashboard', 'cashbook',
                              'dayBook', 'ledgerAging', 'reminderList'],
                      refetch: ['ledgerEntry'] },
  writeOffBalance:  { patch: [['partyDetail', 'balance']],
                      stale: ['partyList', 'partyStatement', 'dashboard', 'ledgerAging',
                              'reminderList', 'profitReport'],
                      refetch: ['ledgerEntry'] },
  saveReminder:     { stale: ['reminderList', 'dashboard'] },
  sendReminder:     { patch: [['reminderList', 'rows[].status']], stale: ['dashboard'] },
  snoozeReminder:   { patch: [['reminderList', 'rows[].dueOn']], stale: ['dashboard'] },

  // ── sales ─────────────────────────────────────────────────────────────────
  saveInvoiceDraft: { patch: [['invoiceEditor', 'document, version']], stale: ['invoiceList'] },
  issueInvoice:     { patch: [['invoiceEditor', 'document']],
                      stale: ['invoiceList', 'partyList', 'partyStatement', 'dashboard',
                              'itemList', 'itemSearchCache', 'stockSummary', 'lowStock',
                              'ledgerAging', 'dayBook', 'cashbook', 'salesReport',
                              'gstReport', 'stockReport', 'profitReport', 'staffReport'],
                      refetch: ['invoiceDetail', 'ledgerEntry'] },
  voidInvoice:      { patch: [['invoiceDetail', 'status']],
                      stale: ['invoiceList', 'paymentList', 'partyList', 'partyStatement',
                              'dashboard', 'itemList', 'stockSummary', 'lowStock',
                              'ledgerAging', 'dayBook', 'cashbook', 'salesReport',
                              'gstReport', 'stockReport', 'profitReport', 'staffReport'],
                      refetch: ['invoiceDetail', 'ledgerEntry'] },
  saveEstimate:     { stale: ['estimateList'] },
  convertEstimate:  { patch: [['estimateList', 'rows[].status']],
                      stale: ['invoiceList', 'estimateList'],
                      refetch: ['invoiceEditor'] },
  issueCreditNote:  { stale: ['creditNote', 'invoiceList', 'partyList', 'partyStatement',
                              'dashboard', 'itemList', 'stockSummary', 'ledgerAging',
                              'salesReport', 'gstReport', 'stockReport', 'profitReport'],
                      refetch: ['invoiceDetail', 'ledgerEntry'] },
  voidCreditNote:   { stale: ['creditNote', 'partyList', 'partyStatement', 'dashboard',
                              'ledgerAging', 'gstReport', 'salesReport', 'profitReport'],
                      refetch: ['ledgerEntry'] },
  applyCreditNote:  { patch: [['invoiceDetail', 'amountDue, status']],
                      stale: ['creditNote', 'invoiceList', 'partyList', 'partyStatement',
                              'dashboard', 'ledgerAging'],
                      refetch: ['ledgerEntry'] },

  // ── purchases ─────────────────────────────────────────────────────────────
  savePurchaseBillDraft: { patch: [['purchaseBillEditor', 'document, version']],
                      stale: ['purchaseBillList'] },
  recordPurchaseBill: { stale: ['purchaseBillList', 'partyList', 'partyStatement', 'dashboard',
                              'itemList', 'itemSearchCache', 'stockSummary', 'lowStock',
                              'ledgerAging', 'dayBook', 'cashbook', 'stockReport',
                              'gstReport', 'profitReport'],
                      refetch: ['purchaseBillDetail', 'ledgerEntry'] },
  voidPurchaseBill: { patch: [['purchaseBillDetail', 'status']],
                      stale: ['purchaseBillList', 'partyList', 'partyStatement', 'dashboard',
                              'itemList', 'stockSummary', 'lowStock', 'ledgerAging',
                              'dayBook', 'cashbook', 'stockReport', 'gstReport',
                              'profitReport'],
                      refetch: ['purchaseBillDetail', 'ledgerEntry'] },
  recordGoodsReceipt: { stale: ['purchaseBillList', 'itemList', 'stockSummary', 'lowStock',
                              'stockReport'],
                      refetch: ['purchaseBillDetail'] },
  voidGoodsReceipt: { stale: ['purchaseBillList', 'itemList', 'stockSummary', 'lowStock',
                              'stockReport'],
                      refetch: ['purchaseBillDetail'] },

  // ── payments ──────────────────────────────────────────────────────────────
  recordPayment:    { patch: [['invoiceDetail', 'amountDue, status'],
                              ['partyDetail', 'balance'],
                              ['partyList', 'rows[].balance']],
                      stale: ['paymentList', 'invoiceList', 'partyList', 'partyStatement',
                              'dashboard', 'cashbook', 'dayBook', 'ledgerAging',
                              'reminderList', 'staffReport'],
                      refetch: ['ledgerEntry'] },
  voidPayment:      { patch: [['paymentDetail', 'status']],
                      stale: ['paymentList', 'invoiceList', 'partyList', 'partyStatement',
                              'dashboard', 'cashbook', 'dayBook', 'ledgerAging',
                              'unmatchedPayments', 'staffReport'],
                      refetch: ['ledgerEntry', 'invoiceDetail'] },
  matchPayment:     { patch: [['unmatchedPayments', 'rows (remove)']],
                      stale: ['paymentList', 'invoiceList', 'partyList', 'partyStatement',
                              'dashboard', 'cashbook', 'ledgerAging'],
                      refetch: ['ledgerEntry'] },
  ignoreUnmatchedPayment: { patch: [['unmatchedPayments', 'rows[].status']],
                      stale: ['dashboard'] },
  recordSupplierPayment: { patch: [['partyDetail', 'balance'], ['partyList', 'rows[].balance']],
                      stale: ['paymentList', 'purchaseBillList', 'partyList', 'partyStatement',
                              'dashboard', 'cashbook', 'dayBook', 'ledgerAging'],
                      refetch: ['ledgerEntry'] },

  // ── inventory ─────────────────────────────────────────────────────────────
  saveItem:         { patch: [['itemDetail', 'byId[id]']],
                      stale: ['itemList', 'itemSearchCache', 'stockSummary', 'lowStock'] },
  archiveItem:      { patch: [['itemList', 'rows (remove)']],
                      stale: ['itemList', 'itemSearchCache', 'stockSummary', 'lowStock',
                              'stockReport'] },
  postStockAdjustment: { stale: ['itemList', 'stockSummary', 'lowStock', 'dashboard',
                              'stockReport', 'profitReport'],
                      refetch: ['itemDetail'] },
  saveCategory:     { stale: ['categoryList', 'itemList', 'stockReport'] },
  saveUnit:         { stale: ['unitList', 'itemList'] },
  bulkPriceUpdate:  { stale: ['itemList', 'itemSearchCache', 'stockSummary', 'stockReport'] },

  // ── expenses ──────────────────────────────────────────────────────────────
  saveExpense:      { stale: ['expenseList', 'dashboard', 'cashbook', 'dayBook',
                              'profitReport', 'gstReport', 'partyList', 'partyStatement'],
                      refetch: ['ledgerEntry'] },
  voidExpense:      { patch: [['expenseList', 'rows[].status']],
                      stale: ['expenseList', 'dashboard', 'cashbook', 'dayBook',
                              'profitReport', 'gstReport', 'partyList', 'partyStatement'],
                      refetch: ['ledgerEntry'] },
  saveExpenseCategory: { stale: ['expenseCategory', 'expenseList', 'profitReport'] },
  saveRecurringExpense: { stale: ['recurringExpense', 'dashboard'] },
  confirmRecurringOccurrence: { patch: [['recurringExpense', 'rows[].status']],
                      stale: ['expenseList', 'dashboard', 'cashbook', 'profitReport'] },

  // ── platform & settings ───────────────────────────────────────────────────
  // Settings change numbering, due days and tax defaults, so every editor's
  // defaults and every document preview are wrong until refetched.
  saveTenantSettings: { patch: [['tenantSettings', 'settings, version']],
                      stale: ['invoiceEditor', 'purchaseBillEditor', 'partyList', 'itemList',
                              'reminderList', 'dashboard', 'taxRate', 'gstReport'] },
  saveBranding:     { patch: [['whiteLabel', 'branding']], stale: ['tenantSettings'] },
  // A role change rewrites every view-model's action list and the sidebar.
  saveMembership:   { patch: [['memberList', 'rows[].role']],
                      stale: ['memberList'], refetch: ['session'] },
  inviteMember:     { stale: ['memberList'] },
  revokeMembership: { patch: [['memberList', 'rows (remove)']],
                      stale: ['memberList'], refetch: ['session'] },
  createShareLink:  { stale: ['shareLink'] },
  revokeShareLink:  { patch: [['shareLink', 'rows[].status']], stale: ['shareLink'] },
  switchTenant:     { resetAll: true },
};
```

**The slices this map names all exist.** The three dangling references of the old table are resolved by defining the slices, not by deleting the rows: `partyStatement` (`LED-04`, the statement screen, its own cursor-paginated slice), `partySearchCache` and `itemSearchCache` (the `UbAsyncCombobox` result caches, keyed by query string with a 5-minute TTL — they are what make the invoice editor's party and item pickers instant, and they are exactly what goes stale when a party is renamed), and the report slices, which are named individually — `dashboard`, `dayBook`, `cashbook`, `salesReport`, `gstReport`, `stockReport`, `staffReport`, `profitReport`, `exportHistory` — rather than by the `reports.*` wildcard the old table used, because a wildcard cannot be type-checked and invalidating nine report slices when one changed is how a dashboard on a 2 GB phone becomes slow.

**One listener applies it.** No slice imports another slice's reducer (R-RX-8); the listener dispatches one shared action and every slice that cares reacts to it in its own `extraReducers`:

```ts
// ── listener.ts ─────────────────────────────────────────────────────────────
import { createListenerMiddleware, createAction, isAsyncThunkAction } from '@reduxjs/toolkit';
import { MUTATIONS } from './registry';
import { INVALIDATION } from './map';
import { resetAllFeatureState } from 'src/redux/actions';
import type { TSliceKey } from './types';

/** The one cross-slice invalidation signal. */
export const cacheInvalidated = createAction<{
  readonly slices: readonly TSliceKey[];
  readonly urgency: 'now' | 'next-mount';
}>('cache/invalidated');

const FULFILLED = new Map(
  Object.entries(MUTATIONS).map(([name, thunk]) => [thunk.fulfilled.type, name] as const),
);

export const invalidationListener = createListenerMiddleware();

invalidationListener.startListening({
  predicate: (action) => FULFILLED.has(action.type),
  effect: (action, api) => {
    const entry = INVALIDATION[FULFILLED.get(action.type)!];
    if (entry.resetAll) { api.dispatch(resetAllFeatureState()); return; }
    // `patch` is applied by the owning slice's own extraReducers on this same
    // action — it is declared here so the map is the complete statement, and
    // asserted by the test below. The listener only signals the other two.
    if (entry.stale?.length)   api.dispatch(cacheInvalidated({ slices: entry.stale,   urgency: 'next-mount' }));
    if (entry.refetch?.length) api.dispatch(cacheInvalidated({ slices: entry.refetch, urgency: 'now' }));
  },
});
```

Every list or detail slice accepts the signal through one helper, so the slice author writes one line rather than a switch:

```ts
// src/redux/invalidation/acceptInvalidation.ts
export interface TStaleState { stale: boolean; staleUrgency: 'now' | 'next-mount' | null; }

export function acceptInvalidation<S extends TStaleState>(key: TSliceKey) {
  return (builder: ActionReducerMapBuilder<S>) =>
    builder.addCase(cacheInvalidated, (state, action) => {
      if (!action.payload.slices.includes(key)) return;
      state.stale = true;
      // 'now' wins over a pending 'next-mount'
      if (action.payload.urgency === 'now' || state.staleUrgency === null) {
        state.staleUrgency = action.payload.urgency;
      }
    });
}

// in partyListSlice.ts
extraReducers: (builder) => {
  acceptInvalidation('partyList')(builder);
  builder.addCase(postLedgerEntry.fulfilled, (s, a) => { /* the patch, in place */ });
  …
}
```

The list hook then does the only two things staleness can mean: `staleUrgency === 'now'` refetches immediately if the slice is mounted; `'next-mount'` refetches on the next mount with unchanged filters (§19.3.6's mount-time policy below).

**Completeness is enforced in three places, and two of them are automatic.**

1. **Compile time — a missing entry.** `INVALIDATION: Record<TMutationName, TInvalidationEntry>` is total. Adding `voidDebitNote` to `MUTATIONS` without an entry is `error TS2741: Property 'voidDebitNote' is missing`. The build stops; nobody has to notice.
2. **Compile time — a slice that does not exist.** `TSliceKey = keyof RootState`, so `'reports.*'`, `'partyStatment'` or a slice someone renamed is `error TS2322` at the map's own line.
3. **CI — a thunk that never reached the registry.** `src/tests/invalidation.registry.test.ts` parses every `src/modules/UdhaarBook/features/**/redux/*Thunk.ts` with the TypeScript compiler API, collects every `createAsyncThunk(` call, and asserts that each one appears in exactly one of `QUERIES` or `MUTATIONS`. A thunk in neither fails with the file, the line and the message "register this thunk in QUERIES or MUTATIONS; if it mutates, add its INVALIDATION entry". This is the one an engineer can otherwise route around, and it is the one that catches the fourteenth feature.

```ts
// src/tests/invalidation.map.test.ts — the runtime half
it.each(Object.entries(INVALIDATION))('%s declares something', (name, entry) => {
  expect(entry.resetAll || entry.patch?.length || entry.stale?.length || entry.refetch?.length)
    .toBeTruthy();                                   // an empty entry is a forgotten entry
});

it.each(allPatchTargets(INVALIDATION))(
  '%s patches %s in place', (mutation, sliceKey) => {
    const reducer = REDUCERS[sliceKey];
    const before = reducer(undefined, { type: '@@init' });
    const after  = reducer(before, fulfilledFixture(mutation));
    expect(after).not.toEqual(before);                // the declared patch is real
  });

it.each(allSliceKeys(INVALIDATION))('%s is a real store key', (key) => {
  expect(Object.keys(store.getState())).toContain(key);
});
```

Part 25 R-RX-9 is the review rule that points here, and Part 28 owns the tests' place in the pipeline. The cost of this machinery is about 120 lines plus one entry per mutation; the cost of not having it is the bug the merchant reports as "the balance did not update", found in month six, in a screen nobody changed.

**Staleness by age.** In addition to event-driven invalidation, three slices carry a time-to-live because their data drifts without any local mutation:

| Slice | TTL | Behaviour on expiry |
|---|---|---|
| `dashboardSlice` | 60 s | Refetch on mount if `Date.now() - lastFetchedAt > 60_000`; server also caches ≤ 60 s (Part 22 §22.11) |
| `taxRateSlice` | 24 h | Refetch on mount past midnight local; never during an edit |
| `sessionSlice` (`/auth/me`) | On tab focus after 5 min away, and on every `ver` claim change | Refetch permissions; a change in `ver` forces a re-read (Part 22 §22.2) |

Everything else has no TTL. A list is refetched when it is mounted with different filters, when it is stale, or when the user pulls to refresh.

**Mount-time refetch policy.** A list hook refetches on mount *unless* the slice is `succeeded`, not `stale`, and the filters are unchanged. In practice this means: Back from a detail page shows the cached list instantly and does not flash; a filter change always refetches.

### 19.3.7 Optimistic updates

Optimistic updates are used in exactly three places, and nowhere else. The rule: **optimism is for writes the user will repeat quickly and whose failure is recoverable without data loss.**

1. **Ledger entries** (LED-01 FR-12). On `pending`, a row is prepended to the timeline with `clientId = idempotencyKey`, `status: 'saving'`. On `fulfilled`, the row is replaced by the server entry matched on `clientId`. On `rejected`, the row turns amber with `status: 'failed'` and a Retry action that re-dispatches with **the same idempotency key**, so a slow first request that eventually lands cannot double-post (BR-8).
2. **Tab switches on lists.** The active tab flips immediately and the skeleton shows; the URL is updated in the same tick. This is optimism about navigation, not about data.
3. **Reminder mark-as-done and notification mark-as-read.** Both are trivially reversible toggles.

Everything financial and irreversible — issuing an invoice, recording a payment, voiding, posting a stock adjustment — is **pessimistic**: the button shows a spinner and the label "Saving…", the form is disabled, and nothing changes on screen until the server confirms. A shopkeeper must never be told an invoice exists when it does not.

Optimism and the network state are not the same axis, and §19.10.3 is the authority on the second. The ledger entry is optimistic in **all three** network states: the row appears at once and carries its own status (`saving` → posted, or `queued`, or `failed`). The pessimistic writes stay pessimistic in `online` and `degraded`, and in confirmed `offline` they are **disabled** rather than faked, because none of them can be replayed safely (§19.10.4's never-queue list). A queued row is never styled as a saved row: it carries the `queued` treatment of §19.10.3, which says "waiting for signal", not "saved".

The optimistic row shape is uniform so `UbTimeline` can render it generically:

```ts
type OptimisticStatus = 'saving' | 'failed';

interface OptimisticRow<T> {
  readonly clientId: string;       // === the idempotency key
  readonly optimistic: OptimisticStatus;
  readonly data: T;
}
```

### 19.3.8 Selectors and memoisation

- **Every `useSelector` call selects the smallest thing that changes.** `useSelector(selectPartyRows)` and `useSelector(selectPartyTotals)` as two calls, never one selector returning `{ rows, totals }` — an object literal is a new reference every time and re-renders on every store action.
- **Derived selectors that build new objects or arrays use `createSelector`** from RTK. They live at the bottom of the slice file next to the plain selectors.
- **Parameterised selectors are factory functions** returning a memoised selector, and the component memoises the factory call: `const selector = useMemo(() => selectEntriesForParty(partyId), [partyId]);`.
- **`shallowEqual` is not used** to work around a badly shaped selector. Fix the selector instead.

```ts
// Correct: a derived selector, memoised once, at the bottom of the slice.
export const selectOverdueReminderCount = createSelector(
  [selectReminderRows],
  (rows) => rows.filter((r) => r.status === 'scheduled' && isPast(r.dueOn)).length
);

// Correct: parameterised selector factory (LED-01 §14 normative shape).
export const selectEntriesForParty = (partyId: string) =>
  createSelector(
    [(s: RootState) => s.ledgerEntry.byParty[partyId], (s: RootState) => s.ledgerEntry.entities],
    (bucket, entities) => ({
      entries: (bucket?.ids ?? []).map((id) => entities[id]).filter(Boolean),
      hasMore: bucket?.hasMore ?? false,
      cursor: bucket?.cursor ?? null,
    })
  );
```

### 19.3.9 The store

`src/redux/store.ts` is a flat `configureStore` with one key per slice, alphabetised within feature groups and commented by module — exactly BrandHub's arrangement. There is no `combineReducers` nesting, no dynamic reducer injection and no persistence middleware at MVP.

```ts
import { configureStore } from '@reduxjs/toolkit';

// ── Cross-cutting ────────────────────────────────────────────────────────────
import snackbarReducer from './slice/snackbarSlice';
import sessionReducer from './slice/sessionSlice';
import whiteLabelReducer from './slice/whiteLabelSlice';
import localeReducer from './slice/localeSlice';
import themeReducer from './slice/themeSlice';
import networkReducer from './slice/networkSlice';
import offlineQueueReducer from './slice/offlineQueueSlice';
import { invalidationListener } from './invalidation/listener';

// ── parties ──────────────────────────────────────────────────────────────────
import partyListReducer from 'modules/UdhaarBook/features/parties/redux/partyListSlice';
import partyDetailReducer from 'modules/UdhaarBook/features/parties/redux/partyDetailSlice';
import partyFormReducer from 'modules/UdhaarBook/features/parties/redux/partyFormSlice';
import partyTagReducer from 'modules/UdhaarBook/features/parties/redux/partyTagSlice';

// ── ledger ───────────────────────────────────────────────────────────────────
import ledgerEntryReducer from 'modules/UdhaarBook/features/ledger/redux/ledgerEntrySlice';
import ledgerSummaryReducer from 'modules/UdhaarBook/features/ledger/redux/ledgerSummarySlice';
import ledgerAgingReducer from 'modules/UdhaarBook/features/ledger/redux/ledgerAgingSlice';
import reminderListReducer from 'modules/UdhaarBook/features/ledger/redux/reminderListSlice';
// … inventory, sales, purchases, payments, expenses, reports, settings, notifications

export const store = configureStore({
  reducer: {
    snackbar: snackbarReducer,
    session: sessionReducer,
    whiteLabel: whiteLabelReducer,
    locale: localeReducer,
    theme: themeReducer,
    network: networkReducer,
    offlineQueue: offlineQueueReducer,

    partyList: partyListReducer,
    partyDetail: partyDetailReducer,
    partyForm: partyFormReducer,
    partyTag: partyTagReducer,

    ledgerEntry: ledgerEntryReducer,
    ledgerSummary: ledgerSummaryReducer,
    ledgerAging: ledgerAgingReducer,
    reminderList: reminderListReducer,
    // …
  },
  middleware: (getDefault) =>
    getDefault({
      // Money is strings, dates are ISO strings, errors are plain objects.
      // Nothing non-serialisable may enter the store; keep this check ON.
      serializableCheck: true,
      immutableCheck: process.env.NODE_ENV !== 'production',
    }).prepend(invalidationListener.middleware),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;
```

Two deliberate absences: **no `redux-persist`** (the store is rebuilt from the API on load; the only persisted things are the auth cookies, the locale, the theme, a few `localStorage` UI preferences and the outbox in IndexedDB, §19.10.4), and **no hand-written middleware**. The one listener registered above is RTK's own `createListenerMiddleware` carrying the invalidation map of §19.3.6; it exists because without it every mutation would have to know every slice it touches. Logging is the devtools' job; toasts are the component's job.

---

## 19.4 The API layer

### 19.4.1 One instance, not eleven

BrandHub has eleven Axios instances because it talks to eleven microservices. UdhaarBook talks to one modular monolith (ADR-007) at one base URL, so it has **one** instance, exported as `api`. A second instance, `publicApi`, exists solely for the unauthenticated public document routes; it carries no auth interceptor and no refresh logic.

**`src/api/AxiosInstances.ts`** — the complete file, abbreviated only where a helper is defined elsewhere.

```ts
import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from 'src/constants';
import { API_PATHS } from './APIPaths';
import { newRequestId } from 'src/utils/requestId';
import { readCsrfToken } from 'src/utils/cookieUtils';
import { toApiError } from 'src/utils/apiError';
import { store } from 'src/redux/store';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { sessionExpired } from 'src/redux/slice/sessionSlice';

/** Requests that must never be retried after a refresh, or that carry no auth. */
const AUTH_FREE_PATHS = [
  API_PATHS.AUTH_LOGIN,
  API_PATHS.AUTH_OTP_REQUEST,
  API_PATHS.AUTH_OTP_VERIFY,
  API_PATHS.AUTH_REFRESH,
  API_PATHS.SYSTEM_HEALTH,
];

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  // The browser session is cookie-based (Part 22 §22.1): ub_access and
  // ub_refresh are httpOnly, so JS never reads them — it only sends them.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export const publicApi: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  withCredentials: false,
  headers: { Accept: 'application/json' },
});
```

### 19.4.2 Request interceptors

Four things are stamped onto every outgoing request. Each is one concern and each is commented with the spec clause it implements.

```ts
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // 1. Request id — echoed by the server in every response and every error,
  //    surfaced to the user on error screens (Part 22 §22.1 "Tracing").
  const requestId = newRequestId();
  config.headers.set('X-Request-Id', requestId);
  (config as RequestMetaCarrier).meta = { requestId, startedAt: Date.now() };

  // 2. CSRF double-submit for the cookie session (Part 22 §22.1 "Auth transport").
  //    The access token itself is httpOnly and is attached by the browser.
  if (config.method && config.method.toLowerCase() !== 'get') {
    const csrf = readCsrfToken();
    if (csrf) config.headers.set('X-CSRF-Token', csrf);
  }

  // 3. Locale — drives server-side message localisation (Accept-Language).
  config.headers.set('Accept-Language', store.getState().locale.current);

  // 4. Idempotency key — required on every POST that creates a document,
  //    payment or ledger entry (canon §0.11 rule 5, Part 22 §22.1).
  //    The CALLER supplies it so that a retry reuses the same key; this
  //    interceptor only fills one in when the caller forgot and the path
  //    is on the mandatory list, which is a bug-catching backstop, not a
  //    substitute for the caller minting one.
  if (
    config.method?.toLowerCase() === 'post' &&
    requiresIdempotency(config.url) &&
    !config.headers.has('Idempotency-Key')
  ) {
    config.headers.set('Idempotency-Key', crypto.randomUUID());
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[api] POST ${config.url} needs an Idempotency-Key from its caller; ` +
          'one was generated, which means a retry will double-post.'
      );
    }
  }

  return config;
});
```

The tenant is **not** sent as a header. Part 22 §22.1 is explicit: `X-Tenant-Id` is not trusted; the active tenant is the `tid` claim inside the token. Switching tenant means asking `/auth/switch-tenant` for a new token, not changing a header. Any code that sends a tenant header is a security defect.

### 19.4.3 The refresh-on-401 single-flight queue

The hardest part of the transport layer, and the one most often written wrong. Requirements:

- A 401 on any request triggers **one** refresh, not one per in-flight request.
- Every request that 401'd while the refresh was in flight is replayed after it succeeds, in its original order.
- If the refresh fails, every queued request is rejected with the same session-expired error, the session slice is cleared, and the user lands on `/login?next=<path>` once.
- `/auth/refresh` itself never triggers a refresh (no recursion).
- A request that 401s *after* a successful refresh — i.e. a genuine permission problem returning 401 rather than 403 — is not retried a second time.

```ts
let refreshPromise: Promise<void> | null = null;
const pendingQueue: Array<{
  resolve: () => void;
  reject: (reason: unknown) => void;
}> = [];

const flushQueue = (error: unknown | null) => {
  while (pendingQueue.length) {
    const entry = pendingQueue.shift();
    if (!entry) break;
    if (error) entry.reject(error);
    else entry.resolve();
  }
};

const runRefresh = (): Promise<void> => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = api
    .post(API_PATHS.AUTH_REFRESH, null, { _skipAuthRetry: true } as never)
    .then(() => {
      flushQueue(null);
    })
    .catch((error) => {
      flushQueue(error);
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;

    // Aborted requests are superseded keystrokes, never errors.
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const isRefreshable =
      status === 401 &&
      config &&
      !config._skipAuthRetry &&
      !config._retried &&
      !AUTH_FREE_PATHS.some((p) => config.url?.startsWith(p));

    if (isRefreshable) {
      config._retried = true;
      try {
        // Join the single in-flight refresh, or start it.
        const waiter = new Promise<void>((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        });
        void runRefresh();
        await waiter;
        return api.request(config);
      } catch {
        // Refresh failed — the session is genuinely over.
        store.dispatch(sessionExpired());
        redirectToLoginOnce();
        return Promise.reject(toApiError(error));
      }
    }

    const apiError = toApiError(error);

    // Global failure surfacing (§19.12.2). A call opts out when it renders the
    // message itself — e.g. a 409 credit_limit_exceeded shown inline in a drawer.
    if (!config?.suppressErrorSnackbar && shouldToast(apiError)) {
      store.dispatch(
        showSnackbar({ severity: 'error', message: apiError.message, requestId: apiError.requestId })
      );
    }

    return Promise.reject(apiError);
  }
);
```

`shouldToast` suppresses the global toast for the error classes that always have a better local presentation: `validation_error` (field-level errors), `credit_limit_exceeded`, `insufficient_stock`, `stale_version`, `document_not_draft`, `idempotency_conflict`. Every other failure toasts, so nothing is ever silent.

### 19.4.4 Error normalisation: `ApiError`

Everything above the transport layer sees exactly one error shape. `src/utils/apiError.ts` is the only place that knows what an `AxiosError` looks like.

```ts
// src/types/api.types.ts
export type ApiErrorCode =
  | 'validation_error' | 'not_found' | 'permission_denied' | 'module_disabled'
  | 'plan_limit_reached' | 'party_balance_nonzero' | 'party_archived'
  | 'insufficient_stock' | 'document_not_draft' | 'document_already_void'
  | 'credit_limit_exceeded' | 'duplicate_supplier_invoice' | 'otp_invalid'
  | 'otp_throttled' | 'idempotency_conflict' | 'stale_version'
  // transport-level codes minted on the client, never sent by the server:
  | 'network_error' | 'timeout' | 'offline' | 'unknown';

export interface ApiErrorShape {
  /** Stable machine code — switch on this, never on the message. */
  readonly code: ApiErrorCode;
  /** Human message; already localised by the server via Accept-Language. */
  readonly message: string;
  /** Field errors for 400s: { field_name: [messages] }. */
  readonly details: Readonly<Record<string, readonly string[]>>;
  /** Echo of X-Request-Id — shown to the user on error screens. */
  readonly requestId: string | null;
  readonly status: number | null;
  /** Non-fatal server notes returned alongside a 2xx (e.g. credit-limit warn). */
  readonly warnings: readonly ApiWarning[];
}
```

```ts
// src/utils/apiError.ts
import axios, { type AxiosError } from 'axios';
import type { ApiErrorCode, ApiErrorShape } from 'src/types/api.types';

const EMPTY_DETAILS: Record<string, readonly string[]> = Object.freeze({});

export const toApiError = (error: unknown, fallbackMessageId = 'error.generic'): ApiErrorShape => {
  if (isApiErrorShape(error)) return error;            // already normalised

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ServerErrorEnvelope>;
    const requestId =
      (axiosError.response?.headers?.['x-request-id'] as string | undefined) ??
      axiosError.response?.data?.error?.request_id ??
      null;

    if (!axiosError.response) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      return freeze({
        code: offline ? 'offline' : axiosError.code === 'ECONNABORTED' ? 'timeout' : 'network_error',
        message: offline ? 'You are offline. We will retry when you are back.' : 'Could not reach the server.',
        details: EMPTY_DETAILS,
        requestId,
        status: null,
        warnings: [],
      });
    }

    const body = axiosError.response.data?.error;
    return freeze({
      code: (body?.code as ApiErrorCode) ?? mapStatusToCode(axiosError.response.status),
      message: body?.message ?? defaultMessageFor(axiosError.response.status),
      details: (body?.details as Record<string, string[]>) ?? EMPTY_DETAILS,
      requestId,
      status: axiosError.response.status,
      warnings: [],
    });
  }

  return freeze({
    code: 'unknown',
    message: error instanceof Error ? error.message : String(error),
    details: EMPTY_DETAILS,
    requestId: null,
    status: null,
    warnings: [],
  });
};
```

Rules that follow:

- **Code, never message.** `if (error.code === 'credit_limit_exceeded')`. Never `if (error.message.includes('limit'))` — the message is localised and will be Hindi half the time.
- **`details` feeds `setError` on the form** (§19.5.6), mapping snake_case field names back to camelCase RHF paths.
- **`requestId` is rendered on every error state** that is not a field error, as `ds-mono` caption text with a copy button, because it is the only thing that connects a user's screenshot to a backend log line (Part 22 §22.1, ADR-018).

### 19.4.5 `APIPaths.ts`

One object, grouped by module, mirroring Part 22 §22 exactly. Static paths are string constants; parameterised paths are arrow functions. Nothing else lives in this file — no base URLs beyond the export from `src/constants.ts`, no query building, no helpers.

```ts
// src/api/APIPaths.ts
export const API_PATHS = {
  // ── auth ──────────────────────────────────────────────────────────────────
  AUTH_OTP_REQUEST: '/auth/otp/request',
  AUTH_OTP_VERIFY: '/auth/otp/verify',
  AUTH_LOGIN: '/auth/login',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_ME: '/auth/me',
  AUTH_SWITCH_TENANT: '/auth/switch-tenant',
  AUTH_PASSWORD_SET: '/auth/password/set',
  AUTH_PASSWORD_RESET_REQUEST: '/auth/password/reset/request',
  AUTH_PASSWORD_RESET_CONFIRM: '/auth/password/reset/confirm',

  // ── platform ──────────────────────────────────────────────────────────────
  TENANT_CURRENT: '/tenants/current',
  TENANT_SETTINGS: '/tenants/current/settings',
  TENANT_BRANDING: '/tenants/current/branding',
  MEMBERSHIPS: '/memberships',
  MEMBERSHIP: (id: string) => `/memberships/${id}`,
  MEMBERSHIP_INVITE: '/memberships/invite',
  PERMISSIONS_ME: '/permissions/me',
  AUDIT_LOGS: '/audit-logs',

  // ── parties ───────────────────────────────────────────────────────────────
  PARTIES: '/parties',
  PARTY: (id: string) => `/parties/${id}`,
  PARTY_ARCHIVE: (id: string) => `/parties/${id}/archive`,
  PARTY_RESTORE: (id: string) => `/parties/${id}/restore`,
  PARTY_STATEMENT: (id: string) => `/parties/${id}/statement`,
  PARTY_LEDGER_ENTRIES: (id: string) => `/parties/${id}/ledger-entries`,
  PARTY_SHARE_LINKS: (id: string) => `/parties/${id}/share-links`,

  // ── ledger ────────────────────────────────────────────────────────────────
  LEDGER_ENTRIES: '/ledger-entries',
  LEDGER_ENTRY: (id: string) => `/ledger-entries/${id}`,
  LEDGER_ENTRY_REVERSE: (id: string) => `/ledger-entries/${id}/reverse`,
  LEDGER_ENTRY_CORRECT: (id: string) => `/ledger-entries/${id}/correct`,
  LEDGER_SUMMARY: '/ledger/summary',
  LEDGER_AGING: '/ledger/aging',
  REMINDERS: '/reminders',
  REMINDER: (id: string) => `/reminders/${id}`,
  REMINDER_SEND: (id: string) => `/reminders/${id}/send`,
  REMINDERS_BULK: '/reminders/bulk',

  // ── inventory ─────────────────────────────────────────────────────────────
  ITEMS: '/items',
  ITEM: (id: string) => `/items/${id}`,
  ITEM_MOVEMENTS: (id: string) => `/items/${id}/movements`,
  ITEM_LOOKUP: '/items/lookup',
  CATEGORIES: '/categories',
  UNITS: '/units',
  STOCK_ADJUSTMENTS: '/stock-adjustments',
  STOCK_SUMMARY: '/stock/summary',
  STOCK_LOW: '/stock/low',

  // ── sales ─────────────────────────────────────────────────────────────────
  SALES_INVOICES: '/sales/invoices',
  SALES_INVOICE: (id: string) => `/sales/invoices/${id}`,
  SALES_INVOICE_ISSUE: (id: string) => `/sales/invoices/${id}/issue`,
  SALES_INVOICE_VOID: (id: string) => `/sales/invoices/${id}/void`,
  SALES_INVOICE_SHARE_LINKS: (id: string) => `/sales/invoices/${id}/share-links`,
  SALES_INVOICE_UPI_INTENT: (id: string) => `/sales/invoices/${id}/upi-intent`,
  SALES_ESTIMATES: '/sales/estimates',
  SALES_ESTIMATE_CONVERT: (id: string) => `/sales/estimates/${id}/convert`,
  SALES_CREDIT_NOTES: '/sales/credit-notes',

  // ── purchases, payments, expenses, reports, misc ──────────────────────────
  PURCHASE_BILLS: '/purchases/bills',
  PURCHASE_BILL_RECORD: (id: string) => `/purchases/bills/${id}/record`,
  PAYMENTS: '/payments',
  PAYMENT_VOID: (id: string) => `/payments/${id}/void`,
  PAYMENTS_UPI_INTENT: '/payments/upi-intent',
  PAYMENTS_QR: '/payments/qr.svg',
  EXPENSES: '/expenses',
  EXPENSE_CATEGORIES: '/expense-categories',
  REPORT_DASHBOARD: '/reports/dashboard',
  REPORT_DAY_BOOK: '/reports/day-book',
  REPORT_SALES_REGISTER: '/reports/sales-register',
  REPORT_GST_SUMMARY: '/reports/gst-summary',
  REPORT_STOCK_SUMMARY: '/reports/stock-summary',
  REPORT_RECEIVABLES_AGING: '/reports/receivables-aging',
  REPORT_EXPORT: (id: string) => `/reports/exports/${id}`,
  NOTIFICATIONS: '/notifications',
  NOTIFICATION_READ: (id: string) => `/notifications/${id}/read`,
  ATTACHMENTS: '/attachments',
  IMPORTS: '/imports',
  IMPORT: (id: string) => `/imports/${id}`,
  IMPORT_COMMIT: (id: string) => `/imports/${id}/commit`,
  TAX_RATES: '/taxes/rates',
  TAX_HSN: '/taxes/hsn',
  SYSTEM_HEALTH: '/system/health',
  PUBLIC_DOCUMENT: (token: string) => `/public/d/${token}`,
} as const;

/** POSTs that must carry an Idempotency-Key (canon §0.11 rule 5). */
export const IDEMPOTENT_POST_PATHS: readonly string[] = [
  API_PATHS.LEDGER_ENTRIES,
  API_PATHS.SALES_INVOICES,
  API_PATHS.SALES_ESTIMATES,
  API_PATHS.SALES_CREDIT_NOTES,
  API_PATHS.PURCHASE_BILLS,
  API_PATHS.PAYMENTS,
  API_PATHS.STOCK_ADJUSTMENTS,
  API_PATHS.EXPENSES,
  API_PATHS.PARTIES,
];
```

### 19.4.6 Pagination helpers

Part 22 defines two pagination styles and the client must handle both without each feature reinventing them. `src/types/api.types.ts` declares the two meta shapes and `src/utils/pagination.ts` provides the two readers.

```ts
export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface CursorMeta {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
```

- **Page pagination** is used by every list (`/parties`, `/items`, `/sales/invoices`, `/payments`, …). Desktop renders `UbDataGrid`'s pagination footer; mobile appends pages behind an `IntersectionObserver` sentinel with a "Load more" fallback (PTY-02 FR-8). The same slice serves both — the `mode: 'replace' | 'append'` thunk argument is the switch.
- **Cursor pagination** is used by ledger entries, stock movements and notifications, where new rows arrive at the head and offset paging would skip or duplicate. The slice stores `cursor` and `hasMore` per bucket; "Load older" dispatches with the stored cursor; a new entry prepended optimistically does **not** invalidate the cursor.

### 19.4.7 Retry policy

Automatic retry is **off** by default. Financial writes must not be silently retried by the transport layer, and read failures are better handled by a visible Retry button than by a hidden delay.

Three narrow exceptions, all implemented in the service (not the interceptor), all explicit at the call site:

| Case | Policy |
|---|---|
| Idempotent GETs that back a background poll (`GET /reports/exports/{id}`, `GET /imports/{id}`) | Poll every 2 s, backing off ×1.5 to a 15 s ceiling, giving up after 3 minutes with a "still working" message |
| Network-class failures (`network_error`, `timeout`) on a **GET** | One automatic retry after 800 ms, then surface the error with a Retry action |
| Queued writes (§19.10.4) | Handed to the outbox and replayed on reconnect, with the original idempotency key, one at a time, never automatically retried in-flight |

Everything else fails once, loudly, with a Retry the user chooses to press.

---

## 19.5 Forms

### 19.5.1 The stack, and why it is exactly this

React Hook Form for state, Yup for schemas, `@hookform/resolvers/yup` to bind them, one central `useValidationSchemas()` hook for every reusable validator (ADR-003). No Formik, no Zod, no per-component ad-hoc validation.

The central hook is the part most likely to be re-invented badly, so its contract is stated first: **`useValidationSchemas()` returns validator *factories*, not schemas.** Each factory returns a fresh Yup schema whose messages are already translated through `useTranslation()`. Features compose those factories into a screen schema inside their own `validation/*Schemas.ts` hook. A raw `Yup.string().required('Name is required')` anywhere in a feature is a defect: the message is untranslated and the rule is unshared.

### 19.5.2 `src/hooks/useValidationSchemas.ts`

```ts
'use client';

import { useMemo } from 'react';
import * as Yup from 'yup';
import dayjs from 'dayjs';
import { useTranslation } from 'src/hooks/useTranslation';
import { REGEX } from 'src/utils/regexConstants';
import { MAX_AMOUNT, MAX_QTY } from 'src/constants';

/**
 * The single source of truth for field-level validation across the app.
 *
 * Every validator is a FACTORY so a caller can chain on it
 * (`v.amountValidation().max(limit, msg)`) without mutating a shared schema.
 * Messages come from `t()`, so a schema built under `hi` produces Hindi errors.
 */
export const useValidationSchemas = () => {
  const { t } = useTranslation();

  return useMemo(() => {
    // ── Primitives ──────────────────────────────────────────────────────────

    /** Optional string that normalises '' → null so `.notRequired()` behaves. */
    const optionalText = (max = 255) =>
      Yup.string()
        .nullable()
        .transform((value) => (typeof value === 'string' && value.trim() === '' ? null : value))
        .max(max, t('validation.maxChars', { value: max }));

    /** Money: a decimal STRING with ≤ 2 dp, > 0 unless allowZero. */
    const amountValidation = (options?: { allowZero?: boolean; max?: string }) =>
      Yup.string()
        .required(t('validation.amount.required'))
        .matches(REGEX.DECIMAL_2DP, t('validation.amount.format'))
        .test('positive', t('validation.amount.positive'), (value) => {
          if (!value) return false;
          const n = Number(value);
          return options?.allowZero ? n >= 0 : n > 0;
        })
        .test('max', t('validation.amount.tooLarge'), (value) =>
          value ? Number(value) <= Number(options?.max ?? MAX_AMOUNT) : true
        );

    /** Quantity: decimal STRING with ≤ 3 dp; integer-only when the unit says so. */
    const quantityValidation = (allowDecimal = true) =>
      Yup.string()
        .required(t('validation.qty.required'))
        .matches(
          allowDecimal ? REGEX.DECIMAL_3DP : REGEX.INTEGER,
          allowDecimal ? t('validation.qty.format') : t('validation.qty.wholeOnly')
        )
        .test('positive', t('validation.qty.positive'), (v) => Number(v) > 0)
        .test('max', t('validation.qty.tooLarge'), (v) => Number(v) <= MAX_QTY);

    const percentValidation = (max = 100) =>
      Yup.number()
        .typeError(t('validation.percent.format'))
        .min(0, t('validation.percent.min'))
        .max(max, t('validation.percent.max', { value: max }));

    /** Indian mobile: E.164 with +91 default; exactly 10 digits after the code. */
    const mobileValidation = (required = true) => {
      const base = Yup.string()
        .transform((v) => (typeof v === 'string' ? v.replace(/\s|-/g, '') : v))
        .matches(REGEX.MOBILE_E164_IN, t('validation.mobile.format'));
      return required ? base.required(t('validation.mobile.required')) : base.nullable().notRequired();
    };

    /** GSTIN: 15 chars, statutory layout, checksum verified. */
    const gstinValidation = (required = false) => {
      const base = Yup.string()
        .transform((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v))
        .length(15, t('validation.gstin.length'))
        .matches(REGEX.GSTIN, t('validation.gstin.format'))
        .test('checksum', t('validation.gstin.checksum'), (v) => !v || isValidGstinChecksum(v));
      return required ? base.required(t('validation.gstin.required')) : base.nullable().notRequired();
    };

    const panValidation = () =>
      Yup.string().nullable().notRequired()
        .transform((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v))
        .matches(REGEX.PAN, t('validation.pan.format'));

    const hsnValidation = () =>
      Yup.string().nullable().notRequired()
        .matches(REGEX.HSN, t('validation.hsn.format'));

    const pincodeValidation = (required = false) => {
      const base = Yup.string().matches(REGEX.PINCODE_IN, t('validation.pincode.format'));
      return required ? base.required(t('validation.pincode.required')) : base.nullable().notRequired();
    };

    /** Business date: ISO yyyy-mm-dd, not in the future unless allowFuture. */
    const businessDateValidation = (options?: { allowFuture?: boolean; minDate?: string }) =>
      Yup.string()
        .required(t('validation.date.required'))
        .test('valid', t('validation.date.invalid'), (v) => !!v && dayjs(v, 'YYYY-MM-DD', true).isValid())
        .test('notFuture', t('validation.date.future'), (v) =>
          options?.allowFuture ? true : !!v && !dayjs(v).isAfter(dayjs(), 'day')
        )
        .test('min', t('validation.date.tooOld'), (v) =>
          !options?.minDate || (!!v && !dayjs(v).isBefore(dayjs(options.minDate), 'day'))
        );

    const nameValidation = (min = 2, max = 120) =>
      Yup.string().trim()
        .required(t('validation.name.required'))
        .min(min, t('validation.name.tooShort', { value: min }))
        .max(max, t('validation.name.tooLong', { value: max }));

    const noteValidation = (max = 255) => optionalText(max);
    const referenceValidation = (max = 64) => optionalText(max);
    const uuidValidation = (required = true) => {
      const base = Yup.string().matches(REGEX.UUID, t('validation.id.format'));
      return required ? base.required(t('validation.id.required')) : base.nullable().notRequired();
    };
    const emailValidation = (required = false) => {
      const base = Yup.string().trim().email(t('validation.email.format')).max(254);
      return required ? base.required(t('validation.email.required')) : base.nullable().notRequired();
    };
    const enumValidation = <T extends string>(values: readonly T[], messageId: string) =>
      Yup.mixed<T>().oneOf([...values], t(messageId)).required(t(messageId));

    return {
      optionalText, amountValidation, quantityValidation, percentValidation,
      mobileValidation, gstinValidation, panValidation, hsnValidation,
      pincodeValidation, businessDateValidation, nameValidation, noteValidation,
      referenceValidation, uuidValidation, emailValidation, enumValidation,
    };
  }, [t]);
};

/** Runs a schema and returns its own message, or undefined when valid.
 *  Used where a boolean `isValidSync` is not enough — e.g. disabling a button
 *  while still telling the user why. Keeps one source of truth for the copy. */
export const getYupErrorMessage = (schema: Yup.AnySchema, value: unknown): string | undefined => {
  try {
    schema.validateSync(value);
    return undefined;
  } catch (error) {
    if (error instanceof Yup.ValidationError) return error.message;
    throw error;
  }
};
```

### 19.5.3 Feature schemas compose the central validators

A feature never writes primitive rules. It composes. Here is the real multi-schema example for the ledger entry drawer (LED-01 §10) and the invoice editor (SAL-02), showing conditional and cross-field rules.

```ts
// features/ledger/validation/ledgerSchemas.ts
'use client';

import { useMemo } from 'react';
import * as Yup from 'yup';
import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import { PAYMENT_MODES } from '../constants/paymentModes';

export const useLedgerSchemas = () => {
  const { t } = useTranslation();
  const v = useValidationSchemas();

  return useMemo(() => {
    /** LED-01: amount, date, direction, conditional payment mode + reference. */
    const ledgerEntrySchema = Yup.object({
      partyId: v.uuidValidation(),
      direction: v.enumValidation(['debit', 'credit'] as const, 'validation.direction.required'),
      amount: v.amountValidation(),
      entryDate: v.businessDateValidation({ minDate: '2000-01-01' }),
      note: v.noteValidation(255),
      // Required only for "You got" — debit entries never carry a mode (BR-7).
      paymentMode: Yup.string().when('direction', {
        is: 'credit',
        then: () => v.enumValidation(PAYMENT_MODES, 'ledger.entry.modeRequired'),
        otherwise: (s) => s.nullable().notRequired(),
      }),
      // Only meaningful for non-cash modes; still length-checked when present.
      reference: Yup.string().when(['direction', 'paymentMode'], {
        is: (dir: string, mode: string) =>
          dir === 'credit' && ['upi', 'bank', 'cheque', 'card'].includes(mode),
        then: () => v.referenceValidation(64),
        otherwise: (s) => s.nullable().notRequired(),
      }),
      attachmentId: v.uuidValidation(false),
    });

    /** LED-03: a correction must state a reason. */
    const ledgerCorrectionSchema = ledgerEntrySchema.shape({
      reason: Yup.string().trim().required(t('ledger.correct.reasonRequired')).min(3).max(255),
    });

    /** LED-02: opening balance — future dates allowed for as_of? No: as-of is a
     *  business date and may not be in the future. */
    const openingBalanceSchema = Yup.object({
      amount: v.amountValidation({ allowZero: true }),
      direction: v.enumValidation(['debit', 'credit'] as const, 'validation.direction.required'),
      asOf: v.businessDateValidation(),
    });

    /** LED-06: reminder composer. */
    const reminderSchema = Yup.object({
      partyId: v.uuidValidation(),
      dueOn: v.businessDateValidation({ allowFuture: true }),
      channel: v.enumValidation(['whatsapp_manual', 'sms', 'in_app'] as const, 'ledger.reminder.channelRequired'),
      note: v.noteValidation(255),
    });

    return { ledgerEntrySchema, ledgerCorrectionSchema, openingBalanceSchema, reminderSchema };
  }, [v, t]);
};
```

```ts
// features/sales/validation/invoiceSchemas.ts — the line array and cross-field rules
export const useInvoiceSchemas = (gstType: GstType) => {
  const { t } = useTranslation();
  const v = useValidationSchemas();

  return useMemo(() => {
    const lineSchema = Yup.object({
      itemId: v.uuidValidation(false),
      description: v.nameValidation(1, 240),
      hsnSac: v.hsnValidation(),
      qty: v.quantityValidation(true),
      unitCode: Yup.string().required(t('sales.line.unitRequired')),
      unitPrice: v.amountValidation({ allowZero: true }),
      taxInclusive: Yup.boolean().default(false),
      discountType: Yup.mixed<'percent' | 'amount'>().oneOf(['percent', 'amount']).nullable(),
      discountValue: Yup.string().when('discountType', {
        is: 'percent',
        then: () => Yup.string().test('pct', t('sales.line.discountPercentRange'),
          (x) => x == null || (Number(x) >= 0 && Number(x) <= 100)),
        otherwise: () => v.amountValidation({ allowZero: true }),
      }),
      // A tax code is mandatory for regular tenants and forbidden for
      // unregistered ones — the tenant's GST type decides, not the user.
      taxCode: gstType === 'regular'
        ? Yup.string().required(t('sales.line.taxRequired'))
        : Yup.string().nullable().notRequired(),
    });

    const invoiceSchema = Yup.object({
      partyId: v.uuidValidation(false),
      walkInName: Yup.string().when('partyId', {
        is: (id: string | null) => !id,
        then: () => v.nameValidation(2, 120),
        otherwise: (s) => s.nullable().notRequired(),
      }),
      walkInMobile: v.mobileValidation(false),
      documentDate: v.businessDateValidation({ minDate: startOfPreviousFy() }),
      dueOn: Yup.string().nullable()
        .test('after-doc-date', t('sales.dueBeforeDate'), function (value) {
          if (!value) return true;
          return !dayjs(value).isBefore(dayjs(this.parent.documentDate), 'day');
        }),
      placeOfSupplyState: gstType === 'unregistered'
        ? Yup.string().nullable()
        : Yup.string().required(t('sales.posRequired')),
      reverseCharge: Yup.boolean().default(false),
      lines: Yup.array(lineSchema)
        .min(1, t('sales.atLeastOneLine'))
        .max(200, t('sales.tooManyLines')),
      documentDiscountType: Yup.mixed<'percent' | 'amount'>().nullable(),
      documentDiscountValue: v.amountValidation({ allowZero: true }).nullable(),
      notes: v.optionalText(1000),
      terms: v.optionalText(2000),
    });

    const paymentSheetSchema = Yup.object({
      modeBreakup: Yup.array(
        Yup.object({
          mode: v.enumValidation(PAYMENT_MODES, 'payments.modeRequired'),
          amount: v.amountValidation(),
          reference: v.referenceValidation(64),
        })
      ).min(1),
    }).test('sum-matches', t('payments.sumExceedsTotal'), function (value) {
      const total = sumDecimalStrings((value?.modeBreakup ?? []).map((m) => m.amount));
      return lte(total, this.options.context?.grandTotal ?? '0');
    });

    return { invoiceSchema, lineSchema, paymentSheetSchema };
  }, [v, t, gstType]);
};
```

Note the two cross-field techniques used: `Yup.when` for conditional requirement, and `.test()` with `this.parent` / `this.options.context` for comparisons between fields. Both are used in preference to validating in `onSubmit`, because a rule that lives in the schema produces a field-anchored error message for free.

### 19.5.4 `UbForm` and `UbField` anatomy

```tsx
// src/design-system/UbForm/UbForm.tsx
'use client';

import { memo } from 'react';
import { FormProvider, type UseFormReturn, type FieldValues } from 'react-hook-form';
import { cn } from 'src/utils/cn';

export interface UbFormProps<T extends FieldValues> {
  readonly form: UseFormReturn<T>;
  readonly onSubmit: (values: T) => void | Promise<void>;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly id?: string;
}

function UbFormBase<T extends FieldValues>({
  form, onSubmit, children, className, id,
}: Readonly<UbFormProps<T>>) {
  return (
    <FormProvider {...form}>
      <form
        id={id}
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('flex w-full flex-col gap-4', className)}
      >
        {children}
      </form>
    </FormProvider>
  );
}
UbFormBase.displayName = 'UbForm';
export const UbForm = memo(UbFormBase) as typeof UbFormBase;
```

`UbField` is the field anatomy every input uses: a `ds-label` label (12.5 px, sentence case, locale-aware — Part 23 §23.2.2, **not** the old 11 px uppercase tier, which no Hindi string can render), the control, an optional hint, and the error message rendered in `--form-error` (Part 23 §23.2.4). It reads the error from RHF context by `name`, so a caller never wires `errors.x?.message` by hand.

```tsx
// src/design-system/UbField/UbField.tsx (abridged)
export interface UbFieldProps {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly required?: boolean;
  readonly children: (field: UbFieldRenderProps) => React.ReactNode;
  readonly className?: string;
}

function UbFieldBase({ name, label, hint, required, children, className }: Readonly<UbFieldProps>) {
  const { control, formState } = useFormContext();
  const error = getFieldError(formState.errors, name);
  const describedBy = [hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={name} className="ds-label text-text-tertiary">
        {label}
        {required && <span aria-hidden className="ml-0.5 text-error">*</span>}
      </label>
      <Controller
        control={control}
        name={name}
        render={({ field }) =>
          children({
            ...field,
            id: name,
            'aria-invalid': Boolean(error),
            'aria-describedby': describedBy || undefined,
            invalid: Boolean(error),
          })
        }
      />
      {hint && !error && <UbInputHint id={`${name}-hint`}>{hint}</UbInputHint>}
      {error && <UbFieldError id={`${name}-error`}>{error}</UbFieldError>}
    </div>
  );
}
```

Usage is uniformly declarative and the caller writes no error plumbing:

```tsx
<UbField name="amount" label={t('ledger.entry.amount')} required>
  {(field) => <UbMoneyInput {...field} autoFocus inputMode="decimal" />}
</UbField>

<UbField name="entryDate" label={t('ledger.entry.date')} required>
  {(field) => <UbDateInput {...field} maxDate={todayInTenantTz} quickChips />}
</UbField>
```

### 19.5.5 Field arrays: the document line editor

`UbLineItemsEditor` is driven by RHF's `useFieldArray`. Three rules make it fast enough for a billing counter on a cheap phone:

1. **Rows are `memo`ised and keyed by RHF's `field.id`**, never by array index — index keys break every reorder and every delete.
2. **Each editable cell is its own `Controller`.** A row does not re-render because a sibling row changed, and the whole array does not re-render because one cell changed.
3. **Totals are computed from a `useWatch` on `lines` only**, funnelled through one memoised `taxEngine.compute()` call, and rendered in the totals panel. The watch is scoped to `lines`; watching the whole form would recompute on every keystroke in the notes field.

```tsx
// features/sales/hooks/useInvoiceLines.ts (abridged)
export function useInvoiceLines(form: UseFormReturn<InvoiceFormValues>) {
  const { fields, append, remove, update, move } = useFieldArray({
    control: form.control,
    name: 'lines',
    keyName: 'rowKey',           // never 'id' — 'id' is the item's own field
  });

  const addItem = useCallback(
    (item: ItemSearchResult) => {
      // FR-15: item defaults are snapshotted at insert time and never refreshed.
      append({
        itemId: item.id,
        description: item.name,
        hsnSac: item.hsnSac,
        qty: '1',
        unitCode: item.unitCode,
        unitPrice: item.sellingPrice,
        taxInclusive: item.priceIncludesTax,
        discountType: null,
        discountValue: null,
        taxCode: item.taxCode,
      });
      // Focus the new row's Qty cell (SAL-02 keyboard map: Enter in search → Qty).
      queueMicrotask(() => focusCell(fields.length, 'qty'));
    },
    [append, fields.length]
  );

  return { fields, addItem, remove, update, move };
}
```

```tsx
// features/sales/hooks/useInvoiceTotals.ts
export function useInvoiceTotals(control: Control<InvoiceFormValues>, context: TaxContext) {
  const lines = useWatch({ control, name: 'lines' });
  const documentDiscountType = useWatch({ control, name: 'documentDiscountType' });
  const documentDiscountValue = useWatch({ control, name: 'documentDiscountValue' });
  const roundOffEnabled = useWatch({ control, name: 'roundOffEnabled' });

  return useMemo(
    () => computeDocumentTotals({ lines, documentDiscountType, documentDiscountValue, roundOffEnabled }, context),
    [lines, documentDiscountType, documentDiscountValue, roundOffEnabled, context]
  );
}
```

These totals are **a preview only**. The server recomputes every figure on save and on issue (canon §0.11 rule 3; SAL-02 BR-16 step 6). When the server's totals differ from the preview on a draft save, the slice's totals replace the preview and, if the grand total moved, a `UbStatusBanner` says "Totals updated by the server" — a divergence is a bug that must be visible, not silently papered over.

### 19.5.6 Server errors mapped back onto fields

A 400 `validation_error` returns `details: { "entry_date": ["Date cannot be in the future"] }` in snake_case. The form must anchor those on the right RHF fields. One shared helper does it for every form.

```ts
// src/utils/applyServerErrors.ts
import type { UseFormSetError, FieldValues, Path } from 'react-hook-form';
import type { ApiErrorShape } from 'src/types/api.types';
import { snakeToCamelPath } from 'src/utils/caseMapper';

/**
 * Maps `error.details` onto RHF fields.
 * Returns the messages that could NOT be anchored to a field so the caller can
 * show them at form level — nothing from the server is ever dropped silently.
 */
export function applyServerErrors<T extends FieldValues>(
  error: ApiErrorShape,
  setError: UseFormSetError<T>,
  knownFields: readonly string[]
): string[] {
  const unanchored: string[] = [];

  Object.entries(error.details).forEach(([wireField, messages]) => {
    const message = messages.join(' ');
    if (wireField === 'non_field_errors') {
      unanchored.push(message);
      return;
    }
    // "lines.2.qty" → "lines.2.qty"; "entry_date" → "entryDate"
    const path = snakeToCamelPath(wireField);
    if (knownFields.includes(rootOf(path))) {
      setError(path as Path<T>, { type: 'server', message }, { shouldFocus: true });
    } else {
      unanchored.push(`${humanise(wireField)}: ${message}`);
    }
  });

  return unanchored;
}
```

Usage in a hook:

```ts
const submit = async (values: LedgerEntryFormValues) => {
  try {
    await dispatch(postLedgerEntry({ ...values, idempotencyKey })).unwrap();
    dispatch(showSnackbar({ severity: 'success', id: 'ledger.entry.saved', params: { balance } }));
    onSaved();
  } catch (error) {
    const apiError = error as ApiErrorShape;
    if (apiError.code === 'validation_error') {
      const leftovers = applyServerErrors(apiError, form.setError, LEDGER_ENTRY_FIELDS);
      setFormLevelErrors(leftovers);
      return;
    }
    if (apiError.code === 'credit_limit_exceeded') {
      setCreditLimitBlock(apiError.details);   // rendered inline as an MLAlert
      return;
    }
    // Anything else was already toasted by the transport layer (§19.4.3).
  }
};
```

`shouldFocus: true` means the first server-rejected field is focused and scrolled into view — on a 360 px screen with a keyboard up, that is the difference between a fixable error and an abandoned form.

### 19.5.7 Dirty-state guards and draft autosave

**Dirty guard.** Any form that can lose work guards navigation with `useUnsavedChangesGuard(isDirty)`. It handles three exits: the browser `beforeunload`, an in-app `router.push` (intercepted by wrapping the navigation in a confirm), and the drawer/dialog close button (Esc twice, per SAL-02 §7). The confirm is a `UbConfirmDialog` with "Discard changes?" / "Keep editing".

```ts
// src/hooks/useUnsavedChangesGuard.ts (abridged)
export function useUnsavedChangesGuard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);

  return useCallback(
    async (navigate: () => void) => {
      if (!enabled || (await confirmDiscard())) navigate();
    },
    [enabled]
  );
}
```

**Autosave** applies to documents only (invoices, estimates, credit notes, purchase bills) and has two tiers:

| Tier | Trigger | Destination | Purpose |
|---|---|---|---|
| **Local snapshot** | Every change, debounced 500 ms | `localStorage['ub.sales.draft.<tenantId>.<draftUuid>']` | Survive a tab crash or an accidental close; restored by `InvoiceDraftRestorePrompt` on reopen (SAL-02 §5) |
| **Server draft** | Idle 3 s after a change, and on every blur of the party or date field, and on `Ctrl+S` | `POST/PATCH /sales/invoices` (draft) | Survive a device change; give the draft a number-less id so lines can be attached |

Autosave never runs while the document is `issuing`, never runs when the form is invalid in a way that the server would reject with a 400 (it runs `schema.isValid` first), and never blocks typing: the "Draft saved 12:41" stamp in the header updates from the slice, and a failed autosave downgrades to local-only with a quiet `ds-caption` "Saved on this device only".

Local snapshots are cleared when the document is issued, when the draft is deleted, and when they are older than 7 days (swept on app start). The key includes the tenant id so that switching businesses never surfaces another business's draft.

---

## 19.6 Routing and navigation

### 19.6.1 Route groups and layouts

Four route groups, each owning one layout, as listed in §19.2.2.

| Group | Layout | Contains |
|---|---|---|
| `(auth)` | Centred card on canvas, brand mark, locale switcher, no shell | login, OTP, password set/reset, onboarding wizard |
| `(app)` | `UbAppShell`: sidebar (≥ 1024 px) + header + content + `UbBottomNav` (< 1024 px) + `UbSnackbar` host + `UbFab` slot | every authenticated screen |
| `(public)` | Bare, server-rendered, brandable header from the share token | `/d/[token]` document view and its print variant |
| `(internal)` | Bare + gallery chrome | `/design-system` component gallery |

`app/(app)/layout.tsx` is a client component that renders the shell and one guard:

```tsx
'use client';

import { UbAppShell } from 'modules/UdhaarBook/components/layout';
import { RequireSession } from 'modules/UdhaarBook/features/auth/components/RequireSession';

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireSession>
      <UbAppShell>{children}</UbAppShell>
    </RequireSession>
  );
}
```

There is no per-module layout nesting. A layout that exists only to add a page title is a defect; titles belong to `UbPageHeader` inside the page content.

### 19.6.2 The entitlement-driven `sidebarConfig`

Navigation is data, not markup. `src/modules/UdhaarBook/features/navigation/sidebarConfig.ts` maps a **module code** (canon §0.3) to its presentation, and `useNavigation()` intersects that config with the tenant's `enabled_modules` and the user's permissions from `sessionSlice`. A module the tenant has not enabled, or that the user cannot read, simply does not exist in the menu — it is never rendered disabled.

```ts
// features/navigation/sidebarConfig.ts
import {
  BarChart3, BookUser, Boxes, CreditCard, FileText, Receipt,
  Settings, ShoppingCart, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

export type NavSection = 'daily' | 'business' | 'insight' | 'account';

export interface NavItemConfig {
  readonly key: string;
  readonly icon: LucideIcon;
  readonly labelId: string;              // i18n key, never a literal
  readonly href: string;                 // absolute app path
  readonly module: ModuleCode;           // gated by tenant.enabled_modules
  readonly permission: PermissionCode;   // gated by session.permissions
  readonly section: NavSection;
  readonly order: number;
  /** Shown in the mobile bottom nav (max 4 + "More"). */
  readonly bottomNav?: boolean;
  /** Slice selector key for the badge count, if any. */
  readonly badge?: 'overdueReminders' | 'lowStock' | 'unreadNotifications';
}

export const NAV_SECTIONS: readonly { key: NavSection; labelId: string }[] = [
  { key: 'daily',    labelId: 'nav.section.daily' },
  { key: 'business', labelId: 'nav.section.business' },
  { key: 'insight',  labelId: 'nav.section.insight' },
  { key: 'account',  labelId: 'nav.section.account' },
];

export const NAV_ITEMS: readonly NavItemConfig[] = [
  { key: 'dashboard', icon: BarChart3, labelId: 'nav.dashboard', href: '/dashboard',
    module: 'reports', permission: 'reports.basic.read', section: 'daily', order: 1 },
  { key: 'parties', icon: BookUser, labelId: 'nav.parties', href: '/parties',
    module: 'parties', permission: 'parties.party.read', section: 'daily', order: 2, bottomNav: true },
  { key: 'reminders', icon: Wallet, labelId: 'nav.reminders', href: '/ledger/reminders',
    module: 'ledger', permission: 'ledger.entry.read', section: 'daily', order: 3, badge: 'overdueReminders' },
  { key: 'invoices', icon: FileText, labelId: 'nav.invoices', href: '/sales/invoices',
    module: 'sales', permission: 'sales.invoice.read', section: 'business', order: 1, bottomNav: true },
  { key: 'items', icon: Boxes, labelId: 'nav.items', href: '/items',
    module: 'inventory', permission: 'inventory.item.read', section: 'business', order: 2,
    bottomNav: true, badge: 'lowStock' },
  { key: 'purchases', icon: ShoppingCart, labelId: 'nav.purchases', href: '/purchases/bills',
    module: 'purchases', permission: 'purchases.bill.read', section: 'business', order: 3 },
  { key: 'payments', icon: CreditCard, labelId: 'nav.payments', href: '/payments',
    module: 'payments', permission: 'payments.payment.read', section: 'business', order: 4 },
  { key: 'expenses', icon: Receipt, labelId: 'nav.expenses', href: '/expenses',
    module: 'expenses', permission: 'expenses.expense.read', section: 'business', order: 5 },
  { key: 'reports', icon: BarChart3, labelId: 'nav.reports', href: '/reports',
    module: 'reports', permission: 'reports.basic.read', section: 'insight', order: 1 },
  { key: 'team', icon: Users, labelId: 'nav.team', href: '/settings/team',
    module: 'platform', permission: 'platform.members.manage', section: 'account', order: 1 },
  { key: 'settings', icon: Settings, labelId: 'nav.settings', href: '/settings',
    module: 'platform', permission: 'parties.party.read', section: 'account', order: 2 },
];
```

```ts
// features/navigation/hooks/useNavigation.ts (abridged)
export function useNavigation() {
  const enabledModules = useSelector(selectEnabledModules);
  const permissions = useSelector(selectPermissions);
  const badges = useSelector(selectNavBadges);

  return useMemo(() => {
    const visible = NAV_ITEMS.filter(
      (item) => enabledModules.includes(item.module) && permissions.includes(item.permission)
    );
    const sections = NAV_SECTIONS.map((section) => ({
      ...section,
      items: visible
        .filter((i) => i.section === section.key)
        .sort((a, b) => a.order - b.order)
        .map((i) => ({ ...i, count: i.badge ? badges[i.badge] : undefined })),
    })).filter((s) => s.items.length > 0);

    const bottomNav = visible.filter((i) => i.bottomNav).slice(0, 4);
    return { sections, bottomNav };
  }, [enabledModules, permissions, badges]);
}
```

### 19.6.3 Mobile navigation

Below 1024 px the sidebar is a drawer; below 640 px the primary navigation is `UbBottomNav`: four entries from `bottomNav: true` plus a "More" sheet listing everything else, with a central `UbFab` "+" that opens a create sheet whose options are themselves permission-filtered (New bill · You gave · You got · New party · New item · Record payment · Add expense).

The bottom nav is 64 px tall plus `env(safe-area-inset-bottom)`, and the app shell adds that height as bottom padding to the scroll container so a sticky page footer (the invoice editor's "Issue" bar, a drawer's Save row) never sits underneath it.

### 19.6.4 Deep links and the `next` parameter

Every application route is deep-linkable. Three rules make that true in practice:

1. **A route never depends on state set by another route.** `/sales/invoices/[id]/edit` fetches the invoice itself; it does not assume the list slice already holds it.
2. **Unauthenticated access to an app route** redirects to `/login?next=<encoded path + query>`, and after a successful login the session hook replays that `next` exactly once. `next` is validated against a same-origin, leading-slash allow-list before use — an open redirect here would be a real vulnerability.
3. **A deep link into a module the tenant has disabled, or the user cannot read**, renders the `module_disabled` / `permission_denied` screen rather than redirecting silently, so a shared link produces an explanation rather than a mysterious dashboard.

### 19.6.5 The tenant-switch flow

A user may belong to several businesses (canon §0.2 Membership). The switch is not a client-side filter — it is a new token.

```
User picks "Sharma Kirana" in the header tenant menu
  └─ dispatch(switchTenant({ tenantId }))
       ├─ POST /auth/switch-tenant { tenant_id }         → new access + refresh cookies (tid claim)
       ├─ on success:
       │    1. store.dispatch(resetAllFeatureState())    → every feature slice back to initialState
       │    2. dispatch(fetchSession())                  → GET /auth/me: permissions, modules, branding
       │    3. dispatch(applyWhiteLabel(branding))       → repaint --primary-* ramp
       │    4. clear tenant-scoped localStorage keys except the draft namespace of
       │       the NEW tenant (draft keys are already tenant-prefixed)
       │    5. router.replace('/dashboard')              → never stay on a record id from the old tenant
       └─ on 403 (not a member): snackbar + menu stays open
```

Step 5 is non-negotiable: staying on `/parties/<uuid>` after a switch would request another tenant's record and get a 404 (canon §0.11 rule 2 — cross-tenant ids return 404, never 403), which reads to the user as data loss.

`resetAllFeatureState()` is a plain action dispatched by the store's own module; every feature slice handles it in `extraReducers` with `() => initialState`. It is also dispatched on logout.

---

## 19.7 Authentication and session

### 19.7.1 Token storage: the decision and its reasoning

**Tokens live in httpOnly cookies set by the server (`ub_access`, 15 min; `ub_refresh`, 30 d, path-scoped to `/api/v1/auth/refresh`), `SameSite=Lax`, `Secure` in any non-local environment. JavaScript never reads them.** CSRF is handled by a double-submit token in a readable cookie, echoed as `X-CSRF-Token` on every non-GET (Part 22 §22.1).

This differs from BrandHub, which stores a bearer token in a readable cookie, and the difference is deliberate and ADR-011-backed. The reasoning:

- **XSS is the realistic threat.** UdhaarBook renders user-entered party names, notes and item descriptions across every screen. React escapes by default, but one `dangerouslySetInnerHTML` in a print template — and print templates are exactly where teams reach for raw HTML — would exfiltrate a readable token. An httpOnly cookie survives that mistake.
- **A refresh token in `localStorage` is worse still**, because it is long-lived and rotation gives an attacker a 30-day foothold rather than a 15-minute one.
- **The cost is small**: the client already talks to one origin (the API is proxied under the same host in every deployment, §19.14.2), so `SameSite=Lax` works without third-party cookie exposure, and `withCredentials: true` is the only client-side change.
- **API clients (scripts, the future mobile shell) still get bearer tokens** from the same endpoints — `/auth/login` returns `access_token` in the body for non-browser clients — so nothing is closed off.

What the client *does* store, and where:

| Value | Storage | Why |
|---|---|---|
| Access / refresh tokens | httpOnly cookies (server-set) | Not readable by JS |
| CSRF token | Readable cookie | Must be echoed as a header |
| Session summary (user, tenants, active tenant, permissions, enabled modules, plan limits) | `sessionSlice` in memory, rehydrated from `GET /auth/me` on every app load | Small, always fresh, never stale after a role change |
| Locale, theme | `localStorage` + cookie (cookie so the server-rendered shell can set `<html lang>` without a flash) | Must survive reload |
| UI preferences (page size, grid column visibility, last payment mode, density) | `localStorage`, keys namespaced `ub.<feature>.<key>` | Convenience only; loss is harmless |
| Document drafts | `localStorage`, keys namespaced `ub.<module>.draft.<tenantId>.<uuid>` | Crash recovery |
| Offline write queue (Phase 2) | IndexedDB, one object store | Must survive a reload while offline |

Nothing in `localStorage` is ever trusted for authorisation. Permission checks are advisory on the client and authoritative on the server (§19.7.5).

### 19.7.2 Bootstrap sequence

```
app/layout.tsx mounts Providers
  └─ <SessionBootstrap>
       1. dispatch(fetchSession())                → GET /auth/me
       2a. 200 → sessionSlice.status = 'authenticated'
            ├─ permissions[], enabledModules[], activeTenant, planLimits, featureFlags
            ├─ dispatch(applyWhiteLabel(branding))
            ├─ dispatch(setLocale(user.locale))     (unless a local override exists)
            └─ children render
       2b. 401 → one silent refresh attempt via the transport interceptor
            ├─ success → retry step 1
            └─ failure → sessionSlice.status = 'anonymous'
                         (auth) routes render; (app) routes redirect to /login?next=…
       3. On window 'focus' after > 5 min hidden → re-fetch session
       4. On any response whose token `ver` claim differs from the session's → re-fetch session
```

Until step 2 resolves, `(app)` routes render `UbPageSkeleton`, not a flash of the login screen. This is the single most visible correctness detail in the whole auth flow and it is worth the extra state.

### 19.7.3 Route guards

Guarding happens in two places, and both are required:

- **`middleware.ts`** (Next.js edge middleware) does a cheap cookie-presence check on `(app)` paths. No `ub_access` **and** no `ub_refresh` cookie → 307 to `/login?next=…` before any JS ships. It never decodes or validates the token; that is the server's job. This exists purely so that an unauthenticated deep link does not download and boot the whole application before redirecting.
- **`<RequireSession>`** inside `(app)/layout.tsx` does the real check against `sessionSlice.status`, because a cookie can exist and still be invalid.

```tsx
export function RequireSession({ children }: Readonly<{ children: React.ReactNode }>) {
  const status = useSelector(selectSessionStatus);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status === 'loading' || status === 'idle') return <UbPageSkeleton variant="app" />;
  if (status === 'anonymous') return null;
  if (status === 'no_tenant') return <OnboardingRedirect />;   // new user, no business yet
  return <>{children}</>;
}
```

### 19.7.4 Logout and session expiry

| Trigger | Behaviour |
|---|---|
| User taps Log out | `POST /auth/logout` → `resetAllFeatureState()` → `sessionSlice.reset()` → clear non-draft `localStorage` → `router.replace('/login')` |
| Refresh fails (§19.4.3) | `sessionExpired()` → same teardown, plus `?next=<current path>` so the user returns where they were, plus a snackbar "Your session ended. Please sign in again." |
| `POST /auth/logout?all=true` from the device list | Same, and every other device's next refresh fails |
| Tenant switched | `resetAllFeatureState()` only; the session itself survives |

`resetAllFeatureState()` is dispatched **before** the navigation, so the login screen never renders with the previous tenant's data behind it.

### 19.7.5 Permission gating at component level

Permissions arrive as a flat array of codenames (canon §0.9) on `GET /auth/me`. The client uses them to decide what to *render*; the server enforces them on every request. The client check is a UX affordance, never a security boundary — which is why a missing permission **hides** an action rather than disabling it: a disabled button invites a support call, and a hidden one is simply not part of that user's product.

```tsx
// src/modules/UdhaarBook/features/auth/components/Can.tsx
'use client';

import { memo, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { selectPermissions, selectEnabledModules } from 'src/redux/slice/sessionSlice';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

export interface CanProps {
  readonly permission: PermissionCode | readonly PermissionCode[];
  /** When several are given, require all of them instead of any. */
  readonly requireAll?: boolean;
  /** Also require the module to be enabled for this tenant. */
  readonly module?: ModuleCode;
  readonly children: ReactNode;
  /** Rendered instead of children when not permitted. Default: nothing. */
  readonly fallback?: ReactNode;
}

function CanBase({ permission, requireAll = false, module, children, fallback = null }: Readonly<CanProps>) {
  const permissions = useSelector(selectPermissions);
  const modules = useSelector(selectEnabledModules);

  if (module && !modules.includes(module)) return <>{fallback}</>;

  const needed = Array.isArray(permission) ? permission : [permission];
  const ok = requireAll
    ? needed.every((p) => permissions.includes(p))
    : needed.some((p) => permissions.includes(p));

  return <>{ok ? children : fallback}</>;
}
CanBase.displayName = 'Can';
export const Can = memo(CanBase);
```

```tsx
<Can permission="ledger.entry.write" module="ledger">
  <UbButton variant="destructive-quiet" onClick={openGaveDrawer}>
    {t('ledger.entry.gave')}
  </UbButton>
</Can>

<Can permission="sales.invoice.void" fallback={<UbHelpHint id="sales.void.noPermission" />}>
  <MenuItem onSelect={openVoidDialog}>{t('sales.action.void')}</MenuItem>
</Can>
```

For logic (not rendering), `usePermissions()` returns `{ can, canAll, hasModule }`, used by view-model functions such as `partyActions.rowMenu(party, permissions)` and `invoiceActions.allowedActions(invoice, permissions)`. The view-model receives the permission array as an argument rather than reading Redux itself, which keeps it pure and unit-testable.

### 19.7.6 The logged-out and expired experience

- **Expired mid-action.** The in-flight request is replayed after refresh; if refresh fails, the draft is preserved (documents in `localStorage`, drawers in the slice), the user signs in, and `?next` returns them to the same route where the restore prompt offers their draft back. Losing a half-typed bill to a token expiry is not acceptable.
- **Anonymous deep link.** Middleware redirect → login → `next` replay.
- **Public document link.** No session at all: `(public)/d/[token]` renders server-side from `GET /public/d/{token}` with no store, no shell and no navigation into the app beyond a single "Powered by <app name>" line. A revoked or expired token renders a plain "This link has expired" page with the tenant's name and phone number if the token still resolves enough to know them, and nothing otherwise.

---

## 19.8 The design-system layer

### 19.8.1 Three layers, one direction

Part 23 fixes the decision; this section fixes the mechanics.

```
Koper tokens  ──►  tokens/*.css (CSS variables)  ──►  tailwind.config.js  ──►  Ub* components
                            │                                                       ▲
                            └──► shadcn alias layer (--primary, --card, …) ──► ML* primitives
```

Nothing flows the other way. A `Ub*` component never declares a colour; it names a Tailwind class that resolves to a variable. An `ML*` primitive is never forked; it is themed through the alias layer.

### 19.8.2 How a `Ub*` wrapper is built

Every wrapper follows the template in Part 23 §23.4, without exception. The rules, restated as a checklist because this is the most-copied file shape in the codebase:

1. `'use client'` at the top (every `Ub*` is interactive or composes something that is).
2. A `readonly` props interface, exported, named `<Component>Props`, declared **above** the component.
3. Prop unions exported as named types (`UbStatCardTone`), never inlined.
4. A `Base` function component taking `Readonly<Props>`.
5. `Base.displayName = 'UbStatCard'` — the public name, not the base name, so devtools and test queries read correctly.
6. `export const UbStatCard = memo(UbStatCardBase);` — named export, never default.
7. `className` is the **last** prop and is merged with `cn()` so a caller can always override.
8. Zero domain knowledge, zero Redux, zero `react-intl`: all text arrives as props.
9. A sibling `index.ts` re-exporting the component and its types; a line in the root barrel.
10. A `*.test.tsx` covering render, each state and the a11y roles, plus a row in the `(internal)/design-system` gallery.

A worked example that also shows the token discipline — no hex, no arbitrary values, tone maps as `Record`:

```tsx
'use client';

import { memo, type ReactNode } from 'react';
import { cn } from 'src/utils/cn';
import { MLCard, MLCardContent } from 'ml-uikit';

export type UbStatCardTone = 'default' | 'success' | 'warning' | 'danger';

export interface UbStatCardProps {
  readonly label: string;                 // 11px uppercase (ds-label)
  readonly value: ReactNode;              // preformatted ₹ / count — never a raw number
  readonly delta?: {
    readonly value: string;
    readonly direction: 'up' | 'down' | 'flat';
    readonly baseline: string;            // Koper: never a naked number
  };
  readonly tone?: UbStatCardTone;
  readonly icon?: ReactNode;
  readonly onClick?: () => void;
  readonly selected?: boolean;            // PTY-02 FR-3: tile doubles as a filter
  readonly className?: string;
}

const TONE_LABEL: Record<UbStatCardTone, string> = {
  default: 'text-text-tertiary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-error',
};

const TONE_VALUE: Record<UbStatCardTone, string> = {
  default: 'text-text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-error',
};

function UbStatCardBase({
  label, value, delta, tone = 'default', icon, onClick, selected = false, className,
}: Readonly<UbStatCardProps>) {
  const interactive = Boolean(onClick);
  return (
    <MLCard
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={onClick}
      onKeyDown={interactive ? onEnterOrSpace(onClick) : undefined}
      className={cn(
        'rounded-card border border-border-hairline bg-surface-card px-5 py-4',
        'transition-colors duration-fast ease-standard',
        interactive && 'cursor-pointer hover:bg-surface-hover active:translate-y-px',
        interactive && 'focus-visible:outline-none focus-visible:shadow-focus',
        selected && 'bg-accent-quiet ring-1 ring-border-focus',
        className
      )}
    >
      <MLCardContent className="flex flex-col gap-1 p-0">
        <span className={cn('ds-label flex items-center gap-1.5', TONE_LABEL[tone])}>
          {icon}
          {label}
        </span>
        <span className={cn('ds-metric-md', TONE_VALUE[tone])}>{value}</span>
        {delta && (
          <span className="ds-caption text-text-tertiary">
            {delta.value} · {delta.baseline}
          </span>
        )}
      </MLCardContent>
    </MLCard>
  );
}

UbStatCardBase.displayName = 'UbStatCard';
export const UbStatCard = memo(UbStatCardBase);
```

### 19.8.3 The theming pipeline

**Step 1 — tokens as CSS variables.** `src/design-system/tokens/` holds four files imported once by `app/globals.css`:

```
tokens/
├── primitives.css   # --space-*, --radius-*, --size-*, --weight-*, --dur-*, --ease-*
├── light.css        # :root  — the Zoho-blue light theme of Part 23 §23.2.4
├── dark.css         # :root[data-theme="dark"] — Koper's ink set
└── alias.css        # shadcn names → Koper names, so ML* is themed with zero overrides
```

Colours are authored as **HSL channel triplets** so Tailwind's `<alpha-value>` works and so a white-label ramp can be recomputed at runtime:

```css
/* tokens/light.css */
:root {
  --primary-50:  222 100% 97%;
  --primary-500: 219 75% 55%;   /* #2B6BE0 */
  --primary-900: 222 73% 15%;

  --canvas:         220 14% 97%;
  --surface-card:     0  0% 100%;
  --surface-sunken: 220 13% 94%;
  --surface-nav:    213 18% 13%;   /* dark rail in both themes */
  --border-hairline:216 16% 91%;
  --text-primary:   213 17% 10%;
  --success:        155 68% 37%;
  --warning:         34 82% 40%;
  --error:            356 58% 50%;
  --radius-control: 10px;
}
```

```css
/* tokens/alias.css — ml-uikit / shadcn variable names mapped onto ours */
:root {
  --background:            var(--canvas);
  --foreground:            var(--text-primary);
  --card:                  var(--surface-card);
  --card-foreground:       var(--text-primary);
  --popover:               var(--surface-raised);
  --primary:               var(--primary-500);
  --primary-foreground:    var(--text-inverse);
  --muted:                 var(--surface-sunken);
  --muted-foreground:      var(--text-tertiary);
  --accent:                var(--accent-quiet);
  --destructive:           var(--error);
  --border:                var(--border-hairline);
  --input:                 var(--border-subtle);
  --ring:                  var(--primary-500);
  --radius:                var(--radius-control);
}
```

**Step 2 — Tailwind consumes the variables.** Every colour is `hsl(var(--x) / <alpha-value>)`, which is what makes runtime theming work at all:

```js
// tailwind.config.js (colour excerpt)
const hsl = (v) => `hsl(var(${v}) / <alpha-value>)`;

module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', './node_modules/ml-uikit/dist/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: { 50: hsl('--primary-50'), /* … */ 900: hsl('--primary-900') },
        accent: { DEFAULT: hsl('--accent'), quiet: hsl('--accent-quiet'), line: hsl('--accent-line') },
        canvas: hsl('--canvas'),
        surface: {
          card: hsl('--surface-card'), sunken: hsl('--surface-sunken'),
          raised: hsl('--surface-raised'), hover: hsl('--surface-hover'),
          active: hsl('--surface-active'), nav: hsl('--surface-nav'),
        },
        border: {
          hairline: hsl('--border-hairline'), subtle: hsl('--border-subtle'),
          strong: hsl('--border-strong'), focus: hsl('--border-focus'),
        },
        text: {
          primary: hsl('--text-primary'), secondary: hsl('--text-secondary'),
          tertiary: hsl('--text-tertiary'), muted: hsl('--text-muted'),
          inverse: hsl('--text-inverse'), accent: hsl('--text-accent'),
        },
        success: { DEFAULT: hsl('--success'), bright: hsl('--success-bright'), dim: hsl('--success-dim') },
        warning: { DEFAULT: hsl('--warning'), bright: hsl('--warning-bright'), dim: hsl('--warning-dim') },
        error:   { DEFAULT: hsl('--error'),   bright: hsl('--error-bright'),   dim: hsl('--error-dim') },
        info:    { DEFAULT: hsl('--info'),    bright: hsl('--info-bright'),    dim: hsl('--info-dim') },
      },
      borderRadius: { xs: 'var(--radius-xs)', sm: 'var(--radius-sm)', md: 'var(--radius-md)',
                      lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', pill: 'var(--radius-pill)',
                      card: 'var(--radius-card)', control: 'var(--radius-control)' },
      boxShadow: { 1: 'var(--shadow-1)', 2: 'var(--shadow-2)', 3: 'var(--shadow-3)',
                   4: 'var(--shadow-4)', focus: 'var(--focus-ring)' },
      transitionDuration: { instant: '90ms', fast: '140ms', base: '220ms', slow: '360ms', reveal: '640ms' },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,.1,1)', entrance: 'cubic-bezier(.16,1,.3,1)', exit: 'cubic-bezier(.4,0,1,1)',
      },
      fontFamily: { display: ['var(--font-display)'], ui: ['var(--font-ui)'], mono: ['var(--font-mono)'] },
    },
  },
  plugins: [require('tailwindcss-animate'), require('./src/design-system/typographyPlugin')],
};
```

`typographyPlugin` registers the compound `ds-*` classes of Part 23 §23.2.2 via `addComponents`, exactly as BrandHub does. Using `ds-body-sm` rather than `text-[13.5px] leading-[1.5] font-normal` is what keeps 200 files consistent.

**Step 3 — white-label at runtime.** A tenant may override only the primary ramp (Part 23 §23.2.4). `useWhiteLabelTheme()` reads `whiteLabelSlice.primaryHex`, derives the ten-step ramp in HSL, and writes the ten variables onto `document.documentElement`. Nothing else is tenant-configurable, which is what preserves the red/green ledger semantics and the audited contrast ratios.

```ts
export function useWhiteLabelTheme() {
  const primaryHex = useSelector(selectWhiteLabelPrimary);
  useEffect(() => {
    if (!primaryHex) return;
    const ramp = buildPrimaryRamp(primaryHex);       // 50…900 in "H S% L%" form
    Object.entries(ramp).forEach(([step, hsl]) =>
      document.documentElement.style.setProperty(`--primary-${step}`, hsl)
    );
    return () => Object.keys(ramp).forEach((step) =>
      document.documentElement.style.removeProperty(`--primary-${step}`)
    );
  }, [primaryHex]);
}
```

### 19.8.4 Dark mode

Dark mode is **optional and secondary**. Light is the default because the product is used in bright shops on cheap screens (Part 23 §23.1). Implementation:

- `<html data-theme="light|dark">`, set by `ThemeProvider` from `themeSlice`, which initialises from a cookie (so the server-rendered shell matches and there is no flash) falling back to `prefers-color-scheme`.
- Tailwind's `darkMode: ['class', '[data-theme="dark"]']` means a component may write `dark:` variants, but almost none need to: the tokens change underneath.
- Two things do **not** follow the theme: the desktop navigation rail (`--surface-nav` is dark in both themes, Zoho-style) and print templates (always light — ink on paper).
- Ledger semantics are theme-invariant: red is "you gave" in both themes, with the contrast values in Part 23 §23.6 verified for each.

### 19.8.5 Extend versus create: the rule

Part 23's matrix already decides each component. For anything not on it:

1. **Does `ml-uikit` have it?** Use it directly. Do not wrap a primitive just to pass through props.
2. **Does it need product behaviour on top of a primitive** (a debounce, a token preset, an en-IN format, a single-open policy)? Extend it as a `Ub*` wrapper — but only once the pattern is used by **two or more features** (canon §0.11 rule 7). A one-off lives in the feature.
3. **Is it a composition of primitives with no single parent?** New shared `Ub*` — again, only at the second use.
4. **Does it encode domain knowledge?** It is a feature component, not a `Ub*`. `InvoiceRule46Checklist` knows about GST and stays in `features/sales/`. `UbTotalsPanel` takes labelled rows and stays generic.

Promotion from a feature to `Ub*` is a small refactor with a clear signature: strip the domain types out of the props, move the file, add the test and the gallery entry, update the barrel. Doing it at the second use is cheap; doing it speculatively at the first is how design systems bloat.

---

## 19.9 Performance

### 19.9.1 The targets

The device is the specification: a ₹8,000 Android phone, 2 GB RAM, Chrome, on a 3G Fast profile, in a shop with intermittent signal. Everything below follows from that.

| Metric | Target | Where measured |
|---|---|---|
| Lighthouse Performance (mobile, throttled) | ≥ 90 on `/parties`, `/dashboard`, `/sales/invoices` | CI, per PR |
| Lighthouse Accessibility | ≥ 95 on every route in the smoke list | CI, per PR |
| Lighthouse Best Practices / SEO | ≥ 90 / ≥ 90 | CI |
| LCP (mobile, 3G Fast, cold) | ≤ 2.5 s | Lighthouse + field notes |
| INP | ≤ 200 ms | Lighthouse; manual on the invoice editor |
| CLS | ≤ 0.05 | Lighthouse (skeletons must reserve exact heights) |
| Time to first party row (PTY-02 §1) | P75 ≤ 1.2 s | Manual profile + `ub.parties.list_rendered` timing |
| Ledger drawer open (LED-01 §5) | ≤ 100 ms after tap | No fetch on open; party already in store |
| Invoice line keystroke → totals repaint | ≤ 50 ms at 20 lines | React Profiler, recorded in the perf test |

### 19.9.2 Bundle budgets

Enforced in CI by a `scripts/check-bundle.mjs` step reading `.next/build-manifest.json`; exceeding a budget fails the build.

| Bundle | Budget (gzipped) | Contents |
|---|---|---|
| Shared framework chunk | 95 KB | react, react-dom, next runtime |
| Shared app chunk | 85 KB | redux toolkit, react-redux, axios, react-intl, the `Ub*` set used by the shell, `cn`, dayjs |
| `/parties` route chunk | 45 KB | list page, its hooks, view-model |
| `/dashboard` route chunk | 55 KB | tiles + the one chart bundle |
| `/sales/invoices/new` route chunk | 110 KB | line editor, tax engine, payment sheet, combobox |
| Any other route chunk | 60 KB | — |
| Total first load on `/parties` | ≤ 230 KB | framework + app + route |

Three things carry these budgets and each is a standing rule:

- **`@tanstack/react-table` is loaded only by routes that render `UbDataGrid`.** Mobile list rendering uses `UbDataGridMobileList`, which renders the same column definitions as cards without the table core; on a phone the table engine never ships.
- **Charts are dynamic.** `recharts` (via `ml-uikit`'s chart wrappers) is behind `next/dynamic(..., { ssr: false, loading: () => <UbSkeleton variant="chart" /> })` and appears only on the dashboard and two reports.
- **`lucide-react` is imported per icon** (`import { Clock } from 'lucide-react'`), never as a namespace. A namespace import ships 1,400 icons.

### 19.9.3 Code splitting

| Split | Mechanism |
|---|---|
| Per route | Automatic (App Router) |
| Charts | `next/dynamic`, no SSR |
| Print templates | `next/dynamic` on the print route only — they are never part of an app route's bundle |
| The import wizard (IMP-01), the onboarding wizard, the design-system gallery | `next/dynamic` |
| Heavy drawers (invoice payment sheet, reminder composer, file upload with compression) | `next/dynamic` inside the feature, so opening the drawer fetches its chunk while the drawer animates in |
| `hi.json` locale messages | Fetched on demand by locale (§19.11.2); only the active locale is in the bundle |

What is **not** split: anything on the critical path of the first paint of `/parties` or `/dashboard`, because a split there trades bytes for a round trip, and on 3G the round trip is worse.

### 19.9.4 Rendering and list virtualisation

**Virtualisation policy: none at MVP.** Page sizes are 25 (mobile, appended) and 25/50/100 (desktop); 100 rows of a memoised row component is comfortably under the frame budget on the target device, and a virtualiser is another dependency (ADR-021) plus a source of scroll-restoration and print bugs. The policy is revisited only if a real screen exceeds 200 simultaneously rendered rows — today only the day book with a wide date range can, and it is paginated.

What is used instead:

- Every list row is a `memo`ised component receiving primitives and stable callbacks.
- Column definitions are built by a **module-level factory** and memoised on their real dependencies, never recreated per render (this is the single biggest `UbDataGrid` performance mistake, and BrandHub's `createOrderColumns` is the pattern to copy).
- Cells that need translated text render a `<TranslatedText id=… />` component rather than calling `t()` inside the cell, so a locale change repaints cells without invalidating the column array.
- `content-visibility: auto` with a `contain-intrinsic-size` on off-screen list sections below `md`, which gives most of the win of virtualisation for none of the complexity.

### 19.9.5 Images

- Party/item photos and tenant logos go through `next/image` with explicit `width`/`height` (CLS) and `sizes`, served from the Django media endpoint.
- Uploads are compressed **client-side before upload** to ≤ 300 KB and a 1600 px longest edge (LED-01 §5) using a canvas resize in `src/utils/image.ts` — no library.
- Icons are `lucide-react` SVG components, never image files.
- The only raster assets in `public/` are the PWA icons.

### 19.9.6 Measurement plan

1. **Per PR (CI):** bundle budget check; Lighthouse CI against a built app on the six smoke routes with mobile throttling; a React Profiler assertion test that typing a qty in a 20-line invoice causes ≤ 2 row re-renders.
2. **Per release:** a manual pass on a real low-end Android device over the six core journeys, timed with the analytics events already specified in the FRDs (`ub.parties.list_rendered`, `ub.ledger.entry_posted.duration_ms_from_open`, `ub.sales.invoice_issued.duration_ms`).
3. **In production:** `web-vitals` is **not** added (ADR-021). Instead the existing analytics util records LCP/INP from `PerformanceObserver` directly — about 30 lines — behind the same opt-in flag as the rest of analytics.
4. **Regression guard:** the three route budgets that matter (`/parties`, `/dashboard`, `/sales/invoices/new`) are asserted, and a PR that raises one must say why in its description.

---

## 19.10 Offline behaviour and PWA

ADR-020 stages this: **MVP ships an installable PWA with a read-through cache and an outbox for the one write the product cannot afford to refuse — the manual ledger entry; the general write queue is Phase 2.** The staging is deliberate and the boundary is drawn in §19.10.4 by write class, not by convenience.

This section is the single authority on network state for the whole frontend. `LED-01` FR-12, `PTY-*`, `SAL-*` and Part 15 §15.3 describe what the merchant sees; what follows is what the code does, and where the two ever disagree this section and `LED-01` FR-12 are the pair that must be amended together.

### 19.10.1 Manifest and install

`public/manifest.webmanifest`:

```json
{
  "name": "UdhaarBook",
  "short_name": "UdhaarBook",
  "description": "Your shop's khata, bills and stock in one book.",
  "start_url": "/dashboard?src=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F6F7F9",
  "theme_color": "#2B6BE0",
  "lang": "en",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "You gave",  "url": "/parties?action=gave"  },
    { "name": "New bill",  "url": "/sales/invoices/new"   },
    { "name": "Parties",   "url": "/parties"              }
  ]
}
```

`name`, `short_name`, `theme_color` and the icons are **tenant-overridable** in the white-label build (Part 24): the manifest is served by a route handler that reads the tenant branding rather than as a static file, with a one-hour cache.

**Install prompt.** The `beforeinstallprompt` event is captured and stashed; the prompt is offered *contextually*, never on first load — after a user's third session, or right after they issue their first invoice, in a dismissible `UbStatusBanner` ("Add UdhaarBook to your home screen for one-tap billing"). Dismissal is remembered for 30 days in `localStorage`. On iOS, where the event does not fire, the same banner shows the Share → "Add to Home Screen" instruction when the browser is Safari and the app is not already standalone.

### 19.10.2 Service worker scope and caching

One service worker at `/sw.js`, scope `/`, written by hand (Workbox is not on the ADR-021 list). Registered from `ServiceWorkerRegistrar` in the app shell, **after** the first paint and only in production.

| Asset class | Strategy | Notes |
|---|---|---|
| App shell (`/_next/static/**`, fonts, icons) | Cache-first, versioned by build id | Immutable URLs; old caches deleted on `activate` |
| HTML navigations | Network-first with a 3 s timeout, falling back to a cached `/offline` shell | Never serve a stale HTML shell that references deleted chunks |
| `GET /api/v1/parties`, `/items`, `/auth/me`, `/reports/dashboard` | **Stale-while-revalidate**, TTL 24 h, per-tenant cache name (`ub-api-<tid>`) | Enables the read-only offline mode below |
| `GET /api/v1/parties/{id}/ledger-entries` (first page only) | Stale-while-revalidate, TTL 24 h | The khata a shopkeeper looked at today is the one they need offline |
| Every other API GET | Network-only | Reports, registers and searches are not cached |
| Every non-GET | Network-only, always. The **application** queues class-A writes in IndexedDB (§19.10.4); the service worker never replays a write | Never cached, never retried by the worker |
| Media (`/media/**`) | Cache-first, LRU cap 60 entries | Party and item photos |

Two hard rules: **the API cache name includes the tenant id**, so a tenant switch cannot serve another business's rows; and **the whole API cache is deleted on logout and on tenant switch**, triggered by a `postMessage` from `resetAllFeatureState()`.

### 19.10.3 The three-state network model

**Why two states were not enough.** The chapter previously had `online` and `offline`, driven by `navigator.onLine`, and specified that in `offline` every write affordance is disabled. `LED-01` FR-12 and Part 15 §15.3 specify the opposite for the same button: an optimistic row, amber on failure, with Retry and the drawer's contents preserved. Both are reachable in one session, and the shop's real failure mode — the shutter half down, the tower visible, the packet dying — is exactly the case where `navigator.onLine` reports `true` and the request times out. `navigator.onLine` is a link-layer answer to a transport-layer question: **`false` is trustworthy, `true` means nothing**. The model therefore has three states, and the middle one is the common one.

(CF-11 and amendment A-11 name the middle state `uncertain`. It is named **`degraded`** here and everywhere in the code, to match the hook `useDegradedNetwork()`; they are the same state and there is only one implementation.)

| | `online` | `degraded` | `offline` |
|---|---|---|---|
| **Meaning** | The last request the app made came back with an HTTP status, recently | Requests are slow, timing out or failing at the transport layer, but connectivity is not disproved | Connectivity is disproved: the browser says `offline`, or three spaced probes failed |
| **Shell strip** | None | A 24 px `--warning` strip: "Slow network — your entries are safe." Non-dismissible, pushes content down, never overlays | A 28 px `--warning` strip: "No signal — showing saved data" + the outbox count when > 0 ("2 waiting to send"), tapping through to the outbox screen (§19.10.4) |
| **Reads** | Live | Live, with cached data shown first where it exists; skeletons do not block a cached render | Cached data with a `ds-caption` "Showing saved list · updated 2 hours ago"; screens with no cache show the error empty state with Retry |
| **Queueable writes** (§19.10.4) | Enabled; normal optimistic path | Enabled; optimistic path, and the request is handed to the outbox after `WRITE_HANDOFF_MS` rather than making the merchant wait | Enabled; written straight to the outbox, row marked `queued` |
| **Non-queueable writes** | Enabled | Enabled, with the button's spinner and no timeout shortcut — an invoice is worth waiting for | **Disabled**, with the inline hint "Needs signal — this creates a bill number. Your other entries still work." Never hidden: hiding it reads as a permissions problem |
| **Toasts** | Normal | Transport toasts suppressed (the strip is the channel); business errors still toast | All transport toasts suppressed |
| **Announcement** | — | Strip is `role="status"`, `aria-live="polite"` | Same; the transition back to `online` announces once: "Back online. 2 entries sent." |

**Detection, stated as a state machine.** One module owns it: `src/hooks/useDegradedNetwork.ts` plus the transport hooks in `src/api/AxiosInstances.ts` that feed it. Nothing else in the codebase reads `navigator.onLine`, and a lint rule (Part 25 §25.14) fails any other reference to it.

Signals the machine consumes, all of them cheap:

1. **Response observed** — any request that completed with *any* HTTP status, including a 4xx or a 5xx. The server answered, so the network works.
2. **Transport failure** — an `ApiError` with code `network_error`, `timeout` or `offline` (§19.4.4).
3. **Silence** — a request that has been in flight for `NET_SLOW_MS` without response headers. The axios timeout stays at 30 s for exports and uploads; silence is judged much earlier than that.
4. **Browser event** — `offline` (trusted) and `online` (treated only as a hint to probe).
5. **Probe** — `GET /system/health`, unauthenticated, `cache: 'no-store'`, `AbortSignal.timeout(3000)`. Run only in `degraded` and `offline`, never in `online`, and never while `document.visibilityState === 'hidden'`.

```ts
// src/hooks/useDegradedNetwork.ts — constants are the whole policy
export const NET_SLOW_MS        = 4_000;   // silence before we call it degraded
export const NET_FAILS_TO_DEGRADE = 1;     // one transport failure is enough
export const NET_PROBE_DEGRADED_MS = 10_000;
export const NET_PROBE_OFFLINE_MS  = 15_000;  // ±20 % jitter
export const NET_PROBES_TO_OFFLINE = 3;       // ~35 s of spaced, failed probes
export const WRITE_HANDOFF_MS   = 8_000;   // a queueable write stops waiting and goes to the outbox
```

| From | To | Trigger |
|---|---|---|
| `online` | `degraded` | One transport failure, **or** one in-flight request silent for `NET_SLOW_MS` |
| `online` | `offline` | The browser `offline` event (its `false` is trusted) — no probe needed |
| `degraded` | `online` | Any response observed with an HTTP status, **or** one successful probe |
| `degraded` | `offline` | The browser `offline` event, **or** `NET_PROBES_TO_OFFLINE` consecutive failed probes at `NET_PROBE_DEGRADED_MS` spacing — roughly 35 seconds of honest evidence before the word "offline" appears on screen |
| `offline` | `degraded` | One successful probe, **or** the browser `online` event — **never straight to `online`**, because `navigator.onLine === true` on a captive-portal Wi-Fi is the lie this model exists to absorb |
| `degraded` | `online` | (as above) — the first real API call that returns a status is what confirms recovery, and it is also what drains the outbox |

Two consequences worth stating because they are easy to get wrong:

- **A 4xx is evidence of health.** A `credit_limit_exceeded` 409 moves the machine to `online`. Business failures are not network failures, and a product that shows "no signal" when the server has just answered loses the merchant's trust in both messages.
- **The state is global, not per-request.** A single slow report export must not put the shell into `degraded` for everyone; only requests tagged `net: 'probe' | 'interactive'` feed the machine, and long-running exports and uploads are tagged `background` and excluded. The tag is set in the service, defaulting to `interactive`.

```ts
export type TNetworkState = 'online' | 'degraded' | 'offline';

export interface TDegradedNetwork {
  readonly state: TNetworkState;
  /** True in degraded and offline — the one predicate features should read. */
  readonly isImpaired: boolean;
  /** May this write class be attempted right now? (§19.10.4) */
  readonly canWrite: (writeClass: TWriteClass) => boolean;
  /** Entries sitting in the outbox for this tenant. */
  readonly pendingWrites: number;
  readonly lastOnlineAt: string | null;
}

export function useDegradedNetwork(): TDegradedNetwork;
```

The value lives in `networkSlice` so that the shell strip, the write affordances, the retry policy and the outbox all read one truth; the hook is a typed selector over it plus the probe effect, mounted once in the app shell. **No feature implements its own online check**, and `useOnlineStatus()` no longer exists (renamed, not duplicated).

**What the user is told, in both locales.** The copy keys live in `common.network.*` so no feature invents its own wording:

| Key | English | Hindi |
|---|---|---|
| `common.network.degraded` | "Slow network — your entries are safe." | "नेटवर्क धीमा है — आपकी एंट्री सुरक्षित है।" |
| `common.network.offline` | "No signal — showing saved data" | "सिग्नल नहीं है — सेव किया हुआ दिखा रहे हैं" |
| `common.network.pending` | "{count, plural, one {# waiting to send} other {# waiting to send}}" | "{count} भेजना बाकी है" |
| `common.network.queued` | "Saved on this phone. Will send when you have signal." | "फोन में सेव हो गया। सिग्नल आते ही भेज देंगे।" |
| `common.network.sent` | "Back online. {count} sent." | "नेटवर्क वापस आ गया। {count} भेज दिए।" |
| `common.network.blocked` | "Needs signal — this creates a bill number. Your other entries still work." | "इसके लिए सिग्नल चाहिए — इसमें बिल नंबर बनता है। बाकी एंट्री अभी भी चलेंगी।" |

### 19.10.4 The ledger-entry write path (MVP capability, not a promise)

The merchant in journey 3 is standing in a basement godown with no signal, recording what he just handed over. That is the product's most frequent action in the network condition its users actually have, and it ships in the MVP. This section specifies it completely.

**Write classes.** Every mutating call in the product belongs to exactly one class, declared on its service function as `writeClass` and re-exported by the thunk, and `canWrite(writeClass)` in §19.10.3 is the only gate any affordance consults:

```ts
export type TWriteClass =
  | 'queueable'    // class A — goes to the outbox in `offline`
  | 'deferred'     // class B — Phase 2 will promote it; disabled in `offline` today
  | 'online-only'; // class C — never queued, for the reasons tabled below
```

| Class | Members | `online` | `degraded` | `offline` |
|---|---|---|---|---|
| **A — queued at MVP** | The manual ledger entry: `postLedgerEntry` (`LED-01`, both directions) and `postOpeningBalance` (`LED-02`) | Sent | Sent, handed to the outbox after `WRITE_HANDOFF_MS` | **Written to the outbox** |
| **B — queued in Phase 2** | Party create/update, expenses, stock adjustments, unallocated payments, reminder status changes | Sent | Sent | Disabled with the `common.network.blocked` hint until Phase 2 promotes them |
| **C — never queued** | Everything in the never-queue list below | Sent | Sent | Disabled with the hint |

Class B is *not* class A at MVP, and the reason is specific per member rather than general caution: an expense and a stock adjustment each allocate a number from `platform_document_sequence` (`EXP-01`, `INV-06`); a payment allocates a receipt number and its allocations are computed against a server-side `amount_due` that a queued client cannot know; and a party created offline has no server id, so every write the merchant would then make against that party — which is the only reason they created it — would have nothing to reference. Phase 2 answers each of those questions (client-minted ULIDs for parties, deferred numbering for expenses) and promotes them into the same outbox with the same machinery. **Part 15 §15.3, `LED-01` FR-12 and CF-11's queueable list are amended to this split**; the review's list was drawn before the numbering question was asked of each member.

**The never-queue list, and why each is on it.** These are disabled in confirmed `offline`, and the hint says why in the merchant's words:

| Operation | Reason |
|---|---|
| Issue an invoice, credit note, debit note, estimate, delivery challan (`SAL-*`) | Allocates a document number from `platform_document_sequence`; two devices replaying would both produce invoice 0042 |
| Record a purchase bill or goods receipt (`PUR-*`) | Same number allocation, plus a stock effect that changes the moving average |
| Record or match a payment (`PAY-*`) | Allocates a receipt number, and allocations are capped by a server-side `amount_due` |
| Record an expense (`EXP-01`) | Allocates an expense number |
| Post a stock adjustment (`INV-06`) | Allocates an adjustment number and depends on the current on-hand quantity |
| Void, reverse, correct or write off anything (`LED-03`, `SAL-06`, `PAY-05`, `PTY-09`) | Depends on the current `version` / `status` of a row the client has not seen since it went offline; a replayed void of an already-voided document is not a retry, it is a second decision |
| Any CSV import (`IMP-01`, `PTY-10`) | Creates parties and entries wholesale; there is no sane conflict resolution |
| Tenant settings, numbering, membership, role and branding changes (`PLT-05`, `PLT-06`, `PLT-08`) | Change server-side defaults that other writes read; replaying them out of order changes the meaning of writes already accepted |
| Tenant switch, login, logout, OTP | Session state, by definition server-side |

**Where it is queued.** IndexedDB, not `localStorage`: the payload may carry an image, and `localStorage` is synchronous and size-capped.

```ts
// src/utils/outbox.ts
// Database name is per tenant, so a tenant switch cannot replay one business's
// entries into another: `ub-outbox-<tenantId>`. Store `writes`, keyPath 'id'.
export interface TOutboxEntry {
  readonly id: string;                 // === the Idempotency-Key, minted at Save
  readonly seq: number;                // monotonic per device; replay order
  readonly kind: 'ledger.entry' | 'ledger.opening';
  readonly partyId: string;
  readonly payload: Readonly<Record<string, unknown>>;  // plain, serialisable
  readonly attachment?: { readonly blob: Blob; readonly name: string; readonly type: string };
  readonly createdAt: string;          // ISO, device clock — display only
  readonly attempts: number;
  readonly lastError: { readonly code: string; readonly message: string } | null;
  readonly status: 'queued' | 'sending' | 'needs_attention';
}
```

Indexes: `by_seq` (replay order) and `by_party` (the party timeline rebuilds its optimistic rows from it on mount). The store is read on boot, before the first render of any party screen, so **a queued row survives a reload, a tab close and a battery death** — which was the honest objection underneath the old disabled-button rule, and is the reason a queued row may be shown at all.

**What is queued, exactly.** The entry's own fields as `LED-01` FR-2 defines them (`party_id`, `direction`, `amount` as a decimal *string*, `entry_date`, `note`, `payment_mode`, `reference`) plus the attachment blob. Never queued: anything derived from a server response, any formatted string, any `Date` object. `entry_date` is resolved to a date in the **tenant timezone at the moment of Save** (`todayInTenantTz()`, §19.11.5) and stored as `YYYY-MM-DD`, so an entry made at 11.50 p.m. and replayed at 8 a.m. keeps the day the merchant meant.

**Replay.**

1. Triggered by the transition into `online` (§19.10.3), by app boot when the outbox is non-empty and the state is `online`, and by the user pressing "Send now" on the outbox screen. Never by a timer while `offline`.
2. **Strictly serial, in ascending `seq`, one request in flight at a time.** Not parallel: two entries for the same party posted concurrently make the server's balance patch responses race, and the merchant sees the balance jump backwards.
3. Each attempt sends the entry's `id` as the `Idempotency-Key` header (R-F-10), on every attempt, unchanged. This is the whole of the double-post defence: a first attempt that reached the server and lost its response is, on replay, answered from `platform_idempotency_key` with the original response body, and the client treats that exactly like a fresh 201 — one entry, one balance movement, no duplicate. A `409 idempotency_in_progress` means a previous attempt is still executing server-side: back off 2 s, ×2, five times, then leave the entry `queued` and move on.
4. A success removes the entry from the store **in the same transaction** as dispatching the `postLedgerEntry.fulfilled` action the online path would have dispatched, so the invalidation map of §19.3.6 runs identically for a queued write and a live one. There is no second code path for queued data.
5. A hard failure moves that entry to `needs_attention` and replay **continues** with the next entry: entries are independent, the server recomputes the balance from the posted set (Part 21 §21.3.4), and stopping the queue on one bad row would strand a day's takings behind a single archived party.
6. Backoff on transport failure is 2 s, ×2, capped at 60 s, with **no attempt cap** — a shopkeeper may be offline for a day and the entry must still be there.

**Conflicts, and what each one does.** All of these are reachable because the world moved while the device did not:

| Response | What it means | Resolution |
|---|---|---|
| `2xx` with the stored idempotent response | The write already landed | Success. Remove, dispatch `fulfilled`, count it in the "Back online. {n} sent." announcement |
| `409 idempotency_conflict` | The same key was used with a *different* body — two devices, or an edited retry | `needs_attention`. The outbox screen shows both versions side by side with "Keep the saved one" / "Send mine as a new entry" (a new key); nothing is discarded silently |
| `409 party_archived` | The party was archived elsewhere while offline | `needs_attention`, message "Ramesh Traders was archived. Restore them, or move this entry to another customer." with both actions inline |
| `409 credit_limit_exceeded` | The limit was crossed by entries the device could not see | `needs_attention` for `block` mode with "Ask owner" / "Record payment first"; in `warn` mode the server accepts and returns a warning, which is surfaced as a toast on reconnect, not as a failure |
| `400 validation_error` | A client-side bug: the client validated before queueing | `needs_attention`, the field messages shown on the stored values, "Edit and send" reopens the drawer prefilled. Also `console.error` with the code — this is a defect, not a user error |
| `403 permission_denied` | The user's role changed while offline | `needs_attention`, "You no longer have permission to add entries. Ask the owner." The entry is kept, never deleted, because it is the merchant's record of something that physically happened |
| `404` on the party | The party was hard-deleted (owner-only, rare) | `needs_attention`, "Move to another customer" is the only action |
| `5xx` | Server trouble | Treated as transport: stays `queued`, backs off, retries |

**Visibility — the merchant must always be able to answer "did my entry save?"** Three surfaces, and no silent sync:

- The timeline row itself: `queued` rows render in the `--warning` treatment with a `CloudOff` icon and the caption `common.network.queued`; `needs_attention` rows render with the `--form-error` outline and an inline action. A queued row is **never** styled as a posted row (Part 23 §23.2.4's semantic mapping).
- The shell strip's count, tapping into `/outbox` — a plain list of what is waiting, with "Send now" and per-entry actions.
- The party header's balance shows the **server's** balance, with a `ds-caption` "+ ₹500 waiting to send" beneath it when the outbox has entries for that party. The balance the merchant shows a customer is never a number only this phone believes.

**What this costs and what it does not.** Roughly 250–350 lines (`outbox.ts`, the replay effect, the outbox screen) plus the three row states. It does not require a service-worker Background Sync (unavailable on iOS Safari, which the target market uses), it does not require conflict-free data types, and it does not touch the server beyond `platform_idempotency_key`, which A-03 already adds.

### 19.10.5 The general write queue (Phase 2)

Phase 2 promotes class B into the same outbox. The seams that make it additive rather than a rewrite exist from the first commit:

1. **Every mutating thunk mints its idempotency key in the hook and stores it in the slice**, so any write can become a queue entry without changing its call site.
2. **`offlineQueueSlice` and `outbox.ts` ship at MVP** carrying class A; adding a `kind` is a union member and a service registration, not a new mechanism.
3. **Services take their payload as a plain serialisable object**, never a `FormData` built inline, so a queued write can be persisted and rebuilt.
4. **Every service declares its write class**, so promoting an operation is a one-line change in exactly one place and the never-queue list stays honest.

The three questions Phase 2 must answer before promoting a member of class B, none of which are answered here because none of them can be answered cheaply: client-minted ids for offline-created parties and how they are reconciled with server ids; deferred number allocation for expenses and adjustments (allocate on arrival, and tell the user their receipt number may change); and whether an unallocated offline payment is worth the reconciliation work it creates in `PAY-07`'s unmatched queue.

---

## 19.11 Internationalisation

### 19.11.1 Setup

`react-intl` with ICU messages (ADR-006), locales `en` and `hi` at MVP, English as the source and the fallback. The provider lives in `app/layout.tsx`'s provider stack; messages come from `locales/<locale>.json`.

```tsx
// src/components/providers/IntlProviderShell.tsx
'use client';

import { IntlProvider } from 'react-intl';
import { useSelector } from 'react-redux';
import { selectLocale } from 'src/redux/slice/localeSlice';
import { useMessages } from 'src/hooks/useMessages';

export function IntlProviderShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = useSelector(selectLocale);
  const messages = useMessages(locale);          // en bundled; hi fetched on demand
  return (
    <IntlProvider
      locale={locale}
      defaultLocale="en"
      messages={messages}
      // A missing key is a bug, not a crash: log in dev, render the key in prod.
      onError={(error) => {
        if (process.env.NODE_ENV !== 'production') console.warn('[intl]', error.message);
      }}
    >
      {children}
    </IntlProvider>
  );
}
```

`src/hooks/useTranslation.ts` is the wrapper every component uses — BrandHub's pattern, kept verbatim in shape:

```ts
'use client';

import { useMemo } from 'react';
import { useIntl } from 'react-intl';

export const useTranslation = () => {
  const intl = useIntl();
  return useMemo(
    () => ({
      t: (id: string, values?: Record<string, string | number | Date>) =>
        id ? intl.formatMessage({ id, defaultMessage: id }, values) : '',
      /** Number in the active locale with en-IN grouping for en/hi. */
      n: (value: number, options?: Intl.NumberFormatOptions) => intl.formatNumber(value, options),
      /** Business date (dd/mm/yyyy in both locales). */
      d: (value: string | Date, options?: Intl.DateTimeFormatOptions) =>
        intl.formatDate(value, options ?? { day: '2-digit', month: '2-digit', year: 'numeric' }),
      locale: intl.locale,
    }),
    [intl]
  );
};
```

A `<TranslatedText id="…" values={…} />` component also exists, for one specific reason: inside `UbDataGrid` column definitions, calling `t()` would bake the string into a memoised column array that does not invalidate on a locale change. Columns render `<TranslatedText/>`, which subscribes to the provider itself.

### 19.11.2 Locale loading and switching

- `en.json` is imported statically (it is the fallback and must always be present).
- `hi.json` is `await import('locales/hi.json')` on demand, cached in a module-level map. Switching to Hindi costs one small chunk, not a reload.
- The active locale is persisted in `localStorage` **and** in a readable `ub_locale` cookie, so the server-rendered `<html lang>` matches on the next load and there is no flash of English.
- The locale is sent as `Accept-Language` on every request (§19.4.2) so server-generated messages (validation, error text) match the UI.
- The user's locale preference on `/auth/me` is the default; a local override wins until the user clears it.

### 19.11.3 Key naming

`<module>.<screen-or-object>.<element>[.<variant>]`, lowercase, dot-separated, camelCase within a segment. Examples, all taken from the FRDs so they are already normative:

```
parties.list.title                    ledger.entry.gave
parties.list.totals.receivable        ledger.entry.mode
parties.list.empty.firstUse.title     ledger.entry.saved
parties.list.empty.filtered.action    sales.invoice.issue
parties.list.error.title              sales.line.taxRequired
nav.parties                           validation.amount.positive
```

Rules:

- **No English literal ever reaches the screen.** Every user-facing string is a key, including button labels, placeholders, `aria-label`s, tooltip text, empty-state copy, error messages and snackbar text.
- **Keys are flat strings, not nested objects**, in the JSON — `react-intl` takes flat ids and flat files diff cleanly.
- **A key is never composed at runtime** from fragments (`t('status.' + s)`) unless the fragment set is a closed union declared in a constants file, in which case the extraction script is told about it via a `// i18n-keys:` comment so the keys are not reported as unused.
- **`en.json` and `hi.json` must have identical key sets.** CI fails on a mismatch (`scripts/check-locales.mjs`). A Hindi string may temporarily equal the English one; it may not be missing.

### 19.11.4 Pluralisation, gender and interpolation

ICU syntax, used directly:

```json
{
  "parties.list.totals.count": "{count, plural, one {# party} other {# parties}}",
  "ledger.entry.saved": "Saved ₹{amount} · {name} now owes ₹{balance}",
  "sales.invoice.lineCount": "{count, plural, =0 {No items} one {# item} other {# items}}",
  "reminders.due": "{count, plural, one {# reminder due today} other {# reminders due today}}"
}
```

```json
{
  "parties.list.totals.count": "{count, plural, one {# पार्टी} other {# पार्टियाँ}}",
  "ledger.entry.saved": "₹{amount} सेव हुआ · {name} के अब ₹{balance} बाकी",
  "sales.invoice.lineCount": "{count, plural, =0 {कोई आइटम नहीं} one {# आइटम} other {# आइटम}}"
}
```

Hindi has two plural categories (`one`, `other`), so every plural message must supply both; English is the same, which makes the two files structurally identical. Interpolation values are always passed as `values`, never concatenated — a concatenated sentence cannot be reordered by a translator, and Hindi word order differs from English in most of these strings.

### 19.11.5 Numbers, money and dates

| Thing | Rule |
|---|---|
| Money display | `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })` → `₹1,23,456.50`. The **Indian grouping (2,2,3)** is the whole point; `en-US` would render `₹123,456.50` and read wrong to the user. `hi-IN` uses the same grouping, so the formatter locale is `en-IN` for both UI locales. |
| Money maths | Never on the formatted string and never in `number`. `decimal.js-light` over the API's decimal strings, in `src/utils/money.ts`. The only place a money value becomes a `number` is inside `Intl.NumberFormat` at the last moment. |
| Quantities | Up to 3 dp, trailing zeros trimmed, unit code appended: `2.5 KG`, `12 NOS`. |
| Percentages | Plain numbers with a `%` suffix, up to 2 dp. |
| Business dates | `dd/mm/yyyy` in both locales — the format Indian users read, and unambiguous on a printed invoice. Stored and sent as `YYYY-MM-DD`. |
| Relative times | "2 days ago" via `Intl.RelativeTimeFormat`, with the exact timestamp in a tooltip. |
| Timezone | All "today" computations use the **tenant timezone** from `/auth/me` (default `Asia/Kolkata`), never the device clock (LED-01 EC-8). `src/utils/dates.ts` exports `todayInTenantTz()` and nothing in the app calls `new Date()` for a business date. |
| Tabular alignment | Every number in a table, timeline or totals panel carries `ds-num` (tabular figures, right-aligned). Columns of rupees that jitter as digits change are unreadable. |

### 19.11.6 Devanagari typography

- Font stack: Inter (Latin) + **Noto Sans Devanagari** (Devanagari), both self-hosted via `next/font/local` with `font-display: swap` and subset files, so there is no external request and no FOIT.
- **Minimum line-height 1.5** everywhere text may be Hindi. Devanagari matras sit above and below the baseline and clip at 1.25; this is why Part 23 sets `--leading-normal: 1.5` as the body default, why `ds-label` is 12.5 px / 1.4 rising to 13 px / 1.5 under `:lang(hi)`, and why the 11 px / 1.25 uppercase tier survives only as `ds-label-caps`, which may never be applied to a translated string (Part 23 §23.2.2).
- Hindi strings run roughly 15–25 % longer than English. Every layout is tested at both locales; buttons and chips must not have fixed widths, and truncation uses `truncate` with a `title`/tooltip rather than a hard character cap.
- `lang` is set on `<html>` so the browser picks the right font and hyphenation; a mixed-script line (an English invoice number inside a Hindi sentence) inherits correctly from the stack.
- Numerals stay **Latin** in both locales (`1,23,456`), not Devanagari numerals — this matches every Indian billing app and every printed invoice, and `Intl` with `en-IN` gives it by default. Every rupee figure goes through `UbAmount`, whose sign, grouping, zero case, Devanagari rule and accessible name are fixed by Part 23 §23.2.6; an amount element carries `lang="en-IN"` and `dir="ltr"` so a Hindi sentence around it cannot reorder the sign, the symbol and the digits.

### 19.11.7 Translation workflow

1. A developer adds a key to `en.json` with the final English copy, and to `hi.json` with the Hindi copy from the FRD (every FRD §8 specifies both).
2. `npm run i18n:check` runs in CI and fails on: a key present in one file but not the other; a key referenced in code but absent from `en.json`; a key in `en.json` referenced nowhere (reported as a warning, since dynamic closed-union keys exist).
3. `npm run i18n:extract` scans `t('…')` calls and `<TranslatedText id="…"/>` usages and writes `locales/_extracted.json` for review — it never overwrites the real files.
4. Keys are never deleted in the same PR that stops using them; they are removed in a follow-up so a revert does not produce missing keys.
5. Hindi copy is reviewed by a native speaker against the vernacular mapping in canon §0.2 (उधार दिया / जमा / बाकी / हिसाब). Machine translation is a starting draft, never the shipped string, because the domain vocabulary is what makes the product legible to its users.

---

## 19.12 Client-side error handling and observability

### 19.12.1 Error boundaries

Three tiers, using `react-error-boundary` (on the ADR-021 list) plus the App Router's own `error.tsx` files.

| Tier | File | Catches | Renders |
|---|---|---|---|
| Root | `app/error.tsx` | A crash in the provider stack or the shell itself | Full-page "Something went wrong", Reload, and the request id if one is known |
| App | `app/(app)/error.tsx` | A crash inside any authenticated route | The shell stays (sidebar, nav), the content area shows the error card with Retry (`reset()`), "Go to dashboard", and the request id |
| Component | `<UbErrorBoundary>` around each independently-failing region | A crash in one widget | The rest of the page survives; the widget shows a compact error with Retry |

The component tier is used deliberately, not everywhere: each dashboard tile, the invoice line editor, the party timeline, and each chart. The rule is *a region that can fail independently should fail independently* — a broken aging chart must not take down the dashboard a shopkeeper opens every morning.

```tsx
// src/design-system/UbErrorBoundary/UbErrorBoundary.tsx (abridged)
export function UbErrorBoundary({
  children, fallbackTitleId = 'error.widget.title', onReset,
}: Readonly<UbErrorBoundaryProps>) {
  return (
    <ErrorBoundary
      onReset={onReset}
      onError={(error, info) => logClientError(error, info)}
      fallbackRender={({ resetErrorBoundary }) => (
        <UbEmptyState
          variant="error"
          titleId={fallbackTitleId}
          action={{ labelId: 'action.retry', onClick: resetErrorBoundary }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
```

`error.tsx` files are the only components allowed to be written as `'use client'` route files with logic, because Next.js requires it.

### 19.12.2 The single toast channel

There is exactly one toast channel in the application: `snackbarSlice` → `<UbSnackbar/>`, mounted once in the app shell. No component creates its own toast, and `ml-uikit`'s `toast()` is never called directly from a feature.

```ts
// src/redux/slice/snackbarSlice.ts
export type SnackbarSeverity = 'success' | 'error' | 'warning' | 'info';

export interface SnackbarAction {
  readonly labelId: string;
  /** A serialisable action descriptor — NOT a function. The host resolves it. */
  readonly kind: 'retry' | 'undo' | 'navigate' | 'correct' | 'remind';
  readonly payload?: Record<string, string>;
}

interface SnackbarState {
  open: boolean;
  severity: SnackbarSeverity;
  /** i18n key preferred; `message` is the fallback for server-supplied text. */
  id: string | null;
  params: Record<string, string | number>;
  message: string;
  action: SnackbarAction | null;
  requestId: string | null;
  /** Bumped on every show so the host can re-animate an identical message. */
  seq: number;
}
```

Fixed behaviour:

- **One at a time.** A new toast replaces the current one; there is no stack. A shopkeeper at a counter reads one line or none.
- **Duration:** success 4 s, info 4 s, warning 6 s, error 8 s; a toast with an action never auto-dismisses under 6 s.
- **Content follows Koper's rule** (Part 23 §23.1): *what happened, and the move it enables*. "Saved ₹500 · Ramesh now owes ₹2,800" with a **Remind** action beats "Success".
- **Actions are serialisable descriptors, not callbacks**, because the state must survive `JSON.stringify` (§19.3.9). The `UbSnackbar` host maps `kind` to a handler.
- **Errors carry the request id**, rendered as a small `ds-mono` suffix with a copy affordance.
- **Position:** bottom-centre above `UbBottomNav` on mobile (so it never covers the nav or the FAB), bottom-right on desktop.

### 19.12.3 Where failures surface — the decision table

| Failure | Surface |
|---|---|
| Field validation (client or server `validation_error`) | Field-level `UbFieldError`; **no toast** |
| Business 409 with a local presentation (`credit_limit_exceeded`, `insufficient_stock`, `stale_version`, `document_not_draft`, `party_balance_nonzero`) | Inline banner/dialog in the flow that caused it; **no toast** |
| Any other 4xx/5xx on a user-initiated action | Toast (dispatched by the transport layer) + the action's own inline state where it has one |
| List/detail fetch failure | In-place error state with Retry and the request id; toast suppressed for GETs that already render an error state |
| Network failure while offline | The offline strip (§19.10.3); no per-request toast |
| Render crash | Error boundary (§19.12.1) |
| Background/silent work (autosave, prefetch, analytics) | Never a toast. Autosave downgrades to a quiet "Saved on this device only"; the rest fails silently and logs |

### 19.12.4 The request-id rule

Every error surface that a user could screenshot shows the request id. This is the whole of client-side observability at MVP and it is enough, because the backend logs structured JSON keyed by `request_id` and `tenant_id` (ADR-018).

The rule, stated precisely: **if an error is rendered as anything larger than a field message, it renders `error.requestId`** — in `ds-mono`, `ds-caption` size, `text-text-muted` (re-toned to 4.83:1 in Part 23 §23.2.4 — the old value was 2.87:1 and this is the line a distressed user is trying to read), prefixed by the `error.requestIdLabel` key ("Reference"), with a copy button. Not in a tooltip, not behind a "details" disclosure: visible.

### 19.12.5 Logging policy

**No Sentry, no LogRocket, no third-party client monitoring at MVP** (ADR-018, ADR-021). What exists:

- `console.error` for genuine bugs: a caught exception that is not an `ApiError`, a render crash captured by a boundary, a failed invariant. Always with a stable prefix (`[ub:sales]`) and a serialisable context object.
- `console.warn` for recoverable misuse, in **development only**: a missing i18n key, a POST without a caller-supplied idempotency key, a selector returning a fresh object every call.
- **`console.log` is banned in committed code** and fails lint.
- **Nothing that could contain PII is logged.** Mobile numbers, party names, GSTINs, amounts and note text never appear in a console message or an analytics property. Log ids, codes and counts.
- `logClientError(error, info)` in `src/utils/logging.ts` is the single funnel: today it formats and calls `console.error`; when a partner deployment wants Sentry in Phase 2, that one function gains a transport and nothing else in the codebase changes.

Analytics events (the `ub.<module>.<event>` names specified in every FRD §18) go through `src/utils/analytics.ts`, which is a no-op unless `NEXT_PUBLIC_ANALYTICS_ENABLED` is set. It buffers events and flushes to `POST /api/v1/analytics/events` in batches. It is not a third-party SDK, and it obeys the same no-PII rule.

---

## 19.13 Testing hooks at the architecture level

Part 30 owns the test strategy; this section owns only the **architectural affordances** that make the strategy possible, because they are decisions about code structure.

### 19.13.1 What is testable where

The layering exists partly so that most logic can be tested without React at all.

| Layer | Test type | Tooling | What is asserted |
|---|---|---|---|
| View-model (`view-model/*.ts`) | Pure unit | Jest, no DOM | Tax engine against the shared fixture table; status→tone maps; `rowMenu` permission filtering; Rule 46 checks; display formatting |
| `src/utils/*` | Pure unit | Jest | Money arithmetic on decimal strings; Indian grouping; tenant-timezone date maths; GSTIN checksum; case mapping; query-string building |
| Validation schemas | Pure unit | Jest | Each schema accepts its valid fixtures and rejects each invalid one with the documented message key |
| Slices | Unit | Jest, reducer called directly | `extraReducers` for pending/fulfilled/rejected; the invalidation map's patch-and-stale behaviour; `resetAllFeatureState` |
| Thunks | Unit | Jest with the service module mocked | Success maps to the payload shape; failure calls `rejectWithValue` with a normalised `ApiError`; abort is not a failure |
| Services | Unit | Jest with `axios-mock-adapter`-style manual mock | Wire→domain mapping; money stays a string; query params; idempotency header passed through |
| Hooks | Integration | RTL `renderHook` + a real store | The fetch-on-mount rule; debounce commits once; stale triggers exactly one refetch; abort on filter change |
| `Ub*` components | Component | RTL | Renders each state; a11y roles and names; `className` merge; keyboard interaction; `memo` does not break ref forwarding |
| Feature components | Component | RTL + `renderWithProviders` | The FRD's §9 States table, row by row — Initial, Loading, Empty, Success, Error, Disabled, Partial |
| Page journeys | E2E | Playwright (Part 30; not in the frontend dependency list — it runs from the repo root) | The FRD's §22 Acceptance Criteria |

`src/tests/renderWithProviders.tsx` is the one shared harness: it wraps a subject in a fresh store (with optional preloaded state), `IntlProvider` with real `en` messages, the theme provider and a memory router stub. Every component test uses it; nobody assembles providers by hand.

### 19.13.2 `data-testid` conventions

Queries prefer accessible roles and names (`getByRole('button', { name: /issue/i })`) because those assertions also verify accessibility. `data-testid` is the fallback for things with no accessible identity, and when used it follows a strict shape:

```
data-testid="<feature>-<element>[-<qualifier>]"

party-list-row               party-list-row-actions
party-totals-receivable      invoice-line-row
invoice-totals-grand         invoice-issue-button
ledger-entry-drawer          ledger-entry-amount
snackbar                     offline-banner
```

Rules: lowercase kebab-case; no ids or indices baked in (use `data-row-id` as a *separate* attribute when a row must be addressed); test ids are never used for styling or querying in application code; a test id on a `Ub*` component is passed through from the caller rather than hard-coded inside the design system.

### 19.13.3 The MSW decision

**Mock Service Worker is not used.** Services are mocked at the module boundary with `jest.mock('../api/partyService')`, and the transport layer is tested with a small hand-written axios adapter mock.

The reasoning, recorded so it is not revisited casually:

- MSW is another dependency and another runtime (a service worker in the browser, an interceptor in Node) for a benefit — testing the wire — that we get more cheaply by unit-testing the service functions directly against a fixture JSON body.
- The layering already puts *all* wire knowledge in one thin file per feature. Mocking one module is both simpler and more precise than intercepting HTTP.
- E2E tests run against a **real backend** from docker-compose with seeded fixtures (§19.14.3), which is a stronger guarantee than a mocked wire and is available locally because the whole stack is one `docker compose up`.

The trade-off accepted: component tests do not exercise the axios layer. That layer is covered by its own unit tests (refresh single-flight, idempotency injection, error normalisation) and by E2E.

Fixture bodies live in `src/tests/fixtures/<module>/*.json` and are **copied from the Part 22 examples and the backend's own API tests**, so a contract change breaks both sides.

---

## 19.14 Build, environment configuration and local-first development

### 19.14.1 Environment variables

Only `NEXT_PUBLIC_*` variables reach the browser, and the list is deliberately tiny. Everything else the client needs — branding, enabled modules, feature flags, plan limits — comes from `GET /auth/me` at runtime, because those are **per tenant**, not per build. A white-label deployment must not require a rebuild.

```bash
# .env.local.example
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_NAME=UdhaarBook
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_ENV=local                 # local | staging | production
NEXT_PUBLIC_ANALYTICS_ENABLED=false
NEXT_PUBLIC_SW_ENABLED=false          # service worker off in local dev
NEXT_PUBLIC_COMMIT_SHA=               # injected by CI; shown in Settings → About
```

`src/constants.ts` is the only file that reads `process.env`, and it validates at module load so a missing variable fails loudly at boot rather than as a mysterious 404 later:

```ts
const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing required env var ${name}. See .env.local.example.`);
  return value;
};

export const API_BASE_URL = required('NEXT_PUBLIC_API_BASE_URL', process.env.NEXT_PUBLIC_API_BASE_URL);
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'UdhaarBook';
export const DEFAULT_LOCALE = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en') as Locale;
export const IS_PRODUCTION = process.env.NEXT_PUBLIC_ENV === 'production';
export const SW_ENABLED = process.env.NEXT_PUBLIC_SW_ENABLED === 'true';
export const ANALYTICS_ENABLED = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';

export const MAX_AMOUNT = '99999999.99';
export const MAX_QTY = '9999999.999';
export const SEARCH_DEBOUNCE_MS = 300;
export const AUTOSAVE_DEBOUNCE_MS = 500;
```

`grep -r "process.env" src/ app/` returning anything other than `src/constants.ts` is a defect.

### 19.14.2 Same-origin API and cookies

httpOnly, `SameSite=Lax` cookies (§19.7.1) require the API to be same-origin with the app in every deployed environment. This is achieved by proxying, not by CORS relaxation:

- **Local and single-VPS (docker-compose):** the `frontend` service proxies `/api/*` to `backend:8000` via a Next.js rewrite. `NEXT_PUBLIC_API_BASE_URL` is `/api/v1` — a relative URL — in these environments.
- **Behind a reverse proxy (production):** nginx/Caddy serves the app at `/` and the API at `/api/`, same host, same cookies.
- The absolute `NEXT_PUBLIC_API_BASE_URL` in `.env.local.example` exists only for the case where a developer runs `next dev` outside compose against a separately-running backend; in that mode cookies require `SameSite=None; Secure` and the developer accepts a warning.

```js
// next.config.js (excerpt)
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  images: { remotePatterns: [{ protocol: 'http', hostname: 'localhost' }, { protocol: 'https', hostname: '**' }] },
  async rewrites() {
    return process.env.API_PROXY_TARGET
      ? [{ source: '/api/:path*', destination: `${process.env.API_PROXY_TARGET}/api/:path*` }]
      : [];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
        // camera=(self) because the invoice/entry photo capture uses it.
      ],
    }];
  },
};
```

A Content-Security-Policy is added at the reverse proxy in Phase 2 rather than in `next.config.js`, so that the same header set covers the API and the media endpoint too.

### 19.14.3 Local-first development under docker-compose

ADR-019: one `docker-compose.yml` at the repository root runs the whole product, and that is the supported way to develop. The frontend is not special-cased.

```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_DB: udhaarbook, POSTGRES_USER: udhaar, POSTGRES_PASSWORD: udhaar }
    volumes: [ 'pgdata:/var/lib/postgresql/data' ]
    ports: [ '5432:5432' ]
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U udhaar'], interval: 5s, retries: 10 }

  backend:
    build: ./backend
    command: python manage.py runserver 0.0.0.0:8000
    environment:
      DATABASE_URL: postgres://udhaar:udhaar@db:5432/udhaarbook
      DJANGO_DEBUG: 'true'
      CORS_ALLOWED_ORIGINS: http://localhost:3000
    volumes: [ './backend:/app', 'media:/app/media' ]
    ports: [ '8000:8000' ]
    depends_on: { db: { condition: service_healthy } }

  scheduler:
    build: ./backend
    command: python manage.py run_scheduler          # ADR-012: cron, not Celery
    environment: { DATABASE_URL: postgres://udhaar:udhaar@db:5432/udhaarbook }
    depends_on: [ backend ]

  frontend:
    build: { context: ./frontend, target: dev }
    command: npm run dev
    environment:
      NEXT_PUBLIC_API_BASE_URL: /api/v1
      API_PROXY_TARGET: http://backend:8000
      NEXT_PUBLIC_ENV: local
      NEXT_PUBLIC_SW_ENABLED: 'false'
    volumes: [ './frontend:/app', '/app/node_modules' ]
    ports: [ '3000:3000' ]
    depends_on: [ backend ]

volumes: { pgdata: {}, media: {} }
```

The first-run path is three commands and is what a new contributor — or an AI agent building this — follows:

```bash
docker compose up -d db backend
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_demo     # one tenant, 40 parties, 60 items, 90 days of history
docker compose up frontend                                 # http://localhost:3000
```

`seed_demo` is a normative requirement on the backend, not a nicety: the frontend's empty states, pagination, aging buckets, Hindi copy and print templates cannot be reviewed against an empty database, and E2E tests run against this seed.

### 19.14.4 Scripts

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --max-warnings=0",
    "format": "prettier --write --list-different .",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "i18n:check": "node scripts/check-locales.mjs",
    "i18n:extract": "node scripts/extract-messages.mjs",
    "check:contrast": "node scripts/check-contrast.mjs",
    "check:bundle": "node scripts/check-bundle.mjs",
    "verify": "npm run type-check && npm run lint && npm run i18n:check && npm run test && npm run build && npm run check:bundle"
  }
}
```

`npm run verify` is the gate: it is what CI runs and what a contributor runs before pushing. A pre-commit hook (husky) runs `lint-staged` with Prettier and ESLint on changed files only; the full gate is not run on commit because it is too slow to be honoured.

### 19.14.5 Dockerfile

Multi-stage, with a `dev` target used by compose and a `runner` target used for deployment. Standalone output keeps the production image small enough to run on a single small VPS, which is the ADR-019 deployment target.

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM deps AS builder
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ARG NEXT_PUBLIC_COMMIT_SHA
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

### 19.14.6 CI pipeline

One workflow, five jobs, all required to merge:

1. **install** — `npm ci` with a lockfile cache.
2. **static** — `type-check`, `lint --max-warnings=0`, `i18n:check`, `check:contrast`.
3. **test** — `jest --coverage`, with a floor of 80 % statements on `view-model/**`, `utils/**`, `validation/**` and `redux/**` (the pure layers, where coverage is meaningful) and no floor on components.
4. **build** — `next build`, then `check:bundle` against the §19.9.2 budgets.
5. **lighthouse** — serve the build, run Lighthouse CI on the six smoke routes with mobile throttling, assert the §19.9.1 thresholds.

E2E runs nightly and on release branches, against the docker-compose stack with `seed_demo`, because it needs the backend and is too slow for every PR.

### 19.14.7 What an agent should build first

For the avoidance of ordering ambiguity, the dependency order for a from-scratch build is:

1. `src/constants.ts`, `src/utils/*` (cn, money, dates, caseMapper, apiError, queryString), `src/types/api.types.ts`.
2. `tokens/*.css`, `tailwind.config.js`, `typographyPlugin`, `app/globals.css`, fonts.
3. `src/api/APIPaths.ts`, `src/api/AxiosInstances.ts`.
4. `src/redux/store.ts` with `snackbarSlice`, `sessionSlice`, `whiteLabelSlice`, `localeSlice`, `themeSlice`.
5. `src/hooks/useTranslation.ts`, `src/hooks/useValidationSchemas.ts`, `locales/en.json`, `locales/hi.json` seeded with the shared keys.
6. The MVP `Ub*` subset in the order listed in Part 23 §23.7 item 2, each with its test and its gallery entry.
7. `src/components/layout/*` (`UbAppShell`, sidebar, header, bottom nav), `features/navigation/sidebarConfig.ts`, `features/auth/*`, the `(auth)` routes and `(app)/layout.tsx`.
8. The `parties` feature end to end, as the reference implementation of §19.2.3.
9. `ledger`, then `inventory`, then `sales`, then `purchases`, `payments`, `expenses`, `reports`, `settings`, `notifications`.

Step 8 is the checkpoint: if the parties feature does not look exactly like §19.2.3 — same folders, same file names, same slice/thunk/service triple, same hook shape, no axios in a component, no hard-coded string — stop and fix it before writing a second feature, because every later feature will copy it.
