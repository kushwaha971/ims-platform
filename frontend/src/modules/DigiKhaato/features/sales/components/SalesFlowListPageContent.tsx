'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { FileText, IndianRupee, Plus, Receipt } from 'lucide-react';

import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import {
  UbActionLink,
  UbButton,
  UbDateRangePicker,
  UbEmptyState,
  UbFilterSheet,
  UbPageHeader,
  UbPageHeaderMobileActions,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbStatCard,
  UbTabs,
} from 'src/design-system';
import type { UbFilterSpec, UbFilterValues } from 'src/design-system';
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
  DEFAULT_INVOICE_PRESET,
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
  sales_order: { ns: 'sales.order', stat: 'sales.order.totalOrdered' },
  delivery_challan: { ns: 'sales.challan', stat: 'sales.challan.totalSent' },
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
  const newHref = `${FLOW_HOME[kind]}/new`;
  const newLabelId =
    kind === 'sales_order'
      ? 'sales.order.new'
      : kind === 'delivery_challan'
        ? 'sales.challan.new'
        : 'sales.estimate.new';

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
  const newEstimate = canWrite && kind !== 'credit_note';
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
            {t(newLabelId)}
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
    [t, ns, newEstimate, router, newHref, newLabelId, clearFilters, error, refetch]
  );

  const narrowed =
    filters.tab !== 'all' || !!filters.q.trim() || filters.preset !== DEFAULT_INVOICE_PRESET;
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
  /* Approved designs (12 Oct 2026): `hasAny` is the server's, so a period or
     search that found nothing keeps its controls; only a book with none of
     this kind at all is reduced to the empty card. */
  const emptyBook = list.status === 'succeeded' && list.rows.length === 0 && list.hasAny === false;
  const phone = tier === 'cards';
  /* On a phone: the search and ONE Filters button holding the tabs and the
     period; each default reads as "no filter". */
  const phoneSpecs: UbFilterSpec[] = [
    {
      kind: 'single',
      key: 'tab',
      label: t('sales.tab.label'),
      anyLabel: t(`${ns}.tab.all`),
      options: FLOW_TABS[kind]
        .filter((tab) => tab !== 'all')
        .map((value) => ({
          value,
          label: t(`${ns}.tab.${value}`),
          hint: list.tabs?.[value] ? String(list.tabs[value]) : undefined,
        })),
    },
    {
      kind: 'single',
      key: 'preset',
      label: t('sales.period.label'),
      anyLabel: t(`sales.period.${DEFAULT_INVOICE_PRESET}`),
      options: INVOICE_PRESETS.filter((p) => p !== DEFAULT_INVOICE_PRESET && p !== 'custom').map(
        (value) => ({ value, label: t(`sales.period.${value}`) })
      ),
    },
    {
      kind: 'dateRange',
      key: 'range',
      label: t('sales.period.between'),
      fromKey: 'dateFrom',
      toKey: 'dateTo',
      fromLabel: t('sales.period.from'),
      toLabel: t('sales.period.to'),
      max: list.today,
    },
  ];
  const custom = filters.preset === 'custom';
  const phoneValues: UbFilterValues = {
    tab: filters.tab === 'all' ? '' : filters.tab,
    preset: filters.preset === DEFAULT_INVOICE_PRESET || custom ? '' : filters.preset,
    dateFrom: custom ? filters.dateFrom : '',
    dateTo: custom ? filters.dateTo : '',
  };
  const applyPhone = (next: UbFilterValues) => {
    const ranged = Boolean(next.dateFrom || next.dateTo);
    list.applyFilters({
      tab: (next.tab || 'all') as FlowTab,
      preset: ranged ? 'custom' : ((next.preset || DEFAULT_INVOICE_PRESET) as InvoicePreset),
      dateFrom: next.dateFrom || filters.dateFrom,
      dateTo: next.dateTo || filters.dateTo,
    });
  };
  const searchBox = (
    <UbSearchInput
      value={search}
      onChange={setSearch}
      placeholder={t('sales.search.placeholder')}
      aria-label={t('sales.search.label')}
      className={phone ? 'min-w-0 flex-1' : 'w-56'}
    />
  );
  const stats = totals ? (
    <SummaryStatGrid storageKey="salesFlows">
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
          // The list's own noun: an estimates list counts estimates, not "Bills".
          label={t(`${ns}.count`)}
          value={String(totals.count)}
        />
      )}
    </SummaryStatGrid>
  ) : null;
  const grid = (
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
  );
  return (
    <UbPageShell>
      <UbPageHeader
        title={t(`${ns}.listTitle`)}
        actions={<SalesSectionLinks current={kind} />}
        primaryAction={
          newEstimate && !emptyBook ? (
            <UbActionLink
              href={newHref}
              variant="primary"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              data-testid="estimate-new"
            >
              {t(newLabelId)}
            </UbActionLink>
          ) : undefined
        }
        /* docs/mobile-redesign (A3) — on a phone: a worded ⋯ sheet and the
           primary action as the floating button. Desktop is unchanged. */
        renderMobileActions={(actions) => (
          <UbPageHeaderMobileActions
            actions={actions}
            mobile={{
              menuLabel: t('common.action.moreActions'),
              closeLabel: t('common.action.close'),
              // The empty book's one button is in the middle of the screen.
              primary:
                newEstimate && !emptyBook
                  ? {
                      label: t(newLabelId),
                      icon: <Plus className="h-6 w-6" aria-hidden />,
                      href: newHref,
                    }
                  : undefined,
            }}
          />
        )}
      />
      <UbStack gap={4} data-testid={`${kind}-list-screen`}>
        {emptyBook ? (
          /* Owner, 12 Oct 2026: an empty book is one sentence and one button —
             no period, ₹0 totals, tabs or search over nothing. */
          <UbEmptyState
            variant="firstUse"
            title={emptyStates.firstUse.title}
            description={emptyStates.firstUse.description}
            action={emptyStates.firstUse.action}
          />
        ) : phone ? (
          <>
            <UbStack direction="row" gap={2} align="center">
              {searchBox}
              <UbFilterSheet
                specs={phoneSpecs}
                values={phoneValues}
                onApply={applyPhone}
                labels={{
                  title: t('common.filters.title'),
                  apply: t('common.action.apply'),
                  reset: t('common.action.reset'),
                  close: t('common.action.close'),
                }}
              />
            </UbStack>
            {stats}
            {grid}
          </>
        ) : (
          <>
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
                apply: t('common.action.apply'),
                close: t('common.action.close'),
              }}
            />
            {stats}
            <UbTabs<FlowTab>
              value={filters.tab}
              onValueChange={list.setTab}
              tabs={tabs}
              ariaLabel={t('sales.tab.label')}
              layout="fit"
              trailing={searchBox}
            >
              {grid}
            </UbTabs>
          </>
        )}
      </UbStack>
    </UbPageShell>
  );
}
