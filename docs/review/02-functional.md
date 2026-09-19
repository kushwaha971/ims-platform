# Review 02 — Functional and logical correctness

**Scope:** Sprint 0 chassis + Sprint 1 (`PLT-01`, `PLT-02`, `PLT-03`, `PLT-04`, `PLT-15`) and the
parties walking skeleton, against `docs/17-01-frd-platform-parties.md` and `docs/00-canon.md`,
as amended by `DEC-010` (email identity) and `DEC-001` (modules + member count only).
**Method:** code read, not doc read. Every finding cites file and line. Read-only; nothing changed.

---

## Verdict

The money layer, the tenant-scoping primitives and the entitlement narrowing are in good shape —
`apps/common/money.py` is `Decimal`-only with a single `ROUND_HALF_UP` primitive, there is no float
anywhere in a money path, every queryset that can see business rows goes through a `for_tenant`
that returns `none()` on a null tenant, and `DEC-001` was applied to the backend *and* the frontend
with the removed limit keys genuinely unread. What is not in good shape is the **state machine
around tenant creation and tenant identity**. Four independent defects let a user create a
duplicate business, let a stale browser tab write into the wrong business, re-apply the onboarding
preset over an owner's own module choices, and leave invitation acceptance — a path `PLT-04` FR-8
and `PLT-15` FR-3 both depend on — unreachable by any account the MVP sign-up screen can create.
All four sit in code the 1,217 passing tests exercise, and in three of the four a test actively
certifies the wrong behaviour. The password, throttle, session-rotation and preset-table work is
otherwise faithful to the FRD and several places where the spec and the implementation disagree
are ones where the implementation is right.

| Severity | Count |
|---|---|
| Blocking | 4 |
| Major | 4 |
| Minor | 8 |

---

# Blocking

## B1 — Editing onboarding step 1 creates a second business

**Violates:** `PLT-03` FR-9 ("steps already completed are navigable via the stepper for edits"),
FR-2, EC-7; canon §0.11 rule 5.

**What the code does.** The stepper makes a completed step clickable —
`frontend/src/design-system/UbStepper/UbStepper.tsx:117` (`navigable = Boolean(onStepSelect) &&
number <= completed && !isCurrent`) — and `OnboardingStepPageContent` wires it straight to
`goToStep` (`frontend/src/modules/DigiKhaato/features/onboarding/components/OnboardingStepPageContent.tsx:70`).
`stepChanged` permits it: with `completedStep = 1`, `Math.min(1, completedStep + 1) = 1`
(`.../onboarding/redux/onboardingSlice.ts:120-121`).

Step 1's submit handler then has no branch for "a tenant already exists". It calls `createTenant`
unconditionally — `.../onboarding/hooks/useOnboarding.ts:164-188` — which `POST`s `/tenants`
(`.../onboarding/api/onboardingService.ts:88-106`). The idempotency key it carries comes from
`useIdempotencyKey()` (`frontend/src/hooks/useIdempotencyKey.ts:24`), whose `useState` initialiser
mints a **new** key on every mount, and `useOnboarding` is re-mounted by the step route. So the
retry is not deduplicated either.

**What goes wrong.** A merchant on step 2 who realises the business name is misspelled taps
"1 · Business" in the stepper, fixes the name, presses Continue — and now owns two businesses with
almost the same name, the second of which is the active tenant. There is no delete-business path
at MVP (`PLT-10` is unbuilt), so the duplicate is permanent. Same outcome from the sticky Back
button on step 2.

**Smallest correct fix.** In `submitBusinessStep`, branch on `selectOnboardingTenantId`: when it is
non-null, `PATCH /tenants/current {name, business_type, state_code}` (all three are already in
`UPDATABLE_FIELDS`, `backend/apps/platform_app/services/onboarding.py:41-54`) instead of `POST`.

---

## B2 — `POST /tenants`'s idempotency key is scoped by a tenant that the same request changes

**Violates:** `PLT-03` EC-7 ("retry with same `Idempotency-Key` replays the created tenant");
canon §0.11 rule 5.

**What the code does.** The decorator resolves the tenant from the request's own `tid` claim and
uses it as part of the key identity — `backend/apps/common/idempotency.py:72` and the `lookup` /
`create` at `:84-105`. The unique indexes are `(tenant, scope, key)` and, for the tenant-less case,
`(user, scope, key) WHERE tenant IS NULL`
(`backend/apps/platform_app/models/idempotency.py:51-62`).

But `TenantCreateView` re-issues the session cookies with the **new** `tid` before returning
(`backend/apps/platform_app/views/tenant.py:77-101`). So the second attempt of the same logical
action arrives under a different tenant, lands on a different unique tuple, is treated as a fresh
claim, and executes the view again.

* *"Add a business" (FR-6).* Attempt 1 runs under tenant A → row `(A, tenant_create, K)`. The
  response switches the cookie to tenant B. Attempt 2 runs under B → row `(B, tenant_create, K)` is
  new → **business C is created**.
* *First business.* Attempt 1 runs tenant-less → row `(NULL, user, …)`. If the response arrived,
  attempt 2 runs under T1 → new tuple → **a second business**.

**Second failure mode in the same decorator.** When the replay *does* fire (the genuinely lost
response, tenant still null), it is built as a bare `Response(record.response_body, …)`
(`idempotency.py:112-114`) — no `Set-Cookie`, no `X-Tenant-Id`. The client therefore gets a 201
describing a tenant it has no `tid` for, advances to step 2, and its `PATCH /tenants/current` is
refused with `no_active_tenant` (`views/tenant.py:120-122`). The wizard is wedged until the user
signs out and back in.

**What goes wrong.** The one mechanism the canon requires against double-posting does not hold for
the one endpoint that is required to carry the header, and the failure creates a whole duplicate
tenant rather than a duplicate row.

**Smallest correct fix.** For tenant-creating scopes, key the record on the user alone: resolve the
lookup/claim identity as `(NULL, user, scope, key)` whenever `scope == "tenant_create"`, regardless
of the request's `tid`. Separately, make the replay path re-issue the session for
`record.entity_id`'s membership (or store and re-apply the cookie set) so the replayed 201 is
usable.

---

## B3 — `X-Tenant-Id` is not echoed, so the stale-tab guard is inert

**Violates:** `PLT-04` FR-4 / CCR-3 ("Every API response carries `X-Tenant-Id`"), AC-4.

**What the code does.** The header is set on exactly two responses —
`backend/apps/platform_app/views/auth.py:260` (switch-tenant) and
`backend/apps/platform_app/views/tenant.py:98` (tenant create). No middleware and no renderer adds
it anywhere else; a repository-wide grep finds no other producer.

The client half is fully built and deliberately one-sided: it fires only when the header is present
(`frontend/src/api/AxiosInstances.ts:202-216`). `frontend/src/tests/staleTabGuard.test.ts:79` names
the gap out loud — *"passes a response with no X-Tenant-Id — CCR-3 is not shipped yet"*.

**What goes wrong.** Auth cookies are shared across tabs. A merchant with tab A on
"Kirana Bhandar" and tab B on "Bhandar Wholesale" switches business in tab B; tab A's cookie now
carries tenant B's `tid`. Tab A still shows tenant A's chrome, party list and forms, and every read
and every **write** it issues from that point lands in tenant B. FR-4 exists precisely to stop
this, and the guard that would stop it never fires because the signal it keys on is absent. The
consequence is a ledger entry or a party recorded against the wrong business, which is the class of
error the canon's tenancy rule is written for.

**Smallest correct fix.** In the response-rendering middleware, set
`response["X-Tenant-Id"] = str(tenant.id)` from `get_effective_tenant(request)` whenever it
resolves. One place; the client needs no change.

---

## B4 — Invitation acceptance is unreachable for every account the product can create

**Violates:** `PLT-01` EC-5 and AC-3, `PLT-04` FR-8 and FR-9, `PLT-15` FR-3
(invitation accept is one of the three named `max_users` gates).

Two independent failures, either of which alone closes the path.

**(a) The route guard bounces the only screen that shows invitations.**
`postAuthDestination` correctly routes an invited-only user to the chooser —
`frontend/src/modules/DigiKhaato/features/auth/view-model/authDisplay.ts:37-39` → `{kind:
'invitation'}` → `AUTH_CONFIG.chooserRoute` = `/switch`
(`.../auth/hooks/useAuthRedirect.ts:67-69`, `.../auth/config.ts:55`). `/switch` lives under
`app/(app)/`, whose layout wraps everything in `RequireSession`
(`frontend/app/(app)/layout.tsx:12`). `sessionSlice` sets `status = 'no_tenant'` whenever
`activeTenant` is null (`frontend/src/redux/slice/sessionSlice.ts:125`) — which is exactly the
invited-only case — and `RequireSession` redirects `no_tenant` to `/onboarding`
(`.../auth/components/RequireSession.tsx:32-34`). The chooser page's own docstring says it is
"where an invited-only user is sent"
(`.../tenant-switcher/components/TenantChooserPageContent.tsx`), and it can never render for one.

The same bounce hits `PLT-04` FR-9's other chooser case — several active tenants with no default
(`authDisplay.ts:43`) — reachable when the default membership's tenant is deleted
(`backend/apps/platform_app/selectors/memberships.py:95-102` returns `None`). Those users are also
pushed into the wizard to create yet another business.

**(b) The server matches invitations on `mobile`, which no MVP account has.**
`accept_invitation` refuses unless `invitation.mobile == user.mobile`
(`backend/apps/platform_app/services/memberships.py:212-213`). `DEC-010` made `mobile` an optional
profile field (`backend/apps/platform_app/models/user.py:72`) and `CR-2026-09-19-D` removed it from
the sign-up form — `SignUpFormValues` is `{ email, password }`
(`.../auth/validation/authSchemas.ts:53-56`). There is no profile screen at MVP to add one
(`PLT-07` unbuilt). So every account created through the product has `mobile = None` and every
invitation is refused with `invitation_invalid`.

**Why the suite is green.** `UserFactory.mobile` is a populated sequence
(`backend/tests/factories/platform.py:110`), so all five invitation tests in
`apps/platform_app/tests/test_switch.py:352-450` run against a user the product cannot create.

**Smallest correct fix.** (a) Treat an invited-only session as reachable: give `sessionSlice` a
distinct status (or let `RequireSession` allow `ROUTES.SWITCH_TENANT` under `no_tenant`).
(b) Move the invitation identity to `email` — add `Invitation.email` and match on it, keeping
`mobile` as the notification channel — which is the direction `DEC-010` already set for identity.

---

# Major

## M1 — The onboarding preset is re-applied on every tenant update after completion

**Violates:** `PLT-03` BR-3 ("idempotent … and **audited once**"), FR-8 ("changing `business_type`
later does **not** re-apply the preset"), §16.

**What the code does.** `update_tenant` decides completion by a threshold on the *resulting* step,
not by a transition:

```python
completing = int(payload.get("onboarding_step", tenant.onboarding_step)) >= WIZARD_LAST_STEP
...
if completing:
    apply_preset(tenant=tenant, actor=actor, ctx=ctx)
```
`backend/apps/platform_app/services/onboarding.py:216, 245-246`

Once `tenant.onboarding_step == 4`, *every* subsequent `PATCH /tenants/current` re-runs
`apply_preset` — and `UPDATABLE_FIELDS` (`onboarding.py:41-54`) already covers the whole `PLT-07`
profile surface (name, legal name, GSTIN, PAN, address, phone, email, locale) on the same endpoint
Part 22 §22.3 assigns to it.

**What goes wrong.** Three things, in ascending order of seriousness:

1. A `tenant.preset_applied` audit row is written on every profile save, against BR-3's
   "audited once" and §16's single event.
2. ~25 `get_or_create` round-trips run on a request specified to be a field update.
3. `apply_preset` rewrites `enabled_modules` back to the full preset set whenever it differs —
   `onboarding.py:265-267`. `PLT-06`'s module toggles are the owner's switch; the moment they land,
   an owner who switches `inventory` off and then edits their address has it switched back on. FR-8
   is explicit that a later change must not re-apply the preset, and this re-applies it on every
   change.

**Why the suite is green.** `test_completion_is_idempotent`
(`apps/platform_app/tests/test_onboarding.py:467`) calls completion twice and asserts row *counts*
are unchanged — which is true, because the seeds are `get_or_create`. It asserts nothing about the
audit-row count or about `enabled_modules` being left alone, so the defect passes through it.

**Smallest correct fix.** Make the trigger a transition:
`completing = int(payload.get("onboarding_step", tenant.onboarding_step)) >= WIZARD_LAST_STEP and
before["onboarding_step"] < WIZARD_LAST_STEP`.

---

## M2 — The client reads `retry_after` in a shape the server never sends

**Violates:** `PLT-02` FR-6, `PLT-01` §6 Alternate C ("Try again in {minutes} min" with countdown),
§9 "Error".

**What the code does.** The server puts a scalar in `details`:
`details={"retry_after": int(retry_after)}` — `backend/apps/platform_app/services/passwords.py:72-78`
(`LoginThrottled`) and `:90-95` (`RequestThrottled`) — and the handler passes `details` through
verbatim (`backend/apps/common/exceptions.py:245`, `:184`). The backend's own test asserts the
scalar: `assert immediate.json()["error"]["details"]["retry_after"] <= 60`
(`apps/platform_app/tests/test_passwords.py:646`).

The client indexes it as an array:

```ts
const raw = error.details.retry_after?.[0];
const seconds = Number(raw);
return Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
```
`frontend/src/modules/DigiKhaato/features/auth/redux/authSlice.ts:74-78`

`(900)?.[0]` is `undefined`, `Number(undefined)` is `NaN`, so the fallback always wins.

**What goes wrong.** After ten failed logins the server locks the identifier for **900 seconds**
(`backend/apps/platform_app/services/throttle.py:56`). The screen tells the merchant to wait
**60**, re-enables the form, and hands them another 429 — fourteen more times. The FRD's countdown
is wrong by 15×, and the `Retry-After` header the handler does set
(`exceptions.py:188-190`) is never read either: `toApiError` keeps only `details`
(`frontend/src/utils/apiError.ts:104-112`).

**Why the suite is green.** `frontend/.../authSlice.test.ts:134` builds the fixture as
`{ retry_after: ['120'] }` — an array the server cannot produce. The test asserts the client's
assumption, not the contract.

**Smallest correct fix.** In `throttleUntilFrom`, accept both shapes:
`const raw = Array.isArray(d.retry_after) ? d.retry_after[0] : d.retry_after;`

---

## M3 — The reset link is spent before the new password is validated

**Violates:** `PLT-02` FR-5 and §9 "Failed"; `PLT-02` §10 (the password rules the server owns).

**What the code does.** `PasswordResetConfirmView` consumes the token in its own committed
transaction and only then validates:

```python
user = password_service.consume_reset_token(token=data["token"])
revoked = password_service.reset_password(user=user, new_password=data["new_password"], …)
```
`backend/apps/platform_app/views/auth.py:342-343`

`consume_reset_token` commits `used_at` (`services/passwords.py:448-465`); `reset_password` then
calls `validate`, which raises `ValidationFailed` (`:220`). `ATOMIC_REQUESTS` is `False`
(`config/settings/base.py:118`), so nothing rolls the spend back.
`PasswordResetConfirmSerializer` checks only length and type
(`serializers/auth.py:108-113`), so the rejection is real, not hypothetical.

**What goes wrong.** The client mirrors everything it can (`passwordValidation({ minLength:
PASSWORD_FLOOR })`, `.../auth/validation/authSchemas.ts:130`), but it cannot mirror Django's
20,000-word `CommonPasswordValidator` or `UserAttributeSimilarityValidator`
(`config/settings/base.py:129-136`). A merchant who types `Password123` at the end of a reset gets
"Choose a less common password" **and a dead link**, and must request another — behind a 60-second
minimum gap and a five-per-hour cap (`services/throttle.py:60-62`). `PLT-02` §9's "Failed" state
describes the opposite: an expired code links *back* to the request, a rejected password does not
consume anything.

The behaviour is deliberate and tested
(`test_reset_confirm_refuses_a_weak_password_but_the_token_is_still_spent`,
`apps/platform_app/tests/test_passwords.py:799`) — the docstring's reasoning is that a link must
not be probeable by submitting bad passwords. That reasoning does not hold: the holder of the link
can already spend it with a *good* password, so probing buys nothing.

**Smallest correct fix.** Wrap both calls in one `transaction.atomic()` in the view, so a refused
password rolls the spend back with everything else.

---

## M4 — `onboarding_step` is a free-form field, not a monotonic counter

**Violates:** `PLT-03` FR-1, FR-9, §9 "Partial".

**What the code does.** `onboarding_step` is an ordinary writable field clamped only to 0…4
(`backend/apps/platform_app/serializers/tenant.py:80`) and set by straight assignment
(`services/onboarding.py:208-209`). The client sends absolute values — `2`, `3`, `4`
(`.../onboarding/api/onboardingService.ts:120, 144, 161`).

**What goes wrong.** Two directions:

* *Forward.* `PATCH /tenants/current {onboarding_step: 4}` from step 1 applies the preset and marks
  the wizard complete without steps 2 and 3 ever running. `gst_type` defaults to `unregistered`, so
  the result is not corrupt, but FR-1's "progress is saved after each step" is not enforced and
  §9's Processing/Completed transition can be reached from any state.
* *Backward.* A merchant who returns to step 2 from step 4 to fix a GSTIN sends
  `onboarding_step: 2`, which regresses the tenant. `postAuthDestination` then resumes them at
  step 3 on the next login (`.../auth/view-model/authDisplay.ts:45-47`) even though they had
  finished, and `RequireSession`/the wizard put a completed business back into onboarding.

**Smallest correct fix.** In `update_tenant`, take the max:
`payload["onboarding_step"] = max(int(payload["onboarding_step"]), tenant.onboarding_step)`.
Combined with M1's transition guard this also makes the preset fire exactly once.

---

# Minor

**m1 — `plan_limits.support_contact` is read by the client and never sent by the server.**
`plan_limits_payload` returns `{plan_code, limits, modules}` only
(`backend/apps/platform_app/services/entitlements.py:231-247`), which matches `PLT-15` FR-5. The
client reads `payload?.support_contact` (`frontend/.../plan/api/planService.ts:76`) and stores it
(`.../plan/redux/planSlice.ts:72`), so `plan.supportContact` is permanently all-null. The 403
details *do* carry phone/whatsapp/email (`entitlements.py:180-186`) but never a `name`, so FR-6's
and FR-7's "Contact {partner}" can never name the partner anywhere: the near-limit banner falls
back to `plan.limit.provider` (`.../plan/components/PlanLimitBanner.tsx:45`) and the Settings→Plan
card has no contact at all. *Fix:* add `support_contact` (including the partner name) to
`plan_limits_payload`, and `name` to `raise_plan_limit`'s details.

**m2 — The FR-7 preset value `items default track_stock=false` is modelled but never persisted.**
`Preset.items_track_stock_default` exists and `food` sets it
(`backend/apps/platform_app/services/presets.py:27, 97`), but `apply_preset`'s `settings_seed`
(`services/onboarding.py:273-286`) has no key for it, so nothing `INV-01` could read carries it.
*Fix:* seed `inventory.items_track_stock_default` alongside `inventory.enabled`.

**m3 — `ImmutableModel` asserts a database trigger that no migration creates.** Its docstring says
"The database trigger `forbid_update_delete` (Part 21 §21.3.4) **is** the real guarantee; this base
stops the ORM path early" (`backend/apps/common/models.py:70-84`), and no migration in the
repository creates any trigger. `AuditLog` is currently the only subclass
(`backend/apps/platform_app/models/audit.py:12`) and `QuerySet.update()` /
`QuerySet.delete()` bypass `Model.save()` / `Model.delete()` entirely, so append-only is an ORM
convention today. Part 21 §21.1 rule 2 mandates the trigger for `ledger_entry` and
`inventory_stock_movement`, which are unbuilt — so this is a claim that will be read as already
true when those land. *Fix:* correct the docstring now, or add the trigger migration.

**m4 — `authenticate()`'s constant-time comment is wrong.** The comment at
`backend/apps/platform_app/services/passwords.py:282-284` says "The hash is still computed above
for an existing user, so the timing of the three cases does not separate them", but the guard is a
short-circuiting `and` chain (`:272-277`): for an unknown address, `check_password` never runs and
the response returns in a fraction of the PBKDF2 time. The behaviour is the ordinary Django
weakness; the comment claiming otherwise is the defect. *Fix:* run a dummy
`User().set_password(password)` on the miss, or delete the claim.

**m5 — `PasswordSetView` persists `full_name` before authorising the change.** The name is written
and saved at `backend/apps/platform_app/views/auth.py:278-280`, before
`password_service.set_password` checks `current_password` (`services/passwords.py:178-182`). A
caller who supplies the wrong current password gets a 401 and a changed display name.
*Fix:* move the name write after `set_password` returns.

**m6 — DEC-010 / CR-2026-09-19-D orphans.** `auth.mobile.label` ("Mobile number (optional)"),
`auth.mobile.hint`, `errors.otp_invalid`, `errors.otp_throttled`, `plan.noun.max_parties` and
`plan.noun.max_invoices_per_month` exist in `frontend/locales/{en,hi}.json` with no reference in
`src/` or `app/`. The `setPassword` branch of `redirectTo`
(`.../auth/hooks/useAuthRedirect.ts:64-66`) is unreachable: `postAuthDestination` never returns
that kind, and since registration always sets a password there is no longer a caller. *Fix:* delete
the six keys and the branch, or add the assertion that makes them live.

**m7 — `POST /auth/email/verify/request` has no throttle.** It is `IsAuthenticated` with no
durable counter (`backend/apps/platform_app/views/auth.py:363-385`), unlike every other token-minting
endpoint. Each call invalidates the previous link and sends a new one, so a loop is both a mail
amplifier and a way to make a merchant's in-flight link dead. The feature is off by default
(`UB_EMAIL_VERIFICATION_ENABLED=False`), which is why this is minor. *Fix:* reuse
`throttle.consume` with a per-user scope, as `request_reset` does.

**m8 — The client's GST state-code rule is laxer than the server's.**
`REGEX.GST_STATE_CODE = /^\d{2}$/` (`frontend/src/utils/regexConstants.ts:46`) accepts `99` and
`00`, which `PLT-03` EC-4 forbids and which `StateCodeField` rejects
(`backend/apps/platform_app/serializers/tenant.py:22-31`). In practice the field is a closed
combobox, and the mismatch is in the safe direction (the server refuses), so this is a note rather
than a bug. *Fix:* validate against the 38-entry `GST_STATES` constant the combobox already uses.

---

# Verified as correctly implemented

These were checked against the requirement text and the code agrees. They are trustworthy.

**Money and rounding (canon §0.11 rule 3, Part 20 §20.7).** `apps/common/money.py` is the single
rounding primitive: `D()` raises `TypeError` on a `float` (`:26-27`), `half_up` is the only
quantiser and always passes `ROUND_HALF_UP` (`:31-33`), and the process decimal context is never
modified. `allocate_proportional` rounds shares and gives the residual to the largest weight with a
last-wins tie-break that matches its own documented convention (`:56-81`), so a split sums back
exactly. `MoneySerializerField` refuses a JSON number outright
(`apps/common/serializers.py:44-47`) and emits strings. `MoneyField` is `numeric(14,2)` throughout.
No float reaches any money path in the built code.

**Fail-closed tenant scoping (canon §0.11 rule 2).** `TenantQuerySet.for_tenant(None)` returns
`none()` rather than everything (`apps/common/managers.py:13-17`); `TenantScopeMixin.scope_to_tenant`
does the same at the view boundary (`apps/common/viewsets.py:21-25`); auto-scoping from a
thread-local is deliberately rejected with a stated reason (`managers.py:23-32`). The party
selector scopes first and searches second (`apps/parties/selectors/party.py:23-26`).
`get_effective_tenant` never consults `X-Tenant-Id` and re-reads the membership from the database
on **every** request, so a revoked or suspended membership stops working immediately rather than at
token expiry (`apps/common/tenancy.py:59-73`) — which is what makes `PLT-04` EC-1 and `leave()`
correct. Unimplemented super-admin impersonation resolves to `None`, not to a grant
(`tenancy.py:76-84`). `TenantPrimaryKeyRelatedField` closes the IDOR on write serializers
(`apps/common/serializers.py:11-31`).

**Refresh rotation and theft response (`PLT-01` §14, Part 20 §20.5.2).** `sessions.rotate` decides
the refusal in a read pass and commits the revocation in its own transaction *before* raising, so
the family revocation survives the 401 it accompanies — the single subtlest thing in the file and
it is right (`apps/platform_app/services/sessions.py:99-177`). Reuse revokes the whole `family_id`
and audits it; `select_for_update(of=("self",))` is correctly narrowed because `tenant` is nullable
and PostgreSQL refuses `FOR UPDATE` on the nullable side of an outer join (`:118-127`).
`switch_tenant` mints a **new** family and revokes the old session, so no refresh chain ever spans
two tenants — `PLT-04` BR-2 exactly (`services/memberships.py:64-74`).

**Password policy and login (`PLT-02` FR-2, FR-6, BR-1, AC-5).** The union of the FRD's composition
rule and Part 27's 10-character privileged floor is enforced, with the conflict documented rather
than silently resolved (`services/passwords.py:1-25, 112-134`). One `InvalidCredentials` for an
unknown address, a wrong password and an inactive user (`:60-69, 272-298`) — `EC-6` and AC-5.
`request_reset` computes its whole response from settings before the user lookup and returns the
identical body for an unknown address (`:350-374`), and `messaging.send_email` never raises for a
provider failure (`services/messaging.py:13-18`), so there is no enumeration oracle on either path.
Throttle counters live in PostgreSQL, not `LocMemCache`, with the reasoning stated
(`services/throttle.py:1-16`), identifiers are hashed at rest (`:79-81`), and the budgets match
Part 27 §27.4.2 (10/identifier/10 min → 15 min lockout; 100/IP/hour; 5 resets/address/hour 60 s
apart). A successful reset clears the login lockout (`passwords.py:232-235`).

**`DEC-001`'s narrowing (`PLT-15`).** `LIMIT_KEYS` is `("max_users", "storage_mb")`, the removed
keys are named in a `REMOVED_AT_MVP` tuple so a reintroduction is an edit rather than a forgotten
`if`, and a structural test asserts nothing reads them
(`services/entitlements.py:37-41`; `tests/test_entitlements.py:397`). `PlanLimit()` raises
`ImproperlyConfigured` at request time for a key outside the list
(`apps/common/permissions.py:139-143`). `seed_plans` omits the removed keys entirely rather than
setting them to `null`, with the reason written down
(`management/commands/seed_plans.py:1-20, 45-62`). `member_usage` counts `active ∪ invited` with no
"+1 for the owner" (`entitlements.py:112-121`), `assert_can_add_member` runs under
`lock_tenant_for_write` inside the caller's transaction (BR-7, `:124-157`), and the `plan.limit_hit`
audit row is written by the exception handler *after* the failed transaction unwinds, which is the
only way §16's "written even though the request failed" can be true (`:160-228`). The frontend
mirrors the narrowing and explains why there is no party meter and no invoice banner
(`frontend/.../plan/types/plan.types.ts:1-29`, `.../PlanLimitBanner.tsx:11-24`).

**The preset table (`PLT-03` FR-6, FR-7).** `presets.py` reproduces all nine rows exactly — party
labels, favourite units, extra expense categories, and `default_due_days` 7 / 15 / 30 by the
grouping the FRD gives. All nine `platform_tenant_setting` keys FR-6 names are seeded, plus twelve
`platform_document_sequence` rows with `padding=4`, the `MAIN` location and the expense categories.
Every write is `get_or_create`, so the seeding itself is genuinely idempotent (BR-3's first half).
`_seed_modules` is FR-7's formula including the partner and plan intersection, and EC-6's silent
drop of `inventory` (`services/onboarding.py:331-341`). `preset_for` falls back to `other` rather
than raising on an unknown type, with the reason stated (`presets.py:156-163`).

**GSTIN handling (`PLT-03` FR-3, §10, EC-4).** The checksum is implemented identically on both
sides (`frontend/src/hooks/useValidationSchemas.ts:37-51` and `apps/tax/validators.py`), state and
PAN are derived from the GSTIN, and a mismatch travels as `meta.warnings[]` rather than an error —
so the merchant is never blocked by a legitimate value (`services/onboarding.py:378-426`).
`gst_type == unregistered` clears any stale GSTIN left by a corrected step 2 (`:211-214`, AC-3).
The `U(partner_id, gstin)` violation is translated to 409 `gstin_in_use` from the `IntegrityError`
rather than a pre-check race (`:219-223`).

**Authentication transport.** `typ` must be `access` and a missing `epo` claim is refused rather
than read as passing (`apps/common/authentication.py:51-56`); CSRF double-submit applies to cookie
auth on unsafe methods only (`:58-59, 68-79`); the refresh cookie is path-scoped to
`/api/v1/auth/refresh` and `ub_csrf` is the only readable one (`tokens.py:79-118`). The 15-minute
window during which a revoked session's *access* token still works is explicitly sanctioned by
Part 27 §27.4.3 ("the bounded exposure is the 15-minute access lifetime") and is not a defect;
`token_epoch` is the incident lever and is correctly wired both ways.

**Post-login routing (`PLT-01` FR-9, `PLT-04` FR-9).** `postAuthDestination` is a pure function in
one place with all five branches and the precedence the FRD gives
(`.../auth/view-model/authDisplay.ts:33-63`), and `safeNextPath` closes the open redirect on
protocol-relative, backslash and scheme-bearing values (`:70-77`). The server's
`default_membership` matches it: the flagged default, else the single active membership, else
`None` (`selectors/memberships.py:83-102`). B4(a) is a guard defect downstream of this, not a
defect in the rule.

**`reconcile_entitlements` (`PLT-15` FR-8, EC-3).** Trims `enabled_modules` to the effective set,
never deletes data, audits before/after, supports `--dry-run`, and — unlike the general problem
`STATUS.md` records as `BE-03` — is actually registered in `SCHEDULES`
(`apps/common/jobs.py:384`) with a handler in the app's `tasks.py`
(`apps/platform_app/tasks.py:96-106`), so it will genuinely run.

---

# What the tests do not cover

1,217 passing tests is not the same as the behaviour being right. Each of these is a specific gap:

1. **Every test user has a mobile.** `UserFactory.mobile` is a populated sequence
   (`tests/factories/platform.py:110`), so no test exercises the `mobile=None` account that the
   MVP sign-up screen actually produces. All five invitation tests
   (`tests/test_switch.py:352-450`) are therefore run against an account shape the product cannot
   create — B4(b).
2. **`staleTabGuard.test.ts:79` certifies the gap.** *"passes a response with no X-Tenant-Id —
   CCR-3 is not shipped yet"* is a green test asserting that `PLT-04` AC-4 does not hold — B3.
3. **`authSlice.test.ts:134` asserts a wire shape the server cannot emit** (`retry_after: ['120']`)
   — M2.
4. **`test_completion_is_idempotent`** asserts row counts only. It does not assert the
   `tenant.preset_applied` audit-row count, and it does not assert that `enabled_modules` is left
   alone on a later PATCH — M1.
5. **No test covers the idempotent replay's cookies.**
   `test_onboarding.py:226-234` asserts the replayed *body* and the `Idempotent-Replayed` header,
   never that the replay is usable (no `Set-Cookie`, no `tid`) — B2.
6. **No test retries `POST /tenants` with the same key from a session that already has a `tid`** —
   the "Add a business" duplicate — B2.
7. **No frontend test mounts `/switch` with a `no_tenant` session**, so the bounce that makes the
   chooser unreachable is invisible — B4(a).
8. **No test drives the stepper backwards.** `T-PLT-03-10` (abandon and resume) is covered;
   "go back to step 1 and press Continue" is not — B1.
9. **Idempotency has no concurrency test.** The unique index is asserted to be the lock in the
   docstring; there is no two-worker test that proves it, and `tests/test_idempotency.py` is
   single-threaded. `PLT-15` EC-1's equivalent seat race is likewise untested
   (`T-PLT-15-6` is written against `POST /parties`, which does not exist yet).

---

# What I could not check

* **Nothing was executed.** No database was available to me in this environment, so every finding
  is from reading the code and its tests; I did not run the backend or frontend suites and did not
  reproduce any defect at runtime. B1, B2, M1 and M2 are short, deterministic code paths and I am
  confident in them; B4(a) depends on Next.js route-group layout composition, which I verified
  structurally (`app/(app)/layout.tsx` wraps `/switch`) but did not observe.
* **The database migrations were read only for constraints and triggers** (`0001`–`0005`). I did
  not verify that the ORM model state and the migration state agree — a `makemigrations --check`
  would settle that and is the standard guard.
* **`PLT-05` (team and roles) is unbuilt**, so the invitation *creation* side of B4 could not be
  checked against a real caller; I audited the accept endpoint that exists.
* **The ledger, inventory, sales and purchases apps are stubs.** Canon §0.11 rule 1 (immutability
  of ledger entries and stock movements), the weighted-average costing rule of Part 21 §21.3.6 and
  the `BE-01`/`BE-02` findings `STATUS.md` records are outside what is built and were not assessed
  beyond noting that `ImmutableModel`'s trigger claim (m3) will apply to them.
* **Accessibility, performance budgets, bundle size and the Hindi copy** were out of scope for this
  pass; I checked i18n only for orphaned keys left by `DEC-010` and `DEC-001`.
* **`docs/CR-LOG.md` was not reconciled against the code.** Several modules carry "`CR-LOG` carries
  the request" comments for spec contradictions they resolved locally; whether every one of those
  CRs actually exists is a governance check, not a functional one, and belongs in a different pass.
