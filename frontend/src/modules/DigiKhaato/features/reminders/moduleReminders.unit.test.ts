import { api } from 'src/api/AxiosInstances';

import {
  listModuleReminders,
  previewSourceReminder,
  sendSourceReminder,
} from './api/moduleReminderService';
import { getReminderSettings, updateReminderSettings } from './api/reminderService';
import { registerReminderTab, reminderTabsFor, resetReminderTabsForTests } from './moduleTabs';
import {
  halfHoursBetween,
  MODULE_BUCKET_LABEL,
  MODULE_BUCKETS,
  nextAllowedLabel,
  reminderTabLabel,
} from './view-model/moduleReminderDisplay';

/**
 * A7 (PLT-X06 §6-§8) — the pieces under the module reminder tab: the tab
 * registry (ADR-042 rules), the words (a missing vertical catalogue never
 * prints an id), the half-hour options (never wider than the module's window)
 * and the wire mapping (the client names a record, nothing else).
 */
afterEach(() => {
  jest.restoreAllMocks();
  resetReminderTabsForTests();
});

describe('registerReminderTab', () => {
  it('lists only enabled modules, by order then code', () => {
    registerReminderTab('library', { labelId: 'library.reminders.tab', order: 20 });
    registerReminderTab('lending', { labelId: 'lending.reminders.tab', order: 10 });
    registerReminderTab('gym', { labelId: 'gym.reminders.tab', order: 20 });

    expect(reminderTabsFor(['lending', 'gym', 'library']).map((tab) => tab.module)).toEqual([
      'lending',
      'gym',
      'library',
    ]);
    expect(reminderTabsFor(['parties', 'ledger'])).toEqual([]);
  });

  it('is idempotent for an equal entry and refuses a different one', () => {
    registerReminderTab('lending', { labelId: 'lending.reminders.tab', order: 10 });
    expect(() =>
      registerReminderTab('lending', { labelId: 'lending.reminders.tab', order: 10 })
    ).not.toThrow();
    expect(() => registerReminderTab('lending', { labelId: 'other', order: 10 })).toThrow(
      /registered twice/
    );
    expect(() => registerReminderTab('Lending!', { labelId: 'x', order: 1 })).toThrow(
      /not a module code/
    );
  });
});

describe('module reminder words', () => {
  const messages: Record<string, string> = {
    'lending.reminders.tab': 'Loans',
    'nav.module.library': 'Library',
    'reminders.module.tabFallback': 'Feature',
    'reminders.module.next': 'Next: {when}',
  };
  const t = (id: string, values?: Record<string, string | number | Date>): string =>
    (messages[id] ?? id).replace('{when}', String(values?.when ?? ''));

  it("name a tab by the module's word, else its nav name, else a plain word", () => {
    expect(reminderTabLabel(t, 'lending', 'lending.reminders.tab')).toBe('Loans');
    expect(reminderTabLabel(t, 'library', 'library.reminders.tab')).toBe('Library');
    expect(reminderTabLabel(t, 'gym', 'gym.reminders.tab')).toBe('Feature');
  });

  it("format the server's next moment in the tenant's zone", () => {
    const d = (value: string | Date, options?: Intl.DateTimeFormatOptions): string =>
      new Intl.DateTimeFormat('en-IN', options).format(new Date(value));
    // 02:30 UTC is 08:00 in Kolkata; a browser in another zone must not move it.
    expect(nextAllowedLabel(t, d, '2026-10-13T02:30:00Z', 'Asia/Kolkata')).toBe(
      'Next: 13/10/2026, 8:00 am'
    );
  });

  it('label every bucket, oldest trouble first', () => {
    expect(MODULE_BUCKETS[0]).toBe('overdue_older');
    expect(MODULE_BUCKETS.every((bucket) => MODULE_BUCKET_LABEL[bucket])).toBe(true);
  });

  it('offer half hours inside the window only', () => {
    expect(halfHoursBetween('08:00', '10:00')).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
    ]);
    expect(halfHoursBetween('18:30', '19:00')).toEqual(['18:30', '19:00']);
  });
});

describe('moduleReminderService', () => {
  it('lists a module with one page of up to 100 and maps the rows', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: [
          {
            party: { id: 'p1', name: 'Rahul' },
            recipient: null,
            source_type: 'lending_instalment',
            source_id: 's1',
            subject_label: 'Instalment 4',
            due_on: '2026-10-12',
            amount: null,
            bucket: 'notice',
            allowed: false,
            next_allowed_at: '2026-10-13T08:00:00+05:30',
          },
        ],
      },
    });

    const rows = await listModuleReminders('lending');

    expect(get.mock.calls[0]?.[0]).toBe('/reminders/due?module=lending&page_size=100');
    expect(rows[0]).toEqual({
      party: { id: 'p1', name: 'Rahul' },
      recipient: null,
      sourceType: 'lending_instalment',
      sourceId: 's1',
      subjectLabel: 'Instalment 4',
      dueOn: '2026-10-12',
      amount: null,
      bucket: 'notice',
      allowed: false,
      nextAllowedAt: '2026-10-13T08:00:00+05:30',
    });
  });

  it('previews by naming the record only', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({
      data: {
        data: {
          source_id: 's1',
          text: 'Hello',
          sms_text: 'Hi',
          mobile: '+919812345678',
          recipient: { id: 'p2', name: 'Mohan' },
          subject_label: 'Instalment 4',
          fixed_text: true,
          allowed: true,
          next_allowed_at: null,
        },
      },
    });

    const preview = await previewSourceReminder({
      sourceType: 'lending_instalment',
      sourceId: 's1',
    });

    expect(post.mock.calls[0]?.[1]).toEqual({ source_type: 'lending_instalment', source_id: 's1' });
    expect(preview).toMatchObject({ smsText: 'Hi', fixedText: true, allowed: true });
  });

  it('records a tap as create-then-send, and stops if the create is refused', async () => {
    const post = jest
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { data: { id: 'r9' } } })
      .mockResolvedValueOnce({ data: {} });

    await sendSourceReminder({ sourceType: 'lending_instalment', sourceId: 's1' }, 'call');

    expect(post.mock.calls.map((call) => call[0])).toEqual(['/reminders', '/reminders/r9/send']);
    expect(post.mock.calls[0]?.[1]).toEqual({
      source_type: 'lending_instalment',
      source_id: 's1',
      channel: 'call',
    });

    post.mockReset();
    post.mockRejectedValueOnce(new Error('409'));
    await expect(
      sendSourceReminder({ sourceType: 'lending_instalment', sourceId: 's1' }, 'call')
    ).rejects.toThrow('409');
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('reminder settings windows', () => {
  const WIRE = { auto_sms: false, party_sms_on_entry: false, sms_configured: false };

  it('are absent for a shop, and mapped when a module has hours', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce({ data: { data: WIRE } });
    expect(await getReminderSettings()).not.toHaveProperty('windows');

    jest.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        data: {
          ...WIRE,
          windows: {
            lending: { start: '09:00', end: '18:00', policy_start: '08:00', policy_end: '19:00' },
          },
        },
      },
    });
    expect((await getReminderSettings()).windows).toEqual({
      lending: { start: '09:00', end: '18:00', policyStart: '08:00', policyEnd: '19:00' },
    });
  });

  it('send only the windows that were changed', async () => {
    const patch = jest.spyOn(api, 'patch').mockResolvedValue({ data: { data: WIRE } });
    await updateReminderSettings({ windows: { lending: ['09:00', '18:00'] } });
    expect(patch.mock.calls[0]?.[1]).toEqual({ windows: { lending: ['09:00', '18:00'] } });
  });
});
