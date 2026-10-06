import { screen, within } from '@testing-library/react';

import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import {
  billOfSupply,
  interStateDocument,
  makeDocument,
  wireDocument,
  wireLine,
} from '../../testing/salesFixtures';

import { InvoicePrintA4 } from './InvoicePrintA4';
import { InvoicePrintThermal80 } from './InvoicePrintThermal80';

import type { SalesDocument, UpiIntent } from '../../types/sales.types';

/**
 * SAL-03's printed sheets. jsdom cannot photograph a stylesheet (the live look
 * does that with `emulateMedia('print')`), so these protect what the paper
 * SAYS: which tax columns exist, the watermark, the QR, the paid stamp.
 */

const UPI: UpiIntent = {
  upiUrl: 'upi://pay?pa=sharma@okhdfc&am=473.00',
  amount: '473.00',
  qr: { size: 3, modules: ['101', '010', '101'] },
};

function A4({ doc, upi = UPI }: Readonly<{ doc: SalesDocument; upi?: UpiIntent | null }>) {
  const { t } = useTranslation();
  return <InvoicePrintA4 doc={doc} upi={upi} branding={null} locale="en" t={t} />;
}

function Thermal({ doc }: Readonly<{ doc: SalesDocument }>) {
  const { t } = useTranslation();
  return <InvoicePrintThermal80 doc={doc} upi={UPI} branding={null} t={t} />;
}

const lineHeaders = (): string[] =>
  within(screen.getByTestId('print-lines'))
    .getAllByRole('columnheader')
    .map((th) => th.textContent ?? '');

it('T-SAL03-3: an intra-state invoice prints CGST and SGST and no IGST column', () => {
  // A Maharashtra-to-Maharashtra bill carrying an IGST column is a wrong tax invoice.
  renderWithProviders(<A4 doc={makeDocument()} />);
  const headers = lineHeaders();
  expect(headers).toEqual(expect.arrayContaining(['CGST', 'SGST']));
  expect(headers).not.toContain('IGST');
});

it('T-SAL03-3: an inter-state invoice prints IGST only', () => {
  renderWithProviders(<A4 doc={interStateDocument()} />);
  const headers = lineHeaders();
  expect(headers).toContain('IGST');
  expect(headers).not.toContain('CGST');
});

it('T-SAL03-3: a Bill of Supply prints no tax column and the composition wording', () => {
  // Rule 5 of the composition scheme: a composition dealer may not show tax at all.
  renderWithProviders(<A4 doc={billOfSupply()} />);
  const headers = lineHeaders();
  expect(headers.some((h) => /GST/.test(h))).toBe(false);
  expect(screen.getByText(/Composition taxable person/)).toBeInTheDocument();
});

it('T-SAL03-4: a draft carries the DRAFT watermark and no QR', () => {
  // A draft is not a bill; a QR on it would take money for a document that does not exist.
  renderWithProviders(<A4 doc={makeDocument({ status: 'draft', number: null })} />);
  expect(screen.getByTestId('print-watermark')).toHaveTextContent('DRAFT — not valid');
  expect(screen.queryByTestId('upi-qr')).not.toBeInTheDocument();
});

it('T-SAL03-4: a void carries VOID', () => {
  renderWithProviders(<A4 doc={makeDocument({ status: 'void' })} />);
  expect(screen.getByTestId('print-watermark')).toHaveTextContent('VOID');
});

it('prints the due amount beside the QR on an unpaid bill (BR-2)', () => {
  renderWithProviders(<A4 doc={makeDocument()} />);
  expect(screen.getByTestId('upi-qr')).toBeInTheDocument();
  expect(screen.getByText('Scan to pay ₹473.00')).toBeInTheDocument();
  expect(screen.queryByTestId('print-paid')).not.toBeInTheDocument();
});

it('stamps a paid bill PAID and keeps a static QR (BR-2)', () => {
  renderWithProviders(
    <A4
      doc={makeDocument({ status: 'paid', amount_paid: '473.00', amount_due: '0.00' })}
      upi={{ ...UPI, amount: null }}
    />
  );
  expect(screen.getByTestId('print-paid')).toHaveTextContent('Paid');
  expect(screen.getByText('Scan to pay')).toBeInTheDocument();
});

it('prints the amount in words and the grand total', () => {
  renderWithProviders(<A4 doc={makeDocument()} />);
  expect(screen.getByTestId('print-grand-total')).toHaveTextContent('₹473.00');
  expect(screen.getByTestId('print-words')).toHaveTextContent(
    'Four hundred seventy-three rupees only'
  );
});

it('T-SAL03-5: the thermal slip truncates a long name to its 28-character budget', () => {
  // A name that wraps on 80 mm paper pushes the amount onto a line of its own.
  const long = 'Premium Basmati Rice Extra Long Grain 5kg';
  renderWithProviders(<Thermal doc={makeDocument({ lines: [wireLine({ description: long })] })} />);
  const sheet = screen.getByTestId('print-thermal');
  expect(sheet).not.toHaveTextContent(long);
  expect(within(sheet).getByText(/^Premium Basmati Rice Extra …$/)).toBeInTheDocument();
});

/**
 * Sprint 12 a11y sweep: on screen the A4 sheet is the preview INSIDE the
 * document page, whose h1 is the document number — the sheet's own h1 (the
 * business name) made two page titles. And the totals block was a table of
 * bare cells with no header at all, so a screen reader read "₹1,169.00" with
 * nothing to say what it was the total of.
 */
it('has no page title of its own and names every total by a row header', () => {
  renderWithProviders(<A4 doc={makeDocument()} />);
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  const grand = screen.getByRole('rowheader', { name: 'Grand total' });
  expect(grand.closest('tr')).toContainElement(screen.getByTestId('print-grand-total'));
});

it('UAT D2: on a phone screen each line is stacked with its total; paper keeps the A4 table', () => {
  // At 390 px the 13-column table was cut off at SGST on the share page and the
  // detail page, hiding the line total. The stacked copy is screen-only below
  // `sm`; the table is hidden there on screen but forced back for print.
  renderWithProviders(<A4 doc={makeDocument()} />);
  const stacked = screen.getByTestId('print-lines-stacked');
  expect(stacked).toHaveClass('sm:hidden', 'print:hidden');
  expect(screen.getByTestId('print-lines')).toHaveClass('hidden', 'sm:table', 'print:table');
  const line = makeDocument().lines[0];
  const first = within(stacked).getAllByRole('listitem')[0];
  if (!line || !first) throw new Error('fixture has a line');
  expect(first).toHaveTextContent(line.description);
  expect(first).toHaveTextContent('CGST');
  expect(first).toHaveTextContent('SGST');
  expect(first).toHaveTextContent(line.lineTotal);
});

it('UAT-D8: the A4 and thermal letterheads print the shop phone spaced, not raw E.164', () => {
  /* Final UAT D8 — the stored "+919876501234" was printed as-is on the bill. */
  const doc = makeDocument({
    supplier: { ...(wireDocument().supplier as Record<string, unknown>), phone: '+919876501234' },
  });
  const { unmount } = renderWithProviders(<A4 doc={doc} />);
  expect(screen.getByText('+91 98765 01234')).toBeInTheDocument();
  expect(screen.queryByText('+919876501234')).not.toBeInTheDocument();
  unmount();
  renderWithProviders(<Thermal doc={doc} />);
  expect(screen.getByText('+91 98765 01234')).toBeInTheDocument();
});

/**
 * The standard GST layout (owner, 6 Oct 2026: "like other applications"). An
 * Indian tax invoice is read against a shape every accountant knows — seller and
 * meta side by side, a ruled line table, an HSN-wise tax summary, bank details,
 * "For <business> / Authorised signatory". These pin what the paper SAYS in it.
 */
describe('standard GST layout', () => {
  const twoRates = (): SalesDocument =>
    makeDocument({
      lines: [
        wireLine(),
        wireLine({ id: 'l2', line_no: 2, description: 'Sunflower Oil 1L', hsn_sac: '1512' }),
        wireLine({
          id: 'l3',
          line_no: 3,
          description: 'Detergent 1kg',
          hsn_sac: '3402',
          tax_code: 'GST18',
          tax_rate: '18.000',
          taxable_value: '100.00',
          cgst: '9.00',
          sgst: '9.00',
          line_total: '118.00',
        }),
      ],
    });

  it('summarises tax by HSN and rate, one row per pair, with the split rate', () => {
    // GSTR-1 table 12 is filed HSN-wise; a summary that merged two HSNs at one
    // rate, or printed 5% under CGST, would not reconcile with the return.
    renderWithProviders(<A4 doc={twoRates()} />);
    const summary = screen.getByTestId('print-hsn-summary');
    const rows = within(summary).getAllByRole('row').slice(2);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual([
      '1006',
      '1512',
      '3402',
    ]);
    expect(rows[2]).toHaveTextContent('9%');
    expect(rows[2]).toHaveTextContent('18.00');
    expect(rows[0]).toHaveTextContent('2.5%');
  });

  it('totals the line table, and the quantity only when every line has one unit', () => {
    // "3 NOS" across rice in NOS and oil in LTR would be a sum of nothing.
    renderWithProviders(<A4 doc={twoRates()} />);
    const foot = within(screen.getByTestId('print-lines')).getAllByRole('row').at(-1);
    expect(foot).toHaveTextContent('3 NOS');
  });

  it('labels a credit note’s number as a credit note, and names the invoice it is against once', () => {
    renderWithProviders(
      <A4
        doc={makeDocument({
          kind: 'credit_note',
          number: 'CN/26-27/0001',
          links: {
            against: {
              id: 'd0',
              kind: 'invoice',
              number: 'INV/26-27/0004',
              document_date: '2026-09-20',
              status: 'issued',
            },
          },
        })}
        upi={null}
      />
    );
    expect(screen.getByRole('rowheader', { name: 'Credit note no.' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Invoice no.' })).toBeNull();
    expect(screen.getByTestId('print-against')).toHaveTextContent('INV/26-27/0004');
    expect(screen.getByTestId('print-sec34')).toBeInTheDocument();
    // A credit note settles nothing on its own paper: no Paid, no Balance due.
    expect(screen.queryByRole('rowheader', { name: 'Balance due' })).toBeNull();
  });

  it('shows credit notes taken off an invoice, so Paid + credited + due adds up to the total', () => {
    // Without the row, ₹1,850 − ₹0 paid printed "Balance due ₹1,401" with no reason.
    renderWithProviders(<A4 doc={makeDocument({ amount_paid: '100.00', amount_due: '273.00' })} />);
    const row = screen.getByRole('rowheader', { name: 'Less: credit notes' }).closest('tr');
    expect(row).toHaveTextContent('−₹100.00');
  });

  it('closes with the business’s signatory block and never the product’s name', () => {
    renderWithProviders(<A4 doc={makeDocument()} />);
    expect(screen.getByText('For Sharma General Store')).toBeInTheDocument();
    expect(screen.getByText('Authorised signatory')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/YourKhata|yourkhata\.com/i);
  });
});
