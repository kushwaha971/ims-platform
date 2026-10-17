# 06 · Shared components and frontend architecture

Status: **proposed**, 17 Oct 2026. Principle: reuse first, add only with a reason, keep business logic out of the design system.

## 1. What exists (92 entries in `src/design-system/`)

The design system already covers almost everything the revamp needs. The table maps each need to what is there.

| Need | Existing component | Verdict |
|---|---|---|
| Buttons, pending state | `UbButton` (`busy`, `busyLabel`) | keep; add automatic pending (§3) |
| Whole-row / tile press | `UbPressable` (button semantics, `aria-current`) | keep; becomes the base of list rows and app tiles |
| Fields | `UbTextInput`, `UbMoneyInput`, `UbPhoneInput`, `UbDateInput`, `UbDateRangePicker`, `UbSelect`, `UbNativeSelect`, `UbCombobox`, `UbAsyncCombobox`, `UbQuantityInput`, `UbOtpInput`, `UbSearchInput`, `UbTextArea`, `UbTokenInput`, `UbSwitch`, `UbCheckbox`, `UbRadioGroup`, `UbChoiceChips` | keep all; check every input is 16 px on phones (mobile-redesign A19) |
| Forms | `UbForm`, `UbField`, `UbFieldError`, `UbInputHint`, `UbDisclosure` | keep; add in-flight guard (§3) |
| Overlays | `UbDrawer`, `UbDialog`, `UbConfirmDialog`, `UbActionSheet`, `UbPopover`, `UbShareSheet`, `UbTooltip`, `CompactOverlays` | keep; notifications move from `UbDialog` to `UbPopover` (desktop) |
| Navigation | `UbBottomNav`, `UbBottomBar`, `UbFab`, `UbTabs`, `UbChipTabs`, `UbMenuList`, `UbLink`, `UbActionLink`, `UbPageHeader`, `UbPageShell` | keep; `UbBottomNav` gains the App slot (§2) |
| Lists and tables | `UbDataGrid` (table + card modes), `UbLoadMore`, `UbFilters`, `UbFilterChip`, `UbInfoRow`, `UbListItemText` | keep; card mode is the phone default |
| Figures and charts | `UbAmount`, `UbStatSummary`, `UbStatusBadge`, `UbTag`, charts (`UbAgingBars`, `UbGroupedBars`, `UbRankedBars`, `UbTrendArea`, `UbChartTable`, `UbStatCard`) | keep |
| States | `UbSkeleton`, `UbEmptyState`, `UbStatusBanner`, `UbSnackbar`, `UbProgress` | keep; add route skeletons per screen family |
| Home blocks | `UbHomeBlocks`, `UbTotalDock` | keep; TV-03 change to `UbTotalDock` (stack below `sm`) |

## 2. The few new pieces, and why each can't be an existing one

| New | What it is | Built from | Why new |
|---|---|---|---|
| `AppSwitcherSheet` (feature: `F/navigation`) | the phone App sheet (04 §2) | `UbActionSheet`, `UbPressable`, `UbMenuList` | business-aware (reads session apps), so it is a feature component, not design system |
| App slot in `UbBottomNav` | 5th item with the active app's icon and name | `UbBottomNav` item with an `onPress` instead of `href` | the bar only supports links today |
| `SidebarAppTree` (feature) | apps with the active one expanded (04 §3) | existing `NavSections` rows | regroups existing rows; no new primitive |
| `NotificationPopover` (feature) | desktop notifications | `UbPopover`, existing `NotificationPanel` list body | reuse the list body; only the frame changes |
| `/notifications` page (feature) | phone notifications | same list body, `UbPageShell`, `UbLoadMore` | same |
| `RouteProgress` (design system) | 2 px top progress line during navigations | CSS + a small store flag | no equivalent exists |
| `useNavigate` hook (`src/hooks`) | `router.push` wrapped in `useTransition`; exposes `pending` for the tapped control and drives `RouteProgress` | React 19 `useTransition` | one place instead of 110 handler-level pushes |
| `useAsyncAction` hook (`src/hooks`) | runs an async handler once, exposes `busy`, ignores repeats while pending | — | removes 193 hand-managed `busy` flags over time |
| Route skeletons (`loading.tsx` per route group) | list, detail, form, home shapes | `UbSkeleton` | none exist today (A-01) |
| `/account` page (feature) | the You page (04 §9) | `UbPanel`, `UbInfoRow`, existing account actions | presentation of existing data |

Nothing else is new. No new package: `useTransition`, `useReportWebVitals` and the visual-viewport API are already available.

## 3. Behaviour added to existing components

- **`UbForm`**: ignore a submit while the previous one is in flight; expose `submitting` to children. Backward compatible: existing `busy` props keep working.
- **`UbButton`**: if `onClick` returns a promise, show busy until it settles (opt-in prop `autoBusy` first, default later after a full sweep).
- **Pressed state**: a shared `:active` treatment (darker fill, 0.98 scale, `--dur-instant`) on `UbButton`, `UbPressable`, `UbBottomNav` items and chips; checked at 390 px in both themes.
- **`UbBottomNav`**: an item kind `{ kind: 'action', onPress }` alongside links; hide while the keyboard is open (04 §6).

## 4. Rules that keep this from becoming over-engineered

1. A shared component takes props for what varies, never an `app` name. No `=== 'library'` in shared code (platform/16).
2. Business rules stay in features (`F/<app>/view-model/`, thunks, services). The design system never formats a fee state or decides a loan status.
3. A component is shared when a **second** caller needs it, not before (the `UbTimeline` rule in DESIGN-SYSTEM.md).
4. Every feature component that a route doesn't need on first paint is `dynamic()` (the drawer rule from CLAUDE.md).
5. Refactors are incremental: old and new call sites coexist, guarded by the existing tests, one feature at a time.

## 5. Duplication to remove (found in the audit)

| Duplicate | Where | Plan |
|---|---|---|
| Two "More" surfaces (`/more` page and `AccountMenu`) with overlapping rows | `MorePageContent`, `AccountMenu` | both read one `accountRows` list; phone shows it in the App sheet |
| Notification list rendered only inside a dialog | `NotificationPanel` | split into `NotificationList` (body) used by popover and page |
| Handler-level `router.push` with ad hoc pending state | 110 call sites | migrate to `useNavigate` per feature during Phases 5–6 |
| Hand-managed `busy` per form | 193 sites | migrate to `useAsyncAction` / `UbForm.submitting` per feature |
| `ThemePicker.tsx` unused | `F/auth/components/` | reuse in `/account` or delete after confirming no import |
| Possibly unused deps `recharts`, `date-fns` | `package.json` | confirm with a build, then remove (bundle win, no new package) |

## 6. State and data (binding decisions kept)

Redux Toolkit with `createAsyncThunk`, lazy injected slices (`combineSlices().inject`), the invalidation registry, React Hook Form + central Yup hook. **TanStack Query is not used.** The revamp adds no state library.
