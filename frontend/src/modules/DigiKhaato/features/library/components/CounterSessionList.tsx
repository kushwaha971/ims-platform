'use client';

import { UbButton, UbCard, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbStatusBadgeTone } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { canUndo, touchedLoans } from '../view-model/counterDisplay';
import { blockParams } from '../view-model/memberDisplay';

import type { CounterRow, QueueItem } from '../types/counter.types';

const TONE: Readonly<Record<CounterRow['kind'], UbStatusBadgeTone>> = {
  issued: 'success',
  returned: 'success',
  renewed: 'success',
  undone: 'neutral',
  refused: 'error',
  unknown: 'error',
  failed: 'warning',
  info: 'info',
};

/** A row's sentence: the server's refusal, in the counter's own words. */
const sentence = (row: CounterRow, t: TranslateFn): string => {
  if (!row.messageId) return '';
  if (row.messageId.startsWith('library.member.block.')) {
    const code = row.messageId.slice('library.member.block.'.length);
    return t(
      row.messageId,
      blockParams({
        code,
        overridable: true,
        params: (row.messageParams ?? {}) as Record<string, string>,
      })
    );
  }
  const params = { ...(row.messageParams ?? {}) };
  if (typeof params.date === 'string') params.date = formatBusinessDate(params.date);
  return t(row.messageId, params);
};

/**
 * F05 (LIB-06 FR-13, §8 "Rows") — every action at this desk, newest first. The
 * title owns its line (`line-clamp-2`); the number, due date and badges sit on
 * the caption line; row actions sit on their own line, never in the trailing
 * slot (the "Delet" finding in CLAUDE.md), and there are at most two.
 */
export function CounterSessionList({
  rows,
  pending,
  failedKeys,
  t,
  today,
  busy,
  onUndo,
  onRetry,
  onSkip,
}: Readonly<{
  rows: readonly CounterRow[];
  pending: readonly QueueItem[];
  failedKeys: ReadonlySet<string>;
  t: TranslateFn;
  today: string;
  busy: boolean;
  onUndo: (row: CounterRow) => void;
  onRetry: (key: string) => void;
  onSkip: (key: string) => void;
}>): React.JSX.Element {
  const touched = touchedLoans(rows);
  return (
    <UbStack
      gap={2}
      as="ul"
      aria-label={t('library.counter.session')}
      data-testid="counter-session"
    >
      {pending.map((item) => (
        <UbStack as="li" key={`pending-${item.key}`} gap={0}>
          <UbCard padded>
            <UbText variant="body-sm" tone="tertiary">
              <UbText as="span" variant="body-sm" className="ds-mono">
                {item.code}
              </UbText>{' '}
              {t('library.counter.pending')}
            </UbText>
          </UbCard>
        </UbStack>
      ))}
      {rows.map((row) => {
        const said = sentence(row, t);
        const key = row.kind === 'failed' ? String(row.messageParams?.key ?? '') : '';
        // Retry and Skip only while the scan is still waiting on the librarian.
        const failedKey = key && failedKeys.has(key) ? key : '';
        return (
          <UbStack as="li" key={row.id} gap={0} data-testid={`counter-row-${row.kind}`}>
            <UbCard padded>
              <UbStack gap={1}>
                <UbStack direction="row" justify="between" align="start" gap={2}>
                  <UbText variant="body-sm-medium" className="line-clamp-2 min-w-0">
                    {row.title ||
                      (row.kind === 'unknown'
                        ? t('library.counter.unknownCode', { code: row.code })
                        : row.code)}
                  </UbText>
                  <UbStatusBadge
                    tone={TONE[row.kind]}
                    label={t(`library.counter.kind.${row.kind}`)}
                  />
                </UbStack>
                <UbStack direction="row" gap={2} wrap align="center">
                  <UbText variant="caption" tone="tertiary">
                    {[
                      row.accessionNumber,
                      row.memberName,
                      row.dueOn && row.kind !== 'returned'
                        ? t('library.counter.dueOn', { date: formatBusinessDate(row.dueOn) })
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </UbText>
                  {row.override && (
                    <UbStatusBadge tone="warning" label={t('library.counter.overridden')} />
                  )}
                </UbStack>
                {row.kind === 'returned' && row.fine && (
                  <UbText variant="body-sm" tone="error" data-testid="counter-fine">
                    {t('library.counter.late', {
                      days: row.daysLate ?? 0,
                      amount: formatInr(row.fine),
                    })}
                  </UbText>
                )}
                {row.kind === 'returned' && row.holdReady && (
                  <UbText variant="body-sm" tone="warning" data-testid="counter-keep-aside">
                    {t('library.counter.keepAside', {
                      name: row.holdReady.memberName,
                      number: row.holdReady.memberNumber,
                    })}
                  </UbText>
                )}
                {said && (
                  <UbText variant="body-sm" tone={row.kind === 'info' ? 'secondary' : 'error'}>
                    {said}
                  </UbText>
                )}
                {canUndo(row, today, touched) && (
                  <UbStack direction="row" gap={2}>
                    <UbButton variant="ghost" size="sm" disabled={busy} onClick={() => onUndo(row)}>
                      {t('library.counter.undo')}
                    </UbButton>
                  </UbStack>
                )}
                {failedKey && (
                  <UbStack direction="row" gap={2}>
                    <UbButton variant="secondary" size="sm" onClick={() => onRetry(failedKey)}>
                      {t('common.action.retry')}
                    </UbButton>
                    <UbButton variant="ghost" size="sm" onClick={() => onSkip(failedKey)}>
                      {t('library.counter.skip')}
                    </UbButton>
                  </UbStack>
                )}
              </UbStack>
            </UbCard>
          </UbStack>
        );
      })}
    </UbStack>
  );
}
