import { relativeTimeView } from './relativeTime';

/**
 * NTF-01 §8 — the inbox's and the reminder strip's "when". What these protect:
 * a fast phone clock reading "in 2 minutes" (EC-8), and a week-old row still
 * saying "12 days ago" instead of the date a merchant can check a bill against.
 */
const NOW = Date.parse('2026-09-24T12:00:00Z');

describe('relativeTimeView', () => {
  it('steps from just now to minutes, hours and days', () => {
    expect(relativeTimeView('2026-09-24T11:59:30Z', NOW).id).toBe('notifications.time.justNow');
    expect(relativeTimeView('2026-09-24T11:55:00Z', NOW)).toEqual({
      id: 'notifications.time.minutes',
      values: { count: 5 },
    });
    expect(relativeTimeView('2026-09-24T09:00:00Z', NOW)).toEqual({
      id: 'notifications.time.hours',
      values: { count: 3 },
    });
    expect(relativeTimeView('2026-09-22T12:00:00Z', NOW)).toEqual({
      id: 'notifications.time.days',
      values: { count: 2 },
    });
  });

  it('prints dd/mm/yyyy from a week on', () => {
    const view = relativeTimeView('2026-09-10T12:00:00Z', NOW);
    expect(view.id).toBe('notifications.time.date');
    expect(view.values.date).toMatch(/^\d{2}\/09\/2026$/);
  });

  it('clamps a future timestamp to "just now", and survives garbage', () => {
    expect(relativeTimeView('2026-09-24T12:05:00Z', NOW).id).toBe('notifications.time.justNow');
    expect(relativeTimeView('not a date', NOW).id).toBe('notifications.time.justNow');
  });
});
