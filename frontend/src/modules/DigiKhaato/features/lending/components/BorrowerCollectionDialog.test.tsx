import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/lendingService';

import { CollectFromBorrowerDialog } from './CollectFromBorrowerDialog';

jest.mock('../api/lendingService', () => ({
  ...jest.requireActual('../api/lendingService'),
  previewCollection: jest.fn(),
  collect: jest.fn(),
  previewBorrowerCollection: jest.fn(),
}));

it('selects one loan inside the borrower collection dialog without using the automatic split', async () => {
  const onClose = jest.fn();
  const onLoanSaved = jest.fn();
  jest
    .mocked(service.previewCollection)
    .mockResolvedValue({ amount: '120.00', remainingAfter: '2280.00', clears: [] });
  jest.mocked(service.collect).mockResolvedValue({
    amount: '120.00',
    receiptNumber: 'RCT-2',
    loanStatus: 'active',
  } as Awaited<ReturnType<typeof service.collect>>);
  renderWithProviders(
    <CollectFromBorrowerDialog
      borrowerId="b1"
      name="Geeta"
      onClose={onClose}
      onLoanSaved={onLoanSaved}
      loans={[
        {
          id: 'l1',
          number: 'LN-0001',
          status: 'active',
          remaining: '1200.00',
          instalmentAmount: '120.00',
          dueToday: '120.00',
          arrears: '0.00',
        },
        {
          id: 'l2',
          number: 'LN-0002',
          status: 'active',
          remaining: '2400.00',
          instalmentAmount: '240.00',
          dueToday: '240.00',
          arrears: '0.00',
        },
      ]}
    />
  );
  await userEvent.click(screen.getByRole('combobox', { name: 'Choose loan' }));
  await userEvent.click(screen.getByRole('option', { name: /LN-0002/ }));
  const amount = screen.getByRole('textbox', { name: 'Amount received' });
  await userEvent.clear(amount);
  await userEvent.type(amount, '120');
  await userEvent.click(screen.getByTestId('lending-collect-save'));
  await waitFor(() =>
    expect(service.collect).toHaveBeenCalledWith(
      'l2',
      expect.objectContaining({ amount: '120.00' }),
      expect.any(String)
    )
  );
  expect(service.previewBorrowerCollection).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onLoanSaved).toHaveBeenCalledWith('l2');
});
