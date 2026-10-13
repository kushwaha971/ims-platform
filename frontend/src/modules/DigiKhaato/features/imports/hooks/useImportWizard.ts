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

import type { ImportCommitOptions, ImportKind, ImportJob } from '../types/import.types';

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
  /** QA F10 — whether the business uses the app this kind belongs to at all. A shop
   * is not offered "Students" with "Ask the owner" under it: no owner can say yes. */
  readonly offered: (kind: ImportKind) => boolean;
  readonly start: (file: File) => void;
  /** QA B33/B28 — all-or-nothing by default; or skip the problem rows / duplicates. */
  readonly commit: (options?: ImportCommitOptions) => void;
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

  const offered = useCallback(
    (candidate: ImportKind) => IMPORT_KINDS[candidate].modules.every((module) => hasModule(module)),
    [hasModule]
  );

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
     after two minutes; no request while the tab is hidden, and one read the
     moment it is shown again.

     QA B31 — the page stayed on "Importing 7 rows…" after the job had finished,
     until a reload. The poll used to schedule its next read from the PREVIOUS
     answer's render, so any read that changed nothing it watched (a hidden tab,
     an identical answer) left no timer behind and the page went quiet. Now one
     chain of timers lives for as long as the job is live, whatever each answer
     brings; it ends when the job reaches a final status or the page leaves. */
  const live = job !== null && job.id === jobId && isLive(job.status);
  const liveId = live ? job.id : null;
  useEffect(() => {
    if (!liveId) return undefined;
    const startedAt = Date.now();
    let timer: number | undefined;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      if (typeof document === 'undefined' || !document.hidden) {
        void dispatch(fetchImportJob({ id: liveId, quiet: true }));
      }
      timer = window.setTimeout(tick, pollDelay(Date.now() - startedAt, POLL_STEPS));
    };
    timer = window.setTimeout(tick, pollDelay(0, POLL_STEPS));
    const onVisible = () => {
      if (!document.hidden) void dispatch(fetchImportJob({ id: liveId, quiet: true }));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dispatch, liveId]);

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
  const commit = useCallback(
    (options?: ImportCommitOptions) => {
      if (!job) return;
      void dispatch(commitImportJob({ id: job.id, idempotencyKey: newRequestId(), options }));
    },
    [dispatch, job]
  );

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
    offered,
    start,
    commit,
    cancel,
    uploadAnother,
    reload,
  };
};
