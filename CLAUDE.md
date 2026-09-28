# DigiKhaato — working notes for Claude

Read this before changing anything. It records decisions that have already been
made and paid for; re-litigating them costs a rewrite.

## What this is

A multi-tenant business-ledger and inventory SaaS for Indian small merchants —
parties, you-gave/you-got, running balances, stock, invoices. Runs locally for
one owner first and must stay extensible to a hosted, white-labelled product
without rework.

Django 5 + DRF on PostgreSQL 16, Next.js 16 + React 19 + TypeScript strict.
`backend/`, `frontend/`, specification in `docs/` (49 chapters, `docs/000-index.md`).

## Standing constraints — do not quietly break these

**Minimal third-party dependencies (ADR-021).** No Celery, no Redis: background
work is `platform_job` rows drained by a cron-driven `manage.py run_scheduler`
using `FOR UPDATE SKIP LOCKED`. No S3/MinIO (local `MEDIA_ROOT`), no
Sentry/OTel/Prometheus, client-side PDF via `window.print()`, adapter-only
messaging, local UPI QR. Anything else needs a new ADR. If a fix seems to need a
package, say so instead of adding one.

**Identity is email and password (DEC-010).** The mobile-OTP flow was removed.
Anything still mentioning OTP or SMS is stale documentation or backlogged work,
not a gap to fill. Do not build OTP.

**Nothing is emailed (DEC-012).** `UB_EMAIL_BACKEND` is the console backend and
no provider is being paid for until the platform earns. So an owner adds staff by
creating the account — the server mints a temporary password, returns it once,
and the owner sends it by hand, which is WhatsApp in practice. The invitation
token flow is kept, untouched, because it *is* the email flow the day email
lands. Do not write copy that implies a message was sent.

**The frontend follows BrandHub's Customer module exactly.** Redux Toolkit slices
with `createAsyncThunk`, React Hook Form, a central `useValidationSchemas()` Yup
hook, an `api/<x>Service.ts` layer, shared `utils/` and enums. **TanStack Query is
not used** — this overrides any earlier suggestion to the contrary. TanStack
*Table* inside the data grid is a different thing and is fine.

**No raw host elements in feature code.** No `h1`, `div`, `span` outside
`src/design-system/**` and `app/layout.tsx`; use design-system components.
`react/forbid-elements` enforces it. Central utils and enums, no duplication —
if you write something twice, extract it.

**Errors surface through the global snackbar**, mounted once in `AppProviders`,
never per page.

**Product name is DigiKhaato; the folder stays `ims-platform`** so the name can
change later without a repo move.

## How to work here

The owner asked for a specific loop, in these words: **review, build, look,
report** — design review *before* implementing, not screenshots afterwards. And
after each feature: **bring the stack up, test it like a tester, fix what you
find, then move on.** The step most often skipped is *look*: actually run it and
look at the result.

This has repeatedly paid off. Five separate defects shipped green tests because
nothing exercised the real path: `seed_all`, `seed_demo` and `seed_e2e` were
named by the Makefile and did not exist; `create_superadmin` likewise;
`/api/healthz` was probed by compose and had no route. Two more only appeared
when the two tiers ran together — every cross-origin request failed preflight
because `X-Request-Id` was not in `CORS_ALLOW_HEADERS`, and `/login` redirected
to itself unboundedly. **Verify before fixing**: much of `docs/review/` is
already closed, and re-fixing something is worse than not touching it.

`tests/architecture/test_operator_surface.py` now guards that class — it asserts
every `manage.py` command the Makefile, `bootstrap.sh` and the compose files name
actually exists.

## Running it

```bash
scripts/bootstrap.sh        # Docker: everything, first run creates .env
scripts/dev-backend.sh      # native: creates db, migrates, seeds, serves :8000
scripts/dev-frontend.sh     # native: serves :3000
```

`RUNNING.md` has the detail, including pgAdmin connection and what is not built.
There is no seeded merchant — sign up at `/signup`.

## Gates

```bash
cd backend  && python3 -m pytest -q          # 1121 passing
cd frontend && npm run type-check && npm run lint && npm test   # 1235 passing
cd frontend && npm run build && npm run bundle:check            # 229.2 KB gz baseline
cd frontend && npm run i18n:split && npm run i18n:check         # after any merge touching locales/

# The e2e harnesses run against a LIVE stack, which has to be served the way
# `output: standalone` requires — `next start` cannot serve this build and
# answers 500/text-plain for every chunk. Two scripts do it correctly:
./e2e/serve-api.sh && ./e2e/serve.sh
node e2e/journey.mjs && node e2e/security.mjs && node e2e/credentials.mjs \
  && node e2e/parties.mjs && node e2e/tags.mjs && node e2e/credit.mjs \
  && node e2e/ledger.mjs && node e2e/statement.mjs
```

238 checks across the eight: journey 72, security 10, credentials 17, parties 30,
tags 13, credit 18, ledger 54, statement 24.

`node e2e/tags.mjs --shots` additionally sweeps every screen the tags feature
touches at four widths, in each of its conditions, into `/tmp/e2e-shots/tags`.
That sweep is not decoration: it found five defects that every unit test
passed through — "Rename" rendering as the single letter "e" at 768 px, the
second chip on a phone card cut mid-glyph, three buttons crammed into a card's
trailing slot as "Delet", a bulk report reading "Tagged 0 parties" over an
empty box, and an initials disc labelling a tag as though it were a person.
An accessible name is the full string whatever the pixels do, so `getByRole`
cannot see any of them.

`node e2e/credit.mjs --shots` does the same for PTY-06's credit limits, into
`/tmp/e2e-shots/credit` — the list with and without each band, the khata bar in
all four states, and the edit form's already-crossed hint, at the same four
widths. It found three more of the same kind: Edit on the khata page dispatched
`openEdit` and rendered nothing because the drawer was never mounted there; the
already-crossed hint sat below the fold of the drawer's own scroll container,
so the screenshot captioned "already crossed" did not contain it; and
narrowing to "Near limit" made the whole credit chip group disappear, because
`over_limit` counts the FILTERED set and a near-limit list has nobody over —
taking away the pressed chip the merchant had just used. All three passed
every component test.

`node e2e/ledger.mjs --shots` does it for LED-01, into `/tmp/e2e-shots/ledger` —
a khata with entries, an empty one, a busy day paged through, a party in
advance, the drawer in both directions, filled, refused for validation and
refused by the credit limit, and the khata a moment after a save. Forty images.

It found four more, and one of them was not about this feature at all. The
drawer OPENED IN A RED STATE: "Enter an amount." under the field, in error red,
before the merchant had touched anything, on the screen they use most.
`MLDialog` moved focus to the first focusable element in the panel — the close
button — which overrode React's `autoFocus` on the amount, and the blur that
caused marked the field touched, so `mode: 'onTouched'` ran the resolver against
an empty value. The numeric keypad never came up either. **Four callers had
already written `autoFocus` inside a dialog and none of them had ever worked**:
this field, PTY-05's tag name, and the Cancel button in both archive dialogs,
which is there so a destructive confirmation opens on the safe choice. jsdom
does not reproduce it, because focus management there is not the browser's.

The other three: the khata header did not move after a save, because
`INVALIDATION.postEntry` declared a `patch` on `partyDetail` that no reducer
performed — a false `patch` is worse than no entry, as that file's own docstring
says, because the next reader stops looking for the refetch. The snackbar
printed "₹2800.00", ungrouped, which is the third time `formatInr`-versus-
`formatAmount` and a copy string that carries its own ₹ have met here. And every
entry without a note printed "You gave" twice, once as the row's title and once
as the amount's label.

LED-02 added three conditions to that sweep and it found three more, two of them
about WIDTH — which is the class of defect `innerText` cannot see and every
`getByRole` passes straight through. The khata's action row reached five buttons
and made the page **275 px wider than a 360 px phone**, with two actions painted
outside the viewport; they moved behind a ⋯ sheet, which is what LED-02 FR-3 had
asked for in the first place. Then the opening row read **"Opening… [Opening]"**
— a badge truncating the word it repeats — and the badge moved to the caption
line, which is empty on exactly that row.

Both now have a check that MEASURES rather than reads: `scrollWidth` against the
viewport for the page, and every text node against its own box, at all four
sizes. They are the generic form of the lesson this file keeps recording, so the
next control anybody adds to that header fails loudly instead of quietly running
off the screen.

**LED-03 added six more conditions to that sweep and the measuring check earned
its keep twice in one afternoon**, both times on a control that had just been
added. Putting a ⋯ in each timeline row's trailing slot took the width the row's
TITLE had been using: on a 360 px phone "Opening balance" became "Opening bala…",
and with corrections shown the note "Cement bags" was squeezed to a single
apostrophe-wide sliver between two badges and an amount. That is PTY-05's
"Rename" rendering as the letter **e**, one screen along and two features later,
and every unit test passed both times.

The fix is a rule rather than another special case: **the row's title owns its
line.** It wraps (`line-clamp-2`) instead of truncating, and every badge —
Corrected, Reversed, Reversal, Backdated, Opening — sits with the caption
underneath. LED-02 had moved one badge down there and written down why; LED-03
made it the rule, because the row can now carry three at once. A third finding
came from the same check: the correction's REASON, folded into the caption,
rendered as "Read the paper …" — so it has a wrapping line of its own, because a
caption is three terse tokens joined with "·" and a reason is prose.

Two defects the sweep found that measuring could not, and both were about WORDS
rather than pixels. A reversal row carries no note, so its title fell through to
the direction and the row read **"You got ₹500.00"** in the middle of a khata —
an entry the merchant has no memory of making, sitting under the date of the one
it undid. It is now titled by its REASON, which is the merchant's own sentence
and the only thing about that row worth reading. And "Reversed" was the label on
both halves of a pair: the row that was undone and the row that did the undoing
said the same word. The row that did it now says "Reversal".

The harness itself had a defect worth recording, because it is the kind that
makes a suite worthless rather than wrong. The staff-permission check reported
"13 menus" and looked like a permission leak; it was the harness. `ctx` is one
browser context shared by every check in the file, the owner had signed into it
pages earlier, and `signIn` ends by loading /parties and waiting for the grid —
which appears for the owner's still-valid session whether or not the staff login
worked. The staff checks now run in their own context and assert WHO is signed in
before asserting anything else. A check that cannot fail for the reason it names
is worse than no check.

`node e2e/statement.mjs --shots` sweeps LED-04 into `/tmp/e2e-shots/statement` —
the passbook, a paged book, a party in advance, a quiet period, the custom range,
corrections shown, the before-opening warning, the refused range, and the PRINT
SHEET at both states. Forty images, and the last two per size are captured with
`emulateMedia({ media: 'print' })`, which is the only way to photograph a
stylesheet jsdom never loads.

It found five defects in one screenshot, all on the page a customer reads:
a row's particulars printed the raw message id **`ledger.entry.type.manual_got`**,
because only two of the fourteen entry types had a label; the opening entry was
labelled **"You gave ₹2,300.00"** when nothing was given — the exact thing LED-02
fixed on the timeline, decided a second time here instead of reusing
`entryAmountView`; the running balance read **"Balance ₹2300.00"**, ungrouped,
which is the FIFTH time `formatInr`-versus-a-raw-string has met in this codebase;
**"Opening balance" appeared twice meaning two different figures** — the period's
carried-in total and LED-02's entry — so the period's is "Brought forward" now,
which is what a passbook calls it; and the header read **"Statement · Ramesh
Trad…"** on a phone, cutting the half that says which customer.

The first end-to-end run found a sixth before any of those: the statement was
declared `throttle_scope = "export"`, which is ten an hour. A statement is a
screen a merchant opens at a counter while a customer is arguing about a bill.
The EXPORT is the expensive act and it is a query parameter on the same URL, so
its budget is applied in the handler where the parameter can be seen.

Two operational notes that cost an hour each before they were written down:
a stale `next-server` from an earlier session holds port 3000 and serves the
OLD build (which looks exactly like a broken new one — `serve.sh` kills it),
and `register_ip` is a DB-backed budget of twenty per window that does NOT
clear on a server restart, so a burst of e2e runs starts answering 429.

All must stay green. `bundle-budgets.json` explains the shell's growth: every
feature slice `store.ts` registers statically ships to every route, including
the ones that render a paragraph of text. PTY-01's `partyForm` slice added
another 0.8 KB and PTY-05's `partyTag` added 1.6. **§19.3.9 is now overdue by
five features rather than approaching** — either the shell keeps growing with
every one, or the store admits lazily registered reducers, and ledger,
inventory, sales, purchases and reports are all still to come.

`e2e/parties.mjs` is new and is there for one reason: PTY-02's chip filters
passed every unit test while issuing no request at all. The warm-up's
`partyListRequestKey` named its fields and had never heard of `balance`, so a
filtered request hashed to the same key as the speculative page-1 one and was
"claimed" instead of sent. jsdom cannot see that — the unit tests prime no
warm-up — so the harness asserts the NETWORK, not the controls. A chip that
lights up is not a chip that filters.

Two route-chunk lessons from PTY-01, both worth knowing before the next form:
the party drawer is `dynamic()` (statically imported it cost /parties 39.8 KB
that every merchant opening the list to READ it would pay), and its field-name
constants live in a module that imports nothing, because importing them from
the file that also holds the Yup schema dragged Yup into the route for another
17 KB. Module-level imports tree-shake between modules, not within one.

## State

Sprint 1 is in, and Sprint 3 has started: **PTY-01 (create/edit a party) is
done** — `POST`/`PATCH /parties`, a form drawer, and the three design-system
components Sprint 1 deferred (`UbMoneyInput`, `UbDateInput`, `UbDrawer`, plus
`UbDisclosure`). Parties is no longer read-only.

The opening balance is **stored and unapplied**: PTY-01 records what a merchant
is carrying over from paper in three columns on `parties_party`, and posts no
ledger entry. Sprint 4's LED-02 consumes them. A test asserts the balance stays
0.00 — do not wire the two together early or every opening balance posts twice.

**PTY-02 is done**: `q`/type/balance/status/collection filters, `meta.totals`
over the filtered set, the three chips rows, tappable money tiles, and the
filtered-empty state that offers to add the party you just searched for.
`tag` is still PTY-05's — declaring it against tables that do not exist would
be a filter that 500s.

Three defects in that work were found by running it and not by any test, and
they rhyme: **the thing that was asserted was not the thing the merchant gets.**
The service read `meta.totals_receivable` flat, a shape the server has never
sent, and fell through to the honest page-sum fallback. `ix_party_tenant_activity`
was declared `-last_activity_at`, which is `DESC NULLS FIRST`, against a query
ordering `DESC NULLS LAST` — so the index the list depends on was unreachable
and page 1 was a sequential scan of the tenant. And DRF's `OrderingFilter`
REPLACES the ordering, so the selector's careful `nulls_last=True` applied only
to a request without `?ordering=`, which the client never makes: what a merchant
actually saw at the top of their book was the six people they have never traded
with. `StableOrderingFilter` now decides null placement too, on the rule that a
missing value never outranks a present one.

**PTY-03's first wave is in**: `/parties/[id]` exists, the list rows open it,
and it carries the header (avatar, badges, code, mobile with `tel:` and copy,
the balance with its as-of baseline and a credit block when a limit is set),
the info panel as a sticky rail on desktop and a collapsible on a phone, the
promise-date control, and the archived, not-found and error screens.

**What it deliberately does NOT have, and why.** The timeline, the running
balance, the five quick actions and the share sheet — every one of them is
about ledger entries, and `apps/ledger` has no models and no migrations. There
is no `ledger_entry` table, so there is nothing to list, nothing to total and
nothing to put in a statement. A "You gave" button that opens nothing teaches a
merchant the product is broken rather than unfinished. The same judgement runs
through the API: `GET /parties/{id}` omits `recent_entries` and four of the
seven `summary` figures FRD §14 lists, rather than sending `[]` and `"0.00"` —
a key that is always empty is a claim this code cannot verify, and the client
cannot tell it apart from a real zero. The transactions section shows its
first-use empty state, and that state is TRUE: no party in this product has a
transaction, for anybody. The second wave lands with LED-01.

Two defects found by looking rather than by any test. `UbAmount` took its
magnitude from `formatInr(value)`, and `formatInr` signs what it formats — so
the sign slot rendered nothing and the minus arrived anyway, inside the number:
"−₹282.90 · You will give", on the list and the khata page both, which is
§23.2.6 rule 3 broken in exactly the case the rule exists for. And `onRowOpen`
reached the grid's CARD rendering and stopped there, so a party was openable on
a phone and not on a laptop — the table's own docstring described the intended
design ("a control in the first cell") and nothing had implemented it.

**PTY-04 archive and restore is in.** `POST /parties/{id}/archive` and
`/restore`, plus `POST /parties/bulk-archive` for the yearly clean-up. Archive
is a status change and never a delete — `deleted_at` is untouched, because
deleting a party would destroy the ledger behind it and break the 72-month GST
retention rule at the same time.

The balance guard is the rule the feature exists for: a party with a non-zero
balance cannot be archived, with **no tolerance band** — ₹0.01 blocks it,
because "close enough to zero" is a threshold nobody can defend and it eats
exactly the residues a collection round is for. The 409 carries the balance and
its direction so the dialog can swap in place, and the check is the SERVER's:
the client never pre-judges from a balance it may be holding stale.

Archive lives on the khata page rather than on a list row menu, deliberately —
that is the screen showing the balance, the last entry and the contact details,
so a merchant filing somebody away is looking at the evidence while they decide.
A one-tap archive from a list row is a one-tap mistake. Bulk archive is on the
list's selection bar, which until now offered only "Clear selection"; the skip
set is computed by the database under `FOR UPDATE`, so an entry posted on
another device between the read and the write cannot archive somebody who owes
money.

**The write-off escape (FR-3) is in** as of 23 Sep 2026 — see Part 43 CR-135 and
`e2e/writeoff.mjs`. **Still deferred, with reasons**: cancelling scheduled reminders and revoking share
links (FR-7) need `ledger_reminder` and `parties_share_link`; the dialog's
consequence counts (FR-6) count rows in those same tables. None are stubbed — a
`cancelled_reminders: 0` would be a statement about this party's reminders made
by code that has never looked at one. The snackbar's 10-second Undo (FR-12)
needs an action descriptor on the global snackbar, which LED-01's entry-undo
will need too; it is better designed once with two callers than guessed at with
one, and Restore is the same operation one tap further away.

**PTY-05 tags is in**, end to end: `parties_tag` and the join, `/parties/tags`
CRUD with an idempotent create, merge and bulk assign, a `tag=` filter that ORs
within its group and ANDs against everything else, chips on list rows and the
khata page, a create-inline picker on the party form, the tag manager at
`/parties/tags`, and the party list's filters now living in the address bar.

Four things in it are worth knowing before touching them:

*The palette is TOKENS, not hex.* `viz-1`…`viz-8` are stored in `color`, which
`varchar(7)` fits with room to spare. A hex value cannot answer the question a
chip is asked on every render — which theme am I on — and `--viz-1` resolves
through `--primary-500`, which is redefined for dark mode. Migration 0007 moved
the values; a hex left over from before it is cleared rather than guessed at.

*The filter travels by NAME.* `?tag=Camp Area,Route 2` is a parameter a person
can read, edit and send to somebody, which is also why a comma in a tag name is
refused at the point of entry (EC-14) — "Camp, East" would round-trip as two
tags that do not exist. The server matches case-insensitively and folds
whitespace, because that parameter is the one place in the product a merchant
types a tag name by hand.

*Undo is built from what the server WROTE.* `bulk_tag` returns `changed` — the
pairs it actually created or deleted — and `updated_count` counts parties
changed rather than matched. An inverse built from the REQUEST removes the tag
from everybody who already had it, and a count of the selection reports
"Removed from 40 parties" when three lost anything.

*The list's filters are in the URL.* `usePartyListUrl` seeds from it once and
writes back on every change. It exists because the manager's "Camp Area · 34"
links to `/parties?tag=Camp Area` and that link was inert — the filters lived
only in Redux and were seeded from defaults on every mount.

**PTY-06, LED-01, LED-02 and LED-03 are in**, which means the ledger is now a
ledger: credit limits that refuse a write inside the transaction, entries with
a real `ledger_entry` table behind them, the opening balance PTY-01 had been
storing and not applying since Sprint 3, and — as of LED-03 — a way to be wrong
without being stuck.

**The one rule LED-03 exists to make liveable.** Canon §0.11 rule 1 says a
posted line is never edited and never deleted, enforced in the model and again
by a database trigger. That is right, and on its own it is a product nobody can
use: shopkeepers type 5000 for 500, write against the wrong customer, and record
the same ₹500 twice when the counter is busy. So a correction is two new rows
and one permitted change to the old one — mark the original `reversed`, write an
opposite entry that points back at it, and for a correction a replacement
carrying the new values and a `supersedes_id`. The mistake stays visible for
ever, which is the point rather than the cost.

Three things in it are worth knowing before touching them.

*The balance moves by the DIFFERENCE.* Everywhere else in the ledger a balance
moves by one entry's own amount; a correction moves it by `−signed(original) +
signed(replacement)`, which can be zero, negative or positive regardless of
either row's direction. `test_a_corrected_party_still_matches_a_full_replay`
proves the incremental path against `manage.py recalc_balances`, which re-derives
the figure from every row by a different route — the only honest way to know a
cache is right.

*The timeline hides the pair by default and the switch REFETCHES.* One typo must
not turn one line into three on the screen a merchant reads at the counter, so
`LIVE_ENTRIES` is what the list returns. "Show corrections" sends
`?include_reversed=true` rather than filtering what is held: filtering would be
wrong in the revealing direction, because those rows were never downloaded, and
wrong in the hiding direction too, because a page of fifty containing twenty
struck-through rows would show thirty and still claim there was more.

*Reversing and correcting need `ledger.entry.correct`, and that is a CODENAME
check* — unlike LED-01's credit-limit override, which is a role check and must
stay one. The distinction is the rule: a business ceiling the owner set is not
delegable, an ordinary capability is. A shop that wants its senior cashier to fix
typos should be able to say so; a shop must not be able to hand the counter the
power to lend past the cap by granting a permission. CR-124 records that Part 20
§20.5.5 does not say this and should.

**Deferred, with reasons**: the corrective SMS when a reversed entry had already
been texted (FR-9) belongs to LED-08, which owns the templates table; the deep
link from a document-sourced refusal (FR-6) has nothing to link to, because
SAL-05 does not exist — the 409 `use_document_void` and its `source_id` are in
place so the client changes and the server does not; attachments on a correction
(EC-5) need the `files` app, which has no table.

**LED-04 the statement is in**: `/parties/[id]/statement`, a running balance from
a SQL window function, an opening for any period, the corrections toggle, a CSV
export, and a print sheet that `window.print()` turns into the PDF a merchant
sends. It is the artefact the ledger has been building towards — the thing a
shopkeeper puts in front of a customer who disagrees.

*The running balance is computed and never stored*, which is the sentence
`ledger_entry.running_balance_after` has been carrying a NULL for since LED-01. A
running balance is a property of an ORDERING, not of a row: one backdated entry
invalidates every cached figure after it, silently, for ever.

*And the window has one trap, which cost a morning to find and is written into
the selector.* `.annotate(Window(...)).filter(keyset)` is the obvious
implementation and Django 5 does not wrap it in a subquery — the keyset goes into
the WHERE, the window is computed over what survives it, and page two restarts
from zero. Page ONE is correct, which is the page every unit test and every
screenshot looks at. So the window runs over the page and `carried_forward()`
adds what the merchant already scrolled past.

*The closing balance of an unbounded statement must equal `parties_party.balance`*
(BR-3), and that is the most valuable assertion in the feature: a cached column
moved one entry at a time and a window function replaying every row have to reach
the same number. A fuzzed twenty-five-entry book proves it in the unit suite and
the live stack proves it again.

**Deferred, and the reason is a decision rather than a table.** Share links, the
public `/d/<token>` page, the WhatsApp arm and the UPI QR — FR-6, FR-7, AC-3 and
AC-5 — all need `parties_share_link`, whose SHAPE is an open contradiction
between two chapters (Part 43 §43.4.6 C1, which says it "must be answered before
the first migration"). Inventing a narrow table to unblock this feature is the
exact trap that contradiction names. The QR additionally needs PAY-03's encoder,
blocked on its own ADR contradiction, and a `tenant.upi_vpa` PLT-07 would
collect. Document links (FR-4, FR-9) have no documents: every entry in the
product is `source_type='manual'`, so `source` is `null` and the KEY is in the
shape so the day a document posts a ledger line is a resolver rather than a
breaking change.

Still to come in Sprint 3: nothing. Inventory, sales and purchases are
skeletons; `seed_demo_tenant` is a stub; there is no mobile navigation below
`lg` (`UbBottomNav` is unbuilt).

One thing measured and deliberately NOT changed, because it is the owner's
call: on a 360×780 phone the first list row starts at y=658 — the header and
the three stat cards take the whole viewport, so a merchant opening Customers
sees no customer without scrolling. The stat-card layout is what the owner
asked for two waves ago; dropping the count tile to a caption below `md` would
recover about 120px and put two rows above the fold.

**The specification on disk and the specification in the project have diverged,
and the direction matters.** `docs/` here is the 49-chapter SSOT and is fine to
READ — the FRDs have not changed. But Part 43, the change-request register, is
maintained in the attached Claude project, and the copies under `docs/`,
`/tmp/clean/docs/`, `~/udhaarbook-ssot/docs/` and `/mnt/attach/outputs/ssot/docs/`
are all several revisions behind: they still name CR-118 as the next free id and
carry none of CR-119 through CR-128. Syncing a local copy INTO the project would
silently delete ten change requests, including the C6 contradiction LED-03
raised. Read Part 43 through `project_read` and write it through `project_write`;
the same goes for `STATUS-sprint3.md`.

`docs/review/01`–`04` are audit findings with their status. `docs/DECISIONS.md`,
`docs/BACKLOG.md` and `docs/CR-LOG.md` carry decisions, deferred work and change
requests. `STATUS.md` is the running summary.

**§19.3.9 is the decision that now needs making.** It has three data points and
they are a line, not a coincidence: `partyForm` cost 0.8 KB on the app shell,
`partyDetail` cost another 0.8, and PTY-04's thunks a further 0.7 through the
slice that imports them — each measured directly, by removing the import and
rebuilding. Every feature slice `store.ts` registers statically ships to every
route. (The invalidation REGISTRY was the other suspect and is not guilty:
removing the archive thunks from it changes the shell by nothing.) `/legal/terms` downloads three party slices to
render a paragraph of text. PTY-04, PTY-05 and PTY-06 are next, and ledger,
inventory, sales, purchases, payments, expenses and reports are all still to
come: on this rate, roughly another 5-8 KB on every route, paid by every
merchant who opens the login screen. Either the shell keeps growing or the
store admits lazily registered reducers.

LED-03 is the first feature to route AROUND that decision rather than add to it:
its correction state went into `ledgerFormSlice`, which `store.ts` already
registers, so the feature adds no store key at all. The shell still moved 0.5 KB
— the slice grew and two thunks joined the invalidation registry — which is the
honest floor for that design. §19.3.9 is now overdue by six features.

The bigger number LED-03 produced is the one the gate refused. Imported
statically, the correction drawer and the reverse dialog put React Hook Form's
resolver, the ledger Yup schema and six controls into the route chunk of
`/parties/[id]` — **+58.6 KB**, on the read screen of this product, paid by every
merchant who opens a khata to look at a balance. Both are `dynamic()` now and the
cost fell to 1.8 KB. That is the third measurement of the same finding here (the
party form drawer on /parties, LED-01's entry drawer, now these two), and the
rule it keeps writing is: a form belongs in the chunk that OPENS it, not in the
chunk that renders the screen it opens from. `EntryActionsMenu` is deliberately
not lazy — it is a dialog with two buttons and it is what the merchant taps
first, and a ⋯ that waits for a chunk is worse than the bytes.

**Decided on 23 Sep 2026, the owner having delegated the calls (Part 43
CR-129–CR-134):** §19.3.9 — route-local slices are injected lazily with
`combineSlices().inject()`; the phone fold — the count tile is dropped below
`md`; C1 — `parties_share_link` is the generalised table; C6 — both reversal
dating rules stand, discriminated by `source_type`. DEC-004/DEC-005 stay with
the founder until someone is named. The visual language is BrandHub's
(`docs/DESIGN-SYSTEM.md` — read it before adding UI). Still open: DEC-002
(document rendering). The
`NULLS LAST` ordering that used to be listed here was never actually open —
FR-7 says it and BR-6 repeats it — and it is now implemented in the index, the
selector and the ordering filter alike, with `tests/performance/test_party_list_plans.py`
reading `EXPLAIN` so that an index nobody can use fails the build instead of
passing it.

## Conventions

Commit messages explain *why*, in prose, not bullet lists — they are the main
handover between sessions. Tests get docstrings saying what defect they prevent.
A fix without a test that fails before it is not finished.
