'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';

import {
  createLibraryCharge,
  fetchMemberCharges,
  reverseLibraryCharge,
  waiveLibraryCharge,
} from '../redux/libraryChargeThunk';
import { selectLibraryMemberDetail } from '../redux/libraryMemberDetailSlice';

import type { ChargeRow, ChargeTotals, ManualChargeKind } from '../types/charge.types';

export type ChargeOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: ApiErrorShape | null };

export interface MemberCharges {
  readonly charges: readonly ChargeRow[] | null;
  readonly totals: ChargeTotals | null;
  readonly canWaive: boolean;
  readonly canWrite: boolean;
  readonly canCollect: boolean;
  readonly waive: (id: string, amount: string, reason: string) => Promise<ChargeOutcome>;
  readonly reverse: (id: string, reason: string) => Promise<ChargeOutcome>;
  readonly create: (
    body: { kind: ManualChargeKind; amount: string; description: string },
    key: string
  ) => Promise<ChargeOutcome>;
}

/**
 * F06 (LIB-07 §7) — the member page's charges and the acts on them. The list
 * is fetched with the member and again whenever the member is (a payment, a
 * waiver or a renewal moves both together).
 */
export const useMemberCharges = (membershipId: string): MemberCharges => {
  const dispatch = useAppDispatch();
  const { member, charges, chargeTotals } = useAppSelector(selectLibraryMemberDetail);
  const { can } = usePermissions();

  useEffect(() => {
    if (!member || member.membershipId !== membershipId) return undefined;
    const promise = dispatch(fetchMemberCharges(membershipId));
    return () => promise.abort();
  }, [dispatch, member, membershipId]);

  const done = useCallback(
    (id: string) => dispatch(showSnackbar({ severity: 'success', id })),
    [dispatch]
  );

  const waive = useCallback(
    async (id: string, amount: string, reason: string): Promise<ChargeOutcome> => {
      const result = await dispatch(waiveLibraryCharge({ id, amount, reason }));
      if (waiveLibraryCharge.fulfilled.match(result)) {
        done('library.charge.done.waive');
        return { ok: true };
      }
      return { ok: false, error: result.payload ?? null };
    },
    [dispatch, done]
  );

  const reverse = useCallback(
    async (id: string, reason: string): Promise<ChargeOutcome> => {
      const result = await dispatch(reverseLibraryCharge({ id, reason }));
      if (reverseLibraryCharge.fulfilled.match(result)) {
        done('library.charge.done.reverse');
        return { ok: true };
      }
      return { ok: false, error: result.payload ?? null };
    },
    [dispatch, done]
  );

  const create = useCallback(
    async (
      body: { kind: ManualChargeKind; amount: string; description: string },
      key: string
    ): Promise<ChargeOutcome> => {
      const result = await dispatch(
        createLibraryCharge({ body: { membership_id: membershipId, ...body }, key })
      );
      if (createLibraryCharge.fulfilled.match(result)) {
        done('library.charge.done.create');
        return { ok: true };
      }
      return { ok: false, error: result.payload ?? null };
    },
    [dispatch, done, membershipId]
  );

  return {
    charges,
    totals: chargeTotals,
    canWaive: can('library.charge.waive'),
    canWrite: can('library.charge.write'),
    canCollect: can('payments.payment.write'),
    waive,
    reverse,
    create,
  };
};
