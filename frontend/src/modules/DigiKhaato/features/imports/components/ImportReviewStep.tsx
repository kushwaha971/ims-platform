'use client';

import { useRef, useState } from 'react';

import { CircleAlert, Download, FileCheck2, ListChecks, Rows3, Upload } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbChoiceChips,
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

import { ImportRowsReview } from './ImportRowsReview';
import { ImportErrorTable } from './ImportTables';

import type { UseImportWizardResult } from '../hooks/useImportWizard';
import type { ImportCommitOptions, ImportJob } from '../types/import.types';

/**
 * Step 3 (IMP-01 §7, PTY-10 FR-7, INV-09 FR-5) — what will happen, before it
 * happens: four tiles, the file-wide figures a merchant checks against their
 * own book, every row as understood (paged, QA B34), every problem by row and
 * column, and a Commit that carries its count and — when disabled — its reason,
 * beneath it rather than in a tooltip (touch devices have no hover).
 *
 * The 12 Oct QA: the totals count only rows that will import, with the money in
 * problem rows said apart (B27); problem rows no longer block the good ones —
 * the button imports the good rows and skips the rest, which stay in the error
 * file (B33); rows the book already has are a choice (B28); and the party button
 * names customers, suppliers and both (B44).
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
  // QA B28 — what to do with rows the book already has; skipping is the safe default.
  const [duplicates, setDuplicates] = useState<ImportCommitOptions['duplicates']>('skip');
  // QA B33 — with problem rows, the button imports the good ones and skips the rest.
  // Not when NOTHING would import: "Import the 0 good rows now and skip these" was
  // said live over a file whose every row had a problem (QA F10 look).
  const skipErrors = job.errorRows > 0 && job.validRows > 0;

  const problemsLine = (() => {
    const owed = Number(job.totalsProblems.opening_receivable ?? 0);
    const owing = Number(job.totalsProblems.opening_payable ?? 0);
    const stock = Number(job.totalsProblems.stock_value ?? 0);
    // QA F10 — a refused loan's money is not "lent" in the totals either.
    const lent = Number(job.totalsProblems.lent ?? 0);
    const held =
      Number(job.totalsProblems.deposits ?? 0) + Number(job.totalsProblems.old_dues ?? 0);
    const amount = owed + owing + stock + lent + held;
    return amount > 0
      ? t('imports.review.problemMoney', { amount: formatInr(amount.toFixed(2)) })
      : null;
  })();

  const commitLabel = (() => {
    if (skipErrors) {
      return t('imports.commit.skipBad', { good: job.validRows, bad: job.errorRows });
    }
    if (kind === 'parties') {
      // QA B44 — "Import 11 customers" when some were suppliers.
      const parts = (['customers', 'suppliers', 'both'] as const)
        .map((key) => ({ key, count: Number(job.totals[key] ?? 0) }))
        .filter((part) => part.count > 0)
        .map((part) => t(`imports.commit.kinds.${part.key}`, { count: part.count }));
      return parts.length
        ? t('imports.commit.partiesByKind', { count: job.validRows, kinds: parts.join(', ') })
        : t('imports.commit.parties', { count: job.validRows });
    }
    return t(`imports.commit.${kind ?? 'rows'}`, { count: job.validRows });
  })();

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
    if (kind === 'students') {
      return t('imports.review.studentsTotals', {
        deposits: formatInr(String(job.totals.deposits_held ?? '0')),
        dues: formatInr(String(job.totals.old_dues ?? '0')),
      });
    }
    if (kind === 'loans') {
      return t('imports.review.loansTotals', {
        lent: formatInr(String(job.totals.lent ?? '0')),
        collected: formatInr(String(job.totals.collected ?? '0')),
        remaining: formatInr(String(job.totals.remaining ?? '0')),
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
      {problemsLine && (
        <UbText as="p" variant="body-sm" tone="secondary" data-testid="import-problem-money">
          {problemsLine}
        </UbText>
      )}

      {job.errorRows > 0 && (
        <UbStatusBanner
          tone="warning"
          title={t('imports.errorsFound', { count: job.errorRows })}
          description={
            skipErrors
              ? t('imports.review.skipHint', { good: job.validRows })
              : t('imports.review.fixHint')
          }
        />
      )}

      {job.duplicates > 0 && (
        <UbStack gap={1} data-testid="import-duplicates">
          <UbText variant="body-sm-medium">
            {t('imports.review.duplicates', { count: job.duplicates })}
          </UbText>
          <UbChoiceChips<ImportCommitOptions['duplicates']>
            ariaLabel={t('imports.review.duplicates', { count: job.duplicates })}
            value={duplicates}
            onChange={setDuplicates}
            options={[
              { value: 'skip', label: t('imports.review.duplicates.skip') },
              { value: 'create', label: t('imports.review.duplicates.create') },
            ]}
          />
        </UbStack>
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

      {config && job.totalRows > 0 && (
        <ImportRowsReview
          t={t}
          jobId={job.id}
          total={job.totalRows}
          columns={config.previewColumns}
        />
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
            onClick={() => wizard.commit({ skipErrors, duplicates })}
            disabled={blocked !== null}
            busy={wizard.committing}
            busyLabel={t('imports.commit.starting')}
            aria-describedby={blocked ? 'import-commit-reason' : undefined}
            data-testid="import-commit"
          >
            {commitLabel}
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
