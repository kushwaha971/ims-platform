# Design system — how every screen is built

This is the first stop before adding UI. It records the visual language the
owner chose on 23 Sep 2026 and the reusable pieces that carry it, so a new
screen composes existing components instead of restyling from scratch.

## 1. Source of truth

The reference designs are the BrandHub customer-portal Figma
("Brandhub-Wireframes-4"). BrandHub's own customer portal is the production
reading of that Figma, so where the two differ by a pixel, BrandHub's code
wins: its typography scale is fluid, and this product ports that scale
verbatim.

Four owner decisions override the Figma and are not up for re-litigation in a
PR:

- **Colour** is this product's own primary (indigo `#4A47D6` ramp), not the
  Figma's brand teal. Tenants may still white-label the primary ramp.
- **Page ground** is white, not the Figma's `#FAF9F8`.
- **Sidebar** is docked (full height, hairline on the right), not floating.
- **Contrast floor** stays 4.5:1. Where a Figma grey or red is below it, the
  token is one step darker (see the comment beside each token in
  `light.css`).

## 2. Typography

Use the BrandHub class names directly in new code. They live in
`src/design-system/typographyPlugin.js`.

| Use                                   | Class                                                    |
| ------------------------------------- | -------------------------------------------------------- |
| Page title                            | `ds-body-xl-semibold` (via `UbPageHeader`)               |
| Page description                      | `ds-body-base-regular`, tertiary                         |
| Section heading ("Transactions")      | `ds-body-base-medium` (via `UbSectionHeading`)           |
| Card or panel title                   | `ds-body-base-medium` (via `UbPanelSection`)             |
| Body text, table cells, inputs        | `ds-body-base-regular`                                   |
| Meta, captions, chips, labels in rows | `ds-body-s-regular` / `ds-body-s-medium`                 |
| Sidebar rows / captions               | `ds-nav-label-*` / `ds-nav-caption-*` (fixed 12 / 10 px) |
| Money and numbers                     | `ds-num-*` (Inter), or `UbAmount`                        |

Fonts are local files in `src/fonts` (SIL OFL): DM Sans for text, Inter for
figures and for the rupee sign everywhere, Noto Sans Devanagari for Hindi,
Fraunces and Epilogue for the sign-in hero only. There is no font CDN.

## 3. Measurements

| Thing                                   | Value                                                                |
| --------------------------------------- | -------------------------------------------------------------------- |
| Every input, select, search, date field | 40 px (`h-10`), 8 px radius, `#E6E6E6` hairline, ink border on focus |
| Buttons                                 | `md` 40 px, `sm` 28 px, `lg` 44 px, 14 px medium text                |
| Filter chips                            | 32 px pills                                                          |
| Cards and panels                        | 12 px radius, hairline border, 16 px padding                         |
| Stat tiles                              | `UbStatCard` in `UbStatGrid`: up to five across, filling the row     |
| Table header                            | 48 px, `#FAFAFA`, 12 px medium; rows 14 px regular                   |
| Page insets                             | 24 px sides on desktop, 16 px on phone                               |
| Field spacing                           | label 4 px above the control; 24 px between fields                   |

### Page header and actions (owner, 23 Sep 2026)

The page header is ONE row at every width: the title on the left, the actions
on the right. Actions pass `iconOnly="mobile"` (`UbButton`, `UbActionLink`), so
on a phone they are 32 px icon squares on the title's line. If even the icons
do not fit, they wrap BELOW the title starting at the left — never right-aligned
on a line of their own. A page's everyday pair (a khata's You gave / You got)
goes in `primaryActions`: beside the title from `sm` up, an equal-width
two-column row under the title on a phone. On a phone the khata also docks a
copy of the pair at the bottom (`UbBottomBar`, `sm:hidden`) — but only once
the header pair has scrolled up out of view (`useScrolledPast` on
`UbPageHeader`'s `primaryActionsRef`), and never for an archived party or a
role that cannot write. The header pair stays; the dock is not a second
permanent copy.

A list whose sort lives in table column headers gives the phone's card layout
a sort control of its own: an icon button in the grid toolbar opening a
single-choice sheet (`UbDialog` + `UbChoiceChips`) that writes the same
`ordering` the headers do (party list, UAT D5).

A screen's scope date sits on the right — in the header (`UbDateInput
appearance="inline"`, read as text: "As of 23 Sep 2026") or in `UbFilterBar`'s
`end` slot beside the chips. Dates read "1 Apr 2026" in a date control; dates
printed in lists and rows are dd/mm/yyyy. Section headings carry their count
inline (`UbSectionHeading meta`), and page sections are 16 px apart.

Every input carries a placeholder that shows an example of what goes in
(`e.g. Ramesh Traders`, `10-digit mobile number`), never a repeat of the
label. Pass it to `UbField` as `placeholder`; it reaches the control through
the render props.

## 4. Components to reach for

| Need                                                                       | Component                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page title, description, actions                                           | `UbPageHeader`                                                                                                                                                                                                                                               |
| A section's title row outside its card                                     | `UbSectionHeading` (title, meta, aside, or "View all →")                                                                                                                                                                                                     |
| One card holding several sections with dividers                            | `UbPanel` + `UbPanelSection`                                                                                                                                                                                                                                 |
| Label ↔ value facts                                                        | `UbInfoRow` (`default`, `positive`, `total`)                                                                                                                                                                                                                 |
| KPI tiles                                                                  | `UbStatCard` in `UbStatGrid`                                                                                                                                                                                                                                 |
| Tables and phone cards                                                     | `UbDataGrid`                                                                                                                                                                                                                                                 |
| Search box                                                                 | `UbSearchInput`                                                                                                                                                                                                                                              |
| A header action that navigates or downloads                                | `UbActionLink`                                                                                                                                                                                                                                               |
| Date                                                                       | `UbDateInput` (calendar popover; quick choices below)                                                                                                                                                                                                        |
| A screen's period — presets plus a custom from/to                          | `UbDateRangePicker` (renders the `UbFilterBar`: chips on the track, dates and the screen's other scope in `end`, on the right)                                                                                                                               |
| Sending something to a customer — WhatsApp, SMS, copy, the platform sheet  | `UbShareSheet` over `UbDialog`; links from `src/utils/share.ts`; outcomes to the snackbar through `useShareFeedback`                                                                                                                                         |
| One floating primary action on a phone                                     | `UbFab` (56 px, safe-area aware, clears the toast via `useBottomInset`) — gallery only until a screen has no header room for its primary action                                                                                                              |
| Status pill                                                                | `UbStatusBadge`                                                                                                                                                                                                                                              |
| Money                                                                      | `UbAmount`                                                                                                                                                                                                                                                   |
| Party picker source                                                        | `usePartySearch` (never a second debounced party fetch)                                                                                                                                                                                                      |
| Item picker source                                                         | `useItemSearch` from `features/inventory` (`{ trackedOnly }` for stock screens; `lookup(code)` for a scan) — never a second debounced item fetch                                                                                                             |
| A server-backed picker (search as you type, "Create …" row, scanner Enter) | `UbAsyncCombobox` (`shouldFilter={false}`; the caller owns the query). A fixed list stays `UbCombobox`, which now also takes `onCreate`                                                                                                                      |
| A quantity with its unit                                                   | `UbQuantityInput` (`decimals` = `unit.allow_decimal ? 3 : 0`, `signed` for "Adjust by"; the value stays a string)                                                                                                                                            |
| Editable document lines — invoice, purchase, adjustment                    | `UbLineItemsEditor` (caller owns `useFieldArray({ keyName: 'key' })`; one `Controller` per cell; Enter/↑↓/Alt+N/Alt+Backspace/Ctrl+Enter; cards below `md`). Follows the BrandHub table row + mobile card form; INV-06 is the first caller                   |
| A USB/Bluetooth barcode scanner outside a text field                       | `useScannerListener` in `src/hooks`                                                                                                                                                                                                                          |
| Toasts                                                                     | dispatch to the snackbar; it renders top-centre                                                                                                                                                                                                              |
| A failure's request id                                                     | `UbRequestId` — "Reference 3f2b…", label from `common.error.reference`; `UbEmptyState` / `UbSnackbar` / `UbDataGrid` error copy take `requestId` + `requestIdLabel` (the type requires the label with the id); a banner's text uses `formatRequestReference` |
| A phone number on screen                                                   | `formatPhoneForDisplay` ("+91 98123 45678"); `tel:` hrefs and Copy use `toDialableNumber` ("+919812345678"), both in `src/utils/share.ts`                                                                                                                    |

A dialog opened FROM another overlay (an item in a ⋯ sheet opening a share
sheet, a drawer or a confirm) passes `returnFocusRef` — the control that opened
the first overlay — to `UbDialog` / `UbDrawer` / `UbShareSheet` /
`UbConfirmDialog`. The item that opened it closes with its sheet, and without a
named fallback focus fell to `<body>` on close (Sprint 3 QA D1, WCAG 2.4.3).
Skeleton bars are fluid (`w-full` or a fraction, the length in `max-w-*`), so
no skeleton can be wider than the tile it sits in (QA D3). That includes the
data grid's own loading rows: a phone card draws a card-shaped skeleton, and a
table-tier bar is capped `max-w-full` by its cell (QA N1).

`cn()` knows the custom radii (`xs`, `pill`, `card`, `control`), so a
caller's `rounded-pill` genuinely replaces a primitive's `rounded-sm` (UAT
D-1: the skeleton disc drew square). A new `borderRadius` name in
`tailwind.config.js` is added to `CUSTOM_RADII` in `src/utils/cn.ts` in the
same change.

When none of these fits, add the new component to `src/design-system`, add it
to this table in the same change, and write down which Figma node it follows.

### Wave 3 (Sprint 3, §32.6.4) — what was built and what was not

Part 23 §23.3 lists six wave-3 components. Four exist; two were considered and
deliberately NOT built, because the rule for a `Ub*` is that the pattern
RECURS, and each of these would have exactly one caller:

- **`UbTimeline` — not built.** The day-banded list (a quiet date band, rows
  under it, hairlines between rows) has one user, `PartyLedgerTimeline`. The
  statement is a `UbDataGrid` with a running-balance column, not a banded
  list, and the aging report is a table too. A generic timeline would be a
  render-prop wrapper around fifteen lines of `UbStack`/`UbText`/`UbDivider`
  with one caller — the band's classes would move files and nothing would be
  shared. Build it when a second banded list appears (the payments or
  cashbook day view, EXP-03, is the likely one), by lifting the `groups.map`
  block out of `PartyLedgerTimeline` with `renderHeading`/`renderRow` props.
- **`UbPartyHeader` — not built.** The khata header card (avatar, customer /
  supplier badges, the `tel:` link with copy, the balance with its baseline
  and the credit bar) has one user, `PartyDetailHeader`. The statement's
  header is `UbPageHeader` plus `UbStatCard`s and shares none of it, and
  `PartyDetailHeader`'s own docstring records why a component that knows what
  a positive balance MEANS is feature code rather than design system. The
  reusable halves — `UbAvatar`, `UbAmount`, `UbStatusBadge`, `UbTagList` — are
  already in the barrel. Revisit when invoices or bills get a party block.
- **`UbFab` — built, not placed.** The only candidate action, Add party, is
  already in the one-row page header; a FAB there would be the same action
  twice. It lives in the gallery until a screen needs it.
- **`UbShareSheet`** is a `UbDialog` (a bottom sheet on a phone) rather than
  NTF-03 FR-1's dropdown-on-desktop, because `@radix-ui/react-popover` cost
  the khata route +10.9 KB and the bundle gate refused it. WhatsApp and SMS
  are real anchors (`wa.me/<digits>?text=`, `sms:<+number>?&body=`), which is
  NTF-03 FR-13's popup-blocker fallback used as the primary path. Its copy
  never says "sent" — DEC-012: the merchant sends it.

### Party picker source: usePartySearch

Every party picker — the app bar's quick search today; the sale, purchase,
payment and expense editors next — gets its results from
`usePartySearch()` (`features/parties/hooks/usePartySearch.ts`): 250 ms
debounce, a 2-character minimum, the in-flight request aborted on every
keystroke, active parties only, and the same trigram-backed `GET /parties` the
list uses, so a party findable on the list is findable in every picker. The
party LIST screen has its own source, `usePartyList()`, because its results are
shared Redux state (restored on Back, invalidated by writes) and a picker's are
not.

There is no third source, and lint enforces it (Sprint 3 §32.6.7 — "party
search becomes four different implementations in four features"). Outside
those two hooks and the modules behind them, `npm run lint` fails on:

| Spelling                                                                                           | Rule                    |
| -------------------------------------------------------------------------------------------------- | ----------------------- |
| `import { listParties } from '…/parties/api/partyService'` (also `import *` of it, and re-exports) | `no-restricted-imports` |
| `import { fetchPartyList } from '…/parties/redux/partyListThunk'`                                  | `no-restricted-imports` |
| `partyService.listParties(…)`, `x.fetchPartyList`                                                  | `no-restricted-syntax`  |
| `API_PATHS.PARTIES` — hand-rolling `GET /parties?q=` in another service                            | `no-restricted-syntax`  |

Everything else in `partyService` (`getParty`, `createParty`, types) and the
per-party paths (`API_PATHS.PARTY(id)`, `PARTY_TAGS`, …) stay importable:
reading one party by id is not a search. The allowlist is
`PARTY_FETCH_ALLOWED` in `frontend/eslint.config.mjs`, and
`src/tests/partyFetchLintRule.test.ts` lints the deliberately-bad fixtures in
`src/tests/lint-fixtures/party-fetch/` to prove each spelling fails with its
rule id. If a picker needs something the hook does not do (a `type` filter is
already there), extend the hook; adding a file to the allowlist is adding a
second party source and wants the same review as a new design-system component.

## 5. What is deliberately not shown

A control for a feature that is not built is not rendered: no notification
bell until notifications exist, no "Forgot password?" until reset email has a
delivery provider, "Soon" rows in the sidebar only for modules on the roadmap.
