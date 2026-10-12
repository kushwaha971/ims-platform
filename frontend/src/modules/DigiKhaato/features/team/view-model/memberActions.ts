/**
 * Which manager actions a member row offers (owner, 12 Oct 2026).
 *
 * Pure, because it is the rule a screen most easily gets subtly wrong and a
 * test most cheaply pins. It MIRRORS `backend/apps/platform_app/services/
 * member_admin.py`; the server refuses every case regardless. The client's
 * job is the other half of §19.7.5: an action the server would refuse is
 * HIDDEN, never offered as a button whose only outcome is a 403.
 *
 *  · only the owner or an admin sees any of it (`useIsOwnerOrAdmin`);
 *  · nobody acts on their own row — Leave is that, elsewhere;
 *  · nobody acts on the owner's row;
 *  · an admin does not act on another admin's row — the owner is the tiebreak;
 *  · an invited row has not joined, so there is nothing to edit or block —
 *    cancelling the invitation, in the list below, is the act that applies.
 */
export interface MemberActionViewer {
  /** `useIsOwnerOrAdmin()`. */
  readonly isManager: boolean;
  /** The signed-in member's role code in this business. */
  readonly role: string | null;
  /** `platform_user.id` of the signed-in person. */
  readonly userId: string | null;
}

export interface MemberActionTarget {
  readonly userId: string;
  readonly role: string;
  readonly status: string;
  readonly mustChangePassword: boolean;
}

export interface MemberActionSet {
  readonly edit: boolean;
  readonly block: boolean;
  readonly unblock: boolean;
  readonly remove: boolean;
  /** The pre-existing reissue, folded into the same sheet when the sheet is shown. */
  readonly regenerate: boolean;
}

export const NO_MEMBER_ACTIONS: MemberActionSet = {
  edit: false,
  block: false,
  unblock: false,
  remove: false,
  regenerate: false,
};

export const memberActionsFor = (
  viewer: MemberActionViewer,
  target: MemberActionTarget
): MemberActionSet => {
  if (!viewer.isManager) return NO_MEMBER_ACTIONS;
  if (viewer.userId !== null && target.userId === viewer.userId) return NO_MEMBER_ACTIONS;
  if (target.role === 'owner') return NO_MEMBER_ACTIONS;
  if (target.role === 'admin' && viewer.role !== 'owner') return NO_MEMBER_ACTIONS;
  if (target.status === 'invited') return NO_MEMBER_ACTIONS;
  const blocked = target.status === 'suspended';
  return {
    edit: true,
    block: !blocked,
    unblock: blocked,
    remove: true,
    // A blocked person is not going to sign in on a new password until they
    // are let back in, and reissuing one would bump their epoch for nothing.
    regenerate: target.mustChangePassword && !blocked,
  };
};

/** True when the row has a ⋯ to show at all. */
export const hasAnyMemberAction = (actions: MemberActionSet): boolean =>
  actions.edit || actions.block || actions.unblock || actions.remove || actions.regenerate;

/**
 * The roles the edit dialog may offer. `owner` never (transferred, not
 * assigned); `admin` only to the owner, as the server rules. The member's
 * CURRENT role is always kept in the list, so the select can show it even
 * when this viewer could not have granted it.
 */
export const editableRoleCodes = (
  assignable: readonly string[],
  viewerRole: string | null,
  currentRole: string
): string[] => {
  const allowed = assignable.filter(
    (code) => code !== 'owner' && (code !== 'admin' || viewerRole === 'owner')
  );
  return allowed.includes(currentRole) ? allowed : [currentRole, ...allowed];
};
