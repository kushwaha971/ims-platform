'use client';

import { UbAmount, UbDisclosure, UbDivider, UbStack, UbText } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { isNegative, modeLabelId } from '../view-model/expenseDisplay';

import type { CashDay, CashRow } from '../types/cashbook.types';

/**
 * EXP-03 FR-6 — one day of the cashbook: "18/09 · Mon — In ₹12,400 · Out
 * ₹3,180 · Closing ₹41,220", opening to its rows in entry order.
 *
 * In is green and carries a "+"; out is plain ink with a "−" — never red,
 * because an expense is not an error (§8) — and the words are there as well
 * as the colour. A negative closing IS shown in the error tone with its label,
 * because it almost always means an inflow was not entered (BR-9).
 *
 * A day-banded list with one caller; `UbTimeline` stays unbuilt until a second
 * banded list appears (docs/DESIGN-SYSTEM.md, wave 3), and this is written so
 * its `rows.map` block is the thing that would be lifted.
 */
export interface CashbookDayCardProps {
  readonly day: CashDay;
  readonly defaultOpen: boolean;
  readonly t: TranslateFn;
  readonly locale: string;
}

const weekday = (iso: string, locale: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'short',
    timeZone: 'UTC',
  });

const rowLabel = (row: CashRow, t: TranslateFn): string => {
  if (row.sourceType === 'expense') {
    return row.note.trim()
      ? `${row.category?.name ?? ''} — ${row.note.trim()}`
      : (row.category?.name ?? t('cashbook.row.expense'));
  }
  if (row.direction === 'in') {
    return row.party
      ? t('cashbook.row.receivedFrom', { name: row.party.name })
      : t('cashbook.row.received');
  }
  return row.party ? t('cashbook.row.givenTo', { name: row.party.name }) : t('cashbook.row.given');
};

export function CashbookDayCard({
  day,
  defaultOpen,
  t,
  locale,
}: Readonly<CashbookDayCardProps>): React.JSX.Element {
  const header = t('cashbook.day.header', {
    date: formatBusinessDate(day.date),
    weekday: weekday(day.date, locale),
    in: formatInr(day.in.total),
    out: formatInr(day.out.total),
    closing: formatInr(day.closing.total),
  });

  return (
    /* The disclosure draws its own hairline box; wrapped in a card it was a
       box inside a box on every day. */
    <UbDisclosure label={header} defaultOpen={defaultOpen}>
      <UbStack gap={0}>
        {day.rows.map((row, index) => {
          const modeId = modeLabelId(row.mode, row.upiApp);
          const caption = [
            row.sourceType === 'expense' ? row.party?.name : null,
            modeId ? t(modeId) : null,
            row.number,
            row.reference || null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <UbStack key={row.id} gap={0}>
              {index > 0 && <UbDivider />}
              <UbStack direction="row" justify="between" align="start" className="gap-3 py-2">
                <UbStack gap={0} className="min-w-0 flex-1">
                  <UbText variant="body-sm" className="line-clamp-2">
                    {rowLabel(row, t)}
                  </UbText>
                  {caption && (
                    <UbText variant="caption" tone="tertiary" className="truncate">
                      {caption}
                    </UbText>
                  )}
                </UbStack>
                <UbStack gap={0} align="end" className="shrink-0">
                  <UbAmount
                    value={row.amount}
                    tone={row.direction === 'in' ? 'payable' : 'neutral'}
                    sign={row.direction === 'in' ? 'plus' : 'minus'}
                    label={t(row.direction === 'in' ? 'cashbook.in' : 'cashbook.out')}
                    labelHidden
                    size="sm"
                  />
                  <UbText variant="caption" tone="tertiary" className="ds-num">
                    {/* Which bucket the running figure is — in the All view the
                          rows alternate between cash and bank, and a bare
                          "Balance" jumped between two different numbers. */}
                    {t(`cashbook.row.balance.${row.bucket}`, {
                      amount: formatInr(row.runningAfter[row.bucket] ?? row.runningAfter.total),
                    })}
                  </UbText>
                </UbStack>
              </UbStack>
            </UbStack>
          );
        })}
        <UbDivider />
        <UbStack direction="row" justify="between" className="pt-2">
          <UbText variant="caption" tone="tertiary">
            {t('cashbook.opening')}: {formatInr(day.opening.total)}
          </UbText>
          <UbText
            variant="caption"
            tone={isNegative(day.closing.total) ? 'error' : 'secondary'}
            className="ds-num"
          >
            {t('cashbook.closing')}: {formatInr(day.closing.total)}
          </UbText>
        </UbStack>
        {day.voidedCount > 0 && (
          <UbText variant="caption" tone="tertiary">
            {t('cashbook.voidedNote', { count: day.voidedCount })}
          </UbText>
        )}
      </UbStack>
    </UbDisclosure>
  );
}
