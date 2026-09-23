'use client';

import { useCallback, useMemo } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Download } from 'lucide-react';

import {
  UbBox,
  UbButton,
  UbDateInput,
  UbEmptyState,
  UbFilterBar,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbStatusBanner,
  UbTabs,
  UbText,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridSort,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { usePartyTags } from '../../parties/hooks/usePartyTags';
import { agingCsvUrl } from '../api/agingService';
import { useLedgerAging } from '../hooks/useLedgerAging';
import { AGING_BUCKETS } from '../types/aging.types';
import {
  bucketLabelId,
  orderingFor,
  rowStatementHref,
  sortFromOrdering,
} from '../view-model/agingDisplay';

import { createAgingColumns } from './AgingColumns';

import type { AgingKind, AgingRow } from '../types/aging.types';

/**
 * The party list's tag picker, loaded only when there are tags to pick — the
 * same reason and the same shape as `PartyListFilters`. A book with no tags
 * never downloads the token input.
 */
const PartyTagFilterLazy = dynamic(
  () => import('../../parties/components/PartyTagFilter').then((m) => m.PartyTagFilter),
  { ssr: false }
);

/**
 * LED-09 — how much is out there, and how old it is.
 *
 * ── The tabs ARE the position ─────────────────────────────────────────────
 * FR-1 puts "You will get" and "You will give" on stat cards, and FR-3 puts a
 * Receivable · Payable switch under them. On a phone that is two rows saying
 * the same two words, and the second row is the one that does something. So
 * the two figures are the tab labels: the merchant reads their position and
 * picks a side in the same glance, and the list starts 90 px higher.
 *
 * ── The four bucket totals are over the FILTERED set ─────────────────────
 * BR-5. With a tag applied, the cards answer "what is Camp Area owed, and how
 * old is it" — the question the merchant just asked — not a whole-book figure
 * sitting above a list that no longer adds up to it.
 *
 * ── Every figure is a way in ─────────────────────────────────────────────
 * FR-4, and the payoff for having built LED-04 first. See `AgingColumns`.
 */
export function AgingPageContent(): React.JSX.Element {
  const { t, d } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const aging = useLedgerAging();
  const { tags } = usePartyTags();

  const columns = useMemo(
    () => createAgingColumns({ t, kind: aging.filters.kind, asOf: aging.filters.asOf, tier }),
    [t, aging.filters.kind, aging.filters.asOf, tier]
  );

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('ledger.aging.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      // No selection on a report. `selectedCount` is an ICU plural and is
      // resolved against a real zero rather than a placeholder (see the team
      // screen for the "NaN selected" that taught this).
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('ledger.aging.select.all'),
      selectRow: t('ledger.aging.select.row', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('ledger.aging.open', { name: '{name}' }),
    }),
    [t]
  );

  const { refetch, setTag, error } = aging;
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      /* §9's empty state, and the tone is the point: nothing outstanding is
         GOOD NEWS on this screen, unlike every other empty list in the
         product. A merchant whose book is settled is told so. */
      firstUse: {
        title: t('ledger.aging.empty.title'),
        description: t('ledger.aging.empty.body'),
      },
      filtered: {
        title: t('ledger.aging.filtered.title'),
        description: t('ledger.aging.filtered.body'),
        action: (
          <UbButton variant="secondary" onClick={() => setTag(null)}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('ledger.aging.error.title'),
        description: error?.message ?? t('ledger.aging.error.body'),
        requestId: error?.requestId ?? null,
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, error, refetch, setTag]
  );

  const gridState: UbGridState =
    aging.isLoading || (aging.status === 'loading' && aging.rows.length === 0)
      ? 'loading'
      : aging.status === 'failed'
        ? 'error'
        : aging.rows.length === 0
          ? aging.filters.tag
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const sort = useMemo(() => sortFromOrdering(aging.filters.ordering), [aging.filters.ordering]);
  const { setOrdering, setKind, setAsOf, setPage, today, filters } = aging;
  const handleSort = useCallback(
    (next: UbGridSort) => {
      const ordering = orderingFor(next);
      if (ordering) setOrdering(ordering);
    },
    [setOrdering]
  );
  const handleOpen = useCallback(
    (row: AgingRow) => router.push(rowStatementHref(row.partyId, filters.asOf)),
    [router, filters.asOf]
  );
  const handleTag = useCallback((next: string) => setTag(next || null), [setTag]);
  const rowId = useCallback((row: AgingRow) => row.partyId, []);
  const rowName = useCallback((row: AgingRow) => row.partyName, []);

  const tabs = useMemo(
    () =>
      (['receivable', 'payable'] as const).map((kind) => ({
        value: kind,
        label: (
          <UbBox as="span" className="flex flex-col items-center gap-0.5">
            <UbText as="span" variant="caption" tone="inherit">
              {t(`ledger.aging.${kind}`)}
            </UbText>
            <UbText as="span" variant="body-medium" tone="inherit" className="ds-num">
              {aging.summary ? formatInr(aging.summary[kind]) : '—'}
            </UbText>
          </UbBox>
        ),
      })),
    [t, aging.summary]
  );

  if (!aging.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('ledger.aging.noAccess.title')}
          description={t('ledger.aging.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('ledger.aging.title')}
        subtitle={aging.asOf ? t('ledger.aging.asOfValue', { date: d(aging.asOf) }) : undefined}
        actions={
          aging.canExport ? (
            <UbLink
              href={agingCsvUrl(aging.filters)}
              variant="body-sm-medium"
              underline={false}
              download
              data-testid="aging-export"
            >
              <UbStack as="span" direction="row" align="center" className="gap-1.5">
                <Download className="h-4 w-4" aria-hidden />
                {t('ledger.aging.export')}
              </UbStack>
            </UbLink>
          ) : undefined
        }
      />

      <UbStack gap={4} className="pt-4" data-testid="aging-screen">
        <UbTabs<AgingKind>
          value={filters.kind}
          onValueChange={setKind}
          tabs={tabs}
          ariaLabel={t('ledger.aging.side')}
        >
          <UbStack gap={4}>
            <UbFilterBar>
              <UbStack direction="row" align="center" className="gap-2">
                <UbText
                  as="span"
                  variant="inherit"
                  className="ds-body-base-medium whitespace-nowrap text-text-primary"
                >
                  {t('ledger.aging.asOf')}
                </UbText>
                <UbDateInput
                  name="aging-as-of"
                  aria-label={t('ledger.aging.asOf')}
                  placeholder={t('ledger.entry.date.placeholder')}
                  value={filters.asOf}
                  max={today}
                  onChange={(value: string | null) => setAsOf(value || today)}
                />
              </UbStack>
              {/* Only once there are tags to pick, for the reason the party
                  list gives: a picker that opens empty is the first thing a
                  merchant with no tags would meet. */}
              {(tags.length > 0 || filters.tag) && (
                <PartyTagFilterLazy
                  t={t}
                  value={filters.tag ?? ''}
                  onChange={handleTag}
                  tags={tags}
                  className="w-48 shrink-0"
                />
              )}
            </UbFilterBar>

            {aging.asOfProblem && (
              <UbStatusBanner tone="error" title={t('ledger.aging.asOf.future')} />
            )}

            {/* §7 — four tiles, youngest first. Only the oldest is painted as
                a problem: three warning tiles beside it would make every shop's
                book read as an alarm, and every shop has money in 0–30. */}
            {aging.totals && aging.rows.length > 0 && (
              <UbStatGrid>
                {AGING_BUCKETS.map((bucket) => (
                  <UbStatCard
                    key={bucket}
                    label={t(bucketLabelId(bucket))}
                    value={formatInr(aging.totals?.[bucket] ?? '0.00')}
                    tone={bucket === '90_plus' ? 'danger' : 'default'}
                  />
                ))}
              </UbStatGrid>
            )}

            <UbDataGrid
              rows={aging.rows}
              columns={columns}
              rowId={rowId}
              rowName={rowName}
              state={gridState}
              labels={labels}
              emptyStates={emptyStates}
              caption={t(`ledger.aging.caption.${filters.kind}`)}
              storageId="ledger.aging"
              page={{
                page: aging.page,
                pageSize: aging.pageSize,
                total: aging.total,
                totalPages: Math.max(Math.ceil(aging.total / Math.max(aging.pageSize, 1)), 1),
              }}
              onPageChange={setPage}
              sort={sort}
              onSortChange={handleSort}
              onRowOpen={handleOpen}
            />
          </UbStack>
        </UbTabs>
      </UbStack>
    </UbPageShell>
  );
}
