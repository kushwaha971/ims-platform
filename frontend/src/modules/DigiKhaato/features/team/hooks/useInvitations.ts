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
  inviteDialogClosed,
  inviteDialogOpened,
  inviteLinkDismissed,
  pageChanged,
  revokeCancelled,
  revokeRequested,
  selectInvitationError,
  selectInvitationMeta,
  selectInvitationPage,
  selectInvitationPageSize,
  selectInvitationRows,
  selectInvitationStale,
  selectInvitationStatus,
  selectInviteError,
  selectInviteOpen,
  selectInviteStatus,
  selectLastInvite,
  selectRevokeStatus,
  selectRevokeTargetId,
} from '../redux/invitationSlice';
import { fetchInvitations, inviteMember, revokeInvitation } from '../redux/invitationThunk';
import { INVITE_FIELDS } from '../validation/invitationSchemas';

import type { CreatedInvitation, Invitation } from '../types/invitation.types';
import type { InviteFormValues } from '../validation/invitationSchemas';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for the team screen.
 *
 * It owns four things no component on this screen may own:
 *
 *  · **The permission.** `platform.members.manage` decides whether the list is
 *    even fetched. The server enforces it on every request (R-SEC-2); asking
 *    anyway would spend a round trip to be told 403 and would put a toast on a
 *    screen that is already explaining itself.
 *  · **The idempotency key for the invite**, minted once by
 *    `useIdempotencyKey()` and reused on every RETRY, because a lost 201 must
 *    replay the invitation rather than mint a second token for one seat.
 *  · **The offline gate** (§19.10.4). Both writes are class C: never queued,
 *    disabled — not hidden — in confirmed `offline`, because hiding a control
 *    that will come back looks like the product removing a feature.
 *  · **The one-time link.** The copy affordance reports through the global
 *    snackbar, so a failed copy is never silent.
 */
export interface UseInvitationsResult {
  readonly rows: readonly Invitation[];
  readonly meta: PageMeta;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  /** False hides the whole screen's contents behind the refusal (R-SEC-2). */
  readonly canManage: boolean;
  /** False when the network cannot carry a class-C write right now. */
  readonly canWrite: boolean;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;

  readonly inviteOpen: boolean;
  readonly isInviting: boolean;
  readonly inviteError: ApiErrorShape | null;
  readonly inviteFormErrors: readonly string[];
  readonly openInvite: () => void;
  readonly closeInvite: () => void;
  readonly submitInvite: (
    values: InviteFormValues,
    setError: UseFormSetError<InviteFormValues>
  ) => Promise<void>;

  /** The 201's one-time link, or `null` when there is nothing to show. */
  readonly lastInvite: CreatedInvitation | null;
  readonly dismissInviteLink: () => void;
  readonly copyInviteLink: () => Promise<void>;

  readonly revokeTarget: Invitation | null;
  readonly isRevoking: boolean;
  readonly requestRevoke: (id: string) => void;
  readonly cancelRevoke: () => void;
  readonly confirmRevoke: () => Promise<void>;

  readonly setPage: (page: number, pageSize?: number) => void;
  readonly refetch: () => void;
}

export function useInvitations(): UseInvitationsResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const canManage = can('platform.members.manage');

  const rows = useAppSelector(selectInvitationRows);
  const meta = useAppSelector(selectInvitationMeta);
  const page = useAppSelector(selectInvitationPage);
  const pageSize = useAppSelector(selectInvitationPageSize);
  const status = useAppSelector(selectInvitationStatus);
  const error = useAppSelector(selectInvitationError);
  const stale = useAppSelector(selectInvitationStale);
  const isImpaired = useAppSelector(selectNetworkImpaired);

  const inviteOpen = useAppSelector(selectInviteOpen);
  const inviteStatus = useAppSelector(selectInviteStatus);
  const inviteError = useAppSelector(selectInviteError);
  const lastInvite = useAppSelector(selectLastInvite);
  const revokeTargetId = useAppSelector(selectRevokeTargetId);
  const revokeStatus = useAppSelector(selectRevokeStatus);

  const { canWrite } = useDegradedNetwork();

  /**
   * ONE key per logical invite.
   *
   * `useIdempotencyKey` mints on mount and this hook is mounted once for the
   * whole screen, so there is no need for the slice-held copy the onboarding
   * wizard needs — that exists because every step of the wizard is its own
   * route and the hook remounts on each. Here the key is rotated explicitly
   * after a 201 and after a 400: a success and a corrected address are both
   * genuinely new logical writes, while a retry after a timeout is not, and it
   * is the retry the header exists for.
   */
  const { key: idempotencyKey, rotate } = useIdempotencyKey();

  const [inviteFormErrors, setInviteFormErrors] = useState<readonly string[]>([]);

  // One effect, one request. Aborted when the page changes mid-flight so a slow
  // page 1 can never overwrite a fast page 2.
  useEffect(() => {
    if (!canManage) return undefined;
    const promise = dispatch(fetchInvitations({ page, pageSize }));
    return () => promise.abort();
  }, [dispatch, canManage, page, pageSize]);

  // A mutation marked us stale — refetch once, silently (§19.3.6). Not while
  // the link is impaired: the rows are already painted and the merchant is
  // waiting on something else.
  useEffect(() => {
    if (!stale || !canManage || isImpaired) return undefined;
    const promise = dispatch(fetchInvitations({ page, pageSize }));
    return () => promise.abort();
  }, [stale, canManage, isImpaired, dispatch, page, pageSize]);

  const openInvite = useCallback(() => {
    setInviteFormErrors([]);
    dispatch(inviteDialogOpened());
  }, [dispatch]);

  const closeInvite = useCallback(() => {
    setInviteFormErrors([]);
    dispatch(inviteDialogClosed());
  }, [dispatch]);

  const submitInvite = useCallback(
    async (values: InviteFormValues, setError: UseFormSetError<InviteFormValues>) => {
      setInviteFormErrors([]);
      try {
        await dispatch(
          inviteMember({ email: values.email, role: values.role, idempotencyKey })
        ).unwrap();
        rotate();
        dispatch(showSnackbar({ severity: 'success', id: 'team.invite.success' }));
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          // The next attempt carries a different body — a corrected address or
          // a different role — so it is a new logical write and must not reuse
          // the key the server has already seen with the old one.
          rotate();
          setInviteFormErrors(applyServerErrors(apiError, setError, [...INVITE_FIELDS]));
        }
        // Everything else has already surfaced through the global channel:
        // `plan_limit_reached` as PLT-15's dialog, the rest as one toast.
      }
    },
    [dispatch, idempotencyKey, rotate]
  );

  const dismissInviteLink = useCallback(() => {
    dispatch(inviteLinkDismissed());
  }, [dispatch]);

  const copyInviteLink = useCallback(async () => {
    const url = lastInvite?.acceptUrl;
    if (!url) return;
    const ok = await copyText(url);
    dispatch(
      showSnackbar(
        ok
          ? { severity: 'success', id: 'team.link.copied' }
          : { severity: 'error', id: 'team.link.copyFailed' }
      )
    );
  }, [dispatch, lastInvite]);

  const requestRevoke = useCallback(
    (id: string) => {
      dispatch(revokeRequested(id));
    },
    [dispatch]
  );

  const cancelRevoke = useCallback(() => {
    dispatch(revokeCancelled());
  }, [dispatch]);

  const confirmRevoke = useCallback(async () => {
    if (!revokeTargetId) return;
    try {
      await dispatch(revokeInvitation({ id: revokeTargetId })).unwrap();
      dispatch(showSnackbar({ severity: 'success', id: 'team.revoke.success' }));
    } catch {
      // The global channel already carries it; the dialog has closed.
    }
  }, [dispatch, revokeTargetId]);

  const setPage = useCallback(
    (next: number, nextSize?: number) => {
      dispatch(pageChanged({ page: next, pageSize: nextSize }));
    },
    [dispatch]
  );

  const refetch = useCallback(() => {
    void dispatch(fetchInvitations({ page, pageSize }));
  }, [dispatch, page, pageSize]);

  return {
    rows,
    meta,
    status,
    error,
    canManage,
    // Both writes are class C — online only, disabled rather than hidden.
    canWrite: canWrite('online-only'),
    isLoading: status === 'loading',
    isRefreshing: status === 'refreshing',

    inviteOpen,
    isInviting: inviteStatus === 'loading',
    inviteError,
    inviteFormErrors,
    openInvite,
    closeInvite,
    submitInvite,

    lastInvite,
    dismissInviteLink,
    copyInviteLink,

    revokeTarget: rows.find((row) => row.id === revokeTargetId) ?? null,
    isRevoking: revokeStatus === 'loading',
    requestRevoke,
    cancelRevoke,
    confirmRevoke,

    setPage,
    refetch,
  };
}
