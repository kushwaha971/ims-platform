import { buildValidationSchemas } from 'src/hooks/useValidationSchemas';

import { isValidMobile } from './phone';
import { countryOfE164, PHONE_COUNTRIES, phoneCountry } from './phoneCountries';

/**
 * The rule every mobile field and the server share: India strict, any other
 * country well-formed E.164 with a real dial code (owner, 9 Oct 2026).
 */
describe('isValidMobile', () => {
  it.each([
    ['+919876543210', true, 'India'],
    ['+91 98765 43210', true, 'India with spaces'],
    ['+915876543210', false, 'India not starting 6–9'],
    ['+9198765', false, 'India too short'],
    ['+447911123456', true, 'UK'],
    ['+14165550100', true, 'Canada / US'],
    ['+971501234567', true, 'UAE'],
    ['+4479', false, 'too short for any country'],
    ['+4412345678901234', false, 'longer than E.164'],
    ['+441234567890123', false, 'fifteen digits: past the server column'],
    ['9876543210', false, 'bare digits are not E.164'],
    ['', false, 'empty'],
  ])('%s → %s (%s)', (value, ok) => {
    expect(isValidMobile(value)).toBe(ok);
  });
});

describe('countryOfE164', () => {
  it('reads the dial code, longest first', () => {
    expect(countryOfE164('+971501234567')?.iso).toBe('AE');
    expect(countryOfE164('+919876543210')?.iso).toBe('IN');
    expect(countryOfE164('+447911123456')?.iso).toBe('GB');
  });

  it('reads a shared code as its main country unless another is preferred', () => {
    expect(countryOfE164('+14165550100')?.iso).toBe('US');
    expect(countryOfE164('+14165550100', 'CA')?.iso).toBe('CA');
  });

  it('is null for a value with no plus or no known code', () => {
    expect(countryOfE164('9876543210')).toBeNull();
    expect(countryOfE164('+999')).toBeNull();
  });
});

it('lists each country once, with India the default', () => {
  const isos = PHONE_COUNTRIES.map((c) => c.iso);
  expect(new Set(isos).size).toBe(isos.length);
  expect(phoneCountry(undefined).iso).toBe('IN');
  expect(phoneCountry('ZZ').iso).toBe('IN');
});

describe('mobileValidation (every mobile field’s schema)', () => {
  // `t` echoes the key, so the assertion names WHICH message was chosen.
  const v = buildValidationSchemas(((key: string) => key) as never);
  const errorOf = (value: string) => {
    try {
      v.mobileValidation(false).validateSync(value);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };

  it('accepts India, another country, and an empty optional field', () => {
    expect(errorOf('+919876543210')).toBeNull();
    expect(errorOf('+447911123456')).toBeNull();
    expect(errorOf('')).toBeNull();
  });

  it('names India’s ten digits for an Indian number, the picked code otherwise', () => {
    expect(errorOf('+9198765')).toBe('validation.mobile.format');
    expect(errorOf('+4479')).toBe('validation.mobile.formatOther');
  });
});
