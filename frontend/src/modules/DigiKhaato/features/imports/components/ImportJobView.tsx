'use client';

import {
  UbButton,
  UbCard,
  UbEmptyState,
  UbProgress,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { progressPercent } from '../view-model/importDisplay';

import { ImportFailedPanel } from './ImportFailedPanel';
import { ImportReviewStep } from './ImportReviewStep';
import { ImportSummaryPanel } from './ImportSummaryPanel';

import type { UseImportWizardResult } from '../hooks/useImportWizard';
import type { ImportJob } from '../types/import.types';

/**
 * IMP-01 §9 — one screen per canon status. The words never say "job" or
 * "validation" (§8): the merchant's file is being checked, has problems, is
 * being imported.
 */
export function ImportJobView({
  wizard,
  job,
}: Readonly<{ wizard: UseImportWizardResult; job: ImportJob }>): React.JSX.Element {
  const { t } = useTranslation();

  switch (job.status) {
    case 'uploaded':
    case 'validating':
    case 'importing': {
      const percent = job.status === 'importing' ? null : progressPercent(job.progress);
      const label =
        job.status === 'uploaded'
          ? t('imports.checking.queued')
          : job.status === 'validating'
            ? job.progress
              ? t('imports.checking.rows', { done: job.progress.done })
              : t('imports.checking.title')
            : t('imports.importing.title', { count: job.validRows });
      return (
        <UbCard>
          <UbStack gap={3}>
            {/* §5 — status changes are announced, politely. */}
            <UbText as="p" variant="body-medium" aria-live="polite">
              {label}
            </UbText>
            {percent === null ? (
              <UbSkeleton variant="text" label={label} />
            ) : (
              <UbProgress percent={percent} tone="accent" ariaLabel={label} />
            )}
            <UbText as="p" variant="body-sm" tone="tertiary">
              {job.status === 'importing'
                ? t('imports.importing.leave')
                : t('imports.checking.leave')}
            </UbText>
            {job.status !== 'importing' && (
              <UbStack direction="row" gap={2}>
                <UbButton
                  variant="secondary"
                  size="sm"
                  busy={wizard.cancelling}
                  onClick={wizard.cancel}
                >
                  {t('imports.cancel.action')}
                </UbButton>
              </UbStack>
            )}
          </UbStack>
        </UbCard>
      );
    }
    case 'ready':
      return <ImportReviewStep wizard={wizard} job={job} />;
    case 'completed':
      return <ImportSummaryPanel wizard={wizard} job={job} />;
    case 'failed':
      return <ImportFailedPanel wizard={wizard} job={job} />;
    case 'cancelled':
    default:
      return (
        <UbEmptyState
          variant="filtered"
          title={t('imports.cancelled.title')}
          description={t('imports.cancelled.body')}
          action={<UbButton onClick={wizard.uploadAnother}>{t('imports.again')}</UbButton>}
        />
      );
  }
}
