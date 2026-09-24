import { API_PATHS } from 'src/api/APIPaths';
import { api, __resetTransportState } from 'src/api/AxiosInstances';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { hideSnackbar } from 'src/redux/slice/snackbarSlice';
import { store } from 'src/redux/store';

import { switchTenant } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';

import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

/**
 * Defect M3, end to end: the REAL store, the REAL `authService.switchTenant`
 * and the REAL response interceptor, with only the network replaced.
 *
 * Switching business from /switch showed "This business was switched in
 * another tab. Reloading…" and reloaded /switch instead of opening Customers.
 * The switch is two requests — `POST /auth/switch-tenant`, then `GET /auth/me`
 * — and the store adopts the new business only when both have answered, so the
 * second one echoed a tenant the store had not heard of yet and the stale-tab
 * guard took the tab's own switch for somebody else's.
 */

const TENANT_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const TENANT_C = 'cccccccc-0000-4000-8000-00000000000c';

const row = (id: string, name: string) => ({
  id,
  membership_id: `m-${id}`,
  name,
  role: 'owner',
  is_default: id === TENANT_A,
  status: 'active',
  onboarding_step: 4,
});

const meBody = (active: string) => ({
  data: {
    user: { id: 'u-1', email: 'o@x.test', full_name: 'Owner', mobile: null, locale: 'en' },
    tenants: [row(TENANT_A, 'Asha Stores'), row(TENANT_B, 'Bharat Kirana')],
    active_tenant_id: active,
    active_tenant: {
      id: active,
      name: active === TENANT_A ? 'Asha Stores' : 'Bharat Kirana',
      timezone: 'Asia/Kolkata',
      status: 'active',
      onboarding_step: 4,
      enabled_modules: ['parties', 'ledger'],
    },
    permissions: ['parties.party.read'],
    ver: 1,
  },
});

/** The server as it behaves: every response echoes the tenant the cookie is on. */
let cookieTenant = TENANT_A;
const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  let data: unknown = { data: [] };
  if (config.url === API_PATHS.AUTH_SWITCH_TENANT) {
    cookieTenant = (JSON.parse(String(config.data)) as { tenant_id: string }).tenant_id;
    data = { data: null };
  } else if (config.url === API_PATHS.AUTH_ME) {
    data = meBody(cookieTenant);
  }
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'x-tenant-id': cookieTenant },
    config,
  };
};

const realAdapter = api.defaults.adapter;

beforeEach(() => {
  jest.useFakeTimers(); // the stale-tab reload is deferred; it must never run here
  __resetTransportState();
  api.defaults.adapter = adapter;
  cookieTenant = TENANT_A;
  store.dispatch(hideSnackbar());
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u-1',
        name: 'Owner',
        email: 'o@x.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: TENANT_A, name: 'Asha Stores', timezone: 'Asia/Kolkata' },
      tenants: [
        { id: TENANT_A, name: 'Asha Stores', timezone: 'Asia/Kolkata' },
        { id: TENANT_B, name: 'Bharat Kirana', timezone: 'Asia/Kolkata' },
      ],
      permissions: [],
      enabledModules: ['parties'],
      version: 1,
    })
  );
});

afterEach(() => {
  api.defaults.adapter = realAdapter;
  __resetTransportState();
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('switches business in this tab without calling it a switch in another tab', async () => {
  /** M3: the thunk must fulfil onto the new business and nothing may say
   *  "switched in another tab" — that message (and the reload behind it) was
   *  the tab refusing its own switch. */
  const result = await store.dispatch(switchTenant({ tenantId: TENANT_B }));

  expect(result.type).toBe(switchTenant.fulfilled.type);
  expect(store.getState().session.activeTenant?.id).toBe(TENANT_B);
  expect(store.getState().snackbar.id).not.toBe('tenant.switcher.staleTab');
});

it('still reloads when another tab moves the cookie afterwards', async () => {
  /** The other half of M3's fix: the tab's own switch is trusted, a foreign
   *  one is not. Another tab moving the cookie to a third business must still
   *  discard the response and warn. */
  await store.dispatch(switchTenant({ tenantId: TENANT_B }));
  cookieTenant = TENANT_C;

  await expect(api.get(API_PATHS.PARTIES)).rejects.toMatchObject({
    code: 'unknown',
    message: 'This business was switched in another tab.',
  });
  expect(store.getState().snackbar.id).toBe('tenant.switcher.staleTab');
});
