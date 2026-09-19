# 02 — Khatabook & Indian Ledger / SMB Billing Apps: Research Dossier

**Purpose:** Source-of-truth research for the UdhaarBook spec (credit ledger + inventory for Indian small businesses of all types). Everything below is drawn from official sites, app-store listings, help centres, funding databases and trade press as of **September 2026**. Claims that could not be cross-checked against a primary source are marked **(unverified)**. Store metrics change weekly; treat them as a snapshot.

**Method note:** Khatabook's marketing home page and payment-link pages are JS-rendered and returned no body to fetchers, so feature detail comes from the Play/App Store listings, the Khatabook help centre, the Khatabook blog, reseller product sheets and press. Where the *exact* in-app copy or rule was not visible, the "Business Rules / API shape / Data model" sections are our inference for spec purposes and are labelled as such.

---

## Part A — Khatabook deep dive

### A.0 Company snapshot

| Item | Fact | Source |
|---|---|---|
| Legal entity | ADJ Utility Apps Private Limited, Bengaluru (GSTIN 29AAPCA8770K1ZT on IndiaMART) | [Play Store](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN), [IndiaMART](https://m.indiamart.com/proddetail/khatabook-gst-billing-software-2854215523297.html) |
| Founders / CEO | Ravish Naresh (ex-Housing.com co-founder) with Dhanesh Kumar, Jaideep Poonia, Ashish Sonone (team of the earlier Kyte.ai app) | [GetLatka](https://getlatka.com/companies/khatabook), [YourStory product roadmap](https://yourstory.com/2021/08/product-roadmap-fintech-startup-khatabook-10-million-msme-users) |
| Origin | Kyte.ai (2016) — SMS-parsing personal spend manager; pivoted to digitising the *bahi khata* and launched **Khatabook in January 2019** | [YourStory](https://yourstory.com/2021/08/product-roadmap-fintech-startup-khatabook-10-million-msme-users) |
| Funding | Seed $1.5M (Surge, Apr 2019) → Series A $25M (Sep 2019) → Series B $60M (May 2020, Tencent/DST/GGV/Sequoia) → M.S. Dhoni angel (Mar 2020) → Series C $100M (Aug 2021, Tribe Capital & Moore Strategic; ~$600M post-money, $10M ESOP/investor buyback). Total ≈ **$186.5M**. No priced round since Aug 2021. | [Inc42 funding](https://inc42.com/company/khatabook/funding/), [TechCrunch](https://techcrunch.com/2021/08/23/indias-khatabook-raises-100-million-for-its-bookkeeping-platform-for-merchants/) |
| Scale claims | 50M+ Play installs; "5 crore registered merchants"; 10M+ monthly active MSMEs and 264M customer records on platform (Aug 2021); "nearly every zip code in India" | [Play Store](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN), [About page](https://khatabook.com/about/), [TechCrunch](https://techcrunch.com/2021/08/23/indias-khatabook-raises-100-million-for-its-bookkeeping-platform-for-merchants/) |
| Store ratings (Sep 2026) | Android **4.5★, ~5.86 lakh reviews, 50M+ installs**, last update 11 Sep 2026; iOS ("Khatabook Vyapar App") **4.7★, ~119K ratings**, #16 Business | [Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_US), [App Store](https://apps.apple.com/in/app/khatabook-vyapar-app/id1488204139) |
| Financials (standalone, INR) | FY21 rev ₹17 Cr; FY22 rev ₹71 Cr / loss ₹111 Cr; FY23 rev ₹80.9 Cr / loss ₹125.4 Cr; **FY24 rev ₹102.7 Cr / loss ₹116.2 Cr**, total expenses ₹230 Cr of which employee ₹117 Cr and "other" (contractors + payment-gateway charges) ₹106 Cr (+51% YoY). FY25 not yet public as of this writing. | [Entrackr FY22](https://entrackr.com/2022/11/khatabook-ends-fy22-with-4x-growth-in-revenue-and-rs-111-cr-loss/), [Entrackr layoffs](https://entrackr.com/2023/09/peak-xv-backed-khatabook-lays-off-over-40-employees/), [YourStory FY24](https://yourstory.com/2024/11/ms-dhoni-backed-khatabook-clocks-rs-1027-cr-revenue-cuts-losses-7-in-fy24) |
| Headcount | ~700 (Sep 2023) → 42 laid off (6%) with 3-month severance; third-party trackers show 772–860 in 2024–25 (unverified) | [Entrackr](https://entrackr.com/2023/09/peak-xv-backed-khatabook-lays-off-over-40-employees/), [GetLatka](https://getlatka.com/companies/khatabook) |
| Shut products | **MyStore** (digital storefront, launched 2020, shut Nov 2021 "to focus on core bookkeeping and lending") | [Entrackr](https://entrackr.com/2021/11/khatabook-shuts-down-its-e-comm-enablement-product-mystore/), [Inc42](https://inc42.com/buzz/khatabook-pulls-the-plug-on-digital-shopfront-platform-mystore-within-a-year-of-its-launch/) |
| Strategic thesis | Free ledger → data → lend. CEO target (2023): ₹1,000 Cr loan book by Oct 2023, EBITDA-positive by mid-2024. Trade press: "barely any kiranas pay for software", "Khatabook can't lend enough to justify its valuation." | [Entrackr](https://entrackr.com/2023/09/peak-xv-backed-khatabook-lays-off-over-40-employees/), [The Morning Context](https://themorningcontext.com/internet/khatabook-cant-lend-enough-to-justify-its-valuation), [The Ken](https://the-ken.com/story/why-khatabook-okcredits-kiranatech-failed-to-fly-off-the-shelves/) |

**Product family over time**

| Year | Product | Status |
|---|---|---|
| 2019 | Khatabook (udhaar ledger; SMS to customer; PDF report; 13 languages early) | Core, live |
| 2020 | Business cards; Khatabook QR / payment links ("Khatabook Pay"); MyStore storefront; Cashbook (standalone cash/expense app, also Urdu/Arabic); Biz Analyst (Tally-companion SaaS, acquired) | Cashbook & Biz Analyst live; MyStore shut Nov 2021 |
| Dec 2020 | **Pagarkhata** — staff attendance, salary, payslips, hiring (13 languages; "2.5M+ businesses" by 2021) | Separate app, live (pagarkhata.app blocked fetch; APK mirrors show v7.5.x) |
| 2021–22 | Lending to merchants via RBI-registered NBFC partners (e.g. Kinara Capital lists ADJ Utility Apps as a Digital Lending Partner for origination + collection) | Live, core monetisation |
| 2022–24 | "Khatabook for Business" bundle: GST/non-GST billing, inventory, staff roles, desktop/web app, GSTR reports; sold as 1–2 year licence via resellers | Live, paid |
| 2025–26 | **Khatabook Payments** (khatabookpay.com) markets itself as an RBI-authorised Payment Aggregator (cert. no. 233/2025 on site — unverified against RBI list): UPI/cards/net-banking/links, "0% fees during early access", refunds/reconciliation/dispute tools | Live |
| Sep 2026 | Play Store "what's new": device-lock (fingerprint/PIN/pattern) to secure the app | Live |

Sources: [YourStory roadmap](https://yourstory.com/2021/08/product-roadmap-fintech-startup-khatabook-10-million-msme-users), [Business Standard on Pagarkhata](https://www.business-standard.com/article/companies/khatabook-rolls-out-app-for-micro-entrepreneurs-to-manage-staff-payments-120120200056_1.html), [Kinara DLP page](https://kinaracapital.com/our-partners/dlp-khatabook/), [khatabookpay.com](https://khatabookpay.com/), [reseller product sheet PDF](http://5.imimg.com/data5/SELLER/Doc/2024/7/438657672/ZL/HL/EJ/78325251/khatabook-billing-software-mobile-app-2-year.pdf).

**Pricing.** The ledger, reminders, PDF reports and QR are free (ad-free in the core ledger, unlike OkCredit). Billing/inventory/desktop/staff-roles are sold as "Khatabook GST Billing Software" 1- or 2-year licences through resellers and in-app; list prices are not published on the site ("available on request" on Techjockey; aggregator sites show a "$1/month premium" placeholder that is not a real SKU). Treat Khatabook's paid tier as **~₹1,000–₹4,000/year (unverified)**, in the same band as Vyapar/myBillBook. Loans: ₹10,000–₹5,00,000, 15–24% p.a., 0–5% processing fee, "flexible EDI (equated daily instalment) repayments" per the Play listing. Sources: [Play Store](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN), [Techjockey](https://www.techjockey.com/detail/khatabook), [SoftwareSuggest](https://www.softwaresuggest.com/khatabook).

**Languages.** Sources disagree on the count (9 on an older blog, 12 on About, 13 on iOS/press, "English, Hindi + 10 regional" on Play). The union of named languages: **English, Hindi, Hinglish, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Odia, Assamese** (iOS also lists Indonesian; the Cashbook sibling adds Urdu and Arabic with RTL). Khatabook's own design note: literal translations failed; "Hinglish" transliteration drove ~30% non-English adoption. Sources: [Khatabook blog](https://khatabook.com/blog/khatabook-app-features/), [App Store](https://apps.apple.com/in/app/khatabook-vyapar-app/id1488204139), [Medium case study](https://medium.com/@anoopjoyjoy/khatabook-app-to-superapp-f2b452255598).

**Known controversies / churn drivers**
- Payment-collection incidents: QR payment received by customer but not reflected/notified in app; support gave 72-hour SLAs and "please wait" ([Trustpilot](https://www.trustpilot.com/review/www.khatabook.com)).
- Loan-processing delays and rejections dominate recent negative Play reviews (Kimola review mining, NPS ≈ 50) ([Kimola](https://kimola.com/reports/unlock-key-insights-khatabook-app-user-feedback-report-google-play-hi-148328)).
- Performance regressions: "extremely slow and keeps hanging while entering transactions", freezes and crashes (Play reviews, Sep 2026) ([Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN)).
- Feature creep vs simplicity: "interface is denser… can overwhelm less tech-savvy owners" ([Bikri AI comparison](https://bikriai.com/blog/khatabook-vs-okcredit)).
- Business-model critique: free users don't convert; lending is the only revenue line big enough, and it carries NBFC risk ([The Ken](https://the-ken.com/story/why-khatabook-okcredits-kiranatech-failed-to-fly-off-the-shelves/), [Substack on kirana tech](https://pratikchandak.substack.com/p/why-kirana-tech-is-so-difficult-to)).

---

### A.1 Feature-by-feature specification

Format for each: **Problem → User → Workflow → Business Rules → Edge Cases → UI notes → Likely API → Likely data model.** "Observed" = seen in a listing/help article; "Inferred" = our reconstruction for the spec.

#### F1. Onboarding — OTP login by mobile number

- **Problem:** Merchants won't fill forms; identity must be the phone number they already give customers.
- **User:** Owner (primary). Staff join later by invitation.
- **Workflow (observed):** Install → choose language → enter 10-digit mobile → OTP (SMS; Truecaller/WhatsApp OTP options seen in Indian apps, unverified for Khatabook) → enter business name → land on empty ledger with "Add customer" CTA. "No complex forms or documents are required." ([Miracuves walkthrough](https://miracuves.com/blog/what-is-khatabook-and-how-does-it-work/), [OkCredit FAQ](https://okcredit.in/faq) confirms same pattern for OkCredit.)
- **Business rules:** One account per mobile number; the same number can own several "books" (businesses). Re-login on a new phone restores all data from cloud ([Miracuves](https://miracuves.com/blog/what-is-khatabook-and-how-does-it-work/)). OTP retry/resend cool-down and rate limiting (inferred).
- **Edge cases:** Number recycled by telco → previous owner's data must not leak (require re-verification + optional PIN); SIM not in phone (OTP to a shop number while owner uses another handset); dual-SIM; user changes primary mobile (needs "change number" flow with OTP on both).
- **UI notes:** Language picker is *first* screen; phone field auto-fills via SMS Retriever; business name optional at start.
- **API (inferred):** `POST /auth/otp/request {phone}` → `POST /auth/otp/verify {phone, otp, device_id}` → `{access_token, refresh_token, user}`; `POST /businesses {name, category?}`.
- **Data model (inferred):** `User(id, phone_e164, name?, language, created_at)`, `Device(id, user_id, push_token, app_lock_enabled)`, `Business(id, owner_user_id, name, category, gstin?, address?, logo_url?, created_at)`.

#### F2. Customer ("party") profile & customer list

- **Problem:** The paper khata is indexed by person; the app must be too.
- **User:** Owner/staff.
- **Workflow (observed):** Home → "+ Add customer" → pick from phone contacts or type name + mobile → optional address/notes → saved; customer list shows name, last activity, and balance coloured by direction. Contacts import is a praised feature ([SoftwareSuggest reviews](https://www.softwaresuggest.com/khatabook)).
- **Business rules:** Mobile optional but required for SMS/WhatsApp features; duplicate detection on mobile; a party can be *customer* or *supplier* (Khatabook and OkCredit both keep a separate Suppliers tab). OkCredit reviewers complain that a deleted customer's number cannot be re-added — spec should allow re-linking to a soft-deleted party ([OkCredit Play reviews](https://play.google.com/store/apps/details?id=in.okcredit.merchant&hl=en_IN)).
- **Edge cases:** Same person is both customer and supplier (net-off or separate ledgers); one mobile shared by a family; customer without phone (cash-only walk-in); name collisions ("Raju bhai" ×3); transliteration search (type "ramu" and find "रामू").
- **UI notes:** Two-tab home (Customers | Suppliers); running "You will get ₹X / You will give ₹Y" totals pinned at top; sort by name/amount/last-activity; filters for "due today", "defaulters".
- **API:** `POST /businesses/{b}/parties {name, phone?, type: customer|supplier, address?, opening_balance?}`; `GET /parties?type=&sort=&q=`.
- **Data model:** `Party(id, business_id, type, name, phone?, alt_phone?, address?, gstin?, tags[], credit_limit?, collection_day?, sms_opt_in, wa_opt_in, is_deleted, created_at)`; denormalised `balance_paise` maintained by trigger or computed.

#### F3. Ledger entries — "You gave" (udhaar/credit given) and "You got" (payment received)

- **Problem:** Replace pencil entries with two big buttons; be faster than paper.
- **User:** Owner/staff; customer reads the result via SMS.
- **Workflow (observed):** Open party → red **"You gave ₹"** (Diya / उधार) or green **"You got ₹"** (Liya / जमा) → amount keypad → optional note ("item", "bill no.") and date (defaults today, backdating allowed) → optional photo of bill → Save → balance updates instantly; customer receives an SMS with the new balance and a link to view their khata ([App Store description](https://apps.apple.com/in/app/khatabook-vyapar-app/id1488204139), [Miracuves](https://miracuves.com/blog/what-is-khatabook-and-how-does-it-work/)).
- **Business rules:** Amount > 0, paise allowed; both directions are plain signed entries — balance = Σ(gave) − Σ(got). Backdated entries re-sort by transaction date but keep `created_at`. Deleting an entry is allowed (Khatabook: "delete khatas and start fresh anytime") but should be soft-delete with audit; OkCredit charges for *unlimited daily transactions* on its free tier (a cap exists below ₹30/mo) ([OkCredit pricing](https://okcredit.in/pricing)) — UdhaarBook should not cap entries.
- **Edge cases:** Entry against wrong party (need "move entry"); split payment part-cash/part-UPI (a Vyapar complaint that split payments aren't tracked accurately — [Vyapar Play reviews](https://play.google.com/store/apps/details?id=in.android.vyapar&hl=en_IN)); staff entering on owner's behalf (attribution); offline entry later synced out of order (use client-generated UUID + `client_ts`); rounding when settling in cash (round-off entry type).
- **UI notes:** Red = money owed to you increases ("You gave"), green = you received; running balance shown after each row (like a bank passbook); month separators; long-press to edit/delete; "Rs" typed as numeric keypad only.
- **API:** `POST /parties/{p}/transactions {client_id, type: GAVE|GOT, amount_paise, note?, txn_date, attachments[]}`; `PATCH /transactions/{id}`; `DELETE` (soft); `GET /parties/{p}/transactions?from=&to=&cursor=`.
- **Data model:** `LedgerTxn(id, client_id UNIQUE, business_id, party_id, type, amount_paise, note, txn_date, created_by_user_id, created_at, updated_at, deleted_at, source: manual|invoice|payment_link|qr|settlement, ref_id?)`. Balance materialised per party; per-row running balance computed in query window.

#### F4. Running balance, "hisaab" & settlement

- **Problem:** Both sides need one number they agree on.
- **User:** Owner + customer.
- **Workflow (observed):** Party header shows "₹X — You will get" or "You will give"; tapping "Settle" / "Collect" pre-fills a "You got" entry for the full balance; balance hits zero and the party can be filtered out of "dues". Customers get a "view your khata" link showing the same running statement.
- **Business rules:** Zero balance parties remain (history preserved); negative balances (advance received) are legal and shown as "You will give". Settlement is just a GOT entry with `source=settlement`. OkCredit auto-settles ledger balances when the customer pays via its UPI QR ([OkCredit Play](https://play.google.com/store/apps/details?id=in.okcredit.merchant&hl=en_IN)) — the key reconciliation win UdhaarBook must replicate.
- **Edge cases:** Partial settlement; settlement with discount ("₹2,000 due, took ₹1,900 full-and-final" → GOT 1,900 + `discount` entry 100 so books close); disputed balance (customer denies an entry) — consider a "customer acknowledged" flag per entry.
- **UI:** Balance in large type, colour-coded; "Since when" (ageing days); "Last payment on".
- **API:** `POST /parties/{p}/settle {amount_paise, mode, discount_paise?, note}`.
- **Data model:** reuse `LedgerTxn`; add `Discount` as `type=DISCOUNT` (reduces receivable, is not cash).

#### F5. Opening balance & migration from paper

- **Problem:** Day-one adoption requires entering yesterday's dues.
- **Workflow (inferred from all apps):** "Add customer" → "Opening balance: they owe you ₹ / you owe them ₹" → creates a dated first entry. Bulk paste/CSV import exists in Vyapar/Zoho, not in Khatabook (unverified).
- **Business rules:** Opening balance is a normal entry flagged `is_opening` so statements can start with it; editable until the second entry exists (inferred).
- **Data model:** `LedgerTxn.type=OPENING`.

#### F6. Customer-facing SMS on every entry ("free SMS")

- **Problem:** Trust: customer must know what was written against their name.
- **Workflow (observed):** On save, Khatabook sends an SMS (from a DLT-registered header) to the customer: "[Business] ne aapke khate me ₹500 udhaar joda. Total baaki ₹2,300. Dekhein: khata.pe/…" — wording inferred; the App Store copy confirms "free SMS transaction updates to customers" and a link to view the khata. OkCredit's free tier instead **sends the SMS from the merchant's own SIM**, and only the ₹99/month Premium tier sends "unlimited transaction SMS from OkCredit" ([OkCredit pricing](https://okcredit.in/pricing)) — a direct cost-shifting move.
- **Business rules:** Per-party toggle; language follows the merchant's app language (customer language override is a gap); SMS is "service-implicit" DLT category (see Part C); rate-limit to avoid spam on rapid edits (coalesce within N seconds).
- **Edge cases:** Edited/deleted entry → corrective SMS or silent? (spec: send a correction only if a previous SMS went out); customer DND status doesn't block service SMS but does block promotional; customer without phone; SMS costs at scale (Khatabook's ₹106 Cr "other expenses" line includes gateway costs).
- **API:** async job `notify.party_txn(txn_id)` → provider (DLT template id, variables) → `Notification(id, txn_id, channel, template_id, status, provider_msg_id)`.

#### F7. Payment reminders (SMS / WhatsApp / call) — single and bulk

- **Problem:** Asking for money is socially awkward; a machine message is neutral.
- **User:** Owner; staff with collection permission.
- **Workflow (observed):**
  1. Party page → **"Remind"** → sheet: *WhatsApp* (opens wa.me with prefilled Hinglish text + balance + pay link), *SMS* (server-sent), *Call* (dialer). ([Khatabook blog](https://khatabook.com/blog/khatabook-app-features/), [Capterra review noting reminders go via external platforms](https://www.capterra.in/software/197475/khatabook))
  2. **Bulk reminders:** Parties tab → "Bulk Reminders" → multi-select customers → choose mode SMS/Call/WhatsApp → send; help centre says "send multiple collection reminders in just a few clicks… multilingual" ([Khatabook help: bulk](https://khatabook.com/help/en-us/category/Y-s0axAAAB4AwDhl/), [help: bulk reminders](https://khatabook.com/help/en-us/category/Y-swsBAAAB0AwCe7/)).
  3. **Scheduled/automatic:** set a **Collection date** on the party ("Collection" button appears only when balance is due); Khatabook "will send an automatic reminder one day before and on the repayment date." Presets: next week / next month / pick a date ([Khatabook help: repayment date](https://khatabook.com/help/en-us/category/X1ic1BAAAGYIa-h4/), [blog](https://khatabook.com/blog/khatabook-app-features/)).
- **Business rules:** Reminders only when balance > 0 in merchant's favour; automatic reminders fire D-1 and D0 (no infinite nagging — good default); WhatsApp reminders via wa.me are *manual* (user must tap Send in WhatsApp), so "automatic WhatsApp" in marketing means server-sent template messages, which need the Business API and Meta template approval (Part C). Message text includes business name, amount due, and pay link.
- **Edge cases:** Customer pays partially before D0 → reminder shows updated balance; multiple parties share a phone → one merged message; time-of-day (avoid 9 pm–9 am for promotional-class content; service-class allowed but socially bad); customer opts out ("stop reminding") → flag; reminder fatigue → cap per week.
- **UI:** "Remind" is a first-class button beside "Call"; reminder history under party ("Reminded 3 times, last 2 days ago"); bulk selection shows total selected due.
- **API:** `POST /reminders {party_ids[], channel: sms|whatsapp|call, template_key, schedule_at?}`; `PUT /parties/{p}/collection_date {date}`; scheduler job scans `collection_date IN (today, tomorrow)`.
- **Data model:** `Reminder(id, party_id, channel, scheduled_for, sent_at, status, template_id, balance_snapshot_paise, triggered_by: manual|auto|bulk)`.

#### F8. Transaction history, search & filters

- **Observed:** Per-party passbook with date, note, gave/got, running balance; global search by name/phone; filters by date range and by direction; "defaulters" view (OkCredit Ads-Free++ tier) ([OkCredit pricing](https://okcredit.in/pricing)). Users ask for better multi-account/ledger views ([Play reviews](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN)).
- **Rules:** Date range presets (today, this week, this month, FY-to-date, custom); FY = 1 Apr–31 Mar.
- **API:** `GET /transactions?party_id=&from=&to=&type=&q=&cursor=` with cursor pagination.
- **Data model:** index on `(business_id, txn_date DESC)`, full-text on `note`, `party.name`.

#### F9. PDF statement / report download & share

- **Observed:** Party statement PDF (all entries + net balance) and account-level report; shared via WhatsApp/email/print; "shareable reports for customer reference and audit purposes" ([Khatabook blog](https://khatabook.com/blog/khatabook-app-features/), [App Store](https://apps.apple.com/in/app/khatabook-vyapar-app/id1488204139)).
- **Rules:** Statement header = business name/phone/logo; footer "Generated by …"; date range selectable; amounts in Indian grouping (₹1,23,456.00). Business-level exports: Excel/CSV of all parties with balances (Vyapar/myBillBook do this; Khatabook does per-party PDF — CSV unverified).
- **Edge:** Very long histories (paginate PDF server-side); Hindi/regional fonts in PDF (embed Noto fonts); statement shared to a *different* customer by mistake (include party name prominently).
- **API:** `POST /reports/party-statement {party_id, from, to, lang}` → signed URL; server-side render (Puppeteer/WeasyPrint).

#### F10. Notifications (push) & activity feed

- **Observed:** Push when a QR/link payment lands; complaints that "notification system sometimes lags behind" for payment confirmations ([Techjockey reviews](https://www.techjockey.com/detail/khatabook)). Daily summary pushes and re-engagement nudges are common in the category (unverified for Khatabook).
- **Rules:** Payment pushes must be idempotent and match ledger auto-entry; owner gets push for staff entries above a threshold (inferred).
- **Data model:** `Event(id, business_id, type, payload, created_at)` → fan-out to devices.

#### F11. WhatsApp workflows

- **Observed:** Share PDF statement, invoice, business card, reminder text and pay link via WhatsApp; "GST/non-GST invoices… share via WhatsApp" ([Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN)). Mechanism for merchant-initiated shares is the Android share sheet / `wa.me/<phone>?text=` deep link, which is free and needs no approval.
- **Rules:** Text prefilled in app language; includes pay link (`khata.pe/t/<id>`) so the customer can pay from the chat.
- **Edge:** Customer's WhatsApp on a different number than the ledger phone; WhatsApp not installed → fall back to SMS.

#### F12. UPI/QR & payment-link collection ("Khatabook Pay" / "Khatabook QR")

- **Problem:** Collection is the pain; the reminder should carry a way to pay, and payment should auto-post to the ledger.
- **User:** Owner (KYC), customer (payer).
- **Workflow (observed):** Merchant links bank account / completes "seamless verification" → gets a personal payment link (`khata.pe/t/…`) and a QR (digital; a **physical QR is mailed to the shop address**) → customer scans/pays via any UPI app or link checkout (UPI, cards, net-banking, wallets) → merchant gets notification and ledger "You got" entry; settlement to bank (a **48-hour hold** for new merchants was noted in a UX case study — [Medium](https://medium.com/@anoopjoyjoy/khatabook-app-to-superapp-f2b452255598)). Marketing: "0% fees during early access (introductory cap applies)", refunds, reconciliation, dispute tools ([khatabookpay.com](https://khatabookpay.com/), [Khatabook blog](https://khatabook.com/blog/khatabook-app-features/), [Facebook how-to video](https://www.facebook.com/khatabook/videos/learn-how-to-receive-payments-via-the-khatabook-app/473576310785743/)).
- **Business rules:** Payment link is per-party or per-request (amount-locked); QR is merchant-level static (amount entered by payer) or dynamic (amount-locked); a captured payment creates a `LedgerTxn(type=GOT, source=payment_link|qr, ref=payment_id)` exactly once; MDR 0% on UPI (regulatory) but cards carry MDR; KYC (PAN, bank proof, sometimes GSTIN) is required by the PA/PSP.
- **Edge cases (from reviews):** payment debited, no notification, no ledger update, 72-hour support SLA ([Trustpilot](https://www.trustpilot.com/review/www.khatabook.com)); payer used a different name; refund flow; payer pays *more* than due (advance); payment to static QR with no party context → "unmatched payments" inbox for manual mapping.
- **UI:** "Collect ₹X" button generates dynamic QR + link; "Payments" tab with settled/unsettled; unmatched payments badge.
- **API:** `POST /payments/requests {party_id?, amount_paise?, expires_at}` → `{link, qr_payload}`; webhook `POST /webhooks/psp` → verify signature → upsert `Payment(status)` → post ledger entry.
- **Data model:** `Payment(id, business_id, party_id?, request_id?, amount_paise, psp, psp_txn_id UNIQUE, utr, payer_vpa?, status: created|paid|failed|refunded, settled_at, settlement_id)`; `Settlement(id, business_id, amount_paise, bank_ref, settled_on)`.

#### F13. Bill / invoice attachment on entries

- **Observed:** Camera/gallery attachment to entries in Khatabook and OkCredit (unverified detail; visible in app screenshots). Business-tier converts this into proper invoices (F16).
- **Rules:** Compress to <300 KB, store object key; thumbnails in passbook.
- **Data model:** `Attachment(id, txn_id, object_key, mime, size)`.

#### F14. Multiple businesses ("multiple khatabooks") & business profile

- **Observed:** "Create multiple khatabooks under one account… each manages a separate business or customer groups"; reseller sheet: "unlimited multiple businesses/staff on mobile app" ([Khatabook blog](https://khatabook.com/blog/khatabook-app-features/), [reseller PDF](http://5.imimg.com/data5/SELLER/Doc/2024/7/438657672/ZL/HL/EJ/78325251/khatabook-billing-software-mobile-app-2-year.pdf)). Business profile: name, category, address, GSTIN, logo, UPI ID; 11 free **business card** templates shareable on WhatsApp.
- **Rules:** Parties and transactions are scoped per business; switcher in the header; profile fields surface on invoices/statements/business card.
- **Edge:** Same customer across two of the owner's businesses (separate ledgers, no cross-netting); GSTIN validation (Part C checksum).
- **Data model:** `Business` (F1) + `BusinessMember(user_id, business_id, role)`.

#### F15. Staff / multi-user & permissions

- **Observed:** Khatabook business tier: "Multiple staff management… permission customisation"; staff accounts let "a shop helper log entries without seeing financials"; multiple simultaneous desktop logins with real-time sync ([reseller PDF](http://5.imimg.com/data5/SELLER/Doc/2024/7/438657672/ZL/HL/EJ/78325251/khatabook-billing-software-mobile-app-2-year.pdf), [HostingCharges expert review](https://www.hostingcharges.in/reviews/khatabook), [Bikri AI](https://bikriai.com/blog/khatabook-vs-okcredit)). OkCredit sells multi-device login only in its ₹75/mo tier ([OkCredit pricing](https://okcredit.in/pricing)). Payroll/attendance lives in **Pagarkhata**.
- **Rules (inferred roles):** Owner (all), Manager (all but bank/settlement & delete business), Staff/Cashier (add entries & invoices, no totals, no delete, no export), Accountant/CA (read + reports). Staff invited by mobile number + OTP.
- **Edge:** Staff leaves → revoke instantly; staff entry deletion needs owner approval; audit trail per entry (`created_by`).
- **Data model:** `BusinessMember(role, permissions_json, invited_by, status)`; `AuditLog(actor_id, action, entity, before, after, at)`.

#### F16. GST / non-GST invoicing, inventory & reports (paid "Business" tier)

- **Observed:** Sales/purchase bills, proforma, quotations/estimates; item master with stock valuation, low-stock alerts, item-wise export; reports: sales, purchase, GSTR-1/2/3B, P&L, cashbook; e-way bill and credit/debit notes listed on Techjockey ([Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN), [reseller PDF](http://5.imimg.com/data5/SELLER/Doc/2024/7/438657672/ZL/HL/EJ/78325251/khatabook-billing-software-mobile-app-2-year.pdf), [Techjockey](https://www.techjockey.com/detail/khatabook)). Reviewers want UI improvement in product management ([Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_US)).
- **Rules:** Credit sale invoice posts a "You gave" ledger entry for the invoice total (`source=invoice`); payment against invoice posts "You got"; stock decrements on sale/increments on purchase; GST computed per line from HSN/SAC and rate, split CGST/SGST vs IGST by place of supply (Part C).
- **Data model:** `Item(id, business_id, name, sku, hsn_sac, unit, gst_rate, purchase_price, sale_price, stock_qty, low_stock_at, track_stock)`, `Invoice(id, business_id, party_id, number, series, date, place_of_supply, type: tax|bill_of_supply|proforma|quote, lines[], taxable_paise, cgst, sgst, igst, cess, round_off, total_paise, status)`, `StockMovement(item_id, qty_delta, reason, ref)`.

#### F17. Dashboard

- **Observed:** Totals "You will get / You will give", today's collections, recent activity; business tier adds sales/purchase/P&L cards and "accounting dashboard" ([Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN)).
- **Rules:** Numbers are per business; FY and month toggles.

#### F18. Offline mode, backup & sync

- **Observed:** "Automatic and secure online backup with multi-device access"; Capterra lists "online and offline functionality, cross-device syncing"; OkCredit lists offline functionality + cloud backup ([App Store](https://apps.apple.com/in/app/khatabook-vyapar-app/id1488204139), [Capterra](https://www.capterra.in/software/197475/khatabook), [OkCredit Play](https://play.google.com/store/apps/details?id=in.okcredit.merchant&hl=en_IN)). myBillBook is criticised for needing stable internet ([Techjockey myBillBook](https://www.techjockey.com/detail/mybillbook-accounting-software)); Vyapar is praised for full offline.
- **Rules:** Local-first (SQLite) with append-only outbox; server is source of truth; conflict = last-writer-wins on scalar fields, never on balances (balances derived); tombstones for deletes.
- **Edge:** Two staff offline editing same entry; clock skew on backdated entries; app reinstall before sync (warn on uninstall not possible → nudge "3 unsynced entries").
- **API:** `POST /sync {since_cursor, changes[]}` → `{applied[], conflicts[], server_changes[], cursor}`.

#### F19. Security — app lock / PIN / device lock, data deletion

- **Observed:** 4-digit in-app PIN separate from phone lock (older); Sept 2026 update: use device biometrics/PIN/pattern; data encrypted in transit; account/data deletion request supported per Play data-safety ([Khatabook blog](https://khatabook.com/blog/khatabook-app-features/), [Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_US)).
- **Rules:** Lock on background > N seconds; staff sessions expire; sensitive screens (bank details) re-auth.

#### F20. Monetisation surfaces in-app: loans, referral, quiz

- **Observed:** Loans ₹10K–₹5L via NBFC partners at 15–24%, 0–5% fee, EDI repayment; "Refer & earn ₹10 when friend adds first customer"; quiz to win ₹1,000; help via chat/call/WhatsApp 7 am–10 pm ([Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN), [Khatabook blog](https://khatabook.com/blog/khatabook-app-features/), [HostingCharges](https://www.hostingcharges.in/reviews/khatabook)).
- **Learning for UdhaarBook:** Loan banners generate the bulk of negative reviews (delays/rejections). If lending is ever added, isolate it from the ledger UX and never gate ledger features behind it.

---

## Part B — Competitor matrix

### B.1 Company & store snapshot (Sep 2026)

| App | Company (HQ) | Founded | Funding / status | Android installs | Android rating (reviews) | Primary segment |
|---|---|---|---|---|---|---|
| **Khatabook** | ADJ Utility Apps, Bengaluru | 2018/19 | $186.5M; last round Aug 2021 (~$600M); loss-making FY24 | 50M+ | 4.5★ (~586K) | Kirana/retail udhaar; upsell billing + loans |
| **OkCredit** | PSI PHI Global Solutions, Bengaluru | 2017 | $84.5M (Lightspeed, Tiger); FY24 rev ₹15.8 Cr → FY25 ₹25.3 Cr; **profitable Nov 2025**; 2L+ paying shopkeepers; exited lending Mar 2025 | 10M+ (1 Cr+) | 4.6★ (~432K) | Udhaar ledger for tiny shops; SaaS subs |
| **Vyapar** | Simply Vyapar Apps, Bengaluru | 2016 | Series B (WestBridge, IndiaMART) | 10M+ | 4.8★ (~187K) | GST billing + inventory, offline desktop; retail/wholesale/manufacturing |
| **myBillBook** | Valorem Stack (FloBiz), Bengaluru | 2019 | Series B (Sequoia/Peak XV, Elevation) | 10M+ | 4.7★ (~147K) | GST billing, inventory, POS; SMBs with staff |
| **Swipe** | NextSpeed Technologies, Hyderabad | 2021 | YC-backed | 1M+ | 4.6★ (~14.6K) | Web-first GST billing, e-invoice/e-way on mobile; services & traders |
| **Zoho Books (India)** | Zoho Corp, Chennai | 2011 | Bootstrapped | 5M+ (global) | 4.7★ (~29.5K) | Full accounting for GST-registered SMEs with a CA |
| **Bharat Khata** | Greenizon Agritech (CredServ partner app) | — | — | 100K+ | n/a | Dealer/distributor receivables + KYC/eNACH; *not* a general udhaar app any more |

Sources: [Khatabook Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN); [OkCredit Play](https://play.google.com/store/apps/details?id=in.okcredit.merchant&hl=en_IN), [Inc42 OkCredit](https://inc42.com/company/okcredit/), [Ascendants on OkCredit profitability](https://ascendants.in/business-stories/okcredit-turns-profitable-november-2025-harsh-pokharna/); [Vyapar Play](https://play.google.com/store/apps/details?id=in.android.vyapar&hl=en_IN); [myBillBook Play](https://play.google.com/store/apps/details?id=com.valorem.flobooks&hl=en_IN); [Swipe Play](https://play.google.com/store/apps/details?id=in.swipe.app&hl=en_IN); [Zoho Books Play](https://play.google.com/store/apps/details?id=com.zoho.books&hl=en_IN); [Bharat Khata Play](https://play.google.com/store/apps/details?id=com.bharatkhata.erp&hl=en_IN&gl=US).

**Naming note on "Bharat Khata (Dukaan)":** the Play listing `com.bharatkhata.erp` is now a CredServ channel-finance app (invoice approval, credit limits, eNACH, SMS-reading for underwriting). Dukaan (mydukaan.io) is a storefront builder; "Dukaan AI: Smart Khata & Bills" (com.dukaan.ai) is an unrelated voice-billing khata app for kiranas. No evidence of a Dukaan-owned "Bharat Khata" ledger product was found **(unverified/likely defunct)**. Sources: [Bharat Khata Play](https://play.google.com/store/apps/details?id=com.bharatkhata.erp&hl=en_IN&gl=US), [Dukaan AI](https://dukaanai.co.in/).

### B.2 Feature matrix

Legend: ✔ yes · ◐ partial/paid tier · ✘ no · ? unverified

| Capability | Khatabook | OkCredit | Vyapar | myBillBook | Swipe | Zoho Books IN |
|---|---|---|---|---|---|---|
| Party ledger (customer + supplier), running balance | ✔ core | ✔ core | ✔ (party ledger inside billing) | ✔ | ✔ (receivables/payables) | ✔ (AR/AP, not "udhaar" UX) |
| Free SMS to customer on each entry | ✔ | ◐ free tier sends via merchant SIM; server SMS ₹99/mo | ◐ | ◐ | ✘ | ◐ (SMS credits paid) |
| WhatsApp reminders (wa.me) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Automated scheduled reminders | ✔ D-1 & D0 on collection date; bulk | ✔ "auto payment reminders" | ✔ | ✔ | ✔ | ✔ (rule-based) |
| Collection date per party | ✔ | ✔ | ◐ (invoice due date) | ◐ | ◐ | ✔ (due terms) |
| UPI QR + payment link, auto-post to ledger | ✔ (Khatabook Pay) | ✔ (QR auto-settles) | ◐ (via gateway) | ◐ | ✔ (integrated gateway) | ✔ (Razorpay/others) |
| GST & non-GST invoicing | ◐ paid | ◐ ₹75/mo tier | ✔ | ✔ | ✔ free | ✔ |
| Inventory / stock, low-stock alerts | ◐ paid | ◐ ₹75/mo tier | ✔ incl. batch/expiry/barcode/manufacturing (Gold/Pro) | ✔ multi-godown | ✔ barcode | ✔ (Elite: warehouses, serial/batch) |
| e-Invoice (IRN) | ? listed by resellers | ✘ | ◐ Gold (unlimited) | ◐ Pro Max/Enterprise | ✔ unlimited mobile+desktop | ◐ Standard+ |
| e-Way bill | ◐ listed | ✘ | ✔ | ◐ 50/yr Platinum, unlimited Enterprise | ✔ | ✔ |
| GSTR-1 / 3B reports | ◐ paid | ✘ | ✔ | ✔ | ✔ (+filing integration) | ✔ (+direct filing) |
| Multi-user with roles | ◐ paid (staff permissions) | ◐ multi-device only | ◐ Gold (multi-user) | ✔ 3 users + CA (Pro Max) | ✔ | ✔ 3–25 users; custom roles Pro+ |
| Desktop / web app | ◐ paid (Windows + web) | ◐ ₹75/mo | ✔ Windows desktop (flagship) | ✔ desktop + web | ✔ web-first | ✔ web |
| Offline | ◐ | ✔ | ✔ full (desktop is offline-first) | ◐ limited | ◐ | ✘ (online) |
| Staff attendance/payroll | ◐ via Pagarkhata | ✘ | ✘ | ✔ Platinum+ | ✘ | ◐ Zoho Payroll add-on |
| Languages | 12–13 Indian | 11 | English + Hindi (users complain "missing multilanguage") | 5 | English (+Hindi UI ?) | English |
| Ads in free tier | ✘ (loan banners) | ✔ heavy | ✘ | ✘ | ✘ | ✘ |
| Lending in-app | ✔ NBFC partners ₹10K–5L | ✔ up to ₹1L (OkLoan) though lending scaled down 2025 | ◐ | ◐ | ✘ | ✘ |

### B.3 Pricing (INR, Sep 2026; list prices, taxes usually extra)

| App | Free | Paid tiers |
|---|---|---|
| Khatabook | Ledger, SMS, reminders, PDF, QR — free | "GST Billing Software" 1–2 yr licence via resellers; price not published (est. ₹1–4K/yr, unverified) |
| OkCredit | Ledger with ads, capped daily txns, SMS from own SIM | ₹30/mo Unlimited txns (ads) · ₹75/mo Ads-Free++ (no ads, multi-device, bills incl. GST, defaulters view, desktop, stock) · ₹99/mo Premium (+unlimited server SMS). "Prices will remain stable." ([okcredit.in/pricing](https://okcredit.in/pricing)) |
| Vyapar | Mobile app free (billing, inventory, ledger, reminders, offline) | 1-yr: Silver mobile ₹699 · desktop ₹3,799 · combo ₹4,399; Gold ₹799 / ₹4,099 / ₹4,799 (adds unlimited e-invoice, credit limits, up to 5 companies, TDS/TCS); Retail/Distributor/Manufacturing Pro and Platinum listed at ₹1,599–₹2,399 (basis unclear, unverified). 3-yr bundles discounted; 7-day trial; renewals at same list. ([Techjockey Vyapar](https://www.techjockey.com/detail/vyapar), [itforsme](https://www.itforsme.in/pricing/vyapar-india), [Vyapar pricing](https://vyaparapp.in/pricing)) |
| myBillBook | 7-day trial / money-back; no perpetual free | Plus ₹3,490/yr (1 user + CA) · Pro ₹3,990/yr (desktop, 500 SMS/WA, godowns) · Pro Max ~₹570/mo billed yearly (3 users + CA, 2 businesses, POS, e-invoice, unlimited e-way, Tally export). Older SKUs Diamond ₹2,599 / Platinum ₹2,999 / Enterprise ₹4,999. ([mybillbook.in/pricing-plans](https://mybillbook.in/pricing-plans), [Techjockey](https://www.techjockey.com/detail/mybillbook-accounting-software)) |
| Swipe | "Lifetime free": unlimited invoices, purchases, quotes, WhatsApp share | From ₹250/mo incl. tax (desktop+tablet+mobile, GSTR-1, 40+ reports, unlimited e-invoice/e-way, gateway). Users note 3-yr plan rose ₹2,899 → ₹6,499. ([getswipe.in/pricing-comparison](https://getswipe.in/pricing-comparison), [Play reviews](https://play.google.com/store/apps/details?id=in.swipe.app&hl=en_IN)) |
| Zoho Books IN | Free if revenue ≤ ₹25 L/yr: 1 user + 1 accountant, 1,000 invoices/yr, GST reports, reminders, portal | Standard ₹749/mo (annual; ₹899 monthly), 3 users, e-invoice · Professional ₹1,499 (5 users, custom roles) · Premium ₹2,999 (10 users, payroll) · Elite ₹4,999 (15 users, warehouses, batch/serial) · Ultimate ₹7,999 (25 users, analytics). Add-ons: user ₹150/mo, SMS ₹75/credit. ([zoho.com/in/books/pricing](https://www.zoho.com/in/books/pricing/)) |

### B.4 Positioning takeaways for UdhaarBook

1. **Two clusters exist and don't overlap well.** Ledger-first (Khatabook, OkCredit) are free/cheap, multilingual, phone-only, and weak at inventory/GST; billing-first (Vyapar, myBillBook, Swipe, Zoho) are paid, English/Hindi, desktop-heavy, and treat udhaar as "receivables". UdhaarBook's brief (ledger + inventory for all business types) sits in the gap Bikri AI calls the "multi-app trap" ([source](https://bikriai.com/blog/khatabook-vs-okcredit)).
2. **Monetisation reality:** OkCredit reached profitability only after abandoning lending and charging ₹30–99/month with 2L+ payers; Khatabook still loses >₹100 Cr/yr on a lending thesis. Cheap monthly SaaS with a genuinely useful paid wall (multi-device, staff, stock, server SMS) is proven; ads are hated.
3. **Trust primitives are table stakes:** customer-side SMS on every entry, shareable statement, collection date with D-1/D0 auto reminders, and QR payment that auto-posts.

---

## Part C — Indian SMB context the spec must encode

### C.1 GST essentials for billing software

**GSTIN format (15 chars):** `SS PPPPPPPPPP E Z C` — 2-digit state code (01 Jammu & Kashmir … 37 Andhra Pradesh, 38 Ladakh, 97 Other Territory), 10-char PAN (`AAAAA9999A`, 4th char = entity type, 5th = first letter of surname/name), 13th = entity number for that PAN within the state (1–9 then A–Z), 14th = `Z` by default, 15th = **checksum**. Checksum algorithm: map chars to 0–35 (0–9, A–Z), multiply alternate positions by 1 and 2 starting with factor 1 at position 1, for each product take `quotient + remainder` on division by 36, sum, check digit = `(36 − sum mod 36) mod 36` mapped back to the alphabet. Validate regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` and the checksum client-side; verify existence via GSTN public search API or a GSP. (Standard GSTN spec; implementation widely documented.)

**HSN/SAC:** Goods use HSN (Harmonised System) codes; services use SAC (99xxxx). Since 1 Apr 2021: turnover ≤ ₹5 Cr → 4-digit HSN mandatory on B2B invoices (optional on B2C); > ₹5 Cr → 6-digit on all invoices. GSTR-1 Table 12 requires HSN-wise summary. Item master must store HSN/SAC and default rate; rate is *determined by the code*, not the name ([Busy.in](https://busy.in/gst/gst-slabs-5-percent-18-percent/)).

**Rate slabs after GST 2.0 (effective 22 Sep 2025):** 0%, **5%**, **18%**, **40%** (sin/luxury), plus special 3% (gold, silver, jewellery) and 0.25% (rough diamonds). The 12% and 28% slabs were abolished (≈99% of 12% items → 5%; ≈90% of 28% items → 18%; rest → 40%). Compensation cess on tobacco continues (unverified detail). Software must keep **rate history by effective date** because invoices dated before 22 Sep 2025 use old rates. Sources: [Kotak MF GST 2.0](https://www.kotakmf.com/Information/blogs/gst-2-point-0), [Busy.in slabs](https://busy.in/gst/gst-slabs-5-percent-18-percent/), [Fonoa](https://www.fonoa.com/resources/blog/gst-reform-india-september-2025).

**CGST/SGST vs IGST — place of supply:** If supplier's state (from GSTIN) == place of supply state → **intra-state** → split rate equally into CGST + SGST (UTGST for UTs without legislature). Else → **inter-state** → **IGST** at full rate. Place of supply for goods = delivery location (ship-to); for services generally = recipient's registered location (B2B) or address on record (B2C). Invoice must carry the place-of-supply state name+code when inter-state. Rule: `if pos_state == supplier_state: cgst = sgst = rate/2 else igst = rate`.

**Composition scheme:** Threshold ₹1.5 Cr aggregate turnover (₹75 L in special-category states); services-only composition ₹50 L (6%). Rates: traders/manufacturers 1% (0.5+0.5), restaurants 5%, service providers 6%. Composition dealers **cannot charge GST or claim ITC**, must issue a **"Bill of Supply"** (not a tax invoice) bearing "composition taxable person, not eligible to collect tax on supplies", and file CMP-08 quarterly + GSTR-4 annually. Spec: business flag `gst_type ∈ {unregistered, regular, composition}` drives document type and whether tax lines render ([Busy.in](https://busy.in/gst/gst-slabs-5-percent-18-percent/)).

**B2B vs B2C:** B2B = recipient has GSTIN (must appear on invoice; reported invoice-wise in GSTR-1 Table 4). B2C large = inter-state, invoice value > ₹2.5 L (Table 5, invoice-wise); other B2C reported as rate-wise summaries (Table 7). Dynamic QR on B2C invoices is mandatory only for turnover > ₹500 Cr.

**Mandatory tax-invoice fields (CGST Rule 46):** supplier name, address, GSTIN; consecutive **serial number ≤16 characters**, unique per FY, alphanumeric with `/` and `-` only; date; recipient name, address, GSTIN (if registered) or name/address/state for unregistered where value ≥ ₹50,000; HSN/SAC; description; quantity + unit (UQC codes e.g. NOS, KGS, MTR, LTR, PCS→NOS); total value; taxable value after discount; rate and amount of CGST/SGST/IGST/cess separately; place of supply with state name for inter-state; delivery address if different; whether tax payable on **reverse charge**; signature/digital signature (not required for e-invoice with IRN). Bill of supply omits tax lines. **Invoice-cum-bill of supply** allowed for mixed taxable/exempt to unregistered. Number series must be declared/predictable: spec `Series(prefix, next_number, fy)` reset at 1 Apr.

**Credit / debit notes (Sec 34):** Issued by supplier against one or more invoices (one-to-many allowed since 2019) for returns, deficiency, post-sale discount, rate/quantity correction. Credit note reduces supplier's output tax **only if declared in GSTR-1 by 30 November following the FY end** (or annual return, whichever earlier) and the recipient reverses ITC; otherwise it is a "financial credit note" without GST effect. Debit note raises tax with no time limit for ITC on the recipient side beyond normal Sec 16(4). Ledger impact: credit note → "You got"-like reduction in receivable (`type=CREDIT_NOTE`), debit note → increase.

**e-Invoicing (IRN via IRP):** Mandatory for taxpayers with aggregate turnover **> ₹5 Cr in any FY since 2017-18**, for B2B, exports, SEZ and B2G supplies plus credit/debit notes against them; **not** for B2C (pilot only), and exempt for banks/NBFCs/insurers/GTA/passenger transport/cinema/SEZ units. Once applicable, always applicable. **30-day reporting window:** invoices must be reported to the IRP within 30 days of invoice date — applied to AATO ≥ ₹100 Cr from Nov 2023 and extended to **AATO ≥ ₹10 Cr from 1 Apr 2025**; some advisers read the current rule as ₹5 Cr+ — confirm before hard-coding (mark as configurable). Invoice without IRN when required is not a valid invoice and buyer loses ITC. Sources: [Swipe blog](https://getswipe.in/blog/article/e-invoice-turnover-limit-2026-5-crore-rule-india), [Tally](https://tallysolutions.com/accounting/e-invoicing-rules-in-india/), [Busy.in e-invoice](https://busy.in/gst/e-invoicing-mandate-for-businesses-with-annual-turnover-over-rs-10-crore/). Implementation: JSON schema v1.1 posted to IRP (NIC or private IRPs such as ClearTax, Cygnet, IRIS) via GSP; response returns IRN (64-char hash), signed QR, ack no./date; print QR on invoice. Cancellation within 24 h.

**e-Way bill:** Required for movement of goods with consignment value **> ₹50,000** (per invoice, incl. tax; some states lower for intra-state, e.g. ₹1 L/₹50K variants), generated on ewaybillgst.gov.in / via API with Part A (invoice, HSN, value) and Part B (vehicle/transporter). Validity by distance (1 day per 200 km, revised from 100 km in 2021). Not needed for exempt goods, non-motorised conveyance, or where value below threshold. Vyapar users specifically ask for mobile e-way generation ([Vyapar Play](https://play.google.com/store/apps/details?id=in.android.vyapar&hl=en_IN)).

**Returns the data must feed:** **GSTR-1** (outward supplies, monthly; quarterly under QRMP for ≤ ₹5 Cr with optional IFF for B2B in months 1–2) — needs B2B invoice-wise, B2C large, B2C small rate-wise, credit/debit notes, HSN summary, document series summary (Table 13). **GSTR-3B** (summary self-assessed tax + ITC, monthly/quarterly) — needs outward taxable value by CGST/SGST/IGST/cess and inward ITC. GSTR-2B (auto-drafted ITC) is consumed, not produced. Invoice Management System (IMS) on GSTN (2024–25) lets buyers accept/reject supplier invoices; Zoho already exposes it ([Zoho pricing](https://www.zoho.com/in/books/pricing/)). Export: JSON in GSTN offline-tool schema or Excel template; Tally XML export is a common ask (myBillBook Pro Max advertises it).

**Reverse charge (RCM):** Sec 9(3) notified categories (GTA, legal services, security services to registered body corporate, sponsorship, director's services, etc.) and Sec 9(4) (registered builder buying from unregistered supplier, specific). Recipient self-invoices and pays tax; invoice flag "tax payable on reverse charge: Yes". ITC on RCM tax available. Spec: line/invoice-level `reverse_charge: bool`; output for GSTR-3B Table 3.1(d).

**TDS/TCS (brief, for SMB):** TDS under Income Tax on payments made by businesses whose accounts are audited: 194C contractors (1%/2%), 194J professional fees (10%; technical 2%), 194H commission (2% since Oct 2024), 194I rent (2%/10%), **194Q** purchases > ₹50 L/yr from a seller when buyer turnover > ₹10 Cr (0.1% on excess). **TCS 206C(1H)** on sale of goods > ₹50 L was **omitted from 1 Apr 2025** (Finance Act 2025) — treat as legacy (unverified). GST-TDS (2%) applies only to government/PSU buyers. Spec impact: allow "TDS deducted by customer" as a receivable-reducing entry type so the ledger nets correctly.

### C.2 UPI collection

**Deep-link format (NPCI UPI Linking Specification v1.6/1.7):**
`upi://pay?pa=<payee VPA>&pn=<payee name>&am=<amount 2dp>&cu=INR&tn=<note ≤ 50 chars>&tr=<merchant txn ref>&tid=<txn id>&mc=<MCC>&url=<invoice URL>&mode=<01 QR|02 intent…>&purpose=<code>&sign=<base64 signature>`.
Only `pa` is strictly required; `am` locks amount in most apps (some allow edit); `tr` is your reconciliation key; `mc`/`sign` are for verified merchants. **All values must be URL-encoded** — an unencoded `&` or space silently truncates. Sources: [NPCI linking spec (mirror)](https://www.labnol.org/files/linking.pdf), [Dvaarik explainer](https://www.dvaarik.com/blog/upi-payment-link-deep-linking-india), [NPCI spec wiki](https://github.com/bgagan911/RandomDocs/wiki/NPCI-UPI---Specifications-for-Deep-Linking).

**Static vs dynamic QR:** Static QR = the same `upi://pay?pa=&pn=` string printed once; payer types the amount; free forever (any bank/PSP VPA, including a personal one). Dynamic QR = per-transaction string with `am` and `tr`, generated on-screen or on the invoice; also free to generate. Dynamic QR on B2C invoices is only *mandated* for > ₹500 Cr turnover but is good practice.

**Payment links vs deep links:** A `upi://` link only works on a phone with a UPI app; for WhatsApp/SMS a **web link** (`https://pay.yourapp/…`) that renders the QR + intent buttons (GPay/PhonePe/Paytm `…://upi/pay?` schemes) is needed. Behavioural caveats (unverified but widely reported): Google Pay and some apps block intent/collect payments to VPAs not registered as merchants or show "payment to unverified merchant" warnings; P2P collect requests are throttled and capped (₹2,000 for P2P collect); per-transaction cap ₹1 L (higher for specific merchant categories). UPI Lite/offline is irrelevant to collection.

**What needs a PSP/aggregator:** the free path (static/dynamic QR to the merchant's own VPA) gives **no server callback** — "nothing calls your system back" ([Dvaarik](https://www.dvaarik.com/blog/upi-payment-link-deep-linking-india)). To auto-post "You got" entries you need one of: (a) an RBI-licensed **Payment Aggregator** (Razorpay, Cashfree, PhonePe PG, Paytm PG, Pine Labs, Khatabook's own PA) that issues a merchant VPA/virtual account and **webhooks** every credit with `utr`, amount, payer VPA, your `tr`; (b) a bank's UPI collect/"UPI AutoPay" API (requires a merchant onboarding contract); (c) a soundbox/SMS-parsing approach (fragile, permissions-hostile on Android 13+). PA onboarding needs KYC (PAN, bank proof, business proof; sole proprietors can use Udyam/shop licence), settlement T+1 typically, MDR 0% on UPI for merchants (government mandate) but 1.5–2% on cards; the PA may hold new-merchant funds 24–48 h (Khatabook's 48-h hold).

**Reconciliation problem:** Payments to a static QR carry no party context (payer VPA ≠ ledger phone), so a ledger app must (1) prefer dynamic requests carrying `tr = payment_request_id → party_id`; (2) keep an **"unmatched payments"** queue for static-QR credits and offer one-tap mapping to a party (learn payer-VPA→party mapping); (3) reconcile daily settlements to the sum of captured payments; (4) handle late-success webhooks (UPI "pending" → success up to T+1) idempotently by `psp_txn_id`/UTR. The #1 collection complaint across Khatabook and OkCredit is "money debited, ledger not updated" — this queue plus a manual "I received it via UPI (enter UTR)" fallback is the mitigation.

### C.3 WhatsApp and SMS

**wa.me deep links (free, manual):** `https://wa.me/91XXXXXXXXXX?text=<url-encoded>` or Android intent to `com.whatsapp`; opens the chat with prefilled text, user taps Send. No approval, no cost, no delivery receipt to your server, cannot be scheduled/automated. Suitable for statements, invoices, reminder nudges. Sharing a PDF requires the share-sheet, not wa.me.

**WhatsApp Business Platform (Cloud API) — for automated/server-sent messages:** Requires Meta Business verification, a dedicated number, message **templates approved by Meta** (categories Marketing / Utility / Authentication; Meta re-categorises templates), and either direct Cloud API or a BSP (AiSensy, Interakt, Gupshup, WATI…). Pricing moved from per-conversation to **per-message on 1 July 2025**. India rates (Meta, excl. GST, Sep 2026): **Marketing ≈ ₹0.86**, **Utility ≈ ₹0.115**, Authentication ≈ ₹0.115; service (free-form replies inside the 24-h customer-service window) free until 30 Sep 2026, **charged ₹0.115 from 1 Oct 2026** with 1,000 free service messages/number/month; utility templates sent inside an open 24-h window were free and become chargeable from Oct 2026; 72-hour free window after Click-to-WhatsApp ads. BSPs add ₹0.10–0.30/msg or ₹999–9,999/mo platform fees, +18% GST. Payment reminders with amount/due-date are **Utility**; anything with offers is Marketing (Meta also imposes per-user marketing frequency caps in India). Opt-in is required (record it: timestamp + source). Sources: [MyOperator pricing guide](https://myoperator.com/blog/whatsapp-business-api-pricing-india-2026), [AiSensy](https://aisensy.com/pricing), [Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026).

**SMS — TRAI DLT (TCCCPR 2018 + 2024–25 amendments):** Before sending any A2P SMS in India: (1) register the **Principal Entity** on a telco DLT portal (Airtel/Jio/Vi/BSNL/Tata; one registration is honoured across operators) with PAN/GST/authorisation letter, ≈ ₹5,900 + GST; (2) register **Headers** (6-char alphabetic sender IDs for service/transactional; numeric for promotional), ≈ ₹590/yr each; (3) register **Content Templates** with typed variables (`{#var#}` limited length; since Oct 2024 typed placeholders) — exact match required or the message is silently dropped at scrubbing; (4) bind PE→Telemarketer chain (mandatory Dec 2024). Categories now carry header suffixes **-T (transactional, banks only), -S (service), -P (promotional), -G (government)**; "Service-Explicit" was discontinued in May 2025 and migrated to Promotional, which is DND-scrubbed and time-boxed to 9 am–9 pm. Ledger-entry and reminder SMS are **Service-Implicit (-S)**; anything with offers must be -P with consent. Lead time 2–4 weeks. Delivery cost ≈ ₹0.12–0.25/SMS via aggregators (unverified). Sources: [Telerivet DLT guide](https://www.telerivet.com/blog/india-sms-compliance-trai-dlt-registration-and-tcccpr-guide), [Exotel](https://support.exotel.com/support/solutions/articles/3000096504-trai-regulations-on-commercial-communications-dlt-portal-sms-in-india), [Infobip](https://www.infobip.com/docs/essentials/asia-registration/dlt-registration).

### C.4 Ledger semantics & vocabulary (encode in copy and data model)

| Term | Meaning | UI mapping |
|---|---|---|
| **Udhaar / उधार** | Credit extended; goods given, money not yet received | "You gave ₹" (red) — receivable ↑ |
| **Jama / जमा** | Deposit/credited; payment received | "You got ₹" (green) — receivable ↓ |
| **Naam / नाम** | Debit against the party ("uske naam pe likh do") | Same as udhaar in customer ledger |
| **Hisaab / हिसाब** | The account/statement; "hisaab karna" = settle up | Statement PDF; "Settle" action |
| **Baaki / बाकी** | Balance outstanding | Party balance |
| **Party** | Any counter-party (customer, supplier, both); Tally vocabulary that traders use | `Party.type` |
| **Opening balance** | Balance carried from paper/previous system on day one | `type=OPENING` entry |
| **Lena / Dena (लेना/देना)** | To receive / to give — "₹500 lena hai" = they owe you | "You will get / You will give" totals |
| **Kachha / Pakka bill** | Informal (no GST) vs formal GST invoice | Document type selector (OkCredit uses these exact words) |
| **Khata** | The per-party account book | Party screen |
| **Vyapari / Dukaandar / Grahak** | Trader / shopkeeper / customer | Persona names |

Colour convention is stable across every app: red for money you are owed ("gave"), green for money received. Do not invert it.

### C.5 Number formatting, financial year, units

- **Indian grouping:** 12,34,56,789.00 (last three, then twos). Use `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})`; words: 1,00,000 = 1 lakh (L), 1,00,00,000 = 1 crore (Cr). Short forms in dashboards: ₹1.2 L, ₹3.4 Cr. Store amounts as integer paise.
- **Financial year:** 1 April–31 March; label "FY 2026-27". Invoice series reset per FY; reports default to FY-to-date. Assessment year = FY + 1 (tax context only).
- **Units (UQC for GST):** NOS (numbers/pieces), KGS, GMS, LTR, MLT, MTR, CMS, SQM, SQF, BOX, BAG, BDL, DOZ, PAC, PRS, SET, TON, QTL (quintal = 100 kg), BTL, CAN, ROL. Colloquial "peti/petti" (crate), "gatta" (bundle), "dozen", "kattha", "bori" (sack) need mapping to UQC; allow per-item secondary unit with conversion (e.g. 1 BOX = 12 NOS) — Vyapar/myBillBook do this.
- **Dates:** dd/mm/yyyy display; Hindi/regional month names optional. Weekly "collection day" (e.g., Sunday hisaab) is common in wholesale.

### C.6 Data protection — DPDP Act 2023 & DPDP Rules 2025

- **Status:** Act passed Aug 2023; **Rules notified 13 Nov 2025** with phased commencement — Phase 1 (13 Nov 2025) Board constitution and definitions; Phase 2 (14 Nov 2026) Consent Manager registration; **Phase 3 (14 May 2027)** all substantive obligations (notice, consent, security, breach, erasure, children, grievance). MeitY has floated pulling Phase 3 forward to Nov 2026 (not notified). Sources: [PIB notification](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf), [dcomply rules tracker](https://dpdpa.dcomply.in/rules/), [Lexology](https://www.lexology.com/library/detail.aspx?g=7e3af947-10aa-4712-bc1e-54179a613409).
- **Roles for UdhaarBook:** the **merchant** is the Data Fiduciary for their customers' names/phones/balances; **UdhaarBook is the Data Processor** for that data (must act only on the merchant's instructions under contract) and is itself a **Data Fiduciary** for merchant accounts. Customer-side messaging (SMS with balance) is processing on the merchant's behalf — the merchant needs a lawful basis (consent or "legitimate use" for a specified purpose the customer voluntarily provided the number for, e.g. purchase on credit). Keep a per-party `consent_source`/`opt_in_ts`.
- **Obligations to design in:** (1) **Notice + consent** in clear language, available in English and any of the 22 Eighth-Schedule languages on request — bake into merchant sign-up and into the customer's first SMS ("reply STOP…" / view-khata page with privacy notice); (2) **Purpose limitation & erasure** when purpose is served or consent withdrawn — party deletion must cascade to messaging logs, with retention exceptions for legal/tax records (GST requires invoice retention 72 months from annual-return due date); (3) **Security safeguards** (encryption at rest/in transit, access control, logs retained ≥1 year per Rules); (4) **Breach notification** to the Data Protection Board and affected principals — Rule 7 requires intimation without delay and detailed report within 72 hours (also CERT-In 6-hour incident reporting separately); (5) **Grievance officer** contact published, response timelines; (6) **Children's data** — verifiable parental consent (unlikely for merchants, but block <18 sign-ups); (7) Data Principal rights: access, correction, erasure, nomination — expose "download my data / delete my account" in-app (Play data-safety already lists deletion for Khatabook); (8) **Cross-border**: transfers allowed except to countries the Centre restricts — prefer India-region hosting; **Significant Data Fiduciary** duties (DPO in India, annual DPIA/audit) apply only if notified. Penalties up to **₹250 Cr** per breach category. Sources as above and [TCSA roadmap](https://www.tcsa.in/resources/dpdp-rules-2025-implementation-roadmap).
- **Practical:** Contacts-permission upload (as Khatabook/OkCredit do for "add from contacts") is personal data of third parties — process on-device where possible, do not sync the whole address book.

---

## Part D — User pain points & wishlist (mined from store reviews, aggregator reviews and forums)

Ranking = frequency across Khatabook, OkCredit, Vyapar, myBillBook, Swipe review samples plus aggregator summaries (Capterra, Techjockey, SoftwareSuggest, chrome-stats, Kimola, Trustpilot). Store review pages expose only a handful of texts per fetch, so treat ranks as directional **(unverified sample sizes)**.

| # | Pain point / request | Where seen | Evidence | Spec implication |
|---|---|---|---|---|
| 1 | **Intrusive ads & forced upsell** in a free ledger | OkCredit (dominant), myBillBook ("unexpected paid features") | "very annoying ads"; "now they force to take pro plan… more advertising"; 13% 1-star share on chrome-stats ([OkCredit Play](https://play.google.com/store/apps/details?id=in.okcredit.merchant&hl=en_IN), [chrome-stats](https://chrome-stats.com/d/in.okcredit.merchant/reviews)) | No ads. Paywall only for multi-device/staff/stock/server-SMS; never block entries. |
| 2 | **Payment received but not reflected / no notification** | Khatabook Pay, OkCredit | ₹650 QR payment missing, 72-h SLA ([Trustpilot](https://www.trustpilot.com/review/www.khatabook.com)); "notification system lags behind" ([Techjockey](https://www.techjockey.com/detail/khatabook)) | Idempotent webhooks, unmatched-payment queue, manual UTR entry, payment status page. |
| 3 | **App slow / hangs / crashes while entering transactions** | Khatabook (Sep 2026 reviews), Swipe ("speed is very poor"), myBillBook ("recurring technical issues during urgent billing") | [Khatabook Play](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN), [Swipe Play](https://play.google.com/store/apps/details?id=in.swipe.app&hl=en_IN), [myBillBook Play](https://play.google.com/store/apps/details?id=com.valorem.flobooks&hl=en_IN) | Local-first writes (<100 ms), lazy load history, low-end Android budget (2 GB RAM). |
| 4 | **Loan banners, loan delays/rejections** polluting a ledger app | Khatabook | Loan-processing complaints are the top negative theme ([Kimola](https://kimola.com/reports/unlock-key-insights-khatabook-app-user-feedback-report-google-play-hi-148328)) | Keep finance offers out of the core flows; opt-in only. |
| 5 | **Subscription billing errors / double charges** | OkCredit | "duplicate monthly charges despite paying" ([OkCredit Play](https://play.google.com/store/apps/details?id=in.okcredit.merchant&hl=en_IN)) | Use Play Billing/Razorpay subscriptions with visible receipts; in-app cancel. |
| 6 | **Customer support quality** ("zero accounting knowledge", "worst customer service", slow resolution) | Swipe, myBillBook, Vyapar, Khatabook | [Swipe Play](https://play.google.com/store/apps/details?id=in.swipe.app&hl=en_IN), [Vyapar Play](https://play.google.com/store/apps/details?id=in.android.vyapar&hl=en_IN) | WhatsApp support in regional languages; in-app help in Hinglish; status page. |
| 7 | **Stock/payment mismatches; split payments (part cash, part UPI) not tracked** | Vyapar | [Vyapar Play](https://play.google.com/store/apps/details?id=in.android.vyapar&hl=en_IN) | Multi-mode payment on one receipt; stock ledger with audit. |
| 8 | **Cannot re-add a deleted customer with same number** / poor delete-restore | OkCredit; Khatabook YouTube how-tos on backup/restore/reset | [OkCredit Play](https://play.google.com/store/apps/details?id=in.okcredit.merchant&hl=en_IN), [YouTube](https://www.youtube.com/watch?v=ivR71Cs1W7A) | Soft delete + restore; "trash" for 30 days; merge parties. |
| 9 | **Needs internet / weak offline** | myBillBook | "Requires stable internet; offline limitations" ([Techjockey](https://www.techjockey.com/detail/mybillbook-accounting-software)) | Offline-first for ledger and billing; sync indicator. |
| 10 | **Missing regional language support** in billing apps | Vyapar | "missing multilanguage support" ([Techjockey Vyapar](https://www.techjockey.com/detail/vyapar)) | Ship 10+ Indian languages incl. Hinglish transliteration from day one. |
| 11 | **Price hikes on renewal** | Swipe (₹2,899 → ₹6,499 3-yr), Vyapar renewals | [Swipe Play](https://play.google.com/store/apps/details?id=in.swipe.app&hl=en_IN), [itforsme](https://www.itforsme.in/pricing/vyapar-india) | Publish prices; grandfather renewals; annual + monthly options. |
| 12 | **Reminders require external platforms / not truly automatic on WhatsApp** | Khatabook | "Reminders must be sent through external platforms" ([Capterra](https://www.capterra.in/software/197475/khatabook)) | Offer server-sent Utility WhatsApp templates as paid add-on; SMS auto D-1/D0 free. |
| 13 | **Limited report customisation / templates** | myBillBook, Khatabook | [Techjockey myBillBook](https://www.techjockey.com/detail/mybillbook-accounting-software), [SoftwareSuggest Khatabook](https://www.softwaresuggest.com/khatabook) | Configurable statement/invoice templates; CSV/Excel export everywhere. |
| 14 | **Dense UI / onboarding confusion** as features grow | Khatabook | "interface is denser… overwhelm less tech-savvy owners" ([Bikri AI](https://bikriai.com/blog/khatabook-vs-okcredit)); "tutorial for new users needs improvement" ([Techjockey](https://www.techjockey.com/detail/khatabook)) | Progressive disclosure: ledger-only mode by default; modules toggled per business type. |
| 15 | **Date entry friction** ("date feature is annoying and hard to change") | Vyapar | [Techjockey Vyapar](https://www.techjockey.com/detail/vyapar) | Quick chips: Today / Yesterday / pick; remember last used. |
| 16 | **Mobile e-way bill generation** missing | Vyapar | [Vyapar Play](https://play.google.com/store/apps/details?id=in.android.vyapar&hl=en_IN) | Parity of GST features on mobile (Swipe's differentiator). |
| 17 | **Multi-account / multi-ledger views & product-management UX** | Khatabook | [Play reviews](https://play.google.com/store/apps/details?id=com.vaibhavkalpe.android.khatabook&hl=en_IN) | Party groups/tags, area-wise collection routes, item categories. |
| 18 | **Black screen / data not opening after update** | Khatabook, OkCredit | [Capterra](https://www.capterra.in/software/197475/khatabook), [chrome-stats](https://chrome-stats.com/d/in.okcredit.merchant/reviews) | Migration tests; export-before-update; crash-free rate SLO. |
| 19 | **Multi-currency / reserve-fund wishes** (diaspora/personal use) | Khatabook iOS | [App Store](https://apps.apple.com/in/app/khatabook-vyapar-app/id1488204139) | Out of scope for SMB; note personal-ledger use case exists. |

**What users consistently praise (keep):** two-button simplicity; adding customers from contacts; customer gets an SMS so disputes vanish; free PDF statement; QR + payment link "customers can pay without separate setup"; refer-and-earn; regional language UI. ([SoftwareSuggest](https://www.softwaresuggest.com/khatabook), [Techjockey](https://www.techjockey.com/detail/khatabook), [chrome-stats](https://chrome-stats.com/d/in.okcredit.merchant/reviews))

**Structural churn drivers (analyst view):** kirana owners are price-sensitive, not tech-savvy, and prefer WhatsApp to apps; software willingness-to-pay is near zero unless it saves cash (collections) or time (GST); lending as monetisation imports credit risk and regulatory whiplash (OkCredit's P2P product OkNivesh shut Jan 2025 after RBI rules; lending book cut ₹132 Cr → ₹17 Cr in 2025). Sources: [Substack on kirana tech](https://pratikchandak.substack.com/p/why-kirana-tech-is-so-difficult-to), [The Ken](https://the-ken.com/story/why-khatabook-okcredits-kiranatech-failed-to-fly-off-the-shelves/), [The Paypers on OkNivesh](https://thepaypers.com/payments/news/okcredit-halts-p2p-lending-due-to-new-regulations), [Ascendants](https://ascendants.in/business-stories/okcredit-turns-profitable-november-2025-harsh-pokharna/).

---

## Appendix — Quick reference for the spec team

**Minimum viable ledger (parity with Khatabook free tier):** OTP login → language → business → parties (customer/supplier) → GAVE/GOT entries with note/date/photo → running balance → per-entry customer SMS (DLT -S) → Remind (wa.me/SMS/call) + bulk → collection date with auto D-1/D0 SMS → party PDF statement → totals dashboard → multiple businesses → cloud backup + offline → app lock → account deletion.

**Differentiators worth building (gaps across all six):** unified udhaar + stock + kachha/pakka billing in one flow for all business types; unmatched-payment reconciliation queue; staff roles without a desktop licence; regional languages in the *billing* half; transparent monthly pricing with no ads; DPDP-ready consent and erasure; rate-history-aware GST engine (post-22-Sep-2025 slabs).

**Regulatory constants to keep configurable (not hard-coded):** GST slabs and effective dates; e-invoice turnover threshold (₹5 Cr) and 30-day reporting AATO (₹10 Cr); e-way bill threshold (₹50,000; state overrides); composition limits (₹1.5 Cr / ₹75 L / ₹50 L); HSN digit rule (4/6 at ₹5 Cr); credit-note declaration deadline (30 Nov); DPDP Phase-3 date (14 May 2027); WhatsApp per-message rates; DLT header/template IDs.
