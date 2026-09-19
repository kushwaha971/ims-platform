import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_PRIVILEGED,
} from 'src/constants';
import { ROUTES } from 'src/routes';

/**
 * PLT-02 — the numbers the flow is built from.
 *
 * CR-2026-09-19-A removed the OTP constants (`OTP_EXPIRY_SECONDS`,
 * `OTP_RESEND_SECONDS`, `OTP_MAX_ATTEMPTS`) with the flow that used them; they
 * return with the backlogged OTP screen and are not carried as dead numbers in
 * the meantime.
 *
 * The password floors are re-exported from `src/constants` rather than restated
 * here: the strength meter and the validator must agree, and two copies of a
 * number is how they stop agreeing.
 */
export { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_PRIVILEGED, PASSWORD_MAX_LENGTH };

/**
 * The floor every MVP password screen applies. A self-registered account becomes
 * the `owner` of the business it creates in PLT-03, and Part 27 §27.4.2 puts
 * owners on ten characters.
 */
export const PASSWORD_FLOOR = PASSWORD_MIN_LENGTH_PRIVILEGED;

/**
 * PLT-01 §8 — remembered across sessions so a returning merchant does not
 * retype their address. Namespaced `ub.` by `src/utils/storage.ts`, and never
 * trusted for anything but prefilling one field (§19.7.1). An email is a
 * convenience, not a credential: the password is never stored, anywhere.
 */
export const LAST_EMAIL_KEY = 'auth.lastEmail';
export const REMEMBER_EMAIL_KEY = 'auth.rememberEmail';

/** The `next` parameter's allow-list root (§19.6.4 rule 2); the address itself
 * is `src/routes.ts`'s, so the wizard, the menu and this fallback cannot name
 * three different dashboards. */
export const DEFAULT_POST_LOGIN_PATH: string = ROUTES.DASHBOARD;
