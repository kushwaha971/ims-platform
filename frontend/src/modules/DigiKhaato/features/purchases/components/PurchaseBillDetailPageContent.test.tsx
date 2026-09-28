import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import { PurchaseBillDetailPageContent } from './PurchaseBillDetailPageContent';

import type { PurchaseBill, PurchaseBillEnvelope } from '../types/purchase.types';

/**
 * PUR-04 on screen. What these protect: the consequences are on the dialog
 * BEFORE a reason is typed (AC-2), there is no "Average cost unchanged" line
 * (CR-2026-09-24-INV-A made it false), goods already sold are refused IN the
 * dialog with the item and how far it would go (AC-4), a void shows the Void
 * banner with the reason (AC-3), and staff never see Void (§12).
 */
jest.mock('../api/purchaseBillService');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/purchases/bills/b1',
}));

const service = jest.requireMock('../api/purchaseBillService') as {
  getPurchaseBill: jest.Mock;
  voidPurchaseBill: jest.Mock;
};

const BILL: PurchaseBill = {
  id: 'b1',
  number: 'PB/26-27/0007',
  fyLabel: '2026-27',
  status: 'recorded',
  version: 2,
  party: {
    id: 'p1',
    name: 'Agro Traders',
    gstin: null,
    mobile: null,
    stateCode: '27',
    creditDays: 15,
  },
  partySnapshot: { name: 'Agro Traders', gstin: null, stateCode: '27', mobile: null },
  supplierInvoiceNumber: 'AT/778',
  supplierInvoiceDate: '2026-09-17',
  documentDate: '2026-09-18',
  dueOn: '2026-10-03',
  isInterState: false,
  reverseCharge: false,
  itcEligible: true,
  discountType: null,
  discountValue: null,
  roundOffEnabled: true,
  subtotal: '2782.00',
  discountAmount: '0.00',
  taxableTotal: '2782.00',
  cgstTotal: '69.55',
  sgstTotal: '69.55',
  igstTotal: '0.00',
  cessTotal: '0.00',
  roundOff: '-0.10',
  grandTotal: '2921.00',
  amountPaid: '0.00',
  amountDue: '2921.00',
  lines: [
    {
      id: 'l1',
      lineNo: 1,
      itemId: 'rice',
      description: 'Rice',
      hsnSac: '1006',
      qty: '20.000',
      unitCode: 'NOS',
      unitCost: '46.0000',
      discountType: null,
      discountValue: null,
      discountAmount: '0.00',
      taxableValue: '920.00',
      taxCode: 'GST5',
      taxRate: '5.000',
      cgst: '23.00',
      sgst: '23.00',
      igst: '0.00',
      cess: '0.00',
      lineTotal: '966.00',
      inboundUnitCost: '46.0000',
      trackStock: true,
    },
  ],
  notes: '',
  ledgerEntryId: 'e1',
  payments: [],
  createdBy: { id: 'u1', name: 'Owner' },
  recordedAt: '2026-09-18T10:00:00Z',
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  updatedAt: '2026-09-18T10:00:00Z',
};

const envelope = (
  bill: PurchaseBill,
  over: Partial<PurchaseBillEnvelope> = {}
): PurchaseBillEnvelope => ({
  bill,
  warnings: [],
  partyBalance: null,
  payment: null,
  releasedPayments: [],
  ...over,
});

const signIn = (
  permissions: readonly PermissionCode[],
  modules: readonly ModuleCode[] = ['purchases']
): void => {
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
      activeTenant: { id: 't1', name: 'Sharma General Store', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Sharma General Store', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [...modules],
      version: 1,
    })
  );
};

const OWNER: PermissionCode[] = [
  'purchases.bill.read',
  'purchases.bill.write',
  'purchases.bill.void',
];

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetAllFeatureState());
  service.getPurchaseBill.mockResolvedValue(envelope(BILL));
});

it('lists what the void will do before a reason is typed, and never promises the average', async () => {
  signIn(OWNER);
  renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  await userEvent.click(await screen.findByRole('button', { name: /Void bill/ }));
  const consequences = await screen.findByTestId('purchase-void-consequences');
  expect(consequences).toHaveTextContent('Stock: −20 NOS Rice');
  expect(consequences).toHaveTextContent('Khata: ₹2,921.00 less to give Agro Traders');
  expect(document.body).not.toHaveTextContent(/average cost unchanged/i);
});

it('shows the refusal in the dialog when the goods were already sold (AC-4)', async () => {
  signIn(OWNER);
  // Services reject with the normalised ApiErrorShape (the interceptor's job).
  service.voidPurchaseBill.mockRejectedValue({
    code: 'insufficient_stock',
    message: 'Not enough stock.',
    details: {
      lines: [{ item_name: 'Rice', requested: '20.000', available: '12.000', unit_code: 'NOS' }],
    },
    requestId: null,
    status: 409,
  });
  renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  await userEvent.click(await screen.findByRole('button', { name: /Void bill/ }));
  await userEvent.type(screen.getByLabelText(/Reason/), 'Entered twice');
  await userEvent.click(screen.getByTestId('purchase-void-confirm'));
  expect(await screen.findByText(/Rice would go to −8 NOS/)).toBeInTheDocument();
  expect(service.voidPurchaseBill).toHaveBeenCalledWith('b1', 'Entered twice');
});

it('shows the Void banner with the reason once voided (AC-3)', async () => {
  signIn(OWNER);
  service.voidPurchaseBill.mockResolvedValue(
    envelope({
      ...BILL,
      status: 'void',
      voidReason: 'Entered twice',
      voidedBy: { id: 'u1', name: 'Owner' },
      voidedAt: '2026-09-25T10:00:00Z',
    })
  );
  renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  await userEvent.click(await screen.findByRole('button', { name: /Void bill/ }));
  await userEvent.type(screen.getByLabelText(/Reason/), 'Entered twice');
  await userEvent.click(screen.getByTestId('purchase-void-confirm'));
  expect(await screen.findByText('This bill is void')).toBeInTheDocument();
  expect(screen.getByText(/Entered twice — by Owner/)).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByTestId('purchase-void-confirm')).not.toBeInTheDocument()
  );
});

it('never offers Void to staff (PUR-04 §12)', async () => {
  signIn(['purchases.bill.read', 'purchases.bill.write']);
  renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  expect(await screen.findByText('Rice')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Void bill/ })).not.toBeInTheDocument();
});

const PAYER: PermissionCode[] = [...OWNER, 'payments.payment.read', 'payments.payment.write'];

it('offers Pay supplier on a bill still owing, and only there (PUR-02 FR-4 / AC-3)', async () => {
  /** Protects the entry point: shown for an unpaid bill to a role that may pay suppliers;
   *  hidden (never disabled) on a PAID bill and for a role without payments write. */
  signIn(PAYER, ['purchases', 'payments']);
  const { unmount } = renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  expect(await screen.findByRole('button', { name: /Pay supplier/ })).toBeInTheDocument();
  unmount();

  store.dispatch(resetAllFeatureState());
  service.getPurchaseBill.mockResolvedValue(
    envelope({ ...BILL, status: 'paid', amountPaid: '2921.00', amountDue: '0.00' })
  );
  signIn(PAYER, ['purchases', 'payments']);
  const paid = renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  expect(await screen.findByText('Rice')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Pay supplier/ })).not.toBeInTheDocument();
  paid.unmount();

  store.dispatch(resetAllFeatureState());
  service.getPurchaseBill.mockResolvedValue(envelope(BILL));
  signIn(OWNER, ['purchases']);
  renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  expect(await screen.findByText('Rice')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Pay supplier/ })).not.toBeInTheDocument();
});

it('lists the supplier payments on the bill, each linked to its voucher (PUR-02 FR-6)', async () => {
  signIn(PAYER, ['purchases', 'payments']);
  service.getPurchaseBill.mockResolvedValue(
    envelope({
      ...BILL,
      status: 'partially_paid',
      amountPaid: '1000.00',
      amountDue: '1921.00',
      payments: [
        {
          id: 'pay1',
          number: 'PAYOUT/26-27/0001',
          paymentDate: '2026-09-18',
          primaryMode: 'cash',
          amount: '1000.00',
          status: 'recorded',
        },
      ],
    })
  );
  renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  const list = await screen.findByTestId('purchase-payments');
  expect(list).toHaveTextContent('PAYOUT/26-27/0001 · 18/09/2026 · ₹1,000.00');
  expect(screen.getByRole('link', { name: 'PAYOUT/26-27/0001' })).toHaveAttribute(
    'href',
    '/payments/pay1'
  );
});

it('says how much stays as advance when a paid bill is voided (PUR-02 BR-4)', async () => {
  /** The void releases the bill's supplier payments; the toast must not read as if the
   *  money vanished with the bill. */
  signIn(OWNER);
  service.voidPurchaseBill.mockResolvedValue(
    envelope(
      { ...BILL, status: 'void', voidReason: 'Entered twice' },
      { releasedPayments: [{ paymentId: 'pay1', number: 'PAYOUT/26-27/0001', amount: '600.00' }] }
    )
  );
  renderWithProviders(<PurchaseBillDetailPageContent id="b1" />);
  await userEvent.click(await screen.findByRole('button', { name: /Void bill/ }));
  await userEvent.type(screen.getByLabelText(/Reason/), 'Entered twice');
  await userEvent.click(screen.getByTestId('purchase-void-confirm'));
  await waitFor(() => expect(store.getState().snackbar.id).toBe('purchases.void.doneAdvance'));
  expect(store.getState().snackbar.params).toEqual({
    number: 'PB/26-27/0007',
    amount: '₹600.00',
  });
});
