'use client';

import { useEffect, useRef, useState } from 'react';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import { Plus } from 'lucide-react';

import { CompactCard } from 'src/components/records/CompactCard';
import { CompactDrawer } from 'src/components/records/CompactOverlays';
import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbEmptyState,
  UbListItemText,
  UbLoadMore,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPressable,
  UbSearchInput,
  UbStack,
  UbStatCard,
  UbStatusBadge,
  UbText,
  UbFilterSelect,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { useIsOwnerOrAdmin } from 'src/hooks/useIsOwnerOrAdmin';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import { ImportActionLink } from 'modules/DigiKhaato/features/imports/components/ListHeaderActions';

import { selectLendingForm } from '../redux/lendingFormSlice';
import { selectLendingLoans } from '../redux/lendingLoansSlice';
import { fetchLendingBorrower, fetchLendingLoans } from '../redux/lendingThunk';
import { isNonZero, LOAN_STATUS_TONE } from '../view-model/lendingDisplay';

import 'src/i18n/catalogues/exports';

import { BorrowerHeaderMenu } from './BorrowerHeaderMenu';

/** The sheet loads with the tap that opens it (CLAUDE.md: a form belongs in its own chunk). */
const CollectFromBorrowerDialogLazy = dynamic(
  () => import('./CollectFromBorrowerDialog').then((m) => m.CollectFromBorrowerDialog),
  { ssr: false }
);
const LoanWorkspaceLazy = dynamic(
  () => import('./LoanPageContent').then((m) => m.LoanPageContent),
  { ssr: false }
);

/* Owner, 12 Oct 2026 — the borrower's ⋯: edit, block, unblock. Each loads
   with the tap that opens it; the page a lender reads at the door carries none
   of their form code. */
const BorrowerEditDrawerLazy = dynamic(
  () => import('./BorrowerEditDrawer').then((m) => m.BorrowerEditDrawer),
  { ssr: false }
);
const BorrowerBlockDialogLazy = dynamic(
  () => import('./BorrowerBlockDialog').then((m) => m.BorrowerBlockDialog),
  { ssr: false }
);

type BorrowerAct = 'edit' | 'block' | 'unblock';

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
 *
 * The approved design (12 Oct 2026) makes that the borrower's PAGE: their name
 * as the title, "+ Loan" for them, four figures, and "Collect from <name>",
 * which takes one handover and splits it across their running loans. The
 * search and the status filter show only once the business has a loan at all
 * (`hasLoans`, the server's), so day one is one sentence and one button.
 */
export function LoansPageContent({
  borrowerId: selectedBorrowerId,
  embedded = false,
}: Readonly<{ borrowerId?: string; embedded?: boolean }> = {}): React.JSX.Element {
  const Container = embedded ? UbStack : UbPageShell;
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLendingLoans);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.loan.read');
  const canLend = hasModule('lending') && can('lending.loan.create');
  const canCollect = hasModule('lending') && can('lending.collection.create');
  // Editing and blocking a person is the owner's or an admin's act only
  // (owner, 12 Oct 2026); everybody else never sees the ⋯.
  const isManager = useIsOwnerOrAdmin();
  const canManage = hasModule('lending') && can('lending.borrower.write') && isManager;
  const [collecting, setCollecting] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<string | null>(null);
  const [act, setAct] = useState<BorrowerAct | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const routeBorrowerId = useSearchParams().get('borrower') ?? '';
  const borrowerId = selectedBorrowerId ?? routeBorrowerId;
  const matchingList = state.listBorrowerId === borrowerId;
  const rows = matchingList ? state.rows : [];
  const { borrower } = useAppSelector(selectLendingForm);
  const person = borrowerId && borrower?.id === borrowerId ? borrower : null;
  // A blocked borrower is given no NEW loan; their running loans are collected as before.
  const blocked = person?.status === 'blocked';
  const [status, setStatus] = useState<StatusFilter>(borrowerId ? 'all' : 'active');
  const [q, setQ] = useState('');
  const queryKey = JSON.stringify([borrowerId, status, q, state.staleSeq]);
  const [pageChoice, setPageChoice] = useState({ key: queryKey, page: 1 });
  const page = pageChoice.key === queryKey ? pageChoice.page : 1;
  const [search, setSearch] = useCommittedSearch(q, setQ, 300);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(
      fetchLendingLoans({
        status: borrowerId ? 'all' : status,
        q: q || undefined,
        borrower: borrowerId || undefined,
        page: borrowerId ? undefined : String(page),
      })
    );
    return () => promise.abort();
  }, [canRead, dispatch, status, q, borrowerId, page, state.staleSeq]);
  useEffect(() => {
    if (!canRead || !borrowerId) return undefined;
    const promise = dispatch(fetchLendingBorrower(borrowerId));
    return () => promise.abort();
  }, [canRead, dispatch, borrowerId, state.staleSeq]);

  if (!canRead) {
    return (
      <Container>
        <UbEmptyState
          variant="firstUse"
          title={t('lending.noAccess.title')}
          description={t('lending.noAccess.body')}
        />
      </Container>
    );
  }

  return (
    <Container>
      <UbPageHeader
        className="ub-print-hide"
        wrapTitle={embedded}
        title={person ? person.name : t('lending.loans.title')}
        actions={
          canLend || (person && canManage) ? (
            <>
              {canLend && !blocked ? (
                <UbActionLink
                  href={
                    person
                      ? `${ROUTES.LENDING_NEW_LOAN}?borrower=${encodeURIComponent(person.id)}&name=${encodeURIComponent(person.name)}`
                      : ROUTES.LENDING_NEW_LOAN
                  }
                  icon={<Plus className="h-4 w-4" aria-hidden />}
                  iconOnly={person ? undefined : 'mobile'}
                >
                  {person ? t('lending.borrower.newLoan') : t('lending.loan.new')}
                </UbActionLink>
              ) : null}
              {/* QA F10 — a lender's whole register, in one file, on the book's own list. */}
              {!borrowerId ? <ImportActionLink kind="loans" /> : null}
              {person && canManage ? (
                <BorrowerHeaderMenu
                  t={t}
                  triggerRef={menuRef}
                  onEdit={() => setAct('edit')}
                  onBlock={blocked ? undefined : () => setAct('block')}
                  onUnblock={blocked ? () => setAct('unblock') : undefined}
                />
              ) : null}
            </>
          ) : undefined
        }
      />
      {person && (
        <UbText variant="caption" tone="secondary">
          {[
            person.mobile ? formatPhoneForDisplay(person.mobile) : person.number,
            person.area,
            person.route?.name,
          ]
            .filter(Boolean)
            .join(' · ')}
        </UbText>
      )}
      <UbStack gap={3} data-testid="lending-loans" className="ub-print-hide">
        {person && blocked ? (
          /* Everybody who can read the page sees it, not only the owner: the
             collector at the door is who must not promise a new loan. */
          <UbStack gap={1} data-testid="lending-borrower-blocked">
            <UbStack direction="row" gap={2} align="center" wrap>
              <UbStatusBadge tone="warning" label={t('lending.borrower.blocked')} />
              <UbText variant="body-sm" tone="secondary">
                {t('lending.borrower.blocked.note')}
              </UbText>
            </UbStack>
            {person.blockedReason ? (
              <UbText variant="caption" tone="tertiary">
                {t('lending.borrower.blocked.reason', { reason: person.blockedReason })}
              </UbText>
            ) : null}
          </UbStack>
        ) : null}
        {person?.summary ? (
          <UbStack gap={3} data-testid="lending-borrower-summary">
            {embedded ? (
              <UbStack className="grid grid-cols-2 gap-3">
                {[
                  { label: t('lending.loan.left'), value: person.summary.left },
                  { label: t('lending.borrowers.given'), value: person.summary.given },
                  {
                    label: t('lending.borrowers.gotBack'),
                    value: person.summary.collected,
                    paid: true,
                  },
                  {
                    label: t('lending.borrowers.lateAmount'),
                    value: person.summary.late,
                    late: true,
                  },
                ].map((metric) => (
                  <CompactCard
                    key={metric.label}
                    className={
                      metric.paid && isNonZero(metric.value) ? 'bg-success-dim' : undefined
                    }
                  >
                    <UbStack gap={1}>
                      <UbText variant="caption" tone="secondary">
                        {metric.label}
                      </UbText>
                      <UbAmount
                        value={metric.value}
                        size="md"
                        label={metric.label}
                        labelHidden
                        tone={metric.late && isNonZero(metric.value) ? 'receivable' : undefined}
                        className="self-start"
                      />
                    </UbStack>
                  </CompactCard>
                ))}
              </UbStack>
            ) : (
              <SummaryStatGrid storageKey="lendingBorrower">
                <UbStatCard label={t('lending.loan.left')} value={formatInr(person.summary.left)} />
                <UbStatCard
                  label={t('lending.borrowers.given')}
                  value={formatInr(person.summary.given)}
                  subtext={t('lending.borrowers.loans', {
                    loans: person.summary.loans,
                    running: person.summary.running,
                  })}
                />
                <UbStatCard
                  label={t('lending.borrowers.gotBack')}
                  value={formatInr(person.summary.collected)}
                  tone="success"
                />
                <UbStatCard
                  label={t('lending.borrowers.lateAmount')}
                  value={formatInr(person.summary.late)}
                  tone={isNonZero(person.summary.late) ? 'danger' : undefined}
                />
              </SummaryStatGrid>
            )}
            {canCollect && person.summary.running > 0 && isNonZero(person.summary.left) ? (
              <UbButton
                fullWidth
                onClick={() => setCollecting(true)}
                data-testid="lending-collect-from"
              >
                {t('lending.collectFrom.button', { name: person.name })}
              </UbButton>
            ) : null}
          </UbStack>
        ) : null}
        {/* No search or filter over a book with nothing in it, and none on one
            person's page: their loans are a handful, all shown. */}
        {/* Owner, 12 Oct 2026: the search and the status are ONE row. */}
        {!borrowerId && state.hasLoans && (
          <UbStack direction="row" align="center" gap={2}>
            <UbSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('lending.loans.search')}
              aria-label={t('lending.loans.search')}
              className="min-w-0 flex-1"
            />
            <UbFilterSelect
              className="h-10"
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
        )}
        {!matchingList || state.listStatus === 'loading' || state.listStatus === 'idle' ? (
          <UbPageSkeleton variant="card" />
        ) : state.listStatus === 'failed' && rows.length === 0 ? (
          <UbEmptyState
            variant="error"
            title={t('lending.loans.error')}
            action={
              <UbButton
                variant="outlineNeutral"
                onClick={() =>
                  void dispatch(
                    fetchLendingLoans({
                      status: borrowerId ? 'all' : status,
                      borrower: borrowerId || undefined,
                      q: q || undefined,
                      page: borrowerId ? undefined : String(page),
                    })
                  )
                }
              >
                {t('common.action.retry')}
              </UbButton>
            }
          />
        ) : rows.length === 0 ? (
          <UbEmptyState
            // Nothing matches a search or a filter is a different thing from
            // "you have never given a loan", and says a different sentence.
            variant={state.hasLoans ? 'filtered' : 'firstUse'}
            title={t(state.hasLoans ? 'lending.loans.emptyFiltered' : 'lending.loans.empty')}
            description={state.hasLoans ? undefined : t('lending.loans.emptyBody')}
            action={
              canLend && !state.hasLoans ? (
                <UbActionLink href={ROUTES.LENDING_NEW_LOAN}>{t('lending.loan.new')}</UbActionLink>
              ) : undefined
            }
          />
        ) : (
          <UbStack
            as="ul"
            gap={3}
            className={embedded ? undefined : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}
            aria-label={t('lending.loans.title')}
          >
            {rows.map((loan) => (
              <UbStack
                as="li"
                key={loan.id}
                gap={0}
                className="rounded-card border border-border-hairline bg-surface-card p-3 shadow-1"
              >
                <UbPressable className="w-full text-left" onClick={() => setSelectedLoan(loan.id)}>
                  <UbStack direction="row" justify="between" align="start" gap={3}>
                    <UbListItemText
                      // In one person's list the name is the page's title:
                      // each row leads with what tells the loans apart.
                      primary={person ? loan.number : loan.borrower.name}
                      secondary={[
                        person
                          ? t('lending.loans.givenOn', {
                              amount: formatInr(loan.principal),
                              date: formatBusinessDate(loan.disbursedOn),
                            })
                          : loan.number,
                        person ? '' : t(`lending.plan.${loan.planType}`),
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
                        label={t('lending.loan.left')}
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
        )}
        {matchingList &&
          !borrowerId &&
          state.total > rows.length &&
          (state.listStatus === 'failed' ? (
            <UbButton
              variant="outlineNeutral"
              onClick={() =>
                void dispatch(fetchLendingLoans({ status, q: q || undefined, page: String(page) }))
              }
            >
              {t('common.action.retry')}
            </UbButton>
          ) : (
            <UbLoadMore
              loading={state.listStatus === 'refreshing' || state.listStatus === 'loading'}
              loadingLabel={t('lending.list.loading')}
              moreLabel={t('lending.loans.loadMore')}
              onLoadMore={() => {
                if (state.listStatus === 'succeeded')
                  setPageChoice({ key: queryKey, page: page + 1 });
              }}
            />
          ))}
      </UbStack>
      {selectedLoan && rows.some((loan) => loan.id === selectedLoan) && (
        <CompactDrawer
          open
          title={t('lending.loan.details')}
          closeLabel={t('common.action.close')}
          onOpenChange={(open) => !open && setSelectedLoan(null)}
          className="sm:max-w-2xl"
        >
          <UbStack gap={3} data-testid="lending-borrower-loan-workspace">
            <LoanWorkspaceLazy key={selectedLoan} id={selectedLoan} embedded />
          </UbStack>
        </CompactDrawer>
      )}
      {act === 'edit' && person && (
        <BorrowerEditDrawerLazy
          borrower={person}
          onClose={() => setAct(null)}
          returnFocusRef={menuRef}
        />
      )}
      {(act === 'block' || act === 'unblock') && person && (
        <BorrowerBlockDialogLazy
          borrower={person}
          mode={act}
          onClose={() => setAct(null)}
          returnFocusRef={menuRef}
        />
      )}
      {collecting && person && (
        <CollectFromBorrowerDialogLazy
          key={person.id}
          loans={rows.filter((loan) => loan.borrower.id === person.id)}
          borrowerId={person.id}
          onLoanSaved={setSelectedLoan}
          name={person.name}
          onClose={() => setCollecting(false)}
        />
      )}
    </Container>
  );
}
