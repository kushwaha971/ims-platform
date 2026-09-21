import { API_PATHS } from 'src/api/APIPaths';
import { api } from 'src/api/AxiosInstances';
import { DEFAULT_TENANT_TIMEZONE } from 'src/constants';
import type { SessionPayload, SessionTenant } from 'src/redux/slice/sessionSlice';
import type { TWriteClass } from 'src/types/api.types';
import type { Locale, ModuleCode, PermissionCode } from 'src/types/domain.types';

import type {
  AuthResult,
  AuthTenant,
  PasswordLoginInput,
  PasswordResetConfirmInput,
  PasswordSetInput,
  RegisterInput,
  RoleCode,
  TenantApiRow,
} from '../types/auth.types';

/**
 * Part 19 §19.3.4 — the service layer: one exported async function per
 * endpoint, owning the snake_case ⇄ camelCase mapping, the query string and the
 * response typing, returning domain objects rather than `AxiosResponse`.
 *
 * No React, no Redux, no `Ub*`, no `react-intl`.
 *
 * **CR-2026-09-19-A.** `requestOtp` and `verifyOtp` are gone with the endpoints
 * they called; `register` is new, because nothing creates an account as a side
 * effect any more. The reset pair now carries an email and a link token instead
 * of a mobile and a six-digit code.
 *
 * Every write here is class **B, non-queueable** (§19.10.4): a session is
 * server-side by definition, and a login replayed from an outbox six hours
 * later is not a session — it is a security hole. The `*WriteClass` exports are
 * what `canWrite()` consults so an affordance is DISABLED in confirmed
 * `offline` rather than hidden.
 */

// ── Wire shapes (snake_case, exactly as Part 22 §22.2 documents them) ────────

interface AuthUserApiRow {
  readonly id: string;
  readonly name?: string;
  readonly full_name?: string;
  readonly email?: string | null;
  readonly mobile?: string | null;
  readonly locale: Locale;
  readonly is_new?: boolean;
  readonly has_password?: boolean;
  /**
   * DEC-012 — the account is on a password its OWNER did not choose, issued by
   * a business owner and passed on by hand. The server refuses every route but
   * the change itself while this is true (`common/authentication.py`); this
   * field is what lets the client route there instead of showing the person a
   * wall of 403s on their first ever sign-in.
   */
  readonly must_change_password?: boolean;
  readonly password_expires_at?: string | null;
}

/**
 * The active-tenant summary. Part 22 §22.2 is explicit that the enabled modules
 * live HERE and not at the top level of the payload — "active tenant summary
 * (`enabled_modules`, `gst_type`, `branding`)" — and `session_payload.build()`
 * agrees: there is no top-level `enabled_modules` on any `/auth/*` response.
 *
 * Everything below `id`/`name` is optional because this type used to claim
 * three fields while the server sent sixteen; a type that under-describes the
 * wire is how the next reader gets `undefined` where they expected a value.
 * Only what this file actually maps is listed, so the type stays a contract
 * rather than a second copy of the serializer.
 */
interface ActiveTenantApiRow {
  readonly id: string;
  readonly name: string;
  readonly timezone?: string;
  readonly status?: string;
  readonly onboarding_step?: number | null;
  readonly enabled_modules?: readonly ModuleCode[];
}

interface AuthApiResponse {
  readonly data: {
    readonly user: AuthUserApiRow;
    readonly tenants: readonly TenantApiRow[];
    readonly active_tenant_id: string | null;
    readonly active_tenant?: ActiveTenantApiRow | null;
    readonly permissions: readonly PermissionCode[];
  };
}

interface SessionApiResponse {
  readonly data: {
    readonly user: {
      readonly id: string;
      readonly name?: string;
      readonly full_name?: string;
      readonly email?: string | null;
      readonly mobile?: string | null;
      readonly locale: Locale;
      /** DEC-012 — see `AuthUserApiRow` above for why these are optional. */
      readonly must_change_password?: boolean;
      readonly password_expires_at?: string | null;
    };
    readonly active_tenant: ActiveTenantApiRow | null;
    readonly tenants: readonly TenantApiRow[];
    readonly permissions: readonly PermissionCode[];
    /**
     * `ver` is the permissions version `sessionSlice` re-reads on (Part 22
     * §22.2) — the same integer as the access token's `ver` claim, which the
     * server compares against `membership.permissions_version` to answer
     * `token_stale`. `session_payload.build()` now sends it; it is `null` for a
     * session with no membership, because the version belongs to a membership.
     * Still read with `?? null` rather than required: it is never spread or
     * indexed, unlike `enabled_modules` was.
     */
    readonly ver?: number | null;
  };
}

// ── Mappers ──────────────────────────────────────────────────────────────────

const toAuthTenant = (row: TenantApiRow): AuthTenant => ({
  id: row.id,
  name: row.name,
  // ADR-011: until the tenant says otherwise, business dates are IST.
  timezone: row.timezone ?? DEFAULT_TENANT_TIMEZONE,
  role: (row.role as RoleCode | undefined) ?? null,
  isDefault: row.is_default ?? false,
  status: row.status ?? 'active',
  membershipId: row.membership_id ?? null,
  onboardingStep: row.onboarding_step ?? null,
});

/**
 * PLT-01 FR-5. `full_name` is what `platform_user` calls it and `name` is what
 * Part 22 §22.2's example prints; a newly registered user has neither, and `''`
 * is the documented value — which is exactly why the onboarding wizard asks for
 * it again on step 1 (PLT-03 BR-7).
 *
 * `mobile` is read defensively as `null`: CR-2026-09-19-A made it an optional
 * profile field, and an account that has never entered one is normal now.
 */
const toAuthResult = (body: AuthApiResponse): AuthResult => {
  const data = body.data;
  return {
    userId: data.user.id,
    name: data.user.name ?? data.user.full_name ?? '',
    email: data.user.email ?? '',
    mobile: data.user.mobile ?? null,
    locale: data.user.locale,
    isNew: data.user.is_new ?? false,
    hasPassword: data.user.has_password ?? true,
    // Defaults to FALSE, which is the safe default here and the opposite of
    // `has_password` above: an older server that does not send the field has no
    // such accounts, and defaulting to `true` would strand every existing user
    // on the change-password screen.
    mustChangePassword: data.user.must_change_password ?? false,
    passwordExpiresAt: data.user.password_expires_at ?? null,
    activeTenantId: data.active_tenant_id,
    tenants: data.tenants.map(toAuthTenant),
    permissions: data.permissions,
    // Part 22 §22.2 — modules belong to the ACTIVE TENANT, not to the user.
    // This used to read a top-level `enabled_modules` the server has never
    // sent; the `?? []` meant it degraded to "no modules" instead of throwing,
    // which is why only `getSession` (below) blew up.
    enabledModules: data.active_tenant?.enabled_modules ?? [],
  };
};

// ── CR-2026-09-19-A FR-S1 — registration ─────────────────────────────────────

/**
 * POST /auth/register — `{ email, password, full_name? }` → the `/auth/me`
 * body, with the session cookies set as a side effect.
 *
 * CR-2026-09-19-E — this call used to pass `suppressErrorSnackbar: true`, and
 * so did every other call in this file. The reason given was sound but the
 * mechanism was too broad: the two failures it named — a 400 whose
 * `details.email` says the address is taken, and a 400 whose `details.password`
 * carries the server's policy — are both `validation_error`, which
 * `shouldToast` already excludes BY CODE for the whole application. Opting the
 * request out as well ALSO silenced the 500s, the 503s and the timeouts, which
 * is why every auth screen had grown an error banner of its own. The flag is
 * gone; the exceptions are decided once, by code, in src/utils/apiError.ts.
 */
export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const response = await api.post<AuthApiResponse>(
    API_PATHS.AUTH_REGISTER,
    {
      email: input.email,
      password: input.password,
      ...(input.name ? { full_name: input.name } : {}),
      // Sent only when the user gave one: the serializer takes `allow_blank`,
      // but an empty string in the body would claim they answered.
      ...(input.mobile ? { mobile: input.mobile } : {}),
      ...(input.deviceLabel ? { device_label: input.deviceLabel } : {}),
    }
  );
  return toAuthResult(response.data);
};
export const registerWriteClass: TWriteClass = 'online-only';

// ── PLT-02 — password ────────────────────────────────────────────────────────

/**
 * POST /auth/login. CR-2026-09-19-A: one identity and it is an email, so there
 * is no identifier to parse and no branch that could conflate an email with
 * somebody else's mobile.
 *
 * CR-2026-09-19-E — no `suppressErrorSnackbar`. AC-5's rule (one identical
 * message, under the password field, for a wrong password and an unknown
 * address alike) is kept by `invalid_credentials` being in `LOCALLY_PRESENTED`,
 * which is a statement about that ERROR rather than about this request — so it
 * holds for every screen that logs in, and a 500 here still reaches the user.
 */
export const passwordLogin = async (input: PasswordLoginInput): Promise<AuthResult> => {
  const response = await api.post<AuthApiResponse>(
    API_PATHS.AUTH_LOGIN,
    {
      email: input.email,
      password: input.password,
      ...(input.deviceLabel ? { device_label: input.deviceLabel } : {}),
    },
  );
  return toAuthResult(response.data);
};
export const passwordLoginWriteClass: TWriteClass = 'online-only';

/**
 * POST /auth/password/set. FR-3: no current password is required when the
 * account has none; FR-9: other devices are revoked only on an explicit tick.
 */
export const setPassword = async (input: PasswordSetInput): Promise<void> => {
  await api.post(
    API_PATHS.AUTH_PASSWORD_SET,
    {
      new_password: input.newPassword,
      ...(input.currentPassword ? { current_password: input.currentPassword } : {}),
      ...(input.logoutOtherDevices ? { logout_other_devices: true } : {}),
    }
  );
};
export const setPasswordWriteClass: TWriteClass = 'online-only';

/**
 * POST /auth/password/reset/request — FR-4, BR-2.
 *
 * The response is identical for an address nobody has, which is why this
 * returns `void`: there is no field in it the client could branch on, and
 * giving the caller nothing is the cheapest way to guarantee the screen cannot
 * accidentally reveal one. At MVP the reset link is written to the server log by
 * the console mail backend; no message leaves the machine.
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  await api.post(API_PATHS.AUTH_PASSWORD_RESET_REQUEST, { email });
};
export const requestPasswordResetWriteClass: TWriteClass = 'online-only';

/** POST /auth/password/reset/confirm — FR-5 revokes every other session. */
export const confirmPasswordReset = async (
  input: PasswordResetConfirmInput
): Promise<AuthResult> => {
  const response = await api.post<AuthApiResponse>(
    API_PATHS.AUTH_PASSWORD_RESET_CONFIRM,
    { token: input.token, new_password: input.newPassword }
  );
  return toAuthResult(response.data);
};
export const confirmPasswordResetWriteClass: TWriteClass = 'online-only';

// ── Session (Sprint 0, unchanged) ────────────────────────────────────────────

/** GET /auth/me — the session summary, rehydrated on every app load. */
export const getSession = async (signal?: AbortSignal): Promise<SessionPayload> => {
  const response = await api.get<SessionApiResponse>(API_PATHS.AUTH_ME, { signal });
  const data = response.data.data;

  // PLT-04 FR-1 — the role, the default flag and the caller's own membership
  // id travel with each row, because the switcher shows all three.
  const tenants: readonly SessionTenant[] = data.tenants.map((row) => ({
    id: row.id,
    name: row.name,
    timezone: row.timezone ?? DEFAULT_TENANT_TIMEZONE,
    role: row.role ?? null,
    isDefault: row.is_default ?? false,
    status: row.status ?? 'active',
    membershipId: row.membership_id ?? null,
    onboardingStep: row.onboarding_step ?? null,
  }));

  /**
   * The active tenant is a SUMMARY, not a membership row: it carries the
   * business's own fields and knows nothing about the caller's role, default
   * flag or membership id. Assigning the wire object straight through left
   * `activeTenant.membershipId` permanently `undefined`, which is a second,
   * independent reason PLT-04 FR-5 ("Make default") and FR-7 ("Leave
   * business") can never render — `TenantSwitcherMenu` gates both on it. The
   * matching `tenants[]` row is where those three live, so the two are merged
   * here rather than in three components.
   */
  const activeRow = data.active_tenant;
  const membership = activeRow ? tenants.find((row) => row.id === activeRow.id) : undefined;
  const activeTenant: SessionTenant | null = activeRow
    ? {
        ...membership,
        id: activeRow.id,
        name: activeRow.name,
        timezone: activeRow.timezone ?? membership?.timezone ?? DEFAULT_TENANT_TIMEZONE,
        status: activeRow.status ?? membership?.status ?? 'active',
        onboardingStep: activeRow.onboarding_step ?? membership?.onboardingStep ?? null,
      }
    : null;

  return {
    user: {
      id: data.user.id,
      name: data.user.name ?? data.user.full_name ?? '',
      email: data.user.email ?? '',
      mobile: data.user.mobile ?? null,
      locale: data.user.locale,
      // Defaults to FALSE. An older server that does not send this has no such
      // accounts, and defaulting to `true` would strand every existing user on
      // the change-password screen.
      mustChangePassword: data.user.must_change_password ?? false,
      passwordExpiresAt: data.user.password_expires_at ?? null,
    },
    activeTenant,
    tenants,
    permissions: data.permissions,
    // Part 22 §22.2 and `session_payload.build()` both put the modules inside
    // the active-tenant summary. This read used to be `data.enabled_modules`
    // with NO fallback, and `sessionSlice` spreads it — so every authenticated
    // page load threw `TypeError: undefined is not iterable` out of a reducer,
    // where RTK's own try/catch cannot see it. A session with no active tenant
    // legitimately has no modules, which is what `[]` says.
    enabledModules: activeRow?.enabled_modules ?? [],
    version: data.ver ?? null,
  };
};

/**
 * POST /auth/switch-tenant — a new token, not a client-side filter (§19.6.5).
 * Never queued: session state is server-side by definition (§19.10.4).
 */
export const switchTenant = async (tenantId: string): Promise<SessionPayload> => {
  await api.post(API_PATHS.AUTH_SWITCH_TENANT, { tenant_id: tenantId });
  return getSession();
};
export const switchTenantWriteClass: TWriteClass = 'online-only';

/** POST /auth/logout — the teardown order is the caller's (§19.7.4). */
export const logout = async (): Promise<void> => {
  await api.post(API_PATHS.AUTH_LOGOUT);
};
export const logoutWriteClass: TWriteClass = 'online-only';
