import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

import { API_PATHS } from 'src/api/APIPaths';
import { api, __resetTransportState } from 'src/api/AxiosInstances';
import { registerTransportHost, transportHost } from 'src/api/transportBridge';
import type { TransportHost } from 'src/api/transportBridge';

/**
 * QA B47 / B2 (12 Oct 2026) — a signed-in merchant was sent to /login although
 * the session was valid. The network showed `GET /auth/me 401 → POST
 * /auth/refresh 200 → GET /auth/me 200`, with the redirect already made.
 *
 * The 401 handler wrapped the wait for the refresh AND the replay in one try,
 * so a replay that failed for an unrelated reason — aborted by a navigation, a
 * proxy's 503 — reached the "refresh failed" branch and ended the session. A
 * refresh that never got an answer did the same. Only a refresh the server
 * REFUSED may end a session; everything here drives the real interceptor
 * through a stub adapter.
 */
const realHost = transportHost();
const realAdapter = api.defaults.adapter;

const onSessionExpired = jest.fn();
const host: TransportHost = {
  getLocale: () => 'en',
  onResponseObserved: () => undefined,
  onTransportFailure: () => undefined,
  isNetworkImpaired: () => false,
  onSessionExpired,
  onErrorToast: () => undefined,
  onPlanLimit: () => false,
  getActiveTenantId: () => null,
  onTenantMismatch: () => undefined,
};

type Answer = number | 'network';

/** Answers each request from a per-path script, recording every call made. */
const script = (answers: Record<string, Answer[]>): string[] => {
  const calls: string[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const path = String(config.url);
    calls.push(path);
    const next = answers[path]?.shift() ?? 200;
    if (next === 'network') {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
    }
    const response = { status: next, statusText: '', data: { data: {} }, headers: {}, config };
    if (next >= 400) {
      throw new AxiosError(`HTTP ${next}`, 'ERR_BAD_RESPONSE', config, {}, response);
    }
    return response;
  };
  api.defaults.adapter = adapter;
  return calls;
};

beforeEach(() => {
  onSessionExpired.mockReset();
  registerTransportHost(host);
});

afterEach(() => {
  __resetTransportState();
  api.defaults.adapter = realAdapter;
  if (realHost) registerTransportHost(realHost);
});

describe('the refresh on 401', () => {
  it('keeps the session when the replay after a good refresh fails for another reason', async () => {
    script({ '/parties': [401, 503], [API_PATHS.AUTH_REFRESH]: [200] });
    await expect(api.get('/parties')).rejects.toBeTruthy();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('keeps the session when the refresh itself got no answer', async () => {
    script({ '/parties': [401], [API_PATHS.AUTH_REFRESH]: ['network'] });
    await expect(api.get('/parties')).rejects.toBeTruthy();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('ends the session when the server refuses the refresh', async () => {
    script({ '/parties': [401], [API_PATHS.AUTH_REFRESH]: [401] });
    await expect(api.get('/parties')).rejects.toBeTruthy();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('sends one refresh for any number of concurrent 401s, then replays each', async () => {
    const calls = script({
      '/a': [401, 200],
      '/b': [401, 200],
      '/c': [401, 200],
      [API_PATHS.AUTH_REFRESH]: [200],
    });
    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(calls.filter((c) => c === API_PATHS.AUTH_REFRESH)).toHaveLength(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
