import { partyStatementPath } from 'src/routes';

import { AGING_BUCKETS } from '../types/aging.types';

import type { AgingAmounts, AgingBucket, AgingFilters, AgingKind } from '../types/aging.types';

/**
 * Part 19 §19.2.5 — LED-09's presentation decisions, as pure functions.
 *
 * The one with real content is `bucketStatementHref`, which turns a figure into
 * a place to go. The rest is naming and shaping.
 */

/** The bucket's own message id. Colour never carries the age alone (§5). */
export const bucketLabelId = (bucket: AgingBucket): string => `ledger.aging.bucket.${bucket}`;

/**
 * Each bucket's share of the row, in age order, for `AgingBucketBar`.
 *
 * Shares are whole percentages that SUM TO 100 — the largest-remainder method
 * rather than four independent roundings, which can give 99 or 101 and leave
 * the bar a sliver short of its track or spilling past it. A bucket with money
 * in it never rounds to 0: ₹5 of ₹10,000 is still a debt somebody owes, and a
 * segment that vanishes says it is not.
 */
export const bucketShares = (
  amounts: AgingAmounts
): readonly { bucket: AgingBucket; share: number }[] => {
  const values = AGING_BUCKETS.map((bucket) =>
    Math.max(Number.parseFloat(amounts[bucket]) || 0, 0)
  );
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return AGING_BUCKETS.map((bucket) => ({ bucket, share: 0 }));

  const raw = values.map((value) => (value / total) * 100);
  const shares = raw.map((value, index) =>
    (values[index] ?? 0) > 0 ? Math.max(Math.floor(value), 1) : 0
  );
  const live = shares.map((_, index) => index).filter((index) => (values[index] ?? 0) > 0);

  // Short of 100: the largest fractional parts get the missing points.
  const byRemainder = [...live].sort(
    (a, b) => (raw[b] ?? 0) - Math.floor(raw[b] ?? 0) - ((raw[a] ?? 0) - Math.floor(raw[a] ?? 0))
  );
  for (let i = 0; shares.reduce((sum, v) => sum + v, 0) < 100; i += 1) {
    const index = byRemainder[i % byRemainder.length] ?? 0;
    shares[index] = (shares[index] ?? 0) + 1;
  }
  // Over 100 (the 1% floor lifted a sliver): the widest segments give it back.
  while (shares.reduce((sum, v) => sum + v, 0) > 100) {
    const widest = live.reduce((a, b) => ((shares[b] ?? 0) > (shares[a] ?? 0) ? b : a));
    shares[widest] = (shares[widest] ?? 0) - 1;
  }
  return AGING_BUCKETS.map((bucket, index) => ({ bucket, share: shares[index] ?? 0 }));
};

/**
 * The oldest bucket with money in it — the one fact a phone card has room for.
 *
 * On a 360 px card there is space for a title, a total and one line. Of the
 * four buckets, the line a merchant acts on is the oldest one that is not
 * empty: "₹100 over 90 days" is a phone call; "₹400 in 0–30" is Tuesday.
 */
export const oldestBucket = (
  amounts: AgingAmounts
): { bucket: AgingBucket; amount: string } | null => {
  const bucket = [...AGING_BUCKETS].reverse().find((key) => hasAmount(amounts[key]));
  return bucket ? { bucket, amount: amounts[bucket] } : null;
};

/**
 * FR-4 — where a bucket cell goes when it is tapped.
 *
 * This is the payoff for having built LED-04 first. "90+ ₹1,200" tells a
 * merchant to make a phone call; the statement filtered to the entries that
 * figure is made of tells them what to say on it. Without the drill-down the
 * report is a number they then have to go and reconstruct by hand.
 *
 * The windows are computed from the as-of date rather than from today, because
 * an accountant reading a year-end report and tapping a cell must land on the
 * year-end entries and not on this morning's.
 *
 * `90_plus` has no lower bound, so `from` is simply omitted — a date far enough
 * back to stand in for "the beginning" is a date that would one day be wrong,
 * and a merchant who migrated a twenty-year-old book would find it.
 */
export const BUCKET_EDGES: Readonly<Record<AgingBucket, readonly [number, number | null]>> = {
  '0_30': [0, 30],
  '31_60': [31, 60],
  '61_90': [61, 90],
  '90_plus': [91, null],
};

const shift = (asOf: string, days: number): string =>
  new Date(Date.parse(`${asOf}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

export const bucketStatementHref = (partyId: string, bucket: AgingBucket, asOf: string): string => {
  const [lower, upper] = BUCKET_EDGES[bucket];
  const to = shift(asOf, lower);
  const from = upper === null ? null : shift(asOf, upper);
  const query = new URLSearchParams({ preset: 'custom', to });
  if (from) query.set('from', from);
  return `${partyStatementPath(partyId)}?${query.toString()}`;
};

/** A row click opens the whole statement as of the report's date (FR-4). */
export const rowStatementHref = (partyId: string, asOf: string): string =>
  `${partyStatementPath(partyId)}?${new URLSearchParams({ preset: 'custom', to: asOf }).toString()}`;

/** Is there anything in this bucket worth linking to? */
export const hasAmount = (value: string): boolean => !/^-?0*\.?0*$/.test(value.trim());

// ── The filter, which lives in the URL ──────────────────────────────────────

export const DEFAULT_ORDERING = '-90_plus';

/**
 * §8's default sort, and it is the order a merchant works in: the customer who
 * has owed the longest, not the one who owes the most. A collection round
 * starts at the top of this list.
 */
export const AGING_ORDERINGS = ['-90_plus', '90_plus', '-total', 'total', 'name', '-name'] as const;

/** Grid column id → the server's ordering field (§14). */
export const AGING_SORT_FIELDS: Readonly<Record<string, string>> = {
  party: 'name',
  '90_plus': '90_plus',
  total: 'total',
};

export const orderingFor = (sort: { columnId: string; direction: 'asc' | 'desc' }): string => {
  const field = AGING_SORT_FIELDS[sort.columnId];
  if (!field) return '';
  return sort.direction === 'desc' ? `-${field}` : field;
};

export const sortFromOrdering = (
  ordering: string
): { columnId: string; direction: 'asc' | 'desc' } | null => {
  const field = ordering.replace(/^-/, '');
  const columnId = Object.keys(AGING_SORT_FIELDS).find((id) => AGING_SORT_FIELDS[id] === field);
  return columnId ? { columnId, direction: ordering.startsWith('-') ? 'desc' : 'asc' } : null;
};

export const filtersFromQuery = (query: URLSearchParams, today: string): AgingFilters => {
  const kind = query.get('type') === 'payable' ? 'payable' : 'receivable';
  const ordering = (AGING_ORDERINGS as readonly string[]).includes(query.get('ordering') ?? '')
    ? (query.get('ordering') as string)
    : DEFAULT_ORDERING;
  const page = Number.parseInt(query.get('page') ?? '1', 10);
  return {
    kind: kind as AgingKind,
    /* The as-of defaults to the TENANT's today, passed in. A device set to UTC
       would otherwise ask for yesterday's report late in an Indian evening, and
       an aging report a day out moves money between the bucket a merchant
       ignores and the bucket they act on. */
    asOf: query.get('as_of') || today,
    tag: query.get('tag'),
    ordering,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
};

export const queryFromFilters = (filters: AgingFilters, today: string): string => {
  const query = new URLSearchParams();
  if (filters.kind !== 'receivable') query.set('type', filters.kind);
  if (filters.asOf && filters.asOf !== today) query.set('as_of', filters.asOf);
  if (filters.tag) query.set('tag', filters.tag);
  if (filters.ordering !== DEFAULT_ORDERING) query.set('ordering', filters.ordering);
  if (filters.page > 1) query.set('page', String(filters.page));
  return query.toString();
};

/** §10 — the one rule the client can check without asking. */
export const asOfProblem = (asOf: string, today: string): 'future' | null =>
  asOf > today ? 'future' : null;
