'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import type { PermissionCode } from 'src/types/domain.types';

import { selectLibrarySettings, type LibrarySettingsState } from '../redux/librarySettingsSlice';
import {
  fetchLibrarySettings,
  raiseLibraryNumber,
  saveLibrarySettings,
} from '../redux/librarySettingsThunk';

import type { LibraryNumberKind, LibrarySettings } from '../types/settings.types';

/** LIB-01 §6 — any library reader may read the settings, read-only. */
const SETTINGS_READERS: readonly PermissionCode[] = [
  'library.catalogue.read',
  'library.member.read',
  'library.loan.read',
];

export type SaveOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: ApiErrorShape | null };

export interface LibrarySettingsResult extends LibrarySettingsState {
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly refetch: () => void;
  readonly save: (settings: LibrarySettings) => Promise<SaveOutcome>;
  readonly raise: (kind: LibraryNumberKind, nextNumber: number) => Promise<SaveOutcome>;
}

/**
 * F02 (LIB-01 §7, §8) — the settings screen's data and its two acts. A stale
 * version is not an error the librarian can fix: the screen reloads and says
 * so (§8 "Someone else changed these settings. Reloaded.").
 */
export const useLibrarySettings = (): LibrarySettingsResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibrarySettings);
  const { can, hasModule } = usePermissions();
  const on = hasModule('library');
  const canManage = on && can('library.settings.manage');
  const canRead = canManage || (on && SETTINGS_READERS.some((code) => can(code)));

  const refetch = useCallback(() => {
    void dispatch(fetchLibrarySettings());
  }, [dispatch]);

  useEffect(() => {
    if (!canRead) return;
    if (state.status === 'idle' || (state.stale && state.staleUrgency === 'now')) refetch();
  }, [canRead, refetch, state.status, state.stale, state.staleUrgency]);

  const save = useCallback(
    async (settings: LibrarySettings): Promise<SaveOutcome> => {
      const result = await dispatch(saveLibrarySettings(settings));
      if (saveLibrarySettings.fulfilled.match(result)) {
        dispatch(showSnackbar({ severity: 'success', id: 'library.settings.saved' }));
        return { ok: true };
      }
      const error = result.payload ?? null;
      if (error?.code === 'stale_version') {
        dispatch(showSnackbar({ severity: 'info', id: 'library.settings.reloaded' }));
        refetch();
      }
      return { ok: false, error };
    },
    [dispatch, refetch]
  );

  const raise = useCallback(
    async (kind: LibraryNumberKind, nextNumber: number): Promise<SaveOutcome> => {
      const result = await dispatch(raiseLibraryNumber({ kind, nextNumber }));
      if (raiseLibraryNumber.fulfilled.match(result)) {
        dispatch(
          showSnackbar({
            severity: 'success',
            id:
              kind === 'library_accession'
                ? 'library.settings.number.raisedBook'
                : 'library.settings.number.raisedMember',
            params: { number: nextNumber },
          })
        );
        return { ok: true };
      }
      return { ok: false, error: result.payload ?? null };
    },
    [dispatch]
  );

  return { ...state, canRead, canManage, refetch, save, raise };
};
