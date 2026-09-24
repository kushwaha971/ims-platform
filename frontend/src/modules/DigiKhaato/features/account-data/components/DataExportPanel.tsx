'use client';

import { Download, FileArchive } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbPanel,
  UbPanelSection,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatTimestamp } from 'src/utils/dates';

import { exportBadge, formatBytes, totalRows } from '../view-model/accountDataDisplay';

import type { UseAccountDataResult } from '../hooks/useAccountData';
import type { TenantExport } from '../types/accountData.types';

function ExportRow({ row }: Readonly<{ row: TenantExport }>): React.JSX.Element {
  const { t } = useTranslation();
  const badge = exportBadge(row.status);
  const caption =
    row.status === 'succeeded'
      ? t('data.export.row.ready', {
          rows: totalRows(row.rowCounts),
          size: formatBytes(row.sizeBytes),
          expires: formatTimestamp(row.expiresAt),
        })
      : t('data.export.row.started', { when: formatTimestamp(row.requestedAt) });
  return (
    <UbStack
      as="li"
      direction="row"
      align="center"
      gap={3}
      className="border-b border-border-subtle py-3 last:border-0"
    >
      <FileArchive aria-hidden className="h-5 w-5 shrink-0 text-text-secondary" />
      <UbStack gap={0.5} className="min-w-0 flex-1">
        <UbText as="span" variant="body-medium">
          {formatTimestamp(row.requestedAt)}
        </UbText>
        <UbText as="span" variant="caption" tone="tertiary">
          {caption}
        </UbText>
        <UbStatusBadge label={t(badge.labelId)} tone={badge.tone} className="self-start" />
      </UbStack>
      {row.downloadUrl ? (
        <UbActionLink
          href={row.downloadUrl}
          variant="outlineNeutral"
          size="sm"
          iconOnly="mobile"
          icon={<Download aria-hidden className="h-4 w-4" />}
        >
          {t('data.export.download')}
        </UbActionLink>
      ) : null}
    </UbStack>
  );
}

/**
 * PLT-10 FR-1/FR-2 — "Download all your data". The bundle is built in the
 * background (a platform job) and each row polls until it is ready; the owner
 * is also told in the inbox, so leaving the page loses nothing.
 */
export function DataExportPanel({
  data,
}: Readonly<{ data: UseAccountDataResult }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbPanel as="section">
      <UbPanelSection
        title={t('data.export.title')}
        action={
          <UbButton
            size="sm"
            onClick={data.startExport}
            busy={data.isExporting}
            busyLabel={t('data.export.preparing')}
            disabled={!data.canWrite}
            icon={<Download aria-hidden className="h-4 w-4" />}
          >
            {t('data.export.start')}
          </UbButton>
        }
      >
        <UbStack gap={3}>
          <UbText variant="body-sm" tone="secondary">
            {t('data.export.body')}
          </UbText>
          {data.exports.length === 0 ? (
            <UbText variant="caption" tone="tertiary">
              {t('data.export.empty')}
            </UbText>
          ) : (
            <UbStack as="ul" gap={0}>
              {data.exports.map((row) => (
                <ExportRow key={row.id} row={row} />
              ))}
            </UbStack>
          )}
        </UbStack>
      </UbPanelSection>
    </UbPanel>
  );
}
