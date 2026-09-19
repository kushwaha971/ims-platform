# Part 14 — User Personas

## 14.0 How these personas are used

These eight personas are the named users referenced in §2 of every FRD feature specification and in every user story of the form `US-<FEATURE>-n`. They are not marketing segments and they are not composites invented to justify decisions already made; each is built from the behaviour documented in the research dossiers — store reviews, aggregator complaints, buyer surveys and the demographic reality that the Indian owner-operator is typically between forty-five and fifty-four years old and that more than half of small businesses report that finding and setting up digital tools is hard.

Each persona is written with the same twelve fields so they can be compared. Two of those fields — **what would make them switch** and **what would make them churn** — matter more than the rest. A persona without a switching trigger is a person who will never adopt, and a persona without a churn trigger is a fantasy.

The persona codes match those used in Part 16: **OW** owner, **ST** staff, **AC** accountant, **PA** partner admin, **SA** super-admin, **CU** end customer. A persona is not a role; §14.9 maps them to the four system roles of canon §0.9, and §14.10 gives the module-priority matrix that drives default navigation and onboarding by business type.

---

## 14.1 Suresh Sharma — the kirana owner

**Identity.** Fifty-one, runs Sharma General Store in a residential lane in Kanpur, has served the same three hundred households for twenty-two years, and knows most of his customers' children by name.

**Business context.** A single shop of roughly thirty square metres, around ₹28 lakh annual turnover, below the GST registration threshold and unregistered. Two hundred to two hundred and fifty active credit customers, of whom perhaps eighty carry a balance at any time. Total receivables hover around ₹1.8 lakh — a substantial fraction of his working capital. He has one helper who is family. He buys from four distributors, three of whom give him credit.

**Daily routine.** Opens at 7 a.m. Serves through two peaks — morning before office hours and evening after seven. Writes udhaar entries in a ruled notebook with a pencil while the customer waits, often with just a name and an amount. Restocks from a distributor's salesman who visits on Tuesdays and Fridays and leaves a handwritten bill. Closes at 9.30 p.m. and counts cash. On Sundays he adds up the notebook and decides who to call.

**Device and connectivity.** One Android phone, around ₹12,000, 3 GB RAM, three years old, storage nearly full. Data is a prepaid pack; the shop's signal drops when the metal shutter is half down. No computer. No printer. He does have a UPI QR standee from a payments company on the counter.

**Digital literacy and language.** Comfortable with WhatsApp, UPI and YouTube; uncomfortable with anything that asks him to read English forms. Hindi with Devanagari, but he types in Roman script. He will not read a help article; he will ask his nephew or the distributor's salesman.

**Current tools and workarounds.** The notebook is the system of record. A UPI app for collection, with no link to the notebook. WhatsApp for orders to distributors and for occasionally photographing a page of the notebook to send to a customer who disputes a balance. He tried a free khata app two years ago, entered forty customers, and stopped when he could not find an entry he had made and the app showed him a loan offer instead.

**Goals.** Know the total he is owed without adding up a notebook. Get paid faster without having to ask in person, because asking in person is awkward and sometimes loses him a customer. Stop losing the twenty or thirty thousand rupees a year he writes off because an entry was illegible or was never written.

**Frustrations.** Apps that are slow while a customer is waiting — this is the single thing that will make him close the app permanently. Interfaces that grow denser with every update. Being sold something in the middle of writing an entry. Not being able to find yesterday's entry.

**What would make him switch.** A salesman or a bank field agent sitting with him for twenty minutes and typing his eighty open balances in, so that he starts with a book that is already correct. After that, an entry that takes less time than the pencil does, and a customer who receives a message confirming what was written. Nothing else moves him.

**What would make him churn.** One lost or changed balance. A week of the app being slow. An advertisement between the amount and the Save button. A renewal price he did not expect.

**Features that matter most.** `LED-01`, `LED-02`, `PTY-01`, `PTY-02`, `PTY-03`, `LED-04`, `LED-06`, `LED-05`, `PAY-03`, `PTY-10`, `RPT-01`, `LED-08`. Inventory and GST are irrelevant to him at first and should be out of his way by default; `PLT-03` turning stock tracking off for his business type is the difference between a usable and an overwhelming product.

**Success metric.** Receivables outstanding falls, and his days-to-collect falls. Concretely: he can state his total receivable within five seconds of opening the app, and the share of his receivables older than sixty days drops over a quarter.

---

## 14.2 Ramesh Agarwal — the wholesale trader and distributor

**Identity.** Thirty-nine, second generation in Agarwal Trading Company, a packaged-foods and household-goods distributor in Surat supplying about a hundred and forty retailers across four routes.

**Business context.** ₹6 crore annual turnover, GST-registered under the regular scheme. A shop-front office and a godown two streets away. Six employees: two salesmen on routes, one godown keeper, one billing clerk, one collections person and himself. Around 140 active customer parties and 20 supplier parties. Receivables of ₹35–45 lakh at any moment, which is his real business risk. Credit terms of seven, fifteen or thirty days depending on the retailer, and he tracks them in his head and in a diary.

**Daily routine.** In by 8.30 a.m. Reviews yesterday's collections with the collections person. Approves the day's dispatch list. Salesmen leave with order books; orders arrive back over WhatsApp through the day. The billing clerk raises invoices in the afternoon for the next morning's dispatch. Ramesh spends an hour most evenings deciding which retailers to stop supplying because they are over their limit, and he makes those calls himself.

**Device and connectivity.** A Windows desktop in the office running billing software, a ₹20,000 Android phone for himself, cheap Android phones for the salesmen. Broadband in the office that drops occasionally; mobile data on the routes that is patchy between villages. A dot-matrix or laser printer for invoices, and he has thought about thermal printers.

**Digital literacy and language.** High for his context. Reads English competently but prefers Hindi and Gujarati for anything long. Uses Excel for price lists and for the outstanding statement he sends his accountant. Understands GST well enough to argue with his CA.

**Current tools and workarounds.** A desktop billing package for invoices and stock, a diary for credit limits, WhatsApp for orders and reminders, Excel for the price list and the route-wise outstanding sheet, and his accountant's Tally for the returns. Four systems that do not talk to each other; his monthly reconciliation takes a day and a half.

**Goals.** Never ship to a retailer who is already over their limit. Know receivables by route and by age, not just in total. Cut the reconciliation from a day and a half to an hour. Give his salesmen something better than a paper order book.

**Frustrations.** Credit limits exist in no mobile product and only in the expensive desktop tiers of the incumbents. His billing software cannot tell him aging by route. His salesmen's collections are reconciled from a cash count and a memory. Every product that could do all of this is either a desktop-only package his salesmen cannot use, or a phone app with no stock and no GST.

**What would make him switch.** Credit limits that actually block a sale, aging he can filter by tag, and one system where the invoice, the stock movement and the party balance are the same event. The ability to give six people different levels of access without buying six licences.

**What would make him churn.** A stock number that disagrees with the godown. An invoice series with a gap in it that his CA finds during a GST filing. Being unable to enter a purchase bill because the product insists on a purchase order first.

**Features that matter most.** `PTY-06`, `LED-09`, `RPT-05`, `PTY-05`, `SAL-02`, `SAL-08`, `PUR-01`, `PUR-02`, `PUR-03`, `INV-01`, `INV-08`, `PAY-01`, `PLT-05`, `RPT-03`, `RPT-07`. In Phase 2: `INV-11`, `INV-13`, `PUR-05`, `PUR-07`, `RPT-11`. In Phase 3: `LED-15`, `SAL-12`, `SAL-13`.

**Success metric.** Days sales outstanding falls by a week; bad-debt write-offs fall; month-end reconciliation drops below two hours. He is also the persona whose willingness to pay is highest, so his retention is the commercial metric that matters most.

---

## 14.3 Anjali Deshpande — the services professional

**Identity.** Thirty-four, owns Glow Salon in a Pune neighbourhood; stands in for the whole services cluster — salons, clinics, repair shops, tuition centres, small consultancies and freelance professionals — whose defining trait is that they sell time and skill, not goods.

**Business context.** ₹22 lakh annual turnover, GST-registered because her landlord's commercial lease and her supplier invoices made it simpler. Four staff, two of whom are on commission. She sells services with SAC codes, and a small amount of retail product (shampoo, serums) that she does hold as stock. Perhaps thirty regular clients run a tab — package customers who pay monthly rather than per visit. She also has two corporate clients who book staff for events and pay against invoices at thirty days.

**Daily routine.** Opens at 10 a.m. Works on clients herself for much of the day. Bills at the desk between appointments, usually cash or UPI, occasionally on the package tab. Once a month she raises proper invoices for the corporate clients and chases them. She orders product from two distributors when she notices a shelf is empty.

**Device and connectivity.** An iPhone for herself, an Android tablet at the reception desk, reliable broadband. A small thermal printer at the desk for receipts. She would not buy a Windows PC for this.

**Digital literacy and language.** High. English and Marathi; uses Instagram for the business and a booking app for appointments. Comfortable with forms, impatient with anything that takes more than a few taps.

**Current tools and workarounds.** A booking app that handles appointments but not money properly, a notebook for package balances, UPI for collection, and an accountant who asks for invoice copies over WhatsApp each quarter. Her retail product stock is guessed at.

**Goals.** Invoice her corporate clients properly and get paid on terms. Keep package balances straight so a client and her receptionist never disagree. Know whether the retail product line makes money. Not employ anyone to do administration.

**Frustrations.** Every product in the category is built around goods: it asks for HSN codes, units and quantities for a haircut. Stock fields she does not need clutter every screen. Nothing handles "customer has paid for a package of eight and has used five", which is exactly a running balance and yet nothing models it as one.

**What would make her switch.** A business type that removes the goods vocabulary — services with SAC, no quantity gymnastics, stock tracking off except for the few items she does stock. A party page where a package balance behaves like any other udhaar balance. Invoices she can send and chase without a desktop.

**What would make her churn.** Being made to fill in inventory fields. An invoice template that looks like a distributor's. Anything that requires a computer.

**Features that matter most.** `PLT-03` with the services business type, `SAL-02` in service mode, `SAL-01`, `SAL-03`, `PTY-03`, `LED-01`, `LED-04`, `PAY-01`, `PAY-03`, `EXP-01`, `RPT-01`, `RPT-07`. A smaller but real dependency on `INV-01` for the retail line. In Phase 2: `SAL-10` (recurring invoices) is the single feature that would most change her month.

**Success metric.** Corporate receivables collected within terms; zero disputes over package balances; her quarterly hand-off to the accountant takes one export instead of a WhatsApp thread.

---

## 14.4 Mahesh Patel — the small manufacturer and job-worker

**Identity.** Forty-six, runs Patel Engineering Works in Rajkot: a nine-person unit doing sheet-metal fabrication, partly on its own account and partly as job-work for two larger firms.

**Business context.** ₹1.4 crore annual turnover, GST-registered. Buys raw material (sheet, rod, consumables) from four suppliers, sells finished parts to eleven regular buyers, and does job-work where the customer's material comes in and goes out as a processed part with only a labour charge billed. Goods move on e-way bills when they exceed fifty thousand rupees. He carries about ₹12 lakh of receivables, mostly from two large buyers who pay at forty-five to sixty days regardless of terms.

**Daily routine.** On the floor from 9 a.m. Material in, job cards out, dispatch in the afternoon. His nephew handles paperwork: purchase bills, delivery challans, invoices and the e-way bills. Mahesh checks the bank at night and decides whom to pay. Once a month the accountant comes for two days.

**Device and connectivity.** One shared Windows PC in a cabin, his own Android phone, his nephew's phone. Broadband that works. A laser printer. The floor has no coverage inside the shed.

**Digital literacy and language.** Moderate. Gujarati and Hindi, functional English. He understands stock and costing intuitively — he can tell you the material cost of a part — but not in accounting vocabulary.

**Current tools and workarounds.** Tally at the accountant's office, Excel for the material register and job cards, a challan book, and the government portal for e-way bills. Raw-material stock is tracked in Excel and is usually wrong by the end of the month.

**Goals.** Know the raw material on hand and its cost. Bill job-work correctly without pretending it is a goods sale. Get paid by the two large buyers closer to terms. Stop the Excel material register.

**Frustrations.** Products aimed at him are priced and shaped like ERP systems. Products he can afford have no concept of material issue, and nothing at his price point handles job-work. Delivery challans are done on paper and then re-entered as invoices.

**What would make him switch.** Purchase bills that update material stock at real cost, invoices with correct HSN and place of supply, and a stock adjustment flow he can use to correct the register after a physical count. Later, delivery challans that convert to invoices, and e-way bills from the same screen.

**What would make him churn.** Being pushed into a bill-of-materials model he does not use. Stock valuation that does not match what he paid. Anything that makes his nephew's paperwork longer than it is now.

**Features that matter most.** `PUR-01`, `INV-01`, `INV-05`, `INV-06`, `INV-08`, `SAL-02`, `SAL-03`, `PTY-01`, `LED-09`, `PAY-01`, `RPT-06`, `RPT-07`, `EXP-01`. In Phase 2: `SAL-09` (delivery challan) and `PUR-08` (landed cost). In Phase 3: `SAL-13` (e-way bill), `INV-17` (stock take). Part 11 §11.3 item 6 is explicit that BOM is not built for him at MVP, and he is the persona that decision costs the most — it is accepted because the material register, not the BOM, is the thing that is actually broken in his business today.

**Success metric.** The Excel material register is abandoned; physical count variance falls below two percent; job-work invoices reconcile with the buyers' records without a phone call.

---

## 14.5 Sunita Kumari — the shop staff member

**Identity.** Twenty-six, works the counter at a garments shop in Lucknow six days a week; the person who uses the product most and owns none of it.

**Business context.** She is not the buyer and never will be. Her employer bought the product; she was invited by mobile number and given the staff role. She bills between forty and eighty customers a day at peak, takes payments in four modes, and sometimes records udhaar for regulars when the owner is out.

**Daily routine.** Arrives before opening. Bills continuously through the day, often with a queue. Takes cash, UPI and card. Writes credit entries only for customers the owner has told her about. Hands over the cash count at close. When the owner is away she photographs anything unusual and sends it on WhatsApp.

**Device and connectivity.** A shared Android tablet at the counter, plus her own ₹9,000 phone. Shop Wi-Fi that works most of the time; mobile data she pays for herself and would rather not spend on work.

**Digital literacy and language.** Moderate. Hindi first; reads Roman-script Hindi faster than Devanagari. She is fast at anything repetitive once she has learned it and slow at anything that changes.

**Current tools and workarounds.** Whatever her employer installed. A calculator. The paper bill book when the app is slow — which is the failure mode that matters, because it is invisible to the owner until the numbers disagree.

**Goals.** Get through the queue. Not be blamed for a mistake. Not have to ask the owner how to do something in front of a customer.

**Frustrations.** Screens that change position between updates. Being blocked by a permission with no explanation. Losing a half-filled bill because the connection dropped. Being unable to correct her own typo and having to wait for the owner.

**What would make her adopt.** A billing screen where the item search is fast and the keyboard does not cover the total. A draft that survives a dropped connection. An error message that says what to do rather than what went wrong.

**What would make her abandon it.** Any flow that is slower than the paper bill book during a queue. She will not complain; she will quietly use paper, and the owner will discover it a month later.

**Features that matter most.** `SAL-02`, `SAL-06` (draft autosave is her safety net), `SAL-07`, `INV-02`, `PAY-01`, `PAY-02`, `LED-01`, `PTY-01`, `PTY-03`, `SAL-03`. She is the primary reason the `LED-01` eight-second budget and the offline-draft behaviour of the shared UX rules exist.

**Success metric.** Bills per hour at peak matches or beats the paper bill book; her error rate — corrections raised against her entries — stays below two percent; she never falls back to paper.

---

## 14.6 Vikram Joshi — the family accountant and part-time CA

**Identity.** Forty-eight, a practising chartered accountant in Nagpur with about sixty small-business clients, of whom eleven are on some app and the rest are on Tally or on paper.

**Business context.** He is the second, non-paying user in almost every small business — the "1 user + 1 CA" seat that every competitor's pricing page includes for a reason. He files GSTR-1 and GSTR-3B monthly or quarterly for his clients, does their income tax, and is the person they call when a notice arrives. He is also the single most influential person in whether a small business adopts or abandons a product, because his verdict is treated as final.

**Daily routine.** Client data arrives between the tenth and the eighteenth of the month in whatever form the client manages — a Tally backup, an Excel export, a WhatsApp album of invoice photographs. He or his two articles re-key what cannot be imported, reconcile GSTR-2B against purchases, prepare the returns, and chase the clients who have not sent anything.

**Device and connectivity.** A Windows desktop with Tally and the GST offline utility, a laptop, an Android phone. Good connectivity. Two printers.

**Digital literacy and language.** High, within a narrow band. Fluent in English and the vocabulary of Indian indirect tax. Suspicious of anything that claims to do his job and unsentimental about anything that reduces his re-keying.

**Current tools and workarounds.** Tally, Excel, the GST portal and the offline tool, WhatsApp. His universal integration is a CSV file, and his universal complaint is a file that will not import cleanly.

**Goals.** Receive client data in a form he can use without re-keying. Have the numbers agree — outward supplies by slab, HSN summary, document series — so that a filing does not need a correction. Never be surprised by a client's invoice series having a gap.

**Frustrations.** Exports that lose the tax breakup. Products whose GST summary does not tie to their own sales register. Clients who delete entries. Mobile apps that produce a PDF when he needed a spreadsheet.

**What would make him recommend it.** A GST summary that reconciles to the sales register to the rupee; an export that opens in Excel with the columns he expects; a series summary that proves there are no gaps; and an audit trail showing that a corrected entry was corrected rather than deleted. If he recommends it, his clients adopt it; if he objects to it once, they do not.

**What would make him reject it.** One filing that had to be revised because the software's numbers were wrong. Amounts that do not round the way GST requires. An inability to see what changed after he had already filed.

**Features that matter most.** `RPT-07`, `RPT-03`, `RPT-04`, `RPT-02`, `RPT-05`, `RPT-08`, `PLT-08`, `LED-03` (the correction trail is what he checks), `LED-04`, `SAL-02` numbering and series discipline. In Phase 2: `RPT-12` (GSTR-1 JSON). In Phase 3: `RPT-13` (Tally XML), which is the single feature most likely to convert him from tolerant to advocate.

**Success metric.** Time from receiving a client's data to a filed return; number of revised filings per year, which should be zero; and the number of his clients he actively moves onto the product, which is the acquisition channel this persona represents.

---

## 14.7 Neha Raghavan — the platform partner administrator

**Identity.** Thirty-six, heads merchant products at a regional NBFC that lends working capital to about forty thousand retailers across three states, and is the person who would decide to white-label DigiKhaato.

**Business context.** Her employer already has a merchant-facing app used mainly for loan repayment and a field force of two hundred relationship managers who visit merchants monthly. The NBFC's problem is that it underwrites on bank statements and bureau data, which describe a merchant's past and not their book. It has no view of a merchant's receivables, stock or sales. Her mandate is engagement and underwriting data, not software revenue; a bookkeeping product is a means to both.

**Daily routine.** Vendor reviews, a roadmap she does not control, compliance and information-security questionnaires, and a field team asking when a promised feature lands. She spends more time on procurement and risk sign-off than on product.

**Device and connectivity.** Corporate laptop, managed Android phone, a VPN, and an information-security team that will ask where the data is hosted, what third-party services it calls, and who can see it.

**Digital literacy and language.** Professional. English. She reads architecture diagrams and will forward the dependency list to a security reviewer.

**Current tools and workarounds.** An in-house app built by a vendor, a CRM, and spreadsheets from the field team. Her attempts to add bookkeeping have stalled twice on build cost.

**Goals.** Merchants opening the app weekly rather than monthly. Consented, structured ledger data to underwrite against. Her own brand on the product, her own sender identity on its messages, and her own support team as the first line. Deployment that her security review can approve.

**Frustrations.** Vendors who treat white-label as a logo upload and a colour variable. Products that require a dozen managed cloud services she then has to get approved. Not being able to see her own merchants' usage. Support escalations that go to a vendor with no SLA.

**What would make her sign.** A Partner record that genuinely owns branding, allowed modules and entitlements, with tenants inheriting them (`WLB-02`, `PLT-15`); a hostname and login page carrying her brand (`WLB-03`); a console showing her merchants and their usage (`WLB-04`); messaging that goes out under her sender ID and templates (`WLB-06`); a deployment she can run on a single machine with PostgreSQL and no exotic dependencies (ADR-019, ADR-021); and an immutable, auditable ledger whose data is defensible in a credit decision.

**What would make her churn.** A data incident. A support model where her merchants' problems disappear into a queue. A roadmap that ships something she must explain to her compliance team without notice. Per-seat pricing, which does not fit a per-merchant economic model.

**Features that matter most.** `WLB-01`, `WLB-02`, `PLT-15`, `PLT-14`, `PLT-08`, `PLT-10`. In Phase 2: `WLB-03`, `WLB-04`, `WLB-05`, `WLB-06`. In Phase 3: `PLT-13` (API keys and webhooks) and `PLT-16` (billing), by which point the commercial relationship needs machinery.

**Success metric.** Monthly active merchants as a share of her portfolio; the share of loan applications where ledger data was available at underwriting; support tickets escalated beyond her L1; and the cost per active merchant, which is how her finance team will judge the contract.

---

## 14.8 Arjun Menon — the Metis super-admin

**Identity.** Thirty-one, platform operations at Metis Labs; the only person with a view across every partner and tenant, and the persona whose mistakes are the most expensive.

**Business context.** He runs the deployment or supervises the partners who run theirs. He answers escalations, investigates "my balance is wrong", provisions partners, adjusts entitlements, and watches the scheduler, the message log and the health endpoint. He is one of a very small number of people; there is no operations department.

**Daily routine.** Check health and last night's scheduled runs. Triage escalations from partner L1. Provision or adjust a partner or a tenant. Investigate a data question, which means reading audit logs and ledger entry chains, not running ad-hoc updates. Prepare a release. Rehearse a restore.

**Device and connectivity.** Laptop, terminal access, the super-admin console, the database in a read-only session for investigation.

**Digital literacy and language.** Expert. English.

**Current tools and workarounds.** Before `PLT-14` exists he uses Django admin and SQL, which is exactly why the console is an MVP feature and only tenth on the cut list of Part 12 §12.7.

**Goals.** Answer "what happened to this entry" in under five minutes with evidence. Never touch production data directly. Provision a partner without an engineer. Know that a restore works because he has done one this month, not because a backup job reported success.

**Frustrations.** Investigations that require SQL because the audit trail is incomplete. Impersonation without consent, which he refuses to do. Scheduled jobs that are not idempotent and cannot be safely re-run. Silent messaging failures.

**What he needs to trust the product.** Every state change writes an audit row through the service layer (canon §0.11 rule 4). Every scheduled task is idempotent (ADR-012). Impersonation requires recorded tenant consent and is itself audited. Structured logs carry `request_id` and `tenant_id`. Cross-tenant access returns 404 and is impossible by construction, not by convention.

**What would make his job untenable.** Mutable ledger rows. A support flow that requires him to edit data to fix a user's mistake. Entitlement overrides with no audit. A backup that has never been restored.

**Features that matter most.** `PLT-14`, `PLT-15`, `PLT-08`, `PLT-09`, `WLB-02`, `NTF-02` (the message log is his diagnostic surface), and every non-negotiable rule in canon §0.11.

**Success metric.** Median escalation resolution time; number of production data edits, which must be zero; scheduled-task success rate; restore rehearsal frequency; and the proportion of escalations answered from the audit log alone.

---

## 14.9 The end customer (CU) — a persona the product serves without an account

The party who owes money is a user of the product's output even though they never log in. They appear in Part 16 as persona code **CU** and in journeys 10 and 11 of Part 15.

They are, typically, a household buyer of a kirana on credit, or a retailer buying from a distributor. They receive an SMS when an entry is posted (`LED-08`), a reminder when a collection date approaches (`LED-06`, `LED-07`), a statement when they dispute a balance (`LED-04`), an invoice PDF with a scannable UPI QR (`SAL-03`, `PAY-03`), and — from Phase 2 — a link to view their own khata (`PTY-09`) and a page on which to pay an invoice (`SAL-14`). Their device may be anything from a feature phone receiving SMS to a smartphone with three UPI apps.

Their interests are narrow and non-negotiable: they want to know what has been written against their name, they want the number to be one both sides agree on, and they do not want to be messaged more than the situation warrants. The product serves them through three deliberate choices — per-party opt-in and opt-out on every channel, the D-1/D0 reminder default rather than an open-ended cadence, and a statement that is shareable rather than gated behind an account. Their trust is what makes the merchant's ledger credible; the research is explicit that the customer-side message is the feature that makes disputes disappear.

---

## 14.10 Persona-to-role mapping

System roles are defined in canon §0.9 and are the same four everywhere. The mapping below is what `PLT-05` should suggest by default when each kind of person is invited.

| Persona | Default system role | Rationale and notable limits |
|---|---|---|
| Suresh Sharma (kirana owner) | `owner` | Sole user; owns the tenant, cannot be removed, holds every permission |
| Ramesh Agarwal (wholesale owner) | `owner` | Also assigns roles to six others; the only persona who routinely uses `PLT-05` |
| — his billing clerk | `staff` | May issue invoices and record payments; may not void (`sales.invoice.void`), correct ledger entries (`ledger.entry.correct`) or read financial reports (`reports.financial.read`) |
| — his collections person | `staff` with `ledger.entry.write` | Records "You got" entries in the field; credit-limit override remains owner-only |
| — his godown keeper | `staff` with `inventory.stock.adjust` enabled | Stock adjustment is off by default for staff and must be granted deliberately |
| Anjali Deshpande (services owner) | `owner` | Her receptionist is `staff`; her commission stylists get no account |
| Mahesh Patel (manufacturer owner) | `owner` | His nephew is `admin`, since he does everything except tenant deletion and ownership transfer |
| Sunita Kumari (counter staff) | `staff` | The role the permission matrix was designed around: fast at the counter, unable to undo |
| Vikram Joshi (accountant / CA) | `accountant` | Reads everything, exports everything, writes nothing. He is invited to many tenants and switches with `PLT-04` |
| Neha Raghavan (partner admin) | Partner scope, not a tenant role | Operates through `WLB-04`; has no membership of any tenant and therefore no access to tenant data except through consented impersonation |
| Arjun Menon (Metis super-admin) | Platform scope, not a tenant role | `PLT-14`; tenant access only through recorded, consented impersonation, itself audited |
| End customer (CU) | No account | Receives messages and opens public share links with hashed, expiring, revocable tokens |

Two rules follow from this table and are enforced in the FRDs. A partner administrator and a super-admin are **not** tenant members and must never be granted a membership row as a shortcut; their access is a separate scope with its own audit. And the accountant role must have no write path at all, because Vikram's trust in the numbers depends on his being unable to have changed them.

## 14.11 Persona-to-module priority matrix

Priority is scored **1** (the module they open first and use daily), **2** (used weekly, valued), **3** (occasional or peripheral) and **—** (irrelevant; should be hidden by default for this persona's business type through `PLT-03` defaults and `PLT-06` module toggles).

| Module | Suresh (kirana) | Ramesh (wholesale) | Anjali (services) | Mahesh (manufacturer) | Sunita (staff) | Vikram (CA) | Neha (partner) | Arjun (super-admin) |
|---|---|---|---|---|---|---|---|---|
| Ledger (`LED`) | **1** | **1** | **2** | 2 | 2 | 2 | 2 | 3 |
| Parties (`PTY`) | **1** | **1** | **1** | 2 | **1** | 3 | 3 | 3 |
| Sales (`SAL`) | 3 | **1** | **1** | **1** | **1** | 2 | — | 3 |
| Payments (`PAY`) | 2 | **1** | 2 | 2 | **1** | 3 | 2 | 3 |
| Inventory (`INV`) | — | **1** | 3 | **1** | 2 | 3 | — | 3 |
| Purchases (`PUR`) | 3 | **1** | 3 | **1** | — | 2 | — | 3 |
| Expenses (`EXP`) | 3 | 2 | 2 | 2 | — | 2 | — | 3 |
| Reports (`RPT`) | 3 | **1** | 2 | 2 | — | **1** | 2 | 2 |
| Notifications (`NTF`) | 2 | 2 | 2 | 3 | 3 | — | 2 | **1** |
| Import/Export (`IMP`) | 2 (once, at migration) | 2 | 3 | 3 | — | **1** | 2 | 2 |
| Platform (`PLT`) | 3 | 2 | 3 | 3 | — | 3 | **1** | **1** |
| White-label (`WLB`) | — | — | — | — | — | — | **1** | **1** |
| Help (`HLP`, Phase 2) | 2 | 3 | 3 | 3 | 2 | — | 2 | 3 |
| Loans (`LON`, Phase 3) | — | 3 | — | — | — | 3 | 3 | 3 |

Three design consequences follow directly from this matrix and are binding on the implementation.

**Default navigation differs by business type, not by user preference.** Suresh's bottom navigation leads with Parties and the ledger and does not show Inventory at all until he turns stock tracking on; Ramesh's desktop sidebar leads with Sales, Parties and Inventory; Anjali's hides purchases behind "More" and shows services vocabulary on documents. This is the practical expression of `PLT-03` seeding defaults, and it is the single largest lever the product has against the "interface gets denser with every update" complaint that the research places among the top failure modes.

**A module with a dash for a persona must be genuinely absent, not merely empty.** An inventory tab showing "no items yet" to a kirana owner who sells no tracked goods is a permanent reminder that the product is not for him. Module toggles (`PLT-06`) remove the navigation entry, and the module's endpoints return `module_disabled`.

**The staff column is the narrowest and the most used.** Sunita touches four modules and needs all four to be fast; everything outside those four should be invisible to her rather than merely forbidden, because a permission error in front of a customer is worse than an absent menu item.
