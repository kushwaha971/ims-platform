import { resetAllFeatureState } from 'src/redux/actions';

import { agingFiltersChanged, ledgerAgingReducer as reduce } from './agingSlice';
import { fetchLedgerAging, fetchLedgerSummary } from './agingThunk';

import type { AgingFilters, AgingPage } from '../types/aging.types';

const BASE: AgingFilters = {
  book: 'shop',
  kind: 'receivable',
  asOf: '2026-10-15',
  tag: null,
  ordering: '-90_plus',
  page: 1,
};
const page = (name: string, filters: AgingFilters): AgingPage => ({
  rows: [
    {
      partyId: name,
      partyName: name,
      amounts: {
        '0_30': '100.00',
        '31_60': '0.00',
        '61_90': '0.00',
        '90_plus': '0.00',
        total: '100.00',
      },
    },
  ],
  totals: {
    '0_30': '100.00',
    '31_60': '0.00',
    '61_90': '0.00',
    '90_plus': '0.00',
    total: '100.00',
  },
  asOf: filters.asOf,
  kind: filters.kind,
  cachedAt: null,
  page: filters.page,
  pageSize: 25,
  total: 1,
  hasAny: true,
});

it.each<Partial<AgingFilters>>([
  { tag: 'Route 2' },
  { page: 2 },
  { ordering: 'name' },
  { book: 'main' },
])('keeps the latest aging answer when an older filter request arrives late: %j', (change) => {
  const next = { ...BASE, ...change };
  let state = reduce(undefined, agingFiltersChanged(BASE));
  state = reduce(state, fetchLedgerAging.pending('old', BASE));
  state = reduce(state, agingFiltersChanged(next));
  state = reduce(state, fetchLedgerAging.pending('new', next));
  state = reduce(state, fetchLedgerAging.fulfilled(page('Correct party', next), 'new', next));
  const correct = state;
  state = reduce(state, fetchLedgerAging.fulfilled(page('Wrong party', BASE), 'old', BASE));
  expect(state).toEqual(correct);
});

it('does not replace a current report with an old request failure', () => {
  let state = reduce(undefined, agingFiltersChanged(BASE));
  state = reduce(state, fetchLedgerAging.pending('old', BASE));
  state = reduce(state, fetchLedgerAging.pending('new', BASE));
  state = reduce(state, fetchLedgerAging.fulfilled(page('Correct party', BASE), 'new', BASE));
  const correct = state;
  state = reduce(state, fetchLedgerAging.rejected(new Error('Old timeout'), 'old', BASE));
  expect(state).toEqual(correct);
});

it('drops a former tenant/session response after all feature state is reset', () => {
  let state = reduce(undefined, agingFiltersChanged(BASE));
  state = reduce(state, fetchLedgerAging.pending('old', BASE));
  state = reduce(state, resetAllFeatureState());
  const empty = state;
  state = reduce(state, fetchLedgerAging.fulfilled(page('Previous tenant', BASE), 'old', BASE));
  expect(state).toEqual(empty);
});

it('keeps the latest position summary when an old same-book request resolves late', () => {
  let state = reduce(undefined, agingFiltersChanged(BASE));
  state = reduce(state, fetchLedgerSummary.pending('old', 'shop'));
  state = reduce(state, fetchLedgerSummary.pending('new', 'shop'));
  state = reduce(
    state,
    fetchLedgerSummary.fulfilled({ receivable: '100.00', payable: '0.00' }, 'new', 'shop')
  );
  state = reduce(
    state,
    fetchLedgerSummary.fulfilled({ receivable: '1000.00', payable: '0.00' }, 'old', 'shop')
  );
  expect(state.summary?.receivable).toBe('100.00');
});
