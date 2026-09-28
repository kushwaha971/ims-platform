import { ROUTES } from 'src/routes';

import type { GstQuery, GstRateRow } from '../types/taxReports.types';

/**
 * RPT-07 FR-13 — "any number can be defended": a rate-wise row opens the
 * sales register at LINE level for the same period, filtered to the row's
 * tax code and supply (CR-RPT-2's `tax_code` / `inter_state`), so the lines
 * behind the figure are one tap away and sum to it.
 */
export const gstDrillHref = (
  query: GstQuery,
  row: Pick<GstRateRow, 'taxCode' | 'isInterState'>
): string => {
  const search = new URLSearchParams({
    period: 'custom',
    from: query.dateFrom,
    to: query.dateTo,
    level: 'line',
    tax_code: row.taxCode,
    inter_state: String(row.isInterState),
  });
  return `${ROUTES.REPORTS_SALES_REGISTER}?${search.toString()}`;
};
