# 06 — Implementation plan and validation

Nothing here is started. It is the plan to follow **after** the direction is
approved.

## 1. Decisions this proposal asks the owner to change

Three recorded owner decisions in `docs/DESIGN-SYSTEM.md` §3 conflict with the
proposal on phones. They are not changed silently; each needs a yes.

| Recorded decision (23 Sep 2026) | Proposal, phones only | Why |
|---|---|---|
| "The page header is ONE row at every width … actions pass `iconOnly="mobile"`" | Phone header actions become **one ⋯ sheet with words**; the primary action becomes the FAB | Finding A3: 4–6 unlabelled squares per list screen |
| Khata: the pair sits under the title, and the dock appears **only after it scrolls away** — "the dock is not a second permanent copy" | The pair is **docked permanently** and is not repeated under the title | Finding A9: the most frequent action starts at the top of the screen |
| `UbFab` "gallery only until a screen has no header room" | The FAB is placed on list tabs | Follows from the first row |

And one visual change not covered by a recorded decision: **You gave red, You
got green** (today indigo and grey).

## 2. Keeping desktop exactly as it is

**Rule: below `lg` is the mobile layer; at `lg` and up, the DOM, CSS and
behaviour of every route are unchanged.** `lg` (1024) is already where the
rail appears, so the line exists today.

How each kind of change is isolated:

| Change | Technique |
|---|---|
| Shell (nav bar, app bar, More) | New components rendered inside `UbAppShell` with `lg:hidden`, next to the existing `lg:flex` rail and top bar. The desktop elements are not edited. |
| Small layout differences (a summary line instead of the stats box) | Both rendered, `lg:hidden` / `hidden lg:block`, when the duplicated markup is small and has no state |
| Structural differences (header toolbar → ⋯ sheet, inline filters → filter sheet) | A `useIsMobileLayer()` hook over the existing `useMediaQuery` (no second listener), **rendering the desktop tree by default on the server** and swapping after hydration below `lg` — so desktop never sees a flash and its HTML is byte-identical |
| Shared component gains a mobile behaviour | An explicit prop or a mobile-only sibling component; never a change to the default. A shared component's desktop rendering is covered by its existing tests, which must pass unchanged |
| Business logic | Untouched. Same slices, thunks, services, hooks (`usePartyList`, `usePartySearch`, `useItemSearch`), same URLs and URL filters |
| Bundle | Sheets and the More list are `dynamic()` (the PTY-01 / LED-03 lesson). `UbBottomNav` and the app bar are the only shell additions and must stay under the `sharedApp` budget, or the budget change is argued in `bundle-budgets.json` like every previous one |

**Proof that desktop did not move**, run on every PR of this work:

1. `node e2e/desktop-unchanged.mjs` (new): screenshots every MVP route at
   1280 × 800 and 1440 × 900, light and dark, English and Hindi, on `dev`
   and on the branch, from the same seeded book, and compares the PNG bytes.
   Any difference fails with the route and width. No new dependency: two
   Playwright screenshots of the same build compare equal byte-for-byte.
2. The existing `a11y-desktop` sweep and every existing e2e harness at 1280.
3. A test that every new mobile-only component's root carries `lg:hidden`
   (the same shape as `designSystemGuards.test.ts`).

## 3. Phases

Each phase is one reviewable PR to `dev`, following the house loop: **review,
build, look, report** — and the measuring checks (page `scrollWidth`, every
text node against its box) at 360, 390, 768 and 1280.

| Phase | Scope | Done when |
|---|---|---|
| **0. Decide** | Owner answers §1; Hindi tab labels from the translator | — |
| **1. Shell** | `UbBottomNav`, `UbMobileAppBar` (tab/home/detail/task), `UbMoreList`, manifest `bottomNav` flags (Shop dashboard, Lending routes), badges; ☰ drawer removed below `lg` (its sheet code stays for tablets in portrait if the owner wants it, else deleted) | Every destination reachable from the nav or More at 390; desktop byte-identical |
| **2. Lists** | `UbSummaryLine`, `UbFilterButton` + filter sheet, `UbActionSheet` for header actions, `UbLoadMore` below `md`, FAB; applied to Parties, Bills (with the type switcher), Items | Same network requests as today for the same filters (the PTY-02 lesson: assert the network, not the chips) |
| **3. Khata** | Docked gave/got, balance block, pills, row tap → entry detail sheet, entry sheet rework (`UbAmountField`, segmented direction, single Save), snackbar Undo (the FR-12 action descriptor) | `e2e/ledger.mjs` and `credit.mjs` green; their `--shots` sweeps updated |
| **4. Forms** | Full-screen task frame, `UbDisclosure summary`, docked total; new bill, add party, purchase bill, payment, expense; `UbSuccessScreen` | `e2e/journey.mjs` sale path green at 390; discard / draft path tested |
| **5. Home** | `UbHeroPair`, strip, `UbQuickActions`, `UbAttentionList`, sparkline; Insights screen for the existing charts | Every number on Home matches the dashboard API |
| **6. The rest** | Reports, aging, statement, settings index, team, cashbook, payments, stock, imports, search overlay | `a11y-sweep` covers every new screen |
| **7. Library, Lending** | Tabs, FABs, seat grid, fee queue, collect | Each app's own e2e |

Typography (16 px inputs, fixed mobile scale) lands in phase 1 because every
later phase depends on it, behind `max-lg:` so desktop sizes do not move.

## 4. Validating against real tasks

Before phase 1, with the prototype; after each phase, with the build.

**Task script** (5 merchants, ideally 2 who use Khatabook today, on their own
phones, Hindi or English as they prefer). Measure completion, time, wrong taps,
and ask "where would you look for…" before showing.

1. Ramesh just took ₹500 of goods on credit. Write it down.
2. Mohan paid ₹2,000. Record it and send him his balance on WhatsApp.
3. A walk-in buys 2 bags of rice and a packet of tea. Make the bill and print it.
4. Who has owed you money for more than a month?
5. Find last week's estimate for Priya Textiles.
6. Add a new supplier with an opening balance of ₹3,000 you owe them.
7. You typed ₹5,000 instead of ₹500 for Ramesh. Fix it.
8. Change the shop's printed address. *(discoverability of More › Settings)*
9. Switch to your library and check in a student. *(two apps, one person)*

Pass bar: tasks 1–3 without help by all five; 4–9 by four of five; no task
slower than today's build.

## 5. Testing checklist

**Devices and sizes**
- [ ] 360 × 780 (small Android), 390 × 844 (iPhone 14), 412 × 915 (Pixel), 430 × 932 (Pro Max)
- [ ] 768 × 1024 portrait tablet (mobile shell, two-column cards)
- [ ] 1024, 1280, 1440 — **desktop byte-identical**
- [ ] Real iPhone Safari: input focus does not zoom; safe areas (notch, home bar) clear the nav and docks
- [ ] Real low-end Android Chrome: scroll at 60 fps on a 500-party list; sheets open without jank
- [ ] Landscape phone: nav bar and docks still reachable; nothing clipped

**Touch and gestures**
- [ ] Every target ≥ 44 × 44 (existing sweep), primary ≥ 48
- [ ] 8 px between targets (12 when visually smaller than 44)
- [ ] Sheets close by ✕, swipe down, scrim tap and Escape
- [ ] No action is swipe-only
- [ ] FAB compacts on scroll down, expands on scroll up, never covers the last row (content padding)
- [ ] Snackbar sits above the nav or dock, never over the FAB

**Accessibility**
- [ ] axe at 390 on every changed screen (existing `a11y-phone`)
- [ ] Screen reader pass (TalkBack and VoiceOver): nav landmark, current tab, badges, amounts with meaning, sheet focus trap and return
- [ ] Keyboard (external keyboard on a tablet): tab order follows reading order, docked bar reachable
- [ ] Contrast: `scripts/check-contrast.mjs` and `darkTheme.contrast.test.ts` pass with the new roles
- [ ] Reduced motion: no slide or sheet animation
- [ ] Text at 200 % zoom: rows wrap, nothing clips (measuring check)

**Language**
- [ ] Hindi at 360: tab labels fit, row titles wrap rather than truncate, no text node outside its box
- [ ] `npm run i18n:split && npm run i18n:check`

**Behaviour and regression**
- [ ] Every sidebar destination reachable in ≤ 2 taps from any tab (generated from the manifests, asserted)
- [ ] URL filters (PTY-05) round-trip through the filter sheet
- [ ] Back button / Android back closes the sheet before leaving the screen
- [ ] Read-only roles and support sessions (`UbViewOnly`) disable the FAB and docks with the reason
- [ ] Archived party: no dock
- [ ] Offline strip; entry save refused clearly when offline
- [ ] All existing gates: pytest, type-check, lint, jest, build + `bundle:check`, the full `run-regression.mjs`
- [ ] `node e2e/desktop-unchanged.mjs` green
