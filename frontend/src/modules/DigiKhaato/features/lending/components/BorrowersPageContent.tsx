'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { Plus } from 'lucide-react';

import { CompactRecordGrid } from 'src/components/records/CompactRecordGrid';
import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import {
  UbActionLink,
  UbAmount,
  UbButton,
  UbLoadMore,
  UbAvatar,
  UbText,
  UbEmptyState,
  UbFilterSelect,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbStatCard,
  UbStatusBadge,
  useGridTier,
} from 'src/design-system';
import type {
  UbDataGridColumn,
  UbDataGridEmptyStates,
  UbDataGridLabels,
  UbGridState,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useCommittedSearch } from 'src/hooks/useCommittedSearch';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatInr } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import { selectLendingForm } from '../redux/lendingFormSlice';
import { selectLendingLoans } from '../redux/lendingLoansSlice';
import { fetchLendingBorrowers, fetchLendingToday } from '../redux/lendingThunk';
import { selectLendingToday } from '../redux/lendingTodaySlice';
import {
  BORROWER_STATUS_FILTERS,
  type BorrowerRow,
  type BorrowerStatusFilter,
} from '../types/lending.types';
import { isNonZero } from '../view-model/lendingDisplay';

const BorrowerDetailDrawerLazy = dynamic(
  () => import('./BorrowerDetailDrawer').then((m) => m.BorrowerDetailDrawer),
  { ssr: false }
);

type T = ReturnType<typeof useTranslation>['t'];

const loansLine = (t: T, row: BorrowerRow): string =>
  row.summary
    ? t('lending.borrowers.loans', { loans: row.summary.loans, running: row.summary.running })
    : '';

/**
 * The columns the approved design draws (12 Oct 2026). On a phone the grid
 * paints a card per person: the name, "3 loans · 3 running", and what is left
 * across them with "Late" when any of it is; on a computer the full table,
 * because there is room to compare people.
 */
const borrowerColumns = (t: T): UbDataGridColumn<BorrowerRow>[] => [
  {
    id: 'name',
    header: t('lending.borrowers.col.borrower'),
    priority: 1,
    cardSlot: 'title',
    widthShare: 26,
    cell: (row) => (
      <UbStack direction="row" align="center" gap={3}>
        <UbAvatar name={row.name} className="bg-primary-50 text-text-accent" />
        <UbStack gap={1} className="min-w-0">
          <UbText variant="body-sm-medium" className="break-words">
            {row.name}
          </UbText>
          <UbText variant="caption" tone="secondary">
            {[row.mobile ? formatPhoneForDisplay(row.mobile) : row.number, row.area]
              .filter(Boolean)
              .join(' · ')}
          </UbText>
          <UbText variant="caption" tone="secondary">
            {loansLine(t, row)}
          </UbText>
        </UbStack>
      </UbStack>
    ),
  },
  {
    id: 'loans',
    header: t('lending.borrowers.col.loans'),
    priority: 1,
    cardSlot: 'none',
    widthShare: 18,
    // The design's line is the count alone: with the area beside it the phone
    // card cut it to "2 loans · 2 running · …" (QA, 12 Oct 2026).
    cell: (row) => loansLine(t, row),
  },
  {
    id: 'given',
    header: t('lending.borrowers.given'),
    priority: 3,
    align: 'end',
    cardSlot: 'none',
    widthShare: 14,
    cell: (row) => (row.summary ? formatInr(row.summary.given) : ''),
  },
  {
    id: 'collected',
    header: t('lending.borrowers.gotBack'),
    priority: 3,
    align: 'end',
    cardSlot: 'none',
    widthShare: 14,
    cell: (row) => (row.summary ? formatInr(row.summary.collected) : ''),
  },
  {
    id: 'left',
    header: t('lending.loan.left'),
    priority: 1,
    align: 'end',
    cardSlot: 'trailing',
    widthShare: 16,
    // "Blocked" sits with "Late" under the amount rather than beside the name:
    // the name is the card's title and owns its line (CLAUDE.md, LED-03).
    cell: (row) =>
      row.summary || row.status === 'blocked' ? (
        <UbStack gap={1} align="end">
          {row.summary ? (
            <UbAmount
              value={row.summary.left}
              tone={isNonZero(row.summary.late) ? 'receivable' : undefined}
              label={t('lending.loan.left')}
              labelHidden
            />
          ) : null}
          {row.summary && isNonZero(row.summary.late) ? (
            <UbStatusBadge tone="error" label={t('lending.borrowers.late')} />
          ) : null}
          {row.status === 'blocked' ? (
            <UbStatusBadge tone="warning" label={t('lending.borrower.blocked')} />
          ) : null}
        </UbStack>
      ) : null,
  },
  {
    id: 'late',
    header: t('lending.borrowers.lateAmount'),
    priority: 2,
    align: 'end',
    cardSlot: 'none',
    widthShare: 12,
    cell: (row) => (row.summary ? formatInr(row.summary.late) : ''),
  },
];

const useLendingGridLabels = (t: T): UbDataGridLabels =>
  useMemo<UbDataGridLabels>(
    () => ({
      loading: t('lending.list.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('lending.list.selectAll'),
      selectRow: t('lending.list.selectRow', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('lending.list.open', { name: '{name}' }),
    }),
    [t]
  );

/**
 * `/lending/borrowers` (FRD LEN-02): everybody who has borrowed; a tap opens
 * THEIR page — their loans, their totals and "Collect from <name>".
 *
 * A borrower is a person and a loan is a loan (owner, 12 Oct 2026): one person
 * may hold several, each with its own terms, so a row says how many loans the
 * person has and how much is left across them.
 *
 * With nobody yet there is no search box over an empty list — one sentence and
 * "New loan". On a computer four figures sit above the table: today's from the
 * round, and the book's left and late from the server's own sum, never from
 * the rows on this page added up (a page is not the book).
 */
export function BorrowersPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const [selectedBorrower, setSelectedBorrower] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const { staleSeq: loanRevision } = useAppSelector(selectLendingLoans);
  const { borrowers, borrowersStatus, borrowerTotals, borrowersTotal } =
    useAppSelector(selectLendingForm);
  const { round } = useAppSelector(selectLendingToday);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('lending') && can('lending.borrower.read');
  const canLend = hasModule('lending') && can('lending.loan.create');
  const canSeeRound = hasModule('lending') && can('lending.today.read');
  const wide = useGridTier() === 'full';
  const [q, setQ] = useState('');
  // Everybody by default: a blocked borrower who still owes is somebody the
  // lender is looking for (owner, 12 Oct 2026).
  const [status, setStatus] = useState<BorrowerStatusFilter>('all');
  const queryKey = JSON.stringify([q, status, loanRevision]);
  const [pageChoice, setPageChoice] = useState({ key: queryKey, page: 1 });
  const currentPage = pageChoice.key === queryKey ? pageChoice.page : 1;
  const [search, setSearch] = useCommittedSearch(q, setQ, 300);
  const columns = useMemo(() => borrowerColumns(t), [t]);
  const labels = useLendingGridLabels(t);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLendingBorrowers({ q, status, page: String(currentPage) }));
    return () => promise.abort();
  }, [canRead, dispatch, q, status, loanRevision, currentPage]);
  // Today's two figures are for the computer's header row only; a phone
  // never draws them, so it never asks.
  useEffect(() => {
    if (!canSeeRound || !wide) return undefined;
    const promise = dispatch(fetchLendingToday(''));
    return () => promise.abort();
  }, [canSeeRound, wide, dispatch]);

  const open = useCallback((row: BorrowerRow) => setSelectedBorrower(row.id), []);
  const rowId = useCallback((row: BorrowerRow) => row.id, []);
  const rowName = useCallback((row: BorrowerRow) => row.name, []);
  const page = useMemo(
    () => ({
      page: 1,
      pageSize: Math.max(borrowers.length, 1),
      total: borrowers.length,
      totalPages: 1,
    }),
    [borrowers.length]
  );
  const noPaging = useCallback(() => undefined, []);
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: { title: t('lending.borrowers.empty') },
      filtered: { title: t('lending.borrowers.emptyFiltered') },
      error: { title: t('lending.borrowers.error') },
    }),
    [t]
  );

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

  const loaded = borrowersStatus === 'succeeded' || borrowersStatus === 'refreshing';
  // "No borrowers yet" only when nothing narrows the list: no blocked
  // borrowers is a filtered-empty list, not a first day.
  const none = loaded && borrowers.length === 0 && !q && status === 'all';
  let gridState: UbGridState = 'rows';
  if (borrowersStatus === 'idle' || borrowersStatus === 'loading') gridState = 'loading';
  else if (borrowersStatus === 'failed' && borrowers.length === 0) gridState = 'error';
  else if (borrowers.length === 0) gridState = 'filtered-empty';

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('lending.borrowers.title')}
        actions={
          canLend && !none ? (
            <UbActionLink
              href={ROUTES.LENDING_NEW_LOAN}
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              className="max-sm:h-10 max-sm:w-10"
            >
              {t('lending.loan.new')}
            </UbActionLink>
          ) : undefined
        }
      />
      {none ? (
        <UbEmptyState
          variant="firstUse"
          title={t('lending.borrowers.empty')}
          description={t('lending.borrowers.emptyBody')}
          action={
            canLend ? (
              <UbActionLink href={ROUTES.LENDING_NEW_LOAN}>{t('lending.loan.new')}</UbActionLink>
            ) : undefined
          }
        />
      ) : (
        <UbStack gap={3} data-testid="lending-borrowers">
          {wide && borrowerTotals && (
            <SummaryStatGrid storageKey="lendingBorrowers">
              {round && (
                <UbStatCard
                  label={t('lending.today.due')}
                  value={formatInr(round.due)}
                  tone={isNonZero(round.due) ? 'danger' : undefined}
                />
              )}
              {round && (
                <UbStatCard
                  label={t('lending.today.collectedToday')}
                  value={formatInr(round.collected)}
                  tone="success"
                />
              )}
              <UbStatCard
                label={t('lending.borrowers.leftAll')}
                value={formatInr(borrowerTotals.left)}
              />
              <UbStatCard
                label={t('lending.borrowers.lateAmount')}
                value={formatInr(borrowerTotals.late)}
                tone={isNonZero(borrowerTotals.late) ? 'danger' : undefined}
              />
            </SummaryStatGrid>
          )}
          <CompactRecordGrid
            cardAvatar={false}
            rows={borrowers}
            columns={columns}
            rowId={rowId}
            rowName={rowName}
            state={gridState}
            labels={labels}
            emptyStates={emptyStates}
            caption={t('lending.borrowers.title')}
            page={page}
            onPageChange={noPaging}
            onRowOpen={open}
            busy={borrowersStatus === 'refreshing'}
            search={
              <UbSearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('lending.borrowers.search')}
                aria-label={t('lending.borrowers.search')}
              />
            }
            // One row with the search (owner, 12 Oct 2026): a single choice,
            // the loan book's own status control.
            filters={
              <UbFilterSelect
                className="h-10"
                spec={{
                  kind: 'single',
                  key: 'status',
                  label: t('lending.borrowers.status'),
                  options: BORROWER_STATUS_FILTERS.map((s) => ({
                    value: s,
                    label: t(`lending.borrowers.filter.${s}`),
                  })),
                }}
                value={status}
                onChange={(next) => setStatus(next as BorrowerStatusFilter)}
                closeLabel={t('common.action.close')}
              />
            }
          />
          {(borrowersTotal ?? borrowers.length) > borrowers.length &&
            (borrowersStatus === 'failed' ? (
              <UbButton
                variant="outlineNeutral"
                onClick={() =>
                  void dispatch(fetchLendingBorrowers({ q, status, page: String(currentPage) }))
                }
              >
                {t('common.action.retry')}
              </UbButton>
            ) : (
              <UbLoadMore
                loading={borrowersStatus === 'loading' || borrowersStatus === 'refreshing'}
                loadingLabel={t('lending.list.loading')}
                moreLabel={t('lending.borrowers.loadMore')}
                onLoadMore={() => {
                  if (borrowersStatus === 'succeeded')
                    setPageChoice({ key: queryKey, page: currentPage + 1 });
                }}
              />
            ))}
        </UbStack>
      )}
      {selectedBorrower && (
        <BorrowerDetailDrawerLazy id={selectedBorrower} onClose={() => setSelectedBorrower(null)} />
      )}
    </UbPageShell>
  );
}
