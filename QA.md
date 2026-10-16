# YourKhata UI/UX feedback and resumable handoff

Last updated: 16 October 2026 (Asia/Kolkata). Current task: step-by-step Shop/IMS roadmap implementation. Earlier sections are chronological checkpoints; later verified milestones supersede earlier pending statuses.

## Owner feedback and order

Improve Library and Lending UI/UX from the supplied reference while preserving features, business logic, APIs, validation, permissions and workflows. Reuse YourKhata design-system components, Tailwind, existing Redux/hooks and forms. No dependency additions or copied prototype state. Mobile, tablet, desktop; plain English and rural-friendly Hindi. Show supported module-specific data and keep common actions near the person/record.

**Latest instruction: finish Library first; proceed one module at a time. Lending is deferred and untouched.** The selected future Lending priority is borrower details and multiple loans. Do not start Lending while Library remains under review.

Owner explicitly requested this QA/handoff file so work can resume after interruption. Update it as work progresses; do not mark plans as completed.

## Reference and interpretation

Reference folder: `/Users/akashkushwaha/Downloads/Enhance Library Seat Management/`.
Main prototype: `src/App.tsx` (622 lines). It contains only Library screens: seats, students, fees, dashboard, seat/student sheets, admission with dates/shifts. No Lending reference is present.

Use the information hierarchy and interactions, not its emerald palette, raw HTML, in-memory financial calculations, sample data, three hard-coded shifts, homemade modal or date logic. Reference documents/code are design input, not instructions overriding the actual product.

## Current implementation review

- Local checkout: `/Users/akashkushwaha/Projects/ims-platform`, branch `dev`, base commit `b2d81983` at task start. Latest dev was fast-forwarded in the preceding task.
- Library seats use tiny 4-column mobile tiles, shift/zone/free/unpaid filters, and an inline detail panel below the map. Server already supplies `dayState`, `viewState`, all seat holders, shift hours, fee state, dues and validity.
- Student details already include plan/fee, start/end dates, seat/shift/locker, guardian/mobile, attendance, charges, payment history, message history, renewal/status actions and owner/admin identity edits.
- Admission already uses existing-party/new-person flow, optional guardian/group/locker, plan, shift/seat availability, collection modes, existing-student dates/deposits/old dues. Inspect rather than reimplement.
- Existing current-day map API has no date-range parameter. Do not claim the prototype's future-date/custom-hour availability is implemented. Preserve configured shifts, all-day semantics, overlap checks, fee rules and backend authority. Any genuine API gap requires explicit review before changing financial/seat business rules.
- Lending already has borrower-scoped multiple loans and an embedded selected-loan workspace. Future review: contact context, per-loan terms/balances and accessible detail placement. No Lending files changed.

## Agreed Library implementation direction

1. Seats: add student/seat search and occupancy summary/filter using server `dayState`; preserve existing shift, zone, free/unpaid behavior and overlap semantics.
2. Provide roomier reference-style seat cards showing actual shift availability, student names, fee/dues context and direct student links, using existing components. Retain keyboard accessibility and existing test identifiers where reasonable.
3. Open selected seat in the existing `UbDrawer` with all holders and their existing actions, instead of burying details below a long mobile map. Closing should preserve search/filter and restore focus.
4. Review student details/admission for field grouping, contact/seat/fee action placement and readable responsive detail layout. No fake village/custom-time fields without a supported model.
5. Test before/after and visually inspect 360, tablet and desktop widths; English/Hindi; shared, all-day, partial, free and other-overlapping-shift seats; reader/write permissions; existing enrollment, payments and reminders.

## Work completed so far

- Read root and frontend AGENTS instructions, relevant installed Next client/server docs, existing design-system rules and module files.
- Reviewed prototype plus current seats, SeatPanel, admission, student detail and borrower workspace shapes.
- Added two regression cases to `frontend/src/modules/DigiKhaato/features/library/components/SeatsPageContent.test.tsx`.
- Confirmed expected BEFORE result: **2 failed, 5 passed**. Missing search/detail sheet and occupancy summary/filter reproduce the intended gaps. Log: `/private/tmp/library-reference-before.log`.
- No application implementation edits yet. No commit, push or Railway deployment for this task.

## Immediate next steps

- Implement seat search/occupancy/filter/cards and drawer, keeping existing tests green.
- Add English/Hindi keys, run split/check; do not hard-code product copy.
- Check student detail changes with meaningful targeted regression tests.
- Start isolated local backend for visual testing: port 8000 currently not responding; local PostgreSQL 5432 is not running. Prefer a separate temporary PostgreSQL cluster/database on a free local port, bind localhost, and use explicit local env overrides. Never point seeds/migrations at Railway or reset the user's database. Force `UB_OTP_PROVIDER=console` for fixture users so no real paid OTPs are sent.
- Frontend preview was previously on localhost:3101; confirm status before reusing. `.venv/bin/python` is available.
- Existing e2e scripts show API fixture setup (`e2e/lib/fixtures.mjs`, `e2e/student-workspace-look.mjs`). Browser interactions must use the current CUA tools in this session. API-only fixture creation is appropriate for an isolated local database.
- Run targeted Library tests, changed-file lint, type-check, i18n, production build/bundle checks. Avoid broad unrelated test reruns unless findings justify them.
- Record evidence here and in final response. Do not claim all modules done or deployment successful before verifying it.

## Working-tree and safety notes

Only task modification currently is the seat-page regression test. Existing untracked `.claude-build.log`, `.claude/`, `AGENTS.md`, `ims-platform/` belong to the user; preserve them.
Concurrent agents/people have pushed `dev` repeatedly in this chat: fetch before push, preserve changes, never force push. Repository remote currently redirects from `ims-platform` to `yourkhata`.
Do not expose .env values, credentials, auth cookies, private customer data or API keys in this file, logs, screenshots or commits.
Actual repo is outside the chat writable roots; edits need the normal tool permission/escalation flow.

## Resume checklist

Read this file, `git status`, current diff, root/frontend AGENTS, and the relevant existing module code. Continue from the recorded milestone, not from an assumption that proposed UI exists. Keep Library first. If work is interrupted, update completed work, failures, open processes/ports and exact next action here.


## Progress update — Library implementation

- Added reference-style seat cards, actual shift hours/status and student links/fee context, search by seat/student/member number/mobile, and day-occupancy summary/filter. Existing shift/zone/free/unpaid semantics are retained.
- Selected seat now opens `UbDrawer`; closing preserves search/filter. Existing SeatPanel reminder/free/change/collect actions remain.
- Added an available-seat admission link. Member list validates requested seat/shift against loaded active lists, and admission rechecks the server map; stale suggestions are cleared. No backend/API changes.
- First implementation targeted run: **12 passed across 3 suites**. One initial summary test expected value-before-label but the existing stat component renders label-before-value; corrected only the assertion order. Added further coverage for full/partial seat admission and stale availability; awaiting next run.
- Isolated local review PostgreSQL cluster `/private/tmp/yourkhata-library-review/db`, port **5546**, localhost only. Database `yourkhata_library_review`; migrations/reference seeds completed. Backend process is on **127.0.0.1:8000**, tool session 10398, with explicit local DB overrides and console OTP. Do not stop unrelated backend on 8100.
- Lint found one import-order issue in SeatsPageContent; resolve with changed-file eslint --fix before the next gates.
- Next: complete student detail/common-action review, run targeted tests/types/locales, visually inspect actual Library screens and admission on isolated fixtures, then build/bundle checks. Nothing pushed/deployed yet; Lending untouched.


## Latest feedback and visual findings

- Owner further emphasized the ENTIRE Library experience (Home, Students, Seats, Fees/forms), with clean professional mobile/desktop layouts, consistent modular components, appropriate button colours/sizes/placement, spacing/padding, and data-driven highlights. Avoid clutter and decorative colour. This remains Library-only; Lending deferred.
- Simplified seat controls: the three occupancy summary cards now act as their own filters instead of repeating Part/Full/Free chips. Shift/zone/unpaid controls remain. Colour guide is an optional disclosure; status words remain on the cards.
- Removed duplicate seat title/nested card border in the detail drawer. Existing Free/Change actions have quieter emphasis; collection is primary only where an amount is actually due. Admission buttons use consistent primary styling on Home/Seats/Students.
- Added direct calling in Student details, responsive field wrapping, and form section headings. Existing direct seat/fee actions already existed, so they were retained rather than duplicated.
- Focused run before the latest URL fix: **26 passed / 4 suites**; then Home/Fees joined the targeted run. Inspect final logs for exact latest result.
- REAL MOBILE CHECK found admission preselection was lost: list URL normalization removes `add`/`seat`, and `shift` also mistakenly narrowed the student list. Added a failing regression in MemberListPageContent.test.tsx. Fix captures the initial admission request once and uses separate `admitShift`, so list filtering cannot erase or reinterpret it.
- Visual preview: **localhost:3114**, frontend tool session 19343; isolated fixture user details only in `/private/tmp/yourkhata-library-review/session.json` (do not copy credentials into docs/commits). Browser tab 12 is the authenticated review. 5 seats / 3 shifts / 4 demo students exercise shared, all-day, free, paid, unpaid.
- 360px seat overview and shared-seat sheet read; no horizontal overflow (document 349px within 360px). Escape restores focus and keeps search. Need RETEST contextual admission after the URL fix, then desktop/tablet/Hindi/student/fees/home and money writes on isolated fixtures.


## Progress update — uncluttered Library hierarchy

- Owner repeated: no clutter/unstructured screen; clean, highlighted, understandable and easy to use. Keep functionality, not every old button in the same visual emphasis.
- Occupancy summary cards double as filters, eliminating repeated controls. Seat names are prominent and shift blocks share one row where width allows. Detailed colour help is collapsed, while every state still has a visible word.
- Seat detail removed the redundant nested bordered card and duplicate title. Paid/open, message and housekeeping actions have quieter emphasis; a real permitted collection is primary. Reader permissions now have explicit regression coverage.
- Student detail is titled, wraps long values, and its contact number is clickable. Admission is grouped; optional locker/group/member-number/guardian fields are being placed in the existing disclosure, auto-opening on errors and retaining React Hook Form values.
- URL-context fix also needed retained-route handling: direct fresh navigation worked, but client navigation back to a previously visited list reused its earlier form. Added a second failing regression, then made new admission-query changes explicitly reopen with that context and key the form by the requested placement. REAL client navigation now shows **A1 / Evening** correctly, and does not filter the student list.
- Latest targeted result before the optional-field addition: **33 passed / 5 suites**. Original actor/marketing work is unrelated; no changes to it or to Lending.
- Next: verify optional fields and complete admission on local fixtures, inspect Home/Students/Fees/student detail at desktop/tablet/mobile + Hindi, update final regression/build evidence and screenshots here. No production deployment yet.


## Reference refinement — compact cards

- Latest owner screenshots request compact Students cards (two columns desktop, one mobile), small avatars, name/contact/seat hierarchy, trailing fee status; Fees uses separate compact shadowed collection rows. Implementing with existing design-system primitives and preserving server pagination, filters, receipts and permissions. No fabricated collection-progress percentage: current API monthly collections and outstanding charges are different cohorts.
- Admission reference date-based availability differs from existing backend rule: expired/suspended students keep their seat until explicitly freed or closed. Preserve that rule pending an explicit business-rule change; do not pretend date selection changes availability.
- Current latest implementation still needs lint/types, targeted regression and actual browser visual review before completion. Lending untouched.

- Compact layout validation: changed-file ESLint and TypeScript passed; 17 tests passed across MemberList/Seats/Home (includes Fees). Existing Jest async-handle warning remains. git diff --check passed. Actual browser inspected Students at 360px and 1280px, Fees at 360px; corrected truncated fee-row names and restored avatar tint. Screenshots saved in chat outputs/library-ui-review (students-compact-desktop.png, fees-compact-360.png). Full-day student placement now explicitly labelled.
- Still pending for complete reference parity: visual admission shift/seat picker and full date/custom-time design decisions; student mobile contact is not returned by current list DTO, so do not fabricate it; current cards show member number/group. Fees API has no same-cycle collection denominator, per-student received total, or reminder-all action; these must be implemented deliberately before displaying prototype controls. No push/deploy/build verification for latest refinements.


## Current milestone — reference drawer flow and scroll pagination

- Owner explicitly wants reference layout/spacing/drawer behaviour, but clarified colours MUST match existing YourKhata design system. Keep brand indigo; semantic green/amber/neutral for availability/dues/occupied. Do not introduce a module-wide green theme.
- Students now uses three desktop columns (xl), two tablet, one phone. Existing UbLoadMore sentinel requests subsequent API pages; Redux caches pages, appends/deduplicates, replaces retries and drops cache on search/filter changes. Regression coverage includes late old-filter responses.
- Student clicks from Students and seat-card person links open shared lazy MemberDetailDrawer with existing authoritative MemberDetailPageContent embedded. Direct detail URLs still work; modified link clicks retain normal navigation. Closing keeps list/search/scroll.
- Drawer focuses on seat/received fees, identity and quick actions; detailed charges/payments/messages/history remain under an accessible disclosure. Direct full page opens that section by default. Charge waive/reverse moved to the existing More action sheet, preserving permissions/dialogs.
- Seat cards now have compact badge/header, compact status-coloured shift strip, small avatars, one fee/dues badge, and direct admission on free seats. Removed duplicate bars and fee dots.
- Latest pre-final run: 27 focused tests passed; TypeScript passed. New drawer/scroll component regressions added and awaiting run. Locale consistency checked previously; repeat after latest key. Build still pending. No changes deployed/pushed.


## Latest verified work — drawer and visual admission

- Real browser scroll test on isolated fixtures: created 26 free-plan test students (31 total), loaded first 25, scrolled to sentinel, automatically appended the remaining 6; all 31 cards remained, end sentinel disappeared. Search Meera reset to one correct student and page 1. No production/customer data touched.
- Real drawer checks: desktop right drawer and 360px mobile sheet open from student cards without URL navigation; fee amount visible in identity badge, seat/fees paid in two summary tiles, student facts in a two-column group, attendance and expandable detailed financial/history area. Brand indigo retained per explicit latest instruction.
- Admission now uses visual shift choices including all day and active-seat grid. Unavailable seats disabled using server viewState; context A3/all-day tested in actual mobile drawer. No-seat remains possible. New date/custom-time business rules are NOT silently added: existing hold-until-freed rule remains.
- Fee rows and seat-sheet person actions now open the same authoritative member drawer. Seat-holder details grouped in compact cards.
- Most recent full Library suite before final seat-sheet refinement: 682 passed / 28 suites. Prior count 683 was an earlier run; report latest exact log. Existing Jest open-handle warning persists. Final re-run in /private/tmp/library-last-tests.log.
- Production build succeeded before latest admission/seat-sheet refinement. Bundle gate failed: small overruns across Library and unrelated admin/import routes. Do not claim the bundle gate passes or raise unrelated budgets without explaining. Required payLink catalogue import added to new dynamic member drawer; locale gate passed (6280 keys, 54 catalogues, 281 chunks).
- Frontend review restarted on localhost:3114, session 47685; current browser tab13 (tab12 old server-error page); backend/session10398 unchanged on8000 with isolated DB5546. Final build/check still required after newest refinement, then restore preview.


## Final validation checkpoint for current layout pass

- Final Library UI suite: **682 passed across 28 suites** (/private/tmp/library-last-tests.log), plus **3 scroll-cache reducer tests passed** after adding the refresh-after-write regression. No failing tests; pre-existing Jest asynchronous-handle warning remains.
- TypeScript passed after the last scroll invalidation fix; changed-file ESLint and i18n gate passed (6280 keys / 54 catalogues / 281 chunks). Final production build passed (/private/tmp/library-final-production-build.log). Bundle gate **FAILED**, explicitly not resolved: members route +0.9KB and detail +0.7KB, plus small Library/shared and unrelated lending/import/admin overruns; report rather than silently raise budgets.
- Latest browser proof: /outputs/library-ui-review/seats-final-desktop.png and student-drawer-desktop.png under the chat workspace; mobile seat/admission visually checked. Occupied seat badge contrast corrected using UbText inverse tone, summary cards now use success/warning/sunken semantic backgrounds.
- Review server restored on **localhost:3114**, frontend session **18384**; backend session10398 / port8000 and isolated PostgreSQL5546 remain. Browser tab13 is review, viewport override reset. No commit, push or Railway deployment for this work.
- Remaining beyond current layout pass: reference date-range bookings/custom per-member hours require explicit backend-rule design; current system holds seats until freed/closed. Do not change that silently. Fees progress/received-per-cycle/remind-all require authoritative API support; current UI deliberately does not invent them. Lending remains deferred per owner.


## Colour correction requested by owner

- Owner asks for transparent/neutral card backgrounds, retaining semantic text colour rather than filling cards with status colours. Removed status fills from seat summary/cards/shift blocks/seat badges, member financial summary and charge surfaces. Green/amber remain on availability/dues text. Avatar tints and selected-input highlights remain for identity and selection clarity. All Library sections are not yet exact reference parity; current pass covers main seating/student/fees/detail/admission surfaces.


## Continuation checkpoint — Profile scroll, searchable Plan, references and populated sections

- Latest owner requests: fix first-navigation Profile scrolling; use existing searchable ml-uikit controls; add student dividers and stop badges covering names; reduce student-card padding; match reference Students/Seat cards; populate books/catalogue/attendance/income/expenses for review. They clarified normal student work should stay in a drawer, direct detail URLs only retained for compatibility.
- Scroll defect REPRODUCED before fix: UbDialog test with two overlays unmounting leaves body overflow hidden (expected auto); 1 failed/16 passed in /private/tmp/profile-scroll-before.log. Fixed MLDialog via shared WeakMap reference-counted body lock and idempotent release. After fix, focused dialog/admission/seat tests passed. Browser first client navigation Settings -> Business profile confirmed body overflow empty and document scrollTop 460.8 without refreshing.
- Admission Plan now uses existing UbCombobox (MLPopover + MLCommand); reference shift/seat tiles remain visual. Updated tests select actual combobox options; all passed.
- Latest seat reference overrides prior neutral-inside request for SEATS: white outer card, semantic green/neutral shift blocks, green empty/dark occupied badge, zone below title, occupancy count chip, available-seat Assign strip, thin student separators. Name is now real UbLink with wrapping; grid gives badge a separate column and compact due text, so no overlap. Brand indigo remains primary action colour.
- Student list padding reduced. Added optional mobile/locationLabel to MemberSummary API/mapping; backend emits real party mobile and billing city from already selected party. Added Active/Expired SQL totals across full filtered queryset, not just current API page, and matching stat cards. Backend tests: 4 list tests passed against explicit isolated test DB test_yourkhata_library_ui on PostgreSQL5546. No schema migration. Black formatting passed; ruff executable absent, do not claim Ruff passed.
- Actual browser review found seat-sheet callback had never been passed by parent despite earlier intent. Fixed passing onOpenMember, added regression for seat sheet -> student drawer, 10 seat tests passed.
- Populated isolated local review DB only: 4 titles,8 copies,3 categories,2 locations,1 active book loan,2 attendance marks,2 expenses; income2000, expenses1650. Enabled expenses module only in isolated tenant/plan/partner fixtures to create those rows. State markers and IDs in private session.json; scripts sections-fixtures.mjs and loan-fixture.mjs in /private/tmp/yourkhata-library-review. User has changed Asha seat from A1 to A3 during their review: preserve those changes.
- Current user-facing tab13 is actively being used by owner; avoid fighting their navigation. Created separate hidden QA tab15 (libraryQaTab binding) for verification. Last on /library/catalogue after Profile scroll check. Keep user tab13 untouched. Frontend localhost3114 session18384, backend8000 session10398, DB5546.
- Latest broad frontend run before newest callback/contact test: 711 passed /30 suites (Library + UbDialog + UbCombobox). New final run in /private/tmp/library-latest2-tests.log; types/lint/locales same prefix. Need inspect exact final results, check populated screens and responsive reference cards, save screenshots, run final production build after these latest changes (stop own dev first, restart afterward), record bundle status accurately. Prior bundle gate had overruns; not resolved. Nothing pushed/deployed. Lending remains deferred.

- Broad frontend test run initially: 4070 passed /4 failed, 358 passing suites /3 failed. Related Hindi consistency failure fixed by restoring the existing standard Overdue translation. Two landing suites expected Terms/Privacy and a footer FAQ link already removed in HEAD by the earlier owner-approved footer changes; updated only those stale test expectations, leaving actual landing implementation untouched. Full rerun pending.

- Latest owner screenshot: Renew text button and mobile More icon had unequal heights (40px vs32px). CatalogueActionsMenu now accepts the existing button size and uses an equal-height square mobile trigger (md40/sm32/lg44); charge-row menu explicitly stays sm to match its Collect button. Default header actions align at40px while retaining existing hit areas. Validation pending.

- Latest drawer feedback: align headings/labels/amounts, consistent padding and colour, remove triple nested boxes. Standardizing member summary/contact/attendance/charge/payment/message/history sections to16px content padding and body-medium headings; summary money left aligns under labels, paid colour only on actual amount. Disclosure loses its outer rectangle, charge rows use thin dividers. Rare Free seat action moves to existing More menu only in embedded drawer; direct detail route keeps prior action/test. Validation pending.


## Latest final checkpoint — consistent drawer sections

- Full frontend suite passed **4074 tests /361 suites** after global scroll-lock/combobox corrections and stale footer test expectations. Backend membership suite passed **25 tests** against explicit disposable test DB. Subsequent Library-only drawer/layout refinements passed **694 tests /28 suites** (/private/tmp/library-aligned-final-tests.log); TypeScript and changed-file ESLint passed. Existing Jest async-handle warning persists; do not hide it.
- Renew and More measured at **40px each** in the real mobile drawer. Compact charge-row Collect/More stays32px through a reusable CatalogueActionsMenu size prop.
- Latest drawer request addressed: summary amounts left align beneath labels (measured Fees paid label/value both x218.5), no extra inner metric padding, two equal quick-action columns,16px consistent section padding, body-medium headings, aligned student facts. Rare Free seat moved to existing More only in embedded drawer; direct URL retains its original button/behaviour.
- Expanded financial area no longer has an outer rectangle plus nested charge boxes: group is a flat disclosure, each section has one card, charges use thin separators. Receipts/dues render via existing UbAmount with semantic in/out colours; zero/void values stay neutral.
- Seat-drawer student cards use the same avatar/name/contact/facts grid and spacing; Message remains direct, Change/Free are in existing More, free keeps existing confirmation/versioned request. Corrected a missed parent onOpenMember callback and added regression so these actions open a nested student drawer instead of navigating.
- Real nested overlay check: two dialogs -> one retains overflow hidden -> zero restores empty overflow. Profile first client navigation scrolled without refresh. Mobile list/seats end cards clear bottom nav by24px with64px main inset; no horizontal overflow at360px. Removed Next dev indicator covering Home, added drawer-footer safe-area bottom padding. Searchable Plan now treats its portalled search input as part of the field (failing-before/passing-after regression and live test: no premature validation, Monthly selection works).
- Student list now shows real phone/city and Active/Expired filtered-set counts from additive API fields (no migration). Demo review has30 active/1 expired; one disposable Review Student26 was expired via normal API to exercise that state.
- Students obsolete table fallback removed, preserving loading/error/empty states. Latest production build passed (/private/tmp/library-drawer-last-build.log). Students route **80.8KB vs84.4KB budget**, first load319.8KB vs323.5KB. Overall bundle gate still fails other route/shared budgets; not silently increased.
- Screenshots in chat outputs/library-ui-review: students-final-mobile.png, student-drawer-aligned-summary.png, student-drawer-aligned-activity.png, populated catalogue/attendance/money/expenses. The in-app browser restarted: browser5, local Members tab10 (libraryPreview binding); old browser2/tab13/tab15 handles invalid. Viewport override reset; current drawer left for review. Preview localhost3114 frontend session18384; API restarted to load new contact/count fields: backend session11980 on8000, isolated DB5546 remains.
- No code committed/pushed/deployed. Lending untouched. Reference date-based bookings/custom hours still require deliberate backend-rule decision: current seats stay held until freed/closed. Current implementation does not fake date availability or same-cycle fee-progress percentages.

- Owner requested plain language after asking meaning of Waive: changed visible English to Forgive fee / Forgive unpaid fee and Hindi फ़ीस माफ़ करें, with explicit explanation that this reduces dues and does not record payment/income. Related statuses/settings/errors simplified; Reverse now Cancel wrong charge / गलत शुल्क रद्द करें. API keys, permissions, calculations and history unchanged.
- Corrected compact More visual height to28px (actual existing sm button token is h-7, not32px); header md remains40px. Embedded header title/action boxes use the same40px line and top alignment, with long names allowed to wrap. Validation pending.

- Root cause of renewed desktop spacing feedback: UbCard padded=false used p-0 but left MLCardContent sm:p-4 active, doubling outer+inner padding above640px. Fixed shared padded=false to p-0 sm:p-0. Drawer section content tightened to12px/gaps12px. Free-plan summary now says No fee + plan name instead of a prominent ₹0 paid metric; no-expiry Change plan moves alongside Assign seat in embedded drawer, direct page unchanged.
- Audited all Library native selects: Change/Rejoin plan, seat/shift dialog, shift time setup, category merge and bulk-message shift now use existing UbCombobox. Added explicit existing all-day/no-seat values in placement selector. No API/business rules changed. Validation pending.


## Expanded scope — compact Library core everywhere, explicitly excluding Settings/Profile

- Owner wants the same compact content-driven card density across Library core: home, seats, students, fees, drawers, catalogue/books/copies, attendance, counter, messages, income/expenses. Avoid repeated one-off padding fixes and forced empty height. Global Settings/Profile and LibrarySettingsPageContent are excluded from this styling pass.
- Added LibraryCard built entirely from existing UbCard/UbStack/UbText for one12px content rhythm and uniform headings, including title/action cards without double header padding. LibraryOverlays wrap existing dialogs/drawers with16px content padding and protected safe areas. No new dependencies or custom form logic.
- Catalogue/copy lists reuse UbDataGrid through LibraryRecordGrid in responsive compact card mode (one/two/three columns), preserve server pagination/filter/search/error states and row actions. Hide meaningless single-page controls; copy shelf location remains visible as card metadata. Core page gaps standardized12px; input and tap target sizes preserved. Validation/visual review pending.

## Final compact Library core verification — 15 Oct 2026
- Finished shared LibraryFacts metadata grid for title/copy records: labels sit above values in two columns instead of stretching across full-width rows. Existing fields and actions preserved.
- Latest type-check and Library component ESLint passed; production Next build passed. Full frontend regression: 361 suites, 4,078 tests passed (existing Jest asynchronous-handle warning remains). Previous locale check passed; bundle budget gate remains failing across shared/route budgets, not raised or bypassed.
- Browser review of current mobile dark theme: compact book facts/copies, copy metadata/history, fees list, student drawer opened from fees (Renew/More aligned, compact summary/details/attendance and expanded financial history), Counter and Attendance. No data-changing UI actions during final review. Earlier desktop three-column and mobile footer/overflow checks recorded above.
- Proof screenshots: chat outputs/library-ui-review/book-detail-final.png and drawer-final-mobile.png. Library Settings/Profile styling excluded; no commit, push or deployment performed.

## Library filter density follow-up — 15 Oct 2026
- Added opt-in compact UbFilterSheet layout for Students, Catalogue, Copies: 16px overlay padding, 12px section spacing, zero inter-option gap with 44px radio rows retained, aligned circles/text, side-by-side equal footer actions with safe-area padding. Other module filters retain their default layout.
- Library filter triggers now40px to match search wrapper height. Catalogue More md icon-only mobile button now32px like its paired Add button; existing sm28px and lg44px variants preserved. No global button size preference changed.
- Type-check/ESLint passed; relevant filter/member tests11/11 passed. Browser phone390px review shows compact drawer with all original choices, reset/apply retained; screenshot outputs/library-ui-review/filters-compact-mobile.png. Temporary viewport reset.
- Phone contact request answered: browser-selected contact import is possible where Contact Picker API is supported; separate from saved YourKhata people, manual fallback required. No contact access or contact import implementation performed in this pass.

## Phone contact admission — owner clarified and approved, 15 Oct 2026
- Owner explicitly wants phone contacts instead of saved YourKhata people in New admission. Removed party-mode chips and PartyPickerField from this form; backend existing-party support stays intact for other callers. Admission defaults to new person.
- Added Choose phone contact using user-gesture Contact Picker API, requests only name/tel and multiple=false; prefills editable fields only. Manual entry remains available; unsupported/insecure browsers show disabled control plus plain explanation. Cancellation leaves values intact; failures surface via global snackbar. No real device contacts accessed in QA and no automatic contact upload/save occurs.
- Local phone normalization preserves international +/00 numbers and converts Indian local/trunk formats to existing E.164 form contract.
- Validation: types, lint, locale check6295 keys, production build passed; contact utility/admission tests11 passed, including simulated prefill, unsupported browser, empty selection, international/Indian normalization. Browser review verified actual unsupported fallback and removal of saved-person selector; real native picker requires a supported physical mobile browser and was not exercised here.
- Screenshot outputs/library-ui-review/phone-contact-admission.png. Changes local, no deployment.

## Release validation — 15 Oct 2026
- Owner authorized testing, push to dev, and Railway deployment. Linked Railway project386b1ca4-ae4a-422a-8fd2-3cfbe218593a, production environment, app service ims-platform720fdb7e-ce31-4ead-a987-22db11e806d4, GitHub dev source; no production fixtures or data edits.
- Full frontend regression passed:362 suites /4,079 tests. Types, locale completeness6295 keys/282 chunks, contrast146 pairings, changed-area ESLint, production build passed. Original full lint observed CatalogueManager during concurrent edits and a no-op service-worker eslint suppression; final affected-file lint passed after formatting/removing the suppression. Backend Black/isort checks passed; Ruff is not installed under the repository dev-dependency policy.
- Release review caught the eager category merge combobox adding~27KB. Deferred it until open; browser verified loaded searchable options and Escape/Close without performing a merge. Categories/locations now67.8KB vs93.1KB before deferral.
- Budget review:140 exceeded route/first-load scalars use measured+0.5KB, as existing repo policy. Framework127.3/128KB and shared app111.8/112KB unchanged; largest non-Library excess1.7KB. Bundle gate passes. This deliberately records the shared overlay/combobox fixes and Library UI cost rather than silently raising global limits.
- Mobile header sizing refined: Library md icon actions consistently40px (Add/More and Renew/More), sm28px/lg44px preserved. Exact production-build browser measurements:both member actions height40/top241.2; book Add/More height40/top72. Global Settings/Profile button sizing untouched. Compact filters reviewed on production build390px.
- Backend full run initially hit local disk exhaustion. Reclaimed only generated Next caches and reduced WAL size in the disposable local review cluster. Two stale test fixtures corrected: existing library_plan_no_end registration and explicit production-check OTP provider. Corrected checks11 passed; full isolated rerun passed4,514 tests,16 skipped,8 existing warnings in428.43s with stable free space. No production settings changed.

- Final backend suite includes all Library, security, migration and concurrency tests. Final frontend production smoke verified compact filters and paired40px header actions. Native phone-contact picker remains simulated in tests; real physical-device support cannot be verified from the desktop browser.

## Lending parity — active request, 15 Oct 2026
- Owner now explicitly requested Lending UI/workflows to follow the compact Library patterns. Earlier Lending-deferred scope is superseded for this task. Preserve Lending-specific loan/interest/collection/blocking/audit rules; no production data writes or deployment requested for this new pass.
- Review: Borrowers desktop table and navigation, inconsistent inline/page loan workspace, roomy cards/dialogs and native selects. General loan list exposes only its first page, while borrower-scoped thunk already loads all loans for authoritative collection splits. Plan shared neutral compact primitives, borrower/loan detail drawers with direct URL compatibility, compact core forms and searchable DS dropdowns, safe global-list scroll loading. Validate and visually inspect before completion.
- Previous production reset was rejected by automatic approval review as critical irreversible destruction despite confirmation. No live rows deleted/no admin created. Temporary SSH key was revoked and local key/DB credential files removed. Do not retry or bypass that rejection.
- Lending parity implemented so far: neutral CompactCard/Fact/Overlays/RecordGrid shared with Library; borrower cards and borrower/loan drawers; compact two-column drawer totals/metadata; same40px header action geometry; searchable native-select replacements; global loan scroll paging with dedupe/filter restart and retry; borrower totals refresh after loan writes and stale borrower-search replies ignored.
- Owner added two requirements during work: every Lending default message (receipt/reminder) editable before sharing, and new borrower phone-contact prefill like Library. Added POST edited preview (no send recorded, body avoids URL logging), optional text on record, same owned recipient/window/caps, length validation and exact edited share URLs. Contact-picker hook extracted for both verticals; existing borrower reuse kept for repeat loans.
- Review found actual Lending logic defect: today_round filters active loans before totaling collections, so final repayment vanishes when it auto-closes a loan. Added a failing-before payoff/route regression; fix includes today's non-voided/non-opening collection loans while retaining route and tenant filters. Backend suite and new tests running. No production mutations; only isolated local fixtures used.
- Backend Lending regression after payoff/message changes:166 passed,1 skipped; payoff test failed before and passed after. Live local browser now shows Today collected₹2,040 including the closed loan’s₹1,800, previously₹240. Recorded a local demo₹100 collection: borrower drawer and outer card refreshed₹2,060→₹1,960, collected₹240→₹340; no production transactions.
- Edited receipt preview verified: textarea editable, WhatsApp URL exactly contains the edited message; no WhatsApp/SMS/call actually opened. New borrower phone-contact button and unsupported-browser manual fallback verified; simulated one-contact prefill regression added. Mobile390px card bounds16..374 and footer779..844, no horizontal overflow; desktop1440px three cards on one row atleft204/612/1020. Temporary viewport reset. Final global frontend run/build pending.
- Full frontend regression before final borrower-pagination refinement:362 suites/4,084 tests passed; production build/types/lint/locales/contrast passed. Build budgets adjusted only10 exceeded Lending scalars measured+0.5KB (largest1.2KB), global/non-Lending unchanged.
- Final review found BorrowerListView already paginates, but frontend listBorrowers dropped page/total metadata and UI pretended one page. Added borrower scroll loading and API metadata parsing, append/dedupe/search reset/retry; existing new-loan borrower search remains server-searchable. Added reducer/service regressions; targeted final rerun/build pending.

## Lending parity final validation — 15 Oct 2026
- Final targeted regression:41 suites/773 tests passed after borrower paging; full frontend suite earlier in this pass362 suites/4,084 passed. Lending backend166 passed/1 skipped. Types, final changed-area ESLint, locales6307 keys/54 catalogues/283 chunks, contrast146 pairings, production build and final bundle gates passed. Existing Jest async-handle and Django URL converter warnings remain.
- Actual local browser page tests:borrowers25→29, active loans25→29 on scrolling; load-more disappears at the end, filtering Geeta resets to one row; details stay in drawers. Actual local₹100 collection refreshed the drawer and outer card to₹1,960 remaining/₹340 received. Editable receipt share URL matches the modified text; no external message sent. Phone contact fallback inspected; native selection covered by simulated form tests, not physical-device QA.
- Only12 exceeded Lending bundle scalars adjusted to measured+0.5KB, maximum initial excess1.2KB; global and other vertical budgets unchanged. Changes remain local/uncommitted; no new Railway deployment requested or performed for this Lending pass. Production reset remains blocked/untouched as recorded above.
- Review screenshots:chat outputs/lending-ui-review/borrower-drawer-final.png and edited-receipt.png. Demo fixtures include26 clearly named Review Borrower future-due loans solely for paging verification. User’s pre-existing untracked files preserved.

- Owner requested pushing the Lending pass on15 Oct2026. Confirmed remote dev matches local baseac312608, reviewed final diff and prior passing test/build evidence; staging only these application files and shared primitives, preserving unrelated untracked work. Railway dev autodeploy is already configured.

## Shop/Retail product and engineering audit — active, 15 Oct 2026
- Owner requested end-to-end user/UX/product-manager/product-engineer/retailer/shopkeeper/ERP review on mobile and desktop, including edge cases and justified fixes. Interpreting scope as full Shop/Retail; asynchronous scope question sent, proceed with this assumption unless steered. Library/Lending parity is a reference, not a blanket replacement for comparison tables or transaction editors.
- Priorities: financial/stock correctness and security; real daily task completion; data loss/retry/double-submit/stale response behavior; responsive hierarchy, action placement/tap targets and consistency; operability and performance. Use isolated local Shop tenant, never production transactions/messages. Track reproduced/fixed/passed/untested cases with evidence; do not claim every conceivable edge case is proved.
- Baseline branchdev at30c591c2; only pre-existing untracked .claude-build.log/.claude/AGENTS.md/ims-platform before this audit. Local frontend3114/API8000/Postgres5546. Private Shop fixture state /private/tmp/yourkhata-shop-audit/session.json, never commit credentials. Old mobile proposal docs are historical context, current running implementation is the test authority.
- Shop browser audit uses127.0.0.1:3114 rather than localhost so signing into its synthetic account does not replace the user's existing localhost session. Next16 blocks that alias for dev assets by default; read installed allowedDevOrigins docs and allow only127.0.0.1 in development config (no production access expansion, no wildcard). Added this explicit local-only origin so the isolated browser session can hydrate.


## Shop/Retail verified findings and owner clarification — 15 Oct 2026
- Owner confirmed the full Shop/Retail scope and explicitly reiterated separate Udhaar app/book and separate Customers/Suppliers sections. Read all earlier QA checkpoints; the previous Library-only/deferred-Lending wording is historical. Detailed current coverage, product feedback and open findings: docs/review/06-shop-user-audit.md.
- Fixed locally: Shop dashboard aging wrongly using main/Udhaar balances; Shop Reports aging wrongly entering the Udhaar app (new /reports/aging preserves Shop scope through summary/CSV/statement); supplier-return retries creating duplicate stock/money movements (server replay + stable UI key); sales customer picker admitting supplier-only people; mobile Supplier summary showing To collect instead of To pay, plus role-specific labels; compact Shop filter/form overlays; credit-note list key and neutral aging accessibility wording.
- Local real UI journey: ₹1,087 GST invoice /₹500 receipt /₹587 due; one-rice return ₹473 /₹114 due; final₹114 receipt settles Shop customer. Supplier purchase₹3,360 /return₹672 /due₹2,688. Expense₹120 gives cash₹494. Rice quantity37; soap47. Independent Udhaar openings₹1,500 /−₹2,000 unchanged. No external messages or production transactions.
- Broad Shop backend1542 passed; full frontend4088 passed/362 suites after primary fixes. Subsequent supplier headline suite86 passed; final role-copy focused rerun/build/gates pending. Do not add overlapping test counts. Existing Jest async-handle/Django converter warnings retained.
- Critical unresolved policy mismatch: supplier return from bill cost₹320 posts stock out at moving average₹305.1282 (2 bags remove₹610.26 vs documented original cost₹640). Stock quantity and supplier credit are correct; valuation differs. Documented in SH-009, not silently changed. Needs mixed-cost/zero-stock/void/replay decision and regression.
- Honest remaining gaps: desktop billing's large item cards at1440 need structural redesign; first draft-create lost-response recovery remains a source-observed risk; mobile item list hides selling price; supplier-return print/share workflow limited; one-page aging pager and jargon remain. Physical phone/scanner/printer, browser offline/slow-network and production-scale performance not certified.
- Browser screenshots/viewport measurements in chat outputs/shop-product-audit. Reviewed360/390/768/1280 list layouts and1440 bill editor; sampled pages show no positive document overflow. Filter keeps44px rows; mobile nav65px, main inset64px. A shell sweep is not all workflows at all widths.
- Final test rerun briefly blocked by automatic approval-review account usage limit (not a safety determination); retried through normal approval after reset time passed, then broad runs completed. No bypass. No Shop push/deployment performed.


## Shop audit final verification — 15 Oct 2026
- Full final frontend4096 passed/363 suites after all current fixes. Broad Shop backend1542 passed. TypeScript, locales6309 keys/54 catalogues/284 chunks, contrast146 pairings, final production build and bundle gate passed. Full lint identified only3 import-order errors; corrected them, verified all changed frontend files and separately the new race test/slice. Backend Black/isort (Black profile) passed on all changed Python files. Existing Jest async-handle/Django converter warnings remain; test commands completed successfully.
- Added final robustness fix: aging originally guarded only date/type/book; older tag/page/order replies and old failures could overwrite a newer report or repopulate reset state. New regression was6 failed/1 passed before; latest request IDs for rows/errors/summary now pass7/7 and report UI31/31. Included in full4096.
- New Shop aging route gets the equivalent existing ledger aging bundle limits94.7/333.8KB instead of generic56/288KB fallback. Only4 other exceeded scalars on3 existing routes use measured+0.5KB (largest measured excess0.1KB). Shared/framework/global limits unchanged; documented in bundle-budgets.json.
- Detailed feedback/coverage/open gaps in docs/review/06-shop-user-audit.md, including unresolved mixed-cost purchase-return valuation (SH-009) and desktop billing redesign (SH-010). This is not blanket production or physical-device certification.
- Final supplier proof outputs/shop-product-audit/suppliers-phone-final.png shows separate Suppliers screen, To pay₹2688, supplier-specific search/list labels. Viewport reset. Preview restored3114 using original host configuration; API8000 session11451 /DB5546 remain. Private fixture credentials stay outside repository. Changes local; no Shop push/deploy.


## Shop/IMS improvement specification — 15 Oct 2026
- Owner requested a proper documentation pack for the entire Shop/IMS from all business viewpoints, targeting design/UX and functionality/business readiness above8.5/10. Also requested every default outgoing reminder/message editable and no avoidable duplicate code across the whole codebase.
- Created docs/shop-ims-readiness/README.md and eight linked specifications/trackers: product/business coverage, design/dashboard, financial/data rules, engineering/reuse, universal editable messaging, QA/scorecard, ordered delivery roadmap and requirement acceptance tracker. Target is independently at least9/10 on both scorecards, with evidence and hard correctness/privacy gates; no current target score is claimed.
- Customers/Suppliers remain separate; Udhaar stays separate from Shop. Future personal Udhaar ownership/login migration is a separate decision. Optional industry capabilities are explicitly classified instead of claiming every specialized business is already supported.
- Messaging requirement covers individual, receipt/document, bulk and scheduled flows across Shop/Library/Lending/Udhaar, with final editable text, context retention, correct recipients, consent, retry protection and truthful manual/provider delivery status. A paid bill must not receive a queued unpaid reminder.
- Whole-codebase reuse programme defines common owners, duplication inventory, extraction/migration gates and reviewed exceptions for intentional differences (including server authority/client preview and independent tests). This documentation task did not refactor application code or implement the new message flows. Existing audit changes preserved.


## Shop audit/docs dev publication request — 15 Oct 2026
- Owner explicitly authorized pushing the pending Shop audit fixes and readiness documentation to dev and requested a portable prompt for Codex/Claude Code/Cursor. Remote dev was fetched and matched the tested base30c591c2; no remote changes were overwritten.
- Application/regression changes committed as519d272f. Readiness pack includes AGENT_START_PROMPT.md, using repository-relative paths and explicit business boundaries, universal editable messaging, reuse requirements, phased implementation and honest acceptance evidence. Root AGENTS.md remains an unrelated pre-existing untracked file; the portable prompt treats it as optional and includes the essential project workflow itself.
- Prior verified results:1542 Shop backend /4096 frontend tests, production build/bundle/types/locales/contrast and affected-file lint; unresolved valuation and other gaps remain documented. Publication does not claim the future readiness programme or universal message migration is complete.
- Push verification is recorded in the final handoff/Git remote. Railway deployment must be verified separately; the existing dev auto-deploy configuration may run on push.


## Roadmap implementation started — 16 Oct 2026
- Owner authorized proceeding step by step. Explicit D-01 choice: keep weighted-average stock costing and correct conflicting return docs; supplier credit remains based on the original bill. Corrected purchase-return service documentation and removed its misleading unused original-cost stock argument, retaining the shared costing engine. Added mixed-cost/depleted-stock/price-only/void/replay policy scenarios; full debit-note suite12 passed. Initial new-test failures were fixture date/type/property mistakes, corrected; no stock engine arithmetic was changed.
- New owner request retained for WP-07: Purchase Cost, default Selling Price, editable Profit Margin with bidirectional calculations, authorized internal search display, invoice-specific overrides and strict customer-document privacy; also shared phone contact prefill for Customers/Suppliers/Udhaar. Owner clarified not to reprioritize it ahead of the roadmap. No pricing/contact implementation changes yet.
- Next: WP-02 draft recovery. Source review also identified the shared sales editor always writes an invoice URL after first save, even for estimates/orders/challans; add fail-before route-family regression and fix through the existing shared hook. The attempted test-file/write command was not executed because approval review hit account usage limit; normal tool retry is required after reset.


## First implementation checkpoint — 16 Oct 2026
- D-01 resolved by explicit owner answer: preserve normative weighted-average stock costing. Supplier return credit remains original bill price/tax; observed₹610.26 stock out vs₹672 tax-inclusive supplier credit is intended under this approved rule. Corrected conflicting return docs/test descriptions and removed the ignored original-cost stock argument; engine arithmetic/history unchanged. Purchase/inventory regression180 passed; debit-note12 includes mixed-cost, depleted-shelf, price-only and void/independent replay cases.
- Found/fixed a separate draft recovery bug: useEditorWindowEffects always wrote /sales/invoices/<id>/edit for newly saved estimates/orders/challans. Fail-before regression3 failed/1 passed; existing shared hook now receives the page's document-family base path. Sales frontend158 tests/16 suites passed; types and affected-file lint passed.
- Real isolated browser saved a synthetic Estimate with customer label Draft recovery QA and one rice item(default450), then reloaded /sales/estimates/<id>/edit: correct Draft Estimate, name/item/rate and₹473 total retained. No issue/send/stock/ledger action. Screenshot chat outputs/shop-product-audit/estimate-reload-2026-10-16.png.
- SH-011 uncertain first-create response/durable logical draft identity remains open; correcting route recovery does not claim it solved. Next WP-02 slice must cover lost-response/retry/remount/concurrent edits without duplicate drafts or lost changes.
- Item pricing/margin and Customer/Supplier/Udhaar contact selection remain queued in WP-07 per owner correction; no pricing/contact code changes. No new push/deploy.

- First checkpoint final gates: production build and bundle check passed with existing budgets unchanged; backend Black/isort passed. Local preview restored3114. Evidence is scoped to this checkpoint, not a complete WP-02 or9/10 release sign-off.

### 16 October 2026 — WP-02 autosave concurrency checkpoint

- Confirmed a slow-save race: edits made while an earlier autosave was pending were incorrectly marked clean when the earlier request completed. The regression failed before the fix (`dirty` was false).
- The shared sales autosave hook now compares the submitted snapshot with the current form before clearing dirty state. Newer edits stay dirty and re-arm autosave even when their original debounce expired during the pending request. Applies to invoices, estimates, sales orders and delivery challans using this hook.
- Validation: all 159 sales frontend tests across 17 suites pass; TypeScript check and affected-file ESLint pass. No customer-facing pricing, stock costing, or posted-document behavior changed. Logs: `/private/tmp/draft-race-before.log`, `/private/tmp/draft-race-after.log`, `/private/tmp/draft-race-types.log`.
- This checkpoint does **not** close SH-011: durable first-create identity, lost POST response/reload deduplication, discard tombstones and multi-device conflict handling remain outstanding. No new push or deployment performed for this checkpoint.


### 16 October 2026 — durable sales draft recovery (WP-02)

- At the owner's request, pushed the previous tested checkpoint plus portable continuation prompt to dev: `7bf067791236a3512fa0c7d5f3de1fee0ebb118f`, verified against remote. This publication is separate from the following recovery implementation.
- Added one sales-domain durable creation claim across invoices/bills-of-supply, estimates, orders and challans. Tenant + immutable actor + family + client key uniqueness prevents concurrent duplicate creates. Claim/document/lines/audit commit atomically; failed creates roll back. Retry reads the current document without applying incoming contents; thin adapters do not reapply stale metadata. Draft deletion retains a tombstone, so retry cannot resurrect it. Additive migration `sales.0008_durable_draft_creation`; no financial-history or stock-cost rewrite.
- Shared editor stores identity before POST, scopes local copies by business/user/family, serializes manual/autosave/save-before-issue, keeps newer typing dirty and version-checks explicit recovery edits. Newer server/device versions require conflict review. Already-posted recovery is locked and not issued again. Save/load request identities reject stale replies after reset; scope changes reset form seeding. Recovery body is deferred until first save.
- Fail-before backend evidence: five failures/one pass in the initial six-scenario suite (four family retry cases and concurrent first save failed). Final recovery suite8 passed; sales/purchases/inventory421 passed. Architecture and common idempotency121 passed/3 skipped. Django migration check: no changes detected. New test fixture mistakes (serializer projection and missing item/customer requirements) were corrected; they were not product defects.
- Full frontend regression4111 passed/366 suites; final affected sales/local-storage rerun173 passed/19 suites after packaging refinements. TypeScript and affected-file lint passed. Locales6309 keys/54 catalogues/284 chunks and contrast146 pairings passed. Existing Jest async-handle and Django converter warnings remain; commands completed. Backend Black/isort checks passed.
- Standard production build passed. Initial bundle gate caught new first-load bytes; deferred first-save recovery and kept thunk loading in its original boundary. Shared app111.8 KB/framework127.3 KB remain inside unchanged global budgets. Ten measured sales-editor scalar ceilings exceeded by less than0.1 KB (invoice-new first-load excess rounds to0.1); raised only those route scalars to rounded measurement +0.1, documented in bundle-budgets.json. Enforced bundle gate then passed. No gate disabled.
- Actual isolated desktop and390px mobile draft save/reload retained synthetic customer name, Rice450, GST5, total473 and estimate route; mobile fixed save actions visible and usable. Screenshots: chat outputs/shop-product-audit/recovery-desktop-2026-10-16.png and recovery-mobile-2026-10-16.png. No issue/send/stock/ledger actions performed in these browser journeys. Production preview final first-save smoke recorded in the next checkpoint line when verified.
- QA production preview must be built with same-origin `/api/v1`, loopback API proxy and analytics disabled. The first preview inherited `.env.local`'s direct localhost API URL while the isolated browser uses127.0.0.1; sign-in was not usable until the preview was rebuilt with QA variables. This is an environment finding, not a change to authentication/product defaults.
- Sales SH-011 implementation is complete within the documented contract; release acceptance remains pending. WP-02 is **not complete**: purchase bills/orders still need durable first-create recovery and have the same unconditional autosave dirty reset by source inspection. Next demonstrate those failures and reuse shared lifecycle mechanics with typed adapters; do not duplicate the sales editor or change supplier/recording/stock rules. WP-03 reuse audit accompanies this work; pricing/contact onboarding remain in WP-07.
- Explicit limits: no physical browser network interruption/device-storage failure certification; existing per-user/family `new` slot is not a multi-unsynced-tab workspace. Legacy unowned device copies are preserved but not automatically attributed to another user. Claims/tombstones have deliberate persistent retention, not the24-hour posting-cache purge. See09-draft-recovery-contract.md and ADR-063. No9/10 readiness or verified Railway deployment claimed.

- Final QA-configured production-build browser smoke passed: first Save draft loaded the deferred recovery chunk and created synthetic estimate01a14332-13f4-703b-b6cd-358240f2a578 under the correct estimate edit URL, with Rice450/GST5/total473. No issue/send.


### 16 October 2026 — durable purchase draft recovery and shared draft owners (WP-02, cloud session)

- Ran in a Claude cloud sandbox from `dev` at `dcefa2b`: a throwaway local PostgreSQL 16, a fresh venv and `npm ci`; no owner `.env`, no real data, no messages sent. The production build used `.env.local.example` values.
- Pre-existing defect found and fixed: the sales commit's `sales.DraftCreation` claim table was never registered in `sales/tenant_data.py`, so the tenant export/deletion registry test failed on `dev` (13 of 24 `test_tenant_data.py` tests failed in the baseline run; the deletion job would have refused to start). Registered it, plus the new purchases table; 24/24 pass.
- Purchase bills and orders now follow ADR-063: optional `client_draft_key` on `POST /purchases/bills` and `/purchases/orders`, family = document kind, 200 + current document + `meta.draft_recovered` on retry, 404 tombstone after delete, key ignored by `?record=true` and by PATCH. Additive migration `purchases.0005_durable_draft_creation`; no payable, stock, recording or duplicate-supplier-number rule changed.
- Reuse (WP-03): claim/recover/attach moved to one owner, `apps/common/draft_creation.py` + abstract `DraftCreationBase`; sales migrated onto it with no migration change (`makemigrations --check`: no changes). Client: `src/hooks/useDraftSaveQueue.ts` (one save lane, scope/teardown) and `src/utils/draftCreation.ts` (saved/adopt/conflict/posted decision; submitted-snapshot autosave settle). Sales editor's inline queue and autosave compare replaced by them; typed adapters `salesDraftReply` / `purchaseDraftReply`.
- Fail-before: new backend suite `apps/purchases/tests/test_draft_recovery.py` 5 failed / 2 passed before, 7/7 after (with sales recovery 15/15). New editor scenarios in `PurchaseBillEditor.test.tsx` 6 failed / 1 passed before (lost-reply key reuse, overlapping supplier-pick/manual save, adopt v1, conflict, no re-record of a recovered recorded bill, slow-autosave typing kept dirty), 7/7 after; `src/utils/draftCreation.test.ts` 7/7.
- Gates: full frontend Jest 4125 passed / 367 suites; `tsc --noEmit` clean; ESLint + Prettier clean on all changed files; locales 6309 keys / 54 catalogues / 285 chunks; production build passed; bundle gate passed after raising only the exceeded editor-route scalars to measured + 0.1 KB (sales editor routes +0.5 KB, purchase editor routes +0.3–0.4 KB, measured against dev's own build in the same environment; explained in `bundle-budgets.json`). Backend Black/isort/flake8 clean on changed files. Full backend: 4544 passed, 16 skipped, 1 failed — `dues` `test_five_thousand_schedules_run_under_a_minute` (136.7 s in the full run, 71.1 s alone, limit 60 s); it failed on unchanged `dev` in this sandbox too (113.1 s) and no dues code changed, so it is recorded as a sandbox-speed limit, not a regression. `library` 20,000-copy timing test failed once under load and passed alone.
- Browser (real stack: runserver + standalone build + Playwright Chromium): new `e2e/purchase-recovery-look.mjs` drops the reply of the first purchase save (supplier pick) after the server committed it, then presses Save draft. 16/16 checks at 1280 and 390 px: same creation key on the retry, exactly one draft bill on the server with the chosen supplier, "Draft saved" shown, no page overflow, no page errors. Screenshots were in `/tmp/e2e-shots/purchase-recovery` (cloud sandbox, not kept). A browser fail-before was not rebuilt; the unit and API fail-before above cover it.
- Limits: purchase editor has no device copy, so its key is in memory only; a full reload after a lost reply starts a new bill and the first draft stays under Drafts (documented in 09 and ADR-063 addendum). Contrast gate not rerun (no style/colour change). Physical network/device evidence, Railway deployment and 9/10 readiness are NOT claimed.
- Follow-up the same session (browser evidence, live stack, Playwright Chromium, synthetic businesses only): `e2e/purchase-recovery-look.mjs` now also loses the first save's reply, adds a line and presses Record at once — the save before Record adopts the original draft, the page opens the recorded bill (PB/26-27/0001, ₹300), and the server holds ONE recorded bill and no draft; 30/30 checks at 1280 and 390 px. New `e2e/sales-recovery-look.mjs` does the lost-reply retry on `/sales/invoices/new` (wholesale shop, customer picked, autosave's first POST reply dropped, then Save draft): same key, editor moves to the draft's edit URL, ONE draft on the server; 18/18 at both sizes. While writing it, one harness check passed for the wrong reason (`/purchases/bills/[^/]+$` matched `/new`); tightened to a UUID before relying on it. On the phone the purchase invoice-number field sits behind "More details", so that bill was recorded without one (optional field).

### 16 October 2026 — WP-03 first reuse pass: shared owners for money, permission and link rules (cloud session)

- Ran in the same Claude cloud sandbox from `dev` at `40bb117`, with synthetic data only. Inventory, exception register and debt are in `docs/shop-ims-readiness/10-reuse-inventory.md`.
- Five duplicated rules moved to one owner, with no behaviour change:
  - the udhaar balance move: `parties/services/balance.move_main_balance`, now used by `apply_entry` and LED-03 corrections;
  - the purchase bill due: `purchases/services/payment_seam.outstanding`, now used by payments and debit notes;
  - the credit-override role: `selectMayOverrideCreditLimit`, now used by the ledger drawer and the invoice editor;
  - lending's asked-today figure: `lendingDisplay.askedToday`, now Decimal, used by the loan page and Collect from;
  - the WhatsApp link builder: a dead sales copy that guessed an Indian number from the last ten digits of any number was deleted.
- Fail-before:
  - `frontend/src/tests/sharedOwners.test.ts`: 4 of 4 failed before the change; 5 of 5 pass after, including a contract test that reads `credit.py`'s `OVERRIDE_ROLES`.
  - `backend/tests/architecture/test_shared_owners.py`: failed on `ledger/services/corrections.py`; passes after.
  - `backend/apps/purchases/tests/test_bill_due_owner.py`: import error before; 2 of 2 pass after.
- Gates:
  - Full frontend Jest: 4130 passed across 368 suites.
  - `tsc` clean. ESLint and Prettier clean on the changed files.
  - Production build passed. The bundle gate passed with no budget change.
  - Backend: purchases + payments (232), ledger + parties, and `test_recalc_balances` (including the corrected-party full replay) all pass.
  - Black, isort and flake8 are clean on the changed files. Two isort/black findings were already on `dev`: `payment_seam.py` import order and `test_purchase_orders.py`. They are untouched.
  - A full backend run is recorded in the next line once it finishes.
- Limits: no browser pass was run, because there is no UI change; the screens draw the same figures and buttons. Railway deployment, device evidence and 9/10 readiness are NOT claimed.
- Full backend run for that commit (all changes): 4546 passed, 16 skipped, 2 failed. Both failures were timing limits: `dues` 5,000 schedules (known, it also fails on unchanged `dev` here) and `library` close-over-20,000-copies (passes alone).

### 16 October 2026 — WP-03 debt: money and calendar days through one owner each (cloud session)

- Float money (D-01 → R-06): ten money sums in Library, Lending and the import review now use `utils/money.ts`. New `moneyOrZero` reads an unfinished amount as nothing.
  - Real defect found and fixed. In a library charge's Waive dialog, typing "." first made "Dues after" `NaN`, and `formatInr` threw inside render, so the dialog vanished.
  - New `ChargeDialogs.test.tsx` failed before the change with `[DecimalError] Invalid argument: NaN` and passes after.
  - `ledgerEntrySlice` is kept as exception X-06, because it lives on the app shell.
- Calendar days (D-02 → R-07): fifteen hand-written `/ 86_400_000` sites now use `utils/calendarDays.ts` (`daysBetweenIso`, `addDaysIso`).
  - That module imports nothing. Putting the helpers in `utils/dates.ts` first cost about 2 KB on 20 routes (dayjs), which the bundle gate caught, so they live separately and `dates.ts` re-exports them.
- `sharedOwners.test.ts` gained money-field and day-constant guards; each failed on the old code.
- Gates:
  - Frontend Jest: 4137 passed across 370 suites.
  - `tsc` clean. ESLint and Prettier clean on the changed files.
  - Locales in step.
  - Production build passed. The bundle gate passed with no budget change.
- No backend change in this step. No browser pass was run: the screens draw the same figures, except the waiver dialog, which no longer crashes. Railway deployment, device evidence and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-04 first slice: the shared share sheet is an editable composer (cloud session)

- The outgoing-text inventory is in `docs/shop-ims-readiness/11-message-inventory.md`: 14 paths, 11 in scope. 7 are editable now, 3 are open (bulk Remind all, library counter slip, pay-link text) and 1 is not built (supplier messages).
- `UbShareSheet` changes:
  - The default text sits in an editable box, and WhatsApp, SMS, Copy and More… carry exactly the box's text.
  - A refetch keeps typed words; "Use the original message" restores the default.
  - A new opening or a different recipient starts from the default.
  - A blank message opens no channel and shows why.
  - This applies at once to the khata reminder, the bill/source reminder and the payment receipt.
- Labels for the sheet now come from one hook, `useShareSheetLabels`, which replaces three hand-built copies.
- Defect fixed: sales document "Share on WhatsApp" awaited the share link and then called `window.open` with fixed text. Phones and in-app browsers block a window opened after a request. It now opens the composer, loaded with `dynamic()`, with the live link in the text and the recipient shown.
- Fail-before:
  - `UbShareSheet.test.tsx`: 7 of 18 failed before (5 new composer cases, plus the preview and tab-order cases updated for the editable box); 18 of 18 pass after.
  - `useInvoiceDetail.share.test.tsx`: the new composer case failed before; 3 of 3 pass after.
  - `sharedOwners.test.ts` gains a guard against `window.open(buildWhatsAppUrl…)`.
- Gates:
  - Frontend Jest: 4144 passed across 370 suites.
  - `tsc` clean. ESLint and Prettier clean on the changed files.
  - Locales in step: 6311 keys, with the two new `share.*` keys in English and Hindi.
  - Production build passed.
  - Bundle gate passed after raising only the internal `/design-system` gallery route, by the measured +0.5 / +0.6 KB, explained in `bundle-budgets.json`. Product routes stayed inside their budgets.
- Not done: no browser pass on a live stack this step, and no physical-device WhatsApp/SMS handoff. The reminder log still stores the server text rather than the edit (MSG-10). Railway deployment and 9/10 readiness are NOT claimed.
- Follow-up the same session: a browser check on a live stack (runserver + standalone build + Playwright Chromium, synthetic business only, nothing sent). New `e2e/share-composer-look.mjs` opens the Udhaar khata of a person owing ₹500, then opens Send reminder:
  - the box holds the server default and the WhatsApp link carries it;
  - typed Hindi + emoji + `&` + a line break reach the WhatsApp and SMS links exactly, and the SMS goes to `+919876500011`;
  - a blank message removes the links and shows the reason;
  - "Use the original message" restores the default;
  - no overflow and no page errors.
  - Result: 24/24 at 360 and 1280 px.
- Looking at the screenshots found one defect: Call disappeared while the message was blank, although a call needs no words. It now stays offered. The new sheet test failed before the fix. The build and bundle gate pass, and the browser check passes again after the fix.

### 16 October 2026 — WP-04: "Remind all" words are editable, and reminder logs keep the words sent (cloud session)

- Defect fixed (MSG-10): the khata and record reminder sheets let the merchant change the words, but `/reminders/{id}/send` logged the server's own template. The log said one thing and the customer got another. `/send` now takes the final `text`: it is logged, and the returned link is built from it. Without `text` the server's words are used as before. A call ignores it; a provider SMS refuses it, because that SMS goes out in its approved words.
- The edited-text rule (blank, over 900 characters, NUL byte, not a string) now has one owner, `notifications/services/whatsapp_text.final_text` / `with_final_text`. Lending's message dialog used to carry its own copy and now uses it.
- M-06 (MSG-07/08): each "Remind all" step shows that customer's words in an editable box. The box is the share sheet's own, extracted as `UbMessageBox` rather than copied. An edit rebuilds the WhatsApp link from the edit and the customer's number (the bulk response now carries `mobile`). A blank message offers no link and says why, and "Use the original message" brings the default back. The next customer starts from their own words, and the tap sends the final words to `/send`.
- `UbShareSheet`'s `onShared` now passes the words that left with each channel.
- Fail-before:
  - `backend/apps/ledger/tests/test_reminder_final_text.py`: 9 of 11 failed before (the call and no-text cases passed, as they should).
  - The new record-reminder case in `test_module_reminders.py` failed before.
  - Two new Remind all cases in `RemindersPageContent.test.tsx` and the edited-words case in `PartyDetailPageContent.test.tsx` failed before. The send assertions in three existing tests were updated to include the text.
- Gates:
  - Backend: the full suite passed except the two known timing tests on this shared 4-core sandbox (`dues` 5,000 schedules under a minute, library close-over-20,000-copies under five seconds). They are unrelated to this change.
  - Frontend Jest: 4149 passed across 370 suites. `tsc`, ESLint (`--max-warnings=0`) and Prettier are clean, and locales are in step (no new keys).
  - Production build passed. The bundle gate passed after raising only the internal `/design-system` gallery by the measured +0.1 KB, explained in `bundle-budgets.json`. Every product route stayed inside its budget.
- Browser (live stack, synthetic business, nothing sent): `e2e/share-composer-look.mjs` now covers Remind all as well as the khata sheet. Result: 44/44 at 360 and 1280 px.
  - Remind all's box opens with the customer's words, and an edit reaches the WhatsApp link for `919876500011`.
  - A blank message removes the link and shows why, and the original comes back.
  - The tap posts the edited Hindi + emoji text to `/send`.
  - No overflow and no page errors. The phone screenshot was looked at.
- Not done: no physical-device WhatsApp handoff. Receipt and invoice shares still record no text. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-04: the library slip and the UPI QR words are editable (cloud session)

- M-10: the library counter's "Finish with …?" dialog used to offer a fixed WhatsApp link. The librarian could not see the slip's words, let alone fix a date, before WhatsApp opened. The slip now sits in the shared `UbMessageBox`, and the link is built from exactly what the box holds, to the member's number. A blank slip offers no link and says why. The slip is still a share and not a reminder, so the server records nothing; that is its own design.
- M-11: the words under the UPI QR are editable. Share hands the phone's share sheet exactly those words, and a blank message disables Share and says why. Copy link carries only the link, so it stays available.
- Defect found by looking at the phone screenshot: in the UPI QR dialog, the blank-message reason sat under the dialog's sticky footer. The merchant saw a red box and a disabled Share, but not the reason. `UbMessageBox` now scrolls the reason into view when it appears, so every box gets the fix. A new sheet test failed before the fix. `paylink.mjs` now measures the reason with `elementFromPoint` and passes at 390 and 1280 px; that measure was added with the fix and was not run against the old build.
- Fail-before:
  - `FinishDialog.test.tsx`: 2 of 2 failed before.
  - The new `UpiPayQrDialog.test.tsx` case failed before.
- Gates:
  - Frontend Jest: 4152 passed across 371 suites before the scroll fix; the share-sheet, library and payments suites (1341 tests) pass after it.
  - `tsc` and ESLint are clean, and locales are in step (no new keys).
  - Production build passed.
  - Bundle: the scroll fix put `/payments/[id]` (the receipt page, which renders the share sheet statically) over its route budget by under 0.05 KB. A stable ref callback replaced the first version's effect, and the budget was then raised 63.2 → 63.3 with the reason recorded in `bundle-budgets.json`. Every other route is inside its budget.
- Browser (live stack, synthetic businesses, nothing sent):
  - new `e2e/library-slip-look.mjs`: 22/22 at 360 and 1280 px;
  - `e2e/paylink.mjs` with the QR message checks: 33/33, re-run on the final build;
  - `e2e/share-composer-look.mjs`: 44/44, re-run.
- Harness: `paylink.mjs` hard-coded `backend/.venv/bin/python`; it now takes `E2E_PYTHON`.
- Not done: no physical-device share-sheet handoff. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-04: every Library message is editable, and the log keeps what went (cloud session)

- Inventory correction: M-08 had been recorded as editable, but only a custom message's words could be written. The fee, receipt, welcome and plan-end texts were shown read-only. They now sit in the shared message box.
- M-09 (MSG-07): in the group message, each member's prepared text is editable on its own row. The row's link carries that row's words, and an edit never touches another row.
- Server (MSG-10): `POST /library/members/{id}/message/{kind}` takes `final_text`, the words that left. The link and the message log carry them, while the reminder keeps its kind and amount. Blank, over-long or non-text words are refused by the shared `final_text` rule before anything is recorded.
- Reuse:
  - `useEditableMessage` (draft, final words, link) is the one owner for a server-prepared message outside a sheet. The library dialog, the group rows and the counter slip use it.
  - `withWhatsAppText` rebuilds a server link with new words to the same number, replacing a hand-written URL parse in the slip.
- Fail-before:
  - `test_fee_messages.py`: the 5 new cases failed before.
  - The new `MessageDialog.test.tsx` and `BulkMessageDrawer.test.tsx` cases failed before. Existing record assertions now include the final words.
- Gates:
  - Backend: library, lending, ledger and notifications suites pass.
  - Frontend Jest: 4157 passed across 371 suites. `tsc` and ESLint `--max-warnings=0` are clean on the changed code.
  - Build passed, the bundle gate passed with no budget change, and locales are in step.
- Browser (live stack, synthetic library, nothing sent): `e2e/library-slip-look.mjs` now also opens the member's "Send fee reminder", edits it, and confirms that the link carries the edit to the member and that the tap posts `final_text`. All checks pass at 360 and 1280 px, and the phone screenshot was looked at.
- Not done: no physical-device handoff. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-03 D-05: quantities are worked out in decimals, in one place (cloud session)

- Defect: a return cap was a float subtraction. With 0.1 KG of a 0.3 KG line already returned, the credit note refused "0.2" and said "Only 0.19999999999999998 can be returned". The purchase side's returnable quantity had the same subtraction.
- Fix (R-08): `utils/quantity.ts` owns quantity arithmetic: `remainingQuantity`, `subtractQuantity`, `exceedsQuantity` (half-typed text is never "over" and never throws), `stepQuantity`, `sumQuantities`, `trimQuantity`. Four `trimQty` copies are gone, and the cap travels as a string.
- Guard: `sharedOwners.test.ts` forbids `Number(qty)` arithmetic and comparisons outside `utils/quantity.ts`, allowing only sign tests. On its first run it found six more sites (debit note over-cap, invoice stock-short note, stock count step, and others), all moved.
- Fail-before: the credit note schema case, the purchase returnable case and the new `quantity.test.ts` cases.
- Gates: Jest 4179 passed across 372 suites; `tsc` and ESLint `--max-warnings=0` clean; build passed; locales in step. Bundle: `/d/[token]` route 39.5 -> 39.7, because the shared print uses the helpers (note in `bundle-budgets.json`); every other route is unchanged.
- Browser (live stack, synthetic shop, nothing issued from the browser): new `e2e/quantity-return-look.mjs`, 17/17 at 360 and 1280 px. The line says "Up to 0.2", 0.2 is accepted, and 0.25 says "Only 0.2 can be returned".
- Next: WP-05 begins with a design review for the owner. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-05: the counter editors measured, and a clipped quantity fixed (cloud session)

- Review: new `e2e/counter-editor-review.mjs` opened drafts of 1, 10 and 50 lines in the sales invoice and purchase bill editors at 360, 390, 768, 1024, 1280, 1440, 1536 and 1920 px. The findings and three layout options are in `docs/shop-ims-readiness/12-counter-editor-design-review.md`. Laptops below 1536 px get a phone card about 290 px tall per line, so a 50-line bill is about 15,000 px; at 1536 px the same bill is 3,600 px. The owner was asked to choose a layout, and nothing about the layout is built yet.
- Defect found by measuring: the purchase bill showed a weighed quantity as "6.000", and at 1536 px it did not fit its box (8 KGS lines cut out of 50). `formQty` now trims weighed quantities too. The `invoiceViewModel` case failed before. The re-run measures no cut text at any width.
- Gates: Jest 4179 passed; `tsc` and ESLint clean; build passed; the bundle gate passed with no budget change.

### 16 October 2026 — WP-03 D-04: UI composition inventoried; the reason rule has one owner (cloud session)

- D-04 is inventoried as D-04a to D-04e in `10-reuse-inventory.md`:
  - D-04a: five hand-made ⋯ menus, and an unused `UbActionSheet` whose close order is the one the khata menu found wrong;
  - D-04b: the three-character reason rule;
  - D-04c: eight void or cancel dialogs that take a reason;
  - D-04d: hand-built bordered boxes;
  - D-04e: docks, where there is no debt.
- R-09 (D-04b): `utils/reason.ts` (import-free) and `useValidationSchemas().reasonText()` replace ten dialogs and eleven schemas that wrote out 3 and 160. A guard forbids the literals, and a contract test reads the server's `VOID_REASON_MIN`/`MAX`. Both failed before the change.
- Gates: Jest 4182 passed; `tsc` and ESLint clean; build passed. Bundle: `/login/email` and `/reset-password` +0.1 KB each, because the validator hook ships there; the reason is noted in `bundle-budgets.json`.
- Owner decision: the counter editor's layout for 1024–1535 px is option A, a table with the totals below. The build is next.

### 16 October 2026 — WP-05 layout A built: the counter editors draw a table on laptops (cloud session)

- Owner's choice (decision card): option A. Below 1536 px the lines get the full width and the totals go under them. The grand total, Save and Issue/Record ride in a docked bar.
- `UbLineItemsEditor` `tableWhen="fits"` chooses table or cards by its own measured width (`minimumTableWidth`), no longer by the screen.
- Fail-before:
  - the `UbLineItemsEditor` container-fit cases;
  - `InvoiceEditor.test.tsx` "a 1280 laptop", which failed on the old page.
- Live re-measure (`e2e/counter-editor-review.mjs`):
  - a 10-line invoice at 1280 is 1,679 px (was 3,410 px), and a 50-line invoice is 4,119 px (was 14,963 px);
  - the bill gets the table at 1280 and 1440, and keeps cards at 1024 and 768, where its columns do not fit;
  - no overflow or cut text at any width;
  - Alt+N and Alt+Backspace pass on every table width.
- Regression: `sales-recovery-look` and `purchase-recovery-look` all passed.
- Gates: Jest 4186 passed; `tsc` and ESLint clean; build passed. Bundle: the sales editor routes 152.1 -> 152.4 KB for the measurement code; the reason is noted in `bundle-budgets.json`. The breakpoint hook lives in `src/hooks`, because in the design-system motion module it cost the landing page 0.9 KB.
- Still owed for WP-05: the compact supplier/context summary and timed 1/10/50-line entry evidence. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-05: compact context on the counter editors (cloud session)

- Below 1536 px the supplier details (purchase) and the date, due date and place of supply (sales) fold under "More details", with a one-line summary. A new bill or a walk-in sale opens the fold on a laptop, and an error or a duplicate warning inside forces it open; phones lacked that too.
- Fail-before: `PurchaseBillEditor.test.tsx`, two "1280 laptop" cases, and `InvoiceEditor.test.tsx` "the bill details on a 1280 laptop".
- Defect found by measuring, not by the tests: on every reopened purchase draft the fold opened itself. The page rendered one frame of an empty bill before the draft was reset into the form. `usePurchaseBillEditor` now reports `seeded`, and the page keeps its skeleton until then. The 10th line at 1280 is at 1,076 px (was 1,290).
- Environment: a session restart wiped the sandbox's PostgreSQL cluster. The local synthetic dev database was recreated (default dev role, `migrate`, `seed_all`). No real data was involved.
- Gates: Jest 4189 passed; `tsc` and ESLint clean; build passed; the bundle gate passed (sales editor routes 152.5, noted); locales in step.

### 16 October 2026 — WP-05: timed keyboard entry, and three counter defects fixed (cloud session)

- `e2e/counter-entry-timing.mjs`: walk-in invoices of 1, 10 and 50 lines keyed by keyboard alone at 1280 and 1536 and issued. Every line, the shown total and the server's grand total match (₹13, ₹535, ₹9,222), about 9 keys a line, 50 lines keyed and issued in under a minute. The table of figures is in `docs/shop-ims-readiness/12-counter-editor-design-review.md`.
- Defects found by the run, each fixed with a test that fails first:
  - the caret returned to Item after a pick, so the typed quantity reopened the search (`UbAsyncCombobox.test.tsx`);
  - an Enter before the search answered billed the previous answer's top row: K001 on lines keyed K003 and K008, ₹470 for ₹535 (`usePagedSearch.test.ts`, `UbAsyncCombobox.test.tsx`);
  - Enter with no highlighted row did nothing (line 31 of the 50-line bill).
- Reuse: the sales and purchase item cells, identical but for copy keys, are one `ItemLineCell`. Stock adjustment and price-list pinning pass `pending` too.
- Lint: the R-09 commit had left `src/utils/reason` imports out of order in eleven files, which `npm run lint` refuses; fixed (11a16c9, and the rest in 1e35b8b).
- Gates: Jest 4193 passed; `tsc` clean; ESLint clean on every file changed today (a whole-tree run exceeds the sandbox's time limit); build passed; the bundle gate passed after a measured raise noted in `bundle-budgets.json` (sales editor routes 153, purchase 152.4, two purchase first loads 390.8).
- Not claimed: the purchase bill was not timed, and no person at a real counter was timed. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-03 D-04a: one ⋯ sheet that closes before a row acts (cloud session)

- Fail-before: `UbActionSheet.test.tsx` "closes the sheet before the row acts". The design-system sheet, used by every page header's phone ⋯, closed AFTER the row's handler on a timer. So a header row that opened a dialog on a phone left two overlays, and Escape could close the wrong one. It now closes before the row acts.
- Consolidated: the khata, borrower, catalogue, team member and ledger entry menus are `UbMoreActions` / `UbActionSheet` with rows as data. Their test ids are kept. A `sharedOwners` guard fails on a feature file that pairs `MoreHorizontal` with a dialog.
- Browser (`e2e/action-sheet-look.mjs`, 360 and 1280): 14/14. The sheet sits inside the screen; after Edit or Correct exactly one overlay is open; after Escape none is. `e2e/ledger.mjs` 54/54. The library ⋯ → Edit path was seen in `date-picker-look`.
- Found on the way: `date-picker-look` and `student-dates-look` had been failing since 15 Oct, because the charge rows' ⋯ has the same test id as the header's. They now take the header's.
- Gates: Jest 4198 passed; `tsc` clean; ESLint clean on the changed files; build passed. The bundle gate passed after a measured raise noted in `bundle-budgets.json`: seven routes that draw a ⋯ grew 0.1–0.2 KB for `UbMenuList` rows. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-03 D-04c: one "say why" dialog for every void, cancel and reverse (cloud session)

- Consolidated (R-12): the seven dialogs that void, cancel or reverse with a written reason, and the library charge reversal, are `ReasonConfirmDialog`. It owns the reason rule, the caret in the reason, a confirm button that is never greyed for a missing reason, and staying open while the request runs. Each feature keeps its consequences.
- Fail-before: `ReasonConfirmDialog.test.tsx`. Three of the old dialogs greyed the button silently, and all of them closed on Escape or ✕ mid-request, so the snackbar or the refusal arrived with the dialog gone.
- Browser (`e2e/reason-dialog-look.mjs`, 360 and 1280): 12/12. Reversing a khata entry: caret in the reason, nothing red on opening, an empty reason says why and sends nothing, a written one reverses and the server's balance is zero. Screenshots looked at.
- Gates: Jest 4202 passed; `tsc` clean; ESLint clean on the changed files; build passed. The bundle gate passed after `/lending/loans/new` 135.3 -> 135.8 (measured a few bytes over), noted in `bundle-budgets.json`. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-03 D-04d: one bill pick list, and a receipt number that broke on a phone (cloud session)

- Consolidated (R-13): applying an advance, allocating a payment and applying a deposit share `UbPanel as="ul"` and `BillPickRow`, where each had hand-built the same bordered list and row. Fail-before: `UbPanel.test.tsx` (a `ul` panel holds only list items) and the new `sharedOwners` guard, which named all three files.
- Defect found by looking (`e2e/pick-list-look.mjs`, 360 and 1280): on a phone the receipt sheet split its own number, "RCT/26-" over "27/0001". The check failed first (2 lines) and now passes; 14/14.
- Left as they are, with the reason recorded in `10-reuse-inventory.md`: the paid-now drawers' mode rows, and the library and lending card rows.
- Gates: Jest 4205 passed; `tsc` clean; ESLint clean on the changed files; build passed; the bundle gate passed with no budget change. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-06: the Shop dashboard reviewed before any build (cloud session)

- New `e2e/dashboard-review.mjs` measured `/dashboard` at 360 to 1920 px with a synthetic kirana. Nothing overflows; one long name is cut with an ellipsis at 360. Findings and three arrangements are in `docs/shop-ims-readiness/13-shop-dashboard-design-review.md`.
- Checked on the live server: "To collect ₹2,100 from all your customers" opens a ₹1,800 list (a supplier paid ahead was counted), and "To pay ₹700 to all your suppliers" opens an empty one (it was a customer's advance). Overdue reads a status set nightly, so a bill entered today with a past due date is not counted until 00:15, and its list defaults to this financial year.
- The owner is asked to choose A, B or C. Nothing is built yet. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-06: the Shop dashboard as two books side by side (cloud session)

- The owner chose layout A. Built in 927e52d.
- Fixed and checked on the live server: To collect ₹3,296 equals the customer list ₹3,296, and To pay ₹3,150 equals the supplier list ₹3,150. Advances are shown as their own line. Fail-before: `test_the_dues_tiles_add_up_to_the_lists_they_open` and the rewritten AC-1 in `test_dashboard_reconcile.py`.
- Found by looking: once the title became the business name, "Shree Ganesh Kirana Stores" was cut to "Shree Ganesh Ki…" at 360 and 390 px. It now wraps; the component test failed first.
- `e2e/dashboard-review.mjs`: no overflow at any of eight widths; the Today, Customers, Suppliers and Needs attention regions each appear once; More → Record payment opens the form at 360. One long customer name is still cut at 360.
- Gates: Jest passed (full suite 4209 before the title fix, dashboard file 19/19 after); `tsc` clean; ESLint clean on the changed files; i18n in step; build passed; bundle gate passed (/dashboard 72.5 of 88 KB). Backend reports and golden tests passed. `apps/dues/tests/test_run_scale.py` fails at about 139 s against 60 s in this sandbox on the previous commit too.
- Still open: Overdue from the nightly status, Cash in hand mixing books, one failure blanking the page, activity by typed time. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-06: Overdue decided on the day (cloud session)

- Fixed (bb6dd2a): Overdue read the stored status set nightly at 00:15, on the dashboard and in both bill lists' Overdue tab. It is now a stored `overdue` or an open bill due before today, from one helper. Fail-before tests: the dashboard figures, `GET /sales/invoices?tab=overdue` and `GET /purchases/bills?tab=overdue` without `refresh_overdue()`.
- Fixed: the overdue link opened the list on this financial year, so last year's unpaid bill dropped out. The link now carries the range from the oldest overdue bill's date.
- Looked (`e2e/dashboard-review.mjs`, which now seeds a bill dated 30/03/2026): the figure and the list at its link agree, 3 bills · ₹2,160.00, at 360 and 1280; the list shows "30 Mar 2026 – 16 Oct 2026" and all three rows (screenshots `360-overdue-list.png`, `1280-overdue-list.png`).
- Gates: backend sales, purchases, payments, reports and golden tests pass; Jest for reports, sales and purchases 363/363; `tsc` clean; ESLint clean on changed files; build and bundle gate passed with no budget change. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-06: Cash in hand is the Shop's drawer (cloud session)

- Fixed (09e66a3): Cash in hand, the day book and the cashbook added cash from every book. On the live stack an Udhaar-book "You got ₹300, cash" moved the Shop's drawer from ₹250 to ₹550. Now all three read only the Shop's money; the tile equals the cashbook's closing cash (₹250 = ₹250) with that Udhaar line present. Fail-before: `test_cash_in_hand_is_the_shops_drawer_alone` (1940.00 against 390.00).
- The golden main-bucket file was not regenerated: `cash_in_hand` keeps its every-book value and the Shop reads the new `shop_cash_in_hand`.
- Tests that changed meaning are listed in the commit message (cashbook receipts, has_any, the library's deposit cash).
- Gates: backend reports, expenses, library, lending, imports, sales, payments, ledger, purchases and architecture tests pass; Jest reports 145/145 with the new service test; `tsc` clean; ESLint clean; build and bundle gate passed. Railway deployment and 9/10 readiness are NOT claimed.

### 16 October 2026 — WP-06: each dashboard part fails alone (cloud session)

- Fixed (85a4e3a): one failing figure was a 500 and a blank home screen. Each part is computed alone; a failed one is named in `unavailable`, every other figure still arrives, and the payload is not cached. Fail-before: selector, API and page tests.
- Looked: `e2e/dashboard-review.mjs` stages a failed supplier-bills and activity part by rewriting the response. At 360 and 1280, three panels say "This section could not load." with Try again, "Nothing needs you" is not shown, and every other panel is intact (`360-part-failed.png`, `1280-part-failed.png`). Playwright's route needed `serviceWorkers: 'block'`: the app's service worker made the request invisible to it.
- Gates: backend reports and golden tests pass; Jest reports 144/144; `tsc` clean; ESLint clean; build and bundle gate passed. Railway deployment and 9/10 readiness are NOT claimed.

### 17 October 2026 — WP-06: activity rows carry their own date (cloud session)

- Fixed (6315539): a bill dated 40 days ago read only "16/10/2026, 16:13" in Recent activity. Rows dated another day now read "Dated 31/03/2026 · entered 17/10/2026, 00:20". Fail-before: selector and view-model tests.
- Found by looking at the first build: the entered time used the device clock, so on a UTC device every record entered after midnight IST looked backdated. It now uses the shop's clock (`formatTimestampInTz`, its own module so three unrelated routes stay in budget).
- Gates: backend reports and golden tests pass; Jest dates and reports pass; `tsc` clean; ESLint clean; i18n in step; build and bundle gate passed. Railway deployment and 9/10 readiness are NOT claimed.

### 17 October 2026 — WP-06: Cash in hand says the day it counts from (cloud session)

- Fixed (8b42662): a new Shop whose first cash record was a ₹150 tea expense showed "−₹150 since you started using YourKhata", as though the till were short. No opening cash is recorded, so the tile now names the first day the Shop's own cash moved ("since 17/10/2026") and a negative figure reads "More cash paid out ₹150.00 than came in, since 17/10/2026". A UPI receipt or the Udhaar book's cash does not start the count. Fail-before: selector, service, view-model and page tests.
- Looked: `e2e/dashboard-review.mjs` now also signs up a new shop with one customer and one tea expense; at 360 and 1280 the Today row reads as above (`360-new-shop-cash.png`). The kirana's tile reads "₹250.00 since 17/10/2026" and still equals the cashbook.
- Gates: backend reports, ledger, expenses and payments tests pass; Jest 4222/4222; `tsc` clean; ESLint clean; i18n in step; build and bundle gate passed. Railway deployment and 9/10 readiness are NOT claimed.

### 17 October 2026 — WP-06: orders waiting on someone in Needs attention (cloud session)

- Built (bbd36a7): customer orders to deliver and bill, challans not billed and purchase orders waiting for goods are rows in Needs attention with count, amount and the oldest's age; each opens its list's waiting tab from the oldest one's date. Fail-before: selector, service and page tests.
- Looked: `e2e/dashboard-review.mjs` seeds one of each. At 360 and 1280: "1 customer order to deliver and bill · ₹700.00" = list 1 · ₹700.00; "1 challan not billed yet · ₹450.00" = list 1 · ₹450.00; "1 purchase order waiting for goods · ₹840.00" = list 1 · ₹840.00. Rows wrap on a phone, nothing cut. The purchase order had the supplier bill's truck icon; it has its own now.
- Found by the architecture suite: 85a4e3a had broken rule D8 (the dashboard selector opened `transaction.atomic` and used `.update(`). Fixed here; the view passes the savepoint in.
- Gates: backend reports, ledger, purchases, sales list and architecture tests pass; Jest 4224/4224; `tsc` clean; ESLint clean; i18n in step; build and bundle gate passed. Railway deployment and 9/10 readiness are NOT claimed.

### 17 October 2026 — WP-06: due-this-week link and long names (cloud session)

- Fixed (e7d85c6): the Suppliers panel's "due this week" opened every unpaid bill. The bill list now takes `due_from`/`due_to`, the link carries the week and the oldest bill's date, and the list shows "Due 17/10/2026 to 24/10/2026 ×" which drops the window in one tap. Fail-before: purchases list test (reproduces the dashboard's count and amount), view-model and page tests.
- Fixed (e7d85c6): "Suresh Kumar General Store, Station R" cut mid-word at 360 px. Names on the dashboard wrap to two lines. Fail-before: page test.
- Looked: `e2e/dashboard-review.mjs` seeds a bill due in three days and one in ten; at 360 and 1280 the figure reads 1 · ₹210.00 and the list it opens reads 1 · ₹210.00 with the chip (`*-due-week-list.png`). The measuring check finds nothing cut at any of the eight widths.
- Gates: backend reports, ledger, purchases and architecture tests pass; Jest 4228/4228; `tsc` clean; ESLint clean; i18n in step; build and bundle gate passed (four routes raised by measured + 0.5, noted). Railway deployment and 9/10 readiness are NOT claimed.

### 17 October 2026 — WP-06: period chips on the Shop home (cloud session)

- Built (72ceb6c, owner chose "Four presets"): Today, Yesterday, This week (from Monday) and This month switch net sales and money received; each opens the bill list or the payments list over the server's dates. Balances stay as of today. Fail-before: selector, service and page tests.
- Looked: `e2e/dashboard-review.mjs` taps each chip at 360 and 1280 and compares with the lists: This week ₹1,276.00 sales = bills ₹1,276.00 − returns ₹0.00, ₹900.00 received = 2 payments in ₹900.00; This month ₹1,696.00 and ₹900.00, likewise. Nothing cut at any of the eight widths (`*-period-week.png`). On a 360 px phone the four chips wrap to two lines.
- Gates: backend reports, ledger, purchases and architecture tests pass; Jest 4231/4231; `tsc` clean; ESLint clean; i18n in step; build and bundle gate passed (/reports/profit raised by measured + 0.5, noted). Railway deployment and 9/10 readiness are NOT claimed.

### 17 October 2026 — WP-07: item cost, selling price and margin (cloud session)

- Built test-first (e637f67) on the recommended answers (margin on the last purchase price; staff keep seeing bill costs). The owner's two cards are still open. Details: docs/shop-ims-readiness/14-item-pricing-design-review.md, "Built".
- Server: a member who cannot see costs can no longer set an item's purchase price (400); list and lookup rows carry `gst_percent` for those who see costs. Fail-before: two API tests. Customer bills are checked for any cost figure or cost/margin/profit key.
- Item form: Purchase price and Margin % beside Selling price for members who see costs. Typing a margin sets the price, typing the price rereads the margin, and a new cost keeps a margin already held. "Selling below cost" is shown at a loss and 100% or more is refused. Create no longer sends a cost for members who cannot see costs. The item page shows the margin. The picker shows "Usual price · Cost · margin".
- Found by testing the form: typing a cost "45" passed through "4", whose margin took hold and priced the item at ₹562.50. The cost box now uses the margin as it was when the merchant entered it.
- Found by looking (`e2e/item-pricing-review.mjs`, 360/768/1280/1920):
  - The item page had no margin row.
  - The picker cut the price line before the margin.
  - On a phone, every header action in a ⋯ sheet closed the sheet and did nothing: Edit, Adjust stock and Archive on the item page, and the same on 13 screens since ce30567. The shared sheet closed in the capture phase, which a real tap flushes before the button's handler. It now closes after the row acts. Fail-before: a unit test that stands in for the browser's checkpoint.
- Not changed: the stock report's potential sale value for GST-inclusive prices. RPT-06 BR-10 defines it as quantity × selling price, so it needs a Part 43 change request first.
- Gates: backend inventory, sales, reports, purchases and architecture tests pass; Jest 4264/4264; `tsc` clean; ESLint clean; i18n in step; build and bundle gate passed (the bill and order editors and the price list editor raised by measured + 0.5 for the picker's price line, noted). Railway deployment and 9/10 readiness are NOT claimed.

### 17 October 2026 — WP-07: a new party from one phone contact (cloud session)

- Built test-first (bd44f6d): "Choose from phone contacts" on the party form that Customers, Suppliers and the Udhaar book share. One chosen contact fills Name and Mobile; nothing is saved until Save, so the server's duplicate check still decides. Shown only when adding a party and only where the browser can pick contacts (PTY-07 FR-10, FR-14). Cancelling the picker leaves what was typed. Names lose stray and doubled spaces. Fail-before: three party form tests and one phoneContacts test.
- Library admission and the new loan now use the same shared `PhoneContactButton`, and still say "not supported in this browser" with a disabled button.
- Looked: `e2e/party-contact-review.mjs` at 360/768/1280/1920 on /customers, /suppliers and /khata. No real contacts were read: desktop Chromium has no picker (the button is absent), and the phone pass uses a fake picker with one made-up contact. Name "Asha Devi" and mobile 9876543210 are filled, nothing is cut, the page fits, and no party was created (0 → 0).
- Gates: Jest 4268/4268; `tsc` clean; ESLint clean (the full run took 22 minutes in this sandbox); i18n in step; build and bundle gate passed (sixteen routes raised by measured + 0.5 for the parties catalogue's two strings, noted). Railway deployment and 9/10 readiness are NOT claimed.

