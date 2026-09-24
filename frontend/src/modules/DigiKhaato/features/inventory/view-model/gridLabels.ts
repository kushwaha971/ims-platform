import type { UbDataGridLabels } from 'src/design-system/UbDataGrid';
import type { TranslateFn } from 'src/hooks/useTranslation';

/**
 * The grid's chrome labels for the inventory screens — written once instead of
 * four times. `loadingId` and `openId` are the only per-screen strings; the
 * placeholders (`{page}`, `{name}` …) are filled by the grid itself.
 */
export const inventoryGridLabels = (
  t: TranslateFn,
  loadingId: string,
  openId: string
): UbDataGridLabels => ({
  loading: t(loadingId),
  pageOf: t('common.grid.pageOf', { page: '{page}', pages: '{pages}' }),
  previousPage: t('common.grid.previousPage'),
  nextPage: t('common.grid.nextPage'),
  pageSize: t('common.grid.pageSize'),
  goToPage: t('common.grid.goToPage', { page: '{page}' }),
  ofTotal: t('common.grid.ofTotal', { total: '{total}' }),
  selectedCount: t('common.grid.selectedCount', { count: 0 }),
  selectAll: t('items.list.selectAll'),
  selectRow: t('items.list.selectRow', { name: '{name}' }),
  showing: t('common.grid.showing'),
  columns: t('common.grid.columns'),
  showAllColumns: t('common.grid.showAllColumns'),
  sortBy: t('common.grid.sortBy', { column: '{column}' }),
  sortedAscending: t('common.grid.sortedAscending'),
  sortedDescending: t('common.grid.sortedDescending'),
  openRow: t(openId, { name: '{name}' }),
});
