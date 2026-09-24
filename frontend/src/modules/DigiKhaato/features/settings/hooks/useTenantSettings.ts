'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchSession } from '../../auth/redux/sessionThunk';
import {
  conflictDismissed,
  selectModulesStatus,
  selectSavingSection,
  selectSettings,
  selectSettingsConflict,
  selectSettingsError,
  selectSettingsStatus,
} from '../redux/settingsSlice';
import {
  fetchSettings,
  fetchSettingsDefaults,
  saveSettingsSection,
  toggleModules,
} from '../redux/settingsThunk';

import type { SettingsSection, SettingsValues, TenantSettings } from '../types/settings.types';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for PLT-06.
 *
 * After a save or a module switch the SESSION is refetched as well (FR-9):
 * `/auth/me` carries `enabled_modules`, so that is what makes the sidebar lose
 * "Stock" the moment it is switched off, with no reload (AC-2).
 */
export interface UseTenantSettingsResult {
  readonly data: TenantSettings | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly savingSection: SettingsSection | null;
  readonly conflict: boolean;
  readonly isTogglingModules: boolean;
  readonly canWrite: boolean;
  readonly refetch: () => void;
  readonly saveSection: (section: SettingsSection, patch: SettingsValues) => Promise<boolean>;
  readonly loadDefaults: () => Promise<SettingsValues | null>;
  readonly setModules: (modules: readonly string[]) => Promise<boolean>;
  readonly reloadAfterConflict: () => void;
}

export function useTenantSettings(enabled: boolean): UseTenantSettingsResult {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectSettings);
  const status = useAppSelector(selectSettingsStatus);
  const error = useAppSelector(selectSettingsError);
  const savingSection = useAppSelector(selectSavingSection);
  const conflict = useAppSelector(selectSettingsConflict);
  const modulesStatus = useAppSelector(selectModulesStatus);
  const { canWrite } = useDegradedNetwork();

  useEffect(() => {
    if (!enabled) return undefined;
    const promise = dispatch(fetchSettings());
    return () => promise.abort();
  }, [dispatch, enabled]);

  const refetch = useCallback(() => {
    void dispatch(fetchSettings());
  }, [dispatch]);

  const saveSection = useCallback(
    async (section: SettingsSection, patch: SettingsValues) => {
      try {
        await dispatch(saveSettingsSection({ section, patch })).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: 'settings.saved' }));
        void dispatch(fetchSession());
        return true;
      } catch {
        // 412 opens the conflict dialog (slice); the rest reach the snackbar.
        return false;
      }
    },
    [dispatch]
  );

  const loadDefaults = useCallback(async () => {
    try {
      const defaults = await dispatch(fetchSettingsDefaults()).unwrap();
      return defaults.values;
    } catch {
      return null;
    }
  }, [dispatch]);

  const setModules = useCallback(
    async (modules: readonly string[]) => {
      try {
        await dispatch(toggleModules(modules)).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: 'settings.module.saved' }));
        void dispatch(fetchSettings());
        void dispatch(fetchSession());
        return true;
      } catch {
        return false;
      }
    },
    [dispatch]
  );

  const reloadAfterConflict = useCallback(() => {
    dispatch(conflictDismissed());
    void dispatch(fetchSettings());
  }, [dispatch]);

  return {
    data,
    status,
    error,
    savingSection,
    conflict,
    isTogglingModules: modulesStatus === 'loading',
    canWrite: canWrite('online-only'),
    refetch,
    saveSection,
    loadDefaults,
    setModules,
    reloadAfterConflict,
  };
}
