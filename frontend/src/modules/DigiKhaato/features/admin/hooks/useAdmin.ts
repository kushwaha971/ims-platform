'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDebounce } from 'src/hooks/useDebounce';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { replaceDocument } from 'src/utils/documentNavigation';

import {
  pageChanged,
  searchChanged,
  selectAdmin,
  statusFilterChanged,
  type AdminState,
} from '../redux/adminSlice';
import {
  fetchHealth,
  fetchOverview,
  fetchPartners,
  fetchPlans,
  fetchTenantDetail,
  fetchTenants,
  requestSupportAccess,
  startImpersonation,
  updateTenant,
} from '../redux/adminThunk';

import type { AdminTenantPatch, AdminTenantStatus } from '../types/admin.types';

/** Part 19 §19.1.1 layer 4 — the console's doors into Redux, one per screen. */

const SEARCH_DEBOUNCE_MS = 300;
/** FRD §6 — the health page refreshes itself every 30 s. */
export const HEALTH_REFRESH_MS = 30_000;

export interface UseAdminTenantsResult {
  readonly state: AdminState;
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly setStatus: (value: AdminTenantStatus | null) => void;
  readonly setPage: (page: number, pageSize?: number) => void;
  readonly refetch: () => void;
}

export function useAdminTenants(): UseAdminTenantsResult {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAdmin);
  const [search, setSearch] = useState(state.filters.q);
  const debounced = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const { filters } = state;

  useEffect(() => {
    if (debounced !== filters.q) dispatch(searchChanged(debounced));
  }, [debounced, filters.q, dispatch]);

  useEffect(() => {
    const promise = dispatch(fetchTenants(filters));
    return () => promise.abort();
  }, [dispatch, filters]);

  useEffect(() => {
    const promise = dispatch(fetchOverview());
    return () => promise.abort();
  }, [dispatch]);

  const setStatus = useCallback(
    (value: AdminTenantStatus | null) => dispatch(statusFilterChanged(value)),
    [dispatch]
  );
  const setPage = useCallback(
    (page: number, pageSize?: number) => dispatch(pageChanged({ page, pageSize })),
    [dispatch]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchTenants(filters));
  }, [dispatch, filters]);

  return { state, search, setSearch, setStatus, setPage, refetch };
}

export interface UseAdminTenantDetailResult {
  readonly state: AdminState;
  readonly refetch: () => void;
  readonly save: (patch: AdminTenantPatch) => Promise<boolean>;
  readonly requestAccess: (reason: string) => Promise<boolean>;
  readonly enter: (consentId: string, reason: string) => Promise<void>;
}

export function useAdminTenantDetail(id: string): UseAdminTenantDetailResult {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAdmin);

  useEffect(() => {
    const promise = dispatch(fetchTenantDetail(id));
    return () => promise.abort();
  }, [dispatch, id]);

  useEffect(() => {
    const promise = dispatch(fetchPlans());
    return () => promise.abort();
  }, [dispatch]);

  const refetch = useCallback(() => {
    void dispatch(fetchTenantDetail(id));
  }, [dispatch, id]);

  const save = useCallback(
    async (patch: AdminTenantPatch) => {
      try {
        await dispatch(updateTenant({ id, patch })).unwrap();
      } catch {
        return false; // refusals reach the global snackbar
      }
      dispatch(showSnackbar({ severity: 'success', id: 'admin.tenant.save.done' }));
      return true;
    },
    [dispatch, id]
  );

  const requestAccess = useCallback(
    async (reason: string) => {
      try {
        await dispatch(requestSupportAccess({ id, reason })).unwrap();
      } catch {
        return false;
      }
      dispatch(showSnackbar({ severity: 'success', id: 'admin.access.requested' }));
      return true;
    },
    [dispatch, id]
  );

  const enter = useCallback(
    async (consentId: string, reason: string) => {
      try {
        await dispatch(startImpersonation({ id, consentId, reason })).unwrap();
      } catch {
        return;
      }
      // FR-5: a DOCUMENT load, so every slice rebuilds from `/auth/me` inside
      // the business with the support cookie, and nothing of the console's
      // state is carried into it.
      replaceDocument(ROUTES.DASHBOARD);
    },
    [dispatch, id]
  );

  return { state, refetch, save, requestAccess, enter };
}

export function useAdminPartners(): { readonly state: AdminState; readonly refetch: () => void } {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAdmin);
  useEffect(() => {
    const promise = dispatch(fetchPartners());
    return () => promise.abort();
  }, [dispatch]);
  const refetch = useCallback(() => {
    void dispatch(fetchPartners());
  }, [dispatch]);
  return { state, refetch };
}

export function useAdminHealth(): { readonly state: AdminState; readonly refetch: () => void } {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAdmin);
  useEffect(() => {
    let promise = dispatch(fetchHealth());
    const timer = window.setInterval(() => {
      promise = dispatch(fetchHealth());
    }, HEALTH_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      promise.abort();
    };
  }, [dispatch]);
  const refetch = useCallback(() => {
    void dispatch(fetchHealth());
  }, [dispatch]);
  return { state, refetch };
}
