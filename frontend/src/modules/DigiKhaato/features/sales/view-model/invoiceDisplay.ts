import type { UbStatusBadgeTone } from 'src/design-system/UbStatusBadge/UbStatusBadge';
import { isValidWireDate } from 'src/utils/dates';

import { resolveExpensePreset } from '../../expenses/view-model/expenseDisplay';
import { resolvePreset } from '../../ledger/view-model/statementDisplay';
import {
  DEFAULT_INVOICE_PRESET,
  INVOICE_PRESETS,
  INVOICE_TABS_ORDER,
  UTGST_STATE_CODES,
  type InvoicePreset,
} from '../constants/salesConstants';

import type {
  GstType,
  InvoiceTab,
  SalesDocument,
  SalesKind,
  SalesStatus,
} from '../types/sales.types';

/** SAL-08 §7 — the badge tones: draft grey, issued blue, part-paid amber, paid green, overdue red. */
export const STATUS_TONE: Record<SalesStatus, UbStatusBadgeTone> = {
  draft: 'neutral',
  issued: 'info',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'error',
  void: 'neutral',
};

/** SAL-02 §8 / BR-12 — the document title a merchant's registration gives it. */
export const documentTitleId = (kind: SalesKind, gstType: GstType): string => {
  if (kind === 'bill_of_supply') return 'sales.title.billOfSupply';
  return gstType === 'regular' ? 'sales.title.taxInvoice' : 'sales.title.invoice';
};

/** BR-11 — "UTGST" in the five UTs without a legislature, intra-state only. */
export const sgstLabelId = (placeOfSupply: string, interState: boolean): string =>
  !interState && UTGST_STATE_CODES.includes(placeOfSupply) ? 'sales.tax.utgst' : 'sales.tax.sgst';

export const showsTax = (doc: Pick<SalesDocument, 'kind' | 'supplier'>): boolean =>
  doc.kind === 'invoice' && doc.supplier.gstType === 'regular';

export const partyLabel = (doc: {
  readonly party: { readonly name: string } | null;
  readonly walkInName: string | null;
}): string | null => doc.party?.name ?? doc.walkInName ?? null;

/** "₹1,772 · Paid (Cash)" helpers stay in components; these are pure decisions. */
export const isEditable = (status: SalesStatus): boolean => status === 'draft';

// ── The list's filters in the address bar (PTY-05's lesson) ─────────────────

export interface InvoiceListFilters {
  readonly preset: InvoicePreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly tab: InvoiceTab;
  readonly q: string;
  readonly page: number;
}

export const resolveInvoicePreset = (
  preset: InvoicePreset,
  today: string
): { readonly dateFrom: string; readonly dateTo: string } | null => {
  if (preset === 'lastFy') {
    const range = resolvePreset('lastFy', today);
    return { dateFrom: range.dateFrom ?? today, dateTo: range.dateTo ?? today };
  }
  return resolveExpensePreset(preset, today);
};

export const invoiceFiltersFromQuery = (
  query: URLSearchParams,
  today: string
): InvoiceListFilters => {
  const rawPreset = query.get('period') as InvoicePreset | null;
  const from = query.get('from');
  const to = query.get('to');
  const hasDates = isValidWireDate(from) && isValidWireDate(to);
  const preset: InvoicePreset =
    rawPreset && INVOICE_PRESETS.includes(rawPreset)
      ? rawPreset
      : hasDates
        ? 'custom'
        : DEFAULT_INVOICE_PRESET;
  const resolved = resolveInvoicePreset(preset, today);
  const tab = query.get('tab') as InvoiceTab | null;
  const page = Number(query.get('page') ?? '1');
  return {
    preset,
    dateFrom: resolved?.dateFrom ?? (hasDates ? (from as string) : today),
    dateTo: resolved?.dateTo ?? (hasDates ? (to as string) : today),
    tab: tab && INVOICE_TABS_ORDER.includes(tab) ? tab : 'all',
    q: query.get('q') ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
};

/** Only what differs from the defaults (FR-3: tab and dates live in the URL). */
export const invoiceQueryFromFilters = (filters: InvoiceListFilters): string => {
  const search = new URLSearchParams();
  if (filters.preset !== DEFAULT_INVOICE_PRESET) search.set('period', filters.preset);
  if (filters.preset === 'custom') {
    search.set('from', filters.dateFrom);
    search.set('to', filters.dateTo);
  }
  if (filters.tab !== 'all') search.set('tab', filters.tab);
  if (filters.q.trim()) search.set('q', filters.q.trim());
  if (filters.page > 1) search.set('page', String(filters.page));
  return search.toString();
};

export const isNarrowed = (filters: InvoiceListFilters): boolean =>
  filters.tab !== 'all' || !!filters.q.trim();

/** SAL-08 §8 — days past due for the "Overdue 3 d" caption (same-day accuracy, BR-2). */
export const daysOverdue = (dueOn: string | null, today: string): number => {
  if (!dueOn || dueOn >= today) return 0;
  const ms = new Date(`${today}T00:00:00Z`).getTime() - new Date(`${dueOn}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
};

/** SAL-03 BR-3 / FR-6 — the WhatsApp text, filled from the document (EN or HI). */
export const whatsappUrl = (mobile: string | null, text: string): string => {
  const digits = (mobile ?? '').replace(/\D/g, '').slice(-10);
  const target = digits.length === 10 ? `91${digits}` : '';
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
};
