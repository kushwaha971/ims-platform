# Udhaar book: person khata, entries, corrections, statement, old dues, reminders, archive, tags

Status: **specified (wave 2), 17 Oct 2026 — not approved, not built.** Review rounds 1 and 2 are at the end of this file; round 2 passes provisionally (8.76).
App: `khata` (`F/khata/app.ts`), book **`main`** (`party.balance`). Entry point `/khata` is specified in [04-udhaar-home.md](04-udhaar-home.md); the drawer, dialog and sheet rules every screen here uses are in [12-shared-overlays.md](12-shared-overlays.md).

Paths are relative to `frontend/` unless they start with `backend/` or `docs/`. `F/` is `src/modules/DigiKhaato/features/`. Endpoints are under `/api/v1/` (`src/api/APIPaths.ts`). Everything below was read from the code on `dev` on 17 Oct 2026; where the code and an older doc disagree, the code is described and the gap is listed in §0.

## 0. Before reading: what the code does today, and what this spec changes

Most of this module is already built to a high standard, and CLAUDE.md records why each odd-looking choice was made. **This spec changes presentation and wording only.** No endpoint, request or response changes; no backend proposal is needed for anything here. Behaviours the redesign must not touch are in §0.2.

### 0.1 Findings from reading the code (each is fixed in the spec below)

| ID | Finding | Where | Fixed in |
|---|---|---|---|
| U-F1 | Inside the Udhaar app, `/ledger/reminders` labels its own scope tab **"Shop"** (`reminders.module.shopTab`), and also shows Library and Lending module tabs. Udhaar money under the word "Shop" breaks DEC-019's wording; other apps' reminders on an Udhaar screen may break "no screen shows another app's figure". | `F/reminders/components/RemindersPageContent.tsx:115-123` | §10; owner question Q2 |
| U-F2 | The reverse dialog restates the row with `truncate`, so a long note is cut on a phone — the "title owns its line" rule broken in the one place the merchant confirms which row they mean. | `F/ledger/components/ReverseEntryDialog.tsx` (`className="truncate"`) | §6 |
| U-F3 | Old dues copy uses report words: "Couldn't load aging", "The aging report could not be loaded", column "Party", accessible name "Receivable or payable". | `locales/catalogues/ledger.en.json` (`ledger.aging.*`) | §9 |
| U-F4 | The success snackbar has no action slot, so "Undo" (mobile-redesign/05) cannot exist; and undoing a ledger entry is a reversal, which needs a reason (LED-03). | `src/redux/slice/snackbarSlice.ts` (no action field) | §3; owner question Q1 |
| U-F5 | `UbConfirmDialog` does not focus Cancel; a destructive confirm opens on the header × instead of the safe choice. Only callers that wrote `autoFocus` themselves (archive dialog) get it. | `src/design-system/UbConfirmDialog/UbConfirmDialog.tsx:72-84` | 12-shared-overlays §4 |
| U-F6 | Android back does not close an open sheet or drawer (no history entry is pushed for overlays). | no `popstate` handling outside `F/navigation/historyApp.ts` | 12-shared-overlays §2.6 |
| U-F7 | A manual ledger entry is **not** queued offline, although `offlineQueueSlice` was shaped for exactly that class. Offline, Save fails through the interceptor; the typed draft survives in `ledgerFormSlice` (FR-12). | `src/redux/slice/offlineQueueSlice.ts:10-13`; no caller in `F/ledger` | §3 (honest offline state); queueing stays a separate decision |
| U-F8 | "Export CSV" is a technical word for the people this app is for. | `ledger.statement.export`, `ledger.aging.export` | §8, §9 |
| U-F9 | "Archive" is a borrowed English word, and the Hindi is a transliteration (आर्काइव). | `parties.archive.*` | §11; owner question Q3 |

### 0.2 Must keep working, for every screen in this file

From 02 §4 and CLAUDE.md. A design that needs any of these to change is out of scope.

1. **A posted entry is never edited or deleted.** A correction writes a reversal and a replacement; the original stays, struck through (LED-03, DB trigger).
2. **"Show corrections" refetches** with `?include_reversed=true`; it never filters what is held.
3. **Credit limit is checked inside the write transaction**; override is a **role** check (owner), correcting is a **codename** check (`ledger.entry.correct`).
4. **Opening balance posts once** (LED-02); the drawer is offered only while `opening.canAdd`.
5. **Statement running balance comes from the server's window function**; the closing of an unbounded statement equals `party.balance` (LED-04 BR-3). The client never adds figures.
6. **Archive is refused on any non-zero balance**, no tolerance band; the 409 swaps the same dialog in place.
7. **Every write carries its `Idempotency-Key`** (`useIdempotencyKey`; rotated only after success or a validation error, so Retry and "Save anyway" reuse it).
8. **Money words:** only this app says *You gave / You got*. Figures with ₹ inside a sentence go through `formatAmount` (the copy carries its own ₹); figures on their own go through `UbAmount`, which never puts a minus sign inside the number. Never a raw decimal string, never `formatInr` inside copy that already has ₹ (the "₹2800.00" defect, five times so far).
9. **Layout lessons (measured, not guessed):** a row's **title owns its line** and wraps (`line-clamp-2`), never truncates; **every badge sits on the caption line** (Corrected, Reversed, Reversal, Backdated, Opening); no badge repeats its row's title (no "Opening… [Opening]"); a reversal row is titled by its **reason**; the two halves of a pair say **Reversed** and **Reversal**; the page's `scrollWidth` never exceeds the viewport at 320 / 360 / 768 / 1280; the person's name is never cut (no "Ramesh Trad…").
10. **Forms are `dynamic()`** — they belong to the chunk that opens them, not the screen they open from (party form, entry drawer, correction drawer, reverse dialog, opening drawer, archive dialog, reminder sheet). `EntryActionsMenu` stays static (it is what is tapped first).
11. **Overlay focus:** the entry drawer opens with focus in the amount, the numeric keypad up and **no error shown** (the MLDialog `autoFocus` fix, `mlOverlayPrimitives.tsx:208-242`); a dialog opened from another overlay passes `returnFocusRef`.
12. **Nothing is sent by this product** (DEC-012): reminders say "WhatsApp opened", never "sent"; prints and messages carry the business name only, never "YourKhata" (`customerDocumentsCarryNoProductName.test.tsx`).
13. **Hidden, never disabled**, for actions a role cannot use (§19.7.5).
14. Existing e2e must stay green: `ledger.mjs` (54), `statement.mjs` (24), `credit.mjs` (18), `tags.mjs` (13), `parties.mjs` (30), `writeoff.mjs`, `aging.mjs`, `wave1-reminders-qa.mjs`, and their `--shots` sweeps.

### 0.3 Stress conditions every screen is specified against

"Stress" rows in each section cover these exact cases:
**long name** — "Shree Ganesh Kirana and General Store (Ramesh Bhai)"; **large amount** — ₹12,40,378.00; **320 px Hindi** — Mukta, system text size 100% and 130%; **thousands of rows** — 2,000 people, 5,000 entries on one khata (scale seed); **repeated taps** — 3 taps within 300 ms on every write; **expired session** — the 90-day sliding session ends while a form is open.

---

## 1. Person khata · `/parties/[id]` (opened from the Udhaar book)

| Field | |
|---|---|
| Purpose | One person's udhaar: how much, which way, every entry, and the two buttons to add the next one. The screen a shopkeeper uses most. |
| Who and when | Owner or counter staff, at the counter, often with the customer standing there; also at night to check the day. Target: tap the person → entry saved in **8 seconds** (LED-01). |
| Phone layout (< 1024 px) | **Header** (sticky, 56 px + safe area): Back · person's name (wraps to two lines, never cut) · ⋯. Bottom bar hidden (`mobileNav.ts`, kept). **Balance card**: avatar (40) and badges on the left; on the right the balance as `UbAmount` 28/34 px with its direction in words under it — "₹12,40,378.00" / "you will get" (green) or "you will give" (red) or "Settled" (neutral) — then "as of 14/10/2026"; credit bar under it when a limit is set ("₹2,500 left of ₹50,000"); mobile with Call (`tel:`) and Copy; tag chips (wrap, all shown). **Reminder line** (`PartyReminderStrip`): "Reminded 3 times · last 2 days ago (WhatsApp)" or "Not reminded yet". **Quick row** (NEW arrangement of existing actions, 3 worded pills, horizontally scrollable if Hindi needs it): Send reminder (only when they owe you) · Statement · Collection date. **Transactions**: heading "Transactions · 48 entries" with the **Show corrections** switch on its right; a two-cell strip "You gave ₹… / You got ₹…" (totals of the loaded book from `summary`); day-banded rows newest first. **Details** (`UbDisclosure`, collapsed): GSTIN, address, added on, collection date control. **Dock** (`UbBottomBar`, always visible on the mobile layer): two equal 48 px buttons, **You gave ₹** (red fill, − icon) and **You got ₹** (green fill, + icon), above the gesture bar. |
| Desktop layout (≥ 1024 px) | Sidebar (Udhaar expanded, People active). Breadcrumb "People › Ramesh Traders". Page header: name as `ds-h1`, the pair **You gave ₹ / You got ₹** beside it (primary/secondary as today), ⋯ at the right. Two columns: transactions (flex 1) and a 320 px sticky rail with the balance card's details, collection date and the info panel. The dock appears only when the header pair has scrolled away (`useScrolledPast`), as today. Keyboard: `G` opens You gave, `R` opens You got (NEW, only when no field has focus and no overlay is open; listed in the ⋯ sheet as hints). |
| What matters most | 1 balance with its direction in words → 2 the pair → 3 the latest entries → 4 reminder line → 5 details. |
| Components | `PartyDetailPageContent`, `PartyDetailHeader`, `CreditUsageBar`, `PartyReminderStrip` (lazy), `PartyLedgerTimeline`, `EntryActionsMenu`, `PartyHeaderMenu` → `UbMoreActions`, `PartyInfoPanel`, `PartyCollectionDate`, `UbPageHeader` (`primaryActions`, `dockPrimaryActions`), `UbBottomBar`, `UbAmount`, `UbAvatar`, `UbStatusBadge`, `UbTagList`, `UbSwitch`, `UbDisclosure`, `UbSkeleton`, `UbEmptyState`, `UbStatusBanner`. Quick row: `UbButton variant="outlineNeutral" size="sm"` in a `UbStack` — no new component. |
| Main action / others | **You gave ₹ / You got ₹** (the dock on phones). ⋯ sheet, in this order: Statement · Send reminder · Edit person · Add opening balance (only while none) · Archive. Shop-only items (Record payment, Pay supplier, Collect by QR) are **never** in the Udhaar book's menu (`udhaarApp` guard, kept). |
| Endpoints | `GET /parties/{id}?book=main` (detail + `summary` + `credit`), `GET /parties/{id}/ledger-entries?cursor&page_size=50[&include_reversed=true]` (`TIMELINE_PAGE_SIZE` 50, max 200 restored), `PATCH /parties/{id}` (collection date), `GET /reminders?party_id=…` (strip). |
| Navigation in / out | In: People row, search, Old dues row, Reminders row, notification. `history.state.yourkhataApp = 'khata'` keeps the Udhaar menu and book (`historyApp.ts`). Back → `/khata` (parent, not browser history, 04 §5). Out: Statement (push), any drawer/sheet (overlay, Android back closes it first). |
| Timeline rows | Title (16/500) = note, else for a reversal its **reason**, else the direction words; `line-clamp-2`. Caption line: date · time · who (when not you) · badges (Corrected, Reversed, Reversal, Backdated, Opening, Written off). Correction reason on its own wrapping line. Right: amount (`UbAmount sign="none"`, coloured by direction, label hidden when it repeats the title) and under it "Bal ₹… to get" in caption grey, max 8 rem, wraps. Whole row is the tap target below `lg` (opens `EntryActionsMenu`); ⋯ icon button at `lg` named "More actions for Cement bags". Reversed rows struck through at 60% opacity, amount neutral. |
| Show corrections | Off by default (one typo must not turn one line into three). Turning it on refetches with `include_reversed=true`; the switch shows its busy state and the list shows its skeleton rows under the existing header while the new page loads; turning it off refetches without. The count in the heading is the server's. |
| States | **Loading:** the cached list row paints the header and balance at once (FR-1, `cachedRow`); the timeline shows 3 skeleton rows; a direct link with no cache shows the detail skeleton family (header block + strip + 6 rows) from `loading.tsx` (05 F1). **First use (no entries):** balance "Settled · ₹0.00"; timeline `UbEmptyState firstUse` "No transactions yet — Record what you gave or got and it will appear here." pointing at the dock; if no opening balance and the party was just added, one quiet line "Bringing a balance from your old book? Add opening balance" (link opens §7). **Empty after filter:** n/a (no filter here). **Error:** detail fails with no cache → page error "Could not open this khata" + Try again (no reference id); timeline fails → error in the transactions panel only, header and dock stay usable. **Partial failure:** reminder strip fails → the strip hides (it is `suppressErrorSnackbar`); info panel fails → Details shows "Could not load details · Try again"; balance and pair unaffected. **Success:** after a save the header figure, the strip "You gave/You got" totals and the new row update from the server's `balance` (no client arithmetic); the new row gets a 1 s teal wash (reduced motion: none). **Offline:** network strip under the header; cached khata readable (`sw.js` caches `/parties/{id}` and `/ledger-entries`), with "Showing what was saved at 4:12 pm"; the dock stays visible but tapping it opens the sheet with Save disabled and "No internet. What you type stays here until you are back online." **No permission:** a role without `ledger.entry.write` sees no dock, no pair, and the ⋯ has only Statement (if `ledger.entry.read`); a role without `ledger.entry.read` sees no timeline and no Statement; archived party → banner "This person is archived" + Restore (if allowed), no pair, no ⋯ items except Statement. **Not found:** "This person was not found" + Back to People. |
| Stress | **Long name:** header wraps to two lines then clamps; full name in `title` and in the Statement; avatar initials from the first two words. **₹12,40,378.00:** balance figure is 28 px on phones and 34 px from 375 px, tabular, never wraps inside the number; the balance column takes what it needs and the identity column wraps. **320 px Hindi:** dock labels "आपने दिए ₹ / आपको मिले ₹" fit at 15 px in two 136 px buttons (checked by measure, not by eye); quick row scrolls sideways with a fade edge rather than wrapping into three rows. **Thousands of rows:** 50 per page, "Load more" at the end (button, not infinite scroll, so the dock never jumps); restored up to 200 on Back; day bands sticky under the header. **Repeated taps:** the pair opens one drawer (the second tap lands on the open sheet's scrim and does nothing); Load more is `busy`; Show corrections ignores taps while its request is in flight. **Expired session:** any 401 opens the shell's "You've been signed out" sheet; an open entry sheet keeps its draft in `ledgerFormSlice` and the person comes back to this khata after signing in (02-global-shell). |
| Accessibility | One `h1` (the name). The balance reads "12 lakh 40 thousand 378 rupees, you will get, as of 14 October" (`UbAmount` label). Dock is a `region` "Add an entry" with two buttons; colour is never the only signal (words + − / + icons). Rows announce "Cement bags, you gave 500 rupees, 14 October, balance 2,300 rupees to get, Corrected". Show corrections is a switch with its state. Focus returns to ⋯ after any overlay opened from it (`returnFocusRef`). 44 × 44 targets; 12 px between quick-row pills. |
| Must keep working | §0.2 items 1–14; `useScrolledPast` dock behaviour on desktop; `useAppWords` book words; no Shop tools in the Udhaar menu; `PartyModulePanels` / relations only when a module with roles is on; dock hidden for archived and read-only. |
| Fewer taps | Dock always under the thumb on phones (0 scroll); amount focused with the numeric keypad (1 tap → type → Save = **3 taps**); quick row puts Statement and Send reminder one tap from the page instead of ⋯ → row (2 → 1); Collection date one tap. |

Tracking: problems — quick actions hidden in ⋯ on phones; offline Save fails silently except for the toast (U-F7) · decisions — dock always visible below `lg` (already built), quick row of three pills, `G`/`R` shortcuts on desktop · dependencies — `loading.tsx` detail family, Android-back overlay hook (12 §2.6) · risks — quick row could crowd at 320 Hindi (mitigated by sideways scroll; measured by the `--shots` width check) · approval — pending · build — not started · tests — `ledger.mjs --shots` (add: quick row, offline sheet), width check at 320/360/768/1280, a11y sweep · outcome — —

## 2. The docked pair · You gave ₹ / You got ₹

| Field | |
|---|---|
| Purpose | The two actions the whole app exists for, always reachable with a thumb. |
| Phone | `UbBottomBar` grid of two, 12 px gap, 16 px side padding, 12 px top, bottom = 12 px + safe area. Buttons 48 px, radius 12, white 16/600 text. **You gave ₹**: `--error` fill (white text 5.7 : 1), − icon. **You got ₹**: `--success` fill (5.6 : 1), + icon. These two are the only red/green filled buttons in the product; marigold stays the one main action on every other screen (03, R-DEC-02). |
| Desktop | Header pair: You gave ₹ (primary) and You got ₹ (secondary) beside the title; the dock appears only after the header pair scrolls away. |
| Feedback | Pressed: one step darker + 0.98 scale within a frame (`--dur-instant`). The drawer chunk is prefetched when the khata becomes idle (`requestIdleCallback` → `import()` of `LedgerEntryDrawer`, NEW, no route cost), so the sheet opens in one frame; if the chunk is still loading the tapped button shows a spinner after 120 ms. |
| Visibility | Hidden: archived party, role without `ledger.entry.write`, Shop book, while the keyboard is open (the entry sheet is above it), while any overlay is open. |
| Snackbar | Lifts above the dock (`UbBottomBar` publishes its height, CR-2026-09-19-G). |
| States | Loading: rendered only after `party` lands (not from a cached row, whose archived flag may be stale) — the slot is reserved so nothing jumps. Offline: visible; the sheet explains. No permission: absent. |
| Stress | 320 px Hindi: labels fit; if a future locale does not, the icon stays and the label wraps to two lines inside the 48 px button — never truncated. Repeated taps: second tap absorbed by the sheet's scrim. |
| Accessibility | Names "You gave, add an entry" / "You got, add an entry"; region label; never colour alone. |
| Must keep working | `data-testid="khata-dock"`; `ledger.entry.gaveAction` / `gotAction` keys; `openEntry(id, 'debit' / 'credit')`. |

Tracking: problems — none · decisions — keep red/green for this pair only · dependencies — idle prefetch · risks — prefetch bytes on weak networks (skip when `selectNetworkImpaired`) · approval — pending · build — mostly built · tests — `ledger.mjs`, `counter-entry-timing.mjs` · outcome — —

## 3. Entry sheet · `LedgerEntryDrawer` (You gave / You got)

| Field | |
|---|---|
| Purpose | Record one amount given or got, in under 8 seconds. |
| Who and when | Anyone with `ledger.entry.write`, from the dock, the header pair, or "Record payment" on a blocked archive (prefilled amount). |
| Phone layout | Bottom sheet (`UbDrawer` → 92 dvh max, grows to content; drag handle; ×). Title "You gave · Ramesh Traders" (wraps; name never cut). 1. **Direction switch**: two side-by-side cards You gave / You got (switching keeps every typed value, FR-4). 2. **Amount**: 56 px field, 26/600 tabular, ₹ prefix, `inputmode="decimal"`, focused on open, keypad up, no error shown on open. Under it, when a credit limit is set, one caption: "₹2,500 left of ₹50,000 limit" (from `credit`, already loaded — no new request). 3. **Date**: "Today" chip selected, "Yesterday", "Other date" (`UbDateInput` with quick choices; max = tenant's today). 4. For **You got**: Payment method chips (Cash · PhonePe · Google Pay · Paytm · Other UPI · Bank · Cheque), last used pre-selected; Reference (optional). 5. **Note** (optional, e.g. "Cement bags"). **Footer** sticky above the keyboard: one full-width **Save** button (marigold, dark ink); no Cancel on phones (× and swipe). |
| Desktop layout | Right drawer 520 px, full height; same fields; footer Cancel + Save; Enter in any single-line field submits; Esc closes (asks first if dirty). |
| What matters most | amount → direction → Save. Everything else defaults. |
| Components | `LedgerEntryDrawer`, `useLedgerEntryForm`, `UbDrawer`, `UbForm`, `UbField`, `UbRadioGroup variant="card"`, `UbMoneyInput`, `UbDateInput`, `PaymentMethodField` (`UbChoiceChips`), `UbTextInput`, `UbStatusBanner`, `UbButton`. |
| Main / other | Save / switch direction, change date, close. |
| Endpoint | `POST /parties/{id}/ledger-entries` with `Idempotency-Key` (`postEntry` → `ledgerService.ts:274`; body is the form's direction, amount, date, note, payment mode/app, reference, plus `override` on "Save anyway"); response carries `entry`, `balance` and `warnings[]` (`useLedgerEntryForm.ts:140-190`). Unchanged by this spec. |
| Navigation | Opens over the khata; closes to it with focus back on the button that opened it. |
| States | **Opening:** focus in amount, keypad up, no red text (regression-tested). **Validation:** errors appear after blur or Save, under the field, focus moves to the first error; server `validation_error` details mapped to fields (`SERVER_FIELD_TO_FORM`) and the key rotated. **Saving:** Save → "Saving…" with spinner, the form locks, × disabled, backdrop does nothing; at 3 s a line under Save: "Still saving… it won't be saved twice." **Success:** sheet closes; snackbar "Saved ₹500.00 · balance is now ₹2,800.00" (`formatAmount`, both grouped); header and row update from the server's `balance`; new row washes once. **Saved over limit (owner override path or warning):** warning snackbar "Saved. They are now ₹2,300.00 over the ₹50,000.00 limit." **Credit limit refusal:** see §4. **Archived party (409 `party_archived`):** form-level message above the fields; Save disabled; "This person was archived on another phone." **Network failure / 5xx:** toast through the interceptor; sheet stays open with everything typed; Save becomes "Try again" and resends with the **same** key. **Offline (known before tapping):** Save disabled, banner "No internet. What you type stays here until you are back online." (draft kept in `ledgerFormSlice`; nothing claims it is queued — U-F7). **No permission:** the sheet is never offered; a role that lost the permission mid-session gets a 403 → banner "You can read this khata but not add to it." **Dismiss with typed values:** backdrop does nothing (`dismissOnBackdrop={!isDirty}`); × or Android back asks "Discard this entry? · Keep editing / Discard" (safe choice focused). |
| Undo | Not on the snackbar today (no action slot, U-F4). Proposal for the owner (Q1): a 10 s **Undo** on the success snackbar that posts a reversal of that entry with the fixed reason "Undone right after saving" (a real LED-03 reversal: the pair stays in the book, visible with Show corrections). Needs the snackbar action descriptor (12-shared-overlays §5.1). Until approved: no Undo; the row's ⋯ → Reverse is the way. |
| Stress | **Long name:** title wraps to two lines. **₹12,40,378.00:** the field shows "1240378" while focused and "12,40,378.00" on blur (UX16 rules kept: paste and replace never append); the limit caption and snackbar group correctly ("₹12,40,378.00"). Max accepted is the schema's; a larger figure shows the schema message under the field. **320 px Hindi:** direction cards stay side by side (two lines each if needed); payment chips wrap to two rows; the footer stays one button. **Repeated taps:** `UbForm` in-flight guard (05 §4) + `busy`; three taps = one POST; a replay of the same key returns the same entry. **Expired session:** 401 → sign-in sheet; the draft stays in the slice; after sign-in the khata reopens the sheet with the draft (FR-12). **Keyboard open:** footer pinned above the keyboard via the visual viewport; the focused field is scrolled into view above the footer; the dock and bottom bar are hidden. |
| Accessibility | Dialog named by its title; direction is a radio group "Which way"; amount labelled "Amount" with the limit caption in `aria-describedby`; errors `aria-invalid` + text; busy announced politely; success announced by the snackbar's polite region. |
| Must keep working | tenant-timezone "today" (EC-8); last payment method in `localStorage` (try/catch); reference survives a direction switch (EC-9); `useWatch` not `watch()`; the drawer stays `dynamic()`; `mode: 'onTouched'`. |
| Fewer taps | 0 taps for date and payment method in the common case; 1 tap to fix a wrong direction without retyping. |

Tracking: problems — offline Save is only a toast today; no Undo · decisions — no Cancel on phones (built), "Still saving…" at 3 s, discard confirmation · dependencies — `UbForm` in-flight guard, visual-viewport footer (12 §2.5), snackbar action (Q1) · risks — iOS keyboard detection · approval — pending · build — mostly built · tests — `ledger.mjs`, `counter-entry-timing.mjs`, double-tap script (05 §5), a11y keyboard flow · outcome — —

## 4. Credit limit refusal (inside the entry sheet, and in the correction drawer)

| Field | |
|---|---|
| Purpose | Stop an entry that would take a person past the limit the owner set, and say what to do, in the sheet the merchant is already in. |
| When | `POST` answers 409 `credit_limit_exceeded` with `{limit, balance_after}`; the slice turns it into `blockedBy`. |
| Layout (both widths) | An outlined error `UbStatusBanner` at the top of the sheet's body (scrolled into view, focus moved to its title): **"This goes past their credit limit"** — "Limit ₹50,000.00 · balance after this entry ₹52,300.00". Owner: button **Save anyway** (secondary, `busy` while saving) — resends the same values and the **same key** with `override: true`. Staff: "Ask the owner to record this one." + **OK** (dismisses the banner; the typed entry stays). The amount field is not marked as an error (the amount is not wrong; the limit is a rule). |
| Copy | Plain: "limit", "balance after this entry", "Ask the owner". Hindi: "यह उनकी उधार सीमा से ऊपर जाता है". Figures via `formatAmount`. |
| States | Override success → warning snackbar (§3). Override fails for network → the banner stays, Save anyway becomes Try again. A staff member never sees an override control (role check, not a permission). Offline: the refusal can't happen (Save is disabled). Repeated taps on Save anyway: busy + same key. Expired session: as §3. Long name / 320 Hindi: banner text wraps; buttons stack under the text. ₹12,40,378.00: grouped. |
| Accessibility | Banner is `role="alert"` once, title focused, so a screen-reader user hears the rule before anything else. |
| Must keep working | check is the server's, inside the transaction; override is owner-only by role; `credit.mjs` 18 checks incl. "already crossed" hint visible without scrolling the drawer. |

Tracking: problems — none · decisions — focus to the banner on refusal (NEW, small) · dependencies — none · risks — none · approval — pending · build — built except the focus move · tests — `credit.mjs --shots` · outcome — —

## 5. Entry actions sheet · `EntryActionsMenu`

| Field | |
|---|---|
| Purpose | The two things a merchant can do to a line they got wrong. |
| Phone | Tapping a timeline row opens a bottom action sheet. Title = the row's title (e.g. "Cement bags", wraps). Under it the entry restated in one line: "You gave ₹500.00 · 14/10/2026". Rows (56 px): **Correct this entry** (pencil) · **Reverse this entry** (undo icon). Footer caption: "The original entry stays in the book either way." |
| Desktop | Same sheet as a centred dialog (420 px), opened from the row's ⋯ (not a popover: +10.9 KB rule). |
| Who | Only shown to roles with `ledger.entry.correct`; rows with no actions (a reversal, an entry from a document — `use_document_void`) get no ⋯ and are not tappable (the row reads as plain text). |
| States | Not lazy (opens in one frame). Closes before the next overlay opens (WP-03 D-04a). Offline: both rows shown, each opened form says Save needs a connection. Long title: wraps; never "Entry options". Repeated taps: second tap on the row while open lands on the scrim. Expired session: the sheet has no request. |
| Accessibility | Each row's ⋯ (desktop) is named "More actions for Cement bags"; sheet title is the dialog name; focus returns to the row's ⋯ (or the row) on close. |
| Must keep working | one menu for the whole timeline (not a portal per row); `khataEntryTitle`. |

Tracking: problems — the restated line is NEW (today only the title) · decisions — restate amount and date so the merchant knows which of Tuesday's four entries it is · dependencies — none · risks — none · approval — pending · build — mostly built · tests — `ledger.mjs` · outcome — —

## 6. Correction drawer · `LedgerCorrectionDrawer`, and reverse dialog · `ReverseEntryDialog`

### 6a. Correct entry

| Field | |
|---|---|
| Purpose | Fix a wrong amount, date, direction, method or note without editing the book: a reversal plus a replacement is written, the original stays visible. |
| Phone | Sheet (92 dvh). Title "Correct entry". Info banner first: "The original stays in the book and a corrected entry is added, so the change is on record." Fields **prefilled with the original's values**, cursor in the amount: direction (for an opening: "They owe me / I owe them"), amount, date, payment method (not for an opening), reference, note (not for an opening). Last and required: **Why are you changing it?** (min 3 characters; "dup" is a real answer). Footer: Save correction (marigold). |
| Desktop | 520 px right drawer; Cancel + Save correction. |
| Endpoint | `POST /ledger-entries/{id}/correct` with key; body only the changed fields + `reason` (`toCorrectionBody`). Response `{entry, balance}`. |
| States | **Unchanged values + Save:** "Nothing has changed. Change a value or close." (no request). **Success:** drawer closes; snackbar "Corrected to ₹550.00 · balance is now ₹2,850.00"; the timeline (corrections hidden) shows only the replacement, badged **Corrected** on the caption line; with corrections shown, the original is struck through and badged **Reversed**, the undoing row titled by its reason and badged **Reversal**. **Credit refusal:** §4 banner in this drawer. **Document-sourced entry (409 `use_document_void`):** form message "This entry came from a bill. Cancel the bill to change it." with no link until SAL-05 exists. **Validation / network / offline / expired session / repeated taps / no permission:** as §3 (same key on retry; `ledger.entry.correct` codename; hidden for others). |
| Stress | Long note: title of the drawer is fixed ("Correct entry"), so the note can be 255 characters and wraps in its field. ₹12,40,378.00 grouped on blur. 320 Hindi: reason label wraps; direction cards side by side. |
| Must keep working | balance moves by the difference (`−signed(original) + signed(replacement)`), from the server; opening keeps its type; drawer `dynamic()`. |

### 6b. Reverse entry

| Field | |
|---|---|
| Purpose | Undo an entry that should not exist (duplicate, wrong person), with a reason. |
| Layout | `ReasonConfirmDialog` (bottom sheet on phones, 420 px dialog on desktop). Title "Reverse this entry?". The row restated: title (**`line-clamp-2`, never `truncate`** — fixes U-F2), date, amount with direction word. Body: "The entry stays in the book, struck through, and a matching entry is added to undo it. The balance goes back to what it was." Reason (required, ≥ 3). Buttons: **Cancel** (focused on open — destructive confirmation opens on the safe choice) and **Reverse entry** (outlined danger). |
| Endpoint | `POST /ledger-entries/{id}/reverse` with key, `{reason}`. |
| States | Success: closes; snackbar "Reversed ₹500.00. Balance is now ₹2,300.00."; the row disappears from the clean timeline (shown struck through with corrections on). Failure: dialog stays open with the reason typed; the shell won't close mid-request. Backdrop never dismisses. Others as §3. |
| Accessibility | `alertdialog` semantics; Cancel focused; the restated row is the description. |

Tracking: problems — U-F2 truncation · decisions — Cancel focused on open; "Nothing has changed" guard · dependencies — `UbConfirmDialog`/`ReasonConfirmDialog` safe-focus default (12 §4) · risks — none · approval — pending · build — mostly built · tests — `ledger.mjs` (LED-03 conditions), `reason-dialog-look.mjs`, add a 360 px long-note reverse shot · outcome — —

## 7. Opening balance drawer · `OpeningBalanceDrawer`

| Field | |
|---|---|
| Purpose | Bring over what was already owed in the paper book, once per person. |
| Who and when | ⋯ → "Add opening balance" (only while none exists and the role can write); also the first-use line on an empty khata (§1). |
| Phone | Sheet. Title "Opening balance", subtitle "What they already owed you when you started this book." Fields: amount (focused); **They owe me / I owe them** (default from the party: supplier-only → I owe them); the hint restates the whole sentence with the amount — "Ramesh Traders will owe you ₹2,300.00" / "You will owe Ramesh Traders ₹2,300.00" — so a wrong side is caught; **Since when** date with chips "Start of this financial year" and "Today" (max today, min 2000). Footer: Save. |
| Desktop | 520 px drawer; Cancel + Save. |
| Endpoint | `POST /parties/{id}/ledger-entries` with `entry_type: "opening"` (`postOpeningBalance`, `ledgerService.ts:264`, keyed). 409 if one already exists (another device) → "An opening balance was already added on another phone." + the drawer closes and the khata refetches. |
| States | Success: snackbar "Opening balance saved · ₹2,300.00"; the row appears **under its own date**, titled "Opening balance" with the **Opening** badge on the caption line only (never "Opening… [Opening]"); the ⋯ item disappears. Validation, network, offline, repeated taps, expired session, no permission: as §3. |
| Stress | ₹12,40,378.00 restated grouped in the hint; long name wraps in the hint; 320 Hindi: the two direction cards stack only if a label exceeds two lines. |
| Must keep working | posts once (LED-02); `defaultDirection` rule; tenant-timezone today; `dynamic()`. |

Tracking: problems — none beyond wording · decisions — hint names the person · dependencies — none · risks — none · approval — pending · build — built · tests — `ledger.mjs` opening conditions, `opening-book-look.mjs` · outcome — —

## 8. Statement · `/parties/[id]/statement` (book `main`), print sheet, download

| Field | |
|---|---|
| Purpose | The passbook a shopkeeper shows or sends a customer who disagrees: dates, what was given, what was got, and the balance after each line. |
| Who and when | At the counter during a dispute; at month end to send. Role needs `ledger.entry.read`; download needs export permission. |
| Phone layout | Header: Back ("Ramesh Traders" khata) · title = the person's name (wraps) · subtitle "Statement · +91 98•••• 4567". Actions: **Share** (print sheet → PDF) and **Download** as a worded ⋯ sheet (`UbPageHeaderMobileActions`). **Period**: one dropdown button "📅 This month ▾" (This month · Last month · This financial year · Last financial year · All time · Custom range) + Show corrections switch, in `StatementFilterBar`. **Summary card**: Brought forward · You gave · You got · Closing balance with its direction words. Rows oldest first, passbook style as cards: date and particulars (title owns its line, wraps), amount in its column word ("You gave ₹500.00"), "Balance ₹2,800.00 to get" under it. Docked bar (NEW placement of existing actions): **Print or save PDF** (marigold) — Download moves to ⋯. |
| Desktop layout | Back link, header with Print / Save PDF and Download buttons; filter bar; summary strip (4 `UbStatCard`); `UbDataGrid` table: Date · Particulars · You gave · You got · Balance; first row "Brought forward", last "Closing balance". |
| Print sheet (`StatementPrintView`, `emulateMedia('print')`) | A4 portrait. Top: business name, phone, GSTIN — **"Issued by Shree Ganesh Kirana"**; never the product name or domain. Customer name, period, generated at. Table with Brought forward first and Closing balance last; corrections included only if the switch was on (struck rows printed with "Reversed"). Page numbers; header row repeats on each page. Amounts grouped (`formatAmount`), Indian grouping. |
| Download | Renamed "Download for Excel" (U-F8; file is the server's CSV stream via a real link, `?format=csv`, export-throttled server-side). |
| Components | `PartyStatementPageContent`, `StatementFilterBar` (`UbDateRangePicker`), `StatementSummaryStrip` (`UbStatCard`), `UbDataGrid` (table/card), `StatementPrintView`, `UbActionLink`, `UbButton`, `UbStatusBanner`, `UbEmptyState`, `UbSkeleton`, `UbBottomBar` (phone dock). |
| Endpoints | `GET /parties/{id}/statement?book=main&from&to&include_reversed&cursor` ; `…&format=csv`; `GET /tenants/current` (letterhead). |
| States | **Loading:** summary skeleton + 6 rows. **Empty period:** "No entries in this period — Change the dates above, or go back and add an entry." Summary still shows Brought forward = Closing. **First use (no entries ever):** same empty state; Print disabled with the reason "Nothing to print yet". **Range refused:** banner "The start date is after the end date." / "Choose a range of up to 5 years."; no request sent. **Entries before the opening date:** info banner "Entries exist before the opening balance date." **Error:** "This statement could not be loaded" + Try again. **Partial:** letterhead fails → print sheet uses the business name from the session; rows unaffected. **Preparing print:** button "Preparing…" while all pages load (`prepareForPrint`), then `window.print()`; blocked print (PWA/iframe) → opens the page in a new tab (EC-9) with a snackbar "Your phone blocked printing here. It opened in the browser." **Offline:** cached statement readable with "as of" time; Download and Print disabled with "Needs internet". **No permission:** "Statements are not available here — Ask the owner to give you access to the khata." |
| Stress | Long name: title wraps; print header wraps to two lines. ₹12,40,378.00: table columns sized for 15 characters on desktop; on phone cards the amount takes its width and the particulars wrap. 320 Hindi: summary card is a 2 × 2 grid; column words "आपने दिए / आपको मिले". Thousands of rows: paged with Load more on screen; **print loads every page first** (progress "Preparing… 3 of 12 pages"), capped by the server's 5-year range; download streams. Repeated taps: Print is `busy`; Download is a link (a second tap starts a second download — acceptable, server-throttled). Expired session: 401 → sign-in sheet; returns to the same URL with the same period (filters live in the URL). |
| Accessibility | Table has a caption "Statement for Ramesh Traders, 1 Oct to 17 Oct 2026"; numeric columns right-aligned, tabular; on phones each card reads "14 October, Cement bags, you gave 500 rupees, balance 2,800 rupees to get". |
| Must keep working | running balance from the server; closing = `party.balance` for an unbounded statement (BR-3); "Brought forward" (not "Opening balance") for the period's carry-in; `entryAmountView` for row labels (no "You gave" on an opening); no raw message ids in particulars; `throttle_scope` only on the export; `customerDocumentsCarryNoProductName`; `statement.mjs` 24 checks + 40 shots. |
| Fewer taps | Print docked on phones (⋯ → Print was 2 taps, now 1). |

Tracking: problems — U-F8 wording; Print hidden in ⋯ on phones · decisions — docked Print, "Download for Excel", print progress · dependencies — none · risks — print of a very long book on a cheap phone (measure) · approval — pending · build — mostly built · tests — `statement.mjs --shots` (add 320 Hindi and the docked bar) · outcome — —

## 9. Old dues · `/ledger/aging`

| Field | |
|---|---|
| Purpose | Who has owed longest, and how much, so a collection round starts with the oldest. |
| Phone | Header "Old dues" + "As of 17/10/2026" (inline date, never future). **Two tabs** that carry their own totals: "You will get ₹1,84,200" · "You will give ₹22,400" (never netted). Four bucket tiles for the chosen side: 0–30 days · 31–60 · 61–90 · 90+ days, each tappable to filter. Tag filter (lazy, only when tags exist). Rows: name (wraps), oldest bucket and amount ("₹4,500.00 · 90+ days"), the bucket bar (`AgingBucketBar`) with its text equivalent; row opens the person's **statement**. ⋯: Download for Excel. |
| Desktop | `UbStatCard` grid + `UbDataGrid` table (Person · 0–30 · 31–60 · 61–90 · 90+ · Total), every figure a link to the statement. |
| Wording fixes (U-F3) | "Couldn't load old dues" / "Old dues could not be loaded"; column "Person"; tabs' accessible name "You will get or you will give"; "Party" never shown. |
| Endpoints | `GET /ledger/aging?book=main&side&as_of&tag&page` (+ `&format=csv`), `GET /ledger/summary`. |
| States | Loading: tiles + 8 row skeletons. **Empty book** (`meta.has_any=false`): one state only — "Nobody owes you yet — Once you write what you gave and got on a khata, who owes what, and for how long, shows here." (no tabs, no ₹0.00). **All settled:** "All settled — Nothing outstanding." with controls kept. **Filtered empty:** "Nothing outstanding for these tags" + Clear filters. **Future date:** banner, no request. Error: list-level Try again. Offline: cached readable, Download disabled. No permission: "You can't see the khata — Ask the owner." |
| Stress | Long names wrap; ₹12,40,378.00 in a tile shrinks to 20 px before wrapping; 320 Hindi tabs stack figure under label; 2,000 people paged 50 with page control on desktop, Load more on phones; repeated taps on tiles are idempotent filters; expired session as shell. |
| Accessibility | Each bar has an `aria-label` "Dues by age for Ramesh: 0–30 days ₹1,000, 90+ days ₹4,500"; tiles are toggle buttons with `aria-pressed`. |
| Must keep working | bucket totals over the filtered set (BR-5); empty book vs empty report from `meta.has_any`; DEC-019 book `main`. |

Tracking: problems — U-F3 jargon · decisions — Person, Old dues words everywhere · dependencies — none · risks — none · approval — pending · build — wording only · tests — `aging.mjs`, `aging-scope-look.mjs` · outcome — —

## 10. Reminders · `/ledger/reminders`, bulk, settings, and the two sheets

### 10a. Reminders page

| Field | |
|---|---|
| Purpose | Who to ask for money today, and a record of who was asked. |
| Phone | Header "Reminders" + ⚙ Settings (owner/admin). **Scope** (only if the owner keeps module tabs, Q2): first tab reads **"Udhaar book"** in this app (U-F1), never "Shop". Bucket tabs with counts: To collect today · Overdue · Upcoming · Sent. Rows: name (wraps), "₹4,500.00 you will get · due 15/10", last reminded line; one **Remind** button per row (opens 10c). Selection: long-press or checkbox mode → bottom bar "Remind 6 customers" (opens 10b). "Remind all on this page" in ⋯. |
| Desktop | Tabs; `UbDataGrid` with selection column, Remind per row, bulk bar on selection. |
| Endpoints | `GET /reminders/due?bucket&page`, `GET /reminders?status`, `GET /ledger/summary` (tab counts), `POST /reminders/preview`, `POST /reminders`, `POST /reminders/{id}/send`, `POST /reminders/bulk`, `GET/PATCH /reminders/settings`. |
| States | Empty book: "Nobody to remind yet — When a customer owes you, set a collection date on their khata and they appear here." (settings stays). Per tab empty: "Nobody is due today", "Nothing overdue", "Nothing coming up", "No reminders yet". Sent tab filter "Failed" for automated SMS only. Error per tab. Offline: Remind disabled ("Needs internet to prepare the message"). No permission: page hidden from nav without `ledger.entry.read`; Remind hidden without write. |
| Stress | as §9; 2,000 due rows paged; repeated Remind taps open one sheet. |

### 10b. Remind several · `BulkReminderDialog`

| Field | |
|---|---|
| Layout | Sheet titled "Remind 6 customers". Step 1 "Preparing reminders" (server builds every link: `POST /reminders/bulk`). Then one customer at a time: name, amount, the **editable message** (`UbMessageBox`, "Use the original message" once edited), and a real link button **"WhatsApp Ramesh"** + Skip. Progress "2 of 6 done". Left-out summary: "1 has no mobile number · 1 owes nothing now". End: "WhatsApp opened for 5 · skipped 1" + Done. |
| Rules | One tap per customer (a browser opens one window per tap). A blank message offers no link and says why. Closing part-way leaves the rest scheduled and unsent — said in the close confirmation: "4 customers not reminded yet. Stop here?" Never "sent". |

### 10c. Person reminder sheet · `PartyReminderSheet` (also from the khata)

| Field | |
|---|---|
| Layout | `UbShareSheet`: "Send reminder", "To Ramesh Traders · +91 98123 45678" (or "no mobile saved, so WhatsApp will ask you to choose the chat"); the server's text (from `/reminders/preview`) in an editable box; WhatsApp · SMS · Call · Copy · More. Signed with the business name only. |
| Feedback | After tapping WhatsApp: snackbar "WhatsApp opened for Ramesh" — never "Reminder sent"; the tap records the reminder (`/send` with the words that left). Copy: "Message copied" and records nothing. |
| States | Preview loading: skeleton in the box, channel buttons disabled. Preview fails: "Could not prepare the message · Try again". Offline: sheet does not open; Remind shows "Needs internet". |

### 10d. Module record sheet · `SourceReminderSheet` (Library/Lending tabs only)

Shown only if module tabs stay (Q2). Outside the module's sending hours the channel buttons are **replaced** by "Reminders go only between 9 am and 8 pm. Next: tomorrow 9 am." Message editable; never "sent".

### 10e. Reminder settings · `ReminderSettingsDialog`

Dialog (sheet on phones), owner/admin only. Two switches, each saving on its own with a busy state and the server's answer: "SMS on every entry" and "Automated SMS reminders (9 am, the day before and on the collection date)". If no SMS provider: warning banner "No SMS provider is set up yet — your choices are saved and take effect once one is connected." Never a green "on" that implies messages are leaving. Sending hours per module (can be made shorter, not longer).

| Common | |
|---|---|
| Accessibility | Each link button names its target ("WhatsApp Ramesh Traders, opens WhatsApp"); progress announced politely; message box labelled "Message". |
| Must keep working | DEC-012 wording; server's text and balance; tap records, open does not; editable messages logged as sent words (WP-04); `meta.has_any` empty book. |

Tracking: problems — U-F1 "Shop" label in Udhaar; module tabs vs DEC-019 · decisions — rename scope tab; Remind per row · dependencies — owner answer Q2 · risks — DEC-019 conflict if module tabs stay · approval — pending · build — wording + tab label · tests — `wave1-reminders-qa.mjs`, `messages-look.mjs`, `share-composer-look.mjs` · outcome — —

## 11. Archive, restore, write-off · `PartyArchiveDialog`, `PartyBulkArchiveDialog`

| Field | |
|---|---|
| Purpose | Put away a person whose account is settled, without deleting anything. |
| Where | Khata ⋯ → Archive (the merchant sees the balance while deciding); People list selection bar → bulk (yearly clean-up). Never a one-tap row action. |
| Dialog | Title "Archive Ramesh Traders?" Body: "They will be hidden from your people list. Nothing is deleted." **Cancel focused** + Archive. Server refuses non-zero (409) → **same dialog swaps**: "Ramesh Traders still has to give you ₹420.00" (or "You still have to give … ₹420.00"); options: **Record payment** (opens the entry sheet in the settling direction with the amount prefilled, editable) · **Write it off** (owner only; swaps to a form: reason, date, and an "I understand" checkbox the button waits for; never in bulk) · Cancel focused. Loan part: "Part of this is a loan… Record a payment to settle it." |
| Restore | Archived khata shows the banner "This person is archived" + Restore (busy "Restoring…"); success "Restored". |
| Bulk | "Archive 12 people?" → result "Archived 10 · 2 still owe money and were left" with their names (server computes the skip set under `FOR UPDATE`). |
| Wording (U-F9, Q3) | Proposal: "Archive" → **"Close khata"** / "Reopen khata" (Hindi "खाता बंद करें" / "खाता फिर खोलें"); the people-list chip "Archived" → "Closed". Only with the owner's yes. |
| States | Busy on Archive/Write off; failure keeps the dialog; offline: Archive disabled "Needs internet"; no permission: item hidden; backdrop never dismisses; Android back = Cancel. ₹12,40,378.00 grouped; long name wraps in the title. |
| Must keep working | no tolerance band; status change not delete; write-off rules (`writeoff.mjs`); `onRecordPayment` direction. |

Tracking: problems — U-F9 · decisions — Cancel focused (built) · dependencies — Q3 · risks — renaming touches three screens' copy · approval — pending · build — built, wording pending · tests — `parties.mjs`, `writeoff.mjs` · outcome — —

## 12. Tags (chips, picker, filter, manager)

| Field | |
|---|---|
| Purpose | Group people the merchant's own way ("Camp Area", "Route 2") to filter, remind and collect by group. |
| Where | Chips on the khata header (all shown, wrap) and on list rows (max 2 + "+3"); picker inside **Edit person** (`PartyTagField`, create inline); filter on People and Old dues (`?tag=Camp Area,Route 2`, by name); bulk Tag from the People selection bar (`PartyBulkTagDialog`); manager at `/parties/tags` (rename, merge, delete with dry-run count). |
| Phone manager | List of tags with colour dot (token `viz-1…8`, never hex), name (wraps; never "e" for Rename), "34 people" link → `/khata?tag=…` in the Udhaar app. Row tap → sheet: Rename · Merge into… · Delete. No initials disc (a tag is not a person). |
| Desktop | Table with actions in a ⋯ per row (never three crammed buttons). |
| Rules | Comma refused in a tag name ("A tag name can't have a comma"); 200 tags max; undo of a bulk tag uses the server's `changed` pairs ("Removed from 3 people", not "from 40"). |
| States | Empty: "No tags yet — Add one when you edit a person." Errors in place; offline: manager read-only; no permission: chips shown, edit hidden. Long names wrap to two lines on chips' rows; 320 Hindi: chip text never cut mid-glyph (measured). |
| Endpoints | `GET/POST /parties/tags`, `PATCH/DELETE /parties/tags/{id}` (+ `?dry_run=true`), `POST /parties/tags/{id}/merge`, `POST /parties/tags/bulk`. |
| Must keep working | `tags.mjs` 13 checks + four-width sweep; idempotent create; filter ORs within, ANDs across. |

Tracking: problems — the manager's "34 people" link must open `/khata` (not `/parties`) when the person came from the Udhaar app (verify) · decisions — none new · dependencies — none · risks — none · approval — pending · build — built · tests — `tags.mjs --shots` · outcome — —

---

## Review

Rubric and pass mark from [09-design-review.md](../09-design-review.md) §1: Mobile 20%, Ease 15%, Visual 15%, Feedback 15%, A11y 10%, Desktop 10%, Safety 10%, Reuse 5%. Pass is **strictly above 8.6**. Self-assessed; §R4 says what each score still needs before it counts.

### R1. Round 1 (first draft of this file) — fails

| Screen | Mob | Ease | Vis | Feed | A11y | Desk | Safe | Reuse | **Weighted** |
|---|---|---|---|---|---|---|---|---|---:|
| Person khata page | 8.5 | 8.6 | 8.6 | 8.2 | 8.3 | 8.4 | 9.1 | 9.1 | **8.54** |
| Entry sheet + credit refusal | 8.6 | 8.7 | 8.5 | 8.4 | 8.4 | 8.4 | 9.2 | 9.1 | **8.62** |
| Corrections (sheet, drawer, reverse) | 8.3 | 8.3 | 8.4 | 8.3 | 8.1 | 8.3 | 9.2 | 9.0 | **8.42** |
| Opening balance drawer | 8.4 | 8.5 | 8.5 | 8.3 | 8.3 | 8.4 | 9.1 | 9.1 | **8.51** |
| Statement + print + download | 8.2 | 8.4 | 8.6 | 8.1 | 8.2 | 8.5 | 9.1 | 9.0 | **8.44** |
| Old dues | 8.1 | 8.3 | 8.4 | 8.1 | 8.0 | 8.4 | 8.9 | 9.0 | **8.32** |
| Reminders | 8.2 | 8.3 | 8.4 | 8.0 | 8.2 | 8.3 | 8.6 | 8.9 | **8.30** |
| Archive, restore, write-off | 8.4 | 8.4 | 8.5 | 8.2 | 8.2 | 8.4 | 9.2 | 9.0 | **8.47** |
| Tags | 8.3 | 8.4 | 8.5 | 8.3 | 8.2 | 8.5 | 9.0 | 9.0 | **8.46** |
| **Category mean** | 8.33 | 8.43 | 8.49 | 8.21 | 8.21 | 8.40 | 9.04 | 9.02 | |

Module, round 1: 0.20×8.33 + 0.15×8.43 + 0.15×8.49 + 0.15×8.21 + 0.10×8.21 + 0.10×8.40 + 0.10×9.04 + 0.05×9.02
= 1.667 + 1.265 + 1.273 + 1.232 + 0.821 + 0.840 + 0.904 + 0.451 = **8.45 — fails** (needs > 8.6).

Example row arithmetic (Person khata, round 1): 0.20×8.5 + 0.15×8.6 + 0.15×8.6 + 0.15×8.2 + 0.10×8.3 + 0.10×8.4 + 0.10×9.1 + 0.05×9.1 = 1.70 + 1.29 + 1.29 + 1.23 + 0.83 + 0.84 + 0.91 + 0.455 = 8.545 → **8.54**.

### R2. Why round 1 fell short, and what changed in the spec

| Shortcoming (round 1) | Category hit | Change made (section) |
|---|---|---|
| Offline: the first draft followed 04-udhaar-home's "unless the offline queue covers it" and left the entry sheet's offline state open; the code shows a ledger entry is not queued (U-F7) | Safety, Feedback | Honest offline state: Save disabled with "What you type stays here until you are back online"; dock stays visible (§1, §3) |
| Statement and Send reminder needed ⋯ → row on phones (2 taps) | Ease, Mobile | Quick row of three worded pills; docked Print on the statement (§1, §8) |
| Reverse dialog cut the note it asks the merchant to confirm (U-F2) | Visual, A11y | `line-clamp-2`, row restated with amount and date (§5, §6b) |
| Destructive confirms opened on ×, not the safe choice (U-F5); Android back did nothing (U-F6) | A11y, Mobile | Cancel focused by default; back closes overlays first (§6b, §11; 12-shared-overlays §2.6, §4) |
| No feedback for a slow save; nothing said a second tap was safe | Feedback | "Still saving… it won't be saved twice" at 3 s; in-flight guard; same key on retry (§3) |
| Credit refusal sat at the top of a scrolled sheet, unseen | Feedback, A11y | Banner scrolled into view and focused (§4) |
| Old dues and reminders spoke report language and labelled Udhaar "Shop" (U-F1, U-F3, U-F8) | Ease, Safety (DEC-019) | Plain words; scope tab "Udhaar book"; "Download for Excel"; module tabs put to the owner (§8–10, Q2) |
| Print of a long book gave no progress | Feedback | "Preparing… 3 of 12 pages" (§8) |
| Desktop had no keyboard route to the two main actions | Desktop | `G` / `R` shortcuts, listed in ⋯ (§1) |
| Stress cases written once at the top, not per screen | all | a Stress row in every section (§0.3) |

### R3. Round 2 (this spec) — passes, provisionally

| Screen | Mob | Ease | Vis | Feed | A11y | Desk | Safe | Reuse | **Weighted** |
|---|---|---|---|---|---|---|---|---|---:|
| Person khata page | 8.9 | 8.9 | 8.7 | 8.8 | 8.7 | 8.6 | 9.2 | 9.1 | **8.85** |
| Entry sheet + credit refusal | 9.0 | 9.0 | 8.7 | 8.9 | 8.8 | 8.6 | 9.3 | 9.1 | **8.92** |
| Corrections (sheet, drawer, reverse) | 8.7 | 8.7 | 8.6 | 8.8 | 8.6 | 8.6 | 9.3 | 9.0 | **8.76** |
| Opening balance drawer | 8.8 | 8.8 | 8.6 | 8.8 | 8.7 | 8.6 | 9.2 | 9.1 | **8.79** |
| Statement + print + download | 8.7 | 8.8 | 8.7 | 8.7 | 8.6 | 8.7 | 9.2 | 9.0 | **8.77** |
| Old dues | 8.6 | 8.7 | 8.6 | 8.6 | 8.6 | 8.6 | 9.1 | 9.0 | **8.68** |
| Reminders | 8.6 | 8.7 | 8.6 | 8.6 | 8.6 | 8.6 | 8.9 | 8.9 | **8.66** |
| Archive, restore, write-off | 8.7 | 8.7 | 8.6 | 8.7 | 8.6 | 8.6 | 9.3 | 9.0 | **8.74** |
| Tags | 8.6 | 8.7 | 8.6 | 8.7 | 8.6 | 8.7 | 9.1 | 9.0 | **8.71** |
| **Category mean** | 8.73 | 8.78 | 8.63 | 8.73 | 8.64 | 8.62 | 9.18 | 9.02 | |

Module, round 2: 0.20×8.73 + 0.15×8.78 + 0.15×8.63 + 0.15×8.73 + 0.10×8.64 + 0.10×8.62 + 0.10×9.18 + 0.05×9.02
= 1.747 + 1.317 + 1.295 + 1.310 + 0.864 + 0.862 + 0.918 + 0.451 = **8.76 — passes** (every screen also > 8.6; the lowest are Reminders 8.66 and Old dues 8.68).

Example row arithmetic (Entry sheet, round 2): 0.20×9.0 + 0.15×9.0 + 0.15×8.7 + 0.15×8.9 + 0.10×8.8 + 0.10×8.6 + 0.10×9.3 + 0.05×9.1 = 1.80 + 1.35 + 1.305 + 1.335 + 0.88 + 0.86 + 0.93 + 0.455 = 8.915 → **8.92**.

**Reminders passes by 0.06 and its Safety (8.9) is conditional** on the owner's answer to Q2: if Library and Lending reminder tabs stay inside the Udhaar app, the screen shows another app's money and Safety falls to about 8.3, which takes the screen to 8.60 — a fail. Visual (8.63) and Desktop (8.62) are the thinnest categories: the visual system is inherited rather than redesigned, and desktop keeps today's layout with small additions.

### R4. What each score still needs before it counts

| Score | Needs |
|---|---|
| Feedback (all screens) | tap → sheet-open and tap → saved measured on the reference phone (05 §6); the 8-second entry target timed with `counter-entry-timing.mjs` on a real low-end Android |
| Mobile | `ledger.mjs` and `statement.mjs --shots` re-run at 320/360/768/1280 with the quick row and docked Print, `scrollWidth` and text-box checks green; keyboard-open footer tested on Android Chrome and iOS Safari; Android back closing sheets on an installed PWA |
| A11y | axe sweep at 390 and 1280 both themes; TalkBack pass of the entry flow and the reverse dialog; 320 px Hindi at 130% system text |
| Ease | the 9-task script (G5) with 5–8 shopkeepers, including "fix a wrong entry" and "send a statement" |
| Safety | full `pytest` and the e2e list in §0.2 item 14 green; `customerDocumentsCarryNoProductName` green; Q2 answered |
| Visual | owner review of the quick row and the red/green dock against the Counter Mode page |
| Desktop | the `G`/`R` shortcuts checked against browser and screen-reader shortcuts |

### R5. Owner questions raised by this module

1. **Q1 — Undo after saving an entry.** Options: (a) no Undo; fix with ⋯ → Reverse (today); (b) 10-second Undo on the snackbar that writes a real reversal with the reason "Undone right after saving". Recommendation: **(b)** — it is the honest undo the ledger already allows, and it removes the most common reason to open the reverse dialog.
2. **Q2 — Library and Lending reminder tabs inside the Udhaar app.** Options: (a) keep them (today); (b) show only Udhaar reminders here; module reminders live in their own apps' Messages screens. Recommendation: **(b)**, per DEC-019. Either way the first tab says "Udhaar book", not "Shop".
3. **Q3 — "Archive".** Options: keep "Archive"; or "Close khata" / "Reopen khata". Recommendation: **"Close khata"** — a word the shopkeeper already uses for a settled paper account.
