import { activeNavHref } from './activeNav';

const LENDING = ['/lending', '/lending/loans', '/lending/borrowers', '/lending/routes'];

describe('activeNavHref', () => {
  /** L02 QA: a workspace home at the workspace prefix must not stay lit on its other pages. */
  it('lights only the most specific row', () => {
    expect(activeNavHref('/lending/loans', LENDING)).toBe('/lending/loans');
    expect(activeNavHref('/lending/loans/new', LENDING)).toBe('/lending/loans');
    expect(activeNavHref('/lending/borrowers', LENDING)).toBe('/lending/borrowers');
  });

  it('lights the home row on the home page itself', () => {
    expect(activeNavHref('/lending', LENDING)).toBe('/lending');
  });

  it('does not treat a shared prefix of letters as a parent', () => {
    expect(activeNavHref('/lendingx', LENDING)).toBeNull();
    expect(activeNavHref('/library/members', ['/library', '/library/members'])).toBe(
      '/library/members'
    );
  });

  it('lights nothing on a page no row owns', () => {
    expect(activeNavHref('/settings', LENDING)).toBeNull();
    expect(activeNavHref(null, LENDING)).toBeNull();
  });
});
