import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatQuantity } from 'src/utils/quantity';
import { formatPhoneForDisplay } from 'src/utils/share';

import { LIVE_STATUSES } from '../constants/importKinds';

import type { ImportPreviewColumn } from '../constants/importKinds';
import type { ImportJob, ImportProgress, ImportStatus } from '../types/import.types';

/**
 * IMP-01 — how a job reads on screen. Pure functions returning message ids and
 * formatted strings, so every rule here is tested without rendering anything.
 */

export { pollDelay } from './pollDelay';

export const isLive = (status: ImportStatus): boolean => LIVE_STATUSES.has(status);

/**
 * The wizard's three steps (IMP-01 §7): choose what, upload, review & import.
 * A job exists from the upload on, so any job is step 3; no kind is step 1.
 */
export const wizardStep = (job: ImportJob | null, kind: string | null): 1 | 2 | 3 => {
  if (job) return 3;
  return kind ? 2 : 1;
};

/**
 * FR-6 / §8 — why Import is disabled, stated beneath it (touch has no hover).
 * `null` means it is enabled. The server's `canCommit` decides; this only
 * chooses the sentence, in the order a merchant can act on it.
 */
export const commitBlockReason = (
  job: ImportJob
): { readonly id: string; readonly values?: Record<string, number> } | null => {
  if (job.canCommit) return null;
  if (job.errorRows > 0)
    return { id: 'imports.review.blocked.errors', values: { count: job.errorRows } };
  if (job.validRows === 0) return { id: 'imports.review.blocked.empty' };
  return { id: 'imports.review.blocked.permission' };
};

/** A percentage for `UbProgress`, or null when the total is not known yet. */
export const progressPercent = (progress: ImportProgress | null): number | null => {
  if (!progress?.total) return null;
  return Math.min(100, Math.round((progress.done / progress.total) * 100));
};

type Cell = string | number | boolean | null | undefined | readonly string[];

/**
 * AC-3 — a preview cell exactly as the product will show the saved value:
 * money en-IN with ₹, dates dd/mm/yyyy, lists joined. A column shifted by one
 * shows up as "₹9,87,65,43,210.00" under Opening balance, at a glance.
 */
export const previewCell = (
  value: Cell,
  format: ImportPreviewColumn['format'],
  labels: {
    readonly yes: string;
    readonly no: string;
    /** A coded choice (`to_receive`) in the merchant's words. */
    readonly choice?: (value: string) => string;
  }
): string => {
  if (value === null || value === undefined || value === '') return '—';
  switch (format) {
    case 'money':
      return formatInr(String(value));
    case 'qty':
      return formatQuantity(String(value));
    case 'date':
      return formatBusinessDate(String(value));
    case 'bool':
      return value ? labels.yes : labels.no;
    case 'list':
      return Array.isArray(value) && value.length ? value.join(', ') : '—';
    case 'mobile':
      return formatPhoneForDisplay(String(value));
    case 'label':
      return labels.choice?.(String(value)) ?? String(value);
    default:
      return String(value);
  }
};

/** The completion card's money fields, which are formatted as rupees. */
const MONEY_SUMMARY_FIELDS = new Set(['opening_receivable', 'opening_payable', 'stock_value']);

export const summaryValue = (field: string, value: string | number | undefined): string => {
  if (value === undefined || value === null) return '—';
  return MONEY_SUMMARY_FIELDS.has(field) ? formatInr(String(value)) : String(value);
};

/** `12.4 KB` — the uploaded file's size on its card. */
export const fileSizeLabel = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
