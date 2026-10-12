'use client';

import { useEffect, useMemo, useState } from 'react';

import { IndianRupee, Receipt, Wallet } from 'lucide-react';

import {
  UbActionLink,
  UbCard,
  UbChoiceChips,
  UbDivider,
  UbEmptyState,
  UbInfoRow,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import type { ApiErrorShape } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';
import { formatInr, isNegativeAmount } from 'src/utils/money';

import { fetchLibraryMoney } from '../redux/libraryMoneyThunk';

import type { LibraryMoney } from '../types/money.types';

type Period = 'this_month' | 'last_month' | 'this_year';
const PERIODS: readonly Period[] = ['this_month', 'last_month', 'this_year'];

/** The dates a period means, in the library's own calendar. */
export const periodDates = (period: Period, today: string): { from: string; to: string } => {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (period === 'this_month') return { from: `${y}-${pad(m)}-01`, to: today };
  if (period === 'last_month') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` };
  }
  return { from: `${y}-01-01`, to: today };
};

/**
 * Library P0 — `/library/money`: the question a reading room's owner asks at the end
 * of a month. What students PAID (fees, admissions, renewals, fines — not what is
 * merely charged), what the business SPENT (its recorded expenses, by category), and
 * what is left. Expenses are recorded on the shared Expenses page, which keeps this
 * app's menu; "Add expense" goes there.
 */
export function MoneyPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.reports.read');
  const canSpend = hasModule('expenses') && can('expenses.expense.read');
  const [period, setPeriod] = useState<Period>('this_month');
  const range = useMemo(() => periodDates(period, today), [period, today]);
  const [data, setData] = useState<LibraryMoney | null>(null);
  const [error, setError] = useState<ApiErrorShape | null>(null);

  useEffect(() => {
    if (!canRead) return undefined;
    const request = dispatch(fetchLibraryMoney(range));
    void request.then((result) => {
      if (fetchLibraryMoney.fulfilled.match(result)) {
        setData(result.payload);
        setError(null);
      } else if (!result.meta.aborted) setError(result.payload ?? null);
    });
    return () => request.abort();
  }, [dispatch, range, canRead]);

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState variant="firstUse" title={t('library.money.noAccess')} />
      </UbPageShell>
    );
  }
  const shown = data && data.from === range.from && data.to === range.to ? data : null;
  /* Owner, 12 Oct 2026: a room that has never taken a fee nor recorded an
     expense is shown one sentence and one link — no period chips, no ₹0.00
     tiles, no empty Money in / Money out cards. `hasAny` is the server's, over
     all time, so a quiet month in a busy room keeps its chips; an older server
     that does not send it never hides anything. */
  const emptyBook = shown?.hasAny === false;
  /* The header's link folds to its icon on a phone; the empty state's is the
     only thing on the screen and keeps its words. */
  const expensesLink = (label: string, testId: string, inHeader: boolean): React.JSX.Element => (
    <UbActionLink
      href={ROUTES.EXPENSES}
      variant="secondary"
      icon={<Receipt className="h-4 w-4" aria-hidden />}
      iconOnly={inHeader ? 'mobile' : false}
      data-testid={testId}
    >
      {label}
    </UbActionLink>
  );
  return (
    <UbPageShell>
      <UbPageHeader
        title={t('library.money.title')}
        actions={
          canSpend && !emptyBook
            ? expensesLink(t('library.money.addExpense'), 'library-money-expenses', true)
            : undefined
        }
      />
      <UbStack gap={4} data-testid="library-money">
        {emptyBook ? (
          <UbEmptyState
            variant="firstUse"
            title={t('library.money.empty.title')}
            description={t('library.money.empty.body')}
            action={
              canSpend
                ? expensesLink(
                    t('library.money.empty.action'),
                    'library-money-empty-expenses',
                    false
                  )
                : undefined
            }
          />
        ) : (
          <UbChoiceChips<Period>
            id="library-money-period"
            ariaLabel={t('library.money.period')}
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((p) => ({ value: p, label: t(`library.money.period.${p}`) }))}
          />
        )}
        {error && !shown && (
          <UbEmptyState
            variant="error"
            title={t('library.money.error')}
            description={error.message}
          />
        )}
        {!shown && !error && <UbPageSkeleton variant="card" />}
        {shown && !emptyBook && (
          <>
            <UbStatGrid>
              <UbStatCard
                icon={<IndianRupee className="h-4 w-4" aria-hidden />}
                label={t('library.money.in')}
                value={formatInr(shown.incomeTotal)}
              />
              <UbStatCard
                icon={<Receipt className="h-4 w-4" aria-hidden />}
                label={t('library.money.out')}
                value={formatInr(shown.expensesTotal)}
              />
              <UbStatCard
                icon={<Wallet className="h-4 w-4" aria-hidden />}
                label={t(
                  isNegativeAmount(shown.profit) ? 'library.money.loss' : 'library.money.left'
                )}
                value={formatInr(shown.profit.replace('-', ''))}
                tone={isNegativeAmount(shown.profit) ? 'danger' : 'success'}
              />
            </UbStatGrid>
            <UbCard padded>
              <UbStack gap={2} data-testid="library-money-in">
                <UbText variant="label">{t('library.money.inTitle')}</UbText>
                {shown.income.length === 0 ? (
                  <UbText variant="body-sm" tone="tertiary">
                    {t('library.money.noIncome')}
                  </UbText>
                ) : (
                  shown.income.map((row) => (
                    <UbInfoRow
                      key={row.kind}
                      label={t(`library.money.kind.${row.kind}`)}
                      value={formatInr(row.amount)}
                    />
                  ))
                )}
              </UbStack>
            </UbCard>
            <UbCard padded>
              <UbStack gap={2} data-testid="library-money-out">
                <UbText variant="label">{t('library.money.outTitle')}</UbText>
                {shown.expenses.length === 0 ? (
                  <UbText variant="body-sm" tone="tertiary">
                    {t('library.money.noExpenses')}
                  </UbText>
                ) : (
                  shown.expenses.map((row) => (
                    <UbInfoRow
                      key={row.category}
                      label={row.category}
                      value={formatInr(row.amount)}
                    />
                  ))
                )}
                <UbDivider />
                <UbInfoRow
                  label={t(
                    isNegativeAmount(shown.profit) ? 'library.money.loss' : 'library.money.left'
                  )}
                  value={formatInr(shown.profit.replace('-', ''))}
                />
              </UbStack>
            </UbCard>
          </>
        )}
      </UbStack>
    </UbPageShell>
  );
}
