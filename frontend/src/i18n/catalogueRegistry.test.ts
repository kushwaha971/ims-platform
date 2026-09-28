import {
  catalogueVersion,
  defineCatalogue,
  ensureLocaleLoaded,
  liveMessages,
  registeredCatalogues,
  subscribeCatalogues,
} from './catalogueRegistry';

/**
 * W4-P — the route-local catalogues are only as good as the moment their words
 * become visible to `IntlProvider`. Each test below is a way that could go
 * wrong on a real screen while every component test (which hands the provider
 * every catalogue at once) stayed green.
 */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('catalogueRegistry', () => {
  it('writes a catalogue INTO the live map, so a provider holding it sees the words at once', () => {
    /* The screen whose chunk just loaded renders under a provider that has not
       re-rendered. If registration built a new map instead, that first render
       would print raw message ids until the provider caught up. */
    const before = liveMessages('en');
    defineCatalogue({
      name: 'testLive',
      en: { 'testLive.title': 'Live' },
      loadHi: () => Promise.resolve({ 'testLive.title': 'लाइव' }),
    });
    expect(liveMessages('en')).toBe(before);
    expect(before['testLive.title']).toBe('Live');
  });

  it('stands English in for a Hindi half that has not landed — never a raw id', async () => {
    let land: (messages: Record<string, string>) => void = () => undefined;
    defineCatalogue({
      name: 'testFallback',
      en: { 'testFallback.title': 'Fallback' },
      loadHi: () =>
        new Promise((resolve) => {
          land = resolve;
        }),
    });
    expect(liveMessages('hi')['testFallback.title']).toBe('Fallback');

    const hiBefore = liveMessages('hi');
    ensureLocaleLoaded('hi');
    land({ 'testFallback.title': 'फ़ॉलबैक' });
    await flush();

    /* A NEW map when Hindi lands, because text already on screen must
       re-render and a changed `messages` prop is what tells IntlProvider so. */
    expect(liveMessages('hi')).not.toBe(hiBefore);
    expect(liveMessages('hi')['testFallback.title']).toBe('फ़ॉलबैक');
    expect(liveMessages('en')['testFallback.title']).toBe('Fallback');
  });

  it('notifies subscribers after the current task, never from inside a render', async () => {
    /* Registration runs while a chunk is being evaluated, which can be during
       React's render; a synchronous listener there is "Cannot update a
       component while rendering a different component". */
    const listener = jest.fn();
    const unsubscribe = subscribeCatalogues(listener);
    const version = catalogueVersion();
    defineCatalogue({
      name: 'testNotify',
      en: { 'testNotify.title': 'Notify' },
      loadHi: () => Promise.resolve({ 'testNotify.title': 'सूचना' }),
    });
    expect(catalogueVersion()).toBeGreaterThan(version);
    expect(listener).not.toHaveBeenCalled();
    await flush();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('registers a catalogue once, however many times its module is evaluated', () => {
    const loadHi = jest.fn(() => Promise.resolve({}));
    const catalogue = { name: 'testOnce', en: { 'testOnce.title': 'Once' }, loadHi };
    defineCatalogue(catalogue);
    defineCatalogue(catalogue);
    expect(registeredCatalogues().filter((name) => name === 'testOnce')).toHaveLength(1);
    ensureLocaleLoaded('hi');
    ensureLocaleLoaded('hi');
    expect(loadHi).toHaveBeenCalledTimes(1);
  });

  it('retries a Hindi half whose chunk failed, on the next request', async () => {
    const loadHi = jest
      .fn<Promise<Record<string, string>>, []>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce({ 'testRetry.title': 'फिर से' });
    defineCatalogue({ name: 'testRetry', en: { 'testRetry.title': 'Retry' }, loadHi });
    ensureLocaleLoaded('hi');
    await flush();
    expect(liveMessages('hi')['testRetry.title']).toBe('Retry');
    ensureLocaleLoaded('hi');
    await flush();
    expect(liveMessages('hi')['testRetry.title']).toBe('फिर से');
  });
});
