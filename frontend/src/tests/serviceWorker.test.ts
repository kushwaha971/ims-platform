/**
 * QA B50 — the service worker's routing rules (`public/sw.js`, §19.10.2).
 *
 * Each rule here guards a way the worker could do harm rather than good: a
 * cached write replayed, a cursor page served for page one, another business's
 * rows answered from a cache, an export frozen in time. The worker itself is
 * plain script; its one decision is a pure function, tested without a browser.
 */
const { strategyFor } = require('../../public/sw.js') as {
  strategyFor: (request: { method: string; url: string; mode?: string }, origin: string) => string;
};

const ORIGIN = 'https://yourkhata.com';
const get = (url: string, mode = 'cors') => ({ method: 'GET', url, mode });

describe('what the service worker does with each request', () => {
  it('serves hashed static files from the cache', () => {
    expect(strategyFor(get(`${ORIGIN}/_next/static/chunks/abc123.js`), ORIGIN)).toBe('static');
    expect(strategyFor(get(`${ORIGIN}/icons/icon-192.png`), ORIGIN)).toBe('static');
  });

  it('treats an app page load as a page: network first, then the last good copy', () => {
    expect(strategyFor(get(`${ORIGIN}/dashboard?src=pwa`, 'navigate'), ORIGIN)).toBe('page');
  });

  it('keeps the last copy of the session, the dashboard and a khata’s first page', () => {
    expect(strategyFor(get('https://api.yourkhata.com/api/v1/auth/me'), ORIGIN)).toBe('api');
    expect(strategyFor(get(`${ORIGIN}/api/v1/reports/dashboard`), ORIGIN)).toBe('api');
    // The person's page needs the person: without it the khata opened offline on
    // "We could not load this party" (found by e2e/offline.mjs).
    expect(strategyFor(get(`${ORIGIN}/api/v1/parties/0d9f-11aa`), ORIGIN)).toBe('api');
    expect(
      strategyFor(get(`${ORIGIN}/api/v1/parties/0d9f-11aa/ledger-entries?book=shop`), ORIGIN)
    ).toBe('api');
  });

  it('never caches a write, a later page, an export or any other read', () => {
    expect(strategyFor({ method: 'POST', url: `${ORIGIN}/api/v1/parties` }, ORIGIN)).toBe(
      'network'
    );
    expect(
      strategyFor(get(`${ORIGIN}/api/v1/parties/0d9f/ledger-entries?cursor=xyz`), ORIGIN)
    ).toBe('network');
    expect(strategyFor(get(`${ORIGIN}/api/v1/parties?format=csv`), ORIGIN)).toBe('network');
    expect(strategyFor(get(`${ORIGIN}/api/v1/reports/day-book`), ORIGIN)).toBe('network');
  });

  it('leaves another site’s page loads and files alone', () => {
    expect(strategyFor(get('https://fonts.example.com/_next/static/x.js'), ORIGIN)).toBe('network');
  });
});
