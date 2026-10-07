import type { ProfitGroup, ProfitOrdering } from '../types/profitReport.types';

/**
 * Shop item 1 constants, in a module that imports nothing at runtime: the
 * lazily injected slice and the URL helpers read them, and anything a slice
 * imports ships with it.
 */

/** Item first: "which items make me money" is the question asked most. */
export const PROFIT_GROUPS: readonly ProfitGroup[] = ['item', 'party', 'category', 'bill'];
export const PROFIT_DEFAULT_GROUP: ProfitGroup = 'item';
/** Most profit first; one tap on the Profit header puts the loss-makers on top. */
export const PROFIT_DEFAULT_ORDERING: ProfitOrdering = '-profit';
export const PROFIT_ORDERINGS: readonly ProfitOrdering[] = [
  '-profit',
  'profit',
  '-sale_value',
  'sale_value',
  '-margin',
  'margin',
  'name',
  '-name',
];
export const PROFIT_PAGE_SIZE = 50;
