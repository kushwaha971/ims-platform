import { cacheInvalidated } from 'src/redux/invalidation/listener';

import ledgerReducer, {
  ledgerTimelineOpened,
  type LedgerEntryState,
} from 'modules/DigiKhaato/features/ledger/redux/ledgerEntrySlice';
import {
  fetchPartyEntries,
  postEntry,
  type PostEntryArg,
} from 'modules/DigiKhaato/features/ledger/redux/ledgerEntryThunk';
import type {
  LedgerEntry,
  LedgerPage,
} from 'modules/DigiKhaato/features/ledger/types/ledger.types';
import detailReducer, {
  partyDetailOpened,
  type PartyDetailState,
} from 'modules/DigiKhaato/features/parties/redux/partyDetailSlice';
import { fetchPartyDetail } from 'modules/DigiKhaato/features/parties/redux/partyDetailThunk';
import type { PartyDetailResult } from 'modules/DigiKhaato/features/parties/types/party.types';

/**
 * NEW-2's fix made every ledger write REFETCH the khata header and the timeline
 * (their credit block and totals are the server's), and a refetch next to an
 * instant patch has one failure the patch alone never had: a read requested
 * BEFORE a write landing AFTER it.
 *
 * Two quick entries at a busy counter. Entry 1 patches the balance to ₹1,450
 * and asks for a refetch; entry 2 patches it to ₹1,650; then entry 1's refetch
 * lands carrying ₹1,450 and the header goes BACKWARDS — on the number the
 * merchant reads out. The timeline loses entry 2 the same way. These tests pin
 * the guard that drops such a read (`TStaleState.staleSeq`); they fail with the
 * guard removed.
 */

const ID = 'p1';

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e1',
  partyId: ID,
  direction: 'debit',
  amount: '200.00',
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

const ARG = { partyId: ID, idempotencyKey: 'k', values: {} } as unknown as PostEntryArg;

const posted = (id: string, balance: string, createdAt: string) =>
  postEntry.fulfilled(
    { entry: entry({ id, createdAt }), balance, warnings: [] },
    `post-${id}`,
    ARG
  );

const invalidated = (slice: 'partyDetail' | 'ledgerEntry') =>
  cacheInvalidated({ slices: [slice], urgency: 'now' });

describe('the khata header drops a refetch that predates the latest write', () => {
  const result = (balance: string): PartyDetailResult =>
    ({
      party: { id: ID, balance },
      summary: { balance },
      credit: null,
    }) as unknown as PartyDetailResult;

  const loaded = (): PartyDetailState => {
    let state = detailReducer(undefined, partyDetailOpened(ID));
    state = detailReducer(state, fetchPartyDetail.pending('mount', ID));
    return detailReducer(state, fetchPartyDetail.fulfilled(result('1250.00'), 'mount', ID));
  };

  it('keeps the second entry’s balance when the first entry’s refetch lands late', () => {
    let state = loaded();
    state = detailReducer(state, posted('e1', '1450.00', '2026-09-17T10:00:00Z'));
    state = detailReducer(state, invalidated('partyDetail'));
    state = detailReducer(state, fetchPartyDetail.pending('refetch-1', ID));
    state = detailReducer(state, posted('e2', '1650.00', '2026-09-17T10:00:05Z'));
    state = detailReducer(state, invalidated('partyDetail'));

    // Entry 1's refetch, requested before entry 2 and answered with its balance.
    state = detailReducer(state, fetchPartyDetail.fulfilled(result('1450.00'), 'refetch-1', ID));

    expect(state.summary?.balance).toBe('1650.00');
    expect(state.party?.balance).toBe('1650.00');
    // Still stale: the read that WILL be written has not been asked for yet.
    expect(state.stale).toBe(true);
    expect(state.status).toBe('succeeded');
  });

  it('writes a refetch requested after the latest write', () => {
    let state = loaded();
    state = detailReducer(state, posted('e1', '1450.00', '2026-09-17T10:00:00Z'));
    state = detailReducer(state, invalidated('partyDetail'));
    state = detailReducer(state, fetchPartyDetail.pending('refetch-2', ID));
    state = detailReducer(state, fetchPartyDetail.fulfilled(result('1450.00'), 'refetch-2', ID));

    expect(state.summary?.balance).toBe('1450.00');
    expect(state.stale).toBe(false);
    expect(state.readSeq).toEqual({});
  });

  it('never drops a FIRST load, even one that raced a write', () => {
    let state = detailReducer(undefined, partyDetailOpened(ID));
    state = detailReducer(state, fetchPartyDetail.pending('mount', ID));
    state = detailReducer(state, invalidated('partyDetail'));
    state = detailReducer(state, fetchPartyDetail.fulfilled(result('1250.00'), 'mount', ID));

    expect(state.party).not.toBeNull();
  });
});

describe('the timeline drops a first page that predates the latest write', () => {
  const page = (rows: readonly LedgerEntry[], totalDebit: string): LedgerPage => ({
    rows: [...rows],
    nextCursor: null,
    hasMore: false,
    summary: { totalDebit, totalCredit: '0.00', entryCount: rows.length },
  });

  const OLD = entry({
    id: 'e0',
    amount: '1250.00',
    entryDate: '2026-09-15',
    createdAt: '2026-09-15T10:00:00Z',
  });

  it('keeps the second entry on screen when the first entry’s refresh lands late', () => {
    let state: LedgerEntryState = ledgerReducer(undefined, ledgerTimelineOpened(ID));
    state = ledgerReducer(state, fetchPartyEntries.pending('mount', { partyId: ID }));
    state = ledgerReducer(
      state,
      fetchPartyEntries.fulfilled(page([OLD], '1250.00'), 'mount', { partyId: ID })
    );

    state = ledgerReducer(state, posted('e1', '1450.00', '2026-09-17T10:00:00Z'));
    state = ledgerReducer(state, invalidated('ledgerEntry'));
    state = ledgerReducer(state, fetchPartyEntries.pending('refresh-1', { partyId: ID }));
    state = ledgerReducer(state, posted('e2', '1650.00', '2026-09-17T10:00:05Z'));
    state = ledgerReducer(state, invalidated('ledgerEntry'));

    const e1 = entry({ id: 'e1', createdAt: '2026-09-17T10:00:00Z' });
    state = ledgerReducer(
      state,
      fetchPartyEntries.fulfilled(page([e1, OLD], '1450.00'), 'refresh-1', { partyId: ID })
    );

    expect(state.rows.map((row) => row.id)).toEqual(['e2', 'e1', 'e0']);
    expect(state.stale).toBe(true);
  });

  it('writes the refresh requested after the latest write, totals and all', () => {
    let state: LedgerEntryState = ledgerReducer(undefined, ledgerTimelineOpened(ID));
    state = ledgerReducer(state, fetchPartyEntries.pending('mount', { partyId: ID }));
    state = ledgerReducer(
      state,
      fetchPartyEntries.fulfilled(page([OLD], '1250.00'), 'mount', { partyId: ID })
    );
    state = ledgerReducer(state, posted('e1', '1450.00', '2026-09-17T10:00:00Z'));
    state = ledgerReducer(state, invalidated('ledgerEntry'));
    state = ledgerReducer(state, fetchPartyEntries.pending('refresh-2', { partyId: ID }));

    const e1 = entry({ id: 'e1', createdAt: '2026-09-17T10:00:00Z' });
    state = ledgerReducer(
      state,
      fetchPartyEntries.fulfilled(page([e1, OLD], '1450.00'), 'refresh-2', { partyId: ID })
    );

    expect(state.summary?.totalDebit).toBe('1450.00');
    expect(state.stale).toBe(false);
  });
});
