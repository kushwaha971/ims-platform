# WP-05 counter editor: design review

Status: review for the owner, 16 October 2026. Nothing in this document is built yet. The spec (02, "Bill editor") asks for compact context, optional fields disclosed, a container-fit line grid, and totals that stay reachable, measured before any layout is chosen.

Evidence: `e2e/counter-editor-review.mjs` on a live stack, with a synthetic shop and drafts of 1, 10 and 50 lines for both the sales invoice and the purchase bill, at eight widths. The numbers are in `/tmp/e2e-shots/counter-review/measurements.json` when it is re-run. The screenshots were taken from the same run.

## What the merchant gets today

| Width | Line layout | Lines width | One line | 10-line page | 50-line page | Total in view |
|---|---|---|---|---|---|---|
| 360 / 390 phone | cards | 328 / 358 px | about 285 px | 3,810 px | 15,250 px | yes, docked |
| 768 tablet | cards | 736 px | about 285 px | 3,835 px | 15,317 px | yes, docked |
| 1024 laptop | cards | 525 px | about 288 px | 3,398 px | 14,916 px | invoice yes; bill no (800 px on a 768 px screen) |
| 1280 laptop | cards | 696 px | about 289 px | 3,410 px | 14,963 px | yes, side panel |
| 1440 desktop | cards | 803 px | about 280 px | 3,417 px | 14,995 px | yes, side panel |
| 1536 desktop | table | 867 px | 61 px (bill 79) | 1,181 px | 3,621 px | yes, side panel |
| 1920 wide | table | 1,123 px | 61 px (bill 79) | 1,184 px | 3,624 px | yes, side panel |

These are the sales invoice figures, and the purchase bill is within a few per cent of them.

**Finding 1: most laptops get the phone layout.** The table appears only from 1536 px (`tableFrom={1536}`). On the 1280 and 1440 screens most counters use, every line is a phone card about 290 px tall, so a 10-line bill is three screens long and a 50-line bill is about 15,000 px. The same bill at 1536 is 3,600 px. The line column at 1440 is 803 px wide, which already holds the invoice's table (its minimum is about 756 px). It is drawn as cards because the switch is a screen-width query, not a measure of the space the lines actually have.

**Finding 2: the side totals panel is what takes the width.** From 1024 px up, the totals take a third of the content area. That leaves the lines 525 px at 1024 and 696 px at 1280. Neither fits a table, and both are wide enough if the totals move below the lines.

| Editor | Sum of minimum columns, remove button, gaps and padding |
|---|---|
| Invoice | about 756 px |
| Purchase bill | about 824 px |

**Finding 3: a defect, found by measuring.** On the purchase bill at 1536 px, a loose-unit quantity is shown as the server stores it ("6.000") and does not fit its box. Every KGS line was cut, 8 of the first 50. The sales editor trims it. The purchase editor's `formQty` trims only whole units. Fixed on 16 October: `formQty` now trims a weighed quantity as well ("6.000" → "6", "1.250" → "1.25"), and the re-run measures no cut text at any width.

**Finding 4: the purchase bill's total is below the fold on a 1024×768 laptop.** The supplier block (supplier, invoice number and date, bill date, due date, reverse charge) is about 410 px tall before the first line.

Nothing overflowed the page at any width, and no page errors were recorded.

## Options

**A. Lines decide by their own width; totals below the lines at medium widths (recommended).**
- The line editor measures its own container and draws the table whenever every minimum column fits. It falls back to cards only when they do not, which is phones and narrow tablets.
- From 1024 to 1535 px the totals panel moves under the lines, full width, and a slim sticky bar keeps the grand total and Issue/Record in view while lines are added, the same idea as the phone's total dock.
- From 1536 px the side panel stays as it is now.
- Expected: the table at 1024 (invoice; the bill when its columns fit), 1280 and 1440. A 10-line bill is about one screen at 1280 instead of three, and a 50-line bill is about 3,600 px instead of 15,000.
- Cost: one design-system change (a container measure in `UbLineItemsEditor`), the two page grids, and a sticky bar that reuses `UbTotalDock`. No calculation changes.

**B. Keep the side panel and squeeze the columns.**
- Lower the minimum tracks so the table fits 696 px at 1280.
- Cost: this is exactly what the spec forbids. "Do not simply lower the existing 1536px breakpoint and reintroduce clipped Qty/Total fields." Finding 3 shows Qty is already the column that clips.

**C. Change nothing in layout, and only fix the clipped quantity.**
- Cost: laptops keep the 290 px phone card per line.

## Also in scope whichever option is chosen

- **Compact context.** The supplier block on the purchase bill, and Place of supply on the invoice, would collapse to a one-line summary once filled ("Mahalaxmi Wholesale · MW-1043 · 16 Oct · due 16 Oct") with Edit to reopen it. Reverse charge and supplier invoice date stay in the block and stay required where the law needs them.
- **Keyboard.** Enter, ↑/↓, Alt+N, Alt+Backspace and Ctrl+Enter are kept unchanged and are re-tested on the table at each width.
- **Speed and accuracy evidence.** For 1, 10 and 50 lines, the build records keystrokes and time to add a line and the time to Issue, and checks every figure against the server's preview. That evidence is what WP-05's exit criteria ask for.
- **D-04 UI-composition audit.** It runs alongside: the editors' panels, docks and action rows are inventoried before any new copy of them is written.

## Asked of the owner

Which layout should the counter editor use from 1024 to 1535 px: A (recommended), B or C?
