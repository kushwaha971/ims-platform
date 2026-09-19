import { cardModel, dropOrder, MAX_CARD_META, visibleColumns } from './columnModel';

import type { UbDataGridColumn } from './types';

/**
 * The priority list IS the design, so it is asserted as data rather than
 * inspected as markup: these cases fail the moment somebody changes what a
 * narrow table keeps, whichever file they change it in.
 */
interface Row {
  readonly id: string;
}

const text = (value: string) => () => value;

const COLUMNS: readonly UbDataGridColumn<Row>[] = [
  { id: 'name', header: 'Customer', priority: 1, cardSlot: 'title', cell: text('n') },
  { id: 'balance', header: 'Balance', priority: 1, cardSlot: 'trailing', cell: text('b') },
  { id: 'activity', header: 'Last entry', priority: 2, cardSlot: 'meta', cell: text('a') },
  { id: 'contact', header: 'Contact', priority: 3, cardSlot: 'meta', cell: text('c') },
  { id: 'status', header: 'Status', priority: 4, cardSlot: 'none', cell: text('s') },
];

const ids = (columns: readonly UbDataGridColumn<Row>[]) => columns.map((column) => column.id);

describe('visibleColumns', () => {
  it('keeps every column at `full` — the desktop reader wants the whole record', () => {
    expect(ids(visibleColumns(COLUMNS, 'full'))).toEqual([
      'name',
      'balance',
      'activity',
      'contact',
      'status',
    ]);
  });

  it('keeps only priority 1 and 2 at `compact`, dropping from the lowest priority up', () => {
    expect(ids(visibleColumns(COLUMNS, 'compact'))).toEqual(['name', 'balance', 'activity']);
  });

  it('takes a different cutoff when a screen has room for a fourth column', () => {
    expect(ids(visibleColumns(COLUMNS, 'compact', 3))).toEqual([
      'name',
      'balance',
      'activity',
      'contact',
    ]);
  });

  it('drops `cardSlot: none` columns from the card rendering and nothing else', () => {
    expect(ids(visibleColumns(COLUMNS, 'cards'))).toEqual([
      'name',
      'balance',
      'activity',
      'contact',
    ]);
  });
});

describe('dropOrder', () => {
  it('gives up the lowest priority first, and right-to-left within a priority', () => {
    expect(dropOrder(COLUMNS)).toEqual(['status', 'contact', 'activity', 'balance', 'name']);
  });

  it('never gives up a priority-1 column before a priority-2 one', () => {
    const order = dropOrder(COLUMNS);
    expect(order.indexOf('activity')).toBeLessThan(order.indexOf('name'));
    expect(order.indexOf('activity')).toBeLessThan(order.indexOf('balance'));
  });
});

describe('cardModel', () => {
  it('resolves the three slots the card rendering reads', () => {
    const model = cardModel(visibleColumns(COLUMNS, 'cards'));
    expect(model.title?.id).toBe('name');
    expect(model.trailing?.id).toBe('balance');
    expect(ids([...model.meta])).toEqual(['activity', 'contact']);
  });

  it('caps the supporting facts, so a card cannot grow a fourth line', () => {
    const many: readonly UbDataGridColumn<Row>[] = [
      ...COLUMNS,
      { id: 'extra', header: 'Extra', priority: 3, cardSlot: 'meta', cell: text('e') },
    ];
    expect(cardModel(many).meta).toHaveLength(MAX_CARD_META);
  });
});
