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

| Need | Component |
|---|---|
| Page title, description, actions | `UbPageHeader` |
| A section's title row outside its card | `UbSectionHeading` (title, meta, aside, or "View all →") |
| One card holding several sections with dividers | `UbPanel` + `UbPanelSection` |
| Label ↔ value facts | `UbInfoRow` (`default`, `positive`, `total`) |
| KPI tiles | `UbStatCard` in `UbStatGrid` |
| Tables and phone cards | `UbDataGrid` |
| Search box | `UbSearchInput` |
| A header action that navigates or downloads | `UbActionLink` |
| Date | `UbDateInput` (calendar popover; quick choices below) |
| A screen's period — presets plus a custom from/to | `UbDateRangePicker` (renders the `UbFilterBar`: chips on the track, dates and the screen's other scope in `end`, on the right) |
| Sending something to a customer — WhatsApp, SMS, copy, the platform sheet | `UbShareSheet` over `UbDialog`; links from `src/utils/share.ts`; outcomes to the snackbar through `useShareFeedback` |
| One floating primary action on a phone | `UbFab` (56 px, safe-area aware, clears the toast via `useBottomInset`) — gallery only until a screen has no header room for its primary action |
| Status pill | `UbStatusBadge` |
| Money | `UbAmount` |
| Party picker source | `usePartySearch` (never a second debounced party fetch) |
| Item picker source | `useItemSearch` from `features/inventory` (`{ trackedOnly }` for stock screens; `lookup(code)` for a scan) — never a second debounced item fetch |
| A server-backed picker (search as you type, "Create …" row, scanner Enter) | `UbAsyncCombobox` (`shouldFilter={false}`; the caller owns the query). A fixed list stays `UbCombobox`, which now also takes `onCreate` |
| A quantity with its unit | `UbQuantityInput` (`decimals` = `unit.allow_decimal ? 3 : 0`, `signed` for "Adjust by"; the value stays a string) |
| Editable document lines — invoice, purchase, adjustment | `UbLineItemsEditor` (caller owns `useFieldArray({ keyName: 'key' })`; one `Controller` per cell; Enter/↑↓/Alt+N/Alt+Backspace/Ctrl+Enter; cards below `md`). Follows the BrandHub table row + mobile card form; INV-06 is the first caller |
| A USB/Bluetooth barcode scanner outside a text field | `useScannerListener` in `src/hooks` |
| Toasts | dispatch to the snackbar; it renders top-centre |
| A failure's request id | `UbRequestId` — "Reference 3f2b…", label from `common.error.reference`; `UbEmptyState` / `UbSnackbar` / `UbDataGrid` error copy take `requestId` + `requestIdLabel` (the type requires the label with the id); a banner's text uses `formatRequestReference` |
| A phone number on screen | `formatPhoneForDisplay` ("+91 98123 45678"); `tel:` hrefs and Copy use `toDialableNumber` ("+919812345678"), both in `src/utils/share.ts` |
| Multi-line text with a character counter | `UbTextArea` (`counterLabel` takes an ICU string with `{count}`/`{max}`; used by bill header/footer and reminder templates) |
| Picking an image file | `UbFileUpload` (a styled button that IS the label of a hidden input; `accept`, `maxBytes` and `onReject('too_large' \| 'wrong_type')` refuse before upload — the server re-checks magic bytes) |
| Showing an uploaded image or its empty slot | `UbImagePreview` (fixed box, `object-contain`, `emptyLabel` when there is none; logo and signature) |
| A hex colour | `UbColorInput` (native swatch + hex text box kept in step); the branding page wraps it with preset swatches and the contrast check in `ColourField` |
| A silent product loop (the landing page) | `UbVideo` — poster first with the box sized by `aspect-ratio` (zero CLS), no `<source>` until within 200 px of the viewport, webm then mp4, `media` so only the visible device variant downloads, pauses offscreen and in a hidden tab, no autoplay under reduced motion, a pause control always (WCAG 2.2.2), the poster and a file link on failure. `priority` preloads the LCP poster (a `Link` header with `media`) |
| A device around a recording | `UbDeviceFrame` `variant="browser"` (dots + URL pill) or `"phone"` (ink bezel, speaker in its own band); `tilt` leans it ≈ −2° in 3D and straightens on hover, fine pointers only |
| A section that enters on scroll | `UbReveal` (`stagger` for its children). Hidden state only after hydration and only below the fold — never around a hero's text |
| A word that rotates in a headline | `UbRotatingText` — `aria-hidden`, widest word reserves the width; the caller puts the full sentence in an `sr-only` node |
| Pill tabs with a sliding indicator | `UbChipTabs` — automatic activation, arrows move selection AND focus. `UbTabs` stays the in-page underlined row |
| Ambient light behind a hero | `UbAmbientGlow` — blurred `--landing-blob*` blobs, transform-only loops, clipped, paused offscreen, off under reduced motion |
| One IntersectionObserver / media query | `useInView` (a shared observer per `rootMargin`), `useMediaQuery`, `usePrefersReducedMotion`, `matchesNow` — never a second listener in a feature |

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

### The landing page's module pieces (feature-local, CR-2026-09-29-PLATFORM-B)

Three pieces in `features/landing/components/LandingModuleParts.tsx` are deliberately NOT `Ub*`,
because only the landing page shows modules that are not built (the app never does, §6):

- `ModuleStatusChip` is `UbStatusBadge` with a word and a dot. Live has a filled dot and the
  success tone. Planned has a hollow ring and the neutral tone. In development has the warning
  tone. The label is never "Soon".
- `ModuleIconTile`: a live module is a filled accent tile; any other module is a dashed outline
  with a muted icon. The dashed line is the whole "not built yet" illustration.
- `CoreChip`: `md` uses the full core name in the map's core slab, and `sm` uses the short name
  in a card's "Built on" row, so the rows stay even.

The module map (`PlatformMap.tsx`) is a stack: module tiles on top, the core slab under them,
and connectors between. From `lg` the bus runs `calc((100% - 4rem) / 10)` in from each edge,
which is exact for five columns at `gap-4`, and `e2e/landing.mjs` measures that every stub sits
under its tile's centre. Anything that represents a module carries `data-module-card` and
`data-module-status`. A planned one must hold the chip and no media or sign-up link, and a test
checks it.

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

## 5. Accessibility rules (Sprint 12 sweep, 28 Sep 2026)

`node e2e/a11y-sweep.mjs` (in `run-regression.mjs` as `a11y-phone` and
`a11y-desktop`) checks every MVP screen at 390 and 1280 with axe-core plus the
rules below, a Hindi pass at 360, and the khata-entry, invoice-editor and
payment-drawer flows by keyboard. What it enforces, and what a new control has
to do to pass:

- **Touch targets: 44 × 44 on a phone, visuals unchanged.** The owner's 32 px
  icon-only header buttons, 32 px chips, 40 px `md` buttons and 16 px boxes keep
  their size; `.ub-hit` (in `app/globals.css`, below `sm` only) gives each a
  transparent `::after` that is never smaller than 44 × 44, centred on the
  control. Every `mlButtonClasses` button and action link, `UbFilterChip`,
  `UbChoiceChips`, the select/combobox/date triggers, the checkbox, radio and
  switch, and the password eye carry it. Tabs are 44 px tall on a phone instead
  (a sideways-scrolling tab list would clip an overhang). Two consequences for
  a caller: neighbouring small targets need **12 px** between them on a phone
  (`UbPageHeader` actions and chip rows open to `gap-3` below `sm`; two rows of
  28 px `sm` buttons need 16 px), and an `overflow` ancestor clips the
  overhang, so a scrolling chip track carries 6 px of vertical padding
  (`UbFilterBar`). Underlined TEXT links in rows are held to WCAG 2.5.8's 24 px
  (axe `target-size`), not 44.
- **The `-bright` tones are fills, never text.** `--error-bright` is 4.05:1 and
  `--warning-bright` 2.39:1 on white. `scripts/check-contrast.mjs` scans `src/`
  and fails on `text-<tone>-bright` unless the line says `contrast: decorative`
  (an aria-hidden icon beside words that carry the meaning).
- **Text on the selected tint** (`--accent-quiet` over the card) is checked
  too: `--text-tertiary` was darkened one step (#6B696F) so a selected row's
  caption clears 4.5:1; the checker composites the rgba wash as the browser does.
- **An invalid field still shows focus**: `ML_CONTROL_TONE(true)` thickens the
  error border to 2 px on focus rather than keeping it unchanged.
- **ARIA tables own only rows and cells** (`UbLineItemsEditor`): a control or
  message beside the cells goes in a cell of its own.
- **A sideways-scrolling preview is a focusable, named region** (`tabIndex=0`,
  `role="region"`, `aria-label`) — the invoice and receipt sheets.
- **Known and left for the owner:** below `sm`, `MLDialogFooter` stacks actions
  reversed (primary on top), so Tab walks a phone footer bottom-up. The sweep
  prints it as a NOTE; `order="as-written"` is the one-line switch.

## 6. What is deliberately not shown

A control for a feature that is not built is not rendered: no notification
bell until notifications exist, no "Forgot password?" until reset email has a
delivery provider, and no sidebar row for a module whose page is not built — not
even a greyed "Soon" row. `useNavigation` shows only items marked `ready` in
`navigation/sidebarConfig.ts`; a roadmap module appears the day its page does.

## 7. Brand — the YourKhata mark (CR-2026-09-29-BRAND-C)

The product is **YourKhata** — one word, capital Y and K, set in Latin script in
English and in Hindi alike (a brand name is not translated). The domain is
**yourkhata.com**. The code namespace (`modules/DigiKhaato/…`, `UB_`, `ub_*`) is
not renamed; only what a person sees is.

### The mark — K-c "Bandhan", the tied bahi cover

The tile is the **cloth cover of a bahi-khata** in deep indigo, with a stitched
**hem** inset along its edge. On it is a white **K** (the round-2 "signature K",
DM Sans 600) whose leg does not stop at the baseline: it **sweeps on across the
whole cover as the tie band**, the string a bahi is bound shut with. Where the
band is tied sits a small **bahi-red knot** with two white string ends.

It was chosen by the owner from round 3 (`frontend/public/brand/concepts3/`,
four variants of the K with khata styling), after round 1 (`concepts/`, Concept
A the open khata, applied then replaced) and round 2 (`concepts2/`, Concepts 1
the signature K and 2 the joined YK). All three rounds are kept as the record.
Previews: `node frontend/scripts/render-brand.mjs --preview` writes
`/tmp/e2e-shots/brand/concepts.png`.

**Construction** (64 × 64 grid, `concepts3/k-c-mark.svg`):

- Cover: `rect 64 × 64, rx 15` (the §23.2.3 squircle).
- Hem: a 1.5-unit stroke, inset 4.75, `rx 11`.
- K: DM Sans 600 K at scale 0.04, origin (10.6, 38.5); cap height 28 units.
- Tie band: y 41.9 → 46.4, from the tile's left edge to x 20 under the stem,
  then from the K's swept leg to the right edge. It lies wholly inside the
  straight part of the squircle, so the mark needs **no clipPath** — and it has
  **no `id`**, so two logos on one page never collide.
- Knot: centre (48, 44.1), red r 3.2 inside a cover-coloured ring r 4.6 (so it
  reads as tied ON the band), string ends from (48, 46) to (45, 55) and (52, 55)
  at 2.4 units, round caps.

| Asset | File | Notes |
|---|---|---|
| The mark in the app | `UbLogo` (`src/design-system/UbLogo`) | inline SVG, painted from `--brand-*`, so a tenant's primary ramp repaints it |
| Master SVG | `public/brand/yourkhata-mark.svg` | 64 × 64 grid |
| 16 px cut | `public/brand/yourkhata-mark-16.svg` | hand-cut on the pixel grid; also the SVG favicon |
| Maskable / Apple | `public/brand/yourkhata-maskable.svg` | full-bleed cover, figure at 72 % inside the 80 % safe zone, band edge to edge, no hem |
| Lockup | `public/brand/yourkhata-lockup.svg` | mark + "YourKhata" in DM Sans 600, outlined; indigo K whose sweep ends in the knot |
| Icons | `public/icons/{favicon-16,favicon-32,apple-touch-icon,icon-192,icon-512,maskable-512}.png` | rendered from the SVGs by `node frontend/scripts/render-brand.mjs` — never hand-exported |

### Small sizes

- **≥ 32 px:** the full mark — hem, strings, ring and knot.
- **≤ 24 px** (`UbLogo size="sm"`): the hem is dropped and the knot is a single
  dot (r 4), no ring, no strings. A 1.5-unit hem is 0.6 px at 24 px and reads as
  a smudge.
- **16 px:** the hand-cut file only. Stem x 3 → 5 and band y 9 → 11 on whole
  pixels, the band runs edge to edge, the knot is one 4 × 4 dot (x 11 → 15,
  y 8 → 12), no hem, no strings. Never scale the master to 16.

### Colours and contrast

| Part | Token | Default | Contrast |
|---|---|---|---|
| Cover | `--brand-cover` → `--primary-600` | `#3A36B8` | 8.75:1 on white; 2.02:1 on the dark rail (floor 2.0, see below) |
| K and tie band | `--brand-figure` | `#FFFFFF` in every theme and brand | **8.75:1 on the cover, held to the 4.5 text floor in both themes** |
| Hem | `--brand-hem` → `--primary-400` | `#716DE4` | 2.09:1 — decorative |
| Knot | `--brand-knot` (fixed) | `#C8322B`; dark `#D9453D` | 5.32:1 / 4.31:1 on the band — decorative, never text |
| Wordmark | `--text-primary` (or `tone="inherit"` on the rail) | `#0A090B` | 19.9:1 |
| Wordmark's K and sweep | `--text-accent` | primary-600 light, primary-300 dark | ≥ 4.5 (text table) |

`--brand-knot` is **the one raw colour** the mark may carry (a test fails on any
other hex, and on any other non-ramp `--brand-*` value). It is the one `--brand-*`
value with a dark step, because it is also the full stop of the wordmark's sweep
and sits on the theme's surface there. It sits close to the debit red `--error`,
so it is decorative only — never a label, never a figure. The cover on the dark
rail is below 3:1; a logo's own colours are outside WCAG 1.4.11 and the white K
(17:1 on the rail) is what identifies the mark there, so the pairing is checked
against an explicit 2.0 floor rather than none. `node scripts/check-contrast.mjs`
and `src/tests/darkTheme.contrast.test.ts` check all of it from the token values.

The mark is the same in light and dark themes; only the wordmark follows the
theme. The static PNG/SVG files carry the default hex values — a white-label
tenant's ramp repaints the in-app mark, not the favicon.

### Why a K is white-label safe

A tenant with its own logo replaces the mark wholesale
(`branding.logo_attachment_id`); a tenant without one is, by definition, showing
the product's default — YourKhata's K. The **signature wordmark** (indigo K with
the sweep and the knot) is applied only when the name is "YourKhata"; a tenant's
name beside the mark is plain text.

### Wordmark, clear space, minimum size

- The wordmark is "YourKhata" in **DM Sans 600** (`ds-wordmark-*`), never
  letter-spaced wider, never all caps, never split into two words or two weights.
  The K is in the accent and its leg sweeps under "hata" into the knot dot. For a
  screen reader it is one word (an `sr-only` text node; the drawn copy is hidden).
- **Clear space** around the mark is **¼ of the tile's edge** on every side
  (16 units on the 64 grid); in the lockup the gap between tile and wordmark is
  ¼ to ⅓ of the tile (the `GAP` tiers in `UbLogo`), never less.
- **Minimum size:** 24 px for the in-app mark (`size="sm"`, simplified as above);
  below that, the 16 px cut.

### Do

- Use `UbLogo` in the app and the files in `public/brand/` everywhere else.
- Regenerate every PNG with `render-brand.mjs` after any SVG change.
- On a coloured or photographic ground, use the tile as it is — the cover is its
  own ground.

### Don'ts

- Don't recolour parts independently, add a gradient, outline or shadow; don't
  move the knot off the band or make it any colour but `--brand-knot`.
- Don't use the knot red for text, a status, or a debit figure.
- Don't draw the hem or the strings below 32 px, or scale the master to 16 px.
- Don't give a tenant's name the signature K, and don't set the K alone as a
  monogram without the cover and band.
- Don't rotate, stretch, or break the band — it runs the full width of the cover.
- Don't put the product's name, mark or domain on anything a merchant's
  **customer** receives — A4/80 mm bills, estimates, credit notes, the A5
  receipt, the party statement, the `/d/<token>` share page, CSV/ZIP contents,
  WhatsApp/SMS texts. Those are signed "Issued by / Shared by <business>" with
  the tenant's name and the tenant's own logo if it set one.
  `src/tests/customerDocumentsCarryNoProductName.test.tsx` fails on any of
  "DigiKhaato", "YourKhata", "yourkhata.com" in their rendered HTML.
- Don't imitate another khata app's mark (green book tiles, a plain "K" in a
  circle); the K on a tied indigo cover is ours.
