# QA pack handoff — 12 Oct 2026 report

Any coding agent (Claude Code, Codex, a person) continuing the QA work starts
here. Read `CLAUDE.md` at the repo root first — every rule in it applies — then
this file, then the item in `docs/qa/2026-10-12-prompt-pack.md`.

Branch: `dev`. Push with `git push -u origin dev`. No pull request unless the
owner asks.

## Status (14 Oct 2026)

**Done and pushed** (each has a commit naming it — `git log --grep "B26"` etc.):
B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12, B13, B14, B15, B16, B17, B18, B19, B20, B21, B22, B23, B24, B25, B26, B27–B35,
B36, B37, B38, B39, B40, B41, B42, B43, B44, B45, B46, B47, B48, B49, B50, B51, F1, F2, F4, F6, F8, F10 (parts A and B),
F12, FB4, and DEC-019 (each app keeps its own money).

**Next, in this order:**
1. UX16/UX17/UX18: coordinated person-workspace, seat-management and rendering passes.
   The Library partial-fee/payment-history workflow is done. Continue with
   student information editing and the visible fee overview/quick actions,
   then the remaining Lending, Shop, supplier and Udhaar workflows. UX16 as a
   whole, UX17 and the cross-module UX18 audit remain pending.
   Apply the owner's additional [One Person, One Workspace requirements](one-person-workspace.md)
   throughout these passes, and complete a dedicated UX16 pass across Library,
   Lending, Shop customer/supplier and Udhaar book person pages before the
   remaining P2 features. Routine collections, backdated entries, reminders,
   edits and history stay on the person's page via dialogs/inline sections.
   Financial calculations and permissions remain owned by each app (DEC-019).
   Verify all six real-world workflows in that document at 1280/360 px; do not
   mark UX16 done for merely recording this requirement.
   Also complete UX17: [seat management and its occupancy rules](seat-management.md).
   Audit current seat/shift models and date-range conflicts, list all occupants
   with direct student links, default to All seats, and verify the documented
   concurrency/overnight/future-booking cases. The latest owner requirement
   releases expired reservations; it supersedes the older rule retaining an
   expired member's desk. Preserve their unpaid fees and payment history.
   Coordinate this pass with UX16's Library workspace, before P2 features;
   recording the requirements does not complete UX17.
   Apply [UX18 filter/rendering requirements](filter-rendering.md) throughout:
   routine interactions update affected data in place, preserve scroll/filter
   state, avoid full-document reloads and duplicate/stale requests, and use
   measured memoization where needed. Complete the cross-module audit alongside
   UX16/UX17 before P2 features; verify network and rendering behavior live.
2. P2 features: F3 (advance applied at renewal), F5, F7, F9, F11, F13;
   owner-editable message templates; per-app wording (no "You gave / You got"
   in Library or Lending); the Udhaar book refusal.
3. F10 part C: column mappings for Khatabook / OkCredit / Vyapar exports (ask
   the owner for real sample files — do not guess headers) and undo of an import
   batch within 24 hours.
4. UI pass U1–U14, U9 first.
5. Feedback FB1–FB10 (FB4 done), then the E-* edge cases (E-X4 is a P1 to
   verify first).

Update the "Done" list in this file in the same commit as each item.

## Verification since 13 Oct 2026

- UX16 Library payment/history workflow (14 Oct) is done and pushed. A ₹200
  partial fee already saved correctly, but its history required another page.
  The browser regression, a page assertion and a scoped-query assertion failed
  first. Actual receipts now appear on the student, queried by both person and
  Library bucket, with a separate lazy Redux read and guards against stale
  replies, student switches and feature reset. The existing payment drawer's
  successful-save callback refreshes this history; financial rules are unchanged.
  All 29 focused tests pass. `e2e/student-workspace-look.mjs` passes at 1280/360:
  ₹200 received, ₹700 due, one history refresh, no document reload, and neither
  the same person's Shop-only ₹333 receipt nor their Udhaar ₹777 opening balance
  appears in the history. Both final screenshots were read after dismissing the
  temporary success toast. Types, changed-file lint, locale split/check, build
  and bundle checks pass; four exceeded Library route limits use measured +
  0.5 KB. Full frontend: 4,015 passed and the same three landing failures.
  Backend source is unchanged. This completes the Library payment/history
  workflow, not the entire Library workspace or UX16/17/18 requirements.

- B43 (14 Oct): B17's card layout already fits large quantities at 1280/360,
  but the 1536 table had only 42 px for a value needing about 65 px. The new
  `e2e/quantity-look.mjs` failed on the actual clipping before the fix. The
  invoice quantity track now reserves 9rem beside its unit; decimal parsing
  and financial calculations are unchanged. All 14 focused editor/quantity
  tests pass, including the complete table's minimum-width budget. The shared
  `e2e/lib/input-fit.mjs` reconstructs computed font longhands when the font
  shorthand is empty: the old canvas default could hide clipping. The corrected
  broader `layout-look.mjs` still passes all 99 checks across six widths.
  Final large-quantity checks pass at 1280/360/1536; all three screenshots and
  the wide taxed invoice/purchase layouts were read. Types, changed-file lint,
  locales, build and unchanged bundle limits pass. Full frontend: 4,005 passed
  and the same three landing failures. Backend source remains unchanged since
  B38. All B1–B51 items are now fixed or verified; UX16/17/18 remain pending.

- B42 (14 Oct): B11's history fix preserved an existing Shop entry, but a new
  import deep link still inherited Library and kept it on reload. Both widths
  reproduced; four ownership tests failed first. Import access metadata now
  identifies its app, and the wizard remembers that ownership from the matching
  loaded job or explicit upload kind. It reuses B11's tenant/path-scoped history
  mechanism, retaining Next metadata and ignoring stale jobs and export pages.
  All 45 focused import/header/navigation tests pass. `e2e/import-app-look.mjs`
  passes direct-link and reload checks at 1280/360: one existing job read, one
  necessary switch on the direct link, none on reload and no extra document
  load. All four final screenshots were read. Types, changed-file lint, locales,
  build and bundle checks pass; only two exceeded limits use measured + 0.5 KB.
  Full frontend: 4,005 passed and the same three landing-page failures; backend
  source remains unchanged since B38. Existing desktop import name truncation
  and crowded Opening balance/Direction headers remain for the U9/UI pass.

- B41 (14 Oct): two years back required 24 live month-arrow clicks at both
  widths. Two five-year jump tests failed first. The shared lazy calendar now
  offers month/year dropdowns, with app-language month names and English/Hindi
  labels. Existing day bounds still apply, and future years remain reachable
  for plan dates rather than being cut off at the calendar library's default
  current year. All 29 focused calendar/range/student-edit tests pass.
  `e2e/date-picker-look.mjs` passes all ten checks across Joined, Plan till,
  loan collection, payment and bill dates at 1280/360: three choices from the
  open calendar, immediate rendering, no document reload and no overflow.
  All ten final screenshots were read. The phone's bill date is under its
  existing More details disclosure; its accessible name includes the hint.
  Types, changed-file lint, locale split/check, build and bundle gates pass.
  Only the exceeded not-found first-load limit uses measured 239.0 + 0.5 KB
  for the new shared labels. Full frontend: 4,001 passed and the same three
  landing-page failures. Backend source remains unchanged since B38.

- B40 (14 Oct): the live edit drawer omitted Joined and disabled an expired
  Plan till behind the saved joining date. Three new assertions failed first
  (missing control, change payload and API mapping). The drawer now edits Joined
  and uses its current value as Plan till's lower bound; the existing backend
  accepts both historical dates together. No fee or permission rule changed.
  All 14 focused frontend and 27 backend admission/permission tests pass.
  `e2e/student-dates-look.mjs` reproduces the original refusal with `--before`
  and verifies the fix at 1280/360: seven days overdue, the same ₹900 fee and no
  document reload. All four final screenshots were read. Types, changed-file
  ESLint, locales, production build and unchanged bundle budgets pass. Full
  frontend: 3,998 passed and the same three landing-page failures. Backend source
  is unchanged since B38's recorded full run.

- B9 was already closed by DEC-019. `e2e/library-book-look.mjs` creates a person
  with a ₹900 Library fee and a ₹250 opening balance in the Udhaar book, then
  verifies the Shop shows ₹0 and neither entry. Desktop 1280 px and phone
  360 px pass without overflow or browser errors; screenshots were read.
- Baseline gates: the backend suite with `config.settings.test` reports
  4,493 passed, 16 skipped, two documented timing tests deselected, and one
  failure: `test_every_appendix_a_code_is_registered_with_its_status` omits
  B5's existing `library_plan_no_end` code from its expected set. The frontend
  suite reports 3,957 passed and three failures in the landing-page tests:
  the footer now says "Terms of service" rather than "Terms", and FAQ is no
  longer in its Product links. These expectations predate this QA pass.
  Type checking and the production build pass. The untouched build also
  exceeded three Library bundle limits by at most 0.1 KB.
- B11 reproduced live and in a failing navigation test. Browser history entries
  now retain their opening app, scoped to the business, without discarding
  Next's router state. Customer/supplier badges describe the person's stored
  roles, not the current app. `e2e/app-history-look.mjs` checks Back, Forward,
  another Back and reload at 1280/360 px; screenshots were read. The 100
  navigation/wording/person-page tests pass, as do types, changed-file ESLint,
  build and bundle budgets. The full frontend rerun has 3,961 passed and the
  same three pre-existing landing-page failures. Bundle limits were adjusted
  only where exceeded, to measured size + 0.5 KB, with a dated explanation.
- B12 reproduced on the live API: paying ₹36 before the first due date made
  "To collect today" ₹36. Three regression cases failed before the correction
  (advance only, part of today's instalment, arrears cleared with an advance).
  The round now sums unpaid due/overdue instalments without adding today's
  collections back, and does not subtract them twice from the shortfall.
  All 12 collection tests pass. `e2e/lending-advance-look.mjs` verifies Today
  and Borrowers at 1280/360 px; screenshots were read. Formatting checks and
  the full backend run pass except the unchanged vocabulary expectation above.
- B15: all five cases reproduced live at 1280/360 px. Counter, ISBN and GSTIN
  errors now check number/length/layout before sequence/checksum; correcting
  From revalidates an existing To error; preview and Save show one collection
  refusal. Seven new assertions failed before the fix; all 20 targeted tests
  now pass. `e2e/validation-messages-look.mjs` checks each case and overflow at
  both widths, and all ten screenshots were read. Types, changed-file ESLint,
  i18n, build and bundle gates pass. The full frontend run has 3,969 passed
  with the same three existing landing-page failures. Backend source is
  unchanged since the full run recorded above.
- B16 reproduced with an intercepted local PostHog survey at 360, 768, 1024,
  1280 and 1440 px; the new no-floating-control test failed first. Feedback
  now lives in the desktop account menu and the phone's More account rows.
  The SDK remains lazy, surveys can still be reopened, unavailable surveys
  add no action, and customer URLs clear the action. All 29 targeted tests
  pass. `e2e/feedback-look.mjs` opens the local survey from navigation at all
  five widths; all ten screenshots were read. Every PostHog request was
  intercepted; no real project was used. Restore the normal analytics-off
  local build afterward. Types, changed-file ESLint, i18n, build and bundle
  gates pass; the full frontend suite has 3,972 passed and the same three
  existing landing-page failures.

- B17: money, fee badges, contacts, document headings and invoice/purchase
  fields reproduced clipped at 1057/1024 px; the larger fixture also exposed
  fee and purchase-line clipping at 1280 px. Three new regression assertions
  failed first. Student grids keep primary columns below 1280 and give dues
  more space; contact details and document numbers wrap; the loan phone field
  gets its own row below 1280. Invoice/purchase lines use existing labelled
  cards below 1536, preserving room beside totals, and wider quantity tracks
  when the table fits. Existing invoice-fit tests now check that breakpoint.
  `e2e/layout-look.mjs` passes all 99 checks at 1024, 1057, 1280, 1440, 1536
  and 360 px. Desktop/mobile screenshots and the original failure width were
  read, as were the wide line tables. Types, changed-file ESLint, locales,
  build and bundle gates pass. Only eight exceeded bundle limits were raised
  to measured + 0.5 KB with a dated note. The full frontend run has 3,977
  passed and the same three existing landing-page failures; backend source
  remains unchanged since its recorded full run.

- B18: live search and invoice fields moved 28–33 px when totals/autosave
  messages appeared. Two regression tests failed first. The summary now has
  a reserved skeleton slot (two lines on mobile for wrapped totals), and the
  save caption keeps its row even while idle without announcing a fake status.
  The confirmed empty book still has no search or summary. All 14 targeted
  tests pass. `e2e/layout-shift-look.mjs` measures unchanged field positions at
  1280/360 px and runs authenticated Lighthouse navigation/timespan audits;
  CLS is 0.014 or less. All eight screenshots were read. Types, changed-file
  ESLint, locales and production build pass. App bundle limits stay unchanged;
  after rebasing onto two concurrent landing-footer commits, only the landing
  first-load limit needed measured 280.1 KB + 0.5 KB, with a dated note. Full
  frontend before that rebase: 3,980 passed and the same three landing-page
  failures; the changed landing/SEO tests were rechecked afterward. Lighthouse
  13.5.0 was installed with owner approval outside the checkout in
  `/workspace/yourkhata-cloud/tools`; set `LIGHTHOUSE_ROOT` to a different
  node_modules path if needed. App manifests/lockfiles were not changed.
  Puppeteer must attach with `defaultViewport: null`: its default otherwise
  resizes the Playwright page and corrupts the layout measurements.

- B19: a real customer-save toast covered the title at 1280/360 px and a
  mobile top action. A new placement regression failed first. Mobile now uses
  the existing bottom inset, clearing navigation, FAB and sticky action bars;
  desktop is right-aligned below the measured page header, including wrapped
  actions. The measurement follows resize, scrolling and header replacement,
  with observers active only while a toast is present. The old top-centre
  expectation and design-system documentation now follow B19's requested
  positioning. All 23 targeted tests pass. `e2e/toast-placement-look.mjs`
  passes 12 geometry/browser checks at 1280/360; before/after screenshots
  were read. Types, changed-file ESLint, locales, build and bundle gates pass.
  Header measurement adds about 0.3 KB to shared code; 36 exceeded limits use
  measured + 0.5 KB with a dated note. Full frontend before a subsequent
  footer-only rebase: 3,981 passed and the same three landing-page failures;
  the affected landing tests were checked again afterward (34 passed, the
  same three failed). The integrated build/budgets pass. Backend is unchanged.

- B20: the invoice's unexplained Rule 46 count and the supplier warning's raw
  state code reproduced at 1280/360. Three regression tests failed first.
  Invoice details now open a padded, bounded checklist naming each missing
  field, its line where applicable, and whether it blocks issue or is a
  recommendation. The supplier warning explains the tax assumption in English
  and Hindi and links to the currently selected supplier's record; it hides
  when that state has been filled. No financial calculation/API changed.
  All 20 targeted tests pass. `e2e/invoice-guidance-look.mjs` passes 20 live
  checks including opening the correct supplier at both widths; final four
  screenshots were read. The corrected purchase fixture in `layout-look.mjs`
  passes all 99 checks. Types, changed-file ESLint, locales, build and bundle
  checks pass; 20 exceeded limits use measured + 0.5 KB with a dated note for
  about 0.6 KB of bill guidance. Full frontend: 3,984 passed and the same three
  landing-page failures; the final spacing change was checked with the build,
  focused tests and live screenshots. Backend source is unchanged.

- B21: the earlier B50 guard stopped eight navigation readers duplicating a
  request, but the app dropdown still initiated its own switch in addition to
  route sync. A live switch therefore sent two POSTs and two session reads at
  both widths. The combined switcher/path regression failed first. Ordinary
  dropdown selection now navigates, and the committed route owns the server
  switch. All 27 targeted navigation/registration tests pass. The new
  `e2e/auth-requests-look.mjs` passes 30 checks: all three app switches at
  1280/360 send exactly one POST and one session read, and 168 observed RSC
  responses have no 5xx. Prefetch 503s were not reproduced on this local
  production-build stack, and no hosting/backend configuration was changed.
  `app-history-look.mjs` also passes all six Back/Forward/reload checks. Both
  sets of screenshots were read. Types, changed-file ESLint, locales, build
  and unchanged bundle limits pass. Full frontend: 3,984 passed and the same
  three landing-page failures. Backend source remains unchanged.

- B24: adding Library/Lending closed the menu immediately, leaving no progress
  or success confirmation. Three regression cases failed first. The shared
  menu supports controlled opening and cancellable selection; Add app keeps
  its row visible with a spinner and disables repeat submissions until the
  request finishes. Success closes the menu, shows a localized confirmation
  and navigates; route sync owns the app switch as in B21. All 33 targeted
  tests pass. `e2e/add-app-look.mjs` passes 30 checks at 1280/360 px: progress
  appears within 2–7 ms, double clicks enable each app once, and confirmation
  is visible. All eight loading/success screenshots were read. The auth
  harness also passes its 30 checks with two calls per ordinary app switch
  and no RSC 5xx. Types, changed-file ESLint, locales, build and bundle gates
  pass; 41 exceeded limits use measured + 0.5 KB with a dated note for about
  0.2 KB of shared menu/copy. Full frontend: 3,987 passed and the same three
  landing-page failures. Backend source is unchanged.

- B36: DEC-019 already excludes Lending from this book, verified with a loan
  alongside two opening debts. However, selecting an older report date showed
  a ₹1,000 headline above ₹250 of rows at both widths. Three date/tag/payable
  regressions failed first. The selected tab now uses the filtered report's
  total, and the other side carries its amount when selected; today's cached
  whole-book position no longer heads historical or filtered rows. All 35
  targeted tests pass. `e2e/aging-scope-look.mjs` verifies headline, bucket and
  row reconciliation for current/historical reports at 1280/360 px, with no
  overflow/browser errors; all four final screenshots were read. Types,
  changed-file ESLint, locales, build and unchanged bundle budgets pass.
  Full frontend: 3,990 passed and the same three landing-page failures.
  Backend source remains unchanged since its recorded full run.

- B37: an earlier-dated receipt allocated to a later bill returned 201 with
  no warning. Four API cases, the drawer confirmation case and the phone
  launcher regression failed first. PAY-01 EC-2 permits advances, so the
  drawer now asks for explicit confirmation; the API rechecks locked manual
  and FIFO Shop bills and requires the literal JSON boolean
  `confirm_early_allocation: true` before writing. Unallocated advances and
  the separate Apply to bills workflow remain valid. The invoice page owns
  its payment drawer: closing the phone's More actions sheet no longer
  destroys the form. All 47 backend and 14 frontend targeted tests pass.
  `e2e/payment-date-look.mjs` verifies confirmation, cancellation with no
  receipt, one confirmed receipt, refreshed paid status/history and staying
  on the same invoice at 1280/360 px. Six final screenshots were inspected;
  no overflow or browser errors. Backend formatting/import/lint, frontend
  types/changed-file ESLint, locales, build and bundle gates pass. Only three
  exceeded first-load limits use measured + 0.5 KB, with a dated explanation.
  Full backend: 4,500 passed, 16 skipped, two timing cases deselected and the
  same existing vocabulary failure. Full frontend: 3,992 passed and the same
  three landing-page failures. The owner's additional workspace requirement
  is recorded in `one-person-workspace.md` and remains pending as UX16.

- B38 (14 Oct): a March sale against April opening stock issued without any
  warning. After correcting the fractional fixture to KGS, both API cases
  failed against the original behavior. The editor's date explanation and
  English/Hindi totals-warning tests also failed first. Stock availability
  now checks the sale date under the existing stock locks, including repeated
  lines and later inbound goods. Negative stock disabled refuses before any
  write; enabled issues with a dated warning. Arrival-order costing is intact,
  and ordinary current-date sales need no historical query. Test goods for
  unrelated historical invoices now open before their bill dates. All 32 final
  backend and 15 frontend targeted cases pass; a final failing quantity-label
  case was corrected so the dated explanation uses historical availability.
  `e2e/stock-date-look.mjs` passes both policies at 1280/360 px, checks the
  unchanged/refreshed stock and document, and observes zero full-document
  reloads during issue/refusal. All four final screenshots were read, including
  the actual issued dialog. Formatting/import/lint, types, locales, build and
  bundle gates pass; five exceeded limits use measured + 0.5 KB with a dated
  note. Full frontend: 3,995 passed and the same three landing-page failures.
  Full backend: 4,504 passed, 16 skipped, two timing cases deselected and the
  same vocabulary failure. The final quantity-explanation adjustment and its
  extra regression were checked with the 32 targeted backend cases after that
  full run; the stock decision and writes were unchanged by that adjustment.

- B39 (14 Oct) was already closed by DEC-019's accepted consequence in
  `docs/DECISIONS.md`: an Udhaar opening balance is settled with You got in
  that book, and is never allocated by a Shop receipt. No financial change or
  artificial failing test was made. `e2e/opening-book-look.mjs` creates a
  ₹2,300.50 opening and a separate ₹100 Shop invoice; Shop's allocation list
  contains only its invoice. At 1280/360 px it shows each book separately,
  settles the opening through the real You got drawer without a document
  reload, and verifies Main ₹0 while Shop remains ₹100. All six screenshots
  were read; no overflow or browser errors. All 47 existing book-page/list/
  bucket tests pass. Application source and dependencies are unchanged after
  B38; retain its types/lint/locales/build/bundle and full-suite results.
  The party header's as-of/record dates lag the IST business date at the UTC
  midnight boundary in these screenshots; this is recorded for UX18's date
  freshness audit, not claimed fixed by this verification.

## How each item is done

1. **Verify first** — reproduce on a live stack; some items are already fixed.
2. Write a test that FAILS before the fix (backend pytest and/or frontend jest),
   with a docstring naming the defect it prevents.
3. Fix the root cause, minimally. No new third-party packages.
4. **Look**: bring the stack up and check desktop 1280 px and phone 360 px.
   Add or extend an `e2e/*-look.mjs` script (see `e2e/fee-state-look.mjs`,
   `e2e/renew-look.mjs`) that asserts what the merchant sees, measures that
   nothing is wider than the screen, and saves screenshots. Read the
   screenshots. Most real defects here were found at this step.
5. Run the gates, commit with a prose message explaining WHY, push.

## Commands

```bash
service postgresql start                      # Postgres stops when the container recycles
cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest -p no:cacheprovider
# full suite ~20 min, no -q (it hides the summary); do not inherit local startup settings
#   two timing tests fail on slow machines regardless of changes; deselect:
#   apps/library/tests/test_verification.py::test_close_over_twenty_thousand_copies_takes_under_five_seconds
#   -k "not test_five_thousand_schedules_run_under_a_minute"
#   never run two pytest processes at once — they share the test database
cd frontend && npx tsc --noEmit && npx eslint --max-warnings=0 <changed files> && npx jest
cd frontend && (set -a; . ./.env.local.example; set +a; npm run build) && npm run bundle:check
./e2e/serve-api.sh && ./e2e/serve.sh          # restart serve-api.sh after ANY backend change
node e2e/<name>-look.mjs
```

## Things that will trip you

- **i18n**: add a key to BOTH `frontend/locales/en.json` and `hi.json`
  (`python3 scripts/add-locale-keys.py frontend/locales/en.json '{"key":"text"}'`),
  then `npm run i18n:split` and `node scripts/check-locales.mjs`. A dynamic()
  chunk or a route must import the catalogue it renders
  (`import 'src/i18n/catalogues/<name>'`). Hindi spells "बाकी" without a nukta.
  Words are plain English and simple Hindi for rural shopkeepers; no word cut by
  an ellipsis.
- **Bundle budgets**: when `bundle:check` fails, take the bytes out or raise the
  budget to measured + 0.5 KB, with a dated note in `bundle-budgets.json` "//".
  Edit that file with minimal text replacement — a JSON re-dump reformats all of it.
- **Thunks** must be registered in `src/redux/invalidation/registry.ts` or the
  module's invalidation file (a test enforces it).
- **Error codes** raised with `BusinessRuleViolation` must be registered in
  `backend/apps/common/error_codes.py`, `frontend/src/types/api.types.ts`,
  `docs/22-api-specification.md`, `errors.<code>` locale keys, and the count in
  `apps/common/tests/test_exceptions.py`.
- **Architecture rule**: a vertical (library, lending, …) may import only
  `apps.imports.registry` / `apps.reports.registry` from those apps
  (`tests/architecture/test_import_rules.py`).
- `UbCard` drops `data-testid`; put it on an inner `UbStack`.
- Prettier on a whole folder reformats unrelated files; `git checkout` them.
- Run the build/type checks separately from the full Jest suite: the party
  fetch lint test creates and removes temporary TypeScript probe files, which
  can disappear while a simultaneous build is checking them.
- Purchase drafts use `party_id`, not `supplier_id` (the latter is ignored).
  Purchase warnings are returned on save, not recomputed by a draft GET; save
  through the UI to reproduce the missing-supplier-state warning.
- No raw `div`/`span` in feature code; errors go through the global snackbar;
  nothing a merchant's customer receives names the product.
- Commit messages end with the agent's own attribution lines; no model names.
