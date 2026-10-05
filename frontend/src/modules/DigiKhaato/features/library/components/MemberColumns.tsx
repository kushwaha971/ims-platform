import { UbAmount, UbListItemText, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { UbDataGridColumn } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { FEE_TONE, isNonZero, placeLine, validityLine } from '../view-model/memberDisplay';

import type { MemberSummary } from '../types/member.types';

/**
 * W03 (owner, 4 Oct 2026) — the students grid of a study library: who, where
 * they sit and when, their plan, and the fee in one word. The name owns its
 * line; the fee word is the trailing slot on a phone card, never a colour alone.
 *
 * | Column      | Priority | Card     |
 * |---|---|---|
 * | Student     | 1 | title    |
 * | Fee         | 1 | trailing |
 * | Seat        | 1 | meta     |
 * | Plan        | 2 | none     |
 * | Valid until | 2 | none     |
 * | Fee due     | 1 | none     |
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
    widthShare: 26,
    cell: (row) => (
      <UbListItemText
        primary={
          <UbText as="span" variant="body-sm" className="line-clamp-2 font-medium">
            {row.name}
          </UbText>
        }
        secondary={[row.memberNumber, row.groupLabel].filter(Boolean).join(' · ')}
        secondaryVariant="caption"
        secondaryTone="tertiary"
      />
    ),
  },
  {
    id: 'seat',
    header: t('library.members.column.seat'),
    priority: 1,
    cardSlot: 'meta',
    widthShare: 18,
    cell: (row) => (
      <UbText as="span" variant="body-sm" tone={placeLine(row) ? undefined : 'tertiary'}>
        {placeLine(row) || t('library.members.noSeat')}
      </UbText>
    ),
  },
  {
    id: 'plan',
    header: t('library.members.column.plan'),
    priority: 2,
    cardSlot: 'none',
    widthShare: 16,
    cell: (row) => (
      <UbStack gap={0}>
        <UbText as="span" variant="body-sm" className="line-clamp-1">
          {row.type.name}
        </UbText>
        {isNonZero(row.planFee) && (
          <UbText as="span" variant="caption" tone="tertiary">
            {formatInr(row.planFee)}
          </UbText>
        )}
      </UbStack>
    ),
  },
  {
    id: 'validity',
    header: t('library.member.validUntil'),
    priority: 2,
    cardSlot: 'none',
    widthShare: 16,
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
    id: 'dues',
    header: t('library.members.column.dues'),
    priority: 1,
    cardSlot: 'none',
    align: 'end',
    widthShare: 12,
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
    id: 'fee',
    header: t('library.members.column.fee'),
    priority: 1,
    cardSlot: 'trailing',
    widthShare: 12,
    cell: (row) => (
      <UbStatusBadge tone={FEE_TONE[row.feeState]} label={t(`library.fee.${row.feeState}`)} />
    ),
  },
];
