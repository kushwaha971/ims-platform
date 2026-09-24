import { secondsText, supportAction, toTenantPatch } from './adminDisplay';

import type { TenantEditFormValues } from '../validation/adminSchemas';

/** PLT-14 — the pure half of the console. */
describe('adminDisplay', () => {
  const initial: TenantEditFormValues = {
    planId: 'p-free',
    status: 'active',
    maxUsers: '',
    storageMb: '500',
    reason: '',
  };

  it('sends only what changed, so each real change is one audit row', () => {
    // An untouched plan must never be "changed" to itself in the tenant's log.
    expect(toTenantPatch({ ...initial, reason: ' Unblock staff ' }, initial)).toEqual({
      reason: 'Unblock staff',
    });
    expect(toTenantPatch({ ...initial, maxUsers: '12', reason: 'More seats' }, initial)).toEqual({
      reason: 'More seats',
      overrides: { maxUsers: 12, storageMb: 500 },
    });
    expect(
      toTenantPatch({ ...initial, planId: 'p-pro', status: 'suspended', reason: 'Abuse' }, initial)
    ).toEqual({ reason: 'Abuse', planId: 'p-pro', status: 'suspended' });
  });

  it('clears an override when its box is emptied (back to the plan)', () => {
    expect(
      toTenantPatch({ ...initial, storageMb: '', reason: 'Reset' }, initial).overrides
    ).toEqual({
      maxUsers: null,
      storageMb: null,
    });
  });

  it('offers ask → waiting → enter, and never "enter" without a granted consent', () => {
    const base = {
      id: 'a1',
      reason: 'x',
      requestedBy: null,
      requestedAt: '2026-09-24T10:00:00Z',
      decidedBy: null,
      decidedAt: null,
      expiresAt: null,
      activeSessionEndsAt: null,
    };
    expect(supportAction(null)).toBe('request');
    expect(supportAction({ ...base, status: 'requested' })).toBe('waiting');
    expect(supportAction({ ...base, status: 'granted' })).toBe('enter');
    expect(supportAction({ ...base, status: 'denied' })).toBe('request');
    expect(supportAction({ ...base, status: 'expired' })).toBe('request');
  });

  it('reads a scheduler lag in the unit a person would say', () => {
    expect(secondsText(null)).toBe('—');
    expect(secondsText(45)).toBe('45 s');
    expect(secondsText(600)).toBe('10 min');
  });
});
