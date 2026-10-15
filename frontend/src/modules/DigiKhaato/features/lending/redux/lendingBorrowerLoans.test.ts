import { store } from 'src/redux/store';

import * as service from '../api/lendingService';

import { fetchLendingLoans } from './lendingThunk';

import type { LoanRow } from '../types/lending.types';

jest.mock('../api/lendingService', () => ({
  ...jest.requireActual('../api/lendingService'),
  listLoans: jest.fn(),
}));

it('loads later pages on the borrower workspace so every loan can be chosen there', async () => {
  jest
    .mocked(service.listLoans)
    .mockResolvedValueOnce({
      rows: [{ id: 'first' } as LoanRow],
      total: 2,
      totalPages: 2,
      page: 1,
      hasLoans: true,
    })
    .mockResolvedValueOnce({
      rows: [{ id: 'second' } as LoanRow],
      total: 2,
      totalPages: 2,
      page: 2,
      hasLoans: true,
    });
  const result = await store
    .dispatch(fetchLendingLoans({ status: 'all', borrower: 'b1' }))
    .unwrap();
  expect(result.rows.map((row) => row.id)).toEqual(['first', 'second']);
  expect(service.listLoans).toHaveBeenNthCalledWith(
    2,
    { status: 'all', borrower: 'b1', page: '2' },
    expect.anything()
  );
});
