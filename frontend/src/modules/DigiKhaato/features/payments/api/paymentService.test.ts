import { paymentListQuery, toWireBody } from './paymentService';

import type { PaymentFormValues } from '../types/payment.types';

/* The endpoint functions are tested on what they SEND (the statement service's rule); the
   pure mappers above need no network either way. */
jest.mock('src/api/AxiosInstances', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  ubConfig: (extras: unknown) => extras,
}));

const values = (overrides: Partial<PaymentFormValues> = {}): PaymentFormValues => ({
  direction: 'in',
  partyId: 'p1',
  partyName: 'Ramesh',
  paymentDate: '2026-09-25',
  lines: [
    { mode: 'upi', upiApp: 'phonepe', amount: '700.00', reference: ' UTR123 ' },
    { mode: 'cash', upiApp: '', amount: '300.00', reference: 'stale' },
  ],
  autoAllocate: true,
  allocations: [],
  note: ' paid at shop ',
  ...overrides,
});

describe('toWireBody', () => {
  it('sends the lines only — the server derives the total and the primary mode', () => {
    /** PAY-02 BR-1: a client-sent amount that disagreed with the lines would be
     *  refused, so there is none; a cash line's leftover UTR is not sent. */
    const body = toWireBody(values());
    expect(body).toEqual({
      direction: 'in',
      party_id: 'p1',
      payment_date: '2026-09-25',
      note: 'paid at shop',
      mode_breakup: [
        { mode: 'upi', amount: '700.00', reference: 'UTR123', upi_app: 'phonepe' },
        { mode: 'cash', amount: '300.00' },
      ],
      allocations: 'auto',
    });
    expect(body).not.toHaveProperty('amount');
  });

  it('sends manual rows with an amount only, and [] (all advance) when none has one', () => {
    const row = {
      documentType: 'sales_document',
      documentId: 'd1',
      number: 'INV/1',
      documentDate: '2026-09-10',
      due: '898.00',
    };
    const manual = toWireBody(
      values({
        autoAllocate: false,
        allocations: [
          { ...row, amount: '500' },
          { ...row, documentId: 'd2', amount: '' },
          { ...row, documentId: 'd3', amount: '0.00' },
        ],
      })
    );
    expect(manual.allocations).toEqual([
      { document_type: 'sales_document', document_id: 'd1', amount: '500' },
    ]);
    expect(toWireBody(values({ autoAllocate: false })).allocations).toEqual([]);
  });
});

describe('paymentListQuery', () => {
  it('maps the tabs onto direction and status', () => {
    const base = {
      preset: 'thisMonth',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-25',
      mode: null,
      q: '',
      page: 1,
    } as const;
    expect(paymentListQuery({ ...base, tab: 'in' })).toContain('direction=in');
    expect(paymentListQuery({ ...base, tab: 'void' })).toContain('status=void');
    expect(paymentListQuery({ ...base, tab: 'all' })).not.toContain('direction');
  });
});

describe('A4a — allocateExisting', () => {
  it('posts the rows in the wire shape with the key, and maps what was applied', async () => {
    const { api } = jest.requireMock('src/api/AxiosInstances') as {
      api: { post: jest.Mock };
    };
    api.post.mockResolvedValue({
      data: {
        data: {
          payment: {
            id: 'pay1',
            number: 'RCT/26-27/0090',
            direction: 'in',
            party: null,
            payment_date: '2026-09-03',
            amount: '3000.00',
            mode_breakup: [],
            primary_mode: 'cash',
            reference: '',
            note: '',
            status: 'recorded',
            unallocated_amount: '1230.00',
            allocations: [],
            party_balance_after: null,
            context: null,
            business: {},
            void_reason: null,
            voided_at: null,
            voided_by: null,
            created_by: null,
            created_at: '2026-09-03T10:00:00Z',
            bucket: 'main',
          },
          allocations: [
            {
              document_type: 'sales_document',
              document_id: 'inv1',
              number: 'INV/26-27/0311',
              amount: '1770.00',
            },
          ],
          documents: [],
        },
        meta: { party_balance: '-1230.00' },
      },
    });
    const { allocateExisting } = await import('./paymentService');
    const result = await allocateExisting(
      'pay1',
      { allocations: [{ documentType: 'sales_document', documentId: 'inv1', amount: '1770.00' }] },
      'key-1'
    );
    const [url, body, config] = api.post.mock.calls[0] as [string, unknown, { headers: unknown }];
    expect(url).toBe('/payments/pay1/allocations');
    expect(body).toEqual({
      allocations: [{ document_type: 'sales_document', document_id: 'inv1', amount: '1770.00' }],
      reason: '',
    });
    expect(config.headers).toEqual({ 'Idempotency-Key': 'key-1' });
    expect(result.payment.unallocatedAmount).toBe('1230.00');
    expect(result.payment.bucket).toBe('main');
    expect(result.applied).toEqual([
      {
        documentType: 'sales_document',
        documentId: 'inv1',
        number: 'INV/26-27/0311',
        amount: '1770.00',
      },
    ]);
    expect(result.partyBalance).toBe('-1230.00');
  });
});
