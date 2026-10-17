# Shop Home · `/dashboard`

Visual reference: Counter Mode design page, revision 3 and later (the published artifact; source copy `/mnt/project-files/shop-design-direction/counter-mode.html`). This spec records the decisions; the page shows them.

| Field | |
|---|---|
| Purpose | At a busy counter: start the next task in one move, and see today's money and who owes what, without reading a report. |
| Who and when | Owner or counter staff, many times a day, often mid-sale. |
| Phone layout | Header (shop name, date and time, bell). Find-or-start box. Two actions: Receive money · + New bill (marigold). Day figures as a 2 × 2 grid: Billed, Received, Paid out, Cash by your records — each with one line saying what it counts. Two lanes: To collect (customers) · To pay (suppliers), separate. Segmented Register · Follow-ups · Insights. Bottom bar. |
| Desktop layout | Sidebar; header row with title and three actions (Receive money, Pay supplier, + New bill); find-or-start box with `Ctrl K`; "Repeat" chips with where they come from; one ruled line of four figures and the per-hour chart (stops at the current hour; "Show as table"); main column with Register / Follow-ups / Insights tabs; side column with the two lanes and the dual-role note. |
| What matters most | find-or-start and the two actions → today's four figures → who to collect from → the register. |
| Components | `UbHomeBlocks`, `UbStatSummary`, `UbAmount`, `UbGroupedBars` + `UbChartTable`, `UbAgingBars`, `UbPanel`, `UbTabs`/segmented, `UbAsyncCombobox` (find-or-start, new composition), `UbFilterChip` (repeat). |
| Main / other | + New bill / Receive money, Pay supplier, Remind, Pay, open any row. |
| Navigation | rows open the bill, receipt or person; lanes open Customers or Suppliers sorted most late first; Remind opens the Shop reminder flow (needs TV-02 fix). |
| States | **First day**: ₹0 figures, "No bills yet today", three setup steps, no chart. **Loading**: skeletons shaped like the figures. **One part failed**: only that panel says "Couldn't load supplier dues · Try again" (existing `unavailable` parts). **Staff with limited access**: totals hidden for their role with a lock line. **Offline**: last loaded figures with "As of 4:12 pm, no internet". |
| Accessibility | figure line is a group with labels; chart has an `aria-label` sentence and a table view; register rows say their type in words; status as words, not colour only. |
| Must keep working | each app's own book (DEC-019); customers and suppliers never netted (D-03, TV-01 server fix pending); dashboard per-part availability. |
| Fewer taps | "mohan 2000" in find-or-start opens Receive payment filled for Mohan with ₹2,000 (nothing saved until Receive); Repeat chips open filled forms. |

Tracking: problems — TV-01 netting, TV-02 Shop reminders (server) · decisions — four-figure line kept over the big sentence (the owner liked the sentence; R-DEC-03 open: offer the sentence as a phone-only header line above the grid) · dependencies — TV-01, TV-02, per-hour series read · risks — find-or-start discoverability · approval — direction approved 17 Oct (colours, sidebar); details pending · build — not started · tests — dashboard e2e, figure-sum check, 320 px Hindi · outcome — —
