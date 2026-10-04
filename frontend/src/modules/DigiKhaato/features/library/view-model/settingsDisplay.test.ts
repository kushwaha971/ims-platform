import { fromSettingsForm, parseReminderDays, toSettingsForm } from './settingsDisplay';

import type { LibrarySettings } from '../types/settings.types';

const ROW: LibrarySettings = {
  version: 3,
  fineSkipClosedDays: true,
  fineRounding: 'rupee',
  overdueIssueRule: 'block',
  lostCountsTowardLimit: true,
  renewFrom: 'today',
  renewOverdue: 'charge_fine',
  holdPickupDays: 3,
  lostMultiplier: '1.00',
  lostProcessingFee: '0.00',
  lostFoundPaid: 'refund',
  fallbackPrice: null,
  damageMinorAmount: '20.00',
  damageMajorPercent: 50,
  waiverCeiling: null,
  overdueReminderDays: [1, 7, 14, 30],
  remindDayBefore: false,
};

describe('settingsDisplay', () => {
  it('sorts and de-duplicates reminder days, and refuses what BR-3 refuses', () => {
    expect(parseReminderDays('14, 1,7 7')).toEqual([1, 7, 14]);
    expect(parseReminderDays('')).toEqual([]);
    expect(parseReminderDays('0')).toBeNull();
    expect(parseReminderDays('366')).toBeNull();
    expect(parseReminderDays('1,2,3,4,5,6,7')).toBeNull();
    expect(parseReminderDays('1, a')).toBeNull();
  });

  it('round-trips the row, and an empty optional amount is null, never zero', () => {
    const form = toSettingsForm(ROW);
    expect(form.fallbackPrice).toBe('');
    expect(fromSettingsForm(form, ROW.version)).toEqual(ROW);
    expect(fromSettingsForm({ ...form, waiverCeiling: ' 50.00 ' }, 3).waiverCeiling).toBe('50.00');
    // QA-F02-1 — the resolver hands an empty optional amount over as null.
    const resolved = { ...form, fallbackPrice: null as unknown as string };
    expect(fromSettingsForm(resolved, 3).fallbackPrice).toBeNull();
  });
});
