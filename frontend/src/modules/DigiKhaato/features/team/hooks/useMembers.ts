'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { copyText } from 'src/utils/clipboard';

import {
  addMemberDialogClosed,
  addMemberDialogOpened,
  credentialsDismissed,
  memberPageChanged,
  regenerateCancelled,
  regenerateRequested,
  selectAddMemberError,
  selectAddMemberOpen,
  selectAddMemberStatus,
  selectLastCredentials,
  selectMemberError,
  selectMemberMeta,
  selectMemberPage,
  selectMemberPageSize,
  selectMemberRows,
  selectMemberStale,
  selectMemberStatus,
  selectRegenerateStatus,
  selectRegenerateTargetId,
} from '../redux/memberSlice';
import { addMember, fetchMembers, regenerateCredentials } from '../redux/memberThunk';
import { ADD_MEMBER_FIELDS } from '../validation/memberSchemas';

import type { IssuedCredentials, Member } from '../types/member.types';
import type { AddMemberFormValues } from '../validation/memberSchemas';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for the member half of the
 * team screen (DEC-012). It owns the same four things `useInvitations` does —
 * the permission, the idempotency keys, the offline gate and the one-time
 * secret — and for the same reasons.
 *
 * The keys are notable. There are TWO, rotated independently: adding a member
 * and reissuing a password are different logical writes, and sharing one key
 * would make a reissue look to the server like a replay of the add and return
 * the add's stored body — a 201 for a member that already exists, carrying no
 * password, in answer to a request for a new one.
 */
export interface UseMembersResult {
  readonly canManage: boolean;
  readonly rows: readonly Member[];
  readonly meta: PageMeta;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly isLoading: boolean;
  readonly canWrite: boolean;

  readonly addOpen: boolean;
  readonly isAdding: boolean;
  readonly addError: ApiErrorShape | null;
  readonly addFormErrors: readonly string[];
  readonly openAdd: () => void;
  readonly closeAdd: () => void;
  readonly submitAdd: (
    values: AddMemberFormValues,
    setError: UseFormSetError<AddMemberFormValues>
  ) => Promise<void>;

  readonly lastCredentials: IssuedCredentials | null;
  readonly dismissCredentials: () => void;
  readonly copyShareText: (text: string) => Promise<void>;

  readonly regenerateTarget: Member | null;
  readonly isRegenerating: boolean;
  readonly requestRegenerate: (membershipId: string) => void;
  readonly cancelRegenerate: () => void;
  readonly confirmRegenerate: () => Promise<void>;

  readonly setPage: (page: number, pageSize?: number) => void;
  readonly refetch: () => void;
}

export function useMembers(): UseMembersResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const canManage = can('platform.members.manage');

  const rows = useAppSelector(selectMemberRows);
  const meta = useAppSelector(selectMemberMeta);
  const page = useAppSelector(selectMemberPage);
  const pageSize = useAppSelector(selectMemberPageSize);
  const status = useAppSelector(selectMemberStatus);
  const error = useAppSelector(selectMemberError);
  const stale = useAppSelector(selectMemberStale);
  const isImpaired = useAppSelector(selectNetworkImpaired);

  const addOpen = useAppSelector(selectAddMemberOpen);
  const addStatus = useAppSelector(selectAddMemberStatus);
  const addError = useAppSelector(selectAddMemberError);
  const lastCredentials = useAppSelector(selectLastCredentials);
  const regenerateTargetId = useAppSelector(selectRegenerateTargetId);
  const regenerateStatus = useAppSelector(selectRegenerateStatus);

  const { canWrite } = useDegradedNetwork();

  const { key: addKey, rotate: rotateAddKey } = useIdempotencyKey();
  const { key: regenerateKey, rotate: rotateRegenerateKey } = useIdempotencyKey();

  const [addFormErrors, setAddFormErrors] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!canManage) return undefined;
    const promise = dispatch(fetchMembers({ page, pageSize }));
    return () => promise.abort();
  }, [dispatch, canManage, page, pageSize]);

  useEffect(() => {
    if (!stale || !canManage || isImpaired) return undefined;
    const promise = dispatch(fetchMembers({ page, pageSize }));
    return () => promise.abort();
  }, [stale, canManage, isImpaired, dispatch, page, pageSize]);

  const openAdd = useCallback(() => {
    setAddFormErrors([]);
    dispatch(addMemberDialogOpened());
  }, [dispatch]);

  const closeAdd = useCallback(() => {
    setAddFormErrors([]);
    dispatch(addMemberDialogClosed());
  }, [dispatch]);

  const submitAdd = useCallback(
    async (values: AddMemberFormValues, setError: UseFormSetError<AddMemberFormValues>) => {
      setAddFormErrors([]);
      try {
        await dispatch(
          addMember({
            email: values.email,
            fullName: values.fullName,
            role: values.role,
            mobile: values.mobile ?? null,
            idempotencyKey: addKey,
          })
        ).unwrap();
        rotateAddKey();
        // No success toast. The credentials dialog opens in the same transition
        // and is the thing that must be read; a toast over it competes for the
        // merchant's attention with the one secret they cannot recover.
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          // A corrected address or a different role is a NEW logical write and
          // must not reuse a key the server has already seen with the old body.
          rotateAddKey();
          setAddFormErrors(applyServerErrors(apiError, setError, [...ADD_MEMBER_FIELDS]));
        }
      }
    },
    [dispatch, addKey, rotateAddKey]
  );

  const dismissCredentials = useCallback(() => {
    dispatch(credentialsDismissed());
  }, [dispatch]);

  const copyShareText = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      dispatch(
        showSnackbar(
          ok
            ? { severity: 'success', id: 'team.credentials.copied' }
            : { severity: 'error', id: 'team.credentials.copyFailed' }
        )
      );
    },
    [dispatch]
  );

  const requestRegenerate = useCallback(
    (membershipId: string) => {
      dispatch(regenerateRequested(membershipId));
    },
    [dispatch]
  );

  const cancelRegenerate = useCallback(() => {
    dispatch(regenerateCancelled());
  }, [dispatch]);

  const confirmRegenerate = useCallback(async () => {
    if (!regenerateTargetId) return;
    try {
      await dispatch(
        regenerateCredentials({
          membershipId: regenerateTargetId,
          idempotencyKey: regenerateKey,
        })
      ).unwrap();
      rotateRegenerateKey();
    } catch {
      // Already surfaced through the global snackbar; the confirm has closed.
    }
  }, [dispatch, regenerateTargetId, regenerateKey, rotateRegenerateKey]);

  const setPage = useCallback(
    (nextPage: number, nextPageSize?: number) => {
      dispatch(memberPageChanged({ page: nextPage, pageSize: nextPageSize }));
    },
    [dispatch]
  );

  const refetch = useCallback(() => {
    if (!canManage) return;
    void dispatch(fetchMembers({ page, pageSize }));
  }, [dispatch, canManage, page, pageSize]);

  return {
    canManage,
    rows,
    meta,
    status,
    error,
    isLoading: status === 'loading',
    // Both writes are class C, online-only (§19.10.4): never queued, and
    // DISABLED rather than hidden when the link is confirmed down — a control
    // that vanishes reads as the product removing a feature.
    canWrite: canWrite('online-only'),
    addOpen,
    isAdding: addStatus === 'loading',
    addError,
    addFormErrors,
    openAdd,
    closeAdd,
    submitAdd,
    lastCredentials,
    dismissCredentials,
    copyShareText,
    regenerateTarget: rows.find((row) => row.id === regenerateTargetId) ?? null,
    isRegenerating: regenerateStatus === 'loading',
    requestRegenerate,
    cancelRegenerate,
    confirmRegenerate,
    setPage,
    refetch,
  };
}
