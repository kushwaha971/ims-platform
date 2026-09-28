import { render, screen, within } from '@testing-library/react';

import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import {
  billOfSupply,
  interStateDocument,
  makeDocument,
  wireLine,
} from '../../testing/salesFixtures';

import { InvoicePrintA4 } from './InvoicePrintA4';
import { InvoicePrintThermal80 } from './InvoicePrintThermal80';
import { UbQrCode } from './UbQrCode';

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

it('UbQrCode paints one square per dark module inside a four-module quiet zone', () => {
  // The encoder is tested against the standard; this protects the painting of its output.
  render(<UbQrCode modules={['101', '010', '101']} size="28mm" label="Scan to pay" />);
  const svg = screen.getByRole('img', { name: 'Scan to pay' });
  expect(svg.getAttribute('viewBox')).toBe('0 0 11 11');
  const path = svg.querySelector('path')?.getAttribute('d') ?? '';
  expect(path.match(/M/g)).toHaveLength(5);
  expect(path.startsWith('M4,4h1v1h-1z')).toBe(true);
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
