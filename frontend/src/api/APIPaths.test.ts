import { requiresIdempotency } from './APIPaths';

/**
 * Canon §0.11 rule 5 is enforced by a PREFIX match, which is what makes
 * `/parties/{id}/archive` inherit the requirement without anyone remembering to
 * add it — and is also what silently swept in a sub-tree that does not need it.
 */
describe('requiresIdempotency', () => {
  it('still covers everything hanging off a listed root', () => {
    /** The whole reason the rule is a prefix match rather than a list of
     *  literals: PTY-04's archive route was never added anywhere and is
     *  covered, which is the behaviour that must not regress. */
    expect(requiresIdempotency('/parties')).toBe(true);
    expect(requiresIdempotency('/parties/abc-123/archive')).toBe(true);
    expect(requiresIdempotency('/parties/bulk-archive')).toBe(true);
  });

  it('exempts the tag routes, which cannot double-write', () => {
    /** Before the exemption these minted a key nobody asked for and warned, in
     *  development, that "a retry will double-post" — a false statement about
     *  three endpoints that are each idempotent by construction. A warning that
     *  is wrong is worse than no warning, because it is the one people learn to
     *  scroll past on the day it is right. */
    expect(requiresIdempotency('/parties/tags')).toBe(false);
    expect(requiresIdempotency('/parties/tags/bulk')).toBe(false);
    expect(requiresIdempotency('/parties/tags/abc-123/merge')).toBe(false);
  });

  it('does not exempt a party whose id merely begins with the exempt path', () => {
    /** The match is on a path SEGMENT — `startsWith('/parties/tags')` alone
     *  would also exempt a hypothetical `/parties/tagsomething`, and an
     *  exemption that leaks is a missing key on a route that writes. */
    expect(requiresIdempotency('/parties/tagsomething')).toBe(true);
  });

  it('ignores the query string', () => {
    expect(requiresIdempotency('/parties?page=2')).toBe(true);
    expect(requiresIdempotency('/parties/tags?q=camp')).toBe(false);
  });

  it('is false for an unlisted root and for no url at all', () => {
    expect(requiresIdempotency('/auth/me')).toBe(false);
    expect(requiresIdempotency(undefined)).toBe(false);
  });
});
