import { api } from 'src/api/AxiosInstances';

import {
  confirmPasswordReset,
  getSession,
  passwordLogin,
  register,
  requestPasswordReset,
  setPassword,
} from './authService';

/**
 * PLT-02 / CR-2026-09-19-A's wire half. The transport is stubbed at the module
 * boundary (§19.13.3, no MSW) and the fixture bodies are copied from Part 22
 * §22.2 and from `selectors/session_payload.py`, so a contract change breaks
 * this test and the backend's together.
 *
 * What is asserted is only what the service OWNS: the path, the request body's
 * snake_case spelling, and the mapping of the response onto the domain shape.
 * Nothing here asserts behaviour that belongs to the slice.
 */
const AUTH_BODY = {
  data: {
    user: {
      id: 'u1',
      name: 'Ramesh',
      email: 'ramesh@example.com',
      mobile: '+919876543210',
      locale: 'hi',
      is_new: false,
      has_password: true,
    },
    tenants: [
      {
        id: 't1',
        name: 'Sharma General Store',
        role: 'owner',
        is_default: true,
        status: 'active',
        membership_id: 'm1',
        onboarding_step: 4,
      },
    ],
    active_tenant_id: 't1',
    permissions: ['parties.party.read'],
    enabled_modules: ['parties'],
  },
};

describe('authService — CR-2026-09-19-A registration', () => {
  afterEach(() => jest.restoreAllMocks());

  it('posts the address, the password and the name to /auth/register', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: AUTH_BODY });

    const result = await register({
      email: 'ramesh@example.com',
      password: 'kirana2026',
      name: 'Ramesh',
      deviceLabel: 'Chrome on Android',
    });

    expect(post.mock.calls[0]?.[0]).toBe('/auth/register');
    expect(post.mock.calls[0]?.[1]).toEqual({
      email: 'ramesh@example.com',
      password: 'kirana2026',
      // `full_name` is what `platform_user` calls it (Part 21 §21.3.1).
      full_name: 'Ramesh',
      device_label: 'Chrome on Android',
    });
    expect(result.userId).toBe('u1');
    expect(result.email).toBe('ramesh@example.com');
  });

  it('omits the name entirely when it was left blank (PLT-03 BR-7)', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: AUTH_BODY });

    await register({ email: 'ramesh@example.com', password: 'kirana2026' });

    expect(post.mock.calls[0]?.[1]).toEqual({
      email: 'ramesh@example.com',
      password: 'kirana2026',
    });
  });

  /**
   * CR-2026-09-19-E — was "suppresses the global toast — a taken address
   * belongs under the field", asserting `suppressErrorSnackbar: true` on this
   * request. It no longer sets it, and that is the change: a taken address is a
   * `validation_error` and `shouldToast` excludes that code for the WHOLE
   * application, so the field still owns it — while the 500s and timeouts this
   * blanket flag was also silencing now reach the single snackbar channel.
   * src/tests/globalErrorChannel.test.tsx asserts both halves.
   */
  it('does NOT opt out of the global toast — the exceptions are by error code', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: AUTH_BODY });

    await register({ email: 'ramesh@example.com', password: 'kirana2026' });

    const config = post.mock.calls[0]?.[2] as { suppressErrorSnackbar?: boolean } | undefined;
    expect(config?.suppressErrorSnackbar).toBeUndefined();
  });

  it('treats a user with no name as a new user with an empty one (FR-5)', async () => {
    jest.spyOn(api, 'post').mockResolvedValue({
      data: {
        data: {
          user: { id: 'u2', email: 'new@example.com', locale: 'en', is_new: true },
          tenants: [],
          active_tenant_id: null,
          permissions: [],
        },
      },
    });

    const result = await register({ email: 'new@example.com', password: 'kirana2026' });

    expect(result.name).toBe('');
    expect(result.isNew).toBe(true);
    // CR-2026-09-19-A — an account that has never given a number is normal.
    expect(result.mobile).toBeNull();
    expect(result.tenants).toEqual([]);
    expect(result.enabledModules).toEqual([]);
  });
});

describe('authService — PLT-02 password', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the identity as `email`, and only as `email`', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: AUTH_BODY });

    await passwordLogin({ email: 'ramesh@example.com', password: 'kirana2026' });

    expect(post.mock.calls[0]?.[0]).toBe('/auth/login');
    // No `mobile` key at all: CR-2026-09-19-A removed the identifier branch, so
    // there is nothing left that could send a number the user did not type.
    expect(post.mock.calls[0]?.[1]).toEqual({
      email: 'ramesh@example.com',
      password: 'kirana2026',
    });
  });

  it('maps the login body onto the domain shape the slice stores', async () => {
    jest.spyOn(api, 'post').mockResolvedValue({ data: AUTH_BODY });

    const result = await passwordLogin({ email: 'ramesh@example.com', password: 'kirana2026' });

    expect(result.email).toBe('ramesh@example.com');
    expect(result.mobile).toBe('+919876543210');
    expect(result.hasPassword).toBe(true);
    expect(result.activeTenantId).toBe('t1');
    expect(result.tenants[0]).toMatchObject({
      id: 't1',
      role: 'owner',
      isDefault: true,
      status: 'active',
      membershipId: 'm1',
      onboardingStep: 4,
    });
  });

  it('omits current_password when the account has none (FR-3)', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: {} });

    await setPassword({ newPassword: 'kirana2026' });

    expect(post.mock.calls[0]?.[0]).toBe('/auth/password/set');
    expect(post.mock.calls[0]?.[1]).toEqual({ new_password: 'kirana2026' });
  });

  it('sends current_password and the logout flag when they are given (FR-9)', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: {} });

    await setPassword({
      newPassword: 'kirana2026',
      currentPassword: 'older12345',
      logoutOtherDevices: true,
    });

    expect(post.mock.calls[0]?.[1]).toEqual({
      new_password: 'kirana2026',
      current_password: 'older12345',
      logout_other_devices: true,
    });
  });

  it('asks for a reset by email and returns NOTHING the screen could branch on', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { data: {} } });

    const answer = await requestPasswordReset('ramesh@example.com');

    expect(post.mock.calls[0]?.[0]).toBe('/auth/password/reset/request');
    expect(post.mock.calls[0]?.[1]).toEqual({ email: 'ramesh@example.com' });
    // FR-4 / BR-2 — `void` is the guarantee: there is no field here that could
    // reveal whether the address exists, so no caller can accidentally show one.
    expect(answer).toBeUndefined();
  });

  it('answers an unknown address exactly as it answers a known one (BR-2)', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { data: {} } });

    await requestPasswordReset('nobody@example.com');
    await requestPasswordReset('ramesh@example.com');

    expect(post.mock.calls[0]?.[0]).toBe(post.mock.calls[1]?.[0]);
  });

  it('confirms the reset with the link token, not a six-digit code', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: AUTH_BODY });

    const result = await confirmPasswordReset({ token: 'rst_abc123', newPassword: 'kirana2026' });

    expect(post.mock.calls[0]?.[0]).toBe('/auth/password/reset/confirm');
    expect(post.mock.calls[0]?.[1]).toEqual({
      token: 'rst_abc123',
      new_password: 'kirana2026',
    });
    // FR-5 — the confirm ends in a session, which is what logs the user in.
    expect(result.userId).toBe('u1');
  });
});

describe('authService — GET /auth/me', () => {
  afterEach(() => jest.restoreAllMocks());

  it('carries the role, the default flag and the membership id onto each tenant', async () => {
    jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: {
          user: {
            id: 'u1',
            full_name: 'Ramesh',
            email: 'ramesh@example.com',
            mobile: '+919876543210',
            locale: 'en',
          },
          active_tenant: { id: 't1', name: 'Sharma', timezone: 'Asia/Kolkata' },
          tenants: [
            { id: 't1', name: 'Sharma', role: 'owner', is_default: true, membership_id: 'm1' },
            { id: 't2', name: 'Verma', status: 'invited' },
          ],
          permissions: ['parties.party.read'],
          enabled_modules: ['parties'],
          ver: 3,
        },
      },
    });

    const session = await getSession();

    expect(session.version).toBe(3);
    expect(session.user).toMatchObject({ name: 'Ramesh', email: 'ramesh@example.com' });
    expect(session.tenants[0]).toMatchObject({
      role: 'owner',
      isDefault: true,
      membershipId: 'm1',
    });
    // A row without a timezone falls back to the tenant default (ADR-011).
    expect(session.tenants[1]).toMatchObject({ status: 'invited', timezone: 'Asia/Kolkata' });
  });

  it('accepts a session user with no mobile at all (CR-2026-09-19-A)', async () => {
    jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: {
          user: { id: 'u2', full_name: '', email: 'new@example.com', locale: 'en' },
          active_tenant: null,
          tenants: [],
          permissions: [],
          enabled_modules: [],
        },
      },
    });

    const session = await getSession();

    expect(session.user.mobile).toBeNull();
    expect(session.user.email).toBe('new@example.com');
  });
});
