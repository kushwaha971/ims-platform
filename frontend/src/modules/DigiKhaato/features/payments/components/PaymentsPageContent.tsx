'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';

import {
  UbButton,
  UbDateRangePicker,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbSelect,
  UbStack,
  UbStatCard,
  UbStatGrid,
  UbTabs,
} from 'src/design-system';
import {
  UbDataGrid,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useDebounce } from 'src/hooks/useDebounce';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { PAYMENT_MODES, type PaymentMode } from 'src/types/domain.types';
import { formatInr } from 'src/utils/money';

import { PAYMENT_PRESETS, type PaymentPreset } from '../constants/paymentConstants';
import { usePaymentList } from '../hooks/usePaymentList';
import { isNarrowed } from '../view-model/paymentDisplay';

import { createPaymentColumns } from './PaymentColumns';

import type { PaymentContext, PaymentRow, PaymentTab } from '../types/payment.types';

/** The drawer loads with the tap that opens it, not with the list (CLAUDE.md). */
const PaymentFormDrawerLazy = dynamic(
  () => import('./PaymentFormDrawer').then((m) => m.PaymentFormDrawer),
  { ssr: false }
);

const SEARCH_DEBOUNCE_MS = 300;
const ALL = 'all';

/**
 * PAY-01 FR-10 — `/payments`: every receipt and voucher, filtered by period,
 * mode and search, with money in and money out totalled over the FILTERED set
 * (voids never counted — that money did not move). Tabs All · Received · Paid
 * out · Void (PAY-05 FR-8 keeps voids visible, struck through). A row opens
 * the receipt page, where it prints, shares and voids.
 */
export function PaymentsPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { can, hasModule } = usePermissions();
  const list = usePaymentList();
  const [drawer, setDrawer] = useState<PaymentContext | null>(null);
  const canWrite = hasModule('payments') && can('payments.payment.write');

  const [search, setSearch] = useState(list.filters.q);
  const debounced = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const { setQuery, filters } = list;
  useEffect(() => {
    if (debounced.trim() !== filters.q.trim()) setQuery(debounced);
  }, [debounced, filters.q, setQuery]);

  const columns = useMemo(() => createPaymentColumns({ t }), [t]);
  const openDrawer = useCallback(() => setDrawer({ direction: 'in', entry: 'list' }), []);

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('payments.list.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('payments.list.selectAll'),
      selectRow: t('payments.list.selectRow', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('payments.list.open', { name: '{name}' }),
    }),
    [t]
  );

  const { refetch, clearFilters, error } = list;
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('payments.empty.first'),
        description: t('payments.empty.firstBody'),
        action: canWrite ? (
          <UbButton icon={<Plus className="h-4 w-4" aria-hidden />} onClick={openDrawer}>
            {t('payments.record.title')}
          </UbButton>
        ) : undefined,
      },
      filtered: {
        title: t('payments.empty.filtered'),
        description: t('payments.empty.filteredBody'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('payments.list.error.title'),
        description: error?.message ?? t('payments.list.error.body'),
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, canWrite, openDrawer, clearFilters, error, refetch]
  );

  const gridState: UbGridState =
    list.status === 'loading' || (list.status === 'idle' && list.canRead)
      ? 'loading'
      : list.status === 'failed'
        ? 'error'
        : list.rows.length === 0
          ? isNarrowed(filters)
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const presets = useMemo(
    () => PAYMENT_PRESETS.map((value) => ({ value, label: t(`expenses.period.${value}`) })),
    [t]
  );
  const modeOptions = useMemo(
    () => [
      { value: ALL, label: t('payments.filter.allModes') },
      ...PAYMENT_MODES.map((mode) => ({ value: mode, label: t(`ledger.mode.${mode}`) })),
    ],
    [t]
  );
  const tabs = useMemo(
    () =>
      (['all', 'in', 'out', 'void'] as const).map((value) => ({
        value,
        label: t(`payments.tab.${value}`),
      })),
    [t]
  );
  const rowId = useCallback((row: PaymentRow) => row.id, []);
  const rowName = useCallback(
    (row: PaymentRow) => `${row.number} ${row.party?.name ?? ''}`.trim(),
    []
  );
  const openRow = useCallback(
    (row: PaymentRow) => router.push(`${ROUTES.PAYMENTS}/${row.id}`),
    [router]
  );

  if (!list.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('payments.noAccess.title')}
          description={t('payments.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const totals = list.totals;
  return (
    <UbPageShell>
      <UbPageHeader
        title={t('payments.title')}
        actions={
          canWrite && (
            <UbButton
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              onClick={openDrawer}
              data-testid="payment-add"
            >
              {t('payments.record.title')}
            </UbButton>
          )
        }
      />
      <UbStack gap={4} data-testid="payments-screen">
        <UbDateRangePicker<PaymentPreset>
          presets={presets}
          preset={filters.preset as PaymentPreset}
          onPresetChange={list.setPreset}
          customPreset="custom"
          from={filters.dateFrom}
          to={filters.dateTo}
          onRangeChange={list.setRange}
          max={list.today}
          name="payment-period"
          labels={{
            presets: t('expenses.period.label'),
            from: t('expenses.period.from'),
            to: t('expenses.period.to'),
          }}
          end={
            <UbSelect
              name="payment-mode"
              aria-label={t('payments.filter.mode')}
              value={filters.mode ?? ALL}
              options={modeOptions}
              onChange={(value: string) =>
                list.setMode(value === ALL ? null : (value as PaymentMode))
              }
              className="w-36"
            />
          }
        />

        {totals && list.rows.length > 0 && (
          <UbStatGrid>
            <UbStatCard
              icon={<ArrowDownLeft className="h-4 w-4" aria-hidden />}
              label={t('payments.total.in')}
              value={formatInr(totals.amountIn)}
              subtext={t('payments.total.count', { count: totals.count })}
            />
            <UbStatCard
              icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}
              label={t('payments.total.out')}
              value={formatInr(totals.amountOut)}
            />
          </UbStatGrid>
        )}

        <UbTabs<PaymentTab>
          value={filters.tab}
          onValueChange={list.setTab}
          tabs={tabs}
          ariaLabel={t('payments.tab.label')}
          layout="fit"
          trailing={
            <UbSearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('payments.search.placeholder')}
              aria-label={t('payments.search.label')}
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
            caption={t('payments.list.caption')}
            storageId="payments.list"
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

      {drawer && <PaymentFormDrawerLazy context={drawer} onClose={() => setDrawer(null)} />}
    </UbPageShell>
  );
}
