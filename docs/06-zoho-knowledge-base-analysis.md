# Part 6 — Knowledge-Base Analysis and DigiKhaato's Help Content Plan

*Zoho runs two relevant help surfaces: the documentation it writes for its own products, and Zoho Desk Knowledge Base, the product it sells to other companies for writing theirs. Dossier R1 Part D catalogues both. This chapter extracts what each teaches about documenting a product of DigiKhaato's shape, then converts that into a concrete help content plan tied to features HLP-01, HLP-02 and HLP-03 — including the article tree and the first thirty articles to write.*

---

## 6.1 What Zoho's own help surfaces look like

Zoho Inventory's help is not one thing but seven, and the separation is deliberate [R1 §D.1].

The **Help Centre** at `zoho.com/{region}/inventory/help/` is the reference documentation: a left-nav tree organised by module — Getting Started, Items, Sales, Purchases, Inventory/Warehouses, Integrations, Settings, Reports, Migration — with breadcrumbs, in-page anchors, screenshots, "Note" and "Insight" callouts and related-links footers. Crucially it is **region-specific**: the `/in/` tree contains GST, e-Invoicing, e-Way Bill and Delivery Challan branches that do not exist in `/us/` [R1 §D.1]. The same product has different documentation in different countries because it has different behaviour.

The **KB/FAQ** at `zoho.com/{region}/inventory/kb/` is a separate, shorter surface: Q&A articles grouped by topic (General overview, Items, Reports, Settings). These answer the "why can't I…" questions that the reference documentation does not, because reference documentation describes what a screen does rather than why an action is refused.

Around those two sit a dated **What's New** changelog filterable by year; a **Community** at help.zoho.com carrying Q&A, ideas with votes, announcements, quarterly release posts and a custom-function library; webinars; API documentation; migration guides; in-app **interactive tour guides** added in 2026; a **Widget Pane** for announcements added July 2025; and contextual help links inside settings screens [R1 §D.1].

The structural lesson is the **split between task-oriented and reference content**. The Help Centre is organised by *module* — it mirrors the product's navigation, which makes it findable by someone who already knows where they are. The KB is organised by *question* — it is findable by someone who does not. A product that ships only one of these forces every "why" question into a support ticket.

---

## 6.2 What Zoho Desk Knowledge Base teaches

Zoho Desk KB is the commercial product, and its feature set is a well-considered map of what a mature help system contains [R1 §D.2]:

| Concept | Implementation |
|---|---|
| Structure | Category (tied to a department or brand) → Section → Sub-section → Sub-sub-section → Articles; **maximum 3 hierarchy levels** under a category; up to 700 sections |
| Folders and tags | Sections act as folders; tags on articles; Related Articles; prev/next quick navigation |
| Search | Help-centre search with **keyword analytics** ("commonly searched keywords"); an AI answer bot over the KB |
| Lifecycle | **Draft → (Review with assigned reviewers) → Published**, plus Unpublished and **Expired** (with an expiry date and filters for expiring today / 7 days / 30 days) |
| Versioning | Every draft save is a minor version, publish is a major version, with side-by-side compare and restore-as-new-version; notes up to 250 characters, non-deletable |
| Permissions | Category and section visibility: None (everyone), Groups, Public, Agents-only, Custom IP; article display permission for registered versus all users |
| Feedback | Like/dislike plus comment; **feedback auto-creates a ticket** in the primary department |
| Analytics | Views, likes and dislikes, article usage, search keywords, feedback-to-ticket conversion |
| Translations | Multilingual KB at Professional tier; auto-translation to 50+ languages stored as drafts at Enterprise; **translations do not auto-update** |
| Rich content | Rich text, images, embedded video, attachments, a central KB Gallery for media |
| SEO | Per-article meta title, keywords and description; 301 redirects; Google Analytics; custom domain; CSS/HTML/JS customisation |

Three of these deserve emphasis because they are the load-bearing ideas rather than the feature list.

**Three levels is the practical ceiling.** Zoho Desk caps hierarchy at three levels under a category, and Zoho's own Inventory help uses roughly that depth for a hundred-module suite. Depth is a findability tax: every additional level is a decision the reader must make correctly.

**Search keyword analytics is the cheapest content roadmap available.** Knowing what people searched for — and especially what returned nothing — tells you what to write next, with no user research required.

**Feedback routed to tickets closes the loop.** A dislike on an article is a support signal. Zoho converts it into a ticket; a smaller operation can convert it into a weekly review queue.

Zoho Learn, the internal-SOP sibling, adds Spaces → Manuals → Chapters → Articles with approval workflows, mandatory reads and verification reminders [R1 §D.3]. It is oriented at internal documentation rather than customer help and is out of scope here, but it confirms the pattern: the *customer* help tree is shallower than the *internal* one.

---

## 6.3 What this teaches for a product of DigiKhaato's shape

Zoho's help system is sized for a hundred-module suite sold to a company with an IT function. DigiKhaato has roughly fifteen concepts and is used by a 45–54-year-old owner-operator standing at a counter, on a phone, often in Hindi [R3 §4.2]. Five translations follow.

**1. Two levels, not four.** The dossier's own recommendation is explicit: *"Zoho's 3–4 levels are for a 100-module suite; DigiKhaato has ~15 concepts. Two levels keep mobile navigation sane"* [R1 §D.4]. Topic → Article. Nothing deeper.

**2. Contextual help is the primary entry point, not search.** Zoho's number-one usability complaint is "I see a lot of tools I don't know how to use" [R1 §E.1 #3], and the prescribed answer is a "?" on every screen mapping to one to three articles [R1 §D.4]. On a phone, a reader who has to leave the screen, find the help centre and construct a query has already given up. The help must come to the screen.

**3. The FAQ layer is not optional.** Zoho's KB exists specifically to answer "why can't I delete this item" [R1 §D.4] — and DigiKhaato generates exactly this class of question by design, because it archives instead of deleting, blocks archiving while a balance or stock is non-zero, corrects rather than edits, and blocks negative stock by default (Part 0 §0.7, §0.11). Every one of those correct decisions produces a confused user. Each needs an answer of 120 words or fewer.

**4. Search must speak Hinglish.** The vocabulary of the user is *udhaar, khata, bill, parchi, stock, maal, hisaab, baaki, party* [R1 §D.4; R2 §C.4]. A search index that only matches "invoice" and "receivable" will return nothing for the majority of real queries. Synonym mapping is a content requirement, and zero-result queries must be logged — the Zoho lesson about keyword analytics applied at small scale.

**5. Language is human-reviewed and narrow.** Zoho gates translation to Enterprise and machine-translates at 50+ languages; the dossier's verdict is that machine-translated accounting and GST content is risky and that three to five human-reviewed languages is the right answer [R1 §D.4]. English and Hindi at MVP, matching ADR-006, then Gujarati, Marathi and Tamil.

### What to exclude, and why

The dossier is equally clear about what not to build [R1 §D.4], and each exclusion is adopted:

| Excluded | Reason |
|---|---|
| Multi-brand / multi-department KBs | Single product, single brand — though note that white-label partners may need *branded* help, which is a rendering concern, not a content-model one |
| Reviewer/approval workflow, expiry dates, version-diff UI | Git PR review suffices for a small team; expiry rarely matters for product help |
| Visibility tiers (Groups, Custom IP, Agents-only) | No agent tier; all help is public |
| Public SEO portal with custom domain and 301 redirects | Distribution is app-store and WhatsApp, not organic search — revisit only if web becomes an acquisition channel |
| Community forum with idea voting | Zoho's forum demonstrates the moderation debt: ten-year-old unanswered threads [R1 §D.4, §E.1 #6] |
| Auto-translation to 50 languages | Machine-translated GST content is a liability |
| Article templates library, media gallery | Overkill below 100 articles |
| Standalone LMS features | Not a training product |

---

## 6.4 DigiKhaato's help content plan

### Feature mapping

| Feature | Scope |
|---|---|
| **HLP-01 — In-app help centre** | Topic → Article tree, search with Hinglish synonyms, FAQ per topic, "was this helpful" feedback, related articles, per-locale bodies with English fallback |
| **HLP-02 — Contextual help & tours** | A "?" affordance on every screen mapping that screen's ID to one to three articles; four guided, skippable, re-launchable tours |
| **HLP-03 — What's new** | Dated release-note list inside the app, mirroring Zoho's well-liked changelog plus Widget Pane pattern [R1 §D.4] |

### Content model

The dossier supplies the minimum content model directly [R1 §D.4] and it is adopted unchanged:

```
article      { id, slug, locale, title, body(md), topic, tags[], related[],
               screen_ids[], status(draft|published|archived), version, updated_at }
faq          { question, answer, topic }
release_note { date, title, body, version }
feedback     { article_id, version, helpful, comment, app_version }
search_log   { query, results_count, locale }
```

Three notes on implementation. Content is authored as Markdown in the repository and served through `help_article` (Part 0 §0.6), so that non-engineers can edit through pull requests and the app can update content without a release. `screen_ids[]` is the join that makes HLP-02 work: each screen in the application declares a stable identifier, and the "?" renders the articles that list it. `search_log` with `results_count = 0` is the content roadmap.

### The article tree (two levels, eight topics)

The topics follow the dossier's proposed set [R1 §D.4], adjusted to match the module map in Part 0 §0.3:

| # | Topic | Covers | Modules |
|---|---|---|---|
| 1 | **Getting started** | Sign-up, language, business setup, business type, first party, first entry, importing from paper | PLT |
| 2 | **Parties & udhaar** | Adding parties, customer versus supplier, opening balance, you gave / you got, statements, reminders, collection dates, credit limits, corrections, write-offs | PTY, LED |
| 3 | **Items & stock** | Creating items, units and categories, HSN/SAC, opening stock, adjustments, low stock, stock value | INV |
| 4 | **Bills & invoices** | Estimate versus tax invoice versus bill of supply, making a bill, discounts, printing (A4 and thermal), sharing, credit notes, voiding | SAL |
| 5 | **Purchases & suppliers** | Purchase bills, supplier payments, what happens to stock and the supplier's balance | PUR |
| 6 | **Payments & reminders** | Recording payments, split payments, UPI QR and links, receipts, reminder channels and costs | PAY, NTF |
| 7 | **GST** | GSTIN, registration types, place of supply, rates and the 2025 change, HSN, GST summary, handing off to your CA | Tax, RPT |
| 8 | **Account & security** | Team and roles, sessions and devices, app lock, backup, data export, deleting your account, privacy | PLT, WLB |

Each topic carries its own FAQ block. The tree is deliberately navigable in one screen on a phone.

### The four guided tours (HLP-02)

The dossier names the four critical flows [R1 §D.4] and they map one-to-one onto the product's core loops:

1. **Record udhaar** — party → You gave → amount → note → save → balance updates → share.
2. **Add stock** — item → opening stock or purchase bill → on-hand changes → low-stock alert.
3. **Make a GST bill** — party → items → tax split by place of supply → issue → print or share → ledger entry appears.
4. **Send a reminder** — collection date → due-today bucket → Remind → WhatsApp with balance and UPI link.

Each is skippable, re-launchable from the help centre, and never blocks the screen.

---

## 6.5 The first thirty articles

These are ordered by expected support volume, which in this product means: the things a new user does in the first ten minutes, and the things the product refuses to do. Every article is task-titled in the user's words rather than the module's.

#### Topic 1 — Getting started

1. **Create your business and choose your business type** — what the business-type choice changes (defaults only) and how to change it later. *Screens: onboarding.*
2. **Set up your business profile for bills** — legal name, trade name, GSTIN, address, logo, UPI ID, signature, terms; why each appears on a document. *Screens: settings/profile.*
3. **Move your paper khata into DigiKhaato** — adding parties with opening balances one at a time versus CSV import; what date to use. *Screens: parties/new, imports.*
4. **Add your first party and record your first entry** — the two-minute path from empty state to a balance. *Screens: parties/list, party/detail.*
5. **Run more than one business from one login** — creating and switching businesses, what is and is not shared. *Screens: business switcher.*

#### Topic 2 — Parties & udhaar

6. **You gave and You got: what the red and green buttons mean** — the direction rules for customers and for suppliers, in the market's own vocabulary. *Screens: party/detail, entry sheet.*
7. **Set an opening balance for an old customer** — how it is posted, and until when it can be changed.
8. **Someone is both my customer and my supplier** — one party, both flags, one net balance.
9. **Fix a wrong entry** — why DigiKhaato corrects instead of editing, what a reversal looks like on the statement, and who is allowed to do it. *FAQ-adjacent; answers a designed-in confusion (Part 0 §0.11 rule 1).*
10. **Send a customer their statement on WhatsApp** — date range, PDF, share.
11. **Set a collection date and let reminders go out automatically** — D-1 and D0, per-party opt-out, what the customer receives.
12. **Send reminders to many customers at once** — bulk selection, channel choice, what it costs.
13. **Give a customer a credit limit** — warn versus block, where the warning appears.
14. **Understand your ageing report** — 0–30, 31–60, 61–90, 90+ and what to do with each bucket.
15. **Close a small balance you will never collect** — the write-off entry and its effect on reports.
16. **Why can't I archive this party?** — the non-zero-balance rule and the two ways out. *FAQ.*

#### Topic 3 — Items & stock

17. **Add your first item** — the seven fields that matter and the ones you can leave empty.
18. **Units, categories and what UQC means for GST** — mapping peti, bori and gatta onto NOS, BAG and BDL.
19. **Enter your opening stock** — per item, with cost, and why cost matters for valuation.
20. **Adjust stock after a count, damage or theft** — reasons, effect on valuation, and the audit record.
21. **Why won't it let me sell more than I have?** — the negative-stock setting, where to change it, and why the default is block. *FAQ.*
22. **Set a reorder point and get low-stock alerts** — where the alert appears and when it re-fires.

#### Topic 4 — Bills & invoices

23. **Kachha bill or pakka bill? Estimate, Bill of Supply and Tax Invoice** — which document your business is allowed to issue, based on your GST registration.
24. **Make a GST bill in under a minute** — the counter flow, including a walk-in sale with no party.
25. **Print on a thermal printer or share a PDF** — 80mm versus A4, what to do when the printer is not found.
26. **Take a return: credit notes explained** — full and partial, restocking, refund versus advance.
27. **Why can't I delete this invoice?** — void versus delete, why the number is never reused, and what void reverses. *FAQ.*

#### Topic 6 — Payments & reminders

28. **Record a payment, including part cash and part UPI** — split tender and allocation to open bills.
29. **Collect by UPI: your QR and payment links** — static versus dynamic, what auto-posts and what you must match by hand.

#### Topic 7 — GST

30. **Give your CA everything they need** — the GST summary, sales and purchase registers, HSN summary and the export path; what the 22 September 2025 rate change means for old bills.

Two observations about this list. Six of the thirty (articles 9, 16, 21, 27 and parts of 20 and 29) exist to explain a *refusal* — and that ratio is not a design flaw but the direct consequence of the immutability and safety rules in Part 0 §0.11. Zoho's KB exists for precisely this reason [R1 §D.4]. And every article title is phrased as a task or a question, never as a noun: "Fix a wrong entry", not "Ledger corrections".

---

## 6.6 Operating the help system

**Lifecycle.** Draft → Published → Archived, with version history from Git. No reviewer workflow, no expiry dates, no diff UI [R1 §D.4]. The Markdown source is the record.

**Feedback.** A thumbs up/down with an optional comment on every article, stored against the article *and its version* so that a content change can be evaluated. Reviewed weekly; a persistent negative ratio is a rewrite trigger and, if the article describes a refusal, a product-design signal.

**Search.** Client-side index over titles, bodies and a curated synonym table (udhaar→credit/receivable, khata→ledger/account, parchi→estimate/receipt, maal→stock/goods, hisaab→statement, baaki→balance, patti→settlement). Every query is logged with its result count; zero-result queries in the local language are the primary input to the content roadmap [R1 §D.2 search analytics].

**Media.** Screenshots and short GIFs kept under 1 MB each for low-bandwidth users [R1 §D.4]. Inventory and billing tasks are visual, but a 3 MB screenshot on a 2G connection is worse than no screenshot.

**Analytics.** Views, helpful ratio, search terms and article-to-support-contact deflection — event logging only, no dashboard product [R1 §D.4].

**White-label.** Help content is product content, not partner content, so it is shared across tenants; only the branding wrapper and the support contact differ per partner (WLB-02). A partner that wants its own articles is a Phase 3 conversation.

**Ownership.** The help tree is written alongside the FRDs, not after them. An MVP feature is not complete until the articles listed against its screens exist — which is why HLP-01 through HLP-03 are Phase 2 deliverables but the *content* is drafted during MVP development, when the person who built the screen still remembers why it refuses what it refuses.
