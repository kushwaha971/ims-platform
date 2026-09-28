'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { FileText, IndianRupee, Plus, Receipt } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbDateRangePicker,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbTabs,
} from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useDebounce } from 'src/hooks/useDebounce';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import {
  INVOICE_PRESETS,
  INVOICE_SEARCH_DEBOUNCE_MS,
  type InvoicePreset,
} from '../constants/salesConstants';
import { useSalesFlowList } from '../hooks/useSalesFlowList';
import { useSalesGridLabels } from '../hooks/useSalesGridLabels';
import { FLOW_HOME, FLOW_TABS, flowRowHref } from '../view-model/flowDisplay';

import { createFlowColumns } from './FlowColumns';
import { SalesSectionLinks } from './SalesSectionLinks';

import type { InvoiceListRow } from '../types/sales.types';
import type { FlowKind, FlowTab } from '../types/salesFlows.types';

const COPY: Readonly<Record<FlowKind, { readonly ns: string; readonly stat: string }>> = {
  estimate: { ns: 'sales.estimate', stat: 'sales.estimate.totalQuoted' },
  credit_note: { ns: 'sales.creditNote', stat: 'sales.creditNote.totalCredited' },
};

/**
 * SAL-01 FR-10 — `/sales/estimates`; SAL-04 §14 — `/sales/credit-notes`. The
 * bills list's shape: status tabs counted over the date and search filters,
 * totals over the filtered set, rows that open the document. A credit note
 * list has no "New": a return starts from the bill it returns (§9's first-use
 * state says so rather than offering a button that cannot know the bill).
 */
export function SalesFlowListPageContent({
  kind,
}: Readonly<{ kind: FlowKind }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useGridTier();
  const list = useSalesFlowList(kind);
  const labels = useSalesGridLabels();
  const { ns, stat } = COPY[kind];
  const newHref = `${FLOW_HOME.estimate}/new`;

  const [search, setSearch] = useState(list.filters.q);
  const debounced = useDebounce(search, INVOICE_SEARCH_DEBOUNCE_MS);
  const { setQuery, filters, refetch, clearFilters, error, canWrite } = list;
  useEffect(() => {
    if (debounced.trim() !== filters.q.trim()) setQuery(debounced);
  }, [debounced, filters.q, setQuery]);

  const columns = useMemo(
    () => createFlowColumns({ t, kind, isCards: tier === 'cards' }),
    [t, kind, tier]
  );
  const newEstimate = canWrite && kind === 'estimate';
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t(`${ns}.empty.first`),
        description: t(`${ns}.empty.firstBody`),
        action: newEstimate ? (
          <UbButton
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => router.push(newHref)}
          >
            {t('sales.estimate.new')}
          </UbButton>
        ) : undefined,
      },
      filtered: {
        title: t(`${ns}.empty.filtered`),
        description: t('sales.empty.filteredBody'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('sales.list.error.title'),
        description: error?.message ?? t('sales.list.error.body'),
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, ns, newEstimate, router, newHref, clearFilters, error, refetch]
  );

  const narrowed = filters.tab !== 'all' || !!filters.q.trim();
  const gridState: UbGridState =
    list.status === 'loading' || (list.status === 'idle' && list.canRead)
      ? 'loading'
      : list.status === 'failed'
        ? 'error'
        : list.rows.length === 0
          ? narrowed
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const presets = useMemo(
    () => INVOICE_PRESETS.map((value) => ({ value, label: t(`sales.period.${value}`) })),
    [t]
  );
  const tabs = useMemo(
    () =>
      FLOW_TABS[kind].map((value) => {
        const count = list.tabs?.[value];
        const label = t(`${ns}.tab.${value}`);
        return { value, label: count ? `${label} · ${count}` : label };
      }),
    [t, ns, kind, list.tabs]
  );
  const rowId = useCallback((row: InvoiceListRow) => row.id, []);
  const rowName = useCallback(
    (row: InvoiceListRow) =>
      `${row.number ?? ''} ${row.party?.name ?? row.walkInName ?? ''}`.trim(),
    []
  );
  const openRow = useCallback(
    (row: InvoiceListRow) => router.push(flowRowHref(kind, row.id, row.status)),
    [router, kind]
  );

  if (!list.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('sales.noAccess.title')}
          description={t('sales.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const totals = list.totals;
  return (
    <UbPageShell>
      <UbPageHeader
        title={t(`${ns}.listTitle`)}
        actions={
          <>
            <SalesSectionLinks current={kind} />
            {newEstimate && (
              <UbActionLink
                href={newHref}
                variant="primary"
                icon={<Plus className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                data-testid="estimate-new"
              >
                {t('sales.estimate.new')}
              </UbActionLink>
            )}
          </>
        }
      />
      <UbStack gap={4} data-testid={`${kind}-list-screen`}>
        <UbDateRangePicker<InvoicePreset>
          presets={presets}
          preset={filters.preset}
          onPresetChange={list.setPreset}
          customPreset="custom"
          from={filters.dateFrom}
          to={filters.dateTo}
          onRangeChange={list.setRange}
          max={list.today}
          name={`${kind}-period`}
          labels={{
            presets: t('sales.period.label'),
            from: t('sales.period.from'),
            to: t('sales.period.to'),
          }}
        />
        {totals && (
          <UbStatGrid>
            <UbStatCard
              icon={<Receipt className="h-4 w-4" aria-hidden />}
              label={t(stat)}
              value={formatInr(totals.grandTotal)}
            />
            {kind === 'credit_note' ? (
              <UbStatCard
                icon={<IndianRupee className="h-4 w-4" aria-hidden />}
                label={t('sales.creditNote.openCredit')}
                value={formatInr(totals.amountDue)}
              />
            ) : (
              <UbStatCard
                icon={<FileText className="h-4 w-4" aria-hidden />}
                label={t('sales.total.count')}
                value={String(totals.count)}
              />
            )}
          </UbStatGrid>
        )}
        <UbTabs<FlowTab>
          value={filters.tab}
          onValueChange={list.setTab}
          tabs={tabs}
          ariaLabel={t('sales.tab.label')}
          layout="fit"
          trailing={
            <UbSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('sales.search.placeholder')}
              aria-label={t('sales.search.label')}
              className="w-56"
            />
          }
        >
          <UbDataGrid
            rows={list.rows}
            columns={columns}
            rowId={rowId}
            rowName={rowName}
            state={gridState}
            labels={labels}
            emptyStates={emptyStates}
            caption={t(`${ns}.listTitle`)}
            storageId={`sales.${kind}.columns`}
            page={{
              page: list.page,
              pageSize: list.pageSize,
              total: list.total,
              totalPages: Math.max(Math.ceil(list.total / Math.max(list.pageSize, 1)), 1),
            }}
            onPageChange={list.setPage}
            onRowOpen={openRow}
            cardAvatar={false}
          />
        </UbTabs>
      </UbStack>
    </UbPageShell>
  );
}
