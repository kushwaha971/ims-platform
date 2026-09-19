# Part 27 — Security Standards

> **Status:** normative. Every control here is a build requirement, not a recommendation. A feature that lacks its security controls is not complete (canon §0.11 rule 6).
>
> **Scope:** the DigiKhaato backend and the surfaces it exposes — the REST API under `/api/v1/`, the public token-scoped share links, the media store on local disk, the PostgreSQL database, the `platform_job` runner, and the SMS/WhatsApp adapters. Frontend-specific controls are cross-referenced where the backend depends on them.
>
> **Constraint context:** MVP runs as docker-compose (`db`, `backend`, `scheduler`, `frontend`) on a single VPS with no Redis, no object store, no Sentry, no WAF and no SIEM (ADR-012, ADR-013, ADR-018, ADR-019). Every control below is achievable with Django, PostgreSQL and discipline. Controls that genuinely require Phase-2 infrastructure are marked **[P2]** and carry an interim mitigation.

---

## 27.1 Threat model

### 27.1.1 Assets, ranked by what their loss would cost

| # | Asset | Where it lives | Why it matters |
|---|---|---|---|
| A1 | **The ledger** — every party's balance and its history | `ledger_entry`, `parties_party.balance` | This is the product. A corrupted or leaked ledger ends the business relationship and, for the merchant, the business. |
| A2 | **Tenant isolation itself** | Application scoping (Part 20 §20.4) | One cross-tenant leak is existential; shared-schema multi-tenancy makes it a one-line mistake away. |
| A3 | **Party PII** — names, mobile numbers, addresses, GSTIN | `parties_party`, document snapshots | DPDP Act 2023 personal data belonging to the merchant's customers, held by the merchant with DigiKhaato as processor. |
| A4 | **Authentication material** | `platform_user.password_hash`, `platform_otp_challenge.code_hash`, `platform_session.token_hash`, JWT signing key | Account takeover gives A1 and A3 at once. |
| A5 | **Tax documents** | `sales_document`, `purchases_document` and lines | Statutory records; GST requires 72-month retention and their integrity is legally material. |
| A6 | **Share-link tokens** | `sales_document.public_token_hash`, `parties_share_link.token_hash` | A guessable token exposes a customer's statement to anyone. |
| A7 | **Merchant business intelligence** | Cost prices, margins, supplier terms, customer lists | Competitive harm; a party list is also a marketing list worth stealing. |
| A8 | **Availability** | The single VPS | A shop that cannot record udhaar at the counter stops using the product that day. |
| A9 | **Audit trail** | `platform_audit_log` | The only record of who did what; its integrity is what makes every other control provable. |
| A10 | **Media** | `MEDIA_ROOT` bill photos, logos, signatures | Bill photos contain PII and, in disputes, are evidence. |

### 27.1.2 Actors

| Actor | Trust | Capability |
|---|---|---|
| Unauthenticated internet | none | Reaches `/auth/*`, `/system/health`, `/api/v1/public/*`, and the frontend |
| Legitimate merchant owner | high, scoped to their tenant | Everything within their tenant |
| Merchant staff | medium, scoped | Write ledger, invoices, payments; no void, no correct, no financial reports |
| Merchant accountant | read-only, scoped | Read and export everything in the tenant |
| Departed staff | **hostile, previously trusted** | Holds a valid refresh token until revoked; knows party names and the URL structure |
| The merchant's customer (party) | untrusted, holds a share link | Reads one document or statement |
| Partner (white-label reseller) staff | medium, scoped to their tenants **[P2]** | Not implemented at MVP beyond branding; partner admin UI is P2 |
| Metis Labs super admin | high, audited | Impersonation (read-only, consented), platform tables |
| Metis Labs engineer with VPS shell | total | Database and disk access; bounded only by process, not by code |
| Automated scanner / credential stuffer | hostile | Mass OTP and login attempts, enumeration, known-CVE probes |
| Malicious tenant | authenticated, hostile | Deliberately probes for cross-tenant access, IDOR, injection, resource exhaustion |

### 27.1.3 Trust boundaries

```
 ┌──────────────── Internet (untrusted) ───────────────────────────────────────┐
 │  browser / PWA          scanner            party with a share link          │
 └───────┬─────────────────────┬───────────────────────┬───────────────────────┘
         │ TLS                 │ TLS                   │ TLS
 ════════╪═════════════════════╪═══════════════════════╪══════ B1: TLS / reverse proxy
 ┌───────▼─────────────────────▼───────────────────────▼───────────────────────┐
 │ nginx (TLS termination, static, X-Accel-Redirect for media)                 │
 └───────┬─────────────────────────────────────────────────────────────────────┘
 ════════╪══════════════════════════════════════════════ B2: authentication
 ┌───────▼──────────────────────────────┐   ┌──────────────────────────────────┐
 │ backend (gunicorn, Django)           │   │ scheduler (run_scheduler)        │
 │  AuthN → tenant resolution → AuthZ   │   │  system Ctx, no HTTP surface     │
 └───────┬──────────────────────────────┘   └───────┬──────────────────────────┘
 ════════╪═══════════════════════════════════════════╪══ B3: tenant scoping (application)
 ┌───────▼───────────────────────────────────────────▼──────────────────────────┐
 │ PostgreSQL 16 (private compose network, never published)  │  MEDIA_ROOT disk  │
 └──────────────────────────────────────────────────────────────────────────────┘
 ════════════════════════════════════════════════════════ B4: outbound adapters
             SMS (console at MVP) · WhatsApp (wa.me URL, no call) · none else
```

**B3 is the weak boundary and the one that gets the most engineering.** It is enforced in application code only at MVP; PostgreSQL RLS is the Phase-2 defence in depth (Part 21 §21.1).

### 27.1.4 The top fifteen threats

Likelihood and impact are `L/M/H`. Risk is the informal product.

| # | Threat | Vector | L | I | Mitigation | Verified by |
|---|---|---|---|---|---|---|
| T1 | **Cross-tenant data access** | A view forgets `.for_tenant()`; a related field accepts a foreign id; a raw query omits the filter | M | **H** | `TenantScopedViewSet` default; `TenantPrimaryKeyRelatedField`; 404 not 403; no auto-scoping magic; RLS **[P2]** | §27.3 tests, exhaustive route coverage test |
| T2 | **IDOR via a guessable identifier** | Sequential ids in URLs | L | H | UUID v7 primary keys everywhere (ADR-009); no integer ids on the wire | Schema review; a test asserts no `AutoField` pk exists |
| T3 | **Account takeover via OTP brute force** | 10⁶ code space, unlimited attempts | M | **H** | 6 digits, 5-minute TTL, 5 attempts then burn, 5/mobile/10 min, 20/IP/hour, constant-time compare, peppered hash | §27.4.1 tests |
| T4 | **Account takeover via credential stuffing** | Reused merchant passwords | M | H | Generic `invalid_credentials`, per-mobile and per-IP throttles, progressive lockout, PBKDF2, breach-list check on password set | §27.4.2 |
| T5 | **Stolen refresh token replayed** | Shared device, XSS, device theft | M | H | Rotation on every refresh; reuse detection revokes the whole family; httpOnly cookies; 30-day cap | §27.4.4 |
| T6 | **Privilege escalation within a tenant** | Staff performs an owner action; unmapped `@action` defaults open | M | H | `HasPermission` denies unmapped actions; permissions re-read from the database each request; `ver` claim invalidates on role change | §27.5 role matrix tests |
| T7 | **Share-link enumeration or leakage** | Short token, token in the URL sent over WhatsApp, referrer leak | M | M | 256-bit token, hash-at-rest, expiry, revocation, identical 404s, `Referrer-Policy: same-origin`, throttled, no PII in the URL | §27.12 |
| T8 | **Stored XSS via merchant-supplied content** | Party name, item name, note, terms rendered in a public share page | M | M | React escaping by default; no `dangerouslySetInnerHTML`; SVG uploads refused; CSP on public pages; server never renders HTML from user data | §27.6.4 |
| T9 | **SQL injection** | Raw SQL with interpolation in a report | L | **H** | ORM only; raw SQL requires the §27.6.2 process and parameter binding; a lint test greps for f-string SQL | §27.6.2 |
| T10 | **Malicious file upload** | Polyglot image, SVG with script, zip bomb, path traversal via filename | M | M | Magic-byte verification, re-encode through Pillow, UUID filenames, no SVG, size and pixel caps, EXIF stripped, served with `Content-Disposition` and `nosniff` | §27.6.3 |
| T11 | **Insider/operator abuse via impersonation** | Support views a tenant without cause | M | M | Explicit consent flag with expiry, read-only tokens, 5-minute life, one audit row **per request** | §27.5.4 |
| T12 | **Resource exhaustion / DoS** | Unbounded page size, expensive report, export flood, job flood | M | M | `page_size` max 100, `statement_timeout` 15 s, export throttle 10/h, cursor pagination without counts, job priorities and `max_attempts` | §27.11 |
| T13 | **Data loss / ransomware on the single VPS** | No backups, compromised host | L | **H** | Nightly `pg_dump` off-host with 30-day retention, weekly restore drill, media rsync, documented RTO/RPO | §27.15 |
| T14 | **PII over-exposure in logs and exports** | Mobile numbers in access logs, full row dumps in errors | **H** | M | Redaction filter, masked mobiles, no bodies logged, export permission gated and audited | §27.7, Part 30 §30.4 |
| T15 | **Dependency compromise** | A malicious or vulnerable package | L | H | Closed allow-list (ADR-021), exact pins, hash-checked installs, `pip-audit` in CI, minimal transitive surface | §27.13 |

Three more that are real but lower-risk, tracked rather than tabled: CSRF on cookie-authenticated writes (mitigated by double-submit plus `SameSite=Lax`); clickjacking (`X-Frame-Options: DENY`); host-header injection into share links (mitigated by building URLs from `UB_PUBLIC_BASE_URL`, never from `request.get_host()`).

---

## 27.2 Security principles

1. **Fail closed.** No tenant → no data. Unmapped action → denied. Unknown module → denied. Missing consent → refused. The absence of a decision is never permission.
2. **Defence in depth on the two invariants that cannot be repaired**: tenant isolation (application scoping + 404 semantics + RLS in P2) and ledger immutability (no code path + database trigger).
3. **Server is the authority.** Client-side checks are UX. Every permission, every total, every state transition is decided server-side.
4. **Least data.** Do not collect what the feature does not need; do not log what the incident would not need; do not return what the screen does not render.
5. **Everything that matters is audited**, and the audit is append-only.
6. **Security controls are tested like features.** An untested control is a claim, not a control.

---

## 27.3 Tenant isolation guarantees

### 27.3.1 The guarantees, stated precisely

| G | Guarantee |
|---|---|
| **G1** | Every business row carries `tenant_id NOT NULL` with an FK to `platform_tenant` (Part 21 §21.1). |
| **G2** | Every queryset reaching a response passes through `for_tenant(tenant)` or `TenantScopedViewSet.get_queryset()`. |
| **G3** | An unresolvable tenant yields an **empty** result set, never an unscoped one. |
| **G4** | A row id belonging to another tenant is indistinguishable from a non-existent id: **404 `not_found`**, never 403 — a 403 confirms existence. |
| **G5** | A foreign id submitted in a request body fails validation as "invalid pk", leaking nothing. |
| **G6** | The tenant comes from the signed JWT `tid` claim, re-verified against a live `active` membership on every request. `X-Tenant-Id` is never read. |
| **G7** | Background jobs carry an explicit tenant and run inside `TenantContext`; a handler cannot accidentally operate tenant-wide. |
| **G8** | Cross-tenant reads by a super admin are possible only through the consented, read-only, per-request-audited impersonation path. |

### 27.3.2 The tests that prove them

These are the highest-value tests in the codebase; they live in `tests/integration/test_tenant_isolation.py` and run on every PR.

| Test | Proves |
|---|---|
| `test_every_detail_route_returns_404_for_another_tenants_id` | G4, across every registered detail route |
| `test_route_coverage_is_exhaustive` | A new route cannot ship without its isolation test — the test fails when the route list and the tested list diverge |
| `test_every_list_route_excludes_other_tenant_rows` | G2, by seeding both tenants and asserting the id sets are disjoint |
| `test_write_cannot_reference_another_tenants_party` (and item, invoice, payment, attachment, tag) | G5 |
| `test_x_tenant_id_header_is_ignored` | G6 |
| `test_no_tenant_means_empty_not_everything` | G3 |
| `test_revoked_membership_loses_access_immediately` | G6 — a suspended member's still-valid token resolves no tenant |
| `test_manager_for_tenant_none_returns_empty` | G3 at the ORM layer |
| `test_job_handler_runs_in_tenant_context` | G7 |
| `test_impersonation_requires_consent_and_is_read_only` | G8 |
| `test_public_link_of_tenant_a_cannot_be_read_with_tenant_b_context` | G4 on the public surface |

A pre-merge rule: **any PR touching `apps/common/tenancy.py`, `managers.py` or `viewsets.py` requires a second reviewer.**

### 27.3.3 Phase 2: row-level security

Part 21 §21.1 reserves RLS. The schema is already compatible: every business table has `tenant_id`, and the connection would set `SET LOCAL app.tenant_id = '<uuid>'` in the same middleware that binds the tenant contextvar. The policy is `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. It is Phase 2 because it needs a connection-per-request discipline that conflicts with `CONN_MAX_AGE` pooling and must be introduced with care, not because the application scoping is considered sufficient forever.

---

## 27.4 Authentication hardening

### 27.4.1 OTP

| Control | Value |
|---|---|
| Code space | 6 digits, generated with `secrets.randbelow(10**6)`, zero-padded — never `random` |
| TTL | 300 s (`UB_OTP_TTL_SECONDS`) |
| Attempts | 5 per challenge; the 5th failure sets `verified_at` sentinel and burns the challenge |
| Storage | `sha256(code + UB_OTP_PEPPER)` in `code_hash`; the plaintext exists only in the SMS body |
| Comparison | `hmac.compare_digest` — constant time |
| Rate limit | 5 requests per mobile per 10 min; 20 per IP per hour (§22.1) |
| Enumeration | `POST /auth/otp/request` returns the same shape and timing for known and unknown mobiles |
| Response | Never contains the code, in any environment. Dev reads it from the `ub.sms` log. |
| Reuse | `verified_at` set → any further verify attempt fails; a challenge is single-use |
| Purge | `platform.purge_otp_challenges` deletes rows older than 24 h |

**Lockout.** After 5 failed challenges for one mobile within an hour, further `otp/request` calls return `429 otp_throttled` with `retry_after` for 30 minutes. The lockout is stored as a counter row keyed on the mobile hash, not in a memory cache, because there is no shared cache (ADR-012) and a per-process counter is trivially bypassed across gunicorn workers. **This is a normative implementation detail:** throttle state that must be correct lives in PostgreSQL (`platform_rate_limit` counter rows with a `window_start`), not in `LocMemCache`.

### 27.4.2 Passwords

| Control | Value |
|---|---|
| Hashing | Django `PBKDF2PasswordHasher` (default), iterations at Django 5.2's default, never lowered |
| Minimum length | 8 characters; 10 for `owner` and `admin` |
| Composition rules | **None** — length plus a breach check beats character classes and produces better passwords |
| Blocklist | Django's `CommonPasswordValidator` with the bundled list, plus `UserAttributeSimilarityValidator` (name, mobile, email) and `NumericPasswordValidator` |
| Change | Requires the current password, or an OTP-verified session |
| Reset | OTP to the registered mobile; the reset token is single-use, 15-minute, hashed at rest |
| Response on login failure | Generic `401 invalid_credentials` for unknown mobile and wrong password alike |
| Throttle | 10 attempts per mobile per 10 min, then 15-minute lockout; 100 per IP per hour |
| On success | Every failed-attempt counter for that mobile is cleared; `last_login_at` updated; an audit row `auth.login_success` with the mobile **hashed** (Part 21 §21.7) |

Passwords are optional: an OTP-only user has `password_hash NULL` and can never be logged in by password. That is a feature — many merchants will never set one.

### 27.4.3 Session and device management

- One `platform_session` row per issued refresh token, with `family_id`, `device_label`, `user_agent`, `ip`, `expires_at`.
- `GET /auth/me` lists the caller's active sessions with device label and last use, so a merchant can see "3 devices".
- `POST /auth/logout` revokes the current session; `?all=true` revokes every session for the user and is offered prominently after a password change.
- Access tokens are not revocable individually (no blocklist without Redis). The bounded exposure is the 15-minute access lifetime. For an immediate, total cut, `platform_user.token_epoch` is incremented and every access token carrying an older epoch is rejected — one indexed lookup that the permission layer already performs.

### 27.4.4 Token theft response

The runbook, in order:

1. **Detect.** Refresh-token reuse is detected automatically (§20.5.2) and writes `auth.refresh_reuse_detected` at ERROR. A merchant reporting "someone else is in my account" is the other trigger.
2. **Contain.** Revoke the family (automatic on reuse) or all sessions (`logout?all=true` by the user, or the operator command `revoke_sessions --user <id>`). Increment `token_epoch` to kill outstanding access tokens.
3. **Reset.** Force a password reset and a fresh OTP login.
4. **Assess.** Query `platform_audit_log` for that user over the exposure window: what was read, what was written, what was exported. This is what A9 exists for.
5. **Notify.** If party PII was exported or viewed at scale, the DPDP breach obligation in §27.9 applies.
6. **Record.** An incident entry per §27.16.

---

## 27.5 Authorisation correctness

### 27.5.1 Fail-closed defaults

- `REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] = ["rest_framework.permissions.IsAuthenticated"]` — a view that declares nothing still requires authentication.
- `HasPermission` denies any action not present in its mapping. Adding an `@action` without a codename yields 403, which the permission-coverage test turns into a build failure:

```python
def test_every_viewset_action_has_a_permission_codename():
    """Every registered @action and standard action must be mapped, or CI fails."""
    for viewset in discover_viewsets():
        mapped = collect_has_permission_mapping(viewset)
        for action in viewset.get_extra_actions() + STANDARD_ACTIONS_FOR(viewset):
            assert action in mapped, f"{viewset.__name__}.{action} has no permission codename"
```

- Every permission string is validated against `PERMISSIONS` **at import time**, so a typo fails the deploy, not the request.
- Module gating and plan gating run before the permission check, so the user gets the accurate error (`module_disabled` / `plan_limit_reached` rather than `permission_denied`).

### 27.5.2 Permissions are re-read, not trusted from the token

The `rol` claim renders the UI. Every authorisation decision loads the live `Membership` (status, role, `permissions_override`) and computes the effective set. A revoked membership loses access on the next request, not at token expiry. The `ver` claim exists purely to tell the client its cached permission list is stale.

### 27.5.3 Object-level checks

Tenancy is handled by the queryset; object-level checks cover **ownership and state**:

- A staff member may delete only a draft they created (SAL-02 §12).
- A document may be edited only while `draft`.
- A ledger entry may be corrected only when `source_type = manual` (LED-03 BR-6).
- A reminder may be sent only for a party the caller can read.

These live in `check_object_permission(self, request, obj)` on the viewset, invoked by `HasPermission.has_object_permission`, and are tested per rule.

### 27.5.4 Privilege-escalation tests

| Test | Asserts |
|---|---|
| `test_role_matrix` (parametrised over all four roles × every endpoint × every method) | The full canon §0.9 matrix, endpoint by endpoint |
| `test_staff_cannot_void_invoice` | 403 `permission_denied` |
| `test_staff_cannot_correct_ledger_entry` | 403 |
| `test_staff_cannot_override_credit_limit_block` | 409 without `override`, 403 with it |
| `test_accountant_cannot_write_anything` | 403 on every write route |
| `test_member_cannot_change_own_role` | `PATCH /memberships/{own id}` with `role` → 403 |
| `test_member_cannot_grant_permissions_override_to_self` | 403 |
| `test_last_owner_cannot_be_removed_or_demoted` | 409 |
| `test_permissions_override_deny_beats_allow` | Deny wins |
| `test_disabled_module_permission_is_dropped` | A permission for a disabled module is not in the effective set |
| `test_role_change_invalidates_old_token_permissions` | `401 token_stale` after a role change |
| `test_impersonation_token_cannot_write` | 403 on every unsafe method |
| `test_super_admin_without_consent_cannot_impersonate` | 403 `impersonation_not_consented` |
| `test_non_super_admin_cannot_call_admin_routes` | 404 (the admin router is not even acknowledged) |

---

## 27.6 Input validation and injection defence

### 27.6.1 ORM only

All queries go through the Django ORM. `Model.objects.raw()`, `connection.cursor()` and `RawSQL` are **banned in application code**. Reports use ORM aggregation, `Subquery`/`OuterRef`, `Window` functions and `FilterExpression`; the ORM covers every report in Part 22 §22.11.

### 27.6.2 The raw-SQL exception process

Raw SQL is permitted in exactly three places and nowhere else:

1. **Migrations** (`RunSQL`) for triggers, extensions, `NOT VALID` constraints and concurrent indexes.
2. **`apps/common/jobs.py`'s claim query**, which needs `FOR UPDATE SKIP LOCKED` in a CTE (Part 20 §20.8.5).
3. **`check_invariants`**, which is read-only, parameterless and operator-run.

Any fourth case requires: a CR naming the query and why the ORM cannot express it; the query in a dedicated module under `selectors/` with a docstring; **parameter binding only** (`cursor.execute(sql, params)` — never f-strings, never `%` formatting, never `.format()`); a test that passes a hostile value; and review by a second engineer.

```python
# ✗ wrong — string interpolation, even "safe-looking" ones
cursor.execute(f"SELECT * FROM parties_party WHERE tenant_id = '{tenant.id}' AND name ILIKE '%{q}%'")

# ✓ right — bound parameters, and the tenant is still a bound parameter
cursor.execute(
    "SELECT id, name FROM parties_party WHERE tenant_id = %s AND name ILIKE %s",
    [tenant.id, f"%{q}%"],
)
```

A lint test greps the tree for `cursor.execute(f"`, `.raw(f"`, `RawSQL(f"` and `% (` adjacent to SQL keywords, and fails the build.

### 27.6.3 File-upload validation

Restated from Part 20 §20.9.2 as a security control with its rationale:

| Control | Attack it defeats |
|---|---|
| Magic-byte verification via `Pillow.Image.verify()`, not `content_type` | Polyglot files; a `.jpg` that is a PHP script or an HTML page |
| **Re-encode** every image through Pillow rather than storing the original bytes | Embedded payloads, malformed-decoder exploits, EXIF tracking data |
| `Image.MAX_IMAGE_PIXELS = 40_000_000` | Decompression bombs |
| Size caps: 10 MB general, 2 MB logo/signature, 5 MB CSV | Disk exhaustion |
| UUID v7 filenames; the user's filename is stored as data, never used in a path | Path traversal (`../../etc/passwd`), null-byte tricks, case-collision overwrite |
| **SVG refused for every kind** | Stored XSS through a tenant logo rendered in every print view |
| CSV: decoded as UTF-8 and parsed with the stdlib `csv` module; cells beginning `= + - @` are prefixed with `'` on **export** | CSV injection into the merchant's Excel |
| Served with `Content-Disposition: attachment` (except images displayed in-app), `X-Content-Type-Options: nosniff`, and a `Content-Type` derived from the verified type | MIME sniffing to HTML |
| Media is never served from `MEDIA_URL` in production; every byte passes an authorisation check | Direct object access by URL guessing |
| `sha256` stored; identical re-uploads deduplicate | Storage amplification |

### 27.6.4 XSS

The backend never renders HTML containing user data. There is no server-side template that includes merchant or party content — PDFs are client-side (ADR-014), and the public share page is a React route fed by JSON.

Backend obligations:

- **Never** return HTML built from user input, in any endpoint, including error messages.
- Store text as text; escape at render (React does this by default).
- `Content-Type: application/json` on every API response, with `X-Content-Type-Options: nosniff`.
- A **Content-Security-Policy** header on the public share routes, set by the reverse proxy and asserted in a test: `default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.
- `X-Frame-Options: DENY` and `Referrer-Policy: same-origin` globally.

Frontend obligations that the backend depends on (stated so neither side assumes the other): no `dangerouslySetInnerHTML` anywhere; URLs from the API rendered as text unless they match an allow-list scheme (`https:`, `upi:`, `wa.me`); no `eval`, no dynamic `new Function`.

### 27.6.5 SSRF

At MVP the backend makes **no outbound HTTP requests at all** — the SMS backend logs, WhatsApp is a URL string, UPI QR is generated locally. SSRF is therefore not reachable today, and the control is preventative: **no code may fetch a URL supplied or influenced by a user.** When Phase 2 adds real adapters:

- Provider base URLs come from settings, never from tenant data.
- A single `apps/common/http.py` wrapper is the only place `requests` is called; it enforces an allow-list of hostnames, `allow_redirects=False`, a 5-second connect/10-second read timeout, a response-size cap, and a DNS-resolution check rejecting private/link-local/loopback ranges.
- Webhooks are **inbound only**; outbound tenant webhooks (P3, §22.13) additionally resolve and pin the target at registration time and refuse private ranges.

### 27.6.6 Other injection surfaces

| Surface | Control |
|---|---|
| Log injection (newlines in a name forging a log line) | JSON log format — a newline inside a field is escaped by the encoder; the formatter never concatenates user data into the message |
| Header injection into share URLs | URLs built from `settings.PUBLIC_BASE_URL`, never `request.get_host()`; `ALLOWED_HOSTS` enforced |
| SMS template injection | Templates are stored server-side with `{{placeholders}}`; only whitelisted context keys are substituted; user text is never used as a template |
| `upi://` parameter injection | `note` and `ref` stripped to `[\w .\-]` and `[\w-]` and length-capped before `urlencode` |
| Mass assignment | Serializers declare explicit `fields` tuples; `__all__` is banned (§26.6) |
| Open redirect | No redirect endpoint accepts a URL parameter |
| Regex DoS | No user input is compiled as a regex; search uses `ILIKE`/trigram, and `statement_timeout` bounds it |

---

## 27.7 Secrets, PII, transport and storage

### 27.7.1 Secrets

| Secret | Where | Rotation |
|---|---|---|
| `UB_SECRET_KEY` | `.env`, root-owned `0600` | Via `SECRET_KEY_FALLBACKS`, one refresh lifetime overlap |
| `UB_OTP_PEPPER` | `.env`; distinct from `SECRET_KEY` | Rotation invalidates live challenges only — safe any time |
| `POSTGRES_PASSWORD` | `.env` and the compose `db` service | Coordinated restart |
| Provider API keys **[P2]** | `.env`, partner-scoped | Per provider policy |

Rules: never in the repository, never in a log, never in an error response, never in a job payload, never in an audit row. `.env` is git-ignored and `.env.example` carries only development values. A pre-commit secret scan (`ruff`'s `S105`/`S106` plus a regex hook for `-----BEGIN`, `sk_live`, long base64) blocks accidental commits. If a secret ever reaches the repository, it is rotated — removing the commit is not a remediation.

### 27.7.2 Transport

TLS 1.2+ only, terminated at nginx with a modern cipher suite; HTTP redirects to HTTPS. `SECURE_HSTS_SECONDS = 31536000` with `includeSubDomains` and `preload`. `SECURE_PROXY_SSL_HEADER` set so Django knows the request was secure. Cookies: `Secure`, `HttpOnly`, `SameSite=Lax`, `ub_refresh` additionally path-scoped to `/api/v1/auth/refresh`. CORS is an explicit origin list; `CORS_ALLOW_ALL_ORIGINS` is rejected at startup in production. The database port is never published from the compose network.

### 27.7.3 PII inventory and treatment

The columns below are **personal data** under the DPDP Act. Everything else in the schema is business data.

| Column(s) | Data principal | Treatment |
|---|---|---|
| `platform_user.mobile`, `email`, `full_name` | The merchant's team member | Encrypted in transit; access limited to the user and their tenant's owner/admin; hashed in audit rows for auth events; masked in logs |
| `parties_party.name`, `mobile`, `alt_phone`, `email`, `billing_address`, `shipping_address`, `gstin` | The merchant's customer/supplier | Tenant-scoped; exportable only with `parties.party.export`; never in logs; never in analytics; masked in the SMS log's `to_address` |
| `sales_document.party_snapshot`, `walk_in_name`, `walk_in_mobile` | Customer | Immutable statutory snapshot; retained 72 months per GST; visible in the public share link **only to the token holder** |
| `notifications_message_log.to_address`, `payload` | Recipient | `to_address` masked in any display and in logs; `payload` holds template variables and is purged with the row |
| `platform_otp_challenge.mobile`, `ip` | User | Purged after 24 h |
| `platform_session.ip`, `user_agent` | User | Purged with the session; shown to the owning user for device management |
| `platform_audit_log.metadata.ip` | Actor | Truncated to /24 (IPv4) or /48 (IPv6) before storage |
| `files_attachment` bytes (bill photos) | Whoever is in the photo | EXIF stripped on upload; tenant-scoped; served only after authorisation |

**Encryption at rest** is disk-level on the VPS (LUKS or the provider's volume encryption), not column-level. Column encryption is rejected at MVP: it would break every index and search on exactly the columns that need them (party name, mobile), and the realistic threat (a stolen database dump) is better addressed by disk encryption plus access control. The exception is the material that is *already* hashed by design: passwords, OTP codes, session tokens and share-link tokens are stored only as hashes, never recoverable.

### 27.7.4 Backups

Nightly `pg_dump --format=custom` plus a media `rsync`, encrypted with `age`/GPG using a key held off-host, retained 30 days daily and 12 months monthly. **A restore drill runs monthly** and is recorded — an untested backup is not a backup. RPO 24 h, RTO 4 h at MVP, stated plainly to partners rather than overclaimed.

---

## 27.8 Audit-log integrity

`platform_audit_log` is A9 and its trustworthiness is what makes every other claim provable.

| Control | Implementation |
|---|---|
| Append-only in application code | Only `apps/common/audit.py: write_audit()` inserts; nothing updates or deletes |
| Append-only in the database | The same `forbid_update_delete()` trigger pattern as the ledger, applied to `platform_audit_log` — **this chapter mandates it** (Part 21 §21.3.1 says "append-only"; the trigger is how) |
| Written in the same transaction as the change | A change that commits without its audit row is impossible; a rolled-back change leaves no audit row |
| Cannot be suppressed | `write_audit` is called by the service, not by a signal; a service without it fails review (§26.20) |
| Actor attribution | `actor_id` + `actor_type` (`user`, `system`, `webhook`, `super_admin`); system jobs are attributed to the job |
| Correlation | `metadata.request_id` ties an audit row to its log lines and to other rows from the same request |
| Retention | ≥ 7 years for financial actions (GST 72 months + margin); never truncated by a cleanup job |
| Access | `platform.audit.read` — owner, admin, accountant. Staff cannot read the audit log |
| No PII beyond necessity | Auth events store a **hashed** mobile (Part 21 §21.7); `before`/`after` snapshots of party rows are permitted because the reader is already entitled to the party |
| Tamper evidence **[P2]** | A monthly hash chain: each month's rows are hashed in id order and the digest is stored in an append-only side table and printed in the operations log. Detects silent editing by anyone without shell access; anyone with shell access is out of scope for a single-VPS deployment and that limit is stated rather than papered over |

---

## 27.9 DPDP Act 2023 and the DPDP Rules 2025

### 27.9.1 Roles

DigiKhaato is a **Data Processor** for party data: the merchant (the tenant) is the **Data Fiduciary** who decides why customer data is collected, and Metis Labs processes it on their behalf. For the merchant's own users (owner, staff), Metis Labs is the Data Fiduciary. Both roles are stated in the Terms and in the in-app privacy notice; the distinction drives who must obtain consent (the merchant, from their customer) and who must build the mechanism (Metis Labs).

### 27.9.2 Obligations mapped to product features

| DPDP obligation | Feature / mechanism | Where it lives | Status |
|---|---|---|---|
| **Notice** at or before collection, in plain language, available in English and Hindi | Onboarding privacy notice; party-create screen states what the mobile number is used for | PLT onboarding, PTY-01 | MVP |
| **Consent** — free, specific, informed, unconditional, unambiguous, with clear affirmative action | `parties_party.sms_opt_in` (default must be an explicit choice, not a silent true, for messaging), plus `consent_source` ∈ `verbal | form | link` and `consent_at` | `parties_party` (Part 21 §21.3.3) | MVP |
| **Record of consent** | `consent_source` + `consent_at` + an audit row `party.consent_recorded` with the actor and the request id | `platform_audit_log` | MVP |
| **Purpose limitation** — data used only for the stated purpose | Party mobile is used for: transaction SMS (LED-08), reminders (LED-06/07), share links. It is **never** used for marketing, never sold, never shared across tenants, and never sent to an analytics provider | Enforced by the messaging service's template allow-list; §27.10 | MVP |
| **Data minimisation** | Only `name` is mandatory on a party; mobile, email, address, GSTIN are optional and the UI says so | PTY-01 validation | MVP |
| **Accuracy** | Party edit with audit trail; corrections to the ledger are reversals, never silent edits | PTY, LED-03 | MVP |
| **Withdrawal of consent, as easy as giving it** | Toggling `sms_opt_in` off in the party screen; a `STOP` reply handling path **[P2]** when a real SMS provider exists; unsubscribe wording carried in every template | PTY-06, LED-08 | MVP (toggle), P2 (STOP) |
| **Right to access / data portability** | `POST /tenants/current/export` → 202 job → a complete machine-readable export (CSV per table + a JSON manifest) covering parties, ledger, documents, payments, items, movements | **PLT-10**, `platform.export_tenant_data` | MVP |
| **Right to erasure** | `POST /tenants/current/delete-request` (owner, OTP re-verified) → `status=pending_deletion`, 30-day cool-off, `POST /tenants/current/delete-cancel`; then `platform.delete_tenant` deletes children in dependency order after a final export | **PLT-10**, Part 21 §21.1 principle 10 | MVP |
| **Erasure of a single party's data** | Party delete is refused while a balance or a statutory document exists; where permitted, personal fields are **redacted in place** (`name → "Deleted party"`, mobile/email/address nulled) while the financial rows remain, because GST requires the transaction record | PTY, `parties.services.redact_party` | MVP |
| **Retention limitation** | Retention table §27.9.3; automated purge jobs for OTP (24 h), notifications (180 d), message logs (12 mo), exports (7 d), idempotency keys (24 h), succeeded jobs (14 d) | `platform.purge_*` jobs | MVP |
| **Grievance redressal** — a contact who must respond | Partner support contact (`platform_partner.support_contact`) surfaced in-app; Metis Labs' Data Protection contact in the privacy notice; a documented response SLA | Help/Settings screen | MVP |
| **Breach notification** to the Data Protection Board and affected principals, without delay | §27.16 incident runbook, with a 72-hour internal target and the notification templates prepared in advance | Runbook | MVP |
| **Children's data** — no processing likely to harm a child, no tracking or targeted advertising | The product is a B2B business tool; the Terms require users to be 18+; **no advertising, no behavioural tracking, no third-party trackers exist in the product at all**, so the prohibition is satisfied structurally rather than by policy | Terms + absence of ad SDKs | MVP |
| **Consent manager** registration | Not applicable to a processor; DigiKhaato does not act as a Consent Manager. If a partner (a bank) integrates one, consent artefacts would be recorded in `parties_party.consent_source='link'` with the artefact reference in `notes` **[P2]** | — | P2 |
| **Reasonable security safeguards** | This entire chapter; specifically §27.3 isolation, §27.4 authentication, §27.7 encryption and secrets, §27.8 audit, §27.13 supply chain | — | MVP |
| **Processor obligations flow-down** | Metis Labs processes only on the merchant's documented instructions; sub-processors (hosting, SMS provider in P2) are listed in the Terms and bound by contract | Terms | MVP |

### 27.9.3 Retention schedule

| Data | Retention | Basis |
|---|---|---|
| Ledger entries, documents, payments, stock movements | **72 months minimum** from the end of the relevant financial year | GST record-keeping |
| Audit log (financial actions) | ≥ 7 years | Above, plus evidentiary value |
| Party master | Life of the tenant, then per the deletion request | Merchant's business record |
| OTP challenges | 24 hours | Purpose exhausted |
| Sessions | Until expiry or revocation, then 90 days for security forensics | Security |
| Notifications | 180 days | Product |
| Message logs | 12 months | Delivery disputes and DLT records |
| Exports | 7 days | Transient |
| Idempotency keys | 24 hours | Protocol (§22.1) |
| Succeeded jobs / dead-letter jobs | 14 days / 180 days | Operations |
| Application logs | 30 days on disk | §27.14, Part 30 §30.5 |

A deletion request that would destroy statutory records is honoured by **redaction of personal fields with retention of financial rows**, and the merchant is told exactly that. Pretending otherwise would be both non-compliant with GST and dishonest.

---

## 27.10 SMS / DLT and WhatsApp consent rules

Indian messaging carries its own regulatory layer (TRAI TCCCPR / DLT) on top of DPDP. The rules are enforced in the messaging service, not left to the caller.

| Rule | Implementation |
|---|---|
| Only **transactional / service-implicit** messages at MVP | The template allow-list contains only transaction, reminder and OTP templates. There is no promotional template and no mechanism to send free-text SMS. |
| Sender ID and template must be DLT-registered **[P2]** | `notifications_template.dlt_template_id`; the adapter refuses to send a template without one once a real provider is configured, with `status='skipped'` and a clear log line |
| Consent gate | Every party-directed message checks `party.sms_opt_in` **and** the tenant setting (`ledger.party_sms_on_entry`, `ledger.auto_sms`) **and** the presence of a mobile. Any failing check → `status='skipped'`, never a silent send |
| Opening balances do not message | LED-02 §17 / LED-08 BR-3: a customer who did not transact today must not receive "₹2,300 udhaar added" |
| Corrective messages only when the original was delivered | LED-03 FR-9 / LED-08 BR-6 |
| Quiet hours | Automated reminders are scheduled for 08:00–20:00 tenant time; the scheduler sets `run_after` accordingly rather than sending at 03:00 |
| Frequency cap | At most one automated reminder per party per day, enforced by `U(party_id, due_on, kind)` on `ledger_reminder` |
| Opt-out wording | Every party-directed template carries the merchant's name and an opt-out instruction; a `STOP` handler sets `sms_opt_in=false` **[P2]** when inbound SMS exists |
| WhatsApp | At MVP the merchant taps a `wa.me` link — the message is sent by the **merchant's own** WhatsApp, which is their relationship and their consent. The backend sends nothing. **[P2]** Cloud API sends only approved *utility* templates to opted-in recipients, with the 24-hour session rules respected |
| Audit | Every send attempt writes `notifications_message_log` with status, provider, template and masked recipient — the record that proves consent was checked |

---

## 27.11 Rate limiting and abuse controls

| Scope | Limit | Storage |
|---|---|---|
| General authenticated | 600 req/min/user (§22.1) | Counter rows in PostgreSQL |
| OTP request | 5/mobile/10 min; 20/IP/hour | PostgreSQL (correctness matters) |
| Login | 10/mobile/10 min; 100/IP/hour | PostgreSQL |
| Export / report generation | 10/hour/tenant | PostgreSQL |
| Public share link | 60/min/IP, and 600/day per token | PostgreSQL |
| File upload | 60/hour/user, 200 MB/day/tenant | PostgreSQL |
| Import commit | 5/hour/tenant | PostgreSQL |

Because there is no Redis (ADR-012), DRF's default cache-backed throttling would be per-gunicorn-worker and trivially bypassed. **Normative:** security-relevant throttles (OTP, login, public links, exports) are implemented in `apps/common/throttling.py` against a `platform_rate_limit` table with `(scope, key_hash, window_start, count)` and a unique index, incremented with `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`. The generic 600/min user throttle may remain in `LocMemCache`, because exceeding it is a performance concern rather than a security one, and that trade-off is recorded here rather than discovered later.

Responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and, on 429, `Retry-After`. Throttle keys are hashed (`sha256(mobile + pepper)`) so the table is not a phone directory.

Other abuse controls: `page_size` capped at 100; `limit` capped at 200; `statement_timeout` 15 s; `DATA_UPLOAD_MAX_NUMBER_FIELDS` at Django's default; document line count capped at 200 per document; import file capped at 5 MB and 10 000 rows; job payload capped at 64 KB.

---

## 27.12 The public-link security model

Public links are the only unauthenticated read path to tenant data, so their model is spelled out completely.

| Property | Rule |
|---|---|
| **Entropy** | `secrets.token_urlsafe(32)` → 256 bits. At 60 requests/minute/IP, exhausting even 2⁶⁴ is not a threat. |
| **Storage** | `sha256(token)` only. The plaintext is returned once, in the creation response, and never stored, logged or re-derivable. |
| **URL shape** | `https://<UB_PUBLIC_BASE_URL>/d/<token>` and `/s/<token>` for statements. **No tenant id, no document number, no party name, no mobile number anywhere in the path or query.** A link pasted into WhatsApp reveals nothing by inspection. |
| **Expiry** | Mandatory `expires_at`; default 7 days, maximum 90, chosen by the merchant at creation. Enforced server-side on every fetch. |
| **Revocation** | `revoked_at`; a "Revoke link" action on the document and party screens; revocation is immediate because there is no cache. |
| **Indistinguishable failures** | Wrong, expired, revoked and never-existed tokens all return an identical `404 not_found` with the same body and comparable timing (lookup is a single indexed hash comparison in every case). |
| **Throttle** | 60/min/IP and 600/day/token; a token being hammered is logged at WARNING and can be auto-revoked by the operator. |
| **Content** | A dedicated redacted serializer: the document or statement, tenant name, branding, address and contact. **Excluded:** internal ids, cost prices, margins, other parties, other documents, staff names, audit data, any field not printed on paper. |
| **No writes** | The public router exposes `GET` only. There is no comment box, no acknowledgement button, no payment form at MVP. |
| **No authentication oracle** | The public endpoints never reveal whether a tenant, party or document exists by any other means. |
| **Headers** | `Cache-Control: private, max-age=600`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: same-origin`, CSP as §27.6.4, `X-Frame-Options: DENY`. |
| **Observability** | Each fetch increments `view_count`, records `last_viewed_at`, and writes an audit row `document.public_viewed` with the truncated IP — so the merchant can see "viewed 3 times" and an operator can see a scraping pattern. |
| **Scope** | One token grants exactly one document or one party statement for one date range. There is no token that grants a list, a search or a second object. |

---

## 27.13 Dependency and supply-chain policy

| Control | Rule |
|---|---|
| Allow-list | ADR-021's closed list plus `uuid6` (ADR-021a). Anything else needs an ADR answering the six questions in §26.13.2. |
| Pinning | Exact `==` pins in `requirements/base.txt`; a lock file with hashes (`pip install --require-hashes`) in the Docker build. |
| Provenance | Packages come from PyPI over HTTPS; no VCS URLs, no local wheels, no `--index-url` override. |
| Vulnerability scanning | `pip-audit` runs in CI on every PR and nightly on `main`. A **high** or **critical** advisory blocks the merge and triggers a patch within 7 days; **medium** within 30 days. |
| Base image | `python:3.12-slim`, rebuilt weekly so OS packages are patched; the image is scanned with `trivy` in CI. |
| Minimal image | No compilers, no `curl` in the final layer beyond the healthcheck, non-root user (`uid 10001`), read-only root filesystem except `media/` and `logs/`. |
| Django upgrades | Security releases applied within 7 days; the 5.2 LTS line is tracked and the next LTS migration is planned, not deferred indefinitely. |
| Frontend | The ADR-021 frontend list, with `npm audit` in CI and the same severity SLAs. |
| Integrity of our own build | The image is built in CI from a tagged commit; `UB_VERSION` carries the commit SHA and is returned by `/system/version`, so what is running is always identifiable. |
| Third-party scripts in the browser | **None.** No analytics SDK, no tag manager, no font CDN, no chat widget. This eliminates the largest supply-chain surface a web product has, and it is a deliberate product decision, not an oversight. |

---

## 27.14 Logging, monitoring and detection

Full treatment in Part 30. The security-specific requirements:

**Must be logged** (structured, on `ub.security`): login success and failure, OTP request/verify/failure/lockout, refresh reuse detection, session revocation, permission denials, module/plan denials, rate-limit breaches, impersonation start and every impersonated request, share-link creation/revocation/access, export requests, tenant deletion requests, and every unhandled exception.

**Must never be logged**: OTP codes, passwords, password hashes, JWTs, cookies, `Authorization` headers, `Idempotency-Key` values, full request or response bodies, unmasked mobile numbers, party names, addresses, GSTIN, email addresses, file contents. A `RedactingFilter` on the root logger enforces this by key name and by pattern (E.164-shaped strings, JWT-shaped strings), so a careless `extra` cannot leak.

**Log integrity**: logs are written to `UB_LOG_DIR` with `RotatingFileHandler`, 30-day retention, and the directory is not writable by the application user beyond appending. Off-host shipping is **[P2]**; until then a compromised host means compromised logs, which is stated plainly in the threat model rather than assumed away.

**Detection at MVP** is a person looking at the operations page and three SQL queries (Part 30 §30.9): failed logins per mobile per hour, permission denials per user per hour, and public-link fetches per token per hour. Alerting is a daily digest email from a scheduled job plus an immediate email on `job.dead_letter` and on any `CRITICAL`. It is modest, and pretending it is more would be the security failure.

---

## 27.15 Security review checklist per feature

Run before every feature merge, alongside §26.20.

**Data**
- [ ] Every new table has `tenant_id NOT NULL` with `ON DELETE RESTRICT`, or a documented reason it is global.
- [ ] Every new column that is personal data is listed in the §27.7.3 PII inventory and has a retention answer.
- [ ] No new column stores a secret in recoverable form.

**Access**
- [ ] Every new endpoint declares `permission_classes` with codenames from the registry.
- [ ] The role matrix test covers the new endpoint for all four roles.
- [ ] Cross-tenant access to every new detail route returns 404, with a test.
- [ ] Object-level rules (ownership, draft-only, source-type) are enforced server-side and tested.

**Input**
- [ ] Every input is validated by an explicit serializer field with bounds; no `__all__`.
- [ ] Related ids use `TenantPrimaryKeyRelatedField`.
- [ ] Any file input is validated per §27.6.3.
- [ ] No raw SQL, or the §27.6.2 process was followed.

**Output**
- [ ] The response contains no field the screen does not need — particularly no cost prices on customer-facing surfaces.
- [ ] Error messages reveal no existence information (no "party not found in tenant X").
- [ ] Any new public/unauthenticated surface follows §27.12 completely.

**Operational**
- [ ] The state change writes an audit row with actor, entity and request id.
- [ ] Rate limits are declared for anything that sends a message, generates a file or can be called anonymously.
- [ ] No PII, token or body appears in any new log line.
- [ ] Anything asynchronous is idempotent and cannot be triggered cross-tenant.

**DPDP**
- [ ] If the feature collects personal data, notice and purpose are stated in the UI and the consent record is written.
- [ ] The data is included in the tenant export (PLT-10) and handled by the deletion/redaction path.

---

## 27.16 Incident-response runbook

### Roles
At MVP the team is small: one **Incident Lead** (the on-call engineer) who decides and communicates, and one **Scribe** (anyone else) who timestamps every action in the incident log. If only one person is available, they do both and the log is written as they go, not afterwards.

### Severity

| Sev | Definition | Examples | Target response |
|---|---|---|---|
| **S1** | Confirmed cross-tenant data exposure, confirmed unauthorised access to production data, ledger corruption, or total outage | A tenant sees another's parties; the database is dumped | Immediate, all hands |
| **S2** | Credible risk of the above, or a security control failing open | Auth bypass in a specific route; a dependency CVE with a working exploit; public links not expiring | 4 hours |
| **S3** | Contained security defect with no evidence of exploitation | A permission gap fixed before release; a PII field appearing in a log | 2 business days |
| **S4** | Hygiene | A medium CVE; a missing header | Next sprint |

### The eight steps

1. **Declare.** Anyone may declare. State the severity and start the incident log (time, who, what is known). Over-declaring is free; under-declaring is not.
2. **Contain.** Stop the bleeding before understanding it. The available levers: revoke sessions (`revoke_sessions --user|--tenant`), bump `token_epoch`, disable a route with `UB_FEATURE_FLAGS`, revoke share links (`revoke_share_links --tenant`), set a tenant `suspended`, stop the `scheduler` container, put nginx into maintenance mode, rotate `UB_SECRET_KEY`.
3. **Preserve.** Before changing anything further: snapshot the database (`pg_dump`), copy `logs/` off-host, record the running image SHA (`/system/version`). Evidence first, repair second.
4. **Assess scope.** Query the audit log for the affected actor/tenant/window — what was read, written, exported, shared. Query `notifications_message_log` for anything sent. Determine **which data principals** are affected; DPDP notification turns on this answer.
5. **Eradicate and recover.** Fix the defect, add the regression test that would have caught it, deploy, verify with the test and by re-running the assessment query. Restore data from backup only when integrity is in doubt, and only after preserving the current state.
6. **Notify.** Internal within 1 hour of declaration. For S1/S2 with confirmed personal-data exposure: notify the affected merchants without delay, with what happened, what data, what we did, and what they should do; and notify the Data Protection Board per the DPDP Rules 2025 timeline — the template is prepared in advance, in `docs/runbooks/breach-notification.md`, because drafting one under pressure produces a bad notification. Partner-hosted tenants are notified through the partner as well as directly.
7. **Close.** The incident closes when containment is permanent, the fix is deployed, the regression test is merged, affected parties are notified, and the log is complete.
8. **Learn.** A blameless post-incident review within five working days, producing: a timeline, the contributing causes, the detection gap (how long until we knew, and what would have told us sooner), and **at most three** concrete actions with owners and dates. Every action lands in the backlog with an incident reference. A review that produces fifteen actions produces none.

### Standing readiness

- The runbook is rehearsed once per quarter with a tabletop exercise on a scenario from §27.1.4.
- Backup restore is drilled monthly (§27.7.4).
- Contact details — Metis Labs' DPO contact, each partner's escalation contact, the hosting provider — are kept in `docs/runbooks/contacts.md` and verified quarterly.
- The `revoke_sessions`, `revoke_share_links` and `suspend_tenant` commands exist and are tested, because the first time an operator runs a containment command must not be during an incident.
