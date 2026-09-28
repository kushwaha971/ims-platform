import type * as ReactModule from 'react';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import { PurchaseRegisterPageContent } from './PurchaseRegisterPageContent';
import { SalesRegisterPageContent } from './SalesRegisterPageContent';

import type {
  RegisterPage,
  RegisterQuery,
  RegisterRow,
  RegisterTotals,
} from '../types/taxReports.types';

/**
 * RPT-03 / RPT-04 on screen: content → hook → thunk → service, the service
 * stubbed at the module boundary. What is asserted: the totals are the
 * SERVER's (deliberately not the page's sum), a credit note reads as negative
 * and badged, a chip is a question ASKED (PTY-02's chips lit up and sent
 * nothing), export is hidden without `reports.export`, and a member without
 * the reads is told so and nothing is fetched.
 */
jest.mock('../api/taxReportsService');

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearch = '';
const mockUrlListeners = new Set<() => void>();
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
  const subscribe = (listener: () => void) => {
    mockUrlListeners.add(listener);
    return () => {
      mockUrlListeners.delete(listener);
    };
  };
  const read = () => mockSearch;
  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      prefetch: jest.fn(),
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)),
    usePathname: () => '/reports/sales-register',
  };
});

const service = jest.requireMock('../api/taxReportsService') as { getRegister: jest.Mock };

const row = (over: Partial<RegisterRow>): RegisterRow => ({
  id: 'r1',
  documentId: 'd1',
  partyId: 'p1',
  isB2b: true,
  isWalkIn: false,
  date: '2026-09-05',
  number: 'INV/26-27/0041',
  kind: 'invoice',
  status: 'issued',
  partyName: 'Ramesh Traders',
  partyGstin: '27AAACR5055K1Z7',
  supplierInvoiceNumber: '',
  supplierInvoiceDate: null,
  isInterState: false,
  reverseCharge: false,
  itcEligible: false,
  taxableTotal: '1688.57',
  cgst: '42.21',
  sgst: '42.22',
  igst: '0.00',
  cess: '0.00',
  roundOff: '-1.00',
  grandTotal: '1772.00',
  amountPaid: '0.00',
  amountDue: '1772.00',
  againstNumber: '',
  lineNo: null,
  itemName: '',
  hsnSac: '',
  qty: '',
  unit: '',
  taxRate: '',
  taxableValue: '1688.57',
  unitCost: null,
  ...over,
});

const TOTALS: RegisterTotals = {
  count: 12,
  countByKind: { invoice: 11, bill_of_supply: 0, credit_note: 1 },
  taxableTotal: '99999.99',
  cgst: '10.00',
  sgst: '10.00',
  igst: '0.00',
  cess: '0.00',
  tax: '20.00',
  roundOff: '0.00',
  grandTotal: '123456.00',
  amountPaid: '0.00',
  amountDue: '4321.00',
  b2b: { count: 2, taxable: '1244.94', tax: '62.25' },
  b2c: { count: 10, taxable: '855.00', tax: '42.75' },
  itcEligible: null,
  rcmTax: null,
  notClaimableTax: null,
};

const page = (rows: readonly RegisterRow[], totals = TOTALS): RegisterPage => ({
  rows,
  totals,
  page: 1,
  pageSize: 100,
  total: rows.length,
});

const signIn = (permissions: readonly PermissionCode[], modules: readonly ModuleCode[]): void => {
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

const lastAsked = (): RegisterQuery => {
  const calls = service.getRegister.mock.calls as [RegisterQuery][];
  const last = calls[calls.length - 1];
  if (!last) throw new Error('no register request was made');
  return last[0];
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = '';
  mockReplace.mockImplementation((url: string) => {
    mockSearch = url.replace(/^\?/, '');
    mockUrlListeners.forEach((listener) => listener());
  });
  store.dispatch(resetAllFeatureState());
  service.getRegister.mockImplementation(async () =>
    page([
      row({}),
      row({
        id: 'r2',
        documentId: 'd2',
        number: 'CN/26-27/0001',
        kind: 'credit_note',
        taxableTotal: '-443.63',
        grandTotal: '-465.81',
        cgst: '-11.09',
        sgst: '-11.09',
      }),
    ])
  );
});

const SALES_READ: PermissionCode[] = ['reports.basic.read', 'sales.invoice.read'];

it('shows the server totals over the filtered set, not the sum of the page (RPT-03 FR-4)', async () => {
  signIn([...SALES_READ, 'reports.export'], ['reports', 'sales']);
  renderWithProviders(<SalesRegisterPageContent />);
  expect(await screen.findByText('₹99,999.99')).toBeInTheDocument();
  expect(screen.getByText('₹4,321.00')).toBeInTheDocument();
  expect(screen.getByText('in 12 documents')).toBeInTheDocument();
  expect(lastAsked()).toMatchObject({
    book: 'sales',
    filters: { preset: 'thisMonth', level: 'document', status: 'all', includeVoid: false },
  });
  expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument();
});

it('reads a credit note as negative, in the error tone, with its CN badge (§8)', async () => {
  signIn(SALES_READ, ['reports', 'sales']);
  renderWithProviders(<SalesRegisterPageContent />);
  const badge = (await screen.findAllByText(/^CN · CN\/26-27\/0001/))[0];
  expect(badge).toBeInTheDocument();
  // The sign is in the accessible name, never colour alone.
  expect(screen.getAllByText('Less, ₹465.81').length).toBeGreaterThan(0);
});

it('asks the server for unpaid documents when the Unpaid chip is pressed (FR-6)', async () => {
  signIn(SALES_READ, ['reports', 'sales']);
  renderWithProviders(<SalesRegisterPageContent />);
  await screen.findAllByText(/^CN · /);
  const status = screen.getByRole('group', { name: 'Status' });
  await userEvent.click(within(status).getByRole('button', { name: 'Unpaid' }));
  await waitFor(() => expect(lastAsked().filters.status).toBe('unpaid'));
  expect(mockSearch).toBe('status=unpaid');
});

it('switches to line level and back as a request, keeping the period (FR-3)', async () => {
  signIn(SALES_READ, ['reports', 'sales']);
  mockSearch = 'period=lastMonth';
  renderWithProviders(<SalesRegisterPageContent />);
  await screen.findAllByText(/^CN · /);
  await userEvent.click(screen.getByRole('button', { name: 'Lines' }));
  await waitFor(() => expect(lastAsked().filters.level).toBe('line'));
  expect(lastAsked().filters.preset).toBe('lastMonth');
});

it('hides Export from a member without reports.export (staff, RPT-03 §12)', async () => {
  signIn(SALES_READ, ['reports', 'sales']);
  renderWithProviders(<SalesRegisterPageContent />);
  await screen.findAllByText(/^CN · /);
  expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
});

it('opens the document a row names — a credit note on its own route', async () => {
  signIn(SALES_READ, ['reports', 'sales']);
  renderWithProviders(<SalesRegisterPageContent />);
  const [open] = await screen.findAllByRole('button', { name: /Open CN\/26-27\/0001/ });
  await userEvent.click(open as HTMLElement);
  expect(mockPush).toHaveBeenCalledWith('/sales/credit-notes/d2');
});

it('tells a member without the reads so, and asks nothing', () => {
  signIn(['sales.invoice.read'], ['reports', 'sales']);
  renderWithProviders(<SalesRegisterPageContent />);
  expect(screen.getByText('This register is not available')).toBeInTheDocument();
  expect(service.getRegister).not.toHaveBeenCalled();
});

it('shows ITC eligible on the purchase register and asks by the ITC chip (RPT-04 FR-4/FR-6)', async () => {
  signIn(['reports.basic.read', 'purchases.bill.read'], ['reports', 'purchases']);
  service.getRegister.mockImplementation(async () =>
    page([row({ number: 'PB/26-27/0001', itcEligible: true, supplierInvoiceNumber: 'AT/778' })], {
      ...TOTALS,
      itcEligible: { cgst: '450.00', sgst: '450.00', igst: '0.00', cess: '0.00', total: '900.00' },
      rcmTax: '50.00',
      notClaimableTax: '360.00',
    })
  );
  renderWithProviders(<PurchaseRegisterPageContent />);
  expect(await screen.findByText('₹900.00')).toBeInTheDocument();
  expect(screen.getAllByText('To pay').length).toBeGreaterThan(0);
  expect(lastAsked().book).toBe('purchase');
  const itc = screen.getByRole('group', { name: 'ITC' });
  await userEvent.click(within(itc).getByRole('button', { name: 'No ITC' }));
  await waitFor(() => expect(lastAsked().filters.itc).toBe('blocked'));
});

it('renders the register in Hindi from its own catalogue', async () => {
  signIn(SALES_READ, ['reports', 'sales']);
  renderWithProviders(<SalesRegisterPageContent />, { locale: 'hi' });
  expect(await screen.findByRole('heading', { name: 'बिक्री रजिस्टर' })).toBeInTheDocument();
});
