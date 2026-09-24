import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { ExportJob, ListExportOutcome } from '../types/import.types';

/**
 * IMP-02 — the export button's two requests. Services imported lazily for the
 * reason `importThunk.ts` gives: the registry is in the shell, the export
 * button is on two list screens, and neither should pay for the service until
 * a merchant presses it.
 */
const service = () => import('../api/exportService');
const download = () => import('../api/fileDownload');

/**
 * QUERY. `?format=csv` on the list the merchant is looking at — a file, or a
 * queued job for more than 5,000 rows (FR-6). A read: the server writes only
 * the export's own bookkeeping, never business data (BR-2).
 *
 * A file is saved HERE, so the Blob never enters an action: the fulfilled
 * payload carries its name, and the store's serializable check stays on.
 */
export const exportListCsv = createAsyncThunk<
  ListExportOutcome,
  { readonly listPath: string },
  { rejectValue: ApiErrorShape }
>('listExport/exportListCsv', async ({ listPath }, { rejectWithValue }) => {
  try {
    const result = await (await service()).requestListExport(listPath);
    if (result.kind === 'queued') return result;
    (await download()).saveBlob(result.blob, result.filename);
    return { kind: 'saved', filename: result.filename };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'exports.error'));
  }
});

/** QUERY. One stored export — the async path's poll (FR-14) and its page. */
export const fetchExportJob = createAsyncThunk<ExportJob, string, { rejectValue: ApiErrorShape }>(
  'listExport/fetchExportJob',
  async (id, { rejectWithValue }) => {
    try {
      return await (await service()).getExport(id);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'exports.error'));
    }
  }
);
