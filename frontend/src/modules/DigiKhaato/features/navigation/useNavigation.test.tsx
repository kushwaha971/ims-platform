import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { MODULE_CODES } from 'src/types/domain.types';

import { NAV_ITEMS } from './sidebarConfig';
import { useNavigation } from './useNavigation';

/**
 * Owner rule — "don't show unbuilt features". Bills, Purchases, Payments and
 * Reports used to sit in the sidebar as greyed "Soon" rows; a row whose page
 * does not exist (`ready` absent) is now left out entirely, even for an owner
 * who has every module and every permission.
 */
describe('useNavigation', () => {
  beforeAll(() => {
    store.dispatch(
      sessionLoaded({
        user: {
          id: 'u1',
          name: 'Suresh Kumar',
          email: 'suresh@kirana.test',
          mobile: null,
          locale: 'en',
          mustChangePassword: false,
          passwordExpiresAt: null,
        },
        activeTenant: { id: 't1', name: 'Kumar Kirana', timezone: 'Asia/Kolkata', role: 'owner' },
        tenants: [{ id: 't1', name: 'Kumar Kirana', timezone: 'Asia/Kolkata', role: 'owner' }],
        permissions: NAV_ITEMS.map((item) => item.permission) as never,
        enabledModules: [...MODULE_CODES],
        version: 1,
      })
    );
  });

  const listed = () =>
    renderHook(() => useNavigation(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    }).result.current;

  it('lists no row whose page is not built (no "Soon" rows)', () => {
    /* A row is listed exactly when it is `ready`. This used to assert only the
       unbuilt half and to require at least one unbuilt row; RPT-01/02 made the
       last two rows (Dashboard, Reports) real, so every row is checked both
       ways instead — a built row that went missing fails here too. */
    const keys = listed().sections.flatMap((section) => section.items.map((item) => item.key));
    for (const item of NAV_ITEMS) {
      expect({ key: item.key, listed: keys.includes(item.key) }).toEqual({
        key: item.key,
        listed: Boolean(item.ready),
      });
    }
    expect(keys).toContain('parties');
    expect(keys).toContain('dashboard');
    expect(keys).toContain('reports');
  });

  it('keeps unbuilt rows out of the bottom nav too', () => {
    for (const item of listed().bottomNav) expect(item.ready).toBe(true);
  });
});
