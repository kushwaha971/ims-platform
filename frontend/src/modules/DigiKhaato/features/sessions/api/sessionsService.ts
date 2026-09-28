import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

import type { DeviceKind, DeviceSession, DeviceSessionApiRow } from '../types/session.types';

/**
 * Part 19 §19.3.4 — PLT-09's service: one function per endpoint (CR-013),
 * owning the snake_case mapping. No React, no Redux.
 */

const DEVICE_KINDS: readonly DeviceKind[] = ['phone', 'tablet', 'desktop'];

export const toDeviceSession = (row: DeviceSessionApiRow): DeviceSession => {
  const summary = row.user_agent_summary ?? {};
  const kind = summary.device as DeviceKind | undefined;
  return {
    id: row.id,
    label: row.device_label ?? null,
    browser: summary.browser ?? null,
    os: summary.os ?? null,
    device: kind && DEVICE_KINDS.includes(kind) ? kind : null,
    ipMasked: row.ip_masked ?? null,
    tenantName: row.tenant?.name ?? null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? null,
    isCurrent: Boolean(row.is_current),
  };
};

/**
 * GET /auth/sessions — the caller's own live devices.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a whole-page read: the page renders
 * its own failure with a request id and Try again, so the toast is suppressed.
 */
export const listDevices = async (signal?: AbortSignal): Promise<DeviceSession[]> => {
  const response = await api.get<{ data: readonly DeviceSessionApiRow[] }>(
    API_PATHS.AUTH_SESSIONS,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return response.data.data.map(toDeviceSession);
};

/** PATCH /auth/sessions/{id} — FR-7, the person's own name for the device. */
export const renameDevice = async (id: string, label: string): Promise<DeviceSession> => {
  const response = await api.patch<{ data: DeviceSessionApiRow }>(API_PATHS.AUTH_SESSION(id), {
    device_label: label,
  });
  return toDeviceSession(response.data.data);
};

/** DELETE /auth/sessions/{id} — FR-2; the current device answers 409 `current_session`. */
export const revokeDevice = async (id: string): Promise<void> => {
  await api.delete(API_PATHS.AUTH_SESSION(id));
};

/** POST /auth/logout?all=true — FR-3/AC-3: every device, this one included. */
export const logoutEverywhere = async (): Promise<void> => {
  await api.post(`${API_PATHS.AUTH_LOGOUT}?all=true`);
};

/** POST /memberships/{id}/revoke-sessions — FR-4, a manager, this business only. */
export const revokeMemberDevices = async (membershipId: string): Promise<number> => {
  const response = await api.post<{ data: { sessions_revoked: number } }>(
    API_PATHS.MEMBERSHIP_REVOKE_SESSIONS(membershipId)
  );
  return response.data.data.sessions_revoked;
};
