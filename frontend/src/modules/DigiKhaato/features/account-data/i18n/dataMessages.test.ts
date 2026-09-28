import en from 'locales/en.json';

import { DATA_MESSAGES } from './dataMessages';

/**
 * The route-local "Your data" catalogue gets the guarantee `check-locales.mjs`
 * gives the shell catalogue: every key in both languages, no key in both
 * places. A Hindi owner must never read a raw message id on the page that
 * deletes their business.
 */
describe('DATA_MESSAGES', () => {
  it('has the same keys in English and Hindi', () => {
    expect(Object.keys(DATA_MESSAGES.hi).sort()).toEqual(Object.keys(DATA_MESSAGES.en).sort());
  });

  it('has no empty string and no key the shell catalogue also defines', () => {
    const shell = en as Record<string, string>;
    for (const [key, value] of Object.entries(DATA_MESSAGES.en)) {
      expect(value.trim()).not.toBe('');
      expect(DATA_MESSAGES.hi[key]?.trim()).not.toBe('');
      expect(shell[key]).toBeUndefined();
    }
  });
});
