import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { screen } from '@testing-library/react';

import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { PaymentReceiptPrint } from './PaymentReceiptPrint';

import type { Payment } from '../../types/payment.types';

/**
 * PAY-04's printed receipt. jsdom cannot paginate, so the page-size half of
 * P-D3 is asserted on the stylesheet itself; the rest protects what the paper
 * and the on-screen preview SAY.
 */

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: 'pay1',
  number: 'RCT/26-27/0017',
  direction: 'in',
  party: { id: 'p1', name: 'Ramesh Traders', mobile: null },
  paymentDate: '2026-09-28',
  amount: '1200.00',
  modeBreakup: [
    { mode: 'cash', amount: '700.00', reference: '', upiApp: null },
    { mode: 'upi', amount: '500.00', reference: '', upiApp: 'phonepe' },
  ],
  primaryMode: 'cash',
  reference: '',
  note: '',
  status: 'recorded',
  unallocatedAmount: '0.00',
  allocations: [
    {
      documentType: 'sales_document',
      documentId: 'd1',
      number: 'INV/26-27/0001',
      kind: 'invoice',
      documentDate: '2026-09-13',
      status: 'paid',
      amountDue: '0.00',
      amount: '945.00',
    },
  ],
  partyBalanceAfter: '1084.00',
  context: null,
  business: {
    name: 'Sharma Kirana Store',
    legalName: null,
    gstin: null,
    phone: null,
    address: {},
    upiVpa: null,
  },
  voidReason: null,
  voidedAt: null,
  voidedBy: null,
  createdBy: null,
  createdAt: '2026-09-28T10:00:00Z',
  ...over,
});

function Receipt({
  value,
  perspective,
}: Readonly<{ value: Payment; perspective?: 'customer' | 'merchant' }>) {
  const { t } = useTranslation();
  return (
    <PaymentReceiptPrint
      payment={value}
      branding={null}
      staticQr={null}
      locale="en"
      t={t}
      perspective={perspective}
    />
  );
}

const css = readFileSync(join(__dirname, '../../../../../../../app/globals.css'), 'utf8');
const printCss = css.slice(css.indexOf('@page a5'));

it('P-D3: the whole document prints on the A5 page, not A4 then A5', () => {
  /* QA P-D3 — page 1 came out a blank A4 sheet and page 2 an A5 with the
     receipt pushed right and clipped: only the receipt was on the named page,
     so its ancestors stayed on A4 (a named-page change forces a break), and it
     kept its 148 mm screen box on a 128 mm printable page. */
  renderWithProviders(<Receipt value={payment()} />);
  const sheet = screen.getByTestId('payment-receipt-print');
  expect(sheet).toHaveClass('ub-print-sheet', 'ub-print-a5');
  // The body — and so every ancestor — is on the A5 page when it holds a receipt.
  expect(printCss).toMatch(/body:has\(\.ub-print-a5\)\s*\{\s*page:\s*a5;/);
  // Every wrapper between body and the receipt drops the shell's inset and width.
  expect(printCss).toMatch(
    /body:has\(\.ub-print-a5\) \*:has\(\.ub-print-a5\) \{[^}]*padding: 0 !important;[^}]*max-width: none !important;/
  );
  // The receipt takes the printable width, not its on-screen 148 mm centred box.
  expect(printCss).toMatch(
    /\.ub-print-a5 \{[^}]*width: 100% !important;[^}]*max-width: none !important;[^}]*margin: 0 !important;/
  );
});

it('P-D5: the receipt tables have a column gap on screen', () => {
  /* QA P-D5 — "PhonePe—" and "INV/26-27/000113/09/2026": the cells had no padding. */
  renderWithProviders(<Receipt value={payment()} />);
  for (const table of screen.getAllByRole('table')) {
    expect(table.className).toContain('[&_td]:px-2');
    expect(table.className).toContain('[&_th]:px-2');
  }
});

it('P-D6: a voided receipt does not state a balance after the payment', () => {
  /* QA P-D6 — the void receipt still read "Balance after this payment". */
  renderWithProviders(
    <Receipt value={payment({ status: 'void', voidReason: 'Wrong amount entered' })} />
  );
  expect(screen.queryByText(/Balance after this payment/)).not.toBeInTheDocument();
  expect(screen.getByText(/Wrong amount entered/)).toBeInTheDocument();
});

it('P-D6: a recorded receipt still states the balance after it', () => {
  renderWithProviders(<Receipt value={payment()} />);
  expect(screen.getByText(/Balance after this payment/)).toBeInTheDocument();
});

it('UAT-D8: the receipt letterhead prints the shop phone spaced, not raw E.164', () => {
  /* Final UAT D8 — "+919876501234" was printed as stored. */
  renderWithProviders(
    <Receipt value={payment({ business: { ...payment().business, phone: '+919876501234' } })} />
  );
  expect(screen.getByText('+91 98765 01234')).toBeInTheDocument();
});

describe('UAT-D8: the balance line is worded for whoever is reading it', () => {
  /* Final UAT D8 — the owner's own receipt page said "You will give", the
     customer's sentence, as though the owner owed it. The paper keeps it. */
  it('the customer copy (print, share) keeps "You will give" and no shop line', () => {
    renderWithProviders(<Receipt value={payment()} />);
    expect(screen.getByTestId('receipt-customer-balance')).toHaveTextContent('You will give');
    expect(screen.getByTestId('receipt-customer-balance')).not.toHaveClass('hidden');
    expect(screen.queryByTestId('receipt-shop-balance')).not.toBeInTheDocument();
  });

  it("the merchant's screen reads it from the shop side; the customer line is print-only", () => {
    renderWithProviders(<Receipt value={payment()} perspective="merchant" />);
    const shop = screen.getByTestId('receipt-shop-balance');
    expect(shop).toHaveTextContent("Customer's balance · ₹1,084.00 to collect");
    expect(shop).toHaveClass('print:hidden');
    expect(screen.getByTestId('receipt-customer-balance')).toHaveClass('hidden', 'print:block');
  });

  it('a customer in advance reads "advance with you"; a supplier owed reads "to pay"', () => {
    const { unmount } = renderWithProviders(
      <Receipt value={payment({ partyBalanceAfter: '-300.00' })} perspective="merchant" />
    );
    expect(screen.getByTestId('receipt-shop-balance')).toHaveTextContent(
      "Customer's balance · ₹300.00 advance with you"
    );
    unmount();
    renderWithProviders(
      <Receipt
        value={payment({ direction: 'out', partyBalanceAfter: '-300.00' })}
        perspective="merchant"
      />
    );
    expect(screen.getByTestId('receipt-shop-balance')).toHaveTextContent(
      "Supplier's balance · ₹300.00 to pay"
    );
  });
});

it('A4a: an allocation applied after the receipt was recorded says so, with the date', () => {
  /* PLT-X03 §8 — the receipt prints what the payment settled at print time; a bill it was
     applied to later (Apply to bills) must not read as if it was paid at the counter that day. */
  const later = payment({
    allocations: [
      {
        documentType: 'sales_document',
        documentId: 'd2',
        number: 'INV/26-27/0311',
        kind: 'invoice',
        documentDate: '2026-10-12',
        status: 'paid',
        amountDue: '0.00',
        amount: '1770.00',
        appliedLaterOn: '2026-10-12',
      },
    ],
  });
  renderWithProviders(<Receipt value={later} />);
  expect(screen.getByTestId('receipt-applied-later')).toHaveTextContent(/Applied later/);
});

it('A4a: an allocation made when the receipt was recorded carries no "Applied later" line', () => {
  renderWithProviders(<Receipt value={payment()} />);
  expect(screen.queryByTestId('receipt-applied-later')).not.toBeInTheDocument();
});
