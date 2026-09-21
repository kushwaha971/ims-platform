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
