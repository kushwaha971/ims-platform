import {
  deviceLabelFrom,
  minutesUntil,
  passwordStrength,
  postAuthDestination,
  resolveActiveTenant,
  safeNextPath,
  secondsUntil,
} from './authDisplay';

import type { AuthResult, AuthTenant } from '../types/auth.types';

/**
 * Part 19 §19.1.1 layer 3 — the pure layer, where the rules with five branches
 * live and where they are cheapest to prove. PLT-01 FR-9 and PLT-04 FR-9 are
 * the reason this file exists: five outcomes that would otherwise only be
 * exercised by signing in as five different users.
 */
const tenant = (over: Partial<AuthTenant> = {}): AuthTenant => ({
  id: 't1',
  name: 'Sharma',
  timezone: 'Asia/Kolkata',
  role: 'owner',
  isDefault: false,
  status: 'active',
  membershipId: 'm1',
  onboardingStep: 4,
  ...over,
});

const result = (over: Partial<AuthResult> = {}): AuthResult => ({
  userId: 'u1',
  name: 'Ramesh',
  email: 'ramesh@example.com',
  // CR-2026-09-19-A — a profile field now, and an account may have none.
  mobile: null,
  locale: 'en',
  isNew: false,
  hasPassword: true,
  mustChangePassword: false,
  passwordExpiresAt: null,
  activeTenantId: null,
  tenants: [],
  permissions: [],
  enabledModules: [],
  ...over,
});

describe('postAuthDestination — PLT-01 FR-9 / PLT-04 FR-9', () => {
  it('sends a brand-new user with no membership to the wizard', () => {
    expect(postAuthDestination(result({ isNew: true }))).toEqual({ kind: 'onboarding', step: 1 });
  });

  it('sends an invited-only user to the acceptance route, not to a dashboard', () => {
    const invited = result({ tenants: [tenant({ status: 'invited' })] });
    expect(postAuthDestination(invited)).toEqual({ kind: 'invitation' });
  });

  it('opens the only active tenant', () => {
    const one = result({ tenants: [tenant()], activeTenantId: 't1' });
    expect(postAuthDestination(one)).toEqual({ kind: 'app', tenantId: 't1' });
  });

  it('opens the DEFAULT when there are several and no active one named', () => {
    const many = result({
      tenants: [tenant({ id: 'a' }), tenant({ id: 'b', isDefault: true })],
    });
    expect(postAuthDestination(many)).toEqual({ kind: 'app', tenantId: 'b' });
  });

  it('opens the chooser when there are several and no default', () => {
    const many = result({ tenants: [tenant({ id: 'a' }), tenant({ id: 'b' })] });
    expect(postAuthDestination(many)).toEqual({ kind: 'chooser' });
  });

  it('resumes an unfinished wizard at onboarding_step + 1 (PLT-03 FR-9)', () => {
    const resuming = result({
      tenants: [tenant({ onboardingStep: 2 })],
      activeTenantId: 't1',
    });
    expect(postAuthDestination(resuming)).toEqual({ kind: 'onboarding', step: 3 });
  });

  it('ignores a suspended membership when counting active ones', () => {
    const suspended = result({ tenants: [tenant({ status: 'suspended' })] });
    expect(postAuthDestination(suspended)).toEqual({ kind: 'onboarding', step: 1 });
  });
});

describe('resolveActiveTenant', () => {
  it('prefers the named active tenant over the default', () => {
    const list = [tenant({ id: 'a' }), tenant({ id: 'b', isDefault: true })];
    expect(resolveActiveTenant('a', list)?.id).toBe('a');
  });

  it('falls back to the default when the named one is not a member row', () => {
    const list = [tenant({ id: 'a' }), tenant({ id: 'b', isDefault: true })];
    expect(resolveActiveTenant('zzz', list)?.id).toBe('b');
  });

  it('returns nothing when several are active and none is the default', () => {
    expect(resolveActiveTenant(null, [tenant({ id: 'a' }), tenant({ id: 'b' })])).toBeNull();
  });
});

describe('safeNextPath — §19.6.4 rule 2', () => {
  it('keeps a same-origin absolute path', () => {
    expect(safeNextPath('/parties?q=ram', '/dashboard')).toBe('/parties?q=ram');
  });

  it.each<readonly [string | null, string]>([
    ['//evil.com', 'a protocol-relative URL'],
    ['https://evil.com', 'an absolute URL'],
    ['/\\evil.com', 'a backslash-escaped host'],
    ['javascript://x', 'a scheme'],
    ['parties', 'a relative path with no leading slash'],
    ['', 'an empty value'],
    [null, 'a missing value'],
  ])('refuses %s (%s) and uses the fallback', (value: string | null) => {
    expect(safeNextPath(value, '/dashboard')).toBe('/dashboard');
  });
});

describe('countdown arithmetic', () => {
  it('never returns a negative number of seconds', () => {
    expect(secondsUntil(1_000, 5_000)).toBe(0);
  });

  it('rounds a part-second up, so "1s left" is never shown as 0', () => {
    expect(secondsUntil(5_500, 5_000)).toBe(1);
  });

  it('rounds a part-minute up for the throttle copy', () => {
    expect(minutesUntil(61_000, 0)).toBe(2);
    expect(minutesUntil(null, 0)).toBe(0);
  });
});

describe('passwordStrength — PLT-02 §7', () => {
  it('says nothing about an empty field', () => {
    expect(passwordStrength('').percent).toBe(0);
  });

  it('calls a bare ten-character password weak', () => {
    expect(passwordStrength('aaaaaaaaaa').strength).toBe('weak');
  });

  it('calls a letter-and-digit password at the floor fair', () => {
    expect(passwordStrength('abcdefgh12').strength).toBe('fair');
  });

  /**
   * CR-2026-09-19-A moved the floor to ten (Part 27 §27.4.2). The meter has to
   * move with it: a nine-character password the FORM will reject must not be
   * presented as having cleared the length signal.
   */
  it('gives a nine-character password no credit for length', () => {
    const nine = passwordStrength('abcdefg12');
    const ten = passwordStrength('abcdefgh12');
    expect(nine.percent).toBeLessThan(ten.percent);
  });

  it('calls a long mixed password strong', () => {
    expect(passwordStrength('Kirana#2026Shop').strength).toBe('strong');
  });

  it('never exceeds 100 %', () => {
    expect(passwordStrength('Kirana#2026Shop!!!!').percent).toBeLessThanOrEqual(100);
  });
});

describe('deviceLabelFrom — PLT-01 §7', () => {
  it('names the browser and the platform a user will recognise', () => {
    expect(
      deviceLabelFrom(
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        'Browser'
      )
    ).toBe('Chrome on Android');
  });

  it('prefers Edge over the Chrome token it also carries', () => {
    expect(deviceLabelFrom('Windows Chrome/120 Edg/120', 'Browser')).toBe('Edge on Windows');
  });

  it('falls back rather than inventing a label it cannot derive', () => {
    expect(deviceLabelFrom('curl/8.0', 'Browser')).toBe('Browser');
  });

  it('caps the label at the documented 120 characters', () => {
    expect(deviceLabelFrom('', 'x'.repeat(200))).toHaveLength(120);
  });
});


describe('postAuthDestination — the forced password change (DEC-012)', () => {
  it('outranks every tenant branch, including the empty one', () => {
    // Found in a browser, not here: the server answered
    // `403 password_change_required` while the client painted
    // `/onboarding/step/2`. A member added by an owner has `tenants: []` in the
    // login result — the session read that would populate it is one of the
    // requests being refused — so the no-tenant rule claimed them and sent them
    // into a wizard to create a business they did not want, on an account they
    // could not yet use.
    expect(
      postAuthDestination(result({ mustChangePassword: true, tenants: [] }))
    ).toEqual({ kind: 'setPassword' });
  });

  it('outranks a perfectly good active tenant too', () => {
    // The same person after a second sign-in, once their membership is visible.
    // Nothing behind the dashboard answers until they choose a password.
    expect(
      postAuthDestination(
        result({
          mustChangePassword: true,
          activeTenantId: 't1',
          tenants: [tenant({ id: 't1', role: 'staff', isDefault: true })],
        })
      )
    ).toEqual({ kind: 'setPassword' });
  });

  it('leaves an ordinary sign-in exactly where it was', () => {
    expect(
      postAuthDestination(result({ mustChangePassword: false, tenants: [] }))
    ).toEqual({ kind: 'onboarding', step: 1 });
  });
});

describe('postAuthDestination — the unfinished wizard is the owner’s alone', () => {
  it('sends an owner back into their unfinished wizard (PLT-03 FR-9)', () => {
    expect(
      postAuthDestination(
        result({
          activeTenantId: 't1',
          tenants: [tenant({ id: 't1', role: 'owner', isDefault: true, onboardingStep: 1 })],
        })
      )
    ).toEqual({ kind: 'onboarding', step: 2 });
  });

  it('sends a staff member to the app instead of a wizard they cannot complete', () => {
    // The wizard writes through `PATCH /tenants/current`, which canon §0.9
    // gives to the OWNER alone. Measured against the live server: a staff
    // member landed on /onboarding/step/2 and every step answered 403 — on
    // every sign-in, with no way out, because the router put them back each
    // time. Unreachable until DEC-012 made a second person able to join at all.
    expect(
      postAuthDestination(
        result({
          activeTenantId: 't1',
          tenants: [tenant({ id: 't1', role: 'staff', isDefault: true, onboardingStep: 1 })],
        })
      )
    ).toEqual({ kind: 'app', tenantId: 't1' });
  });

  it('does not spare an admin either, who also cannot manage the tenant', () => {
    expect(
      postAuthDestination(
        result({
          activeTenantId: 't1',
          tenants: [tenant({ id: 't1', role: 'admin', isDefault: true, onboardingStep: 2 })],
        })
      )
    ).toEqual({ kind: 'app', tenantId: 't1' });
  });
});
