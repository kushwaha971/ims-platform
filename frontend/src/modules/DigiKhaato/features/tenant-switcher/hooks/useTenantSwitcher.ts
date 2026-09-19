'use client';

import { useCallback, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import {
  selectActiveTenant,
  selectSessionTenants,
  type SessionTenant,
} from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES, onboardingStepPath } from 'src/routes';
import type { ApiErrorShape } from 'src/types/api.types';
import { clearLocalExceptDrafts } from 'src/utils/storage';

import { switchTenant } from '../../auth/redux/sessionThunk';
import { resetOnboarding } from '../../onboarding/redux/onboardingSlice';
import { leaveTenant, setDefaultTenant } from '../redux/tenantSwitcherThunk';
import { groupTenants, type TenantGroups } from '../view-model/tenantDisplay';

/**
 * PLT-04 — the switcher's only door into Redux, and the owner of §19.6.5's
 * five-step switch sequence.
 *
 * The sequence is not negotiable and is the reason this is a hook rather than
 * an `onClick`:
 *   1. `POST /auth/switch-tenant` → a new token carrying the new `tid`;
 *   2. `resetAllFeatureState()` → every feature slice back to initial (the
 *      INVALIDATION map's `resetAll`, dispatched by the listener on fulfilment);
 *   3. the session is refetched by the same thunk;
 *   4. tenant-scoped `localStorage` is cleared, drafts excepted — draft keys
 *      are already tenant-prefixed, so the new tenant's drafts survive;
 *   5. `router.replace('/dashboard')` — staying on `/parties/<uuid>` would
 *      request another tenant's record and get a 404, which reads to the user
 *      as data loss.
 *
 * Step 5 is why the navigation lives here and not in the component: three call
 * sites (menu, chooser, post-login) must all do it.
 */
export interface UseTenantSwitcherResult {
  readonly activeTenant: SessionTenant | null;
  readonly tenants: readonly SessionTenant[];
  readonly groups: TenantGroups;
  /** The id of the row whose spinner is showing; the menu stays open (§9). */
  readonly switchingTenantId: string | null;
  readonly busyMembershipId: string | null;
  readonly error: ApiErrorShape | null;
  /** False in confirmed `offline` — menu items are disabled, not hidden. */
  readonly canSwitch: boolean;
  readonly switchTo: (tenantId: string) => Promise<void>;
  readonly makeDefault: (membershipId: string) => Promise<void>;
  readonly leave: (membershipId: string) => Promise<void>;
  readonly addBusiness: () => void;
  readonly clearError: () => void;
}

export const useTenantSwitcher = (): UseTenantSwitcherResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const activeTenant = useAppSelector(selectActiveTenant);
  const tenants = useAppSelector(selectSessionTenants);
  const { canWrite } = useDegradedNetwork();

  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorShape | null>(null);

  const groups = useMemo(() => groupTenants(tenants), [tenants]);

  const switchTo = useCallback(
    async (tenantId: string) => {
      if (tenantId === activeTenant?.id) return;
      setSwitchingTenantId(tenantId);
      setError(null);
      try {
        const session = await dispatch(switchTenant({ tenantId })).unwrap();
        // §19.6.5 step 4. Drafts are tenant-prefixed and survive deliberately.
        clearLocalExceptDrafts();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'tenant.switcher.switched',
            params: { name: session.activeTenant?.name ?? '' },
          })
        );
        // §19.6.5 step 5 — never stay on a record id from the old tenant.
        router.replace(ROUTES.DASHBOARD);
      } catch (thrown) {
        // §9 "Error" — a 403 means the membership was suspended meanwhile; the
        // refreshed list no longer contains it, and the menu says so.
        setError(thrown as ApiErrorShape);
      } finally {
        setSwitchingTenantId(null);
      }
    },
    [activeTenant?.id, dispatch, router]
  );

  const makeDefault = useCallback(
    async (membershipId: string) => {
      setBusyMembershipId(membershipId);
      setError(null);
      try {
        await dispatch(setDefaultTenant({ membershipId })).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: 'tenant.switcher.defaultSet' }));
      } catch (thrown) {
        setError(thrown as ApiErrorShape);
      } finally {
        setBusyMembershipId(null);
      }
    },
    [dispatch]
  );

  const leave = useCallback(
    async (membershipId: string) => {
      setBusyMembershipId(membershipId);
      setError(null);
      try {
        await dispatch(leaveTenant({ membershipId })).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: 'tenant.switcher.left' }));
      } catch (thrown) {
        // 409 `last_owner` lands here and is rendered by the dialog, because
        // "a business must always have one owner" is guidance, not a toast.
        setError(thrown as ApiErrorShape);
      } finally {
        setBusyMembershipId(null);
      }
    },
    [dispatch]
  );

  /**
   * FR-6 — "Add a business" is PLT-03 again, with the session already live.
   * The wizard's slice is cleared FIRST: it may still hold the draft of the
   * business this user created last time, and step 1 prefilled with another
   * shop's name is how a second business ends up called the same thing.
   */
  const addBusiness = useCallback(() => {
    dispatch(resetOnboarding());
    router.push(onboardingStepPath(1));
  }, [dispatch, router]);

  const clearError = useCallback(() => setError(null), []);

  return {
    activeTenant,
    tenants,
    groups,
    switchingTenantId,
    busyMembershipId,
    error,
    canSwitch: canWrite('online-only'),
    switchTo,
    makeDefault,
    leave,
    addBusiness,
    clearError,
  };
};
