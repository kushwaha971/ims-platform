# Library screens · UI only

Status: **specified, not approved**, 17 Oct 2026, from the code on `dev` at 0085a27. Library Home is in [05-library-home.md](05-library-home.md) and is not repeated here.

**Frozen contract** ([02 §2](../02-preserve-and-contracts.md)): every screen below keeps its endpoints, request and response shapes, fields, validations, rules and workflows. Only arrangement, wording and visual treatment change. Anything that would need a new field, endpoint, parameter, header or rule is in **§14 Functional proposals**, not in a screen spec.

Short paths used below: `F/` = `frontend/src/modules/DigiKhaato/features/`, `L/` = `F/library/`, `B/` = `backend/apps/library/`.

---

## 0. Rules that apply to every Library screen

### 0.1 Words (checked against `frontend/locales/catalogues/library.en.json`)

The UI calls members **Students** (`nav.library.members`, `library.member.title`), the books side **Books** (`library.catalogue.title`), and the money page **Income & expenses** (`nav.library.money`). The redesign keeps all three. Library money says **Fee / Paid** (DEC-019); never "You gave / You got", never "owed to you".

**Fee badge** — the server's `fee_state` (`B/services/seats.py:93`, `B/constants.py:304`), shown through `FEE_TONE` and `feeLabel` in `L/view-model/memberDisplay.ts`. Never recomputed in the client.

| `fee_state` | Word on a student (`library.fee.*`) | Word on a seat tile (`library.seats.state.*` via `seatDisplay.ts` `ON_THE_MAP`) | Tone |
|---|---|---|---|
| `paid` | Paid · "Paid till 30/11/2026" when the plan has an end | Paid | success |
| `due_soon` | Due soon | Due soon | warning |
| `unpaid` | **Fee unpaid** | Unpaid | warning |
| `part_paid` | Part paid | Unpaid (map keeps four fee colours) | warning |
| `overdue` | Overdue | Overdue | error |
| `on_hold` | On hold | Paid (nothing to chase) | neutral |
| `left` | Left | Paid (nothing to chase) | neutral |
| `no_fee` | No fee | Paid (nothing to chase) | neutral |

Where a student owes money the list badge reads "₹1,200.00 due" (`library.fee.amountDue`, `duesAmount` from the server). The redesign keeps both mappings; the seat map's grouping of `part_paid` under Unpaid is existing behaviour (`seatDisplay.ts:13-22`), not a new rule.

**Student status** — `effective_status` (`B/services/members.py:76`, closed > suspended > expired > active): Active · Overdue (expired) · On hold · Left (`library.member.status.*`). Finding F-03 below: an expired membership currently reads "Overdue" on the chip, "Expired" on the summary tile and "Membership expired" on the row. Copy-only fix proposed in owner question Q1.

### 0.2 Figures the UI must not compute

Shown exactly as returned: `fee_state`, `day_state`, `view_state`, `taken_shift_ids`, `dues_amount`, `deposit.{expected,held,due}`, `valid_until`, `meta.totals`, `meta.counts`, `meta.shift_counts`, `fees/board` totals, `fine_so_far`, `fine-preview`, `profit`, attendance `present/students/in_now`.

Existing client arithmetic the redesign **keeps but does not extend** (each mirrors or presents a server value; listed so nobody copies the pattern):

| Where | What | Redesign |
|---|---|---|
| `memberDisplay.ts` `validityLine` | days between today (tenant tz) and `valid_until` → "Expires in 3 days" | keep wording; no new day counts anywhere |
| `memberDisplay.ts` `renewalPreview` | mirrors the server's `add_months` for the Renew dialog's promise | keep; the page shows the server's answer after Renew |
| `memberDisplay.ts` `enrolCost` | plan fee + admission fee for the enrol card | keep; server writes the charges |
| `MemberDetailPageContent.tsx:194` `owedInAll` | fee dues + security still to take, added in the client | **removed in the redesign**: the two server figures are shown side by side ("Fee due ₹900.00 · Security to take ₹500.00"), so the page adds nothing |
| `SeatsPageContent.tsx:119` `occupancyCounts` | counts seats per server `day_state` | keep (counting rows is not deciding a state) |

### 0.3 Duplicate protection on Library writes (05 §3–§4, 08 BP-05)

The redesign adds the shared in-flight guard (`useAsyncAction`, `UbForm` submitting, 06 §3) to every control below. The lock is held from finger-down until the server answers; a second tap does nothing; the dialog cannot be closed by backdrop or Android Back while locked; on failure the dialog stays open with everything typed.

| Action | Endpoint | Server key today | Client today | Redesign |
|---|---|---|---|---|
| New admission | `POST /library/members` | `library.member.enrol`, key sent (`MemberListPageContent.tsx:114`) | busy + key | keep; guard |
| Renew | `POST members/{id}/renew` | scope exists (`B/views/memberships.py:218`), **key not sent** (`MemberDetailPageContent.tsx:819` calls `act` with no key) | `busy` only | **client lock required**; sending the key is proposal P-01 |
| Change plan | `POST members/{id}/change-type` | none | busy | client lock |
| Suspend / Reactivate | `POST …/suspend`, `/reactivate` | none | busy | client lock (no money) |
| Close (may apply security to dues) | `POST …/close` | scope exists, key not sent | busy | **client lock required**; P-01 |
| Rejoin | `POST …/rejoin` | scope exists, key not sent | busy | **client lock required**; P-01 |
| **Take security** (deposit receive) | `POST …/deposit/receive` | **none** (BP-05) | busy via `actionStatus` | **client lock required**; BP-05 |
| **Forgive fee** (waive) | `POST /library/charges/{id}/waive` | **none** (BP-05) | `busyFor` in `MemberChargesSection.tsx` | **client lock required** |
| **Cancel wrong charge** (reverse) | `POST /library/charges/{id}/reverse` | **none** (BP-05) | `busyFor` | **client lock required** |
| Add charge | `POST /library/charges` | `library.charge.create`, key sent | busy + key | keep; guard |
| Collect fees / Take fee | payments `PaymentFormDrawer` (`bucket: 'library'`) | payments' own key | existing | keep; guard |
| Seat give / move / free | `PATCH members/{id}` with `version` | optimistic version | busy | client lock; a stale version answers 409, shown on the seat field |
| Check in / out | `POST /library/attendance`, `/{id}/out` | server refuses duplicates (`attendance_duplicate`) | per-row `busyId` | keep; guard |
| Counter issue / return / renew | `library.loan.*` keyed queue | keyed, one at a time (`types/counter.types.ts` `QueueItem`) | queue | keep unchanged |
| Message sends | WhatsApp link + record | n/a (recording a tap) | link ready before tap | keep |

Deposit **apply** and **refund** endpoints exist but have no screen of their own today (only `close` with `applyToDues`); the redesign adds none (P-06).

### 0.4 States every Library screen handles the same way

| State | Treatment |
|---|---|
| Loading | route skeleton in the screen's own shape (`loading.tsx`, 05 F1); tapped row/tab shows pending after 120 ms; no layout jump when data lands |
| Error | `UbEmptyState variant="error"` with the screen's existing title and Try again; no request id (owner, 7 Oct) |
| Partial failure | the part that failed shows its own small error and Try again; the rest of the screen stays usable (e.g. message log fails, student page stays) |
| Offline | `NetworkStrip`; cached data shown with "as of" time; every money and write button disabled with "No internet. Nothing was saved." (`selectNetworkImpaired`); reads retry on reconnect (`useMemberDetail` already refetches when `stale` and not impaired) |
| No permission | `library.noAccess.*` empty state for the screen; actions a role cannot use are not drawn (02 §1.7) |
| Expired session | the global 401 path signs in again and returns to the same URL; an open dialog's typed values are lost, so a money dialog says "Sign in again — nothing was saved" rather than closing silently |
| Long names | names own their line and wrap to two lines (`line-clamp-2`), badges sit on the caption line under them (LED-03 rule); no ellipsis on a word |
| Large amounts | `UbAmount`/`formatInr` grouping, e.g. ₹12,40,378.00; tabular figures; figure tiles stack below 360 px rather than shrinking type |
| 320 px Hindi | Mukta, labels may wrap to two lines; chips scroll sideways in `UbFilterBar` with 6 px padding; header actions become 32 px icons with 44 px hit areas (`.ub-hit`); checked by the measuring sweep (11) |
| Repeated taps | §0.3; navigation taps are idempotent (same route) |
| Thousands of rows | server paging where it exists (members, charges, titles, copies: 25 per page, max 100, `apps/common/constants.py:173`); unpaged lists (seat map, attendance day, fee reminders) render in windows (05 F8) |

### 0.5 Findings in the current code that the redesign answers

| # | Finding | File | Answer |
|---|---|---|---|
| F-01 | Seats on a phone: one tall card per seat in one column; 120 seats is a very long scroll and occupancy is not readable at a glance | `SeatsPageContent.tsx:335-420` | compact room grid + shift bars + bottom sheet (§4) |
| F-02 | Student page ⋯ menu holds up to 17 items; Collect fees sits in the card below the header | `MemberDetailPageContent.tsx:259-392` | action bar of 4 with grouped ⋯ (§3) |
| F-03 | Expired membership has three different words (Overdue / Expired / Membership expired); "Overdue" collides with the fee word | `library.members.chip.expired`, `summary.expired`, `membershipExpired` | Q1 |
| F-04 | Renew, Close, Rejoin send no idempotency key though the server accepts one | `MemberDetailPageContent.tsx:819`, `B/views/memberships.py:218-229` | client lock now; P-01 |
| F-05 | Attendance renders every student of the day in one list (2,000 rows) | `AttendancePageContent.tsx:219` | windowed list + client shift chip over returned rows (§6) |
| F-06 | Fees "Not paid" shows at most 100 students, silently | `B/selectors/fees.py:23` `SHOWN = 100` | say "Showing 100 oldest · see all in Students → Fee unpaid" (link to existing filter) |
| F-07 | `L/components/MemberColumns.tsx` is not imported anywhere (the list renders its own cards) | grep | reuse it for the desktop table (§2) or delete after confirming; no behaviour change |
| F-08 | Student page adds fee dues and security due in the client | `MemberDetailPageContent.tsx:194` | show both server figures separately (§0.2) |

---

## 1. Counter · `/library/counter`

| Field | |
|---|---|
| Purpose | Issue, return and renew books at the desk with a scanner or by typing; see what just happened. |
| Who and when | Desk staff with `library.loan.write` (`app.ts` nav), all day; keyboard-first on desktop, phone camera-less typing on phones. A study library uses it rarely (books are a side line, `app.ts` "books" section). |
| Phone layout | Header "Counter" + Back to Library. Mode chips Issue · Return · Renew (`UbChipTabs`, 44 px). One scan box (16 px text, numeric keyboard off, `enterKeyHint="go"`). Under it the **member strip** when a student is loaded (`CounterMemberPanel`): name (wraps), number, "2 of 4 books", fee badge, block lines in words; "Finish" closes it. Below: the **session list** (`CounterSessionList`) newest first, each row with its word (Issued · Returned · Renewed · Refused · Not found), due date, late days and fine from the row, and at most two actions (Take ₹ / Undo / Keep aside). Bottom bar shown (read screen), hidden while the keyboard is open (04 §6). |
| Desktop layout | Two columns: left 60% scan box + session list; right 40% sticky member panel. Shortcut legend (`library.counter.keys`, Alt+I/R/N, Esc) under the box. |
| What matters most | the scan box → what the last scan did → who the member is and whether they are blocked. |
| Components | `UbPageHeader`, `UbChipTabs`, `UbSearchInput`, `UbStatusBadge`, `UbAmount`, `UbButton`; feature `CounterMemberPanel`, `CounterSessionList`, `CounterPrompts` (override reason, "Already with …", finish + slip on WhatsApp) — all existing, lazy prompts kept. |
| Main / other | Scan (Enter) / switch mode, override with reason (owner), Return or Renew instead of a refusal, Undo, Take ₹ fine (opens payment drawer), Send slip on WhatsApp. |
| Navigation | In: Library sidebar "Books" group; Home quick action. Out: member name → student page; Take ₹ → payment drawer over the counter; focus returns to the scan box after every action and dialog (existing). |
| States | loading: scan box usable at once, member panel skeleton only after a member scan · empty/first use: "Scan a student card or a book" (`library.counter.noMemberYet`) · error: a failed scan is a row "Could not reach the server — Try again" that resends the **same queued key** · partial failure: queue continues with the next item; failed row stays · success: row appears at top with its word; 1-frame flash on the row, no sound by default · offline: scan box disabled with "No internet. Scans need a connection." (no offline queue exists) · no permission: `library.noAccess` · long names: title and student name wrap in the row; accession number in `ds-mono` · large amounts: fine as `UbAmount` · 320 px Hindi: mode chips scroll; session row actions drop to a second line · thousands of rows: session list is this session only (client state), windowed after 200 rows · repeated taps: the existing one-at-a-time keyed queue (`QueueItem.key`) is the guard; a pending row shows "Waiting…" (`library.counter.pending`) · expired session: queued scans stay in the list marked "Not sent"; after sign-in the desk resends them by tapping. |
| Accessibility | scan box has `aria-label` (`library.counter.scanHint`); session list is a live region (`polite`) announcing each row's word; blocks are text, not colour. |
| Must keep working | keyed issue/return/renew (`B/views/loans.py:62,108,146`), override with reason, blocks decided by the server (BR-8 in `CounterMemberPanel.tsx:15`), fine from the server, slip text, keyboard shortcuts. |
| Fewer taps | none removed (already one scan per act); the mode chips become reachable with the thumb on phones. |

Tracking: problems — phone layout untested, session row action crowding at 320 px · decisions — UI only; queue untouched · dependencies — none · risk — low · approval — pending · build — not started · tests — existing `CounterPageContent.test.tsx`, `library-slip-look.mjs`, measuring sweep · outcome — —

---

## 2. Students · `/library/members`

| Field | |
|---|---|
| Purpose | Find a student, see who owes and who has ended, admit a new one. |
| Who and when | Owner and desk (`library.member.read`; admit needs `library.member.write`), many times a day; phone at the desk, desktop for month-end. |
| Phone layout | Header "Students", actions: **New admission** (marigold, the one main action; icon on phone with label "New") and Import (in ⋯). Two tiles from `meta.totals`: Active · Expired (words per Q1), tappable to set the status filter. One caption line from the same totals: "312 students · ₹48,600.00 fee due · ₹22,000.00 security held" (`library.members.totals.*`). One row: search (name, number, mobile) + Filters button (status, Fee unpaid, shift, plan — the existing `UbFilterSheet` specs). Active filter pills below. **Cards**: avatar, name (wraps, two lines max), caption "98123 45678 · Hall A", place line "Seat A12 · Morning" or "No seat" or "Membership expired"; trailing fee badge ("₹900.00 due" / Paid till 30/11/2026 / Due soon …). Tap → student page (see Navigation). "Load more" at the end (25 per page). Bottom bar: Home · Students · Seats · Fees · [Library ▴]. |
| Desktop layout | Header with New admission + Import. Totals tiles and caption. Toolbar: search, status `UbFilterSelect`, Filters sheet. **Table** (reuse `MemberColumns.tsx`, F-07): Student (name + number + group) · Seat (seat · shift) · Plan (name + fee) · Valid until · Fee due (`UbAmount` receivable) · Fee badge; sortable by the existing `MEMBER_ORDERINGS` (name, number, valid until, -dues, seat). Row click opens the student in the side drawer (existing `MemberDetailDrawer`, `sm:max-w-2xl`) with "Open full page" in its header. |
| What matters most | who owes (badge) → where they sit → find by name/number. |
| Components | `UbPageHeader`, `UbStatCard`, `UbSearchInput`, `UbFilterSelect`, `UbFilterSheet`, `UbActiveFilters`, `UbPressable` cards, `UbDataGrid` (desktop), `UbStatusBadge`, `UbLoadMore`, `UbEmptyState`; feature `EnrolMemberDrawer`, `MemberDetailDrawer` (both `dynamic()`), `ImportActionLink`. |
| Main / other | New admission / search, filter, open student, import register. |
| Navigation | In: bottom tab, sidebar, Home "New admission" (`?add=1`), Seats "Assign" (`?add=1&seat=…&admitShift=…`, kept). Out: **phone** row → full page `/library/members/[id]` (a drawer on a phone is a page anyway; this restores the browser Back and keeps the list's filters in the URL via `useLibraryListUrl`); **desktop** row → drawer, list stays visible. Back from the student returns to the list with search, filters and scroll position kept. |
| States | loading: totals caption skeleton (`library.list.loading`) + 3 card skeletons · first use (`hasAny === false`): only the empty state "No students yet" with New admission — no zero tiles, no search (approved 12 Oct design, kept) · empty filtered: "No student matches 'ram'" + Clear filters · error: `library.members.error.title` + Try again · partial failure: page 2 fails → the loaded rows stay, Retry in place of Load more (existing) · success after admission: snackbar "Asha admitted · LIB-0312" and the student page opens (existing) · offline: list from memory with "as of"; New admission disabled · no permission: `library.noAccess`; no New admission without `library.member.write` · long names: 2-line wrap, badge stays right at ≤40% width (existing `max-w-[40%]`) · large amounts: "₹12,40,378.00 fee due" in the caption wraps after the "·" · 320 px Hindi: tiles stack 1-up below 360 px; Filters is an icon button with the count · 2,000 students: server pages of 25; Load more keeps position; cards are cheap rows; the totals are server totals over the filtered set · repeated taps: a row tap navigates once (pending spinner on the row); New admission opens one drawer · expired session: returns to the same filtered URL. |
| Accessibility | each card's accessible name is "name number" (existing `rowName`); badge words carry the state; tiles are buttons with `aria-pressed` when filtering. |
| Must keep working | `GET /library/members` filters (`q`, status incl. `expiring`, type, group, has_dues, shift, ordering, page), totals over the filtered set, enrol with idempotency key and field-level refusals (`library_seat_taken` on the seat, `library_member_number_taken`, `library_membership_exists`), `?add=1` deep links. |
| Fewer taps | status in one tap from the tiles (today: open the select); desktop opens a student without leaving the list. |

Tracking: problems — F-03 words, F-07 unused columns, phone drawer vs page · decisions — phone opens the page, desktop the drawer · dependencies — Q1 for the expired word · risk — low · approval — pending · build — not started · tests — `student-workspace-look.mjs`, measuring sweep, figure parity on totals · outcome — —

### 2a. New admission drawer (`EnrolMemberDrawer`)

| Field | |
|---|---|
| Purpose | Admit a student: person (existing or new), plan, seat and shift, and the money now or later — or record an existing paper-register student. |
| Who and when | `library.member.write`; at the desk while the student waits. |
| Phone layout | Full-height sheet. Sections in order, each a `UbPanelSection`: **Who** (existing person picker or name + mobile; guardian in a disclosure) · **Plan** (plan picker showing fee and length) · **Seat** (shift picker incl. "All day"; seat picker listing only seats free in that shift with "12 free" count, from `seat-map` `view_state`) · **How they join** (`UbChoiceChips`: Pay now · Pay later · Already studies here) · **Money** card: fees + admission (from `enrolCost`), security "returned when they leave", payment lines (mode split) when Pay now; for "Already studies here": start date, paid till, security held, old dues. Docked footer: Cancel · **Admit** (marigold) with the total in the button ("Admit · ₹1,400.00"). |
| Desktop layout | Right drawer 560 px, same sections, footer docked. |
| What matters most | name and mobile → plan → seat → money. |
| Components | `UbDrawer`, `UbForm`, `UbField`, `UbTextInput`, `UbPhoneInput`, `UbCombobox`, `UbChoiceChips`, `UbMoneyInput`, `UbDateInput`, `UbDisclosure`, payment lines editor (payments feature), `UbInputHint`. |
| Main / other | Admit / Cancel, change seat suggestion. |
| Navigation | Opens from Students, Home, Seats (seat prefilled; a stale suggestion is cleared, existing `EnrolMemberDrawer.tsx:139`). Success → student page. |
| States | loading: plan and seat pickers show inline skeletons; the form is usable · empty: no plans → "Add a fee plan first" with a link to Fees › Fee plans (owner/admin only) · error: refusals on the field they name (seat taken by whom, number taken, already a student) and anything else in the snackbar (existing) · partial failure: seat map fails → seat picker says "Seats could not load — Try again"; admit without a seat still allowed · success: drawer closes, snackbar, student page · offline: Admit disabled with reason; typed values kept · no permission: not reachable · long names: picker rows wrap · large amounts: Admit button label wraps to two lines below 360 px rather than truncating · 320 px Hindi: chips wrap to two rows · thousands: person picker uses `usePartySearch`; seats picker searchable · repeated taps: Admit locks (key already sent; guard added) · expired session: "Sign in again — nothing was saved". |
| Accessibility | first field focused through the dialog hook (LED-01 lesson); nothing opens red (`onTouched`); money card read as a list. |
| Must keep working | `toEnrolBody` shape, existing-student path (no fee today), fee collection oldest first and extra kept as advance (`B/services/members.py:650,388`), seat clash refusal, guardian link. |
| Fewer taps | the total on the Admit button removes the scroll back to the money card. |

Tracking: problems — long form on phones · decisions — sections order fixed · dependencies — P-04 for whole-period seat availability · risk — medium (money) · approval — pending · build — not started · tests — existing drawer tests, double-tap script · outcome — —

---

## 3. Student page · `/library/members/[membershipId]` (and the same content in `MemberDetailDrawer`)

| Field | |
|---|---|
| Purpose | One person, one workspace (docs/qa/one-person-workspace.md §A): who the student is, where they sit, what they owe and have paid, and every routine action without leaving the page. |
| Who and when | Desk and owner; when the student is at the desk, on a parent's call, at month end. Actions per role from `useMemberDetail` flags: `canWrite`, `canEdit`/`canRejoin` (owner/admin), `canClose` (`library.member.close` + owner/admin), Collect needs `payments.payment.write`, Forgive needs `library.charge.waive`. |
| Phone layout | **Header**: Back to Students, name (wraps), ⋯. Caption line: student number (mono) · fee badge · status badge when On hold/Left. Banners when Left (closed on, reason) or On hold (until, reason) — existing. **Money card** (first thing under the header): left "Fee due ₹900.00" (`dues_amount`, receivable) or "Nothing due"; right "Valid until 30/11/2026" or the near sentence ("Expires in 3 days"); second line only when present: "Security to take ₹500.00" (`deposit.due`) · "Security held ₹1,000.00" (`deposit.held`, "of ₹1,500.00" when less than expected). **Action bar** (4 equal buttons, 44 px): **Collect fee** (marigold; only when `dues_amount` > 0 and the role may) · **Remind** (fee message when `owesFee`, otherwise the plan-end message) · **Renew** (or **Change plan** when the plan has no end) · **Seat** (Give a seat / Change seat). ⋯ holds, in groups with headings: *Messages* (Plan ends, Thanks, Welcome, Receipt, Your own words, Fee QR) · *Seat* (Free seat A12) · *Student* (Edit details, Edit name and mobile, Take security) · *Membership* (Change plan, Put on hold / Reactivate, Close membership / Rejoin). **Seat card**: "A12 · Morning 06:00–12:00 · Locker 4". **This month** attendance strip ("16 of 18 days"). **Fees and charges** (section 3d), **Payments** (3e), **Messages sent** (3f), **History** (periods) — each a collapsible section, Fees and charges open by default when anything is owed. Bottom bar hidden; the action bar docks at the bottom once scrolled past (DESIGN-SYSTEM §3 dock rule). |
| Desktop layout | Two columns: left 2/3 — header, money card, action bar inline in the header (Collect fee primary, Remind, Renew, Seat, ⋯), Fees and charges, Payments side by side (existing `xl:grid-cols-2`); right 1/3 sticky — Student details (plan with fee, valid until, group, guardian, mobile with `tel:`, since), Seat card, attendance strip, Messages sent, History. Drawer variant (from the list/seats/fees on desktop): single column, same order, "Open full page" link in the drawer header. |
| What matters most | what is owed and until when → collect / remind / renew → seat → history. |
| Components | `UbPageHeader`, `UbStatusBadge`, `UbStatusBanner`, `UbAmount`, `UbInfoRow`, `UbPanel`/`UbPanelSection`, `UbDisclosure`, `UbButton`, `UbMoreActions` (via `CatalogueActionsMenu`) with group headings, `UbBottomBar` dock; feature `MemberChargesSection`, `MemberPaymentHistory`, `MemberAttendanceStrip`, `MemberMessageLog`, and lazy `MemberActionDialog`, `SeatDialog`, `MessageDialog`, `MemberEditDrawer`, `PartyIdentityDrawer`, `PaymentFormDrawer`, `UpiPayQrDialog` — all existing. No new component. |
| Main / other | Collect fee / Remind, Renew or Change plan, Seat, and the ⋯ groups above. |
| Navigation | In: Students row, Seats panel name, Fees row, Attendance row, Home Today list, notifications. Out: Back → the list it came from (filters kept); Collect opens the payment drawer over the page; every dialog returns focus to the control that opened it (`returnFocusRef`). |
| States | loading: page skeleton in this shape (header, money card, action bar, two sections) · not found: "Student not found" + Students link (existing) · error: `library.member.error.title` + Try again · first use (new admission just made): sections show "No payments yet", "No messages sent yet" · partial failure: charges, payments, attendance and message log each load and fail on their own with a one-line Try again (`library.messages.log.error` exists; the others gain the same pattern using existing error copy) · success: each act's snackbar names the student (`library.member.done.*`) and the page shows the member object the server returned (no client patching) · offline: page from memory with "as of"; action bar disabled with reason; Call still works · no permission: no `library.member.read` → noAccess; read-only roles see no action bar, only ⋯ messages they may send · Left (closed): action bar replaced by Rejoin (owner/admin) and Receipt · long names: name wraps in the header; badges on the caption line · large amounts: money card stacks the two figures vertically below 360 px · 320 px Hindi: action bar becomes 2 × 2 · thousands of rows: charges and payments are server-paged; history periods are few · repeated taps: §0.3 locks; Collect opens one drawer · expired session: dialogs say nothing was saved. |
| Accessibility | money card is a `dl` read as "Fee due, ₹900.00"; badges carry words; ⋯ items disabled for a reason are omitted, not greyed (existing: `action: undefined`). |
| Must keep working | all acts and their permission flags (`useMemberDetail.ts`), staff may only change seat, shift, locker (`B/views/memberships.py:46`), renew refused for a plan with no end (`library_plan_no_end`), fee collection via payments with `bucket: 'library'` (DEC-019), version on PATCH, the Shop P0 fee QR. |
| Fewer taps | Collect fee and Remind move from inside a card and from the ⋯ (two taps) to the action bar (one tap); Seat change one tap; the ⋯ shrinks from up to 17 flat items to four short groups. |

Tracking: problems — F-02, F-08 · decisions — action bar of four; separate figures instead of a client sum · dependencies — P-01 for keys · risk — medium (most-used money screen) · approval — pending · build — not started · tests — `student-workspace-look.mjs`, `student-dates-look.mjs`, figure parity (dues, deposit, valid until), double-tap script · outcome — —

### 3a. Edit details drawer (`MemberEditDrawer`) and Edit name and mobile (`PartyIdentityDrawer`)

| Field | |
|---|---|
| Purpose | Owner/admin corrects the student's number, group, joined date, end date and note; name and mobile are the shared person's and are edited in the identity drawer. |
| Who and when | `canEdit` (owner/admin, `library.member.write`); identity needs owner/admin + `parties.party.write`. Rare. |
| Phone layout | Sheet: Student number · Group · Joined on · Valid until (with "No end date") · Note; footer Cancel · Save. A one-line hint under the title: "Name and mobile are changed in Edit name and mobile." |
| Desktop layout | Right drawer 480 px, same fields. |
| What matters most | the field being fixed; Save. |
| Components | `UbDrawer`, `UbForm`, `UbField`, `UbTextInput`, `UbDateInput`, `UbTextArea` (existing). |
| Main / other | Save / Cancel. |
| Navigation | From ⋯ › Student; closes back to the page. |
| States | loading: n/a (opens with data) · empty: unchanged form sends nothing (existing diff rule) · error: field refusals on the field, version conflict says "Changed on another device — reload" with Reload · partial failure: n/a · success: snackbar, page shows server copy · offline: Save disabled · no permission: not drawn · long names: n/a · large amounts: n/a · 320 px Hindi: labels wrap · thousands: n/a · repeated taps: guard · expired session: nothing saved message. |
| Accessibility | first field focus; errors announced. |
| Must keep working | only changed keys sent, `null` for no end date, `version`. |
| Fewer taps | none. |

Tracking: problems — none severe · decisions — UI only · dependencies — none · risk — low · approval — pending · build — not started · tests — existing drawer tests · outcome — —

### 3b. Fees and charges section + charge dialogs (`MemberChargesSection`, `ChargeDialogs`)

| Field | |
|---|---|
| Purpose | Every charge of the student, what is still due on each, and the acts on one charge: Take ₹, Forgive fee, Cancel wrong charge, Add charge. |
| Who and when | Collect: `payments.payment.write`; Forgive: `library.charge.waive` (with a staff ceiling refused inline); Cancel/Add: `library.member.write`. |
| Phone layout | Section header "Fees and charges" + "Add charge" (secondary). Totals caption from the list's server totals: "Due ₹900.00 · paid ₹2,700.00 · forgiven ₹100.00". Rows: description (wraps) left, amount due (or amount) right; caption: number · date · status badge (Open, Part paid, Paid, Forgiven, Refunded, Cancelled — `library.charge.status.*`). An owing row shows **Take ₹900.00** and a ⋯ with Forgive fee / Cancel wrong charge (Cancel only when nothing paid, existing rule). Paid rows are collapsed under "Show paid charges (12)". **Forgive dialog**: amount (max = due), reason, "Fee due after: ₹400.00" line; staff ceiling refusal inline. **Cancel dialog** (`ReverseChargeDialog`): reason, consequence sentence. **Add charge dialog**: kind chips (Processing · Other), amount, description, "Fee due after". |
| Desktop layout | Same rows as a compact table inside the left column; dialogs centred 480 px. |
| What matters most | open charges and Take ₹. |
| Components | `UbAmount`, `UbStatusBadge`, `UbButton`, `UbMoreActions`, `UbDialog`, `UbConfirmDialog`-style reason dialog, `UbMoneyInput`, `UbTextArea`, `UbChoiceChips`, `UbDisclosure` (paid rows). |
| Main / other | Take ₹ / Forgive, Cancel, Add. |
| Navigation | Take ₹ → `PaymentFormDrawer` allocated to that charge (`documentId`), over the page; on save the payment history refreshes (existing revision bump). |
| States | loading: three row skeletons · empty: "No charges" (`library.charge.none`) · error: section-level Try again · partial failure: a refused waive keeps the dialog and the typed reason · success: snackbar `library.charge.done.*`; row updates from the server's row · offline: all buttons disabled · no permission: Forgive item absent without the codename; section hidden when no rows and no write (existing) · long names: description 2 lines · large amounts: amount column right-aligned, wraps under the description below 340 px · 320 px Hindi: Take ₹ full width · thousands: server-paged (`PagePagination`); "Load more charges" · repeated taps: **Forgive and Cancel have no server key (BP-05): the dialog locks from first tap, cannot be dismissed while pending, and re-enables only on a server answer**; Add charge keeps its key · expired session: dialog stays with "Sign in again — nothing was saved". |
| Accessibility | each row's Take button names the amount; the "due after" line is `aria-live`. |
| Must keep working | waive ceiling refusal inline, reverse refused after payments (`library_charge_has_payments`), manual charge key, D7 (no credit-limit refusal on library charges). |
| Fewer taps | paid rows collapsed, so the open ones are at the top without scrolling. |

Tracking: problems — no server idempotency on waive/reverse · decisions — strict client lock · dependencies — BP-05 · risk — medium · approval — pending · build — not started · tests — double-tap script on Forgive and Cancel, existing ChargeDialogs tests · outcome — —

### 3c. Payments history (`MemberPaymentHistory`)

| Field | |
|---|---|
| Purpose | Every receipt and refund of this student, newest first, with advances named. |
| Who and when | Anyone who can read the student. |
| Phone layout | Section "Payments": rows date · mode · "Paid ₹900.00" (or refund word, `library.member.payments.{direction}`), caption "₹100.00 kept as advance" when present; pager Previous · "Page 1 of 3" · Next (existing). |
| Desktop layout | Same, right of charges at `xl`. |
| What matters most | the latest payment and its amount. |
| Components | `UbAmount`, `UbText`, `UbButton` (pager). |
| Main / other | page through / Receipt message from ⋯. |
| Navigation | none out. |
| States | loading: `aria-busy` rows · empty: `library.member.payments.empty` · error: one-line Try again · partial failure: page 2 fails, page 1 stays · success: refreshes after a Collect · offline: shows last loaded page · no permission: n/a · long names: n/a · large amounts: grouped · 320 px Hindi: mode word under the date · thousands: server pages · repeated taps: pager disabled while busy (existing) · expired session: re-auth. |
| Accessibility | list semantics; direction in words. |
| Must keep working | read-only; the revision refresh. |
| Fewer taps | none. |

Tracking: problems — none · decisions — UI only · dependencies — none · risk — low · approval — pending · build — not started · tests — figure parity · outcome — —

### 3d. Attendance strip (`MemberAttendanceStrip`)

| Field | |
|---|---|
| Purpose | Show a parent "does he actually go?": this month's days, filled when present. |
| Who and when | anyone reading the student. |
| Phone layout | "This month · 16 of 18 days" then one square per day so far (existing), 7 per row with weekday initials; legend "Filled = came". |
| Desktop layout | right rail card. |
| What matters most | the figure; the squares second. |
| Components | existing strip; `UbText`. |
| Main / other | none. |
| Navigation | none (Attendance page for the day register). |
| States | loading: square skeleton · empty: "No days yet this month" · error: one line · partial failure: n/a · success: n/a · offline: last loaded · no permission: n/a · long names: n/a · large amounts: n/a · 320 px Hindi: squares 28 px, 7 per row · thousands: ≤31 · repeated taps: n/a · expired session: re-auth. |
| Accessibility | the figure is text; each square has a date label for screen readers; filled vs empty also differs by an inner tick, not only colour. |
| Must keep working | `GET members/{id}/attendance?month=`. |
| Fewer taps | none. |

Tracking: problems — squares colour-only today · decisions — add tick mark · dependencies — none · risk — low · approval — pending · build — not started · tests — a11y sweep · outcome — —

### 3e. Messages: message dialog, fee QR and message log (`MessageDialog`, `UpiPayQrDialog`, `MemberMessageLog`)

| Field | |
|---|---|
| Purpose | Prepare a WhatsApp message (fee, plan end, thanks, welcome, receipt, own words), edit it, open WhatsApp on the library's phone, and see what was sent. |
| Who and when | `library.member.write`; at the desk or on a reminder round. |
| Phone layout | Bottom sheet: "To Asha (guardian: R. Verma)" line, the prepared text in the shared editable box, Open WhatsApp (marigold, a real link ready before the tap). Own-words kind: text box with token hint `{name} {amount} {due_date} {upi_link}` and 700 counter. Fee QR sheet: QR, amount, Share and Copy link (existing Shop P0). **Messages sent** section on the page: kind · when · to whom · the words, 3 shown then "Show all". |
| Desktop layout | Centred dialog 520 px; log in the right rail. |
| What matters most | who it goes to → the words → Open WhatsApp. |
| Components | `UbDialog`/`UbShareSheet`, `UbTextArea`, `UbActionLink`, `UbStatusBadge`. |
| Main / other | Open WhatsApp / edit text, Copy. |
| Navigation | Leaves to WhatsApp; on return the log has the new line (refresh key, existing). |
| States | loading: "Preparing message…" with the box skeleton · empty: no mobile → "Add a mobile for Asha" (`library.messages.noMobile`) and no WhatsApp button · error: `library.messages.error.prepare` + Try again · partial failure: log fails, dialog still works · success: dialog closes; log line; never says "sent by us" (DEC-012) · offline: Open WhatsApp disabled (the record needs the server) · no permission: items not in ⋯ · long names: recipient line wraps · large amounts: server-filled text · 320 px Hindi: box grows to 8 lines · thousands: log limited by server to 50 · repeated taps: the record tap is idempotent per open; button shows pending until the record returns · expired session: re-auth then reprepare. |
| Accessibility | link names the recipient; counter announced at 90%. |
| Must keep working | message text never names the product (02 §1.6); server fills tokens and signs with the library name; `final_text` recorded. |
| Fewer taps | Remind is on the action bar. |

Tracking: problems — none severe · decisions — UI only · dependencies — none · risk — low · approval — pending · build — not started · tests — `customerDocumentsCarryNoProductName.test.tsx`, message dialog tests · outcome — —

### 3f. Seat dialog (`SeatDialog`)

| Field | |
|---|---|
| Purpose | Give, move or free a seat; change shift or locker. |
| Who and when | `canWrite` (staff allowed, `B/views/memberships.py:46`). |
| Phone layout | Sheet: Shift picker (incl. All day) → Seat picker listing seats free in that shift plus the current one, each option "A12 · Hall A"; Locker text; footer Cancel · Save seat. A refusal ("A12 is taken by Imran (Evening)") sits under the seat field (existing). |
| Desktop layout | Centred dialog 480 px. |
| What matters most | the seat list for the chosen shift. |
| Components | `UbDialog`, `UbCombobox`, `UbTextInput`. |
| Main / other | Save seat / Cancel; Free seat is in ⋯ › Seat with a confirm. |
| Navigation | back to the page. |
| States | loading: seat options skeleton while the map for that shift loads · empty: "No seat free in Morning" + "Try All day or another shift" · error: refusal on the field · partial failure: map fails → Try again inside the picker · success: snackbar "Seat A12 given to Asha" · offline: Save disabled · no permission: not drawn · long names: options wrap · large amounts: n/a · 320 px Hindi: full-width pickers · thousands: searchable picker over the map · repeated taps: guard; version conflict → reload message · expired session: nothing saved. |
| Accessibility | combobox labelled; refusal linked with `aria-describedby`. |
| Must keep working | PATCH with version; server clash refusal `library_seat_taken`. |
| Fewer taps | opened from the action bar. |

Tracking: problems — period availability unknown in the picker · decisions — UI only · dependencies — P-04 · risk — low · approval — pending · build — not started · tests — `seats-look.mjs` · outcome — —

### 3g. Membership dialogs (`MemberActionDialog`: renew, change plan, put on hold, reactivate, close, rejoin, take security)

| Field | |
|---|---|
| Purpose | One dialog per membership act, each saying the consequence before the press. |
| Who and when | Renew, Change plan, Take security: `canWrite`; Put on hold, Reactivate, Close: `canClose`; Rejoin: `canRejoin`. |
| Phone layout | Bottom sheet, title "Renew Asha's plan". **Renew**: one bold line from `renewalPreview` "Adds ₹900.00 · valid till 30/12/2026", footer Cancel · Renew. **Change plan**: plan picker + reason. **Put on hold**: reason + until (optional). **Reactivate**: one sentence. **Close**: books-out warning, reason, "Use security for dues" switch with its hint, refund note "₹1,000.00 security to hand back". **Rejoin**: plan picker. **Take security**: "₹500.00 still to take", amount (prefilled), Cash · UPI. Destructive acts (Close, Put on hold) open with focus on Cancel (existing `autoFocus={destructive}`). |
| Desktop layout | Centred dialog 480 px. |
| What matters most | the consequence line → the confirm button. |
| Components | `UbDialog`, `UbForm`, `UbField`, `UbCombobox`, `UbTextArea`, `UbDateInput`, `UbSwitch`, `UbMoneyInput`, `UbChoiceChips`, `UbButton busy`. |
| Main / other | confirm / Cancel. |
| Navigation | from action bar or ⋯; back to the page. |
| States | loading: n/a · empty: Change plan with no other plan → `library.member.changePlan.none` · error: refusal in the form (`formErrors`), e.g. `library_plan_no_end` · partial failure: n/a · success: snackbar `library.member.done.{action}`; page shows server member · offline: confirm disabled · no permission: item absent · long names: title wraps · large amounts: preview line wraps · 320 px Hindi: footer buttons stack (primary on top, existing note in DESIGN-SYSTEM §5) · thousands: n/a · repeated taps: **Renew, Close, Rejoin, Take security lock from the first tap and cannot be dismissed while pending** (F-04, BP-05) · expired session: dialog stays, "Sign in again — nothing was saved". |
| Accessibility | consequence line read before the button (`aria-describedby`). |
| Must keep working | validity = start + months − 1 day, month-end clamped (`B/services/members.py:95`); renewal start rule (`:840`); close applies security only when chosen; security never income. |
| Fewer taps | Renew on the action bar. |

Tracking: problems — F-04 · decisions — strict lock · dependencies — P-01, BP-05 · risk — medium · approval — pending · build — not started · tests — double-tap script on Renew and Take security; existing dialog tests · outcome — —

---

## 4. Seats · `/library/seats` (with `SeatPanel` and `SeatSetupDrawer`)

| Field | |
|---|---|
| Purpose | The room at a glance: which seats are free, part taken or full across the day, per shift; tap a seat to see everybody on it and act. |
| Who and when | `library.member.read`; assign needs `library.member.write`; setup needs `library.settings.manage`. Morning and at shift change, when a new student asks "any seat in the evening?". |
| Phone layout | Header "Seats", actions New admission (icon) and Shifts and seats (⋯, owner/admin). **Shift occupancy block** (from `meta.shift_counts`, one row per active shift): "Morning 06:00–12:00" · a thin bar · "30 of 60 taken"; the whole-day line above it from the occupancy counts: "18 free · 24 part taken · 18 full". **View chips** (one row, scrolls): Whole day · Morning · Afternoon · Evening (`?shift=` on the existing `seat-map` call). **Occupancy chips**: All · Free · Part taken · Full (whole day) or All · Free · Unpaid (one shift) — replaces the three stat-card toggles plus the "Free only" chip, same filter state (`SeatFilters`). Search (seat, name, number, mobile) and Hall filter behind a search icon. **Room grid**: compact tiles, grouped by Hall heading. Tile 64 × 72 px minimum, **4 per row at 320–390 px** (5 at ≥ 412 px): seat label (bold, wraps to two lines, never cut); under it **one segment per active shift in day order**, filled dark when its id is in `taken_shift_ids`, empty when free; a fee dot in the corner for the worst holder's fee (`worstFee`, server fee states). Free tiles are green-outlined with the word "Free"; full tiles dark with "Full"; part tiles show "2 of 3". In one-shift view the tile shows that shift's word (Free / Paid / Due soon / Unpaid / Overdue / Other shift, dashed). Legend in a disclosure ("What the colours mean", existing `SeatLegend`). **Tap a tile → bottom sheet** (`SeatPanel`): "Seat A12 · Hall A", then **one row per active shift**: shift name and hours, then either the holder (name link → student page, fee badge, valid until, mobile, "Collect ₹900.00"/"Open student", Message, ⋯ Change seat / Free seat) or "Available — Assign" (opens admission with seat and shift prefilled). All-day holders take the whole list. Bottom bar shown. |
| Desktop layout | Header with New admission and Shifts and seats. Left: shift occupancy block as a row of shift cards + view and occupancy chips + search + Hall select. Centre: room grid, 10–14 tiles per row by Hall. Right: the seat panel **docked** (380 px, sticky) instead of a sheet; nothing picked → "Tap a seat to see who sits there". Keyboard: arrows move across tiles, Enter opens. |
| What matters most | free seats per shift → which seat is free → who sits where. |
| Components | `UbPageHeader`, `UbChipTabs` (views), `UbFilterChip`/`UbChoiceChips` (occupancy), `UbSearchInput`, `UbFilterSelect`, `UbPressable` tiles, `UbStatusBadge`, `UbDisclosure`, `UbActionSheet`/`UbDrawer` for the panel; feature `SeatPanel`, `SeatSetupDrawer` (both `dynamic()`), `seatDisplay.ts`. No new component: the tile is the existing `SeatTile` re-laid out with the shift segments that the card already draws (`SeatsPageContent.tsx:351-380`). |
| Main / other | Tap seat / Assign, Collect, Message, Change seat, Free seat, Shifts and seats setup. |
| Navigation | In: bottom tab, Home seats card ("18 open" → Free chip). Out: name → student page; Assign → `/library/members?add=1&seat=…&admitShift=…` (kept); Collect → payment drawer. |
| States | loading: grid of tile skeletons in the final size · first use (no seats): "Add your shifts and seats" with Shifts and seats (owner) or "Ask the owner to add seats" (staff) — existing `library.seats.empty.*` · empty filtered: "No seat matches these filters" + Clear · error: existing error + Try again · partial failure: the panel's message dialog or free-seat confirm fails → stays open with the refusal; the map stays · success: freeing or assigning refetches the map; the tile changes and a snackbar names seat and student · offline: last map with "as of"; Assign/Free/Collect disabled · no permission: no Assign, no setup · long names: seat labels like "AC-HALL-101" wrap to two lines inside the tile; tiles drop to 3 per row when any label exceeds 6 characters (decided once per Hall) · large amounts: Collect button amount wraps · 320 px Hindi: 4 tiles at 66 px; shift words in the sheet, not on tiles (tiles carry bars + label only) · 500 seats: the map is one unpaged response; tiles are light (no nested cards), Halls render in windows; filtering is in memory over the returned rows · repeated taps: tile tap toggles the sheet once; Free seat confirm locks · expired session: re-auth to the same view. |
| Accessibility | each tile's name: "Seat A12, 2 of 3 shifts taken, Overdue" (existing `library.seats.tile`); segments also listed as text in the sheet; colour never alone (word or bar count on every tile); grid is a list per Hall. |
| Must keep working | `seat-map` day/view states and `shift_counts` as returned (`B/services/seats.py:424`), overlap and overnight rules (`:43,:51`), free-seat PATCH with version, admission deep link, setup drawer fields (shifts with name and times taken out of use not deleted; seat rows prefix/from/to/hall). |
| Fewer taps | a free shift on a seat is assignable from the sheet in one tap (today: scroll the card list); the occupancy chips filter in one tap with counts visible. |

**Shifts and seats drawer** (`SeatSetupDrawer`, owner/admin): phone full-height sheet with two sections — *Shifts* (each row: name, 06:00–12:00, Take out of use; Add shift with name, start, end pickers) and *Seats* ("60 seats" count; Add a row: prefix, from, to, hall; example hint "A1 to A20, AC hall"); footer Done. States: empty shifts → "No shifts yet: everybody sits all day" (existing `library.seats.shifts.none`); overlap and invalid times refused on the field; repeated taps on Add row lock until answered; offline disables Add. Desktop: right drawer 520 px.

Tracking: problems — F-01 · decisions — compact grid with shift segments; sheet on phone, docked panel on desktop · dependencies — P-05 for upcoming reservations in the panel · risk — low (presentation of existing fields) · approval — pending · build — not started · tests — `seats-look.mjs` at 320/360/390/768/1280 with the measuring checks, figure parity on `shift_counts` and per-seat words, a11y sweep · outcome — —

---

## 5. Fees · `/library/fees` (with `PlanDialog`)

| Field | |
|---|---|
| Purpose | Who has to pay, oldest first, and take their fee; what came in this month; the fee plans. |
| Who and when | `library.member.read`; Take fee needs `payments.payment.write`; plans need `library.settings.manage`. Daily and at month start. |
| Phone layout | Header "Fees". Two figures from `fees/board`: **To collect ₹48,600.00** · **Collected this month ₹1,02,300.00** (`to_collect`, `collected_this_month`). Tabs (`UbTabs`): **Not paid (42)** · **Paid this month** · **Fee plans**. *Not paid*: rows name (wraps), plan, "due since 03/10/2026", "Fee due ₹1,800.00", button **Take fee** (pays the oldest open charge, `charge.amount_due`, existing) and **Remind** (fee message dialog, existing per-student endpoint). When the server sends 100 rows: footer "Showing the 100 oldest. See every student who owes in Students › Fee unpaid" (link to `/library/members?hasDues=true`, F-06). *Paid this month*: date · name · mode · "Paid ₹900.00". *Fee plans* (owner/admin): rows name · "₹900.00 · 1 month · admission ₹200.00 · security ₹1,000.00", "Not in use" badge, Add plan / Edit → `PlanDialog`. Bottom bar shown. |
| Desktop layout | Figures as `UbStatCard`s; Not paid as a table (Student · Plan · Due since · Fee due · Take fee · Remind) on the left 2/3, Paid this month on the right 1/3; Fee plans as a section below. Row name opens the student drawer (existing `MemberDetailDrawer`). |
| What matters most | to collect → oldest unpaid → Take fee. |
| Components | `UbStatCard`, `UbTabs`, `UbAmount`, `UbButton`, `UbDataGrid`, `UbStatusBadge`, `UbEmptyState`; feature `PlanDialog`, `PaymentFormDrawer`, `MessageDialog`, `MemberDetailDrawer` (lazy). |
| Main / other | Take fee / Remind, open student, Add or edit plan. |
| Navigation | In: bottom tab, Home fee figures. Out: student page/drawer; payment drawer over the page; Remind → message sheet. |
| States | loading: figure and row skeletons · first use (no charges ever): `library.fees.empty.*` + Add plan for owners · empty Not paid: "Everyone has paid" (`library.home.allPaid`) · error: `library.fees.error` + Try again · partial failure: a Take fee that fails keeps the drawer · success: the board refetches; the row leaves Not paid and appears in Paid · offline: Take fee and Remind disabled · no permission: no Take fee without payments write; no plans tab without settings manage · long names: wrap · large amounts: figures stack below 360 px · 320 px Hindi: Take fee and Remind stack · 2,000 students: server caps Not paid at 100 (F-06 footer), paid list capped by the server's limit · repeated taps: Take fee opens one drawer (payments key); plan save locks (`isSubmitting`) · expired session: re-auth. |
| Accessibility | Take fee button names the student and amount. |
| Must keep working | oldest charge first (`B/selectors/fees.py:66`), collected = recorded allocations this month, plans: name, fee, length (1/3/6/12), admission, security, `deposit_required_to_borrow: false`. |
| Fewer taps | Remind on the row (today only on Messages or the student page). |

Tracking: problems — F-06 silent cap · decisions — tabs on phone · dependencies — P-03 for more than 100 · risk — low · approval — pending · build — not started · tests — `librarymoney.mjs` figures, figure parity · outcome — —

---

## 6. Attendance · `/library/attendance` (with `AttendanceOverrideDialog`, `CheckInPosterDialog`)

| Field | |
|---|---|
| Purpose | Today's register: who came, who is in now; one tap in or out; past days read only. |
| Who and when | Read `library.member.read`; mark `library.member.write`; let a blocked student in `library.member.close`. Morning rush and shift change. |
| Phone layout | Header "Attendance", actions Check-in QR (icon) and the day (inline date "Today"). Line from the server: "142 of 180 came · 38 in now". Search. **Shift chips** (All · Morning · Evening) that narrow the rows by their `shift` name in the client (rows only; the figures line stays the server's, labelled "Today"). Rows: name (wraps), seat · shift, fee badge, state "Not in" / "In at 08:12" / "08:12–13:40", one button **In** or **Out** (44 px). Sorted: not in first, then in now, then out. Blocked (left/on hold): **AttendanceOverrideDialog** says why; owner/admin "Let in" with reason; staff see "Ask the owner" and Close. Warnings (expired, unpaid) come back from the server and show as a snackbar naming the reason ("Let in · fee unpaid, ask for the fee"). Bottom bar shown (via App sheet; not one of the four tabs). |
| Desktop layout | Table: Student · Seat · Shift · Fee · In · Out · action; figures and shift chips above; date picker right. |
| What matters most | find the student → In. |
| Components | `UbPageHeader`, `UbSearchInput`, `UbChoiceChips`, `UbStatusBadge`, `UbButton busy`, `UbDateInput` (lazy, existing), `UbDialog`; feature `AttendanceOverrideDialog`, `CheckInPosterDialog`. |
| Main / other | In / Out, Let in with reason, Check-in QR (show, print poster), change day. |
| Navigation | name → student page. |
| States | loading: row skeletons; the day picker loads after (existing) · first use: `library.attendance.empty.*` · empty search: `library.attendance.noMatch` · error: `library.attendance.error.title` + Try again · partial failure: one row's In fails → that row shows the refusal, others keep working · success: row moves to "In at …" from the server answer · offline: In/Out disabled with reason · no permission: read-only; no Let in for staff · past day: no buttons, "Past days can only be read" · long names: wrap · large amounts: n/a · 320 px Hindi: In/Out keeps 44 px, seat line wraps · **2,000 students: one unpaged response; the list renders in windows (05 F8); search is in memory** (F-05) · repeated taps: per-row `busyId` + guard; server refuses duplicates · expired session: re-auth. |
| Accessibility | button names "In: Asha"; state in words. |
| Must keep working | check-in rules: block closed/suspended, warn expired/unpaid (`B/services/attendance.py:63`); override audited with reason; poster QR names the library only. |
| Fewer taps | not-in rows first; shift chip cuts a 180-row morning to 60. |

**Check-in QR dialog**: the QR, the library's name, "Print poster" (A4, nothing of the product), Copy link. States: loading QR skeleton; error Try again; offline disabled.

Tracking: problems — F-05 · decisions — client shift chips over returned rows · dependencies — P-02 to use the server's `?shift=` · risk — low · approval — pending · build — not started · tests — a11y sweep, 2k-row profile (05 H8) · outcome — —

---

## 7. Messages · `/library/messages` (with `BulkMessageDrawer`)

| Field | |
|---|---|
| Purpose | Today's fee messages on the fixed schedule (7/3/1 days before, 1/3/7 after), and a group message outside it. |
| Who and when | Read `library.member.read`; send `library.member.write`. Once a day. |
| Phone layout | Header "Messages", action **Message a group**. The schedule sentence (`library.messages.schedule`) as a one-line caption with "How it works" disclosure. Rows: name, seat, "Plan ends 21/10/2026" or "Ended 3 days ago" (server `ends_on` and `kind`), "Fee due ₹900.00", **Send on WhatsApp** or "Sent today" badge (can send again from ⋯), "No mobile for Asha" when `has_mobile` is false. Sent rows sink to the bottom. **Group drawer**: Message (Fee · Plan ending · Your own words), Who (Fee unpaid · Plans ending · One shift · Everybody), shift picker when One shift, text box for own words; Prepare → list of per-student messages, each editable, each **Open WhatsApp** (tap recorded); counter "12 ready · 4 opened"; Change / Done. |
| Desktop layout | Table of today's messages; group drawer right 560 px with the list scrolling inside. |
| What matters most | who is due a message today → Send. |
| Components | `UbPageHeader`, `UbDisclosure`, `UbAmount`, `UbStatusBadge`, `UbActionLink`, `UbDrawer`, `UbChoiceChips`, `UbCombobox`, `UbTextArea`. |
| Main / other | Send / Message a group, edit a group row. |
| Navigation | name → student page; WhatsApp out and back. |
| States | loading: row skeletons · empty: `library.messages.none` ("Nobody to message today") · error: `library.messages.error.title` · partial failure: Prepare fails → `library.messages.error.prepare` in the drawer; selections kept · success: "Sent today" badge after the record · offline: Send and Prepare disabled · no permission: read-only list · long names: wrap · large amounts: server text · 320 px Hindi: Send full width · thousands: group capped by the server (`BULK_MAX = 300`, `B/services/fee_messages.py:75`); the drawer says "First 300 students" when capped; list windowed · repeated taps: Prepare locks; each Open records once · expired session: re-auth, prepared list rebuilt. |
| Accessibility | each Open link names the student; counter `aria-live`. |
| Must keep working | schedule and one-per-day (`fee_messages.py:82-84`), guardian for minors, product never named in text, recorded `final_text`. |
| Fewer taps | sent rows sink, so the next unsent is under the thumb. |

Tracking: problems — cap not said · decisions — say the cap · dependencies — none · risk — low · approval — pending · build — not started · tests — bulk drawer tests · outcome — —

---

## 8. Income & expenses · `/library/money`

| Field | |
|---|---|
| Purpose | Month-end question: what students paid, what the library spent, what is left. |
| Who and when | `library.reports.read`; Add expense needs `expenses.expense.read` (shared Expenses page). Owner, month end. |
| Phone layout | Header "Income & expenses", action Add expense (→ `/expenses`, keeps the Library menu). Period chips This month · Last month · This year. Three figures: **Fees collected** (green), **Expenses** (red), **Left over** or **Short by** (`profit` sign shown in words, existing). Then *Money in* by kind (fees, admissions, renewals, fines) and *Money out* by category, each with amounts right-aligned. |
| Desktop layout | Three `UbStatCard`s in a row; two tables side by side. |
| What matters most | Left over / Short by. |
| Components | `UbChoiceChips`, `UbStatCard`, `UbInfoRow`, `UbAmount`, `UbActionLink`. |
| Main / other | change period / Add expense. |
| Navigation | Add expense → shared Expenses (Library menu kept, `app.ts`). |
| States | loading: three tile skeletons · first use (`has_any` false): `library.money.empty.*` with Add expense — never ₹0 tiles; an older server without `has_any` is never read as "no" (existing rule) · empty period: `library.money.noIncome` / `noExpenses` · error: `library.money.error` · partial failure: n/a (one call) · success: n/a · offline: last period with "as of" · no permission: `library.money.noAccess` · long names: category names wrap · large amounts: tiles stack below 360 px · 320 px Hindi: chips scroll · thousands: categories are few · repeated taps: chip taps cancel the previous request (abort) · expired session: re-auth. |
| Accessibility | sign in words ("Short by"), not only red. |
| Must keep working | `GET /library/profit` figures as returned; only Library income; expenses from the shared module (DEC-019 — no other app's money). |
| Fewer taps | none. |

Tracking: problems — none severe · decisions — UI only · dependencies — none · risk — low · approval — pending · build — not started · tests — `librarymoney.mjs` · outcome — —

---

## 9. Library settings · `/library/settings` (with `RaiseNumberDialog`; links to seat setup and fee plans)

| Field | |
|---|---|
| Purpose | How the library lends, fines, charges a lost book, keeps a held book and reminds; where the student and book numbers stand. |
| Who and when | `library.settings.manage` edits; other readers see disabled controls and no Save (existing). Rare. |
| Phone layout | Header "Library settings". **Setup shortcuts** card at the top (new arrangement, existing routes): "Shifts and seats" → Seats with the setup drawer open; "Fee plans" → Fees › Fee plans; "Closed days" → core calendar (existing link). Tabs General · Renewals · Fines · Lost and damaged · Holds and reminders (`UbTabs`, scroll on phones). One form across tabs, one docked **Save** (marigold) that shows "Unsaved changes" when dirty. Numbering rows: "Next student number LIB-0313 · Change" → **RaiseNumberDialog** ("Numbers are never reused", next number, refusal "Must be at least LIB-0313"). |
| Desktop layout | Tabs as a left vertical list; form on the right; Save in the footer dock. |
| What matters most | the tab being changed; Save. |
| Components | `UbTabs`, `UbForm`, `UbField`, `UbChoiceChips`, `UbSwitch`, `UbMoneyInput`, `UbTextInput`, `UbBottomBar` (dock), `UbDialog`. |
| Main / other | Save / Change number, setup links. |
| Navigation | unsaved changes guard on leaving (04 §2 rule). |
| States | loading: form skeleton · first use: defaults shown as saved values · error: `library.settings.error.title` · partial failure: a tab with a refused field gets a red dot; Save keeps the other tabs' values · success: snackbar · offline: Save disabled · no permission: read-only, no Save, shortcuts hidden · long names: n/a · large amounts: fine cap etc. grouped · 320 px Hindi: hints wrap under choices · thousands: n/a · repeated taps: Save locks (`version`); conflict → "Changed on another device — reload" · expired session: values kept in the form until re-auth. |
| Accessibility | each choice has its hint as description. |
| Must keep working | whole-row save with `version`, fines rules (`B/services/fines.py`), numbers never reused, closed weekdays edited only in the core calendar. |
| Fewer taps | setup shortcuts: plans and seats reachable from Settings where owners look first. |

Tracking: problems — plans and seat setup hard to find from Settings · decisions — shortcut card, no moved routes · dependencies — none · risk — low · approval — pending · build — not started · tests — existing settings tests · outcome — —

---

## 10. Books · `/library/catalogue`, title `/library/catalogue/[titleId]`, Categories `/library/catalogue/categories`, Places `/library/catalogue/locations`

| Field | |
|---|---|
| Purpose | Every title and whether a copy can be handed over; one title with its copies; the library's categories and shelf places. |
| Who and when | `library.catalogue.read`; add/edit per catalogue codenames. Occasional for a study library. |
| Phone layout | **List**: header "Books", Add book; search (Enter on an exact accession number or barcode opens that copy, existing FR-9); availability chips and material type in Filters; cards: title (2 lines) + authors, category, trailing "2 of 3 on shelf". Header ⋯: All copies · Categories · Places. **Title page**: title (wraps), badges on caption line (Archived), facts (ISBN, edition, publisher, year, language, call number, notes) in a collapsible; Copies list (number in mono, place, status word: On shelf · Out · Kept aside · In repair · Missing · Lost · Withdrawn); actions Add copies (primary), Edit details, Archive (only when every copy is withdrawn, existing). **Categories / Places**: list with count, Rename, Merge (categories), Delete only when count is 0 else Switch off (server decides, 409 with count). Drawers: Add book, Add copies (next available or typed numbers), Edit details (`CatalogueDrawers`, lazy). |
| Desktop layout | `UbDataGrid` table Title · Category · Copies (existing `CatalogueColumns`); title page two columns (facts right). |
| What matters most | is a copy on the shelf. |
| Components | `UbDataGrid`, `UbSearchInput`, `UbFilterSheet`, `UbStatusBadge` (`CopyStatusBadge`), `UbDrawer`, `UbMoreActions`, `UbConfirmDialog`. |
| Main / other | Add book / search, open title, add copies, edit, archive, rename/merge/switch off. |
| Navigation | list ↔ title ↔ copy; Back keeps filters (address bar, existing). |
| States | loading: grid skeleton · first use: `library.catalogue.empty.first*` + Add book · empty filtered: `empty.filteredFor` + Clear · error: `catalogue.error.*` · partial failure: title loads, copies fail → section Try again · success: snackbars; new title opens · offline: adds disabled · no permission: no Add, no ⋯ items · long names: Hindi titles wrap, never cut (LED-03 rule kept) · large amounts: copy prices grouped · 320 px Hindi: copy rows stack status under number · thousands: server pages · repeated taps: Add book/Add copies keyed (`library.title.create`, `library.copy.create`) + guard · expired session: drawer values kept until re-auth. |
| Accessibility | status words, mono numbers labelled. |
| Must keep working | accession numbers never reused, archive rule, in-use refusal for categories/places. |
| Fewer taps | none. |

Tracking: problems — low use · decisions — UI only · dependencies — none · risk — low · approval — pending · build — not started · tests — `library-book-look.mjs`, catalogue drawer tests · outcome — —

---

## 11. Copies · `/library/copies`, copy `/library/copies/[copyId]` (with `WithdrawCopyDialog`)

| Field | |
|---|---|
| Purpose | Every physical book in accession order; one copy's place, price, condition and history; withdraw, send to repair, back to shelf. |
| Who and when | read `library.catalogue.read`; withdraw `library.copy.withdraw` (owner/admin). Stock work. |
| Phone layout | **List**: header "All copies", search (number, barcode, title), Filters (status, place, "price missing" chip); rows: number (mono) · title (2 lines) · place · status word. **Copy page**: number as title, title link, status badge on caption line; facts (barcode, volume, place, condition, price, acquired on, source, reference, last seen); actions To repair / To shelf (by status, server-allowed), ⋯ Withdraw; History list (events newest first, never edited). **Withdraw dialog**: reason chips (required), note when Other, "This copy stays in the register as withdrawn; its number is never used again." Focus opens on Cancel. |
| Desktop layout | Table Number · Title · Place · Status; copy page two columns. |
| What matters most | status and place. |
| Components | `UbDataGrid`, `UbFilterChip`, `CopyStatusBadge`, `UbInfoRow`, `UbDialog`, `UbChoiceChips`. |
| Main / other | open copy / repair, shelf, withdraw. |
| Navigation | copy → title page; Back keeps filters. |
| States | loading: skeletons · first use: `library.copies.empty.first*` · empty filtered: `copies.empty.filtered` · error: `copies.error.title` · partial failure: history fails alone · success: status changes from the server answer; snackbar · offline: actions disabled · no permission: no Withdraw · long names: wrap · large amounts: price grouped · 320 px Hindi: facts one column · thousands: server pages, numeric-aware order (BR-4) · repeated taps: actions lock until answered · expired session: re-auth. |
| Accessibility | number read digit-grouped; status in words. |
| Must keep working | withdraw allowed only from server-allowed statuses (BR-7), history immutable. |
| Fewer taps | none. |

Tracking: problems — none severe · decisions — UI only · dependencies — none · risk — low · approval — pending · build — not started · tests — existing copy tests · outcome — —

---

## 12. Self check-in (public) · `/in/[token]`

| Field | |
|---|---|
| Purpose | A student scans the door QR with their own phone and checks themself in. **Customer-facing: names the library only, never the product or its domain** (02 §1.6; metadata already empty, `app/(public)/in/[token]/page.tsx`). |
| Who and when | Students, no session, at the door, often on cheap phones and weak signal. |
| Phone layout | White page, the library's name large (`library` from the server), "Check in for today". Two big inputs (16 px+, 48 px tall): Student number; Last 4 digits of your mobile (numeric, max 4, non-digits dropped — existing). One full-width button **Check in**. After success: large tick, "Welcome, Asha. You are checked in." and "Seat A-12 · Morning"; "already checked in today" variant; warning card "Please see the desk" when the server warns. Nothing else on the page: no logo, no footer, no app links. |
| Desktop layout | Same, centred, 420 px column (rarely used). |
| What matters most | the two boxes → Check in → the welcome. |
| Components | `UbTextInput`, `UbButton busy`, `UbStatusBanner`, `UbEmptyState` (existing in `F/self-checkin/components/SelfCheckInPageContent.tsx`). |
| Main / other | Check in. |
| Navigation | none. |
| States | loading: library name skeleton · dead token: "This check-in code is not in use · Please check in at the desk" · error: "Could not check you in. Try again." · not found: one sentence that never says which half was wrong · throttled: "Too many tries. Wait a minute and try again." · blocked: "Please see the desk before you come in." · success / already · offline: "No internet. Please check in at the desk." with the button disabled · no permission: n/a (token is the permission) · long names: library name wraps · large amounts: none shown (no money on this page) · 320 px Hindi: fits one column; Hindi follows the device language · thousands: n/a · repeated taps: button busy from first tap; server refuses duplicates as "already" · expired session: n/a (no session). |
| Accessibility | labels visible (not placeholder-only — today placeholders double as labels; the redesign adds visible labels), `inputMode="numeric"`, result announced. |
| Must keep working | first name only shown; wrong half never revealed; same check-in rules as the desk; no product name, manifest or icons. |
| Fewer taps | none (two fields, one button). |

Tracking: problems — placeholder-as-label · decisions — visible labels, no product mark · dependencies — none · risk — low · approval — pending · build — not started · tests — `SelfCheckInPageContent.test.tsx`, `customerDocumentsCarryNoProductName.test.tsx` · outcome — —

---

## 13. Owner questions

1. **Q1 — the word for an expired membership.** Today one state reads "Overdue" (chip), "Expired" (tile) and "Membership expired" (row), and "Overdue" is also a fee word. Options: (a) "Plan ended" everywhere; (b) "Expired" everywhere; (c) keep as is. **Recommend (a)**: plain, and never confused with an unpaid fee. Copy only; no rule changes.
2. **Q2 — duplicate protection.** Approve P-01 (send the idempotency key the server already accepts on Renew, Close, Rejoin) and BP-05 (server keys on Take security, Forgive fee, Cancel wrong charge), or rely on client locking alone? **Recommend P-01 now (header only, no server change) and BP-05 next**.
3. **Q3 — Seats on a phone.** Compact room grid with shift segments and a bottom sheet (this spec) instead of today's one card per seat? **Recommend yes**; it is the only layout that shows a 60-seat room on one phone screen.

## 14. Functional proposals (need approval, not part of the redesign)

| ID | Proposal | Why | What changes | Risk |
|---|---|---|---|---|
| P-01 | Send `Idempotency-Key` on Renew, Close, Rejoin | server scopes exist (`B/views/memberships.py:218-229`) but the client sends none (F-04); Renew creates a fee charge | request header only; no server change | low |
| P-02 | Attendance shift filter via the existing `?shift=` parameter | server already supports it (`B/views/attendance.py:55`); would make the figures line per shift | request parameter (frozen request shape) | low |
| P-03 | Fees "Not paid" beyond 100 rows | `SHOWN = 100` (`B/selectors/fees.py:23`) | paging or a `limit` parameter on `fees/board` | low |
| P-04 | Whole-period seat availability in the admission and seat pickers | the pickers use today's `view_state`; a future clash is refused only on save (qa/seat-management rule 6) | a `from`/`to` on `seat-map` or a new availability call | medium |
| P-05 | Upcoming reservations in the seat panel | qa/seat-management rule 7 asks to show them; `seat-map` returns today only | new field on `seat-map` | medium |
| P-06 | Security apply and refund as their own actions on the student page | endpoints exist (`deposit/apply`, `/refund`) but only `close` uses them | new UI workflow on frozen Library; needs BP-05 first | medium |
| BP-03, BP-04, BP-05 | as in [08](../08-backend-change-proposals.md) | member list queries, fines per loan, money writes without keys | as written there | as there |

---

## Review

Scored with the rubric in [09 §1](../09-design-review.md): Mobile 20%, Ease 15%, Visual 15%, Feedback 15%, A11y 10%, Desktop 10%, Safety 10%, Reuse 5%. Pass: strictly above 8.6. Whole Library module = Home (05) + every screen above.

### Round 1 (first draft of this file) — failed

| Mobile | Ease | Visual | Feedback | A11y | Desktop | Safety | Reuse | **Weighted** |
|---|---|---|---|---|---|---|---|---:|
| 8.3 | 8.4 | 8.5 | 8.2 | 8.3 | 8.4 | 8.8 | 9.0 | **8.43** |

Arithmetic: 0.20×8.3 = 1.660; 0.15×8.4 = 1.260; 0.15×8.5 = 1.275; 0.15×8.2 = 1.230; 0.10×8.3 = 0.830; 0.10×8.4 = 0.840; 0.10×8.8 = 0.880; 0.05×9.0 = 0.450; total **8.425 → 8.43**.

Shortcomings found in round 1:
1. Seats kept the one-card-per-seat phone list; occupancy per shift was not readable without scrolling (Mobile, Ease).
2. Student page kept Collect fee inside a card and 17 flat ⋯ items (Ease, Mobile).
3. Money actions without a server key (Take security, Forgive, Cancel charge) and Renew/Close/Rejoin without a key had only `busy`; dialogs could be dismissed while pending (Feedback, Safety).
4. Attendance with 2,000 students and the Fees 100-row cap were not addressed (Mobile, Ease, Safety — a silent cap hides who owes).
5. The client sum `owedInAll` was carried over (Safety: a figure the server never sent).
6. Expired-membership words inconsistent; attendance squares colour-only; self check-in used placeholders as labels (A11y, Visual).
7. Desktop opened students in a drawer with no way to the full page; Seats desktop wasted width on cards (Desktop).

Changes made (now in the specs above): compact seat grid with shift segments, sheet on phone and docked panel on desktop (§4); four-button action bar with grouped ⋯ (§3); strict lock rules per action and non-dismissable pending dialogs (§0.3, 3b, 3g); windowed attendance with shift chips and the Fees cap footer linking to the existing filter (§5, §6); two server figures instead of the client sum (§0.2); Q1 raised, tick marks on the strip, visible labels on `/in` (§3d, §12); "Open full page" in the drawer, desktop table from the unused `MemberColumns`, desktop seat panel docked (§2, §4).

### Round 2 (current specs) — passes, provisionally

| Mobile | Ease | Visual | Feedback | A11y | Desktop | Safety | Reuse | **Weighted** |
|---|---|---|---|---|---|---|---|---:|
| 8.8 | 8.8 | 8.6 | 8.8 | 8.6 | 8.7 | 9.0 | 9.0 | **8.77** |

Arithmetic: 0.20×8.8 = 1.760; 0.15×8.8 = 1.320; 0.15×8.6 = 1.290; 0.15×8.8 = 1.320; 0.10×8.6 = 0.860; 0.10×8.7 = 0.870; 0.10×9.0 = 0.900; 0.05×9.0 = 0.450; total **8.770 → 8.77** > 8.6.

**Production safety, 9.0 — why**: every screen uses only endpoints, fields and actions already in the client (`L/api/*`, 02 §2); the one client calculation that produced a figure the server never sent (F-08) is removed; no state words are recomputed (fee and seat words map server values through the existing `memberDisplay.ts` / `seatDisplay.ts`); every money action has a stated lock; URLs and deep links (`?add=1&seat=…`) are kept; everything else is in §14 for approval. Not 9.5 because Take security, Forgive and Cancel charge still rely on the client alone until BP-05, and Renew/Close/Rejoin until P-01.

**Strongest remaining criticisms**: the seat tile's segment bar is new visual language that people must learn (needs the user test); the student page is long on phones even with collapsed sections; Hindi copy is a draft; Books and Copies were specified for completeness, not redesigned in depth (low use in study libraries).

### What each score still needs before it counts

| Score | Needs |
|---|---|
| Safety 9.0 | API contract snapshot of every Library endpoint the client calls, before and after (02 §6), empty diff; figure parity on a seeded library of 2,000 students and 200 seats (dues, `fee_state` words, `day_state`, `shift_counts`, fees board, profit) old vs new screens; existing `apps/library/tests` 100%; double-tap script on every §0.3 money action showing exactly one write |
| Mobile 8.8 | installed PWA on a low-end Android and an iPhone; Seats grid at 320/360/390 with the measuring checks (no text node outside its box, `scrollWidth` = viewport) in English and Hindi; keyboard-open check on admission and charge dialogs |
| Ease 8.8 | 5–8 library owners or desk staff: find a free evening seat, collect a part fee, renew, check a student in, send today's reminders — each unaided |
| Feedback 8.8 | tap-to-first-change ≤ 100 ms and INP ≤ 200 ms on the reference phone for Students, Seats, student page, Attendance (05 §5–6) |
| A11y 8.6 | axe at 390 and 1280 in both themes, TalkBack on the seat grid and the student page, 200% text at 320 px |
| Desktop 8.7 | review of the docked seat panel and student drawer at 1280 and 1536 with a real library's 120+ seats |
| Visual 8.6 | rendered mockups checked against the Counter Mode reference (teal, marigold for the one main action per screen) |
