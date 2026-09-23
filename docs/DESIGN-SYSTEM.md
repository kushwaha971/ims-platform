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

| Use | Class |
|---|---|
| Page title | `ds-body-xl-semibold` (via `UbPageHeader`) |
| Page description | `ds-body-base-regular`, tertiary |
| Section heading ("Transactions") | `ds-body-base-medium` (via `UbSectionHeading`) |
| Card or panel title | `ds-body-base-medium` (via `UbPanelSection`) |
| Body text, table cells, inputs | `ds-body-base-regular` |
| Meta, captions, chips, labels in rows | `ds-body-s-regular` / `ds-body-s-medium` |
| Sidebar rows / captions | `ds-nav-label-*` / `ds-nav-caption-*` (fixed 12 / 10 px) |
| Money and numbers | `ds-num-*` (Inter), or `UbAmount` |

Fonts are local files in `src/fonts` (SIL OFL): DM Sans for text, Inter for
figures and for the rupee sign everywhere, Noto Sans Devanagari for Hindi,
Fraunces and Epilogue for the sign-in hero only. There is no font CDN.

## 3. Measurements

| Thing | Value |
|---|---|
| Every input, select, search, date field | 40 px (`h-10`), 8 px radius, `#E6E6E6` hairline, ink border on focus |
| Buttons | `md` 40 px, `sm` 28 px, `lg` 44 px, 14 px medium text |
| Filter chips | 32 px pills |
| Cards and panels | 12 px radius, hairline border, 16 px padding |
| Stat tiles | `UbStatCard` in `UbStatGrid`: up to five across, filling the row |
| Table header | 48 px, `#FAFAFA`, 12 px medium; rows 14 px regular |
| Page insets | 24 px sides on desktop, 16 px on phone |
| Field spacing | label 4 px above the control; 24 px between fields |

### Page header and actions (owner, 23 Sep 2026)

The page header is ONE row at every width: the title on the left, the actions
on the right. Actions pass `iconOnly="mobile"` (`UbButton`, `UbActionLink`), so
on a phone they are 32 px icon squares on the title's line. If even the icons
do not fit, they wrap BELOW the title starting at the left — never right-aligned
on a line of their own. A page's everyday pair (a khata's You gave / You got)
goes in `primaryActions`: beside the title from `sm` up, an equal-width
two-column row under the title on a phone.

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
| Status pill | `UbStatusBadge` |
| Money | `UbAmount` |
| Party picker source | `usePartySearch` (never a second debounced party fetch) |
| Toasts | dispatch to the snackbar; it renders top-centre |

When none of these fits, add the new component to `src/design-system`, add it
to this table in the same change, and write down which Figma node it follows.

## 5. What is deliberately not shown

A control for a feature that is not built is not rendered: no notification
bell until notifications exist, no "Forgot password?" until reset email has a
delivery provider, "Soon" rows in the sidebar only for modules on the roadmap.
