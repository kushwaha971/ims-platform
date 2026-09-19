import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { DEFAULT_TENANT_TIMEZONE } from 'src/constants';
import type { SessionPayload } from 'src/redux/slice/sessionSlice';
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
}

interface AuthApiResponse {
  readonly data: {
    readonly user: AuthUserApiRow;
    readonly tenants: readonly TenantApiRow[];
    readonly active_tenant_id: string | null;
    readonly permissions: readonly PermissionCode[];
    readonly enabled_modules?: readonly ModuleCode[];
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
    };
    readonly active_tenant: {
      readonly id: string;
      readonly name: string;
      readonly timezone: string;
    } | null;
    readonly tenants: readonly TenantApiRow[];
    readonly permissions: readonly PermissionCode[];
    readonly enabled_modules: readonly ModuleCode[];
    readonly ver?: number;
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
    activeTenantId: data.active_tenant_id,
    tenants: data.tenants.map(toAuthTenant),
    permissions: data.permissions,
    enabledModules: data.enabled_modules ?? [],
  };
};

// ── CR-2026-09-19-A FR-S1 — registration ─────────────────────────────────────

/**
 * POST /auth/register — `{ email, password, full_name? }` → the `/auth/me`
 * body, with the session cookies set as a side effect.
 *
 * The toast is suppressed because the two failures this call actually has —
 * a 400 whose `details.email` says the address is taken, and a 400 whose
 * `details.password` carries the server's policy — both belong under the field
 * that caused them, not in a corner of the screen (§19.4.3).
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
    },
    ubConfig({ suppressErrorSnackbar: true })
  );
  return toAuthResult(response.data);
};
export const registerWriteClass: TWriteClass = 'online-only';

// ── PLT-02 — password ────────────────────────────────────────────────────────

/**
 * POST /auth/login. CR-2026-09-19-A: one identity and it is an email, so there
 * is no identifier to parse and no branch that could conflate an email with
 * somebody else's mobile.
 */
export const passwordLogin = async (input: PasswordLoginInput): Promise<AuthResult> => {
  const response = await api.post<AuthApiResponse>(
    API_PATHS.AUTH_LOGIN,
    {
      email: input.email,
      password: input.password,
      ...(input.deviceLabel ? { device_label: input.deviceLabel } : {}),
    },
    // AC-5 — the wrong-password and unknown-address messages must be identical,
    // and the screen renders that one message under the password field.
    ubConfig({ suppressErrorSnackbar: true })
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
    },
    ubConfig({ suppressErrorSnackbar: true })
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
  await api.post(
    API_PATHS.AUTH_PASSWORD_RESET_REQUEST,
    { email },
    ubConfig({ suppressErrorSnackbar: true })
  );
};
export const requestPasswordResetWriteClass: TWriteClass = 'online-only';

/** POST /auth/password/reset/confirm — FR-5 revokes every other session. */
export const confirmPasswordReset = async (
  input: PasswordResetConfirmInput
): Promise<AuthResult> => {
  const response = await api.post<AuthApiResponse>(
    API_PATHS.AUTH_PASSWORD_RESET_CONFIRM,
    { token: input.token, new_password: input.newPassword },
    ubConfig({ suppressErrorSnackbar: true })
  );
  return toAuthResult(response.data);
};
export const confirmPasswordResetWriteClass: TWriteClass = 'online-only';

// ── Session (Sprint 0, unchanged) ────────────────────────────────────────────

/** GET /auth/me — the session summary, rehydrated on every app load. */
export const getSession = async (signal?: AbortSignal): Promise<SessionPayload> => {
  const response = await api.get<SessionApiResponse>(API_PATHS.AUTH_ME, { signal });
  const data = response.data.data;
  return {
    user: {
      id: data.user.id,
      name: data.user.name ?? data.user.full_name ?? '',
      email: data.user.email ?? '',
      mobile: data.user.mobile ?? null,
      locale: data.user.locale,
    },
    activeTenant: data.active_tenant,
    // PLT-04 FR-1 — the role, the default flag and the caller's own membership
    // id travel with each row, because the switcher shows all three.
    tenants: data.tenants.map((row) => ({
      id: row.id,
      name: row.name,
      timezone: row.timezone ?? DEFAULT_TENANT_TIMEZONE,
      role: row.role ?? null,
      isDefault: row.is_default ?? false,
      status: row.status ?? 'active',
      membershipId: row.membership_id ?? null,
      onboardingStep: row.onboarding_step ?? null,
    })),
    permissions: data.permissions,
    enabledModules: data.enabled_modules,
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
