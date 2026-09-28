/**
 * The shared pattern set used by `useValidationSchemas()` (Part 19 §19.5.2).
 * A feature never writes a regex of its own: a rule that lives here is tested
 * once and translated once.
 */
export const REGEX = {
  /** Money: a decimal STRING with at most 2 dp (Part 22 §22.1). */
  DECIMAL_2DP: /^\d{1,10}(\.\d{1,2})?$/,
  /** Quantity: at most 3 dp. */
  DECIMAL_3DP: /^\d{1,10}(\.\d{1,3})?$/,
  INTEGER: /^\d{1,10}$/,
  /** Indian mobile in E.164: +91 followed by 10 digits starting 6–9. */
  MOBILE_E164_IN: /^\+91[6-9]\d{9}$/,
  /** GSTIN: 2-digit state code, PAN, entity digit, Z, checksum char. */
  GSTIN: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  PAN: /^[A-Z]{5}\d{4}[A-Z]$/,
  HSN: /^\d{4}(\d{2})?(\d{2})?$/,
  PINCODE_IN: /^[1-9]\d{5}$/,
  /** PLT-07 §10 — the server's patterns, character for character. */
  UPI_VPA: /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/,
  IFSC: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  BANK_ACCOUNT: /^\d{9,18}$/,
  /** WLB-01 §10 — `#2B6BE0`. */
  HEX_COLOUR: /^#[0-9A-Fa-f]{6}$/,
  UUID: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  ISO_DATE: /^\d{4}-\d{2}-\d{2}$/,
  /**
   * PLT-01 §10 — the OTP is exactly six digits, nothing else.
   *
   * CR-2026-09-19-A moved mobile OTP to the backlog; this pattern is retained
   * with `UbOtpInput` for the day the flow returns, and is unused at MVP.
   */
  OTP_CODE: /^\d{6}$/,
  /**
   * CR-2026-09-19-A — email is the MVP identity, so the client checks the
   * address it is about to send. Deliberately the pragmatic shape a browser's
   * own `type="email"` accepts rather than RFC 5322: it must agree with
   * DRF's `EmailField`, which is what actually decides, and a stricter client
   * pattern would reject an address the server would have taken.
   */
  EMAIL: /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/,
  /**
   * PLT-02 §10 — COMPOSITION only: at least one letter and one digit. The
   * length floor is applied separately (`passwordValidation`), because the
   * floor is 8 for a member and 10 for an owner or an admin (Part 27 §27.4.2,
   * `services/passwords.py`) and one regex cannot say which rule was broken.
   * A single pattern here would tell a merchant "at least 8 characters with a
   * letter and a number" when what was wrong was only the length.
   */
  PASSWORD: /^(?=.*[A-Za-z])(?=.*\d).*$/,
  /**
   * PLT-03 §10 / EC-4 — a two-digit GST state code.
   *
   * `01`–`38` are the states and union territories, `97` is Other Territory,
   * and `99` (Centre jurisdiction) is REFUSED — which is what EC-4 says and
   * what `StateCodeField` enforces server-side. This used to be `/^\d{2}$/`,
   * which accepts `00`, `99` and every other two-digit number: laxer than the
   * server, in the safe direction, but a rule that says nothing.
   *
   * The closed list itself lives with the data, in
   * `features/onboarding/constants/gstStates.ts`, and the onboarding schema
   * checks against it. This is the structural rule for anywhere that has a
   * state code but not that table.
   */
  GST_STATE_CODE: /^(0[1-9]|[12]\d|3[0-8]|97)$/,
} as const;
