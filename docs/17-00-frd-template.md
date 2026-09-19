# Part 17 — Functional Requirements Document (FRD)

## 17.0 How to read the FRD

Part 17 specifies every MVP and Phase 2 feature listed in the Feature Catalogue (Part 16) at implementation depth. Each feature follows the same 24-section template so an engineer or AI coding agent can build it without inventing product decisions. Where a section does not apply it says "Not applicable" with a reason. Cross-references use feature IDs (`LED-03`), table names (Part 21) and endpoint paths (Part 22).

### 17.0.1 Feature specification template (normative)

1. **Business Objective** — why the feature exists, measured how.
2. **User Personas** — from Part 14.
3. **User Stories** — "As a … I want … so that …", each with an ID `US-<FEATURE>-n`.
4. **Functional Requirements** — numbered `FR-n`, testable statements.
5. **Non-Functional Requirements** — latency, offline behaviour, accessibility, localisation, device targets.
6. **User Flow** — primary path and alternates, step-by-step.
7. **UI Requirements** — screens, components (named `Ub*`/`ML*`), layout on mobile (< 640 px) and desktop (≥ 1024 px), fields with input types, keyboard/scanner behaviour.
8. **UX Requirements** — copy rules (English + Hindi keys), colour semantics (red = you gave/receivable, green = you got), confirmations, undo, defaults.
9. **States** — Initial, Loading, Empty, Success, Error, Disabled, Partial, Processing, Completed, Failed — what the user sees in each.
10. **Validation Rules** — field-level and cross-field, with error messages (English) and codes.
11. **Business Rules** — numbered `BR-n`; invariants; calculations with formulas and rounding.
12. **Permissions** — codenames from canon §0.9; role matrix.
13. **Edge Cases** — numbered `EC-n` with expected behaviour.
14. **API Requirements** — endpoints used (Part 22) with request/response deltas, validation, errors, auth, pagination/filter/sort/search.
15. **Database Impact** — tables/columns written or read (Part 21); new indexes if any.
16. **Audit Requirements** — actions and snapshots.
17. **Notifications** — in-app, SMS, WhatsApp; templates with placeholders.
18. **Analytics / Event Tracking** — event names `ub.<module>.<event>` and properties.
19. **Security** — tenant isolation, input hardening, rate limits, PII.
20. **Performance** — targets and strategy (indexes, caching, pagination).
21. **Testing** — unit, API, component, E2E, permission, edge-case test list with IDs `T-<FEATURE>-n`.
22. **Acceptance Criteria** — Given/When/Then, each mapped to a user story.
23. **Dependencies** — features, settings, providers.
24. **Future Enhancements** — pointers to later-phase features.

### 17.0.2 Shared UI vocabulary used by all FRDs

App-level design-system wrappers (`src/design-system/`, all built on `ml-uikit` `ML*` primitives — see Part 23 for the reuse/extend decision per component):

| Wrapper | Built on | Purpose |
|---|---|---|
| `UbPageShell` / `UbPageHeader` | layout + `MLTypography` | Title, description, actions, mobile menu button |
| `UbDataGrid` | `@tanstack/react-table` + `MLTable*`, `MLTablePagination*`, `MLSkeleton`, `MLEmpty` | Server-paginated grid with toolbar (search, filters, actions), row selection & bulk actions, column visibility persisted, skeleton rows, empty/error states, card layout on mobile |
| `UbTabs` | `MLTabs*` | Status tabs with counts |
| `UbStatCard` (+ skeleton) | `MLCard` | KPI tiles with tone (default/success/warning/danger) |
| `UbDialog`, `UbConfirmDialog`, `UbReasonDialog` | `MLDialog*`, `MLAlertDialog*` | Modals; single-open policy via `useExclusiveModal`; reason capture for void/reverse |
| `UbDrawer` | `MLSheet*` / `MLDrawer*` | Right-side (desktop) / bottom (mobile) forms and detail panes |
| `UbForm`, `UbField`, `UbFieldError`, `UbInputHint` | `MLForm*`, `MLField*`, `MLInput`, `MLTextarea`, `MLSelect*`, `MLCheckbox`, `MLSwitch`, `MLRadioGroup` | RHF-bound field anatomy |
| `UbMoneyInput`, `UbQuantityInput`, `UbPercentInput` | `MLInputGroup*` | Decimal-safe numeric inputs with ₹/unit/% addons, Indian grouping display |
| `UbDateInput`, `UbDateRangePicker` | `MLCalendar`, `MLPopover`, `MLDateRangePicker` | Date with quick chips Today/Yesterday/Custom; dd/mm/yyyy |
| `UbPhoneInput` | `MLPhoneInput` | +91 default, 10-digit validation |
| `UbCombobox`, `UbAsyncCombobox` | `MLCommand*`, `MLPopover`, `MLSearchableDropdown*` | Party/item pickers with server search, create-inline option, barcode paste support |
| `UbSearchInput` | `MLInputGroup` | Debounced 300 ms search |
| `UbStatusBadge` | `MLBadge` | Tone-mapped statuses |
| `UbAmount` | `MLTypography` (`ds-num-*`) | Signed amount with colour semantics and en-IN formatting |
| `UbEmptyState` | `MLEmpty*` | Three variants: first-use, filtered-empty, error |
| `UbSnackbar` | `MLToaster` (sonner) | Single toast channel driven by Redux `snackbarSlice` |
| `UbFileUpload`, `UbImagePreview` | `react-dropzone` + `MLCard` | Photos/receipts with compression |
| `UbLineItemsEditor` | `MLTable*` + inputs | Document line editor (item search, qty, price, discount, tax) with per-line totals; keyboard navigation; mobile card mode |
| `UbTotalsPanel` | `MLCard` | Subtotal/discount/tax/round-off/grand total with live recompute (preview only) |
| `UbPartyHeader` | `MLCard`, `MLAvatar` | Party name, balance, quick actions |
| `UbTimeline` | `MLItem*` | Ledger/activity timeline with date groups |
| `UbBottomNav`, `UbFab` | custom + `MLButton` | Mobile navigation (Parties · Items · + · Bills · More) and floating action |
| `UbSidebar` | `MLSidebar*` | Entitlement-driven desktop navigation |
| `UbShareSheet` | `MLDropdownMenu*` | WhatsApp / copy link / download PDF / SMS |
| `UbQrCode` | inline SVG | UPI QR |
| `UbSkeleton` | `MLSkeleton` | Shapes for lists/cards/forms |
| `UbHelpHint` | `MLTooltip`, `MLHoverCard` | Contextual help "?" |

### 17.0.3 Shared UX rules

- Mobile-first: every form single-column below `sm`; every table becomes cards below `md`; primary action reachable by thumb (bottom sheet / FAB).
- Numbers: `Intl.NumberFormat('en-IN')`, ₹ symbol, negative shown as "You will give" in green tones? **No** — colour semantics fixed: amounts the party owes the business (receivable, "you gave") in red-ish `destructive` tone; amounts received / owed to party in `success` tone. Text labels always accompany colour (accessibility).
- Dates: dd/mm/yyyy display, quick chips Today / Yesterday / Pick; future business dates rejected except due dates and collection dates.
- Every destructive or financial state change (void, reverse, correct, archive) requires `UbReasonDialog` with a reason (≥ 3 chars) and shows the consequences ("Stock +2, Ledger −₹898").
- Offline/poor network: writes show optimistic row with "Saving…" then confirmation; failure keeps the draft locally and shows retry.
- Three empty states everywhere: first-use (illustration + primary CTA + help link), filtered-empty (clear filters), error (retry + request id).
- Every list: search debounced 300 ms, only `tab` (and date range) in URL, page resets on filter change, skeleton rows while loading, totals row/header reflecting the filtered set.
- Copy in English and Hindi (`en.json`, `hi.json`); vernacular terms per canon §0.2; numbers and dates localized via Intl.
