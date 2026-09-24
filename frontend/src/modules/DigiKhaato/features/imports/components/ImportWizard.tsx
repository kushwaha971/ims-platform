'use client';

import { useMemo } from 'react';

import { UbButton, UbEmptyState, UbSkeleton, UbStack, UbStepper } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useImportWizard } from '../hooks/useImportWizard';

import { ExportReadyPanel } from './ExportReadyPanel';
import { ImportJobView } from './ImportJobView';
import { ImportKindPicker } from './ImportKindPicker';
import { ImportUploadStep } from './ImportUploadStep';

import type { ImportKind } from '../types/import.types';

/**
 * IMP-01 §7 — three linear steps: choose what to import, upload, review and
 * import. The stepper is a map of where the merchant is, never a way to skip
 * ahead: the steps are driven by the address and the job, not by clicks.
 */
export function ImportWizard({
  kind,
  jobId,
  exportId,
}: Readonly<{
  kind: ImportKind | null;
  jobId: string | null;
  exportId: string | null;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const wizard = useImportWizard({ kind, jobId });

  const steps = useMemo(
    () => [
      { key: 'choose', label: t('imports.step.choose') },
      { key: 'upload', label: t('imports.step.upload') },
      { key: 'review', label: t('imports.step.review') },
    ],
    [t]
  );

  if (exportId) return <ExportReadyPanel exportId={exportId} />;

  const body = (() => {
    if (jobId) {
      if (wizard.job) return <ImportJobView wizard={wizard} job={wizard.job} />;
      if (wizard.status === 'failed') {
        return (
          <UbEmptyState
            variant="error"
            title={t('imports.error.load')}
            description={wizard.error?.message}
            requestId={wizard.error?.requestId ?? null}
            requestIdLabel={t('common.error.reference')}
            action={
              <UbButton variant="secondary" onClick={wizard.reload}>
                {t('common.action.retry')}
              </UbButton>
            }
          />
        );
      }
      return <UbSkeleton variant="card" label={t('imports.loading')} />;
    }
    if (!wizard.kind) return <ImportKindPicker canImport={wizard.canImport} />;
    return <ImportUploadStep kind={wizard.kind} wizard={wizard} />;
  })();

  return (
    <UbStack gap={4}>
      <UbStepper
        steps={steps}
        current={wizard.step}
        completed={wizard.step - 1}
        progressLabel={t('imports.step.progress', { current: wizard.step, total: steps.length })}
        show="bar"
      />
      {body}
    </UbStack>
  );
}
