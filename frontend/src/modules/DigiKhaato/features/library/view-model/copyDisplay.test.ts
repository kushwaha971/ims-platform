import {
  canRepair,
  canShelve,
  canWithdraw,
  copyPlace,
  historyCaption,
  shelfLine,
} from './copyDisplay';

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

describe('historyCaption', () => {
  const t = ((id: string) =>
    ({
      'library.event.withdrawn': 'Withdrawn',
      'library.copy.status.withdrawn': 'Withdrawn',
      'library.event.created': 'Added to the register',
      'library.copy.status.available': 'On shelf',
    })[id] ?? id) as unknown as Parameters<typeof historyCaption>[2];

  it('does not repeat the word the event already says', () => {
    expect(
      historyCaption({ reasonCode: 'withdrawn', toStatus: 'withdrawn' }, '04/10/2026', t)
    ).toBe('04/10/2026');
    expect(historyCaption({ reasonCode: 'created', toStatus: 'available' }, '04/10/2026', t)).toBe(
      '04/10/2026 · On shelf'
    );
  });
});
