import { isValidGstinChecksum } from 'src/hooks/useValidationSchemas';

import { BUSINESS_TYPES, BUSINESS_TYPE_CONFIG } from '../constants/businessTypes';
import { GST_STATES, GST_STATE_CODES, stateName } from '../constants/gstStates';

import {
  gstinStateMismatch,
  isOnboardingComplete,
  panFromGstin,
  panMismatchesGstin,
  presetSummary,
  resumeStep,
  shouldResumeFromServer,
  stateCodeFromGstin,
} from './onboardingDisplay';

/**
 * PLT-03's pure layer. T-PLT-03-1 asks for the GSTIN checksum against known
 * values and T-PLT-03-2 for the preset table per type; both are here, because
 * both are arithmetic over a table and neither needs a DOM.
 */
// `27AAPFU0939F1ZV` is the FRD's own worked example (T-PLT-03-1).
const VALID_GSTIN = '27AAPFU0939F1ZV';

describe('GSTIN derivations — PLT-03 FR-3', () => {
  it('reads the state code from the first two characters', () => {
    expect(stateCodeFromGstin(VALID_GSTIN)).toBe('27');
  });

  it('reads the PAN from characters 3–12', () => {
    expect(panFromGstin(VALID_GSTIN)).toBe('AAPFU0939F');
  });

  it('derives nothing from a half-typed GSTIN rather than guessing', () => {
    expect(panFromGstin('27AAP')).toBeNull();
    expect(stateCodeFromGstin('2')).toBeNull();
    expect(panFromGstin(null)).toBeNull();
  });

  it('accepts the checksum of the FRD example and rejects a mutated one', () => {
    expect(isValidGstinChecksum(VALID_GSTIN)).toBe(true);
    expect(isValidGstinChecksum('27AAPFU0939F1ZW')).toBe(false);
    expect(isValidGstinChecksum('27AAPFU0939F1Z')).toBe(false);
  });
});

describe('gstinStateMismatch — a warning, never a block', () => {
  it('stays quiet while the GSTIN is still being typed', () => {
    expect(gstinStateMismatch('27AAP', '09').mismatched).toBe(false);
  });

  it('stays quiet when no state has been chosen yet', () => {
    expect(gstinStateMismatch(VALID_GSTIN, null).mismatched).toBe(false);
  });

  it('reports a genuine mismatch and names the state the GSTIN declares', () => {
    const view = gstinStateMismatch(VALID_GSTIN, '09');
    expect(view.mismatched).toBe(true);
    expect(view.gstinStateCode).toBe('27');
  });

  it('is silent when the two agree', () => {
    expect(gstinStateMismatch(VALID_GSTIN, '27').mismatched).toBe(false);
  });
});

describe('panMismatchesGstin', () => {
  it('is false when either side is missing', () => {
    expect(panMismatchesGstin(null, VALID_GSTIN)).toBe(false);
    expect(panMismatchesGstin('AAPFU0939F', null)).toBe(false);
  });

  it('is false when they agree, case-insensitively', () => {
    expect(panMismatchesGstin('aapfu0939f', VALID_GSTIN)).toBe(false);
  });

  it('is true when they genuinely differ', () => {
    expect(panMismatchesGstin('ZZZZZ0000Z', VALID_GSTIN)).toBe(true);
  });
});

describe('the GST state list — §10 / EC-4', () => {
  it('carries a Hindi name for every state, not a copy of the English one', () => {
    GST_STATES.forEach((state) => {
      expect(state.hi.length).toBeGreaterThan(0);
      expect(state.hi).not.toBe(state.en);
    });
  });

  it('accepts 97 (Other Territory) and does not list 99 (Centre)', () => {
    expect(GST_STATE_CODES).toContain('97');
    expect(GST_STATE_CODES).not.toContain('99');
  });

  it('resolves a name in the active locale and echoes an unknown code', () => {
    expect(stateName('27', 'en')).toBe('Maharashtra');
    expect(stateName('27', 'hi')).toBe('महाराष्ट्र');
    expect(stateName('99', 'en')).toBe('99');
    expect(stateName(null, 'en')).toBe('');
  });
});

describe('presetSummary — FR-7 (T-PLT-03-2)', () => {
  it.each(BUSINESS_TYPES)('describes %s exactly as the preset table does', (type) => {
    const summary = presetSummary(type, null);
    const config = BUSINESS_TYPE_CONFIG[type];

    expect(summary.inventoryEnabled).toBe(config.inventoryEnabled);
    expect(summary.defaultDueDays).toBe(config.defaultDueDays);
    expect(summary.favouriteUnits).toEqual(config.favouriteUnits);
    expect(summary.modules).toContain('ledger');
    expect(summary.modules).toContain('parties');
    expect(summary.inventoryUnavailable).toBe(false);
  });

  it('gives services and professionals no stock module (FR-7)', () => {
    expect(presetSummary('services', null).modules).not.toContain('inventory');
    expect(presetSummary('professional', null).modules).not.toContain('inventory');
  });

  it('uses the documented due-day buckets', () => {
    expect(presetSummary('retail', null).defaultDueDays).toBe(7);
    expect(presetSummary('food', null).defaultDueDays).toBe(7);
    expect(presetSummary('wholesale', null).defaultDueDays).toBe(15);
    expect(presetSummary('professional', null).defaultDueDays).toBe(30);
  });

  it('says "not available in your plan" when the partner has no inventory (EC-6)', () => {
    const summary = presetSummary('retail', ['ledger', 'parties', 'sales']);
    expect(summary.inventoryEnabled).toBe(false);
    expect(summary.inventoryUnavailable).toBe(true);
    expect(summary.modules).not.toContain('inventory');
  });

  it('does not claim a module the plan withholds', () => {
    const summary = presetSummary('retail', ['ledger']);
    expect(summary.modules).toEqual(['ledger']);
  });
});

describe('presetSummary — only what is built is shown (UAT D8)', () => {
  it('lists the modules a merchant can open today, and nothing unbuilt', () => {
    /* Prevents UAT D8: step 4's "What you get" listed every module the preset
       enables — Stock, Bills & estimates, Purchases, Payments, Expenses — on a
       product that had built none of them. `modules` is still
       what the preset turns on; `readyModules` is what the card may show. */
    const summary = presetSummary('retail', null);
    expect(summary.modules).toContain('inventory');
    expect(summary.readyModules).toEqual(['parties', 'ledger']);
  });

  it('still drops a built module the plan withholds', () => {
    expect(presetSummary('retail', ['ledger']).readyModules).toEqual(['ledger']);
  });
});

describe('resume — FR-9', () => {
  it('opens at the step after the one the server says is complete', () => {
    expect(resumeStep(0)).toBe(1);
    expect(resumeStep(1)).toBe(2);
    expect(resumeStep(2)).toBe(3);
    expect(resumeStep(3)).toBe(4);
  });

  it('never proposes a fifth step', () => {
    expect(resumeStep(4)).toBe(4);
    expect(resumeStep(99)).toBe(4);
  });

  it('treats a missing value as nothing completed', () => {
    expect(resumeStep(null)).toBe(1);
    expect(isOnboardingComplete(null)).toBe(false);
    expect(isOnboardingComplete(4)).toBe(true);
  });
});

/**
 * Defect NEW-1 — which wizards read their business back after a reload.
 *
 * Too narrow and a reload shows step 1 blank for a business that exists, which
 * is how the duplicate was made. Too wide and "Add a business" opens with the
 * merchant's LIVE shop in step 1, and Continue renames it.
 */
describe('shouldResumeFromServer — NEW-1', () => {
  it('resumes the owner of a business the wizard created and did not finish', () => {
    expect(shouldResumeFromServer({ role: 'owner', onboardingStep: 1 })).toBe(true);
    expect(shouldResumeFromServer({ role: 'owner', onboardingStep: 3 })).toBe(true);
  });

  it('does not resume a finished business — "Add a business" starts empty', () => {
    expect(shouldResumeFromServer({ role: 'owner', onboardingStep: 4 })).toBe(false);
  });

  it('does not resume for a non-owner, who cannot write the tenant anyway', () => {
    for (const role of ['admin', 'staff', 'accountant', null]) {
      expect(shouldResumeFromServer({ role, onboardingStep: 1 })).toBe(false);
    }
  });

  it('does not resume without a business, or one the wizard never started', () => {
    expect(shouldResumeFromServer(null)).toBe(false);
    expect(shouldResumeFromServer({ role: 'owner', onboardingStep: 0 })).toBe(false);
    expect(shouldResumeFromServer({ role: 'owner', onboardingStep: null })).toBe(false);
  });
});
