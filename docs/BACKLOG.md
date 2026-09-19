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
