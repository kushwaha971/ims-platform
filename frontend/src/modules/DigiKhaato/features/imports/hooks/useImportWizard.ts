'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { importJobPath, importKindPath } from 'src/routes';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { newRequestId } from 'src/utils/requestId';

import { IMPORT_KINDS, isImportKind, POLL_STEPS } from '../constants/importKinds';
import {
  importWizardReset,
  selectImportCancelling,
  selectImportCommitting,
  selectImportJob,
  selectImportJobError,
  selectImportJobStatus,
  selectImportUpload,
  type ImportJobState,
} from '../redux/importJobSlice';
import {
  cancelImportJob,
  commitImportJob,
  fetchImportJob,
  uploadImportFile,
} from '../redux/importThunk';
import { isLive, pollDelay, wizardStep } from '../view-model/importDisplay';

import type { ImportKind, ImportJob } from '../types/import.types';

export interface UseImportWizardResult {
  readonly kind: ImportKind | null;
  readonly job: ImportJob | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly upload: ImportJobState['upload'];
  readonly committing: boolean;
  readonly cancelling: boolean;
  readonly step: 1 | 2 | 3;
  /** Whether the member may import this kind at all (§19.7.5 — drawn or not). */
  readonly canImport: (kind: ImportKind) => boolean;
  readonly start: (file: File) => void;
  readonly commit: () => void;
  readonly cancel: () => void;
  /** Alternate A — the old job is cancelled and the upload step reopens. */
  readonly uploadAnother: () => void;
  readonly reload: () => void;
}

/**
 * Part 19 §19.4 — everything the wizard does, so the components only render.
 *
 * The URL is the wizard's state (PTY-05's lesson): `/imports?kind=parties` is
 * the upload step with the kind chosen, and `/imports/{id}` is one job. After
 * an upload the address moves to the job, so a reload, a Back and the
 * notification's deep link all land on the same screen.
 */
export const useImportWizard = ({
  kind: rawKind,
  jobId,
}: {
  readonly kind: string | null;
  readonly jobId: string | null;
}): UseImportWizardResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { canAll, hasModule } = usePermissions();

  const job = useAppSelector(selectImportJob);
  const status = useAppSelector(selectImportJobStatus);
  const error = useAppSelector(selectImportJobError);
  const upload = useAppSelector(selectImportUpload);
  const committing = useAppSelector(selectImportCommitting);
  const cancelling = useAppSelector(selectImportCancelling);

  const kind = isImportKind(rawKind) ? rawKind : job && isImportKind(job.kind) ? job.kind : null;

  const canImport = useCallback(
    (candidate: ImportKind) => {
      const config = IMPORT_KINDS[candidate];
      return config.modules.every((module) => hasModule(module)) && canAll(config.write);
    },
    [canAll, hasModule]
  );

  /* A job page reads its job; a fresh upload step starts from nothing, so the
     last file's errors never flash under the new one. */
  useEffect(() => {
    if (jobId) {
      void dispatch(fetchImportJob({ id: jobId }));
    } else {
      dispatch(importWizardReset());
    }
  }, [dispatch, jobId]);

  /* FR-8 — poll while the job is moving: 2 s, then 5 s after 30 s, then 15 s
     after two minutes; nothing while the tab is hidden, and one read the
     moment it is shown again. Keyed on the job OBJECT and the request status,
     so each answer (or failure) schedules exactly one next read. */
  const watchingSince = useRef<{ id: string; at: number } | null>(null);
  const live = job !== null && job.id === jobId && isLive(job.status);
  useEffect(() => {
    if (!live || !job) {
      watchingSince.current = null;
      return undefined;
    }
    if (watchingSince.current?.id !== job.id)
      watchingSince.current = { id: job.id, at: Date.now() };
    const elapsed = Date.now() - watchingSince.current.at;
    const timer = window.setTimeout(
      () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        void dispatch(fetchImportJob({ id: job.id, quiet: true }));
      },
      pollDelay(elapsed, POLL_STEPS)
    );
    const onVisible = () => {
      if (!document.hidden) void dispatch(fetchImportJob({ id: job.id, quiet: true }));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dispatch, live, job, status]);

  /* §17 — the merchant still on the wizard hears it here; the notification is
     for the one who left. Announced once per transition, not on every poll. */
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    const previous = lastStatus.current;
    lastStatus.current = `${job.id}:${job.status}`;
    if (previous !== `${job.id}:importing`) return;
    if (job.status === 'completed') {
      dispatch(showSnackbar({ severity: 'success', id: 'imports.done.snackbar' }));
    } else if (job.status === 'failed') {
      dispatch(showSnackbar({ severity: 'error', id: 'imports.failed.snackbar' }));
    }
  }, [dispatch, job]);

  const start = useCallback(
    (file: File) => {
      if (!kind) return;
      void dispatch(uploadImportFile({ kind, file }))
        .unwrap()
        .then((created) => router.replace(importJobPath(created.id)))
        .catch(() => undefined); // the error is on `upload.error` and in the snackbar
    },
    [dispatch, kind, router]
  );

  /* One key per PRESS, minted here: a retried request after a dropped
     response replays the first answer instead of queueing a second commit. */
  const commit = useCallback(() => {
    if (!job) return;
    void dispatch(commitImportJob({ id: job.id, idempotencyKey: newRequestId() }));
  }, [dispatch, job]);

  const cancel = useCallback(() => {
    if (!job) return;
    void dispatch(cancelImportJob(job.id));
  }, [dispatch, job]);

  const uploadAnother = useCallback(() => {
    const target = kind;
    const stillOpen = job && (job.status === 'ready' || job.status === 'uploaded');
    const leave = () => router.push(target ? importKindPath(target) : importKindPath('parties'));
    if (stillOpen && job) {
      void dispatch(cancelImportJob(job.id)).finally(leave);
    } else {
      leave();
    }
  }, [dispatch, job, kind, router]);

  const reload = useCallback(() => {
    if (jobId) void dispatch(fetchImportJob({ id: jobId }));
  }, [dispatch, jobId]);

  return {
    kind,
    job: job && job.id === jobId ? job : null,
    status,
    error,
    upload,
    committing,
    cancelling,
    step: wizardStep(job && job.id === jobId ? job : null, kind),
    canImport,
    start,
    commit,
    cancel,
    uploadAnother,
    reload,
  };
};
