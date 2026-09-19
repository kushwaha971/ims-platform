import { activityView, balanceView, contactLine, partyTotals } from './partyDisplay';
import { orderingFor, sortFromOrdering } from './partyListSort';

import type { Party } from '../types/party.types';

const party = (overrides: Partial<Party>): Party => ({
  id: 'p1',
  name: 'Ramesh Traders',
  displayCode: 'C-001',
  mobile: '+919876543210',
  isCustomer: true,
  isSupplier: false,
  balance: '0.00',
  status: 'active',
  lastActivityAt: null,
  ...overrides,
});

const NOW = Date.parse('2026-09-19T09:00:00Z');
const daysAgo = (days: number): string => new Date(NOW - days * 86_400_000).toISOString();

describe('balanceView', () => {
  it('is neutral at zero — a settled party is not a red party', () => {
    expect(balanceView('0.00')).toMatchObject({ tone: 'neutral', sign: 'none' });
  });

  it('is the receivable family when they owe the merchant, and the payable family when they do not', () => {
    expect(balanceView('2800.00').labelId).toBe('parties.list.balance.receivable');
    expect(balanceView('-900.00').labelId).toBe('parties.list.balance.payable');
  });

  it('never signs a balance — the direction is the label’s job (§23.2.6 rule 3)', () => {
    expect(balanceView('-900.00').sign).toBe('none');
  });
});

describe('activityView — how stale, not when', () => {
  it('names today and yesterday rather than making the reader subtract', () => {
    expect(activityView(daysAgo(0), NOW).labelId).toBe('parties.list.activity.today');
    expect(activityView(daysAgo(1), NOW).labelId).toBe('parties.list.activity.yesterday');
  });

  it('counts days up to a month, then months', () => {
    expect(activityView(daysAgo(12), NOW)).toEqual({
      labelId: 'parties.list.activity.days',
      values: { count: 12 },
    });
    expect(activityView(daysAgo(70), NOW)).toEqual({
      labelId: 'parties.list.activity.months',
      values: { count: 2 },
    });
  });

  it('says so when a party has no entries, and survives an unparseable timestamp', () => {
    expect(activityView(null, NOW).labelId).toBe('parties.list.activity.never');
    expect(activityView('not-a-date', NOW).labelId).toBe('parties.list.activity.never');
  });
});

describe('partyTotals — two sums, never one net figure', () => {
  it('sums the two directions separately and keeps both a magnitude', () => {
    expect(
      partyTotals([
        party({ balance: '2800.00' }),
        party({ balance: '-900.00' }),
        party({ balance: '0.00' }),
        party({ balance: '124300.50' }),
      ])
    ).toEqual({ receivable: '127100.50', payable: '900.00' });
  });

  it('is zero for an empty list rather than undefined', () => {
    expect(partyTotals([])).toEqual({ receivable: '0.00', payable: '0.00' });
  });

  it('stays a decimal STRING through the arithmetic (R-TS-7)', () => {
    const totals = partyTotals([party({ balance: '0.10' }), party({ balance: '0.20' })]);
    expect(totals.receivable).toBe('0.30');
  });
});

describe('contactLine', () => {
  it('joins what the party has and omits what it does not', () => {
    expect(contactLine(party({}))).toBe('C-001 · +919876543210');
    expect(contactLine(party({ mobile: null }))).toBe('C-001');
    expect(contactLine(party({ displayCode: null, mobile: null }))).toBe('');
  });
});

describe('the sort ⇄ ordering translation', () => {
  it('round-trips every sortable column', () => {
    for (const columnId of ['name', 'balance', 'activity']) {
      for (const direction of ['asc', 'desc'] as const) {
        expect(sortFromOrdering(orderingFor({ columnId, direction }))).toEqual({
          columnId,
          direction,
        });
      }
    }
  });

  it('maps the list default to the staleness column, newest first', () => {
    expect(sortFromOrdering('-last_activity_at')).toEqual({
      columnId: 'activity',
      direction: 'desc',
    });
  });

  it('refuses a column the server cannot order by', () => {
    expect(orderingFor({ columnId: 'status', direction: 'asc' })).toBe('');
    expect(sortFromOrdering('gstin')).toBeNull();
  });
});
