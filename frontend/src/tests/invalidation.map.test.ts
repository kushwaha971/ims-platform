import { cacheInvalidated } from 'src/redux/invalidation/listener';
import { INVALIDATION } from 'src/redux/invalidation/map';
import { MUTATIONS } from 'src/redux/invalidation/registry';
import type { TSliceKey } from 'src/redux/invalidation/types';
import { store } from 'src/redux/store';

import 'modules/DigiKhaato/features/branding/redux/brandingSlice';
import 'modules/DigiKhaato/features/business-profile/redux/businessProfileSlice';
import 'modules/DigiKhaato/features/inventory/redux/inventoryMastersSlice';
import 'modules/DigiKhaato/features/inventory/redux/itemDetailSlice';
import 'modules/DigiKhaato/features/inventory/redux/itemFormSlice';
import 'modules/DigiKhaato/features/inventory/redux/itemListSlice';
import 'modules/DigiKhaato/features/inventory/redux/stockAdjustmentSlice';
import 'modules/DigiKhaato/features/inventory/redux/stockSummarySlice';
import 'modules/DigiKhaato/features/expenses/redux/cashbookSlice';
import 'modules/DigiKhaato/features/expenses/redux/expenseFormSlice';
import 'modules/DigiKhaato/features/expenses/redux/expenseListSlice';
import 'modules/DigiKhaato/features/ledger/redux/agingSlice';
import 'modules/DigiKhaato/features/ledger/redux/statementSlice';
import 'modules/DigiKhaato/features/sessions/redux/sessionsSlice';
import 'modules/DigiKhaato/features/settings/redux/settingsSlice';
import 'modules/DigiKhaato/features/notifications/redux/notificationSlice';
import 'modules/DigiKhaato/features/reminders/redux/reminderSlice';
import partyListReducer, {
  type PartyListState,
} from 'modules/DigiKhaato/features/parties/redux/partyListSlice';

/**
 * Part 19 §19.3.6 — the runtime half of the completeness machinery. The compile
 * -time halves (a missing entry; a slice that does not exist) are enforced by
 * `TInvalidationMap` and by `TSliceKey = keyof RootState`, so a type error is
 * the failure mode there and these tests cover what types cannot see.
 */
describe('invalidation map', () => {
  const entries = Object.entries(INVALIDATION);

  it('has an entry for every registered mutation and no others', () => {
    expect(Object.keys(INVALIDATION).sort()).toEqual(Object.keys(MUTATIONS).sort());
  });

  it.each(entries)('%s declares something', (_name, entry) => {
    // An empty entry is a forgotten entry.
    expect(
      entry.resetAll || entry.patch?.length || entry.stale?.length || entry.refetch?.length
    ).toBeTruthy();
  });

  // Every slice a mutation names must be a real store key. `TSliceKey =
  // keyof RootState` already makes a typo a compile error; this catches the
  // case types cannot see — a key that exists in the type but not in the
  // configured reducer map. Sprint 0's two mutations are both `resetAll`, so
  // the list is legitimately empty today and the loop is written to say so
  // rather than to throw on an empty `it.each`.
  const namedSlices = entries.flatMap(([name, entry]) =>
    [...(entry.stale ?? []), ...(entry.refetch ?? []), ...(entry.patch ?? []).map(([s]) => s)].map(
      (slice) => [name, slice] as const
    )
  );

  it('names only real store keys', () => {
    /* The lazy slices (CR-134) are imported above, which is what injects
       them — a lazy slice is a real key from the moment its route's chunk
       loads, and before that a `stale` naming it is a no-op by design (the
       slice starts from its initial state when it arrives). Its key appears in
       the state on the next dispatch after injection, hence the no-op. */
    store.dispatch({ type: 'test/touch' });
    const storeKeys = Object.keys(store.getState());
    const unknown = namedSlices.filter(([, slice]) => !storeKeys.includes(slice));
    expect(unknown).toEqual([]);
  });

  it('routes a tenant switch through resetAll rather than a slice list', () => {
    expect(INVALIDATION.switchTenant.resetAll).toBe(true);
    expect(INVALIDATION.switchTenant.stale).toBeUndefined();
  });
});

describe('acceptInvalidation', () => {
  const initial = partyListReducer(undefined, { type: '@@init' }) as PartyListState;

  it('ignores a signal that does not name this slice', () => {
    const after = partyListReducer(
      initial,
      cacheInvalidated({ slices: ['itemList' as unknown as TSliceKey], urgency: 'next-mount' })
    );
    expect(after.stale).toBe(false);
    expect(after.staleUrgency).toBeNull();
  });

  it('marks the slice stale with the signalled urgency', () => {
    const after = partyListReducer(
      initial,
      cacheInvalidated({ slices: ['partyList'], urgency: 'next-mount' })
    );
    expect(after.stale).toBe(true);
    expect(after.staleUrgency).toBe('next-mount');
  });

  it("lets 'now' win over a pending 'next-mount'", () => {
    const deferred = partyListReducer(
      initial,
      cacheInvalidated({ slices: ['partyList'], urgency: 'next-mount' })
    );
    const urgent = partyListReducer(
      deferred,
      cacheInvalidated({ slices: ['partyList'], urgency: 'now' })
    );
    expect(urgent.staleUrgency).toBe('now');
  });

  it("does not let 'next-mount' downgrade a pending 'now'", () => {
    const urgent = partyListReducer(
      initial,
      cacheInvalidated({ slices: ['partyList'], urgency: 'now' })
    );
    const after = partyListReducer(
      urgent,
      cacheInvalidated({ slices: ['partyList'], urgency: 'next-mount' })
    );
    expect(after.staleUrgency).toBe('now');
  });
});
