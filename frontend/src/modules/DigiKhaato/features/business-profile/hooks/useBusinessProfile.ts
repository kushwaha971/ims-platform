'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchSession } from '../../auth/redux/sessionThunk';
import {
  selectBusinessProfile,
  selectBusinessProfileError,
  selectBusinessProfileSaveStatus,
  selectBusinessProfileStatus,
  selectBusinessProfileWarnings,
} from '../redux/businessProfileSlice';
import { fetchBusinessProfile, saveBusinessProfile } from '../redux/businessProfileThunk';

import type { BusinessProfile, ProfileWarning } from '../types/businessProfile.types';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for PLT-07. A save
 * refetches the session so the shell's business name and GST type move with
 * it (§14: "profile lives in `sessionSlice.activeTenant` after save").
 */
export interface UseBusinessProfileResult {
  readonly data: BusinessProfile | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly isSaving: boolean;
  readonly warnings: readonly ProfileWarning[];
  readonly canWrite: boolean;
  readonly refetch: () => void;
  readonly save: (profile: BusinessProfile) => Promise<ApiErrorShape | null>;
}

export function useBusinessProfile(): UseBusinessProfileResult {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectBusinessProfile);
  const status = useAppSelector(selectBusinessProfileStatus);
  const error = useAppSelector(selectBusinessProfileError);
  const saveStatus = useAppSelector(selectBusinessProfileSaveStatus);
  const warnings = useAppSelector(selectBusinessProfileWarnings);
  const { canWrite } = useDegradedNetwork();

  useEffect(() => {
    const promise = dispatch(fetchBusinessProfile());
    return () => promise.abort();
  }, [dispatch]);

  const refetch = useCallback(() => {
    void dispatch(fetchBusinessProfile());
  }, [dispatch]);

  const save = useCallback(
    async (profile: BusinessProfile) => {
      try {
        await dispatch(saveBusinessProfile(profile)).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: 'settings.profile.saved' }));
        void dispatch(fetchSession());
        return null;
      } catch (thrown) {
        return thrown as ApiErrorShape;
      }
    },
    [dispatch]
  );

  return {
    data,
    status,
    error,
    isSaving: saveStatus === 'loading',
    warnings,
    canWrite: canWrite('online-only'),
    refetch,
    save,
  };
}
