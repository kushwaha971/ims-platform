/** Part 22 §22.1 caps page_size at 100; 25 is the documented default. */
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100];
/** Desktop bulk selection is capped so a "select all" cannot post 10k ids. */
export const SELECTION_CAP = 200;
/** PTY-02 FR-7's whitelist starts here; Sprint 0 needs only the default. */
export const DEFAULT_ORDERING = '-last_activity_at';

/**
 * The two header figures, and their empty value.
 *
 * They live HERE, not beside `partyTotals()` in the view-model, and the reason
 * is a measured 6.7 KB. `partyListSlice` needs the type and the zero value;
 * importing them from `partyDisplay` pulled that module's `partyTotals()` with
 * them, which reaches `utils/money`, which is `decimal.js-light`. Every slice
 * `store.ts` registers statically is in the app shell (§19.3.9), so a money
 * library was being downloaded by `/legal/terms`, `/login` and every other
 * route that will never show a rupee.
 *
 * A type and a two-field constant carry nothing. Keeping them apart from the
 * arithmetic is what lets the arithmetic stay in the route that needs it.
 */
export interface PartyListTotals {
  readonly receivable: string;
  readonly payable: string;
}

export const ZERO_TOTALS: PartyListTotals = { receivable: '0.00', payable: '0.00' };

/** Which set a `totals` figure describes — the header says so out loud. */
export type PartyTotalsScope = 'filtered' | 'page';
