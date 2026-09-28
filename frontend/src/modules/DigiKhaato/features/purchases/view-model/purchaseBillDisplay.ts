import type { UbStatusBadgeTone } from 'src/design-system/UbStatusBadge/UbStatusBadge';
import { isValidWireDate } from 'src/utils/dates';

import { resolveExpensePreset } from '../../expenses/view-model/expenseDisplay';
import {
  DEFAULT_PURCHASE_BILL_PRESET,
  PURCHASE_BILL_PRESETS,
  PURCHASE_BILL_TABS_ORDER,
  type PurchaseBillPreset,
} from '../constants/purchaseConstants';

import type { PurchaseBill, PurchaseBillStatus, PurchaseBillTab } from '../types/purchase.types';

/**
 * PUR-03 §7 — the badge tones: draft neutral, recorded info, part-paid
 * warning, overdue danger, paid success, void muted. The design system has no
 * separate "muted" tone; `neutral` is what the sales list uses for void too.
 */
export const PURCHASE_STATUS_TONE: Record<PurchaseBillStatus, UbStatusBadgeTone> = {
  draft: 'neutral',
  recorded: 'info',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'error',
  void: 'neutral',
};

export const supplierName = (bill: Pick<PurchaseBill, 'party' | 'partySnapshot'>): string =>
  bill.partySnapshot?.name || bill.party?.name || '';

// ── The list's filters in the address bar (PTY-05's lesson) ─────────────────

export interface PurchaseBillListFilters {
  readonly preset: PurchaseBillPreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly tab: PurchaseBillTab;
  readonly q: string;
  readonly page: number;
}

export const resolvePurchasePreset = (
  preset: PurchaseBillPreset,
  today: string
): { readonly dateFrom: string; readonly dateTo: string } | null =>
  resolveExpensePreset(preset, today);

export const purchaseFiltersFromQuery = (
  query: URLSearchParams,
  today: string
): PurchaseBillListFilters => {
  const rawPreset = query.get('period') as PurchaseBillPreset | null;
  const from = query.get('from');
  const to = query.get('to');
  const hasDates = isValidWireDate(from) && isValidWireDate(to);
  const preset: PurchaseBillPreset =
    rawPreset && PURCHASE_BILL_PRESETS.includes(rawPreset)
      ? rawPreset
      : hasDates
        ? 'custom'
        : DEFAULT_PURCHASE_BILL_PRESET;
  const resolved = resolvePurchasePreset(preset, today);
  const tab = query.get('tab') as PurchaseBillTab | null;
  const page = Number(query.get('page') ?? '1');
  return {
    preset,
    dateFrom: resolved?.dateFrom ?? (hasDates ? (from as string) : today),
    dateTo: resolved?.dateTo ?? (hasDates ? (to as string) : today),
    tab: tab && PURCHASE_BILL_TABS_ORDER.includes(tab) ? tab : 'all',
    q: query.get('q') ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
};

/** Only what differs from the defaults (FR-4: tab and range live in the URL). */
export const purchaseQueryFromFilters = (filters: PurchaseBillListFilters): string => {
  const search = new URLSearchParams();
  if (filters.preset !== DEFAULT_PURCHASE_BILL_PRESET) search.set('period', filters.preset);
  if (filters.preset === 'custom') {
    search.set('from', filters.dateFrom);
    search.set('to', filters.dateTo);
  }
  if (filters.tab !== 'all') search.set('tab', filters.tab);
  if (filters.q.trim()) search.set('q', filters.q.trim());
  if (filters.page > 1) search.set('page', String(filters.page));
  return search.toString();
};

export const isPurchaseListNarrowed = (filters: PurchaseBillListFilters): boolean =>
  filters.tab !== 'all' || !!filters.q.trim();

/** FR-5 — "3 days late", computed on the row (BR-2: same-day accuracy). */
export const daysLate = (dueOn: string | null, today: string): number => {
  if (!dueOn || dueOn >= today) return 0;
  const ms = new Date(`${today}T00:00:00Z`).getTime() - new Date(`${dueOn}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
};

/**
 * PUR-04 FR-3 — what the void will do, computed from the bill before the
 * reason is typed: each stock line with a SIGNED quantity, the khata effect in
 * the supplier's terms, and any payment that becomes an advance.
 *
 * Deliberately no "Average cost unchanged" line: under CR-2026-09-24-INV-A the
 * void removes the value the bill blended into the average, so that sentence
 * (FR-4) would be false.
 */
export interface VoidConsequences {
  readonly stock: readonly { readonly name: string; readonly qty: string; readonly unit: string }[];
  readonly khata: string | null;
  readonly advance: string | null;
}

export const voidConsequences = (bill: PurchaseBill): VoidConsequences => ({
  stock: bill.lines
    .filter((line) => line.trackStock)
    .map((line) => ({ name: line.description, qty: `−${trimQty(line.qty)}`, unit: line.unitCode })),
  khata: bill.grandTotal !== '0.00' ? bill.grandTotal : null,
  advance: bill.amountPaid !== '0.00' ? bill.amountPaid : null,
});

/** "20.000" → "20", "2.500" → "2.5" — a quantity as a person writes it. */
export const trimQty = (qty: string): string =>
  qty.includes('.') ? qty.replace(/0+$/, '').replace(/\.$/, '') : qty;

/** The `insufficient_stock` 409's lines, as "Rice would go to −8 NOS". */
export interface ShortLine {
  readonly name: string;
  readonly after: string;
  readonly unit: string;
}

export const shortLines = (details: Readonly<Record<string, unknown>> | undefined): ShortLine[] => {
  const lines = (details?.lines ?? []) as readonly Record<string, unknown>[];
  return lines.map((line) => {
    const after = Number(line.available ?? 0) - Number(line.requested ?? 0);
    return {
      name: String(line.item_name ?? ''),
      after: trimQty(after.toFixed(3)).replace('-', '−'),
      unit: String(line.unit_code ?? ''),
    };
  });
};
