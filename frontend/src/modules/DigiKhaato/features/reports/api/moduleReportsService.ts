import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

import type { ServerModuleReport } from '../reportsRegistry';

/** A10 — `GET /reports`: the module reports this reader may open (contracts §1.9). */
interface ModuleReportsWire {
  readonly data: readonly {
    readonly key: string;
    readonly module: string;
    readonly label_id: string;
    readonly permission: string;
    readonly has_csv: boolean;
  }[];
}

export const listModuleReports = async (
  signal?: AbortSignal
): Promise<readonly ServerModuleReport[]> => {
  const response = await api.get<ModuleReportsWire>(API_PATHS.REPORTS, ubConfig({ signal }));
  return response.data.data.map((row) => ({
    key: row.key,
    module: row.module,
    labelId: row.label_id,
    permission: row.permission,
    hasCsv: row.has_csv,
  }));
};
