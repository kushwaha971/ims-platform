# Onboarding, demo and SaaS-quality audit — 11 Oct 2026

Asked for by the owner in the project thread: fix the demo's voice and sync,
make the demo problem-led and not tied to one industry, find out why Library and
Lending could not be chosen at sign-up, and review readiness for module-based
subscriptions. This is what was found, what was changed, and what was checked.

Companion documents: `docs/DECISIONS.md` DEC-016 (the sign-up decision),
`docs/MODULE-SUBSCRIPTIONS.md` (the subscription review), `e2e/demo/README.md`
(how the film is made), `docs/demo/` (storyboards and transcripts).

## 1. Findings

Priority: **P0** blocks a customer from using what was sold; **P1** misleads or
loses them; **P2** is polish or risk.

| # | Finding | Root cause | Impact | Priority | State |
| --- | --- | --- | --- | --- | --- |
| 1 | Library and Lending could not be chosen at sign-up | There was no module choice at all. Step 1 asked for one of nine kinds of *shop*; `POST /tenants` wrote the shop preset into `enabled_modules` and took no other input | A library or a lender had to sign up as a shop, find the business menu, add their app and turn the Shop off | P0 | Fixed |
| 2 | Finishing setup would have undone a non-shop choice | `apply_preset` replaced the whole of `enabled_modules` with the shop preset at step 4 | Even with (1) fixed, pressing Finish turned a library back into a shop | P0 | Fixed |
| 3 | Every business silently had the Shop | Same as (1) | Menus full of things a library never uses; wrong from the first invoice if modules are ever billed | P1 | Fixed |
| 4 | The sign-up copy told people to work around it | Hint under the shop tiles: "A library, lending or another app sits beside the Shop: add it from the business menu" | The product documented its own gap | P1 | Fixed |
| 5 | Setup always ended on the Shop dashboard | `router.replace(ROUTES.DASHBOARD)` on completion, ignoring the server's `landing` | A library would have landed on a screen it cannot open | P1 | Fixed |
| 6 | The demo seed switched modules on behind the API's back | `manage.py shell` editing the plan, the partner and the tenant | The recordings showed businesses no merchant could have created | P1 | Fixed: the seed signs up with `apps` |
| 7 | Demo voice out of step with the screen | **The recorder, not the script.** Playwright's `recordVideo` writes every frame the browser sends at least once into a 25 fps file; a moving pointer sends more than 25 a second, so the file runs long. Measured on the published films: 4–9% long, the picture **12–14 s behind the voice** by the end of a take | The complaint, exactly | P0 | Fixed: frames are kept with the browser's own timestamps |
| 8 | Voice and picture were also coupled the wrong way round | Each line was laid at a time worked out beforehand; when a page took longer than a sentence the voice ran on | Drift even on a perfect tape | P1 | Fixed: a line starts when its step starts, and waits for the one before |
| 9 | Voice too fast | 168 words a minute, 0.35 s between lines | Hard to follow while also watching a screen | P1 | Fixed: 138 wpm, a breath between sentences, 0.8 s between lines, 1.3 s between scenes |
| 10 | Demo was a module tour | Chapters were Sign up / Shop / Library / Lending | A first-time viewer learned where buttons are, not why they would want them | P1 | Fixed: six problems, each as problem → moment → steps → benefit |
| 11 | Demo read as a shop product with two extras | Same | Contradicts a multi-module product | P1 | Fixed: chapters are business problems (credit, bills, stock, monthly fees, daily collections), and the film opens with choosing only what you need |
| 12 | Four films to keep in step | English and Hindi, each in two layouts | Twice the recording and review for every change | P2 | English film withdrawn; one Hindi film with English subtitles |
| 13 | A still card in the film was a loading skeleton | `page.setContent` straight after sign-in was replaced by the app's redirect | One "problem" card missing from a take (caught in review, never published) | P2 | Fixed |
| 14 | One fixed bundle per business | `Tenant.plan` is a single plan with a module list; no tiers, no time, no per-module state | Per-module pricing, trials and upgrades cannot be expressed | P1 for the business model, not for today | Reviewed, not built — `docs/MODULE-SUBSCRIPTIONS.md` |
| 15 | Only one plan limit is enforced | `LIMIT_KEYS` is `max_users` and `storage_mb`; the second has no enforcement point | Feature limits per module have nowhere to live yet | P2 | Reviewed, not built |
| 16 | The app list reads Library, Lending, Shop | Registry order (`order` on `AppSpec`) | The app most businesses want is last | P2 | Left: it is the business menu's order too; changing one number changes both — owner's call |
| 17 | Films narrate in Hindi over English screens | The recorder's selectors are English labels | A Hindi speaker hears Hindi and reads English buttons (the film ends by switching the app to Hindi) | P2 | Open |
| 18 | The voice is a computer voice | macOS `say`; a natural voice needs a narrator or a paid service | Sounds synthetic, though now paced | P2 | Open — files drop in per line, see `e2e/demo/README.md` |

### What was *not* wrong (checked, so nobody fixes it twice)

- **Registration.** Library and Lending are in the app registry with correct
  anchors, capabilities and home paths.
- **Plan and partner.** Both are on the default plan and the default partner
  since the release migrations of 10 Oct.
- **The release gate.** Both are released; Gym and Hotel are not, and are not
  offered at sign-up (tested).
- **Adding or turning off an app after setup.** Already in the business menu
  (`TenantSwitcherMenu` → `POST /tenants/current/apps`), with a refusal while
  work is still open. Sign-up now goes through the same service.
- **Enforcement.** A business without an app is refused its API (403).

## 2. What changed

### Onboarding (commit "A new business chooses what it runs at sign-up")

- `GET /onboarding/apps` — the apps a new business may choose: registered ∩
  released ∩ default plan ∩ partner. The screen draws from this only.
- `POST /tenants` takes `apps`. Absent means the Shop, as before.
  `business_type` is required only with the Shop.
- Each chosen app is switched on through `business_apps.set_app_running`, the
  business menu's own service.
- `apply_preset` governs only the shop's capabilities, for a business that runs
  the Shop.
- `PATCH /tenants/current {apps}` until setup is finished (owner only).
- The tenant payload carries `apps`.
- Step 1: "What do you want to use?" — checkboxes, nothing pre-ticked, one line
  on what each is for; the kind-of-shop tiles appear only with the Shop.
- Step 4 says the choice back. Finish lands in the chosen app.

### Demo

- `script.json` rewritten: 15 scenes, 49 lines, Hindi with a line-for-line
  English translation.
- `voice.mjs`: slower, with pauses.
- `record-demo.mjs`: timestamped frames instead of `recordVideo`; `cue(n)`
  starts a line when its step starts.
- `build-demo.mjs`: builds each scene from its frames; Hindi captions and
  English subtitles from the same cue times; removes withdrawn films on publish.
- Landing page: one film, no language switch; the track matching the page's
  language is on by default; chapters and transcript in both languages stay in
  the HTML; one `VideoObject` in the structured data.

## 3. Validation

### Sign-up, through the real screens — `e2e/onboarding-apps.mjs`

Five combinations × a 1280 px desktop and a 360 px phone, each a fresh mobile
number and OTP: **186 of 186 checks**.

| Chosen | Business runs | Lands on | Other apps addable later | Shop API |
| --- | --- | --- | --- | --- |
| Shop | shop | `/dashboard` | library, lending | allowed |
| Library | library | `/library` | lending, shop | 403 |
| Lending | lending | `/lending` | library, shop | 403 |
| Library + Lending | library, lending | `/library` | shop | 403 |
| All three | all three | `/library` | — | allowed |

Each run also checks: all three apps offered, no hidden app offered, nothing
pre-ticked, Continue refused with nothing chosen, the shop question shown only
with the Shop, the last step naming the choice, no page wider than the screen
and no tile text cut off.

### Server — `apps/platform_app/tests/test_onboarding_apps.py` (20 tests)

One app, several, none, unknown, unreleased; no `apps` still means the Shop;
finishing keeps the choice; a changed mind before finishing leaves nothing
behind; the choice is refused after finishing; **staff cannot change it (403)**;
anonymous cannot read the offer (401); the change is audited.

### Screen — `OnboardingStepPageContent.test.tsx` (9 new), schema and service tests

Includes: an app this client has never heard of still gets a tile, and no offer
from the server falls back to the Shop without asking.

### Demo — one frame per spoken line

For each cut, a frame at 80% of every caption was read against its words: 49 of
49 lines on the desktop cut and 49 of 49 on the phone cut show the step being
described. Both recordings completed with no missed step (a missed step fails
the build).

### Gates

Final run, 11 Oct 2026, on the committed tree:

| Gate | Result |
| --- | --- |
| Frontend type-check, lint, translations check | pass |
| Frontend tests | 3,623 of 3,623 (314 suites) |
| Production build and bundle budgets | pass (19 ceilings raised by the measured + 0.5 rule; the note is in `bundle-budgets.json`) |
| Backend suite | all pass except two wall-clock speed tests — `dues/test_run_scale` (5,000 schedules under a minute) and `library/test_verification` (20,000 copies under five seconds) — which failed while the film recorder was using the machine and **pass when run alone**. Neither touches code changed here |
| Landing page, played on the built site | desktop plays the desktop cut, a 390 px phone the phone cut; no film or caption file is requested before play; English subtitles on by default on the English page; no horizontal overflow |

The full e2e harnesses of `CLAUDE.md` (journey, parties, ledger, …) were **not**
re-run: they stop and restart the servers on :3000 and :8000, which were in use.

## 4. Open, and whose call it is

- **Owner:** the order of the apps on the choice (16); whether to pay for a
  natural voice (18); whether an English film is wanted again.
- **Next engineering step if wanted:** Hindi screens in the film (17); steps 1–2
  of the subscription plan, which need no payment provider.
- **Deployment:** nothing here was deployed. Production needs `migrate` (no new
  migration in this change) and a rebuild of the frontend; the films are static
  files under `frontend/public/media/landing/`.
