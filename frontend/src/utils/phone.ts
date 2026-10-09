/**
 * Mobile numbers from any country, with India as the default.
 *
 * Every mobile field in the product is `UbPhoneInput`, and every one speaks
 * E.164 (`+919876543210`, `+447911123456`) to its form and to the API. India
 * keeps its strict rule — ten digits starting 6–9 — because that is the
 * number a merchant here almost always types, and a looser rule would let
 * `+91 12345` through. Any other country is checked only as E.164: the right
 * length for the format (the picker only offers real dial codes). A per-country numbering
 * plan is what `libphonenumber` is for, and that is a dependency (ADR-021)
 * this does not justify.
 *
 * The country table is `phoneCountries.ts`, which only the control imports.
 */

import { REGEX } from 'src/utils/regexConstants';

export const DEFAULT_PHONE_COUNTRY = 'IN';
export const IN_DIAL_CODE = '+91';

/**
 * Fourteen digits including the country code — one short of E.164's fifteen,
 * because the server stores a mobile in `varchar(15)` and the plus takes one
 * (`platform_app/mobile.py`). No mobile plan in use needs the fifteenth.
 */
export const E164_MAX_DIGITS = 14;

/** Seven to fourteen digits after the plus — Niue's numbers are the shortest. */
const MOBILE_E164_ANY = /^\+[1-9]\d{6,13}$/;

/**
 * Whether an E.164 value is a mobile number this product accepts: India's
 * strict ten digits, or any other country's well-formed E.164 — the shape the
 * server checks too. Spaces and dashes are ignored, as the schema ignores them.
 */
export const isValidMobile = (value: string | null | undefined): boolean => {
  const compact = (value ?? '').replace(/[\s-]/g, '');
  if (compact.startsWith(IN_DIAL_CODE)) {
    return REGEX.MOBILE_E164_IN.test(compact);
  }
  return MOBILE_E164_ANY.test(compact);
};

/**
 * Which rule an invalid value broke, for its message: India's ten digits (a
 * `+91` or a bare number) or another country's format.
 */
export const readsAsIndian = (value: string): boolean => {
  const trimmed = value.trim();
  return !trimmed.startsWith('+') || trimmed.startsWith(IN_DIAL_CODE);
};
