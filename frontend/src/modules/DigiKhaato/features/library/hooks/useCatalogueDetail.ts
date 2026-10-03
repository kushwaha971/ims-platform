'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { catalogueDrawerOpened } from '../redux/libraryCatalogueFormSlice';
import {
  fetchLibraryCopy,
  fetchLibraryTitle,
  moveLibraryCopy,
  setLibraryTitleArchived,
  withdrawLibraryCopy,
} from '../redux/libraryCatalogueThunk';
import {
  selectLibraryCopyDetail,
  type LibraryCopyDetailState,
} from '../redux/libraryCopyDetailSlice';
import {
  selectLibraryTitleDetail,
  type LibraryTitleDetailState,
} from '../redux/libraryTitleDetailSlice';

import type { WithdrawFormValues } from '../types/catalogue.types';

interface CataloguePermissions {
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly canWithdraw: boolean;
}

export interface TitleDetailResult extends LibraryTitleDetailState, CataloguePermissions {
  readonly refetch: () => void;
  readonly addCopies: () => void;
  readonly edit: () => void;
  readonly setArchived: (archived: boolean) => Promise<boolean>;
}

export interface CopyDetailResult extends LibraryCopyDetailState, CataloguePermissions {
  readonly refetch: () => void;
  readonly withdraw: (values: WithdrawFormValues) => Promise<boolean>;
  readonly move: (to: 'repair' | 'back-to-shelf') => Promise<void>;
}

/**
 * F03 (LIB-02 FR-11) — a catalogue page's data and its acts, so the page only
 * renders. A page refetches when a write elsewhere stales it, and a write that
 * answers with the record (withdraw, repair, archive) is taken as the answer.
 */
const useCataloguePermissions = (): CataloguePermissions => {
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.catalogue.read');
  return {
    canRead,
    canWrite: canRead && can('library.catalogue.write'),
    canWithdraw: canRead && can('library.copy.withdraw'),
  };
};

export const useTitleDetail = (id: string): TitleDetailResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibraryTitleDetail);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const permissions = useCataloguePermissions();
  const { canRead } = permissions;

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryTitle(id));
    return () => promise.abort();
  }, [dispatch, id, canRead]);
  useEffect(() => {
    if (!state.stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchLibraryTitle(id));
    return () => promise.abort();
  }, [dispatch, id, state.stale, isImpaired, canRead]);

  const refetch = useCallback(() => {
    void dispatch(fetchLibraryTitle(id));
  }, [dispatch, id]);
  const title = state.title?.id === id ? state.title : null;
  const addCopies = useCallback(() => {
    if (title)
      dispatch(catalogueDrawerOpened({ kind: 'addCopies', titleId: id, title: title.title }));
  }, [dispatch, id, title]);
  const edit = useCallback(() => {
    dispatch(catalogueDrawerOpened({ kind: 'editTitle', titleId: id }));
  }, [dispatch, id]);
  const setArchived = useCallback(
    async (archived: boolean): Promise<boolean> => {
      const result = await dispatch(setLibraryTitleArchived({ id, archived }));
      if (!setLibraryTitleArchived.fulfilled.match(result)) return false;
      dispatch(
        showSnackbar({
          severity: 'success',
          id: archived ? 'library.title.archivedDone' : 'library.title.restoredDone',
        })
      );
      return true;
    },
    [dispatch, id]
  );

  return { ...state, title, ...permissions, refetch, addCopies, edit, setArchived };
};

export const useCopyDetail = (id: string): CopyDetailResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibraryCopyDetail);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const permissions = useCataloguePermissions();
  const { canRead } = permissions;

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryCopy(id));
    return () => promise.abort();
  }, [dispatch, id, canRead]);
  useEffect(() => {
    if (!state.stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchLibraryCopy(id));
    return () => promise.abort();
  }, [dispatch, id, state.stale, isImpaired, canRead]);

  const refetch = useCallback(() => {
    void dispatch(fetchLibraryCopy(id));
  }, [dispatch, id]);
  const withdraw = useCallback(
    async (values: WithdrawFormValues): Promise<boolean> => {
      const result = await dispatch(withdrawLibraryCopy({ id, values }));
      if (!withdrawLibraryCopy.fulfilled.match(result)) return false;
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'library.copy.withdrawnDone',
          params: { number: result.payload.accessionNumber },
        })
      );
      return true;
    },
    [dispatch, id]
  );
  const move = useCallback(
    async (to: 'repair' | 'back-to-shelf'): Promise<void> => {
      const result = await dispatch(moveLibraryCopy({ id, move: to }));
      if (moveLibraryCopy.fulfilled.match(result)) {
        dispatch(
          showSnackbar({
            severity: 'success',
            id: to === 'repair' ? 'library.copy.repairDone' : 'library.copy.shelvedDone',
            params: { number: result.payload.accessionNumber },
          })
        );
      }
    },
    [dispatch, id]
  );
  const copy = state.copy?.id === id ? state.copy : null;

  return { ...state, copy, ...permissions, refetch, withdraw, move };
};
