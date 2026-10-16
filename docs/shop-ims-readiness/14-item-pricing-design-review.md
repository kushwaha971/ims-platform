# WP-07 Item pricing: design review

Status: written on 17 October 2026 for the owner. Nothing is built yet. The roadmap's owner requirement (07, "Additional owner requirements — 16 October 2026") asks for three things on an item:
- a purchase-cost reference;
- a default selling price;
- an editable profit margin, defined as margin = (net selling price − reference purchase cost) / net selling price × 100.

Changing the cost or the margin recalculates the selling price. Changing the selling price recalculates the margin. The zero and undefined cases, precision, tax-inclusive prices and validation must be defined before coding. That is this document.

Evidence: the code was read, and every claim below has a file reference.

## What exists today

**Fields on an item** (`backend/apps/inventory/models.py:176-181`):
- `selling_price` and `purchase_price` are both 2-decimal money and can never be negative (`ck_item_prices_non_negative`).
- `tax_inclusive_selling` says whether the selling price includes GST.
- `mrp` is optional.
- `tax_code` names the GST rate. The rate itself is resolved by date (`apps/tax/services/tax_engine.py:129`).

**"Purchase price" is really the last bill's cost.**
- Recording a purchase bill overwrites it with that bill's inbound unit cost (`apps/inventory/services/last_cost.py:29-39`, called from `apps/purchases/services/record.py:192-205`).
- Voiding the bill does not put the old value back.
- The weighted-average cost is a separate figure per location, at 4 decimals (`ItemStock.avg_cost`, `services/costing.py:82`).
- The profit report uses neither. It uses the cost frozen on each sale line when it was issued (`apps/reports/selectors/profit.py:154-180`). That freeze is the weighted average for stocked goods and the purchase price for the rest (`apps/sales/services/issue.py:197-204`).

**No margin anywhere.**
- Neither the frontend nor the backend has a margin or markup field or calculation for an item.
- Margin appears only in read-outs computed on the server: the invoice's profit card, the item's trade panel and the profit report. Each uses profit ÷ net sale, which is the owner's formula.

**Who sees cost today.** Cost is hidden from anyone without `reports.financial.read`:
- the item list, detail, lookup and movements pop `purchase_price`, `avg_cost` and `stock_value` (`apps/inventory/serializers/output.py:54-66`, `views/items.py:66-72`);
- CSV export gates them the same way;
- Staff do not hold `reports.financial.read`; Owner, Admin and Accountant do (`apps/common/permissions_registry.py`).

**Where cost leaks.**
- Staff hold `purchases.bill.read/write`, so they see costs on the bills they enter. They also see every supplier's unit cost through the purchase side of "last rate" and "item trade" (`apps/reports/views/dashboard.py:238-240, 296-298`). Only the margin is gated there.
- Anyone with `inventory.item.write` can *set* `purchase_price` when creating an item without being allowed to *read* it.

**Customer documents carry no cost.**
- The public `/d/<token>` page is an allow-list with no cost field (`apps/sales/serializers/public.py:25-79`).
- `unit_cost_snapshot` is never serialized to a customer.
- The print model has no cost.

**GST-inclusive prices.**
- The backend turns an inclusive price into a net one in `_taxable_line` (`tax_engine.py:153-157`).
- The frontend writes the same formula inline in `computeDocumentTotals` (`taxEngine.ts:111, 121-124`) and has no named helper.
- Purchase costs are always net (no inclusive switch on purchase lines).

**The item picker shows no price.** In the sales and purchase editors, `ItemLineCell` shows name, SKU and on hand. Picking an item fills the line's price from the item (selling for a sale, purchase for a bill, or blank when cost is hidden).

## Proposed rules (the contract)

**Reference cost.**
- The reference cost is the item's purchase price: the last bill's cost, which the merchant can also type.
- It is what a shopkeeper means by "I buy it at ₹40", and it is the one cost the item form already edits.
- The weighted average stays where it is (stock value, the profit report). It is never the margin's base, because it moves with every bill and is per location.

**Net selling price.**
- If the selling price includes GST, the margin uses the price without GST: net = price ÷ (1 + (rate + cess) ÷ 100), at the item's current rate.
- That is the backend's `_taxable_line`. The frontend gains one named helper with the same formula, and the invoice engine uses it, so there is still one formula.

**Formulas.**
- With C = reference cost, N = net selling price and m = margin %:
  - m = (N − C) ÷ N × 100
  - N = C ÷ (1 − m ÷ 100)
- For an inclusive item, the stored selling price is N × (1 + rate ÷ 100).

**Precision.**
- Prices are rounded to 2 decimals (money).
- Margin is shown to 1 decimal.
- When the merchant types a margin, the price is computed and rounded first. The margin shown is then recomputed from the rounded price, so the three figures on screen always agree.

**Edits.**
- Typing a cost or a margin recalculates the selling price.
- Typing a selling price recalculates the margin.
- Typing the cost while the margin is empty leaves the selling price alone and fills the margin.

**Zero and undefined cases.**
- Cost 0 or empty: no margin. The field is disabled with "Add the cost to see margin". The selling price is typed as today.
- Selling price 0: margin shows "—".
- Margin 100% or more: refused ("Margin must be below 100%"), because it needs an infinite price.
- Negative margin (selling below cost): allowed, with a warning line "Selling below cost". Shops do clear stock at a loss.

**Validation.** Margin from −999.9% to 99.9%. Prices are non-negative 2-decimal money, as today.

**Stored or not.**
- Margin is NOT stored: it is computed from the two prices whenever it is shown. A stored margin would disagree with a price as soon as a bill updated the cost.

**Old documents.**
- Master changes never touch issued invoices, their discounts or overrides, or stock movement costs. These are already frozen snapshots and remain so.
- A bill that updates the cost does not move the selling price. The margin simply reads lower until the merchant changes it.

**Who sees it.**
- Margin and reference cost on the item form, the item detail and the picker are shown only with `reports.financial.read`, the gate cost already uses.
- Customer documents carry neither (already true, now with a test).

**In the picker.**
- Readers with financial access see "Sells ₹50 · Cost ₹40 · 20% margin" on each option.
- The line itself still says the actual price being charged. Item defaults are labelled "usual" so they are never confused with the line's own price.

## Asked of the owner

1. **The cost the margin is based on.**
   - Recommended: the last purchase price, which bills keep up to date and the merchant can type.
   - The alternative is the average cost of the stock on hand, which follows real costs but is not typable and differs by shop location.
2. **Staff and costs.** Staff already see costs on the purchase bills they enter and on the suppliers' last rates. Should that stay? Recommended: yes, since a person entering a bill must see its cost. The new margin and cost on items stay hidden from them, as cost on items already is.

## Known issues found, to fix in the build
- Anyone with item write access can set a cost on create without being allowed to read it. Recommended: the create form shows cost only with financial access, and the server ignores it otherwise.
- Low stock calls the same field "last purchase cost" while the form calls it "purchase price"; the words should be one.
- The stock report's "potential sale value" multiplies an inclusive selling price as though it were net (`apps/reports/views/stock.py:86-89`).

## Built — 17 October 2026 (e637f67)

Built test-first on the recommended answers while the owner's two cards stay open: the margin is based on the last purchase price, and staff keep seeing costs on the bills they enter. If the owner picks the other option on either card, the change is small and isolated (`priceAfterEdit`'s cost input; the purchase bill permissions).

- **Server.** A member without `reports.financial.read` can no longer set `purchase_price` on create or edit (400 on the field). Their other edits still work (`test_a_member_who_cannot_see_costs_cannot_set_one`). List and lookup rows carry `gst_percent` (today's rate plus cess) for members who see costs, so the picker can read an inclusive price's margin (`test_a_picked_row_carries_its_gst_for_the_margin`).
- **Form.** Selling price, then Purchase price and Margin % side by side, for members who see costs (`ItemPriceFields`). `priceAfterEdit` decides which figure follows which. The margin box is disabled until there is a cost. "Margin must be below 100%" is an error; "Selling below cost" is a warning. Margin is a form value that is never sent. A member who cannot see costs gets the selling price alone, and create no longer sends `purchase_price: "0"` for them (the server would now refuse it).
- **Found while testing the form.** A cost is typed one keystroke at a time. Without care, the margin derived from "4" (on the way to "45") would take hold, and the next keystroke would price the item at ₹562.50. The cost box now works from the margin as it stood when the merchant went into it.
- **Found by looking: the item page had no margin.** Its Price and tax panel showed the selling and purchase prices and no margin, though the contract puts it there. It now reads "Margin 20.0%" at the item's own GST rate ("−14.3% · selling below cost" at a loss), for members who see costs (`itemMargin`).
- **Found by looking: the picker cut the price line.** At every width the option read "Usual price ₹59.00 · Cost ₹40.00 …", so the margin never showed. Options now take a `detail` line that wraps (`UbAsyncCombobox`), and the prices go there.
- **Found by looking: a phone's ⋯ actions did nothing.** On the item page, Edit, Adjust stock and Archive in the ⋯ sheet closed the sheet and opened nothing. The cause was in the shared sheet (`UbActionSheet`, since ce30567 on 16 Oct): it closed in the click's capture phase, and a real tap flushes that close before the button's own handler runs. It affected the 13 screens that put header actions in a ⋯ sheet. Unit tests dispatch clicks from script, which hides it; a test now stands in for the browser's checkpoint, and the review taps Edit for real.
- **One formula.** `netOfInclusive` (src/utils/taxInclusive.ts) is the one frontend copy of the backend's `_taxable_line`. The invoice engine now uses it.
- **Picker.** Each option reads "SKU · on hand · Usual price ₹59.00 · Cost ₹40.00 · 20.0% margin". The usual price is shown to everyone; cost and margin only to members who see costs. An inclusive item's margin is left out rather than guessed when its GST is unknown.
- **One name.** Low stock's "Last cost" column is now "Purchase price", the form's word. The form's hint says a purchase bill updates it.
- **Customer documents.** `test_a_customer_never_sees_what_the_shop_paid` looks for the item's cost figures and for any cost, margin, profit or purchase key anywhere in the public bill.
- **Not changed: potential sale value.** RPT-06 BR-10 defines it as quantity × selling price. Making it net of GST for inclusive items changes a specified figure and its CSV, so it needs a change request in Part 43 first. It is listed for the owner rather than changed here.
