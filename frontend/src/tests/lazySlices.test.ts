import { store } from 'src/redux/store';

/**
 * CR-134 — route-local slices are injected, not registered.
 *
 * The defect this prevents is quiet: somebody adds `statement: statementReducer`
 * back to store.ts "to be safe", every test still passes, and every route —
 * the login screen included — downloads the statement's reducer again. The
 * bundle gate would catch the kilobytes one day; this catches the line.
 */
describe('lazily registered slices', () => {
  it('are absent from the store until their route imports them', () => {
    const keys = Object.keys(store.getState());

    expect(keys).not.toContain('statement');
    expect(keys).not.toContain('ledgerAging');
    // EXP-01 / EXP-03 — the expense screens' three slices ship with their routes.
    expect(keys).not.toContain('expenseList');
    expect(keys).not.toContain('expenseForm');
    expect(keys).not.toContain('cashbook');
    // The shell's own slices are still there.
    expect(keys).toEqual(expect.arrayContaining(['session', 'partyList', 'ledgerForm']));
  });

  it('answer their initial state before the first action, then join the store', async () => {
    const { selectStatementRows } =
      await import('modules/DigiKhaato/features/ledger/redux/statementSlice');

    // Injected but not yet dispatched through: the selector must not throw.
    expect(selectStatementRows(store.getState())).toEqual([]);

    store.dispatch({ type: 'test/touch' });
    expect(Object.keys(store.getState())).toContain('statement');
  });
});
