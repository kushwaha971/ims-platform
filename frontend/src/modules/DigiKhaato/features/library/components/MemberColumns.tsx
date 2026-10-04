import { UbAmount, UbListItemText, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { isNonZero, STATUS_TONE, validityLine } from '../view-model/memberDisplay';

import type { MemberSummary } from '../types/member.types';

/**
 * F04 (LIB-04 §8) — the members grid. The name owns its line; number and
 * group are its caption; the status is a word on the trailing slot, never a
 * colour alone.
 *
 * | Column      | Priority | Card     |
 * |---|---|---|
 * | Member      | 1 | title    |
 * | Status      | 1 | trailing |
 * | Valid until | 2 | meta     |
 * | Books       | 2 | none     |
 * | Dues        | 1 | none     |
 */
export const createMemberColumns = ({
  t,
  today,
}: {
  readonly t: TranslateFn;
  readonly today: string;
}): readonly UbDataGridColumn<MemberSummary>[] => [
  {
    id: 'member',
    header: t('library.members.column.member'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 34,
    cell: (row) => (
      <UbListItemText
        primary={
          <UbText as="span" variant="body-sm" className="line-clamp-2 font-medium">
            {row.name}
          </UbText>
        }
        secondary={[row.memberNumber, row.groupLabel, row.type.name].filter(Boolean).join(' · ')}
        secondaryVariant="caption"
        secondaryTone="tertiary"
      />
    ),
  },
  {
    id: 'validity',
    header: t('library.member.validUntil'),
    priority: 2,
    cardSlot: 'meta',
    widthShare: 20,
    cell: (row) => {
      const line = validityLine(row, today);
      const params =
        line.params && 'date' in line.params
          ? { date: formatBusinessDate(String(line.params.date)) }
          : line.params;
      return (
        <UbText
          as="span"
          variant="body-sm"
          tone={row.effectiveStatus === 'expired' ? 'error' : undefined}
        >
          {t(line.id, params)}
        </UbText>
      );
    },
  },
  {
    id: 'books',
    header: t('library.members.column.books'),
    priority: 2,
    cardSlot: 'none',
    widthShare: 14,
    cell: (row) => (
      <UbStack gap={0}>
        <UbText as="span" variant="body-sm">
          {t('library.member.booksOf', { count: row.loansOpen, max: row.type.maxCopies })}
        </UbText>
        {row.loansOverdue > 0 && (
          <UbText as="span" variant="caption" tone="error">
            {t('library.member.overdueCount', { count: row.loansOverdue })}
          </UbText>
        )}
      </UbStack>
    ),
  },
  {
    id: 'dues',
    header: t('library.members.column.dues'),
    priority: 1,
    cardSlot: 'none',
    align: 'end',
    widthShare: 14,
    cell: (row) =>
      isNonZero(row.duesAmount) ? (
        <UbAmount value={row.duesAmount} tone="receivable" label={t('library.member.owes')} />
      ) : (
        <UbText as="span" variant="body-sm" tone="tertiary">
          {t('library.member.noDues')}
        </UbText>
      ),
  },
  {
    id: 'status',
    header: t('library.column.status'),
    priority: 1,
    cardSlot: 'trailing',
    widthShare: 18,
    cell: (row) => (
      <UbStatusBadge
        tone={STATUS_TONE[row.effectiveStatus]}
        label={t(`library.member.status.${row.effectiveStatus}`)}
      />
    ),
  },
];
