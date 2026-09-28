import { PAYMENT_MODES, type PaymentMode } from 'src/types/domain.types';
import { isValidWireDate } from 'src/utils/dates';
import {
  addMoney,
  compareMoney,
  isZeroAmount,
  subtractMoney,
  sumMoney,
  toDecimal,
  toMoneyString,
} from 'src/utils/money';

import { resolveExpensePreset } from '../../expenses/view-model/expenseDisplay';
import {
  DEFAULT_PAYMENT_PRESET,
  PAYMENT_PRESETS,
  type PaymentPreset,
} from '../constants/paymentConstants';

import type {
  AllocationRowForm,
  OpenDocument,
  Payment,
  PaymentFilters,
  PaymentLineForm,
  PaymentModeLine,
  PaymentTab,
} from '../types/payment.types';

/**
 * Pure helpers for the payments screens — no React, no Redux, so every money
 * rule here is a unit test away from being checked. All arithmetic goes
 * through `src/utils/money` (decimal.js), never `Number`.
 *
 * The SERVER is authoritative for every figure that is saved: FIFO here is a
 * preview of what `record_payment` will do, so the panel can show it before
 * the merchant presses Save (PAY-01 §14 `fifoPreview`).
 */

const clean = (value: string): string => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '0.00';
  try {
    return toMoneyString(toDecimal(trimmed));
  } catch {
    return '0.00';
  }
};

/** PAY-02 FR-2 — the payment's total is the sum of its lines. */
export const linesTotal = (lines: readonly Pick<PaymentLineForm, 'amount'>[]): string =>
  sumMoney(lines.map((line) => clean(line.amount)));

/** PAY-02 BR-2 — the largest share; a tie goes to the line listed first. */
type ModeAmount = { readonly mode: PaymentMode | ''; readonly amount: string };

export const primaryModeOf = (lines: readonly ModeAmount[]): PaymentMode | null => {
  let best: ModeAmount | null = null;
  for (const line of lines) {
    if (!line.mode) continue;
    if (!best || compareMoney(clean(line.amount), clean(best.amount)) > 0) best = line;
  }
  return best?.mode || null;
};

/** "Fill remaining ₹300" — what the last line needs for the lines to reach `target`. */
export const remainingFor = (
  lines: readonly Pick<PaymentLineForm, 'amount'>[],
  index: number,
  target: string
): string | null => {
  const others = sumMoney(lines.filter((_, i) => i !== index).map((l) => clean(l.amount)));
  const rest = subtractMoney(clean(target), others);
  // Nothing to fill when the line already holds exactly what is left.
  if (compareMoney(rest, clean(lines[index]?.amount ?? '')) === 0) return null;
  return compareMoney(rest, '0.00') > 0 ? rest : null;
};

/**
 * PAY-02 FR-4 — two lines of one mode are one line: amounts added, references
 * joined by ", " (Alternate C). Returns the lines unchanged when there is no
 * repeat.
 */
export const mergeDuplicateModes = (lines: readonly PaymentLineForm[]): PaymentLineForm[] => {
  const merged: PaymentLineForm[] = [];
  for (const line of lines) {
    const same = line.mode ? merged.find((m) => m.mode === line.mode) : undefined;
    if (!same) {
      merged.push({ ...line });
      continue;
    }
    same.amount = addMoney(clean(same.amount), clean(line.amount));
    same.reference = [same.reference.trim(), line.reference.trim()].filter(Boolean).join(', ');
    same.upiApp = same.upiApp || line.upiApp;
  }
  return merged;
};

export const hasDuplicateModes = (lines: readonly PaymentLineForm[]): boolean => {
  const modes = lines.map((l) => l.mode).filter(Boolean);
  return new Set(modes).size !== modes.length;
};

/** PAY-01 FR-5 — FIFO over the open bills in the order the server gave them. */
export const fifoPreview = (
  amount: string,
  documents: readonly Pick<OpenDocument, 'documentId' | 'amountDue'>[]
): { readonly allocations: Readonly<Record<string, string>>; readonly advance: string } => {
  let remaining = clean(amount);
  const allocations: Record<string, string> = {};
  for (const doc of documents) {
    if (compareMoney(remaining, '0.00') <= 0) break;
    const due = clean(doc.amountDue);
    if (compareMoney(due, '0.00') <= 0) continue;
    const take = compareMoney(remaining, due) < 0 ? remaining : due;
    allocations[doc.documentId] = take;
    remaining = subtractMoney(remaining, take);
  }
  return { allocations, advance: remaining };
};

/** The manual panel's footer: Σ allocated and what is left as advance. */
export const manualTotals = (
  amount: string,
  rows: readonly Pick<AllocationRowForm, 'amount'>[]
): { readonly allocated: string; readonly advance: string } => {
  const allocated = sumMoney(rows.map((r) => clean(r.amount)));
  return { allocated, advance: subtractMoney(clean(amount), allocated) };
};

/** Is a row's typed amount more than the bill can take ("Max ₹898")? */
export const exceedsDue = (row: Pick<AllocationRowForm, 'amount' | 'due'>): boolean =>
  compareMoney(clean(row.amount), clean(row.due)) > 0;

/** The allocation rows the panel edits, from the open bills (and a preset bill first). */
export const allocationRowsFor = (
  documents: readonly OpenDocument[],
  preset?: { readonly documentId: string; readonly amount: string }
): AllocationRowForm[] =>
  documents.map((doc) => ({
    documentType: doc.documentType,
    documentId: doc.documentId,
    number: doc.number,
    documentDate: doc.documentDate,
    due: doc.amountDue,
    amount:
      preset && preset.documentId === doc.documentId
        ? compareMoney(clean(preset.amount), clean(doc.amountDue)) > 0
          ? doc.amountDue
          : clean(preset.amount)
        : '',
  }));

/** FR-8 — a default amount: the bill's due, else the khata's receivable, else nothing. */
export const defaultAmount = (due?: string, receivable?: string): string => {
  if (due && compareMoney(clean(due), '0.00') > 0) return clean(due);
  if (receivable && compareMoney(clean(receivable), '0.00') > 0) return clean(receivable);
  return '';
};

// ── The list's filters, in the address bar ─────────────────────────────────

const TABS: readonly PaymentTab[] = ['all', 'in', 'out', 'void'];

export const paymentFiltersFromQuery = (query: URLSearchParams, today: string): PaymentFilters => {
  const rawPreset = query.get('period') as PaymentPreset | null;
  const from = query.get('from');
  const to = query.get('to');
  const hasDates = isValidWireDate(from) && isValidWireDate(to);
  const preset: PaymentPreset =
    rawPreset && PAYMENT_PRESETS.includes(rawPreset)
      ? rawPreset
      : hasDates
        ? 'custom'
        : DEFAULT_PAYMENT_PRESET;
  const resolved = resolveExpensePreset(preset, today);
  const tab = query.get('tab') as PaymentTab | null;
  const mode = query.get('mode') as PaymentMode | null;
  const page = Number(query.get('page') ?? '1');
  return {
    preset,
    dateFrom: resolved?.dateFrom ?? (hasDates ? (from as string) : today),
    dateTo: resolved?.dateTo ?? (hasDates ? (to as string) : today),
    tab: tab && TABS.includes(tab) ? tab : 'all',
    mode: mode && PAYMENT_MODES.includes(mode) ? mode : null,
    q: query.get('q') ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
};

export const paymentQueryFromFilters = (filters: PaymentFilters): string => {
  const search = new URLSearchParams();
  if (filters.preset !== DEFAULT_PAYMENT_PRESET) search.set('period', filters.preset);
  if (filters.preset === 'custom') {
    search.set('from', filters.dateFrom);
    search.set('to', filters.dateTo);
  }
  if (filters.tab !== 'all') search.set('tab', filters.tab);
  if (filters.mode) search.set('mode', filters.mode);
  if (filters.q.trim()) search.set('q', filters.q.trim());
  if (filters.page > 1) search.set('page', String(filters.page));
  return search.toString();
};

export const isNarrowed = (filters: PaymentFilters): boolean =>
  filters.tab !== 'all' || !!filters.mode || !!filters.q.trim();

// ── The receipt and the void ────────────────────────────────────────────────

/** "UPI + Cash" — the modes in the order the lines were typed (PAY-04 §17). */
export const modeLabelIds = (lines: readonly PaymentModeLine[]): readonly string[] =>
  lines.map((line) =>
    line.mode === 'upi' && line.upiApp ? `ledger.upiApp.${line.upiApp}` : `ledger.mode.${line.mode}`
  );

/** Is anything left as advance on this receipt? */
export const hasAdvance = (payment: Pick<Payment, 'unallocatedAmount'>): boolean =>
  !isZeroAmount(payment.unallocatedAmount);

/**
 * PAY-05 FR-2 — what a void will change, said before it happens. Computed from
 * the held receipt; the server's answer is authoritative.
 */
export interface VoidConsequence {
  readonly kind: 'ledger' | 'document' | 'advance' | 'walkIn';
  readonly number?: string;
  readonly amount: string;
}

export const voidConsequences = (payment: Payment): readonly VoidConsequence[] => {
  const rows: VoidConsequence[] = [];
  if (payment.party) rows.push({ kind: 'ledger', amount: payment.amount });
  else rows.push({ kind: 'walkIn', amount: payment.amount });
  for (const allocation of payment.allocations) {
    rows.push({
      kind: 'document',
      number: allocation.number ?? '',
      amount: addMoney(clean(allocation.amountDue ?? '0'), clean(allocation.amount)),
    });
  }
  if (hasAdvance(payment)) rows.push({ kind: 'advance', amount: payment.unallocatedAmount });
  return rows;
};
