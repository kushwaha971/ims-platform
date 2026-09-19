import { API_PATHS } from 'src/api/APIPaths';
import { api } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type { Party, PartyApiRow, PartyListParams, PartyListResult } from '../types/party.types';

/**
 * Part 19 §19.3.4 — the service layer: one exported async function per
 * endpoint, owning the snake_case ⇄ camelCase mapping, the query string and the
 * response typing, returning domain objects rather than `AxiosResponse`.
 *
 * No React, no Redux, no `Ub*`, no `react-intl`.
 */

// ── Wire shapes (snake_case, exactly as Part 22 §22.4 documents them) ────────

interface PartyListApiResponse {
  readonly data: readonly PartyApiRow[];
  readonly meta: {
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
    readonly total_pages: number;
  };
}

/**
 * Maps one wire row to the domain shape.
 *
 * Money stays a STRING on purpose (R-TS-7). `UbAmount` and `view-model/*` parse
 * with decimal.js-light when they need maths.
 */
const toParty = (row: PartyApiRow): Party => ({
  id: row.id,
  name: row.name,
  displayCode: row.display_code,
  mobile: row.mobile,
  isCustomer: row.is_customer,
  isSupplier: row.is_supplier,
  balance: row.balance,
  status: row.status,
  lastActivityAt: row.last_activity_at,
});

/** GET /parties — page-paginated list (Part 32 S0-70's read-only endpoint). */
export const listParties = async (
  params: PartyListParams,
  signal?: AbortSignal
): Promise<PartyListResult> => {
  const query = toQueryString({
    q: params.q || undefined,
    status: params.status,
    ordering: params.ordering,
    page: params.page,
    page_size: params.pageSize,
  });

  const response = await api.get<PartyListApiResponse>(`${API_PATHS.PARTIES}${query}`, { signal });

  return {
    rows: response.data.data.map(toParty),
    meta: {
      page: response.data.meta.page,
      pageSize: response.data.meta.page_size,
      total: response.data.meta.total,
      totalPages: response.data.meta.total_pages,
    },
  };
};
