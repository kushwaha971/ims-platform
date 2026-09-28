import { IMPORT_ACCESS, type ImportAccess } from './importAccess';

import type { ImportKind, ImportStatus } from '../types/import.types';
import type { PollStep } from '../view-model/pollDelay';

export { isImportKind } from './importAccess';

/**
 * IMP-01 — what the wizard needs to know about each import kind: who may
 * import it (`importAccess.ts`, which the list headers read on their own) and
 * how its preview is drawn. Imported by the wizard route only.
 */
export interface ImportKindConfig extends ImportAccess {
  readonly kind: ImportKind;
  /** How a preview cell is drawn: the importer's own keys, in template order. */
  readonly previewColumns: readonly ImportPreviewColumn[];
}

export interface ImportPreviewColumn {
  readonly key: string;
  readonly format: 'text' | 'mobile' | 'label' | 'money' | 'qty' | 'date' | 'bool' | 'list';
}

export const IMPORT_KINDS: Readonly<Record<ImportKind, ImportKindConfig>> = {
  parties: {
    ...IMPORT_ACCESS.parties,
    kind: 'parties',
    previewColumns: [
      { key: 'name', format: 'text' },
      { key: 'mobile', format: 'mobile' },
      { key: 'type', format: 'label' },
      { key: 'opening_balance', format: 'money' },
      { key: 'opening_type', format: 'label' },
      { key: 'opening_date', format: 'date' },
      { key: 'state', format: 'text' },
      { key: 'tags', format: 'list' },
    ],
  },
  items: {
    ...IMPORT_ACCESS.items,
    kind: 'items',
    previewColumns: [
      { key: 'name', format: 'text' },
      { key: 'sku', format: 'text' },
      { key: 'category', format: 'text' },
      { key: 'unit', format: 'text' },
      { key: 'tax_code', format: 'text' },
      { key: 'selling_price', format: 'money' },
      { key: 'purchase_price', format: 'money' },
      { key: 'opening_stock_qty', format: 'qty' },
    ],
  },
};

export const IMPORT_KIND_ORDER: readonly ImportKind[] = ['parties', 'items'];

/** §17.8.0 — the framework's file limit, refused client-side with the server's words. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * What the picker offers. `text/csv` is what most systems say, Windows says
 * `application/vnd.ms-excel` for a .csv, and some phones say nothing at all —
 * which `UbFileUpload` lets through, because the server sniffs the bytes.
 */
export const IMPORT_ACCEPT = '.csv,text/csv,application/vnd.ms-excel,text/plain';

/** The statuses the wizard keeps polling through (FR-8). */
export const LIVE_STATUSES: ReadonlySet<ImportStatus> = new Set([
  'uploaded',
  'validating',
  'importing',
]);

/** FR-8 — every 2 s, backing off to 5 s after 30 s and to 15 s after 2 min. */
export const POLL_STEPS: readonly PollStep[] = [
  { afterMs: 0, everyMs: 2_000 },
  { afterMs: 30_000, everyMs: 5_000 },
  { afterMs: 120_000, everyMs: 15_000 },
];
