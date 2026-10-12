'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import dynamic from 'next/dynamic';

import { BookOpen, Plus, Receipt } from 'lucide-react';

import { SummaryStatGrid } from 'src/components/stats/SummaryStatGrid';
import {
  UbActionLink,
  UbButton,
  UbDateRangePicker,
  UbEmptyState,
  UbFilterSelect,
  UbFilterSheet,
  UbPageHeader,
  UbPageHeaderMobileActions,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbStatCard,
  UbTabs,
  UbTag,
  UbText,
  isUbTagColor,
} from 'src/design-system';
import type { UbFilterSpec, UbFilterValues } from 'src/design-system';
import {
  UbDataGrid,
  useGridTier,
  type UbDataGridEmptyStates,
  type UbDataGridLabels,
  type UbGridState,
} from 'src/design-system/UbDataGrid';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useDebounce } from 'src/hooks/useDebounce';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveApp } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { PAYMENT_MODES, type PaymentMode } from 'src/types/domain.types';
import { formatInr } from 'src/utils/money';

import { ListExportButton } from 'modules/DigiKhaato/features/imports/components/ListHeaderActions';

import { expenseExportPath } from '../api/expenseService';
import { DEFAULT_EXPENSE_PRESET, EXPENSE_PRESETS } from '../constants/expensePeriod';
import { useExpenseForm } from '../hooks/useExpenseForm';
import { useExpenseList } from '../hooks/useExpenseList';
import { isNarrowed } from '../view-model/expenseDisplay';

import { createExpenseColumns } from './ExpenseColumns';

import type { Expense, ExpensePreset, ExpenseTab } from '../types/expense.types';

/** The form and the detail sheet load with the tap that opens them, not with the list. */
const ExpenseFormDrawerLazy = dynamic(
  () => import('./ExpenseFormDrawer').then((m) => m.ExpenseFormDrawer),
  { ssr: false }
);
const ExpenseDetailDrawerLazy = dynamic(
  () => import('./ExpenseDetailDrawer').then((m) => m.ExpenseDetailDrawer),
  { ssr: false }
);

const SEARCH_DEBOUNCE_MS = 300;

/* The "no filter" choice of the two selects. Not '' — the select cannot show
   an empty value as chosen, and the first sweep found both boxes rendering
   blank, with nothing to say what they filter by. */

/**
 * EXP-01 FR-9 — `/expenses`: what went out, filtered, with the total over the
 * FILTERED set ("Total ₹41,230 · 62 expenses") and the top categories under it.
 *
 * The period chips sit in the filter bar with the category and mode on its
 * right (the owner's rule for a screen's scope), the three tabs under them —
 * All (recorded), Unpaid, Void — with search on the tab row. Rows open the
 * detail sheet, where a wrong expense is voided with a reason.
 */
export function ExpensesPageContent(): React.JSX.Element {
  const activeApp = useAppSelector(selectActiveApp);
  const { t } = useTranslation();
  const tier = useGridTier();
  const list = useExpenseList();
  const form = useExpenseForm();

  /* Search is typed a character at a time; the URL (and so the request)
     follows it 300 ms behind, FR-9's debounce. */
  const [search, setSearch] = useState(list.filters.q);
  const debounced = useDebounce(search, SEARCH_DEBOUNCE_MS);
  const { setQuery, filters } = list;
  useEffect(() => {
    if (debounced.trim() !== filters.q.trim()) setQuery(debounced);
  }, [debounced, filters.q, setQuery]);

  const columns = useMemo(() => createExpenseColumns({ t, isCards: tier === 'cards' }), [t, tier]);

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('expenses.list.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('expenses.list.selectAll'),
      selectRow: t('expenses.list.selectRow', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('expenses.list.open', { name: '{name}' }),
    }),
    [t]
  );

  const { refetch, clearFilters, error } = list;
  const { canWrite, openDrawer } = form;
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('expenses.empty.first'),
        description: t('expenses.empty.firstBody'),
        action: canWrite ? (
          <UbButton icon={<Plus className="h-4 w-4" aria-hidden />} onClick={openDrawer}>
            {t('expenses.add')}
          </UbButton>
        ) : undefined,
      },
      filtered: {
        title: t('expenses.empty.filtered'),
        description: t('expenses.empty.filteredBody'),
        action: (
          <UbButton variant="secondary" onClick={clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('expenses.list.error.title'),
        description: error?.message ?? t('expenses.list.error.body'),
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
    () => EXPENSE_PRESETS.map((value) => ({ value, label: t(`expenses.period.${value}`) })),
    [t]
  );
  const categoryOptions = useMemo(
    () => form.categories.map((category) => ({ value: category.id, label: category.name })),
    [form.categories]
  );
  const modeOptions = useMemo(
    () => PAYMENT_MODES.map((mode) => ({ value: mode, label: t(`ledger.mode.${mode}`) })),
    [t]
  );
  const tabs = useMemo(
    () =>
      (['all', 'unpaid', 'void'] as const).map((value) => ({
        value,
        label: t(`expenses.tab.${value}`),
      })),
    [t]
  );

  const { openDetail } = form;
  const rowId = useCallback((row: Expense) => row.id, []);
  const rowName = useCallback((row: Expense) => `${row.number} ${row.category.name}`, []);

  if (!list.canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('expenses.noAccess.title')}
          description={t('expenses.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  const totals = list.totals;
  /* Approved designs (12 Oct 2026): `hasAny` is the server's, so a period or
     filter that found nothing keeps its controls; only a business that has
     never written an expense is reduced to the empty card. */
  const emptyBook = list.status === 'succeeded' && list.rows.length === 0 && list.hasAny === false;
  const phone = tier === 'cards';
  const categorySpec: UbFilterSpec = {
    kind: 'single',
    key: 'category',
    label: t('expenses.filter.category'),
    anyLabel: t('expenses.filter.allCategories'),
    options: categoryOptions,
  };
  const modeSpec: UbFilterSpec = {
    kind: 'single',
    key: 'mode',
    label: t('expenses.filter.mode'),
    anyLabel: t('expenses.filter.allModes'),
    options: modeOptions,
  };
  /* On a phone: the search and ONE Filters button holding the tabs, the
     period, the category and the mode; each default reads as "no filter". */
  const phoneSpecs: UbFilterSpec[] = [
    {
      kind: 'single',
      key: 'tab',
      label: t('expenses.tab.label'),
      anyLabel: t('expenses.tab.all'),
      options: tabs.filter((tab) => tab.value !== 'all'),
    },
    {
      kind: 'single',
      key: 'preset',
      label: t('expenses.period.label'),
      anyLabel: t(`expenses.period.${DEFAULT_EXPENSE_PRESET}`),
      options: presets.filter((p) => p.value !== DEFAULT_EXPENSE_PRESET && p.value !== 'custom'),
    },
    {
      kind: 'dateRange',
      key: 'range',
      label: t('expenses.period.between'),
      fromKey: 'dateFrom',
      toKey: 'dateTo',
      fromLabel: t('expenses.period.from'),
      toLabel: t('expenses.period.to'),
      max: list.today,
    },
    categorySpec,
    modeSpec,
  ];
  const custom = filters.preset === 'custom';
  const phoneValues: UbFilterValues = {
    tab: filters.tab === 'all' ? '' : filters.tab,
    preset: filters.preset === DEFAULT_EXPENSE_PRESET || custom ? '' : filters.preset,
    dateFrom: custom ? filters.dateFrom : '',
    dateTo: custom ? filters.dateTo : '',
    category: filters.categoryId ?? '',
    mode: filters.mode ?? '',
  };
  const applyPhone = (next: UbFilterValues) => {
    const ranged = Boolean(next.dateFrom || next.dateTo);
    list.applyFilters({
      ...filters,
      tab: (next.tab || 'all') as ExpenseTab,
      preset: ranged ? 'custom' : ((next.preset || DEFAULT_EXPENSE_PRESET) as ExpensePreset),
      dateFrom: next.dateFrom || filters.dateFrom,
      dateTo: next.dateTo || filters.dateTo,
      categoryId: next.category || null,
      mode: next.mode ? (next.mode as PaymentMode) : null,
    });
  };
  const searchBox = (
    <UbSearchInput
      value={search}
      onChange={setSearch}
      placeholder={t('expenses.search.placeholder')}
      aria-label={t('expenses.search.label')}
      className={phone ? 'min-w-0 flex-1' : 'w-56'}
    />
  );
  const stats =
    totals && list.rows.length > 0 ? (
      <UbStack gap={2}>
        <SummaryStatGrid storageKey="expenses">
          <UbStatCard
            icon={<Receipt className="h-4 w-4" aria-hidden />}
            /* On the Void tab the figure is money that did NOT go out; calling it
               "Total" there read as spend. */
            label={t(filters.tab === 'void' ? 'expenses.total.voided' : 'expenses.total.label')}
            value={formatInr(totals.amount)}
            subtext={t('expenses.total.count', { count: totals.count })}
          />
        </SummaryStatGrid>
        {totals.byCategory.length > 0 && (
          <UbStack direction="row" align="center" className="flex-wrap gap-2">
            <UbText variant="caption" tone="tertiary">
              {t('expenses.total.top')}
            </UbText>
            {/* The chip carries the NAME only and the figure sits beside it: a
                tag caps its width, and "Salaries ₹5,00…" cut the half of
                the chip that answers "how much". */}
            {totals.byCategory.map((row) => (
              <UbStack key={row.categoryId} direction="row" align="center" className="gap-1">
                <UbTag name={row.name} color={isUbTagColor(row.color) ? row.color : null} />
                <UbText variant="caption" className="ds-num">
                  {formatInr(row.amount)}
                </UbText>
              </UbStack>
            ))}
          </UbStack>
        )}
      </UbStack>
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
      caption={t('expenses.list.caption')}
      storageId="expenses.list"
      page={{
        page: list.page,
        pageSize: list.pageSize,
        total: list.total,
        totalPages: Math.max(Math.ceil(list.total / Math.max(list.pageSize, 1)), 1),
      }}
      onPageChange={list.setPage}
      onRowOpen={openDetail}
      /* An expense is not a person: no initials disc on a card (the tags
         sweep's "initials labelling a tag" defect, not repeated here). */
      cardAvatar={false}
    />
  );

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('expenses.title')}
        actions={
          <>
            {/* Library P0 — Expenses is shared now; the cashbook is the shop's word and
                the shop's screen, so another app's menu never offers it. */}
            {(activeApp === null || activeApp === 'shop') && (
              <UbActionLink
                href={ROUTES.CASHBOOK}
                icon={<BookOpen className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
              >
                {t('cashbook.title')}
              </UbActionLink>
            )}
            {/* IMP-02 — this period and these filters, as a CSV. */}
            {!emptyBook && (
              <ListExportButton
                listPath={expenseExportPath(list.filters)}
                permission="reports.export"
                empty={list.status === 'succeeded' && list.total === 0}
              />
            )}
          </>
        }
        /* Hidden rather than disabled for a role that cannot write (§19.7.5). */
        primaryAction={
          canWrite && !emptyBook ? (
            <UbButton
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              onClick={openDrawer}
              data-testid="expense-add"
            >
              {t('expenses.add')}
            </UbButton>
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
                canWrite && !emptyBook
                  ? {
                      label: t('expenses.add'),
                      icon: <Plus className="h-6 w-6" aria-hidden />,
                      onClick: openDrawer,
                    }
                  : undefined,
            }}
          />
        )}
      />

      <UbStack gap={4} data-testid="expenses-screen">
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
            <UbDateRangePicker<ExpensePreset>
              presets={presets}
              preset={filters.preset}
              onPresetChange={list.setPreset}
              customPreset="custom"
              from={filters.dateFrom}
              to={filters.dateTo}
              onRangeChange={list.setRange}
              max={list.today}
              name="expense-period"
              labels={{
                presets: t('expenses.period.label'),
                from: t('expenses.period.from'),
                to: t('expenses.period.to'),
                apply: t('common.action.apply'),
                close: t('common.action.close'),
              }}
              end={
                <>
                  <UbFilterSelect
                    spec={categorySpec}
                    value={filters.categoryId ?? ''}
                    onChange={(value) => list.setCategory(value || null)}
                    closeLabel={t('common.action.close')}
                  />
                  <UbFilterSelect
                    spec={modeSpec}
                    value={filters.mode ?? ''}
                    onChange={(value) => list.setMode(value ? (value as PaymentMode) : null)}
                    closeLabel={t('common.action.close')}
                  />
                </>
              }
            />
            {stats}
            <UbTabs<ExpenseTab>
              value={filters.tab}
              onValueChange={list.setTab}
              tabs={tabs}
              ariaLabel={t('expenses.tab.label')}
              layout="fit"
              trailing={searchBox}
            >
              {grid}
            </UbTabs>
          </>
        )}
      </UbStack>

      {form.open && <ExpenseFormDrawerLazy form={form} />}
      {form.detail && <ExpenseDetailDrawerLazy form={form} />}
    </UbPageShell>
  );
}
