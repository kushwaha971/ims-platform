import type { UbGridSort } from 'src/design-system/UbDataGrid';

/**
 * Part 19 §19.1.1 layer 3 — the translation between the grid's sort state and
 * the server's `ordering` parameter, as two pure functions.
 *
 * Sorting is SERVER-side (Part 22 §22.1). A client that re-sorts the twenty-five
 * rows it happens to hold, out of four thousand, shows the merchant the largest
 * balance *on this page* under a header that says "largest first" — which is a
 * more expensive kind of wrong than no sorting at all.
 */

/** Column id → the server field. A column absent here is not sortable. */
export const PARTY_SORT_FIELDS: Readonly<Record<string, string>> = {
  name: 'name',
  balance: 'balance',
  activity: 'last_activity_at',
};

/** `{ columnId: 'balance', direction: 'desc' }` → `-balance`. */
export const orderingFor = (sort: UbGridSort): string => {
  const field = PARTY_SORT_FIELDS[sort.columnId];
  if (!field) return '';
  return sort.direction === 'desc' ? `-${field}` : field;
};

/** `-last_activity_at` → `{ columnId: 'activity', direction: 'desc' }`. */
export const sortFromOrdering = (ordering: string): UbGridSort | null => {
  const direction = ordering.startsWith('-') ? 'desc' : 'asc';
  const field = ordering.replace(/^-/, '');
  const columnId = Object.keys(PARTY_SORT_FIELDS).find((id) => PARTY_SORT_FIELDS[id] === field);
  return columnId ? { columnId, direction } : null;
};

/**
 * UAT D5 — the phone's sort sheet. The card layout has no column headers, so
 * these are the four orders a merchant reaches for, each an `ordering` the
 * headers already write. Balance is signed (positive = they owe me), so "high
 * to low" puts the biggest receivable first. Kept here, beside the header
 * mapping, so a new sortable field is added in one file.
 */
export const PHONE_SORT_CHOICES = [
  { ordering: '-last_activity_at', labelKey: 'parties.list.sort.activity' },
  { ordering: '-balance', labelKey: 'parties.list.sort.balanceDesc' },
  { ordering: 'balance', labelKey: 'parties.list.sort.balanceAsc' },
  { ordering: 'name', labelKey: 'parties.list.sort.name' },
] as const;

export type PhoneSortOrdering = (typeof PHONE_SORT_CHOICES)[number]['ordering'];
