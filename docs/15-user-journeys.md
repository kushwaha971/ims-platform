# Part 15 — User Journeys

## 15.0 How to read these journeys

Part 14 describes who the users are; Part 12 §12.3 describes the MVP path in outline. This part walks twelve journeys end to end at the granularity a designer, an engineer or a tester needs: which screen, which feature ID, what rows are written, and what the person is feeling at that moment. The emotional beat is not decoration — it is the design constraint. A person who is anxious will not read; a person who is relieved will tolerate a second step; a person who is embarrassed in front of a customer will abandon the product silently.

Every journey ends with two blocks that carry equal weight to the steps themselves. **Failure modes** names what goes wrong in the real world and what the product does. **When the network is poor** states the behaviour on the connection the target user actually has — a 3G-equivalent link that drops when the shutter comes down, inside a shed, or between villages on a route. Canon's shared UX rules commit to optimistic writes with a retained draft and a retry; these blocks say what that means concretely in each flow.

Feature IDs in brackets are the specification that governs the step. Where a journey depends on a Phase 2 feature, this is said explicitly and the MVP behaviour is given.

---

## 15.1 Journey 1 — First run and business setup

**Who:** Suresh Sharma, kirana owner. **Outcome:** a working tenant with his language, his business type and his first party, in under five minutes. **Emotional arc:** wary → surprised it is this short → mildly proud.

1. He opens a link a distributor's salesman sent on WhatsApp, or taps the icon a field agent installed. The first screen is a **language choice** — हिन्दी or English, nothing else on the screen. He taps हिन्दी and the entire interface changes, including the numerals' grouping and the date format. *He has already learned the most important thing: this product is for him.*
2. **Mobile number.** Ten digits, a `+91` prefix he cannot delete, a numeric keypad. He types his shop number. `PLT-01` writes nothing yet; it creates an `platform_otp_challenge` row and calls the SMS adapter, which at MVP is the console backend (ADR-015) or a configured provider.
3. **OTP.** Six digits, auto-advancing boxes, a resend timer that is visible rather than hidden. If he mistypes he gets a clear count of attempts left rather than a lockout with no explanation. On success `platform_user` is created with his mobile and locale `hi`, and a `platform_session` row with a device label. *The first small relief: no password to invent.*
4. **Business setup**, four questions on one scrollable screen, not a four-step wizard with progress dots (`PLT-03`). Business name, typed in Devanagari or Roman as he prefers. Business type, chosen from cards with icons — Kirana/Retail, Wholesale/Distribution, Services, Manufacturing, Professional, Other. GST status — three options, and choosing "Not registered" hides the GSTIN field entirely rather than greying it. State, defaulted from a mobile-number heuristic but editable. **Writes** `platform_tenant` (name, `business_type='retail'`, `gst_type='unregistered'`, state, `Asia/Kolkata`), `platform_membership` with role `owner`, a seeded set of `platform_tenant_setting` rows, a default `inventory_location`, seeded `expenses_category` and `inventory_unit` rows, and `platform_document_sequence` rows for the current financial year.
5. The business type does real work here. Choosing Kirana/Retail leaves inventory enabled but with stock tracking off by default and NOS as the unit; choosing Services disables the inventory module in `enabled_modules` entirely and switches document vocabulary to SAC codes. *He never sees a screen asking for an HSN code, and he never knows how close he came to abandoning at that screen.*
6. **The dashboard** (`RPT-01`) with every tile at zero, and one unmissable primary action: "पहला ग्राहक जोड़ें" — add your first customer. Empty states here are first-use variants with an illustration and a single CTA, never a bare "No data".
7. He taps it and gets the party form (`PTY-01`): name, mobile, and an opening balance field labelled in his own vocabulary — "इनसे लेना है" / "इन्हें देना है" rather than "debit" and "credit". He types Ramesh, a number, and ₹2,300. **Writes** `parties_party` with `is_customer=true` and, through `LED-02`, a `ledger_entry` of `entry_type='opening'`, `direction='debit'`, plus the party's denormalised balance in the same transaction.
8. The party list now reads "आपको मिलने हैं ₹2,300" at the top (`PTY-02`). *Ninety seconds in, the app already knows something true about his business.*

**Failure modes.** The OTP never arrives — the resend timer is visible, a "call me instead" fallback is offered where a voice provider is configured, and the attempt counter is explicit; he is never told only "invalid". He types a business name in a script the font does not render — the app ships Devanagari-capable fonts and does not fall back to boxes. He picks the wrong business type — `PLT-06` lets him change module toggles later, and nothing about business type is irreversible, which is exactly why the question can be asked in one tap without a warning. He abandons midway after OTP — the user exists without a tenant, and returning drops him straight back to business setup rather than to a broken dashboard.

**When the network is poor.** OTP request and verify are the only blocking calls, and both show an explicit "Checking…" state with a timeout that offers retry rather than spinning forever. Business setup posts once; if it fails, the typed values are retained in the form and the retry uses the same idempotency key so a slow first request cannot create two tenants. The dashboard renders its skeleton immediately and fills tiles as they arrive, so the screen is never blank.

---

## 15.2 Journey 2 — Migrating a paper or Khatabook ledger in

**Who:** Suresh, with help from a partner field agent. **Outcome:** eighty parties with correct opening balances in one sitting. **Emotional arc:** dread → relief that it is a spreadsheet, not eighty forms → a specific, checkable confidence.

1. The dashboard shows a migration prompt for a tenant under a week old with fewer than five parties: "पुराना हिसाब लाएँ" with two routes — type them in, or upload a file (`PTY-10`, `IMP-01`).
2. He or the agent downloads the **CSV template**. It has the columns the form has and nothing more: name, mobile, type (customer/supplier/both), opening balance, direction, collection date, credit limit, tags, GSTIN, state. The template's first row is a filled example, and the header row is in the tenant's language while the machine-readable keys stay in English.
3. The agent types eighty rows from the notebook on a laptop over about forty minutes — the single highest-value twenty minutes anyone spends on this account, and the reason the partner field force exists.
4. **Upload.** `IMP-01` creates an import job (`status='uploaded'`), parses, and moves to `validating`. Nothing is written to `parties_party` yet.
5. **The validation screen** is the part that earns trust. Seventy-three rows are green. Seven are not: two have a nine-digit mobile, one has a duplicate mobile already in the tenant, three have an amount with a stray comma, one has a state that is not a valid GST state. Each error names the row, the column, the offending value and the fix, and the file can be corrected inline in the preview rather than re-uploaded. *This is where a competitor's import loses people: a single "Invalid file" message.*
6. He fixes the seven, sees eighty green rows and a **preview total** — "आपको मिलने हैं ₹1,84,500 · आपको देने हैं ₹22,000". He compares it with the total he adds up from the notebook. They agree.
7. **Commit.** The job moves to `importing` and runs as a background task on the scheduler (ADR-012), writing `parties_party` rows and an `opening` `ledger_entry` for each non-zero balance, all inside a transaction per chunk, with `platform_audit_log` rows and an idempotency guard so a re-run cannot double-post. Status becomes `completed` and an in-app notification arrives (`NTF-01`).
8. The party list is now his book (`PTY-02`). He filters by "owes me", sorts by amount, and recognises the top five names. *The notebook is now a backup rather than the record.*

**Failure modes.** The file is in Excel format rather than CSV — the uploader accepts `.xlsx` at Phase 2 (`IMP-03`) and at MVP gives an explicit "Save as CSV" instruction with a two-line how-to rather than a rejection. A row's mobile duplicates an existing party — the preview offers "skip" or "add to existing balance" per row, never a silent merge. The commit fails halfway — the job records which rows committed, the partial result is visible, and re-running processes only the remainder. The totals do not match the notebook — the preview shows the sum before commit precisely so this is discovered before eighty rows exist, and the statement's opening entry can be corrected later through `LED-03` with a reason.

**When the network is poor.** Upload is a single multipart POST with progress; a dropped upload leaves no job and can simply be retried. Validation and commit run server-side, so he can close the app and come back — the job status survives, and `NTF-01` tells him when it finished. This is the one flow where a background job is not an optimisation but the difference between working and not.

---

## 15.3 Journey 3 — The daily credit-sale-and-collection loop

**Who:** Suresh at the counter. **Outcome:** an entry faster than the pencil, and a customer who knows what was written. **Emotional arc:** hurried → unbroken.

1. A regular takes ten kilos of sugar on credit. Suresh opens the app, which lands on the **party list**, and types "ram" in the search field. The list filters within 300 ms of his last keystroke (`PTY-02`).
2. He taps **Ramesh Traders** and lands on the **khata page** (`PTY-03`): a balance header reading "₹2,300 · आपको मिलने हैं" in the receivable tone, two large primary actions, and a timeline below.
3. He taps **उधार दिया** (You gave). The drawer is a bottom sheet at 92 vh with the amount field already focused and the numeric keypad already up, and the Save button pinned in the footer above the safe area so the keyboard cannot cover it (`LED-01`). *Nothing has cost him a decision yet.*
4. He types `500`, taps the note field, types "चीनी 10 किलो", and taps Save. The drawer's direction accent is red; no confirmation dialog interrupts him, because speed is the feature.
5. **Writes:** one `ledger_entry` (`direction='debit'`, `entry_type='manual_gave'`, `source_type='manual'`, `status='posted'`), an update to `parties_party` (balance, `receivable_total`, `last_activity_at`) under a row lock, one `platform_audit_log` row, and — where an SMS provider is configured and the party has opted in — one `platform_job` row for the transaction message (`LED-08`).
6. The timeline row appears with a tick, the header reads "₹2,800 · आपको मिलने हैं", and a snackbar says "सेव हो गया ₹500 · रमेश के ₹2,800 बाकी" with a **Remind** action. *Eight seconds, and the customer standing there has heard the phone buzz in his own pocket.*
7. Later the same customer pays ₹300. Suresh taps **जमा** (You got), types the amount, taps the **UPI** mode chip (the mode is remembered per device), optionally pastes a UTR, and saves. The entry is green, the balance drops to ₹2,500, and no `payments_payment` row is created — a manual "got" is a ledger-only event by `LED-01` BR-7, and the cashbook reads it by mode.
8. At close he glances at the **dashboard** (`RPT-01`): today's collections, cash in hand, due today, overdue. *The Sunday notebook-addition ritual has quietly stopped being necessary.*

**Failure modes.** He taps Save twice — the same idempotency key is reused and the replayed response is de-duplicated by entry ID, so one row exists. He enters the amount against the wrong party — the correction path is `LED-03`, reachable from the timeline row, and journey 12 covers it. The party is over their credit limit — with `credit_limit_mode='warn'` the entry posts and the snackbar states the overage; with `block` the drawer shows the limit and the balance-after figure, and only an owner or admin sees **Save anyway**, which writes an override audit row. The party has no mobile — the entry saves and the SMS step is silently skipped; he is not nagged about a field he does not have.

**When the network is poor.** The drawer opens with no fetch at all because the party is already in the store. On submit an optimistic timeline row appears labelled "सेव हो रहा है…". If the request fails the row turns amber and reads "सेव नहीं हुआ" with a **Retry** action, and the drawer's contents are preserved in the slice rather than discarded. Retry reuses the original idempotency key, so a request that actually succeeded but whose response was lost cannot post twice. At no point is he shown a blank screen or an error he cannot act on — this is the flow whose reliability determines whether he keeps the app at all.

---

## 15.4 Journey 4 — The month-end collection push

**Who:** Suresh on a Sunday evening; the same flow serves Ramesh's collections person daily. **Outcome:** eleven reminders sent in four minutes without a single awkward phone call. **Emotional arc:** reluctance → the relief of delegation to a machine.

1. The **dashboard** shows three ledger buckets (`LED-05`, `LED-09`): Due today, Overdue, Upcoming 7 days, each with a count and an amount. He taps **Overdue · 11 · ₹46,200**.
2. The **party list opens pre-filtered** with the filter visible as a removable chip, sorted by amount descending, each row showing balance and days overdue. The aging figures come from `LED-09` over `entry_date`, not `created_at`.
3. He scans the list and makes a human judgement the software should not make for him: he long-presses to multi-select eight, skipping two he knows are in hospital and one he intends to call personally.
4. He taps **याद दिलाएँ** (Remind) and chooses WhatsApp from the share sheet (`LED-06`, `NTF-03`).
5. Because `wa.me` deep links open one chat at a time, the product is honest about it: it presents a queue — "8 में से 1" — with the prefilled message shown, a **Send on WhatsApp** button, and a **Skip** button. Each tap opens WhatsApp with the text already written, he taps send, returns, and the queue advances. *The awkwardness is gone: he is not composing anything, and the message is neutral.*
6. The message is built from the tenant's reminder template (`PLT-06`), in the party's language where set and the tenant's otherwise: shop name, balance, the date since which it has been outstanding, and a UPI intent link carrying the amount and a reference (`PAY-03`).
7. **Writes:** one `ledger_reminder` row per party with `channel='whatsapp'`, `status='sent'`, `triggered_by='bulk'` and a balance snapshot, plus an entry in the party timeline reading "Reminded on 28 Sep" so that next month he can see who has been chased and how often.
8. Two of the eight pay within the hour by UPI. He records each with `LED-01` or `PAY-01`, and their rows drop out of the overdue filter when he refreshes. *The push worked, and he can see that it worked.*

**Failure modes.** WhatsApp is not installed or the number has no WhatsApp — the share sheet offers SMS and Call as alternates, and where an SMS provider is configured the SMS is server-sent and logged. A party has already been reminded twice this week — the row shows "Reminded 2×, last 2 days ago" so he can decide; the product does not impose a cap at MVP but surfaces the information that prevents reminder fatigue. He selects a party whose balance is negative (an advance) — such rows are excluded from the reminder selection with a tooltip explaining why. The balance changes between selection and send — the message is built at send time, not at selection time.

**When the network is poor.** Reminder logging is a small POST per party and is queued: the WhatsApp compose window opens regardless, because it is a local intent, and the log row is written when connectivity returns. A reminder that could not be logged is never lost — it retries from the client queue — and the worst case is a duplicate log row, which is de-duplicated by idempotency key rather than a missing one. Where automated SMS is configured (`LED-07`), the D-1 and D0 sends run entirely on the server's scheduler and are unaffected by his connection.

---

## 15.5 Journey 5 — Creating the first GST invoice

**Who:** Ramesh's billing clerk on the office desktop; the same flow on Anjali's tablet. **Outcome:** a compliant tax invoice, stock deducted, ledger posted, PDF shared. **Emotional arc:** caution on the first one → routine by the fifth.

1. From the sales list (`SAL-08`) or the party's khata page, the clerk taps **New invoice**. The document form opens: party picker at the top, document date defaulted to today, due date derived from the tenant's default credit days (`PLT-06`).
2. She picks **Ramesh Traders' customer, Gupta Stores**, through an async combobox that searches the server and offers "create new" inline (`PTY-01`). Selecting the party snapshots its name, address, GSTIN and state onto the document and sets the **place of supply** from the party's state, editable.
3. The **line editor** (`UbLineItemsEditor`) is the heart of the screen. She types "atta" and the item search returns matches by name, SKU or barcode (`INV-02`); she picks one, and unit price, unit, HSN and tax rate default from the item (`INV-01`). She enters quantity 20. A second line, a third. On mobile the same editor is a stack of cards; on desktop it is a grid with Tab and Enter navigation and no mouse required.
4. The **totals panel** recomputes live as a preview only: taxable value after line discounts, then CGST and SGST at each slab because the place of supply equals the tenant's state, then a document discount, then round-off. The client uses `decimal.js-light`; the server recomputes everything on save and the client's numbers are never trusted (canon §0.11 rule 3).
5. She chooses **On credit** with a due date fifteen days out, rather than recording payment now. Had this been a walk-in, `SAL-07` would require full payment and no party.
6. She taps **Issue**. This is the moment the document becomes real, and it is one atomic transaction (`SAL-02`): a number is allocated from `platform_document_sequence` for the kind and financial year in a form that satisfies Rule 46's sixteen-character consecutive-series rule; `sales_document` and `sales_document_line` rows are written with the party snapshot and the computed tax; `inventory_stock_movement` rows of type `sale_out` are posted and `inventory_item_stock` updated; a `ledger_entry` of `direction='debit'` is posted against the party with `source_type='sales_document'` (`LED-10`); an audit row is written. An `Idempotency-Key` guards the whole thing.
7. The **document view** appears with its number, a status chip reading "Issued", and a share sheet. She previews the **A4 template** with the shop's logo, GSTIN, both parties' details, the tax breakup by slab, the terms, the signature image and a **UPI QR** carrying the amount and the invoice reference (`SAL-03`, `PAY-03`, `WLB-01`). She switches to the **80 mm thermal** template for the copy that goes with the goods.
8. She shares it to the buyer's WhatsApp — a prefilled message with a public link to the same print view (`NTF-03`). **Writes:** a share-link row with a hashed, expiring, revocable token. *The invoice, the stock and the balance moved together in one action, which is the whole product thesis in one screen.*

**Failure modes.** Stock is insufficient — issue returns 409 `insufficient_stock` naming the item and the shortfall, unless the tenant's setting permits negative stock, in which case it posts with a warning. The party has no GSTIN and the value exceeds ₹50,000 — the form requires name, address and state for the unregistered recipient as Rule 46 demands. The tenant is a composition dealer — the server forces the document kind to Bill of Supply and rejects `invoice`, and the tax columns do not render. Two clerks issue simultaneously — sequence allocation is serialised, so numbers are consecutive with no gaps and no duplicates. She realises after issuing that a line was wrong — an issued invoice is not editable; the paths are void with a reason (`SAL-05`) or a credit note (`SAL-04`), and both are reversals rather than edits.

**When the network is poor.** Drafts autosave locally and to the server (`SAL-06`), so a dropped connection mid-invoice loses nothing; the draft is on the list with a "Draft" chip when she returns. The issue action is the one step that must reach the server, and it shows an explicit blocking state rather than an optimistic success, because allocating a number and deducting stock cannot be faked client-side. If it times out, the retry carries the same idempotency key and either completes or replays — it can never produce two invoices with two numbers for one sale.

---

## 15.6 Journey 6 — Receiving and recording a supplier bill with stock

**Who:** Mahesh's nephew at the manufacturing unit; equally Ramesh's godown keeper. **Outcome:** stock in at cost, average cost updated, supplier ledger credited. **Emotional arc:** administrative → quietly satisfying when the on-hand number moves.

1. A supplier's delivery arrives with a paper bill. From the purchases list (`PUR-03`) or the supplier's khata page, he taps **New purchase bill**.
2. He selects the supplier — the same `parties_party` table, this time with `is_supplier=true` (`PTY-01`) — and enters the **supplier's own bill number and date**, which are distinct from anything the product generates. This distinction matters for GST input credit and is a field competitors often conflate.
3. He adds lines: item, quantity, unit **cost** (not selling price), and tax. Items not yet in the master are created inline from the line editor (`INV-01`), which is where most of a new tenant's item master actually comes from.
4. He taps **Record**. In one transaction (`PUR-01`): `purchases_document` and lines are written; `inventory_stock_movement` rows of type `purchase_in` are posted with their unit cost; `inventory_item_stock.on_hand` and `avg_cost` are updated by the weighted-average formula; a `ledger_entry` of `direction='credit'` is posted against the supplier — the business now owes more (`LED-10`, canon §0.2); an audit row is written.
5. The supplier's khata page now reads "आपको देने हैं ₹48,600" in the payable tone, and the item's detail page shows the new on-hand and the shifted average cost with the bill linked in its movement history (`INV-03`).
6. He pays part of it a week later: **Payment out** with mode `bank` and a reference, allocated across two open bills, either automatically by FIFO or manually (`PUR-02`, `PAY-01`). **Writes:** `payments_payment`, `payments_allocation` rows, and a `ledger_entry` of `direction='debit'` reducing what is owed.
7. At month end the purchase register (`RPT-04`) shows every bill with its tax breakup for the accountant, and the stock summary (`RPT-06`) values the material at weighted-average cost. *The Excel material register has nothing left to do.*

**Failure modes.** The same supplier bill is entered twice — the product warns on a duplicate supplier bill number for the same supplier and financial year rather than blocking, since suppliers do occasionally reuse numbers. A line's cost is mistyped by a factor of ten — this silently corrupts the average cost, which is why voiding the bill (`PUR-04`) reverses both the stock movements and the ledger entry and recomputes the average; the product never patches an average in place. Goods arrive before the bill — at MVP the answer is to record the bill when it arrives and backdate it; the goods-receipt-against-PO flow is `PUR-06` in Phase 2. The item's unit on the bill differs from the item's unit — at MVP he converts manually; secondary units are `INV-14` in Phase 2.

**When the network is poor.** The bill form behaves like the invoice form: local draft, server draft, and a single blocking Record action guarded by an idempotency key. Inline item creation is the one sub-call that can fail independently; it retains the typed values and offers retry rather than discarding the line being edited. Inside a metal shed with no signal, the realistic behaviour is that he fills the form, walks to the cabin, and taps Record — so the draft must survive an app backgrounded for twenty minutes, and it does.

---

## 15.7 Journey 7 — The stock-count-and-adjust cycle

**Who:** Ramesh's godown keeper with Ramesh present; Mahesh doing the same for raw material. **Outcome:** the system's on-hand matches the shelf, and every difference has a reason and a name against it. **Emotional arc:** suspicion → evidence → a decision.

1. On the last Sunday of the month, Ramesh opens the **stock summary** (`RPT-06`, `INV-08`) and exports it to CSV (`RPT-08`). The export carries item, SKU, unit, on-hand and value at weighted-average cost, with the current filters applied. He prints it, or opens it on a phone in the godown.
2. The godown keeper counts. For most items the count matches. For eleven it does not: some are short, two are more than the system says, and one is a damaged carton.
3. Back at the desk, Ramesh opens each item's **detail page** (`INV-03`) and reads its movement history before adjusting anything. Every movement links to its source document, so a shortfall of six units traces to an invoice issued last Tuesday that the keeper remembers loading onto a different vehicle. *This is the difference between a stock system and a stock number: the discrepancy has a story.*
4. For the genuine differences he posts a **stock adjustment** (`INV-06`). The drawer asks for quantity with a sign, a **reason from a fixed list** — damage, theft, count correction, personal use, other — and an optional cost. Free-text reasons are allowed in the note but the category is constrained, because a free-text reason field produces data nobody can report on.
5. **Writes:** one `inventory_stock_adjustment` header with the reason and an `inventory_stock_movement` row per line of type `adjustment` with the signed quantity, plus the updated `inventory_item_stock` and a `platform_audit_log` row naming the actor. Movements are immutable (canon §0.11 rule 1); an adjustment entered wrongly is corrected by an opposite adjustment referencing the first, never by editing.
6. The confirmation states the consequence in plain language before he commits — "Stock −6 · Value −₹1,044" — which is the reason-capture pattern standing in for an approval workflow (Part 11 §11.4).
7. Afterwards the stock summary and the shelf agree. The month's shrinkage is now a number he can look at across months rather than a feeling. *He does not enjoy the number, but he trusts it.*

**Failure modes.** An adjustment would take stock negative — blocked with a clear message unless the tenant setting permits negative stock, in which case it posts with a warning; silently allowing negative on-hand is how a stock system loses credibility. The count was taken on Sunday but posted on Tuesday, and sales happened in between — the adjustment carries an `adjustment_date` and the movement is dated accordingly; the product does not pretend the count was live. Staff post adjustments without authority — `inventory.stock.adjust` is off by default for the staff role and must be granted deliberately (Part 14 §14.9). The stock-take session as a first-class object with variance posting is `INV-17` in Phase 3; at MVP the cycle is export, count, adjust, and that is sufficient for a single godown.

**When the network is poor.** Counting happens offline by design: the export is a file, and the godown has no signal. Adjustments are posted afterwards from the desk. Each adjustment is a single small POST with an idempotency key; a failed post keeps the drawer's contents and retries. Nothing in this cycle requires connectivity at the moment of counting, which is the correct design for a room with metal walls.

---

## 15.8 Journey 8 — GST filing preparation with the accountant

**Who:** Vikram Joshi, CA, for Ramesh's business. **Outcome:** a return filed from exported data with no re-keying and no revision. **Emotional arc:** wary of another app → checking → convinced by the numbers tying.

1. On the eleventh of the month Vikram logs in. He is a member of forty tenants and switches to Agarwal Trading with the tenant switcher (`PLT-04`), which re-issues his token with the new `tid`. His role is `accountant`: he can read everything and export everything and cannot write anything at all.
2. He opens the **GST summary** (`RPT-07`) for the previous month. It shows outward supplies by slab with CGST, SGST and IGST separated; inward supplies by slab; an **HSN summary**; and a **document series summary** listing each series with its from-number, to-number, total and cancelled count. *The series summary is the first thing he checks, because a gap in an invoice series is the error that costs him a revision.*
3. He cross-checks the outward total against the **sales register** (`RPT-03`) for the same period. They tie to the rupee. Rounding is half-up at line and document level per the GST rules and is applied identically in both reports because both read the same stored document totals rather than recomputing.
4. He notices one invoice dated 20 September 2025, before the slab change of 22 September 2025, that was reprinted this month after a query. It still computes at the old rates, because `tax_rate` carries effective dates and rate resolution is by document date. *A product that hard-coded a rate enum would have quietly produced a wrong figure here, and he would have found it only after filing.*
5. He opens the **purchase register** (`RPT-04`) and reconciles it against GSTR-2B by eye, flagging two supplier bills whose GSTIN does not match what the portal shows. He cannot correct them — he has no write permission — so he leaves a note for Ramesh through the only writing an accountant may do, and Ramesh fixes the party's GSTIN.
6. He **exports** the sales register, purchase register and GST summary to Excel (`RPT-08`). For a large range the export runs as a background job and a download link arrives in the notification inbox (`NTF-01`); for a normal month it is immediate. The files open in Excel with the columns he expects and amounts as numbers, not text.
7. He spots one corrected entry in the day book (`RPT-02`) and follows it: `LED-03` shows the reversal, the replacement, the reason and the person. *Nothing was deleted. This is the moment he decides to move three more clients onto the product.*
8. He prepares GSTR-1 and GSTR-3B in the offline tool from the exports and files. **Writes:** nothing at all, other than `platform_audit_log` rows recording his reads and exports, which is exactly the property that makes his verdict on the numbers meaningful.

**Failure modes.** The GST summary and the sales register disagree — this is a launch blocker, not a support ticket, and the fixture suite of Part 12 §12.5 exists to prevent it. The export is too large and times out — `RPT-08` runs large ranges as a background job with a download link precisely so that the month with the most data is not the month that fails. A document was voided after the previous filing — voids are reversals with their own dates, so the prior period's figures do not retroactively change; the void appears in the current period where the accountant can account for it. GSTR-1 JSON in the offline tool's schema is `RPT-12` in Phase 2 and Tally XML is `RPT-13` in Phase 3; at MVP Excel is the hand-off, which matches what he does today.

**When the network is poor.** Not a factor: Vikram has broadband. The relevant constraint is different — report queries must stay within their performance budgets at a year of data, which is a pagination and index problem (Part 21 §21.4), not a connectivity one.

---

## 15.9 Journey 9 — Adding and supervising a staff member

**Who:** Ramesh inviting his billing clerk; Suresh's garments-shop counterpart inviting Sunita. **Outcome:** a second person working, with a boundary the owner can see. **Emotional arc:** nervous about access → reassured by attribution.

1. Ramesh opens **Team** (`PLT-05`) and taps Invite. He enters a mobile number and picks a role from four cards, each of which states in one line what the role can and cannot do — not a permission matrix, which nobody reads. He picks **Staff**.
2. **Writes:** a `platform_invitation` row with a hashed token and an expiry. A message goes out with a link; where no SMS provider is configured he shares the link over WhatsApp himself.
3. The clerk opens the link, verifies her mobile with an OTP or sets a password for desktop use (`PLT-02`), and appears in the team list with status `active`. Her `platform_membership` carries role `staff` and the permission set of canon §0.9.
4. She bills all afternoon. Every document and entry she creates carries `created_by_id`, and the timeline shows "by Priya" on rows the viewer did not create (`LED-01` FR-8).
5. She tries to void an invoice she raised wrongly. The action is **not shown** to her — hidden rather than shown-and-refused, because a permission error in front of a customer is worse than an absent button (Part 14 §14.11). She raises a credit note instead, which she is allowed to do, or asks Ramesh.
6. Ramesh checks the **audit log** (`PLT-08`) at the end of the week: filterable by actor, entity and date, with before-and-after snapshots on critical entities. He sees the credit note, its reason and its consequences. *He has not lost control by delegating; he has gained a record.*
7. Two months later the clerk leaves. He sets her membership to `removed`; her sessions are revoked immediately (`PLT-09`) and her past entries remain attributed to her, because attribution is history and must not be erasable.

**Failure modes.** The invitation expires unused — it can be resent, and a new token invalidates the old one. The invited number already belongs to a user who is a member of other tenants — they simply gain a membership and see a tenant switcher, which is the `PLT-04` behaviour and must not be treated as a conflict. He grants Admin when he meant Staff — roles can be changed, and a role change forces a logout so a stale token cannot carry the old permissions. Staff need one extra permission, such as stock adjustment — at MVP the answer is the role's documented default plus a per-membership flag for `inventory.stock.adjust`; genuinely custom roles are `PLT-12` in Phase 3. Staff share one login to save an invitation — the product cannot prevent it, but attribution becomes worthless, so the team screen states plainly why each person needs their own.

**When the network is poor.** Invitation acceptance is a short online flow. The important resilience is elsewhere: once she is signed in, her session survives connectivity loss, her drafts persist, and a token refresh failure returns her to a login screen with her drafts intact rather than discarding unsaved work.

---

## 15.10 Journey 10 — The customer's side

**Who:** the end customer (CU) — a household buyer or a retailer. **Outcome:** they know what is owed, they agree with it, and they pay without installing anything. **Emotional arc:** mild anxiety at an unexpected message → reassurance at seeing the detail → the small satisfaction of clearing it.

1. An entry is posted against them. Where an SMS provider is configured and they have opted in, an SMS arrives within seconds (`LED-08`): the shop's name, what was added, and the new balance. The sender is a registered six-character header and the content matches a registered template exactly, because a message that does not match its template is dropped at scrubbing and never arrives at all.
2. A week later a reminder arrives over WhatsApp (`LED-06`) or SMS (`LED-07`), a day before the collection date. It is short, neutral and states the balance, the shop name and a link.
3. They tap the link and a **public statement page** opens in the phone's browser (`LED-04`): the shop's logo and name, the date range, every entry with its date, note and amount, and a running balance — the same view the merchant sees, rendered with the tenant's branding. No login, no app install, no account. The token behind the link is hashed, expiring and revocable, and the page carries `noindex` and no referrer.
4. They scroll and find an entry they do not recognise. Because the page shows the note — "चीनी 10 किलो" — and the date, they remember it. *The dispute ends before it becomes a conversation.* If it had not, they would call the shop, and the merchant would use `LED-03` to correct it with a reason that stays visible on the statement.
5. They pay. The statement page and the invoice PDF both carry a **UPI QR** and an intent link built from the tenant's own VPA with the amount and a reference (`PAY-03`). Scanning opens their UPI app with the amount pre-filled; the reference is what allows the payment to be matched later.
6. The merchant records the receipt — at MVP manually, entering the UTR (`PAY-01`, `LED-01`), which takes ten seconds and is honest about what the product can and cannot see. From Phase 2 with an aggregator (`PAY-06`) the credit posts automatically through a webhook, and a credit that cannot be matched to a party lands in the unmatched queue (`PAY-07`) rather than disappearing.
7. From Phase 2 the customer also gets a persistent **"view your khata" link** (`PTY-09`) and, for an invoice, a page with a pay button (`SAL-14`).

**Failure modes.** They reply STOP or ask to stop receiving messages — the per-party opt-out is respected immediately on every channel, and the merchant sees that messaging is off for that party rather than wondering why reminders stopped. The number belongs to someone else, or has been recycled — this is why the statement link is expiring and revocable and why the page names the party prominently, so a wrongly-shared statement is obvious to the recipient. They pay but the merchant does not notice — the single largest complaint in the whole category, addressed at MVP by the UTR field and the reference on the intent link, and at Phase 2 by the unmatched queue. They have no smartphone — SMS carries the balance in the message body itself, so the essential information does not depend on the link.

**When the network is poor.** The statement page is a server-rendered print view with no application shell to download, which is deliberate: it must open on a cheap phone on a weak connection. Payment happens in their UPI app, outside the product entirely. Nothing in this journey requires the customer to have a good connection or any storage.

---

## 15.11 Journey 11 — A white-label partner onboarding a merchant

**Who:** Neha's field relationship manager, with Neha's configuration behind him. **Outcome:** a merchant live on the partner's branded product in one visit. **Emotional arc (the merchant's):** "another app from the bank" → "this is actually mine".

1. Before any of this, Neha configured the partner (`WLB-02`): a `platform_partner` row with default branding, allowed modules, support contact and legal footer. At MVP this is done by Metis through the super-admin console (`PLT-14`); from Phase 2 she does it herself in the partner console (`WLB-04`) on her own hostname (`WLB-03`).
2. The relationship manager visits a merchant with a tablet. He opens the partner-branded link. At MVP branding resolves from the tenant after sign-up and from a partner code on the link before it; from Phase 2 the hostname resolves the partner's branding **before** login, so the merchant never sees a name other than their bank's.
3. Sign-up runs exactly as journey 1 (`PLT-01`, `PLT-03`), except that the new tenant inherits the partner's branding defaults, module entitlements and support contact. **Writes:** `platform_tenant` with `partner_id` set, and entitlements resolved from the partner's plan (`PLT-15`).
4. The relationship manager does the thing that actually determines whether this account survives: he sits for twenty minutes and types the merchant's open balances in, or fills the CSV template and imports it (journey 2). *This is the partner's real product, and the software's job is to make those twenty minutes sufficient.*
5. He shows the merchant three things and no more: record an entry, share a statement, send a reminder. Depth is discovered later; a first visit that demonstrates eleven features produces a merchant who uses none.
6. Messaging goes out under the partner's identity from Phase 2 (`WLB-06`): its sender header, its templates, its WhatsApp number. At MVP the messages carry the tenant's own name with the partner's legal footer on documents, which is sufficient for the merchant's customers and honest about what has been configured.
7. Neha watches her portfolio from the partner console (`WLB-04`, Phase 2): merchants onboarded, merchants active this week, entries per merchant. Her support team is L1 and escalates to Metis as L2 under a written model, because the research names support as the category's largest failure mode and an undefined support boundary is how a partner relationship ends.
8. Where the merchant consents, the ledger data is what Neha's credit team wanted all along — and consent, its record, its scope and its withdrawal are properties of the product (`PLT-10`, the party opt-in flags), not of a side agreement.

**Failure modes.** The partner's colours fail contrast checks — `WLB-05` validates token overrides for contrast, and at MVP branding is limited to a logo and two colours applied through CSS variables, which cannot produce an unreadable interface. The partner wants a module the merchant should not have — module entitlements are enforced server-side and a disabled module's endpoints return `module_disabled`, not an empty screen. A merchant leaves the partner — the tenant's data is theirs and `PLT-10` exports it; nothing in the model holds it hostage, which is also what makes the partner's compliance review pass. The partner asks to see merchant data directly — they cannot: a partner administrator is not a tenant member and reaches tenant data only through consented, audited impersonation (Part 14 §14.9).

**When the network is poor.** Field onboarding often happens on a merchant's premises with a mobile connection. The flow is designed so that the two steps that must be online are short — OTP and tenant creation — while the long step, entering balances, tolerates interruption because the import is a file and the job runs on the server.

---

## 15.12 Journey 12 — Discovering a wrong entry a week later

**Who:** Suresh, with a customer standing in front of him disputing a balance. **Outcome:** the ledger is right, the correction is visible to both sides, and nothing was deleted. **Emotional arc:** embarrassment → control → trust restored, in both directions.

1. The customer says the balance is wrong: he paid ₹1,000 last Tuesday and it is not showing. Suresh opens the **khata page** and scrolls the timeline (`PTY-03`). *He is being watched while he does this, which is exactly the condition the interface has to survive.*
2. He finds it. The ₹1,000 was entered as "You gave" instead of "You got" — a direction error, the most common mistake in this product and the reason the drawer's direction accent is red or green rather than a label alone. The entry is a week old and has already been reflected in a statement he shared.
3. He taps the row and opens the entry detail, which shows the amount, the direction, the mode, the date, who created it and its history chain (`LED-03`).
4. He taps **Correct**. The dialog shows the existing values, lets him change amount, date, note and direction, and **requires a reason** of at least three characters. He types "गलत तरफ लिख दिया".
5. On save, the server performs one atomic operation: it posts a **reversal** entry that exactly negates the original, marks the original `status='reversed'` with `reversed_by_id`, and posts a **replacement** entry with `supersedes_id` pointing at the original. Nothing is updated in place; nothing is deleted. The party's balance is recomputed and moves by ₹2,000 — the ₹1,000 that should not have been added, and the ₹1,000 that should have been subtracted.
6. The timeline shows all three rows with a corrections toggle, so the customer looking over the counter can see the original, the reversal and the correction with the reason. *The embarrassing thing is now the reassuring thing: the merchant did not quietly change a number.*
7. He re-shares the statement (`LED-04`), which now shows the corrected running balance and, with corrections shown, the trail. **Writes:** two `ledger_entry` rows, a status change on the third, and `platform_audit_log` rows for the correction naming the actor, the reason, the before and the after.
8. Had the wrong entry been a document rather than a manual entry — an invoice with a wrong line — the path would differ: document-sourced ledger entries cannot be reversed directly and return `use_document_void`. The invoice is voided with a reason (`SAL-05`), which reverses its stock movements and its ledger entry together, or a credit note is raised (`SAL-04`). The principle is identical: the correction is a new event, never an edit.

**Failure modes.** Staff attempt the correction — `ledger.entry.correct` is owner and admin only, so Sunita or the clerk sees no Correct action and must ask; this is deliberate friction on the one operation that changes history. The entry being corrected is itself already a correction — the chain is followed and displayed; a correction of a correction is legal and each link is visible. The wrong entry was against the wrong **party** entirely — at MVP this is a reversal on one party and a new entry on the other, which leaves an honest trail; a single "move entry" preset is noted as a future enhancement in `LED-03` §24. The customer disputes the correction itself — the statement with corrections shown is the evidence, and it is shareable.

**When the network is poor.** The correction is a single atomic POST and is never optimistic: the user sees a blocking state, because showing a corrected balance that has not been persisted is worse than a two-second wait. A failure preserves the dialog and its reason text and retries with the same idempotency key, so a correction cannot be applied twice and produce a double reversal.

---

## 15.13 Patterns that repeat across every journey

Reading the twelve journeys together, five behaviours recur. They are stated here once so that a feature not listed above inherits them rather than inventing its own.

**The blocking-versus-optimistic rule.** An action is optimistic when the user's mental model already contains the result and a failure is recoverable — posting a ledger entry, logging a reminder. An action is blocking when the server produces something the client cannot know: a document number, a stock deduction, a corrected balance. Optimistic actions show a provisional row and a retry; blocking actions show an honest wait. No action is ever silently dropped, and every retry reuses its idempotency key.

**Drafts are never lost.** Any form long enough to be interrupted — invoice, purchase bill, import, correction dialog — retains its contents through a connection failure, an app backgrounded, and a token refresh. This is a single mechanism, not per-feature heroics.

**Nothing is deleted, and the trail is shown to the user.** Corrections, voids and adjustments are new events with reasons, visible in the interface rather than buried in an admin log. Journeys 7 and 12 exist to prove that the trust differentiator of Part 11 §11.2 is something the merchant experiences, not something the architecture merely permits.

**The twenty-minute migration is the product's real onboarding.** Journeys 2 and 11 are the same journey seen from two sides. Everything else in the product is worth nothing if the opening balances are not in, which is why `PTY-10` and `IMP-01` sit above most other MVP features in practical priority despite being unglamorous.

**The customer is a participant, not a record.** Journey 10 is the only journey whose protagonist has no account, and its quality determines whether the merchant's ledger is credible to the person who owes the money. Every messaging decision — opt-in, opt-out, template discipline, the D-1/D0 default, the expiring link — is made from that person's side, not the merchant's.
