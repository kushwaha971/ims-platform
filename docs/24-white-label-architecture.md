# Part 24 — White-Label Architecture

This part specifies how UdhaarBook is resold. It is the design behind features **WLB-01…WLB-06** (Part 17 §17.1b), the `platform_partner` / `platform_plan` tables (Part 21 §21.3.1), the `/admin/partners*` and `/partner/*` endpoints (Part 22 §22.3) and the theme-override mechanism that sits on top of the token pipeline in Part 23. Where this part and an FRD appear to disagree, the FRD's numbered `FR-n` wins and this part is a defect to be fixed; where this part and the canon (Part 0) disagree, the canon wins.

The governing engineering constraint is stated once and applies to every section below: **white-label is additive**. Partner scoping never replaces tenant scoping, never replaces permission checks, and never introduces a second code path. One deployment, one database, one Django project, one Next.js app serve Metis Labs and every partner. There is no partner branch, no partner fork, no per-partner settings module and no `if partner.code == 'x'` anywhere in the codebase. A partner is data.

---

## 24.1 The commercial model

### 24.1.1 What a partner is

A **Partner** is a commercial entity that puts UdhaarBook in front of merchants it already has a relationship with, and takes responsibility for some part of the merchant's experience — the brand, the support desk, the bill, or all three. The canonical examples in the Indian small-business market are:

| Partner archetype | Why they want this | What they bring | What they want back |
|---|---|---|---|
| **Bank / NBFC / SFB** | A merchant who keeps a ledger in the bank's app is a merchant whose cash flow the bank can see; ledger data is the cheapest underwriting signal in the market | A current-account base of tens of thousands of merchants, branch distribution, a brand merchants already trust with money | Their logo on the app, their domain on the login page, their support number in every dialog, and eventually a data feed |
| **Fintech / payments company** | Ledger + billing is the natural upsell above a soundbox or QR product; it raises switching cost on the payments relationship | An installed merchant base with a working payments habit and a field sales team | Their brand, their UPI rails wired into the payment screens, merchant-level usage reporting |
| **FMCG distributor / super-stockist** | Retailers who bill properly order more predictably; a distributor who gives the shop its billing software gets visibility and loyalty | A captive retailer network in a district, field staff who already visit every shop weekly | Their brand, their name on the retailer's bills, and (Phase 3) order visibility |
| **ERP vendor / regional software reseller** | They already sell Tally/Busy/Marg to the same merchants and want a mobile-first companion they can brand | An installed base, an existing implementation and support practice, GST expertise | A product they can sell as their own, and margin |
| **Accounting / CA firm networks** | A CA who standardises their clients onto one ledger app halves their own data-collection cost at filing time | A client book, credibility, the GST filing relationship | Their branding on the statement their client sends them, and bulk provisioning |

Metis Labs is itself a partner. The seeded row `platform_partner.code = 'metis'` is the default and is used by every direct self-serve tenant and by the local single-user deployment. This is not a convenience: it means the direct product is exercised through exactly the same resolution path as a partner product, so a partner bug is a direct-product bug and is found in the same tests. `metis` cannot be deleted or suspended (WLB-02 BR-1).

### 24.1.2 The three partnership shapes

The commercial arrangements collapse into three shapes. The platform supports all three with the same record; what differs is which fields are populated and which console the partner uses.

**Shape 1 — Referral.** The partner sends merchants to UdhaarBook and is paid a referral fee or a revenue share. The merchant knows they are using UdhaarBook. The partner gets: a `platform_partner` row for attribution, a signup link or hostname that stamps `tenant.partner_id`, a read-only usage view (Phase 2 partner console), and a support contact shown in the app so the merchant knows who introduced them. The partner does **not** get branding overrides — `branding` is left empty so everything resolves to the product default. Cost to the platform: almost nothing. Time to live: minutes.

**Shape 2 — Reseller / white-label.** The partner sells the product as their own. The merchant sees the partner's name, logo, colour and domain, and contacts the partner's support desk. The partner gets: full `branding` (WLB-01/WLB-05), one or more verified `hostnames` (WLB-03), a partner admin console (WLB-04) to provision and support merchants, branded messaging identities — DLT sender header, WhatsApp number, email domain (WLB-06) — and a plan catalogue they may assign within Metis-set ceilings. The product is still visibly "powered by" the platform in the legal footer, because GST documents must be attributable and because a fully anonymous invoice generator is a support liability. Time to live: hours to a day (DNS verification is the long pole).

**Shape 3 — Embedded / OEM.** The partner surfaces UdhaarBook inside their own app — the merchant never sees a separate login. At MVP and Phase 2 this shape is **supported commercially but delivered as Shape 2 with a deep link**: the partner's app opens the branded hostname in a web view with a one-time login token. The genuinely embedded form requires partner-scoped API keys, SSO / OIDC token exchange and an outbound webhook feed, all of which are Phase 3 (PLT-13, WLB-04 §24 "Future Enhancements"). The architecture reserves the seams: `platform_partner_admin` already carries roles, `platform_session` already carries a family model that a token-exchange flow can hang off, and `/partner/*` is already a partner-scoped namespace distinct from `/admin/*` and from the tenant API. **Nothing in Shapes 1–2 may be built in a way that forecloses Shape 3.**

### 24.1.3 What each shape gets — the entitlement matrix

| Capability | Referral | Reseller / white-label | Embedded / OEM (P3) |
|---|---|---|---|
| `platform_partner` row, attribution of new tenants | ✅ | ✅ | ✅ |
| Support contact shown in limit dialogs and suspension screens | ✅ | ✅ | ✅ |
| Branding defaults (logo, colour, app name, legal footer) — WLB-02 | — | ✅ | ✅ |
| Locked branding keys (merchant cannot override) — WLB-02 FR-1 | — | ✅ | ✅ |
| Verified custom hostname + branded login page — WLB-03 | — | ✅ (P2) | ✅ |
| Extended theme tokens (radius, fonts, nav colour) — WLB-05 | — | ✅ (P2, SA-approved) | ✅ |
| Partner admin console: tenant list, usage, entitlements — WLB-04 | read-only usage (P2) | ✅ (P2) | ✅ |
| Branded messaging identities (DLT, WhatsApp, email) — WLB-06 | — | ✅ (P2) | ✅ |
| Plan catalogue subset + entitlement overrides within ceilings | — | ✅ | ✅ |
| Consented impersonation for support | — | ✅ (P2) | ✅ |
| Partner-scoped API keys, SSO, outbound webhooks | — | — | ✅ (P3) |
| Access to tenant business data (parties, ledger, documents) | **never** | **never** (except consented impersonation) | **never** (except consented impersonation) |

The last row is the commercial promise that makes the product sellable to a bank's merchants: **the partner cannot read the shop's book.** A bank can see that a merchant is active, how many bills they raised and whether they are near a limit; it cannot see who owes them money or what they sold, unless the merchant grants a time-boxed, audited, banner-announced support session. This is stated in §24.8 as an invariant with tests, not as a policy.

### 24.1.4 How the platform stays one deployment

Five rules keep the fan-out at zero:

1. **No partner code in code.** Every partner difference is a column or a JSON key on `platform_partner`, or a row in `notifications_template`, `platform_plan`, or `files_attachment`. A grep for a partner's code string outside seed data, fixtures and tests is a build failure (a CI check, §24.10.3).
2. **One database, one schema.** Partners share the tenant table; `tenant.partner_id` is a plain FK. There is no schema-per-partner and no database-per-partner. The scaling path in Part 29 §29.10 addresses volume; it never addresses partners.
3. **One frontend bundle.** The partner theme is CSS variables computed at request time and injected into the document; it is never a separate build, a separate Tailwind config, or a `NEXT_PUBLIC_PARTNER` env var. The same `next build` artefact serves every hostname.
4. **Resolution, not configuration.** Nothing is copied from a partner into a tenant at provisioning time (except the onboarding preset intersection, WLB-02 BR-3). Everything is resolved on read. Changing a partner's logo changes it for every tenant using the default, immediately, with no migration and no backfill job.
5. **Defaults all the way down.** Every partner-shaped field has a working product default. A partner row with nothing but `code` and `name` produces a working, unbranded, Metis-styled product. That is what makes the local single-user deployment identical to the SaaS deployment.

---

## 24.2 The object model

### 24.2.1 The chain

```
platform_partner ──1:N──▶ platform_tenant ──1:N──▶ platform_membership ──N:1──▶ platform_user
       │                        │
       │ default_plan_id        │ plan_id
       ▼                        ▼
  platform_plan ◀───────────────┘
       
platform_partner ──1:N──▶ platform_partner_admin ──N:1──▶ platform_user      (CCR-16, Phase 2)
platform_partner ──1:N──▶ notifications_template  (partner_id set)           (WLB-06, Phase 2)
platform_partner ──1:N──▶ files_attachment        (owner_type='partner')     (CCR-14)
```

Cardinality rules, normative:

- **A tenant has exactly one partner** (`platform_tenant.partner_id` NOT NULL, FK RESTRICT). There is no multi-partner tenant and no partner-less tenant. Direct tenants belong to `metis`.
- **A tenant has exactly one plan** (`platform_tenant.plan_id` NOT NULL). The plan is chosen from the partner's allowed set; at MVP it is the partner's `default_plan_id`.
- **Plans are global rows, not partner-owned rows.** `platform_plan` has no `partner_id`. A partner is granted a *subset* of plans through `partner.settings.allowed_plan_ids[]`. This keeps plan semantics identical across partners — a limit key means the same thing everywhere — and lets a plan be improved once. Partner-specific commercial plans (price, name) are Phase 3 (PLT-16).
- **A user may be a member of tenants belonging to different partners.** This is common: a merchant signs up directly, then their distributor onboards them again, or an accountant serves clients across partners. The login flow handles it (§24.3.5); nothing about the user record is partner-scoped.
- **A user may simultaneously be a partner admin and a tenant member** (WLB-04 EC-1). The two contexts are disjoint: `/partner/*` ignores the `tid` claim entirely and `/api/v1/*` business endpoints ignore `partner_admin`.
- **Moving a tenant between partners** is a super-admin action (`PATCH /admin/tenants/{id} {partner_id, reason}`, PLT-14) that re-validates GSTIN uniqueness under the new partner (409 `gstin_in_use`, WLB-02 FR-6) and plan availability, and writes `admin.tenant_partner_changed` with before/after. It does not touch business data.

### 24.2.2 The resolution order

Every configurable value in the product resolves through the same three-level chain:

```
product default  ◀──  partner override  ◀──  tenant override
   (code/tokens)        (platform_partner)      (platform_tenant / platform_tenant_setting)
       lowest                                         highest
```

with one modifier: **a partner may lock a key**, which inverts precedence for that key only — the partner value wins and the tenant value is ignored (not deleted).

The formal resolution function, which every consumer must use and which lives in `platform/services/resolution.py`:

```python
def resolve(key: str, tenant: Tenant | None, partner: Partner, defaults: Mapping) -> Resolved:
    """Return (value, source) for a brandable/configurable key.

    source ∈ {'tenant', 'partner', 'default'} and is returned to the client so the
    UI can render "Using {source} default" and a Reset action (WLB-01 FR-2, FR-9).
    """
    partner_branding = partner.branding or {}
    locked = set(partner_branding.get("locked_keys", []))

    if key not in locked and tenant is not None:
        tenant_value = (tenant.branding or {}).get(key)
        if tenant_value not in (None, ""):
            return Resolved(tenant_value, "tenant")

    partner_value = partner_branding.get(key)
    if partner_value not in (None, ""):
        return Resolved(partner_value, "partner")

    return Resolved(defaults[key], "default")
```

Three properties of this function are load-bearing and are asserted by tests `T-WLB-01-3` and `T-WLB-02-2`:

1. **Empty string is absence.** A tenant that clears its `doc_header` falls back to the partner's, not to an empty line. "Reset to partner default" (WLB-01 FR-9) is implemented as writing `null`, and the UI must not send `""` to mean "keep empty" — a genuinely empty footer is expressed as a single space, and validation documents this.
2. **Locking is evaluated at read time, not write time.** Locking `primary_hex` after merchants have set their own does not delete their values; resolution simply stops consulting them (WLB-02 EC-4). Unlocking restores their choice instantly. This makes locking a reversible commercial decision rather than a destructive migration.
3. **The default layer is code, not data.** Product defaults come from the Part 23 token set and the `DEFAULT_BRANDING` constant, not from the `metis` partner row. A partner row is never consulted for another partner's fallback. This is what makes "never falls back to another partner's identity" (WLB-06 FR-3, BR-1) structurally true rather than a rule someone must remember.

### 24.2.3 What resolves, and where it is stored

| Key | Product default | Partner (`platform_partner`) | Tenant (`platform_tenant` / setting) | Lockable | Feature |
|---|---|---|---|---|---|
| `logo` | UdhaarBook mark | `branding.logo_attachment_id` | `branding.logo_attachment_id` | ✅ | WLB-01/02 |
| `primary_hex` | `#2B6BE0` (Part 23) | `branding.primary_hex` | `branding.primary_hex` | ✅ | WLB-01/02 |
| `secondary_hex` | teal ramp (Part 23) | `branding.secondary_hex` | `branding.secondary_hex` | ✅ | WLB-01/02 |
| `app_name` | `UdhaarBook` | `branding.app_name` | `branding.app_name` | ✅ | WLB-01/02 |
| `doc_header` | — | `branding.doc_header` | `branding.doc_header` | ✅ | WLB-01 |
| `doc_footer` | — | `branding.doc_footer` | `branding.doc_footer` | ✅ | WLB-01 |
| `legal_footer` | "Powered by UdhaarBook" | `branding.legal_footer` | **not overridable** | n/a (always partner) | WLB-02 FR-7 |
| `favicon` | product favicon | `branding.favicon_attachment_id` | — | n/a | WLB-03 (P2) |
| `theme.radius_scale` | `default` | `branding.theme.radius_scale` | — | n/a | WLB-05 (P2) |
| `theme.font_ui` / `font_display` | Inter / Inter | `branding.theme.*` | — | n/a | WLB-05 (P2) |
| `theme.nav_hex` | `#1B2128` | `branding.theme.nav_hex` | — | n/a | WLB-05 (P2) |
| `support_contact` | Metis support from env | `support_contact` | — | n/a | WLB-02 FR-1 |
| `allowed_modules` | all module codes | `allowed_modules[]` | `enabled_modules[]` (∩, owner choice) | intersection, not override | WLB-02 FR-4, PLT-15 FR-2 |
| plan / limits | `free` | `default_plan_id`, `settings.allowed_plan_ids`, `settings.max_overrides` | `plan_id`, `tenant_setting['plan.overrides']` | ceiling, not override | PLT-15 |
| messaging identities | console backends | `settings.messaging.*` | reminder bodies only, when allowed | ✅ (`tenant_editable_templates[]`) | WLB-06 |
| notification templates | global rows | `notifications_template` (`partner_id`) | `notifications_template` (`tenant_id`) | ✅ via WLB-06 BR-2 | WLB-06 FR-2 |

Two entries behave differently from the rest and must not be confused with overrides:

- **`allowed_modules` is an intersection, not an override.** A tenant's effective module set is `plan.modules ∩ partner.allowed_modules ∩ tenant.enabled_modules` (PLT-15 FR-2). A partner cannot grant a module the plan does not contain, and a tenant cannot enable a module the partner does not resell. Removing a module from a partner triggers the nightly `reconcile_entitlements` command, which trims tenants and notifies owners; it never deletes data (WLB-02 FR-4, PLT-15 FR-8).
- **Limits are ceilings, not values.** A partner admin raising a tenant's `max_parties` writes a tenant-level override capped by `partner.settings.max_overrides[key]`; above the ceiling the API returns 403 `partner_ceiling_exceeded` (WLB-04 FR-4). Ceilings are set only by a super admin.

### 24.2.4 The branding JSON schema (normative)

`platform_partner.branding` and `platform_tenant.branding` are validated on write against an explicit JSON schema. Unknown keys are rejected (400 `validation_error`), which is what lets schema versions be evolved safely.

```json
{
  "$schema_version": 2,
  "logo_attachment_id": "uuid | null",
  "signature_attachment_id": "uuid | null",
  "favicon_attachment_id": "uuid | null",
  "primary_hex": "^#[0-9A-Fa-f]{6}$ | null",
  "secondary_hex": "^#[0-9A-Fa-f]{6}$ | null",
  "app_name": "string(2..30) | null",
  "doc_header": "string(0..120) | null",
  "doc_footer": "string(0..300) | null",
  "legal_footer": "string(0..300) | null",
  "locked_keys": ["primary_hex", "secondary_hex", "app_name", "doc_footer", "logo"],
  "theme": {
    "radius_scale": "sharp | default | round",
    "font_ui": "inter | noto-sans | custom",
    "font_display": "inter | noto-sans | custom",
    "custom_font_attachment_ids": ["uuid"],
    "nav_hex": "^#[0-9A-Fa-f]{6}$ | null",
    "status": "draft | approved"
  },
  "theme_live": { "…frozen copy of the last approved theme…" }
}
```

Fields present on the partner only: `legal_footer`, `locked_keys`, `favicon_attachment_id`, `theme`, `theme_live`. Fields present on the tenant only: `signature_attachment_id`. The rest appear on both and resolve per §24.2.2. `$schema_version` is `1` for MVP rows (no `theme`) and `2` from WLB-05; a migration-free reader treats a missing `theme` as the product default, so the version bump is informational rather than a branch in the reader.

---

## 24.3 Request resolution

### 24.3.1 The five ways a request acquires a partner

An incoming request is attributed to exactly one partner, always, including unauthenticated and public requests. The resolution strategies, in strict priority order:

| # | Strategy | Applies to | Source | Trust |
|---|---|---|---|---|
| 1 | **Authenticated tenant's partner FK** | any request carrying a valid `tid` claim | `Tenant.objects.get(id=tid).partner_id` | authoritative |
| 2 | **Partner-admin context** | `/partner/*` endpoints | `platform_partner_admin.partner_id` for the authenticated user | authoritative |
| 3 | **Verified custom hostname** | unauthenticated: auth screens, public document/khata pages, `/public/branding` | `Host` header matched against `platform_partner.hostnames[]` **where the host is verified** | advisory |
| 4 | **Reserved subdomain of the platform apex** | same as 3, dev and staging | `<code>.app.udhaarbook.in` → partner with that `code` | advisory |
| 5 | **Explicit query parameter** | `/public/branding?host=`, `/manifest?partner=`, local development | `?partner=<code>` or `?host=<host>` | advisory, read-only endpoints only |
| — | **Fallback** | everything else | `metis` | — |

Rules that make this safe:

- **Strategy 1 always wins.** Once a request is authenticated against a tenant, the tenant's `partner_id` is the partner, full stop. The `Host` header is never allowed to change the partner of an authenticated tenant, because that would let a hostile host header re-brand a session. The only thing the host does for an authenticated request is decide whether the session is *allowed on this host at all* (§24.3.5).
- **Strategies 3–5 never set tenant context.** They resolve branding and nothing else. `X-Tenant-Id` is not trusted (Part 22 §22.1) and neither is `Host`. A partner resolved from a hostname grants zero data access.
- **Unverified hostnames resolve to `metis`.** A hostname added but not yet DNS-verified serves default branding (WLB-03 FR-10 / §10 validation). This prevents a partner from claiming a domain they do not control and having the platform serve their brand on it.
- **Path prefixes are not a resolution strategy.** They were considered and rejected: `/{partner}/…` pollutes every route, breaks cookie scoping (cookies are host-bound, not path-bound, for our purposes), breaks the PWA scope, and makes the `metis` case asymmetric. A partner that cannot get a subdomain gets strategy 4 on `*.app.udhaarbook.in`.
- **`X-UB-Partner` header is not a resolution strategy** in production. It is accepted **only** when `settings.DEBUG` is true, for local development against a single hostname, and its acceptance is gated by an explicit `ALLOW_PARTNER_HEADER` setting that is asserted false in the production settings test (`T-DEPLOY-3`, Part 28 §28.3.9).

### 24.3.2 The middleware chain

Order matters and is fixed. `MIDDLEWARE` in `config/settings/base.py`, business-relevant entries only:

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "platform.middleware.RequestIdMiddleware",        # 1. X-Request-Id in/out, log context
    "platform.middleware.PartnerResolutionMiddleware", # 2. request.partner  (never fails the request)
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "platform.middleware.JwtCookieMiddleware",         # 3. cookie → Authorization for browser clients
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "platform.middleware.TenantContextMiddleware",     # 4. request.tenant from tid claim; re-resolves partner
    "platform.middleware.PartnerStatusMiddleware",     # 5. 403 partner_suspended
    "platform.middleware.AuditContextMiddleware",      # 6. actor/ip/ua into thread-local for the service layer
    "platform.middleware.LoggingMiddleware",
]
```

Responsibilities, precisely:

**(2) `PartnerResolutionMiddleware`** sets `request.partner` using strategies 3–5 plus the fallback. It never raises and never 4xx's: an unknown host yields `metis`. It writes `request.partner_source ∈ {'host', 'subdomain', 'query', 'default'}` for logging and for the `ub.whitelabel.branded_login_viewed` event. It reads from the partner config cache (§24.3.3), so the common case is a dict lookup with no query.

**(4) `TenantContextMiddleware`** sets `request.tenant` from the validated `tid` claim, sets the tenant-scoped manager's thread-local, and then **overwrites `request.partner` with `request.tenant.partner`** (strategy 1). It also records `request.partner_source = 'tenant'`. For `/partner/*` routes it instead sets `request.partner` from `platform_partner_admin` (strategy 2) and leaves `request.tenant` as `None`; a `/partner/*` route that finds a `tid` claim ignores it.

**(5) `PartnerStatusMiddleware`** returns `403 {"error": {"code": "partner_suspended", …}}` when `request.partner.status == 'suspended'` and the path is a tenant business endpoint. It exempts `/auth/logout`, `/system/health`, `/system/version`, `/public/*` and the Metis support hostname, so a suspended partner's merchants can still log out, still read a shared document link, and still be reached by support (WLB-02 FR-5). Suspension marks the partner, never the tenants — reactivation is a single field change with no fan-out.

Everything downstream (DRF permissions, serializers, services) reads `request.partner` and never re-derives it. Two helpers are the only sanctioned accessors:

```python
from platform.context import current_partner, current_tenant   # thread-local, set by middleware
```

Service-layer code called from a management command (the scheduler, §24.7.4) has no request; it must pass the partner explicitly or use `tenant.partner`. `current_partner()` raises `ContextNotSet` outside a request, which is deliberate — it turns "the scheduler silently used the wrong partner" into a crash in tests.

### 24.3.3 Caching partner configuration

Partner rows are read on essentially every request and change essentially never (≤ 100 partners expected, WLB-02 §20). The cache is therefore aggressive and in-process, with **no Redis** (ADR-012, ADR-021).

```python
# platform/services/partner_cache.py
_CACHE: dict[str, tuple[float, PartnerConfig]] = {}      # key: partner code OR "host:<hostname>"
_TTL_SECONDS = 300
_VERSION_KEY = "partner_config_version"                   # a row in platform_tenant_setting-like kv, tenant_id NULL
```

Design, normative:

1. **Two indexes, one payload.** The cache is keyed by partner `code` and by `host:<hostname>`; both point at the same immutable `PartnerConfig` dataclass (frozen, slots) holding the columns the request path needs: `id, code, name, status, branding, allowed_modules, default_plan_id, support_contact, settings_public`. Secrets are **not** in the payload: `settings.messaging.*.credentials_ref` is carried (it is a name), the credential itself is never read from the database (WLB-06 FR-1).
2. **TTL 300 s, plus explicit invalidation.** Any write through `PartnerService` bumps a global `partner_config_version` integer and clears the in-process dict of the writing worker. Other workers notice within one TTL. A 5-minute worst-case propagation for a logo change is acceptable and is documented in the partner console UI ("Changes appear for merchants within 5 minutes").
3. **Warm on boot, never cold-fail.** The first request after boot populates the dict. If the database is unreachable, the middleware falls back to a hardcoded `metis` `PartnerConfig` so that `/system/health` and the error pages still render with a sane theme.
4. **Per-worker, not shared.** With docker-compose's single `backend` service and Gunicorn's handful of workers, per-worker duplication costs a few kilobytes. When the deployment grows past a handful of workers (Part 29 §29.10), the same interface is satisfied by a shared cache with no caller change — `partner_cache.get(code)` is the only API.
5. **Negative caching.** An unknown host is cached as "unknown" for 60 s, so a spray of random `Host` headers cannot turn into a query storm.

Measured budget: partner resolution ≤ 1 ms P99 on a cache hit; ≤ 20 ms on a miss (WLB-03 §5).

### 24.3.4 Fallback when resolution fails

Failure modes and the required behaviour:

| Situation | Behaviour | Never |
|---|---|---|
| Unknown / spoofed `Host` | `metis` branding; `partner_source='default'`; the host is **not** added to `ALLOWED_HOSTS` | 500; leaking that a host exists |
| Host registered but unverified | `metis` branding; partner console shows "Pending" | serving partner branding on an unproven domain |
| Partner row missing for a tenant (data corruption) | 500 with `request_id`, alert; the FK makes this impossible in practice | silently substituting `metis` for an authenticated tenant |
| Partner `suspended` | 403 `partner_suspended` on business endpoints, with the **Metis** support contact (not the suspended partner's) | locking the merchant out of logout or of shared public links |
| Partner cache stale after an edit | old value for ≤ 300 s | inconsistent values within one request (config is snapshotted at request start) |
| Database down at boot | hardcoded `metis` default config; health endpoint reports degraded | rendering an unstyled page |

The single rule underneath the table: **resolution failure degrades to the product default, never to another partner.** There is no "nearest partner", no "first active partner", no inheritance between partners.

### 24.3.5 Hostname, login and the multi-partner user

A user with memberships under two partners logging in on a partner host is the interesting case (WLB-03 FR-4, BR-2):

1. `POST /auth/otp/verify` succeeds. The server resolves the host's partner `P`.
2. `tenants[]` in the response is filtered to memberships whose `tenant.partner_id == P.id`.
3. Memberships under other partners are returned as `other_partner_tenants: [{ name, partner_name, partner_login_url }]` — name and destination only, no ids, no balances.
4. The client shows "Your business *Sharma Traders* is on **khata.otherbank.in**" with a link (`auth.wrongPartner.*` copy keys).
5. `POST /auth/switch-tenant` to a tenant of another partner from this host → 403 `wrong_partner_host` with `details.login_url` (WLB-03 FR-5), audited as `auth.wrong_partner_host`.
6. The Metis default host is universal and lists every tenant regardless of partner (WLB-03 FR-6, BR-3) — this is the support and ops path, and the reason a partner outage never strands a merchant.

Cookies are host-bound, so a session established on `khata.examplebank.in` simply does not exist on `app.udhaarbook.in`; no cross-host token reuse is possible and none is attempted (WLB-03 §19).

---

## 24.4 Theming

### 24.4.1 What the pipeline already gives us

Part 23 defines the pipeline: Koper tokens are authored as CSS custom properties in `tokens/*.css`, aliased to the shadcn variable names `ml-uikit` reads, and mapped into `tailwind.config.js` as `hsl(var(--x) / <alpha-value>)`. Because every colour is an HSL triple behind a variable, **runtime theming is a matter of setting a handful of custom properties on `<html>`** — no rebuild, no stylesheet swap, no CSS-in-JS.

White-labelling therefore has exactly one job: produce a small, validated set of custom-property assignments and get them onto the document before first paint.

### 24.4.2 The overridable token subset

Normative. Anything not in this table is **not** overridable by anyone, at any level, ever.

| Token group | Tenant may override | Partner may override | Derived from | Rationale for the boundary |
|---|---|---|---|---|
| `--primary-50…900` | ✅ (one hex → ramp) | ✅ (one hex → ramp) | `primary_hex` | The brand colour is the whole point |
| `--accent`, `--accent-hover`, `--accent-press`, `--accent-quiet`, `--accent-line`, `--border-focus` | ✅ (derived) | ✅ (derived) | `--primary-*` | Must move with the brand or buttons and focus rings disagree |
| `--secondary-50…900` | ✅ (document accents only) | ✅ | `secondary_hex` | Used on print templates; not on app chrome |
| `--surface-nav` | ❌ | ✅ (P2, WLB-05) | `theme.nav_hex` | A bank's navigation rail is a strong brand surface; contrast-checked |
| `--radius-xs…xl` | ❌ | ✅ (P2, WLB-05) | `theme.radius_scale` | Shape is brand; three curated scales, not a free number |
| `--font-ui`, `--font-display` | ❌ | ✅ (P2, WLB-05) | `theme.font_ui/display` | Must carry Devanagari; validated |
| Logo, favicon, app name | ✅ | ✅ | attachments / text | Identity |
| Document header / footer | ✅ | ✅ (default) | text | Identity |
| Legal footer | ❌ | ✅ | text | Attribution is a compliance and support requirement |
| `--canvas`, `--surface-*` (other than nav) | ❌ | ❌ | — | Contrast guarantees are computed against these; a free canvas invalidates every ratio in Part 23 §23.6 |
| `--success`, `--warning`, `--error`, `--info` and their `-bright`/`-dim` | ❌ | ❌ | — | **Ledger semantics.** Red = you gave / receivable, green = you got. A partner recolouring these would change what a number means |
| `--text-*` | ❌ | ❌ | — | Paired with fixed surfaces for AA |
| `--viz-1…8` | ❌ | ❌ | — | Chart series identity; `--viz-1` tracks `--primary-500` automatically |
| Spacing, elevation, motion | ❌ | ❌ | — | No brand value, high regression risk |

This is deliberately the narrowest set that still produces a product a bank will put its name on. Everything excluded is excluded because a mistake there produces either an accessibility failure or a *semantic* failure, and a ledger product cannot afford the second.

### 24.4.3 Deriving the ramp from one hex

One hex in, ten stops out. The algorithm is specified here because it must produce **identical** output in TypeScript (`src/utils/theme.ts`) and in Python (`platform/services/theme.py`) — the server renders the initial CSS payload, the client recomputes on live edit, and the two must not disagree by a rounding step. Test `T-WLB-01-1` asserts equality across five fixture hexes.

```
hexToHslRamp(hex):
  (h, s, l) = rgbToHsl(hex)                       # h ∈ [0,360), s,l ∈ [0,1]
  # Saturation is preserved but floored so near-grey brands still read as a brand,
  # and capped so a neon brand does not produce unusable mid stops.
  s' = clamp(s, 0.35, 0.92)
  L  = { 50: .970, 100: .910, 200: .800, 300: .660, 400: .540,
         500:  l  ,                                                  # the brand hex itself
         600: .440, 700: .340, 800: .240, 900: .140 }
  # If the supplied hex is unusually light or dark, the neighbouring stops are
  # re-spread so the ramp stays monotonic (no stop may be lighter than the one before).
  L = enforce_monotonic(L, step_min = .035)
  for each stop k: emit  --primary-<k>: "<h> <s'*100>% <L[k]*100>%"   # bare HSL triple, no hsl()
  --accent        = var(--primary-500)   (light)  /  var(--primary-400)  (dark)
  --accent-hover  = var(--primary-600)   (light)  /  var(--primary-300)  (dark)
  --accent-press  = var(--primary-700)   (light)  /  var(--primary-500)  (dark)
  --accent-quiet  = hsl(h s' 54% / .10)  (light)  /  .16                 (dark)
  --accent-line   = hsl(h s' 54% / .35)
  --border-focus  = var(--primary-500)   (light)  /  var(--primary-300)  (dark)
  --viz-1         = var(--primary-500)
```

Values are emitted as bare `H S% L%` triples because `tailwind.config.js` wraps them in `hsl(var(--x) / <alpha-value>)` (Part 23 §23.2.5). Emitting `#RRGGBB` would break every opacity utility in the app, which is a failure mode worth naming explicitly because it is the most likely implementation mistake in this chapter.

### 24.4.4 Contrast validation

Validation happens **server-side on write**, in `platform/services/theme_validator.py`, mirrored by `scripts/check-contrast.mjs` for the CI token check and by `src/utils/theme.ts` for the live indicator in the branding form. All three implement WCAG 2.x relative luminance and the `(L1 + 0.05) / (L2 + 0.05)` ratio; a shared fixture file `tests/fixtures/contrast_cases.json` is asserted by both a Python test and a Jest test so drift is impossible.

The checks, with thresholds:

| # | Check | Threshold | Applies at | Error |
|---|---|---|---|---|
| C1 | `primary_hex` vs `#FFFFFF` (the card surface) | ≥ 3:1 | tenant and partner, MVP | 400 `low_contrast` |
| C2 | `--text-inverse` (#FFFFFF) on `--accent` fill | ≥ 4.5:1 | tenant and partner, MVP | 400 `low_contrast` |
| C3 | nav text (`#F4F6F8`) on `theme.nav_hex` | ≥ 4.5:1 | partner, P2 | 400 `theme_invalid` |
| C4 | `secondary_hex` vs `--surface-card` | ≥ 3:1 | partner, P2 | 400 `theme_invalid` |
| C5 | `--error` / `--success` / `--warning` against `theme.nav_hex` when used as nav badges | ≥ 3:1 | partner, P2 | 400 `theme_invalid` |
| C6 | Derived `--primary-600` (hover) vs white | ≥ 3:1 | both, derived | 400 `low_contrast` |
| C7 | Custom font covers U+0900–U+097F (Devanagari) | coverage | partner, P2 | 400 `font_missing_devanagari` |

C1 is the one that fires in practice. A merchant picks their signboard yellow `#FFD400`, which is 1.3:1 against white; the response is not a bare rejection but a **usable suggestion**:

```json
{ "error": { "code": "low_contrast", "message": "Too light for buttons.",
    "details": { "ratio": 1.32, "required": 3.0, "suggested_hex": "#8A6D00" } } }
```

`suggested_hex` is computed by holding hue and saturation and walking lightness down in 1% steps until the ratio clears 3.05:1 (a hair above the threshold so the suggestion itself never round-trips into a rejection). The UI shows "Too light for buttons. Try #8A6D00" with a one-tap accept (`branding.colour.lowContrast` copy key). This turns an accessibility rule into a design assist, which is the only way a rule like this survives contact with merchants.

**Safe-fallback behaviour at render time.** Validation on write is not sufficient, because rows can pre-date a rule and partners can be imported. The renderer is therefore defensive: `build_theme_payload()` re-runs C1, C2 and C6 on the resolved values, and on failure emits the **product default ramp** for that key, logs `theme.fallback_applied` with the partner/tenant id and the failing check, and raises an in-app notification to the owner. A broken brand colour degrades to a working blue product, never to an unreadable one.

### 24.4.5 Serving the theme without a flash

Flash of unbranded content is the defect that makes white-labelling feel fake, so the mechanism is specified end to end.

**Server-rendered path (primary).** `app/layout.tsx` is a server component. On every request it:

1. Reads the `Host` header and, for authenticated requests, the tenant id from the `ub_access` cookie claims.
2. Calls `GET /public/branding?host=<host>` (unauthenticated case) or reads the branding already embedded in the session bootstrap (authenticated case). Both are cache-backed, ≤ 20 ms.
3. Renders the payload as a `<style>` block in `<head>`, **before** any stylesheet link:

```html
<style id="ub-theme">
:root{
  --primary-50:213 84% 97%;  --primary-100:213 84% 91%;  --primary-200:213 84% 80%;
  --primary-300:213 84% 66%; --primary-400:213 84% 54%;  --primary-500:213 68% 45%;
  --primary-600:213 68% 44%; --primary-700:213 68% 34%;  --primary-800:213 68% 24%;
  --primary-900:213 68% 14%;
  --accent:var(--primary-500); --accent-hover:var(--primary-600); --accent-press:var(--primary-700);
  --accent-quiet:hsl(213 68% 45% / .10); --accent-line:hsl(213 68% 45% / .35);
  --border-focus:var(--primary-500); --viz-1:var(--primary-500);
  --radius-xs:4px; --radius-sm:6px; --radius-md:10px; --radius-lg:14px; --radius-xl:20px;
  --surface-nav:210 19% 13%;
  --font-ui:"Inter","Noto Sans Devanagari",system-ui,sans-serif;
}
</style>
<link rel="icon" href="/files/partner/ab12…/favicon.png">
<link rel="manifest" href="/manifest?partner=examplebank">
```

The block is ≤ 1.2 kB for a tenant theme and ≤ 4 kB with WLB-05 extensions (WLB-05 §5), which is cheaper than the round trip it replaces. It carries `Cache-Control: private, no-store` on authenticated responses and `public, max-age=300, Vary: Host` on the unauthenticated auth pages.

**Client transition path.** When the user switches tenant or saves new branding, no reload occurs: `whiteLabelSlice` receives the new branding, `ThemeProvider` (`components/layout/ThemeProvider.tsx`, the BrandHub `DSThemeProvider` pattern) recomputes the ramp with the same `hexToHslRamp` and writes the properties onto `document.documentElement` in a single `requestAnimationFrame`. Measured budget ≤ 5 ms (WLB-01 §5).

**Cache path (belt and braces).** `ThemeProvider` also writes the computed payload to `localStorage` under `ub_theme_cache:<tenant_id>` and an inline head script reads it synchronously on boot. The cache is **keyed by tenant id and cleared on tenant switch and on logout** (WLB-01 EC-6) — a stale cache showing the previous shop's colour for 200 ms is exactly the bug this whole section exists to prevent. The cache is a fallback for the offline/PWA cold start, not the primary path; if the server block and the cache disagree, the server block wins because it is applied later in document order.

### 24.4.6 A worked partner theme

"Example Bank" resells UdhaarBook as **SmartKhata** to its current-account merchants. The partner row:

```json
{
  "code": "examplebank",
  "name": "Example Bank Ltd",
  "status": "active",
  "allowed_modules": ["platform","parties","ledger","inventory","sales","purchases",
                      "payments","expenses","reports","notifications","import_export","help"],
  "default_plan_id": "…uuid of plan 'partner_standard'…",
  "hostnames": ["khata.examplebank.in"],
  "support_contact": { "phone": "+911800123456", "whatsapp": "+919000000001",
                       "email": "smartkhata@examplebank.in", "hours": "Mon–Sat 9:00–19:00" },
  "branding": {
    "$schema_version": 2,
    "logo_attachment_id": "018f2c4e-…",
    "favicon_attachment_id": "018f2c52-…",
    "primary_hex": "#0B5C3B",
    "secondary_hex": "#B8860B",
    "app_name": "SmartKhata",
    "doc_footer": "Thank you for banking with Example Bank.",
    "legal_footer": "SmartKhata is powered by UdhaarBook (Metis Labs B.V.). Example Bank Ltd is not a party to transactions recorded in this book.",
    "locked_keys": ["primary_hex", "app_name", "logo"],
    "theme": {
      "radius_scale": "sharp",
      "font_ui": "inter", "font_display": "inter",
      "nav_hex": "#07301F",
      "status": "approved"
    }
  },
  "settings": {
    "allowed_plan_ids": ["…partner_standard…", "…partner_plus…"],
    "max_overrides": { "max_users": 10, "max_parties": 5000, "max_invoices_per_month": 2000, "storage_mb": 2000 },
    "hostname_verified": { "khata.examplebank.in": true },
    "messaging": {
      "sms":      { "provider": "msg91", "sender_id": "EXBSKT", "dlt_entity_id": "1101234567890123456",
                    "credentials_ref": "MSG91_EXAMPLEBANK" },
      "whatsapp": { "provider": "cloud_api", "phone_number_id": "1098…", "waba_id": "2233…",
                    "credentials_ref": "WA_EXAMPLEBANK" },
      "email":    { "provider": "smtp", "from_domain": "smartkhata.examplebank.in",
                    "from_name": "SmartKhata", "credentials_ref": "SMTP_EXAMPLEBANK" },
      "rates": { "sms_inr": "0.18", "wa_utility_inr": "0.85", "wa_auth_inr": "0.12" },
      "tenant_editable_templates": ["reminder_manual"]
    }
  }
}
```

Resolution consequences for a merchant "Gupta Kirana" under this partner who has uploaded their own shop logo and set `doc_header = "Gupta Kirana — Since 1994"`:

| Key | Resolved value | Source | Why |
|---|---|---|---|
| `app_name` | `SmartKhata` | partner | locked; the merchant's field is disabled with a lock icon |
| `primary_hex` | `#0B5C3B` | partner | locked |
| `logo` | Example Bank mark | partner | locked — merchant's uploaded logo is retained but not used in app chrome |
| `doc_header` | `Gupta Kirana — Since 1994` | tenant | not locked |
| `doc_footer` | `Thank you for banking with Example Bank.` | partner | merchant has not set one |
| `legal_footer` | Example Bank / Metis attribution line | partner (always) | never tenant-overridable |
| `--radius-*` | sharp scale (2/3/5/7/10) | partner theme | WLB-05 |
| `--surface-nav` | `#07301F` | partner theme | passes C3 at 12.1:1 |
| `--success` / `--error` | Part 23 fixed values | default | never overridable |

Generated ramp for `#0B5C3B` (h≈157, s≈0.79, l≈0.20): because the supplied lightness (20%) is darker than the nominal 500 stop, `enforce_monotonic` re-spreads 600–900 downward (600 .170, 700 .135, 800 .105, 900 .075) and leaves 50–400 at their nominal lightnesses with the brand's hue and saturation. C1 passes at 8.9:1, C2 at 8.9:1, C6 at 10.4:1. The merchant's *bill* shows their own header line and the bank's footer; the merchant's *app* is entirely the bank's. That is the intended commercial outcome, and it is produced by data.

---

## 24.5 Domains and certificates

### 24.5.1 The custom-domain flow (WLB-03, Phase 2)

```
PA adds host ──▶ platform stores it unverified ──▶ PA sets DNS ──▶ hourly job verifies
      │                     │                          │                    │
      │                     │                    _ub-verify TXT       verify_partner_hostnames
      │                     │                    CNAME → apex               │
      └── default branding served throughout ────────────────────────▶ Verified: partner branding live
```

Step by step, normative:

1. **Claim.** `POST /partner/hostnames { "host": "khata.examplebank.in" }`. Validated against `^(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$`, lowercased, and checked for global uniqueness across all partners — a host already claimed returns 409 `hostname_in_use` (WLB-03 §10). Maximum 5 hostnames per partner. The row is appended to `platform_partner.hostnames[]` and `settings.hostname_verified[host] = false`.
2. **Instructions.** The response carries a verification token (32 hex chars, derived as `HMAC-SHA256(settings.SECRET_KEY, partner_id + host)[:32]` so it is stable and needs no storage) and the two records the partner must create:
   - `TXT  _ub-verify.khata.examplebank.in  →  <token>`
   - `CNAME khata.examplebank.in            →  ingress.udhaarbook.in`
3. **Verification.** `manage.py verify_partner_hostnames` runs hourly from the scheduler (Part 29 §29.3). For each unverified host it resolves the TXT record using the standard library resolver, compares to the expected token, and on match sets `settings.hostname_verified[host] = true`, writes audit `partner.hostname_verified`, raises the in-app notification `partner.hostname_verified` to partner admins, and bumps the partner config version so the cache picks it up within 5 minutes. A manual "Check now" button calls `POST /partner/hostnames/{host}/verify`, rate-limited to 1/min (WLB-03 EC-1).
4. **Activation.** A verified host is added to the dynamic `ALLOWED_HOSTS` set (`ALLOWED_HOSTS = static_list + verified_hostnames_from_cache`, WLB-03 FR-7) and starts resolving to the partner in `PartnerResolutionMiddleware`. Until then it serves `metis` branding, which is a correct, working product — the merchant sees an unbranded but functional login rather than an error.
5. **Removal.** `DELETE /partner/hostnames/{host}` is always allowed. Branding reverts to default for that host immediately; existing sessions are unaffected because sessions are bound to the host's cookies and the tenant's partner FK is what drives post-login branding (WLB-03 BR-4).

### 24.5.2 Certificates

TLS is a deployment concern, not an application concern (WLB-03 FR-7) — the application only validates `Host` against the verified list. The deployment contract, specified fully in Part 29 §29.8:

| Environment | Termination | Certificate source | Renewal |
|---|---|---|---|
| Local dev | none (plain HTTP on `localhost:3000` / `:8000`) | — | — |
| Local dev, multi-host testing | `nginx` container | `mkcert` local CA, committed to `.gitignore`d `ops/certs/` | manual |
| Staging | `nginx` container | Let's Encrypt HTTP-01 via `certbot` in a sidecar, single wildcard `*.staging.udhaarbook.in` | certbot timer |
| Production, platform apex | `nginx` | Let's Encrypt, `app.udhaarbook.in` + `*.app.udhaarbook.in` (DNS-01 for the wildcard) | certbot timer, 30-day margin |
| Production, partner custom domain | `nginx` | Let's Encrypt HTTP-01, issued **per verified hostname** | certbot timer; issuance triggered by the ops runbook §24.10.1 step 6 |

Issuance for a partner domain is a deliberate, manual ops step at Phase 2, gated on verification having already succeeded. Automating ACME from the application (an API call that provisions a certificate) is Phase 3 and needs an ADR, because it introduces an ACME client dependency and a write path from partner-controlled input to the TLS layer. The trade is explicit: one ops step per partner domain (partners are ≤ 100 and domains ≤ 5 each) versus a new dependency and a new attack surface. At this scale the ops step wins.

Certificate expiry is a named runbook (Part 29 §29.11). The monitoring signal is a daily scheduler job `check_certificate_expiry` that reads the certificate files from the nginx volume and writes a `platform_job` result plus a log line at WARNING when any certificate is inside 21 days; there is no external monitoring dependency at MVP (ADR-018).

### 24.5.3 The partner-branded login page

The auth screens are the only place the product is seen before a tenant exists, so they are the only place where hostname-derived branding is the *primary* source rather than a fallback.

- `app/(auth)/layout.tsx` is a server component. It calls `GET /public/branding?host=<Host>` (cached 5 min, `Vary: Host`, unauthenticated) and injects the theme block, the favicon link and `<link rel="manifest" href="/manifest?partner=<code>">`.
- The rendered page shows: partner logo (or product mark), partner `app_name` in the heading, the primary ramp on the OTP button and focus rings, the partner `legal_footer` at the bottom, and a support link built from `support_contact` (`wa.me` deep link, `tel:`, or `mailto:` in that order of preference).
- `GET /public/branding` returns only `{partner_code, app_name, logo_url, primary_hex, theme_live, legal_footer, support_contact}` — no tenant data, no counts, no ids (WLB-03 §19). An unknown host returns the `metis` payload with HTTP 200, never a 404, so the endpoint cannot be used to enumerate partner domains.
- The PWA manifest is served per partner at `/manifest?partner=<code>` with `name`, `short_name`, `theme_color` and icons generated from the partner logo at 192 px and 512 px by Pillow and cached as attachments. Installing from a partner host scopes the PWA to that origin; switching partner domains means a reinstall, which is correct and is documented (WLB-03 EC-4).
- After login the tenant's own resolution takes over (strategy 1). A merchant whose tenant is under `examplebank` sees SmartKhata branding on `app.udhaarbook.in` too — the support host is universal but not un-branded.

**Local-development equivalent.** Partner hostnames must be testable on one machine with no DNS. Three mechanisms, in order of preference:

1. **`/etc/hosts` + the `nginx` compose profile.** `ops/compose/nginx.dev.conf` maps `khata.examplebank.localhost`, `app.udhaarbook.localhost` and `metis.localhost` to the frontend container. Modern browsers resolve `*.localhost` to loopback without a hosts file on most systems; the hosts entries are documented for those that do not. `mkcert` supplies a locally trusted certificate so cookie `Secure` behaviour matches production.
2. **`?partner=<code>` query parameter** on `/public/branding` and `/manifest`, honoured in every environment because those endpoints are read-only and return no secrets.
3. **`X-UB-Partner` header**, honoured **only** when `DEBUG and ALLOW_PARTNER_HEADER`, for API-level testing with `curl` and for the E2E suite's partner scenarios. Production settings assert both false.

DNS verification is stubbed in development: `manage.py verify_partner_hostnames --force` marks the hosts verified without a resolver call, and the seed command `seed_demo_partner` creates a second partner with a verified `*.localhost` host so the cross-partner isolation tests (§24.8.2) have real fixtures.

---

## 24.6 Partner administration

### 24.6.1 What the partner console is

The partner admin console (WLB-04, Phase 2) lives at `app/(partner)/partner/**` and is backed by the `/partner/*` API namespace. It is visible when `/auth/me` returns a `partner_admin` object, which is populated from `platform_partner_admin` (CCR-16). It is a different surface from the super-admin console (PLT-14, `/admin/*`) and from the tenant app, and the three never share a queryset.

Capabilities:

| Capability | `partner_owner` | `partner_support` | Notes |
|---|---|---|---|
| List / search own tenants (name, GSTIN, mobile) | ✅ | ✅ | `GET /partner/tenants`, same row shape as `/admin/tenants` |
| View tenant profile and usage counters | ✅ | ✅ | profile + counters only; no business data |
| Change tenant plan (within `allowed_plan_ids`) | ✅ | ✅ | reason required |
| Set entitlement overrides (within `max_overrides` ceilings) | ✅ | ✅ | 403 `partner_ceiling_exceeded` above ceiling |
| Suspend / reactivate a tenant | ✅ | ✅ | reason required; banner names the partner |
| Request consented support access (impersonation) | ✅ | ✅ | `POST /partner/tenants/{id}/access-request` |
| Edit partner profile: branding, support contact, messaging | ✅ | ❌ | |
| Manage hostnames | ✅ | ❌ | |
| Invite / remove partner admins | ✅ | ❌ | a partner must keep ≥ 1 `partner_owner` |
| Save a draft theme (WLB-05) | ✅ | ❌ | SA approves |
| Export tenant list as CSV | ✅ | ✅ | profile + counters only |
| View partner-scoped audit log | ✅ | ✅ | `GET /partner/audit-logs` |
| Read parties, ledger, invoices, payments of any tenant | ❌ | ❌ | **structurally impossible** — §24.8 |
| Change ceilings, `allowed_modules`, partner status | ❌ | ❌ | SA only |

### 24.6.2 The partner-scoped permission set

Partner permissions are **not** tenant permission codenames. They are a separate, small, closed set enforced by a single DRF permission class, because reusing tenant codenames would invite a future bug where a tenant role accidentally satisfies a partner check.

```
partner.tenants.read        partner.tenants.entitlements     partner.tenants.suspend
partner.tenants.access      partner.profile.manage           partner.hostnames.manage
partner.admins.manage       partner.messaging.manage         partner.theme.manage
partner.usage.read          partner.audit.read
```

| Codename | `partner_owner` | `partner_support` |
|---|---|---|
| `partner.tenants.read`, `partner.usage.read`, `partner.audit.read` | ✅ | ✅ |
| `partner.tenants.entitlements`, `partner.tenants.suspend`, `partner.tenants.access` | ✅ | ✅ |
| `partner.profile.manage`, `partner.hostnames.manage`, `partner.admins.manage`, `partner.messaging.manage`, `partner.theme.manage` | ✅ | ❌ |

Enforcement is two-layered and both layers are mandatory:

```python
class IsPartnerAdmin(BasePermission):
    required_codename: str          # declared per view

    def has_permission(self, request, view):
        pa = getattr(request, "partner_admin", None)
        return pa is not None and pa.status == "active" \
               and view.required_codename in PARTNER_ROLE_PERMISSIONS[pa.role]


class PartnerScopedQuerysetMixin:
    """Every /partner/* view MUST inherit this. Tested by T-WLB-04-1 and the
    endpoint-coverage test in Part 28 §28.2.1, which fails if any /partner/*
    view class lacks it."""
    def get_queryset(self):
        return super().get_queryset().filter(partner_id=self.request.partner_admin.partner_id)
```

A tenant of another partner returns **404, never 403** (WLB-04 BR-1), matching canon rule 2 — existence is not disclosed across a scope boundary.

### 24.6.3 What a partner may see about a tenant

Exhaustive, normative. The `/partner/tenants/{id}` serializer has an explicit allow-list of fields; adding a field to it requires a code review checklist item (§24.10.3).

**May see:** tenant id, name, legal name, business type, GST type, GSTIN, state, city, phone, email, status, created date, onboarding completion, plan code, entitlement overrides, `enabled_modules`, member count, last activity timestamp, and the usage counters `parties_count`, `items_count`, `invoices_this_month`, `ledger_entries_last_30d`, `storage_mb_used`, `sms_sent_this_month`, `whatsapp_sent_this_month`.

**May never see:** any party name, mobile or balance; any ledger entry; any invoice, bill, payment, expense or its amounts; any item name, price or stock; any report output; any attachment; any receivable, payable or revenue total. Counters are **counts and volumes, never money**, with one exception that is deliberately excluded: there is no `total_sales_value` counter and none may be added, because a distributor knowing its retailers' turnover is precisely the commercial sensitivity that would make merchants distrust the product.

**May see with consent, time-boxed:** everything the impersonated member's role can see, through the PLT-14 consent flow (§24.6.5).

### 24.6.4 Tenant provisioning and suspension

**Provisioning.** Three paths, all converging on the same service:

1. *Self-serve on a partner host* — the merchant signs up at `khata.examplebank.in`; `POST /tenants` stamps `partner_id` from the host (WLB-03 FR-4a, BR-1) and `plan_id` from `partner.default_plan_id`.
2. *Partner-initiated invite* — the partner admin creates an invitation for a mobile number; the merchant completes onboarding themselves. The partner never sets the merchant's password and never holds their credentials.
3. *Bulk provisioning* — Phase 3, via the partner API. Not at MVP or Phase 2; bulk onboarding is done by giving the partner's field staff the signup link.

There is deliberately **no path where a partner creates a fully formed tenant and hands over the login.** The merchant always authenticates with their own mobile and OTP. This keeps the DPDP consent chain intact (the merchant is the data fiduciary for their parties' data, not the partner) and keeps the audit log's actor meaningful.

**Suspension.** `PATCH /partner/tenants/{id} {status: "suspended", reason}` sets `platform_tenant.status = 'suspended'`. Behaviour, identical to super-admin suspension except for attribution:

- All business writes return 403 `tenant_suspended`; reads continue so the merchant can see and export their data (DPDP: suspension for non-payment must not be data destruction).
- A `UbStatusBanner` names the suspending party: "Service paused by Example Bank. Contact +91 1800 123 456." — the partner's support contact, not Metis's.
- `POST /tenants/current/export` still works.
- Reactivation is a single field change; nothing is deleted, no data migration occurs.
- Partner suspension of a tenant is distinct from **partner** suspension (§24.3.2 item 5), which is a Metis action against the partner and shows the Metis contact.

### 24.6.5 Audit requirements for partner actions

**Every** partner action that touches a tenant writes a `platform_audit_log` row. This is not negotiable and is the mechanism by which the isolation promise is auditable rather than merely asserted.

| Action | `action` | `actor_type` | `tenant_id` | before/after | reason |
|---|---|---|---|---|---|
| Plan changed | `partner.tenant_plan_changed` | `partner_admin` | the tenant | plan codes | required |
| Overrides changed | `partner.tenant_overrides_changed` | `partner_admin` | the tenant | override dict | required |
| Tenant suspended / reactivated | `partner.tenant_suspended` / `.reactivated` | `partner_admin` | the tenant | status | required |
| Support access requested | `partner.access_requested` | `partner_admin` | the tenant | scope, expiry | required |
| Support access granted / denied | `partner.access_granted` / `.denied` | `user` (the owner) | the tenant | — | — |
| Impersonation session started / ended | `partner.impersonation_started` / `.ended` | `partner_admin` | the tenant | session id, duration | — |
| Any write during impersonation | the normal action code | `partner_admin` | the tenant | normal snapshot | — |
| Partner profile / branding / theme / messaging updated | `partner.profile_updated`, `partner.theme_saved`, `partner.messaging_updated` | `partner_admin` | **NULL** | before/after **minus secrets** | — |
| Hostname added / verified / removed | `partner.hostname_*` | `partner_admin` / `system` | NULL | host | — |
| Partner admin invited / removed | `partner.admin_invited` / `.removed` | `partner_admin` | NULL | role | — |

Rules:

- `actor_type` gains the value `partner_admin` (CCR-16). A row with `actor_type='partner_admin'` and a non-null `tenant_id` is, by construction, a partner touching a merchant — and `GET /audit-logs` in the **tenant's own** console shows it, so the merchant can see everything their partner did to their account. This is the single most important trust property in the chapter: partner actions are visible to the merchant, not only to Metis.
- `reason` (≥ 5 chars) is mandatory on every entitlement, plan, status and access action, stored in `metadata.reason`, and surfaced in the merchant's audit view.
- Impersonation requires the PLT-14 consent flow: the owner receives an in-app and SMS request naming the partner and the purpose, approves it explicitly, and the session is time-boxed (default 60 minutes), announced by a persistent banner in the merchant's own UI for the duration, and terminated by either side. Access is never granted by a partner's unilateral action.
- Secrets never enter the audit log: `credentials_ref` names are recorded, credential values are not read from the database at all (WLB-06 FR-1) and therefore cannot leak into a snapshot.

---

## 24.7 Branded communications

### 24.7.1 The resolution chain for an outbound message

Every outbound message passes through one function (WLB-06 FR-3):

```python
notifications.services.send(tenant, code, to, vars, channel=None)
```

which resolves, in order:

1. **Partner** = `tenant.partner` (strategy 1 — a message is always sent in the context of a tenant, so the host plays no part).
2. **Channel config** = `partner.settings.messaging[channel]`. If `provider` is `None` → the message log row is written with `status='skipped'`, `error='provider_not_configured'`, and the function returns. **It never falls back to another partner's config and never falls back to Metis's** (WLB-06 BR-1). At MVP every partner's `sms.provider` is `console`, which logs the rendered message (ADR-015).
3. **Template** = `notifications_template` resolved tenant → partner → global by `(code, channel, locale)` (Part 21 §21.3.2, WLB-06 FR-2). Locale falls back `hi → en` within each level before descending a level.
4. **Credentials** = `os.environ[config['credentials_ref']]`. Credentials are never stored in the database; the database stores the *name* of the environment variable (WLB-06 FR-1). A missing environment variable is treated as an unconfigured provider (`skipped`), never as a crash.
5. **Enqueue** = a `platform_job` row (`kind='message.send'`) drained by `manage.py run_scheduler` (ADR-012). Only the `console` backend sends inline, because it cannot fail or block.

### 24.7.2 SMS and DLT

Indian transactional SMS requires DLT registration: an **entity ID** (the sender organisation), a **sender header** (6 uppercase letters), and a **template ID** per registered message body. The rendered message must match the registered template exactly, with variables substituted only inside the registered `{#var#}` slots, or the operator scrubs it.

Consequences for the architecture:

- The DLT identity belongs to the **partner**, not the tenant and not Metis. `sender_id` (`^[A-Z]{6}$`), `dlt_entity_id` and per-template `dlt_template_id` (both `^\d{19}$`) live in the partner record and templates.
- **Template lint** (WLB-06 FR-4) runs at save time: the editable body is compared to the registered text; a mismatch outside variable slots returns 409 `template_mismatch` with a diff. This moves a silent delivery failure (the operator drops the message days later) into a synchronous, explainable error at configuration time.
- Tenants may edit only the templates listed in `partner.settings.messaging.tenant_editable_templates[]`, and only when no `dlt_template_id` is bound (WLB-06 BR-2, EC-1). The merchant-facing copy explains why: "This message is registered with the telecom operator and cannot be changed."
- Merchants are told who sends their messages: Settings → Udhaar & reminders shows "Messages are sent by Example Bank as EXBSKT" (WLB-06 FR-7). A merchant surprised by an unfamiliar sender ID on their customer's phone is a support ticket; naming it pre-empts that.
- Only service-implicit / transactional content is permitted (WLB-06 BR-3); the lint rejects promotional keywords.

### 24.7.3 WhatsApp, email, and the share surfaces

**WhatsApp.** Two distinct mechanisms, and they must not be confused:

- *Manual deep link* (`wa.me`, MVP, ADR-015). The message is composed by the merchant's own WhatsApp account and carries **the merchant's** identity, not the partner's. The partner's role is confined to the text template (`{appName}` resolves to the partner's app name in the share text). No partner configuration is needed and none is used.
- *WhatsApp Business API* (Phase 2, LED-12, WLB-06 FR-5). Messages originate from the **partner's** WABA phone number, use the partner's approved template names, and are categorised `utility` (reminders) or `authentication` (OTP); marketing content is refused by lint. Opt-in is recorded per party (`parties_party.sms_opt_in`, `consent_source`, `consent_at`).

**Email.** `from_domain` and `from_name` come from the partner (`settings.messaging.email`); SPF/DKIM verification is a manual flag at Phase 2. Without a configured email provider the channel is `skipped` — the product never sends mail from a Metis domain on a partner's behalf, because a bank's merchant receiving `noreply@udhaarbook.in` breaks the white-label illusion in the worst possible place.

**Documents and public pages.** Branding on a rendered artefact resolves through §24.2.2 at **render time**, not at issue time (WLB-01 BR-3): branding is presentation, legal content is snapshotted (`party_snapshot`, `supplier_gstin_snapshot`). So:

| Artefact | Logo / colour | Header line | Footer | Legal footer |
|---|---|---|---|---|
| Invoice A4 / thermal (SAL-03) | resolved | tenant `doc_header` | tenant `doc_footer` | partner `legal_footer`, always last |
| Statement (LED-04) | resolved | tenant | tenant | partner |
| Payment receipt (PAY-04) | resolved | tenant | tenant | partner |
| Public document page `/public/d/{token}` | resolved server-side from the token's tenant | tenant | tenant | partner |
| Public khata page `/public/khata/{token}` (P2) | same | tenant | tenant | partner |
| In-app inbox and push | partner `app_name` | — | — | — |

Public pages are unauthenticated and are rendered server-side with the tenant's resolved branding (WLB-01 EC-5); the logo is served through a short-lived signed URL (15 min) rather than an authenticated `/files/{id}`, so the customer's browser can render it without a session and the URL cannot be farmed.

### 24.7.4 Cost attribution

`notifications_message_log` carries `tenant_id`, and the tenant carries `partner_id`, so every message is attributable to both. `cost` is populated from the partner's rate card (`settings.messaging.rates`) at send time and corrected from provider callbacks where available. `GET /partner/usage` aggregates `messages {sms, whatsapp, email, cost_inr}` per calendar month (WLB-06 FR-6). This is what lets a partner reconcile their provider invoice against merchant activity, and it is the only aggregate of merchant behaviour the partner receives that is not a bare count.

---

## 24.8 Isolation and security

### 24.8.1 The additive-scoping invariant

**Invariant I-1.** For every business queryset in the system, the tenant filter is present. Partner scoping, where it exists, is applied **in addition to** the tenant filter, never instead of it.

There is exactly one place where this could go wrong — a `/partner/*` endpoint that reaches into business data — and it is closed structurally: the `/partner/*` router is mounted on a separate URLconf module (`config/urls_partner.py`) whose views may import only from `platform.selectors.partner_scoped` and may not import any model from `parties`, `ledger`, `inventory`, `sales`, `purchases`, `payments` or `expenses`. This is enforced by an import-graph test (Part 28 §28.3.10):

```python
def test_partner_views_do_not_import_business_models():
    forbidden = {"parties.models", "ledger.models", "inventory.models", "sales.models",
                 "purchases.models", "payments.models", "expenses.models"}
    for module in walk_modules("platform.api.partner"):
        assert not (imported_modules(module) & forbidden), module
```

**Invariant I-2.** A partner never appears in a business queryset filter. `LedgerEntry.objects.filter(partner_id=…)` is impossible because business tables have no `partner_id` column and none may be added. Partner attribution of business data is obtained, when genuinely needed for platform analytics, by joining through `platform_tenant` in a read-only analytics query (Part 31 §31.8) executed by Metis, never by a partner.

**Invariant I-3.** Cross-partner access returns 404. Not 403, not an empty list with a different shape — 404, because a 403 confirms existence (canon §0.11 rule 2, WLB-04 BR-1).

### 24.8.2 Cross-partner leakage tests

These are non-negotiable test classes (Part 28 §28.2) and the fixture that backs them is `two_partners_two_tenants`: partners `alpha` and `beta`, one tenant each, one owner each, one partner admin each, plus seeded parties, ledger entries and invoices in both.

| Test | Assertion |
|---|---|
| `T-ISO-P1` | Partner admin of `alpha` calling `GET /partner/tenants/{beta_tenant_id}` → 404 |
| `T-ISO-P2` | Partner admin of `alpha` calling every `/partner/*` endpoint with `beta` ids → 404 (parametrised over the full URL map, so a new endpoint without scoping fails the suite) |
| `T-ISO-P3` | `GET /partner/tenants` for `alpha` returns exactly the `alpha` tenant set; count matches a direct SQL count filtered by `partner_id` |
| `T-ISO-P4` | No `/partner/*` response body, at any depth, contains a party name, a ledger amount, an invoice number or a money field — asserted by walking the JSON and matching against a forbidden-key list and against known fixture values |
| `T-ISO-P5` | Tenant of `alpha` resolving branding never yields a `beta` asset: assert `logo_url`, `app_name`, `primary_hex`, `legal_footer` and sender IDs against `beta`'s values for inequality |
| `T-ISO-P6` | `alpha` messaging unconfigured → send produces `status='skipped'`, and the `beta` provider is never invoked (mock asserts zero calls) |
| `T-ISO-P7` | Login on `alpha`'s host with a user holding memberships in both → `tenants[]` contains only `alpha`; `other_partner_tenants[]` contains the `beta` entry with name and URL only, no id |
| `T-ISO-P8` | `POST /auth/switch-tenant` to the `beta` tenant from `alpha`'s host → 403 `wrong_partner_host`; from the Metis host → 200 |
| `T-ISO-P9` | Partner suspension of `alpha` does not affect `beta` tenants' endpoints |
| `T-ISO-P10` | A `Host` header claiming `beta`'s hostname on an authenticated `alpha` request does not change the resolved branding or the tenant scope |

`T-ISO-P2` and `T-ISO-P4` are the two that catch regressions introduced by new features, because they are parametrised over the URL map and over response bodies rather than over a hand-written list.

### 24.8.3 The super-admin boundary

A super admin (`platform_user.is_super_admin`) is a Metis employee and is the only actor that crosses partner boundaries. The boundary is drawn as follows:

- Super admins use `/admin/*` (PLT-14). Those endpoints are **not** partner-scoped and are the only unscoped endpoints in the system.
- Super admins may read partner and tenant *profile and usage* data freely. They may **not** read tenant business data without the same consent-and-banner impersonation flow a partner uses — the flow is shared code, and the only difference is `actor_type` (`super_admin` vs `partner_admin`) and the name shown in the banner.
- Every super-admin action writes an audit row with `actor_type='super_admin'`, visible in the affected tenant's own audit log.
- MFA for super admins is Phase 2 (`platform_user.mfa_secret`), as is MFA for partner admins; until then, super-admin accounts are restricted by an IP allowlist on `/admin/*` at the nginx layer in production (Part 29 §29.8).
- There is no "become a partner admin" shortcut. A super admin who needs to see the partner console is added as a `platform_partner_admin` row, which is itself audited.

### 24.8.4 Additional security properties

- **Host header hardening.** `ALLOWED_HOSTS` is the static platform list plus *verified* partner hostnames from the cache. An unverified or unknown host is rejected by Django before any view runs, except on the `/public/branding` and `/system/health` paths which tolerate any host and return defaults.
- **Cookie scoping.** `ub_access` and `ub_refresh` are host-bound with `SameSite=Lax; Secure`. No `Domain=` attribute is set, so a cookie issued on a partner host is never sent to the platform apex or to another partner (WLB-03 §19).
- **Partner asset serving.** Partner logos and fonts are served from the same origin under `/files/partner/<attachment_id>/<name>`, with `Cache-Control: public, max-age=86400, immutable` (the id changes when the asset changes). SVG uploads are rejected outright (WLB-01 FR-6) — sanitising SVG is a dependency and an attack surface neither of which is justified by the benefit.
- **No CSS injection.** Theming emits only validated tokens into a fixed template; no partner-supplied string ever reaches a `<style>` block. Hex values are regex-validated *and* re-parsed into numeric HSL before emission, so even a validation bypass cannot produce arbitrary CSS text.
- **Font handling.** Custom WOFF2 fonts (WLB-05) are parsed by a minimal in-house table reader to verify the `cmap` covers Devanagari; no font library is added (ADR-021). Files are size-capped at 300 kB and served same-origin.
- **Rate limits.** `/public/branding` is limited to 60 req/min per IP; hostname verification to 1/min per host; partner console endpoints inherit the standard 600 req/min per user.

---

## 24.9 Billing and entitlements

### 24.9.1 Plans, features and modules

A **plan** (`platform_plan`) is a global row: `code`, `name`, `modules text[]`, `limits jsonb`, `price_inr_month`, `is_active`. Two are seeded by `manage.py seed_plans` (PLT-15 FR-1):

| Plan | Modules | `max_users` | `max_parties` | `max_invoices_per_month` | `storage_mb` |
|---|---|---|---|---|---|
| `free` | all MVP modules | 1 | 300 | 100 | 200 |
| `unlimited` | all modules | null | null | null | null |

`null` means unlimited. The local single-user deployment seeds `unlimited` as `metis.default_plan_id`, so nothing in the product ever blocks the person the spec is being built for. Commercial plans (`partner_standard`, `partner_plus`, and any self-serve paid tiers) are **partner data, not specification** — they are rows created by ops, and the spec deliberately does not name their prices, because a price in a specification becomes a price in a migration.

**Effective entitlement** for a tenant (PLT-15 FR-2), computed by `services.entitlements.for_tenant(tenant)` and cached per request:

```
modules = plan.modules ∩ partner.allowed_modules ∩ tenant.enabled_modules
          (+ tenant override 'modules_extra', still ∩ partner.allowed_modules)
limit[k] = tenant_override[k]  if present  else  plan.limits[k]         # null = unlimited
```

Module gating is enforced by `ModuleEnabledPermission` on every view of a module app, returning 403 `module_disabled`. It is checked *before* the limit check, so a merchant on a plan without inventory gets "Inventory is not part of your plan", not "You have used 0 of 0 items".

### 24.9.2 Limits and their enforcement points

Reproduced from PLT-15 FR-3 because it is the contract this chapter's commercial model rests on:

| Limit key | Counted as | Enforced at | Behaviour |
|---|---|---|---|
| `max_users` | memberships `status ∈ {active, invited}` | invite, invitation accept, `PATCH status→active` | block |
| `max_parties` | `parties_party` rows `deleted_at IS NULL AND status='active'` | `POST /parties`, restore, import commit | block |
| `max_invoices_per_month` | `sales_document` `kind ∈ {invoice, bill_of_supply}`, `status ≠ draft`, `issued_at` in the current calendar month (tenant timezone) | invoice issue, issue-on-create, estimate convert-and-issue | warn at 80 %, block at 100 % |
| `storage_mb` | Σ `files_attachment.size_bytes` where `deleted_at IS NULL` | every upload | block |
| modules | `enabled_modules` ⊆ effective modules | every module endpoint | 403 `module_disabled` |

**Never enforced, by construction:** ledger entries, payments, expenses, estimates, reads, exports, reminders. The paywall sits at multi-user, stock, server-sent SMS and desktop convenience — never at the act of recording what someone owes you. A limit check appearing on `POST /ledger-entries` is a specification violation and is asserted absent by a test (`T-PLT-15-*`, and the endpoint-coverage test in Part 28 §28.2.2).

Correctness details that matter under concurrency: the check runs **inside the write transaction** with `SELECT … FOR UPDATE` on the `platform_tenant` row (PLT-15 BR-7), so two devices creating the 300th and 301st party serialise and exactly one succeeds (PLT-15 EC-1). The `/auth/me` counters are advisory and ≤ 60 s stale; the server-side check is authoritative.

### 24.9.3 Where the partner sits in the chain

| Actor | May set | Bounded by |
|---|---|---|
| Super admin | plans, `partner.allowed_modules`, `partner.settings.allowed_plan_ids`, `partner.settings.max_overrides` (ceilings), any tenant override | — |
| Partner admin | tenant `plan_id` within `allowed_plan_ids`; tenant overrides within `max_overrides[k]` | 403 `partner_ceiling_exceeded` |
| Tenant owner | `enabled_modules` within effective modules | 403 `module_disabled` |

This is a three-level ceiling system, not a three-level override system, and the distinction is the whole design: a partner can be generous within a budget Metis sets, and cannot be generous beyond it. A ceiling lowered below an existing override leaves the override in place and blocks further raises (WLB-04 EC-2) — never a silent downgrade of a merchant the partner has already promised something to.

### 24.9.4 Upgrade, downgrade and non-payment

**Upgrade** is a plan change plus, optionally, cleared overrides. It takes effect on the next request; there is no provisioning step, because entitlements are computed, not materialised.

**Downgrade** follows PLT-15 FR-8 and BR-3: usage above the new limit is **tolerated, never trimmed**. A merchant dropping from 5,000 to 300 parties keeps all 5,000, can read, edit and archive them, and simply cannot create the 5,001st. The nightly `reconcile_entitlements` command trims `enabled_modules` to the effective set and notifies owners (`plan.modules_trimmed`); a trimmed module's data is retained and becomes visible again the moment the module is re-enabled (WLB-02 EC-1). **No data is ever deleted as a consequence of a commercial event.** This is a hard rule, and it is what makes the product safe to resell: a partner ending a contract cannot destroy a merchant's book.

**Non-payment** is Phase 3 as a billing mechanism (PLT-16) but its *effect* is specified now so that it is built into the state machine rather than bolted on:

1. **Grace.** The tenant remains fully functional; a banner names the amount and the partner's contact.
2. **Read-only suspension** (`tenant.status = 'suspended'`). Writes → 403 `tenant_suspended`; reads, statements, PDFs and `POST /tenants/current/export` all continue to work. The merchant can always get their data out. A suspended tenant's public share links continue to resolve, because the merchant's customers are not party to the commercial dispute.
3. **Dormancy.** After a long suspension the tenant is flagged for deletion only through the ordinary PLT-10 path: an owner-initiated request with a 30-day cool-off, or a documented ops action with notice. **Non-payment never triggers automatic deletion.**

Partner-level non-payment (Metis versus the partner) suspends the *partner* (§24.3.2 item 5), which makes the partner's merchants read-only with Metis's support contact shown — the merchants are visibly not the ones at fault, and Metis, not the absent partner, is reachable.

---

## 24.10 Operations

### 24.10.1 Partner onboarding runbook

Numbered, in order. Steps 1–5 are MVP; 6–11 are Phase 2 and are skipped for a referral partner.

1. **Create the plan(s)** if the partner needs a bundle that does not exist: `POST /admin/plans` with modules and limits. Verify with `GET /admin/plans`.
2. **Create the partner**: `POST /admin/partners` with `code` (lowercase, immutable), `name`, `allowed_modules` (must include `platform`, `parties`, `ledger`), `default_plan_id`, `support_contact` (phone, WhatsApp, email, hours). Status `active`.
3. **Set ceilings**: `PATCH /admin/partners/{id}` with `settings.allowed_plan_ids[]` and `settings.max_overrides{}`. A partner with no ceilings set can raise nothing — the default is an empty dict, which is refusal, not permission.
4. **Upload branding**: `PUT /admin/partners/{id}/branding` (multipart) with logo, `primary_hex`, `app_name`, `doc_footer`, `legal_footer`, `locked_keys[]`. The contrast check runs here; a failing colour returns `suggested_hex`.
5. **Smoke-test the default path**: create a throwaway tenant under the partner, confirm `/auth/me` returns the partner's branding, support contact and plan, then delete it via the ops path. Confirm the legal footer prints on a test invoice.
6. **Register hostname(s)**: `POST /partner/hostnames`; hand the partner the TXT and CNAME records.
7. **Wait for verification** (hourly job, or "Check now"). Confirm `settings.hostname_verified[host] == true`.
8. **Issue the certificate** for the verified host (Part 29 §29.8) and reload nginx. Confirm HTTPS and the branded login page.
9. **Create partner admins**: `POST /partner/admins` for at least one `partner_owner`. They log in with their own mobile via the ordinary OTP flow.
10. **Configure messaging** (WLB-06): provider, sender ID, DLT entity, credential env var names; add the env vars to the deployment; register templates and run lint; send a test message to the partner admin's own mobile.
11. **Theme approval** (WLB-05), if the partner has gone beyond the primary colour: partner saves a draft, previews, requests approval; SA reviews the contrast checklist and approves.

Rollback at any step is a field change: set `status='suspended'`, remove a hostname, clear `branding`. Nothing in onboarding writes to business tables, so nothing in onboarding needs a data rollback.

### 24.10.2 Configuration checklist

Before a partner is declared live, all of the following must be true. This is a literal checklist for the ops runbook.

- [ ] `code` is lowercase, stable, and used nowhere in application code
- [ ] `name` is the legal entity name as it should appear in the legal footer
- [ ] `allowed_modules` ⊇ {`platform`, `parties`, `ledger`} and ⊆ the modules the partner has actually agreed to support
- [ ] `default_plan_id` points at an active plan whose limits the partner's support desk understands
- [ ] `support_contact` has at least one reachable channel; the WhatsApp number is a real business number (it appears in every limit dialog)
- [ ] `branding.legal_footer` names both the partner and Metis Labs and disclaims the partner's involvement in recorded transactions
- [ ] `branding.locked_keys[]` matches the commercial agreement — locking is visible to merchants as a disabled field, so it must be intentional
- [ ] Contrast checks C1, C2, C6 pass for `primary_hex` (and C3–C5 for a WLB-05 theme)
- [ ] Logo is PNG/JPEG/WebP (never SVG), ≥ 64 px, ≤ 2 MB, and legible on the dark navigation rail
- [ ] `settings.max_overrides` and `allowed_plan_ids` are set (empty = the partner can grant nothing)
- [ ] At least one `partner_owner` admin exists and has logged in successfully
- [ ] Hostname verified, certificate issued, branded login page renders with no flash of unbranded content
- [ ] Messaging: sender ID registered, DLT templates linted clean, credential env vars present in the deployment, test message delivered
- [ ] Cross-partner isolation smoke test run against the live environment with two tenants under two partners
- [ ] An entry exists in the partner register (`ops/partners.md`) recording the contract, the ceilings and the ops contact

### 24.10.3 Guardrails in CI

Three checks keep the "partner is data" rule true as the codebase grows, and all three fail the build:

1. **No partner strings.** `grep -rE "\b(metis|examplebank|…)\b"` over `apps/` and `src/` excluding seeds, fixtures and tests must return nothing. The partner register supplies the code list.
2. **Import graph.** `/partner/*` view modules may not import business models (§24.8.1).
3. **Serializer allow-list.** The `/partner/tenants/{id}` serializer's field set is asserted against a frozen list; adding a field requires updating the list in the same commit, which puts it in front of a reviewer.

### 24.10.4 Phase mapping

| Feature | Phase | Delivered in this chapter as | Depends on |
|---|---|---|---|
| **WLB-01** Tenant branding | **MVP** | §24.2 resolution, §24.4 theming, §24.4.4 contrast, §24.4.5 no-flash serving | files app, Part 23 tokens |
| **WLB-02** Partner configuration | **MVP** | §24.1 commercial model, §24.2 object model, §24.2.4 schema, §24.9 entitlement chain, §24.10.1 runbook | PLT-14, PLT-15, CCR-14 (nullable `files_attachment.tenant_id` for partner assets) |
| **WLB-03** Partner domain & login page | Phase 2 | §24.3 request resolution, §24.5 domains and certificates, §24.5.3 branded login | CCR-15 (`GET /public/branding`), deployment TLS |
| **WLB-04** Partner admin console | Phase 2 | §24.6 partner administration, §24.8.2 isolation tests, §24.8.3 super-admin boundary | CCR-16 (`platform_partner_admin`, `/partner/*`, `actor_type='partner_admin'`) |
| **WLB-05** Theme tokens & typography | Phase 2 | §24.4.2 overridable subset (partner column), §24.4.4 checks C3–C7, §24.8.4 font handling | CCR-17 (`files_attachment.kind='font'`) |
| **WLB-06** Partner-branded messaging | Phase 2 | §24.7 branded communications, §24.7.4 cost attribution | CCR-18 (`/partner/templates`, messaging webhooks), NTF-02/05/06 |

**What must be built at MVP even though the feature is Phase 2.** Three things, because retrofitting them is a rewrite rather than an addition:

1. **`PartnerResolutionMiddleware` and `request.partner`**, with strategies 1 and the `metis` fallback wired. Strategies 3–5 are added in Phase 2 by extending one function.
2. **The `resolve()` function and the `source` field in every branding response.** The tenant → partner → default chain is MVP behaviour (WLB-01 FR-2); adding partner locks in Phase 2 is a set membership test.
3. **The messaging send function's partner-config lookup**, even though every partner's provider is `console` at MVP. The `skipped` / never-fall-back-to-another-partner semantics (WLB-06 BR-1) must be in the code path from day one, or the first real provider integration will inherit a fallback that leaks identity.

Everything else — hostnames, the partner console, extended themes, real messaging providers — is genuinely additive and is deferred without cost.
