import { isValidIsbn, looksLikeIsbn } from './isbn';

/** T-LIB-02-1 on the client: a typo in an ISBN is caught before Save, not by a 400. */
describe('isValidIsbn', () => {
  it('accepts a hyphenated ISBN-13 and an ISBN-10 ending in X', () => {
    expect(isValidIsbn('978-81-7371-146-6')).toBe(true);
    expect(isValidIsbn('0-8044-2957-X')).toBe(true);
    expect(isValidIsbn('0 8044 2957 x')).toBe(true);
    expect(isValidIsbn('81 7371 146 1')).toBe(true);
  });

  it('refuses a wrong check digit and a non-ISBN prefix', () => {
    expect(isValidIsbn('978-81-7371-146-5')).toBe(false);
    expect(isValidIsbn('8173711460')).toBe(false);
    expect(isValidIsbn('1234567890123')).toBe(false);
  });

  it('tells an ISBN-shaped search from a title', () => {
    expect(looksLikeIsbn('978-81-7371-146-6')).toBe(true);
    expect(looksLikeIsbn('Wings of Fire')).toBe(false);
  });
});
