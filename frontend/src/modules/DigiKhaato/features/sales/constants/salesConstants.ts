import type { InvoiceTab } from '../types/sales.types';

/**
 * Sales constants in a module that imports NOTHING at runtime — a lazily
 * injected slice reads its defaults from here, and anything a slice imports
 * ships with it (the statement's 2.2 KB lesson).
 */

export type InvoicePreset =
  'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'thisFy' | 'lastFy' | 'custom';

/** SAL-08 FR-3 / BR-4 — the date chips; "This FY" is the default. */
export const INVOICE_PRESETS: readonly InvoicePreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'thisMonth',
  'thisFy',
  'lastFy',
  'custom',
];
export const DEFAULT_INVOICE_PRESET: InvoicePreset = 'thisFy';

export const INVOICE_TABS_ORDER: readonly InvoiceTab[] = [
  'all',
  'unpaid',
  'overdue',
  'paid',
  'draft',
  'void',
];

export const INVOICE_PAGE_SIZE = 25;
export const INVOICE_SEARCH_DEBOUNCE_MS = 300;

/** SAL-06 FR-1 / FR-2 — local copy on every change (500 ms), server PATCH while dirty (3 s). */
export const LOCAL_AUTOSAVE_MS = 500;
export const SERVER_AUTOSAVE_MS = 3000;

/** BR-11 — intra-state in these UTs prints "UTGST" for the stored `sgst` column. */
export const UTGST_STATE_CODES: readonly string[] = ['04', '26', '31', '35', '38'];

/** SAL-03 FR-11 — the thermal receipt's line budget. */
export const THERMAL_LINE_CHARS = 42;
export const THERMAL_NAME_CHARS = 28;
