'use client';

import { useCallback, useMemo } from 'react';

import dynamic from 'next/dynamic';

import { Download } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbDataGrid,
  UbDateRangePicker,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbSelect,
  UbStack,
  UbText,
} from 'src/design-system';
import type { UbDataGridEmptyStates, UbDataGridLabels, UbGridState } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useAuditLog } from '../hooks/useAuditLog';
import {
  AUDIT_GROUPS,
  type AuditGroup,
  type AuditPeriod,
  type AuditRow,
} from '../types/audit.types';
import { actionLabel } from '../view-model/auditDisplay';

import { createAuditColumns } from './AuditColumns';

const AuditDetailDrawer = dynamic(
  () => import('./AuditDetailDrawer').then((module) => module.AuditDetailDrawer),
  { ssr: false }
);

const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100];
const ALL = '__all__';

/**
 * PLT-08 — Settings → Activity log (owner, admin, accountant; §12).
 *
 * Opens on TODAY (FR-3), because the question is "what did my staff do
 * today", and the answer a year-long list gives to it is scrolling. The
 * period sits on the right like every screen's scope (docs/DESIGN-SYSTEM.md
 * §3); who and what are the two selects beside it; the search is the grid's.
 *
 * Export downloads exactly the filtered rows (AC-3) through a plain link, so
 * the browser's own download UI runs and the session cookie carries it.
 */
export function AuditLogPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const log = useAuditLog();
  const { rows, meta, status, error, filters, refetch } = log;

  const columns = useMemo(() => createAuditColumns(t), [t]);

  const labels = useMemo<UbDataGridLabels>(
    () => ({
      loading: t('audit.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      // No selection on this grid; an honest zero, never a '{count}' string
      // fed to an ICU plural (the party list once rendered "NaN selected").
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('audit.select.all'),
      selectRow: t('audit.select.row', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('audit.open', { name: '{name}' }),
    }),
    [t]
  );

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: filters.period === 'today' ? t('audit.empty.today') : t('audit.empty.period'),
        description: t('audit.empty.body'),
      },
      filtered: {
        title: t('audit.empty.filtered.title'),
        description: t('audit.empty.filtered.body'),
        action: (
          <UbButton variant="secondary" onClick={log.clearFilters}>
            {t('common.action.clearFilters')}
          </UbButton>
        ),
      },
      error: {
        title: t('audit.error.title'),
        description: error?.message ?? t('audit.error.body'),
        requestId: error?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, error, refetch, filters.period, log.clearFilters]
  );

  const gridState: UbGridState =
    status === 'loading' || status === 'idle'
      ? 'loading'
      : status === 'failed'
        ? 'error'
        : rows.length === 0
          ? log.isFiltered
            ? 'filtered-empty'
            : 'empty'
          : 'rows';

  const periodPresets = useMemo(
    () =>
      (['today', 'last7', 'last30', 'custom'] as const).map((value) => ({
        value,
        label: t(`audit.period.${value}`),
      })),
    [t]
  );
  const actorOptions = useMemo(
    () => [
      { value: ALL, label: t('audit.filter.actor.all') },
      ...log.actors.map((actor) => ({
        value: actor.id,
        label: actor.isFormerMember
          ? t('audit.filter.actor.former', { name: actor.name ?? '' })
          : (actor.name ?? ''),
      })),
    ],
    [t, log.actors]
  );
  const groupOptions = useMemo(
    () => [
      { value: ALL, label: t('audit.filter.action.all') },
      ...AUDIT_GROUPS.map((group) => ({ value: group, label: t(`audit.group.${group}`) })),
    ],
    [t]
  );

  const handleActor = useCallback(
    (value: string) => log.setActor(value === ALL ? null : value),
    [log]
  );
  const handleGroup = useCallback(
    (value: string) => log.setGroup(value === ALL ? null : (value as AuditGroup)),
    [log]
  );
  const handlePeriod = useCallback((value: AuditPeriod) => log.setPeriod(value), [log]);
  const handlePageSize = useCallback((size: number) => log.setPage(1, size), [log]);
  const rowId = useCallback((row: AuditRow) => row.id, []);
  // QA D5 — the row's name (the card's accessible name and "Select …") is the
  // action in words, never the raw code; its lowercase first letter was what
  // the card's initials disc used to show.
  const rowName = useCallback(
    (row: AuditRow) => row.entityLabel ?? actionLabel(row.action, t),
    [t]
  );

  const header = (
    <UbPageHeader
      title={t('audit.title')}
      subtitle={t('audit.subtitle')}
      actions={
        <UbActionLink
          href={log.exportUrl}
          variant="outlineNeutral"
          iconOnly="mobile"
          icon={<Download aria-hidden className="h-4 w-4" />}
        >
          {t('audit.export')}
        </UbActionLink>
      }
    />
  );

  return (
    <UbPageShell header={header}>
      <UbStack gap={4}>
        <UbDateRangePicker
          presets={periodPresets}
          preset={filters.period}
          onPresetChange={handlePeriod}
          customPreset="custom"
          from={filters.dateFrom}
          to={filters.dateTo}
          onRangeChange={log.setRange}
          max={log.today}
          name="audit-period"
          labels={{
            presets: t('audit.filter.period'),
            from: t('audit.filter.from'),
            to: t('audit.filter.to'),
          }}
          end={
            <UbStack direction="row" gap={2} wrap>
              <UbSelect
                value={filters.actorId ?? ALL}
                onChange={handleActor}
                options={actorOptions}
                aria-label={t('audit.filter.actor')}
                className="w-44"
              />
              <UbSelect
                value={filters.group ?? ALL}
                onChange={handleGroup}
                options={groupOptions}
                aria-label={t('audit.filter.action')}
                className="w-40"
              />
            </UbStack>
          }
        />

        <UbDataGrid
          rows={rows}
          columns={columns}
          rowId={rowId}
          rowName={rowName}
          state={gridState}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('audit.caption')}
          page={meta}
          onPageChange={log.setPage}
          onPageSizeChange={handlePageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onRowOpen={log.openRow}
          cardAvatar={false}
          busy={status === 'refreshing'}
          search={
            <UbSearchInput
              value={log.search}
              onChange={log.setSearch}
              placeholder={t('audit.search.placeholder')}
              aria-label={t('audit.search.label')}
            />
          }
        />

        <UbText variant="caption" tone="tertiary">
          {t('audit.retention')}
        </UbText>
      </UbStack>

      {log.selected && <AuditDetailDrawer log={log} />}
    </UbPageShell>
  );
}
