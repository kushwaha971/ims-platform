import type { ReactNode } from 'react';

import { renderHook } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Provider } from 'react-redux';

import { sessionLoaded, type SessionApp } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { ALL_MESSAGES } from 'src/tests/allMessages';
import type { PermissionCode } from 'src/types/domain.types';

import { useAppWords } from './useAppWords';

/**
 * docs/platform/14 step 6 — a khata is one page whichever app opened it, and it
 * used to badge a reading room's student "Customer". The open app's words win
 * on shared pages; an app with no word of its own gets the shared one.
 */
const mockPath = '/parties/p1';
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  usePathname: () => mockPath,
}));

const APPS: SessionApp[] = [
  { code: 'library', labelId: 'nav.workspace.library', homePath: '/library', order: 10 },
  { code: 'lending', labelId: 'nav.workspace.lending', homePath: '/lending', order: 20 },
  { code: 'shop', labelId: 'nav.workspace.shop', homePath: '/dashboard', order: 90 },
];

const load = (activeApp: string) =>
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'o@x.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Verma', timezone: 'Asia/Kolkata', role: 'owner' },
      tenants: [{ id: 't1', name: 'Verma', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions: [] as PermissionCode[],
      enabledModules: [],
      version: 1,
      apps: APPS,
      activeApp,
    })
  );

const words = () =>
  renderHook(() => useAppWords(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>
        <IntlProvider locale="en" messages={ALL_MESSAGES.en}>
          {children}
        </IntlProvider>
      </Provider>
    ),
  }).result.current;

it.each([
  ['library', 'Student', 'Back to students', '/library/members'],
  ['lending', 'Borrower', 'Back to borrowers', '/lending/borrowers'],
  ['shop', 'Customer', 'Back to customers', undefined],
])('in the %s, a khata says %s', (app, badge, back, href) => {
  load(app);
  const { w, peopleHref } = words();
  expect(w('parties.detail.badge.customer')).toBe(badge);
  expect(w('parties.detail.backToList')).toBe(back);
  expect(peopleHref).toBe(href);
});

it('falls back to the shared word where the app declares none', () => {
  load('library');
  expect(words().w('parties.detail.badge.supplier')).toBe('Supplier');
});
