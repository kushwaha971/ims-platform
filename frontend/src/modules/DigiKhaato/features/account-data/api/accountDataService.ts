import { API_PATHS } from 'src/api/APIPaths';
import { absoluteFileUrl } from 'src/api/apiUrl';
import { api, ubConfig } from 'src/api/AxiosInstances';

import type {
  DeleteRequestInput,
  DeletionState,
  DeletionStateApi,
  SupportAccess,
  SupportAccessApi,
  SupportDecision,
  TenantExport,
  TenantExportApi,
} from '../types/accountData.types';

/**
 * Part 19 §19.3.4 — PLT-10's service (`accountDataService.ts`, FRD §14) plus
 * the owner's half of PLT-14's consent. One function per endpoint, owning the
 * snake_case mapping. No React, no Redux.
 */

export const toTenantExport = (row: TenantExportApi): TenantExport => ({
  id: row.id,
  status: row.status,
  requestedAt: row.requested_at,
  finishedAt: row.finished_at,
  expiresAt: row.expires_at,
  sizeBytes: row.size_bytes,
  rowCounts: row.row_counts ?? {},
  // The server sends `/api/v1/…`; a relative href would resolve against the
  // frontend's origin and save the page's HTML (see `absoluteFileUrl`).
  downloadUrl: row.download_url ? absoluteFileUrl(row.download_url) : null,
  requestedBy: row.requested_by?.name ?? null,
});

export const toDeletionState = (row: DeletionStateApi): DeletionState => ({
  status: row.status,
  deletionRequestedAt: row.deletion_requested_at,
  scheduledFor: row.scheduled_for,
  coolOffDays: row.cool_off_days,
  exportFresh: row.export_fresh,
  latestExport: row.latest_export ? toTenantExport(row.latest_export) : null,
  businessName: row.business_name,
});

export const toSupportAccess = (row: SupportAccessApi): SupportAccess => ({
  id: row.id,
  status: row.status,
  reason: row.reason,
  requestedBy: row.requested_by?.name ?? null,
  requestedAt: row.requested_at,
  decidedBy: row.decided_by?.name ?? null,
  decidedAt: row.decided_at,
  expiresAt: row.expires_at,
  activeSessionEndsAt: row.active_session?.expires_at ?? null,
});

/**
 * GET /tenants/current/deletion — the page's state.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a whole-page read that renders its
 * own failure with a request id and Try again, so the toast is suppressed.
 */
export const getDeletionState = async (signal?: AbortSignal): Promise<DeletionState> => {
  const response = await api.get<{ data: DeletionStateApi }>(
    API_PATHS.TENANT_DELETION,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toDeletionState(response.data.data);
};

/** GET /tenants/current/exports — the last five (FRD §7 `ExportHistoryList`). */
export const listExports = async (signal?: AbortSignal): Promise<TenantExport[]> => {
  const response = await api.get<{ data: readonly TenantExportApi[] }>(
    API_PATHS.TENANT_EXPORTS,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return response.data.data.map(toTenantExport);
};

/** POST /tenants/current/export — 202 (FR-1). */
export const requestExport = async (): Promise<TenantExport> => {
  const response = await api.post<{ data: TenantExportApi }>(API_PATHS.TENANT_EXPORT);
  return toTenantExport(response.data.data);
};

/** GET /tenants/current/exports/{id} — the poll (FR-2). */
export const getExport = async (id: string, signal?: AbortSignal): Promise<TenantExport> => {
  const response = await api.get<{ data: TenantExportApi }>(
    API_PATHS.TENANT_EXPORT_DETAIL(id),
    ubConfig({ signal })
  );
  return toTenantExport(response.data.data);
};

/**
 * POST /tenants/current/delete-request (FR-3). The password re-verifies the
 * owner (DEC-010: there is no OTP); a wrong one is a 400 on the field.
 */
export const requestDeletion = async (input: DeleteRequestInput): Promise<DeletionState> => {
  const response = await api.post<{ data: DeletionStateApi }>(API_PATHS.TENANT_DELETE_REQUEST, {
    password: input.password,
    confirm_name: input.confirmName,
    reason: input.reason,
  });
  return toDeletionState(response.data.data);
};

/** POST /tenants/current/delete-cancel (FR-4). */
export const cancelDeletion = async (): Promise<DeletionState> => {
  const response = await api.post<{ data: DeletionStateApi }>(API_PATHS.TENANT_DELETE_CANCEL);
  return toDeletionState(response.data.data);
};

/** GET /support/access-requests — PLT-14 FR-6, the owner's inbox of requests. */
export const listSupportAccess = async (signal?: AbortSignal): Promise<SupportAccess[]> => {
  const response = await api.get<{ data: readonly SupportAccessApi[] }>(
    API_PATHS.SUPPORT_ACCESS_REQUESTS,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return response.data.data.map(toSupportAccess);
};

/** POST /support/access-requests/{id}/{allow|deny|revoke}. */
export const decideSupportAccess = async (
  id: string,
  decision: SupportDecision
): Promise<SupportAccess> => {
  const response = await api.post<{ data: SupportAccessApi }>(
    API_PATHS.SUPPORT_ACCESS_DECISION(id, decision)
  );
  return toSupportAccess(response.data.data);
};
