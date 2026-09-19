import { resetAllFeatureState } from 'src/redux/actions';
import type { ApiErrorShape } from 'src/types/api.types';

import onboardingReducer, {
  draftChanged,
  stateCodeAdopted,
  stepChanged,
  type OnboardingState,
} from './onboardingSlice';
import { completeOnboarding, createTenant, saveAddressStep, saveGstStep } from './onboardingThunk';

import type { OnboardingTenant } from '../types/onboarding.types';

const initial = onboardingReducer(undefined, { type: '@@init' }) as OnboardingState;

const tenant = (over: Partial<OnboardingTenant> = {}): OnboardingTenant => ({
  id: 't1',
  name: 'Sharma General Store',
  businessType: 'retail',
  stateCode: '27',
  gstType: 'unregistered',
  gstin: null,
  legalName: null,
  pan: null,
  phone: null,
  email: null,
  locale: 'hi',
  onboardingStep: 1,
  enabledModules: ['ledger', 'parties'],
  address: { line1: null, line2: null, city: null, district: null, pincode: null },
  ...over,
});

const fulfilled = (
  type: string,
  overrides: Partial<OnboardingTenant> = {},
  warnings: readonly { code: string; message: string }[] = []
) => ({
  type,
  payload: { tenant: tenant(overrides), warnings },
  meta: { arg: {}, requestId: 'r' },
});

describe('onboardingSlice — the draft and the server\'s step', () => {
  it('starts at step 1 with nothing completed and GST unregistered (§8)', () => {
    expect(initial.step).toBe(1);
    expect(initial.completedStep).toBe(0);
    expect(initial.draft.gstType).toBe('unregistered');
  });

  it('folds the created tenant back into the draft and advances', () => {
    const state = onboardingReducer(initial, fulfilled(createTenant.fulfilled.type));
    expect(state.tenantId).toBe('t1');
    expect(state.draft.name).toBe('Sharma General Store');
    expect(state.draft.stateCode).toBe('27');
    expect(state.completedStep).toBe(1);
    expect(state.step).toBe(2);
  });

  it('takes `completedStep` from the SERVER, never from the client\'s optimism', () => {
    const state = onboardingReducer(
      initial,
      fulfilled(saveGstStep.fulfilled.type, { onboardingStep: 2, gstType: 'regular' })
    );
    expect(state.completedStep).toBe(2);
    expect(state.draft.gstType).toBe('regular');
    expect(state.step).toBe(3);
  });

  it('caps `completedStep` at the four steps that exist', () => {
    const state = onboardingReducer(
      initial,
      fulfilled(completeOnboarding.fulfilled.type, { onboardingStep: 9 })
    );
    expect(state.completedStep).toBe(4);
    expect(state.completed).toBe(true);
  });

  it('patches the draft without touching what it was not given', () => {
    const named = onboardingReducer(initial, draftChanged({ name: 'Verma Stores' }));
    const typed = onboardingReducer(named, draftChanged({ businessType: 'wholesale' }));
    expect(typed.draft.name).toBe('Verma Stores');
    expect(typed.draft.businessType).toBe('wholesale');
  });
});

describe('onboardingSlice — step navigation (FR-9)', () => {
  const afterStepOne = onboardingReducer(initial, fulfilled(createTenant.fulfilled.type));

  it('lets the user back into a completed step for edits', () => {
    expect(onboardingReducer(afterStepOne, stepChanged(1)).step).toBe(1);
  });

  it('refuses to open a step whose prerequisites are not saved', () => {
    // `completedStep` is 1, so step 4 is not reachable by typing a URL.
    expect(onboardingReducer(afterStepOne, stepChanged(4)).step).toBe(2);
  });

  it('clamps a nonsense step rather than rendering an empty frame', () => {
    expect(onboardingReducer(afterStepOne, stepChanged(0)).step).toBe(1);
    expect(onboardingReducer(afterStepOne, stepChanged(99)).step).toBe(2);
  });
});

describe('onboardingSlice — warnings (FR-3)', () => {
  const withWarning = onboardingReducer(
    initial,
    fulfilled(saveGstStep.fulfilled.type, { onboardingStep: 2 }, [
      { code: 'gstin_state_mismatch', message: 'GSTIN belongs to 09.' },
    ])
  );

  it('keeps a server warning rather than dropping it', () => {
    expect(withWarning.warnings).toHaveLength(1);
    expect(withWarning.status).toBe('succeeded');
  });

  it('clears the mismatch warning when the user accepts the GSTIN\'s state', () => {
    const adopted = onboardingReducer(withWarning, stateCodeAdopted('09'));
    expect(adopted.draft.stateCode).toBe('09');
    expect(adopted.warnings).toHaveLength(0);
  });
});

describe('onboardingSlice — failure (§9 "Failed")', () => {
  const apiError: ApiErrorShape = {
    code: 'gstin_in_use',
    message: 'This GSTIN is already registered.',
    details: {},
    requestId: 'req_9',
    status: 409,
    warnings: [],
  };

  it('stores the error and does NOT advance the step', () => {
    const afterStepOne = onboardingReducer(initial, fulfilled(createTenant.fulfilled.type));
    const failed = onboardingReducer(afterStepOne, {
      type: saveGstStep.rejected.type,
      payload: apiError,
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });
    expect(failed.status).toBe('failed');
    expect(failed.error?.requestId).toBe('req_9');
    expect(failed.step).toBe(2);
    expect(failed.completedStep).toBe(1);
  });

  it('leaves the wizard on step 4 when the preset application fails', () => {
    const atSummary = onboardingReducer(
      initial,
      fulfilled(saveAddressStep.fulfilled.type, { onboardingStep: 3 })
    );
    const failed = onboardingReducer(atSummary, {
      type: completeOnboarding.rejected.type,
      payload: { ...apiError, code: 'server_error' },
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });
    expect(failed.step).toBe(4);
    expect(failed.completed).toBe(false);
    expect(failed.completedStep).toBe(3);
  });

  it('ignores an aborted request', () => {
    const state = onboardingReducer(initial, {
      type: createTenant.rejected.type,
      payload: undefined,
      meta: { arg: {}, aborted: true, requestId: 'r' },
    });
    expect(state.status).toBe('idle');
  });

  it('returns to initialState on the teardown signal when no tenant was created', () => {
    const touched = onboardingReducer(initial, draftChanged({ name: 'Half typed' }));
    expect(onboardingReducer(touched, resetAllFeatureState())).toEqual(initial);
  });

  it('carries the just-created tenant ACROSS its own teardown', () => {
    // `createTenant` is mapped to `resetAll` (a new `tid` invalidates
    // everything), and the listener fires it after this slice has already
    // recorded the tenant. Dropping it here would bounce the merchant back to
    // step 1 of a business that already exists.
    const loaded = onboardingReducer(initial, fulfilled(createTenant.fulfilled.type));
    const afterTeardown = onboardingReducer(loaded, resetAllFeatureState());

    expect(afterTeardown.tenantId).toBe('t1');
    expect(afterTeardown.completedStep).toBe(1);
    expect(afterTeardown.step).toBe(2);
    expect(afterTeardown.draft.name).toBe('Sharma General Store');
    // What IS previous-tenant state is gone all the same.
    expect(afterTeardown.error).toBeNull();
  });
});
