import { canRepair, canShelve, canWithdraw, copyPlace, shelfLine } from './copyDisplay';

/**
 * F03 — the defects: a withdraw button offered on a copy that is out (the
 * server refuses it with 409, after the merchant has typed a reason), and a
 * title with every copy withdrawn reading "0 of 0 on shelf".
 */
describe('copyDisplay', () => {
  it('offers withdrawal only where the server allows it (BR-7)', () => {
    expect(canWithdraw('available')).toBe(true);
    expect(canWithdraw('in_repair')).toBe(true);
    expect(canWithdraw('lost')).toBe(true);
    expect(canWithdraw('missing')).toBe(true);
    expect(canWithdraw('on_loan')).toBe(false);
    expect(canWithdraw('on_hold_shelf')).toBe(false);
    expect(canWithdraw('withdrawn')).toBe(false);
  });

  it('offers repair from the shelf and the shelf from repair, nothing else', () => {
    expect(canRepair('available')).toBe(true);
    expect(canRepair('on_loan')).toBe(false);
    expect(canShelve('in_repair')).toBe(true);
    expect(canShelve('available')).toBe(false);
  });

  it('says "no copies" rather than "0 of 0"', () => {
    expect(shelfLine({ copiesAvailable: 0, copiesTotal: 0 }).id).toBe('library.title.noCopies');
    expect(shelfLine({ copiesAvailable: 2, copiesTotal: 3 })).toEqual({
      id: 'library.title.onShelf',
      params: { available: 2, total: 3 },
    });
  });

  it('places a copy by its location code, else its free text', () => {
    expect(copyPlace({ location: { id: 'l', code: 'A-3' }, locationText: 'Shelf 2' })).toBe('A-3');
    expect(copyPlace({ location: null, locationText: 'Shelf 2' })).toBe('Shelf 2');
  });
});
