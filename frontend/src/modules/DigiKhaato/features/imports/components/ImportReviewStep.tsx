'use client';

import { useRef, useState } from 'react';

import { CircleAlert, Download, FileCheck2, ListChecks, Rows3, Upload } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbConfirmDialog,
  UbDisclosure,
  UbSectionHeading,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { importErrorsUrl } from '../api/importService';
import { IMPORT_KINDS, isImportKind } from '../constants/importKinds';
import { commitBlockReason } from '../view-model/importDisplay';

import { ImportErrorTable, ImportPreviewTable } from './ImportTables';

import type { UseImportWizardResult } from '../hooks/useImportWizard';
import type { ImportJob } from '../types/import.types';

/**
 * Step 3 (IMP-01 §7, PTY-10 FR-7, INV-09 FR-5) — what will happen, before it
 * happens: four tiles, the file-wide figures a merchant checks against their
 * own book, the first rows as understood, every problem by row and column,
 * and a Commit that carries its count and — when disabled — its reason,
 * beneath it rather than in a tooltip (touch devices have no hover).
 */
export function ImportReviewStep({
  wizard,
  job,
}: Readonly<{ wizard: UseImportWizardResult; job: ImportJob }>): React.JSX.Element {
  const { t, n } = useTranslation();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const kind = isImportKind(job.kind) ? job.kind : null;
  const config = kind ? IMPORT_KINDS[kind] : null;
  const blocked = commitBlockReason(job);
  const warnings = job.warnings;

  const totalsLine = (() => {
    if (kind === 'parties') {
      return t('imports.review.openings', {
        receivable: formatInr(String(job.totals.opening_receivable ?? '0')),
        payable: formatInr(String(job.totals.opening_payable ?? '0')),
      });
    }
    if (kind === 'items') {
      const created = Number(job.totals.categories_created ?? 0);
      return t('imports.review.itemsTotals', {
        categories: created,
        value: formatInr(String(job.totals.stock_value ?? '0')),
      });
    }
    return null;
  })();

  return (
    <UbStack gap={4}>
      <UbStatGrid>
        <UbStatCard
          icon={<Rows3 className="h-4 w-4" aria-hidden />}
          label={t('imports.review.total')}
          value={n(job.totalRows)}
        />
        <UbStatCard
          icon={<FileCheck2 className="h-4 w-4" aria-hidden />}
          label={t('imports.review.ready')}
          value={n(job.validRows)}
          tone={job.errorRows === 0 ? 'success' : 'default'}
        />
        <UbStatCard
          icon={<CircleAlert className="h-4 w-4" aria-hidden />}
          label={t('imports.review.problems')}
          value={n(job.errorRows)}
          tone={job.errorRows > 0 ? 'warning' : 'default'}
        />
        <UbStatCard
          icon={<ListChecks className="h-4 w-4" aria-hidden />}
          label={t('imports.review.warnings')}
          value={n(warnings.length)}
        />
      </UbStatGrid>

      {totalsLine && (
        <UbText as="p" variant="body-medium">
          {totalsLine}
        </UbText>
      )}

      {job.errorRows > 0 && (
        <UbStatusBanner
          tone="warning"
          title={t('imports.errorsFound', { count: job.errorRows })}
          description={t('imports.review.fixHint')}
        />
      )}

      {warnings.length > 0 && (
        <UbDisclosure label={t('imports.review.warningsToggle', { count: warnings.length })}>
          <UbStack gap={2}>
            {warnings.map((warning) => (
              <UbText
                key={`${warning.row}:${warning.column}:${warning.code}:${warning.message}`}
                as="p"
                variant="body-sm"
              >
                {t('imports.review.warningLine', {
                  row: warning.row,
                  column: warning.column || '—',
                  message: warning.message,
                })}
              </UbText>
            ))}
          </UbStack>
        </UbDisclosure>
      )}

      {job.errorRows > 0 && (
        <UbStack gap={2}>
          <UbSectionHeading
            title={t('imports.errors.title')}
            meta={
              job.errorsTruncated
                ? t('imports.errors.truncated', {
                    shown: job.errors.length,
                    total: job.errorsTotal,
                  })
                : n(job.errorsTotal)
            }
          />
          <ImportErrorTable t={t} errors={job.errors} />
        </UbStack>
      )}

      {config && job.previewRows.length > 0 && (
        <UbStack gap={2}>
          <UbSectionHeading
            title={t('imports.preview.title')}
            meta={t('imports.preview.meta', { count: job.previewRows.length })}
          />
          <ImportPreviewTable t={t} rows={job.previewRows} columns={config.previewColumns} />
        </UbStack>
      )}

      <UbText as="p" variant="body-sm" tone="tertiary">
        {t('imports.promise')}
      </UbText>

      {/* The action row: the safe choices first, the commit last and loudest. */}
      <UbStack direction="row" gap={2} wrap align="start">
        <UbButton
          ref={cancelRef}
          variant="secondary"
          onClick={() => setConfirmCancel(true)}
          busy={wizard.cancelling}
        >
          {t('imports.cancel.action')}
        </UbButton>
        {job.hasErrorFile && (
          <UbActionLink
            href={importErrorsUrl(job.id)}
            download
            variant="secondary"
            icon={<Download className="h-4 w-4" aria-hidden />}
          >
            {t('imports.errors.download')}
          </UbActionLink>
        )}
        {job.errorRows > 0 && (
          <UbButton
            variant="secondary"
            icon={<Upload className="h-4 w-4" aria-hidden />}
            onClick={wizard.uploadAnother}
          >
            {t('imports.review.uploadCorrected')}
          </UbButton>
        )}
        <UbStack gap={1}>
          <UbButton
            onClick={wizard.commit}
            disabled={blocked !== null}
            busy={wizard.committing}
            busyLabel={t('imports.commit.starting')}
            aria-describedby={blocked ? 'import-commit-reason' : undefined}
          >
            {t(`imports.commit.${kind ?? 'rows'}`, { count: job.validRows })}
          </UbButton>
          {blocked && (
            <UbText id="import-commit-reason" as="span" variant="caption" tone="warning">
              {t(blocked.id, blocked.values)}
            </UbText>
          )}
        </UbStack>
      </UbStack>

      <UbConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t('imports.cancel.title')}
        description={t('imports.cancel.body')}
        confirmLabel={t('imports.cancel.confirm')}
        cancelLabel={t('imports.cancel.keep')}
        closeLabel={t('common.action.close')}
        destructive
        busy={wizard.cancelling}
        returnFocusRef={cancelRef}
        onConfirm={() => {
          wizard.cancel();
          setConfirmCancel(false);
        }}
      />
    </UbStack>
  );
}
