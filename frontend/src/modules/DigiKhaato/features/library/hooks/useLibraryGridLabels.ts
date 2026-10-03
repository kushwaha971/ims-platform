'use client';

import { useMemo } from 'react';

import type { UbDataGridLabels } from 'src/design-system/UbDataGrid';
import { useTranslation } from 'src/hooks/useTranslation';

/** The data grid's words for every library list — written once. */
export const useLibraryGridLabels = (): UbDataGridLabels => {
  const { t } = useTranslation();
  return useMemo<UbDataGridLabels>(
    () => ({
      loading: t('library.list.loading'),
      pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
      previousPage: t('common.grid.previousPage'),
      nextPage: t('common.grid.nextPage'),
      pageSize: t('common.grid.pageSize'),
      goToPage: t('common.grid.goToPage', { page: '{page}' }),
      ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
      selectedCount: t('common.grid.selectedCount', { count: 0 }),
      selectAll: t('library.list.selectAll'),
      selectRow: t('library.list.selectRow', { name: '{name}' }),
      showing: t('common.grid.showing'),
      columns: t('common.grid.columns'),
      showAllColumns: t('common.grid.showAllColumns'),
      sortBy: t('common.grid.sortBy', { column: '{column}' }),
      sortedAscending: t('common.grid.sortedAscending'),
      sortedDescending: t('common.grid.sortedDescending'),
      openRow: t('library.list.open', { name: '{name}' }),
    }),
    [t]
  );
};
