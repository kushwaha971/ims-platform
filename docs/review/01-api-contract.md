# 01 — API contract audit: frontend ⇄ backend

**Scope.** Every path `frontend/src` actually calls, against every route reachable from
`backend/config/urls.py`. Read-only; no code was changed. Evidence is cited `file:line` on
both sides. Audit date 2026-09-19, against the working tree at `/home/claude/repo`.

---

## Verdict

The two sides do not currently agree on the session payload, on the onboarding PATCH body, or
on the one response header the client was just taught to consume — and each of those three
disagreements fails on the **first real request of a normal session**, not in an edge case.
`GET /auth/me` never emits the top-level `enabled_modules` the client destructures, so
`sessionSlice` throws `TypeError` spreading `undefined` on every authenticated page load. The
onboarding wizard sends `null` for every optional field the merchant left blank, and DRF
rejects `null` on all of them, so steps 2 and 3 always 400 — and the handler that is supposed
to render that 400 crashes on DRF's nested `details`. The `X-Tenant-Id` stale-tab guard is
emitted on exactly the two responses where the client's store is *expected* to disagree with
it, so it rejects the tenant switch it was built to protect, and is emitted on none of the
responses it was actually meant to police. Below that line the news is better: the envelope,
the pagination meta, the error-code registry, money-as-decimal-string, CSRF, the refresh
single-flight and `Accept-Language` all genuinely line up, and there is no double
case-conversion anywhere — `caseMapper`'s bulk helpers are not wired into the transport at all.

Almost all of this is one-sided: the frontend is ahead of the backend on three shapes
(`enabled_modules` placement, `membership_id`, `support_contact`) and the **docs side with the
backend** on the first of those. Where code and `docs/22-api-specification.md` disagree, the
disagreement is named per finding.

| Severity | Count |
|---|---|
| Blocking | 4 |
| Major | 5 |
| Minor | 7 |
| **Total** | **16** |

---

## Endpoint status

### Endpoints the frontend actually calls

`API_PATHS` declares 60-odd paths; only these 13 have a call site. The rest are declarations
(see "Orphans" below) and cannot 404 because nothing requests them.

| Method + path | Frontend call site | Backend route | Status |
|---|---|---|---|
| `POST /auth/register` | `authService.ts:140` | `urls_auth.py:42` | **agrees** |
| `POST /auth/login` | `authService.ts:170` | `urls_auth.py:43` | **agrees** (server takes `email`, `serializers/auth.py:75-88`) |
| `POST /auth/refresh` | `AxiosInstances.ts:146` | `urls_auth.py:44` | **agrees** |
| `POST /auth/logout` | `authService.ts:269` | `urls_auth.py:45` | **agrees** |
| `GET /auth/me` | `authService.ts:228`, `planService.ts:54` | `urls_auth.py:46` | **mismatched** — B-2, M-3, M-8, m-6 |
| `POST /auth/switch-tenant` | `authService.ts:262` | `urls_auth.py:47` | **mismatched** — B-1 |
| `POST /auth/password/set` | `authService.ts:188` | `urls_auth.py:48` | **agrees** |
| `POST /auth/password/reset/request` | `authService.ts:208` | `urls_auth.py:50` | **agrees** |
| `POST /auth/password/reset/confirm` | `authService.ts:217` | `urls_auth.py:55` | **agrees** |
| `POST /tenants` | `onboardingService.ts:92` | `platform_app/urls.py:23` | **mismatched** — B-1 (add-business path), M-5 |
| `PATCH /tenants/current` | `onboardingService.ts:111,132,159` | `platform_app/urls.py:24` | **mismatched** — B-3, B-4, m-4 |
| `PATCH /memberships/{id}` | `tenantSwitcherService.ts:26` | `platform_app/urls.py:26` | **orphan in practice** — M-3 (id is always `null`) |
| `DELETE /memberships/{id}` | `tenantSwitcherService.ts:43` | `platform_app/urls.py:26` | **orphan in practice** — M-3 |
| `GET /parties` | `partyService.ts:77` | `parties/urls.py:10` | **mismatched** — m-1, m-2 |

### Backend routes with no caller

| Route | View | Note |
|---|---|---|
| `GET /tenants/current` | `views/tenant.py:114` | The wizard only PATCHes. Reasonable to keep — the shell will read it. |
| `POST /auth/email/verify/request` | `views/auth.py:363` | Plumbing-only by design (`urls_auth.py:17-19`). No client screen. |
| `POST /auth/email/verify/confirm` | `views/auth.py:388` | Same. Not in `API_PATHS` at all. |
| `POST /invitations/{token}/accept` | `views/tenant.py:180` | PLT-05 lands later; no client path declared. Stated reason to exist. |
| `GET /parties/{id}` | `views/party.py:54` | `API_PATHS.PARTY` declared, never called. Router-generated. |
| `GET /api/v1/system/{health,ready,version}` | `common/views.py` | `SYSTEM_HEALTH` is only referenced as an auth-free path (`AxiosInstances.ts:37`); nothing probes it. |
| `GET /api/v1/` (DRF api-root) | `DefaultRouter` in `parties/urls.py:9` | Unintended public surface; `SimpleRouter` would remove it. |

### Frontend paths declared with no backend

`apps/{expenses,files,help,imports,inventory,ledger,notifications,payments,purchases,reports,
sales,tax}/urls.py` are all `urlpatterns: list = []`. Every `API_PATHS` entry for those
modules — ledger, items, invoices, payments, reports, imports, attachments, taxes,
`/public/d/{token}` — resolves to nothing. **This is not a defect**: none has a call site, and
the empty modules are explicitly Sprint-0 placeholders. It becomes a defect the moment a
feature is wired up, which is why it is listed rather than dismissed.

---

## Findings, in severity order

### B-1 — BLOCKING. The stale-tab guard rejects the tenant switch it exists to protect

**What is wrong.** The response interceptor discards any response whose `X-Tenant-Id` differs
from the tab's current `session.activeTenant.id`. The backend emits that header on exactly two
responses: `POST /auth/switch-tenant` and `POST /tenants`. Both are responses whose whole
purpose is to move the tab to a *different* tenant, so at the moment they arrive the store
still holds the old one and the comparison is guaranteed to differ.

**Evidence.**
- Client: `frontend/src/api/AxiosInstances.ts:202-215` — `if (active !== null && active !== echoed) { host?.onTenantMismatch(echoed); return Promise.reject(...) }`.
- Client: `frontend/src/redux/store.ts:116` — `getActiveTenantId: () => store.getState().session.activeTenant?.id ?? null`, i.e. the *pre-switch* tenant.
- Client: `frontend/src/redux/slice/sessionSlice.ts:178-180` — the store only moves on `switchTenant.fulfilled`, which cannot fire because the POST was rejected.
- Client: `frontend/src/modules/DigiKhaato/features/auth/api/authService.ts:261-264` — `await api.post(AUTH_SWITCH_TENANT, …)` throws before `getSession()` runs.
- Server: `backend/apps/platform_app/views/auth.py:260` — `response["X-Tenant-Id"] = str(membership.tenant_id)` (the **new** tenant).
- Server: `backend/apps/platform_app/views/tenant.py:98` — same, on `POST /tenants`.

**What breaks and when.** The first time a user with two businesses picks the other one. The
switch is rejected, `onTenantMismatch` fires a "switched in another tab" warning
(`store.ts:117-124`) and reloads the page after 600 ms — back into the *original* tenant. The
same happens on "Add business" (`TenantSwitcherMenu.tsx:164`,
`TenantChooserPageContent.tsx:66`) for anyone who already has one, because `activeTenant` is
non-null there too. Only a user's very first tenant creation escapes.

This is invisible in development and fatal in production: dev is cross-origin
(`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1`, `.env.example:160`) and
`CORS_EXPOSE_HEADERS` is unset (see M-2), so the browser hides the header and the guard never
runs. Production is same-origin behind nginx (`nginx/conf.d/app.conf:82,97` proxy `/api/` and
`/` from one host), so the header is readable and the guard fires.

**Smallest correct fix.** Exempt the two tenant-*changing* endpoints from the guard — they are
the authority on the new tenant, not a stale echo of an old one. In
`AxiosInstances.ts:202`, skip the check when
`config.url` is `API_PATHS.AUTH_SWITCH_TENANT` or `API_PATHS.TENANTS`. (Fixing it on the
server by not emitting the header there would defeat `PLT-04 FR-4`'s test at
`test_switch.py:52` and `test_onboarding.py:173`, and would not help M-1.)

---

### B-2 — BLOCKING. `GET /auth/me` has no top-level `enabled_modules`; the session reducer spreads `undefined`

**What is wrong.** `getSession()` reads `data.enabled_modules` with **no fallback** and the
reducer spreads it. The server puts modules inside the active-tenant summary, not at the top
level.

**Evidence.**
- Client: `frontend/src/modules/DigiKhaato/features/auth/api/authService.ts:252` — `enabledModules: data.enabled_modules,` (contrast line 119 in `toAuthResult`, which *does* have `?? []`).
- Client: `frontend/src/modules/DigiKhaato/features/auth/api/authService.ts:78` — typed `readonly enabled_modules: readonly ModuleCode[]` (non-optional).
- Client: `frontend/src/redux/slice/sessionSlice.ts:121` — `state.enabledModules = [...payload.enabledModules];`.
- Server: `backend/apps/platform_app/selectors/session_payload.py:117-126` — the payload keys are `user, tenants, active_tenant_id, active_tenant, permissions, plan_limits, feature_flags, sessions`. No `enabled_modules`.
- Server: `backend/apps/platform_app/selectors/session_payload.py:84` — modules live at `active_tenant.enabled_modules`.
- Docs: `docs/22-api-specification.md:343` — "`GET /auth/me` → user, memberships, **active tenant summary (`enabled_modules`, …)**". **The docs and the backend agree; the client is wrong.**

**What breaks and when.** Every authenticated page load. `[...undefined]` throws
`TypeError: undefined is not iterable` inside the `fetchSession.fulfilled` reducer; RTK
dispatches `finalAction` outside its own try/catch, so the throw escapes `dispatch()` and the
session never reaches `authenticated`. It also lands on `switchTenant.fulfilled`,
`setDefaultTenant.fulfilled`, `leaveTenant.fulfilled` and `completeOnboarding.fulfilled`
(`sessionSlice.ts:154-176`), all of which funnel through the same case reducer. Even if the
spread were made safe, `useNavigation.ts:33` calls `enabledModules.includes(...)` and would
throw next.

This is masked by the frontend suite because the fixtures invent the field:
`authService.test.ts:46` and `:244` put `enabled_modules` at the top of `data`.

**Smallest correct fix.** In `authService.ts:252`, read it from where the server and the spec
both put it: `enabledModules: data.active_tenant?.enabled_modules ?? []`, and widen
`SessionApiResponse['data']['active_tenant']` (`authService.ts:71-75`) to carry
`enabled_modules`. Update the two test fixtures to the real shape at the same time, or they
will keep hiding the next instance of this.

---

### B-3 — BLOCKING. `PATCH /tenants/current` rejects `null`; onboarding steps 2 and 3 always 400 on a blank field

**What is wrong.** The wizard's shared validator normalises an empty input to `null`
(`optionalText`), the services send those `null`s verbatim, and every optional field on
`TenantUpdateSerializer` and `AddressSerializer` is a `CharField`/`EmailField` **without**
`allow_null=True`, so DRF answers `"This field may not be null."`.

**Evidence.**
- Client: `frontend/src/hooks/useValidationSchemas.ts:103-109` — `optionalText` transforms `''` → `null`; used for `legalName` (`onboardingSchemas.ts:109`), `line1…district` (`:116-119`).
- Client: `frontend/src/modules/DigiKhaato/features/onboarding/api/onboardingService.ts:117` — `gstin: input.gstType === 'unregistered' ? null : input.gstin`; `:118-119` send `legal_name`/`pan` raw; `:135-143` send the five address keys, `phone` and `email` raw.
- Client: `frontend/src/modules/DigiKhaato/features/onboarding/hooks/useOnboarding.ts:249-251` — **Skip** on step 2 sends `{gstType:'unregistered', gstin:null, legalName:null, pan:null}`; `:261-266` — **Skip** on step 3 sends all five address keys `null` plus `email:null`.
- Server: `backend/apps/platform_app/serializers/tenant.py:70-78` — `legal_name`, `gstin`, `pan`, `phone`, `email` are `required=False, allow_blank=True` with no `allow_null`.
- Server: `backend/apps/platform_app/serializers/tenant.py:37-47` — `AddressSerializer`'s five fields, same.
- Verified against this repo's DRF: a serializer with `CharField(required=False, allow_blank=True)` fed `None` returns `{'gstin': ['This field may not be null.']}` even with `partial=True`.

**What breaks and when.** The first merchant who presses **Skip for now** on step 2 — which
`PLT-03 FR-10` documents as the normal path for an unregistered business — or who leaves
address line 2 empty on step 3. Both are 400 `validation_error`, the wizard cannot advance,
and the account is stranded at `onboarding_step` 1 or 2. Note the server's own service layer
*expects* `None` here (`services/onboarding.py:390` sets `payload["gstin"] = None` for
unregistered; `serializers/tenant.py:97-99` coerces `''` → `None`) — the serializer is simply
stricter than the code behind it.

**Smallest correct fix.** Add `allow_null=True` to `legal_name`, `gstin`, `pan`, `phone`,
`email` in `TenantUpdateSerializer` and to all five `AddressSerializer` fields. That matches
what `validate()` already does with `''` and is the only spelling in which a PATCH can *clear*
a field.

---

### B-4 — BLOCKING. `applyServerErrors` throws on DRF's nested `details`

**What is wrong.** `applyServerErrors` assumes every `details` value is an array and calls
`.join(' ')` on it. DRF nests a child serializer's errors as an object, so
`details.address` is `{line1: [...], pincode: [...]}` and `.join` is not a function.

**Evidence.**
- Client: `frontend/src/utils/applyServerErrors.ts:22-23` — `Object.entries(error.details).forEach(([wireField, messages]) => { const message = messages.join(' ');`.
- Client: typed as `Record<string, readonly string[]>` at `frontend/src/types/api.types.ts:70`, which is what makes the assumption look safe.
- Server: `backend/apps/common/exceptions.py:140-145` — `details: exc.detail` is passed through verbatim from DRF, nesting included.
- Server: `backend/apps/platform_app/serializers/tenant.py:76` — `address = AddressSerializer(required=False)`, the nesting.
- Caller: `frontend/src/modules/DigiKhaato/features/onboarding/hooks/useOnboarding.ts:240-241` — the step-3 `validation_error` branch calls it.

**What breaks and when.** Any step-3 validation failure — including every one caused by B-3,
since `address` is declared before `phone` in the serializer and therefore comes first in
`Object.entries`. The `catch` block that was meant to *display* the failure throws instead, so
the merchant gets an unhandled rejection and a form that neither advances nor explains itself.

Two smaller problems sit in the same place: the step-3 form fields are flat (`line1`,
`pincode` — `OnboardingAddressStep.tsx:63-80`) while the wire path is nested
(`address.line1`), and `ADDRESS_FIELDS` in `useOnboarding.ts:65` omits `'address'`, so even a
well-formed nested error could never anchor to its control.

**Smallest correct fix.** In `applyServerErrors.ts:22`, flatten before mapping: if the value
is an array, use it; if it is a plain object, recurse with `` `${wireField}.${childKey}` `` as
the path; otherwise `String(value)`. `snakeToCamelPath` (`caseMapper.ts:32`) already handles
dotted paths. Then strip the `address.` prefix for the wizard, or add `'address'` to
`ADDRESS_FIELDS`, so those messages land on a control rather than at form level.

---

### M-1 — MAJOR. `X-Tenant-Id` is not emitted on the responses CCR-3 was written for

**What is wrong.** The change request the client implemented says "every tenant-scoped
response echoes the token's `tid`". Two views set the header; no middleware does. Every
ordinary tenant-scoped response — `GET /auth/me`, `GET /parties`, `PATCH /tenants/current` —
carries no `X-Tenant-Id` at all.

**Evidence.**
- Server: the only two emitters are `backend/apps/platform_app/views/auth.py:260` and `backend/apps/platform_app/views/tenant.py:98` (exhaustive grep across `backend/apps`).
- Server: `backend/apps/common/middleware.py:64-66` — `TenantContextMiddleware` sets `X-Tenant-Scope: 1`, explicitly "**never the tenant id**".
- Client: `frontend/src/api/AxiosInstances.ts:189-201` — the comment claims "Every tenant-scoped response echoes the token's `tid` as `X-Tenant-Id` (CCR-3)".

**What breaks and when.** The cross-tenant leak PLT-04 FR-4/AC-4 describes — two tabs, a
switch in one, the other rendering the wrong business's rows — is undefended. The client's
guard is one-sided by design (`:203`, "a backend that has not yet shipped CCR-3's header
changes nothing"), so this fails silent rather than loud. Combined with B-1, the header is
emitted in exactly the wrong place and absent in exactly the right one.

**Smallest correct fix.** Set it once, in `TenantContextMiddleware.__call__`
(`middleware.py:64-67`), alongside `X-Tenant-Scope`, from the resolved tenant — the tenant is
already in hand there. Then B-1's exemption is the only client change needed.

---

### M-2 — MAJOR. No `CORS_EXPOSE_HEADERS`; every custom response header is invisible cross-origin

**What is wrong.** `django-cors-headers` defaults `CORS_EXPOSE_HEADERS` to `[]`. Nothing in
any settings module sets it, so a cross-origin browser cannot read `X-Tenant-Id`,
`Idempotent-Replayed`, `Retry-After`, `X-Request-Id` or the documented `X-RateLimit-*`.

**Evidence.**
- Server: `backend/config/settings/base.py:226-229` — `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_CREDENTIALS`, `CSRF_TRUSTED_ORIGINS` and nothing else; `grep -rn CORS config/settings/*.py` finds no `CORS_EXPOSE_HEADERS`.
- Client: `frontend/src/api/AxiosInstances.ts:202` reads `response.headers['x-tenant-id']`; `frontend/src/utils/apiError.ts:58` reads `x-request-id`.
- Config: `.env.example:160` — dev frontend and backend are on different origins.
- Docs: `docs/22-api-specification.md:31,35` — `Retry-After`-style rate-limit headers and `X-Request-Id` are both contract.

**What breaks and when.** In any deployment where the API is not same-origin. `X-Request-Id`
survives because `toApiError` falls back to the body's `error.request_id`
(`apiError.ts:59-61`) — the others do not. This is also what makes B-1 a production-only
failure, which is the worst shape for a bug to have.

**Smallest correct fix.** In `base.py` beside line 228:
`CORS_EXPOSE_HEADERS = ["X-Request-Id", "X-Tenant-Id", "Idempotent-Replayed", "Retry-After"]`.

---

### M-3 — MAJOR. `membership_id` is missing from `/auth/me`; "Make default" and "Leave business" can never render

**What is wrong.** The tenant switcher acts on the caller's own membership row id. The server's
`tenants[]` rows do not carry one, so `membershipId` is always `null` and both affordances are
gated out.

**Evidence.**
- Server: `backend/apps/platform_app/selectors/session_payload.py:52-63` — the row is `{id, name, role, is_default, status, tenant_status, onboarding_step}`. No `membership_id`, though `m.id` is right there in the loop.
- Client: `frontend/src/modules/DigiKhaato/features/auth/api/authService.ts:248` — `membershipId: row.membership_id ?? null`.
- Client: `frontend/src/modules/DigiKhaato/features/tenant-switcher/view-model/tenantDisplay.ts:70,74` — `canSetDefault`/`canLeave` both begin `Boolean(tenant.membershipId) && …`.
- Client: `frontend/src/modules/DigiKhaato/features/tenant-switcher/components/TenantSwitcherMenu.tsx:154,169` — the menu items are additionally guarded on `active.membershipId`.
- Docs: `docs/22-api-specification.md:335` documents `tenants[]` as `{id, name, role, is_default}` — **the docs are behind the client too.**

**What breaks and when.** PLT-04 FR-5 and FR-7 are dead in the UI from the first session, and
`PATCH`/`DELETE /memberships/{id}` (`platform_app/urls.py:26`) have no reachable caller — which
is why they appear as orphans in the table above. The client fails safe (nothing renders), so
this is major rather than blocking.

**Smallest correct fix.** Add `"membership_id": str(m.id)` to the dict at
`session_payload.py:53-61`, and add the field to `docs/22-api-specification.md:335`.

---

### M-4 — MAJOR. The plan-limit dialog parses `details` as a field map; the server sends scalars

**What is wrong.** `toPlanLimitHit` reads every value as `details[key][0]`, which is correct
only for the `F` (field-map) envelope. `plan_limit_reached` is a `D` envelope: named keys with
their natural JSON types, and one of them is a nested object.

**Evidence.**
- Server: `backend/apps/platform_app/services/entitlements.py:174-187` — `details={"limit_key": "max_users", "limit": 3, "used": 3, "plan_code": "free", "support_contact": {"phone": …, "whatsapp": …, "email": …}}`.
- Client: `frontend/src/modules/DigiKhaato/features/plan/view-model/planDisplay.ts:29,42` — `details[key]?.[0]`.
- Client: `planDisplay.ts:63-76` — reads `'support_contact.phone'` as a **flat** key, which the server never sends.
- Docs: `docs/22-api-specification.md:44` — "`D …` — the named keys listed in the cell, at the top level of `details`, with their natural JSON types (amounts as strings, counts as numbers)". **The backend is right and the client is wrong**, though `docs:61` compounds it by naming the keys `limit, current, maximum` where the backend uses `limit, used` — a docs/code disagreement the client already documents at `plan.types.ts:60-67`.

**What breaks and when.** The first time any tenant hits its member cap. Indexing `[0]` of the
string `"max_users"` yields `"m"` (strings are indexable), which fails `isPlanLimitKey`, so
`limitKey` is `null`; indexing `[0]` of the number `3` is `undefined`, so `limit` and `used`
are both `null`; `plan_code` becomes the single character `"f"`; and the contact block is all
`null`, so `planContactAction` (`planDisplay.ts:96-113`) offers no way to contact anybody. The
dialog degrades to the server's `message` string with a mis-rendered plan name — which is the
one thing PLT-15 FR-6 says it must not do.

**Smallest correct fix.** Give `planDisplay.ts` a reader that accepts a scalar, an array or a
nested object: `const at = (d, path) => path.split('.').reduce(...)`, then `Array.isArray(v) ?
v[0] : v`. Keep the `maximum`/`current` aliases. Widening `ApiErrorShape['details']` to
`Record<string, unknown>` would be the honest type but touches more call sites — B-4's fix
should land first either way.

---

### M-5 — MAJOR. An idempotent replay of `POST /tenants` does not re-issue the auth cookies

**What is wrong.** The decorator replays the stored response body. The cookies — including the
access token carrying the new `tid` — are set by the view *after* it returns, so a replay
carries none of them.

**Evidence.**
- Server: `backend/apps/common/idempotency.py:112-114` — `replay = Response(record.response_body, status=record.response_status)`; returned without calling the view.
- Server: `backend/apps/platform_app/views/tenant.py:99-101` — `tokens.set_auth_cookies(...)` is applied inside `post`, i.e. only on the original execution.
- Server: `backend/apps/platform_app/views/tenant.py:75-76` — the view's own comment: "the wizard's next step is already tenant-scoped, so the token must be too before it is taken."
- Client: `frontend/src/modules/DigiKhaato/features/onboarding/api/onboardingService.ts:80-86` and `hooks/useOnboarding.ts:114` — the key is minted once and reused on every retry, exactly as EC-7 requires.

**What breaks and when.** The scenario EC-7 exists for: the 201 is lost in transit, the user
retries, the tenant is correctly not duplicated — and the browser still holds a token with no
`tid`. The wizard advances to step 2, `PATCH /tenants/current` finds no effective tenant, and
`TenantManagePermission` (`permissions.py:58-59`) returns `False` → 403. The merchant is
locked out of a business that exists.

**Smallest correct fix.** Re-mint and re-set the cookies on the replay path for this scope —
the cleanest seam is to have `TenantCreateView.post` detect `Idempotent-Replayed` and
re-issue, or to store the session id on the idempotency row and let the decorator's caller
re-cookie. Either way the replay must be a complete response, not just a body.

---

### m-1 — MINOR. `display_code` is typed as always present and is never serialized

`frontend/src/modules/DigiKhaato/features/parties/types/party.types.ts:19` declares
`display_code: string | null` (non-optional) and `partyService.ts:44` maps it, but
`backend/apps/parties/serializers/party.py:22-31` omits the field from `fields` — even though
`Party.display_code` exists (`parties/models.py:29`). At runtime it is `undefined`, which both
consumers survive (`partyDisplay.ts:43` uses `??`, `:118` uses `.filter(Boolean)`), so the
only symptom is a party subtitle that silently never shows the code. **Fix:** add
`"display_code"` to the serializer's `fields` tuple.

### m-2 — MINOR. The party list sends `status=` on every request and the server ignores it

`partyService.ts:71` always sends `status` (defaulted to `'active'` at
`partyListSlice.ts:48`), but `PartyFilterSet` declares only `q`
(`backend/apps/parties/filters.py:16-20`) and django-filter drops unknown params. The list is
therefore unfiltered by status while the UI presents it as filtered. `ordering` and `page`/
`page_size` do work (`views/party.py:37`, `settings/base.py:167-170`,
`common/pagination.py:20-35`). **Fix:** add a `status` filter to `PartyFilterSet` — or drop
the param client-side until PTY-02 lands, but do not leave the screen claiming a filter that
is not applied.

### m-3 — MINOR. `meta.warnings[]` carries no `message`, and `state_code` means the opposite of what the client thinks

The server appends `{"code", "field", "gstin_state_code", "state_code"}`
(`backend/apps/platform_app/services/onboarding.py:405-412`); the client types `message` as
required and maps it (`onboardingService.ts:27-34,66-70`), so `warning.message` is always
`undefined`. Worse, the client's `stateCode` is documented as "the state the GSTIN actually
belongs to" (`onboarding.types.ts:51`) but is read from `state_code`, which the server sets to
the state the merchant *chose*; the GSTIN's own state is `gstin_state_code`. Currently
harmless because no component renders `onboarding.warnings` at all (the step components
compute the mismatch banner locally, `OnboardingGstStep.tsx:90`). **Fix:** add `message` to
the server's warning dicts and read `gstin_state_code` in `toWarnings`, or delete the unused
warning plumbing.

### m-4 — MINOR. `plan_limits` has no `support_contact`

`plan_limits_payload` returns `{plan_code, limits, modules}`
(`backend/apps/platform_app/services/entitlements.py:243-247`); `planService.ts:31-36,76`
reads `payload?.support_contact` and degrades to all-`null`. PLT-15 FR-4 makes the partner
contact the dialog's only route to a human, and `tenant.partner.support_contact` is already
read on the 403 path (`entitlements.py:173`). **Fix:** add the same three keys to
`plan_limits_payload`.

### m-5 — MINOR. `unauthenticated` is emitted but is in neither closed registry

`backend/apps/common/error_codes.py:178` adds `"unauthenticated"` outside the main table and
`exceptions.py:224-225` emits it for every `NotAuthenticated`. It does not appear in
`docs/22-api-specification.md` §22.1.1's table (only in prose at `:16`), and it is absent from
`frontend/src/types/api.types.ts:10-56`. §22.1's own rule — "the set of codes the application
emits equals the set documented there" — is therefore false today. No runtime failure: the
client casts the code (`apiError.ts:82`) and toasts the server's message. **Fix:** add the row
to §22.1.1 group B and the member to `ApiErrorCode`.

### m-6 — MINOR. Small `/auth/me` shape drifts that are currently absorbed

`ver` is read at `authService.ts:253` (`data.ver ?? null`) and never sent
(`session_payload.py:117-126`), so `session.version` — documented at `sessionSlice.ts:81` as
the trigger for a permissions re-read — is permanently `null`. `tenants[].timezone` is also
never sent and falls back to `DEFAULT_TENANT_TIMEZONE` (`authService.ts:244`), which is correct
per ADR-011 but means every row in the switcher claims IST. Conversely `active_tenant` is typed
as three fields (`authService.ts:71-75`) and the server sends sixteen
(`session_payload.py:70-86`) — extra keys are harmless but the type is a fiction that will
mislead the next reader. **Fix:** either send `ver` and `timezone`, or delete the client's
reads; and widen the `active_tenant` type to what the server actually emits.

### m-7 — MINOR. Three small transport inaccuracies

(a) `mapStatusToCode(401)` returns `'invalid_credentials'` (`apiError.ts:24-25`), which for a
bodyless 401 puts it in `LOCALLY_PRESENTED` (`:122`) and silently suppresses the toast; `401`
should map to `'unauthenticated'` once m-5 lands. (b) `camelizeKeys`/`snakeifyKeys`
(`caseMapper.ts:22-23`) are exported and used nowhere — the transport deliberately does not
auto-convert and every service hand-maps its own shape, which is why **there is no
double-conversion anywhere**; the dead exports invite someone to wire them in and create one.
(c) `GET /tenants/current` called by a user with no tenant returns 403 `permission_denied`
(`permissions.py:58-59` runs before the view) rather than the `no_active_tenant` the view
intends (`views/tenant.py:116-117`), so a client cannot distinguish "choose a business" from
"you are not allowed".

---

## What agrees (checked, no finding)

Worth stating, because each was a plausible mismatch:

- **Envelope.** `{data, meta?, message?}` / `{error:{code,message,details,request_id}}` — `common/responses.py:19-25`, `common/exceptions.py:183-191`, matched by `api.types.ts:78-92` and consumed correctly at `apiError.ts:80-88`.
- **Pagination meta.** `{page, page_size, total, total_pages}` — `common/pagination.py:27-35` ↔ `partyService.ts:86-91`, `api.types.ts:95-100`. Exact.
- **Money and quantity as decimal strings.** `MoneySerializerField(coerce_to_string=True)` (`common/serializers.py:34-47`) and `COERCE_DECIMAL_TO_STRING = True` (`settings/base.py:179`) ↔ `PartyApiRow.balance: string` (`party.types.ts:23`), kept a string all the way to the view-model. `to_internal_value` even refuses a JSON float (`serializers.py:45-46`), and `amountValidation`/`quantityValidation` produce strings client-side (`useValidationSchemas.ts:112,126`). Clean end to end.
- **Case mapping.** Wire is snake_case, client is camelCase, each service owns its own mapping. No interceptor converts, so nothing can double-convert. Verified by grep: `caseMapper`'s bulk helpers have no caller.
- **CSRF.** Cookie `ub_csrf`, header `X-CSRF-Token`, unsafe methods only — `tokens.py:31`/`authentication.py:13-14,58-59` ↔ `cookieUtils.ts:9,13` and `AxiosInstances.ts:96-99`. Names and casing match; DRF's `csrf_exempt` on `APIView` keeps Django's own middleware out of the way.
- **Cookie vs bearer.** `withCredentials: true` and no `X-Client: api` header client-side, so tokens are never exposed in a body (`views/auth.py:52-58`). Refresh cookie path `/api/v1/auth/refresh` (`tokens.py:32`) matches where the client POSTs.
- **Refresh/401 flow.** Single-flight queue with `_skipAuthRetry`/`_retried` guards (`AxiosInstances.ts:127-158,228-272`) against `RefreshView`'s rotate-and-revoke (`views/auth.py:150-195`); `AUTH_FREE_PATHS` correctly excludes the anonymous doors so a wrong password is not turned into a refresh.
- **`Accept-Language`.** Sent on every request (`AxiosInstances.ts:102`) and honoured: `django.middleware.locale.LocaleMiddleware` is installed (`settings/base.py:73`), `USE_I18N`/`LANGUAGES`/`LOCALE_PATHS` are set (`:142-145`), and the handler forces lazy translation inside the request (`exceptions.py:184`).
- **Idempotency.** `POST /tenants` carries a caller-minted key and the server honours it (`APIPaths.ts:107-121`, `onboardingService.ts:100-103`, `idempotency.py:51-139`) — subject to M-5.
- **`tid` and tenancy.** `X-Tenant-Id` is never *sent* by the client (`AxiosInstances.ts:92-95`) and never *read* by the server (`common/tenancy.py:30`); scoping is the `tid` claim, cross-tenant ids 404 rather than 403 (`common/viewsets.py:43-53`). `epo`/`token_epoch` and `ver`/`permissions_version` invalidation are both implemented and both surface as 401s the client's refresh path already handles (`authentication.py:51-56`, `permissions.py:60-62`).
- **Error codes.** Every code the client branches on — `validation_error`, `invalid_credentials`, `invalid_token`, `gstin_in_use`, `last_owner`, `plan_limit_reached` — has a real raise site. `document_not_draft`, `credit_limit_exceeded` and `insufficient_stock` sit in `LOCALLY_PRESENTED` with no emitter yet, which is correct forward-declaration for unbuilt modules, not a defect.

---

## What I could not check, and why

1. **Nothing was executed.** No server was started and no test suite was run; every finding is
   derived by reading the code. The one dynamic check I did run was an isolated DRF
   serializer against `None` (B-3), because that behaviour is the hinge of the finding and
   worth proving rather than asserting.
2. **Whether the frontend's 622 tests pass today.** I did not run them. I did confirm that at
   least two fixtures encode the wrong `/auth/me` shape (`authService.test.ts:46,244`), which
   is why B-2 is invisible to them; there may be more fixtures papering over M-3 and M-4 the
   same way. A contract test that asserts the client's fixtures against a real serializer
   output would have caught all three.
3. **The 60-odd unimplemented endpoints.** `ledger`, `inventory`, `sales`, `purchases`,
   `payments`, `expenses`, `reports`, `notifications`, `imports`, `files`, `tax` and `help`
   have empty `urlpatterns`, so there is nothing to compare their `API_PATHS` entries or
   `docs/22` sections against. Request and response shapes for those — including whether
   money and quantity stay strings on the write path, where the client's
   `IDEMPOTENT_POST_PATHS` list will actually be honoured, and whether cursor pagination's
   `{next_cursor, has_more}` matches `CursorMeta` — are unverifiable until the views exist.
4. **Actual CORS behaviour in the deployed topologies.** M-2 is read off the settings and the
   library default; I did not observe a real preflight. If a reverse proxy adds
   `Access-Control-Expose-Headers` somewhere I did not look, M-2 shrinks and B-1 gets *worse*
   (it would then also fire in dev). I checked `nginx/conf.d/app.conf` and found no such
   header.
5. **Which onboarding screen, if any, renders `meta.warnings`.** I found no consumer by grep
   (m-3), but a generic banner component could be reading the slice through a selector I did
   not trace.
6. **The `docs/22-api-specification.md` §22.1.1 table as a whole.** I spot-checked the rows
   the client and the backend actually touch. I did not diff all ~150 registry rows against
   `error_codes.py`; `unauthenticated` (m-5) was found incidentally, and there may be other
   divergences in groups D–I where neither side has code yet.
