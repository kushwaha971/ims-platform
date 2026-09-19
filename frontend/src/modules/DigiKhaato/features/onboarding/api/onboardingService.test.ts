import { api } from 'src/api/AxiosInstances';

import {
  completeOnboarding,
  createTenant,
  updateAddressStep,
  updateBusinessStep,
  updateGstStep,
} from './onboardingService';

/**
 * PLT-03's wire half. Part 22 §22.3 is the contract; the fixture bodies below
 * are its shapes, so a change on either side breaks this test.
 */
const TENANT = {
  id: 't1',
  name: 'Sharma General Store',
  business_type: 'retail',
  state_code: '27',
  gst_type: 'unregistered',
  gstin: null,
  legal_name: null,
  pan: null,
  phone: null,
  email: null,
  locale: 'hi',
  onboarding_step: 1,
  enabled_modules: ['ledger', 'parties'],
  address: null,
};

describe('onboardingService.updateBusinessStep — FR-9, step 1 edited', () => {
  afterEach(() => jest.restoreAllMocks());

  it('PATCHes the three step-1 fields rather than POSTing a second business', async () => {
    const patch = jest.spyOn(api, 'patch').mockResolvedValue({ data: { data: TENANT } });
    const post = jest.spyOn(api, 'post');

    await updateBusinessStep({
      name: 'Sharma General Store',
      businessType: 'retail',
      stateCode: '27',
      ownerName: 'Ramesh',
    });

    expect(post).not.toHaveBeenCalled();
    expect(patch.mock.calls[0]?.[0]).toBe('/tenants/current');
    expect(patch.mock.calls[0]?.[1]).toEqual({
      name: 'Sharma General Store',
      business_type: 'retail',
      state_code: '27',
    });
  });

  it('sends no onboarding_step, so an edit cannot regress the wizard', async () => {
    // The server assigns the step it is given. Echoing `1` from a merchant who
    // had reached step 3 would send them back to step 2 on their next login.
    const patch = jest.spyOn(api, 'patch').mockResolvedValue({ data: { data: TENANT } });

    await updateBusinessStep({
      name: 'S & Co',
      businessType: 'retail',
      stateCode: '27',
      ownerName: null,
    });

    expect(patch.mock.calls[0]?.[1]).not.toHaveProperty('onboarding_step');
  });

  it('sends no owner_name — the PATCH surface has no such field', async () => {
    const patch = jest.spyOn(api, 'patch').mockResolvedValue({ data: { data: TENANT } });

    await updateBusinessStep({
      name: 'S & Co',
      businessType: 'retail',
      stateCode: '27',
      ownerName: 'Ramesh',
    });

    expect(patch.mock.calls[0]?.[1]).not.toHaveProperty('owner_name');
  });
});

describe('onboardingService.createTenant — FR-2 / EC-7', () => {
  afterEach(() => jest.restoreAllMocks());

  it('posts the step-1 fields in snake_case to /tenants', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { data: { tenant: TENANT } } });

    await createTenant(
      {
        name: 'Sharma General Store',
        businessType: 'retail',
        stateCode: '27',
        ownerName: 'Ramesh',
      },
      'key-1'
    );

    expect(post.mock.calls[0]?.[0]).toBe('/tenants');
    expect(post.mock.calls[0]?.[1]).toEqual({
      name: 'Sharma General Store',
      business_type: 'retail',
      state_code: '27',
      owner_name: 'Ramesh',
    });
  });

  it("carries the CALLER's Idempotency-Key, so a lost 201 replays (EC-7)", async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { data: { tenant: TENANT } } });

    await createTenant(
      { name: 'S', businessType: 'retail', stateCode: '27', ownerName: null },
      'key-abc'
    );

    const config = post.mock.calls[0]?.[2] as { headers?: Record<string, string> } | undefined;
    expect(config?.headers?.['Idempotency-Key']).toBe('key-abc');
  });

  it('omits owner_name when the user already has one (BR-7)', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { data: { tenant: TENANT } } });

    await createTenant(
      { name: 'S', businessType: 'retail', stateCode: '27', ownerName: null },
      'k'
    );

    expect(post.mock.calls[0]?.[1]).not.toHaveProperty('owner_name');
  });

  it('unwraps the 201 body and maps it onto the domain shape', async () => {
    jest.spyOn(api, 'post').mockResolvedValue({ data: { data: { tenant: TENANT } } });

    const result = await createTenant(
      { name: 'S', businessType: 'retail', stateCode: '27', ownerName: null },
      'k'
    );

    expect(result.tenant.businessType).toBe('retail');
    expect(result.tenant.stateCode).toBe('27');
    expect(result.tenant.onboardingStep).toBe(1);
    expect(result.tenant.address).toEqual({
      line1: null,
      line2: null,
      city: null,
      district: null,
      pincode: null,
    });
    expect(result.warnings).toEqual([]);
  });
});

describe('onboardingService — the PATCH steps', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends a null GSTIN for an unregistered business rather than an empty string', async () => {
    const patch = jest.spyOn(api, 'patch').mockResolvedValue({ data: { data: TENANT } });

    await updateGstStep({ gstType: 'unregistered', gstin: '', legalName: null, pan: null });

    expect(patch.mock.calls[0]?.[0]).toBe('/tenants/current');
    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      gst_type: 'unregistered',
      gstin: null,
      onboarding_step: 2,
    });
  });

  it('sends the GSTIN when the business says it is registered', async () => {
    const patch = jest.spyOn(api, 'patch').mockResolvedValue({ data: { data: TENANT } });

    await updateGstStep({
      gstType: 'regular',
      gstin: '27AAPFU0939F1ZV',
      legalName: 'Sharma Traders',
      pan: 'AAPFU0939F',
    });

    expect(patch.mock.calls[0]?.[1]).toMatchObject({
      gst_type: 'regular',
      gstin: '27AAPFU0939F1ZV',
      legal_name: 'Sharma Traders',
      pan: 'AAPFU0939F',
    });
  });

  it('keeps `warnings[]` from `meta` — a note is not a failure (FR-3)', async () => {
    jest.spyOn(api, 'patch').mockResolvedValue({
      data: {
        data: TENANT,
        meta: {
          warnings: [
            { code: 'gstin_state_mismatch', message: 'GSTIN belongs to 09.', state_code: '09' },
          ],
        },
      },
    });

    const result = await updateGstStep({
      gstType: 'regular',
      gstin: '09AAPFU0939F1ZV',
      legalName: null,
      pan: null,
    });

    expect(result.warnings).toEqual([
      { code: 'gstin_state_mismatch', message: 'GSTIN belongs to 09.', stateCode: '09' },
    ]);
  });

  it('nests the address and stamps step 3 (FR-4)', async () => {
    const patch = jest.spyOn(api, 'patch').mockResolvedValue({ data: { data: TENANT } });

    await updateAddressStep({
      address: {
        line1: 'Main Road',
        line2: null,
        city: 'Pune',
        district: null,
        pincode: '411001',
      },
      phone: '+919876543210',
      email: null,
    });

    expect(patch.mock.calls[0]?.[1]).toEqual({
      address: {
        line1: 'Main Road',
        line2: null,
        city: 'Pune',
        district: null,
        pincode: '411001',
      },
      phone: '+919876543210',
      email: null,
      onboarding_step: 3,
    });
  });

  it('stamps step 4, which is what makes the server apply the preset (FR-5)', async () => {
    const patch = jest
      .spyOn(api, 'patch')
      .mockResolvedValue({ data: { data: { ...TENANT, onboarding_step: 4 } } });

    const result = await completeOnboarding({ locale: 'hi' });

    expect(patch.mock.calls[0]?.[1]).toEqual({ locale: 'hi', onboarding_step: 4 });
    expect(result.tenant.onboardingStep).toBe(4);
  });
});
