'use client';

import { useCallback } from 'react';

import { ExternalLink } from 'lucide-react';

import {
  UbActionLink,
  UbDrawer,
  UbEmptyState,
  UbInfoRow,
  UbPanel,
  UbPanelSection,
  UbStack,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatTimestamp } from 'src/utils/dates';

import { actionLabel, actorLabel, entityTypeLabel, fullDiff } from '../view-model/auditDisplay';

import type { UseAuditLogResult } from '../hooks/useAuditLog';

/**
 * PLT-08 FR-2 / FR-5 — one row in full: every changed field before and after,
 * the reason quoted, the request id for support, and "Open" to the entity when
 * it has a page and still exists (EC-1: a deleted draft keeps its label and
 * loses the link). `dynamic()`-loaded: most visits read the list and never open
 * a row.
 */
export function AuditDetailDrawer({
  log,
}: Readonly<{ log: UseAuditLogResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const row = log.selected;
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) log.closeRow();
    },
    [log]
  );
  const diff = row ? fullDiff(row, t) : [];

  return (
    <UbDrawer
      open={Boolean(row)}
      onOpenChange={handleOpenChange}
      title={row ? actionLabel(row.action, t) : ''}
      description={row ? formatTimestamp(row.createdAt) : undefined}
      closeLabel={t('common.action.close')}
      footer={
        row?.entityRoute ? (
          <UbActionLink
            href={row.entityRoute}
            icon={<ExternalLink aria-hidden className="h-4 w-4" />}
          >
            {t('audit.detail.open')}
          </UbActionLink>
        ) : undefined
      }
    >
      {row && (
        <UbStack gap={4}>
          <UbPanel>
            <UbPanelSection title={t('audit.detail.about')}>
              <UbStack gap={2}>
                <UbInfoRow label={t('audit.filter.actor')} value={actorLabel(row, t)} />
                <UbInfoRow
                  label={t('audit.column.entity')}
                  value={row.entityLabel ?? entityTypeLabel(row.entityType, t)}
                />
                {row.reason && (
                  <UbInfoRow label={t('audit.detail.reason')} value={`“${row.reason}”`} />
                )}
                {row.requestId && (
                  <UbInfoRow
                    label={t('common.error.reference')}
                    value={
                      <UbText as="span" variant="mono">
                        {row.requestId}
                      </UbText>
                    }
                  />
                )}
                {row.ip && <UbInfoRow label={t('audit.detail.ip')} value={row.ip} />}
              </UbStack>
            </UbPanelSection>
          </UbPanel>
          <UbPanel>
            <UbPanelSection title={t('audit.detail.changes')}>
              {diff.length === 0 ? (
                <UbEmptyState variant="firstUse" title={t('audit.detail.noChanges')} />
              ) : (
                <UbStack gap={2}>
                  {diff.map((line) => (
                    <UbStack key={line.key} gap={0.5}>
                      <UbText variant="caption" tone="tertiary">
                        {line.key}
                      </UbText>
                      <UbText variant="body" className="break-words">
                        {t('audit.detail.beforeAfter', { before: line.before, after: line.after })}
                      </UbText>
                    </UbStack>
                  ))}
                </UbStack>
              )}
            </UbPanelSection>
          </UbPanel>
        </UbStack>
      )}
    </UbDrawer>
  );
}
