import {
  isLoss,
  orderingOf,
  profitFiltersFromQuery,
  profitPath,
  profitQueryFromFilters,
  profitRowHref,
  sortOf,
} from './profitDisplay';

import type { ProfitRow } from '../types/profitReport.types';

const TODAY = '2026-10-06';

const row = (over: Partial<ProfitRow>): ProfitRow => ({
  id: 'x1',
  name: 'Rice',
  qty: null,
  unit: null,
  date: null,
  party: null,
  bills: 1,
  saleValue: '100.00',
  cost: '80.00',
  profit: '20.00',
  marginPct: '20.0',
  uncostedLines: 0,
  ...over,
});

it('opens on this month, by item, most profit first, and keeps that out of the address bar', () => {
  const filters = profitFiltersFromQuery(new URLSearchParams(''), TODAY);
  expect(filters).toEqual({
    preset: 'thisMonth',
    dateFrom: '2026-10-01',
    dateTo: TODAY,
    group: 'item',
    ordering: '-profit',
    q: '',
    page: 1,
  });
  expect(profitQueryFromFilters(filters)).toBe('');
});

it('round-trips a link an owner sends: last quarter, by customer, losses first, searched', () => {
  const qs = 'period=lastQuarter&by=party&sort=profit&q=ram&page=2';
  const filters = profitFiltersFromQuery(new URLSearchParams(qs), TODAY);
  expect(filters).toMatchObject({ preset: 'lastQuarter', group: 'party', ordering: 'profit' });
  expect(filters.dateFrom).toBe('2026-07-01'); // October is in Q3, so last quarter is July–September
  expect(profitQueryFromFilters(filters)).toBe(qs);
});

it('falls back rather than asking the server for a view or a sort it refuses', () => {
  const filters = profitFiltersFromQuery(new URLSearchParams('by=supplier&sort=cost'), TODAY);
  expect(filters.ordering).toBe('-profit');
  expect(filters.group).toBe('item');
});

it('sends the server its own parameter names, and the search only when there is one', () => {
  const filters = profitFiltersFromQuery(new URLSearchParams('by=bill'), TODAY);
  expect(profitPath(filters)).toBe(
    '/reports/profit?group=bill&date_from=2026-10-01&date_to=2026-10-06&ordering=-profit'
  );
});

it('maps the grid header to the one ordering the server takes, both ways', () => {
  expect(sortOf('-margin')).toEqual({ columnId: 'margin', direction: 'desc' });
  expect(sortOf('name')).toEqual({ columnId: 'name', direction: 'asc' });
  expect(orderingOf('sale_value', 'asc')).toBe('sale_value');
  expect(orderingOf('profit', 'desc')).toBe('-profit');
  expect(orderingOf('cost', 'desc')).toBe('-profit');
});

it('opens the item, the khata or the bill — and nothing for the catch-all or a category', () => {
  expect(profitRowHref('item', row({}))).toBe('/items/x1');
  expect(profitRowHref('party', row({}))).toBe('/parties/x1');
  expect(profitRowHref('bill', row({}))).toBe('/sales/invoices/x1');
  expect(profitRowHref('category', row({}))).toBeNull();
  expect(profitRowHref('party', row({ id: null }))).toBeNull();
  expect(isLoss('-20.00')).toBe(true);
  expect(isLoss('0.00')).toBe(false);
});
