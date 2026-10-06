import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

/**
 * Shop gap §1.6 — `/price-lists`: a named rate card ("Wholesale") for a group
 * of customers. A list's rate for an item is the rate pinned on the list, else
 * the item's selling price moved by the list's percentage.
 */
export interface PriceList {
  readonly id: string;
  readonly name: string;
  /** "-5.00" is 5% below the selling price. */
  readonly adjustPercent: string;
  readonly rateCount: number;
  readonly partyCount: number;
}

export interface PinnedRate {
  readonly item: {
    readonly id: string;
    readonly name: string;
    readonly sku: string;
    readonly unitCode: string;
  };
  readonly sellingPrice: string;
  /** What the list's percentage alone would charge — what pinning overrides. */
  readonly fromPercent: string;
  readonly rate: string;
}

export interface PriceListDetail extends PriceList {
  readonly rates: readonly PinnedRate[];
}

export interface PartyRates {
  readonly priceList: { readonly id: string; readonly name: string } | null;
  readonly rates: Readonly<
    Record<
      string,
      { readonly rate: string; readonly pinned: boolean; readonly taxInclusive: boolean }
    >
  >;
}

interface ListWire {
  readonly id: string;
  readonly name: string;
  readonly adjust_percent: string;
  readonly rate_count: number;
  readonly party_count: number;
}

const fromWire = (row: ListWire): PriceList => ({
  id: row.id,
  name: row.name,
  adjustPercent: row.adjust_percent,
  rateCount: row.rate_count,
  partyCount: row.party_count,
});

export interface PriceListInput {
  readonly name: string;
  readonly adjustPercent: string;
}

const toWire = (input: Partial<PriceListInput>) => ({
  ...(input.name === undefined ? {} : { name: input.name }),
  ...(input.adjustPercent === undefined ? {} : { adjust_percent: input.adjustPercent || '0' }),
});

export const listPriceLists = async (signal?: AbortSignal): Promise<PriceList[]> => {
  const response = await api.get<{ data: ListWire[] }>(API_PATHS.PRICE_LISTS, ubConfig({ signal }));
  return response.data.data.map(fromWire);
};

export const createPriceList = async (input: PriceListInput): Promise<PriceList> => {
  const response = await api.post<{ data: ListWire }>(API_PATHS.PRICE_LISTS, toWire(input));
  return fromWire(response.data.data);
};

export const updatePriceList = async (
  id: string,
  input: Partial<PriceListInput>
): Promise<PriceList> => {
  const response = await api.patch<{ data: ListWire }>(API_PATHS.PRICE_LIST(id), toWire(input));
  return fromWire(response.data.data);
};

export const deletePriceList = async (id: string): Promise<void> => {
  await api.delete(API_PATHS.PRICE_LIST(id));
};

export const getPriceList = async (id: string, signal?: AbortSignal): Promise<PriceListDetail> => {
  const response = await api.get<{
    data: ListWire & {
      rates: readonly {
        item: { id: string; name: string; sku: string; unit_code: string };
        selling_price: string;
        from_percent: string;
        rate: string;
      }[];
    };
  }>(API_PATHS.PRICE_LIST_RATES(id), ubConfig({ signal }));
  const data = response.data.data;
  return {
    ...fromWire(data),
    rates: data.rates.map((row) => ({
      item: {
        id: row.item.id,
        name: row.item.name,
        sku: row.item.sku,
        unitCode: row.item.unit_code,
      },
      sellingPrice: row.selling_price,
      fromPercent: row.from_percent,
      rate: row.rate,
    })),
  };
};

/** Pin an item's rate on a list; `null` unpins it. */
export const setPinnedRate = async (
  listId: string,
  itemId: string,
  rate: string | null
): Promise<void> => {
  await api.put(API_PATHS.PRICE_LIST_RATE(listId), { item_id: itemId, rate });
};

/** Put a party on a list, or with `null` take it off. */
export const assignPriceList = async (
  partyId: string,
  priceListId: string | null
): Promise<{ id: string; name: string } | null> => {
  const response = await api.put<{ data: { id: string; name: string } | null }>(
    API_PATHS.PRICE_LIST_ASSIGN,
    { party_id: partyId, price_list_id: priceListId }
  );
  return response.data.data;
};

export const getPartyRates = async (
  partyId: string,
  itemIds: readonly string[],
  signal?: AbortSignal
): Promise<PartyRates> => {
  const params = toQueryString({ party: partyId, items: itemIds.join(',') });
  const response = await api.get<{
    data: {
      price_list: { id: string; name: string } | null;
      rates: Record<string, { rate: string; pinned: boolean; tax_inclusive: boolean }>;
    };
  }>(
    `${API_PATHS.PRICE_LIST_FOR_PARTY}${params}`,
    // The bill still has the item's own price if this cannot be read.
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const data = response.data.data;
  return {
    priceList: data.price_list,
    rates: Object.fromEntries(
      Object.entries(data.rates).map(([id, r]) => [
        id,
        { rate: r.rate, pinned: r.pinned, taxInclusive: r.tax_inclusive },
      ])
    ),
  };
};
