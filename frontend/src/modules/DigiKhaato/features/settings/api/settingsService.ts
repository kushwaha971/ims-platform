import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { ModuleCode } from 'src/types/domain.types';

import type {
  NumberingRow,
  SettingsDefaults,
  SettingsModules,
  SettingsValues,
  TenantSettings,
} from '../types/settings.types';

/**
 * Part 19 §19.3.4 — PLT-06's service (`fetchSettings`, `saveSettings`,
 * `updateEnabledModules`). No React, no Redux.
 */

interface SettingsApiResponse {
  readonly data: {
    readonly values: SettingsValues;
    readonly numbering: Readonly<Record<string, NumberingRow>>;
    readonly fy_label: string;
    readonly modules: SettingsModules;
    /** A9b: the enabled modules that read the business-days calendar. */
    readonly calendar_readers?: readonly ModuleCode[];
    readonly etag: string;
  };
}

const toSettings = (data: SettingsApiResponse['data']): TenantSettings => ({
  values: data.values,
  numbering: data.numbering,
  fyLabel: data.fy_label,
  modules: data.modules,
  calendarReaders: data.calendar_readers ?? [],
  etag: data.etag,
});

/**
 * GET /tenants/current/settings — FR-2, with the ETag (CR-011) in the body as
 * well as the header, because a CORS response hides `ETag` from JavaScript
 * unless it is exposed, and the body is what the next PUT's `If-Match` needs.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a whole-page read that renders its
 * own failure, so the toast is suppressed.
 */
export const fetchSettings = async (signal?: AbortSignal): Promise<TenantSettings> => {
  const response = await api.get<SettingsApiResponse>(
    API_PATHS.TENANT_SETTINGS,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toSettings(response.data.data);
};

/**
 * PUT /tenants/current/settings — FR-8: the section merged into the object the
 * page fetched, sent with `If-Match`. A stale ETag is 412 `precondition_failed`
 * and the page offers a reload rather than overwriting a colleague's change.
 */
export const saveSettings = async (
  values: SettingsValues,
  etag: string
): Promise<TenantSettings> => {
  const response = await api.put<SettingsApiResponse>(
    API_PATHS.TENANT_SETTINGS,
    { values },
    ubConfig({ headers: { 'If-Match': etag } })
  );
  return toSettings(response.data.data);
};

/** GET /tenants/current/settings/defaults — FR-10's preset values. */
export const fetchSettingsDefaults = async (): Promise<SettingsDefaults> => {
  const response = await api.get<{
    data: { values: SettingsValues; business_type: string };
  }>(API_PATHS.TENANT_SETTINGS_DEFAULTS);
  return { values: response.data.data.values, businessType: response.data.data.business_type };
};

/**
 * PATCH /tenants/current {enabled_modules} — FR-4. A module with live data is
 * 409 `module_has_data` with the count and its breakdown, drawn under the refused
 * switch (the snackbar carries it only when the server sent no breakdown).
 */
export const updateEnabledModules = async (modules: readonly string[]): Promise<void> => {
  await api.patch(API_PATHS.TENANT_CURRENT, { enabled_modules: modules });
};
