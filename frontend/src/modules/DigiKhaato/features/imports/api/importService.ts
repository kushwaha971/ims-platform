import { API_PATHS } from 'src/api/APIPaths';
import { absoluteApiUrl } from 'src/api/apiUrl';
import { api, ubConfig } from 'src/api/AxiosInstances';

import type {
  ImportFailure,
  ImportJob,
  ImportPreviewRow,
  ImportRowProblem,
  ImportStatus,
} from '../types/import.types';

/**
 * Part 19 §19.3.4 — one async function per endpoint of `/imports` (IMP-01 §14),
 * owning the snake_case ⇄ camelCase mapping. No React, no Redux, no `Ub*`.
 */

// ── Wire shapes ──────────────────────────────────────────────────────────────

interface ImportFailureWire {
  readonly code: string;
  readonly message: string;
  readonly request_id?: string;
  readonly row?: number;
  readonly columns?: readonly string[];
  readonly at?: string;
}

export interface ImportJobWire {
  readonly id: string;
  readonly kind: string;
  readonly status: ImportStatus;
  readonly total_rows: number;
  readonly valid_rows: number;
  readonly error_rows: number;
  readonly file: { readonly name: string; readonly size_bytes: number };
  readonly summary: Readonly<Record<string, string | number>> | null;
  readonly error: ImportFailureWire | null;
  readonly errors?: readonly ImportRowProblem[];
  readonly errors_total?: number;
  readonly errors_truncated?: boolean;
  readonly warnings?: readonly ImportRowProblem[];
  readonly preview_rows?: readonly ImportPreviewRow[];
  readonly totals?: Readonly<Record<string, string | number | readonly string[]>>;
  readonly progress?: { readonly done: number; readonly total: number | null } | null;
  readonly has_error_file?: boolean;
  readonly can_commit?: boolean;
  readonly summary_fields?: readonly string[];
  readonly created_at: string;
  readonly finished_at: string | null;
}

const toFailure = (wire: ImportFailureWire | null): ImportFailure | null =>
  wire
    ? {
        code: wire.code,
        message: wire.message,
        requestId: wire.request_id ?? null,
        row: wire.row ?? null,
        columns: wire.columns ?? [],
        at: wire.at ?? null,
      }
    : null;

/**
 * Error rows, warnings and preview rows keep the server's keys: they are
 * addressed by COLUMN NAME — the template's own header, which is also what the
 * merchant sees in their sheet — so camel-casing them would rename the very
 * thing the message is pointing at.
 */
export const toImportJob = (wire: ImportJobWire): ImportJob => ({
  id: wire.id,
  kind: wire.kind,
  status: wire.status,
  totalRows: wire.total_rows,
  validRows: wire.valid_rows,
  errorRows: wire.error_rows,
  fileName: wire.file.name,
  fileSizeBytes: wire.file.size_bytes,
  summary: wire.summary,
  failure: toFailure(wire.error),
  errors: wire.errors ?? [],
  errorsTotal: wire.errors_total ?? wire.errors?.length ?? 0,
  errorsTruncated: wire.errors_truncated ?? false,
  warnings: wire.warnings ?? [],
  previewRows: wire.preview_rows ?? [],
  totals: wire.totals ?? {},
  progress: wire.progress ?? null,
  hasErrorFile: wire.has_error_file ?? false,
  canCommit: wire.can_commit ?? false,
  summaryFields: wire.summary_fields ?? [],
  createdAt: wire.created_at,
  finishedAt: wire.finished_at,
});

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * POST /imports (multipart) — FR-3. `onProgress` gets 0–100 from the XHR
 * upload event (§5); the request never waits for the file to be read.
 * `Content-Type` is left for the browser to finish with the boundary.
 */
export const uploadImport = async (
  kind: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<ImportJob> => {
  const body = new FormData();
  body.append('kind', kind);
  body.append('file', file);
  const response = await api.post<{ data: ImportJobWire }>(
    API_PATHS.IMPORTS,
    body,
    ubConfig({
      headers: { 'Content-Type': 'multipart/form-data' },
      // A 5 MB file on a slow connection outlives the default 30 s budget.
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
      },
    })
  );
  return toImportJob(response.data.data);
};

/**
 * GET /imports/{id} — FR-8, what the wizard polls. A poll that fails is not
 * worth a toast every two seconds: the wizard shows it in place and polls on.
 */
export const getImportJob = async (id: string, signal?: AbortSignal): Promise<ImportJob> => {
  const response = await api.get<{ data: ImportJobWire }>(
    API_PATHS.IMPORT(id),
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toImportJob(response.data.data);
};

/** POST /imports/{id}/commit — 202 (FR-6), with the key the press minted. */
export const commitImport = async (id: string, idempotencyKey: string): Promise<ImportJob> => {
  const response = await api.post<{ data: ImportJobWire }>(
    API_PATHS.IMPORT_COMMIT(id),
    {},
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toImportJob(response.data.data);
};

/** POST /imports/{id}/cancel — FR-7. */
export const cancelImport = async (id: string): Promise<ImportJob> => {
  const response = await api.post<{ data: ImportJobWire }>(API_PATHS.IMPORT_CANCEL(id), {});
  return toImportJob(response.data.data);
};

/**
 * The two downloads are ANCHORS, not fetches: the browser saves the file the
 * server streams, with its own name, and the session cookie carries the
 * request. Absolute, because a relative path would resolve against the
 * frontend and save the page's HTML (see `absoluteApiUrl`).
 */
export const importTemplateUrl = (kind: string): string =>
  absoluteApiUrl(API_PATHS.IMPORT_TEMPLATE(kind));

export const importErrorsUrl = (id: string): string =>
  absoluteApiUrl(API_PATHS.IMPORT_ERRORS_CSV(id));
