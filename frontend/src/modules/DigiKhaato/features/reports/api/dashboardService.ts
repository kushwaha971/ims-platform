import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  ActivityItem,
  CountAmount,
  DashboardData,
  DashboardTiles,
  SourceRef,
} from '../types/reports.types';

/** RPT-01 FR-1 — the one read the dashboard makes. */

interface CountAmountWire {
  readonly count: number;
  readonly amount: string;
}

interface DashboardWire {
  readonly data: {
    readonly as_of: string;
    readonly generated_at: string;
    readonly tiles: {
      readonly to_collect?: { readonly amount: string };
      readonly to_pay?: { readonly amount: string };
      readonly due_today?: CountAmountWire;
      readonly overdue?: CountAmountWire & { readonly invoices?: CountAmountWire };
      readonly upcoming_7d?: CountAmountWire;
      readonly today_sales?: {
        readonly amount: string;
        readonly count: number;
        readonly yesterday_amount: string;
      };
      readonly cash_in_hand?: { readonly amount: string };
      readonly low_stock?: { readonly count: number; readonly out_count: number };
    };
    readonly recent_activity: readonly {
      readonly id: string;
      readonly type: string;
      readonly at: string;
      readonly number: string | null;
      readonly amount: string | null;
      readonly direction: 'debit' | 'credit' | null;
      readonly party: { readonly id: string; readonly name: string } | null;
      readonly source: {
        readonly kind: SourceRef['kind'];
        readonly id: string;
        readonly party_id: string | null;
      };
    }[];
    readonly top_debtors: readonly {
      readonly id: string;
      readonly name: string;
      readonly balance: string;
      readonly collection_date: string | null;
      readonly mobile_masked: string | null;
      readonly mobile: string | null;
    }[];
    readonly low_stock_items: readonly {
      readonly id: string;
      readonly name: string;
      readonly on_hand: string;
      readonly reorder_point: string | null;
      readonly unit: string;
      readonly stock_status: 'low' | 'out';
    }[];
    readonly first_use: {
      readonly has_party: boolean;
      readonly has_item: boolean;
      readonly has_document: boolean;
      readonly has_upi: boolean;
    };
  };
  readonly meta?: { readonly cached?: boolean };
}

const countAmount = (wire: CountAmountWire): CountAmount => ({
  count: wire.count,
  amount: wire.amount,
});

/** Every key copied only when present: an omitted tile stays omitted (FR-6). */
const toTiles = (wire: DashboardWire['data']['tiles']): DashboardTiles => ({
  ...(wire.to_collect ? { toCollect: { amount: wire.to_collect.amount } } : {}),
  ...(wire.to_pay ? { toPay: { amount: wire.to_pay.amount } } : {}),
  ...(wire.due_today ? { dueToday: countAmount(wire.due_today) } : {}),
  ...(wire.overdue
    ? {
        overdue: {
          count: wire.overdue.count,
          amount: wire.overdue.amount,
          ...(wire.overdue.invoices ? { invoices: countAmount(wire.overdue.invoices) } : {}),
        },
      }
    : {}),
  ...(wire.upcoming_7d ? { upcoming7d: countAmount(wire.upcoming_7d) } : {}),
  ...(wire.today_sales
    ? {
        todaySales: {
          amount: wire.today_sales.amount,
          count: wire.today_sales.count,
          yesterdayAmount: wire.today_sales.yesterday_amount,
        },
      }
    : {}),
  ...(wire.cash_in_hand ? { cashInHand: { amount: wire.cash_in_hand.amount } } : {}),
  ...(wire.low_stock
    ? { lowStock: { count: wire.low_stock.count, outCount: wire.low_stock.out_count } }
    : {}),
});

const toActivity = (row: DashboardWire['data']['recent_activity'][number]): ActivityItem => ({
  id: row.id,
  type: row.type,
  at: row.at,
  number: row.number,
  amount: row.amount,
  direction: row.direction,
  party: row.party,
  source: { kind: row.source.kind, id: row.source.id, partyId: row.source.party_id },
});

/**
 * `refresh` is FR-8's refresh icon: the server recomputes rather than serving
 * its sixty-second snapshot.
 */
export const getDashboard = async (
  options: { readonly refresh?: boolean } = {},
  signal?: AbortSignal
): Promise<DashboardData> => {
  const query = toQueryString({ refresh: options.refresh ? 'true' : null });
  const response = await api.get<DashboardWire>(
    `${API_PATHS.REPORT_DASHBOARD}${query}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  return {
    asOf: data.as_of,
    generatedAt: data.generated_at,
    cached: Boolean(meta?.cached),
    tiles: toTiles(data.tiles),
    recentActivity: data.recent_activity.map(toActivity),
    topDebtors: data.top_debtors.map((row) => ({
      id: row.id,
      name: row.name,
      balance: row.balance,
      collectionDate: row.collection_date,
      mobileMasked: row.mobile_masked,
      mobile: row.mobile,
    })),
    lowStockItems: data.low_stock_items.map((row) => ({
      id: row.id,
      name: row.name,
      onHand: row.on_hand,
      reorderPoint: row.reorder_point,
      unit: row.unit,
      stockStatus: row.stock_status,
    })),
    firstUse: {
      hasParty: data.first_use.has_party,
      hasItem: data.first_use.has_item,
      hasDocument: data.first_use.has_document,
      hasUpi: data.first_use.has_upi,
    },
  };
};
