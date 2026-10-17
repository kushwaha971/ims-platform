# 11 · QA, regression and rollout checks

Status: **plan**, 17 Oct 2026. Uses the existing gates in CLAUDE.md; adds only what the revamp needs.

## Existing gates (must stay green every phase)
- `backend`: `python3 -m pytest -q`.
- `frontend`: `type-check`, `lint`, `npm test`, `build`, `bundle:check`, `i18n:split`, `i18n:check`.
- e2e against a live stack served by `e2e/serve-api.sh` and `e2e/serve.sh`: journey, security, credentials, parties, tags, credit, ledger, statement; onboarding-apps; offline; desktop-unchanged; the `--shots` sweeps.

## Added for the revamp

| Check | What it proves | Phase |
|---|---|---|
| `e2e/perf-app.mjs` | 05 §5 metrics, before and after | 1, 7 |
| Double-tap script | every money form (receive payment, bill save, purchase record, Udhaar entry, Library fee/deposit, Lending collect, loan create) fires exactly one write when tapped twice fast and when retried after a forced failure | 4 |
| Navigation feedback check | every bottom tab, sidebar row and list row shows a pressed state within one frame and a pending state within 150 ms on a throttled profile | 4 |
| Keyboard overlap check | on 360 × 640 with the keyboard open, no docked bar is covered and the bottom nav is hidden | 4 |
| Measuring checks | `scrollWidth` vs viewport and every text node vs its box at 320/360/390/768/1280, both themes, English and Hindi (the LED-02 lesson) | every UI phase |
| Contract snapshot | Library and Lending request/response shapes unchanged | 6 |
| Figure parity | every figure on old and new Library/Lending screens equal on a seeded book | 6 |
| App switching | 1-app, 2-app and 4-app people; switch with unsaved form; deep link to an app you don't have; place kept per app | 4 |
| Notifications | popover and page; unread count; mark all; open cross-app item | 4 |
| Session expiry mid-form | sign in again returns to the screen; draft kept where drafts exist | 4 |
| Accessibility | axe at 390 and 1280 both themes; TalkBack pass on Android; large text 200% at 320 px | 3, 8 |
| Devices | one low-end Android (D-06), one iPhone, installed PWA, weak signal; 9-task script timed | 1, 8 |
| Data volume | 2k parties / 100k entries (existing scale seed); Library 2k members; Lending 3k loans | 1, 7 |

## Exit criteria for rollout (Phase 8)
1. Every existing gate green.
2. Every added check green, or a written exception the owner accepted.
3. Contract diff empty and figure parity 100% for Library and Lending.
4. Performance targets met or the gap shown with numbers.
5. Rollback drill done on staging: flag off restores the old screens with no data change.
6. Staged rollout per app: internal → one friendly customer per app → all, with a watch period between.
