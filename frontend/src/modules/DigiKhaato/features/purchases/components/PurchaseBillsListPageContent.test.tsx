import type * as ReactModule from 'react';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { PurchaseBillsListPageContent } from './PurchaseBillsListPageContent';

import type { PurchaseBillListQuery } from '../api/purchaseBillService';
import type { PurchaseBillListPage, PurchaseBillListRow } from '../types/purchase.types';

/**
 * PUR-03 on screen: content → hook → thunk → service, the service stubbed at
 * the module boundary. What is asserted is that the tab on screen is the
 * question ASKED (PTY-02's chips lit up and sent nothing), and that "To pay"
 * is the server's figure over the filtered set, not a sum of the page.
 */
jest.mock('../api/purchaseBillService');

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
    useRouter: () => ({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      prefetch: jest.fn(),
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)),
    usePathname: () => '/purchases/bills',
  };
});

const service = jest.requireMock('../api/purchaseBillService') as { listPurchaseBills: jest.Mock };

const AGRO: PurchaseBillListRow = {
  id: 'b1',
  number: 'PB/26-27/0001',
  status: 'recorded',
  party: { id: 'p1', name: 'Agro Traders' },
  supplierInvoiceNumber: 'AT/778',
  documentDate: '2026-09-18',
  dueOn: '2026-10-03',
  grandTotal: '2921.00',
  amountPaid: '0.00',
  amountDue: '2921.00',
  isOverdue: false,
};

const page = (rows: readonly PurchaseBillListRow[]): PurchaseBillListPage => ({
  rows,
  page: 1,
  pageSize: 25,
  total: rows.length,
  // Deliberately NOT the page's sum: the tile must show the server's figure.
  totals: { count: 4, grandTotal: '9000.00', amountDue: '4921.00' },
  counts: { all: 4, unpaid: 2, overdue: 0, paid: 1, draft: 1, void: 0 },
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
      enabledModules: ['purchases', 'parties'],
      version: 1,
    })
  );
};

const lastAsked = (): PurchaseBillListQuery => {
  const calls = service.listPurchaseBills.mock.calls as [PurchaseBillListQuery][];
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
  service.listPurchaseBills.mockImplementation(async (query: PurchaseBillListQuery) =>
    page(query.tab === 'paid' ? [] : [AGRO])
  );
});

it('lists this financial year and shows the server payables totals (PUR-03 FR-3)', async () => {
  signIn(['purchases.bill.read', 'purchases.bill.write']);
  renderWithProviders(<PurchaseBillsListPageContent />);
  expect((await screen.findAllByText(/Agro Traders/)).length).toBeGreaterThan(0);
  expect(screen.getByText('To pay', { selector: '*:not(th)' })).toBeInTheDocument();
  expect(screen.getByText('₹4,921.00')).toBeInTheDocument();
  // On a phone (jsdom's width) the tabs are inside the one Filters sheet.
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.getByTestId('filters-button')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /New bill/ })).toBeInTheDocument();
  expect(lastAsked()).toMatchObject({ tab: 'all', dateFrom: expect.stringMatching(/-04-01$/) });
});

it('asks for the bills due in the window a link names, says so, and can drop it (WP-06)', async () => {
  // The dashboard's "1 bill due this week" opened every unpaid bill.
  mockSearch = 'tab=unpaid&from=2026-09-01&to=2026-09-25&due_from=2026-09-25&due_to=2026-10-02';
  signIn(['purchases.bill.read']);
  renderWithProviders(<PurchaseBillsListPageContent />);
  await screen.findAllByText(/Agro Traders/);
  expect(lastAsked()).toMatchObject({ tab: 'unpaid', dueFrom: '2026-09-25', dueTo: '2026-10-02' });
  const chip = screen.getByRole('button', { name: 'Due 25/09/2026 to 02/10/2026' });
  expect(chip).toHaveAttribute('aria-pressed', 'true');
  await userEvent.setup().click(chip);
  await waitFor(() => expect(lastAsked()).toMatchObject({ dueFrom: null, dueTo: null }));
  expect(screen.queryByRole('button', { name: /^Due / })).not.toBeInTheDocument();
});

it('asks the server for unpaid bills when the Unpaid tab is chosen (AC-1)', async () => {
  signIn(['purchases.bill.read']);
  renderWithProviders(<PurchaseBillsListPageContent />);
  await screen.findAllByText(/Agro Traders/);
  const user = userEvent.setup();
  await user.click(screen.getByTestId('filters-button'));
  const group = await screen.findByRole('radiogroup', { name: 'Bills by status' });
  await user.click(within(group).getByRole('radio', { name: /Unpaid/ }));
  await user.click(screen.getByTestId('filters-apply'));
  await waitFor(() => expect(lastAsked().tab).toBe('unpaid'));
  expect(mockSearch).toContain('tab=unpaid');
});

it('shows a shop that has never bought anything one sentence, not tabs and ₹0', async () => {
  /* Owner, 12 Oct 2026: "I don't want that type of screen in case of empty". */
  service.listPurchaseBills.mockImplementation(async () => ({ ...page([]), hasAny: false }));
  signIn(['purchases.bill.read', 'purchases.bill.write']);
  renderWithProviders(<PurchaseBillsListPageContent />);
  expect(await screen.findByText('No purchase bills yet')).toBeInTheDocument();
  expect(screen.queryByTestId('filters-button')).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByText('₹4,921.00')).not.toBeInTheDocument();
  // One button, in the middle of the screen — not a second one in the header.
  expect(screen.getAllByRole('button', { name: /New bill/ })).toHaveLength(1);
  expect(screen.queryByRole('link', { name: /New bill/ })).not.toBeInTheDocument();
});

it('keeps the filters when a search found nothing in a book that has bills', async () => {
  service.listPurchaseBills.mockImplementation(async () => ({ ...page([]), hasAny: true }));
  signIn(['purchases.bill.read']);
  renderWithProviders(<PurchaseBillsListPageContent />);
  expect(await screen.findByTestId('filters-button')).toBeInTheDocument();
});

it('offers New bill only to a role that can record one (the accountant reads)', async () => {
  signIn(['purchases.bill.read']);
  renderWithProviders(<PurchaseBillsListPageContent />);
  await screen.findAllByText(/Agro Traders/);
  expect(screen.queryByRole('link', { name: /New bill/ })).not.toBeInTheDocument();
});

it('tells a member without access so, and asks nothing', () => {
  signIn([]);
  renderWithProviders(<PurchaseBillsListPageContent />);
  expect(screen.getByText('Purchases are not available')).toBeInTheDocument();
  expect(service.listPurchaseBills).not.toHaveBeenCalled();
});
