# QA pack handoff — 12 Oct 2026 report

Any coding agent (Claude Code, Codex, a person) continuing the QA work starts
here. Read `CLAUDE.md` at the repo root first — every rule in it applies — then
this file, then the item in `docs/qa/2026-10-12-prompt-pack.md`.

Branch: `dev`. Push with `git push -u origin dev`. No pull request unless the
owner asks.

## Status (13 Oct 2026)

**Done and pushed** (each has a commit naming it — `git log --grep "B26"` etc.):
B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12, B13, B14, B15, B16, B17, B18, B22, B23, B25, B26, B27–B35,
B44, B45, B46, B47, B48, B49, B50, B51, F1, F2, F4, F6, F8, F10 (parts A and B),
F12, FB4, and DEC-019 (each app keeps its own money).

**Next, in this order:**
1. P2 bugs: B19, B20, B21 (auth call storm), B24, B36, B37, B38, B39,
   B40, B41, B42, B43.
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

## Verification on 13 Oct 2026

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
- No raw `div`/`span` in feature code; errors go through the global snackbar;
  nothing a merchant's customer receives names the product.
- Commit messages end with the agent's own attribution lines; no model names.
