import { api } from 'src/api/AxiosInstances';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { createItemColumns } from '../components/ItemListColumns';
import { filtersFromQuery, queryFromFilters } from '../hooks/useItemList';
import { toShortLines } from '../hooks/useStockAdjustment';

import { listItems, lookupItemByBarcode, toItemBody, type ItemRowWire } from './itemService';
import { toAdjustmentBody } from './stockService';

import type { ItemFormValues } from '../types/item.types';

/**
 * The inventory wire half. The transport is stubbed at the module boundary
 * (§19.13.3) and the fixtures follow the INV FRD shapes, so a contract change
 * on either side breaks this test.
 */

const ROW: ItemRowWire = {
  id: 'i1',
  name: 'Basmati Rice',
  sku: 'BASMATI-RICE-0001',
  barcode: '8901234567890',
  item_type: 'goods',
  category: null,
  unit: { id: 'u1', code: 'KGS', allow_decimal: true },
  selling_price: '60.00',
  purchase_price: '44.00',
  tax_code: 'GST5',
  track_stock: true,
  on_hand: '5.000',
  avg_cost: '44.0000',
  reorder_point: '10.000',
  stock_status: 'low',
  stock_value: '220.00',
  status: 'active',
  match_field: 'barcode',
  updated_at: '2026-09-24T10:00:00Z',
};

const FORM: ItemFormValues = {
  name: '  Basmati Rice ',
  itemType: 'goods',
  categoryId: '',
  unitId: 'u1',
  sku: '',
  barcode: '',
  hsnSac: '1006',
  taxCode: 'GST5',
  taxInclusiveSelling: false,
  sellingPrice: '60.00',
  purchasePrice: null,
  mrp: null,
  trackStock: true,
  reorderPoint: '10',
  description: '',
  openingQty: '5',
  openingCost: '44',
  openingAsOf: '2026-04-01',
};

describe('listItems', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps the tab to ?stock= and keeps money and quantities as strings', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: [ROW],
        meta: {
          page: 1,
          page_size: 25,
          total: 1,
          total_pages: 1,
          totals: { items: 1, stock_value: '220.00' },
          counts: { all: 1, in: 0, low: 1, out: 0 },
        },
      },
    });
    const result = await listItems({
      q: '',
      tab: 'low',
      type: '',
      categoryId: 'c1',
      status: 'active',
      ordering: 'on_hand',
      page: 1,
    });
    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toContain('stock=low');
    expect(url).toContain('category_id=c1');
    expect(url).not.toContain('q=');
    expect(result.totals.stockValue).toBe('220.00');
    expect(result.rows[0]?.onHand).toBe('5.000');
    expect(result.rows[0]?.matchField).toBe('barcode');
  });
});

describe('valuation withheld (INV-08 EC-4, QA: stock value leaked to staff)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps omitted cost keys and a null total to null — never to zero', async () => {
    /* Protects the staff view: the server OMITS purchase_price, avg_cost and
       stock_value without `reports.financial.read`; a mapper that read them as
       "0.00" would print ₹0.00 where the screen must print nothing. */
    const { purchase_price: _p, avg_cost: _a, stock_value: _v, ...withheld } = ROW;
    jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: [withheld],
        meta: {
          page: 1,
          page_size: 25,
          total: 1,
          total_pages: 1,
          totals: { items: 1, stock_value: null },
          counts: { all: 1, in: 0, low: 1, out: 0 },
          valuation_visible: false,
        },
      },
    });
    const result = await listItems({
      q: '',
      tab: 'all',
      type: '',
      categoryId: '',
      status: 'active',
      ordering: 'name',
      page: 1,
    });
    expect(result.totals.stockValue).toBeNull();
    expect(result.rows[0]?.purchasePrice).toBeNull();
    expect(result.rows[0]?.avgCost).toBeNull();
    expect(result.rows[0]?.stockValue).toBeNull();
  });

  it('leaves purchase_price out of a PATCH when the item was read without it', () => {
    /* Protects the real price: the form never knew it, and "0" would wipe it. */
    expect(toItemBody(FORM, { withOpening: false, omitPurchasePrice: true })).not.toHaveProperty(
      'purchase_price'
    );
    expect(toItemBody(FORM, { withOpening: false })).toHaveProperty('purchase_price');
  });

  it('drops the Purchase column for a member who may not see costs', () => {
    const t = ((key: string) => key) as TranslateFn;
    const ids = (valuation: boolean): string[] =>
      createItemColumns({ t, tier: 'full', valuation }).map((column) => column.id);
    expect(ids(true)).toContain('purchasePrice');
    expect(ids(false)).not.toContain('purchasePrice');
  });
});

describe('lookupItemByBarcode', () => {
  afterEach(() => jest.restoreAllMocks());

  it('answers null for an unknown code instead of throwing', async () => {
    // An unknown scan offers "Create item with this barcode"; a throw would
    // toast an error at a merchant who did nothing wrong.
    jest.spyOn(api, 'get').mockRejectedValue({ response: { status: 404 } });
    await expect(lookupItemByBarcode('0000')).resolves.toBeNull();
  });

  it('still throws a real failure', async () => {
    jest.spyOn(api, 'get').mockRejectedValue({ response: { status: 500 } });
    await expect(lookupItemByBarcode('0000')).rejects.toBeTruthy();
  });
});

describe('toItemBody', () => {
  it('sends blanks as null and the opening stock only on create', () => {
    const body = toItemBody(FORM, { withOpening: true });
    expect(body.name).toBe('Basmati Rice');
    expect(body.sku).toBeNull(); // the server allocates it (BR-2)
    expect(body.barcode).toBeNull();
    expect(body.purchase_price).toBe('0');
    expect(body.opening_stock).toEqual({ qty: '5', unit_cost: '44', as_of: '2026-04-01' });
    expect(toItemBody(FORM, { withOpening: false })).not.toHaveProperty('opening_stock');
  });

  it('strips stock fields from a service (a service holds no stock)', () => {
    const body = toItemBody(
      { ...FORM, itemType: 'service', barcode: '123' },
      { withOpening: true }
    );
    expect(body.track_stock).toBe(false);
    expect(body.reorder_point).toBeNull();
    expect(body.barcode).toBeNull();
    expect(body).not.toHaveProperty('opening_stock');
  });
});

describe('toAdjustmentBody', () => {
  it('sends a cost only for stock coming in', () => {
    // An outbound line is valued at the average by the server; a cost sent
    // with it would be ignored at best and misread at worst.
    const body = toAdjustmentBody(
      {
        adjustmentDate: '2026-09-24',
        reason: 'damage',
        note: ' broken ',
        lines: [
          {
            itemId: 'a',
            itemName: 'A',
            unitCode: 'NOS',
            allowDecimal: false,
            onHand: '5',
            avgCost: '1',
            mode: 'by',
            qty: '-2',
            unitCost: '9',
          },
          {
            itemId: 'b',
            itemName: 'B',
            unitCode: 'NOS',
            allowDecimal: false,
            onHand: '5',
            avgCost: '1',
            mode: 'by',
            qty: '2',
            unitCost: '9',
          },
        ],
      },
      (index) => (index === 0 ? '-2.000' : '2.000')
    );
    expect(body.note).toBe('broken');
    expect(body.lines[0]).toEqual({ item_id: 'a', qty: '-2.000', unit_cost: null });
    expect(body.lines[1]).toEqual({ item_id: 'b', qty: '2.000', unit_cost: '9' });
  });
});

describe('the list filters in the address bar', () => {
  it('round-trips every filter and leaves defaults out of the URL', () => {
    // A bookmarked "/items?tab=low" must reopen the Low tab, and a plain
    // "/items" must not grow "?status=active&ordering=name" on first load.
    const filters = filtersFromQuery(new URLSearchParams('tab=low&type=goods&category=c1&page=2'));
    expect(filters).toEqual({
      q: '',
      tab: 'low',
      type: 'goods',
      categoryId: 'c1',
      status: 'active',
      ordering: 'on_hand',
      page: 2,
    });
    expect(queryFromFilters(filters)).toBe('tab=low&type=goods&category=c1&page=2');
    expect(queryFromFilters(filtersFromQuery(new URLSearchParams('')))).toBe('');
  });

  it('refuses values it does not know instead of sending them to the server', () => {
    const filters = filtersFromQuery(
      new URLSearchParams('tab=weird&type=x&status=deleted&ordering=drop&page=-4')
    );
    expect(filters.tab).toBe('all');
    expect(filters.type).toBe('');
    expect(filters.status).toBe('active');
    expect(filters.ordering).toBe('name');
    expect(filters.page).toBe(1);
  });
});

describe('toShortLines', () => {
  it('reads every short line of a 409 insufficient_stock, keyed by item', () => {
    // INV-06 BR-4: the drawer marks ALL short lines at once, so a merchant
    // fixes three counts in one pass instead of discovering them one post at
    // a time. The drawer matches by item id because blank rows are dropped
    // before posting and the server's index is into what was SENT.
    expect(
      toShortLines({
        lines: [
          {
            index: 0,
            item_id: 'b',
            item_name: 'Soap',
            requested: '-5.000',
            available: '2.000',
            unit_code: 'NOS',
          },
        ],
        allow_negative_stock: false,
      })
    ).toEqual([
      {
        index: 0,
        itemId: 'b',
        itemName: 'Soap',
        requested: '-5.000',
        available: '2.000',
        unitCode: 'NOS',
      },
    ]);
    expect(toShortLines({})).toEqual([]);
  });
});
