'use client';

import { UbCard, UbDivider, UbLink, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { groupByDate, rowPartyName, typeLabelId, typeTone } from '../view-model/dayBookDisplay';
import { sourceHref } from '../view-model/drillThrough';

import { describeModes, describeRow } from './DayBookColumns';

import type { DayBookRow } from '../types/reports.types';

/**
 * RPT-02 §5 on a phone — the rows as cards GROUPED BY DATE, a quiet date band
 * over each day's lines (T-RPT02-6), which is how a roznamcha reads.
 *
 * Each line: the type badge and the party on the first row, the money on the
 * right in its tone (In green, Out red, a void struck through), the
 * description and mode under it, and the drawer after the line when the
 * reader may see it. The whole line opens its source (AC-3).
 */
export function DayBookDayGroups({
  rows,
  balances,
  t,
}: Readonly<{
  rows: readonly DayBookRow[];
  balances: boolean;
  t: TranslateFn;
}>): React.JSX.Element {
  return (
    <UbStack gap={3} data-testid="day-book-groups">
      {groupByDate(rows).map((group) => (
        <UbCard key={group.date} padded>
          <UbStack as="section" gap={0} aria-label={formatBusinessDate(group.date)}>
            <UbText variant="caption" tone="tertiary" className="pb-1">
              {formatBusinessDate(group.date)}
            </UbText>
            <UbStack as="ul" gap={0}>
              {group.rows.map((row, index) => {
                const href = sourceHref(row.source, row.number, row.type);
                const name = rowPartyName(row);
                const title = [row.number, name].filter(Boolean).join(' · ') || t(typeLabelId(row));
                const figure = row.moneyIn ?? row.moneyOut;
                const tone = row.void
                  ? 'tertiary'
                  : row.moneyIn
                    ? 'success'
                    : row.moneyOut
                      ? 'error'
                      : 'tertiary';
                const meta = [row.time, describeModes(row, t), describeRow(row, t)]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <UbStack as="li" key={row.id} gap={0}>
                    {index > 0 && <UbDivider />}
                    <UbStack gap={1} className="py-2.5">
                      <UbStack direction="row" align="start" justify="between" className="gap-3">
                        <UbStack gap={1} className="min-w-0">
                          <UbStack direction="row" align="center" className="flex-wrap gap-1">
                            <UbStatusBadge tone={typeTone(row)} label={t(typeLabelId(row))} />
                            {row.void && (
                              <UbStatusBadge tone="neutral" label={t('reports.daybook.void')} />
                            )}
                          </UbStack>
                          {href ? (
                            <UbLink href={href} variant="body-sm-medium" className="line-clamp-2">
                              {title}
                            </UbLink>
                          ) : (
                            <UbText variant="body-sm-medium" className="line-clamp-2">
                              {title}
                            </UbText>
                          )}
                        </UbStack>
                        <UbText
                          as="span"
                          variant="body-sm-medium"
                          tone={tone}
                          className={row.void ? 'ds-num shrink-0 line-through' : 'ds-num shrink-0'}
                        >
                          {figure
                            ? `${row.moneyIn ? '+' : '−'}${formatInr(figure)}`
                            : formatInr(row.amount)}
                        </UbText>
                      </UbStack>
                      {meta && (
                        <UbText variant="caption" tone="tertiary" className="line-clamp-3">
                          {meta}
                        </UbText>
                      )}
                      {balances && (
                        <UbText variant="caption" tone="secondary" className="ds-num">
                          {t('reports.daybook.after', {
                            cash: formatInr(row.cashAfter),
                            bank: formatInr(row.bankAfter),
                          })}
                        </UbText>
                      )}
                    </UbStack>
                  </UbStack>
                );
              })}
            </UbStack>
          </UbStack>
        </UbCard>
      ))}
    </UbStack>
  );
}
