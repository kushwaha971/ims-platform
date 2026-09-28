import type * as ReactModule from 'react';

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { GstSummaryPageContent } from './GstSummaryPageContent';

import type { GstQuery, GstSummary } from '../types/taxReports.types';

/**
 * RPT-07 on screen (T-RPT07-15). What is asserted: the period defaults to the
 * last COMPLETED month (the one being filed); the strip switches between
 * "Ready to file" and "{n} issues to fix"; switching the view never refetches
 * (one response, three readings); figures carry their return coordinate;
 * a business with no GSTIN gets the empty state, not an error; staff are
 * shown nothing to fetch; a rate row opens the register lines behind it.
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
    usePathname: () => '/reports/gst-summary',
  };
});

const service = jest.requireMock('../api/taxReportsService') as { getGstSummary: jest.Mock };

const heads = { taxableValue: '2099.94', cgst: '52.50', sgst: '52.50', igst: '0.00', cess: '0.00' };
const box = (taxable: string) => ({
  taxable,
  igst: '0.00',
  cgst: '52.50',
  sgst: '52.50',
  cess: '0.00',
  note: null,
});

const SUMMARY: GstSummary = {
  outwardByRate: {
    rows: [
      { ...heads, taxCode: 'GST5', taxRate: '5.000', isInterState: false, count: 3, box: '3.1(a)' },
    ],
    total: heads,
  },
  byNature: [
    {
      ...heads,
      taxableValue: '1688.57',
      nature: 'b2b',
      table: '4A',
      applicable: true,
      documentCount: 1,
      invoiceValue: '1772.00',
    },
    {
      ...heads,
      taxableValue: '0.00',
      nature: 'advances',
      table: '11A/11B',
      applicable: false,
      documentCount: 0,
      invoiceValue: null,
    },
  ],
  b2cs: [],
  hsn: { rows: [], total: heads },
  docs: [
    {
      nature: 'invoices_outward',
      seriesPrefix: 'INV/26-27/',
      fromNumber: 'INV/26-27/0041',
      toNumber: 'INV/26-27/0048',
      totalCount: 8,
      cancelledCount: 2,
      netIssued: 6,
    },
  ],
  inwardByRate: null,
  itc: null,
  gstr3b: {
    boxes: [
      { box: '3.1(a)', figures: box('2099.94') },
      { box: '3.1(b)', figures: { ...box('0.00'), note: 'not_modelled' } },
    ],
    stateWise: [],
    exemptInward: { inter: '0.00', intra: '0.00' },
    net: {
      igst: '0.00',
      cgst: '52.50',
      sgst: '52.50',
      cess: '0.00',
      total: '105.00',
      outputTax: '105.00',
      itc: '0.00',
    },
  },
  composition: null,
  exceptions: [],
  meta: {
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
    gstType: 'regular',
    documentCount: 3,
    exceptionCount: 0,
    gstr1Due: '2026-09-11',
    gstr3bDue: '2026-09-20',
    yearToDate: false,
  },
};

const signIn = (permissions: readonly PermissionCode[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Accountant',
        email: 'ca@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Sharma General Store', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Sharma General Store', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: ['reports', 'sales'],
      version: 1,
    })
  );
};

const lastAsked = (): GstQuery => {
  const calls = service.getGstSummary.mock.calls as [GstQuery][];
  const last = calls[calls.length - 1];
  if (!last) throw new Error('no GST request was made');
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
  service.getGstSummary.mockResolvedValue(SUMMARY);
});

const FINANCIAL: PermissionCode[] = ['reports.financial.read', 'reports.export'];

it('opens on the last completed month, ready to file, with the GSTR-1 tables badged', async () => {
  signIn(FINANCIAL);
  renderWithProviders(<GstSummaryPageContent />);
  expect(await screen.findByText('Ready to file')).toBeInTheDocument();
  const asked = lastAsked();
  expect(asked.dateFrom.endsWith('-01')).toBe(true);
  expect(asked.dateTo < new Date().toISOString().slice(0, 10)).toBe(true);
  expect(asked.rounding).toBe('paise');
  expect(screen.getByText('GSTR-1 · 13')).toBeInTheDocument();
  expect(screen.getByText('INV/26-27/0041')).toBeInTheDocument();
  expect(
    screen.getByText('Not applicable — tax on advances is not recorded in DigiKhaato')
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument();
});

it('names the issues to fix and opens them in Details', async () => {
  signIn(FINANCIAL);
  service.getGstSummary.mockResolvedValue({
    ...SUMMARY,
    exceptions: [
      {
        documentId: 'd9',
        documentKind: 'invoice',
        number: 'INV/26-27/0044',
        documentDate: '2026-08-12',
        partyName: 'Mohan',
        issueCode: 'missing_hsn',
        message: 'A line on this tax invoice has no HSN/SAC code.',
      },
    ],
    meta: { ...SUMMARY.meta, exceptionCount: 1 },
  });
  renderWithProviders(<GstSummaryPageContent />);
  expect(await screen.findByText('1 issue to fix')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(await screen.findByText('A line has no HSN/SAC')).toBeInTheDocument();
  expect(mockSearch).toBe('view=details');
});

it('switches to the GSTR-3B view without asking the server again (T-RPT07-15)', async () => {
  signIn(FINANCIAL);
  renderWithProviders(<GstSummaryPageContent />);
  await screen.findByText('Ready to file');
  const calls = service.getGstSummary.mock.calls.length;
  await userEvent.click(screen.getByRole('tab', { name: 'GSTR-3B' }));
  expect(await screen.findByText('GSTR-3B · 3.1(a)')).toBeInTheDocument();
  expect(screen.getByText(/Not recorded in DigiKhaato/)).toBeInTheDocument();
  expect(service.getGstSummary.mock.calls.length).toBe(calls);
});

it('asks again, rounded, when Round to rupees is switched on (BR-6)', async () => {
  signIn(FINANCIAL);
  renderWithProviders(<GstSummaryPageContent />);
  await screen.findByText('Ready to file');
  await userEvent.click(screen.getByRole('switch', { name: 'Round to rupees' }));
  await waitFor(() => expect(lastAsked().rounding).toBe('rupee'));
});

it('opens the register lines behind a rate row (FR-13 via CR-RPT-2)', async () => {
  signIn(FINANCIAL);
  mockSearch = 'view=details';
  renderWithProviders(<GstSummaryPageContent />);
  const [open] = await screen.findAllByRole('button', { name: /Open GST5/ });
  await userEvent.click(open as HTMLElement);
  expect(mockPush).toHaveBeenCalledWith(
    expect.stringMatching(/^\/reports\/sales-register\?.*tax_code=GST5/)
  );
});

it('tells an unregistered business to add a GSTIN, rather than showing an error (FR-11)', async () => {
  signIn(FINANCIAL);
  service.getGstSummary.mockRejectedValue({
    code: 'gst_not_registered',
    message: 'Add your GSTIN in Business settings to use GST reports',
    details: {},
    requestId: 'r-1',
  });
  renderWithProviders(<GstSummaryPageContent />);
  expect(await screen.findByText('You are not registered for GST')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open business profile' })).toHaveAttribute(
    'href',
    '/settings/profile'
  );
});

it('shows staff that the report is not available and fetches nothing (§12)', () => {
  signIn(['reports.basic.read']);
  renderWithProviders(<GstSummaryPageContent />);
  expect(screen.getByText('The GST summary is not available')).toBeInTheDocument();
  expect(service.getGstSummary).not.toHaveBeenCalled();
});
