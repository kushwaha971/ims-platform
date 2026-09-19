# Part 23 — Design System: Koper × ml-uikit × Tailwind, tuned to a Zoho-like theme

## 23.1 Decision summary

UdhaarBook's UI is built from three layers, each with a fixed responsibility:

| Layer | Source | Responsibility |
|---|---|---|
| **Tokens & visual language** | **Koper Design System** (Akash's Claude Design project `2eec6fb1-…`) — its spacing scale, radius set, elevation model, motion tokens, typography roles, component principles and content rules | *What things look and behave like.* Koper's copper primary is **replaced** by a Zoho-style blue (§23.3) and the dark-first "ink" canvas is **inverted to a light-first theme** for a billing product used in bright shops on cheap phones; the dark set is kept as an optional theme. |
| **Primitives** | **`ml-uikit`** (`ML*` components, shadcn/Radix-based, Metis Labs) | *Accessible behaviour.* Dialogs, sheets, popovers, commands, selects, tables, forms, toasts, tabs, sidebar. Styled through CSS variables and Tailwind classes, never forked. |
| **App wrappers** | **`Ub*` components** in `src/design-system/` (BrandHub Customer Module pattern; same component template) | *Product patterns.* Data grid, page shell, stat tiles, dialogs with reason capture, line-item editor, party header, timeline, bottom nav. |

Tailwind CSS v3 is the utility layer that binds them: Koper tokens are exposed as CSS variables and mapped into `tailwind.config.js` (`colors`, `spacing`, `borderRadius`, `boxShadow`, `fontFamily`, `transitionDuration`, `transitionTimingFunction`), and the compound `ds-*` typography classes follow BrandHub's `typographyPlugin` approach with Koper's type roles.

Rules carried over verbatim from Koper (they suit a ledger product exactly): every number carries its baseline; one primary action per view; hairlines over boxes; progressive disclosure card → drawer → full view; motion clarifies, never entertains; nothing exceeds 360 ms except a first-paint data reveal; sentence case everywhere, with uppercase confined to the Latin-only `ds-label-caps` tier of §23.2.2 and never applied to a translated string; no emoji; errors are outlined, never filled red blocks; empty states name the gap and offer the one action that closes it.

## 23.2 Token reference (from Koper `tokens/*.css`, verbatim where unchanged)

### 23.2.1 Spacing, radius, layout (`tokens/spacing.css`)

```
--space-0:0 --space-1:4px --space-2:8px --space-3:12px --space-4:16px --space-5:20px --space-6:24px
--space-7:28px --space-8:32px --space-10:40px --space-12:48px --space-16:64px --space-20:80px
--radius-xs:4px --radius-sm:6px --radius-md:10px --radius-lg:14px --radius-xl:20px --radius-pill:999px
--radius-card:var(--radius-lg) --radius-control:var(--radius-md)
--sidebar-width:248px --sidebar-collapsed:64px --topbar-height:60px
--content-max:1440px --gutter:24px --page-pad:32px --grid-columns:12 --grid-gap:20px
```
UdhaarBook overrides for mobile: `--page-pad` 16px below `sm`, `--bottom-nav-h` 64px + `env(safe-area-inset-bottom)`, sidebar 248px only at ≥ 1280px, collapsed 64px between 1024–1279px, hidden below 1024px (drawer + bottom nav).

### 23.2.2 Typography (`tokens/typography.css`)

```
--font-display:"Clash Grotesk",…  --font-ui:"Clash Display",…  --font-mono:"IBM Plex Mono",…  --font-metric:var(--font-display)
--size-display:44px --size-h1:32px --size-h2:24px --size-h3:19px --size-h4:16px
--size-body:15px --size-body-sm:13.5px --size-caption:12.5px --size-label:12.5px --size-label-caps:11px --size-micro:10.5px
--size-metric-xl:52px --size-metric-lg:38px --size-metric-md:28px --size-metric-sm:20px
--leading-tight:1.05 --leading-snug:1.25 --leading-normal:1.5 --leading-relaxed:1.65
--track-display:-0.025em --track-heading:-0.015em --track-body:0 --track-label:0 --track-label-caps:0.09em --track-metric:-0.02em
--leading-label:1.4 --leading-label-hi:1.5 --size-label-hi:13px
--weight-regular:400 --weight-medium:500 --weight-semibold:600 --weight-bold:700
```
**Font decision for UdhaarBook.** Clash Grotesk/Clash Display are licensed brand files inside the Koper project; they do not cover Devanagari. UdhaarBook needs Hindi (and later Gujarati, Marathi, Tamil…) glyphs and a zero-dependency local setup, so the roles are kept and the faces are substituted: `--font-display` and `--font-ui` → **Inter** (variable, self-hosted via `next/font/local`, Latin + Devanagari subsets via **Noto Sans Devanagari** fallback in the same stack), `--font-mono` → **IBM Plex Mono** (self-hosted), `--font-metric` → Inter with `font-variant-numeric: tabular-nums`. This is also what makes the theme read "like Zoho" (Zoho's product UI is an Inter-class neutral grotesque). If a tenant licenses Clash, the tokens accept it without code change.

**Label tier decision (locale-aware).** Koper's single 11 px uppercase label role cannot carry this product's labels: Devanagari has no case, so `text-transform: uppercase` is a no-op on every Hindi string; `+0.09em` tracking breaks conjuncts and displaces matras; and 11 px is below the size at which a matra is legible on a 2 GB phone at counter distance. The role is therefore **split into two tiers**, and the default — the one every translated label uses — is the locale-safe one:

| Tier | Size / line-height / weight / tracking / case | Where it is used | Locale rule |
|---|---|---|---|
| **`ds-label`** (default) | **12.5 px / 1.4 / 600 / 0 em / sentence case** | Every label that can be translated: `UbField` labels, `UbDataGrid` column headers, `UbStatCard` labels, `UbStatusBadge` text, card micro-labels, timeline date headers, tag chips | `:lang(hi)` raises it to **13 px / 1.5** (`--size-label-hi` / `--leading-label-hi`); never uppercased, never tracked |
| **`ds-label-caps`** | 11 px / 1.25 / 600 / +0.09 em / UPPERCASE | Latin-only strings that are never translated: `ds-mono`-adjacent column keys in the internal gallery, the `(internal)` design-system route's own chrome, and the document-template field keys that print in English on an A4 invoice | Forbidden on any string that comes from `locales/*.json`; the lint rule in Part 25 §25.7 R-S-5 fails a `ds-label-caps` class in the same element as a `t(…)` call |

`ds-label` at 12.5 px / 600 is *not* WCAG large text, so every colour it is painted in must clear 4.5:1 — which is why `--text-muted` is re-toned in §23.2.4 rather than left at its Koper value.

Compound classes (Tailwind plugin, BrandHub `ds-*` convention, Koper roles):

| Class | Face | Size / line-height / weight / tracking | Use |
|---|---|---|---|
| `ds-display` | display | 44 / 1.05 / 500 / −0.025em | Marketing/auth hero only |
| `ds-h1` | display | 32 / 1.25 / 500 / −0.015em | Page title |
| `ds-h2` | display | 24 / 1.25 / 500 / −0.015em | Section title |
| `ds-h3` | display | 19 / 1.25 / 500 / −0.015em | Card title, dialog title |
| `ds-h4` | display | 16 / 1.5 / 600 | Sub-heading |
| `ds-body` | ui | 15 / 1.5 / 400 | Default text |
| `ds-body-sm` | ui | 13.5 / 1.5 / 400 | Text inside cards & tables |
| `ds-body-medium`, `ds-body-sm-medium` | ui | … / 500 | Labels of fields, list titles |
| `ds-caption` | ui | 12.5 / 1.5 / 400 | Helper text, timestamps |
| `ds-label` | ui | 12.5 / 1.4 / 600 / 0 (`:lang(hi)` 13 / 1.5) | Field labels, table headers, badges, card micro-labels — sentence case, translated |
| `ds-label-caps` | ui | 11 / 1.25 / 600 / +0.09em UPPERCASE | Latin-only, never-translated keys (§23.2.2) |
| `ds-metric-xl` … `ds-metric-sm` | metric (tabular) | 52 / 38 / 28 / 20, 600, −0.02em | KPI values, party balance |
| `ds-num` | metric (tabular) | inherits size, 500 | Every ₹ amount and quantity in tables/timelines |
| `ds-mono` | mono | 12.5 / 1.5 / 400 | Invoice numbers, UTRs, GSTINs, IDs |

Fluid `clamp()` sizing (BrandHub) is **not** used; Koper's fixed sizes plus responsive class switches (`ds-h2 md:ds-h1`) are simpler to reason about on a billing counter.

### 23.2.3 Elevation & motion (`tokens/elevation.css`, `tokens/motion.css`)

```
--shadow-0:none  --shadow-1:0 1px 2px rgba(0,0,0,.4)  --shadow-2:0 2px 8px rgba(0,0,0,.45)
--shadow-3:0 8px 24px rgba(0,0,0,.5)  --shadow-4:0 20px 48px rgba(0,0,0,.58)
--shadow-inset-top:inset 0 1px 0 rgba(255,255,255,.04)  --overlay-scrim:rgba(8,10,12,.72)  --blur-panel:saturate(140%) blur(18px)
--ease-standard:cubic-bezier(.2,0,.1,1) --ease-entrance:cubic-bezier(.16,1,.3,1) --ease-exit:cubic-bezier(.4,0,1,1)
--dur-instant:90ms --dur-fast:140ms --dur-base:220ms --dur-slow:360ms --dur-reveal:640ms
--transition-control:background-color var(--dur-fast) var(--ease-standard),border-color …,color …
@media (prefers-reduced-motion:reduce){ all --dur-*: 0ms }
```
Light-theme shadow alphas are reduced (`.08 / .10 / .14 / .18`) because on a white canvas Koper's black-40% shadows read as heavy; the dark theme keeps Koper's values. Motion tokens are used unchanged: hover 140 ms lift one plane + border shift; press 0.5 px translate at 90 ms; drawers slide 24 px at 220 ms; modals rise 10 px with 1.5% scale; skeleton shimmer, never a full-page spinner; a single 360–640 ms data reveal on first paint of charts.

### 23.2.4 Colour — Koper palette (reference) and UdhaarBook theme

Koper (verbatim, dark-first):

```
ink: 950 #080A0C · 900 #0B0E11 · 850 #11151A · 800 #161B21 · 750 #1B2128 · 700 #222932 · 600 #2C343E · 500 #3A434F · 400 #4E5865
slate: 400 #68737F · 300 #8A94A0 · 200 #AEB6C0 · 100 #D3D8DE · white #F4F6F8
copper: 50 #FBEFE6 · 100 #F3D7C1 · 200 #E9B892 · 300 #DE9A69 · 400 #D0813F · 500 #B96A2C · 600 #9A5522 · 700 #77401A · 800 #4B2810 · 900 #2A1608
teal: 100 #BFEDE4 · 200 #86DCCC · 300 #4EC6B2 · 400 #2BA694 · 500 #1E8375 · 600 #175F56 · 700 #0F3D38 · 800 #0A2724
success #2FAE72 (bright #43D18C, dim #123A29) · warning #D9942A (bright #F2B448, dim #3A2C0F) · error #DC4D5C (bright #F4707C, dim #3D161C) · info #4C8FDB (bright #6FB2F7, dim #12263D)
viz-1…8: #DE9A69 #4EC6B2 #6FB2F7 #C08BE0 #F2B448 #7FD168 #F4707C #8A94A0 · viz-unknown #3A434F · viz-forecast #68737F · viz-grid #1F262E · viz-axis #68737F
semantic aliases: --canvas ink-900 · --surface-sunken ink-850 · --surface-card ink-800 · --surface-raised ink-750 · --surface-hover ink-700 · --surface-active ink-600 · --border-hairline #1F262E · --border-subtle ink-700 · --border-strong ink-500 · --border-focus copper-300 · --text-primary white · --text-secondary slate-200 · --text-tertiary slate-300 · --text-muted slate-400 · --text-inverse ink-900 · --text-accent copper-300 · --accent copper-400 · --accent-hover copper-300 · --accent-press copper-500 · --accent-quiet rgba(208,129,63,.14) · --accent-line rgba(222,154,105,.34) · --focus-ring 0 0 0 2px var(--ink-900),0 0 0 4px var(--copper-400)
```

**UdhaarBook default theme ("Zoho-like").** Same token names, new values. The primary ramp is a Zoho-class blue (Zoho's product UI uses a saturated mid blue for actions and links on a white/very-light-grey canvas with a near-black slate for navigation). Values are authored, not sampled from Zoho assets, and validated for WCAG AA.

| Token | Light (default) | Dark (optional theme) | Notes |
|---|---|---|---|
| `--primary-50…900` | 50 #EEF4FF · 100 #D9E6FF · 200 #B3CCFF · 300 #80A8F5 · 400 #4D86EA · **500 #2B6BE0** · 600 #1F55BC · 700 #174197 · 800 #102D6B · 900 #0A1B42 | same ramp | `--accent = primary-500` (light) / `primary-400` (dark) |
| `--accent`, `--accent-hover`, `--accent-press` | primary-500 / 600 / 700 | primary-400 / 300 / 500 | Buttons, links, active nav edge, focus |
| `--accent-quiet` | rgba(43,107,224,.10) | rgba(77,134,234,.16) | Selected rows, active tab wash |
| `--accent-line` | rgba(43,107,224,.35) | rgba(128,168,245,.34) | Chart primary line |
| `--secondary-*` (teal, Koper) | unchanged | unchanged | Healthy/positive baselines, "You got" tint |
| `--canvas` | #F6F7F9 | ink-900 | Page background |
| `--surface-sunken` | #EEF0F3 | ink-850 | Inputs, table header wells |
| `--surface-card` | #FFFFFF | ink-800 | Cards |
| `--surface-raised` | #FFFFFF + shadow-2 | ink-750 | Popovers, drawers |
| `--surface-hover` | #F1F3F6 | ink-700 | Row hover |
| `--surface-active` | #E6EAF0 | ink-600 | Pressed |
| `--surface-nav` | **#1B2128 (ink-750)** | ink-950 | Desktop sidebar stays dark in both themes (Zoho-style dark rail) |
| `--border-hairline` | #E5E8EC | #1F262E | Default separator |
| `--border-subtle` | #D8DDE3 | ink-700 | Controls |
| `--border-strong` | **#7E8794** | ink-500 | Findable controls. Was #AEB6C0 — 1.91:1 against the canvas, below the 3:1 that WCAG 1.4.11 requires of a control boundary that identifies the control |
| `--border-focus` | primary-500 | primary-300 | |
| `--text-primary` | #14181D | #F4F6F8 | |
| `--text-secondary` | #3A434F | #AEB6C0 | |
| `--text-tertiary` | **#5F6975** | #8A94A0 | Was #68737F (4.51:1 on canvas, 4.23:1 on `--surface-sunken`); re-toned to clear 4.5:1 on every light surface |
| `--text-muted` | **#646E7A** | **#8A94A0** | Was #8A94A0 — **2.87:1 on canvas, a plain AA failure** wherever it carried text. Re-toned to 4.83:1. The smallest tier of real text (request ids, `ds-caption` metadata, `ds-label`); never a decorative grey |
| `--text-inverse` | #FFFFFF | ink-900 | On accent fills |
| `--text-accent` | primary-600 | primary-300 | Links |
| `--success` / `-bright` / `-dim` | **#12734A** / #2FAE72 / **#E8F6EF** | #43D18C / #2FAE72 / #123A29 | Ledger **credit**: "You got", payment received, paid, in stock. Was #1E9E62 — 3.43:1, an AA failure at the 13.5 px it is used at. `-bright` is a **fill/icon** value only, never text on a light surface |
| `--warning` / `-bright` / `-dim` | **#8F5A0B** / #D9942A / #FDF3E1 | #F2B448 / #D9942A / #3A2C0F | Due soon, low stock, "saving…" / queued states. Was #B97612 — 3.71:1, an undetected AA failure |
| `--error` / `-bright` / `-dim` | **#C0392B** / #DC4D5C / **#FDEEEC** | #F58C7A / #DC4D5C / #3D161C | **Ledger debit only**: "You gave", receivable, overdue, out of stock. Re-toned from #C8353F (4.45:1 inside its own `-dim` chip) and shifted from hue 356° to hue 6° to separate it from `--form-error` |
| `--form-error` / `-bright` / `-dim` | **#A3123E** / #C4275C / **#FCE9F0** | #F776A6 / #C4275C / #3B0F22 | **Validation and system errors only** — field messages, error banners, the destructive-action outline, the failed-write chip. Hue 342°, 24° and 11 % lightness from the receivable red |
| `--info` / `-bright` / `-dim` | #1F55BC / #4C8FDB / #E8F0FD | #6FB2F7 / #4C8FDB / #12263D | Neutral status. `--info` as **text** is primary-600, not primary-500 (4.30:1 on `--surface-sunken`) |
| `--viz-1…8` | primary-500, teal-400, #C08BE0, #D9942A, #7FD168, #DC4D5C, #6FB2F7, #8A94A0 (decorative fills; series are also distinguished by a direct label, never by hue alone) | Koper order | Charts |
| `--focus-ring` | `0 0 0 2px var(--surface-card), 0 0 0 4px var(--accent)` | idem with canvas | Never removed |

Ledger colour semantics (fixed, per research §C.4 and canon): **"You gave" / receivable / debit → `--error` family (red)**, **"You got" / payment / credit → `--success` family (green)**. The primary blue is reserved for actions and navigation so red/green stay unambiguous.

**The two red families, and why there are two.** Until this amendment `--error` carried four unrelated meanings at once — a healthy receivable, an overdue balance, an out-of-stock item, and every validation and system failure. In the `LED-01` drawer that put "this is money owed to you" and "you have made a mistake" in the same red six centimetres apart, and a row that is *both* overdue *and* in error had no distinguishable rendering at all. The families are now separate, and the separation is carried by role, hue and treatment together:

| | `--error` (ledger debit / receivable) | `--form-error` (validation & system) |
|---|---|---|
| Hue / value | 6° · #C0392B | 342° · #A3123E |
| Applied to | Amount **text**, the "You will get" label, the drawer's top accent bar, the overdue chip, the out-of-stock badge | Field error message and its 1 px input border, error banner outline and icon, the destructive-action outline, the "Not saved" chip |
| Never applied to | A field border, a banner, a whole row's background | An amount, a balance, a party row, any ledger figure |
| Fill allowed | No — red text and 1 px accents only | No — outlined block with an icon (§23.5), never a filled red block |
| Accompanying text | Mandatory: "You gave" / "You will get" / "Overdue" | Mandatory: the message itself, prefixed by an `AlertCircle` icon |

An overdue row that also fails validation therefore reads as a red *amount* (hue 6°) inside a magenta-outlined *block* (hue 342°) carrying an icon and a sentence — distinguishable by shape and by text even for a viewer who sees neither hue.

**The colour-plus-text rule, restated normatively** (NFR-25, P4, canon §0.2; enforced by Part 25 R-A-2):

1. Colour never carries meaning alone — anywhere, including charts, chips, badges, timeline rows and stat tiles.
2. Every ledger amount is rendered by `UbAmount` (§23.2.6) and carries **both** a sign and a text label. The label may be visually hidden when the row's own text already states the direction, but it is always in the accessible name.
3. A status is a `UbStatusBadge` with a word in it, never a coloured dot alone. A coloured dot may *accompany* a word (category rows in the cashbook) but never replace it.
4. An error is an outlined block with an icon and a sentence. A red border with no text is not an error state.
5. Roughly 8 % of Indian men have a red–green deficiency and the timeline is the screen they look at most; any pattern that fails when the page is rendered in greyscale fails review.

**Full semantic mapping.** Every meaning in the product, and the single token that expresses it:

| Meaning | Token | Rendering |
|---|---|---|
| "You gave" / debit entry / receivable balance | `--error` | `UbAmount` `tone="receivable"`, sign `−`, label "You gave" / "You will get" |
| "You got" / credit entry / payable balance | `--success` | `UbAmount` `tone="payable"`, sign `+`, label "You got" / "You will give" |
| Settled / zero balance | `--text-primary` | `UbAmount` `tone="neutral"`, no sign, label "Settled" |
| Overdue, out of stock, credit limit crossed | `--error` (text and 1 px chip border) | Badge or chip with the word |
| Due soon, low stock, partially paid | `--warning` | Badge with the word |
| Paid, in stock, matched, synced | `--success` | Badge with the word |
| Draft, neutral status, informational banner | `--info` | Badge or banner with the word |
| Field validation error, error banner, failed request | `--form-error` | Outlined block + icon + message (§23.5) |
| Destructive action (void, delete, write off, reverse) | `--form-error` | **Outlined** danger button — never a filled red block |
| Unsaved / queued / retrying write (§19.10.3) | `--warning` | Chip "Waiting for signal" + the `CloudOff` icon |
| Money out in the cashbook (expense, payment out) | `--text-primary` | `UbAmount` `tone="neutral"`, sign `−` |
| Money in the cashbook (receipt, payment in) | `--success` | `UbAmount` `tone="payable"`, sign `+` |

White-label tenants may override `--primary-*` only, so none of the above can be re-pointed by a partner theme.

White-label mechanism (Part 24): tenants may override only `--primary-*` (derived from one hex via HSL ramps, as BrandHub's `DSThemeProvider` does), logo, and document header/footer. Surfaces, semantic colours and typography are not tenant-configurable, which keeps red/green ledger semantics and contrast guarantees intact.

### 23.2.5 Tailwind mapping

`tailwind.config.js` exposes tokens as `colors.primary.{50..900}`, `colors.accent`, `colors.canvas`, `colors.surface.{sunken,card,raised,hover,active,nav}`, `colors.border.{hairline,subtle,strong,focus}`, `colors.text.{primary,secondary,tertiary,muted,inverse,accent}`, `colors.{success,warning,error,formError,info}.{DEFAULT,bright,dim}`, `spacing` from `--space-*`, `borderRadius.{xs,sm,md,lg,xl,pill,card,control}`, `boxShadow.{1,2,3,4,inset-top}`, `transitionDuration.{instant,fast,base,slow,reveal}`, `transitionTimingFunction.{standard,entrance,exit}`, `fontFamily.{display,ui,mono}`. All colour values are `hsl(var(--x) / <alpha-value>)` so runtime theming works. Dark theme via `data-theme="dark"` on `<html>` (class strategy), respecting `prefers-color-scheme` by default.

ml-uikit reads shadcn variable names (`--primary`, `--primary-foreground`, `--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`); `tokens/base.css` **aliases** each of these to the Koper-named tokens above so `ML*` components are themed with zero overrides (e.g. `--primary: var(--primary-500-hsl); --card: var(--surface-card-hsl); --radius: var(--radius-md)`). Unlike BrandHub there is no MUI on the page, so the `scope:ml-uikit` CSS-prefixing script, `important: '.customer-scope'` and the disabled-preflight workaround are **not** used; ml-uikit's stylesheet is imported once in `app/globals.css`.

### 23.2.6 Signed amounts — the `UbAmount` contract

Every rupee figure in the product is rendered by `UbAmount` and by nothing else. Its contract is normative here because four chapters render amounts and, until this amendment, each described the rendering differently. The implementation is Part 25 R-C-2; the props are Part 19 §19.1.2.

**The sign means direction of money or goods relative to the merchant, and it is only used on movements.**

| Case | Sign | Tone / colour | Text label (mandatory) | Example |
|---|---|---|---|---|
| Debit entry — "You gave" | `−` (U+2212) | `receivable` → `--error` | "You gave" | `−₹500.00` |
| Credit entry — "You got" | `+` (U+002B) | `payable` → `--success` | "You got" | `+₹300.00` |
| Money out (expense, payment out, stock outbound) | `−` | `neutral` → `--text-primary`, or `receivable` where the feature is a ledger view | "Paid" / "Out" | `−₹1,200.00` |
| Money in (receipt, payment in, stock inbound) | `+` | `payable` → `--success` | "Received" / "In" | `+₹1,200.00` |
| **Balance** (party header, statement closing, aging bucket, KPI tile) | **none** | `receivable` when they owe the merchant, `payable` when the merchant owes them | "You will get" / "You will give" | `₹2,800.00` |
| Zero | none | `neutral`, forced — a zero is never red or green | "Settled" | `₹0.00` |
| Absent value (`null`) | none | `neutral` | the field's own empty label | `—` |

Rules that follow from the table, each of them testable:

1. **Sign position is before the currency symbol**, inside the same element, with `white-space: nowrap`: `−₹1,23,456.50`, never `₹−1,23,456.50` and never `(₹1,23,456.50)`. The glyph is U+2212 MINUS SIGN, not a hyphen, so it aligns with the tabular figures of `ds-num`.
2. **The sign never carries meaning alone and never replaces the label.** A sign is shown only where a label is also present — visible beside the amount, or visually hidden (`sr-only`) when the row's own text already states the direction, as in a `UbTimeline` row whose primary line is the merchant's note.
3. **A balance is never signed.** Its direction is the label's job, because a negative balance is a concept the merchant does not have; they have "you will get" and "you will give".
4. **Zero is neutral.** `₹0.00` renders in `--text-primary` with the label "Settled" whatever tone the caller passed. A settled party is not a red party.
5. **Grouping is Indian (2,2,3), always two decimals for money**, via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })`. The formatter locale is `en-IN` in **both** UI locales (Part 19 §19.11.5): `hi-IN` produces the same grouping, and pinning it removes a class of locale-dependent rendering bugs.
6. **Devanagari case.** Numerals stay Latin in Hindi (`1,23,456.50`, never `१,२३,४५६.५०`) — this is what every Indian billing app and every printed invoice does. The amount element carries `lang="en-IN"` and `dir="ltr"` so a Hindi sentence around it cannot reorder the sign, the symbol and the digits. The *label* is translated normally and takes `ds-label` at its `:lang(hi)` size (§23.2.2). Hindi labels run 15–25 % longer, so an amount and its label never share a fixed-width container; the label wraps to a second line rather than truncating.
7. **Tabular alignment.** `ds-num` (`font-variant-numeric: tabular-nums`) is mandatory, and the sign renders in a fixed `0.6em` inline-block slot so that signed and unsigned rows in the same column keep their decimal points on one vertical line.
8. **Accessible name.** The visible sign and symbol are `aria-hidden`; the element exposes one accessible string built as `` `${label}, ${formattedMagnitude}` `` — "You gave, ₹500.00" / "उधार दिया, ₹500.00". The sign word is never spoken, because the label already states the direction and "minus five hundred rupees" is not how the number is read in the shop. `label` is therefore **required whenever a sign is rendered or `tone !== 'neutral'`**, enforced by the discriminated props union in Part 25 R-C-2 and by a component test per §23.4.

## 23.3 Component decision matrix

For every UI component the spec requires, the table states whether it exists in `ml-uikit`, is extended via a `Ub*` wrapper, is a new shared component, or stays feature-specific. Koper's component of the same role is noted so its guidelines apply.

| Component | ml-uikit primitive | Decision | Koper guideline applied |
|---|---|---|---|
| Button | `MLButton` (cva variants) | **Use as-is**; map variants: `primary` (accent fill), `secondary` (bordered surface), `ghost`, `destructive` → **outlined** danger in `--form-error`; sizes sm 30 / md 36 / lg 44 | One primary per view; danger outlined |
| Icon button | `MLIconButton` | Use as-is | 17–18 px glyph |
| Icons | — (lucide-react) | Use `lucide-react` directly; `UbIcon` thin wrapper only for size tokens | Outline 2 px, no emoji |
| Input / Textarea | `MLInput`, `MLTextarea`, `MLInputGroup*` | Use; `UbField` composes label (`ds-label`, 12.5 px sentence case), control, hint, error (`--form-error`) | Recessed well on sunken surface; copper→blue focus ring |
| Amount (display) | — | **New shared `UbAmount`** — the only component that renders a rupee figure; sign, tone, label and accessible name per §23.2.6 | Numbers tabular; colour never alone |
| Money / quantity / percent input | `MLInputGroup` | **New shared `UbMoneyInput`, `UbQuantityInput`, `UbPercentInput`** (decimal-safe, en-IN display, ₹/unit/% addon) | Numbers tabular, right-aligned |
| Select | `MLSelect*` | Use for ≤ 12 static options | |
| Combobox / async search | `MLCommand*` + `MLPopover`, `MLSearchableDropdown*` | **Extend → `UbCombobox`, `UbAsyncCombobox`** (server search, create-inline, barcode paste) | Filters visible as removable tags |
| Date picker / range | `MLCalendar`, `MLDateRangePicker`, `MLPopover` | **Extend → `UbDateInput`, `UbDateRangePicker`** (quick chips, dd/mm/yyyy, FY presets) | |
| Phone input | `MLPhoneInput` | Use; `UbPhoneInput` fixes +91 default and 10-digit rule | |
| Checkbox / Switch / Radio | `MLCheckbox`, `MLSwitch`, `MLRadioGroup` | Use as-is | |
| Segmented control | `MLToggleGroup` | Use (Koper `SegmentedControl` role) | Range/view switching |
| Form | `MLForm*`, `MLField*` + react-hook-form | Use; `UbForm` binds RHF + Yup resolver + snackbar errors | |
| Dialog / Alert dialog | `MLDialog*`, `MLAlertDialog*` | **Extend → `UbDialog`, `UbConfirmDialog`, `UbReasonDialog`** (single-open policy `useExclusiveModal`, body `max-h-[70vh] overflow-y-auto`, radius xl) | Modals rare; rise 10 px |
| Drawer / Sheet | `MLSheet*`, `MLDrawer*` | **Extend → `UbDrawer`** (right on desktop, bottom on mobile) | Drawers common; 24 px slide |
| Dropdown / context menu | `MLDropdownMenu*` | Use as-is | |
| Tooltip / hover card | `MLTooltip*`, `MLHoverCard*` | Use; `UbHelpHint` composes "?" | |
| Tabs | `MLTabs*` | **Extend → `UbTabs`** (counts, URL-synced) | Underline only |
| Breadcrumbs | `MLBreadcrumb*` | Use as-is inside `UbPageHeader` | |
| Table | `MLTable*`, `MLTablePagination*` | **Extend → `UbDataGrid`** (TanStack Table v8; BrandHub `BrandHubDataGrid` port) | Uppercase micro-headers, hairlines, right-aligned numbers, row opens drawer, density control |
| Pagination | `MLTablePagination*` | Used by `UbDataGrid` | |
| Card | `MLCard*` | Use; `UbCard` only adds Koper card padding/radius defaults | One idea per card, 14 px radius, 20 px padding |
| Stat / KPI tile | `MLCard` | **New shared `UbStatCard`** (Koper `MetricTile`: label → metric → delta → baseline) | Never a naked number |
| Badge / status | `MLBadge` | **Extend → `UbStatusBadge`** (tone map) | Sentence-case pills (`ds-label`) carrying state, never counts |
| Tag (removable filter) | `MLBadge` + `MLButton` | **New shared `UbFilterTag`** | Applied scope visible |
| Alert / banner | `MLAlert*` | Use; `UbStatusBanner` for page-level notices | |
| Toast / snackbar | `MLToaster` (sonner) | **Extend → `UbSnackbar`** driven by `snackbarSlice` (single channel) | "What happened, and the move it enables" |
| Skeleton | `MLSkeleton` | Use; `UbSkeleton` presets for list/card/form | Shimmer in the shape of content |
| Spinner | `MLSpinner` | Use only inside buttons | Never full-page |
| Empty state | `MLEmpty*` | **Extend → `UbEmptyState`** (first-use / filtered / error variants) | Absence is a finding |
| Progress | `MLProgress` | Use; pace marker variant for credit-limit usage | Progress paired with pace |
| Avatar | `MLAvatar*` | Use for party initials | |
| Sidebar / nav | `MLSidebar*` | **Extend → `UbSidebar`** (entitlement-driven config, dark rail, collapse to 64 px) | Three groups, one level, active = accent edge + raised surface |
| Top bar / page header | — | **New shared `UbPageHeader`** (title, breadcrumb, scope controls, actions) | 60 px sticky |
| Bottom nav / FAB | `MLButton` | **New shared `UbBottomNav`, `UbFab`** (mobile) | — (Koper is desktop-only; UdhaarBook adds this) |
| File upload / preview | `react-dropzone` + `MLCard` | **New shared `UbFileUpload`, `UbImagePreview`** | |
| Search input | `MLInputGroup` | **New shared `UbSearchInput`** (debounce 300 ms) | |
| Line-items editor | `MLTable*` + inputs | **New shared `UbLineItemsEditor`** | Keyboard-first counter |
| Totals panel | `MLCard` | **New shared `UbTotalsPanel`** | Every number with its baseline |
| Party header | `MLCard`, `MLAvatar` | **New shared `UbPartyHeader`** | |
| Timeline | `MLItem*` | **New shared `UbTimeline`** | |
| QR code | inline SVG | **New shared `UbQrCode`** (tiny local generator, no external service) | |
| Charts | `MLChart*` (recharts) | Use ml-uikit chart wrappers with `--viz-*`; `UbSparkline` for tiles | Plot loudest; axes recede |
| Command palette | `MLCommand*` | Phase 2 (`UbCommandPalette`: search parties/items/bills) | |
| Feature-specific | — | Invoice PDF preview, GST breakup table, aging bucket bar, reminder composer — live inside their feature folders, built from the above; promoted to `Ub*` only when reused by a second feature | |

## 23.4 Component template (exact BrandHub Customer convention)

```tsx
'use client';
import { memo } from 'react';
import { cn } from 'src/utils/cn';
import { MLCard, MLCardContent } from 'ml-uikit';

export type UbStatCardTone = 'default' | 'success' | 'warning' | 'danger';

export interface UbStatCardProps {
  readonly label: string;               // ds-label, 12.5px sentence case (§23.2.2)
  readonly value: string;               // preformatted ₹ / count
  readonly delta?: { readonly value: string; readonly direction: 'up' | 'down' | 'flat'; readonly baseline: string };
  readonly tone?: UbStatCardTone;
  readonly onClick?: () => void;
  readonly className?: string;          // always last, merged with cn()
}

function UbStatCardBase({ label, value, delta, tone = 'default', onClick, className }: Readonly<UbStatCardProps>) { /* … */ }
UbStatCardBase.displayName = 'UbStatCard';
export const UbStatCard = memo(UbStatCardBase);
```

Rules (from `src/modules/Customer/design-system`): `readonly` props; named exports; `memo` + `displayName`; `className` last; barrel export from `src/design-system/index.ts`; icons only from `lucide-react`; no inline hex colours — tokens/Tailwind classes only; every component has a `*.stories.tsx`? **No** — Storybook is not added (minimal-dependency rule); instead each `Ub*` component has a `*.test.tsx` (Jest + RTL) covering render, states and a11y roles, and a live gallery route `app/(internal)/design-system/page.tsx` renders all wrappers in all states for visual review.

## 23.5 Interaction states (every interactive component)

| State | Treatment |
|---|---|
| Default | Surface per plane; hairline border |
| Hover | One plane lighter + border shift, 140 ms; interactive cards translate −1 px |
| Focus-visible | `--focus-ring` (2 px gap + 2 px accent); never removed |
| Active/press | 0.5 px translate down, one shade darker, 90 ms |
| Selected | `--accent-quiet` background + accent edge |
| Disabled | 45% opacity, `cursor-not-allowed`, no hover |
| Loading | Skeleton in place; buttons show `MLSpinner` + label "Saving…" |
| Error | `--form-error` 1 px border + an `AlertCircle` icon + `ds-caption` message beneath, both in `--form-error`; never a filled red block, never shake, never the receivable red (§23.2.4) |
| Read-only | Sunken surface, no border change on hover |

## 23.6 Accessibility & localisation baseline

**WCAG 2.2 AA, measured rather than asserted.** The table below is the computed contrast ratio of every token pairing the product actually renders, against the four light surfaces text lands on. The smallest type this product paints a semantic colour in is `ds-body-sm` at **13.5 px / 400** (`UbTimeline` rows, `UbDataGrid` cells) and `ds-label` at **12.5 px / 600**; neither is WCAG large text (which starts at 18.66 px regular or 14 px bold), so **every pairing below must clear 4.5:1** and none of them may lean on a size exception. Ratios are sRGB relative luminance per WCAG 2.2, rounded down to two decimals.

| Foreground | Value | on `--surface-card` #FFFFFF | on `--canvas` #F6F7F9 | on `--surface-sunken` #EEF0F3 | on `--surface-hover` #F1F3F6 | Verdict |
|---|---|---|---|---|---|---|
| `--text-primary` | #14181D | 17.82 | 16.63 | 15.61 | 16.03 | Pass |
| `--text-secondary` | #3A434F | 10.02 | 9.35 | 8.78 | 9.01 | Pass |
| `--text-tertiary` | #5F6975 | 5.58 | 5.20 | 4.89 | 5.02 | Pass (was #68737F → 4.23 on sunken, **fail**) |
| `--text-muted` | #646E7A | 5.18 | 4.83 | 4.54 | 4.66 | Pass (was #8A94A0 → 2.87 on canvas, **fail**) |
| `--text-accent` / `--info` | #1F55BC | 6.81 | 6.35 | 5.96 | 6.13 | Pass |
| `--accent` (primary-500) | #2B6BE0 | 4.90 | 4.57 | 4.30 | 4.41 | Pass as a **fill, border and focus ring**; **fails on `--surface-sunken`** as text, which is why link and small text use `--text-accent` |
| `--success` | #12734A | 5.87 | 5.48 | 5.14 | 5.28 | Pass (was #1E9E62 → 3.43 on white, **fail**; §23.6 previously recorded this as 3.9 and permitted a size exception that `UbTimeline` never met) |
| `--warning` | #8F5A0B | 5.78 | 5.39 | 5.06 | 5.20 | Pass (was #B97612 → 3.71 on white, **fail**, previously unrecorded) |
| `--error` (receivable) | #C0392B | 5.44 | 5.07 | 4.76 | 4.89 | Pass (was #C8353F → 4.45 inside its own `--error-dim` chip, **fail**) |
| `--form-error` | #A3123E | 7.74 | 7.22 | 6.78 | 6.96 | Pass (new token, §23.2.4) |

Tinted blocks and fills, same method:

| Pairing | Ratio | Verdict |
|---|---|---|
| `--success` on `--success-dim` #E8F6EF | 5.27 | Pass |
| `--warning` on `--warning-dim` #FDF3E1 | 5.25 | Pass |
| `--error` on `--error-dim` #FDEEEC | 4.82 | Pass |
| `--form-error` on `--form-error-dim` #FCE9F0 | 6.65 | Pass |
| `--info` on `--info-dim` #E8F0FD | 5.94 | Pass |
| `--text-inverse` #FFFFFF on `--accent` #2B6BE0 | 4.90 | Pass |
| `--text-inverse` on `--success` / `--error` / `--form-error` fills | 5.87 / 5.44 / 7.74 | Pass |
| `--text-primary` dark #F4F6F8 on `--surface-nav` #1B2128 | 14.97 | Pass |
| Dark theme: `--success-bright` #43D18C / `--error` #F58C7A / `--form-error` #F776A6 / `--warning-bright` #F2B448 on ink-800 | 8.85 / 7.35 / 6.68 / 9.40 | Pass |
| Dark theme: `--text-muted` #8A94A0 on ink-800 | 5.63 | Pass (Koper's #68737F was 3.58, **fail**) |

Non-text contrast (WCAG 1.4.11, 3:1): `--border-strong` #7E8794 on canvas 3.39 — pass, after the re-tone recorded in §23.2.4. `--border-hairline` and `--border-subtle` are **decorative separators** at 1.3–1.5:1 and are permitted only where the control is identified by its own sunken fill or by its label; an input whose only boundary is a hairline is a defect. The focus ring is `--accent` at 4.57:1 against the canvas with a 2 px offset in the surface colour, which satisfies 1.4.11 on every surface.

**`scripts/check-contrast.mjs`** (deliverable 3 of §23.7) is the mechanism that keeps this table true: it parses `tokens/*.css`, recomputes every pairing above from the token values rather than from this document, and fails CI with error code `low_contrast` when any pairing falls below its floor (4.5 for text pairings, 3.0 for the non-text ones). Adding a semantic colour token without adding it to the script's pairing list is also a failure. The table above is generated by running it with `--print`, so a re-tone updates the chapter and the gate in one step.

**Everything else in the baseline.** Touch targets ≥ 44 × 44 px on mobile. All `ML*` primitives are Radix-based (keyboard, focus trap, ARIA). Colour is never the sole carrier of meaning — the five rules of §23.2.4 are the normative statement and Part 25 R-A-2 is the review check. Devanagari fallback fonts load with `font-display: swap`; minimum line-height 1.5 wherever text may be Hindi, and the `ds-label` tier of §23.2.2 exists so no translated label renders below 12.5 px or with tracking. Number and date formatting goes through the shared formatters of Part 19 §19.11.5 (`en-IN` in both locales); RTL is not required. `axe-core` runs with zero critical violations on every screen (NFR-25), and the contrast script exists because axe alone cannot see a token that is only used in a state the test did not reach.

## 23.7 Deliverables of the design-system workstream (Sprint 1–2)

1. `tokens/` CSS (light + dark) with shadcn alias layer; `tailwind.config.js` mapping; `ds-*` typography plugin.
2. `src/design-system/` with the `Ub*` set marked **Extend/New** above (MVP subset first: PageShell/Header, DataGrid, Tabs, StatCard, Dialog/Confirm/Reason, Drawer, Field/Money/Date/Phone inputs, Combobox/AsyncCombobox, StatusBadge, EmptyState, Snackbar, Skeleton, BottomNav/Fab, Sidebar, LineItemsEditor, TotalsPanel, PartyHeader, Timeline, QrCode, ShareSheet).
3. Internal gallery route; Jest/RTL tests; contrast check script (`scripts/check-contrast.mjs`) run in CI.
4. Document templates (invoice A4, 80 mm thermal, statement, receipt) as React print components sharing the same tokens.
