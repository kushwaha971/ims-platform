'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppDispatch } from 'src/hooks/useAppStore';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { AppDispatch } from 'src/redux/store';

import { exportListCsv, fetchExportJob } from '../redux/exportThunk';
import { EXPORT_POLL_GIVE_UP_MS, EXPORT_POLL_STEPS, pollDelay } from '../view-model/pollDelay';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * FR-14 — wait for a queued export, then hand it to the browser.
 *
 * It lives outside the component on purpose: a merchant who presses Export and
 * then opens a khata has unmounted the button, and the file should still
 * arrive. Past ten minutes the in-app notification (IMP-02 §17) takes over.
 */
const waitForExport = async (
  dispatch: AppDispatch,
  exportId: string,
  downloadUrl: (id: string) => Promise<string>
): Promise<void> => {
  const { saveFile } = await import('../api/fileDownload');
  const started = Date.now();
  while (Date.now() - started < EXPORT_POLL_GIVE_UP_MS) {
    await sleep(pollDelay(Date.now() - started, EXPORT_POLL_STEPS));
    const result = await dispatch(fetchExportJob(exportId));
    if (!fetchExportJob.fulfilled.match(result)) continue;
    if (result.payload.status === 'ready') {
      saveFile(await downloadUrl(exportId));
      dispatch(showSnackbar({ severity: 'success', id: 'exports.ready' }));
      return;
    }
    if (result.payload.status === 'failed' || result.payload.status === 'expired') {
      dispatch(showSnackbar({ severity: 'error', id: 'exports.failed' }));
      return;
    }
  }
};

export interface UseListExportResult {
  readonly exporting: boolean;
  readonly start: () => void;
}

/**
 * IMP-02 — the Export button's behaviour for any list: fetch `?format=csv`
 * with the list's own filters, save the file, or — for more than 5,000 rows —
 * say it is being prepared and deliver it when it is ready.
 */
export const useListExport = (listPath: string): UseListExportResult => {
  const dispatch = useAppDispatch();
  const [exporting, setExporting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(() => {
    setExporting(true);
    void dispatch(exportListCsv({ listPath }))
      .then((action) => {
        if (exportListCsv.rejected.match(action)) {
          const error = action.payload;
          dispatch(
            showSnackbar(
              error
                ? { severity: 'error', message: error.message, requestId: error.requestId }
                : { severity: 'error', id: 'exports.error' }
            )
          );
          return;
        }
        const result = action.payload;
        if (result.kind === 'saved') return; // the thunk has handed it to the browser
        dispatch(
          showSnackbar({
            severity: 'info',
            id: 'exports.queued',
            params: { count: result.rowCount },
          })
        );
        const url = async (id: string) =>
          (await import('../api/exportService')).exportDownloadUrl(id);
        void waitForExport(dispatch, result.exportId, url);
      })
      .finally(() => {
        if (mounted.current) setExporting(false);
      });
  }, [dispatch, listPath]);

  return { exporting, start };
};
