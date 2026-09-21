import { api } from 'src/api/AxiosInstances';
import { store } from 'src/redux/store';

import { selectPartyFilters } from './partyListSlice';
import { fetchPartyList } from './partyListThunk';
import {
  __resetPartyListWarmup,
  abortWarmPartyList,
  claimWarmPartyList,
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
});
