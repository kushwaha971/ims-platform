'use client';

import { useCallback, useMemo } from 'react';

import {
  UbButton,
  UbPageHeader,
  UbPageShell,
  UbSelect,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import {
  UbDataGrid,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridSort,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useTranslation } from 'src/hooks/useTranslation';
import type { PartyStatus } from 'src/types/domain.types';

import { PAGE_SIZE_OPTIONS } from '../constants/partyListDefaults';
import { useNowMs } from '../hooks/useNowMs';
import { usePartyList } from '../hooks/usePartyList';
import { orderingFor, sortFromOrdering } from '../view-model/partyListSort';

import { createPartyColumns } from './PartyListColumns';
import { PartyListTotals } from './PartyListTotals';

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
  const { t } = useTranslation();
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
      selectAll: t('parties.list.select.all'),
      selectRow: t('parties.list.select.row', { name: '{name}' }),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('parties.list.open', { name: '{name}' }),
    }),
    [t]
  );

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('parties.list.empty.firstUse.title'),
        description: t('parties.list.empty.firstUse.body'),
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
    [t, clearFilters, refetch, error]
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
    <UbPageShell
      header={
        <UbPageHeader
          title={t('parties.list.title')}
          subtitle={t('parties.list.subtitle')}
          controls={
            <PartyListTotals
              totals={totals}
              receivableLabel={t('parties.list.totals.receivable')}
              payableLabel={t('parties.list.totals.payable')}
              scopeNote={
                totalsScope === 'filtered'
                  ? t('parties.list.totals.scope.filtered')
                  : t('parties.list.totals.scope.page', { count: rows.length })
              }
            />
          }
        />
      }
    >
      <UbStack gap={2}>
        <UbText variant="label" tone="tertiary">
          {t('parties.list.count', { count: meta.total })}
        </UbText>

        <UbDataGrid
          rows={rows}
          columns={columns}
          rowId={rowId}
          rowName={rowName}
          state={gridState}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('parties.list.caption')}
          page={meta}
          onPageChange={setPage}
          onPageSizeChange={handlePageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          sort={sort}
          onSortChange={handleSort}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          bulkActions={
            <>
              <UbText variant="body-sm" tone="secondary">
                {t('parties.list.selected', { count: selectedIds.length })}
              </UbText>
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
      </UbStack>
    </UbPageShell>
  );
}
