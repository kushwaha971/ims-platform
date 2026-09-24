'use client';

import { CheckCircle2 } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBanner,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { summaryValue } from '../view-model/importDisplay';

import type { UseImportWizardResult } from '../hooks/useImportWizard';
import type { ImportJob } from '../types/import.types';

/** Where "Go to …" leads for each kind — the list IS the list of what was created. */
const RECORDS_ROUTE: Readonly<Record<string, string>> = {
  parties: ROUTES.PARTIES,
  items: ROUTES.ITEMS,
};

/**
 * IMP-01 §9 `completed` — the spec's summary fields as tiles (FR-9), a way to
 * the records and a way to import another file. The created rows are not
 * listed one by one: at 400 parties the list screen is the list (PTY-10 FR-11).
 */
export function ImportSummaryPanel({
  wizard,
  job,
}: Readonly<{ wizard: UseImportWizardResult; job: ImportJob }>): React.JSX.Element {
  const { t } = useTranslation();
  const summary = job.summary ?? {};
  const route = RECORDS_ROUTE[job.kind];
  return (
    <UbStack gap={4}>
      <UbStatusBanner
        tone="success"
        title={t(`imports.done.title.${job.kind === 'items' ? 'items' : 'parties'}`, {
          count: Number(summary.created_parties ?? summary.created_items ?? 0),
        })}
        description={t('imports.done.body')}
      />
      <UbStatGrid>
        {job.summaryFields.map((field) => (
          <UbStatCard
            key={field}
            icon={
              field.startsWith('created') ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              ) : undefined
            }
            label={t(`imports.summary.${field}`)}
            value={summaryValue(field, summary[field])}
          />
        ))}
      </UbStatGrid>
      <UbStack direction="row" gap={2} wrap>
        {route && (
          <UbActionLink href={route} variant="primary">
            {t(`imports.done.goTo.${job.kind === 'items' ? 'items' : 'parties'}`)}
          </UbActionLink>
        )}
        <UbButton variant="secondary" onClick={wizard.uploadAnother}>
          {t('imports.again')}
        </UbButton>
      </UbStack>
    </UbStack>
  );
}
