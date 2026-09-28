import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { localeOverrideCleared } from 'src/redux/slice/localeSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ApiErrorShape } from 'src/types/api.types';

import { preferredPublicLocale } from '../../hooks/usePublicDocument';
import { publicWire, PUBLIC_UPI_WIRE as UPI } from '../../testing/salesFixtures';

import { PublicDocumentPageContent } from './PublicDocumentPageContent';

// The transport is mocked by NAME (components never import it, R-C-8): the
// page's thunk → service → `publicApi.get` path runs for real above it.
jest.mock('src/api/AxiosInstances', () => ({
  ...jest.requireActual('src/api/AxiosInstances'),
  publicApi: { get: jest.fn() },
}));

/**
 * The customer's share page (SAL-03 FR-5, launch blocker). It used to be a
 * stub that rendered "This link has expired" for EVERY token and never called
 * the API — so every bill a merchant shared on WhatsApp opened as expired.
 * These tests hold each state the customer can land in, for each kind of
 * document, and that the page carries nothing that leads into the app.
 */

type Wire = Record<string, unknown>;
const get = (jest.requireMock('src/api/AxiosInstances') as { publicApi: { get: jest.Mock } })
  .publicApi.get;
const supplierWire = (publicWire().supplier ?? {}) as Wire;

const respond = (wire: Wire) => get.mockResolvedValueOnce({ data: { data: wire } });
const fail = (status: number | null, code: ApiErrorShape['code']) => {
  const error: ApiErrorShape = {
    code,
    message: 'x',
    details: {},
    requestId: null,
    status,
    warnings: [],
  };
  get.mockRejectedValueOnce(error);
};

let seq = 0;
const render = (opts: { locale?: 'en' | 'hi' } = {}) => {
  seq += 1;
  const token = `tok${seq}_AbCdEf`;
  const view = renderWithProviders(<PublicDocumentPageContent token={token} />, opts);
  return { token, ...view };
};

/** No anchor on the page may lead into the app — the customer has no account in it. */
const expectNoAppLinks = (): void => {
  for (const a of document.querySelectorAll('a')) {
    expect(a.getAttribute('href') ?? '').toMatch(/^upi:/);
  }
};

beforeEach(() => {
  get.mockReset();
  window.print = jest.fn();
});

it('shows a loading state until the bill arrives', async () => {
  get.mockReturnValueOnce(new Promise(() => undefined));
  render();
  expect(await screen.findByLabelText('Loading the bill')).toBeInTheDocument();
});

it('renders an unpaid tax invoice with the shop letterhead, amount due and a UPI pay link', async () => {
  // AC: the customer sees who sent it, what is owed, and one tap to pay it.
  respond(publicWire());
  const { token } = render();
  const pay = await screen.findByTestId('public-pay');
  expect(get).toHaveBeenCalledWith(`/public/d/${token}`, expect.anything());
  expect(
    screen.getByRole('heading', { level: 1, name: 'Sharma General Store' })
  ).toBeInTheDocument();
  expect(screen.getByTestId('public-shop')).toHaveTextContent('GSTIN 27AAPFU0939F1ZV');
  expect(screen.getByTestId('public-shop')).toHaveTextContent('12 Market Road, Pune, Maharashtra');
  expect(screen.getByTestId('public-title')).toHaveTextContent('Tax Invoice · INV/26-27/0001');
  expect(screen.getByTestId('public-status')).toHaveTextContent('Payment due');
  expect(within(screen.getByTestId('public-headline')).getByText('Amount due')).toBeInTheDocument();
  expect(screen.getByTestId('public-amount')).toHaveTextContent('₹473.00');
  expect(pay).toHaveAttribute('href', UPI.upi_url);
  expect(pay).toHaveTextContent('Pay ₹473.00');
  expect(within(screen.getByTestId('public-pay-block')).getByTestId('upi-qr')).toBeInTheDocument();
  // The same A4 sheet the merchant prints is on the page.
  expect(within(screen.getByTestId('public-document')).getByTestId('print-a4')).toBeInTheDocument();
  // CR-2026-09-29-BRAND-A: signed by the shop; no "Powered by" the product.
  expect(screen.getByTestId('public-shared-by')).toHaveTextContent(
    'Shared by Sharma General Store'
  );
  expect(screen.queryByTestId('public-powered-by')).not.toBeInTheDocument();
  expectNoAppLinks();
});

it('Print / Save as PDF calls window.print', async () => {
  respond(publicWire());
  render();
  fireEvent.click(await screen.findByTestId('public-print'));
  await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
});

it('a paid bill shows Paid and the receipt, and no pay link', async () => {
  // SAL-14 FR-8 — paid → receipt view; nothing to pay, so no invitation to pay.
  respond(
    publicWire({
      status: 'paid',
      amount_paid: '473.00',
      amount_due: '0.00',
      upi: null,
      payments: [
        {
          number: 'RCPT/26-27/0001',
          payment_date: '2026-09-25',
          primary_mode: 'upi',
          amount: '473.00',
          status: 'recorded',
        },
      ],
    })
  );
  render();
  expect(await screen.findByText('Paid in full')).toBeInTheDocument();
  expect(screen.getByTestId('public-status')).toHaveTextContent('Paid');
  expect(screen.queryByTestId('public-pay')).not.toBeInTheDocument();
  expect(screen.getByTestId('public-payments')).toHaveTextContent('25/09/2026 · UPI · ₹473.00');
  expect(screen.getByTestId('print-paid')).toBeInTheDocument();
});

it('a part-paid bill asks only for what is left, against the total', async () => {
  respond(
    publicWire({
      status: 'partially_paid',
      amount_paid: '200.00',
      amount_due: '273.00',
      upi: { ...UPI, amount: '273.00' },
    })
  );
  render();
  expect(await screen.findByTestId('public-status')).toHaveTextContent('Partly paid');
  expect(screen.getByTestId('public-amount')).toHaveTextContent('₹273.00');
  expect(screen.getByText('of ₹473.00')).toBeInTheDocument();
  expect(screen.getByTestId('public-pay')).toHaveTextContent('Pay ₹273.00');
});

it('a void bill is marked Cancelled, watermarked VOID, and never invites a payment', async () => {
  // EC-6 — voided after the link was shared: watermark, pay hidden.
  respond(publicWire({ status: 'void', voided_at: '2026-09-26T10:00:00Z', upi: UPI }));
  render();
  expect(await screen.findByTestId('public-status')).toHaveTextContent('Cancelled');
  expect(
    screen.getByText('The shop has cancelled this bill. Nothing is due on it.')
  ).toBeInTheDocument();
  expect(screen.queryByTestId('public-pay')).not.toBeInTheDocument();
  expect(screen.getByTestId('print-watermark')).toHaveTextContent('VOID');
  expect(
    within(screen.getByTestId('public-document')).queryByTestId('upi-qr')
  ).not.toBeInTheDocument();
});

it('a bill of supply is titled as one', async () => {
  respond(
    publicWire({
      kind: 'bill_of_supply',
      supplier: { ...supplierWire, gst_type: 'composition' },
      cgst_total: '0.00',
      sgst_total: '0.00',
    })
  );
  render();
  expect(await screen.findByTestId('public-title')).toHaveTextContent('Bill of Supply');
});

it('an estimate says it is not a bill and offers no payment', async () => {
  respond(
    publicWire({
      kind: 'estimate',
      number: 'EST/26-27/0003',
      status: 'sent',
      valid_until: '2026-10-09',
      upi: null,
    })
  );
  render();
  expect(await screen.findByTestId('public-status')).toHaveTextContent('Valid');
  expect(screen.getByTestId('public-title')).toHaveTextContent('Estimate · EST/26-27/0003');
  expect(screen.getByText('Estimate total')).toBeInTheDocument();
  expect(
    screen.getByText('This is an estimate, not a bill. Nothing is due yet.')
  ).toBeInTheDocument();
  expect(screen.queryByTestId('public-pay')).not.toBeInTheDocument();
  expect(screen.getByTestId('print-not-tax-invoice')).toBeInTheDocument();
});

it('a credit note is read-only and prints the bill it is against', async () => {
  respond(
    publicWire({
      kind: 'credit_note',
      number: 'CN/26-27/0001',
      status: 'issued',
      upi: null,
      against: { number: 'INV/26-27/0001', document_date: '2026-09-24' },
    })
  );
  render();
  expect(await screen.findByTestId('public-status')).toHaveTextContent('Credit available');
  expect(screen.getByText('Credit note value')).toBeInTheDocument();
  expect(screen.queryByTestId('public-pay')).not.toBeInTheDocument();
  expect(screen.getByTestId('print-against')).toHaveTextContent('INV/26-27/0001');
});

it('an unknown, expired or revoked link is one neutral screen with no retry', async () => {
  // §19 — the page must not say WHICH; a retry cannot bring a dead link back.
  fail(404, 'not_found');
  const { token } = render();
  expect(await screen.findByText('This link is not available')).toBeInTheDocument();
  expect(
    screen.getByText('It may have expired. Ask the shop to share the bill again.')
  ).toBeInTheDocument();
  expect(screen.queryByTestId('public-retry')).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain(token.slice(0, 6));
  expectNoAppLinks();
});

it('a rate-limited link asks the customer to wait, and retry fetches again', async () => {
  fail(429, 'rate_limited');
  render();
  expect(await screen.findByText('Too many requests')).toBeInTheDocument();
  respond(publicWire());
  fireEvent.click(screen.getByTestId('public-retry'));
  expect(await screen.findByTestId('public-pay')).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

it('a network failure offers a retry, not the expired screen', async () => {
  fail(null, 'network_error');
  render();
  expect(await screen.findByText("Couldn't load this bill")).toBeInTheDocument();
  expect(screen.queryByText('This link is not available')).not.toBeInTheDocument();
  expect(screen.getByTestId('public-retry')).toBeInTheDocument();
});

it('renders in Hindi', async () => {
  respond(publicWire({ locale: 'hi' }));
  render({ locale: 'hi' });
  expect(await screen.findByText('बकाया राशि')).toBeInTheDocument();
  expect(screen.getByTestId('public-pay')).toHaveTextContent('₹473.00 का भुगतान करें');
  expect(screen.getByTestId('public-status')).toHaveTextContent('भुगतान बाकी');
});

it("opens in the shop's language when the customer has not chosen one", async () => {
  // A Hindi shop's customer on an English phone still reads the bill in Hindi;
  // an explicit choice (the cookie override) would outrank it.
  respond(publicWire({ locale: 'hi' }));
  render();
  act(() => {
    store.dispatch(localeOverrideCleared());
  });
  await screen.findByTestId('public-pay');
  await waitFor(() => expect(store.getState().locale.current).toBe('hi'));
});

describe('preferredPublicLocale', () => {
  it('is Hindi when the shop or the phone says Hindi, else English', () => {
    expect(preferredPublicLocale('hi', ['en-IN'])).toBe('hi');
    expect(preferredPublicLocale('en', ['hi-IN', 'en'])).toBe('hi');
    expect(preferredPublicLocale('en', ['en-GB', 'mr'])).toBe('en');
    expect(preferredPublicLocale('en', [])).toBe('en');
  });
});

it("shows the shop's logo through the token-scoped URL", async () => {
  // The customer has no session, so `/files/{id}` would 401: the page must use
  // the URL the payload names, made absolute against the API origin.
  respond(
    publicWire({
      tenant_branding: {
        app_name: 'YourKhata',
        primary_hex: null,
        doc_header: '',
        doc_footer: '',
        logo_url: '/api/v1/public/d/abc/logo',
      },
    })
  );
  render();
  await screen.findByTestId('public-pay');
  const logos = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));
  expect(logos.length).toBeGreaterThan(0);
  logos.forEach((src) => expect(src).toMatch(/^https?:\/\/[^/]+\/api\/v1\/public\/d\/abc\/logo$/));
});
