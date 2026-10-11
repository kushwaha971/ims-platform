# YourKhata — product, mobile and architecture review (12 Oct 2026)

Asked for by the owner: rethink the first-use experience, empty states, the
Lending and Library dashboards, mobile navigation, theme, mobile data screens
and wording — as a product team would before a release — and say what else is
wrong.

**How this was done.** Three read-only reviewers traced the code in parallel
(lending data model; mobile navigation and theme; all 5,860 strings), and a
fresh shop, library and lender were signed up on a 360 px phone on the test
stack and every first screen photographed. Findings below carry the file they
came from. Where something was fixed in the same pass it says **Fixed**.

Priority: **P0** a user is blocked, misled about money, or data could be wrong ·
**P1** a main journey is confusing · **P2** polish.

---

## 1. Current-state audit

### 1.1 First login and the dashboards

What a new user sees today (test stack, 360 px, after the 4-step setup):

| App | First screen | Verdict |
| --- | --- | --- |
| Shop | A "Get your book started" checklist (add a customer, an item, a bill, your UPI ID), then three cards that are empty: Recent activity, Who has to give you the most, Running low. Buttons above it: New bill, New purchase, **Send reminders**. | The checklist is right. The three empty cards and "Send reminders" (to nobody) are noise on day one. **P1** |
| Library | "Get Library ready" (fee plans ✓, lay out seats, enrol first student), two zero tiles (Fee unpaid 0, Collected ₹0.00), four shortcuts, "Seats by shift" asking for desks. | Good. The zero tiles are honest but say nothing; `library.home.allPaid` ("Everyone has paid") shows for a library with no students. **P1** |
| Lending | "Get Lending ready" whose FIRST step is "Make the routes your agents walk", a strip of four zeros (To collect today ₹0.00 …), then "Nothing to collect today". | The first step is the wrong one and in jargon: a lender's first act is giving a loan. Zero strip before any loan. **P1** |

Note: the owner's screenshots (dark theme, business "Gedf") look like the
**deployed** site, which is older than `dev` — it predates the checklists. Much
of "the dashboard looks incomplete" is fixed by deploying. See §6.

Other first-use findings:

- Lists show their search box, filters and sort control when there is nothing to
  search (Customers, Suppliers, Students, Loans). On a phone that is half the
  screen above an empty box. **P1**
- Team shows the owner as **"+9"** — the avatar takes the first two characters
  of a mobile number when the person has no name. **P2**
- A user who chose only Library or only Lending lands on that app's screen
  (DEC-016, verified). Consistent.

### 1.2 Empty states

The design system has three variants (`UbEmptyState`: first use, filtered,
error) and loading is a separate skeleton, so the four situations ARE
distinguishable. The gaps are in how screens use them:

| Screen | Before | State |
| --- | --- | --- |
| Loans | "No loans here" — title only, no action, same text for "none yet" and "none match" | **Fixed**: first use explains and offers New loan; a search or filter says "No loans match" |
| Borrowers | "A borrower is added with their first loan." — no action | **Fixed**: says what to do, offers New loan |
| Lending Today | explains, no action for a first-timer | **Fixed** (copy); needs the first-use variant when there are no loans at all — P1 |
| Bills | "Create your first bill." | **Fixed** (says why) |
| Library home | "Everyone has paid" with no students | Open — P1 |
| "Some data, not enough for charts" | Shop dashboard shows empty chart cards | Open — P1: hide a card until it has something |
| "Records, but nothing recent" | not distinguished anywhere | Open — P2 |

No fake analytics or sample data are shown anywhere. Keep it that way.

### 1.3 Lending: one borrower, several loans

**Verdict: the money is right; the person was missing.**

Traced, with file references (`backend/apps/lending/`):

- **Borrower and loan are separate entities.** `LendingBorrower` is one row per
  person; `LendingLoan.borrower` is a foreign key (`models.py:56, 82`). Nothing
  — no constraint, no service rule — refuses a second loan.
- **Every money path is per loan.** A collection has a loan FK and is posted to
  `/lending/loans/<id>/collections`; allocation runs over that loan's schedule
  only, oldest instalment first (`services/collections.py:149`); an amount above
  what the loan has left is refused, never spilled onto another loan.
- **Interest and schedule are per loan**, computed at creation and frozen.
- **Today's round is one row per loan**, each collected separately.
- **Closing, write-off, cancel, late fee, waiver** are per loan.

What was wrong:

| # | Finding | Pri | State |
| --- | --- | --- | --- |
| L1 | **Not one test gave a borrower two loans.** Every fixture made a new person per loan; one test asserted "the one loan is all the khata carries". | P0 | **Fixed**: `tests/test_many_loans_one_borrower.py`, 9 tests, three loans with different amounts and dates — payment on one never moves another, over-payment is refused, closing one leaves the others, the day's round has a row each, tenant boundary holds |
| L2 | **No borrower-level view.** The Borrowers list was a name and a phone; a tap opened the shop's khata page, which knows nothing of loans. No totals, no list of a person's loans. | P0 | **Fixed**: `GET /lending/borrowers` and `/borrowers/<id>` return loans, running, given, collected, left, late (three queries for any page size). The list shows them; a tap opens **that person's loans** with the totals above |
| L3 | The party's loan balance and khata statement **mix all loans**; ledger lines carry no loan id. Per-loan truth is in the dues, and the two are different quantities (the balance has interest fallen due; "left" includes future interest). | P1 | Open. Recommended: a per-loan statement from the dues (already printable per loan), and label the khata figure "All loans" |
| L4 | A payment made from the generic **Payments** screen can settle loan instalments without creating a collection row, so "collected today" and the cancel guard would be wrong. Not confirmed reachable in the UI. | P1 | Open — verify, then block or mirror |
| L5 | **One cash handover for two loans** needs two entries. | P1 | Open. Recommended: "Collect from Geeta" that splits one amount across her loans, shows the split before saving, and records one collection per loan |
| L6 | New-loan form: picking an existing borrower shows nothing about their current loans; a repeat customer typed as "new" without a mobile becomes a second person. | P1 | Open |
| L7 | No top-up, reschedule, early-settlement rebate or manual close. Written-off and cancelled loans are only under "All". | P2 | Open |
| L8 | Collections have no database-level duplicate guard (the idempotency key is sent by the app but optional on the server); a double-tapped visit makes two rows. | P1 | Open |
| L9 | Reminders are per loan: two loans due = two messages a day to one person. | P2 | Open |

### 1.4 Mobile bottom navigation

**Cause:** `mobileNav.ts` showed the bar only when the path was *exactly* one of
the menu's rows. "Not a row" stood in for "a detail screen with its own docked
actions", which also hid the bar on every report, every settings page, the tag
manager, a loan, a student, an item, a bill, `/switch`.

**Fixed.** The exceptions are named, and tested: a form (a path ending in
`/new` or `/edit`) and a khata (`/parties/<id>`, which docks You gave / You
got). Everywhere else the bar stays, with the right tab lit; the header shows
Back on anything deeper than a menu row. Checked on a phone: `/settings/devices`,
a loan, a borrower's loans → bar present; `/lending/loans/new` → hidden.

Still open:

- Back uses browser history, so a user who arrived from outside can be taken out
  of the app. **P1**
- Detail screens have no title in the header bar. **P2**
- No handling of the on-screen keyboard for the fixed bar; needs a real-device
  check. **P2**
- A toast can cover a sticky action bar stacked on the nav (`/library/settings`). **P2**

Safe-area inset, sticky-bar offset and print are already handled correctly.

### 1.5 Theme

**Cause:** there was no theme control anywhere inside the signed-in app, on any
screen size. The only one was on the public landing page. A comment said it
"still lives in settings"; it never had.

**Fixed.** Light / Dark on the phone's More page and in the desktop account
menu. The choice persists (cookie) and is applied before paint; verified across
a reload. "Follow the phone's setting" is deliberately not offered (bright shop
counters; light is the default) — say if you want it.

Still open: the sign-in and setup screens have no language or theme control. **P2**

### 1.6 Mobile data screens

Better than feared, with real gaps:

- Customers, Suppliers, Items, Bills, Students, Loans, Borrowers already render
  as **cards on a phone**, not squeezed tables (the owner's screenshots show
  them). The complaint fits the *reports* and a few registers.
- **Open, P1:** Day book, Sales register, Purchase register, GST summary, Profit,
  Old dues are wide tables. Each needs a decision, not a blanket rule:
  day book → a list of entries grouped by day; registers → a card per bill with
  total and tax, full table behind "Open as table"; GST summary → keep tabular
  (it is a comparison), but freeze the first column.
- **Open, P1:** list cards show secondary facts at the same weight as the one
  that matters. The lending card is now the model: name, what is left, late or
  not, one line of detail.
- Filters sit in a row above lists; on a phone they should be one "Filters"
  button opening a sheet (the pattern exists: `UbFilterSelect` opens a sheet).

### 1.7 Wording

All 5,860 strings were read. The headline is not the word "owes" (63 uses) but
that the two ideas a khata exists for were each said **five or six ways**:

| Idea | Was said as |
| --- | --- |
| Customer must give me | You will get · To collect · Owes me · They owe me · Due · Receivable |
| I must give | You will give · To pay · I owe them · Payable |

**Fixed in this pass (about 75 strings):**

- One pair for balances everywhere: **You will get / You will give**
  (आपको मिलने हैं / आपको देने हैं). "Who owes most" → "Who has to give you the
  most". Filters, home tiles, the archive dialog.
- The phone tab said **Parties** and opened a page titled **Customers** → Customers.
- "Aging" → "Old dues". "Due today" → "To collect today". "Loan outstanding" → "Loan left".
- Errors no longer mention servers, requests, sessions, fields: "No internet.
  Check it and try again."
- Hindi: one word for business (व्यापार, was also कारोबार and बिज़नेस) and one for
  what is left (बाकी, was also बकाया); ऋण → कर्ज़; देय → बाकी.

**Open, needs the owner's ear (P1):**

- `payments.receipt.youWillGive` — on a customer's receipt "You will give" means
  the customer pays; inside the app the same words mean the shop pays. **P0 to
  decide.**
- Void (90 strings) → "Cancelled"? Write-off / बट्टे खाते → "Lost money / डूबा पैसा"?
  Credit note / Debit note → "Sales return / Purchase return"? These change
  words people may already know from an accountant; choose once.
- Students vs members (library), three Hindi names for borrower, Dashboard vs
  Home vs Today for the first screen.
- "Credit" means five different things across modules.
- `auth.password.reset.sentWhere` is a developer note shown to users. Remove.

---

## 2. Competitor research

Public pages and guides only; none of these products was installed and used
here, so treat specifics as reported, not observed.

| Product | What it does that matters here | Use |
| --- | --- | --- |
| OkCredit / Khatabook | Sign-up is a phone number and nothing else. After adding a customer you get two buttons — *given* and *received* — and a running balance per customer. Adding a customer offers the phone's contact list. OkCredit **removed** a third option (returns) because it did not apply to every kind of merchant. | Two words for two directions, everywhere. Import contacts when adding a customer (not built). Fewer options beats more. |
| Margill, LendFoundry (loan servicing) | The borrower is the parent record with loans underneath; reviewers single out "multiple loans under one client". A portfolio view with drill-down to one customer's repayment history. Payment allocation is rule-based and recorded. | Exactly the gap closed in §1.3 L2. For L5: record how a payment was split so it can be audited and undone. |
| Odoo | Asks which app you want before anything else. | Already done (DEC-016). |
| Material Design / Android guidance | Bottom navigation is for top-level destinations and stays on pages that belong to a section; hide it on focused tasks that have their own bottom actions; never rely on it for Back. | The rule now in `mobileNav.ts`. |

Where they are weak, and YourKhata can be better: khata apps are one product and
cannot run a library or a loan book; loan-servicing tools are desktop software
priced for finance companies and assume accounting vocabulary. A phone-first
loan book in plain Hindi and English is not something either group offers.

Sources: [OkCredit — how to use](https://okcredit.in/blog/how-to-use-okcredit-application-and-its-benefits),
[YourStory — OkCredit product roadmap](https://yourstory.com/2021/03/product-roadmap-fintech-startup-okcredit-800-million-transactions/amp),
[Khatabook demo (Guideflow)](https://www.guideflow.com/demo-showcase/khatabook),
[Margill Loan Manager reviews](https://www.softwareadvice.com/loan-servicing/margill-loan-manager-profile/),
[LendFoundry](https://lendfoundry.com/?p=7987),
[Android — responsive navigation](https://developer.android.com/develop/ui/views/layout/build-responsive-navigation),
[Material components — bottom navigation](https://github.com/material-components/material-components-ios/blob/c8b8acabf8c78b9e266c33803848e9e67967fe73/components/BottomNavigation/docs/README.md).

---

## 3. Gap analysis — things not on the owner's list

| # | Gap | Pri |
| --- | --- | --- |
| G1 | **The live site is older than `dev`.** It lacks the first-use checklists, the app choice at sign-up, and everything in this document. | P0 |
| G2 | The sign-in screen's wording and code length are chosen at **build time** (`NEXT_PUBLIC_OTP_PROVIDER`) while the server chooses the provider at **run time** (`UB_OTP_PROVIDER`). If they disagree the screen asks for 6 digits and the server sends 4: nobody can sign in. Found when the test build did exactly that. The server should tell the screen the length. | P0 |
| G3 | Adding a customer does not offer the phone's contacts; a shop with 50 customers types 50. | P1 |
| G4 | No "Collect" from a borrower across loans (L5). | P1 |
| G5 | Staff see "+9" avatars and mobile numbers as names until the owner types one. | P2 |
| G6 | Slow or dropped network: writes are refused offline rather than queued (by design for money). The message is now plain; a visible "saved" tick after a retry would build trust. | P2 |
| G7 | Reports on a phone (§1.6). | P1 |
| G8 | Per-module subscriptions: reviewed in `docs/MODULE-SUBSCRIPTIONS.md`, nothing built. | — |
| G9 | Accessibility: touch targets are 44 px and contrast is checked in CI; not yet checked: screen-reader order of the phone sheets, and Hindi line-height in dense cards. | P2 |

---

## 4. UX proposal, screen by screen

**Shop home (phone and desktop).** Day one: the checklist only, with one primary
button ("Add your first customer"). Each of the three cards appears when it has
one row. "Send reminders" appears when somebody has a balance. After the
checklist is done it collapses to a line.

**Lending Today.** No loans at all: a first-use panel — what this screen will
show, one button "Give your first loan" — and no zero strip. Checklist order:
give a loan → add a route (only if you have collectors) → add collectors.
Routes described as "the areas your collectors visit".

**Library home.** No students: first-use panel with "Admit your first student";
tiles appear with the first student.

**Lists (all apps).** With no records: title, one sentence, one button — no
search, no filters. With records: search always; filters behind one button on a
phone.

**Borrower (done).** Borrowers list: name, what is left across loans, "Late" if
any, "3 loans · 2 running". Tap → that person's loans with given / collected /
left / late above. Next: a "Collect" button there (L5) and "New loan for Geeta".

**Reports (phone).** Per §1.6.

**Desktop** keeps its tables; these are phone changes unless stated.

---

## 5. Prioritised plan

**Done in this pass (on `dev`, not pushed):** bottom nav on nested pages; theme
switch; ~75 wording fixes; lending borrower totals and per-borrower loan list;
9 multi-loan tests; four empty states.

**Next, in order:**

1. **P0** Deploy `dev` (G1) — after you have looked at it.
2. **P0** Server tells the sign-in screen the code length (G2).
3. **P0** Decide the receipt wording (§1.7) and the Void / Write-off / Credit-note words.
4. **P1** First-use panels for Lending Today and Library home; hide empty dashboard cards; reorder the lending checklist.
5. **P1** Lists: no search or filters when empty; filters in a sheet on phones.
6. **P1** Lending: collect across a borrower's loans (L5); show existing loans in the new-loan picker (L6); verify the Payments bypass (L4); duplicate guard on collections (L8).
7. **P1** Reports on a phone.
8. **P1** Back never leaves the app.
9. **P2** The rest of §1 and §3.

Items 3 needs your decision; the others I can start on your word.

---

## 6. Testing strategy

| Change | Acceptance | Edge cases | Where |
| --- | --- | --- | --- |
| Multi-loan (done) | Three loans, different terms; pay one, others unchanged; totals equal the loans added by hand | over-payment refused; closed loan stops counting as "left"; another business cannot read the borrower | `test_many_loans_one_borrower.py` |
| Bottom nav (done) | Bar on reports, settings, a loan, a bill, a student; hidden on `/new`, `/edit`, a khata | `/parties/tags` is not a khata; staff without Settings | `mobileNav.test.ts`; phone run |
| Theme (done) | Choice survives reload, applies before paint | signed-out pages | phone run; add a component test — open |
| Wording (done) | No "owes" on main screens; one phrase pair | Hindi direction guard `hindiDirection.test.ts` | 3,669 frontend tests pass |
| First-use panels | New business sees one action, no zero tiles; panel goes when the first record exists | records exist but all archived; search returns nothing; load fails (three different states) | component tests + a 360 px sweep per app |
| Collect across loans | The split is shown before saving and equals the amount; one collection row per loan | amount above the total left; one loan closed by it; replay with the same key | backend Tier 1 + phone run |
| OTP length from server | Screen shows the server's length whatever the build says | provider changed without a rebuild | backend + component |

Every UI change is checked at 360, 390, 768 and 1280 px by measuring (page width
against the screen, text against its box), not only by reading.

**Not re-run in this pass:** the `CLAUDE.md` browser suites (they restart the
servers on :3000 and :8000, which were in use), and the whole backend suite
(lending, architecture and query-budget tests were run and pass).
