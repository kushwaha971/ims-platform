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
  UUID: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  ISO_DATE: /^\d{4}-\d{2}-\d{2}$/,
} as const;
