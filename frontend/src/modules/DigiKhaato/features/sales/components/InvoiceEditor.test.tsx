import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';
import { localDraftKey, readLocalDraft } from 'src/utils/localDrafts';

import { useInvoiceEditor, type UseInvoiceEditorResult } from '../hooks/useInvoiceEditor';
import { wireDocument } from '../testing/salesFixtures';

import { InvoiceEditorPageContent } from './InvoiceEditorPageContent';
import { InvoicePaymentDrawer } from './InvoicePaymentDrawer';

import type { InvoiceFormValues } from '../view-model/invoiceForm';

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
  updateInvoice: jest.Mock;
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

describe('the line table at a 1536 desktop (QA S-D5 / B17)', () => {
  it("fits every column's minimum in the editor column, so Total is never clipped", async () => {
    // B17: wider quantity fields need cards at 1280; the table starts at
    // 1536, where the editor beside its totals has at least 53.5rem.
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      ...original(query),
      matches:
        /min-width/.test(query) &&
        1536 >= Number(/min-width:\s*(\d+)/.exec(query)?.[1] ?? Infinity),
    })) as typeof window.matchMedia;
    signIn(['sales.invoice.read', 'sales.invoice.write']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
    await screen.findByTestId('invoice-issue');
    window.matchMedia = original;
    const header = screen.getAllByRole('columnheader')[0]?.parentElement as HTMLElement;
    const tracks = header.style.gridTemplateColumns.match(/minmax\([^)]*\)|[\d.]+rem/g) ?? [];
    const rem = (track: string): number => Number(/([\d.]+)rem/.exec(track)?.[1] ?? 0);
    const gaps = (tracks.length - 1) * 0.5;
    const padding = 1.5;
    expect(header).toHaveClass('gap-2'); // the 0.5rem gap counted below
    expect(tracks.length).toBe(7); // item, qty, rate, disc, GST, total, remove
    expect(tracks.reduce((sum, track) => sum + rem(track), 0) + gaps + padding).toBeLessThanOrEqual(
      53.5
    );
  });
});

describe('the phone line card (QA S-D8)', () => {
  it('shows the line total with its ₹, since the card has no column header', async () => {
    signIn(['sales.invoice.read', 'sales.invoice.write']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
    await screen.findByTestId('invoice-issue');
    expect(screen.getByTestId('line-items-editor')).toHaveAttribute('data-layout', 'card');
    expect(screen.getByTestId('line-items-editor')).toHaveTextContent('₹0.00');
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

describe('the payment sheet’s row checks (PAY-02 §10)', () => {
  it('says why a split row cannot be confirmed instead of greying the button silently', async () => {
    // The server refuses a zero row, a repeated mode and a cheque without its
    // number; before, the sheet either greyed the button with no reason or let
    // the row through to a snackbar after the tap. `paymentRowProblems` covers
    // all three; this pins that the reason reaches the screen.
    renderWithProviders(
      <InvoicePaymentDrawer
        open
        grandTotal="473.00"
        busy={false}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        onCredit={jest.fn()}
      />
    );
    await screen.findByTestId('invoice-payment-confirm');
    await userEvent.click(screen.getByRole('button', { name: 'Split payment' }));
    const amounts = screen.getAllByLabelText('Amount');
    await userEvent.type(amounts[1] as HTMLElement, '0');
    expect(await screen.findByText(/Enter an amount above zero/)).toBeInTheDocument();
    expect(screen.getByTestId('invoice-payment-confirm')).toBeDisabled();
  });
});

describe('a bill the stock cannot cover (QA B1)', () => {
  it('names the short item and what is on hand instead of going quiet', async () => {
    // The 409 was a locally presented code with no local surface: Issue did
    // nothing, the payment sheet stayed open and nothing said why.
    signIn(['sales.invoice.write', 'sales.invoice.read']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
    await screen.findByTestId('invoice-issue');
    act(() => {
      store.dispatch({
        type: 'invoiceEditor/issueInvoice/rejected',
        payload: {
          code: 'insufficient_stock',
          status: 409,
          message: 'Not enough stock.',
          details: {
            lines: [
              {
                index: 0,
                item_name: 'QA Pen',
                requested: '7.000',
                available: '5.000',
                unit_code: 'NOS',
              },
            ],
          },
        },
      });
    });
    expect(await screen.findByText('Not enough stock to issue this bill')).toBeInTheDocument();
    expect(screen.getByText('QA Pen: 7 NOS on the bill, 5 NOS in stock')).toBeInTheDocument();
  });
});

it('B38 explains the sale date and later opening stock date on the refusal', async () => {
  // Today's on-hand stock must not hide why a historical sale is refused.
  signIn(['sales.invoice.write', 'sales.invoice.read']);
  renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
  await screen.findByTestId('invoice-issue');
  act(() => {
    store.dispatch({
      type: 'invoiceEditor/issueInvoice/rejected',
      payload: {
        code: 'insufficient_stock',
        status: 409,
        message: 'Not enough stock.',
        details: {
          lines: [
            {
              index: 0,
              item_name: 'QA Rice',
              requested: '2.500',
              available: '0.000',
              unit_code: 'KGS',
              as_of: '2026-03-15',
              opening_date: '2026-04-01',
            },
          ],
        },
      },
    });
  });
  expect(
    await screen.findByText('QA Rice: no stock on 15/03/2026. Opening stock starts 01/04/2026.')
  ).toBeInTheDocument();
});

it('asks only for customers when choosing who a sales bill is for', async () => {
  signIn(['sales.invoice.read', 'sales.invoice.write', 'parties.party.read']);
  renderWithProviders(<InvoiceEditorPageContent documentId={null} />);
  await userEvent.click(await screen.findByRole('radio', { name: 'Party' }));
  await userEvent.click(screen.getByRole('combobox', { name: 'Party' }));
  const parties = jest.requireMock('../../parties/api/partyService') as { listParties: jest.Mock };
  await waitFor(() =>
    expect(parties.listParties).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'customer' }),
      expect.anything()
    )
  );
});

describe('draft creation recovery', () => {
  let editor: UseInvoiceEditorResult;
  function Probe() {
    editor = useInvoiceEditor(null);
    return null;
  }
  const envelope = (version = 1, recovered = false) =>
    jest.requireActual('../api/salesService').toEnvelope({
      data: wireDocument({ status: 'draft', number: null, version }),
      meta: { draft_recovered: recovered },
    });
  const open = async () => {
    signIn(['sales.invoice.read', 'sales.invoice.write']);
    const view = renderWithProviders(<Probe />);
    await waitFor(() => expect(editor.editor.context).not.toBeNull());
    return view;
  };

  it('persists the same creation key before POST and reuses it after response loss/remount', async () => {
    const view = await open();
    sales.createInvoice.mockRejectedValueOnce(new Error('lost response'));
    await act(async () => {
      await editor.save(false);
    });
    const key = localDraftKey('t1', 'invoice', 'new', 'u1');
    const stored = readLocalDraft<InvoiceFormValues>(key);
    if (!stored) throw new Error('Expected the draft to be persisted before POST');
    const sentKey = sales.createInvoice.mock.calls[0][0].client_draft_key;
    expect(stored.form.clientDraftKey).toBe(sentKey);
    expect(sentKey).toBeTruthy();
    view.unmount();
    await open();
    act(() =>
      editor.form.reset({ ...stored.form, notes: 'new local text' }, { keepDefaultValues: true })
    );
    sales.createInvoice.mockResolvedValueOnce(envelope(1, true));
    sales.updateInvoice.mockResolvedValueOnce(envelope(2));
    await act(async () => {
      await editor.save(false);
    });
    expect(sales.createInvoice.mock.calls[1][0].client_draft_key).toBe(sentKey);
    expect(editor.editor.documentId).toBe('d1');
    expect(sales.updateInvoice).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ version: 1, notes: 'new local text' }),
      expect.anything()
    );
  });

  it('queues an overlapping save using the acknowledged id/version and newest typing', async () => {
    await open();
    let complete!: (value: unknown) => void;
    sales.createInvoice.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    sales.updateInvoice.mockResolvedValueOnce(envelope(2));
    let first!: Promise<unknown>;
    act(() => {
      first = editor.save(true);
    });
    await waitFor(() => expect(sales.createInvoice).toHaveBeenCalledTimes(1));
    act(() => editor.form.setValue('notes', 'typed during save', { shouldDirty: true }));
    let second!: Promise<unknown>;
    act(() => {
      second = editor.save(false);
    });
    expect(sales.updateInvoice).not.toHaveBeenCalled();
    await act(async () => {
      complete(envelope());
      await first;
      await second;
    });
    expect(sales.createInvoice).toHaveBeenCalledTimes(1);
    expect(sales.updateInvoice).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        version: 1,
        notes: 'typed during save',
      }),
      expect.anything()
    );
  });

  it('requires conflict review when a recovered first create already has newer edits', async () => {
    await open();
    sales.createInvoice.mockResolvedValueOnce(envelope(3, true));
    let result: unknown;
    await act(async () => {
      result = await editor.save(false);
    });
    expect(result).toBeNull();
    expect(editor.editor.saveState).toBe('conflict');
    await act(async () => {
      await editor.save(true);
    });
    expect(sales.updateInvoice).not.toHaveBeenCalled();
    expect(readLocalDraft(localDraftKey('t1', 'invoice', 'd1', 'u1'))?.version).toBe(1);
  });

  it('ignores a late save response after feature/account teardown', async () => {
    const view = await open();
    let complete!: (value: unknown) => void;
    sales.createInvoice.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    act(() => {
      void editor.save(false);
    });
    await waitFor(() => expect(sales.createInvoice).toHaveBeenCalledTimes(1));
    view.unmount();
    act(() => {
      store.dispatch(resetAllFeatureState());
    });
    await act(async () => {
      complete(envelope());
    });
    expect(store.getState().invoiceEditor?.documentId).toBeNull();
  });
});
