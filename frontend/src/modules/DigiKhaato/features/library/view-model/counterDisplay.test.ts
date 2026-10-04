import { looksLikeCode } from '../redux/libraryCounterThunk';

import {
  canUndo,
  readMode,
  touchedLoans,
  readSession,
  rememberMode,
  saveSession,
} from './counterDisplay';

import type { CounterRow } from '../types/counter.types';

const ROW: CounterRow = {
  id: 'r1',
  kind: 'issued',
  code: '4513',
  at: '2026-10-04T10:00:00Z',
  loanId: 'l1',
  issuedOn: '2026-10-04',
};

describe('counterDisplay', () => {
  it('lets an issue be undone only the same day (D20)', () => {
    expect(canUndo(ROW, '2026-10-04')).toBe(true);
    expect(canUndo(ROW, '2026-10-05')).toBe(false);
    expect(canUndo({ ...ROW, kind: 'returned' }, '2026-10-04')).toBe(false);
    // QA-F05-2 — returned again in the same session: no Undo.
    const returned: CounterRow = { ...ROW, id: 'r2', kind: 'returned' };
    expect(canUndo(ROW, '2026-10-04', touchedLoans([returned, ROW]))).toBe(false);
  });

  it('tells a scanned code from a typed name', () => {
    expect(looksLikeCode('4513')).toBe(true);
    expect(looksLikeCode('M-0043')).toBe(true);
    expect(looksLikeCode('asha k')).toBe(false);
  });

  it('remembers the mode and keeps the session per tenant and day', () => {
    window.localStorage.clear();
    expect(readMode()).toBe('issue');
    rememberMode('return');
    expect(readMode()).toBe('return');
    saveSession('t1', '2026-10-04', [ROW]);
    expect(readSession('t1', '2026-10-04')).toEqual([ROW]);
    expect(readSession('t1', '2026-10-05')).toEqual([]);
    expect(readSession('t2', '2026-10-04')).toEqual([]);
  });
});
