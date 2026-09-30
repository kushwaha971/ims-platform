import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/depositService';

import { DepositPanel } from './DepositPanel';

import type { Deposit } from '../types/deposit.types';

/**
 * A4b (PLT-X02 §7, T-PLT-X02-11) — the deposit panel. It draws nothing (and
 * asks for nothing) for a party the server sent no `depositHeld` for; it offers
 * no money acts to a member who cannot write payments, or on an archived
 * party; and Adjust is one act — one request, however many charges it pays.
 */
jest.mock('../api/depositService', () => ({
  ...jest.requireActual('../api/depositService'),
  listPartyDeposits: jest.fn(),
  applyDeposit: jest.fn(),
  getDeposit: jest.fn(),
}));
jest.mock('src/print/brandingPrintService', () => ({
  getPrintBranding: jest.fn().mockResolvedValue({
    logoUrl: null,
    signatureUrl: null,
    docHeader: '',
    docFooter: '',
    appName: 'YourKhata',
    primaryHex: null,
  }),
}));

const held: Deposit = {
  id: 'd1',
  party: { id: 'p1', name: 'Asha Rao' },
  module: 'library',
  subjectType: 'library_membership',
  subjectId: 's1',
  purpose: 'Library deposit',
  expectedAmount: '500.00',
  receivedAmount: '500.00',
  appliedAmount: '0.00',
  refundedAmount: '0.00',
  heldAmount: '500.00',
  status: 'held',
  note: '',
  version: 2,
  createdAt: '2026-09-29T10:00:00Z',
};

const signIn = (permissions: PermissionCode[]) =>
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Library', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Library', timezone: 'Asia/Kolkata' }],
      permissions,
      enabledModules: ['payments', 'parties'],
      version: 1,
    })
  );

beforeEach(() => {
  jest.mocked(service.listPartyDeposits).mockReset();
  jest.mocked(service.listPartyDeposits).mockResolvedValue({ rows: [held], heldTotal: '500.00' });
  jest.mocked(service.applyDeposit).mockReset();
  signIn(['payments.payment.read', 'payments.payment.write']);
});

it('draws nothing, and asks for nothing, when the server sent no depositHeld', () => {
  const { container } = renderWithProviders(<DepositPanel party={{ id: 'p1' }} readOnly={false} />);
  expect(container).toBeEmptyDOMElement();
  expect(service.listPartyDeposits).not.toHaveBeenCalled();
});

it('lists the deposit with what it holds and the acts a writer may take', async () => {
  renderWithProviders(
    <DepositPanel party={{ id: 'p1', depositHeld: '500.00' }} readOnly={false} />
  );
  const row = await screen.findByTestId('deposit-row');
  expect(within(row).getByText('Library deposit')).toBeInTheDocument();
  expect(within(row).getByText('Held')).toBeInTheDocument();
  expect(within(row).getByTestId('deposit-refund')).toBeInTheDocument();
  // Nothing more to receive, and the khata's copy is given no charges to adjust against.
  expect(within(row).queryByTestId('deposit-receive')).not.toBeInTheDocument();
  expect(within(row).queryByTestId('deposit-apply')).not.toBeInTheDocument();
});

it('offers no money acts to a reader, nor on an archived party', async () => {
  signIn(['payments.payment.read']);
  const { unmount } = renderWithProviders(
    <DepositPanel party={{ id: 'p1', depositHeld: '500.00' }} readOnly={false} />
  );
  expect(await screen.findByTestId('deposit-row')).toBeInTheDocument();
  expect(screen.queryByTestId('deposit-refund')).not.toBeInTheDocument();
  unmount();
  signIn(['payments.payment.read', 'payments.payment.write']);
  renderWithProviders(<DepositPanel party={{ id: 'p1', depositHeld: '500.00' }} readOnly />);
  expect(await screen.findByTestId('deposit-row')).toBeInTheDocument();
  expect(screen.queryByTestId('deposit-refund')).not.toBeInTheDocument();
  expect(screen.getByTestId('deposit-print')).toBeInTheDocument();
});

it('adjusts from the deposit in one request, however many charges it pays', async () => {
  /** PLT-X02 §8 — one act on screen: one dialog, one request (the server writes the pair). */
  const after = { ...held, appliedAmount: '170.00', heldAmount: '330.00', version: 3 };
  jest
    .mocked(service.listPartyDeposits)
    .mockResolvedValueOnce({ rows: [held], heldTotal: '500.00' })
    .mockResolvedValue({ rows: [after], heldTotal: '330.00' });
  jest.mocked(service.applyDeposit).mockResolvedValue({
    deposit: { ...after, receipts: [], applications: [], refunds: [] },
    paymentNumber: 'RCT/26-27/0202',
  });
  const user = userEvent.setup();
  renderWithProviders(
    <DepositPanel
      party={{ id: 'p1', depositHeld: '500.00' }}
      readOnly={false}
      chargesFor={() => [
        { documentType: 'sales_document', documentId: 'a', number: 'FINE/1', due: '120.00' },
        { documentType: 'sales_document', documentId: 'b', number: 'FINE/2', due: '50.00' },
      ]}
    />
  );
  await user.click(await screen.findByTestId('deposit-apply'));
  await user.type(await screen.findByRole('textbox', { name: /Reason/ }), 'Fines');
  await user.click(screen.getByTestId('deposit-apply-confirm'));
  await waitFor(() => expect(service.applyDeposit).toHaveBeenCalledTimes(1));
  const [, values] = jest.mocked(service.applyDeposit).mock.calls[0] ?? [];
  expect(values?.rows.map((row) => row.amount)).toEqual(['120.00', '50.00']);
  // The row swaps from the answer; the total is re-read from the server, not re-summed.
  await waitFor(() => expect(screen.getByText('₹330.00 held')).toBeInTheDocument());
  expect(service.listPartyDeposits).toHaveBeenCalledTimes(2);
});

it('prints the slip alone, signed with the business, then puts the khata back', async () => {
  /** PLT-X02 §8 — the slip is the only thing on paper while it prints: the
   *  portal is marked for print and <body> says a slip is printing. */
  jest.useFakeTimers();
  const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
  jest.mocked(service.getDeposit).mockResolvedValue({
    ...held,
    receipts: [
      {
        id: 'r1',
        number: 'RCT/26-27/0201',
        paymentDate: '2026-09-29',
        amount: '500.00',
        primaryMode: 'cash',
        status: 'recorded',
        opening: false,
      },
    ],
    applications: [],
    refunds: [],
  });
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  renderWithProviders(
    <DepositPanel party={{ id: 'p1', depositHeld: '500.00' }} readOnly={false} />
  );
  await user.click(await screen.findByTestId('deposit-print'));
  const slip = await screen.findByTestId('deposit-slip-print');
  expect(slip).toHaveTextContent('Kumar Library');
  expect(slip).toHaveTextContent('RCT/26-27/0201');
  expect(document.body).toHaveAttribute('data-printing-slip');
  act(() => {
    jest.advanceTimersByTime(60);
  });
  expect(print).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByTestId('deposit-slip-print')).not.toBeInTheDocument());
  expect(document.body).not.toHaveAttribute('data-printing-slip');
  print.mockRestore();
  jest.useRealTimers();
});
