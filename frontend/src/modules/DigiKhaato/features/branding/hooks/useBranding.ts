'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchSession } from '../../auth/redux/sessionThunk';
import {
  selectBranding,
  selectBrandingError,
  selectBrandingSaveStatus,
  selectBrandingStatus,
  selectSuggestedHex,
} from '../redux/brandingSlice';
import { fetchBranding, saveBranding } from '../redux/brandingThunk';

import type { Branding, BrandingChanges } from '../types/branding.types';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for branding (WLB-01)
 * and PLT-07's signature.
 *
 * A successful save refetches the SESSION: the theme, the app name and the
 * logo in the shell all read the resolved branding `/auth/me` carries, so that
 * is what makes the colour change "within 1 s, no reload" (AC-1).
 */
export interface UseBrandingResult {
  readonly data: Branding | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly isSaving: boolean;
  readonly suggestedHex: string | null;
  readonly canWrite: boolean;
  readonly refetch: () => void;
  readonly save: (changes: BrandingChanges, successId?: string) => Promise<boolean>;
}

export function useBranding(): UseBrandingResult {
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectBranding);
  const status = useAppSelector(selectBrandingStatus);
  const error = useAppSelector(selectBrandingError);
  const saveStatus = useAppSelector(selectBrandingSaveStatus);
  const suggestedHex = useAppSelector(selectSuggestedHex);
  const { canWrite } = useDegradedNetwork();

  useEffect(() => {
    const promise = dispatch(fetchBranding());
    return () => promise.abort();
  }, [dispatch]);

  const refetch = useCallback(() => {
    void dispatch(fetchBranding());
  }, [dispatch]);

  const save = useCallback(
    async (changes: BrandingChanges, successId = 'branding.saved') => {
      try {
        await dispatch(saveBranding(changes)).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: successId }));
        void dispatch(fetchSession());
        return true;
      } catch {
        // `low_contrast` is answered under the colour field (slice); the rest
        // reach the global snackbar.
        return false;
      }
    },
    [dispatch]
  );

  return {
    data,
    status,
    error,
    isSaving: saveStatus === 'loading',
    suggestedHex,
    canWrite: canWrite('online-only'),
    refetch,
    save,
  };
}
