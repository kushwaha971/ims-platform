# Lending Today · `/lending` — UI only

**Frozen contract**: same `GET /lending/today?route=` response (`stops[]`, `meta {on, has_loans, due, collected, short, stops, done}`), same Collect / Not paid dialogs and previews. See [02 §3](../02-preserve-and-contracts.md).

| Field | |
|---|---|
| Purpose | A collector's round for today: who to visit, how much is due, what's been collected. |
| Who and when | The lender or a collection agent, walking or riding a route, one hand on the phone, weak signal. |
| Phone layout | Header "Today · Sat 17 Oct", route picker chip ("Route 2 ▾", from existing routes), bell. **Progress card**: "₹8,400 collected of ₹12,000 due" with a bar, "14 of 22 stops done", "₹3,600 short" in red only when `short` > 0. **Stops list** in route order: borrower name, area, loan number, amount due today + arrears as separate words ("₹500 today · ₹1,000 late"), and two buttons on the card: **Collect** (marigold) and **Not paid**. Done stops move to a collapsed "Done (14)" group at the bottom with the amount collected. Bottom bar: Today · Loans · Borrowers · Routes · [Lending ▴]. |
| Desktop layout | Sidebar; progress across the top; table of stops with Due today, Late, Collected, Status, actions; the borrower drawer on the right when a row is opened. |
| What matters most | next stop → its amount → Collect. |
| Components | existing `TodayPageContent`, `CollectDialog`, `NotPaidDialog`, `BorrowerDetailDrawer`; `UbProgress`, `UbPanel`, `UbDataGrid` card mode, `UbButton`. |
| Main / other | Collect / Not paid, call borrower (`tel:`), open loan. |
| Wording | Lent / Collected (DEC-019). "Late" not "arrears". Never "EMI" on screen unless the plan is reducing and the owner's words use it. |
| States | **First use** (`has_loans` false): existing first panel as a setup card ("Add your first loan"). **Nothing due today**: "No collections due today" with a link to tomorrow's list if the API supports the date param (it takes `route` only — so no tomorrow link; noted). **Collect saving**: dialog button busy, stop card locked; keyed request (existing `lending.collection.create`). **Collect failed**: dialog stays open with the amount; "Try again" reuses the key. **Offline**: the list stays readable if cached; Collect disabled with "No internet. Collect when you're back online." (no offline write for money). |
| Accessibility | each stop reads "Ramesh, Route 2, 500 rupees due today, 1000 late, Collect button". |
| Must keep working | all figures from the server; collection preview before save; payoff cap; void rules; reminder buckets. |
| Fewer taps | Collect directly on the stop card (today: verify whether it needs opening the stop first; if so this is a pure UI change using the same dialog). |

Performance note: this screen's endpoint runs one query per active loan (BP-01). The UI shows the progress card from `meta` first and the list as it arrives, but the real fix is BP-01, which needs approval.

Tracking: problems — slow on big books (BP-01), dense on phones · decisions — UI only; Collect on the card · dependencies — BP-01 (optional, approval) · risk — low for UI · approval — pending · build — not started · tests — lending e2e, figure parity, contract snapshot, double-tap Collect test · outcome — —
