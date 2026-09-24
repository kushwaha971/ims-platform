'use client';

import { useEffect } from 'react';

import { Download } from 'lucide-react';

import { UbActionLink, UbButton, UbEmptyState, UbSkeleton } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatTimestamp } from 'src/utils/dates';

import { exportDownloadUrl } from '../api/exportService';
import { fetchExportJob } from '../redux/exportThunk';
import { selectExportJob, selectExportJobStatus } from '../redux/importJobSlice';

/**
 * IMP-02 FR-14 — where the "Your export is ready" notification lands, for the
 * merchant who left the list before the file was built. The link works for
 * seven days, and the page says so (IMP-02 §8); after that it says the file
 * has expired rather than offering a link that answers with an error.
 */
export function ExportReadyPanel({ exportId }: Readonly<{ exportId: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const job = useAppSelector(selectExportJob);
  const status = useAppSelector(selectExportJobStatus);

  useEffect(() => {
    void dispatch(fetchExportJob(exportId));
  }, [dispatch, exportId]);

  if (status === 'failed') {
    return (
      <UbEmptyState
        variant="error"
        title={t('exports.page.missing')}
        action={
          <UbButton variant="secondary" onClick={() => void dispatch(fetchExportJob(exportId))}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  }
  if (!job || job.id !== exportId) return <UbSkeleton variant="card" label={t('common.loading')} />;

  if (job.status === 'ready' && job.downloadPath) {
    return (
      <UbEmptyState
        variant="firstUse"
        title={t('exports.page.ready', { count: job.rowCount ?? 0 })}
        description={t('exports.page.expires', { when: formatTimestamp(job.expiresAt) })}
        action={
          <UbActionLink
            href={exportDownloadUrl(job.id)}
            download
            variant="primary"
            icon={<Download className="h-4 w-4" aria-hidden />}
          >
            {t('exports.page.download')}
          </UbActionLink>
        }
      />
    );
  }
  if (job.status === 'queued' || job.status === 'running') {
    return (
      <UbEmptyState
        variant="firstUse"
        title={t('exports.page.preparing')}
        action={
          <UbButton variant="secondary" onClick={() => void dispatch(fetchExportJob(exportId))}>
            {t('exports.page.check')}
          </UbButton>
        }
      />
    );
  }
  return (
    <UbEmptyState
      variant="filtered"
      title={job.status === 'expired' ? t('exports.page.expired') : t('exports.failed')}
    />
  );
}
