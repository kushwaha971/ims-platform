import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { PageMeta } from 'src/types/api.types';
import { toQueryString } from 'src/utils/queryString';

import { toSupportAccess } from 'modules/DigiKhaato/features/account-data/api/accountDataService';
import type {
  SupportAccess,
  SupportAccessApi,
} from 'modules/DigiKhaato/features/account-data/types/accountData.types';

import type {
  AdminHealth,
  AdminOverview,
  AdminPartnerRow,
  AdminPlan,
  AdminTenantDetail,
  AdminTenantDetailApi,
  AdminTenantFilters,
  AdminTenantPatch,
  AdminTenantRow,
  AdminTenantRowApi,
} from '../types/admin.types';

/**
 * Part 19 §19.3.4 — PLT-14's service. One function per `/admin/*` endpoint,
 * owning the snake_case mapping. No React, no Redux. The console's reads render
 * their own failure (request id, Try again), so their toasts are suppressed
 * (CR-2026-09-19-E); its writes toast through the global snackbar.
 */

export const toAdminTenantRow = (row: AdminTenantRowApi): AdminTenantRow => ({
  id: row.id,
  name: row.name,
  status: row.status,
  businessType: row.business_type,
  gstin: row.gstin,
  partner: row.partner,
  plan: row.plan,
  ownerEmail: row.owner_email,
  createdAt: row.created_at,
  lastActivityAt: row.last_activity_at,
  members: row.usage?.members ?? 0,
  parties: row.usage?.parties ?? 0,
});

export const toAdminTenantDetail = (row: AdminTenantDetailApi): AdminTenantDetail => ({
  ...toAdminTenantRow(row),
  legalName: row.legal_name,
  stateCode: row.state_code,
  deletionRequestedAt: row.deletion_requested_at,
  enabledModules: row.enabled_modules,
  planCode: row.entitlements.plan_code,
  maxUsers: row.entitlements.limits.max_users ?? { limit: null, used: 0 },
  storageMb: row.entitlements.limits.storage_mb ?? { limit: null, used: 0 },
  overrides: {
    maxUsers: row.entitlements.overrides.max_users ?? null,
    storageMb: row.entitlements.overrides.storage_mb ?? null,
  },
  owners: row.owners,
  supportAccess: row.support_access ? toSupportAccess(row.support_access) : null,
  recentAudit: row.recent_audit.map((line) => ({
    id: line.id,
    action: line.action,
    actorType: line.actor_type,
    actorName: line.actor_name,
    createdAt: line.created_at,
    reason: line.metadata?.reason ?? null,
  })),
});

/** GET /admin/overview — the tiles above the tenant list. */
export const getOverview = async (signal?: AbortSignal): Promise<AdminOverview> => {
  const response = await api.get<{
    data: {
      tenants: { total: number; active: number; suspended: number; pending_deletion: number };
      partners: number;
    };
  }>(API_PATHS.ADMIN_OVERVIEW, ubConfig({ signal, suppressErrorSnackbar: true }));
  const data = response.data.data;
  return {
    total: data.tenants.total,
    active: data.tenants.active,
    suspended: data.tenants.suspended,
    pendingDeletion: data.tenants.pending_deletion,
    partners: data.partners,
  };
};

/** GET /admin/tenants — FR-2's search. */
export const listTenants = async (
  filters: AdminTenantFilters,
  signal?: AbortSignal
): Promise<{ rows: AdminTenantRow[]; meta: PageMeta }> => {
  const query: Record<string, string | number> = {
    page: filters.page,
    page_size: filters.pageSize,
  };
  if (filters.q.trim()) query.q = filters.q.trim();
  if (filters.status) query.status = filters.status;
  const response = await api.get<{
    data: readonly AdminTenantRowApi[];
    meta?: { page?: number; page_size?: number; total?: number; total_pages?: number };
  }>(
    `${API_PATHS.ADMIN_TENANTS}${toQueryString(query)}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const meta = response.data.meta ?? {};
  return {
    rows: response.data.data.map(toAdminTenantRow),
    meta: {
      page: meta.page ?? filters.page,
      pageSize: meta.page_size ?? filters.pageSize,
      total: meta.total ?? response.data.data.length,
      totalPages: meta.total_pages ?? 1,
    },
  };
};

/** GET /admin/tenants/{id} — FR-3's card. */
export const getTenant = async (id: string, signal?: AbortSignal): Promise<AdminTenantDetail> => {
  const response = await api.get<{ data: AdminTenantDetailApi }>(
    API_PATHS.ADMIN_TENANT(id),
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toAdminTenantDetail(response.data.data);
};

/** PATCH /admin/tenants/{id} — plan, status, limit overrides; a reason always (FR-10). */
export const updateTenant = async (
  id: string,
  patch: AdminTenantPatch
): Promise<AdminTenantDetail> => {
  const body: Record<string, unknown> = { reason: patch.reason };
  if (patch.planId) body.plan_id = patch.planId;
  if (patch.status) body.status = patch.status;
  if (patch.overrides) {
    body.entitlement_overrides = {
      max_users: patch.overrides.maxUsers,
      storage_mb: patch.overrides.storageMb,
    };
  }
  const response = await api.patch<{ data: AdminTenantDetailApi }>(
    API_PATHS.ADMIN_TENANT(id),
    body
  );
  return toAdminTenantDetail(response.data.data);
};

/** GET /admin/partners — FR-4's list (the form is WLB-02's). */
export const listPartners = async (signal?: AbortSignal): Promise<AdminPartnerRow[]> => {
  const response = await api.get<{
    data: readonly {
      id: string;
      code: string;
      name: string;
      status: string;
      default_plan: { code: string } | null;
      tenant_count: number;
      created_at: string;
    }[];
  }>(API_PATHS.ADMIN_PARTNERS, ubConfig({ signal, suppressErrorSnackbar: true }));
  return response.data.data.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    defaultPlanCode: row.default_plan?.code ?? null,
    tenantCount: row.tenant_count,
    createdAt: row.created_at,
  }));
};

/** GET /admin/plans — the plan picker. */
export const listPlans = async (signal?: AbortSignal): Promise<AdminPlan[]> => {
  const response = await api.get<{
    data: readonly { id: string; code: string; name: string; is_active: boolean }[];
  }>(API_PATHS.ADMIN_PLANS, ubConfig({ signal }));
  return response.data.data.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
  }));
};

/** POST /admin/tenants/{id}/access-requests — FR-6; the owners are notified. */
export const requestAccess = async (id: string, reason: string): Promise<SupportAccess> => {
  const response = await api.post<{ data: SupportAccessApi }>(
    API_PATHS.ADMIN_TENANT_ACCESS_REQUEST(id),
    { reason }
  );
  return toSupportAccess(response.data.data);
};

/**
 * POST /admin/tenants/{id}/impersonate — FR-5. The server sets the support
 * cookie; the caller then loads the app as a DOCUMENT so every slice rebuilds
 * from `/auth/me` inside that business.
 */
export const impersonate = async (id: string, consentId: string, reason: string): Promise<void> => {
  await api.post(API_PATHS.ADMIN_TENANT_IMPERSONATE(id), { consent_id: consentId, reason });
};

/** POST /admin/impersonation/end — the cookie becomes the operator's own again. */
export const endImpersonation = async (): Promise<string | null> => {
  const response = await api.post<{ data: { tenant_id?: string } }>(
    API_PATHS.ADMIN_IMPERSONATION_END
  );
  return response.data.data.tenant_id ?? null;
};

/** GET /admin/health — FR-7. */
export const getHealth = async (signal?: AbortSignal): Promise<AdminHealth> => {
  const response = await api.get<{
    data: {
      db: { ok: boolean; latency_ms: number };
      storage: { ok: boolean; free_mb: number | null };
      scheduler: { ok: boolean; last_heartbeat_at: string | null; lag_s: number | null };
      jobs: { queued: number; running: number; failed_24h: number; oldest_queued_s: number | null };
      version: string;
      email_backend: string;
      checked_at: string;
    };
  }>(API_PATHS.ADMIN_HEALTH, ubConfig({ signal, suppressErrorSnackbar: true }));
  const data = response.data.data;
  return {
    dbOk: data.db.ok,
    dbLatencyMs: data.db.latency_ms,
    storageOk: data.storage.ok,
    freeMb: data.storage.free_mb,
    schedulerOk: data.scheduler.ok,
    lastHeartbeatAt: data.scheduler.last_heartbeat_at,
    lagS: data.scheduler.lag_s,
    queued: data.jobs.queued,
    running: data.jobs.running,
    failed24h: data.jobs.failed_24h,
    oldestQueuedS: data.jobs.oldest_queued_s,
    version: data.version,
    emailBackend: data.email_backend,
    checkedAt: data.checked_at,
  };
};
