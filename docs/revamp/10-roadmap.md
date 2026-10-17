# 10 · Phased roadmap (planning only)

Status: **plan, not authorisation.** No phase starts without the owner's approval in [12](12-decision-log.md). 17 Oct 2026.

| Phase | Scope | Deliverables | Depends on | Main risks | Done when |
|---|---|---|---|---|---|
| **1 · Audit and baselines** | measure what 01 and 05 assume | `e2e/perf-app.mjs` results at 390/1280 throttled; tap-to-first-change on 10 navigations; waterfall of cold opens; production SW flag checked; Library/Lending contract snapshots recorded; Lending Today and Library members timed on a seeded book | none | measuring on a fast laptop and calling it done | baseline file in `docs/performance/` with every metric in 05 §5 filled; H1–H8 each marked proven or disproven |
| **2 · Screen specs** | every screen, waves 2 and 3 | 07-screens 08–12 filled with the template | Phase 1 findings | specs drifting from code | every route in 01 §2 has a filled section |
| **3 · Design review** | rubric per module, refine | 09 updated per module; visual references for new patterns | Phase 2 | score inflation | every module > 8.6 with §5 caveats listed; owner approval recorded |
| **4 · Shared foundation** | 06 §2–3 | `loading.tsx` families, `RouteProgress`, `useNavigate`, `useAsyncAction`, `UbForm` guard, pressed states, `UbBottomNav` action item, App sheet, sidebar app tree, notifications popover/page, `/account` | Phases 1, 3 | breaking Library/Lending screens through shared components | all gates green; desktop-unchanged passes for untouched screens; tap-to-first-change ≤ 100 ms measured |
| **5 · Shop and Udhaar** | screens per 07 wave 2 | redesigned screens; TV-01, TV-02 server fixes (separately approved) | Phase 4 | money wording regressions | e2e journeys green; figure-sum checks; 320 px Hindi; user script with 5 shopkeepers |
| **6 · Library and Lending (UI only)** | presentation layer only | redesigned screens behind the same services, slices and endpoints | Phase 4 | any behaviour change | contract snapshot diff empty; figure parity 100%; existing tests 100%; staged with one real customer's copy of data, read-only |
| **7 · PWA and performance** | fixes F1–F8 in 05 §7, one at a time | each fix with before/after numbers; SW on in production; install and update prompts; `start_url` landing | Phase 1 baseline | caching stale money figures; SW update traps | every 05 §5 target met or the gap explained; no regression in any e2e |
| **8 · QA and rollout** | 11 in full | regression run, axe, device runs, staging sign-off, staged rollout per app, rollback drill | all | rollout to live Library/Lending customers | 11's exit criteria met; rollback tested |

## Order of value

Phase 4's feedback pieces (route skeletons, pending states, submit guards) answer the reported problem directly and touch every module through shared code, so they come first after measuring. The App button and notifications follow. Module screens come after the foundation, Shop and Udhaar before Library and Lending because the latter are frozen and need the most proof.

## Rollout shape

- Feature flag per app shell (`feature_flags` in `auth/me` already exists) so Library and Lending customers get the new presentation only when their app's phase passes.
- Old and new screens cannot both write differently: they share services and slices, so a flag only changes presentation.
- Rollback = turn the flag off; no data migration is involved in any UI phase.
