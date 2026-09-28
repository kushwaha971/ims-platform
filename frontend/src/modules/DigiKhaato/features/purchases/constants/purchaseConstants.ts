import type { PurchaseBillTab } from '../types/purchase.types';

/**
 * Purchases constants in a module that imports NOTHING at runtime — a lazily
 * injected slice reads its defaults from here, and anything a slice imports
 * ships with it (the statement's 2.2 KB lesson, repeated for sales).
 */

export type PurchaseBillPreset = 'thisMonth' | 'lastMonth' | 'thisFy' | 'custom';

/** PUR-03 FR-4 — This month / Last month / FY / Custom; the current FY is the default. */
export const PURCHASE_BILL_PRESETS: readonly PurchaseBillPreset[] = [
  'thisMonth',
  'lastMonth',
  'thisFy',
  'custom',
];
export const DEFAULT_PURCHASE_BILL_PRESET: PurchaseBillPreset = 'thisFy';

export const PURCHASE_BILL_TABS_ORDER: readonly PurchaseBillTab[] = [
  'all',
  'unpaid',
  'overdue',
  'paid',
  'draft',
  'void',
];

/** PUR-03 §5 — 25 rows a page. */
export const PURCHASE_BILL_PAGE_SIZE = 25;
export const PURCHASE_BILL_SEARCH_DEBOUNCE_MS = 300;

/** PUR-01 FR-8 — the draft is PATCHed 10 s after the last change while dirty. */
export const PURCHASE_AUTOSAVE_MS = 10_000;

/** PUR-01 §10 — 1 to 200 lines. */
export const PURCHASE_MAX_LINES = 200;
export const SUPPLIER_INVOICE_MAX = 48;
