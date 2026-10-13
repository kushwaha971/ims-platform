'use client';

import { useEffect, useMemo } from 'react';

import { usePathname } from 'next/navigation';

import { UbButton, UbEmptyState, UbSkeleton, UbStack, UbStepper } from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';

import { rememberHistoryApp } from 'modules/DigiKhaato/features/navigation/historyApp';

import { IMPORT_ACCESS, isImportKind } from '../constants/importAccess';
import { useImportWizard } from '../hooks/useImportWizard';

import { ExportReadyPanel } from './ExportReadyPanel';
import { ImportJobView } from './ImportJobView';
import { ImportKindPicker } from './ImportKindPicker';
import { ImportUploadStep } from './ImportUploadStep';

import type { ImportKind } from '../types/import.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/imports';

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
  const pathname = usePathname();
  const tenantId = useAppSelector(selectActiveTenant)?.id ?? null;
  // The job is authoritative on a deep link. A cached job from another URL
  // must not change this entry's app while its own read is still outstanding.
  const owningKind = jobId
    ? wizard.job?.id === jobId && isImportKind(wizard.job.kind)
      ? wizard.job.kind
      : null
    : kind;
  const owningApp = owningKind ? IMPORT_ACCESS[owningKind].app : null;
  useEffect(() => {
    if (!exportId && (pathname === ROUTES.IMPORTS || pathname?.startsWith(`${ROUTES.IMPORTS}/`))) {
      rememberHistoryApp(pathname, tenantId, owningApp);
    }
  }, [exportId, pathname, tenantId, owningApp]);

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
    if (!wizard.kind)
      return <ImportKindPicker canImport={wizard.canImport} offered={wizard.offered} />;
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
