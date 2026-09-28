import { memberCountOf } from './memberCount';

/**
 * QA O3: the Team heading said "3 people" for two members and one invited
 * address that holds no access. These pin the split and its honest fallback.
 */
describe('memberCountOf', () => {
  it('counts an invited row apart from the people who have joined', () => {
    const rows = [{ status: 'active' }, { status: 'invited' }, { status: 'active' }];
    expect(memberCountOf(rows, { total: 3, totalPages: 1 })).toEqual({ joined: 2, invited: 1 });
  });

  it('reports zero invited when everybody has joined', () => {
    expect(memberCountOf([{ status: 'active' }], { total: 1, totalPages: 1 })).toEqual({
      joined: 1,
      invited: 0,
    });
  });

  it('keeps the plain total on a team that pages, rather than guess about other pages', () => {
    const rows = [{ status: 'invited' }];
    expect(memberCountOf(rows, { total: 40, totalPages: 2 })).toEqual({ joined: 40, invited: null });
  });
});
