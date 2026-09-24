import { API_PATHS } from 'src/api/APIPaths';
import { absoluteApiUrl } from 'src/api/apiUrl';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { PageMeta } from 'src/types/api.types';
import { toQueryString } from 'src/utils/queryString';

import type {
  AuditActor,
  AuditActorType,
  AuditFilters,
  AuditRow,
  AuditRowApi,
} from '../types/audit.types';

/**
 * Part 19 §19.3.4 — PLT-08's service (`fetchAuditLogs`, `exportAuditLogs`).
 * No React, no Redux.
 */

const ACTOR_TYPES: readonly AuditActorType[] = ['user', 'system', 'webhook', 'super_admin'];

export const toAuditRow = (row: AuditRowApi): AuditRow => ({
  id: row.id,
  createdAt: row.created_at,
  actor: row.actor
    ? {
        id: row.actor.id,
        name: row.actor.name,
        role: row.actor.role,
        isFormerMember: Boolean(row.actor.is_former_member),
      }
    : null,
  actorType: ACTOR_TYPES.includes(row.actor_type as AuditActorType)
    ? (row.actor_type as AuditActorType)
    : 'user',
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  entityLabel: row.entity_label,
  entityRoute: row.entity_route ?? null,
  before: row.before,
  after: row.after,
  changedKeys: row.changed_keys ?? [],
  reason: row.metadata?.reason ?? null,
  requestId: row.metadata?.request_id ?? null,
  ip: row.metadata?.ip ?? null,
});

/** The query the server takes (FR-1 names), from the viewer's filters. */
export const auditQuery = (filters: AuditFilters): Record<string, string | number> => {
  const query: Record<string, string | number> = {
    page: filters.page,
    page_size: filters.pageSize,
  };
  if (filters.dateFrom) query.date_from = filters.dateFrom;
  if (filters.dateTo) query.date_to = filters.dateTo;
  if (filters.actorId) query.actor_id = filters.actorId;
  if (filters.group) query.group = filters.group;
  if (filters.q.trim()) query.q = filters.q.trim();
  return query;
};

interface AuditListApiResponse {
  readonly data: readonly AuditRowApi[];
  readonly meta?: {
    readonly page?: number;
    readonly page_size?: number;
    readonly total?: number;
    readonly total_pages?: number;
  };
}

/**
 * GET /audit-logs — FR-1/FR-3.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a whole-page read that renders its
 * own failure (request id, Try again), so the toast is suppressed.
 */
export const fetchAuditLogs = async (
  filters: AuditFilters,
  signal?: AbortSignal
): Promise<{ rows: AuditRow[]; meta: PageMeta }> => {
  const response = await api.get<AuditListApiResponse>(
    `${API_PATHS.AUDIT_LOGS}${toQueryString(auditQuery(filters))}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const meta = response.data.meta ?? {};
  return {
    rows: response.data.data.map(toAuditRow),
    meta: {
      page: meta.page ?? filters.page,
      pageSize: meta.page_size ?? filters.pageSize,
      total: meta.total ?? response.data.data.length,
      totalPages: meta.total_pages ?? 1,
    },
  };
};

/** GET /audit-logs/actors — the "Who" options, former members included (EC-2). */
export const fetchAuditActors = async (signal?: AbortSignal): Promise<AuditActor[]> => {
  const response = await api.get<{
    data: readonly { id: string; name: string; role: string | null; is_former_member: boolean }[];
  }>(API_PATHS.AUDIT_LOG_ACTORS, ubConfig({ signal }));
  return response.data.data.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    isFormerMember: row.is_former_member,
  }));
};

/**
 * FR-7 — the CSV of exactly the filtered rows, as an ABSOLUTE API URL for a
 * download link (a relative one would resolve against the frontend and save
 * the page's HTML — see `absoluteApiUrl`). The session cookie carries it.
 */
export const auditExportUrl = (filters: AuditFilters): string => {
  const { page: _page, page_size: _size, ...rest } = auditQuery(filters);
  return absoluteApiUrl(`${API_PATHS.AUDIT_LOGS}${toQueryString({ ...rest, format: 'csv' })}`);
};
