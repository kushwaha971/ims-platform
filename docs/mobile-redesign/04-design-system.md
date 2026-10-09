# 04 — Mobile design system

This **extends** `docs/DESIGN-SYSTEM.md`; it does not replace it. Colour,
fonts, the brand mark, the contrast floor and every owner decision recorded
there stand. What is new is a **mobile layer**: sizes, type, spacing and a
handful of components that only render below `lg`.

## 1. Principles

1. **One primary action per screen, at the bottom.** Docked bar or FAB, never
   the top-right corner.
2. **Words over icons** for anything used less than daily. Icons alone only
   for the universal four: back, close, search, more (⋯).
3. **Summary first, detail on demand.** A one-line summary stands in for a
   folded section, so folding never hides *state*.
4. **Money is the loudest thing.** Amounts in Inter, tabular, coloured by
   meaning, largest on the screen that is about them.
5. **Nothing removed, everything placed.** A desktop feature may move deeper on
   a phone; it may not disappear.

## 2. Colour

Unchanged tokens from `light.css` / `dark.css`. Mobile adds **no new hex
values**; it assigns roles:

| Role | Token | Light | Use |
|---|---|---|---|
| Primary action, FAB, active input | `--accent` | #4A47D6 | one per screen |
| Nav active pill | `--primary-100` bg, `--primary-600` icon | #E1E0FC / #3A36B8 | 6.7 : 1 |
| They owe you / You gave | `--error` | #CC1C1C | amounts, the You gave button (white text 5.7 : 1) |
| You owe them / You got | `--success` | #2B7443 | amounts, the You got button (white text 5.6 : 1) |
| Due soon, low stock | `--warning` on `--warning-dim` | | badges only |
| Info badges, tags | `--info` on `--info-dim` | | |
| Ground / cards | `--canvas`, `--surface-card`, `--surface-subtle` | white / white / #FAFAFA | hero blocks use `subtle` |
| Hairlines | `--border-hairline` | #E6E6E6 | row dividers start at the text, not the avatar |
| Scrim | `--overlay-scrim` | 48 % ink | sheets, dialogs |

The red/green pair is the khata convention every Indian ledger app uses
(02-research §1). It already colours balances here; mobile extends it to the
two entry buttons, which today are indigo and grey (finding A11). **Colour is
never the only signal**: every amount has its words ("You will get", "You
gave") beside it.

## 3. Typography

Fixed sizes below `lg` (the desktop fluid `clamp()` scale stays for `lg+`).
DM Sans for text, **Inter for every figure and every ₹**.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `m-display` | 34 / 40 | 600 | the balance on a khata, a bill total on its own page |
| `m-title-l` | 22 / 28 | 600 | tab titles |
| `m-title` | 18 / 24 | 600 | detail app bar, sheet titles, dialog titles (20 / 26) |
| `m-amount` | 24 / 30 | 600 | home hero figures |
| `m-body-l` | 16 / 22 | 500 | list row titles, buttons, **all input text** |
| `m-body` | 15 / 22 | 400 | paragraphs, dialog body |
| `m-meta` | 13 / 18 | 400 | row captions, hints, errors |
| `m-label` | 12 / 16 | 500 | nav labels, chip counts, badges |
| `m-section` | 16 / 22 | 600 | section headings ("Needs attention") |

Rules: inputs are **16 px** (no iOS zoom, finding A19). Nothing smaller than
12 px. Row titles never truncate to one character: they get the full row width
and badges move to the caption line (the LED-03 rule, made global).

## 4. Spacing, grid and sizes

4 px base. Phone grid: one column, **16 px gutters** (`--gutter` already is).

| Token | Value | Use |
|---|---|---|
| `--m-gutter` | 16 | page sides |
| `--m-bar` | 56 | app bar |
| `--m-nav` | 64 + safe area | nav bar |
| `--m-row` | 64 min | list rows (72 with a two-line caption) |
| `--m-target` | 48 | primary buttons, inputs (52), icon buttons |
| min target | 44 × 44 | everything tappable — the existing `.ub-hit` rule |
| gap between targets | 8 min | 12 when both are under 44 visually (existing rule) |
| section gap | 24 | between groups on a screen |
| radii | control 10–12 · card 12 · sheet 20 · FAB 16 · chip / pill 999 | |

Breakpoints (existing Tailwind screens, no new ones):

| Width | Layer |
|---|---|
| < 640 (`sm`) | phone — everything in this document |
| 640–1023 | large phone / tablet — same mobile shell; lists may show two columns of cards from `md` |
| ≥ 1024 (`lg`) | **desktop, untouched** |

## 5. Elevation

| Level | Token | Use |
|---|---|---|
| 0 | none + hairline | cards, rows |
| 1 | `--shadow-1` | segmented control's selected pill |
| 3 | `--shadow-3` | FAB, snackbar, dialog |
| 4 | upward 32 px | sheets |

Docked bars and the nav bar use a **hairline**, not a shadow.

## 6. Components

New components are `Ub*`, live in `src/design-system`, and render only where
the mobile layer is active. Existing ones are reused as they are wherever
possible.

### 6.1 New

| Component | What it is | Use when | Avoid when |
|---|---|---|---|
| **`UbBottomNav`** | 4 manifest tabs + More; icon in a 56 × 30 pill, 12 px label, badge | every top-level screen below `lg` | detail and task screens |
| **`UbMobileAppBar`** | 56 px; variants `tab` (large title), `home` (business switcher), `detail` (← title ⋯), `task` (✕ title text-action) | every screen below `lg` | — |
| **`UbActionSheet`** | a `UbDialog` sheet of labelled rows (icon, label, optional caption, `danger` tone) | 3+ secondary actions; the ⋯ menu | 1–2 actions (show them as buttons) |
| **`UbDockedBar`** | bottom bar for one or two primary actions, safe-area aware, hairline top | khata (gave/got), forms (total + Save), statement (Print/Share) | a list screen (use the FAB) |
| **`UbFilterButton`** | search-row button with a count badge; opens a filter sheet; applied filters render as removable chips under it | any list with more than one filter | a single filter (use chips inline) |
| **`UbSegmented`** | 2–3 equal options in a sunken track | two views of one list (Customers / Suppliers), a binary choice in a form | 4+ options (use chips) |
| **`UbSummaryLine`** | one line of 2–3 labelled figures | above a list | a figure that needs a tap target (use the hero) |
| **`UbHeroPair`** | two tappable figures in one card | the home's to-collect / to-pay; library in-now / fees due | more than two |
| **`UbQuickActions`** | 4 equal 48 px tinted icons with labels | a home screen | anywhere else |
| **`UbAttentionList`** | rows with a tinted icon, a count sentence and a chevron | a home's to-do | historical data |
| **`UbAmountField`** | 44 px Inter figure, ₹ prefix, underline, `inputmode="decimal"` | a sheet whose job is one amount | a form with many fields (use `UbMoneyInput`) |
| **`UbSuccessScreen`** | tick, one sentence, next actions | after a document is created | after a khata entry (use the snackbar) |
| **`UbMoreList`** | the More tab: grouped `NavSections` rows + "Find a feature" | — | — |

### 6.2 Existing, reused as-is or with a mobile prop

`UbFab` (finally placed; extended label, compacts on scroll), `UbDialog`
(sheets and dialogs), `UbDrawer` (desktop only), `UbDisclosure` (folded form
sections — gains a `summary` prop), `UbChoiceChips` / `UbFilterChip` (chip
rows), `UbSearchInput` (gains a trailing slot for `UbFilterButton`),
`UbDataGrid` (card mode below `md`; pagination swapped for `UbLoadMore` below
`md`), `UbEmptyState`, `UbSkeleton`, `UbSnackbar` (gains the action
descriptor PTY-04 FR-12 and LED-01 both wait for), `UbShareSheet`,
`UbStatusBadge`, `UbAmount`, `UbAvatar`.

### 6.3 Patterns

**Lists.** Summary line → search with Filter → applied chips → status chips
(if the list has a status) → rows → "That's everyone · N" or Load more → FAB.
Rows: avatar or icon (40) · title (16/500, one line) · caption (13) · amount
right (16/600, coloured) with its label under it. A row is the tap target; no
inline buttons except a single "Collect"-type action on queue lists.

**Detail.** Identity → hero figure → labelled pill actions (2–4, horizontally
scrollable if needed) → sections → docked bar.

**Forms.** Full screen. Required fields first, optional fields marked
"optional" in the label, everything else in disclosures with a summary. One
column. Labels above. Errors under the field after the first submit or blur,
never on open (the LED-01 `autoFocus` finding stays fixed). Docked Save; a
total, if any, docked beside it.

**Tables.** No table is shown as a table below `md`. A table becomes rows (the
first column is the title, the key figure is the amount, the rest go in the
caption) and its column sort moves into the Filter sheet's "Sort by". Wide
report tables (GST summary, registers) use a **summary card + rows**, with the
full table one tap away as an export.

**Charts.** One sparkline with its total on Home; full charts on an Insights
screen, one per screen, with the period as chips. Every chart has a text
equivalent (`aria-label` with the trend) and the Table view stays available.

**Dialogs.** Only for confirmations and blocks. Title says what happens; body
says the consequence; buttons are full width, **the safe choice first**.
Destructive in `--error`.

## 7. States

| State | Pattern |
|---|---|
| Loading (first) | Skeleton rows the shape of the real rows; no spinner pages |
| Loading (action) | The button shows a spinner and "Saving", stays the same size, disables |
| Empty (first use) | Icon tile, one-line title, one sentence of why, primary + secondary action; the FAB hides so the action is not shown twice |
| Empty (filtered) | "No one matches …" + Clear filters + "Add …" with the typed name |
| Error (load) | Inline card in place of the content: what failed, that nothing saved is lost, Try again |
| Error (field) | 2 px error border, icon + message under the field, `aria-invalid`, focus moves to the first error |
| Refused by a rule | Shown in the sheet where the action was (e.g. credit limit), in words that name the rule and who can override it |
| Offline | Warning strip under the app bar for the whole app |
| Success (entry) | Snackbar above the nav: what happened + new balance + Undo; the new row flashes once |
| Success (document) | `UbSuccessScreen` with next steps |
| Disabled | 45 % opacity, no pointer; never the only explanation |
| Focus | 2 px accent ring, 2 px offset — the existing `--focus-ring` |
| Pressed | `--surface-hover` fill on rows; one step darker on buttons |

## 8. Accessibility

Everything in DESIGN-SYSTEM §5 stays (axe sweep at 390, 4.5 : 1 text, 3 : 1
UI, `.ub-hit`, focus return). The mobile layer adds:

- Nav bar is a `nav` landmark with `aria-current="page"`; badges have text.
- Sheets are `role="dialog"` `aria-modal`, close on Escape, swipe and ✕, and
  return focus (`returnFocusRef`).
- Swipe is never the only way to do anything.
- Segmented controls are `aria-pressed` groups; sort lists are `radio` rows.
- Amounts announce their meaning ("₹1,000, you will get").
- Hindi strings at 360 px in the sweep: tab labels are one word in both
  languages (आज, ग्राहक/पार्टी, बिल, सामान, और) — *the Hindi words are a
  proposal for the translator, not final copy*.
- Reduced motion turns off the push and sheet animations.

## 9. Do and don't

- **Do** put the one main action at the bottom. **Don't** add a header "+".
- **Do** use a ⋯ sheet with words for 3+ actions. **Don't** add an icon-only
  button for anything less than daily.
- **Do** fold optional fields behind a summary. **Don't** fold a field the
  task needs.
- **Do** keep the khata's red/green meaning on every amount and the two entry
  buttons. **Don't** use red or green for anything that is not money direction
  or status.
- **Don't** show a feature that is not built (DESIGN-SYSTEM §6 still applies to
  More and every sheet).
