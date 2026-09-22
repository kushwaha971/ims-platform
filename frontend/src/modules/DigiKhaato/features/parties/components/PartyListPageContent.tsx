'use client';

import { useCallback, useMemo } from 'react';

import dynamic from 'next/dynamic';

import { Plus } from 'lucide-react';

import {
  UbButton,
  UbPageHeader,
  UbPageShell,
  UbSelect,
  UbStack,
  UbTextInput,
} from 'src/design-system';
import {
  UbDataGrid,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridSort,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useNowMs } from 'src/hooks/useNowMs';
import { useTranslation } from 'src/hooks/useTranslation';
import type { PartyStatus } from 'src/types/domain.types';

import { PAGE_SIZE_OPTIONS } from '../constants/partyListDefaults';
import { usePartyForm } from '../hooks/usePartyForm';
import { usePartyList } from '../hooks/usePartyList';
import { orderingFor, sortFromOrdering } from '../view-model/partyListSort';

import { createPartyColumns } from './PartyListColumns';
import { PartyListStats } from './PartyListStats';

/**
 * `ssr: false` because a drawer is never part of a server render: it opens on
 * an interaction, so `open` is false in every server pass and there is no
 * hydration mismatch to avoid.
 */
const PartyFormDrawerLazy = dynamic(
  () => import('./PartyFormDrawer').then((m) => m.PartyFormDrawer),
  { ssr: false }
);

import type { Party } from '../types/party.types';

/**
 * PTY-02's list, and the reference implementation of the approved responsive
 * rules: one column model, three renderings, chosen by `UbDataGrid`.
 *
 * What this screen still owns, and what it handed over:
 *
 *  · It owns the COPY (every string below is a key), the COLUMN MODEL and its
 *    priorities, and the decision about what each of the three empty states
 *    says. All three are domain judgements and none of them belongs in a `Ub*`.
 *  · It handed over the LAYOUT. Cards below `md`, priority columns at `md`,
 *    the full table with selection at `lg` — and the guarantee that none of the
 *    three scrolls sideways — are now the grid's contract, so `/items`,
 *    `/sales/invoices` and `/payments` inherit them instead of re-deciding them.
 *
 * ── Kept deliberately from the screen this replaces ─────────────────────────
 *  · **The filtered-empty state clears the search.** Its action was labelled
 *    `common.action.retry` — "Try again" on a button that clears a filter — and
 *    it is `common.action.clearFilters`, three lines from where the tenant
 *    chooser was already using it correctly.
 *  · **The subtitle is constant and the count is a caption.** The sentence that
 *    explains what the screen is for does not vanish the moment data arrives.
 *  · **The error state keeps its request id** (R-E-4) and its own in-page
 *    rendering — `partyService` suppresses the toast for exactly this reason.
 *
 * ── Added by this wave ──────────────────────────────────────────────────────
 *  · The two header totals, in the STICKY header, at every width.
 *  · Server-side sort on name, balance and last entry.
 *  · Selection and a bulk action at `lg` and up.
 */

const STATUS_OPTIONS: readonly PartyStatus[] = ['active', 'archived'];

export function PartyListPageContent(): React.JSX.Element {
  const { t, n } = useTranslation();
  const partyForm = usePartyForm();
  const {
    rows,
    meta,
    filters,
    status,
    error,
    totals,
    totalsScope,
    selectedIds,
    setSelectedIds,
    setOrdering,
    setFilters,
    setPage,
    searchInput,
    setSearchInput,
    isFiltered,
    clearFilters,
    refetch,
  } = usePartyList();

  /** Read outside render, so the column array's memo key is stable. */
  const nowMs = useNowMs();

  // Resolved once so a memoised cell never has to reach for `react-intl`.
  const balanceLabels = useMemo(
    () => ({
      'parties.list.balance.receivable': t('parties.list.balance.receivable'),
      'parties.list.balance.payable': t('parties.list.balance.payable'),
      'parties.list.balance.settled': t('parties.list.balance.settled'),
    }),
    [t]
  );

  const columns = useMemo(
    () => createPartyColumns({ t, nowMs, balanceLabels }),
    [t, nowMs, balanceLabels]
  );

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('parties.list.loading'),
      /**
       * `{page}` and `{pages}` are passed through as literal text: the grid
       * substitutes them itself, because it is the only thing that knows the
       * numbers. ICU does not re-parse a value, so what comes back is the
       * translated sentence with its two slots intact.
       */
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      // `{page}` and `{total}` pass through as literal text, like `pageOf`
      // above: the pagination bar substitutes them, because it is the only
      // thing that knows which page a button points at.
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      // The ONLY label here that is finished rather than a template, and the
      // reason is ICU: `selectedCount` is a PLURAL message, and a plural cannot
      // be resolved later. Passing the literal string `'{count}'` as its value
      // made `#` evaluate to NaN, so the selection bar read "NaN selected" —
      // which no unit test saw, because the test's fixture was a plain
      // `'{count} selected'` string that never went through `react-intl`. The
      // count is known here, and Hindi's one/other forms differ, so `t()` does
      // the plural and the grid paints what it is given.
      selectedCount: t('common.grid.selectedCount', { count: selectedIds.length }),

      selectAll: t('parties.list.select.all'),
      selectRow: t('parties.list.select.row', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('parties.list.open', { name: '{name}' }),
    }),
    // `selectedIds.length` is a real dependency now that the plural is resolved
    // here. It rebuilds this object while the merchant is ticking rows, which
    // is a handful of renders of a toolbar that is re-rendering anyway — the
    // alternative was a label that said NaN.
    [t, selectedIds.length]
  );

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('parties.list.empty.firstUse.title'),
        description: t('parties.list.empty.firstUse.body'),
        // The empty state's whole job is to offer the one move that closes it.
        // Before PTY-01 it described a screen and left the merchant to find the
        // way out themselves.
        action: partyForm.canWrite ? (
          <UbButton onClick={partyForm.openCreate}>{t('parties.list.add')}</UbButton>
        ) : undefined,
      },
      filtered: {
        title: t('parties.list.empty.filtered.title'),
        description: t('parties.list.empty.filtered.body'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('parties.list.error.title'),
        description: error?.message ?? t('parties.list.error.body'),
        requestId: error?.requestId ?? null,
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, clearFilters, refetch, error, partyForm.canWrite, partyForm.openCreate]
  );

  const gridState: UbGridState =
    status === 'loading'
      ? 'loading'
      : status === 'failed'
        ? 'error'
        : rows.length === 0
          ? isFiltered
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const sort = useMemo(() => sortFromOrdering(filters.ordering), [filters.ordering]);

  const handleSort = useCallback(
    (next: UbGridSort) => {
      const ordering = orderingFor(next);
      if (ordering) setOrdering(ordering);
    },
    [setOrdering]
  );

  const handleStatus = useCallback(
    (value: string) => setFilters({ status: value as PartyStatus }),
    [setFilters]
  );

  const handlePageSize = useCallback(
    (pageSize: number) => setPage(1, pageSize),
    [setPage]
  );

  const clearSelection = useCallback(() => setSelectedIds([]), [setSelectedIds]);

  const rowId = useCallback((party: Party) => party.id, []);
  const rowName = useCallback((party: Party) => party.name, []);

  return (
    // `full` rather than the default `measure`: this is the data-grid opt-out
    // the shell documents. A 1120 px column on a 1440 px screen left a band of
    // empty canvas down the right of a table that had columns truncating in it.
    <UbPageShell
      width="full"
      header={
        <UbPageHeader
          title={t('parties.list.title')}
          subtitle={t('parties.list.subtitle')}
          actions={
            /* Hidden rather than disabled when the role cannot write (§19.7.5).
               A disabled Add button invites a support call; an absent one says
               nothing a merchant has to interpret. */
            partyForm.canWrite ? (
              <UbButton icon={<Plus className="h-4 w-4" aria-hidden />} onClick={partyForm.openCreate}>
                {t('parties.list.add')}
              </UbButton>
            ) : undefined
          }
        />
      }
    >
      {/* BrandHub's page rhythm: the figures under the title, then the list,
          24 px apart. The count that used to sit here in grey label type is
          the third card now — it was the same job said in a different voice. */}
      <UbStack gap={6}>
        <PartyListStats
          totals={totals}
          total={meta.total}
          receivableLabel={t('parties.list.totals.receivable')}
          payableLabel={t('parties.list.totals.payable')}
          countLabel={t('parties.list.stats.customers')}
          countValue={n(meta.total)}
          scopeNote={
            totalsScope === 'filtered'
              ? t('parties.list.totals.scope.filtered')
              : t('parties.list.totals.scope.page', { count: rows.length })
          }
          countNote={
            isFiltered
              ? t('parties.list.stats.count.filtered')
              : t('parties.list.stats.count.all')
          }
        />

        {/* `storageId` puts the column choices in `sessionStorage`: they survive
            a trip to a party and back. Session rather than account, because
            this is a reading preference for the afternoon rather than a
            setting — putting it on the server means an endpoint and a
            migration for something the merchant expects to undo by closing
            the tab. */}
        <UbDataGrid
          rows={rows}
          columns={columns}
          rowId={rowId}
          rowName={rowName}
          state={gridState}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('parties.list.caption')}
          storageId="parties.list"
          page={meta}
          onPageChange={setPage}
          onPageSizeChange={handlePageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          sort={sort}
          onSortChange={handleSort}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          /* The count is NOT repeated here. The selection bar paints
             "{n} selected" on its left now (BrandHub's arrangement), and this
             slot used to carry the same sentence again three inches to the
             right — so a merchant who ticked one row was told twice. What
             belongs here is what they can DO about the selection. */
          bulkActions={
            <>
              <UbButton variant="secondary" size="sm" onClick={clearSelection}>
                {t('parties.list.bulk.clearSelection')}
              </UbButton>
            </>
          }
          search={
            <UbTextInput
              value={searchInput}
              onChange={setSearchInput}
              type="text"
              aria-label={t('parties.list.search.label')}
              placeholder={t('parties.list.search.placeholder')}
            />
          }
          filters={
            <UbSelect
              value={filters.status}
              onChange={handleStatus}
              aria-label={t('parties.list.filter.status.label')}
              options={STATUS_OPTIONS.map((value) => ({
                value,
                label: t(`parties.list.status.${value}`),
              }))}
            />
          }
        />
        {/* Loaded when the merchant asks for it, not when the list loads.
            Measured: the form carries React Hook Form's resolver, the Yup
            schema, a Radix switch and the three new inputs, and putting it in
            the route's own chunk cost /parties 39.8 KB gz — paid by every
            merchant who opens the list to READ it, which is almost all of
            them. `openFor` is the only thing the page needs eagerly, and that
            lives in the slice. */}
        {partyForm.open && <PartyFormDrawerLazy form={partyForm} />}
      </UbStack>
    </UbPageShell>
  );
}
