'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import { UbPageHeader, UbPageShell, UbSkeleton } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { isImportKind } from '../constants/importKinds';

/**
 * The wizard is its own chunk: the upload control, two data grids, the
 * stepper and the stat cards are what a merchant downloads when they choose
 * Import — not before (the rule PTY-01's drawer and LED-03's dialogs wrote).
 */
const ImportWizard = dynamic(() => import('./ImportWizard').then((m) => m.ImportWizard), {
  ssr: false,
  loading: () => <UbSkeleton variant="card" />,
});

/**
 * IMP-01 §7 — `/imports` (`?kind=` preselects, `?export=` shows a stored
 * export) and `/imports/{id}` (one job, the notification's deep link).
 */
export function ImportPageContent({
  jobId = null,
}: Readonly<{ jobId?: string | null }>): React.JSX.Element {
  const { t } = useTranslation();
  const params = useSearchParams();
  const rawKind = params.get('kind');
  const exportId = params.get('export');
  const kind = isImportKind(rawKind) ? rawKind : null;

  const title = exportId
    ? t('exports.page.title')
    : kind
      ? t(`imports.title.${kind}`)
      : t('imports.title');

  return (
    <UbPageShell header={<UbPageHeader title={title} subtitle={t('imports.subtitle')} />}>
      <ImportWizard kind={kind} jobId={jobId} exportId={exportId} />
    </UbPageShell>
  );
}
