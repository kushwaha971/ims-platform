import { store } from 'src/redux/store';

import { selectModuleRefusal } from './settingsSlice';
import { fetchSettings, toggleModules } from './settingsThunk';

/**
 * A12 QA finding — the refusal banner under a switch must not outlive the
 * visit. The slice is lazily injected and kept for the session, so without a
 * reset the next visit to Settings (which refetches) opened on a stale "3
 * records are still open" about a refusal the merchant has since resolved.
 */
describe('settingsSlice moduleRefusal', () => {
  const refusal = {
    code: 'module_has_data',
    message: 'This feature still has records that need attention.',
    details: { module: 'sales', count: 2, breakdown: [{ label_id: null, count: 2 }] },
  };

  it('is set by a refused toggle and cleared when Settings loads again', () => {
    store.dispatch({ type: toggleModules.rejected.type, payload: refusal, meta: { arg: [] } });
    expect(selectModuleRefusal(store.getState())).toEqual({
      module: 'sales',
      lines: [{ labelId: null, count: 2 }],
    });
    store.dispatch({ type: fetchSettings.pending.type, meta: { arg: undefined } });
    expect(selectModuleRefusal(store.getState())).toBeNull();
  });

  it('is cleared by the next toggle', () => {
    store.dispatch({ type: toggleModules.rejected.type, payload: refusal, meta: { arg: [] } });
    store.dispatch({ type: toggleModules.pending.type, meta: { arg: [] } });
    expect(selectModuleRefusal(store.getState())).toBeNull();
  });
});
