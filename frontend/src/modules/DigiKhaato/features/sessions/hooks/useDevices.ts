'use client';

import { useCallback, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { endSessionLocally } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  logoutAllCancelled,
  logoutAllRequested,
  renameClosed,
  renameOpened,
  revokeCancelled,
  revokeRequested,
  selectDevices,
  selectDevicesError,
  selectDevicesStatus,
  selectLogoutAllOpen,
  selectLogoutAllStatus,
  selectRenameStatus,
  selectRenameTargetId,
  selectRevokeStatus,
  selectRevokeTargetId,
} from '../redux/sessionsSlice';
import { fetchDevices, logoutEverywhere, renameDevice, revokeDevice } from '../redux/sessionsThunk';

import type { DeviceSession } from '../types/session.types';

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for the devices screen.
 *
 * All three writes are class C, online-only (§19.10.4): a revocation queued
 * offline and sent an hour later would log out a device the person has since
 * decided to keep.
 */
export interface UseDevicesResult {
  readonly items: readonly DeviceSession[];
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly canWrite: boolean;
  readonly refetch: () => void;

  readonly renameTarget: DeviceSession | null;
  readonly isRenaming: boolean;
  readonly openRename: (id: string) => void;
  readonly closeRename: () => void;
  readonly submitRename: (label: string) => Promise<void>;

  readonly revokeTarget: DeviceSession | null;
  readonly isRevoking: boolean;
  readonly requestRevoke: (id: string) => void;
  readonly cancelRevoke: () => void;
  readonly confirmRevoke: () => Promise<void>;

  readonly logoutAllOpen: boolean;
  readonly isLoggingOutAll: boolean;
  readonly requestLogoutAll: () => void;
  readonly cancelLogoutAll: () => void;
  readonly confirmLogoutAll: () => Promise<void>;
}

export function useDevices(): UseDevicesResult {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const items = useAppSelector(selectDevices);
  const status = useAppSelector(selectDevicesStatus);
  const error = useAppSelector(selectDevicesError);
  const renameTargetId = useAppSelector(selectRenameTargetId);
  const renameStatus = useAppSelector(selectRenameStatus);
  const revokeTargetId = useAppSelector(selectRevokeTargetId);
  const revokeStatus = useAppSelector(selectRevokeStatus);
  const logoutAllOpen = useAppSelector(selectLogoutAllOpen);
  const logoutAllStatus = useAppSelector(selectLogoutAllStatus);
  const { canWrite } = useDegradedNetwork();

  useEffect(() => {
    const promise = dispatch(fetchDevices());
    return () => promise.abort();
  }, [dispatch]);

  const refetch = useCallback(() => {
    void dispatch(fetchDevices());
  }, [dispatch]);

  const openRename = useCallback((id: string) => dispatch(renameOpened(id)), [dispatch]);
  const closeRename = useCallback(() => dispatch(renameClosed()), [dispatch]);
  const submitRename = useCallback(
    async (label: string) => {
      if (!renameTargetId) return;
      try {
        await dispatch(renameDevice({ id: renameTargetId, label })).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: 'sessions.rename.saved' }));
      } catch {
        // Surfaced through the global snackbar; the dialog stays open to retry.
      }
    },
    [dispatch, renameTargetId]
  );

  const requestRevoke = useCallback((id: string) => dispatch(revokeRequested(id)), [dispatch]);
  const cancelRevoke = useCallback(() => dispatch(revokeCancelled()), [dispatch]);
  const confirmRevoke = useCallback(async () => {
    if (!revokeTargetId) return;
    try {
      await dispatch(revokeDevice(revokeTargetId)).unwrap();
      dispatch(showSnackbar({ severity: 'success', id: 'sessions.logout.done' }));
    } catch {
      // 409 `current_session` and friends reach the global snackbar.
    }
  }, [dispatch, revokeTargetId]);

  const requestLogoutAll = useCallback(() => dispatch(logoutAllRequested()), [dispatch]);
  const cancelLogoutAll = useCallback(() => dispatch(logoutAllCancelled()), [dispatch]);
  const confirmLogoutAll = useCallback(async () => {
    try {
      await dispatch(logoutEverywhere()).unwrap();
    } catch {
      return;
    }
    // AC-3: this device is logged out too. The same teardown a server-decided
    // expiry runs, so no feature page is left holding this user's data.
    endSessionLocally(dispatch);
    router.replace(ROUTES.LOGIN);
  }, [dispatch, router]);

  return {
    items,
    status,
    error,
    canWrite: canWrite('online-only'),
    refetch,
    renameTarget: items.find((item) => item.id === renameTargetId) ?? null,
    isRenaming: renameStatus === 'loading',
    openRename,
    closeRename,
    submitRename,
    revokeTarget: items.find((item) => item.id === revokeTargetId) ?? null,
    isRevoking: revokeStatus === 'loading',
    requestRevoke,
    cancelRevoke,
    confirmRevoke,
    logoutAllOpen,
    isLoggingOutAll: logoutAllStatus === 'loading',
    requestLogoutAll,
    cancelLogoutAll,
    confirmLogoutAll,
  };
}
