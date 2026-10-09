import { createAgingColumns } from './AgingColumns';

import type { AgingRow } from '../types/aging.types';

/**
 * The aging list's phone card (audit A16). Pinned: when the whole balance sits
 * in one bucket the caption says only how old it is, because the amount is
 * already the card's figure on the right; when it is spread, the caption still
 * names how much is in the oldest bucket.
 */
const t = ((id: string, params?: Record<string, unknown>) =>
  params ? `${id}:${JSON.stringify(params)}` : id) as never;

const meta = (row: AgingRow) => {
  const age = createAgingColumns({ t, kind: 'receivable', asOf: '2026-10-09', tier: 'cards' }).find(
    (column) => column.id === 'age'
  );
  return age?.cell?.(row);
};

const row = (amounts: Partial<AgingRow['amounts']>): AgingRow => ({
  partyId: 'p1',
  partyName: 'Anil Kumar',
  amounts: {
    '0_30': '0.00',
    '31_60': '0.00',
    '61_90': '0.00',
    '90_plus': '0.00',
    total: '0.00',
    ...amounts,
  },
});

describe('the aging card caption', () => {
  it('names only the bucket when the whole balance is in it', () => {
    expect(meta(row({ '31_60': '4150.00', total: '4150.00' }))).toBe('ledger.aging.bucket.31_60');
  });

  it('still says how much is in the oldest bucket when the balance is spread', () => {
    expect(String(meta(row({ '0_30': '1000.00', '31_60': '500.00', total: '1500.00' })))).toContain(
      'ledger.aging.oldest'
    );
  });
});
