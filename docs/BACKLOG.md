# Backlog

Work deliberately deferred, with the reason and the condition that brings it back. This is
not a wish list — an item is here because a decision put it here, and each one names that
decision.

The standing constraint behind most of this: **the product runs locally for the owner's own
use first, with minimal third-party dependencies** (ADR-021). Anything needing a paid
provider, a registration with a lead time, or an account with an external service waits
until there is a second user.

---

## Deferred by DEC-010 — mobile OTP and SMS

| Item | State in the repo | Comes back when |
|---|---|---|
| **Mobile OTP sign-up and login** (`PLT-01`'s original flow) | Built, tested (37 tests, still running), retired behind `UB_AUTH_OTP_ENABLED=0`. `platform_otp_challenge` not dropped. | Flip the flag. Needs a real SMS provider to be useful. |
| **SMS adapters** | The `SmsBackend` Protocol and `ConsoleSmsBackend` exist; no provider backend. | A provider is chosen and `UB_SMS_BACKEND` points at it. |
| **DLT registration** (Indian telecom sender-ID and template registration) | Not started. Two-to-four-week lead time. | Before any SMS reaches a real merchant. **No longer on the critical path** — `DEC-005`'s Sprint 2 deadline was a consequence of OTP being the login path. |
| **Automated SMS reminders** (`LED-07`, `LED-08`) | Specified in full; not built. Sprint 5 scope. | DLT registration completes. Until then they would ship inert. |
| **Transactional SMS to parties** | Same. | Same. |

Mobile itself is **not** deferred: `platform_user.mobile` survives as an optional profile
field, parties carry numbers, and `UbPhoneInput` stays in the design system. Only *logging
in by phone* and *sending by phone* are deferred.

## Deferred by ADR-021 — anything needing a provider

| Item | Substitute now | Comes back when |
|---|---|---|
| **Email delivery** | `ConsoleEmailBackend` logs the reset link at `ub.notifications`. The `EmailBackend` Protocol is the seam. | A provider is configured via `UB_EMAIL_ADAPTER` — one `.env` line, no refactor. Then `CR-134`'s `check --deploy` gate should land with it. |
| **Email verification as a gate** | Plumbing is live; verification gates nothing. | `CR-132` registers an error code for "address not confirmed". |
| **WhatsApp Cloud API** (`LED-12`, `NTF-05`) | `wa.me` deep links at MVP. | Phase 2, and a Meta business account. |
| **Payment aggregator** (`PAY-06`) | Locally generated UPI QR and intent links, no aggregator. | Phase 2. |
| **Web push** (`NTF-04`) | Not built. Needs `cryptography` for RFC 8291 — `ADR-024`, still `Proposed`. | Phase 2 and that ADR. |
| **Sentry / OpenTelemetry / Prometheus** | Django structured logging; the drift job and `platform_job` are the operational surface. | Part 30 §30 names the six seams (S1–S6) and the evidence-based trigger for each. |
| **Object storage** | Local `MEDIA_ROOT` behind a storage API. | Part 29's scaling path, step 7. |
| **`openpyxl`** | In-house stdlib `zipfile`+XML reader/writer. | `ADR-023` is revisited, or the in-house writer proves inadequate. |
| **`ruff` / `mypy`** | Configured in `pyproject.toml` but uninstalled; `flake8` runs the expressible subset. | `CR-j` resolves the ADR-021 ↔ §26.14 contradiction. |

## Deferred by scope — specified, not yet built

Everything in Phase 2 and Phase 3 of Part 13, and the 73 MVP features Sprints 2–12 still
owe. The roadmap is the register for those; they are not repeated here.

Two worth naming because something already references them:

- **`UbOtpInput`** ships with no consumer, retained for the backlogged OTP flow. Its tests
  still run so it cannot rot.
- **`UbTabs`** has no feature consumer until Sprint 2's report filters.

## Not deferred, still open — these need a person, not a sprint

The five entries in `DECISIONS.md`. `DEC-001` and `DEC-003` have now defaulted; `DEC-002`
(document rendering) is due before Sprint 4; `DEC-004` (partner business development owner)
and `DEC-005` (compliance owner) have **no default** and will not resolve themselves.
`DEC-005`'s urgency dropped with DEC-010, but the appointment did not go away.

## Deferred by DEC-011 — renaming the infrastructure identifiers

The product was named **DigiKhaato** by `DEC-011`; the copy changed everywhere and the
identities did not. These still carry the retired working name and are deferred because
each one is a cutover rather than an edit.

| Item | State in the repo | Comes back when |
|---|---|---|
| **PostgreSQL database and role names** (`udhaarbook`, `udhaarbook_backup`) | Unchanged in `.env.example`, `docker-compose.yml`, `scripts/postgres-init/02-roles.sql` and CI. `tests/architecture/test_env_example.py` pins the password default. | A planned maintenance window exists. Renaming a database and a role is a dump-and-restore, not a rename. `CR-142`. |
| **Hostnames** (`app.udhaarbook.in` and the partner/staging wildcards) | Unchanged in Part 24, Part 29 and `nginx/conf.d/`. | DNS and Let's Encrypt certificates for the new apex are provisioned and the old apex redirects. `CR-142`. |
| **Deployment path** `/srv/udhaarbook` and the image names `udhaarbook-backend` / `udhaarbook-frontend` | Unchanged in Part 29's runbooks. | The same window as the database. Runbooks and the image tags move together or not at all. `CR-142`. |
| **The `UB_` / `ub.` / `Ub*` namespaces** | Unchanged and **not** deferred — `DEC-011` decided they stay permanently. | Never. They are namespaces, not product copy. |

## Deferred by DEC-012 — email delivery

The owner's decision, in their words: *"that email will do later once we start earning
from that platform."* Nothing about the invitation path is unfinished — `invite()`,
`accept_invitation`, the token hashing, the expiry and the accept screen are all built and
tested. What is missing is a provider.

| Item | State in the repo | Comes back when |
|---|---|---|
| **A real mail provider** | `UB_EMAIL_BACKEND` defaults to Django's console backend, so reset links and invitations are written to the log and nothing leaves the machine. The adapter seam in `services/messaging.py` is the only thing that changes. | The platform earns. Needs a provider account, a domain, and SPF/DKIM records — the deliverability work is the real cost, not the sending. |
| **Emailing an invitation** | `POST /invitations` returns `accept_url` for the owner to copy. The dialog says so plainly rather than implying a delivery. | Above. The flow is already built; only `_deliver_*` gains a caller. |
| **Emailing owner-issued credentials** | Not built, and should NOT be: a password in an inbox is worse than a password in a chat the owner controls. If email lands, the invitation link is the thing to send, not the password. | Probably never. Recorded so the question is not re-opened as an oversight. |

## PTY-01 — deferred with reasons (22 Sep 2026)

**The `max_parties` plan limit.** `docs/17-01` PTY-01 §21 asks for a 403
`plan_limit_reached` at the tenant's party ceiling, and PTY-01 does not
implement it. DEC-001 removed `max_parties` from `PlanLimit`'s enforceable
`LIMIT_KEYS` at MVP, so building the check would have contradicted a decision
already recorded. If DEC-001 is revisited, the check belongs in
`create_party()` and the invalidation map's `saveParty` entry gains
`stale: ['plan']` — the line is already there with a comment saying so.

**The `display_code` uniqueness race.** BR-10 says uniqueness is service-checked
with no DB constraint, and CCR-19's proposed partial unique index is not
accepted. Two concurrent creates can therefore both take one code. Not built
here because it needs the constraint decision first; PTY-01 does not check it at
all rather than half-checking it.

**FR-9's timing contradiction.** The FRD reads as though `post_opening_balance()`
runs inside `create_party()`. The sprint plan §32.6.4 and Part 33's
TSK-PTY-01-05 are explicit that Sprint 3 stores it unapplied and LED-02 posts
it. The code follows the sprint plan; the FRD's §4 should be annotated rather
than left to be resolved by whoever reads Part 33 next.

**Part 21 §21.3.3 has no column for the unapplied opening balance.** PTY-01 adds
three (`opening_balance_amount`, `_direction`, `_as_of`). The database chapter
should record them.

**The native date input's display format follows the BROWSER's locale, not the
app's.** `<input type="date">` renders 2026-04-01 as 04/01/2026 under an en-US
browser and 01/04/2026 under en-IN. On a merchant's own device these agree; in a
mixed setup they do not. The quick chips ("Year start", "Today") are unambiguous
and cover the common cases. Revisit only if a real user is confused by it — the
alternative is a hand-built calendar, which is several hundred lines whose
failure modes are all in the keyboard and screen-reader paths.

## Owner directive, 23 Sep 2026 — Django, PostgreSQL and the frontend stack only

The owner restated the constraint in its narrowest form: for the current scope the product
uses **Django, PostgreSQL and the frontend stack**, nothing else. Any feature that needs
another library or a service goes here; where a native mechanism does the job, the feature
is built on that instead. "Native" means a browser or OS capability reached from a button
click or a page load, never a scheduler, a queue or a provider.

| Feature | Built now, natively | Backlogged |
|---|---|---|
| **Payment reminders** (`LED-05`) | A button that opens `https://wa.me/<number>?text=…` or `sms:<number>?body=…` with the message pre-filled; the merchant presses send in their own app. The reminder row is recorded on the click. | Automated/scheduled sends (`LED-07`, `LED-08`), WhatsApp Cloud API, any SMS provider. |
| **"Who to chase today"** | Computed by a query when the dashboard or party list loads. | A nightly job that pre-computes it. |
| **Notifications** (`NTF-*`) | In-app list derived on page load and on window focus. | Web push (`NTF-04`), email and SMS delivery. |
| **PDF** (statements, invoices, bills) | `window.print()` over a print stylesheet; the browser's own "Save as PDF". Already in use for the LED-04 statement. This also answers `DEC-002` for MVP. | Server-side rendering (WeasyPrint or similar), emailed PDFs. |
| **Sharing a statement or invoice** | `navigator.share()` where the browser has it, falling back to the `wa.me` link and a copy-to-clipboard. | Hosted public share links with expiry (`UbShareSheet`'s link tab) until the share-link shape (C1) is decided. |
| **UPI collection** | `upi://pay?…` intent link on a button, which opens the payer's UPI app on a phone. | The QR image (needs a QR encoder — in-house only if the owner wants it written; no library), payment aggregator (`PAY-06`). |
| **Background work** (balance-drift check, large exports, report snapshots) | Run on a button click or as a Django management command; exports stay synchronous under a row cap (the statement CSV caps at 5,000). | Celery, Redis, cron workers, async export files. |
| **Barcode lookup** (inventory, later sprint) | Typed or pasted code; the browser `BarcodeDetector` API where present. | Any scanning library. |

The frontend packages already in `package.json` beyond the canon list (`@radix-ui/*`,
`cmdk`, `vaul`, `sonner`, `recharts`, `react-day-picker`, …) are peer dependencies of the
vendored `ml-uikit`, not choices made by feature code; feature code imports none of them
except through the design system. No new package is added for any row above.
