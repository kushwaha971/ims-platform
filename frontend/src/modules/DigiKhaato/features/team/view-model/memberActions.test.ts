import { editableRoleCodes, hasAnyMemberAction, memberActionsFor } from './memberActions';

/**
 * Owner, 12 Oct 2026 — which manager actions a member row offers. Each case
 * names the defect it prevents; the server refuses all of them regardless, so
 * every one of these is a button that would otherwise exist only to fail.
 */
const OWNER = { isManager: true, role: 'owner', userId: 'u-owner' } as const;
const ADMIN = { isManager: true, role: 'admin', userId: 'u-admin' } as const;
const STAFF_VIEWER = { isManager: false, role: 'staff', userId: 'u-staff' } as const;

const row = (overrides: Partial<Parameters<typeof memberActionsFor>[1]> = {}) => ({
  userId: 'u-target',
  role: 'staff',
  status: 'active',
  mustChangePassword: false,
  ...overrides,
});

describe('memberActionsFor', () => {
  it('offers edit, block and remove to the owner on a staff row', () => {
    expect(memberActionsFor(OWNER, row())).toEqual({
      edit: true,
      block: true,
      unblock: false,
      remove: true,
      regenerate: false,
    });
  });

  it('offers nothing to somebody who is not the owner or an admin', () => {
    // A custom role holding `platform.members.manage` still sees no ⋯ — the
    // owner's rule is about standing, not codenames.
    expect(hasAnyMemberAction(memberActionsFor(STAFF_VIEWER, row()))).toBe(false);
  });

  it('offers nothing on your own row, so nobody locks themselves out', () => {
    expect(hasAnyMemberAction(memberActionsFor(ADMIN, row({ userId: 'u-admin' })))).toBe(false);
  });

  it('offers nothing on the owner row, to anybody', () => {
    expect(hasAnyMemberAction(memberActionsFor(ADMIN, row({ role: 'owner' })))).toBe(false);
  });

  it('lets the owner act on an admin, and not another admin', () => {
    expect(memberActionsFor(OWNER, row({ role: 'admin' })).block).toBe(true);
    expect(hasAnyMemberAction(memberActionsFor(ADMIN, row({ role: 'admin' })))).toBe(false);
  });

  it('swaps Block for Unblock on a blocked row, and withholds a new password', () => {
    // A blocked row that still offered Block would be a button that does
    // nothing; one with no Unblock would be a person nobody can let back in.
    expect(memberActionsFor(OWNER, row({ status: 'suspended', mustChangePassword: true }))).toEqual(
      { edit: true, block: false, unblock: true, remove: true, regenerate: false }
    );
  });

  it('folds the reissue in for somebody still on a temporary password', () => {
    expect(memberActionsFor(OWNER, row({ mustChangePassword: true })).regenerate).toBe(true);
  });

  it('offers nothing on an invited row — cancelling the invitation is the act', () => {
    expect(hasAnyMemberAction(memberActionsFor(OWNER, row({ status: 'invited' })))).toBe(false);
  });
});

describe('editableRoleCodes', () => {
  const assignable = ['admin', 'staff', 'accountant'];

  it('never offers owner, and offers admin only to the owner', () => {
    expect(editableRoleCodes([...assignable, 'owner'], 'owner', 'staff')).toEqual(assignable);
    expect(editableRoleCodes(assignable, 'admin', 'staff')).toEqual(['staff', 'accountant']);
  });

  it('keeps the current role so the select is never blank', () => {
    // A custom role the server's list does not carry would otherwise render an
    // empty select, and saving would silently send the first option instead.
    expect(editableRoleCodes(assignable, 'owner', 'supervisor')).toEqual([
      'supervisor',
      ...assignable,
    ]);
  });
});
