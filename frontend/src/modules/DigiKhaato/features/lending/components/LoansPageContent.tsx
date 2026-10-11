'use client';

import { useEffect, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { Plus } from 'lucide-react';

import {
  UbActionLink,
  UbAmount,
  UbCard,
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
  UbFilterSelect,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';

import { selectLendingForm } from '../redux/lendingFormSlice';
import { selectLendingLoans } from '../redux/lendingLoansSlice';
import { fetchLendingBorrower, fetchLendingLoans } from '../redux/lendingThunk';
import { isNonZero, LOAN_STATUS_TONE } from '../view-model/lendingDisplay';

const STATUSES = ['active', 'closed', 'all'] as const;
type StatusFilter = (typeof STATUSES)[number];

/**
 * `/lending/loans` (FRD LEN-05): the loan book — what is left on each loan, and
 * how late it is.
 *
 * `?borrower=<id>` narrows it to ONE PERSON'S loans (owner, 12 Oct 2026), with
 * their loans added up above the list: how much was given in all, how much has
 * come back, how much is left. Every loan of theirs is listed, running or
 * finished, because "what has Ramesh had from me" includes the two he repaid.
 * Each loan is still its own row with its own figures — nothing is merged.
 */
export function LoansPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLendingLoans);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.loan.read');
  const canLend = hasModule('lending') && can('lending.loan.create');
  const borrowerId = useSearchParams().get('borrower') ?? '';
  const { borrower } = useAppSelector(selectLendingForm);
  const person = borrowerId && borrower?.id === borrowerId ? borrower : null;
  const [status, setStatus] = useState<StatusFilter>(borrowerId ? 'all' : 'active');
  const [q, setQ] = useState('');
  const [search, setSearch] = useCommittedSearch(q, setQ, 300);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(
      fetchLendingLoans({ status, q: q || undefined, borrower: borrowerId || undefined })
    );
    return () => promise.abort();
  }, [canRead, dispatch, status, q, borrowerId]);
  useEffect(() => {
    if (!canRead || !borrowerId) return undefined;
    const promise = dispatch(fetchLendingBorrower(borrowerId));
    return () => promise.abort();
  }, [canRead, dispatch, borrowerId]);
  const staleNow = state.stale && state.staleUrgency === 'now';
  useEffect(() => {
    if (!canRead || !staleNow) return;
    void dispatch(
      fetchLendingLoans({ status, q: q || undefined, borrower: borrowerId || undefined })
    );
    if (borrowerId) void dispatch(fetchLendingBorrower(borrowerId));
  }, [canRead, staleNow, dispatch, status, q, borrowerId]);

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
        title={person ? t('lending.loans.of', { name: person.name }) : t('lending.loans.title')}
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
        {person?.summary ? (
          <UbCard padded data-testid="lending-borrower-summary">
            <UbStack gap={3}>
              <UbText variant="caption" tone="tertiary">
                {t('lending.borrowers.loans', {
                  loans: person.summary.loans,
                  running: person.summary.running,
                })}
              </UbText>
              <UbStack direction="row" wrap gap={6}>
                <UbAmount value={person.summary.given} label={t('lending.borrowers.given')} />
                <UbAmount value={person.summary.collected} label={t('lending.today.collected')} />
                <UbAmount
                  value={person.summary.left}
                  tone={isNonZero(person.summary.late) ? 'receivable' : undefined}
                  label={t('lending.loan.left')}
                />
                {isNonZero(person.summary.late) ? (
                  <UbAmount
                    value={person.summary.late}
                    tone="receivable"
                    label={t('lending.borrowers.lateAmount')}
                  />
                ) : null}
              </UbStack>
            </UbStack>
          </UbCard>
        ) : null}
        {borrowerId ? null : (
          <UbSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('lending.loans.search')}
            aria-label={t('lending.loans.search')}
          />
        )}
        <UbStack direction="row" gap={2}>
          <UbFilterSelect
            spec={{
              kind: 'single',
              key: 'status',
              label: t('lending.loans.status'),
              options: STATUSES.map((s) => ({ value: s, label: t(`lending.loans.filter.${s}`) })),
            }}
            value={status}
            onChange={(next) => setStatus(next as StatusFilter)}
            closeLabel={t('common.action.close')}
          />
        </UbStack>
        {state.listStatus === 'loading' || state.listStatus === 'idle' ? (
          <UbPageSkeleton variant="card" />
        ) : state.rows.length === 0 ? (
          <UbEmptyState
            // Nothing matches a search or a filter is a different thing from
            // "you have never given a loan", and says a different sentence.
            variant={q || status !== 'active' || borrowerId ? 'filtered' : 'firstUse'}
            title={t(q || borrowerId ? 'lending.loans.emptyFiltered' : 'lending.loans.empty')}
            description={q || borrowerId ? undefined : t('lending.loans.emptyBody')}
            action={
              canLend && !q ? (
                <UbActionLink href={ROUTES.LENDING_NEW_LOAN}>{t('lending.loan.new')}</UbActionLink>
              ) : undefined
            }
          />
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
                        // In one person's list the name is the page's title:
                        // each row leads with what tells the loans apart.
                        primary={person ? loan.number : loan.borrower.name}
                        secondary={[
                          person ? '' : loan.number,
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
