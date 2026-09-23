import { api, __resetTransportState } from 'src/api/AxiosInstances';
import { registerTransportHost, transportHost } from 'src/api/transportBridge';
import { resetAllFeatureState } from 'src/redux/actions';
import { sessionExpired, sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { LoginPageContent } from 'modules/DigiKhaato/features/auth/components/LoginPageContent';
import { resetAuth } from 'modules/DigiKhaato/features/auth/redux/authSlice';
import { passwordLogin } from 'modules/DigiKhaato/features/auth/redux/authThunk';
import { fetchSession } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';
import { ledgerTimelineOpened } from 'modules/DigiKhaato/features/ledger/redux/ledgerEntrySlice';
import { partyDetailOpened } from 'modules/DigiKhaato/features/parties/redux/partyDetailSlice';
import { filtersChanged } from 'modules/DigiKhaato/features/parties/redux/partyListSlice';

/**
 * NEW-1 (QA retest, 24 Sep 2026) — a session that ends by COOKIE EXPIRY was
 * never torn down.
 *
 * FB-3 made the 401 path (`onSessionExpired`) tear down as logout does. But
 * when `ub_access` and `ub_refresh` simply DISAPPEAR, no request 401s: the
 * Next proxy sees no cookie on the next route change and answers with a
 * redirect to /login, inside the same JS runtime. `onSessionExpired` never
 * ran, so the previous tenant's session summary and every feature slice sat
 * behind the login form. Signing in as a user of ANOTHER tenant then painted
 * the shell with the old business name, and `/auth/me` — echoing the new
 * tenant as `X-Tenant-Id` — met the stale-tab guard still holding the old
 * one: "This business was switched in another tab. Reloading…", a hard reload
 * back to /login, and the user had to sign in twice. On a shared counter PC
 * the previous business's name was on screen for the next person.
 *
 * Two fixes, each asserted here on its own, because either alone leaves a way
 * through: the login screen tears down a session it finds in the store, and a
 * successful sign-in clears the previous session summary before anything can
 * compare the new tenant against it.
 */

jest.mock('modules/DigiKhaato/features/auth/api/authService');
const authService = jest.requireMock('modules/DigiKhaato/features/auth/api/authService') as {
  passwordLogin: jest.Mock;
  getSession: jest.Mock;
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams('next=%2Fdashboard'),
  usePathname: () => '/login',
}));

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';

/** A signed-in user of tenant B, with feature state of their own. */
const signInAsTenantB = (): void => {
  store.dispatch(
    sessionLoaded({
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
      permissions: ['parties.party.read', 'ledger.entry.read'],
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
  store.dispatch(filtersChanged({ q: 'sharma' }));
  store.dispatch(partyDetailOpened('party-of-b'));
  store.dispatch(ledgerTimelineOpened('party-of-b'));
};

const featureState = () => {
  const state = store.getState();
  return { partyList: state.partyList, partyDetail: state.partyDetail, ledger: state.ledgerEntry };
};

const AUTH_RESULT_A = {
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
};

/** Drives the real success interceptor with a synthetic `/auth/me` response. */
const answerAuthMe = async (tenantId: string): Promise<boolean> => {
  const handlers = (
    api.interceptors.response as unknown as {
      handlers: readonly { fulfilled: (value: unknown) => unknown }[];
    }
  ).handlers;
  const fulfilled = handlers[0]?.fulfilled;
  if (!fulfilled) throw new Error('no response interceptor registered');
  try {
    await fulfilled({
      data: { data: {} },
      headers: { 'x-tenant-id': tenantId },
      config: { url: '/auth/me', method: 'get' },
    });
    return true;
  } catch {
    return false;
  }
};

const realHost = transportHost();
const onTenantMismatch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetAuth());
  store.dispatch(sessionExpired());
  store.dispatch(resetAllFeatureState());
  // The real host — the guard reads the real store — with the reload stubbed.
  if (realHost) registerTransportHost({ ...realHost, onTenantMismatch });
  authService.getSession.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  __resetTransportState();
  if (realHost) registerTransportHost(realHost);
});

describe('the login screen, opened over a session the cookies no longer back', () => {
  it('tears the previous session down exactly as logout does', () => {
    signInAsTenantB();
    const dirty = featureState();
    expect(store.getState().session.activeTenant?.id).toBe(TENANT_B);

    renderWithProviders(<LoginPageContent />);

    const session = store.getState().session;
    expect(session.status).toBe('anonymous');
    expect(session.user).toBeNull();
    expect(session.activeTenant).toBeNull();
    const clean = featureState();
    expect(clean.partyList).not.toEqual(dirty.partyList);
    expect(clean.partyList.filters.q).toBe('');
    expect(clean.partyDetail.id).toBeNull();
    expect(clean.ledger.partyId).toBeNull();
  });

  it('leaves a session that is still being bootstrapped alone', () => {
    /* A hard load of /login: `SessionBootstrap`'s probe is in flight and the
       store holds nothing yet. Tearing that down would race the probe. */
    store.dispatch({ type: 'session/sessionRequested' });
    const before = store.getState().session;

    renderWithProviders(<LoginPageContent />);

    expect(store.getState().session).toEqual(before);
  });

  it('then signs in as tenant A without the "switched in another tab" reload', async () => {
    signInAsTenantB();
    renderWithProviders(<LoginPageContent />);
    authService.passwordLogin.mockResolvedValue(AUTH_RESULT_A);

    await store.dispatch(
      passwordLogin({ email: 'anita@a.test', password: 'correct horse', deviceLabel: 'Browser' })
    );

    expect(await answerAuthMe(TENANT_A)).toBe(true);
    expect(onTenantMismatch).not.toHaveBeenCalled();
  });
});

describe('the session probe that finds no session', () => {
  it('tears the features down too, when the store still held a session', () => {
    /* Not a 401 — those reach `onSessionExpired` through the failed refresh.
       This is the probe failing any other way, which sends the user to a login
       screen that finds the session already `anonymous` and so has nothing to
       tear down; the features must not be left behind it. */
    signInAsTenantB();
    const dirty = featureState();

    store.dispatch(
      fetchSession.rejected(null, 'probe', undefined, {
        code: 'network_error',
        message: 'offline',
        details: {},
        requestId: null,
        status: 0,
        warnings: [],
      } as unknown as Parameters<typeof fetchSession.rejected>[3])
    );

    expect(store.getState().session.status).toBe('anonymous');
    expect(featureState().partyList).not.toEqual(dirty.partyList);
    expect(featureState().partyDetail.id).toBeNull();
    expect(featureState().ledger.partyId).toBeNull();
  });
});

describe('a successful sign-in never compares the new tenant against a stale one', () => {
  it('clears the previous session summary, even with no login screen in between', async () => {
    /* The login screen's teardown is one door; sign-up and reset-confirm are
       two more that produce a session. Whatever the route, the sign-in itself
       must not leave tenant B in the store for `/auth/me` to be judged by. */
    signInAsTenantB();
    authService.passwordLogin.mockResolvedValue(AUTH_RESULT_A);

    await store.dispatch(
      passwordLogin({ email: 'anita@a.test', password: 'correct horse', deviceLabel: 'Browser' })
    );

    expect(store.getState().session.activeTenant).toBeNull();
    expect(store.getState().session.user).toBeNull();
    expect(await answerAuthMe(TENANT_A)).toBe(true);
    expect(onTenantMismatch).not.toHaveBeenCalled();
  });

  it('still catches a genuinely stale tab once the new session is known', async () => {
    /* The guard is not switched off — it compares against the session that
       `/auth/me` establishes, and a response for some third tenant after that
       is the real stale-tab case it exists for. */
    store.dispatch(
      sessionLoaded({
        user: {
          id: 'user-a',
          name: 'Anita',
          email: 'anita@a.test',
          mobile: null,
          locale: 'en',
          mustChangePassword: false,
          passwordExpiresAt: null,
        },
        activeTenant: { id: TENANT_A, name: 'Anita Stores', timezone: 'Asia/Kolkata' },
        tenants: [],
        permissions: [],
        enabledModules: [],
        version: 1,
      })
    );

    expect(await answerAuthMe(TENANT_B)).toBe(false);
    expect(onTenantMismatch).toHaveBeenCalledWith(TENANT_B);
  });
});
