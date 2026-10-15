import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/lendingService';

import { NewLoanPageContent } from './NewLoanPageContent';

/**
 * QA B6 — a file charge above the loan (or instalments that do not repay it) made the
 * preview say "Please check the highlighted fields." with nothing highlighted, and Give
 * stayed disabled. The server's own reasons were in the refusal's details and were
 * dropped; they now land under the field they name and in the preview panel.
 */
jest.mock('../api/lendingService', () => ({
  ...jest.requireActual('../api/lendingService'),
  previewLoan: jest.fn(),
  listRoutes: jest.fn(async () => []),
  searchBorrowers: jest.fn(async () => []),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/lending/loans/new',
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  const tenant = { id: 't1', name: 'Shree Finance', timezone: 'Asia/Kolkata', role: 'owner' };
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'o@lend.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: tenant,
      tenants: [tenant],
      permissions: ['lending.loan.read', 'lending.loan.create'] as PermissionCode[],
      enabledModules: ['lending'],
      version: 1,
    })
  );
});

it('names the field and the rule when the preview is refused', async () => {
  jest.mocked(service.previewLoan).mockRejectedValue({
    code: 'validation_error',
    message: 'Please check the highlighted fields.',
    details: { deductions: ['The deductions must be less than the amount lent.'] },
    requestId: null,
    status: 400,
    warnings: [],
  });
  renderWithProviders(<NewLoanPageContent />);
  await userEvent.type(await screen.findByLabelText('Loan amount'), '1000');
  await waitFor(
    () =>
      expect(screen.getAllByText('The deductions must be less than the amount lent.').length).toBe(
        2
      ),
    { timeout: 3000 }
  );
  expect(screen.queryByText('Please check the highlighted fields.')).not.toBeInTheDocument();
});

it('prefills a new borrower from one explicitly selected phone contact', async () => {
  const select = jest.fn().mockResolvedValue([{ name: ['Phone Borrower'], tel: ['98765 43210'] }]);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select } });
  try {
    renderWithProviders(<NewLoanPageContent />);
    await userEvent.click(await screen.findByRole('button', { name: 'Choose phone contact' }));
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toHaveValue('Phone Borrower'));
    expect(screen.getByLabelText(/^Mobile/)).toHaveValue('9876543210');
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: false });
  } finally {
    Reflect.deleteProperty(window, 'isSecureContext');
    Reflect.deleteProperty(navigator, 'contacts');
  }
});
