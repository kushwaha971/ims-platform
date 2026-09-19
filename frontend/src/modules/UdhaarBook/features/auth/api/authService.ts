import { API_PATHS } from 'src/api/APIPaths';
import { api } from 'src/api/AxiosInstances';
import type { SessionPayload } from 'src/redux/slice/sessionSlice';
import type { TWriteClass } from 'src/types/api.types';
import type { Locale, ModuleCode, PermissionCode } from 'src/types/domain.types';

// ── Wire shapes (snake_case, exactly as Part 22 §22.2 documents them) ────────

interface SessionApiResponse {
  readonly data: {
    readonly user: {
      readonly id: string;
      readonly name: string;
      readonly mobile: string;
      readonly locale: Locale;
    };
    readonly active_tenant: {
      readonly id: string;
      readonly name: string;
      readonly timezone: string;
    } | null;
    readonly tenants: readonly {
      readonly id: string;
      readonly name: string;
      readonly timezone: string;
    }[];
    readonly permissions: readonly PermissionCode[];
    readonly enabled_modules: readonly ModuleCode[];
    readonly ver?: number;
  };
}

/** GET /auth/me — the session summary, rehydrated on every app load. */
export const getSession = async (signal?: AbortSignal): Promise<SessionPayload> => {
  const response = await api.get<SessionApiResponse>(API_PATHS.AUTH_ME, { signal });
  const data = response.data.data;
  return {
    user: data.user,
    activeTenant: data.active_tenant,
    tenants: data.tenants,
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
