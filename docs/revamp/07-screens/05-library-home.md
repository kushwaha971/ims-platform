# Library Home · `/library` — UI only

**Frozen contract**: same endpoints (`GET /library/home`, `fees/board`, `seat-map`), same figures, same actions. Only arrangement, wording and visual treatment change. See [02 §2](../02-preserve-and-contracts.md).

| Field | |
|---|---|
| Purpose | Start of a library owner's day: how full the seats are, whose fees are due, and the counter. |
| Who and when | Library owner or desk staff, morning and at shift changes. |
| Phone layout | Header "Library", search students, bell. **Seats card**: big "42 of 60 seats filled" with a thin bar and per-shift chips (Morning 30/60 · Evening 12/60) from `seat-map` `meta.shift_counts`; "18 open" link to Seats filtered to free. **Fees card**: three figures already on the home today — Collected (this month), Due this week, Overdue — each tappable to Fees filtered. Two actions: Counter (check-in) · + Enrol student (marigold). **Today list**: students whose fee ends today or is overdue (from `fee-reminders`, already loaded), each with Remind. Bottom bar: Home · Students · Seats · Fees · [Library ▴]. |
| Desktop layout | Sidebar; three cards in a row (Seats with a mini seat map preview, Fees, Today); below, the fees-due table with Remind and Collect; Counter as a header action. |
| What matters most | seats filled → fees overdue → today's list. |
| Components | `UbStatCard`, `UbAgingBars` (only if the home response carries the split), `UbPanel`, `UbDataGrid`, `UbStatusBadge` for fee state using the server's `fee_state` value mapped to words: Paid · Due soon · Unpaid · Part paid · Overdue · On hold · Left · No fee. |
| Main / other | + Enrol student / Counter, Remind, open student, open seats. |
| States | **First use**: existing first-use panel, redesigned as the 3-step setup card (Add seats and shifts · Add fee plans · Enrol first student). **No figures yet** (`library.home.noFigures`): figures hidden, not ₹0. **All paid** (`library.home.allPaid`): a quiet "Everyone has paid" line in place of the Today list. **Error**: existing error title with Try again. |
| Accessibility | seat bar has a text equivalent; fee states are words, not colour. |
| Must keep working | every figure from the API as-is (fee state, due-soon = 7 days, seat day/view states); staff limits; self check-in poster. |
| Fewer taps | Remind on the home row (today it needs the Fees page); Counter one tap from Home. Both call existing endpoints. |

Open check before approval: confirm `GET /library/home` already returns the per-shift counts or that the home already calls `seat-map`; if neither, the seat card shows only total filled (no new call, no backend change).

Tracking: problems — readability of figures, seat occupancy not visible at a glance · decisions — UI only · dependencies — none · risk — low (presentation) · approval — pending · build — not started · tests — library e2e looks, figure parity, contract snapshot · outcome — —
