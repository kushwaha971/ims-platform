'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchSession } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';

import { selectAccountData } from '../redux/accountDataSlice';
import {
  cancelDeletion,
  decideSupportAccess,
  fetchAccountData,
  pollExport,
  refreshDeletion,
  requestDeletion,
  requestExport,
} from '../redux/accountDataThunk';
import { isInFlight } from '../view-model/accountDataDisplay';

import type {
  DeleteRequestInput,
  DeletionState,
  SupportAccess,
  SupportDecision,
  TenantExport,
} from '../types/accountData.types';

/** FR-2 — how often an in-flight export is re-read. */
export const EXPORT_POLL_MS = 3000;

/**
 * Part 19 §19.1.1 layer 4 — the only door into Redux for "Your data".
 *
 * Every write is class C, online-only (§19.10.4): a deletion request or a
 * consent queued offline and replayed later is a decision made for a person
 * who is no longer looking at the screen.
 */
export interface UseAccountDataResult {
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly deletion: DeletionState | null;
  readonly exports: readonly TenantExport[];
  readonly support: readonly SupportAccess[];
  readonly canWrite: boolean;
  readonly isExporting: boolean;
  readonly isDeleting: boolean;
  readonly isCancelling: boolean;
  readonly decidingId: string | null;
  readonly refetch: () => void;
  readonly startExport: () => Promise<void>;
  /** Resolves `null` on success, or the refusal so the form can anchor field errors. */
  readonly submitDeletion: (input: DeleteRequestInput) => Promise<ApiErrorShape | null>;
  readonly cancel: () => Promise<void>;
  readonly decide: (id: string, decision: SupportDecision) => Promise<void>;
}

export function useAccountData(): UseAccountDataResult {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectAccountData);
  const { canWrite } = useDegradedNetwork();
  const inFlightIds = state.exports.filter(isInFlight).map((row) => row.id);
  const pollKey = inFlightIds.join(',');
  const wasPolling = useRef(false);

  useEffect(() => {
    const promise = dispatch(fetchAccountData());
    return () => promise.abort();
  }, [dispatch]);

  // FR-2 — poll only what is still being built, and re-read the gate the
  // moment the last one lands, so "Continue" unlocks without a reload.
  useEffect(() => {
    if (!pollKey) {
      if (wasPolling.current) {
        wasPolling.current = false;
        void dispatch(refreshDeletion());
      }
      return undefined;
    }
    wasPolling.current = true;
    const timer = window.setTimeout(() => {
      pollKey.split(',').forEach((id) => void dispatch(pollExport(id)));
    }, EXPORT_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, pollKey, state.exports]);

  const refetch = useCallback(() => {
    void dispatch(fetchAccountData());
  }, [dispatch]);

  const startExport = useCallback(async () => {
    try {
      await dispatch(requestExport()).unwrap();
      dispatch(showSnackbar({ severity: 'info', id: 'data.export.started' }));
    } catch {
      // 429 and friends reach the global snackbar.
    }
  }, [dispatch]);

  const submitDeletion = useCallback(
    async (input: DeleteRequestInput) => {
      try {
        await dispatch(requestDeletion(input)).unwrap();
      } catch (error) {
        // Field errors land on the form; everything else is already toasted.
        return error as ApiErrorShape;
      }
      dispatch(showSnackbar({ severity: 'warning', id: 'data.delete.requested' }));
      // The shell's banner reads the session's tenant status.
      void dispatch(fetchSession());
      return null;
    },
    [dispatch]
  );

  const cancel = useCallback(async () => {
    try {
      await dispatch(cancelDeletion()).unwrap();
    } catch {
      return;
    }
    dispatch(showSnackbar({ severity: 'success', id: 'data.cancel.done' }));
    void dispatch(fetchSession());
  }, [dispatch]);

  const decide = useCallback(
    async (id: string, decision: SupportDecision) => {
      try {
        await dispatch(decideSupportAccess({ id, decision })).unwrap();
        dispatch(showSnackbar({ severity: 'success', id: `data.support.${decision}.done` }));
      } catch (error) {
        // 412 "no longer waiting" is presented locally (`precondition_failed`
        // is not toasted globally): say so, and show the request as it now is.
        if ((error as ApiErrorShape | undefined)?.code === 'precondition_failed') {
          dispatch(showSnackbar({ severity: 'warning', id: 'data.support.stale' }));
        }
        void dispatch(fetchAccountData());
      }
    },
    [dispatch]
  );

  return {
    status: state.status,
    error: state.error,
    deletion: state.deletion,
    exports: state.exports,
    support: state.support,
    canWrite: canWrite('online-only'),
    isExporting: state.exportStatus === 'loading' || inFlightIds.length > 0,
    isDeleting: state.deleteStatus === 'loading',
    isCancelling: state.cancelStatus === 'loading',
    decidingId: state.decidingId,
    refetch,
    startExport,
    submitDeletion,
    cancel,
    decide,
  };
}
