import { renderHook } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import { PASSWORD_MIN_LENGTH_PRIVILEGED } from 'src/constants';

import en from 'locales/en.json';

import { useAuthSchemas } from './authSchemas';

/**
 * Part 19 §19.5.3 — the feature's schemas, which COMPOSE the central validators
 * and restate nothing.
 *
 * They are tested through the hook, in an `IntlProvider`, because the messages
 * come from `t()` — which is the whole reason the validators are a hook. A
 * schema tested outside intl would pass with an untranslated message, which is
 * the defect R-F-2 exists to catch.
 */
const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <IntlProvider locale="en" defaultLocale="en" messages={en as Record<string, string>}>
    {children}
  </IntlProvider>
);

const schemas = () => renderHook(() => useAuthSchemas(), { wrapper }).result.current;

/** Ten characters with a letter and a digit — the MVP floor, exactly. */
const OK_PASSWORD = 'kirana2026';

describe('email validation — CR-2026-09-19-A', () => {
  it.each([
    ['ramesh@example.com'],
    ['ramesh.kumar+shop@example.co.in'],
    ['r@e.io'],
  ])('accepts %s', (email) => {
    expect(schemas().passwordResetRequestSchema.isValidSync({ email })).toBe(true);
  });

  it.each([
    ['ramesh', 'no @ at all'],
    ['ramesh@', 'nothing after the @'],
    ['@example.com', 'nothing before the @'],
    ['ramesh@example', 'no dot in the domain'],
    ['ramesh @example.com', 'a space'],
    ['ramesh@exa mple.com', 'a space in the domain'],
    ['', 'nothing at all'],
  ])('rejects %s (%s)', (email) => {
    expect(schemas().passwordResetRequestSchema.isValidSync({ email })).toBe(false);
  });

  /**
   * The server lower-cases and trims on write. A client that did not would let
   * one person sign up as `Ramesh@Example.com` and then fail to log in as
   * `ramesh@example.com`, which reads to them as a broken password.
   */
  it('trims and lower-cases what it lets through', () => {
    expect(
      schemas().passwordResetRequestSchema.cast({ email: '  Ramesh@Example.COM ' })
    ).toEqual({ email: 'ramesh@example.com' });
  });

  it('gives the translated message, not a hard-coded English one', () => {
    try {
      schemas().passwordResetRequestSchema.validateSync({ email: 'ramesh' });
      throw new Error('should have thrown');
    } catch (thrown) {
      expect((thrown as Error).message).toBe(en['validation.email.format']);
    }
  });
});

describe('passwordLoginSchema — PLT-02 AC-5', () => {
  const values = { password: 'anything', rememberEmail: true };

  it('accepts an email identity', () => {
    expect(
      schemas().passwordLoginSchema.isValidSync({ ...values, email: 'ram@example.com' })
    ).toBe(true);
  });

  it('rejects a mobile number — it is no longer an identity (CR-2026-09-19-A)', () => {
    expect(
      schemas().passwordLoginSchema.isValidSync({ ...values, email: '+919876543210' })
    ).toBe(false);
  });

  it('does NOT apply the password rules on login', () => {
    // A login form that rejected a password shorter than today's floor would
    // lock a real user out of their own account; the server decides (AC-5).
    expect(
      schemas().passwordLoginSchema.isValidSync({
        email: 'ram@example.com',
        password: 'old',
        rememberEmail: true,
      })
    ).toBe(true);
  });

  it('still requires a password to be typed', () => {
    expect(
      schemas().passwordLoginSchema.isValidSync({
        email: 'ram@example.com',
        password: '',
        rememberEmail: true,
      })
    ).toBe(false);
  });
});

describe('signUpSchema — CR-2026-09-19-A FR-S1', () => {
  const ok = {
    name: 'Ramesh',
    email: 'ram@example.com',
    mobile: null,
    password: OK_PASSWORD,
    confirmPassword: OK_PASSWORD,
  };

  it('accepts ten characters with a letter and a digit', () => {
    expect(schemas().signUpSchema.isValidSync(ok)).toBe(true);
  });

  /**
   * Part 27 §27.4.2 puts `owner` and `admin` on ten characters, and a
   * self-registered account becomes the owner of the business it creates. Nine
   * has to fail HERE, or the server fails it after the user has typed it twice.
   */
  it.each([
    ['kirana202', 'nine characters — under the privileged floor'],
    ['kiranashop', 'no digit'],
    ['1234567890', 'no letter'],
  ])('rejects %s (%s)', (password) => {
    expect(schemas().signUpSchema.isValidSync({ ...ok, password, confirmPassword: password })).toBe(
      false
    );
  });

  it('names the floor the server actually enforces', () => {
    try {
      schemas().signUpSchema.validateSync({
        ...ok,
        password: 'kirana202',
        confirmPassword: 'kirana202',
      });
      throw new Error('should have thrown');
    } catch (thrown) {
      expect((thrown as Error).message).toContain(String(PASSWORD_MIN_LENGTH_PRIVILEGED));
    }
  });

  it('rejects a confirmation that does not match', () => {
    expect(schemas().signUpSchema.isValidSync({ ...ok, confirmPassword: 'kirana20266' })).toBe(
      false
    );
  });

  it('requires an address — there is no other way to name the account', () => {
    expect(schemas().signUpSchema.isValidSync({ ...ok, email: '' })).toBe(false);
  });

  it('leaves the name optional — step 1 asks again if it is blank (BR-7)', () => {
    expect(schemas().signUpSchema.isValidSync({ ...ok, name: '' })).toBe(true);
  });

  /**
   * CR-2026-09-19-A — mobile stays in the product and stops being the identity.
   * Optional means an account can exist without one; checked means a number
   * that IS given has to be a real one, since it is what a reminder will go to.
   */
  it('accepts an account with no mobile at all, and one with a valid one', () => {
    expect(schemas().signUpSchema.isValidSync({ ...ok, mobile: null })).toBe(true);
    expect(schemas().signUpSchema.isValidSync({ ...ok, mobile: '' })).toBe(true);
    expect(schemas().signUpSchema.isValidSync({ ...ok, mobile: '+919876543210' })).toBe(true);
  });

  it('rejects a half-typed mobile rather than storing a number nobody has', () => {
    expect(schemas().signUpSchema.isValidSync({ ...ok, mobile: '+9112345' })).toBe(false);
  });

  it('gives the translated mismatch message', () => {
    try {
      schemas().signUpSchema.validateSync({ ...ok, confirmPassword: 'other12345' });
      throw new Error('should have thrown');
    } catch (thrown) {
      expect((thrown as Error).message).toBe(en['validation.password.mismatch']);
    }
  });
});

describe('passwordSetSchema — PLT-02 §10', () => {
  const ok = { name: 'Ramesh', password: OK_PASSWORD, confirmPassword: OK_PASSWORD };

  it('applies the same floor as sign-up', () => {
    expect(schemas().passwordSetSchema.isValidSync(ok)).toBe(true);
    expect(
      schemas().passwordSetSchema.isValidSync({
        ...ok,
        password: 'kirana202',
        confirmPassword: 'kirana202',
      })
    ).toBe(false);
  });
});

describe('passwordResetConfirmSchema — PLT-02 §10', () => {
  it('needs a valid new password and a matching confirmation', () => {
    expect(
      schemas().passwordResetConfirmSchema.isValidSync({
        password: OK_PASSWORD,
        confirmPassword: OK_PASSWORD,
      })
    ).toBe(true);
    expect(
      schemas().passwordResetConfirmSchema.isValidSync({
        password: OK_PASSWORD,
        confirmPassword: 'kirana2027',
      })
    ).toBe(false);
  });

  /** The token travels in the URL, not in the form: there is nothing to type. */
  it('asks for no code — CR-2026-09-19-A replaced it with a link token', () => {
    expect(
      Object.keys(schemas().passwordResetConfirmSchema.fields).sort()
    ).toEqual(['confirmPassword', 'password']);
  });
});
