import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { makeDocument, wireDocument, wireLine } from '../testing/salesFixtures';

import { CreditNoteEditorPageContent } from './CreditNoteEditorPageContent';
import { InvoiceEditorPageContent } from './InvoiceEditorPageContent';
import { VoidDocumentDialog } from './VoidDocumentDialog';

/**
 * SAL-01 / SAL-04 / SAL-05 on screen: the estimate editor's tax label, the void
 * dialog's refusal and its payments step, and the return editor's cap. The
 * services are stubbed at the module boundary; nothing reaches the network.
 */
const gst = { type: 'regular' };
jest.mock('../../business-profile/api/businessProfileService', () => ({
  fetchTenant: jest.fn(async () => ({
    gstType: gst.type,
    stateCode: '27',
    businessType: 'wholesale',
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
jest.mock('../api/salesService', () => ({
  ...jest.requireActual('../api/salesService'),
  getInvoice: jest.fn(),
}));
jest.mock('../api/creditNoteService', () => ({
  createAndIssueCreditNote: jest.fn(),
  voidInvoice: jest.fn(),
  voidCreditNote: jest.fn(),
  applyCreditNote: jest.fn(),
}));
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/sales',
}));

const sales = jest.requireMock('../api/salesService') as { getInvoice: jest.Mock };
const credits = jest.requireMock('../api/creditNoteService') as {
  createAndIssueCreditNote: jest.Mock;
  voidInvoice: jest.Mock;
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

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetAllFeatureState());
  window.localStorage.clear();
  gst.type = 'regular';
});

describe('the estimate editor (SAL-01, TSK-SAL-01-07)', () => {
  it('T-SAL01-8: is the bill editor titled Estimate, with "Save & send" and Estimated GST', async () => {
    signIn(['sales.estimate.read', 'sales.estimate.write']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} kind="estimate" />);
    expect(await screen.findByRole('heading', { name: /Estimate/ })).toBeInTheDocument();
    expect(screen.getByTestId('invoice-issue')).toHaveTextContent('Save & send');
    expect(screen.getByTestId('estimated-gst')).toHaveTextContent(
      'Estimated GST (final on invoice)'
    );
    // An estimate carries a validity, never a due date (FR-4).
    expect(screen.getByText('Valid until')).toBeInTheDocument();
    expect(screen.queryByText('Due on')).not.toBeInTheDocument();
    await settle();
  });

  it('T-SAL01-8: hides the tax preview for a composition tenant (BR-3)', async () => {
    gst.type = 'composition';
    signIn(['sales.estimate.read', 'sales.estimate.write']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} kind="estimate" />);
    expect(await screen.findByTestId('invoice-issue')).toBeInTheDocument();
    expect(screen.queryByTestId('estimated-gst')).not.toBeInTheDocument();
    await settle();
  });

  it('refuses a member without the estimate codename, even one who may bill', async () => {
    signIn(['sales.invoice.read', 'sales.invoice.write']);
    renderWithProviders(<InvoiceEditorPageContent documentId={null} kind="estimate" />);
    expect(screen.getByText('Bills are not available')).toBeInTheDocument();
    await settle();
  });
});

describe('the void dialog (SAL-05 §7)', () => {
  it('T-SAL05-8: states the consequences and keeps Void disabled below three characters', async () => {
    signIn(['sales.invoice.read', 'sales.invoice.void']);
    const doc = makeDocument({ lines: [wireLine({ qty: '2.000' })] });
    renderWithProviders(<VoidDocumentDialog doc={doc} onClose={jest.fn()} />);
    expect(screen.getByTestId('void-consequences')).toHaveTextContent('Stock: +2 Basmati Rice 5kg');
    const confirm = screen.getByTestId('void-confirm');
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason'), 'no');
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason'), 't mine');
    expect(confirm).toBeEnabled();
  });

  it('FR-7: after voiding a paid walk-in bill, says the money goes back over the counter', async () => {
    signIn(['sales.invoice.read', 'sales.invoice.void']);
    const doc = makeDocument({ status: 'paid', amount_paid: '473.00', amount_due: '0.00' });
    credits.voidInvoice.mockResolvedValue({
      document: { ...doc, status: 'void' },
      warnings: [],
      rule46: null,
      partyBalance: null,
      ledgerEntryId: null,
      voidResult: {
        documentId: doc.id,
        partyBalance: null,
        unallocatedPayments: [
          { paymentId: 'pay1', number: 'RCT/26-27/0007', amount: '473.00', walkIn: true },
        ],
      },
    });
    const onClose = jest.fn();
    renderWithProviders(<VoidDocumentDialog doc={doc} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Reason'), 'Duplicate bill');
    await userEvent.click(screen.getByTestId('void-confirm'));
    expect(await screen.findByText('Return ₹473.00 to the customer')).toBeInTheDocument();
    expect(credits.voidInvoice).toHaveBeenCalledWith('d1', 'Duplicate bill');
    // PAY-05 integration — the counter receipt is real now, and one tap from its void.
    expect(screen.getByRole('link', { name: 'RCT/26-27/0007' })).toHaveAttribute(
      'href',
      '/payments/pay1'
    );
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('void-follow-up-done'));
    expect(onClose).toHaveBeenCalled();
  });

  it("BR-4 × PAY-05: a party bill's payments are named and kept as an advance", async () => {
    signIn(['sales.invoice.read', 'sales.invoice.void']);
    const doc = makeDocument({
      status: 'partially_paid',
      amount_paid: '300.00',
      amount_due: '173.00',
      party: { id: 'p1', name: 'Ramesh Traders', gstin: null, mobile: null, state_code: '27' },
    });
    credits.voidInvoice.mockResolvedValue({
      document: { ...doc, status: 'void' },
      warnings: [],
      rule46: null,
      partyBalance: '-300.00',
      ledgerEntryId: null,
      voidResult: {
        documentId: doc.id,
        partyBalance: '-300.00',
        unallocatedPayments: [
          { paymentId: 'pay2', number: 'RCT/26-27/0008', amount: '300.00', walkIn: false },
        ],
      },
    });
    const onClose = jest.fn();
    renderWithProviders(<VoidDocumentDialog doc={doc} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Reason'), 'Wrong rate');
    await userEvent.click(screen.getByTestId('void-confirm'));
    expect(await screen.findByTestId('void-follow-up-receipts')).toHaveTextContent(
      'RCT/26-27/0008 · ₹300.00'
    );
    expect(screen.getByText('Keep as advance')).toBeInTheDocument();
  });
});

describe('the return editor (SAL-04 §7)', () => {
  const invoice = () =>
    makeDocument({
      party: { id: 'p1', name: 'Ramesh Traders', gstin: null, mobile: null, state_code: '27' },
      party_snapshot: {
        name: 'Ramesh Traders',
        gstin: null,
        state_code: '27',
        mobile: null,
        address: {},
      },
      lines: [wireLine({ id: 'l1', qty: '5.000', returned_qty: '2.000' })],
      grand_total: '2363.00',
      amount_due: '2363.00',
      document_date: '2026-09-20',
    });

  it('T-SAL04-11: refuses more than what is left and issues the rest with one key', async () => {
    signIn(['sales.invoice.read', 'sales.credit_note.write']);
    sales.getInvoice.mockResolvedValue({
      document: invoice(),
      warnings: [],
      rule46: null,
      partyBalance: null,
      ledgerEntryId: null,
    });
    credits.createAndIssueCreditNote.mockResolvedValue({
      document: makeDocument({ ...wireDocument(), id: 'cn1', kind: 'credit_note' }),
      warnings: [],
      rule46: null,
      partyBalance: null,
      ledgerEntryId: null,
      invoice: null,
    });
    renderWithProviders(<CreditNoteEditorPageContent againstId="d1" />);
    const qty = await screen.findByLabelText('Return qty');
    expect(screen.getByText('Invoiced 5 NOS · Returned 2 · ₹450.00 each')).toBeInTheDocument();
    await userEvent.type(qty, '4');
    await userEvent.click(screen.getByTestId('credit-note-issue'));
    expect(await screen.findByText('Only 3 can be returned')).toBeInTheDocument();
    expect(credits.createAndIssueCreditNote).not.toHaveBeenCalled();

    await userEvent.clear(qty);
    await userEvent.type(qty, '3');
    expect(screen.getByTestId('credit-note-consequence')).toHaveTextContent(
      'Stock +3 Basmati Rice 5kg'
    );
    await userEvent.click(screen.getByTestId('credit-note-issue'));
    await waitFor(() => expect(credits.createAndIssueCreditNote).toHaveBeenCalled());
    const [body, key] = credits.createAndIssueCreditNote.mock.calls[0];
    expect(body).toMatchObject({
      against_id: 'd1',
      reason: 'sales_return',
      restock: true,
      settlement: 'hold_advance',
      lines: [{ against_line_id: 'l1', qty: '3' }],
    });
    expect(typeof key).toBe('string');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sales/credit-notes/cn1'));
  });
});
