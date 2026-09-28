import { ROUTES } from 'src/routes';
import { formatInr, isNegativeAmount, toDecimal, type MoneyString } from 'src/utils/money';

import type { ActivityItem, DashboardTiles } from '../types/reports.types';

/**
 * RPT-01 — pure helpers for the dashboard screen: the short-form rupee, the
 * "Updated 30 s ago" caption, and where each tile and feed row leads. No
 * React, no Redux — every rule here is a unit test away from being checked.
 */

const LAKH = 100_000;
const CRORE = 10_000_000;

export interface ShortInr {
  /** What the tile shows: `₹1.2 L`, `₹3.4 Cr`, or the full figure below a lakh. */
  readonly text: string;
  /** The exact figure, for the tooltip and the accessible name (NFR). */
  readonly full: string;
}

/**
 * §5 — "short form ₹1.2 L / ₹3.4 Cr above 5 digits with full value on tooltip".
 *
 * One decimal, trailing `.0` dropped ("₹2 L", not "₹2.0 L"), sign kept (a
 * returns day is negative, EC-3). The unit words come from the caller's
 * locale — "L"/"Cr" in English, "लाख"/"करोड़" in Hindi — so this stays pure.
 */
export const shortInr = (
  value: MoneyString | null | undefined,
  units: { readonly lakh: string; readonly crore: string }
): ShortInr => {
  const full = formatInr(value ?? '0.00');
  const amount = toDecimal(value ?? '0.00');
  const magnitude = amount.abs();
  if (magnitude.lessThan(LAKH)) return { text: full, full };
  const [divisor, unit] = magnitude.greaterThanOrEqualTo(CRORE)
    ? [CRORE, units.crore]
    : [LAKH, units.lakh];
  const scaled = magnitude.dividedBy(divisor).toDecimalPlaces(1, 1 /* ROUND_DOWN */);
  const figure = scaled.isInteger() ? scaled.toFixed(0) : scaled.toFixed(1);
  const sign = amount.isNegative() ? '−' : '';
  return { text: `${sign}₹${figure} ${unit}`, full };
};

/** FR-8 — whole seconds since the server computed the figures, never negative. */
export const secondsSince = (generatedAt: string | null | undefined, nowMs: number): number => {
  if (!generatedAt) return 0;
  const then = Date.parse(generatedAt);
  return Number.isNaN(then) ? 0 : Math.max(0, Math.floor((nowMs - then) / 1000));
};

/** Which tiles the screen draws, in FR-2's order — only those the server sent. */
export const TILE_ORDER = [
  'toCollect',
  'toPay',
  'dueToday',
  'overdue',
  'todaySales',
  'cashInHand',
  'lowStock',
  'upcoming7d',
] as const satisfies readonly (keyof DashboardTiles)[];
export type TileKey = (typeof TILE_ORDER)[number];

/** FR-2's "Tap →" column. Every tile leads to the list that makes it up. */
export const TILE_HREF: Readonly<Record<TileKey, string>> = {
  toCollect: `${ROUTES.PARTIES}?balance=owes_me`,
  toPay: `${ROUTES.PARTIES}?balance=i_owe`,
  dueToday: `${ROUTES.PARTIES}?collection=today`,
  overdue: `${ROUTES.PARTIES}?collection=overdue`,
  upcoming7d: `${ROUTES.PARTIES}?collection=upcoming`,
  todaySales: `${ROUTES.SALES_INVOICES}?period=today`,
  cashInHand: ROUTES.CASHBOOK,
  lowStock: ROUTES.STOCK_LOW,
};

/** BR-6's secondary line leads to the bills themselves. */
export const OVERDUE_BILLS_HREF = `${ROUTES.SALES_INVOICES}?tab=overdue`;

/**
 * Where a tap on a tile goes. Overdue is the one with two lists behind it: the
 * parties whose promised date has passed (BR-6's primary figure) — unless no
 * party is overdue and only BILLS are, when the bills list is the useful one.
 */
export const tileHref = (key: TileKey, tiles: DashboardTiles): string =>
  key === 'overdue' && !tiles.overdue?.count && (tiles.overdue?.invoices?.count ?? 0) > 0
    ? OVERDUE_BILLS_HREF
    : TILE_HREF[key];

/** UX §8 — receivable and overdue in the error tone, payable in success. */
export const tileTone = (
  key: TileKey,
  tiles: DashboardTiles
): 'default' | 'success' | 'warning' | 'danger' => {
  switch (key) {
    case 'toCollect':
    case 'overdue':
      return 'danger';
    case 'toPay':
      return 'success';
    case 'dueToday':
      return 'warning';
    case 'todaySales':
      return isNegativeAmount(tiles.todaySales?.amount) ? 'danger' : 'default';
    case 'lowStock':
      return (tiles.lowStock?.outCount ?? 0) > 0 ? 'danger' : 'warning';
    default:
      return 'default';
  }
};

/**
 * The yesterday comparison on Today's sales (§7: the one tile with a
 * baseline). `null` when yesterday was zero — a percentage against nothing is
 * a number that means nothing, so the tile says the plain figure instead.
 */
export const salesDelta = (
  today: MoneyString,
  yesterday: MoneyString
): { readonly percent: number; readonly direction: 'up' | 'down' | 'flat' } | null => {
  const base = toDecimal(yesterday);
  if (base.isZero()) return null;
  const change = toDecimal(today).minus(base).dividedBy(base.abs()).times(100);
  const percent = Math.round(change.toNumber());
  return { percent, direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat' };
};

/** FR-3 — the feed row's message id; a void event says so in its own words. */
export const activityLabelId = (item: ActivityItem): string => {
  const base = item.type.replace(/_void$/, '');
  const known = [
    'sale',
    'credit_note',
    'purchase',
    'payment_in',
    'payment_out',
    'expense',
    'manual_gave',
    'manual_got',
    'opening',
    'write_off',
    'reversal',
    'correction',
    'stock_adjustment',
  ];
  const key = known.includes(base) ? base : 'other';
  return item.type.endsWith('_void')
    ? `reports.dashboard.activity.void.${key}`
    : `reports.dashboard.activity.${key}`;
};

/** FR-9 — the checklist replaces the tiles only in a truly empty book. */
export const isFirstUse = (firstUse: {
  readonly hasParty: boolean;
  readonly hasDocument: boolean;
}): boolean => !firstUse.hasParty && !firstUse.hasDocument;

const COUNTER_TYPES = ['sale', 'credit_note', 'payment_in', 'payment_out'];

/**
 * FR-3 — the feed row's words. QA R-D3: a walk-in bill has no party, and
 * "Bill {number} · {party}" rendered "Bill INV/26-27/0006 · " with a stray
 * separator. A counter document (bill, credit note, receipt) with no party
 * says "Walk-in", as the day book does; anything else drops the dangling " · ".
 */
export const activityTitle = (
  item: ActivityItem,
  t: (id: string, values?: Record<string, string>) => string
): string => {
  const base = item.type.replace(/_void$/, '');
  const party =
    item.party?.name || (COUNTER_TYPES.includes(base) ? t('reports.daybook.walkIn') : '');
  return t(activityLabelId(item), { number: item.number ?? '', party })
    .replace(/\s*·\s*$/, '')
    .replace(/\s*·\s*·\s*/g, ' · ')
    .trim();
};
