import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

/**
 * `GET /reports/items/{id}/trade?side=` — the item page's Sales and Purchases
 * tabs: who bought it (or sold it to us), how much, at what rate, when last.
 *
 * `margin` is OPTIONAL everywhere: the server leaves it out for a reader
 * without `reports.financial.read`, and it is never turned into a zero here.
 */
export type TradeSide = 'sales' | 'purchases';

export interface TradeParty {
  readonly id: string;
  readonly name: string;
}

export interface TradeByParty {
  /** Null on the sales side groups every walk-in sale into one row. */
  readonly party: TradeParty | null;
  readonly qty: string;
  readonly amount: string;
  readonly avgRate: string | null;
  readonly documents: number;
  readonly lastDate: string | null;
  readonly margin?: string;
}

export interface TradeLine {
  readonly document: {
    readonly id: string;
    readonly kind: string;
    readonly number: string | null;
    readonly date: string;
  };
  readonly party: TradeParty | null;
  readonly walkInName: string | null;
  readonly qty: string;
  readonly rate: string;
  readonly amount: string;
  /** Null when the line's cost was never known; absent without the permission. */
  readonly margin?: string | null;
}

export interface ItemTrade {
  readonly side: TradeSide;
  readonly byParty: readonly TradeByParty[];
  readonly lines: readonly TradeLine[];
  readonly totals: {
    readonly qty: string;
    readonly amount: string;
    readonly avgRate: string | null;
    readonly margin?: string;
    readonly marginPct?: string | null;
    readonly uncostedLines?: number;
  };
}

interface TradeWire {
  readonly data: {
    readonly side: TradeSide;
    readonly by_party: readonly {
      readonly party: TradeParty | null;
      readonly qty: string;
      readonly amount: string;
      readonly avg_rate: string | null;
      readonly documents: number;
      readonly last_date: string | null;
      readonly margin?: string;
    }[];
    readonly lines: readonly {
      readonly document: TradeLine['document'];
      readonly party: TradeParty | null;
      readonly walk_in_name: string | null;
      readonly qty: string;
      readonly rate: string;
      readonly amount: string;
      readonly margin?: string | null;
    }[];
    readonly totals: {
      readonly qty: string;
      readonly amount: string;
      readonly avg_rate: string | null;
      readonly margin?: string;
      readonly margin_pct?: string | null;
      readonly uncosted_lines?: number;
    };
  };
}

export const getItemTrade = async (
  itemId: string,
  side: TradeSide,
  from: string | null,
  signal?: AbortSignal
): Promise<ItemTrade> => {
  const params = toQueryString({ side, from });
  const response = await api.get<TradeWire>(
    `${API_PATHS.REPORT_ITEM_TRADE(itemId)}${params}`,
    ubConfig({ signal })
  );
  const data = response.data.data;
  return {
    side: data.side,
    byParty: data.by_party.map((row) => ({
      party: row.party,
      qty: row.qty,
      amount: row.amount,
      avgRate: row.avg_rate,
      documents: row.documents,
      lastDate: row.last_date,
      ...(row.margin === undefined ? {} : { margin: row.margin }),
    })),
    lines: data.lines.map((line) => ({
      document: line.document,
      party: line.party,
      walkInName: line.walk_in_name,
      qty: line.qty,
      rate: line.rate,
      amount: line.amount,
      ...(line.margin === undefined ? {} : { margin: line.margin }),
    })),
    totals: {
      qty: data.totals.qty,
      amount: data.totals.amount,
      avgRate: data.totals.avg_rate,
      ...(data.totals.margin === undefined
        ? {}
        : {
            margin: data.totals.margin,
            marginPct: data.totals.margin_pct ?? null,
            uncostedLines: data.totals.uncosted_lines ?? 0,
          }),
    },
  };
};

/** `GET /reports/items/{id}/last-rate` — price memory: the latest bill with this party. */
export interface LastRate {
  readonly rate: string;
  readonly taxInclusive: boolean;
  readonly unitCode: string;
  readonly qty: string;
  readonly document: { readonly id: string; readonly number: string | null; readonly date: string };
}

interface LastRateWire {
  readonly data: {
    readonly rate: string;
    readonly tax_inclusive: boolean;
    readonly unit_code: string;
    readonly qty: string;
    readonly document: LastRate['document'];
  } | null;
}

export const getLastRate = async (
  itemId: string,
  partyId: string,
  side: TradeSide,
  signal?: AbortSignal
): Promise<LastRate | null> => {
  const params = toQueryString({ side, party: partyId });
  const response = await api.get<LastRateWire>(
    `${API_PATHS.REPORT_ITEM_LAST_RATE(itemId)}${params}`,
    // A hint, not the bill: if it cannot be read the line is still writable.
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const data = response.data.data;
  return data
    ? {
        rate: data.rate,
        taxInclusive: data.tax_inclusive,
        unitCode: data.unit_code,
        qty: data.qty,
        document: data.document,
      }
    : null;
};
