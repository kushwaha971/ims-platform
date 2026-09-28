import { renderHook } from '@testing-library/react';
import { IntlProvider } from 'react-intl';

import { en } from 'src/tests/allMessages';

import {
  useBusinessProfileSchemas,
  type BusinessProfileFormValues,
} from './businessProfileSchemas';

const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <IntlProvider locale="en" defaultLocale="en" messages={en as Record<string, string>}>
    {children}
  </IntlProvider>
);

const schema = () =>
  renderHook(() => useBusinessProfileSchemas(), { wrapper }).result.current.businessProfileSchema;

/** A saved profile as `profileToForm` hands it to the form: blanks as ''. */
const SAVED: BusinessProfileFormValues = {
  name: 'Sharma General Store',
  legalName: '',
  businessType: 'retail',
  gstType: 'unregistered',
  gstin: '',
  pan: '',
  stateCode: '27',
  addressLine1: '',
  addressLine2: '',
  city: '',
  pincode: '',
  phone: '',
  email: '',
  accountName: '',
  accountNumber: '',
  ifsc: '',
  bankName: '',
  branch: '',
  upiVpa: '',
};

describe('businessProfileSchema', () => {
  it('saves a profile whose optional fields are all blank (QA D2: empty PAN blocked save)', () => {
    expect(schema().isValidSync(SAVED)).toBe(true);
    expect(schema().cast(SAVED).pan).toBeNull();
  });

  it('upper-cases a typed PAN and still refuses a malformed one', () => {
    expect(schema().cast({ ...SAVED, pan: ' aapfu0939f ' }).pan).toBe('AAPFU0939F');
    expect(schema().isValidSync({ ...SAVED, pan: 'AAPFU0939F' })).toBe(true);
    expect(schema().isValidSync({ ...SAVED, pan: 'NOTAPAN' })).toBe(false);
  });
});
