import { transportHost } from 'src/api/transportBridge';
import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';

import { agingFiltersChanged } from 'modules/DigiKhaato/features/ledger/redux/agingSlice';
import { statementOpened } from 'modules/DigiKhaato/features/ledger/redux/statementSlice';
import { filtersChanged } from 'modules/DigiKhaato/features/parties/redux/partyListSlice';

/**
 * FB-3 (QA, 23 Sep 2026) — an expired session tore down the SESSION and nothing
 * else. When the refresh failed, the transport dispatched `sessionExpired`,
 * which resets `sessionSlice` alone; the party list, the khata, and the lazily
 * injected statement and aging slices stayed in memory behind the login screen,
 * carrying the previous user's (and business's) data. Logout does not do that:
 * `logout.fulfilled` resets the session AND, through the invalidation map's
 * `resetAll`, dispatches `resetAllFeatureState`. Expiry is a logout the server
 * decided, so it now sends the same two signals, in the same order.
 */
const feature = () => {
  const state = store.getState() as unknown as Record<string, unknown>;
  return {
    partyList: state.partyList,
    statement: state.statement,
    ledgerAging: state.ledgerAging,
  };
};

describe('session expiry teardown', () => {
  it('clears every feature slice, lazily injected ones included, as logout does', () => {
    // Touch both lazy slices so they are injected and hold state of their own.
    store.dispatch({ type: 'test/touch' });
    store.dispatch(resetAllFeatureState());
    const clean = feature();
    expect(clean.statement).toBeDefined();
    expect(clean.ledgerAging).toBeDefined();

    store.dispatch(
      sessionLoaded({
        user: { id: 'u1', name: 'Ramesh', email: 'r@example.com', mobile: null, locale: 'en' },
        activeTenant: { id: 't1', name: 'Sharma', timezone: 'Asia/Kolkata', role: 'owner' },
        tenants: [],
        permissions: [],
        enabledModules: [],
        version: null,
      } as unknown as Parameters<typeof sessionLoaded>[0])
    );
    store.dispatch(filtersChanged({ q: 'ramesh' }));
    store.dispatch(statementOpened('party-1'));
    store.dispatch(
      agingFiltersChanged({
        kind: 'receivable',
        asOf: '2026-09-23',
        tag: 'Camp Area',
        ordering: '-total',
        page: 2,
      } as Parameters<typeof agingFiltersChanged>[0])
    );
    const dirty = feature();
    expect(dirty.partyList).not.toEqual(clean.partyList);
    expect(dirty.statement).not.toEqual(clean.statement);
    expect(dirty.ledgerAging).not.toEqual(clean.ledgerAging);

    // What AxiosInstances calls when the refresh itself 401s.
    transportHost()?.onSessionExpired();

    expect(store.getState().session.status).toBe('anonymous');
    expect(store.getState().session.user).toBeNull();
    expect(feature()).toEqual(clean);
  });

  it('keeps the device preferences the login screen is rendered in', () => {
    /** Locale and theme follow the device, not the session: logout keeps them
     *  too, and a login screen that flips language on expiry reads as a crash. */
    const before = { locale: store.getState().locale, theme: store.getState().theme };
    transportHost()?.onSessionExpired();
    expect({ locale: store.getState().locale, theme: store.getState().theme }).toEqual(before);
  });
});
