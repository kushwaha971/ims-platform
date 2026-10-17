# 03 · Product goals and design principles

Status: **draft for owner approval**, 17 Oct 2026.

## Goals, and how each is measured

| # | Goal | Measured by | Target |
|---|---|---|---|
| G1 | Every tap answers at once | time from tap to the first visible change, on the reference phone | ≤ 100 ms for 95% of taps |
| G2 | No action is done twice by accident | duplicate writes in a double-tap test across every money form | 0 |
| G3 | The installed app feels like an app | installed-PWA checklist (§ 05-perf, P-checklist) | all items pass |
| G4 | Screens open quickly on a cheap phone | INP and LCP on app routes, throttled reference profile | INP ≤ 200 ms; LCP ≤ 2.5 s |
| G5 | Anyone can find their way | 9-task user script (mobile-redesign/06) with 5–8 shopkeepers | ≥ 8 of 9 tasks unaided |
| G6 | Nothing that works today breaks | regression suite, frozen-contract tests for Library and Lending | 100% pass, 0 API contract diffs |
| G7 | Money is never ambiguous | wording review: every figure names its book and direction | 0 figures without a book |

Targets G1 and G4 are set before measuring. Phase 1 takes the baseline; if the baseline is far off, the targets stay and the plan gets longer, not the other way round.

## Principles

These keep the direction already agreed (Counter Mode design page, `docs/DESIGN-SYSTEM.md`) and add what this revamp needs.

1. **Answer every tap.** Pressed state on touch, then progress in the control that was tapped, then the result. No tap is silent. (G1)
2. **One tap, one action.** A control that starts a write locks until the server answers; a retry reuses the same request key. (G2)
3. **Show the shape, then the data.** Skeletons match the final layout; nothing jumps when data arrives. Skeletons are not a cover for slowness; they come with the speed fixes, not instead of them.
4. **Each app keeps its own money** (DEC-019). Every figure says which book it reads. Customers and suppliers are separate; nothing nets without an explicit settlement.
5. **Plain words.** Everyday English and simple Hindi; no codes, no cut words, no jargon. Lending says Lent / Collected, Library says Fee / Paid, only the Udhaar book says You gave / You got.
6. **Phone first, not phone only.** Phones get lists, cards and sheets built for them; desktop gets tables, side panels and keyboard shortcuts. Neither is the other one squeezed.
7. **Same parts, different shapes.** One design system and one set of components; each app arranges them for its own work. Library is seats and fees, Lending is loans and collections, and they should look like that.
8. **Library and Lending keep their behaviour.** Only presentation changes. Their API calls, rules and numbers are fixed (02).
9. **Measure before claiming.** No speed claim without a before and after number; no safety claim without the regression run.
10. **Reuse before building.** A new component needs a reason the existing one can't serve (06).

## Visual direction (kept)

- Peacock teal `#0E7C86` for navigation and selection; marigold `#F59E1B` with dark ink for the one main action per screen; semantic green and red only for money in and out.
- White page background with a dark teal sidebar (owner, 17 Oct 2026, Counter Mode page v5). This changes the warm `#FBF8F4` ground in `tokens/light.css`; recorded as R-DEC-02 in 12.
- **The existing logo stays** (R-DEC-06): `UbLogo` and `frontend/public/brand/yourkhata-*.svg`, used by DESIGN-SYSTEM.md §7. On the dark teal sidebar the teal mark sits on a white rounded tile (36 px tile, 28 px mark), because teal on dark teal disappears; the mark itself is never recoloured or redrawn (owner, 17 Oct 2026).
- Plus Jakarta Sans and Mukta; 40 px inputs, 44 px touch areas on phones, 12 px between neighbouring phone targets.
- Motion: 90–360 ms with the existing easing tokens; nothing moves for decoration; `prefers-reduced-motion` turns movement off.
