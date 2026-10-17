# Theme migration and readiness verification — 17 October 2026

This reviews local `dev` based on `ba10db624c7dedfca01c4e47a9e3d590aee757b6`,
with the uncommitted theme changes listed below. It is an implementer's candid
assessment of the inspected scope, not independent release sign-off or a market
ranking. No Railway deployment, real message or real phone-contact access was
performed. Older local work remains in the named recovery stash; it was not
applied over the newer pulled implementation.

## What changed

The owner's current brief is **colors and fonts only**. Layouts, spacing,
component structure, routing, API contracts, fetching and financial behavior
were preserved. A source AST comparison checked the changed TSX component tags
and behavior attributes; none changed. The only backend edit is the inherited
product branding hex, so default businesses agree with the frontend palette.
Custom tenant/partner branding remains authoritative.

- One Next font owner: Plus Jakarta Sans Latin variable and Mukta Devanagari/
  Latin 400–700, `display: swap`, CSS-variable stack. Next self-hosts the assets.
  Mukta is not preloaded for an English-only visit. Old runtime font loaders,
  WOFF2 files and the rupee override were removed.
- Existing `ds-*` roles and shared page headers map to rem/clamp typography.
  Money uses tabular figures. Technical monospace and fixed print dimensions
  remain intentional; the outlined K artwork was not redesigned.
- Peacock teal identity, warm light canvas, white cards, marigold primary
  buttons with dark ink. Receivable/payable amounts use semantic green/red.
  Dark mode keeps distinct surface depth and readable muted text.
- Shadcn hover `accent` remains a wash. Filled controls/charts use `action`;
  primary buttons use `cta`. The vendored ml-uikit was not forked. The shared
  class merger now knows the semantic font sizes, so a font class cannot erase
  a button's foreground color. Its fail-before test is retained.
- Active SVG marks, generated icons, OG preview, manifest and viewport color
  agree. Remaining auth illustration fills/strokes use tokens; geometry is
  unchanged. OG is a real 1200 × 630 PNG.

### Necessary palette corrections

The supplied brighter dark teal cannot support white normal text at 4.5:1;
solid white-on-teal buttons/marks keep `#0E7C86`. Light tertiary text uses
`#656D78`; dark muted/tertiary uses `#A3A9B2`; light teal text uses the darker
700 shade. Dark red uses `#FF8279` where the supplied red failed on hover
surfaces. The source sheets remain HSL triplets to preserve alpha utilities
and existing white-label generation. These are contrast corrections, not new
business/status meanings.

### Intentional exceptions

Historical concept SVGs and old marketing/demo rasters remain historical;
repainting embedded screenshots would be a separate content task. Old OFL
license text is retained as legal history, with no runtime font dependency.
The static logo's outlined K/lockup preserves its original geometry. Official
social-brand colors are named tokens. Configurable branding hex inputs and
custom-color test fixtures remain literal data. Print documents stay dark ink
on white paper in either theme. Fixed-resolution brand-renderer artwork uses
its existing pixel typography; runtime application font sizes use rem/clamp.
No dependency or bundle budget was added/raised.

## Verification evidence

Isolated database: `yourkhata_theme_review_20261017`; independent test database:
`test_yourkhata_theme_review_20261017`. No existing database was cleared. The
synthetic Shop has separate customer/supplier and dual-role people, a GST5
stock item and a GST18-inclusive item. Providers are disabled locally.

- Backend inventory, sales, purchases, payments, parties, reports, branding
  and architecture: **1,286 passed, 3 skipped**. Six Django converter
  deprecation warnings remain; skipped cases are not certified here.
- Full frontend regression: **4,270 passed in 379 suites**. Existing React
  act/network console noise and the open-handle warning are recorded rather
  than suppressed. Final targeted heading/auth/print/SEO/dark checks: 97 passed.
- TypeScript and full-repository ESLint pass. A final changed-file ESLint
  pass also covered all 65 changed source/config files. Locale gate passes: **6,386 English/Hindi keys in 54
  catalogues**; existing unused/shell-catalogue advisory lines remain.
- Contrast gate passes **174 pairings**; 1,323 source files are free of
  forbidden bright-text tokens. This certifies the tested token pairings,
  not every possible tenant-custom palette or decorative image pixel.
- Production Next build passes with same-origin local API and analytics off.
- Bundle gate does **not** pass: three inherited first-load thresholds are
  exceeded by less than 0.05 KB each (rounded output prints 0 KB). Measured
  unmodified dev in a separate temporary checkout with the same environment:
  `/library/copies/[copyId]` 311.8 → 311.7 KB; `/lending/loans` 310.9 → 310.8;
  `/library/catalogue/[titleId]` 308.9 → 308.8. Baseline itself had eight
  violations. Framework remains 127.3/128 KB and shared app 111.8/112 KB.
  Budgets are unchanged; this is a pre-existing gate limitation, not a green
  release claim. Font downloads are separate from this JS-only budget.

### Browser checks

The production standalone app was exercised through the permitted in-app
browser, not a mocked component screenshot. Widths: **320, 375, 390, 430, 768,
1280**. Captures and DOM measurements live in the chat's
`outputs/theme-review/` directory (no credentials). Dashboard English/dark and
Hindi/light, item drawer, invoice English/light+dark and Hindi/dark width sweeps
showed no document-wide horizontal overflow. Desktop/light and mobile/Hindi/
dark screenshots were visually inspected; this is not a claim that every
screen was inspected in every possible combination.

Live checks:
- Computed font stack is Jakarta/Mukta; primary CTA is `rgb(245,158,27)` with
  `rgb(27,30,36)` text; dark canvas/text are `#121417` / `#ECEEF0`.
- Cost 80 + margin 20% → selling 100; manual selling 125 → margin 36%.
  Cancelling does not create an item. Inclusive selling 59, GST18, cost40
  correctly reads 20% after excluding GST.
- Item search shows usual selling price, cost and margin. Choosing rice
  fills invoice rate450. Invoice-specific rate400 + discount10% + GST5 gives
  total378 (taxable360, CGST9, SGST9); item master stays450 and the earlier
  issued bill retains rate450/total945. Only a synthetic autosaved draft was
  created by the existing editor.
- Customer and Supplier routes and add labels remain separate, with correct
  default role switches. Their drawers and the Items filter fit mobile.
  Unsupported desktop contact picker is absent; real contacts were not read.
- Invoice share opens an editable Message field. Changing it updates the
  WhatsApp link's encoded text. The composer was cancelled, no handoff/send.
  Customer Document preview contains no cost/profit/margin terms. Backend
  tests cover the public-document privacy boundary and immutable snapshots.

**Not certified:** actual 125% browser zoom (not exposed successfully by the
available browser control), physical Android/iPhone, software keyboard, native
contact picker, printer, provider delivery or production/staging behavior.
Viewport resizing is not passed off as browser zoom. At 320px Hindi the fixed
invoice dock still truncates the money figure; see the open finding below.

## Brutal feedback: confirmed gaps

| ID | Severity | Evidence and user impact | Required next action |
|---|---|---|---|
| TV-01 | High, release blocker against approved policy | D-03 was already answered by the owner: separate balances, explicit settlement. A dual-role person has an unpaid customer bill1000 and supplier bill600, with no settlement. `shop_balance` is400; dashboard To collect includes400, To pay omits600 and says “You paid suppliers400 ahead”. This invents an advance description and does not satisfy the chosen policy. | Design/implement separate role balances and explicit settlements with historical reconciliation, permissions and fail-before tests. Do not merely relabel the net total. |
| TV-02 | High, customer collection gap | Dashboard Remind for Anita, Shop due445 and Udhaar balance0, opens “Couldn't prepare the message” / “Nothing is due”. `DashboardLists.TopDebtorsList` uses `usePartyReminder`; server `trade_balance` intentionally reads Udhaar `party.balance`. | Give the Shop action the correct Shop/source context. Preserve Udhaar isolation and final edited-text logging; test Shop-only, Udhaar-only, both, settled and stale balances. |
| TV-03 | Medium, mobile clarity | At320px Hindi, rate400/discount10/GST5 yields378 but the existing fixed total dock displays an ellipsis. Its amount uses `truncate` beside two nonshrinking actions. No page-wide overflow does not mean all content is visible. | Reviewed mobile dock typography/layout for full money and large/Hindi labels; test long amounts and keyboard/safe-area. No layout change was made in this font-only task. |
| TV-04 | Medium, known duplicate risk | Reproduced locally: after a ten-digit customer mobile, creating the same number with +91 returns201. Current party service compares strings directly; the form uses +91. Existing WP-07 handoff already records this. | Normalize server-side with existing-row collision review, create/edit/archive and contact/manual tests. No existing data migration was performed. |
| TV-05 | Medium, recovery | Purchase creation key remains memory-only; full reload after uncertain first create starts a new bill. New sales tabs share one device slot. | Complete durable per-draft device recovery and multi-tab proof; existing idempotency is useful but is not full recovery. |
| TV-06 | Medium, localization/accessibility | Live switch to Hindi leaves `html lang="en"`. Glyphs render through Mukta but language-based line-height/slant rules and screen-reader pronunciation cannot be assumed correct. | Synchronize document language through the existing locale owner and test switching/reload, not just catalogue parity. |
| TV-07 | Medium, misleading activity | Customer/supplier lists say “No entries yet” despite issued sales/purchases and a receipt. The displayed field appears to describe the Udhaar activity while the page is Shop-scoped. | Define and show Shop activity, or use truthful scoped wording; test sorting and empty-state meaning. |

The product is improving, but these are business-context and clarity issues,
not cosmetic polish. More colorful tiles cannot compensate for a misleading
payable/advance or a collection action that refuses real Shop dues.

## What the handoff actually supports

| Package | Current assessment |
|---|---|
| WP-01 decisions/scope | D-01 is approved; D-03 is also approved in the user conversation but was lost from the pulled docs. Policy implementation and capability decisions remain. |
| WP-02 recovery | Server/shared recovery owners and many regressions exist. Purchase full-reload/new-sales-tab limits and physical evidence prevent “complete”. |
| WP-03 reuse | Meaningful shared owners and architecture guards passed. This does not prove zero duplicates across the entire codebase; the inventory itself names remaining candidates. |
| WP-04 messages | Invoice composer editing works live; shared composer/final-text tests pass. Dashboard Shop reminder scope fails; supplier messages and some logging/scheduled limitations remain. |
| WP-05 billing design | Desktop table and default-price/override flow work; keyboard work is documented. Current320px Hindi dock and physical keyboard/timing acceptance remain. |
| WP-06 dashboard | Compact separate panels, period controls and Shop cash scoping exist. Dual-role money/advance wording and reminder action fail acceptance. “Nothing open” in earlier review wording is superseded. |
| WP-07 records/pricing/contact | Pricing formula, picker, inclusive GST, privacy and invoice override work. Reference purchase price is last purchase, not weighted-average stock cost. Recording a purchase refreshes reference cost/margin but intentionally does not auto-change selling price; the owner's pricing-policy cards are still open. Drawer consistency, duplicate normalization and physical picker acceptance remain. |
| WP-08 returns/documents | Existing return/void/snapshot tests pass; the complete programme-level supplier-return and document acceptance matrix is still owed. |
| WP-09/10 capability/release | No universal industry/device/production readiness claim. Representative merchants, physical devices, restore/performance and release sign-offs remain. |
| Personal Udhaar/default landing | Separate app/book is not the same as an independent user-owned personal book. This synthetic Shop owner logged into Dashboard, not personal Udhaar. Ownership/migration project is still pending. |

## Provisional scores out of 10

These are review judgments for the inspected current build, with reasons; they
are **not** the formal weighted release scorecard. Unknown physical/provider/
industry evidence is not awarded a passing score. The target9/10 is not met.

| Area | Score | Why |
|---|---:|---|
| Theme/color/font implementation | 8.7 | Cohesive shared tokens, self-hosted Latin/Hindi, semantic money and contrast checks; zoom/device certification and existing Hindi-language gap prevent a higher verified score. |
| Desktop UI/UX | 8.2 | Better density, separate navigation, readable invoice tables and clear usual-price references; scoped labels/data and cross-screen consistency need work. |
| Mobile UI/UX | 7.5 | Cards/drawers fit and bottom navigation survives;320px Hindi money truncation plus native keyboard/contact evidence missing. |
| Item pricing feature | 8.5 | Correct margin/GST, bidirectional form updates, invoice defaults/overrides and privacy; last-cost policy acceptance and wider persona/device evidence remain. |
| Reviewed functionality | 7.0 | Strong regression foundation and working billing/payment flows, but Shop reminders and draft/duplicate limits affect daily use. |
| Business logic/product readiness | 6.5 | Approved separate-role balances are not implemented and advance wording is misleading; business-capability/release evidence remains incomplete. |

Next implementation should resolve TV-01/02 with explicit data contracts and
fail-before tests, then finish WP-07/recovery and mobile acceptance in the
programme order. Do not silently change financial logic inside a theme commit.

## Changed files

Modified/deleted theme files and verification docs are listed below. Unrelated
`.claude*`, root AGENTS.md and nested checkout files are excluded.

- `A` `docs/shop-ims-readiness/15-theme-and-verification-review.md`
- `A` `frontend/src/lib/fonts.ts`
- `D` `frontend/public/fonts/inter-rupee.woff2`
- `D` `frontend/src/fonts/dm-sans-latin-ext-wght-normal.woff2`
- `D` `frontend/src/fonts/dm-sans-latin-wght-normal.woff2`
- `D` `frontend/src/fonts/epilogue-latin-400-normal.woff2`
- `D` `frontend/src/fonts/fraunces-latin-full-normal.woff2`
- `D` `frontend/src/fonts/fraunces-latin-wght-italic.woff2`
- `D` `frontend/src/fonts/index.ts`
- `D` `frontend/src/fonts/inter-latin-wght-normal.woff2`
- `D` `frontend/src/fonts/landing.ts`
- `D` `frontend/src/fonts/noto-sans-devanagari-devanagari-400-normal.woff2`
- `D` `frontend/src/fonts/noto-sans-devanagari-devanagari-500-normal.woff2`
- `D` `frontend/src/fonts/noto-sans-devanagari-devanagari-600-normal.woff2`
- `M` `QA.md`
- `M` `backend/apps/platform_app/branding.py`
- `M` `docs/DESIGN-SYSTEM.md`
- `M` `docs/shop-ims-readiness/02-design-and-dashboard-specification.md`
- `M` `docs/shop-ims-readiness/07-delivery-roadmap.md`
- `M` `docs/shop-ims-readiness/08-acceptance-and-evidence-tracker.md`
- `M` `docs/shop-ims-readiness/13-shop-dashboard-design-review.md`
- `M` `docs/shop-ims-readiness/AGENT_START_PROMPT.md`
- `M` `docs/shop-ims-readiness/README.md`
- `M` `frontend/app/globals.css`
- `M` `frontend/app/layout.tsx`
- `M` `frontend/app/page.tsx`
- `M` `frontend/public/brand/yourkhata-lockup.svg`
- `M` `frontend/public/brand/yourkhata-mark-16.svg`
- `M` `frontend/public/brand/yourkhata-mark.svg`
- `M` `frontend/public/brand/yourkhata-maskable.svg`
- `M` `frontend/public/brand/yourkhata-og.png`
- `M` `frontend/public/icons/apple-touch-icon.png`
- `M` `frontend/public/icons/favicon-16.png`
- `M` `frontend/public/icons/favicon-32.png`
- `M` `frontend/public/icons/icon-192.png`
- `M` `frontend/public/icons/icon-512.png`
- `M` `frontend/public/icons/maskable-512.png`
- `M` `frontend/public/manifest.webmanifest`
- `M` `frontend/scripts/check-contrast.mjs`
- `M` `frontend/scripts/render-brand.mjs`
- `M` `frontend/src/components/layout/AccountMenu.tsx`
- `M` `frontend/src/design-system/UbActionSheet/actionPresentation.ts`
- `M` `frontend/src/design-system/UbAmount/UbAmount.tsx`
- `M` `frontend/src/design-system/UbAsyncCombobox/UbAsyncComboboxPanel.tsx`
- `M` `frontend/src/design-system/UbBottomNav/UbBottomNav.tsx`
- `M` `frontend/src/design-system/UbChipTabs/UbChipTabs.tsx`
- `M` `frontend/src/design-system/UbChoiceChips/UbChoiceChips.tsx`
- `M` `frontend/src/design-system/UbCombobox/UbComboboxPanel.tsx`
- `M` `frontend/src/design-system/UbDataGrid/UbDataGrid.tsx`
- `M` `frontend/src/design-system/UbDataGrid/UbDataGridColumnMenu.tsx`
- `M` `frontend/src/design-system/UbFilters/UbFilterSheet.tsx`
- `M` `frontend/src/design-system/UbHomeBlocks/UbHomeBlocks.tsx`
- `M` `frontend/src/design-system/UbLineItemsEditor/UbLineItemsEditor.tsx`
- `M` `frontend/src/design-system/UbMenuList/UbMenuList.tsx`
- `M` `frontend/src/design-system/UbOtpInput/UbOtpInput.tsx`
- `M` `frontend/src/design-system/UbPageHeader/UbPageHeader.tsx`
- `M` `frontend/src/design-system/UbStepper/UbStepper.tsx`
- `M` `frontend/src/design-system/UbSwitch/UbSwitch.tsx`
- `M` `frontend/src/design-system/UbText/UbText.tsx`
- `M` `frontend/src/design-system/UbTotalDock/UbTotalDock.tsx`
- `M` `frontend/src/design-system/charts/UbStatCard/UbStatCard.tsx`
- `M` `frontend/src/design-system/charts/UbTrendArea/UbTrendArea.test.tsx`
- `M` `frontend/src/design-system/charts/UbTrendArea/UbTrendArea.tsx`
- `M` `frontend/src/design-system/charts/chartPalette.test.ts`
- `M` `frontend/src/design-system/charts/chartPalette.ts`
- `M` `frontend/src/design-system/primitives/mlCheckboxPrimitive.tsx`
- `M` `frontend/src/design-system/primitives/mlFormPrimitives.tsx`
- `M` `frontend/src/design-system/primitives/mlPrimitives.tsx`
- `M` `frontend/src/design-system/primitives/mlRadioPrimitive.tsx`
- `M` `frontend/src/design-system/typographyPlugin.js`
- `M` `frontend/src/modules/DigiKhaato/features/auth/components/AuthHeroArt.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/auth/components/AuthShell.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/branding/components/BrandingPageContent.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/branding/components/BrandingPreview.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/branding/constants/brandSwatches.ts`
- `M` `frontend/src/modules/DigiKhaato/features/landing/components/LandingClosing.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/landing/components/LandingHero.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/landing/components/LandingModuleParts.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/landing/components/LandingPrimitives.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/landing/components/LandingSections.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/landing/components/PlatformMap.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/landing/components/PricingSection.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/landing/components/WhySection.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/landing/config/seo.ts`
- `M` `frontend/src/modules/DigiKhaato/features/ledger/components/LedgerEntryDrawer.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/lending/components/print/LoanPapersPrint.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/library/components/EnrolMemberDrawer.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/library/components/SeatsPageContent.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/library/view-model/seatDisplay.ts`
- `M` `frontend/src/modules/DigiKhaato/features/notifications/components/NotificationBell.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/onboarding/components/AppChoiceGrid.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/onboarding/components/BusinessTypeGrid.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/payments/components/print/PaymentReceiptPrint.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/payments/deposits/components/print/DepositSlipPrint.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/sales/components/print/InvoicePrintA4.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/sales/components/print/InvoicePrintLines.tsx`
- `M` `frontend/src/modules/DigiKhaato/features/sales/components/print/InvoicePrintThermal80.tsx`
- `M` `frontend/src/styles/tokens/alias.css`
- `M` `frontend/src/styles/tokens/dark.css`
- `M` `frontend/src/styles/tokens/light.css`
- `M` `frontend/src/styles/tokens/primitives.css`
- `M` `frontend/src/utils/cn.test.ts`
- `M` `frontend/src/utils/cn.ts`
- `M` `frontend/tailwind.config.js`
