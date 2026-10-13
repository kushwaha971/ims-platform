# UX18 — Filters and updates without unnecessary page reloads

Owner request: audit filters and other routine interactions across YourKhata.
Use proper rendering logic and memoization where missing so users do not see
unnecessary reloads while doing ordinary work.

## Acceptance criteria

- [ ] Search, filter, sort, pagination, occupancy choices and tab changes update
      the affected results in place, with no full-document navigation/reload.
- [ ] Filter state remains shareable/restorable through the existing route/query
      conventions; Back and returning from a detail page preserve list state.
- [ ] Preserve scroll and focus for changes on the same screen; intentional
      pagination/list reset follows the screen's existing behavior.
- [ ] Data requests correspond to the selected state without duplicate reads,
      effect loops or an older response overwriting a newer filter selection.
- [ ] Show a local loading state while data changes; keep useful page context
      rather than replacing the whole screen with unrelated loading chrome.
- [ ] After payment, edit, renewal or assignment, refresh/invalidate the affected
      balances, history and availability from authoritative data in place.
- [ ] Memoize expensive derived lists/columns/occupancy calculations and stable
      props where it prevents unnecessary work. Use actual dependencies and
      preserve correctness when inputs, tenant, permissions or app change.
- [ ] Measure relevant requests and rendering before/after a fix; avoid adding
      blanket memoization or extra state without evidence that it helps.
- [ ] Verify both 1280 px and 360 px with live filter/change workflows, including
      document-navigation counts, request counts and absence of stale results.

Apply these requirements during existing bug and feature work, then complete
an explicit cross-module audit. Follow HANDOFF.md's test-first, screenshot,
gate and per-item commit workflow. UX18 remains pending until verified.
