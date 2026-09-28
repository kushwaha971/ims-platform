import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import { PurchaseBillEditorPageContent } from './PurchaseBillEditorPageContent';

import type { PurchaseBill, PurchaseBillEnvelope } from '../types/purchase.types';

/**
 * PUR-01 on screen. The shop's context (GST type, rates by date) comes from
 * two other features' services, stubbed at the module boundary. What these
 * protect: the preview a merchant watches is the §17.7.0 figure; Record saves
 * the draft and then records it with the version it read and an
 * Idempotency-Key (BR-13); a duplicate supplier invoice 409 puts the
 * "Already recorded as …" line with its link under the number (FR-7); and a
 * composition shop is never offered ITC (FR-11).
 */
jest.mock('../api/purchaseBillService');
const mockProfile = { gstType: 'regular', stateCode: '27', businessType: 'retail' };
jest.mock('../../business-profile/api/businessProfileService', () => ({
  fetchTenant: jest.fn(async () => mockProfile),
}));
jest.mock('../../inventory/api/mastersService', () => ({
  listTaxRates: jest.fn(async () => [
    {
      code: 'GST5',
      name: 'GST 5%',
      rate: '5.000',
      cessRate: '0.000',
      effectiveTo: null,
      isCurrent: true,
    },
  ]),
}));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/purchases/bills/b1/edit',
}));

const service = jest.requireMock('../api/purchaseBillService') as {
  getPurchaseBill: jest.Mock;
  updatePurchaseBill: jest.Mock;
  recordPurchaseBill: jest.Mock;
};

const line = (over: Partial<PurchaseBill['lines'][number]>): PurchaseBill['lines'][number] => ({
  id: 'l1',
  lineNo: 1,
  itemId: 'rice',
  description: 'Rice',
  hsnSac: null,
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
  inboundUnitCost: null,
  trackStock: true,
  ...over,
});

const DRAFT: PurchaseBill = {
  id: 'b1',
  number: null,
  fyLabel: '2026-27',
  status: 'draft',
  version: 3,
  party: {
    id: 'p1',
    name: 'Agro Traders',
    gstin: null,
    mobile: null,
    stateCode: '27',
    creditDays: 15,
  },
  partySnapshot: null,
  supplierInvoiceNumber: 'AT/778',
  supplierInvoiceDate: null,
  documentDate: '2026-09-18',
  dueOn: null,
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
    line({}),
    line({
      id: 'l2',
      lineNo: 2,
      itemId: 'sugar',
      description: 'Sugar',
      qty: '50.000',
      unitCode: 'KGS',
      unitCost: '38.0000',
      discountType: 'percent',
      discountValue: '2.00',
    }),
  ],
  notes: '',
  ledgerEntryId: null,
  payments: [],
  createdBy: null,
  recordedAt: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  updatedAt: '2026-09-18T10:00:00Z',
};

const envelope = (
  bill: PurchaseBill,
  partyBalance: string | null = null
): PurchaseBillEnvelope => ({
  bill,
  warnings: [],
  partyBalance,
  payment: null,
  releasedPayments: [],
});

const signIn = (
  permissions: readonly PermissionCode[],
  modules: readonly ModuleCode[] = ['purchases', 'parties', 'inventory']
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

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.gstType = 'regular';
  store.dispatch(resetAllFeatureState());
  service.getPurchaseBill.mockResolvedValue(envelope(DRAFT));
  service.updatePurchaseBill.mockResolvedValue(envelope({ ...DRAFT, version: 4 }));
  signIn([
    'purchases.bill.read',
    'purchases.bill.write',
    'parties.party.read',
    'inventory.item.read',
  ]);
});

it('previews the §17.7.0 bill at ₹2,921.00 from the draft it opened', async () => {
  renderWithProviders(<PurchaseBillEditorPageContent documentId="b1" />);
  expect(await screen.findByTestId('purchase-grand-total')).toHaveTextContent('₹2,921.00');
  expect(screen.getByTestId('purchase-supplier')).toHaveTextContent('Agro Traders');
  expect(screen.getByText('Input tax credit')).toBeInTheDocument();
});

it('saves, then records with the version read and an Idempotency-Key, then opens the bill', async () => {
  service.recordPurchaseBill.mockResolvedValue(
    envelope(
      {
        ...DRAFT,
        number: 'PB/26-27/0001',
        status: 'recorded',
        version: 5,
        partySnapshot: { name: 'Agro Traders', gstin: null, stateCode: '27', mobile: null },
      },
      '-2921.00'
    )
  );
  renderWithProviders(<PurchaseBillEditorPageContent documentId="b1" />);
  await userEvent.click(await screen.findByTestId('purchase-record'));
  await waitFor(() => expect(service.recordPurchaseBill).toHaveBeenCalled());
  const [id, body, key] = service.recordPurchaseBill.mock.calls[0] as [
    string,
    { version: number },
    string,
  ];
  expect(id).toBe('b1');
  expect(body).toEqual({ version: 4 });
  expect(key).toMatch(/.{8,}/);
  expect(service.updatePurchaseBill.mock.calls[0]?.[1]).toMatchObject({
    version: 3,
    supplier_invoice_number: 'AT/778',
  });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/purchases/bills/b1'));
});

it('puts the duplicate supplier invoice under the number, with a link to the bill (FR-7)', async () => {
  service.recordPurchaseBill.mockRejectedValue({
    code: 'duplicate_supplier_invoice',
    message: 'Already recorded as PB/26-27/0003 on 12/08/2026.',
    details: { existing: { id: 'b0', number: 'PB/26-27/0003', document_date: '2026-08-12' } },
    requestId: null,
    status: 409,
  });
  renderWithProviders(<PurchaseBillEditorPageContent documentId="b1" />);
  await userEvent.click(await screen.findByTestId('purchase-record'));
  const warning = await screen.findByTestId('duplicate-warning');
  expect(warning).toHaveTextContent('Already recorded as PB/26-27/0003 on 12/08/2026.');
  expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute(
    'href',
    '/purchases/bills/b0'
  );
  expect(mockPush).not.toHaveBeenCalled();
});

const RECORDED = {
  ...DRAFT,
  number: 'PB/26-27/0001',
  status: 'recorded' as const,
  version: 5,
  partySnapshot: { name: 'Agro Traders', gstin: null, stateCode: '27', mobile: null },
};

const signInPayer = (): void =>
  signIn(
    [
      'purchases.bill.read',
      'purchases.bill.write',
      'parties.party.read',
      'inventory.item.read',
      'payments.payment.read',
      'payments.payment.write',
    ],
    ['purchases', 'parties', 'inventory', 'payments']
  );

it('asks "Paid now?" at Record and sends the money with the record call (PUR-01 FR-6h)', async () => {
  /** PUR-02 AC-3 path — the sheet defaults to the whole bill in cash; confirming sends
   *  PAY-01's `mode_breakup` dated with the bill ON the record call (one transaction on the
   *  server), and the toast names what was paid. */
  signInPayer();
  service.recordPurchaseBill.mockResolvedValue({
    ...envelope({ ...RECORDED, status: 'paid' }, '0.00'),
    payment: { paymentId: 'pay1', number: 'PAYOUT/26-27/0001', amount: '2921.00' },
  });
  renderWithProviders(<PurchaseBillEditorPageContent documentId="b1" />);
  await userEvent.click(await screen.findByTestId('purchase-record'));
  const confirm = await screen.findByTestId('purchase-paid-now-confirm');
  expect(confirm).toHaveTextContent('Paid ₹2,921.00 · Record');
  expect(service.recordPurchaseBill).not.toHaveBeenCalled();
  await userEvent.click(confirm);
  await waitFor(() => expect(service.recordPurchaseBill).toHaveBeenCalled());
  const [, body] = service.recordPurchaseBill.mock.calls[0] as [string, Record<string, unknown>];
  expect(body).toEqual({
    version: 4,
    payment: {
      payment_date: '2026-09-18',
      mode_breakup: [{ mode: 'cash', amount: '2921.00', reference: '' }],
    },
  });
  await waitFor(() =>
    expect(store.getState().snackbar.id).toBe('purchases.editor.recordedSettled')
  );
  expect(mockPush).toHaveBeenCalledWith('/purchases/bills/b1');
});

it('"Pay later" records the bill on credit with no payment (PUR-01 FR-6h)', async () => {
  signInPayer();
  service.recordPurchaseBill.mockResolvedValue(envelope(RECORDED, '-2921.00'));
  renderWithProviders(<PurchaseBillEditorPageContent documentId="b1" />);
  await userEvent.click(await screen.findByTestId('purchase-record'));
  await userEvent.click(await screen.findByTestId('purchase-pay-later'));
  await waitFor(() => expect(service.recordPurchaseBill).toHaveBeenCalled());
  expect(service.recordPurchaseBill.mock.calls[0]?.[1]).toEqual({ version: 4 });
  await waitFor(() => expect(store.getState().snackbar.id).toBe('purchases.editor.recorded'));
});

it('never opens the "Paid now" sheet for a role that cannot pay suppliers', async () => {
  /** The default sign-in has no payments write: Record goes straight to the server, and the
   *  test above ('saves, then records…') is the proof that the body carries no payment. */
  service.recordPurchaseBill.mockResolvedValue(envelope(RECORDED, '-2921.00'));
  renderWithProviders(<PurchaseBillEditorPageContent documentId="b1" />);
  await userEvent.click(await screen.findByTestId('purchase-record'));
  await waitFor(() => expect(service.recordPurchaseBill).toHaveBeenCalled());
  expect(screen.queryByTestId('purchase-paid-now-confirm')).not.toBeInTheDocument();
});

it('never offers input tax credit to a composition shop (FR-11)', async () => {
  mockProfile.gstType = 'composition';
  renderWithProviders(<PurchaseBillEditorPageContent documentId="b1" />);
  expect(await screen.findByTestId('purchase-grand-total')).toHaveTextContent('₹2,921.00');
  expect(screen.queryByText('Input tax credit')).not.toBeInTheDocument();
  expect(screen.getAllByText(/CGST \(cost\)/).length).toBeGreaterThan(0);
});
