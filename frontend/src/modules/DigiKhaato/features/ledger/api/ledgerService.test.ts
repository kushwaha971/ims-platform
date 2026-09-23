import { API_PATHS } from 'src/api/APIPaths';
import { api } from 'src/api/AxiosInstances';

import {
  correctLedgerEntry,
  fetchEntryHistory,
  listPartyEntries,
  postLedgerEntry,
  reverseLedgerEntry,
} from './ledgerService';

import type { LedgerEntry, LedgerEntryFormValues } from '../types/ledger.types';

/**
 * The service boundary, tested on what it SENDS and what it returns.
 *
 * `e2e/parties.mjs` exists because of a defect exactly this shape: the party
 * form's tag chips rendered, validated and saved with a 201 for a week while
 * `toWireBody` silently dropped every one of them. Every component test passed.
 */
jest.mock('src/api/AxiosInstances', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  ubConfig: (extras: unknown) => extras,
}));

const mockApi = api as unknown as { get: jest.Mock; post: jest.Mock };

const PARTY = '11111111-1111-4111-8111-111111111111';

const WIRE_ROW = {
  id: 'e1',
  party_id: PARTY,
  direction: 'credit',
  amount: '300.00',
  entry_date: '2026-09-17',
  entry_type: 'manual_got',
  source_type: 'manual',
  source_id: null,
  note: 'Part payment',
  payment_mode: 'upi',
  reference: 'UTR123',
  status: 'posted',
  reversed_by_id: null,
  reverses_id: null,
  supersedes_id: null,
  reason: null,
  created_by: { id: 'u2', name: 'Sunita' },
  created_at: '2026-09-17T10:00:00Z',
};

const values = (over: Partial<LedgerEntryFormValues> = {}): LedgerEntryFormValues => ({
  direction: 'debit',
  amount: '500.00',
  entryDate: '2026-09-17',
  note: '',
  paymentMode: '',
  upiApp: '',
  reference: '',
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('posting an entry', () => {
  const resolveOk = () =>
    mockApi.post.mockResolvedValue({
      data: { data: WIRE_ROW, meta: { party_balance: '2500.00', warnings: [] } },
    });

  it('sends the idempotency key as a header, where the server reads it', async () => {
    /**
     * Canon rule 5, and the most damaging double-submit in the product: a
     * merchant on a 2G connection taps Save, the response is lost, they tap
     * again. A key in the body rather than the header is a key the server's
     * decorator never sees.
     */
    resolveOk();

    await postLedgerEntry(PARTY, values(), 'key-1');

    const [url, , config] = mockApi.post.mock.calls[0];
    expect(url).toBe(API_PATHS.PARTY_LEDGER_ENTRIES(PARTY));
    expect(config.headers['Idempotency-Key']).toBe('key-1');
  });

  it('does not send a payment mode against money that went out', async () => {
    /**
     * EC-9. The merchant typed a UTR, switched direction and saved; the client
     * keeps the value in form state so switching back does not lose it. The
     * server drops both silently for a debit, so sending them would work — and
     * would put a UTR in the request log against money that arrived by no
     * method at all.
     */
    resolveOk();

    await postLedgerEntry(PARTY, values({ paymentMode: 'upi', reference: 'UTR1' }), 'k');

    const [, body] = mockApi.post.mock.calls[0];
    expect(body).not.toHaveProperty('payment_mode');
    expect(body).not.toHaveProperty('reference');
  });

  it('sends both when money came in', async () => {
    resolveOk();

    await postLedgerEntry(
      PARTY,
      values({ direction: 'credit', paymentMode: 'upi', reference: ' UTR1 ' }),
      'k'
    );

    const [, body] = mockApi.post.mock.calls[0];
    expect(body).toMatchObject({ payment_mode: 'upi', reference: 'UTR1' });
  });

  it('sends the UPI app with a UPI credit', async () => {
    /** "PhonePe kiya" is the fact the merchant recorded; it must reach the
     *  server rather than stay in form state. */
    resolveOk();

    await postLedgerEntry(
      PARTY,
      values({ direction: 'credit', paymentMode: 'upi', upiApp: 'phonepe' }),
      'k'
    );

    expect(mockApi.post.mock.calls[0][1]).toMatchObject({
      payment_mode: 'upi',
      upi_app: 'phonepe',
    });
  });

  it('drops a leftover UPI app when the mode is not UPI', async () => {
    /** The merchant tapped PhonePe, then Cash. The app is form state from a
     *  chip they moved off; sending it would ask the server to discard it. */
    resolveOk();

    await postLedgerEntry(
      PARTY,
      values({ direction: 'credit', paymentMode: 'cash', upiApp: 'phonepe' }),
      'k'
    );

    const body = mockApi.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.payment_mode).toBe('cash');
    expect(body.upi_app).toBeUndefined();
  });

  it('sends the override only when there is one', async () => {
    /**
     * "Save anyway" is not a form field — it is what a button means — so it
     * must never survive a form reset and reach a later, ordinary entry.
     */
    resolveOk();

    await postLedgerEntry(PARTY, values(), 'k');
    expect(mockApi.post.mock.calls[0][1]).not.toHaveProperty('override');

    await postLedgerEntry(PARTY, values(), 'k', { override: true });
    expect(mockApi.post.mock.calls[1][1]).toMatchObject({ override: true });
  });

  it('keeps the amount a string, all the way through', async () => {
    /** R-TS-7 / canon rule 3. There is no `Number()` in this file. */
    resolveOk();

    await postLedgerEntry(PARTY, values({ amount: '1234567.89' }), 'k');

    expect(mockApi.post.mock.calls[0][1].amount).toBe('1234567.89');
    expect(typeof mockApi.post.mock.calls[0][1].amount).toBe('string');
  });

  it('returns the balance THIS transaction produced', async () => {
    /**
     * FR-3. The header replaces its figure from here rather than refetching,
     * because a second read a moment later can pick up somebody else's entry
     * and show the merchant a number that was never true of what they just did.
     */
    resolveOk();

    const result = await postLedgerEntry(PARTY, values(), 'k');

    expect(result.balance).toBe('2500.00');
    expect(result.entry.paymentMode).toBe('upi');
    expect(result.entry.createdBy).toEqual({ id: 'u2', name: 'Sunita' });
  });

  it('maps a credit-limit warning into the shape the drawer prints', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        data: WIRE_ROW,
        meta: {
          party_balance: '50300.00',
          warnings: [
            {
              code: 'credit_limit_exceeded',
              limit: '50000.00',
              balance_after: '50300.00',
              over_by: '300.00',
            },
          ],
        },
      },
    });

    const result = await postLedgerEntry(PARTY, values(), 'k');

    expect(result.warnings).toEqual([
      {
        code: 'credit_limit_exceeded',
        limit: '50000.00',
        balanceAfter: '50300.00',
        overBy: '300.00',
      },
    ]);
  });

  it('leaves the header alone rather than breaking a save an older server accepted', async () => {
    /**
     * This client deploys separately from its API. A `meta` without
     * `party_balance` must not throw on a 201 that already wrote the entry.
     */
    mockApi.post.mockResolvedValue({ data: { data: WIRE_ROW } });

    const result = await postLedgerEntry(PARTY, values(), 'k');

    expect(result.balance).toBe('');
    expect(result.entry.id).toBe('e1');
  });
});

describe('reading a khata', () => {
  it('asks the party-scoped route, with no query when there is nothing to ask', async () => {
    /**
     * `toQueryString` drops undefined, so a first page is `/…/ledger-entries`
     * and not `/…/ledger-entries?cursor=&limit=`. The URL is the request's
     * identity, and two spellings of one request are two cache entries.
     */
    mockApi.get.mockResolvedValue({
      data: { data: [], meta: { next_cursor: null, has_more: false } },
    });

    await listPartyEntries(PARTY);

    expect(mockApi.get.mock.calls[0][0]).toBe(API_PATHS.PARTY_LEDGER_ENTRIES(PARTY));
  });

  it('carries the cursor when there is one', async () => {
    mockApi.get.mockResolvedValue({
      data: { data: [], meta: { next_cursor: null, has_more: false } },
    });

    await listPartyEntries(PARTY, { cursor: 'abc123', limit: 20 });

    expect(mockApi.get.mock.calls[0][0]).toContain('cursor=abc123');
    expect(mockApi.get.mock.calls[0][0]).toContain('limit=20');
  });

  it('reports no summary rather than zeros when the page did not carry one', async () => {
    /**
     * `null` and `{0, 0, 0}` are different claims. The second says this party
     * has never traded; the first says this response did not answer that — and
     * the header draws nothing rather than "You gave in all ₹0.00" over a
     * khata full of entries the merchant scrolled past.
     */
    mockApi.get.mockResolvedValue({
      data: { data: [WIRE_ROW], meta: { next_cursor: 'c', has_more: true } },
    });

    const page = await listPartyEntries(PARTY, { cursor: 'c' });

    expect(page.summary).toBeNull();
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('c');
  });

  it('maps the summary when the first page carried one', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        data: [WIRE_ROW],
        meta: {
          next_cursor: null,
          has_more: false,
          summary: { total_debit: '1000.00', total_credit: '300.00', entry_count: 4 },
        },
      },
    });

    const page = await listPartyEntries(PARTY);

    expect(page.summary).toEqual({
      totalDebit: '1000.00',
      totalCredit: '300.00',
      entryCount: 4,
    });
  });

  it('turns a missing note or reference into an empty string, not undefined', async () => {
    /** So nothing downstream has to ask whether absent means "none" or "unknown". */
    mockApi.get.mockResolvedValue({
      data: {
        data: [{ ...WIRE_ROW, note: null, reference: null }],
        meta: { next_cursor: null, has_more: false },
      },
    });

    const page = await listPartyEntries(PARTY);

    const [row] = page.rows;
    expect(row?.note).toBe('');
    expect(row?.reference).toBe('');
  });
});

/**
 * LED-03 on the wire.
 *
 * The correction body is built by DIFFERENCE, and that is the part no component
 * test can see: the drawer opens on the original's values, so a form submit
 * carries six fields whether or not the merchant touched them. What has to
 * leave the browser is the one they changed — otherwise the audit row's
 * `changed_fields` names six, and the server, comparing the whole form against
 * the original, refuses a correction outright when the only edit was reverted.
 */
const ORIGINAL: LedgerEntry = {
  id: 'entry-1',
  partyId: PARTY,
  direction: 'debit',
  amount: '500.00',
  entryDate: '2026-09-17',
  entryType: 'manual_gave',
  sourceType: 'manual',
  sourceId: null,
  note: 'Cement bags',
  paymentMode: null,
  upiApp: null,
  reference: '',
  status: 'posted',
  reversedById: null,
  reversesId: null,
  supersedesId: null,
  reason: null,
  createdBy: null,
  createdAt: '2026-09-17T10:00:00Z',
};

const unchangedForm = {
  direction: ORIGINAL.direction,
  amount: ORIGINAL.amount,
  entryDate: ORIGINAL.entryDate,
  note: ORIGINAL.note,
  paymentMode: '' as const,
  upiApp: '' as const,
  reference: ORIGINAL.reference,
};

describe('correcting an entry', () => {
  beforeEach(() => {
    mockApi.post.mockReset();
    mockApi.post.mockResolvedValue({
      data: {
        data: { ...WIRE_ROW, id: 'replacement', amount: '550.00', supersedes_id: 'entry-1' },
        meta: { party_balance: '2850.00', original_id: 'entry-1', reversal_id: 'reversal-1' },
      },
    });
  });

  it('sends only the field that changed, plus the reason', async () => {
    await correctLedgerEntry(
      ORIGINAL,
      { ...unchangedForm, amount: '550.00', reason: 'Typo' },
      'k1'
    );

    const [url, body] = mockApi.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe(API_PATHS.LEDGER_ENTRY_CORRECT('entry-1'));
    expect(body).toEqual({ amount: '550.00', reason: 'Typo' });
  });

  it('sends the reason alone when nothing else moved', async () => {
    /* The server answers 400 "Nothing changed — use Reverse if the entry should
       not exist", which is the message a merchant needs. Sending the whole form
       would produce the same refusal for a reason nobody could act on: the
       server would see six fields, all equal, and say the same thing anyway. */
    await correctLedgerEntry(ORIGINAL, { ...unchangedForm, reason: 'Nothing' }, 'k1');

    const [, body] = mockApi.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toEqual({ reason: 'Nothing' });
  });

  it('carries a payment mode when a debit is corrected into a credit', async () => {
    /* EC-1, and the trap in it: the original has no mode to inherit, so the
       server refuses a credit without one. The control was never touched — the
       merchant only flipped the direction — and a body built purely by
       difference would omit the field and get a validation error about a box
       the merchant did fill in. */
    await correctLedgerEntry(
      ORIGINAL,
      { ...unchangedForm, direction: 'credit', paymentMode: 'cash', reason: 'Was a payment' },
      'k1'
    );

    const [, body] = mockApi.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toEqual({ direction: 'credit', payment_mode: 'cash', reason: 'Was a payment' });
  });

  it('never sends a payment mode or a reference on a debit', async () => {
    /* A reference belongs to the mode that has one. Kept on a debit it would be
       a UTR in the request log against money that went out by no method at all
       — and the server drops both anyway, so sending them buys nothing. */
    await correctLedgerEntry(
      ORIGINAL,
      { ...unchangedForm, amount: '600.00', paymentMode: 'upi', reference: 'UTR9', reason: 'Fix' },
      'k1'
    );

    const [, body] = mockApi.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toEqual({ amount: '600.00', reason: 'Fix' });
  });

  it('sends the UPI app when only the app changed', async () => {
    /** A correction from PhonePe to Google Pay is a real correction; a body
     *  built without the app would be "nothing changed" and refused. */
    const upiOriginal: LedgerEntry = {
      ...ORIGINAL,
      direction: 'credit',
      entryType: 'manual_got',
      paymentMode: 'upi',
      upiApp: 'phonepe',
    };
    await correctLedgerEntry(
      upiOriginal,
      { ...unchangedForm, direction: 'credit', paymentMode: 'upi', upiApp: 'gpay', reason: 'App' },
      'k1'
    );

    const [, body] = mockApi.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toEqual({ upi_app: 'gpay', reason: 'App' });
  });

  it('leaves the UPI app out when it did not change', async () => {
    /** Omitted means "as it was" on the server, which is what keeps PhonePe on
     *  an entry whose amount alone was corrected. */
    const upiOriginal: LedgerEntry = {
      ...ORIGINAL,
      direction: 'credit',
      entryType: 'manual_got',
      paymentMode: 'upi',
      upiApp: 'phonepe',
    };
    await correctLedgerEntry(
      upiOriginal,
      {
        ...unchangedForm,
        direction: 'credit',
        paymentMode: 'upi',
        upiApp: 'phonepe',
        amount: '550.00',
        reason: 'Typo',
      },
      'k1'
    );

    const [, body] = mockApi.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toEqual({ amount: '550.00', reason: 'Typo' });
  });

  it('returns the replacement, the balance and both ids', async () => {
    const result = await correctLedgerEntry(
      ORIGINAL,
      { ...unchangedForm, amount: '550.00', reason: 'Typo' },
      'k1'
    );

    expect(result.entry.id).toBe('replacement');
    expect(result.balance).toBe('2850.00');
    expect(result.originalId).toBe('entry-1');
    expect(result.reversalId).toBe('reversal-1');
  });
});

describe('reversing an entry', () => {
  it('posts the trimmed reason with the idempotency key', async () => {
    /* The key is what stops a lost response on a 2G connection from becoming a
       SECOND reversal — and the second one moves the balance again, by the same
       amount, in the same direction. */
    mockApi.post.mockReset();
    mockApi.post.mockResolvedValue({
      data: {
        data: { ...WIRE_ROW, id: 'reversal-1', entry_type: 'reversal', reverses_id: 'entry-1' },
        meta: { party_balance: '2300.00', original_id: 'entry-1', reversal_id: 'reversal-1' },
      },
    });

    await reverseLedgerEntry('entry-1', '  Duplicate  ', 'key-7');

    const [url, body, config] = mockApi.post.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(API_PATHS.LEDGER_ENTRY_REVERSE('entry-1'));
    expect(body).toEqual({ reason: 'Duplicate' });
    expect(config.headers['Idempotency-Key']).toBe('key-7');
  });
});

describe('the timeline request', () => {
  it('asks for the struck-through rows only when the toggle is on', async () => {
    mockApi.get.mockReset();
    mockApi.get.mockResolvedValue({
      data: { data: [], meta: { next_cursor: null, has_more: false } },
    });

    await listPartyEntries(PARTY, {});
    await listPartyEntries(PARTY, { includeReversed: true });

    const [clean] = mockApi.get.mock.calls[0] as [string];
    const [full] = mockApi.get.mock.calls[1] as [string];
    /* `false` is sent as NOTHING rather than as `include_reversed=false`: the
       ordinary request stays the ordinary URL, so a cached one is not missed
       over a parameter nobody needed. */
    expect(clean).not.toContain('include_reversed');
    expect(full).toContain('include_reversed=true');
  });

  it('reads the correction chain off the detail response', async () => {
    mockApi.get.mockReset();
    mockApi.get.mockResolvedValue({
      data: { data: { ...WIRE_ROW, history: [WIRE_ROW, { ...WIRE_ROW, id: 'e2' }] } },
    });

    const history = await fetchEntryHistory('entry-1');

    expect(history.map((row) => row.id)).toEqual(['e1', 'e2']);
  });

  it('treats a response without a history as an empty chain', async () => {
    /* This client deploys separately from its API, so a frontend that ships
       ahead of the backend gets a detail response with no `history` key — and a
       sheet showing nothing is better than one that throws. */
    mockApi.get.mockReset();
    mockApi.get.mockResolvedValue({ data: { data: WIRE_ROW } });

    expect(await fetchEntryHistory('entry-1')).toEqual([]);
  });
});
