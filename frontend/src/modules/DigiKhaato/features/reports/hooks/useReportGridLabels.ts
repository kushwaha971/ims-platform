'use client';

import { useMemo } from 'react';

import type { UbDataGridLabels } from 'src/design-system/UbDataGrid';
import { useTranslation } from 'src/hooks/useTranslation';

/**
 * The grid's own copy for every table on the three tax reports — written once,
 * because the GST summary alone renders eight grids and eight copies of this
 * block would be eight chances to translate "Page 1 of 3" differently.
 */
export const useReportGridLabels = (): UbDataGridLabels => {
  const { t } = useTranslation();
  return useMemo<UbDataGridLabels>(
    () => ({
      loading: t('reports.grid.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      // No selection on a report; ICU plurals are resolved against a real zero.
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('reports.grid.selectAll'),
      selectRow: t('reports.grid.selectRow', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('reports.grid.open', { name: '{name}' }),
    }),
    [t]
  );
};
