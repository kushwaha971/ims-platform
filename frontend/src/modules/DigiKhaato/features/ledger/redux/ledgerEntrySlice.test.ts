import reducer, {
  correctionsVisibilityToggled,
  ledgerTimelineOpened,
  resetLedgerEntries,
  type LedgerEntryState,
} from './ledgerEntrySlice';
import { correctEntry, fetchPartyEntries, postEntry, reverseEntry } from './ledgerEntryThunk';

import type { LedgerEntry } from '../types/ledger.types';

/**
 * The timeline slice, and the three things it has to get right that no
 * component test would notice: where a posted entry is inserted, what a "load
 * more" response may overwrite, and which party a late response belongs to.
 */

const PARTY = 'p1';

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1',
  partyId: PARTY,
  direction: 'debit',
  amount: '500.00',
  entryDate: '2026-09-17',
  entryType: 'manual_gave',
  sourceType: 'manual',
  sourceId: null,
  note: '',
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
  ...over,
});

const opened = (partyId = PARTY): LedgerEntryState =>
  reducer(undefined, ledgerTimelineOpened(partyId));

const loaded = (rows: LedgerEntry[], over: Record<string, unknown> = {}): LedgerEntryState =>
  reducer(opened(), {
    type: fetchPartyEntries.fulfilled.type,
    payload: {
      rows,
      nextCursor: null,
      hasMore: false,
      summary: { totalDebit: '500.00', totalCredit: '0.00', entryCount: rows.length },
      ...over,
    },
    meta: { arg: { partyId: PARTY }, requestId: 'r', requestStatus: 'fulfilled' },
  });

const posted = (state: LedgerEntryState, saved: LedgerEntry): LedgerEntryState =>
  reducer(state, {
    type: postEntry.fulfilled.type,
    payload: { entry: saved, balance: '2800.00', warnings: [] },
    meta: { arg: { partyId: PARTY }, requestId: 'r2', requestStatus: 'fulfilled' },
  });

describe('a posted entry', () => {
  it('goes to the top when it is the newest thing that happened', async () => {
    const state = loaded([entry({ id: 'old', entryDate: '2026-09-16' })]);

    const next = posted(state, entry({ id: 'new', entryDate: '2026-09-17' }));

    expect(next.rows.map((row) => row.id)).toEqual(['new', 'old']);
  });

  it('goes where its DATE says when it was backdated', async () => {
    /**
     * FR-3 alternate B. An entry dated last Tuesday belongs under last
     * Tuesday's header, and putting it at the top would show the merchant their
     * entry in a position it will not be in after the next reload — which is
     * the sort of thing that teaches somebody not to trust the screen.
     */
    const state = loaded([
      entry({ id: 'a', entryDate: '2026-09-17' }),
      entry({ id: 'c', entryDate: '2026-09-10' }),
    ]);

    const next = posted(state, entry({ id: 'b', entryDate: '2026-09-15' }));

    expect(next.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a same-day tie by when it was written, as the server does', async () => {
    const state = loaded([
      entry({ id: 'later', entryDate: '2026-09-17', createdAt: '2026-09-17T12:00:00Z' }),
      entry({ id: 'earlier', entryDate: '2026-09-17', createdAt: '2026-09-17T08:00:00Z' }),
    ]);

    const next = posted(
      state,
      entry({ id: 'middle', entryDate: '2026-09-17', createdAt: '2026-09-17T10:00:00Z' })
    );

    expect(next.rows.map((row) => row.id)).toEqual(['later', 'middle', 'earlier']);
  });

  it('is left for the next page when it is older than everything loaded', async () => {
    /**
     * A partially loaded timeline. Appending would put the entry at the bottom
     * of what happens to be on screen, where it reads as "the oldest entry in
     * this khata" — and the next page would then load it a second time.
     */
    const state = {
      ...loaded([entry({ id: 'a', entryDate: '2026-09-17' })], {
        nextCursor: 'cur',
        hasMore: true,
      }),
    };

    const next = posted(state, entry({ id: 'ancient', entryDate: '2026-01-01' }));

    expect(next.rows.map((row) => row.id)).toEqual(['a']);
  });

  it('is appended when the whole khata is already on screen', async () => {
    const state = loaded([entry({ id: 'a', entryDate: '2026-01-01' })]);

    const next = posted(state, entry({ id: 'older-but-complete', entryDate: '2026-01-01' }));

    expect(next.rows.map((row) => row.id)).toContain('older-but-complete');
  });

  it('does not land on a khata the merchant has moved on from', async () => {
    const state = opened('other-party');

    const next = posted(state, entry({ partyId: PARTY }));

    expect(next.rows).toEqual([]);
  });
});

describe('loading more', () => {
  const morePage = (state: LedgerEntryState, rows: LedgerEntry[], summary?: unknown) =>
    reducer(state, {
      type: fetchPartyEntries.fulfilled.type,
      payload: { rows, nextCursor: null, hasMore: false, summary: summary ?? null },
      meta: {
        arg: { partyId: PARTY, cursor: 'cur' },
        requestId: 'r3',
        requestStatus: 'fulfilled',
      },
    });

  it('appends rather than replacing what the merchant is reading', () => {
    const state = loaded([entry({ id: 'a' })], { nextCursor: 'cur', hasMore: true });

    const next = morePage(state, [entry({ id: 'b', entryDate: '2026-09-01' })]);

    expect(next.rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('does not show the same entry twice at a page boundary', () => {
    /**
     * A cursor is a position in an ordering, and an entry posted between two
     * page requests shifts every later row by one — so the second page can hand
     * back a row the client already holds. Appending blindly puts it on screen
     * twice with the same id, which React reports as a duplicate key in a
     * console nobody reads.
     */
    const state = loaded([entry({ id: 'a' }), entry({ id: 'b' })], {
      nextCursor: 'cur',
      hasMore: true,
    });

    const next = morePage(state, [entry({ id: 'b' }), entry({ id: 'c' })]);

    expect(next.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the header figures alone', () => {
    /**
     * Only the first page carries `summary`; a later page omits the key. Writing
     * that absence in would blank the two totals the merchant is looking at,
     * because they scrolled.
     */
    const state = loaded([entry({ id: 'a' })], { nextCursor: 'cur', hasMore: true });

    const next = morePage(state, [entry({ id: 'b' })]);

    expect(next.summary).toEqual({ totalDebit: '500.00', totalCredit: '0.00', entryCount: 1 });
  });

  it('does not put the whole timeline into a loading state', () => {
    /**
     * Sharing `status` with the first page would replace fifty rows the
     * merchant is reading with a skeleton, in order to fetch the fifty-first.
     */
    const state = loaded([entry({ id: 'a' })], { nextCursor: 'cur', hasMore: true });

    const next = reducer(state, {
      type: fetchPartyEntries.pending.type,
      meta: { arg: { partyId: PARTY, cursor: 'cur' }, requestId: 'r4', requestStatus: 'pending' },
    });

    expect(next.moreStatus).toBe('loading');
    expect(next.status).toBe('succeeded');
    expect(next.rows).toHaveLength(1);
  });
});

describe('opening the page', () => {
  it('clears the previous party’s entries', () => {
    const state = loaded([entry({ id: 'a' })]);

    expect(reducer(state, ledgerTimelineOpened('someone-else')).rows).toEqual([]);
  });

  it('keeps what is on screen when the SAME party is reopened', () => {
    /**
     * Navigating list → party → back → the same party must not blank a khata
     * the client already holds while a fetch it knows the answer to goes out.
     */
    const state = loaded([entry({ id: 'a' })]);

    expect(reducer(state, ledgerTimelineOpened(PARTY)).rows).toHaveLength(1);
  });

  it('discards a page that belongs to a khata the merchant has left', () => {
    const state = opened('other-party');

    const next = reducer(state, {
      type: fetchPartyEntries.fulfilled.type,
      payload: { rows: [entry()], nextCursor: null, hasMore: false, summary: null },
      meta: { arg: { partyId: PARTY }, requestId: 'r', requestStatus: 'fulfilled' },
    });

    expect(next.rows).toEqual([]);
  });

  it('forgets everything on a reset', () => {
    expect(reducer(loaded([entry()]), resetLedgerEntries()).rows).toEqual([]);
  });
});

/**
 * LED-03 — what a reversal and a correction do to a list the merchant is
 * already looking at.
 *
 * Neither refetches, so this reducer is the only thing standing between "the
 * server undid it" and "the screen still shows it as counting". Every test here
 * is about a number or a row the merchant would notice.
 */
describe('a reversal, on the rows already on screen', () => {
  const original = entry({ id: 'original', amount: '500.00', direction: 'debit' });
  const reversal = entry({
    id: 'reversal',
    direction: 'credit',
    entryType: 'reversal',
    reversesId: 'original',
    /* BR-7 gives the reversal the ORIGINAL's `entry_date`, so `created_at` is
       the only thing that orders the pair — and it is later, because the
       reversal was written afterwards. The timeline orders by `-entry_date`
       then `-created_at`, so the reversal sits directly above what it undid,
       which is where a merchant reading the day would look for it. */
    createdAt: '2026-09-17T11:00:00Z',
  });

  const withRows = (over: Partial<LedgerEntryState> = {}): LedgerEntryState => ({
    ...opened(),
    rows: [original],
    status: 'succeeded',
    summary: { totalDebit: '2800.00', totalCredit: '0.00', entryCount: 1 },
    ...over,
  });

  const reversed = (state: LedgerEntryState): LedgerEntryState =>
    reducer(state, {
      type: reverseEntry.fulfilled.type,
      payload: {
        entry: reversal,
        balance: '2300.00',
        originalId: 'original',
        reversalId: 'reversal',
      },
      meta: { arg: { entry: original, reason: 'Duplicate', idempotencyKey: 'k' } },
    });

  it('takes the undone row off a clean timeline', () => {
    /* FR-7's default. One typo must not turn one line into three on the screen
       a merchant reads at the counter — so with the toggle off the original
       leaves and the reversal never arrives. */
    expect(reversed(withRows()).rows).toHaveLength(0);
  });

  it('strikes it through instead when corrections are shown', () => {
    const next = reversed(withRows({ showCorrections: true }));

    expect(next.rows.map((row) => row.id)).toEqual(['reversal', 'original']);
    expect(next.rows.find((row) => row.id === 'original')?.status).toBe('reversed');
  });

  it('takes the reversed amount out of the running totals', () => {
    /* The defect this prevents: a khata header reading "You gave in all
       ₹2,800" over a ₹2,300 balance. It is the same class as the header that
       did not move after a save — LED-01 shipped that one — one line further
       down the same card. */
    const next = reversed(withRows());

    expect(next.summary).toEqual({ totalDebit: '2300.00', totalCredit: '0.00', entryCount: 0 });
  });

  it("leaves another party's timeline alone", () => {
    /* The row is found by id and there is no id to find, so nothing happens —
       which is what has to happen: a reversal answered after the merchant has
       navigated to the next customer must not delete a row from THEIR khata. */
    const next = reversed(withRows({ rows: [entry({ id: 'somebody-else' })] }));

    expect(next.rows.map((row) => row.id)).toEqual(['somebody-else']);
  });
});

describe('undoing a write-off (CR-2026-09-24-A)', () => {
  /* A write-off is in its own bucket, so reversing one must move `writtenOff`
     and leave "You gave in all" / "You got in all" exactly where they were —
     the reverse of the QA defect, where got absorbed it. */
  const writeOff = entry({
    id: 'wo',
    direction: 'credit',
    entryType: 'write_off',
    amount: '2500.00',
    note: 'Shop closed',
    reason: 'Shop closed',
  });
  const reversal = entry({
    id: 'wo-rev',
    direction: 'debit',
    entryType: 'reversal',
    amount: '2500.00',
    reversesId: 'wo',
    createdAt: '2026-09-17T11:00:00Z',
  });

  it('takes it out of written off, not out of got', () => {
    const next = reducer(
      {
        ...opened(),
        rows: [writeOff],
        status: 'succeeded',
        summary: {
          totalDebit: '2800.00',
          totalCredit: '300.00',
          writtenOff: { debit: '0.00', credit: '2500.00' },
          entryCount: 4,
        },
      },
      {
        type: reverseEntry.fulfilled.type,
        payload: { entry: reversal, balance: '2500.00', originalId: 'wo', reversalId: 'wo-rev' },
        meta: { arg: { entry: writeOff, reason: 'Paid after all', idempotencyKey: 'k' } },
      }
    );

    expect(next.summary).toEqual({
      totalDebit: '2800.00',
      totalCredit: '300.00',
      writtenOff: { debit: '0.00', credit: '0.00' },
      entryCount: 3,
    });
  });
});

describe('a correction, on the rows already on screen', () => {
  const original = entry({ id: 'original', amount: '500.00' });
  const replacement = entry({
    id: 'replacement',
    amount: '550.00',
    supersedesId: 'original',
    createdAt: '2026-09-17T11:00:00Z',
  });

  const corrected = reducer(
    {
      ...opened(),
      rows: [original],
      status: 'succeeded',
      summary: { totalDebit: '2800.00', totalCredit: '0.00', entryCount: 1 },
    },
    {
      type: correctEntry.fulfilled.type,
      payload: {
        entry: replacement,
        balance: '2850.00',
        originalId: 'original',
        reversalId: 'reversal',
      },
      meta: { arg: { entry: original, values: { reason: 'Typo' }, idempotencyKey: 'k' } },
    }
  );

  it('puts the replacement where the mistake was', () => {
    expect(corrected.rows.map((row) => row.id)).toEqual(['replacement']);
  });

  it('moves the totals by the DIFFERENCE, not by either amount', () => {
    /* The arithmetic a correction is most likely to get wrong, because it is
       the one place in the ledger a total moves by neither row's own figure:
       2800 − 500 + 550. */
    expect(corrected.summary).toEqual({
      totalDebit: '2850.00',
      totalCredit: '0.00',
      entryCount: 1,
    });
  });

  it('keeps the count when a row is replaced and drops it when one is undone', () => {
    // A correction leaves the same number of standing rows; a reversal does not.
    expect(corrected.summary?.entryCount).toBe(1);
  });
});

describe('the corrections toggle', () => {
  it('records the choice and resets with the party', () => {
    /* It is a way of looking at ONE khata. Carrying it to the next customer
       would open their book in a mode they never asked for — three lines per
       typo, on a screen the merchant opened to read a balance. */
    const shown = reducer(opened(), correctionsVisibilityToggled(true));
    expect(shown.showCorrections).toBe(true);

    expect(reducer(shown, ledgerTimelineOpened('p2')).showCorrections).toBe(false);
  });
});
