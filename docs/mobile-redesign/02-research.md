# 02 — Research: competitors and mobile guidelines

## How this was done, and its limits

- **Competitors.** The product already has three research chapters that
  describe competitor apps in detail: `docs/04-competitor-research-synthesis.md`,
  `docs/09-khatabook-analysis.md` and `docs/platform/15-competitive-analysis.md`.
  This chapter reuses their observations (cited as **[04]**, **[09]**, **[15]**)
  and adds public sources found on 9 Oct 2026. I did **not** install the
  competitor apps for this pass, and app UIs change between releases; anything
  marked *(verify on device)* should be checked on a phone before it is quoted
  to anyone as fact.
- **Guidelines.** Material Design 3, Apple's Human Interface Guidelines, WCAG
  2.2, and Nielsen Norman Group's research on hidden navigation.

## 1. What the competitors do on a phone

### Khatabook and OkCredit — the ledger-first apps

The pattern a YourKhata merchant is most likely to already know.

- **Parties are the home screen.** Customers and Suppliers as two tabs, the
  running "you will get / you will give" totals pinned on top, a single large
  "Add customer" button [09 §Parties].
- **Entry is two big buttons, red "You gave" and green "You got"**, then an
  amount keypad, an optional note, a date defaulting to today [04 §Khatabook,
  09]. The passbook shows a running balance after each row like a bank
  statement [04].
- **Reminders and statements leave through WhatsApp** as a link or PDF [04].
- **Weakness:** almost nothing beyond the ledger — inventory and GST are thin or
  separately licensed [04 §quadrants]. Their navigation never had to carry 25
  destinations, so their structure cannot be copied whole.

**Take:** the red/green two-button entry docked under the thumb, the totals as
one pinned line, and parties as the core list. **Leave:** their flat
single-purpose structure — YourKhata has five times the features.

### Vyapar and myBillBook — the billing-first apps

- Vyapar's mobile app has historically used a **left menu** listing Dashboard,
  Reports, Sale, Purchase, Expense, Cash & bank, and more, with a coloured
  header holding the company ([Vyapar feature list](https://vyaparapp.in/blog/vyapar-app-complete-feature-list-all-about-your-favorite-billing-software/)).
  *(verify on device — recent versions may have changed.)*
- Billing is a dedicated full-screen flow: party, items, totals, save and
  share; the bill is shared over WhatsApp straight after saving [04 §Vyapar,
  15].
- Vyapar's home leads with business numbers and charts [15 §6.1].

**Take:** the full-screen bill flow ending in a "share now" step, and a home
that shows money first. **Leave:** a drawer as primary navigation — it is the
exact thing this audit found slowing YourKhata down (A1), and the evidence
below is against it.

### Zoho Books / Inventory — the full-stack reference

Zoho's 2023–24 mobile revamp describes a dashboard with receivables, payables
and overdue invoices and bills **on one screen**, a **Quick Create** area the
user customises with the transaction types they use most, and list screens
that **remember the last filter** ([Zoho community: mobile app revamp](https://help.zoho.com/portal/en/community/topic/accounting-on-the-go-series-41-zoho-books-mobile-app-revamp)).
Its status vocabularies (draft, unpaid, overdue, paid, void) are already the
model for YourKhata's [04].

**Take:** quick-create on home, overdue as a to-do, persistent list filters
(YourKhata already keeps filters in the URL — PTY-05 — so this is nearly free).

### Library and lending tools

TrackMyLibrary-style reading-room apps centre on **seats, shifts, fees and
WhatsApp alerts** [15 §2]; daily-collection tools centre on **today's route and
collect** [15 §3]. Both confirm one rule: each app's home is *today's work*,
not a report.

## 2. Platform and research guidance

| Topic | Guidance | Source | What it means here |
|---|---|---|---|
| Bottom navigation | 3–5 destinations of equal importance on compact screens; labels shown | [Material 3 navigation bar (Compose ref)](https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-navigation-bar.html), [SAP Fiori on M3](https://www.sap.com/design-system/fiori-design-android/v25-8/components/m3-standard-components/navigation-bar/usage) | 4 destinations + More. Never icon-only |
| More than 5 destinations | Use a drawer or rail *in addition*, not instead | SAP Fiori on M3 (above) | The long tail lives in a More tab, not a hidden drawer |
| Hidden navigation | Hidden (hamburger) navigation lowered discoverability by about a fifth and slowed task time on mobile in NN/g's 2015 study | [NN/g methodology](https://www.nngroup.com/articles/hidden-navigation-methodology/), summary in [Smart Insights](https://www.smartinsights.com/digital-marketing-strategy/are-hamburger-menus-hidden-navigation-good-for-ux/) | Finding A1 is a known, measured cost. *(Figures from secondary summaries; the primary NN/g article was not retrieved.)* |
| Sheets | Detents: medium (≈ half) for scannable choices, large for writing; a grabber; swipe down to dismiss | [Apple HIG — Sheets](https://developer-mdn.apple.com/design/human-interface-guidelines/components/presentation/sheets), [WWDC21 10063](https://developer.apple.com/videos/play/wwdc2021/10063/) | Menus and filters are half sheets; forms with typing are full sheets or full screens |
| Touch targets | 24 × 24 minimum (2.5.8 AA), 44 × 44 enhanced (2.5.5 AAA) | WCAG 2.2 | Keep the existing 44 px floor; raise primary controls to 48 |
| One-handed use | Most phone use is one thumb; the top corners are the hardest reach | Steven Hoober's field observations (UXmatters, 2013) — *from knowledge, not re-fetched* | Primary actions at the bottom: docked bar or FAB |
| Input zoom | iOS Safari zooms on focus when an input's font is under 16 px | WebKit behaviour, widely documented — *from knowledge* | 16 px input text on phones (finding A19) |

## 3. Patterns chosen, and why

Each decision is matched to a job in this product, not borrowed for its own
sake.

| Job | Pattern chosen | Rejected, and why |
|---|---|---|
| Move between the daily screens | **Bottom navigation bar**, 4 destinations + More, per app, from the manifest | Drawer (A1, NN/g); tab bar with 5 real destinations (no room for the long tail) |
| Reach the other 20 Shop destinations | **More tab**: a grouped, searchable list of every row the sidebar has | A second drawer; a grid of icons (needs labels anyway, scales badly) |
| Do the one main thing on a list | **Extended FAB** that shrinks on scroll | Header "+" (A3, top-corner reach); a centre "+" tab (steals a navigation slot and means different things per tab) |
| Write a khata entry | **Docked two-button bar** (red You gave, green You got) + **half sheet** with a large amount field | FAB (two equal actions, not one); a full page (loses the khata behind it) |
| Choose among 4–6 secondary actions | **⋯ in the app bar → action sheet with words** | Icon rows (A3) |
| Filter and sort a list | **One Filter button with a count → sheet**; applied filters as removable chips | Inline dropdown rows (A5) |
| Switch document type (bills, estimates, …) | **Title as a switcher** opening a list with counts | Five icon buttons (A3); five more tabs |
| Status within a list | **Scrolling chips with counts** | Underlined tab row (works, but chips carry counts and scroll) |
| Long forms (bill, party) | **Full-screen flow**: the few needed fields, the rest under a **disclosure with a one-line summary**, the total and Save **docked** | Everything visible (A14); a multi-step wizard (too slow at a counter) |
| Confirm something destructive | **Centred dialog** with the safe choice first | Bottom sheet (too easy to tap through) |
| Tell what happened | **Snackbar** above the nav, with Undo where it can be undone | Banner; modal |
| Many metrics | **One hero pair** + a **scrolling strip** + "Needs attention" rows | 2 × 2 stat cards; charts first |
| Seat map | **Dense grid of 48 px cells**, state by colour + border + label | A list (loses the spatial meaning) |

Gestures are used where a platform user already expects them and never as the
only way: swipe down to close a sheet (the ✕ stays), horizontal scroll on chip
rows. **No swipe-to-delete or swipe actions on rows** — a khata is a financial
record, and an accidental swipe on a crowded counter is exactly the mistake
LED-03 exists to correct.
