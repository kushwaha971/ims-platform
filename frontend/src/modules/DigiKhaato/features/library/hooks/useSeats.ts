'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';

import { selectLibrarySeats, type LibrarySeatsState } from '../redux/librarySeatsSlice';
import {
  fetchLibrarySeatMap,
  fetchLibrarySeats,
  fetchLibraryShifts,
} from '../redux/librarySeatThunk';

import type { LibraryShift } from '../types/seat.types';

export interface UseSeatsResult extends LibrarySeatsState {
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly activeShifts: readonly LibraryShift[];
  readonly refetchLists: () => void;
  readonly refetchMap: () => void;
}

/**
 * W03 — the shifts and seats, loaded once per visit, and the seat map for
 * `shiftId` when one is asked for (`undefined` = no map; `''` = the whole day).
 * Admission, the seat map and settings all read through here.
 */
export const useSeats = (shiftId?: string): UseSeatsResult => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLibrarySeats);
  const { can, hasModule } = usePermissions();
  const on = hasModule('library');
  const canRead = on && can('library.member.read');
  const canManage = on && can('library.settings.manage');

  const refetchLists = useCallback(() => {
    void dispatch(fetchLibraryShifts());
    void dispatch(fetchLibrarySeats());
  }, [dispatch]);

  useEffect(() => {
    if (!canRead) return;
    if (state.listsStatus === 'idle' || (state.stale && state.staleUrgency === 'now'))
      refetchLists();
  }, [canRead, refetchLists, state.listsStatus, state.stale, state.staleUrgency]);

  const refetchMap = useCallback(() => {
    if (shiftId === undefined) return;
    void dispatch(fetchLibrarySeatMap(shiftId));
  }, [dispatch, shiftId]);

  useEffect(() => {
    if (!canRead || shiftId === undefined) return undefined;
    const promise = dispatch(fetchLibrarySeatMap(shiftId));
    return () => promise.abort();
  }, [canRead, dispatch, shiftId]);

  // A write elsewhere (a seat freed, a student admitted) stales the map too;
  // the lists refetch above clears the flag, so the map is asked for here once.
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (canRead && staleNow) refetchMap();
  }, [canRead, staleNow, refetchMap]);

  return {
    ...state,
    canRead,
    canManage,
    activeShifts: state.shifts.filter((shift) => shift.isActive),
    refetchLists,
    refetchMap,
  };
};
