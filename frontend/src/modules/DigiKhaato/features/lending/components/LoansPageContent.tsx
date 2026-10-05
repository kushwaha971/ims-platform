'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbCard,
  UbChoiceChips,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPressable,
  UbSearchInput,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';

import { selectLendingLoans } from '../redux/lendingLoansSlice';
import { fetchLendingLoans } from '../redux/lendingThunk';
import { isNonZero, LOAN_STATUS_TONE } from '../view-model/lendingDisplay';

const STATUSES = ['active', 'closed', 'all'] as const;
type StatusFilter = (typeof STATUSES)[number];

/** `/lending/loans` (FRD LEN-05): the loan book — who owes what, and how late. */
export function LoansPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLendingLoans);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.loan.read');
  const canLend = hasModule('lending') && can('lending.loan.create');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [q, setQ] = useState('');
  const [search, setSearch] = useCommittedSearch(q, setQ, 300);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLendingLoans({ status, q: q || undefined }));
    return () => promise.abort();
  }, [canRead, dispatch, status, q]);
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (canRead && staleNow) void dispatch(fetchLendingLoans({ status, q: q || undefined }));
  }, [canRead, staleNow, dispatch, status, q]);

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('lending.noAccess.title')}
          description={t('lending.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('lending.loans.title')}
        actions={
          canLend ? (
            <UbActionLink
              href={ROUTES.LENDING_NEW_LOAN}
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
            >
              {t('lending.loan.new')}
            </UbActionLink>
          ) : undefined
        }
      />
      <UbStack gap={4} data-testid="lending-loans">
        <UbSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('lending.loans.search')}
          aria-label={t('lending.loans.search')}
        />
        <UbChoiceChips<StatusFilter>
          id="lending-loans-status"
          ariaLabel={t('lending.loans.status')}
          value={status}
          onChange={setStatus}
          options={STATUSES.map((s) => ({ value: s, label: t(`lending.loans.filter.${s}`) }))}
        />
        {state.listStatus === 'loading' || state.listStatus === 'idle' ? (
          <UbPageSkeleton variant="card" />
        ) : state.rows.length === 0 ? (
          <UbEmptyState variant="firstUse" title={t('lending.loans.empty')} />
        ) : (
          <UbCard padded>
            <UbStack as="ul" gap={0} aria-label={t('lending.loans.title')}>
              {state.rows.map((loan) => (
                <UbStack
                  as="li"
                  key={loan.id}
                  gap={0}
                  className="border-b border-border-hairline last:border-b-0"
                >
                  <UbPressable
                    className="w-full py-3 text-left"
                    onClick={() => router.push(`${ROUTES.LENDING_LOANS}/${loan.id}`)}
                  >
                    <UbStack direction="row" justify="between" align="start" gap={3}>
                      <UbListItemText
                        primary={loan.borrower.name}
                        secondary={[
                          loan.number,
                          t(`lending.plan.${loan.planType}`),
                          loan.status === 'active' && loan.nextDueOn
                            ? t('lending.loans.next', { date: formatBusinessDate(loan.nextDueOn) })
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      <UbStack gap={1} align="end" className="shrink-0">
                        <UbAmount
                          value={loan.remaining}
                          tone={isNonZero(loan.arrears) ? 'receivable' : undefined}
                          label={t('lending.loans.left')}
                        />
                        {isNonZero(loan.arrears) ? (
                          <UbStatusBadge
                            tone="error"
                            label={t('lending.loans.late', { days: loan.daysPastDue })}
                          />
                        ) : (
                          <UbStatusBadge
                            tone={LOAN_STATUS_TONE[loan.status]}
                            label={t(`lending.status.${loan.status}`)}
                          />
                        )}
                      </UbStack>
                    </UbStack>
                  </UbPressable>
                </UbStack>
              ))}
            </UbStack>
          </UbCard>
        )}
        {state.total > state.rows.length && (
          <UbText variant="caption" tone="tertiary">
            {t('lending.loans.more', { shown: state.rows.length, total: state.total })}
          </UbText>
        )}
      </UbStack>
    </UbPageShell>
  );
}
