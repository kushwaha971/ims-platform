'use client';

import { UbButton, UbEmptyState, UbStack } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import type { UseImportWizardResult } from '../hooks/useImportWizard';
import type { ImportJob } from '../types/import.types';

/**
 * IMP-01 §9 `failed` — the reason in the server's words, the reference in
 * `ds-mono`, and the one move that fixes it. A commit that rolled back may be
 * committed again (AC-4: "nothing was saved"); a file that could not be read
 * is uploaded again. Neither is a dead end.
 */
export function ImportFailedPanel({
  wizard,
  job,
}: Readonly<{ wizard: UseImportWizardResult; job: ImportJob }>): React.JSX.Element {
  const { t } = useTranslation();
  const failure = job.failure;
  const title =
    failure?.code === 'missing_columns'
      ? t('imports.failed.wrongFile')
      : failure?.at === 'commit'
        ? t('imports.failed.commit')
        : t('imports.failed.title');
  return (
    <UbEmptyState
      variant="error"
      title={title}
      description={failure?.message ?? t('imports.failed.body')}
      requestId={failure?.requestId ?? null}
      requestIdLabel={t('common.error.reference')}
      action={
        <UbStack direction="row" gap={2} wrap justify="center">
          {job.canCommit && (
            <UbButton onClick={wizard.commit} busy={wizard.committing}>
              {t('imports.failed.retry')}
            </UbButton>
          )}
          <UbButton
            variant={job.canCommit ? 'secondary' : 'primary'}
            onClick={wizard.uploadAnother}
          >
            {t('imports.failed.uploadAgain')}
          </UbButton>
        </UbStack>
      }
    />
  );
}
