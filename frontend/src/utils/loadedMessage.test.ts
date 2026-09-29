import { loadedMessage } from './loadedMessage';

const t = (id: string, values?: Record<string, string | number | Date>): string =>
  id === 'known' ? `Known ${values?.count ?? ''}`.trim() : id;

/** The one check behind every "never print a message id" fallback (A12, A13, A9b). */
describe('loadedMessage', () => {
  it('returns the copy when the key is loaded', () => {
    expect(loadedMessage(t, 'known', { count: 3 })).toBe('Known 3');
  });

  it('returns null for a key with no copy, and for no key', () => {
    expect(loadedMessage(t, 'library.off.copiesOut')).toBeNull();
    expect(loadedMessage(t, '')).toBeNull();
  });
});
