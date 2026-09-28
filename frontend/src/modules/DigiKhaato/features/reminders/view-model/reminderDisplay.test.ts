import { createIntl } from 'react-intl';

import { en } from 'src/tests/allMessages';

import {
  REMINDER_TABS,
  STATUS_TONE,
  bucketFigure,
  channelLabelId,
  collectionCaption,
  kindLabelId,
  noteView,
  skipReasonId,
  statusLabelId,
} from './reminderDisplay';

/**
 * LED-05/06/07's words as decisions. Each assertion names the sentence a
 * merchant would otherwise read wrong.
 */
const messages = en as Record<string, string>;
const intl = createIntl({ locale: 'en', messages });

describe('collectionCaption', () => {
  it('counts days in the TENANT’s calendar, from ISO strings', () => {
    /* Prevents: "Overdue 0 days" / "Due in -1 days" from a device clock in
       another timezone — the caption is computed on the business day the
       server bucketed with. */
    expect(collectionCaption('2026-09-24', '2026-09-24')).toEqual({
      id: 'reminders.due.today',
      values: {},
    });
    expect(collectionCaption('2026-09-21', '2026-09-24')).toEqual({
      id: 'reminders.due.overdue',
      values: { count: 3 },
    });
    expect(collectionCaption('2026-09-25', '2026-09-24')).toEqual({
      id: 'reminders.due.inDays',
      values: { count: 1 },
    });
    expect(collectionCaption(null, '2026-09-24')).toBeNull();
  });

  it('reads as a merchant would say it', () => {
    const tomorrow = collectionCaption('2026-09-25', '2026-09-24');
    expect(intl.formatMessage({ id: tomorrow?.id ?? '' }, tomorrow?.values)).toBe('Due tomorrow');
    const late = collectionCaption('2026-09-23', '2026-09-24');
    expect(intl.formatMessage({ id: late?.id ?? '' }, late?.values)).toBe('Overdue 1 day');
  });
});

describe('noteView', () => {
  it('translates the server’s fixed notes and shows a merchant’s own words as typed', () => {
    /* Prevents: the history showing the English phrase "provider not
       configured" to a Hindi merchant, or translating a note a merchant wrote. */
    expect(noteView('provider not configured')).toEqual({
      id: 'reminders.note.providerMissing',
      text: '',
    });
    expect(noteView('balance settled').id).toBe('reminders.note.settled');
    expect(noteView('Will pay after Diwali')).toEqual({ id: null, text: 'Will pay after Diwali' });
  });
});

describe('every label the screen can ask for exists', () => {
  it('has a message for each status, kind, channel, tab and skip reason', () => {
    /* Prevents: a raw id like "reminders.status.cancelled" on screen — the
       statement's "ledger.entry.type.manual_got" defect, here. */
    const ids = [
      ...(['scheduled', 'sent', 'failed', 'done', 'dismissed', 'cancelled'] as const).map(
        statusLabelId
      ),
      ...(['manual', 'auto_d1', 'auto_d0', 'recurring'] as const).map(kindLabelId),
      ...(['whatsapp_manual', 'sms_manual', 'sms', 'whatsapp_api', 'call', 'in_app'] as const).map(
        channelLabelId
      ),
      ...(['not_found', 'archived', 'nothing_due', 'no_mobile', 'opted_out'] as const).map(
        skipReasonId
      ),
      ...REMINDER_TABS.map((tab) => `reminders.tab.${tab}`),
      ...REMINDER_TABS.map((tab) => `reminders.empty.${tab}.title`),
    ];
    expect(ids.filter((id) => !(id in messages))).toEqual([]);
  });

  it('paints only a failure as an error', () => {
    expect(STATUS_TONE.failed).toBe('error');
    expect(Object.entries(STATUS_TONE).filter(([, tone]) => tone === 'error')).toHaveLength(1);
  });
});

describe('bucketFigure', () => {
  it('maps the tabs onto the summary’s three buckets', () => {
    const summary = {
      dueToday: { count: 2, amount: '5000.00' },
      overdue: { count: 1, amount: '1200.00' },
      upcoming: { count: 4, amount: '150.00' },
      asOf: '2026-09-24',
    };
    expect(bucketFigure(summary, 'today')).toEqual({ count: 2, amount: '5000.00' });
    expect(bucketFigure(summary, 'overdue')?.count).toBe(1);
    expect(bucketFigure(summary, 'upcoming')?.count).toBe(4);
    expect(bucketFigure(null, 'today')).toBeNull();
  });
});
