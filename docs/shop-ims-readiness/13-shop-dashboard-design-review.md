# WP-06 Shop dashboard: design review

Status: written on 16 October 2026 for the owner, and nothing is built yet. The spec (02, "Shop dashboard", DASH-01 to DASH-04) asks for a header with the business, the Shop and the date range; today's net sales, money received and cash in hand; separate Customer and Supplier dues panels; a Needs attention list with count, amount, age and next action; recent activity; and an optional trend. Every card must name its period and open records that reproduce its figure.

Evidence comes from three sources:
- `e2e/dashboard-review.mjs` ran on a live stack against a synthetic kirana at the eight widths UX-05 names: 4 bills, a receipt, a purchase bill, an expense, one item out of stock and one low. Screenshots and `report.json` are in `/tmp/e2e-shots/dashboard-review` when it is re-run.
- A second synthetic shop was used to check the money tiles against their lists on the server: a customer's ₹700 advance, ₹300 paid ahead to a supplier, and an ₹1,800 bill due 25 days ago.
- The code was read: `reports/components/DashboardPageContent.tsx`, `backend/apps/reports/selectors/dashboard.py`.

## What the merchant gets today

| Width | Page height | Wider than screen | Text cut | Where "Needs attention" starts |
|---|---|---|---|---|
| 360 phone | 3,249 px | no | 1 (a long customer name, ellipsis) | 422 px, under the two dues, the Today strip and the quick actions |
| 390 phone | 3,201 px | no | none | 422 px |
| 768 tablet | 3,351 px | no | none | 430 px |
| 1024 to 1920 | about 2,000 px | no | none | No list. Overdue and Low stock are a one-line strip under the tiles |

Order on a laptop:
1. "Dashboard" and "Updated N s ago", with Refresh.
2. New bill and New purchase.
3. Four tiles: To collect, To pay, Today's sales, Cash in hand.
4. A strip with Overdue and Low stock.
5. "Who has to give you the most" and "Running low", with "Recent activity" beside them.
6. Insights: five charts with their own range control, last 7 days by default.

The phone has its own summary in the same order, with Needs attention as a list.

Nothing overflows, and the layout holds at every width. The problems are what the figures mean and where they lead.

## Findings

**Finding 1: To collect and To pay do not match the lists they open (DASH-01, DASH-02). Checked on the live server.** Each tile adds up every party's Shop balance, whatever the party's role.

| Tile | Shown | The list it opens | What is in the gap |
|---|---|---|---|
| To collect, "from all your customers" | ₹2,100 | Customers who owe you: ₹1,800 | A supplier we had paid ₹300 ahead |
| To pay, "to all your suppliers" | ₹700 | Suppliers you owe: ₹0 and nobody | A customer's ₹700 advance |

A merchant who taps "To pay ₹700" finds an empty supplier list.

**Finding 2: The overdue figure cannot be reproduced, and can be a day late.**
- The tile reads the bill status `overdue`. A nightly job sets that status at 00:15 (`sales/services/overdue.py`), so a bill entered today with a past due date stays out of Overdue until tonight. The test bill was due 25 days ago and was not counted.
- The link opens the bill list, which defaults to this financial year, so an older overdue bill drops out of the list.
- The tile's caption always reads "nobody · ₹X", because the server sends a count of 0.
- No age is shown, and the fallback link opens the Udhaar book's people list (DEC-019).

**Finding 3: Several links go to the Udhaar book (DEC-019).**
- "View all" on "Who has to give you the most" opens `/parties?balance=owes_me`, which filters by the Udhaar balance. Each row opens the person page without the Shop book.
- The Overdue fallback and two dead tiles (To collect today, Upcoming) point at `/parties?collection=…`.

**Finding 4: Cash in hand mixes books and can start below zero (DASH-03).**
- Payments and manual cash entries are added across every book. Only expenses are limited to the Shop.
- With no opening cash, a new shop shows "−₹150 since you started using YourKhata" after one tea expense.

**Finding 5: Figures do not say their period (DASH-01).**
- The header has no business name, Shop context or date, only "Updated 20 s ago".
- To collect, To pay, Overdue and Low stock have no "as of".
- "Today's sales" is net of credit notes, but the label says sales and the returns are not shown.
- "Top customers, by amount billed" does not say it covers the last 7 days.
- Recent activity shows when a record was typed, not its date. A bill dated 40 days ago reads "16/10/2026, 16:13".

**Finding 6: Suppliers have no panel (spec order 3).** Suppliers appear only as the To pay tile. There is no "who you owe the most", and no list of bills due to suppliers.

**Finding 7: One failure blanks the page (DASH-04).**
- The tiles, lists and activity come from one request. If it fails, the whole page is one error with Retry.
- A module section's Retry reloads everything.

**Finding 8: Quick actions are missing.** Record payment and Add expense are not offered, and the phone's Today strip figures cannot be tapped.

## Options

All three keep today's widths, tokens and components, and all three fix Findings 1 to 5, 7 and 8. They differ in how the page is arranged.

**A. Two books side by side (recommended).**
- **Header:** the business name, "Shop", and today's date. A range control defaults to Today. New bill is always shown, and More holds Record payment, Add purchase and Add expense.
- **Today row:** Net sales (returns shown under it), Money received, Cash in hand. Each says "Today" and opens its records.
- **Customers panel:** To collect, overdue bills with their age, and the top five. It opens Customers filtered to the same figure.
- **Suppliers panel:** To pay, bills due soon or overdue, and the top five. It opens Suppliers in the same way.
- **Needs attention:** always visible on every width, one row per kind (overdue bills, promises due, out of stock, low stock, open orders), each with count, amount, age and its next action.
- **Below:** Recent activity, then Insights.
- **Phone:** the same order, one column.

**B. Attention first.** The same parts as A, with Needs attention moved to the top, above the money. This is faster for a shop that opens the app to act, but the merchant reads the day's figures second.

**C. Keep today's arrangement and fix the figures only.** The fixes go into today's layout, and suppliers become a tab on the "who has to give you the most" card. This is the least change, but suppliers stay secondary and the spec's order 3 is only partly met.

## Done whichever option is chosen

- **To collect and To pay** come from the same query as the list they open: customers for one, suppliers for the other. Money held the other way round is named for what it is, for example "Advances from customers ₹700". It is never folded into the other tile. A person who is both a customer and a supplier appears in each list exactly as those lists already show them. Their net position waits on decision D-03, and nothing is invented for it.
- **Overdue** is decided when the figure is read (due date before today and money still due), so it is never a day late. The bill list opens with the same filter and no financial-year default.
- **Shop-only links:** every dashboard link stays in the Shop book.
- **Cash in hand** reads only the Shop book. Until an opening cash figure exists, it says "since <first entry date>" and does not show a negative figure as though it were the till.
- **One section can fail on its own:** each section loads, fails and retries separately.
- **A test for each figure:** a test that fails first reproduces each figure from the records its link opens. The live check above becomes an e2e reconciliation.

## Asked of the owner

Which arrangement: A, B or C. Recommended: A, because it is the spec's order and gives suppliers their own panel.

## The owner's choice and what was built (16 Oct 2026, 927e52d)

The owner chose **A, two books side by side**. Built and checked on the live stack at 360 to 1920 px (`e2e/dashboard-review.mjs`):

- **Finding 1 fixed.** To collect and To pay use the same `party_totals` as the lists, over active customers and active suppliers. Advances are their own line ("Customers paid ₹700.00 ahead", "You paid suppliers ₹300.00 ahead"). Live: To collect ₹3,296 = the customer list ₹3,296; To pay ₹3,150 = the supplier list ₹3,150. A new API test asserts each tile equals its list.
- **Header:** the business name (wraps, never cut), "Shop · Today, dd/mm/yyyy · Updated". New bill, and More with New purchase, Record payment and Add expense. Record payment and Add expense open their forms (`?add=1`).
- **Today row:** net sales, money received today (new, Shop book only), cash in hand.
- **Customers panel:** To collect, overdue bills with the oldest bill's age, top five customers. Links stay in the Shop book.
- **Suppliers panel (Finding 6):** To pay, overdue and due-this-week purchase bills, top five suppliers you owe.
- **Needs attention:** always on the page: collect, pay, out of stock, low stock.

**Not yet done, in order:**
1. ~~Overdue is still the nightly status (Finding 2)~~ Done in bb6dd2a: Overdue is decided when read (`apps/common/overdue.py`) by the dashboard and both bill lists' Overdue tab, and the link opens the list from the oldest overdue bill's date, so last year's bill stays in. Live: 3 bills · ₹2,160 on the figure and the list.
2. ~~Cash in hand still mixes books (Finding 4)~~ Done in 09e66a3: Cash in hand, the day book and the cashbook read only the Shop's money (an Udhaar "You got ₹300, cash" moved the live drawer from ₹250 to ₹550 before). `cash_in_hand` keeps its every-book value for the golden file; the Shop reads `shop_cash_in_hand`. Still open: with no opening cash a new Shop can show a negative drawer.
3. One failure still blanks the page (Finding 7).
4. Recent activity shows when a record was typed, not its date (Finding 5).
5. Promises due and open orders are not yet rows in Needs attention; there is no range control beyond Today.
6. At 360 px one long customer name in the top five is cut with an ellipsis, as before.
