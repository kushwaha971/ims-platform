import type { TranslateFn } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import {
  formatInr,
  isNegativeAmount,
  toDecimal,
  toMoneyString,
  type MoneyString,
} from 'src/utils/money';
import { formatTimestampInTz } from 'src/utils/zonedTime';

import type { ActivityItem, AgedCountAmount, DashboardTiles } from '../types/reports.types';

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
/* DEC-019 — this is the Shop's home: To collect / To pay are its customers and
   suppliers on bills, not the whole book (`/parties` reads the Udhaar book). */
export const TILE_HREF: Readonly<Record<TileKey, string>> = {
  toCollect: `${ROUTES.CUSTOMERS}?balance=owes_me`,
  toPay: `${ROUTES.SUPPLIERS}?balance=i_owe`,
  dueToday: `${ROUTES.PARTIES}?collection=today`,
  // WP-06 / DEC-019 — the Shop's overdue is its bills; the server sends no
  // party count, so there is no Udhaar list to fall back to.
  overdue: `${ROUTES.SALES_INVOICES}?tab=overdue`,
  upcoming7d: `${ROUTES.PARTIES}?collection=upcoming`,
  todaySales: `${ROUTES.SALES_INVOICES}?period=today`,
  cashInHand: ROUTES.CASHBOOK,
  lowStock: ROUTES.STOCK_LOW,
};

/** Where a tap on a tile goes: the list that makes it up. */
export const tileHref = (key: TileKey, _tiles: DashboardTiles): string => TILE_HREF[key];

/**
 * WP-06 DASH-02 — the line under To collect / To pay naming the money held the
 * other way round in that list, or null when there is none: "Customers paid
 * ₹700.00 ahead". A zero advance is not news and is not drawn.
 */
/**
 * WP-06 Finding 2 — an overdue figure's link. The bill lists default to this
 * financial year, and an overdue bill from last year is exactly the one that
 * must not drop out of the list the figure opens, so the link carries the range
 * from the oldest overdue bill's date to today. Without that date (an older
 * server, or nothing overdue) it is the tab alone.
 */
export const overdueHref = (list: string, bills: AgedCountAmount, today: string): string =>
  bills.firstBillDate
    ? `${list}?tab=overdue&from=${bills.firstBillDate}&to=${today}`
    : `${list}?tab=overdue`;

export const advancesLine = (
  key: 'toCollect' | 'toPay',
  tiles: DashboardTiles,
  t: TranslateFn
): string | null => {
  const advances = tiles[key]?.advances;
  if (!advances || toDecimal(advances).lte(0)) return null;
  return t(`reports.dashboard.tile.${key}.advances`, { amount: formatInr(advances) });
};

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
/**
 * WP-06 Finding 5 — when a row happened. `at` is when it was entered; a bill
 * dated 40 days ago and typed in today read "16/10/2026, 16:13" alone, as
 * though it were today's sale. When its own date is another day, say both.
 */
export const activityWhen = (
  item: Pick<ActivityItem, 'at' | 'businessDate'>,
  t: TranslateFn,
  timeZone?: string
): string => {
  // The shop's clock, as the business date is: a UTC device otherwise wrote a
  // bill entered at 00:11 IST under the day before and called it backdated.
  const entered = formatTimestampInTz(item.at, timeZone);
  const own = item.businessDate ? formatBusinessDate(item.businessDate) : null;
  return own && !entered.startsWith(own)
    ? t('reports.dashboard.activity.dated', { date: own, at: entered })
    : entered;
};

/**
 * WP-06 Finding 4 — the Cash in hand tile's words. No opening cash is
 * recorded, so the figure is what moved through the Shop's drawer since its
 * first cash record, and the caption names that day. A negative figure is not
 * a till holding minus money: it is more paid out than came in since then.
 */
export const cashTile = (
  cash: NonNullable<DashboardTiles['cashInHand']>,
  t: TranslateFn
): { readonly label: string; readonly amount: MoneyString; readonly caption: string } => {
  if (cash.since === undefined) {
    return {
      label: t('reports.dashboard.tile.cashInHand'),
      amount: cash.amount,
      caption: t('reports.dashboard.tile.cashInHand.baseline'),
    };
  }
  if (cash.since === null) {
    return {
      label: t('reports.dashboard.tile.cashInHand'),
      amount: cash.amount,
      caption: t('reports.dashboard.tile.cashInHand.none'),
    };
  }
  const date = formatBusinessDate(cash.since);
  return isNegativeAmount(cash.amount)
    ? {
        label: t('reports.dashboard.tile.cashOut'),
        amount: toMoneyString(toDecimal(cash.amount).abs()),
        caption: t('reports.dashboard.tile.cashOut.caption', { date }),
      }
    : {
        label: t('reports.dashboard.tile.cashInHand'),
        amount: cash.amount,
        caption: t('reports.dashboard.tile.cashInHand.since', { date }),
      };
};

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
