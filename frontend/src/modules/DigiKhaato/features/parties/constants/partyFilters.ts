/**
 * PTY-02 §7 — the three chip filters, and the values the server accepts.
 *
 * ── This module imports NOTHING, deliberately ───────────────────────────────
 * `partyListSlice` reads these, and every slice `store.ts` registers statically
 * ships in the app shell (§19.3.9). The same trap has now been sprung twice on
 * this feature — once by a totals type that sat beside `partyTotals()` and
 * dragged `decimal.js-light` onto `/login`, once by field-name constants that
 * sat beside a Yup schema and dragged Yup into the list route. Module-level
 * imports tree-shake BETWEEN modules, not within one.
 *
 * ── The wire values are the source of truth ─────────────────────────────────
 * `owes_me` and `i_owe` are snake_case because that is what `PartyFilterSet`
 * declares, and a client-side alias would mean a mapping table whose only job
 * is to be got wrong. The screen never shows these strings; `t()` does.
 *
 * ── One value per axis ──────────────────────────────────────────────────────
 * Each of the three is single-select — `''` for "not applied" — because the
 * server's filters are `ChoiceFilter`s and a multi-select would have to be a
 * different parameter shape. That is a real limit and not a UI preference:
 * "owes me OR settled" is not a question the endpoint can answer today, and a
 * chip row that let a merchant ask it would silently drop one of the two.
 */

/** Empty string, not `null` or `undefined`: it round-trips through a URL. */
export type PartyTypeFilter = '' | 'customer' | 'supplier';
export type PartyBalanceFilter = '' | 'owes_me' | 'i_owe' | 'settled';
export type PartyCollectionFilter = '' | 'today' | 'overdue' | 'upcoming';

export const TYPE_FILTERS: readonly Exclude<PartyTypeFilter, ''>[] = ['customer', 'supplier'];

export const BALANCE_FILTERS: readonly Exclude<PartyBalanceFilter, ''>[] = [
  'owes_me',
  'i_owe',
  'settled',
];

export const COLLECTION_FILTERS: readonly Exclude<PartyCollectionFilter, ''>[] = [
  'today',
  'overdue',
  'upcoming',
];

/**
 * Which balance filter each money tile applies when it is tapped (FRD §6
 * Alternate A: "tap 'You will get' → `balance=owes_me` applied").
 *
 * Here rather than in the component because it is the one place the tile and
 * the chip have to agree: tapping the tile must light up the chip, or the
 * merchant sees a filtered list with nothing on screen saying it is filtered.
 */
export const RECEIVABLE_FILTER = 'owes_me' as const;
export const PAYABLE_FILTER = 'i_owe' as const;


/**
 * PTY-06 FR-12 — the credit band a party is in.
 *
 * Only ever three answers, and only ever about parties that HAVE a limit: a
 * book where four of three hundred parties have one would otherwise answer
 * "within limit" with two hundred and ninety-six people nobody ever set a limit
 * for. The filter is about the control, so it only returns parties the control
 * applies to.
 */
export type PartyCreditFilter = '' | 'over' | 'near' | 'ok';

export const CREDIT_FILTERS: readonly Exclude<PartyCreditFilter, ''>[] = [
  'over',
  'near',
  'ok',
];
