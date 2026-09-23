import type { ReactNode } from 'react';

import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

import {
  endSessionLocally,
  sessionLoaded,
  type SessionPayload,
} from 'src/redux/slice/sessionSlice';
import { rootReducer } from 'src/redux/store';

import { passwordLogin } from '../redux/authThunk';
import { fetchSession, logout } from '../redux/sessionThunk';

import { useAuthRedirect } from './useAuthRedirect';

import type { AuthResult } from '../types/auth.types';

/**
 * N1-P1 (QA, 24 Sep 2026, High/P1) — after a session ended by COOKIE EXPIRY,
 * signing in never left /login on a phone.
 *
 * Measured on the live stack: `POST /auth/login` 200, `GET /auth/me` 200, and
 * then the address bar went to `/login?next=%2Fdashboard` again with NO RSC
 * request — Next's client router resolved `/dashboard` from its route cache,
 * which had learned "`/dashboard` is `/login?next=…`" from `proxy.ts`'s
 * redirect while the cookies were gone (a logo re-prefetch on the phone, or a
 * first-time navigation). `router.refresh()` keeps that cache, so a sign-in
 * that follows an earlier session in the same document has to finish with a
 * document load; the first session in a document still navigates client-side.
 *
 * Each test gets its own store, because the flag under test is exactly the
 * thing that survives every reset the shared store offers.
 */

const replace = jest.fn();
let mockSearch = 'next=%2Fparties%3Fq%3Dsharma';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
  usePathname: () => '/login',
}));

jest.mock('src/utils/documentNavigation', () => ({ replaceDocument: jest.fn() }));
const { replaceDocument } = jest.requireMock('src/utils/documentNavigation') as {
  replaceDocument: jest.Mock;
};

jest.mock('../api/authService');
const authService = jest.requireMock('../api/authService') as { getSession: jest.Mock };

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';

const SESSION_B: SessionPayload = {
  user: {
    id: 'user-b',
    name: 'Bharat',
    email: 'bharat@b.test',
    mobile: null,
    locale: 'en',
    mustChangePassword: false,
    passwordExpiresAt: null,
  },
  activeTenant: { id: TENANT_B, name: 'Bharat Kirana', timezone: 'Asia/Kolkata' },
  tenants: [{ id: TENANT_B, name: 'Bharat Kirana', timezone: 'Asia/Kolkata' }],
  permissions: [],
  enabledModules: [],
  version: 1,
};

const RESULT_A = {
  userId: 'user-a',
  name: 'Anita',
  email: 'anita@a.test',
  mobile: null,
  locale: 'en',
  isNew: false,
  hasPassword: true,
  mustChangePassword: false,
  passwordExpiresAt: null,
  activeTenantId: TENANT_A,
  tenants: [
    {
      id: TENANT_A,
      name: 'Anita Stores',
      timezone: 'Asia/Kolkata',
      role: 'owner',
      isDefault: true,
      status: 'active',
      membershipId: 'm-a',
      onboardingStep: 4,
    },
  ],
  permissions: [],
  enabledModules: [],
} as unknown as AuthResult;

const makeStore = () => configureStore({ reducer: rootReducer });
type TestStore = ReturnType<typeof makeStore>;

const mount = (store: TestStore) =>
  renderHook(() => useAuthRedirect(), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });

/** The server said yes: exactly the action `useLogin`'s submit produces. */
const signIn = (store: TestStore, result: AuthResult = RESULT_A) =>
  act(() => {
    store.dispatch(
      passwordLogin.fulfilled(result, 'req-1', {
        email: result.email,
        password: 'correct horse',
        deviceLabel: 'Browser',
      })
    );
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = 'next=%2Fparties%3Fq%3Dsharma';
  authService.getSession.mockReturnValue(new Promise(() => undefined));
});

describe('the first sign-in in a document', () => {
  it('navigates client-side to ?next= and bootstraps the session — no reload', () => {
    const store = makeStore();
    mount(store);

    signIn(store);

    expect(replace).toHaveBeenCalledWith('/parties?q=sharma');
    expect(replaceDocument).not.toHaveBeenCalled();
    expect(authService.getSession).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.result).toBeNull();
  });
});

describe('a sign-in after an earlier session in the same document (N1-P1)', () => {
  it('after cookie expiry and the login screen’s teardown, loads a new document', () => {
    const store = makeStore();
    store.dispatch(sessionLoaded(SESSION_B));
    // What `useLogin` does when it opens over the expired session.
    endSessionLocally(store.dispatch);
    mount(store);

    signIn(store);

    expect(replaceDocument).toHaveBeenCalledWith('/parties?q=sharma');
    // The poisoned route cache is exactly what a client navigation would read.
    expect(replace).not.toHaveBeenCalled();
    // The new document bootstraps its own session.
    expect(authService.getSession).not.toHaveBeenCalled();
    expect(store.getState().auth.result).toBeNull();
  });

  it('after sign-out, loads a new document too', () => {
    const store = makeStore();
    store.dispatch(sessionLoaded(SESSION_B));
    store.dispatch(logout.fulfilled(undefined, 'req-0'));
    mount(store);

    signIn(store);

    expect(replaceDocument).toHaveBeenCalledWith('/parties?q=sharma');
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps ?next= safety: a foreign or protocol-relative next falls back to the default', () => {
    for (const next of ['https%3A%2F%2Fevil.test%2F', '%2F%2Fevil.test', '%2F%5Cevil.test']) {
      jest.clearAllMocks();
      mockSearch = `next=${next}`;
      const store = makeStore();
      store.dispatch(sessionLoaded(SESSION_B));
      endSessionLocally(store.dispatch);
      const view = mount(store);

      signIn(store);

      expect(replaceDocument).toHaveBeenCalledWith('/dashboard');
      view.unmount();
    }
  });

  it('routes the non-app outcomes (FR-9) by document load as well', () => {
    const store = makeStore();
    store.dispatch(sessionLoaded(SESSION_B));
    endSessionLocally(store.dispatch);
    mount(store);

    signIn(store, { ...RESULT_A, mustChangePassword: true } as AuthResult);

    expect(replaceDocument).toHaveBeenCalledWith('/set-password');
  });
});

describe('the flag behind it', () => {
  it('survives every way this slice ends a session, and a new sign-in', () => {
    const store = makeStore();
    expect(store.getState().session.heldInThisDocument).toBe(false);

    store.dispatch(sessionLoaded(SESSION_B));
    endSessionLocally(store.dispatch);
    expect(store.getState().session.heldInThisDocument).toBe(true);

    store.dispatch(fetchSession.rejected(null, 'probe', undefined));
    expect(store.getState().session.heldInThisDocument).toBe(true);

    store.dispatch(logout.fulfilled(undefined, 'req-0'));
    store.dispatch(
      passwordLogin.fulfilled(RESULT_A, 'req-1', {
        email: 'anita@a.test',
        password: 'x',
        deviceLabel: 'Browser',
      })
    );
    expect(store.getState().session.status).toBe('anonymous');
    expect(store.getState().session.user).toBeNull();
    expect(store.getState().session.heldInThisDocument).toBe(true);
  });

  it('is not set by a session probe that finds nobody (a fresh load of /login)', () => {
    const store = makeStore();
    store.dispatch(fetchSession.rejected(null, 'probe', undefined));
    endSessionLocally(store.dispatch); // the transport's failed-refresh path
    expect(store.getState().session.heldInThisDocument).toBe(false);
  });
});
