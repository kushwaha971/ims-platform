'use client';

import { useCallback, useMemo } from 'react';

import { UbButton, UbDataGrid, UbPageHeader, UbPageShell } from 'src/design-system';
import type { UbDataGridEmptyStates, UbGridState } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useAdminPartners } from '../hooks/useAdmin';

import { adminGridLabels, createPartnerColumns } from './adminGrid';

import type { AdminPartnerRow } from '../types/admin.types';

/**
 * PLT-14 FR-4 — the partners and how many businesses each carries. Read-only
 * here: creating and editing a partner is WLB-02's form (Django admin at MVP).
 */
export function AdminPartnersPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const { state, refetch } = useAdminPartners();
  const columns = useMemo(() => createPartnerColumns(t), [t]);
  const labels = useMemo(() => adminGridLabels(t), [t]);
  const emptyStates = useMemo<UbDataGridEmptyStates>(
    () => ({
      firstUse: {
        title: t('admin.partners.empty.title'),
        description: t('admin.partners.empty.body'),
      },
      filtered: { title: t('admin.partners.empty.title') },
      error: {
        title: t('admin.error.title'),
        description: state.partnersError?.message ?? t('admin.error.body'),
        requestId: state.partnersError?.requestId ?? null,
        requestIdLabel: t('common.error.reference'),
        action: (
          <UbButton variant="secondary" onClick={refetch}>
            {t('common.action.retry')}
          </UbButton>
        ),
      },
    }),
    [t, state.partnersError, refetch]
  );
  let gridState: UbGridState = 'rows';
  if (state.partnersStatus === 'idle' || state.partnersStatus === 'loading') gridState = 'loading';
  else if (state.partnersStatus === 'failed') gridState = 'error';
  else if (state.partners.length === 0) gridState = 'empty';
  const rowId = useCallback((row: AdminPartnerRow) => row.id, []);
  const rowName = useCallback((row: AdminPartnerRow) => row.name, []);
  // One page: partners are a handful of rows, and the endpoint is not paged.
  const page = useMemo(
    () => ({
      page: 1,
      pageSize: Math.max(state.partners.length, 1),
      total: state.partners.length,
      totalPages: 1,
    }),
    [state.partners.length]
  );
  const noPaging = useCallback(() => undefined, []);

  return (
    <UbPageShell
      header={
        <UbPageHeader title={t('admin.partners.title')} subtitle={t('admin.partners.subtitle')} />
      }
    >
      <UbDataGrid
        rows={state.partners}
        columns={columns}
        rowId={rowId}
        rowName={rowName}
        state={gridState}
        labels={labels}
        emptyStates={emptyStates}
        caption={t('admin.partners.caption')}
        page={page}
        onPageChange={noPaging}
        busy={state.partnersStatus === 'refreshing'}
      />
    </UbPageShell>
  );
}
