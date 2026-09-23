import { API_PATHS, requiresIdempotency } from './APIPaths';

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

/**
 * I-2 (QA, 23 Sep 2026) — the path builders spliced ids in raw, so a hostile or
 * malformed id re-addressed the request: `PARTY_STATEMENT('../../auth/logout')`
 * built `/parties/../../auth/logout/statement`, which a URL parser collapses to
 * `/auth/logout/statement`, and `x?format=csv` smuggled a query string in.
 * `partyPath` (the page address) already encoded; the API addresses did not.
 */
describe('API_PATHS id segments', () => {
  const hostile = '../../auth/logout?format=csv#x';
  const encoded = encodeURIComponent(hostile);

  it.each<readonly [string, (id: string) => string, string]>([
    ['PARTY', API_PATHS.PARTY, `/parties/${encoded}`],
    ['PARTY_ARCHIVE', API_PATHS.PARTY_ARCHIVE, `/parties/${encoded}/archive`],
    ['PARTY_RESTORE', API_PATHS.PARTY_RESTORE, `/parties/${encoded}/restore`],
    ['PARTY_STATEMENT', API_PATHS.PARTY_STATEMENT, `/parties/${encoded}/statement`],
    ['PARTY_LEDGER_ENTRIES', API_PATHS.PARTY_LEDGER_ENTRIES, `/parties/${encoded}/ledger-entries`],
    ['PARTY_CREDIT_CHECK', API_PATHS.PARTY_CREDIT_CHECK, `/parties/${encoded}/credit-check`],
    ['PARTY_TAG', API_PATHS.PARTY_TAG, `/parties/tags/${encoded}`],
    ['PARTY_TAG_MERGE', API_PATHS.PARTY_TAG_MERGE, `/parties/tags/${encoded}/merge`],
    ['LEDGER_ENTRY', API_PATHS.LEDGER_ENTRY, `/ledger-entries/${encoded}`],
    ['LEDGER_ENTRY_REVERSE', API_PATHS.LEDGER_ENTRY_REVERSE, `/ledger-entries/${encoded}/reverse`],
    ['LEDGER_ENTRY_CORRECT', API_PATHS.LEDGER_ENTRY_CORRECT, `/ledger-entries/${encoded}/correct`],
    ['MEMBER_CREDENTIALS', API_PATHS.MEMBER_CREDENTIALS, `/members/${encoded}/credentials`],
    ['INVITATION_ACCEPT', API_PATHS.INVITATION_ACCEPT, `/invitations/${encoded}/accept`],
    ['REMINDER_SEND', API_PATHS.REMINDER_SEND, `/reminders/${encoded}/send`],
  ])('%s encodes its id as one segment', (_name, build, expected) => {
    const path = build(hostile);
    expect(path).toBe(expected);
    // Resolved, it stays under its own collection — no `..`, `?` or `#` escapes.
    const resolved = new URL(path, 'http://api.invalid');
    expect(resolved.search).toBe('');
    expect(resolved.hash).toBe('');
    expect(resolved.pathname).toBe(path);
  });

  it('encodes every parameterised builder, not only the listed ones', () => {
    /** A builder added later without `seg()` fails here rather than in review. */
    const builders = Object.entries(API_PATHS).filter(
      (entry): entry is [string, (id: string) => string] => typeof entry[1] === 'function'
    );
    expect(builders.length).toBeGreaterThan(20);
    for (const [, build] of builders) {
      expect(build('a/b?c')).toContain('a%2Fb%3Fc');
    }
  });

  it('leaves an ordinary uuid untouched', () => {
    const id = '3f2a9c1e-0000-4000-8000-000000000001';
    expect(API_PATHS.PARTY_STATEMENT(id)).toBe(`/parties/${id}/statement`);
  });
});
