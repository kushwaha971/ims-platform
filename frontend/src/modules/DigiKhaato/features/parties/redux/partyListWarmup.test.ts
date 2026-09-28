import { api } from 'src/api/AxiosInstances';
import { store } from 'src/redux/store';

import { selectPartyFilters } from './partyListSlice';
import { fetchPartyList } from './partyListThunk';
import {
  __resetPartyListWarmup,
  abortWarmPartyList,
  claimWarmPartyList,
  partyListRequestKey,
  warmPartyList,
} from './partyListWarmup';

import type { FetchPartyListArg } from './partyListThunk';

/**
 * The invariant the waterfall fix rests on: **starting the list request above
 * the session guard must not cost a second request.**
 *
 * `usePartyList` refetches on mount by design, so if the warm-up were merely
 * left to race it, a cold load of `/parties` would issue one GET or two
 * depending on which of `/auth/me` and `/parties` came back first — on the
 * merchant's 3G link, a coin toss. The claim is what makes it one, every time.
 */
describe('the party-list warm-up', () => {
  const ARG: FetchPartyListArg = {
    params: selectPartyFilters(store.getState()),
    mode: 'replace',
  };

  const EMPTY_PAGE = {
    data: { data: [], meta: { page: 1, page_size: 25, total: 0, total_pages: 0 } },
  };

  afterEach(() => {
    __resetPartyListWarmup();
    jest.restoreAllMocks();
  });

  it('issues exactly ONE request when the screen mounts after the warm-up', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue(EMPTY_PAGE);

    warmPartyList(store.dispatch, ARG);

    // What `usePartyList`'s effect does on its first run.
    expect(claimWarmPartyList(ARG)).toBe(true);
    await Promise.resolve();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('is idempotent, so Strict Mode\'s second effect run does not issue a second GET', () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue(EMPTY_PAGE);

    // React Strict Mode mounts, tears down and remounts every effect in
    // development, so `AppRouteWarmup` warms twice; `usePartyList` then mounts
    // — later, because the session guard was still painting a skeleton — and
    // its own effect claims twice. One visit must still be one request.
    warmPartyList(store.dispatch, ARG);
    warmPartyList(store.dispatch, ARG);
    expect(claimWarmPartyList(ARG)).toBe(true);
    expect(claimWarmPartyList(ARG)).toBe(true);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('is not claimed by a DIFFERENT request, which falls through to its own fetch', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue(EMPTY_PAGE);

    warmPartyList(store.dispatch, ARG);

    const searched: FetchPartyListArg = {
      params: { ...ARG.params, q: 'ramesh' },
      mode: 'replace',
    };
    expect(claimWarmPartyList(searched)).toBe(false);

    abortWarmPartyList();
    await store.dispatch(fetchPartyList(searched));
    // The warm-up's own request, plus the one that was not it.
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1]?.[0] as string).toContain('q=ramesh');
  });

  it('a superseded warm request never lands, so a slow page 1 cannot overwrite page 2', async () => {
    jest.spyOn(api, 'get').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(EMPTY_PAGE), 50);
        })
    );

    warmPartyList(store.dispatch, ARG);
    // What the hook does when the merchant changes a filter before the
    // speculative page 1 has come back.
    abortWarmPartyList();

    const before = store.getState().partyList.lastFetchedAt;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(store.getState().partyList.lastFetchedAt).toBe(before);
  });

  it('re-entering the screen supersedes the claimed request rather than serving stale rows', () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue(EMPTY_PAGE);

    // First visit.
    warmPartyList(store.dispatch, ARG);
    expect(claimWarmPartyList(ARG)).toBe(true);

    // `/parties -> /dashboard -> /parties`: the same key, but the rows behind it
    // are now old, so this must be a new request and not a second claim of the
    // first one.
    warmPartyList(store.dispatch, ARG);
    expect(get).toHaveBeenCalledTimes(2);
    expect(claimWarmPartyList(ARG)).toBe(true);
  });

  // ── The key must cover every parameter ───────────────────────────────────

  it('does not treat a different FILTER as the same request', async () => {
    /**
     * The defect, and the reason this file needed a new kind of test at all.
     *
     * `partyListRequestKey` used to name its fields — `q`, `status`,
     * `ordering`, `page`, `pageSize`. PTY-02 added `type`, `balance` and
     * `collection` to the params and not to that list, so an arg carrying
     * `balance: 'owes_me'` hashed to the same key as the unfiltered warm
     * request. `claimWarmPartyList` answered "already in flight",
     * `usePartyList` returned without dispatching, and tapping a chip set its
     * pressed state, lit up "Clear filters (1)" and relabelled the count tile
     * — while issuing no request at all. Because the claim is idempotent, the
     * list then never filtered again for the life of the page.
     *
     * Every existing test here passed throughout, because they all key off the
     * DEFAULT filters, which did not change. This one primes the warm-up with
     * one filter set and claims with another, which is what the screen does.
     */
    const get = jest.spyOn(api, 'get').mockResolvedValue(EMPTY_PAGE);

    warmPartyList(store.dispatch, ARG);
    const filtered: FetchPartyListArg = {
      ...ARG,
      params: { ...ARG.params, balance: 'owes_me' },
    };

    expect(claimWarmPartyList(filtered)).toBe(false);

    // And the screen then supersedes the warm request and issues its own, so
    // the merchant's filter reaches the server.
    abortWarmPartyList();
    await store.dispatch(fetchPartyList(filtered));

    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.at(-1)?.[0]).toContain('balance=owes_me');
  });

  it.each(['type', 'balance', 'collection'] as const)(
    'gives %s a key of its own, whatever is added to the params next',
    (field) => {
      /**
       * Derived from the params rather than a list, so this holds for a filter
       * nobody has written yet. A future `tag` (PTY-05) needs no edit here and
       * no memory of this file.
       */
      const base = partyListRequestKey(ARG);
      const changed = partyListRequestKey({
        ...ARG,
        params: { ...ARG.params, [field]: 'anything' },
      } as FetchPartyListArg);

      expect(changed).not.toBe(base);
    }
  );

  it('is not confused by the ORDER of the keys in the params object', () => {
    /**
     * The one property the explicit field list genuinely bought, kept by
     * sorting. Two objects with the same values and different insertion order
     * are the same request.
     */
    const forwards = partyListRequestKey(ARG);
    const backwards = partyListRequestKey({
      ...ARG,
      params: Object.fromEntries(
        Object.entries(ARG.params).reverse()
      ) as typeof ARG.params,
    });

    expect(backwards).toBe(forwards);
  });
});
