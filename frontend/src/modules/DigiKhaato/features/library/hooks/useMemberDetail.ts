'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';

import {
  selectLibraryMemberDetail,
  type LibraryMemberDetailState,
} from '../redux/libraryMemberDetailSlice';
import { actOnLibraryMember, fetchLibraryMember } from '../redux/libraryMemberThunk';

import type { MemberAction } from '../api/libraryMemberService';

export type ActOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: ApiErrorShape | null };

export interface MemberDetailResult extends LibraryMemberDetailState {
  readonly canRead: boolean;
  readonly canWrite: boolean;
  /** Suspend, reactivate and close (`library.member.close`, owner and admin). */
  readonly canClose: boolean;
  readonly refetch: () => void;
  readonly act: (
    action: MemberAction,
    body: Readonly<Record<string, unknown>>,
    key?: string
  ) => Promise<ActOutcome>;
}

/**
 * F04 (LIB-04 §7) — one member's data and acts, so the page only renders. A
 * write elsewhere that stales the member refetches it; an act answers with the
 * member as it now is.
 */
export const useMemberDetail = (id: string): MemberDetailResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibraryMemberDetail);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.member.read');

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryMember(id));
    return () => promise.abort();
  }, [dispatch, id, canRead]);
  useEffect(() => {
    if (!state.stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchLibraryMember(id));
    return () => promise.abort();
  }, [dispatch, id, state.stale, isImpaired, canRead]);

  const refetch = useCallback(() => {
    void dispatch(fetchLibraryMember(id));
  }, [dispatch, id]);

  const act = useCallback(
    async (
      action: MemberAction,
      body: Readonly<Record<string, unknown>>,
      key?: string
    ): Promise<ActOutcome> => {
      const result = await dispatch(actOnLibraryMember({ id, action, body, key }));
      if (actOnLibraryMember.fulfilled.match(result)) {
        dispatch(
          showSnackbar({
            severity: 'success',
            id: `library.member.done.${action}`,
            params: { name: result.payload.name },
          })
        );
        return { ok: true };
      }
      return { ok: false, error: result.payload ?? null };
    },
    [dispatch, id]
  );

  return {
    ...state,
    canRead,
    canWrite: canRead && can('library.member.write'),
    canClose: canRead && can('library.member.close'),
    refetch,
    act,
  };
};
