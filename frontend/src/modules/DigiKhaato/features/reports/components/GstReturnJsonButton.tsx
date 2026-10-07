'use client';

import { useState } from 'react';

import { FileDown } from 'lucide-react';

import { UbButton } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { downloadGstReturnJson } from '../redux/taxReportsThunk';

import type { GstQuery } from '../types/taxReports.types';

/**
 * Shop item 2 — the file for the GST portal's offline tool, beside Export on the
 * GST summary's header. It names the return of the tab that is open, so the
 * accountant downloads the file for the figures they are looking at.
 *
 * The server decides what can be filed — one whole, ended month, with no
 * document the portal would refuse — and says why in its own words when it
 * cannot; those reach the one snackbar. Hidden (never disabled) without
 * `reports.export` (§19.7.5), like Export.
 */
export function GstReturnJsonButton({
  kind,
  query,
}: Readonly<{ kind: 'gstr1' | 'gstr3b'; query: GstQuery }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const [busy, setBusy] = useState(false);
  if (!can('reports.export')) return null;

  const download = async () => {
    setBusy(true);
    const result = await dispatch(
      downloadGstReturnJson({ kind, dateFrom: query.dateFrom, dateTo: query.dateTo })
    );
    setBusy(false);
    if (downloadGstReturnJson.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'reports.gst.json.saved',
          params: { file: result.payload.filename },
        })
      );
    } else if (result.payload) {
      dispatch(
        showSnackbar({
          severity: 'error',
          message: result.payload.message,
          requestId: result.payload.requestId,
        })
      );
    }
  };

  return (
    <UbButton
      variant="secondary"
      icon={<FileDown className="h-4 w-4" aria-hidden />}
      iconOnly="mobile"
      busy={busy}
      busyLabel={t('reports.gst.json.busy')}
      onClick={() => void download()}
    >
      {t(`reports.gst.json.${kind}`)}
    </UbButton>
  );
}
