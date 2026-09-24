import type * as ReactModule from 'react';

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { InvoicesListPageContent } from './InvoicesListPageContent';

import type { InvoiceListQuery } from '../api/salesService';
import type { InvoiceListPage, InvoiceListRow } from '../types/sales.types';

/**
 * SAL-08 on screen: content → hook → thunk → service, with the service stubbed
 * at the module boundary. As on the expenses list, what is asserted is that the
 * tab on screen is the question ASKED (PTY-02's chips lit up and sent nothing),
 * and that the tiles are the server's totals over the filtered set.
 */
jest.mock('../api/salesService');

const mockReplace = jest.fn();
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
    useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), prefetch: jest.fn() }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)),
    usePathname: () => '/sales/invoices',
  };
});

const service = jest.requireMock('../api/salesService') as { listInvoices: jest.Mock };

const RAMESH: InvoiceListRow = {
  id: 'd2',
  kind: 'invoice',
  number: 'INV/26-27/0002',
  status: 'issued',
  party: { id: 'p1', name: 'Ramesh Traders' },
  walkInName: null,
  walkInMobileMasked: null,
  documentDate: '2026-09-24',
  dueOn: '2026-10-09',
  grandTotal: '112.00',
  amountPaid: '0.00',
  amountDue: '112.00',
  isOverdue: false,
  createdBy: { id: 'u1', name: 'Owner' },
} as InvoiceListRow;

const page = (rows: readonly InvoiceListRow[]): InvoiceListPage => ({
  rows,
  page: 1,
  pageSize: 25,
  total: rows.length,
  totals: {
    count: rows.length,
    grandTotal: rows.length ? '112.00' : '0.00',
    amountDue: rows.length ? '112.00' : '0.00',
  },
  tabs: { all: 1, unpaid: 1, overdue: 0, paid: 0, draft: 0, void: 0 },
});

const signIn = (permissions: readonly PermissionCode[]): void => {
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
      enabledModules: ['sales', 'parties'],
      version: 1,
    })
  );
};

const lastAsked = (): InvoiceListQuery => {
  const calls = service.listInvoices.mock.calls as [InvoiceListQuery][];
  const last = calls[calls.length - 1];
  if (!last) throw new Error('no list request was made');
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
  service.listInvoices.mockImplementation(async (query: InvoiceListQuery) =>
    page(query.tab === 'paid' ? [] : [RAMESH])
  );
});

it('lists this financial year and shows the server totals', async () => {
  // The tiles are meta.totals over the filtered set, not a sum of the page.
  signIn(['sales.invoice.read', 'sales.invoice.write']);
  renderWithProviders(<InvoicesListPageContent />);
  expect((await screen.findAllByText(/Ramesh Traders/)).length).toBeGreaterThan(0);
  expect(screen.getByText('Billed')).toBeInTheDocument();
  expect(screen.getAllByText('₹112.00').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByRole('link', { name: /New bill/ })).toBeInTheDocument();
  expect(lastAsked()).toMatchObject({ tab: 'all', dateFrom: expect.stringMatching(/-04-01$/) });
});

it('asks the server for paid bills when the Paid tab is chosen', async () => {
  signIn(['sales.invoice.read']);
  renderWithProviders(<InvoicesListPageContent />);
  await screen.findAllByText(/Ramesh Traders/);
  await userEvent.click(screen.getByRole('tab', { name: /Paid/ }));
  await waitFor(() => expect(lastAsked().tab).toBe('paid'));
  expect(mockSearch).toBe('tab=paid');
});

it('offers New bill only to a role that can write', async () => {
  // Hidden, not disabled (§19.7.5): a disabled button invites a support call.
  signIn(['sales.invoice.read']);
  renderWithProviders(<InvoicesListPageContent />);
  await screen.findAllByText(/Ramesh Traders/);
  expect(screen.queryByRole('link', { name: /New bill/ })).not.toBeInTheDocument();
});

it('tells a member without access so, and asks nothing', () => {
  signIn([]);
  renderWithProviders(<InvoicesListPageContent />);
  expect(screen.getByText('Bills are not available')).toBeInTheDocument();
  expect(service.listInvoices).not.toHaveBeenCalled();
});
