# 01 — Audit of the current mobile experience

Measured on 9 Oct 2026 against the running local stack (`dev` at `fae0fbcd`),
Chromium at **390 × 844** (iPhone 14 class), a fresh owner with six customers,
one item and a few khata entries. Screenshots are in [`audit/`](audit/). Every
finding below names the screenshot or the file it came from; where something is
inferred rather than seen, it says so.

## 1. What exists

| Area | Routes | Notes |
|---|---|---|
| Shop | 57 | dashboard, customers, suppliers, khata, statement, aging, reminders, 5 sales documents × list/new/detail/edit, 3 purchase documents, expenses, payments, cashbook, items (+ masters, price lists), stock summary / low, imports, 6 reports |
| Library | 16 | today, counter, members, seats, fees, attendance, messages, money, catalogue (+ categories, locations), copies, settings |
| Lending | 7 | today, loans (+ new, detail), borrowers, routes, messages |
| Platform | 10 | settings (profile, branding, business days, data, devices, plan, activity), team, switch |
| Auth / public / admin / internal | 20 | landing, login, signup, onboarding wizard, password flows, `/d/<token>`, `/pay/<token>`, `/in/<token>`, legal, admin, design-system gallery |

110 `page.tsx` files in all. The Shop's menu alone is **23 rows in 7 groups**
plus Team and Settings (`features/shop/app.ts`).

## 2. The shell is the root problem

**There is no mobile navigation model; there is a desktop sidebar in a drawer.**
`UbSidebar` is `hidden lg:flex`; below 1024 px the only way between screens is
the ☰ button, which opens `MobileNavDrawerSheet` — the same `NavSections` list
as the rail ([`audit/20-nav-drawer.png`](audit/20-nav-drawer.png)). Every
destination, including the three a merchant uses fifty times a day, is two taps
away and out of sight.

The data for a bottom bar already exists and is unused:
`AppNavItem.bottomNav` is set on 3 Shop rows, 4 Library rows and 3 Lending
rows, `useNavigation()` computes `bottomNav`, and **no component reads it**
(`MobileNavDrawer.tsx` docstring says so). `UbBottomNav` is listed as unbuilt in
`CLAUDE.md`.

**The phone header carries six controls in 390 px**
([`audit/02-customers.png`](audit/02-customers.png)): ☰, logo, business
switcher, search, bell, account. The switcher gets what is left, so the
business name reads **"Sharm…"** — the one piece of context a person with two
shops needs is the one truncated.

## 3. Findings by screen

Severity: **H** blocks or slows a frequent task · **M** clutter or confusion on
a frequent screen · **L** polish.

| # | Screen | Finding | Sev | Evidence |
|---|---|---|---|---|
| A1 | All | No persistent navigation; ☰ drawer holds all 25 rows | H | `20-nav-drawer.png`, `MobileNavDrawer.tsx` |
| A2 | All | Header: 6 controls, business name truncated to 5 letters | M | `02-customers.png` |
| A3 | All lists | Page header actions are **unlabelled icon squares**: 4 on Customers (tags, import, export, add), 5 on Bills (estimates, orders, challans, credit notes, new), 6 on Items (stock, tags, import, export, masters, add). The meaning of each is only in its `aria-label` | H | `02-customers.png`, `07-invoices.png`, `06-items.png` |
| A4 | All lists | Totals in a bordered "Details ▾" box above the list (3–4 figures) — costs ~110 px before the first row | M | `02-customers.png`, `06-items.png`, `07-invoices.png` |
| A5 | Customers | Search, then three controls (Show, Balance, Filters), then the sort button **alone on a fourth row**. First customer at y≈390 (CSS px) | M | `02-customers.png` |
| A6 | Lists | Desktop pagination ("‹ › Page 1 of 1") on phone cards, even with six rows | L | `02-customers.png`, `13-aging.png` |
| A7 | Dashboard | Three primary-looking buttons wrap onto two rows; stats box; "Insights" with two dropdowns; two charts each with a Chart/Table toggle and series toggles. With no data, the chart's y-axis reads **1, 1, 0** (duplicate tick) | M | `01-dashboard.png` |
| A8 | Dashboard | Nothing on the dashboard is actionable as a to-do (overdue, not reminded, low stock live on other screens) | M | `01-dashboard.png` |
| A9 | Khata | You gave / You got are at the **top** of the page; they dock at the bottom only after scrolling past (`useScrolledPast`) — the most frequent action is at the hardest reach on first open | H | `03-khata.png`, DESIGN-SYSTEM §3 |
| A10 | Khata | Every row carries its own ⋯ button (≈24 px visual); "Show corrections" is a permanent switch in the section header | M | `03-khata.png` |
| A11 | Khata | You gave is the filled primary (indigo), You got is grey — the two equal choices look unequal, and neither carries the red/green the balances use | M | `03-khata.png` |
| A12 | Entry drawer | Opens with a **You gave / You got radio pair** although the merchant just pressed one of them; Save and Cancel are stacked full-width (Cancel duplicates ✕) | M | `21-entry-drawer.png` |
| A13 | Entry drawer | Amount is an ordinary right-aligned input; the number being typed is the smallest thing on screen | L | `21-entry-drawer.png` |
| A14 | New invoice | **1,393 px tall with one empty line.** Walk-in name, mobile, date and place of supply come before items; discount, round off and GST notes always open; the total is at the bottom of the page, not visible while adding items; Save is an icon-only paper plane in the header | H | `08-invoice-new-full.png` |
| A15 | Statement | 2 × 2 stat cards; running balance "Balance ₹500.00" does not say direction while the khata says "(to give)" for the same figure | M | `04-statement.png`, `03-khata.png` |
| A16 | Aging | Row subtitle repeats the amount shown on the right ("₹4,150.00 · 31–60 days" + "₹4,150.00") | L | `13-aging.png` |
| A17 | Reports | Each report is a bordered card with an **underlined link** title — web page, not app | L | `12-reports.png` |
| A18 | Settings | One page **2,565 px** tall | M | measured (`scrollHeight`) |
| A19 | Type | Body text is `clamp(0.875rem, 0.821rem + 0.268vw, …)` = **14.2 px at 390**. Inputs inherit it; iOS Safari zooms the page on focus for inputs under 16 px. *Computed from `typographyPlugin.js`; confirm on a real iPhone.* | M | `typographyPlugin.js:77` |
| A20 | Type | The rupee sign renders in DM Sans in captions ("Bal ₹1,000.00", "Sales ₹0.00"), against DESIGN-SYSTEM §2 ("Inter … for the rupee sign everywhere"); the two glyphs visibly differ on one screen | L | `01-dashboard.png`, `03-khata.png` |

What already works and should be kept: the 44 × 44 `.ub-hit` rule, the
card-per-row list rendering in `UbDataGrid` below `md`, bottom sheets via
`UbDialog`, `returnFocusRef`, the contrast floor, and no horizontal scroll on
any screen measured (`scrollWidth` = 390 on all 16).

## 4. The pattern behind the findings

Every finding above is one of four things:

1. **Desktop structure, narrowed.** Sidebar → drawer, page-header toolbar →
   icon row, stats box → stats box, table → cards with pagination. Each was
   made to *fit*; none was re-decided for a thumb.
2. **Everything visible at once.** Forms show every field; lists show every
   control; the dashboard shows every chart. Nothing is folded behind a
   summary.
3. **Primary actions at the top.** Add, Save, You gave — all in the header
   region, the least reachable part of a 6-inch screen held in one hand.
4. **Icons standing in for words.** Twenty-plus icon-only buttons across the
   list screens, for actions a merchant meets once a month.

The proposal addresses the four, not the twenty findings one by one.

## 5. Measurements

Captured with `e2e`'s Playwright against the live stack. "Small" counts
interactive elements in the first viewport whose **visual** height is under
36 px (their hit area is already enlarged by `.ub-hit`, so this is a clutter
measure, not a WCAG failure).

| Screen | Page height (px) | Interactive in first view | Visually < 36 px |
|---|---|---|---|
| Customers | 844 | 9 | 4 |
| Items | 844 | 15 | 7 |
| Bills | 844 | 14 | 6 |
| New invoice | 1,393 | 8 | 4 |
| New purchase bill | 1,697 | 8 | 3 |
| Reports | 1,206 | 7 | 7 |
| Settings | 2,565 | 10 | 3 |

Library and Lending were not captured live (Library is behind
`UNRELEASED_MODULES`; Lending was not seeded). Their manifests and page files
were read instead; they share the shell and therefore findings A1–A4.
