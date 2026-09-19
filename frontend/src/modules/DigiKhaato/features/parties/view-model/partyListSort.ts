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
