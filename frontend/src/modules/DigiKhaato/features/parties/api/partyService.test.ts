import { api } from 'src/api/AxiosInstances';

import { createParty, listParties, updateParty } from './partyService';

import type { PartyFormValues } from '../types/party.types';

/**
 * The walking skeleton's wire half (Part 32 S0-71): the service builds the path
 * and the query from the canon's inventory, and maps the snake_case envelope of
 * Part 22 §22.1 onto the domain shape — with money left as a STRING.
 *
 * MSW is not used (§19.13.3): the transport is stubbed at the module boundary
 * and the fixture body is copied from the Part 22 example, so a contract change
 * breaks this test and the backend's together.
 */
describe('partyService.listParties', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls GET /parties with the documented query parameters', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({
      data: { data: [], meta: { page: 1, page_size: 25, total: 0, total_pages: 0 } },
    });

    await listParties({
      q: 'ram',
      status: 'active',
      type: '',
      balance: '',
      collection: '',
      tag: '',
      credit: '' as const,
      ordering: '-last_activity_at',
      page: 2,
      pageSize: 25,
    });

    expect(get).toHaveBeenCalledTimes(1);
    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toContain('/parties?');
    expect(url).toContain('q=ram');
    expect(url).toContain('status=active');
    expect(url).toContain('ordering=-last_activity_at');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=25');
  });

  it('omits an empty search rather than sending q=', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({
      data: { data: [], meta: { page: 1, page_size: 25, total: 0, total_pages: 0 } },
    });

    await listParties({
      q: '',
      status: 'active',
      type: '',
      balance: '',
      collection: '',
      tag: '',
      credit: '' as const,
      ordering: '-last_activity_at',
      page: 1,
      pageSize: 25,
    });

    expect(get.mock.calls[0]?.[0] as string).not.toContain('q=');
  });

  it('maps the envelope to the domain shape and keeps the balance a string', async () => {
    jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Ramesh Traders',
            display_code: 'C-001',
            mobile: '+919876543210',
            is_customer: true,
            is_supplier: false,
            balance: '2800.00',
            status: 'active',
            last_activity_at: '2026-09-18T10:00:00Z',
          },
        ],
        meta: { page: 1, page_size: 25, total: 1, total_pages: 1 },
      },
    });

    const result = await listParties({
      q: '',
      status: 'active',
      type: '',
      balance: '',
      collection: '',
      tag: '',
      credit: '' as const,
      ordering: '-last_activity_at',
      page: 1,
      pageSize: 25,
    });

    expect(result.meta).toEqual({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
    expect(result.rows[0]?.displayCode).toBe('C-001');
    expect(result.rows[0]?.isCustomer).toBe(true);
    expect(result.rows[0]?.lastActivityAt).toBe('2026-09-18T10:00:00Z');
    // Money crosses the boundary as a string and stays one (R-TS-7).
    expect(result.rows[0]?.balance).toBe('2800.00');
    expect(typeof result.rows[0]?.balance).toBe('string');
  });

  // ── PTY-02 — the chip filters and the header figures ──────────────────────

  const PARAMS = {
    q: '',
    status: 'active' as const,
    type: '' as const,
    balance: '' as const,
    collection: '' as const,
    tag: '',
    credit: '' as const,
    ordering: '-last_activity_at',
    page: 1,
    pageSize: 25,
  };

  const bodyWith = (meta: Record<string, unknown>) => ({
    data: { data: [], meta: { page: 1, page_size: 25, total: 0, total_pages: 0, ...meta } },
  });

  it('sends the three chip filters when they are applied', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue(bodyWith({}));

    await listParties({ ...PARAMS, type: 'supplier', balance: 'i_owe', collection: 'overdue' });

    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toContain('type=supplier');
    expect(url).toContain('balance=i_owe');
    expect(url).toContain('collection=overdue');
  });

  it('omits an unapplied chip rather than sending it empty', async () => {
    /**
     * The URL is the request's identity, and two spellings of one request cost
     * real things: `partyListWarmup` claims a speculative fetch by comparing
     * the arguments behind it, and FR-15's stale cache is keyed by the filter
     * signature. `?balance=` and no `balance` would be two keys for one list.
     *
     * The server is not the reason — it answers `?balance=` with 200 and an
     * unfiltered list, checked against the running API. An earlier draft of
     * this test asserted the same thing for a stated reason that was simply
     * untrue, which is the sort of comment that outlives the code it explains.
     */
    const get = jest.spyOn(api, 'get').mockResolvedValue(bodyWith({}));

    await listParties(PARAMS);

    const url = get.mock.calls[0]?.[0] as string;
    expect(url).not.toContain('type=');
    expect(url).not.toContain('balance=');
    expect(url).not.toContain('collection=');
  });

  it('reads the totals from meta.totals, which is where the server puts them', async () => {
    /**
     * The defect: this read `meta.totals_receivable` and `meta.totals_payable`,
     * flat — a shape the endpoint has never sent. Nothing threw. The
     * destructure produced `undefined`, the service fell through to its
     * page-sum fallback, and the screen showed the twenty-five rows' sum under
     * the caption "From the 25 customers on this page". Correct arithmetic,
     * honest caption, and not the number the merchant opened the screen for.
     *
     * No fixture in this file carried a totals block at all, which is why it
     * survived: the mapping was never exercised, only the shape without it.
     */
    jest.spyOn(api, 'get').mockResolvedValue(
      bodyWith({ totals: { receivable: '2800.00', payable: '900.00', count: 2 } })
    );

    const result = await listParties(PARAMS);

    expect(result.totals).toEqual({ receivable: '2800.00', payable: '900.00' });
    expect(result.totalsScope).toBe('filtered');
  });

  it('keeps money a string on the way out of the totals too', async () => {
    jest.spyOn(api, 'get').mockResolvedValue(
      bodyWith({ totals: { receivable: '1234.50', payable: '0.00', count: 1 } })
    );

    const result = await listParties(PARAMS);

    expect(typeof result.totals?.receivable).toBe('string');
    expect(result.totals?.payable).toBe('0.00');
  });

  it('falls back to the page sum when the server sends no totals', async () => {
    /**
     * Not dead defensiveness. This client deploys separately from the API it
     * talks to, so a frontend that ships ahead of a backend gets a `meta`
     * without the key — and an honest page sum, labelled as one, beats
     * `undefined` formatted as "₹NaN".
     */
    jest.spyOn(api, 'get').mockResolvedValue(bodyWith({}));

    const result = await listParties(PARAMS);

    expect(result.totals).toBeNull();
    expect(result.totalsScope).toBe('page');
  });

  it('does not read the flat totals_* keys the screen used to expect', async () => {
    /**
     * A guard against the fix being reverted by a well-meaning "the old code
     * read these" — and against a server that starts sending both. The nested
     * block is the contract (Part 22 §22.4); flat keys are not a second
     * spelling of it, they are nothing.
     */
    jest.spyOn(api, 'get').mockResolvedValue(
      bodyWith({ totals_receivable: '9999.00', totals_payable: '9999.00' })
    );

    const result = await listParties(PARAMS);

    expect(result.totals).toBeNull();
    expect(result.totalsScope).toBe('page');
  });
});

describe('partyService write path', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the tags the merchant put on the form', async () => {
    /**
     * The defect this test exists for, found by watching the network rather
     * than the screen.
     *
     * PTY-05 added `tags` to the form values, the Yup schema, the picker and
     * the drawer. Every unit test passed, the chips rendered, the party saved
     * with a 201 — and `toWireBody` had never been taught the field, so the
     * request body went out without it and the tag a merchant created at the
     * counter was silently discarded. The FRD's primary flow ("type Camp, press
     * Create, Save") did nothing at all.
     */
    const post = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: DETAIL_ROW, meta: {} } });

    await createParty({ ...FORM_VALUES, tags: ['Camp Area', 'Route 2'] }, 'key-1');

    expect(post).toHaveBeenCalledWith(
      '/parties',
      expect.objectContaining({ tags: ['Camp Area', 'Route 2'] }),
      expect.anything()
    );
  });

  it('sends an EMPTY tag list rather than omitting the key', async () => {
    /**
     * The two mean different things on PATCH: the server REPLACES the set when
     * the key is present and leaves it alone when it is absent (FR-4). So a
     * merchant who takes the last chip off a party and saves has to send
     * `tags: []`, or the removal is a no-op and the chip is back on the next
     * render.
     */
    const patch = jest
      .spyOn(api, 'patch')
      .mockResolvedValue({ data: { data: DETAIL_ROW, meta: {} } });

    await updateParty('p1', { ...FORM_VALUES, tags: [] });

    expect(patch).toHaveBeenCalledWith(
      '/parties/p1',
      expect.objectContaining({ tags: [] }),
      expect.anything()
    );
  });
});

/** The minimum a form can submit; each test overrides only what it is about. */
const FORM_VALUES: PartyFormValues = {
  name: 'Ramesh Traders',
  mobile: null,
  isCustomer: true,
  isSupplier: false,
  displayCode: '',
  altPhone: null,
  email: null,
  gstin: null,
  stateCode: '',
  billingLine1: '',
  billingCity: '',
  billingPincode: null,
  notes: '',
  creditLimit: null,
  creditDays: '',
  collectionDate: '',
  smsOptIn: true,
  consentSource: '',
  tags: [],
  openingAmount: null,
  openingDirection: 'debit',
  openingAsOf: '2026-04-01',
};

const DETAIL_ROW = {
  id: 'p1',
  name: 'Ramesh Traders',
  display_code: null,
  mobile: null,
  is_customer: true,
  is_supplier: false,
  balance: '0.00',
  status: 'active',
  last_activity_at: null,
  tags: [],
  alt_phone: null,
  email: null,
  gstin: null,
  gst_registration: 'unregistered',
  state_code: null,
  notes: '',
  collection_date: null,
  credit_limit: null,
  credit_days: null,
  sms_opt_in: true,
  consent_source: null,
  billing_address: {},
  opening_balance_amount: null,
  opening_balance_direction: null,
  opening_balance_as_of: null,
  created_at: '2026-01-05T08:00:00Z',
};
