import { store } from 'src/redux/store';

import {
  counterFinished,
  counterModeChanged,
  counterNoted,
  selectLibraryCounter,
} from './libraryCounterSlice';

/**
 * QA B13 — after Finish the counter kept the day's log and the last mode (Return),
 * even in a new session, so the next student met the previous one's list in the
 * wrong mode. Finish now ends the visit: no member, no log, back to Issue.
 */
it('Finish clears the member, the log and the mode', () => {
  store.dispatch(counterModeChanged('return'));
  store.dispatch(
    counterNoted({ id: 'r1', kind: 'info', code: 'B-1', at: '2026-10-12T10:00:00Z', title: 'Book' })
  );
  expect(selectLibraryCounter(store.getState()).session).toHaveLength(1);
  store.dispatch(counterFinished());
  const state = selectLibraryCounter(store.getState());
  expect(state.session).toEqual([]);
  expect(state.mode).toBe('issue');
  expect(state.member).toBeNull();
});
