import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/lendingService';

import { CollectDialog } from './CollectDialog';

jest.mock('../api/lendingService', () => ({
  ...jest.requireActual('../api/lendingService'),
  previewCollection: jest.fn(),
  collect: jest.fn(),
}));

it('shows the overpayment refusal once after preview and Save both refuse it (QA B15)', async () => {
  // The preview warning and the server field error used to repeat the same refusal.
  store.dispatch(resetAllFeatureState());
  const error = {
    code: 'collection_over_payoff',
    message: 'Only ₹1,200.00 is left to collect.',
    details: {},
    requestId: 'test-collection',
    status: 409,
  };
  jest.mocked(service.previewCollection).mockRejectedValue(error);
  jest.mocked(service.collect).mockRejectedValue(error);
  const user = userEvent.setup();
  renderWithProviders(
    <CollectDialog
      loanId="loan1"
      name="Borrower"
      number="LN-0001"
      suggested=""
      onClose={jest.fn()}
    />
  );
  await user.type(screen.getByRole('textbox', { name: 'Amount received' }), '5000');
  expect(await screen.findByText(error.message)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save collection' }));
  await waitFor(() => expect(service.collect).toHaveBeenCalled());
  await waitFor(() => expect(screen.getAllByText(error.message)).toHaveLength(1));
});
