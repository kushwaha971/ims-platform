import type {
  ItcFilter,
  RegisterPartyFilter,
  RegisterStatusFilter,
  SalesKindFilter,
  TaxPeriodPreset,
} from '../types/taxReports.types';

/**
 * RPT-03 / RPT-04 / RPT-07 constants in a module that imports nothing at
 * runtime (types only): the lazily injected slice reads its defaults from
 * here, and anything a slice imports ships with it.
 */

/** RPT-03 FR-7 — the GST periods: month, quarter, financial year, custom. */
export const TAX_PERIOD_PRESETS: readonly TaxPeriodPreset[] = [
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisFy',
  'custom',
];
/** RPT-03 FR-7 — a register opens on the current month. */
export const REGISTER_DEFAULT_PRESET: TaxPeriodPreset = 'thisMonth';
/**
 * UAT D10 — the GST summary opens on the CURRENT month, like the registers.
 * RPT-07 §6 said the last completed month (the one being filed); in UAT that
 * opened a busy shop's GST screen on a period without today's bills, and a new
 * shop's on an empty one. The month being filed is one tap away ("Last month").
 * A data-dependent default (this month if it has documents) was rejected: it
 * costs a request before the first paint and makes the screen open on
 * different periods on different days for no reason the merchant can see.
 * CR-2026-09-29-UAT-D10.
 */
export const GST_DEFAULT_PRESET: TaxPeriodPreset = 'thisMonth';

/** RPT-03 NFR — "server pagination 100 rows". */
export const REGISTER_PAGE_SIZE = 100;

export const REGISTER_STATUS_FILTERS: readonly RegisterStatusFilter[] = ['all', 'unpaid', 'paid'];
export const REGISTER_PARTY_FILTERS: readonly RegisterPartyFilter[] = ['all', 'b2b', 'b2c'];
export const SALES_KIND_FILTERS: readonly SalesKindFilter[] = ['all', 'invoice', 'credit_note'];
export const ITC_FILTERS: readonly ItcFilter[] = ['all', 'eligible', 'blocked'];

/** The server statuses each status chip asks for (RPT-03 FR-6's multi-status). */
export const SALES_STATUSES_FOR: Readonly<Record<RegisterStatusFilter, string>> = {
  all: '',
  unpaid: 'issued,partially_paid,overdue',
  paid: 'paid,applied',
};
export const PURCHASE_STATUSES_FOR: Readonly<Record<RegisterStatusFilter, string>> = {
  all: '',
  unpaid: 'recorded,partially_paid,overdue',
  paid: 'paid',
};

/** The financial year starts in April (canon §0.10). */
export const FY_START_MONTH = 4;
