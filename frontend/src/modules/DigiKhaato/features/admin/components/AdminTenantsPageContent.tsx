'use client';

import { useCallback, useMemo } from 'react';

import { useRouter } from 'next/navigation';

import {
  UbButton,
  UbDataGrid,
  UbFilterBar,
  UbFilterChip,
  UbFilterChipGroup,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbStack,
  UbStatCard,
  UbStatGrid,
} from 'src/design-system';
import type { UbDataGridEmptyStates, UbGridState } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { adminTenantPath } from 'src/routes';

import { useAdminTenants } from '../hooks/useAdmin';
import { ADMIN_TENANT_STATUSES, type AdminTenantRow } from '../types/admin.types';

import { adminGridLabels, createTenantColumns } from './adminGrid';

const PAGE_SIZE_OPTIONS: readonly number[] = [25, 50, 100];
const EMPTY_PAGE = { page: 1, pageSize: 25, total: 0, totalPages: 1 };

/**
 * PLT-14 FR-2 / US-1 — every business on the platform, searchable by name,
 * GSTIN, owner email or id, filterable by status. A row opens the tenant card.
 */
export function AdminTenantsPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const list = useAdminTenants();
  const { state } = list;
  const columns = useMemo(() => createTenantColumns(t), [t]);
  const labels = useMemo(() => adminGridLabels(t), [t]);
  const filtered = Boolean(state.filters.q.trim() || state.filters.status);

  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('admin.tenants.empty.title'),
        description: t('admin.tenants.empty.body'),
      },
      filtered: {
        title: t('admin.tenants.filtered.title'),
        description: t('admin.tenants.filtered.body'),
      },
      error: {
        title: t('admin.error.title'),
        description: state.tenantsError?.message ?? t('admin.error.body'),
        requestId: state.tenantsError?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={list.refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, state.tenantsError, list.refetch]
  );

  let gridState: UbGridState = 'rows';
  if (state.tenantsStatus === 'idle' || state.tenantsStatus === 'loading') gridState = 'loading';
  else if (state.tenantsStatus === 'failed') gridState = 'error';
  else if (state.tenants.length === 0) gridState = filtered ? 'filtered-empty' : 'empty';

  const rowId = useCallback((row: AdminTenantRow) => row.id, []);
  const rowName = useCallback((row: AdminTenantRow) => row.name, []);
  const openRow = useCallback(
    (row: AdminTenantRow) => router.push(adminTenantPath(row.id)),
    [router]
  );
  const handlePageSize = useCallback((size: number) => list.setPage(1, size), [list]);
  const overview = state.overview;

  return (
    <UbPageShell
      header={
        <UbPageHeader title={t('admin.tenants.title')} subtitle={t('admin.tenants.subtitle')} />
      }
    >
      <UbStack gap={4}>
        {overview ? (
          <UbStatGrid label={t('admin.tenants.stats')}>
            <UbStatCard label={t('admin.stat.total')} value={String(overview.total)} />
            <UbStatCard label={t('admin.status.active')} value={String(overview.active)} />
            <UbStatCard label={t('admin.status.suspended')} value={String(overview.suspended)} />
            <UbStatCard
              label={t('admin.status.pending_deletion')}
              value={String(overview.pendingDeletion)}
            />
            <UbStatCard label={t('admin.stat.partners')} value={String(overview.partners)} />
          </UbStatGrid>
        ) : null}
        <UbFilterBar>
          <UbFilterChipGroup label={t('admin.tenants.column.status')}>
            {ADMIN_TENANT_STATUSES.map((status) => (
              <UbFilterChip
                key={status}
                label={t(`admin.status.${status}`)}
                pressed={state.filters.status === status}
                onToggle={(next) => list.setStatus(next ? status : null)}
              />
            ))}
          </UbFilterChipGroup>
        </UbFilterBar>
        <UbDataGrid
          rows={state.tenants}
          columns={columns}
          rowId={rowId}
          rowName={rowName}
          state={gridState}
          labels={labels}
          emptyStates={emptyStates}
          caption={t('admin.tenants.caption')}
          page={state.tenantsMeta ?? EMPTY_PAGE}
          onPageChange={list.setPage}
          onPageSizeChange={handlePageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onRowOpen={openRow}
          busy={state.tenantsStatus === 'refreshing'}
          search={
            <UbSearchInput
              value={list.search}
              onChange={list.setSearch}
              placeholder={t('admin.tenants.search.placeholder')}
              aria-label={t('admin.tenants.search.label')}
            />
          }
        />
      </UbStack>
    </UbPageShell>
  );
}
