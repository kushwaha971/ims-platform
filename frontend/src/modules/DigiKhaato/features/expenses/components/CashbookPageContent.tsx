'use client';

import { useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { ArrowDownLeft, ArrowUpRight, Plus, Wallet } from 'lucide-react';

import {
  UbButton,
  UbCard,
  UbChoiceChips,
  UbDateRangePicker,
  UbEmptyState,
  UbMoneyInput,
  UbPageHeader,
  UbPageShell,
  UbProgress,
  UbSectionHeading,
  UbSkeleton,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBadge,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatAmount, formatInr } from 'src/utils/money';

import { CASHBOOK_PRESETS } from '../constants/expensePeriod';
import { useCashbook } from '../hooks/useCashbook';
import { useExpenseForm } from '../hooks/useExpenseForm';
import { countDifference, isNegative, shareOf } from '../view-model/expenseDisplay';

import { CashbookDayCard } from './CashbookDayCard';

import type { CashbookBucketFilter, CashFigures } from '../types/cashbook.types';
import type { ExpensePreset } from '../types/expense.types';

const ExpenseFormDrawerLazy = dynamic(
  () => import('./ExpenseFormDrawer').then((m) => m.ExpenseFormDrawer),
  { ssr: false }
);

/**
 * EXP-03 — `/cashbook`: "how much cash should be in the drawer, and how much in
 * the bank?"
 *
 * Four figures over the range (opening, in, out, closing), then the days,
 * newest first, today's open. When the range is exactly today the close-the-day
 * panel asks for the counted cash and says "Short by ₹120" or "Matches" — on
 * the client, stored nowhere (FR-8) — and offers the fix it can actually
 * perform: add the expense that was forgotten. "Record a payment" is not
 * offered, because payments are not built.
 *
 * The opening is everything recorded before the range. The one-time opening
 * cash anchor (FR-5) is a tenant setting whose screen is not built, so the page
 * says where its opening comes from instead of offering a control for it.
 */
export function CashbookPageContent(): React.JSX.Element {
  const { t, locale } = useTranslation();
  const book = useCashbook();
  const form = useExpenseForm();
  const [counted, setCounted] = useState('');

  const presets = useMemo(
    () => CASHBOOK_PRESETS.map((value) => ({ value, label: t(`expenses.period.${value}`) })),
    [t]
  );
  const bucketOptions = useMemo(
    () =>
      (['all', 'cash', 'bank'] as const).map((value) => ({
        value,
        label: t(`cashbook.bucket.${value}`),
      })),
    [t]
  );

  if (!book.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('cashbook.noAccess.title')}
          description={t('cashbook.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const { data, filters } = book;
  const figure = (values: CashFigures | undefined): string => {
    if (!values) return '—';
    const bucket = filters.bucket === 'all' ? 'total' : filters.bucket;
    return formatInr(values[bucket] ?? values.total);
  };
  const closingValue = data
    ? (data.range.closing[filters.bucket === 'all' ? 'total' : filters.bucket] ??
      data.range.closing.total)
    : '0.00';
  const expectedCash = data?.range.closing.cash ?? null;
  const difference = expectedCash !== null ? countDifference(expectedCash, counted) : null;
  const outTotal = data?.range.out.total ?? '0.00';

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('cashbook.title')}
        actions={
          form.canWrite ? (
            <UbButton
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              onClick={form.openDrawer}
            >
              {t('expenses.add')}
            </UbButton>
          ) : undefined
        }
      />

      <UbStack gap={4} data-testid="cashbook-screen">
        {book.fullScope ? (
          <UbDateRangePicker<ExpensePreset>
            presets={presets}
            preset={filters.preset}
            onPresetChange={book.setPreset}
            customPreset="custom"
            from={filters.dateFrom}
            to={filters.dateTo}
            onRangeChange={book.setRange}
            max={book.today}
            name="cashbook-period"
            labels={{
              presets: t('expenses.period.label'),
              from: t('expenses.period.from'),
              to: t('expenses.period.to'),
            }}
            end={
              <UbChoiceChips<CashbookBucketFilter>
                ariaLabel={t('cashbook.bucket.label')}
                value={filters.bucket}
                options={bucketOptions}
                onChange={book.setBucket}
              />
            }
          />
        ) : (
          <UbStatusBanner tone="info" title={t('cashbook.staffScope')} />
        )}

        {book.status === 'failed' && (
          <UbEmptyState
            variant="error"
            title={t('cashbook.error.title')}
            description={book.error?.message ?? t('cashbook.error.body')}
            requestId={book.error?.requestId ?? null}
            requestIdLabel={t('common.error.reference')}
            action={
              <UbButton variant="secondary" onClick={book.refetch}>
                {t('common.action.retry')}
              </UbButton>
            }
          />
        )}

        {!data && book.status !== 'failed' && (
          <UbStack gap={3} aria-busy="true" aria-label={t('cashbook.loading')}>
            <UbSkeleton className="h-24 w-full" />
            <UbSkeleton className="h-16 w-full" />
            <UbSkeleton className="h-16 w-full" />
          </UbStack>
        )}

        {data && (
          <>
            <UbStatGrid>
              <UbStatCard
                icon={<Wallet className="h-4 w-4" aria-hidden />}
                label={t('cashbook.opening')}
                value={figure(data.range.opening)}
                subtext={t('cashbook.asOn', { date: formatBusinessDate(filters.dateFrom) })}
              />
              <UbStatCard
                icon={<ArrowDownLeft className="h-4 w-4" aria-hidden />}
                label={t('cashbook.in')}
                value={figure(data.range.in)}
                subtext={t('cashbook.inRange')}
              />
              <UbStatCard
                icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}
                label={t('cashbook.out')}
                value={figure(data.range.out)}
                subtext={t('cashbook.inRange')}
              />
              <UbStatCard
                icon={<Wallet className="h-4 w-4" aria-hidden />}
                label={t('cashbook.closing')}
                value={figure(data.range.closing)}
                subtext={
                  isNegative(closingValue)
                    ? t('cashbook.negative')
                    : t('cashbook.asOn', { date: formatBusinessDate(filters.dateTo) })
                }
                tone={isNegative(closingValue) ? 'danger' : 'success'}
              />
            </UbStatGrid>

            <UbText variant="caption" tone="tertiary">
              {t('cashbook.openingSource')}
            </UbText>

            {book.isToday && expectedCash !== null && (
              <UbCard title={t('cashbook.closeDay')} padded>
                <UbStack gap={3} data-testid="close-the-day">
                  <UbText variant="body">
                    {t('cashbook.expectedCash', { amount: formatInr(expectedCash) })}
                  </UbText>
                  <UbMoneyInput
                    name="counted-cash"
                    aria-label={t('cashbook.countedCash')}
                    placeholder={t('cashbook.countedCash.placeholder')}
                    value={counted}
                    onChange={setCounted}
                    inputMode="decimal"
                  />
                  {difference && (
                    <UbStack direction="row" align="center" className="flex-wrap gap-2">
                      <UbStatusBadge
                        tone={
                          difference.kind === 'matches'
                            ? 'success'
                            : difference.kind === 'short'
                              ? 'warning'
                              : 'info'
                        }
                        label={t(`cashbook.${difference.kind}`, {
                          amount: formatAmount(difference.amount),
                        })}
                      />
                      {difference.kind === 'short' && form.canWrite && (
                        <UbButton variant="ghost" size="sm" onClick={form.openDrawer}>
                          {t('cashbook.addExpense')}
                        </UbButton>
                      )}
                    </UbStack>
                  )}
                </UbStack>
              </UbCard>
            )}

            <UbSectionHeading title={t('cashbook.days')} meta={String(data.days.length)} />
            {data.days.length === 0 ? (
              <UbEmptyState
                variant="filtered"
                title={t('cashbook.empty.filtered')}
                description={t('cashbook.empty.body')}
              />
            ) : (
              <UbStack gap={3}>
                {data.days.map((day, index) => (
                  <CashbookDayCard
                    key={day.date}
                    day={day}
                    defaultOpen={index === 0 && day.date === book.today}
                    t={t}
                    locale={locale}
                  />
                ))}
              </UbStack>
            )}

            {book.fullScope && data.byCategory.length > 0 && (
              <UbCard title={t('cashbook.whereMoneyWent')} padded>
                <UbStack gap={3}>
                  {data.byCategory.map((row) => {
                    const percent = shareOf(row.amount, outTotal);
                    return (
                      <UbStack key={row.id} gap={1}>
                        <UbStack direction="row" justify="between" className="gap-3">
                          <UbText variant="body-sm">{row.name}</UbText>
                          <UbText variant="body-sm" className="ds-num">
                            {`${formatInr(row.amount)} · ${percent}%`}
                          </UbText>
                        </UbStack>
                        {/* `accent` pinned: the default tone reads a share as USAGE
                            and turns amber past 80%, which would paint the
                            biggest category as a warning. */}
                        <UbProgress
                          tone="accent"
                          percent={percent}
                          ariaLabel={t('cashbook.share', { name: row.name, percent })}
                        />
                      </UbStack>
                    );
                  })}
                </UbStack>
              </UbCard>
            )}
          </>
        )}
      </UbStack>

      {form.open && <ExpenseFormDrawerLazy form={form} />}
    </UbPageShell>
  );
}
