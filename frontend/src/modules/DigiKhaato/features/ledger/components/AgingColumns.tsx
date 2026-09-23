import { UbAmount, UbBox, UbLink, UbText } from 'src/design-system';
import type { UbDataGridColumn, UbGridTier } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import {
  bucketLabelId,
  bucketStatementHref,
  hasAmount,
  oldestBucket,
  rowStatementHref,
} from '../view-model/agingDisplay';

import { AgingBucketBar } from './AgingBucketBar';

import type { AgingBucket, AgingKind, AgingRow } from '../types/aging.types';

/**
 * Part 19 §19.9.4 — LED-09's column model, built at module level and memoised
 * by the screen on its real dependencies.
 *
 * ── The priority order, scored against one question ────────────────────────
 * "Who do I ring first, and about how much?"
 *
 * | Column | Priority | Card | Why |
 * |---|---|---|---|
 * | Party   | 1 | title    | Who. |
 * | 90+     | 1 | none     | The oldest money — §8's default sort and the reason the report exists. |
 * | Total   | 1 | trailing | How much, in one figure. |
 * | Age bar | 2 | meta     | The shape of the debt at a glance; on a card it carries the oldest bucket in words. |
 * | 61–90   | 3 | none     | Next week's 90+. A desktop luxury. |
 * | 0–30, 31–60 | 3 | none | Money that is not late yet. |
 *
 * ── Links on a table, text on a card ─────────────────────────────────────
 * FR-4 makes every figure a way into the statement. On a table that is a link
 * per cell, each with an accessible name carrying the party AND the bucket —
 * otherwise a screen reader offers eighty links all called "₹1,200". On a
 * phone card the WHOLE ROW is the tap target (`onRowOpen`), and a link inside
 * a button is two targets in one place and invalid HTML besides, so the card's
 * cells are text and the tap opens the statement as of the report's date.
 */
export interface AgingColumnDeps {
  readonly t: TranslateFn;
  readonly kind: AgingKind;
  readonly asOf: string;
  readonly tier: UbGridTier;
}

const BUCKET_WIDTH = 11;

export const createAgingColumns = ({
  t,
  kind,
  asOf,
  tier,
}: AgingColumnDeps): readonly UbDataGridColumn<AgingRow>[] => {
  const isCards = tier === 'cards';
  const bucketLabel = (bucket: AgingBucket) => t(bucketLabelId(bucket));
  const sideLabel = t(kind === 'payable' ? 'ledger.aging.payable' : 'ledger.aging.receivable');

  const bucketColumn = (
    bucket: AgingBucket,
    priority: 1 | 3,
    sortable = false
  ): UbDataGridColumn<AgingRow> => ({
    id: bucket,
    header: bucketLabel(bucket),
    priority,
    align: 'end',
    cardSlot: 'none',
    widthShare: BUCKET_WIDTH,
    ...(sortable ? { sortField: bucket } : {}),
    cell: (row) => {
      const amount = row.amounts[bucket];
      const figure = formatInr(amount);
      if (!hasAmount(amount)) {
        return (
          <UbText as="span" variant="body-sm" tone="tertiary" className="ds-num">
            {figure}
          </UbText>
        );
      }
      return (
        <UbLink
          href={bucketStatementHref(row.partyId, bucket, asOf)}
          variant="body-sm"
          className="ds-num"
          aria-label={t('ledger.aging.cell.label', {
            party: row.partyName,
            bucket: bucketLabel(bucket),
            amount: figure,
          })}
        >
          {figure}
        </UbLink>
      );
    },
  });

  return [
    {
      id: 'party',
      header: t('ledger.aging.column.party'),
      priority: 1,
      cardSlot: 'title',
      sortField: 'name',
      widthShare: 26,
      cell: (row) =>
        isCards ? (
          row.partyName
        ) : (
          <UbLink href={rowStatementHref(row.partyId, asOf)} variant="body-sm-medium">
            {row.partyName}
          </UbLink>
        ),
    },
    {
      id: 'age',
      header: t('ledger.aging.column.age'),
      priority: 2,
      cardSlot: 'meta',
      widthShare: 18,
      cell: (row) => {
        const bar = (
          <AgingBucketBar
            amounts={row.amounts}
            bucketLabel={bucketLabel}
            ariaLabel={(detail) => t('ledger.aging.bar.label', { party: row.partyName, detail })}
            className={isCards ? 'w-20' : undefined}
          />
        );
        if (!isCards) return bar;
        const oldest = oldestBucket(row.amounts);
        return (
          <UbBox as="span" className="inline-flex items-center gap-2">
            {bar}
            {oldest && (
              <UbText as="span" variant="inherit">
                {t('ledger.aging.oldest', {
                  amount: formatInr(oldest.amount),
                  bucket: bucketLabel(oldest.bucket),
                })}
              </UbText>
            )}
          </UbBox>
        );
      },
    },
    bucketColumn('0_30', 3),
    bucketColumn('31_60', 3),
    bucketColumn('61_90', 3),
    bucketColumn('90_plus', 1, true),
    {
      id: 'total',
      header: t('ledger.aging.total'),
      priority: 1,
      align: 'end',
      cardSlot: 'trailing',
      sortField: 'total',
      widthShare: 14,
      cell: (row) => (
        <UbAmount
          value={row.amounts.total}
          tone={kind === 'payable' ? 'payable' : 'receivable'}
          sign="none"
          label={sideLabel}
          /* The header already says "Total" on a table; the card has no
             header, so there the direction word rides beside the figure
             (§23.2.6 rule 2). */
          labelHidden={!isCards}
          size="sm"
        />
      ),
    },
  ];
};
