import { screen } from '@testing-library/react';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import { stockSummaryExportPath } from '../api/stockService';
import { DEFAULT_SUMMARY_FILTERS } from '../hooks/useStockReports';

import { StockSummaryPageContent } from './StockSummaryPageContent';

/**
 * RPT-06 on INV-08's screen: Export is the REPORT's file of exactly this
 * view, and it appears only with Reports on and the export permission — a
 * staff member reading stock gets no Export control (RPT-06 AC-6).
 */
jest.mock('../api/stockService', () => ({
  ...jest.requireActual('../api/stockService'),
  getStockSummary: jest.fn(),
}));
jest.mock('../api/mastersService', () => ({
  listUnits: jest.fn().mockResolvedValue([]),
  listCategories: jest.fn().mockResolvedValue([]),
  listTaxRates: jest.fn().mockResolvedValue([]),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/stock/summary',
}));

const service = jest.requireMock('../api/stockService') as { getStockSummary: jest.Mock };

const signIn = (permissions: readonly PermissionCode[], modules: readonly ModuleCode[]) =>
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [...modules],
      version: 1,
    })
  );

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetAllFeatureState());
  service.getStockSummary.mockResolvedValue({
    rows: [],
    page: 1,
    pageSize: 25,
    total: 3,
    totalPages: 1,
    totals: { items: 3, value: '100.00' },
    asOf: null,
    historical: false,
    valuationVisible: true,
  });
});

it('offers the report file of this view with Reports on and the export permission', async () => {
  signIn(
    ['inventory.stock.read', 'reports.basic.read', 'reports.export'],
    ['inventory', 'reports']
  );
  renderWithProviders(<StockSummaryPageContent />);
  expect(await screen.findByRole('button', { name: 'Export' })).toBeInTheDocument();
});

it('shows no Export to a reader who may not export (AC-6)', async () => {
  signIn(['inventory.stock.read', 'reports.basic.read'], ['inventory', 'reports']);
  renderWithProviders(<StockSummaryPageContent />);
  await screen.findByText('Stock summary', { selector: 'h1' });
  expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
});

it('asks for the file with the screen’s own filters and no paging (RPT-08 BR-1)', () => {
  expect(
    stockSummaryExportPath({ ...DEFAULT_SUMMARY_FILTERS, q: 'rice', status: 'low', page: 4 })
  ).toBe('/reports/stock-summary?q=rice&status=low&ordering=name');
});

/**
 * Approved designs (12 Oct 2026): a business with no tracked item sees ONE
 * empty state — no as-of date, ₹0.00 value, "Items 0", search, Filters or
 * "Hide zero stock" over nothing. A summary whose filters emptied it keeps
 * every one of them, because they are how the merchant gets the rows back.
 */
const emptySummary = (hasAny: boolean | undefined) => ({
  rows: [],
  page: 1,
  pageSize: 25,
  total: 0,
  totals: { items: 0, value: '0.00' },
  asOf: null,
  historical: false,
  valuationVisible: true,
  ...(hasAny === undefined ? {} : { hasAny }),
});
const OWNER_STOCK: PermissionCode[] = [
  'inventory.stock.read',
  'inventory.item.write',
  'reports.basic.read',
  'reports.export',
];

it('reduces an empty book to one empty state with a way to the items', async () => {
  signIn(OWNER_STOCK, ['inventory', 'reports']);
  service.getStockSummary.mockResolvedValue(emptySummary(false));
  renderWithProviders(<StockSummaryPageContent />);
  expect(await screen.findByText('No tracked items yet')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to items' })).toHaveAttribute('href', '/items');
  expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: 'Hide zero stock' })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByText('₹0.00')).not.toBeInTheDocument();
  expect(screen.queryByText('As of')).not.toBeInTheDocument();
});

it('offers no action on an empty book to a reader who cannot add items', async () => {
  signIn(['inventory.stock.read'], ['inventory']);
  service.getStockSummary.mockResolvedValue(emptySummary(false));
  renderWithProviders(<StockSummaryPageContent />);
  expect(await screen.findByText('No tracked items yet')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Go to items' })).not.toBeInTheDocument();
});

it.each([
  ['a book whose filters found nothing', true],
  ['an older server that does not say', undefined],
])('keeps every control for %s', async (_label, hasAny) => {
  signIn(OWNER_STOCK, ['inventory', 'reports']);
  service.getStockSummary.mockResolvedValue(emptySummary(hasAny));
  renderWithProviders(<StockSummaryPageContent />);
  // On a phone (jsdom's width) "Hide zero stock" is a choice inside Filters.
  expect(await screen.findByTestId('filters-button')).toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: 'Hide zero stock' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  // The same queries the empty book asserts ABSENT, so neither test is vacuous.
  expect(screen.getByRole('searchbox')).toBeInTheDocument();
  expect(screen.getAllByText('As of').length).toBeGreaterThan(0);
  expect(screen.queryByRole('link', { name: 'Go to items' })).not.toBeInTheDocument();
});
