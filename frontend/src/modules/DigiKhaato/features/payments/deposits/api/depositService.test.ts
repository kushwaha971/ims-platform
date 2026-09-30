import { api } from 'src/api/AxiosInstances';

import { applyDeposit, listPartyDeposits, toDeposit, toModeBreakup } from './depositService';

/**
 * A4b — the deposit service is tested on what it SENDS and how it reads what
 * comes back (the statement service's rule).
 */
jest.mock('src/api/AxiosInstances', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  ubConfig: (extras: unknown) => extras,
}));

const WIRE = {
  id: 'd1',
  party: { id: 'p1', name: 'Asha Rao' },
  module: 'library',
  subject_type: 'library_membership',
  subject_id: 's1',
  purpose: 'Library deposit',
  expected_amount: '500.00',
  received_amount: '500.00',
  applied_amount: '120.00',
  refunded_amount: '0.00',
  held_amount: '380.00',
  status: 'held',
  note: '',
  version: 3,
  created_at: '2026-09-29T10:00:00Z',
};

beforeEach(() => jest.mocked(api.post).mockReset());

it('reads a deposit as the screens use it', () => {
  expect(toDeposit(WIRE)).toMatchObject({
    purpose: 'Library deposit',
    heldAmount: '380.00',
    appliedAmount: '120.00',
    status: 'held',
    version: 3,
  });
});

it('reads the list and the held total over it', async () => {
  /** `meta.totals.held` is the server's figure over the FILTERED set; it is not re-summed here. */
  jest
    .mocked(api.get)
    .mockResolvedValue({ data: { data: [WIRE], meta: { totals: { held: '380.00' } } } });
  const page = await listPartyDeposits('p1');
  expect(jest.mocked(api.get).mock.calls[0]?.[0]).toContain('party_id=p1');
  expect(page.heldTotal).toBe('380.00');
  expect(page.rows).toHaveLength(1);
});

it('sends one mode line, with the reference only when the money did not move as cash', () => {
  expect(
    toModeBreakup({ amount: '500.00', mode: 'cash', upiApp: '', reference: 'stale', reason: '' })
  ).toEqual([{ mode: 'cash', amount: '500.00' }]);
  expect(
    toModeBreakup({
      amount: '500.00',
      mode: 'upi',
      upiApp: 'gpay',
      reference: ' UTR9 ',
      reason: '',
    })
  ).toEqual([{ mode: 'upi', amount: '500.00', reference: 'UTR9', upi_app: 'gpay' }]);
});

it('sends only the rows with an amount, the reason, and the version it read', async () => {
  /** A row left at "" or "0.00" is not an allocation; sending it would be refused as one. */
  jest.mocked(api.post).mockResolvedValue({
    data: { data: { deposit: WIRE, settle_payment: { number: 'RCT/26-27/0202' } } },
  });
  const result = await applyDeposit(
    toDeposit(WIRE),
    {
      rows: [
        {
          documentType: 'sales_document',
          documentId: 'a',
          number: 'A',
          due: '120.00',
          amount: '120.00',
        },
        {
          documentType: 'sales_document',
          documentId: 'b',
          number: 'B',
          due: '50.00',
          amount: '0.00',
        },
        { documentType: 'sales_document', documentId: 'c', number: 'C', due: '50.00', amount: '' },
      ],
      reason: ' Late return fine ',
    },
    'key-1'
  );
  const [, body, config] = jest.mocked(api.post).mock.calls[0] ?? [];
  expect(body).toEqual({
    allocations: [{ document_type: 'sales_document', document_id: 'a', amount: '120.00' }],
    reason: 'Late return fine',
    version: 3,
  });
  expect(config).toEqual({ headers: { 'Idempotency-Key': 'key-1' } });
  expect(result.paymentNumber).toBe('RCT/26-27/0202');
});
