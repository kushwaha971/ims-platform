import { toPatch, toProfile } from '../api/businessProfileService';

import {
  formToProfile,
  headerAddressLines,
  headerGstinLine,
  profileToForm,
} from './profileDisplay';

import type { TenantApiRow } from '../types/businessProfile.types';

const ROW: TenantApiRow = {
  name: 'Ramesh Traders',
  legal_name: 'Ramesh Traders Pvt Ltd',
  business_type: 'retail',
  gst_type: 'regular',
  gstin: '27AAPFU0939F1ZV',
  pan: 'AAPFU0939F',
  state_code: '27',
  address: { line1: 'Shop 4, MG Road', city: 'Pune', pincode: '411001' },
  phone: '+919812345678',
  email: 'shop@example.com',
  bank_details: { account_number: '123456789012', ifsc: 'SBIN0001234' },
  bank_details_masked: false,
  upi_vpa: 'ramesh@okaxis',
};

/** PLT-07 — the profile's wire mapping and the bill header it previews. */
describe('business profile', () => {
  it('round-trips the server row through the form without losing a field', () => {
    // A field dropped here is a field a save would silently CLEAR, because the
    // PATCH sends the whole profile.
    const patch = toPatch(formToProfile(profileToForm(toProfile(ROW))));
    expect(patch).toMatchObject({
      name: 'Ramesh Traders',
      gstin: '27AAPFU0939F1ZV',
      address: { line1: 'Shop 4, MG Road', city: 'Pune', pincode: '411001', line2: null },
      bank_details: { account_number: '123456789012', ifsc: 'SBIN0001234' },
      upi_vpa: 'ramesh@okaxis',
    });
  });

  it('sends no GSTIN for an unregistered business, whatever is in the box', () => {
    // FR-10 / AC-3 of PLT-03: unregistered means no GSTIN at all.
    const profile = formToProfile({ ...profileToForm(toProfile(ROW)), gstType: 'unregistered' });
    expect(toPatch(profile).gstin).toBeNull();
  });

  it('prints the state with its GST code under the address (BR-1, BR-2)', () => {
    expect(headerAddressLines(profileToForm(toProfile(ROW)), 'en')).toEqual([
      'Shop 4, MG Road',
      'Pune – 411001',
      'Maharashtra (27)',
    ]);
  });

  it('prints a GSTIN line only for a registered business', () => {
    const form = profileToForm(toProfile(ROW));
    expect(headerGstinLine(form, 'GSTIN')).toBe('GSTIN 27AAPFU0939F1ZV');
    expect(headerGstinLine({ ...form, gstType: 'unregistered' }, 'GSTIN')).toBeNull();
  });
});
