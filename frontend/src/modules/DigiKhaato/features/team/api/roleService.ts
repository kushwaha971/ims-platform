import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

import type { RoleApiRow, RoleOption } from '../types/role.types';

/**
 * A13 (PLT-X12 §6-§7) — `GET /roles`. The server lists module roles only for
 * the modules that are effective, so a role for a switched-off feature is
 * never offered; this layer only maps the row.
 */
const toRole = (row: RoleApiRow): RoleOption => ({
  code: row.code,
  module: row.module ?? null,
  labelId: row.label_id,
  assignable: Boolean(row.assignable),
  isModuleRole: Boolean(row.is_module_role),
});

export const fetchRoles = async (signal?: AbortSignal): Promise<readonly RoleOption[]> => {
  const response = await api.get<{ data: readonly RoleApiRow[] }>(
    API_PATHS.ROLES,
    ubConfig({ signal })
  );
  return response.data.data.map(toRole);
};
