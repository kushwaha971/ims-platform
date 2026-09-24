'use client';

import { LifeBuoy } from 'lucide-react';

import {
  UbButton,
  UbPanel,
  UbPanelSection,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatTimestamp } from 'src/utils/dates';

import { supportBadge } from '../view-model/accountDataDisplay';

import type { UseAccountDataResult } from '../hooks/useAccountData';
import type { SupportAccess } from '../types/accountData.types';

function SupportRow({
  row,
  data,
}: Readonly<{ row: SupportAccess; data: UseAccountDataResult }>): React.JSX.Element {
  const { t } = useTranslation();
  const badge = supportBadge(row.status);
  const busy = data.decidingId === row.id;
  let caption = t('data.support.row.requested', {
    who: row.requestedBy ?? t('data.support.team'),
    when: formatTimestamp(row.requestedAt),
  });
  if (row.status === 'granted') {
    caption = row.activeSessionEndsAt
      ? t('data.support.row.inSession', { until: formatTimestamp(row.activeSessionEndsAt) })
      : t('data.support.row.granted', { until: formatTimestamp(row.expiresAt) });
  }
  return (
    <UbStack as="li" gap={2} className="border-b border-border-subtle py-3 last:border-0">
      <UbStack direction="row" align="center" gap={2} wrap>
        <UbText as="span" variant="body-medium" className="min-w-0 flex-1">
          {row.reason}
        </UbText>
        <UbStatusBadge label={t(badge.labelId)} tone={badge.tone} />
      </UbStack>
      <UbText as="span" variant="caption" tone="tertiary">
        {caption}
      </UbText>
      {row.status === 'requested' ? (
        <UbStack direction="row" gap={2}>
          <UbButton
            size="sm"
            onClick={() => void data.decide(row.id, 'allow')}
            busy={busy}
            disabled={!data.canWrite}
          >
            {t('data.support.allow')}
          </UbButton>
          <UbButton
            size="sm"
            variant="secondary"
            onClick={() => void data.decide(row.id, 'deny')}
            disabled={!data.canWrite || busy}
          >
            {t('data.support.deny')}
          </UbButton>
        </UbStack>
      ) : null}
      {row.status === 'granted' ? (
        <UbButton
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => void data.decide(row.id, 'revoke')}
          busy={busy}
          disabled={!data.canWrite}
        >
          {t('data.support.revoke')}
        </UbButton>
      ) : null}
    </UbStack>
  );
}

/**
 * PLT-14 FR-6 — the owner's half of consented support access. Nobody from
 * support can enter the business until an owner taps Allow here, the
 * permission lapses after 24 hours, and Revoke ends a session in progress.
 */
export function SupportAccessPanel({
  data,
}: Readonly<{ data: UseAccountDataResult }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbPanel as="section">
      <UbPanelSection title={t('data.support.title')}>
        <UbStack gap={3}>
          <UbText variant="body-sm" tone="secondary">
            {t('data.support.body')}
          </UbText>
          {data.support.length === 0 ? (
            <UbStack direction="row" align="center" gap={2}>
              <LifeBuoy aria-hidden className="h-4 w-4 text-text-tertiary" />
              <UbText variant="caption" tone="tertiary">
                {t('data.support.empty')}
              </UbText>
            </UbStack>
          ) : (
            <UbStack as="ul" gap={0}>
              {data.support.map((row) => (
                <SupportRow key={row.id} row={row} data={data} />
              ))}
            </UbStack>
          )}
        </UbStack>
      </UbPanelSection>
    </UbPanel>
  );
}
