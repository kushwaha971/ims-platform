import axios from 'axios';

import { API_PATHS } from 'src/api/APIPaths';
import { absoluteApiUrl } from 'src/api/apiUrl';
import { api, ubConfig } from 'src/api/AxiosInstances';

import type { ExportJob, ExportStatus, ListExportResult } from '../types/import.types';

/**
 * IMP-02 — `?format=csv` on a list, and the stored file of a big one.
 *
 * ── Why a fetch and not an anchor ─────────────────────────────────────────
 * The statement's export is an anchor because it can never be anything but a
 * file. A LIST export is a file up to 5,000 rows and a 202 with a job above
 * them (FR-6), and a navigation that meets a 202 shows the merchant a page of
 * JSON. So the list export is fetched as a blob: a file is saved from it, a
 * 202 is read as the job it is. Five thousand rows is about a megabyte.
 */

interface ExportJobWire {
  readonly id: string;
  readonly resource: string | null;
  readonly status: ExportStatus;
  readonly row_count: number | null;
  readonly expires_at: string | null;
  readonly download_path: string | null;
}

const toExportJob = (wire: ExportJobWire): ExportJob => ({
  id: wire.id,
  resource: wire.resource,
  status: wire.status,
  rowCount: wire.row_count,
  expiresAt: wire.expires_at,
  downloadPath: wire.download_path,
});

const FILENAME = /filename="?([^";]+)"?/i;

/**
 * A Blob's text. `Blob.text()` is in every browser this product supports; the
 * FileReader arm is for the environments that predate it (jsdom among them).
 */
const blobText = (blob: Blob): Promise<string> =>
  typeof blob.text === 'function'
    ? blob.text()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
        reader.readAsText(blob);
      });

/**
 * An error answered to a `responseType: 'blob'` request arrives as a Blob, and
 * the error normaliser reads `response.data.error` — so the envelope is parsed
 * back into JSON here, before anything above the service sees the error.
 */
const unwrapBlobError = async (error: unknown): Promise<never> => {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await blobText(error.response.data)) as unknown;
    } catch {
      // Not JSON — leave it; the normaliser falls back to the status code.
    }
  }
  throw error;
};

/**
 * `GET {listPath}&format=csv` — a file, or a queued job (FR-6).
 *
 * `suppressErrorSnackbar`, because the error is still a Blob when the global
 * channel would read it; the thunk re-raises it once it is JSON, and the
 * caller hands it to the snackbar with the server's own sentence.
 *
 * `Accept` names the CSV. The shared client sends `application/json`, and
 * DRF picks the renderer from `?format=csv` and THEN checks it against
 * Accept — so every export answered 406 in a browser while every API test,
 * whose client sends no Accept, passed. The statement's CSV never met this
 * because it downloads through an anchor, which accepts anything. JSON stays
 * acceptable for the 202 and for refusals, which the server renders as JSON.
 */
export const EXPORT_ACCEPT = 'text/csv, application/json';

export const requestListExport = async (listPath: string): Promise<ListExportResult> => {
  const separator = listPath.includes('?') ? '&' : '?';
  try {
    const response = await api.get<Blob>(
      `${listPath}${separator}format=csv`,
      ubConfig({
        responseType: 'blob',
        suppressErrorSnackbar: true,
        timeout: 120_000,
        headers: { Accept: EXPORT_ACCEPT },
      })
    );
    if (response.status === 202) {
      const body = JSON.parse(await blobText(response.data)) as {
        data: { export_id: string; row_count: number };
      };
      return { kind: 'queued', exportId: body.data.export_id, rowCount: body.data.row_count };
    }
    const disposition = String(response.headers['content-disposition'] ?? '');
    const filename = FILENAME.exec(disposition)?.[1] ?? 'yourkhata-export.csv';
    return { kind: 'file', blob: response.data, filename };
  } catch (error) {
    return unwrapBlobError(error);
  }
};

/** GET /reports/exports/{id} — FR-14's poll. */
export const getExport = async (id: string): Promise<ExportJob> => {
  const response = await api.get<{ data: ExportJobWire }>(
    API_PATHS.REPORT_EXPORT(id),
    ubConfig({ suppressErrorSnackbar: true })
  );
  return toExportJob(response.data.data);
};

/** The stored file — an anchor, so the browser streams it (FR-8). */
export const exportDownloadUrl = (id: string): string =>
  absoluteApiUrl(API_PATHS.REPORT_EXPORT_DOWNLOAD(id));
