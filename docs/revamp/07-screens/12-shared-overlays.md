# Shared overlays and states: drawers, dialogs, sheets, popovers, pickers, toasts, empty, error, loading, success

Status: **specified (wave 2), 17 Oct 2026 — not approved, not built.** Applies to every app (Shop, Udhaar, Library, Lending, settings). For Library and Lending only the presentation rules apply; their dialogs keep their fields, rules and endpoints (02 §2–3).

Paths are relative to `frontend/src/` unless stated. Every pattern names the existing component that implements it; the only new pieces are marked **NEW** and are listed together in §9.

## 1. Choosing the pattern

| The job | Phone (< 1024 px, `useIsMobileLayer`) | Desktop (≥ 1024 px) | Component |
|---|---|---|---|
| A form with more than 3 fields, or one the merchant works through (entry, party, payment, correction) | **Bottom sheet**, up to 92 dvh, grows to content | **Right drawer** 520 px, full height, page visible beside it | `UbDrawer` (`MLDialog placement="drawer"`) |
| A question, a short form (≤ 3 fields), a block | Bottom sheet, up to 90 dvh | **Centred dialog** 420 px | `UbDialog` |
| "Are you sure?" with a consequence | Bottom sheet | Centred dialog | `UbConfirmDialog` |
| "Are you sure?" that needs a reason (reverse, void, cancel) | Bottom sheet | Centred dialog | `ReasonConfirmDialog` (`components/records/`) |
| 3+ secondary actions (⋯) | **Action sheet** of worded rows | Same sheet as a centred dialog (never a Radix popover on a money route: +10.9 KB, bundle gate) | `UbMoreActions` → `UbActionSheet` + `UbMenuList`; header actions via `UbPageHeaderMobileActions` |
| 1–2 secondary actions | Buttons on the screen | Buttons on the screen | `UbButton`, `UbActionLink` |
| A small panel anchored to a control (notifications, filter list, column menu) | Not used: becomes a sheet or a page | **Popover** 300 px (`w-ub-popover`) or the hand-rolled `FilterAnchor` | `UbPopover` (lazy only), `UbFilters/FilterAnchor` |
| Send something to a customer | Share sheet (bottom) | Share sheet (centred dialog) | `UbShareSheet` + `UbMessageBox`, `utils/share.ts`, `useShareFeedback` |
| A date | Field + quick chips; calendar sheet | Field + quick chips; calendar popover | `UbDateInput` (`UbDateCalendar`) |
| A period | One dropdown button ("📅 This month ▾") with presets and Custom | Same, in `UbFilterBar`'s end slot | `UbDateRangePicker` |
| Pick from a fixed list | Sheet list with search when > 8 | Combobox | `UbCombobox`, `UbSelect`, `UbNativeSelect` (≤ 6 choices on phones) |
| Pick from the server (party, item) | **Full-height picker sheet** with the search field focused | Combobox under the field | `UbAsyncCombobox` + `usePartySearch` / `useItemSearch` (never a second fetch, lint-enforced) |
| Filters for a list with more than one filter | **Filter sheet** from a Filter button with a count; applied filters as removable chips | Inline chips + dropdowns in `UbFilterBar` | `UbFilters`, `UbFilterChip`, `UbChoiceChips` |
| One filter | Chips inline | Chips inline | `UbFilterChip` |
| What just happened | Snackbar above the bottom furniture | Snackbar below the page header, right | `UbSnackbar` via `showSnackbar` (one channel, mounted in `AppProviders`) |
| A rule refused an action | Banner **inside the sheet** that asked | Same | `UbStatusBanner` |
| A whole page's notice (offline, archived, read-only) | Banner under the header | Same | `UbStatusBanner`, `NetworkStrip` |
| Nothing to show | Empty state in place of the list | Same | `UbEmptyState` (`firstUse` / `filtered` / `error`) |
| Waiting for data | Skeleton in the final shape | Same | `UbSkeleton` (`list`, `card`, `form`, `app`, `text`), `loading.tsx` families (02-global-shell) |
| A document was created | **Success screen** | Success panel in the page | composed (§8.6), not a new component |
| An explanation on hover | Not used (no hover); put the words on the screen | `UbTooltip` (never the only place a fact lives) | `UbTooltip` |

Rules that decide between them:
1. **One overlay at a time.** An action sheet closes before the overlay it opens (`UbActionSheet`, WP-03 D-04a); a dialog opened from another overlay passes `returnFocusRef` (the ⋯ that opened the first one). Never a dialog on a dialog: a blocked state swaps the same dialog's body (archive pattern).
2. **A form belongs to the chunk that opens it**: every drawer and dialog with a form is `dynamic(..., { ssr: false })` and mounted as `{open && <Lazy … />}`. Small, first-tapped overlays (⋯ sheets, `EntryActionsMenu`) stay static.
3. **No hover-only and no swipe-only actions.** Every swipe has a visible equivalent.
4. **Phones get sheets from the bottom; desktop never gets a bottom sheet.** The switch is `MLDialog`'s breakpoint (`sm` for dialogs, `lg` for drawers) and is kept.

## 2. Behaviour every overlay shares

### 2.1 Sizes and anatomy (from `primitives/mlOverlayPrimitives.tsx`)

| | Phone | Desktop |
|---|---|---|
| Dialog | bottom sheet, full width, `max-h-[90dvh]`, top radius 12 | centred, 420 px (`sm:w-[420px]`), radius 12 |
| Drawer | bottom sheet, `max-h-[92dvh]`, top radius 12 | right panel 520 px, full height, left radius 12 |
| Header / body / footer | each pads itself (24 px; 16 px with `CompactDrawer`/`CompactDialog`), hairline rules between, **only the body scrolls** | same |
| Scrim | `bg-black/40` (the row being acted on stays visible) | same |
| Drag handle | NEW: 36 × 4 px handle on phone sheets; swipe down closes (a visible × always exists) | none |
| Footer | sticky; one primary on phones (Cancel hidden where × does the job, e.g. `LedgerEntryDrawer`); safe-area bottom padding | Cancel + primary, right-aligned |

Titles wrap to two lines and never truncate; a title that names a record names it in full ("You gave · Shree Ganesh Kirana and General Store").

### 2.2 Focus (the MLDialog `autoFocus` lesson)

1. On open, focus goes to **the element the caller marked `autoFocus`**; only if focus is not already inside does `MLDialog` focus the first focusable (`mlOverlayPrimitives.tsx:208-242`). This is what makes the entry drawer open with the amount focused, the numeric keypad up and **no error shown** — before the fix, focus moved to ×, the amount blurred, `mode: 'onTouched'` validated an empty field and the sheet opened red. jsdom never showed it; only a real browser did.
2. **Required per pattern:** a form drawer marks its first field `autoFocus` (amount, name); a confirm marks **Cancel** `autoFocus`; an action sheet focuses its first row; a share sheet focuses the message box only on desktop (on phones, focusing it raises the keyboard over the channels — focus the first channel instead).
3. Never validate on open. Errors appear after blur of a touched field, or on submit.
4. Focus is trapped; Tab cycles; Esc closes (with the unsaved rule, §2.7).
5. On close, focus returns to the opener, or to `returnFocusRef` when the opener was unmounted (QA D1, WCAG 2.4.3).
6. Test it in a browser: every new overlay gets a Playwright check that `document.activeElement` is the intended control after open and no `[aria-invalid="true"]` exists.

### 2.3 Scroll containment

Body scroll is locked while open (`acquireBodyScrollLock`); only the overlay body scrolls (`overflow-y-auto`, `min-h-0`); `overscroll-behavior: contain` on the body (NEW one-line class) so a fling at the end does not scroll the page or trigger pull-to-refresh. A sheet's content never makes the page wider than the viewport (the `scrollWidth` check from the `--shots` sweeps applies inside overlays too). Important content is never placed below the fold of the overlay's own scroll container without a reason (the credit "already crossed" hint lesson): refusals and hints that answer the tap are scrolled into view.

### 2.4 Stacking and z-order

Overlay `z-50`; popover `z-[60]`; snackbar above both. Bottom furniture (`UbBottomBar`, `UbBottomNav`, `UbFab`) publishes its height (`--ub-nav-offset`, `useBottomInset`) so the snackbar sits above it; while a sheet is open the snackbar sits above the sheet's footer.

### 2.5 Keyboard open (phones)

- Inputs are 16 px (no iOS zoom).
- NEW `useVisualViewport` (in `src/hooks`, no package): when the visual viewport is > 150 px shorter than the layout viewport, the sheet's max height becomes the visual viewport height, the footer stays pinned above the keyboard, the bottom bar and any dock hide (04 §6), and the focused field is scrolled into view above the footer.
- Numeric fields use `inputMode="decimal"` (money) or `"numeric"` (OTP, quantity without decimals).
- Enter on the last single-line field submits; on phones the keyboard's "Go" does the same.

### 2.6 Android back and browser back (NEW, fixes U-F6)

NEW `useOverlayHistory(open, onClose)` used inside `MLDialog`: on open it pushes one history entry (`{ yourkhataOverlay: id }`, alongside the existing `yourkhataApp` state); `popstate` closes the top overlay instead of leaving the page; closing by ×/Esc/scrim pops that entry. Nested overlays never exist (§1 rule 1), so one entry at a time. Back with unsaved changes asks first (§2.7). Must not break `historyApp.ts` or the statement's URL filters; covered by an e2e that presses back with a sheet open on `/parties/[id]`, `/sales/invoices/new` and `/library/members`.

### 2.7 Closing with unsaved work

- Backdrop never closes a dirty form (`dismissOnBackdrop={!isDirty}`) nor a destructive confirm.
- ×, Esc or back on a dirty form opens a small confirm: "Discard this entry? · **Keep editing** (focused) / Discard". Bill editors keep their draft recovery instead.
- A form never closes mid-request (`ReasonConfirmDialog` and drawers keep `busy` and disable ×).

### 2.8 Busy and duplicate rules (from 05 §3–4)

| Moment | Rule |
|---|---|
| Finger down | pressed look in one frame (`:active`, darker, 0.98 scale) on every button, row and chip in an overlay |
| Tap that opens an overlay whose chunk is not loaded | the tapped control shows a spinner after 120 ms; the overlay opens with a form skeleton if the chunk is still loading at 300 ms |
| Tap that saves | `UbButton busy busyLabel="Saving…"` at once; the form locks; `UbForm` ignores submits while one is in flight (NEW guard, 06 §3); × disabled |
| Slow (> 3 s) | a line under the button: "Still working… it won't be saved twice." |
| Failed | overlay stays open with everything typed; the button becomes "Try again" and resends with the **same** `Idempotency-Key`; the key rotates only after success or a validation error |
| Saved | overlay closes; snackbar names what was saved and the new figure; focus returns to the opener |
| Offline before the tap | Save disabled with the reason in words; where a draft store exists the text says so; nothing claims a write is queued unless it is |
| Optimistic | only for things without money (mark read, toggle filter, pin) |

### 2.9 Accessibility common to all

`role="dialog"` + `aria-modal`, `aria-labelledby` / `aria-describedby` minted by `UbDialog`; confirms use `alertdialog`. Escape closes. 44 × 44 targets with `.ub-hit`, 12 px between small neighbours. Reduced motion: no slide, a 90 ms fade. Hindi at 320 px: titles wrap, footer buttons stack (primary on top today; Tab order note in DESIGN-SYSTEM §5).

## 3. Drawer and bottom sheet (forms) · `UbDrawer`

| Field | |
|---|---|
| Use for | Entry, party create/edit, payment, correction, opening balance, debit note, Library enrol / member edit, Lending borrower edit (layout only). |
| Phone | sheet with handle, title, body, sticky footer with one primary; required fields first, optional ones in `UbDisclosure` with a summary line; one column; labels above. |
| Desktop | 520 px right panel; the list stays visible; Cancel + primary. |
| States | loading chunk → form skeleton; loading data (edit) → fields' skeleton, Save disabled; validation; saving; failed (Try again, same key); refused by a rule (banner in place, §6); offline; read-only (banner, Save hidden); expired session (shell sign-in sheet; draft kept where the form has a draft store). |
| Stress | long names wrap in the title; ₹12,40,378.00 grouped on blur in `UbMoneyInput`; 320 Hindi: two-option radios stay side by side up to two lines; repeated taps: in-flight guard. |
| Must keep | `returnFocusRef`, `dismissOnBackdrop`, `dynamic()` rule, `UbMoneyInput` UX16 rules. |

## 4. Dialog, confirm and reason-confirm · `UbDialog`, `UbConfirmDialog`, `ReasonConfirmDialog`

| Field | |
|---|---|
| Rules (kept from `UbConfirmDialog`) | the confirm button names the act ("Reverse entry", not "OK"); the body is the consequence in one sentence; a destructive confirm never dismisses on the backdrop; destructive is **outlined** danger, never a filled red block; the record is restated (name, amount, date) so the merchant confirms a thing, not a button press. |
| Change (fixes U-F5) | **Cancel is focused on open** for every destructive confirm, in the component (`autoFocus` on the Cancel button in `UbConfirmDialog` and `ReasonConfirmDialog`), not left to callers. Footer order on phones: Cancel first and focused, then the act (safe choice first, mobile-redesign/04 §6.3) — `order="as-written"`. |
| Reason confirm | required reason, minimum shared with the correction drawer (`reasonText`). Cancel is focused on open and the reason field is the next Tab stop; on phones the keyboard comes up only when the merchant taps the field, so the consequence text is read before it is covered. |
| Blocked swap | when the server refuses (409), the same dialog swaps its body to the reason and the ways out (archive → Record payment / Write off); never a second dialog. |
| States | busy on the act; failure keeps the dialog with input; offline: act disabled with a reason; no permission: never opened. |

## 5. Snackbar / toast · `UbSnackbar`

| Field | |
|---|---|
| Where | phone: above the bottom furniture (`useBottomInset`); desktop: below the page header, right (QA B19). One message at a time, 4 s (errors announced `assertive`, others `polite`). |
| Content | what happened + the new figure: "Saved ₹500.00 · balance is now ₹2,800.00". Figures via `formatAmount` when the copy carries ₹. Never "sent" for anything the merchant sends from another app ("WhatsApp opened"). **No "Reference <id>" line** (owner, 7 Oct; `UbRequestId` draws nothing). |
| Errors | network and server failures come through the interceptor once; a form that can answer the error in place (credit limit, archived, validation) suppresses the toast and shows it inside the overlay. |
| 5.1 Action slot (NEW, optional) | `showSnackbar({ …, action: { labelId, onAction } })` → one text button ("Undo", "View", "Reload"), extending the shown time to 10 s. Callers waiting for it: PTY-04 Restore undo, LED-01 entry Undo (owner Q1 in 10-udhaar-book), the shell's "A new version is ready · Reload". The action is a real button, last in tab order before Dismiss. |

## 6. Inline refusals and banners · `UbStatusBanner`

Outlined block with icon and sentence (never a red border alone, never filled red). In an overlay: at the top of the body, scrolled into view and focused when it appears in answer to a tap (`role="alert"` once). Page-level: archived, read-only, offline (`NetworkStrip` = this component's offline/degraded tones).

## 7. Pickers

### 7.1 Date · `UbDateInput`
Field reads "17 Oct 2026"; quick chips above or below ("Today", "Yesterday", "Start of this financial year") as a named group; the calendar has month and year dropdowns (QA B41). Phone: the calendar opens in a bottom sheet; desktop: a popover. Bounds (`min`/`max`) are the field's; "today" is the **tenant's** timezone. Lists print dates as dd/mm/yyyy.

### 7.2 Period · `UbDateRangePicker`
One dropdown button; presets then "Custom range" with from/to; an inverted or over-long range shows a banner and sends nothing.

### 7.3 Combobox and search · `UbCombobox`, `UbAsyncCombobox`, `UbSearchInput`
Desktop: list under the field, keyboard-first (↑↓ Enter, scanner Enter). Phone: a **full-height picker sheet** with the search field focused and the keyboard up, recent/frequent first, a "Create …" row when the caller allows it, and a 250 ms debounce with a 2-character minimum (`usePartySearch`). Loading: three row skeletons under the field; no results: "No one called 'ramesh' · + Add Ramesh"; error: "Could not search · Try again". App-bar search (`MobileQuickSearch`) uses the same sheet.

### 7.4 Filter sheet · `UbFilters`
Phone: a Filter button with a count badge opens a sheet with each filter group, Sort by (radio rows), **Show N results** as the primary (live count when the list already returns totals, otherwise "Apply"), and Clear all. Applied filters show as removable chips under the search. Desktop: chips + `FilterAnchor` dropdowns inline. Filters live in the URL where the list already does that (`usePartyListUrl`). A chip that lights up must change the request (the PTY-02 lesson; assert the network in e2e).

## 8. States

### 8.1 Loading · `UbSkeleton`
Shape of the final content, fluid widths (`max-w-*`, never wider than its tile), real height reserved (CLS ≤ 0.05). Route level: `loading.tsx` families home / list / detail / form (02-global-shell). In a panel: that panel only. Never a full-page spinner. Cached data paints first and a quiet "Updating…" shows in the section heading while it refreshes.

### 8.2 Empty · `UbEmptyState`
Three meanings, three variants: **firstUse** (nothing exists yet: one sentence of why + the one action; the FAB hides so the action isn't shown twice), **filtered** ("No one matches 'ramesh'" + Clear filters + Add with the typed name), **error** (§8.3). An empty **book** is one state, not a report of zeros (owner, 12 Oct: `meta.has_any`).

### 8.3 Error
In place of the content that failed, never the whole page when only a panel failed: "Could not load the transactions — Try again". Page-level only when nothing can be shown (`app/(app)/error.tsx`). The words say nothing saved was lost. No request id is shown.

### 8.4 Partial failure
Each panel owns its error; the main figure and main action stay usable. Secondary lines that fail quietly hide (`suppressErrorSnackbar`) when their absence misleads nobody (e.g. the reminder strip); figures that fail say so ("Could not load") rather than showing ₹0.00.

### 8.5 Offline and expired session
Offline: `NetworkStrip` under the header; cached screens readable with "Showing what was saved at 4:12 pm"; writes disabled with the reason unless a real queue covers them. Expired session: the shell's sheet "You've been signed out. Sign in again to continue." over the current screen; drafts kept where a draft store exists; after sign-in, back to the same URL.

### 8.6 Success screen (composed, not a new component)
After a **document** is created (bill, purchase bill, loan, enrolment): a page state with a tick, one sentence ("Bill #142 saved for Ramesh Traders · ₹1,240.00"), and up to four next actions (Send on WhatsApp, Print, Record payment, New bill). Built from `UbPanel` + `UbStatusBadge` + `UbButton` in the feature; it becomes a design-system part only when a second app needs the same shape (06 §4 rule 3). After a **khata entry** there is no success screen — the snackbar is enough.

### 8.7 No permission
Hidden, never disabled (§19.7.5). A page the role cannot read shows "You don't have access to this. Ask the owner." with a way back.

## 9. New pieces this file asks for (all small, no package)

| NEW | What | Built from | Why existing parts can't do it |
|---|---|---|---|
| `useOverlayHistory` | Android/browser back closes the top overlay | History API inside `MLDialog` | nothing handles back for overlays today (U-F6) |
| `useVisualViewport` | keyboard-open detection for sheets and the bottom bar | `window.visualViewport` | no consumer today; 04 §6 needs the same signal |
| Snackbar action slot | one action button on a toast | `snackbarSlice` + `UbSnackbar` | the slice has no action field (U-F4); three callers wait |
| Safe-focus default | Cancel focused in `UbConfirmDialog` / `ReasonConfirmDialog` | `autoFocus` on Cancel | today only callers that remember get it (U-F5) |
| Drag handle + `overscroll-behavior: contain` | sheet affordance and scroll containment | CSS in `MLDialog` | not present |
| `UbForm` in-flight guard | ignore submits while one is pending | already proposed in 06 §3 | — |

These should be added to 06's "new pieces" table when 06 is next edited (this session was limited to two files).

## 10. Checks before any of this ships

- Playwright: focus target after open and no `aria-invalid` on open, for every overlay in the `--shots` sweeps.
- Back-button e2e with a sheet open on four routes; keyboard-open footer on Android Chrome and iOS Safari.
- Double-tap script on every money form: one POST per intent (05 §5).
- `scrollWidth` ≤ viewport inside open overlays at 320 / 360 / 768 / 1280.
- Bundle gate: no overlay change moves a route chunk (popover stays lazy; ⋯ sheets stay `UbDialog`).
- `desktop-unchanged.mjs` for routes outside the current phase; Library and Lending contract snapshots unchanged.

Tracking: problems — U-F4, U-F5, U-F6 · decisions — the pattern table in §1 · dependencies — 06 §3 guards · risks — `useOverlayHistory` interacting with `historyApp.ts`; iOS visual-viewport quirks · approval — pending · build — not started · tests — §10 · outcome — —
