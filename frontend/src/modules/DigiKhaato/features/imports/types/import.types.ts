/**
 * IMP-01 / IMP-02 — the import job and the list export, as the client holds
 * them. Money stays a STRING (R-TS-7); the server's own figures are never
 * recomputed here.
 */

/** The kinds this client has a wizard for (the server's registry is the authority). */
export type ImportKind = 'parties' | 'items';

/** Canon §0.7's import-job set, verbatim. */
export type ImportStatus =
  'uploaded' | 'validating' | 'ready' | 'importing' | 'completed' | 'failed' | 'cancelled';

/** One problem with one cell: IMP-01 §17.8.0's error model. */
export interface ImportRowProblem {
  readonly row: number;
  readonly column: string;
  readonly value: string;
  readonly code: string;
  readonly message: string;
}

/** A job-level failure: the file could not be read, or the commit rolled back. */
export interface ImportFailure {
  readonly code: string;
  readonly message: string;
  readonly requestId: string | null;
  readonly row: number | null;
  readonly columns: readonly string[];
  /** `commit` — the merchant may press Import again (AC-4). */
  readonly at: string | null;
}

/** A preview row exactly as the importer understood it (AC-3). */
export type ImportPreviewRow = Readonly<
  Record<string, string | number | boolean | null | readonly string[]>
> & {
  readonly row: number;
  readonly valid: boolean;
};

export interface ImportProgress {
  readonly done: number;
  readonly total: number | null;
}

export interface ImportJob {
  readonly id: string;
  readonly kind: string;
  readonly status: ImportStatus;
  readonly totalRows: number;
  readonly validRows: number;
  readonly errorRows: number;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly summary: Readonly<Record<string, string | number>> | null;
  readonly failure: ImportFailure | null;
  readonly errors: readonly ImportRowProblem[];
  readonly errorsTotal: number;
  readonly errorsTruncated: boolean;
  readonly warnings: readonly ImportRowProblem[];
  readonly previewRows: readonly ImportPreviewRow[];
  readonly totals: Readonly<Record<string, string | number | readonly string[]>>;
  readonly progress: ImportProgress | null;
  readonly hasErrorFile: boolean;
  /** Decided by the server: an accountant sees it false whatever the counts. */
  readonly canCommit: boolean;
  readonly summaryFields: readonly string[];
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

/** What `GET /parties?format=csv` and friends answered (IMP-02 FR-6). */
export type ListExportResult =
  | { readonly kind: 'file'; readonly blob: Blob; readonly filename: string }
  | { readonly kind: 'queued'; readonly exportId: string; readonly rowCount: number };

/**
 * The same, as the thunk reports it: the file has already been handed to the
 * browser, so the store sees its NAME and never the Blob (the serializable
 * check stays on — `store.ts`).
 */
export type ListExportOutcome =
  | { readonly kind: 'saved'; readonly filename: string }
  | { readonly kind: 'queued'; readonly exportId: string; readonly rowCount: number };

export type ExportStatus = 'queued' | 'running' | 'ready' | 'failed' | 'expired';

export interface ExportJob {
  readonly id: string;
  readonly resource: string | null;
  readonly status: ExportStatus;
  readonly rowCount: number | null;
  readonly expiresAt: string | null;
  readonly downloadPath: string | null;
}
