import { renderHook } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import en from 'locales/en.json';

import { useOnboardingSchemas } from './onboardingSchemas';

/** PLT-03 §10, through the hook so the messages are the translated ones. */
const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <IntlProvider locale="en" defaultLocale="en" messages={en as Record<string, string>}>
    {children}
  </IntlProvider>
);

const schemas = () => renderHook(() => useOnboardingSchemas(), { wrapper }).result.current;

const VALID_GSTIN = '27AAPFU0939F1ZV';

describe('businessStepSchema — step 1', () => {
  const ok = {
    name: 'Sharma General Store',
    businessType: 'retail' as const,
    stateCode: '27',
    ownerName: null,
  };

  it('accepts the three required fields', () => {
    expect(schemas().businessStepSchema.isValidSync(ok)).toBe(true);
  });

  it('rejects a one-character business name and a 161-character one', () => {
    expect(schemas().businessStepSchema.isValidSync({ ...ok, name: 'S' })).toBe(false);
    expect(schemas().businessStepSchema.isValidSync({ ...ok, name: 'x'.repeat(161) })).toBe(false);
    expect(schemas().businessStepSchema.isValidSync({ ...ok, name: 'x'.repeat(160) })).toBe(true);
  });

  it('requires a business type to have been chosen', () => {
    expect(schemas().businessStepSchema.isValidSync({ ...ok, businessType: '' })).toBe(false);
  });

  it('accepts state 97 and rejects state 99 (EC-4)', () => {
    expect(schemas().businessStepSchema.isValidSync({ ...ok, stateCode: '97' })).toBe(true);
    expect(schemas().businessStepSchema.isValidSync({ ...ok, stateCode: '99' })).toBe(false);
  });

  it('rejects a state code that is not two digits', () => {
    expect(schemas().businessStepSchema.isValidSync({ ...ok, stateCode: '7' })).toBe(false);
    expect(schemas().businessStepSchema.isValidSync({ ...ok, stateCode: '' })).toBe(false);
  });
});

describe('gstStepSchema — step 2 (FR-3 / §10)', () => {
  it('needs no GSTIN when the business is unregistered', () => {
    expect(
      schemas().gstStepSchema.isValidSync({
        gstType: 'unregistered',
        gstin: null,
        legalName: null,
        pan: null,
      })
    ).toBe(true);
  });

  it('REQUIRES a GSTIN once the business says it is registered', () => {
    expect(
      schemas().gstStepSchema.isValidSync({
        gstType: 'regular',
        gstin: null,
        legalName: null,
        pan: null,
      })
    ).toBe(false);
  });

  it('accepts a GSTIN whose checksum holds', () => {
    expect(
      schemas().gstStepSchema.isValidSync({
        gstType: 'regular',
        gstin: VALID_GSTIN,
        legalName: 'Sharma Traders',
        pan: 'AAPFU0939F',
      })
    ).toBe(true);
  });

  it('rejects a GSTIN whose checksum does not — the whole point of the rule', () => {
    expect(
      schemas().gstStepSchema.isValidSync({
        gstType: 'regular',
        gstin: '27AAPFU0939F1ZW',
        legalName: null,
        pan: null,
      })
    ).toBe(false);
  });

  it('applies the same rule to composition dealers', () => {
    expect(
      schemas().gstStepSchema.isValidSync({
        gstType: 'composition',
        gstin: null,
        legalName: null,
        pan: null,
      })
    ).toBe(false);
  });

  it('rejects a malformed PAN but tolerates one that simply differs', () => {
    // The format is a rule; disagreeing with the GSTIN is only a warning.
    expect(
      schemas().gstStepSchema.isValidSync({
        gstType: 'regular',
        gstin: VALID_GSTIN,
        legalName: null,
        pan: 'NOTAPAN',
      })
    ).toBe(false);
    expect(
      schemas().gstStepSchema.isValidSync({
        gstType: 'regular',
        gstin: VALID_GSTIN,
        legalName: null,
        pan: 'ZZZZZ0000Z',
      })
    ).toBe(true);
  });
});

describe('addressStepSchema — step 3 (FR-10)', () => {
  const empty = {
    line1: null,
    line2: null,
    city: null,
    district: null,
    pincode: null,
    phone: null,
    email: null,
  };

  it('accepts a completely empty address, because the step is skippable', () => {
    expect(schemas().addressStepSchema.isValidSync(empty)).toBe(true);
  });

  it('still validates a PIN code that was typed', () => {
    expect(schemas().addressStepSchema.isValidSync({ ...empty, pincode: '411001' })).toBe(true);
    expect(schemas().addressStepSchema.isValidSync({ ...empty, pincode: '011001' })).toBe(false);
    expect(schemas().addressStepSchema.isValidSync({ ...empty, pincode: '41100' })).toBe(false);
  });

  it('still validates a phone and an email that were typed', () => {
    expect(schemas().addressStepSchema.isValidSync({ ...empty, phone: '+919876543210' })).toBe(
      true
    );
    expect(schemas().addressStepSchema.isValidSync({ ...empty, phone: '+91123' })).toBe(false);
    expect(schemas().addressStepSchema.isValidSync({ ...empty, email: 'not-an-email' })).toBe(
      false
    );
  });

  it('caps each address line at 120 characters', () => {
    expect(schemas().addressStepSchema.isValidSync({ ...empty, line1: 'x'.repeat(121) })).toBe(
      false
    );
  });
});
