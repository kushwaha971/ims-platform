# Part 17.1 — FRD: Platform, White-label and Parties

This chapter specifies the `PLT`, `WLB` and `PTY` features of the Feature Catalogue (Part 16) using the 24-section template of Part 17.0. It is normative for implementation and is subordinate to Part 0 (canon), Part 21 (database) and Part 22 (API). Where this chapter needs something the canon does not define, the need is recorded in **Canon change requests** at the end of the file rather than silently introduced.

Conventions applied to every feature below (not repeated per feature):

- All non-public endpoints require `Authorization: Bearer` or the `ub_access` cookie, are tenant-scoped by the JWT `tid` claim, and return the standard envelope and error object of Part 22 §22.1. Cross-tenant IDs return 404.
- Every state-changing service runs in `transaction.atomic()` and writes `platform_audit_log` (canon §0.11 rule 4).
- Frontend code lives in `src/modules/DigiKhaato/features/<feature>/{api,components,hooks,redux,types,constants,view-model,validation}`; slices are `redux/<x>Slice.ts`, thunks `redux/<x>Thunk.ts` built with `createAsyncThunk` calling `api/<x>Service.ts`; toasts go through the single `snackbarSlice`; validators are Yup schemas exported from `src/hooks/useValidationSchemas.ts`. TanStack Query is not used.
- Cross-feature Redux slices: `sessionSlice` (user, memberships, active tenant, permissions, plan limits, feature flags), `whiteLabelSlice` (branding tokens), `snackbarSlice`.
- Colour semantics: receivable / "You gave" → `--error` family; "You got" / payable-to-party → `--success` family; blue (`--accent`) only for actions and navigation. Labels always accompany colour.
- Personas use the codes of Part 16: **OW** owner, **ST** staff, **AC** accountant, **PA** partner admin, **SA** super admin, **CU** end customer (party).
- Shared regular expressions: mobile `^\+91[6-9]\d{9}$` (E.164 after normalisation of a 10-digit input); GSTIN `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` plus the mod-36 checksum of research §C.1; PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`; pincode `^[1-9][0-9]{5}$`; hex colour `^#[0-9A-Fa-f]{6}$`.
- Analytics events are named `ub.<module>.<event>` and carry `tenant_id`, `user_id`, `role`, `platform` (`web|pwa`) by default; only feature-specific properties are listed.

---

## 17.1 Platform (PLT)

### PLT-01 — Mobile OTP sign-up & login

#### 1. Business Objective
Establish a user's identity with the mobile number they already give their customers, with zero paperwork, so that a shop owner reaches the onboarding wizard in under two minutes and staff can join by the same mechanism. The OTP path is also the verification primitive reused by password reset (PLT-02), tenant deletion (PLT-10) and future change-of-number. At MVP (local, single-user deployment) the SMS adapter is `ConsoleSmsBackend`, so the code is written to the backend log; the flow is otherwise identical to production. Success measures: sign-up completion rate ≥ 85 % of OTP requests; median time from first screen to verified session ≤ 90 s; OTP abuse (throttle hits) < 1 % of requests.

#### 2. User Personas
OW (primary — creates the account and the first business), ST (joins via invitation, PLT-05), AC (joins via invitation). SA uses the same login with `is_super_admin=true`.

#### 3. User Stories
1. **US-PLT-01-1** — As an owner, I want to enter my mobile number and a 6-digit code so that I can start without an email or documents.
2. **US-PLT-01-2** — As a returning user, I want to log in with mobile + password by default and fall back to OTP if I forgot the password or never set one.
3. **US-PLT-01-3** — As a staff member invited by mobile, I want the OTP login to land me directly in the business I was invited to.
4. **US-PLT-01-4** — As an owner, I want the app to remember my device so that I am not asked for a code on every open, but I can revoke that device later (PLT-09).
5. **US-PLT-01-5** — As a developer running locally, I want the OTP printed in the backend log so that I can complete the flow without an SMS provider.

#### 4. Functional Requirements
- **FR-1** The login screen offers two tabs: "Password" (default) and "OTP". Both take an Indian mobile number entered as 10 digits with a fixed `+91` prefix (`UbPhoneInput`).
- **FR-2** `POST /auth/otp/request` with `purpose ∈ {login, signup, verify, reset}` creates a `platform_otp_challenge` row (`code_hash` = SHA-256 of the 6-digit code + server salt, `expires_at = now + 300 s`, `attempts = 0`, `ip`, `device_hint`) and dispatches the code through the SMS adapter. The response never reveals whether the mobile exists.
- **FR-3** The SMS adapter is resolved from settings (`SMS_BACKEND`). `ConsoleSmsBackend` writes `OTP for +91XXXXXXXXXX (purpose=login): 123456` to logger `notifications.sms.console` at INFO and inserts `notifications_message_log` with `channel='sms'`, `template_code='otp'`, `provider='console'`, `status='sent'`. If no backend is configured the row is written with `status='skipped'` and the request still returns 200 (the code cannot be delivered; the UI shows a generic "Code sent" message and the developer sees the `skipped` row).
- **FR-4** `POST /auth/otp/verify` with `{challenge_id, code, device_label}` validates the code against the newest unverified, unexpired challenge; on success sets `verified_at`, creates or loads `platform_user` (new user: `full_name=''`, `locale` from the language picker, `password_hash=NULL`), creates a `platform_session` row (refresh family) and issues JWT access (15 min) + rotating refresh (30 d) as httpOnly cookies `ub_access`, `ub_refresh` (`Secure`, `SameSite=Lax`, refresh path `/api/v1/auth/refresh`). API clients (`Accept: application/json` with `X-Client: api`) receive `access_token` in the body instead.
- **FR-5** Response shape per Part 22 §22.2: `user`, `tenants[]` (active and `invited` memberships, each `{id, name, role, is_default, status}`), `active_tenant_id` (the `is_default` tenant or the only tenant), `permissions[]`. New mobile → `user.is_new=true`, `tenants=[]`, `active_tenant_id=null`; client routes to PLT-03.
- **FR-6** Wrong code increments `attempts`; after 5 the challenge is invalidated and the response is 400 `otp_invalid` with `details.attempts_left=0`; the UI offers "Request a new code".
- **FR-7** Resend is allowed after `retry_after` (30 s) and counts against the throttle: 5 requests per mobile per 10 minutes and 20 per IP per hour → 429 `otp_throttled` with `Retry-After` header.
- **FR-8** The language picker (English / हिन्दी) is the first control on the auth screen; the choice is stored in `localStorage.ub_locale`, sent as `Accept-Language`, and persisted to `platform_user.locale` on first verify.
- **FR-9** When the verified user has exactly one tenant, the client dispatches `fetchMe` and routes to `/dashboard`; with several tenants and no default, to the tenant switcher (PLT-04); with an `invited` membership only, to the invitation acceptance screen (PLT-05).
- **FR-10** Challenges older than 24 h are purged by the scheduler command `purge_otp_challenges` (ADR-012).

#### 5. Non-Functional Requirements
- P95 latency for `/auth/otp/request` ≤ 300 ms excluding provider time; provider call is synchronous for console, asynchronous (jobs runner) for real providers.
- Works on 2 GB Android devices in Chrome; auth bundle < 120 kB gzipped; no third-party scripts.
- Accessible: inputs labelled, OTP field uses `inputmode="numeric"`, `autocomplete="one-time-code"`, focus moves to OTP after send; errors announced via `aria-live`.
- Localised copy in `en` and `hi`; numbers not localised (phone digits).
- Offline: auth requires network; the screen shows `UbStatusBanner` "You are offline" and disables the submit button.

#### 6. User Flow
Primary (OTP sign-up): open app → language picker → mobile entry → "Get code" → `otpRequest` thunk → OTP screen (6 boxes, 300 s countdown, "Resend in 30 s") → `otpVerify` → `is_new=true` → name + password screen (`POST /auth/password/set`, optional skip) → PLT-03 wizard.
Alternate A (password login): Password tab → mobile + password → `passwordLogin` (PLT-02) → same post-login routing as FR-9.
Alternate B (OTP login, existing user): OTP tab → same as primary; `is_new=false`; routing per FR-9.
Alternate C (throttled): 429 → banner "Too many attempts. Try again in {minutes} min" with countdown; both tabs disabled for the mobile.
Alternate D (invalid code ×5): challenge invalidated; button "Request a new code"; countdown resets.

#### 7. UI Requirements
Route `app/(auth)/login/page.tsx` → `<LoginPageContent/>` from `features/auth`. Components: `LanguageToggle` (`MLToggleGroup`), `MLTabs` (Password | OTP), `UbPhoneInput`, `OtpCodeInput` (feature-specific: six `MLInput` cells, paste of 6 digits fills all, Backspace moves back), `MLButton` primary (one per view), `UbStatusBanner` for throttle/offline, `UbSnackbar` for success.
Mobile (< 640 px): single column, logo/app name from `whiteLabelSlice` at top (56 px), form starts at 40 % viewport height so the keyboard does not cover the button; primary button full width, 44 px.
Desktop (≥ 1024 px): centred `MLCard` 420 px on `--canvas`; left half of the viewport shows partner/tenant-neutral illustration (static SVG, no marketing copy).
Keyboard: Enter submits; OTP auto-submits when the sixth digit is entered.

| Field | Input | Rules |
|---|---|---|
| Mobile | `UbPhoneInput` (`+91` fixed, 10 digits, `inputmode=tel`) | `mobileValidation()` → `^\+91[6-9]\d{9}$` after normalisation |
| Code | `OtpCodeInput` | exactly 6 digits |
| Device label | hidden; derived from `navigator.userAgent` (e.g. "Chrome on Android") and editable later in PLT-09 | ≤ 120 chars |

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `auth.login.title` | Log in to {appName} | {appName} में लॉग इन करें |
| `auth.tab.password` | Password | पासवर्ड |
| `auth.tab.otp` | OTP | ओटीपी |
| `auth.mobile.label` | Mobile number | मोबाइल नंबर |
| `auth.otp.get` | Get code | कोड पाएँ |
| `auth.otp.sent` | Code sent to +91 {mobile} | +91 {mobile} पर कोड भेजा गया |
| `auth.otp.resendIn` | Resend in {seconds}s | {seconds} सेकंड में फिर भेजें |
| `auth.otp.invalid` | Incorrect code. {attemptsLeft} attempts left | गलत कोड। {attemptsLeft} प्रयास बाकी |
| `auth.otp.throttled` | Too many attempts. Try again in {minutes} min | बहुत ज़्यादा प्रयास। {minutes} मिनट बाद फिर कोशिश करें |
| `auth.language.label` | Language | भाषा |

Defaults: Password tab selected when `localStorage.ub_last_login_method === 'password'` or unset; OTP tab when last method was OTP. Mobile is remembered (last 10 digits) in `localStorage.ub_last_mobile` unless the user unticks "Remember this number". No confirmations are needed; errors are outlined under the field (never filled red blocks).

#### 9. States
| State | What the user sees |
|---|---|
| Initial | Language toggle, Password tab, empty mobile field, disabled primary button |
| Loading | Button shows `MLSpinner` + "Sending…" / "Verifying…"; inputs disabled |
| Empty | n/a (no list) |
| Success | Snackbar "Welcome back, {name}" (or nothing for new users) and route change |
| Error | Field error for invalid mobile; banner for 429/500 with `request_id` in caption |
| Disabled | Offline banner; submit disabled; resend disabled during countdown |
| Partial | Code entered partially: cells filled, submit inactive |
| Processing | Verify in flight: cells read-only |
| Completed | Redirect performed; the auth route is not reachable while a session exists (redirect to dashboard) |
| Failed | Challenge invalidated: cells cleared, "Request a new code" button replaces submit |

#### 10. Validation Rules
| Field | Rule | Message (en) | Code |
|---|---|---|---|
| mobile | matches `^\+91[6-9]\d{9}$` | Enter a valid 10-digit mobile number | `validation_error` (`details.mobile`) |
| code | `^\d{6}$` | Enter the 6-digit code | `validation_error` |
| challenge_id | exists, unexpired, unverified, `attempts < 5` | Code expired. Request a new one | `otp_invalid` (`details.reason=expired`) |
| purpose | one of `login, signup, verify, reset` | — | `validation_error` |

Yup: `otpRequestSchema = yup.object({ mobile: mobileValidation() })`, `otpVerifySchema = yup.object({ code: yup.string().matches(/^\d{6}$/) })` in `useValidationSchemas`.

#### 11. Business Rules
- **BR-1** One `platform_user` per mobile (`U(mobile)`); mobile is stored E.164.
- **BR-2** The same OTP flow serves login and sign-up; the server decides `is_new` by user existence, and the request response is identical in both cases (no account enumeration).
- **BR-3** A verified challenge is single-use; `verified_at` set means it cannot be verified again.
- **BR-4** Code entropy: 6 digits from `secrets.randbelow(10**6)` zero-padded; never `000000` in production (regenerate).
- **BR-5** A fresh session (`platform_session`) is created on every successful verify; the previous device sessions remain valid until revoked or expired.
- **BR-6** `last_login_at` is updated on every successful verify/login.
- **BR-7** Under-18 sign-ups are not detectable by mobile; the sign-up screen states the service is for business use by adults (DPDP children clause, research §C.6) and the terms link is shown.

#### 12. Permissions
Unauthenticated endpoints; no codenames. Throttle applies per mobile and IP. `is_active=false` users receive 401 `invalid_credentials` on verify (challenge still consumed).

#### 13. Edge Cases
- **EC-1** Number recycled by telco: a new owner verifying a mobile lands in the old user's account. Mitigation at MVP: `last_login_at` older than 180 days triggers a "Is this still your business?" interstitial listing tenant names masked; owner can proceed or contact support. Full change-of-number flow is Future.
- **EC-2** Dual SIM / OTP to shop phone: the code entry screen has no device coupling; the user reads the code from another handset.
- **EC-3** Clock skew: expiry evaluated server-side only.
- **EC-4** Two challenges requested in quick succession: only the newest unexpired challenge is valid; older ones return `otp_invalid` (`reason=superseded`).
- **EC-5** User with `invited` membership and no active tenant: verify succeeds, `active_tenant_id=null`, `tenants=[{status:'invited'}]` → acceptance screen.
- **EC-6** Console backend in production: settings check in `manage.py check --deploy` fails if `SMS_BACKEND` is console and `DEBUG=False` unless `ALLOW_CONSOLE_SMS=true` (single-user local deployment).
- **EC-7** Browser blocks third-party cookies: cookies are first-party on the same host; the API host equals the frontend origin (reverse proxy) at MVP.

#### 14. API Requirements
- `POST /auth/otp/request` `{mobile, purpose}` → 200 `{data:{challenge_id, expires_in:300, retry_after:30}}`; 429 `otp_throttled`; 400 `validation_error`.
- `POST /auth/otp/verify` `{challenge_id, code, device_label}` → 200 shape in FR-5 + cookies; 400 `otp_invalid` `{details:{attempts_left, reason}}`; 401 `invalid_credentials` for inactive users.
- `GET /auth/me` after verify to hydrate `sessionSlice`.
- `POST /auth/refresh` (cookie) → rotates refresh; reuse of an old refresh token revokes the whole `family_id` (theft detection) and returns 401 `session_revoked`.
- `POST /auth/logout` → revokes current session.
Frontend: `authService.ts` (`requestOtp`, `verifyOtp`, `refresh`, `logout`, `me`), `authThunk.ts` (`requestOtp`, `verifyOtp`, `fetchMe`, `logout`), `authSlice.ts` (`challengeId`, `expiresAt`, `retryAfter`, `attemptsLeft`, `status`), `APIPaths.ts` constants `AUTH_OTP_REQUEST`, `AUTH_OTP_VERIFY`, `AUTH_ME`, `AUTH_REFRESH`, `AUTH_LOGOUT`.

#### 15. Database Impact
Writes: `platform_otp_challenge` (insert, update `attempts`, `verified_at`), `platform_user` (insert on sign-up; update `last_login_at`, `locale`), `platform_session` (insert), `notifications_message_log` (insert `template_code='otp'`), `platform_audit_log`. Reads: `platform_membership` joined to `platform_tenant` and `platform_role` for `tenants[]`. Index used: `IX(mobile, created_at)` on challenges.

#### 16. Audit Requirements
Actions (tenant_id NULL, actor_type `user` or `system`): `auth.otp_requested` (metadata: mobile SHA-256, purpose, ip), `auth.otp_failed`, `auth.login_succeeded` (session id, device_label), `auth.login_failed`, `auth.user_created`. No before/after snapshots; raw mobile never stored in metadata.

#### 17. Notifications
SMS template `otp` (channel `sms`, DLT category service-implicit, placeholders `{{code}}`, `{{app_name}}`, `{{minutes}}`): "{{code}} is your {{app_name}} code. Valid {{minutes}} min. Do not share." Hindi variant `otp` locale `hi`. No in-app or WhatsApp notification.

#### 18. Analytics / Event Tracking
`ub.platform.otp_requested {purpose, resend:boolean}`, `ub.platform.otp_verified {is_new, tenants_count}`, `ub.platform.otp_failed {attempts_left}`, `ub.platform.otp_throttled`, `ub.platform.login_method_selected {method}`.

#### 19. Security
Codes hashed at rest; constant-time comparison; challenge bound to mobile and purpose; throttles per Part 22; IP taken from `X-Forwarded-For` only behind the trusted proxy list; cookies httpOnly + Secure; CSRF double-submit for cookie sessions; refresh token family revocation on reuse; login attempts logged with hashed mobile; no PII in analytics beyond ids.

#### 20. Performance
Single indexed lookup per request; challenge purge nightly; no external calls on the request path except the SMS adapter (console: none). Target 200 concurrent OTP requests/s per backend replica.

#### 21. Testing
- **T-PLT-01-1** unit: code generation range and zero-pad.
- **T-PLT-01-2** unit: checksum-free mobile normalisation (`9876543210` → `+919876543210`; `09876…` → error).
- **T-PLT-01-3** API: request → verify happy path creates user, session, cookies.
- **T-PLT-01-4** API: 5 wrong codes → 400 with `attempts_left=0`, sixth attempt also 400 `expired/invalidated`.
- **T-PLT-01-5** API: 6th request in 10 min → 429 with `Retry-After`.
- **T-PLT-01-6** API: response identical for existing vs unknown mobile on request.
- **T-PLT-01-7** API: console backend writes log line and message_log `provider=console,status=sent`.
- **T-PLT-01-8** API: refresh token reuse revokes family.
- **T-PLT-01-9** component: `OtpCodeInput` paste fills six cells and auto-submits.
- **T-PLT-01-10** E2E: new mobile → sign-up → password set → onboarding route.
- **T-PLT-01-11** E2E: invited-only user routed to acceptance screen.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given an unknown mobile, when I request and enter the correct code, then I am verified within 300 s and routed to onboarding with `is_new=true`.
- **AC-2 (US-2)** Given an existing user, when I open the login screen, then the Password tab is selected and the OTP tab is one tap away.
- **AC-3 (US-3)** Given a pending invitation for my mobile, when I verify, then the response lists that tenant with `status=invited`.
- **AC-4 (US-4)** Given a verified session, when I reopen the app within 30 days, then I am logged in without a code.
- **AC-5 (US-5)** Given `SMS_BACKEND=console`, when I request a code, then the code appears in the backend log and a `message_log` row with `provider=console` exists.

#### 23. Dependencies
NTF-02 (SMS adapter interface), PLT-02 (password set), PLT-03 (onboarding), PLT-04 (multi-tenant routing), PLT-09 (sessions), `whiteLabelSlice` for app name/logo on the auth screen (WLB-01/03).

#### 24. Future Enhancements
Change-of-number flow with OTP on both numbers; WhatsApp OTP channel via NTF-05; SMS Retriever auto-fill in Capacitor wrapper (Phase 3); TOTP MFA for super admins (`platform_user.mfa_secret`, P2); Truecaller-style one-tap login (not planned).

---

### PLT-02 — Password login & set/reset

#### 1. Business Objective
Give staff, accountants and desktop users a password so that daily login on a shared counter PC does not depend on the owner's phone receiving codes, and give the owner a password so the local single-user deployment works with no SMS provider at all. Reset uses the OTP primitive so nobody is locked out. Success measures: ≥ 70 % of desktop logins use password; reset completion ≥ 90 %; zero plaintext password logs.

#### 2. User Personas
ST and AC (primary), OW (sets a password during sign-up or later), SA.

#### 3. User Stories
1. **US-PLT-02-1** — As a staff member, I want to log in with mobile + password on the shop computer so that I do not need the phone every morning.
2. **US-PLT-02-2** — As an invited member, I want to set my password from the invitation link so that my first login is complete in one go.
3. **US-PLT-02-3** — As an owner, I want to reset my password with an OTP if I forget it.
4. **US-PLT-02-4** — As an owner, I want to change my password from my profile while logged in.
5. **US-PLT-02-5** — As an owner, I want a failed password attempt not to reveal whether the mobile exists.

#### 4. Functional Requirements
- **FR-1** `POST /auth/login` accepts `{mobile|email, password}` and returns the same shape as OTP verify (Part 22 §22.2) plus cookies. Failure → 401 `invalid_credentials` (generic message).
- **FR-2** Password hashing uses Django's default `PBKDF2-SHA256` hasher (no extra dependency); minimum 8 characters, at least one letter and one digit; common-password list check via Django's `CommonPasswordValidator`; not equal to the mobile digits.
- **FR-3** `POST /auth/password/set` sets `password_hash` for the current authenticated user (after OTP verify or invitation acceptance); requires no current password when `password_hash IS NULL`; requires `current_password` otherwise (change flow). Sets `ub_last_login_method=password` on the client.
- **FR-4** `POST /auth/password/reset/request {mobile}` → creates an OTP challenge with `purpose='reset'` and returns `{challenge_id, expires_in, retry_after}`; identical response for unknown mobiles.
- **FR-5** `POST /auth/password/reset/confirm {challenge_id, code, new_password}` → verifies code, sets new hash, **revokes all other sessions** of the user (`platform_session.revoked_at`), issues a fresh session, returns the login shape.
- **FR-6** Login throttling: 10 failed attempts per mobile per 15 minutes → 429 `otp_throttled`-style code `login_throttled` (see Canon change requests) with `Retry-After`; successful login resets the counter.
- **FR-7** Email login is accepted when `platform_user.email` is set and unique; the UI field is labelled "Mobile or email" only on desktop; mobile-only on the mobile layout.
- **FR-8** Password fields have a show/hide toggle (`MLIconButton`, `lucide-react` `Eye`/`EyeOff`); `autocomplete="current-password"` / `"new-password"`.
- **FR-9** After password set/change the user stays logged in; other sessions are revoked only on reset (FR-5) or when the user ticks "Log out other devices" during change.

#### 5. Non-Functional Requirements
P95 `/auth/login` ≤ 400 ms (PBKDF2 iterations dominate; ≥ 600 k iterations as Django 5.2 default). Desktop keyboard flow: Tab order mobile → password → submit; Enter submits. Localised `en`/`hi`. Works offline: no.

#### 6. User Flow
Primary (login): Password tab → mobile → password → "Log in" → `passwordLogin` thunk → routing per PLT-01 FR-9.
Set from invitation: open `/join/{token}` → token preview (PLT-05) → OTP verify on invited mobile → "Set your password" screen (name + password + confirm; skippable) → `POST /auth/password/set` → dashboard.
Reset: "Forgot password?" → mobile → `POST /auth/password/reset/request` → OTP screen → new password + confirm → `reset/confirm` → snackbar "Password updated. Other devices were logged out" → dashboard.
Change (logged in): Profile → "Change password" `UbDrawer` → current, new, confirm, checkbox "Log out other devices" → save.

#### 7. UI Requirements
Routes: `app/(auth)/login`, `app/(auth)/forgot-password`, `app/(auth)/set-password`, `app/(app)/profile` (drawer). Components: `UbPhoneInput`, `MLInput type=password` with toggle, `PasswordStrengthHint` (feature-specific, four-step bar using `MLProgress`, text "Weak / Fair / Strong"), `MLCheckbox` "Log out other devices", `UbDrawer` for change flow.
Mobile: single column; "Forgot password?" as ghost link under the button. Desktop: card 420 px; field label "Mobile or email".

| Field | Input | Rules |
|---|---|---|
| Mobile / email | `UbPhoneInput` or `MLInput type=email` (segmented by detected `@`) | mobile regex or RFC 5322 basic |
| Password | `MLInput type=password` | ≥ 8, letter + digit |
| Confirm password | same | equals password |
| Current password | same | required when hash exists |

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `auth.password.label` | Password | पासवर्ड |
| `auth.password.login` | Log in | लॉग इन |
| `auth.password.forgot` | Forgot password? | पासवर्ड भूल गए? |
| `auth.password.set.title` | Set your password | अपना पासवर्ड सेट करें |
| `auth.password.change.title` | Change password | पासवर्ड बदलें |
| `auth.password.rule` | At least 8 characters with a letter and a number | कम से कम 8 अक्षर, जिसमें एक अक्षर और एक अंक हो |
| `auth.password.mismatch` | Passwords do not match | पासवर्ड मेल नहीं खाते |
| `auth.login.invalid` | Mobile or password is incorrect | मोबाइल या पासवर्ड गलत है |
| `auth.password.updated` | Password updated | पासवर्ड बदल दिया गया |
| `auth.password.logoutOthers` | Log out other devices | अन्य डिवाइस से लॉग आउट करें |

Skip is allowed on the set-password screen for owners (OTP-only account) but not for invited staff on desktop (`device_hint` not mobile) — they must set a password because OTP delivery to a shared shop number is unreliable.

#### 9. States
Initial (empty fields, disabled submit) → Loading ("Logging in…") → Success (route) / Error (generic outlined error under password; banner for 429). Set/Reset screens: Partial (strength hint updates live), Processing, Completed (snackbar), Failed (code expired → link back to request). Disabled: offline.

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| password | `^(?=.*[A-Za-z])(?=.*\d).{8,128}$` | At least 8 characters with a letter and a number | `validation_error` |
| password | not in common list; ≠ mobile digits | Choose a less common password | `validation_error` |
| confirm | equals password (client only) | Passwords do not match | — |
| current_password | matches hash | Current password is incorrect | `invalid_credentials` |
| code | 6 digits, valid challenge with `purpose=reset` | Incorrect or expired code | `otp_invalid` |

Yup: `passwordSchema`, `passwordSetSchema`, `passwordChangeSchema`, `passwordResetConfirmSchema` in `useValidationSchemas`; `passwordValidation()` helper mirrors the server regex.

#### 11. Business Rules
- **BR-1** Password is optional for a user (`password_hash NULL` = OTP-only); the login tab shows "No password set — use OTP" only after a failed attempt? **No** — that would enumerate; the generic error is always shown.
- **BR-2** Reset always revokes all other sessions and bumps nothing in JWT (`ver` unchanged; permissions unaffected).
- **BR-3** Passwords are never logged, never included in audit `before/after`.
- **BR-4** Super admins must have a password (enforced by `manage.py create_super_admin`) and, from Phase 2, MFA.

#### 12. Permissions
Unauthenticated: login, reset request/confirm. Authenticated (any role): password set/change for self only. No cross-user password administration at MVP (owner cannot set a staff password; owner can revoke the membership).

#### 13. Edge Cases
- **EC-1** Email belongs to a different user than the mobile typed: login is by one identifier only; the field is parsed as email if it contains `@`.
- **EC-2** Reset requested while a login-purpose challenge is open: purposes are independent; the reset code cannot be used for login.
- **EC-3** Password set with an expired access token (user waited on the screen): 401 → silent refresh → retry once; if refresh fails, back to login with mobile prefilled.
- **EC-4** Same password as previous: allowed at MVP (no history table).
- **EC-5** Unicode passwords: accepted, NFKC-normalised before hashing.
- **EC-6** Inactive user (`is_active=false`): 401 `invalid_credentials`.

#### 14. API Requirements
`POST /auth/login`, `POST /auth/password/set {new_password, current_password?}`, `POST /auth/password/reset/request {mobile}`, `POST /auth/password/reset/confirm {challenge_id, code, new_password}`. Frontend `authService.ts` adds `login`, `setPassword`, `requestPasswordReset`, `confirmPasswordReset`; thunks `passwordLogin`, `setPassword`, `requestPasswordReset`, `confirmPasswordReset`; `authSlice` stores `resetChallengeId`.

#### 15. Database Impact
`platform_user.password_hash`, `last_login_at`; `platform_otp_challenge` (`purpose='reset'`); `platform_session` (insert, mass `revoked_at`); audit log.

#### 16. Audit Requirements
`auth.login_succeeded`/`auth.login_failed` (method `password`, hashed identifier), `auth.password_set`, `auth.password_changed`, `auth.password_reset` (metadata: sessions_revoked count). Metadata only.

#### 17. Notifications
SMS `otp` (purpose reset) as PLT-01. In-app notification `security.password_changed` to the user ("Your password was changed on {device}. Not you? Log out other devices") created for change/reset.

#### 18. Analytics / Event Tracking
`ub.platform.password_login {success}`, `ub.platform.password_set {source: signup|invite|profile}`, `ub.platform.password_reset_requested`, `ub.platform.password_reset_completed`.

#### 19. Security
PBKDF2 ≥ 600 k iterations; generic errors; throttling; sessions revoked on reset; `X-CSRF-Token` for cookie clients; password fields excluded from request logging middleware (`SENSITIVE_FIELDS`); no password in URL.

#### 20. Performance
Hashing cost bounded to ≤ 250 ms per attempt; throttle counters in the database (`platform_otp_challenge`-style counter rows are not needed: failed attempts are counted from `platform_audit_log` `auth.login_failed` in the last 15 min via `IX(tenant_id, created_at)`… tenant_id is NULL for auth; a dedicated small index `IX(action, created_at)` is added — see §15).

#### 21. Testing
- **T-PLT-02-1** unit: password regex and common-password rejection.
- **T-PLT-02-2** API: correct login returns cookies + `tenants[]`.
- **T-PLT-02-3** API: wrong password → 401 generic; unknown mobile → same body.
- **T-PLT-02-4** API: 11th failed attempt → 429.
- **T-PLT-02-5** API: reset confirm revokes other sessions (their refresh fails with 401).
- **T-PLT-02-6** API: set without current password allowed only when hash NULL.
- **T-PLT-02-7** component: strength hint and confirm mismatch.
- **T-PLT-02-8** E2E: invite → OTP → set password → dashboard.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a staff member with a password, when they log in on desktop with mobile + password, then they land in their business without an OTP.
- **AC-2 (US-2)** Given an invitation link, when I verify OTP and set a password, then my next login works with the password.
- **AC-3 (US-3)** Given I forgot my password, when I complete the reset with a valid code, then the new password works and my other devices are logged out.
- **AC-4 (US-4)** Given I am logged in, when I change my password with the correct current password, then I remain logged in.
- **AC-5 (US-5)** Given an unknown mobile, when I try a password login, then the error text is identical to a wrong-password error.

#### 23. Dependencies
PLT-01 (OTP challenges), PLT-05 (invitation acceptance), PLT-09 (session revocation), NTF-01 (in-app notice).

#### 24. Future Enhancements
Password history (P3), MFA/TOTP for owners (P2 for super admins), SSO for partners (P3, PLT platform roadmap), passkeys (not planned).

---

### PLT-03 — Business onboarding wizard

#### 1. Business Objective
Turn a freshly verified user into a working business in ≤ 3 minutes by asking only what the product needs on day one — business name, type, GST status, state and language — and seeding sensible defaults (modules, units, document kind, party labels, expense categories, numbering) from the chosen business type. The wizard is the only place a tenant is created from the app. Success measures: wizard completion ≥ 80 % of new users; median completion time ≤ 3 min; ≤ 10 % of tenants change a seeded default in the first week (defaults are right).

#### 2. User Personas
OW (primary). SA may create tenants for partners via PLT-14. PA (Phase 2, WLB-04).

#### 3. User Stories
1. **US-PLT-03-1** — As a new owner, I want to name my business and pick what kind of business it is so that the app shows only what I need.
2. **US-PLT-03-2** — As a GST-registered owner, I want to enter my GSTIN once so that my state, legal name and invoice type are set correctly.
3. **US-PLT-03-3** — As an unregistered shopkeeper, I want to skip GST entirely and still bill with kachha bills and keep udhaar.
4. **US-PLT-03-4** — As an owner who closed the app midway, I want to resume the wizard where I left it.
5. **US-PLT-03-5** — As an owner, I want to change any seeded default later in Settings without redoing onboarding.

#### 4. Functional Requirements
- **FR-1** Wizard has four steps: (1) Business name & type, (2) GST status (+ GSTIN, legal name, PAN), (3) Address & state & phone, (4) Language & summary. Progress is saved after each step to `platform_tenant.onboarding_step` (0–4); step 1 creates the tenant.
- **FR-2** Step 1 `POST /tenants` (see Canon change requests) with `{name, business_type, locale}` creates `platform_tenant` (partner = resolved partner or `metis`, `plan_id` = partner `default_plan_id`, `status='active'`, `onboarding_step=1`, `state_code` provisional `'00'`? **No** — `state_code` is NN; the request also carries `state_code` chosen from a state dropdown on step 1 as a required field, defaulting from the browser timezone/locale is not reliable; the field is shown on step 1 under the name) and `platform_membership` (role `owner`, `status='active'`, `is_default=true` when the user has no other default, `joined_at=now`), then returns new tokens with `tid`.
- **FR-3** Step 2 `PATCH /tenants/current` with `gst_type` and, when `regular|composition`, `gstin` (regex + checksum), `legal_name`, `pan` (auto-filled from GSTIN chars 3–12, editable). Server derives `state_code` from GSTIN chars 1–2 and returns `warnings[]` `gstin_state_mismatch` when it differs from the chosen state; the UI offers "Use state from GSTIN".
- **FR-4** Step 3 `PATCH /tenants/current` with `address {line1, line2, city, district, state, pincode}`, `phone` (default = user mobile), `email`.
- **FR-5** Step 4 shows the preset summary (modules to be enabled, document kind, party labels, favourite units) and `PATCH /tenants/current {locale, onboarding_step: 4}`; the server applies the **business-type preset** idempotently on completion (`services.onboarding.apply_preset(tenant)`).
- **FR-6** Preset application writes: `platform_tenant.enabled_modules`; `platform_tenant_setting` rows `inventory.enabled`, `sales.default_kind`, `sales.default_due_days`, `numbering`, `ledger.credit_limit_mode='warn'`, `documents.show_upi_qr=true`, `parties.labels`, `inventory.favourite_units` (last two: Canon change requests); `platform_document_sequence` rows for the current FY for every kind in `numbering`; `inventory_location` `MAIN` (`is_default=true`); `expenses_category` system rows plus preset extras; `ledger.reminder_templates` default text in `en` and `hi`.
- **FR-7** Presets by `business_type` (normative):

| business_type | Inventory enabled | Default document kind (unregistered / composition / regular) | Party labels (customer / supplier) | Favourite units (UQC) | Extra expense categories seeded (in addition to system: Rent, Salaries, Electricity, Transport, Purchases-misc, Food, Marketing, Fees, Other) |
|---|---|---|---|---|---|
| `retail` | yes | estimate / bill_of_supply / invoice | Customer / Supplier | NOS, KGS, GMS, LTR, PAC | Packaging, Shop maintenance |
| `wholesale` | yes | estimate / bill_of_supply / invoice | Party / Supplier | NOS, BOX, BAG, KGS, QTL, DOZ | Loading & unloading, Godown rent |
| `distribution` | yes | estimate / bill_of_supply / invoice | Retailer / Company | BOX, PAC, NOS, BAG, DOZ | Fuel, Vehicle maintenance, Scheme discounts |
| `services` | no | estimate / bill_of_supply / invoice | Client / Vendor | NOS | Tools & equipment, Travel |
| `trader` | yes | estimate / bill_of_supply / invoice | Party / Supplier | KGS, QTL, TON, BAG, NOS | Commission, Mandi charges |
| `manufacturer` | yes | estimate / bill_of_supply / invoice | Customer / Supplier | KGS, NOS, MTR, SET, LTR | Raw material, Job work, Machine maintenance |
| `professional` | no | estimate / bill_of_supply / invoice | Client / Vendor | NOS | Professional fees, Software & subscriptions, Travel |
| `food` | yes (items default `track_stock=false`) | estimate / bill_of_supply / invoice | Customer / Supplier | NOS, KGS, LTR, PAC, BTL | Gas & fuel, Raw material, Delivery charges |
| `other` | yes | estimate / bill_of_supply / invoice | Party / Supplier | NOS, KGS, LTR | — |

`enabled_modules` = `ledger, parties, sales, purchases, payments, expenses, reports, notifications, import_export, team` plus `inventory` when enabled; intersected with `partner.allowed_modules` and `plan.modules`. `sales.default_due_days` = 15 (`wholesale`, `distribution`, `trader`, `manufacturer`), 7 (`retail`, `food`), 30 (`services`, `professional`, `other`). Numbering prefixes: `EST`, `INV`, `BOS`, `CN`, `PB`, `DN`, `RCT`, `PAYOUT`, `PO`, `DC`, `ADJ`, `TRF` with `padding=4`, `reset_fy=true`.
- **FR-8** Presets never hard-wire behaviour: every seeded value is editable in PLT-06/PLT-07; changing `business_type` later does **not** re-apply the preset (it only changes the label in the profile).
- **FR-9** Resume: `GET /auth/me` returns `active_tenant.onboarding_step`; when `< 4` the app shell redirects to `/onboarding/step/{n+1}`; steps already completed are navigable via the stepper for edits.
- **FR-10** Each step is optional beyond its required fields; "Skip for now" on step 2 sets `gst_type='unregistered'`, on step 3 leaves `address={}` and `phone` = user mobile.
- **FR-11** After completion the user lands on `/dashboard` with the first-use empty state ("Add your first party") and a `notifications_notification` of type `onboarding.completed` linking to Settings.
- **FR-12** Plan check: `POST /tenants` counts the user's owned tenants against nothing at MVP (no per-user cap); partner default plan `max_*` limits apply inside the tenant (PLT-15).

#### 5. Non-Functional Requirements
Each step round-trip ≤ 500 ms P95. Wizard is fully keyboard-operable; state dropdown searchable by name or code. Copy in `en`/`hi`; GSTIN uppercase forced; pincode numeric keypad. Works on 320 px width. Bundle for the wizard lazy-loaded (`next/dynamic`).

#### 6. User Flow
Primary: PLT-01 verify (`is_new`) → optional password (PLT-02) → `/onboarding/step/1` name, state, type grid → Continue → tenant created, tokens re-issued, `sessionSlice.activeTenantId` set → step 2 GST radio (Not registered / Composition / Regular) → GSTIN input → checksum ok → legal name & PAN prefilled → Continue → step 3 address → Continue → step 4 language & summary of preset → "Start using {appName}" → dashboard.
Alternates: skip step 2/3; back navigation edits; abandon and resume; GSTIN state mismatch banner; GSTIN already used by another tenant of the same partner → 409 `gstin_in_use` with guidance "Ask the owner to invite you" (canon U(partner_id, gstin)).

#### 7. UI Requirements
Route `app/(onboarding)/onboarding/step/[n]/page.tsx` → `<OnboardingStepPageContent/>` (`features/onboarding`). Components: `OnboardingStepper` (feature-specific, 4 dots with labels; `MLProgress` on mobile), `BusinessTypeGrid` (9 `MLCard` tiles with `lucide-react` icons `Store`, `Warehouse`, `Truck`, `Wrench`, `Scale`, `Factory`, `Briefcase`, `UtensilsCrossed`, `Grid2x2`), `UbField` + `MLInput` (name, legal name, PAN, GSTIN uppercase), `MLRadioGroup` (GST type), `UbCombobox` (state list of 38 GST codes), `UbPhoneInput`, `MLInput inputmode=numeric` (pincode), `MLToggleGroup` (language), `PresetSummaryCard` (feature-specific `MLCard` listing seeded defaults).
Mobile: one step per screen, sticky bottom bar with Back (ghost) and Continue (primary, 44 px). Desktop: two-column — stepper left (248 px), form right in a 560 px card; summary on step 4 as a two-column definition list.

| Field | Input | Rules |
|---|---|---|
| name | `MLInput` | 2–160 chars |
| business_type | tile grid | required |
| state_code | `UbCombobox` | required, 2-digit GST code |
| gst_type | radio | required, default `unregistered` |
| gstin | `MLInput` uppercase, monospace `ds-mono` | regex + checksum when registered |
| legal_name | `MLInput` | ≤ 200 |
| pan | `MLInput` uppercase | `^[A-Z]{5}[0-9]{4}[A-Z]$`, equals GSTIN[2:12] when GSTIN given (warning) |
| address.line1/line2/city/district | `MLInput` | ≤ 120 each |
| address.pincode | numeric | `^[1-9][0-9]{5}$` |
| phone | `UbPhoneInput` | mobile regex; default user mobile |
| email | `MLInput type=email` | optional |
| locale | toggle | `en`/`hi` |

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `onboarding.step1.title` | Tell us about your business | अपने व्यापार के बारे में बताएँ |
| `onboarding.name.label` | Business name | व्यापार का नाम |
| `onboarding.type.label` | What kind of business? | किस तरह का व्यापार? |
| `onboarding.type.retail` | Retail shop | खुदरा दुकान |
| `onboarding.type.wholesale` | Wholesale | थोक व्यापार |
| `onboarding.type.distribution` | Distributor / agency | वितरक / एजेंसी |
| `onboarding.type.services` | Services | सेवाएँ |
| `onboarding.type.trader` | Trader / mandi | व्यापारी / मंडी |
| `onboarding.type.manufacturer` | Manufacturer / job work | निर्माता / जॉब वर्क |
| `onboarding.type.professional` | Professional | पेशेवर |
| `onboarding.type.food` | Food / restaurant | खाना / रेस्टोरेंट |
| `onboarding.type.other` | Other | अन्य |
| `onboarding.step2.title` | GST details | जीएसटी विवरण |
| `onboarding.gst.unregistered` | Not registered under GST | जीएसटी में पंजीकृत नहीं |
| `onboarding.gst.composition` | Composition scheme | कंपोज़िशन स्कीम |
| `onboarding.gst.regular` | Regular GST | नियमित जीएसटी |
| `onboarding.gstin.label` | GSTIN | जीएसटीआईएन |
| `onboarding.gstin.stateMismatch` | GSTIN belongs to {state}. Use it? | जीएसटीआईएन {state} का है। इसे इस्तेमाल करें? |
| `onboarding.step3.title` | Address | पता |
| `onboarding.step4.title` | Almost done | लगभग हो गया |
| `onboarding.finish` | Start using {appName} | {appName} इस्तेमाल शुरू करें |
| `onboarding.skip` | Skip for now | अभी छोड़ें |

Business type tiles show a one-line hint of what they turn on ("Stock, bills, udhaar"). Copy avoids "tenant"; the UI says "business". Default GST choice is "Not registered". Summary step wording: "You can change all of this in Settings."

#### 9. States
Initial (step 1 empty) · Loading (step submit; Continue shows spinner) · Empty (n/a) · Success (step advances; snackbar only on final) · Error (field errors; 409 `gstin_in_use` banner with support contact from partner) · Disabled (Continue until required fields valid) · Partial (resume at `onboarding_step+1`, earlier steps ticked) · Processing (final step applying preset ≤ 1 s, button "Setting up…") · Completed (dashboard first-use state) · Failed (preset application error → 500 with request id; wizard stays on step 4 with Retry; tenant remains with `onboarding_step=3`).

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| name | 2–160 chars, trimmed | Enter your business name | `validation_error` |
| business_type | in enum of `platform_tenant.business_type` | Choose a business type | `validation_error` |
| state_code | in GST state list | Choose your state | `validation_error` |
| gstin | regex; checksum; required when `gst_type≠unregistered`; unique per partner among non-deleted tenants | Invalid GSTIN / This GSTIN is already registered with another business | `validation_error` / `gstin_in_use` (409) |
| gstin vs state | `gstin[0:2] == state_code` | warning `gstin_state_mismatch` | `warnings[]` |
| pan | regex; equals `gstin[2:12]` when both | PAN does not match GSTIN | warning |
| pincode | `^[1-9][0-9]{5}$` | Enter a 6-digit PIN code | `validation_error` |
| phone | mobile regex | Enter a valid mobile number | `validation_error` |

GSTIN checksum (normative, shared `utils/gstin.ts` and `tax/validators.py`): alphabet `0-9A-Z` → 0–35; for positions 1–14 multiply by factor alternating 1,2,1,2…; for each product `p`, add `p // 36 + p % 36`; `check = (36 − sum % 36) % 36`; compare to char 15. Yup: `gstinValidation()` runs regex + checksum; `onboardingStep1Schema`, `onboardingStep2Schema`, `onboardingStep3Schema` in `useValidationSchemas`.

#### 11. Business Rules
- **BR-1** One tenant per GSTIN per partner (canon Part 21 §21.3.1).
- **BR-2** `gst_type` determines allowed sales kinds (SAL-02): `unregistered` → estimates only for tax-free documents (no `invoice`), `composition` → `bill_of_supply`, `regular` → `invoice` and `bill_of_supply`.
- **BR-3** Preset application is idempotent (uses `get_or_create` on settings, sequences, categories) and audited once.
- **BR-4** FY label for sequences = `YYYY-YY` from `fy_start_month` (default 4) and tenant timezone.
- **BR-5** The creating user's membership is `owner`; ownership can be added to other members later (PLT-05) but the creator remains an owner until another owner demotes them.
- **BR-6** `platform_tenant.phone` defaults to the owner's mobile; `email` optional.
- **BR-7** The creator's `platform_user.full_name` is prompted on step 1 if empty ("Your name") and saved via `PATCH /auth/me`? Not in canon — saved through `POST /auth/password/set` companion? **Decision:** step 1 also posts `owner_name` inside `POST /tenants`, which the service writes to `platform_user.full_name` when blank (documented in the CCR for `POST /tenants`).

#### 12. Permissions
`POST /tenants`: any authenticated user. `PATCH /tenants/current` during onboarding: `platform.tenant.manage` (owner has it). Staff/accountant never see the wizard (they join tenants already onboarded).

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| Create business | ✅ (any user) | ✅ (as a new owner of a new business) | ✅ (idem) | ✅ (idem) |
| Complete/edit wizard for current tenant | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
- **EC-1** User refreshes after step 1: tokens carry `tid`; `/auth/me` gives `onboarding_step=1` → step 2.
- **EC-2** GSTIN of a composition dealer typed under "Regular": no external verification at MVP; `gst_type` is trusted; help hint explains the difference.
- **EC-3** Union Territories without legislature (e.g. state code 04 Chandigarh): tax split is UTGST, rendered as "UTGST" label in SAL-02; onboarding just stores `state_code`.
- **EC-4** State code `97` (Other Territory) accepted; `99` (Centre jurisdiction) rejected.
- **EC-5** Owner already has tenants and creates another from PLT-04: same wizard, `is_default` stays with the existing default.
- **EC-6** Partner has `allowed_modules` without `inventory`: preset silently drops inventory; summary shows "Stock: not available in your plan".
- **EC-7** Network drop after `POST /tenants` succeeded but response lost: retry with same `Idempotency-Key` replays the created tenant (CCR requires the header on `POST /tenants`).

#### 14. API Requirements
- `POST /tenants` (CCR-1) `{name, business_type, state_code, locale, owner_name?}` + `Idempotency-Key` → 201 `{data: {tenant, membership, access_token?}}` + new cookies with `tid`.
- `PATCH /tenants/current` per Part 22 §22.3 with `onboarding_step` accepted as a field (CCR-2) and `warnings[]` in `meta`.
- `GET /auth/me` for resume. `GET /roles` not needed.
Frontend: `onboardingService.ts` (`createTenant`, `updateTenant`), `onboardingThunk.ts` (`createTenant`, `saveGstStep`, `saveAddressStep`, `completeOnboarding`), `onboardingSlice.ts` (`step`, `draft` per step, `warnings`, `status`), constants `BUSINESS_TYPES`, `GST_STATES` (code→name en/hi), `PRESETS` (client copy of FR-7 for the summary only; server is authoritative).

#### 15. Database Impact
Inserts: `platform_tenant`, `platform_membership`, `platform_tenant_setting` (≈ 9 rows), `platform_document_sequence` (12 rows for current FY), `inventory_location` (MAIN), `expenses_category` (9 system + 0–3 preset), `notifications_notification`. Updates: `platform_tenant` (gst, address, locale, `onboarding_step`, `enabled_modules`), `platform_user.full_name`, `platform_user.locale`. Reads: `platform_partner`, `platform_plan`. Unique checks: `U(partner_id, gstin)`.

#### 16. Audit Requirements
`tenant.created` (after: name, business_type, state_code, partner_id, plan_id), `tenant.updated` (before/after changed fields per step), `tenant.preset_applied` (metadata: business_type, modules, settings keys), `member.created` (owner). Actor = the user.

#### 17. Notifications
In-app `onboarding.completed` to the owner: "Your business is ready. Set up your GST, bank and UPI details in Settings." No SMS.

#### 18. Analytics / Event Tracking
`ub.platform.onboarding_step_viewed {step}`, `ub.platform.onboarding_step_completed {step, skipped}`, `ub.platform.tenant_created {business_type, gst_type, state_code, locale}`, `ub.platform.onboarding_completed {duration_s}`, `ub.platform.onboarding_abandoned {last_step}` (computed nightly from `onboarding_step<4` and `created_at` > 24 h).

#### 19. Security
Tenant creation limited to authenticated users; new tokens minted with the new `tid` only after the membership is committed; GSTIN validated server-side regardless of client; address/PII stored in `jsonb` under tenant scope; no GSTIN lookup to external services at MVP (no data leaves the server).

#### 20. Performance
Preset application runs in one transaction with bulk inserts (`bulk_create` for sequences and categories) — ≤ 150 ms. Wizard assets lazy-loaded. State list bundled as JSON (38 rows).

#### 21. Testing
- **T-PLT-03-1** unit: GSTIN checksum against 20 known valid/invalid values (`27AAPFU0939F1ZV` valid).
- **T-PLT-03-2** unit: preset table → expected settings for each of 9 types (snapshot test).
- **T-PLT-03-3** API: `POST /tenants` creates tenant + owner membership + tokens with `tid`.
- **T-PLT-03-4** API: duplicate GSTIN within partner → 409 `gstin_in_use`; same GSTIN under another partner → allowed.
- **T-PLT-03-5** API: state mismatch returns `warnings[]` not error.
- **T-PLT-03-6** API: completion is idempotent (second call creates no duplicate settings/sequences).
- **T-PLT-03-7** API: `enabled_modules` intersected with partner `allowed_modules`.
- **T-PLT-03-8** component: `BusinessTypeGrid` selection and keyboard navigation.
- **T-PLT-03-9** E2E: full wizard as `retail`, `regular`; dashboard shows first-use state; Settings shows `INV` numbering.
- **T-PLT-03-10** E2E: abandon at step 2, re-login, resume at step 3.
- **T-PLT-03-11** permission: staff hitting `/onboarding` is redirected to dashboard.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a verified new user, when I enter a name, state and type, then a business exists and I am its owner within one request.
- **AC-2 (US-2)** Given a valid GSTIN, when I enter it, then PAN and state are prefilled and only a mismatch produces a warning.
- **AC-3 (US-3)** Given I skip GST, when I finish, then `gst_type=unregistered` and sales default kind is `estimate`.
- **AC-4 (US-4)** Given I left at step 2, when I log in again, then the wizard opens at step 3 with step 1–2 marked done.
- **AC-5 (US-5)** Given a completed wizard, when I open Settings, then every seeded value from the preset table is present and editable.

#### 23. Dependencies
PLT-01/02 (session), PLT-04 (`tid` re-issue), PLT-06 (settings keys), PLT-07 (profile fields), PLT-15 (plan modules), WLB-02 (partner allowed modules, default plan), INV-04 (units seed), EXP-02 (categories), tax seed command (`seed_tax_rates`).

#### 24. Future Enhancements
GSTIN verification via GSTN public API/GSP (P3, with SAL-12); business-type-specific sample data ("try with demo data"); partner-defined presets (WLB-04); multi-language beyond `hi` (P2).

---

### PLT-04 — Multiple businesses & switch

#### 1. Business Objective
Let one person run or work in several businesses (two shops, a shop plus a godown firm, a CA serving many clients) from one login, with strict data separation: parties, ledgers and documents never mix, and every request is bound to exactly one tenant through the token. Success measures: switch completes ≤ 1 s; zero cross-tenant data incidents (tested by the isolation suite); ≥ 95 % of multi-tenant users have a default set.

#### 2. User Personas
OW (owns several businesses), AC (member of many clients' tenants), ST (rarely — one person helping two family shops).

#### 3. User Stories
1. **US-PLT-04-1** — As an owner of two shops, I want to switch between them from the header so that I record each shop's udhaar separately.
2. **US-PLT-04-2** — As a CA, I want the app to open in my most-used client by default and let me pick another quickly.
3. **US-PLT-04-3** — As an owner, I want to create another business from the switcher and go through the short wizard again.
4. **US-PLT-04-4** — As an owner, I want to be certain that data from business A is never shown while I am in business B, even in a stale tab.

#### 4. Functional Requirements
- **FR-1** The header (desktop `UbPageHeader` left slot; mobile "More" tab) shows the active tenant name and a switcher `MLDropdownMenu` listing all memberships with `status ∈ {active, invited}` from `sessionSlice.tenants`, grouped "Your businesses" and "Invitations".
- **FR-2** Selecting a tenant dispatches `switchTenant` → `POST /auth/switch-tenant {tenant_id}` → server verifies an `active` membership (403 `permission_denied` otherwise), issues new access + refresh cookies with `tid`, `rol`, `ver`, and returns the same body as `/auth/me`.
- **FR-3** After switching, the client resets **all** feature slices to initial state (`store.dispatch(resetTenantScopedState())` — a root reducer action every feature slice handles), clears in-memory caches, and navigates to `/dashboard`. URL state (tab/date range) is discarded.
- **FR-4** Every API response carries `X-Tenant-Id` (server echo of `tid`); the Axios response interceptor compares it with `sessionSlice.activeTenantId` and, on mismatch (stale tab after a switch in another tab), discards the response, shows `UbStatusBanner` "This business was switched in another tab. Reloading…" and reloads. (CCR-3: response header.)
- **FR-5** "Set as default" toggles `platform_membership.is_default` for the user's own membership via `PATCH /memberships/{id} {is_default: true}` (self-service permitted for own row; other flags require `platform.members.manage`); exactly one default per user (server clears others).
- **FR-6** "Add a business" opens PLT-03 as a new tenant; on success the switcher includes it and it becomes active.
- **FR-7** "Leave business" is available to non-owners on their own membership (`DELETE /memberships/{id}` on self → status `removed`); owners cannot leave while they are the last owner (409 `last_owner`).
- **FR-8** Invitations in the switcher open the acceptance screen (PLT-05) instead of switching.
- **FR-9** Login routing: exactly one active tenant → open it; several with `is_default` → open default; several without default → full-screen chooser (`/switch`); none → PLT-03 or acceptance.

#### 5. Non-Functional Requirements
Switch P95 ≤ 800 ms including dashboard first paint of skeletons; chooser renders ≤ 50 tenants without pagination (≥ 50 → search field appears). Accessible menu (Radix). Offline: switch not possible; menu items disabled with tooltip.

#### 6. User Flow
Primary: header tenant name → menu → tap "Kirana Bhandar (Owner)" → spinner on the row → tokens replaced → slices reset → dashboard skeleton → data for the new tenant.
Alternates: choose "Set as default" from the row's overflow; "Add a business" → wizard; invitation row → acceptance; stale tab detects mismatch and reloads; 403 (membership suspended meanwhile) → snackbar "You no longer have access to this business" and the row is removed after `fetchMe`.

#### 7. UI Requirements
Feature `features/tenant-switcher`: `TenantSwitcherMenu` (`MLDropdownMenu*`, each row: `MLAvatar` initials, name `ds-body-medium`, role `UbStatusBadge` neutral, default star icon), `TenantChooserPage` (`app/(app)/switch/page.tsx`, `MLCard` list, `UbSearchInput` when > 8). Mobile: the switcher lives in the "More" screen as a first card; desktop: top-left of the sidebar rail (dark `--surface-nav`), 248 px, truncates names at 22 chars with tooltip.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `tenant.switcher.title` | Your businesses | आपके व्यापार |
| `tenant.switcher.invitations` | Invitations | आमंत्रण |
| `tenant.switcher.add` | Add a business | नया व्यापार जोड़ें |
| `tenant.switcher.setDefault` | Open this by default | इसे डिफ़ॉल्ट रूप से खोलें |
| `tenant.switcher.leave` | Leave business | व्यापार छोड़ें |
| `tenant.switcher.switched` | Now in {name} | अब {name} में |
| `tenant.switcher.staleTab` | This business was switched in another tab. Reloading… | यह व्यापार दूसरे टैब में बदला गया। रीलोड हो रहा है… |

Leaving requires `UbConfirmDialog` ("You will lose access until invited again"). Switching needs no confirmation. Snackbar "Now in {name}" after every switch.

#### 9. States
Initial (menu closed, active name shown) · Loading (row spinner; menu stays open) · Empty (single tenant: menu shows only "Add a business") · Success (snackbar + dashboard) · Error (403 → snackbar and refresh list; network → retry) · Disabled (offline) · Partial (chooser with search when many) · Processing (slices resetting; skeletons) · Completed · Failed (token issue failure → stay in current tenant, banner with request id).

#### 10. Validation Rules
`tenant_id` must be a UUID and an `active` membership of the caller → else 403 `permission_denied` (not 404, because the resource is the caller's own membership list). `is_default` only `true` accepted (server clears others). Leave: 409 `last_owner` when the caller is the only owner.

#### 11. Business Rules
- **BR-1** The `tid` claim is the only tenant context; `X-Tenant-Id` request header is ignored (Part 22).
- **BR-2** Switching creates a new `platform_session` row in the same `family_id`? **No** — a new family; the old session is revoked (`revoked_at`) so a token can never carry two tenants over time.
- **BR-3** Exactly one `is_default=true` membership per user; when a default membership becomes `suspended|removed`, the default moves to the oldest active membership.
- **BR-4** Parties, items and documents are never shared or netted across tenants (research §A F14).
- **BR-5** Locale follows `platform_user.locale`, not the tenant, when switching.

#### 12. Permissions
Switching and default-setting: any member for their own memberships. Creating a tenant: any user. Leaving: any non-last-owner for self.

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| Switch to a tenant I belong to | ✅ | ✅ | ✅ | ✅ |
| Set my default | ✅ | ✅ | ✅ | ✅ |
| Leave | ✅ unless last owner | ✅ | ✅ | ✅ |

#### 13. Edge Cases
- **EC-1** Membership suspended while active in that tenant: next request → 401 `session_revoked` (server revoked the session on suspend, PLT-05/09) → login → chooser without that tenant.
- **EC-2** Two tabs, switched in one: FR-4 handles via header mismatch.
- **EC-3** Deep link `/parties/{id}` for tenant B while active in A: 404 from the API; page shows error empty state with "Switch business?" listing tenants (client cannot know which; it offers the chooser).
- **EC-4** Tenant `pending_deletion` (PLT-10): still switchable for the owner (read-only banner), hidden for others.
- **EC-5** User with 60 memberships (CA): chooser with search; menu shows 8 most recent (by `platform_session.created_at` per tenant) and "See all".
- **EC-6** Default tenant is in `suspended` status (partner action): chooser opens with the tenant greyed and reason from partner support contact.

#### 14. API Requirements
`POST /auth/switch-tenant {tenant_id}` → 200 `/auth/me` shape + cookies; `PATCH /memberships/{id} {is_default}`; `DELETE /memberships/{id}` (self → leave); `GET /auth/me`. CCR-3: `X-Tenant-Id` response header on all tenant-scoped responses. Frontend: `tenantSwitcherService.ts` (`switchTenant`, `setDefaultMembership`, `leaveMembership`), thunks `switchTenant`, `setDefaultTenant`, `leaveTenant` in `tenantSwitcherThunk.ts`; state in `sessionSlice` (`tenants`, `activeTenantId`, `switching`), root action `resetTenantScopedState` in `src/redux/store.ts`.

#### 15. Database Impact
`platform_session` (insert new, revoke old), `platform_membership.is_default` (update), `platform_membership.status='removed'` (leave), audit log. Reads: memberships joined with tenant and role. Index `U(user_id, tenant_id)`, `IX(tenant_id, status)`.

#### 16. Audit Requirements
`auth.tenant_switched` (tenant_id = target; metadata: from_tenant_id, session ids), `member.default_changed`, `member.left` (before/after status). Actor user.

#### 17. Notifications
None; `member.left` creates in-app notification `team.member_left` for owners of that tenant ("{name} left {business}").

#### 18. Analytics / Event Tracking
`ub.platform.tenant_switched {from_tenant_id, to_tenant_id, source: menu|chooser|login}`, `ub.platform.default_tenant_set`, `ub.platform.tenant_left`.

#### 19. Security
Token rotation on switch; old session revoked; membership check inside the same transaction; `ver` claim carries the target tenant's permission version; response header echo prevents stale-tab leakage; audit of every switch.

#### 20. Performance
Switch = one membership lookup + one session insert + one revoke. `/auth/me` payload ≤ 8 kB for 50 memberships (names only; branding only for the active tenant).

#### 21. Testing
- **T-PLT-04-1** API: switch to member tenant returns new `tid`; old refresh token rejected.
- **T-PLT-04-2** API: switch to non-member → 403; to suspended membership → 403.
- **T-PLT-04-3** API: setting default clears the other default.
- **T-PLT-04-4** API: last owner leave → 409 `last_owner`.
- **T-PLT-04-5** isolation: fixtures with two tenants; every list endpoint under `tid=A` returns zero rows of B (parametrised over all Part 22 list endpoints).
- **T-PLT-04-6** component: interceptor discards response with mismatching `X-Tenant-Id` and dispatches reload banner.
- **T-PLT-04-7** E2E: two businesses; add party in A; switch to B; party list empty; switch back; party present.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given two active memberships, when I pick the other business, then within 1 s the dashboard shows that business's numbers and the header shows its name.
- **AC-2 (US-2)** Given I set a default, when I log in next time, then that business opens directly.
- **AC-3 (US-3)** Given I choose "Add a business", when I complete the wizard, then the new business is active and listed.
- **AC-4 (US-4)** Given a stale tab, when a response for another tenant arrives, then nothing from it is rendered and the tab reloads.

#### 23. Dependencies
PLT-01/02, PLT-03, PLT-05 (invitations), PLT-09 (session revoke), PLT-15 (per-tenant limits unaffected by membership count).

#### 24. Future Enhancements
Consolidated multi-business dashboard (Future, canon §0.3), cross-tenant party copy (not planned), per-tenant locale override.

---

### PLT-05 — Team & roles (system roles)

#### 1. Business Objective
Let an owner bring staff and an accountant into the business with the right amount of access — a helper records entries and bills but never voids or sees financial reports; the CA sees and exports everything but changes nothing — without buying a desktop licence or sharing the owner's login (research §A F15, Part D #1). Success measures: ≥ 30 % of tenants with > 200 entries/month have ≥ 2 members; invitation acceptance ≥ 70 % in 7 days; zero privilege-escalation defects.

#### 2. User Personas
OW (invites, changes roles, suspends), admin (same minus ownership), ST and AC (accept invitations), SA (support).

#### 3. User Stories
1. **US-PLT-05-1** — As an owner, I want to invite a helper by mobile number and choose "Staff" so they can add udhaar and bills from their own phone.
2. **US-PLT-05-2** — As an owner, I want to invite my CA as "Accountant" so they can see reports and export without editing anything.
3. **US-PLT-05-3** — As an owner, I want to let one trusted staff member adjust stock without making them an admin.
4. **US-PLT-05-4** — As an owner, I want to suspend a staff member instantly when they leave so their phone stops working within seconds.
5. **US-PLT-05-5** — As an invited person, I want to see which business invited me and accept with one OTP.
6. **US-PLT-05-6** — As an owner, I want to make my partner a co-owner and later change or remove roles.

#### 4. Functional Requirements
- **FR-1** Team page lists memberships (`GET /memberships?status=`) with tabs Active · Invited · Suspended; columns: member (name, mobile masked `+91 98xxx xx210`), role, status, joined/invited date, last active (from latest `platform_session.created_at`), actions.
- **FR-2** Invite: `POST /memberships/invite {mobile, role, name}` creates `platform_invitation` (`token_hash`, `status='pending'`, `expires_at = now + 7 d`, `invited_by_id`) **and** a `platform_membership` row with `status='invited'` and the chosen `role_id` (so the invited tenant shows in the invitee's `tenants[]`); response 201 includes `share_text` and `join_url` (`https://<host>/join/{token}`) for WhatsApp/SMS. If the mobile already belongs to a user, `accepted_user_id` remains NULL until acceptance.
- **FR-3** Roles offered: `owner`, `admin`, `staff`, `accountant` from `GET /roles` (system rows, `tenant_id NULL`), with the permission summary from canon §0.9 shown under each option.
- **FR-4** Per-member override: `PATCH /memberships/{id} {permissions_override: {"allow": ["inventory.stock.adjust"], "deny": []}}` — MVP UI exposes exactly two switches for staff: "Can adjust stock" (`inventory.stock.adjust`) and "Can void bills" (`sales.invoice.void`, `purchases.bill.void`, `payments.payment.void`); other codenames only via API.
- **FR-5** Effective permissions = role `permissions[]` ∪ `override.allow` − `override.deny`; computed by `services.permissions.effective(membership)`; cached in the JWT `ver` claim scheme — any change bumps `membership.permissions_version` (CCR-4: column) so open sessions re-fetch `/permissions/me` on the next request and the server re-checks on every request anyway.
- **FR-6** Change role: `PATCH /memberships/{id} {role}`; demoting the **last** owner → 409 `last_owner`; promoting to `owner` requires the caller to be an owner (admins cannot create owners).
- **FR-7** Suspend / reactivate: `PATCH /memberships/{id} {status: suspended|active}`; suspending revokes all the member's `platform_session` rows for this tenant immediately (PLT-09) so the next request returns 401.
- **FR-8** Remove: `DELETE /memberships/{id}` → `status='removed'`, sessions revoked, `created_by` FKs untouched (history keeps the name). Removing the last owner → 409. Removing an `invited` membership revokes the invitation (`status='revoked'`).
- **FR-9** Resend: `POST /memberships/invite` with the same mobile while an invitation is `pending` rotates the token, extends expiry and returns the new share text (no duplicate rows).
- **FR-10** Acceptance: `GET /public/invitations/{token}` (CCR-5) returns `{tenant_name, role, inviter_name, expires_at, mobile_hint}` for the `/join/{token}` page; the invitee verifies OTP on the invited mobile (PLT-01, purpose `login`); `POST /invitations/{token}/accept` (CCR-5) checks the caller's mobile equals `invitation.mobile`, sets invitation `accepted`, `accepted_user_id`, membership `active`, `joined_at`; then the client switches to that tenant (PLT-04).
- **FR-11** Expired invitations (`expires_at < now`) are marked `expired` by the scheduler command `expire_invitations` and shown under the Invited tab with "Resend".
- **FR-12** Plan limit: invite is refused with 403 `plan_limit_reached` (`details: {limit_key: "max_users", limit, used}`) when active + invited memberships ≥ `plan.limits.max_users` (PLT-15).
- **FR-13** Members see their own row with "You"; a member cannot change their own role or suspend themselves (409 `self_change_forbidden`).

#### 5. Non-Functional Requirements
Team list ≤ 100 rows without pagination (page size 100). Suspension effective ≤ 2 s (session revocation is synchronous). All actions keyboard-accessible; role descriptions readable at 13.5 px. Copy in `en`/`hi`. Mobile masked in lists; full mobile visible on the member drawer for owner/admin only.

#### 6. User Flow
Invite: Team → "Invite member" (`UbDrawer`) → name, mobile, role radio (descriptions), staff switches → Send → 201 → `UbShareSheet` "Share invite" (WhatsApp `wa.me/91…?text=`, copy link, SMS via console adapter if configured) → row appears under Invited.
Accept: invitee taps link → `/join/{token}` shows "Ramesh invited you to Kirana Bhandar as Staff" → "Accept" → OTP (mobile prefilled, read-only) → verify → accept → optional set password (PLT-02) → dashboard of that tenant.
Manage: row overflow → Change role / Suspend / Remove → `UbConfirmDialog` (`UbReasonDialog` for remove/suspend, reason ≥ 3 chars stored in audit metadata) → list updates.

#### 7. UI Requirements
Route `app/(app)/settings/team/page.tsx` → `<TeamPageContent/>` (`features/team`). Components: `UbPageHeader` (title, "Invite member" primary), `UbTabs` (Active/Invited/Suspended with counts), `UbDataGrid` (cards on mobile: avatar, name, role badge, status badge, overflow), `InviteMemberDrawer` (`UbDrawer` + `UbForm`), `RoleRadioGroup` (`MLRadioGroup`, each option with `ds-caption` description), `MemberDetailDrawer` (mobile full, role, overrides `MLSwitch`, last active, sessions link), `UbShareSheet`, `UbConfirmDialog`, `UbReasonDialog`, `UbStatusBadge` (active success, invited info, suspended warning, removed neutral).
Desktop: grid with columns Member · Role · Status · Last active · Actions; drawer right 480 px. Mobile: cards; invite via `UbFab`; drawer bottom sheet.

| Field | Input | Rules |
|---|---|---|
| name | `MLInput` | 2–120 |
| mobile | `UbPhoneInput` | regex; not the caller's own; not an existing active member |
| role | `RoleRadioGroup` | one of four; `owner` visible only to owners |
| Can adjust stock | `MLSwitch` (staff only) | maps to override allow |
| Can void bills | `MLSwitch` (staff only) | maps to three codenames |

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `team.title` | Team | टीम |
| `team.invite.cta` | Invite member | सदस्य जोड़ें |
| `team.invite.title` | Invite a team member | टीम सदस्य को आमंत्रित करें |
| `team.role.owner` | Owner — full control, cannot be removed by others | मालिक — पूरा नियंत्रण |
| `team.role.admin` | Admin — everything except deleting the business | एडमिन — व्यापार हटाने के अलावा सब कुछ |
| `team.role.staff` | Staff — add parties, entries, bills and payments | स्टाफ — पार्टी, एंट्री, बिल और भुगतान जोड़ें |
| `team.role.accountant` | Accountant — view and export everything, no changes | अकाउंटेंट — सब देखें और निकालें, बदलाव नहीं |
| `team.override.stock` | Can adjust stock | स्टॉक बदल सकते हैं |
| `team.override.void` | Can cancel bills and payments | बिल और भुगतान रद्द कर सकते हैं |
| `team.status.invited` | Invited | आमंत्रित |
| `team.status.suspended` | Suspended | निलंबित |
| `team.action.suspend` | Suspend | निलंबित करें |
| `team.action.remove` | Remove | हटाएँ |
| `team.share.text` | {inviter} invited you to {business} on {appName}. Join: {url} | {inviter} ने आपको {appName} पर {business} में आमंत्रित किया है। जुड़ें: {url} |
| `team.limit.reached` | Your plan allows {limit} members. Contact {supportName} to add more. | आपके प्लान में {limit} सदस्य हैं। और जोड़ने के लिए {supportName} से संपर्क करें। |
| `join.title` | {inviter} invited you to {business} | {inviter} ने आपको {business} में आमंत्रित किया |
| `join.accept` | Accept invitation | आमंत्रण स्वीकार करें |

Suspend/remove dialogs list consequences: "Their phone will be logged out immediately. Entries they recorded stay." Undo is not offered (reactivate exists). Role change shows a diff of what they gain/lose (two short bullet lists).

#### 9. States
Initial (skeleton rows) · Loading · Empty (first-use: "Working alone? Invite a helper or your CA." + CTA) · Success (row updated, snackbar) · Error (grid error state with retry) · Disabled (invite button disabled with tooltip when limit reached; own row actions disabled) · Partial (invited rows with "Resend"/"Revoke") · Processing (row spinner during PATCH) · Completed · Failed (409 `last_owner` banner in dialog).

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| mobile | regex; ≠ caller mobile | Enter a valid mobile / You are already a member | `validation_error` |
| mobile | no `active|suspended` membership in tenant | This number is already a member | `validation_error` (`details.mobile`) |
| role | in system roles; `owner` only by owner | Only an owner can add owners | `permission_denied` |
| status change | not on self; not last owner | You cannot change your own role / Add another owner first | `self_change_forbidden` / `last_owner` (409) |
| permissions_override | keys `allow|deny`, values from canon §0.9 codenames | Unknown permission | `validation_error` |
| token (accept) | valid, pending, unexpired, caller mobile matches | This invitation is not for your number / expired | `invitation_invalid` (400) |
| plan | active+invited < max_users | Plan limit reached | `plan_limit_reached` (403) |

Yup `inviteMemberSchema` (`name`, `mobile: mobileValidation()`, `role`), `memberOverrideSchema`.

#### 11. Business Rules
- **BR-1** At least one `owner` with `status=active` at all times.
- **BR-2** System roles are immutable rows (`is_system=true`, `tenant_id NULL`); permissions per canon §0.9: owner = all; admin = all except `platform.tenant.manage` sub-actions delete/ownership/billing (enforced in the service as `tenant.delete`, `member.role=owner` checks); staff = canon list; accountant = all `read` + `export`.
- **BR-3** Overrides may only add codenames that the role lacks or deny codenames it has; overrides never grant `platform.*`.
- **BR-4** Suspension/removal revokes sessions for the tenant only; the user's other tenants are unaffected.
- **BR-5** Invitation token = 32 random bytes base64url; only `sha256` stored; lifetime 7 days; single use.
- **BR-6** Acceptance requires the OTP-verified mobile to equal `invitation.mobile` — links forwarded to someone else fail.
- **BR-7** A removed member can be re-invited; a new membership row is not created — the existing row returns to `invited` (U(user_id, tenant_id)).
- **BR-8** Accountant role may add notes only where a feature explicitly allows it (canon §0.9) — this FRD grants no write.

#### 12. Permissions
`platform.members.manage` for invite/role/suspend/remove/override; `GET /memberships` readable by any member (names and roles are needed for "created by" filters), mobiles masked unless manager.

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| View team | ✅ full | ✅ full | ✅ masked | ✅ masked |
| Invite staff/accountant | ✅ | ✅ | ❌ | ❌ |
| Invite/promote owner | ✅ | ❌ | ❌ | ❌ |
| Change role (non-owner) | ✅ | ✅ | ❌ | ❌ |
| Suspend/remove | ✅ | ✅ (not owners) | ❌ | ❌ |
| Set overrides | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
- **EC-1** Invitee has no account: acceptance creates the user via OTP verify (`is_new=true`), then accept; `tenants[]` immediately lists the tenant as active.
- **EC-2** Invitee's mobile changes before accepting: owner revokes and re-invites.
- **EC-3** Two owners demote each other simultaneously: `SELECT … FOR UPDATE` on the tenant's owner memberships inside the transaction; second request gets 409.
- **EC-4** Invited member is also the owner of another tenant with the same mobile: normal — memberships are per tenant.
- **EC-5** Staff suspended mid-invoice: the pending `POST` returns 401; the draft remains in local storage (SAL-06) for the owner to reassign — not at MVP; the draft is lost server-side only if never saved.
- **EC-6** Plan downgrade below current member count (PLT-15): existing members keep access; new invites blocked; banner on Team.
- **EC-7** Owner tries to remove themself: 409 `self_change_forbidden`; must use "Leave" (PLT-04) when another owner exists.

#### 14. API Requirements
`GET /memberships?status=` (adds `last_active_at`, `mobile_masked`, `permissions_override`), `POST /memberships/invite` → 201 `{data: {invitation: {id, expires_at}, membership, share_text, join_url}}`, `PATCH /memberships/{id} {role|status|permissions_override|is_default}`, `DELETE /memberships/{id}`, `GET /roles`, `GET /permissions/me`; CCR-5 `GET /public/invitations/{token}`, `POST /invitations/{token}/accept`. Errors: 409 `last_owner`, `self_change_forbidden`; 403 `plan_limit_reached`, `permission_denied`; 400 `invitation_invalid`.
Frontend: `teamService.ts` (`fetchMemberships`, `inviteMember`, `updateMembership`, `removeMembership`, `fetchRoles`, `fetchInvitationPreview`, `acceptInvitation`), `teamThunk.ts` (`fetchTeam`, `inviteMember`, `changeRole`, `setOverrides`, `suspendMember`, `reactivateMember`, `removeMember`, `resendInvite`, `acceptInvitation`), `teamSlice.ts` (`items`, `tab`, `roles`, `drawer`, `status`), `permissionsDisplay.ts` (view-model mapping codenames → labels).

#### 15. Database Impact
`platform_invitation` (insert/update status, token rotation), `platform_membership` (insert `invited`; update `status`, `role_id`, `permissions_override`, `joined_at`, `permissions_version` CCR-4), `platform_session.revoked_at` (bulk on suspend/remove), `platform_role` (read), `notifications_message_log` (invite SMS when adapter used), audit. Indexes: `IX(tenant_id, status)` on memberships/invitations; `U(token_hash)`.

#### 16. Audit Requirements
Per Part 21 §21.7: `member.invited` (after: mobile hashed, role), `member.invite_resent`, `member.invite_revoked`, `member.accepted`, `member.role_changed` (before/after role), `member.override_changed` (before/after override), `member.suspended` / `member.reactivated` / `member.removed` (metadata.reason, sessions_revoked). Actor = manager; acceptance actor = invitee.

#### 17. Notifications
In-app to owners/admins: `team.member_joined` ("{name} joined as {role}"). To the member: `team.role_changed` ("Your role in {business} is now {role}"). SMS template `invite` (service-implicit) with `{{inviter}}`, `{{business}}`, `{{url}}` — sent only when the owner chooses "Send SMS" in the share sheet and an adapter is configured (console logs it); WhatsApp via deep link text `team.share.text`.

#### 18. Analytics / Event Tracking
`ub.platform.member_invited {role, overrides_count}`, `ub.platform.invite_shared {channel}`, `ub.platform.invite_accepted {role, days_to_accept}`, `ub.platform.member_role_changed {from, to}`, `ub.platform.member_suspended`, `ub.platform.member_removed`, `ub.platform.invite_limit_hit`.

#### 19. Security
Token hashed; acceptance bound to verified mobile; permission checks server-side on every request via DRF permission classes reading effective permissions (never trusting the client's `permissions[]`); session revocation synchronous; mobiles masked for non-managers; rate limit 30 invites/tenant/day (abuse of SMS); audit with reasons.

#### 20. Performance
Team list is a single query with `select_related(role, user)` and a lateral subquery for last session; effective-permission computation cached per request; `ver` claim avoids permission lookups on hot paths except when versions differ.

#### 21. Testing
- **T-PLT-05-1** unit: effective permissions = role ∪ allow − deny; override cannot grant `platform.*`.
- **T-PLT-05-2** API: invite creates invitation + `invited` membership; response has `join_url`.
- **T-PLT-05-3** API: accept with matching mobile → membership `active`; mismatching → 400.
- **T-PLT-05-4** API: expired token → 400; resend rotates token and old token fails.
- **T-PLT-05-5** API: demote last owner → 409; admin promoting to owner → 403.
- **T-PLT-05-6** API: suspend revokes sessions; the member's next call → 401.
- **T-PLT-05-7** API: invite beyond `max_users` → 403 `plan_limit_reached` with details.
- **T-PLT-05-8** permission: staff calling `PATCH /memberships/{id}` → 403.
- **T-PLT-05-9** component: `RoleRadioGroup` hides owner for admins; staff switches map to codenames.
- **T-PLT-05-10** E2E: owner invites staff, staff accepts via OTP, records an entry, owner suspends, staff gets logged out.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given I am an owner, when I invite a mobile as Staff, then a share link is produced and the row appears under Invited.
- **AC-2 (US-2)** Given an Accountant member, when they open any list, then export works and every write control is hidden and the API refuses writes with 403.
- **AC-3 (US-3)** Given a Staff member with "Can adjust stock" on, when they post a stock adjustment, then it succeeds; with it off, 403.
- **AC-4 (US-4)** Given an active staff session, when I suspend the member, then their next request fails within 2 s and they see the login screen.
- **AC-5 (US-5)** Given an invitation link, when I open it, then I see the business and role before verifying, and after OTP I land in that business.
- **AC-6 (US-6)** Given two owners, when one demotes the other to admin, then it succeeds; when the last owner is demoted, then 409.

#### 23. Dependencies
PLT-01/02 (OTP, password), PLT-04 (switch after accept), PLT-09 (revocation), PLT-15 (max_users), NTF-02/03 (SMS adapter, wa.me), PLT-08 (audit viewer shows these events).

#### 24. Future Enhancements
PLT-12 custom roles & matrix UI (P3), location/tag-scoped access (Zoho §A.34 pattern, P3), approval flow for staff deletions (research F15), staff performance report RPT-11 (P2).

---

### PLT-06 — Tenant settings

#### 1. Business Objective
Give the owner one place to tune how the business behaves — document numbering, default due days, tax and document defaults, credit-limit behaviour, reminder templates, locale and which modules are switched on — so that presets from onboarding are never a cage (Part D #14: progressive disclosure). Every setting is a validated key in `platform_tenant_setting` read by the feature that needs it. Success measures: settings save without a page reload; ≥ 90 % of tenants never need support to change numbering; zero invalid settings persisted (schema validation).

#### 2. User Personas
OW (primary), admin. AC read-only. ST none.

#### 3. User Stories
1. **US-PLT-06-1** — As an owner, I want to set my invoice prefix and starting number so my bills continue my old bill book's series.
2. **US-PLT-06-2** — As an owner, I want to turn inventory off (or on) because my business does not track stock.
3. **US-PLT-06-3** — As an owner, I want to choose whether exceeding a credit limit warns or blocks staff.
4. **US-PLT-06-4** — As an owner, I want to edit the reminder message my customers receive, in Hindi and English.
5. **US-PLT-06-5** — As an owner, I want to change default due days and whether the UPI QR prints on bills.

#### 4. Functional Requirements
- **FR-1** Settings page groups keys into sections: General (locale, number format, FY start read-only), Documents (numbering, `sales.default_kind`, `sales.default_due_days`, `documents.terms`, `documents.show_upi_qr`), Inventory (`inventory.enabled`, `inventory.allow_negative_stock`, `inventory.favourite_units`), Ledger (`ledger.credit_limit_mode`, `ledger.reminder_templates`, `ledger.auto_sms`, `ledger.party_sms_on_entry`), Parties (`parties.labels`), Modules (`enabled_modules` toggles).
- **FR-2** `GET /tenants/current/settings` returns the full object keyed by setting key with `schema_version`; `PUT /tenants/current/settings` replaces the full object; the server validates each key against its JSON schema (`platform/settings_schema.py`) and rejects unknown keys (400 `validation_error`, `details.<key>`).
- **FR-3** Numbering editor: one row per `platform_document_sequence.kind` for the current `fy_label`: prefix (≤ 12 chars, `^[A-Z0-9/\-]{0,12}$`), next number (≥ current `next_number`; lowering is refused with `sequence_backwards`), padding 3–6, reset each FY (`numbering.<kind>.reset_fy`). Preview shows `INV/26-27/0042`. Total length prefix + separator + FY + padded number ≤ 16 characters (Rule 46) — validated.
- **FR-4** `enabled_modules` is edited via `PATCH /tenants/current {enabled_modules}`; options limited to `plan.modules ∩ partner.allowed_modules`; disabling `inventory` is refused (409 `module_has_data`) while any item has `on_hand ≠ 0`; disabling `sales` refused while drafts exist. Disabled modules disappear from `UbSidebar`/`UbBottomNav` and their endpoints return 403 `module_disabled`.
- **FR-5** `ledger.reminder_templates` = `{ "manual": {"en": "...", "hi": "..."}, "auto_d1": {...}, "auto_d0": {...} }` with placeholders `{{party_name}}`, `{{business_name}}`, `{{balance}}`, `{{due_date}}`, `{{upi_link}}`; unknown placeholders rejected; live preview with sample values.
- **FR-6** `ledger.auto_sms` and `ledger.party_sms_on_entry` switches show a `UbStatusBanner` "SMS provider not configured — messages will be logged only" when the partner/tenant has no real SMS provider (from `/auth/me.feature_flags.sms_provider_configured`).
- **FR-7** `locale.number_format` ∈ `{"en-IN", "hi-IN"}`; `locale` (tenant default for new members) `en|hi`.
- **FR-8** Save is per section (each section its own `UbForm` with Save button, dirty-state guard on navigation); the client merges the section into the last fetched object and `PUT`s the whole object with `If-Match: <etag>`; 412 `precondition_failed` → "Settings changed elsewhere. Reload?".
- **FR-9** Every save emits `settings.updated` audit with before/after per changed key, and updates `sessionSlice.activeTenant.settings` so features read new values without reload.
- **FR-10** "Reset to preset" per section restores the PLT-03 preset values for the tenant's `business_type` after `UbConfirmDialog`.

#### 5. Non-Functional Requirements
GET ≤ 150 ms; PUT ≤ 300 ms. Forms accessible; each switch has a description. Copy `en`/`hi`; template editor supports Devanagari input. Settings cached in `sessionSlice` and re-fetched on `ver` change.

#### 6. User Flow
Settings → section tabs (desktop left nav within page; mobile accordion) → edit → Save → snackbar "Saved" → dependent UI updates (e.g. bottom nav loses "Items" when inventory off). Alternates: validation error inline; 412 conflict dialog; module disable refused with a count ("12 items still have stock — adjust them first" linking to INV list filtered `stock=in`).

#### 7. UI Requirements
Route `app/(app)/settings/page.tsx` → `<SettingsPageContent/>` (`features/settings`), sub-routes `settings/documents`, `settings/inventory`, `settings/ledger`, `settings/parties`, `settings/modules`. Components: `SettingsNav` (`MLSidebar`-like list inside the page on desktop; `MLTabs` scrollable on mobile), `NumberingTable` (feature-specific `MLTable` with inline `MLInput`s and preview column `ds-mono`), `ReminderTemplateEditor` (two `MLTextarea` en/hi, placeholder chips insertable via `MLBadge` buttons, preview `MLCard`), `ModuleToggleList` (`MLSwitch` per module with description and lock icon when not in plan), `UbField`, `MLSelect` for enums, `UbHelpHint` on every key.
Desktop: 248 px section nav + 720 px content. Mobile: sections as full-screen pages with back arrow; sticky Save bar.

| Key | Input | Constraints |
|---|---|---|
| `numbering.<kind>.prefix` | `MLInput` uppercase | regex, ≤ 12 |
| `numbering.<kind>.next` | numeric | ≥ current |
| `numbering.<kind>.padding` | `MLSelect` 3–6 | |
| `sales.default_kind` | `MLSelect` | allowed by `gst_type` |
| `sales.default_due_days` | numeric | 0–365 |
| `documents.terms` | `MLTextarea` | ≤ 1000 |
| `documents.show_upi_qr` | switch | requires `upi_vpa` (hint) |
| `inventory.enabled` | switch | see FR-4 |
| `inventory.allow_negative_stock` | switch | |
| `inventory.favourite_units` | multi-select of system units | ≤ 12 |
| `ledger.credit_limit_mode` | `MLRadioGroup` off/warn/block | |
| `ledger.reminder_templates` | editor | placeholders |
| `ledger.auto_sms`, `ledger.party_sms_on_entry` | switch | |
| `parties.labels` | two `MLInput`s | ≤ 20 chars each |
| `locale`, `locale.number_format` | `MLSelect` | |

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `settings.title` | Settings | सेटिंग्स |
| `settings.section.documents` | Bills & numbering | बिल और नंबरिंग |
| `settings.section.inventory` | Stock | स्टॉक |
| `settings.section.ledger` | Udhaar & reminders | उधार और रिमाइंडर |
| `settings.section.parties` | Parties | पार्टियाँ |
| `settings.section.modules` | Features | फ़ीचर |
| `settings.numbering.preview` | Next number: {sample} | अगला नंबर: {sample} |
| `settings.creditLimit.warn` | Warn but allow | चेतावनी दें, पर अनुमति दें |
| `settings.creditLimit.block` | Block until owner approves | मालिक की मंज़ूरी तक रोकें |
| `settings.saved` | Settings saved | सेटिंग्स सेव हुईं |
| `settings.conflict` | Settings were changed elsewhere. Reload to continue. | सेटिंग्स कहीं और बदली गईं। जारी रखने के लिए रीलोड करें। |
| `settings.module.locked` | Not included in your plan | आपके प्लान में शामिल नहीं |
| `settings.reset.preset` | Reset to defaults for {businessType} | {businessType} के डिफ़ॉल्ट पर रीसेट करें |

Defaults are the preset values. Dirty forms prompt "Discard changes?" on navigation. Switch descriptions state the consequence ("Staff will see a warning but can save").

#### 9. States
Initial (skeleton per section) · Loading · Empty (n/a — always has values) · Success (snackbar) · Error (field errors; banner for 500) · Disabled (read-only for accountant: all controls disabled, "View only" badge; locked modules) · Partial (unsaved changes indicator dot on section nav) · Processing (Save button spinner) · Completed · Failed (412 conflict dialog with Reload).

#### 10. Validation Rules
| Key | Rule | Message | Code |
|---|---|---|---|
| prefix | `^[A-Z0-9/\-]{0,12}$`; full number ≤ 16 | Use letters, numbers, / or - (max 12); invoice number too long | `validation_error` |
| next | integer ≥ `next_number` | Cannot go below {current} | `sequence_backwards` (409) |
| default_due_days | 0–365 | Enter 0–365 days | `validation_error` |
| default_kind | allowed by `gst_type` (`invoice` only for regular; `bill_of_supply` for composition/regular; `estimate` any) | Not allowed for your GST type | `kind_not_allowed` |
| reminder template | ≤ 500 chars; placeholders in allowed set; `{{balance}}` present | Unknown placeholder {name} / Include {{balance}} | `validation_error` |
| enabled_modules | subset of allowed; dependency `sales` requires `parties`,`ledger`; `inventory` off requires no stock | Turn off stock first | `module_has_data` (409) |
| parties.labels | 1–20 chars each | | `validation_error` |

Yup: `numberingRowSchema`, `documentSettingsSchema`, `ledgerSettingsSchema`, `reminderTemplateSchema`, `partyLabelsSchema`.

#### 11. Business Rules
- **BR-1** Numbering changes affect only future documents; issued numbers never change; voided numbers are never reused.
- **BR-2** Changing `reset_fy` from true→false keeps the current FY sequence running; a new FY row is created lazily at first allocation with `next_number=1` when reset is true, else continues from the last FY's counter.
- **BR-3** `sales.default_kind` is re-validated when `gst_type` changes (PLT-07) and falls back to the first allowed kind.
- **BR-4** Module toggles do not delete data; re-enabling shows it again.
- **BR-5** Templates fall back to the global default of `notifications_template` when the tenant value is empty.
- **BR-6** `ledger.credit_limit_mode` default `warn` (PTY-06).
- **BR-7** `schema_version` per key; reading an older version applies migration functions in `settings_schema.py`.

#### 12. Permissions
Read: any member with `platform.tenant.manage` or `platform.audit.read`? **Decision:** `GET` is allowed to owner/admin/accountant (accountant needs to know numbering/GST defaults for reconciliation); `PUT` and `PATCH enabled_modules` require `platform.tenant.manage`.

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| View settings | ✅ | ✅ | ❌ | ✅ |
| Edit settings | ✅ | ✅ | ❌ | ❌ |
| Toggle modules | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
- **EC-1** Prefix change mid-FY: subsequent numbers use the new prefix; the GST document-series summary (RPT-07) lists both series for the period.
- **EC-2** Composition tenant sets `default_kind=invoice`: refused `kind_not_allowed`.
- **EC-3** Turning inventory on for a services tenant: MAIN location already exists (seeded); items list becomes visible.
- **EC-4** Template without `{{balance}}` for `auto_d0`: refused — reminders must state the amount (research F7).
- **EC-5** Two admins editing: ETag mismatch → 412 for the second.
- **EC-6** Partner removes a module from `allowed_modules`: nightly `reconcile_entitlements` command removes it from `enabled_modules` and notifies owners (PLT-15).

#### 14. API Requirements
`GET /tenants/current/settings` (ETag header), `PUT /tenants/current/settings` (`If-Match`), `PATCH /tenants/current {enabled_modules}`, `GET /units` (for favourite units), `GET /auth/me` (plan/partner allowed modules). CCR-6: new well-known keys `parties.labels`, `inventory.favourite_units`, `numbering.<kind>.reset_fy`; CCR-7: ETag/`If-Match` on settings (Part 22 lists 412 but not for this endpoint). Frontend: `settingsService.ts` (`fetchSettings`, `saveSettings`, `updateEnabledModules`), `settingsThunk.ts` (`fetchSettings`, `saveSettingsSection`, `toggleModule`, `resetSectionToPreset`), `settingsSlice.ts` (`values`, `etag`, `dirtySections`, `status`), `settingsDisplay.ts` (numbering preview formatter).

#### 15. Database Impact
`platform_tenant_setting` (upsert per key; `schema_version`), `platform_document_sequence` (update `prefix`, `next_number`, `padding` for current FY under `SELECT … FOR UPDATE`), `platform_tenant.enabled_modules`, `platform_tenant.locale`, audit log. Reads: `inventory_item_stock` aggregate for module-off check, `sales_document` drafts count.

#### 16. Audit Requirements
`settings.updated` with before/after per key (full values; templates included), `tenant.modules_changed` (before/after arrays), `numbering.updated` (before/after per kind). Snapshot required (Part 21 §21.7 "Tenant, settings, branding: yes").

#### 17. Notifications
In-app `settings.modules_changed` to all owners when modules change ("{actor} turned off Stock"). None otherwise.

#### 18. Analytics / Event Tracking
`ub.platform.settings_saved {section, keys_changed[]}`, `ub.platform.module_toggled {module, enabled}`, `ub.platform.numbering_changed {kind}`, `ub.platform.settings_reset_preset {section}`.

#### 19. Security
Server-side JSON-schema validation; unknown keys rejected; templates stored as plain text and rendered with HTML-escaping in previews; module gating enforced at the API by `ModuleEnabledPermission` (403 `module_disabled`); ETag prevents lost updates.

#### 20. Performance
Settings object ≤ 10 kB; cached in `sessionSlice`; server caches per tenant in process memory keyed by `updated_at` (no Redis) with invalidation on write.

#### 21. Testing
- **T-PLT-06-1** unit: numbering preview and ≤ 16-char rule.
- **T-PLT-06-2** unit: template placeholder validation (unknown, missing balance).
- **T-PLT-06-3** API: PUT with unknown key → 400 `details.<key>`.
- **T-PLT-06-4** API: lowering `next_number` → 409 `sequence_backwards`.
- **T-PLT-06-5** API: disable inventory with stock → 409 `module_has_data`; with zero stock → 200 and items endpoints → 403 `module_disabled`.
- **T-PLT-06-6** API: stale `If-Match` → 412.
- **T-PLT-06-7** permission: accountant GET 200, PUT 403; staff GET 403.
- **T-PLT-06-8** component: `ModuleToggleList` shows lock for modules outside the plan.
- **T-PLT-06-9** E2E: change prefix to `KB`, issue invoice, number starts `KB/`.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given prefix `INV` next 42, when I set prefix `KB` and next 500, then the next issued invoice is `KB/26-27/0500`.
- **AC-2 (US-2)** Given no stock on hand, when I turn Stock off, then Items disappears from navigation and `/items` returns 403 `module_disabled`.
- **AC-3 (US-3)** Given `block` mode, when staff exceed a party's limit, then the entry is refused (PTY-06).
- **AC-4 (US-4)** Given an edited Hindi template with `{{balance}}`, when a reminder is sent, then the message uses my text (LED-06).
- **AC-5 (US-5)** Given due days 30 and QR on, when I create an invoice, then due date defaults to +30 days and the QR renders.

#### 23. Dependencies
PLT-03 (presets), PLT-07 (gst_type), PLT-15 (plan modules), WLB-02 (partner allowed modules), SAL-02, INV-06, PTY-06, LED-06/07/08, NTF-02.

#### 24. Future Enhancements
Custom fields (Zoho §A.36 pattern, P3), transaction date locking (Zoho §A.35, P3), per-location numbering (P2 with INV-11), thermal template settings (SAL-03 P2).

---

### PLT-07 — Business profile & documents header

#### 1. Business Objective
Hold the legal and contact identity that prints on every estimate, invoice, statement and receipt — legal name, trade name, GSTIN, PAN, address, phone, bank details, UPI VPA, signature and terms — so documents are GST-compliant (Rule 46 supplier fields) and customers can pay from the paper. Success measures: 100 % of issued tax invoices carry supplier GSTIN and address; ≥ 60 % of registered tenants add a UPI VPA within 7 days.

#### 2. User Personas
OW, admin. AC reads.

#### 3. User Stories
1. **US-PLT-07-1** — As an owner, I want my shop's address, phone and GSTIN printed on every bill without retyping.
2. **US-PLT-07-2** — As an owner, I want to add my bank details and UPI ID so customers can pay against the bill.
3. **US-PLT-07-3** — As an owner, I want to upload my signature so bills look complete.
4. **US-PLT-07-4** — As an owner who registered for GST after starting, I want to switch from unregistered to regular and start issuing tax invoices.

#### 4. Functional Requirements
- **FR-1** Profile page reads `GET /tenants/current` and edits via `PATCH /tenants/current`: `name` (trade name), `legal_name`, `business_type`, `gst_type`, `gstin`, `pan`, `address`, `state_code`, `phone`, `email`, `bank_details {account_name, account_number, ifsc, bank_name, branch}`, `upi_vpa`.
- **FR-2** Signature image and logo are uploaded via `PUT /tenants/current/branding` multipart (`signature`, `logo`) — the file becomes `files_attachment` (`kind='signature'|'logo'`) and `platform_tenant.branding.signature_attachment_id`/`logo_attachment_id` are set (WLB-01 owns the colour/app-name half of branding; PLT-07 owns signature and legal footer text `doc_footer`? **Decision:** `doc_header`/`doc_footer` belong to WLB-01; PLT-07 owns `documents.terms` via PLT-06 and the signature upload).
- **FR-3** GSTIN edit applies regex + checksum; state is derived and a mismatch with `state_code` yields `warnings[]`; PAN is auto-filled from GSTIN when empty.
- **FR-4** `gst_type` change rules (Part 22 §22.3): `regular → composition|unregistered` refused with 409 `gst_type_locked` while any `invoice`-kind sales document with status ≠ `draft` exists in the current FY; `unregistered → regular` requires `gstin`; on any change `sales.default_kind` is re-validated (PLT-06 BR-3) and a notification explains the new document kinds.
- **FR-5** `upi_vpa` validated `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$`; a live `UbQrCode` preview renders `upi://pay?pa=<vpa>&pn=<url-encoded name>&cu=INR` (PAY-03) so the owner can scan-test with their own UPI app.
- **FR-6** IFSC validated `^[A-Z]{4}0[A-Z0-9]{6}$`; account number 9–18 digits; bank details are shown on invoice PDFs when `documents.show_bank_details`? Not a canon key — bank details print whenever present (no toggle at MVP).
- **FR-7** Document header preview (`DocumentHeaderPreview`, the same React print component used by SAL-03 A4 template) updates live while editing: logo, legal/trade name, address, GSTIN, phone, email.
- **FR-8** Fields are frozen into `party_snapshot`/`supplier_gstin_snapshot` at issue time; editing the profile never alters issued documents (Part 21 §21.3.7).
- **FR-9** `phone` and `email` on the profile are the tenant's business contact (printed); they are independent of the owner's login mobile.

#### 5. Non-Functional Requirements
Image upload ≤ 2 MB, resized server-side with Pillow to max 600 px width (logo) / 400 px (signature), PNG/JPEG/WebP; P95 upload ≤ 1.5 s on 4G. Bank fields masked in list views (`••••1234`). All copy `en`/`hi`. Preview matches print output pixel-for-pixel because it is the same component.

#### 6. User Flow
Settings → Business profile → edit fields → live header preview → Save → snackbar. Signature: tap the signature box → `UbFileUpload` (camera or gallery on mobile) → crop-free upload → preview updates. GST switch: change radio → GSTIN required → Save → success or 409 explanation with count of tax invoices this FY.

#### 7. UI Requirements
Route `app/(app)/settings/profile/page.tsx` → `<BusinessProfilePageContent/>` (`features/business-profile`). Components: `UbForm` with sections Identity, GST, Address, Contact, Bank & UPI, Signature; `UbField`s; `MLRadioGroup` (gst_type); `UbCombobox` (state); `UbPhoneInput`; `UbFileUpload` + `UbImagePreview` (signature/logo); `UbQrCode` (VPA preview); `DocumentHeaderPreview` (shared with SAL-03, lives in `features/documents-print`).
Desktop: two columns — form 560 px left, sticky preview card right. Mobile: single column; preview collapsed under an "Preview bill header" `MLCollapsible`.

| Field | Input | Rules |
|---|---|---|
| name | `MLInput` | 2–160 |
| legal_name | `MLInput` | ≤ 200 |
| business_type | `MLSelect` | enum |
| gst_type | radio | enum |
| gstin | `MLInput` uppercase `ds-mono` | regex + checksum |
| pan | `MLInput` uppercase | regex |
| address.* | `MLInput`s | pincode regex |
| state_code | combobox | GST codes |
| phone | `UbPhoneInput` | mobile regex |
| email | email | optional |
| bank_details.account_name | text | ≤ 120 |
| bank_details.account_number | numeric text | 9–18 digits |
| bank_details.ifsc | uppercase | IFSC regex |
| bank_details.bank_name / branch | text | ≤ 80 |
| upi_vpa | text | VPA regex |
| signature / logo | `UbFileUpload` | ≤ 2 MB image |

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `profile.title` | Business profile | व्यापार प्रोफ़ाइल |
| `profile.tradeName` | Shop / trade name | दुकान / व्यापार का नाम |
| `profile.legalName` | Legal name (as on GST) | कानूनी नाम (जीएसटी के अनुसार) |
| `profile.bank.title` | Bank details | बैंक विवरण |
| `profile.upi.label` | UPI ID | यूपीआई आईडी |
| `profile.upi.hint` | Scan this with any UPI app to test | किसी भी यूपीआई ऐप से स्कैन करके जाँचें |
| `profile.signature.label` | Signature | हस्ताक्षर |
| `profile.gst.locked` | You issued {count} tax invoices this year. GST type can change from 1 April. | आपने इस वर्ष {count} टैक्स इनवॉइस जारी किए। जीएसटी प्रकार 1 अप्रैल से बदल सकता है। |
| `profile.saved` | Profile saved | प्रोफ़ाइल सेव हुई |

Save confirms nothing except GST type changes (`UbConfirmDialog` listing what changes: "Bills will become Tax Invoices with GST lines"). No undo; audit keeps before/after.

#### 9. States
Initial (skeleton form) · Loading · Empty (fields blank with hints; preview shows placeholders "Your business name") · Success · Error (inline; 409 banner) · Disabled (accountant view-only) · Partial (upload progress bar in signature box) · Processing (Save spinner) · Completed · Failed (upload rejected: type/size message).

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| gstin | regex + checksum; required when registered; unique per partner | Invalid GSTIN / already used | `validation_error` / `gstin_in_use` |
| pan | `^[A-Z]{5}[0-9]{4}[A-Z]$`; equals gstin[2:12] | PAN does not match GSTIN (warning) | warning |
| gst_type | transition rule FR-4 | see copy | `gst_type_locked` (409) |
| upi_vpa | VPA regex | Enter a valid UPI ID like name@bank | `validation_error` |
| ifsc | `^[A-Z]{4}0[A-Z0-9]{6}$` | Enter a valid IFSC | `validation_error` |
| account_number | `^\d{9,18}$` | 9–18 digits | `validation_error` |
| pincode | `^[1-9][0-9]{5}$` | 6-digit PIN | `validation_error` |
| image | type in {png,jpeg,webp}; ≤ 2 MB | Use a PNG or JPG under 2 MB | `validation_error` |

Yup: `businessProfileSchema` (uses `gstinValidation()`, `panValidation()`, `upiVpaValidation()`, `ifscValidation()`, `pincodeValidation()`).

#### 11. Business Rules
- **BR-1** Supplier fields printed on tax documents: legal_name (fallback name), address, GSTIN, state name+code, phone; per Rule 46.
- **BR-2** `state_code` is the supplier state for the intra/inter-state decision (SAL-02); changing it affects only future documents.
- **BR-3** GSTIN uniqueness per partner among tenants not `deleted`.
- **BR-4** Replacing a signature soft-deletes the old attachment (`deleted_at`), GC after 30 days (Part 21 §21.5).
- **BR-5** `upi_vpa` blank disables QR on documents regardless of `documents.show_upi_qr`.

#### 12. Permissions
`platform.tenant.manage` to edit; owner/admin/accountant read. Bank account number unmasked only to owner/admin.

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| View profile | ✅ | ✅ | ❌ | ✅ (bank masked) |
| Edit profile | ✅ | ✅ | ❌ | ❌ |
| Change GST type | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
- **EC-1** GSTIN typed lowercase: uppercased client- and server-side.
- **EC-2** Tenant moves state (new GSTIN): both GSTIN and state change together; warning cleared.
- **EC-3** Composition → regular mid-year: allowed; `bill_of_supply` remains available; `invoice` unlocked.
- **EC-4** Signature photo with transparent background: preserved (PNG); JPEG gets white background.
- **EC-5** Very long legal names on 80 mm thermal: template wraps at 32 chars (SAL-03).
- **EC-6** VPA valid format but non-existent: not verifiable at MVP; hint tells the owner to scan-test.

#### 14. API Requirements
`GET /tenants/current`, `PATCH /tenants/current` (fields above; `warnings[]` in `meta`; 409 `gst_type_locked`, `gstin_in_use`), `PUT /tenants/current/branding` (multipart `signature`, `logo`), `GET /tenants/current/branding`. Frontend: `businessProfileService.ts` (`fetchTenant`, `updateTenant`, `uploadBrandingFiles`), `businessProfileThunk.ts` (`fetchBusinessProfile`, `saveBusinessProfile`, `uploadSignature`), `businessProfileSlice.ts`; shared `tenantSlice` not used — profile lives in `sessionSlice.activeTenant` after save.

#### 15. Database Impact
`platform_tenant` (name, legal_name, business_type, gst_type, gstin, pan, address, state_code, phone, email, bank_details, upi_vpa, branding.signature_attachment_id), `files_attachment` (insert `kind='signature'|'logo'`, soft delete old), audit. Reads: `sales_document` count for lock rule (`IX(tenant_id, kind, status, document_date)`).

#### 16. Audit Requirements
`tenant.updated` with before/after of changed fields (bank account number stored masked in the snapshot: last 4 digits), `tenant.gst_type_changed` (before/after, count of invoices), `branding.signature_updated` (attachment ids).

#### 17. Notifications
In-app to owners on GST type change: `tenant.gst_type_changed` ("Your bills are now {kind}. Check numbering in Settings").

#### 18. Analytics / Event Tracking
`ub.platform.profile_saved {fields_changed[]}`, `ub.platform.gst_type_changed {from, to}`, `ub.platform.upi_vpa_set`, `ub.platform.signature_uploaded`.

#### 19. Security
Bank details and PAN are PII: masked in reads for accountants, excluded from exports except the owner's DPDP bundle (PLT-10); upload content-type sniffed server-side (Pillow verify), EXIF stripped, stored under tenant-scoped `storage_key`; attachments served through an authenticated endpoint (no public bucket) except when embedded in public document pages (SAL-03) via signed URLs.

#### 20. Performance
Single-row read/write; image processing ≤ 300 ms; preview re-render debounced 150 ms.

#### 21. Testing
- **T-PLT-07-1** unit: VPA, IFSC, PAN validators.
- **T-PLT-07-2** API: regular→unregistered with issued invoices → 409 `gst_type_locked`; without → 200 and default_kind re-validated.
- **T-PLT-07-3** API: signature upload creates attachment and sets branding id; old attachment soft-deleted.
- **T-PLT-07-4** API: accountant GET returns masked account number; PATCH → 403.
- **T-PLT-07-5** component: preview reflects typed values live.
- **T-PLT-07-6** E2E: set GSTIN and VPA; issue an invoice; PDF shows GSTIN and scannable QR.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a saved address and GSTIN, when I issue any tax invoice, then the header shows them exactly as saved at issue time even if I edit later.
- **AC-2 (US-2)** Given a valid VPA, when I save, then the preview QR opens my UPI app with the payee prefilled.
- **AC-3 (US-3)** Given a PNG signature, when uploaded, then it appears on the invoice footer.
- **AC-4 (US-4)** Given an unregistered tenant with a valid GSTIN, when I switch to Regular, then Tax Invoice becomes available in Sales.

#### 23. Dependencies
PLT-03 (initial values), PLT-06 (default_kind), WLB-01 (branding endpoint), SAL-02/03 (rendering), PAY-03 (QR), files app.

#### 24. Future Enhancements
Multiple addresses/branches (INV-11 P2), digital signature/DSC for e-invoice (SAL-12 P3), business card share templates (research F14; P2 under WLB-01).

---

### PLT-08 — Audit log viewer

#### 1. Business Objective
Make every change accountable: the owner or accountant can see who did what and when — a reversed entry, a voided bill, a role change, a settings edit — with before/after values for critical entities, so disputes with staff or customers are settled from the record, and GST record-keeping (≥ 72 months) is met. Success measures: any audited action visible in the viewer ≤ 2 s after commit; 100 % of Part 21 §21.7 actions present in tests; P95 filter query ≤ 500 ms at 1 M rows.

#### 2. User Personas
OW, AC (primary readers), admin, SA (via PLT-14 for platform events).

#### 3. User Stories
1. **US-PLT-08-1** — As an owner, I want to see everything my staff did today so that I can spot a wrong entry quickly.
2. **US-PLT-08-2** — As an accountant, I want the history of one invoice (created, issued, voided) with reasons so that I can explain it to the auditor.
3. **US-PLT-08-3** — As an owner, I want to filter by person, action and date and export the result.
4. **US-PLT-08-4** — As an owner, I want to jump from an audit row to the entity it concerns.

#### 4. Functional Requirements
- **FR-1** `GET /audit-logs?entity_type=&entity_id=&actor_id=&action=&date_from=&date_to=&page=&page_size=` returns rows `{id, created_at, actor: {id, name, role} | null, actor_type, action, entity_type, entity_id, entity_label, before, after, metadata: {reason, ip, request_id}}` ordered `-created_at`, page size default 25 max 100.
- **FR-2** The viewer lists rows in `UbDataGrid` with columns When · Who · Action · Entity · Details; the Details cell shows a compact diff (changed keys only) and expands into a `UbDrawer` with full before/after JSON rendered as a two-column table.
- **FR-3** Filters: date range (`UbDateRangePicker`, default today), actor (`UbCombobox` from `GET /memberships` incl. removed), action group (`MLSelect` grouped: Parties, Ledger, Bills, Payments, Stock, Team, Settings, Auth), entity type; search `q` over `entity_label` and `action` (server `ILIKE`).
- **FR-4** `entity_label` is computed server-side from the entity's current row (party name, invoice number, item name, member name) or from `after.name|number` when the row is gone.
- **FR-5** Row action "Open" deep-links to the entity (`/parties/{id}`, `/sales/invoices/{id}`, `/items/{id}`, `/settings/team`), disabled when the entity type has no page.
- **FR-6** Entity-scoped mode: other features embed `AuditTrailPanel` with `entity_type` + `entity_id` fixed (party drawer "History" tab, invoice detail "History") using the same endpoint.
- **FR-7** Export: `GET /audit-logs?format=csv` streams the filtered set ≤ 50 k rows; larger → 202 export job via `reports_export` (`report_name='audit_log'`) polled at `GET /reports/exports/{id}` (RPT-08 mechanism).
- **FR-8** Auth events (`auth.*`) for the tenant's members are shown under the Auth group with hashed mobile replaced by the member name when resolvable; failed logins for unknown mobiles are not shown to tenants (platform-level, PLT-14).
- **FR-9** Retention: rows are never deleted by users; the scheduler's monthly partitioning (P2) and the ≥ 7-year retention are backend concerns; the viewer shows a footer "Records kept for 7 years".

#### 5. Non-Functional Requirements
P95 list ≤ 500 ms with `IX(tenant_id, created_at DESC)`; diff rendering ≤ 16 ms per row (pre-computed `changed_keys` on the server). Screen-reader friendly diff table with headers Field / Before / After. Copy `en`/`hi`; action labels localised from a map of ~60 action codes. Mobile: cards with When/Who/Action and a chevron.

#### 6. User Flow
Reports/More → Activity log → default today → scroll → tap row → drawer with diff → "Open party" → party page. Alternate: set actor = "Suresh (Staff)" + action group Ledger + last 7 days → export CSV → download. Entity mode: party drawer History tab shows only that party's rows.

#### 7. UI Requirements
Route `app/(app)/activity/page.tsx` → `<AuditLogPageContent/>` (`features/audit-log`). Components: `UbPageHeader` ("Activity log", export action), `UbDataGrid` (server pagination; toolbar: `UbDateRangePicker`, `UbCombobox` actor, `MLSelect` action group, `UbSearchInput`), `AuditDiffCell` (feature-specific: up to 3 "field: before → after" lines, `ds-caption`), `AuditDetailDrawer` (`UbDrawer`, `MLTable` diff, metadata list with `request_id` `ds-mono`, reason quoted), `AuditTrailPanel` (embeddable, `UbTimeline` variant grouped by day), `UbStatusBadge` for actor_type (`user` neutral, `system` info, `super_admin` warning).
Desktop: grid 5 columns, drawer 560 px. Mobile: cards; filters in a bottom sheet "Filter" with count badge.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `audit.title` | Activity log | गतिविधि लॉग |
| `audit.filter.actor` | Who | किसने |
| `audit.filter.action` | What | क्या |
| `audit.action.party.created` | Added party | पार्टी जोड़ी |
| `audit.action.ledger.entry.reversed` | Reversed entry | एंट्री उलटी |
| `audit.action.invoice.voided` | Cancelled bill | बिल रद्द किया |
| `audit.action.member.role_changed` | Changed role | भूमिका बदली |
| `audit.action.settings.updated` | Changed settings | सेटिंग्स बदलीं |
| `audit.detail.before` | Before | पहले |
| `audit.detail.after` | After | बाद में |
| `audit.detail.reason` | Reason | कारण |
| `audit.retention` | Records are kept for 7 years | रिकॉर्ड 7 साल तक रखे जाते हैं |
| `audit.empty.today` | Nothing happened today yet | आज अभी तक कुछ नहीं हुआ |

Amounts in diffs use `UbAmount` with ledger colour semantics; timestamps shown in tenant timezone `dd/mm/yyyy, hh:mm`. System actor shown as "System (scheduled job)".

#### 9. States
Initial (today, skeleton) · Loading · Empty (filtered-empty: "No activity for these filters" + Clear; first-use: today empty) · Success · Error (retry + request id) · Disabled (export disabled > 50 k until job path; staff never see the page) · Partial (drawer loading full row when list used sparse fields) · Processing (export job progress `MLProgress`) · Completed (download link snackbar) · Failed (export failed, retry).

#### 10. Validation Rules
`date_to − date_from ≤ 366 days` (400 `validation_error` "Choose a range up to 1 year"); `page_size ≤ 100`; `action` must match `^[a-z_]+(\.[a-z_]+){1,2}$`; `entity_id` UUID.

#### 11. Business Rules
- **BR-1** Append-only: no PATCH/DELETE endpoints exist for audit rows.
- **BR-2** Rows with `tenant_id NULL` (platform events) are never returned to tenant users.
- **BR-3** Sensitive fields are masked at write time by the service layer (passwords excluded; bank account → last 4; mobile in auth events → SHA-256); the viewer never unmasks.
- **BR-4** `actor=null, actor_type=system` for scheduler jobs (overdue refresh, reminders); `super_admin` for PLT-14 impersonation with `metadata.impersonation=true` and consent id.
- **BR-5** Snapshot policy per Part 21 §21.7 — "changed fields" for master data, full row for ledger/payments.

#### 12. Permissions
`platform.audit.read` — owner, admin, accountant. Staff: no access (page hidden, 403).

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| View log | ✅ | ✅ | ❌ | ✅ |
| Export log | ✅ | ✅ | ❌ | ✅ (`reports.export`) |
| Entity history panel | ✅ | ✅ | ❌ (panel hidden) | ✅ |

#### 13. Edge Cases
- **EC-1** Entity deleted (draft invoice hard-deleted): `entity_label` from `after`/`before`; Open disabled.
- **EC-2** Actor removed from the team: name still resolved from `platform_user` (membership `removed`), badge "former member".
- **EC-3** 10 k rows in a day (bulk import): import writes one `import.completed` row with counts, not one per party (IMP-01 rule) — viewer stays usable.
- **EC-4** Clock: rows timestamped server-side UTC; display in tenant timezone.
- **EC-5** Diff of `jsonb` address: nested keys flattened `address.city`.
- **EC-6** Very large `after` (settings templates): drawer truncates at 5 kB with "Show all".

#### 14. API Requirements
`GET /audit-logs` with params in FR-1 plus `q`, `group` (server maps group → action prefixes), `format=csv`; response `meta.page…`; `GET /reports/exports/{id}` for async. Frontend: `auditLogService.ts` (`fetchAuditLogs`, `exportAuditLogs`), `auditLogThunk.ts` (`fetchAuditLogs`, `fetchAuditRow`, `exportAuditLogs`), `auditLogSlice.ts` (`rows`, `filters`, `page`, `selected`, `exportJob`), `auditDisplay.ts` (action label map, diff flattener).

#### 15. Database Impact
Read-only on `platform_audit_log` via `IX(tenant_id, created_at DESC)` and `IX(tenant_id, entity_type, entity_id)`; joins to `platform_user` for actor names; label resolution by batched lookups per entity type (≤ 1 query per type per page). Export writes `reports_export` + `files_attachment` (`kind='export_file'`). CCR-8: add `IX(tenant_id, actor_id, created_at DESC)` for the actor filter.

#### 16. Audit Requirements
Viewing is not audited (read); export is: `audit.exported` (metadata: filters, row_count) per Part 21 §21.7 "Export/Import: request, complete".

#### 17. Notifications
In-app `export.ready` when an async audit export completes (link to download).

#### 18. Analytics / Event Tracking
`ub.platform.audit_viewed {filters_used[], range_days}`, `ub.platform.audit_row_opened {entity_type}`, `ub.platform.audit_exported {row_count, async}`.

#### 19. Security
Tenant scoping via manager; export files stored under tenant key and expire in 7 days; `request_id` displayed to help support without exposing IPs to non-owners (IP shown to owner/admin only); no raw PII beyond what the entity already exposes to the role.

#### 20. Performance
Indexes above; `page_size` capped; label resolution batched; CSV streaming with `StreamingHttpResponse`; monthly partitions from P2 keep the hot partition small.

#### 21. Testing
- **T-PLT-08-1** API: every action in Part 21 §21.7 is emitted by its service (parametrised over fixtures) and visible via the endpoint.
- **T-PLT-08-2** API: tenant A cannot see tenant B rows; platform rows excluded.
- **T-PLT-08-3** API: filters by actor/action/entity/date; range > 366 days → 400.
- **T-PLT-08-4** API: staff → 403; accountant → 200.
- **T-PLT-08-5** unit: diff flattener on nested jsonb; masking of bank/mobile.
- **T-PLT-08-6** component: `AuditDiffCell` shows ≤ 3 lines and "+n more".
- **T-PLT-08-7** E2E: reverse an entry with reason; the row appears with reason and before/after amounts; Open navigates to the party.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given staff activity today, when I open the log, then the rows appear in reverse order with names and actions in my language.
- **AC-2 (US-2)** Given an invoice that was issued and voided, when I filter by that entity, then I see both rows with the void reason.
- **AC-3 (US-3)** Given filters actor + range, when I export, then a CSV with exactly the filtered rows downloads.
- **AC-4 (US-4)** Given a `party.updated` row, when I tap Open, then the party page loads.

#### 23. Dependencies
Service-layer audit writes in every feature; PLT-05 (member names); RPT-08 (export jobs); PLT-14 (platform-level view).

#### 24. Future Enhancements
Monthly partitions (P2), retention policies per partner (P3), tamper-evidence hash chain (P3), webhook stream of audit events (PLT-13).

---

### PLT-09 — Session & device management

#### 1. Business Objective
Show the owner every phone and computer that is logged in to their account, let them log any of them out, and guarantee that role changes, suspensions and password resets take effect on all devices immediately — closing the "staff left with the app still open" hole (research F15). Success measures: revocation effective ≤ 2 s; 100 % of role changes force permission refresh; ≤ 1 support ticket / 1 000 tenants about "still logged in".

#### 2. User Personas
OW (primary), all members for their own sessions, admin (revoke members' sessions in this tenant).

#### 3. User Stories
1. **US-PLT-09-1** — As a user, I want to see my active devices with last-used time and log out the ones I do not recognise.
2. **US-PLT-09-2** — As an owner, I want to log a staff member out of all their devices in my business without removing them.
3. **US-PLT-09-3** — As a user, I want "Log out everywhere" after losing my phone.
4. **US-PLT-09-4** — As an owner, when I change someone's role, I want their app to reflect it immediately.

#### 4. Functional Requirements
- **FR-1** `GET /auth/sessions` (CCR-9) lists the caller's sessions across tenants: `{id, family_id, device_label, user_agent_summary, ip_masked, tenant: {id, name} | null, created_at, last_used_at, expires_at, is_current}` where `revoked_at IS NULL AND expires_at > now`, ordered by `last_used_at desc`.
- **FR-2** `DELETE /auth/sessions/{id}` (CCR-9) revokes one session family (`revoked_at=now` on all rows of the family); the current session cannot be revoked here (use logout) → 409 `current_session`.
- **FR-3** `POST /auth/logout?all=true` revokes every session of the user except the current one? Part 22 says "revokes all" — **Decision:** `all=true` revokes all including current and returns 204; the client then clears state and routes to login.
- **FR-4** Tenant-scoped revocation for managers: `POST /memberships/{id}/revoke-sessions` (CCR-9) revokes the member's sessions whose `tenant_id` equals the current tenant; requires `platform.members.manage`.
- **FR-5** `last_used_at` (CCR-9 column) is updated at most once per 5 minutes per session on refresh or authenticated request to avoid write amplification.
- **FR-6** Permission propagation: every role/override/status change bumps `platform_membership.permissions_version` (CCR-4); the access token carries `ver`; the authentication middleware compares `ver` with the membership row (cheap indexed read cached 30 s in process) and, on mismatch, returns 401 `permissions_changed` to which the Axios interceptor responds by calling `/auth/refresh` (which mints a token with the new `ver` and role) then retrying once; if the membership is no longer active the refresh fails with 401 `session_revoked`.
- **FR-7** Device label defaults from the UA at login (PLT-01); the user can rename it inline (`PATCH /auth/sessions/{id} {device_label}`, CCR-9) ≤ 120 chars.
- **FR-8** Refresh-token theft detection (Part 22): reuse of a rotated refresh token revokes the family and writes audit `auth.session_family_revoked`.
- **FR-9** Sessions expire 30 days after creation regardless of use; expired rows are purged after 90 days by `purge_sessions`.
- **FR-10** In-app notification `security.new_device` to the user on each new session from an unseen `user_agent_summary`+IP prefix ("New login on Chrome, Android · Pune").

#### 5. Non-Functional Requirements
Revocation is a single indexed update; `ver` check adds ≤ 1 ms per request with in-process cache. UI lists ≤ 50 sessions. Accessible list with buttons labelled "Log out {device}". Copy `en`/`hi`.

#### 6. User Flow
Profile → Devices → list with "This device" badge → tap "Log out" on a row → `UbConfirmDialog` → row disappears → snackbar. "Log out everywhere" → confirm → all cleared → login screen. Manager: Team → member drawer → "Log out their devices" → confirm → count in snackbar. Role change (PLT-05) → member's next request 401 `permissions_changed` → silent refresh → UI re-renders with new permissions (sidebar items update).

#### 7. UI Requirements
Route `app/(app)/profile/devices/page.tsx` → `<DevicesPageContent/>` (`features/sessions`). Components: `SessionList` (`MLCard` per session: `lucide-react` icon `Smartphone`/`Monitor`/`Tablet` from UA, label editable via `MLInput` on pencil click, caption "Last used {relative} · {city?}" — city is not derived at MVP; show masked IP), `UbStatusBadge` "This device", `MLButton` destructive-outlined "Log out", `UbConfirmDialog`, page footer button "Log out everywhere". Team drawer gets a "Devices" row with count and action (PLT-05 `MemberDetailDrawer`).
Mobile: single column cards. Desktop: two-column cards within 720 px.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `sessions.title` | Devices | डिवाइस |
| `sessions.current` | This device | यह डिवाइस |
| `sessions.lastUsed` | Last used {when} | अंतिम उपयोग {when} |
| `sessions.logout` | Log out | लॉग आउट |
| `sessions.logoutAll` | Log out everywhere | सभी जगह से लॉग आउट |
| `sessions.logoutAll.confirm` | You will need to log in again on every device. | आपको हर डिवाइस पर फिर से लॉग इन करना होगा। |
| `sessions.member.logout` | Log out their devices | उनके डिवाइस लॉग आउट करें |
| `sessions.permissionsChanged` | Your access was updated | आपकी पहुँच अपडेट हुई |
| `sessions.newDevice` | New login on {device} | {device} पर नया लॉगइन |

Snackbar "Your access was updated" when a silent refresh changes the role. No undo for revocation (the device simply logs in again).

#### 9. States
Initial (skeleton cards) · Loading · Empty (impossible — current session always present) · Success · Error · Disabled (current device's Log out disabled with tooltip) · Partial (rename in progress) · Processing (revoke spinner on card) · Completed · Failed (409 `current_session` toast).

#### 10. Validation Rules
`device_label` 1–120 chars; `session id` must belong to the caller (else 404); manager revoke requires the membership to be in the current tenant (else 404).

#### 11. Business Rules
- **BR-1** A session belongs to one user and (after tenant selection) one tenant; switching tenants creates a new session (PLT-04 BR-2).
- **BR-2** Revocation is by family so an attacker holding an older refresh token is also cut off.
- **BR-3** `ver` mismatch never grants more than the server-side check allows — the server checks effective permissions on every request regardless; `ver` only forces the client refresh.
- **BR-4** Password reset revokes all other sessions (PLT-02); suspension/removal revokes tenant sessions (PLT-05); tenant deletion request revokes non-owner sessions (PLT-10).

#### 12. Permissions
Own sessions: any authenticated user. Members' sessions (tenant-scoped): `platform.members.manage`.

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| List/revoke own | ✅ | ✅ | ✅ | ✅ |
| Revoke member's tenant sessions | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
- **EC-1** Session revoked while a form is half-filled: 401 → the client stores the form draft in `sessionStorage` keyed by route, shows login, and restores after re-login (same user only).
- **EC-2** Two tabs share cookies: revoking "this device" from one tab logs out both (expected; they are one session).
- **EC-3** UA spoofing: labels are cosmetic; security relies on tokens.
- **EC-4** Clock drift on device: expiry evaluated server-side.
- **EC-5** Member has sessions in tenants A and B; owner of A revokes → only A sessions.
- **EC-6** `permissions_version` bumped 3 times quickly: single refresh suffices — the new token carries the latest.

#### 14. API Requirements
CCR-9: `GET /auth/sessions`, `PATCH /auth/sessions/{id}`, `DELETE /auth/sessions/{id}`, `POST /memberships/{id}/revoke-sessions`; existing `POST /auth/logout?all=true`, `POST /auth/refresh`. Error codes: 401 `permissions_changed`, `session_revoked`; 409 `current_session`. Frontend: `sessionsService.ts` (`fetchSessions`, `renameSession`, `revokeSession`, `logoutAll`, `revokeMemberSessions`), `sessionsThunk.ts`, `sessionsSlice.ts` (`items`, `status`); interceptor logic in `src/api/AxiosInstances.ts` (`handle401`: refresh-then-retry once; on `session_revoked` dispatch `sessionSlice.actions.cleared` and route to `/login`).

#### 15. Database Impact
`platform_session` (read by `IX(user_id, revoked_at)`; update `revoked_at`, `device_label`, `last_used_at` CCR-9), `platform_membership.permissions_version` (CCR-4), `notifications_notification` (new device), audit.

#### 16. Audit Requirements
`auth.session_revoked` (metadata: session id, by_self|by_manager, reason), `auth.sessions_revoked_all`, `auth.session_family_revoked` (theft detection), `auth.session_renamed` (no snapshot). Manager revocations carry `tenant_id`.

#### 17. Notifications
In-app `security.new_device` (to self), `security.sessions_revoked` ("An owner logged you out of {business}") to the affected member.

#### 18. Analytics / Event Tracking
`ub.platform.session_revoked {scope: one|all|member}`, `ub.platform.session_renamed`, `ub.platform.permissions_refreshed`, `ub.platform.new_device_login`.

#### 19. Security
Token hashes only; family revocation; `ver` propagation; `last_used_at` throttled to avoid timing side channels; IP masked to /24 in UI; no geolocation lookups (no external calls); logout clears cookies with matching attributes.

#### 20. Performance
Session list ≤ 50 rows; `ver` check cached 30 s in process (invalidated on the same node by the write; other nodes at most 30 s stale — the server-side permission check still applies immediately because it reads the membership row on write endpoints).

#### 21. Testing
- **T-PLT-09-1** API: list shows only caller's live sessions with `is_current`.
- **T-PLT-09-2** API: revoke other session → its refresh 401; revoke current → 409.
- **T-PLT-09-3** API: role change bumps version; old token → 401 `permissions_changed`; refresh yields new `rol`/`ver`.
- **T-PLT-09-4** API: manager revoke only affects current tenant sessions.
- **T-PLT-09-5** unit: UA summary mapping (Chrome Android, Safari iOS, Edge Windows).
- **T-PLT-09-6** component: interceptor refresh-retry-once; loops prevented.
- **T-PLT-09-7** E2E: two browsers; revoke from one; other is logged out on next action.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given two logged-in devices, when I log out the other one, then it is redirected to login on its next request.
- **AC-2 (US-2)** Given a staff member with sessions, when I revoke their devices, then they must log in again but remain a member.
- **AC-3 (US-3)** Given "Log out everywhere", when confirmed, then all my devices including this one are logged out.
- **AC-4 (US-4)** Given a role change from staff to admin, when the member performs any action, then the UI shows admin navigation without a manual reload.

#### 23. Dependencies
PLT-01/02 (sessions, refresh), PLT-05 (permission version bump), NTF-01.

#### 24. Future Enhancements
PLT-11 app lock (P2), geolocation from IP (P3, settings-gated), trusted-device OTP skip policies (P3), admin view of all tenant sessions (P3).

---

### PLT-10 — Account deletion & data export (DPDP)

#### 1. Business Objective
Meet the Digital Personal Data Protection Act 2023 and DPDP Rules 2025 (research §C.6) for both roles DigiKhaato plays — Data Fiduciary for merchant accounts and Data Processor for merchants' customer data — by letting an owner download everything the business holds and request deletion with a 30-day cool-off, while keeping records that GST law obliges the merchant to retain. Success measures: export bundle produced ≤ 10 min for tenants ≤ 1 M rows; deletion executed exactly 30 days after request unless cancelled; zero deletions without owner OTP re-verification.

#### 2. User Personas
OW (only role that can request), SA (executes/monitors via PLT-14), CU (indirect — their data is deleted or exported with the tenant).

#### 3. User Stories
1. **US-PLT-10-1** — As an owner, I want to download all my business data as CSV files so that I keep my records if I stop using the app.
2. **US-PLT-10-2** — As an owner, I want to delete my business and have 30 days to change my mind.
3. **US-PLT-10-3** — As an owner, I want to know what happens to invoices I am legally required to keep.
4. **US-PLT-10-4** — As a user with no businesses, I want to delete my user account.
5. **US-PLT-10-5** — As an owner, I want to see the privacy notice, the grievance contact and what data is processed, in Hindi or English.

#### 4. Functional Requirements
- **FR-1** Export: `POST /tenants/current/export` (owner) → 202 `{data: {export_id}}`; creates `reports_export` (`report_name='tenant_full_export'`, `format='zip'`, `status='queued'`) and enqueues `jobs.enqueue('tenant_export', {export_id})` to `platform_job`; the runner builds a ZIP of CSV files: `tenant.csv`, `members.csv`, `parties.csv`, `ledger_entries.csv`, `reminders.csv`, `items.csv`, `stock_movements.csv`, `sales_documents.csv`, `sales_document_lines.csv`, `purchase_documents.csv`, `purchase_document_lines.csv`, `payments.csv`, `payment_allocations.csv`, `expenses.csv`, `message_log.csv`, `audit_log.csv`, `settings.json`, plus `attachments/` (logo, signature, bill photos, receipts) and `README.txt` describing columns; stores it as `files_attachment` (`kind='export_file'`) with `expires_at = now + 7 d`.
- **FR-2** Poll `GET /reports/exports/{id}` → `{status, download_url, row_count, expires_at}`; download via signed URL valid 15 min; in-app notification `export.ready`.
- **FR-3** Deletion request: `POST /tenants/current/delete-request {challenge_id, code, reason?}` — requires a fresh OTP (`purpose='verify'`, PLT-01) verified within the same request → sets `platform_tenant.status='pending_deletion'`, `deletion_requested_at=now`; revokes all non-owner sessions; the tenant becomes **read-only** for everyone (all write endpoints → 409 `tenant_pending_deletion`) except export, cancel and audit read.
- **FR-4** Cancel: `POST /tenants/current/delete-cancel` (owner) within the cool-off → `status='active'`, `deletion_requested_at=NULL`; sessions are not restored.
- **FR-5** Execution: the scheduler command `execute_tenant_deletions` runs daily, selects tenants with `status='pending_deletion' AND deletion_requested_at <= now − 30 d`, and for each: (a) produces a final export automatically (FR-1) and retains it 30 days for the owner (downloadable from the login-less link e-mailed/SMSed? — no email at MVP; the owner can log in and see a single "Download final export" page while `status='deleted'` and they were an owner); (b) deletes children in dependency order (notifications, message logs, reminders, allocations, payments, documents+lines, ledger entries, stock movements/items/stock, parties, expenses, attachments files from storage, settings, sequences, invitations, memberships); (c) anonymises `platform_audit_log` rows of the tenant (`before/after/metadata` replaced by `{"redacted": true}`, action and timestamps retained) to satisfy the ≥ 1-year security-log retention of the Rules without holding personal data; (d) sets `status='deleted'`, keeps the tenant row (id, partner, created_at, deleted timestamp) as a tombstone; GSTIN uniqueness excludes `deleted` (Part 21).
- **FR-6** Legal-retention notice: the deletion dialog states that the owner is responsible for retaining GST records (72 months) and must download the export first; the request is blocked (409 `export_required`) until an export produced after the last write exists (i.e. `reports_export.created_at > tenant.updated_at` and no later ledger/document rows).
- **FR-7** User account deletion: `DELETE /auth/me` (CCR-10) allowed only when the user has no `active|invited` memberships and no owned tenant not `deleted`; anonymises the user (`mobile` → `deleted+<uuid>@invalid`? mobile is `varchar(15)` — set to `+00<12-digit hash>` placeholder outside the Indian regex, `full_name='Deleted user'`, `email=NULL`, `password_hash=NULL`, `is_active=false`), revokes sessions. If memberships exist → 409 `memberships_exist` listing tenants to leave first (PLT-04).
- **FR-8** Party-level erasure requests from a customer (Data Principal) are handled by the merchant: PTY-04 archive plus a "Erase personal data" action (CCR-11 `POST /parties/{id}/erase`) that blanks `mobile`, `alt_phone`, `email`, addresses, notes, `consent_*` and deletes message logs for the party, keeping `name` and ledger/document rows (financial records) — only when `balance = 0` and no open documents.
- **FR-9** Privacy centre page shows: privacy notice (partner `branding.legal_footer` + global text), grievance officer contact (`partner.support_contact` + `settings.grievance`), data processed summary, links to Export, Delete business, Delete account; available in `en`/`hi`.
- **FR-10** Consent capture for merchant sign-up: the sign-up screen (PLT-01) includes a checkbox "I agree to the Terms and Privacy Notice" whose acceptance is recorded in audit `auth.consent_recorded` (metadata: version, locale, timestamp) — required to proceed.
- **FR-11** Breach support: `manage.py export_affected_principals --tenant …` (SA tooling, PLT-14) lists contactable parties for breach notification duties; not a UI feature.

#### 5. Non-Functional Requirements
Export runs in the jobs runner in batches of 5 000 rows, streaming to a temp ZIP; memory ≤ 256 MB; tenants ≤ 1 M rows finish ≤ 10 min. Deletion is idempotent and resumable (per-table progress recorded in `platform_job.payload`). Cool-off exactly 30 days in tenant timezone. Copy `en`/`hi`; the privacy notice is plain language (Rules require clarity).

#### 6. User Flow
Export: Settings → Privacy & data → "Download all data" → 202 → `MLProgress` indeterminate + "We'll notify you" → notification → download ZIP.
Delete business: Privacy & data → "Delete this business" → `UbDialog` explaining consequences and retention → "Download export first" (disabled Continue until export exists) → OTP sent to owner mobile → enter code → type business name to confirm → request → banner on every page "This business will be deleted on {date}. Cancel" → optional cancel.
Delete account: Profile → "Delete my account" → shows blocking memberships (if any) → OTP → confirm → logged out.

#### 7. UI Requirements
Route `app/(app)/settings/privacy/page.tsx` → `<PrivacyPageContent/>` (`features/account-data`). Components: `MLCard` sections (Export, Delete business, Delete account, Notice), `UbDialog` multi-step (`DeleteTenantDialog`: consequences → export gate → OTP (`OtpCodeInput` from `features/auth`) → name confirmation `MLInput`), `UbStatusBanner` (pending deletion, tone warning, persistent in app shell via `sessionSlice.activeTenant.status`), `MLProgress`, `UbEmptyState` for no exports yet, `ExportHistoryList` (last 5 exports with status badges and expiry).
Mobile: stacked cards; dialog as full-screen sheet. Desktop: 720 px content, dialog 520 px.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `privacy.title` | Privacy & data | गोपनीयता और डेटा |
| `privacy.export.cta` | Download all data | सारा डेटा डाउनलोड करें |
| `privacy.export.ready` | Your export is ready. Link valid till {date} | आपका एक्सपोर्ट तैयार है। लिंक {date} तक मान्य |
| `privacy.delete.cta` | Delete this business | यह व्यापार हटाएँ |
| `privacy.delete.consequences` | All parties, entries, bills and stock will be permanently deleted after 30 days. You must keep GST records for 6 years — download your data first. | 30 दिन बाद सभी पार्टी, एंट्री, बिल और स्टॉक स्थायी रूप से हट जाएँगे। जीएसटी रिकॉर्ड 6 साल रखना ज़रूरी है — पहले अपना डेटा डाउनलोड करें। |
| `privacy.delete.typeName` | Type "{name}" to confirm | पुष्टि के लिए "{name}" लिखें |
| `privacy.delete.pending` | This business will be deleted on {date}. | यह व्यापार {date} को हटा दिया जाएगा। |
| `privacy.delete.cancel` | Cancel deletion | हटाना रद्द करें |
| `privacy.account.delete` | Delete my account | मेरा खाता हटाएँ |
| `privacy.account.blocked` | Leave these businesses first: {names} | पहले इन व्यापारों को छोड़ें: {names} |
| `privacy.grievance` | Grievance officer | शिकायत अधिकारी |

Destructive buttons are outlined `destructive` (never filled). The pending banner is dismissible per session but returns on reload.

#### 9. States
Initial · Loading · Empty (no exports: first-use explains what the bundle contains) · Success (export ready; deletion requested) · Error (409 `export_required` inline with CTA) · Disabled (Delete disabled for non-owners with tooltip; Continue disabled until gate passes) · Partial (export `running` with "Started {when}") · Processing (OTP verifying) · Completed (`deleted` tenants show only the final-export page) · Failed (export `failed` with retry; deletion job failure visible only to SA).

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| challenge/code | valid OTP for owner mobile, purpose `verify` | Incorrect code | `otp_invalid` |
| confirm_name | equals `tenant.name` (case-insensitive, trimmed) | Name does not match | `validation_error` |
| export gate | fresh export exists | Download your data before deleting | `export_required` (409) |
| account delete | no live memberships/owned tenants | Leave these businesses first | `memberships_exist` (409) |
| party erase | balance 0, no open docs | Settle the account first | `party_balance_nonzero` (409) |
| rate | ≤ 3 exports/day/tenant | Try again tomorrow | 429 |

#### 11. Business Rules
- **BR-1** Cool-off = 30 calendar days; execution on the first daily run after expiry.
- **BR-2** During `pending_deletion` the tenant is read-only; owners may still export, cancel, view audit; scheduled reminders/SMS are suppressed (`skipped`).
- **BR-3** Deletion removes personal data of parties and members; audit rows are anonymised not deleted; the tenant tombstone keeps no personal data (name is blanked to `Deleted business`).
- **BR-4** The final export is the merchant's retention copy; DigiKhaato keeps it 30 days after deletion then deletes it (GC job).
- **BR-5** Data Processor stance: DigiKhaato never uses party data for its own purposes; no analytics event contains party PII.
- **BR-6** Party `sms_opt_in`, `consent_source`, `consent_at` (PTY-01) are the merchant's lawful-basis record; exports include them.
- **BR-7** Log retention: security-relevant audit rows retained ≥ 1 year in anonymised form (Rules); financial audit rows are the merchant's via export.

#### 12. Permissions
Export and delete-request: `owner` only (checked by role, not codename — `platform.tenant.manage` is also held by admins who must not delete; the service checks `role == owner`). Cancel: owner. Account deletion: self. Party erase: `parties.party.delete` (owner/admin).

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| Full export | ✅ | ❌ | ❌ | ❌ (uses report exports instead) |
| Request/cancel deletion | ✅ | ❌ | ❌ | ❌ |
| Delete own user account | ✅ | ✅ | ✅ | ✅ |
| Erase party personal data | ✅ | ✅ | ❌ | ❌ |

#### 13. Edge Cases
- **EC-1** Two owners: either may request or cancel; both notified.
- **EC-2** Writes attempted during cool-off by a stale client: 409 `tenant_pending_deletion` with banner.
- **EC-3** Export requested, then more entries recorded, then delete requested: gate fails until a new export.
- **EC-4** Storage failure mid-export: job `failed`, retried up to 3 times by the runner; owner notified on final failure.
- **EC-5** Partner suspends a `pending_deletion` tenant: deletion still executes on schedule.
- **EC-6** Tenant with 0 rows (abandoned onboarding): export gate satisfied trivially (empty export produced synchronously).
- **EC-7** Owner deletes account while owning a `pending_deletion` tenant: blocked until the tenant is `deleted`.
- **EC-8** Party asks the merchant for their data: PTY-03 statement export serves as access; erasure via FR-8.

#### 14. API Requirements
`POST /tenants/current/export` (202), `GET /reports/exports/{id}`, `POST /tenants/current/delete-request {challenge_id, code, confirm_name, reason?}` (200 tenant), `POST /tenants/current/delete-cancel`, `POST /auth/otp/request {purpose:'verify'}`; CCR-10 `DELETE /auth/me {challenge_id, code}`; CCR-11 `POST /parties/{id}/erase {reason}`. Errors: 409 `export_required`, `tenant_pending_deletion`, `memberships_exist`, `party_balance_nonzero`. Frontend: `accountDataService.ts`, `accountDataThunk.ts` (`requestExport`, `pollExport`, `requestDeletion`, `cancelDeletion`, `deleteAccount`, `erasePartyData`), `accountDataSlice.ts` (`exports`, `deletion`, `status`); shell reads `sessionSlice.activeTenant.status` for the banner; write-blocking on the client mirrors the server (buttons disabled when `pending_deletion`).

#### 15. Database Impact
`reports_export` (insert/update), `files_attachment` (`export_file`), `platform_job` (queue rows), `platform_tenant` (`status`, `deletion_requested_at`, `name` blanked on delete), `platform_session` (revocations), `platform_user` (anonymisation), all tenant child tables (deletion in dependency order; `ON DELETE RESTRICT` on tenant FK means children go first), `platform_audit_log` (anonymise). `parties_party` erase blanks PII columns. Index: `IX(status)` on tenant for the daily selection.

#### 16. Audit Requirements
`tenant.export_requested` / `tenant.export_completed` (metadata: row counts, size), `tenant.deletion_requested` (metadata: reason, otp challenge id), `tenant.deletion_cancelled`, `tenant.deleted` (system actor; counts per table), `user.account_deleted`, `party.erased` (fields blanked), `auth.consent_recorded`. Rows for a deleted tenant are anonymised after execution.

#### 17. Notifications
In-app: `export.ready`, `tenant.deletion_requested` (to all owners: "{actor} requested deletion; scheduled {date}"), `tenant.deletion_cancelled`. SMS (when adapter configured; console logs): template `tenant_deletion_requested` to every owner mobile "{{business}} will be deleted on {{date}}. Not you? Log in and cancel." (service-implicit).

#### 18. Analytics / Event Tracking
`ub.platform.export_requested`, `ub.platform.export_completed {duration_s, size_mb}`, `ub.platform.deletion_requested {reason_category}`, `ub.platform.deletion_cancelled {days_elapsed}`, `ub.platform.deletion_executed`, `ub.platform.account_deleted`, `ub.parties.party_erased`.

#### 19. Security
OTP re-verification for destructive requests; owner-only; signed, expiring download URLs; export files stored under tenant key and GC'd; anonymisation irreversible; deletion job logs counts only; no export of other tenants' data possible (all queries via tenant manager); consent version recorded; rate-limited exports.

#### 20. Performance
Batched streaming export; deletion in chunks of 10 000 rows per table with `statement_timeout` guard; both run in the scheduler container, not web workers; daily selection by status index.

#### 21. Testing
- **T-PLT-10-1** API: export 202 → job runs → ZIP has all listed files with correct row counts (fixture tenant).
- **T-PLT-10-2** API: delete-request without fresh export → 409 `export_required`; with → `pending_deletion`, non-owner sessions revoked, write endpoint → 409.
- **T-PLT-10-3** API: cancel restores `active`.
- **T-PLT-10-4** job: after 30 days tenant children deleted, audit anonymised, tombstone remains, GSTIN reusable.
- **T-PLT-10-5** API: `DELETE /auth/me` blocked with memberships; allowed when none; user anonymised.
- **T-PLT-10-6** API: party erase blanks PII, keeps ledger; blocked when balance ≠ 0.
- **T-PLT-10-7** permission: admin export → 403.
- **T-PLT-10-8** E2E: full deletion request flow with typed name and OTP; banner shows date; cancel removes banner.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a tenant with data, when I request an export, then within 10 minutes I can download a ZIP containing every table listed in FR-1.
- **AC-2 (US-2)** Given a fresh export, when I confirm deletion with OTP and name, then the business is read-only and shows the deletion date; cancelling restores it.
- **AC-3 (US-3)** Given the deletion dialog, when I read it, then it states the GST retention duty and blocks until I export.
- **AC-4 (US-4)** Given no memberships, when I delete my account with OTP, then I am logged out and cannot log in again with that mobile until I sign up afresh.
- **AC-5 (US-5)** Given the privacy page in Hindi, when I open it, then the notice and grievance contact are in Hindi.

#### 23. Dependencies
PLT-01 (OTP verify), PLT-04 (leave), PLT-14 (SA tooling), RPT-08 (`reports_export`), jobs runner (ADR-012), files app, WLB-02 (partner legal footer/support contact), PTY-04.

#### 24. Future Enhancements
Consent Manager integration (Rules Phase 2, 2026-11), Data Principal self-service via PTY-09 link ("download my khata", P2), email delivery of exports (NTF-06 P2), per-partner retention policies (P3), breach-notification workflow tooling (P3).

---

### PLT-11 — App lock / PIN (PWA) — Phase 2

#### 1. Business Objective
Protect an installed app on a shared or unattended phone with a local 4–6-digit PIN or device biometrics so that a customer holding the shopkeeper's phone cannot open the khata (research F19). The lock is purely client-side: it gates the UI, not the API. Success measures: ≥ 25 % of PWA installs enable the lock; unlock ≤ 1 s; zero server changes.

#### 2. User Personas
OW, ST (installed PWA users).

#### 3. User Stories
1. **US-PLT-11-1** — As an owner, I want a PIN asked when I reopen the app after a few minutes away.
2. **US-PLT-11-2** — As a user with a fingerprint phone, I want to unlock with biometrics instead of typing.
3. **US-PLT-11-3** — As a user who forgot the PIN, I want to recover by logging in again rather than losing data.

#### 4. Functional Requirements
- **FR-1** Settings → Security → "App lock" switch; enabling asks for a PIN twice (4–6 digits) and stores `PBKDF2(pin, deviceSalt, 100k)` in `localStorage.ub_app_lock` alongside `salt`, `timeout_s` (default 60; options 0/60/300/900), `biometric_enabled`, `failed_attempts`.
- **FR-2** Lock triggers: app start, `visibilitychange` → hidden for ≥ `timeout_s`, manual "Lock now" in the More menu. Lock screen (`AppLockGate`) overlays the app shell; the Redux store and cookies remain intact.
- **FR-3** Biometrics via WebAuthn platform authenticator (`navigator.credentials.create/get` with `authenticatorAttachment: 'platform'`, `userVerification: 'required'`) registered locally with a random challenge; the credential id is stored locally; success unlocks; unavailable → PIN only. No server relying-party storage (RP id = app host; assertion verified client-side for local gating only — it is a convenience gate, not authentication).
- **FR-4** 5 wrong PINs → 30 s back-off doubling to 5 min; 10 wrong → "Log in again to reset PIN" which calls `POST /auth/logout`, clears `ub_app_lock`, routes to login.
- **FR-5** "Forgot PIN" → same as FR-4 final step (re-authentication resets the lock).
- **FR-6** Disabling the lock requires the current PIN or biometrics.
- **FR-7** Lock state is per browser profile/device; not synced.
- **FR-8** While locked, notifications (NTF-01 bell) show counts only, never content; `document.title` shows the app name only.

#### 5. Non-Functional Requirements
Lock screen renders ≤ 100 ms from cached bundle; works offline; PIN pad targets ≥ 44 px; screen-reader labels for digits; `en`/`hi` copy; respects `prefers-reduced-motion`.

#### 6. User Flow
Enable: Settings → Security → toggle → enter PIN → confirm → optional "Use fingerprint/face" → done. Daily: open app → lock screen → biometrics prompt (if enabled) or PIN → app. Recovery: 10 failures or "Forgot PIN" → logout → login → lock disabled until re-enabled.

#### 7. UI Requirements
`features/app-lock`: `AppLockGate` (full-screen `--canvas`, tenant logo from `whiteLabelSlice`, six-dot indicator, `PinPad` 3×4 grid `MLButton ghost lg`, "Use biometrics" `MLButton secondary`, "Forgot PIN?" ghost), `AppLockSettingsCard` (`MLSwitch`, `MLSelect` timeout, `MLSwitch` biometrics), `SetPinDialog` (`UbDialog`, two-step). Mobile-first; on desktop the gate is a centred 360 px card (PIN pad optional; keyboard digits accepted).

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `appLock.title` | App lock | ऐप लॉक |
| `appLock.enter` | Enter your PIN | अपना पिन डालें |
| `appLock.set` | Set a 4–6 digit PIN | 4–6 अंकों का पिन सेट करें |
| `appLock.confirm` | Confirm PIN | पिन की पुष्टि करें |
| `appLock.biometric` | Use fingerprint / face | फ़िंगरप्रिंट / चेहरा इस्तेमाल करें |
| `appLock.forgot` | Forgot PIN? Log in again | पिन भूल गए? फिर से लॉग इन करें |
| `appLock.wrong` | Wrong PIN. Try again in {seconds}s | गलत पिन। {seconds} सेकंड में फिर कोशिश करें |
| `appLock.timeout.label` | Lock after | इतने समय बाद लॉक करें |

Wrong PIN clears the dots (no shake animation, per Koper rules). Defaults: 60 s timeout, biometrics off.

#### 9. States
Initial (locked on start when enabled) · Loading (biometric prompt pending) · Empty (n/a) · Success (unlock, fade 140 ms) · Error (wrong PIN caption) · Disabled (back-off countdown; pad disabled) · Partial (dots filling) · Processing (hash compare ≤ 50 ms) · Completed · Failed (10 attempts → logout path).

#### 10. Validation Rules
PIN `^\d{4,6}$`; not a trivial sequence (`1234`, `0000`, `123456`, repeated digit) → "Choose a less obvious PIN"; confirm equals.

#### 11. Business Rules
- **BR-1** The lock never substitutes server authentication; API calls still require valid tokens.
- **BR-2** Clearing site data removes the lock (acceptable — the attacker would also lose the session cookies).
- **BR-3** Lock settings are not part of tenant settings and not audited server-side.

#### 12. Permissions
Any member on their own device. No server codename.

#### 13. Edge Cases
- **EC-1** Session expires while locked: unlock → 401 → refresh → possibly login screen.
- **EC-2** Biometric hardware removed/changed: WebAuthn fails → PIN fallback.
- **EC-3** Multiple tabs: `storage` event syncs lock/unlock across tabs.
- **EC-4** iOS Safari PWA backgrounding: `visibilitychange` reliable; `pagehide` also handled.
- **EC-5** Screen readers: PIN dots have `aria-live` count, digits announced.

#### 14. API Requirements
None new; uses `POST /auth/logout` on reset. Frontend: `appLockSlice.ts` (`locked`, `attempts`, `lockedUntil`), `useAppLock.ts` hook (visibility timer, verify, biometrics), `appLockStorage.ts` util; mounted in `components/layout/AppShell.tsx`.

#### 15. Database Impact
None.

#### 16. Audit Requirements
None server-side; `ub.platform.app_lock_reset_via_login` is analytics only.

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.platform.app_lock_enabled {timeout_s, biometric}`, `ub.platform.app_lock_unlocked {method}`, `ub.platform.app_lock_failed {attempts}`, `ub.platform.app_lock_reset_via_login`.

#### 19. Security
PIN hashed with per-device salt; back-off; no PIN transmitted; WebAuthn user-verification required; lock screen hides content and titles; `localStorage` access wrapped in try/catch.

#### 20. Performance
Hash compare via `crypto.subtle` ≤ 50 ms; no network.

#### 21. Testing
- **T-PLT-11-1** unit: PIN hashing/verification, trivial-PIN rejection, back-off schedule.
- **T-PLT-11-2** component: gate shows on start when enabled; hidden when disabled.
- **T-PLT-11-3** component: 10 failures trigger logout thunk.
- **T-PLT-11-4** E2E (Chromium virtual authenticator): biometric enrol and unlock.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given the lock enabled with 60 s, when I background the app for 2 minutes and return, then the PIN screen shows and content is hidden.
- **AC-2 (US-2)** Given biometrics enrolled, when I unlock with the platform authenticator, then the app opens without a PIN.
- **AC-3 (US-3)** Given 10 wrong PINs, when the limit is hit, then I am logged out and can log in again with the lock disabled.

#### 23. Dependencies
PWA shell (ADR-020), PLT-01/02, `whiteLabelSlice`.

#### 24. Future Enhancements
Capacitor native biometrics (P3), server-enforced re-auth for bank details view (research F19), per-tenant policy forcing lock for staff (P3).

---

### PLT-14 — Super-admin console (Metis ops)

#### 1. Business Objective
Give Metis Labs operations a minimal, audited console to run the platform: see partners and tenants, fix entitlements, suspend abusive tenants, impersonate a tenant with the owner's consent to reproduce a problem, and check system health — without database access. At MVP (single local deployment) the console is also how the first partner/plan rows are inspected. Success measures: every ops action audited with actor and reason; impersonation impossible without a consent record; P95 tenant search ≤ 300 ms at 100 k tenants.

#### 2. User Personas
SA (`platform_user.is_super_admin=true`). PA gets a scoped subset in WLB-04 (Phase 2).

#### 3. User Stories
1. **US-PLT-14-1** — As a super admin, I want to search tenants by name, GSTIN, owner mobile or partner and open a tenant card with plan, modules, usage and status.
2. **US-PLT-14-2** — As a super admin, I want to change a tenant's plan or override a limit with a reason so a partner's merchant is unblocked today.
3. **US-PLT-14-3** — As a super admin, I want to impersonate a tenant only after the owner approves, and have every action marked as mine.
4. **US-PLT-14-4** — As a super admin, I want to suspend a tenant for abuse and lift it later.
5. **US-PLT-14-5** — As a super admin, I want a health page showing DB, storage, scheduler heartbeat and job backlog.

#### 4. Functional Requirements
- **FR-1** Console is a separate route group `app/(admin)/admin/**` served by the same frontend, visible only when `sessionSlice.user.isSuperAdmin`; all `/admin/*` endpoints require `is_super_admin=true` (403 otherwise) and, from Phase 2, MFA (`mfa_secret`).
- **FR-2** `GET /admin/tenants?q=&partner_id=&plan_id=&status=&page=` → rows `{id, name, partner: {code,name}, plan: {code}, status, business_type, gst_type, gstin, owner_mobile_masked, created_at, usage: {members, parties, invoices_this_month, storage_mb}, last_activity_at}`; `q` matches name (trigram), gstin exact, owner mobile exact (E.164), tenant id.
- **FR-3** `GET /admin/tenants/{id}` → full profile + settings + entitlements + recent platform audit rows; `PATCH /admin/tenants/{id} {plan_id?, status?, entitlement_overrides?, reason}` — `status ∈ {active, suspended}` (suspension revokes all tenant sessions and returns 403 `tenant_suspended` on every tenant endpoint); `entitlement_overrides` = per-limit overrides stored in `platform_tenant_setting` key `plan.overrides` (CCR-6) `{max_users?: int|null, max_parties?, max_invoices_per_month?, storage_mb?, modules_extra?: []}` consumed by PLT-15.
- **FR-4** Partners: `GET/POST /admin/partners`, `GET/PATCH /admin/partners/{id}` (fields per `platform_partner`; WLB-02 owns the form); `GET/POST/PATCH /admin/plans` (fields per `platform_plan`; deactivating a plan with tenants → 409 `plan_in_use`).
- **FR-5** Impersonation: `POST /admin/tenants/{id}/impersonate {reason, consent_id}` — a valid consent is a `notifications_notification` of type `support.impersonation_consent` accepted by an owner (owner taps "Allow support access for 24 h" in-app, producing `platform_audit_log` `tenant.support_access_granted` whose id is the `consent_id`, valid 24 h). The endpoint mints an access token with `sub` = super admin, `tid` = tenant, `rol='owner'`, extra claim `imp=true`, lifetime 60 min, no refresh; every request with `imp=true` writes audit rows with `actor_type='super_admin'` and `metadata.impersonation=true`; the UI shows a persistent red-outlined banner "Support session — {admin} acting in {tenant}. Ends {time}". Write endpoints are allowed (needed to reproduce fixes) except PLT-10 deletion, PLT-05 owner changes, and PLT-07 bank details (403 `impersonation_forbidden`).
- **FR-6** Consent request path: SA clicks "Request access" → `POST /admin/tenants/{id}/access-request {reason}` (CCR-12) → in-app notification + SMS (adapter) to all owners with Allow/Deny; Allow creates the consent audit row; Deny/expiry (24 h) closes it.
- **FR-7** Health: `GET /admin/health` (CCR-12; deep, authenticated — `/system/health` remains shallow/unauthenticated) → `{db: {ok, latency_ms}, storage: {ok, free_mb}, scheduler: {last_heartbeat_at, lag_s}, jobs: {queued, running, failed_24h}, otp_backend, sms_backend, version}`; the scheduler writes a heartbeat row every minute (`platform_job` row kind `heartbeat`) so lag is measurable.
- **FR-8** Users: `GET /admin/users?q=` (mobile exact/name) → memberships summary, `is_active`; `PATCH /admin/users/{id} {is_active, reason}` for abuse lockout (revokes sessions). Passwords are never settable by SA; SA may trigger `POST /admin/users/{id}/otp-bypass`? **No** — not provided; support guides the user through reset.
- **FR-9** Platform audit: `GET /admin/audit-logs` shows `tenant_id NULL` rows plus any tenant's rows by `tenant_id` filter (read-only).
- **FR-10** Every PATCH/POST in the console requires `reason` (≥ 5 chars) which is stored in audit metadata.

#### 5. Non-Functional Requirements
Console uses the same design system; dense desktop layout (≥ 1024 px) primary; mobile is functional but not optimised. Search P95 ≤ 300 ms via trigram + exact indexes. All copy English only at MVP (`en`; `hi` keys mirrored to English text — ops staff), noted as exception to canon rule 6 in the CCR list.

#### 6. User Flow
SA logs in (password, PLT-02) → header shows "Admin" link → `/admin/tenants` → search "27AAPFU" → tenant card → "Change plan" → pick plan + reason → save → usage badges update. Impersonate: card → "Request access" → owner sees notification → allows → SA sees "Access granted until…" → "Enter tenant" → new tab with banner → reproduce → "End session". Health: `/admin/health` auto-refreshes every 30 s.

#### 7. UI Requirements
Routes `app/(admin)/admin/{tenants,partners,plans,users,health,audit}/page.tsx` → `<Admin*PageContent/>` (`features/admin`). Components: `UbDataGrid` (tenant/partner/plan/user lists, server pagination), `AdminTenantDrawer` (`UbDrawer` 640 px, tabs Overview/Entitlements/Members/Audit using `UbTabs`), `EntitlementOverridesForm` (`UbForm`, numeric inputs with "plan default: {n}" hints, `MLSwitch` per extra module), `UbReasonDialog` for every change, `ImpersonationBanner` (app-shell level, `UbStatusBanner` tone danger with countdown), `HealthTiles` (`UbStatCard` per subsystem with tone by status), `UbStatusBadge` (tenant status: active success, suspended warning, pending_deletion danger, deleted neutral).

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `admin.tenants.title` | Tenants | Tenants |
| `admin.tenant.changePlan` | Change plan | Change plan |
| `admin.tenant.suspend` | Suspend tenant | Suspend tenant |
| `admin.tenant.requestAccess` | Request support access | Request support access |
| `admin.impersonation.banner` | Support session — {admin} in {tenant}. Ends {time} | Support session — {admin} in {tenant}. Ends {time} |
| `admin.health.title` | System health | System health |
| `support.access.request` | {appName} support asks to access your business for: {reason}. Allow for 24 hours? | {appName} सहायता टीम आपके व्यापार तक पहुँच चाहती है: {reason}। 24 घंटे के लिए अनुमति दें? |
| `support.access.allow` | Allow | अनुमति दें |
| `support.access.deny` | Deny | अस्वीकार करें |

Owner-facing keys (`support.*`) are fully localised; admin-facing keys are English in both files. Every destructive action uses `UbReasonDialog`.

#### 9. States
Initial · Loading · Empty (no tenants match) · Success · Error · Disabled (impersonate disabled until consent; plan deactivate disabled with count) · Partial (access requested, awaiting owner) · Processing · Completed (impersonation ended) · Failed (health tile red with error text).

#### 10. Validation Rules
`reason` ≥ 5 chars; `plan_id` active; `entitlement_overrides` ints ≥ 0 or null; `modules_extra` ⊆ module codes; `status` ∈ {active, suspended}; `consent_id` valid, unexpired, for this tenant; `q` ≤ 80 chars.

#### 11. Business Rules
- **BR-1** SA cannot bypass consent; there is no "break-glass" flag at MVP (ops with DB access is the break-glass, outside the app).
- **BR-2** Impersonation tokens cannot switch tenant, refresh, or call `/admin/*`.
- **BR-3** Overrides never exceed partner-granted ceilings when the partner has `settings.max_overrides` (WLB-04); at MVP no ceilings.
- **BR-4** Suspension keeps data and scheduled jobs paused (`skipped`), and the owner sees a suspension screen with partner support contact.
- **BR-5** Plan changes take effect immediately; existing over-limit usage is tolerated (PLT-15 BR-3).

#### 12. Permissions
`is_super_admin` flag only; no codename (platform-level). Owners interact only through the consent notification.

#### 13. Edge Cases
- **EC-1** Owner allows, then SA never enters: consent expires unused; audit shows granted/expired.
- **EC-2** Two SAs request access: one consent per request; each SA needs its own.
- **EC-3** Tenant `pending_deletion`: impersonation allowed read-only (write 409 as for everyone).
- **EC-4** Suspending a tenant with an active impersonation: token invalidated (`tenant_suspended`).
- **EC-5** SA account compromised: `is_active=false` via another SA or `manage.py`; all admin actions are audited with `actor_type='super_admin'`.
- **EC-6** Heartbeat missing (scheduler down): health shows lag > 120 s red; `/system/health` stays green (shallow) — documented.

#### 14. API Requirements
Existing: `/admin/partners`, `/admin/tenants`, `/admin/tenants/{id}/impersonate`, `/admin/plans`. CCR-12: `/admin/tenants/{id}/access-request`, `/admin/users`, `/admin/health`, `/admin/audit-logs`, owner-side `POST /support/access-requests/{id}/allow|deny` (tenant-scoped, owner only). Frontend: `adminService.ts`, `adminThunk.ts` (`fetchTenants`, `fetchTenant`, `updateTenant`, `fetchPartners`, `savePartner`, `fetchPlans`, `savePlan`, `requestAccess`, `impersonate`, `fetchHealth`, `fetchUsers`, `updateUser`), `adminSlice.ts`; owner-side `supportAccessThunk.ts` (`respondAccessRequest`) in `features/notifications`.

#### 15. Database Impact
Reads across `platform_tenant`, `platform_partner`, `platform_plan`, `platform_membership`, usage aggregates (`parties_party` count, `sales_document` count this month, `files_attachment` size sum), `platform_job`. Writes: `platform_tenant.plan_id/status`, `platform_tenant_setting['plan.overrides']`, `platform_partner`, `platform_plan`, `platform_user.is_active`, `platform_session.revoked_at`, `notifications_notification` (consent), `platform_audit_log`. Index CCR-8: `IX(platform_tenant.name gin_trgm_ops)`, `IX(platform_user.mobile)` exists via U.

#### 16. Audit Requirements
All with `actor_type='super_admin'`: `admin.tenant_plan_changed` (before/after plan, reason), `admin.tenant_overrides_changed` (before/after), `admin.tenant_suspended` / `admin.tenant_reactivated`, `admin.partner_created/updated`, `admin.plan_created/updated`, `admin.user_deactivated`, `admin.access_requested`, `tenant.support_access_granted/denied` (actor owner), `admin.impersonation_started/ended` (metadata consent_id), plus every in-tenant action during impersonation flagged `metadata.impersonation=true`.

#### 17. Notifications
Owner in-app `support.impersonation_consent` with Allow/Deny actions; SMS template `support_access_request` (service-implicit) when adapter configured; owner in-app `support.impersonation_started` ("Support entered your business at {time}") and `…ended`.

#### 18. Analytics / Event Tracking
`ub.admin.tenant_searched`, `ub.admin.plan_changed`, `ub.admin.override_set {limit_key}`, `ub.admin.tenant_suspended`, `ub.admin.access_requested`, `ub.admin.impersonation_started {minutes_after_consent}`, `ub.admin.health_viewed`.

#### 19. Security
`is_super_admin` checked per request; admin routes on the same host but separate DRF permission class; impersonation tokens short-lived, non-refreshable, claim-restricted; consent required and time-boxed; reasons mandatory; rate limits standard; SA accounts created only via `manage.py create_super_admin`; MFA in Phase 2; admin UI hidden from non-SA bundles via route guard (not a security boundary).

#### 20. Performance
Usage aggregates computed on demand for a single tenant card; the list uses cached counters refreshed nightly (`reports_snapshot` per tenant, key `usage`) to avoid heavy aggregation across 100 k tenants.

#### 21. Testing
- **T-PLT-14-1** API: non-SA → 403 on all `/admin/*`.
- **T-PLT-14-2** API: impersonate without consent → 403; with expired consent → 403; with valid → token has `imp=true`, cannot call `/admin/*` or `/auth/switch-tenant`.
- **T-PLT-14-3** API: actions under impersonation write audit with `actor_type=super_admin`, `impersonation=true`; forbidden endpoints → 403 `impersonation_forbidden`.
- **T-PLT-14-4** API: suspend → tenant endpoints 403 `tenant_suspended`; sessions revoked; reactivate restores.
- **T-PLT-14-5** API: plan change and overrides reflected in `/auth/me.plan_limits` (PLT-15).
- **T-PLT-14-6** API: deactivate plan in use → 409.
- **T-PLT-14-7** job: heartbeat row every minute; health reports lag.
- **T-PLT-14-8** E2E: owner receives access request, allows, SA enters, banner visible, session ends at 60 min.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given 10 k tenants, when I search a GSTIN, then the tenant card opens within 1 s with usage numbers.
- **AC-2 (US-2)** Given a tenant at its party limit, when I raise `max_parties` with a reason, then the owner can add parties immediately.
- **AC-3 (US-3)** Given no owner consent, when I try to impersonate, then it is refused; after consent, every action I take is marked as support in the tenant's activity log.
- **AC-4 (US-4)** Given a suspended tenant, when its owner logs in, then they see the suspension notice and no data endpoints work; reactivation restores access.
- **AC-5 (US-5)** Given the scheduler is stopped, when I open Health, then the scheduler tile turns red within 2 minutes.

#### 23. Dependencies
PLT-15 (plans/limits), WLB-02 (partner form), PLT-08 (audit), PLT-09 (revocation), NTF-01/02 (consent notifications), jobs runner heartbeat.

#### 24. Future Enhancements
MFA for SAs (P2), WLB-04 partner-scoped console (P2), feature-flag management UI (P2), billing (PLT-16, P3), read replicas for admin analytics (P3).

---

### PLT-15 — Plan entitlements

#### 1. Business Objective
Define what a tenant may use — modules and numeric limits (members, parties, invoices per month, storage) — from a plan owned by the partner, enforce it at the API with one error code (`plan_limit_reached`) and one UX pattern, and never block the core ledger (Part D #1: paywall only for multi-device/staff/stock/server-SMS; never block entries). Billing is Phase 3; at MVP the plan is assigned by partner default or SA. Success measures: 100 % of limit checks pass the enforcement test matrix; limit-hit UX shows the exact number and the next step; zero limit checks on `POST /ledger-entries`.

#### 2. User Personas
SA and PA (define/assign plans), OW (experiences limits), all members (see locked modules).

#### 3. User Stories
1. **US-PLT-15-1** — As a super admin, I want plans as data (modules + limits) so partners can be given different bundles without code.
2. **US-PLT-15-2** — As an owner, when I hit a limit, I want to see how many I have used and who to contact — not a generic error.
3. **US-PLT-15-3** — As an owner, I want my udhaar entries never to be blocked by any plan.
4. **US-PLT-15-4** — As a partner admin, I want tenants on my plan to see only the modules I resell.

#### 4. Functional Requirements
- **FR-1** `platform_plan` rows are data seeded by `manage.py seed_plans` with at least `free` (modules: all MVP modules; limits `{max_users: 1, max_parties: 300, max_invoices_per_month: 100, storage_mb: 200}`) and `unlimited` (all limits `null`); the local single-user deployment seeds `unlimited` as the `metis` partner's `default_plan_id`. Concrete commercial plans are partner data, not spec.
- **FR-2** Effective entitlement for a tenant = `plan.modules ∩ partner.allowed_modules` (+ `plan.overrides.modules_extra` from PLT-14, still ∩ partner allowed) for modules; for each limit key `override ?? plan.limits[key]` where `null` = unlimited. Computed by `services.entitlements.for_tenant(tenant)` and cached per request.
- **FR-3** Enforcement hooks (server-side, inside the transaction, before writes):

| Limit key | Counted as | Enforced at | Block or warn |
|---|---|---|---|
| `max_users` | memberships with `status ∈ {active, invited}` | `POST /memberships/invite`, invitation accept, `PATCH status→active` | block |
| `max_parties` | `parties_party` rows `deleted_at IS NULL AND status='active'` | `POST /parties`, `POST /parties/{id}/restore`, `POST /imports/{id}/commit` (kind parties: `existing + valid_rows`) | block |
| `max_invoices_per_month` | `sales_document` with `kind ∈ {invoice, bill_of_supply}` and `status ≠ draft` whose `issued_at` falls in the current calendar month (tenant timezone) | `POST /sales/invoices/{id}/issue`, `POST /sales/invoices?issue=true`, estimate convert-and-issue | block at 100 %, warn at 80 % (`warnings[]` `plan_limit_near`) |
| `storage_mb` | Σ `files_attachment.size_bytes` where `deleted_at IS NULL` | any attachment upload (`PUT /tenants/current/branding`, item image, bill photo, receipt, import file) | block |
| modules | `enabled_modules` ⊆ effective modules | every endpoint of a module via `ModuleEnabledPermission` | 403 `module_disabled` |

Never enforced: ledger entries, payments, expenses, estimates, reads, exports, reminders.
- **FR-4** Error: 403 `{error: {code: "plan_limit_reached", message, details: {limit_key, limit, used, plan_code, support_contact: {phone, whatsapp, email}}}}`; `support_contact` from `partner.support_contact`.
- **FR-5** `GET /auth/me` includes `plan_limits: { plan_code, limits: { max_users: {limit, used}, max_parties: {…}, max_invoices_per_month: {limit, used, period_start, period_end}, storage_mb: {limit, used} }, modules: [...] }` so the UI can pre-warn (counters are computed with the same queries, cached 60 s in process per tenant).
- **FR-6** Client UX: the Axios interceptor maps `plan_limit_reached` to a `PlanLimitDialog` (`UbDialog`) opened via `planSlice.actions.limitHit(details)` — shows "You have used {used} of {limit} {noun}", the plan name, and actions "Contact {partner}" (WhatsApp deep link / tel: / mailto:) and "Close"; from Phase 3 an "Upgrade" button. The originating form keeps its data.
- **FR-7** Pre-warning: `UbStatusBanner` at 80 % of `max_invoices_per_month` on the Sales list, at 90 % of `max_parties` on the Party list, using `/auth/me.plan_limits`; Settings → Plan card lists all limits with `MLProgress` bars.
- **FR-8** Plan change/downgrade: existing usage above the new limit is tolerated (no deletion); new creations are blocked until below limit; the nightly `reconcile_entitlements` command trims `enabled_modules` to the effective set, notifies owners (`plan.modules_trimmed`), and never deletes data.
- **FR-9** Import commit counts the whole batch: if `existing + valid_rows > limit` the commit is refused with `plan_limit_reached` and `details.allowed_rows` so the owner can trim the file.

#### 5. Non-Functional Requirements
Limit checks add ≤ 1 indexed `COUNT` per write (index-only scans on `IX(tenant_id, status…)`); month counter uses `IX(tenant_id, kind, status, document_date)` plus `issued_at` filter — CCR-8 adds `IX(tenant_id, issued_at)` on `sales_document`. UX copy in `en`/`hi`. Counters in `/auth/me` ≤ 60 s stale.

#### 6. User Flow
Owner adds the 301st party on `free` → `POST /parties` → 403 → dialog "You have used 300 of 300 parties on the Free plan" → "Contact Metis support on WhatsApp" opens `wa.me` with prefilled text including tenant name and limit → owner closes; form retains data. Later SA raises the override (PLT-14) → owner retries → success. Invoice near-limit: banner "82 of 100 bills this month used" on Sales list.

#### 7. UI Requirements
`features/plan`: `PlanLimitDialog` (`UbDialog`, icon `lucide-react` `Gauge`, `MLProgress` full, `ds-metric-md` "300 / 300", actions), `PlanUsageCard` (Settings → Plan: `UbStatCard` per limit with `MLProgress` "pace" variant, tone warning ≥ 80 %, danger = 100 %), `PlanLimitBanner` (`UbStatusBanner`), `LockedModuleHint` (`UbHelpHint` on sidebar items outside the plan — shown greyed only when partner allows upsell, else hidden). Desktop: dialog 480 px; mobile: bottom sheet.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `plan.limit.title` | Plan limit reached | प्लान की सीमा पूरी हुई |
| `plan.limit.body` | You have used {used} of {limit} {noun} on the {plan} plan. | आपने {plan} प्लान में {limit} में से {used} {noun} इस्तेमाल कर लिए हैं। |
| `plan.noun.max_users` | team members | टीम सदस्य |
| `plan.noun.max_parties` | parties | पार्टियाँ |
| `plan.noun.max_invoices_per_month` | bills this month | इस महीने के बिल |
| `plan.noun.storage_mb` | MB of storage | MB स्टोरेज |
| `plan.limit.contact` | Contact {partner} | {partner} से संपर्क करें |
| `plan.near.body` | {used} of {limit} {noun} used | {limit} में से {used} {noun} इस्तेमाल हुए |
| `plan.card.title` | Your plan | आपका प्लान |
| `plan.card.unlimited` | Unlimited | असीमित |
| `plan.ledgerNote` | Udhaar entries are never limited. | उधार एंट्री पर कोई सीमा नहीं। |

Tone: factual; no upsell copy at MVP. The dialog never appears for ledger entries by construction.

#### 9. States
Initial (plan card skeleton) · Loading · Empty (n/a) · Success (write proceeds) · Error (`plan_limit_reached` dialog) · Disabled (locked modules hidden/greyed) · Partial (warning banner ≥ 80 %) · Processing · Completed · Failed (contact link unavailable when partner has no support contact → shows "Contact your provider").

#### 10. Validation Rules
Plan JSON: `modules` ⊆ module codes; `limits` keys ⊆ {`max_users`, `max_parties`, `max_invoices_per_month`, `storage_mb`}, values int ≥ 0 or null; `price_inr_month` decimal ≥ 0 or null. Overrides same shape. Errors 400 `validation_error`.

#### 11. Business Rules
- **BR-1** `null` limit = unlimited; `0` = feature effectively off (e.g. `max_users: 0` is invalid — must be ≥ 1 since the owner counts).
- **BR-2** Owner membership always counts toward `max_users`.
- **BR-3** Over-limit usage after downgrade is tolerated, never trimmed.
- **BR-4** Month boundary in tenant timezone (`Asia/Kolkata` default); a voided invoice still counts (number was consumed).
- **BR-5** Archived parties do not count; restoring one re-checks.
- **BR-6** Module gating is by `enabled_modules` (owner choice) ∩ effective modules; both must be true.
- **BR-7** Checks are performed inside the same transaction as the write with the tenant row locked (`SELECT … FOR UPDATE` on `platform_tenant`) to prevent concurrent overshoot.

#### 12. Permissions
Plan/limit definitions: SA (`/admin/plans`), PA within ceilings (WLB-04 P2). Viewing own plan: any member (`/auth/me`). No tenant role can change its plan at MVP.

#### 13. Edge Cases
- **EC-1** Concurrent party creation at limit−1 from two devices: tenant row lock serialises; second gets 403.
- **EC-2** Import of 500 rows with limit 300 and 100 existing: refused with `allowed_rows=200`.
- **EC-3** Partner removes `inventory` from `allowed_modules`: nightly trim; owner notified; data retained.
- **EC-4** Storage exceeded by a logo upload: 403 with used/limit MB; suggest deleting old bill photos (link to attachments list — Phase 2; at MVP text only).
- **EC-5** `/auth/me` counters stale by 60 s: the server check is authoritative; the dialog may appear without a prior banner.
- **EC-6** Plan deactivated while assigned: prevented (409 `plan_in_use`).

#### 14. API Requirements
`GET /auth/me` (`plan_limits` shape FR-5), `/admin/plans` (PLT-14), all hooked endpoints return 403 `plan_limit_reached` with FR-4 details and `warnings[]` `plan_limit_near`. Frontend: `planSlice.ts` (`limits`, `lastHit`, `dialogOpen`), `planDisplay.ts` (noun mapping, percent), interceptor hook in `AxiosInstances.ts` (`onPlanLimit`), `planService.ts` (none beyond `/auth/me`; kept for Phase 3 upgrade calls).

#### 15. Database Impact
Reads: `platform_plan`, `platform_partner.allowed_modules`, `platform_tenant_setting['plan.overrides']`, counts on `platform_membership`, `parties_party`, `sales_document`, `files_attachment`. Writes: none (enforcement only), except `reconcile_entitlements` updating `platform_tenant.enabled_modules`. Indexes: existing plus CCR-8 `IX(sales_document.tenant_id, issued_at)`.

#### 16. Audit Requirements
`plan.limit_hit` (metadata: limit_key, limit, used, endpoint) — written even though the request failed (outside the rolled-back transaction, via `transaction.on_commit`? failed transaction → the audit write happens in a separate autocommit call); `plan.modules_trimmed` (before/after, system actor); plan assignment changes are PLT-14 events.

#### 17. Notifications
In-app to owners: `plan.limit_hit` (once per limit key per day), `plan.near_limit` at 80 % (once per month per key), `plan.modules_trimmed`.

#### 18. Analytics / Event Tracking
`ub.platform.plan_limit_hit {limit_key, limit, used, plan_code}`, `ub.platform.plan_limit_near {limit_key, percent}`, `ub.platform.plan_contact_clicked {channel}`, `ub.platform.module_locked_viewed {module}`.

#### 19. Security
Entitlements evaluated server-side only; client hints are cosmetic; module gating enforced by permission class; overrides changeable only by SA/PA with audit; support contact data comes from partner record (no user-entered links).

#### 20. Performance
One `COUNT` with covering index per hooked write; per-request cache of the effective plan; `/auth/me` counters cached 60 s; tenant row lock held only for the write transaction duration.

#### 21. Testing
- **T-PLT-15-1** unit: effective modules/limits with partner intersection, overrides and nulls.
- **T-PLT-15-2** API matrix: for each hooked endpoint, at limit → 403 with correct details; below → 200; `null` → never blocks.
- **T-PLT-15-3** API: `POST /ledger-entries`, `/payments`, `/expenses`, `/sales/estimates` never return `plan_limit_reached` even on `free` at all limits.
- **T-PLT-15-4** API: invoice month counter respects tenant timezone boundary and counts voided.
- **T-PLT-15-5** API: import commit refused with `allowed_rows`.
- **T-PLT-15-6** concurrency: two parallel party creates at limit−1 → exactly one succeeds.
- **T-PLT-15-7** job: `reconcile_entitlements` trims modules and notifies.
- **T-PLT-15-8** component: `PlanLimitDialog` renders details and contact links; form data preserved.
- **T-PLT-15-9** E2E: hit party limit, SA raises override, retry succeeds.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a plan row with modules and limits, when assigned to a tenant, then `/auth/me.plan_limits` reflects it without deployment.
- **AC-2 (US-2)** Given a hit limit, when the dialog appears, then it shows used/limit, the plan name and a working contact action, and my form input is intact.
- **AC-3 (US-3)** Given any plan at 100 % of every limit, when I record "You gave", then it succeeds.
- **AC-4 (US-4)** Given a partner without `inventory`, when a tenant on that partner logs in, then Items is absent from navigation and `/items` returns 403 `module_disabled`.

#### 23. Dependencies
PLT-14 (plans, overrides), WLB-02 (partner allowed modules, support contact), PLT-05/PTY-01/PTY-10/SAL-02/files (hooks), PLT-06 (module toggles), NTF-01.

#### 24. Future Enhancements
PLT-16 subscription billing with self-serve upgrade (P3), usage-based SMS credits (LED-07 P2), trial periods and grace windows (P3), per-partner plan catalogues (WLB-04 P2).

---

## 17.1b White-label (WLB)

### WLB-01 — Tenant branding

#### 1. Business Objective
Let a business put its own face on the app and on every document — logo, primary colour, display name, document header/footer — so bills and statements shared on WhatsApp look like the shop's, not the vendor's, while surfaces, semantic colours and typography stay fixed so red/green ledger meaning and contrast are never broken (Part 23 §23.2.4). Success measures: ≥ 40 % of tenants upload a logo in week 1; 0 branding saves with contrast < 3:1; theme applied before first paint (no flash).

#### 2. User Personas
OW, admin (edit); all members and CU (see the result).

#### 3. User Stories
1. **US-WLB-01-1** — As an owner, I want my logo and shop colour on the app and bills.
2. **US-WLB-01-2** — As an owner, I want a header line and footer line on documents ("Sunday closed", "Goods once sold…").
3. **US-WLB-01-3** — As an owner, I want the app name in the header and PWA to show my shop name.
4. **US-WLB-01-4** — As a customer receiving a statement link, I want to see the shop's branding, not an unknown vendor.

#### 4. Functional Requirements
- **FR-1** `GET /tenants/current/branding` → `{logo_url, signature_url, primary_hex, secondary_hex, app_name, doc_header, doc_footer, partner_defaults: {…same keys…}}`; `PUT /tenants/current/branding` multipart (`logo`, `signature` files; fields `primary_hex`, `secondary_hex`, `app_name`, `doc_header`, `doc_footer`; `remove_logo=true` to clear).
- **FR-2** Resolution order for every branding key: tenant value → partner `branding` default (WLB-02) → product default (Part 23 theme). The response carries the resolved value and `source ∈ {tenant, partner, default}` per key so the UI can show "Using {partner} default".
- **FR-3** Server validates `primary_hex` contrast vs `#FFFFFF` ≥ 3:1 (WCAG relative luminance) → 400 `low_contrast` otherwise; `secondary_hex` optional and used only for document accents.
- **FR-4** Runtime theming: `whiteLabelSlice` receives branding from `/auth/me.active_tenant.branding` and `ThemeProvider` (`components/layout/ThemeProvider.tsx`, BrandHub `DSThemeProvider` pattern) derives `--primary-50…900` HSL ramp from `primary_hex` (lightness steps 97/91/80/66/54/base/44/34/24/14 %, saturation preserved) and sets them on `<html>` before hydration (inline script reading `localStorage.ub_theme_cache` to avoid flash), plus `--accent`, `--accent-hover`, `--accent-press`, `--accent-quiet`, `--accent-line`, `--border-focus`. Nothing else is overridable (surfaces, `--success/--warning/--error/--info`, fonts).
- **FR-5** `app_name` (≤ 30 chars) replaces the product name in `UbPageHeader`, auth screens after login, `document.title`, PWA `manifest.webmanifest` (served per tenant at `/manifest?tid=` with `name`, `short_name`, icons from logo 192/512 px generated by Pillow) and share texts (`{appName}` placeholder).
- **FR-6** Logo: PNG/JPEG/WebP/SVG? **SVG rejected** (sanitisation cost); ≤ 2 MB; resized to 600 px width; `files_attachment kind='logo'`; served via authenticated `/files/{id}` and via signed URL inside public document pages (SAL-03/LED-04).
- **FR-7** Document header/footer: `doc_header` ≤ 120 chars plain text (printed under the business name), `doc_footer` ≤ 300 chars (printed above the partner legal footer). Partner `branding.legal_footer` (WLB-02) is always appended and not editable by tenants.
- **FR-8** Print components (`features/documents-print`: `InvoiceA4`, `InvoiceThermal80`, `StatementA4`, `ReceiptA4`) read branding from `whiteLabelSlice` and render logo, colours (primary for rules/headings only; amounts keep ledger semantics), header/footer.
- **FR-9** "Reset to partner default" per key sets the tenant value to null.
- **FR-10** Preview panel renders the app header and an invoice header live with the unsaved values.

#### 5. Non-Functional Requirements
Theme application ≤ 5 ms on boot; no flash (cache + inline script). Upload P95 ≤ 1.5 s. Contrast script `scripts/check-contrast.mjs` reused server-side in Python (same formula) — tested equal. Copy `en`/`hi`.

#### 6. User Flow
Settings → Branding → upload logo (drag/drop or camera) → pick colour (`MLInput type=color` + hex field + 8 preset swatches) → contrast indicator → app name → header/footer → live preview → Save → theme switches immediately (`whiteLabelSlice` updated; ramp recomputed). Alternates: `low_contrast` → inline error with suggested darker shade (server returns `details.suggested_hex`); remove logo → partner/default logo shown.

#### 7. UI Requirements
Route `app/(app)/settings/branding/page.tsx` → `<BrandingPageContent/>` (`features/branding`). Components: `UbFileUpload` + `UbImagePreview` (logo), `ColourField` (feature-specific: swatches `MLToggleGroup`, native colour input, hex `MLInput` `ds-mono`, contrast badge `UbStatusBadge` "AA ✓ 4.6:1" / "Too light"), `UbField` for app name/header/footer with counters, `BrandingPreview` (`MLCard` containing a mini `UbPageHeader` and `DocumentHeaderPreview`), "Using partner default" `MLBadge` per field with "Reset" ghost button.
Desktop: form 520 px left, sticky preview right. Mobile: single column; preview collapsible.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `branding.title` | Branding | ब्रांडिंग |
| `branding.logo.label` | Logo | लोगो |
| `branding.colour.label` | Brand colour | ब्रांड रंग |
| `branding.colour.lowContrast` | Too light for buttons. Try {hex} | बटन के लिए बहुत हल्का। {hex} आज़माएँ |
| `branding.appName.label` | App name | ऐप का नाम |
| `branding.docHeader.label` | Bill header line | बिल हेडर लाइन |
| `branding.docFooter.label` | Bill footer note | बिल फ़ुटर नोट |
| `branding.usingDefault` | Using {source} default | {source} डिफ़ॉल्ट इस्तेमाल हो रहा है |
| `branding.reset` | Reset | रीसेट |
| `branding.saved` | Branding updated | ब्रांडिंग अपडेट हुई |

Colour hint explains that red/green ledger colours never change. No confirmation on save; audit keeps before/after.

#### 9. States
Initial (skeleton) · Loading · Empty (no tenant values: all "Using default") · Success (theme switches live) · Error (`low_contrast`, file errors) · Disabled (accountant/staff: page hidden) · Partial (upload progress) · Processing · Completed · Failed (upload failed → retry).

#### 10. Validation Rules
| Field | Rule | Message | Code |
|---|---|---|---|
| primary_hex / secondary_hex | `^#[0-9A-Fa-f]{6}$` | Enter a colour like #2B6BE0 | `validation_error` |
| primary_hex | contrast vs white ≥ 3:1 | Too light for buttons | `low_contrast` (400) |
| app_name | 2–30 chars | | `validation_error` |
| doc_header | ≤ 120 | | `validation_error` |
| doc_footer | ≤ 300 | | `validation_error` |
| logo | png/jpeg/webp ≤ 2 MB, min 64 px | Use a PNG or JPG under 2 MB | `validation_error` |

Yup `brandingSchema` with `hexColourValidation()`.

#### 11. Business Rules
- **BR-1** Only `--primary-*` ramp, logo, app name, doc header/footer are tenant-configurable (Part 23 §23.2.4).
- **BR-2** Partner legal footer always prints; partner may lock keys (`partner.branding.locked_keys[]`, WLB-02) → tenant field read-only with lock icon; server 403 `branding_locked` on attempt.
- **BR-3** Issued documents render with branding **at render time** (not snapshotted) — branding is presentation, not content; `party_snapshot` covers legal content.
- **BR-4** Dark theme derives from the same hex (`--accent = primary-400`).
- **BR-5** Logo replacement soft-deletes the previous attachment.

#### 12. Permissions
`platform.branding.manage` (owner, admin). Read: everyone via `/auth/me`.

| Action | owner | admin | staff | accountant |
|---|---|---|---|---|
| Edit branding | ✅ | ✅ | ❌ | ❌ |
| See branding | ✅ | ✅ | ✅ | ✅ |

#### 13. Edge Cases
- **EC-1** Hex with near-white (e.g. `#FFEE00`): rejected with suggestion (darken until 3:1).
- **EC-2** Logo with transparent background on dark sidebar: sidebar shows a white rounded plate behind the logo.
- **EC-3** Long app names in bottom nav: bottom nav never shows the name; header truncates at 22 chars.
- **EC-4** Partner locks colour: field disabled; API refuses.
- **EC-5** Public document viewed by CU: branding loaded from the token's tenant server-side into the public page (no auth).
- **EC-6** Theme cache from a previous tenant (switch): cache keyed by tenant id; cleared on switch.

#### 14. API Requirements
`GET/PUT /tenants/current/branding` (Part 22 §22.3; deltas: `source` per key, `remove_logo`, `details.suggested_hex`, 403 `branding_locked`), `/auth/me` (branding in `active_tenant`), `GET /manifest?tid=` (CCR-13). Frontend: `brandingService.ts` (`fetchBranding`, `saveBranding`), `brandingThunk.ts` (`fetchBranding`, `saveBranding`, `resetBrandingKey`), `brandingSlice.ts` (form state) → on success dispatch `whiteLabelSlice.actions.set(branding)`; `utils/theme.ts` (`hexToHslRamp`, `contrastRatio`).

#### 15. Database Impact
`platform_tenant.branding` jsonb (`logo_attachment_id`, `primary_hex`, `secondary_hex`, `doc_header`, `doc_footer`, `app_name`, `signature_attachment_id`), `files_attachment` (`logo`), audit. Reads `platform_partner.branding` for defaults/locks.

#### 16. Audit Requirements
`branding.updated` with before/after of changed keys (attachment ids, hex, texts) — Part 21 §21.7 "Tenant, settings, branding: yes".

#### 17. Notifications
None.

#### 18. Analytics / Event Tracking
`ub.whitelabel.branding_saved {keys_changed[], has_logo}`, `ub.whitelabel.low_contrast_rejected`, `ub.whitelabel.branding_reset {key}`.

#### 19. Security
Image sniffing and re-encoding (strips payloads/EXIF); SVG rejected; text fields escaped in print components (React escapes); partner locks enforced server-side; public pages embed signed logo URLs (15 min) only.

#### 20. Performance
Ramp computed once per branding change; CSS variables set on `<html>`; logo cached with `Cache-Control: private, max-age=86400` keyed by attachment id.

#### 21. Testing
- **T-WLB-01-1** unit: `hexToHslRamp` snapshot for 5 hexes; `contrastRatio('#2B6BE0','#FFFFFF') ≈ 4.6`.
- **T-WLB-01-2** API: low contrast → 400 with `suggested_hex` passing 3:1.
- **T-WLB-01-3** API: resolution order tenant → partner → default with `source`.
- **T-WLB-01-4** API: locked key → 403 `branding_locked`.
- **T-WLB-01-5** component: `ThemeProvider` sets `--primary-500` on `<html>`; no flash (cache read before paint).
- **T-WLB-01-6** E2E: upload logo, set colour, invoice PDF preview shows both; public statement link shows logo.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a logo and `#0F766E`, when saved, then buttons and the invoice header use the teal ramp and the logo within 1 s, no reload.
- **AC-2 (US-2)** Given header/footer text, when I print an invoice, then both lines appear and the partner legal footer follows.
- **AC-3 (US-3)** Given app name "Kirana Bhandar", when I install the PWA, then the icon label reads "Kirana Bhandar".
- **AC-4 (US-4)** Given a public statement link, when opened logged-out, then the shop logo and colour render.

#### 23. Dependencies
WLB-02 (partner defaults/locks), PLT-07 (signature), SAL-03/LED-04/PAY-04 (print components), files app, Part 23 tokens.

#### 24. Future Enhancements
WLB-05 extended tokens (P2), invoice template gallery (SAL-03 P2), business-card share (research F14, P2), per-tenant favicon (P2 with WLB-03).

---

### WLB-02 — Partner configuration

#### 1. Business Objective
Model the reseller (bank, fintech, distributor, ERP vendor) as a first-class record so every tenant inherits its branding defaults, allowed modules, default plan, support contact and legal footer, and the same codebase serves Metis directly and each partner without forks. Metis Labs is the default partner `metis`. Success measures: a new partner is live with a seeded plan in ≤ 1 h of ops work; tenants of a partner never see another partner's branding; zero hard-coded partner strings.

#### 2. User Personas
SA (creates/edits at MVP), PA (edits own record in WLB-04, Phase 2), OW (indirect: inherits).

#### 3. User Stories
1. **US-WLB-02-1** — As a super admin, I want to create a partner with code, name, branding defaults, allowed modules and default plan.
2. **US-WLB-02-2** — As a super admin, I want to set the partner's support contact so limit dialogs and suspension screens point merchants to the right helpdesk.
3. **US-WLB-02-3** — As a super admin, I want to lock certain branding keys so a bank's merchants cannot change the bank's colour.
4. **US-WLB-02-4** — As an owner under a partner, I want the app to show the partner's defaults until I customise.

#### 4. Functional Requirements
- **FR-1** `GET/POST /admin/partners`, `GET/PATCH /admin/partners/{id}` over `platform_partner`: `code` (`^[a-z0-9_]{2,32}$`, immutable after create), `name`, `status` (`active|suspended`), `branding` (schema v1: `{logo_attachment_id, primary_hex, secondary_hex, app_name, doc_footer, legal_footer, locked_keys[], favicon_attachment_id (P2)}`), `allowed_modules[]`, `default_plan_id`, `support_contact {phone, whatsapp, email, hours}`, `hostnames[]` (P2, WLB-03), `settings` (`{sms_sender_id, dlt_entity_id, whatsapp_number, email_domain}` P2 WLB-06; `max_overrides` P2).
- **FR-2** Partner logo upload via `PUT /admin/partners/{id}/branding` multipart (CCR-12 extension) storing `files_attachment` with `tenant_id NULL`? `files_attachment.tenant_id` is NN per `TenantModel` — **Decision:** partner files are stored with `tenant_id NULL` requires a CCR (CCR-14: make `files_attachment.tenant_id` nullable for `owner_type='partner'`).
- **FR-3** Tenants resolve branding/support/modules from their `partner_id` at request time (WLB-01 FR-2, PLT-15 FR-2); changing partner defaults propagates immediately to tenants using defaults.
- **FR-4** `allowed_modules` change: removing a module triggers the nightly `reconcile_entitlements` (PLT-15 FR-8) for all the partner's tenants; adding requires nothing (tenants opt in via PLT-06).
- **FR-5** `status='suspended'` makes all partner tenants respond 403 `partner_suspended` (read-only banner with Metis support contact); tenants themselves are not marked suspended.
- **FR-6** Partner assignment of a tenant: at MVP every self-signup tenant belongs to the partner resolved from the hostname (WLB-03) or `metis`; SA can move a tenant between partners via `PATCH /admin/tenants/{id} {partner_id, reason}` (PLT-14) with GSTIN uniqueness re-checked per new partner (409 `gstin_in_use`).
- **FR-7** `legal_footer` (≤ 300 chars) prints on all documents and the privacy page; `doc_footer` is the partner default for tenants' footer.
- **FR-8** Seed: `manage.py seed_partners` creates `metis` (name "DigiKhaato by Metis Labs", all modules, default plan `unlimited` locally / `free` in SaaS, support contact from env, legal footer "Powered by DigiKhaato").
- **FR-9** Partner list shows tenant counts and active users (nightly `reports_snapshot` key `partner_usage`).

#### 5. Non-Functional Requirements
Admin-only UI, desktop-first; branding validation identical to WLB-01 (contrast ≥ 3:1); copy English (SA persona, see CCR note); resolution cached per request.

#### 6. User Flow
SA → Admin → Partners → "New partner" `UbDrawer` → code, name → branding (logo, colour, app name, legal footer, locked keys checkboxes) → allowed modules (checkbox list) → default plan (`MLSelect`) → support contact → Save. Later: edit → tenants see new defaults on next `/auth/me`.

#### 7. UI Requirements
`features/partner` (admin): `PartnerListPage` (`UbDataGrid`: code, name, status, tenants, plan), `PartnerDrawer` (`UbDrawer` 640 px, `UbTabs` Profile / Branding / Modules & plan / Support / Messaging(P2) / Domains(P2)), reuses `ColourField`, `UbFileUpload`, `ModuleToggleList` (from PLT-06, admin variant), `LockedKeysChecklist` (`MLCheckbox` for `primary_hex`, `app_name`, `doc_footer`, `logo`).

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `partner.title` | Partners | Partners |
| `partner.new` | New partner | New partner |
| `partner.code.hint` | Lowercase letters, numbers, underscore. Cannot change later. | Lowercase letters, numbers, underscore. Cannot change later. |
| `partner.locked.hint` | Locked keys cannot be changed by merchants | Locked keys cannot be changed by merchants |
| `partner.support.title` | Support contact | Support contact |
| `partner.legalFooter.label` | Legal footer (printed on every document) | Legal footer (printed on every document) |
| `partner.suspended.banner` | Service paused by {partner}. Contact {contact}. | सेवा {partner} द्वारा रोकी गई। {contact} से संपर्क करें। |

Owner-facing `partner.suspended.banner` is localised.

#### 9. States
Initial · Loading · Empty ("Only Metis exists") · Success · Error (validation) · Disabled (code after create) · Partial (usage counters "updating nightly") · Processing · Completed · Failed.

#### 10. Validation Rules
`code` regex + unique; `name` 2–120; `allowed_modules` ⊆ module codes and ⊇ {`platform`, `parties`, `ledger`}; `default_plan_id` active plan; `support_contact.phone/whatsapp` E.164; `email` RFC; `hours` ≤ 80; branding as WLB-01; `legal_footer` ≤ 300; `locked_keys` ⊆ {`primary_hex`,`secondary_hex`,`app_name`,`doc_footer`,`logo`}.

#### 11. Business Rules
- **BR-1** `metis` cannot be deleted or suspended.
- **BR-2** A tenant has exactly one partner; moving partners re-validates GSTIN uniqueness and plan availability (plan must be allowed for the partner — plans are global at MVP).
- **BR-3** Partner defaults are read live; nothing is copied into tenants (except during onboarding preset intersection).
- **BR-4** Partner suspension is reversible and non-destructive.

#### 12. Permissions
SA only at MVP (`is_super_admin`). PA (WLB-04) may edit `branding`, `support_contact`, `settings` of its own partner, not `allowed_modules`, `default_plan_id`, `status`.

#### 13. Edge Cases
- **EC-1** Removing `sales` from a partner with tenants holding drafts: trim happens nightly; drafts become inaccessible until re-enabled (data retained).
- **EC-2** Partner logo missing: tenants fall back to product default logo.
- **EC-3** Two partners same `name`: allowed; `code` unique.
- **EC-4** Locked key already customised by tenants: existing tenant values are ignored (resolution returns partner value) — audit `branding.locked_override` nightly? **Decision:** resolution ignores tenant values for locked keys immediately; no data change.

#### 14. API Requirements
`/admin/partners*` per Part 22 §22.3 plus CCR-12 `PUT /admin/partners/{id}/branding`; error codes `partner_suspended` (403), `gstin_in_use` (409). Frontend: `partnerService.ts`, `partnerThunk.ts` (`fetchPartners`, `fetchPartner`, `createPartner`, `updatePartner`, `uploadPartnerBranding`), `partnerSlice.ts`.

#### 15. Database Impact
`platform_partner` (all columns), `files_attachment` (CCR-14 nullable tenant for partner files), `reports_snapshot` (`partner_usage`), audit (`tenant_id NULL`). Reads `platform_plan`.

#### 16. Audit Requirements
`admin.partner_created`, `admin.partner_updated` (before/after changed fields), `admin.partner_suspended/reactivated`, `admin.tenant_partner_changed` (before/after partner) — all `actor_type='super_admin'`.

#### 17. Notifications
In-app to tenant owners when their partner changes defaults that affect them: `partner.modules_changed` (via reconcile), `partner.suspended`.

#### 18. Analytics / Event Tracking
`ub.whitelabel.partner_created`, `ub.whitelabel.partner_updated {fields[]}`, `ub.whitelabel.partner_suspended`.

#### 19. Security
SA-only; partner files served through signed URLs on public pages; `code` immutable to keep hostnames/analytics stable; no partner can read another's data (partner scoping in WLB-04 by `partner_id`).

#### 20. Performance
Partner row cached per request; usage counters nightly; ≤ 100 partners expected.

#### 21. Testing
- **T-WLB-02-1** API: create partner, assign tenant, tenant `/auth/me` shows partner branding and support contact.
- **T-WLB-02-2** API: locked key resolution ignores tenant value.
- **T-WLB-02-3** API: partner suspended → tenant endpoints 403 `partner_suspended`.
- **T-WLB-02-4** job: removing module → reconcile trims tenants, notifies.
- **T-WLB-02-5** API: move tenant to partner with same GSTIN present → 409.
- **T-WLB-02-6** seed: `seed_partners` idempotent; `metis` exists with default plan.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a new partner with modules and a default plan, when a tenant is created under it, then the tenant's plan and module set match.
- **AC-2 (US-2)** Given a support contact, when a merchant hits a plan limit, then the dialog shows that contact.
- **AC-3 (US-3)** Given `primary_hex` locked, when a merchant tries to change colour, then the field is disabled and the API refuses.
- **AC-4 (US-4)** Given no tenant branding, when the owner logs in, then the partner's logo, colour and app name appear.

#### 23. Dependencies
PLT-14 (console), PLT-15 (plans), WLB-01 (resolution), files app, WLB-03/04/06 (P2 fields).

#### 24. Future Enhancements
WLB-03 hostnames, WLB-04 partner console, WLB-05 token overrides, WLB-06 messaging identities; partner-defined onboarding presets and plan catalogues (P3); partner API keys/SSO (P3).

---

### WLB-03 — Partner domain & login page — Phase 2

#### 1. Business Objective
Resolve partner branding before login from the hostname (`khata.examplebank.in`) so merchants of a partner see the partner's logo, colours and app name on the auth screens and PWA, reinforcing the reseller relationship. Success measure: branded auth screen first paint ≤ 1.5 s on 4G; zero wrong-partner branding.

#### 2. User Personas
PA (configures), OW/ST (see it), SA (verifies).

#### 3. User Stories
1. **US-WLB-03-1** — As a partner admin, I want to register my hostname and see my branding on login without asking Metis to deploy.
2. **US-WLB-03-2** — As a merchant on a partner domain, I want new sign-ups to be attached to that partner automatically.
3. **US-WLB-03-3** — As a merchant, I want a tenant of another partner to be inaccessible from this domain (clear message), so branding is never mixed.

#### 4. Functional Requirements
- **FR-1** `platform_partner.hostnames[]` (unique per element, GIN) edited via WLB-04/PLT-14; hostname validated as lowercase DNS name; verification by DNS TXT `_ub-verify.<host> = <token>` checked by `manage.py verify_partner_hostnames` (scheduler, hourly) → `settings.hostname_verified[host]=true`.
- **FR-2** `GET /public/branding?host=<host>` (CCR-15, unauthenticated, cached 5 min, `Vary: host`) → resolved partner branding `{partner_code, app_name, logo_url, primary_hex, legal_footer, support_contact}`; unknown host → `metis` defaults.
- **FR-3** Frontend `app/layout.tsx` server component fetches branding by request `Host` before render, injects CSS variables and the manifest link (`/manifest?partner=<code>`), and stores `partner_code` in `whiteLabelSlice.partnerCode`.
- **FR-4** `POST /auth/otp/request|verify`, `/auth/login`, `POST /tenants` accept the request `Host`; the server maps host → partner and (a) attaches new tenants to that partner, (b) on login filters `tenants[]` to memberships whose tenant's partner matches the host (others returned under `other_partner_tenants: [{name, partner_login_url}]` so the user can be pointed to the right domain).
- **FR-5** `/auth/switch-tenant` to a tenant of another partner from this host → 403 `wrong_partner_host` with `details.login_url`.
- **FR-6** Metis default host serves all partners' tenants (support/ops path) with the tenant's resolved branding after login.
- **FR-7** TLS termination and certificate provisioning are deployment concerns (reverse proxy, ACME); the app only validates `Host` against the known list (`ALLOWED_HOSTS` extended dynamically from `hostnames` cache).

#### 5. Non-Functional Requirements
Branding lookup ≤ 20 ms (in-process cache 5 min); SSR of auth screen with correct theme (no flash); `Vary: host` caching at the proxy; copy `en`/`hi`.

#### 6. User Flow
PA adds `khata.examplebank.in` → sees TXT instructions → DNS set → hourly verify → status "Verified" → merchant opens the host → branded login → OTP → tenants of that partner listed → dashboard. Alternate: merchant with tenants under Metis only → "Your businesses are on {login_url}" screen.

#### 7. UI Requirements
Partner console (WLB-04) → Domains tab: `HostnameList` (`MLTable`: host, status badge Pending/Verified, TXT token `ds-mono` with copy button, remove). Auth screens: partner logo replaces product logo, `--primary` ramp applied, legal footer at bottom, support contact link.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `partner.domains.title` | Domains | Domains |
| `partner.domains.addTxt` | Add this TXT record to verify | Add this TXT record to verify |
| `auth.wrongPartner.title` | Your business is on a different login page | आपका व्यापार किसी और लॉगइन पेज पर है |
| `auth.wrongPartner.cta` | Go to {host} | {host} पर जाएँ |

#### 9. States
Initial (unknown host → default branding) · Loading (SSR; none visible) · Empty (no hostnames) · Success (Verified) · Error (DNS check failed with reason) · Disabled (remove disabled while tenants use it? no — allowed) · Partial (Pending verification) · Processing · Completed · Failed (host claimed by another partner → 409 `hostname_in_use`).

#### 10. Validation Rules
Hostname `^(?=.{4,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$`; unique across partners (409 `hostname_in_use`); ≤ 5 hostnames per partner; must be verified before it serves branding (unverified host → default branding).

#### 11. Business Rules
- **BR-1** Host → partner mapping is authoritative for sign-up partner attachment.
- **BR-2** A user may hold memberships across partners; each host shows only its partner's tenants plus pointers.
- **BR-3** Metis host is universal.
- **BR-4** Hostname removal falls back to default branding immediately; sessions unaffected.

#### 12. Permissions
PA (WLB-04) for own hostnames; SA for all. Public branding endpoint unauthenticated.

#### 13. Edge Cases
- **EC-1** DNS propagation delay: pending up to 48 h; manual "Check now" button (rate-limited 1/min).
- **EC-2** Host reused after partner suspension: partner suspended → host serves a suspension page.
- **EC-3** `Host` header spoofing: unknown host → defaults; never trusts host for tenant context.
- **EC-4** PWA installed from partner host: manifest scoped to that origin; switching partner domains means reinstall.

#### 14. API Requirements
CCR-15: `GET /public/branding?host=`, `GET/POST/DELETE /partner/hostnames` (WLB-04 namespace), `POST /partner/hostnames/{host}/verify`; deltas on auth responses (`other_partner_tenants`), 403 `wrong_partner_host`, 409 `hostname_in_use`. Frontend: `whiteLabelSlice.partnerCode`, `publicBrandingService.ts` (`fetchPublicBranding`), server-side fetch in `app/layout.tsx`.

#### 15. Database Impact
`platform_partner.hostnames` (GIN unique), `platform_partner.settings.hostname_verified`, `files_attachment` (partner logo). Cache table none (in-process).

#### 16. Audit Requirements
`partner.hostname_added/verified/removed` (actor PA/SA), `auth.wrong_partner_host` (metadata host, tenant) for support diagnostics.

#### 17. Notifications
In-app to PA: `partner.hostname_verified`.

#### 18. Analytics / Event Tracking
`ub.whitelabel.branded_login_viewed {partner_code}`, `ub.whitelabel.hostname_verified`, `ub.whitelabel.wrong_partner_redirect`.

#### 19. Security
Host allowlist from verified hostnames only; TXT verification proves control; public branding endpoint returns no PII beyond partner support contact; CSRF cookies scoped per host; no cross-host token reuse (cookies are host-bound).

#### 20. Performance
Branding cache 5 min per host; SSR fetch on the same network; CDN/proxy caching with `Vary: host`.

#### 21. Testing
- **T-WLB-03-1** API: unknown host → metis defaults; verified host → partner branding.
- **T-WLB-03-2** API: sign-up on partner host attaches partner.
- **T-WLB-03-3** API: login on host lists only that partner's tenants; switch to other-partner tenant → 403.
- **T-WLB-03-4** job: TXT verification flips status.
- **T-WLB-03-5** E2E: branded login screen renders partner logo before hydration.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a verified hostname, when a merchant opens it, then the login page shows my logo and colour.
- **AC-2 (US-2)** Given a sign-up on my host, when the tenant is created, then its `partner_id` is mine.
- **AC-3 (US-3)** Given a user with tenants under two partners, when they log in on my host, then only my tenants are openable and others are pointed to their login URL.

#### 23. Dependencies
WLB-02, WLB-04 (UI), WLB-01 (theme provider), deployment TLS.

#### 24. Future Enhancements
Custom favicon and OG images per partner; automatic ACME certificate requests via API (P3); per-host feature flags.

---

### WLB-04 — Partner admin console — Phase 2

#### 1. Business Objective
Let a partner's operations team manage their own merchants — list tenants, view usage, adjust entitlements within Metis-granted ceilings, edit their branding and support contact — without Metis in the loop. Success measures: partner support resolves plan-limit tickets without Metis; zero cross-partner data exposure.

#### 2. User Personas
PA (primary), SA (grants ceilings).

#### 3. User Stories
1. **US-WLB-04-1** — As a partner admin, I want to see my tenants with plan, usage and last activity and search by name/GSTIN/mobile.
2. **US-WLB-04-2** — As a partner admin, I want to raise a merchant's party limit within the ceiling Metis allows me.
3. **US-WLB-04-3** — As a partner admin, I want to edit our branding, support contact and messaging identities.
4. **US-WLB-04-4** — As a partner admin, I want to invite another partner admin colleague.

#### 4. Functional Requirements
- **FR-1** Partner admin identity: `platform_partner_admin` (CCR-16: `partner_id`, `user_id`, `role ∈ {partner_owner, partner_support}`, `status`) links existing `platform_user` rows (login by PLT-01/02) to a partner; `/auth/me` returns `partner_admin: {partner_id, role}`; the console is at `app/(partner)/partner/**` and visible when present.
- **FR-2** Endpoints under `/partner/*` (CCR-16) mirror the PLT-14 subset scoped by `partner_id`: `GET /partner/tenants` (same row shape as `/admin/tenants`), `GET /partner/tenants/{id}`, `PATCH /partner/tenants/{id} {plan_id?, entitlement_overrides?, status?, reason}` where `plan_id` ∈ partner's allowed plans (`partner.settings.allowed_plan_ids`), overrides ≤ `partner.settings.max_overrides[key]`, `status` suspend/reactivate allowed; `GET/PATCH /partner/profile` (branding, support_contact, settings.messaging), `GET/POST/DELETE /partner/hostnames` (WLB-03), `GET/POST/PATCH /partner/admins`, `GET /partner/usage` (aggregate: tenants, active tenants 30 d, invoices this month, SMS sent — from `reports_snapshot` `partner_usage`), `GET /partner/audit-logs` (rows of the partner's tenants where `action LIKE 'admin.%' OR 'partner.%'`, plus partner-level rows).
- **FR-3** Impersonation for partner support follows PLT-14's consent flow via `POST /partner/tenants/{id}/access-request` with `actor_type='partner_admin'` (CCR-16 adds this value) and the tenant banner naming the partner.
- **FR-4** Ceilings: SA sets `partner.settings.max_overrides = {max_users: 20, max_parties: 5000, …}` and `allowed_plan_ids`; PATCH beyond → 403 `partner_ceiling_exceeded`.
- **FR-5** Partner admins cannot see tenant business data (parties, ledgers) except through consented impersonation; tenant rows expose only profile and usage counters.
- **FR-6** Partner-level export: `GET /partner/tenants?format=csv`.

#### 5. Non-Functional Requirements
Desktop-first; P95 list ≤ 300 ms with `IX(partner_id)`; copy `en` (PA persona) with `hi` mirroring English; every change with reason.

#### 6. User Flow
PA logs in on partner host → header "Partner console" → Tenants → search → tenant drawer → Entitlements tab → raise `max_parties` to 1 000 (ceiling 5 000) + reason → save → merchant unblocked. Profile → edit support contact → save → merchants' limit dialogs update.

#### 7. UI Requirements
`features/partner-console` reusing `features/admin` components with a `scope='partner'` prop: `UbDataGrid` tenant list, `AdminTenantDrawer` (Overview, Entitlements with ceiling hints "max {ceiling}", Audit), `PartnerProfileForm` (WLB-02 drawer tabs Branding/Support/Messaging/Domains), `PartnerAdminsList` (invite by mobile → PLT-05-like flow scoped to partner), `UbStatCard` usage tiles.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `partnerConsole.title` | Partner console | Partner console |
| `partnerConsole.tenants` | Merchants | Merchants |
| `partnerConsole.ceiling.hint` | Up to {ceiling} allowed by Metis | Up to {ceiling} allowed by Metis |
| `partnerConsole.ceiling.exceeded` | Above your ceiling ({ceiling}). Contact Metis. | Above your ceiling ({ceiling}). Contact Metis. |
| `partnerConsole.admins.invite` | Invite partner admin | Invite partner admin |

#### 9. States
Initial · Loading · Empty (no merchants yet: onboarding link instructions) · Success · Error · Disabled (fields above ceiling; status change for `pending_deletion`) · Partial (usage nightly) · Processing · Completed · Failed (403 `partner_ceiling_exceeded` inline).

#### 10. Validation Rules
Overrides ≤ ceilings; `plan_id` in allowed list; `reason` ≥ 5 chars; admin invite mobile regex; a partner must keep ≥ 1 `partner_owner`.

#### 11. Business Rules
- **BR-1** Partner scope = `tenant.partner_id == partner_admin.partner_id`; everything else 404.
- **BR-2** Partner admins never see ledger/party data without consent.
- **BR-3** Ceilings are set only by SA.
- **BR-4** Partner suspension of a tenant behaves like SA suspension but is attributed to the partner in the banner.

#### 12. Permissions
`partner_owner`: all `/partner/*`; `partner_support`: read + tenant entitlements + access requests, no profile/admins edits. Tenant roles have no access.

#### 13. Edge Cases
- **EC-1** A user is both a tenant owner and a partner admin: both consoles available; contexts separate (`/partner/*` ignores `tid`).
- **EC-2** Ceiling lowered below an existing override: existing kept; further raises blocked.
- **EC-3** Partner admin removed: `/partner/*` → 403; tenant memberships unaffected.

#### 14. API Requirements
CCR-16 `/partner/*` endpoints and `platform_partner_admin`; errors `partner_ceiling_exceeded` (403). Frontend: `partnerConsoleService.ts`, `partnerConsoleThunk.ts`, `partnerConsoleSlice.ts`; `sessionSlice.partnerAdmin`.

#### 15. Database Impact
`platform_partner_admin` (new, CCR-16), `platform_partner.settings` (`allowed_plan_ids`, `max_overrides`, messaging), `platform_tenant_setting['plan.overrides']`, `reports_snapshot` (`partner_usage`), audit. Index `IX(platform_tenant.partner_id)` exists.

#### 16. Audit Requirements
`partner.tenant_overrides_changed`, `partner.tenant_plan_changed`, `partner.tenant_suspended/reactivated`, `partner.profile_updated`, `partner.admin_invited/removed`, `partner.access_requested`, impersonation events with `actor_type='partner_admin'`.

#### 17. Notifications
Tenant owners: `plan.overrides_changed` ("{partner} raised your party limit to {n}"); PA: `partner.admin_joined`.

#### 18. Analytics / Event Tracking
`ub.whitelabel.partner_console_viewed`, `ub.whitelabel.partner_override_set {limit_key}`, `ub.whitelabel.partner_ceiling_hit {limit_key}`.

#### 19. Security
Scoped queryset by `partner_id` on every `/partner/*` view; consented impersonation only; reasons mandatory; partner admins subject to MFA in P2 alongside SAs.

#### 20. Performance
Tenant list indexed by partner; usage snapshots nightly.

#### 21. Testing
- **T-WLB-04-1** API: partner admin lists only own tenants; other partner's tenant id → 404.
- **T-WLB-04-2** API: override above ceiling → 403; within → applied and visible in tenant `/auth/me`.
- **T-WLB-04-3** API: `partner_support` cannot PATCH profile.
- **T-WLB-04-4** E2E: PA raises limit; merchant retries successfully.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given 500 merchants, when I search a GSTIN, then only my partner's match opens.
- **AC-2 (US-2)** Given ceiling 5 000, when I set 1 000, then it applies; 6 000 is refused.
- **AC-3 (US-3)** Given I change the support phone, when a merchant hits a limit, then the new number shows.
- **AC-4 (US-4)** Given an invited colleague, when they accept, then they see the console with the assigned role.

#### 23. Dependencies
WLB-02, PLT-14 (components, consent flow), PLT-15, WLB-03, WLB-06.

#### 24. Future Enhancements
Partner billing statements (PLT-16), partner API keys/SSO (P3), partner-defined presets (P3), white-label help content (HLP-01).

---

### WLB-05 — Theme tokens & typography overrides — Phase 2

#### 1. Business Objective
Allow partners (not tenants) to go beyond the primary colour — radius scale, font pairing, secondary accent — while a validator guarantees contrast and legibility so ledger semantics stay intact. Success measure: any partner theme passes the CI contrast script; no runtime style regressions.

#### 2. User Personas
PA (configures), SA (approves), all users of that partner (see).

#### 3. User Stories
1. **US-WLB-05-1** — As a partner admin, I want rounded vs square controls and our brand font so the app matches our other products.
2. **US-WLB-05-2** — As a partner admin, I want the system to refuse a combination that fails accessibility rather than ship it.
3. **US-WLB-05-3** — As a super admin, I want to preview and approve a partner theme before it goes live.

#### 4. Functional Requirements
- **FR-1** `platform_partner.branding` schema v2 adds `theme: {radius_scale: 'sharp'|'default'|'round', font_ui: 'inter'|'noto-sans'|'custom', font_display: same, custom_font_attachment_ids: [], secondary_hex, nav_hex, status: 'draft'|'approved'}`.
- **FR-2** Token mapping: `radius_scale` sets `--radius-xs…xl` to sharp (2/3/5/7/10), default (Part 23), round (6/10/14/20/28); `font_ui/display` swap `--font-ui/--font-display` stacks (custom fonts self-hosted from partner attachments, WOFF2 ≤ 300 kB each, Latin + Devanagari subsets required); `secondary_hex` maps to `--secondary-*` ramp; `nav_hex` to `--surface-nav` (must keep text-inverse contrast ≥ 4.5:1).
- **FR-3** Validator (`services/theme_validator.py`, mirrored in `scripts/check-contrast.mjs`): primary vs white ≥ 3:1; text-inverse on primary ≥ 4.5:1; nav text on `nav_hex` ≥ 4.5:1; secondary vs surface ≥ 3:1; `--success/--warning/--error/--info` remain fixed and are checked against `nav_hex` when used on nav badges; failure → 400 `theme_invalid` with per-check details.
- **FR-4** Draft/approve: PA saves as `draft` and previews via `?theme_preview=1` (session-only); SA approves via `PATCH /admin/partners/{id}/theme {status:'approved'}`; only approved themes are served to merchants.
- **FR-5** Tenants may still override `primary_hex` only (WLB-01) unless locked.
- **FR-6** Fonts must include Devanagari coverage or the validator refuses (`font_missing_devanagari`) — checked by parsing the WOFF2 `cmap` for U+0900–U+097F.

#### 5. Non-Functional Requirements
Theme CSS ≤ 4 kB; fonts loaded `font-display: swap`; preview toggle without redeploy; validator runs ≤ 200 ms.

#### 6. User Flow
PA → Partner console → Branding → Theme → choose radius, fonts (upload WOFF2), colours → "Validate" shows checks → Save draft → Preview → request approval → SA approves → live.

#### 7. UI Requirements
`ThemeEditor` (`features/partner-console`): `MLToggleGroup` radius, `MLSelect` fonts + `UbFileUpload`, `ColourField` ×3, `ThemeChecklist` (`MLTable` check/pass/fail with ratios), `ThemePreviewFrame` (renders the internal design-system gallery route in an iframe with the draft tokens), approval status badge.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `theme.title` | Theme | Theme |
| `theme.radius.label` | Corner style | Corner style |
| `theme.font.label` | Font | Font |
| `theme.validate` | Validate | Validate |
| `theme.status.draft` | Draft — not visible to merchants | Draft — not visible to merchants |
| `theme.check.failed` | {check} fails: {ratio}:1 (needs {min}:1) | {check} fails: {ratio}:1 (needs {min}:1) |

#### 9. States
Initial (default theme) · Loading · Empty · Success (approved) · Error (`theme_invalid` checklist) · Disabled (approve button for PA) · Partial (draft) · Processing (font parsing) · Completed · Failed (font rejected).

#### 10. Validation Rules
Hex regex; radius/fonts enums; WOFF2 MIME `font/woff2`, ≤ 300 kB, Devanagari coverage; contrast checks FR-3.

#### 11. Business Rules
- **BR-1** Semantic colours never change.
- **BR-2** Only approved themes render for merchants; drafts only with preview flag for partner admins.
- **BR-3** Tenant `primary_hex` override still validated against the partner theme's nav/surfaces.

#### 12. Permissions
PA `partner_owner` edits drafts; SA approves; tenants none.

#### 13. Edge Cases
- **EC-1** Custom font fails to load at runtime: stack falls back to Inter/Noto — layout unaffected.
- **EC-2** Approved theme later edited: becomes draft again; live keeps last approved snapshot (`branding.theme_live`).
- **EC-3** `nav_hex` light: refused (nav text contrast).

#### 14. API Requirements
`PATCH /partner/profile {branding.theme}` (draft), `PATCH /admin/partners/{id}/theme` (approve), `GET /public/branding?host=` includes `theme_live`; error `theme_invalid` (400). Frontend: `themeEditorSlice.ts`, `utils/theme.ts` extended (`radiusScale`, `fontStacks`), `ThemeProvider` applies extended tokens.

#### 15. Database Impact
`platform_partner.branding` jsonb (`theme`, `theme_live`), `files_attachment` (`kind='font'` — CCR-17 new kind), audit.

#### 16. Audit Requirements
`partner.theme_saved` (before/after), `admin.theme_approved` (actor SA).

#### 17. Notifications
PA: `partner.theme_approved`; SA: `partner.theme_approval_requested`.

#### 18. Analytics / Event Tracking
`ub.whitelabel.theme_validated {passed}`, `ub.whitelabel.theme_approved`.

#### 19. Security
Fonts served from same origin; WOFF2 parsed with a minimal in-house table reader (no new dependency; ADR if a library is needed); no CSS injection (tokens only).

#### 20. Performance
Tokens inline in `<head>`; fonts preloaded for the active partner only.

#### 21. Testing
- **T-WLB-05-1** unit: validator on 10 theme fixtures (pass/fail per check).
- **T-WLB-05-2** unit: WOFF2 cmap Devanagari detection.
- **T-WLB-05-3** API: draft not served publicly; approved served.
- **T-WLB-05-4** E2E: preview flag renders draft for PA only.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given `round` radius and Noto Sans, when approved, then merchants see rounded controls and the font.
- **AC-2 (US-2)** Given a light nav colour, when I validate, then it fails with the ratio shown and cannot be saved as approved.
- **AC-3 (US-3)** Given a draft, when SA previews and approves, then it goes live without deploy.

#### 23. Dependencies
WLB-01/02/04, Part 23 tokens, `scripts/check-contrast.mjs`.

#### 24. Future Enhancements
Dark-theme-specific overrides, per-partner illustration sets, document template themes (SAL-03 P2).

---

### WLB-06 — Partner-branded messaging — Phase 2

#### 1. Business Objective
Send SMS, WhatsApp and email under the partner's identity — DLT sender header, WhatsApp Business number and templates, email domain — so merchants' customers receive messages from the brand they know, and costs/compliance are attributed per partner. Success measures: 100 % of outbound messages carry the partner's registered identity; zero DLT scrubbing drops due to template mismatch; per-partner cost visible.

#### 2. User Personas
PA (configures), SA (approves/monitors), OW and CU (indirect).

#### 3. User Stories
1. **US-WLB-06-1** — As a partner admin, I want our DLT entity, sender header and template IDs used for all merchant SMS.
2. **US-WLB-06-2** — As a partner admin, I want our WhatsApp Business number and approved templates used for reminders.
3. **US-WLB-06-3** — As a partner admin, I want to see message volume and cost per month.
4. **US-WLB-06-4** — As a super admin, I want a partner without configured providers to fall back to the console/skip behaviour, never to Metis's identity.

#### 4. Functional Requirements
- **FR-1** `platform_partner.settings.messaging` = `{sms: {provider: 'msg91'|'kaleyra'|'console'|null, sender_id (6 alpha), dlt_entity_id, credentials_ref}, whatsapp: {provider: 'cloud_api'|'bsp_x'|null, phone_number_id, waba_id, credentials_ref}, email: {provider: 'smtp'|null, from_domain, from_name, credentials_ref}}`; `credentials_ref` points to an environment/secret name, never raw secrets in DB.
- **FR-2** Templates: `notifications_template` rows with `partner_id` set, per `code` (`otp`, `invite`, `party_entry`, `reminder_manual`, `reminder_auto_d1`, `reminder_auto_d0`, `invoice_share`, `statement_share`, `payment_received`, `tenant_deletion_requested`, `support_access_request`), `channel`, `locale`, `body`, `dlt_template_id` / `whatsapp_template_name`, `is_active`; resolution tenant → partner → global (Part 21).
- **FR-3** Adapter selection at send time: `notifications.services.send(tenant, code, to, vars)` resolves the tenant's partner messaging config; missing provider → `MessageLog.status='skipped'`, `error='provider_not_configured'`; `console` → logs; never falls back to another partner's config.
- **FR-4** DLT compliance: the rendered SMS must match the registered template exactly (variables substituted within `{#var#}` limits) — a `template_lint` check compares body to `dlt_template_id` registered text stored in `body`; mismatch → 409 `template_mismatch` at save.
- **FR-5** WhatsApp: templates categorised `utility` (reminders with amount/due date) and `authentication` (OTP); marketing content refused by lint (keyword list) — per research §C.3 opt-in recorded (`parties_party.consent_*`).
- **FR-6** Cost: `notifications_message_log.cost` populated from provider callbacks/rate cards (`partner.settings.messaging.rates {sms_inr, wa_utility_inr, wa_auth_inr}`); `GET /partner/usage` adds `messages {sms, whatsapp, email, cost_inr}` per month.
- **FR-7** Sender identities visible to merchants in Settings → Udhaar & reminders ("Messages are sent by {partner} as {sender_id}").
- **FR-8** Delivery webhooks per provider (`POST /webhooks/messaging/{provider}` CCR-18) update `status` `delivered|failed` idempotently on `provider_message_id`.

#### 5. Non-Functional Requirements
Send path enqueues to `platform_job` (runner) — never inline in a request except console; webhooks respond ≤ 200 ms; configs cached 5 min; credentials only in environment.

#### 6. User Flow
PA → Partner console → Messaging → SMS provider + sender + DLT entity → template table: paste registered text and DLT template ID per code/locale → Lint → Save → test send to own mobile → WhatsApp section similar → merchants' reminders now go out under the partner header; monthly usage visible.

#### 7. UI Requirements
`MessagingConfigForm` (`features/partner-console`): provider `MLSelect`, `MLInput`s, `credentials_ref` hint; `TemplateTable` (`UbDataGrid`: code, channel, locale, DLT id, status Active/Lint failed, edit drawer with body `MLTextarea`, placeholder chips, lint result list); "Send test" `MLButton secondary`; usage tiles `UbStatCard` (messages, cost).

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `messaging.title` | Messaging | Messaging |
| `messaging.sms.sender` | SMS sender ID | SMS sender ID |
| `messaging.template.lintFailed` | Text differs from registered template | Text differs from registered template |
| `messaging.test.send` | Send test to my number | Send test to my number |
| `settings.sms.sentBy` | Messages are sent by {partner} as {sender} | संदेश {partner} द्वारा {sender} नाम से भेजे जाते हैं |

#### 9. States
Initial (no provider: "Console mode — messages are logged only") · Loading · Empty (no templates) · Success · Error (lint) · Disabled (send test until saved) · Partial (some locales missing → badge) · Processing (test sending) · Completed (delivered status) · Failed (provider error shown from log).

#### 10. Validation Rules
`sender_id` `^[A-Z]{6}$`; `dlt_entity_id` `^\d{19}$`; `dlt_template_id` `^\d{19}$`; body ≤ 1 000 chars; placeholders ⊆ template's allowed set; WhatsApp template name `^[a-z0-9_]{1,512}$`; `from_domain` DNS name with verified SPF/DKIM flag (manual at P2).

#### 11. Business Rules
- **BR-1** No cross-partner fallback; missing config → `skipped`.
- **BR-2** Template resolution order tenant → partner → global; tenants may edit only reminder bodies (PLT-06) and only when the partner allows (`settings.messaging.tenant_editable_templates[]`), since DLT text must match.
- **BR-3** Service-implicit SMS only (no promotional).
- **BR-4** Costs attributed to the tenant's partner and tenant (`message_log.tenant_id`).

#### 12. Permissions
PA `partner_owner`; SA all; tenants read the sender identity only.

#### 13. Edge Cases
- **EC-1** Tenant-edited reminder text under a DLT-bound template: tenant edits blocked with explanation when the partner has a registered template.
- **EC-2** Provider outage: jobs retry with backoff (3 attempts), then `failed`; merchant sees "SMS failed" on the reminder.
- **EC-3** Party opted out: `skipped` with `error='opted_out'`.
- **EC-4** Same provider credentials reused by two partners: allowed (ref names differ or same); identity comes from sender/number fields.

#### 14. API Requirements
`GET/PATCH /partner/profile` (messaging), `GET/POST/PATCH /partner/templates` (CCR-18), `POST /partner/templates/{id}/test-send`, `POST /webhooks/messaging/{provider}` (CCR-18), `GET /partner/usage` (messages). Frontend: `messagingConfigSlice.ts`, `templateService.ts`, thunks `fetchTemplates`, `saveTemplate`, `testSend`.

#### 15. Database Impact
`platform_partner.settings.messaging`, `notifications_template` (`partner_id` rows), `notifications_message_log` (`provider`, `cost`, statuses), `platform_job` (send jobs), audit. Index `IX(provider_message_id)` exists.

#### 16. Audit Requirements
`partner.messaging_updated` (before/after minus secrets), `partner.template_saved`, `partner.template_test_sent`, `messaging.webhook_received` (metadata only, sampled).

#### 17. Notifications
PA: `partner.template_lint_failed` when a global template change breaks partner lint; SA: monthly cost summary (P3).

#### 18. Analytics / Event Tracking
`ub.whitelabel.messaging_configured {channel, provider}`, `ub.whitelabel.template_saved {code, channel}`, `ub.notifications.message_sent {channel, partner_code, template_code, status}` (aggregate).

#### 19. Security
Secrets via environment refs; webhook HMAC verification per provider; per-provider IP allowlist (Part 22); templates rendered with strict placeholder substitution (no format-string injection); PII (party mobile) in logs masked except `to_address` column which is access-controlled.

#### 20. Performance
Queue-based sending; config cache; webhook idempotency via unique `provider_message_id`.

#### 21. Testing
- **T-WLB-06-1** unit: template lint against DLT text with variables.
- **T-WLB-06-2** API: send with no provider → `skipped`; with console → logged; never uses another partner's config (fixture two partners).
- **T-WLB-06-3** API: webhook idempotent on duplicate delivery.
- **T-WLB-06-4** API: tenant template edit blocked when DLT-bound.
- **T-WLB-06-5** E2E: PA configures console SMS, sends test, log row shows partner sender.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a configured SMS provider and templates, when a merchant sends a reminder, then the message log shows the partner sender ID and DLT template ID.
- **AC-2 (US-2)** Given a WhatsApp utility template, when an automated reminder fires, then it is sent via the partner's number and the cost is logged.
- **AC-3 (US-3)** Given a month of sends, when I open usage, then counts and cost per channel are shown.
- **AC-4 (US-4)** Given a partner with no provider, when a reminder is due, then the log row is `skipped` and no Metis identity is used.

#### 23. Dependencies
NTF-02 (adapters), NTF-05 (WhatsApp API), NTF-06 (email), LED-07/08/12, WLB-04, jobs runner, ADR for provider SDKs (prefer plain HTTPS via `urllib`/`requests`? `requests` is not on the allowed list — use `urllib.request` or add ADR).

#### 24. Future Enhancements
Per-tenant sender IDs for large merchants (P3), template marketplace/approval sync with Meta (P3), SMS credit wallets billed to tenants (PLT-16).


---

## 17.1c Parties (PTY)

Conventions specific to this section (in addition to the file-level conventions above):

- Frontend feature folder `src/modules/DigiKhaato/features/parties/` with `api/partyService.ts` (Axios calls + snake→camel mapping `mapPartyFromApi` / `mapPartyToApi`), `redux/partyListSlice.ts`, `redux/partyDetailSlice.ts`, `redux/partyTagSlice.ts`, `redux/partyThunk.ts` (all `createAsyncThunk`s of the module: `fetchPartyList`, `fetchPartyDetail`, `fetchPartyTimeline`, `createParty`, `updateParty`, `archiveParty`, `restoreParty`, `fetchPartyTags`, `savePartyTag`, `deletePartyTag`, `mergeParties`, `fetchShareLinks`, `createShareLink`, `revokeShareLink`), `types/party.types.ts`, `constants/party.constants.ts`, `view-model/partyDisplay.ts` (balance label/tone, masked mobile, initials, address one-liner) and `view-model/partyActions.ts` (which quick actions/menu items a role sees). Routes: `app/(app)/parties/page.tsx` → `<PartyListPageContent/>`, `app/(app)/parties/[id]/page.tsx` → `<PartyDetailPageContent/>`; the party form is a drawer, not a route, and is deep-linkable through `?new=1` / `?edit=1` on those pages.
- Yup schemas exported from `src/hooks/useValidationSchemas.ts`: `partyNameValidation()`, `mobileValidation()`, `gstinValidation()`, `openingBalanceValidation()`, `creditLimitValidation()`, `pincodeValidation()`, `emailValidation()`, composed into `partySchema` and `partyQuickSchema` (create-inline from document editors).
- Party labels: the tenant setting `parties.labels` (PLT-06, CCR-6) supplies the two nouns shown for `is_customer` / `is_supplier` ("Customer/Supplier" by default; a wholesaler may choose "Retailer/Company"). All copy below uses `{customerLabel}` / `{supplierLabel}` placeholders where the noun appears.
- Balance vocabulary: `balance > 0` → "You will get" (`--error` tone, party owes the business); `balance < 0` → "You will give" (`--success` tone); `balance = 0` → "Settled" (neutral). `partyDisplay.balanceLabel(balance)` is the single implementation.
- Mobile normalisation before validation (`utils/phone.ts normaliseIndianMobile`): strip spaces, hyphens, brackets and dots; drop a leading `0` (11 digits) or `91` / `+91` (12/13 digits); prefix `+91`; then test `^\+91[6-9]\d{9}$`. The server repeats the same normalisation in `parties.services.normalise_mobile()` so `9876543210`, `+91 98765 43210` and `09876543210` all store as `+919876543210`.
- GSTIN check (`utils/gstin.ts isValidGstin` and `parties.validators.validate_gstin`): (1) uppercase, trim; (2) regex `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`; (3) state prefix ∈ the 36 valid codes (`01`–`38`, `97`); (4) checksum: for positions 1–14 map each char to `v` in `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ` (0–35), multiply by factor 1 for odd positions and 2 for even positions, add `floor(p / 36) + (p mod 36)` to a running sum `s`; expected 15th char = alphabet[`(36 − (s mod 36)) mod 36`]; mismatch → invalid. Characters 3–12 are the PAN and are surfaced to the form as a read-only hint.

---

### PTY-01 — Create/edit party

#### 1. Business Objective
A party is the index card of the paper khata; every ledger entry, bill and payment hangs off it. The feature must let an owner or helper add "Ramesh, 98765 43210" in under ten seconds from a phone while still capturing, when the user wants, the GST and address fields a tax invoice legally needs (research §C.1, Rule 46) and the consent fields DPDP requires before the business messages that person (research §C.6). Success measures: median time from "Add party" to saved ≤ 15 s on mobile; ≥ 95 % of parties created with a mobile that passes validation; 0 duplicate active mobiles per tenant (enforced); GSTIN checksum failures caught client-side before a request is made in ≥ 99 % of cases.

#### 2. User Personas
OW and ST (create and edit daily); AC (read-only, sees the same form disabled); CU indirectly (their data, consent).

#### 3. User Stories
1. **US-PTY-01-1** — As a shopkeeper, I want to add a customer with just a name and mobile so that I can write their first udhaar immediately.
2. **US-PTY-01-2** — As a wholesaler, I want to record a party's GSTIN, billing address and state so that tax invoices to them carry the right details and CGST/SGST vs IGST is decided correctly.
3. **US-PTY-01-3** — As an owner migrating from paper, I want to enter the balance the party already owes as of a date so that the khata starts correct (LED-02).
4. **US-PTY-01-4** — As an owner, I want to mark a party as both my customer and my supplier so that I keep one khata for the person, not two.
5. **US-PTY-01-5** — As an owner, I want to record whether the party agreed to receive SMS updates so that reminders and transaction SMS go only to people who consented.
6. **US-PTY-01-6** — As staff filling an invoice, I want to create a missing party inline without leaving the bill so that the counter queue keeps moving.
7. **US-PTY-01-7** — As an owner, I want to fix a wrong mobile or name later so that reminders reach the right phone.

#### 4. Functional Requirements
- **FR-1** Create: `POST /parties` (Part 22 §22.4) with the body fields below; response 201 party with `summary` (balance) so the client can route to the detail page with data already in `partyDetailSlice`.
- **FR-2** Edit: `PATCH /parties/{id}` with any subset of the same fields except `opening_balance` (opening balances are ledger entries — LED-02 owns adding/correcting them after creation). `PATCH` on an `archived` party is allowed only for `notes` and `tags` (409 `party_archived` otherwise — code registered by 17-02 CCR-2).
- **FR-3** Fields written to `parties_party`: `name`, `display_code`, `mobile`, `alt_phone`, `email`, `is_customer`, `is_supplier`, `gstin`, `gst_registration`, `billing_address` jsonb `{line1, line2, city, state_code, pincode}`, `shipping_address` (same shape, or `{"same_as_billing": true}` stored as an empty object with the flag — the API returns the resolved address), `state_code`, `notes`, `collection_date`, `credit_limit`, `credit_days`, `price_list_id` (P2, INV-13), `sms_opt_in`, `consent_source`, `consent_at`. Never client-writable: `balance`, `receivable_total`, `payable_total`, `last_activity_at`, `status`, `deleted_at`.
- **FR-4** At least one of `is_customer` / `is_supplier` must be true; default `is_customer=true`. The form shows the two nouns from `parties.labels` as a two-option `MLToggleGroup` with a third "Both" option; quick-create from the purchase editor (PUR-01) presets `is_supplier=true, is_customer=false`.
- **FR-5** Mobile is optional (cash-only walk-ins exist, research §A F2) but, when present, normalised (section conventions) and unique among non-deleted parties of the tenant (`U(tenant_id, mobile) WHERE mobile IS NOT NULL AND deleted_at IS NULL`). A duplicate returns 400 `validation_error` with `details.mobile = ["This number belongs to {name}"]` and `details.existing_party_id` so the client can offer **Open {name}** instead. Archived parties with the same mobile count as duplicates (the client offers **Restore {name}**, PTY-04).
- **FR-6** Duplicate pre-check while typing: after a valid 10-digit mobile is entered the form calls `GET /parties?mobile=+91…&status=active,archived&fields=id,name,status` (exact-match `mobile` filter — delta to §22.4 listed under API) and shows an inline `UbInputHint` "Already added as {name}" with a link; the server check in FR-5 remains authoritative.
- **FR-7** GSTIN: optional; validated with regex + checksum (section conventions); stored uppercase. When a valid GSTIN is entered: `gst_registration` defaults to `regular` (user may switch to `composition`), `state_code` defaults to the GSTIN's first two digits, and `billing_address.state_code` follows unless already set. If `state_code` ≠ GSTIN prefix the server saves and returns `meta.warnings[]` `{code: "gstin_state_mismatch"}` which the form shows as a non-blocking `UbStatusBanner`. Without a GSTIN, `gst_registration ∈ {unregistered, overseas}`.
- **FR-8** `state_code` (place-of-supply default) is a `UbCombobox` over the 36 state/UT codes with names in the active locale; required only when the tenant `gst_type ≠ unregistered` **and** a GSTIN is given; otherwise optional and defaulted to the tenant's own state on save when a billing pincode is absent.
- **FR-9** Opening balance section (LED-02 FR-1/FR-2): `opening_balance {amount, direction, as_of}` posts a `ledger_entry(entry_type='opening', source_type='manual', direction, entry_date=as_of, note='Opening balance')` in the same transaction as the party insert and updates `parties_party.balance`, `receivable_total`/`payable_total`, `last_activity_at`. Direction default: `debit` for customers, `credit` for supplier-only parties.
- **FR-10** Consent: `MLSwitch` "Send SMS updates to this {customerLabel}" bound to `sms_opt_in` (default on, per column default). When the switch is turned **on** in the form, a `consent_source` select (`verbal`, `form`, `link`) appears and is required; the server sets `consent_at = now()` whenever `sms_opt_in` transitions false→true or `consent_source` changes, and leaves `consent_at` untouched otherwise. Turning it off keeps `consent_source`/`consent_at` as history but LED-07/08 stop sending. The WhatsApp opt-in switch is added by LED-12 (Phase 2, 17-02 CCR-11).
- **FR-11** Credit fields: `credit_limit` (money, nullable = no limit) and `credit_days` (0–365, nullable = tenant default `sales.default_due_days`) live under an "Credit" disclosure; behaviour in PTY-06.
- **FR-12** Tags: `tags: string[]` of tag **names**; unknown names create `parties_tag` rows (PTY-05) inside the same transaction (`get_or_create` by `(tenant_id, lower(name))`), max 10 tags per party.
- **FR-13** Quick-create mode (`PartyQuickCreateDrawer`, opened from `UbAsyncCombobox` "Create '{query}'" in SAL-01/02, PUR-01, LED-01 party pickers): shows only name (prefilled with the query), mobile, type toggle and, for tax invoices, GSTIN + state; on 201 the combobox selects the new party. Uses `partyQuickSchema`.
- **FR-14** Plan limit: `POST /parties` refused with 403 `plan_limit_reached` (`details.limit_key="max_parties"`) per PLT-15; the form shows the plan copy and the support contact.
- **FR-15** After save: snackbar "Saved {name}" with action **Add entry** (opens LED-01 drawer) for create; the detail page (PTY-03) reflects the change without refetch (`partyDetailSlice` merges the response; `partyListSlice` upserts the row and increments `totals.count` when the current filter matches).
- **FR-16** Audit: `party.created` (after = changed fields incl. hashed mobile? **No** — party mobiles are business data, stored plain in audit `after`; only *user* mobiles are hashed per §21.7 Auth row), `party.updated` (before/after of changed fields only).

#### 5. Non-Functional Requirements
Form usable one-handed: name field autofocused, mobile uses `inputmode="tel"`, save button in the sticky bottom bar of the sheet. Save P95 ≤ 400 ms server time (single transaction, ≤ 6 queries). Works on 360 px width without horizontal scroll. All fields labelled for screen readers; errors announced via `aria-live`. Copy `en`/`hi`. Client-side validation identical to server for mobile and GSTIN so a request is only made when it will succeed except for uniqueness races.

#### 6. User Flow
Primary (mobile): Parties tab → `UbFab` "+" → bottom-sheet `PartyFormDrawer` opens with the name field focused → type name → type mobile (hint appears if duplicate) → optional: expand "GST & address", "Opening balance", "Credit", "Tags", "SMS updates" → Save → 201 → sheet closes → route to `/parties/{id}` with snackbar "Saved Ramesh · Add entry".
Primary (desktop): Parties list → "Add party" in `UbPageHeader` → right `UbDrawer` 520 px → same form in two columns for address → Save → list row inserted at top (ordering by `-last_activity_at`), detail opens in the drawer's place? **No** — desktop stays on the list, row highlighted for 2 s; clicking opens the detail page.
Alternate A (duplicate mobile): server 400 → mobile field error "This number belongs to Ramesh Traders" with **Open** link (or **Restore** if archived).
Alternate B (invalid GSTIN): client blocks with "Check the GSTIN — the last character does not match" before submit.
Alternate C (quick-create from invoice): `UbAsyncCombobox` shows no match → "Create 'Ram Kirana'" → `PartyQuickCreateDrawer` → Save → combobox selects it and the invoice's place-of-supply is set from the new party's `state_code`.
Alternate D (edit): detail page ⋯ → Edit → same drawer prefilled → change mobile → Save → header updates; if the party is archived, only notes/tags are enabled and a banner explains.
Alternate E (plan limit): 403 → dialog with `plan.limit.reached` copy (PLT-15) and "Contact {supportName}".

#### 7. UI Requirements
Components: `PartyFormDrawer` (`UbDrawer` right 520 px desktop / full-height bottom sheet mobile with `max-h-[92vh]`, sticky footer Cancel · Save), `UbForm` + `UbField`s, `MLToggleGroup` type selector, `UbPhoneInput` (mobile, alt phone), `MLInput` (name, display code, email, address lines, city), `UbCombobox` (state), `MLInput` uppercase-transform (GSTIN) with `UbInputHint` showing "PAN: AAPFU0939F" when valid and a `UbStatusBadge` "Valid" / "Invalid", `MLSelect` (`gst_registration`), `MLCheckbox` "Shipping same as billing", `OpeningBalanceSection` (LED-02), `UbMoneyInput` (credit limit), `MLInput type=number` (credit days), `TagInput` (feature component: chips + `UbCombobox` create-inline, PTY-05), `MLSwitch` (SMS opt-in) + `MLSelect` (consent source), `MLTextarea` (notes, 500 chars, counter). Disclosures are `MLCollapsible` groups collapsed by default except when the tenant `gst_type='regular'` (GST group open) or when editing a party that has values in the group.

| Field | Input | Rules / notes |
|---|---|---|
| name | `MLInput` autofocus, `autocapitalize=words` | 2–160 chars, trimmed, collapse inner whitespace |
| type | `MLToggleGroup` {customerLabel} / {supplierLabel} / Both | ≥ 1 flag |
| mobile | `UbPhoneInput` (+91 fixed) | optional; normalise; unique |
| alt_phone | `UbPhoneInput` | optional; same regex; may equal another party's |
| email | `MLInput type=email` | optional; RFC 5322 simple regex; ≤ 254 |
| gstin | `MLInput` monospaced, uppercase | optional; regex + checksum |
| gst_registration | `MLSelect` | `unregistered` (no GSTIN), `regular`/`composition` (GSTIN), `overseas` |
| billing_address.line1/line2/city | `MLInput` | ≤ 120 / 120 / 60 |
| billing_address.state_code | `UbCombobox` | 36 codes |
| billing_address.pincode | `MLInput inputmode=numeric` | `^[1-9][0-9]{5}$` |
| shipping_address | same group or "same as billing" | |
| state_code | `UbCombobox` | see FR-8 |
| display_code | `MLInput` | ≤ 24, optional short code ("R-12") |
| opening_balance | `OpeningBalanceSection` | LED-02 rules |
| credit_limit | `UbMoneyInput` | ≥ 0, ≤ 99,99,99,999.99, 2 dp, nullable |
| credit_days | `MLInput type=number` | 0–365, nullable |
| tags | `TagInput` | ≤ 10, each 1–40 chars |
| sms_opt_in | `MLSwitch` | default on |
| consent_source | `MLSelect` | required when opt-in on |
| notes | `MLTextarea` | ≤ 500 |

Desktop layout: two columns (`grid-cols-2 gap-4`) for address fields only; everything else single column. Mobile: single column, `UbDrawer` full sheet, keyboard-aware (footer sticks above the virtual keyboard via `env(safe-area-inset-bottom)`). Scanner/keyboard: Enter in the name field moves focus to mobile; Enter in mobile submits when the form is otherwise valid (quick-add path); Ctrl/Cmd+S saves.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `parties.form.addTitle` | Add party | पार्टी जोड़ें |
| `parties.form.editTitle` | Edit party | पार्टी संपादित करें |
| `parties.form.name` | Name | नाम |
| `parties.form.mobile` | Mobile number | मोबाइल नंबर |
| `parties.form.mobile.optional` | Optional — needed for SMS and WhatsApp reminders | वैकल्पिक — SMS और WhatsApp रिमाइंडर के लिए ज़रूरी |
| `parties.form.type.both` | Both | दोनों |
| `parties.form.gstin` | GSTIN | GSTIN |
| `parties.form.gstin.valid` | Valid · PAN {pan} | मान्य · PAN {pan} |
| `parties.form.gstin.invalidChecksum` | Check the GSTIN — the last character does not match | GSTIN जाँचें — आख़िरी अक्षर मेल नहीं खाता |
| `parties.form.gstin.stateMismatch` | GSTIN is from {gstinState}; place of supply is {state}. Saved anyway. | GSTIN {gstinState} का है; आपूर्ति स्थान {state} है। फिर भी सहेजा गया। |
| `parties.form.state` | State (place of supply) | राज्य (आपूर्ति स्थान) |
| `parties.form.address.billing` | Billing address | बिलिंग पता |
| `parties.form.address.sameAsBilling` | Shipping same as billing | शिपिंग पता बिलिंग जैसा ही |
| `parties.form.credit.title` | Credit | उधार सीमा |
| `parties.form.creditLimit` | Credit limit | उधार सीमा |
| `parties.form.creditLimit.hint` | Leave empty for no limit | कोई सीमा नहीं के लिए खाली छोड़ें |
| `parties.form.creditDays` | Due days | भुगतान दिन |
| `parties.form.sms.title` | Send SMS updates to this {customerLabel} | इस {customerLabel} को SMS अपडेट भेजें |
| `parties.form.sms.consentSource` | How did they agree? | उन्होंने कैसे सहमति दी? |
| `parties.form.sms.consent.verbal` | Told me in person / on call | आमने-सामने / फ़ोन पर बताया |
| `parties.form.sms.consent.form` | Signed form | फ़ॉर्म पर हस्ताक्षर |
| `parties.form.sms.consent.link` | Agreed on the khata link | खाता लिंक पर सहमति दी |
| `parties.form.notes` | Notes | नोट्स |
| `parties.form.duplicate` | This number belongs to {name} | यह नंबर {name} का है |
| `parties.form.duplicate.open` | Open {name} | {name} खोलें |
| `parties.form.duplicate.restore` | Restore {name} | {name} वापस लाएँ |
| `parties.form.saved` | Saved {name} | {name} सहेजा गया |
| `parties.form.saved.addEntry` | Add entry | एंट्री जोड़ें |
| `parties.form.archivedReadOnly` | This party is archived. Only notes and tags can be changed. | यह पार्टी आर्काइव है। केवल नोट्स और टैग बदल सकते हैं। |

Defaults: type = the tab the user came from (Suppliers tab → supplier); `state_code` = tenant state; SMS opt-in on. No confirmation on save; Cancel with dirty form → `UbConfirmDialog` "Discard changes?". Colour: opening-balance direction hint uses ledger semantics (red "You will get", green "You will give"); nothing else in the form is coloured.

#### 9. States
Initial (empty form, name focused; edit: skeleton fields until `fetchPartyDetail` resolves if not cached) · Loading (Save → `MLSpinner` "Saving…", fields disabled) · Empty (not applicable — form) · Success (drawer closes, snackbar) · Error (field errors under inputs; non-field errors in `UbStatusBanner` at the top of the sheet with `request_id` on tap) · Disabled (accountant: form opens read-only with "View only" badge; archived party: all but notes/tags disabled) · Partial (GSTIN valid but state mismatch warning) · Processing (duplicate pre-check spinner inside the mobile field, 300 ms debounce) · Completed · Failed (network: banner "Couldn't save. Your entries are kept." — the form stays open with values intact; retry).

#### 10. Validation Rules
| Field | Rule | Message (en) | Code |
|---|---|---|---|
| name | required, 2–160 after trim | Enter a name (2–160 characters) | `validation_error` (`details.name`) |
| is_customer/is_supplier | at least one true | Choose {customerLabel}, {supplierLabel} or both | `validation_error` (`details.non_field_errors`) |
| mobile | normalised matches `^\+91[6-9]\d{9}$` | Enter a valid 10-digit mobile | `validation_error` (`details.mobile`) |
| mobile | unique per tenant (non-deleted) | This number belongs to {name} | `validation_error` (`details.mobile`, `details.existing_party_id`) |
| alt_phone | regex | Enter a valid 10-digit mobile | `validation_error` |
| email | format, ≤ 254 | Enter a valid email | `validation_error` |
| gstin | regex + state prefix + checksum | Check the GSTIN — the last character does not match / Enter a 15-character GSTIN | `validation_error` (`details.gstin`) |
| gst_registration | `unregistered|overseas` requires no GSTIN; `regular|composition` requires GSTIN | Add a GSTIN for a registered party | `validation_error` |
| state_code | ∈ 36 codes; required when GSTIN given and tenant GST-registered | Choose the party's state | `validation_error` |
| billing_address.pincode | `^[1-9][0-9]{5}$` | Enter a 6-digit PIN code | `validation_error` |
| opening_balance | LED-02 §10 | | |
| credit_limit | decimal ≥ 0, 2 dp, ≤ 99,99,99,999.99 | Enter an amount | `validation_error` |
| credit_days | integer 0–365 | Enter days between 0 and 365 | `validation_error` |
| tags | ≤ 10, each 1–40 chars | Up to 10 tags | `validation_error` |
| consent_source | required when `sms_opt_in=true` and previously false/null | Choose how they agreed | `validation_error` |
| notes | ≤ 500 | | `validation_error` |
| plan | active parties < `max_parties` | Your plan allows {limit} parties | `plan_limit_reached` (403) |

Yup (`useValidationSchemas`): `partyNameValidation()` = `string().trim().min(2).max(160).required(t('parties.validation.name'))`; `mobileValidation({required:false})` = `string().transform(normaliseIndianMobile).matches(MOBILE_RE).nullable()`; `gstinValidation()` = `string().uppercase().trim().matches(GSTIN_RE).test('checksum', t('parties.form.gstin.invalidChecksum'), isValidGstin).nullable()`; `openingBalanceValidation()` = object per LED-02; `creditLimitValidation()` = `string().test(isMoney).test(max)`; `partySchema = object({ name, isCustomer, isSupplier, mobile, altPhone, email, gstin, gstRegistration, billingAddress, shippingAddress, sameAsBilling, stateCode, openingBalance, creditLimit, creditDays, tags, smsOptIn, consentSource, notes }).test('type', …)`.

#### 11. Business Rules
- **BR-1** Mobile uniqueness is per tenant across `active` and `archived` parties; the same mobile may exist in two different tenants.
- **BR-2** A party may be customer and supplier at once; there is one balance (canon §0.2). Labels in UI derive from the flags and `parties.labels`.
- **BR-3** GSTIN validity is structural (regex + checksum); existence on GSTN is not verified at MVP (research §C.1 — GSP lookup is Phase 3).
- **BR-4** `state_code` on the party is the default place of supply for its documents (SAL-02 FR: party state → tenant state fallback); changing it does not alter issued documents.
- **BR-5** Opening balance is a ledger entry (LED-02 BR-1/BR-2); the party form never edits it after creation.
- **BR-6** Consent timestamps are server-set; clients cannot write `consent_at`.
- **BR-7** `last_activity_at` is set to `now()` on creation only when an opening entry is posted; otherwise NULL until the first entry (so brand-new parties without entries sort after active ones).
- **BR-8** Edits never change `balance`; the service recomputes nothing on PATCH.
- **BR-9** Tag names are case-insensitively unique per tenant (`U(tenant_id, name)` with the service lower-casing for lookup and preserving the first-entered casing for display).
- **BR-10** `display_code` is free text, unique per tenant when given (checked in service — there is no DB constraint; see CCR-19 note).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Create / edit party | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| View form (read-only) | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| Post opening balance with create | `parties.party.write` + `ledger.entry.write` | ✅ | ✅ | ✅ | ❌ |
| Set credit limit / days | `parties.party.write` | ✅ | ✅ | ✅* | ❌ |

*Staff may set credit fields at MVP (no separate codename exists; owners who object use the Phase 3 permission matrix, PLT-12).

#### 13. Edge Cases
- **EC-1** Same mobile, two family members: allowed only as one party or by leaving the mobile blank on the second and using `alt_phone`; the hint explains.
- **EC-2** Name with only digits or emoji: allowed (2–160 chars); search is trigram so it still works.
- **EC-3** Transliteration: user types "ramu" and the party is "रामू" — not matched at MVP (trigram is script-bound); documented, PTY-02 Future.
- **EC-4** GSTIN of a composition dealer: same structure; user picks `composition`; SAL-02 then hides tax on documents *to* them? **No** — composition status of the *buyer* does not change the seller's invoice; the flag is informational and printed as "Composition" in party details only.
- **EC-5** Overseas party (export customer): `gst_registration='overseas'`, no GSTIN, `state_code='96'`? **No** — `96` (Foreign Country) is not among the 36 GSTIN prefixes; `state_code` is left NULL and SAL-02 treats NULL + overseas as export (zero-rated handling is Phase 3). The combobox offers "Outside India" mapping to NULL only when `overseas` is chosen.
- **EC-6** Two staff create the same mobile concurrently: the partial unique index makes the second insert fail; the service maps `IntegrityError` to the same 400 `details.mobile` response.
- **EC-7** Mobile changed to a number that belongs to an archived party: 400 with **Restore** offer; the user may instead merge (PTY-08, P2).
- **EC-8** Opening balance section expanded but left empty: form error "Enter an amount or remove the opening balance" (LED-02).
- **EC-9** Tenant `gst_type='unregistered'`: GST group is still available (a small shop may bill a GST-registered buyer via Bill of Supply and needs their GSTIN on record) but collapsed.
- **EC-10** Pasting "Ramesh 9876543210" into the name field: no parsing; name saved as typed. (Contact picker handles split, PTY-07.)
- **EC-11** Edit of `mobile` while automated SMS reminders are scheduled (LED-07): rows are re-addressed at send time (they read the party at send), nothing to do.
- **EC-12** `sms_opt_in` toggled off then on again in one edit: `consent_source` required again; `consent_at` updated.

#### 14. API Requirements
- `POST /parties` body per Part 22 §22.4 plus `alt_phone`, `email`, `display_code`, `gst_registration`, `shipping_address`|`same_as_billing`, `credit_days`, `consent_source`, `notes` (all columns of §21.3.3 except caches/status). Response 201 `{data: party, meta: {warnings?: [{code: "gstin_state_mismatch", gstin_state, state}]}}`. Errors: 400 `validation_error` (`details.mobile` may include `existing_party_id`, `existing_status`), 403 `permission_denied` / `plan_limit_reached`, 409 `opening_balance_exists` (only via import/replays).
- `PATCH /parties/{id}` — same fields minus `opening_balance`; 409 `party_archived` unless only `notes`/`tags` change; response 200 party + `summary`.
- `GET /parties?mobile=+91…` — **delta to §22.4**: exact-match filter on the normalised mobile, `status` accepts the comma list `active,archived` for this lookup; sparse `fields=` honoured.
- Party JSON (both create/read): `{ id, name, display_code, mobile, alt_phone, email, is_customer, is_supplier, gstin, gst_registration, billing_address, shipping_address, state_code, notes, balance, collection_date, credit_limit, credit_days, price_list_id, sms_opt_in, consent_source, consent_at, tags: [{id, name, color}], status, last_activity_at, created_at, updated_at, version? }` — no `version` field exists on parties (§21.3.3); last-write-wins with audit (EC handled by BR-8: no financial fields on PATCH).
- Frontend: `partyService.createParty(body: PartyWriteDto)`, `updateParty(id, body)`, `lookupByMobile(mobile)`; thunks `createParty`, `updateParty` (fulfilled → `partyDetailSlice.actions.partyUpserted`, `partyListSlice.actions.rowUpserted`, `snackbarSlice.actions.show`); `partyDisplay.gstinPan(gstin)`, `partyDisplay.addressOneLine(addr)`.

#### 15. Database Impact
Insert/update `parties_party` (all user columns), `parties_tag` (`get_or_create`), `parties_party_tag` (replace set on edit), `ledger_entry` (opening, create only), `platform_audit_log`. Reads: `parties_party` by `U(tenant_id, mobile)` partial index; `platform_tenant_setting` (`parties.labels`, `sales.default_due_days`); plan counters (PLT-15). No new indexes; `display_code` uniqueness is service-checked (a partial unique index is proposed in CCR-19).

#### 16. Audit Requirements
`party.created` (`entity_type='party'`, `after` = submitted fields incl. mobile, `metadata.via ∈ {form, quick_create, import, contacts}`), `party.updated` (`before`/`after` of changed fields only; `consent_*` changes always included), and LED-02's `ledger.entry.created` for the opening row with `metadata.via='party_create'`.

#### 17. Notifications
None on create/edit. The first SMS to the party (LED-08 FR-7) carries the DPDP notice; this feature only records consent. No SMS is sent for opening balances (LED-02 §17).

#### 18. Analytics / Event Tracking
`ub.parties.created {via: form|quick_create, is_customer, is_supplier, has_mobile, has_gstin, has_opening: bool, opening_direction?, has_credit_limit, tag_count, sms_opt_in, duration_ms_from_open}`, `ub.parties.create_failed {error_code, field?}`, `ub.parties.duplicate_hint_shown {existing_status}`, `ub.parties.updated {changed_fields[]}`, `ub.parties.gstin_checksum_failed {}` (client-side, once per form session).

#### 19. Security
Tenant scoping via manager; cross-tenant `existing_party_id` never leaks (lookup is within `tid`). Mobile/GSTIN/PAN are personal data: transported over TLS, logged only hashed in application logs (`mobile_hash`), plain in the audit table (business record, access-controlled by `platform.audit.read`). Input hardening: names/notes stripped of control characters; jsonb addresses validated against a fixed key set (unknown keys rejected). Rate limit: 120 party writes/min/user. Duplicate lookup is rate-limited with the general 600 req/min bucket and requires `parties.party.read`.

#### 20. Performance
Create = 1 transaction: `SELECT … FOR UPDATE` on tenant plan counter (index-only count), insert party, upsert tags, insert opening entry, update caches, audit — ≤ 8 statements. Duplicate pre-check hits the partial unique index. Form bundle lazy-loaded (`next/dynamic`) since it is not needed on first paint of the list.

#### 21. Testing
- **T-PTY-01-1** unit: `normaliseIndianMobile` for the 6 input shapes → `+919876543210`; rejects `+915…`, 9 digits, landlines.
- **T-PTY-01-2** unit: `isValidGstin` accepts `27AAPFU0939F1ZV`, rejects a transposed character and a wrong check digit; state prefix `00`/`99` rejected; PAN extraction.
- **T-PTY-01-3** unit (Python): `validate_gstin` mirrors T-2 vectors exactly (shared fixture file `tests/fixtures/gstin_vectors.json` used by both Jest and pytest).
- **T-PTY-01-4** API: create minimal party (name only) → 201, `is_customer=true`, `balance="0.00"`, `last_activity_at=null`.
- **T-PTY-01-5** API: duplicate mobile active → 400 `details.mobile` + `existing_party_id`; archived duplicate → same with `existing_status='archived'`; other tenant same mobile → 201.
- **T-PTY-01-6** API: GSTIN prefix `27` with `state_code='29'` → 201 + `meta.warnings[0].code='gstin_state_mismatch'`.
- **T-PTY-01-7** API: opening balance → one `ledger_entry(entry_type='opening')`, party `balance` equals signed amount, audit rows for both.
- **T-PTY-01-8** API: `sms_opt_in` false→true sets `consent_at`; PATCH without consent fields leaves it unchanged; `consent_at` in body ignored.
- **T-PTY-01-9** API: PATCH archived party `name` → 409 `party_archived`; `notes` only → 200.
- **T-PTY-01-10** permission: accountant POST → 403; staff → 201.
- **T-PTY-01-11** API: at `max_parties` → 403 `plan_limit_reached` with `details.limit_key`.
- **T-PTY-01-12** component: `PartyFormDrawer` shows GSTIN badge/PAN hint; consent select appears only when switch turned on; type toggle enforces ≥ 1.
- **T-PTY-01-13** component: quick-create from `UbAsyncCombobox` selects the created party and calls `onCreated(party)`.
- **T-PTY-01-14** E2E (mobile viewport): add "Ramesh" with mobile and opening ₹2,300 in ≤ 6 interactions; detail shows balance and "Opening balance" row.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given I am on the Parties tab, when I tap +, type "Ramesh", 9876543210 and Save, then the party exists with `mobile=+919876543210`, `balance=0`, and I land on its khata page with "Add entry" offered.
- **AC-2 (US-2)** Given I enter GSTIN `27AAPFU0939F1ZV`, when I leave the field, then it shows "Valid · PAN AAPFU0939F", `state_code` becomes 27 and `gst_registration` becomes regular; when I change the last character, then Save is blocked with the checksum message.
- **AC-3 (US-3)** Given opening ₹2,300 "They owe me" as of 01/04/2026, when saved, then the khata shows "You will get ₹2,300" and one "Opening balance" row dated 01/04/2026.
- **AC-4 (US-4)** Given I choose "Both", when saved, then the party appears under both the Customers and Suppliers tabs with one balance.
- **AC-5 (US-5)** Given SMS updates on with "Told me in person", when saved, then `sms_opt_in=true`, `consent_source='verbal'`, `consent_at` set; when I turn it off later, then LED-07/08 skip the party and `consent_at` is unchanged.
- **AC-6 (US-6)** Given an invoice editor with no matching party, when I choose "Create 'Ram Kirana'", fill mobile and Save, then the invoice's party field shows Ram Kirana and its place of supply is prefilled.
- **AC-7 (US-7)** Given an existing party, when I change its mobile to one already used by an active party, then I see "This number belongs to {name}" with an Open link and nothing is saved.

#### 23. Dependencies
LED-02 (opening balance service `post_opening_balance()`), PTY-05 (tags), PTY-06 (credit fields), LED-07/08/12 (consent consumers), PLT-06 (`parties.labels`, `sales.default_due_days`), PLT-15 (`max_parties`), PLT-03/07 (tenant `gst_type`, state), SAL-02/PUR-01/LED-01 (quick-create hosts), `UbDrawer`, `UbPhoneInput`, `UbMoneyInput`, `UbCombobox`, `UbForm`, `useValidationSchemas`.

#### 24. Future Enhancements
PTY-07 add from contacts (P2), PTY-08 merge (P2), GSTIN existence lookup via GSP with auto-fill of legal name/address (P3), transliterated search (P3), WhatsApp opt-in (LED-12), per-party default price list (INV-13, P2), custom fields per tenant (Future), per-party language for messages (P2 with LED-12).

---

### PTY-02 — Party list with totals

#### 1. Business Objective
The party list is the home screen of the product: the digital replacement for flipping through a khata register looking for who still owes money. It must answer three questions in one glance — *how much will I get in total*, *how much will I give*, and *who do I chase today* — and it must do so in under a second on a ₹8,000 Android phone on a 3G connection with 2,000 parties in the tenant. Every other module is entered through this list (tap a party → khata page → entry/bill), so its search, filter and sort behaviour sets the product's perceived speed. Success measures: P75 time-to-first-row ≤ 1.2 s on a 3G Fast profile with a cold cache; ≥ 60 % of daily sessions start on this screen; median taps from app open to "You gave" entry ≤ 3; search returns the intended party in the first three rows for ≥ 90 % of queries (measured by `ub.parties.list_searched` → `ub.parties.opened` position).

#### 2. User Personas
OW (primary — opens the list several times a day to see receivables and pick the next party to chase), ST (search-and-open only; the totals header is shown but the `reports.financial.read`-free staff role still sees receivable/payable because they are party balances, not financial reports — see §12), AC (read-only with export).

#### 3. User Stories
1. **US-PTY-02-1** — As a shopkeeper, I want to see the total I will get and the total I will give at the top of my party list so that I know my udhaar position without opening a report.
2. **US-PTY-02-2** — As a shopkeeper, I want to type three letters of a name or the last four digits of a mobile and find the party so that I do not scroll through hundreds of rows.
3. **US-PTY-02-3** — As an owner, I want to filter to only the parties who owe me so that I can work through a collection list.
4. **US-PTY-02-4** — As a wholesaler, I want to see only my suppliers so that I can settle purchases separately from sales.
5. **US-PTY-02-5** — As an owner running a delivery route, I want to filter by a tag like "Camp Area" so that I take one area at a time.
6. **US-PTY-02-6** — As an owner, I want to sort by highest outstanding so that I chase the biggest risk first.
7. **US-PTY-02-7** — As an owner, I want the totals in the header to reflect whatever filter I applied so that a filtered list tells me the truth about that subset.
8. **US-PTY-02-8** — As an owner, I want to find parties I archived so that I can restore or view them.
9. **US-PTY-02-9** — As an accountant, I want to export the filtered party list with balances so that I can reconcile it against my books.

#### 4. Functional Requirements
- **FR-1** Source: `GET /parties` (Part 22 §22.4) with `q`, `type`, `balance`, `status`, `tag`, `collection`, `ordering`, `page`, `page_size`. The frontend thunk is `fetchPartyList({ params, mode: 'replace'|'append' })` writing `partyListSlice.rows`, `.meta`, `.totals`, `.status`.
- **FR-2** Row shape rendered: avatar (initials from `partyDisplay.initials(name)`), name, secondary line (`partyDisplay.secondaryLine`: masked mobile `98765 4••••` when `parties.mask_mobile` is on, else full; plus `display_code` and the first tag chip), right block = `UbAmount` balance with its label ("You will get" / "You will give" / "Settled") and, when `collection_date` is set, a due chip.
- **FR-3** Header totals: `meta.totals: { receivable, payable, count }` computed **server-side over the filtered set, not the page**. Rendered as two `UbStatCard`s — "You will get" (`tone="danger"`, value `meta.totals.receivable`) and "You will give" (`tone="success"`, value `meta.totals.payable`) — plus a caption "{count} parties". Both are tappable: tapping "You will get" applies `balance=owes_me`, tapping "You will give" applies `balance=i_owe`; tapping an already-applied tile clears it.
- **FR-4** Totals formulas (server, `parties.selectors.list_totals(queryset)`), computed on the filtered queryset **before** pagination, in one aggregate query:
  `receivable = Σ balance WHERE balance > 0`; `payable = Σ (−balance) WHERE balance < 0`; `count = COUNT(*)`. Both are non-negative `numeric(14,2)`; no rounding is applied because `parties_party.balance` is already 2 dp. Net position is never shown as a single number (research §C.4: merchants read two buckets, not a net).
- **FR-5** Search `q`: server matches (a) `name ILIKE %q%` using the `pg_trgm` GIN index, (b) `display_code ILIKE q%`, (c) `mobile LIKE %digits` when `q` normalises to ≥ 4 digits (suffix match on the stored E.164 — supports "5432" for `+919876543210`), (d) `gstin = upper(q)` on an exact 15-character query. Results are ordered by a relevance rank when `q` is present: exact `display_code` or `gstin` match first, then `name ILIKE q%` (prefix), then trigram `similarity(name, q) DESC`, then the requested `ordering` as a tiebreak. Debounce 300 ms (`UbSearchInput`), minimum 1 character, `q` is trimmed and collapsed.
- **FR-6** Filters, all combinable (AND across groups, OR inside a group):
  | Control | Param | Values |
  |---|---|---|
  | Status tabs (`UbTabs`) | `status` | `active` (default), `archived` |
  | Balance chips | `balance` | `owes_me` (`balance > 0`), `i_owe` (`balance < 0`), `settled` (`balance = 0`) |
  | Type chips | `type` | `customer` (`is_customer=true`), `supplier` (`is_supplier=true`) |
  | Tag picker (`UbCombobox` multi) | `tag` | comma list of tag names; OR within the list |
  | Collection chips | `collection` | `today` (`collection_date = today`), `overdue` (`collection_date < today AND balance > 0`), `upcoming` (`collection_date BETWEEN today+1 AND today+7`) |
  Applied filters appear as removable `UbFilterTag` chips above the list with a "Clear all" action.
- **FR-7** Sorting (`ordering`, whitelist): `-last_activity_at` (default, "Recent"), `-balance` ("Highest you will get"), `balance` ("Highest you will give"), `name`, `-name`, `collection_date`. Exposed as an `MLDropdownMenu` labelled "Sort: Recent". Ties in `-last_activity_at` break on `name ASC`, and NULL `last_activity_at` sorts last (`NULLS LAST`) so never-transacted parties do not occupy the top.
- **FR-8** Pagination: desktop uses page pagination inside `UbDataGrid` (`page_size` 25/50/100, persisted in `localStorage` key `ub.parties.pageSize`); mobile uses infinite scroll appending pages of 25 via an `IntersectionObserver` sentinel, with a "Load more" button fallback when the observer is unavailable. `meta.total_pages` drives both. Page resets to 1 on any filter, search or sort change (shared UX rule).
- **FR-9** URL state: only `tab` (i.e. `status`) is written to the URL as `?tab=archived` (shared UX rule "only `tab` and date range in URL"). Search text, chips and sort live in `partyListSlice` and survive in-session navigation to a detail page and back (the slice is not reset by `PartyDetailPageContent`); they are dropped on a full reload by design, so a reloaded list is always the default view.
- **FR-10** Row actions: tapping the row opens `/parties/{id}` (PTY-03). A trailing `MLDropdownMenu` (⋯, desktop hover / mobile always) offers **You gave** (LED-01 debit drawer), **You got** (LED-01 credit drawer), **Remind** (LED-06 composer), **Edit** (PTY-01 drawer), **Archive**/**Restore** (PTY-04), **Add tag** (PTY-05). Items are filtered by `partyActions.rowMenu(party, permissions)`.
- **FR-11** Bulk selection (desktop `UbDataGrid` only, ≥ 1024 px): checkbox column enables **Add tag** (PTY-05 FR-8), **Send reminders** (LED-06 bulk, `POST /reminders/bulk`) and **Export selected** (FR-12). Selection is capped at 200 rows with the hint "Select up to 200 parties at a time"; "Select all" selects the current page only, with a link "Select all {total} matching" that switches to a filter-based (rather than id-based) bulk request carrying the current query params.
- **FR-12** Export: **Export CSV** in the page header calls `GET /parties?...&format=csv` (delta to §22.4, see §14) with the *current* filters, streaming columns `name, display_code, mobile, alt_phone, email, type, gstin, state_code, billing_address, tags, balance, balance_label, collection_date, credit_limit, credit_days, status, last_activity_at, created_at`. Requires `parties.party.export`. > 5,000 rows → 202 with an export job (Part 22 §22.11) and an in-app notification when ready.
- **FR-13** Empty states (three variants of `UbEmptyState`): **first-use** (no parties at all) — illustration, "Add your first party", primary CTA opening PTY-01, secondary "Import from CSV" (PTY-10) and "Add from contacts" (PTY-07, Phase 2, hidden when unsupported); **filtered-empty** — "No parties match these filters" + "Clear filters"; **error** — "Couldn't load parties" + Retry + `request_id`.
- **FR-14** Live updates without refetch: `partyListSlice` exposes `rowUpserted` (used by PTY-01 create/edit, LED-01 entries, PTY-04 archive/restore, PAY-01 payments) and `totalsAdjusted({ deltaReceivable, deltaPayable })` so that posting an entry from the list updates both the row and the header optimistically; a `fetchPartyList` with `mode:'refresh'` is scheduled 2 s later (debounced) to reconcile with the server.
- **FR-15** Offline / stale cache: the last successful page-1 response per filter signature is kept in `partyListSlice.cache` (max 5 signatures) and rendered immediately on re-entry while a background refresh runs, with a thin `MLProgress` bar at the top of the list. When the request fails and a cache exists, the cached rows stay with a "Showing saved list · Retry" banner instead of the error state.
- **FR-16** Density and columns (desktop): `UbDataGrid` column visibility (Name, Mobile, Type, Tags, Balance, Collection date, Last activity, Credit limit) persisted per user in `localStorage` key `ub.parties.columns`; Name and Balance cannot be hidden.

#### 5. Non-Functional Requirements
First contentful row ≤ 1.2 s P75 on 3G Fast with 2,000 parties; server P95 ≤ 250 ms for page 1 with totals at 10,000 parties. Skeleton rows (`UbSkeleton` list preset, 8 rows) while loading; never a full-page spinner. Virtualisation is **not** used at MVP (page size ≤ 100 keeps the DOM under ~1,200 nodes); if a tenant sets 100 and scrolls 10 pages on mobile, the appended list is capped at 500 rows after which "Load more" is replaced by "Refine your search" (the infinite list is not a browsing tool). Accessibility: the list is a `role="list"` on mobile and a real `<table>` on desktop; each row has an accessible name "{name}, you will get ₹2,300"; filter chips are toggle buttons with `aria-pressed`; totals are in an `aria-live="polite"` region so a filter change is announced. Localisation `en`/`hi`; amounts via `Intl.NumberFormat('en-IN')`; dates dd/mm/yyyy. Works at 320 px width.

#### 6. User Flow
Primary (mobile): app opens on Parties → totals header + search + chips row + list sorted by Recent → user types "ram" → 300 ms later the list narrows → taps the row → khata page (PTY-03).
Alternate A (collection run): tap "You will get" tile → `balance=owes_me` applied → change sort to "Highest you will get" → work down the list, using the row ⋯ → Remind.
Alternate B (route day): open the tag picker → choose "Camp Area" → chip appears → totals now show only that area's receivable → export CSV for the delivery boy.
Alternate C (supplier settlement): tap "Suppliers" type chip → `balance=i_owe` → sort "Highest you will give" → open party → You gave (payment out).
Alternate D (archived): Archived tab → list shows archived parties greyed with an "Archived" badge; row ⋯ offers Restore only.
Alternate E (no results): search "xyz" → filtered-empty state with "Clear filters" and "Add party 'xyz'" which opens PTY-01 with the name prefilled.
Alternate F (error): request fails → cached rows with the retry banner, or the error empty state when no cache.

#### 7. UI Requirements
Screens: `app/(app)/parties/page.tsx` → `<PartyListPageContent/>` composed of `UbPageShell` + `UbPageHeader` (title "Parties", actions **Import** (PTY-10, owner), **Export CSV**, **Add party**), `PartyTotalsHeader` (two `UbStatCard`s + count caption), `PartyListToolbar` (`UbSearchInput`, filter chips, tag `UbCombobox`, sort `MLDropdownMenu`, applied `UbFilterTag`s), and the list body.

Mobile (< 640 px): totals as two half-width `UbStatCard`s in a `grid-cols-2 gap-3`; toolbar collapses to a search field plus a **Filters** button opening a bottom `UbDrawer` with all groups and a sticky "Show {n} parties" footer; the list is `MLItem`-based cards, 64 px tall, left avatar, two text lines, right amount stack; `UbFab` "+" bottom-right above `UbBottomNav`; row ⋯ opens an `MLDropdownMenu` anchored to the row.

Desktop (≥ 1024 px): `UbDataGrid` with columns Name (sticky), Mobile, Type (`UbStatusBadge`s), Tags (chips, +n overflow), Balance (right-aligned `ds-num`, coloured), Collection date, Last activity ("2 days ago", `MLTooltip` with the exact timestamp), Actions. Toolbar above the grid on one line; totals to the right of the page title as two compact `UbStatCard`s at `size="sm"`. Row hover raises one plane and shows the ⋯ button; row click opens the detail route; ⌘/Ctrl+click opens in a new tab.

Keyboard: `/` focuses search from anywhere on the page; `↑/↓` moves the focused row; `Enter` opens it; `e` edits; `g` then `e` opens "You gave" for the focused row (documented in `UbHelpHint`). A barcode/scanner pasting digits into the search field behaves as a mobile-suffix search (FR-5c).

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `parties.list.title` | Parties | पार्टियाँ |
| `parties.list.totals.receivable` | You will get | आपको मिलेंगे |
| `parties.list.totals.payable` | You will give | आपको देने हैं |
| `parties.list.totals.count` | {count, plural, one {# party} other {# parties}} | {count, plural, one {# पार्टी} other {# पार्टियाँ}} |
| `parties.list.search.placeholder` | Search name, number or code | नाम, नंबर या कोड खोजें |
| `parties.list.filter.owesMe` | Owes me | मुझे देना है |
| `parties.list.filter.iOwe` | I owe | मुझे देने हैं |
| `parties.list.filter.settled` | Settled | हिसाब बराबर |
| `parties.list.filter.customers` | {customerLabel}s | {customerLabel} |
| `parties.list.filter.suppliers` | {supplierLabel}s | {supplierLabel} |
| `parties.list.filter.tag` | Tag | टैग |
| `parties.list.filter.dueToday` | Due today | आज देना है |
| `parties.list.filter.overdue` | Overdue | समय बीत गया |
| `parties.list.tab.active` | Active | चालू |
| `parties.list.tab.archived` | Archived | आर्काइव |
| `parties.list.sort.recent` | Recent | हाल का |
| `parties.list.sort.balanceDesc` | Highest you will get | सबसे ज़्यादा मिलने हैं |
| `parties.list.sort.balanceAsc` | Highest you will give | सबसे ज़्यादा देने हैं |
| `parties.list.sort.name` | Name (A–Z) | नाम (अ–ज्ञ) |
| `parties.list.empty.firstUse.title` | No parties yet | अभी कोई पार्टी नहीं |
| `parties.list.empty.firstUse.body` | Add the people you buy from and sell to. Their khata starts here. | जिनसे आप ख़रीदते-बेचते हैं उन्हें जोड़ें। उनका खाता यहीं से शुरू होता है। |
| `parties.list.empty.filtered.title` | No parties match these filters | इन फ़िल्टर से कोई पार्टी नहीं मिली |
| `parties.list.empty.filtered.action` | Clear filters | फ़िल्टर हटाएँ |
| `parties.list.empty.search.addNamed` | Add party "{q}" | "{q}" नाम से पार्टी जोड़ें |
| `parties.list.error.title` | Couldn't load parties | पार्टियाँ लोड नहीं हो सकीं |
| `parties.list.stale` | Showing saved list | सहेजी गई सूची दिख रही है |
| `parties.list.settled` | Settled | हिसाब बराबर |
| `parties.list.selected` | {n} selected | {n} चुनी गईं |
| `parties.list.selectAllMatching` | Select all {total} matching | सभी {total} चुनें |
| `parties.list.export.started` | Preparing your file. We'll notify you. | आपकी फ़ाइल बन रही है। हम सूचित करेंगे। |

Copy rules: never say "debit"/"credit" in this screen; "You will get" is always red-toned with the label, "You will give" always green-toned with the label, "Settled" neutral grey with no amount emphasis (amount rendered as "₹0"). A zero-balance party is not hidden by default (it may still need a bill). No confirmation dialogs on this screen except bulk actions. Undo: none needed (no destructive action happens here except Archive, which owns its own confirm in PTY-04).

#### 9. States
**Initial** — totals skeleton (two shimmering cards) + 8 skeleton rows; toolbar interactive immediately. **Loading** — subsequent loads keep the previous rows at 60 % opacity with a top `MLProgress`; page changes replace rows with skeletons. **Empty** — the three `UbEmptyState` variants of FR-13. **Success** — rows + totals; a freshly upserted row flashes `--accent-quiet` for 2 s. **Error** — error empty state with Retry and a copyable `request_id`; or the stale-cache banner variant. **Disabled** — accountant sees all rows, the ⋯ menu contains only **View** and **Export**, the "Add party" button is hidden (not disabled). **Partial** — infinite scroll appended pages: a footer spinner row; when the 500-row cap is hit, "Refine your search" replaces it. **Processing** — bulk action in flight: the selection bar shows `MLSpinner` + "Adding tag to 40 parties…", rows are not blocked. **Completed** — bulk action finished: snackbar "Tag added to 40 parties" with **Undo** (PTY-05 FR-9, 10 s). **Failed** — bulk partially failed: snackbar "Added to 37 of 40. 3 failed." with a **See details** action opening an `UbDialog` listing failures.

#### 10. Validation Rules
| Input | Rule | Message (en) | Code |
|---|---|---|---|
| `q` | ≤ 80 chars, trimmed; control chars stripped | — (silently truncated) | — |
| `status` | ∈ `active`, `archived` | Unknown status filter | `validation_error` (`details.status`) |
| `balance` | ∈ `owes_me`, `i_owe`, `settled` | Unknown balance filter | `validation_error` (`details.balance`) |
| `type` | ∈ `customer`, `supplier` | Unknown type filter | `validation_error` (`details.type`) |
| `collection` | ∈ `today`, `overdue`, `upcoming` | Unknown collection filter | `validation_error` (`details.collection`) |
| `tag` | ≤ 10 names, each ≤ 40 chars; unknown names are ignored, not an error | — | — |
| `ordering` | ∈ whitelist (FR-7) | Cannot sort by that field | `validation_error` (`details.ordering`) |
| `page_size` | 1–100 integer | Page size must be between 1 and 100 | `validation_error` (`details.page_size`) |
| `page` | ≥ 1; beyond `total_pages` returns an empty `data` with correct `meta` (not 404) | — | — |
| `format` | ∈ `json`, `csv` | Unsupported format | `validation_error` (`details.format`) |

Client-side there is no form here; params are built by `partyListSlice.selectors.selectQueryParams` and are typed, so invalid values cannot be produced by the UI — the server rules exist for hand-built requests.

#### 11. Business Rules
- **BR-1** Totals are computed over the filtered set, never the page, and never across tenants. A filtered total is always ≤ the unfiltered total of the same sign.
- **BR-2** `receivable` and `payable` are both reported as positive magnitudes; the sign lives in the label. `payable = Σ|balance|` over negative balances, rounded to 2 dp (no rounding actually occurs since inputs are 2 dp).
- **BR-3** `balance=settled` means exactly `balance = 0.00`; there is no tolerance band. A balance of ₹0.01 is "You will get ₹0.01".
- **BR-4** Archived parties are excluded from every count and total unless `status=archived` is explicitly selected; the two statuses are never mixed in one response (the `active,archived` comma list is accepted only on the `mobile=` duplicate lookup of PTY-01 FR-6).
- **BR-5** `type=customer` matches `is_customer=true` regardless of `is_supplier`; a "Both" party appears under both type filters and is counted once in each filtered total.
- **BR-6** Default ordering is `-last_activity_at NULLS LAST, name ASC`. `last_activity_at` is maintained by the ledger service on every posted entry (PTY-01 BR-7), not by party edits — editing a name does not move a party to the top.
- **BR-7** The `collection=overdue` filter requires `balance > 0`: a party with a past collection date but a settled balance is not overdue.
- **BR-8** Search never matches on `notes` (privacy: notes may contain remarks the user would not expect to surface) and never matches archived parties unless the Archived tab is active.
- **BR-9** Export reflects the exact filter, search and sort of the screen at the moment the button was pressed; a later filter change does not affect an in-flight export job.
- **BR-10** The list is a cache view: `parties_party.balance` is authoritative for display, and `manage.py recalc_balances` reconciles it from `ledger_entry` (Part 21 §21.1.3). A discrepancy is a bug, not a display option; the list never sums ledger rows itself.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View list, totals, search, filters | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| Open the Add party action | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Row ⋯ You gave / You got | `ledger.entry.write` | ✅ | ✅ | ✅ | ❌ |
| Row ⋯ Remind | `ledger.reminder.write` | ✅ | ✅ | ✅ | ❌ |
| Row ⋯ Archive / Restore | `parties.party.delete` | ✅ | ✅ | ❌ | ❌ |
| Bulk add tag | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Export CSV | `parties.party.export` | ✅ | ✅ | ❌ | ✅ |
| Import | `parties.party.write` (+ PTY-10) | ✅ | ✅ | ❌ | ❌ |

The totals header is gated on `parties.party.read` only — it is a party-balance summary, not a financial report, so `reports.financial.read` is **not** required (a staff member who can open every khata can already add these numbers up). Tenants who object use per-member `permissions_override` to deny `parties.party.read` for specific staff, which hides the whole module.

#### 13. Edge Cases
- **EC-1** 0 parties, first login: first-use empty state; the totals header is hidden entirely (not "₹0 / ₹0") so the screen is not two meaningless zeroes.
- **EC-2** 50,000 parties: page 1 + totals stay ≤ 250 ms P95 because totals use the `(tenant_id, balance)` index with a partial-sum aggregate; infinite scroll caps at 500 rows (FR-8) with "Refine your search".
- **EC-3** Search "98765": normalises to digits, ≥ 4, so the suffix match runs; a name containing "98765" also matches via trigram and both are merged (DISTINCT on id).
- **EC-4** Search "+91 98765 43210" with spaces: `normaliseIndianMobile` is attempted first; on success an exact `mobile` equality match is used and returns at most one row.
- **EC-5** A party named with Devanagari while the user types Latin ("ramu" vs "रामू"): no match at MVP (trigram is script-bound, PTY-01 EC-3). The filtered-empty state offers "Add party 'ramu'", which risks a duplicate — mitigated by PTY-01 FR-6 duplicate mobile pre-check and PTY-08 merge.
- **EC-6** Tag deleted while selected in the filter: the server ignores unknown tag names (FR-6 validation), the chip is dropped on the next response and a snackbar says "Tag removed".
- **EC-7** Two devices of the same user: no realtime sync at MVP; the stale cache shows old balances for up to one refresh cycle. Pull-to-refresh on mobile and the ⟳ button on desktop force `fetchPartyList({mode:'refresh'})`.
- **EC-8** Balance changes between the totals aggregate and the page query (concurrent entry posted): the totals may be off by that entry for one render. Both queries run in the same request but not in one snapshot transaction — acceptable; `REPEATABLE READ` is not used for a read-only list. A refresh reconciles.
- **EC-9** `page=7` requested after filters narrowed the set to 2 pages: 200 with empty `data`, `meta.page=7`, `meta.total_pages=2`; the client detects `data.length === 0 && page > total_pages` and resets to page 1.
- **EC-10** Export requested while a previous export of the same report is still running: allowed; each is a separate `reports_export` row. The 10 exports/hour rate limit (Part 22 §22.1) applies.
- **EC-11** Module `parties` disabled for the tenant (impossible at MVP — `parties` is core) : 403 `module_disabled` handled by the shell, which renders the module-off page.
- **EC-12** Very long party name (160 chars): truncated to one line with `text-ellipsis` and the full name in an `MLTooltip`; the accessible name carries the full string.
- **EC-13** All parties settled: totals show "You will get ₹0" and "You will give ₹0" with a caption "Everything is settled" — the tiles are kept (unlike EC-1) because zero is now information.

#### 14. API Requirements
- `GET /parties` per §22.4 with these **deltas** recorded for Part 22: (a) `collection=today|overdue|upcoming` documented as filtering on `collection_date` with the `balance > 0` condition for `overdue`; (b) `tag=` accepts a comma list (OR); (c) `format=csv` streams a CSV of the filtered set (or 202 + `export_id` above 5,000 rows); (d) `ordering` whitelist extended with `collection_date`; (e) `meta.totals` documented as filtered-set aggregates; (f) sparse `fields=` supported. These deltas are raised as **CCR-20** (parties list filters and CSV format).
- Response: `{ "data": [ { "id", "name", "display_code", "mobile", "is_customer", "is_supplier", "balance": "2300.00", "collection_date": "2026-09-25", "tags": [{"id","name","color"}], "last_activity_at", "credit_limit", "status" } ], "meta": { "page": 1, "page_size": 25, "total": 412, "total_pages": 17, "totals": { "receivable": "184300.00", "payable": "22150.00", "count": 412 } } }`.
- Errors: 400 `validation_error` for bad enum/ordering/page_size; 403 `permission_denied` (missing `parties.party.read`) and on `format=csv` without `parties.party.export`; 429 with `X-RateLimit-*` headers.
- Frontend: `partyService.listParties(params): Promise<PartyListResponse>` (maps snake→camel and keeps money as strings; `UbAmount` parses with `decimal.js-light`), `partyService.exportParties(params)`. Thunks `fetchPartyList`, `exportPartyList`. Selectors `selectPartyRows`, `selectPartyTotals`, `selectQueryParams`, `selectActiveFilterCount`.

#### 15. Database Impact
Reads only. `parties_party` filtered by `tenant_id, status` with: `IX(tenant_id, status, last_activity_at DESC)` for the default sort, `IX(tenant_id, balance)` for balance filters/sorts and the totals aggregate, `IX(tenant_id, collection_date)` for collection chips, `IX(tenant_id, is_customer)` / `IX(tenant_id, is_supplier)` for type chips, GIN trigram on `name` for search. Joins `parties_party_tag` + `parties_tag` (prefetched, never N+1 — asserted in tests) and, for the tag filter, an `EXISTS` subquery rather than a join to avoid row multiplication in the totals aggregate. **New index proposed**: `IX(tenant_id, status, balance DESC)` to serve "Archived/Active + highest balance" without a sort node, and a partial `IX(tenant_id, collection_date) WHERE balance > 0` for the overdue chip — both raised as **CCR-21**. No writes except `platform_audit_log` for export (§16).

#### 16. Audit Requirements
Viewing a list is not audited (volume). `parties.exported` is audited: `action='party.exported'`, `entity_type='party'`, `entity_id=NULL`, `metadata = { filters: {…}, ordering, row_count, format, request_id }` — an export of personal data is a DPDP-relevant event and must be attributable. Bulk actions launched from the list are audited by their owning features (PTY-05 `party.tagged`, LED-06 `reminder.sent`).

#### 17. Notifications
In-app only, and only for asynchronous exports: `notifications_notification` `type='export_ready'`, title "Party list ready", body "{row_count} parties · expires in 7 days", `data = { route: '/parties', download_url, export_id }`. No SMS/WhatsApp. Not applicable otherwise — a list view generates no outbound messages.

#### 18. Analytics / Event Tracking
`ub.parties.list_viewed { row_count, total, receivable_bucket, payable_bucket, active_filter_count, ordering, source: 'nav'|'back'|'deeplink' }` (amount buckets, not raw amounts); `ub.parties.list_searched { q_length, q_kind: 'name'|'digits'|'code'|'gstin', result_count, had_zero_results }` (never the query text); `ub.parties.list_filtered { filter, value, active_filter_count }`; `ub.parties.list_sorted { ordering }`; `ub.parties.totals_tile_tapped { tile: 'receivable'|'payable' }`; `ub.parties.opened { position, page, from: 'list'|'search', balance_sign }`; `ub.parties.list_row_action { action }`; `ub.parties.list_bulk { action, selected_count, mode: 'ids'|'filter' }`; `ub.parties.exported { format, row_count, async: bool }`; `ub.parties.list_load_failed { error_code }`; `ub.parties.list_stale_shown {}`.

#### 19. Security
Tenant scoping via the tenant-scoped manager; `tenant_id` is never a query param. `q` is passed to the ORM as a parameter (no raw SQL string building); the trigram search uses `__unaccent`-free `icontains` plus a `TrigramSimilarity` annotation, both parameterised. `tag` names are matched with `__in` against a bounded list of ≤ 10 to prevent a large `IN` clause. Mobile numbers are personal data: the list response includes them because the user needs to dial, but they are masked in the UI when `parties.mask_mobile` is on, and analytics never carry them. CSV export is authorised by `parties.party.export`, rate-limited to 10/hour/user, audited, and delivered through a signed short-lived URL (`files_attachment` with `expires_at`) rather than an inline body when async. Rate limits: the general 600 req/min bucket, plus a search-specific 120 req/min/user guard so a stuck debounce cannot hammer the trigram index.

#### 20. Performance
Two queries per request: the page query (`LIMIT/OFFSET` on an indexed sort) and the totals aggregate (`SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END)`, `SUM(CASE WHEN balance < 0 THEN -balance ELSE 0 END)`, `COUNT(*)`) over the same filtered queryset — both must be index-assisted; a CI `EXPLAIN` assertion (Part 21 §21.4) fails the build if either shows a `Seq Scan` on the 100k-row performance fixture. Tags are prefetched in a third query. Total budget: 3 queries, P95 ≤ 250 ms server, ≤ 40 KB gzipped JSON for 25 rows. `OFFSET` degrades beyond page 40; the client's 500-row mobile cap and the desktop's "refine your search" hint keep users inside that window (cursor pagination for parties is deferred — CCR-22). Client: rows are `memo`ised, `UbAmount` formatting is memoised per (value, locale), and the filter drawer is `next/dynamic`.

#### 21. Testing
- **T-PTY-02-1** unit: `selectQueryParams` maps chips/tabs/sort to the documented params and drops empty values.
- **T-PTY-02-2** unit: `partyDisplay.balanceLabel` returns get/give/settled with the right tone for +1, −1, 0.
- **T-PTY-02-3** API: `meta.totals` over an unfiltered set equals the sum of signed balances split by sign; with `type=supplier` it equals the same computed over suppliers only.
- **T-PTY-02-4** API: `balance=owes_me` returns only `balance > 0` and `meta.totals.payable = "0.00"`.
- **T-PTY-02-5** API: `q` matching by name prefix, trigram, `display_code`, mobile suffix (4 digits) and exact GSTIN; result de-duplicated; relevance order asserted.
- **T-PTY-02-6** API: `status=archived` excludes active rows and its totals cover only archived parties.
- **T-PTY-02-7** API: `collection=overdue` excludes a party with a past date but zero balance.
- **T-PTY-02-8** API: `tag=Camp Area,Route 2` returns the union; an unknown tag name is ignored.
- **T-PTY-02-9** API: `ordering=-balance` then `name`; NULL `last_activity_at` sorts last on the default ordering.
- **T-PTY-02-10** API: `page_size=101` → 400; `page=999` → 200 empty with correct meta.
- **T-PTY-02-11** API: cross-tenant party never appears; a second tenant with the same mobile is invisible.
- **T-PTY-02-12** permission: staff 200 on list, 403 on `format=csv`; accountant 200 on both; a member without `parties.party.read` → 403.
- **T-PTY-02-13** performance: with the 100k-party fixture, `EXPLAIN` of the page and totals queries shows index scans; query count for the endpoint is exactly 3.
- **T-PTY-02-14** component: `PartyListPageContent` renders skeletons → rows → totals; tapping the receivable tile applies the filter and re-requests once.
- **T-PTY-02-15** component: filtered-empty state offers "Clear filters" and "Add party '{q}'" with the name prefilled into the PTY-01 drawer.
- **T-PTY-02-16** component: stale-cache banner appears when a refresh fails and cached rows exist.
- **T-PTY-02-17** E2E (mobile): 2,000-party seed, type 3 letters, open the 1st result, post a "You gave" entry, return — the row shows the new balance and the receivable tile increased by the same amount without a manual refresh.
- **T-PTY-02-18** E2E (desktop): select 40 rows, bulk add tag, see the completion snackbar and the tag chips on the rows.
- **T-PTY-02-19** a11y: axe clean; totals region is `aria-live`; chips expose `aria-pressed`; the grid has a caption and column headers.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given parties with balances +2,300, +500 and −1,200, when I open the Parties screen, then the header shows "You will get ₹2,800" in red tone and "You will give ₹1,200" in green tone with "3 parties".
- **AC-2 (US-2)** Given a party "Ramesh Traders" with mobile +919876543210, when I type "ram" then "5432", then the party appears in the first three rows in both cases.
- **AC-3 (US-3)** Given the chips row, when I tap "Owes me", then only parties with a positive balance are listed and the chip is shown as an applied `UbFilterTag`.
- **AC-4 (US-4)** Given a tenant with customers and suppliers, when I tap the {supplierLabel} chip, then only parties with `is_supplier=true` are listed and a "Both" party is included.
- **AC-5 (US-5)** Given the tag "Camp Area" on 12 parties, when I select it in the tag filter, then 12 rows are listed and the count caption reads "12 parties".
- **AC-6 (US-6)** Given sort "Highest you will get", when the list loads, then rows are ordered by descending balance and the first row has the largest positive balance.
- **AC-7 (US-7)** Given the tag filter "Camp Area" applied, when I read the header totals, then they cover only those 12 parties and are less than or equal to the unfiltered totals.
- **AC-8 (US-8)** Given an archived party, when I open the Archived tab, then it is listed with an "Archived" badge and its row menu offers only Restore and View.
- **AC-9 (US-9)** Given I am an accountant with the "Owes me" filter applied, when I press Export CSV, then I receive a file whose rows match the filtered list exactly and an audit row `party.exported` records the filters and row count.

#### 23. Dependencies
PTY-01 (create, row upsert), PTY-03 (row target), PTY-04 (archive/restore, Archived tab), PTY-05 (tags and the tag filter), PTY-06 (credit limit column), PTY-10 (Import action), LED-01 (row quick entries), LED-06 (Remind, bulk reminders), PLT-06 (`parties.labels`, `parties.mask_mobile`), PLT-15 (plan limits for the Add button state), RPT-01 (dashboard links into this list with preset filters), `UbDataGrid`, `UbStatCard`, `UbSearchInput`, `UbFilterTag`, `UbTabs`, `UbEmptyState`, `UbAmount`, `UbBottomNav`/`UbFab`, `pg_trgm` extension enabled in the migration that creates the trigram index.

#### 24. Future Enhancements
Cursor pagination for very large tenants (CCR-22, P2); saved filter views ("My route Monday") per user (P2); transliterated and phonetic search for Devanagari ↔ Latin (P3, needs an ADR for the transliteration library); party groups/areas as a first-class entity beyond free tags (PTY-05 Future, P2); a map view of parties by area for delivery routes (P3); "last visited" and "days since last entry" columns feeding a collection score (P3); realtime balance push over SSE so a second device updates without refresh (P3); column-level export templates (P2 with IMP-04).

---

### PTY-03 — Party detail (khata page)

#### 1. Business Objective
The khata page is the single most-used screen after the list: it is the digital page of the paper ledger for one person. It must show the balance in words the shopkeeper already uses, put the two entries that make up 90 % of daily work ("You gave", "You got") within one thumb-tap, and show every transaction — manual entries, invoices, purchase bills, payments, credit notes — in one chronological timeline with a running balance, so the user never has to ask "where did this number come from". It is also the natural share surface: the WhatsApp statement share from this page is the behaviour that made Khatabook spread (research §B.2). Success measures: ≥ 70 % of ledger entries are created from this page rather than from a global form; P75 time-to-interactive ≤ 1.0 s with the first 20 timeline rows; ≥ 25 % of khata page sessions end in a share or reminder; zero support tickets of the form "the balance does not match the entries" (the running balance is computed from the same rows that are shown).

#### 2. User Personas
OW (primary), ST (entries, bills, reminders — no corrections or voids), AC (read-only, statement export), CU indirectly (receives the shared statement; sees the same data through PTY-09 in Phase 2).

#### 3. User Stories
1. **US-PTY-03-1** — As a shopkeeper, I want to open a party and immediately see how much they owe me so that I can tell them without calculating.
2. **US-PTY-03-2** — As a shopkeeper, I want a big "You gave" and "You got" button so that recording udhaar takes one tap.
3. **US-PTY-03-3** — As a shopkeeper, I want to see every transaction with the date, note and running balance so that I can settle a dispute on the spot.
4. **US-PTY-03-4** — As a shopkeeper, I want to send the party their statement on WhatsApp so that they can check it themselves and pay.
5. **US-PTY-03-5** — As an owner, I want to make a bill for this party without going to the Sales module so that billing follows the conversation.
6. **US-PTY-03-6** — As an owner, I want to set a date by which they promised to pay and be reminded so that I do not forget to follow up.
7. **US-PTY-03-7** — As an owner, I want to open the invoice behind a ledger row so that I can see what was sold.
8. **US-PTY-03-8** — As an owner, I want to see the party's phone, GSTIN and address without leaving the page so that I can call or bill correctly.
9. **US-PTY-03-9** — As an owner, I want to correct a wrong entry from here so that the khata is right, with the change visible as a correction rather than a silent edit.
10. **US-PTY-03-10** — As a staff member, I want to filter the timeline to a date range so that I can check last month only.

#### 4. Functional Requirements
- **FR-1** Route `app/(app)/parties/[id]/page.tsx` → `<PartyDetailPageContent/>`. Data: `GET /parties/{id}` (party + `summary` + `recent_entries[5]`) hydrates `partyDetailSlice` immediately, and `GET /parties/{id}/ledger-entries?cursor&limit=25` fills `partyTimelineSlice`. When the user arrived from PTY-02, the cached row renders the header instantly (name + balance) while both requests are in flight — no header skeleton for a navigated-from-list entry.
- **FR-2** Header (`UbPartyHeader`): `MLAvatar` initials, name, type badges ({customerLabel}/{supplierLabel}/Both), `display_code`, masked or full mobile with a `tel:` link and a copy button, a tag chip row (PTY-05), and the balance block — `UbAmount` at `ds-metric-lg` with the label above it ("You will get" / "You will give" / "Settled") and, beneath, the baseline caption "as of {last_activity_date}" (Koper rule: every number carries its baseline). When `credit_limit` is set, an `MLProgress` usage bar is shown (PTY-06 FR-6).
- **FR-3** Quick actions row, in this fixed order: **You gave** (`--error` outlined), **You got** (`--success` outlined), **Bill** (primary filled), **Remind**, **Share**. On mobile the first two are full-width 48 px buttons in a two-column grid pinned directly under the header; Bill/Remind/Share are a secondary row of icon+label buttons. Each opens: LED-01 entry drawer with `direction` preset; SAL-02 invoice editor with the party preselected (or PUR-01 when the party is supplier-only and `is_customer=false`); LED-06 reminder composer; `UbShareSheet`.
- **FR-4** Share sheet options: **WhatsApp statement** (builds the `wa.me/91XXXXXXXXXX?text=…` deep link with the statement summary text and a share link when one exists), **Copy link** (creates/reuses a statement share link via `POST /parties/{id}/share-links {kind:'statement', expires_in_days:7}`), **Download PDF** (`GET /parties/{id}/statement.pdf`), **SMS** (`sms:` deep link with the same text, only when `sms_opt_in`). WhatsApp is hidden when `mobile` is absent. The composed text is `parties.share.statementText` (§8) with `{businessName} {balanceLabel} {amount} {link}`.
- **FR-5** Timeline (`UbTimeline`): reverse-chronological rows grouped under sticky date headers ("Today", "Yesterday", "18 Sep 2026"). Each row shows: an entry-type icon, a title (the note, or a derived title — "Invoice INV/26-27/0042", "Payment received · UPI", "Opening balance", "Purchase bill PB/26-27/0011", "Write-off"), a subtitle (payment mode + reference, or document number + item count), the signed amount coloured by ledger semantics, and the **running balance after** that row in `ds-caption` grey. Attachments show a thumbnail strip (`UbImagePreview`).
- **FR-6** Running balance: rendered per row from `running_balance` supplied by the API (computed with a SQL window function `SUM(CASE direction WHEN 'debit' THEN amount ELSE -amount END) OVER (PARTITION BY party_id ORDER BY entry_date, created_at, id)`), never recomputed client-side. Because the timeline is paginated newest-first, the API returns the running balance *as of that row* so partial pages are still correct.
- **FR-7** Timeline filters: a `UbDateRangePicker` with chips (This month, Last month, This FY, Custom), an entry-type `MLSelect` (`All`, `You gave`, `You got`, `Bills`, `Payments`, `Corrections`), and an `MLSwitch` "Show corrections" mapping to `include_reversed`/`include_corrections`. Defaults: no date filter (all time), type All, corrections off. Filters are held in `partyTimelineSlice` and are not in the URL except `date_from`/`date_to` (shared UX rule allows the date range).
- **FR-8** Corrections display: when "Show corrections" is off, an entry with `status='reversed'` and its reversal row are both hidden and the superseding entry is shown alone with a small "corrected" `UbStatusBadge`; when on, all three rows appear connected by a left rail, oldest annotated "Reversed on {date} — {reason}".
- **FR-9** Row tap: a manual entry opens the `LedgerEntryDetailDrawer` (LED-03) with Correct / Reverse / Add photo actions gated by permission; a document-sourced row navigates to the document (`/sales/invoices/{id}`, `/purchases/bills/{id}`, `/payments/{id}`); an opening-balance row opens LED-02's read-only detail. Long-press (mobile) / right-click (desktop) opens the same action menu without navigating.
- **FR-10** Infinite timeline: cursor pagination (`meta.next_cursor`, `has_more`), 25 rows per page, appended on scroll; a "Jump to date" control in the filter bar issues a request with `date_to={chosen}` and replaces the list.
- **FR-11** Info panel: on desktop a right rail (320 px) shows Contact (mobile, alt phone, email, all with copy/dial actions), Business (GSTIN with a copy button and a "PAN {pan}" caption, `gst_registration`, state), Addresses (billing, shipping), Terms (credit limit, due days, collection date), Notes, and Meta (added on, added by, last activity). On mobile the same content is an "Details" `MLCollapsible` below the quick actions, collapsed by default.
- **FR-12** Collection date: an inline editable field ("Promised to pay on —") that `PATCH`es `collection_date` and, when set, offers "Also remind me" which creates a `ledger_reminder(kind='manual', due_on=collection_date, channel='in_app')` (LED-06). Clearing the date cancels `scheduled` reminders for that date (status → `cancelled`).
- **FR-13** Overflow menu (⋯ in `UbPageHeader`): **Edit party** (PTY-01 drawer), **Statement** (LED-04 full statement page with its own filters and export), **Add tag** (PTY-05), **Merge** (PTY-08, Phase 2), **Share khata link** (PTY-09, Phase 2), **Archive**/**Restore** (PTY-04), **Export entries CSV** (`GET /parties/{id}/ledger-entries?format=csv`).
- **FR-14** Archived party: the whole page renders read-only with a `UbStatusBanner` "This party is archived" + **Restore** (owner only); quick actions are hidden; the timeline and statement remain fully readable and exportable.
- **FR-15** Optimistic write-through: entries created from this page are inserted at the top of the timeline with a "Saving…" chip and the header balance updates immediately via `partyDetailSlice.actions.balanceAdjusted({ direction, amount })`; on 201 the row is replaced with the server row (which carries the authoritative `running_balance`); on failure the row turns into an error row with **Retry** and **Discard**, and the header balance is rolled back.
- **FR-16** Deep links: `?new=1` opens the PTY-01 edit drawer, `?entry=debit|credit` opens the LED-01 drawer with the direction preset, `?tab=statement` jumps to LED-04. These are used by notifications and by the reminder flow.

#### 5. Non-Functional Requirements
TTI ≤ 1.0 s P75 on 3G Fast for a party with 5,000 entries (only 25 are fetched). Header must render from cache in ≤ 100 ms when navigated from the list. Timeline scrolling at 60 fps on a 2019-class Android: rows are `memo`ised, date headers use CSS `position: sticky`, no layout-shifting images (thumbnails are fixed 40 × 40 with `aspect-ratio`). The page is fully usable at 320 px. Accessibility: the balance is an `aria-live="polite"` region so optimistic changes are announced; the timeline is an ordered list with each row's accessible name "{date}, {title}, you gave ₹500, balance ₹2,300"; quick-action buttons are ≥ 48 px on mobile. `en`/`hi` copy; the shared statement text is generated in the **party's** language when `parties.message_locale` is set, otherwise the tenant locale. Offline: the last-viewed party's header and first page of timeline are kept in `partyDetailSlice.cache` (last 10 parties) and rendered with a "Saved view" banner when the network fails.

#### 6. User Flow
Primary (record udhaar): Parties list → tap Ramesh → khata page → tap **You gave** → LED-01 sheet with amount focused → type 500, optional note "Sugar 10kg" → Save → sheet closes, row appears at top with "Saving…" → confirmed → header now "You will get ₹2,800" → snackbar "Entry added · Share" .
Alternate A (collect payment): tap **You got** → amount 500, mode UPI, reference → Save → balance drops → snackbar offers **Share receipt**.
Alternate B (share statement): tap **Share** → WhatsApp → OS opens WhatsApp with the text and link → user presses send.
Alternate C (bill): tap **Bill** → SAL-02 invoice editor opens with party, place of supply and credit days prefilled → issue → returning to the khata shows the invoice row and the debit entry.
Alternate D (dispute): user filters "Last month", turns on "Show corrections", finds a reversed ₹900 entry, taps it, reads the reason, and shares the statement PDF.
Alternate E (correction): tap a manual entry → drawer → **Correct** → `UbReasonDialog` with the consequence line "Ledger −₹100 · Balance ₹2,700" → confirm → timeline shows reversal + replacement (LED-03).
Alternate F (archived): open an archived party → banner + read-only page → Restore (owner) → banner disappears, quick actions return.
Alternate G (deleted/unknown id): 404 → `UbEmptyState` error variant "This party was not found" + **Back to parties**.

#### 7. UI Requirements
Components: `UbPageShell` + `UbPageHeader` (back arrow on mobile, name as title, ⋯ overflow), `UbPartyHeader` (avatar, name, badges, balance block, credit bar), `PartyQuickActions` (feature component built from `MLButton`s), `PartyTimeline` (`UbTimeline` + `MLItem*` rows + sticky `ds-label` date headers), `PartyTimelineFilters` (`UbDateRangePicker`, `MLSelect`, `MLSwitch`), `PartyInfoPanel` (`MLCard`s with `ds-label` field labels and `ds-body-sm` values, copy `MLIconButton`s), `UbShareSheet`, `UbStatusBanner`, `UbEmptyState`, `UbSkeleton`.

Mobile (< 640 px): single column. Order: header card (balance, 140 px tall) → quick actions (2 + 3 grid) → "Details" collapsible → filter bar (horizontally scrollable chips) → timeline. The header collapses to a 56 px sticky bar with name + balance when scrolled past 120 px. `UbBottomNav` remains; no `UbFab` on this page (the quick actions replace it).

Desktop (≥ 1024 px): two columns — main (timeline, `flex-1`, max 780 px) and right rail (320 px info panel, sticky). Header spans both columns. Quick actions sit in the header row as a button group. The timeline rows are 56 px with hover raise and a trailing ⋯.

Keyboard: `d` = You gave, `c` = You got (credit), `b` = Bill, `r` = Remind, `s` = Share, `e` = Edit party, `/` = focus the timeline filter; `Esc` closes any open drawer. Amount fields in the opened drawers autofocus with the numeric keypad (`inputmode="decimal"`).

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `parties.detail.balance.get` | You will get | आपको मिलेंगे |
| `parties.detail.balance.give` | You will give | आपको देने हैं |
| `parties.detail.balance.settled` | Settled | हिसाब बराबर |
| `parties.detail.balance.asOf` | as of {date} | {date} तक |
| `parties.detail.action.gave` | You gave | आपने दिए |
| `parties.detail.action.got` | You got | आपको मिले |
| `parties.detail.action.bill` | Bill | बिल |
| `parties.detail.action.remind` | Remind | याद दिलाएँ |
| `parties.detail.action.share` | Share | भेजें |
| `parties.detail.details` | Details | विवरण |
| `parties.detail.timeline.title` | Transactions | लेन-देन |
| `parties.detail.timeline.showCorrections` | Show corrections | सुधार दिखाएँ |
| `parties.detail.timeline.corrected` | Corrected | सुधारा गया |
| `parties.detail.timeline.reversedOn` | Reversed on {date} — {reason} | {date} को वापस लिया — {reason} |
| `parties.detail.timeline.empty.title` | No transactions yet | अभी कोई लेन-देन नहीं |
| `parties.detail.timeline.empty.body` | Record what you gave or got and it will appear here. | आपने जो दिया या लिया, दर्ज करें — यहाँ दिखेगा। |
| `parties.detail.timeline.filteredEmpty` | No transactions in this period | इस अवधि में कोई लेन-देन नहीं |
| `parties.detail.running` | Balance {amount} | बाक़ी {amount} |
| `parties.detail.collection.none` | Promised to pay on — | भुगतान की तारीख़ — |
| `parties.detail.collection.set` | Promised {date} | {date} को देने का वादा |
| `parties.detail.collection.remindMe` | Also remind me | मुझे भी याद दिलाएँ |
| `parties.detail.archivedBanner` | This party is archived. Records stay readable. | यह पार्टी आर्काइव है। रिकॉर्ड पढ़े जा सकते हैं। |
| `parties.detail.notFound` | This party was not found | यह पार्टी नहीं मिली |
| `parties.detail.saved` | Saved view | सहेजा गया दृश्य |
| `parties.share.statementText.get` | {businessName}: your balance is ₹{amount} (you have to pay). See your khata: {link} | {businessName}: आपका बाक़ी ₹{amount} है (आपको देना है)। खाता देखें: {link} |
| `parties.share.statementText.give` | {businessName}: we owe you ₹{amount}. See your khata: {link} | {businessName}: हमें आपको ₹{amount} देने हैं। खाता देखें: {link} |
| `parties.detail.copied` | Copied | कॉपी हो गया |

Colour: the balance block and every amount follow ledger semantics; the **Bill** button is the only blue (primary) element on the page, per "one primary action per view". Confirmations: none for adding entries (they are reversible by correction, and the snackbar carries **Undo** for 8 s which issues LED-03 reverse with reason "Undo"); `UbReasonDialog` for Correct/Reverse; `UbConfirmDialog` for Archive. Defaults: timeline all-time, corrections hidden, share text pre-filled and editable in the WhatsApp composer (never auto-sent).

#### 9. States
**Initial** — header from list cache (or skeleton), timeline skeleton (6 rows), info panel skeleton. **Loading** — subsequent page loads append a spinner row; filter changes show skeletons in place of rows. **Empty** — no entries at all: `UbEmptyState` first-use variant with the two quick actions repeated as CTAs; filtered-empty: "No transactions in this period" + "Clear dates". **Success** — full render; a newly added row flashes `--accent-quiet` for 2 s. **Error** — party fetch 404 → not-found empty state; timeline fetch failure → inline error strip with Retry that keeps the header; offline with cache → "Saved view" banner. **Disabled** — accountant: quick actions hidden, ⋯ shows Statement/Export only; archived party: banner + read-only. **Partial** — optimistic row present with "Saving…" chip; header balance already adjusted. **Processing** — share link creation shows a spinner inside the share sheet item. **Completed** — statement PDF ready → the browser print view opens (ADR-014, client-side PDF). **Failed** — optimistic row turns red-outlined with "Not saved · Retry · Discard" and the header balance rolls back with an `aria-live` announcement.

#### 10. Validation Rules
The page itself has two editable controls; everything else is validated by the feature that owns the drawer (LED-01, LED-03, LED-06, SAL-02, PTY-01).

| Input | Rule | Message (en) | Code |
|---|---|---|---|
| `collection_date` | valid date; `≥ today − 365` and `≤ today + 365`; future allowed (it is a promise date, shared UX rule exception) | Choose a date within one year | `validation_error` (`details.collection_date`) |
| Timeline `date_from`/`date_to` | both `YYYY-MM-DD`; `date_from ≤ date_to`; range ≤ 5 years | Choose a start date before the end date | `validation_error` |
| Timeline `type` | ∈ `all`, `manual_gave`, `manual_got`, `invoice`, `credit_note`, `purchase_bill`, `debit_note`, `payment_in`, `payment_out`, `expense`, `opening`, `write_off`, `reversal`, `correction` (UI groups them) | Unknown entry type | `validation_error` (`details.type`) |
| `limit` | 1–100 | Limit must be between 1 and 100 | `validation_error` |
| `cursor` | opaque; tampered cursor → 400 | Invalid cursor | `validation_error` (`details.cursor`) |
| Share link `expires_in_days` | 1–30 | Choose between 1 and 30 days | `validation_error` |

#### 11. Business Rules
- **BR-1** The header balance is `parties_party.balance` (the cache), and the timeline's newest `running_balance` must equal it. A mismatch is a defect; a CI test (`T-PTY-03-6`) asserts equality on a randomised fixture.
- **BR-2** Running balance is computed over **posted** entries in `(entry_date, created_at, id)` order. Back-dated entries therefore re-order history: an entry dated last month inserted today appears in its date position and shifts the running balances after it. The list is sorted by the same key, so the sequence stays consistent.
- **BR-3** Reversal pairs cancel in the balance (Part 21 §21.3.4); hiding them with "Show corrections" off does not change any displayed running balance because the superseding entry carries the net effect.
- **BR-4** Quick actions map to directions without ambiguity for both roles of a party: **You gave** always posts `direction='debit'` (`entry_type='manual_gave'`, receivable ↑) and **You got** always posts `direction='credit'` (`manual_got`), whether the party is a customer, a supplier or both. For a supplier this correctly means "I paid them" (debit reduces what I owe).
- **BR-5** The **Bill** action opens a sales invoice when `is_customer`, a purchase bill when supplier-only; for "Both" parties it opens an `MLDropdownMenu` with both choices.
- **BR-6** A share link created here is a **statement** link (`parties_share_link` with `kind='statement'`) with a default 7-day expiry; it is distinct from the PTY-09 self-view khata link (Phase 2), which is revocable and long-lived. Re-sharing within the validity window reuses the existing unexpired, unrevoked link rather than minting a new one.
- **BR-7** The WhatsApp share is a **deep link only** (ADR-015): the app never sends on the user's behalf and never uploads the address book. The message text is editable in WhatsApp before sending.
- **BR-8** `collection_date` is a promise, not a due date: it does not change any document's `due_on` and does not by itself create a reminder unless "Also remind me" is chosen.
- **BR-9** Document-sourced ledger rows are never editable from here; they are changed only by voiding their document (Part 22 §22.5 `use_document_void`), and the row's action menu says so.
- **BR-10** The page never sums ledger rows client-side for display; every number shown comes from the server (`summary`, `running_balance`) except the optimistic delta of FR-15, which is replaced by the server value on confirmation.
- **BR-11** Archiving does not hide history: an archived party's timeline, statement and export remain available to anyone with `parties.party.read`.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View page, timeline, info | `parties.party.read` + `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ |
| You gave / You got | `ledger.entry.write` | ✅ | ✅ | ✅ | ❌ |
| Correct / Reverse an entry | `ledger.entry.correct` | ✅ | ✅ | ❌ | ❌ |
| Bill (sales) | `sales.invoice.write` | ✅ | ✅ | ✅ | ❌ |
| Bill (purchase) | `purchases.bill.write` | ✅ | ✅ | ✅ | ❌ |
| Remind | `ledger.reminder.write` | ✅ | ✅ | ✅ | ❌ |
| Share statement / create link | `ledger.statement.export` | ✅ | ✅ | ✅ | ✅ |
| Export entries CSV | `ledger.statement.export` | ✅ | ✅ | ✅ | ✅ |
| Edit party | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Set collection date | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Archive / Restore | `parties.party.delete` | ✅ | ✅ | ❌ | ❌ |
| Merge (P2) | `parties.party.delete` | ✅ | ❌ | ❌ | ❌ |

`partyActions.detailActions(party, permissions)` is the single source for which buttons and menu items render; hidden rather than disabled, except Restore which is disabled with a tooltip for non-owners so they know the capability exists.

#### 13. Edge Cases
- **EC-1** Party with 20,000 entries: only 25 load; "Jump to date" and the date range are the navigation tools. The statement page (LED-04) is the place for long ranges and export.
- **EC-2** All entries in one day: the sticky date header shows once; ordering within the day is `created_at, id` so the sequence is stable across refetches.
- **EC-3** Back-dated entry added today: it appears in its date position (BR-2), not at the top, so the optimistic insert must place it correctly — the client sorts the optimistic row by the same key and, when it lands outside the loaded window, shows a snackbar "Entry saved on {date} — scroll to see it" with a **Show** action that jumps there.
- **EC-4** Timezone: business dates are tenant-local (`Asia/Kolkata`); a device set to another timezone still groups rows by the tenant's date, computed server-side and sent as `entry_date`.
- **EC-5** Party with no mobile: WhatsApp and SMS share items are hidden; Copy link and Download PDF remain.
- **EC-6** Party is both customer and supplier with offsetting balances: one net balance is shown (canon §0.2); the info panel shows `receivable_total` and `payable_total` as a caption "From sales ₹8,000 · From purchases ₹6,500" so the netting is explainable.
- **EC-7** Balance exactly 0 with entries present: header shows "Settled ₹0" in neutral tone and the quick actions stay.
- **EC-8** A document row whose document was voided: the timeline shows the original debit and its reversal as a pair; with corrections hidden, both vanish and the running balance is unchanged — matching the merchant's expectation that a cancelled bill leaves no trace in the balance.
- **EC-9** Two users add an entry at the same time: both succeed (entries are immutable appends); the timeline may briefly miss the other user's row until the next fetch; the header balance refetches on window focus (`visibilitychange`) to correct drift.
- **EC-10** Share link creation fails (rate limit): the share sheet shows "Couldn't create the link. Send the amount only?" with a fallback text that omits `{link}`.
- **EC-11** Very old party opened from a notification after archival: page loads read-only with the banner; the notification's action button is replaced by **Restore** for owners.
- **EC-12** `credit_limit` exceeded: the header's usage bar turns `--warning`/`--error` and a `UbStatusBanner` explains (PTY-06 FR-7); quick actions still work but LED-01 applies the warn/block rule.
- **EC-13** Entry with an attachment that failed to upload: the row shows a broken-thumbnail placeholder with **Retry upload** (FIL-01).
- **EC-14** Deep link `?entry=debit` on an archived party: the drawer does not open; the banner is focused instead and an `aria-live` message explains why.

#### 14. API Requirements
- `GET /parties/{id}` → `{ data: { …party, summary: { balance, receivable, payable, open_invoices, overdue_amount, last_payment_at }, recent_entries: [5], tags: [], credit: { limit, used, available, mode } }, meta: {} }`. 404 for unknown or cross-tenant ids.
- `GET /parties/{id}/ledger-entries?cursor&limit=25&date_from&date_to&type=&include_reversed=false` → cursor-paginated entries. **Delta to §22.5**: each row carries `running_balance` (string) and a `source` summary `{ type, id, number, route }` for navigation, and the endpoint accepts `format=csv`. Raised as **CCR-23**.
- Entry row JSON: `{ id, entry_date, direction, amount: "500.00", entry_type, note, payment_mode, reference, status, running_balance: "2800.00", source: { type: "sales_document", id, number: "INV/26-27/0042", route: "/sales/invoices/{id}" } | null, attachments: [{id, url, thumb_url}], reverses_id, reversed_by_id, supersedes_id, reason, created_by: { id, name }, created_at }`.
- `PATCH /parties/{id}` `{ collection_date }` (PTY-01 FR-2 path) → 200 party.
- `POST /parties/{id}/share-links` `{ kind: "statement", expires_in_days: 7 }` → `{ data: { url, token_suffix, expires_at } }`; 409 `share_link_limit` when more than 5 active links exist for the party (the client offers to revoke the oldest).
- `GET /parties/{id}/statement.pdf?date_from&date_to` — client-side print view at MVP (ADR-014): the frontend opens `/parties/{id}/statement/print` and calls `window.print()`; the `.pdf` endpoint exists for Phase 2 server rendering. Documented so the client does not assume a server PDF at MVP.
- `POST /ledger-entries` (LED-01) with `Idempotency-Key` for the quick actions; response `meta.party_balance` is written straight into `partyDetailSlice`.
- Frontend: `partyService.getParty(id)`, `partyService.getTimeline(id, params)`, `partyService.createShareLink(id, body)`; thunks `fetchPartyDetail`, `fetchPartyTimeline`, `createShareLink`, `setCollectionDate`; selectors `selectParty`, `selectPartySummary`, `selectTimelineRows`, `selectTimelineCursor`, `selectCanShare`.

#### 15. Database Impact
Reads: `parties_party` by PK within tenant scope; `ledger_entry` by `IX(tenant_id, party_id, entry_date, created_at)` with the window function for `running_balance`; `parties_party_tag` + `parties_tag` (prefetch); `files_attachment` by `(owner_type='ledger_entry', owner_id IN (...))` (single prefetch for the page of rows); `sales_document` / `purchases_document` / `payments_payment` for the `source` summary — fetched by a single grouped query per source type using the `(tenant_id, source_type, source_id)` reverse lookup, never one query per row (asserted in tests); `ledger_reminder` for the collection chip; `platform_tenant_setting` for labels and mask settings. Writes: `parties_party.collection_date` (PATCH), `parties_share_link` (insert), `ledger_reminder` (insert/cancel), `platform_audit_log`. No new indexes required; the statement window query is the same access path as LED-04.

#### 16. Audit Requirements
Page views are not audited. Audited from this page: `party.updated` (collection_date change, before/after), `party.share_link.created` (`metadata = { kind, expires_at, channel_hint }`), `party.share_link.revoked`, `ledger.statement.shared` (`metadata = { channel: 'whatsapp'|'sms'|'copy'|'pdf', masked_to }` — sharing a statement discloses personal financial data and must be attributable), plus the audit rows written by the features whose drawers open here (`ledger.entry.created`, `ledger.entry.reversed`, `reminder.sent`, `invoice.issued`).

#### 17. Notifications
Outbound to the party: none automatic from this page. The **Share** action produces a WhatsApp/SMS deep link the user sends themselves; when SMS is chosen and a provider is configured (NTF-02), a `notifications_message_log` row is written with `template_code='statement_share'`, `channel='sms'`, status `queued|skipped`. Template `statement_share` (en): "{businessName}: your balance is ₹{amount}. View: {link}. Reply STOP to opt out." (hi): "{businessName}: आपका बाक़ी ₹{amount}। देखें: {link}. बंद करने के लिए STOP भेजें।" In-app: none. Party SMS on entry creation is owned by LED-01/LED-08 and gated by `ledger.party_sms_on_entry` + `sms_opt_in`.

#### 18. Analytics / Event Tracking
`ub.parties.detail_viewed { source: 'list'|'search'|'notification'|'deeplink'|'document', balance_sign, entry_count_bucket, has_credit_limit, is_archived }`; `ub.parties.quick_action { action: 'gave'|'got'|'bill'|'remind'|'share' }`; `ub.parties.timeline_paged { page_index, rows_loaded }`; `ub.parties.timeline_filtered { filter: 'date'|'type'|'corrections', value }`; `ub.parties.timeline_row_opened { entry_type, source_type }`; `ub.parties.statement_shared { channel, has_link, amount_bucket }`; `ub.parties.share_link_created { expires_in_days }`; `ub.parties.collection_date_set { days_ahead, with_reminder: bool }`; `ub.parties.detail_offline_shown {}`; `ub.parties.optimistic_entry_failed { error_code }`.

#### 19. Security
Tenant-scoped fetch; a cross-tenant party id returns 404, never 403 (canon §0.11 rule 2). The `source.route` is generated server-side from the source type and is never taken from user input. Share links: token is 32 random bytes, only its SHA-256 hash is stored (`parties_share_link.token_hash`), the URL is shown once in the share sheet and can be revoked; links expire by `expires_at`; the public endpoint that consumes them is rate-limited and returns only the statement of that one party (PTY-09 §19 covers the public surface in detail). Personal data on screen (mobile, GSTIN, address) is masked per `parties.mask_mobile` and never sent to analytics. The WhatsApp deep link is built with `encodeURIComponent` on the text and a validated `^\+91[6-9]\d{9}$` number so no scheme injection is possible. Copy-to-clipboard uses the async Clipboard API behind a user gesture. Rate limits: 60 share-link creations/hour/tenant, general 600 req/min.

#### 20. Performance
Page render budget: 2 network requests on first paint (party + first timeline page), both ≤ 150 ms server P95. The timeline query uses the composite index and a window function over a bounded range (`LIMIT 26` to detect `has_more`); `EXPLAIN` in CI asserts an index scan on the 100k-entry fixture. Source summaries are batched into at most 4 extra queries (one per source table present in the page). Attachment prefetch is one query. Total ≤ 8 queries for the page. Client: header renders from the list cache (no layout shift when real data arrives because the skeleton has identical metrics); the info panel and share sheet are `next/dynamic`; timeline rows use `content-visibility: auto` below the fold. JSON for 25 rows ≤ 30 KB gzipped.

#### 21. Testing
- **T-PTY-03-1** unit: `partyDisplay.balanceLabel`/`balanceTone` for +, −, 0 and for supplier-only parties.
- **T-PTY-03-2** unit: share-text builder produces the `get` variant for a positive balance and the `give` variant for a negative one, escapes the text and omits `{link}` when no link exists.
- **T-PTY-03-3** unit: optimistic insert places a back-dated row in date order and rolls back the header on failure.
- **T-PTY-03-4** API: `GET /parties/{id}` returns `summary.balance` equal to the sum of posted entries; `recent_entries` has 5 rows newest-first.
- **T-PTY-03-5** API: timeline cursor paging returns disjoint pages covering all rows exactly once; `running_balance` of the newest row equals `party.balance`.
- **T-PTY-03-6** API (property): for a randomised set of 200 entries including reversals and corrections, the running balance of every row equals the sum of all earlier posted entries.
- **T-PTY-03-7** API: `include_reversed=false` hides the reversed entry and its reversal; `true` shows both with `reason` populated.
- **T-PTY-03-8** API: `date_from`/`date_to` filtering and `type=` grouping; invalid range → 400.
- **T-PTY-03-9** API: `source` summary present with number and route for invoice/payment/purchase-bill rows and null for manual rows; query count ≤ 8 for a mixed page.
- **T-PTY-03-10** API: `POST /parties/{id}/share-links` returns a URL once, stores only the hash, reuses an unexpired link on a second call, and 409s past 5 active links.
- **T-PTY-03-11** API: cross-tenant id → 404; archived party → 200 read-only payload with `status='archived'`.
- **T-PTY-03-12** permission: staff cannot Correct (403 on `/correct`); accountant cannot create an entry (403) but can create a share link.
- **T-PTY-03-13** component: quick actions render per permission and open the right drawer with the direction preset.
- **T-PTY-03-14** component: archived banner hides quick actions and shows Restore for owners only.
- **T-PTY-03-15** component: "Show corrections" toggles the connected reversal rail; the running balance values do not change.
- **T-PTY-03-16** E2E (mobile): open party → You gave ₹500 → header updates optimistically → row confirmed → refresh → header still ₹500 higher.
- **T-PTY-03-17** E2E: Share → WhatsApp deep link contains the party's number, the right text variant and the link.
- **T-PTY-03-18** E2E: tap an invoice row → sales invoice page opens with the matching number.
- **T-PTY-03-19** a11y: axe clean; balance region is `aria-live`; timeline rows expose a complete accessible name; all touch targets ≥ 44 px.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given Ramesh owes ₹2,300, when I open his khata page, then the header shows "You will get ₹2,300" in red tone with "as of {date}".
- **AC-2 (US-2)** Given the khata page, when I tap "You gave", then the entry sheet opens with the amount field focused and `direction=debit` preset, and saving ₹500 makes the header read ₹2,800 without a page reload.
- **AC-3 (US-3)** Given five transactions, when I read the timeline, then each row shows date, title, note, signed amount and the balance after it, and the newest row's balance equals the header.
- **AC-4 (US-4)** Given a party with a mobile, when I tap Share → WhatsApp, then WhatsApp opens with a message containing the business name, the balance in words and a statement link, and nothing is sent until I press send.
- **AC-5 (US-5)** Given a customer party, when I tap Bill, then the invoice editor opens with the party, place of supply and due days prefilled, and after issuing, the khata shows the invoice row.
- **AC-6 (US-6)** Given no collection date, when I set "Promised to pay on 25/09/2026" and choose "Also remind me", then the party shows the date and a reminder exists with `due_on=2026-09-25`.
- **AC-7 (US-7)** Given a ledger row created by invoice INV/26-27/0042, when I tap it, then the invoice page opens showing that number.
- **AC-8 (US-8)** Given a party with GSTIN and address, when I open Details, then the GSTIN, PAN hint, state and addresses are shown with copy buttons.
- **AC-9 (US-9)** Given a manual entry of ₹900 and owner rights, when I correct it to ₹800 with a reason, then the timeline shows the original, its reversal and the replacement (with corrections on) and the header drops by ₹100.
- **AC-10 (US-10)** Given entries across three months, when I choose "Last month", then only that month's rows are listed and the filter chip is visible and clearable.

#### 23. Dependencies
PTY-01 (edit drawer, party data), PTY-02 (navigation source and cached header), PTY-04 (archive banner/restore), PTY-05 (tags), PTY-06 (credit bar and warnings), PTY-08/PTY-09 (Phase 2 menu items), LED-01 (entry drawer), LED-02 (opening balance row), LED-03 (entry detail, correct/reverse), LED-04 (statement page and print view), LED-06 (reminder composer), SAL-02 (invoice editor), PUR-01 (purchase bill), PAY-01 (payment detail), FIL-01 (attachments), NTF-02 (SMS adapter for the share fallback), PLT-06 (`parties.labels`, `parties.mask_mobile`, `parties.message_locale`), `UbPartyHeader`, `UbTimeline`, `UbShareSheet`, `UbDateRangePicker`, `UbAmount`, `UbStatusBanner`.

#### 24. Future Enhancements
PTY-09 self-view khata link replacing ad-hoc statement links (P2); WhatsApp Business API send-from-app instead of a deep link (LED-12, P2); per-party notes timeline ("called on 12th, promised Friday") as a first-class activity type (P2); photo-of-bill attachment directly from the quick actions (P2); voice note entries (P3); interest/late fee accrual rows in the timeline (LED-13, P3); a "since last settlement" collapse that folds settled periods (P3); party-level profit contribution when COGS is available (RPT-11, P3); realtime updates via SSE for multi-device shops (P3).

---

### PTY-04 — Archive / restore party

#### 1. Business Objective
Shops accumulate parties that stop transacting: the customer who moved away, the supplier replaced last year, the duplicate created in a hurry. A growing list slows search and clutters the collection view, but deleting a party would destroy the ledger behind it — which is both a data-integrity violation (canon §0.11 rule 1, Part 21 §21.5 `Party → ledger entries RESTRICT`) and a GST record-keeping violation (72-month retention). Archiving is the answer: the party leaves the working list but every entry, bill and statement stays readable and exportable forever. The feature also enforces the one rule merchants get wrong — you cannot tidy away someone who still owes you — by blocking archive while the balance is non-zero unless the user consciously writes the amount off. Success measures: ≥ 90 % of "how do I delete a party" support questions resolved by the in-product copy; 0 ledger rows orphaned or deleted; ≥ 95 % of archive attempts on non-zero balances resolved by either settling or a deliberate write-off (rather than abandonment).

#### 2. User Personas
OW (the only role that archives or restores by default), AD (same rights), ST (sees archived parties read-only, cannot archive), AC (read-only, may export archived parties).

#### 3. User Stories
1. **US-PTY-04-1** — As an owner, I want to archive a party who no longer trades with me so that my list shows only people I deal with.
2. **US-PTY-04-2** — As an owner, I want the app to stop me from archiving someone who still owes me so that I do not lose track of money.
3. **US-PTY-04-3** — As an owner, I want to write off a small unrecoverable balance and archive the party in one flow so that my receivable total is honest.
4. **US-PTY-04-4** — As an owner, I want to restore an archived party when they come back so that their old khata continues instead of starting again.
5. **US-PTY-04-5** — As an owner, I want archived parties to still appear in reports and statements for past periods so that my books stay complete.
6. **US-PTY-04-6** — As an owner, I want to archive several inactive parties at once so that a yearly clean-up does not take an hour.
7. **US-PTY-04-7** — As an auditor/accountant, I want to see who archived a party, when and why so that the change is traceable.

#### 4. Functional Requirements
- **FR-1** Archive: `POST /parties/{id}/archive` with body `{ "reason": "No longer trading" }` (optional, ≤ 160 chars). Sets `parties_party.status='archived'`; `deleted_at` stays NULL (archive is not a soft delete — Part 21 §21.6). Returns 200 with the updated party.
- **FR-2** Balance guard: the service refuses with 409 `party_balance_nonzero` when `balance ≠ 0.00`, returning `details = { balance: "2300.00", balance_label: "receivable"|"payable", suggestion: "write_off"|"collect" }`. There is **no tolerance band**: ₹0.01 blocks the archive (BR-3).
- **FR-3** Write-off path: `POST /parties/{id}/archive` accepts `{ "write_off": { "reason": "Cannot recover", "entry_date": "2026-09-18" }, "reason": "..." }`. In one `transaction.atomic()` the service posts a `ledger_entry` with `entry_type='write_off'`, `source_type='manual'`, `direction` opposite to the sign of the balance (`credit` when `balance > 0`, `debit` when `balance < 0`), `amount = |balance|`, `note` = the write-off reason, `reason` = the same string, then sets `balance = 0`, then archives. Response 200 `{ data: party, meta: { write_off_entry_id } }`.
- **FR-4** Restore: `POST /parties/{id}/restore` → `status='active'`, 200. No guard (restoring is always safe); 409 `party_not_archived` when the party is already active. Restore does **not** reverse a write-off entry — the write-off is a real financial event; the party simply resumes from a zero (or whatever) balance.
- **FR-5** Entry points: PTY-02 row ⋯ menu, PTY-03 header ⋯ menu, PTY-01 edit drawer footer ("Archive party" as a quiet destructive link), and PTY-02 bulk selection (FR-9). The Archived tab of PTY-02 is where restore lives.
- **FR-6** Confirmation: `UbConfirmDialog` (destructive, outlined danger per Koper) titled "Archive {name}?" with the consequence list rendered from server-provided facts: "{n} transactions stay readable", "Reminders will be cancelled ({m} scheduled)", "They will not appear in the party list or pickers". A reason `MLInput` (optional, ≤ 160) is included. For the write-off variant the dialog becomes a `UbReasonDialog` with a **required** reason (≥ 3 chars) and an explicit consequence line "Ledger −₹2,300 · You will get becomes ₹0" plus a `MLCheckbox` "I understand this money is written off" that must be ticked.
- **FR-7** Side effects on archive, all inside the same transaction: (a) `ledger_reminder` rows with `status='scheduled'` for the party → `status='cancelled'` with `note` prefixed "Party archived"; (b) any `parties_share_link` rows that are unexpired and unrevoked → `revoked_at = now()` (an archived party's public statement link must stop working); (c) `platform_audit_log` rows per §16. Documents, entries and payments are untouched.
- **FR-8** Visibility rules after archive: excluded from `GET /parties` unless `status=archived`; excluded from every party picker (`UbAsyncCombobox` in SAL-02, PUR-01, LED-01, PAY-01, EXP-01) — the picker sends `status=active` always; **included** in all reports, statements, aging, day book, GST summary and exports, because those describe past facts (BR-6). The PTY-01 duplicate-mobile lookup deliberately includes archived parties (PTY-01 FR-5).
- **FR-9** Bulk archive (desktop, PTY-02 FR-11): `POST /parties/bulk-archive` `{ "ids": [...], "reason": "Yearly clean-up" }` — **delta to §22.4, raised as CCR-24**. Partial success semantics: 207-style response in a 200 envelope `{ data: { archived: [ids], skipped: [ { id, name, code: "party_balance_nonzero", balance } ] }, meta: { archived_count, skipped_count } }`. Write-off is never applied in bulk (it is a financial decision per party). Max 200 ids per call.
- **FR-10** Blocked-archive UX: when FR-2 fires from the single-party flow, the confirm dialog is replaced in place (no second modal — single-open policy via `useExclusiveModal`) by an explanation state offering three actions: **Record payment** (opens LED-01 credit drawer prefilled with `amount = |balance|`), **Write off ₹{amount}** (switches the dialog to the write-off variant, owner only), and **Cancel**.
- **FR-11** Restore UX: from the Archived tab the row ⋯ → **Restore** shows `UbConfirmDialog` "Restore {name}?" with "They will appear in your party list again" and no reason field; on success a snackbar "Restored {name}" with an **Open** action.
- **FR-12** Undo: the archive snackbar carries **Undo** for 10 s, which calls `POST /parties/{id}/restore` and writes its own audit row (`party.restored` with `metadata.via='undo'`). Undo is **not** offered when a write-off was posted (the ledger entry is immutable and would need a separate reversal — the copy says "Archived with write-off. Correct the entry to reverse it.").
- **FR-13** Plan counters: archived parties do **not** count towards `max_parties` (PLT-15). Archiving is therefore a legitimate way to stay within a plan; restoring when at the limit returns 403 `plan_limit_reached`.
- **FR-14** Archived party pages stay reachable by direct URL and from any document that references the party; PTY-03 renders them read-only with the banner (PTY-03 FR-14).

#### 5. Non-Functional Requirements
Archive/restore P95 ≤ 300 ms server time (a handful of indexed updates in one transaction); bulk archive of 200 parties ≤ 3 s, executed in one transaction with `SELECT … FOR UPDATE` on the affected party rows to avoid interleaving with concurrent entry posts. The confirm dialog must render its consequence counts without a separate round trip: `GET /parties/{id}` already returns `summary` and the client asks for `scheduled_reminders` in the same payload (delta, §14). Copy in `en`/`hi`, with the write-off amount always shown in Indian digit grouping. Dialogs are keyboard-navigable with the destructive action **not** autofocused (Cancel is). Works offline: an archive attempted offline is queued only in Phase 2 (offline write queue, ADR-020); at MVP it fails with "You are offline. Try again when connected."

#### 6. User Flow
Primary (settled party): Parties → row ⋯ → Archive → confirm dialog with consequences → Archive → snackbar "Archived Ramesh · Undo" → row disappears from the Active tab and the totals count drops by one.
Alternate A (balance ≠ 0, collect): Archive → dialog shows "Ramesh still owes you ₹2,300" with the three actions → **Record payment** → LED-01 credit drawer prefilled ₹2,300 → Save → balance 0 → the archive dialog re-opens automatically with the normal confirmation → Archive.
Alternate B (balance ≠ 0, write off): Archive → **Write off ₹2,300** → `UbReasonDialog` with required reason + checkbox + consequence line → Confirm → one ledger credit entry `write_off` posted, balance 0, party archived → snackbar "Archived with write-off ₹2,300" (no Undo) → the khata timeline shows a "Write-off" row.
Alternate C (staff attempt): staff sees no Archive item (hidden by `partyActions`); if they hit the endpoint directly → 403 `permission_denied`.
Alternate D (restore): Archived tab → row ⋯ → Restore → confirm → snackbar "Restored Ramesh · Open".
Alternate E (bulk): desktop, select 30 rows → Archive selected → dialog "Archive 30 parties?" listing that 4 have balances and will be skipped → Archive → snackbar "Archived 26 · 4 skipped" with **See skipped** opening a dialog listing them with their balances and a per-row **Open**.
Alternate F (restore at plan limit): Restore → 403 → dialog with PLT-15 copy "Your plan allows 500 parties. Archive another party or upgrade."

#### 7. UI Requirements
Components: `PartyArchiveDialog` (feature component composing `UbConfirmDialog` / `UbReasonDialog`), `PartyRestoreDialog` (`UbConfirmDialog`), `PartyBulkArchiveDialog` (`UbDialog` with an `MLTable` preview of skippable rows), `UbStatusBanner` on PTY-03, `UbStatusBadge` "Archived" on list rows and the detail header, `UbSnackbar` with action.

Dialog anatomy (mobile: bottom sheet; desktop: centred modal, 440 px): title `ds-h3`; body `ds-body-sm` with a bulleted consequence list where each bullet carries a count; the blocked variant leads with a `UbAmount` line "Still owes you ₹2,300" in `--error` tone; write-off variant adds `MLTextarea` reason (required), `UbDateInput` for `entry_date` (defaults today, past allowed, future rejected) and the acknowledgement `MLCheckbox`; footer with Cancel (secondary, autofocused) and the destructive action as an **outlined** danger button (never a filled red block — Koper rule).

List/detail treatment of archived parties: row name in `--text-tertiary` with an "Archived" `UbStatusBadge`; the balance column still shows the balance (usually ₹0) so a written-off party reads correctly; the detail header shows the banner described in PTY-03 FR-14 with a **Restore** button for owners and a disabled one with a tooltip for others.

Keyboard: in the dialog, `Esc` cancels, `Enter` activates the focused (Cancel) button — the destructive action requires an explicit tab/click, so no accidental archive by repeated Enter.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `parties.archive.action` | Archive | आर्काइव करें |
| `parties.archive.title` | Archive {name}? | {name} को आर्काइव करें? |
| `parties.archive.body` | They will be hidden from your party list. Nothing is deleted. | वे आपकी पार्टी सूची से छिप जाएँगे। कुछ भी मिटेगा नहीं। |
| `parties.archive.consequence.entries` | {count, plural, one {# transaction stays readable} other {# transactions stay readable}} | {count} लेन-देन पढ़े जा सकेंगे |
| `parties.archive.consequence.reminders` | {count, plural, one {# scheduled reminder will be cancelled} other {# scheduled reminders will be cancelled}} | {count} तय रिमाइंडर रद्द हो जाएँगे |
| `parties.archive.consequence.links` | Any shared khata link will stop working | साझा किया गया खाता लिंक काम करना बंद कर देगा |
| `parties.archive.consequence.pickers` | They will not show up when you make a bill | बिल बनाते समय वे नहीं दिखेंगे |
| `parties.archive.reason` | Reason (optional) | कारण (वैकल्पिक) |
| `parties.archive.blocked.title` | {name} still owes you ₹{amount} | {name} पर अभी ₹{amount} बाक़ी हैं |
| `parties.archive.blocked.titleGive` | You still owe {name} ₹{amount} | आपको {name} को ₹{amount} देने हैं |
| `parties.archive.blocked.body` | Settle the balance or write it off before archiving. | आर्काइव करने से पहले हिसाब बराबर करें या राइट-ऑफ़ करें। |
| `parties.archive.blocked.recordPayment` | Record payment | भुगतान दर्ज करें |
| `parties.archive.blocked.writeOff` | Write off ₹{amount} | ₹{amount} राइट-ऑफ़ करें |
| `parties.writeOff.title` | Write off ₹{amount}? | ₹{amount} राइट-ऑफ़ करें? |
| `parties.writeOff.body` | This records a loss of ₹{amount} in your khata and sets the balance to ₹0. | यह आपके खाते में ₹{amount} का नुक़सान दर्ज करेगा और बाक़ी ₹0 कर देगा। |
| `parties.writeOff.reason` | Why are you writing this off? | आप यह राशि क्यों छोड़ रहे हैं? |
| `parties.writeOff.acknowledge` | I understand this money is written off | मैं समझता/समझती हूँ कि यह राशि छोड़ी जा रही है |
| `parties.writeOff.consequence` | Ledger {sign}₹{amount} · You will get becomes ₹0 | खाता {sign}₹{amount} · मिलने वाले ₹0 हो जाएँगे |
| `parties.archive.done` | Archived {name} | {name} आर्काइव हो गया |
| `parties.archive.doneWriteOff` | Archived with write-off ₹{amount} | ₹{amount} राइट-ऑफ़ के साथ आर्काइव |
| `parties.archive.undo` | Undo | वापस लें |
| `parties.restore.action` | Restore | वापस लाएँ |
| `parties.restore.title` | Restore {name}? | {name} को वापस लाएँ? |
| `parties.restore.body` | They will appear in your party list again. | वे फिर से आपकी पार्टी सूची में दिखेंगे। |
| `parties.restore.done` | Restored {name} | {name} वापस आ गया |
| `parties.archived.badge` | Archived | आर्काइव |
| `parties.archive.bulk.title` | Archive {count} parties? | {count} पार्टियाँ आर्काइव करें? |
| `parties.archive.bulk.skipNotice` | {count} will be skipped because they have a balance | {count} को छोड़ा जाएगा क्योंकि उन पर बाक़ी है |
| `parties.archive.bulk.done` | Archived {archived} · {skipped} skipped | {archived} आर्काइव · {skipped} छोड़े गए |

Copy rules: never the word "delete" anywhere in this feature — the product does not delete parties, and saying so prevents the support question. "Write off" is `राइट-ऑफ़` in Hindi (the English term is the one merchants use; a pure Hindi translation would be less clear). Colour: the destructive action is outlined `--error`; the write-off amount is shown in `--error` tone with its label.

#### 9. States
**Initial** — dialog closed. **Loading** — dialog opening waits for the consequence counts if they are not already in the slice (≤ 150 ms; a skeleton line is shown rather than an empty bullet list). **Empty** — not applicable. **Success** — dialog closes, snackbar with Undo (or without, after write-off), the row leaves the Active tab with a 220 ms fade, the header count and totals adjust. **Error** — 409 `party_balance_nonzero` swaps the dialog body to the blocked variant in place; other errors show an inline `UbStatusBanner` inside the dialog with the message and `request_id`, keeping the dialog open. **Disabled** — the Archive item is hidden for staff/accountant; the Restore button on the detail banner is disabled with an explanatory `MLTooltip` for non-owners. **Partial** — bulk archive completed with skips: the completion dialog lists archived and skipped groups. **Processing** — the destructive button shows `MLSpinner` + "Archiving…" and the dialog is not dismissible. **Completed** — archived; the Archived tab count increments. **Failed** — network failure keeps the dialog open with "Couldn't archive. Try again." and a Retry button; nothing is partially applied because the whole operation is one transaction.

#### 10. Validation Rules
| Field | Rule | Message (en) | Code |
|---|---|---|---|
| `reason` (archive) | optional, ≤ 160 chars, trimmed | Keep the reason under 160 characters | `validation_error` (`details.reason`) |
| `write_off.reason` | required when `write_off` present, 3–160 chars | Tell us why you are writing this off (at least 3 characters) | `validation_error` (`details.write_off.reason`) |
| `write_off.entry_date` | valid date, ≤ today, ≥ the party's earliest entry date | Choose today or an earlier date | `validation_error` (`details.write_off.entry_date`) |
| party state | must be `active` to archive | This party is already archived | `party_already_archived` (409) |
| party state | must be `archived` to restore | This party is not archived | `party_not_archived` (409) |
| balance | must be `0.00` unless `write_off` given | {name} still owes you ₹{amount} | `party_balance_nonzero` (409) |
| write-off permission | requires `ledger.entry.write` in addition to `parties.party.delete` | You do not have permission to write off a balance | `permission_denied` (403) |
| plan (restore) | active parties < `max_parties` | Your plan allows {limit} parties | `plan_limit_reached` (403) |
| `ids` (bulk) | 1–200 uuids, de-duplicated, all in tenant | Select between 1 and 200 parties | `validation_error` (`details.ids`) |

Yup: `archiveSchema = object({ reason: string().trim().max(160) })`; `writeOffSchema = object({ reason: string().trim().min(3).max(160).required(), entryDate: date().max(new Date()).required(), acknowledged: boolean().oneOf([true]) })`.

#### 11. Business Rules
- **BR-1** Archive is a status change, never a delete. `deleted_at` on `parties_party` is reserved for merge losers (PTY-08) and tenant deletion (PLT-10); no user action in this feature sets it.
- **BR-2** A party with `balance ≠ 0` cannot be archived. The two escapes are settling the balance (a payment/entry) or posting a write-off in the same transaction.
- **BR-3** Zero means exactly `0.00`. There is no rounding tolerance: `numeric(14,2)` equality is exact, and a ₹0.01 residue is a real (if small) receivable that the user writes off consciously.
- **BR-4** The write-off entry is an ordinary immutable ledger entry (`entry_type='write_off'`), posted with `direction` opposite to the balance sign and `amount = |balance|`. It is reversible only through LED-03 correction/reversal, which would make the balance non-zero again and leave the party archived-with-balance — a legitimate state the list renders normally (BR-9).
- **BR-5** Write-offs are a P&L event, not a cash event: they appear in the party statement, in the day book as a non-cash row, and in RPT-06 as "Bad debts written off"; they never touch the cashbook.
- **BR-6** Archived parties are excluded from *working* surfaces (party list default tab, pickers, reminder scans, aging buckets computed for collection) and included in *historical* surfaces (statements, registers, GST summary, day book, exports, audit). Aging: `GET /ledger/aging` excludes archived parties by default and accepts `include_archived=true` for reconciliation.
- **BR-7** Archiving cancels scheduled reminders and revokes share links; it does not void documents, does not reverse ledger entries and does not change stock.
- **BR-8** Restore is unconditional except for the plan limit; it does not recreate cancelled reminders or revoked share links.
- **BR-9** A party can be archived with a non-zero balance only by a later correction (BR-4) or by a merge (PTY-08). The Archived tab shows such a balance normally and the archived detail page keeps the banner; the party is **not** auto-restored.
- **BR-10** Bulk archive never writes off; it skips any party with a balance and reports it.
- **BR-11** The unique mobile constraint continues to apply to archived parties (PTY-01 BR-1), which is why the duplicate check offers **Restore** rather than silently allowing a second row.
- **BR-12** Archiving does not alter `last_activity_at`, so restoring returns the party to its correct position in the default sort.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Archive party | `parties.party.delete` | ✅ | ✅ | ❌ | ❌ |
| Archive with write-off | `parties.party.delete` + `ledger.entry.write` | ✅ | ✅ | ❌ | ❌ |
| Restore party | `parties.party.delete` | ✅ | ✅ | ❌ | ❌ |
| Bulk archive | `parties.party.delete` | ✅ | ✅ | ❌ | ❌ |
| View archived parties | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| Export archived parties | `parties.party.export` | ✅ | ✅ | ❌ | ✅ |

`parties.party.delete` is the archive capability (there is no hard delete in the product), which is why the catalogue lists PTY-04 as owner-only; `admin` holds the same codename by the system-role definition (canon §0.9) and therefore can archive. A tenant that wants a specific staff member to archive grants the codename through `platform_membership.permissions_override`.

#### 13. Edge Cases
- **EC-1** Balance becomes non-zero between opening the dialog and confirming (another device posted an entry): the server's 409 fires and the dialog swaps to the blocked variant with the fresh amount — the client never archives on stale data.
- **EC-2** A write-off is posted concurrently with a payment for the same amount: both are appends; the balance ends at −₹2,300 (over-credited) and the party is archived with a negative balance (BR-9). The audit trail shows both; the user corrects with LED-03.
- **EC-3** Party archived while an invoice for them is still `draft`: allowed; the draft keeps the party reference and, when the user tries to issue it, SAL-02 blocks with 409 `party_archived` and offers **Restore {name}**.
- **EC-4** Party archived while a payment is unallocated (advance): the advance is part of the balance, so the balance is non-zero and archive is blocked — correct behaviour.
- **EC-5** Archiving a supplier with open purchase bills: same rule via the negative balance.
- **EC-6** Restore at the plan limit: 403 `plan_limit_reached` with the PLT-15 dialog; the user archives someone else or upgrades.
- **EC-7** Restoring a party whose mobile was meanwhile taken by a new party: impossible — the unique index spans archived rows, so the second party could never have been created with that mobile (PTY-01 FR-5). Restore therefore never conflicts.
- **EC-8** Undo pressed after the snackbar's 10 s (the user re-opens the Archived tab): plain Restore, same outcome, different audit `metadata.via`.
- **EC-9** Bulk archive where all 30 have balances: 200 with `archived: []` and 30 skipped; the snackbar reads "0 archived · 30 skipped" and the details dialog opens automatically.
- **EC-10** Archive of the only party in the tenant: allowed; the Active tab shows the first-use empty state again, which correctly invites adding a party.
- **EC-11** A scheduled auto-reminder (LED-07 `auto_d1`) exists for the archived party and the nightly job runs before the cancellation commits: impossible — cancellation is in the same transaction as the status change, and the job filters on `party.status='active'` as a second guard.
- **EC-12** Share link opened after archive: the public endpoint returns 410 `link_revoked` with a neutral page "This link is no longer available" (no party data leaks).
- **EC-13** Write-off `entry_date` earlier than an existing entry: allowed (back-dating is legal), and the running balances after it shift (PTY-03 BR-2); the archive still checks the *current* balance, not the balance as of that date.
- **EC-14** Tenant has `ledger.credit_limit_mode='block'` and the write-off would be a debit (negative balance case): credit-limit checks do not apply to write-offs (PTY-06 BR-7).

#### 14. API Requirements
- `POST /parties/{id}/archive` — body `{ reason?: string, write_off?: { reason: string, entry_date: "YYYY-MM-DD" } }`. 200 `{ data: party, meta: { write_off_entry_id?: uuid, cancelled_reminders: 2, revoked_links: 1 } }`. Errors: 409 `party_balance_nonzero` (`details = { balance, balance_label, suggestion }`), 409 `party_already_archived`, 403 `permission_denied`, 404. Accepts `Idempotency-Key` (a replayed archive returns the original 200 rather than a 409).
- `POST /parties/{id}/restore` — no body. 200 `{ data: party }`. Errors: 409 `party_not_archived`, 403 `plan_limit_reached` (`details.limit_key='max_parties'`), 404.
- `POST /parties/bulk-archive` — **new endpoint, CCR-24** — `{ ids: uuid[], reason?: string }` → 200 `{ data: { archived: uuid[], skipped: [{ id, name, code, balance }] }, meta: { archived_count, skipped_count, cancelled_reminders, revoked_links } }`. 400 on > 200 ids.
- **Delta to §22.4 (CCR-24)**: `GET /parties/{id}` gains `summary.entry_count` and `summary.scheduled_reminders` so the confirm dialog can state consequences without an extra call; `GET /parties` gains nothing (the `status=archived` filter already exists).
- Error-code registration: `party_already_archived`, `party_not_archived` are added to the Part 22 §22.1 stable code list (CCR-24). `party_balance_nonzero` already exists.
- Frontend: `partyService.archiveParty(id, body)`, `restoreParty(id)`, `bulkArchiveParties(body)`; thunks `archiveParty`, `restoreParty`, `bulkArchiveParties`; on fulfilled they dispatch `partyListSlice.actions.rowRemoved|rowUpserted`, `partyDetailSlice.actions.partyUpserted`, `partyTimelineSlice.actions.entryPrepended` (write-off row) and `snackbarSlice.actions.show` with the undo action descriptor.

#### 15. Database Impact
Writes: `parties_party.status` (+ `balance` when a write-off is posted), `ledger_entry` (one `write_off` row, insert only), `ledger_reminder.status` (bulk update of `scheduled` rows for the party), `parties_share_link.revoked_at`, `platform_audit_log` (1–3 rows). Reads: `parties_party` by PK `FOR UPDATE`; `COUNT(*)` on `ledger_entry` for the consequence text (index `(tenant_id, party_id, entry_date, created_at)`); `COUNT(*)` on `ledger_reminder` by `IX(party_id, created_at DESC)`; plan counter on restore. Indexes: the existing `IX(tenant_id, status, last_activity_at DESC)` serves the Archived tab; no new index is required, though the partial `IX(tenant_id, status, balance DESC)` proposed in PTY-02 §15 (CCR-21) also helps the Archived tab's balance sort. Bulk archive uses one `UPDATE … WHERE id = ANY(%s) AND balance = 0 AND status='active' RETURNING id` so the skip set is computed by the database rather than by a read-then-write race.

#### 16. Audit Requirements
- `party.archived` — `entity_type='party'`, `entity_id`, `before = { status: 'active', balance }`, `after = { status: 'archived', balance }`, `metadata = { reason, via: 'detail'|'list'|'bulk'|'form', cancelled_reminders, revoked_links, request_id, ip }`.
- `party.restored` — mirrored, `metadata.via` includes `'undo'` when triggered by the snackbar.
- `ledger.entry.created` for the write-off row (full row snapshot per Part 21 §21.7), `metadata = { via: 'party_archive', write_off: true }`.
- `party.share_link.revoked` — one row per revoked link, `metadata.via='party_archive'`.
- `reminder.cancelled` — one summary row `metadata = { count, via: 'party_archive' }` rather than one per reminder (volume).
Bulk archive writes one `party.archived` row per successfully archived party (so per-party history stays queryable) plus one `party.bulk_archived` summary row with `metadata = { requested, archived, skipped, reason }`.

#### 17. Notifications
No message is ever sent to the party — archiving is an internal bookkeeping action and telling a customer "you have been archived" would be both confusing and a privacy oddity. In-app: when a bulk archive of more than 50 parties is run, a `notifications_notification` `type='bulk_done'` is written for the actor with title "Clean-up finished" and body "{archived} archived, {skipped} skipped", `data.route='/parties?tab=archived'`. Scheduled reminders that are cancelled produce no notification (the user caused them). Not applicable otherwise.

#### 18. Analytics / Event Tracking
`ub.parties.archive_attempted { via: 'detail'|'list'|'bulk'|'form', had_balance: bool, balance_bucket }`; `ub.parties.archive_blocked { balance_label, balance_bucket, chosen_action: 'payment'|'write_off'|'cancel'|null }`; `ub.parties.archived { via, with_write_off: bool, write_off_bucket?, entry_count_bucket, cancelled_reminders, revoked_links }`; `ub.parties.write_off_posted { amount_bucket, direction, days_since_last_entry }`; `ub.parties.archive_undone { seconds_after }`; `ub.parties.restored { via: 'tab'|'detail'|'undo', days_archived }`; `ub.parties.bulk_archived { requested, archived, skipped }`; `ub.parties.restore_blocked_plan {}`.

#### 19. Security
All three endpoints are tenant-scoped; cross-tenant ids 404. `parties.party.delete` is checked before anything else; the write-off path additionally checks `ledger.entry.write`, so a role that can archive but not post entries cannot manufacture a ledger row. The whole operation is one `transaction.atomic()` with `SELECT … FOR UPDATE` on the party, preventing a TOCTOU between the balance check and the status change (EC-1's 409 is produced *inside* the lock). Bulk archive bounds the id list at 200 and filters by tenant in SQL, so an id from another tenant is silently absent from `archived` and appears in neither list (no existence oracle). Revoking share links on archive prevents a former customer's public statement page from outliving the relationship. Reasons are free text: stripped of control characters, length-capped, stored in `platform_audit_log.metadata` and `ledger_entry.reason`, and never interpolated into HTML without escaping. Rate limits: 60 archive/restore calls per minute per user; 10 bulk-archive calls per hour per tenant.

#### 20. Performance
Single archive: 1 lock + 1 update + up to 3 small writes + 2 counts = ≤ 8 statements, P95 ≤ 300 ms. The consequence counts are the only reads that can grow with data; both are index-only counts and are additionally capped — `entry_count` is reported as "500+" when it exceeds 500 so the count query can use `LIMIT 501`. Bulk archive is a single set-based `UPDATE … RETURNING` plus two set-based updates for reminders and links, so 200 parties cost 3 statements, not 600; the audit rows are written with `bulk_create`. The Archived tab reuses the PTY-02 query path with `status='archived'` and the same indexes.

#### 21. Testing
- **T-PTY-04-1** unit: write-off direction and amount derived from the balance sign (+2,300 → credit 2,300; −900 → debit 900; 0 → no entry).
- **T-PTY-04-2** unit: `archiveSchema` / `writeOffSchema` reject a 2-character reason, a future date and an unticked acknowledgement.
- **T-PTY-04-3** API: archive a settled party → 200, `status='archived'`, audit `party.archived`, ledger untouched.
- **T-PTY-04-4** API: archive with balance ₹0.01 → 409 `party_balance_nonzero` with `details.balance="0.01"`.
- **T-PTY-04-5** API: archive with write-off → one `ledger_entry(entry_type='write_off', direction='credit', amount='2300.00')`, `party.balance='0.00'`, `status='archived'`, two audit rows, `meta.write_off_entry_id` returned.
- **T-PTY-04-6** API: archive cancels `scheduled` reminders and revokes unexpired share links; already `sent`/`done` reminders are untouched.
- **T-PTY-04-7** API: archive is idempotent under a replayed `Idempotency-Key`; a second archive without the key → 409 `party_already_archived`.
- **T-PTY-04-8** API: restore → `status='active'`; restoring an active party → 409 `party_not_archived`; restoring at `max_parties` → 403 `plan_limit_reached`.
- **T-PTY-04-9** API (concurrency): two parallel archive requests — one succeeds, one gets 409; an entry posted between the balance read and the update cannot slip through (row lock), asserted with a `pg_advisory`-free `select_for_update` test using two connections.
- **T-PTY-04-10** API: bulk archive of 10 ids where 3 have balances → `archived_count=7`, `skipped` lists 3 with their balances and codes; 201 ids → 400.
- **T-PTY-04-11** API: archived party is absent from `GET /parties` (default), present with `status=archived`, absent from the party picker query, present in `GET /reports/receivables-aging?include_archived=true` and in the day book.
- **T-PTY-04-12** permission: staff archive → 403; accountant archive → 403; owner without `ledger.entry.write` (override) attempting write-off → 403.
- **T-PTY-04-13** component: confirm dialog renders the consequence counts and does **not** autofocus the destructive button; the blocked variant swaps in place and offers all three actions.
- **T-PTY-04-14** component: write-off dialog keeps the destructive button disabled until the reason is ≥ 3 chars and the checkbox is ticked.
- **T-PTY-04-15** component: the snackbar shows Undo for a plain archive and omits it after a write-off.
- **T-PTY-04-16** E2E: archive a party with ₹2,300 via Record payment → dialog reopens → archive succeeds → the party appears in the Archived tab with balance ₹0.
- **T-PTY-04-17** E2E: archive with write-off → the khata timeline shows a "Write-off" row dated today with the reason, and RPT-06 counts it as a bad debt.
- **T-PTY-04-18** E2E: a public statement link stops working (410) immediately after the party is archived.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a party with balance ₹0, when I archive them with the confirmation, then they disappear from the Active tab, appear in the Archived tab with an "Archived" badge, and their transactions remain readable.
- **AC-2 (US-2)** Given a party who owes ₹2,300, when I try to archive them, then the dialog says "{name} still owes you ₹2,300" and offers Record payment, Write off ₹2,300 and Cancel, and nothing is archived.
- **AC-3 (US-3)** Given the same party and owner rights, when I choose Write off ₹2,300, enter a reason and tick the acknowledgement, then a single `write_off` ledger entry of ₹2,300 is posted, the balance becomes ₹0, the party is archived and the snackbar offers no Undo.
- **AC-4 (US-4)** Given an archived party, when I restore them, then they reappear in the Active tab at their correct position by last activity and their existing khata continues with the same balance.
- **AC-5 (US-5)** Given an archived party with past invoices, when I run the sales register and the party statement for those dates, then their rows are included.
- **AC-6 (US-6)** Given 30 selected parties of which 4 have balances, when I bulk archive, then 26 are archived, 4 are listed as skipped with their balances, and no write-off is posted for any of them.
- **AC-7 (US-7)** Given any archive or restore, when I open the audit log filtered to that party, then I see who did it, when, from where, the reason, and the before/after status.

#### 23. Dependencies
PTY-01 (party record, duplicate-mobile restore offer), PTY-02 (row menu, Archived tab, bulk selection, counts), PTY-03 (detail banner, timeline showing the write-off row), PTY-06 (credit-limit bar hidden for archived parties), PTY-08 (merge sets `deleted_at`, a different mechanism), LED-01 (record payment from the blocked dialog), LED-03 (correcting a write-off), LED-06/LED-07 (reminder cancellation), PLT-15 (`max_parties` on restore), PLT-08 (audit viewer surfaces these actions), SAL-02/PUR-01 (issue blocked for archived parties), RPT-05/RPT-06 (write-offs in reports), `UbConfirmDialog`, `UbReasonDialog`, `UbSnackbar`, `UbStatusBadge`, `UbStatusBanner`.

#### 24. Future Enhancements
Auto-archive suggestion for parties with zero balance and no activity for 12 months, offered as a reviewable batch (P2); a "Dormant" state distinct from Archived that keeps the party in pickers but out of collection lists (P3); bulk write-off with a per-party review table for year-end bad-debt clean-up, feeding a bad-debt report (P3); restoring a merged party (PTY-08 un-merge) which is deliberately **not** supported at Phase 2; tenant setting for an archive-approval workflow in multi-user shops (P3); GST-compliant bad-debt adjustment entries when the law permits ITC reversal on written-off receivables (P3, needs tax review).

---

### PTY-05 — Tags & groups

#### 1. Business Objective
Indian small businesses organise their parties by geography and by route long before they organise them by anything else: "Camp Area", "Monday route", "Deccan line", "wholesale rate", "sabzi mandi". A distributor with 400 retailers plans a collection day by area, not alphabetically. Tags give that structure without forcing a rigid hierarchy on to a business whose categories change every season, and they are the cheapest possible feature to build (two small tables, one filter) with a disproportionate effect on the daily workflow of PTY-02. Success measures: ≥ 40 % of tenants with more than 50 parties create at least one tag within 30 days; ≥ 25 % of party-list sessions in those tenants apply a tag filter; tag creation from the party form takes ≤ 2 interactions; zero duplicate tags differing only in case or trailing space.

#### 2. User Personas
OW (creates, renames, deletes, assigns), ST (assigns existing tags to parties; may create new ones only when `parties.tags.staff_create` is on — default on, since blocking it creates friction at the counter), AC (read-only; tags appear in exports).

#### 3. User Stories
1. **US-PTY-05-1** — As a distributor, I want to tag parties with their area so that I can work through one area at a time.
2. **US-PTY-05-2** — As an owner, I want to create a tag while adding a party so that I do not have to set up a taxonomy first.
3. **US-PTY-05-3** — As an owner, I want to filter my party list by one or more tags so that I see only that group and its totals.
4. **US-PTY-05-4** — As an owner, I want to rename a tag everywhere at once so that fixing a spelling does not mean editing 60 parties.
5. **US-PTY-05-5** — As an owner, I want to apply a tag to many parties at once so that organising an existing list is fast.
6. **US-PTY-05-6** — As an owner, I want to give tags colours so that I can recognise them at a glance in the list.
7. **US-PTY-05-7** — As an owner, I want to delete a tag I no longer use without losing the parties so that cleaning up is safe.
8. **US-PTY-05-8** — As an accountant, I want tags in the party export and in the aging report so that I can group receivables by area.

#### 4. Functional Requirements
- **FR-1** Data model (Part 21 §21.3.3): `parties_tag` (`tenant_id`, `name varchar(40)`, `color varchar(7)`) with `U(tenant_id, name)`, and the join `parties_party_tag` (`party_id`, `tag_id`) with `U(party_id, tag_id)`. Tags are flat — there is no parent/child at MVP (groups are Phase 2, §24).
- **FR-2** CRUD endpoints (**new, CCR-25**): `GET /parties/tags?q=&ordering=name|-party_count` → `[{ id, name, color, party_count }]`; `POST /parties/tags { name, color? }` → 201; `PATCH /parties/tags/{id} { name?, color? }` → 200; `DELETE /parties/tags/{id}` → 204 (removes the join rows, never the parties).
- **FR-3** Case-insensitive uniqueness: the service looks up by `lower(trim(name))` and creates only when absent, preserving the casing the user first typed for display (PTY-01 BR-9). A `POST` of an existing name returns **200** with the existing tag (idempotent create) rather than a 409 — creating a tag is a convenience, not a transaction. A `PATCH` that would collide with another tag returns 409 `tag_name_taken` with `details.existing_tag_id` and the option to merge (FR-10).
- **FR-4** Assignment from the party form (PTY-01 FR-12): `tags: string[]` of names on `POST`/`PATCH /parties`; unknown names are created inside the same transaction via `get_or_create(tenant_id, lower(name))`; the set is **replaced**, not merged, on `PATCH` when the key is present (omitting the key leaves tags untouched). Max 10 tags per party.
- **FR-5** `TagInput` component (feature component in `features/parties/components/TagInput.tsx`, built on `UbCombobox` + `MLBadge`): shows assigned tags as removable chips; typing filters existing tags by prefix then trigram; an unmatched query offers "Create '{query}'" which adds the chip immediately (optimistic, created server-side on form save); Backspace on an empty input removes the last chip; the picker lists the 20 most-used tags first when the query is empty.
- **FR-6** Tag filter on PTY-02 (FR-6 of that feature): a multi-select `UbCombobox` in the toolbar sending `tag=Camp Area,Route 2`; semantics are **OR within the tag group** and AND against other filters (BR-4). Selected tags render as `UbFilterTag` chips; the party-list totals are recomputed over the filtered set as always.
- **FR-7** Tag manager: `app/(app)/parties/tags/page.tsx` → `<PartyTagsPageContent/>`, reachable from the party list overflow menu ("Manage tags") and from Settings → Parties. A `UbDataGrid` of tags with columns Name (editable inline), Colour (swatch picker), Parties (count, links to the list filtered by that tag), Actions (Rename, Change colour, Merge into…, Delete). Header action "New tag".
- **FR-8** Bulk assign: from PTY-02's desktop selection bar, **Add tag** opens `UbDialog` with a `UbCombobox` (existing or create-inline) and a radio choice **Add to selected** / **Replace tags on selected**; it calls `POST /parties/bulk-tag` (**new, CCR-25**) `{ party_ids[] | filter{}, tag_ids[] | tag_names[], mode: 'add'|'replace' }` → `{ data: { updated_count, created_tags: [...] } }`. Max 200 ids, or a filter object equivalent to the current query for "all matching" (capped at 5,000 parties, beyond which the response is 400 `too_many_rows` with a suggestion to narrow the filter).
- **FR-9** Undo for bulk assign: the completion snackbar carries **Undo** for 10 s, which issues the inverse call (`mode:'remove'` with the same ids and tag) — the client keeps the exact id list from the response to make the inverse precise even if the filter has since changed.
- **FR-10** Merge tags: `POST /parties/tags/{id}/merge { into_tag_id }` re-points every `parties_party_tag` row from the source tag to the target (ignoring rows that would duplicate), deletes the source tag, and returns `{ data: target_tag, meta: { moved, skipped_duplicates } }`. Offered from the tag manager and from the 409 of FR-3.
- **FR-11** Delete: `DELETE /parties/tags/{id}` shows a `UbConfirmDialog` "Delete tag '{name}'? It will be removed from {n} parties. The parties stay." Deletion cascades only the join rows. No undo (the copy is explicit); a deleted tag name may be recreated immediately.
- **FR-12** Colours: `color` is a hex string validated against `^#[0-9A-Fa-f]{6}$`, chosen from a fixed palette of 8 tokens (`--viz-1…8`) presented as swatches, with "No colour" (NULL) as the default. Free hex entry is not offered at MVP (it would break contrast guarantees); chips render as `MLBadge` with the colour at 12 % alpha background and the colour at full strength for the text, which the palette guarantees to pass 4.5:1 on the card surface.
- **FR-13** Tag limits: 200 tags per tenant (`plan_limit_reached` is not used; a plain 400 `tag_limit_reached` with "You can have up to 200 tags" is returned) and 10 tags per party. Both are enforced server-side and mirrored in the client's validation.
- **FR-14** Tags appear in: the party list row (first chip + "+n" overflow), the party detail header, the party CSV export column `tags` (semicolon-separated), the receivables/payables aging report filter (`?tag=`), the reminder bulk selector (LED-06 — "remind everyone in Camp Area"), and PTY-10's import file (a `tags` column, semicolon-separated, creating missing tags).
- **FR-15** Renaming a tag is a single `UPDATE` on `parties_tag`; every party that carries it shows the new name immediately because the join stores the id, not the name.

#### 5. Non-Functional Requirements
Tag picker opens in ≤ 100 ms with the top-20 list preloaded into `partyTagSlice` at app start (one request, cached for the session, invalidated by any tag mutation). `GET /parties/tags` P95 ≤ 120 ms with the `party_count` annotation at 200 tags × 10,000 parties. Bulk tag of 200 parties ≤ 1.5 s, of 5,000 parties ≤ 8 s (set-based SQL, one statement). Chips must not cause layout shift in the list: the row reserves a fixed 24 px chip lane. Accessibility: chips are `role="listitem"` inside a labelled list; the remove button on a chip has an accessible name "Remove tag {name}"; the colour swatch picker is keyboard-navigable and every swatch has a name ("Blue", "Teal", "Purple"…) so colour is never the only signal. `en`/`hi` copy; tag names themselves are user content and are never translated.

#### 6. User Flow
Primary (tag while adding a party): PTY-01 drawer → Tags field → type "Camp" → no match → "Create 'Camp Area'" → chip appears → Save → tag row created and linked in the same transaction.
Alternate A (filter): Parties → tag filter → choose "Camp Area" → list and totals narrow → the chip is removable.
Alternate B (bulk organise): desktop, filter to `type=customer`, select 40 rows → Add tag → choose "Route 2" → Add to selected → snackbar "Tag added to 40 parties · Undo".
Alternate C (rename): Parties ⋯ → Manage tags → click the name cell → type the corrected spelling → Enter → every party shows the new name.
Alternate D (merge): tag manager → "Camp area" ⋯ → Merge into… → choose "Camp Area" → confirm ("12 parties will move; 3 already have the target tag") → source tag disappears.
Alternate E (delete): tag manager → ⋯ → Delete → confirm with the party count → tag gone, parties intact.
Alternate F (limit): creating the 201st tag → 400 `tag_limit_reached` with a dialog suggesting merging unused tags, and a link to the manager sorted by ascending party count.

#### 7. UI Requirements
Components: `TagInput` (`UbCombobox` + `MLBadge` chips + create-inline), `TagFilterCombobox` (multi-select variant used by PTY-02), `PartyTagsPageContent` (`UbPageShell` + `UbPageHeader` + `UbDataGrid`), `TagFormDialog` (`UbDialog` with name `MLInput` + colour swatch `MLRadioGroup`), `TagMergeDialog` (`UbDialog` with a target `UbCombobox` and a consequence line), `UbConfirmDialog` for delete, `BulkTagDialog` (`UbDialog` with `UbCombobox` + `MLRadioGroup` for add/replace).

Chip rendering (`UbStatusBadge`-adjacent but distinct — tags are not statuses, so they use `MLBadge variant="outline"` with the tag colour): 20 px tall, `ds-label` casing preserved (**not** uppercased — tag names are user content), max width 120 px with ellipsis, `MLTooltip` with the full name.

Mobile (< 640 px): the tag manager is a card list rather than a grid, each card showing name, colour dot, party count and a ⋯ menu; the bulk dialog is a bottom sheet; `TagInput` expands the combobox to a full-screen sheet when more than 12 tags exist so the list is comfortably scrollable.

Desktop (≥ 1024 px): the tag manager grid supports inline rename (click-to-edit cell, Enter commits, Esc cancels), column sort by name or party count, and a search field. The tag filter combobox shows counts next to each tag name ("Camp Area · 34").

Keyboard: in `TagInput`, `Enter` accepts the highlighted suggestion or creates the typed name, `,` also commits a chip, `Backspace` on empty removes the last chip, `Esc` closes the popover without committing.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `parties.tags.title` | Tags | टैग |
| `parties.tags.manage` | Manage tags | टैग प्रबंधित करें |
| `parties.tags.new` | New tag | नया टैग |
| `parties.tags.field` | Tags | टैग |
| `parties.tags.field.hint` | Group parties by area, route or type | क्षेत्र, रूट या प्रकार से पार्टियाँ समूह में रखें |
| `parties.tags.placeholder` | Add a tag | टैग जोड़ें |
| `parties.tags.create` | Create "{name}" | "{name}" बनाएँ |
| `parties.tags.name` | Tag name | टैग का नाम |
| `parties.tags.color` | Colour | रंग |
| `parties.tags.color.none` | No colour | कोई रंग नहीं |
| `parties.tags.partyCount` | {count, plural, one {# party} other {# parties}} | {count} पार्टियाँ |
| `parties.tags.rename` | Rename | नाम बदलें |
| `parties.tags.merge` | Merge into… | इसमें मिलाएँ… |
| `parties.tags.merge.confirm` | Move {moved} parties to "{target}"? {skipped} already have it. | {moved} पार्टियाँ "{target}" में ले जाएँ? {skipped} के पास यह पहले से है। |
| `parties.tags.delete` | Delete tag | टैग हटाएँ |
| `parties.tags.delete.confirm` | Delete "{name}"? It will be removed from {count} parties. The parties stay. | "{name}" हटाएँ? यह {count} पार्टियों से हट जाएगा। पार्टियाँ बनी रहेंगी। |
| `parties.tags.deleted` | Tag deleted | टैग हट गया |
| `parties.tags.taken` | A tag called "{name}" already exists | "{name}" नाम का टैग पहले से है |
| `parties.tags.taken.merge` | Merge them | उन्हें मिलाएँ |
| `parties.tags.limitTag` | You can have up to 200 tags | आप अधिकतम 200 टैग रख सकते हैं |
| `parties.tags.limitPerParty` | Up to 10 tags per party | प्रति पार्टी अधिकतम 10 टैग |
| `parties.tags.bulk.title` | Add tag to {count} parties | {count} पार्टियों में टैग जोड़ें |
| `parties.tags.bulk.modeAdd` | Add to their existing tags | उनके मौजूदा टैग में जोड़ें |
| `parties.tags.bulk.modeReplace` | Replace their tags | उनके टैग बदलें |
| `parties.tags.bulk.done` | Tag added to {count} parties | {count} पार्टियों में टैग जुड़ा |
| `parties.tags.bulk.undone` | Undone | वापस लिया गया |
| `parties.tags.empty.title` | No tags yet | अभी कोई टैग नहीं |
| `parties.tags.empty.body` | Tags group parties by area or route. Create one from any party. | टैग पार्टियों को क्षेत्र या रूट से समूह में रखते हैं। किसी भी पार्टी से बनाएँ। |
| `parties.tags.filter.label` | Tag | टैग |

Copy rules: "Tag" is used everywhere; "group" is reserved for the Phase 2 entity so the words do not blur. Deletion copy always states what survives ("The parties stay") because merchants fear that deleting a label deletes the people. Colour is never described by colour alone in copy. No confirmation for adding or removing a single tag from a party (it is trivially reversible); confirmation for delete and merge.

#### 9. States
**Initial** — tag manager: skeleton grid (6 rows); `TagInput`: empty with placeholder. **Loading** — combobox shows `MLSpinner` inside the popover while the first fetch resolves; subsequent opens are instant from `partyTagSlice`. **Empty** — manager: first-use `UbEmptyState` with "Create your first tag"; combobox with no tags: the create-inline row only. **Success** — chip added/removed with a 140 ms fade; manager row updates in place after inline rename. **Error** — create/rename failure shows the message inline under the field and keeps the popover open; bulk failure shows `UbStatusBanner` in the dialog with `request_id`. **Disabled** — accountant sees the manager read-only (no New tag, no row actions); staff without `parties.tags.staff_create` sees the picker without the "Create" row and a hint "Ask the owner to add new tags". **Partial** — bulk tag partially applied (some parties archived meanwhile): completion snackbar "Added to 38 of 40" with **See details**. **Processing** — bulk dialog's confirm button shows `MLSpinner` + "Adding…"; the dialog is not dismissible. **Completed** — snackbar with Undo. **Failed** — nothing applied (single transaction); the dialog stays open with Retry.

#### 10. Validation Rules
| Field | Rule | Message (en) | Code |
|---|---|---|---|
| `name` | required, trimmed, 1–40 chars, inner whitespace collapsed, control chars stripped | Enter a tag name (1–40 characters) | `validation_error` (`details.name`) |
| `name` | must not be only punctuation/whitespace after trim | Enter a tag name | `validation_error` |
| `name` | case-insensitively unique per tenant (on PATCH) | A tag called "{name}" already exists | `tag_name_taken` (409, `details.existing_tag_id`) |
| `color` | `^#[0-9A-Fa-f]{6}$` or null; must be one of the 8 palette values | Choose a colour from the palette | `validation_error` (`details.color`) |
| tenant tag count | ≤ 200 | You can have up to 200 tags | `tag_limit_reached` (400) |
| tags per party | ≤ 10 | Up to 10 tags per party | `validation_error` (`details.tags`) |
| `tag_ids` / `tag_names` (bulk) | 1–5 tags per call; all in tenant | Choose up to 5 tags | `validation_error` |
| `party_ids` (bulk) | 1–200 uuids, or `filter` with ≤ 5,000 matches | Select up to 200 parties, or narrow the filter | `validation_error` / `too_many_rows` (400) |
| `mode` (bulk) | ∈ `add`, `replace`, `remove` | Unknown mode | `validation_error` |
| `into_tag_id` (merge) | exists, in tenant, ≠ source | Choose a different tag to merge into | `validation_error` |

Yup: `tagNameValidation() = string().trim().min(1).max(40).matches(/\S/).required()`; `tagSchema = object({ name: tagNameValidation(), color: string().nullable().oneOf(TAG_PALETTE) })`; party form uses `array().of(tagNameValidation()).max(10)`.

#### 11. Business Rules
- **BR-1** Tag names are case-insensitively unique per tenant; the first-entered casing is preserved for display (canonical lookup key is `lower(trim(name))`).
- **BR-2** Tags are tenant-scoped; two tenants may both have "Camp Area" and they are unrelated rows.
- **BR-3** A party may carry 0–10 tags; a tag may carry any number of parties.
- **BR-4** The tag filter is **OR within the group**: `tag=A,B` returns parties with A or B (or both), counted once. It is AND against all other filters. This matches how a user thinks about "show me Camp Area and Deccan today".
- **BR-5** Deleting a tag deletes only `parties_party_tag` rows; parties are never touched, and no ledger or document data references tags.
- **BR-6** Merging is one-directional and destructive to the source tag; duplicates are skipped silently and reported in `meta.skipped_duplicates`.
- **BR-7** Renaming is global by construction (the join stores the id); there is no per-party tag name.
- **BR-8** Tags carry no behaviour: they never change pricing, tax, reminders or permissions. They are exclusively a filter/label dimension. (Price lists per party are INV-13, a different mechanism.)
- **BR-9** Archived parties keep their tags and are excluded from `party_count` on `GET /parties/tags` by default; `?include_archived=true` includes them (used by the tag manager's "Parties" column tooltip).
- **BR-10** Tag colour is presentational only; when `color` is NULL the chip renders with `--border-subtle` and `--text-secondary`.
- **BR-11** Bulk `replace` removes every existing tag from the selected parties before adding the chosen ones; the confirm copy states this explicitly, and Undo restores the previous sets (the response returns the prior tag ids per party so the inverse is exact — capped at 200 parties, which is why `replace` is not offered in the "all matching" mode).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View tags, filter by tag | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| Assign/remove a tag on a party | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Create a tag | `parties.party.write` (+ setting `parties.tags.staff_create` for staff) | ✅ | ✅ | ✅* | ❌ |
| Rename / recolour a tag | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Merge tags | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Delete a tag | `parties.party.delete` | ✅ | ✅ | ❌ | ❌ |
| Bulk tag | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Tags in export | `parties.party.export` | ✅ | ✅ | ❌ | ✅ |

*Staff tag creation is governed by the tenant setting `parties.tags.staff_create` (boolean, default `true`, added to §21.3.1's well-known keys by **CCR-26**). Rename/merge/delete are deliberately owner/admin-only because they change what every other user sees. No new permission codenames are introduced — tags reuse the party codenames (canon §0.9 is unchanged).

#### 13. Edge Cases
- **EC-1** "camp area" typed when "Camp Area" exists: the picker matches case-insensitively and shows the existing tag at the top; the "Create" row is suppressed for an exact case-insensitive match.
- **EC-2** Trailing/leading spaces ("Camp Area "): trimmed before the uniqueness lookup, so no duplicate is possible.
- **EC-3** Two staff create the same new tag simultaneously from two party forms: `get_or_create` plus the unique index means one wins; the other's `IntegrityError` is caught and re-read, so both parties end up on the same tag.
- **EC-4** A tag with an emoji or Devanagari name: allowed (1–40 characters, any script); the chip renders with the Devanagari fallback font and a 1.5 line-height so matras are not clipped.
- **EC-5** 10 tags already on a party: the picker disables further selection with the hint "Up to 10 tags per party" rather than failing on save.
- **EC-6** Tag deleted while another user has it selected in a filter: the list request ignores unknown tag names (PTY-02 FR-6), the chip is dropped and a snackbar says "Tag removed".
- **EC-7** Bulk tag over "all matching" where the filter yields 6,000 parties: 400 `too_many_rows` with `details.count=6000` and the copy "Narrow the filter to 5,000 parties or fewer".
- **EC-8** Bulk `replace` on parties that had no tags: they simply gain the new set; Undo restores them to empty.
- **EC-9** Undo pressed after some of the parties were archived: the inverse call still removes the tag from them (tags on archived parties are editable — archiving restricts PATCH to notes and tags per PTY-01 FR-2).
- **EC-10** Merge of a tag into itself: rejected by validation (`into_tag_id ≠ source`).
- **EC-11** Merge where every party already has the target: `moved=0`, `skipped_duplicates=n`, source deleted; the copy handles the zero case ("No parties needed moving. 'Camp area' was deleted.").
- **EC-12** A tag name that looks like a filter value ("active", "archived") is harmless — the tag filter is a separate parameter and names are never parsed as enums.
- **EC-13** 200-tag limit reached with many unused tags: the error dialog links to the manager sorted by ascending `party_count` so the user can delete or merge the dead ones.
- **EC-14** Tag name containing a comma ("Camp, East"): the list filter serialises tags as a comma list, so a comma in a name would break the round-trip. The name validator **rejects commas and semicolons** with "Tag names cannot contain , or ;" (also protecting the semicolon-separated CSV export column).

#### 14. API Requirements
- **New endpoints (CCR-25)**, added to Part 22 §22.4:
  - `GET /parties/tags?q=&ordering=name|-party_count|party_count&include_archived=false` → `{ data: [ { id, name, color, party_count } ], meta: { total } }` (no pagination — capped at 200 rows).
  - `POST /parties/tags` `{ name, color? }` → 201 new, or **200** with the existing tag when the name already exists (idempotent create, FR-3).
  - `PATCH /parties/tags/{id}` `{ name?, color? }` → 200; 409 `tag_name_taken` with `details.existing_tag_id`.
  - `DELETE /parties/tags/{id}` → 204; `?dry_run=true` → 200 `{ data: { party_count } }` used by the confirm dialog.
  - `POST /parties/tags/{id}/merge` `{ into_tag_id }` → 200 `{ data: tag, meta: { moved, skipped_duplicates } }`.
  - `POST /parties/bulk-tag` `{ party_ids?: uuid[], filter?: {…party list params}, tag_ids?: uuid[], tag_names?: string[], mode: 'add'|'replace'|'remove' }` → 200 `{ data: { updated_count, created_tags: [tag], previous: [ { party_id, tag_ids } ]? }, meta: { skipped: [{id, reason}] } }`. `previous` is returned only for `mode='replace'` with explicit `party_ids` (BR-11) so the client can build an exact Undo.
- **Deltas**: `GET /parties?tag=` documented as a comma list with OR semantics (also listed in PTY-02 §14, CCR-20); `GET /reports/receivables-aging?tag=` and `/payables-aging?tag=` gain the same filter (CCR-25); `POST /reminders/bulk` accepts `{ filter: { tag: "Camp Area" } }` in place of `party_ids` (LED-06).
- Error codes registered: `tag_name_taken`, `tag_limit_reached`, `too_many_rows` (CCR-25).
- Frontend: `partyService.listTags(params)`, `createTag`, `updateTag`, `deleteTag(id, {dryRun})`, `mergeTags(id, body)`, `bulkTag(body)`; thunks `fetchPartyTags`, `savePartyTag`, `deletePartyTag`, `mergePartyTags`, `bulkTagParties`; slice `partyTagSlice` (`tags`, `byId`, `topUsed`, `status`), invalidated on any mutation and on `createParty`/`updateParty` fulfilment when `meta.created_tags` is present.

#### 15. Database Impact
Writes: `parties_tag` (insert/update/delete), `parties_party_tag` (insert/delete, `bulk_create(ignore_conflicts=True)` for bulk add; a single `DELETE … WHERE party_id = ANY(%s)` for replace), `platform_audit_log`. Reads: `parties_tag` by `U(tenant_id, name)` and a `Count('parties')` annotation for `party_count`; `parties_party_tag` by `U(party_id, tag_id)`; the party list's tag filter uses `EXISTS (SELECT 1 FROM parties_party_tag pt JOIN parties_tag t ON … WHERE pt.party_id = p.id AND t.name = ANY(%s))` so the totals aggregate is not multiplied by the join (PTY-02 §15). **New indexes proposed (CCR-26)**: `IX(tag_id)` on `parties_party_tag` (the table has `U(party_id, tag_id)` which serves party→tags but not tag→parties, needed for `party_count` and for the tag filter's reverse direction), and a functional unique index `U(tenant_id, lower(name))` on `parties_tag` replacing the plain `U(tenant_id, name)` so case-insensitive uniqueness is enforced by the database rather than only by the service. Both are created `CONCURRENTLY` per Part 21 §21.8.

#### 16. Audit Requirements
- `party.tag.created` (`entity_type='party_tag'`, `after = { name, color }`), `party.tag.updated` (`before`/`after` of changed fields — a rename affects every party, so it is always audited), `party.tag.deleted` (`before = { name, color }`, `metadata = { party_count }`), `party.tag.merged` (`metadata = { source_id, source_name, into_tag_id, moved, skipped_duplicates }`).
- Per-party assignment changes are recorded inside the existing `party.updated` audit row as a changed field (`tags: { before: [...], after: [...] }`) — no separate action, to keep audit volume sane.
- Bulk: one `party.bulk_tagged` summary row (`metadata = { mode, tag_names, updated_count, skipped_count, via: 'list'|'filter' }`) plus **no** per-party rows (volume); the summary carries the id list when it is ≤ 200 so the change remains reconstructable.

#### 17. Notifications
Not applicable — tagging is an internal organisational action with no counterparty and no asynchronous work. The only exception is the bulk path: a bulk tag over a filter affecting more than 500 parties writes an in-app `notifications_notification` `type='bulk_done'` for the actor ("Tagged 1,240 parties as Camp Area") because the operation may outlive the dialog. No SMS, WhatsApp or email in any case.

#### 18. Analytics / Event Tracking
`ub.parties.tag_created { via: 'party_form'|'manager'|'bulk_dialog', name_length, has_color, tenant_tag_count }`; `ub.parties.tag_assigned { via: 'party_form'|'bulk'|'detail', tag_count_after }`; `ub.parties.tag_removed { via }`; `ub.parties.tag_renamed { party_count }`; `ub.parties.tag_recoloured { color }`; `ub.parties.tag_merged { moved, skipped_duplicates }`; `ub.parties.tag_deleted { party_count }`; `ub.parties.tag_filter_applied { tag_count, result_count }` (also emitted by PTY-02 as `list_filtered`, deduplicated by property `filter='tag'`); `ub.parties.bulk_tagged { mode, selected_count, source: 'ids'|'filter' }`; `ub.parties.bulk_tag_undone { seconds_after }`; `ub.parties.tag_limit_hit { limit: 'tenant'|'party' }`. Tag **names** are never sent (they can be personal or commercially sensitive); only lengths and counts.

#### 19. Security
Tenant scoping on every tag query; a tag id from another tenant returns 404 and is silently absent from bulk results (no existence oracle). Tag names are user content: stripped of control characters, length-capped at 40, rejected when containing `,` or `;` (EC-14), stored as plain text, and rendered as text nodes (React escapes by default) — they are also written into CSV exports, where the exporter prefixes a leading `=`, `+`, `-` or `@` with `'` to prevent spreadsheet formula injection (shared with PTY-02 export and PTY-10). Bulk endpoints bound their input (200 ids, 5,000 filtered rows, 5 tags) and run as one transaction, so a large request cannot hold locks indefinitely. Rate limits: 60 tag mutations/min/user, 10 bulk-tag calls/hour/tenant. `party_count` never leaks cross-tenant data because the annotation is filtered by the tenant-scoped manager.

#### 20. Performance
`GET /parties/tags` is 1 query with a `Count` annotation, served by the proposed `IX(tag_id)`; at 200 tags the response is ~12 KB and is cached in `partyTagSlice` for the session. The party list's tag filter adds one `EXISTS` subquery that uses the same index; CI `EXPLAIN` asserts no sequential scan on `parties_party_tag` at the 100k-party fixture. Bulk add is `bulk_create(ignore_conflicts=True)` — one statement for up to 5,000 rows; bulk replace is two statements (delete + insert). Merge is two statements (`UPDATE … ON CONFLICT DO NOTHING` then `DELETE`). Chips in the list are rendered from data already present in the list response (tags are prefetched, PTY-02 §15) — the list never issues a per-row tag request.

#### 21. Testing
- **T-PTY-05-1** unit: tag name normalisation trims, collapses inner whitespace, strips control chars, rejects empty-after-trim, rejects `,` and `;`, accepts Devanagari and 40 chars.
- **T-PTY-05-2** unit: `TagInput` suppresses the Create row on an exact case-insensitive match and disables selection at 10 chips.
- **T-PTY-05-3** API: `POST /parties/tags` with an existing name (different case) → 200 with the existing tag, no new row.
- **T-PTY-05-4** API: `PATCH` rename colliding with another tag → 409 `tag_name_taken` with `details.existing_tag_id`.
- **T-PTY-05-5** API: `DELETE` removes join rows only; the parties still exist with their other tags intact; `?dry_run=true` returns the count without deleting.
- **T-PTY-05-6** API: merge moves rows, skips duplicates, deletes the source, and returns accurate `moved`/`skipped_duplicates`.
- **T-PTY-05-7** API: creating the 201st tag → 400 `tag_limit_reached`; assigning an 11th tag to a party → 400 with `details.tags`.
- **T-PTY-05-8** API: `POST /parties` with `tags: ["Camp Area", "camp area"]` creates exactly one tag and one join row.
- **T-PTY-05-9** API: `PATCH /parties/{id}` with `tags` replaces the set; omitting `tags` leaves it unchanged.
- **T-PTY-05-10** API: `GET /parties?tag=A,B` returns the union with each party once; `party_count` excludes archived parties unless `include_archived=true`.
- **T-PTY-05-11** API: bulk tag `add` over 200 ids → one statement, `updated_count=200`; `replace` returns `previous` for an exact undo; a filter yielding 6,000 → 400 `too_many_rows`.
- **T-PTY-05-12** API (concurrency): two simultaneous creates of the same name → one row, both requests succeed.
- **T-PTY-05-13** permission: staff can assign but not rename/merge/delete; with `parties.tags.staff_create=false` the create call → 403; accountant read-only.
- **T-PTY-05-14** component: chips render with the palette colour and pass a contrast assertion; the remove button has an accessible name.
- **T-PTY-05-15** component: bulk dialog's replace mode shows the warning copy and the completion snackbar offers Undo that restores prior sets.
- **T-PTY-05-16** E2E: create a tag from the party form, filter the list by it, confirm the totals cover only tagged parties, rename it in the manager and see the new name on the list row.
- **T-PTY-05-17** E2E: CSV export contains a `tags` column with semicolon-separated names, and a name beginning with `=` is prefixed with `'`.
- **T-PTY-05-18** a11y: axe clean on the manager and the picker; swatches are keyboard-reachable and named.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given parties in different areas, when I tag 12 of them "Camp Area", then filtering by that tag lists exactly those 12 with totals covering only them.
- **AC-2 (US-2)** Given the Add party form, when I type "Camp Area" in Tags and choose "Create 'Camp Area'" and save, then the party is created with that tag and the tag exists once in the tenant.
- **AC-3 (US-3)** Given tags "Camp Area" and "Deccan", when I select both in the filter, then parties carrying either tag are listed once each.
- **AC-4 (US-4)** Given a tag misspelled as "Camp aera" on 8 parties, when I rename it in the tag manager, then all 8 rows show the corrected name without any per-party edit.
- **AC-5 (US-5)** Given 40 selected parties, when I bulk add the tag "Route 2", then all 40 carry it, the snackbar reports 40, and Undo within 10 s removes it from exactly those 40.
- **AC-6 (US-6)** Given a tag with the blue palette colour, when I look at the party list, then the chip renders in that colour with legible text and a tooltip carrying the full name.
- **AC-7 (US-7)** Given a tag on 8 parties, when I delete it after the confirmation that names the count, then the tag is gone and all 8 parties still exist with their remaining tags.
- **AC-8 (US-8)** Given tagged parties, when I export the party list and run the receivables aging with `tag=Camp Area`, then both outputs carry or respect the tag.

#### 23. Dependencies
PTY-01 (tags on the party form, `get_or_create` in the same transaction), PTY-02 (tag filter, chips on rows, bulk selection, export column), PTY-03 (chips in the header), PTY-04 (tags survive archival; archived parties excluded from counts), PTY-10 (tags column in the import template), LED-06 (bulk reminders by tag filter), RPT-05/RPT-07 (aging filtered by tag), PLT-06 (`parties.tags.staff_create` setting), `UbCombobox`, `MLBadge`, `UbDataGrid`, `UbDialog`, `UbConfirmDialog`, `UbFilterTag`, the `--viz-1…8` palette tokens (Part 23 §23.2.4), CCR-25 (endpoints) and CCR-26 (indexes and setting).

#### 24. Future Enhancements
Party **groups** as a first-class entity with a single-parent hierarchy (area → route → sub-route), a default group per party and group-level totals, replacing tags for businesses that need exclusivity (P2, `parties_group` table); system tags derived from behaviour ("Overdue 30+ days", "New this month") that cannot be edited but can be filtered (P2); tag-based default settings such as a price list or credit terms per group (P3, overlaps INV-13); colour-blind-safe pattern chips as an accessibility option (P3); tag suggestions from the billing address's locality using the pincode master (P3); bulk tag from the import preview so a CSV can organise an existing list (PTY-10 Future); saved filter views built on tag combinations (PTY-02 Future).

---

### PTY-06 — Credit limit & alerts

#### 1. Business Objective
Uncontrolled udhaar is the single largest cause of working-capital failure in Indian retail and wholesale: the shopkeeper keeps giving credit to a good customer until the amount is unrecoverable, because nothing in the paper khata says "stop". A credit limit turns an implicit, forgotten decision into an explicit one enforced at the moment of the sale. DigiKhaato makes the limit optional per party, its enforcement a tenant-wide choice (`off` / `warn` / `block`), and the interruption informative rather than obstructive — the dialog states the limit, the current balance, the amount that would exceed it and what the user can do about it. Success measures: among tenants that set at least one limit, ≥ 30 % reduction in the share of receivables aged 90+ days over two quarters; ≥ 80 % of block events resolved by either collecting a payment or a deliberate owner override (rather than abandoning the sale); median time added to a billing flow by a warning ≤ 3 s.

#### 2. User Personas
OW (sets limits, chooses the mode, is the only role that can override a block), AD (same), ST (sees warnings and blocks; can request an override but cannot grant one), AC (read-only; limits appear in exports and in the aging report).

#### 3. User Stories
1. **US-PTY-06-1** — As an owner, I want to set a maximum udhaar amount for a party so that my exposure to one customer is capped.
2. **US-PTY-06-2** — As an owner, I want to choose whether crossing the limit is a warning or a hard stop so that the rule matches how much I trust my staff.
3. **US-PTY-06-3** — As a staff member billing at the counter, I want to be told before I issue the bill that this customer is over their limit so that I can ask for payment first.
4. **US-PTY-06-4** — As an owner, I want to override a block for a genuine case so that a rule does not cost me a sale.
5. **US-PTY-06-5** — As an owner, I want to see how much of the limit is used on the party page so that I know the headroom before I agree to anything.
6. **US-PTY-06-6** — As an owner, I want a list of parties who are over or near their limit so that I can act on the whole set.
7. **US-PTY-06-7** — As an owner, I want every override recorded with who did it and why so that I can review them later.
8. **US-PTY-06-8** — As an owner, I want to set a default limit for new parties so that I do not have to set it one by one.

#### 4. Functional Requirements
- **FR-1** Storage: `parties_party.credit_limit numeric(14,2) NULL` (NULL = no limit) and `credit_days smallint NULL` (payment terms, used by SAL-02 for `due_on`; the limit and the days are independent). Both are set in the PTY-01 form's "Credit" disclosure and by import (PTY-10).
- **FR-2** Mode: tenant setting `ledger.credit_limit_mode ∈ {off, warn, block}` (Part 21 §21.3.1, existing well-known key), default `warn`. `off` disables all checks and hides the usage bar; `warn` returns a non-blocking warning; `block` refuses the write unless overridden. Managed in PLT-06 (Settings → Ledger) with the copy of §8.
- **FR-3** Default limit for new parties: tenant setting `parties.default_credit_limit` (numeric string or null, default null) and `parties.default_credit_days` (smallint or null) — **new keys, CCR-27** — prefilled into the PTY-01 form for new parties only, never applied retroactively.
- **FR-4** Exposure formula (normative, `parties.services.credit_exposure(party)`):
  `exposure = max(balance, 0) + open_credit_documents` where
  `open_credit_documents = Σ sales_document.amount_due WHERE party_id = p AND kind IN ('invoice','bill_of_supply') AND status IN ('issued','partially_paid','overdue')`.
  Because issuing an invoice already posts a ledger debit (Part 22 §22.14), `balance` already contains those amounts; therefore at MVP **`exposure = max(balance, 0)`** and `open_credit_documents` is *not* added — double counting is explicitly avoided. The expanded formula is documented here because draft invoices and Phase-2 sales orders will need it; drafts are excluded at MVP (BR-4).
  `available = credit_limit − exposure`, `usage_pct = round(exposure / credit_limit × 100, 0)` with half-up rounding, clamped to `[0, 999]`; when `credit_limit` is NULL, `available` and `usage_pct` are null.
- **FR-5** Checked operations — every write that would **increase** the party's receivable exposure:
  | Operation | Endpoint | Prospective exposure |
  |---|---|---|
  | Manual "You gave" entry | `POST /ledger-entries` (`direction=debit`) | `exposure + amount` |
  | Issue a sales invoice / bill of supply on credit | `POST /sales/invoices/{id}/issue`, `POST /sales/invoices?issue=true` | `exposure + (grand_total − immediate_payment)` |
  | Convert an estimate to an issued invoice | `POST /sales/estimates/{id}/convert` + issue | as above |
  | Correct an entry upward | `POST /ledger-entries/{id}/correct` | `exposure − old_amount + new_amount` (only when the net effect increases exposure) |
  Operations that reduce exposure (payments, credit notes, "You got", write-offs, purchase bills, supplier payments) are **never** checked (BR-7).
- **FR-6** Check result, returned by the service as `CreditCheck { status: 'ok'|'warn'|'block', limit, exposure_before, exposure_after, available_before, over_by }`:
  - `mode='off'` or `credit_limit IS NULL` → `ok`.
  - `exposure_after ≤ credit_limit` → `ok`.
  - `exposure_after > credit_limit` and `mode='warn'` → response is still 201/200 with `meta.warnings[] = [{ code: 'credit_limit_exceeded', limit, exposure_after, over_by }]`; the client shows a confirm-after-the-fact snackbar? **No** — the client performs a *pre-flight* check (FR-8) and shows the warning dialog **before** submitting, so the warning in `meta` is a safety net for API clients and is surfaced as a snackbar "{name} is now ₹{over_by} over their limit".
  - `exposure_after > credit_limit` and `mode='block'` → 409 `credit_limit_exceeded` with `details = { limit, exposure_before, exposure_after, over_by, can_override: bool }`; nothing is written.
- **FR-7** Override: the request may carry `"override": true` (body field) plus `"override_reason": "<≥ 3 chars>"`. The server accepts it only when the actor holds `parties.party.write` **and** the role is `owner` or `admin` (staff never override, regardless of codenames — BR-8); otherwise 403 `permission_denied` with `details.reason='override_not_allowed'`. An accepted override writes the operation and an audit row `credit.limit.overridden`.
- **FR-8** Pre-flight check (client): the LED-01 entry drawer and the SAL-02 invoice editor call `GET /parties/{id}/credit-check?amount=500.00` (**new, CCR-27**) on amount blur / before submit, and render the warning or block dialog **before** the write. The authoritative check still runs server-side inside the write transaction (BR-2), so a stale pre-flight cannot bypass the rule.
- **FR-9** Warning dialog (`CreditLimitDialog`, `UbDialog`): title "{name} will cross their credit limit", body with three `UbAmount` lines — "Limit ₹50,000", "Already owes ₹47,500", "This bill ₹4,200" — and a conclusion "₹1,700 over the limit". Actions: **Continue anyway** (primary in `warn` mode), **Record payment first** (opens LED-01 credit drawer prefilled with `amount = over_by`), **Cancel**. In `block` mode for staff the primary action is replaced by **Ask owner** (FR-11) and "Continue anyway" is absent; for owner/admin it becomes **Override** which opens `UbReasonDialog` requiring a reason.
- **FR-10** Usage indicator: on PTY-03's header and on the PTY-02 desktop grid (optional column), an `MLProgress` bar with a pace marker showing `usage_pct`, coloured `--success` below 70 %, `--warning` 70–99 %, `--error` at ≥ 100 %, with the caption "₹{available} left of ₹{limit}" or "₹{over_by} over the ₹{limit} limit". Hidden when `credit_limit` is NULL or `mode='off'`.
- **FR-11** "Ask owner" (staff path in `block` mode): creates a `notifications_notification` for all members holding `parties.party.write` with role owner/admin, `type='credit_override_request'`, body "{staff} needs ₹{over_by} over {party}'s limit for a bill of ₹{amount}", `data = { party_id, amount, route }`. No approval workflow exists at MVP — the owner acts in the app (raises the limit or records a payment) and tells the staff member; a proper request/approve workflow is Phase 3 (§24).
- **FR-12** Over-limit list: PTY-02 gains a `credit=over|near|ok` filter (**delta, CCR-27**) — `over` = `credit_limit IS NOT NULL AND balance > credit_limit`; `near` = `balance ≥ 0.8 × credit_limit AND balance ≤ credit_limit`. Surfaced as a chip "Over limit ({n})" that appears only when `n > 0`, and as a dashboard tile in RPT-01 linking here.
- **FR-13** Changing a limit: lowering it below the current exposure is allowed (it is a decision about the future) and immediately turns the bar red; the PTY-01 form shows an inline `UbInputHint` "They already owe ₹47,500 — this limit is already crossed" as a non-blocking notice.
- **FR-14** Removing a limit: clearing the field sets `credit_limit = NULL`, which disables checks for that party; audited as a `party.updated` with the before/after.
- **FR-15** `credit_days` behaviour (documented here because it lives in the same disclosure): it is the default number of days used by SAL-02 to compute `due_on = document_date + credit_days`, falling back to the tenant setting `sales.default_due_days`. It has no effect on the credit-limit check.

#### 5. Non-Functional Requirements
The credit check must add ≤ 25 ms to any write: it is a single indexed read of the party row already loaded by the write path, plus arithmetic — there is no aggregation query at MVP (FR-4). The pre-flight endpoint is P95 ≤ 100 ms. The warning dialog must appear within 200 ms of the amount losing focus so it never interrupts typing. All amounts in the dialog use `Intl.NumberFormat('en-IN')` and are announced together in one `aria-live="assertive"` region (a block is an interruption and warrants assertive). Copy in `en`/`hi`, with the number always followed by its label so colour is not the only signal. The dialog is operable entirely by keyboard; the destructive/over-riding action is never autofocused. Decimal maths is `Decimal` server-side and `decimal.js-light` client-side — `usage_pct` is computed from the two decimal strings, never from floats.

#### 6. User Flow
Primary (warn, owner): counter → Bill → lines added → total ₹4,200 → on total change the pre-flight returns `warn` → the dialog explains the ₹1,700 overshoot → **Continue anyway** → invoice issues → snackbar "Issued INV/26-27/0042 · Ramesh is ₹1,700 over their limit".
Alternate A (warn, decline): same dialog → **Record payment first** → LED-01 credit drawer prefilled ₹1,700 → Save → the dialog re-runs the check, now `ok` → the user returns to the invoice and issues it.
Alternate B (block, owner): dialog with **Override** → `UbReasonDialog` "Why are you going over the limit?" (required, ≥ 3 chars) → Confirm → the write proceeds with `override=true` and the reason → audit row written → snackbar "Issued with override".
Alternate C (block, staff): dialog without Continue/Override → **Ask owner** → notification sent → snackbar "Owner notified" → staff either waits or records a payment.
Alternate D (manual entry): LED-01 "You gave" ₹2,000 on a party at their limit → same dialog before save.
Alternate E (set a limit): PTY-01 → Credit → limit ₹50,000 → hint appears if already crossed → Save → PTY-03 header shows the bar.
Alternate F (review): Parties → "Over limit (7)" chip → the list narrows to 7 parties sorted by `-balance` → the owner works through them.
Alternate G (mode off): the tenant turns `ledger.credit_limit_mode` to `off` → no dialogs anywhere, bars hidden, limits retained in the data for when the setting is turned back on.

#### 7. UI Requirements
Components: `CreditLimitDialog` (feature component built on `UbDialog`; the block variant composes `UbReasonDialog`), `CreditUsageBar` (feature component on `MLProgress` with the Koper pace marker), `UbMoneyInput` (limit field in PTY-01), `MLInput type=number` (credit days), `UbStatusBanner` (over-limit notice on PTY-03), `UbFilterTag` ("Over limit" chip on PTY-02), `UbStatCard` (RPT-01 tile "Over credit limit").

Dialog layout (mobile: bottom sheet, desktop: 420 px modal): title `ds-h3`; a three-row summary table with right-aligned `ds-num` amounts (Limit / Already owes / This bill), a hairline, then the conclusion row "Over by ₹1,700" in `--error` tone at `ds-metric-sm`; body copy of one line; footer with the actions described in FR-9, the safe action (Cancel / Record payment first) on the left and, in `warn` mode only, "Continue anyway" as a **secondary** button — the primary in this dialog is "Record payment first", because the product's opinion is that collecting is the better move.

`CreditUsageBar`: 6 px track, rounded pill, fill coloured by threshold, a 1 px pace marker at 100 % when the fill exceeds it, label above ("Credit used") and caption below ("₹2,500 left of ₹50,000" / "₹1,700 over the ₹50,000 limit"). On the PTY-02 grid it renders as a compact 60 px bar in the optional "Credit" column with the percentage as text for screen readers.

Mobile: the bar sits directly under the balance block in PTY-03's header; the dialog's action buttons stack full-width with 48 px height. Desktop: the bar sits in the right rail's "Terms" card alongside credit days and collection date.

Keyboard: in the dialog, `Esc` cancels; the reason field in the override variant autofocuses; `Enter` in the reason field submits only when the field is valid.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `parties.credit.limit` | Credit limit | उधार सीमा |
| `parties.credit.limit.none` | No limit | कोई सीमा नहीं |
| `parties.credit.days` | Due days | भुगतान दिन |
| `parties.credit.used` | Credit used | उधार इस्तेमाल |
| `parties.credit.left` | ₹{available} left of ₹{limit} | ₹{limit} में से ₹{available} बचे |
| `parties.credit.over` | ₹{over} over the ₹{limit} limit | ₹{limit} की सीमा से ₹{over} ज़्यादा |
| `parties.credit.alreadyCrossed` | They already owe ₹{balance} — this limit is already crossed | उन पर पहले से ₹{balance} बाक़ी हैं — यह सीमा पार हो चुकी है |
| `parties.credit.dialog.title` | {name} will cross their credit limit | {name} की उधार सीमा पार हो जाएगी |
| `parties.credit.dialog.titleBlocked` | {name} is at their credit limit | {name} अपनी उधार सीमा पर हैं |
| `parties.credit.dialog.rowLimit` | Limit | सीमा |
| `parties.credit.dialog.rowOwes` | Already owes | पहले से बाक़ी |
| `parties.credit.dialog.rowThis` | This bill | यह बिल |
| `parties.credit.dialog.rowThisEntry` | This entry | यह एंट्री |
| `parties.credit.dialog.overBy` | Over by ₹{over} | ₹{over} ज़्यादा |
| `parties.credit.dialog.bodyWarn` | You can continue, but their udhaar will cross the limit you set. | आप जारी रख सकते हैं, पर उनका उधार आपकी तय सीमा पार कर जाएगा। |
| `parties.credit.dialog.bodyBlock` | Your settings do not allow going over the limit. | आपकी सेटिंग सीमा पार करने की अनुमति नहीं देती। |
| `parties.credit.dialog.recordPayment` | Record payment first | पहले भुगतान दर्ज करें |
| `parties.credit.dialog.continue` | Continue anyway | फिर भी जारी रखें |
| `parties.credit.dialog.override` | Override | सीमा हटाकर जारी रखें |
| `parties.credit.dialog.askOwner` | Ask owner | मालिक से पूछें |
| `parties.credit.dialog.ownerNotified` | Owner notified | मालिक को सूचित किया गया |
| `parties.credit.override.reason` | Why are you going over the limit? | आप सीमा से ज़्यादा क्यों दे रहे हैं? |
| `parties.credit.override.done` | Saved with override | सीमा हटाकर सहेजा गया |
| `parties.credit.snackbar.nowOver` | {name} is now ₹{over} over their limit | {name} अब अपनी सीमा से ₹{over} ज़्यादा पर हैं |
| `parties.credit.filter.over` | Over limit | सीमा पार |
| `parties.credit.filter.near` | Near limit | सीमा के क़रीब |
| `settings.ledger.creditMode.title` | Credit limit checks | उधार सीमा जाँच |
| `settings.ledger.creditMode.off` | Off — never check | बंद — कभी न जाँचें |
| `settings.ledger.creditMode.warn` | Warn — show a message but allow | चेतावनी — संदेश दिखाएँ पर अनुमति दें |
| `settings.ledger.creditMode.block` | Block — only the owner can go over | रोकें — केवल मालिक सीमा पार कर सकते हैं |
| `settings.ledger.creditMode.hint` | Applies to new udhaar entries and credit bills. Payments are never blocked. | नई उधार एंट्री और उधार बिल पर लागू। भुगतान कभी नहीं रुकते। |

Copy rules: the word "block" never appears in party-facing text; nothing in this feature is ever sent to the party. The dialog always states the three numbers rather than a percentage, because merchants reason in rupees. "Override" is deliberately a heavier word than "Continue anyway" so the two modes feel different. Colour: the over-by figure and the ≥ 100 % bar are `--error`; the 70–99 % bar is `--warning`; never colour alone.

#### 9. States
**Initial** — no dialog; the bar renders from `party.credit` in the detail payload. **Loading** — pre-flight in flight: the submit button shows `MLSpinner` and is disabled for up to 800 ms, after which the client proceeds and relies on the server check (a slow network must not stop billing). **Empty** — no limit set: the bar is absent and the PTY-01 hint reads "Leave empty for no limit". **Success** — check `ok`: nothing is shown, the write proceeds. **Error** — pre-flight fails (network/500): no dialog, the write proceeds and the server's authoritative check applies; a 409 then shows the block dialog after the fact with the same content. **Disabled** — `mode='off'`: bars hidden, dialogs never shown, the limit field still editable (it is data, not behaviour). **Partial** — warn mode: the write succeeded and `meta.warnings` produced the "now over" snackbar. **Processing** — override in flight: the reason dialog's confirm shows "Saving…". **Completed** — snackbar confirming the write, with the over-limit note when applicable. **Failed** — 409 `credit_limit_exceeded` in block mode: nothing written, dialog shown, the underlying form keeps all its values so the user loses no work.

#### 10. Validation Rules
| Field | Rule | Message (en) | Code |
|---|---|---|---|
| `credit_limit` | decimal ≥ 0, exactly 2 dp, ≤ 99,99,99,999.99, nullable | Enter an amount | `validation_error` (`details.credit_limit`) |
| `credit_limit` | 0 is allowed and means "no credit at all" (every credit write is over the limit) | — | — |
| `credit_days` | integer 0–365, nullable | Enter days between 0 and 365 | `validation_error` (`details.credit_days`) |
| `override` | boolean; only honoured with `override_reason` | Add a reason for the override | `validation_error` (`details.override_reason`) |
| `override_reason` | 3–160 chars when `override=true` | Tell us why (at least 3 characters) | `validation_error` |
| override actor | role ∈ {owner, admin} | Only the owner can go over a credit limit | `permission_denied` (403, `details.reason='override_not_allowed'`) |
| `ledger.credit_limit_mode` | ∈ `off`, `warn`, `block` | Choose off, warn or block | `validation_error` (PLT-06) |
| `parties.default_credit_limit` | same as `credit_limit` | Enter an amount | `validation_error` (PLT-06) |
| `amount` (pre-flight) | decimal > 0, 2 dp | Enter an amount | `validation_error` (`details.amount`) |
| write when over | `exposure_after > limit` and `mode='block'` and not overridden | {name} is at their credit limit | `credit_limit_exceeded` (409) |

Yup: `creditLimitValidation() = string().nullable().test('money', t('…'), isMoney2dp).test('max', t('…'), v => !v || dec(v).lte('99999999.99'))`; `creditDaysValidation() = number().integer().min(0).max(365).nullable()`; `overrideSchema = object({ reason: string().trim().min(3).max(160).required() })`.

#### 11. Business Rules
- **BR-1** A NULL `credit_limit` means no limit and is the default; `0.00` is a real limit meaning "no udhaar at all" and is honoured as such. The two are never conflated.
- **BR-2** The authoritative check runs **inside** the write transaction, after the party row is locked (`SELECT … FOR UPDATE`), so two concurrent bills cannot both slip under the limit. The client's pre-flight is advisory only.
- **BR-3** Exposure at MVP is `max(balance, 0)` (FR-4): a party the business *owes* has zero exposure, and a negative balance never creates headroom beyond the full limit — i.e. `available = limit − max(balance, 0)`, never `limit + |balance|`. This is deliberate: an advance paid by the customer is their money, not extra credit.
- **BR-4** Draft invoices do **not** count towards exposure (they post no ledger entry). The check therefore runs at **issue**, not at draft save, which is also when the merchant is committing.
- **BR-5** Immediate payment recorded with an invoice reduces the prospective exposure: the check uses `grand_total − Σ payment.mode_breakup.amount` for that issue call.
- **BR-6** Credit notes, payments in, "You got" entries, write-offs, supplier bills and supplier payments are never checked — no operation that reduces or does not increase a customer receivable can be blocked.
- **BR-7** Write-offs (PTY-04 FR-3) are exempt even though they are ledger writes; they always reduce exposure.
- **BR-8** Only `owner` and `admin` roles may override, regardless of `permissions_override` grants: the check is on the **role code**, not only on a codename, because overriding a financial control is a governance decision. This is the one place in the product where a role is checked directly, and it is recorded here so the pattern is not copied elsewhere.
- **BR-9** An override applies to exactly one write; it is not a session mode and does not raise the limit. To raise the limit the owner edits the party.
- **BR-10** Lowering a limit below the current exposure never reverses anything already posted; it only affects future writes (FR-13).
- **BR-11** `usage_pct` is `round(exposure / limit × 100, 0)` half-up, clamped to 999 for display; when `limit = 0` and `exposure > 0`, `usage_pct` is reported as 999 and the caption reads "₹{exposure} over the ₹0 limit".
- **BR-12** Changing `ledger.credit_limit_mode` takes effect immediately for subsequent writes; it never re-validates history and never reverses anything already posted.
- **BR-13** The check reads the party's *current* balance, not the balance as of the document date; a back-dated invoice is checked against today's exposure.

#### 12. Permissions
| Action | Codename / rule | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See limit and usage | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| Set / change / clear a party's limit | `parties.party.write` | ✅ | ✅ | ✅* | ❌ |
| Change `ledger.credit_limit_mode` | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Set tenant default limit | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ |
| Continue past a warning | `ledger.entry.write` / `sales.invoice.write` | ✅ | ✅ | ✅ | ❌ |
| Override a block | role ∈ {owner, admin} **and** `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Ask owner (notification) | `ledger.entry.write` or `sales.invoice.write` | ✅ | ✅ | ✅ | ❌ |
| See the "Over limit" list | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| See overrides in the audit log | `platform.audit.read` | ✅ | ✅ | ❌ | ✅ |

*Staff may set a party's limit at MVP (PTY-01 §12 note); tenants that object use `permissions_override`. Staff can never override a block (BR-8), which is the control that matters.

#### 13. Edge Cases
- **EC-1** Limit set to ₹0: every credit write is over the limit. In `block` mode this effectively makes the party cash-only, which is a legitimate configuration; the dialog copy reads "₹4,200 over the ₹0 limit" and is understandable.
- **EC-2** Party balance negative (they paid an advance) with a ₹50,000 limit: exposure is 0, available is the full ₹50,000, not ₹52,000 (BR-3).
- **EC-3** A "Both" party who is a supplier with a large payable and a customer with a small receivable: the single balance may be negative, so exposure is 0 and no check fires — documented as intended, because the business is net-owing to that party.
- **EC-4** Two counters bill the same customer at the same instant, each ₹3,000 under a ₹5,000 headroom: the row lock serialises them; the second gets 409 in `block` mode or a warning in `warn` mode computed against the updated balance.
- **EC-5** Pre-flight says `ok`, the customer's balance changes before submit: the server check fires and the block dialog appears after the fact; the invoice remains a draft with all lines intact.
- **EC-6** Invoice issued with immediate full payment on a party over their limit: `grand_total − payment = 0`, so exposure does not increase and no check fires (BR-5) — a cash sale to an over-limit customer is never blocked.
- **EC-7** Partial immediate payment: only the unpaid remainder is checked.
- **EC-8** Correction (LED-03) that reduces an entry: no check. A correction that increases it: checked on the delta (FR-5).
- **EC-9** Reversal of a payment (PAY void) pushes a party over their limit: no check fires (void is not a credit-granting operation) and the party simply appears in the "Over limit" list afterwards.
- **EC-10** `mode` switched from `off` to `block` in a tenant where many parties are already over: nothing retroactive happens; the next credit write to each of them is blocked, and the "Over limit" chip appears with the count so the owner can review.
- **EC-11** Party archived while over their limit: no checks apply (no writes are possible on an archived party's ledger through the UI); the bar is hidden with the read-only banner.
- **EC-12** Currency/decimal edge: limit ₹50,000.00 and exposure ₹50,000.00 → `exposure_after = exposure + amount`; equality is **not** over (the rule is `>`), so a bill that lands exactly on the limit is allowed.
- **EC-13** Very large limit (₹9,99,99,999.99) with `usage_pct` rounding to 0: the bar shows an empty track with "₹9,99,99,999.99 left" — correct and unremarkable.
- **EC-14** Staff presses "Ask owner" five times: the notification service de-duplicates within 15 minutes per (party, staff) pair and the snackbar repeats "Owner notified".
- **EC-15** Tenant has no owner/admin online: the notification sits in the inbox; there is no escalation at MVP (§24).

#### 14. API Requirements
- **New endpoint (CCR-27)**: `GET /parties/{id}/credit-check?amount=4200.00&operation=entry|invoice` → 200 `{ data: { status: 'ok'|'warn'|'block', mode, limit, exposure_before, exposure_after, available_before, over_by, can_override } }`. All money as strings. 404 for cross-tenant; 400 for a bad amount. Cheap and idempotent; safe to call on every amount change (debounced 300 ms).
- **Deltas to existing endpoints (CCR-27)**:
  - `POST /ledger-entries` and `POST /sales/invoices?issue=true` / `POST /sales/invoices/{id}/issue` accept `override: boolean` and `override_reason: string`; on `warn` they return `meta.warnings[] = [{ code: 'credit_limit_exceeded', limit, exposure_after, over_by }]`; on `block` they return 409 `credit_limit_exceeded` with `details = { limit, exposure_before, exposure_after, over_by, can_override }`. (Part 22 §22.5 already sketches this for ledger entries; this feature specifies the payload.)
  - `GET /parties` gains `credit=over|near|ok` and `ordering=-credit_usage` (computed expression); `GET /parties/{id}` returns `credit: { limit, days, exposure, available, usage_pct, mode, status }`.
  - `GET /reports/receivables-aging` rows gain `credit_limit` and `over_limit_amount` columns.
  - `GET /reports/dashboard` gains a tile `over_credit_limit: { count, amount }`.
- Error code `credit_limit_exceeded` already exists in Part 22 §22.1; `override_not_allowed` is a `details.reason` value, not a new top-level code.
- Frontend: `partyService.creditCheck(id, params)`, thunk `checkCredit`; `salesService`/`ledgerService` write calls accept `{ override, overrideReason }`; `partyDisplay.creditCaption(credit)` and `partyDisplay.creditTone(usagePct)` produce the bar's caption and tone; the dialog is opened by a shared hook `useCreditLimitGuard({ partyId, amount, operation })` used by both LED-01 and SAL-02 so the behaviour cannot drift between them.

#### 15. Database Impact
Reads: `parties_party.credit_limit`, `.balance`, `.status` — all on the row the write path already locks, so the check adds **zero** extra queries to a write; the pre-flight endpoint is a single PK read. `platform_tenant_setting` for `ledger.credit_limit_mode` (cached per request in the tenant context object). The `credit=over|near` filter adds a computed predicate `balance > credit_limit` / `balance >= 0.8 * credit_limit` which is **not** index-supported; at MVP this is acceptable because it is used on demand rather than on every list load, but a partial index `IX(tenant_id, credit_limit) WHERE credit_limit IS NOT NULL` plus a generated `credit_usage` column are proposed in **CCR-28** for tenants above 10,000 parties. Writes: none of its own — `credit_limit`/`credit_days` are written by PTY-01's PATCH, and the override path writes only `platform_audit_log`. `sales_document.amount_due` is read only if the expanded formula of FR-4 is enabled (Phase 2).

#### 16. Audit Requirements
- `credit.limit.set` — written by PTY-01's update path when `credit_limit` or `credit_days` changes: `entity_type='party'`, `before/after = { credit_limit, credit_days }`, `metadata = { balance_at_change }`. (It is emitted in addition to `party.updated` because limit changes are a control, and auditors filter on this action.)
- `credit.limit.overridden` — `entity_type` is the written object (`ledger_entry` or `sales_document`), `entity_id` its id, `metadata = { party_id, limit, exposure_before, exposure_after, over_by, reason, operation, actor_role, request_id }`. This is the row that answers "who let this happen".
- `credit.limit.warned` — **not** audited (volume, and nothing was overridden); it is analytics-only.
- `tenant.setting.updated` for `ledger.credit_limit_mode` (PLT-06's audit), with before/after values.
- `credit.override.requested` — written when staff press "Ask owner": `metadata = { party_id, amount, over_by, notified_user_ids }`.

#### 17. Notifications
In-app only; nothing is ever sent to the party.
- `credit_override_request` (FR-11) — to owners/admins: title "Credit limit — {party}", body "{staff} needs ₹{over_by} over the ₹{limit} limit for a bill of ₹{amount}", `data = { party_id, route: '/parties/{id}', amount }`. De-duplicated 15 minutes per (party, requester).
- `credit_limit_crossed` — optional daily digest (tenant setting `notifications.credit_digest`, default off, **CCR-27**): one notification per day listing parties that crossed their limit since the last digest, generated by the existing scheduler command `manage.py run_scheduler` (ADR-012) as part of the nightly party scan. Title "3 parties over their credit limit", `data.route = '/parties?credit=over'`.
No SMS, WhatsApp or email at MVP — the information is commercially sensitive and belongs inside the app.

#### 18. Analytics / Event Tracking
`ub.parties.credit_limit_set { had_limit_before, limit_bucket, days, via: 'form'|'import'|'default' }`; `ub.parties.credit_limit_cleared {}`; `ub.parties.credit_check_run { status, operation, mode, usage_pct_bucket }`; `ub.parties.credit_warned { operation, over_by_bucket, usage_pct_bucket }`; `ub.parties.credit_blocked { operation, over_by_bucket, actor_role }`; `ub.parties.credit_dialog_action { action: 'continue'|'record_payment'|'override'|'ask_owner'|'cancel', mode }`; `ub.parties.credit_overridden { operation, over_by_bucket, reason_length }`; `ub.parties.credit_override_requested {}`; `ub.parties.credit_filter_used { value: 'over'|'near', result_count }`; `ub.parties.credit_mode_changed { from, to }`. Amounts are bucketed (`<1k, 1-5k, 5-25k, 25-100k, 100k+`), never raw; reasons are never sent.

#### 19. Security
The override is the sensitive path: it is authorised by role (BR-8) *and* codename, requires a reason, is audited with the full exposure snapshot, and cannot be replayed (an `Idempotency-Key` replay returns the original response without writing a second audit row). The `override` flag is ignored — not merely rejected — when the actor is ineligible, and the request then falls through to the normal 409, so a staff client cannot learn whether an override would have succeeded beyond the `can_override` flag it is already given. The pre-flight endpoint returns only data the caller can already see on the party page and is rate-limited to 300 calls/min/user (it is called on typing). `credit_limit` is commercially sensitive: it is excluded from any public surface (PTY-09's self-view khata never shows a limit or usage) and from the party-facing statement PDF. All comparisons use `Decimal`; the string amounts from the client are parsed with a strict 2-dp regex before conversion, so no float rounding can move a value across the limit boundary.

#### 20. Performance
Zero added queries on the write path (FR-4/§15) and ≤ 25 ms added latency, measured in the sales-issue benchmark. The pre-flight endpoint is a PK read, P95 ≤ 100 ms, debounced 300 ms client-side and cached for 5 s per (party, amount) so a user editing lines does not generate a request per keystroke. The `credit=over` filter's non-indexed predicate is bounded by the tenant's party count; CI asserts it stays under 300 ms at the 100k-party fixture and the CCR-28 index is required before any tenant exceeds that. The dialog component is `next/dynamic` (it is rare) and pre-warmed when the pre-flight first returns a non-`ok` status.

#### 21. Testing
- **T-PTY-06-1** unit: `credit_exposure` returns `max(balance, 0)`; `available` and `usage_pct` for balances −1,000 / 0 / 25,000 / 50,000 / 60,000 against a ₹50,000 limit, including the half-up rounding of 50 % boundaries.
- **T-PTY-06-2** unit: `usage_pct` with `limit=0` and exposure > 0 → 999; with `limit=NULL` → null.
- **T-PTY-06-3** unit (client): `useCreditLimitGuard` debounces, caches for 5 s, and proceeds without a dialog when the pre-flight errors.
- **T-PTY-06-4** API: `mode='off'` → no warning, no block, no `meta.warnings`, even far over the limit.
- **T-PTY-06-5** API: `mode='warn'` → entry written, 201 with `meta.warnings[0].code='credit_limit_exceeded'` and correct `over_by`.
- **T-PTY-06-6** API: `mode='block'` → 409 `credit_limit_exceeded` with the full `details`; the ledger has no new row and the party balance is unchanged.
- **T-PTY-06-7** API: `override=true` with a reason as owner → 201 plus an audit row `credit.limit.overridden` carrying the exposure snapshot; as staff → 403 with `details.reason='override_not_allowed'` and no write.
- **T-PTY-06-8** API: `override=true` without a reason → 400 `details.override_reason`.
- **T-PTY-06-9** API: exact-equality bill landing on the limit → allowed (EC-12).
- **T-PTY-06-10** API: invoice issued with full immediate payment on an over-limit party → allowed; with partial payment → only the remainder checked.
- **T-PTY-06-11** API: payment in, credit note, "You got", write-off and supplier bill on an over-limit party → never blocked.
- **T-PTY-06-12** API (concurrency): two parallel issues each within the headroom but jointly over → in `block` mode exactly one succeeds; both are correct in `warn` mode with the second's `over_by` computed on the updated balance.
- **T-PTY-06-13** API: `GET /parties/{id}/credit-check` returns `ok/warn/block` consistently with the write path for the same amount (property test over 100 random combinations of limit, balance, amount and mode).
- **T-PTY-06-14** API: `GET /parties?credit=over` returns exactly the parties with `credit_limit IS NOT NULL AND balance > credit_limit`; `near` uses the 80 % threshold inclusive of the limit.
- **T-PTY-06-15** API: correction increasing an entry is checked on the delta; decreasing it is not checked.
- **T-PTY-06-16** permission: changing `ledger.credit_limit_mode` requires `platform.tenant.manage`; accountant cannot set a limit.
- **T-PTY-06-17** component: dialog renders the three amounts and the over-by conclusion; in `warn` mode "Record payment first" is the primary; in `block` mode staff see "Ask owner" and no continue.
- **T-PTY-06-18** component: `CreditUsageBar` tone thresholds at 69/70/99/100 %; caption switches from "left of" to "over the".
- **T-PTY-06-19** E2E (staff, block): build a bill that crosses the limit → blocked dialog → Ask owner → owner's inbox shows the notification → owner raises the limit → staff retries and the bill issues.
- **T-PTY-06-20** E2E (owner, warn): "You gave" over the limit → dialog → Continue anyway → entry saved and the snackbar states the over-by amount; the party page bar is red.
- **T-PTY-06-21** a11y: the dialog's summary is announced as one assertive region; the bar exposes `role="progressbar"` with `aria-valuenow`, `aria-valuetext` carrying the rupee caption.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a party with no limit, when I set ₹50,000 in the Credit section and save, then the party page shows a credit bar with "₹50,000 left of ₹50,000".
- **AC-2 (US-2)** Given Settings → Ledger, when I choose "Block — only the owner can go over" and save, then staff attempting an over-limit entry get a 409 and no entry is written.
- **AC-3 (US-3)** Given a customer owing ₹47,500 against a ₹50,000 limit, when I add a ₹4,200 bill, then a dialog appears before saving showing Limit ₹50,000, Already owes ₹47,500, This bill ₹4,200 and "Over by ₹1,700".
- **AC-4 (US-4)** Given the block mode and owner rights, when I press Override, enter "Regular customer, festival order" and confirm, then the bill issues and an audit row records the reason, the amounts and my user id.
- **AC-5 (US-5)** Given a party using 95 % of their limit, when I open their khata page, then the bar is in the warning tone with "₹2,500 left of ₹50,000".
- **AC-6 (US-6)** Given 7 parties over their limits, when I open the party list, then an "Over limit (7)" chip is shown and tapping it lists exactly those 7.
- **AC-7 (US-7)** Given two overrides last month, when I open the audit log filtered to `credit.limit.overridden`, then both are listed with actor, party, amounts and reason.
- **AC-8 (US-8)** Given a tenant default limit of ₹10,000, when I add a new party, then the Credit section is prefilled with ₹10,000 and existing parties are unchanged.

#### 23. Dependencies
PTY-01 (limit and days fields, tenant defaults), PTY-02 (`credit=over|near` filter and chip, optional Credit column), PTY-03 (usage bar, over-limit banner), PTY-04 (write-offs exempt; archived parties hide the bar), PTY-10 (limit column in the import), LED-01 (manual entry guard), LED-03 (correction delta check), SAL-02 (invoice issue guard, immediate payment netting), SAL-03 (estimate conversion), PAY-01 (payments never blocked; "Record payment first" opens it), PLT-06 (`ledger.credit_limit_mode`, `parties.default_credit_limit`, `parties.default_credit_days`, `notifications.credit_digest`), PLT-08 (audit viewer), NTF-01 (in-app inbox), RPT-01 (dashboard tile), RPT-05 (aging columns), `UbDialog`, `UbReasonDialog`, `MLProgress`, `UbMoneyInput`, CCR-27 (endpoints, settings, deltas) and CCR-28 (index for large tenants).

#### 24. Future Enhancements
A proper override request/approval workflow with an owner action in the inbox that unblocks the staff member's pending write (P3); per-party credit *terms* alerts (overdue days, not only amount) that block when any invoice is more than N days late (P3); limit suggestions derived from the party's payment history and average monthly purchase (P3, needs RPT-11); including draft invoices and Phase-2 sales orders in exposure via the expanded FR-4 formula (P2); group-level limits for a chain of related parties (P3, depends on PTY-05's groups); temporary limit increases with an expiry date ("₹20,000 extra until Diwali") (P3); interest on overdue amounts (LED-13, P3); an exposure dashboard with a concentration warning when one party exceeds 20 % of total receivables (P3).

---

### PTY-07 — Add from phone contacts — Phase 2

#### 1. Business Objective
Nearly every party a small Indian business deals with is already a contact in the owner's phone. Retyping "Ramesh Kirana" and a ten-digit number is the single largest source of friction and of typos in party creation, and typos in mobile numbers are expensive — a wrong number means reminders and statements go to a stranger. The contact picker removes the typing without removing the user's control: the operating system shows its own picker, the user chooses whom to share, and the app receives only the selected entries. Crucially, DigiKhaato **never uploads the address book** — the practice that made Khatabook and several lending apps a privacy scandal and that DPDP now makes legally hazardous (research §C.6). Success measures: among devices where the picker is available, ≥ 50 % of new parties created through it; ≥ 40 % reduction in mobile-number validation failures on those devices; zero contacts transmitted to the server other than those the user explicitly selected and saved; ≥ 95 % of users who open the picker complete at least one party.

#### 2. User Personas
OW and ST (both create parties), CU indirectly (their contact data, and the privacy promise made about it).

#### 3. User Stories
1. **US-PTY-07-1** — As a shopkeeper, I want to pick a customer from my phone contacts so that I do not type their name and number.
2. **US-PTY-07-2** — As a shopkeeper, I want to add several contacts at once so that setting up my khata after installing takes minutes, not an evening.
3. **US-PTY-07-3** — As a user, I want to be sure the app is not copying my whole phone book so that I trust it with my customers' numbers.
4. **US-PTY-07-4** — As a shopkeeper, I want the app to tell me which picked contacts are already my parties so that I do not create duplicates.
5. **US-PTY-07-5** — As a shopkeeper, I want to fix a name or choose which of a contact's numbers to use before saving so that the party record is right.
6. **US-PTY-07-6** — As a user on a browser that cannot do this, I want a clear alternative so that I am not stuck.

#### 4. Functional Requirements
- **FR-1** Capability detection (`utils/contacts.ts detectContactsSupport()`), evaluated once per session and cached in `sessionSlice.capabilities.contacts`:
  | Environment | Mechanism | Notes |
  |---|---|---|
  | Chrome/Edge on Android, secure context | **Contact Picker API** `navigator.contacts.select(['name','tel'], { multiple: true })` | Requires a transient user activation; supports multi-select |
  | Capacitor native wrapper (Phase 3, ADR-020) | `@capacitor-community/contacts` behind the same `contactsAdapter` interface | Requires the `READ_CONTACTS` permission with a rationale screen |
  | iOS Safari, desktop browsers, Firefox | **Unsupported** | The entry point is hidden, not disabled; PTY-10 (CSV import) and PTY-01 are offered instead |
  The adapter interface is `contactsAdapter.isSupported(): boolean` and `contactsAdapter.pick(): Promise<PickedContact[]>` where `PickedContact = { name?: string, tel?: string[] }` — one interface so the Capacitor implementation drops in without touching the feature.
- **FR-2** Entry points (rendered only when supported): PTY-02's first-use empty state ("Add from contacts"), PTY-01's drawer header ("Pick from contacts" icon button, which fills the open form from one contact), and the Parties page overflow menu ("Add from contacts").
- **FR-3** Rationale screen before the first pick (`ContactsRationaleSheet`, shown once per user, persisted in `localStorage` key `ub.contacts.rationaleSeen`): explains, in one screen, that the phone will show its own picker, that only the contacts the user selects are read, that nothing is uploaded until the user presses Save, and that DigiKhaato never reads the address book in the background. Actions: **Choose contacts** and **Not now**. This screen exists because the browser permission prompt is terse and the promise is the point of the feature.
- **FR-4** Picking: `contactsAdapter.pick()` must be called synchronously inside the click handler (transient activation); the returned array may be empty (user cancelled) → no-op, no error. On `SecurityError`/`NotAllowedError` the sheet shows "Your browser did not allow this. You can still add the party by typing." with a button to open PTY-01.
- **FR-5** Normalisation of each picked contact (`mapPickedContact`):
  - `name` = first non-empty of `contact.name[0]` trimmed and whitespace-collapsed, truncated to 160; when absent, the chosen number is used as the name placeholder and the field is flagged as requiring input.
  - numbers = each `tel` passed through `normaliseIndianMobile` (section conventions); entries failing `^\+91[6-9]\d{9}$` are kept in the list but marked invalid and cannot be selected as the party's mobile; duplicates after normalisation are collapsed.
  - when a contact yields more than one valid number, the first is preselected and the others are offered in an `MLSelect` on the review row.
- **FR-6** Duplicate detection: after picking, the client sends the **normalised numbers only** (never names) to `POST /parties/lookup-mobiles` (**new, CCR-29**) `{ mobiles: string[] }` → `{ data: [ { mobile, party: { id, name, status } | null } ] }`, capped at 100 numbers per call. Each review row is then marked **New**, **Already added** (with the existing party's name and an **Open** link) or **Archived** (with a **Restore** link, PTY-04).
- **FR-7** Review screen (`ContactsReviewDrawer`, the heart of the feature): a list of the picked contacts, each row with a selection `MLCheckbox` (rows marked "Already added" are unchecked and disabled), an editable name `MLInput`, the chosen number (`MLSelect` when several), a type `MLToggleGroup` ({customerLabel}/{supplierLabel}/Both) defaulting to customer for all, and an optional shared tag picker at the top ("Tag all as…", PTY-05). A footer shows "Add {n} parties" with the count of checked rows.
- **FR-8** Bulk create: `POST /parties/bulk` (**new, CCR-29**) `{ parties: [ { name, mobile, is_customer, is_supplier, tags? } ], source: 'contacts' }` → 200 `{ data: { created: [party], skipped: [ { index, mobile, code, existing_party_id? } ] }, meta: { created_count, skipped_count } }`. Server-side each row runs the full PTY-01 validation; a duplicate mobile becomes a `skipped` entry with `code='duplicate_mobile'` rather than failing the batch. Max 100 rows per call; larger selections are chunked by the client with a progress indicator. `Idempotency-Key` is required so a retry after a timeout cannot double-create.
- **FR-9** Result: a completion screen "Added {created} parties · {skipped} skipped" with a list of skipped rows and their reasons, actions **Done** (returns to the list, which refetches) and **Add more contacts**. The created parties are upserted into `partyListSlice` so the list shows them immediately.
- **FR-10** Single-contact mode (from the PTY-01 drawer): the picker returns one contact, the form's name and mobile are filled, the duplicate pre-check of PTY-01 FR-6 runs, and the user continues in the normal form with every other field available. No review screen.
- **FR-11** No background access: the app never requests a persistent contacts permission on the web (the Contact Picker API has none by design), never stores the picked list beyond the review session (it lives in component state, not in Redux, and is cleared on unmount), and never sends names to the server before Save. The Capacitor path (Phase 3) must show the rationale screen before requesting `READ_CONTACTS` and must call the OS picker rather than enumerating the address book.
- **FR-12** Analytics and audit carry **no contact data** — counts only (§16, §18).
- **FR-13** Opening balances are not collected here (the flow is about speed); the completion screen offers "Add opening balances" which routes to PTY-10's import or to each party's khata.
- **FR-14** Fallback discoverability: on unsupported devices the "Add from contacts" entry point is absent, and the first-use empty state instead shows "Import from CSV" (PTY-10) and "Add party" — never a disabled button, and never an error about the browser.

#### 5. Non-Functional Requirements
The picker must open within 300 ms of the tap (the call is synchronous into the OS). Review of 50 contacts must render in ≤ 500 ms and scroll at 60 fps (rows are memoised; the list is plain, not virtualised, because the practical cap is 100). The duplicate lookup for 50 numbers must return in ≤ 400 ms P95. Bulk create of 100 parties must complete in ≤ 4 s and is chunked so the user sees progress. The whole flow works at 320 px. Accessibility: each review row is a labelled group; the invalid-number marker is text, not colour; the rationale screen is readable by a screen reader in one pass and its two actions are the only focusable controls. Copy in `en`/`hi`. Offline: the picker works offline (it is an OS surface), the duplicate lookup and the save do not — the review screen shows "You are offline. Your choices are kept; press Add when you are back online" and retains state.

#### 6. User Flow
Primary: Parties (empty) → **Add from contacts** → rationale sheet (first time) → **Choose contacts** → OS picker → user selects 12 contacts → review drawer with 9 New, 2 Already added (disabled), 1 Archived → user fixes one name, picks the second number for another, chooses "Tag all as: Camp Area" → **Add 9 parties** → progress → completion "Added 9 · 3 skipped" → Done → list shows 9 new rows.
Alternate A (cancel in the OS picker): nothing happens; the user returns to where they were.
Alternate B (permission denied, Capacitor): rationale → system prompt → Deny → a sheet explains how to enable it in Settings and offers **Add party** instead; the app never asks again automatically.
Alternate C (single contact from the form): PTY-01 drawer → contacts icon → pick one → name and mobile filled → the duplicate hint fires if it is a known number → user completes GST/opening balance → Save.
Alternate D (all picked contacts already exist): review shows every row disabled with "Already added"; the footer reads "Nothing to add" and offers **Open {name}** links and **Choose different contacts**.
Alternate E (contact without a number): the row is shown with an empty number field and a "Add a number" hint; it cannot be checked until a valid number is typed, or the user unchecks it.
Alternate F (unsupported browser): the entry point is absent; the empty state offers Import CSV and Add party.
Alternate G (partial failure): a chunk fails with a network error → the completion screen shows "Added 40 · 60 not added" with **Retry the rest**, which resends only the unsent chunks with the same `Idempotency-Key`s.

#### 7. UI Requirements
Components: `ContactsRationaleSheet` (`UbDrawer` bottom, illustration + three bullet promises + two buttons), `ContactsReviewDrawer` (`UbDrawer` full-height bottom sheet on mobile, right 520 px on desktop-with-support), `ContactReviewRow` (feature component: `MLCheckbox`, `MLInput` name, `MLSelect`/`UbPhoneInput` number, `MLToggleGroup` type, status `UbStatusBadge`), `TagInput` (shared "Tag all as…", PTY-05), `MLProgress` (chunk progress), `ContactsResultPanel` (`UbEmptyState`-styled success summary with the skipped list), `UbSnackbar`.

Review row anatomy (mobile, 88 px tall): line 1 = checkbox + name input (borderless until focused, `ds-body-medium`); line 2 = number select/input (`ds-mono`) + status badge; line 3 (only when needed) = the type toggle, collapsed behind "Supplier?" to keep the row short — tapping it expands the toggle in place. Rows marked "Already added" render at 55 % opacity with the badge and an **Open** text link.

Header of the review drawer: "Review {n} contacts" with a "Select all new" checkbox and the shared tag picker; footer sticky with "Add {n} parties" primary and Cancel.

Desktop: the same drawer at 520 px with a two-column row layout (name | number) and a real table header; the feature is nevertheless mobile-first because the API is Android-only in practice.

Keyboard: `Tab` walks checkbox → name → number → type per row; `Space` toggles the row; `Cmd/Ctrl+Enter` submits.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `parties.contacts.action` | Add from contacts | संपर्कों से जोड़ें |
| `parties.contacts.rationale.title` | Pick contacts, nothing is copied | संपर्क चुनें, कुछ भी कॉपी नहीं होता |
| `parties.contacts.rationale.b1` | Your phone shows its own contact list. | आपका फ़ोन अपनी संपर्क सूची दिखाएगा। |
| `parties.contacts.rationale.b2` | Only the contacts you pick are read. | केवल वही संपर्क पढ़े जाते हैं जो आप चुनते हैं। |
| `parties.contacts.rationale.b3` | Nothing is saved until you press Add. | जब तक आप जोड़ें नहीं दबाते, कुछ सहेजा नहीं जाता। |
| `parties.contacts.rationale.cta` | Choose contacts | संपर्क चुनें |
| `parties.contacts.rationale.later` | Not now | अभी नहीं |
| `parties.contacts.review.title` | Review {count} contacts | {count} संपर्क जाँचें |
| `parties.contacts.review.selectAll` | Select all new | सभी नए चुनें |
| `parties.contacts.review.tagAll` | Tag all as… | सभी को टैग करें… |
| `parties.contacts.review.name` | Name | नाम |
| `parties.contacts.review.number` | Number | नंबर |
| `parties.contacts.review.chooseNumber` | This contact has {count} numbers | इस संपर्क के {count} नंबर हैं |
| `parties.contacts.review.noNumber` | Add a number | नंबर जोड़ें |
| `parties.contacts.review.invalidNumber` | Not a valid 10-digit mobile | मान्य 10-अंकों का मोबाइल नहीं |
| `parties.contacts.review.isSupplier` | Supplier? | सप्लायर? |
| `parties.contacts.badge.new` | New | नया |
| `parties.contacts.badge.exists` | Already added | पहले से जुड़ा |
| `parties.contacts.badge.archived` | Archived | आर्काइव |
| `parties.contacts.review.submit` | Add {count} parties | {count} पार्टियाँ जोड़ें |
| `parties.contacts.review.nothing` | Nothing to add | जोड़ने के लिए कुछ नहीं |
| `parties.contacts.result.title` | Added {created} parties | {created} पार्टियाँ जुड़ गईं |
| `parties.contacts.result.skipped` | {count} skipped | {count} छोड़े गए |
| `parties.contacts.result.addMore` | Add more contacts | और संपर्क जोड़ें |
| `parties.contacts.result.openings` | Add opening balances | शुरुआती बाक़ी जोड़ें |
| `parties.contacts.denied.title` | Your phone did not allow this | आपके फ़ोन ने अनुमति नहीं दी |
| `parties.contacts.denied.body` | You can still add the party by typing the name and number. | आप नाम और नंबर टाइप करके पार्टी जोड़ सकते हैं। |
| `parties.contacts.offline` | You are offline. Your choices are kept — press Add when you are back online. | आप ऑफ़लाइन हैं। आपके चुनाव सुरक्षित हैं — ऑनलाइन होने पर जोड़ें दबाएँ। |
| `parties.contacts.retryRest` | Retry the rest | बाक़ी दोबारा भेजें |

Copy rules: the privacy promise is stated in the product's own words before any system prompt, and it is a promise the implementation keeps literally (FR-11) — this copy must not be softened to "we may access your contacts". Never say "sync": nothing is synchronised, contacts are picked once. Defaults: all new rows checked, type customer, no tags. No destructive action exists in this flow, so no confirmations; Cancel on a dirty review asks "Discard picked contacts?".

#### 9. States
**Initial** — entry point visible (supported) or absent (unsupported). **Loading** — duplicate lookup running: rows render with a skeleton badge; the footer is disabled for ≤ 1 s. **Empty** — the OS picker returned zero contacts: the drawer does not open and a snackbar says "No contacts chosen". **Success** — completion panel with counts. **Error** — lookup failure: rows show no badge and a banner "Couldn't check for duplicates. Duplicates will be skipped when you add."; save failure: the review screen returns with the rows intact and a banner with `request_id`. **Disabled** — rows marked "Already added" are disabled with the badge; the footer is disabled when zero rows are checked. **Partial** — chunked save in progress: `MLProgress` "Adding 40 of 100…"; already-created chunks are not resent. **Processing** — the footer button shows `MLSpinner` + "Adding…" and the drawer cannot be dismissed. **Completed** — result panel; the party list refetches in the background. **Failed** — all chunks failed: "Nothing was added" with Retry, and every row is preserved.

#### 10. Validation Rules
| Field | Rule | Message (en) | Code |
|---|---|---|---|
| `name` (per row) | required, 2–160 after trim | Enter a name | `validation_error` (`details.parties[i].name`) |
| `mobile` (per row) | required in this flow, normalised `^\+91[6-9]\d{9}$` | Not a valid 10-digit mobile | `validation_error` (`details.parties[i].mobile`) |
| `mobile` (per row) | unique per tenant | Already added as {name} | `duplicate_mobile` (per-row `skipped` code, not a 400) |
| `mobile` (within batch) | unique within the submitted array | The same number appears twice | `validation_error` (`details.parties[i].mobile`) |
| type flags | at least one true | Choose customer, supplier or both | `validation_error` |
| `tags` | ≤ 10 names, each 1–40 chars (PTY-05 rules) | Up to 10 tags | `validation_error` |
| `parties` array | 1–100 rows | Add between 1 and 100 parties at a time | `validation_error` (`details.parties`) |
| `mobiles` (lookup) | 1–100 normalised numbers | Check up to 100 numbers at a time | `validation_error` (`details.mobiles`) |
| plan | created count must fit `max_parties` | Your plan allows {limit} parties | `plan_limit_reached` (403, with `details.remaining` so the client can offer to add only the first N) |
| `Idempotency-Key` | required on `POST /parties/bulk` | Missing idempotency key | `validation_error` |

Client-side the footer count only includes rows that pass name + mobile validation, so a malformed row cannot be submitted; the server rules exist for API clients and for races.

#### 11. Business Rules
- **BR-1** The address book is never uploaded, enumerated or stored. Only the numbers the user picked are sent for duplicate checking, and only the rows the user keeps checked are sent for creation. This is a product invariant, not an implementation detail, and it is stated to the user (FR-3) and enforced by code review (§21 includes a test that asserts the network payload of the lookup contains no names).
- **BR-2** Picked contact data lives in React component state for the duration of the review and is discarded on unmount, on navigation and on completion. It is never written to Redux, `localStorage`, IndexedDB or any log.
- **BR-3** A contact whose normalised number matches an existing **active** party is never created again; the row is disabled and the existing party is offered. A match against an **archived** party offers Restore (PTY-04) instead of creation, because the unique index would refuse the insert anyway (PTY-01 BR-1).
- **BR-4** Bulk create is partial-success by design: a batch is never rejected because one row is a duplicate. Genuine validation errors (bad name, malformed number) are also returned per row rather than failing the batch, so the user can fix and resubmit only those.
- **BR-5** Every party created here is identical to one created in PTY-01: same table, same validation, same audit action with `metadata.via='contacts'`. There is no "contact-sourced party" type and no stored link back to the phone contact.
- **BR-6** No opening balance, GSTIN, address or consent is captured in this flow; `sms_opt_in` takes the column default (`true`) and `consent_source` stays NULL — the user records consent later in PTY-01 when they first message the party. LED-08's send path requires a consent record, so a contacts-created party is not messaged until consent is captured (that dependency is stated in LED-08, not weakened here).
- **BR-7** The plan limit is enforced across the batch: if 40 slots remain and 60 are submitted, the first 40 by array order are created and the remaining 20 are `skipped` with `code='plan_limit_reached'`, so the user gets a usable result rather than a wholesale rejection.
- **BR-8** Chunking is a client concern; each chunk is an independent idempotent request with its own key, so a retry of chunk 3 cannot duplicate chunk 2.
- **BR-9** The feature is Phase 2 and its absence must never break a Phase-1 flow: every entry point is conditional on `sessionSlice.capabilities.contacts`, and PTY-01/PTY-10 remain fully sufficient.

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Open the picker and review | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Duplicate lookup | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| Bulk create parties | `parties.party.write` | ✅ | ✅ | ✅ | ❌ |
| Tag all as… | `parties.party.write` (+ `parties.tags.staff_create` for new tags) | ✅ | ✅ | ✅ | ❌ |
| Restore an archived match | `parties.party.delete` | ✅ | ✅ | ❌ | ❌ |

No new codenames. The accountant never sees the entry point (they cannot create parties); the lookup permission is listed because the endpoint is shared with PTY-01's duplicate check.

#### 13. Edge Cases
- **EC-1** Contact with five numbers (home, work, two mobiles, a landline): landlines fail normalisation and are shown as invalid; the select lists only the valid ones with the first preselected.
- **EC-2** Contact with no name (number-only entry): the name field is empty and required; the row cannot be checked until the user types a name — the number is offered as a one-tap suggestion.
- **EC-3** Two picked contacts share a number (a shop and its owner saved twice): the client collapses them into one row with both names offered in a select, and the batch-level uniqueness rule prevents a double insert.
- **EC-4** A number stored as `09876543210` or `+91 98765 43210`: normalised identically; a duplicate against an existing party is found reliably (this is a large part of the feature's value).
- **EC-5** International number in the contact (`+971…`): fails the `+91` rule and is shown invalid with the message "Only Indian mobile numbers are supported"; the user may still create the party by typing it in PTY-01 without a mobile.
- **EC-6** The OS picker returns 400 contacts (the user tapped "select all"): the client caps the review at 100 with a notice "Showing the first 100. Add them, then pick more." — the cap protects the lookup and the batch endpoints.
- **EC-7** User edits a name to match an existing party's name (not number): allowed — names are not unique (PTY-01 BR-1 is about mobiles).
- **EC-8** Plan limit reached mid-batch: BR-7 applies; the completion panel explains and links to PLT-15's upgrade copy.
- **EC-9** Network dies after the server created the parties but before the response arrives: the retry uses the same `Idempotency-Key` and receives the original response with `Idempotent-Replayed: true`; nothing is duplicated.
- **EC-10** User backgrounds the app during the OS picker: the promise resolves when they return; if the page was discarded, the flow restarts with nothing lost (no state had been committed).
- **EC-11** Browser reports support but the call throws `NotSupportedError` (some embedded webviews): caught and treated as unsupported for the rest of the session, with the denial sheet shown once.
- **EC-12** The user is in a tenant where `parties` writes are denied by `permissions_override`: the entry point is hidden by the same permission check that hides "Add party".
- **EC-13** A picked contact matches an archived party and the user presses Restore: the party is restored and the row becomes "Already added" with an Open link; it is not created.
- **EC-14** Duplicate lookup is blocked by an ad-blocker or fails: rows show no badge, the banner of §9 explains, and the server's per-row duplicate handling (BR-4) still prevents duplicates at save time.

#### 14. API Requirements
- **New endpoints (CCR-29)**, Part 22 §22.4:
  - `POST /parties/lookup-mobiles` `{ mobiles: string[] }` (1–100, already normalised; the server normalises again) → 200 `{ data: [ { mobile, party: { id, name, status } | null } ] }`. Requires `parties.party.read`. Rate-limited 30/min/user. Returns only the three listed fields — never balances, never addresses — because it is a membership test, not a party read.
  - `POST /parties/bulk` `{ parties: [ { name, mobile, is_customer, is_supplier, tags? } ], source: 'contacts'|'manual' }`, header `Idempotency-Key` required → 200 `{ data: { created: [party], skipped: [ { index, mobile, code, message, existing_party_id? } ] }, meta: { created_count, skipped_count, remaining_plan_slots } }`. Requires `parties.party.write`. Max 100 rows. Errors: 400 `validation_error` (structural), 403 `permission_denied`, 409 `idempotency_conflict`.
- The same `POST /parties/bulk` endpoint is reused by PTY-10's commit step for small files, which is why `source` is a field rather than a separate path.
- Frontend: `contactsAdapter` (`utils/contacts.ts` web implementation; `capacitorContacts.ts` in Phase 3), `partyService.lookupMobiles(mobiles)`, `partyService.bulkCreateParties(body, idempotencyKey)`; thunks `lookupContactMobiles`, `bulkCreateParties`; no new slice — the review list is component state per BR-2, and only the created parties are dispatched to `partyListSlice.actions.rowsUpserted`.

#### 15. Database Impact
Reads: `parties_party` by the partial unique index `U(tenant_id, mobile) WHERE mobile IS NOT NULL AND deleted_at IS NULL` — the lookup is a single `WHERE mobile = ANY(%s)` query returning at most 100 rows, never a scan. Writes: `parties_party` (bulk insert, one statement via `bulk_create` with per-row pre-validation and a savepoint per row only where a duplicate is possible — in practice the duplicates are filtered by the same lookup inside the transaction, so one `INSERT … ON CONFLICT DO NOTHING RETURNING *` handles the race), `parties_tag` + `parties_party_tag` (when "Tag all as…" is used), `platform_audit_log` (one row per created party plus one summary row). No new tables, no new columns, no new indexes — the feature deliberately adds no schema. Note the deliberate absence: there is **no** table storing picked contacts, and none may be added (BR-1).

#### 16. Audit Requirements
- `party.created` per created party with `metadata.via='contacts'` (PTY-01 §16 already defines the `via` vocabulary), `after` containing the same fields as a form-created party.
- `party.bulk_created` — one summary row: `entity_type='party'`, `entity_id=NULL`, `metadata = { source: 'contacts', requested, created, skipped, skip_codes: { duplicate_mobile: 2, plan_limit_reached: 0 }, request_id }`.
- No audit row records which phone contacts were looked up: the lookup is a read, it is not attributable to a party that may not exist, and recording numbers that the user chose *not* to add would defeat BR-1. The lookup endpoint is nevertheless rate-limited and covered by the access log (numbers hashed).

#### 17. Notifications
Not applicable — no counterparty is contacted and no asynchronous work is scheduled. Parties created here are **not** messaged (BR-6: no consent record exists yet), which is an explicit non-behaviour worth stating: a merchant who imports 60 contacts does not spam 60 people.

#### 18. Analytics / Event Tracking
`ub.parties.contacts_supported { supported: bool, mechanism: 'web_api'|'capacitor'|'none' }` (once per session); `ub.parties.contacts_rationale_shown {}`; `ub.parties.contacts_rationale_action { action: 'choose'|'later' }`; `ub.parties.contacts_picker_opened { entry_point: 'empty_state'|'menu'|'form' }`; `ub.parties.contacts_picked { picked_count, with_multiple_numbers, without_name, invalid_numbers }`; `ub.parties.contacts_duplicates { new_count, existing_count, archived_count }`; `ub.parties.contacts_reviewed { checked_count, edited_names, changed_numbers, tagged: bool }`; `ub.parties.contacts_submitted { requested, chunks }`; `ub.parties.contacts_result { created, skipped, skip_codes }`; `ub.parties.contacts_denied { error: 'NotAllowedError'|'SecurityError'|'NotSupportedError' }`; `ub.parties.contacts_cancelled { stage: 'picker'|'review' }`. **No name, number or derived hash of either is ever included in an analytics property** — this is asserted by a test (T-PTY-07-12).

#### 19. Security
The privacy posture is the feature. (a) The Contact Picker API requires a secure context and transient activation and grants no persistent permission, so the app *cannot* read contacts outside a user gesture; the Capacitor path must use the OS picker for the same reason and its rationale screen is mandatory before the permission request. (b) Only normalised numbers leave the device before Save, and only for the duplicate check; the request body is `{ mobiles: [...] }` with no names — asserted in tests. (c) The lookup response is deliberately minimal (id, name, status) so it cannot be used to enumerate a tenant's parties by brute-forcing numbers; it is rate-limited to 30 calls/min/user (≤ 3,000 numbers/min) and audited in the access log with hashed numbers, and it is tenant-scoped so it reveals nothing about other tenants. (d) Picked data is never persisted client-side (BR-2), so a shared phone does not leak the previous user's picks. (e) `Idempotency-Key` prevents duplicate creation on retry. (f) Names from contacts are user content: control characters stripped, length-capped, escaped on render, and CSV-escaped on export. (g) DPDP: DigiKhaato processes only the contact data the user actively selects, for the stated purpose of creating a party record; the rationale screen is the notice, and PLT-10's export/delete covers the rights.

#### 20. Performance
Picker open ≤ 300 ms (OS). Duplicate lookup: one indexed `IN` query, P95 ≤ 400 ms for 100 numbers, ≤ 8 KB response. Bulk create: one transaction per chunk of 50 (the client chunks at 50 even though the endpoint allows 100, so the progress bar moves), each ≈ 4 statements (insert parties, insert tag joins, bulk audit insert, plan counter read) — 100 parties complete in ≤ 4 s. The review list renders ≤ 100 rows without virtualisation; each row is `memo`ised on its id so editing one name does not re-render the list. The feature's JS is `next/dynamic` and is not in the first-load bundle, which matters because it is unavailable on most desktops.

#### 21. Testing
- **T-PTY-07-1** unit: `detectContactsSupport` returns false without `navigator.contacts`, false in an insecure context, true on the Android Chrome shape; the result is cached per session.
- **T-PTY-07-2** unit: `mapPickedContact` trims and truncates names, normalises and de-duplicates numbers, marks landlines and non-`+91` numbers invalid, and preselects the first valid number.
- **T-PTY-07-3** unit: two picked contacts with the same normalised number collapse into one row.
- **T-PTY-07-4** unit: the lookup request body contains only `mobiles` and no name-like keys (guards BR-1).
- **T-PTY-07-5** API: `POST /parties/lookup-mobiles` returns a match for an active party, `status='archived'` for an archived one, null for unknown; a number belonging to another tenant returns null.
- **T-PTY-07-6** API: `POST /parties/bulk` creates valid rows, skips duplicates with `code='duplicate_mobile'` and `existing_party_id`, and returns per-row validation errors without failing the batch.
- **T-PTY-07-7** API: within-batch duplicate numbers → 400 with the offending index.
- **T-PTY-07-8** API: with 40 plan slots left and 60 rows, 40 are created and 20 are skipped with `plan_limit_reached`; `meta.remaining_plan_slots` is 0.
- **T-PTY-07-9** API: replayed `Idempotency-Key` with the same body returns the original response and creates nothing; a different body → 409 `idempotency_conflict`.
- **T-PTY-07-10** API: 101 rows → 400; 101 mobiles in the lookup → 400.
- **T-PTY-07-11** permission: staff can bulk-create; accountant gets 403 on create and 200 on lookup.
- **T-PTY-07-12** unit: the analytics emitter for every `contacts_*` event is asserted to carry no property whose value matches a phone-number or name pattern (guards §18).
- **T-PTY-07-13** component: the rationale sheet shows once and sets the `localStorage` flag; "Not now" closes without calling the picker.
- **T-PTY-07-14** component: rows matching existing parties are disabled with the badge and an Open link; the footer count excludes them.
- **T-PTY-07-15** component: a contact with two numbers renders a select; a contact without a name blocks checking until a name is typed.
- **T-PTY-07-16** component: review state is component-local — unmounting the drawer and remounting it yields an empty list (guards BR-2).
- **T-PTY-07-17** component: a `NotAllowedError` from the picker shows the denial sheet with the typing fallback.
- **T-PTY-07-18** E2E (mocked picker): pick 12 → review shows 9 new / 2 existing / 1 archived → tag all → add → result panel counts → party list contains the 9 with the tag.
- **T-PTY-07-19** E2E: chunked save of 100 with a failure on chunk 2 → "Retry the rest" resends only chunk 2 and 3 and no party is duplicated.
- **T-PTY-07-20** a11y: axe clean on the rationale and review screens; each row is a labelled group; invalid numbers are announced as text.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given an Android Chrome device, when I tap "Add from contacts" and pick one contact, then the review shows their name and normalised number, and adding creates a party with `mobile` in `+91XXXXXXXXXX` form.
- **AC-2 (US-2)** Given I pick 12 contacts, when I confirm, then up to 12 parties are created in one flow and the party list shows them without a manual refresh.
- **AC-3 (US-3)** Given I open the picker, when I inspect the network traffic, then no request contains any contact name or any number I did not pick, and nothing is sent until I press Add.
- **AC-4 (US-4)** Given two of my picked contacts are already parties, when the review loads, then those rows are marked "Already added", are unchecked and disabled, and offer a link to the existing party.
- **AC-5 (US-5)** Given a contact with three numbers and a misspelled name, when I correct the name and choose the second number, then the created party carries exactly those values.
- **AC-6 (US-6)** Given iOS Safari, when I open the Parties screen, then no "Add from contacts" entry point is shown and the empty state offers "Import from CSV" and "Add party" instead.

#### 23. Dependencies
PTY-01 (party creation rules, validation, duplicate semantics, `via` audit vocabulary), PTY-02 (empty state entry point, list upsert), PTY-04 (Restore for archived matches), PTY-05 (tag-all), PTY-10 (shared `POST /parties/bulk`, CSV fallback), PLT-15 (`max_parties`), LED-08 (consent requirement that keeps contacts-created parties un-messaged), PLT-10 (DPDP export/delete of the created data), `UbDrawer`, `UbPhoneInput`, `MLProgress`, `UbEmptyState`, CCR-29 (`/parties/lookup-mobiles`, `/parties/bulk`), ADR-020 (Capacitor path, Phase 3), a secure (HTTPS) origin.

#### 24. Future Enhancements
Capacitor native picker with the same adapter for iOS and for Android devices whose browser lacks the API (P3, ADR-020); optional on-device matching of the *whole* address book against existing parties, computed entirely in the browser with nothing transmitted, to suggest "12 of your contacts are already parties" (P3 — only if it can be done without sending anything, else dropped); pulling a contact's saved address into the party's billing address when the OS exposes it (`address` property, P3); capturing consent in the review screen when the tenant has `ledger.auto_sms` on, so contacts-created parties can be messaged immediately (P3, needs a DPDP review); vCard/`.vcf` file import as an iOS-friendly equivalent (P3, reuses PTY-10's pipeline); WhatsApp contact picker integration (not planned — no supported API); de-duplication suggestions after import that feed PTY-08's merge flow (P3).

---

### PTY-08 — Merge duplicate parties — Phase 2

#### 1. Business Objective
Duplicates are inevitable in a product used by several people at a busy counter: "Ramesh", "Ramesh Kirana" and "Ramesh bhai" become three khatas for one man, each holding part of the truth, and the balance the shopkeeper quotes is wrong. The mobile-uniqueness rule (PTY-01 BR-1) prevents the most common duplicate but cannot prevent one created without a number, with an alternate number, or before the number was known. Merge repairs the damage without violating the ledger's immutability: entries are **re-pointed**, not rewritten, the losing party is soft-deleted rather than destroyed, and every step is auditable and explainable to the customer. Success measures: a merge of two parties with 500 combined entries completes in ≤ 3 s; the merged balance always equals the arithmetic sum of the two source balances; zero ledger entries lost or duplicated across all merges (asserted by a reconciliation test); ≥ 80 % of merges initiated from a system-detected duplicate suggestion rather than from a manual search.

#### 2. User Personas
OW (the only role permitted — merging rewrites which khata a transaction belongs to, which is a governance-level action), AD (excluded at MVP of this feature; see §12), AC (read-only; sees the merge in the audit log and the statement).

#### 3. User Stories
1. **US-PTY-08-1** — As an owner, I want to merge two parties that are the same person so that one khata shows the true balance.
2. **US-PTY-08-2** — As an owner, I want to see exactly what will happen before I merge so that I do not destroy anything by accident.
3. **US-PTY-08-3** — As an owner, I want to choose which name, number and details survive so that the merged party is the correct record.
4. **US-PTY-08-4** — As an owner, I want the app to suggest likely duplicates so that I do not have to hunt for them.
5. **US-PTY-08-5** — As an owner, I want every invoice, payment and entry to move to the surviving party so that history is complete in one place.
6. **US-PTY-08-6** — As an auditor, I want the merge recorded with both records' details so that a past statement can still be explained.
7. **US-PTY-08-7** — As an owner, I want documents already issued to keep showing the details they were issued with so that a printed invoice still matches my books.

#### 4. Functional Requirements
- **FR-1** Terminology used throughout: the **target** (or survivor) is the party that remains; the **source** (or loser) is the party that is merged away and soft-deleted. The UI says "Keep" and "Merge into".
- **FR-2** Endpoint `POST /parties/{target_id}/merge` (**new, CCR-30**) `{ "source_id": uuid, "field_choices": { "name": "target"|"source", "mobile": …, "alt_phone": …, "email": …, "gstin": …, "gst_registration": …, "billing_address": …, "shipping_address": …, "state_code": …, "display_code": …, "credit_limit": …, "credit_days": …, "collection_date": …, "notes": "target"|"source"|"both" }, "reason": "Same person", "confirm_balance": "3200.00" }` → 200 `{ data: party, meta: { moved: { ledger_entries, sales_documents, purchase_documents, payments, expenses, reminders, attachments, share_links }, tags_merged, new_balance } }`.
- **FR-3** Re-pointing, all inside one `transaction.atomic()` with both party rows locked `FOR UPDATE` in a deterministic id order (deadlock avoidance):
  | Table | Action |
  |---|---|
  | `ledger_entry` | `UPDATE … SET party_id = target WHERE party_id = source` — the only mutation ever permitted on this table besides `status`/`reversed_by_id`; the `forbid_update_delete` trigger is amended to allow `party_id` changes made by the merge service, identified by a session GUC `app.merge_in_progress` (see §15) |
  | `sales_document` | `party_id` re-pointed; `party_snapshot`, `party_gstin_snapshot` **untouched** (BR-6) |
  | `purchases_document` | same |
  | `payments_payment` | `party_id` re-pointed |
  | `expenses_expense` | `party_id` re-pointed |
  | `ledger_reminder` | re-pointed; `scheduled` duplicates for the same `due_on`+`kind` are collapsed to one (the unique index demands it) |
  | `parties_party_tag` | union of both tag sets, capped at 10 (excess dropped, reported in `meta`) |
  | `parties_share_link` | source links are **revoked**, not moved (the token was issued for a party that no longer exists as such) |
  | `files_attachment` | rows with `owner_type='party'` re-pointed |
  | `platform_audit_log` | **never** re-pointed — history stays attached to the entity it happened to; the merge row ties them together |
- **FR-4** Field resolution: for each scalar field the caller chooses `target` or `source`; the default in the UI is `target` for every field except where the target's value is empty and the source's is not, in which case the source is preselected. `notes` additionally allows `both`, which concatenates as `"{target notes}\n---\n{source notes}"` truncated to 500 chars. `is_customer`/`is_supplier` are always the **OR** of both (a merged party is whatever either was).
- **FR-5** Balance: `target.balance = target.balance + source.balance` — computed by recomputing from `ledger_entry` after the re-point (`recalc_party_balance(target_id)`), never by adding the two cached values. `receivable_total`, `payable_total` and `last_activity_at` are recomputed the same way. `confirm_balance` in the request must equal the computed result or the call returns 409 `merge_balance_mismatch` with `details.expected` — this is the optimistic-concurrency guard that prevents merging on stale figures.
- **FR-6** Source disposal: `parties_party` row for the source gets `status='archived'`, `deleted_at = now()`, `mobile = NULL` (freeing the number for the unique index — the number is preserved in the audit snapshot and, when chosen, on the target), `merged_into_id = target_id` (**new nullable column, CCR-30**). The row is never hard-deleted, so old audit rows and any external reference still resolve.
- **FR-7** Redirect: `GET /parties/{source_id}` after a merge returns **301-equivalent** semantics in JSON — 200 with `{ data: target_party, meta: { merged_from: source_id, merged_at } }` and the header `Deprecation: true`; the web app detects `meta.merged_from` and replaces the route with the target's, showing a snackbar "This party was merged into {name}". Deep links from old notifications therefore never dead-end.
- **FR-8** Duplicate suggestions (`GET /parties/duplicates` — **new, CCR-30**): a scored list of candidate pairs computed on demand (not stored), using (a) identical normalised `mobile` — impossible for active parties but possible when one has it in `alt_phone`; (b) `similarity(name, name) ≥ 0.6` via `pg_trgm` within the tenant; (c) identical `gstin`; (d) identical `display_code`. Returns `[ { party_a: {…}, party_b: {…}, score, reasons: ['name_similar','same_gstin'] } ]`, max 50 pairs, ordered by score. Surfaced as a "Possible duplicates (4)" banner on PTY-02 and as a page `app/(app)/parties/duplicates/page.tsx`.
- **FR-9** Merge wizard (`PartyMergeDrawer`), three steps:
  1. **Choose** — pick the other party with a `UbAsyncCombobox` (excluding the current one and archived-deleted ones), or arrive with both preselected from a suggestion.
  2. **Compare & keep** — a two-column table of the two records, one row per field, each row a `MLRadioGroup` of the two values (with "—" for empty); a "Keep everything from {name}" shortcut at the top of each column; below, a read-only summary of what will move: "482 transactions · 12 bills · 9 payments · 3 reminders · 2 tags".
  3. **Confirm** — `UbReasonDialog`-style final step showing the resulting balance in large type ("Merged balance: You will get ₹3,200"), the required reason (≥ 3 chars), and an acknowledgement `MLCheckbox` "I understand this cannot be undone".
- **FR-10** Not undoable: there is no un-merge at Phase 2 (§24). The copy says so plainly and the acknowledgement is required. The audit snapshot is complete enough for a support-assisted manual reconstruction, which is documented in the runbook rather than offered as a product feature.
- **FR-11** Blocking conditions, all returning 409 before anything is written: merging a party into itself (`merge_self`), either party already merged/`deleted_at IS NOT NULL` (`party_deleted`), either party in a different tenant (404), a combined tag count issue is **not** blocking (FR-3 caps and reports), and a concurrent merge on either id (`merge_in_progress`, detected by the row lock with `NOWAIT` and surfaced as 409 rather than a hung request).
- **FR-12** Archived parties may be merged (both directions): merging an archived source into an active target is the common repair; merging an active source into an archived target is allowed and leaves the target archived with the combined balance, which PTY-04 BR-9 already accommodates.
- **FR-13** Credit limit and collection date follow the field choices; when the target's credit limit is chosen and the merged balance now exceeds it, no check fires (merge is not a credit-granting operation, PTY-06 BR-6) but the completion screen notes "{name} is now over their credit limit".
- **FR-14** After success: the wizard closes, the app routes to the target's khata page, a snackbar reads "Merged {source} into {target}", `partyListSlice` removes the source row and upserts the target, and the timeline shows the combined history in date order.

#### 5. Non-Functional Requirements
A merge of two parties with 500 combined ledger entries, 30 documents and 20 payments must complete in ≤ 3 s; at 10,000 entries, ≤ 15 s, executed as set-based `UPDATE`s (never row-by-row) inside one transaction. The comparison step must render without a second round trip (both party payloads are fetched in parallel when the wizard opens). The duplicate-suggestion query must return in ≤ 1.5 s at 10,000 parties using the trigram index, and is capped at 50 pairs. The wizard works at 320 px (the two-column comparison becomes a stacked "A or B" card per field). Accessibility: each field row is a radio group with an accessible name "{field}: choose {value A} or {value B}"; the resulting balance is announced; the acknowledgement checkbox is required by the form, not only visually. Copy `en`/`hi`. The operation is not offered offline.

#### 6. User Flow
Primary (from a suggestion): Parties → "Possible duplicates (4)" banner → duplicates page → a pair "Ramesh Kirana / Ramesh kirana store — names 82 % similar" → **Review** → wizard step 2 with both loaded → the owner keeps the longer name, the source's mobile (the target had none) and the target's address → step 3 shows "Merged balance: You will get ₹3,200", types the reason "Same shop, two entries", ticks the acknowledgement → **Merge** → 3 s progress → khata page of the survivor with 482 combined rows.
Alternate A (from the party page): PTY-03 ⋯ → Merge → step 1 asks which party to merge with → search → continue as above.
Alternate B (mismatch guard): another user posts an entry while the wizard is open → `confirm_balance` no longer matches → 409 `merge_balance_mismatch` → the wizard returns to step 3 with refreshed figures and the message "The balance changed while you were reviewing. Check the new figure and confirm again."
Alternate C (wrong direction): at step 2 the owner realises the other record should survive → a **Swap** control exchanges target and source and re-renders the comparison.
Alternate D (already merged): opening a merged party's old link → the app follows `meta.merged_from` to the survivor with a snackbar.
Alternate E (staff attempt): the menu item is absent; the endpoint returns 403.
Alternate F (concurrent merge): two owners merge overlapping pairs → the second gets 409 `merge_in_progress` with "Someone is merging this party right now. Try again in a moment."

#### 7. UI Requirements
Components: `PartyDuplicatesPageContent` (`UbPageShell` + `UbDataGrid` of candidate pairs with columns Party A, Party B, Why (reason chips), Balance A, Balance B, Review), `PartyMergeDrawer` (`UbDrawer` right 640 px desktop / full-height sheet mobile, with an `MLTabs`-free three-step header showing 1 · 2 · 3 and a back control), `MergeFieldRow` (feature component: label + two `MLRadioGroup` options rendered as selectable cards showing the value, with "—" and a muted "empty" label when absent), `MergeImpactSummary` (`MLCard` with counted rows and icons), `MergeConfirmPanel` (`UbAmount` at `ds-metric-md`, `MLTextarea` reason, `MLCheckbox` acknowledgement), `UbStatusBanner` (mismatch and error messages), `MLProgress` (during the merge).

Comparison rendering (desktop): a table with a sticky header carrying each party's name, balance and entry count, a "Keep everything from this one" button per column, and one row per field. Differences are highlighted with a left accent edge; identical values render once, greyed, with "Same" and no radio (nothing to choose). Mobile: each field becomes a card with two full-width option rows; identical fields are collapsed into a "12 fields are the same" disclosure.

The confirm step deliberately has no other content: the balance, the reason field, the acknowledgement and the two buttons — Cancel (secondary, focused) and **Merge** (outlined danger, enabled only when the reason and the acknowledgement are valid).

Keyboard: arrow keys move within a field's radio group, `Tab` moves between fields, `Cmd/Ctrl+Enter` advances a step, `Esc` closes with a "Discard this merge?" confirmation when past step 1.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `parties.merge.action` | Merge | मिलाएँ |
| `parties.merge.title` | Merge two parties | दो पार्टियाँ मिलाएँ |
| `parties.merge.step1` | Which party is the same? | कौन सी पार्टी वही है? |
| `parties.merge.step2` | Choose what to keep | क्या रखना है चुनें |
| `parties.merge.step3` | Confirm the merge | मिलाने की पुष्टि करें |
| `parties.merge.keepAllFrom` | Keep everything from {name} | {name} से सब कुछ रखें |
| `parties.merge.same` | Same | एक जैसा |
| `parties.merge.empty` | empty | ख़ाली |
| `parties.merge.swap` | Swap — keep {name} instead | बदलें — इसकी जगह {name} रखें |
| `parties.merge.impact.title` | What will move | क्या स्थानांतरित होगा |
| `parties.merge.impact.entries` | {count, plural, one {# transaction} other {# transactions}} | {count} लेन-देन |
| `parties.merge.impact.bills` | {count, plural, one {# bill} other {# bills}} | {count} बिल |
| `parties.merge.impact.payments` | {count, plural, one {# payment} other {# payments}} | {count} भुगतान |
| `parties.merge.impact.reminders` | {count, plural, one {# reminder} other {# reminders}} | {count} रिमाइंडर |
| `parties.merge.impact.tags` | Tags will be combined | टैग मिला दिए जाएँगे |
| `parties.merge.result.balance` | Merged balance | मिलाने के बाद बाक़ी |
| `parties.merge.reason` | Why are you merging these? | आप इन्हें क्यों मिला रहे हैं? |
| `parties.merge.acknowledge` | I understand this cannot be undone | मैं समझता/समझती हूँ कि इसे वापस नहीं किया जा सकता |
| `parties.merge.submit` | Merge {source} into {target} | {source} को {target} में मिलाएँ |
| `parties.merge.done` | Merged {source} into {target} | {source} को {target} में मिला दिया |
| `parties.merge.mismatch` | The balance changed while you were reviewing. Check the new figure and confirm again. | जाँच के दौरान बाक़ी बदल गया। नया आँकड़ा देखकर फिर पुष्टि करें। |
| `parties.merge.inProgress` | Someone is merging this party right now. Try again in a moment. | अभी कोई इस पार्टी को मिला रहा है। थोड़ी देर बाद कोशिश करें। |
| `parties.merge.selfError` | Choose a different party | कोई दूसरी पार्टी चुनें |
| `parties.merge.deletedError` | This party was already merged into {name} | यह पार्टी पहले ही {name} में मिलाई जा चुकी है |
| `parties.merge.redirected` | This party was merged into {name} | यह पार्टी {name} में मिला दी गई |
| `parties.merge.overLimitNote` | {name} is now over their credit limit | {name} अब अपनी उधार सीमा से ऊपर हैं |
| `parties.duplicates.banner` | {count, plural, one {# possible duplicate} other {# possible duplicates}} | {count} संभावित डुप्लिकेट |
| `parties.duplicates.title` | Possible duplicates | संभावित डुप्लिकेट |
| `parties.duplicates.reason.name` | Similar names | मिलते-जुलते नाम |
| `parties.duplicates.reason.mobile` | Same number | वही नंबर |
| `parties.duplicates.reason.gstin` | Same GSTIN | वही GSTIN |
| `parties.duplicates.dismiss` | Not duplicates | ये अलग हैं |
| `parties.duplicates.empty` | No duplicates found | कोई डुप्लिकेट नहीं मिला |

Copy rules: never the word "delete" for the source — "merged into" is used everywhere, because nothing is deleted from the books. The irreversibility is stated twice (step 3 body and the acknowledgement) and never buried. "Not duplicates" on a suggestion dismisses the pair for 180 days (stored in `platform_tenant_setting` key `parties.duplicate_dismissals` as a list of id pairs with timestamps, capped at 200 — **CCR-30**).

#### 9. States
**Initial** — wizard step 1 with an empty combobox, or step 2 when arriving from a suggestion. **Loading** — both party payloads and the impact counts load in parallel; step 2 shows a skeleton comparison. **Empty** — duplicates page with no candidates: `UbEmptyState` "No duplicates found" with a line explaining how detection works. **Success** — completion: route to the survivor with the snackbar; the duplicates banner count decreases. **Error** — 409s render as a `UbStatusBanner` inside the wizard at the step that can fix them (mismatch → step 3 with refreshed numbers; in-progress → step 3 with a Retry; deleted → step 1); 500 keeps every choice and offers Retry with the same body. **Disabled** — the Merge menu item is absent for non-owners; the Merge button is disabled until the reason and acknowledgement are valid. **Partial** — not possible: the merge is one transaction, so it either completes or changes nothing. This is stated in the UI ("Nothing changes unless the whole merge succeeds"). **Processing** — full-width `MLProgress` with "Merging 482 transactions…"; the drawer cannot be dismissed and the browser's unload warning is armed. **Completed** — the survivor's khata page with the combined timeline. **Failed** — banner with the message and `request_id`; the wizard keeps every field choice.

#### 10. Validation Rules
| Field | Rule | Message (en) | Code |
|---|---|---|---|
| `source_id` | required uuid, in tenant, `≠ target_id` | Choose a different party | `merge_self` (409) / 404 |
| either party | `deleted_at IS NULL` | This party was already merged into {name} | `party_deleted` (409, `details.merged_into_id`) |
| `field_choices.*` | each ∈ `target`, `source` (`notes` also `both`); unknown keys rejected | Unknown field choice | `validation_error` (`details.field_choices`) |
| resulting `mobile` | must not collide with a third party's mobile | That number belongs to {name} | `validation_error` (`details.mobile`, `details.existing_party_id`) |
| resulting `gstin` | structurally valid (PTY-01 rules) — it comes from one of the two records, so it already is | Check the GSTIN | `validation_error` |
| `reason` | required, 3–160 chars | Tell us why (at least 3 characters) | `validation_error` (`details.reason`) |
| `confirm_balance` | required, equals the recomputed merged balance | The balance changed while you were reviewing | `merge_balance_mismatch` (409, `details.expected`) |
| acknowledgement | client-side only, must be ticked | — | — |
| concurrency | neither party locked by another merge | Someone is merging this party right now | `merge_in_progress` (409) |
| permission | role = `owner` | Only the owner can merge parties | `permission_denied` (403) |

Yup: `mergeSchema = object({ sourceId: string().uuid().required().notOneOf([targetId]), fieldChoices: object(), reason: string().trim().min(3).max(160).required(), confirmBalance: string().required(), acknowledged: boolean().oneOf([true]) })`.

#### 11. Business Rules
- **BR-1** Ledger entries are re-pointed, never rewritten, copied or deleted: `amount`, `direction`, `entry_date`, `entry_type`, `source_type`, `source_id`, `created_at` and `created_by_id` are all preserved exactly. The only column that changes is `party_id`. This is the single sanctioned exception to the immutability rule of canon §0.11 and Part 21 §21.1.2, and it is enforced by a trigger guard (§15) so it cannot happen anywhere else in the codebase.
- **BR-2** The merged balance is **recomputed from the entries**, not added from the caches, and must equal the arithmetic sum of the two pre-merge balances; a discrepancy aborts the transaction with a 500 and an alert, because it means a cache was already wrong.
- **BR-3** Documents keep their snapshots: `sales_document.party_snapshot`, `party_gstin_snapshot` and the printed PDF are frozen at issue (Part 21 §21.3.7) and are **not** rewritten by the merge. A bill printed for "Ramesh kirana store" still says that, while the khata it belongs to is now the survivor's. This is correct: the document is a legal record of what was issued.
- **BR-4** The source is soft-deleted (`deleted_at` set) — the only user-facing path in the product that sets it (PTY-04 BR-1) — and keeps `merged_into_id` so every stale reference resolves.
- **BR-5** The source's mobile is cleared so the unique index no longer holds it; the number survives on the target when chosen, and in the audit snapshot regardless.
- **BR-6** Audit rows are never re-pointed: `platform_audit_log` rows referencing the source keep referencing it, and the `party.merged` row links the two ids. An auditor reconstructing history reads the merge row and then follows both ids.
- **BR-7** `is_customer`/`is_supplier` are OR-ed; `sms_opt_in` is `target OR source` **only when the chosen mobile's owning record had consent** — concretely, consent (`sms_opt_in`, `consent_source`, `consent_at`) is taken from the record whose `mobile` was chosen, because consent attaches to a phone number, not to a name. If the chosen mobile's record had no consent, the merged party has none.
- **BR-8** Tags are unioned and capped at 10 (PTY-05 BR-3); dropped tags are listed in `meta.tags_dropped` and in the audit row.
- **BR-9** Reminders are re-pointed; the `U(party_id, due_on, kind) WHERE kind IN ('auto_d1','auto_d0')` constraint means colliding auto-reminders are collapsed, keeping the one with the later `snapshot_balance`.
- **BR-10** Share links of the source are revoked, not moved (a token was issued against a specific party identity).
- **BR-11** Merging is not undoable at Phase 2. A support-assisted reversal is possible only from the audit snapshot and is a runbook procedure, not a product capability.
- **BR-12** A merge never changes stock, tax, document numbers, payment allocations or credit-note applications — only the party a row points at.

#### 12. Permissions
| Action | Codename / rule | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See duplicate suggestions | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| Dismiss a suggestion | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Open the merge wizard | role = `owner` **and** `parties.party.delete` | ✅ | ❌ | ❌ | ❌ |
| Execute a merge | role = `owner` **and** `parties.party.delete` | ✅ | ❌ | ❌ | ❌ |
| See merges in the audit log | `platform.audit.read` | ✅ | ✅ | ❌ | ✅ |

Merge is **owner-only by role**, not merely by codename — the second place in the product where a role is checked directly (PTY-06 BR-8 is the first), because it is the only operation that mutates a ledger column. Admins are deliberately excluded at Phase 2; a tenant that needs an admin to merge raises it as a Phase 3 permission-matrix item (PLT-12).

#### 13. Edge Cases
- **EC-1** Both parties have entries on the same date and time: the combined timeline orders by `(entry_date, created_at, id)`, which is stable and deterministic; no data is reordered, only interleaved.
- **EC-2** Source has a positive balance and target a negative one: the merged balance is the signed sum and may be zero — a perfectly normal outcome that the confirm step shows as "Settled".
- **EC-3** Both parties have a GSTIN and they differ: the field choice makes the owner pick one; the completion screen warns "The other GSTIN is kept only in the audit record", because two GSTINs usually mean two real businesses and the merge may be a mistake.
- **EC-4** Both have a mobile: the chosen one survives, the other is dropped (offered as `alt_phone` by a helper — the wizard preselects "keep the unchosen number as alternate" when `alt_phone` is empty on both).
- **EC-5** The resulting mobile collides with a **third** party: 400 with `details.existing_party_id`; the owner must merge that one first or choose the other number.
- **EC-6** Source has 50,000 entries: the merge runs as set-based updates; the wizard shows an indeterminate progress bar and the request timeout is raised to 60 s for this endpoint. Above 100,000 entries the endpoint returns 202 with a `platform_job` row and the work runs in the scheduler (ADR-012) with an in-app notification on completion — the wizard then shows "This will take a few minutes. We'll notify you."
- **EC-7** Merging a party that is referenced by a draft invoice: the draft's `party_id` is re-pointed like any other document, and its editor shows the survivor on next open.
- **EC-8** Merging while a reminder for the source is being sent by the scheduler: the scheduler reads the party inside its own transaction; the row lock serialises them, and a reminder sent a second earlier simply names the old party — acceptable, and the audit shows both.
- **EC-9** Both parties carry a credit limit: the field choice decides; FR-13 notes an over-limit result.
- **EC-10** Merging two archived parties: allowed; the survivor stays archived.
- **EC-11** Suggestion pair where one party was merged since the list was computed: opening it returns `party_deleted` (409) and the pair disappears from the list on refresh.
- **EC-12** Name similarity false positive ("Ramesh Kirana" vs "Rakesh Kirana", 0.62): the owner presses **Not duplicates**, which dismisses the pair for 180 days; the threshold is deliberately 0.6 (recall over precision) because a dismissal is cheap and a missed duplicate is not.
- **EC-13** Tenant with 3 tags on each party and 4 overlapping: the union is 2 + 2 + 4 = well under 10, nothing is dropped; a contrived 12-tag union drops the 2 least recently used and reports them.
- **EC-14** Network dies mid-merge: the transaction either committed or rolled back; the client re-fetches both parties on reconnect and shows the true state — there is no partial merge to clean up.
- **EC-15** The same pair merged twice by two owners simultaneously: the `NOWAIT` lock gives one a 409 `merge_in_progress`; after the winner commits, the loser's retry gets 409 `party_deleted` with the survivor's id.

#### 14. API Requirements
- **New endpoints (CCR-30)**:
  - `POST /parties/{target_id}/merge` — body and response per FR-2. Requires `Idempotency-Key` (a replay returns the original response; a second merge of an already-merged source returns 409 `party_deleted`). Errors: 400 `validation_error`, 403 `permission_denied`, 404, 409 `merge_self` / `party_deleted` / `merge_balance_mismatch` / `merge_in_progress`, 202 for the very large case (EC-6) with `{ data: { job_id }, meta: { estimated_rows } }`.
  - `GET /parties/duplicates?limit=50&min_score=0.6` → `{ data: [ { party_a, party_b, score, reasons[] } ], meta: { total, computed_at } }`. Requires `parties.party.read`; rate-limited 10/min/tenant (it is an expensive query).
  - `POST /parties/duplicates/dismiss` `{ party_a_id, party_b_id }` → 204; stores the pair in `platform_tenant_setting['parties.duplicate_dismissals']` with a timestamp.
  - `GET /parties/{id}/merge-preview?source_id=` → `{ data: { counts: { ledger_entries, sales_documents, purchase_documents, payments, expenses, reminders, attachments }, merged_balance, tag_union, tags_dropped, warnings: ['different_gstin','mobile_conflict'] } }` — powers step 2's impact summary and pre-validates without writing.
- **Delta (CCR-30)**: `GET /parties/{id}` returns 200 with `meta.merged_from` and `Deprecation: true` for a merged id (FR-7); `GET /parties` never lists soft-deleted parties in any status filter.
- Error codes registered: `merge_self`, `party_deleted`, `merge_balance_mismatch`, `merge_in_progress`.
- Frontend: `partyService.mergePreview(targetId, sourceId)`, `partyService.mergeParties(targetId, body, idempotencyKey)`, `partyService.listDuplicates(params)`, `partyService.dismissDuplicate(body)`; thunks `fetchMergePreview`, `mergeParties`, `fetchDuplicates`, `dismissDuplicate`; on fulfilment the slice dispatches `partyListSlice.actions.rowRemoved(sourceId)`, `rowUpserted(target)`, `partyDetailSlice.actions.partyUpserted(target)` and clears `partyTimelineSlice` for both ids.

#### 15. Database Impact
**New column (CCR-30)**: `parties_party.merged_into_id uuid NULL` FK to self `ON DELETE SET NULL`, with `IX(tenant_id, merged_into_id) WHERE merged_into_id IS NOT NULL`. Migration `0031_add_merged_into_to_party` per Part 21 §21.8.
**Trigger amendment (CCR-30)**: `ledger_entry`'s `forbid_update_delete()` currently permits updates only to `status` and `reversed_by_id`. It is amended to also permit `party_id` **when** `current_setting('app.merge_in_progress', true) = 'on'`; the merge service sets that GUC with `SET LOCAL` inside its transaction and nothing else in the codebase may set it (enforced by a grep-based CI check and by T-PTY-08-14). The same amendment is **not** made to `inventory_stock_movement` (stock has no party).
Writes: `UPDATE ledger_entry SET party_id` (set-based), the same for `sales_document`, `purchases_document`, `payments_payment`, `expenses_expense`, `ledger_reminder`, `files_attachment`; `INSERT … ON CONFLICT DO NOTHING` then `DELETE` for `parties_party_tag`; `UPDATE parties_share_link SET revoked_at`; `UPDATE parties_party` twice (target fields + recomputed caches; source status/deleted_at/mobile/merged_into_id); `INSERT platform_audit_log`.
Reads: both party rows `FOR UPDATE NOWAIT`; `COUNT(*)` per affected table for the preview (7 index-only counts); the recompute aggregate over `ledger_entry` by `IX(tenant_id, party_id, entry_date, created_at)`.
The duplicate query uses the existing `pg_trgm` GIN index on `name` with a self-join bounded by `similarity(a.name, b.name) >= 0.6 AND a.id < b.id`, `LIMIT 50`.

#### 16. Audit Requirements
One rich `party.merged` row is mandatory and must be sufficient to explain any later question:
`action='party.merged'`, `entity_type='party'`, `entity_id=target_id`,
`before = { target: <full target row before>, source: <full source row before> }`,
`after = { target: <full target row after> }`,
`metadata = { source_id, source_name, source_mobile, source_gstin, field_choices, reason, moved: { ledger_entries, sales_documents, purchase_documents, payments, expenses, reminders, attachments }, tags_merged, tags_dropped, revoked_share_links, balance_before_target, balance_before_source, balance_after, request_id, ip, actor_role }`.
Additionally: `party.archived` is **not** written for the source (it was merged, not archived — a distinct action keeps reports honest); `party.share_link.revoked` per revoked link with `metadata.via='party_merge'`; and no per-entry audit rows (a 50,000-row merge must not write 50,000 audit rows — the counts in `metadata.moved` are the record). Retention: this row falls under the 7-year financial retention rule (Part 21 §21.3.1).

#### 17. Notifications
In-app only. (a) When a merge is executed by an owner, other owners/admins receive `notifications_notification` `type='party_merged'`: "Ramesh kirana store was merged into Ramesh Kirana" with `data.route='/parties/{target_id}'` — a merge changes shared data and colleagues should not discover it by surprise. (b) The asynchronous path of EC-6 notifies the initiator on completion (`type='job_done'`). No SMS, WhatsApp or email; the party is never told, because from their point of view nothing changed — they always had one account.

#### 18. Analytics / Event Tracking
`ub.parties.duplicates_viewed { pair_count, top_score }`; `ub.parties.duplicate_dismissed { score, reasons }`; `ub.parties.merge_started { entry_point: 'suggestion'|'detail'|'list', score? }`; `ub.parties.merge_preview { entries_bucket, documents_bucket, has_gstin_conflict, has_mobile_conflict, balance_signs }`; `ub.parties.merge_field_choice { field, chose: 'target'|'source'|'both' }` (one per changed field, names and values never sent); `ub.parties.merge_swapped {}`; `ub.parties.merge_confirmed { entries_bucket, reason_length, duration_ms }`; `ub.parties.merge_failed { error_code }`; `ub.parties.merge_async { estimated_rows }`; `ub.parties.merged_link_redirect {}` (a stale link followed to the survivor).

#### 19. Security
Owner-only by role (§12), checked before any read of the source party, so a non-owner cannot even use the preview to probe another party's counts. Both ids are tenant-scoped; a cross-tenant `source_id` returns 404 and never reveals existence. The whole operation is one transaction with `FOR UPDATE NOWAIT` on both rows in ascending-id order, which prevents both deadlocks and TOCTOU on the balance. `confirm_balance` is an explicit, human-visible optimistic lock: a merge can never be executed against figures the owner did not see. The trigger GUC (§15) is scoped with `SET LOCAL`, so it cannot leak past the transaction, and CI forbids any other module from setting it — this is what keeps the ledger's immutability guarantee credible despite the exception. The audit snapshot contains personal data (both records in full) and is therefore readable only with `platform.audit.read`; it is covered by PLT-10's export and by the 7-year retention. `reason` is free text: control characters stripped, length-capped, escaped on render. Rate limits: 20 merges/hour/tenant, 10 duplicate scans/min/tenant. `Idempotency-Key` prevents a retry from attempting a second merge.

#### 20. Performance
The merge is O(rows) in set-based statements: 7 `UPDATE`s, 3 small statements for tags and links, 2 party updates, 1 recompute aggregate, 1 audit insert — 14 statements regardless of row count. Measured targets: 500 rows ≤ 3 s, 10,000 rows ≤ 15 s, 100,000 rows routed to the job runner (EC-6). Every `UPDATE` is driven by `party_id` indexes that already exist (`IX(tenant_id, party_id, …)` on `ledger_entry`, `IX(tenant_id, party_id, document_date DESC)` on documents, `IX(tenant_id, party_id, payment_date DESC)` on payments), so none of them scans. The preview's 7 counts are index-only and run in parallel with the two party fetches. The duplicate scan is the expensive query and is therefore on-demand, capped, rate-limited, and never run on page load of PTY-02 — the banner's count comes from the same endpoint with `limit=1` and a 10-minute client cache.

#### 21. Testing
- **T-PTY-08-1** unit: field resolution picks target by default, source when target is empty, OR-s the type flags, concatenates notes for `both`, and takes consent from the chosen mobile's record (BR-7).
- **T-PTY-08-2** unit: `mergeSchema` rejects a 2-char reason, a missing acknowledgement and `sourceId === targetId`.
- **T-PTY-08-3** API: merge re-points every `ledger_entry` row; row count before equals row count after; every non-`party_id` column is byte-identical (snapshot comparison).
- **T-PTY-08-4** API: merged balance equals the sum of the two pre-merge balances and equals the recomputed sum from entries (property test over 50 random ledgers).
- **T-PTY-08-5** API: documents are re-pointed but `party_snapshot` and `party_gstin_snapshot` are unchanged (BR-3).
- **T-PTY-08-6** API: source gets `deleted_at`, `status='archived'`, `mobile=NULL`, `merged_into_id=target`; `GET /parties/{source}` returns the target with `meta.merged_from` and the `Deprecation` header.
- **T-PTY-08-7** API: `confirm_balance` mismatch → 409 `merge_balance_mismatch` with `details.expected` and nothing written.
- **T-PTY-08-8** API: merging into self → 409 `merge_self`; merging an already-merged source → 409 `party_deleted` with `details.merged_into_id`; cross-tenant source → 404.
- **T-PTY-08-9** API: resulting mobile colliding with a third party → 400 with `existing_party_id`.
- **T-PTY-08-10** API: tags unioned and capped at 10 with `tags_dropped` reported; colliding auto-reminders collapsed per BR-9; source share links revoked.
- **T-PTY-08-11** API (concurrency): two simultaneous merges of the same pair → one 409 `merge_in_progress`, the other succeeds; two merges of overlapping pairs (A→B and B→C) serialise without deadlock.
- **T-PTY-08-12** API: an entry posted to the source between preview and confirm changes the balance and triggers the mismatch guard.
- **T-PTY-08-13** API: `GET /parties/duplicates` finds a same-GSTIN pair, a 0.82-similarity name pair and a same-number-in-alt_phone pair; a dismissed pair is absent; results are capped at 50.
- **T-PTY-08-14** DB: an `UPDATE ledger_entry SET party_id` outside the merge service (without the GUC) is refused by the trigger; inside the service it succeeds; the GUC does not survive the transaction.
- **T-PTY-08-15** DB: after a merge, `manage.py recalc_balances` produces no change (caches are already correct).
- **T-PTY-08-16** permission: admin, staff and accountant all get 403 on merge and on preview; all four roles can read the duplicates list.
- **T-PTY-08-17** component: the comparison collapses identical fields, highlights differences, and the Swap control exchanges the two columns and re-renders choices.
- **T-PTY-08-18** component: the Merge button stays disabled until the reason is ≥ 3 chars and the acknowledgement is ticked.
- **T-PTY-08-19** E2E: merge from a suggestion, land on the survivor, verify the timeline contains rows from both sources in date order and the header balance equals the sum.
- **T-PTY-08-20** E2E: open the old party's URL after the merge and land on the survivor with the explanatory snackbar.
- **T-PTY-08-21** audit: the `party.merged` row contains both full before-rows, the field choices, the moved counts and the reason; no per-entry audit rows were written.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given two parties with balances ₹2,000 and ₹1,200, when I merge the second into the first, then one party remains with a balance of ₹3,200 and the other is no longer in any list.
- **AC-2 (US-2)** Given the merge wizard at step 2, when I read the impact summary, then it states the exact counts of transactions, bills, payments and reminders that will move, and step 3 states the resulting balance before I confirm.
- **AC-3 (US-3)** Given the two records differ in name, number and address, when I choose one value per field, then the surviving party carries exactly those values and the others appear only in the audit record.
- **AC-4 (US-4)** Given two parties whose names are 82 % similar, when I open the Parties screen, then a "Possible duplicates" banner offers the pair, and "Not duplicates" removes it from the list.
- **AC-5 (US-5)** Given the source had 482 transactions, 12 bills and 9 payments, when the merge completes, then all 503 records appear under the survivor and none remain under the source.
- **AC-6 (US-6)** Given a completed merge, when I open the audit log, then one `party.merged` entry shows who merged, when, why, both records as they were, and the counts moved.
- **AC-7 (US-7)** Given an invoice issued to "Ramesh kirana store", when I open or reprint it after the merge, then it still shows "Ramesh kirana store" as the billed party while its ledger entry belongs to the survivor.

#### 23. Dependencies
PTY-01 (party fields, mobile uniqueness, GSTIN validation), PTY-02 (list removal, duplicates banner), PTY-03 (merge menu item, combined timeline, merged-link redirect), PTY-04 (soft-delete semantics distinct from archive), PTY-05 (tag union and cap), PTY-06 (over-limit note after merge), PTY-07/PTY-10 (the flows that create most duplicates), LED-01/LED-03 (entries being re-pointed), LED-06/LED-07 (reminder re-pointing and collision collapse), SAL-02/PUR-01/PAY-01/EXP-01 (documents re-pointed; snapshots preserved), PLT-08 (audit viewer), PLT-12 (Phase 3 permission matrix for admin merge), NTF-01 (in-app notifications), `platform_job` + the scheduler (ADR-012) for the async path, `pg_trgm`, CCR-30 (endpoints, `merged_into_id`, trigger amendment, dismissal setting).

#### 24. Future Enhancements
Un-merge within a short window (e.g. 24 h) implemented by replaying the audit snapshot — deliberately deferred because it doubles the invariant surface (P3); merging more than two parties in one pass (P3); automatic merge suggestions surfaced at creation time ("this looks like Ramesh Kirana — merge instead?") (P2, reuses `GET /parties/duplicates` scoring); background duplicate scanning as a scheduled job writing a `notifications_notification` monthly (P3); fuzzy matching across scripts (Devanagari ↔ Latin) once transliteration lands (P3, shared with PTY-02's search enhancement); merging items with the same mechanism (INV-14, P3); a tenant-level "merge history" page listing past merges with links to both audit rows (P3).

---

### PTY-09 — Party self-view link — Phase 2

#### 1. Business Objective
Disputes about udhaar are almost always disputes about memory: the customer remembers paying, the shopkeeper's book says otherwise, and the argument costs both the money and the relationship. A read-only link the customer can open on their own phone — no app to install, no account to create, no OTP to fumble — turns the shopkeeper's book into a shared record and converts a large share of "I'll check and come back" into a payment. It is also the cheapest collection tool available: research §B.2 shows the WhatsApp-shared khata is the single behaviour that drove Khatabook's growth. The design constraint is that the link exposes one party's financial history to anyone holding it, so it must be unguessable, expiring, revocable, minimal and rate-limited. Success measures: ≥ 35 % of shared links opened within 24 h; ≥ 15 % of opens followed by a payment within 72 h; zero incidents of a link exposing another party's data; median link open-to-render ≤ 1.5 s on 3G.

#### 2. User Personas
CU (the end customer — the primary persona, unauthenticated, on a phone, possibly low-literacy), OW and ST (create and revoke links, see open counts), AC (read-only visibility of links in the audit log).

#### 3. User Stories
1. **US-PTY-09-1** — As a customer, I want to open a link and see what I owe and every entry behind it so that I can check the shopkeeper's book myself.
2. **US-PTY-09-2** — As a customer, I want to see the shop's name and number so that I know who is asking and can call them.
3. **US-PTY-09-3** — As a customer, I want to pay from the same page so that checking and paying are one step.
4. **US-PTY-09-4** — As a shopkeeper, I want to send this link on WhatsApp in one tap so that it fits the way I already talk to customers.
5. **US-PTY-09-5** — As a shopkeeper, I want the link to expire and to be revocable so that an old message does not keep showing my customer's khata forever.
6. **US-PTY-09-6** — As a shopkeeper, I want to know whether the customer opened it so that I know whether to call.
7. **US-PTY-09-7** — As a shopkeeper, I want the page to show only what the customer needs so that my costs, my other customers and my internal notes are never visible.
8. **US-PTY-09-8** — As a customer, I want the page in Hindi so that I can read it.

#### 4. Functional Requirements
- **FR-1** Data model: `parties_share_link` (Part 21 §21.3.3) — `party_id`, `token_hash U`, `expires_at`, `revoked_at`, `view_count`. **Extended (CCR-31)** with `kind varchar(16) NN default 'khata'` (`khata` = this feature's live self-view; `statement` = PTY-03's one-off statement share), `created_by_id`, `last_viewed_at timestamptz NULL`, `label varchar(40) NULL`, `token_suffix varchar(6)` (the last 6 characters of the token, stored plain, so the UI can distinguish links without holding the secret).
- **FR-2** Creation: `POST /parties/{id}/share-links` `{ kind: 'khata', expires_in_days: 30, label?: 'WhatsApp Sep' }` → 201 `{ data: { id, url, token_suffix, kind, expires_at, created_at } }`. The full URL is returned **once and only once**; thereafter only `token_suffix` is available. `expires_in_days` ∈ 1–90, default 30 for `khata` (7 for `statement`). Max 5 active links per party (409 `share_link_limit`, with the option to revoke the oldest).
- **FR-3** Token: 32 cryptographically random bytes, base64url-encoded to 43 characters, prefixed `k_` for `khata`. Only `sha256(token)` is stored. URL shape `https://<tenant-or-partner-host>/k/<token>` (public route `app/(public)/k/[token]/page.tsx`), which resolves to the API `GET /public/khata/{token}` (canon §0.8 already reserves this path).
- **FR-4** Public payload (`GET /public/khata/{token}`, unauthenticated) — deliberately minimal:
  ```json
  { "data": {
      "business": { "name": "Sharma Kirana", "logo_url": "…", "phone": "+919812345678",
                    "upi_vpa": "sharma@okaxis", "address_line": "Camp, Pune", "locale": "hi" },
      "party": { "name": "Ramesh", "masked_mobile": "98765 4••••" },
      "balance": { "amount": "2300.00", "direction": "party_owes", "as_of": "2026-09-18" },
      "entries": [ { "date": "2026-09-14", "title": "Invoice INV/26-27/0042", "kind": "debit",
                     "amount": "898.00", "running_balance": "2300.00", "note": "" } ],
      "meta": { "expires_at": "…", "generated_at": "…", "entry_count": 42, "has_more": true, "next_cursor": "…" } } }
  ```
  **Never included**: cost prices, margins, item-level costs, other parties, the tenant's other balances, internal notes (`parties_party.notes`), tags, credit limit and usage, collection date, staff names, audit data, GSTIN of the party (the business's own GSTIN is shown, as it is on any invoice), full mobile numbers, or any id that could be enumerated.
- **FR-5** Page structure (`app/(public)/k/[token]/page.tsx`, server-rendered, no authentication, no app shell, no Redux): business header (logo, name, "Call" button), the balance block in the customer's own frame of reference ("You have to pay ₹2,300" / "{business} has to pay you ₹2,300"), a **Pay now** block when the tenant has a UPI VPA (FR-7), the transaction list with running balances, and a footer with "This link was shared by {business}. It expires on {date}." plus a language switcher.
- **FR-6** Direction language: the page speaks from the **customer's** side, which is the inverse of the merchant app. `balance.direction = 'party_owes'` (the party owes the business, `balance > 0`) renders "You have to pay ₹2,300"; `'business_owes'` renders "{business} has to pay you ₹2,300"; zero renders "Your account is settled". Entry rows read "You took" / "You paid" rather than "You gave" / "You got". Colour semantics are **not** inverted (red still marks what is owed to the business) but the label always carries the meaning, so a customer is never misled by colour alone.
- **FR-7** Pay now: when `tenant.upi_vpa` is set and the balance is `party_owes`, the page shows a `UbQrCode` (locally generated UPI intent, PAY-04) and, on mobile, an "Open UPI app" button producing `upi://pay?pa=<vpa>&pn=<business>&am=<amount>&tn=<note>&cu=INR`. The amount defaults to the full balance and is editable in a small input. **No payment is recorded by this page** — the merchant records it as usual (PAY-01); the page shows the note "After paying, {business} will update your khata."
- **FR-8** Pagination: the first 25 entries are server-rendered; "Show older" fetches the next cursor page. Total entries are capped at 500 over the life of a link view session; beyond that the page shows "Showing the last 500 entries. Ask {business} for a full statement."
- **FR-9** Management UI (merchant side): PTY-03 ⋯ → **Share khata link** opens `ShareLinkDrawer` listing active links (label, `token_suffix`, created, expires, views, last viewed) with actions **Copy** (only possible immediately after creation — thereafter the item shows "Link hidden · Create a new one"), **Share on WhatsApp**, **Revoke**. A **New link** button with an expiry `MLSelect` (7 / 30 / 90 days) and an optional label.
- **FR-10** Revocation: `DELETE /parties/{id}/share-links/{link_id}` → 204, sets `revoked_at`. Any subsequent fetch returns **410 `link_revoked`**. Links are also revoked automatically when the party is archived (PTY-04 FR-7), when the party is merged away (PTY-08 BR-10), when the tenant is suspended or pending deletion (PLT-10), and when the tenant owner rotates all links from Settings (`POST /tenants/current/share-links/revoke-all`, **CCR-31**).
- **FR-11** Expiry: a link past `expires_at` returns **410 `link_expired`**; the public page renders a neutral "This link has expired" screen with the business name and phone so the customer can ask for a new one, and nothing else.
- **FR-12** View tracking: each successful render increments `view_count` and sets `last_viewed_at`, throttled to one increment per token per 10 minutes per IP hash so a refresh loop does not inflate it. The merchant sees "Opened 3 times · last 2 hours ago"; no IP, device or location is stored or shown.
- **FR-13** Language: the public page picks its locale from, in order, an explicit `?lang=hi` parameter, the party's `parties.message_locale` when set, the tenant's `locale`, then `Accept-Language`, defaulting to `hi` for Indian locales and `en` otherwise. A two-option switcher (English / हिंदी) is always present and persists the choice in `localStorage` for that browser.
- **FR-14** No account, no OTP: the token is the credential (hence the naming "OTP-less"). The page has no login, no form that writes anything, and no cookie other than the language preference.
- **FR-15** Robots and previews: `<meta name="robots" content="noindex, nofollow, noarchive">`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` on the API and page responses, and Open Graph tags that reveal **only** the business name and a generic description ("Your khata") — never the party's name or any amount, so a WhatsApp link preview in a group chat leaks nothing.

#### 5. Non-Functional Requirements
The page must render in ≤ 1.5 s on 3G Fast on a low-end Android: it is a server-rendered route with inlined critical CSS, a single font subset, no client Redux, no analytics SDK, and a JS payload ≤ 25 KB gzipped (the QR is inline SVG, generated locally per ADR-013/PAY-04). It must be readable at 320 px and legible at a 200 % browser zoom. Accessibility: WCAG 2.2 AA, a single `h1` carrying the balance sentence, the entry list as a real table with a caption, 4.5:1 contrast on every amount, and a language switcher that is a real link (works without JS). The page works with JavaScript disabled except for "Show older" and the UPI button. Copy is written for low literacy: short sentences, numbers in Indian grouping, no jargon, no "debit"/"credit". Availability: the public endpoint is served by the same backend but is isolated behind its own rate-limit bucket so a link storm cannot degrade the merchant app.

#### 6. User Flow
Primary (customer): WhatsApp message → tap the link → page loads in Hindi → "आपको ₹2,300 देने हैं" with the shop's name and logo → scrolls the 12 rows → taps **Open UPI app** → pays → returns and sees the same page (the balance updates only after the shopkeeper records the payment).
Primary (merchant): PTY-03 → ⋯ → Share khata link → **New link** (30 days, label "WhatsApp") → the URL is shown once with **Copy** and **Share on WhatsApp** → WhatsApp opens with the message text and the link → send.
Alternate A (expired): the customer opens an old link → "This link has expired" with the shop's name and a **Call** button.
Alternate B (revoked): same shape, "This link is no longer available" — deliberately identical in tone so a revocation does not read as an accusation.
Alternate C (settled): balance zero → "Your account is settled ✓" (no tick glyph — Koper forbids emoji; a lucide check icon) with the history still shown.
Alternate D (business owes the customer): "Sharma Kirana has to pay you ₹400" with no Pay block.
Alternate E (merchant review): ShareLinkDrawer shows 2 active links, one opened 3 times, one never → the merchant revokes the unused one.
Alternate F (limit): creating a 6th active link → 409 with "You can have 5 active links for a party. Revoke one first." and a list to revoke from.
Alternate G (no UPI configured): the Pay block is absent and the footer says "Pay {business} directly" with the Call button.

#### 7. UI Requirements
Public page components (a separate, minimal component set under `features/publicKhata/`, **not** the app's `Ub*` shell — the public page must not import the authenticated app's bundle): `PublicKhataHeader` (logo `MLAvatar`-style circle, business name `ds-h3`, Call button), `PublicBalanceCard` (`MLCard` with the sentence at `ds-h2` and the amount at `ds-metric-lg`, tone by direction), `PublicPayBlock` (`UbQrCode` inline SVG, amount `MLInput`, "Open UPI app" `MLButton`, helper line), `PublicEntryTable` (semantic `<table>`: Date · What happened · Amount · Balance, with date grouping on mobile as stacked rows), `PublicFooter` (expiry line, language switcher, "Powered by {appName}" only when the partner's branding allows it — WLB-01), `PublicNotice` (the expired/revoked/not-found screen).

Merchant-side components: `ShareLinkDrawer` (`UbDrawer` with an `MLTable` of links, a create form and per-row ⋯), `UbShareSheet` (reused from PTY-03), `UbConfirmDialog` for revoke, `UbStatusBadge` for Active/Expired/Revoked.

Mobile-first public layout: 16 px gutters, a 56 px sticky header with the business name, the balance card immediately below the fold-free area, the Pay block next, then the table. Desktop: the same single column centred at 560 px — the page is never a dashboard.

Branding: the public page uses the tenant's `branding.primary_hex` through the same token mechanism as the app (WLB-01/WLB-05), so a partner-branded tenant's customers see the partner's colour. Surfaces, ledger colours and typography are not tenant-configurable (Part 23 §23.2.4).

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `public.khata.title` | Your khata with {business} | {business} के साथ आपका खाता |
| `public.khata.youOwe` | You have to pay ₹{amount} | आपको ₹{amount} देने हैं |
| `public.khata.businessOwes` | {business} has to pay you ₹{amount} | {business} को आपको ₹{amount} देने हैं |
| `public.khata.settled` | Your account is settled | आपका हिसाब बराबर है |
| `public.khata.asOf` | as on {date} | {date} तक |
| `public.khata.entries.title` | Your transactions | आपके लेन-देन |
| `public.khata.entries.date` | Date | तारीख़ |
| `public.khata.entries.what` | What happened | क्या हुआ |
| `public.khata.entries.amount` | Amount | राशि |
| `public.khata.entries.balance` | Balance | बाक़ी |
| `public.khata.entries.took` | You took | आपने लिया |
| `public.khata.entries.paid` | You paid | आपने दिया |
| `public.khata.entries.opening` | Opening balance | शुरुआती बाक़ी |
| `public.khata.entries.bill` | Bill {number} | बिल {number} |
| `public.khata.entries.writeOff` | Amount written off | राशि माफ़ की गई |
| `public.khata.showOlder` | Show older | पुराने दिखाएँ |
| `public.khata.capped` | Showing the last 500 entries. Ask {business} for a full statement. | पिछले 500 लेन-देन दिख रहे हैं। पूरा हिसाब {business} से माँगें। |
| `public.khata.pay.title` | Pay now | अभी भुगतान करें |
| `public.khata.pay.scan` | Scan this QR with any UPI app | किसी भी UPI ऐप से यह QR स्कैन करें |
| `public.khata.pay.open` | Open UPI app | UPI ऐप खोलें |
| `public.khata.pay.after` | After paying, {business} will update your khata. | भुगतान के बाद {business} आपका खाता अपडेट करेंगे। |
| `public.khata.call` | Call {business} | {business} को कॉल करें |
| `public.khata.footer.shared` | This link was shared by {business}. | यह लिंक {business} ने भेजा है। |
| `public.khata.footer.expires` | It expires on {date}. | यह {date} को समाप्त होगा। |
| `public.khata.expired.title` | This link has expired | यह लिंक समाप्त हो गया |
| `public.khata.expired.body` | Ask {business} for a new link. | {business} से नया लिंक माँगें। |
| `public.khata.revoked.title` | This link is no longer available | यह लिंक अब उपलब्ध नहीं है |
| `public.khata.notFound.title` | This link is not valid | यह लिंक मान्य नहीं है |
| `public.khata.language` | English | हिंदी |
| `parties.shareLink.title` | Khata link | खाता लिंक |
| `parties.shareLink.new` | New link | नया लिंक |
| `parties.shareLink.expiry` | Expires in | समाप्ति |
| `parties.shareLink.label` | Label (optional) | लेबल (वैकल्पिक) |
| `parties.shareLink.copyOnce` | Copy it now — you will not see it again | अभी कॉपी करें — यह दोबारा नहीं दिखेगा |
| `parties.shareLink.hidden` | Link hidden · Create a new one | लिंक छिपा है · नया बनाएँ |
| `parties.shareLink.views` | Opened {count, plural, one {# time} other {# times}} | {count} बार खोला गया |
| `parties.shareLink.neverOpened` | Not opened yet | अभी तक नहीं खोला |
| `parties.shareLink.lastViewed` | Last opened {relative} | आख़िरी बार {relative} |
| `parties.shareLink.revoke` | Revoke | रद्द करें |
| `parties.shareLink.revoke.confirm` | Revoke this link? Anyone holding it will stop seeing the khata. | यह लिंक रद्द करें? जिसके पास यह है वह खाता देखना बंद कर देगा। |
| `parties.shareLink.revoked` | Link revoked | लिंक रद्द हो गया |
| `parties.shareLink.limit` | You can have 5 active links for a party. Revoke one first. | एक पार्टी के लिए 5 सक्रिय लिंक हो सकते हैं। पहले एक रद्द करें। |
| `parties.shareLink.whatsapp` | {business}: see your khata — balance ₹{amount}. {link} | {business}: अपना खाता देखें — बाक़ी ₹{amount}. {link} |

Copy rules: the public page never uses "udhaar" as an accusation, never names other parties, never shows the shop's internal vocabulary, and never asks the customer to do anything other than look and (optionally) pay. The expired and revoked screens are deliberately indistinguishable in tone. The merchant-side copy states plainly that a link cannot be re-copied, because that is the security property that makes accidental re-sharing less likely.

#### 9. States
**Public page — Initial/Success**: fully server-rendered. **Loading**: only "Show older" has a loading state (an inline spinner in the button). **Empty**: a party with zero entries → "No transactions yet" with the balance card showing "settled". **Error**: 410 expired, 410 revoked, 404 not valid — three distinct neutral screens; a 500 shows "Something went wrong. Try again in a minute." with the business phone. **Disabled/Partial/Processing/Completed/Failed**: not applicable — the page performs no writes.
**Merchant drawer — Initial**: list of links with skeletons. **Empty**: "No khata link yet" with the create form inline. **Success**: the newly created link is shown expanded with the URL, Copy and Share, and a warning that it is shown once. **Error**: 409 limit → the create form is replaced by the revoke-one list. **Processing**: creating shows "Creating…"; revoking shows a spinner on the row. **Completed**: snackbar "Link revoked"/"Link created".

#### 10. Validation Rules
| Field | Rule | Message (en) | Code |
|---|---|---|---|
| `kind` | ∈ `khata`, `statement` | Unknown link type | `validation_error` (`details.kind`) |
| `expires_in_days` | integer 1–90 (`khata`), 1–30 (`statement`) | Choose between 1 and 90 days | `validation_error` |
| `label` | ≤ 40 chars, optional | Keep the label under 40 characters | `validation_error` |
| active links per party | ≤ 5 | You can have 5 active links for a party | `share_link_limit` (409) |
| `token` (public) | 43-char base64url after the `k_` prefix; any other shape → 404 without a DB lookup | This link is not valid | `not_found` (404) |
| token state | not expired | This link has expired | `link_expired` (410) |
| token state | not revoked | This link is no longer available | `link_revoked` (410) |
| party state | not soft-deleted (merged away) | This link is no longer available | `link_revoked` (410) |
| tenant state | `active` | This link is no longer available | `link_revoked` (410) |
| `cursor` (public) | opaque, signed; tampering → 400 | — | `validation_error` |
| `lang` | ∈ `en`, `hi` | ignored when unknown | — |

#### 11. Business Rules
- **BR-1** The token is the only credential. It is 256 bits of entropy, stored only as a SHA-256 hash, shown exactly once, and never logged — not in access logs (the path is redacted to `/k/<redacted>`), not in analytics, not in the audit metadata (only `token_suffix`).
- **BR-2** A link grants read access to exactly one party's khata in one tenant, and to nothing else. There is no id in the URL and no parameter that changes which party is shown, so there is nothing to tamper with.
- **BR-3** The page is read-only in the strongest sense: the public endpoint accepts only `GET`, the route has no form that posts anywhere, and no write path in the backend is reachable from it. Payment is an external UPI action.
- **BR-4** Links expire by time (`expires_at`, default 30 days) and can be revoked at any moment; revocation and expiry are both immediate and both return 410.
- **BR-5** Cascading revocation is automatic on party archive (PTY-04), party merge (PTY-08), tenant suspension and tenant deletion request (PLT-10) — the link must never outlive the relationship or the tenant.
- **BR-6** The payload is a whitelist, not a filtered model: the serializer enumerates the fields it emits, so a new column on `parties_party` can never leak by default. This is asserted by a test that snapshots the public response keys (T-PTY-09-6).
- **BR-7** Amounts and running balances come from the same service as LED-04's statement, so the customer's page and the merchant's statement can never disagree.
- **BR-8** Corrections are shown the way the merchant's statement shows them with corrections hidden: a reversed entry and its reversal are omitted and only the superseding entry appears. The customer sees the truth, not the bookkeeping.
- **BR-9** View counting is throttled (FR-12) and stores no identifier: `view_count`, `last_viewed_at` and nothing else. The merchant learns *that* it was opened, never *where* or *by whom*.
- **BR-10** The customer is never asked to consent to anything on this page and is never enrolled in messaging by opening it; consent for SMS/WhatsApp remains PTY-01 FR-10's separate record.
- **BR-11** One link per creation: there is no "regenerate" that keeps the same URL. Rotating means revoking and creating, which is explicit.
- **BR-12** The public route is excluded from the app's service worker and from any offline cache, so a khata never persists on a shared phone after the tab is closed (beyond normal browser cache, which is suppressed with `Cache-Control: no-store`).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant | public |
|---|---|---|---|---|---|---|
| View the public khata page | token only | — | — | — | — | ✅ (with a valid token) |
| Create a khata link | `ledger.statement.export` | ✅ | ✅ | ✅ | ✅ | ❌ |
| See the list of links and their view counts | `parties.party.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| Revoke a link | `ledger.statement.export` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Revoke all links for the tenant | `platform.tenant.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| See link events in the audit log | `platform.audit.read` | ✅ | ✅ | ❌ | ✅ | ❌ |

Staff can create and revoke because sharing a statement is part of collecting; the accountant can create (they share statements for reconciliation) but not revoke someone else's. No new codenames are introduced.

#### 13. Edge Cases
- **EC-1** The customer forwards the link to someone else: that person sees the khata. This is inherent to a link-based credential and is why expiry, revocation, the once-only copy and the leak-free link preview (FR-15) exist; the merchant-side copy says "anyone holding this link can see the khata".
- **EC-2** The link is opened after the party is archived: 410 `link_revoked` (PTY-04 revoked it), with the neutral screen.
- **EC-3** The party is merged away: the source's links were revoked (PTY-08 BR-10); the survivor's links keep working and show the combined history.
- **EC-4** Balance changes while the page is open: the page is a snapshot; a refresh shows the new figures and `meta.generated_at` states the time.
- **EC-5** A party with 5,000 entries: the first 25 render, "Show older" paginates, and the 500-row cap (FR-8) applies with the explanatory line.
- **EC-6** The tenant has no logo: the header shows the business name in a neutral circle with its initials.
- **EC-7** The tenant has no UPI VPA: no Pay block; the Call button is the only action.
- **EC-8** The customer's browser blocks `upi://`: the QR remains, and a "Copy UPI ID" button is offered as a fallback.
- **EC-9** A brute-force attempt against `/k/<token>`: the shape check rejects malformed tokens without touching the database, and the IP bucket limits attempts to 30/min with an exponential backoff after 100 failures/hour; a 256-bit token is not guessable regardless.
- **EC-10** The token appears in a screenshot shared in a group: the merchant revokes it from the drawer, and the link dies immediately.
- **EC-11** The tenant is suspended for non-payment: 410 for every link; the screen names the business but shows no data.
- **EC-12** Two links exist for the same party: both work independently, each with its own expiry, label and view count — this supports "one for WhatsApp, one for the field agent".
- **EC-13** The customer opens the link on a desktop: the layout centres at 560 px; the QR is the primary payment affordance because `upi://` does not work on desktop.
- **EC-14** The party's name contains an emoji or an unusual script: rendered as text with the Devanagari-capable font stack; never used in the OG preview (FR-15).
- **EC-15** A statement-kind link (PTY-03 FR-4) is opened at `/k/<token>`: the route accepts both kinds; `statement` renders the same page but frozen to the date range it was created for, with "Statement for 01/08/2026 – 31/08/2026" in the header and no Pay block.

#### 14. API Requirements
- `GET /public/khata/{token}?cursor=&limit=25&lang=` — **unauthenticated**, canon §0.8 path; response per FR-4. 404 `not_found` (bad shape or unknown hash), 410 `link_expired`, 410 `link_revoked`, 429 on the public bucket. Headers: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, no `Set-Cookie`. The response carries **no** `request_id`-bearing error details beyond a generic code (an unauthenticated caller gets no diagnostics).
- `POST /parties/{id}/share-links` — per FR-2; **delta to §22.4 (CCR-31)**: adds `kind`, `label`, returns `token_suffix` and `url` (once). 409 `share_link_limit`.
- `GET /parties/{id}/share-links` — **new (CCR-31)** → `{ data: [ { id, kind, label, token_suffix, expires_at, revoked_at, view_count, last_viewed_at, created_by, created_at, status: 'active'|'expired'|'revoked' } ] }`. Never returns a token or its hash.
- `DELETE /parties/{id}/share-links/{link_id}` — **new (CCR-31)** → 204.
- `POST /tenants/current/share-links/revoke-all` — **new (CCR-31)**, `platform.tenant.manage` → 200 `{ data: { revoked_count } }`.
- Error codes registered: `share_link_limit`, `link_expired`, `link_revoked` (CCR-31).
- Frontend: public route uses a dedicated thin fetch helper (`publicApi.getKhata(token, params)`) on a separate Axios instance with no auth interceptor and no Redux; merchant side uses `partyService.listShareLinks(id)`, `createShareLink(id, body)`, `revokeShareLink(id, linkId)` with thunks `fetchShareLinks`, `createShareLink`, `revokeShareLink` in `partyThunk.ts`.

#### 15. Database Impact
**Column additions to `parties_share_link` (CCR-31)**: `kind varchar(16) NN default 'khata'`, `label varchar(40) NULL`, `token_suffix varchar(6) NN`, `created_by_id uuid NULL`, `last_viewed_at timestamptz NULL`; existing `token_hash U`, `expires_at`, `revoked_at`, `view_count`. **New indexes**: `U(token_hash)` already exists and is the public lookup path (single index probe, no scan); `IX(party_id, revoked_at, expires_at)` for the merchant list and for the cascade revocations; `IX(tenant_id, expires_at) WHERE revoked_at IS NULL` for the nightly purge. Reads on the public path: one index probe on `token_hash`, one party row, one tenant row (branding/UPI, cached 5 min per tenant), one page of `ledger_entry` by `IX(tenant_id, party_id, entry_date, created_at)` with the running-balance window function (the same query as LED-04). Writes on the public path: one throttled `UPDATE parties_share_link SET view_count = view_count + 1, last_viewed_at = now()` — deliberately not in a transaction with the read, and executed after the response is composed so a write failure never blocks a customer from seeing their khata. Purge: rows with `expires_at < now() - interval '90 days'` are deleted by the nightly scheduler command (ADR-012) so the table stays small.

#### 16. Audit Requirements
- `party.share_link.created` — `entity_type='party_share_link'`, `entity_id=link_id`, `after = { kind, label, token_suffix, expires_at }`, `metadata = { party_id, via: 'detail'|'share_sheet', request_id }`. The token itself is never in the audit row (BR-1).
- `party.share_link.revoked` — `metadata = { party_id, token_suffix, via: 'manual'|'party_archive'|'party_merge'|'tenant_suspend'|'revoke_all', view_count_at_revoke }`.
- `party.share_link.viewed` — **not** written per view (an unauthenticated, high-volume event would flood the audit table); views are recorded as counters on the row and, for the merchant's benefit, that is the record. A daily rollup row `party.share_link.views_daily` (`metadata = { link_id, party_id, views }`) is written by the scheduler only for links with views that day, which keeps the audit useful without the volume.
- `tenant.share_links.revoked_all` — `metadata = { revoked_count }`.

#### 17. Notifications
- To the **party**: none from this feature directly. The link is delivered by the merchant through PTY-03's share sheet (WhatsApp deep link) or by LED-06/LED-08's reminder templates, which may embed `{link}`. When a reminder template includes the link, the reminder's own consent rules apply (`sms_opt_in`), so a customer who opted out of SMS is never sent a link by SMS.
- To the **merchant**: an in-app `notifications_notification` `type='khata_link_opened'` on the **first** open of each link ("Ramesh opened their khata"), throttled to one per link, with `data.route='/parties/{id}'`. This is the signal that makes US-PTY-09-6 useful without becoming noise. Subsequent opens are visible only as the counter. Tenant setting `notifications.khata_link_opened` (default on) governs it (**CCR-31**).
- Templates: `khata_link_share` (sms) — en: "{businessName}: see your khata and balance ₹{amount} here: {link}. Reply STOP to opt out." hi: "{businessName}: अपना खाता और बाक़ी ₹{amount} यहाँ देखें: {link}. बंद करने के लिए STOP भेजें।"

#### 18. Analytics / Event Tracking
Merchant-side (authenticated, normal pipeline): `ub.parties.share_link_created { kind, expires_in_days, has_label, active_links_after }`; `ub.parties.share_link_copied {}`; `ub.parties.share_link_shared { channel: 'whatsapp'|'sms'|'copy' }`; `ub.parties.share_link_revoked { via, age_days, view_count }`; `ub.parties.share_link_limit_hit {}`; `ub.parties.share_links_revoked_all { count }`.
Public-side (server-emitted only — the public page loads **no** analytics script, to keep the customer un-tracked): `ub.parties.khata_link_viewed { kind, days_since_created, is_first_view, entry_count_bucket, balance_sign, locale, capped: bool }` and `ub.parties.khata_link_blocked { reason: 'expired'|'revoked'|'not_found'|'tenant_inactive' }`. These carry `tenant_id` but **no** `user_id`, no IP, no user agent, no party id, and no amount.

#### 19. Security
This is the product's only unauthenticated data surface and is specified accordingly.
- **Token**: 32 bytes from `secrets.token_urlsafe`, SHA-256 hashed at rest, constant-time compared, never logged (the reverse proxy and the application log redact `/k/*` paths), shown once, prefixed by kind for routing only.
- **Blast radius**: one party, one tenant, read-only, whitelisted fields (BR-2, BR-3, BR-6). No id in the URL, so there is nothing to increment.
- **Enumeration**: malformed tokens are rejected on shape before any query; the public bucket allows 30 requests/min/IP and 300/hour/IP with exponential backoff, and the 404/410 responses are indistinguishable in timing (the handler always performs a constant-time hash comparison against a dummy when the row is absent).
- **Headers**: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy` with `default-src 'self'; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'` (clickjacking), and no third-party origin of any kind — no fonts CDN, no analytics, no tag manager.
- **Cookies/tracking**: none except an optional `ub_lang` preference cookie with `SameSite=Lax`, no identifier. No fingerprinting. The IP is used transiently for the rate limiter and the view throttle (hashed with a rotating daily salt, never stored).
- **Link previews**: OG tags name only the business (FR-15), so a link pasted into a group chat does not disclose the party or the amount.
- **Tenant isolation**: the party is resolved from the link row's `party_id` within the link's tenant; there is no user-supplied tenant context at all.
- **Revocation guarantees**: revocation is a single indexed update checked on every request (no caching of link validity), so it takes effect on the next request.
- **DPDP**: the page shows a data subject their own data; the footer names the business as the data fiduciary and links to the tenant's contact. PLT-10's deletion removes links and their rows.
- **Merchant side**: creating a link requires `ledger.statement.export`, is audited, and is rate-limited to 60/hour/tenant.

#### 20. Performance
Public request budget: 1 index probe (token), 1 party row, 1 cached tenant row, 1 entry page query = 4 queries, P95 ≤ 180 ms server; the view-count update is fire-and-forget after the response is composed. HTML ≤ 45 KB, JS ≤ 25 KB gzipped, one self-hosted font subset (Latin + Devanagari) preloaded, inline critical CSS, no layout shift (the balance card has fixed metrics). The QR is inline SVG generated server-side — no image request, no external service. "Show older" is a 25-row JSON fetch (≤ 12 KB). The public endpoint has its own rate-limit bucket and its own database connection pool ceiling so that a viral link cannot starve the merchant app. CDN caching is deliberately **disabled** (`no-store`) because the content is private and balance-sensitive; the page is cheap enough not to need it.

#### 21. Testing
- **T-PTY-09-1** unit: token generation produces 43 base64url chars with a `k_` prefix; only the hash and the last 6 chars are persisted; the plain token never appears in any model field or log record (asserted by scanning the captured log output).
- **T-PTY-09-2** unit: direction phrasing — `balance > 0` → "You have to pay"; `< 0` → "{business} has to pay you"; `0` → "settled"; entry titles map `debit` → "You took", `credit` → "You paid".
- **T-PTY-09-3** API: valid token → 200 with the whitelisted payload; the running balance of the newest row equals the party balance.
- **T-PTY-09-4** API: expired → 410 `link_expired`; revoked → 410 `link_revoked`; unknown hash → 404; malformed token → 404 with no database query (asserted via query capture).
- **T-PTY-09-5** API: archiving the party, merging it away, suspending the tenant and `revoke-all` each make the link return 410.
- **T-PTY-09-6** API (snapshot): the public response's key set exactly matches the documented whitelist; adding a column to `parties_party` does not change it (guards BR-6).
- **T-PTY-09-7** API: the payload contains no cost, no notes, no tags, no credit limit, no collection date, no other party, no full mobile — asserted by a deny-list scan of the serialized JSON against seeded sentinel values.
- **T-PTY-09-8** API: corrections are presented per BR-8 (reversed pair hidden, superseding entry shown) and the running balances are unchanged by the hiding.
- **T-PTY-09-9** API: view count increments once per 10 minutes per IP hash; `last_viewed_at` updates; no IP or user agent is persisted anywhere.
- **T-PTY-09-10** API: the 6th active link → 409 `share_link_limit`; `expires_in_days=0` and `=91` → 400.
- **T-PTY-09-11** API: `GET /parties/{id}/share-links` never returns a token or hash; `token_suffix` matches the created link.
- **T-PTY-09-12** API: response headers include `no-store`, `noindex`, `no-referrer`, the CSP and no `Set-Cookie` other than the optional language cookie.
- **T-PTY-09-13** API: rate limiting — 31 requests in a minute from one IP → 429 with backoff headers; 404 and 410 responses have statistically indistinguishable timing (constant-time comparison path).
- **T-PTY-09-14** permission: staff can create and revoke; accountant can create but a revoke → 403; a party from another tenant → 404.
- **T-PTY-09-15** component (public): renders at 320 px without horizontal scroll; the entry table has a caption and headers; axe clean at AA; contrast asserted for both tones.
- **T-PTY-09-16** component (public): works with JavaScript disabled — the balance, entries and expiry render; "Show older" and the UPI button are the only degraded affordances.
- **T-PTY-09-17** component (public): the language switcher swaps locale, persists it, and is a real link.
- **T-PTY-09-18** component (merchant): the URL is shown once; after closing, the row shows "Link hidden · Create a new one"; revoke asks for confirmation and updates the row to "Revoked".
- **T-PTY-09-19** E2E: create a link, open it in a clean browser context, verify the balance and rows, revoke it, reload and get the revoked screen.
- **T-PTY-09-20** E2E: with a UPI VPA configured, the QR encodes `upi://pay?pa=…&am=2300.00&cu=INR` and the amount input updates it.
- **T-PTY-09-21** security: the OG/meta preview contains only the business name — no party name, no amount (guards FR-15).

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a shared khata link, when the customer opens it, then they see their balance and every transaction with dates, descriptions and a running balance, and nothing about any other customer.
- **AC-2 (US-2)** Given the link, when it loads, then the shop's name, logo and phone are shown and the Call button dials that number.
- **AC-3 (US-3)** Given the tenant has a UPI VPA and the customer owes money, when the page loads, then a QR and an "Open UPI app" button are shown for the outstanding amount, and the page states that the shopkeeper will update the khata after payment.
- **AC-4 (US-4)** Given the party has a mobile, when I press Share on WhatsApp in the link drawer, then WhatsApp opens with the message and the link, and nothing is sent until I press send.
- **AC-5 (US-5)** Given a link with a 30-day expiry, when 31 days pass or when I press Revoke, then opening it shows a neutral "no longer available" screen with no khata data.
- **AC-6 (US-6)** Given a link I shared, when the customer opens it for the first time, then I receive an in-app notification and the drawer shows "Opened 1 time · last 2 minutes ago".
- **AC-7 (US-7)** Given my internal notes, tags, credit limit and item costs, when the customer views the page, then none of them appear anywhere in the page or in its network responses.
- **AC-8 (US-8)** Given a Hindi-speaking customer, when they open the link, then the page is in Hindi by default for an Indian locale and a switcher offers English.

#### 23. Dependencies
PTY-01 (party record, `parties.message_locale`), PTY-03 (share sheet, entry point, statement-kind links), PTY-04 (cascade revoke on archive), PTY-08 (cascade revoke on merge), LED-04 (the statement service that produces entries and running balances — shared, not duplicated), LED-06/LED-08 (reminder templates that may embed `{link}`), PAY-04 (UPI intent and local QR generation), PLT-07 (business profile: name, phone, address, UPI VPA), PLT-10 (tenant suspension/deletion cascade), WLB-01/WLB-05 (branding tokens on the public page), NTF-01 (in-app notification on first open), PLT-06 (`notifications.khata_link_opened`), the public Next.js route group `app/(public)/`, a separate Axios instance without auth, CCR-31 (columns, endpoints, error codes, setting).

#### 24. Future Enhancements
Customer-initiated "I have paid" acknowledgement that raises a task for the merchant rather than writing to the ledger (P3 — deliberately not at Phase 2, because a write from an unauthenticated surface changes the security model); payment aggregator integration so a payment made from the page is recorded automatically and matched (PAY-06, P2 — the strongest single upgrade to this feature); a permanent per-party link secured by an OTP to the party's own mobile, for merchants who want a durable link (P3); downloadable PDF statement from the public page (P3); a dispute button that opens a WhatsApp chat pre-filled with the entry the customer questions (P3); multi-language beyond en/hi driven by `parties.message_locale` (P3); a merchant-visible "viewed but not paid in 48 h" segment feeding LED-06's reminder queue (P3); QR printed on the paper bill that resolves to the party's khata link (P3).

---

### PTY-10 — Import parties (CSV)

#### 1. Business Objective
The largest single barrier to adopting a khata app is the evening a merchant must spend typing in 300 parties and their opening balances. Almost every prospect already has the data somewhere — an Excel sheet, a Tally export, a Khatabook CSV, a list their accountant keeps — and the ones who do not can be handed a template. A forgiving, preview-first CSV import turns a week of hesitation into twenty minutes, and it is the mechanism that makes the opening-balance story honest: balances arrive as real `opening` ledger entries (LED-02), not as typed-in numbers. The import must be **safe** (nothing is written until the user approves a preview), **explainable** (every rejected row says why, by row number and column) and **idempotent** (a double-click never creates 300 duplicates). Success measures: ≥ 70 % of imports that reach the preview are committed; ≥ 90 % of rows in a first attempt validate without edits when the template is used; median time from upload to commit ≤ 3 minutes for 200 rows; zero imports that partially commit and leave the ledger inconsistent.

#### 2. User Personas
OW (the only role that imports — it creates master data and financial opening entries in bulk), AD (same rights by system-role definition), ST and AC (excluded; the entry point is hidden).

#### 3. User Stories
1. **US-PTY-10-1** — As an owner moving from a notebook, I want to upload a spreadsheet of my parties so that I do not type them one by one.
2. **US-PTY-10-2** — As an owner, I want a template with the exact columns so that I know what the file should look like.
3. **US-PTY-10-3** — As an owner, I want to include the balance each party already owes me so that my khata starts correct from day one.
4. **US-PTY-10-4** — As an owner, I want to see what will be created and what is wrong **before** anything is saved so that a bad file does not damage my data.
5. **US-PTY-10-5** — As an owner, I want each error to name the row and the column so that I can fix the file quickly.
6. **US-PTY-10-6** — As an owner, I want rows that duplicate an existing party to be skipped or updated by my choice so that re-running an import is safe.
7. **US-PTY-10-7** — As an owner, I want to download the rows that failed so that I can correct and re-upload only those.
8. **US-PTY-10-8** — As an owner, I want my columns recognised even if they are named differently so that I do not have to rewrite my accountant's file.

#### 4. Functional Requirements
- **FR-1** Pipeline (Part 22 §22.12, `imports_job` in Part 21 §21.3.11): `POST /imports` (multipart, `kind='parties'`, `file`) → 201 job `status='uploaded'` → server parses and validates → `status='ready'` with `total_rows`, `valid_rows`, `error_rows`, `errors` (first 500) and a preview → user reviews → `POST /imports/{id}/commit` → 202 `status='importing'` → `completed` with `result`. `POST /imports/{id}/cancel` discards a job in any pre-commit state.
- **FR-2** Template: `GET /imports/templates/parties.csv` returns a UTF-8 CSV with a BOM (so Excel opens Devanagari correctly), a header row, three example rows and a second sheet-equivalent comment block is **not** used (CSV has no sheets — the guidance lives on the page). Columns, in order:
  | Column | Required | Format | Maps to |
  |---|---|---|---|
  | `name` | ✅ | text 2–160 | `parties_party.name` |
  | `mobile` | — | 10 digits or `+91…` | `mobile` (normalised) |
  | `type` | — | `customer` / `supplier` / `both` (default `customer`) | `is_customer`, `is_supplier` |
  | `opening_balance` | — | number ≥ 0, 2 dp | LED-02 opening entry `amount` |
  | `opening_type` | — | `to_receive` / `to_pay` (default `to_receive`) | entry `direction` (`debit` / `credit`) |
  | `opening_date` | — | `dd/mm/yyyy` or `yyyy-mm-dd` (default: tenant FY start) | entry `entry_date` |
  | `gstin` | — | 15 chars | `gstin` (+ `gst_registration='regular'`) |
  | `state` | — | state name or 2-digit code | `state_code` |
  | `address_line1`, `address_line2`, `city`, `pincode` | — | text / 6 digits | `billing_address` jsonb |
  | `email` | — | email | `email` |
  | `alt_phone` | — | as mobile | `alt_phone` |
  | `credit_limit` | — | number ≥ 0 | `credit_limit` |
  | `credit_days` | — | integer 0–365 | `credit_days` |
  | `tags` | — | semicolon-separated, ≤ 10 | `parties_tag` (created as needed, PTY-05) |
  | `notes` | — | text ≤ 500 | `notes` |
  | `display_code` | — | text ≤ 24 | `display_code` |
- **FR-3** Column mapping (US-PTY-10-8): after parsing the header, the server proposes a mapping using (a) exact match on the canonical name, (b) a synonym table (`party name|customer name|नाम` → `name`; `phone|mobile no|contact|फ़ोन` → `mobile`; `balance|outstanding|opening|बाक़ी` → `opening_balance`; `gst|gstin|gst no` → `gstin`; `area|route` → `tags`; …), (c) case- and space-insensitive comparison. The preview screen shows the mapping as a two-column list with a `MLSelect` per source column so the user can correct it, and remapping re-validates without re-uploading (`PATCH /imports/{id}` `{ column_map }` → re-runs validation).
- **FR-4** File constraints: `.csv` only at MVP (`.xlsx` is Phase 2, IMP-04 — the minimal-dependency rule forbids adding `openpyxl` without an ADR); ≤ 5 MB; ≤ 5,000 data rows; UTF-8 or UTF-8-BOM, with a best-effort fallback to `cp1252` and `utf-16` detected by BOM; delimiter auto-detected among `,`, `;` and tab; quoted fields per RFC 4180; a header row is required.
- **FR-5** Validation, per row, in this order (first failure wins per field, but all fields are reported): required fields → type/format → normalisation → intra-file duplicates → existing-party duplicates → business rules (tag count, credit limit range, opening date bounds) → plan capacity. Each error is `{ row: 12, column: "mobile", code: "invalid_mobile", message: "Not a valid 10-digit mobile" }`; rows may carry several errors.
- **FR-6** Duplicate handling (`duplicate_mode`, chosen on the preview screen, default `skip`):
  - `skip` — a row whose normalised mobile matches an existing party (active or archived) is not imported; it is reported as skipped with the existing party's name.
  - `update` — the existing party's **non-financial** fields (name, email, address, tags, notes, credit fields, state, GSTIN) are updated from the row; the opening balance columns are **ignored** for matched rows (BR-5), because a party that already exists already has a ledger.
  - There is no `duplicate` mode: the unique index would refuse it anyway.
  Rows without a mobile are never matched and are always created (a name match is deliberately not used — too many genuine namesakes; PTY-08 exists to repair the rest).
- **FR-7** Preview screen: a summary header of four `UbStatCard`s — Total rows, Will be created, Will be updated/skipped, Errors — plus the computed "Opening balances: You will get ₹1,84,300 · You will give ₹22,150" so the owner can sanity-check the totals against their own book **before** committing. Below, an `MLTabs` of **Ready** (a `UbDataGrid` of the parsed rows as they will be saved) and **Errors** (a grid of row number, the original line, and the list of errors) with a **Download errors CSV** action (FR-10).
- **FR-8** Commit: `POST /imports/{id}/commit` `{ duplicate_mode, column_map }` with `Idempotency-Key`. Execution is chunked into transactions of 200 rows by the job runner (ADR-012 — a `platform_job` row executed by `manage.py run_scheduler`, or synchronously for ≤ 200 rows so small imports feel instant). Each chunk is atomic; a chunk that fails is retried once and then recorded, and the job ends `completed` with per-row results rather than rolling back the whole file (BR-7 explains why this is safe). Progress is polled by `GET /imports/{id}` every 2 s.
- **FR-9** Opening balances: for each created party with a non-zero `opening_balance`, the same service as LED-02 (`post_opening_balance(party, amount, direction, entry_date)`) posts a `ledger_entry(entry_type='opening', source_type='manual')` in the **same chunk transaction** as the party insert, and the party's `balance`, `receivable_total`/`payable_total` and `last_activity_at` are set. No SMS is sent (LED-02 §17, PTY-01 §17).
- **FR-10** Errors CSV: `GET /imports/{id}/errors.csv` returns the failed rows **in the original column order** plus two appended columns `error_columns` and `error_messages`, so the owner fixes the file in place and re-uploads it directly. This is the single most requested affordance in import flows and is mandatory, not optional.
- **FR-11** Result screen: "Imported 287 parties · 9 skipped · 4 errors" with links **View parties** (routes to PTY-02, which refetches), **Download errors** and **Import more**. The created parties are not individually listed (volume); the party list is the list.
- **FR-12** Plan capacity: before the preview is marked ready, the server compares `valid_rows` (net of skips) against the remaining `max_parties` (PLT-15). Over capacity → the preview shows a blocking banner "Your plan allows 500 parties. This file would add 620." with **Upgrade** and **Import the first N** (which truncates in file order and reports the rest as skipped with `plan_limit_reached`).
- **FR-13** Retention: the uploaded file is stored as `files_attachment` with `kind='import_file'` and is deleted by the nightly job 30 days after the job reaches a terminal state; the `imports_job.errors` jsonb keeps only the first 500 errors, and `result` keeps counts plus the ids of created parties capped at 5,000.
- **FR-14** Entry points: PTY-02's first-use empty state ("Import from CSV"), the Parties page overflow menu, and PLT-03's onboarding wizard step "Bring your existing khata" — the last is where most imports will start.
- **FR-15** Items and opening stock use the same pipeline with `kind='items'` / `kind='opening_stock'` (INV-12); this feature specifies only `kind='parties'` but shares the UI shell, the job model and the error CSV so the three imports behave identically.

#### 5. Non-Functional Requirements
Upload of a 5 MB / 5,000-row file completes in ≤ 10 s on a 4G connection; validation of 5,000 rows in ≤ 8 s server-side (streamed parse, batched duplicate lookups of 500 mobiles per query, no per-row query); commit of 5,000 rows in ≤ 60 s with visible progress; ≤ 200 rows commits synchronously in ≤ 3 s. Memory is bounded: the parser streams and never holds more than 1,000 rows plus the error list. The preview grid virtualises above 500 rows (`UbDataGrid` already paginates; the preview paginates client-side over the job's cached preview rows, fetched 100 at a time). The flow works at 320 px, though a file picker on a phone is awkward — the copy acknowledges this and offers "email the file to yourself and open it on a computer" as a hint. Accessibility: the stepper announces the current step; the errors grid is a real table with row numbers as row headers; progress is an `aria-live="polite"` region. Copy `en`/`hi`; the template's headers stay English (files travel between tools) but the on-screen guidance is localised.

#### 6. User Flow
Primary: Parties (empty) → **Import from CSV** → step 1 "Get the template" (Download template · or upload your own file) → drop `parties.csv` → upload progress → step 2 mapping ("We matched 14 of your 16 columns" with two `MLSelect`s to fix) → **Continue** → step 3 preview: 300 rows, 287 ready, 9 duplicates, 4 errors, opening totals shown → the owner switches duplicate handling to "Update existing" → the preview recomputes → **Import 287 parties** → progress → result screen → **View parties**.
Alternate A (fix and re-upload): result shows 4 errors → **Download errors** → the owner fixes the 4 rows in Excel → **Import more** → uploads the 4-row file → committed.
Alternate B (wrong file): a CSV of items uploaded as parties → validation reports "No column could be matched to 'name'" at the mapping step and blocks with a link to the template.
Alternate C (over plan): preview shows the capacity banner → the owner imports the first 200 and upgrades later.
Alternate D (cancel): the owner closes the preview → the job stays `ready` for 24 h and is listed under "Unfinished imports" on the import page so the work is not lost; **Cancel** deletes it and its file.
Alternate E (double submit): the Commit button is disabled after the first press and the request carries an `Idempotency-Key`; a retry returns the original result.
Alternate F (huge file): 12,000 rows → 400 at upload with "Split the file into parts of 5,000 rows" and a link to guidance.
Alternate G (encoding): a `cp1252` file with Hindi names uploads and shows mojibake in the preview → a banner "Some characters look wrong. Save the file as CSV UTF-8 and upload again." with a link to the how-to.

#### 7. UI Requirements
Components: `ImportPageContent` (`app/(app)/imports/page.tsx` with `?kind=parties`) composed of `UbPageShell`, `UbPageHeader` ("Import parties"), an `ImportStepper` (feature component, 3 steps), `ImportDropzone` (`UbFileUpload` on `react-dropzone`: drag-drop, tap-to-browse, file name, size, remove), `ImportColumnMapper` (a two-column list: your column → our field, each an `MLSelect` with "Don't import" as an option, unmatched required fields highlighted), `ImportPreviewPanel` (four `UbStatCard`s + opening-totals line + `UbTabs` Ready/Errors + two `UbDataGrid`s), `ImportDuplicateModeRadio` (`MLRadioGroup`: Skip existing / Update existing, with one-line explanations), `ImportProgressPanel` (`MLProgress` determinate + "Imported 1,200 of 5,000"), `ImportResultPanel` (`UbEmptyState`-styled success summary with three actions), `UnfinishedImportsList` (`MLCard` list of `ready` jobs with Resume/Cancel).

Preview grids: the **Ready** grid shows the mapped values with the same formatting the app will use (amount in ₹ with Indian grouping, mobile normalised to `+91…`, date dd/mm/yyyy, tags as chips) so the preview is literally a preview of the result, not of the file. The **Errors** grid shows `Row`, the offending cells highlighted with an error outline, and an expandable cell listing each message.

Mobile: the stepper becomes a compact "Step 2 of 3" line; the mapper is a stacked list; the preview grids become cards (row number as the card title); the primary action is a sticky bottom bar.

Keyboard: the dropzone is focusable and accepts `Enter`/`Space` to open the picker; the mapper's selects are standard; `Cmd/Ctrl+Enter` advances the step.

#### 8. UX Requirements
| Key | English | Hindi |
|---|---|---|
| `imports.parties.title` | Import parties | पार्टियाँ इम्पोर्ट करें |
| `imports.parties.subtitle` | Bring your existing khata in one file | अपना मौजूदा खाता एक फ़ाइल में लाएँ |
| `imports.step.upload` | Upload file | फ़ाइल अपलोड करें |
| `imports.step.map` | Match columns | कॉलम मिलाएँ |
| `imports.step.review` | Review and import | जाँचें और इम्पोर्ट करें |
| `imports.template.download` | Download template | टेम्पलेट डाउनलोड करें |
| `imports.template.hint` | Fill this and upload it. Only "name" is required. | इसे भरकर अपलोड करें। केवल "name" ज़रूरी है। |
| `imports.dropzone.idle` | Drop your CSV here or tap to choose | अपनी CSV यहाँ छोड़ें या चुनने के लिए टैप करें |
| `imports.dropzone.limits` | CSV up to 5 MB and 5,000 rows | CSV अधिकतम 5 MB और 5,000 पंक्तियाँ |
| `imports.map.matched` | We matched {matched} of your {total} columns | आपके {total} में से {matched} कॉलम मिल गए |
| `imports.map.yourColumn` | Your column | आपका कॉलम |
| `imports.map.ourField` | Our field | हमारा फ़ील्ड |
| `imports.map.skip` | Don't import | इम्पोर्ट न करें |
| `imports.map.missingRequired` | Choose a column for "name" | "name" के लिए कॉलम चुनें |
| `imports.preview.total` | Rows in file | फ़ाइल में पंक्तियाँ |
| `imports.preview.create` | Will be created | बनाई जाएँगी |
| `imports.preview.duplicate` | Already exist | पहले से मौजूद |
| `imports.preview.errors` | Have errors | ग़लतियाँ हैं |
| `imports.preview.openings` | Opening balances: You will get ₹{receivable} · You will give ₹{payable} | शुरुआती बाक़ी: मिलेंगे ₹{receivable} · देने हैं ₹{payable} |
| `imports.preview.tab.ready` | Ready ({count}) | तैयार ({count}) |
| `imports.preview.tab.errors` | Errors ({count}) | ग़लतियाँ ({count}) |
| `imports.duplicate.title` | Parties that already exist | पहले से मौजूद पार्टियाँ |
| `imports.duplicate.skip` | Skip them | उन्हें छोड़ें |
| `imports.duplicate.skip.hint` | Nothing changes for parties you already have | आपकी मौजूदा पार्टियों में कुछ नहीं बदलेगा |
| `imports.duplicate.update` | Update their details | उनके विवरण अपडेट करें |
| `imports.duplicate.update.hint` | Name, address and other details are updated. Balances are never changed. | नाम, पता और अन्य विवरण अपडेट होंगे। बाक़ी कभी नहीं बदलेगा। |
| `imports.commit` | Import {count} parties | {count} पार्टियाँ इम्पोर्ट करें |
| `imports.progress` | Imported {done} of {total} | {total} में से {done} इम्पोर्ट हुईं |
| `imports.result.title` | Imported {created} parties | {created} पार्टियाँ इम्पोर्ट हुईं |
| `imports.result.skipped` | {count} skipped | {count} छोड़ी गईं |
| `imports.result.errors` | {count} had errors | {count} में ग़लतियाँ थीं |
| `imports.result.viewParties` | View parties | पार्टियाँ देखें |
| `imports.result.downloadErrors` | Download errors | ग़लतियाँ डाउनलोड करें |
| `imports.result.importMore` | Import more | और इम्पोर्ट करें |
| `imports.error.tooManyRows` | Split the file into parts of 5,000 rows | फ़ाइल को 5,000 पंक्तियों के हिस्सों में बाँटें |
| `imports.error.encoding` | Some characters look wrong. Save the file as CSV UTF-8 and upload again. | कुछ अक्षर ग़लत दिख रहे हैं। फ़ाइल को CSV UTF-8 में सहेजकर दोबारा अपलोड करें। |
| `imports.error.noHeader` | The first row must be the column names | पहली पंक्ति में कॉलम के नाम होने चाहिए |
| `imports.unfinished.title` | Unfinished imports | अधूरे इम्पोर्ट |
| `imports.unfinished.resume` | Resume | जारी रखें |
| `imports.cancel.confirm` | Discard this import? The file will be deleted. | यह इम्पोर्ट छोड़ें? फ़ाइल हट जाएगी। |

Copy rules: never "parse", "schema", "field mapping" in user copy — "match your columns to ours". Errors name the row and the column in the user's own header name ("Row 12, your column 'Phone No': not a valid 10-digit mobile"). The opening-balance totals are stated in ledger vocabulary so the owner can compare them with their own book. The duplicate-mode explanations state what will **not** change, because that is the fear.

#### 9. States
**Initial** — step 1 with the template link and an empty dropzone; "Unfinished imports" listed when any `ready` job exists. **Loading** — upload progress (determinate, from the XHR progress event); validation shows an indeterminate `MLProgress` with "Checking your file…". **Empty** — a file with a header but zero data rows: "This file has no rows" with a link back to the template. **Success** — result panel. **Error** — upload/parse failures render as a `UbStatusBanner` at step 1 with the specific message (too large, too many rows, no header, unreadable encoding) and the file is cleared; per-row errors are not an error state, they are content. **Disabled** — staff/accountant never see the entry point; the Commit button is disabled while the mapping is incomplete, while the plan banner blocks, or while zero rows are ready. **Partial** — commit finished with some chunks failed: the result panel shows "Imported 4,800 · 200 could not be saved" with **Download errors** including those rows and a per-chunk reason. **Processing** — committing: progress panel, the browser unload warning armed, navigation away allowed (the job continues server-side and the page can be re-entered from "Unfinished imports"). **Completed** — terminal `completed` state; the job is read-only and its errors CSV remains downloadable for 30 days. **Failed** — the whole job failed (e.g. the file disappeared): `status='failed'` with a reason and a Retry that re-runs validation from the stored file.

#### 10. Validation Rules
File-level:
| Rule | Message (en) | Code |
|---|---|---|
| extension `.csv`, content type text/csv or text/plain | Upload a CSV file | `validation_error` (`details.file`) |
| size ≤ 5 MB | The file is larger than 5 MB | `file_too_large` (400) |
| data rows ≤ 5,000 | Split the file into parts of 5,000 rows | `too_many_rows` (400) |
| header row present and non-empty | The first row must be the column names | `validation_error` (`details.header`) |
| a column maps to `name` | Choose a column for "name" | `validation_error` (`details.column_map`) |
| decodable as UTF-8/UTF-16/cp1252 | We could not read this file. Save it as CSV UTF-8. | `validation_error` (`details.encoding`) |

Row-level (`errors[]` entries):
| Column | Rule | Message (en) | Code |
|---|---|---|---|
| `name` | required, 2–160 after trim | Enter a name (2–160 characters) | `invalid_name` |
| `mobile` | normalises to `^\+91[6-9]\d{9}$` when present | Not a valid 10-digit mobile | `invalid_mobile` |
| `mobile` | unique within the file | This number appears in row {other} too | `duplicate_in_file` |
| `mobile` | not an existing party (mode `skip`) | Already added as {name} | `duplicate_existing` (a *skip*, not an error, in mode `update`) |
| `type` | ∈ `customer`, `supplier`, `both` | Use customer, supplier or both | `invalid_type` |
| `opening_balance` | number ≥ 0, ≤ 99,99,99,999.99, ≤ 2 dp | Enter an amount like 2300 or 2300.50 | `invalid_amount` |
| `opening_type` | ∈ `to_receive`, `to_pay` | Use to_receive or to_pay | `invalid_opening_type` |
| `opening_date` | parseable, ≤ today, ≥ today − 10 years | Use a date like 01/04/2026, not in the future | `invalid_date` |
| `gstin` | regex + state prefix + checksum (PTY-01 conventions) | Check the GSTIN — the last character does not match | `invalid_gstin` |
| `state` | name or code ∈ the 36 values | We do not recognise this state | `invalid_state` |
| `pincode` | `^[1-9][0-9]{5}$` | Enter a 6-digit PIN code | `invalid_pincode` |
| `email` | format, ≤ 254 | Enter a valid email | `invalid_email` |
| `credit_limit` | number ≥ 0, 2 dp | Enter an amount | `invalid_amount` |
| `credit_days` | integer 0–365 | Enter days between 0 and 365 | `invalid_credit_days` |
| `tags` | ≤ 10 names, each 1–40 chars, no `,`/`;` inside a name | Up to 10 tags, each under 40 characters | `invalid_tags` |
| `notes` | ≤ 500 | Notes are longer than 500 characters | `invalid_notes` |
| `display_code` | ≤ 24, unique within the file and the tenant | This code is already used | `duplicate_code` |
| row | net new rows ≤ remaining plan capacity | Your plan allows {limit} parties | `plan_limit_reached` |

Lenient normalisations applied **before** validation (these are not errors): trim every cell; collapse inner whitespace in `name`; strip `₹`, commas and spaces from amounts (`"₹ 2,300.00"` → `2300.00`); strip spaces, hyphens, brackets, leading `0`/`91`/`+91` from phone numbers; uppercase and trim `gstin`; accept `yes/no/y/n/1/0/true/false` where a boolean-ish value is given for `type`; accept `dd-mm-yyyy`, `dd/mm/yyyy`, `yyyy-mm-dd` and Excel's `dd-mmm-yy` for dates; treat empty strings, `-`, `NA` and `N/A` as null.

#### 11. Business Rules
- **BR-1** Nothing is written before commit. Upload and validation are pure reads plus the job row and the stored file; a user who abandons the preview has changed nothing in their books.
- **BR-2** Opening balances are ledger entries (LED-02 BR-1), never a column written onto the party. The party's `balance` after import is the recomputed sum of its entries, which is what makes the imported khata reconcile with every later statement.
- **BR-3** `opening_type=to_receive` → `direction='debit'`; `to_pay` → `credit`. An `opening_balance` of 0 or empty posts **no** entry and leaves `last_activity_at` NULL (PTY-01 BR-7).
- **BR-4** Rows are matched to existing parties **only** by normalised mobile. Name matching is never used for automatic merging or skipping (PTY-08 exists for the ambiguous cases).
- **BR-5** In `update` mode, only non-financial fields are updated. `opening_balance`, `opening_type` and `opening_date` are ignored for matched rows and the preview says so explicitly — an import must never silently alter an existing khata's balance.
- **BR-6** Import is idempotent at two levels: the `Idempotency-Key` on commit prevents a double submit, and re-uploading the same file in `skip` mode creates nothing because every row now matches an existing mobile. Rows without mobiles are the exception and will duplicate on a re-run — the preview warns when more than 10 % of rows lack a mobile.
- **BR-7** Commit is chunked and each chunk is atomic; the job is therefore **not** all-or-nothing across the file. This is a deliberate trade: a 5,000-row file that fails at row 4,900 should not discard 4,899 good parties, and every row's outcome is reported and downloadable. Within a chunk, a party and its opening entry always commit together, so no party can exist with a half-applied balance.
- **BR-8** Tags named in the file are created if missing (PTY-05 FR-4 rules, case-insensitive, ≤ 200 per tenant); tags beyond the 200-tag limit cause the row's tag column to error rather than failing the row's party creation? **No** — consistency wins: the row errors with `invalid_tags` and is not imported, because a party silently missing its route tag is worse than a visible error.
- **BR-9** Every imported party is identical to a hand-created one: same table, same validation, same `party.created` audit action with `metadata.via='import'` and `metadata.import_job_id`.
- **BR-10** No message of any kind is sent to any imported party (PTY-07 BR-6 for the same reason): `sms_opt_in` takes the column default and `consent_source` stays NULL, so LED-08 will not message them until consent is recorded.
- **BR-11** The plan limit is applied to the **net new** count (rows that will be created), computed at preview time and re-checked at commit; a tenant that adds parties between preview and commit sees the truncation applied at commit with the extras reported as `plan_limit_reached`.
- **BR-12** A job is owned by its tenant and is invisible cross-tenant; a `ready` job expires after 24 h (its preview is discarded and its file deleted), and a `completed` job's artefacts are kept 30 days (FR-13).

#### 12. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Download the template | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| Upload a file / create a job | `parties.party.write` + `import_export` module enabled | ✅ | ✅ | ❌ | ❌ |
| View the preview and errors | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Commit an import | `parties.party.write` **and** `ledger.entry.write` (opening balances are ledger writes) | ✅ | ✅ | ❌ | ❌ |
| Cancel a job | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| Download the errors CSV | `parties.party.write` | ✅ | ✅ | ❌ | ❌ |
| See import events in the audit log | `platform.audit.read` | ✅ | ✅ | ❌ | ✅ |

The commit check on `ledger.entry.write` matters: a role able to create parties but not ledger entries may import a file **without** opening balances (the server strips them and reports each as skipped with `code='permission_opening_balance'`) but cannot post balances. Staff are excluded entirely at MVP because bulk master-data creation is an owner decision.

#### 13. Edge Cases
- **EC-1** A file exported from Excel with a BOM and `;` delimiters (common in Indian Windows locales): the BOM is stripped and the delimiter auto-detected; no user action needed.
- **EC-2** Amounts written as "2,300/-" or "Rs. 2300": the currency/junk strip handles `₹`, `Rs`, `/-`, commas and spaces; anything still unparseable errors with the example-bearing message.
- **EC-3** A `mobile` column stored by Excel as a number, losing the leading zero (`9876543210` as `9.87654E+09`): scientific notation is detected and expanded; a value that has genuinely lost digits errors, and the guidance says to format the column as Text.
- **EC-4** Two rows with the same mobile inside one file: both are errored with `duplicate_in_file` naming each other's row numbers, so the user decides which is right rather than the importer guessing.
- **EC-5** A row with a name only (no mobile, no balance): valid; creates a minimal party exactly as PTY-01 would.
- **EC-6** All 300 rows lack mobiles: allowed, with the preview warning of BR-6 ("These rows cannot be matched if you import this file again").
- **EC-7** `opening_date` before the tenant's first FY or ten years back: errors with the bound message; an empty date defaults to the tenant's FY start (`platform_tenant.fy_start_month` of the current FY), which is what a migrating merchant means.
- **EC-8** Opening balance on a supplier row with `to_receive`: allowed — a supplier can owe the business (an advance paid to them); the direction is taken literally and the preview's totals make it visible.
- **EC-9** GSTIN present but `state` absent: the state is derived from the GSTIN prefix (PTY-01 FR-7); a conflicting `state` yields a non-blocking warning shown in the preview's Ready grid, not an error.
- **EC-10** The same file uploaded twice in `skip` mode: the second import creates nothing and reports every row as an existing-party skip — the idempotence property users actually test.
- **EC-11** The user edits the column mapping after seeing the preview: `PATCH /imports/{id}` re-validates from the stored file; the previous preview is replaced and the job stays `ready`.
- **EC-12** The browser is closed during a commit: the job continues in the runner; re-opening the import page shows it under "Unfinished imports" with live progress, and the result is the same.
- **EC-13** The tenant hits the plan limit halfway through the commit: remaining rows are reported with `plan_limit_reached` and the already-created parties stand (BR-7/BR-11).
- **EC-14** A tag name in the file contains a comma: the tag validator rejects it (PTY-05 EC-14) and the row errors with a message naming the tag.
- **EC-15** A 5,000-row file where 4,000 rows have opening balances: 4,000 ledger entries are posted; the day book and the opening trial balance are correspondingly large, which is expected and correct.
- **EC-16** A row whose `display_code` matches an existing party's: `duplicate_code` error (PTY-01 BR-10's service check applied per row).
- **EC-17** The file contains a column the mapper cannot place and the user leaves it as "Don't import": ignored silently; the preview's mapping list shows it as not imported so nothing is lost invisibly.

#### 14. API Requirements
- `POST /imports` — multipart `{ kind: 'parties', file }` → 201 `{ data: { id, kind, status: 'validating', file_name, size_bytes } }`. Errors: 400 `validation_error` / `file_too_large` / `too_many_rows`, 403 `permission_denied` / `module_disabled`.
- `GET /imports/{id}` → `{ data: { id, kind, status, total_rows, valid_rows, error_rows, duplicate_rows, column_map, detected_columns, preview: [ …first 100 mapped rows… ], errors: [ { row, column, code, message } ] (first 500), totals: { opening_receivable, opening_payable }, plan: { remaining, over_by }, result: { created, updated, skipped, failed, party_ids[] }, started_at, finished_at } }`. **Deltas to §22.12 (CCR-32)**: `column_map`, `detected_columns`, `preview`, `totals`, `duplicate_rows` and `plan` are added to the documented shape; `?preview_page=&preview_page_size=` paginates the preview rows.
- `PATCH /imports/{id}` — **new (CCR-32)** `{ column_map }` → re-validates; only while `status='ready'`.
- `POST /imports/{id}/commit` — `{ duplicate_mode: 'skip'|'update' }`, header `Idempotency-Key` required → 202 `{ data: { id, status: 'importing' } }` (or 200 with the completed job for ≤ 200 rows, executed synchronously). Errors: 409 `import_not_ready`, 409 `idempotency_conflict`, 403 `plan_limit_reached` when even one row cannot fit and the user did not accept truncation (`?truncate=true` accepts it).
- `POST /imports/{id}/cancel` → 204; deletes the stored file.
- `GET /imports/{id}/errors.csv` — **new (CCR-32)** → the original rows plus `error_columns`, `error_messages`.
- `GET /imports/templates/parties.csv` → the template with a BOM.
- Error codes registered: `file_too_large`, `too_many_rows`, `import_not_ready` (CCR-32).
- Frontend: `importService.createJob(kind, file, onUploadProgress)`, `getJob(id, params)`, `updateColumnMap(id, map)`, `commitJob(id, body, idempotencyKey)`, `cancelJob(id)`, `downloadErrors(id)`; slice `importSlice` (`job`, `previewPage`, `status`, `pollingId`), thunks `uploadImportFile`, `fetchImportJob`, `updateImportMapping`, `commitImportJob`, `cancelImportJob`; polling is a 2 s interval started on `importing` and stopped on a terminal state or unmount.

#### 15. Database Impact
Writes: `imports_job` (one row per upload; `errors`, `result`, `column_map` jsonb — **`column_map jsonb NN default '{}'` is a new column, CCR-32**), `files_attachment` (`kind='import_file'`, and a second row for the errors CSV when generated), and on commit `parties_party` (bulk insert / update), `parties_tag` + `parties_party_tag`, `ledger_entry` (opening rows), `platform_audit_log`. Reads: `parties_party` for the duplicate check — batched as `WHERE mobile = ANY(%s)` in pages of 500 against the partial unique index, so a 5,000-row file costs 10 queries, not 5,000; `parties_tag` by `lower(name)`; `platform_tenant` for `fy_start_month`; the plan counter. Indexes: no new ones on `parties_party`; `imports_job` already has `IX(tenant_id, created_at DESC)` which serves the "Unfinished imports" list with a `status='ready'` filter — a partial `IX(tenant_id, status) WHERE status IN ('uploaded','validating','ready','importing')` is proposed in CCR-32 for the poller. Commit uses `bulk_create` for parties in chunks of 200 with `ignore_conflicts=False` (conflicts are pre-filtered by the batched duplicate check inside the chunk transaction), then `bulk_create` for tag joins and ledger entries, then one `bulk_create` of audit rows.

#### 16. Audit Requirements
- `import.created` — `entity_type='import_job'`, `entity_id=job_id`, `metadata = { kind, file_name, size_bytes, sha256, total_rows, request_id }`.
- `import.validated` — `metadata = { valid_rows, error_rows, duplicate_rows, column_map }`.
- `import.committed` — `metadata = { duplicate_mode, created, updated, skipped, failed, opening_entries, opening_receivable, opening_payable, chunks, duration_ms }`. This is the row an accountant reads to explain a sudden jump in receivables.
- `import.cancelled` / `import.failed` — `metadata = { reason }`.
- `party.created` per created party with `metadata.via='import'` and `metadata.import_job_id` (PTY-01 §16 vocabulary), and `party.updated` per updated party in `update` mode with the changed fields — these are per-row and are accepted because an import is a rare, high-consequence event whose per-party attribution is exactly what an audit needs. For files above 1,000 rows the per-row rows are written with `bulk_create` in the same chunk.
- `ledger.entry.created` per opening entry (Part 21 §21.7 requires full-row audit for ledger entries) with `metadata.via='import'`.

#### 17. Notifications
In-app only. (a) `import_done` — to the actor when a commit finishes: title "Import finished", body "{created} parties imported, {failed} could not be saved", `data = { route: '/imports/{id}', job_id }`. Written for every asynchronous commit (> 200 rows) so a user who navigated away is told. (b) `import_failed` — when the job fails wholesale, with the reason and a link to retry. (c) No notification for a synchronous small import (the result panel is on screen). **Nothing is ever sent to the imported parties** (BR-10) — a merchant importing 300 contacts must not trigger 300 messages, and this is stated in the preview's footer ("No messages are sent to these parties").

#### 18. Analytics / Event Tracking
`ub.parties.import_started { entry_point: 'empty_state'|'menu'|'onboarding' }`; `ub.parties.import_template_downloaded {}`; `ub.parties.import_uploaded { size_bytes_bucket, row_count_bucket, delimiter, encoding, detected_columns_count }`; `ub.parties.import_mapping_auto { matched, total, required_missing }`; `ub.parties.import_mapping_changed { changed_count }`; `ub.parties.import_validated { total_rows, valid_rows, error_rows, duplicate_rows, top_error_codes: [..3], rows_without_mobile_pct, has_openings: bool }`; `ub.parties.import_duplicate_mode { mode }`; `ub.parties.import_committed { created, updated, skipped, failed, opening_entries, duration_ms, async: bool }`; `ub.parties.import_errors_downloaded { error_rows }`; `ub.parties.import_cancelled { stage: 'upload'|'map'|'preview' }`; `ub.parties.import_plan_blocked { over_by }`; `ub.parties.import_failed { error_code }`. No cell values, names, numbers or amounts are ever sent — only counts, buckets and error codes.

#### 19. Security
The uploaded file is untrusted input and is treated as such. (a) **Formula injection**: every cell written into any CSV the product generates (the errors CSV, the party export of PTY-02) is prefixed with `'` when it begins with `=`, `+`, `-`, `@`, tab or CR, so a malicious `=HYPERLINK(...)` in a party name cannot execute in the importer's spreadsheet. (b) **Zip/quadratic blowup**: no archive formats are accepted; the parser streams with a hard row cap (5,000), a hard cell-length cap (1,000 chars, longer cells are truncated and the row errored) and a total-bytes cap (5 MB), so a crafted file cannot exhaust memory. (c) **Content sniffing**: the file is validated by extension *and* by attempting a text decode; binary content is rejected. The stored attachment is served only through an authenticated, tenant-scoped, signed URL and never from a path the user controls; `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` are set. (d) **Tenant isolation**: the job carries `tenant_id`; a job id from another tenant returns 404; every row created is written through the tenant-scoped manager. (e) **Permissions**: commit requires both `parties.party.write` and `ledger.entry.write` (§12), so a bulk ledger write cannot be smuggled in by someone who may only create parties. (f) **PII**: the file contains mobiles, names and addresses; it is stored encrypted at rest where the deployment supports it, deleted after 30 days (FR-13), excluded from any log, and included in PLT-10's export/delete. (g) **Rate limits**: 10 uploads/hour/tenant, 5 commits/hour/tenant, 20 template downloads/hour/user. (h) `Idempotency-Key` on commit; a replay returns the original job result.

#### 20. Performance
Validation streams the file with Python's `csv` module (no pandas — dependency policy ADR-021), holding ≤ 1,000 rows in memory; duplicate checks are batched 500 mobiles per query (10 queries for 5,000 rows); tag lookups are a single query for the distinct tag set. Target: 5,000 rows validated in ≤ 8 s. Commit runs in chunks of 200 rows, each chunk ≈ 5 statements (`bulk_create` parties, tags, tag joins, ledger entries, audit rows) plus one plan-counter read — 25 chunks × ~6 statements = ~150 statements for 5,000 rows, completing in ≤ 60 s. Progress is derived from `result.created + result.failed` against `valid_rows` and polled every 2 s (the poll is a single indexed job-row read). The preview is paginated server-side (100 rows per page) from the stored `preview` jsonb, so the client never receives 5,000 rows at once. The template and the errors CSV are streamed with `StreamingHttpResponse`.

#### 21. Testing
- **T-PTY-10-1** unit: cell normalisation — `"₹ 2,300.00"` → `2300.00`; `"09876543210"`, `"+91 98765 43210"`, `"9876543210"` → `+919876543210`; `"9.87654E+09"` → expanded; `"01-04-2026"`, `"2026-04-01"`, `"1-Apr-26"` → `2026-04-01`; `"N/A"`, `"-"`, `""` → null.
- **T-PTY-10-2** unit: header synonym mapping resolves `Customer Name`→`name`, `Phone No`→`mobile`, `Outstanding`→`opening_balance`, `Area`→`tags`; an unknown column maps to "don't import".
- **T-PTY-10-3** unit: delimiter and encoding detection for `,`/`;`/tab and UTF-8/UTF-8-BOM/UTF-16/cp1252 fixtures, including a Devanagari-name file.
- **T-PTY-10-4** API: upload → job `ready` with correct `total_rows`, `valid_rows`, `error_rows`, `duplicate_rows`, `totals.opening_receivable/payable` and a 100-row preview.
- **T-PTY-10-5** API: every row-level rule of §10 produces its documented code and message with the right row and column, and a row with three bad columns reports three errors.
- **T-PTY-10-6** API: `duplicate_in_file` names both row numbers; an existing-mobile row is a skip in `skip` mode and an update in `update` mode, and in `update` mode its `opening_balance` is ignored (BR-5) — asserted by the unchanged party balance.
- **T-PTY-10-7** API: commit creates parties with `via='import'` audit metadata, posts exactly one `opening` ledger entry per non-zero balance with the right direction and date, and the party's balance equals the entry.
- **T-PTY-10-8** API: `opening_type=to_pay` → `direction='credit'`; blank balance → no entry and `last_activity_at IS NULL`.
- **T-PTY-10-9** API: re-uploading the same file in `skip` mode creates nothing (idempotence, BR-6); a replayed `Idempotency-Key` returns the original result.
- **T-PTY-10-10** API: a 5,001-row file → 400 `too_many_rows`; a 6 MB file → 400 `file_too_large`; a headerless file → 400; a binary file → 400.
- **T-PTY-10-11** API: plan capacity — 620 rows with 500 remaining → preview `plan.over_by=120`; commit without `truncate` → 403; with `truncate=true` → 500 created and 120 reported as `plan_limit_reached`.
- **T-PTY-10-12** API: chunk failure — a forced error in chunk 3 leaves chunks 1–2 committed, reports chunk 3's rows as failed, and the job ends `completed` with accurate counts (BR-7).
- **T-PTY-10-13** API: `PATCH` column map re-validates and replaces the preview while keeping `status='ready'`.
- **T-PTY-10-14** API: `GET /imports/{id}/errors.csv` returns the original columns in order plus the two error columns, and a cell starting with `=` is prefixed with `'`.
- **T-PTY-10-15** API: tags in the file are created once, reused across rows, respect the 200-tag tenant cap, and a comma inside a tag name errors the row.
- **T-PTY-10-16** permission: staff and accountant → 403 on upload and commit; an owner without `ledger.entry.write` (override) can commit a file without balances and gets `permission_opening_balance` skips for rows with them.
- **T-PTY-10-17** API: cross-tenant job id → 404; a `ready` job older than 24 h is expired by the scheduler and its file deleted.
- **T-PTY-10-18** performance: 5,000-row validation ≤ 8 s with ≤ 15 queries; commit ≤ 60 s; memory high-water below the configured cap (asserted with `tracemalloc`).
- **T-PTY-10-19** component: the stepper blocks Continue while `name` is unmapped; the preview recomputes when the duplicate mode changes; Commit is disabled when zero rows are ready.
- **T-PTY-10-20** component: the Ready grid renders values in app formatting (₹ grouping, `+91…`, dd/mm/yyyy, tag chips) and the Errors grid highlights the offending cells.
- **T-PTY-10-21** E2E: import 300 rows with 287 valid, 9 duplicates and 4 errors → commit → party list shows 287 new parties → the receivable total equals the preview's `opening_receivable` → download the errors CSV, fix the 4 rows, re-upload and commit → 291 parties total.
- **T-PTY-10-22** E2E: navigate away during a 5,000-row commit, return via "Unfinished imports", and see live progress and the correct final result.
- **T-PTY-10-23** a11y: axe clean on all three steps; progress is announced; the errors grid uses row numbers as row headers.

#### 22. Acceptance Criteria
- **AC-1 (US-1)** Given a CSV of 300 parties, when I upload and commit it, then 300 parties exist with the names, numbers and details from the file, each audited with `via='import'`.
- **AC-2 (US-2)** Given the import page, when I press Download template, then I receive a UTF-8 CSV whose header row matches the documented columns and whose example rows import without errors.
- **AC-3 (US-3)** Given rows with `opening_balance` and `opening_type`, when I commit, then each party has exactly one "Opening balance" entry of that amount and direction dated as given, and the party list's "You will get" total equals the preview's figure.
- **AC-4 (US-4)** Given a file with errors, when validation finishes, then I see counts of rows that will be created, already exist and have errors, together with the opening-balance totals, and **no** party has been created yet.
- **AC-5 (US-5)** Given row 12 has a bad mobile, when I open the Errors tab, then it names row 12, my own column heading and the reason.
- **AC-6 (US-6)** Given 9 rows match existing parties, when I choose "Skip them" and commit, then those 9 are untouched; when I choose "Update their details" instead, their names and addresses are updated and their balances are unchanged.
- **AC-7 (US-7)** Given 4 failed rows, when I press Download errors, then I receive a CSV of those 4 rows in my original column order plus the error columns, which I can fix and re-upload directly.
- **AC-8 (US-8)** Given a file whose columns are "Customer Name", "Phone No" and "Outstanding", when I reach the mapping step, then all three are matched automatically and I can correct any of them before validating.

#### 23. Dependencies
PTY-01 (all party validation, normalisation and audit vocabulary), PTY-02 (entry point, list refresh, export as the round-trip counterpart), PTY-05 (tag creation and limits), PTY-06 (credit limit/days columns), PTY-07 (shares `POST /parties/bulk` semantics and the no-messaging rule), PTY-08 (repairs duplicates the import could not match), LED-02 (`post_opening_balance` service — the import must not reimplement it), PLT-03 (onboarding step), PLT-06 (`fy_start_month` default for `opening_date`), PLT-15 (`max_parties`), PLT-10 (file included in export/delete), NTF-01 (completion notifications), FIL-01 (`files_attachment` storage and signed URLs), INV-12 (items/opening-stock imports sharing this shell), the `platform_job` runner (ADR-012), `UbFileUpload`, `UbDataGrid`, `UbTabs`, `UbStatCard`, `MLProgress`, CCR-32 (`column_map` column, endpoint deltas, error codes, poller index).

#### 24. Future Enhancements
`.xlsx` upload with sheet selection (IMP-04, P2 — needs an ADR for the reader library); direct importers for Khatabook, OkCredit, Vyapar and Tally party exports that map their known column sets automatically (P2 — the single highest-leverage migration feature); in-preview cell editing so small mistakes are fixed without leaving the app (P2); a "dry-run diff" for `update` mode showing field-by-field before/after per matched party (P3); scheduled/recurring imports from a URL or a shared drive for distributors whose ERP exports nightly (P3); import of ledger *transactions* (not just opening balances) for a full history migration, with its own reconciliation report (P3); undo of an entire import within 24 h by voiding its opening entries and archiving its created parties (P3); duplicate suggestions generated from the import result feeding PTY-08 (P3).
