'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  limitDialogClosed,
  selectPlanCode,
  selectPlanDialogOpen,
  selectPlanError,
  selectPlanLastHit,
  selectPlanLimits,
  selectPlanStatus,
  selectPlanSupportContact,
} from '../redux/planSlice';
import { fetchPlanLimits } from '../redux/planThunk';
import { METERED_LIMIT_KEYS } from '../types/plan.types';
import { findLimit, isAtLimit, isNearLimit, isUnlimited } from '../view-model/planDisplay';

import type { PlanLimit, PlanLimitHit, PlanSupportContact } from '../types/plan.types';

/**
 * PLT-15 — the plan surfaces' door into Redux.
 *
 * **DEC-001 shapes this hook.** At MVP the client meters exactly one thing: the
 * member count. `metered` is therefore `max_users` and nothing else, and there
 * is deliberately no party counter, no invoice-per-month meter and no "80 of
 * 100" surface for either — the ledger is never capped and neither ceiling
 * exists on any MVP plan. `limits` still exposes whatever the server sent, so
 * the plan card can say "Unlimited" honestly rather than claim a number.
 */
export interface UsePlanLimitsResult {
  readonly planCode: string | null;
  readonly limits: readonly PlanLimit[];
  /** DEC-001 — the only limit with a meter: team members. */
  readonly metered: readonly PlanLimit[];
  readonly memberLimit: PlanLimit | null;
  /** FR-7 — ≥ 80 %, so the owner hears about it before a member is refused. */
  readonly isNearMemberLimit: boolean;
  readonly isAtMemberLimit: boolean;
  readonly supportContact: PlanSupportContact;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly lastHit: PlanLimitHit | null;
  readonly dialogOpen: boolean;
  readonly closeDialog: () => void;
  readonly refetch: () => void;
}

export const usePlanLimits = (options?: {
  readonly fetchOnMount?: boolean;
}): UsePlanLimitsResult => {
  const dispatch = useAppDispatch();
  const planCode = useAppSelector(selectPlanCode);
  const limits = useAppSelector(selectPlanLimits);
  const supportContact = useAppSelector(selectPlanSupportContact);
  const status = useAppSelector(selectPlanStatus);
  const error = useAppSelector(selectPlanError);
  const lastHit = useAppSelector(selectPlanLastHit);
  const dialogOpen = useAppSelector(selectPlanDialogOpen);
  const activeTenant = useAppSelector(selectActiveTenant);

  const fetchOnMount = options?.fetchOnMount ?? false;
  const tenantId = activeTenant?.id ?? null;

  // Only the plan card asks for the counters; the dialog needs nothing fetched,
  // because the 403 that opened it carried its own numbers (FR-4). One effect,
  // one request, aborted if the tenant changes mid-flight.
  useEffect(() => {
    if (!fetchOnMount || !tenantId) return undefined;
    const promise = dispatch(fetchPlanLimits());
    return () => promise.abort();
  }, [dispatch, fetchOnMount, tenantId]);

  const metered = useMemo(
    () => limits.filter((limit) => METERED_LIMIT_KEYS.includes(limit.key)),
    [limits]
  );
  const memberLimit = useMemo(() => findLimit(limits, 'max_users'), [limits]);

  const closeDialog = useCallback(() => {
    dispatch(limitDialogClosed());
  }, [dispatch]);

  const refetch = useCallback(() => {
    void dispatch(fetchPlanLimits());
  }, [dispatch]);

  return {
    planCode,
    limits,
    metered,
    memberLimit,
    isNearMemberLimit: memberLimit ? isNearLimit(memberLimit) : false,
    isAtMemberLimit: memberLimit ? isAtLimit(memberLimit) : false,
    supportContact,
    status,
    error,
    lastHit,
    dialogOpen,
    closeDialog,
    refetch,
  };
};

/** Re-exported so a caller does not reach into the view-model for one predicate. */
export { isUnlimited };
