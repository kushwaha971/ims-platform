'use client';

import { useCallback, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { useIsOwnerOrAdmin } from 'src/hooks/useIsOwnerOrAdmin';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveRole, selectSessionUser } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { accountDisplayName } from 'src/utils/accountIdentity';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import {
  editMemberClosed,
  editMemberOpened,
  memberActionsClosed,
  memberActionsOpened,
  memberConfirmCancelled,
  memberConfirmRequested,
  selectEditMemberStatus,
  selectEditMemberTargetId,
  selectMemberActionStatus,
  selectMemberActionsTargetId,
  selectMemberConfirm,
  selectMemberRows,
  regenerateRequested,
} from '../redux/memberSlice';
import { blockMember, editMember, removeMember, unblockMember } from '../redux/memberThunk';
import { EDIT_MEMBER_FIELDS } from '../validation/memberSchemas';

import type { Member, MemberConfirmKind, MemberEdit } from '../types/member.types';
import type { EditMemberFormValues } from '../validation/memberSchemas';
import type { MemberActionViewer } from '../view-model/memberActions';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Owner, 12 Oct 2026 — the manager's half of the team list: edit, block,
 * unblock, remove. A hook of its own rather than more of `useMembers`, because
 * it answers a different question (what may I do to THIS person) and is read
 * only by the owner and admins; `useMembers` stays the list.
 *
 * Three idempotency keys, rotated independently, for the reason `useMembers`
 * gives for its two: a block replayed under an unblock's key would return the
 * block's stored body to a request to undo it.
 */
export interface UseMemberAdminResult {
  readonly viewer: MemberActionViewer;
  readonly actionsTarget: Member | null;
  readonly openActions: (membershipId: string) => void;
  readonly closeActions: () => void;

  readonly editTarget: Member | null;
  readonly isEditing: boolean;
  readonly openEdit: (membershipId: string) => void;
  readonly closeEdit: () => void;
  readonly submitEdit: (
    values: EditMemberFormValues,
    setError: UseFormSetError<EditMemberFormValues>
  ) => Promise<readonly string[]>;

  readonly confirm: { readonly kind: MemberConfirmKind; readonly member: Member } | null;
  readonly isActing: boolean;
  readonly requestConfirm: (kind: MemberConfirmKind, membershipId: string) => void;
  readonly cancelConfirm: () => void;
  readonly confirmAction: () => Promise<void>;
  readonly unblock: (membershipId: string) => Promise<void>;
  readonly requestRegenerate: (membershipId: string) => void;
}

const nameOf = (member: Member): string =>
  accountDisplayName({ name: member.fullName, email: member.email, mobile: member.mobile });

export function useMemberAdmin(): UseMemberAdminResult {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const isManager = useIsOwnerOrAdmin();
  const role = useAppSelector(selectActiveRole);
  const user = useAppSelector(selectSessionUser);
  const rows = useAppSelector(selectMemberRows);
  const actionsTargetId = useAppSelector(selectMemberActionsTargetId);
  const editTargetId = useAppSelector(selectEditMemberTargetId);
  const editStatus = useAppSelector(selectEditMemberStatus);
  const confirmState = useAppSelector(selectMemberConfirm);
  const actionStatus = useAppSelector(selectMemberActionStatus);

  const { key: blockKey, rotate: rotateBlockKey } = useIdempotencyKey();
  const { key: unblockKey, rotate: rotateUnblockKey } = useIdempotencyKey();
  const { key: removeKey, rotate: rotateRemoveKey } = useIdempotencyKey();

  const viewer = useMemo<MemberActionViewer>(
    () => ({ isManager, role, userId: user?.id ?? null }),
    [isManager, role, user?.id]
  );

  const find = useCallback(
    (id: string | null): Member | null => (id ? (rows.find((row) => row.id === id) ?? null) : null),
    [rows]
  );

  const openActions = useCallback(
    (membershipId: string) => {
      dispatch(memberActionsOpened(membershipId));
    },
    [dispatch]
  );
  const closeActions = useCallback(() => {
    dispatch(memberActionsClosed());
  }, [dispatch]);

  const openEdit = useCallback(
    (membershipId: string) => {
      dispatch(editMemberOpened(membershipId));
    },
    [dispatch]
  );
  const closeEdit = useCallback(() => {
    dispatch(editMemberClosed());
  }, [dispatch]);

  const editTarget = find(editTargetId);

  const submitEdit = useCallback(
    async (
      values: EditMemberFormValues,
      setError: UseFormSetError<EditMemberFormValues>
    ): Promise<readonly string[]> => {
      if (!editTarget) return [];
      // Only what CHANGED goes on the wire — see `memberService.updateMember`.
      const name = values.fullName.trim();
      const changes: MemberEdit = {
        ...(name !== editTarget.fullName ? { fullName: name } : {}),
        ...(values.role !== editTarget.role ? { role: values.role } : {}),
      };
      if (Object.keys(changes).length === 0) {
        dispatch(editMemberClosed());
        return [];
      }
      try {
        const saved = await dispatch(editMember({ membershipId: editTarget.id, changes })).unwrap();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'team.member.edit.done',
            params: { name: nameOf(saved) },
          })
        );
        return [];
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          return applyServerErrors(apiError, setError, [...EDIT_MEMBER_FIELDS], t);
        }
        // Anything else was toasted by the transport; the form stays open.
        return [];
      }
    },
    [dispatch, editTarget, t]
  );

  const requestConfirm = useCallback(
    (kind: MemberConfirmKind, membershipId: string) => {
      dispatch(memberConfirmRequested({ kind, id: membershipId }));
    },
    [dispatch]
  );
  const cancelConfirm = useCallback(() => {
    dispatch(memberConfirmCancelled());
  }, [dispatch]);

  const confirmMember = find(confirmState?.id ?? null);

  const confirmAction = useCallback(async () => {
    if (!confirmState || !confirmMember) return;
    const name = nameOf(confirmMember);
    try {
      if (confirmState.kind === 'block') {
        await dispatch(
          blockMember({ membershipId: confirmState.id, idempotencyKey: blockKey })
        ).unwrap();
        rotateBlockKey();
        dispatch(
          showSnackbar({ severity: 'success', id: 'team.member.block.done', params: { name } })
        );
      } else {
        await dispatch(
          removeMember({ membershipId: confirmState.id, idempotencyKey: removeKey })
        ).unwrap();
        rotateRemoveKey();
        dispatch(
          showSnackbar({ severity: 'success', id: 'team.member.remove.done', params: { name } })
        );
      }
    } catch {
      // Already surfaced through the global snackbar; the confirm has closed.
      // The key is NOT rotated: a retry of the same act should replay.
    }
  }, [dispatch, confirmState, confirmMember, blockKey, rotateBlockKey, removeKey, rotateRemoveKey]);

  const unblock = useCallback(
    async (membershipId: string) => {
      const member = find(membershipId);
      try {
        await dispatch(unblockMember({ membershipId, idempotencyKey: unblockKey })).unwrap();
        rotateUnblockKey();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'team.member.unblock.done',
            params: { name: member ? nameOf(member) : '' },
          })
        );
      } catch {
        // Toasted by the transport (or claimed by the plan dialog for a seat).
      }
    },
    [dispatch, find, unblockKey, rotateUnblockKey]
  );

  const requestRegenerate = useCallback(
    (membershipId: string) => {
      dispatch(regenerateRequested(membershipId));
    },
    [dispatch]
  );

  // Resolved from the CURRENT rows on every render, never cached: if the row
  // changed under the sheet (a refetch) the sheet recomputes what it offers.
  const actionsTarget = find(actionsTargetId);

  return {
    viewer,
    actionsTarget,
    openActions,
    closeActions,
    editTarget,
    isEditing: editStatus === 'loading',
    openEdit,
    closeEdit,
    submitEdit,
    confirm:
      confirmState && confirmMember ? { kind: confirmState.kind, member: confirmMember } : null,
    isActing: actionStatus === 'loading',
    requestConfirm,
    cancelConfirm,
    confirmAction,
    unblock,
    requestRegenerate,
  };
}
