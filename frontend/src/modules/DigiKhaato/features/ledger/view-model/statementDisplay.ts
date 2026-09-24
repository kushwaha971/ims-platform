import { DEFAULT_PRESET, FY_START_MONTH, STATEMENT_PRESETS } from '../constants/statementPeriod';

import { balanceDirection, unsigned, type BalanceDirection } from './balanceSide';

import type { StatementFilters, StatementPreset, StatementRow } from '../types/statement.types';

/**
 * Part 19 §19.2.5 — LED-04's presentation decisions, as pure functions.
 *
 * No React, no Redux, no `Ub*`. Everything here is a function of a row or a
 * date and returns ids, tokens or plain values — never rendered strings, so the
 * screen and the print view cannot disagree about what a number means.
 */

/* `BalanceDirection`, `balanceDirection` and `unsigned` live in
   `balanceSide.ts`, which imports nothing, so the khata timeline can use them
   without carrying this module into `/parties/[id]`. Re-exported so this
   module stays the one place a statement caller has to look. */
export { balanceDirection, unsigned, type BalanceDirection };

/** The message id for the words under a running balance. */
export const balanceLabelId = (amount: string): string =>
  `ledger.statement.label.${balanceDirection(amount)}`;

/**
 * Which column a row's amount belongs in.
 *
 * A statement is two money columns and a balance, not one signed column: "You
 * gave" on the left and "You got" on the right is how a paper khata is ruled,
 * and it is what makes a statement scannable — a customer checking a disputed
 * month runs their finger down one column.
 */
export const isDebitRow = (row: StatementRow): boolean => row.direction === 'debit';

/** A row the merchant has undone, struck through when corrections are shown. */
export const isStruckThrough = (row: StatementRow): boolean => row.status === 'reversed';

// ── The period ───────────────────────────────────────────────────────────────

/* `FY_START_MONTH`, `STATEMENT_PRESETS` and `DEFAULT_PRESET` live in
   `constants/statementPeriod.ts`, which imports nothing — see that file for the
   2.2 KB of shell it was costing from here. Re-exported so this module stays
   the one place a caller has to look. */
export { DEFAULT_PRESET, FY_START_MONTH, STATEMENT_PRESETS };

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const lastDayOf = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Resolve a preset against a given "today".
 *
 * `today` is passed IN rather than read from the device clock, and that is
 * EC-8's rule applied to a range instead of to an entry: the tenant's timezone
 * decides what today is. A phone set to UTC at 11.50 p.m. IST would otherwise
 * resolve "This month" to a range ending yesterday, and a merchant printing a
 * month-end statement would be handed one missing its last day.
 *
 * Returns `null` dates for "all time", which is what the server reads as an
 * unbounded period — and an unbounded period is the one whose closing balance
 * must equal the khata page's figure (BR-3).
 */
export const resolvePreset = (
  preset: StatementPreset,
  today: string
): { readonly dateFrom: string | null; readonly dateTo: string | null } => {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const fyStartYear = month >= FY_START_MONTH ? year : year - 1;

  switch (preset) {
    case 'thisMonth':
      return { dateFrom: iso(year, month, 1), dateTo: iso(year, month, day) };
    case 'lastMonth': {
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? year - 1 : year;
      return { dateFrom: iso(y, m, 1), dateTo: iso(y, m, lastDayOf(y, m)) };
    }
    case 'thisFy':
      /* Ends TODAY rather than on 31 March. A financial year that has not
         finished has no closing figure yet, and a statement dated into the
         future would show a customer a period they have not lived through. */
      return { dateFrom: iso(fyStartYear, FY_START_MONTH, 1), dateTo: iso(year, month, day) };
    case 'lastFy':
      return {
        dateFrom: iso(fyStartYear - 1, FY_START_MONTH, 1),
        dateTo: iso(fyStartYear, FY_START_MONTH - 1, 31),
      };
    case 'allTime':
    case 'custom':
    default:
      return { dateFrom: null, dateTo: null };
  }
};

/**
 * Read the filter out of the address bar (FR-8).
 *
 * The URL is the source of truth so the page is linkable and survives a
 * reload — the same lesson PTY-05 wrote down when the tag manager's count link
 * turned out to be inert because the list's filters lived only in Redux.
 *
 * A URL carrying dates but no preset is `custom`, which is what a link somebody
 * pasted looks like; a preset with no dates is resolved by the caller against
 * the tenant's today.
 */
export const filtersFromQuery = (query: URLSearchParams, today: string): StatementFilters => {
  const from = query.get('from');
  const to = query.get('to');
  const raw = query.get('preset');
  const preset = (STATEMENT_PRESETS as readonly string[]).includes(raw ?? '')
    ? (raw as StatementPreset)
    : from || to
      ? 'custom'
      : DEFAULT_PRESET;
  const resolved =
    preset === 'custom' ? { dateFrom: from, dateTo: to } : resolvePreset(preset, today);
  return {
    preset,
    dateFrom: resolved.dateFrom,
    dateTo: resolved.dateTo,
    includeCorrections: query.get('corrections') === 'true',
  };
};

/** The inverse, for writing the filter back. Empty values are omitted. */
export const queryFromFilters = (filters: StatementFilters): string => {
  const query = new URLSearchParams();
  query.set('preset', filters.preset);
  if (filters.preset === 'custom') {
    if (filters.dateFrom) query.set('from', filters.dateFrom);
    if (filters.dateTo) query.set('to', filters.dateTo);
  }
  if (filters.includeCorrections) query.set('corrections', 'true');
  return query.toString();
};

/**
 * §10 — five years, checked before a request is made.
 *
 * The server refuses it too, and that is not duplication for its own sake: this
 * one keeps the merchant from waiting for a round trip to be told a thing the
 * client already knows, and the server's keeps a client bug from asking for a
 * scan of a tenant's whole history. §19.9.2's rule — mirror the arithmetic,
 * leave the cross-record questions to the server.
 */
export const MAX_RANGE_DAYS = 366 * 5;

export const rangeProblem = (filters: StatementFilters): 'inverted' | 'tooLong' | null => {
  const { dateFrom, dateTo } = filters;
  if (!dateFrom || !dateTo) return null;
  if (dateFrom > dateTo) return 'inverted';
  const days =
    (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000;
  return days > MAX_RANGE_DAYS ? 'tooLong' : null;
};
