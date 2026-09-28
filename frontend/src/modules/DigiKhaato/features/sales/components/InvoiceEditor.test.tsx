import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { InvoiceEditorPageContent } from './InvoiceEditorPageContent';
import { InvoicePaymentDrawer } from './InvoicePaymentDrawer';

/**
 * SAL-02 / SAL-07 on screen. The editor's context (the shop's GST type and
 * the rates by date) comes from two other features' services, stubbed at the
 * module boundary; nothing here reaches the network.
 */
jest.mock('../api/salesService');
jest.mock('../../business-profile/api/businessProfileService', () => ({
  fetchTenant: jest.fn(async () => ({
    gstType: 'regular',
    stateCode: '27',
    businessType: 'retail',
  })),
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
jest.mock('../../parties/api/partyService', () => ({
  ...jest.requireActual('../../parties/api/partyService'),
  listParties: jest.fn(async () => ({
    rows: [
      {
        id: 'p-ka',
        name: 'Bengaluru Traders',
        displayCode: null,
        mobile: null,
        isCustomer: true,
        isSupplier: false,
        balance: '0.00',
        status: 'active',
        lastActivityAt: null,
        tags: [],
      },
    ],
    meta: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
    totals: null,
  })),
  getParty: jest.fn(async () => ({
    party: { id: 'p-ka', name: 'Bengaluru Traders', stateCode: '29', billingAddress: {} },
    summary: { balance: '0.00' },
    credit: null,
  })),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/sales/invoices/new',
}));

const sales = jest.requireMock('../api/salesService') as {
  createInvoice: jest.Mock;
  issueInvoice: jest.Mock;
};

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
      enabledModules: ['sales', 'parties', 'inventory'],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetAllFeatureState());
  window.localStorage.clear();
});

describe('the bill editor', () => {
  it('opens a retail shop on a walk-in Tax Invoice with Issue disabled until a line exists', async () => {
    // An Issue that is live on an empty bill posts a ₹0 invoice and burns a number.
    signIn(['sales.invoice.read', 'sales.invoice.write']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
    expect(await screen.findByTestId('invoice-issue')).toBeDisabled();
    expect(screen.getByRole('heading', { name: /Tax Invoice/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Walk-in', checked: true })).toBeInTheDocument();
    expect(screen.getByTestId('invoice-grand-total')).toHaveTextContent('₹0.00');
    // Nothing typed, nothing saved: an untouched editor must not create a draft.
    // Let the context thunks and the form seed settle before the last look.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
    expect(sales.createInvoice).not.toHaveBeenCalled();
  });

  it('tells a member who cannot bill so, instead of an editor that will refuse', async () => {
    signIn(['sales.invoice.read']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
    expect(screen.getByText('Bills are not available')).toBeInTheDocument();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  });
});

describe('the line table at a 1280 desktop (QA S-D5)', () => {
  it("fits every column's minimum in the editor column, so Total is never clipped", async () => {
    // S-D5: the tracks' minimums summed to 52rem against 43.5rem (696 px) of
    // editor column at 1280, so the last "Total" column was cut off in en and hi.
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches: /min-width/.test(query),
    })) as typeof window.matchMedia;
    signIn(['sales.invoice.read', 'sales.invoice.write']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
    await screen.findByTestId('invoice-issue');
    window.matchMedia = original;
    const header = screen.getAllByRole('columnheader')[0].parentElement as HTMLElement;
    const tracks = header.style.gridTemplateColumns.match(/minmax\([^)]*\)|[\d.]+rem/g) ?? [];
    const rem = (track: string): number => Number(/([\d.]+)rem/.exec(track)?.[1] ?? 0);
    const gaps = (tracks.length - 1) * 0.5;
    const padding = 1.5;
    expect(header).toHaveClass('gap-2'); // the 0.5rem gap counted below
    expect(tracks.length).toBe(7); // item, qty, rate, disc, GST, total, remove
    expect(tracks.reduce((sum, track) => sum + rem(track), 0) + gaps + padding).toBeLessThanOrEqual(
      43.5
    );
  });
});

describe('the place of supply for a picked party (QA S-D1)', () => {
  it("previews IGST for a party in another state, not the shop's CGST + SGST", async () => {
    // S-D1: an empty place of supply was previewed as the SHOP's state, so a
    // Karnataka party of a Maharashtra shop saw CGST + SGST while the issued
    // bill (resolved on the server from the party) carried IGST.
    signIn(['sales.invoice.read', 'sales.invoice.write', 'parties.party.read']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
    await screen.findByTestId('invoice-issue');
    expect(screen.getByText('Intra-state supply — CGST + SGST')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Party' }));
    await userEvent.type(screen.getByLabelText('Party'), 'Beng');
    await userEvent.click(await screen.findByText('Bengaluru Traders'));
    expect(await screen.findByText('Inter-state supply — IGST')).toBeInTheDocument();
  });
});

describe('the walk-in payment sheet (SAL-07 FR-3)', () => {
  it('defaults to the whole amount in cash and confirms it', async () => {
    const onConfirm = jest.fn();
    renderWithProviders(
      <InvoicePaymentDrawer
        open
        grandTotal="473.00"
        busy={false}
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />
    );
    const confirm = await screen.findByTestId('invoice-payment-confirm');
    expect(confirm).toHaveTextContent('Received ₹473.00 · Issue');
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith([{ mode: 'cash', amount: '473.00', reference: '' }]);
  });

  it('refuses a split that does not add up to the bill', async () => {
    // A walk-in is never a receivable: ₹400 of a ₹473 bill cannot be issued.
    renderWithProviders(
      <InvoicePaymentDrawer
        open
        grandTotal="473.00"
        busy={false}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />
    );
    const amount = await screen.findByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '400');
    await waitFor(() => expect(screen.getByTestId('invoice-payment-confirm')).toBeDisabled());
    expect(screen.getByRole('alert')).toHaveTextContent('₹473.00');
  });
});
