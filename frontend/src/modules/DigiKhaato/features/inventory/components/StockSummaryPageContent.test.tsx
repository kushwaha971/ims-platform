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
